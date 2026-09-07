import { NodeIO } from '@gltf-transform/core';
const io = new NodeIO();
const doc = await io.read('../assets/env_notrees.glb');
const root = doc.getRoot();

for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const e = node.getWorldMatrix();
  const sy = Math.hypot(e[1], e[5], e[9]); // Y 轴缩放
  let minY = Infinity, maxY = -Infinity, badPrims = 0, tris = 0;
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION');
    const mn = pos.getMin([]), mx = pos.getMax([]);
    tris += prim.getIndices().getCount() / 3;
    if (!mn || !mx) { badPrims++; continue; }
    const ly0 = e[1] * mn[0] + e[5] * mn[1] + e[9] * mn[2] + e[13];
    const ly1 = e[1] * mx[0] + e[5] * mx[1] + e[9] * mx[2] + e[13];
    minY = Math.min(minY, ly0, ly1);
    maxY = Math.max(maxY, ly0, ly1);
  }
  if (maxY > 130 || !Number.isFinite(maxY)) {
    console.log(`${node.getName()}: worldY=[${(+minY).toFixed(1)}, ${(+maxY).toFixed(1)}] tris=${tris} badPrims=${badPrims} scaleY=${sy.toFixed(2)}`);
  }
}
console.log('done');
