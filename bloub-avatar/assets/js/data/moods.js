/**
 * moods.js — 16 种表情
 *
 * 表情 = 两只眼睛的形状 + 位置/旋转/大小参数。
 * 眼睛同样编译为 EYE_POINTS 点集(morph 复用同一插值管线)。
 * 基准姿态:双眼整体位于球体右上区(神韵特征),基础旋转约 18°。
 */
import { polarPoints, polygonPoints, resampleClosed, EYE_POINTS, TAU } from '../core/geometry.js';

/** 椭圆/胶囊眼(w/h 为直径语义) */
function oval(w, h) {
  return polarPoints(() => 50, EYE_POINTS, w / 100, h / 100);
}

/** 上弯弧眼(笑眼 ^):圆环带的一段 */
function arc(span = 1.9, radius = 21, thick = 11) {
  const pts = [];
  const steps = EYE_POINTS / 2;
  for (let i = 0; i < steps; i++) {
    const a = -Math.PI / 2 - span / 2 + (span * i) / (steps - 1);
    pts.push(Math.cos(a) * (radius + thick / 2), Math.sin(a) * (radius + thick / 2));
  }
  for (let i = steps - 1; i >= 0; i--) {
    const a = -Math.PI / 2 - span / 2 + (span * i) / (steps - 1);
    pts.push(Math.cos(a) * (radius - thick / 2), Math.sin(a) * (radius - thick / 2));
  }
  return resampleClosed(pts, EYE_POINTS);
}

/** 三角眼(播放状态用) */
function tri(w, h) {
  const r = Math.max(w, h) / 2;
  return polygonPoints(
    [[r * 0.87, 0], [-r * 0.5, -r * 0.95], [-r * 0.5, r * 0.95]],
    EYE_POINTS, 2,
  ).map((v, i) => (i % 2 === 0 ? v * (w / (2 * r)) : v * (h / (2 * r))));
}

/** 每种眼形的几何点集(w/h 为标准尺寸,渲染时按参数缩放) */
const EYE_GEO = {
  capsule: oval(40, 17),
  round: oval(24, 24),
  line: oval(40, 7),
  arc: arc(),
  triangle: tri(30, 34),
};

/**
 * 表情参数。
 * x/y: 双眼中点位置; gap: 两眼中心距; rot: 整体倾角(度)
 * w/h: 相对基准(40×17)的缩放; shape: 眼形
 * lRot/rRot: 单眼附加旋转(度); lW/lH/rW/rH: 单眼缩放覆盖
 */
export const MOODS = {
  calm:      { shape: 'capsule', x: 18, y: -56, gap: 46, rot: 18, w: 1,    h: 1 },
  focus:     { shape: 'capsule', x: 14, y: -54, gap: 38, rot: 16, w: 0.95, h: 0.66 },
  surprised: { shape: 'round',   x: 16, y: -54, gap: 46, rot: 10, w: 0.92, h: 1.35 },
  excited:   { shape: 'round',   x: 18, y: -58, gap: 48, rot: 14, w: 1.15, h: 1.6 },
  happy:     { shape: 'arc',     x: 18, y: -48, gap: 48, rot: 12, w: 1.05, h: 1.1, arcBend: 1 },
  laugh:     { shape: 'arc',     x: 18, y: -44, gap: 52, rot: 10, w: 1.2,  h: 1.35, arcBend: 1 },
  angry:     { shape: 'capsule', x: 16, y: -54, gap: 44, rot: 0,  w: 1,    h: 0.75, lRot: -14, rRot: 14 },
  sad:       { shape: 'capsule', x: 16, y: -50, gap: 44, rot: 0,  w: 1,    h: 0.8,  lRot: 13,  rRot: -13 },
  scared:    { shape: 'round',   x: 14, y: -52, gap: 52, rot: 8,  w: 0.78, h: 1.1 },
  skeptical: { shape: 'round',   x: 16, y: -54, gap: 46, rot: 12, w: 0.85, h: 1.15, rShape: 'line', rW: 1.0, rH: 0.9 },
  confused:  { shape: 'round',   x: 18, y: -54, gap: 50, rot: 14, w: 0.8,  h: 1.05, rW: 1.1, rH: 0.72 },
  curious:   { shape: 'round',   x: 20, y: -58, gap: 48, rot: 20, w: 0.72, h: 1.15, rW: 1.05, rH: 0.85 },
  smug:      { shape: 'arc',     x: 16, y: -50, gap: 46, rot: 10, w: 0.9,  h: 0.9,  rShape: 'line', rW: 0.95, rH: 0.55 },
  shy:       { shape: 'capsule', x: 14, y: -38, gap: 36, rot: 12, w: 0.8,  h: 0.62 },
  bored:     { shape: 'capsule', x: 16, y: -46, gap: 44, rot: 10, w: 0.95, h: 0.45 },
  sleepy:    { shape: 'line',    x: 16, y: -42, gap: 42, rot: 8,  w: 0.9,  h: 1 },
};

export const MOOD_ORDER = Object.keys(MOODS);

/** 取某表情某只眼睛的点集(独立几何,支持左右不同形) */
export function eyePoints(mood, side) {
  const m = MOODS[mood];
  const shape = (side === 'l' ? m.lShape : m.rShape) || m.shape;
  return EYE_GEO[shape] || EYE_GEO.capsule;
}

/** 眼睛几何的逐眼尺寸参数(插值用) */
export function eyeParams(mood, side) {
  const m = MOODS[mood];
  return {
    x: m.x + (side === 'l' ? -m.gap / 2 : m.gap / 2),
    y: m.y,
    rot: m.rot + (side === 'l' ? m.lRot ?? 0 : m.rRot ?? 0),
    sx: (side === 'l' ? m.lW ?? m.w : m.rW ?? m.w),
    sy: (side === 'l' ? m.lH ?? m.h : m.rH ?? m.h),
  };
}
