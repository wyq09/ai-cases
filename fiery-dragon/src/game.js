/* ============================================================
 * FIERY DRAGON · 火龙珠水果机 H5 — 核心逻辑
 * 状态机 / 跑灯 / 比倍 / 投币 / 结算 / JP / 服务端适配层
 * ============================================================ */
(() => {
'use strict';

/* ---------------- 常量 ---------------- */
// 24 格灯环（顺时针）：[符号, 倍率, 是否x3]
const CELLS = [
  ['orange',10,0],['bell',20,1],['bar',50,0],['bar',100,0],['apple',5,0],['apple',5,1],['lemon',15,0],
  ['melon',20,0],['melon',20,1],['luck',0,0],['apple',5,0],['orange',10,1],
  ['orange',10,0],['bell',20,0],['seven',40,1],['seven',40,0],['apple',5,0],['lemon',15,0],['lemon',15,1],
  ['star',30,0],['star',30,1],['luck',0,0],['apple',5,0],['bell',20,1]
];
const BET_ORDER = ['bar','seven','star','melon','bell','lemon','orange','apple'];
const MULT      = {bar:100,seven:40,star:30,melon:20,bell:20,lemon:15,orange:10,apple:5};
const SYM_NAME  = {apple:'苹果',orange:'橙子',lemon:'柠檬',bell:'铃铛',melon:'西瓜',star:'星星',seven:'77',bar:'BAR'};
const LUCK_CELLS = [9,21];
const MAX_BET = 99, MAX_CREDIT = 99999999, START_CREDIT = 100;

/* ---------------- 天女散花配置（菜单可改，localStorage 持久化） ---------------- */
const CFG_DEFAULT = {
  bar50: 5, bar100: 10,          // 中 BAR 散出的中奖水果数
  luckChance: 50,                // 中 LUCK 触发散花的概率 %
  luckMin: 3, luckMax: 8,        // LUCK 散花水果数范围
  wApple: 20, wOrange: 15, wLemon: 12, wBell: 12, wMelon: 10, wStar: 8, wSeven: 5,  // 各水果抽中权重
  pBar50: 2, pBar100: 1, pLuck: 5  // 开灯基础概率 %（BAR×50 / BAR×100 / LUCK）
};
let CFG = { ...CFG_DEFAULT };
function saveCfg() {
  try { localStorage.setItem('fd-cfg-v1', JSON.stringify(CFG)); } catch (e) {}
}
function loadCfg() {
  try {
    const c = JSON.parse(localStorage.getItem('fd-cfg-v1'));
    if (c && typeof c === 'object') CFG = { ...CFG_DEFAULT, ...c };
  } catch (e) {}
}

/* ---------------- 图标自定义（localStorage 存 dataURL，128×128 压缩） ---------------- */
const ICONS_KEY = 'fd-icons-v1';
let ICONS = {};
function loadIcons() {
  try { ICONS = JSON.parse(localStorage.getItem(ICONS_KEY)) || {}; } catch (e) { ICONS = {}; }
}
function saveIcons() {
  try { localStorage.setItem(ICONS_KEY, JSON.stringify(ICONS)); } catch (e) { toast('存储空间不足，图标未保存'); }
}
function compressImage(file, size, cb) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const cx = cv.getContext('2d');
    const s = Math.max(size / img.width, size / img.height);
    const w = img.width * s, h = img.height * s;
    cx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    URL.revokeObjectURL(url);
    cb(cv.toDataURL('image/png'));
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}
function applyCustomIcons() {
  // 灯环格子 + 押注按钮：有自定义图标则替换为 <img>
  cellEls.forEach((cel, i) => {
    const sym = CELLS[i][0];
    if (sym === 'luck') return;
    const holder = cel.querySelector('.sym') || cel.querySelector('.cellbar');
    if (!holder) return;
    if (ICONS[sym]) holder.innerHTML = `<img src="${ICONS[sym]}" style="width:100%;height:100%;object-fit:contain" alt="">`;
    else {
      // 恢复默认：按格型重画
      const [sym2, mult, x3] = CELLS[i];
      if (sym2 === 'bar') holder.innerHTML = `<span class="b">BAR</span><span class="m">X${mult}</span><span class="b">BAR</span>`;
      else holder.innerHTML = `${ART.symbol(sym2)}`;
    }
  });
  BET_ORDER.forEach(k => {
    const b = bbtnEls[k];
    const holder = b.querySelector('.bsym') || b.querySelector('.bbar');
    if (!holder) return;
    if (ICONS[k]) holder.innerHTML = `<img src="${ICONS[k]}" style="width:100%;height:100%;object-fit:contain" alt="">`;
    else if (k === 'bar') holder.innerHTML = `<span class="bbar"><i>BAR</i><i>BAR</i><i>BAR</i></span>`;
    else holder.innerHTML = `${ART.symbol(k)}`;
  });
}
function setIcon(sym, file) {
  compressImage(file, 128, dataUrl => {
    ICONS[sym] = dataUrl; saveIcons(); applyCustomIcons();
    SFX.play('bet'); toast('图标已更新');
  });
}
function clearIcon(sym) {
  delete ICONS[sym]; saveIcons(); applyCustomIcons();
  SFX.play('press'); toast('已恢复默认图标');
}

/* ---------------- 状态 ---------------- */
const S = {
  credit: 0, bonus: 0, bonusBet: 0,
  bets: {bar:0,seven:0,star:0,melon:0,bell:0,lemon:0,orange:0,apple:0},
  jp: 500,
  phase: 'idle',          // idle | spinning | awarding | bonusIdle | bonusSpin
  auto: false, muted: false, bgmOn: false,
  litCell: -1, freeSpin: false,
  forcedCell: -1, rig: '', totalIn: 0, totalOut: 0
};

/* ============================================================
 * 服务端适配层 — 接入真服务端时仅需把 LocalServer 两个方法
 * 换成 HTTP/WebSocket 请求，前端状态机零改动。
 * 本地实现演示街机式「概率控奖」：
 *   · 赔付越高权重越低（平方衰减），重注天然被压制；
 *   · 未押门为「冷格」且权重随总押注上涨（吃分体感）；
 *   · BAR/77 高倍门衰减豁免（博头奖仍有戏）；
 *   · LUCK 稀有触发。
 * demo 为放水体感调参；正式运营以服务端控奖为准。
 * ============================================================ */
const LocalServer = {
  async spin({ bets }) {
    await sleep(50);
    if (S.forcedCell >= 0) { const c = S.forcedCell; S.forcedCell = -1; return c; }
    // —— 第一段：特殊格固定概率（配置化，不受押注影响）——
    const pB50 = clamp(+CFG.pBar50 || 0, 0, 100);
    const pB100 = clamp(+CFG.pBar100 || 0, 0, 100);
    const pLuck = clamp(+CFG.pLuck || 0, 0, 100);
    const r = Math.random() * 100;
    if (r < pB50) return 2;                                   // BAR×50
    if (r < pB50 + pB100) return 3;                           // BAR×100
    if (r < pB50 + pB100 + pLuck) return Math.random() < 0.5 ? 9 : 21;  // LUCK
    // —— 第二段：普通池（其余格子按押注衰减 shape 分配剩余概率）——
    const heavy = BET_ORDER.reduce((s, k) => s + (bets[k] || 0), 0) >= 20;
    const LAM = heavy ? 10 : 12, POW = heavy ? 2 : 1;
    const COLD0 = heavy ? 0.05 : 0.3, K = 0.002;
    const total = BET_ORDER.reduce((s, k) => s + (bets[k] || 0), 0);
    const cold = COLD0 + total * K;
    const weights = CELLS.map(([sym, mult], i) => {
      if (sym === 'luck') return 0;                           // LUCK 已在第一段
      if (i === 2 || i === 3) return 0;                       // BAR 两格已在第一段
      const b = bets[sym] || 0;
      if (!b) return cold;
      const lam = (sym === 'seven') ? LAM * 3 : LAM;          // 77 衰减豁免
      let w = 1 / Math.pow(1 + (b * mult) / lam, POW);
      if (S.rig === 'win') w *= 3; else if (S.rig === 'lose') w *= 0.22;
      return w;
    });
    const W = weights.reduce((a, b) => a + b, 0);
    // 归一后乘剩余概率份额 → 还原为真实概率再采样
    const target = Math.random() * W;
    let acc = 0;
    for (let i = 0; i < weights.length; i++) {
      acc += weights[i];
      if (target < acc) {
        // 份额缩放不改相对次序，直接返回普通池采样结果
        return i;
      }
    }
    return 0;
  },
  async guess() { await sleep(50); return 1 + Math.floor(Math.random() * 13); }
};
const sampleWeights = ws => {
  let sum = 0; for (const w of ws) sum += w;
  let r = Math.random() * sum;
  for (let i = 0; i < ws.length; i++) { r -= ws[i]; if (r < 0) return i; }
  return ws.length - 1;
};

/* ---------------- 工具 ---------------- */
const $ = s => document.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const uid = (() => { let i = 0; return () => 'fd' + (++i); })();
let stageScale = 1;
function centerInViewport(el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 2700);
}

