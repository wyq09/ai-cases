/**
 * animations.js — 14 个状态动画
 *
 * 每个状态 = 关键帧轨道(身体轨道 + 眼睛轨道),循环播放。
 * 身体轨道输出几何变换参数(缩放/鼓包/尖刺/扭曲),叠加在任意基础形状之上;
 * 眼睛轨道输出位置/缩放参数,叠加在任意表情之上 ——
 * 因此任意「形状 × 表情 × 状态动画」自由组合都能成立,这也是序列编辑器的基础。
 */
import { TAU } from '../core/geometry.js';
import { polarPoints, BODY_POINTS } from '../core/geometry.js';

/** 身体轨道参数 */
export const BODY_PROPS = {
  scale: 1, sx: 1, sy: 1, rot: 0,
  wobN: 0, wobAmp: 0, wobPhase: 0,        // 谐波鼓包
  spikeN: 0, spikeAmp: 0, spikePhase: 0, spikeK: 3, // 尖刺谐波
  twist: 0,                               // 扭曲(旋转量 ∝ 半径)
  baseBlend: 0,                           // 0=基础形状 1=覆盖形状(蛋形等)
};

/** 眼睛轨道参数 */
export const EYE_PROPS = {
  ex: 0, ey: 0,      // 双眼中点偏移
  egap: 0,           // 眼距增益
  erot: 0,           // 附加旋转
  escale: 1, esy: 1, // 整体/纵向(眨眼)
  elx: 0, ely: 0,    // 左眼独立偏移
  erx: 0, ery: 0,    // 右眼独立偏移
};

