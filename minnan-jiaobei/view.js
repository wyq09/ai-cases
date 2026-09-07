import { Box3, Vector3, MathUtils } from "three";
export class TrayView {
  constructor() {
    this.scale = 1;
    this.bounds = new Box3();
  }
  reset() {
    this.scale = 1;
  }
  fit(camera, cups) {
    const vertical = MathUtils.degToRad(camera.fov);
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect);
    // Wide views need extra margin so the tray rim stays inside the frame.
    const radius = camera.aspect >= 1.05 ? 5.25 : 4.7;
    const distance = radius / Math.tan(Math.min(vertical, horizontal) / 2);
    const apply = () => {
      camera.position.set(
        0,
        distance * 0.88 * this.scale,
        distance * 0.475 * this.scale,
      );
      camera.lookAt(0, 0.45, 0);
      camera.updateMatrixWorld();
    };
    apply();
    if (!cups.length) return;
    this.bounds.makeEmpty();
    for (const cup of cups) this.bounds.expandByObject(cup);
    // Only widen during a throw. Fixed target and monotonic scale prevent camera jitter.
    for (let pass = 0; pass < 5; pass++) {
      let extent = 0;
      for (const p of this.corners()) {
        p.project(camera);
        extent = Math.max(extent, Math.abs(p.x), Math.abs(p.y));
      }
      if (extent <= 0.91) break;
      this.scale *= extent / 0.89;
      apply();
    }
  }
  corners() {
    const points = [];
    for (const x of [this.bounds.min.x, this.bounds.max.x])
      for (const y of [this.bounds.min.y, this.bounds.max.y])
        for (const z of [this.bounds.min.z, this.bounds.max.z])
          points.push(new Vector3(x, y, z));
    return points;
  }
}
