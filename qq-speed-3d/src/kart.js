import * as THREE from 'three';

function roundedBox(w, h, d, r, seg = 3) {
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
  if (r <= 0) return g;
  const pos = g.attributes.position;
  const hw = w / 2 - r;
  const hh = h / 2 - r;
  const hd = d / 2 - r;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const cx = THREE.MathUtils.clamp(v.x, -hw, hw);
    const cy = THREE.MathUtils.clamp(v.y, -hh, hh);
    const cz = THREE.MathUtils.clamp(v.z, -hd, hd);
    const dx = v.x - cx, dy = v.y - cy, dz = v.z - cz;
    const len = Math.hypot(dx, dy, dz);
    if (len > 1e-6) {
      const k = r / len;
      v.set(cx + dx * k, cy + dy * k, cz + dz * k);
    }
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function limb(a, b, radius, mat) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(radius, radius * 0.88, len, 8, 1);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
}

function badgeTexture(number, primary, accent) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(64, 64, 58, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = primary;
  ctx.beginPath();
  ctx.arc(64, 64, 48, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 58px "Arial Black",sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(number), 64, 68);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function radialTexture(dark) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  if (dark) {
    g.addColorStop(0, 'rgba(0,8,16,.58)');
    g.addColorStop(0.55, 'rgba(0,8,16,.28)');
    g.addColorStop(1, 'rgba(0,8,16,0)');
  } else {
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,250,220,.65)');
    g.addColorStop(1, 'rgba(255,220,150,0)');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(cv);
  if (!dark) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function blobShadowTexture() { return radialTexture(true); }

let shared = null;
function sharedAssets() {
  if (shared) return shared;
  shared = {
    tireGeoF: new THREE.CylinderGeometry(0.3, 0.3, 0.26, 16, 1),
    tireGeoR: new THREE.CylinderGeometry(0.33, 0.33, 0.29, 16, 1),
    rimGeoF: new THREE.CylinderGeometry(0.165, 0.165, 0.275, 12, 1),
    rimGeoR: new THREE.CylinderGeometry(0.185, 0.185, 0.305, 12, 1),
    hubGeo: new THREE.CylinderGeometry(0.055, 0.055, 0.32, 8, 1),
    flameOuter: new THREE.ConeGeometry(0.17, 0.95, 10, 1, true),
    flameInner: new THREE.ConeGeometry(0.095, 0.62, 8, 1, true),
    shadowTex: blobShadowTexture(),
    glowTex: radialTexture(false),
  };
  shared.tireGeoF.rotateZ(Math.PI / 2);
  shared.tireGeoR.rotateZ(Math.PI / 2);
  shared.rimGeoF.rotateZ(Math.PI / 2);
  shared.rimGeoR.rotateZ(Math.PI / 2);
  shared.hubGeo.rotateZ(Math.PI / 2);
  return shared;
}

export function createKart(colors, opts = {}) {
  const S = sharedAssets();
  const detail = opts.detail !== false;
  const flameTex = opts.flameTex || null;
  const group = new THREE.Group();
  const lean = new THREE.Group();
  group.add(lean);

  const paint = new THREE.MeshStandardMaterial({
    color: colors.primary, metalness: 0.22, roughness: 0.32,
  });
  const paint2 = new THREE.MeshStandardMaterial({
    color: colors.secondary, metalness: 0.18, roughness: 0.4,
  });
  const accent = new THREE.MeshStandardMaterial({
    color: colors.accent, metalness: 0.35, roughness: 0.25,
    emissive: new THREE.Color(colors.accent).multiplyScalar(0.18),
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x121a24, metalness: 0.15, roughness: 0.7 });
  const tire = new THREE.MeshStandardMaterial({ color: 0x0c0f14, roughness: 0.92, metalness: 0.02 });
  const rim = new THREE.MeshStandardMaterial({ color: colors.accent, metalness: 0.72, roughness: 0.24 });
  const hub = new THREE.MeshStandardMaterial({ color: 0xe8f4ff, metalness: 0.8, roughness: 0.2 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0a2438, metalness: 0.6, roughness: 0.12 });
  const suit = new THREE.MeshStandardMaterial({ color: colors.suit || colors.secondary, roughness: 0.75 });
  const helmet = new THREE.MeshStandardMaterial({ color: colors.helmet || 0xf7f9ff, metalness: 0.15, roughness: 0.35 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xf3c9a8, roughness: 0.8 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xc9fbff, toneMapped: false });

  const add = (mesh, cast = true) => {
    mesh.castShadow = cast;
    mesh.receiveShadow = false;
    lean.add(mesh);
    return mesh;
  };

  const chassis = add(new THREE.Mesh(roundedBox(1.52, 0.34, 2.0, 0.14, 3), paint));
  chassis.position.set(0, 0.43, 0.02);

  const nose = add(new THREE.Mesh(roundedBox(1.14, 0.23, 0.78, 0.1, 2), paint2));
  nose.position.set(0, 0.4, 1.12);
  nose.scale.set(0.92, 1, 1);

  const noseTip = add(new THREE.Mesh(roundedBox(0.86, 0.16, 0.24, 0.07, 2), accent));
  noseTip.position.set(0, 0.37, 1.5);

  const cockpit = add(new THREE.Mesh(roundedBox(0.8, 0.26, 0.86, 0.12, 2), dark));
  cockpit.position.set(0, 0.67, -0.12);

  const seat = add(new THREE.Mesh(roundedBox(0.54, 0.44, 0.16, 0.07, 2), dark));
  seat.position.set(0, 0.79, -0.5);
  seat.rotation.x = -0.14;

  for (const side of [-1, 1]) {
    const pod = add(new THREE.Mesh(roundedBox(0.3, 0.27, 1.08, 0.1, 2), paint2));
    pod.position.set(side * 0.86, 0.46, 0.02);
    const stripe = add(new THREE.Mesh(roundedBox(0.05, 0.1, 0.9, 0.02, 1), accent), false);
    stripe.position.set(side * 1.01, 0.5, 0.05);
    const badgeTex = badgeTexture(colors.number || 1, colors.primary, colors.accent);
    const badgeMat = new THREE.MeshBasicMaterial({ map: badgeTex, transparent: true });
    const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26), badgeMat);
    badge.position.set(side * 1.015, 0.44, -0.28);
    badge.rotation.y = side * Math.PI / 2;
    lean.add(badge);
  }

  const frontWing = add(new THREE.Mesh(roundedBox(1.86, 0.07, 0.3, 0.03, 1), accent));
  frontWing.position.set(0, 0.3, 1.62);

  const rearBumper = add(new THREE.Mesh(roundedBox(1.62, 0.18, 0.22, 0.05, 2), dark));
  rearBumper.position.set(0, 0.35, -1.02);

  const spoiler = add(new THREE.Mesh(roundedBox(1.72, 0.065, 0.38, 0.02, 1), accent));
  spoiler.position.set(0, 1.12, -1.13);
  spoiler.rotation.x = -0.06;
  const struts = [];
  const endplates = [];
  for (const side of [-1, 1]) {
    const strut = add(new THREE.Mesh(roundedBox(0.07, 0.36, 0.09, 0.02, 1), dark));
    strut.position.set(side * 0.52, 0.92, -1.1);
    struts.push(strut);
    const endplate = add(new THREE.Mesh(roundedBox(0.05, 0.24, 0.42, 0.02, 1), paint));
    endplate.position.set(side * 0.88, 1.11, -1.13);
    endplates.push(endplate);
  }

  for (const side of [-1, 1]) {
    const light = add(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.09, 0.05), glowMat), false);
    light.position.set(side * 0.42, 0.49, 1.53);
    const tail = add(new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.055, 0.045), new THREE.MeshBasicMaterial({
      color: colors.accent, toneMapped: false,
    })), false);
    tail.position.set(0, 0.56, -1.12);
  }

  // exhaust pipes
  const pipes = [];
  for (const side of [-1, 1]) {
    const pipe = add(new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.075, 0.34, 10), hub));
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(side * 0.38, 0.44, -1.13);
    pipes.push(pipe);
  }

  if (detail) {
    const torso = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.3, 4, 10), suit));
    torso.position.set(0, 0.98, -0.2);
    torso.rotation.x = -0.12;
    const head = add(new THREE.Mesh(new THREE.SphereGeometry(0.225, 18, 14), helmet));
    head.position.set(0, 1.23, -0.08);
    const visor = add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 10), glass), false);
    visor.position.set(0, 1.22, 0.01);
    visor.scale.set(0.92, 0.55, 0.72);
    const helmetStripe = add(new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.022, 6, 18, Math.PI), accent), false);
    helmetStripe.position.set(0, 1.24, -0.07);
    helmetStripe.rotation.set(Math.PI / 2, 0, 0);
    const wheel = add(new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.032, 8, 18), dark), false);
    wheel.position.set(0, 0.82, 0.36);
    wheel.rotation.x = 1.18;
    const hubcap = add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 8), hub), false);
    hubcap.position.set(0, 0.8, 0.4);
    hubcap.rotation.x = 1.18;
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Vector3(side * 0.21, 0.99, -0.18);
      const hand = new THREE.Vector3(side * 0.12, 0.84, 0.33);
      add(limb(shoulder, hand, 0.055, suit), false);
      const glove = add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), dark), false);
      glove.position.copy(hand);
    }
  }

  // wheels
  const wheels = [];
  for (const [z, front] of [[0.84, true], [-0.76, false]]) {
    for (const side of [-1, 1]) {
      const steerGroup = new THREE.Group();
      steerGroup.position.set(side * 0.79, front ? 0.31 : 0.33, z);
      group.add(steerGroup);
      const spin = new THREE.Group();
      steerGroup.add(spin);
      const tireMesh = new THREE.Mesh(front ? S.tireGeoF : S.tireGeoR, tire);
      tireMesh.castShadow = true;
      spin.add(tireMesh);
      const rimMesh = new THREE.Mesh(front ? S.rimGeoF : S.rimGeoR, rim);
      spin.add(rimMesh);
      const hubMesh = new THREE.Mesh(S.hubGeo, hub);
      spin.add(hubMesh);
      wheels.push({ steerGroup, spin, side, front });
    }
  }

  // exhaust flames
  const flames = [];
  for (const side of [-1, 1]) {
    const fg = new THREE.Group();
    fg.position.set(side * 0.38, 0.44, -1.3);
    const outerMat = new THREE.MeshBasicMaterial({
      color: 0xff8a2a, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      map: flameTex || null,
    });
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0xfff4c2, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      map: flameTex || null,
    });
    const outer = new THREE.Mesh(S.flameOuter, outerMat);
    outer.rotation.x = -Math.PI / 2;
    const inner = new THREE.Mesh(S.flameInner, innerMat);
    inner.rotation.x = -Math.PI / 2;
    fg.add(outer, inner);
    const glowMatF = new THREE.SpriteMaterial({
      map: S.glowTex, color: 0xff9a3a, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const glow = new THREE.Sprite(glowMatF);
    glow.scale.set(1.1, 1.1, 1);
    glow.position.set(0, 0, -0.2);
    fg.add(glow);
    fg.visible = false;
    lean.add(fg);
    flames.push({ group: fg, outerMat, innerMat, glowMat: glowMatF, outer, inner, glow });
  }

  const shadowMat = new THREE.MeshBasicMaterial({
    map: S.shadowTex, transparent: true, opacity: 0.42,
    depthWrite: false, toneMapped: false,
  });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.35, 3.1), shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.renderOrder = 2;
  group.add(shadow);

  return {
    group, lean, wheels, flames, shadow,
    parts: { spoiler, struts, endplates, pipes, paint, accent, rim, tire, noseTip, frontWing },
    glow: null,
    flameBoost: 1,
    colors,
    steerVisual: 0,
    leanZ: 0,
    leanX: 0,
    wheelSpin: 0,
    flameLevel: 0,
    nitro: false,
  };
}

