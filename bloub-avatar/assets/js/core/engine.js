/**
 * engine.js — Avatar 渲染引擎
 *
 * 单一 rAF 循环驱动:基础形状点集 → 状态动画参数变换 → 平滑贝塞尔 path,
 * 同步更新页面上所有注册的渲染实例(大头像 + 各迷你预览)。
 * computeFrame 是纯函数,canvas 导出(GIF/WebM/PNG)与 DOM 渲染共用同一条管线。
 *
 * 丝滑要点:
 * - 全部属性数值插值,点集运算纯 TypedArray,单帧微秒级
 * - 状态切换不瞬变:旧帧参数向新状态缓动过渡,无跳变
 */
import { pointsToPath, lerpPoints, TAU, EYE_POINTS, BODY_POINTS } from './geometry.js';
import { SHAPE_POINTS, SHAPES } from '../data/shapes.js';
import { MOODS, eyePoints, eyeParams } from '../data/moods.js';
import { BODY_PROPS, EYE_PROPS, evalTrack, OVERRIDES, ANIMATIONS as ANIMS } from '../data/animations.js';
import { ease } from './easing.js';

/** 求值某动画在 t(秒) 的参数轨道 */
function evalAnim(animId, t, bodyOut, eyeOut) {
  const anim = ANIMS[animId] || ANIMS.idle;
  const tNorm = ((t * 1000) % anim.duration) / anim.duration;
  const orbitPhase = anim.orbit ? tNorm * TAU - Math.PI / 2 : null;
  evalTrack(anim.body, tNorm, orbitPhase, bodyOut);
  evalTrack(anim.eyes, tNorm, anim.orbit ? orbitPhase : null, eyeOut);
  return anim;
}

/** 眼睛 path(两眼一起),叠加动画参数、眨眼乘子、形状适配与表情切换过渡 */
function buildEyes(shape, mood, anim, blinkMul, eyeMorph = null) {
  const m = MOODS[mood];
  if (!m) return '';
  const fit = SHAPES[shape]?.eyeFit ?? { dy: 0, s: 1 };
  let d = '';
  for (const side of ['l', 'r']) {
    const p = eyeParams(mood, side);
    const mid = anim.ex + (side === 'l' ? -anim.egap / 2 : anim.egap / 2);
    const cx = (p.x + mid) * fit.s + (side === 'l' ? anim.elx : anim.erx);
    const cy = p.y * fit.s + fit.dy + anim.ey + (side === 'l' ? anim.ely : anim.ery);
    const rot = (p.rot + anim.erot) * Math.PI / 180;
    const sx = p.sx * anim.escale * fit.s;
    const sy = p.sy * anim.escale * anim.esy * blinkMul * fit.s;
    let geo = eyePoints(mood, side);
    // 表情切换过渡:旧眼形点集 → 新眼形点集
    if (eyeMorph && eyeMorph.k < 1) {
      const from = side === 'l' ? eyeMorph.l : eyeMorph.r;
      geo = lerpPoints(from, geo, eyeMorph.k, new Float64Array(geo.length));
    }
    const k = geo.length / 2;
    const tp = new Float64Array(geo.length);
    for (let i = 0; i < k; i++) {
      const gx = geo[i * 2] * sx, gy = geo[i * 2 + 1] * sy;
      tp[i * 2] = cx + gx * Math.cos(rot) - gy * Math.sin(rot);
      tp[i * 2 + 1] = cy + gx * Math.sin(rot) + gy * Math.cos(rot);
    }
    d += pointsToPath(tp);
  }
  return d;
}

/**
 * 纯函数:一帧 = { bodyD, eyeD }。
 * trans 可选:{ body, eye, k } 旧帧参数向当前帧混合(状态切换过渡);
 * bodyMorph 可选:{ from, k } 旧形状点集向新形状插值(形状切换过渡);
 * eyeMorph 可选:{ l, r, k } 旧眼形点集向新眼形插值(表情切换过渡)。
 */
