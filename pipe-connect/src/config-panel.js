/* =========================================================
 * 接水管 · 游戏内设置面板 — PC.CONFIG_PANEL
 * 契约接口：mount(el) / open(tab?) / close() / isOpen()
 *           onChange(cb) / onClearBest(cb) / setBest({score,level})
 * - open() 时深拷贝 window.PC.cfg 为 work（缺失则用内置 defaultCfg）
 * - 任何编辑改 work 后立即 onChange(完整深拷贝快照)
 * - 永不直接读写 localStorage；PC.ART / PC.AUDIO 缺失时全部兜底
 * - 样式内联注入，类名前缀 pccp-
 * - 视觉：白底 #F7FBFE｜藏青 #2E3450 标题与 2px 边框｜主绿 #3FAE8C
 *   圆角 ≤10px、扁平无渐变无阴影海；移动端底部滑入 / ≥700px 右侧滑入
 * ======================================================= */
window.PC = window.PC || {};
PC.CONFIG_PANEL = (function () {
  'use strict';

  /* ---------------- 内置默认配置（schema 兜底，与契约对齐） ---------------- */
  function defaultCfg() {
    return {
      timeBase: 60, timeMin: 30,
      baseScore: 100, levelBonus: 20, timeBonus: 5,
      palette: 'classic',            // 'classic' | 'mint' | 'sand'
      bgmVol: 0.35, sfxVol: 0.8,     // 0..1
      aiDemo: false,                 // 开局自动 AI 演示
      sfxOverrides: {}               // {cue: dataURL}
    };
  }

  /* 玩法数值规格（min/max/step + 文案） */
  var NUMSPEC = {
    timeBase:   { min: 20, max: 180, step: 5,  label: '基础限时（秒）', sub: '第 1 关的倒计时秒数，之后每关递减' },
    timeMin:    { min: 10, max: 120, step: 5,  label: '保底限时（秒）', sub: '倒计时随关卡递减也不低于此值' },
    baseScore:  { min: 10, max: 500, step: 10, label: '过关基础分',     sub: '每关固定得分部分' },
    levelBonus: { min: 0,  max: 100, step: 5,  label: '关卡加成分',     sub: '每升 1 关额外增加的分数' },
    timeBonus:  { min: 0,  max: 20,  step: 1,  label: '剩时加成分',     sub: '过关后每剩余 1 秒的加分' }
  };

  /* 配色三套（swatch 兜底色；ART 就绪时优先取 ART.palettes 实色） */
  var PALS = [
    ['classic', '经典', ['#6DBAE4', '#EEF0F6', '#E9E9BE', '#58B7EC']],
    ['mint',    '薄荷', ['#7BC8A9', '#D6F0E3', '#EADFAE', '#4FBFA0']],
    ['sand',    '暖沙', ['#E7CFA3', '#F5EEDF', '#CE8660', '#D9A96F']]
  ];

  /* cue 清单（AUDIO.names 就绪时以其为准） */
  var CUE_TABLE = [
    ['rotate', '旋转'], ['flow', '灌水'], ['splash', '出水花'],
    ['win', '过关'], ['lose', '失败'], ['tick', '倒计时'],
    ['click', '点击'], ['start', '开局'], ['bgm', '背景音乐']
  ];

  var TABS = [['play', '玩法'], ['audio', '音画'], ['data', '数据']];
  var TAB_ALIAS = {
    'play': 'play', 'game': 'play', '玩法': 'play',
    'audio': 'audio', 'sound': 'audio', '音画': 'audio',
    'data': 'data', '数据': 'data'
  };

  var ICON_SVG = '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">'
    + '<g fill="none" stroke="#2E3450" stroke-width="2" stroke-linecap="round"><path d="M3 5h14M3 10h14M3 15h14"/></g>'
    + '<circle cx="7" cy="5" r="2.5" fill="#3FAE8C" stroke="#2E3450" stroke-width="2"/>'
    + '<circle cx="13" cy="10" r="2.5" fill="#3FAE8C" stroke="#2E3450" stroke-width="2"/>'
    + '<circle cx="8" cy="15" r="2.5" fill="#3FAE8C" stroke="#2E3450" stroke-width="2"/>'
    + '</svg>';

  /* ---------------- 工具函数 ---------------- */
  function deepCopy(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function clampInt(v, min, max, fb) {
    var n = Math.round(Number(v));
    if (!isFinite(n)) return fb;
    return Math.min(max, Math.max(min, n));
  }
  function clamp01(v, fb) { var n = Number(v); return isFinite(n) ? Math.min(1, Math.max(0, n)) : fb; }
  function pct(v) { return Math.round(clamp01(v, 0) * 100) + '%'; }
  function cueLabel(id) {
    for (var i = 0; i < CUE_TABLE.length; i++) if (CUE_TABLE[i][0] === id) return CUE_TABLE[i][1];
    return id;
  }
  function cueList() {
    try {
      var A = window.PC && window.PC.AUDIO;
      var names = A && A.names;
      if (names && names.length) {
        return names.map(function (n) { return [n, cueLabel(n)]; });
      }
    } catch (e) { /* 兜底 */ }
    return CUE_TABLE.slice();
  }
  function hasAudio() {
    try { return !!(window.PC && window.PC.AUDIO && typeof window.PC.AUDIO.play === 'function'); }
    catch (e) { return false; }
  }

  /* 按契约 schema 清洗补全（timeMin 恒不超过 timeBase） */
  function sanitize(raw) {
    var d = defaultCfg();
    if (!raw || typeof raw !== 'object') return d;
    d.timeBase   = clampInt(raw.timeBase,   20, 180, d.timeBase);
    d.timeMin    = clampInt(raw.timeMin,    10, 120, d.timeMin);
    d.baseScore  = clampInt(raw.baseScore,  10, 500, d.baseScore);
    d.levelBonus = clampInt(raw.levelBonus, 0, 100, d.levelBonus);
    d.timeBonus  = clampInt(raw.timeBonus,  0, 20,  d.timeBonus);
    if (d.timeMin > d.timeBase) d.timeMin = d.timeBase;
    if (raw.palette === 'classic' || raw.palette === 'mint' || raw.palette === 'sand') d.palette = raw.palette;
    d.bgmVol = clamp01(raw.bgmVol, d.bgmVol);
    d.sfxVol = clamp01(raw.sfxVol, d.sfxVol);
    if (typeof raw.aiDemo === 'boolean') d.aiDemo = raw.aiDemo;
    if (raw.sfxOverrides && typeof raw.sfxOverrides === 'object') {
      var ov = {};
      cueList().forEach(function (p) {
        var v = raw.sfxOverrides[p[0]];
        if (typeof v === 'string' && v) ov[p[0]] = v;
      });
      d.sfxOverrides = ov;
    }
    return d;
  }

  /* ---------------- 模块状态 ---------------- */
  var host = null, root = null, ui = {};
  var work = null;              // 工作副本（深拷贝），编辑立即 notify
  var cbs = [];                 // onChange 回调
  var cbsBest = [];             // onClearBest 回调（独立通道）
  var best = null;              // 外部喂入的最佳纪录 {score,level}
  var opened = false;
  var curTab = 'play';
  var armed = false, armTimer = 0, toastTimer = 0;

  /* ---------------- 样式（白底 + 藏青 2px 边框 + 主绿，扁平） ---------------- */
  var CSS = [
    '.pccp-root{position:fixed;inset:0;z-index:9990;font-family:system-ui,-apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;color:#2E3450;}',
    '.pccp-root,.pccp-root *{box-sizing:border-box;}',
    '.pccp-root[hidden]{display:none!important;}',
    '.pccp-mask{position:absolute;inset:0;background:rgba(46,52,80,.45);opacity:0;transition:opacity .22s ease;}',
    '.pccp-root.pccp-open .pccp-mask{opacity:1;}',
    '.pccp-drawer{position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column;max-height:88%;',
      'background:#F7FBFE;border:2px solid #2E3450;border-bottom:none;border-radius:10px 10px 0 0;',
      'transform:translateY(105%);transition:transform .28s cubic-bezier(.22,.9,.3,1);}',
    '.pccp-root.pccp-open .pccp-drawer{transform:translateY(0);}',
    '.pccp-head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:2px solid #2E3450;flex:0 0 auto;}',
    '.pccp-title{display:flex;align-items:center;gap:8px;font-size:17px;font-weight:900;letter-spacing:3px;flex:1;min-width:0;}',
    '.pccp-title svg{flex:0 0 auto;display:block;}',
    '.pccp-close{width:40px;height:40px;flex:0 0 auto;border:2px solid #2E3450;border-radius:8px;background:#FFFFFF;',
      'color:#2E3450;font:900 15px/1 system-ui;cursor:pointer;}',
    '.pccp-close:active{background:#E8EEF2;}',
    '.pccp-tabs{display:flex;gap:8px;padding:10px 14px 0;flex:0 0 auto;}',
    '.pccp-tab{flex:1;height:40px;border:2px solid #2E3450;border-radius:8px;background:#FFFFFF;color:#2E3450;',
      'font:700 14px/1 system-ui;cursor:pointer;letter-spacing:2px;text-indent:2px;}',
    '.pccp-tab.pccp-on{background:#2E3450;color:#F7FBFE;}',
    '.pccp-body{flex:1 1 auto;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:2px 14px 12px;}',
    '.pccp-panel[hidden]{display:none!important;}',
    '.pccp-note{margin:8px 0 2px;font-size:12px;line-height:1.7;color:#5A6377;}',
    '.pccp-sec{display:inline-block;margin:14px 0 2px;padding:2px 8px;background:#2E3450;color:#F7FBFE;',
      'font-size:11px;font-weight:700;letter-spacing:2px;border-radius:4px;}',
    '.pccp-numrow{padding:8px 0 0;}',
    '.pccp-numrow + .pccp-numrow,.pccp-row + .pccp-row,.pccp-numrow + .pccp-row,.pccp-row + .pccp-numrow,',
      '.pccp-vol + .pccp-vol{border-top:1px dashed #B9C2CF;margin-top:8px;}',
    '.pccp-numhead,.pccp-row{display:flex;align-items:center;justify-content:space-between;gap:10px;}',
    '.pccp-row{min-height:52px;padding:8px 0;}',
    '.pccp-lab{font-size:14px;font-weight:700;line-height:1.4;}',
    '.pccp-sub{display:block;font-size:11px;font-weight:400;color:#5A6377;margin-top:2px;}',
    '.pccp-num{width:76px;height:36px;flex:0 0 auto;border:2px solid #2E3450;border-radius:8px;background:#FFFFFF;',
      'color:#2E3450;font:700 15px/1 system-ui;text-align:center;}',
    '.pccp-num::-webkit-outer-spin-button,.pccp-num::-webkit-inner-spin-button{-webkit-appearance:none;margin:0;}',
    '.pccp-num{-moz-appearance:textfield;appearance:textfield;}',
    '.pccp-range{-webkit-appearance:none;appearance:none;display:block;width:100%;height:34px;margin:0;padding:0;',
      'background:transparent;cursor:pointer;}',
    '.pccp-range::-webkit-slider-runnable-track{height:10px;border:2px solid #2E3450;border-radius:6px;background:#E8EEF2;}',
    '.pccp-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:22px;height:22px;margin-top:-8px;',
      'border:2px solid #2E3450;border-radius:8px;background:#3FAE8C;}',
    '.pccp-range::-moz-range-track{height:10px;border:2px solid #2E3450;border-radius:6px;background:#E8EEF2;}',
    '.pccp-range::-moz-range-thumb{width:18px;height:18px;border:2px solid #2E3450;border-radius:8px;background:#3FAE8C;}',
    '.pccp-sw{position:relative;width:52px;height:30px;flex:0 0 auto;cursor:pointer;display:inline-block;}',
    '.pccp-sw input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer;z-index:2;}',
    '.pccp-track{position:absolute;inset:0;border:2px solid #2E3450;border-radius:8px;background:#DDE6EC;transition:background .15s ease;}',
    '.pccp-knob{position:absolute;top:3px;left:3px;width:20px;height:20px;border:2px solid #2E3450;border-radius:6px;',
      'background:#FFFFFF;transition:left .15s ease;pointer-events:none;}',
    '.pccp-sw input:checked ~ .pccp-track{background:#3FAE8C;}',
    '.pccp-sw input:checked ~ .pccp-knob{left:25px;}',
    '.pccp-pals{display:flex;gap:8px;margin:8px 0 2px;}',
    '.pccp-pal{flex:1;min-width:0;padding:8px 4px 7px;border:2px solid #B9C2CF;border-radius:10px;background:#FFFFFF;',
      'cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;}',
    '.pccp-pal.pccp-on{border-color:#3FAE8C;background:#EAF6F1;}',
    '.pccp-palsw{display:flex;width:100%;height:20px;border:2px solid #2E3450;border-radius:6px;overflow:hidden;}',
    '.pccp-palsw i{flex:1;height:100%;}',
    '.pccp-palname{font-size:12px;font-weight:700;}',
    '.pccp-vol{padding:8px 0 0;}',
    '.pccp-volhead{display:flex;align-items:center;justify-content:space-between;gap:10px;}',
    '.pccp-volval{font:italic 900 14px/1 system-ui;color:#3FAE8C;}',
    '.pccp-cue{display:flex;align-items:center;gap:6px;min-height:46px;padding:6px 0;}',
    '.pccp-cue + .pccp-cue{border-top:1px dashed #B9C2CF;}',
    '.pccp-cuename{flex:1;min-width:0;font-size:14px;font-weight:700;display:flex;align-items:center;gap:6px;flex-wrap:wrap;}',
    '.pccp-chip{font-size:10px;font-weight:700;line-height:1;color:#3FAE8C;border:1px solid #3FAE8C;border-radius:4px;',
      'padding:2px 4px;letter-spacing:1px;}',
    '.pccp-btn{height:40px;padding:0 14px;border:2px solid #2E3450;border-radius:8px;background:#FFFFFF;',
      'color:#2E3450;font:700 13px/1 system-ui;cursor:pointer;}',
    '.pccp-btn:active{background:#E8EEF2;}',
    '.pccp-btn-primary{background:#3FAE8C;color:#FFFFFF;}',
    '.pccp-btn-primary:active{background:#37997B;}',
    '.pccp-btn-warn{color:#C24E42;border-color:#C24E42;}',
    '.pccp-btn-warn:active{background:#F9ECEA;}',
    '.pccp-btn.pccp-armed{background:#C24E42;border-color:#2E3450;color:#FFFFFF;}',
    '.pccp-cue .pccp-btn{height:32px;padding:0 10px;font-size:12px;flex:0 0 auto;}',
    '.pccp-best{display:flex;border:2px solid #2E3450;border-radius:10px;background:#FFFFFF;margin:10px 0 2px;overflow:hidden;}',
    '.pccp-bestcell{flex:1;min-width:0;padding:12px 6px 10px;text-align:center;}',
    '.pccp-bestcell + .pccp-bestcell{border-left:2px solid #2E3450;}',
    '.pccp-bestnum{font:italic 900 24px/1.2 system-ui;color:#2E3450;}',
    '.pccp-bestkey{font-size:11px;color:#5A6377;letter-spacing:2px;margin-top:3px;}',
    '.pccp-btnrow{display:flex;gap:8px;margin:10px 0 2px;}',
    '.pccp-btnrow .pccp-btn{flex:1;min-width:0;padding:0 6px;}',
    '.pccp-btn-block{display:block;width:100%;}',
    '.pccp-div{height:0;border-top:2px dashed #B9C2CF;margin:12px 0 2px;}',
    '.pccp-foot{flex:0 0 auto;padding:10px 14px calc(10px + env(safe-area-inset-bottom));border-top:2px solid #2E3450;}',
    '.pccp-done{width:100%;height:44px;font-size:15px;letter-spacing:8px;text-indent:8px;}',
    '.pccp-toast{position:absolute;left:50%;bottom:calc(70px + env(safe-area-inset-bottom));transform:translateX(-50%);',
      'z-index:6;max-width:86%;background:#2E3450;color:#F7FBFE;font-size:13px;line-height:1.4;padding:8px 14px;',
      'border-radius:8px;pointer-events:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.pccp-toast[hidden]{display:none!important;}',
    '.pccp-file{display:none!important;}',
    '.pccp-hide{display:none!important;}',
    '.pccp-root button:focus-visible,.pccp-root input:focus-visible{outline:3px solid #3FAE8C;outline-offset:2px;}',
    '@media (min-width:700px){.pccp-drawer{left:auto;top:0;width:400px;max-height:none;height:100%;',
      'border-bottom:2px solid #2E3450;border-radius:10px 0 0 10px;transform:translateX(105%);}',
      '.pccp-root.pccp-open .pccp-drawer{transform:translateX(0);}}'
  ].join('\n');

  function ensureStyle() {
    if (document.getElementById('pccp-style')) return;
    var st = document.createElement('style');
    st.id = 'pccp-style';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  /* ---------------- HTML 片段 ---------------- */
  function numRowHTML(key) {
    var s = NUMSPEC[key];
    return '<div class="pccp-numrow">'
      + '<div class="pccp-numhead">'
      + '<span class="pccp-lab">' + s.label + '<span class="pccp-sub">' + s.sub + '</span></span>'
      + '<input type="number" class="pccp-num" data-num="' + key + '" min="' + s.min
      + '" max="' + s.max + '" step="' + s.step + '" aria-label="' + s.label + '">'
      + '</div>'
      + '<input type="range" class="pccp-range" data-range="' + key + '" min="' + s.min
      + '" max="' + s.max + '" step="' + s.step + '" aria-label="' + s.label + '滑杆">'
      + '</div>';
  }
  function volRowHTML(k, label) {
    return '<div class="pccp-vol">'
      + '<span class="pccp-volhead"><span class="pccp-lab">' + label + '</span>'
      + '<span class="pccp-volval" data-volval="' + k + '">0%</span></span>'
      + '<input type="range" class="pccp-range" data-vol="' + k + '" min="0" max="1" step="0.05" aria-label="' + label + '">'
      + '</div>';
  }
  function cueRowHTML(cue, label) {
    return '<div class="pccp-cue" data-cue="' + cue + '">'
      + '<span class="pccp-cuename">' + label + '<span class="pccp-chip pccp-hide">已自定义</span></span>'
      + '<button type="button" class="pccp-btn pccp-hide" data-sact="play">试听</button>'
      + '<button type="button" class="pccp-btn" data-sact="up">换音</button>'
      + '<button type="button" class="pccp-btn pccp-hide" data-sact="reset">恢复</button>'
      + '</div>';
  }
  function panelPlayHTML() {
    var rows = '';
    Object.keys(NUMSPEC).forEach(function (k) { rows += numRowHTML(k); });
    return '<p class="pccp-note">过关得分 = 基础分 + (关卡−1)×关卡加分 + 剩余秒×剩时加分；'
      + '倒计时随关卡每关递减 4 秒。改动即时生效。</p>'
      + rows
      + '<div class="pccp-row">'
      + '<span class="pccp-lab">自动 AI 演示<span class="pccp-sub">开局自动演示通关拧法，便于观察与测试</span></span>'
      + '<label class="pccp-sw"><input type="checkbox" data-role="aidemo" aria-label="自动 AI 演示">'
      + '<span class="pccp-track"></span><span class="pccp-knob"></span></label>'
      + '</div>';
  }
  function panelAudioHTML() {
    return '<p class="pccp-note">整套装管配色由游戏即时应用；音效可上传本地音频替换（转存 dataURL），单条可恢复合成音。</p>'
      + '<div class="pccp-sec">配色</div>'
      + '<div class="pccp-pals" data-role="pals"></div>'
      + '<div class="pccp-sec">音量</div>'
      + volRowHTML('bgmVol', '音乐音量')
      + volRowHTML('sfxVol', '音效音量')
      + '<div class="pccp-sec">自定义音效</div>'
      + '<div data-role="cuelist"></div>'
      + '<input type="file" class="pccp-file" accept="audio/*" data-role="sndfile">';
  }
  function panelDataHTML() {
    return '<p class="pccp-note">最佳纪录由游戏实时同步显示；清除纪录只影响纪录本身，不改配置。</p>'
      + '<div class="pccp-best">'
      + '<div class="pccp-bestcell"><div class="pccp-bestnum" data-role="bestscore">—</div>'
      + '<div class="pccp-bestkey">最佳总分</div></div>'
      + '<div class="pccp-bestcell"><div class="pccp-bestnum" data-role="bestlevel">—</div>'
      + '<div class="pccp-bestkey">最高关卡</div></div>'
      + '</div>'
      + '<div class="pccp-btnrow"><button type="button" class="pccp-btn pccp-btn-warn" data-act="clearbest">清除纪录</button></div>'
      + '<div class="pccp-div"></div>'
      + '<div class="pccp-sec">备份</div>'
      + '<p class="pccp-note">导出全部配置（含自定义音效）为 JSON 文件；导入会立即覆盖当前配置。</p>'
      + '<div class="pccp-btnrow">'
      + '<button type="button" class="pccp-btn" data-act="export">导出配置</button>'
      + '<button type="button" class="pccp-btn" data-act="import">导入配置</button>'
      + '</div>'
      + '<div class="pccp-sec">恢复</div>'
      + '<p class="pccp-note">把全部参数恢复为默认值（不影响最佳纪录）。</p>'
      + '<button type="button" class="pccp-btn pccp-btn-warn pccp-btn-block" data-act="resetcfg">恢复默认配置</button>'
      + '<input type="file" class="pccp-file" accept="application/json,.json,text/plain" data-role="cfgfile">';
  }

  /* 配色卡：ART.palettes 就绪时取实色，否则用兜底色 */
  function palSwatches(name, fb) {
    try {
      var P = window.PC && window.PC.ART && window.PC.ART.palettes;
      var p = P && P[name];
      if (p && typeof p === 'object') {
        return [p.sky || fb[0], p.pipe || fb[1], p.flange || fb[2], p.water || p.waterFlow || fb[3]];
      }
    } catch (e) { /* 兜底 */ }
    return fb;
  }
  function buildPalOptions() {
    if (!ui.pals) return;
    ui.pals.innerHTML = PALS.map(function (p) {
      var sw = palSwatches(p[0], p[2]).map(function (c) {
        return '<i style="background:' + c + '"></i>';
      }).join('');
      return '<button type="button" class="pccp-pal" data-pal="' + p[0] + '">'
        + '<span class="pccp-palsw">' + sw + '</span>'
        + '<span class="pccp-palname">' + p[1] + '</span></button>';
    }).join('');
  }
  function buildCueList() {
    if (!ui.cuelist) return;
    ui.cuelist.innerHTML = cueList().map(function (p) {
      return cueRowHTML(p[0], p[1]);
    }).join('');
  }

  function buildDOM() {
    root = document.createElement('div');
    root.className = 'pccp-root';
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = ''
      + '<div class="pccp-mask"></div>'
      + '<section class="pccp-drawer" role="dialog" aria-modal="true" aria-label="游戏设置">'
      +   '<header class="pccp-head">'
      +     '<div class="pccp-title">' + ICON_SVG + '设置</div>'
      +     '<button type="button" class="pccp-close" aria-label="关闭设置">✕</button>'
      +   '</header>'
      +   '<nav class="pccp-tabs" role="tablist">'
      +     TABS.map(function (t) {
              return '<button type="button" class="pccp-tab" role="tab" data-tab="' + t[0] + '">' + t[1] + '</button>';
            }).join('')
      +   '</nav>'
      +   '<div class="pccp-body">'
      +     '<div class="pccp-panel" data-panel="play">' + panelPlayHTML() + '</div>'
      +     '<div class="pccp-panel" data-panel="audio" hidden>' + panelAudioHTML() + '</div>'
      +     '<div class="pccp-panel" data-panel="data" hidden>' + panelDataHTML() + '</div>'
      +   '</div>'
      +   '<footer class="pccp-foot">'
      +     '<button type="button" class="pccp-btn pccp-btn-primary pccp-done" data-act="done">完成</button>'
      +   '</footer>'
      +   '<div class="pccp-toast" data-role="toast" hidden></div>'
      + '</section>';

    ui.mask = root.querySelector('.pccp-mask');
    ui.toast = root.querySelector('[data-role="toast"]');
    ui.tabs = Array.prototype.slice.call(root.querySelectorAll('.pccp-tab'));
    ui.panels = Array.prototype.slice.call(root.querySelectorAll('.pccp-panel'));
    ui.pals = root.querySelector('[data-role="pals"]');
    ui.cuelist = root.querySelector('[data-role="cuelist"]');
    ui.aidemo = root.querySelector('[data-role="aidemo"]');
    ui.sndfile = root.querySelector('[data-role="sndfile"]');
    ui.cfgfile = root.querySelector('[data-role="cfgfile"]');
    ui.btnReset = root.querySelector('[data-act="resetcfg"]');
    ui.bestScore = root.querySelector('[data-role="bestscore"]');
    ui.bestLevel = root.querySelector('[data-role="bestlevel"]');
    ui.nums = {}; ui.ranges = {}; ui.vols = {}; ui.volv = {};
    Object.keys(NUMSPEC).forEach(function (k) {
      ui.nums[k] = root.querySelector('[data-num="' + k + '"]');
      ui.ranges[k] = root.querySelector('[data-range="' + k + '"]');
    });
    ['bgmVol', 'sfxVol'].forEach(function (k) {
      ui.vols[k] = root.querySelector('[data-vol="' + k + '"]');
      ui.volv[k] = root.querySelector('[data-volval="' + k + '"]');
    });

    buildPalOptions();
    buildCueList();

    root.addEventListener('click', onClick, false);
    root.addEventListener('input', onInput, false);
    root.addEventListener('change', onInputChange, false);
    document.addEventListener('keydown', onKey, false);
  }

  /* ---------------- 事件分发 ---------------- */
  function onClick(e) {
    var t = e.target;
    if (!(t instanceof Element)) return;
    if (t.closest('.pccp-mask') || t.closest('.pccp-close')) { close(); return; }
    var tab = t.closest('.pccp-tab');
    if (tab) { showTab(tab.getAttribute('data-tab')); return; }
    var pal = t.closest('[data-pal]');
    if (pal) {
      if (work) {
        var n = pal.getAttribute('data-pal');
        if (work.palette !== n) { work.palette = n; notify(); syncUI(); }
      }
      return;
    }
    var sact = t.closest('[data-sact]');
    if (sact) { doCueAct(sact.closest('[data-cue]'), sact.getAttribute('data-sact')); return; }
    var act = t.closest('[data-act]');
    if (act) doAct(act.getAttribute('data-act'));
  }

  function onInput(e) {
    if (!work) return;
    var t = e.target;
    if (t.classList && t.classList.contains('pccp-range')) {
      var vk = t.getAttribute('data-vol');
      if (vk) {                       // 音量滑杆
        work[vk] = clamp01(t.value, work[vk]);
        if (ui.volv[vk]) ui.volv[vk].textContent = pct(work[vk]);
        notify();
        return;
      }
      var rk = t.getAttribute('data-range');
      if (rk) commitRange(rk, t.value);   // 玩法滑杆（与数字输入联动）
      return;
    }
    if (t.hasAttribute && t.hasAttribute('data-num')) commitNum(t, true);
  }

  function onInputChange(e) {
    if (!work) return;
    var t = e.target;
    if (t === ui.aidemo) { work.aiDemo = !!ui.aidemo.checked; notify(); return; }
    if (t === ui.sndfile) {
      var f = ui.sndfile.files && ui.sndfile.files[0];
      var cue = ui.sndfile.getAttribute('data-cue');
      ui.sndfile.value = '';
      handleSndFile(cue, f);
      return;
    }
    if (t === ui.cfgfile) {
      var cf = ui.cfgfile.files && ui.cfgfile.files[0];
      ui.cfgfile.value = '';
      handleCfgFile(cf);
      return;
    }
    if (t.hasAttribute && t.hasAttribute('data-num')) commitNum(t, false);
  }

  function onKey(e) {
    if (opened && (e.key === 'Escape' || e.keyCode === 27)) close();
  }

  /* ---------------- 玩法数值：滑杆 + 数字输入联动 ---------------- */
  function crossClamp() { if (work && work.timeMin > work.timeBase) work.timeMin = work.timeBase; }
  function syncNum(key) {
    var inp = ui.nums[key];
    if (inp && document.activeElement !== inp) inp.value = String(work[key]);
    var rg = ui.ranges[key];
    if (rg && document.activeElement !== rg) rg.value = String(work[key]);
  }
  function commitRange(key, val) {
    var s = NUMSPEC[key];
    if (!s) return;
    var v = clampInt(val, s.min, s.max, work[key]);
    if (work[key] !== v) { work[key] = v; crossClamp(); notify(); }
    syncNum(key);
    if (key === 'timeBase') syncNum('timeMin');
  }
  function commitNum(input, soft) {
    if (!input || !work) return;
    var key = input.getAttribute('data-num');
    var s = NUMSPEC[key];
    if (!s) return;
    var raw = parseFloat(input.value);
    if (!isFinite(raw)) {           // 输入中为空：等待；失焦时回写当前值
      if (!soft) syncNum(key);
      return;
    }
    var v = clampInt(raw, s.min, s.max, work[key]);
    if (work[key] !== v) { work[key] = v; crossClamp(); notify(); }
    if (soft) {                     // 输入中：滑杆即时跟随（不改写正在输入的框）
      var rg = ui.ranges[key];
      if (rg) rg.value = String(work[key]);
      if (key === 'timeBase') syncNum('timeMin');
    } else {                        // 失焦/确认：输入框与滑杆一律回写 work 实际值
      if (ui.nums[key]) ui.nums[key].value = String(work[key]);
      if (ui.ranges[key]) ui.ranges[key].value = String(work[key]);
      if (key === 'timeBase') syncNum('timeMin');
    }
  }

  /* ---------------- 音效自定义 ---------------- */
  function doCueAct(row, act) {
    if (!row || !work) return;
    var cue = row.getAttribute('data-cue');
    if (act === 'play') { previewCue(cue); return; }
    if (act === 'up') {
      ui.sndfile.setAttribute('data-cue', cue);
      ui.sndfile.click();
    } else if (act === 'reset') {
      delete work.sfxOverrides[cue];
      notify(); syncUI();
      toast('「' + cueLabel(cue) + '」已恢复合成音');
    }
  }

  function previewCue(cue) {
    var A = window.PC && window.PC.AUDIO;
    if (A && typeof A.play === 'function') {
      try {
        if (typeof A.unlock === 'function') A.unlock();
        if (typeof A.setSFXVolume === 'function') A.setSFXVolume(clamp01(work.sfxVol, 0.8));
        if (cue === 'bgm' && typeof A.setBGMVolume === 'function') A.setBGMVolume(clamp01(work.bgmVol, 0.35));
        if (typeof A.applyOverrides === 'function') A.applyOverrides(deepCopy(work.sfxOverrides || {}));
        A.play(cue);
      } catch (err) { toast('试听失败'); }
      return;
    }
    toast('音效模块未加载，无法试听');
  }

  function fileToDataURL(file, cb) {
    if (!file) { cb(null); return; }
    var fr = new FileReader();
    fr.onload = function () { cb(typeof fr.result === 'string' ? fr.result : null); };
    fr.onerror = function () { cb(null); };
    try { fr.readAsDataURL(file); } catch (e) { cb(null); }
  }
  function fileToText(file, cb) {
    if (!file) { cb(null); return; }
    var fr = new FileReader();
    fr.onload = function () { cb(typeof fr.result === 'string' ? fr.result : null); };
    fr.onerror = function () { cb(null); };
    try { fr.readAsText(file); } catch (e) { cb(null); }
  }

  function handleSndFile(cue, file) {
    if (!cue || !file) return;
    if (file.type && !/^audio\//.test(file.type)) { toast('请选择音频文件'); return; }
    if (file.size > 4 * 1024 * 1024) { toast('音频过大（超过 4MB）'); return; }
    fileToDataURL(file, function (url) {
      if (!url) { toast('音频读取失败'); return; }
      if (!work) return;
      work.sfxOverrides[cue] = url;
      notify(); syncUI();
      toast('「' + cueLabel(cue) + '」音效已更新');
    });
  }

  function handleCfgFile(file) {
    if (!file) return;
    fileToText(file, function (txt) {
      if (txt == null) { toast('导入失败：文件读取失败'); return; }
      var obj;
      try { obj = JSON.parse(txt); } catch (e) { toast('导入失败：不是有效的 JSON 文件'); return; }
      if (!obj || typeof obj !== 'object') { toast('导入失败：配置格式不正确'); return; }
      if (!work) return;
      work = sanitize(obj);
      notify(); syncUI();
      toast('配置已导入');
    });
  }

  function doExport() {
    try {
      var data = JSON.stringify(deepCopy(work), null, 2);
      var blob = new Blob([data], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'pc-config.json';
      document.body.appendChild(a);
      a.click();
      a.parentNode.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 800);
      toast('配置已导出');
    } catch (e) { toast('导出失败'); }
  }

  /* ---------------- 数据页动作 ---------------- */
  function disarm() {
    armed = false;
    clearTimeout(armTimer);
    if (ui.btnReset) {
      ui.btnReset.textContent = '恢复默认配置';
      ui.btnReset.classList.remove('pccp-armed');
    }
  }
  function doAct(act) {
    if (!work) return;
    switch (act) {
      case 'done': close(); break;
      case 'export': doExport(); break;
      case 'import': ui.cfgfile.click(); break;
      case 'clearbest':
        cbsBest.forEach(function (cb) {
          try { cb(); } catch (e) { /* 回调异常不影响面板 */ }
        });
        toast('已通知游戏清除最佳纪录');
        break;
      case 'resetcfg':
        if (!armed) {               // 二次确认：3 秒内再点一次
          armed = true;
          if (ui.btnReset) {
            ui.btnReset.textContent = '再点一次，确认恢复默认';
            ui.btnReset.classList.add('pccp-armed');
          }
          clearTimeout(armTimer);
          armTimer = setTimeout(disarm, 3000);
        } else {
          disarm();
          work = sanitize(defaultCfg());
          notify(); syncUI();
          toast('已恢复默认配置（纪录不受影响）');
        }
        break;
    }
  }

  /* ---------------- 渲染同步 ---------------- */
  function showTab(tab) {
    if (typeof tab === 'string' && tab && TAB_ALIAS[tab]) curTab = TAB_ALIAS[tab];
    ui.tabs.forEach(function (b) {
      var on = b.getAttribute('data-tab') === curTab;
      b.classList.toggle('pccp-on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    ui.panels.forEach(function (p) {
      p.hidden = p.getAttribute('data-panel') !== curTab;
    });
  }

  function syncUI() {
    if (!root || !work) return;
    Object.keys(NUMSPEC).forEach(function (k) { syncNum(k); });
    if (ui.aidemo) ui.aidemo.checked = !!work.aiDemo;
    Array.prototype.forEach.call(root.querySelectorAll('.pccp-pal'), function (b) {
      var on = b.getAttribute('data-pal') === work.palette;
      b.classList.toggle('pccp-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    ['bgmVol', 'sfxVol'].forEach(function (k) {
      if (ui.vols[k]) ui.vols[k].value = String(clamp01(work[k], 0));
      if (ui.volv[k]) ui.volv[k].textContent = pct(work[k]);
    });
    Array.prototype.forEach.call(root.querySelectorAll('.pccp-cue'), function (row) {
      var cue = row.getAttribute('data-cue');
      var custom = typeof work.sfxOverrides[cue] === 'string' && work.sfxOverrides[cue];
      var chip = row.querySelector('.pccp-chip');
      var rb = row.querySelector('[data-sact="reset"]');
      if (chip) chip.classList.toggle('pccp-hide', !custom);
      if (rb) rb.classList.toggle('pccp-hide', !custom);
    });
    var okAudio = hasAudio();
    Array.prototype.forEach.call(root.querySelectorAll('[data-sact="play"]'), function (b) {
      b.classList.toggle('pccp-hide', !okAudio);
    });
  }

  function renderBest() {
    if (!ui.bestScore) return;
    var s = best && typeof best.score === 'number' && isFinite(best.score) ? String(best.score) : '—';
    var l = best && typeof best.level === 'number' && isFinite(best.level) && best.level >= 1
      ? '第 ' + best.level + ' 关' : '—';
    ui.bestScore.textContent = s;
    ui.bestLevel.textContent = l;
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
    cbs.forEach(function (cb) {
      try { cb(snap); } catch (e) { /* 回调异常不影响面板 */ }
    });
  }

  function mount(el) {
    if (!el) el = document.body;
    ensureStyle();
    if (root && root.parentNode === el) return;
    if (root && root.parentNode) root.parentNode.removeChild(root);
    host = el;
    buildDOM();
    root.hidden = true;
    host.appendChild(root);
  }

  function open(tab) {
    if (!root) mount(null);
    var c = (window.PC && window.PC.cfg && typeof window.PC.cfg === 'object')
      ? window.PC.cfg : defaultCfg();
    work = sanitize(deepCopy(c));   // 深拷贝快照 + schema 补全
    buildPalOptions();              // 兼容 ART 晚加载
    buildCueList();                 // 兼容 AUDIO 晚加载
    disarm();
    showTab(tab);
    syncUI();
    renderBest();
    opened = true;
    root.hidden = false;
    root.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { root.classList.add('pccp-open'); });
    });
  }

  function close() {
    if (!root || !opened) return;
    opened = false;
    disarm();
    root.classList.remove('pccp-open');
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

  /* 「清除纪录」独立通道：非 cfg 字段，恢复默认/导入均不触发 */
  function onClearBest(cb) {
    if (typeof cb === 'function') cbsBest.push(cb);
    return function off() {
      var i = cbsBest.indexOf(cb);
      if (i >= 0) cbsBest.splice(i, 1);
    };
  }

  /* 最佳纪录占位区由外部喂入（游戏侧持久化数据） */
  function setBest(b) {
    best = (b && typeof b === 'object') ? { score: b.score, level: b.level } : null;
    renderBest();
  }

  return {
    mount: mount, open: open, close: close, isOpen: isOpen,
    onChange: onChange, onClearBest: onClearBest, setBest: setBest
  };
})();
