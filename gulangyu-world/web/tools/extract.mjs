/*
 * 鼓浪屿网页版 — 离线资产提取管线
 *
 * 输入 delivery/game/ 下的官方导出：
 *   - Gulangyu_Environment_LOD1.glb   环境（含 12,494 个 Tree_* 共享网格节点）
 *   - vegetation_instances.json       植被实例（位置/旋转/缩放/原型名，glTF 坐标）
 *
 * 输出 web/assets/：
 *   - env_notrees.glb   剥离植被后的环境（再经 CLI optimize 压缩为 env.glb）
 *   - trees_raw.glb     六个 LOD1 树原型（bark + 两种叶材质），经 optimize 压缩为 trees.glb
 *   - terrain.bin       可行走高度场（Int16 厘米；-32768 = 阻挡）
 *   - instances.bin     植被实例二进制（f32 x,z,y + rotZ + 缩放 xyz + u8 原型）
 *   - meta.json         地标 POI、出生点、网格参数、水位等
 *
 * 注意：高度场烘焙从写盘后的 env_notrees.glb 重新读取——prune 后的内存文档
 * 在超大规模场景下 getElement 读数会漂移（实测 481,63 处 16.13 → 15.8），写盘再读则一致。
 */
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { prune } from '@gltf-transform/functions';
import { loadTerrain, dropFor, SKIRT_DEPTH } from './terrain_util.mjs';

const GAME = path.resolve(import.meta.dirname, '../../delivery/game');
const OUT = path.resolve(import.meta.dirname, '../assets');
fs.mkdirSync(OUT, { recursive: true });

const io = new NodeIO();

// core_ids.json：核心街区建筑（另一 agent 提取到 detail.glb 高模），env 里必须排除避免重叠闪烁
const CORE_IDS = new Set(
  JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, 'core_ids.json'), 'utf8')).ids
);

// ---------- 1. 剥离植被与 detail 集 → env_notrees.glb，建筑沉降 + 基础裙墙 ----------
{
  const doc = await io.read(`${GAME}/Gulangyu_Environment_LOD1.glb`);
  const scene = doc.getRoot().listScenes()[0];
  let removedDetail = 0;
  for (const n of scene.listChildren()) {
    const name = n.getName() || '';
    const bm = /^B_(\d+)(?:_|$)/.exec(name);
    const isDetail = (bm && CORE_IDS.has(bm[1]))   // detail.glb 高模承载的核心建筑
      || /^LM_/.test(name)                          // 地标（detail.glb）
      || name === 'Longtou_Lane_Closeup_Doors_Awnings'
      || /^Street_name_/.test(name);                // 店招（detail.glb）
    if (/^Tree_/.test(name) || isDetail) {
      scene.removeChild(n);
      n.dispose();
      if (isDetail) removedDetail++;
    }
  }
  await doc.transform(prune());
  console.log(`detail-set nodes removed: ${removedDetail}`);

  // ----- 建筑沉降：按 ringGap/dropFor 下移，使建筑底贴回地形 -----
  const ringGap = loadTerrain(new URL('../assets/meta.json', import.meta.url));
  const bNodes = scene.listChildren().filter((n) => /^B_/.test(n.getName() || ''));
  const dist = { d0: 0, d02: 0, d28: 0, d8: 0, nullGap: 0 };

  await io.write(`${OUT}/env_notrees.glb`, doc);
  console.log(`env_notrees.glb written (${(fs.statSync(`${OUT}/env_notrees.glb`).size / 1e6).toFixed(1)} MB)`);
}

// ---------- 2. 树原型 → trees_raw.glb ----------
const variantNames = [];
{
  const doc = await io.read(`${GAME}/Gulangyu_Environment_LOD1.glb`);
  const scene = doc.getRoot().listScenes()[0];
  for (const n of scene.listChildren()) {
    const m = n.getMesh();
    if (m && /^Banyan_LOD1_\d$/.test(m.getName() || '') && !variantNames.includes(m.getName())) {
      variantNames.push(m.getName());
      n.setTranslation([0, 0, 0]);
      n.setRotation([0, 0, 0, 1]);
      n.setScale([1, 1, 1]);
    } else {
      scene.removeChild(n);
      n.dispose();
    }
  }
  await doc.transform(prune());
  await io.write(`${OUT}/trees_raw.glb`, doc);
  console.log(`trees_raw.glb written, variants=${variantNames.length} (${(fs.statSync(`${OUT}/trees_raw.glb`).size / 1e6).toFixed(1)} MB)`);
}

