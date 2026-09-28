/* ============================================================
 * retro-moto-racer · RM.CFGP 内置配置面板（暗棕像素风）
 * ------------------------------------------------------------
 * 数据流红线（契约 §3/§4）：
 *   - 配置唯一来源是 window.RM.cfg。open() 时深拷贝为 work 并逐字段
 *     规范化（类型不符回退默认、缺省补默认、未知字段不采纳）；
 *     编辑只改 work（受控控件），「完成」commit() → 逐个通知 onChange
 *     回调（完整 cfg 深拷贝快照），由主线 apply() 合并/落盘/实时生效。
 *   - 右上 × / 遮罩点击 / Esc：直接关闭并丢弃未提交改动，toast「未保存」。
 *   - 面板自身永不读写 localStorage。
 *   - 导入：FileReader 读 JSON → 只取已知字段（未知忽略、缺省补默认）
 *     → 写入 work 并立即 commit。导出：Blob 下载 rm-cfg.json
 *     （{app,ver,cfg} 包裹，导入同时兼容裸 cfg 对象）。
 *
 * 结构：移动端底部抽屉（max-height 44vh、仅上缘圆角、safe-area 留白）；
 *   ≥620px 转居中弹窗 min(560px, 90vw) × max-height 80vh。
 * 行式布局：label 左、控件右，触控目标 ≥36px。
 * 类名前缀 rmcp-，全部样式由本模块注入一次（main 只挂 #panel-config 宿主）。
 * ============================================================ */