const B = (t, ease, props) => ({ t, ease, props });
export const EASES = {
  linear: (t) => t,
  io: (t) => (t < 0.5 ? 4 * t ** 3 : 1 - Math.pow(-2 * t + 2, 3) / 2),
  o: (t) => 1 - Math.pow(1 - t, 3),
  os: (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
  sine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
};

/** 蛋形覆盖点集:纵向拉长、顶部收窄 */
const EGG_POINTS = (() => {
  const pts = new Float64Array(BODY_POINTS * 2);
  for (let i = 0; i < BODY_POINTS; i++) {
    const a = (i / BODY_POINTS) * TAU - Math.PI / 2;
    const k = Math.cos(a); // 1 顶部, -1 底部
    const r = 100 * (1 + 0.16 * k * k * k * -1); // 底宽顶窄
    pts[i * 2] = Math.cos(a) * r * 0.92;
    pts[i * 2 + 1] = Math.sin(a) * r * 1.14;
  }
  return pts;
})();

export const OVERRIDES = { egg: EGG_POINTS };

export const ANIMATIONS = {
  idle: {
    id: 'idle', duration: 3400, loop: true,
    body: [
      B(0, 'sine', { scale: 0.995, wobAmp: 0.010 }),
      B(0.5, 'sine', { scale: 1.025, wobAmp: 0.014 }),
      B(1, 'sine', { scale: 0.995, wobAmp: 0.010 }),
    ],
    eyes: [B(0, 'sine', { ey: 0 }), B(0.5, 'sine', { ey: -2 }), B(1, 'sine', { ey: 0 })],
  },
  think: {
    id: 'think', duration: 2800, loop: true,
    body: [
      B(0, 'io', { rot: 0, wobAmp: 0.02, wobN: 2, wobPhase: 1.2 }),
      B(1, 'io', { rot: -4, wobAmp: 0.026, wobN: 2, wobPhase: 4.4 }),
    ],
    eyes: [
      B(0, 'o', { ex: 0 }),
      B(0.35, 'o', { ex: -13, ey: -7 }),
      B(0.7, 'o', { ex: -6, ey: -7 }),
      B(1, 'o', { ex: -13, ey: -7 }),
    ],
  },
  blink: {
    id: 'blink', duration: 1150, loop: true,
    body: [B(0, 'linear', {})],
    eyes: [
      B(0, 'linear', { esy: 1 }), B(0.12, 'io', { esy: 0.06 }), B(0.24, 'io', { esy: 1 }),
      B(0.45, 'linear', { esy: 1 }), B(0.57, 'io', { esy: 0.06 }), B(0.69, 'io', { esy: 1 }),
      B(1, 'linear', { esy: 1 }),
    ],
  },
  wide: {
    id: 'wide', duration: 1500, loop: true,
    body: [
      B(0, 'os', { scale: 1 }), B(0.3, 'os', { scale: 1.045 }), B(1, 'sine', { scale: 1.04 }),
    ],
    eyes: [
      B(0, 'os', { escale: 1 }), B(0.25, 'os', { escale: 1.42, ey: -3 }), B(1, 'sine', { escale: 1.38, ey: -3 }),
    ],
  },
  alert: {
    id: 'alert', duration: 1450, loop: true,
    body: [
      B(0, 'o', { scale: 1 }), B(0.18, 'o', { scale: 1.075 }), B(0.42, 'o', { scale: 1 }),
      B(0.6, 'o', { scale: 1.075 }), B(0.85, 'o', { scale: 1 }), B(1, 'linear', { scale: 1 }),
    ],
    eyes: [
      B(0, 'o', { escale: 1 }), B(0.18, 'o', { escale: 1.22 }), B(0.42, 'o', { escale: 1 }),
      B(0.6, 'o', { escale: 1.22 }), B(0.85, 'o', { escale: 1 }), B(1, 'linear', { escale: 1 }),
    ],
  },
  notice: {
    id: 'notice', duration: 2300, loop: true,
    body: [
      B(0, 'io', { wobN: 3, wobAmp: 0, wobPhase: -0.9, scale: 1 }),
      B(0.4, 'io', { wobN: 3, wobAmp: 0.09, wobPhase: -0.9, scale: 1.01 }),
      B(0.75, 'io', { wobN: 3, wobAmp: 0.03, wobPhase: -0.9 }),
      B(1, 'io', { wobN: 3, wobAmp: 0.09, wobPhase: -0.9 }),
    ],
    eyes: [
      B(0, 'o', { ex: 0, ey: 0 }), B(0.4, 'o', { ex: 15, ey: -11 }), B(0.7, 'o', { ex: 15, ey: -11 }), B(1, 'o', { ex: 0, ey: 0 }),
    ],
  },
  exclaim: {
    id: 'exclaim', duration: 1100, loop: true,
    body: [
      B(0, 'linear', { scale: 1, sy: 1, sx: 1 }),
      B(0.2, 'o', { sy: 0.86, sx: 1.12, scale: 1 }),   // 蓄力压扁
      B(0.55, 'os', { sy: 1.14, sx: 0.9, scale: 1.05 }), // 弹起拉伸
      B(0.85, 'io', { sy: 1, sx: 1, scale: 1 }),
      B(1, 'linear', { scale: 1, sy: 1, sx: 1 }),
    ],
    eyes: [
      B(0, 'linear', { escale: 1 }), B(0.55, 'linear', { escale: 1.18, ey: -6 }), B(1, 'linear', { escale: 1 }),
    ],
  },
  sleep: {
    id: 'sleep', duration: 4200, loop: true,
    body: [
      B(0, 'sine', { scale: 0.965, ey0: 0 }), B(0.5, 'sine', { scale: 1.035 }), B(1, 'sine', { scale: 0.965 }),
    ],
    eyes: [
      B(0, 'sine', { ey: 5, esy: 0.42, ex: 2 }), B(0.5, 'sine', { ey: 7, esy: 0.42, ex: 2 }), B(1, 'sine', { ey: 5, esy: 0.42, ex: 2 }),
    ],
  },
  egg: {
    id: 'egg', duration: 2600, loop: true,
    body: [
      B(0, 'io', { baseBlend: 1, rot: -3 }),
      B(0.5, 'io', { baseBlend: 1, rot: 3 }),
      B(1, 'io', { baseBlend: 1, rot: -3 }),
    ],
    eyes: [B(0, 'sine', { ey: 4 }), B(0.5, 'sine', { ey: 6 }), B(1, 'sine', { ey: 4 })],
  },
  play: {
    id: 'play', duration: 1600, loop: true,
    body: [
      B(0, 'o', { scale: 1 }), B(0.3, 'o', { scale: 1.05 }), B(0.6, 'o', { scale: 1 }), B(1, 'o', { scale: 1.03 }),
    ],
    eyes: [
      B(0, 'os', { ey: 0 }), B(0.35, 'os', { ey: -4, escale: 1.06 }), B(1, 'sine', { ey: -4, escale: 1.06 }),
    ],
  },
  orbit: {
    id: 'orbit', duration: 3000, loop: true,
    body: [
      B(0, 'linear', { rot: 0, scale: 0.99 }), B(0.5, 'linear', { rot: -3 }), B(1, 'linear', { rot: 0, scale: 0.99 }),
    ],
    // 公转由引擎特殊处理:eyes 轨道的 ex/ey 按 cos/sin 合成(相位 = t*TAU)
    eyes: [B(0, 'linear', { orbitR: 0 }), B(0.5, 'linear', { orbitR: 62 }), B(1, 'linear', { orbitR: 62 })],
    orbit: true,
  },
  burst: {
    id: 'burst', duration: 1050, loop: true,
    body: [
      B(0, 'linear', { spikeN: 9, spikeAmp: 0, spikeK: 2.2, scale: 1 }),
      B(0.35, 'o', { spikeN: 9, spikeAmp: 0.42, spikeK: 2.2, scale: 1.1 }),
      B(0.7, 'io', { spikeN: 9, spikeAmp: 0.06, spikeK: 2.2, scale: 0.98 }),
      B(1, 'io', { spikeN: 9, spikeAmp: 0.42, spikeK: 2.2, scale: 1.06 }),
    ],
    eyes: [
      B(0, 'linear', { escale: 1 }), B(0.35, 'o', { escale: 0.7 }), B(0.7, 'io', { escale: 1.15 }), B(1, 'linear', { escale: 0.9 }),
    ],
  },
  comet: {
    id: 'comet', duration: 2000, loop: true,
    body: [
      B(0, 'linear', { sx: 1, sy: 1, rot: 0, wobN: 1, wobAmp: 0, wobPhase: 0 }),
      B(0.45, 'io', { sx: 1.3, sy: 0.74, rot: -26, wobN: 1, wobAmp: 0.1, wobPhase: 1.5 }),
      B(1, 'io', { sx: 1, sy: 1, rot: 0, wobN: 1, wobAmp: 0, wobPhase: 0 }),
    ],
    eyes: [
      B(0, 'io', { ex: 0, erot: 0 }), B(0.45, 'io', { ex: 26, erot: -30 }), B(1, 'io', { ex: 0, erot: 0 }),
    ],
  },
  vortex: {
    id: 'vortex', duration: 2400, loop: true,
    body: [
      B(0, 'linear', { twist: 0, spikeN: 5, spikeAmp: 0, scale: 1 }),
      B(0.5, 'io', { twist: 2.6, spikeN: 5, spikeAmp: 0.16, scale: 0.97 }),
      B(1, 'linear', { twist: 0, spikeN: 5, spikeAmp: 0, scale: 1 }),
    ],
    eyes: [
      B(0, 'io', { erot: 0 }), B(0.5, 'io', { erot: 150 }), B(1, 'io', { erot: 0 }),
    ],
  },
};

export const ANIM_ORDER = [
  'idle', 'think', 'blink', 'wide', 'alert', 'notice', 'exclaim', 'sleep',
  'egg', 'play', 'orbit', 'burst', 'comet', 'vortex',
];

/** 关键帧轨道求值:循环、段内缓动、属性线性插值。out 会被写入并返回 */
export function evalTrack(track, tNorm, orbitPhase, out) {
  const kfs = track;
  let i = 0;
  while (i < kfs.length - 1 && kfs[i + 1].t <= tNorm) i++;
  const a = kfs[i];
  const b = kfs[Math.min(i + 1, kfs.length - 1)];
  const span = b.t - a.t;
  const local = span <= 0 ? 0 : (tNorm - a.t) / span;
  const e = (EASES[b.ease] || EASES.linear)(local);
  for (const k in out) {
    if (k === 'orbitR') continue;
    // 关键帧未写的属性沿用参数表当前值(缺省兜底),而不是清零
    const va = a.props[k] ?? out[k], vb = b.props[k] ?? out[k];
    out[k] = va + (vb - va) * e;
  }
  // 轨道公转:ex/ey 由半径参数合成
  const ra = a.props.orbitR ?? 0, rb = b.props.orbitR ?? 0;
  const r = ra + (rb - ra) * e;
  if (r > 0 && orbitPhase != null) {
    out.ex = Math.cos(orbitPhase) * r;
    out.ey = Math.sin(orbitPhase) * r * 0.6;
  }
  return out;
}
