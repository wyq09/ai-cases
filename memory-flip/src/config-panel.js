/* =========================================================
 * 翻牌赢好礼 · 配置面板（移动端底部抽屉） — MF.CONFIG_PANEL
 * 契约接口：mount(el) / open(tab?) / close() / isOpen() / onChange(cb)
 * 额外通道：onClearBest(cb) —— 「清除最佳纪录」专用事件（非 cfg 字段；
 *           恢复出厂 / 导入都不会触发它，也永不清除纪录）
 * - open() 时深拷贝 window.MF.cfg 为 work（MF.cfg 缺失则用内置 defaultCfg）
 * - 任何编辑改 work 后立即 onChange(完整深拷贝快照)
 * - 永不直接读写 localStorage；MF.ART / MF.AUDIO / MF.LOGIC 缺失时兜底
 * - 样式内联 <style> 注入，类名前缀 mfcp-
 * - 视觉：米白 #FFF9EE 纸底｜主红 #B93A2B｜金 #C99A3C｜深棕 #3A2E24 描边，
 *   圆角 ≤8px，实色偏移投影，禁紫蓝渐变 / 玻璃拟态 / 霓虹
 * ======================================================= */
window.MF = window.MF || {};
MF.CONFIG_PANEL = (function () {
  'use strict';

  /* ---------------- 内置默认配置（schema 兜底） ---------------- */
  function defaultCfg() {
    return {
      grid: '4x4',        // 默认难度 '4x3' | '4x4' | '5x4'
      timeLimit: 90,      // 限时秒，0=不限时
      peekSec: 2,         // 开局记忆预览秒，0=关
      comboOn: true,      // 连击倍率开关
      baseScore: 100,     // 每对基础分
      timeBonus: 10,      // 全清后每剩 1 秒加成
      dailyLimit: 0,      // 每日次数，0=无限
      vols: { bgm: 0.4, sfx: 0.9, master: 1 },
      icons: {},          // iconId -> dataURL 覆盖
      sounds: {}          // cue -> dataURL 覆盖
    };
  }

  /* 10 种好礼（契约锁死的 id 与中文名，LOGIC 缺失时兜底） */
  var ICON_TABLE = [
    ['ingot', '金元宝'], ['hongbao', '红包'], ['coupon', '优惠券'], ['gift', '礼盒'], ['koi', '锦鲤'],
    ['cat', '招财猫'], ['crown', '王冠'], ['gem', '宝石'], ['firework', '礼花'], ['coin', '铜钱']
  ];
  /* cue 清单（契约锁死） */
  var CUE_TABLE = [
    ['flip', '翻牌'], ['match', '配对'], ['miss', '失配'], ['combo', '连击'], ['win', '胜利'],
    ['lose', '失败'], ['tick', '倒计时'], ['click', '按钮'], ['bgm', '背景音乐']
  ];
  var GRIDS = [['4x3', '轻松 4×3'], ['4x4', '标准 4×4'], ['5x4', '挑战 5×4']];
  var TABS = [['cards', '卡面'], ['sound', '音效'], ['play', '玩法'], ['data', '数据']];
  var TAB_ALIAS = {
    'cards': 'cards', 'card': 'cards', 'skin': 'cards', '卡面': 'cards',
    'sound': 'sound', 'sounds': 'sound', 'audio': 'sound', '音效': 'sound',
    'play': 'play', 'game': 'play', '玩法': 'play',
    'data': 'data', '数据': 'data'
  };
  var NUMSPEC = {
    timeLimit: { min: 0, max: 300, step: 1 },
    peekSec:   { min: 0, max: 5,   step: 1 },
    baseScore: { min: 10, max: 1000, step: 10 },
    timeBonus: { min: 0, max: 100, step: 1 },
    dailyLimit:{ min: 0, max: 99,  step: 1 }
  };

  /* ---------------- 工具函数 ---------------- */
  function deepCopy(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function clamp01(v, fb) { var n = Number(v); return isFinite(n) ? Math.min(1, Math.max(0, n)) : fb; }
  function pct(v) { return Math.round(clamp01(v, 0) * 100) + '%'; }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function iconName(id) {
    for (var i = 0; i < ICON_TABLE.length; i++) if (ICON_TABLE[i][0] === id) return ICON_TABLE[i][1];
    return id;
  }
  function cueName(cue) {
    for (var i = 0; i < CUE_TABLE.length; i++) if (CUE_TABLE[i][0] === cue) return CUE_TABLE[i][1];
    return cue;
  }
  /* iconId 列表：优先取 MF.LOGIC.ICONS（兼容字符串或 {id,name} 对象），缺失时用内置表 */
  function iconIdList() {
    var out = [];
    try {
      var L = window.MF && window.MF.LOGIC;
      var arr = L && L.ICONS;
      if (arr && arr.length) {
        for (var i = 0; i < arr.length; i++) {
          var it = arr[i];
          var id = (typeof it === 'string') ? it : (it && it.id);
          if (typeof id === 'string' && id) {
            var nm = (it && typeof it.name === 'string') ? it.name : iconName(id);
            out.push([id, nm]);
          }
        }
      }
    } catch (e) { /* 兜底 */ }
    return out.length ? out : ICON_TABLE.slice();
  }
  function artUrl(id) {
    try {
      var A = window.MF && window.MF.ART;
      if (A && typeof A.card === 'function') {
        var u = A.card(id);
        if (typeof u === 'string' && u) return u;
      }
    } catch (e) { /* 占位块兜底 */ }
    return null;
  }
  function hasAudio() {
    try { return !!(window.MF && window.MF.AUDIO && typeof window.MF.AUDIO.play === 'function'); }
    catch (e) { return false; }
  }

  /* 按契约 schema 清洗补全（缺的键用内置默认值兜底，未知 icon/cue 键丢弃） */
  function sanitize(raw) {
    var d = defaultCfg();
    if (!raw || typeof raw !== 'object') return d;
    for (var i = 0; i < GRIDS.length; i++) if (raw.grid === GRIDS[i][0]) d.grid = raw.grid;
    d.timeLimit  = clampInt(raw.timeLimit,  0, 300,  d.timeLimit);
    d.peekSec    = clampInt(raw.peekSec,    0, 5,    d.peekSec);
    d.baseScore  = clampInt(raw.baseScore,  10, 1000, d.baseScore);
    d.timeBonus  = clampInt(raw.timeBonus,  0, 100,  d.timeBonus);
    d.dailyLimit = clampInt(raw.dailyLimit, 0, 99,   d.dailyLimit);
    if (typeof raw.comboOn === 'boolean') d.comboOn = raw.comboOn;
    if (raw.vols && typeof raw.vols === 'object') {
      d.vols.bgm    = clamp01(raw.vols.bgm,    d.vols.bgm);
      d.vols.sfx    = clamp01(raw.vols.sfx,    d.vols.sfx);
      d.vols.master = clamp01(raw.vols.master, d.vols.master);
    }
    if (raw.icons && typeof raw.icons === 'object') {
      var ic = {};
      iconIdList().forEach(function (p) {
        var v = raw.icons[p[0]];
        if (typeof v === 'string' && v) ic[p[0]] = v;
      });
      d.icons = ic;
    }
    if (raw.sounds && typeof raw.sounds === 'object') {
      var sd = {};
      CUE_TABLE.forEach(function (p) {
        var v = raw.sounds[p[0]];
        if (typeof v === 'string' && v) sd[p[0]] = v;
      });
      d.sounds = sd;
    }
    return d;
  }
  function clampInt(v, min, max, fb) {
    var n = Math.round(Number(v));
    if (!isFinite(n)) return fb;
    return Math.min(max, Math.max(min, n));
  }

  /* ---------------- 模块状态 ---------------- */
  var host = null, root = null;
  var work = null;              // 工作副本（深拷贝），编辑立即 notify
  var cbs = [];                 // onChange 回调
  var cbsBest = [];             // onClearBest 回调（独立通道）
  var opened = false;
  var curTab = 'cards';
  var toastTimer = 0;
  var ui = {};                  // 控件引用

  /* ---------------- 样式（米白纸底 + 印刷红金 + 偏移实色投影） ---------------- */
  var CSS = [
    '.mfcp-root{position:fixed;inset:0;z-index:9990;font-family:system-ui,-apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;color:#2B2622;}',
    '.mfcp-root,.mfcp-root *{box-sizing:border-box;}',
    '.mfcp-root[hidden]{display:none!important;}',
    '.mfcp-mask{position:absolute;inset:0;background:rgba(43,38,34,.55);opacity:0;transition:opacity .22s ease;}',
    '.mfcp-root.mfcp-open .mfcp-mask{opacity:1;}',
    '.mfcp-drawer{position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column;max-height:88%;',
      'background:#FFF9EE;border:2px solid #3A2E24;border-bottom:none;border-radius:8px 8px 0 0;',
      'box-shadow:0 -3px 0 rgba(58,46,36,.9);transform:translateY(105%);transition:transform .26s cubic-bezier(.22,.9,.3,1);}',
    '.mfcp-root.mfcp-open .mfcp-drawer{transform:translateY(0);}',
    '.mfcp-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px 8px 14px;border-bottom:2px solid #3A2E24;flex:0 0 auto;}',
    '.mfcp-title{display:flex;align-items:center;gap:9px;font-size:19px;font-weight:900;letter-spacing:4px;}',
    '.mfcp-seal{width:24px;height:24px;background:#B93A2B;border:2px solid #3A2E24;border-radius:4px;',
      'color:#FFF9EE;font-size:13px;font-weight:900;line-height:20px;text-align:center;letter-spacing:0;flex:0 0 auto;}',
    '.mfcp-close{width:44px;height:44px;flex:0 0 auto;border:2px solid #3A2E24;border-radius:6px;background:#FFF9EE;',
      'color:#2B2622;font:900 16px/1 system-ui;cursor:pointer;box-shadow:2px 2px 0 rgba(58,46,36,.9);}',
    '.mfcp-close:active{transform:translate(1px,1px);box-shadow:1px 1px 0 rgba(58,46,36,.9);}',
    '.mfcp-tabs{display:flex;gap:8px;padding:10px 14px 0;flex:0 0 auto;}',
    '.mfcp-tab{flex:1;min-height:44px;border:2px solid #3A2E24;border-radius:6px;background:#F6EFE2;color:#3A2E24;',
      'font:700 15px/1 system-ui;cursor:pointer;box-shadow:2px 2px 0 rgba(58,46,36,.45);}',
    '.mfcp-tab.mfcp-on{background:#B93A2B;color:#FFF9EE;box-shadow:2px 2px 0 rgba(58,46,36,.9);}',
    '.mfcp-body{flex:1 1 auto;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:10px 14px 12px;}',
    '.mfcp-panel[hidden]{display:none!important;}',
    '.mfcp-note{margin:2px 0 10px;font-size:12px;line-height:1.7;color:rgba(58,46,36,.72);}',
    '.mfcp-sec{display:inline-block;margin:12px 0 2px;padding:3px 10px;background:#3A2E24;color:#F6EFE2;',
      'font-size:12px;font-weight:900;letter-spacing:3px;border-radius:4px;}',
    '.mfcp-row{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:52px;padding:8px 0;}',
    '.mfcp-row + .mfcp-row{border-top:1px dashed rgba(58,46,36,.35);}',
    '.mfcp-rowcol{flex-direction:column;align-items:stretch;gap:8px;}',
    '.mfcp-rowtight{min-height:0;padding:6px 0;}',
    '.mfcp-lab{font-size:15px;font-weight:700;}',
    '.mfcp-labsub{display:block;font-size:12px;font-weight:400;color:rgba(58,46,36,.6);margin-top:3px;line-height:1.5;}',
    '.mfcp-seg{display:flex;gap:8px;}',
    '.mfcp-seg button{flex:1;min-height:44px;border:2px solid #3A2E24;border-radius:6px;background:#FFF9EE;color:#3A2E24;',
      'font:700 14px/1.3 system-ui;cursor:pointer;padding:4px 2px;box-shadow:2px 2px 0 rgba(58,46,36,.45);}',
    '.mfcp-seg button.mfcp-on{background:#B93A2B;color:#FFF9EE;box-shadow:2px 2px 0 rgba(58,46,36,.9);}',
    '.mfcp-num{width:84px;min-height:44px;border:2px solid #3A2E24;border-radius:6px;background:#FFFDF6;color:#2B2622;',
      'font:900 16px/1.2 system-ui;text-align:center;flex:0 0 auto;}',
    '.mfcp-sw{position:relative;width:56px;height:32px;flex:0 0 auto;cursor:pointer;display:inline-block;}',
    '.mfcp-sw input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer;z-index:2;}',
    '.mfcp-track{position:absolute;inset:0;border:2px solid #3A2E24;border-radius:6px;background:#EFE5D0;transition:background .15s ease;}',
    '.mfcp-knob{position:absolute;top:4px;left:4px;width:22px;height:22px;border:2px solid #3A2E24;border-radius:4px;',
      'background:#C99A3C;transition:left .15s ease;pointer-events:none;}',
    '.mfcp-sw input:checked ~ .mfcp-track{background:#B93A2B;}',
    '.mfcp-sw input:checked ~ .mfcp-knob{left:26px;background:#E4B95B;}',
    '.mfcp-volhead{display:flex;align-items:center;justify-content:space-between;gap:10px;}',
    '.mfcp-volval{min-width:44px;text-align:right;font-size:14px;font-weight:900;color:#B93A2B;}',
    '.mfcp-range{-webkit-appearance:none;appearance:none;display:block;width:100%;height:44px;margin:0;padding:0;',
      'background:transparent;cursor:pointer;}',
    '.mfcp-range::-webkit-slider-runnable-track{height:12px;border:2px solid #3A2E24;border-radius:6px;background:#F6EFE2;}',
    '.mfcp-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:26px;height:26px;margin-top:-7px;',
      'border:2px solid #3A2E24;border-radius:6px;background:#B93A2B;box-shadow:2px 2px 0 rgba(58,46,36,.9);}',
    '.mfcp-range::-moz-range-track{height:12px;border:2px solid #3A2E24;border-radius:6px;background:#F6EFE2;}',
    '.mfcp-range::-moz-range-thumb{width:22px;height:22px;border:2px solid #3A2E24;border-radius:6px;background:#B93A2B;}',
    '.mfcp-btn{min-height:44px;padding:0 14px;border:2px solid #3A2E24;border-radius:6px;background:#FFF9EE;',
      'color:#3A2E24;font:700 14px/1.2 system-ui;cursor:pointer;box-shadow:2px 2px 0 rgba(58,46,36,.9);}',
    '.mfcp-btn:active{transform:translate(1px,1px);box-shadow:1px 1px 0 rgba(58,46,36,.9);}',
    '.mfcp-btn-primary{background:#B93A2B;color:#FFF9EE;}',
    '.mfcp-btn-danger{border-color:#B93A2B;color:#B93A2B;box-shadow:2px 2px 0 rgba(185,58,43,.85);}',
    '.mfcp-btnrow{display:flex;gap:10px;margin:10px 0 2px;}',
    '.mfcp-btnrow .mfcp-btn{flex:1;padding:0 8px;}',
    '.mfcp-btncol{display:flex;flex-direction:column;gap:10px;margin:8px 0 2px;}',
    '.mfcp-btn-block{width:100%;}',
    '.mfcp-datadiv{height:0;border-top:2px dashed rgba(58,46,36,.35);margin:12px 0;}',
    '.mfcp-iconlist,.mfcp-cuelist{display:flex;flex-direction:column;}',
    '.mfcp-iconrow{display:flex;align-items:center;gap:10px;min-height:56px;padding:7px 0;}',
    '.mfcp-iconrow + .mfcp-iconrow,.mfcp-cuerow + .mfcp-cuerow{border-top:1px dashed rgba(58,46,36,.35);}',
    '.mfcp-icprev{position:relative;width:52px;height:52px;flex:0 0 auto;border:2px solid #3A2E24;border-radius:6px;background:#FFFDF6;}',
    '.mfcp-icprev img{width:100%;height:100%;object-fit:contain;display:block;}',
    '.mfcp-icph{display:flex;width:100%;height:100%;align-items:center;justify-content:center;',
      'background:repeating-linear-gradient(45deg,#F1E7D3 0 5px,#E9DCC1 5px 10px);',
      'color:rgba(58,46,36,.55);font-size:10px;letter-spacing:1px;}',
    '.mfcp-badge{position:absolute;left:-5px;top:-7px;z-index:1;background:#B93A2B;border:1px solid #3A2E24;',
      'border-radius:3px;color:#FFF9EE;font-size:10px;font-weight:700;line-height:1;padding:2px 3px;letter-spacing:1px;white-space:nowrap;}',
    '.mfcp-icinfo{flex:1;min-width:0;}',
    '.mfcp-icname{display:block;font-size:15px;font-weight:700;}',
    '.mfcp-icstate{display:block;font-size:11px;color:rgba(58,46,36,.6);margin-top:2px;}',
    '.mfcp-iconrow .mfcp-btn,.mfcp-cuerow .mfcp-btn{padding:0 10px;flex:0 0 auto;}',
    '.mfcp-cuerow{display:flex;align-items:center;gap:8px;min-height:56px;padding:7px 0;}',
    '.mfcp-cuename{flex:1;min-width:0;font-size:15px;font-weight:700;display:flex;align-items:center;gap:6px;flex-wrap:wrap;}',
    '.mfcp-chip{border:1px solid #B93A2B;border-radius:3px;background:rgba(185,58,43,.08);color:#B93A2B;',
      'font-size:10px;font-weight:700;line-height:1;padding:2px 4px;letter-spacing:1px;}',
    '.mfcp-foot{flex:0 0 auto;padding:10px 14px calc(12px + env(safe-area-inset-bottom));border-top:2px solid #3A2E24;}',
    '.mfcp-done{width:100%;font-size:16px;letter-spacing:10px;text-indent:10px;}',
    '.mfcp-toast{position:absolute;left:50%;bottom:calc(78px + env(safe-area-inset-bottom));transform:translateX(-50%);',
      'z-index:6;max-width:86%;background:#3A2E24;color:#F6EFE2;font-size:13px;line-height:1.4;padding:9px 14px;',
      'border-radius:4px;border:1px solid rgba(246,239,226,.25);pointer-events:none;',
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.mfcp-toast[hidden]{display:none!important;}',
    '.mfcp-file{display:none!important;}',
    '.mfcp-hide{display:none!important;}',
    '.mfcp-root button:focus-visible,.mfcp-root input:focus-visible{outline:3px solid #C99A3C;outline-offset:2px;}',
    '@media (min-width:640px){.mfcp-drawer{left:50%;right:auto;width:480px;margin-left:-240px;',
      'border-bottom:2px solid #3A2E24;border-radius:8px;',
      'box-shadow:-3px -3px 0 rgba(58,46,36,.9),3px -3px 0 rgba(58,46,36,.9);}}'
  ].join('\n');

  function ensureStyle() {
    if (document.getElementById('mfcp-style')) return;
    var st = document.createElement('style');
    st.id = 'mfcp-style';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  /* ---------------- 面板 HTML ---------------- */
  function numRow(key, label, sub) {
    var s = NUMSPEC[key];
    return '<div class="mfcp-row">'
      + '<span class="mfcp-lab">' + label + '<span class="mfcp-labsub">' + sub + '</span></span>'
      + '<input type="number" class="mfcp-num" data-num="' + key + '" min="' + s.min
      + '" max="' + s.max + '" step="' + s.step + '" aria-label="' + label + '">'
      + '</div>';
  }
  function panelCardsHTML() {
    return '<p class="mfcp-note">10 种好礼卡面，可上传本地图片替换（自动压缩为长边 ≤256px 的 PNG）。'
      + '替换后的卡面会标注「已自定义」，可单项还原或全部还原。</p>'
      + '<div class="mfcp-iconlist" data-role="iconlist"></div>'
      + '<div class="mfcp-btnrow"><button type="button" class="mfcp-btn" data-act="icons-reset">全部还原默认卡面</button></div>'
      + '<input type="file" class="mfcp-file" accept="image/*" data-role="iconfile">';
  }
  function cueRowHTML(cue, label) {
    return '<div class="mfcp-cuerow" data-cue="' + cue + '">'
      + '<span class="mfcp-cuename">' + label + '<span class="mfcp-chip mfcp-hide">已自定义</span></span>'
      + '<button type="button" class="mfcp-btn" data-sact="play">试听</button>'
      + '<button type="button" class="mfcp-btn" data-sact="up">换音</button>'
      + '<button type="button" class="mfcp-btn mfcp-hide" data-sact="clear">清除</button>'
      + '</div>';
  }
  function volRow(k, label) {
    return '<div class="mfcp-row mfcp-rowcol mfcp-rowtight">'
      + '<span class="mfcp-volhead"><span class="mfcp-lab">' + label + '</span>'
      + '<span class="mfcp-volval" data-volval="' + k + '">0%</span></span>'
      + '<input type="range" class="mfcp-range" data-vol="' + k + '" min="0" max="1" step="0.05" aria-label="' + label + '">'
      + '</div>';
  }
  function panelSoundHTML() {
    var rows = CUE_TABLE.map(function (c) { return cueRowHTML(c[0], c[1]); }).join('');
    return '<p class="mfcp-note">上传本地音频替换内置合成音（不做压缩），「清除」恢复合成音；'
      + '试听需游戏音效模块支持。</p>'
      + '<div class="mfcp-cuelist">' + rows + '</div>'
      + '<div class="mfcp-sec">音量调节</div>'
      + volRow('bgm', '背景音乐（BGM）')
      + volRow('sfx', '音效（SFX）')
      + volRow('master', '主音量')
      + '<input type="file" class="mfcp-file" accept="audio/*" data-role="sndfile">';
  }
  function panelPlayHTML() {
    var seg = GRIDS.map(function (g) {
      return '<button type="button" data-grid="' + g[0] + '">' + g[1] + '</button>';
    }).join('');
    return '<p class="mfcp-note">以下为开局时生效的默认玩法参数。</p>'
      + '<div class="mfcp-row mfcp-rowcol">'
      + '<span class="mfcp-lab">默认难度<span class="mfcp-labsub">轻松 6 对 ｜ 标准 8 对 ｜ 挑战 10 对</span></span>'
      + '<div class="mfcp-seg" data-role="gridseg">' + seg + '</div>'
      + '</div>'
      + numRow('timeLimit', '限时（秒）', '倒计时秒数，0 = 不限时')
      + numRow('peekSec', '开局记忆预览（秒）', '开局亮出全部卡面帮助记忆，0 = 关闭')
      + '<div class="mfcp-row">'
      + '<span class="mfcp-lab">连击倍率<span class="mfcp-labsub">连续配对得分 ×2/×3，4 连击起 ×4 封顶；关闭后恒为 ×1</span></span>'
      + '<label class="mfcp-sw"><input type="checkbox" data-role="combo" aria-label="连击倍率开关">'
      + '<span class="mfcp-track"></span><span class="mfcp-knob"></span></label>'
      + '</div>'
      + numRow('baseScore', '每对基础分', '每次配对成功的得分基数，10 – 1000')
      + numRow('timeBonus', '全清剩余秒加成', '限时模式通关后每剩余 1 秒加分，0 – 100')
      + numRow('dailyLimit', '每日次数', '每天可玩局数，0 = 不限次数');
  }
  function panelDataHTML() {
    return '<p class="mfcp-note">导出为 JSON 文件（mf-config.json），包含全部配置与自定义素材，可备份或分享；'
      + '导入后立即生效。「恢复出厂」与「导入」都不会清除最佳纪录。</p>'
      + '<div class="mfcp-btncol">'
      + '<button type="button" class="mfcp-btn mfcp-btn-primary" data-act="export">导出配置（下载 mf-config.json）</button>'
      + '<button type="button" class="mfcp-btn" data-act="import">导入配置（JSON 文件）</button>'
      + '<button type="button" class="mfcp-btn" data-act="factory">恢复出厂设置</button>'
      + '</div>'
      + '<div class="mfcp-datadiv"></div>'
      + '<button type="button" class="mfcp-btn mfcp-btn-danger mfcp-btn-block" data-act="clearbest">清除最佳纪录（独立操作，不影响配置）</button>'
      + '<input type="file" class="mfcp-file" accept="application/json,.json,text/plain" data-role="cfgfile">';
  }

  function buildDOM() {
    root = document.createElement('div');
    root.className = 'mfcp-root';
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = ''
      + '<div class="mfcp-mask"></div>'
      + '<section class="mfcp-drawer" role="dialog" aria-modal="true" aria-label="活动设置">'
      +   '<header class="mfcp-head">'
      +     '<div class="mfcp-title"><span class="mfcp-seal">礼</span>活动设置</div>'
      +     '<button type="button" class="mfcp-close" aria-label="关闭设置">✕</button>'
      +   '</header>'
      +   '<nav class="mfcp-tabs" role="tablist">'
      +     TABS.map(function (t) {
              return '<button type="button" class="mfcp-tab" role="tab" data-tab="' + t[0] + '">' + t[1] + '</button>';
            }).join('')
      +   '</nav>'
      +   '<div class="mfcp-body">'
      +     '<div class="mfcp-panel" data-panel="cards">' + panelCardsHTML() + '</div>'
      +     '<div class="mfcp-panel" data-panel="sound" hidden>' + panelSoundHTML() + '</div>'
      +     '<div class="mfcp-panel" data-panel="play" hidden>' + panelPlayHTML() + '</div>'
      +     '<div class="mfcp-panel" data-panel="data" hidden>' + panelDataHTML() + '</div>'
      +   '</div>'
      +   '<footer class="mfcp-foot">'
      +     '<button type="button" class="mfcp-btn mfcp-btn-primary mfcp-done" data-act="done">完成</button>'
      +   '</footer>'
      +   '<div class="mfcp-toast" data-role="toast" hidden></div>'
      + '</section>';

    ui.mask = root.querySelector('.mfcp-mask');
    ui.toast = root.querySelector('[data-role="toast"]');
    ui.tabs = Array.prototype.slice.call(root.querySelectorAll('.mfcp-tab'));
    ui.panels = Array.prototype.slice.call(root.querySelectorAll('.mfcp-panel'));
    ui.segBtns = Array.prototype.slice.call(root.querySelectorAll('.mfcp-seg button'));
    ui.combo = root.querySelector('[data-role="combo"]');
    ui.iconlist = root.querySelector('[data-role="iconlist"]');
    ui.iconfile = root.querySelector('[data-role="iconfile"]');
    ui.sndfile = root.querySelector('[data-role="sndfile"]');
    ui.cfgfile = root.querySelector('[data-role="cfgfile"]');
    ui.vols = {};
    ui.volvals = {};
    ['bgm', 'sfx', 'master'].forEach(function (k) {
      ui.vols[k] = root.querySelector('[data-vol="' + k + '"]');
      ui.volvals[k] = root.querySelector('[data-volval="' + k + '"]');
    });

    rebuildIconList();
    root.addEventListener('click', onClick, false);
    root.addEventListener('input', onInput, false);
    root.addEventListener('change', onInputChange, false);
    document.addEventListener('keydown', onKey, false);
  }

  /* 依据 MF.LOGIC.ICONS（或内置表）重建 10 个卡面行；open() 时重查一次以便晚加载 */
  function rebuildIconList() {
    if (!ui.iconlist) return;
    ui.iconlist.innerHTML = iconIdList().map(function (p) {
      return '<div class="mfcp-iconrow" data-icon="' + esc(p[0]) + '">'
        + '<span class="mfcp-icprev" data-role="icprev"></span>'
        + '<span class="mfcp-icinfo"><span class="mfcp-icname">' + esc(p[1]) + '</span>'
        + '<span class="mfcp-icstate" data-role="icstate">默认卡面</span></span>'
        + '<button type="button" class="mfcp-btn" data-iact="up">换图</button>'
        + '<button type="button" class="mfcp-btn mfcp-hide" data-iact="reset">还原</button>'
        + '</div>';
    }).join('');
  }

  /* ---------------- 事件分发 ---------------- */
  function onClick(e) {
    var t = e.target;
    if (!(t instanceof Element)) return;
    if (t.closest('.mfcp-mask') || t.closest('.mfcp-close')) { close(); return; }
    var tab = t.closest('.mfcp-tab');
    if (tab) { showTab(tab.getAttribute('data-tab')); return; }
    var seg = t.closest('[data-grid]');
    if (seg) {
      if (work) {
        var g = seg.getAttribute('data-grid');
        if (work.grid !== g) { work.grid = g; notify(); syncUI(); }
      }
      return;
    }
    var iact = t.closest('[data-iact]');
    if (iact) { doIconAct(iact.closest('[data-icon]'), iact.getAttribute('data-iact')); return; }
    var sact = t.closest('[data-sact]');
    if (sact) { doCueAct(sact.closest('[data-cue]'), sact.getAttribute('data-sact')); return; }
    var act = t.closest('[data-act]');
    if (act) doAct(act.getAttribute('data-act'));
  }

  function onInput(e) {
    if (!work) return;
    var t = e.target;
    if (t.classList && t.classList.contains('mfcp-range')) {
      var k = t.getAttribute('data-vol');
      if (k && work.vols && (k in work.vols)) {
        work.vols[k] = clamp01(t.value, 0);
        if (ui.volvals[k]) ui.volvals[k].textContent = pct(work.vols[k]);
        notify();
      }
      return;
    }
    if (t.hasAttribute && t.hasAttribute('data-num')) commitNum(t, true);
  }

  function onInputChange(e) {
    if (!work) return;
    var t = e.target;
    if (t === ui.combo) { work.comboOn = !!ui.combo.checked; notify(); syncUI(); return; }
    if (t === ui.iconfile) {
      var f = ui.iconfile.files && ui.iconfile.files[0];
      var ic = ui.iconfile.getAttribute('data-icon');
      ui.iconfile.value = '';
      handleIconFile(ic, f);
      return;
    }
    if (t === ui.sndfile) {
      var sf = ui.sndfile.files && ui.sndfile.files[0];
      var cue = ui.sndfile.getAttribute('data-cue');
      ui.sndfile.value = '';
      handleSndFile(cue, sf);
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

  /* ---------------- 行为实现 ---------------- */
  function doIconAct(row, act) {
    if (!row || !work) return;
    var id = row.getAttribute('data-icon');
    if (act === 'up') {
      ui.iconfile.setAttribute('data-icon', id);
      ui.iconfile.click();
    } else if (act === 'reset') {
      delete work.icons[id];
      notify(); syncUI();
      toast('已还原「' + iconName(id) + '」默认卡面');
    }
  }

  function doCueAct(row, act) {
    if (!row || !work) return;
    var cue = row.getAttribute('data-cue');
    if (act === 'play') { previewCue(cue); return; }
    if (act === 'up') {
      ui.sndfile.setAttribute('data-cue', cue);
      ui.sndfile.click();
    } else if (act === 'clear') {
      delete work.sounds[cue];
      notify(); syncUI();
      toast('已清除「' + cueName(cue) + '」，恢复合成音');
    }
  }

  function doAct(act) {
    if (!work) return;
    switch (act) {
      case 'done': close(); break;
      case 'icons-reset':
        work.icons = {}; notify(); syncUI();
        toast('已全部还原默认卡面');
        break;
      case 'export': doExport(); break;
      case 'import': ui.cfgfile.click(); break;
      case 'factory':
        work = sanitize(defaultCfg());
        notify(); syncUI();
        toast('已恢复出厂设置（最佳纪录保留）');
        break;
      case 'clearbest': fireClearBest(); break;
    }
  }

  /* 数值输入钳制：soft=true 时输入中即时钳制（空值等待），false 时失焦/确认回写 */
  function commitNum(input, soft) {
    if (!input || !work) return;
    var key = input.getAttribute('data-num');
    var spec = NUMSPEC[key];
    if (!spec) return;
    var raw = parseFloat(input.value);
    if (!isFinite(raw)) {
      if (!soft) input.value = String(work[key]);
      return;
    }
    var v = Math.round(raw);
    if (spec.step >= 2) v = Math.round(v / spec.step) * spec.step;
    v = Math.min(spec.max, Math.max(spec.min, v));
    if (String(input.value) !== String(v)) input.value = String(v);
    if (work[key] !== v) { work[key] = v; notify(); }
  }

  /* file → FileReader dataURL（音频不压缩） */
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

  /* file → canvas 压缩 → dataURL 一段式（长边 ≤256，PNG） */
  function readImageToDataURL(file, maxSize, mime, quality, cb) {
    if (!file) { cb(null); return; }
    var fr = new FileReader();
    fr.onload = function () {
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth || img.width || maxSize;
          var h = img.naturalHeight || img.height || maxSize;
          var s = Math.min(1, maxSize / Math.max(w, h));
          var cv = document.createElement('canvas');
          cv.width = Math.max(1, Math.round(w * s));
          cv.height = Math.max(1, Math.round(h * s));
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          cb(cv.toDataURL(mime, quality));
        } catch (e) { cb(null); }
      };
      img.onerror = function () { cb(null); };
      img.src = fr.result;
    };
    fr.onerror = function () { cb(null); };
    try { fr.readAsDataURL(file); } catch (e) { cb(null); }
  }

  function handleIconFile(id, file) {
    if (!id || !file) return;
    if (file.type && !/^image\//.test(file.type)) { toast('请选择图片文件'); return; }
    readImageToDataURL(file, 256, 'image/png', undefined, function (url) {
      if (!url) { toast('图片读取失败，请换一张试试'); return; }
      if (!work) return;
      work.icons[id] = url;
      notify(); syncUI();
      toast('「' + iconName(id) + '」卡面已更新');
    });
  }

  function handleSndFile(cue, file) {
    if (!cue || !file) return;
    if (file.type && !/^audio\//.test(file.type)) { toast('请选择音频文件'); return; }
    fileToDataURL(file, function (url) {
      if (!url) { toast('音频读取失败'); return; }
      if (!work) return;
      work.sounds[cue] = url;
      notify(); syncUI();
      toast('「' + cueName(cue) + '」音效已更新');
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
      a.download = 'mf-config.json';
      document.body.appendChild(a);
      a.click();
      a.parentNode.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 800);
      toast('配置已导出');
    } catch (e) { toast('导出失败'); }
  }

  function previewCue(cue) {
    var A = window.MF && window.MF.AUDIO;
    if (A && typeof A.play === 'function') {
      try {
        if (typeof A.unlock === 'function') A.unlock();
        if (work && typeof A.setMasterVolume === 'function') A.setMasterVolume(clamp01(work.vols.master, 1));
        if (work && typeof A.setSFXVolume === 'function') A.setSFXVolume(clamp01(work.vols.sfx, 0.9));
        if (work && cue === 'bgm' && typeof A.setBGMVolume === 'function') A.setBGMVolume(clamp01(work.vols.bgm, 0.4));
        A.play(cue);
      } catch (err) { toast('试听失败'); }
      return;
    }
    toast('音效模块未加载，无法试听');
  }

  function fireClearBest() {
    cbsBest.forEach(function (cb) {
      try { cb(); } catch (e) { /* 回调异常不影响面板 */ }
    });
    toast('已发出「清除最佳纪录」事件');
  }

  /* ---------------- 渲染同步 ---------------- */
  function showTab(tab) {
    curTab = TAB_ALIAS[tab] || 'cards';
    ui.tabs.forEach(function (b) {
      var on = b.getAttribute('data-tab') === curTab;
      b.classList.toggle('mfcp-on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    ui.panels.forEach(function (p) {
      p.hidden = p.getAttribute('data-panel') !== curTab;
    });
  }

  function renderIconPreview(prevEl, id, custom) {
    var url = custom || artUrl(id);
    prevEl.innerHTML = '';
    var b = document.createElement('span');
    b.className = 'mfcp-badge' + (custom ? '' : ' mfcp-hide');
    b.textContent = '已自定义';
    prevEl.appendChild(b);
    if (url) {
      var img = document.createElement('img');
      img.setAttribute('alt', iconName(id) + '卡面预览');
      img.setAttribute('src', url);
      prevEl.appendChild(img);
    } else {
      var ph = document.createElement('span');
      ph.className = 'mfcp-icph';
      ph.textContent = '暂无预览';
      prevEl.appendChild(ph);
    }
  }

  function syncUI() {
    if (!root || !work) return;
    /* 玩法 */
    ui.segBtns.forEach(function (b) {
      var on = b.getAttribute('data-grid') === work.grid;
      b.classList.toggle('mfcp-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    Object.keys(NUMSPEC).forEach(function (k) {
      var inp = root.querySelector('[data-num="' + k + '"]');
      if (inp && document.activeElement !== inp) inp.value = String(work[k]);
    });
    if (ui.combo) ui.combo.checked = !!work.comboOn;
    /* 音量 */
    ['bgm', 'sfx', 'master'].forEach(function (k) {
      if (ui.vols[k]) ui.vols[k].value = String(clamp01(work.vols[k], 0));
      if (ui.volvals[k]) ui.volvals[k].textContent = pct(work.vols[k]);
    });
    /* 卡面 */
    Array.prototype.forEach.call(root.querySelectorAll('.mfcp-iconrow'), function (row) {
      var id = row.getAttribute('data-icon');
      var custom = typeof work.icons[id] === 'string' && work.icons[id];
      var badge = row.querySelector('.mfcp-badge');
      var rb = row.querySelector('[data-iact="reset"]');
      var state = row.querySelector('[data-role="icstate"]');
      if (badge) badge.classList.toggle('mfcp-hide', !custom);
      if (rb) rb.classList.toggle('mfcp-hide', !custom);
      if (state) state.textContent = custom ? '已自定义' : '默认卡面';
      var prev = row.querySelector('[data-role="icprev"]');
      if (prev) renderIconPreview(prev, id, custom);
    });
    /* 音效 */
    Array.prototype.forEach.call(root.querySelectorAll('.mfcp-cuerow'), function (row) {
      var cue = row.getAttribute('data-cue');
      var custom = typeof work.sounds[cue] === 'string' && work.sounds[cue];
      var chip = row.querySelector('.mfcp-chip');
      var cb = row.querySelector('[data-sact="clear"]');
      if (chip) chip.classList.toggle('mfcp-hide', !custom);
      if (cb) cb.classList.toggle('mfcp-hide', !custom);
    });
    /* 试听按钮：缺 MF.AUDIO 时隐藏 */
    var okAudio = hasAudio();
    Array.prototype.forEach.call(root.querySelectorAll('[data-sact="play"]'), function (b) {
      b.classList.toggle('mfcp-hide', !okAudio);
    });
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
    cbs.forEach(function (cb) {
      try { cb(deepCopy(work)); } catch (e) { /* 回调异常不影响面板 */ }
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
    var c = (window.MF && window.MF.cfg && typeof window.MF.cfg === 'object')
      ? window.MF.cfg : defaultCfg();
    work = sanitize(deepCopy(c));   // 深拷贝 + schema 补全
    rebuildIconList();              // 兼容 LOGIC 晚加载
    showTab(tab);
    syncUI();
    opened = true;
    root.hidden = false;
    root.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { root.classList.add('mfcp-open'); });
    });
  }

  function close() {
    if (!root || !opened) return;
    opened = false;
    root.classList.remove('mfcp-open');
    root.setAttribute('aria-hidden', 'true');
    setTimeout(function () { if (!opened && root) root.hidden = true; }, 280);
  }

  function isOpen() { return opened; }

  function onChange(cb) {
    if (typeof cb === 'function') cbs.push(cb);
    return function off() {
      var i = cbs.indexOf(cb);
      if (i >= 0) cbs.splice(i, 1);
    };
  }

  /* 「清除最佳纪录」独立通道：非 cfg 字段，恢复出厂/导入均不触发 */
  function onClearBest(cb) {
    if (typeof cb === 'function') cbsBest.push(cb);
    return function off() {
      var i = cbsBest.indexOf(cb);
      if (i >= 0) cbsBest.splice(i, 1);
    };
  }

  return { mount: mount, open: open, close: close, isOpen: isOpen, onChange: onChange, onClearBest: onClearBest };
})();
