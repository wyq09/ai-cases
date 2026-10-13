/* eslint-disable */
// 填成语 · 设置面板（代理C）
// 接口（契约 §2）：CY.panel = { open(section?), close(), isOpen() }
// 渲染进 #drawer（不存在则创建到 body 末尾），右侧滑入抽屉 + 遮罩点击关闭。
// 配置读写一律走 CY.config（契约 §2/§6 红线：本模块永不直接读写 localStorage）。
// "词库管理"按钮调用 window.CY && CY.game && CY.game.openImport && CY.game.openImport()。
// node 环境（无 document/window）加载与调用均安全降级，不抛错。
(function (root) {
  'use strict';

  var doc = (typeof document !== 'undefined') ? document : null;

  // ---------- 内部状态 ----------
  var S = {
    open: false,
    drawer: null,       // #drawer 元素
    bodyEl: null,       // 滚动容器 .cyp-body
    binders: [],        // [{ refresh(cfg) }]
    inMilestones: null, // 里程碑节点文本框
    inAmounts: null,    // 里程碑金额文本框
    bankBox: null,      // 词库单选容器
    importBox: null,    // 导入配置折叠区
    importTa: null,     // 导入文本域
    unsub: null,        // CY.config.onChange 退订函数
    selfTick: 0,        // 本面板发起 set() 的计数（标记同步自触发回调）
    keysOn: false
  };

  // CY.config 未就绪时的兜底显示值（仅用于渲染，绝不落盘）
  var FALLBACK = {
    level: { startWords: 4, growthEvery: 2, maxWords: 14, givenRatio: 0.30, attempts: 5, maxSpan: 9 },
    rewards: { milestones: [1, 3, 14], amounts: [120, 120, 240], completeCoins: 0 },
    props: { hintCost: 80, reviveCost: 150, reviveAttempts: 3 },
    audio: { master: 0.9, sfx: 0.8, bgm: 0.25, muted: false },
    motion: { reduced: false },
    bank: { source: 'builtin' }
  };

  // ---------- 小工具 ----------
  function getCfg() {
    try {
      var C = root.CY;
      if (C && C.config && typeof C.config.get === 'function') {
        var cfg = C.config.get();
        if (cfg && typeof cfg === 'object') return cfg;
      }
    } catch (e) { /* 降级 */ }
    return FALLBACK;
  }
  function getPath(obj, path) {
    var seg = String(path).split('.');
    for (var i = 0; i < seg.length; i++) {
      if (obj == null) return undefined;
      obj = obj[seg[i]];
    }
    return obj;
  }
  function pathToPatch(path, value) {
    var seg = String(path).split('.');
    var patch = {}; var cur = patch;
    for (var i = 0; i < seg.length - 1; i++) { cur[seg[i]] = {}; cur = cur[seg[i]]; }
    cur[seg[seg.length - 1]] = value;
    return patch;
  }
  function el(tag, attrs, kids) {
    var d = doc.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        if (k === 'class') d.className = attrs[k];
        else if (k === 'text') d.textContent = attrs[k];
        else if (k === 'placeholder') d.setAttribute('placeholder', attrs[k]);
        else if (k.slice(0, 2) === 'on' && typeof attrs[k] === 'function') d.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) d.setAttribute(k, attrs[k]);
      }
    }
    if (kids) {
      for (var i = 0; i < kids.length; i++) if (kids[i]) d.appendChild(kids[i]);
    }
    return d;
  }
  // 数值显示：小数步长按 2 位去尾零（0.30→0.3、0.00→0），整数原样（绝不吞 10/20/100 的尾零）
  function fmtNum(v, step) {
    var n = Number(v);
    if (isNaN(n)) return String(v == null ? '' : v);
    if (step != null && step < 1) {
      var s = n.toFixed(2).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
      return s;
    }
    return String(n);
  }

  // ---------- 列表解析（契约 §6：解析失败保持原值并 toast） ----------
  // 里程碑：逗号分隔递增正整数，≤999
  function parseIntList(s, max) {
    var parts = String(s == null ? '' : s).split(/[,，、\s]+/).filter(function (x) { return x !== ''; });
    if (!parts.length) return null;
    var out = []; var prev = 0;
    for (var i = 0; i < parts.length; i++) {
      if (!/^\d+$/.test(parts[i])) return null;
      var n = parseInt(parts[i], 10);
      if (n < 1 || n > max) return null;
      if (n <= prev) return null; // 必须严格递增
      prev = n; out.push(n);
    }
    return out;
  }
  // 金额：逗号分隔非负整数，0..9999（允许 0，无需递增）
  function parseAmountList(s) {
    var parts = String(s == null ? '' : s).split(/[,，、\s]+/).filter(function (x) { return x !== ''; });
    if (!parts.length) return null;
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      if (!/^\d+$/.test(parts[i])) return null;
      var n = parseInt(parts[i], 10);
      if (n < 0 || n > 9999) return null;
      out.push(n);
    }
    return out;
  }

  // ---------- 提交（唯一写入口，全部走 CY.config.set） ----------
  function commitPatch(patch) {
    var C = root.CY;
    if (!(C && C.config && typeof C.config.set === 'function')) {
      toast('配置模块未就绪，暂不能修改');
      return false;
    }
    S.selfTick++; // 标记：接下来若同步收到 onChange，是本面板自己引起的
    try { C.config.set(patch); } catch (e) { toast('保存失败'); return false; }
    return true;
  }
  function commitPath(path, value) { return commitPatch(pathToPatch(path, value)); }

  // ---------- toast ----------
  var toastTimer = null;
  function toast(msg) {
    if (!doc || !doc.body) return;
    var t = doc.getElementById('cyp-toast');
    if (!t) { t = doc.createElement('div'); t.id = 'cyp-toast'; doc.body.appendChild(t); }
    t.textContent = String(msg);
    void t.offsetWidth; // 强制重排以重播过渡
    t.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 1900);
  }

  // ---------- 样式（令牌带 fallback，契约 §5；扁平中式，无 SaaS 卡片/emoji） ----------
  var CSS = [
    '#drawer{position:fixed;inset:0;z-index:900;pointer-events:none;',
    'font-family:"Songti SC","STSong","Noto Serif CJK SC","SimSun",serif;}',
    '#drawer.cyp-open{pointer-events:auto;}',
    '#drawer .cyp-mask{position:absolute;inset:0;background:rgba(20,4,30,.55);opacity:0;transition:opacity .22s ease;}',
    '#drawer.cyp-open .cyp-mask{opacity:1;}',
    '#drawer .cyp-panel{position:absolute;top:0;right:0;bottom:0;width:min(340px,86vw);',
    'display:flex;flex-direction:column;background:var(--bg1,#3c0d55);color:var(--cream,#f2e7cf);',
    'border-left:1px solid rgba(217,200,166,.35);box-shadow:-10px 0 28px rgba(0,0,0,.35);',
    'transform:translateX(102%);transition:transform .24s ease;}',
    '#drawer.cyp-open .cyp-panel{transform:translateX(0);}',
    '#drawer.cyp-nomotion .cyp-panel,#drawer.cyp-nomotion .cyp-mask,#drawer.cyp-nomotion *{transition:none !important;}',
    '#drawer .cyp-head{flex:none;display:flex;align-items:center;justify-content:space-between;',
    'padding:13px 14px 13px 18px;border-bottom:1px solid rgba(242,231,207,.18);}',
    '#drawer .cyp-title{font-size:17px;letter-spacing:9px;text-indent:9px;}',
    '#drawer .cyp-x{appearance:none;background:transparent;border:1px solid rgba(242,231,207,.4);color:var(--cream,#f2e7cf);',
    'width:30px;height:30px;border-radius:4px;font-size:14px;line-height:1;cursor:pointer;font-family:inherit;}',
    '#drawer .cyp-x:active{background:rgba(242,231,207,.12);}',
    '#drawer .cyp-body{position:relative;flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;',
    'padding-bottom:calc(18px + env(safe-area-inset-bottom));}',
    '#drawer .cyp-sec{padding:14px 18px 4px;border-bottom:1px solid rgba(242,231,207,.12);}',
    '#drawer .cyp-sec.hl{background:rgba(255,180,58,.09);transition:background .5s ease;}',
    '#drawer .cyp-stitle{display:flex;align-items:center;gap:8px;font-size:13px;letter-spacing:3px;',
    'color:rgba(242,231,207,.92);margin-bottom:6px;}',
    '#drawer .cyp-stitle i{flex:none;width:4px;height:13px;background:var(--accent,#ffb43a);}',
    '#drawer .cyp-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 0;}',
    '#drawer .cyp-lab{font-size:14px;line-height:1.35;min-width:0;}',
    '#drawer .cyp-hint{display:block;font-size:11px;color:rgba(242,231,207,.5);margin-top:2px;letter-spacing:.5px;}',
    '#drawer .cyp-num,#drawer .cyp-text{background:rgba(0,0,0,.28);border:1px solid rgba(242,231,207,.32);',
    'color:var(--cream,#f2e7cf);border-radius:4px;padding:7px 9px;font:inherit;font-size:14px;}',
    '#drawer .cyp-num{width:96px;text-align:right;flex:none;}',
    '#drawer .cyp-text{width:168px;text-align:left;}',
    '#drawer .cyp-num:focus,#drawer .cyp-text:focus{outline:none;border-color:var(--accent,#ffb43a);}',
    '#drawer .cyp-range{flex:1;max-width:150px;accent-color:var(--accent,#ffb43a);height:22px;}',
    '#drawer .cyp-rval{flex:none;width:42px;text-align:right;font-size:13px;color:rgba(242,231,207,.85);font-variant-numeric:tabular-nums;}',
    '#drawer .cyp-sw{position:relative;flex:none;width:44px;height:24px;}',
    '#drawer .cyp-sw input{position:absolute;inset:0;width:100%;height:100%;opacity:0;margin:0;cursor:pointer;}',
    '#drawer .cyp-sw i{position:absolute;inset:0;border-radius:12px;background:rgba(0,0,0,.35);',
    'border:1px solid rgba(242,231,207,.3);pointer-events:none;transition:background .15s;}',
    '#drawer .cyp-sw i::after{content:"";position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;',
    'background:var(--cream,#f2e7cf);transition:transform .15s;}',
    '#drawer .cyp-sw input:checked + i{background:var(--green,#2fa75e);border-color:var(--green-edge,#1f7d43);}',
    '#drawer .cyp-sw input:checked + i::after{transform:translateX(20px);}',
    '#drawer .cyp-bank{display:flex;align-items:center;gap:10px;padding:9px 2px;cursor:pointer;font-size:14px;',
    'border-bottom:1px dashed rgba(242,231,207,.14);}',
    '#drawer .cyp-bank:last-child{border-bottom:none;}',
    '#drawer .cyp-bank input{position:absolute;opacity:0;pointer-events:none;}',
    '#drawer .cyp-bank .cyp-dot{flex:none;font-size:15px;color:rgba(242,231,207,.55);width:16px;text-align:center;}',
    '#drawer .cyp-bank.on .cyp-dot{color:var(--accent,#ffb43a);}',
    '#drawer .cyp-bank .cyp-bankname{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '#drawer .cyp-bank.on .cyp-bankname{color:var(--accent,#ffb43a);}',
    '#drawer .cyp-bank .cyp-banktag{flex:none;font-size:11px;color:rgba(242,231,207,.45);letter-spacing:1px;}',
    '#drawer .cyp-note{font-size:11px;color:rgba(242,231,207,.5);line-height:1.6;margin:6px 0 8px;}',
    '#drawer .cyp-btnrow{display:flex;gap:8px;padding:4px 0 8px;}',
    '#drawer .cyp-btn{appearance:none;background:transparent;border:1px solid rgba(242,231,207,.4);',
    'color:var(--cream,#f2e7cf);border-radius:4px;padding:8px 10px;font:inherit;font-size:13px;',
    'letter-spacing:2px;cursor:pointer;flex:1;min-width:0;}',
    '#drawer .cyp-btn:active{background:rgba(242,231,207,.12);}',
    '#drawer .cyp-btn.block{display:block;width:100%;flex:none;margin:6px 0 10px;}',
    '#drawer .cyp-btn.warn{border-color:rgba(255,180,58,.7);color:var(--accent,#ffb43a);}',
    '#drawer .cyp-btn.danger{border-color:rgba(242,231,207,.55);background:rgba(163,22,95,.4);}',
    '#drawer .cyp-import{display:none;padding:2px 0 8px;}',
    '#drawer .cyp-import.show{display:block;}',
    '#drawer .cyp-import textarea{box-sizing:border-box;width:100%;min-height:84px;resize:vertical;',
    'background:rgba(0,0,0,.28);border:1px solid rgba(242,231,207,.32);color:var(--cream,#f2e7cf);',
    'border-radius:4px;padding:8px;font:inherit;font-size:12px;line-height:1.5;}',
    '#drawer .cyp-import textarea:focus{outline:none;border-color:var(--accent,#ffb43a);}',
    '#cyp-toast{position:fixed;left:50%;bottom:calc(56px + env(safe-area-inset-bottom));z-index:950;',
    'transform:translateX(-50%) translateY(8px);max-width:82vw;text-align:center;',
    'background:var(--ink,#453526);color:var(--cream,#f2e7cf);border:1px solid rgba(242,231,207,.35);',
    'border-radius:4px;padding:8px 16px;font-size:13px;letter-spacing:1px;',
    'font-family:"Songti SC","STSong","Noto Serif CJK SC","SimSun",serif;',
    'opacity:0;pointer-events:none;transition:opacity .2s ease,transform .2s ease;}',
    '#cyp-toast.show{opacity:1;transform:translateX(-50%) translateY(0);}'
  ].join('\n');

  function ensureStyle() {
    if (!doc) return;
    if (doc.getElementById('cy-panel-style')) return;
    var st = doc.createElement('style');
    st.id = 'cy-panel-style';
    st.textContent = CSS;
    (doc.head || doc.documentElement || doc.body).appendChild(st);
  }

  // ---------- 控件构造 ----------
  function secBox(id, marker, title) {
    return el('section', { 'class': 'cyp-sec', id: id },
      [el('div', { 'class': 'cyp-stitle' }, [
        el('i', null), el('span', { text: marker + ' · ' + title })
      ])]);
  }
  function labelBox(text, hint) {
    return el('label', { 'class': 'cyp-lab' }, [
      el('span', { text: text }),
      hint ? el('span', { 'class': 'cyp-hint', text: hint }) : null
    ]);
  }
  // 数值行：type=number，带 min/max 提示（契约 §6）
  function numberRow(sec, path, text, min, max, step, desc) {
    var input = el('input', {
      'class': 'cyp-num', type: 'number',
      min: String(min), max: String(max), step: String(step),
      'aria-label': text
    });
    var hint = '范围 ' + min + '~' + max + (desc ? '，' + desc : '');
    sec.appendChild(el('div', { 'class': 'cyp-row' }, [labelBox(text, hint), input]));
    S.binders.push({
      refresh: function (cfg) {
        if (doc.activeElement === input) return; // 不打断输入
        var v = getPath(cfg, path);
        input.value = (typeof v === 'number' && !isNaN(v)) ? fmtNum(v, step) : String(v == null ? '' : v);
      }
    });
    input.addEventListener('change', function () {
      var raw = input.value.trim();
      if (raw === '' || isNaN(Number(raw))) { toast('请输入有效数字（' + min + '~' + max + '）'); input.value = fmtNum(getPath(getCfg(), path), step); return; }
      if (commitPath(path, Number(raw))) {
        // 回写钳制后的生效值（防自触发：程序化赋值不派发 change）
        input.value = fmtNum(getPath(getCfg(), path), step);
      }
    });
    return input;
  }
  // 滑杆行 0..1 step .01
  function rangeRow(sec, path, text) {
    var range = el('input', { 'class': 'cyp-range', type: 'range', min: '0', max: '1', step: '0.01', 'aria-label': text });
    var rval = el('span', { 'class': 'cyp-rval', text: '0.00' });
    sec.appendChild(el('div', { 'class': 'cyp-row' }, [labelBox(text, '范围 0~1'), range, rval]));
    S.binders.push({
      refresh: function (cfg) {
        if (doc.activeElement === range) return;
        var v = Number(getPath(cfg, path));
        if (!isNaN(v)) { range.value = String(Math.min(1, Math.max(0, v))); rval.textContent = v.toFixed(2); }
      }
    });
    range.addEventListener('input', function () { rval.textContent = Number(range.value).toFixed(2); }); // 仅显示，change 才提交
    range.addEventListener('change', function () { commitPath(path, Number(range.value)); });
  }
  // 开关行
  function switchRow(sec, path, text, desc) {
    var input = el('input', { type: 'checkbox', 'aria-label': text });
    var knob = el('i');
    var sw = el('span', { 'class': 'cyp-sw' }, [input, knob]);
    sec.appendChild(el('div', { 'class': 'cyp-row' }, [labelBox(text, desc || ''), sw]));
    S.binders.push({
      refresh: function (cfg) { input.checked = !!getPath(cfg, path); }
    });
    input.addEventListener('change', function () { commitPath(path, !!input.checked); });
  }
  // 里程碑/金额 文本行
  function listRow(sec, kind, text, hint, placeholder) {
    var input = el('input', { 'class': 'cyp-text', type: 'text', placeholder: placeholder, 'aria-label': text });
    sec.appendChild(el('div', { 'class': 'cyp-row' }, [labelBox(text, hint), input]));
    if (kind === 'milestones') S.inMilestones = input; else S.inAmounts = input;
    S.binders.push({
      refresh: function (cfg) {
        if (doc.activeElement === input) return;
        var arr = getPath(cfg, kind === 'milestones' ? 'rewards.milestones' : 'rewards.amounts');
        input.value = Array.isArray(arr) ? arr.join(',') : '';
      }
    });
    input.addEventListener('change', function () { commitRewardPair(kind); });
    return input;
  }

  // 里程碑 + 金额 成对校验提交（个数不一致 → 拒绝并 toast，保持原值）
  function commitRewardPair(changed) {
    var cfg = getCfg();
    var ms = parseIntList(S.inMilestones ? S.inMilestones.value : '', 999);
    var am = parseAmountList(S.inAmounts ? S.inAmounts.value : '');
    function restore() {
      var cur = cfg && cfg.rewards ? cfg.rewards : FALLBACK.rewards;
      if (S.inMilestones && doc.activeElement !== S.inMilestones) S.inMilestones.value = (cur.milestones || []).join(',');
      if (S.inAmounts && doc.activeElement !== S.inAmounts) S.inAmounts.value = (cur.amounts || []).join(',');
    }
    if (!ms) { toast('里程碑需为逗号分隔的递增正整数（1~999）'); restore(); return; }
    if (!am) { toast('金额需为逗号分隔的非负整数（0~9999）'); restore(); return; }
    if (ms.length !== am.length) { toast('奖励个数与里程碑个数不一致，已保留原值'); restore(); return; }
    commitPatch({ rewards: { milestones: ms, amounts: am } });
  }

  // ---------- 词库列表（只经 CY.* 公开接口取数，本模块永不碰 localStorage） ----------
  // 发现顺序：主线 CY.custom.list()（game.js CustomStore）> 其他可能的兜底访问器。
  function getCustomBanks() {
    var C = root.CY;
    try {
      if (C && C.custom && typeof C.custom.list === 'function') {
        var a = C.custom.list();
        if (Array.isArray(a)) return a;
      }
      if (C && C.game && typeof C.game.getCustomBanks === 'function') {
        var b = C.game.getCustomBanks();
        if (Array.isArray(b)) return b;
      }
      if (C && Array.isArray(C.customBanks)) return C.customBanks;
      if (C && typeof C.customBanks === 'function') {
        var c = C.customBanks();
        if (Array.isArray(c)) return c;
      }
    } catch (e) { /* 降级 */ }
    return null;
  }
  function collectBanks(cfg) {
    var out = [{ id: 'builtin', label: '内置词库', tag: '官方' }];
    var arr = getCustomBanks();
    if (arr) {
      for (var i = 0; i < arr.length; i++) {
        var b = arr[i] || {};
        var id = (b.id != null) ? String(b.id) : ('x' + i);
        out.push({ id: 'custom:' + id, label: b.name || ('自定义包 ' + id.slice(0, 10)), tag: '自定义' });
      }
    }
    var src = getPath(cfg, 'bank.source');
    if (src && src !== 'builtin') {
      var found = false;
      for (var j = 0; j < out.length; j++) if (out[j].id === src) { found = true; break; }
      if (!found) out.push({ id: src, label: '自定义包 ' + String(src).replace(/^custom:/, '').slice(0, 10) || src, tag: '自定义' });
    }
    return out;
  }
  function refreshBanks(cfg) {
    if (!S.bankBox) return;
    var src = getPath(cfg, 'bank.source') || 'builtin';
    var banks = collectBanks(cfg);
    S.bankBox.textContent = '';
    for (var i = 0; i < banks.length; i++) {
      (function (b) {
        var input = el('input', { type: 'radio', name: 'cyp-bank', value: b.id });
        input.checked = (b.id === src);
        var dot = el('span', { 'class': 'cyp-dot', text: input.checked ? '◉' : '○' });
        var lab = el('label', { 'class': 'cyp-bank' + (input.checked ? ' on' : '') }, [
          input, dot,
          el('span', { 'class': 'cyp-bankname', text: b.label }),
          b.tag ? el('span', { 'class': 'cyp-banktag', text: b.tag }) : null
        ]);
        input.addEventListener('change', function () {
          if (input.checked) commitPatch({ bank: { source: input.value } });
        });
        S.bankBox.appendChild(lab);
      })(banks[i]);
    }
  }

  // ---------- 数据区动作 ----------
  function legacyCopy(text) {
    try {
      var ta = doc.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.left = '-9999px'; ta.style.top = '0';
      doc.body.appendChild(ta); ta.select();
      var ok = doc.execCommand('copy');
      doc.body.removeChild(ta);
      return !!ok;
    } catch (e) { return false; }
  }
  function copyText(text) {
    return new Promise(function (resolve) {
      var nav = (typeof navigator !== 'undefined') ? navigator : null;
      if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
        nav.clipboard.writeText(text).then(function () { resolve(true); }, function () { resolve(legacyCopy(text)); });
      } else resolve(legacyCopy(text));
    });
  }
  function doExport() {
    var C = root.CY;
    var s;
    if (C && C.config && typeof C.config.export === 'function') {
      try { s = C.config.export(); } catch (e) { s = null; }
    }
    if (typeof s !== 'string' || !s) s = JSON.stringify(getCfg());
    copyText(s).then(function (ok) { toast(ok ? '配置已复制到剪贴板' : '复制失败，请手动重试'); });
  }
  function doApplyImport() {
    var C = root.CY;
    if (!(C && C.config && typeof C.config.importJson === 'function')) { toast('配置模块未就绪'); return; }
    var txt = S.importTa ? S.importTa.value : '';
    if (!String(txt).trim()) { toast('请先粘贴配置 JSON'); return; }
    var ok = false;
    try { ok = !!C.config.importJson(txt); } catch (e) { ok = false; }
    toast(ok ? '配置已导入' : '内容无效，导入失败');
    if (ok && S.importBox) S.importBox.classList.remove('show');
  }
  function doReset() {
    var C = root.CY;
    if (!(C && C.config && typeof C.config.resetAll === 'function')) { toast('配置模块未就绪'); return; }
    if (!root.confirm('确定清空全部进度与设置？此操作不可恢复。')) return;
    if (!root.confirm('再次确认：真的要清空全部进度吗？')) return;
    try { C.config.resetAll(); } catch (e) { toast('重置失败'); }
  }
  function doBankMgr() {
    // 契约 §2：CY.game?.openImport?.() 的显式判空写法
    if (root.CY && root.CY.game && typeof root.CY.game.openImport === 'function') {
      try { root.CY.game.openImport(); } catch (e) { toast('词库管理打开失败'); }
    } else toast('词库管理暂不可用');
  }

  // ---------- DOM 构建 ----------
  function buildBody() {
    var body = el('div', { 'class': 'cyp-body' });

    // 壹 · 玩法
    var secPlay = secBox('cyp-sec-play', '壹', '玩法');
    numberRow(secPlay, 'level.startWords', '每关起始词数', 3, 8, 1, '开局成语数量');
    numberRow(secPlay, 'level.growthEvery', '每隔几关加一词', 1, 5, 1, '难度增长节奏');
    numberRow(secPlay, 'level.maxWords', '单关词数上限', 4, 16, 1, '网格内最多成语数');
    numberRow(secPlay, 'level.givenRatio', '预给字比例', 0, 0.6, 0.01, '预填字占比');
    numberRow(secPlay, 'level.attempts', '初始剩余次数', 1, 20, 1, '填错一次减一次');
    numberRow(secPlay, 'level.maxSpan', '网格最大跨度', 6, 12, 1, '行/列跨度上限');
    body.appendChild(secPlay);

    // 贰 · 奖励与道具
    var secReward = secBox('cyp-sec-reward', '贰', '奖励与道具');
    listRow(secReward, 'milestones', '里程碑节点', '逗号分隔递增正整数，如 1,3,14', '如 1,3,14');
    listRow(secReward, 'amounts', '里程碑奖励金币', '逗号分隔，个数须与节点一致', '如 120,120,240');
    numberRow(secReward, 'rewards.completeCoins', '过关奖励金币', 0, 999, 1);
    numberRow(secReward, 'props.hintCost', '提示单价（金币）', 0, 9999, 1);
    numberRow(secReward, 'props.reviveCost', '补次数单价（金币）', 0, 9999, 1);
    numberRow(secReward, 'props.reviveAttempts', '补次数恢复次数', 1, 20, 1);
    body.appendChild(secReward);

    // 叁 · 声音与动效
    var secAudio = secBox('cyp-sec-audio', '叁', '声音与动效');
    rangeRow(secAudio, 'audio.master', '主音量');
    rangeRow(secAudio, 'audio.sfx', '音效音量');
    rangeRow(secAudio, 'audio.bgm', '背景音乐音量');
    switchRow(secAudio, 'audio.muted', '静音', '关闭全部声音');
    switchRow(secAudio, 'motion.reduced', '减弱动效', '关闭过渡与动画');
    body.appendChild(secAudio);

    // 肆 · 数据
    var secData = secBox('cyp-sec-data', '肆', '数据');
    secData.appendChild(labelBox('出题词库', '选择成语来源'));
    S.bankBox = el('div', { 'class': 'cyp-banks' });
    secData.appendChild(S.bankBox);
    secData.appendChild(el('div', {
      'class': 'cyp-note',
      text: '切换词库由游戏在下一关生效；若包内可用词太少会自动回退内置词库。'
    }));

    var rowBtns = el('div', { 'class': 'cyp-btnrow' }, [
      el('button', { 'class': 'cyp-btn', type: 'button', text: '导出配置', onclick: doExport }),
      el('button', {
        'class': 'cyp-btn', type: 'button', text: '导入配置',
        onclick: function () {
          if (S.importBox) {
            var show = !S.importBox.classList.contains('show');
            S.importBox.classList.toggle('show', show);
            if (show && S.importTa) { try { S.importTa.focus(); } catch (e) { } }
          }
        }
      })
    ]);
    secData.appendChild(rowBtns);

    S.importBox = el('div', { 'class': 'cyp-import' });
    S.importTa = el('textarea', { placeholder: '粘贴配置 JSON（可先在别处“导出配置”获得）' });
    S.importBox.appendChild(S.importTa);
    S.importBox.appendChild(el('button', { 'class': 'cyp-btn block', type: 'button', text: '应用导入', onclick: doApplyImport }));
    secData.appendChild(S.importBox);

    secData.appendChild(el('button', { 'class': 'cyp-btn warn block', type: 'button', text: '清空全部进度', onclick: doReset }));
    secData.appendChild(el('div', { 'class': 'cyp-note', text: '清空将删除进度、金币与全部设置并刷新页面，需两次确认。' }));
    secData.appendChild(el('button', { 'class': 'cyp-btn block', type: 'button', text: '词库管理', onclick: doBankMgr }));
    body.appendChild(secData);

    return body;
  }

  function ensureDrawer() {
    if (!doc || !doc.body) return;
    var d = doc.getElementById('drawer');
    if (!d) {
      d = doc.createElement('aside');
      d.id = 'drawer';
      doc.body.appendChild(d); // 不存在则创建到 body 末尾（契约 §5）
    }
    if (d.getAttribute('data-cyp') === '1') { S.drawer = d; return; }

    d.textContent = '';
    d.setAttribute('data-cyp', '1');
    d.setAttribute('aria-hidden', 'true');

    var mask = el('div', { 'class': 'cyp-mask' });
    mask.addEventListener('click', function () { close(); }); // 遮罩点击关闭

    var head = el('div', { 'class': 'cyp-head' }, [
      el('div', { 'class': 'cyp-title', text: '设置' }),
      el('button', { 'class': 'cyp-x', type: 'button', 'aria-label': '关闭设置', text: '✕', onclick: function () { close(); } })
    ]);

    S.bodyEl = buildBody();
    var panel = el('div', { 'class': 'cyp-panel', role: 'dialog', 'aria-label': '设置' }, [head, S.bodyEl]);
    d.appendChild(mask);
    d.appendChild(panel);
    S.drawer = d;
  }

  // ---------- 订阅与刷新 ----------
  function refreshAll(cfg) {
    cfg = cfg || getCfg();
    for (var i = 0; i < S.binders.length; i++) {
      try { S.binders[i].refresh(cfg); } catch (e) { /* 单项失败不拖垮整体 */ }
    }
    refreshBanks(cfg);
    if (S.drawer) S.drawer.classList.toggle('cyp-nomotion', !!getPath(cfg, 'motion.reduced'));
  }
  function subscribeCfg() {
    if (S.unsub) return;
    var C = root.CY;
    if (C && C.config && typeof C.config.onChange === 'function') {
      try {
        S.unsub = C.config.onChange(function (cfg) { onCfgChange(cfg); });
      } catch (e) { S.unsub = null; }
    }
  }
  function onCfgChange(cfg) {
    // 防自触发回环：本面板 set() 引起的同步回调不回写 set()；
    // 刷新为“值不同才写 DOM”+ 程序化赋值不派发 change 事件，故天然无回环。
    if (S.selfTick > 0) S.selfTick--;
    refreshAll(cfg);
  }

  // ---------- 滚动锚点 ----------
  var SEC_MAP = {
    'play': 'cyp-sec-play', 'level': 'cyp-sec-play', 'gameplay': 'cyp-sec-play', '玩法': 'cyp-sec-play',
    'reward': 'cyp-sec-reward', 'rewards': 'cyp-sec-reward', 'props': 'cyp-sec-reward',
    '奖励': 'cyp-sec-reward', '奖励与道具': 'cyp-sec-reward', '道具': 'cyp-sec-reward',
    'audio': 'cyp-sec-audio', 'sound': 'cyp-sec-audio', 'motion': 'cyp-sec-audio',
    '声音': 'cyp-sec-audio', '声音与动效': 'cyp-sec-audio', '动效': 'cyp-sec-audio',
    'data': 'cyp-sec-data', 'bank': 'cyp-sec-data', '数据': 'cyp-sec-data', '词库': 'cyp-sec-data'
  };
  function scrollToSection(section) {
    var key = String(section).trim();
    var id = SEC_MAP[key] || SEC_MAP[key.toLowerCase()];
    if (!id || !S.bodyEl) return;
    var t = doc.getElementById(id);
    if (!t) return;
    setTimeout(function () {
      if (!S.open || !S.bodyEl) return;
      S.bodyEl.scrollTop = Math.max(0, t.offsetTop - 10);
      t.classList.add('hl');
      setTimeout(function () { t.classList.remove('hl'); }, 900);
    }, 60);
  }

  function installKeys() {
    if (S.keysOn || !doc) return;
    S.keysOn = true;
    doc.addEventListener('keydown', function (e) {
      if (e && (e.key === 'Escape' || e.key === 'Esc') && S.open) close();
    });
  }

  // ---------- 对外接口 ----------
  function open(section) {
    if (!doc || !doc.body) return false; // node / 无 DOM 环境：安全空操作
    ensureStyle();
    ensureDrawer();
    subscribeCfg();
    refreshAll();
    if (!S.open) {
      S.open = true;
      S.drawer.classList.add('cyp-open');
      S.drawer.setAttribute('aria-hidden', 'false');
      installKeys();
    }
    if (section != null && section !== '') scrollToSection(section);
    return true;
  }
  function close() {
    if (!doc || !S.open) return false;
    S.open = false;
    if (S.drawer) {
      S.drawer.classList.remove('cyp-open');
      S.drawer.setAttribute('aria-hidden', 'true');
    }
    return true;
  }
  function isOpen() { return !!S.open; }

  var panel = { open: open, close: close, isOpen: isOpen };

  root.CY = root.CY || {};
  root.CY.panel = panel;
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window : globalThis).CY.panel;
}