// ---------------------------------------------------------------------------
// 改装可视化 — the player's tuning levels are mirrored on the model: taller
// wing, fatter pipes, brighter rims, wider rear tyres and a neon underglow.
// AI karts never call this, so the garage reads as a personal upgrade.
// ---------------------------------------------------------------------------
export function applyKartTuning(kart, tuning) {
  if (!kart || !kart.parts) return;
  const t = tuning || {};
  const P = kart.parts;
  const spoilerK = THREE.MathUtils.clamp(t.spoiler || 0, 0, 1);
  const pipeK = THREE.MathUtils.clamp(t.pipe || 0, 0, 1);
  const rimK = THREE.MathUtils.clamp(t.rim || 0, 0, 1);
  const tyreK = THREE.MathUtils.clamp(t.tyre || 0, 0, 1);
  const glowK = THREE.MathUtils.clamp(t.glow || 0, 0, 1);
  const wingK = THREE.MathUtils.clamp(t.wing || 0, 0, 1);

  // wing: wider + taller + a second stacked plane on the last level
  const w = 1 + spoilerK * 0.22 + wingK * 0.08;
  P.spoiler.scale.set(w, 1 + spoilerK * 0.9, 1 + spoilerK * 0.5);
  P.spoiler.position.y = 1.12 + spoilerK * 0.1;
  P.struts.forEach((m) => { m.scale.y = 1 + spoilerK * 0.7; m.position.y = 0.92 + spoilerK * 0.1; });
  P.endplates.forEach((m) => {
    m.scale.set(1, 1 + spoilerK * 0.55, 1 + spoilerK * 0.3);
    m.position.set(m.position.x, 1.11 + spoilerK * 0.12, m.position.z);
  });

  // pipes: fatter and longer
  P.pipes.forEach((m) => {
    m.scale.set(1 + pipeK * 0.5, 1 + pipeK * 0.35, 1 + pipeK * 0.6);
    m.position.z = -1.13 - pipeK * 0.12;
  });

  // wheels: brighter rims + fatter rear tyres
  for (const wheel of kart.wheels) {
    wheel.steerGroup.scale.setScalar(1 + tyreK * 0.09);
  }
  if (P.rim) {
    P.rim.emissive = P.rim.emissive || new THREE.Color(0x000000);
    P.rim.emissive.setHex(0x2b6bff);
    P.rim.emissiveIntensity = rimK * 1.5;
  }

  // paint: neon underglow that rides with the chassis
  if (!kart.glow && glowK > 0) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x27dcff, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const geo = new THREE.PlaneGeometry(3.4, 4.2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.02;
    mesh.renderOrder = 3;
    kart.group.add(mesh);
    kart.glow = mesh;
  }
  if (kart.glow) {
    kart.glow.visible = glowK > 0;
    kart.glow.material.opacity = 0.16 + glowK * 0.34;
    const col = kart.colors.accent || 0x27dcff;
    kart.glow.material.color.setHex(glowK > 0.85 ? 0xff5ecd : col);
  }

  // turbo flame tint (turbo level makes the exhaust burn brighter)
  kart.flameBoost = 1 + (t.flame || 0) * 0.45;
}