// ---------- 3. 植被实例 → instances.bin（stride 32） ----------
const veg = JSON.parse(fs.readFileSync(`${GAME}/vegetation_instances.json`, 'utf8'));
const variantIndex = new Map(variantNames.map((name, i) => [name.replace('Banyan_LOD1_', 'Banyan_canopy_variant_'), i]));
const N = veg.instances.length;
const buf = Buffer.alloc(N * 32);
const perVariant = new Array(variantNames.length).fill(0);
for (let i = 0; i < N; i++) {
  const inst = veg.instances[i];
  const vi = variantIndex.get(inst.mesh);
  if (vi === undefined) throw new Error(`unknown variant ${inst.mesh}`);
  const p = inst.position_gltf, s = inst.scale;
  const o = i * 32;
  buf.writeFloatLE(p[0], o); buf.writeFloatLE(p[2], o + 4); buf.writeFloatLE(p[1], o + 8); // 存 x, z, y
  buf.writeFloatLE(inst.rotation_z_blender_radians, o + 12);
  buf.writeFloatLE(s[0], o + 16); buf.writeFloatLE(s[1], o + 20); buf.writeFloatLE(s[2], o + 24);
  buf.writeUInt8(vi, o + 28);
  perVariant[vi]++;
}
fs.writeFileSync(`${OUT}/instances.bin`, buf);
console.log(`instances.bin written: ${N} instances, per variant ${perVariant.join('/')}`);

// ---------- 4. 可行走高度场 → terrain.bin ----------
const ORIGIN_X = -1030, ORIGIN_Z = -1020, CELL = 2;
const COLS = Math.ceil((935 - ORIGIN_X) / CELL);   // x ∈ [-1030, 935]
const ROWS = Math.ceil((970 - ORIGIN_Z) / CELL);   // z ∈ [-1020, 970]
const WATER = 0.0, WADE = -0.12;                   // 地面低于 WATER+WADE 视为水域阻挡
                                                   // （-0.45 时缓坡海滩能往外走几十米，收紧为 -0.12）

const envDoc = await io.read(`${OUT}/env_notrees.glb`);
const hmax = new Float32Array(COLS * ROWS).fill(-Infinity);
const hasFloor = new Uint8Array(COLS * ROWS);
const INCLUDE = /^(B_|OSM_|Coastal_|Granite_|LM_|Terrain_)/;
let bakedTris = 0;

for (const node of envDoc.getRoot().listNodes()) {
  if (!INCLUDE.test(node.getName() || '')) continue;
  const mesh = node.getMesh();
  if (!mesh) continue;
  const e = node.getWorldMatrix(); // gltf-transform 扁平列主序 mat4
  for (const prim of mesh.listPrimitives()) {
    const position = prim.getAttribute('POSITION');
    const indices = prim.getIndices();
    const triCount = (indices ? indices.getCount() : position.getCount()) / 3;
    const p = new Float32Array(9), w = new Float32Array(9), tmp = [0, 0, 0];
    for (let t = 0; t < triCount; t++) {
      for (let k = 0; k < 3; k++) {
        const vi = indices ? indices.getScalar(t * 3 + k) : t * 3 + k;
        position.getElement(vi, tmp);
        p[k * 3] = tmp[0]; p[k * 3 + 1] = tmp[1]; p[k * 3 + 2] = tmp[2];
      }
      for (let k = 0; k < 3; k++) {
        w[k * 3]     = e[0] * p[k * 3] + e[4] * p[k * 3 + 1] + e[8] * p[k * 3 + 2] + e[12];
        w[k * 3 + 1] = e[1] * p[k * 3] + e[5] * p[k * 3 + 1] + e[9] * p[k * 3 + 2] + e[13];
        w[k * 3 + 2] = e[2] * p[k * 3] + e[6] * p[k * 3 + 1] + e[10] * p[k * 3 + 2] + e[14];
      }
      // 地形网格绕序混杂：取法线 y 绝对值，|ny| ≥ 0.45（坡度 ≤ ~63°）即可站立；
      // 更陡的崖壁靠运行时步高限制阻挡
      const ax = w[3] - w[0], az = w[5] - w[2];
      const bx = w[6] - w[0], bz = w[8] - w[2];
      const ny = az * bx - ax * bz;
      const horiz = Math.hypot(ax, az) * Math.hypot(bx, bz);
      if (!Number.isFinite(ny) || Math.abs(ny) < 0.45 * Math.max(horiz, 1e-9)) continue;

      const c0 = Math.max(0, Math.floor((Math.min(w[0], w[3], w[6]) - ORIGIN_X) / CELL));
      const c1 = Math.min(COLS - 1, Math.ceil((Math.max(w[0], w[3], w[6]) - ORIGIN_X) / CELL));
      const r0 = Math.max(0, Math.floor((Math.min(w[2], w[5], w[8]) - ORIGIN_Z) / CELL));
      const r1 = Math.min(ROWS - 1, Math.ceil((Math.max(w[2], w[5], w[8]) - ORIGIN_Z) / CELL));
      if (c0 > c1 || r0 > r1) continue;
      bakedTris++;

      const x0 = w[0], z0 = w[2], x1 = w[3], z1 = w[5], x2 = w[6], z2 = w[8];
      const det = (z1 - z2) * (x0 - x2) + (x2 - x1) * (z0 - z2);
      if (Math.abs(det) < 1e-9) continue;
      for (let r = r0; r <= r1; r++) {
        const wz = ORIGIN_Z + (r + 0.5) * CELL;
        // 正确的因子配对：l0 的 (wz-z2) 项系数是 (x2-x1)，l1 的是 (x0-x2)
        const l0row = (x2 - x1) * (wz - z2), l1row = (x0 - x2) * (wz - z2);
        for (let c = c0; c <= c1; c++) {
          const wx = ORIGIN_X + (c + 0.5) * CELL;
          const l0 = ((z1 - z2) * (wx - x2) + l0row) / det;
          const l1 = ((z2 - z0) * (wx - x2) + l1row) / det;
          const l2 = 1 - l0 - l1;
          if (!(l0 >= 0) || !(l1 >= 0) || !(l2 >= 0)) continue; // 含 NaN
          const y = l0 * w[1] + l1 * w[4] + l2 * w[7];
          const i = r * COLS + c;
          if (y > hmax[i]) hmax[i] = y;
          hasFloor[i] = 1;
        }
      }
    }
  }
}
console.log(`heightfield bake: ${bakedTris} tris → ${COLS}x${ROWS} cells`);