export function computeFrame(shape, mood, animId, t, blinkMul = 1, trans = null, bodyMorph = null, eyeMorph = null) {
  const body = { ...BODY_PROPS };
  const eyes = { ...EYE_PROPS };
  evalAnim(animId, t, body, eyes);
  if (trans) {
    for (const key in body) body[key] = trans.body[key] + (body[key] - trans.body[key]) * trans.k;
    for (const key in eyes) eyes[key] = trans.eye[key] + (eyes[key] - trans.eye[key]) * trans.k;
  }

  // ---- 身体 ----
  const base = SHAPE_POINTS[shape] || SHAPE_POINTS.circle;
  const override = body.baseBlend > 0.001 ? OVERRIDES.egg : null;
  let blend = override ? lerpPoints(base, override, body.baseBlend, new Float64Array(base.length)) : base;
  // 形状切换过渡:旧形状点集 → 新形状点集
  if (bodyMorph && bodyMorph.k < 1) {
    blend = lerpPoints(bodyMorph.from, blend, bodyMorph.k, new Float64Array(blend.length));
  }
  const cr = Math.cos((body.rot * Math.PI) / 180);
  const sr = Math.sin((body.rot * Math.PI) / 180);
  const n = blend.length / 2;
  const out = new Float64Array(blend.length);
  for (let i = 0; i < n; i++) {
    let x = blend[i * 2], y = blend[i * 2 + 1];
    const r = Math.hypot(x, y);
    const a = Math.atan2(y, x);
    let rm = 1;
    if (body.wobAmp) rm += body.wobAmp * Math.sin(body.wobN * a + (body.wobPhase * TAU) / 8);
    if (body.spikeAmp) {
      const s2 = Math.abs(Math.sin(body.spikeN * a + (body.spikePhase * TAU) / 8));
      rm += body.spikeAmp * Math.pow(s2, body.spikeK);
    }
    x = Math.cos(a) * r * rm;
    y = Math.sin(a) * r * rm;
    if (body.twist) {
      const w = body.twist * (r / 100);
      const cw = Math.cos(w), sw = Math.sin(w);
      const nx = x * cw - y * sw;
      y = x * sw + y * cw;
      x = nx;
    }
    x *= body.scale * body.sx;
    y *= body.scale * body.sy;
    out[i * 2] = x * cr - y * sr;
    out[i * 2 + 1] = x * sr + y * cr;
  }
  return { bodyD: pointsToPath(out), eyeD: buildEyes(shape, mood, eyes, blinkMul, eyeMorph) };
}

