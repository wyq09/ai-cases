#!/usr/bin/env python3
"""把 .splat 烘焙成 splat-portal 的紧凑格式。

输入：32 字节/点的 .splat（pos f32x3, scale f32x3, rgba u8x4, quat (u8-128)/128）
输出：assets/<name>.bin + assets/<name>.core.bin，以及 assets/manifest.json

归一化：以中位数为中心、80 分位半径为单位，把世界压到约 [-1,1]，
这样所有世界的相机与传送门参数可以共用一套。
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image
from scipy.spatial.transform import Rotation as R

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'assets')

MAGIC = 0x4B425053  # 'SPBK'
VERSION = 1
CORE = 60000
MAX_POINTS = 260000


def load_splat(path):
    raw = np.fromfile(path, dtype=np.uint8)
    n = len(raw) // 32
    a = raw[:n * 32].reshape(-1, 32)
    pos = a[:, 0:12].copy().view(np.float32)
    scl = a[:, 12:24].copy().view(np.float32)
    rgba = a[:, 24:28].copy()
    quat = (a[:, 28:32].astype(np.float32) - 128.0) / 128.0
    return pos, scl, rgba, quat


def render_score(pos, scl, rgba, quat, eye, target, fov=50, W=160, H=120):
    """粗糙但足够选机位：返回覆盖率与细节分数。"""
    fw = target - eye
    fw = fw / np.linalg.norm(fw)
    s = np.cross(fw, np.array([0, 1, 0], np.float32))
    if np.linalg.norm(s) < 1e-5:
        s = np.array([1, 0, 0], np.float32)
    s = s / np.linalg.norm(s)
    u = np.cross(s, fw)
    V = np.stack([s, u, -fw], 0).astype(np.float32)

    P = (pos - eye) @ V.T
    z = -P[:, 2]
    ok = z > 0.02
    if ok.sum() < 100:
        return 0.0, 0.0
    P, Sc, C, Q, Z = P[ok], scl[ok], rgba[ok], quat[ok], z[ok]
    f = (H * 0.5) / math.tan(math.radians(fov) / 2)
    uu = P[:, 0] / Z * f + W / 2
    vv = -P[:, 1] / Z * f + H / 2
    rot = R.from_quat(np.concatenate([Q[:, 1:], Q[:, :1]], 1)).as_matrix()
    rad = np.zeros(len(P), np.float32)
    for k in range(3):
        ax = rot[:, :, k] * Sc[:, k][:, None]
        rad = np.maximum(rad, np.maximum(np.abs(ax @ s), np.abs(ax @ u)))
    r = np.clip(rad * f / Z, 0.6, 60)
    inside = (uu > -r) & (uu < W + r) & (vv > -r) & (vv < H + r)
    cover = float(inside.mean())
    # 细节：权重用颜色方差近似，避免大块纯色胜出
    w = np.clip(r, 0, 20)
    mean = (C[:, :3].astype(np.float32) * w[:, None]).sum(0) / max(w.sum(), 1e-6)
    var = (w[:, None] * (C[:, :3].astype(np.float32) - mean) ** 2).sum() / max(w.sum(), 1e-6)
    detail = float(np.sqrt(var.mean()) / 80.0)
    # 相机埋进几何体时，近处点会异常密集
    near = float((Z < 0.12).mean())
    return cover, detail, near


def pick_camera(pos, scl, rgba, quat):
    best = None
    for el in (-15, -5, 5, 15, 28, 40):
        for az in range(0, 360, 12):
            for dist in (0.85, 1.15, 1.5, 1.95, 2.5, 3.2):
                th, ph = math.radians(az), math.radians(el)
                eye = np.float32([
                    math.cos(th) * math.cos(ph) * dist,
                    math.sin(ph) * dist,
                    math.sin(th) * math.cos(ph) * dist,
                ])
                cov, det, near = render_score(pos, scl, rgba, quat, eye, np.zeros(3, np.float32))
                if cov < 0.30:
                    continue
                cov_score = math.exp(-((cov - 0.66) ** 2) / (2 * 0.16 ** 2))
                score = cov_score * (0.5 + det) * (1.0 - min(near * 6.0, 0.9))
                if best is None or score > best[0]:
                    best = (score, az, el, dist, cov, det)
    if best is None:
        return (0.0, 0.0, 0.0, 2.2, 0.0, 0.0)
    return best


def quantize(pos_n, scl_n, rgba, quat, center, pos_scale):
    n = len(pos_n)
    rec = np.zeros(n * 20, np.uint8)
    out = rec.reshape(n, 20)

    qpos = np.clip(np.round(pos_n / pos_scale), -32767, 32767).astype(np.int16)
    out[:, 0:6] = qpos.view(np.uint8)

    s = np.maximum(scl_n, 1e-8)
    logmin, logmax = -6.0, math.log(4.0)
    t = np.clip((np.log(s) - logmin) / (logmax - logmin), 0, 1)
    qs = np.round(t * 65535).astype(np.uint16)
    out[:, 6:12] = qs.view(np.uint8)

    q = np.clip(quat, -1, 1)
    q = q / np.maximum(np.linalg.norm(q, axis=1, keepdims=True), 1e-6)
    out[:, 12:16] = np.clip(np.round(q * 127), -127, 127).astype(np.int8).view(np.uint8)
    out[:, 16:20] = rgba
    return rec, (logmin, logmax)


def main():
    os.makedirs(ASSETS, exist_ok=True)
    manifest_path = os.path.join(ASSETS, 'manifest.json')
    manifest = {}
    if os.path.exists(manifest_path):
        manifest = json.load(open(manifest_path))

    specs = [(a.split('=')[0], a.split('=')[1]) for a in sys.argv[1:]]
    if not specs:
        print('usage: bake.py <name>=<path.splat> [...]')
        return

    for name, path in specs:
        pos, scl, rgba, quat = load_splat(path)
        keep = rgba[:, 3] >= 6
        pos, scl, rgba, quat = pos[keep], scl[keep], rgba[keep], quat[keep]
        total = len(pos)
        if total > MAX_POINTS:
            pos, scl, rgba, quat = pos[:MAX_POINTS], scl[:MAX_POINTS], rgba[:MAX_POINTS], quat[:MAX_POINTS]

        center = np.median(pos, 0).astype(np.float32)
        rel = pos - center
        dist = np.linalg.norm(rel, axis=1)
        unit = float(np.percentile(dist, 80))
        if unit <= 0:
            unit = 1.0
        pos_n = rel / unit
        scl_n = scl / unit

        # 归一化后按 (max-abs + 余量) 决定量化步长，保证 int16 放得下
        extent = np.max(np.abs(pos_n), axis=0) * 1.02 + 1e-4
        pos_scale = (extent / 32000.0).astype(np.float32)

        cam = pick_camera(pos_n, scl_n, rgba, quat)
        score, az, el, dist_cam, cov, det = cam

        def write(fn, n):
            p, s, c, q = pos_n[:n], scl_n[:n], rgba[:n], quat[:n]
            rec, (logmin, logmax) = quantize(p, s, c, q, center, pos_scale)
            header = np.zeros(20, np.uint8)
            header[0:4] = np.array([MAGIC], np.uint32).view(np.uint8)
            header[4:8] = np.array([VERSION], np.uint32).view(np.uint8)
            header[8:12] = np.array([n], np.uint32).view(np.uint8)
            header[12:16] = np.array([0], np.uint32).view(np.uint8)
            with open(fn, 'wb') as f:
                f.write(header.tobytes())
                f.write(rec.tobytes())
            return n

        core_n = min(CORE, len(pos_n))
        full_fn = os.path.join(ASSETS, name + '.bin')
        core_fn = os.path.join(ASSETS, name + '.core.bin')
        n_full = write(full_fn, len(pos_n))
        n_core = write(core_fn, core_n)

        manifest[name] = {
            'count': int(n_full),
            'core': int(n_core),
            'camera': {'azimuth': float(az), 'elevation': float(el), 'distance': float(dist_cam)},
            'unit': unit,
            'posScale': [float(v) for v in pos_scale],
            'logScale': [float(-6.0), float(math.log(4.0))],
            'bytes': int(os.path.getsize(full_fn)),
            'coreBytes': int(os.path.getsize(core_fn)),
        }
        print(f'[ok] {name:16s} src={total:8d} full={n_full:7d} core={n_core:6d} '
              f'unit={unit:.3f} cam(az={az} el={el}) score={score:.3f} cov={cov:.2f} detail={det:.2f} '
              f'{os.path.getsize(full_fn)/1e6:.2f}MB')

    json.dump(manifest, open(manifest_path, 'w'), indent=1, sort_keys=True)
    print('[done]', manifest_path)


if __name__ == '__main__':
    main()
