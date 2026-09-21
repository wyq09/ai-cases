/* ============================================================
 * gravity-pinball · GP.CFGP 设置面板（手机优先 · 底部抽屉）
 * ------------------------------------------------------------------------
 * 数据流红线：
 *   - 面板永不直接读写 localStorage（唯一例外：「清空游戏进度」按契约
 *     removeItem 进度档 gp_state_v1 —— 进度存档不属于 CFG 面板数据流）。
 *   - open() 时 work = 深拷贝(GP.CFG.all())；控件改 work 后立即
 *     GP.CFG.apply(clone(work))（apply 内部落盘 + 广播完整快照，
 *     主游戏 GP.GAME 已订阅自动生效）；close() 直接丢弃 work。
 *   - 导入 JSON 非法时 toast 报错且绝不 apply / 不落盘。
 *
 * mods 摆渡（本文件私有约定，读侧 cfg.mods.*）：
 *   core.js 的 CFG_DEF 没有 mods 顶层键，GP.CFG.apply 的 mergeInto(root)
 *   会丢弃未知根键。因此面板把新增字段统一放 work.mods = {...}（UI 真相），
 *   commit 时镜像进 work.sounds.__mods —— sounds 是 CFG_DEF 已知嵌套对象，
 *   其内部未知键可穿越 mergeInto 且随 gp_cfg_v1 落盘；广播时再把 __mods
 *   提升回快照 .mods。本模块按加载顺序先于 game.js 执行，抢占 onChange
 *   首位，故提升先于主游戏回调。导入/导出经 cfg.sounds 完整往返。
 *   已知 mods 字段：showFps(bool)。今后新增非 schema 字段一律进 mods。
 *
 * 兜底：GP.ART / GP.AUDIO 缺失不抛错；无 document（node）下 open/close/
 *   toggle 全部 NOOP。视觉：深色暖调扁平风（#2b2622 / #35302a / 强调
 *   #f2586a），无渐变、无玻璃拟态、无大圆角卡片堆叠。
 * ============================================================ */
