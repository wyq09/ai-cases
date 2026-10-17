import * as THREE from 'three';

const VERT = `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (420.0 / max(0.001, -mv.z));
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = `
uniform sampler2D uTex;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 t = texture2D(uTex, gl_PointCoord);
  if (t.a < 0.01) discard;
  gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
}
`;

export class ParticlePool {
  constructor(scene, tex, { max = 700, blending = THREE.AdditiveBlending } = {}) {
    this.max = max;
    this.items = [];
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: tex } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending,
      toneMapped: false,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    scene.add(this.points);
  }

  spawn(o) {
    if (this.items.length >= this.max) this.items.shift();
    const c0 = new THREE.Color(o.color ?? 0xffffff);
    const c1 = new THREE.Color(o.colorEnd ?? o.color ?? 0xffffff);
    this.items.push({
      p: new THREE.Vector3().copy(o.pos),
      v: new THREE.Vector3().copy(o.vel),
      life: 0,
      max: o.life ?? 0.8,
      s0: o.size ?? 0.5,
      s1: o.sizeEnd ?? (o.size ?? 0.5) * 0.2,
      a0: o.alpha ?? 0.9,
      c0, c1,
      g: o.gravity ?? 0,
      drag: o.drag ?? 1.6,
    });
  }

  burst(pos, count, o = {}) {
    for (let i = 0; i < count; i++) {
      const dir = new THREE.Vector3(
        (Math.random() - 0.5) * (o.spread ?? 1),
        Math.random() * (o.up ?? 0.6),
        (Math.random() - 0.5) * (o.spread ?? 1)
      ).normalize();
      const sp = (o.speed ?? 4) * (0.35 + Math.random() * 0.8);
      this.spawn({
        pos: pos.clone().add(new THREE.Vector3(
          (Math.random() - 0.5) * (o.jitter ?? 0.2),
          0,
          (Math.random() - 0.5) * (o.jitter ?? 0.2)
        )),
        vel: dir.multiplyScalar(sp).add(o.baseVel ? o.baseVel.clone() : new THREE.Vector3()),
        life: (o.life ?? 0.7) * (0.6 + Math.random() * 0.8),
        size: (o.size ?? 0.4) * (0.65 + Math.random() * 0.8),
        sizeEnd: o.sizeEnd ?? 0.02,
        color: o.color ?? 0xffffff,
        colorEnd: o.colorEnd ?? o.color ?? 0xffffff,
        alpha: o.alpha ?? 1,
        gravity: o.gravity ?? 0,
        drag: o.drag ?? 2,
      });
    }
  }

  update(dt) {
    const items = this.items;
    let n = 0;
    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      p.life += dt;
      if (p.life >= p.max) continue;
      p.v.y -= p.g * dt;
      p.v.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.p.addScaledVector(p.v, dt);
      const k = p.life / p.max;
      const size = p.s0 + (p.s1 - p.s0) * k;
      const alpha = p.a0 * (k < 0.15 ? k / 0.15 : 1) * (1 - Math.pow(k, 1.6));
      const col = p.c0.clone().lerp(p.c1, k);
      this.pos[n * 3] = p.p.x;
      this.pos[n * 3 + 1] = p.p.y;
      this.pos[n * 3 + 2] = p.p.z;
      this.col[n * 3] = col.r;
      this.col[n * 3 + 1] = col.g;
      this.col[n * 3 + 2] = col.b;
      this.size[n] = size;
      this.alpha[n] = alpha;
      items[n++] = p;
    }
    items.length = n;
    this.geo.setDrawRange(0, n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }

  clear() {
    this.items.length = 0;
    this.geo.setDrawRange(0, 0);
  }
}

export class SkidMarks {
  constructor(scene, tex, max = 320) {
    this.max = max;
    this.index = 0;
    const geo = new THREE.PlaneGeometry(0.34, 0.62);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: 0.5, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      color: 0x0a0d12, toneMapped: false,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const m = new THREE.Matrix4();
    m.makeScale(0, 0, 0);
    for (let i = 0; i < max; i++) this.mesh.setMatrixAt(i, m);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.matrix = new THREE.Matrix4();
    this.quat = new THREE.Quaternion();
    this.up = new THREE.Vector3(0, 1, 0);
    this.scale = new THREE.Vector3(1, 1, 1);
    scene.add(this.mesh);
  }

  add(pos, yaw, width = 1) {
    this.quat.setFromAxisAngle(this.up, yaw);
    this.scale.set(width, 1, 0.85 + Math.random() * 0.3);
    this.matrix.compose(
      new THREE.Vector3(pos.x, pos.y + 0.012, pos.z),
      this.quat,
      this.scale
    );
    this.mesh.setMatrixAt(this.index, this.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.index = (this.index + 1) % this.max;
  }

  clear() {
    const m = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.max; i++) this.mesh.setMatrixAt(i, m);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.index = 0;
  }
}