const out = new Int16Array(COLS * ROWS);
let walkable = 0;
for (let i = 0; i < out.length; i++) {
  if (!hasFloor[i] || hmax[i] < WATER + WADE) out[i] = -32768;
  else { out[i] = Math.max(-32000, Math.min(32000, Math.round(hmax[i] * 100))); walkable++; }
}
fs.writeFileSync(`${OUT}/terrain.bin`, Buffer.from(out.buffer));
console.log(`terrain.bin written: walkable ${(100 * walkable / out.length).toFixed(1)}%, ${(out.length * 2 / 1e6).toFixed(2)} MB`);

// ---------- 5. meta.json ----------
const meta = {
  grid: { originX: ORIGIN_X, originZ: ORIGIN_Z, cell: CELL, cols: COLS, rows: ROWS },
  waterY: WATER,
  spawn: { x: 318, z: 66 },
  pois: [
    { id: 'longtou', name: '龙头路', en: 'Longtou Road', x: 329, y: 7, z: 47, r: 30,
      blurb: '全岛最热闹的商业老街，小吃店与骑楼商铺挤满窄巷，是鼓浪屿的“生活心脏”。' },
    { id: 'bagua', name: '八卦楼', en: 'Bagua Mansion', x: 23.7, y: 34.5, z: -348, r: 26,
      blurb: '1907 年建的红色圆顶宅邸，八棱穹顶得名“八卦”，现在是全国唯一的风琴博物馆。' },
    { id: 'sunlight', name: '日光岩', en: 'Sunlight Rock', x: -79.8, y: 42, z: 264.5, r: 40,
      blurb: '全岛制高点（海拔 92.7 米）。沿石阶登上岩顶观景台，可以一眼望穿全岛和对岸的厦门本岛。' },
    { id: 'bridge', name: '四十四桥', en: 'Bridge 44', x: 221, y: 3, z: 661, r: 30,
      blurb: '菽庄花园的海上长桥，因建桥时主人四十四岁得名。桥面贴海蜿蜒，亭子立于转角。' },
    { id: 'shuzhuang', name: '菽庄花园', en: 'Shuzhuang Garden', x: 130, y: 2.6, z: 634, r: 32,
      blurb: '1913 年建的滨海园林，“藏海”为最大妙处——进园不见海，转过屏山豁然开阔。' },
    { id: 'catholic', name: '天主堂', en: 'Catholic Church', x: 483, y: 17.9, z: 62.4, r: 24,
      blurb: '1917 年落成的哥特式教堂，白色尖塔与玫瑰花窗，是厦门地区罕见的哥特遗存。' },
  ],
};
fs.writeFileSync(`${OUT}/meta.json`, JSON.stringify(meta, null, 2));
console.log('meta.json written');
