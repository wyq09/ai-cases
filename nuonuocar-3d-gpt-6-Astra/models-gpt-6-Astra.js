import * as T from "./vendor/three.module-gpt-6-Astra.min.js";
const materials = new Map(),
  geometries = new Map(),
  textures = new Map();
export const group = () => new T.Group();
export function material(color, extra = {}) {
  const key = color + JSON.stringify(extra);
  if (!materials.has(key))
    materials.set(
      key,
      new T.MeshStandardMaterial({ color, roughness: 0.62, ...extra }),
    );
  return materials.get(key);
}
export function box(parent, w, h, d, color, x = 0, y = 0, z = 0, radius = 0) {
  radius = Math.min(radius, w / 2, h / 2, d / 2);
  const key = [w, h, d, radius].join(",");
  if (!geometries.has(key)) {
    const geo = new T.BoxGeometry(
      w,
      h,
      d,
      radius ? 3 : 1,
      radius ? 3 : 1,
      radius ? 3 : 1,
    );
    if (radius) {
      const pos = geo.attributes.position,
        v = new T.Vector3(),
        c = new T.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        c.set(
          T.MathUtils.clamp(v.x, -w / 2 + radius, w / 2 - radius),
          T.MathUtils.clamp(v.y, -h / 2 + radius, h / 2 - radius),
          T.MathUtils.clamp(v.z, -d / 2 + radius, d / 2 - radius),
        );
        v.sub(c).normalize().multiplyScalar(radius).add(c);
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      geo.computeVertexNormals();
    }
    geometries.set(key, geo);
  }
  const mesh = new T.Mesh(
    geometries.get(key),
    typeof color === "object" ? color : material(color),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
export function sphere(parent, radius, color, x, y, z, detail = 12) {
  const key = `sphere${radius},${detail}`;
  if (!geometries.has(key))
    geometries.set(key, new T.SphereGeometry(radius, detail, 8));
  const mesh = new T.Mesh(geometries.get(key), material(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}
export function cylinder(parent, radius, height, color, x, y, z) {
  const key = `cylinder${radius},${height}`;
  if (!geometries.has(key))
    geometries.set(key, new T.CylinderGeometry(radius, radius, height, 12));
  const mesh = new T.Mesh(geometries.get(key), material(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}
export function label(text, color = "#45654f", bg = "", w = 1, h = 0.35) {
  const key = text + color + bg;
  if (!textures.has(key)) {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 128;
    const ctx = c.getContext("2d");
    if (bg) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 512, 128);
    }
    ctx.fillStyle = color;
    ctx.font = "bold 66px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 68);
    const texture = new T.CanvasTexture(c);
    texture.colorSpace = T.SRGBColorSpace;
    textures.set(key, texture);
  }
  const mesh = new T.Mesh(
    new T.PlaneGeometry(w, h),
    new T.MeshBasicMaterial({
      map: textures.get(key),
      transparent: true,
      depthWrite: false,
      side: T.DoubleSide,
    }),
  );
  mesh.userData.unique = true;
  return mesh;
}
export function floorLabel(
  parent,
  text,
  x,
  z,
  w = 1,
  color = "#eef0d8",
  h = 0.28,
) {
  const mesh = label(text, color, "", w, h);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0.035, z);
  parent.add(mesh);
  return mesh;
}
export function car(v) {
  const g = group(),
    c = window.ParkingEngine.COLORS[v.color],
    len = v.len - 0.16;
  g.userData.id = v.id;
  g.userData.signature = `${v.color}/${v.len}`;
  box(g, len - 0.1, 0.2, 0.66, "#344741", 0, 0.22, 0, 0.055);
  box(g, len, 0.35, 0.79, c.body, 0, 0.44, 0, 0.11);
  box(
    g,
    len * 0.57,
    0.36,
    0.66,
    material("#244754", { roughness: 0.18, metalness: 0.25 }),
    -0.12,
    0.74,
    0,
    0.085,
  );
  box(g, len * 0.52, 0.085, 0.67, c.top, -0.15, 0.94, 0, 0.035);
  // Pillars divide side glass; the front points along local +X.
  for (const z of [-0.34, 0.34]) {
    box(g, 0.065, 0.28, 0.025, c.body, -0.26, 0.75, z);
    box(g, 0.1, 0.028, 0.035, "#eef2df", 0.1, 0.57, z * 1.19);
    box(g, 0.16, 0.08, 0.08, c.body, 0.45, 0.67, z * 1.32, 0.025);
  }
  for (const x of [-len * 0.31, len * 0.3])
    for (const z of [-0.4, 0.4]) {
      const wheel = cylinder(g, 0.185, 0.115, "#283c3d", x, 0.235, z);
      wheel.rotation.x = Math.PI / 2;
      const hub = cylinder(g, 0.085, 0.12, "#d7dfce", x, 0.235, z);
      hub.rotation.x = Math.PI / 2;
    }
  for (const z of [-0.24, 0.24]) {
    box(
      g,
      0.035,
      0.1,
      0.16,
      material("#fff3be", { emissive: "#f5d779", emissiveIntensity: 0.3 }),
      len / 2,
      0.46,
      z,
      0.012,
    );
    box(g, 0.026, 0.085, 0.15, "#ab4b44", -len / 2, 0.46, z, 0.01);
  }
  box(g, 0.032, 0.09, 0.36, "#dfe5d7", len / 2 + 0.015, 0.3, 0, 0.01);
  const arrow = new T.Shape();
  arrow.moveTo(-0.27, -0.075);
  arrow.lineTo(0.03, -0.075);
  arrow.lineTo(0.03, -0.18);
  arrow.lineTo(0.3, 0);
  arrow.lineTo(0.03, 0.18);
  arrow.lineTo(0.03, 0.075);
  arrow.lineTo(-0.27, 0.075);
  arrow.closePath();
  const pointer = new T.Mesh(
    new T.ShapeGeometry(arrow),
    new T.MeshBasicMaterial({ color: "#fffced", side: T.DoubleSide }),
  );
  pointer.rotation.x = -Math.PI / 2;
  pointer.position.set(-0.13, 0.99, 0);
  pointer.userData.unique = true;
  g.add(pointer);
  const symbol = floorLabel(g, c.mark, len * 0.33, 0, 0.24, "#fff9df", 0.21);
  symbol.position.y = 0.635;
  const door = group();
  door.position.set(0.37, 0.48, -0.41);
  g.add(door);
  box(door, 0.47, 0.34, 0.04, c.body, -0.235, 0.12, 0, 0.018);
  door.visible = false;
  g.userData.door = door;
  const badge = label(`0/${v.capacity}`, "#315945", "#fffceb", 0.69, 0.22);
  badge.position.set(0, 1.3, 0);
  badge.visible = false;
  g.add(badge);
  g.userData.badge = badge;
  g.userData.badgeText = `0/${v.capacity}`;
  const ring = new T.Mesh(
    new T.RingGeometry(0.53, 0.59, 32),
    new T.MeshBasicMaterial({
      color: "#fff7bc",
      side: T.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.scale.x = v.len * 0.7;
  ring.position.y = 0.055;
  ring.visible = false;
  ring.userData.unique = true;
  g.add(ring);
  g.userData.ring = ring;
  return g;
}
export function person(color) {
  const g = group(),
    body = window.ParkingEngine.COLORS[color].body;
  const l = box(g, 0.1, 0.2, 0.11, "#405854", -0.075, 0.12, 0, 0.03),
    r = box(g, 0.1, 0.2, 0.11, "#405854", 0.075, 0.12, 0, 0.03);
  box(g, 0.3, 0.3, 0.19, body, 0, 0.35, 0, 0.07);
  sphere(g, 0.13, "#f2d0ad", 0, 0.64, 0);
  sphere(g, 0.135, "#4b5142", 0, 0.71, -0.025);
  box(
    g,
    0.12,
    0.21,
    0.14,
    window.ParkingEngine.COLORS[color].dark,
    0,
    0.39,
    -0.14,
    0.03,
  );
  g.userData.legs = [l, r];
  return g;
}
export function tree(parent, x, z, s = 1) {
  const g = group();
  g.position.set(x, 0, z);
  g.scale.setScalar(s);
  parent.add(g);
  cylinder(g, 0.1, 0.9, "#8e8b63", 0, 0.5, 0);
  sphere(g, 0.65, "#8cab74", 0, 1.35, 0, 8);
  sphere(g, 0.44, "#a8c38b", -0.25, 1.65, 0.1, 8);
  box(g, 1.2, 0.14, 1.2, "#c9d4ac", 0, 0.07, 0, 0.15);
}
export function release(root) {
  root.traverse((o) => {
    if (o.userData.unique) {
      o.geometry?.dispose();
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
      else o.material?.dispose();
    }
  });
  root.removeFromParent();
}
