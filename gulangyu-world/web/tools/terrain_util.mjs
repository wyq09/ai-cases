/*
 * 共享地形工具：建筑沉降量计算（extract.mjs 与 extract_detail.mjs 必须使用同一实现，
 * 否则同一栋建筑在 env 与 detail 两个资产里高度会不一致）
 */
import fs from 'node:fs';

export function loadTerrain(metaUrl) {
  const meta = JSON.parse(fs.readFileSync(metaUrl, 'utf8'));
  const bin = fs.readFileSync(new URL('../assets/terrain.bin', metaUrl));
  const data = new Int16Array(bin.buffer, bin.byteOffset);
  const { cols, rows, originX, originZ, cell } = meta.grid;
  const at = (x, z) => {
    const c = Math.floor((x - originX) / cell), r = Math.floor((z - originZ) / cell);
    if (c < 0 || r < 0 || c >= cols || r >= rows) return -32768;
    return data[r * cols + c];
  };
  // 建筑底 vs 脚印外围地形最小高差（米）。外围半径 = 半对角 + 3m，避免采到自家屋顶格。
  // 返回 null 表示周边无地形数据（保持原位）。
  return function ringGap(node) {
    const e = node.getWorldMatrix();
    let minY = Infinity;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const prim of node.getMesh().listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      const mn = pos.getMin([]), mx = pos.getMax([]);
      if (!mn || !mx) continue;
      const wy0 = e[1] * mn[0] + e[5] * mn[1] + e[9] * mn[2] + e[13];
      const wy1 = e[1] * mx[0] + e[5] * mx[1] + e[9] * mx[2] + e[13];
      minY = Math.min(minY, wy0, wy1);
      const xs = [e[0] * mn[0] + e[4] * mn[1] + e[8] * mn[2] + e[12], e[0] * mx[0] + e[4] * mx[1] + e[8] * mx[2] + e[12]];
      const zs = [e[2] * mn[0] + e[6] * mn[1] + e[10] * mn[2] + e[14], e[2] * mx[0] + e[6] * mx[1] + e[10] * mx[2] + e[14]];
      minX = Math.min(minX, ...xs); maxX = Math.max(maxX, ...xs);
      minZ = Math.min(minZ, ...zs); maxZ = Math.max(maxZ, ...zs);
    }
    if (!Number.isFinite(minY)) return null;
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const rad = Math.hypot(maxX - minX, maxZ - minZ) / 2 + 3;
    let t = NaN;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const v = at(cx + Math.cos(a) * rad, cz + Math.sin(a) * rad);
      const m = v === -32768 ? NaN : v / 100;
      if (Number.isFinite(m)) t = Number.isFinite(t) ? Math.min(t, m) : m;
    }
    if (!Number.isFinite(t)) return null;
    return minY - t; // >0 = 悬空
  };
}

/*
 * 沉降规则：悬空 ≤8m 全额落地；>8m 只降 8m，剩余缝隙由 8m 裙墙遮住。
 * 返回节点应下沉的米数（≥0）。裙墙深度统一 8m。
 */
export function dropFor(gap) {
  if (gap === null || gap <= 0.15) return 0;
  return Math.min(gap, 8);
}
export const SKIRT_DEPTH = 8;
