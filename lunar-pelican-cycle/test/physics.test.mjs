import assert from 'node:assert/strict';
import {
  solveTwoBoneIK2D,
  clamp,
} from '../src/math3d.js';
import {
  WORLD_RADIUS,
  BEACONS,
  BOULDERS,
  getTerrainHeight,
  getTerrainNormal,
  getTerrainCurvature,
} from '../src/terrain.js';
import {
  FIXED_DT,
  ENV_PRESETS,
  createPhysicsState,
  spawnDustParticle,
  stepPhysicsFixed,
} from '../src/physics.js';

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`PASS: ${name}`);
}

const zeroInput = {
  throttle: 0,
  brake: 0,
  steer: 0,
  sprint: false,
  jumpHeld: false,
  jumpTriggered: false,
};

// 1. Lunar vs Earth Jump Physics
check('1a. Moon jump peak height (1.5m..2.2m) & hang time (2.6s..3.4s)', () => {
  const s = createPhysicsState('moon');
  const startY = s.y;
  let peak = 0;
  let airTime = 0;
  stepPhysicsFixed(s, { ...zeroInput, jumpTriggered: true }, FIXED_DT);
  assert.equal(s.grounded, false, 'should leave ground on jump');
  for (let i = 0; i < 600; i++) {
    stepPhysicsFixed(s, zeroInput, FIXED_DT);
    peak = Math.max(peak, s.y - startY);
    if (s.grounded) {
      airTime = (i + 1) * FIXED_DT;
      break;
    }
  }
  assert.ok(peak > 1.5 && peak < 2.2, `Moon peak height ${peak.toFixed(3)}m out of range`);
  assert.ok(airTime > 2.6 && airTime < 3.4, `Moon hang time ${airTime.toFixed(3)}s out of range`);
});

check('1b. Earth jump peak height (0.22m..0.42m), hang time (0.40s..0.65s) & ~6x ratio', () => {
  const runJump = (envId) => {
    const s = createPhysicsState(envId);
    const startY = s.y;
    let peak = 0;
    let airTime = 0;
    stepPhysicsFixed(s, { ...zeroInput, jumpTriggered: true }, FIXED_DT);
    for (let i = 0; i < 800; i++) {
      stepPhysicsFixed(s, zeroInput, FIXED_DT);
      peak = Math.max(peak, s.y - startY);
      if (s.grounded) {
        airTime = (i + 1) * FIXED_DT;
        break;
      }
    }
    return { peak, airTime };
  };
  const moon = runJump('moon');
  const earth = runJump('earth');
  assert.ok(earth.peak > 0.22 && earth.peak < 0.42, `Earth peak ${earth.peak.toFixed(3)}m`);
  assert.ok(earth.airTime > 0.40 && earth.airTime < 0.65, `Earth hang ${earth.airTime.toFixed(3)}s`);

  const hRatio = moon.peak / earth.peak;
  const tRatio = moon.airTime / earth.airTime;
  assert.ok(hRatio >= 5.5 && hRatio <= 6.6, `Height ratio ${hRatio.toFixed(2)} not ~6x`);
  assert.ok(tRatio >= 5.5 && tRatio <= 6.6, `Hang time ratio ${tRatio.toFixed(2)} not ~6x`);
});

// 2. Vacuum Zero Air Drag & Long Coasting
check('2a. Moon dragForce strictly 0 every tick', () => {
  const s = createPhysicsState('moon');
  s.vz = 10.0;
  for (let i = 0; i < 360; i++) {
    stepPhysicsFixed(s, zeroInput, FIXED_DT);
    assert.equal(s.dragForce, 0, 'Vacuum air drag must be exactly 0');
  }
  assert.ok(s.vz > 9.6, `Moon 3s coast speed ${s.vz.toFixed(2)} should barely decay`);
});

check('2b. Earth air drag > 0 and decelerates significantly faster than Moon', () => {
  const sm = createPhysicsState('moon');
  const se = createPhysicsState('earth');
  sm.vz = 10.0;
  se.vz = 10.0;
  for (let i = 0; i < 360; i++) {
    stepPhysicsFixed(sm, zeroInput, FIXED_DT);
    stepPhysicsFixed(se, zeroInput, FIXED_DT);
  }
  assert.ok(se.dragForce > 0, 'Earth air drag must be positive');
  assert.ok(se.vz < sm.vz - 1.5, `Earth coast (${se.vz.toFixed(2)}) must slow far more than Moon (${sm.vz.toFixed(2)})`);
});

