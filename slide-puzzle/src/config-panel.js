/* =========================================================
 * 数字华容道 · 设置面板（底部抽屉） — SP.CONFIG_PANEL
 * 契约：mount(el) / open(tab?) / close() / isOpen() / onChange(cb)
 * - open() 时深拷贝 SP.cfg 为内部 work；任何编辑立即 onChange(完整 cfg 深拷贝快照)
 * - 永不直接读写 localStorage；SP.ART / SP.AUDIO 未装载时兜底
 * - 样式内联注入，类名前缀 spcp-，木纹奶油风
 * ======================================================= */
window.SP = window.SP || {};
SP.CONFIG_PANEL = (function () {
  'use strict';

  /* ---------------- 常量与默认值兜底 ---------------- */
  var FALLBACK = { n: 5, leaves: true, sound: true, vols: { sfx: 0.9 }, picture: null, sounds: {} };
  var TAB_ALIAS = {
    'play': 'play', '玩法': 'play',
    'pic': 'pic', 'picture': 'pic', 'img': 'pic', '图片': 'pic',
    'sound': 'sound', 'sounds': 'sound', 'audio': 'sound', '音效': 'sound',
    'data': 'data', '数据': 'data'
  };
  var TABS = [['play', '玩法'], ['pic', '图片'], ['sound', '音效'], ['data', '数据']];
  var CUES = [['move', '移动音效'], ['win', '胜利音效'], ['button', '按钮音效']];

  function deepCopy(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function clamp01(v) { v = Number(v); return isFinite(v) ? Math.min(1, Math.max(0, v)) : 0; }

  /* 按契约 schema 清洗/补全，缺的键用内置默认值兜底 */
  function sanitize(raw) {
    var d = deepCopy(FALLBACK);
    if (!raw || typeof raw !== 'object') return d;
    var n = Number(raw.n);
    if (n >= 3 && n <= 6 && Math.floor(n) === n) d.n = n;
    if (typeof raw.leaves === 'boolean') d.leaves = raw.leaves;
    if (typeof raw.sound === 'boolean') d.sound = raw.sound;
    if (raw.vols && typeof raw.vols === 'object') {
      var v = Number(raw.vols.sfx);
      if (isFinite(v)) d.vols.sfx = Math.min(1, Math.max(0, v));
    }
    if (raw.picture === null || typeof raw.picture === 'string') d.picture = raw.picture;
    if (raw.sounds && typeof raw.sounds === 'object') {
      var s = {};
      CUES.forEach(function (c) { if (typeof raw.sounds[c[0]] === 'string') s[c[0]] = raw.sounds[c[0]]; });
      d.sounds = s;
    }
    return d;
  }

  /* 恢复默认 = window.SP.defaultCfg 快照（可能缺，内置兜底） */
  function getDefaults() {
    var d = (typeof window !== 'undefined' && window.SP) ? window.SP.defaultCfg : null;
    if (typeof d === 'function') { try { d = d(); } catch (e) { d = null; } }
    return d ? sanitize(deepCopy(d)) : deepCopy(FALLBACK);
  }

  /* ---------------- 模块状态 ---------------- */
  var host = null, root = null;
  var work = null;            // 工作副本（深拷贝）
  var cbs = [];
  var opened = false;
  var curTab = 'play';
  var toastTimer = 0;
  var ui = {};                // 控件引用

  /* ---------------- 样式 ---------------- */
  var CSS = [
    '.spcp-root{position:fixed;inset:0;z-index:9990;font-family:Georgia,\'Times New Roman\',\'Songti SC\',\'STSong\',serif;color:#5b2410;}',
    '.spcp-root[hidden]{display:none!important;}',
    '.spcp-mask{position:absolute;inset:0;background:rgba(46,22,8,.5);opacity:0;transition:opacity .24s ease;}',
    '.spcp-root.spcp-open .spcp-mask{opacity:1;}',
    '.spcp-drawer{position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column;max-height:88%;',
      'background:repeating-linear-gradient(180deg,rgba(168,112,60,.05) 0 2px,rgba(255,255,255,0) 2px 7px),',
      'linear-gradient(180deg,#f7e6bd 0%,#f2ddb0 55%,#eccf9c 100%);',
      'border:3px solid #a8703c;border-bottom:none;border-radius:26px 26px 0 0;',
      'box-shadow:0 -8px 28px rgba(60,30,10,.35);',
      'transform:translateY(103%);transition:transform .28s cubic-bezier(.22,.9,.3,1);}',
    '.spcp-root.spcp-open .spcp-drawer{transform:translateY(0);}',
    '.spcp-drawer::before{content:\'\';position:absolute;left:7px;right:7px;top:7px;bottom:7px;',
      'border:1px solid rgba(122,74,34,.3);border-radius:20px 20px 0 0;pointer-events:none;}',
    '.spcp-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px 4px;flex:0 0 auto;}',
    '.spcp-title{font-size:21px;font-weight:700;letter-spacing:6px;text-shadow:0 1px 0 rgba(255,248,224,.9);padding-left:6px;}',
    '.spcp-close{width:44px;height:44px;border-radius:50%;border:2px solid #7c4a22;cursor:pointer;flex:0 0 auto;',
      'background:radial-gradient(circle at 50% 32%,#c07540,#8a4423 72%);',
      'box-shadow:0 0 0 3px #efdbaa,0 2px 4px rgba(60,30,10,.4);color:#f7e6c4;',
      'font:700 17px/1 Georgia,\'Songti SC\',serif;}',
    '.spcp-close:active{transform:translateY(1px);}',
    '.spcp-tabs{display:flex;gap:6px;padding:6px 16px 10px;flex:0 0 auto;}',
    '.spcp-tab{flex:1;min-height:44px;border-radius:14px;cursor:pointer;color:#7a4a22;',
      'font:600 15px/1 Georgia,\'Songti SC\',serif;border:2px solid #b98a4e;',
      'background:linear-gradient(180deg,#f6e3b2,#ebcf96);box-shadow:inset 0 1px 0 rgba(255,250,230,.8);}',
    '.spcp-tab.spcp-on{color:#f7e6c4;border-color:#7c4a22;background:linear-gradient(180deg,#a85a2e,#8a4423);',
      'box-shadow:inset 0 2px 4px rgba(0,0,0,.28);}',
    '.spcp-body{flex:1 1 auto;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:6px 16px 14px;}',
    '.spcp-panel[hidden]{display:none!important;}',
    '.spcp-card{background:linear-gradient(180deg,#fbeecb,#f3d69a);border:2px solid #b98a4e;border-radius:16px;',
      'box-shadow:inset 0 0 0 1px rgba(122,74,34,.22),0 1px 0 rgba(255,250,230,.6);padding:2px 14px;margin-bottom:12px;}',
    '.spcp-row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:56px;padding:6px 0;}',
    '.spcp-row+.spcp-row{border-top:1px dashed rgba(122,74,34,.35);}',
    '.spcp-row.spcp-col{flex-direction:column;align-items:stretch;gap:10px;padding:12px 0;}',
    '.spcp-rowlabel{font-size:16px;font-weight:700;}',
    '.spcp-rowsub{display:block;font-size:12px;font-weight:400;color:#8a5a34;margin-top:3px;}',
    '.spcp-volhead{display:flex;justify-content:space-between;align-items:center;}',
    '.spcp-volval{display:inline-block;min-width:48px;text-align:right;color:#8a4423;font-size:15px;}',
    '.spcp-dim{opacity:.45;}',
    '.spcp-seg{display:flex;gap:6px;background:rgba(168,112,60,.16);border:2px solid #b98a4e;border-radius:14px;padding:3px;}',
    '.spcp-seg button{flex:1;min-height:44px;border:none;border-radius:10px;cursor:pointer;',
      'font:700 15px/1 Georgia,\'Songti SC\',serif;color:#7a4a22;background:transparent;}',
    '.spcp-seg button.spcp-on{color:#f7e6c4;background:linear-gradient(180deg,#a85a2e,#8a4423);',
      'box-shadow:inset 0 2px 4px rgba(0,0,0,.28),0 1px 0 rgba(255,250,230,.5);}',
    '.spcp-switch{position:relative;display:inline-block;width:58px;height:34px;flex:0 0 auto;cursor:pointer;}',
    '.spcp-switch input{position:absolute;inset:0;width:100%;height:100%;opacity:0;margin:0;cursor:pointer;z-index:2;}',
    '.spcp-track{position:absolute;inset:0;border-radius:999px;border:2px solid #a8703c;',
      'background:linear-gradient(180deg,#dcc494,#cbb078);box-shadow:inset 0 2px 4px rgba(90,50,20,.35);}',
    '.spcp-knob{position:absolute;top:4px;left:4px;width:26px;height:26px;border-radius:50%;pointer-events:none;',
      'background:radial-gradient(circle at 35% 30%,#fdf3d7,#eed7a0);border:2px solid #b98a4e;',
      'box-shadow:0 2px 3px rgba(90,50,20,.4);transition:left .18s ease;}',
    '.spcp-switch input:checked ~ .spcp-track{background:linear-gradient(180deg,#a85a2e,#8a4423);border-color:#7c4a22;}',
    '.spcp-switch input:checked ~ .spcp-knob{left:28px;}',
    '.spcp-range{-webkit-appearance:none;appearance:none;width:100%;height:16px;border-radius:999px;cursor:pointer;',
      'border:2px solid #b98a4e;background:linear-gradient(180deg,#dcc494,#cbb078);',
      'box-shadow:inset 0 2px 3px rgba(90,50,20,.3);outline:none;}',
    '.spcp-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:30px;height:30px;border-radius:50%;',
      'background:radial-gradient(circle at 35% 30%,#fdf3d7,#eed7a0);border:2px solid #b98a4e;',
      'box-shadow:0 2px 4px rgba(90,50,20,.4);}',
    '.spcp-range::-moz-range-thumb{width:26px;height:26px;border-radius:50%;',
      'background:radial-gradient(circle at 35% 30%,#fdf3d7,#eed7a0);border:2px solid #b98a4e;}',
    '.spcp-btn{min-height:44px;padding:0 18px;border-radius:999px;cursor:pointer;color:#6b3212;',
      'font:700 15px/1.2 Georgia,\'Songti SC\',serif;border:2px solid #b5713a;',
      'background:linear-gradient(180deg,#f7e4b2,#eed19c);',
      'box-shadow:0 2px 0 rgba(124,74,34,.4),inset 0 1px 0 rgba(255,250,230,.9);}',
    '.spcp-btn:active{transform:translateY(1px);}',
    '.spcp-btn-primary{color:#f7e6c4;border-color:#7c4a22;background:linear-gradient(180deg,#a85a2e,#8a4423);',
      'box-shadow:0 2px 0 rgba(90,40,15,.5),inset 0 1px 0 rgba(255,230,190,.35);}',
    '.spcp-btnrow{display:flex;gap:10px;margin:2px 0 12px;}',
    '.spcp-btnrow .spcp-btn{flex:1;padding:0 8px;}',
    '.spcp-btncol{display:flex;flex-direction:column;gap:10px;margin:2px 0 12px;}',
    '.spcp-note{font-size:13px;color:#7a4a22;margin:8px 2px 10px;line-height:1.5;}',
    '.spcp-preview{height:150px;border-radius:14px;border:2px dashed #b98a4e;background-color:#efdaa8;',
      'background-size:cover;background-position:center;display:flex;align-items:center;justify-content:center;',
      'color:#8a5a34;font-size:14px;margin:2px 0 12px;}',
    '.spcp-preview.spcp-hasimg{border-style:solid;border-color:#a8703c;}',
    '.spcp-preview span{background:rgba(247,230,189,.88);padding:6px 14px;border-radius:999px;}',
    '.spcp-file{display:none!important;}',
    '.spcp-cuehead{display:flex;align-items:center;justify-content:space-between;}',
    '.spcp-chip{font-size:12px;color:#8a4423;border:1px solid rgba(168,90,46,.45);',
      'background:rgba(168,90,46,.12);border-radius:999px;padding:3px 10px;white-space:nowrap;}',
    '.spcp-cuebtns{display:flex;gap:8px;margin-top:10px;}',
    '.spcp-cuebtns .spcp-btn{flex:1;padding:0 6px;font-size:14px;}',
    '.spcp-cue{padding:12px 14px;}',
    '.spcp-foot{flex:0 0 auto;padding:10px 16px calc(12px + env(safe-area-inset-bottom));',
      'border-top:1px dashed rgba(122,74,34,.35);}',
    '.spcp-done{width:100%;font-size:17px;letter-spacing:8px;padding-left:8px;}',
    '.spcp-toast{position:absolute;top:58px;left:50%;transform:translateX(-50%);z-index:6;max-width:82%;',
      'background:rgba(91,36,16,.92);color:#f7e6c4;font-size:14px;padding:9px 18px;border-radius:999px;',
      'box-shadow:0 3px 10px rgba(40,18,6,.4);pointer-events:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.spcp-toast[hidden]{display:none!important;}',
    '.spcp-hide{display:none!important;}',
    '.spcp-root button:focus-visible,.spcp-root input:focus-visible{outline:3px solid rgba(168,90,46,.85);outline-offset:2px;}',
    '@media (min-width:640px){',
      '.spcp-drawer{left:50%;right:auto;width:520px;transform:translate(-50%,103%);',
        'border-bottom:3px solid #a8703c;border-radius:26px;}',
      '.spcp-drawer::before{border-radius:20px;}',
      '.spcp-root.spcp-open .spcp-drawer{transform:translate(-50%,0);}',
    '}'
  ].join('\n');

  function ensureStyle() {
    if (document.getElementById('spcp-style')) return;
    var st = document.createElement('style');
    st.id = 'spcp-style';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  /* ---------------- DOM 构建 ---------------- */
  function cueCardHTML(key, label) {
    return '' +
      '<div class="spcp-card spcp-cue" data-cue="' + key + '">' +
        '<div class="spcp-cuehead">' +
          '<div class="spcp-rowlabel">' + label + '</div>' +
          '<span class="spcp-chip" data-role="cuechip">默认</span>' +
        '</div>' +
        '<div class="spcp-cuebtns">' +
          '<button type="button" class="spcp-btn" data-cact="play">试听</button>' +
          '<button type="button" class="spcp-btn" data-cact="up">自定义</button>' +
          '<button type="button" class="spcp-btn spcp-hide" data-cact="reset">恢复默认</button>' +
        '</div>' +
      '</div>';
  }

  function panelPlayHTML() {
    var seg = [3, 4, 5, 6].map(function (n) {
      return '<button type="button" data-n="' + n + '">' + n + '×' + n + '</button>';
    }).join('');
    return '' +
      '<div class="spcp-card">' +
        '<div class="spcp-row spcp-col">' +
          '<div class="spcp-rowlabel">棋盘尺寸<span class="spcp-rowsub">切换后立即生效并重开一局</span></div>' +
          '<div class="spcp-seg" data-role="seg">' + seg + '</div>' +
        '</div>' +
        '<div class="spcp-row">' +
          '<div class="spcp-rowlabel">落叶动画<span class="spcp-rowsub">胜利时的落叶庆祝效果</span></div>' +
          '<label class="spcp-switch"><input type="checkbox" data-role="leaves" aria-label="落叶动画">' +
            '<span class="spcp-track"></span><span class="spcp-knob"></span></label>' +
        '</div>' +
        '<div class="spcp-row">' +
          '<div class="spcp-rowlabel">游戏音效<span class="spcp-rowsub">滑动、按钮与胜利音效</span></div>' +
          '<label class="spcp-switch"><input type="checkbox" data-role="sound" aria-label="游戏音效">' +
            '<span class="spcp-track"></span><span class="spcp-knob"></span></label>' +
        '</div>' +
        '<div class="spcp-row spcp-col" data-role="volrow">' +
          '<div class="spcp-volhead"><span class="spcp-rowlabel">音量</span>' +
            '<span class="spcp-volval" data-role="volval">90%</span></div>' +
          '<input type="range" class="spcp-range" data-role="vol" min="0" max="1" step="0.05" aria-label="音量">' +
        '</div>' +
      '</div>';
  }

  function panelPicHTML() {
    return '' +
      '<p class="spcp-note">上传一张图片即可开启图片模式，长边超过 720px 会自动压缩；随时可恢复数字模式。</p>' +
      '<div class="spcp-preview" data-role="picprev"><span data-role="pichint">尚未启用图片模式</span></div>' +
      '<div class="spcp-btnrow">' +
        '<button type="button" class="spcp-btn spcp-btn-primary" data-act="picup">上传图片</button>' +
        '<button type="button" class="spcp-btn" data-act="picnum">恢复数字模式</button>' +
      '</div>' +
      '<input type="file" class="spcp-file" accept="image/*" data-role="picfile">';
  }

  function panelSoundHTML() {
    var cards = CUES.map(function (c) { return cueCardHTML(c[0], c[1]); }).join('');
    return '' +
      '<p class="spcp-note">可用自己的音频替换内置音效（支持常见音频格式），仅在本机生效。</p>' +
      cards +
      '<div class="spcp-btnrow">' +
        '<button type="button" class="spcp-btn" data-act="sndall">全部恢复默认音效</button>' +
      '</div>' +
      '<input type="file" class="spcp-file" accept="audio/*" data-role="sndfile">';
  }

  function panelDataHTML() {
    return '' +
      '<p class="spcp-note">导出的 JSON 包含当前全部设置（含自定义图片与音效），可用于备份或迁移；导入会立即覆盖当前配置。</p>' +
      '<div class="spcp-btncol">' +
        '<button type="button" class="spcp-btn spcp-btn-primary" data-act="export">导出配置（JSON 下载）</button>' +
        '<button type="button" class="spcp-btn" data-act="import">导入配置</button>' +
        '<button type="button" class="spcp-btn" data-act="resetall">恢复默认配置</button>' +
      '</div>' +
      '<input type="file" class="spcp-file" accept="application/json,.json,text/plain" data-role="cfgfile">';
  }

  function buildDOM() {
    root = document.createElement('div');
    root.className = 'spcp-root';
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = '' +
      '<div class="spcp-mask"></div>' +
      '<section class="spcp-drawer" role="dialog" aria-modal="true" aria-label="设置">' +
        '<header class="spcp-head">' +
          '<div class="spcp-title">设置</div>' +
          '<button type="button" class="spcp-close" aria-label="关闭设置">✕</button>' +
        '</header>' +
        '<nav class="spcp-tabs" role="tablist">' +
          TABS.map(function (t) {
            return '<button type="button" class="spcp-tab" role="tab" data-tab="' + t[0] + '">' + t[1] + '</button>';
          }).join('') +
        '</nav>' +
        '<div class="spcp-body">' +
          '<div class="spcp-panel" data-panel="play">' + panelPlayHTML() + '</div>' +
          '<div class="spcp-panel" data-panel="pic" hidden>' + panelPicHTML() + '</div>' +
          '<div class="spcp-panel" data-panel="sound" hidden>' + panelSoundHTML() + '</div>' +
          '<div class="spcp-panel" data-panel="data" hidden>' + panelDataHTML() + '</div>' +
        '</div>' +
        '<footer class="spcp-foot">' +
          '<button type="button" class="spcp-btn spcp-btn-primary spcp-done" data-act="done">完成</button>' +
        '</footer>' +
        '<div class="spcp-toast" data-role="toast" hidden></div>' +
      '</section>';

    ui.mask = root.querySelector('.spcp-mask');
    ui.toast = root.querySelector('[data-role="toast"]');
    ui.tabs = Array.prototype.slice.call(root.querySelectorAll('.spcp-tab'));
    ui.panels = Array.prototype.slice.call(root.querySelectorAll('.spcp-panel'));
    ui.segBtns = Array.prototype.slice.call(root.querySelectorAll('.spcp-seg button'));
    ui.leaves = root.querySelector('[data-role="leaves"]');
    ui.sound = root.querySelector('[data-role="sound"]');
    ui.vol = root.querySelector('[data-role="vol"]');
    ui.volval = root.querySelector('[data-role="volval"]');
    ui.volrow = root.querySelector('[data-role="volrow"]');
    ui.picprev = root.querySelector('[data-role="picprev"]');
    ui.pichint = root.querySelector('[data-role="pichint"]');
    ui.picfile = root.querySelector('[data-role="picfile"]');
    ui.sndfile = root.querySelector('[data-role="sndfile"]');
    ui.cfgfile = root.querySelector('[data-role="cfgfile"]');
    ui.cueCards = Array.prototype.slice.call(root.querySelectorAll('.spcp-cue'));

    root.addEventListener('click', onClick, false);
    root.addEventListener('input', onInput, false);
    root.addEventListener('change', onChangeEv, false);
    document.addEventListener('keydown', onKey, false);
  }

  /* ---------------- 事件分发 ---------------- */
  function onClick(e) {
    if (e.target.closest('.spcp-mask') || e.target.closest('.spcp-close')) { close(); return; }
    var tab = e.target.closest('.spcp-tab');
    if (tab) { showTab(tab.getAttribute('data-tab')); return; }
    var seg = e.target.closest('.spcp-seg button');
    if (seg && work) {
      var n = Number(seg.getAttribute('data-n'));
      if (n && work.n !== n) { work.n = n; notify(); syncUI(); }
      return;
    }
    var act = e.target.closest('[data-act]');
    if (act) { doAct(act.getAttribute('data-act')); return; }
    var cact = e.target.closest('[data-cact]');
    if (cact) {
      var card = cact.closest('[data-cue]');
      doCue(card ? card.getAttribute('data-cue') : null, cact.getAttribute('data-cact'));
    }
  }

  function onInput(e) {
    if (!work) return;
    if (e.target === ui.vol) {
      work.vols.sfx = clamp01(ui.vol.value);
      ui.volval.textContent = Math.round(work.vols.sfx * 100) + '%';
      notify();
    }
  }

  function onChangeEv(e) {
    if (!work) return;
    if (e.target === ui.leaves) { work.leaves = !!ui.leaves.checked; notify(); syncUI(); return; }
    if (e.target === ui.sound) { work.sound = !!ui.sound.checked; notify(); syncUI(); return; }
    if (e.target === ui.picfile) {
      var pf = ui.picfile.files && ui.picfile.files[0];
      ui.picfile.value = '';
      handlePicFile(pf);
      return;
    }
    if (e.target === ui.sndfile) {
      var sf = ui.sndfile.files && ui.sndfile.files[0];
      var cue = ui.sndfile.getAttribute('data-cue') || 'move';
      ui.sndfile.value = '';
      handleSndFile(cue, sf);
      return;
    }
    if (e.target === ui.cfgfile) {
      var cf = ui.cfgfile.files && ui.cfgfile.files[0];
      ui.cfgfile.value = '';
      handleCfgFile(cf);
    }
  }

  function onKey(e) {
    if (opened && (e.key === 'Escape' || e.keyCode === 27)) close();
  }

  function doAct(act) {
    if (!work) return;
    switch (act) {
      case 'done': close(); break;
      case 'picup': ui.picfile.click(); break;
      case 'picnum':
        work.picture = null; notify(); syncUI(); toast('已恢复数字模式');
        break;
      case 'sndall':
        work.sounds = {}; notify(); syncUI(); toast('已全部恢复默认音效');
        break;
      case 'export': doExport(); break;
      case 'import': ui.cfgfile.click(); break;
      case 'resetall':
        work = getDefaults(); notify(); syncUI(); toast('已恢复默认配置');
        break;
    }
  }

  function doCue(cue, act) {
    if (!work || !cue) return;
    if (act === 'play') { previewCue(cue); return; }
    if (act === 'up') { ui.sndfile.setAttribute('data-cue', cue); ui.sndfile.click(); return; }
    if (act === 'reset') {
      delete work.sounds[cue]; notify(); syncUI(); toast('已恢复默认音效');
    }
  }

  /* ---------------- 行为实现 ---------------- */
  function previewCue(cue) {
    var A = (typeof window !== 'undefined' && window.SP) ? window.SP.AUDIO : null;
    if (A && typeof A.play === 'function') {
      try {
        if (typeof A.setVolume === 'function') A.setVolume(work.vols.sfx);
        A.play(cue);
        return;
      } catch (err) { /* 落到兜底提示 */ }
    }
    toast('音效模块未加载，暂不能试听');
  }

  function fileToDataURL(file, cb) {
    if (!file) { cb(null); return; }
    var fr = new FileReader();
    fr.onload = function () { cb(typeof fr.result === 'string' ? fr.result : null); };
    fr.onerror = function () { cb(null); };
    try { fr.readAsDataURL(file); } catch (e) { cb(null); }
  }

  /* 图片压缩：长边 ≤720，JPEG 0.85；失败回落原图 dataURL */
  function compressImage(dataURL, cb) {
    var img = new Image();
    img.onload = function () {
      try {
        var MAX = 720, w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        if (!w || !h) { cb(dataURL); return; }
        var s = Math.min(1, MAX / Math.max(w, h));
        w = Math.max(1, Math.round(w * s));
        h = Math.max(1, Math.round(h * s));
        var cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        cb(cv.toDataURL('image/jpeg', 0.85) || dataURL);
      } catch (e) { cb(dataURL); }
    };
    img.onerror = function () { cb(null); };
    img.src = dataURL;
  }

  function handlePicFile(file) {
    if (!file) return;
    if (file.type && !/^image\//.test(file.type)) { toast('请选择图片文件'); return; }
    fileToDataURL(file, function (url) {
      if (!url) { toast('图片读取失败'); return; }
      compressImage(url, function (out) {
        if (!out) { toast('图片处理失败'); return; }
        work.picture = out; notify(); syncUI(); toast('图片模式已开启');
      });
    });
  }

  function handleSndFile(cue, file) {
    if (!file) return;
    if (file.type && !/^audio\//.test(file.type)) { toast('请选择音频文件'); return; }
    fileToDataURL(file, function (url) {
      if (!url) { toast('音频读取失败'); return; }
      work.sounds[cue] = url; notify(); syncUI(); toast('音效已更新');
    });
  }

  function handleCfgFile(file) {
    if (!file) return;
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var obj = JSON.parse(String(fr.result));
        work = sanitize(obj && typeof obj === 'object' ? obj : null);
        notify(); syncUI(); toast('配置已导入');
      } catch (e) { toast('导入失败：不是有效的配置文件'); }
    };
    fr.onerror = function () { toast('导入失败：文件读取失败'); };
    try { fr.readAsText(file); } catch (e) { toast('导入失败：文件读取失败'); }
  }

  function doExport() {
    try {
      var data = JSON.stringify(deepCopy(work), null, 2);
      var blob = new Blob([data], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'slide-puzzle-config.json';
      document.body.appendChild(a);
      a.click();
      a.parentNode.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 800);
      toast('配置已导出');
    } catch (e) { toast('导出失败'); }
  }

  /* ---------------- 渲染同步 ---------------- */
  function showTab(tab) {
    curTab = TAB_ALIAS[tab] || 'play';
    ui.tabs.forEach(function (b) {
      var on = b.getAttribute('data-tab') === curTab;
      b.classList.toggle('spcp-on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    ui.panels.forEach(function (p) {
      p.hidden = p.getAttribute('data-panel') !== curTab;
    });
  }

  function syncUI() {
    if (!root || !work) return;
    ui.segBtns.forEach(function (b) {
      b.classList.toggle('spcp-on', Number(b.getAttribute('data-n')) === work.n);
      b.setAttribute('aria-pressed', Number(b.getAttribute('data-n')) === work.n ? 'true' : 'false');
    });
    ui.leaves.checked = !!work.leaves;
    ui.sound.checked = !!work.sound;
    ui.vol.value = String(clamp01(work.vols.sfx));
    ui.volval.textContent = Math.round(clamp01(work.vols.sfx) * 100) + '%';
    ui.volrow.classList.toggle('spcp-dim', !work.sound);
    if (work.picture) {
      ui.picprev.style.backgroundImage = 'url("' + work.picture.replace(/"/g, '%22') + '")';
      ui.picprev.classList.add('spcp-hasimg');
      ui.pichint.hidden = true;
    } else {
      ui.picprev.style.backgroundImage = 'none';
      ui.picprev.classList.remove('spcp-hasimg');
      ui.pichint.hidden = false;
      ui.pichint.textContent = '尚未启用图片模式';
    }
    ui.cueCards.forEach(function (card) {
      var cue = card.getAttribute('data-cue');
      var custom = typeof work.sounds[cue] === 'string' && work.sounds[cue].length > 0;
      card.querySelector('[data-role="cuechip"]').textContent = custom ? '已自定义' : '默认';
      var rb = card.querySelector('[data-cact="reset"]');
      rb.classList.toggle('spcp-hide', !custom);
    });
  }

  function toast(msg) {
    if (!ui.toast) return;
    ui.toast.textContent = msg;
    ui.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { ui.toast.hidden = true; }, 1600);
  }

  /* ---------------- 对外接口 ---------------- */
  function notify() {
    if (!work) return;
    cbs.forEach(function (cb) {
      try { cb(deepCopy(work)); } catch (e) { /* 回调异常不影响面板 */ }
    });
  }

  function mount(el) {
    if (!el) return;
    ensureStyle();
    if (root && root.parentNode === el) return;
    if (root && root.parentNode) root.parentNode.removeChild(root);
    host = el;
    buildDOM();
    root.hidden = true;
    host.appendChild(root);
  }

  function open(tab) {
    if (!root) mount(document.body);
    work = sanitize(window.SP && window.SP.cfg);   // 深拷贝 + 补全 schema
    showTab(TAB_ALIAS[tab] || 'play');
    syncUI();
    opened = true;
    root.hidden = false;
    root.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { root.classList.add('spcp-open'); });
    });
  }

  function close() {
    if (!root || !opened) return;
    opened = false;
    root.classList.remove('spcp-open');
    root.setAttribute('aria-hidden', 'true');
    setTimeout(function () { if (!opened && root) root.hidden = true; }, 300);
  }

  function isOpen() { return opened; }

  function onChange(cb) {
    if (typeof cb === 'function') cbs.push(cb);
    return function off() {
      var i = cbs.indexOf(cb);
      if (i >= 0) cbs.splice(i, 1);
    };
  }

  return { mount: mount, open: open, close: close, isOpen: isOpen, onChange: onChange };
})();