(function () {
  'use strict';

  var HAS_DOC = typeof document !== 'undefined';
  var RM = (typeof window !== 'undefined') ? (window.RM = window.RM || {}) : {};

  /* ---------------- 默认表（契约 §4 schema） ---------------- */

  function DEFAULTS() {
    return {
      sound: { master: 0.9, bgm: 0.5, sfx: 0.9, bgmTrack: 'sunrise' },
      video: { crt: true, crtIntensity: 0.55, scanlines: true, particles: 1, shake: true },
      race: {
        difficulty: 'normal', checkpointTime: 18, nitroFill: 1, rubberband: true,
        autoThrottle: true, steerMode: 'drag', steerSens: 1
      },
      player: { tag: 'P1', colorway: 0 }
    };
  }

  /* 车身配色（契约 §6：玩家红 + 对手 green/blue/orange） */
  var SWATCHES = ['#e0342c', '#3fae49', '#3f6fd9', '#e8823c'];

  /* ---------------- 字段规格（类型/范围/默认/格式化） ---------------- */

  function fmtPct(v) { return Math.round(v * 100) + '%'; }
  function fmtX1(v) { return v.toFixed(1) + 'x'; }
  function fmtX2(v) { return v.toFixed(2) + 'x'; }
  function fmtSec(v) { return Math.round(v) + 's'; }

  var FIELDS = [
    /* 声音 */
    { sec: 'sound', k: 'master', type: 'range', label: '主音量', min: 0, max: 1, step: 0.05, def: 0.9, fmt: fmtPct },
    { sec: 'sound', k: 'bgm', type: 'range', label: '音乐音量', min: 0, max: 1, step: 0.05, def: 0.5, fmt: fmtPct },
    { sec: 'sound', k: 'sfx', type: 'range', label: '音效音量', min: 0, max: 1, step: 0.05, def: 0.9, fmt: fmtPct },
    { sec: 'sound', k: 'bgmTrack', type: 'select', label: 'BGM 曲目', def: 'sunrise',
      options: [['sunrise', 'SUNRISE'], ['midnight', 'MIDNIGHT']] },
    /* 操控（schema 里挂在 race 下） */
    { sec: 'race', k: 'steerMode', type: 'select', label: '转向模式', def: 'drag',
      options: [['drag', '拖拽转向'], ['buttons', '左右按钮']] },
    { sec: 'race', k: 'steerSens', type: 'range', label: '转向灵敏度', min: 0.5, max: 1.5, step: 0.05, def: 1, fmt: fmtX2 },
    { sec: 'race', k: 'autoThrottle', type: 'bool', label: '自动油门', def: true },
    /* 画面 */
    { sec: 'video', k: 'crt', type: 'bool', label: 'CRT 效果', def: true },
    { sec: 'video', k: 'crtIntensity', type: 'range', label: 'CRT 强度', min: 0, max: 1, step: 0.05, def: 0.55, fmt: fmtPct },
    { sec: 'video', k: 'scanlines', type: 'bool', label: '扫描线', def: true },
    { sec: 'video', k: 'particles', type: 'range', label: '粒子密度', min: 0, max: 1.5, step: 0.1, def: 1, fmt: fmtX1 },
    { sec: 'video', k: 'shake', type: 'bool', label: '震屏', def: true },
    /* 比赛 */
    { sec: 'race', k: 'difficulty', type: 'select', label: 'AI 难度', def: 'normal',
      options: [['easy', 'EASY'], ['normal', 'NORMAL'], ['hard', 'HARD']] },
    { sec: 'race', k: 'checkpointTime', type: 'range', label: '检查点时间', min: 10, max: 25, step: 1, def: 18, fmt: fmtSec },
    { sec: 'race', k: 'nitroFill', type: 'range', label: '氮气回填', min: 0.5, max: 2, step: 0.1, def: 1, fmt: fmtX1 },
    { sec: 'race', k: 'rubberband', type: 'bool', label: '橡皮筋', def: true },
    /* 玩家 */
    { sec: 'player', k: 'tag', type: 'select', label: '玩家代号', def: 'P1',
      options: [['P1', 'P1'], ['P2', 'P2'], ['P3', 'P3'], ['P4', 'P4']] },
    { sec: 'player', k: 'colorway', type: 'swatch', label: '车身配色', def: 0 }
  ];

  var FIELD_BY = {};
  FIELDS.forEach(function (f) { FIELD_BY[f.sec + '.' + f.k] = f; });

  var GROUPS = [
    { id: 'sound', title: '声音', en: 'SOUND',
      keys: ['sound.master', 'sound.bgm', 'sound.sfx', 'sound.bgmTrack'] },
    { id: 'control', title: '操控', en: 'CONTROL',
      keys: ['race.steerMode', 'race.steerSens', 'race.autoThrottle'] },
    { id: 'video', title: '画面', en: 'VIDEO',
      keys: ['video.crt', 'video.crtIntensity', 'video.scanlines', 'video.particles', 'video.shake'] },
    { id: 'race', title: '比赛', en: 'RACE',
      keys: ['race.difficulty', 'race.checkpointTime', 'race.nitroFill', 'race.rubberband'] },
    { id: 'player', title: '玩家', en: 'PLAYER',
      keys: ['player.tag', 'player.colorway'] },
    { id: 'data', title: '数据', en: 'DATA', keys: [] }
  ];

  /* ---------------- 小工具 ---------------- */

  function clone(o) { try { return JSON.parse(JSON.stringify(o)); } catch (e) { return null; } }
  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function decimalsOf(step) {
    var s = String(step), i = s.indexOf('.');
    return i < 0 ? 0 : (s.length - i - 1);
  }
  /* 把任意数值吸附到字段步进网格并夹回范围（顺带修浮点误差） */
  function snapNum(f, n) {
    if (!isFinite(n)) return f.def;
    n = f.min + Math.round((n - f.min) / f.step) * f.step;
    n = clamp(n, f.min, f.max);
    return parseFloat(n.toFixed(decimalsOf(f.step)));
  }

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

  /* ---------------- 规范化：未知忽略 / 缺省补默认 / 类型回退 ---------------- */

  function coerce(f, v) {
    switch (f.type) {
      case 'range':
        return (typeof v === 'number' && isFinite(v)) ? snapNum(f, v) : f.def;
      case 'select':
        for (var i = 0; i < f.options.length; i++) if (v === f.options[i][0]) return v;
        return f.def;
      case 'bool':
        return (typeof v === 'boolean') ? v : f.def;
      case 'swatch': {
        var n = Number(v);
        return (typeof v === 'number' && isFinite(n) && n >= 0 && n <= SWATCHES.length - 1) ? Math.floor(n) : f.def;
      }
      default:
        return f.def;
    }
  }

  function normalize(src) {
    var out = DEFAULTS();
    if (isObj(src)) {
      FIELDS.forEach(function (f) {
        out[f.sec][f.k] = coerce(f, isObj(src[f.sec]) ? src[f.sec][f.k] : undefined);
      });
    }
    return out;
  }

  /* ---------------- 面板状态 ---------------- */

  var panel = null, work = null, base = null, els = null;
  var cbs = [];
  var cfgGetFn = null;
  var fileInput = null, toastTimer = 0;
  var cfTitle = null, cfText = null, cfOk = null, confirmFn = null;

  function cfgSrc() {
    try {
      if (typeof cfgGetFn === 'function') return cfgGetFn();
    } catch (e) { /* 落到 RM.cfg */ }
    return RM.cfg;
  }

  /* 面板编辑唯一出口：通知全部回调（完整深拷贝快照），不落盘 */
  function commit() {
    if (!work) return;
    var snap = clone(work);
    if (!snap) return;
    for (var i = 0; i < cbs.length; i++) {
      try { cbs[i](snap); } catch (e) { /* 单个回调异常不打断面板 */ }
    }
    base = clone(work); /* 提交后新基线：此时关闭不再算“未保存” */
  }

  function isDirty() {
    return !!(work && base && JSON.stringify(work) !== JSON.stringify(base));
  }

  /* ---------------- open / close / toggle ---------------- */

  function open() {
    if (!HAS_DOC) return;
    if (!document.body) { setTimeout(open, 30); return; }
    if (!panel) build();
    work = normalize(clone(cfgSrc()));
    base = clone(work);
    hideConfirm();
    syncAll();
    panel.body.scrollTop = 0;
    panel.mask.classList.add('rmcp-show');
  }

  function close() {
    if (!panel) return;
    var dirty = isDirty();
    panel.mask.classList.remove('rmcp-show');
    hideConfirm();
    work = null; /* 丢弃工作副本 */
    base = null;
    if (dirty) toast('未保存，已还原');
  }

  function toggle() { if (isOpen()) close(); else open(); }
  function isOpen() { return !!(panel && panel.mask.classList.contains('rmcp-show')); }

  function toast(msg) {
    if (!els || !els.toast) return;
    els.toast.textContent = msg;
    els.toast.classList.add('rmcp-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      if (els && els.toast) els.toast.classList.remove('rmcp-show');
    }, 1800);
  }

  /* ---------------- 二次确认层 ---------------- */

  function askConfirm(title, text, okText, fn) {
    if (!panel) return;
    if (cfTitle) cfTitle.textContent = title;
    if (cfText) cfText.textContent = text;
    if (cfOk) cfOk.textContent = okText;
    confirmFn = fn;
    panel.confirm.classList.add('rmcp-show');
  }
  function hideConfirm() {
    confirmFn = null;
    if (panel) panel.confirm.classList.remove('rmcp-show');
  }

  /* ---------------- 控件行构建 ---------------- */

  function secHead(g) {
    var s = el('div', 'rmcp-sec');
    s.appendChild(el('span', null, txt(g.title)));
    s.appendChild(el('span', 'rmcp-seen', txt(g.en)));
    return s;
  }

  function paintRng(rng) {
    var min = parseFloat(rng.min), max = parseFloat(rng.max), v = parseFloat(rng.value);
    var p = (max > min) ? ((v - min) / (max - min)) * 100 : 0;
    /* 双色硬分界填充（非装饰渐变，等效纯色两段），画在轨道伪元素上 */
    rng.style.setProperty('--rmcp-p', p + '%');
  }

  /* 滑条行：label+数值一行，滑条整行在下（好拖） */
  function rangeRow(f) {
    var r = el('div', 'rmcp-row rmcp-srow');
    var line = el('div', 'rmcp-sline');
    line.appendChild(el('span', 'rmcp-lab', txt(f.label)));
    var val = el('span', 'rmcp-val', '');
    line.appendChild(val);
    var rng = document.createElement('input');
    rng.type = 'range';
    rng.className = 'rmcp-rng';
    rng.min = String(f.min);
    rng.max = String(f.max);
    rng.step = String(f.step);
    rng.setAttribute('data-key', f.sec + '.' + f.k);
    rng.setAttribute('aria-label', f.label);
    rng.addEventListener('input', function () {
      if (!work) return;
      var v = snapNum(f, parseFloat(rng.value));
      work[f.sec][f.k] = v;
      rng.value = String(v);
      val.textContent = f.fmt(v);
      paintRng(rng);
    });
    r.appendChild(line);
    r.appendChild(rng);
    if (els) els.sync[f.sec + '.' + f.k] = function () {
      var v = snapNum(f, Number(work[f.sec][f.k]));
      rng.value = String(v);
      val.textContent = f.fmt(v);
      paintRng(rng);
    };
    return r;
  }

  /* 下选行 */
  function selectRow(f) {
    var r = el('div', 'rmcp-row');
    r.appendChild(el('span', 'rmcp-lab', txt(f.label)));
    var wrap = el('span', 'rmcp-selwrap');
    var sel = document.createElement('select');
    sel.className = 'rmcp-sel';
    sel.setAttribute('data-key', f.sec + '.' + f.k);
    sel.setAttribute('aria-label', f.label);
    f.options.forEach(function (op) {
      var o = document.createElement('option');
      o.value = op[0];
      o.textContent = op[1];
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () {
      if (!work) return;
      work[f.sec][f.k] = coerce(f, sel.value);
    });
    wrap.appendChild(sel);
    r.appendChild(wrap);
    if (els) els.sync[f.sec + '.' + f.k] = function () {
      sel.value = String(work[f.sec][f.k]);
    };
    return r;
  }

  /* 开关行（整行可点，命中区大；原生 checkbox 隐身驱动） */
  function boolRow(f) {
    var r = el('div', 'rmcp-row rmcp-brow');
    r.appendChild(el('span', 'rmcp-lab', txt(f.label)));
    var lab = el('label', 'rmcp-sw');
    var ck = document.createElement('input');
    ck.type = 'checkbox';
    ck.className = 'rmcp-ckb';
    ck.setAttribute('data-key', f.sec + '.' + f.k);
    ck.setAttribute('aria-label', f.label);
    var tr = el('i', 'rmcp-swtr');
    var kn = el('i', 'rmcp-swk');
    lab.appendChild(ck);
    lab.appendChild(tr);
    lab.appendChild(kn);
    ck.addEventListener('change', function () {
      if (!work) return;
      work[f.sec][f.k] = !!ck.checked;
    });
    r.addEventListener('click', function (e) {
      if (e.target === ck || lab.contains(e.target)) return; /* label 自带切换 */
      ck.click();
    });
    r.appendChild(lab);
    if (els) els.sync[f.sec + '.' + f.k] = function () {
      ck.checked = !!work[f.sec][f.k];
    };
    return r;
  }

  /* 选色行（4 色块） */
  function swatchRow(f) {
    var r = el('div', 'rmcp-row');
    r.appendChild(el('span', 'rmcp-lab', txt(f.label)));
    var box = el('span', 'rmcp-sws');
    var btns = [];
    for (var i = 0; i < SWATCHES.length; i++) {
      (function (idx) {
        var b = el('button', 'rmcp-swb');
        b.type = 'button';
        b.style.backgroundColor = SWATCHES[idx];
        b.setAttribute('aria-label', '配色 ' + (idx + 1));
        b.addEventListener('click', function () {
          if (!work) return;
          work[f.sec][f.k] = idx;
          paint();
        });
        box.appendChild(b);
        btns.push(b);
      })(i);
    }
    function paint() {
      var cur = work ? work[f.sec][f.k] : f.def;
      btns.forEach(function (b, j) { b.classList.toggle('rmcp-on', j === cur); });
    }
    r.appendChild(box);
    if (els) els.sync[f.sec + '.' + f.k] = paint;
    return r;
  }

  /* 数据行动作行：左标签+说明，右按钮 */
  function actRow(label, sub, btnText, fn, danger) {
    var r = el('div', 'rmcp-row');
    var lw = el('div', 'rmcp-labwrap');
    lw.appendChild(el('span', 'rmcp-lab', txt(label)));
    if (sub) lw.appendChild(el('span', 'rmcp-labsub', txt(sub)));
    var b = el('button', 'rmcp-btn' + (danger ? ' rmcp-dgr' : ''), txt(btnText));
    b.type = 'button';
    b.addEventListener('click', fn);
    r.appendChild(lw);
    r.appendChild(b);
    return r;
  }

  function buildDataSection(p) {
    p.appendChild(actRow('导出配置', '下载 rm-cfg.json', '导出', exportCfg));
    p.appendChild(actRow('导入配置', '选择此前导出的 JSON 文件', '导入', function () {
      if (fileInput) fileInput.click();
    }));
    p.appendChild(actRow('恢复默认', '全部选项回到默认值', '恢复默认', function () {
      askConfirm('恢复默认', '所有设置将恢复为默认值，确定吗？', '确认恢复', function () {
        work = normalize(DEFAULTS());
        commit();
        syncAll();
        toast('已恢复默认');
      });
    }, true));
  }

  /* ---------------- 导出 / 导入 ---------------- */

  function exportCfg() {
    try {
      var payload = { app: 'retro-moto-racer', ver: 1, cfg: clone(work || normalize(cfgSrc())) };
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      var href = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = href;
      a.download = 'rm-cfg.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { try { URL.revokeObjectURL(href); } catch (e) { /* ignore */ } }, 3000);
      toast('已导出 rm-cfg.json');
    } catch (e) { toast('导出失败'); }
  }

  function importDataText(text) {
    var o = null;
    try { o = JSON.parse(String(text)); } catch (e) { toast('导入失败：非法 JSON'); return; }
    if (!isObj(o)) { toast('导入失败：需要 JSON 对象'); return; }
    var imp = isObj(o.cfg) ? o.cfg : o; /* 兼容 {cfg:{...}} 包裹与裸 cfg */
    work = normalize(imp);             /* 未知字段忽略、缺省补默认、类型回退 */
    commit();
    syncAll();
    toast('已导入配置');
  }

  function onFilePicked() {
    var f = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () { importDataText(String(rd.result || '')); };
    rd.onerror = function () { toast('读取文件失败'); };
    try { rd.readAsText(f); } catch (e) { toast('读取文件失败'); }
  }

  /* ---------------- 同步 ---------------- */

  function syncAll() {
    if (!work || !els) return;
    Object.keys(els.sync).forEach(function (k) {
      try { els.sync[k](); } catch (e) { /* ignore */ }
    });
  }

  /* ---------------- DOM 构建 ---------------- */

  function onKey(e) {
    if (!e) return;
    var k = e.key || '';
    if (k === 'Escape' || e.keyCode === 27) {
      if (panel && panel.confirm.classList.contains('rmcp-show')) { hideConfirm(); return; }
      if (isOpen()) close();
    }
  }

  function build() {
    var old = document.getElementById('rmcp-root');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var oldCf = document.getElementById('rmcp-confirm');
    if (oldCf && oldCf.parentNode) oldCf.parentNode.removeChild(oldCf);
    var oldToast = document.getElementById('rmcp-toast');
    if (oldToast && oldToast.parentNode) oldToast.parentNode.removeChild(oldToast);
    if (!document.getElementById('rmcp-style')) {
      var st = document.createElement('style');
      st.id = 'rmcp-style';
      st.textContent = CSS_TEXT;
      document.head.appendChild(st);
    }
    els = { sync: {}, toast: null };

    /* 隐藏文件选择器（导入配置） */
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'application/json,.json';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', onFilePicked);

    /* 抽屉 / 弹窗 */
    var mask = el('div', 'rmcp-mask');
    mask.id = 'rmcp-root';
    var box = el('div', 'rmcp-panel');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', '设置');

    var head = el('div', 'rmcp-head');
    var tw = el('div', 'rmcp-tw');
    tw.appendChild(el('div', 'rmcp-title', '设置'));
    tw.appendChild(el('div', 'rmcp-sub', 'RETRO MOTO RACER'));
    var xb = el('button', 'rmcp-x', '×');
    xb.type = 'button';
    xb.setAttribute('aria-label', '关闭');
    xb.addEventListener('click', close);
    head.appendChild(tw);
    head.appendChild(xb);
    box.appendChild(head);

    var body = el('div', 'rmcp-body');
    GROUPS.forEach(function (g) {
      body.appendChild(secHead(g));
      if (g.id === 'data') {
        buildDataSection(body);
      } else {
        g.keys.forEach(function (path) {
          var f = FIELD_BY[path];
          if (!f) return;
          if (f.type === 'range') body.appendChild(rangeRow(f));
          else if (f.type === 'select') body.appendChild(selectRow(f));
          else if (f.type === 'bool') body.appendChild(boolRow(f));
          else if (f.type === 'swatch') body.appendChild(swatchRow(f));
        });
      }
    });
    box.appendChild(body);

    var foot = el('div', 'rmcp-foot');
    foot.appendChild(el('span', 'rmcp-hint', '改动后点「完成」生效'));
    var done = el('button', 'rmcp-btn rmcp-done', '完成');
    done.type = 'button';
    done.addEventListener('click', function () {
      if (!work) return;
      commit();
      toast('已应用');
    });
    foot.appendChild(done);
    box.appendChild(foot);

    mask.appendChild(box);
    mask.addEventListener('click', function (e) { if (e.target === mask) close(); });
    box.appendChild(fileInput);

    var host = document.getElementById('panel-config') || document.body;
    host.appendChild(mask);

    panel = { mask: mask, body: body, confirm: null };

    var confirm = buildConfirm();
    host.appendChild(confirm);
    panel.confirm = confirm;

    var toastEl = el('div', 'rmcp-toast');
    toastEl.id = 'rmcp-toast';
    document.body.appendChild(toastEl);
    els.toast = toastEl;

    document.addEventListener('keydown', onKey);
  }

  function buildConfirm() {
    var cf = el('div', 'rmcp-confirm');
    cf.id = 'rmcp-confirm';
    var cb = el('div', 'rmcp-cbox');
    cfTitle = el('div', 'rmcp-cftitle', '');
    cfText = el('p', 'rmcp-cftext', '');
    var btns = el('div', 'rmcp-cbtns');
    var bn = el('button', 'rmcp-btn', '取消');
    bn.type = 'button';
    bn.addEventListener('click', hideConfirm);
    cfOk = el('button', 'rmcp-btn rmcp-cfok', '确定');
    cfOk.type = 'button';
    cfOk.addEventListener('click', function () {
      var fn = confirmFn;
      hideConfirm();
      if (fn) { try { fn(); } catch (e) { /* ignore */ } }
    });
    btns.appendChild(bn);
    btns.appendChild(cfOk);
    cb.appendChild(cfTitle);
    cb.appendChild(cfText);
    cb.appendChild(btns);
    cf.appendChild(cb);
    cf.addEventListener('click', function (e) { if (e.target === cf) hideConfirm(); });
    return cf;
  }

  /* ---------------- 内联样式（rmcp- 前缀 · 暗棕像素风，与 HUD 一致） ---------------- */

  var CSS_TEXT = [
    /* 遮罩 + 面板（移动端底部抽屉） */
    '.rmcp-mask{position:fixed;top:0;left:0;right:0;bottom:0;z-index:9000;background:rgba(8,3,6,.62);',
    'display:flex;align-items:flex-end;justify-content:center;opacity:0;pointer-events:none;transition:opacity .15s linear;}',
    '.rmcp-mask.rmcp-show{opacity:1;pointer-events:auto;}',
    '.rmcp-panel{position:relative;width:100%;max-height:44vh;display:flex;flex-direction:column;box-sizing:border-box;',
    'background:#2a1420;border:2px solid #4a2432;border-bottom:none;border-radius:10px 10px 0 0;color:#f5f0e6;text-align:left;',
    'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;',
    '-webkit-tap-highlight-color:transparent;transform:translateY(24px);transition:transform .18s ease-out;}',
    '.rmcp-mask.rmcp-show .rmcp-panel{transform:translateY(0);}',
    /* 头部 */
    '.rmcp-head{flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:9px 9px 9px 14px;border-bottom:2px solid #4a2432;}',
    '.rmcp-tw{flex:1 1 auto;min-width:0;}',
    '.rmcp-title{font-size:15px;font-weight:700;letter-spacing:6px;color:#ffd23f;}',
    '.rmcp-sub{margin-top:2px;font-size:9px;letter-spacing:2px;color:#9c7a6e;}',
    '.rmcp-x{flex:0 0 auto;width:36px;height:36px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;',
    'padding:0;background:#1c0d16;border:2px solid #4a2432;border-radius:3px;color:#f5f0e6;',
    'font-family:inherit;font-size:16px;font-weight:700;line-height:1;cursor:pointer;}',
    '.rmcp-x:active{border-color:#ffd23f;color:#ffd23f;}',
    /* 内容区 */
    '.rmcp-body{flex:1 1 auto;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;',
    'padding:0 14px 6px;box-sizing:border-box;}',
    '.rmcp-body::-webkit-scrollbar{width:8px;}',
    '.rmcp-body::-webkit-scrollbar-thumb{background:#4a2432;border:2px solid #2a1420;}',
    '.rmcp-body::-webkit-scrollbar-track{background:transparent;}',
    '.rmcp-sec{display:flex;align-items:center;gap:7px;margin:14px 0 2px;font-size:11px;font-weight:700;letter-spacing:3px;color:#ffd23f;}',
    '.rmcp-sec::before{content:"";flex:0 0 auto;width:7px;height:7px;background:#ffd23f;border:1px solid #4a2432;box-sizing:border-box;}',
    '.rmcp-seen{margin-left:auto;font-size:9px;font-weight:400;letter-spacing:2px;color:#9c7a6e;}',
    /* 行式布局 */
    '.rmcp-row{min-height:40px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:7px 0;',
    'border-bottom:1px solid #3a1c2a;box-sizing:border-box;}',
    '.rmcp-lab{font-size:13px;letter-spacing:1px;color:#f5f0e6;}',
    '.rmcp-labwrap{display:flex;flex-direction:column;gap:3px;min-width:0;}',
    '.rmcp-labsub{font-size:10px;letter-spacing:.5px;color:#9c7a6e;}',
    /* 滑条行 */
    '.rmcp-srow{display:block;padding:8px 0 10px;}',
    '.rmcp-sline{display:flex;align-items:baseline;justify-content:space-between;min-height:20px;}',
    '.rmcp-val{font-size:12px;font-weight:700;color:#ffd23f;font-variant-numeric:tabular-nums;}',
    '.rmcp-rng{-webkit-appearance:none;appearance:none;display:block;width:100%;height:36px;margin:6px 0 0;padding:0;',
    'box-sizing:border-box;background:transparent;border:none;border-radius:0;outline:none;cursor:pointer;accent-color:#ffd23f;}',
    '.rmcp-rng::-webkit-slider-runnable-track{height:14px;box-sizing:border-box;border-radius:0;',
    'background:linear-gradient(90deg,#ffd23f 0%,#ffd23f var(--rmcp-p,0%),#1c0d16 var(--rmcp-p,0%),#1c0d16 100%);',
    'border:2px solid #4a2432;}',
    '.rmcp-rng::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:14px;height:22px;box-sizing:border-box;',
    'background:#ffd23f;border:2px solid #4a2432;border-radius:2px;margin-top:-4px;cursor:pointer;}',
    '.rmcp-rng::-moz-range-track{height:14px;box-sizing:border-box;background:#1c0d16;border:2px solid #4a2432;border-radius:0;}',
    '.rmcp-rng::-moz-range-progress{height:14px;box-sizing:border-box;background:#ffd23f;border-radius:0;}',
    '.rmcp-rng::-moz-range-thumb{width:12px;height:20px;box-sizing:border-box;background:#ffd23f;border:2px solid #4a2432;border-radius:2px;cursor:pointer;}',
    /* 下选 */
    '.rmcp-selwrap{position:relative;flex:0 0 auto;display:inline-flex;align-items:center;}',
    '.rmcp-selwrap::after{content:"";position:absolute;right:9px;top:50%;margin-top:-2px;pointer-events:none;',
    'border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid #ffd23f;}',
    '.rmcp-sel{-webkit-appearance:none;appearance:none;min-width:118px;min-height:36px;box-sizing:border-box;padding:5px 26px 5px 10px;',
    'background:#1c0d16;border:2px solid #4a2432;border-radius:3px;color:#f5f0e6;cursor:pointer;accent-color:#ffd23f;',
    'font-family:inherit;font-size:12px;letter-spacing:1px;}',
    '.rmcp-sel:active{border-color:#ffd23f;}',
    '.rmcp-sel option{background:#1c0d16;color:#f5f0e6;}',
    /* 开关（原生 checkbox 隐身驱动，像素方块滑块） */
    '.rmcp-brow{cursor:pointer;}',
    '.rmcp-sw{position:relative;flex:0 0 auto;display:inline-block;width:46px;height:26px;cursor:pointer;}',
    '.rmcp-ckb{position:absolute;left:0;top:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer;accent-color:#ffd23f;}',
    '.rmcp-swtr{position:absolute;top:0;left:0;width:100%;height:100%;box-sizing:border-box;display:block;',
    'background:#1c0d16;border:2px solid #4a2432;border-radius:3px;pointer-events:none;}',
    '.rmcp-swk{position:absolute;top:3px;left:3px;width:16px;height:16px;display:block;background:#8a6a5e;',
    'border-radius:1px;pointer-events:none;}',
    '.rmcp-ckb:checked ~ .rmcp-swtr{background:#4a3407;border-color:#ffd23f;}',
    '.rmcp-ckb:checked ~ .rmcp-swk{left:23px;background:#ffd23f;}',
    /* 选色块 */
    '.rmcp-sws{display:flex;gap:8px;flex:0 0 auto;}',
    '.rmcp-swb{position:relative;width:28px;height:28px;box-sizing:border-box;padding:0;background:#1c0d16;',
    'border:2px solid #4a2432;border-radius:3px;cursor:pointer;}',
    '.rmcp-swb.rmcp-on{border-color:#ffd23f;}',
    '.rmcp-swb.rmcp-on::after{content:"";position:absolute;left:50%;top:50%;width:8px;height:8px;margin:-5px 0 0 -5px;',
    'background:#2a1420;border:1px solid #f5f0e6;box-sizing:border-box;}',
    /* 按钮 */
    '.rmcp-btn{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;min-height:36px;padding:0 12px;',
    'background:#1c0d16;border:2px solid #4a2432;border-radius:3px;color:#f5f0e6;cursor:pointer;white-space:nowrap;',
    'font-family:inherit;font-size:12px;font-weight:700;letter-spacing:1px;}',
    '.rmcp-btn:active{border-color:#ffd23f;color:#ffd23f;}',
    '.rmcp-btn.rmcp-dgr{color:#d94f3d;}',
    '.rmcp-btn.rmcp-dgr:active{border-color:#d94f3d;}',
    /* 底栏 + 完成 */
    '.rmcp-foot{flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:8px 14px;',
    'padding-bottom:calc(8px + env(safe-area-inset-bottom));border-top:2px solid #4a2432;}',
    '.rmcp-hint{flex:1 1 auto;min-width:0;font-size:10px;letter-spacing:.5px;color:#9c7a6e;}',
    '.rmcp-btn.rmcp-done{flex:0 0 auto;min-width:104px;min-height:38px;background:#ffd23f;border-color:#ffd23f;color:#2a1420;}',
    '.rmcp-btn.rmcp-done:active{background:#e8b92a;border-color:#e8b92a;color:#2a1420;}',
    /* toast */
    '.rmcp-toast{position:fixed;top:calc(10px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);z-index:9700;',
    'max-width:86%;box-sizing:border-box;padding:8px 14px;background:#1c0d16;border:2px solid #4a2432;border-radius:3px;',
    'color:#ffd23f;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;font-weight:700;',
    'letter-spacing:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0;pointer-events:none;transition:opacity .15s linear;}',
    '.rmcp-toast.rmcp-show{opacity:1;}',
    /* 二次确认层 */
    '.rmcp-confirm{position:fixed;top:0;left:0;right:0;bottom:0;z-index:9500;background:rgba(8,3,6,.72);',
    'display:none;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;',
    'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;}',
    '.rmcp-confirm.rmcp-show{display:flex;}',
    '.rmcp-cbox{width:min(320px,86vw);box-sizing:border-box;background:#2a1420;border:2px solid #4a2432;border-radius:4px;padding:16px;}',
    '.rmcp-cftitle{font-size:14px;font-weight:700;letter-spacing:3px;color:#ffd23f;}',
    '.rmcp-cftext{margin:10px 0 14px;font-size:12px;line-height:1.8;color:#f5f0e6;}',
    '.rmcp-cbtns{display:flex;gap:10px;}',
    '.rmcp-cbtns .rmcp-btn{flex:1 1 0;}',
    '.rmcp-btn.rmcp-cfok{background:#d94f3d;border-color:#d94f3d;color:#fff2ea;}',
    '.rmcp-btn.rmcp-cfok:active{background:#b93c2c;border-color:#b93c2c;color:#fff2ea;}',
    /* 焦点可见性（键盘可达） */
    '.rmcp-btn:focus-visible,.rmcp-x:focus-visible,.rmcp-sel:focus-visible,.rmcp-swb:focus-visible{outline:2px solid #ffd23f;outline-offset:1px;}',
    /* 桌面：居中弹窗 */
    '@media (min-width:620px){',
    '.rmcp-mask{align-items:center;padding:24px;box-sizing:border-box;}',
    '.rmcp-panel{width:min(560px,90vw);max-height:80vh;border-bottom:2px solid #4a2432;border-radius:4px;transform:translateY(8px);}',
    '.rmcp-foot{padding-bottom:8px;}',
    '}'
  ].join('\n');

  /* ---------------- 导出 API（接口锁死） ---------------- */

  function init(opts) {
    opts = opts || {};
    cfgGetFn = (typeof opts.getConfig === 'function') ? opts.getConfig : null;
    cbs = [];
    if (typeof opts.apply === 'function') cbs.push(opts.apply);
  }

  RM.CFGP = {
    init: init,
    open: open,
    close: close,
    toggle: toggle,
    isOpen: isOpen
  };

  /* node 语法自测入口（浏览器下忽略） */
  if (typeof module !== 'undefined' && module.exports) { module.exports = RM.CFGP; }
})();
