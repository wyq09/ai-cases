/*
 * 沉降后残余悬空量测：对重建后的 env_notrees.glb 里剩余 B_* 建筑重算 ringGap。
 * 此时建筑已按 dropFor 下沉，ringGap 读数即"裙墙遮不住的残余悬空"（裙墙深 8m）。
 * 用法：node --max-old-space-size=8192 measure_residual.mjs
 */
import { NodeIO } from '@gltf-transform/core';
import { loadTerrain } from './terrain_util.mjs';

const io = new NodeIO();
const doc = await io.read(new URL('../assets/env_notrees.glb', import.meta.url).pathname);
const ringGap = loadTerrain(new URL('../assets/meta.json', import.meta.url));

const bNodes = doc.getRoot().listScenes()[0].listChildren().filter((n) => /^B_/.test(n.getName() || ''));
const rows = [];
let nullGap = 0;
for (const node of bNodes) {
  const g = ringGap(node);
  if (g === null) { nullGap++; continue; }
  rows.push({ name: node.getName(), gap: g });
}
rows.sort((a, b) => b.gap - a.gap);
const n = rows.length;
const c03 = rows.filter((r) => r.gap > 0.3).length;
const c05 = rows.filter((r) => r.gap > 0.5).length;
const c10 = rows.filter((r) => r.gap > 1.0).length;
console.log(`B_ buildings: ${bNodes.length}, measured ${n} (nullGap ${nullGap})`);
console.log(`residual >0.3m: ${c03}, >0.5m: ${c05}, >1.0m: ${c10}`);
console.log('top 12 residuals:');
for (const r of rows.slice(0, 12)) console.log(`  ${r.gap.toFixed(2)}m  ${r.name}`);
// 也可用 --dump 输出全部到 CSV
if (process.argv.includes('--dump')) {
  const fs = await import('node:fs');
  const csv = rows.map((r) => `${r.gap.toFixed(3)},${r.name}`).join('\n');
  fs.writeFileSync(new URL('./residual.csv', import.meta.url), 'residual_m,name\n' + csv + '\n');
  console.log('residual.csv written');
}