/* ---------------- 七段 LED ---------------- */
const SEG_PTS = {
  a: '5,0 25,0 28,3 25,6 5,6 2,3',   b: '26,5 29,8 29,22 26,25 23,22 23,8',
  c: '26,27 29,30 29,44 26,47 23,44 23,30', d: '5,46 25,46 28,49 25,52 5,52 2,49',
  e: '4,27 1,30 1,44 4,47 7,44 7,30', f: '4,5 1,8 1,22 4,25 7,22 7,8',
  g: '5,23 25,23 27,26 25,29 5,29 3,26'
};
const SEG_DIG = ['abcdef','bc','abged','abgcd','fgbc','afgcd','afgedc','abc','abcdefg','abcfgd'];
class Led7 {
  constructor(host, digits, opt = {}) {
    this.digits = digits; this.value = -1; this.id = uid();
    const w = digits * 30 + (digits - 1) * 4, h = 52;
    const sc = opt.scale || Math.min(1, (opt.h || 52) / h);
    let svg = `<svg viewBox="0 0 ${w} ${h}" width="${w * sc}" height="${h * sc}">`;
    svg += `<defs><filter id="gl${this.id}" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="1.6"/></filter></defs>`;
    this.polys = [];
    for (let i = 0; i < digits; i++) {
      const ox = i * 34;
      svg += `<g transform="translate(${ox},0)">`;
      for (const k in SEG_PTS) svg += `<polygon data-blur points="${SEG_PTS[k]}" fill="none"/>`;
      for (const k in SEG_PTS) svg += `<polygon class="p${k}" data-on="0" points="${SEG_PTS[k]}" fill="#3a100a"/>`;
      svg += `</g>`;
    }
    svg += '</svg>';
    host.innerHTML = svg;
    this.svg = host.firstChild;
    this.polys = [...this.svg.querySelectorAll('polygon[data-on]')];
    this.blurs = [...this.svg.querySelectorAll('polygon[data-blur]')];
    this.blurs.forEach(p => { p.setAttribute('filter', `url(#gl${this.id})`); p.setAttribute('opacity', '0'); });
    this.set(0);
  }
  set(v) {
    v = clamp(Math.floor(v), 0, Math.pow(10, this.digits) - 1);
    if (v === this.value) return; this.value = v;
    const str = String(v).padStart(this.digits, ' ');
    for (let i = 0; i < this.digits; i++) {
      const ch = str[i], on = ch === ' ' ? '' : SEG_DIG[+ch];
      for (let s = 0; s < 7; s++) {
        const key = 'abcdefg'[s], p = this.polys[i * 7 + s], lit = on.includes(key);
        p.setAttribute('data-on', lit ? '1' : '0');
        p.setAttribute('fill', lit ? '#ff4a22' : '#3a100a');
        this.blurs[i * 7 + s].setAttribute('points', SEG_PTS[key]);
        this.blurs[i * 7 + s].setAttribute('opacity', lit ? '.75' : '0');
        this.blurs[i * 7 + s].setAttribute('fill', '#ff6a30');
      }
    }
  }
}
// 数字滚动动画
function rollLed(led, from, to, ms = 420) {
  if (from === to) { led.set(to); return; }
  const t0 = performance.now();
  (function step(t) {
    const k = clamp((t - t0) / ms, 0, 1), e = 1 - Math.pow(1 - k, 3);
    led.set(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step);
  })(t0);
}

/* ---------------- 状态渲染 ---------------- */
let ledBonus, ledCredit, centerLed, betLeds = [], cellEls = [], ptEls = [], bbtnEls = {};
let creditsShown = 0, bonusShown = 0;

function renderCredit(instant) {
  if (instant) { ledCredit.set(S.credit); creditsShown = S.credit; }
  else { rollLed(ledCredit, creditsShown, S.credit); creditsShown = S.credit; }
}
function renderBonus(instant) {
  if (instant) { ledBonus.set(S.bonus); bonusShown = S.bonus; }
  else { rollLed(ledBonus, bonusShown, S.bonus); bonusShown = S.bonus; }
}
function renderCenterLED() { centerLed.set(S.phase === 'bonusIdle' || S.phase === 'bonusSpin' ? S.bonusBet : 0); }
function renderBets() {
  BET_ORDER.forEach((k, i) => {
    betLeds[i].set(S.bets[k]);
    ptEls[i].classList.toggle('bet', S.bets[k] > 0);
    bbtnEls[k].classList.toggle('beton', S.bets[k] > 0);
  });
}
function renderJP() { $('#jpTag').textContent = 'JP ' + S.jp; }