/** DOM 渲染实例 */
export class AvatarInstance {
  /**
   * @param el 包装节点;内部创建 SVG。
   * @param opts.size 渲染像素(默认 CSS 决定);state 引用共享状态对象
   */
  constructor(mount, { classId = '', size = 440 } = {}) {
    this.state = null; // 由 attach() 注入
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '-158 -158 316 316');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    if (classId) svg.setAttribute('class', classId);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-hidden', 'true');
    const maskId = 'bm-' + Math.random().toString(36).slice(2, 8);
    const defs = document.createElementNS(NS, 'defs');
    const mask = document.createElementNS(NS, 'mask');
    mask.setAttribute('id', maskId);
    mask.setAttribute('maskUnits', 'userSpaceOnUse');
    mask.setAttribute('x', '-158'); mask.setAttribute('y', '-158');
    mask.setAttribute('width', '316'); mask.setAttribute('height', '316');
    const maskPath = document.createElementNS(NS, 'path');
    maskPath.setAttribute('fill', '#fff');
    maskPath.setAttribute('fill-rule', 'evenodd');
    mask.appendChild(maskPath);
    defs.appendChild(mask);
    const fill = document.createElementNS(NS, 'rect');
    fill.setAttribute('x', '-158'); fill.setAttribute('y', '-158');
    fill.setAttribute('width', '316'); fill.setAttribute('height', '316');
    fill.setAttribute('mask', `url(#${maskId})`);
    svg.appendChild(defs);
    svg.appendChild(fill);
    mount.appendChild(svg);
    this.svg = svg;
    this.maskEl = maskPath;
    this.fillEl = fill;
    this._t = 0;
  }

  attach(state) {
    this.state = state;
    this._applyColor();
  }

  setColor(hex) {
    this.fillEl.setAttribute('fill', hex);
    this.fillEl.style.outline = 'none';
  }

  _applyColor() {
    if (this.state?.color) this.setColor(this.state.color);
  }

  render(t, blinkMul) {
    const s = this.state;
    if (!s) return;
    // 状态切换过渡
    let trans = null;
    if (s.transK < 1) {
      s.transK = Math.min(1, s.transK + 1 / 33);
      trans = { body: s.transBody, eye: s.transEye, k: ease.outQuint(s.transK) };
    }
    // 形状切换过渡(0.5s 缓出)
    if (this._lastShape == null) this._lastShape = s.shape;
    if (s.shape !== this._lastShape) {
      this._bodyMorph = { from: SHAPE_POINTS[this._lastShape] || SHAPE_POINTS.circle, k: 0 };
      this._lastShape = s.shape;
    }
    let bodyMorph = null;
    if (this._bodyMorph && this._bodyMorph.k < 1) {
      this._bodyMorph.k = Math.min(1, this._bodyMorph.k + 1 / 30);
      bodyMorph = { from: this._bodyMorph.from, k: ease.outQuint(this._bodyMorph.k) };
    }
    // 表情切换过渡
    if (this._lastMood == null) this._lastMood = s.mood;
    if (s.mood !== this._lastMood) {
      this._eyeMorph = {
        l: eyePoints(this._lastMood, 'l').slice(),
        r: eyePoints(this._lastMood, 'r').slice(),
        k: 0,
      };
      this._lastMood = s.mood;
    }
    let eyeMorph = null;
    if (this._eyeMorph && this._eyeMorph.k < 1) {
      this._eyeMorph.k = Math.min(1, this._eyeMorph.k + 1 / 30);
      eyeMorph = { l: this._eyeMorph.l, r: this._eyeMorph.r, k: ease.outQuint(this._eyeMorph.k) };
    }
    const { bodyD, eyeD } = computeFrame(s.shape, s.mood, s.animId || 'idle', t, blinkMul, trans, bodyMorph, eyeMorph);
    this.maskEl.setAttribute('d', bodyD + eyeD);
  }
}

export class AvatarEngine {
  constructor() {
    this.instances = new Set();
    this.time = 0;
    this._last = performance.now();
    this._blinkT = -1;
    this._nextBlink = 2.6 + Math.random() * 3;
  }

  register(inst) {
    this.instances.add(inst);
    inst.render(this.time, 1);
    if (this.instances.size === 1) requestAnimationFrame(this._loop.bind(this));
  }

  unregister(inst) {
    this.instances.delete(inst);
  }

  /** 状态动画切换:记录当前帧参数,0.55s 缓动到新状态 —— 无跳变 */
  setAnimation(state, animId) {
    if (state.animId === animId) return;
    const body = { ...BODY_PROPS }, eyes = { ...EYE_PROPS };
    evalAnim(state.animId || 'idle', this.time, body, eyes);
    state.transBody = body;
    state.transEye = eyes;
    state.transK = 0;
    state.animId = animId;
  }

  _loop(now) {
    if (!this.instances.size) return;
    const dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    this.time += dt;
    this._nextBlink -= dt;
    if (this._nextBlink <= 0) {
      this._blinkT = 0;
      this._nextBlink = 2.8 + Math.random() * 3.4;
    }
    if (this._blinkT >= 0) {
      this._blinkT += dt;
      if (this._blinkT > 0.36) this._blinkT = -1;
    }
    const blinkMul = this._blinkT >= 0 ? 1 - Math.sin((this._blinkT / 0.36) * Math.PI) * 0.94 : 1;
    for (const inst of this.instances) inst.render(this.time, blinkMul);
    requestAnimationFrame(this._loop.bind(this));
  }
}

export { BODY_POINTS, EYE_POINTS };