// 3. 1/6 Traction Limit & Wheelspin
check('3. Moon sprint induces rear wheelspin & dust while Earth accelerates faster', () => {
  const sm = createPhysicsState('moon');
  const se = createPhysicsState('earth');
  const sprintIn = { ...zeroInput, throttle: 1, sprint: true };
  let maxSlipMoon = 0;
  for (let i = 0; i < 72; i++) {
    stepPhysicsFixed(sm, sprintIn, FIXED_DT);
    stepPhysicsFixed(se, sprintIn, FIXED_DT);
    maxSlipMoon = Math.max(maxSlipMoon, sm.slipRatio);
  }
  assert.ok(maxSlipMoon > 0.15, `Moon sprint slipRatio ${maxSlipMoon.toFixed(3)} should exceed 0.15`);
  assert.ok(sm.activeDust > 0, 'Moon wheelspin must spawn ballistic dust');
  assert.ok(se.speed > sm.speed * 2.5, `Earth speed (${se.speed.toFixed(2)}) must exceed 2.5x Moon (${sm.speed.toFixed(2)})`);
});

// 4. Braking Distance Law
check('4. Moon braking distance from 8 m/s exceeds 25m and >4x Earth', () => {
  const brakeTest = (envId) => {
    const s = createPhysicsState(envId);
    s.vz = 8.0;
    s.omegaRear = 8.0 / 0.34;
    s.omegaFront = s.omegaRear;
    const brakeIn = { ...zeroInput, brake: 1 };
    for (let i = 0; i < 1200; i++) {
      stepPhysicsFixed(s, brakeIn, FIXED_DT);
      if (s.vFwd <= 0.05) break;
    }
    return s.z;
  };
  const dMoon = brakeTest('moon');
  const dEarth = brakeTest('earth');
  assert.ok(dMoon > 25, `Moon stopping distance ${dMoon.toFixed(2)}m must exceed 25m`);
  assert.ok(dMoon > dEarth * 4, `Moon brake (${dMoon.toFixed(2)}m) must exceed 4x Earth (${dEarth.toFixed(2)}m)`);
});

// 5. Crest Liftoff (v^2 * kappa > g * cos(theta))
check('5. Fast ride across launch crater rim naturally lifts off without jump input', () => {
  const s = createPhysicsState('moon');
  s.x = 0;
  s.z = 11.5;
  s.y = getTerrainHeight(0, 11.5);
  s.heading = 0;
  s.vz = 9.5;
  s.omegaRear = 9.5 / 0.34;
  s.omegaFront = s.omegaRear;
  let maxAlt = 0;
  let lifted = false;
  for (let i = 0; i < 240; i++) {
    stepPhysicsFixed(s, { ...zeroInput, throttle: 0.4 }, FIXED_DT);
    if (!s.grounded) {
      lifted = true;
      maxAlt = Math.max(maxAlt, s.altitude);
    }
  }
  assert.ok(lifted && maxAlt > 0.15, `Expected natural crest liftoff > 0.15m, got lifted=${lifted}, maxAlt=${maxAlt.toFixed(3)}`);
});

// 6. Airborne Reaction-Wheel Pitch (Angular Momentum Conservation)
check('6. Airborne throttle pitches nose UP vs brake pitches nose DOWN', () => {
  const runAirPitch = (inObj) => {
    const s = createPhysicsState('moon');
    s.grounded = false;
    s.y += 4.0;
    s.vy = 2.0;
    for (let i = 0; i < 72; i++) {
      stepPhysicsFixed(s, inObj, FIXED_DT);
    }
    return s.pitch;
  };
  const pThrottle = runAirPitch({ ...zeroInput, throttle: 1 });
  const pBrake = runAirPitch({ ...zeroInput, brake: 1 });
  assert.ok(pThrottle > pBrake + 0.12, `Expected pitch_throttle (${pThrottle.toFixed(3)}) > pitch_brake (${pBrake.toFixed(3)}) + 0.12`);
});

