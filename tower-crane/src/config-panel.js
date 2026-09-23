/* ============================================================
 * tower-crane · TC.CFGP 内置配置面板（手机底部抽屉 · 卡通工地风）
 * ------------------------------------------------------------------------
 * 数据流红线：
 *   - cfg 唯一来源是 window.TC.cfg：open() 时深拷贝为 work，编辑一律改
 *     work 后 commit() → 逐个通知 onChange 回调（传完整 cfg 深拷贝快照）。
 *   - 面板自身永不写 localStorage。唯一例外（契约允许）：「清除进度存档」
 *     直接 removeItem('tc_state_v1') 并 toast 提示刷新生效。
 *   - 「恢复默认」类按钮重置为 TC.core.defaultCfg() 对应值（TC.core 不在
 *     时用文件内备份默认表）；TC.AUDIO / TC.ART 未就绪一律判存在再调。
 *   - 关闭面板丢弃 work，不做暂停联动，游戏继续跑。
 *
 * 结构：底部 tab（皮肤/音效/玩法/数据），移动端底部抽屉 max-height 78vh
 *   可滚动 + overscroll-behavior:contain + safe-area；≥620px 视口转居中
 *   弹窗。所有可点区域 ≥44px。类名前缀 tcxp-，样式 <style> 只注入一次。
 * ============================================================ */
