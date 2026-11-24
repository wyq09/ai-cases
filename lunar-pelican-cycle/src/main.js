import { clamp, damp, v3Add } from './math3d.js';
import { BEACONS, getTerrainHeight } from './terrain.js';
import { createPhysicsState, stepPhysics } from './physics.js';
import { WebGLRenderer } from './renderer.js';
import { HelmetAudio } from './audio.js';
import { UIController } from './ui.js';

const runtimeErrors = [];
window.addEventListener('error', (e) => {
  runtimeErrors.push(String(e.message || e.error || 'Unknown error'));
});
window.addEventListener('unhandledrejection', (e) => {
  runtimeErrors.push(String(e.reason || 'Unhandled promise rejection'));
});

function computeAutoCruiseInput(state) {
  let target = null;
  let bestDist = Infinity;
  for (let i = 0; i < BEACONS.length; i++) {
    const bc = BEACONS[i];
    if (state.beaconsCollected.indexOf(bc.id) === -1) {
      const d = Math.hypot(bc.x - state.x, bc.z - state.z);
      if (d < bestDist) {
        bestDist = d;
        target = bc;
      }
    }
  }

  let tx = 0;
  let tz = 31;
  if (target) {
    tx = target.x;
    tz = target.z;
  } else {
    const angle = state.time * 0.14;
    tx = Math.sin(angle) * 46;
    tz = Math.cos(angle) * 46;
  }

  const dx = tx - state.x;
  const dz = tz - state.z;
  const desiredHeading = Math.atan2(dx, dz);
  let diff = desiredHeading - state.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;

  const steer = clamp(diff * 1.4, -0.85, 0.85);
  const desiredSpeed = Math.abs(diff) > 0.7 ? 4.5 : 8.2;
  const throttle = state.vFwd < desiredSpeed ? 0.78 : 0.15;
  const jumpTriggered = state.grounded && state.speed > 5.8 && Math.abs(state.groundSlopeDeg) > 8.0 && (Math.floor(state.time * 10) % 25 === 0);

  return {
    throttle,
    brake: 0,
    steer,
    sprint: false,
    jumpHeld: false,
    jumpTriggered,
  };
}

