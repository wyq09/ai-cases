/**
 * easing.js — 缓动函数库
 * 所有过渡统一从这里取曲线,保证全站动效手感一致。
 */

export const ease = {
  linear: (t) => t,
  /** 丝滑主力:五次缓出,快启动长收尾 */
  outQuint: (t) => 1 - Math.pow(1 - t, 5),
  inOutQuint: (t) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2),
  inOutCubic: (t) => (t < 0.5 ? 4 * t ** 3 : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  outBack: (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
  outElastic: (t) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
};

/** cubic-bezier(0.22, 1, 0.36, 1) 的数值近似 —— 面板切换的签名手感 */
export function signatureEase(t) {
  // easeOutQuint 与该曲线几乎重合,统一复用
  return ease.outQuint(t);
}
