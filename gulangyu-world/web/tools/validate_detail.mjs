/*
 * validate_detail.mjs — 校验压缩后的 detail.glb 并写 detail_meta.json
 *
 * 说明：CLI optimize（flatten+join+palette 默认开）会把同名/同材质节点合并，
 * detail.glb 里 B_ 与 LM_ 节点名大部分不再保留，而 detail_raw.glb 保留了完整节点名。
 * 两者场景内容一致（optimize 只合并不删内容），因此：
 *   - buildings / landmarks（内容计数）从 detail_raw.glb 按节点名统计
 *   - tris / bytes / mesh/primitive 断言从压缩后的 detail.glb 统计
 */
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, EXTTextureWebP, KHRMeshQuantization } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const OUT = path.resolve(import.meta.dirname, '../assets');
const coreIds = new Set(
  JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, 'core_ids.json'), 'utf8')).ids
);
const LANE = 'Longtou_Lane_Closeup_Doors_Awnings';

const isBuilding = (name) => {
  const m = /^B_(\d+)(?:$|_)/.exec(name || '');
  return !!(m && coreIds.has(m[1]));
};

// ---------- 1. 内容计数：detail_raw.glb（完整节点名） ----------
{
  let buildings = 0, landmarks = 0, streets = 0, lanes = 0;
  if (fs.existsSync(`${OUT}/detail_raw.glb`)) {
    const raw = await new NodeIO().read(`${OUT}/detail_raw.glb`);
    for (const node of raw.getRoot().listNodes()) {
      const name = node.getName() || '';
      if (isBuilding(name)) buildings++;
      else if (/^LM_/.test(name)) landmarks++;
      else if (/^Street_name_/.test(name)) streets++;
      else if (name === LANE) lanes++;
    }
    if (buildings !== coreIds.size) throw new Error(`assertion failed: raw buildings=${buildings}, expected ${coreIds.size}`);
    if (landmarks === 0) throw new Error('assertion failed: no LM_ landmarks in raw');
  } else {
    // detail_raw.glb 已按流程删除：沿用上一轮写入 detail_meta.json 的内容计数
    const prev = JSON.parse(fs.readFileSync(`${OUT}/detail_meta.json`, 'utf8'));
    buildings = prev.buildings;
    landmarks = prev.landmarks;
    console.log('detail_raw.glb not found, reusing content counts from detail_meta.json');
  }
  console.log(`raw content: buildings=${buildings} landmarks=${landmarks} streets=${streets} lane=${lanes}`);
  globalThis.__content = { buildings, landmarks };
}

// ---------- 2. 压缩产物断言：detail.glb（meshopt + webp + 量化） ----------
const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression, EXTTextureWebP, KHRMeshQuantization])
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
await MeshoptDecoder.ready;

console.time('read detail.glb');
const doc = await io.read(`${OUT}/detail.glb`);
console.timeEnd('read detail.glb');

const root = doc.getRoot();
const meshes = root.listMeshes();
let prims = 0, tris = 0;
for (const mesh of meshes) {
  for (const prim of mesh.listPrimitives()) {
    prims++;
    const pos = prim.getAttribute('POSITION');
    const idx = prim.getIndices();
    tris += (idx ? idx.getCount() : pos ? pos.getCount() : 0) / 3;
  }
}
if (!(meshes.length > 0 && prims > 0)) throw new Error(`assertion failed: meshes=${meshes.length} prims=${prims}`);
if (!(tris > 0)) throw new Error('assertion failed: no triangles');

const bytes = fs.statSync(`${OUT}/detail.glb`).size;
const meta = { buildings: globalThis.__content.buildings, landmarks: globalThis.__content.landmarks, tris: Math.round(tris), bytes };
fs.writeFileSync(`${OUT}/detail_meta.json`, JSON.stringify(meta, null, 2));
console.log(`detail.glb: meshes=${meshes.length} prims=${prims} tris=${Math.round(tris)} bytes=${bytes} (${(bytes / 1e6).toFixed(2)} MB)`);
console.log(`materials: ${root.listMaterials().map((m) => m.getName()).join(', ')}`);
console.log(`detail_meta.json written: ${JSON.stringify(meta)}`);
