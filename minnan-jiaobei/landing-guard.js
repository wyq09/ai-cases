import { Quaternion, Vec3 } from "cannon-es";
export const SAFE_RADIUS = 0.06 * 4.2;
export const CENTRE_GAP = 0.005;
// Exact sampling density and dimensions of the Blender source, including the crown.
const points = [];
for (let i = 0; i <= 96; i++) {
  const t = i / 96,
    w = 1.42 * Math.sin(Math.PI * t) ** 0.6 + 0.045,
    inner = 0.1 * Math.sin(Math.PI * t);
  for (let j = 0; j <= 28; j++) {
    const u = j / 28,
      x = ((inner + w * u - 0.65) * 1.4 - 0.18 * 1.4) * 0.06,
      z = -(t - 0.5) * 3.5 * 1.4 * 0.06;
    const top =
      0.07 + 0.62 * Math.sin(Math.PI * u) ** 0.6 * Math.sin(Math.PI * t) ** 0.6;
    for (const y of [0, top]) points.push(x, (y * 1.4 - 0.28 * 1.4) * 0.06, z);
  }
}
const vertices = new Float64Array(points);
function footprint(body) {
  const { x, y, z, w } = body.quaternion;
  const xx = 1 - 2 * (y * y + z * z),
    xy = 2 * (x * y - z * w),
    xz = 2 * (x * z + y * w);
  const zx = 2 * (x * z - y * w),
    zy = 2 * (y * z + x * w),
    zz = 1 - 2 * (x * x + y * y);
  const offsets = new Float64Array((vertices.length / 3) * 2);
  let minZ = Infinity,
    maxZ = -Infinity;
  for (let i = 0, j = 0; i < vertices.length; i += 3, j += 2) {
    offsets[j] = xx * vertices[i] + xy * vertices[i + 1] + xz * vertices[i + 2];
    const pz = zx * vertices[i] + zy * vertices[i + 1] + zz * vertices[i + 2];
    offsets[j + 1] = pz;
    minZ = Math.min(minZ, pz);
    maxZ = Math.max(maxZ, pz);
  }
  return { offsets, minZ, maxZ };
}
function interval(offsets, centreZ, side) {
  let low = -Infinity,
    high = Infinity;
  for (let j = 0; j < offsets.length; j += 2) {
    const x = offsets[j],
      z = offsets[j + 1] + centreZ;
    if (Math.abs(z) >= SAFE_RADIUS) return null;
    const edge = Math.sqrt(SAFE_RADIUS ** 2 - z * z);
    low = Math.max(low, -edge - x, side === 1 ? CENTRE_GAP - x : -Infinity);
    high = Math.min(high, edge - x, side === -1 ? -CENTRE_GAP - x : Infinity);
  }
  return low <= high ? { low, high } : null;
}
export function protectLanding(body, side) {
  let fp = footprint(body),
    range = interval(fp.offsets, body.position.z, side);
  if (!range) {
    // Adjust azimuth only: rotating around world Y does not change the result face.
    const axis = body.quaternion.vmult(new Vec3(0, 0, 1));
    if (Math.hypot(axis.x, axis.z) > 0.001) {
      let yaw = Math.atan2(axis.x, axis.z);
      if (yaw > Math.PI / 2) yaw -= Math.PI;
      if (yaw < -Math.PI / 2) yaw += Math.PI;
      const correction = new Quaternion();
      correction.setFromAxisAngle(new Vec3(0, 1, 0), -yaw);
      correction.mult(body.quaternion, body.quaternion);
      body.quaternion.normalize();
      body.angularVelocity.y = 0;
    }
    fp = footprint(body);
    body.position.z = -(fp.minZ + fp.maxZ) / 2;
    body.velocity.z = 0;
    range = interval(fp.offsets, body.position.z, side);
  }
  if (!range) throw new Error("Cup footprint cannot fit its landing region");
  const before = body.position.x;
  body.position.x = Math.max(range.low, Math.min(range.high, before));
  if (body.position.x !== before) {
    if (
      (before < range.low && body.velocity.x < 0) ||
      (before > range.high && body.velocity.x > 0)
    )
      body.velocity.x = 0;
  }
  body.aabbNeedsUpdate = true;
}
export function landingBounds(body) {
  const { offsets } = footprint(body);
  let minX = Infinity,
    maxX = -Infinity,
    maxRadius = 0;
  for (let j = 0; j < offsets.length; j += 2) {
    const x = offsets[j] + body.position.x,
      z = offsets[j + 1] + body.position.z;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    maxRadius = Math.max(maxRadius, Math.hypot(x, z));
  }
  return { minX, maxX, maxRadius };
}