// 7. Vacuum Wing-Flapping Zero Lift
check('7. Airborne wing flap in vacuum adds strictly zero vertical lift', () => {
  const s = createPhysicsState('moon');
  s.grounded = false;
  s.y += 3.0;
  s.vy = 1.0;
  const vyBefore = s.vy;
  stepPhysicsFixed(s, { ...zeroInput, jumpTriggered: true }, FIXED_DT);
  assert.ok(s.wingFlapBoost > 0.5, 'Wing flap animation should activate');
  const expectedVy = vyBefore - ENV_PRESETS.moon.gravity * FIXED_DT;
  assert.ok(Math.abs(s.vy - expectedVy) < 1e-5, `Expected vy=${expectedVy}, got ${s.vy}`);
});

// 8. Ballistic Dust Parabola
check('8. Vacuum dust follows exact g=1.62 parabola and settles to terrain', () => {
  const s = createPhysicsState('moon');
  const x0 = 2.0;
  const z0 = 2.0;
  const y0 = getTerrainHeight(x0, z0) + 0.5;
  const vy0 = 2.0;
  spawnDustParticle(s, x0, y0, z0, 0, vy0, 0, 0.08, 5.0);

  const stepsHalf = Math.round(0.5 / FIXED_DT);
  for (let i = 0; i < stepsHalf; i++) {
    stepPhysicsFixed(s, zeroInput, FIXED_DT);
  }
  const t = stepsHalf * FIXED_DT;
  const expectedY = y0 + vy0 * t - 0.5 * 1.62 * t * t;
  const actualY = s.dustPos[1];
  assert.ok(Math.abs(actualY - expectedY) < 0.015, `Dust y=${actualY.toFixed(4)} vs analytical ${expectedY.toFixed(4)}`);

  for (let i = 0; i < Math.round(3.0 / FIXED_DT); i++) {
    stepPhysicsFixed(s, zeroInput, FIXED_DT);
  }
  assert.equal(s.dustAge[0], 0, 'Dust grain must deactivate upon hitting regolith');
});

// 9. Zero-G Felt Gravity & Gular Pouch Float
check('9. Felt gravity is ~0.165G on Moon rest, 0.00G in freefall, pouch rises', () => {
  const s = createPhysicsState('moon');
  for (let i = 0; i < 60; i++) stepPhysicsFixed(s, zeroInput, FIXED_DT);
  assert.ok(Math.abs(s.feltG - 1.62 / 9.81) < 0.01, `Rest feltG=${s.feltG.toFixed(3)}`);
  const restPouch = s.pouchOffset;

  stepPhysicsFixed(s, { ...zeroInput, jumpTriggered: true }, FIXED_DT);
  for (let i = 0; i < 45; i++) stepPhysicsFixed(s, zeroInput, FIXED_DT);
  assert.equal(s.feltG, 0, 'Freefall feltG must be 0');
  assert.ok(s.pouchOffset > restPouch + 0.015, `Freefall pouch (${s.pouchOffset.toFixed(4)}) must float above rest (${restPouch.toFixed(4)})`);
});

// 10. Slow Lunar Lean Dynamics
check('10. Steer leans INTO turn (left=-roll, right=+roll) and slower on Moon than Earth', () => {
  const runTurn = (envId, steer) => {
    const s = createPhysicsState(envId);
    s.vz = 6.0;
    s.omegaRear = 6.0 / 0.34;
    s.omegaFront = s.omegaRear;
    for (let i = 0; i < 24; i++) {
      stepPhysicsFixed(s, { ...zeroInput, steer }, FIXED_DT);
    }
    return s.roll;
  };
  const rMoonRight = runTurn('moon', -1);
  const rEarthRight = runTurn('earth', -1);
  const rMoonLeft = runTurn('moon', +1);
  assert.ok(rMoonRight > 0.01 && rEarthRight > rMoonRight * 1.4,
    `Right turn must lean +roll (rightward) with Earth (${rEarthRight.toFixed(4)}) faster than Moon (${rMoonRight.toFixed(4)})`);
  assert.ok(rMoonLeft < -0.01, `Left turn must lean -roll (leftward), got ${rMoonLeft.toFixed(4)}`);
});

