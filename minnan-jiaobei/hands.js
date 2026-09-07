import * as THREE from "three";

// Stylised hands that cradle the jiaobei cups ("双手捧杯").
// One hand is parented under each cup group, so while the physics layer holds
// the cups above the tray the hands ride along; release() unparents them
// (keeping their world transforms) and fades them out. Scene scale: 1 unit ≈
// 6 cm. A cup's flat face lies on its group's local y=0 plane, so each palm
// rests just beneath that plane with the cup lying on it.

const SKIN = 0xbf8a60; // renders as a warm #e2b48c-ish tan under the scene lights
const SLEEVE = 0x902c1f; // deep red that reads as the theme #a8392a once lit
const FADE_MS = 350;
// Palm centre offset in cup-local space: just under the cup's flat face.
const PALM_POS = new THREE.Vector3(0, -0.55, 0);

function matte(color, roughness) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0,
    transparent: true,
    opacity: 0,
  });
}

function part(geometry, material, parent) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

// Rounded rectangle outline for the palm slab.
function palmShape(w, d, r) {
  const s = new THREE.Shape();
  const x = w / 2,
    y = d / 2;
  s.moveTo(-x + r, -y);
  s.lineTo(x - r, -y);
  s.quadraticCurveTo(x, -y, x, -y + r);
  s.lineTo(x, y - r);
  s.quadraticCurveTo(x, y, x - r, y);
  s.lineTo(-x + r, y);
  s.quadraticCurveTo(-x, y, -x, y - r);
  s.lineTo(-x, -y + r);
  s.quadraticCurveTo(-x, -y, -x + r, -y);
  return s;
}

// side: -1 builds the left hand (rides the cup resting at negative x), +1 the
// mirrored right hand. Palm up under the cup, thumb rising on the inner flank
// so the two thumbs face each other, wrist and red sleeve cuff angling down
// and outward like a worshipper's arms.
function buildHand(side) {
  const hand = new THREE.Group();
  hand.name = side < 0 ? "cup-hand-left" : "cup-hand-right";
  const skin = matte(SKIN, 0.65);
  const cuff = matte(SLEEVE, 0.9);
  hand.userData.materials = [skin, cuff];
  const inner = -side; // direction toward the centre line between the cups

  // Slight toe-in yaw so the pair reads as cupped hands, not parallel planks.
  hand.rotation.y = inner * 0.12;
  hand.userData.baseRotation = hand.rotation.clone();

  // Palm — a flat rounded slab (a pressed-open palm); its flat top carries the
  // cup's flat face. Nudged outward so the cup's off-centre footprint sits
  // balanced and the two palms just meet at the centre line.
  const bevel = 0.24;
  const palmGeo = new THREE.ExtrudeGeometry(palmShape(3.2 - bevel * 2, 2.5 - bevel * 2, 0.85), {
    depth: 0.95 - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 7,
    curveSegments: 20,
    steps: 1,
  });
  palmGeo.rotateX(Math.PI / 2); // shape (x,y) → palm (x,z), extrusion → thickness (y)
  palmGeo.center();
  palmGeo.translate(side * 0.1, 0, 0);
  part(palmGeo, skin, hand);

  // Knuckles peeking along the far edge, curled under the cup rim.
  for (const kx of [-0.8, -0.27, 0.26, 0.79]) {
    const knuckle = part(new THREE.SphereGeometry(0.26, 16, 12), skin, hand);
    knuckle.position.set(kx + side * 0.1, 0.29, -1.0);
    knuckle.scale.set(1, 0.85, 0.9);
  }

  // Thenar pad on the thumb side.
  const thenar = part(new THREE.SphereGeometry(0.5, 18, 14), skin, hand);
  thenar.position.set(inner * 1.0, 0.08, 0.55);
  thenar.scale.set(0.72, 0.5, 0.95);

  // Heel of the hand, blending the palm into the wrist.
  const heel = part(new THREE.SphereGeometry(0.55, 20, 14), skin, hand);
  heel.position.set(side * 1.4, -0.1, 0);
  heel.scale.set(0.75, 0.42, 1.0);

  // Thumb — a capsule rising along the cup's inner flank, tips facing each
  // other. Kept beside the cup's tapering end so it never clips the wood.
  const thumb = part(new THREE.CapsuleGeometry(0.26, 0.55, 6, 14), skin, hand);
  thumb.position.set(inner * 1.02, 0.58, 0.8);
  thumb.rotation.z = -inner * 0.5;
  thumb.rotation.x = -0.3;

  // Wrist — a short cylinder angling down and away from the palm.
  const wristTilt = side * 0.78; // top end leans inward, bottom outward
  const axis = new THREE.Vector3(-Math.sin(wristTilt), Math.cos(wristTilt), 0);
  const wrist = part(new THREE.CylinderGeometry(0.5, 0.56, 1.6, 20), skin, hand);
  wrist.position.set(side * 1.45, -0.75, 0);
  wrist.rotation.z = wristTilt;

  // Sleeve cuff — deep red, hinting at the worshipper's garment.
  const cuffMesh = part(new THREE.CylinderGeometry(0.63, 0.67, 0.55, 20), cuff, hand);
  cuffMesh.position.copy(wrist.position).addScaledVector(axis, -0.7);
  cuffMesh.quaternion.copy(wrist.quaternion);

  return hand;
}

