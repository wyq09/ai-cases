import { clamp, damp } from './math3d.js';
import {
  WORLD_RADIUS,
  BEACONS,
  BOULDERS,
  getTerrainHeight,
  getTerrainNormal,
  getTerrainCurvature,
} from './terrain.js';

export const FIXED_DT = 1 / 120;
export const MAX_DUST = 600;

export const ENV_PRESETS = {
  moon: {
    id: 'moon',
    label: '月球 · 真空',
    gravity: 1.62,
    airDensity: 0.0,
    mu: 0.68,
    crr: 0.022,
  },
  earth: {
    id: 'earth',
    label: '地球对照 · 1 atm',
    gravity: 9.81,
    airDensity: 1.225,
    mu: 0.90,
    crr: 0.012,
  },
};

export const BIKE_PARAMS = {
  mass: 32.0,
  wheelbase: 1.18,
  wheelRadius: 0.34,
  cgHeight: 0.86,
  rearWeightFrac: 0.58,
  gearRatio: 2.6,
  wheelInertia: 0.16,
  bikePitchInertia: 6.2,
  normalTorque: 12.5,
  sprintTorque: 32.0,
  brakeMaxDecelFactor: 0.92,
  cda: 0.48,
  jumpImpulseV: 2.45,
  maxChargeBonus: 0.45,
  maxSteerAngle: 0.58,
  maxCadenceRad: 18.0,
};

function smoothSign(v) {
  if (Math.abs(v) < 0.05) return v / 0.05;
  return v > 0 ? 1 : -1;
}

export function createPhysicsState(envId = 'moon') {
  const startY = getTerrainHeight(0, 0);
  return {
    envId: ENV_PRESETS[envId] ? envId : 'moon',
    time: 0,
    accumulator: 0,
    x: 0,
    y: startY,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    heading: 0,
    steerAngle: 0,
    pitch: 0,
    pitchRate: 0,
    roll: 0,
    rollRate: 0,
    grounded: true,
    omegaRear: 0,
    omegaFront: 0,
    wheelRotRear: 0,
    wheelRotFront: 0,
    crankAngle: 0,
    slipRatio: 0,
    lateralSlip: 0,
    pedalLoad: 0,
    crouchCharge: 0,
    prevJumpHeld: false,
    wingFlapBoost: 0,
    wingFlapPhase: 0,
    suspRear: 0,
    suspRearVel: 0,
    suspFront: 0,
    suspFrontVel: 0,
    pouchOffset: 0,
    pouchVel: 0,
    feltG: ENV_PRESETS[envId] ? ENV_PRESETS[envId].gravity / 9.81 : 1.62 / 9.81,
    altitude: 0,
    airTime: 0,
    airPeakHeight: 0,
    lastJumpStats: null,
    bestJumpHeight: 0,
    bestAirTime: 0,
    distanceTraveled: 0,
    speed: 0,
    speedKmh: 0,
    vFwd: 0,
    vLat: 0,
    groundPitch: 0,
    groundSlopeDeg: 0,
    normalForce: 0,
    maxTraction: 0,
    driveForce: 0,
    brakeForce: 0,
    rollForce: 0,
    dragForce: 0,
    slopeForce: 0,
    beaconsCollected: [],
    events: [],
    dustPos: new Float32Array(MAX_DUST * 3),
    dustVel: new Float32Array(MAX_DUST * 3),
    dustAge: new Float32Array(MAX_DUST),
    dustMaxAge: new Float32Array(MAX_DUST),
    dustSize: new Float32Array(MAX_DUST),
    dustHead: 0,
    activeDust: 0,
    _rngState: 13379001,
  };
}

