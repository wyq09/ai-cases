/* 填成语 — 状态机 / 渲染 / 交互 / 自定义词库导入分析 UI */
(function () {
  'use strict';
  var L = window.CY.logic;
  var cfg = window.CY.config.get();
  var root = window;

  /* ---------- 内置兜底词库（词库模块缺失时保命） ---------- */
  var EMERGENCY = ('一心一意 十全十美 万水千山 千军万马 青山绿水 山清水秀 风和日丽 春暖花开 ' +
    '花红柳绿 鸟语花香 井井有条 头头是道 天长地久 地久天长 日新月异 异想天开 开门见山 ' +
    '山水相连 连绵不断 断断续续 继往开来 来日方长 长年累月 月明星稀 稀奇古怪 怪模怪样 ' +
    '样样精通 通情达理 理直气壮 壮志凌云 云开雾散 散兵游勇 勇往直前 前因后果 果实累累 ' +
    '累教不改 改邪归正 正大光明 明察秋毫 毫不利己 己所不欲 欲罢不能 能屈能伸 伸手不凡 ' +
    '凡夫俗子 子虚乌有 有口皆碑 碑文流传 传为佳话 话中有话 话不投机 机不可失 失而复得').split(/\s+/);

  /* ---------- 自定义词库存取 ---------- */
  var CustomStore = {
    list: function () {
      try { return JSON.parse(localStorage.getItem(window.CY.config.KEYS.custom) || '[]'); }
      catch (e) { return []; }
    },
    save: function (pkg) {
      var arr = CustomStore.list().filter(function (p) { return p.id !== pkg.id; });
      arr.unshift(pkg);
      try { localStorage.setItem(window.CY.config.KEYS.custom, JSON.stringify(arr.slice(0, 30))); } catch (e) { }
      return pkg;
    },
    get: function (id) {
      var hit = null;
      CustomStore.list().forEach(function (p) { if (p.id === id) hit = p; });
      return hit;
    },
    remove: function (id) {
      var arr = CustomStore.list().filter(function (p) { return p.id !== id; });
      try { localStorage.setItem(window.CY.config.KEYS.custom, JSON.stringify(arr)); } catch (e) { }
    }
  };
  root.CY.custom = CustomStore;

  /* ---------- 状态 ---------- */
  var state = loadState();
  var selKey = null;
  var selWord = null; /* 当前作答的成语（选中流转的锚点） */
  var lastReport = null;
  var fallbackToasted = false;

  function loadState() {
    try {
      var raw = localStorage.getItem(window.CY.config.KEYS.state);
      if (raw) {
        var s = JSON.parse(raw);
        if (s && s.v === 2) return s;
      }
    } catch (e) { }
    return { v: 2, level: 1, coins: 0, totalFilled: 0, milestoneIdx: 0, levelGains: 0, puzzle: null, progress: null };
  }
  function saveState() {
    try { localStorage.setItem(window.CY.config.KEYS.state, JSON.stringify(state)); } catch (e) { }
  }

  /* ---------- 关卡数学 ---------- */
  function wordCountFor(level) {
    var c = cfg.level.startWords + Math.floor((level - 1) / cfg.level.growthEvery);
    return Math.min(cfg.level.maxWords, Math.max(3, c));
  }
  function givenRatioFor(level) {
    return Math.max(0.06, cfg.level.givenRatio - cfg.level.givenDecay * (level - 1));
  }
  function activeBank() {
    var src = cfg.bank.source;
    if (src && src.indexOf('custom:') === 0) {
      var pkg = CustomStore.get(src.slice(7));
      if (pkg && pkg.adopt && pkg.adopt.length >= 3) return pkg.adopt;
      if (!fallbackToasted) { toast('自定义词库可用词条不足，已回退内置词库'); fallbackToasted = true; }
    }
    return (root.CY_BANK && CY_BANK.list && CY_BANK.list.length > 10) ? CY_BANK.list : EMERGENCY;
  }
  function commonChars() {
    return (root.CY_BANK && CY_BANK.COMMON_CHARS) || EMERGENCY.join('').split('');
  }
  function levelSeed(level) {
    return L.fnv1a(cfg.bank.source + '|lvl|' + level + '|v1');
  }
  function ensurePuzzle(force) {
    if (state.puzzle && !force) return;
    var list = activeBank();
    var raw = null, salt = 0;
    while (salt < 6) {
      raw = L.genPuzzle({ seed: (levelSeed(state.level) + salt * 0x9e37) >>> 0, count: wordCountFor(state.level), maxSpan: cfg.level.maxSpan, list: list });
      if (raw && raw.words.length >= 2) break;
      salt++;
    }
    if (!raw || raw.words.length < 2) {
      raw = L.genPuzzle({ seed: levelSeed(state.level), count: Math.min(4, wordCountFor(state.level)), maxSpan: cfg.level.maxSpan, list: EMERGENCY });
    }
    state.puzzle = L.finalizePuzzle({
      words: raw.words, seed: levelSeed(state.level),
      givenRatio: givenRatioFor(state.level), distractorBank: commonChars()
    });
    state.progress = { fills: {}, used: [], attempts: cfg.level.attempts };
    state.levelGains = 0;
    selKey = null;
    selWord = null;
    saveState();
  }
  function gotoLevel(n) {
    n = Math.max(1, Math.min(999999, Math.round(Number(n) || 1)));
    state.level = n;
    ensurePuzzle(true);
    closeModal();
    render();
  }

  /* ---------- 小工具 ---------- */
  function $(id) { return document.getElementById(id); }
  function h(tag, cls, html) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html != null) el.innerHTML = html;
    return el;
  }
  function cnNum(n) {
    if (n > 99) return String(n);
    var d = '零一二三四五六七八九';
    if (n <= 9) return d[n];
    if (n === 10) return '十';
    if (n < 20) return '十' + d[n % 10];
    var t = Math.floor(n / 10), o = n % 10;
    return d[t] + '十' + (o ? d[o] : '');
  }
  function sfx(name) { try { root.CY.audio && CY.audio.play(name); } catch (e) { } }

  /* ---------- 渲染 ---------- */
  function render() {
    renderTop();
    renderStat();
    renderBanner();
    renderRack(); /* 先撑开候选区，棋盘高度才真实 */
    renderGrid();
    /* 字体加载/布局微移兜底：下一帧再校准一次网格尺寸 */
    requestAnimationFrame(function () { renderGrid(); });
  }
  function renderTop() {
    $('coin-num').textContent = state.coins;
  }
  function renderStat() {
    $('stat-words').textContent = state.totalFilled;
    $('stat-attempts').textContent = state.progress ? state.progress.attempts : cfg.level.attempts;
    var chain = $('chain');
    chain.innerHTML = '';
    var ms = cfg.rewards.milestones, am = cfg.rewards.amounts;
    ms.forEach(function (m, i) {
      if (i > 0) {
        chain.appendChild(h('div', 'chain-bar' + (i <= state.milestoneIdx ? ' lit' : '')));
      }
      var st = i < state.milestoneIdx ? 'done' : (i === state.milestoneIdx ? 'next' : 'lock');
      var node = h('div', 'chain-node ' + st);
      node.innerHTML =
        '<div class="chain-label">填对' + m + '个</div>' +
        '<div class="badge"><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 3 C41 3 45 9 47 15 C57 15 61 22 61 32 C61 42 57 49 47 49 C45 55 41 61 32 61 C23 61 19 55 17 49 C7 49 3 42 3 32 C3 22 7 15 17 15 C19 9 23 3 32 3 Z"/></svg>' +
        '<div class="badge-in"><span class="zg">最高</span><span class="amt">+' + am[i] + '</span></div></div>';
      chain.appendChild(node);
    });
  }
  function renderBanner() {
    var t = '第' + cnNum(state.level) + '关';
    if (cfg.bank.source && cfg.bank.source.indexOf('custom:') === 0) t += ' · 自定义';
    $('banner-text').textContent = t;
  }
  function gridMetrics() {
    var pz = state.puzzle;
    var minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
    Object.keys(pz.cells).forEach(function (k) {
      var p = k.split(',');
      var r = +p[0], c = +p[1];
      if (r < minR) minR = r; if (r > maxR) maxR = r;
      if (c < minC) minC = c; if (c > maxC) maxC = c;
    });
    return { minR: minR, maxR: maxR, minC: minC, maxC: maxC, rows: maxR - minR + 1, cols: maxC - minC + 1 };
  }
  function renderGrid() {
    var pz = state.puzzle, m = gridMetrics();
    var board = $('board'), grid = $('grid');
    var bw = board.clientWidth || 360, bh = board.clientHeight || 420;
    /* 先按 gap≈13%size 估尺寸，再用实际 gap 收敛一次，保证含间隙不溢出 */
    function fit(side, n) { return Math.floor(side / (n + 0.13 * Math.max(0, n - 1))); }
    var size = Math.max(30, Math.min(fit(bw - 20, m.cols), fit(bh - 20, m.rows), 60));
    var gap = Math.max(4, Math.round(size * 0.13));
    size = Math.max(30, Math.min(
      Math.floor((bw - 20 - (m.cols - 1) * gap) / m.cols),
      Math.floor((bh - 20 - (m.rows - 1) * gap) / m.rows),
      size));
    gap = Math.max(4, Math.round(size * 0.13));
    var gw = m.cols * size + (m.cols - 1) * gap;
    var gh = m.rows * size + (m.rows - 1) * gap;
    grid.style.width = gw + 'px';
    grid.style.height = gh + 'px';
    grid.style.setProperty('--cell', size + 'px');
    grid.style.setProperty('--gap', gap + 'px');
    grid.innerHTML = '';
    var fills = state.progress.fills;
    Object.keys(pz.cells).forEach(function (k) {
      var p = k.split(',');
      var r = +p[0] - m.minR, c = +p[1] - m.minC;
      var cell = pz.cells[k];
      var filled = !!fills[k];
      var el = h('div', 'cell');
      el.style.left = (c * (size + gap)) + 'px';
      el.style.top = (r * (size + gap)) + 'px';
      el.dataset.key = k;
      if (cell.given) el.classList.add('given');
      else if (filled) el.classList.add('filled');
      else el.classList.add('empty');
      if (k === selKey) el.classList.add('sel');
      el.textContent = (cell.given || filled) ? cell.ch : '';
      grid.appendChild(el);
    });
  }
  function renderRack() {
    var rack = $('rack');
    rack.innerHTML = '';
    var pz = state.puzzle;
    var used = {};
    (state.progress.used || []).forEach(function (i) { used[i] = 1; });
    var seedRng = L.rng32((pz.seed ^ 0x7a11) >>> 0);
    var jitters = pz.pool.map(function () { return seedRng(); });
    pz.pool.forEach(function (ch, i) {
      var el = h('button', 'tile');
      el.type = 'button';
      el.textContent = ch;
      el.dataset.idx = i;
      if (used[i]) { el.classList.add('gone'); }
      var j = jitters[i];
      el.style.transform = 'rotate(' + ((j * 6 - 3).toFixed(1)) + 'deg) translateY(' + ((j * 5 - 2.5).toFixed(1)) + 'px)';
      rack.appendChild(el);
    });
  }

  /* ---------- 玩法逻辑 ---------- */
  function wordCells(wi) {
    var w = state.puzzle.words[wi], ks = [];
    for (var i = 0; i < w.w.length; i++) {
      ks.push((w.r + (w.dir === 'V' ? i : 0)) + ',' + (w.c + (w.dir === 'H' ? i : 0)));
    }
    return ks;
  }
  function isEmptyKey(k) {
    return !state.puzzle.cells[k].given && !state.progress.fills[k];
  }
  function wordEmpties(wi) {
    return wordCells(wi).filter(isEmptyKey);
  }
  /* key 所属的“当前成语”：优先沿用上一个，否则取空位更多的那个未完成词 */
  function pickWordFor(key) {
    var pz = state.puzzle;
    var words = pz.cells[key].words.map(function (x) { return x.wi; });
    if (selWord != null && words.indexOf(selWord) >= 0 && wordEmpties(selWord).length) return selWord;
    var best = null;
    words.forEach(function (wj) {
      var n = wordEmpties(wj).length;
      if (n > 0 && (best === null || n > wordEmpties(best).length)) best = wj;
    });
    return best;
  }
  /* 填对 key 后的下一格：同成语顺延（回绕）→ 本成语完成后沿交叉流转到相邻成语 → 全局阅读序兜底 */
  function nextKeyAfter(key) {
    var pz = state.puzzle;
    var wi = pickWordFor(key);
    if (wi != null) {
      var ks = wordCells(wi);
      var pos = ks.indexOf(key);
      for (var d = 1; d <= ks.length; d++) {
        var k = ks[(pos + d) % ks.length];
        if (isEmptyKey(k)) return { key: k, wi: wi };
      }
    }
    var starts = wi != null ? [wi] : pz.cells[key].words.map(function (x) { return x.wi; });
    var seen = {};
    for (var s = 0; s < starts.length; s++) {
      var cells0 = wordCells(starts[s]);
      for (var c = 0; c < cells0.length; c++) {
        var cws = pz.cells[cells0[c]].words.map(function (x) { return x.wi; });
        for (var q = 0; q < cws.length; q++) {
          var wj = cws[q];
          if (seen[wj]) continue;
          seen[wj] = 1;
          var emp = wordEmpties(wj);
          if (emp.length) return { key: emp[0], wi: wj };
        }
      }
    }
    var fk = firstEmptyKey();
    return { key: fk, wi: fk ? pickWordFor(fk) : null };
  }
  function selectEmptyKey(k) {
    if (!k) return;
    selWord = pickWordFor(k);
    selectKey(k);
  }
  function firstEmptyKey() {
    var pz = state.puzzle, fills = state.progress.fills;
    var keys = Object.keys(pz.cells).filter(function (k) { return !pz.cells[k].given && !fills[k]; });
    keys.sort(function (a, b) {
      var pa = a.split(','), pb = b.split(',');
      return (+pa[0] - +pb[0]) || (+pa[1] - +pb[1]);
    });
    return keys[0] || null;
  }
  function selectKey(k) {
    selKey = k;
    var grid = $('grid');
    Array.prototype.forEach.call(grid.children, function (el) {
      el.classList.toggle('sel', el.dataset.key === k);
    });
  }
  function consumeTile(idx) {
    state.progress.used = state.progress.used || [];
    state.progress.used.push(idx);
  }
  function wordDoneFlash(key) {
    var pz = state.puzzle, fills = state.progress.fills;
    var flash = [];
    pz.words.forEach(function (w) {
      var ks = [];
      for (var i = 0; i < 4; i++) ks.push((w.r + (w.dir === 'V' ? i : 0)) + ',' + (w.c + (w.dir === 'H' ? i : 0)));
      if (ks.indexOf(key) < 0) return;
      var done = ks.every(function (k) { return pz.cells[k].given || fills[k]; });
      if (done) flash = flash.concat(ks);
    });
    var grid = $('grid');
    flash.forEach(function (k) {
      var el = grid.querySelector('[data-key="' + k + '"]');
      if (el) { el.classList.remove('wdone'); void el.offsetWidth; el.classList.add('wdone'); }
    });
  }
  /* 填对（玩家或提示共用）：不校验对错 */
  function applyCorrect(key, tileIdx, viaHint) {
    var pz = state.puzzle;
    var cell = pz.cells[key];
    state.progress.fills[key] = cell.ch;
    if (tileIdx != null) consumeTile(tileIdx);
    state.totalFilled++;
    var adv = L.advanceMilestones(state.totalFilled, cfg.rewards.milestones, cfg.rewards.amounts, state.milestoneIdx);
    if (adv.gains.length) {
      adv.gains.forEach(function (g) {
        state.coins += g.amount;
        state.levelGains += g.amount;
        toast('里程碑达成 填对' + g.target + '个 +' + g.amount + ' 金币');
      });
      sfx('milestone');
    }
    state.milestoneIdx = adv.idx;
    sfx('correct');
    if (viaHint) sfx('hint');
    saveState();
    render();
    /* 渲染后再挂动画类，避免被 DOM 重建抹掉 */
    var el = $('grid').querySelector('[data-key="' + key + '"]');
    if (el) el.classList.add('pop');
    wordDoneFlash(key);
    /* 全部填完 → 过关；否则光标顺延到当前成语的下一个空位 */
    var allDone = Object.keys(pz.cells).every(function (k) { return pz.cells[k].given || state.progress.fills[k]; });
    if (allDone) setTimeout(winLevel, 450);
    else {
      var nx = nextKeyAfter(key);
      selectEmptyKey(nx.key);
    }
  }
  function tapTile(idx) {
    var pz = state.puzzle;
    if ((state.progress.used || []).indexOf(idx) >= 0) return;
    var ch = pz.pool[idx];
    if (!selKey || pz.cells[selKey].given || state.progress.fills[selKey]) {
      var k = firstEmptyKey();
      if (!k) return;
      selectKey(k);
    }
    var key = selKey;
    var cellEl = $('grid').querySelector('[data-key="' + key + '"]');
    var tileEl = $('rack').querySelector('[data-idx="' + idx + '"]');
    if (ch === pz.cells[key].ch) {
      applyCorrect(key, idx, false);
    } else {
      sfx('wrong');
      if (cellEl) { cellEl.classList.remove('wrong'); void cellEl.offsetWidth; cellEl.classList.add('wrong'); }
      if (tileEl) { tileEl.classList.remove('wrong'); void tileEl.offsetWidth; tileEl.classList.add('wrong'); }
      state.progress.attempts--;
      saveState();
      $('stat-attempts').textContent = state.progress.attempts;
      if (state.progress.attempts <= 0) setTimeout(showFail, 500);
    }
  }
  function hint() {
    var pz = state.puzzle;
    var k = (selKey && !pz.cells[selKey].given && !state.progress.fills[selKey]) ? selKey : firstEmptyKey();
    if (!k) { toast('本关已没有待填的空格'); return; }
    if (state.coins < cfg.props.hintCost) { toast('金币不足（提示需 ' + cfg.props.hintCost + '）'); sfx('fail'); return; }
    state.coins -= cfg.props.hintCost;
    var idx = -1;
    for (var i = 0; i < pz.pool.length; i++) {
      if (pz.pool[i] === pz.cells[k].ch && (state.progress.used || []).indexOf(i) < 0) { idx = i; break; }
    }
    closeMenu();
    applyCorrect(k, idx >= 0 ? idx : null, true);
  }

  /* ---------- 过关 / 失败 ---------- */
  function winLevel() {
    sfx('win');
    if (cfg.rewards.completeCoins > 0) {
      state.coins += cfg.rewards.completeCoins;
      state.levelGains += cfg.rewards.completeCoins;
      saveState();
      renderTop();
    }
    var pz = state.puzzle;
    var chips = pz.words.map(function (w) { return '<span class="chip">' + w.w + '</span>'; }).join('');
    showModal(
      '<h3>本关完成</h3>' +
      '<div class="win-sub">第' + cnNum(state.level) + '关 · 本关获得 +' + state.levelGains + ' 金币</div>' +
      '<div class="chips">' + chips + '</div>',
      [
        { label: '下一关', primary: true, cb: function () { state.level++; ensurePuzzle(true); closeModal(); render(); } },
        { label: '重玩本关', cb: function () { restartLevel(); closeModal(); } }
      ]);
  }
  function restartLevel() {
    state.progress = { fills: {}, used: [], attempts: cfg.level.attempts };
    selKey = null;
    selWord = null;
    saveState();
    render();
    selectEmptyKey(firstEmptyKey());
  }
  function showFail() {
    sfx('fail');
    showModal(
      '<h3>次数用完了</h3>' +
      '<div class="win-sub">再接再厉！补点次数或重新开始本关</div>',
      [
        {
          label: '补次数 +' + cfg.props.reviveAttempts + '（' + cfg.props.reviveCost + ' 金币）', primary: true, cb: function () {
            if (state.coins < cfg.props.reviveCost) { toast('金币不足'); return; }
            state.coins -= cfg.props.reviveCost;
            state.progress.attempts = cfg.props.reviveAttempts;
            saveState();
            closeModal();
            render();
            selectEmptyKey(firstEmptyKey());
          }
        },
        { label: '重新开始本关', cb: function () { restartLevel(); closeModal(); } },
        { label: '设置', cb: function () { closeModal(); root.CY.panel && CY.panel.open(); } }
      ]);
  }

  /* ---------- 弹窗 / 菜单 / Toast ---------- */
  function showModal(bodyHtml, btns, opts) {
    opts = opts || {};
    var maskRoot = $('modal-root');
    maskRoot.innerHTML = '';
    var mask = h('div', 'mask');
    var box = h('div', 'modal');
    if (opts.wide) box.classList.add('wide');
    box.innerHTML = bodyHtml;
    var btnRow = h('div', 'btns');
    (btns || []).forEach(function (b) {
      var el = h('button', 'btn' + (b.primary ? ' primary' : ''));
      el.type = 'button';
      el.textContent = b.label;
      el.addEventListener('click', function () { try { b.cb && b.cb(); } catch (e) { console.error(e); } });
      btnRow.appendChild(el);
    });
    box.appendChild(btnRow);
    mask.appendChild(box);
    if (!opts.lock) {
      mask.addEventListener('click', function (e) { if (e.target === mask && !opts.lock) closeModal(); });
    }
    maskRoot.appendChild(mask);
  }
  function closeModal() { $('modal-root').innerHTML = ''; }
  function openMenu() {
    var menu = $('menu-pop');
    menu.classList.add('on');
  }
  function closeMenu() { var m = $('menu-pop'); if (m) m.classList.remove('on'); }
  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('on'); }, 1800);
  }

  /* ---------- 词库导入与可行性分析 ---------- */
  var SAMPLE_IMPORT = '光彩夺目 举目千里 千家万户 万事大吉 大功告成 七步成章\n光明磊落 落落大方 大快人心 心想事成 成千上万 万紫千红';
  function openImport() {
    closeMenu();
    showModal(
      '<h3>自定义词库导入</h3>' +
      '<div class="imp-tip">每行一条或用空格/逗号分隔，每条四个汉字。<br>导入后自动做可行性分析：能否相连成谜、能否完整作答。</div>' +
      '<textarea id="imp-text" rows="6" placeholder="例如：&#10;光彩夺目 举目千里 千家万户&#10;万事大吉 大功告成"></textarea>' +
      '<div class="imp-ops">' +
      '<button type="button" class="btn ghost" id="imp-sample">填入示例</button>' +
      '<button type="button" class="btn ghost" id="imp-curr">导出当前关成语</button>' +
      '<button type="button" class="btn primary" id="imp-run">开始分析</button>' +
      '</div>' +
      '<div id="imp-report"></div>',
      [{ label: '关闭', cb: closeModal }], { wide: true });
    $('imp-sample').addEventListener('click', function () { $('imp-text').value = SAMPLE_IMPORT; });
    $('imp-curr').addEventListener('click', function () {
      $('imp-text').value = state.puzzle.words.map(function (w) { return w.w; }).join(' ');
    });
    $('imp-run').addEventListener('click', function () {
      var text = $('imp-text').value || '';
      var rep = $('imp-report');
      rep.innerHTML = '<div class="imp-loading">分析中…（连通性 + 摆放求解）</div>';
      setTimeout(function () { runAnalysis(text); }, 30);
    });
  }
  function runAnalysis(text, salt) {
    var rep = $('imp-report');
    if (!rep) return;
    analysisSalt = salt || 0;
    var r;
    try { r = L.analyzeImport(text + ' '.repeat(analysisSalt), { maxMs: 1500, tries: 12, maxSpan: cfg.level.maxSpan }); }
    catch (e) { rep.innerHTML = '<div class="imp-sec bad">分析出错：' + e.message + '</div>'; return; }
    lastReport = r;
    var html = '';
    /* 谜面预览 */
    if (r.placement.placed.length >= 2) {
      html += '<div class="imp-sec good"><b>✓ 可行子集 ' + r.placement.placed.length + ' 条</b>，可连成一张完整字谜（预览如下，均可作答）</div>';
      html += '<div class="pv-wrap">' + previewHtml(r.placement.placed) + '</div>';
    } else {
      html += '<div class="imp-sec bad">✗ 不可行：有效且能相连的成语不足 2 条，无法组成字谜</div>';
    }
    if (r.valid.length) html += '<div class="imp-sec">有效 <b>' + r.valid.length + '</b> 条</div>';
    if (r.duplicates.length) html += '<div class="imp-sec">忽略重复 ' + r.duplicates.length + ' 条（' + esc(r.duplicates.join('、')) + '）</div>';
    if (r.invalid.length) html += '<div class="imp-sec warn">✗ 无效 ' + r.invalid.length + ' 条：' + r.invalid.map(function (x) { return esc(x.w) + '（' + x.reason + '）'; }).join('、') + '</div>';
    if (r.isolated.length) html += '<div class="imp-sec warn">✗ 孤立 ' + r.isolated.length + ' 条（与其他成语无公共字，永远连不进字谜）：' + esc(r.isolated.join('、')) + '</div>';
    if (r.placement.unplaced.length) html += '<div class="imp-sec warn">⚠ 未摆入 ' + r.placement.unplaced.length + ' 条（相互位置冲突）：' + r.placement.unplaced.map(function (x) { return esc(x.w); }).join('、') + '</div>';
    var verdictTxt = { full: '结论：全部可行，可直接开玩', partial: '结论：部分可行，可采用下方可行子集', none: '结论：不可行' }[r.verdict];
    html += '<div class="imp-sec verdict ' + r.verdict + '">' + verdictTxt + '（求解 ' + r.placement.ms + 'ms / ' + r.placement.iters + ' 次尝试）</div>';
    html += '<div class="imp-ops">' +
      '<button type="button" class="btn primary" id="imp-adopt"' + (r.adopt.length >= 2 ? '' : ' disabled') + '>采用可行子集（' + r.adopt.length + ' 条）并开始</button>' +
      '<button type="button" class="btn ghost" id="imp-keep"' + (r.valid.length ? '' : ' disabled') + '>仅保存词库</button>' +
      '<button type="button" class="btn ghost" id="imp-retry">重新分析（换摆法）</button>' +
      '</div>';
    rep.innerHTML = html;
    var adoptBtn = $('imp-adopt');
    if (adoptBtn) adoptBtn.addEventListener('click', function () { adoptAnalysis(r, text, true); });
    var keepBtn = $('imp-keep');
    if (keepBtn) keepBtn.addEventListener('click', function () { adoptAnalysis(r, text, false); });
    var retryBtn = $('imp-retry');
    if (retryBtn) retryBtn.addEventListener('click', function () {
      rep.innerHTML = '<div class="imp-loading">分析中…（换一种摆放顺序）</div>';
      setTimeout(function () { runAnalysis(text, analysisSalt + 1); }, 30);
    });
  }
  /* 换摆法：加盐重跑，结果确定性可复现 */
  var analysisSalt = 0;
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  function previewHtml(placedWords) {
    var minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
    placedWords.forEach(function (x) {
      for (var i = 0; i < 4; i++) {
        var rr = x.r + (x.dir === 'V' ? i : 0), cc = x.c + (x.dir === 'H' ? i : 0);
        if (rr < minR) minR = rr; if (rr > maxR) maxR = rr;
        if (cc < minC) minC = cc; if (cc > maxC) maxC = cc;
      }
    });
    var map = {};
    placedWords.forEach(function (x) {
      for (var i = 0; i < 4; i++) {
        var k = (x.r + (x.dir === 'V' ? i : 0)) + ',' + (x.c + (x.dir === 'H' ? i : 0));
        map[k] = x.w[i];
      }
    });
    var rows = maxR - minR + 1, cols = maxC - minC + 1;
    var size = rows > 8 || cols > 8 ? 18 : 24;
    var html = '<div class="pv-grid" style="grid-template-columns:repeat(' + cols + ',' + size + 'px);">';
    for (var r = minR; r <= maxR; r++) {
      for (var c = minC; c <= maxC; c++) {
        var ch = map[r + ',' + c];
        html += ch ? '<span class="pv-cell">' + ch + '</span>' : '<span class="pv-blank"></span>';
      }
    }
    return html + '</div>';
  }
  function adoptAnalysis(r, text, andPlay) {
    if (!r.valid.length) { toast('没有有效成语可保存'); return; }
    var pkg = {
      id: 'c' + Date.now().toString(36),
      name: (r.valid[0] || '') + '等' + r.valid.length + '条',
      text: text,
      adopt: r.adopt,
      createdAt: Date.now()
    };
    CustomStore.save(pkg);
    if (andPlay && r.adopt.length >= 2) {
      window.CY.config.set({ bank: { source: 'custom:' + pkg.id } });
      toast('已切换自定义词库（' + r.adopt.length + ' 条可行）');
    } else {
      toast('词库已保存，可在设置→数据中启用');
    }
    closeModal();
  }

  /* ---------- 配置联动 ---------- */
  window.CY.config.onChange(function (c) {
    var old = cfg;
    cfg = c;
    try {
      if (root.CY.audio) {
        CY.audio.setVol(c.audio);
        CY.audio.applyOverrides({ muted: !!c.audio.muted });
      }
    } catch (e) { }
    document.body.classList.toggle('reduced', !!c.motion.reduced);
    if (!state.puzzle) return;
    if (old.bank.source !== c.bank.source) {
      ensurePuzzle(true); render(); return;
    }
    if (old.level.attempts !== c.level.attempts) {
      state.progress.attempts = c.level.attempts;
      saveState();
    }
    /* 里程碑配置变化 → 从累计数重推进度（不补发金币） */
    state.milestoneIdx = L.advanceMilestones(state.totalFilled, c.rewards.milestones, c.rewards.amounts, 0).idx;
    render();
  });

  /* ---------- 事件绑定与启动 ---------- */
  function bind() {
    $('grid').addEventListener('click', function (e) {
      var el = e.target.closest('.cell');
      if (!el) return;
      var k = el.dataset.key;
      var cell = state.puzzle.cells[k];
      if (cell.given || state.progress.fills[k]) return;
      sfx('tap');
      selWord = pickWordFor(k);
      selectKey(k);
    });
    $('rack').addEventListener('click', function (e) {
      var el = e.target.closest('.tile');
      if (!el || el.classList.contains('gone')) return;
      tapTile(+el.dataset.idx);
    });
    $('btn-menu').addEventListener('click', function (e) {
      e.stopPropagation();
      sfx('tap');
      var m = $('menu-pop');
      m.classList.contains('on') ? closeMenu() : openMenu();
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('#menu-pop') && !e.target.closest('#btn-menu')) closeMenu();
    });
    $('btn-back').addEventListener('click', function () {
      showModal('<h3>重新开始本关？</h3><div class="win-sub">当前进度将清空（成语总数与金币保留）</div>',
        [{ label: '重开本关', primary: true, cb: function () { restartLevel(); closeModal(); } }, { label: '取消', cb: closeModal }]);
    });
    $('menu-hint').addEventListener('click', hint);
    $('menu-restart').addEventListener('click', function () { closeMenu(); restartLevel(); });
    $('menu-jump').addEventListener('click', function () {
      closeMenu();
      showModal(
        '<h3>跳关</h3><div class="win-sub">输入关卡号（1 ~ 999999），直达对应谜面</div>' +
        '<input id="jump-num" class="num-in" type="number" min="1" max="999999" value="' + state.level + '">',
        [{
          label: '跳过去', primary: true, cb: function () { gotoLevel($('jump-num').value); }
        }, { label: '取消', cb: closeModal }]);
    });
    $('menu-import').addEventListener('click', openImport);
    $('menu-cfg').addEventListener('click', function () {
      closeMenu();
      if (root.CY.panel) CY.panel.open();
      else toast('设置面板未加载');
    });
    window.addEventListener('resize', function () { renderGrid(); });
    document.addEventListener('visibilitychange', function () { });
    document.addEventListener('pointerdown', function unlockAudio() {
      try {
        if (root.CY.audio) {
          CY.audio.init();
          CY.audio.unlock();
          CY.audio.setVol(cfg.audio);
          CY.audio.applyOverrides({ muted: !!cfg.audio.muted });
          if (!cfg.audio.muted && cfg.audio.bgm > 0) CY.audio.startBgm();
        }
      } catch (e) { }
      document.removeEventListener('pointerdown', unlockAudio);
    });
  }

  function start() {
    if (!root.CY_BANK || !CY_BANK.list || CY_BANK.list.length < 10) {
      /* 词库模块缺失/过小时用兜底词库，游戏不死锁 */
    }
    ensurePuzzle(false);
    bind();
    render();
    selectEmptyKey(firstEmptyKey());
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  /* ---------- 调试钩子 ---------- */
  root.__cy = {
    get state() { return state; },
    get selWord() { return selWord; },
    cfg: function () { return window.CY.config.get(); },
    fill: function (r, c, ch) {
      var k = r + ',' + c;
      selectKey(k);
      var pz = state.puzzle;
      for (var i = 0; i < pz.pool.length; i++) {
        if (pz.pool[i] === (ch || pz.cells[k].ch) && (state.progress.used || []).indexOf(i) < 0) { tapTile(i); return true; }
      }
      return false;
    },
    puzzle: function () { return state.puzzle; },
    analyze: function (t) { return L.analyzeImport(t, { maxMs: 1500 }); },
    gotoLevel: gotoLevel,
    setCoins: function (n) { state.coins = n | 0; saveState(); renderTop(); },
    openImport: openImport,
    restart: restartLevel,
    get report() { return lastReport; }
  };
  if (typeof module !== 'undefined' && module.exports) { /* 浏览器专属，node 不导出 */ }
})();
