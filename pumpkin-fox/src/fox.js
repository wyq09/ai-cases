import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makePlaidTexture, makePumpkinTexture } from './textures.js';

const P = {
  orange: 0xe0813c, cream: 0xf7edda, tailTip: 0xfbf3e4, brown: 0x5f4433,
  line: 0x402c20, iris: 0x5a3520, blush: 0xf2a48c, coat: 0xe7b34c,
  button: 0x7a4e2c, stem: 0x6e7f45, brim: 0xc8701f, pupil: 0x1a100a,
};

// 贴图脸画在 u=0.5；three 球体 u=0.25 才朝 +Z，绕 y 转 -PI/2 把杰克脸带到正前（可微调校准）
const HAT_FACE_YAW = -Math.PI / 2;

export function buildFox() {
  const group = new THREE.Group();
  const bodyRoot = new THREE.Group();
  group.add(bodyRoot);

  const plaidTex = makePlaidTexture(THREE);
  plaidTex.repeat.set(3, 1);
  const pumpkinTex = makePumpkinTexture(THREE);
  const furMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  const furTargets = [];

  const fill = (geo, hex, shade = 0.9) => {
    const c = new THREE.Color(hex).multiplyScalar(shade);
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return geo;
  };
  // 毛发表面统一走 vertexColors + 共享材质；缩放烘进几何，保证壳层毛发 object-space 位移各向一致
  const furBall = (seg, s, hex, pos, parent, ft) => {
    const g = new THREE.SphereGeometry(1, seg, Math.max(10, Math.round(seg * 0.66)));
    g.scale(s[0], s[1], s[2]);
    fill(g, hex);
    const m = new THREE.Mesh(g, furMat);
    m.position.set(pos[0], pos[1], pos[2]);
    m.castShadow = true;
    parent.add(m);
    furTargets.push({ mesh: m, length: ft[0], shells: ft[1], density: ft[2], tint: ft[3], order: ft[4] || 0, maxScale: ft[5] });
    return m;
  };
  const plain = (hex, o = {}) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.92, metalness: 0, ...o });
  const shaded = (hex, f, o = {}) => plain(new THREE.Color(hex).multiplyScalar(f), o);
  const ball = (r, ws, hs, mat) => new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), mat);

  // 躯干（收窄到外套内，对照参考图身形）
  const torsoG = new THREE.SphereGeometry(1, 32, 22);
  torsoG.scale(0.42, 0.50, 0.36);
  const torso = new THREE.Mesh(torsoG, shaded(P.orange, 0.94));
  torso.position.y = 0.66;
  torso.castShadow = true;
  bodyRoot.add(torso);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.23, 0.30, 20), shaded(P.orange, 0.9));
  neck.position.y = 1.12;
  neck.castShadow = true;
  bodyRoot.add(neck);

  // 外套 A 字裙摆
  const lathePts = [[0.56, 0.30], [0.48, 0.55], [0.40, 0.80], [0.335, 1.00], [0.14, 1.08]]
    .map(p => new THREE.Vector2(p[0], p[1]));
  const coat = new THREE.Mesh(new THREE.LatheGeometry(lathePts, 48), plain(P.coat, { side: THREE.DoubleSide }));
  coat.castShadow = true;
  bodyRoot.add(coat);

  const collarG = new THREE.TorusGeometry(0.32, 0.06, 14, 48);
  collarG.rotateX(Math.PI / 2);
  const collar = new THREE.Mesh(collarG, shaded(P.coat, 0.96));
  collar.position.y = 1.08;
  collar.castShadow = true;
  bodyRoot.add(collar);

  const btnMat = plain(P.button, { roughness: 0.7 });
  [[0.58, 0.47], [0.74, 0.42], [0.90, 0.375]].forEach(b => {
    const m = ball(0.045, 12, 10, btnMat);
    m.position.set(0, b[0], b[1]);
    m.castShadow = true;
    bodyRoot.add(m);
  });

  const pocketMat = shaded(P.coat, 0.92);
  [1, -1].forEach(s => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.10, 0.02), pocketMat);
    m.position.set(0.27 * s, 0.56, 0.40);
    m.rotation.set(0, 0.55 * s, 0.04 * s);
    m.castShadow = true;
    bodyRoot.add(m);
  });

  // 胸毛（收敛尺寸，别把围巾全吞了）
  furBall(24, [0.30, 0.25, 0.20], P.cream, [0, 0.95, 0.22], bodyRoot,
    [0.075, 10, 0.5, new THREE.Color(0xf7edda).lerp(new THREE.Color(0xe0813c), 0.12), 0, 2.0]);

  // 围巾
  const scarfMat = new THREE.MeshStandardMaterial({ map: plaidTex, roughness: 0.95, metalness: 0 });
  // 垂穗用独立 repeat 的克隆贴图：小盒面上格纹放大成粗块，避免读成暗色涂抹
  const flapTex = plaidTex.clone();
  flapTex.repeat.set(0.26, 0.4); // 格纹画布含 4 个周期，只取约 1 个周期才够粗块感
  flapTex.needsUpdate = true;
  const flapMat = new THREE.MeshStandardMaterial({ map: flapTex, roughness: 0.95, metalness: 0 });
  const scarfMainG = new THREE.TorusGeometry(0.345, 0.125, 20, 48);
  scarfMainG.rotateX(Math.PI / 2);
  scarfMainG.scale(1, 0.82, 1);
  const scarfMain = new THREE.Mesh(scarfMainG, scarfMat);
  scarfMain.position.y = 1.08;
  scarfMain.castShadow = true;
  bodyRoot.add(scarfMain);

  const tassel = (parent, x, y, w) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.09, 0.05), flapMat);
    m.position.set(x, y, w || 0);
    m.castShadow = true;
    parent.add(m);
  };
  const tailF = new THREE.Group();
  tailF.position.set(-0.20, 0.82, 0.37);
  tailF.rotation.set(-0.04, 0.24, -0.08);
  bodyRoot.add(tailF);
  const f1 = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.34, 0.05), flapMat);
  f1.castShadow = true;
  tailF.add(f1);
  const f2 = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.30, 0.05), flapMat);
  f2.position.set(0.02, -0.02, 0.05);
  f2.rotation.z = 0.06;
  f2.castShadow = true;
  tailF.add(f2);
  [-0.075, -0.025, 0.025, 0.075].forEach(x => tassel(tailF, x, -0.215, 0));

  const tailB = new THREE.Group();
  tailB.position.set(0.16, 0.92, -0.31);
  tailB.rotation.set(0.05, -0.35, 0.04);
  bodyRoot.add(tailB);
  const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.26, 0.05), flapMat);
  b1.castShadow = true;
  tailB.add(b1);
  [-0.05, 0, 0.05].forEach(x => tassel(tailB, x, -0.175, 0));

  // 手臂
  const armMat = plain(P.coat);
  const gloveMat = plain(P.brown);
  const arms = {};
  [1, -1].forEach(s => {
    const arm = new THREE.Group();
    arm.position.set(0.46 * s, 0.95, 0);
    arm.rotation.set(-0.15, 0, 0.5 * s);
    bodyRoot.add(arm);
    const sleeveG = new THREE.CapsuleGeometry(0.125, 0.30, 6, 16);
    const sleeve = new THREE.Mesh(sleeveG, armMat);
    sleeve.position.y = -0.19;
    sleeve.castShadow = true;
    arm.add(sleeve);
    const cuffG = new THREE.TorusGeometry(0.13, 0.03, 10, 24);
    cuffG.rotateX(Math.PI / 2);
    const cuff = new THREE.Mesh(cuffG, armMat);
    cuff.position.y = -0.335;
    cuff.castShadow = true;
    arm.add(cuff);
    const glove = ball(0.115, 16, 12, gloveMat);
    glove.position.y = -0.42;
    glove.castShadow = true;
    arm.add(glove);
    arms[s > 0 ? 'L' : 'R'] = arm;
  });

  // 腿靴
  [1, -1].forEach(s => {
    const leg = new THREE.Group();
    leg.position.set(0.20 * s, 0, 0.02);
    bodyRoot.add(leg);
    const boot = new THREE.Mesh(new THREE.CapsuleGeometry(0.115, 0.14, 6, 14), plain(P.brown));
    boot.position.y = 0.185;
    boot.castShadow = true;
    leg.add(boot);
    const toeG = new THREE.SphereGeometry(1, 16, 12);
    toeG.scale(0.11, 0.075, 0.13);
    const toe = new THREE.Mesh(toeG, plain(P.cream));
    toe.position.set(0, 0.085, 0.11);
    toe.castShadow = true;
    leg.add(toe);
  });

  // 头
  const head = new THREE.Group();
  head.position.y = 1.55;
  bodyRoot.add(head);
  furBall(48, [0.50, 0.46, 0.48], P.orange, [0, 0, 0], head,
    [0.045, 8, 0.7, new THREE.Color(0xe0813c).lerp(new THREE.Color(0xffffff), 0.10), 0, 1.15]);
  furBall(24, [0.20, 0.15, 0.16], P.cream, [0, -0.10, 0.40], head, [0.05, 7, 0.55, new THREE.Color(0xffffff), 0, 1.3]);

  const nose = ball(0.055, 16, 12, plain(P.line, { roughness: 0.5 }));
  nose.position.set(0, -0.045, 0.545);
  nose.castShadow = true;
  head.add(nose);

  const mouthG = new THREE.TorusGeometry(0.055, 0.013, 8, 24, 2.2);
  const mouth = new THREE.Mesh(mouthG, plain(P.line));
  mouth.position.set(0, -0.12, 0.558);
  mouth.rotation.z = -Math.PI / 2 - 1.1;
  head.add(mouth);

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
    furBall(20, [0.17, 0.12, 0.10], P.cream, [0.345 * s, -0.02, 0.20], head,
      [0.07, 8, 0.45, new THREE.Color(0xffffff), 0, 1.8]);
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

  // 南瓜帽
  const hat = new THREE.Group();
  hat.position.set(0, 0.32, -0.02);
  hat.rotation.set(-0.05, 0, 0.07);
  head.add(hat);

  const gourd = new THREE.Group();
  gourd.rotation.set(-0.07, HAT_FACE_YAW, 0);
  hat.add(gourd);

  const pumpkinG = new THREE.SphereGeometry(0.5, 48, 32);
  {
    const pos = pumpkinG.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const r = v.length() * (1 + 0.055 * Math.cos(8 * Math.atan2(v.x, v.z)));
      v.setLength(r);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pumpkinG.scale(1, 0.72, 0.98);
    pumpkinG.computeVertexNormals();
  }
  const pumpkin = new THREE.Mesh(pumpkinG, new THREE.MeshStandardMaterial({ map: pumpkinTex, roughness: 0.92, metalness: 0 }));
  pumpkin.castShadow = true;
  gourd.add(pumpkin);

  const stemCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.30, 0), new THREE.Vector3(0.05, 0.42, 0.02), new THREE.Vector3(0.02, 0.50, 0.07),
  ]);
  const stemG = new THREE.TubeGeometry(stemCurve, 12, 0.045, 10, false);
  {
    const pos = stemG.attributes.position;
    const uv = stemG.attributes.uv;
    const p = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      const t = uv.getX(i);
      stemCurve.getPointAt(t, p);
      const k = 1 - 0.35 * t;
      pos.setXYZ(i, p.x + (pos.getX(i) - p.x) * k, pos.getY(i), p.z + (pos.getZ(i) - p.z) * k);
    }
    stemG.computeVertexNormals();
  }
  const stem = new THREE.Mesh(stemG, plain(P.stem, { roughness: 0.85 }));
  stem.castShadow = true;
  gourd.add(stem);

  const brimG = new THREE.TorusGeometry(0.47, 0.035, 14, 48);
  brimG.rotateX(Math.PI / 2);
  const brim = new THREE.Mesh(brimG, plain(P.brim));
  brim.position.y = -0.07;
  brim.castShadow = true;
  hat.add(brim);

  // 尾巴：曲线管 + 逐环半径 profile + 橙→奶白顶点色渐变
  const tail = new THREE.Group();
  tail.position.set(0, 0.62, -0.30);
  bodyRoot.add(tail);
  const tCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.30, 0.28, -0.28), new THREE.Vector3(0.62, 0.72, -0.28),
    new THREE.Vector3(0.80, 1.15, -0.05), new THREE.Vector3(0.72, 1.42, 0.18),
  ]);
  const prof = [0.10, 0.24, 0.32, 0.30, 0.14];
  const radAt = t => {
    const f = t * (prof.length - 1);
    const i = Math.min(prof.length - 2, Math.floor(f));
    const k = f - i;
    return prof[i] + (prof[i + 1] - prof[i]) * k * k * (3 - 2 * k);
  };
  const cTailRoot = new THREE.Color(0xe0813c).multiplyScalar(0.94);
  const cTailTip = new THREE.Color(0xfbf3e4);
  const cTmp = new THREE.Color();
  const tailColor = (t, out) => {
    if (t <= 0.52) return out.copy(cTailRoot);
    if (t >= 0.66) return out.copy(cTailTip);
    const k = (t - 0.52) / 0.14;
    return out.copy(cTailRoot).lerp(cTailTip, k * k * (3 - 2 * k));
  };
  const tubeG = new THREE.TubeGeometry(tCurve, 48, 1, 20, false);
  {
    const pos = tubeG.attributes.position;
    const uv = tubeG.attributes.uv;
    const cols = new Float32Array(pos.count * 3);
    const p = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      const t = uv.getX(i);
      tCurve.getPointAt(t, p);
      const s = radAt(t);
      pos.setXYZ(i, p.x + (pos.getX(i) - p.x) * s, p.y + (pos.getY(i) - p.y) * s, p.z + (pos.getZ(i) - p.z) * s);
      tailColor(t, cTmp);
      cols[i * 3] = cTmp.r; cols[i * 3 + 1] = cTmp.g; cols[i * 3 + 2] = cTmp.b;
    }
    tubeG.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  }
  const capG = (t, r, hex, shade) => {
    const g = new THREE.SphereGeometry(r, 20, 14);
    g.translate(tCurve.getPointAt(t).x, tCurve.getPointAt(t).y, tCurve.getPointAt(t).z);
    return fill(g, hex, shade);
  };
  const tailGeo = mergeGeometries([tubeG, capG(0, 0.10, 0xe0813c, 0.94), capG(1, 0.13, 0xfbf3e4, 1)]);
  tailGeo.computeVertexNormals();
  const tailMesh = new THREE.Mesh(tailGeo, furMat);
  tailMesh.scale.setScalar(1.15);
  tailMesh.castShadow = true;
  tail.add(tailMesh);
  furTargets.push({ mesh: tailMesh, length: 0.20, shells: 16, density: 0.42, tint: new THREE.Color(0xfbf3e4), order: 10, maxScale: 2.0 });

  function dispose() {
    group.traverse(o => {
      if (o.isMesh) {
        o.geometry.dispose();
        if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
        else o.material.dispose();
      }
    });
    plaidTex.dispose();
    pumpkinTex.dispose();
  }

  return {
    group,
    pivots: { bodyRoot, head, earL: earPivots.L, earR: earPivots.R, tail, armL: arms.L, armR: arms.R },
    eyes,
    furTargets,
    dispose,
  };
}