function setOpacity(hand, opacity) {
  for (const material of hand.userData.materials) material.opacity = opacity;
}

export class CupHands {
  constructor(scene) {
    this.scene = scene;
    this._attached = false;
    this._gen = 0; // invalidates a running fade when attach() intervenes
    this._hands = [buildHand(-1), buildHand(1)];
    for (const hand of this._hands) {
      hand.visible = false;
      scene.add(hand);
    }
  }

  // Parent one hand under each cup (index 0 → left/negative x). Hands mount
  // hidden; the reveal is driven by setReveal().
  attach(cups) {
    this._gen++; // cancel any in-flight release fade
    this._attached = true;
    cups.slice(0, 2).forEach((cup, i) => {
      const hand = this._hands[i];
      hand.visible = false;
      setOpacity(hand, 0);
      cup.add(hand);
      hand.position.copy(PALM_POS);
      hand.rotation.copy(hand.userData.baseRotation);
    });
  }

  // t < 0.5 → invisible; 0.5 → 0.95 fades linearly up to full opacity.
  // No-op once released, so a late call can't resurrect fading hands.
  setReveal(t) {
    if (!this._attached) return;
    const k = t <= 0.5 ? 0 : t >= 0.95 ? 1 : (t - 0.5) / 0.45;
    for (const hand of this._hands) {
      hand.visible = k > 0;
      setOpacity(hand, k);
    }
  }

  // Let go: unparent into the scene keeping world transforms, fade out over
  // ~350 ms, then hide. Safe to call repeatedly.
  release() {
    if (!this._attached) return;
    this._attached = false;
    const gen = ++this._gen;
    for (const hand of this._hands)
      if (hand.parent !== this.scene) this.scene.attach(hand);
    const start = performance.now();
    const step = () => {
      if (gen !== this._gen) return; // superseded by attach()
      const k = Math.min((performance.now() - start) / FADE_MS, 1);
      for (const hand of this._hands) setOpacity(hand, 1 - k);
      if (k < 1) requestAnimationFrame(step);
      else for (const hand of this._hands) hand.visible = false;
    };
    requestAnimationFrame(step);
  }

  dispose() {
    this._gen++;
    this._attached = false;
    for (const hand of this._hands) {
      hand.removeFromParent();
      hand.traverse((o) => {
        if (o.isMesh) o.geometry.dispose();
      });
      for (const material of hand.userData.materials) material.dispose();
    }
  }
}
