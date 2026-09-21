/* =========================================================
 * 倒水挑战 · 游戏内设置面板 — WS.PANEL
 * 契约接口：mount({root,get,onChange,onClose,stats,onClearProgress,audioNames,onAudioOverride})
 *           open() / close() / isOpen()
 * - open() 时经 get() 深拷贝宿主 cfg 为 work（缺失则内置默认）
 * - 任何编辑改 work 后立即 onChange(完整深拷贝快照)
 * - 永不直接读写 localStorage；WS.AUDIO 缺失时试听兜底提示
 * - 样式内联注入，类名前缀 wscp-；暖棕米色系
 * ======================================================= */
window.WS = window.WS || {};
WS.PANEL = (function () {
  'use strict';

  function defaultCfg() {
    return {
      capacity: 4, empties: 2, maxColors: 10, addBottle: 1,
      animSpeed: 1, hintOn: true,
      room: 'warm', liquidSet: 'classic',
      bgmVol: 0.4, sfxVol: 0.9,
      audioOverrides: {}
    };
  }

  var SEGS = {
    capacity: { vals: [3, 4, 5], label: '瓶容量', sub: '每瓶装几格水（下一关生效）' },
    empties:  { vals: [1, 2], label: '空瓶数', sub: '开局给的空瓶，少则更难（下一关生效）' },
    addBottle: { vals: [0, 1, 2], label: '每关加瓶次数', sub: '「加瓶」按钮每关可用几次' }
  };
  var CUE_TABLE = [
    ['pick', '拿起'], ['pour', '倒水'], ['deny', '不可倒'], ['drop', '落定'],
    ['colorDone', '一色完成'], ['pig', '小猪欢呼'], ['win', '过关'],
    ['click', '点击'], ['start', '开始'], ['bgm', '背景音乐']
  ];
  var ROOMS = [['warm', '暖木', ['#8A6FA5', '#A96A3F', '#8F5530']],
               ['mint', '薄荷', ['#7BB8A0', '#C8A878', '#A8885C']],
               ['dusk', '暮蓝', ['#5C6B99', '#6E4E33', '#553826']]];
  var TABS = [['play', '玩法'], ['audio', '音画'], ['data', '数据']];

  function deepCopy(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function clamp(v, min, max, fb) { var n = Number(v); return isFinite(n) ? Math.min(max, Math.max(min, n)) : fb; }
  function pct(v) { return Math.round(clamp(v, 0, 1, 0) * 100) + '%'; }
  function cueLabel(id) {
    for (var i = 0; i < CUE_TABLE.length; i++) if (CUE_TABLE[i][0] === id) return CUE_TABLE[i][1];
    return id;
  }
  function cueList() {
    var names = opts && opts.audioNames;
    if (names && names.length) return names.map(function (n) { return [n, cueLabel(n)]; });
    return CUE_TABLE.slice();
  }
  function hasAudio() {
    try { return !!(window.WS && window.WS.AUDIO && typeof window.WS.AUDIO.play === 'function'); } catch (e) { return false; }
  }
  function sanitize(raw) {
    var d = defaultCfg();
    if (!raw || typeof raw !== 'object') return d;
    d.capacity = clamp(raw.capacity, 3, 5, d.capacity);
    d.empties = clamp(raw.empties, 1, 2, d.empties);
    d.maxColors = clamp(raw.maxColors, 4, 10, d.maxColors);
    d.addBottle = clamp(raw.addBottle, 0, 2, d.addBottle);
    d.animSpeed = clamp(raw.animSpeed, 0.5, 2, d.animSpeed);
    if (typeof raw.hintOn === 'boolean') d.hintOn = raw.hintOn;
    var rooms = ROOMS.map(function (r) { return r[0]; });
    if (rooms.indexOf(raw.room) >= 0) d.room = raw.room;
    if (['classic', 'candy', 'ocean'].indexOf(raw.liquidSet) >= 0) d.liquidSet = raw.liquidSet;
    d.bgmVol = clamp(raw.bgmVol, 0, 1, d.bgmVol);
    d.sfxVol = clamp(raw.sfxVol, 0, 1, d.sfxVol);
    if (raw.audioOverrides && typeof raw.audioOverrides === 'object') {
      var ov = {};
      cueList().forEach(function (p) {
        var v = raw.audioOverrides[p[0]];
        if (typeof v === 'string' && v) ov[p[0]] = v;
      });
      d.audioOverrides = ov;
    }
    return d;
  }

  /* ---------------- 模块状态 ---------------- */
  var opts = null, root = null, ui = {};
  var work = null, opened = false, curTab = 'play';
  var armed = false, armTimer = 0, toastTimer = 0;
  var sndCue = '';   // 待上传的 cue
  var cfgCue = null; // 'cfgfile' 导入

  /* ---------------- 样式（米白底 + 暖棕 + 蓝 primary，扁平） ---------------- */
  var CSS = [
    '.wscp-root{position:absolute;inset:0;z-index:9000;font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#5B3A1E;}',
    '.wscp-root,.wscp-root *{box-sizing:border-box;}',
    '.wscp-root[hidden]{display:none!important;}',
    '.wscp-mask{position:absolute;inset:0;background:rgba(43,24,8,.5);opacity:0;transition:opacity .22s ease;}',
    '.wscp-root.wscp-open .wscp-mask{opacity:1;}',
    '.wscp-drawer{position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column;max-height:88%;',
      'background:#FFF7E8;border:2px solid #E0C194;border-bottom:none;border-radius:18px 18px 0 0;',
      'transform:translateY(105%);transition:transform .28s cubic-bezier(.22,.9,.3,1);}',
    '.wscp-root.wscp-open .wscp-drawer{transform:translateY(0);}',
    '.wscp-head{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:2px solid #EFD9B8;flex:0 0 auto;}',
    '.wscp-title{font-size:17px;font-weight:900;letter-spacing:3px;flex:1;min-width:0;color:#7A4A1E;}',
    '.wscp-close{width:38px;height:38px;flex:0 0 auto;border:2px solid #E0C194;border-radius:10px;background:#FFFDF8;',
      'color:#8A5A2A;font:900 15px/1 system-ui;cursor:pointer;}',
    '.wscp-close:active{background:#F5E8D2;}',
    '.wscp-tabs{display:flex;gap:8px;padding:10px 16px 0;flex:0 0 auto;}',
    '.wscp-tab{flex:1;height:38px;border:2px solid #E0C194;border-radius:10px;background:#FFFDF8;color:#8A5A2A;',
      'font:700 14px/1 system-ui;cursor:pointer;letter-spacing:2px;text-indent:2px;font-family:inherit;}',
    '.wscp-tab.wscp-on{background:#7A4A1E;color:#FFF3DC;border-color:#7A4A1E;}',
    '.wscp-body{flex:1 1 auto;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:2px 16px 14px;}',
    '.wscp-panel[hidden]{display:none!important;}',
    '.wscp-note{margin:10px 0 2px;font-size:12px;line-height:1.7;color:#A5794A;}',
    '.wscp-sec{display:inline-block;margin:14px 0 2px;padding:3px 9px;background:#7A4A1E;color:#FFF3DC;',
      'font-size:11px;font-weight:700;letter-spacing:2px;border-radius:5px;}',
    '.wscp-row{min-height:52px;padding:10px 0 0;display:flex;align-items:center;justify-content:space-between;gap:10px;}',
    '.wscp-row + .wscp-row,.wscp-segwrap + .wscp-row{border-top:1px dashed #E8CFA5;margin-top:10px;padding-top:12px;}',
    '.wscp-lab{font-size:14px;font-weight:700;line-height:1.4;}',
    '.wscp-sub{display:block;font-size:11px;font-weight:400;color:#A5794A;margin-top:2px;}',
    '.wscp-seg{display:flex;gap:6px;flex:0 0 auto;}',
    '.wscp-seg button{min-width:44px;height:36px;border:2px solid #E0C194;border-radius:9px;background:#FFFDF8;',
      'color:#8A5A2A;font:700 14px/1 system-ui;cursor:pointer;font-family:inherit;padding:0 8px;}',
    '.wscp-seg button.wscp-on{background:#4FA8E0;border-color:#2F7FB8;color:#fff;}',
    '.wscp-range{-webkit-appearance:none;appearance:none;display:block;width:100%;height:34px;margin:2px 0 0;padding:0;',
      'background:transparent;cursor:pointer;}',
    '.wscp-range::-webkit-slider-runnable-track{height:10px;border:2px solid #E0C194;border-radius:6px;background:#F5E8D2;}',
    '.wscp-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:22px;height:22px;margin-top:-8px;',
      'border:2px solid #2F7FB8;border-radius:8px;background:#4FA8E0;}',
    '.wscp-range::-moz-range-track{height:10px;border:2px solid #E0C194;border-radius:6px;background:#F5E8D2;}',
    '.wscp-range::-moz-range-thumb{width:18px;height:18px;border:2px solid #2F7FB8;border-radius:8px;background:#4FA8E0;}',
    '.wscp-sw{position:relative;width:52px;height:30px;flex:0 0 auto;cursor:pointer;display:inline-block;}',
    '.wscp-sw input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer;z-index:2;}',
    '.wscp-track{position:absolute;inset:0;border:2px solid #E0C194;border-radius:9px;background:#F0E2C8;transition:background .15s;}',
    '.wscp-knob{position:absolute;top:3px;left:3px;width:20px;height:20px;border:2px solid #E0C194;border-radius:7px;',
      'background:#FFFDF8;transition:left .15s;pointer-events:none;}',
    '.wscp-sw input:checked ~ .wscp-track{background:#4FA8E0;}',
    '.wscp-sw input:checked ~ .wscp-knob{left:25px;}',
    '.wscp-pals{display:flex;gap:8px;margin:8px 0 2px;}',
    '.wscp-pal{flex:1;min-width:0;padding:8px 4px 7px;border:2px solid #E8CFA5;border-radius:12px;background:#FFFDF8;',
      'cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;font-family:inherit;}',
    '.wscp-pal.wscp-on{border-color:#4FA8E0;background:#EAF4FB;}',
    '.wscp-palsw{display:flex;width:100%;height:20px;border:2px solid #E0C194;border-radius:6px;overflow:hidden;}',
    '.wscp-palsw i{flex:1;height:100%;}',
    '.wscp-palname{font-size:12px;font-weight:700;color:#8A5A2A;}',
    '.wscp-volhead{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:10px;}',
    '.wscp-volval{font:italic 900 14px/1 system-ui;color:#4FA8E0;}',
    '.wscp-vol{padding-bottom:2px;}',
    '.wscp-vol + .wscp-vol .wscp-volhead{border-top:1px dashed #E8CFA5;margin-top:8px;padding-top:12px;}',
    '.wscp-cue{display:flex;align-items:center;gap:6px;min-height:46px;padding:6px 0;}',
    '.wscp-cue + .wscp-cue{border-top:1px dashed #E8CFA5;}',
    '.wscp-cuename{flex:1;min-width:0;font-size:14px;font-weight:700;display:flex;align-items:center;gap:6px;flex-wrap:wrap;}',
    '.wscp-chip{font-size:10px;font-weight:700;line-height:1;color:#4FA8E0;border:1px solid #4FA8E0;border-radius:4px;',
      'padding:2px 4px;letter-spacing:1px;}',
    '.wscp-btn{height:40px;padding:0 14px;border:2px solid #E0C194;border-radius:10px;background:#FFFDF8;',
      'color:#8A5A2A;font:700 13px/1 system-ui;cursor:pointer;font-family:inherit;}',
    '.wscp-btn:active{background:#F5E8D2;}',
    '.wscp-btn-primary{background:#4FA8E0;color:#fff;border-color:#2F7FB8;}',
    '.wscp-btn-warn{color:#C24E42;border-color:#D98A80;}',
    '.wscp-btn-warn:active{background:#F9ECEA;}',
    '.wscp-btn.wscp-armed{background:#C24E42;border-color:#A93B31;color:#fff;}',
    '.wscp-cue .wscp-btn{height:32px;padding:0 10px;font-size:12px;flex:0 0 auto;}',
    '.wscp-stats{display:flex;border:2px solid #E0C194;border-radius:12px;background:#FFFDF8;margin:10px 0 2px;overflow:hidden;}',
    '.wscp-statcell{flex:1;min-width:0;padding:12px 6px 10px;text-align:center;}',
    '.wscp-statcell + .wscp-statcell{border-left:2px solid #EFD9B8;}',
    '.wscp-statnum{font:italic 900 24px/1.2 system-ui;color:#7A4A1E;}',
    '.wscp-statkey{font-size:11px;color:#A5794A;letter-spacing:2px;margin-top:3px;}',
    '.wscp-btnrow{display:flex;gap:8px;margin:10px 0 2px;}',
    '.wscp-btnrow .wscp-btn{flex:1;min-width:0;padding:0 6px;}',
    '.wscp-btn-block{display:block;width:100%;}',
    '.wscp-foot{flex:0 0 auto;padding:10px 16px calc(10px + env(safe-area-inset-bottom));border-top:2px solid #EFD9B8;}',
    '.wscp-done{width:100%;height:44px;font-size:15px;letter-spacing:8px;text-indent:8px;}',
    '.wscp-toast{position:absolute;left:50%;bottom:calc(80px + env(safe-area-inset-bottom));transform:translateX(-50%);',
      'z-index:6;max-width:86%;background:#5B3A1E;color:#FFF3DC;font-size:13px;line-height:1.4;padding:8px 14px;',
      'border-radius:999px;pointer-events:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.wscp-toast[hidden]{display:none!important;}',
    '.wscp-file{display:none!important;}',
    '.wscp-hide{display:none!important;}',
    '@media (min-width:700px){.wscp-drawer{left:auto;top:0;width:400px;max-height:none;height:100%;',
      'border-bottom:2px solid #E0C194;border-radius:18px 0 0 18px;transform:translateX(105%);}',
      '.wscp-root.wscp-open .wscp-drawer{transform:translateX(0);}}'
  ].join('\n');

  function ensureStyle() {
    if (document.getElementById('wscp-style')) return;
    var st = document.createElement('style');
    st.id = 'wscp-style';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  /* ---------------- HTML ---------------- */
  function segHTML(key) {
    var s = SEGS[key];
    var btns = s.vals.map(function (v) {
      return '<button type="button" data-seg="' + key + '" data-val="' + v + '">' + v + '</button>';
    }).join('');
    return '<div class="wscp-row"><span class="wscp-lab">' + s.label
      + '<span class="wscp-sub">' + s.sub + '</span></span>'
      + '<span class="wscp-seg" data-seggroup="' + key + '">' + btns + '</span></div>';
  }
  function volRowHTML(k, label) {
    return '<div class="wscp-vol"><div class="wscp-volhead"><span class="wscp-lab">' + label + '</span>'
      + '<span class="wscp-volval" data-volval="' + k + '">0%</span></div>'
      + '<input type="range" class="wscp-range" data-vol="' + k + '" min="0" max="1" step="0.05" aria-label="' + label + '"></div>';
  }
  function cueRowHTML(cue, label) {
    return '<div class="wscp-cue" data-cue="' + cue + '">'
      + '<span class="wscp-cuename">' + label + '<span class="wscp-chip wscp-hide">已自定义</span></span>'
      + '<button type="button" class="wscp-btn wscp-hide" data-sact="play">试听</button>'
      + '<button type="button" class="wscp-btn" data-sact="up">换音</button>'
      + '<button type="button" class="wscp-btn wscp-hide" data-sact="reset">恢复</button>'
      + '</div>';
  }
  function palCardHTML(list, role, swatches, names) {
    return list.map(function (p, i) {
      var sw = swatches(p[0], i).map(function (c) { return '<i style="background:' + c + '"></i>'; }).join('');
      return '<button type="button" class="wscp-pal" data-' + role + '="' + p[0] + '">'
        + '<span class="wscp-palsw">' + sw + '</span>'
        + '<span class="wscp-palname">' + (names ? names[i] : p[1]) + '</span></button>';
    }).join('');
  }
  function liquidSwatches(key) {
    try {
      var L = window.WS && window.WS.ART && window.WS.ART.liquids;
      if (L && L[key]) return L[key].slice(0, 6);
    } catch (e) {}
    var fb = { classic: ['#F5C542', '#E2483D', '#3FA0D8', '#59B35B', '#F08A3C', '#EF7FA4'],
               candy: ['#FF8FB2', '#FFD166', '#7FD8BE', '#9B8CFF', '#FF9F68', '#6FC7E1'],
               ocean: ['#2E86AB', '#7ADCC7', '#F6C445', '#E4717A', '#9BDE7E', '#5E60CE'] };
    return fb[key] || fb.classic;
  }

  function buildDOM() {
    root = document.createElement('div');
    root.className = 'wscp-root';
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = ''
      + '<div class="wscp-mask"></div>'
      + '<section class="wscp-drawer" role="dialog" aria-modal="true" aria-label="设置">'
      +   '<header class="wscp-head"><div class="wscp-title">设 置</div>'
      +     '<button type="button" class="wscp-close" aria-label="关闭设置">✕</button></header>'
      +   '<nav class="wscp-tabs">' + TABS.map(function (t) {
            return '<button type="button" class="wscp-tab" data-tab="' + t[0] + '">' + t[1] + '</button>';
          }).join('') + '</nav>'
      +   '<div class="wscp-body">'
      +     '<div class="wscp-panel" data-panel="play">'
      +       '<p class="wscp-note">难度参数在「下一关」生效；外观与音量即时生效。</p>'
      +       segHTML('capacity') + segHTML('empties')
      +       '<div class="wscp-row"><span class="wscp-lab">色数上限<span class="wscp-sub">关卡颜色数的成长天花板（下一关生效）</span></span>'
      +         '<span class="wscp-volval" data-volval="maxColors">10</span></div>'
      +       '<input type="range" class="wscp-range" data-vol="maxColors" min="4" max="10" step="1" aria-label="色数上限">'
      +       segHTML('addBottle')
      +       '<div class="wscp-row"><span class="wscp-lab">动画速度<span class="wscp-sub">倒水演出快慢</span></span>'
      +         '<span class="wscp-volval" data-volval="animSpeed">1×</span></div>'
      +       '<input type="range" class="wscp-range" data-vol="animSpeed" min="0.5" max="2" step="0.25" aria-label="动画速度">'
      +       '<div class="wscp-row"><span class="wscp-lab">提示按钮<span class="wscp-sub">关闭后隐藏底部「提示」</span></span>'
      +         '<label class="wscp-sw"><input type="checkbox" data-role="hint" aria-label="提示按钮">'
      +         '<span class="wscp-track"></span><span class="wscp-knob"></span></label></div>'
      +     '</div>'
      +     '<div class="wscp-panel" data-panel="audio" hidden>'
      +       '<div class="wscp-sec">房间</div>'
      +       '<div class="wscp-pals" data-role="rooms">' + palCardHTML(ROOMS, 'room', function (k) {
                var r = null; ROOMS.forEach(function (x) { if (x[0] === k) r = x[2]; }); return r || ['#ccc'];
              }) + '</div>'
      +       '<div class="wscp-sec">水色</div>'
      +       '<div class="wscp-pals" data-role="liquids">' + palCardHTML(
                [['classic'], ['candy'], ['ocean']], 'liquid', liquidSwatches, ['经典', '糖果', '海洋']) + '</div>'
      +       '<div class="wscp-sec">音量</div>'
      +       volRowHTML('bgmVol', '音乐音量') + volRowHTML('sfxVol', '音效音量')
      +       '<div class="wscp-sec">自定义音效</div>'
      +       '<p class="wscp-note">上传本地音频替换对应音效（≤3MB），可试听、可恢复合成音。</p>'
      +       '<div data-role="cuelist"></div>'
      +       '<input type="file" class="wscp-file" accept="audio/*" data-role="sndfile">'
      +     '</div>'
      +     '<div class="wscp-panel" data-panel="data" hidden>'
      +       '<div class="wscp-stats">'
      +         '<div class="wscp-statcell"><div class="wscp-statnum" data-role="statLv">—</div><div class="wscp-statkey">当前关卡</div></div>'
      +         '<div class="wscp-statcell"><div class="wscp-statnum" data-role="statClears">—</div><div class="wscp-statkey">累计过关</div></div>'
      +         '<div class="wscp-statcell"><div class="wscp-statnum" data-role="statMoves">—</div><div class="wscp-statkey">累计步数</div></div>'
      +       '</div>'
      +       '<div class="wscp-btnrow"><button type="button" class="wscp-btn wscp-btn-warn" data-act="clearprog">清空进度</button></div>'
      +       '<p class="wscp-note">导出全部配置（含自定义音效）为 JSON 文件；导入会立即覆盖当前配置。</p>'
      +       '<div class="wscp-btnrow">'
      +         '<button type="button" class="wscp-btn" data-act="export">导出配置</button>'
      +         '<button type="button" class="wscp-btn" data-act="import">导入配置</button>'
      +       '</div>'
      +       '<div class="wscp-sec">恢复</div>'
      +       '<p class="wscp-note">把全部参数恢复为默认值（不影响关卡进度）。</p>'
      +       '<button type="button" class="wscp-btn wscp-btn-warn wscp-btn-block" data-act="resetcfg">恢复默认配置</button>'
      +       '<input type="file" class="wscp-file" accept="application/json,.json,text/plain" data-role="cfgfile">'
      +     '</div>'
      +   '</div>'
      +   '<footer class="wscp-foot"><button type="button" class="wscp-btn wscp-btn-primary wscp-done" data-act="done">完 成</button></footer>'
      +   '<div class="wscp-toast" data-role="toast" hidden></div>'
      + '</section>';

    ui.toast = root.querySelector('[data-role="toast"]');
    ui.tabs = Array.prototype.slice.call(root.querySelectorAll('.wscp-tab'));
    ui.panels = Array.prototype.slice.call(root.querySelectorAll('.wscp-panel'));
    ui.cuelist = root.querySelector('[data-role="cuelist"]');
    ui.hint = root.querySelector('[data-role="hint"]');
    ui.sndfile = root.querySelector('[data-role="sndfile"]');
    ui.cfgfile = root.querySelector('[data-role="cfgfile"]');
    ui.btnReset = root.querySelector('[data-act="resetcfg"]');
    ui.statLv = root.querySelector('[data-role="statLv"]');
    ui.statClears = root.querySelector('[data-role="statClears"]');
    ui.statMoves = root.querySelector('[data-role="statMoves"]');
    ui.vols = {}; ui.volv = {};
    ['bgmVol', 'sfxVol', 'maxColors', 'animSpeed'].forEach(function (k) {
      ui.vols[k] = root.querySelector('[data-vol="' + k + '"]');
      ui.volv[k] = root.querySelector('[data-volval="' + k + '"]');
    });
    buildCueList();
    root.addEventListener('click', onClick, false);
    root.addEventListener('input', onInput, false);
    root.addEventListener('change', onInputChange, false);
    document.addEventListener('keydown', onKey, false);
  }

  function buildCueList() {
    if (!ui.cuelist) return;
    ui.cuelist.innerHTML = cueList().map(function (p) { return cueRowHTML(p[0], p[1]); }).join('');
  }

  /* ---------------- 事件 ---------------- */
  function onClick(e) {
    var t = e.target;
    if (!(t instanceof Element)) return;
    if (t.closest('.wscp-mask') || t.closest('.wscp-close')) { close(); return; }
    var tab = t.closest('.wscp-tab');
    if (tab) { showTab(tab.getAttribute('data-tab')); return; }
    var seg = t.closest('[data-seg]');
    if (seg) {
      var key = seg.getAttribute('data-seg');
      var v = +seg.getAttribute('data-val');
      if (work && work[key] !== v) { work[key] = v; notify(); syncUI(); }
      return;
    }
    var room = t.closest('[data-room]');
    if (room) { if (work) { work.room = room.getAttribute('data-room'); notify(); syncUI(); } return; }
    var liq = t.closest('[data-liquid]');
    if (liq) { if (work) { work.liquidSet = liq.getAttribute('data-liquid'); notify(); syncUI(); } return; }
    var sact = t.closest('[data-sact]');
    if (sact) { doCueAct(sact.closest('[data-cue]'), sact.getAttribute('data-sact')); return; }
    var act = t.closest('[data-act]');
    if (act) doAct(act.getAttribute('data-act'));
  }

  function onInput(e) {
    if (!work) return;
    var t = e.target;
    if (t.classList && t.classList.contains('wscp-range')) {
      var k = t.getAttribute('data-vol');
      if (!k) return;
      if (k === 'bgmVol' || k === 'sfxVol') work[k] = clamp(t.value, 0, 1, work[k]);
      else if (k === 'maxColors') work[k] = clamp(t.value, 4, 10, work[k]);
      else if (k === 'animSpeed') work[k] = clamp(t.value, 0.5, 2, work[k]);
      notify();
      syncVol(k);
    }
  }

  function onInputChange(e) {
    if (!work) return;
    var t = e.target;
    if (t === ui.hint) { work.hintOn = !!ui.hint.checked; notify(); return; }
    if (t === ui.sndfile) {
      var f = ui.sndfile.files && ui.sndfile.files[0];
      ui.sndfile.value = '';
      handleSndFile(sndCue, f);
      return;
    }
    if (t === ui.cfgfile) {
      var cf = ui.cfgfile.files && ui.cfgfile.files[0];
      ui.cfgfile.value = '';
      handleCfgFile(cf);
      return;
    }
  }

  function onKey(e) {
    if (opened && (e.key === 'Escape' || e.keyCode === 27)) close();
  }

  /* ---------------- 音效自定义 ---------------- */
  function doCueAct(row, act) {
    if (!row || !work) return;
    var cue = row.getAttribute('data-cue');
    if (act === 'play') { previewCue(cue); return; }
    if (act === 'up') {
      sndCue = cue;
      ui.sndfile.click();
    } else if (act === 'reset') {
      delete work.audioOverrides[cue];
      notify(); syncUI();
      toast('「' + cueLabel(cue) + '」已恢复合成音');
    }
  }
  function previewCue(cue) {
    var A = window.WS && window.WS.AUDIO;
    if (A && typeof A.play === 'function') {
      try {
        if (typeof A.unlock === 'function') A.unlock();
        if (typeof A.setSFXVolume === 'function') A.setSFXVolume(clamp(work.sfxVol, 0, 1, 0.9));
        if (typeof A.applyOverrides === 'function') A.applyOverrides(deepCopy(work.audioOverrides || {}));
        A.play(cue);
      } catch (err) { toast('试听失败'); }
      return;
    }
    toast('音效模块未加载，无法试听');
  }
  function handleSndFile(cue, file) {
    if (!cue || !file) return;
    if (file.type && !/^audio\//.test(file.type)) { toast('请选择音频文件'); return; }
    if (file.size > 3 * 1024 * 1024) { toast('音频过大（超过 3MB）'); return; }
    var fr = new FileReader();
    fr.onload = function () {
      if (typeof fr.result !== 'string') { toast('音频读取失败'); return; }
      if (!work) return;
      work.audioOverrides[cue] = fr.result;
      notify(); syncUI();
      toast('「' + cueLabel(cue) + '」音效已更新');
    };
    fr.onerror = function () { toast('音频读取失败'); };
    try { fr.readAsDataURL(file); } catch (e) { toast('音频读取失败'); }
  }
  function handleCfgFile(file) {
    if (!file) return;
    var fr = new FileReader();
    fr.onload = function () {
      if (typeof fr.result !== 'string') { toast('导入失败：文件读取失败'); return; }
      var obj;
      try { obj = JSON.parse(fr.result); } catch (e) { toast('导入失败：不是有效的 JSON 文件'); return; }
      if (!obj || typeof obj !== 'object') { toast('导入失败：配置格式不正确'); return; }
      if (!work) return;
      work = sanitize(obj);
      notify(); syncUI();
      toast('配置已导入');
    };
    fr.onerror = function () { toast('导入失败：文件读取失败'); };
    try { fr.readAsText(file); } catch (e) { toast('导入失败'); }
  }
  function doExport() {
    try {
      var data = JSON.stringify(deepCopy(work), null, 2);
      var blob = new Blob([data], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = 'water-sort-config.json';
      document.body.appendChild(a); a.click();
      a.parentNode.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 800);
      toast('配置已导出');
    } catch (e) { toast('导出失败'); }
  }

  /* ---------------- 数据动作 ---------------- */
  function disarm() {
    armed = false;
    clearTimeout(armTimer);
    if (ui.btnReset) { ui.btnReset.textContent = '恢复默认配置'; ui.btnReset.classList.remove('wscp-armed'); }
  }
  function doAct(act) {
    if (!work) return;
    switch (act) {
      case 'done': close(); break;
      case 'export': doExport(); break;
      case 'import': ui.cfgfile.click(); break;
      case 'clearprog':
        if (opts && typeof opts.onClearProgress === 'function') {
          try { opts.onClearProgress(); } catch (e) {}
          toast('进度已清空');
        }
        break;
      case 'resetcfg':
        if (!armed) {
          armed = true;
          ui.btnReset.textContent = '再点一次，确认恢复默认';
          ui.btnReset.classList.add('wscp-armed');
          clearTimeout(armTimer);
          armTimer = setTimeout(disarm, 3000);
        } else {
          disarm();
          work = sanitize(defaultCfg());
          notify(); syncUI();
          toast('已恢复默认配置（进度不受影响）');
        }
        break;
    }
  }

  /* ---------------- 渲染同步 ---------------- */
  function showTab(tab) {
    for (var i = 0; i < TABS.length; i++) if (TABS[i][0] === tab) curTab = tab;
    ui.tabs.forEach(function (b) {
      var on = b.getAttribute('data-tab') === curTab;
      b.classList.toggle('wscp-on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    ui.panels.forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== curTab; });
  }

  function syncVol(k) {
    if (ui.vols[k]) ui.vols[k].value = String(work[k]);
    if (ui.volv[k]) {
      ui.volv[k].textContent = (k === 'bgmVol' || k === 'sfxVol') ? pct(work[k])
        : (k === 'animSpeed' ? work[k] + '×' : String(work[k]));
    }
  }

  function syncUI() {
    if (!root || !work) return;
    Object.keys(SEGS).forEach(function (key) {
      Array.prototype.forEach.call(root.querySelectorAll('[data-seg="' + key + '"]'), function (b) {
        b.classList.toggle('wscp-on', +b.getAttribute('data-val') === work[key]);
      });
    });
    ['bgmVol', 'sfxVol', 'maxColors', 'animSpeed'].forEach(syncVol);
    if (ui.hint) ui.hint.checked = !!work.hintOn;
    Array.prototype.forEach.call(root.querySelectorAll('[data-room]'), function (b) {
      b.classList.toggle('wscp-on', b.getAttribute('data-room') === work.room);
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-liquid]'), function (b) {
      b.classList.toggle('wscp-on', b.getAttribute('data-liquid') === work.liquidSet);
    });
    Array.prototype.forEach.call(root.querySelectorAll('.wscp-cue'), function (row) {
      var cue = row.getAttribute('data-cue');
      var custom = typeof work.audioOverrides[cue] === 'string' && work.audioOverrides[cue];
      var chip = row.querySelector('.wscp-chip');
      var rb = row.querySelector('[data-sact="reset"]');
      if (chip) chip.classList.toggle('wscp-hide', !custom);
      if (rb) rb.classList.toggle('wscp-hide', !custom);
    });
    var okAudio = hasAudio();
    Array.prototype.forEach.call(root.querySelectorAll('[data-sact="play"]'), function (b) {
      b.classList.toggle('wscp-hide', !okAudio);
    });
  }

  function renderStats() {
    var s = opts && typeof opts.stats === 'function' ? opts.stats() : null;
    if (ui.statLv) ui.statLv.textContent = s && s.lv ? s.lv : '—';
    if (ui.statClears) ui.statClears.textContent = s && s.clears != null ? s.clears : '—';
    if (ui.statMoves) ui.statMoves.textContent = s && s.moves != null ? s.moves : '—';
  }

  function toast(msg) {
    if (!ui.toast) return;
    ui.toast.textContent = msg;
    ui.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { if (ui.toast) ui.toast.hidden = true; }, 1800);
  }

  /* ---------------- 对外接口 ---------------- */
  function notify() {
    if (!work) return;
    var snap = deepCopy(work);
    if (opts && typeof opts.onChange === 'function') {
      try { opts.onChange(snap); } catch (e) {}
    }
  }

  function mount(o) {
    opts = o || {};
    ensureStyle();
    var host = opts.root || document.body;
    if (root && root.parentNode === host) return;
    if (root && root.parentNode) root.parentNode.removeChild(root);
    buildDOM();
    root.hidden = true;
    host.appendChild(root);
  }

  function open() {
    if (!root) mount(opts);
    var c = (opts && typeof opts.get === 'function') ? opts.get() : defaultCfg();
    work = sanitize(deepCopy(c));
    buildCueList();
    disarm();
    showTab('play');
    syncUI();
    renderStats();
    opened = true;
    root.hidden = false;
    root.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { root.classList.add('wscp-open'); });
    });
  }

  function close() {
    if (!root || !opened) return;
    opened = false;
    disarm();
    root.classList.remove('wscp-open');
    root.setAttribute('aria-hidden', 'true');
    setTimeout(function () { if (!opened && root) root.hidden = true; }, 300);
    if (opts && typeof opts.onClose === 'function') { try { opts.onClose(); } catch (e) {} }
  }

  function isOpen() { return opened; }

  return { mount: mount, open: open, close: close, isOpen: isOpen };
})();