/* ---------------- UI 构建 ---------------- */
function buildRing() {
  const board = $('#board');
  const W = 660, H = 648, cw = W / 7, ch = (H - 2 * cw) / 5;
  const pos = i => {
    if (i <= 6)  return { x: i * cw, y: 0, w: cw, h: cw };
    if (i <= 11) return { x: W - cw, y: cw + (i - 7) * ch, w: cw, h: ch };
    if (i <= 18) return { x: W - cw - (i - 12) * cw, y: H - cw, w: cw, h: cw };
    return { x: 0, y: H - cw - (i - 18) * ch, w: cw, h: ch };
  };
  CELLS.forEach(([sym, mult, x3], i) => {
    const p = pos(i), c = document.createElement('div');
    c.className = 'cell'; c.style.cssText = `left:${p.x + 2}px;top:${p.y + 2}px;width:${p.w - 4}px;height:${p.h - 4}px`;
    if (sym === 'luck') {
      c.innerHTML = ART.luckEgg(i === 9 ? 'blue' : 'orange');
      c.querySelector('svg').style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
    } else if (sym === 'bar') {
      c.innerHTML = `<div class="cellbar"><span class="b">BAR</span><span class="m">X${mult}</span><span class="b">BAR</span></div>`;
    } else {
      c.innerHTML = `<div class="sym">${ART.symbol(sym)}</div>${x3 ? '<div class="x3">x3</div>' : ''}`;
    }
    board.appendChild(c); cellEls[i] = c;
  });
}
function buildPaytable() {
  const pt = $('#paytable');
  BET_ORDER.forEach((k, i) => {
    const d = document.createElement('div');
    d.className = 'pt-cell' + (i === 0 || i === 7 ? ' edge' : '');
    d.textContent = MULT[k];
    pt.appendChild(d); ptEls[i] = d;
  });
}
function buildBetLeds() {
  const bl = $('#betLeds');
  BET_ORDER.forEach(() => {
    const d = document.createElement('div');
    d.className = 'bl-cell'; bl.appendChild(d);
    betLeds.push(new Led7(d, 2, { scale: 0.62 }));
  });
}
function buildBetBtns() {
  const bb = $('#betBtns');
  BET_ORDER.forEach(k => {
    const b = document.createElement('button');
    b.className = 'bbtn';
    b.innerHTML = k === 'bar'
      ? `<span class="bbar"><i>BAR</i><i>BAR</i><i>BAR</i></span>`
      : `<span class="bsym">${ART.symbol(k)}</span>`;
    bindHold(b, () => actBet(k));
    bb.appendChild(b); bbtnEls[k] = b;
  });
}
function buildTicker() {
  $('#coinIcon').innerHTML = ART.coin();
  $('#jpCoin').innerHTML = ART.jpCoin();
  const msgs = ['★ FIERY DRAGON ★ 火龙珠祝您好运 ', '★ JACKPOT 500 等你来拿 ★ 押 BAR 中头奖 ', '★ LUCK 幸运星 送免费一局 ★ '];
  startTicker(msgs.join(''));
}
let tickerTimer = null;
function startTicker(text) {
  const el = $('#tickerText');
  el.textContent = text + '　　' + text + '　　';
  el.style.animation = 'none'; void el.offsetWidth;
  const dist = el.scrollWidth / 2;
  el.style.transform = 'translateY(-50%)';
  const DUR = Math.max(8, dist / 90);
  el.animate([{ transform: 'translateY(-50%) translateX(0)' }, { transform: `translateY(-50%) translateX(${-dist}px)` }],
    { duration: DUR * 1000, iterations: Infinity });
}
function buildBulbs() {
  const m = $('#machine'), mk = (x, y) => {
    const b = document.createElement('div');
    b.className = 'bulb'; b.style.left = x + 'px'; b.style.top = y + 'px';
    m.appendChild(b);
  };
  for (let i = 0; i < 11; i++) mk(78 + i * (594 / 10), 132 - Math.sin(Math.PI * i / 10) * 48);
  for (let y = 430; y <= 1470; y = y + 130) { mk(10, y); mk(727, y); }
  for (let x = 90; x <= 660; x += 95) mk(x, 1594);
}

/* ---------------- 比倍轮盘 ---------------- */
let wnums = [];
function buildWheel() {
  const disc = $('#wheelDisc'), R = 156;
  for (let n = 1; n <= 13; n++) {
    const a = -Math.PI / 2 + (n - 1) * (Math.PI * 2 / 13);
    const d = document.createElement('div');
    d.className = 'wnum' + (n === 7 ? ' seven kill' : '');
    d.textContent = n;
    d.style.left = (200 + Math.cos(a) * R) + 'px';
    d.style.top = (200 + Math.sin(a) * R) + 'px';
    disc.appendChild(d); wnums[n] = d;
  }
}
async function spinWheelAnim(result) {
  const N = 34 + Math.floor(Math.random() * 10);
  let cur = 1, t = 0;
  for (let i = 0; i < N; i++) {
    const k = i / N;
    const ms = 45 + 260 * Math.pow(k, 2.6);
    t += ms;
    wnums[cur].classList.remove('lit');
    cur = cur % 13 + 1;
    wnums[cur].classList.add('lit');
    SFX.play('tick', { pitch: 1.5 - k * 0.8 });
    await sleep(t * 0 + ms);
  }
  wnums[cur].classList.remove('lit');
  wnums[result].classList.add('lit');
  return result;
}

/* ---------------- 动作：投币 ---------------- */
function insertCoin(n, opt = {}) {
  SFX.init();
  if (S.credit >= MAX_CREDIT) { if (!opt.auto) toast('积分已满'); return; }
  S.credit = Math.min(MAX_CREDIT, S.credit + n);
  S.totalIn += n;
  renderCredit();
  SFX.play(opt.auto ? 'bet' : 'coin');
  if (!opt.auto) flyCoin($('#dockCoin'), $('#ledCredit').parentElement);
  else flashEl($('#ledCredit'));
  save();
}
function addCredit(n) {
  SFX.init(); S.credit = Math.min(MAX_CREDIT, S.credit + n);
  S.totalIn += n;
  renderCredit(); SFX.play('insert');
  const p = centerInViewport($('#ledCredit'));
  FX.coinBurst(p.x, p.y, 14, {});
  save();
}
function flyCoin(fromEl, toEl) {
  const a = centerInViewport(fromEl), b = centerInViewport(toEl);
  const c = document.createElement('div');
  c.className = 'flycoin'; c.innerHTML = ART.coin();
  c.style.position = 'fixed'; c.style.zIndex = 900;
  document.body.appendChild(c);
  c.style.transform = `translate(${a.x - 20}px,${a.y - 20}px) scale(.6)`;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    c.style.transform = `translate(${b.x - 20}px,${b.y - 20}px) scale(1.05) rotate(220deg)`;
  }));
  setTimeout(() => { c.style.opacity = '0'; setTimeout(() => c.remove(), 200); }, 470);
}
function flashEl(el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }

/* ---------------- 动作：押注 ---------------- */
const totalBet = () => BET_ORDER.reduce((s, k) => s + S.bets[k], 0);
function actBet(k, n = 1) {
  if (S.phase === 'bonusIdle') collectBonus(true);
  if (S.phase !== 'idle') return;
  SFX.init();
  const room = MAX_BET - S.bets[k];
  if (room <= 0) { toast('该门子已押满'); return; }
  const add = Math.min(n, room);
  if (S.credit < add) { toast('积分不足，请先投币'); return; }
  S.credit -= add; S.bets[k] += add;
  S.jp = Math.min(999999, S.jp + add);
  renderCredit(); renderBets(); renderJP();
  SFX.play('bet');
  if (add >= 8) flashEl(bbtnEls[k]);
  save();
}
function actBetAll() {
  if (S.phase === 'bonusIdle') collectBonus(true);
  if (S.phase !== 'idle') return;
  SFX.init();
  if (S.credit < 8) { toast('积分不足 8，无法全押'); return; }
  BET_ORDER.forEach(k => {
    const add = Math.min(1, MAX_BET - S.bets[k]);
    S.bets[k] += add; S.credit -= add; S.jp = Math.min(999999, S.jp + add);
  });
  renderCredit(); renderBets(); renderJP();
  SFX.play('allin');
  BET_ORDER.forEach((k, i) => setTimeout(() => flashEl(bbtnEls[k]), i * 40));
  save();
}

