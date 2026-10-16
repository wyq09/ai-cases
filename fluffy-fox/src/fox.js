import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const P = {
  orange: 0xe0813c, cream: 0xf7edda, tailTip: 0xfbf3e4, brown: 0x5f4433,
  line: 0x402c20, iris: 0x5a3520, blush: 0xf2a48c, tongue: 0xe98d84, pupil: 0x1a100a,
};

const sstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function buildFox() {
  const group = new THREE.Group();
  const bodyRoot = new THREE.Group();
  group.add(bodyRoot);

  const furMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  const furTargets = [];

  // 顶点色：dir 为单位球方向（缩放前），便于按身体部位上双色
  const fillFn = (geo, fn) => {
    const pos = geo.attributes.position;
    const n = pos.count;
    const arr = new Float32Array(n * 3);
    const v = new THREE.Vector3();
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      fn(v, c);
      arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return geo;
  };
  const fill = (geo, hex, shade = 0.94) => fillFn(geo, (d, c) => c.set(hex).multiplyScalar(shade));

  // 毛发表面统一 vertexColors + 共享材质；缩放烘进几何，保证壳层 object-space 位移各向一致
  const furBall = (seg, s, hex, pos, parent, ft, colorFn) => {
    const g = new THREE.SphereGeometry(1, seg, Math.max(10, Math.round(seg * 0.66)));
    g.scale(s[0], s[1], s[2]);
    fillFn(g, colorFn || ((d, c) => c.set(hex).multiplyScalar(0.94)));
    const m = new THREE.Mesh(g, furMat);
    m.position.set(pos[0], pos[1], pos[2]);
    m.castShadow = true;
    parent.add(m);
    furTargets.push({
      mesh: m, length: ft[0], shells: ft[1], density: ft[2], tint: ft[3],
      order: ft[4] || 0, maxScale: ft[5],
    });
    return m;
  };
  const plain = (hex, o = {}) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.92, metalness: 0, ...o });
  const ball = (r, ws, hs, mat) => new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), mat);

  const cOrange = new THREE.Color(0xe0813c).multiplyScalar(0.94);
  const cCream = new THREE.Color(0xf7edda);

  // 躯干：正前下腹大片奶油色（对照参考图胸腹椭圆），边缘平滑过渡
  furBall(36, [0.46, 0.50, 0.38], P.orange, [0, 0.70, 0], bodyRoot,
    [0.06, 12, 0.55, null, 0, 1.6],
    (d, c) => {
      const k = sstep(0.28, 0.6, d.z) * sstep(0.5, 0.1, d.y);
      c.copy(cOrange).lerp(cCream, k);
    });

  // 胸毛：下巴下方的奶白围脖
  furBall(24, [0.27, 0.25, 0.20], P.cream, [0, 0.97, 0.20], bodyRoot,
    [0.085, 10, 0.48, new THREE.Color(0xf7edda).lerp(new THREE.Color(0xe0813c), 0.12), 0, 2.0]);

  // 手臂：橙色毛臂 + 深棕爪
  const pawMat = plain(P.brown);
  const arms = {};
  [1, -1].forEach(s => {
    const arm = new THREE.Group();
    arm.position.set(0.43 * s, 0.94, 0);
    arm.rotation.set(-0.12, 0, 0.5 * s);
    bodyRoot.add(arm);
    const armG = new THREE.CapsuleGeometry(0.115, 0.28, 6, 16);
    armG.translate(0, -0.17, 0);
    fill(armG, P.orange, 0.94);
    const sleeve = new THREE.Mesh(armG, furMat);
    sleeve.castShadow = true;
    arm.add(sleeve);
    furTargets.push({ mesh: sleeve, length: 0.045, shells: 6, density: 0.7, tint: null, order: 0, maxScale: 1.5 });
    const paw = ball(0.095, 16, 12, pawMat);
    paw.position.y = -0.35;
    paw.castShadow = true;
    arm.add(paw);
    arms[s > 0 ? 'L' : 'R'] = arm;
  });

  // 腿：橙大腿（藏进臀毛）+ 深棕小腿 + 奶油脚尖
  const toeMat = plain(P.cream);
  [1, -1].forEach(s => {
    const leg = new THREE.Group();
    leg.position.set(0.19 * s, 0, 0.02);
    bodyRoot.add(leg);
    const thighG = new THREE.SphereGeometry(1, 18, 14);
    thighG.scale(0.145, 0.17, 0.145);
    fill(thighG, P.orange);
    const thigh = new THREE.Mesh(thighG, furMat);
    thigh.position.y = 0.30;
    thigh.castShadow = true;
    leg.add(thigh);
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.105, 0.10, 6, 14), plain(P.brown));
    shin.position.y = 0.15;
    shin.castShadow = true;
    leg.add(shin);
    const toeG = new THREE.SphereGeometry(1, 16, 12);
    toeG.scale(0.105, 0.07, 0.12);
    const toe = new THREE.Mesh(toeG, toeMat);
    toe.position.set(0, 0.07, 0.05);
    toe.castShadow = true;
    leg.add(toe);
  });

  // 头
  const head = new THREE.Group();
  head.position.y = 1.55;
  bodyRoot.add(head);
  furBall(48, [0.50, 0.46, 0.48], P.orange, [0, 0, 0], head,
    [0.05, 8, 0.62, new THREE.Color(0xe0813c).lerp(new THREE.Color(0xffffff), 0.10), 0, 1.2]);
  furBall(24, [0.20, 0.15, 0.16], P.cream, [0, -0.10, 0.40], head,
    [0.05, 7, 0.55, new THREE.Color(0xffffff), 0, 1.3]);

  // 头顶炸毛：三撮向后/外侧倒的小尖
  const tuftMat = plain(P.orange);
  [[0.095, 0.28, 0, 0.47, -0.03, -0.5, 0], [0.07, 0.22, 0.15, 0.45, 0, -0.3, -0.6],
   [0.07, 0.22, -0.15, 0.45, 0, -0.3, 0.6]].forEach(t => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(t[0], t[1], 7), tuftMat);
    m.position.set(t[2], t[3], t[4]);
    m.rotation.set(t[5], 0, t[6]);
    m.castShadow = true;
    head.add(m);
  });

  const nose = ball(0.055, 16, 12, plain(P.line, { roughness: 0.5 }));
  nose.position.set(0, -0.045, 0.565);
  nose.castShadow = true;
  head.add(nose);

  const mouthG = new THREE.TorusGeometry(0.055, 0.013, 8, 24, 2.2);
  const mouth = new THREE.Mesh(mouthG, plain(P.line));
  mouth.position.set(0, -0.12, 0.578);
  mouth.rotation.z = -Math.PI / 2 - 1.1;
  head.add(mouth);
  const tongueG = new THREE.SphereGeometry(1, 14, 10);
  tongueG.scale(0.048, 0.034, 0.02);
  const tongue = new THREE.Mesh(tongueG, plain(P.tongue, { roughness: 0.55 }));
  tongue.position.set(0, -0.150, 0.588);
  tongue.rotation.x = 0.25;
  head.add(tongue);

  const irisMat = plain(P.iris, { roughness: 0.25 });
  const pupilMat = plain(P.pupil, { roughness: 0.2 });
  const hiMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const eyes = {};
  [1, -1].forEach(s => {
    const eye = new THREE.Group();
    eye.position.set(0.20 * s, 0.05, 0.415);
    eye.rotation.y = 0.06 * s;
    head.add(eye);
    const iris = ball(0.105, 24, 16, irisMat);
    iris.castShadow = true;
    eye.add(iris);
    const pupil = ball(0.055, 16, 12, pupilMat);
    pupil.position.z = 0.065;
    pupil.castShadow = true;
    eye.add(pupil);
    const hi1 = ball(0.032, 10, 8, hiMat);
    hi1.position.set(-0.035, 0.04, 0.095);
    eye.add(hi1);
    const hi2 = ball(0.016, 8, 6, hiMat);
    hi2.position.set(0.03, -0.028, 0.10);
    eye.add(hi2);
    eyes[s > 0 ? 'left' : 'right'] = eye;
  });

  const browMat = plain(P.cream);
  [1, -1].forEach(s => {
    const b = ball(0.03, 10, 8, browMat);
    b.position.set(0.14 * s, 0.24, 0.45);
    head.add(b);
  });

  const blushMat = plain(P.blush, { transparent: true, opacity: 0.5, depthWrite: false });
  [1, -1].forEach(s => {
    const g = new THREE.SphereGeometry(0.07, 16, 12);
    g.scale(1, 0.8, 0.35);
    const m = new THREE.Mesh(g, blushMat);
    m.position.set(0.352 * s, -0.085, 0.352);
    m.rotation.y = 0.62 * s;
    head.add(m);
  });

  // 腮毛
  [1, -1].forEach(s => {
    furBall(20, [0.19, 0.14, 0.11], P.cream, [0.36 * s, -0.03, 0.19], head,
      [0.075, 8, 0.42, new THREE.Color(0xffffff), 0, 1.8]);
  });

  // 耳
  const earTipMat = plain(P.brown);
  const earPivots = {};
  [1, -1].forEach(s => {
    const ear = new THREE.Group();
    ear.position.set(0.28 * s, 0.32, 0.02);
    ear.rotation.set(-0.12, 0, -0.36 * s);
    head.add(ear);
    furBall(24, [0.155, 0.26, 0.09], P.orange, [0, 0.18, 0], ear, [0.035, 6, 0.75, null, 0, 1.5]);
    const tipG = new THREE.SphereGeometry(1, 20, 14);
    tipG.scale(0.13, 0.12, 0.08);
    const tip = new THREE.Mesh(tipG, earTipMat);
    tip.position.set(0, 0.32, 0);
    tip.castShadow = true;
    ear.add(tip);
    furBall(20, [0.10, 0.17, 0.04], P.cream, [0, 0.16, 0.06], ear, [0.06, 7, 0.5, new THREE.Color(0xffffff), 0, 1.5]);
    earPivots[s > 0 ? 'L' : 'R'] = ear;
  });

  // 尾巴：曲线管 + 逐环半径 + 橙→奶白，分界线沿环向波浪起伏（对照参考图锯齿过渡）
  const tail = new THREE.Group();
  tail.position.set(0.06, 0.60, -0.24);
  bodyRoot.add(tail);
  const tCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.34, 0.24, -0.18), new THREE.Vector3(0.66, 0.64, -0.24),
    new THREE.Vector3(0.84, 1.10, -0.02), new THREE.Vector3(0.74, 1.40, 0.20),
  ]);
  const prof = [0.10, 0.24, 0.32, 0.30, 0.14];
  const radAt = t => {
    const f = t * (prof.length - 1);
    const i = Math.min(prof.length - 2, Math.floor(f));
    const k = f - i;
    return prof[i] + (prof[i + 1] - prof[i]) * k * k * (3 - 2 * k);
  };
  const cTailTip = new THREE.Color(0xf7e8d2);
  const cTmp = new THREE.Color();
  const tubeG = new THREE.TubeGeometry(tCurve, 48, 1, 22, false);
  {
    const pos = tubeG.attributes.position;
    const uv = tubeG.attributes.uv;
    const cols = new Float32Array(pos.count * 3);
    const p = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      const t = uv.getX(i);
      const ang = uv.getY(i) * Math.PI * 2;
      tCurve.getPointAt(t, p);
      const s = radAt(t);
      pos.setXYZ(i, p.x + (pos.getX(i) - p.x) * s, p.y + (pos.getY(i) - p.y) * s, p.z + (pos.getZ(i) - p.z) * s);
      const wave = 0.63 + 0.05 * Math.sin(ang * 3 + 0.6);
      const k = sstep(wave - 0.09, wave + 0.09, t);
      cTmp.copy(cOrange).lerp(cTailTip, k);
      cols[i * 3] = cTmp.r; cols[i * 3 + 1] = cTmp.g; cols[i * 3 + 2] = cTmp.b;
    }
    tubeG.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  }
  const capG = (t, r, hex, shade) => {
    const g = new THREE.SphereGeometry(r, 20, 14);
    g.translate(tCurve.getPointAt(t).x, tCurve.getPointAt(t).y, tCurve.getPointAt(t).z);
    return fill(g, hex, shade);
  };
  const tailGeo = mergeGeometries([tubeG, capG(0, 0.10, 0xe0813c, 0.94), capG(1, 0.13, 0xf7e8d2, 1)]);
  tailGeo.computeVertexNormals();
  const tailMesh = new THREE.Mesh(tailGeo, furMat);
  tailMesh.scale.setScalar(1.15);
  tailMesh.castShadow = true;
  tail.add(tailMesh);
  furTargets.push({ mesh: tailMesh, length: 0.20, shells: 16, density: 0.42, tint: new THREE.Color(0xf7e8d2), order: 10, maxScale: 2.0 });

  function dispose() {
    group.traverse(o => {
      if (o.isMesh) {
        o.geometry.dispose();
        if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
        else o.material.dispose();
      }
    });
  }

  return {
    group,
    pivots: { bodyRoot, head, earL: earPivots.L, earR: earPivots.R, tail, armL: arms.L, armR: arms.R },
    eyes,
    furTargets,
    dispose,
  };
}