(function () {
  'use strict';

  var GP = (typeof window !== 'undefined')
    ? (window.GP = window.GP || {})
    : ((typeof global !== 'undefined') ? (global.GP = global.GP || {}) : {});
  var HAS_DOC = typeof document !== 'undefined';

  /* ---------------- 小工具 ---------------- */

  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function clone(o) { try { return JSON.parse(JSON.stringify(o)); } catch (e) { return null; } }

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
  function isDataURI(u) { return typeof u === 'string' && u.indexOf('data:image') === 0; }

  /* GP.ART 守卫：按钮小图标 + 皮肤默认图 */
  function icon(name) {
    var u = artIcon(name);
    return u ? '<img class="gpcp-ic" alt="" src="' + u + '">' : '';
  }
  function artIcon(name) {
    try {
      var u = (GP.ART && typeof GP.ART.icon === 'function') ? GP.ART.icon(name) : null;
      if (isDataURI(u)) return u;
    } catch (e) { /* ART 缺失不致命 */ }
    return '';
  }
  var PLACEHOLDER = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
    '<rect x="8" y="8" width="48" height="48" rx="9" fill="none" stroke="#4a423a" stroke-width="2" stroke-dasharray="5 4"/>' +
    '<circle cx="32" cy="32" r="7" fill="#4a423a"/></svg>');

  /* GP.AUDIO 守卫：音量 / 静音改动即时试听一次 */
  function sfxPreview() {
    try {
      if (work && work.muted) return;
      var A = GP.AUDIO;
      if (A && typeof A.play === 'function') A.play('hit');
    } catch (e) { /* 音频缺失静默 */ }
  }

  /* ---------------- mods 摆渡 ---------------- */

  /* 广播快照 / 内存 cfg：把 sounds.__mods 提升为 .mods（就地） */
  function liftMods(o) {
    if (isObj(o) && !isObj(o.mods) && isObj(o.sounds) && isObj(o.sounds.__mods)) {
      o.mods = clone(o.sounds.__mods);
    }
    return o;
  }
  /* 提交快照：把 mods 镜像进嵌套载体（空对象也写入，保证可清空） */
  function sealMods(snap) {
    if (!isObj(snap) || !isObj(snap.mods)) return snap;
    if (!isObj(snap.sounds)) snap.sounds = {};
    snap.sounds.__mods = clone(snap.mods);
    return snap;
  }
  /* 装载期执行：本模块先于 game.js 加载 ——
   * 1) 把已落盘的 __mods 提升进当前内存 cfg，游戏启动读 CFG.all() 即见 mods；
   * 2) 抢先注册 onChange，广播快照先提升 mods 再交给主游戏回调。 */
  (function initModsBridge() {
    try {
      if (GP.CFG && typeof GP.CFG.all === 'function') liftMods(GP.CFG.all());
    } catch (e) { /* ignore */ }
    try {
      if (GP.CFG && typeof GP.CFG.onChange === 'function') {
        GP.CFG.onChange(function (snap) { liftMods(snap); });
      }
    } catch (e) { /* ignore */ }
  })();

  /* ---------------- CFG 存取（全部经 GP.CFG，不碰 localStorage） -------- */

  function cfgAll() {
    try {
      if (GP.CFG && typeof GP.CFG.all === 'function') return GP.CFG.all() || {};
    } catch (e) { /* ignore */ }
    return {};
  }
  function normalizeWork(w) {
    if (!isObj(w)) w = {};
    if (!isObj(w.mods)) w.mods = {};
    if (!isObj(w.icons)) w.icons = { bomb: '', hourglass: '' };
    return w;
  }
  /* 面板编辑唯一出口：work → apply(clone)（落盘 + 广播） */
  function commit() {
    if (!work) return;
    var C = GP.CFG;
    if (!C || typeof C.apply !== 'function') return;
    var snap = sealMods(clone(work));
    if (!snap) return;
    try { C.apply(snap); } catch (e) { /* 存储层异常不打断面板 */ }
  }

  /* mods 路径读写：'muted' 直达根键，'mods.showFps' 走嵌套包 */
  function getVal(path) {
    if (!work) return false;
    if (path.indexOf('mods.') === 0) {
      return !!(isObj(work.mods) && work.mods[path.slice(5)]);
    }
    return !!work[path];
  }
  function setVal(path, v) {
    if (!work) return;
    if (path.indexOf('mods.') === 0) {
      if (!isObj(work.mods)) work.mods = {};
      work.mods[path.slice(5)] = v;
    } else {
      work[path] = v;
    }
  }

  /* ---------------- 面板状态 ---------------- */

  var panel = null, work = null, els = null;
  var imgInput = null, dataInput = null, imgTarget = null;
  var toastTimer = 0, confirmFn = null;
  var cfTitle = null, cfText = null, cfOk = null;

  function open() {
    if (!HAS_DOC) return; /* node / 极端环境：NOOP 不抛错 */
    if (!document.body) { setTimeout(open, 30); return; }
    if (!panel) build();
    work = normalizeWork(liftMods(clone(cfgAll())));
    syncAll();
    hideConfirm();
    panel.mask.classList.add('gpcp-show');
  }
  function close() {
    if (!panel) return;
    panel.mask.classList.remove('gpcp-show');
    hideConfirm();
    work = null; /* 丢弃工作副本 */
  }
  function toggle() { if (isOpen()) close(); else open(); }
  function isOpen() { return !!(panel && panel.mask.classList.contains('gpcp-show')); }

  function toast(msg) {
    if (!panel) return;
    panel.toast.textContent = msg;
    panel.toast.classList.add('gpcp-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      if (panel) panel.toast.classList.remove('gpcp-show');
    }, 1800);
  }

  /* ---------------- 确认层（z-index 9100） ---------------- */

  function askConfirm(title, text, okLabel, fn, danger) {
    if (!panel) return;
    if (cfTitle) cfTitle.textContent = title;
    if (cfText) cfText.textContent = text;
    if (cfOk) {
      cfOk.textContent = okLabel;
      cfOk.classList.toggle('gpcp-fill', !!danger);
    }
    confirmFn = fn;
    panel.confirm.classList.add('gpcp-show');
  }
  function hideConfirm() {
    confirmFn = null;
    if (panel) panel.confirm.classList.remove('gpcp-show');
  }
  function doRestoreDefaults() {
    var C = GP.CFG;
    if (C && typeof C.apply === 'function') {
      try { C.apply({}); } catch (e) { toast('恢复默认失败'); return; }
    }
    work = normalizeWork(liftMods(clone(cfgAll())));
    syncAll();
    toast('已恢复默认配置');
  }
  function doClearProgress() {
    /* 唯一允许直接碰 localStorage 的地方：清进度档并重启 */
    try {
      var k = (GP.SAVE && GP.SAVE.KEY) || 'gp_state_v1';
      localStorage.removeItem(k);
    } catch (e) { /* ignore */ }
    location.reload();
  }

  /* ---------------- 控件行 ---------------- */

  function sec(t) { return el('div', 'gpcp-sec', txt(t)); }
  function hint(t) { return el('div', 'gpcp-hint', txt(t)); }

  /* 滑杆行：标签 + 数值一行，滑杆整行在下（手机好拖） */
  function rowNum(label, key, min, max, step, def, dec, suffix, scale) {
    scale = scale || 1;
    var r = el('div', 'gpcp-srow');
    var line = el('div', 'gpcp-sline');
    line.innerHTML = '<span class="gpcp-lab">' + txt(label) + '</span>';
    var val = el('span', 'gpcp-val', '');
    line.appendChild(val);
    var rng = document.createElement('input');
    rng.type = 'range';
    rng.className = 'gpcp-rng';
    rng.min = String(min);
    rng.max = String(max);
    rng.step = String(step);
    var fmt = function (v) { return Number(v).toFixed(dec) + (suffix || ''); };
    rng.addEventListener('input', function () {
      if (!work) return;
      var v = parseFloat(rng.value);
      if (isNaN(v)) return;
      work[key] = v / scale;
      val.textContent = fmt(v);
      commit();
    });
    rng.addEventListener('change', function () {
      if (key === 'sfxVolume') sfxPreview();
    });
    r.appendChild(line);
    r.appendChild(rng);
    if (els) els.nums[key] = { rng: rng, val: val, fmt: fmt, scale: scale, min: min, max: max, def: def };
    return r;
  }

  /* 开关行：简洁 slide toggle（纯 CSS） */
  function rowToggle(label, path, after) {
    var r = el('div', 'gpcp-row');
    r.innerHTML = '<span class="gpcp-lab">' + txt(label) + '</span>';
    var b = el('button', 'gpcp-sw', '<i></i>');
    b.type = 'button';
    b.setAttribute('role', 'switch');
    b.setAttribute('aria-checked', 'false');
    b.addEventListener('click', function () {
      if (!work) return;
      var v = !getVal(path);
      setVal(path, v);
      paint(b, v);
      commit();
      if (after) after(v);
    });
    r.appendChild(b);
    if (els) els.togs[path] = b;
    return r;
  }
  function paint(b, v) {
    b.classList.toggle('gpcp-on', !!v);
    b.setAttribute('aria-checked', v ? 'true' : 'false');
  }

  /* 动作行：标签 + 说明在左，按钮在右 */
  function actRow(label, sub, btnText, iconName, fn, danger) {
    var r = el('div', 'gpcp-row');
    var lw = el('div', 'gpcp-labwrap');
    lw.innerHTML = '<span class="gpcp-lab">' + txt(label) + '</span>' +
      (sub ? '<span class="gpcp-labsub">' + txt(sub) + '</span>' : '');
    var b = el('button', 'gpcp-btn gpcp-sm' + (danger ? ' gpcp-dgr' : ''),
      icon(iconName) + '<span>' + txt(btnText) + '</span>');
    b.type = 'button';
    b.addEventListener('click', fn);
    r.appendChild(lw);
    r.appendChild(b);
    return r;
  }

  /* ---------------- 页 1 · 玩法 ---------------- */

  function buildPlayPage() {
    var p = el('div', 'gpcp-page');
    p.appendChild(sec('物理与节奏'));
    p.appendChild(rowNum('重力', 'gravity', 600, 2400, 50, 1500, 0, ''));
    p.appendChild(rowNum('掉球间隔', 'dropInterval', 300, 900, 10, 550, 0, 'ms'));
    p.appendChild(rowNum('bumper 弹性', 'restBumper', 0.7, 1, 0.01, 0.88, 2, ''));
    p.appendChild(sec('声音'));
    p.appendChild(rowNum('音效音量', 'sfxVolume', 0, 1, 0.05, 0.8, 0, '%', 100));
    p.appendChild(rowToggle('静音', 'muted', function (on) { if (!on) sfxPreview(); }));
    p.appendChild(sec('其他'));
    p.appendChild(rowToggle('自动收球', 'autoCollect'));
    p.appendChild(rowToggle('显示 FPS', 'mods.showFps'));
    p.appendChild(hint('所有改动即时生效并自动保存。'));
    return p;
  }

  /* ---------------- 页 2 · 皮肤 ---------------- */

  function buildSkinPage() {
    var p = el('div', 'gpcp-page');
    p.appendChild(sec('道具图标'));
    p.appendChild(skinRow('bomb', '炸弹'));
    p.appendChild(skinRow('hourglass', '沙漏'));
    p.appendChild(hint('上传图片等比压缩至 256px 长边（优先 WebP，失败落 PNG）后本地保存；「默认」恢复内置图标。'));
    return p;
  }
  function skinRow(key, name) {
    var row = el('div', 'gpcp-skin');
    var th = el('div', 'gpcp-thumb');
    var img = document.createElement('img');
    img.alt = name + '图标预览';
    th.appendChild(img);
    var info = el('div', 'gpcp-skininfo');
    info.innerHTML = '<div class="gpcp-skinname">' + txt(name) + '</div>';
    var st = el('div', 'gpcp-skinstate', '默认图标');
    info.appendChild(st);
    var act = el('div', 'gpcp-skinact');
    var bU = el('button', 'gpcp-btn gpcp-sm', icon('upload') + '<span>上传</span>');
    bU.type = 'button';
    bU.addEventListener('click', function () {
      if (!imgInput) return;
      imgTarget = key;
      imgInput.click();
    });
    var bR = el('button', 'gpcp-btn gpcp-sm', icon('reset') + '<span>默认</span>');
    bR.type = 'button';
    bR.addEventListener('click', function () {
      if (!work) return;
      if (!isObj(work.icons)) work.icons = {};
      work.icons[key] = '';
      commit();
      syncSkins();
      toast(name + '图标已恢复默认');
    });
    act.appendChild(bU);
    act.appendChild(bR);
    row.appendChild(th);
    row.appendChild(info);
    row.appendChild(act);
    if (els) { els.skinImgs[key] = img; els.skinStates[key] = st; }
    return row;
  }
  function syncSkins() {
    if (!els) return;
    ['bomb', 'hourglass'].forEach(function (k) {
      var custom = !!(work && isObj(work.icons) && work.icons[k]);
      var im = els.skinImgs[k];
      if (im) im.src = (custom ? work.icons[k] : '') || artIcon(k) || PLACEHOLDER;
      if (els.skinStates[k]) {
        els.skinStates[k].textContent = custom ? '已自定义' : '默认图标';
        els.skinStates[k].classList.toggle('gpcp-on', custom);
      }
    });
  }

  /* ---------------- 图片压缩上传（256px 长边，webp 失败落 png） -------- */

  function shrinkImage(file, ok, fail) {
    var draw = function (src, w, h) {
      try {
        var k = Math.min(1, 256 / Math.max(w || 1, h || 1));
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
    if (!f || !imgTarget) return;
    var key = imgTarget;
    imgTarget = null;
    if (!work) work = normalizeWork(liftMods(clone(cfgAll())));
    shrinkImage(f, function (url) {
      if (!isObj(work.icons)) work.icons = {};
      work.icons[key] = url;
      commit();
      syncSkins();
      toast((key === 'bomb' ? '炸弹' : '沙漏') + '图标已更新');
    }, function () { toast('图片读取失败'); });
  }

  /* ---------------- 页 3 · 数据 ---------------- */

  function buildDataPage() {
    var p = el('div', 'gpcp-page');
    p.appendChild(sec('配置'));
    p.appendChild(actRow('导出配置', '下载 .json 文件，含当前全部设置', '导出', 'download', exportData));
    p.appendChild(actRow('导入配置', '选择此前导出的 .json 文件', '导入', 'upload', function () {
      if (dataInput) dataInput.click();
    }));
    p.appendChild(sec('危险操作'));
    p.appendChild(actRow('恢复默认配置', '全部选项回到默认值（含自定义图标）', '恢复', 'reset', function () {
      askConfirm('恢复默认配置', '全部滑杆、开关与自定义图标将回到默认值。', '恢复默认', doRestoreDefaults);
    }));
    p.appendChild(actRow('清空游戏进度', '删除关卡 / 分数 / 道具纪录并重新开始', '清空', 'reset', function () {
      askConfirm('清空游戏进度', '将删除全部进度（关卡、分数、球数、道具与最佳纪录），操作不可恢复。', '确认清空', doClearProgress, true);
    }, true));
    p.appendChild(hint('游戏进度独立于配置保存，导出文件仅包含设置。'));
    return p;
  }

  function exportData() {
    try {
      var C = GP.CFG;
      var cfgObj = (C && typeof C.exportJSON === 'function')
        ? JSON.parse(C.exportJSON())
        : (clone(cfgAll()) || {});
      var payload = { app: 'gravity-pinball', ver: 1, time: Date.now(), cfg: cfgObj };
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      var href = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = href;
      a.download = 'gp-cfg-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { try { URL.revokeObjectURL(href); } catch (e) { /* ignore */ } }, 3000);
      toast('配置已导出');
    } catch (e) { toast('导出失败'); }
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
  function importDataText(text) {
    var o = null;
    try { o = JSON.parse(text); } catch (e) { toast('导入失败：非法 JSON'); return; }
    if (!isObj(o)) { toast('导入失败：配置必须为 JSON 对象'); return; }
    var cfgObj = isObj(o.cfg) ? o.cfg : o;
    var C = GP.CFG;
    var applied = false;
    try {
      if (C && typeof C.importJSON === 'function') { C.importJSON(JSON.stringify(cfgObj)); applied = true; }
      else if (C && typeof C.apply === 'function') { C.apply(cfgObj); applied = true; }
    } catch (e) { applied = false; }
    if (!applied) { toast('导入失败：非法 JSON'); return; }
    work = normalizeWork(liftMods(clone(cfgAll())));
    /* 外来文件若带根级 mods（被 mergeInto 丢弃），这里捞回并摆渡落盘 */
    if (isObj(cfgObj.mods)) {
      work.mods = clone(cfgObj.mods);
      commit();
    }
    syncAll();
    toast('配置已导入');
  }

  /* ---------------- 同步 ---------------- */

  function syncAll() {
    if (!work || !els) return;
    Object.keys(els.nums).forEach(function (k) {
      var n = els.nums[k];
      var raw = Number(work[k]);
      if (!isFinite(raw)) raw = n.def;
      if (raw < n.min) raw = n.min;
      if (raw > n.max) raw = n.max;
      var shown = raw * n.scale;
      n.rng.value = String(shown);
      n.val.textContent = n.fmt(shown);
    });
    Object.keys(els.togs).forEach(function (path) {
      paint(els.togs[path], getVal(path));
    });
    syncSkins();
  }

  /* ---------------- DOM 构建 ---------------- */

  function onKey(e) {
    if (!e) return;
    var k = e.key || '';
    if (k === 'Escape' || e.keyCode === 27) {
      if (panel && panel.confirm.classList.contains('gpcp-show')) { hideConfirm(); return; }
      if (isOpen()) close();
    }
  }
  function showTab(i) {
    if (!els) return;
    els.tabs.forEach(function (t, j) { t.classList.toggle('gpcp-on', j === i); });
    els.pages.forEach(function (p, j) { p.classList.toggle('gpcp-on', j === i); });
  }

  function build() {
    var old = document.getElementById('gpcp-root');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var oldCf = document.getElementById('gpcp-confirm');
    if (oldCf && oldCf.parentNode) oldCf.parentNode.removeChild(oldCf);
    if (!document.getElementById('gpcp-style')) {
      var st = document.createElement('style');
      st.id = 'gpcp-style';
      st.textContent = CSS_TEXT;
      document.head.appendChild(st);
    }
    els = { nums: {}, togs: {}, skinImgs: {}, skinStates: {}, tabs: [], pages: [] };

    /* 隐藏文件选择器 */
    imgInput = document.createElement('input');
    imgInput.type = 'file';
    imgInput.accept = 'image/*';
    imgInput.style.display = 'none';
    imgInput.addEventListener('change', onImgPicked);
    dataInput = document.createElement('input');
    dataInput.type = 'file';
    dataInput.accept = 'application/json,.json';
    dataInput.style.display = 'none';
    dataInput.addEventListener('change', onDataPicked);

    /* 抽屉 */
    var mask = el('div', 'gpcp-mask');
    mask.id = 'gpcp-root';
    var drawer = el('div', 'gpcp-drawer');
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-label', '设置');

    var head = el('div', 'gpcp-head');
    var tw = el('div', 'gpcp-titlewrap');
    tw.appendChild(el('div', 'gpcp-title', '设置'));
    tw.appendChild(el('div', 'gpcp-sub', 'GRAVITY PINBALL'));
    var xb = el('button', 'gpcp-x', icon('close') || '&times;');
    xb.type = 'button';
    xb.setAttribute('aria-label', '关闭');
    xb.addEventListener('click', close);
    head.appendChild(tw);
    head.appendChild(xb);
    drawer.appendChild(head);

    var tabBox = el('div', 'gpcp-tabs');
    ['玩法', '皮肤', '数据'].forEach(function (t, i) {
      var b = el('button', 'gpcp-tab' + (i === 0 ? ' gpcp-on' : ''), txt(t));
      b.type = 'button';
      b.setAttribute('data-tab', String(i));
      b.addEventListener('click', function () { showTab(i); });
      tabBox.appendChild(b);
      els.tabs.push(b);
    });
    drawer.appendChild(tabBox);

    var body = el('div', 'gpcp-body');
    [buildPlayPage(), buildSkinPage(), buildDataPage()].forEach(function (pg, i) {
      if (i === 0) pg.classList.add('gpcp-on');
      body.appendChild(pg);
      els.pages.push(pg);
    });
    drawer.appendChild(body);
    drawer.appendChild(imgInput);
    drawer.appendChild(dataInput);
    var toastEl = el('div', 'gpcp-toast');
    drawer.appendChild(toastEl);

    mask.appendChild(drawer);
    mask.addEventListener('click', function (e) { if (e.target === mask) close(); });
    document.body.appendChild(mask);

    /* 确认层 */
    var confirm = buildConfirm();
    document.body.appendChild(confirm);
    document.addEventListener('keydown', onKey);

    panel = { mask: mask, drawer: drawer, toast: toastEl, confirm: confirm };
  }

  function buildConfirm() {
    var cf = el('div', 'gpcp-confirm');
    cf.id = 'gpcp-confirm';
    var box = el('div', 'gpcp-cbox');
    cfTitle = el('div', 'gpcp-cftitle', '');
    cfText = el('p', 'gpcp-cftext', '');
    var btns = el('div', 'gpcp-cbtns');
    var bn = el('button', 'gpcp-btn', '<span>取消</span>');
    bn.type = 'button';
    bn.addEventListener('click', hideConfirm);
    cfOk = el('button', 'gpcp-btn gpcp-acc', '<span>确定</span>');
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

  /* ---------------- 内联样式（gpcp- 前缀，深色暖调扁平） ---------------- */

  var CSS_TEXT = [
    '.gpcp-mask{position:fixed;top:0;left:0;right:0;bottom:0;z-index:9000;background:rgba(17,13,10,.62);',
    'display:flex;align-items:flex-end;justify-content:center;opacity:0;pointer-events:none;transition:opacity .18s linear;}',
    '.gpcp-mask.gpcp-show{opacity:1;pointer-events:auto;}',
    '.gpcp-drawer{position:relative;width:100%;max-width:520px;max-height:82vh;display:flex;flex-direction:column;',
    'background:#2b2622;border:1px solid rgba(255,255,255,.12);border-bottom:none;border-radius:14px 14px 0 0;',
    'transform:translateY(32px);transition:transform .2s ease-out;color:#e8e2da;text-align:left;',
    'font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",Arial,sans-serif;',
    '-webkit-tap-highlight-color:transparent;}',
    '.gpcp-mask.gpcp-show .gpcp-drawer{transform:translateY(0);}',
    '.gpcp-head{display:flex;align-items:center;gap:10px;padding:14px 14px 12px 18px;border-bottom:1px solid rgba(255,255,255,.08);flex:0 0 auto;}',
    '.gpcp-titlewrap{flex:1 1 auto;min-width:0;}',
    '.gpcp-title{font-size:15px;font-weight:600;letter-spacing:1px;color:#e8e2da;}',
    '.gpcp-sub{margin-top:2px;font-size:10px;letter-spacing:2px;color:rgba(232,226,218,.38);}',
    '.gpcp-x{flex:0 0 auto;width:34px;height:34px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;',
    'padding:0;background:transparent;border:1px solid rgba(255,255,255,.12);border-radius:8px;color:#e8e2da;font-size:16px;cursor:pointer;}',
    '.gpcp-x .gpcp-ic{width:14px;height:14px;}',
    '.gpcp-x:active{border-color:#f2586a;}',
    '.gpcp-tabs{display:flex;flex:0 0 auto;border-bottom:1px solid rgba(255,255,255,.08);}',
    '.gpcp-tab{flex:1 1 0;height:44px;box-sizing:border-box;padding:0;background:transparent;border:none;',
    'border-bottom:2px solid transparent;color:rgba(232,226,218,.5);font-size:14px;font-family:inherit;cursor:pointer;}',
    '.gpcp-tab.gpcp-on{color:#e8e2da;font-weight:600;border-bottom-color:#f2586a;}',
    '.gpcp-body{flex:1 1 auto;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:0 18px 12px;',
    'padding-bottom:calc(12px + env(safe-area-inset-bottom));}',
    '.gpcp-page{display:none;}',
    '.gpcp-page.gpcp-on{display:block;}',
    '.gpcp-sec{display:flex;align-items:center;gap:8px;margin:16px 0 2px;font-size:11px;letter-spacing:2px;color:rgba(232,226,218,.4);}',
    '.gpcp-page .gpcp-sec:first-child{margin-top:12px;}',
    '.gpcp-sec::after{content:"";flex:1 1 auto;height:1px;background:rgba(255,255,255,.08);}',
    '.gpcp-row{min-height:52px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid rgba(255,255,255,.08);}',
    '.gpcp-lab{font-size:14px;color:#e8e2da;}',
    '.gpcp-labwrap{display:flex;flex-direction:column;gap:3px;min-width:0;}',
    '.gpcp-labsub{font-size:11px;color:rgba(232,226,218,.4);}',
    '.gpcp-srow{padding:10px 0 12px;border-bottom:1px solid rgba(255,255,255,.08);}',
    '.gpcp-sline{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:6px;}',
    '.gpcp-val{font-size:13px;color:rgba(232,226,218,.75);font-variant-numeric:tabular-nums;}',
    '.gpcp-rng{display:block;width:100%;height:26px;margin:0;background:transparent;accent-color:#f2586a;}',
    '.gpcp-sw{position:relative;flex:0 0 auto;width:46px;height:26px;box-sizing:border-box;padding:0;background:#35302a;',
    'border:1px solid rgba(255,255,255,.14);border-radius:13px;cursor:pointer;transition:background .15s linear,border-color .15s linear;}',
    '.gpcp-sw i{position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:#8d8478;',
    'transition:left .15s linear,background .15s linear;}',
    '.gpcp-sw.gpcp-on{background:#f2586a;border-color:#f2586a;}',
    '.gpcp-sw.gpcp-on i{left:22px;background:#fff;}',
    '.gpcp-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;box-sizing:border-box;min-height:38px;padding:0 14px;',
    'background:#35302a;border:1px solid rgba(255,255,255,.12);border-radius:8px;color:#e8e2da;font-size:14px;font-family:inherit;cursor:pointer;}',
    '.gpcp-btn .gpcp-ic{width:14px;height:14px;}',
    '.gpcp-btn:active{border-color:#f2586a;color:#f2586a;}',
    '.gpcp-btn.gpcp-sm{min-height:32px;padding:0 10px;font-size:12px;}',
    '.gpcp-btn.gpcp-dgr{border-color:rgba(242,88,106,.55);color:#f2586a;}',
    '.gpcp-btn.gpcp-acc{border-color:rgba(242,88,106,.6);color:#f2586a;background:transparent;}',
    '.gpcp-btn.gpcp-fill{background:#f2586a;border-color:#f2586a;color:#fff;}',
    '.gpcp-btn.gpcp-fill:active{filter:brightness(1.08);color:#fff;}',
    '.gpcp-skin{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.08);}',
    '.gpcp-thumb{flex:0 0 auto;width:56px;height:56px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;',
    'background:#35302a;border:1px solid rgba(255,255,255,.12);border-radius:8px;overflow:hidden;}',
    '.gpcp-thumb img{max-width:44px;max-height:44px;display:block;}',
    '.gpcp-skininfo{flex:1 1 auto;min-width:0;}',
    '.gpcp-skinname{font-size:14px;color:#e8e2da;}',
    '.gpcp-skinstate{margin-top:3px;font-size:11px;color:rgba(232,226,218,.4);}',
    '.gpcp-skinstate.gpcp-on{color:#f2586a;}',
    '.gpcp-skinact{flex:0 0 auto;display:flex;flex-direction:column;gap:6px;}',
    '.gpcp-skinact .gpcp-btn{width:76px;}',
    '.gpcp-hint{margin:12px 0 0;font-size:12px;line-height:1.7;color:rgba(232,226,218,.4);}',
    '.gpcp-toast{position:absolute;top:58px;left:50%;transform:translateX(-50%);max-width:86%;box-sizing:border-box;padding:8px 14px;',
    'background:#3a332c;border:1px solid rgba(255,255,255,.14);border-radius:8px;color:#e8e2da;font-size:13px;white-space:nowrap;',
    'opacity:0;transition:opacity .15s linear;pointer-events:none;z-index:5;}',
    '.gpcp-toast.gpcp-show{opacity:1;}',
    '.gpcp-confirm{position:fixed;top:0;left:0;right:0;bottom:0;z-index:9100;background:rgba(17,13,10,.72);',
    'display:none;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;',
    'font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",Arial,sans-serif;}',
    '.gpcp-confirm.gpcp-show{display:flex;}',
    '.gpcp-cbox{width:320px;max-width:100%;box-sizing:border-box;background:#2b2622;border:1px solid rgba(255,255,255,.14);',
    'border-radius:14px;padding:18px 16px 16px;color:#e8e2da;text-align:left;}',
    '.gpcp-cftitle{font-size:15px;font-weight:600;}',
    '.gpcp-cftext{margin:10px 0 16px;font-size:13px;line-height:1.7;color:rgba(232,226,218,.6);}',
    '.gpcp-cbtns{display:flex;gap:10px;}',
    '.gpcp-cbtns .gpcp-btn{flex:1 1 0;}'
  ].join('\n');

  /* ---------------- 导出 API ---------------- */

  GP.CFGP = {
    open: open,
    close: close,
    toggle: toggle,
    isOpen: isOpen
  };

  /* node 自测入口（浏览器下忽略） */
  if (typeof module !== 'undefined' && module.exports) { module.exports = GP.CFGP; }
})();