/* ---------------- 动作：GO / 跑灯 ---------------- */
async function actGo() {
  SFX.init();
  if (S.phase === 'bonusIdle') { collectBonus(); return; }   // 比倍态 GO=只收分
  if (S.phase !== 'idle') return;
  if (totalBet() === 0) { toast('请先押注（绿色按钮押分）'); SFX.play('glose'); return; }
  S.phase = 'spinning'; syncButtons();
  stopAttract();
  cellEls.forEach(c => c.classList.remove('hitwin', 'hitluck'));
  SFX.play('go');
  const cell = await LocalServer.spin({ bets: { ...S.bets }, jp: S.jp });
  runLight(cell);
}
function runLight(target) {
  const N = CELLS.length;
  const cur = S.litCell < 0 ? -1 : S.litCell;   // cur=上一步位置，第一步落在 cur+1
  const steps = [];
  const fast = 24 * 2 + 10 + Math.floor(Math.random() * 8);
  let total = fast + ((target - (cur + fast) % N + N * 2) % N);
  while (total - fast < 12) total += N;   // 缓降段至少 12 步
  for (let i = 0; i < total; i++) {
    const k = i / total;
    const ms = k < 0.6 ? 28 : 28 + 340 * Math.pow((k - 0.6) / 0.4, 2.4);  // 全速→缓降悬念
    steps.push(ms);
  }
  const t0 = performance.now();
  let done = 0, acc = 0;
  (function frame(t) {
    acc += t - (frame.last || t0); frame.last = t;
    while (done < total && acc >= steps[done]) {
      acc -= steps[done];
      setLit((cur + done + 1) % N, done >= total - 8);
      done++;
    }
    if (done < total) requestAnimationFrame(frame);
    else onLightStop((cur + total) % N);
  })(t0);
}
function setLit(i, slow) {
  if (S.litCell >= 0) cellEls[S.litCell].classList.remove('lit');
  S.litCell = i;
  cellEls[i].classList.add('lit');
  SFX.play('tick', { pitch: slow ? 0.72 : 0.9 + Math.random() * 0.5 });
}
async function onLightStop(cell) {
  const [sym, mult, x3] = CELLS[cell];
  // LUCK：免费再跑一次
  if (sym === 'luck') {
    SFX.play('luck');
    $('#machine').classList.add('lucky');
    LUCK_CELLS.forEach(i => cellEls[i].classList.add('hitluck'));
    const p = centerInViewport(cellEls[cell]);
    FX.spark(p.x, p.y, '#7ad7ff', 26);
    // 按配置概率触发天女散花；免费局中再中 LUCK 必触发（防无限循环）
    const doScatter = S.freeSpin || (Math.random() * 100 < CFG.luckChance);
    FX.bigText('LUCK!', { color: '#7ad7ff', sub: doScatter ? '天女散花！' : '送免费一局', dur: 1.1 });
    await sleep(1400);
    LUCK_CELLS.forEach(i => cellEls[i].classList.remove('hitluck'));
    $('#machine').classList.remove('lucky');
    if (doScatter) {
      const cnt = CFG.luckMin + Math.floor(Math.random() * (CFG.luckMax - CFG.luckMin + 1));
      S.phase = 'scatter'; syncButtons();
      await scatterRound(cell, cnt, 'L U C K');
      await finishRound();
    } else {
      S.freeSpin = true;
      S.phase = 'spinning';
      runLight(await LocalServer.spin({ bets: { ...S.bets }, jp: S.jp }));
    }
    return;
  }
  await settle(cell, sym, mult, x3);
}

/* ---------------- 结算 ---------------- */
async function settle(cell, sym, mult, x3) {
  S.phase = 'awarding'; syncButtons();
  const betN = S.bets[sym] || 0;
  const win = betN * mult * (x3 ? 3 : 1);
  const jpHit = mult === 100 && betN > 0;
  const p = centerInViewport(cellEls[cell]);

  if (win > 0) {
    S.totalOut += win;
    cellEls[cell].classList.add('hitwin');
    bbtnEls[sym].classList.add('winflash');
    const winAll = win + (jpHit ? S.jp : 0);
    SFX.play(winAll >= 600 ? 'win3' : winAll >= 200 ? 'win2' : winAll >= 50 ? 'win1' : 'win0');
    FX.coinBurst(p.x, p.y, clamp(winAll, 12, 90), {});
    FX.ring(p.x, p.y, '#ffd23e');
    if (winAll >= 200) { $('#machine').classList.add('winner'); FX.confetti(60); }
    // 中 BAR：天女散花（bar100 与 JACKPOT 特效叠加）
    if (sym === 'bar') {
      FX.goddessScatter(p.x, p.y);
      $('#machine').classList.add('winner');
      if (!jpHit) FX.bigText('B A R !', { color: '#ff9a3d', sub: `中奖 +${winAll}`, dur: 2.2 });
    }
    if (jpHit) FX.bigText('JACKPOT!', { color: '#ffd23e', sub: `中奖 +${winAll}`, dur: 3.0 });
    else if (sym !== 'bar' && winAll >= 200) FX.bigText('大 奖 !', { color: '#ffd23e', sub: `中奖 +${winAll}`, dur: 1.9 });
    let jpWin = 0;
    if (jpHit) {
      jpWin = S.jp; S.jp = 0; renderJP();
      $('#jpCoin').classList.add('jpburst');
      FX.coinRain(50); FX.flash('#ffd23e', .55);
      startTicker('★ 恭喜 JACKPOT！独中头奖 +100 随机彩 ★ ');
    }
    S.totalOut += jpWin;
    rollLed(ledBonus, bonusShown, S.bonus + win + jpWin, 500);
    S.bonus += win + jpWin;
    await sleep(jpHit ? 3200 : winAll >= 200 ? 2200 : 1800);
    bbtnEls[sym].classList.remove('winflash');
    $('#machine').classList.remove('winner');
    $('#jpCoin').classList.remove('jpburst');
    // 中奖格保留爆闪直到下局 GO
    // BAR 天女散花：额外散出可配置数量的中奖水果
    if (sym === 'bar') await scatterRound(cell, mult === 100 ? CFG.bar100 : CFG.bar50, 'B A R');
  } else {
    SFX.play('tick', { pitch: 0.5 });
    await sleep(500);
  }
  await finishRound();
}

/* ---------------- 天女散花 ---------------- */
// 结算收尾（清注 → 进比倍或回待机），正常结算与散花共用
async function finishRound() {
  BET_ORDER.forEach(k => S.bets[k] = 0);
  renderBets();
  S.freeSpin = false;
  if (S.bonus > 0) enterBonus();
  else { S.phase = 'idle'; syncButtons(); startAttract(); save(); }
}