function nextStateRand(state) {
  let a = state._rngState | 0;
  a = (a + 0x6d2b79f5) | 0;
  state._rngState = a;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function spawnDustParticle(state, x, y, z, vx, vy, vz, size = 0.075, maxAge = 2.6) {
  const idx = state.dustHead;
  state.dustHead = (idx + 1) % MAX_DUST;
  const p3 = idx * 3;
  state.dustPos[p3] = x;
  state.dustPos[p3 + 1] = y;
  state.dustPos[p3 + 2] = z;
  state.dustVel[p3] = vx;
  state.dustVel[p3 + 1] = vy;
  state.dustVel[p3 + 2] = vz;
  state.dustAge[idx] = 0.0001;
  state.dustMaxAge[idx] = maxAge;
  state.dustSize[idx] = size;
}

function emitDustBurst(state, x, y, z, baseVx, baseVy, baseVz, count, speedSpread, sizeBase) {
  for (let i = 0; i < count; i++) {
    const a = nextStateRand(state) * Math.PI * 2;
    const sp = (0.3 + 0.7 * nextStateRand(state)) * speedSpread;
    const up = (0.35 + 0.85 * nextStateRand(state)) * speedSpread * 0.7;
    spawnDustParticle(
      state,
      x + (nextStateRand(state) - 0.5) * 0.16,
      y + 0.04,
      z + (nextStateRand(state) - 0.5) * 0.16,
      baseVx + Math.cos(a) * sp,
      baseVy + up,
      baseVz + Math.sin(a) * sp,
      sizeBase * (0.7 + 0.6 * nextStateRand(state)),
      1.8 + nextStateRand(state) * 1.4
    );
  }
}

export function stepPhysicsFixed(state, rawInput, dt) {
  const env = ENV_PRESETS[state.envId] || ENV_PRESETS.moon;
  const g = env.gravity;
  const P = BIKE_PARAMS;

  const throttle = clamp(rawInput?.throttle || 0, 0, 1);
  const brake = clamp(rawInput?.brake || 0, 0, 1);
  const steerIn = clamp(rawInput?.steer || 0, -1, 1);
  const sprint = Boolean(rawInput?.sprint);
  const jumpHeld = Boolean(rawInput?.jumpHeld);
  const jumpTriggered = Boolean(rawInput?.jumpTriggered);

  state.time += dt;

  // Forward & Left basis vectors in horizontal plane (right-handed, heading=0 -> +Z forward, +X left)
  const sinH = Math.sin(state.heading);
  const cosH = Math.cos(state.heading);
  const fwdX = sinH;
  const fwdZ = cosH;
  const leftX = cosH;
  const leftZ = -sinH;

  const halfL = P.wheelbase * 0.5;
  const hFront = getTerrainHeight(state.x + fwdX * halfL, state.z + fwdZ * halfL);
  const hRear = getTerrainHeight(state.x - fwdX * halfL, state.z - fwdZ * halfL);
  const groundY = 0.5 * (hFront + hRear);
  const groundPitch = Math.atan2(hFront - hRear, P.wheelbase);
  const groundSlopeVy = (state.vx * fwdX + state.vz * fwdZ) * Math.tan(groundPitch);

  state.groundPitch = groundPitch;
  state.groundSlopeDeg = (groundPitch * 180) / Math.PI;

  // Current forward and lateral speeds
  let vFwd = state.vx * fwdX + state.vz * fwdZ;
  let vLat = state.vx * leftX + state.vz * leftZ;

  // Steer angle with gentle high-speed damping for stability
  const speedAtten = 1 / (1 + 0.045 * Math.abs(vFwd));
  const targetSteer = steerIn * P.maxSteerAngle * speedAtten;
  state.steerAngle = damp(state.steerAngle, targetSteer, 12.0, dt);

  // Crouch charge & Jump trigger
  let didJump = false;
  if (state.grounded) {
    if (jumpTriggered) {
      didJump = true;
    } else if (jumpHeld) {
      state.crouchCharge = clamp(state.crouchCharge + dt * 1.4, 0, 1);
    } else if (state.prevJumpHeld && !jumpHeld && state.crouchCharge > 0.06) {
      didJump = true;
    } else {
      state.crouchCharge = damp(state.crouchCharge, 0, 14, dt);
    }
  } else {
    state.crouchCharge = damp(state.crouchCharge, 0, 10, dt);
    if (jumpTriggered) {
      // Flapping wings in vacuum produces visual motion ONLY, strictly zero lift!
      state.wingFlapBoost = 1.0;
      state.events.push({ type: 'flap' });
    }
  }
  state.prevJumpHeld = jumpHeld;

  if (didJump) {
    const impulse = P.jumpImpulseV + state.crouchCharge * P.maxChargeBonus;
    state.grounded = false;
    state.y = Math.max(state.y, groundY) + 0.01;
    state.vy = groundSlopeVy + impulse;
    state.airTime = 0;
    state.airPeakHeight = 0;
    state.crouchCharge = 0;
    state.pitchRate += 0.32;
    emitDustBurst(state, state.x - fwdX * 0.2, groundY, state.z - fwdZ * 0.2, state.vx * 0.35, 0.2, state.vz * 0.35, 16, 1.35, 0.08);
    state.events.push({ type: 'jump', impulse });
  }

  let dragMag = 0;
  let normalForce = 0;
  let maxTraction = 0;
  let driveForce = 0;
  let brakeForce = 0;
  let rollForce = 0;
  let slopeForce = 0;

  if (state.grounded) {
    // 1. Crest curvature & liftoff check: v^2 * kappa > g * cos(theta)
    const kappa = getTerrainCurvature(state.x, state.z, fwdX, fwdZ);
    const aNorm = g * Math.cos(groundPitch) - vFwd * vFwd * Math.max(0, kappa);

    if (aNorm <= 0.05 && Math.abs(vFwd) > 1.8) {
      // Natural ballistic liftoff off crater crest!
      state.grounded = false;
      state.vy = vFwd * Math.sin(groundPitch);
      state.y = groundY + 0.015;
      state.airTime = 0;
      state.airPeakHeight = 0;
      state.events.push({ type: 'crest_launch', speed: Math.abs(vFwd) });
    } else {
      normalForce = P.mass * Math.max(0, aNorm);

      // 2. Pedal torque & rear traction limit (F_max = mu * N_r)
      const torqueCap = sprint ? P.sprintTorque : P.normalTorque;
      const wheelCadence = Math.abs(state.omegaRear) / P.gearRatio;
      const cadenceTaper = clamp(1 - wheelCadence / P.maxCadenceRad, 0.08, 1);
      const pedalTorque = throttle * torqueCap * cadenceTaper;

      const rearLoadFrac = clamp(
        P.rearWeightFrac + clamp((pedalTorque / P.wheelRadius) / Math.max(normalForce, 1) * 0.14, 0, 0.2),
        0.25,
        0.85
      );
      const rearNormal = normalForce * rearLoadFrac;
      maxTraction = env.mu * rearNormal;

      const requestedDrive = pedalTorque / P.wheelRadius;
      driveForce = Math.min(requestedDrive, maxTraction);
      const excessTorque = Math.max(0, pedalTorque - driveForce * P.wheelRadius);

      // Wheel spin from excess torque beyond lunar traction
      const groundOmega = vFwd / P.wheelRadius;
      if (excessTorque > 0.01) {
        const spinAccel = excessTorque / P.wheelInertia;
        state.omegaRear = clamp(state.omegaRear + spinAccel * dt, groundOmega, 62);
      } else {
        state.omegaRear = damp(state.omegaRear, groundOmega, 18.0, dt);
      }
      state.omegaFront = groundOmega;

      const wheelSurfSpeed = state.omegaRear * P.wheelRadius;
      state.slipRatio = clamp(
        (wheelSurfSpeed - vFwd) / Math.max(1.5, Math.abs(vFwd), Math.abs(wheelSurfSpeed)),
        0,
        1
      );
      state.pedalLoad = clamp(pedalTorque / P.sprintTorque, 0, 1);

      // Emit crisp ballistic dust backward when rear tire slips
      if (state.slipRatio > 0.14 && nextStateRand(state) < 0.72) {
        const rearX = state.x - fwdX * halfL;
        const rearZ = state.z - fwdZ * halfL;
        const kick = 1.6 + state.slipRatio * 3.4;
        spawnDustParticle(
          state,
          rearX + (nextStateRand(state) - 0.5) * 0.12,
          hRear + 0.05,
          rearZ + (nextStateRand(state) - 0.5) * 0.12,
          state.vx - fwdX * kick + (nextStateRand(state) - 0.5) * 0.7,
          0.55 + nextStateRand(state) * 0.95 * state.slipRatio * 1.4,
          state.vz - fwdZ * kick + (nextStateRand(state) - 0.5) * 0.7,
          0.055 + 0.045 * nextStateRand(state),
          2.0
        );
      }

      // 3. Braking, rolling resistance, aerodynamic drag (0 on Moon!), slope gravity
      const totalFrictionLimit = env.mu * normalForce * P.brakeMaxDecelFactor;
      if (brake > 0.02) {
        if (vFwd > 0.2) {
          brakeForce = -brake * totalFrictionLimit;
        } else if (vFwd < -0.2) {
          brakeForce = brake * totalFrictionLimit * 0.6;
        } else if (brake > 0.5 && vFwd > -2.2) {
          // Gentle reverse assist at near-standstill
          brakeForce = -Math.min(4.0, totalFrictionLimit * 0.45);
        }
      }

      rollForce = -env.crr * normalForce * smoothSign(vFwd);

      const speedSq = vFwd * vFwd + vLat * vLat;
      const spd = Math.sqrt(speedSq);
      dragMag = 0.5 * env.airDensity * P.cda * speedSq;
      const dragFwd = spd > 1e-4 ? -dragMag * (vFwd / spd) : 0;

      slopeForce = -P.mass * g * Math.sin(groundPitch);

      const netFwdForce = driveForce + brakeForce + rollForce + dragFwd + slopeForce;
      const newVFwd = vFwd + (netFwdForce / P.mass) * dt;
      // Prevent brake zero-crossing jitter when slowing down from forward motion
      if (brake > 0.02 && vFwd > 0.05 && newVFwd < 0) {
        vFwd = 0;
      } else {
        vFwd = newVFwd;
      }

      // 4. Steering, lateral traction limit, and inverted-pendulum roll
      const yawRateGeom = (vFwd / P.wheelbase) * Math.tan(state.steerAngle);
      const aLatReq = vFwd * yawRateGeom;
      const latBudgetForce = Math.sqrt(Math.max(0, Math.pow(env.mu * normalForce, 2) - driveForce * driveForce));
      const aLatMax = latBudgetForce / P.mass;
      const aLatActual = clamp(aLatReq, -aLatMax, aLatMax);
      const actualYawRate = Math.abs(vFwd) > 0.15 ? aLatActual / vFwd : yawRateGeom;

      state.heading += actualYawRate * dt;
      const excessLat = aLatReq - aLatActual;
      state.lateralSlip = clamp(Math.abs(excessLat) / Math.max(0.5, g), 0, 1);

      // Lateral tire damping + gentle drift when exceeding lunar side grip
      vLat = damp(vLat - excessLat * dt * 0.45, 0, clamp(6.0 * env.mu * (g / 1.62), 3.0, 20.0), dt);
      if (state.lateralSlip > 0.25 && Math.abs(vFwd) > 2.0 && nextStateRand(state) < 0.45) {
        const sideSign = excessLat > 0 ? -1 : 1;
        spawnDustParticle(
          state,
          state.x - fwdX * halfL,
          hRear + 0.04,
          state.z - fwdZ * halfL,
          state.vx + leftX * sideSign * 1.4,
          0.45 + nextStateRand(state) * 0.5,
          state.vz + leftZ * sideSign * 1.4,
          0.06,
          1.7
        );
      }

      // Inverted pendulum frequency scales with sqrt(g / cgHeight) -> 2.46x slower on Moon!
      // +roll leans rightward (-X), so left turn (aLatActual > 0) requires negative roll (-atan2).
      const omegaNat = Math.sqrt(g / P.cgHeight);
      const rollTarget = clamp(-Math.atan2(aLatActual, g), -0.52, 0.52);
      const rollStiffness = omegaNat * omegaNat * 3.8;
      const rollDamping = omegaNat * 3.4;
      const rollAccel = (rollTarget - state.roll) * rollStiffness - state.rollRate * rollDamping;
      state.rollRate += rollAccel * dt;
      state.roll = clamp(state.roll + state.rollRate * dt, -0.62, 0.62);

      // Recombine world velocities aligned to updated heading + terrain slope
      const nSin = Math.sin(state.heading);
      const nCos = Math.cos(state.heading);
      state.vx = nSin * vFwd + nCos * vLat;
      state.vz = nCos * vFwd - nSin * vLat;
      state.vy = vFwd * Math.sin(groundPitch);

      state.x += state.vx * dt;
      state.z += state.vz * dt;
      const newHF = getTerrainHeight(state.x + nSin * halfL, state.z + nCos * halfL);
      const newHR = getTerrainHeight(state.x - nSin * halfL, state.z - nCos * halfL);
      state.y = 0.5 * (newHF + newHR);
      state.pitch = damp(state.pitch, Math.atan2(newHF - newHR, P.wheelbase), 18.0, dt);
      state.pitchRate = 0;
      state.altitude = 0;

      // Grounded suspension & felt G
      state.suspRear = damp(state.suspRear, 0, 12, dt);
      state.suspFront = damp(state.suspFront, 0, 12, dt);
      const feltMult = clamp(aNorm / 9.81, 0, 2.5);
      state.feltG = damp(state.feltG, feltMult, 16, dt);
    }
  }

  if (!state.grounded) {
    // Airborne pure ballistics + optional air drag (strictly 0 on Moon!)
    state.airTime += dt;
    state.slipRatio = damp(state.slipRatio, 0, 8, dt);
    state.lateralSlip = damp(state.lateralSlip, 0, 8, dt);
    state.pedalLoad = throttle;

    const airSpd = Math.hypot(state.vx, state.vy, state.vz);
    dragMag = 0.5 * env.airDensity * P.cda * airSpd * airSpd;
    if (dragMag > 0 && airSpd > 1e-4) {
      const decel = (dragMag / P.mass) * dt;
      const scale = Math.max(0, 1 - decel / airSpd);
      state.vx *= scale;
      state.vy *= scale;
      state.vz *= scale;
    }

    state.vy -= g * dt;

    // Reaction-wheel conservation of angular momentum in pitch:
    // Accelerating rear wheel (+alphaW) produces equal & opposite reaction pitch UP (+pitchRate)
    let alphaW = 0;
    if (throttle > 0.05) {
      alphaW = throttle * 38.0;
    } else if (brake > 0.05) {
      alphaW = -brake * 38.0;
    }
    state.omegaRear = clamp(state.omegaRear + alphaW * dt, -35, 65);
    const reactionPitchAccel = (P.wheelInertia / P.bikePitchInertia) * alphaW * 3.2;
    state.pitchRate = clamp(state.pitchRate + reactionPitchAccel * dt, -2.4, 2.4);
    state.pitchRate *= Math.exp(-1.1 * dt);
    state.pitch = clamp(state.pitch + state.pitchRate * dt, -0.82, 0.92);

    // Slow roll stabilization in flight
    state.rollRate = damp(state.rollRate, 0, 2.0 * Math.sqrt(g / 9.81), dt);
    state.roll = clamp(state.roll + state.rollRate * dt, -0.62, 0.62);

    state.x += state.vx * dt;
    state.y += state.vy * dt;
    state.z += state.vz * dt;

    const curHF = getTerrainHeight(state.x + fwdX * halfL, state.z + fwdZ * halfL);
    const curHR = getTerrainHeight(state.x - fwdX * halfL, state.z - fwdZ * halfL);
    const curGroundY = 0.5 * (curHF + curHR);
    const curGroundPitch = Math.atan2(curHF - curHR, P.wheelbase);
    const curGroundSlopeVy = (state.vx * fwdX + state.vz * fwdZ) * Math.tan(curGroundPitch);

    const alt = Math.max(0, state.y - curGroundY);
    state.altitude = alt;
    if (alt > state.airPeakHeight) {
      state.airPeakHeight = alt;
    }

    // Freefall felt gravity = 0.00 G!
    state.feltG = 0.0;

    // Touchdown detection
    if (state.y <= curGroundY && state.vy <= curGroundSlopeVy + 0.02) {
      const impactSpeed = Math.max(0, curGroundSlopeVy - state.vy);
      state.y = curGroundY;
      state.grounded = true;
      state.altitude = 0;
      state.vy = curGroundSlopeVy;

      const suspComp = clamp(impactSpeed * 0.032, 0.01, 0.14);
      state.suspRear = suspComp;
      state.suspFront = suspComp;
      state.pitch = damp(state.pitch, curGroundPitch, 14, dt * 8);
      state.pitchRate = 0;

      if (state.airTime >= 0.35) {
        state.lastJumpStats = {
          height: state.airPeakHeight,
          airTime: state.airTime,
          impactSpeed,
        };
        if (state.airPeakHeight > state.bestJumpHeight) {
          state.bestJumpHeight = state.airPeakHeight;
        }
        if (state.airTime > state.bestAirTime) {
          state.bestAirTime = state.airTime;
        }
      }
      if (impactSpeed > 0.4) {
        emitDustBurst(state, state.x, curGroundY, state.z, state.vx * 0.25, 0.15, state.vz * 0.25, 18, Math.min(2.4, 0.6 + impactSpeed * 0.55), 0.075);
        state.events.push({ type: 'land', impactSpeed, airTime: state.airTime, peakHeight: state.airPeakHeight });
      }
    }
  }

  // Wheel & crank kinematics
  state.wheelRotRear += state.omegaRear * dt;
  state.wheelRotFront += state.omegaFront * dt;
  if (throttle > 0.05) {
    state.crankAngle += (Math.max(4.5, Math.abs(state.omegaRear)) / P.gearRatio) * dt;
  }

  // Wing flap animation decay
  if (state.wingFlapBoost > 0.001) {
    state.wingFlapPhase += dt * 19.0;
    state.wingFlapBoost = damp(state.wingFlapBoost, 0, 2.2, dt);
  } else {
    state.wingFlapBoost = 0;
  }

  // Pelican gular pouch spring-mass driven by feltG
  // At 0 G in freefall, pouch floats upward (+0.045); on heavy landing, drops down
  const pouchTarget = clamp((0.165 - state.feltG) * 0.28, -0.055, 0.055);
  const pouchAcc = (pouchTarget - state.pouchOffset) * 75.0 - state.pouchVel * 7.2;
  state.pouchVel += pouchAcc * dt;
  state.pouchOffset = clamp(state.pouchOffset + state.pouchVel * dt, -0.07, 0.07);

  // Soft boulder collisions
  const bikeR = 0.65;
  for (let i = 0; i < BOULDERS.length; i++) {
    const b = BOULDERS[i];
    const dx = state.x - b.x;
    const dz = state.z - b.z;
    const minD = b.radius + bikeR;
    const d2 = dx * dx + dz * dz;
    if (d2 < minD * minD && d2 > 1e-6) {
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const nz = dz / d;
      state.x = b.x + nx * minD;
      state.z = b.z + nz * minD;
      const vn = state.vx * nx + state.vz * nz;
      if (vn < 0) {
        state.vx -= 1.45 * vn * nx;
        state.vz -= 1.45 * vn * nz;
        state.events.push({ type: 'bump', speed: -vn });
      }
    }
  }

  // Soft world basin boundary return
  const distOrigin = Math.hypot(state.x, state.z);
  if (distOrigin > WORLD_RADIUS - 12) {
    const nx = state.x / distOrigin;
    const nz = state.z / distOrigin;
    const over = distOrigin - (WORLD_RADIUS - 12);
    state.vx -= nx * over * 1.4 * dt;
    state.vz -= nz * over * 1.4 * dt;
    if (distOrigin > WORLD_RADIUS) {
      state.x = nx * WORLD_RADIUS;
      state.z = nz * WORLD_RADIUS;
    }
  }

  // Beacon discovery check
  for (let i = 0; i < BEACONS.length; i++) {
    const bc = BEACONS[i];
    if (state.beaconsCollected.indexOf(bc.id) === -1) {
      if (Math.hypot(state.x - bc.x, state.z - bc.z) < 4.5) {
        state.beaconsCollected.push(bc.id);
        state.events.push({ type: 'beacon', beacon: bc });
      }
    }
  }

  // Ballistic dust particle simulation (strict parabola in vacuum!)
  let activeDustCount = 0;
  for (let i = 0; i < MAX_DUST; i++) {
    const age = state.dustAge[i];
    if (age <= 0) continue;
    const p3 = i * 3;
    if (env.airDensity > 0) {
      const dragD = Math.exp(-1.4 * env.airDensity * dt);
      state.dustVel[p3] *= dragD;
      state.dustVel[p3 + 1] *= dragD;
      state.dustVel[p3 + 2] *= dragD;
    }
    state.dustVel[p3 + 1] -= g * dt;
    const nx = state.dustPos[p3] + state.dustVel[p3] * dt;
    const ny = state.dustPos[p3 + 1] + state.dustVel[p3 + 1] * dt;
    const nz = state.dustPos[p3 + 2] + state.dustVel[p3 + 2] * dt;

    const newAge = age + dt;
    const th = getTerrainHeight(nx, nz);
    if (ny <= th || newAge >= state.dustMaxAge[i]) {
      state.dustAge[i] = 0;
    } else {
      state.dustPos[p3] = nx;
      state.dustPos[p3 + 1] = ny;
      state.dustPos[p3 + 2] = nz;
      state.dustAge[i] = newAge;
      activeDustCount++;
    }
  }
  state.activeDust = activeDustCount;

  // Final telemetry summary
  const horizSpd = Math.hypot(state.vx, state.vz);
  state.distanceTraveled += horizSpd * dt;
  state.speed = Math.hypot(state.vx, state.vy, state.vz);
  state.speedKmh = state.speed * 3.6;
  state.vFwd = vFwd;
  state.vLat = vLat;
  state.normalForce = normalForce;
  state.maxTraction = maxTraction;
  state.driveForce = driveForce;
  state.brakeForce = brakeForce;
  state.rollForce = rollForce;
  state.dragForce = dragMag;
  state.slopeForce = slopeForce;
}

export function stepPhysics(state, input, frameDt) {
  const safeDt = Math.min(Math.max(frameDt, 0), 0.1);
  state.accumulator += safeDt;
  let triggeredConsumed = false;
  while (state.accumulator >= FIXED_DT) {
    const stepInput = triggeredConsumed && input?.jumpTriggered
      ? { ...input, jumpTriggered: false }
      : input;
    stepPhysicsFixed(state, stepInput, FIXED_DT);
    triggeredConsumed = true;
    state.accumulator -= FIXED_DT;
  }
}

export function getGroundSlopeAngle(x, z, heading) {
  const n = getTerrainNormal(x, z);
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  return Math.asin(clamp(-(n[0] * fx + n[2] * fz), -1, 1));
}
