/**
 * shapes.js — 8 种基础身体形状
 * 全部编译为 BODY_POINTS 采样点集,形状间 morph = 点集插值。
 * 坐标系:中心为原点,基准半径 100,viewBox 取 -158..158 留出形变余量。
 */
import { polarPoints, polygonPoints, BODY_POINTS, TAU } from '../core/geometry.js';

/** 高斯鼓包:r(θ) 上叠加局部隆起,用于云朵/卵石的有机轮廓 */
function bump(theta, center, width, amp) {
  let d = Math.abs(theta - center) % TAU;
  if (d > Math.PI) d = TAU - d;
  return amp * Math.exp(-(d * d) / (2 * width * width));
}

export const SHAPES = {
  circle: {
    id: 'circle',
    eyeFit: { dy: 0, s: 1 },
    build: () => polarPoints(() => 100),
  },
  pebble: {
    id: 'pebble',
    eyeFit: { dy: 0, s: 1 },
    build: () =>
      polarPoints(
        (a) => 100 * (1 + 0.07 * Math.cos(a - 0.9) + 0.045 * Math.cos(2 * a + 0.6)),
      ),
  },
  roundedSquare: {
    id: 'roundedSquare',
    eyeFit: { dy: 0, s: 1 },
    // 超椭圆:指数越大越方
    build: () =>
      polarPoints((a) => {
        const c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
        const n = 4.2;
        return 100 / Math.pow(c ** n + s ** n, 1 / n);
      }),
  },
  capsule: {
    id: 'capsule',
    eyeFit: { dy: 4, s: 1 },
    // 横向胶囊:超椭圆 + 各向异性缩放
    build: () =>
      polarPoints(
        (a) => {
          const c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
          const n = 8;
          return 100 / Math.pow(c ** n + s ** n, 1 / n);
        },
        BODY_POINTS,
        1.42,
        0.58,
      ),
  },
  triangle: {
    id: 'triangle',
    eyeFit: { dy: 22, s: 0.88 },
    // 圆角三角形:顶点朝上,Chaikin 圆角化(半径补偿收缩)
    build: () => {
      const R = 134;
      const verts = [];
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i * TAU) / 3;
        verts.push([Math.cos(a) * R, Math.sin(a) * R]);
      }
      return polygonPoints(verts, BODY_POINTS, 3);
    },
  },
  hexagon: {
    id: 'hexagon',
    eyeFit: { dy: 2, s: 0.97 },
    build: () => {
      const R = 106;
      const verts = [];
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i * TAU) / 6;
        verts.push([Math.cos(a) * R, Math.sin(a) * R]);
      }
      return polygonPoints(verts, BODY_POINTS, 3);
    },
  },
  cloud: {
    id: 'cloud',
    eyeFit: { dy: 12, s: 0.94 },
    // 上方三个鼓包、底部压平
    build: () =>
      polarPoints(
        (a) => {
          // 屏幕坐标 y 向下,上方 = a ≈ -π/2 或 3π/2;统一到 0..TAU(起点 -π/2 即顶部)
          let t = (a + Math.PI / 2 + TAU) % TAU; // 0 = 正上
          let r = 92;
          r += bump(t, 0.9, 0.45, 30);
          r += bump(t, 2.1, 0.5, 34);
          r += bump(t, Math.PI, 0.55, 28);
          // 底部(t 接近 3π/2)压平:压 y
          return r;
        },
        BODY_POINTS,
        1.12,
        0.82,
      ),
  },
  drop: {
    id: 'drop',
    eyeFit: { dy: 18, s: 0.9 },
    // 水滴:尖端朝上,底部饱满
    build: () =>
      polarPoints((a) => {
        // t: 0 = 正上,顺时针
        const t = (a + Math.PI / 2 + TAU) % TAU;
        // 上半(尖端)收窄,下半圆润
        const k = Math.cos(t); // 1=顶 -1=底
        const sharp = Math.pow(Math.max(0, k), 3); // 顶部权重
        const r = 98 * (1 - 0.3 * sharp) + 14 * Math.pow(Math.max(0, -k), 2);
        return r;
      }),
  },
};

/** 预编译所有形状点集 */
export const SHAPE_POINTS = Object.fromEntries(
  Object.values(SHAPES).map((s) => [s.id, s.build()]),
);

export const SHAPE_ORDER = [
  'circle', 'pebble', 'roundedSquare', 'capsule',
  'triangle', 'hexagon', 'cloud', 'drop',
];