// 按权重随机抽 count 个中奖水果（含其所在格与赔付）
// 赔付 = 押注 × 格倍率；未押的水果按 1 注保底送分（散花永远是真奖）
function rollScatterFruits(count) {
  const symCells = {};
  CELLS.forEach(([sym], i) => {
    if (sym !== 'luck' && sym !== 'bar') (symCells[sym] = symCells[sym] || []).push(i);
  });
  const WKEYS = [['apple','wApple'],['orange','wOrange'],['lemon','wLemon'],['bell','wBell'],['melon','wMelon'],['star','wStar'],['seven','wSeven']];
  const picks = [];
  for (let i = 0; i < count; i++) {
    const sym = WKEYS[sampleWeights(WKEYS.map(([, k]) => Math.max(1, +CFG[k] || 0)))][0];
    const cells = symCells[sym];
    const cell = cells[Math.floor(Math.random() * cells.length)];
    const pay = Math.max(1, S.bets[sym] || 0) * CELLS[cell][1] * (CELLS[cell][2] ? 3 : 1);
    picks.push({ cell, sym, pay });
  }
  return picks;
}

// 格子中心（stage 坐标）
function cellCenterStage(i) {
  const st = $('#stage').getBoundingClientRect(), r = cellEls[i].getBoundingClientRect();
  return { x: (r.left + r.width / 2 - st.left) / stageScale, y: (r.top + r.height / 2 - st.top) / stageScale };
}

// 散花整轮：单一 rAF 时间轴驱动——光点按 GAP 间隔排队出发、弧线飞向目标格、
// 落格亮灯结算并保持常亮到轮次末（不受 setTimeout 节流影响，节奏恒定）
async function scatterRound(fromCell, count, label) {
  if (count <= 0) return;
  S.phase = 'scatter'; syncButtons();
  const p = centerInViewport(cellEls[fromCell]);
  FX.goddessScatter(p.x, p.y);
  SFX.play('win2');
  $('#machine').classList.add('winner');
  const picks = rollScatterFruits(count);
  const GAP = 620, FLY = 640;                        // 出发间隔 / 单颗飞行时长
  const a = cellCenterStage(fromCell);
  const items = picks.map((pk, i) => ({
    pick: pk, start: i * GAP, el: null, done: false,
    b: cellCenterStage(pk.cell)
  }));
  const litCells = new Set();
  await new Promise(res => {
    const t0 = performance.now();
    (function frame(t) {
      const el = t - t0;
      let alive = false;
      for (const it of items) {
        if (it.done) continue;
        alive = true;
        const k = clamp((el - it.start) / FLY, 0, 1);
        if (!it.el) {
          if (k <= 0) { alive = true; continue; }
          it.el = document.createElement('div');
          it.el.className = 'scatter-fly';
          it.el.innerHTML = ART.coin();
          $('#stage').appendChild(it.el);
        }
        if (k < 1) {
          const e = k * k * (3 - 2 * k);
          const x = a.x + (it.b.x - a.x) * e;
          const y = a.y + (it.b.y - a.y) * e - Math.sin(k * Math.PI) * 80;
          it.el.style.transform = `translate(${x - 19}px,${y - 19}px) scale(${1 - k * 0.15}) rotate(${k * 540}deg)`;
        } else {
          it.el.remove(); it.el = null; it.done = true;
          const cel = cellEls[it.pick.cell];
          cel.classList.add('hitwin'); litCells.add(cel);
          S.bonus += it.pick.pay;
          rollLed(ledBonus, bonusShown, S.bonus, 240);
          const vp = centerInViewport(cel);
          FX.spark(vp.x, vp.y, '#ffd23e', 16);
          const tag = document.createElement('div');
          tag.className = 'scatter-pay';
          tag.textContent = '+' + it.pick.pay;
          tag.style.left = vp.x + 'px'; tag.style.top = (vp.y - 26) + 'px';
          document.body.appendChild(tag);
          setTimeout(() => tag.remove(), 1000);
          SFX.play('tick', { pitch: 1.2 + Math.random() * 0.5 });
        }
      }
      if (alive) requestAnimationFrame(frame); else res();
    })(t0);
  });
  const gained = picks.reduce((s, x) => s + x.pay, 0);
  S.totalOut += gained;
  bonusShown = -1; renderBonus();
  FX.bigText(label === 'L U C K' ? '天女散花' : '天女散花', { color: '#ffd23e', sub: `${label} 散出 ${count} 个水果 · 共中 +${gained}`, dur: 1.7 });
  SFX.play(gained > 0 ? 'win1' : 'glose');
  $('#machine').classList.remove('winner');
  await sleep(1500);
  litCells.forEach(c => c.classList.remove('hitwin'));
  save();
}

/* ---------------- 比倍（猜大小） ---------------- */
function enterBonus() {
  S.phase = 'bonusIdle'; S.bonusBet = S.bonus;
  $('#wheel').classList.add('show');
  $('#wheelTip').innerHTML = `比倍猜大小<small>← → 调整比倍额<br>猜对翻倍 · 7 通杀</small>`;
  renderCenterLED(); syncButtons();
  SFX.play('press');
  save();
}
function adjBonusBet(d) {
  if (S.phase !== 'bonusIdle') return;
  S.bonusBet = clamp(S.bonusBet + d, 0, S.bonus);
  renderCenterLED();
  // 轮盘中央同步显示当前比倍额（LED 被轮盘遮挡时的可视反馈）
  $('#wheelTip').innerHTML = `比倍额 <span style="color:#ffd23e">${S.bonusBet}</span><small>← → 调整 · 猜对翻倍 · 7 通杀</small>`;
  SFX.play('bet', {});
}
async function actGuess(dir) {
  if (S.phase !== 'bonusIdle') return;
  if (S.bonusBet <= 0) { toast('← → 先调整比倍金额'); return; }
  S.phase = 'bonusSpin'; syncButtons();
  $('#wheelTip').style.opacity = '.25';
  SFX.play('go', {});
  const n = await LocalServer.guess({ dir, bet: S.bonusBet });
  await spinWheelAnim(n);
  const hit = dir === 'small' ? n <= 6 : n >= 8;
  const p = centerInViewport($('#wheel'));
  if (hit) {
    S.bonus += S.bonusBet; // 本金保留 + 赢一份
    SFX.play('gwin');
    FX.spark(p.x, p.y - 40, '#ffd23e', 30);
    $('#wheelTip').innerHTML = `${n <= 6 ? '小' : '大'} ${n} 中！翻倍<small>继续猜 或 GO 收分</small>`;
  } else {
    S.bonus -= S.bonusBet;
    SFX.play('glose');
    FX.flash('#ff3018', .4);
    $('#wheelTip').innerHTML = `${n === 7 ? '7 通杀' : (n <= 6 ? '小' : '大') + ' ' + n} 没中<small>${S.bonus > 0 ? '还可继续' : '下次再来'}</small>`;
  }
  bonusShown = -1; renderBonus();
  $('#wheelTip').style.opacity = '1';
  renderCenterLED();
  await sleep(900);
  wnums.forEach(w => w && w.classList.remove('lit'));
  if (S.bonus <= 0) {
    S.phase = 'idle'; S.bonus = 0; S.bonusBet = 0;
    $('#wheel').classList.remove('show');
    renderBonus(); renderCenterLED(); syncButtons(); startAttract(); save();
  } else {
    S.phase = 'bonusIdle'; S.bonusBet = S.bonus;
    renderCenterLED(); syncButtons(); save();
  }
}
function collectBonus(silent) {
  if (S.bonus <= 0) { if (S.phase === 'bonusIdle') { S.phase = 'idle'; syncButtons(); } return; }
  S.credit = Math.min(MAX_CREDIT, S.credit + S.bonus);
  if (!silent) {
    SFX.play('insert');
    const p = centerInViewport($('#ledCredit'));
    FX.coinBurst(p.x, p.y, 16, {});
    toast(`收分 +${S.bonus}`);
  }
  S.bonus = 0; S.bonusBet = 0;
  $('#wheel').classList.remove('show');
  renderCredit(); renderBonus(); renderCenterLED();
  S.phase = 'idle'; syncButtons(); startAttract();
  save();
}

