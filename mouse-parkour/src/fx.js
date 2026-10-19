/* =========================================================================
 * MP.FX — 《鼠族跑酷 · MOUSE RUSH》Canvas2D 粒子特效 / 打击感模块
 * 覆盖：对象池粒子（spark/fire/debris/smoke/star/confetti/ring/glow）、
 *       冲击环、爆炸组合、拖尾、伤害数字与拾取飘字、屏幕中央大字幕、
 *       屏幕闪、慢动作时间缩放、trauma 震屏、低命红晕、边缘速度线。
 *
 * 纪律（契约 §0 / §2.3）：
 *   1) 顶层不声明 const MP，只做 window.MP = window.MP || {};
 *   2) 加载期不调用其它模块；MP.ART 访问全部延迟到运行时且带 typeof 兜底；
 *   3) 零外部资源：所有贴图都是运行时用 Canvas2D 画出的离屏小图；
 *   4) 严禁 ctx.shadowBlur —— 发光一律"缓存径向渐变贴图 + globalCompositeOperation='lighter'"；
 *   5) render() 内不逐帧 new 渐变：渐变贴图首次用到时缓存，之后只 drawImage；
 *   6) render() 结束必须把 globalCompositeOperation / globalAlpha 等全局状态还原。
 * ========================================================================= */
