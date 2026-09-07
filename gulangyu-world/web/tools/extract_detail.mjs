/*
 * extract_detail.mjs — 核心街区高模细节层（detail.glb）提取管线
 *
 * 输入 delivery/game/Gulangyu_Environment_LOD0.glb（513MB，1153 栋建筑高模 + 地标）
 * detail 集（与 env 侧排除集严格一致）：
 *   - B_<id>，id ∈ core_ids.json（龙头路街区 + 各地标周边共 158 栋核心建筑）
 *   - ^LM_*          地标
 *   - Longtou_Lane_Closeup_Doors_Awnings  龙头路近景门窗檐廊
 *   - ^Street_name_* 路名牌
 *
 * 处理：
 *   - 每个 B_* 按 terrain_util 的 ringGap/dropFor 下沉（与 env 资产同实现，保证高度一致）
 *   - 为每个 B_* 的底部边界边向下挤出 8m 裙墙（世界坐标烘焙，合并为单一 mesh）
 *
 * 输出 web/assets/detail_raw.glb（再经 CLI optimize 压缩为 detail.glb）
 */
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { prune } from '@gltf-transform/functions';
import { loadTerrain, dropFor } from './terrain_util.mjs';

const GAME = path.resolve(import.meta.dirname, '../../delivery/game');
const OUT = path.resolve(import.meta.dirname, '../assets');
const SRC = `${GAME}/Gulangyu_Environment_LOD0.glb`;

const LANE = 'Longtou_Lane_Closeup_Doors_Awnings';
const coreIds = new Set(
  JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, 'core_ids.json'), 'utf8')).ids
);

const isDetail = (name) => {
  if (!name) return false;
  if (name === LANE || /^LM_/.test(name) || /^Street_name_/.test(name)) return true;
  const m = /^B_(\d+)(?:$|_)/.exec(name);
  return !!(m && coreIds.has(m[1]));
};

const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression])
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

console.time('read LOD0');
const doc = await io.read(SRC);
console.timeEnd('read LOD0');

const root = doc.getRoot();
const scene = root.listScenes()[0];

// ---------- 1. 只保留 detail 集 ----------
{
  const t = Date.now();
  let removed = 0;
  const kept = [];
  for (const n of [...scene.listChildren()]) {
    if (isDetail(n.getName())) kept.push(n);
    else { scene.removeChild(n); n.dispose(); removed++; }
  }
  // 场景为扁平结构（探查确认 13672 个节点全在一级），保留节点的子树随节点一并保留。
  // 被移除节点遗留的 mesh/accessor/material/texture 由末尾 prune() 统一清理。
  console.log(`kept ${kept.length} nodes, removed ${removed} (${Date.now() - t} ms)`);
}

const kept = scene.listChildren();
const buildings = kept.filter((n) => {
  const m = /^B_(\d+)(?:$|_)/.exec(n.getName() || '');
  return !!(m && coreIds.has(m[1])) && n.getMesh();
});
const landmarks = kept.filter((n) => /^LM_/.test(n.getName() || ''));
console.log(`buildings: ${buildings.length}, landmarks: ${landmarks.length}, total kept: ${kept.length}`);

// ---------- 2. 裙墙（已停用）：与 env 侧同样原因——实测裙墙与立面共面/覆盖墙体 ----------

// ---------- 3. 沉降（与 env 资产同一实现） ----------
{
  const t = Date.now();
  const ringGap = loadTerrain(new URL('../assets/meta.json', import.meta.url));
  let dropped = 0, noTerrain = 0;
  for (const node of buildings) {
    const gap = ringGap(node);
    const drop = dropFor(gap);
    if (gap === null) noTerrain++;
    if (drop > 0) {
      const tr = node.getTranslation();
      node.setTranslation([tr[0], tr[1] - drop, tr[2]]);
      dropped++;
    }
  }
  console.log(`settlement: ${dropped}/${buildings.length} dropped, ${noTerrain} without terrain data (${Date.now() - t} ms)`);
}

// ---------- 4. 收尾写出 ----------
await doc.transform(prune());
await io.write(`${OUT}/detail_raw.glb`, doc);
const bytes = fs.statSync(`${OUT}/detail_raw.glb`).size;
console.log(`detail_raw.glb written: ${(bytes / 1e6).toFixed(1)} MB`);
console.log(`SUMMARY buildings=${buildings.length} landmarks=${landmarks.length} streets=${kept.filter((n) => /^Street_name_/.test(n.getName() || '')).length} lane=${kept.some((n) => n.getName() === LANE) ? 1 : 0}`);
