import * as T from "./vendor/three.module-gpt-6-Astra.min.js";
// Cars and people retain their own scene graph for animation and ray picking.
// Shared geometry/material pairs are drawn with instancing to keep mobile draw calls low.
export class SceneBatcher {
  constructor(scene) {
    this.scene = scene;
    this.batches = [];
    this.dirty = true;
  }
  rebuild() {
    for (const b of this.batches) {
      this.scene.remove(b.mesh);
      b.mesh.dispose();
    }
    this.batches = [];
    const pairs = new Map();
    this.scene.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.userData.unique) return;
      const key = `${o.geometry.id}/${o.material.id}`;
      if (!pairs.has(key)) pairs.set(key, []);
      pairs.get(key).push(o);
      o.userData.batched = true;
      o.visible = false;
    });
    for (const sources of pairs.values()) {
      const first = sources[0],
        mesh = new T.InstancedMesh(
          first.geometry,
          first.material,
          sources.length,
        );
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.batches.push({ mesh, sources });
    }
    this.dirty = false;
  }
  update() {
    if (this.dirty) this.rebuild();
    this.scene.updateMatrixWorld(true);
    for (const { mesh, sources } of this.batches) {
      let i = 0;
      for (const source of sources) {
        let visible = true;
        for (let p = source.parent; p && p !== this.scene; p = p.parent)
          if (!p.visible) {
            visible = false;
            break;
          }
        if (visible) mesh.setMatrixAt(i++, source.matrixWorld);
      }
      mesh.count = i;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