(function () {
  'use strict';

  var HAS_DOC = typeof document !== 'undefined';
  var TC = (typeof window !== 'undefined') ? (window.TC = window.TC || {}) : {};

  /* ---------------- 内置兜底（TC.core 缺失时用） ---------------- */

  function BUILTIN_DEFAULTS() {
    return {
      targetFloors: 40, startLives: 4, maxLives: 6,
      blockW: 120, blockH: 76, cableLen: 150,
      swingAmp: 110, swingPeriod: 2600, ampPerFloor: 0.9, ampMax: 155,
      periodPerFloor: -17, periodMin: 1500,
      gravity: 2400, carryVelocity: false,
      perfectPct: 0.09, greatPct: 0.28, goodPct: 0.5, topple: true, swayMax: 7,
      scoreFloor: 10, scoreGreat: 25, scorePerfect: 60, comboStep: 15,
      milestoneEvery: 8, milestoneBonus: 100, milestoneLife: 1,
      camLerp: 0.12, dropSpawnDelay: 350,
      demo: false, muted: false, bgmVolume: 0.35, sfxVolume: 0.9,
      roomColors: [
        { body: '#ef6a5e', dark: '#c94b41', light: '#ff9285' },
        { body: '#7cdcb4', dark: '#54b78e', light: '#aaf0d2' },
        { body: '#f5a733', dark: '#d1821a', light: '#ffc76e' },
        { body: '#5fb7ef', dark: '#3d8fc9', light: '#96d5fb' },
      ],
      icons: { room: '', bg: '', hook: '' },
      sounds: {},
    };
  }
  var BUILTIN_CUES = ['click', 'release', 'perfect', 'great', 'good', 'miss', 'over', 'win', 'milestone', 'combo', 'bgm'];
  var CUE_NAME = {
    click: '轻点', release: '松钩', perfect: '完美', great: '很棒', good: '不错',
    miss: '失手', over: '游戏结束', win: '达标庆祝', milestone: '里程碑',
    combo: '连击', bgm: '背景音乐',
  };

  /* ---------------- 小工具 ---------------- */

  function clone(o) { try { return JSON.parse(JSON.stringify(o)); } catch (e) { return null; } }
  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function txt(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* 粗描边圆角小图标（内联 SVG，随文字变色，不用 emoji） */
  function ico(name) {
    var p = {
      close: '<path d="M6 6l12 12M18 6L6 18"/>',
      up: '<path d="M12 19V6M6 12l6-6 6 6"/>',
      down: '<path d="M12 5v13M6 11l6 6 6-6"/>',
      play: '<path d="M8.5 5.5l10.5 6.5-10.5 6.5z"/>',
      refresh: '<path d="M20 12a8 8 0 1 1-2.4-5.7M20 4.5v4h-4"/>',
      trash: '<path d="M4.5 7h15M9.5 7V5h5v2M7 7l1 12.5h8L17 7"/>',
      plus: '<path d="M12 5.5v13M5.5 12h13"/>',
    }[name];
    if (!p) return '';
    return '<svg class="tcxp-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
  }

  var PLACEHOLDER = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
    '<rect x="7" y="7" width="50" height="50" rx="10" fill="#eaf6fd" stroke="#7ba7c9" stroke-width="2.5" stroke-dasharray="6 5"/>' +
    '<rect x="22" y="26" width="20" height="14" rx="3" fill="none" stroke="#7ba7c9" stroke-width="2.5"/></svg>');

  function defaultsFn() {
    try {
      if (TC.core && typeof TC.core.defaultCfg === 'function') return clone(TC.core.defaultCfg()) || BUILTIN_DEFAULTS();
    } catch (e) { /* 落到内置表 */ }
    return BUILTIN_DEFAULTS();
  }
  function cfgSrc() {
    return isObj(TC.cfg) ? TC.cfg : defaultsFn();
  }

  /* ---------------- 面板状态与 onChange ---------------- */

  var panel = null, work = null, els = null, curTab = 0;
  var cbs = [];
  var imgInput = null, sndInput = null, dataInput = null;
  var imgTarget = null, sndTarget = null;
  var toastTimer = 0, confirmFn = null;
  var cfTitle = null, cfText = null, cfOk = null;

  function onChange(cb) { if (typeof cb === 'function') cbs.push(cb); }

  /* 面板编辑唯一出口：通知全部回调（完整深拷贝快照），不落盘 */
  function commit() {
    if (!work) return;
    var snap = clone(work);
    if (!snap) return;
    for (var i = 0; i < cbs.length; i++) {
      try { cbs[i](snap); } catch (e) { /* 单个回调异常不打断面板 */ }
    }
  }

  function normalizeWork(w) {
    if (!isObj(w)) w = {};
    if (!isObj(w.icons)) w.icons = { room: '', bg: '', hook: '' };
    ['room', 'bg', 'hook'].forEach(function (k) { if (typeof w.icons[k] !== 'string') w.icons[k] = ''; });
    if (!isObj(w.sounds)) w.sounds = {};
    if (!Array.isArray(w.roomColors) || !w.roomColors.length) w.roomColors = clone(defaultsFn().roomColors);
    w.roomColors = w.roomColors.filter(function (c) {
      return isObj(c) && typeof c.body === 'string' && typeof c.dark === 'string' && typeof c.light === 'string';
    });
    if (!w.roomColors.length) w.roomColors = clone(BUILTIN_DEFAULTS().roomColors);
    return w;
  }

  /* ---------------- open / close / toggle ---------------- */

  function parseTab(t) {
    if (t == null) return curTab;
    if (typeof t === 'number' && isFinite(t)) return clamp(Math.round(t), 0, 3);
    var s = String(t).trim().toLowerCase();
    var map = { skin: 0, 皮肤: 0, sound: 1, audio: 1, 音效: 1, play: 2, game: 2, 玩法: 2, data: 3, 数据: 3 };
    return (s in map) ? map[s] : curTab;
  }

  function open(tab) {
    if (!HAS_DOC) return;
    if (!document.body) { setTimeout(function () { open(tab); }, 30); return; }
    if (!panel) build();
    work = normalizeWork(clone(cfgSrc()) || {});
    syncAll();
    hideConfirm();
    setTab(parseTab(tab));
    panel.mask.classList.add('tcxp-show');
  }
  function close() {
    if (!panel) return;
    panel.mask.classList.remove('tcxp-show');
    hideConfirm();
    work = null; /* 丢弃工作副本 */
  }
  function toggle() { if (isOpen()) close(); else open(); }
  function isOpen() { return !!(panel && panel.mask.classList.contains('tcxp-show')); }

  function toast(msg) {
    if (!panel) return;
    panel.toast.textContent = msg;
    panel.toast.classList.add('tcxp-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      if (panel) panel.toast.classList.remove('tcxp-show');
    }, 1800);
  }

  /* ---------------- 确认层（二次确认，z 9500） ---------------- */

  function askConfirm(title, text, okText, fn, danger) {
    if (!panel) return;
    if (cfTitle) cfTitle.textContent = title;
    if (cfText) cfText.textContent = text;
    if (cfOk) {
      cfOk.textContent = okText;
      cfOk.classList.toggle('tcxp-dgrfill', !!danger);
      cfOk.classList.toggle('tcxp-pri', !danger);
    }
    confirmFn = fn;
    panel.confirm.classList.add('tcxp-show');
  }
  function hideConfirm() {
    confirmFn = null;
    if (panel) panel.confirm.classList.remove('tcxp-show');
  }

  /* ---------------- 控件行 ---------------- */

  function sec(t) { return el('div', 'tcxp-sec', txt(t)); }
  function hint(t) { return el('div', 'tcxp-hint', txt(t)); }

  function paintRng(rng) {
    var min = parseFloat(rng.min), max = parseFloat(rng.max), v = parseFloat(rng.value);
    var p = (max > min) ? ((v - min) / (max - min)) * 100 : 0;
    rng.style.background = 'linear-gradient(90deg,#ffb928 0%,#ffb928 ' + p + '%,#eadfc6 ' + p + '%,#eadfc6 100%)';
  }

  /* 滑杆行：标签+数值一行，滑杆整行在下（好拖）。scale=显示×倍率 */
  function slider(label, key, o) {
    var sc = o.scale || 1;
    var dec = (o.dec == null) ? 0 : o.dec;
    var r = el('div', 'tcxp-srow');
    var line = el('div', 'tcxp-sline');
    line.appendChild(el('span', 'tcxp-lab', txt(label)));
    var val = el('span', 'tcxp-val', '');
    line.appendChild(val);
    var rng = document.createElement('input');
    rng.type = 'range';
    rng.className = 'tcxp-rng';
    rng.min = String(o.min * sc);
    rng.max = String(o.max * sc);
    rng.step = String(o.step * sc);
    rng.setAttribute('data-key', key);
    rng.setAttribute('aria-label', label);
    var fmt = function (shown) { return shown.toFixed(dec) + (o.unit ? ' ' + o.unit : ''); };
    rng.addEventListener('input', function () {
      if (!work) return;
      var v = parseFloat(rng.value);
      if (isNaN(v)) return;
      work[key] = v / sc;
      val.textContent = fmt(v);
      paintRng(rng);
      commit();
    });
    r.appendChild(line);
    r.appendChild(rng);
    if (els) els.nums[key] = { rng: rng, val: val, fmt: fmt, sc: sc, min: o.min, max: o.max, def: o.def };
    return r;
  }

  /* 开关行（整行可点，命中区大） */
  function toggleRow(label, key, sub) {
    var r = el('div', 'tcxp-row tcxp-trow');
    var lw = el('div', 'tcxp-labwrap');
    lw.appendChild(el('span', 'tcxp-lab', txt(label)));
    if (sub) lw.appendChild(el('span', 'tcxp-labsub', txt(sub)));
    r.appendChild(lw);
    var b = el('button', 'tcxp-sw', '<i></i>');
    b.type = 'button';
    b.setAttribute('role', 'switch');
    b.setAttribute('aria-label', label);
    function flip() {
      if (!work) return;
      work[key] = !work[key];
      paint(b, work[key]);
      commit();
    }
    b.addEventListener('click', flip);
    r.appendChild(b);
    r.addEventListener('click', function (e) { if (e.target !== b && !b.contains(e.target)) flip(); });
    if (els) els.togs[key] = b;
    return r;
  }
  function paint(b, v) {
    b.classList.toggle('tcxp-on', !!v);
    b.setAttribute('aria-checked', v ? 'true' : 'false');
  }

  /* 动作行（数据页）：左标签+说明，右按钮 */
  function actRow(label, sub, btnHtml, fn, danger) {
    var r = el('div', 'tcxp-row');
    var lw = el('div', 'tcxp-labwrap');
    lw.appendChild(el('span', 'tcxp-lab', txt(label)));
    if (sub) lw.appendChild(el('span', 'tcxp-labsub', txt(sub)));
    var b = el('button', 'tcxp-btn tcxp-actbtn' + (danger ? ' tcxp-dgr' : ''), btnHtml);
    b.type = 'button';
    b.addEventListener('click', fn);
    r.appendChild(lw);
    r.appendChild(b);
    return r;
  }

  /* ---------------- 页 1 · 皮肤 ---------------- */

  function buildSkinPage() {
    var p = el('div', 'tcxp-page');

    p.appendChild(sec('房间块配色'));
    p.appendChild(el('div', 'tcxp-cdesc', txt('楼塔房间块按顺序循环取用这几种颜色，最少 3 色、最多 6 色。')));
    els.colorList = el('div', 'tcxp-clist');
    p.appendChild(els.colorList);
    var ops = el('div', 'tcxp-cops');
    els.addBtn = el('button', 'tcxp-btn tcxp-pri tcxp-flex1', ico('plus') + '<span>加一色</span>');
    els.addBtn.type = 'button';
    els.addBtn.addEventListener('click', function () {
      if (!work) return;
      if (work.roomColors.length >= 6) { toast('最多 6 种颜色'); return; }
      var lastC = work.roomColors[work.roomColors.length - 1];
      work.roomColors.push(clone(lastC) || { body: '#9aa7b5', dark: '#7b8794', light: '#c2cdd8' });
      commit();
      rebuildColors();
    });
    var bResetC = el('button', 'tcxp-btn tcxp-flex1', ico('refresh') + '<span>恢复默认配色</span>');
    bResetC.type = 'button';
    bResetC.addEventListener('click', function () {
      if (!work) return;
      work.roomColors = clone(defaultsFn().roomColors);
      commit();
      rebuildColors();
      toast('已恢复默认配色');
    });
    ops.appendChild(els.addBtn);
    ops.appendChild(bResetC);
    p.appendChild(ops);

    p.appendChild(sec('图片替换'));
    p.appendChild(skinRow('room', '房间块贴图', '替换全部房间块的绘制'));
    p.appendChild(skinRow('bg', '背景图', '替换天空 + 城市背景'));
    p.appendChild(skinRow('hook', '吊钩贴图', '替换吊钩绘制（缆绳仍程序绘制）'));
    p.appendChild(hint('上传图片会等比压缩成小图后保存在配置里（房间块/吊钩长边 320px、背景 720px）；「恢复默认」即清空自定义贴图。'));
    return p;
  }

  function skinRow(key, name, sub) {
    var row = el('div', 'tcxp-skin');
    var th = el('div', 'tcxp-thumb');
    var img = document.createElement('img');
    img.alt = name + '预览';
    th.appendChild(img);
    var info = el('div', 'tcxp-skininfo');
    info.appendChild(el('div', 'tcxp-skinname', txt(name)));
    info.appendChild(el('div', 'tcxp-skinsub', txt(sub)));
    var st = el('div', 'tcxp-chip', '默认');
    info.appendChild(st);
    var act = el('div', 'tcxp-skinact');
    var bU = el('button', 'tcxp-btn', ico('up') + '<span>上传</span>');
    bU.type = 'button';
    bU.addEventListener('click', function () { imgTarget = key; if (imgInput) imgInput.click(); });
    var bR = el('button', 'tcxp-btn', ico('refresh') + '<span>恢复默认</span>');
    bR.type = 'button';
    bR.addEventListener('click', function () {
      if (!work) return;
      work.icons[key] = '';
      commit();
      syncSkins();
      toast(name + '已恢复默认');
    });
    act.appendChild(bU);
    act.appendChild(bR);
    row.appendChild(th);
    row.appendChild(info);
    row.appendChild(act);
    els.skinImgs[key] = img;
    els.skinChips[key] = st;
    els.skinThumbs[key] = th;
    return row;
  }

  function rebuildColors() {
    if (!els || !work) return;
    var list = els.colorList;
    list.innerHTML = '';
    work.roomColors.forEach(function (c, i) {
      var row = el('div', 'tcxp-crow');
      row.appendChild(el('span', 'tcxp-cidx', txt('色 ' + (i + 1))));
      [['body', '主色'], ['dark', '描边'], ['light', '高光']].forEach(function (pair) {
        var cell = el('label', 'tcxp-ccell');
        var inp = document.createElement('input');
        inp.type = 'color';
        inp.className = 'tcxp-col';
        inp.value = c[pair[0]];
        inp.setAttribute('aria-label', '色 ' + (i + 1) + ' ' + pair[1]);
        inp.addEventListener('input', function () {
          if (!work || !work.roomColors[i]) return;
          work.roomColors[i][pair[0]] = inp.value;
          commit();
        });
        cell.appendChild(inp);
        cell.appendChild(el('span', null, txt(pair[1])));
        row.appendChild(cell);
      });
      var del = el('button', 'tcxp-delc', ico('trash'));
      del.type = 'button';
      del.setAttribute('aria-label', '删除色 ' + (i + 1));
      if (work.roomColors.length <= 3) del.disabled = true;
      del.addEventListener('click', function () {
        if (!work) return;
        if (work.roomColors.length <= 3) { toast('至少保留 3 种颜色'); return; }
        work.roomColors.splice(i, 1);
        commit();
        rebuildColors();
      });
      row.appendChild(del);
      list.appendChild(row);
    });
    els.addBtn.disabled = work.roomColors.length >= 6;
  }

  function syncSkins() {
    if (!els) return;
    ['room', 'bg', 'hook'].forEach(function (k) {
      var custom = !!(work && work.icons && work.icons[k]);
      if (els.skinImgs[k]) els.skinImgs[k].src = (custom ? work.icons[k] : '') || PLACEHOLDER;
      if (els.skinChips[k]) {
        els.skinChips[k].textContent = custom ? '已自定义' : '默认';
        els.skinChips[k].classList.toggle('tcxp-on', custom);
      }
      if (els.skinThumbs[k]) els.skinThumbs[k].classList.toggle('tcxp-custom', custom);
    });
  }

  /* ---------------- 页 2 · 音效 ---------------- */

  function buildSoundPage() {
    var p = el('div', 'tcxp-page');
    p.appendChild(sec('音量'));
    p.appendChild(slider('BGM 音量', 'bgmVolume', { min: 0, max: 1, step: 0.05, scale: 100, dec: 0, unit: '%' }));
    p.appendChild(slider('音效音量', 'sfxVolume', { min: 0, max: 1, step: 0.05, scale: 100, dec: 0, unit: '%' }));
    p.appendChild(toggleRow('静音', 'muted', '关掉全部声音'));

    p.appendChild(sec('音效替换'));
    var cues = (TC.AUDIO && Array.isArray(TC.AUDIO.names) && TC.AUDIO.names.length) ? TC.AUDIO.names : BUILTIN_CUES;
    cues.forEach(function (cue) {
      var name = CUE_NAME[cue] || cue;
      var row = el('div', 'tcxp-cue');
      var l1 = el('div', 'tcxp-cuel1');
      var nm = el('div', 'tcxp-cuename');
      nm.appendChild(el('span', 'tcxp-lab', txt(name)));
      nm.appendChild(el('span', 'tcxp-cuecode', txt(cue)));
      l1.appendChild(nm);
      var chip = el('span', 'tcxp-chip', '默认');
      l1.appendChild(chip);
      row.appendChild(l1);
      var l2 = el('div', 'tcxp-cuel2');
      var bU = el('button', 'tcxp-btn tcxp-xs', ico('up') + '<span>上传替换</span>');
      bU.type = 'button';
      bU.addEventListener('click', function () { sndTarget = cue; if (sndInput) sndInput.click(); });
      var bP = el('button', 'tcxp-btn tcxp-xs', ico('play') + '<span>试听</span>');
      bP.type = 'button';
      bP.addEventListener('click', function () {
        try {
          if (TC.AUDIO && typeof TC.AUDIO.play === 'function') TC.AUDIO.play(cue);
          else toast('音频引擎未就绪');
        } catch (e) { toast('播放失败'); }
      });
      var bR = el('button', 'tcxp-btn tcxp-xs', ico('refresh') + '<span>恢复</span>');
      bR.type = 'button';
      bR.addEventListener('click', function () {
        if (!work) return;
        work.sounds[cue] = '';
        commit();
        syncSounds();
        toast('「' + name + '」已恢复默认');
      });
      l2.appendChild(bU);
      l2.appendChild(bP);
      l2.appendChild(bR);
      row.appendChild(l2);
      els.sndChips[cue] = chip;
      p.appendChild(row);
    });
    p.appendChild(hint('上传音频文件（≤600KB）替换对应音效；「试听」走游戏音频引擎，引擎未就绪时无法播放。'));
    return p;
  }

  function syncSounds() {
    if (!els) return;
    Object.keys(els.sndChips).forEach(function (cue) {
      var custom = !!(work && work.sounds && work.sounds[cue]);
      els.sndChips[cue].textContent = custom ? '已替换' : '默认';
      els.sndChips[cue].classList.toggle('tcxp-on', custom);
    });
  }

  /* ---------------- 页 3 · 玩法 ---------------- */

  function buildPlayPage() {
    var p = el('div', 'tcxp-page');

    p.appendChild(sec('目标与生命'));
    p.appendChild(slider('目标层数', 'targetFloors', { min: 10, max: 200, step: 1, unit: '层' }));
    p.appendChild(slider('初始生命', 'startLives', { min: 1, max: 5, step: 1, unit: '条' }));
    p.appendChild(slider('生命上限', 'maxLives', { min: 1, max: 9, step: 1, unit: '条' }));
    p.appendChild(slider('里程碑间隔', 'milestoneEvery', { min: 5, max: 30, step: 1, unit: '层' }));
    p.appendChild(slider('里程碑奖励分', 'milestoneBonus', { min: 0, max: 500, step: 5, unit: '分' }));
    p.appendChild(slider('里程碑加命', 'milestoneLife', { min: 0, max: 2, step: 1, unit: '条' }));

    p.appendChild(sec('方块与吊索'));
    p.appendChild(slider('房间块宽', 'blockW', { min: 80, max: 200, step: 2, unit: 'px' }));
    p.appendChild(slider('房间块高', 'blockH', { min: 50, max: 140, step: 2, unit: 'px' }));
    p.appendChild(slider('缆绳长度', 'cableLen', { min: 80, max: 260, step: 2, unit: 'px' }));
    p.appendChild(slider('出块间隔', 'dropSpawnDelay', { min: 100, max: 1500, step: 10, unit: 'ms' }));

    p.appendChild(sec('摆动与重力'));
    p.appendChild(slider('摆动振幅', 'swingAmp', { min: 50, max: 180, step: 1, unit: 'px' }));
    p.appendChild(slider('摆动周期', 'swingPeriod', { min: 1200, max: 4000, step: 20, unit: 'ms' }));
    p.appendChild(slider('每层增幅', 'ampPerFloor', { min: 0, max: 3, step: 0.1, dec: 1, unit: 'px/层' }));
    p.appendChild(slider('振幅上限', 'ampMax', { min: 100, max: 220, step: 1, unit: 'px' }));
    p.appendChild(slider('每层加速', 'periodPerFloor', { min: -60, max: 0, step: 1, unit: 'ms/层' }));
    p.appendChild(slider('周期下限', 'periodMin', { min: 800, max: 2400, step: 20, unit: 'ms' }));
    p.appendChild(slider('重力', 'gravity', { min: 800, max: 5000, step: 50, unit: 'px/s²' }));
    p.appendChild(toggleRow('惯性落块', 'carryVelocity', '松钩时保留摆动横速度（进阶）'));

    p.appendChild(sec('判定与计分'));
    p.appendChild(slider('完美判定带', 'perfectPct', { min: 0.03, max: 0.2, step: 0.01, scale: 100, unit: '%' }));
    p.appendChild(slider('良好判定带', 'greatPct', { min: 0.1, max: 0.45, step: 0.01, scale: 100, unit: '%' }));
    p.appendChild(slider('及格判定带', 'goodPct', { min: 0.3, max: 0.8, step: 0.01, scale: 100, unit: '%' }));
    p.appendChild(slider('完美得分', 'scorePerfect', { min: 0, max: 200, step: 5, unit: '分' }));
    p.appendChild(slider('良好得分', 'scoreGreat', { min: 0, max: 200, step: 5, unit: '分' }));
    p.appendChild(slider('落块基础分', 'scoreFloor', { min: 0, max: 200, step: 5, unit: '分' }));
    p.appendChild(slider('连击加成', 'comboStep', { min: 0, max: 200, step: 5, unit: '分' }));
    p.appendChild(hint('判定带按块宽的百分比计算，建议保持 完美 < 良好 < 及格（及格建议 ≤50%，落地的块自身才站得稳）。'));

    p.appendChild(sec('重心物理'));
    p.appendChild(toggleRow('重心倒塌', 'topple', '重心越出支撑面时，上面整截翻倒坠落并损一命'));
    p.appendChild(slider('塔顶摇摆', 'swayMax', { min: 0, max: 20, step: 1, unit: 'px' }));
    p.appendChild(hint('塔身失衡时顶部会摇摆提示险情；设为 0 关闭摇摆动画（倒塌判定不受影响）。'));

    p.appendChild(sec('其他'));
    p.appendChild(toggleRow('AI 托管', 'demo', '自动在完美带内松钩（演示用）'));
    return p;
  }

  /* ---------------- 页 4 · 数据 ---------------- */

  function buildDataPage() {
    var p = el('div', 'tcxp-page');
    p.appendChild(sec('配置文件'));
    p.appendChild(actRow('导出配置', '下载 .json 文件，含当前全部设置',
      ico('down') + '<span>导出</span>', exportData));
    p.appendChild(actRow('导入配置', '选择此前导出的 .json 文件',
      ico('up') + '<span>导入</span>', function () { if (dataInput) dataInput.click(); }));

    p.appendChild(sec('危险操作'));
    p.appendChild(actRow('恢复默认配置', '全部选项回到默认值（含贴图与音效）',
      ico('refresh') + '<span>恢复默认</span>', function () {
        askConfirm('恢复默认配置', '全部配色、贴图、音效和数值都会回到默认值，确定吗？', '确认恢复', function () {
          work = normalizeWork(defaultsFn());
          commit();
          syncAll();
          toast('已恢复默认配置');
        });
      }));
    p.appendChild(actRow('清除进度存档', '删除最佳纪录与进行中的塔（配置保留）',
      ico('trash') + '<span>清除</span>', function () {
        askConfirm('清除进度存档', '将删除最佳分数、最高层数与进行中的塔，操作不可恢复。', '确认清除', function () {
          /* 契约允许的唯一例外：进度档不属于配置数据流 */
          try { localStorage.removeItem('tc_state_v1'); } catch (e) { /* ignore */ }
          toast('已清除进度存档，刷新页面后生效');
        }, true);
      }, true));
    p.appendChild(hint('改动即时生效并广播给游戏；导出文件仅包含配置，不含进度存档。'));
    return p;
  }

  /* ---------------- 导出 / 导入 ---------------- */

  function exportData() {
    try {
      var payload = { app: 'tower-crane', ver: 1, time: Date.now(), cfg: clone(work || cfgSrc()) };
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      var href = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = href;
      a.download = 'tc-cfg-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { try { URL.revokeObjectURL(href); } catch (e) { /* ignore */ } }, 3000);
      toast('配置已导出');
    } catch (e) { toast('导出失败'); }
  }

  function importDataText(text) {
    var o = null;
    try { o = JSON.parse(text); } catch (e) { toast('导入失败：非法 JSON'); return; }
    if (!isObj(o)) { toast('导入失败：必须是 JSON 对象'); return; }
    var imp = isObj(o.cfg) ? o.cfg : o;
    var def = defaultsFn();
    var merged;
    if (TC.core && typeof TC.core.deepMerge === 'function') {
      try { merged = TC.core.deepMerge(def, imp); } catch (e) { merged = null; }
    }
    if (!isObj(merged)) {
      merged = Object.assign({}, def, imp);
      merged.icons = Object.assign({}, def.icons, isObj(imp.icons) ? imp.icons : {});
      merged.sounds = Object.assign({}, isObj(imp.sounds) ? imp.sounds : {});
      if (!Array.isArray(merged.roomColors)) merged.roomColors = def.roomColors;
    }
    work = normalizeWork(merged);
    commit();
    syncAll();
    toast('配置已导入');
  }

  /* ---------------- 图片 / 音频读取 ---------------- */

  function shrinkImage(file, maxSide, ok, fail) {
    var draw = function (src, w, h) {
      try {
        var k = Math.min(1, maxSide / Math.max(w || 1, h || 1));
        var cw = Math.max(1, Math.round((w || 1) * k));
        var ch = Math.max(1, Math.round((h || 1) * k));
        var cv = document.createElement('canvas');
        cv.width = cw;
        cv.height = ch;
        cv.getContext('2d').drawImage(src, 0, 0, cw, ch);
        var url = '';
        try { url = cv.toDataURL('image/webp', 0.85); } catch (e) { url = ''; }
        if (typeof url !== 'string' || url.indexOf('data:image/webp') !== 0) {
          try { url = cv.toDataURL('image/png'); } catch (e2) { if (fail) fail(); return; }
        }
        ok(url);
      } catch (e) { if (fail) fail(); }
    };
    var legacy = function () {
      var im = new Image();
      im.onload = function () { draw(im, im.naturalWidth || im.width, im.naturalHeight || im.height); };
      im.onerror = function () { if (fail) fail(); };
      try { im.src = URL.createObjectURL(file); } catch (e) { if (fail) fail(); }
    };
    if (typeof createImageBitmap === 'function') {
      createImageBitmap(file).then(function (b) { draw(b, b.width, b.height); }, legacy);
    } else legacy();
  }

  function onImgPicked() {
    var f = imgInput.files && imgInput.files[0];
    imgInput.value = '';
    if (!f || !imgTarget || !work) return;
    var key = imgTarget;
    imgTarget = null;
    var maxSide = (key === 'bg') ? 720 : 320;
    var pretty = { room: '房间块贴图', bg: '背景图', hook: '吊钩贴图' }[key] || key;
    shrinkImage(f, maxSide, function (url) {
      work.icons[key] = url;
      commit();
      syncSkins();
      toast(pretty + '已更新');
    }, function () { toast('图片读取失败'); });
  }

  function onSndPicked() {
    var f = sndInput.files && sndInput.files[0];
    sndInput.value = '';
    if (!f || !sndTarget || !work) return;
    var cue = sndTarget;
    sndTarget = null;
    if (f.size > 600 * 1024) { toast('音频太大（请 ≤ 600KB）'); return; }
    var rd = new FileReader();
    rd.onload = function () {
      var u = String(rd.result || '');
      if (u.indexOf('data:') !== 0) { toast('音频读取失败'); return; }
      work.sounds[cue] = u;
      commit();
      syncSounds();
      toast('「' + (CUE_NAME[cue] || cue) + '」已替换');
    };
    rd.onerror = function () { toast('音频读取失败'); };
    try { rd.readAsDataURL(f); } catch (e) { toast('音频读取失败'); }
  }

  function onDataPicked() {
    var f = dataInput.files && dataInput.files[0];
    dataInput.value = '';
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () { importDataText(String(rd.result || '')); };
    rd.onerror = function () { toast('读取文件失败'); };
    try { rd.readAsText(f); } catch (e) { toast('读取文件失败'); }
  }

  /* ---------------- 同步 ---------------- */

  function syncAll() {
    if (!work || !els) return;
    Object.keys(els.nums).forEach(function (k) {
      var n = els.nums[k];
      var raw = Number(work[k]);
      if (!isFinite(raw)) raw = n.def;
      raw = clamp(raw, n.min, n.max);
      var shown = raw * n.sc;
      n.rng.value = String(shown);
      n.val.textContent = n.fmt(shown);
      paintRng(n.rng);
    });
    Object.keys(els.togs).forEach(function (k) {
      paint(els.togs[k], !!work[k]);
    });
    rebuildColors();
    syncSkins();
    syncSounds();
  }

  /* ---------------- DOM 构建 ---------------- */

  function setTab(i) {
    curTab = clamp(i | 0, 0, 3);
    if (!els) return;
    els.tabs.forEach(function (t, j) { t.classList.toggle('tcxp-on', j === curTab); });
    els.pages.forEach(function (p, j) { p.classList.toggle('tcxp-on', j === curTab); });
    if (panel) panel.body.scrollTop = 0;
  }

  function onKey(e) {
    if (!e) return;
    var k = e.key || '';
    if (k === 'Escape' || e.keyCode === 27) {
      if (panel && panel.confirm.classList.contains('tcxp-show')) { hideConfirm(); return; }
      if (isOpen()) close();
    }
  }

  function build() {
    var old = document.getElementById('tcxp-root');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var oldCf = document.getElementById('tcxp-confirm');
    if (oldCf && oldCf.parentNode) oldCf.parentNode.removeChild(oldCf);
    if (!document.getElementById('tcxp-style')) {
      var st = document.createElement('style');
      st.id = 'tcxp-style';
      st.textContent = CSS_TEXT;
      document.head.appendChild(st);
    }
    els = { nums: {}, togs: {}, tabs: [], pages: [], skinImgs: {}, skinChips: {}, skinThumbs: {}, sndChips: {}, colorList: null, addBtn: null };

    /* 隐藏文件选择器 */
    imgInput = document.createElement('input');
    imgInput.type = 'file';
    imgInput.accept = 'image/*';
    imgInput.style.display = 'none';
    imgInput.addEventListener('change', onImgPicked);
    sndInput = document.createElement('input');
    sndInput.type = 'file';
    sndInput.accept = 'audio/*';
    sndInput.style.display = 'none';
    sndInput.addEventListener('change', onSndPicked);
    dataInput = document.createElement('input');
    dataInput.type = 'file';
    dataInput.accept = 'application/json,.json';
    dataInput.style.display = 'none';
    dataInput.addEventListener('change', onDataPicked);

    /* 抽屉 */
    var mask = el('div', 'tcxp-mask');
    mask.id = 'tcxp-root';
    var drawer = el('div', 'tcxp-drawer');
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-label', '盖楼设置');

    var head = el('div', 'tcxp-head');
    var tw = el('div', 'tcxp-titlewrap');
    tw.appendChild(el('div', 'tcxp-title', '盖楼设置'));
    tw.appendChild(el('div', 'tcxp-sub', '每一块都能调 · 改动即时生效'));
    var xb = el('button', 'tcxp-x', ico('close'));
    xb.type = 'button';
    xb.setAttribute('aria-label', '关闭');
    xb.addEventListener('click', close);
    head.appendChild(tw);
    head.appendChild(xb);
    drawer.appendChild(head);
    drawer.appendChild(el('div', 'tcxp-tape'));

    var body = el('div', 'tcxp-body');
    [buildSkinPage(), buildSoundPage(), buildPlayPage(), buildDataPage()].forEach(function (pg) {
      body.appendChild(pg);
      els.pages.push(pg);
    });
    drawer.appendChild(body);
    panel = { mask: mask, drawer: drawer, body: body, toast: null, confirm: null };

    /* 底部 tab 栏 */
    var tabs = el('div', 'tcxp-tabs');
    ['皮肤', '音效', '玩法', '数据'].forEach(function (t, i) {
      var b = el('button', 'tcxp-tab' + (i === curTab ? ' tcxp-on' : ''), txt(t));
      b.type = 'button';
      b.setAttribute('data-tab', String(i));
      b.addEventListener('click', function () { setTab(i); });
      tabs.appendChild(b);
      els.tabs.push(b);
    });
    drawer.appendChild(tabs);

    var toastEl = el('div', 'tcxp-toast');
    drawer.appendChild(toastEl);
    panel.toast = toastEl;

    drawer.appendChild(imgInput);
    drawer.appendChild(sndInput);
    drawer.appendChild(dataInput);

    mask.appendChild(drawer);
    mask.addEventListener('click', function (e) { if (e.target === mask) close(); });
    document.body.appendChild(mask);

    /* 确认层 */
    var confirm = buildConfirm();
    document.body.appendChild(confirm);
    panel.confirm = confirm;
    document.addEventListener('keydown', onKey);
    setTab(curTab);
  }

  function buildConfirm() {
    var cf = el('div', 'tcxp-confirm');
    cf.id = 'tcxp-confirm';
    var box = el('div', 'tcxp-cbox');
    cfTitle = el('div', 'tcxp-cftitle', '');
    cfText = el('p', 'tcxp-cftext', '');
    var btns = el('div', 'tcxp-cbtns');
    var bn = el('button', 'tcxp-btn', '<span>取消</span>');
    bn.type = 'button';
    bn.addEventListener('click', hideConfirm);
    cfOk = el('button', 'tcxp-btn tcxp-pri', '<span>确定</span>');
    cfOk.type = 'button';
    cfOk.addEventListener('click', function () {
      var fn = confirmFn;
      hideConfirm();
      if (fn) { try { fn(); } catch (e) { /* ignore */ } }
    });
    btns.appendChild(bn);
    btns.appendChild(cfOk);
    box.appendChild(cfTitle);
    box.appendChild(cfText);
    box.appendChild(btns);
    cf.appendChild(box);
    cf.addEventListener('click', function (e) { if (e.target === cf) hideConfirm(); });
    return cf;
  }

  /* ---------------- 内联样式（tcxp- 前缀 · 奶油白卡通工地风） ---------------- */

  var CSS_TEXT = [
    '.tcxp-mask{position:fixed;top:0;left:0;right:0;bottom:0;z-index:9000;background:rgba(28,42,66,.55);',
    'display:flex;align-items:flex-end;justify-content:center;opacity:0;pointer-events:none;transition:opacity .18s linear;}',
    '.tcxp-mask.tcxp-show{opacity:1;pointer-events:auto;}',
    '.tcxp-drawer{position:relative;width:100%;max-width:560px;max-height:78vh;display:flex;flex-direction:column;',
    'background:#fdf6e8;border-radius:20px 20px 0 0;color:#453a26;text-align:left;',
    'transform:translateY(36px);transition:transform .2s ease-out;-webkit-tap-highlight-color:transparent;',
    'font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",Arial,sans-serif;}',
    '.tcxp-mask.tcxp-show .tcxp-drawer{transform:translateY(0);}',
    '.tcxp-head{display:flex;align-items:center;gap:10px;padding:14px 14px 10px 20px;flex:0 0 auto;}',
    '.tcxp-titlewrap{flex:1 1 auto;min-width:0;}',
    '.tcxp-title{font-size:18px;font-weight:800;letter-spacing:1px;color:#453a26;}',
    '.tcxp-sub{margin-top:2px;font-size:11px;font-weight:600;color:#a4906a;}',
    '.tcxp-x{flex:0 0 auto;width:44px;height:44px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;',
    'padding:0;background:#fff;border:2px solid rgba(69,58,38,.28);border-radius:13px;color:#453a26;cursor:pointer;}',
    '.tcxp-x:active{border-color:#453a26;}',
    '.tcxp-tape{flex:0 0 auto;height:7px;margin:0 20px;border-radius:4px;',
    'background:repeating-linear-gradient(45deg,#ffc93c 0 10px,#453a26 10px 20px);}',
    '.tcxp-body{flex:1 1 auto;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;',
    'padding:0 20px 10px;box-sizing:border-box;}',
    '.tcxp-page{display:none;padding-bottom:14px;}',
    '.tcxp-page.tcxp-on{display:block;}',
    '.tcxp-tabs{flex:0 0 auto;display:flex;gap:6px;padding:8px 12px;',
    'padding-bottom:calc(8px + env(safe-area-inset-bottom));background:#f4e9d4;border-top:1.5px solid rgba(69,58,38,.15);',
    'border-radius:0 0 20px 20px;}',
    '.tcxp-tab{flex:1 1 0;min-height:48px;box-sizing:border-box;padding:0;background:transparent;border:none;border-radius:13px;',
    'color:#a4906a;font-size:14px;font-weight:700;font-family:inherit;cursor:pointer;}',
    '.tcxp-tab.tcxp-on{background:#ffc93c;color:#453a26;font-weight:800;box-shadow:0 2.5px 0 #453a26;}',
    '.tcxp-sec{display:flex;align-items:center;gap:8px;margin:18px 0 2px;font-size:12px;font-weight:800;letter-spacing:2px;color:#a4906a;}',
    '.tcxp-page .tcxp-sec:first-child{margin-top:14px;}',
    '.tcxp-sec::before{content:"";flex:0 0 auto;width:9px;height:9px;background:#ffc93c;border:2px solid #453a26;border-radius:3px;}',
    '.tcxp-hint{margin:10px 0 2px;font-size:12px;line-height:1.7;color:#a4906a;}',
    '.tcxp-cdesc{margin:6px 0 2px;font-size:12px;line-height:1.6;color:#a4906a;}',
    '.tcxp-row{min-height:56px;display:flex;align-items:center;justify-content:space-between;gap:12px;',
    'padding:8px 0;border-bottom:1px solid rgba(69,58,38,.13);}',
    '.tcxp-lab{font-size:14px;font-weight:700;color:#453a26;}',
    '.tcxp-labwrap{display:flex;flex-direction:column;gap:3px;min-width:0;}',
    '.tcxp-labsub{font-size:11px;font-weight:500;color:#a4906a;}',
    '.tcxp-trow{cursor:pointer;}',
    '.tcxp-srow{padding:9px 0 11px;border-bottom:1px solid rgba(69,58,38,.13);}',
    '.tcxp-sline{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:2px;}',
    '.tcxp-val{font-size:14px;font-weight:800;color:#453a26;font-variant-numeric:tabular-nums;}',
    '.tcxp-rng{-webkit-appearance:none;appearance:none;display:block;width:100%;height:10px;margin:8px 0 2px;box-sizing:border-box;',
    'background:#eadfc6;border:1.5px solid rgba(69,58,38,.2);border-radius:6px;outline:none;cursor:pointer;}',
    '.tcxp-rng::-webkit-slider-thumb{-webkit-appearance:none;width:26px;height:26px;border-radius:50%;',
    'background:#ffc93c;border:2.5px solid #453a26;box-shadow:0 2px 0 rgba(69,58,38,.4);cursor:pointer;margin-top:-1px;}',
    '.tcxp-rng::-moz-range-thumb{width:22px;height:22px;border-radius:50%;background:#ffc93c;border:2.5px solid #453a26;cursor:pointer;}',
    '.tcxp-rng::-moz-range-track{height:10px;border-radius:6px;background:transparent;}',
    '.tcxp-sw{position:relative;flex:0 0 auto;width:56px;height:32px;box-sizing:border-box;padding:0;background:#e6d9bd;',
    'border:2px solid rgba(69,58,38,.35);border-radius:16px;cursor:pointer;transition:background .15s linear,border-color .15s linear;}',
    '.tcxp-sw i{position:absolute;top:2px;left:2px;width:24px;height:24px;border-radius:50%;background:#fff;',
    'border:2px solid rgba(69,58,38,.4);box-sizing:border-box;transition:left .15s linear;}',
    '.tcxp-sw.tcxp-on{background:#ffc93c;border-color:#453a26;}',
    '.tcxp-sw.tcxp-on i{left:26px;}',
    '.tcxp-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;box-sizing:border-box;min-height:44px;padding:0 15px;',
    'background:#fff;border:2px solid #453a26;border-radius:13px;color:#453a26;font-size:14px;font-weight:700;font-family:inherit;',
    'cursor:pointer;white-space:nowrap;}',
    '.tcxp-btn:active{transform:translateY(2px);}',
    '.tcxp-btn.tcxp-pri{background:#ffc93c;box-shadow:0 3px 0 #453a26;}',
    '.tcxp-btn.tcxp-pri:active{box-shadow:0 1px 0 #453a26;}',
    '.tcxp-btn.tcxp-dgr{border-color:#d64545;color:#d64545;}',
    '.tcxp-btn.tcxp-dgrfill{background:#e4574a;border-color:#453a26;color:#fff;box-shadow:0 3px 0 #453a26;}',
    '.tcxp-btn[disabled]{opacity:.4;pointer-events:none;}',
    '.tcxp-btn.tcxp-xs{flex:1 1 0;min-height:44px;padding:0 6px;font-size:13px;}',
    '.tcxp-btn.tcxp-actbtn{flex:0 0 auto;}',
    '.tcxp-flex1{flex:1 1 0;}',
    '.tcxp-ic{width:16px;height:16px;display:block;flex:0 0 auto;}',
    /* 房间块配色 */
    '.tcxp-crow{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px dashed rgba(69,58,38,.2);}',
    '.tcxp-cidx{flex:1 1 auto;min-width:44px;font-size:13px;font-weight:800;color:#453a26;}',
    '.tcxp-ccell{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:4px;font-size:10px;font-weight:700;color:#a4906a;cursor:pointer;}',
    '.tcxp-col{width:48px;height:48px;box-sizing:border-box;padding:3px;background:#fff;cursor:pointer;',
    'border:2px solid rgba(69,58,38,.3);border-radius:12px;}',
    '.tcxp-col::-webkit-color-swatch-wrapper{padding:0;}',
    '.tcxp-col::-webkit-color-swatch{border:none;border-radius:7px;}',
    '.tcxp-delc{flex:0 0 auto;width:44px;height:44px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;',
    'padding:0;background:#fff;border:2px solid rgba(69,58,38,.25);border-radius:12px;color:#a4906a;cursor:pointer;}',
    '.tcxp-delc[disabled]{opacity:.35;pointer-events:none;}',
    '.tcxp-cops{display:flex;gap:10px;padding:14px 0 4px;}',
    /* 图片替换 */
    '.tcxp-skin{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid rgba(69,58,38,.13);}',
    '.tcxp-thumb{flex:0 0 auto;width:72px;height:72px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;',
    'background:#eaf6fd;border:2px dashed rgba(69,58,38,.35);border-radius:14px;overflow:hidden;}',
    '.tcxp-thumb.tcxp-custom{border-style:solid;border-color:#453a26;background:#fff;}',
    '.tcxp-thumb img{max-width:64px;max-height:64px;width:auto;height:auto;display:block;}',
    '.tcxp-skininfo{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:3px;align-items:flex-start;}',
    '.tcxp-skinsub{font-size:11px;color:#a4906a;}',
    '.tcxp-chip{display:inline-block;font-size:11px;font-weight:800;padding:2px 9px;border-radius:999px;',
    'background:#efe2c9;color:#a4906a;}',
    '.tcxp-chip.tcxp-on{background:#ffc93c;color:#453a26;}',
    '.tcxp-skinact{flex:0 0 auto;display:flex;flex-direction:column;gap:8px;}',
    '.tcxp-skinact .tcxp-btn{min-width:96px;}',
    /* 音效 cue */
    '.tcxp-cue{padding:10px 0 12px;border-bottom:1px solid rgba(69,58,38,.13);}',
    '.tcxp-cuel1{display:flex;align-items:center;justify-content:space-between;gap:10px;}',
    '.tcxp-cuename{display:flex;align-items:baseline;gap:8px;min-width:0;}',
    '.tcxp-cuecode{font-size:11px;color:#a4906a;font-family:Menlo,Consolas,monospace;}',
    '.tcxp-cuel2{display:flex;gap:8px;margin-top:9px;}',
    /* toast / confirm */
    '.tcxp-toast{position:absolute;top:70px;left:50%;transform:translateX(-50%);max-width:86%;box-sizing:border-box;',
    'padding:9px 16px;background:#453a26;border-radius:999px;color:#fff8ea;font-size:13px;font-weight:700;',
    'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0;transition:opacity .15s linear;pointer-events:none;z-index:30;}',
    '.tcxp-toast.tcxp-show{opacity:1;}',
    '.tcxp-confirm{position:fixed;top:0;left:0;right:0;bottom:0;z-index:9500;background:rgba(28,42,66,.55);',
    'display:none;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;',
    'font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",Arial,sans-serif;}',
    '.tcxp-confirm.tcxp-show{display:flex;}',
    '.tcxp-cbox{width:340px;max-width:100%;box-sizing:border-box;background:#fdf6e8;border:2.5px solid #453a26;border-radius:18px;',
    'padding:20px 18px 18px;color:#453a26;text-align:left;box-shadow:0 6px 0 rgba(69,58,38,.4);}',
    '.tcxp-cftitle{font-size:16px;font-weight:800;}',
    '.tcxp-cftext{margin:10px 0 16px;font-size:13px;line-height:1.7;color:#8a7a5c;}',
    '.tcxp-cbtns{display:flex;gap:10px;}',
    '.tcxp-cbtns .tcxp-btn{flex:1 1 0;}',
    /* 桌面：居中弹窗 */
    '@media (min-width:620px){',
    '.tcxp-mask{align-items:center;padding:24px;box-sizing:border-box;}',
    '.tcxp-drawer{width:480px;max-width:100%;border-radius:20px;border:2.5px solid #453a26;box-shadow:0 8px 0 rgba(69,58,38,.4);}',
    '.tcxp-tabs{border-radius:0 0 17px 17px;}',
    '}'
  ].join('\n');

  /* ---------------- 导出 API（接口锁死） ---------------- */

  TC.CFGP = {
    open: open,
    close: close,
    toggle: toggle,
    isOpen: isOpen,
    onChange: onChange,
  };

  /* node 自测入口（浏览器下忽略） */
  if (typeof module !== 'undefined' && module.exports) { module.exports = TC.CFGP; }
})();