function initApp() {
  const canvas = document.getElementById('gl-canvas');
  const renderer = new WebGLRenderer(canvas);
  const audio = new HelmetAudio();

  let state = createPhysicsState('moon');
  let camMode = 'chase';
  let autoCruise = false;
  let orbitYaw = 0.62;
  let orbitPitch = 0.14;
  let orbitDist = 4.8;

  const camEye = [-2.8, 1.85, -3.9];
  const camTarget = [0, 1.0, 1.2];

  const ui = new UIController({
    onInteract: () => audio.unlock(),
    onCycleCamera: () => {
      const modes = ['chase', 'side', 'orbit'];
      camMode = modes[(modes.indexOf(camMode) + 1) % modes.length];
      orbitYaw = camMode === 'chase' ? 0.72 : camMode === 'side' ? Math.PI * 0.5 : 0.78;
      orbitPitch = camMode === 'orbit' ? 0.30 : 0.14;
      orbitDist = camMode === 'side' ? 4.4 : camMode === 'orbit' ? 9.0 : 4.9;
    },
    onToggleEnv: () => {
      const next = state.envId === 'moon' ? 'earth' : 'moon';
      state.envId = next;
      audio.playSwitch();
      ui.showToast(
        next === 'moon' ? 'LUNAR VACUUM · 1.62 m/s²' : 'EARTH CONTROL · 9.81 m/s²',
        next === 'moon' ? '已切换至月球真空环境' : '已切换至地球对照环境',
        next === 'moon'
          ? '1/6 重力、零空气阻力、6 倍跃起高度、猛踩极易打滑。'
          : '1.0 G 重力与大气风阻已开启，可直观对比跳高、刹车与扬尘差异。',
        3.8
      );
    },
    onSetEnv: (id) => {
      if (state.envId === id) return;
      state.envId = id;
      audio.playSwitch();
    },
    onToggleAuto: () => {
      autoCruise = !autoCruise;
      if (autoCruise) {
        ui.showToast('AUTO CRUISE', '月面自动巡航已开启', '鹈鹕将自动寻路收集 8 处月球物理信标，随时操作即可接管。', 3.5);
      }
    },
    onReset: () => {
      const envId = state.envId;
      state = createPhysicsState(envId);
      renderer.clearTracks();
      orbitYaw = 0.72;
      orbitPitch = 0.14;
      orbitDist = 4.9;
      ui.showToast('BASE CAMP', '已返回静海基地起点', '前方 31 米处为弹射环形山，加速冲刺试试坡顶腾空！', 3.4);
    },
    onToggleMute: () => {
      audio.setMuted(!audio.isMuted());
    },
  });

  // Initial welcome toast
  ui.showToast(
    'APOLLO PELICAN · 1/6 G',
    '欢迎来到月球静海基地',
    '向前骑行探索 8 处月球物理信标！Shift 冲刺体验低重力打滑，Space 跃起体验 6 倍滞空。',
    5.2
  );

  let frames = 0;
  let lastT = performance.now();

  function frame(now) {
    const dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;

    // Input handling (manual cancels auto-cruise smoothly)
    const manualActive = ui.hasManualInput();
    if (manualActive && autoCruise) {
      autoCruise = false;
    }
    const input = autoCruise && !manualActive ? computeAutoCruiseInput(state) : ui.getInput();

    stepPhysics(state, input, dt);

    // Handle physics events (audio & discovery toasts)
    while (state.events.length > 0) {
      const ev = state.events.shift();
      if (ev.type === 'jump') {
        audio.playJump();
      } else if (ev.type === 'land') {
        audio.playLand(ev.impactSpeed);
        if (ev.airTime >= 1.5 && ev.peakHeight >= 1.2) {
          ui.showToast(
            'TELEMETRY RECORD',
            `月面腾空 ${ev.airTime.toFixed(2)} 秒 · 高度 ${ev.peakHeight.toFixed(2)} 米`,
            state.envId === 'moon'
              ? '相同蹬地初速在月球达到地球 6 倍高度与 6 倍滞空时间！'
              : '地球 1.0 G 重力下拉回地面仅需约 0.5 秒。',
            3.6
          );
        }
      } else if (ev.type === 'beacon') {
        audio.playBeacon();
        ui.showToast(
          `信标 ${state.beaconsCollected.length}/8 · ${ev.beacon.lawTag}`,
          ev.beacon.title,
          ev.beacon.fact,
          6.0
        );
      }
    }

    audio.update(state);

    // Camera orbit & tracking
    const deltas = ui.consumeOrbitDeltas();
    orbitYaw += deltas.yaw;
    orbitPitch = clamp(orbitPitch + deltas.pitch, -0.05, 1.15);
    orbitDist = clamp(orbitDist + deltas.zoom, 2.8, 16.0);

    const bikeCenter = [state.x, state.y + 0.92, state.z];
    const aspect = canvas.width / Math.max(1, canvas.height);
    const portraitScale = aspect < 0.75 ? 1.18 : 1.0;
    const lookAhead = aspect < 0.75 ? 0.35 : 0.95;
    let desiredTarget = [
      state.x + Math.sin(state.heading) * lookAhead,
      state.y + 0.98,
      state.z + Math.cos(state.heading) * lookAhead,
    ];
    let desiredEye;

    if (camMode === 'side') {
      const sideHeading = state.heading + Math.PI * 0.5 + (orbitYaw - Math.PI * 0.5) * 0.25;
      desiredTarget = [state.x, state.y + 0.85, state.z];
      desiredEye = [
        state.x + Math.sin(sideHeading) * orbitDist * portraitScale,
        state.y + 1.15 + Math.sin(orbitPitch) * 1.2,
        state.z + Math.cos(sideHeading) * orbitDist * portraitScale,
      ];
    } else {
      const worldYaw = state.heading + Math.PI + orbitYaw;
      const effDist = orbitDist * portraitScale;
      const horiz = Math.cos(orbitPitch) * effDist;
      const vert = Math.sin(orbitPitch) * effDist;
      desiredEye = [
        bikeCenter[0] + Math.sin(worldYaw) * horiz,
        bikeCenter[1] + vert + 0.55,
        bikeCenter[2] + Math.cos(worldYaw) * horiz,
      ];
    }

    // Prevent camera from dipping below lunar regolith
    const camGround = getTerrainHeight(desiredEye[0], desiredEye[2]) + 0.55;
    if (desiredEye[1] < camGround) desiredEye[1] = camGround;

    const camSmooth = camMode === 'side' ? 14 : 9.5;
    for (let i = 0; i < 3; i++) {
      camEye[i] = damp(camEye[i], desiredEye[i], camSmooth, dt);
      camTarget[i] = damp(camTarget[i], desiredTarget[i], camSmooth * 1.2, dt);
    }

    renderer.render(state, camEye, camTarget, state.time);
    ui.updateHUD(state, camMode, autoCruise, audio.isMuted(), dt);
    frames++;

    if (window.__LUNAR_PELICAN__) {
      window.__LUNAR_PELICAN__.frames = frames;
    }

    requestAnimationFrame(frame);
  }

  window.__LUNAR_PELICAN__ = {
    ready: true,
    frames: 0,
    getState: () => ({
      envId: state.envId,
      x: state.x,
      y: state.y,
      z: state.z,
      speed: state.speed,
      speedKmh: state.speedKmh,
      altitude: state.altitude,
      grounded: state.grounded,
      feltG: state.feltG,
      slipRatio: state.slipRatio,
      pitch: state.pitch,
      roll: state.roll,
      activeDust: state.activeDust,
      beaconsCollected: state.beaconsCollected.slice(),
      bestJumpHeight: state.bestJumpHeight,
      bestAirTime: state.bestAirTime,
      camMode,
      autoCruise,
    }),
    setInput: (obj) => {
      ui.manualInputOverride = obj ? { ...obj } : null;
    },
    setEnv: (id) => {
      if (id === 'moon' || id === 'earth') state.envId = id;
    },
    setCamera: (mode) => {
      if (['chase', 'side', 'orbit'].includes(mode)) {
        camMode = mode;
        orbitYaw = mode === 'chase' ? 0.72 : mode === 'side' ? Math.PI * 0.5 : 0.78;
        orbitPitch = mode === 'orbit' ? 0.30 : 0.14;
        orbitDist = mode === 'side' ? 4.4 : mode === 'orbit' ? 9.0 : 4.9;
      }
    },
    setAutoCruise: (flag) => {
      autoCruise = Boolean(flag);
    },
    triggerJump: () => {
      ui.touchState.jumpQueued = true;
    },
    reset: () => {
      state = createPhysicsState(state.envId);
      renderer.clearTracks();
    },
    teleport: (x, z, heading = 0) => {
      state.x = x;
      state.z = z;
      state.y = getTerrainHeight(x, z);
      state.heading = heading;
      state.vx = 0;
      state.vy = 0;
      state.vz = 0;
      state.grounded = true;
    },
    getCanvasStats: () => renderer.getStats(),
    getErrors: () => runtimeErrors.slice(),
  };

  requestAnimationFrame(frame);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