/* ---------------- 待机巡游 ---------------- */
let attractTimer = null, attractPos = 0;
function startAttract() {
  if (S.phase !== 'idle' || attractTimer) return;
  attractTimer = setInterval(() => {
    if (document.hidden) return;
    cellEls[attractPos % 24] && cellEls[attractPos % 24].classList.remove('attract');
    attractPos = (attractPos + 1) % 24;
    cellEls[attractPos].classList.add('attract');
  }, 130);
}
function stopAttract() {
  clearInterval(attractTimer); attractTimer = null;
  cellEls.forEach(c => c.classList.remove('attract'));
}

/* ---------------- 按钮可用性 ---------------- */
function syncButtons() {
  const idle = S.phase === 'idle', bonusIdle = S.phase === 'bonusIdle';
  const canBet = idle || bonusIdle;   // 比倍待命时押注 = 自动收分后押新局
  $('#btnGo').disabled = !(idle || bonusIdle);
  $('#btnGo .cap').textContent = bonusIdle ? '收分' : 'GO';
  $('#btnAll').disabled = !canBet;
  $('#btnLeft').disabled = !bonusIdle;
  $('#btnRight').disabled = !bonusIdle;
  $('#btnSmall').disabled = !bonusIdle;
  $('#btnBig').disabled = !bonusIdle;
  document.querySelectorAll('.bbtn').forEach(b => b.disabled = !canBet);
}

/* ---------------- 长按连发绑定 ---------------- */
function bindHold(el, fn, opt = {}) {
  let t1 = null, t2 = null, held = false;
  const clearTimers = () => { clearTimeout(t1); clearInterval(t2); t1 = t2 = null; };
  const start = e => {
    if (el.disabled || held) return;
    e.preventDefault(); SFX.init();
    held = true; el.classList.add('down');
    fn();
    t1 = setTimeout(() => { t2 = setInterval(fn, opt.repeat || 95); }, opt.delay || 380);
  };
  const end = () => {
    if (!held) return;
    held = false; el.classList.remove('down'); clearTimers();
  };
  el.addEventListener('pointerdown', start);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => el.addEventListener(ev, end));
  el.addEventListener('lostpointercapture', end);
}

