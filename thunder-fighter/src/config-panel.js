/* ============================================================================
 * thunder-fighter · 设置面板 + TF.CFG 配置存储层（契约节 CONFIG_PANEL）
 * ------------------------------------------------------------------------
 * - 存储层：localStorage 'tf.cfg.v1'；apply(snap) 深合并 → 落盘 → 逐个回调
 *   onChange(完整快照深拷贝)；importJSON 非法 JSON 抛错且不落盘。
 * - 面板层：open 时深拷贝 cur 为 work；一切编辑 = 改 work → apply(work)，
 *   面板自身永不直接读写 localStorage（「恢复出厂」按契约明示 removeItem）。
 * - 兜底：TF.ART / TF.SFX / TF.PROFILE 缺失不抛错；模块加载期不调用他人。
 * - 视觉：军用 HUD —— 深底 #0b0f14 / 1px 边线 #263241 / 切角 12px / accent
 *   青 #35e0c8；方形滑块开关；无渐变按钮、无 emoji、无大圆角卡片堆。
 * ========================================================================= */
window.TF = window.TF || {};
TF.CFG = (function () {
  'use strict';

  var KEY = 'tf.cfg.v1';
  var SAVE_KEY = 'tf.save.v1';
  var SHIP_IDS = ['A', 'B', 'C', 'D', 'E', 'F'];
  var SHIP_NAMES = { A: '突击者', B: '幻影', C: '重锤', D: '苍穹', E: '雷神', F: '灭世' };
  var CUES = [
    ['shoot1', '主炮枪弹'], ['shoot2', '双联炮'], ['shoot3', '重炮'],
    ['hit', '命中'], ['die1', '小型爆炸'], ['die2', '中型爆炸'],
    ['bigdie', '大型爆炸'], ['pu', '道具拾取'], ['coin', '金币'],
    ['bomb', '炸弹'], ['bosswarn', 'BOSS 警告'], ['clear', '通关']
  ];

  var DEF = {
    sens: 1.15, fireK: 1, diff: 1, dropK: 1, shake: 1, vib: 1,
    bgmVol: 0.7, sfxVol: 0.9, quality: 'auto', demoSpd: 1,
    shipImg: { A: null, B: null, C: null, D: null, E: null, F: null },
    sounds: {}
  };

  /* ------------------------- 存储层 ------------------------- */

  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // 就地合并：仅当 root 时丢弃 base 未知的顶层键（保 schema），嵌套开放表照单全收
  function mergeInto(base, src, root) {
    if (!isObj(src)) return base;
    Object.keys(src).forEach(function (k) {
      if (root && !Object.prototype.hasOwnProperty.call(base, k)) return;
      var b = base[k], s = src[k];
      if (s === undefined) return;
      if (isObj(b) && isObj(s)) mergeInto(b, s, false);
      else base[k] = s;
    });
    return base;
  }

  function defaultCfg() { return clone(DEF); }

  var cur = (function () {
    var d = defaultCfg();
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) mergeInto(d, JSON.parse(raw), true);
    } catch (e) { /* 损坏存档按默认处理 */ }
    return d;
  })();

  function persist() { try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch (e) {} }

  var cbs = [];
  function onChange(cb) {
    if (typeof cb === 'function') cbs.push(cb);
    return function () { var i = cbs.indexOf(cb); if (i >= 0) cbs.splice(i, 1); };
  }
  function fire() {
    var snap = clone(cur);
    for (var i = 0; i < cbs.length; i++) { try { cbs[i](snap); } catch (e) {} }
  }
  // 桥接 SFX（音量 + 自定义音效覆盖），全部存在性兜底
  function sideFx() {
    try { if (window.TF && TF.SFX && typeof TF.SFX.setVol === 'function') TF.SFX.setVol(cur.bgmVol, cur.sfxVol); } catch (e) {}
    try { if (window.TF && TF.SFX && typeof TF.SFX.applyOverrides === 'function') TF.SFX.applyOverrides(cur.sounds || {}); } catch (e) {}
  }

  function all() { return cur; }
  function apply(snap) { cur = mergeInto(defaultCfg(), snap, true); persist(); sideFx(); fire(); return cur; }
  function exportJSON() { return JSON.stringify(cur, null, 2); }
  function importJSON(str) {
    var o = JSON.parse(str); // 非法 JSON 直接抛错，不落盘
    if (!isObj(o)) throw new Error('配置必须为 JSON 对象');
    apply(o);
    return clone(cur);
  }

  /* ------------------------- 面板层 ------------------------- */

  var panel = null, work = null, els = null;
  var imgInput = null, audInput = null, dataInput = null;
  var imgTarget = null, audTarget = null, toastTimer = 0;

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
  function dataURI(u) { return typeof u === 'string' && u.indexOf('data:image') === 0; }
  function icon(name) {
    try {
      var u = (window.TF && TF.ART && typeof TF.ART.icon === 'function') ? TF.ART.icon(name) : null;
      if (dataURI(u)) return '<img class="tfcp-ic" alt="" src="' + u + '">';
    } catch (e) {}
    return '';
  }
  var SHIP_PLACEHOLDER = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120">' +
    '<rect x="9" y="9" width="82" height="102" fill="none" stroke="#263241" stroke-dasharray="4 3"/>' +
    '<path d="M50 32 L67 86 L50 73 L33 86 Z" fill="none" stroke="#3c4c5e" stroke-width="2"/>' +
    '</svg>');
  function shipSrc(id) {
    try {
      if (work && work.shipImg && work.shipImg[id]) return work.shipImg[id];
      var u = (window.TF && TF.ART && typeof TF.ART.ship === 'function') ? TF.ART.ship(id) : null;
      if (dataURI(u)) return u;
    } catch (e) {}
    return SHIP_PLACEHOLDER;
  }

  // 面板编辑唯一出口：work → apply（落盘 + 广播深拷贝快照），面板不碰 localStorage
  function commit() { apply(work); }

  function openPanel() {
    if (!document.body) { setTimeout(openPanel, 30); return; }
    if (!panel) build();
    work = clone(cur);           // 打开面板：深拷贝为 work 副本
    syncAll();
    panel.mask.classList.add('tfcp-show');
    try { if (window.TF && TF.SFX && typeof TF.SFX.play === 'function') TF.SFX.play('ui'); } catch (e) {}
  }
  function close() {
    if (!panel) return;
    panel.mask.classList.remove('tfcp-show');
    hideConfirm();
    imgTarget = null; audTarget = null;
  }
  function isOpen() { return !!(panel && panel.mask.classList.contains('tfcp-show')); }

  function toastMsg(s) {
    if (!panel) return;
    panel.toast.textContent = s;
    panel.toast.classList.add('tfcp-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { if (panel) panel.toast.classList.remove('tfcp-show'); }, 1800);
  }

  /* --------------------- 控件行构造 --------------------- */

  function secHead(t) { return el('div', 'tfcp-sec', txt(t)); }
  function hint(t) { return el('div', 'tfcp-hint', txt(t)); }

  function rowNum(label, key, min, max, step, dec, suffix) {
    var r = el('div', 'tfcp-row');
    r.innerHTML = '<span class="tfcp-lab">' + txt(label) + '</span>';
    var val = el('span', 'tfcp-val');
    var rng = document.createElement('input');
    rng.type = 'range'; rng.className = 'tfcp-rng';
    rng.min = min; rng.max = max; rng.step = step;
    rng.setAttribute('data-key', key);
    var fmt = function (v) { return Number(v).toFixed(dec) + (suffix || ''); };
    rng.addEventListener('input', function () {
      var v = parseFloat(rng.value);
      if (isNaN(v)) return;
      work[key] = v;
      val.textContent = fmt(v);
      commit();
    });
    r.appendChild(rng); r.appendChild(val);
    els.nums[key] = { rng: rng, val: val, fmt: fmt, scale: 1 };
    return r;
  }

  function rowVol(label, key) {
    var r = el('div', 'tfcp-row');
    r.innerHTML = '<span class="tfcp-lab">' + txt(label) + '</span>';
    var val = el('span', 'tfcp-val');
    var rng = document.createElement('input');
    rng.type = 'range'; rng.className = 'tfcp-rng';
    rng.min = 0; rng.max = 100; rng.step = 1;
    rng.setAttribute('data-key', key);
    var fmt = function (v) { return Math.round(v) + '%'; };
    rng.addEventListener('input', function () {  // 输入即广播 + setVol 兜底
      var v = parseFloat(rng.value);
      if (isNaN(v)) return;
      work[key] = v / 100;
      val.textContent = fmt(v);
      commit();
    });
    r.appendChild(rng); r.appendChild(val);
    els.nums[key] = { rng: rng, val: val, fmt: fmt, scale: 100 };
    return r;
  }

  function rowToggle(label, key) {
    var r = el('div', 'tfcp-row');
    r.innerHTML = '<span class="tfcp-lab">' + txt(label) + '</span>';
    var b = el('button', 'tfcp-sw', '<i></i>');
    b.type = 'button';
    b.setAttribute('data-key', key);
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', function () {
      work[key] = b.classList.contains('tfcp-on') ? 0 : 1;
      b.classList.toggle('tfcp-on', !!work[key]);
      b.setAttribute('aria-pressed', work[key] ? 'true' : 'false');
      commit();
    });
    r.appendChild(b);
    els.togs[key] = b;
    return r;
  }

  function segSync(seg, v) {
    Array.prototype.forEach.call(seg.children, function (b) { b.classList.toggle('tfcp-on', b.__v === v); });
  }
  function rowSeg(label, key, opts) {
    var r = el('div', 'tfcp-row');
    r.innerHTML = '<span class="tfcp-lab">' + txt(label) + '</span>';
    var seg = el('div', 'tfcp-seg');
    seg.setAttribute('data-key', key);
    opts.forEach(function (o) {
      var b = el('button', '', txt(o[1]));
      b.type = 'button';
      b.__v = o[0];
      b.addEventListener('click', function () {
        work[key] = o[0];
        segSync(seg, o[0]);
        commit();
      });
      seg.appendChild(b);
    });
    r.appendChild(seg);
    els.segs[key] = seg;
    return r;
  }

  function rowAct(label, sub, btnText, iconName, act, fn, danger) {
    var r = el('div', 'tfcp-row');
    var lw = el('div', 'tfcp-labwrap');
    lw.innerHTML = '<span class="tfcp-lab">' + txt(label) + '</span>' +
      (sub ? '<span class="tfcp-labsub">' + txt(sub) + '</span>' : '');
    var b = el('button', 'tfcp-btn' + (danger ? ' tfcp-dgr' : ''),
      icon(iconName) + '<span>' + txt(btnText) + '</span>');
    b.type = 'button';
    b.setAttribute('data-act', act);
    b.addEventListener('click', fn);
    r.appendChild(lw); r.appendChild(b);
    return r;
  }

  /* --------------------- 图片压缩上传 --------------------- */

  function compressImage(file, ok, fail) {
    var draw = function (src, w, h) {
      try {
        var k = Math.min(1, 256 / Math.max(w || 1, h || 1));   // 256px 长边
        var cw = Math.max(1, Math.round((w || 1) * k));
        var ch = Math.max(1, Math.round((h || 1) * k));
        var cv = document.createElement('canvas');
        cv.width = cw; cv.height = ch;
        cv.getContext('2d').drawImage(src, 0, 0, cw, ch);
        var url;
        try { url = cv.toDataURL('image/webp', 0.85); } catch (e) { url = ''; }
        if (typeof url !== 'string' || url.indexOf('data:image/webp') !== 0) {
          try { url = cv.toDataURL('image/png'); } catch (e2) { if (fail) fail(); return; }
        }
        ok(url);
      } catch (e) { if (fail) fail(); }
    };
    var legacy = function () {
      var im = new Image();
      im.onload = function () { draw(im, im.naturalWidth, im.naturalHeight); };
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
    var id = imgTarget; imgTarget = null;
    compressImage(f, function (url) {
      if (!work.shipImg) work.shipImg = {};
      work.shipImg[id] = url;
      commit(); syncShips();
      toastMsg('战机 ' + id + ' 立绘已更新');
    }, function () { toastMsg('图片读取失败'); });
  }

  function onAudPicked() {
    var f = audInput.files && audInput.files[0];
    audInput.value = '';
    if (!f || !audTarget) return;
    var cue = audTarget; audTarget = null;
    var rd = new FileReader();
    rd.onload = function () {
      if (!work.sounds) work.sounds = {};
      work.sounds[cue] = String(rd.result || '');
      commit(); syncSound();
      toastMsg('音效 ' + cue + ' 已替换');
      try { if (window.TF && TF.SFX && typeof TF.SFX.play === 'function') TF.SFX.play(cue); } catch (e) {}
    };
    rd.onerror = function () { toastMsg('音频读取失败'); };
    rd.readAsDataURL(f);
  }

  function onDataPicked() {
    var f = dataInput.files && dataInput.files[0];
    dataInput.value = '';
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () { importDataText(String(rd.result || '')); };
    rd.onerror = function () { toastMsg('读取文件失败'); };
    rd.readAsText(f);
  }

  function importDataText(text) {
    var o = null;
    try { o = JSON.parse(text); } catch (e) { toastMsg('导入失败：非法 JSON'); return; }
    var done = [];
    var cfgObj = isObj(o) ? (isObj(o.cfg) ? o.cfg : o) : null;
    if (cfgObj) {
      try { importJSON(JSON.stringify(cfgObj)); done.push('配置'); } catch (e) {}
    }
    if (isObj(o) && o.save && window.TF && TF.PROFILE && typeof TF.PROFILE.import === 'function') {
      try { TF.PROFILE.import(o.save); done.push('存档'); } catch (e) {}
    }
    work = clone(cur);
    syncAll();
    toastMsg(done.length ? '已导入：' + done.join(' + ') : '导入失败：无有效数据');
  }

  /* --------------------- 数据导出 / 恢复出厂 --------------------- */

  function exportData() {
    var payload = { app: 'thunder-fighter', ver: 1, time: Date.now(), cfg: JSON.parse(exportJSON()) };
    try {
      if (window.TF && TF.PROFILE && typeof TF.PROFILE.export === 'function') {
        var sv = TF.PROFILE.export();
        if (sv != null) payload.save = sv;
      }
    } catch (e) {}
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    var href = URL.createObjectURL(blob);
    a.href = href;
    a.download = 'tf-data-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(href); }, 3000);
    toastMsg('数据已导出');
  }

  function askReset() { if (panel) panel.confirm.classList.add('tfcp-show'); }
  function hideConfirm() { if (panel) panel.confirm.classList.remove('tfcp-show'); }
  function doReset() {
    try { localStorage.removeItem(KEY); } catch (e) {}
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    location.reload();
  }

  /* --------------------- 同步 --------------------- */

  function syncAll() {
    if (!work || !els) return;
    Object.keys(els.nums).forEach(function (k) {
      var n = els.nums[k];
      var shown = n.scale ? Number(work[k]) * n.scale : Number(work[k]);
      n.rng.value = shown;
      n.val.textContent = n.fmt(shown);
    });
    Object.keys(els.togs).forEach(function (k) {
      els.togs[k].classList.toggle('tfcp-on', !!work[k]);
      els.togs[k].setAttribute('aria-pressed', work[k] ? 'true' : 'false');
    });
    Object.keys(els.segs).forEach(function (k) { segSync(els.segs[k], work[k]); });
    syncShips();
    syncSound();
  }
  function syncShips() {
    SHIP_IDS.forEach(function (id) {
      if (els.shipImgs[id]) els.shipImgs[id].src = shipSrc(id);
      if (els.shipCells[id]) els.shipCells[id].classList.toggle('tfcp-custom', !!(work && work.shipImg && work.shipImg[id]));
    });
  }
  function syncSound() {
    if (!els || !els.cueSel) return;
    var cue = els.cueSel.value;
    var custom = !!(work && work.sounds && work.sounds[cue]);
    els.cueState.textContent = custom ? '已替换 · 自定义音频' : '合成默认';
    els.cueState.classList.toggle('tfcp-on', custom);
    var n = 0, k;
    for (k in (work && work.sounds || {})) if (work.sounds[k]) n++;
    els.sndCount.textContent = '已替换 ' + n + '/' + CUES.length;
  }

  /* --------------------- DOM 构建 --------------------- */

  function onKey(e) { if (e && (e.key === 'Escape' || e.keyCode === 27) && isOpen()) close(); }

  function showTab(i) {
    els.tabs.forEach(function (t, j) { t.classList.toggle('tfcp-on', j === i); });
    els.pages.forEach(function (p, j) { p.classList.toggle('tfcp-on', j === i); });
  }

  function buildShipPage() {
    var p = el('div', 'tfcp-page');
    p.appendChild(secHead('舰体立绘'));
    var grid = el('div', 'tfcp-ships');
    SHIP_IDS.forEach(function (id) {
      var cell = el('div', 'tfcp-ship');
      cell.setAttribute('data-id', id);
      var th = el('div', 'tfcp-thumb');
      var img = document.createElement('img');
      img.alt = id + ' 立绘';
      th.appendChild(img);
      var nm = el('div', 'tfcp-sname', txt(id) + ' · ' + txt(SHIP_NAMES[id]));
      var act = el('div', 'tfcp-sact');
      var b1 = el('button', 'tfcp-btn tfcp-sm', '上传');
      b1.type = 'button';
      b1.setAttribute('data-act', 'up-ship');
      b1.setAttribute('data-id', id);
      b1.addEventListener('click', function () { imgTarget = id; imgInput.click(); });
      var b2 = el('button', 'tfcp-btn tfcp-sm', '默认');
      b2.type = 'button';
      b2.setAttribute('data-act', 'rst-ship');
      b2.setAttribute('data-id', id);
      b2.addEventListener('click', function () {
        if (!work.shipImg) work.shipImg = {};
        work.shipImg[id] = null;
        commit(); syncShips();
        toastMsg('战机 ' + id + ' 已恢复默认立绘');
      });
      act.appendChild(b1); act.appendChild(b2);
      cell.appendChild(th); cell.appendChild(nm); cell.appendChild(act);
      grid.appendChild(cell);
      els.shipImgs[id] = img; els.shipCells[id] = cell;
    });
    p.appendChild(grid);
    p.appendChild(hint('上传图片将等比压缩至 256px 长边（WebP 85%）后本地保存；「默认」恢复官方立绘。'));
    return p;
  }

  function buildAudioPage() {
    var p = el('div', 'tfcp-page');
    p.appendChild(secHead('音量'));
    p.appendChild(rowVol('BGM 音量', 'bgmVol'));
    p.appendChild(rowVol('音效音量', 'sfxVol'));
    p.appendChild(secHead('自定义音效'));

    var rc = el('div', 'tfcp-row');
    rc.innerHTML = '<span class="tfcp-lab">音效单元</span>';
    var sel = el('select', 'tfcp-sel');
    sel.setAttribute('data-key', 'cueSel');
    CUES.forEach(function (c) {
      var op = document.createElement('option');
      op.value = c[0];
      op.textContent = c[0] + ' · ' + c[1];
      sel.appendChild(op);
    });
    sel.addEventListener('change', syncSound);
    rc.appendChild(sel);
    p.appendChild(rc);

    var rs = el('div', 'tfcp-row');
    rs.innerHTML = '<span class="tfcp-lab">当前状态</span>';
    var st = el('span', 'tfcp-state', '合成默认');
    st.setAttribute('data-key', 'cueState');
    rs.appendChild(st);
    p.appendChild(rs);

    var ra = el('div', 'tfcp-actrow');
    var bU = el('button', 'tfcp-btn', icon('plus') + '<span>上传音频替换</span>');
    bU.type = 'button';
    bU.setAttribute('data-act', 'upload-audio');
    bU.addEventListener('click', function () { audTarget = els.cueSel.value; audInput.click(); });
    var bR = el('button', 'tfcp-btn', icon('refresh') + '<span>恢复合成</span>');
    bR.type = 'button';
    bR.setAttribute('data-act', 'reset-audio');
    bR.addEventListener('click', function () {
      var cue = els.cueSel.value;
      if (work.sounds) delete work.sounds[cue];
      commit(); syncSound();
      toastMsg('音效 ' + cue + ' 已恢复合成');
      try { if (window.TF && TF.SFX && typeof TF.SFX.play === 'function') TF.SFX.play(cue); } catch (e) {}
    });
    ra.appendChild(bU); ra.appendChild(bR);
    p.appendChild(ra);

    var rs2 = el('div', 'tfcp-row');
    rs2.innerHTML = '<span class="tfcp-lab">替换进度</span>';
    var cnt = el('span', 'tfcp-state', '已替换 0/' + CUES.length);
    cnt.setAttribute('data-key', 'sndCount');
    rs2.appendChild(cnt);
    p.appendChild(rs2);
    p.appendChild(hint('自定义音频以 dataURL 本地保存，替换后立即生效；「恢复合成」仅清除当前选中单元。'));
    return p;
  }

  function buildPlayPage() {
    var p = el('div', 'tfcp-page');
    p.appendChild(secHead('操控与战斗'));
    p.appendChild(rowNum('操作灵敏度', 'sens', 0.6, 2, 0.05, 2));
    p.appendChild(rowNum('火力倍率', 'fireK', 0.5, 2, 0.05, 2));
    p.appendChild(rowNum('难度系数', 'diff', 0.6, 1.5, 0.05, 2));
    p.appendChild(rowNum('掉落倍率', 'dropK', 0.5, 2, 0.05, 2));
    p.appendChild(secHead('表现与反馈'));
    p.appendChild(rowToggle('震屏反馈', 'shake'));
    p.appendChild(rowToggle('震动反馈', 'vib'));
    p.appendChild(rowSeg('画质等级', 'quality', [['auto', '自动'], ['high', '高'], ['low', '低']]));
    p.appendChild(rowNum('演示速度', 'demoSpd', 0.5, 3, 0.1, 1, 'x'));
    return p;
  }

  function buildDataPage() {
    var p = el('div', 'tfcp-page');
    p.appendChild(secHead('数据管理'));
    p.appendChild(rowAct('导出全部数据', '配置 + 存档 · 下载 .json', '导出', 'export', 'export-data', exportData));
    p.appendChild(rowAct('导入数据', '选择此前导出的 .json 文件', '导入', 'import', 'import-data', function () { dataInput.click(); }));
    p.appendChild(secHead('危险区'));
    p.appendChild(rowAct('恢复出厂', '清空全部配置与存档并重新启动', '重置', 'reset', 'ask-reset', askReset, true));
    return p;
  }

  function buildConfirm() {
    var cf = el('div', 'tfcp-confirm');
    var box = el('div', 'tfcp-cbox');
    box.appendChild(el('div', 'tfcp-ctitle', '恢复出厂'));
    box.appendChild(el('p', 'tfcp-ctext',
      '将清除全部配置与存档（含战机立绘、自定义音效、关卡进度与排行榜），操作不可恢复。确定继续？'));
    var btns = el('div', 'tfcp-cbtns');
    var bn = el('button', 'tfcp-btn', '<span>取消</span>');
    bn.type = 'button';
    bn.setAttribute('data-act', 'cancel-reset');
    bn.addEventListener('click', hideConfirm);
    var bc = el('button', 'tfcp-btn tfcp-dgr', '<span>确认恢复</span>');
    bc.type = 'button';
    bc.setAttribute('data-act', 'confirm-reset');
    bc.addEventListener('click', doReset);
    btns.appendChild(bn); btns.appendChild(bc);
    box.appendChild(btns);
    cf.appendChild(box);
    return cf;
  }

  function build() {
    var old = document.getElementById('panel-cfg');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    if (!document.getElementById('tfcp-style')) {
      var st = document.createElement('style');
      st.id = 'tfcp-style';
      st.textContent = CSS_TEXT;
      document.head.appendChild(st);
    }
    els = { nums: {}, togs: {}, segs: {}, shipImgs: {}, shipCells: {}, tabs: [], pages: [], cueSel: null, cueState: null, sndCount: null };

    var mask = el('div', 'tfcp-mask');
    mask.id = 'panel-cfg';
    mask.setAttribute('aria-label', '系统设置');
    var drawer = el('div', 'tfcp-drawer');
    drawer.setAttribute('role', 'dialog');

    var head = el('div', 'tfcp-head');
    head.appendChild(el('div', 'tfcp-title', '系统设置'));
    head.appendChild(el('div', 'tfcp-sub', 'THUNDER FIGHTER // SYS-CONFIG'));
    var xb = el('button', 'tfcp-x', icon('close') + '<span>关闭</span>');
    xb.type = 'button';
    xb.setAttribute('data-act', 'close');
    xb.addEventListener('click', close);
    head.appendChild(xb);
    drawer.appendChild(head);

    var TABS = ['战机立绘', '音效', '玩法', '数据'];
    var tabBox = el('div', 'tfcp-tabs');
    TABS.forEach(function (t, i) {
      var b = el('button', 'tfcp-tab' + (i === 0 ? ' tfcp-on' : ''), txt(t));
      b.type = 'button';
      b.setAttribute('data-tab', i);
      b.addEventListener('click', function () { showTab(i); });
      tabBox.appendChild(b);
      els.tabs.push(b);
    });
    drawer.appendChild(tabBox);

    var body = el('div', 'tfcp-body');
    [buildShipPage(), buildAudioPage(), buildPlayPage(), buildDataPage()].forEach(function (pg, i) {
      if (i === 0) pg.classList.add('tfcp-on');
      body.appendChild(pg);
      els.pages.push(pg);
    });
    drawer.appendChild(body);

    imgInput = document.createElement('input');
    imgInput.type = 'file'; imgInput.accept = 'image/*'; imgInput.style.display = 'none';
    imgInput.addEventListener('change', onImgPicked);
    audInput = document.createElement('input');
    audInput.type = 'file'; audInput.accept = 'audio/*'; audInput.style.display = 'none';
    audInput.addEventListener('change', onAudPicked);
    dataInput = document.createElement('input');
    dataInput.type = 'file'; dataInput.accept = 'application/json,.json'; dataInput.style.display = 'none';
    dataInput.addEventListener('change', onDataPicked);
    drawer.appendChild(imgInput); drawer.appendChild(audInput); drawer.appendChild(dataInput);

    var toast = el('div', 'tfcp-toast');
    drawer.appendChild(toast);

    mask.appendChild(drawer);
    mask.addEventListener('click', function (e) { if (e.target === mask) close(); });
    document.body.appendChild(mask);
    var confirm = buildConfirm();
    document.body.appendChild(confirm);
    document.addEventListener('keydown', onKey);

    els.cueSel = drawer.querySelector('select[data-key="cueSel"]');
    els.cueState = drawer.querySelector('[data-key="cueState"]');
    els.sndCount = drawer.querySelector('[data-key="sndCount"]');

    panel = { mask: mask, toast: toast, confirm: confirm };
  }

  /* --------------------- 内联样式（tfcp- 前缀） --------------------- */

  var CSS_TEXT = [
    '.tfcp-mask{position:fixed;top:0;left:0;right:0;bottom:0;z-index:9500;background:rgba(4,7,10,.78);',
    'display:flex;align-items:flex-end;justify-content:center;opacity:0;pointer-events:none;transition:opacity .16s linear;}',
    '.tfcp-mask.tfcp-show{opacity:1;pointer-events:auto;}',
    '.tfcp-drawer{position:relative;width:100%;max-width:560px;max-height:78vh;background:#0b0f14;',
    'border:1px solid #263241;border-bottom:none;border-radius:8px 8px 0 0;',
    'clip-path:polygon(12px 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%,0 12px);',
    'display:flex;flex-direction:column;transform:translateY(28px);transition:transform .18s ease-out;',
    'font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",Arial,sans-serif;',
    'color:#c2d1de;text-align:left;-webkit-tap-highlight-color:transparent;}',
    '.tfcp-mask.tfcp-show .tfcp-drawer{transform:translateY(0);}',
    '.tfcp-head{display:flex;align-items:center;gap:10px;padding:14px 14px 12px 20px;border-bottom:1px solid #263241;flex:0 0 auto;}',
    '.tfcp-title{display:flex;align-items:center;gap:9px;font-size:15px;font-weight:600;letter-spacing:4px;color:#e4edf4;}',
    '.tfcp-title::before{content:"";width:8px;height:8px;background:#35e0c8;flex:0 0 auto;}',
    '.tfcp-sub{flex:1 1 auto;text-align:right;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:10px;letter-spacing:2px;color:#4a5b6c;}',
    '.tfcp-x{display:flex;align-items:center;gap:6px;height:34px;padding:0 10px;background:transparent;border:1px solid #263241;color:#8fa3b5;font-size:12px;cursor:pointer;flex:0 0 auto;}',
    '.tfcp-x .tfcp-ic{width:14px;height:14px;}',
    '.tfcp-x:active{border-color:#35e0c8;color:#35e0c8;}',
    '.tfcp-tabs{display:flex;flex:0 0 auto;overflow-x:auto;border-bottom:1px solid #263241;scrollbar-width:none;}',
    '.tfcp-tabs::-webkit-scrollbar{display:none;}',
    '.tfcp-tab{flex:1 0 auto;min-width:78px;height:44px;padding:0 12px;background:transparent;border:none;',
    'border-right:1px solid #16202b;color:#7d92a5;font-size:13px;letter-spacing:2px;cursor:pointer;position:relative;font-family:inherit;}',
    '.tfcp-tab:last-child{border-right:none;}',
    '.tfcp-tab.tfcp-on{color:#35e0c8;}',
    '.tfcp-tab.tfcp-on::after{content:"";position:absolute;left:12px;right:12px;bottom:-1px;height:2px;background:#35e0c8;}',
    '.tfcp-body{flex:1 1 auto;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;',
    'padding-bottom:calc(14px + env(safe-area-inset-bottom));}',
    '.tfcp-page{display:none;padding:2px 16px 10px;}',
    '.tfcp-page.tfcp-on{display:block;}',
    '.tfcp-sec{display:flex;align-items:center;gap:8px;margin:16px 0 4px;font-size:11px;letter-spacing:3px;color:#6f8396;}',
    '.tfcp-page .tfcp-sec:first-child{margin-top:10px;}',
    '.tfcp-sec::before{content:"";width:6px;height:6px;background:#35e0c8;flex:0 0 auto;}',
    '.tfcp-sec::after{content:"";flex:1 1 auto;height:1px;background:#1a2430;}',
    '.tfcp-row{min-height:44px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid #141d27;}',
    '.tfcp-lab{flex:0 1 auto;font-size:13px;color:#c2d1de;}',
    '.tfcp-labwrap{display:flex;flex-direction:column;gap:2px;min-width:0;}',
    '.tfcp-labsub{font-size:10px;color:#5c7080;letter-spacing:1px;}',
    '.tfcp-val{flex:0 0 46px;text-align:right;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;color:#35e0c8;}',
    '.tfcp-rng{flex:1 1 auto;min-width:110px;max-width:170px;-webkit-appearance:none;appearance:none;height:28px;background:transparent;margin:0;}',
    '.tfcp-rng::-webkit-slider-runnable-track{height:2px;background:#263241;}',
    '.tfcp-rng::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:14px;height:14px;margin-top:-6px;background:#0b0f14;border:2px solid #35e0c8;border-radius:0;}',
    '.tfcp-rng::-moz-range-track{height:2px;background:#263241;}',
    '.tfcp-rng::-moz-range-thumb{width:10px;height:10px;background:#0b0f14;border:2px solid #35e0c8;border-radius:0;}',
    '.tfcp-sw{position:relative;flex:0 0 auto;width:46px;height:24px;padding:0;background:#0e141b;border:1px solid #263241;cursor:pointer;}',
    '.tfcp-sw i{position:absolute;top:3px;left:3px;width:16px;height:16px;background:#43546a;transition:left .12s linear,background .12s linear;}',
    '.tfcp-sw.tfcp-on{border-color:#1e5f55;}',
    '.tfcp-sw.tfcp-on i{left:25px;background:#35e0c8;}',
    '.tfcp-seg{display:flex;flex:0 0 auto;border:1px solid #263241;}',
    '.tfcp-seg button{min-width:48px;height:32px;padding:0 8px;background:transparent;border:none;border-right:1px solid #263241;color:#7d92a5;font-size:12px;cursor:pointer;font-family:inherit;}',
    '.tfcp-seg button:last-child{border-right:none;}',
    '.tfcp-seg button.tfcp-on{background:#35e0c8;color:#08211d;font-weight:600;}',
    '.tfcp-sel{flex:0 1 auto;max-width:190px;height:38px;padding:0 8px;background:#0e141b;border:1px solid #263241;color:#c2d1de;font-size:13px;font-family:inherit;}',
    '.tfcp-state{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;color:#5c7080;letter-spacing:1px;text-align:right;}',
    '.tfcp-state.tfcp-on{color:#35e0c8;}',
    '.tfcp-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:40px;padding:0 14px;',
    'background:rgba(53,224,200,.05);border:1px solid #263241;color:#c2d1de;font-size:13px;letter-spacing:1px;cursor:pointer;font-family:inherit;flex:0 0 auto;}',
    '.tfcp-btn .tfcp-ic{width:15px;height:15px;}',
    '.tfcp-btn:active{border-color:#35e0c8;color:#35e0c8;}',
    '.tfcp-btn.tfcp-dgr{border-color:#5c2a22;background:rgba(255,90,60,.05);color:#ff7a5c;}',
    '.tfcp-btn.tfcp-dgr:active{border-color:#ff5a3c;color:#ff5a3c;}',
    '.tfcp-btn.tfcp-sm{min-height:36px;padding:0 4px;font-size:12px;}',
    '.tfcp-actrow{display:flex;gap:10px;margin-top:12px;}',
    '.tfcp-actrow .tfcp-btn{flex:1 1 0;}',
    '.tfcp-ships{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:8px;}',
    '@media (max-width:339px){.tfcp-ships{grid-template-columns:repeat(2,1fr);}}',
    '.tfcp-ship{display:flex;flex-direction:column;gap:7px;padding:8px;background:#0d131b;border:1px solid #1a2430;}',
    '.tfcp-thumb{display:flex;align-items:center;justify-content:center;height:86px;background:#090d12;border:1px solid #141d27;overflow:hidden;}',
    '.tfcp-thumb img{max-width:92%;max-height:92%;display:block;}',
    '.tfcp-ship.tfcp-custom .tfcp-thumb{border-color:#1e5f55;}',
    '.tfcp-ship.tfcp-custom .tfcp-sname{color:#35e0c8;}',
    '.tfcp-sname{text-align:center;font-size:11px;letter-spacing:1px;color:#8fa3b5;}',
    '.tfcp-sact{display:flex;gap:6px;}',
    '.tfcp-sact .tfcp-btn{flex:1 1 0;}',
    '.tfcp-hint{margin:12px 2px 0;padding-left:8px;border-left:2px solid #263241;color:#5c7080;font-size:11px;line-height:1.7;}',
    '.tfcp-toast{position:absolute;top:56px;left:50%;transform:translateX(-50%);max-width:86%;padding:8px 14px;',
    'background:#0e1620;border:1px solid #1e5f55;color:#35e0c8;font-size:12px;letter-spacing:1px;opacity:0;',
    'transition:opacity .15s linear;pointer-events:none;white-space:nowrap;z-index:5;}',
    '.tfcp-toast.tfcp-show{opacity:1;}',
    '.tfcp-confirm{position:fixed;top:0;left:0;right:0;bottom:0;z-index:9600;background:rgba(4,7,10,.72);display:none;align-items:center;justify-content:center;}',
    '.tfcp-confirm.tfcp-show{display:flex;}',
    '.tfcp-cbox{width:330px;max-width:86%;padding:20px 18px 18px;background:#0b0f14;border:1px solid #263241;',
    'clip-path:polygon(12px 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%,0 12px);}',
    '.tfcp-ctitle{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;letter-spacing:4px;color:#ff7a5c;}',
    '.tfcp-ctitle::before{content:"";width:7px;height:7px;background:#ff5a3c;flex:0 0 auto;}',
    '.tfcp-ctext{margin:12px 0 16px;font-size:12px;line-height:1.8;color:#8fa3b5;}',
    '.tfcp-cbtns{display:flex;gap:10px;}',
    '.tfcp-cbtns .tfcp-btn{flex:1 1 0;}',
    '@media (max-width:379px){.tfcp-sub{display:none;}}'
  ].join('\n');

  /* --------------------- 导出 API --------------------- */

  return {
    defaultCfg: defaultCfg,
    all: all,
    apply: apply,
    openPanel: openPanel,
    close: close,
    isOpen: isOpen,
    onChange: onChange,
    exportJSON: exportJSON,
    importJSON: importJSON
  };
})();