window.MP = window.MP || {};
MP.FX = (() => { 'use strict';

// ============================ 常量 ============================
const MAXP_HIGH = 520;        // 高画质粒子池硬上限
const MAXP_LOW  = 260;        // 低画质粒子池硬上限
const SHAKE_AMP = 18;         // trauma = 1 时的最大位移(px)
const SHAKE_DECAY = 1.6;      // trauma 每秒线性衰减
const TAU = Math.PI * 2;
const FONT = '"PingFang SC","Microsoft YaHei",system-ui,sans-serif';

// ============================ 状态 ============================
let canvas = null, W = 480, H = 800;
let list = [], pool = [];     // 活动粒子 / 空闲对象池
let capMax = MAXP_HIGH;       // 当前硬上限
let lowQ = false;             // 低画质
let bornCounter = 0;          // 粒子出生序号（用于"丢最旧"）
let trauma = 0;               // 震屏累积量 0..1
let flashCol = '255,255,255', flashA = 0, flashT = 0, flashDur = 0.001;
let slowScale = 1, slowT = 0; // 慢动作：倍率 + 剩余真实时间
let popupStr = '', popupSub = '', popupCol = '#ffd23f';
let popupSize = 44, popupLife = 1.2, popupT = 0, popupY = 0.44;
let vignette = false, vigPhase = 0;
let speedLines = 0, slPhase = 0;
let elapsed = 0;              // 真实时间累计（呼吸/摆动相位）
let vigGrad = null, vigKey = '';  // 晕影渐变缓存（按设备尺寸重建）
const _off = { x: 0, y: 0 };  // shakeOffset 返回的复用对象（立即取值，勿长期持有）

// ============================ 工具 ============================
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

// 颜色 -> 'r,g,b'
const _rgbCache = {};
function rgbOf(col) {
  let v = _rgbCache[col];
  if (v) return v;
  let r = 255, g = 255, b = 255, m;
  if (col && col.charAt(0) === '#') {
    let hex = col.slice(1);
    if (hex.length === 3) hex = hex.replace(/./g, '$&$&');
    r = parseInt(hex.slice(0, 2), 16) || 0;
    g = parseInt(hex.slice(2, 4), 16) || 0;
    b = parseInt(hex.slice(4, 6), 16) || 0;
  } else if ((m = String(col).match(/[\d.]+/g))) {
    r = +m[0] | 0; g = +m[1] | 0; b = +m[2] | 0;
  }
  v = r + ',' + g + ',' + b;
  _rgbCache[col] = v;
  return v;
}

function hasDom() {
  return typeof document !== 'undefined' && !!document && typeof document.createElement === 'function';
}

// 可复现伪随机（震屏用，避免每帧真随机导致抖动噪点不可控）
let srandState = 0x9E3779B9;
function srand() {
  srandState ^= srandState << 13; srandState >>>= 0;
  srandState ^= srandState >>> 17;
  srandState ^= srandState << 5;  srandState >>>= 0;
  return srandState / 4294967296;
}

// ============================ 贴图缓存 ============================
// 兜底发光贴图：径向渐变圆盘（只创建一次并缓存，render 内不再 new 渐变）
const _sprites = {};
function glowSprite(col) {
  let s = _sprites[col];
  if (s) return s;
  if (!hasDom()) return null;
  s = document.createElement('canvas');
  s.width = s.height = 64;
  const g = s.getContext('2d');
  const rgb = rgbOf(col);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(' + rgb + ',1)');
  gr.addColorStop(0.25, 'rgba(' + rgb + ',0.62)');
  gr.addColorStop(0.6, 'rgba(' + rgb + ',0.17)');
  gr.addColorStop(1, 'rgba(' + rgb + ',0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  _sprites[col] = s;
  return s;
}

// 美术模块的程序化粒子贴图（运行时才访问，且带兜底；未就绪不缓存，下次再试）
const _artTex = {};
function artTex(kind) {
  if (_artTex[kind]) return _artTex[kind];
  let t = null;
  try {
    if (typeof MP !== 'undefined' && MP.ART && typeof MP.ART.particleTex === 'function') {
      t = MP.ART.particleTex(kind) || null;
      if (t) _artTex[kind] = t;
    }
  } catch (e) { t = null; }
  return t;
}

// 统一的软体绘制：优先用美术模块贴图，否则用本地渐变贴图
function drawBlob(ctx, artKind, fallbackCol, p, s, alpha) {
  ctx.globalAlpha = alpha < 0 ? 0 : (alpha > 1 ? 1 : alpha);
  const tex = artTex(artKind);
  if (tex) { ctx.drawImage(tex, p.x - s, p.y - s, s * 2, s * 2); return; }
  const g = glowSprite(fallbackCol);
  if (g) ctx.drawImage(g, p.x - s, p.y - s, s * 2, s * 2);
}

// ============================ 粒子默认值 ============================
const DEF = {
  spark:    { n: 10, spd: 220, size: 2.2, life: 0.32, grav: 320,  drag: 4.5, colors: ['#fff4c8', '#ffd23f', '#ffffff'] },
  fire:     { n: 8,  spd: 80,  size: 12,  life: 0.52, grav: -60,  drag: 2.4, colors: ['#ffe27a', '#ff8a3d', '#ff5a2a'] },
  debris:   { n: 6,  spd: 170, size: 3.6, life: 0.90, grav: 1100, drag: 0.6, colors: ['#8e9bb3', '#e9eef7', '#5a6478'] },
  smoke:    { n: 6,  spd: 44,  size: 11,  life: 0.95, grav: -24,  drag: 1.5, colors: ['#9aa3b2', '#c3ccd8'] },
  dust:     { n: 8,  spd: 120, size: 7,   life: 0.45, grav: 40,   drag: 2.2, colors: ['#c8d0e6', '#e8eef8'] },
  star:     { n: 6,  spd: 140, size: 8,   life: 0.45, grav: 60,   drag: 3.2, colors: ['#fff2b0', '#ffd23f', '#ffffff'] },
  confetti: { n: 14, spd: 210, size: 5,   life: 1.50, grav: 420,  drag: 1.1, colors: ['#35e0c8', '#ff4d8d', '#ffd23f', '#4aa3ff', '#b07cff'] },
  ring:     { n: 1,  spd: 0,   size: 0,   life: 0.42, grav: 0,    drag: 0,   colors: ['#ffffff'] },
  glow:     { n: 6,  spd: 70,  size: 14,  life: 0.50, grav: 0,    drag: 3.0, colors: ['#ffffff', '#ffe9b0'] },
  trail:    { n: 1,  spd: 0,   size: 3.2, life: 0.26, grav: 0,    drag: 0,   colors: ['#ffd23f'] }
};

// 池满时的回收优先级：数字越小越先被丢弃（text 最高，最后才丢）
const EVICT = { smoke: 0, dust: 0, trail: 0, glow: 1, fire: 1, spark: 2, confetti: 2, star: 2, ring: 3, debris: 3, text: 4 };

// ============================ 对象池 ============================
function acquire() {
  if (list.length < capMax) {
    const p = pool.pop() || {};
    list.push(p);
    p.born = ++bornCounter;
    return p;
  }
  // 池满：优先丢"最不重要且最旧"的粒子
  let bi = -1, bp = 99, ba = Infinity;
  for (let i = 0; i < list.length; i++) {
    const q = list[i];
    const pr = EVICT[q.kind] !== undefined ? EVICT[q.kind] : 5;
    if (pr < bp || (pr === bp && q.born < ba)) { bi = i; bp = pr; ba = q.born; }
  }
  const p = list.splice(bi, 1)[0];
  list.push(p);
  p.born = ++bornCounter;
  return p;
}

function release(i) {
  const p = list[i];
  const last = list.pop();
  if (i < list.length) list[i] = last;
  pool.push(p);
}

// ============================ 生成器 ============================
// o: {kind, n, color|colors, spd, size, life, grav, spread, angle}
function burst(x, y, o) {
  o = o || {};
  const kind = DEF[o.kind] ? o.kind : 'spark';
  const d = DEF[kind];
  let n = Math.round((o.n !== undefined ? o.n : d.n) * (lowQ ? 0.5 : 1));
  if (n < 1) n = 1;
  const cols = o.colors || (o.color ? [o.color] : d.colors);
  const hasAng = (o.angle !== undefined) || (o.ang !== undefined);
  const baseAng = o.angle !== undefined ? o.angle : (o.ang !== undefined ? o.ang : null);
  const spread = o.spread !== undefined ? o.spread : (hasAng ? 0.9 : TAU);
  const lifeBase = o.life !== undefined ? o.life : d.life;
  const sizeBase = o.size !== undefined ? o.size : d.size;
  const spdBase = o.spd !== undefined ? o.spd : d.spd;
  for (let i = 0; i < n; i++) {
    const p = acquire();
    const a = baseAng === null ? Math.random() * TAU : baseAng + (Math.random() - 0.5) * spread;
    const sp = spdBase * (0.4 + Math.random() * 0.9);
    p.kind = kind; p.age = 0;
    p.x = x; p.y = y;
    p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
    p.size = sizeBase * (0.7 + Math.random() * 0.6);
    p.life = lifeBase * (0.75 + Math.random() * 0.5);
    p.grav = o.grav !== undefined ? o.grav : d.grav;
    p.drag = d.drag;
    p.color = cols[(Math.random() * cols.length) | 0];
    p.rot = Math.random() * TAU;
    p.vr = (Math.random() - 0.5) * 12;
    p.phase = Math.random() * TAU;
    p.txt = ''; p.vy = 0; p.r0 = 0; p.r1 = 0; p.w = 0;
  }
}

// o: {r0, r1, life, color, width}
function ring(x, y, o) {
  o = o || {};
  const p = acquire();
  p.kind = 'ring'; p.age = 0;
  p.x = x; p.y = y;
  p.vx = 0; p.vy = 0;
  p.r0 = o.r0 !== undefined ? o.r0 : 6;
  p.r1 = o.r1 !== undefined ? o.r1 : 72;
  p.life = o.life !== undefined ? o.life : 0.42;
  p.w = o.width !== undefined ? o.width : 4;
  p.color = o.color || '#ffffff';
  p.grav = 0; p.drag = 0; p.size = 0;
  p.rot = 0; p.vr = 0; p.txt = ''; p.phase = 0;
}

// 中心白热光斑（爆炸核心）
function core(x, y, color, size, life) {
  const p = acquire();
  p.kind = 'glow'; p.age = 0;
  p.x = x; p.y = y; p.vx = 0; p.vy = 0;
  p.size = size; p.life = life;
  p.grav = 0; p.drag = 0; p.color = color;
  p.rot = 0; p.vr = 0; p.txt = ''; p.phase = 0; p.r0 = 0; p.r1 = 0; p.w = 0;
}

// 组合拳：白热核心 + 双冲击环 + 火 + 碎片 + 烟 + 火星（+ 轻屏幕闪）
function explosion(x, y, scale, o) {
  o = o || {};
  const s = clamp(scale === undefined ? 1 : scale, 0.4, 3);
  const h = lowQ ? 0.5 : 1;
  core(x, y, o.core || '#ffffff', 16 + 14 * s, 0.09 + 0.03 * s);
  core(x, y, o.glow || '#ffb347', 20 + 20 * s, 0.2 + 0.08 * s);
  ring(x, y, { r0: 4 * s, r1: 48 + 34 * s, life: 0.26, color: o.ring || '#fff2c0', width: 5 * s });
  ring(x, y, { r0: 6 * s, r1: 92 + 50 * s, life: 0.55, color: o.ring2 || '#ff6b3d', width: 3 * s });
  burst(x, y, { kind: 'fire', n: Math.round((8 + 10 * s) * h), size: 6 + 7 * s, spd: 70 + 130 * s, colors: o.colors });
  burst(x, y, { kind: 'debris', n: Math.round((5 + 5 * s) * h), size: 2.6 + 2.4 * s, spd: 110 + 170 * s, colors: o.colors });
  burst(x, y, { kind: 'smoke', n: Math.round((4 + 3 * s) * h), size: 9 + 9 * s, spd: 30 + 30 * s });
  burst(x, y, { kind: 'spark', n: Math.round((5 + 7 * s) * h), size: 2 + 1.2 * s, spd: 190 + 180 * s });
  if (o.flash !== false) flash(o.flashColor || '#ffd8a0', o.flashAlpha !== undefined ? o.flashAlpha : 0.12, o.flashMs || 90);
  if (o.shake) addShake(o.shake);
}

// o: {color, size, life}（低画质下禁拖尾）
function trail(x, y, o) {
  if (lowQ) return;
  o = o || {};
  const p = acquire();
  p.kind = 'trail'; p.age = 0;
  p.x = x; p.y = y; p.vx = 0; p.vy = 0;
  p.size = o.size !== undefined ? o.size : 3.2;
  p.life = o.life !== undefined ? o.life : 0.26;
  p.grav = 0; p.drag = 0;
  p.color = o.color || '#ffd23f';
  p.rot = 0; p.vr = 0; p.txt = ''; p.phase = 0; p.r0 = 0; p.r1 = 0; p.w = 0;
}

// 伤害数字 / 拾取飘字（描边 + 上浮淡出）
// o: {color, size, crit, vy, life, stroke}
function floatText(x, y, str, o) {
  o = o || {};
  const crit = !!o.crit;
  const p = acquire();
  p.kind = 'text'; p.age = 0;
  p.x = x; p.y = y;
  p.txt = str === null || str === undefined ? '' : String(str);
  p.size = (o.size !== undefined ? o.size : 18) * (crit ? 1.35 : 1);
  p.color = o.color || (crit ? '#ffd23f' : '#ffffff');
  p.vy = o.vy !== undefined ? o.vy : (crit ? 86 : 64);   // 上浮速度(px/s)
  p.life = o.life !== undefined ? o.life : 0.9;
  p.grav = 0; p.drag = 0; p.vx = 0;
  p.rot = 0; p.vr = 0; p.phase = 0; p.r0 = 0; p.r1 = 0; p.w = 0;
}

// 屏幕中央大字幕（连击 / 必杀 / 升级）
// o: {color, size, life, sub, y}
function popup(str, o) {
  o = o || {};
  popupStr = str === null || str === undefined ? '' : String(str);
  popupSub = o.sub === null || o.sub === undefined ? '' : String(o.sub);
  popupCol = o.color || '#ffd23f';
  popupSize = o.size !== undefined ? o.size : 44;
  popupLife = o.life !== undefined ? o.life : 1.2;
  popupY = o.y !== undefined ? o.y : 0.44;
  popupT = 0;
}

// 屏幕闪（受击红闪 / 拾取金闪 / 无敌白闪）
function flash(color, alpha, ms) {
  const a = clamp(alpha === undefined ? 0.5 : alpha, 0, 1);
  if (a <= 0) return;
  flashCol = rgbOf(color || '#ffffff');
  flashA = a;
  flashT = 0;
  flashDur = Math.max(0.016, (ms === undefined ? 180 : ms) / 1000);
}

// 慢动作（timeScale() 供 game.js 读取）
// scale >= 1 或 dur <= 0 视为"取消慢动作"（game.js 重开关卡时用 slowmo(1,0)）
function slowmo(scale, dur) {
  if ((scale !== undefined && scale >= 1) || (dur !== undefined && dur <= 0)) {
    slowT = 0; slowScale = 1; return;
  }
  const s = clamp(scale === undefined ? 0.5 : scale, 0.05, 1);
  const d = Math.max(0, dur === undefined ? 0.5 : dur);
  if (slowT <= 0 || s <= slowScale) { slowScale = s; slowT = d; }
  else { slowT = Math.max(slowT, d); }   // 已有更强慢动作，只延长时长
}

function timeScale() { return slowT > 0 ? slowScale : 1; }

// 震屏：trauma 累加（上限 1），偏移 = trauma^2 * 18px
function addShake(amount) {
  if (!(amount > 0)) return;
  trauma = Math.min(1, trauma + amount);
}

function shakeOffset() {
  const t2 = trauma * trauma;
  if (t2 < 0.0004) { _off.x = 0; _off.y = 0; return _off; }
  const m = t2 * SHAKE_AMP;
  _off.x = (srand() * 2 - 1) * m;
  _off.y = (srand() * 2 - 1) * m;
  return _off;
}

// 速度线强度（0 关闭，0~1）；低画质强制关闭
function setSpeedLines(intensity) {
  speedLines = clamp(intensity === undefined ? 0 : intensity, 0, 1);
}

// 低命红晕
function setVignette(alive) { vignette = !!alive; }

// 画质：'high' | 'low'（低画质：粒子减半、禁速度线、禁拖尾）
function setQuality(q) {
  lowQ = (q === 'low');
  capMax = lowQ ? MAXP_LOW : MAXP_HIGH;
  while (list.length > capMax) { const p = list.pop(); pool.push(p); }
}

// 清空全部瞬时状态
function clear() {
  while (list.length) pool.push(list.pop());
  trauma = 0;
  flashA = 0; flashT = 0;
  slowScale = 1; slowT = 0;
  popupStr = ''; popupSub = ''; popupT = 0;
}

function resize(w, h) {
  if (w > 0) W = w;
  if (h > 0) H = h;
  vigGrad = null; vigKey = '';   // 晕影渐变与尺寸绑定，尺寸变了要重建
}

function init(cv) {
  canvas = cv || null;
  while (list.length) pool.push(list.pop());
  trauma = 0; flashA = 0; flashT = 0;
  slowScale = 1; slowT = 0;
  popupStr = ''; popupSub = ''; popupT = 0;
  const w = (canvas && (canvas.clientWidth || canvas.width)) || W;
  const h = (canvas && (canvas.clientHeight || canvas.height)) || H;
  resize(w, h);
}

// ============================ 更新 ============================
// dt: 秒。默认按"已被 timeScale 缩放过"处理（game.js 传的是 dt*timeScale()），
// 粒子直接用该 dt 推进；慢动作/震屏/闪光的计时换算回真实时间。
// 若调用方传的是未缩放的原始 dt，请传第二参 false，由本模块内部乘 slowmo 倍率。
function update(dt, alreadyScaled) {
  if (!(dt > 0)) return;
  if (dt > 0.05) dt = 0.05;
  const scaled = (alreadyScaled === undefined) ? true : !!alreadyScaled;
  const ts = timeScale();
  const realDt = scaled ? dt / Math.max(0.05, ts) : dt;   // 真实时间步
  const sdt = scaled ? dt : dt * ts;                       // 粒子时间步

  elapsed += realDt;
  vigPhase += realDt;
  slPhase += realDt;

  if (slowT > 0) { slowT -= realDt; if (slowT <= 0) { slowT = 0; slowScale = 1; } }
  if (trauma > 0) { trauma -= SHAKE_DECAY * realDt; if (trauma < 0) trauma = 0; }
  if (flashA > 0) { flashT += realDt; if (flashT >= flashDur) flashA = 0; }
  if (popupStr) { popupT += realDt; if (popupT >= popupLife) { popupStr = ''; popupSub = ''; popupT = 0; } }

  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.age += sdt;
    if (p.age >= p.life) { release(i); continue; }
    switch (p.kind) {
      case 'text':
        p.y -= p.vy * sdt; p.vy *= Math.exp(-2.4 * sdt);
        break;
      case 'ring':
        break;
      case 'debris': {
        p.vy += p.grav * sdt;
        const e = Math.exp(-p.drag * sdt); p.vx *= e;
        p.x += p.vx * sdt; p.y += p.vy * sdt; p.rot += p.vr * sdt;
        break;
      }
      case 'confetti': {
        p.vy += p.grav * sdt;
        const e = Math.exp(-p.drag * sdt); p.vx *= e;
        p.x += (p.vx + Math.sin(elapsed * 9 + p.phase) * 34) * sdt;
        p.y += p.vy * sdt; p.rot += p.vr * sdt;
        break;
      }
      case 'smoke': {
        const e = Math.exp(-p.drag * sdt); p.vx *= e;
        p.vy += p.grav * sdt;
        p.x += p.vx * sdt; p.y += p.vy * sdt;
        break;
      }
      default: {   // spark / fire / glow / star / trail
        const e = Math.exp(-p.drag * sdt);
        p.vx *= e; p.vy = p.vy * e + p.grav * sdt;
        p.x += p.vx * sdt; p.y += p.vy * sdt;
        if (p.kind === 'star') p.rot += p.vr * sdt;
        break;
      }
    }
  }
}

// ============================ 绘制 ============================
// 屏幕层用设备像素 + 身份变换铺满，保证任何变换下都不漏边
function screenSize(ctx) {
  let s = 1;
  if (typeof ctx.getTransform === 'function') {
    try { const t = ctx.getTransform(); if (t && t.a) s = Math.abs(t.a); } catch (e) { s = 1; }
  }
  const cw = (ctx.canvas && ctx.canvas.width) || W;
  const ch = (ctx.canvas && ctx.canvas.height) || H;
  return { w: cw / s, h: ch / s };
}

function render(ctx, layer) {
  if (!ctx) return;
  ctx.save();
  try {
    if (layer === 'screen') drawScreen(ctx);
    else drawWorld(ctx);
  } finally {
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }
}

// --- world 层：相机变换内画粒子 / 环 / 飘字 ---
function drawWorld(ctx) {
  const n = list.length;
  let i, p;
  // pass1：普通混合（烟 / 碎片 / 彩纸）
  ctx.globalCompositeOperation = 'source-over';
  for (i = 0; i < n; i++) {
    p = list[i];
    if (p.kind === 'smoke' || p.kind === 'dust') dSmoke(ctx, p);
    else if (p.kind === 'debris') dDebris(ctx, p);
    else if (p.kind === 'confetti') dConfetti(ctx, p);
  }
  // pass2：加色发光（火 / 火星 / 星星 / 光点 / 拖影 / 冲击环）
  ctx.globalCompositeOperation = 'lighter';
  for (i = 0; i < n; i++) {
    p = list[i];
    switch (p.kind) {
      case 'spark': dSpark(ctx, p); break;
      case 'fire': dFire(ctx, p); break;
      case 'star': dStar(ctx, p); break;
      case 'glow': case 'trail': dGlow(ctx, p); break;
      case 'ring': dRing(ctx, p); break;
    }
  }
  // pass3：飘字在最上层
  ctx.globalCompositeOperation = 'source-over';
  for (i = 0; i < n; i++) if (list[i].kind === 'text') dText(ctx, list[i]);
  ctx.globalAlpha = 1;
}

// --- screen 层：速度线 / 屏幕闪 / 红晕 / 中央大字幕（不随相机移动）---
function drawScreen(ctx) {
  const sz = screenSize(ctx);
  ctx.globalCompositeOperation = 'source-over';

  if (speedLines > 0 && !lowQ) drawSpeedLines(ctx, sz);
  if (flashA > 0.002) drawFlash(ctx);
  if (vignette) drawVignette(ctx);
  if (popupStr) drawPopup(ctx, sz);

  ctx.globalAlpha = 1;
}

function drawFlash(ctx) {
  const c = ctx.canvas;
  if (!c) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(' + flashCol + ',' + flashA.toFixed(3) + ')';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.restore();
}

function drawVignette(ctx) {
  const c = ctx.canvas;
  if (!c) return;
  const key = c.width + 'x' + c.height;
  if (!vigGrad || vigKey !== key) {
    const cx = c.width / 2, cy = c.height / 2;
    const g = ctx.createRadialGradient(
      cx, cy, Math.min(c.width, c.height) * 0.30,
      cx, cy, Math.max(c.width, c.height) * 0.75
    );
    g.addColorStop(0, 'rgba(255,60,48,0)');
    g.addColorStop(0.6, 'rgba(255,60,48,0.35)');
    g.addColorStop(1, 'rgba(255,48,40,1)');
    vigGrad = g; vigKey = key;
  }
  const a = 0.20 + 0.12 * Math.sin(vigPhase * 4.2);   // 呼吸
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = a;
  ctx.fillStyle = vigGrad;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.restore();
}

function drawSpeedLines(ctx, sz) {
  const cx = sz.w / 2, cy = sz.h / 2;
  const maxR = Math.hypot(cx, cy);
  const count = 22;
  const inten = clamp(speedLines, 0, 1);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#ffffff';
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + slPhase * 0.55;
    const wob = Math.sin(slPhase * 7 + i * 1.7);
    const r0 = maxR * (0.50 + 0.10 * wob);
    const r1 = r0 + maxR * (0.10 + 0.18 * inten) * (0.55 + 0.65 * Math.abs(wob));
    ctx.globalAlpha = inten * (0.08 + 0.20 * Math.abs(wob));
    ctx.lineWidth = 1.2 + 1.6 * inten;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function drawPopup(ctx, sz) {
  // 弹入 0.55 -> 1.17 -> 1.0，末段淡出
  let sc;
  if (popupT < 0.22) {
    const k = 1 - Math.pow(1 - popupT / 0.22, 3);
    sc = 0.55 + 0.62 * k;
  } else {
    const k = clamp((popupT - 0.22) / 0.18, 0, 1);
    sc = 1.17 - 0.17 * (1 - Math.pow(1 - k, 2));
  }
  let a = 1;
  const fadeStart = popupLife - 0.35;
  if (popupT > fadeStart) a = clamp(1 - (popupT - fadeStart) / 0.35, 0, 1);

  ctx.save();
  ctx.translate(sz.w / 2, sz.h * popupY);
  ctx.scale(sc, sc);
  ctx.globalAlpha = a;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.font = '900 ' + popupSize + 'px ' + FONT;
  ctx.lineWidth = Math.max(4, popupSize * 0.17);
  ctx.strokeStyle = 'rgba(8,11,20,0.92)';
  ctx.strokeText(popupStr, 0, 0);
  ctx.fillStyle = popupCol;
  ctx.fillText(popupStr, 0, 0);
  if (popupSub) {
    const ss = popupSize * 0.42;
    ctx.font = '700 ' + ss + 'px ' + FONT;
    ctx.lineWidth = Math.max(2, ss * 0.16);
    ctx.strokeText(popupSub, 0, popupSize * 0.78);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillText(popupSub, 0, popupSize * 0.78);
  }
  ctx.restore();
}

// --- 单个粒子的绘制 ---
function dSpark(ctx, p) {
  const t = p.age / p.life;
  let dx = p.vx * 0.028, dy = p.vy * 0.028;
  const L = Math.hypot(dx, dy), minL = 3 + p.size;
  if (L < minL) { const s = L > 0.001 ? minL / L : 0; dx *= s; dy *= s; }
  ctx.globalAlpha = Math.pow(1 - t, 0.7);
  ctx.strokeStyle = p.color;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1, p.size * (1 - t * 0.5));
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x - dx, p.y - dy);
  ctx.stroke();
}

function dFire(ctx, p) {
  const t = p.age / p.life;
  const a = Math.pow(1 - t, 1.1) * 0.95;
  const s = p.size * (1 + 1.2 * t);
  drawBlob(ctx, 'flame', p.color, p, s, a);
  if (t < 0.4) {                       // 早期叠加更亮的核心
    const s2 = s * 0.45;
    ctx.globalAlpha = (1 - t / 0.4) * 0.65;
    const g = glowSprite('#fff2c0');
    if (g) ctx.drawImage(g, p.x - s2, p.y - s2, s2 * 2, s2 * 2);
  }
}

function dGlow(ctx, p) {
  const t = p.age / p.life;
  const s = p.size * (1 + 0.8 * t);
  drawBlob(ctx, 'glow', p.color, p, s, Math.pow(1 - t, 1.4) * 0.9);
}

function dSmoke(ctx, p) {
  const t = p.age / p.life;
  const a = 0.20 * (1 - t) * (t < 0.15 ? t / 0.15 : 1);
  drawBlob(ctx, 'smoke', p.color, p, p.size * (1 + 1.8 * t), a);
}

function dStar(ctx, p) {
  const t = p.age / p.life;
  const a = 1 - t;
  const l = p.size * (1 - 0.35 * t);
  ctx.globalAlpha = a * 0.4;
  const g = glowSprite(p.color);
  if (g) ctx.drawImage(g, p.x - l, p.y - l, l * 2, l * 2);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rot);
  ctx.globalAlpha = a;
  ctx.fillStyle = p.color;
  const iw = l * 0.34;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const ang = i * TAU / 8 - Math.PI / 2;
    const rr = (i % 2 === 0) ? l : iw;
    const px = Math.cos(ang) * rr, py = Math.sin(ang) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function dDebris(ctx, p) {
  const t = p.age / p.life;
  ctx.globalAlpha = t > 0.65 ? 1 - (t - 0.65) / 0.35 : 1;
  const s = p.size;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rot);
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.moveTo(s, 0); ctx.lineTo(-s * 0.7, s * 0.6); ctx.lineTo(-s * 0.45, -s * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function dConfetti(ctx, p) {
  const t = p.age / p.life;
  ctx.globalAlpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
  const s = p.size;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rot);
  ctx.scale(Math.max(0.12, Math.abs(Math.cos(p.rot * 1.7))), 1);   // 纸片翻面
  ctx.fillStyle = p.color;
  ctx.fillRect(-s * 0.45, -s * 0.7, s * 0.9, s * 1.4);
  ctx.restore();
}

function dRing(ctx, p) {
  const t = p.age / p.life;
  const e = 1 - Math.pow(1 - t, 3);
  const r = p.r0 + (p.r1 - p.r0) * e;
  const w = Math.max(0.8, p.w * (1 - t * 0.7));
  const a = Math.pow(1 - t, 0.8);
  ctx.globalAlpha = a * 0.32;
  ctx.strokeStyle = p.color;
  ctx.lineWidth = w * 2.6;
  ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke();
  ctx.globalAlpha = a;
  ctx.lineWidth = w;
  ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke();
}

function dText(ctx, p) {
  const t = p.age / p.life;
  ctx.globalAlpha = t < 0.5 ? 1 : 1 - (t - 0.5) / 0.5;
  ctx.font = '900 ' + p.size + 'px ' + FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, p.size * 0.18);
  ctx.strokeStyle = 'rgba(8,11,20,0.92)';
  ctx.strokeText(p.txt, p.x, p.y);
  ctx.fillStyle = p.color;
  ctx.fillText(p.txt, p.x, p.y);
}

// ============================ 导出 ============================
return {
  init, resize,
  addShake, shakeOffset,
  burst, ring, explosion, trail, floatText, popup,
  flash, slowmo, timeScale,
  update, render, clear,
  setQuality, setVignette,
  // 契约外补充（见交付说明）
  setSpeedLines,
  count: function () { return list.length; }
};

})();