/* ---------------- 菜单 / 说明 ---------------- */
function showMenu() {
  const ov = $('#overlay');
  ov.innerHTML = `<div class="sheet">
    <button class="close-x">✕</button><h3>机 台 设 置</h3>
    <div class="row"><span>音效</span><div class="switch ${S.muted ? '' : 'on'}" data-k="muted"></div></div>
    <div class="row"><span>背景音乐</span><div class="switch ${S.bgmOn ? 'on' : ''}" data-k="bgm"></div></div>
    <div class="row"><span>自动投币</span><div class="switch ${S.auto ? 'on' : ''}" data-k="auto"></div></div>
    <div class="row" style="display:block">
      <span>演示辅助</span><br>
      <button class="mini" data-act="add100">上分 +100</button>
      <button class="mini" data-act="add1000">上分 +1000</button>
      <button class="mini" data-act="forcejp">下局必中头奖</button>
      <button class="mini red" data-act="reset">清空存档</button>
    </div>
    <div class="row" style="display:block">
      <span>开奖概率设置（%）</span>
      <div style="margin-top:8px">
        <span class="cfg-lab">BAR×50 <input class="cfg-in" type="number" min="0" max="100" data-cfg="pBar50"></span>
        <span class="cfg-lab">BAR×100 <input class="cfg-in" type="number" min="0" max="100" data-cfg="pBar100"></span>
        <span class="cfg-lab">LUCK <input class="cfg-in" type="number" min="0" max="100" data-cfg="pLuck"></span>
      </div>
      <span style="font-size:15px;color:#a8886a">固定基础概率，不受押注影响；其余格子分配剩余概率</span>
    </div>
    <div class="row" style="display:block">
      <span>天女散花设置</span><br>
      <div style="margin-top:10px">
        <span class="cfg-lab">BAR×50 散花 <input class="cfg-in" type="number" min="1" max="24" data-cfg="bar50"></span>
        <span class="cfg-lab">BAR×100 散花 <input class="cfg-in" type="number" min="1" max="24" data-cfg="bar100"></span>
      </div>
      <div>
        <span class="cfg-lab">LUCK 触发散花概率 <input class="cfg-in" type="number" min="0" max="100" data-cfg="luckChance"> %</span>
        <span class="cfg-lab">散花水果数 <input class="cfg-in" type="number" min="1" max="24" data-cfg="luckMin" style="width:52px"> ~ <input class="cfg-in" type="number" min="1" max="24" data-cfg="luckMax" style="width:52px"></span>
      </div>
      <div style="margin-top:6px;color:#c9a86a;font-size:17px">水果抽中权重（押中该水果才有赔付）</div>
      <div>
        <span class="cfg-lab">苹果 <input class="cfg-in" type="number" min="0" max="99" data-cfg="wApple"></span>
        <span class="cfg-lab">橙 <input class="cfg-in" type="number" min="0" max="99" data-cfg="wOrange"></span>
        <span class="cfg-lab">柠檬 <input class="cfg-in" type="number" min="0" max="99" data-cfg="wLemon"></span>
        <span class="cfg-lab">铃铛 <input class="cfg-in" type="number" min="0" max="99" data-cfg="wBell"></span>
        <span class="cfg-lab">西瓜 <input class="cfg-in" type="number" min="0" max="99" data-cfg="wMelon"></span>
        <span class="cfg-lab">星 <input class="cfg-in" type="number" min="0" max="99" data-cfg="wStar"></span>
        <span class="cfg-lab">77 <input class="cfg-in" type="number" min="0" max="99" data-cfg="wSeven"></span>
      </div>
      <button class="mini" data-act="cfgdefault">恢复默认</button>
      <span style="font-size:15px;color:#a8886a">改动即时生效并保存；散花水果押中按押注赔、未押按 1 注保底送分</span>
    </div>
    <div class="row" style="display:block">
      <span>图标自定义</span>
      <div style="color:#c9a86a;font-size:16px;margin-top:4px">点击方块上传图片替换灯环与押注按钮图标（长按恢复默认）</div>
      <div id="iconGrid" style="display:flex;flex-wrap:wrap;gap:10px;margin-top:10px"></div>
    </div>
    <div class="row" style="display:block">
      <span>音频自定义</span>
      <div style="color:#c9a86a;font-size:16px;margin-top:4px">上传 mp3/ogg 替换对应音效（≤800KB，立即生效并保存）</div>
      <div id="audioGrid" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px"></div>
    </div>
    <div class="row" style="font-size:16px;color:#a8886a">累计投入 ${S.totalIn} · 累计产出 ${S.totalOut} · 返奖率 ${S.totalIn ? Math.round(S.totalOut / S.totalIn * 100) : 0}%</div>
  </div>`;
  ov.classList.add('show');
  ov.querySelector('.close-x').onclick = () => ov.classList.remove('show');
  ov.dataset.openAt = String(performance.now());
  ov.querySelectorAll('.switch').forEach(sw => sw.onclick = () => {
    const k = sw.dataset.k;
    if (k === 'muted') setMuted(!S.muted);
    if (k === 'bgm') setBGM(!S.bgmOn);
    if (k === 'auto') setAuto(!S.auto);
    sw.classList.toggle('on');
  });
  ov.querySelectorAll('.mini').forEach(b => b.onclick = () => {
    const act = b.dataset.act;
    if (act === 'add100') addCredit(100);
    if (act === 'add1000') addCredit(1000);
    if (act === 'forcejp') { S.forcedCell = 3; toast('下局开灯必停 BAR×100'); }
    if (act === 'cfgdefault') {
      CFG = { ...CFG_DEFAULT }; saveCfg();
      ov.querySelectorAll('.cfg-in').forEach(inp => { inp.value = CFG[inp.dataset.cfg]; });
      toast('天女散花参数已恢复默认');
    }
    if (act === 'reset') { localStorage.removeItem('fd-save-v1'); location.reload(); }
    SFX.play('press');
  });
  ov.querySelectorAll('.cfg-in').forEach(inp => {
    inp.value = CFG[inp.dataset.cfg];
    inp.onchange = () => {
      const k = inp.dataset.cfg;
      let v = Math.floor(+inp.value || 0);
      const lim = { luckChance: [0, 100] }[k] || (k.startsWith('w') ? [0, 99] : [1, 24]);
      v = clamp(v, lim[0], lim[1]);
      if (k === 'luckMin' && v > CFG.luckMax) v = CFG.luckMax;
      if (k === 'luckMax' && v < CFG.luckMin) v = CFG.luckMin;
      inp.value = v; CFG[k] = v; saveCfg();
      SFX.play('bet');
    };
  });
  buildIconGrid(ov);
  buildAudioGrid(ov);
}
/* ---------------- 菜单：图标/音频自定义 ---------------- */
const SYM_LABEL = { apple:'苹果', orange:'橙子', lemon:'柠檬', bell:'铃铛', melon:'西瓜', star:'星星', seven:'77', bar:'BAR' };
function buildIconGrid(ov) {
  const grid = ov.querySelector('#iconGrid');
  if (!grid) return;
  grid.innerHTML = '';
  BET_ORDER.forEach(k => {
    const cell = document.createElement('div');
    cell.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px';
    const prev = document.createElement('div');
    prev.style.cssText = `width:64px;height:64px;border-radius:10px;background:#f4ebcd;display:flex;align-items:center;justify-content:center;cursor:pointer;overflow:hidden;box-shadow:inset 0 0 0 2px #cdbb90`;
    prev.innerHTML = ICONS[k] ? `<img src="${ICONS[k]}" style="width:100%;height:100%;object-fit:contain">`
      : (k === 'bar' ? `<div style="font-family:'Arial Black';font-size:11px;font-weight:900;background:#111;color:#fff;padding:2px">BAR</div>` : ART.symbol(k));
    prev.querySelector('svg') && (prev.querySelector('svg').style.cssText = 'width:80%;height:80%');
    const lab = document.createElement('span');
    lab.style.cssText = 'font-size:15px;color:#e8d5a8';
    lab.textContent = (ICONS[k] ? '● ' : '') + SYM_LABEL[k];
    // 点击上传
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';
    inp.onchange = () => { if (inp.files[0]) setIcon(k, inp.files[0]); buildIconGrid(ov); };
    prev.onclick = () => inp.click();
    // 长按恢复默认
    let lpTimer = null;
    prev.addEventListener('pointerdown', () => {
      lpTimer = setTimeout(() => { lpTimer = 'fired'; clearIcon(k); buildIconGrid(ov); }, 700);
    });
    ['pointerup', 'pointerleave'].forEach(ev => prev.addEventListener(ev, () => { if (lpTimer && lpTimer !== 'fired') clearTimeout(lpTimer); lpTimer = null; }));
    cell.appendChild(prev); cell.appendChild(lab); cell.appendChild(inp);
    grid.appendChild(cell);
  });
}
const AUDIO_SLOTS = [
  ['bgm', '背景音乐'], ['win0', '小奖音'], ['win1', '中奖音'], ['win2', '大奖音'],
  ['win3', '头奖音'], ['gwin', '比倍中'], ['glose', '比倍输'], ['insert', '收分音']
];
function buildAudioGrid(ov) {
  const grid = ov.querySelector('#audioGrid');
  if (!grid) return;
  grid.innerHTML = '';
  AUDIO_SLOTS.forEach(([name, label]) => {
    const has = SFX.hasCustomAudio(name);
    const b = document.createElement('button');
    b.className = 'mini';
    b.style.cssText = 'font-size:17px;padding:8px 12px;margin:2px';
    b.textContent = (has ? '● ' : '') + label + (has ? '(自定义)' : '');
    b.onclick = () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'audio/*';
      inp.onchange = () => {
        const file = inp.files[0];
        if (!file) return;
        if (file.size > 800 * 1024) { toast('文件过大（限 800KB）'); return; }
        const fr = new FileReader();
        fr.onload = () => {
          if (SFX.setCustomAudio(name, fr.result)) {
            toast(label + ' 已替换');
            if (name === 'bgm' && S.bgmOn) { SFX.stopBGM(); SFX.startBGM(); }
            buildAudioGrid(ov);
          } else toast('保存失败（存储空间不足）');
        };
        fr.readAsDataURL(file);
      };
      inp.click();
    };
    // 右键/长按清除 → 简化：已自定义的再次点击前先询问？直接加清除小按钮
    const cell = document.createElement('div');
    cell.style.cssText = 'display:flex;flex-direction:column;align-items:center;margin:2px';
    const clr = document.createElement('span');
    clr.style.cssText = 'font-size:13px;color:#a8886a;cursor:pointer;text-align:center';
    clr.textContent = has ? '恢复默认' : ' ';
    clr.onclick = () => { if (has) { SFX.clearCustomAudio(name); toast(label + ' 已恢复默认'); buildAudioGrid(ov); } };
    cell.appendChild(b); cell.appendChild(clr);
    grid.appendChild(cell);
  });
}