export function animateKart(kart, dt, s) {
  const speedNorm = THREE.MathUtils.clamp(s.speedNorm || 0, 0, 1.35);
  const steer = THREE.MathUtils.clamp(s.steer || 0, -1, 1);
  const drifting = !!s.drifting;
  const driftDir = s.driftDir || 0;
  const boost = THREE.MathUtils.clamp(s.flameLevel || 0, 0, 3);
  const offroad = !!s.offroad;

  kart.wheelSpin += dt * (2.2 + speedNorm * 17) * (s.braking ? 0.4 : 1);
  for (const w of kart.wheels) {
    w.spin.rotation.x = kart.wheelSpin;
    if (w.front) {
      const target = steer * 0.44 + (drifting ? driftDir * 0.2 : 0);
      w.steerGroup.rotation.y += (target - w.steerGroup.rotation.y) * Math.min(1, dt * 12);
    }
  }

  const targetLeanZ = drifting
    ? -driftDir * 0.16 - steer * 0.055
    : -steer * 0.075;
  const targetLeanX = THREE.MathUtils.clamp((s.accel || 0) * -0.032 + (s.braking ? 0.05 : 0), -0.05, 0.06);
  kart.leanZ += (targetLeanZ - kart.leanZ) * Math.min(1, dt * 8);
  kart.leanX += (targetLeanX - kart.leanX) * Math.min(1, dt * 7);
  kart.lean.rotation.z = kart.leanZ;
  kart.lean.rotation.x = kart.leanX;

  const bob = Math.sin(performance.now() * 0.012 + (kart.colors.number || 0)) * (0.008 + speedNorm * 0.012);
  const shake = boost > 0 ? (Math.random() - 0.5) * 0.006 * boost : 0;
  kart.lean.position.y = bob + shake * 0.5;
  kart.lean.position.x = shake;

  const flameBase = speedNorm > 0.02 || s.rev ? 0.34 + speedNorm * 0.22 : 0;
  const flameTarget = Math.max(flameBase, boost > 0 ? 1.15 + boost * 0.34 : 0) * (kart.flameBoost || 1);
  kart.flameLevel += (flameTarget - kart.flameLevel) * Math.min(1, dt * 12);
  const nitro = !!s.nitro;
  for (let i = 0; i < kart.flames.length; i++) {
    const f = kart.flames[i];
    const visible = kart.flameLevel > 0.08;
    f.group.visible = visible;
    if (!visible) continue;
    const flick = 0.82 + Math.random() * 0.38;
    const len = kart.flameLevel * flick;
    f.group.scale.set(0.85 + boost * 0.12, 0.85 + boost * 0.12, 0.6 + len * 0.95);
    f.group.position.x = (i === 0 ? -0.38 : 0.38) + (Math.random() - 0.5) * 0.02;
    f.outerMat.opacity = Math.min(0.95, 0.35 + kart.flameLevel * 0.3);
    f.innerMat.opacity = Math.min(1, 0.5 + kart.flameLevel * 0.36);
    f.glowMat.opacity = Math.min(0.8, kart.flameLevel * 0.32);
    if (nitro) {
      f.outerMat.color.setHex(0x39d8ff);
      f.innerMat.color.setHex(0xe6feff);
      f.glowMat.color.setHex(0x39d8ff);
      f.glow.scale.setScalar(1.8 + Math.random() * 0.3);
    } else if (boost > 1.2) {
      f.outerMat.color.setHex(0xffb02e);
      f.innerMat.color.setHex(0xfff6d6);
      f.glowMat.color.setHex(0xffa42e);
      f.glow.scale.setScalar(1.4 + Math.random() * 0.25);
    } else {
      f.outerMat.color.setHex(0xff7a2a);
      f.innerMat.color.setHex(0xffe6ae);
      f.glowMat.color.setHex(0xff8a3a);
      f.glow.scale.setScalar(1.0 + Math.random() * 0.15);
    }
  }

  if (offroad) {
    kart.lean.position.y += Math.sin(performance.now() * 0.08) * 0.012;
  }
  kart.shadow.scale.setScalar(1 + Math.min(0.25, speedNorm * 0.18));
}

export function kartWheelWorld(kart, front, side, out) {
  // local wheel position transformed by the kart group (world matrix is current)
  const z = front ? 0.84 : -0.76;
  out.set(side * 0.79, 0.12, z);
  kart.group.localToWorld(out);
  return out;
}
