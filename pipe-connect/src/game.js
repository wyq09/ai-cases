/* 接水管 — 主游戏：状态机 / 渲染 / 水流演出 / 持久化 / AI 演示 */
window.PC = window.PC || {};
PC.GAME = (() => {
  const L = PC.LOGIC;
  const noop = () => {};
  // 缺模块兜底（开发期子代理未就绪也能跑）
  const ART = PC.ART || { pipeStraight: () => '', pipeElbow: () => '', waterPath: () => 'M50,0 L50,100', pipeLen: () => 100, valve: () => '', outletPipe: () => '', cloud: () => '', dove: () => '', clock: () => '', setPalette: noop, palettes: {} };
  const AUDIO = PC.AUDIO || { unlock: noop, play: noop, startLoop: noop, stopLoop: noop, duck: noop, setBGMVolume: noop, setSFXVolume: noop, setMasterVolume: noop, applyOverrides: noop, names: [] };
  const FX = PC.FX || { init: noop, resize: noop, burst: noop, confetti: noop, ambient: noop, stop: noop, clear: noop };
  const PANEL = PC.CONFIG_PANEL || { mount: noop, open: noop, close: noop, isOpen: () => false, onChange: noop, onClearBest: noop, setBest: noop };

  // ?reset=1 必须在任何 localStorage 读取之前
  if (location.search.indexOf('reset=1') >= 0) {
    try { localStorage.removeItem(L.LS_ST); localStorage.removeItem(L.LS_CFG); } catch (e) {}
  }
  const qs = k => {
    const m = location.search.match(new RegExp('[?&]' + k + '=(\\d+)'));
    return m ? +m[1] : null;
  };
  // 错误探针（测试用）
  window.__errs = [];
  window.addEventListener('error', e => window.__errs.push('ERR: ' + e.message + ' @' + (e.filename || '') + ':' + e.lineno));
  window.addEventListener('unhandledrejection', e => window.__errs.push('REJ: ' + (e.reason && e.reason.message || e.reason)));
  // ?snap=1 零动画（无头/遮挡窗口 CSS transition 冻结时保证可测）
  if (location.search.indexOf('snap=1') >= 0) document.documentElement.classList.add('snap');

  function deepMerge(base, patch) {
    const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    if (!patch || typeof patch !== 'object') return out;
    for (const k of Object.keys(patch)) {
      const v = patch[k];
      out[k] = (v && typeof v === 'object' && !Array.isArray(v)) ? deepMerge(base[k] || {}, v) : v;
    }
    return out;
  }
  const loadJSON = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const saveJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

  let cfg = deepMerge(L.DEFAULT_CFG, loadJSON(L.LS_CFG));
  const st = {
    mode: 'menu',            // menu | playing | flowing | win | lose
    level: 1, score: 0,
    board: null, timer: 0,
    best: { score: 0, level: 0 },
    run: null,               // {level, score} 本关开始时快照，刷新续玩
  };
  const saved = loadJSON(L.LS_ST);
  if (saved && typeof saved === 'object') {
    if (saved.best) st.best = saved.best;
    if (saved.run) st.run = saved.run;
  }
  const saveRun = () => saveJSON(L.LS_ST, { best: st.best, run: st.run });

  let dom = {}, cellsDom = [];
  let cellPx = 0, gridLeft = 0, gridTop = 0, rows = 4;
  let timerId = null, checkId = null, demoId = null;
  let lastFlow = null;

  const $ = s => document.querySelector(s);

  /* ---------------- 布局 ---------------- */
  function layout() {
    const vw = dom.app.clientWidth, vh = dom.app.clientHeight;
    const shortVh = vh < 480;
    const navbarH = dom.navbar.offsetHeight;
    const skyH = shortVh ? 64 : Math.max(76, Math.min(Math.round(vw * 0.30), 116));
    // 预留 56px 出水管水带；网格在剩余区内垂直居中
    const flexH = vh - navbarH - skyH - 56;
    rows = st.board ? st.board.rows : L.rowsForLevel(st.level);
    cellPx = Math.floor(Math.min((vw - 12) / L.COLS, flexH / rows));
    const gw = cellPx * L.COLS, gh = cellPx * rows;
    gridLeft = Math.round((vw - gw) / 2);
    const padY = Math.max(0, Math.floor((flexH - gh) / 2));
    gridTop = navbarH + skyH + padY;       // app 坐标（阀门/出水口/波浪用）
    const seaH = Math.max(0, vh - gridTop - gh); // 网格以下水带（含出水管）

    dom.app.style.setProperty('--skyh', skyH + 'px');
    dom.app.style.setProperty('--seah', seaH + 'px');    dom.grid.style.cssText += `;left:${gridLeft}px;top:${padY}px;width:${gw}px;height:${gh}px;`;
    dom.grid.style.gridTemplateRows = `repeat(${rows},1fr)`;
    // 网格线（含四周边框）
    let lines = `<svg width="${gw}" height="${gh}" style="display:block">`;
    for (let i = 0; i <= L.COLS; i++) lines += `<line x1="${i * cellPx}" y1="0" x2="${i * cellPx}" y2="${gh}"/>`;
    for (let j = 0; j <= rows; j++) lines += `<line x1="0" y1="${j * cellPx}" x2="${gw}" y2="${j * cellPx}"/>`;
    lines += '</svg>';
    dom.gridlines.innerHTML = lines;
    dom.gridlines.style.cssText += `;left:${gridLeft}px;top:${padY}px;`;
    const lineEls = dom.gridlines.querySelectorAll('line');
    lineEls.forEach(ln => ln.setAttribute('stroke', 'rgba(255,255,255,.95)')), lineEls.forEach(ln => ln.setAttribute('stroke-width', '2'));

    const waveY = navbarH + skyH + padY + Math.round(cellPx * 0.55);
    dom.wave.style.top = (padY + Math.round(cellPx * 0.55)) + 'px';
    dom.app.style.setProperty('--skystop', (waveY / vh * 100).toFixed(2) + '%');

    // 阀门（对齐第 0 列中心，管底触网格顶；相对 skyband 定位）
    const vw2 = Math.max(64, Math.min(cellPx * 1.02, 108));
    const vh2 = Math.round(vw2 * 1.1);
    dom.valveWrap.style.cssText = `left:${gridLeft + cellPx * 0.5 - vw2 / 2}px;top:${gridTop - navbarH - vh2}px;width:${vw2}px;height:${vh2}px;`;
    dom.valveImg.style.width = '100%'; dom.valveImg.style.height = '100%';
    // 出水口（对齐第 1 列中心，管顶贴网格底，按精确宽高比锚定顶部）
    const ow = Math.min(Math.round(cellPx * 0.62), Math.floor((vh - gridTop - gh - 6) / 1.4));
    const oh = Math.max(40, Math.round(ow * 1.4));
    dom.outletWrap.style.cssText = `left:${gridLeft + cellPx * 1.5 - ow / 2}px;top:-2px;width:${ow}px;height:${oh}px;`;
    dom.outletImg.style.width = '100%'; dom.outletImg.style.height = oh + 'px';

    // 云与白鸽
    const cw = [Math.round(vw * 0.18), Math.round(vw * 0.13), Math.round(vw * 0.10)];
    [['#cloud0', 0.06, 0.10], ['#cloud1', 0.52, 0.30], ['#cloud2', 0.80, 0.06]].forEach(([id, fx, fy], i) => {
      const el = $(id);
      el.style.width = cw[i] + 'px';
      el.style.left = Math.round(vw * fx) + 'px';
      el.style.top = Math.round((skyH - 20) * fy) + 'px';
    });
    dom.dove0.style.width = Math.round(cellPx * 0.44) + 'px';
    dom.dove0.style.left = Math.round(vw * 0.66) + 'px';
    dom.dove0.style.top = Math.round(skyH * 0.52) + 'px';

    FX.resize(vw, vh, Math.min(devicePixelRatio || 1, 2));
  }

  /* ---------------- 渲染 ---------------- */
  function renderStatic() {
    dom.valveImg.src = ART.valve();
    dom.outletImg.src = ART.outletPipe();
    dom.clockImg.src = ART.clock();
    ['#cloud0', '#cloud1', '#cloud2'].forEach((id, i) => $(id).src = ART.cloud(i % 2));
    dom.dove0.src = ART.dove();
  }

  function renderDecor() {
    // 水中幽灵管件装饰（全部位于水波线以下）
    const deco = [
      ['elbow', 6, 40, 1.7, 0], ['straight', 62, 58, 1.5, 90], ['elbow', 30, 76, 1.9, 180],
      ['straight', 84, 44, 1.3, 0], ['elbow', 12, 90, 1.4, 90],
    ];
    dom.bgdecor.innerHTML = '';
    deco.forEach(([kind, x, y, s, r]) => {
      const img = document.createElement('img');
      img.src = kind === 'elbow' ? ART.pipeElbow() : ART.pipeStraight();
      img.style.cssText = `left:${x}%;top:${y}%;width:${Math.round(cellPx * s)}px;transform:rotate(${r}deg);`;
      dom.bgdecor.appendChild(img);
    });
  }

  function renderGrid() {
    dom.grid.innerHTML = '';
    cellsDom = [];
    dom.grid.style.gridTemplateColumns = `repeat(${L.COLS},1fr)`;
    dom.grid.style.gridTemplateRows = `repeat(${rows},1fr)`;
    for (let i = 0; i < L.COLS * rows; i++) {
      const cell = st.board.cells[i];
      const el = document.createElement('div');
      el.className = 'cell'; el.dataset.idx = i;
      const rot = document.createElement('div');
      rot.className = 'rot';
      rot.style.transform = `rotate(${cell.rot * 90}deg)`;
      const img = document.createElement('img');
      img.className = 'pipe';
      img.src = cell.type === 'straight' ? ART.pipeStraight() : ART.pipeElbow();
      img.draggable = false;
      const svgNS = 'http://www.w3.org/2000/svg';
      const wat = document.createElementNS(svgNS, 'svg');
      wat.setAttribute('viewBox', '0 0 100 100');
      wat.setAttribute('class', 'wat');
      const p = document.createElementNS(svgNS, 'path');
      p.setAttribute('d', ART.waterPath(cell.type));
      p.setAttribute('pathLength', '100');
      wat.appendChild(p);
      rot.appendChild(img); rot.appendChild(wat);
      el.appendChild(rot);
      dom.grid.appendChild(el);
      cellsDom.push({ el, rotEl: rot, img, wat, watPath: p, spin: cell.rot * 90 });
    }
    renderDecor();
  }

  function refreshPipeImgs() {
    for (let i = 0; i < cellsDom.length; i++) {
      cellsDom[i].img.src = st.board.cells[i].type === 'straight' ? ART.pipeStraight() : ART.pipeElbow();
      cellsDom[i].watPath.setAttribute('d', ART.waterPath(st.board.cells[i].type));
    }
    renderStatic();
    renderDecor();
  }

  /* ---------------- 流程 ---------------- */
  function startLevel(n, keepScore) {
    st.level = n;
    rows = L.rowsForLevel(n);
    st.board = L.genBoard(rows);
    if (!keepScore) { /* score 由调用方管理 */ }
    st.timer = L.timeForLevel(n, cfg);
    st.mode = 'playing';
    if (dom.outletWater) dom.outletWater.style.height = '0';
    st.run = st.run || { level: n, score: 0 };
    st.run.level = n;
    saveRun();
    hidePanel();
    layout();
    renderGrid();
    updateHUD();
    dom.timerPill.classList.remove('low');
    startTimer();
    AUDIO.startLoop('bgm');
    AUDIO.play('start');
    FX.clear();
  }

  function updateHUD() {
    dom.timeNum.textContent = st.timer;
    dom.lvChip.textContent = `第 ${st.level} 关`;
    dom.scoreChip.textContent = `得分 ${st.score}`;
  }

  function tick() {
    if (st.mode !== 'playing') return;
    st.timer--;
    updateHUD();
    if (st.timer <= 10 && st.timer > 0) {
      AUDIO.play('tick');
      dom.timerPill.classList.add('low');
    }
    if (st.timer <= 0) {
      st.timer = 0; updateHUD();
      stopTimer();
      onLose();
    }
  }
  function startTimer() {
    stopTimer();
    timerId = setInterval(tick, 1000);
  }
  function stopTimer() {
    if (timerId) { clearInterval(timerId); timerId = null; }
  }

  function onRotate(idx, silent) {
    if (st.mode !== 'playing') return;
    const cell = st.board.cells[idx];
    const mod = cell.type === 'straight' ? 2 : 4;
    cell.rot = (cell.rot + 1) % mod;
    const d = cellsDom[idx];
    d.spin += 90;
    d.rotEl.style.transform = `rotate(${d.spin}deg)`;
    if (!silent) AUDIO.play('rotate');
    if (checkId) clearTimeout(checkId);
    checkId = setTimeout(checkWin, 230);
  }

  function checkWin() {
    if (st.mode !== 'playing') return;
    const res = L.solveFrom(rows, st.board.cells);
    if (res.win) beginFlow(res);
  }

  // 水流灌充演出
  function beginFlow(res) {
    st.mode = 'flowing';
    stopTimer();
    lastFlow = { path: res.path.slice(), len: res.path.length };
    dom.valveWrap.classList.add('spin');
    setTimeout(() => dom.valveWrap.classList.remove('spin'), 1100);
    AUDIO.startLoop('flow');
    AUDIO.duck(1500);
    // 阀门口水花
    const appRect = dom.app.getBoundingClientRect();
    FX.burst(gridLeft + cellPx * 0.5, gridTop + 2, { n: 14, up: false });

    const step = 170;
    res.path.forEach((idx, i) => {
      let entry = 0;
      if (i > 0) {
        const a = res.path[i - 1], b = idx;
        const dr = Math.floor(b / L.COLS) - Math.floor(a / L.COLS);
        const dc = (b % L.COLS) - (a % L.COLS);
        const moveEdge = dr < 0 ? 0 : dr > 0 ? 2 : dc > 0 ? 1 : 3;
        entry = L.OPP[moveEdge];
      }
      fillCell(idx, entry, i * step, step);
    });
    const total = res.path.length * step + 240;
    setTimeout(() => {
      AUDIO.stopLoop('flow');
      AUDIO.play('splash');
      // 出水口喷水
      const oy = gridTop + rows * cellPx;
      FX.burst(gridLeft + cellPx * 1.5, oy + 10, { n: 22, up: true });
      dom.outletWater.style.height = '100%';
      setTimeout(() => { FX.confetti(vw2px() * 0.5 - 80, 0, 160); onWin(); }, 500);
    }, total);
  }

  function vw2px() { return dom.app.clientWidth; }

  function fillCell(idx, entryEdge, delay, dur) {
    const d = cellsDom[idx];
    const r = st.board.cells[idx].rot;
    const baseEntry = ((entryEdge - r) % 4 + 4) % 4;
    const forward = baseEntry === L.pathStartEdge();
    d.watPath.style.transition = 'none';
    d.watPath.style.strokeDashoffset = forward ? '100' : '-100';
    d.wat.classList.add('on');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        d.watPath.style.transition = `stroke-dashoffset ${dur}ms linear ${delay}ms`;
        d.watPath.style.strokeDashoffset = '0';
      });
    });
  }

  function onWin() {
    st.mode = 'win';
    const remain = Math.max(0, st.timer);
    const base = cfg.baseScore + (st.level - 1) * cfg.levelBonus;
    const tb = remain * cfg.timeBonus;
    const gained = base + tb;
    st.score += gained;
    if (st.score > st.best.score) st.best.score = st.score;
    if (st.level > st.best.level) st.best.level = st.level;
    st.run = { level: st.level + 1, score: st.score };
    saveRun();
    updateHUD();
    AUDIO.play('win');
    showPanel(`
      <h2>通关！</h2>
      <div class="sub">第 ${st.level} 关 · 用时 ${L.timeForLevel(st.level, cfg) - remain} 秒</div>
      <div class="rows">
        <div class="r"><span>连通奖励</span><b>+${base}</b></div>
        <div class="r"><span>时间奖励</span><b>+${tb}</b></div>
        <div class="r"><span>当前总分</span><b>${st.score}</b></div>
      </div>
      <button class="pbtn" id="pNext">下一关</button>
      <button class="pbtn ghost" id="pMenu2">返回菜单</button>
    `);
    $('#pNext').onclick = () => { AUDIO.play('click'); startLevel(st.level + 1, true); };
    $('#pMenu2').onclick = () => { AUDIO.play('click'); showMenu(); };
  }

  function onLose() {
    st.mode = 'lose';
    stopTimer();
    AUDIO.play('lose');
    showPanel(`
      <h2>时间到！</h2>
      <div class="sub">水管没有接通，再试一次吧</div>
      <div class="rows">
        <div class="r"><span>挑战关卡</span><b>第 ${st.level} 关</b></div>
        <div class="r"><span>当前总分</span><b>${st.score}</b></div>
      </div>
      <button class="pbtn" id="pRetry">重试本关</button>
      <button class="pbtn ghost" id="pMenu3">返回菜单</button>
    `);
    $('#pRetry').onclick = () => { AUDIO.play('click'); st.score = st.run ? st.run.score : 0; startLevel(st.level, true); };
    $('#pMenu3').onclick = () => { AUDIO.play('click'); showMenu(); };
  }

  function showMenu() {
    st.mode = 'menu';
    stopTimer();
    if (demoId) { clearInterval(demoId); demoId = null; }
    showPanel(`
      <h1>接水管</h1>
      <div class="sub">点击水管旋转 90°，限时接通进水口与出水口</div>
      <div class="best">最佳：<b>${st.best.score}</b> 分 · <b>第 ${st.best.level || '—'}</b> 关</div>
      ${st.run ? `<button class="pbtn" id="pCont">继续 · 第 ${st.run.level} 关</button>` : ''}
      <button class="pbtn" id="pStart">开始游戏</button>
      <button class="pbtn ghost" id="pDemo">自动演示</button>
    `);
    $('#pStart').onclick = () => { AUDIO.play('click'); st.score = 0; st.run = null; startLevel(1); };
    const pc = $('#pCont');
    if (pc) pc.onclick = () => { AUDIO.play('click'); st.score = st.run.score; startLevel(st.run.level, true); };
    $('#pDemo').onclick = () => { AUDIO.play('click'); st.score = 0; st.run = null; startLevel(1); startDemo(); };
  }

  function hidePanel() { dom.panelWrap.classList.add('hidden'); }

  function showPanel(html) {
    dom.panel.innerHTML = html;
    dom.panelWrap.classList.remove('hidden');
  }

  /* ---------------- AI 演示 ---------------- */
  function startDemo() {
    if (demoId) { clearInterval(demoId); demoId = null; }
    const seq = [];
    L.solutionRotations(st.board).forEach(s => {
      for (let t = 0; t < s.taps; t++) seq.push(s.idx);
    });
    let i = 0;
    demoId = setInterval(() => {
      if (st.mode !== 'playing' || i >= seq.length) { clearInterval(demoId); demoId = null; return; }
      onRotate(seq[i++]);
    }, 340);
  }

  /* ---------------- toast ---------------- */
  let toastId = null;
  function toast(msg) {
    dom.toast.textContent = msg;
    dom.toast.classList.add('show');
    if (toastId) clearTimeout(toastId);
    toastId = setTimeout(() => dom.toast.classList.remove('show'), 1600);
  }

  /* ---------------- 配置应用 ---------------- */
  function applyCfg() {
    PC.cfg = cfg; // 供 CONFIG_PANEL 读取
    const pal = ART.palettes && ART.palettes[cfg.palette] ? cfg.palette : 'classic';
    ART.setPalette(pal);
    document.documentElement.style.setProperty('--sky', (ART.palettes[pal] || {}).sky || '#6DBAE4');
    document.documentElement.style.setProperty('--water', (ART.palettes[pal] || {}).water || '#55A8D6');
    document.documentElement.style.setProperty('--waterdeep', (ART.palettes[pal] || {}).waterDeep || '#4E9EC9');
    document.documentElement.style.setProperty('--waterflow', (ART.palettes[pal] || {}).waterFlow || '#58B7EC');
    document.documentElement.style.setProperty('--navy', (ART.palettes[pal] || {}).navy || '#2E3450');
    document.documentElement.style.setProperty('--gridline', (ART.palettes[pal] || {}).gridLine || 'rgba(255,255,255,.95)');
    AUDIO.setBGMVolume(cfg.bgmVol);
    AUDIO.setSFXVolume(cfg.sfxVol);
    AUDIO.applyOverrides(cfg.sfxOverrides || {});
    if (cellsDom.length) refreshPipeImgs();
    saveJSON(L.LS_CFG, cfg);
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    dom = {
      app: $('#app'), navbar: $('#navbar'), grid: $('#grid'), gridlines: $('#gridlines'),
      wave: $('#wave'), skyband: $('#skyband'), valveWrap: $('#valveWrap'), valveImg: $('#valveImg'),
      outletWrap: $('#outletWrap'), outletImg: $('#outletImg'), bgdecor: $('#bgdecor'),
      timerPill: $('#timerPill'), timeNum: $('#timeNum'), clockImg: $('#clockImg'),
      lvChip: $('#lvChip'), scoreChip: $('#scoreChip'), dove0: $('#dove0'),
      toast: $('#toast'), panel: $('#panel'), panelWrap: $('#panelWrap'),
    };
    // 出水口内水条（引用出水管艺术图之上的覆盖块）
    dom.outletWater = document.createElement('div');
    dom.outletWater.id = 'outletWater';
    dom.outletWater.style.cssText = 'position:absolute;left:22%;width:56%;bottom:6px;height:0;background:#58B7EC;transition:height .5s ease-in;border-radius:2px;';
    dom.outletWrap.appendChild(dom.outletWater);

    applyCfg();
    FX.init($('#fxcv'));
    PANEL.mount($('#cfgMount'));
    PANEL.onChange(snap => {
      cfg = deepMerge(L.DEFAULT_CFG, snap);
      applyCfg();
      if (cfg.aiDemo && st.mode === 'menu') { st.score = 0; st.run = null; startLevel(1); startDemo(); }
    });
    PANEL.onClearBest(() => { st.best = { score: 0, level: 0 }; saveRun(); toast('最佳纪录已清除'); });
    try { PANEL.setBest(st.best); } catch (e) {}

    $('#btnBack').addEventListener('click', () => { AUDIO.play('click'); showMenu(); });
    $('#btnCfg').addEventListener('click', () => { AUDIO.play('click'); PANEL.open(); });
    dom.grid.addEventListener('click', e => {
      const el = e.target.closest('.cell');
      if (el && st.mode === 'playing') onRotate(+el.dataset.idx);
    });
    document.addEventListener('pointerdown', function once() {
      AUDIO.unlock();
      AUDIO.setBGMVolume(cfg.bgmVol); AUDIO.setSFXVolume(cfg.sfxVol);
      if (qs('muted') !== null) AUDIO.setMasterVolume(0);
      document.removeEventListener('pointerdown', once);
    });

    window.addEventListener('resize', () => { layout(); });
    window.addEventListener('orientationchange', () => setTimeout(layout, 250));

    layout();
    renderStatic();

    const lv = qs('level');
    if (lv !== null) {
      st.score = 0; st.run = null;
      startLevel(lv);
      if (qs('demo') !== null) startDemo();
    } else if (qs('demo') !== null) {
      st.score = 0; st.run = null;
      startLevel(1); startDemo();
    } else {
      showMenu();
    }
    FX.ambient(dom.app.clientWidth, dom.app.clientHeight);
  }

  /* ---------------- 测试钩子 ---------------- */
  window.__pc = {
    get mode() { return st.mode; },
    get level() { return st.level; },
    get score() { return st.score; },
    get timer() { return st.timer; },
    board: () => st.board,
    rotate: idx => onRotate(idx),
    demo: () => startDemo(),
    flow: () => lastFlow,
    start: (n, keep) => startLevel(n, keep),
    solve: () => L.solveFrom(rows, st.board.cells),
    toast,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  return { toast };
})();