function showInfo() {
  const ov = $('#overlay');
  const rows = BET_ORDER.map(k => `<tr><td>${SYM_NAME[k]}</td><td>${MULT[k]} 倍</td></tr>`).join('');
  ov.innerHTML = `<div class="sheet rules">
    <button class="close-x">✕</button><h3>玩 法 说 明</h3>
    <b>① 投币</b>：底部「投币 +1」或「上分」增加 CREDIT。<br>
    <b>② 押注</b>：点绿色符号钮押分（长按连押），「ALL+1」全门各押 1；每门上限 99。<br>
    <b>③ 开灯</b>：按 <b>GO</b> 跑马灯旋转减速停止，押中停下格子所属符号即赢「押注 × 倍率」。<br>
    <b>④ 特殊格</b>：<b>x3</b> 格倍率×3；<b>LUCK</b> 送免费一局；<b>BAR×100</b> 命中独吞 JP 彩金池（押注自动累积）。<br>
    <b>⑤ 比倍</b>：中奖后进入比倍——<b>← →</b> 调整比倍额，按 <b>1-6</b>（猜小）或 <b>8-13</b>（猜大）开数字轮盘；猜对金额翻倍可连续比倍，7 通杀；按 <b>GO/收分</b> 落袋为安。
    <table><tr><th>符号</th><th>基础倍率</th></tr>${rows}</table>
    <div style="font-size:15px;color:#a8886a">提示：长按按钮可连发；顶栏 ≡ 内有演示辅助。本作为怀旧街机机制演示 Demo。</div>
  </div>`;
  ov.classList.add('show');
  ov.querySelector('.close-x').onclick = () => ov.classList.remove('show');
  ov.dataset.openAt = String(performance.now());
}

/* ---------------- 开关 ---------------- */
function setMuted(v) {
  S.muted = v; SFX.setMuted(v);
  $('#muteBtn').textContent = v ? '静' : '音';
  $('#muteBtn').classList.toggle('off', v);
  save();
}
function setBGM(v) {
  S.bgmOn = v;
  if (v) { SFX.init(); SFX.startBGM(); } else SFX.stopBGM();
  save();
}
function setAuto(v) {
  S.auto = v;
  const b = $('#dockAuto');
  b.classList.toggle('on', v);
  b.textContent = v ? '停止投币' : '自动投币';
  clearInterval(autoTimer);
  if (v) autoTimer = setInterval(() => {
    if (document.hidden || S.credit >= MAX_CREDIT) return;
    insertCoin(1, { auto: true });
  }, 300);
  save();
}
let autoTimer = null;

/* ---------------- 存档 ---------------- */
function save() {
  try {
    localStorage.setItem('fd-save-v1', JSON.stringify({
      credit: S.credit, jp: S.jp, muted: S.muted, bgm: S.bgmOn,
      totalIn: S.totalIn, totalOut: S.totalOut
    }));
  } catch (e) {}
}
function load() {
  try { return JSON.parse(localStorage.getItem('fd-save-v1')) || null; } catch (e) { return null; }
}

/* ---------------- 缩放适配 ---------------- */
function resize() {
  stageScale = Math.min(innerWidth / 750, innerHeight / 1610);
  $('#stage').style.transform = `scale(${stageScale})`;
}

/* ---------------- 启动 ---------------- */
function boot() {
  // URL 调试参数
  const q = new URLSearchParams(location.search);
  loadCfg();
  loadIcons();
  if (q.get('reset') === '1') { try { localStorage.removeItem('fd-save-v1'); } catch (e) {} }
  if (q.get('cell')) S.forcedCell = +q.get('cell');
  if (q.get('rig')) S.rig = q.get('rig');

  // 素材注入
  {
    const sh = $('#sceneHolder');
    sh.innerHTML = ART.scene();
    const sv = sh.querySelector('svg');
    if (sv && !sv.getAttribute('preserveAspectRatio')) sv.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  }
  buildRing(); buildPaytable(); buildBetLeds(); buildBetBtns(); buildWheel(); buildTicker(); buildBulbs();
  applyCustomIcons();

  // LED
  ledBonus = new Led7($('#ledBonus'), 8, { scale: 0.78 });
  ledCredit = new Led7($('#ledCredit'), 8, { scale: 0.78 });
  centerLed = new Led7($('#centerLED'), 2, { scale: 0.7 });

  // 存档 / 初始
  const d = load();
  if (d) {
    S.credit = d.credit || 0; S.jp = d.jp || 500;
    S.totalIn = d.totalIn || 0; S.totalOut = d.totalOut || 0;
    setMuted(!!d.muted); if (d.bgm) setTimeout(() => setBGM(true), 0);
    setTimeout(() => toast('已恢复上次进度'), 600);
  } else {
    S.credit = START_CREDIT;
    setTimeout(() => toast('新手礼包 +100，点击绿色符号钮押注'), 600);
  }
  creditsShown = bonusShown = -1;
  renderCredit(true); renderBonus(true); renderBets(); renderJP(); renderCenterLED();
  if (q.get('muted') === '1') setMuted(true);
  if (q.get('auto') === '1') setAuto(true);

  // 特效层
  FX.init(document.body);

  // 事件
  bindHold($('#dockCoin'), () => insertCoin(1), { delay: 260, repeat: 120 });
  $('#dockAdd').addEventListener('pointerdown', e => { e.preventDefault(); addCredit(100); });
  $('#dockAuto').addEventListener('pointerdown', e => { e.preventDefault(); SFX.init(); setAuto(!S.auto); SFX.play('press'); });
  bindHold($('#btnAll'), actBetAll, { delay: 600, repeat: 260 });
  bindHold($('#btnLeft'), () => adjBonusBet(-1), { delay: 300, repeat: 70 });
  bindHold($('#btnRight'), () => adjBonusBet(1), { delay: 300, repeat: 70 });
  bindHold($('#btnSmall'), () => actGuess('small'), { delay: 9999 });
  bindHold($('#btnBig'), () => actGuess('big'), { delay: 9999 });
  bindHold($('#btnGo'), actGo, { delay: 9999 });
  $('#menuBtn').addEventListener('click', () => { SFX.init(); SFX.play('press'); showMenu(); });
  $('#infoBtn').addEventListener('click', () => { SFX.init(); SFX.play('press'); showInfo(); });
  $('#muteBtn').addEventListener('pointerdown', e => { e.preventDefault(); SFX.init(); setMuted(!S.muted); SFX.play('press'); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  // 遮罩点空白关闭：350ms 保护窗防同一手势的合成 click 穿透误关
  $('#overlay').addEventListener('click', e => {
    if (e.target !== e.currentTarget) return;
    if (performance.now() - (+e.currentTarget.dataset.openAt || 0) < 350) return;
    e.currentTarget.classList.remove('show');
    SFX.play('press');
  });
  addEventListener('resize', resize);
  resize();

  syncButtons(); startAttract();
  window.__fd = { S, LocalServer, CFG: () => CFG, setIcon, clearIcon, forceCell: c => S.forcedCell = c }; // 调试钩子
}

document.addEventListener('DOMContentLoaded', boot);
window.addEventListener('error', e => {
  (window.__errs = window.__errs || []).push(String(e.message || e));
});
})();