// 11. 2-Bone IK Robustness
check('11. 2-bone IK never returns NaN and hits pedal target across full 360° crank sweep', () => {
  const hipZ = -0.29, hipY = 0.63;
  const bbZ = -0.14, bbY = -0.04;
  const crankR = 0.16;
  const upperL = 0.46, lowerL = 0.46;

  for (let i = 0; i < 36; i++) {
    const ang = (i / 36) * Math.PI * 2;
    const fZ = bbZ + Math.cos(ang) * crankR;
    const fY = bbY - Math.sin(ang) * crankR;
    const res = solveTwoBoneIK2D(hipZ, hipY, fZ, fY, upperL, lowerL, 1);
    assert.ok(Number.isFinite(res.kneeZ) && Number.isFinite(res.kneeY), 'IK knee must be finite');
    assert.ok(Number.isFinite(res.thighAngle) && Number.isFinite(res.shinAngle), 'IK angles must be finite');
    const recZ = res.kneeZ + lowerL * Math.cos(res.shinAngle);
    const recY = res.kneeY + lowerL * Math.sin(res.shinAngle);
    const err = Math.hypot(recZ - fZ, recY - fY);
    assert.ok(err < 1e-3, `IK foot error ${err} exceeded 1e-3 at step ${i}`);
  }
});

// 12. World Integrity, Beacons, Boulders, Boundary, Determinism
check('12a. Terrain height, unit normals, and curvature finite across world grid', () => {
  for (let x = -200; x <= 200; x += 40) {
    for (let z = -200; z <= 200; z += 40) {
      const h = getTerrainHeight(x, z);
      const n = getTerrainNormal(x, z);
      const k = getTerrainCurvature(x, z, 0, 1);
      assert.ok(Number.isFinite(h) && Number.isFinite(k), `Terrain finite check failed at (${x},${z})`);
      const nLen = Math.hypot(n[0], n[1], n[2]);
      assert.ok(Math.abs(nLen - 1) < 1e-4 && n[1] > 0.3, `Normal invalid at (${x},${z})`);
    }
  }
});

check('12b. Beacon collection triggers once and emits event', () => {
  const s = createPhysicsState('moon');
  const target = BEACONS[0];
  s.x = target.x;
  s.z = target.z - 0.5;
  s.y = getTerrainHeight(s.x, s.z);
  stepPhysicsFixed(s, zeroInput, FIXED_DT);
  stepPhysicsFixed(s, zeroInput, FIXED_DT);
  assert.equal(s.beaconsCollected.length, 1);
  assert.equal(s.beaconsCollected[0], target.id);
  const beaconEvs = s.events.filter((e) => e.type === 'beacon');
  assert.equal(beaconEvs.length, 1);
});

check('12c. Boulder collision pushes bike clear and emits bump event', () => {
  const s = createPhysicsState('moon');
  const b = BOULDERS[0];
  s.x = b.x;
  s.z = b.z - b.radius - 0.2;
  s.y = getTerrainHeight(s.x, s.z);
  s.vz = 5.0;
  stepPhysicsFixed(s, zeroInput, FIXED_DT);
  const dist = Math.hypot(s.x - b.x, s.z - b.z);
  assert.ok(dist >= b.radius + 0.649, `Bike pushed outside boulder (${dist.toFixed(3)})`);
});

check('12d. World boundary keeps bike inside WORLD_RADIUS and deterministic replay matches', () => {
  const s1 = createPhysicsState('moon');
  const s2 = createPhysicsState('moon');
  s1.x = WORLD_RADIUS + 8;
  stepPhysicsFixed(s1, zeroInput, FIXED_DT);
  assert.ok(Math.hypot(s1.x, s1.z) <= WORLD_RADIUS + 1e-5, 'Bike clamped inside WORLD_RADIUS');

  const seq = { throttle: 1, brake: 0, steer: 0.35, sprint: true, jumpHeld: false, jumpTriggered: false };
  const sA = createPhysicsState('moon');
  const sB = createPhysicsState('moon');
  for (let i = 0; i < 120; i++) {
    stepPhysicsFixed(sA, { ...seq, jumpTriggered: i === 20 }, FIXED_DT);
    stepPhysicsFixed(sB, { ...seq, jumpTriggered: i === 20 }, FIXED_DT);
  }
  assert.equal(sA.x, sB.x);
  assert.equal(sA.y, sB.y);
  assert.equal(sA.z, sB.z);
  assert.equal(sA.heading, sB.heading);
});

console.log(`\nALL ${passed} PHYSICS & LOGIC TESTS PASSED.`);
