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
    // 分段控奖：轻注（<20）放水体感；重注/全押（≥20）吃分压制
    const heavy = BET_ORDER.reduce((s, k) => s + (bets[k] || 0), 0) >= 20;
    const LAM = heavy ? 10 : 12, POW = heavy ? 2 : 1;
    const COLD0 = heavy ? 0.05 : 0.3, K = 0.002, LW0 = 0.05, KL = 0.002;
    const total = BET_ORDER.reduce((s, k) => s + (bets[k] || 0), 0);
    const cold = COLD0 + total * K, luckW = LW0 + total * KL;
    const weights = CELLS.map(([sym, mult]) => {
      if (sym === 'luck') return luckW;
      const b = bets[sym] || 0;
      if (!b) return cold;
      const lam = (sym === 'bar' || sym === 'seven') ? LAM * 3 : LAM;
      let w = 1 / Math.pow(1 + (b * mult) / lam, POW);
      if (S.rig === 'win') w *= 3; else if (S.rig === 'lose') w *= 0.22;
      return w;
    });
    if (bets.bar > 0) weights[3] *= 0.55;   // 头奖格（BAR×100）额外压制
    return sampleWeights(weights);
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
  if (S.phase === 'bonusIdle') collectBonus();
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
    FX.bigText('LUCK!', { color: '#7ad7ff', sub: S.freeSpin ? '幸运连锁！' : '送免费一局', dur: 1500 });
    await sleep(1400);
    LUCK_CELLS.forEach(i => cellEls[i].classList.remove('hitluck'));
    $('#machine').classList.remove('lucky');
    S.freeSpin = true;
    S.phase = 'spinning';
    runLight(await LocalServer.spin({ bets: { ...S.bets }, jp: S.jp }));
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
    if (jpHit) FX.bigText('JACKPOT!', { color: '#ffd23e', sub: `中奖 +${winAll}`, dur: 3.0 });
    else if (winAll >= 200) FX.bigText('大 奖 !', { color: '#ffd23e', sub: `中奖 +${winAll}`, dur: 1.9 });
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
  } else {
    SFX.play('tick', { pitch: 0.5 });
    await sleep(500);
  }
  // 清押注
  BET_ORDER.forEach(k => S.bets[k] = 0);
  renderBets();
  S.freeSpin = false;
  if (S.bonus > 0) enterBonus();
  else { S.phase = 'idle'; syncButtons(); startAttract(); save(); }
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
    $('#wheelTip').innerHTML = `${n <= 6 ? '小' : '大'} ${n} ✓ 翻倍！<small>继续猜 或 GO 收分</small>`;
  } else {
    S.bonus -= S.bonusBet;
    SFX.play('glose');
    FX.flash('#ff3018', .4);
    $('#wheelTip').innerHTML = `${n === 7 ? '7 通杀' : (n <= 6 ? '小' : '大') + ' ' + n} ✗ 输了<small>${S.bonus > 0 ? '还可继续' : '下次再来'}</small>`;
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
    <div class="row" style="font-size:16px;color:#a8886a">累计投入 ${S.totalIn} · 累计产出 ${S.totalOut} · 返奖率 ${S.totalIn ? Math.round(S.totalOut / S.totalIn * 100) : 0}%</div>
  </div>`;
  ov.classList.add('show');
  ov.querySelector('.close-x').onclick = () => ov.classList.remove('show');
  ov.addEventListener('click', e => { if (e.target === ov) ov.classList.remove('show'); }, { once: true });
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
    if (act === 'reset') { localStorage.removeItem('fd-save-v1'); location.reload(); }
    SFX.play('press');
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
  ov.addEventListener('click', e => { if (e.target === ov) ov.classList.remove('show'); }, { once: true });
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
  $('#menuBtn').addEventListener('pointerdown', e => { e.preventDefault(); SFX.init(); SFX.play('press'); showMenu(); });
  $('#infoBtn').addEventListener('pointerdown', e => { e.preventDefault(); SFX.init(); SFX.play('press'); showInfo(); });
  $('#muteBtn').addEventListener('pointerdown', e => { e.preventDefault(); SFX.init(); setMuted(!S.muted); SFX.play('press'); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  addEventListener('resize', resize);
  resize();

  syncButtons(); startAttract();
  window.__fd = { S, LocalServer, forceCell: c => S.forcedCell = c }; // 调试钩子
}

document.addEventListener('DOMContentLoaded', boot);
window.addEventListener('error', e => {
  (window.__errs = window.__errs || []).push(String(e.message || e));
});
})();
