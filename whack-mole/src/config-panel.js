/* =========================================================
 * 欢乐打地鼠 · 配置面板（移动端底部抽屉） — WM.CONFIG_PANEL
 * 契约接口：mount(el) / open(tab?) / close() / isOpen() / onChange(cb)
 * - open() 时深拷贝 WM.cfg 为 work（WM.cfg 缺失则用内置 defaultCfg）
 * - 任何编辑改 work 后立即 onChange(完整深拷贝快照)
 * - 「清除最佳纪录」经 onChange 发送特殊标记 {__clearBest:true}，由主游戏处理
 * - 持久化一律由主游戏经 onChange 落盘，本面板不碰任何存储；WM.ART / WM.AUDIO 缺失时兜底
 * - 样式内联 <style> 注入，类名前缀 wmcp-
 * - 视觉：米白 #FFF9EE 纸底｜活动红 #B93A2B｜金 #C99A3C｜深棕 #3A2E24 描边，
 *   圆角 ≤8px，实色偏移投影，禁紫蓝渐变 / 玻璃拟态 / 霓虹
 * ======================================================= */
window.WM = window.WM || {};
WM.CONFIG_PANEL = (function () {
  'use strict';

  /* ---------------- 内置默认配置（契约 schema 兜底） ---------------- */
  function defaultCfg() {
    return {
      diff: 'normal',       // 默认难度 'easy' | 'normal' | 'hard'
      timeLimit: 60,        // 局时秒，30-120
      frenzySec: 4,         // 狂热持续秒，2-8
      comboOn: true,        // 连击倍率开关
      baseScore: 100,       // 地鼠基础分（gold×3、gift×1.5、bomb−2 联动）
      dailyLimit: 0,        // 每日次数，0=无限
      vols: { bgm: 0.4, sfx: 0.9, master: 1 },
      moles: {},            // moleId -> dataURL 覆盖（up 态）
      sounds: {},           // cue -> dataURL 覆盖
      marketing: {
        title: '欢乐打地鼠',
        subtitle: '游园会 · 赢好礼',
        rules: '限时敲鼠得分，连击翻倍；敲中礼盒鼠集奖品并触发狂热时刻；小心炸弹鼠！按评级领对应好礼。',
        prizes: [
          { tier: 'gold',   name: '游园大奖', prefix: 'WMJ' },
          { tier: 'silver', name: '幸运好礼', prefix: 'WMY' },
          { tier: 'bronze', name: '参与奖',   prefix: 'WMC' }
        ],
        supportUrl: ''
      }
    };
  }

  /* 4 种地鼠（契约锁死 id 与中文名；分值按 baseScore=100 基准） */
  var MOLE_TABLE = [
    ['normal', '地鼠',   '+100 · 主力'],
    ['gold',   '金地鼠', '+300 · 稀有短驻留'],
    ['gift',   '礼盒鼠', '+150 · 集奖品+狂热'],
    ['bomb',   '炸弹鼠', '−200 · 禁打！']
  ];
  /* 12 个 cue（契约锁死） */
  var CUE_TABLE = [
    ['pop', '地鼠弹出'], ['whack', '锤击命中'], ['whiff', '敲空'], ['gold', '金地鼠'],
    ['gift', '礼盒开启'], ['bomb', '炸弹'], ['frenzy', '狂热开启'], ['combo', '连击'],
    ['win', '结算胜利'], ['tick', '倒计时'], ['click', '按钮点击'], ['bgm', '背景音乐']
  ];
  var TABS = [['mole', '地鼠'], ['sound', '音效'], ['play', '玩法'], ['mkt', '营销'], ['data', '数据']];
  var TAB_ALIAS = {
    'mole': 'mole', 'moles': 'mole', '地鼠': 'mole',
    'sound': 'sound', 'sounds': 'sound', 'audio': 'sound', '音效': 'sound',
    'play': 'play', 'game': 'play', '玩法': 'play',
    'mkt': 'mkt', 'marketing': 'mkt', '营销': 'mkt',
    'data': 'data', '数据': 'data'
  };
  var DIFF_KEYS = [['easy', '悠闲'], ['normal', '标准'], ['hard', '疯狂']];
  var TIER_KEYS = ['gold', 'silver', 'bronze'];
  var TIER_LABEL = [['金牌档', '评级 ≥ 金牌线可领'], ['银牌档', '评级 ≥ 银牌线可领'], ['铜牌档', '其余评级可领']];
  var NUMSPEC = {
    timeLimit:  { min: 30, max: 120, step: 1 },
    frenzySec:  { min: 2,  max: 8,   step: 1 },
    baseScore:  { min: 50, max: 300, step: 10 },
    dailyLimit: { min: 0,  max: 99,  step: 1 }
  };

  /* ---------------- 工具函数 ---------------- */
  function deepCopy(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function clamp01(v, fb) { var n = Number(v); return isFinite(n) ? Math.min(1, Math.max(0, n)) : fb; }
  function clampInt(v, min, max, fb) {
    var n = Math.round(Number(v));
    if (!isFinite(n)) return fb;
    return Math.min(max, Math.max(min, n));
  }
  function pct(v) { return Math.round(clamp01(v, 0) * 100) + '%'; }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function moleName(id) {
    for (var i = 0; i < MOLE_TABLE.length; i++) if (MOLE_TABLE[i][0] === id) return MOLE_TABLE[i][1];
    return id;
  }
  function cueName(cue) {
    for (var i = 0; i < CUE_TABLE.length; i++) if (CUE_TABLE[i][0] === cue) return CUE_TABLE[i][1];
    return cue;
  }
  /* 地鼠立绘预览：优先 WM.ART.mole(id,'up')，缺失时占位 */
  function artUrl(id) {
    try {
      var A = window.WM && window.WM.ART;
      if (A && typeof A.mole === 'function') {
        var u = A.mole(id, 'up');
        if (typeof u === 'string' && u) return u;
      }
    } catch (e) { /* 占位块兜底 */ }
    return null;
  }
  function hasAudio() {
    try { return !!(window.WM && window.WM.AUDIO && typeof window.WM.AUDIO.play === 'function'); }
    catch (e) { return false; }
  }

  /* 按契约 schema 清洗补全（缺键用默认值兜底，未知 mole/cue 键丢弃） */
  function sanitize(raw) {
    var d = defaultCfg();
    if (!raw || typeof raw !== 'object') return d;
    for (var i = 0; i < DIFF_KEYS.length; i++) if (raw.diff === DIFF_KEYS[i][0]) d.diff = raw.diff;
    d.timeLimit  = clampInt(raw.timeLimit,  30, 120, d.timeLimit);
    d.frenzySec  = clampInt(raw.frenzySec,  2,  8,   d.frenzySec);
    d.baseScore  = clampInt(raw.baseScore,  50, 300, d.baseScore);
    d.dailyLimit = clampInt(raw.dailyLimit, 0,  99,  d.dailyLimit);
    if (typeof raw.comboOn === 'boolean') d.comboOn = raw.comboOn;
    if (raw.vols && typeof raw.vols === 'object') {
      d.vols.bgm    = clamp01(raw.vols.bgm,    d.vols.bgm);
      d.vols.sfx    = clamp01(raw.vols.sfx,    d.vols.sfx);
      d.vols.master = clamp01(raw.vols.master, d.vols.master);
    }
    if (raw.moles && typeof raw.moles === 'object') {
      var mo = {};
      MOLE_TABLE.forEach(function (p) {
        var v = raw.moles[p[0]];
        if (typeof v === 'string' && v) mo[p[0]] = v;
      });
      d.moles = mo;
    }
    if (raw.sounds && typeof raw.sounds === 'object') {
      var sd = {};
      CUE_TABLE.forEach(function (p) {
        var v = raw.sounds[p[0]];
        if (typeof v === 'string' && v) sd[p[0]] = v;
      });
      d.sounds = sd;
    }
    var mk = raw.marketing;
    if (mk && typeof mk === 'object') {
      if (typeof mk.title === 'string')      d.marketing.title = mk.title;
      if (typeof mk.subtitle === 'string')   d.marketing.subtitle = mk.subtitle;
      if (typeof mk.rules === 'string')      d.marketing.rules = mk.rules;
      if (typeof mk.supportUrl === 'string') d.marketing.supportUrl = mk.supportUrl;
      var rp = Array.isArray(mk.prizes) ? mk.prizes : [];
      d.marketing.prizes = TIER_KEYS.map(function (tier, i) {
        var src = null, j;
        for (j = 0; j < rp.length; j++) {
          if (rp[j] && typeof rp[j] === 'object' && rp[j].tier === tier) { src = rp[j]; break; }
        }
        if (!src && rp[i] && typeof rp[i] === 'object') src = rp[i];
        return {
          tier: tier,
          name:   (src && typeof src.name   === 'string' && src.name)   ? src.name   : d.marketing.prizes[i].name,
          prefix: (src && typeof src.prefix === 'string' && src.prefix) ? src.prefix : d.marketing.prizes[i].prefix
        };
      });
    }
    return d;
  }

  /* ---------------- 模块状态 ---------------- */
  var host = null, root = null;
  var work = null;              // 工作副本（深拷贝），编辑立即 notify
  var cbs = [];                 // onChange 回调
  var opened = false;
  var curTab = 'mole';
  var toastTimer = 0;
  var ui = {};                  // 控件引用

  /* ---------------- 样式（米白纸底 + 印刷红金 + 偏移实色投影） ---------------- */
  var CSS = [
    '.wmcp-root{position:fixed;inset:0;z-index:9990;font-family:system-ui,-apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;color:#2B2622;}',
    '.wmcp-root,.wmcp-root *{box-sizing:border-box;}',
    '.wmcp-root[hidden]{display:none!important;}',
    '.wmcp-mask{position:absolute;inset:0;background:rgba(43,38,34,.55);opacity:0;transition:opacity .22s ease;}',
    '.wmcp-root.wmcp-open .wmcp-mask{opacity:1;}',
    '.wmcp-drawer{position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column;max-height:88%;',
      'background:#FFF9EE;border:2px solid #3A2E24;border-bottom:none;border-radius:8px 8px 0 0;',
      'box-shadow:0 -3px 0 rgba(58,46,36,.9);transform:translateY(105%);transition:transform .26s cubic-bezier(.22,.9,.3,1);}',
    '.wmcp-root.wmcp-open .wmcp-drawer{transform:translateY(0);}',
    '.wmcp-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px 8px 14px;border-bottom:2px solid #3A2E24;flex:0 0 auto;}',
    '.wmcp-title{display:flex;align-items:center;gap:9px;font-size:19px;font-weight:900;letter-spacing:4px;}',
    '.wmcp-seal{width:24px;height:24px;background:#B93A2B;border:2px solid #3A2E24;border-radius:4px;',
      'color:#FFF9EE;font-size:13px;font-weight:900;line-height:20px;text-align:center;letter-spacing:0;flex:0 0 auto;}',
    '.wmcp-close{width:44px;height:44px;flex:0 0 auto;border:2px solid #3A2E24;border-radius:6px;background:#FFF9EE;',
      'color:#2B2622;font:900 16px/1 system-ui;cursor:pointer;box-shadow:2px 2px 0 rgba(58,46,36,.9);}',
    '.wmcp-close:active{transform:translate(1px,1px);box-shadow:1px 1px 0 rgba(58,46,36,.9);}',
    '.wmcp-tabs{display:flex;gap:6px;padding:10px 14px 0;flex:0 0 auto;}',
    '.wmcp-tab{flex:1;min-height:44px;border:2px solid #3A2E24;border-radius:6px;background:#F4EFDF;color:#3A2E24;',
      'font:700 15px/1 system-ui;cursor:pointer;box-shadow:2px 2px 0 rgba(58,46,36,.45);padding:0;}',
    '.wmcp-tab.wmcp-on{background:#B93A2B;color:#FFF9EE;box-shadow:2px 2px 0 rgba(58,46,36,.9);}',
    '.wmcp-body{flex:1 1 auto;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:10px 14px 12px;}',
    '.wmcp-panel[hidden]{display:none!important;}',
    '.wmcp-note{margin:2px 0 10px;font-size:12px;line-height:1.7;color:rgba(58,46,36,.72);}',
    '.wmcp-sec{display:inline-block;margin:12px 0 2px;padding:3px 10px;background:#3A2E24;color:#F4EFDF;',
      'font-size:12px;font-weight:900;letter-spacing:3px;border-radius:4px;}',
    '.wmcp-row{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:52px;padding:8px 0;}',
    '.wmcp-row + .wmcp-row{border-top:1px dashed rgba(58,46,36,.35);}',
    '.wmcp-rowcol{flex-direction:column;align-items:stretch;gap:8px;border-top:none;}',
    '.wmcp-rowtight{min-height:0;padding:6px 0;}',
    '.wmcp-lab{font-size:15px;font-weight:700;}',
    '.wmcp-labsub{display:block;font-size:12px;font-weight:400;color:rgba(58,46,36,.6);margin-top:3px;line-height:1.5;}',
    '.wmcp-seg{display:flex;gap:8px;}',
    '.wmcp-seg button{flex:1;min-height:44px;border:2px solid #3A2E24;border-radius:6px;background:#FFF9EE;color:#3A2E24;',
      'font:700 14px/1.3 system-ui;cursor:pointer;padding:4px 2px;box-shadow:2px 2px 0 rgba(58,46,36,.45);}',
    '.wmcp-seg button.wmcp-on{background:#B93A2B;color:#FFF9EE;box-shadow:2px 2px 0 rgba(58,46,36,.9);}',
    '.wmcp-num{width:84px;min-height:44px;border:2px solid #3A2E24;border-radius:6px;background:#FFFDF6;color:#2B2622;',
      'font:900 16px/1.2 system-ui;text-align:center;flex:0 0 auto;padding:0 4px;}',
    '.wmcp-sw{position:relative;width:56px;height:32px;flex:0 0 auto;cursor:pointer;display:inline-block;}',
    '.wmcp-sw input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer;z-index:2;}',
    '.wmcp-track{position:absolute;inset:0;border:2px solid #3A2E24;border-radius:6px;background:#EFE5D0;transition:background .15s ease;}',
    '.wmcp-knob{position:absolute;top:4px;left:4px;width:22px;height:22px;border:2px solid #3A2E24;border-radius:4px;',
      'background:#C99A3C;transition:left .15s ease;pointer-events:none;}',
    '.wmcp-sw input:checked ~ .wmcp-track{background:#B93A2B;}',
    '.wmcp-sw input:checked ~ .wmcp-knob{left:26px;background:#E4B95B;}',
    '.wmcp-volhead{display:flex;align-items:center;justify-content:space-between;gap:10px;}',
    '.wmcp-volval{min-width:44px;text-align:right;font-size:14px;font-weight:900;color:#B93A2B;}',
    '.wmcp-range{-webkit-appearance:none;appearance:none;display:block;width:100%;height:44px;margin:0;padding:0;',
      'background:transparent;cursor:pointer;}',
    '.wmcp-range::-webkit-slider-runnable-track{height:12px;border:2px solid #3A2E24;border-radius:6px;background:#F4EFDF;}',
    '.wmcp-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:26px;height:26px;margin-top:-7px;',
      'border:2px solid #3A2E24;border-radius:6px;background:#B93A2B;box-shadow:2px 2px 0 rgba(58,46,36,.9);}',
    '.wmcp-range::-moz-range-track{height:12px;border:2px solid #3A2E24;border-radius:6px;background:#F4EFDF;}',
    '.wmcp-range::-moz-range-thumb{width:22px;height:22px;border:2px solid #3A2E24;border-radius:6px;background:#B93A2B;}',
    '.wmcp-btn{min-height:44px;padding:0 14px;border:2px solid #3A2E24;border-radius:6px;background:#FFF9EE;',
      'color:#3A2E24;font:700 14px/1.2 system-ui;cursor:pointer;box-shadow:2px 2px 0 rgba(58,46,36,.9);}',
    '.wmcp-btn:active{transform:translate(1px,1px);box-shadow:1px 1px 0 rgba(58,46,36,.9);}',
    '.wmcp-btn-primary{background:#B93A2B;color:#FFF9EE;}',
    '.wmcp-btn-danger{border-color:#B93A2B;color:#B93A2B;box-shadow:2px 2px 0 rgba(185,58,43,.85);}',
    '.wmcp-btnrow{display:flex;gap:10px;margin:10px 0 2px;}',
    '.wmcp-btnrow .wmcp-btn{flex:1;padding:0 8px;}',
    '.wmcp-btncol{display:flex;flex-direction:column;gap:10px;margin:8px 0 2px;}',
    '.wmcp-btn-block{width:100%;}',
    '.wmcp-datadiv{height:0;border-top:2px dashed rgba(58,46,36,.35);margin:12px 0;}',
    /* 地鼠 tab：2×2 预览格 */
    '.wmcp-molegrid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:4px 0 2px;}',
    '.wmcp-molecard{display:flex;flex-direction:column;gap:6px;padding:8px;border:2px solid #3A2E24;border-radius:6px;',
      'background:#FFFDF6;box-shadow:2px 2px 0 rgba(58,46,36,.45);}',
    '.wmcp-moleprev{position:relative;display:block;width:100%;height:88px;border:2px solid #3A2E24;border-radius:6px;',
      'background:#FFF9EE;overflow:hidden;}',
    '.wmcp-moleprev img{width:100%;height:100%;object-fit:contain;display:block;}',
    '.wmcp-molph{display:flex;width:100%;height:100%;align-items:center;justify-content:center;',
      'background:repeating-linear-gradient(45deg,#F1E7D3 0 5px,#E9DCC1 5px 10px);',
      'color:rgba(58,46,36,.55);font-size:10px;letter-spacing:1px;}',
    '.wmcp-badge{position:absolute;left:-5px;top:-7px;z-index:1;background:#B93A2B;border:1px solid #3A2E24;',
      'border-radius:3px;color:#FFF9EE;font-size:10px;font-weight:700;line-height:1;padding:2px 3px;letter-spacing:1px;white-space:nowrap;}',
    '.wmcp-molename{font-size:15px;font-weight:700;display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;}',
    '.wmcp-molesub{font-size:11px;font-weight:400;color:rgba(58,46,36,.6);}',
    '.wmcp-molestate{font-size:11px;color:rgba(58,46,36,.6);}',
    '.wmcp-molebtns{display:flex;gap:8px;}',
    '.wmcp-molebtns .wmcp-btn{flex:1;min-height:40px;padding:0 6px;font-size:13px;}',
    /* 音效 tab */
    '.wmcp-cuelist{display:flex;flex-direction:column;}',
    '.wmcp-cuerow{display:flex;align-items:center;gap:8px;min-height:56px;padding:7px 0;}',
    '.wmcp-cuerow + .wmcp-cuerow{border-top:1px dashed rgba(58,46,36,.35);}',
    '.wmcp-cuename{flex:1;min-width:0;font-size:15px;font-weight:700;display:flex;align-items:center;gap:6px;flex-wrap:wrap;}',
    '.wmcp-chip{border:1px solid #B93A2B;border-radius:3px;background:rgba(185,58,43,.08);color:#B93A2B;',
      'font-size:10px;font-weight:700;line-height:1;padding:2px 4px;letter-spacing:1px;}',
    '.wmcp-cuerow .wmcp-btn{padding:0 10px;flex:0 0 auto;}',
    /* 营销 tab：文本输入与奖品三档 */
    '.wmcp-txt{display:block;width:100%;min-height:44px;border:2px solid #3A2E24;border-radius:6px;background:#FFFDF6;',
      'color:#2B2622;font:700 15px/1.4 system-ui;padding:8px 10px;}',
    '.wmcp-area{min-height:110px;resize:vertical;font-weight:400;line-height:1.6;}',
    '.wmcp-prize{border:2px dashed rgba(58,46,36,.35);border-radius:6px;padding:8px 10px;margin:8px 0 0;}',
    '.wmcp-prizehead{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;}',
    '.wmcp-prizetier{display:inline-block;padding:2px 8px;background:#C99A3C;border:1px solid #3A2E24;border-radius:4px;',
      'color:#FFF9EE;font-size:12px;font-weight:900;letter-spacing:2px;}',
    '.wmcp-prizehint{font-size:11px;color:rgba(58,46,36,.6);}',
    '.wmcp-prizerow{display:flex;gap:8px;}',
    '.wmcp-prizerow .wmcp-txt{flex:1;min-width:0;}',
    '.wmcp-prefix{flex:0 0 84px;width:84px;text-align:center;letter-spacing:1px;}',
    '.wmcp-foot{flex:0 0 auto;padding:10px 14px calc(12px + env(safe-area-inset-bottom));border-top:2px solid #3A2E24;}',
    '.wmcp-done{width:100%;font-size:16px;letter-spacing:10px;text-indent:10px;}',
    '.wmcp-toast{position:absolute;left:50%;bottom:calc(78px + env(safe-area-inset-bottom));transform:translateX(-50%);',
      'z-index:6;max-width:86%;background:#3A2E24;color:#F4EFDF;font-size:13px;line-height:1.4;padding:9px 14px;',
      'border-radius:4px;border:1px solid rgba(244,239,223,.25);pointer-events:none;',
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.wmcp-toast[hidden]{display:none!important;}',
    '.wmcp-file{display:none!important;}',
    '.wmcp-hide{display:none!important;}',
    '.wmcp-root button:focus-visible,.wmcp-root input:focus-visible,.wmcp-root textarea:focus-visible{outline:3px solid #C99A3C;outline-offset:2px;}',
    '@media (min-width:640px){.wmcp-drawer{left:50%;right:auto;width:480px;margin-left:-240px;',
      'border-bottom:2px solid #3A2E24;border-radius:8px;',
      'box-shadow:-3px -3px 0 rgba(58,46,36,.9),3px -3px 0 rgba(58,46,36,.9);}}'
  ].join('\n');

  function ensureStyle() {
    if (document.getElementById('wmcp-style')) return;
    var st = document.createElement('style');
    st.id = 'wmcp-style';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  /* ---------------- 面板 HTML ---------------- */
  function numRow(key, label, sub) {
    var s = NUMSPEC[key];
    return '<div class="wmcp-row">'
      + '<span class="wmcp-lab">' + label + '<span class="wmcp-labsub">' + sub + '</span></span>'
      + '<input type="number" class="wmcp-num" data-num="' + key + '" min="' + s.min
      + '" max="' + s.max + '" step="' + s.step + '" aria-label="' + label + '">'
      + '</div>';
  }
  function moleCardHTML(m) {
    return '<div class="wmcp-molecard" data-mole="' + m[0] + '">'
      + '<span class="wmcp-moleprev" data-role="moleprev"></span>'
      + '<span class="wmcp-molename">' + esc(m[1]) + '<span class="wmcp-molesub">' + esc(m[2]) + '</span></span>'
      + '<span class="wmcp-molestate" data-role="molestate">默认立绘</span>'
      + '<span class="wmcp-molebtns">'
      + '<button type="button" class="wmcp-btn" data-mact="up">换图</button>'
      + '<button type="button" class="wmcp-btn wmcp-hide" data-mact="reset">还原</button>'
      + '</span>'
      + '</div>';
  }
  function panelMoleHTML() {
    return '<p class="wmcp-note">上传本地图片替换地鼠探头立绘（自动压缩为长边 ≤256px 的 PNG），'
      + '可单项还原或全部还原。被击中表情由程序自动生成，无需上传。</p>'
      + '<div class="wmcp-molegrid" data-role="molelist">'
      + MOLE_TABLE.map(moleCardHTML).join('')
      + '</div>'
      + '<div class="wmcp-btnrow"><button type="button" class="wmcp-btn" data-act="moles-reset">全部还原默认立绘</button></div>'
      + '<input type="file" class="wmcp-file" accept="image/*" data-role="molefile">';
  }
  function cueRowHTML(cue, label) {
    return '<div class="wmcp-cuerow" data-cue="' + cue + '">'
      + '<span class="wmcp-cuename">' + label + '<span class="wmcp-chip wmcp-hide">已自定义</span></span>'
      + '<button type="button" class="wmcp-btn" data-sact="play">试听</button>'
      + '<button type="button" class="wmcp-btn" data-sact="up">换音</button>'
      + '<button type="button" class="wmcp-btn wmcp-hide" data-sact="clear">清除</button>'
      + '</div>';
  }
  function volRow(k, label) {
    return '<div class="wmcp-row wmcp-rowcol wmcp-rowtight">'
      + '<span class="wmcp-volhead"><span class="wmcp-lab">' + label + '</span>'
      + '<span class="wmcp-volval" data-volval="' + k + '">0%</span></span>'
      + '<input type="range" class="wmcp-range" data-vol="' + k + '" min="0" max="1" step="0.05" aria-label="' + label + '">'
      + '</div>';
  }
  function panelSoundHTML() {
    var rows = CUE_TABLE.map(function (c) { return cueRowHTML(c[0], c[1]); }).join('');
    return '<p class="wmcp-note">上传本地音频替换内置合成音（不做压缩），「清除」恢复合成音；'
      + '试听需游戏音效模块支持。</p>'
      + '<div class="wmcp-cuelist">' + rows + '</div>'
      + '<div class="wmcp-sec">音量调节</div>'
      + volRow('bgm', '背景音乐（BGM）')
      + volRow('sfx', '音效（SFX）')
      + volRow('master', '主音量')
      + '<input type="file" class="wmcp-file" accept="audio/*" data-role="sndfile">';
  }
  function panelPlayHTML() {
    var seg = DIFF_KEYS.map(function (g) {
      return '<button type="button" data-diff="' + g[0] + '">' + g[1] + '</button>';
    }).join('');
    return '<p class="wmcp-note">以下为开局时生效的默认玩法参数。</p>'
      + '<div class="wmcp-row wmcp-rowcol">'
      + '<span class="wmcp-lab">默认难度<span class="wmcp-labsub">悠闲最慢最安全 ｜ 疯狂最快、炸弹鼠最多；洞阵恒为 3×3</span></span>'
      + '<div class="wmcp-seg" data-role="diffseg">' + seg + '</div>'
      + '</div>'
      + numRow('timeLimit', '局时（秒）', '每局倒计时秒数，30 – 120')
      + numRow('frenzySec', '狂热持续（秒）', '打中礼盒鼠触发狂热时刻，2 – 8 秒')
      + '<div class="wmcp-row">'
      + '<span class="wmcp-lab">连击倍率<span class="wmcp-labsub">连击 3 起 ×2、6 起 ×3、10 起 ×4 封顶；关闭后恒 ×1</span></span>'
      + '<label class="wmcp-sw"><input type="checkbox" data-role="combo" aria-label="连击倍率开关">'
      + '<span class="wmcp-track"></span><span class="wmcp-knob"></span></label>'
      + '</div>'
      + numRow('baseScore', '地鼠基础分', '普通鼠基准分；金地鼠 ×3、礼盒鼠 ×1.5、炸弹鼠 −2 联动，50 – 300')
      + numRow('dailyLimit', '每日次数', '每天可玩局数，0 = 不限次数');
  }
  function prizeBlockHTML(i) {
    var lab = TIER_LABEL[i];
    return '<div class="wmcp-prize">'
      + '<div class="wmcp-prizehead"><span class="wmcp-prizetier">' + lab[0] + '</span>'
      + '<span class="wmcp-prizehint">' + lab[1] + '</span></div>'
      + '<div class="wmcp-prizerow">'
      + '<input type="text" class="wmcp-txt" data-pidx="' + i + '" data-pkey="name" maxlength="20" placeholder="奖品名称" aria-label="' + lab[0] + '奖品名称">'
      + '<input type="text" class="wmcp-txt wmcp-prefix" data-pidx="' + i + '" data-pkey="prefix" maxlength="6" placeholder="前缀" aria-label="' + lab[0] + '券码前缀">'
      + '</div>'
      + '</div>';
  }
  function panelMktHTML() {
    return '<p class="wmcp-note">以上文案将展示在封面与结算页；平台接入也可调用 WM.marketing.register() 一行接入。</p>'
      + '<div class="wmcp-row wmcp-rowcol">'
      + '<span class="wmcp-lab">活动主标题</span>'
      + '<input type="text" class="wmcp-txt" data-mkt="title" maxlength="24" placeholder="活动主标题" aria-label="活动主标题">'
      + '</div>'
      + '<div class="wmcp-row wmcp-rowcol">'
      + '<span class="wmcp-lab">活动副标题</span>'
      + '<input type="text" class="wmcp-txt" data-mkt="subtitle" maxlength="24" placeholder="活动副标题" aria-label="活动副标题">'
      + '</div>'
      + '<div class="wmcp-row wmcp-rowcol">'
      + '<span class="wmcp-lab">活动规则</span>'
      + '<textarea class="wmcp-txt wmcp-area" data-mkt="rules" maxlength="200" placeholder="活动规则文案" aria-label="活动规则"></textarea>'
      + '</div>'
      + '<div class="wmcp-sec">奖品三档</div>'
      + prizeBlockHTML(0) + prizeBlockHTML(1) + prizeBlockHTML(2)
      + '<div class="wmcp-row wmcp-rowcol" style="margin-top:12px;">'
      + '<span class="wmcp-lab">客服链接<span class="wmcp-labsub">填入 https:// 开头的网址，展示在结算页；留空不展示</span></span>'
      + '<input type="url" class="wmcp-txt" data-mkt="supportUrl" placeholder="https://" aria-label="客服链接">'
      + '</div>';
  }
  function panelDataHTML() {
    return '<p class="wmcp-note">导出为 JSON 文件（wm-config.json），包含全部配置与自定义素材，可备份或分享；'
      + '导入校验失败会提示且不生效。「恢复出厂」与「导入」都不会清除最佳纪录。</p>'
      + '<div class="wmcp-btncol">'
      + '<button type="button" class="wmcp-btn wmcp-btn-primary" data-act="export">导出配置（下载 wm-config.json）</button>'
      + '<button type="button" class="wmcp-btn" data-act="import">导入配置（JSON 文件）</button>'
      + '<button type="button" class="wmcp-btn" data-act="factory">恢复出厂设置</button>'
      + '</div>'
      + '<div class="wmcp-datadiv"></div>'
      + '<button type="button" class="wmcp-btn wmcp-btn-danger wmcp-btn-block" data-act="clearbest">清除最佳纪录（不影响其他配置）</button>'
      + '<input type="file" class="wmcp-file" accept="application/json,.json,text/plain" data-role="cfgfile">';
  }

  function buildDOM() {
    root = document.createElement('div');
    root.className = 'wmcp-root';
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = ''
      + '<div class="wmcp-mask"></div>'
      + '<section class="wmcp-drawer" role="dialog" aria-modal="true" aria-label="活动设置">'
      +   '<header class="wmcp-head">'
      +     '<div class="wmcp-title"><span class="wmcp-seal">鼠</span>活动设置</div>'
      +     '<button type="button" class="wmcp-close" aria-label="关闭设置">✕</button>'
      +   '</header>'
      +   '<nav class="wmcp-tabs" role="tablist">'
      +     TABS.map(function (t) {
              return '<button type="button" class="wmcp-tab" role="tab" data-tab="' + t[0] + '">' + t[1] + '</button>';
            }).join('')
      +   '</nav>'
      +   '<div class="wmcp-body">'
      +     '<div class="wmcp-panel" data-panel="mole">' + panelMoleHTML() + '</div>'
      +     '<div class="wmcp-panel" data-panel="sound" hidden>' + panelSoundHTML() + '</div>'
      +     '<div class="wmcp-panel" data-panel="play" hidden>' + panelPlayHTML() + '</div>'
      +     '<div class="wmcp-panel" data-panel="mkt" hidden>' + panelMktHTML() + '</div>'
      +     '<div class="wmcp-panel" data-panel="data" hidden>' + panelDataHTML() + '</div>'
      +   '</div>'
      +   '<footer class="wmcp-foot">'
      +     '<button type="button" class="wmcp-btn wmcp-btn-primary wmcp-done" data-act="done">完成</button>'
      +   '</footer>'
      +   '<div class="wmcp-toast" data-role="toast" hidden></div>'
      + '</section>';

    ui.toast = root.querySelector('[data-role="toast"]');
    ui.tabs = Array.prototype.slice.call(root.querySelectorAll('.wmcp-tab'));
    ui.panels = Array.prototype.slice.call(root.querySelectorAll('.wmcp-panel'));
    ui.segBtns = Array.prototype.slice.call(root.querySelectorAll('.wmcp-seg button'));
    ui.combo = root.querySelector('[data-role="combo"]');
    ui.molefile = root.querySelector('[data-role="molefile"]');
    ui.sndfile = root.querySelector('[data-role="sndfile"]');
    ui.cfgfile = root.querySelector('[data-role="cfgfile"]');
    ui.vols = {};
    ui.volvals = {};
    ['bgm', 'sfx', 'master'].forEach(function (k) {
      ui.vols[k] = root.querySelector('[data-vol="' + k + '"]');
      ui.volvals[k] = root.querySelector('[data-volval="' + k + '"]');
    });

    root.addEventListener('click', onClick, false);
    root.addEventListener('input', onInput, false);
    root.addEventListener('change', onInputChange, false);
    document.addEventListener('keydown', onKey, false);
  }

  /* ---------------- 事件分发 ---------------- */
  function onClick(e) {
    var t = e.target;
    if (!(t instanceof Element)) return;
    if (t.closest('.wmcp-mask') || t.closest('.wmcp-close')) { close(); return; }
    var tab = t.closest('.wmcp-tab');
    if (tab) { showTab(tab.getAttribute('data-tab')); return; }
    var seg = t.closest('[data-diff]');
    if (seg) {
      if (work) {
        var g = seg.getAttribute('data-diff');
        if (work.diff !== g) { work.diff = g; notify(); syncUI(); }
      }
      return;
    }
    var mact = t.closest('[data-mact]');
    if (mact) { doMoleAct(mact.closest('[data-mole]'), mact.getAttribute('data-mact')); return; }
    var sact = t.closest('[data-sact]');
    if (sact) { doCueAct(sact.closest('[data-cue]'), sact.getAttribute('data-sact')); return; }
    var act = t.closest('[data-act]');
    if (act) doAct(act.getAttribute('data-act'));
  }

  function onInput(e) {
    if (!work) return;
    var t = e.target;
    if (t.classList && t.classList.contains('wmcp-range')) {
      var k = t.getAttribute('data-vol');
      if (k && work.vols && (k in work.vols)) {
        work.vols[k] = clamp01(t.value, 0);
        if (ui.volvals[k]) ui.volvals[k].textContent = pct(work.vols[k]);
        notify();
      }
      return;
    }
    if (t.hasAttribute && t.hasAttribute('data-mkt')) {
      var mk = t.getAttribute('data-mkt');
      if (work.marketing && typeof work.marketing[mk] === 'string') {
        work.marketing[mk] = t.value;
        notify();
      }
      return;
    }
    if (t.hasAttribute && t.hasAttribute('data-pidx')) {
      var i = parseInt(t.getAttribute('data-pidx'), 10);
      var pk = t.getAttribute('data-pkey');
      if (work.marketing && work.marketing.prizes && work.marketing.prizes[i]
        && (pk === 'name' || pk === 'prefix')) {
        work.marketing.prizes[i][pk] = t.value;
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
    if (t === ui.molefile) {
      var f = ui.molefile.files && ui.molefile.files[0];
      var mid = ui.molefile.getAttribute('data-mole');
      ui.molefile.value = '';
      handleMoleFile(mid, f);
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
  function doMoleAct(card, act) {
    if (!card || !work) return;
    var id = card.getAttribute('data-mole');
    if (act === 'up') {
      ui.molefile.setAttribute('data-mole', id);
      ui.molefile.click();
    } else if (act === 'reset') {
      delete work.moles[id];
      notify(); syncUI();
      toast('已还原「' + moleName(id) + '」默认立绘');
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
      case 'moles-reset':
        work.moles = {}; notify(); syncUI();
        toast('已全部还原默认立绘');
        break;
      case 'export': doExport(); break;
      case 'import': ui.cfgfile.click(); break;
      case 'factory':
        work = sanitize(defaultCfg());
        notify(); syncUI();
        toast('已恢复出厂设置（最佳纪录保留）');
        break;
      case 'clearbest':
        /* 特殊标记经 onChange 通道发出，由主游戏处理（非 cfg 字段） */
        cbs.forEach(function (cb) {
          try { cb({ __clearBest: true }); } catch (e) { /* 回调异常不影响面板 */ }
        });
        toast('已请求清除最佳纪录');
        break;
    }
  }

  /* 数值输入钳制：soft=true 输入中即时钳制（空值等待），false 失焦/确认回写 */
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

  function handleMoleFile(id, file) {
    if (!id || !file) return;
    if (file.type && !/^image\//.test(file.type)) { toast('请选择图片文件'); return; }
    readImageToDataURL(file, 256, 'image/png', undefined, function (url) {
      if (!url) { toast('图片读取失败，请换一张试试'); return; }
      if (!work) return;
      work.moles[id] = url;
      notify(); syncUI();
      toast('「' + moleName(id) + '」立绘已更新');
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
      a.download = 'wm-config.json';
      document.body.appendChild(a);
      a.click();
      a.parentNode.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 800);
      toast('配置已导出');
    } catch (e) { toast('导出失败'); }
  }

  function previewCue(cue) {
    var A = window.WM && window.WM.AUDIO;
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

  /* ---------------- 渲染同步 ---------------- */
  function showTab(tab) {
    curTab = TAB_ALIAS[tab] || 'mole';
    ui.tabs.forEach(function (b) {
      var on = b.getAttribute('data-tab') === curTab;
      b.classList.toggle('wmcp-on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    ui.panels.forEach(function (p) {
      p.hidden = p.getAttribute('data-panel') !== curTab;
    });
  }

  function renderMolePreview(prevEl, id, custom) {
    var url = custom || artUrl(id);
    prevEl.innerHTML = '';
    var b = document.createElement('span');
    b.className = 'wmcp-badge' + (custom ? '' : ' wmcp-hide');
    b.textContent = '已自定义';
    prevEl.appendChild(b);
    if (url) {
      var img = document.createElement('img');
      img.setAttribute('alt', moleName(id) + '立绘预览');
      img.setAttribute('src', url);
      prevEl.appendChild(img);
    } else {
      var ph = document.createElement('span');
      ph.className = 'wmcp-molph';
      ph.textContent = '暂无预览';
      prevEl.appendChild(ph);
    }
  }

  function syncUI() {
    if (!root || !work) return;
    /* 玩法 */
    ui.segBtns.forEach(function (b) {
      var on = b.getAttribute('data-diff') === work.diff;
      b.classList.toggle('wmcp-on', on);
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
    /* 地鼠立绘 */
    Array.prototype.forEach.call(root.querySelectorAll('.wmcp-molecard'), function (card) {
      var id = card.getAttribute('data-mole');
      var custom = typeof work.moles[id] === 'string' && work.moles[id];
      var badge = card.querySelector('.wmcp-badge');
      var rb = card.querySelector('[data-mact="reset"]');
      var state = card.querySelector('[data-role="molestate"]');
      if (badge) badge.classList.toggle('wmcp-hide', !custom);
      if (rb) rb.classList.toggle('wmcp-hide', !custom);
      if (state) state.textContent = custom ? '已自定义' : '默认立绘';
      var prev = card.querySelector('[data-role="moleprev"]');
      if (prev) renderMolePreview(prev, id, custom);
    });
    /* 音效 */
    Array.prototype.forEach.call(root.querySelectorAll('.wmcp-cuerow'), function (row) {
      var cue = row.getAttribute('data-cue');
      var custom = typeof work.sounds[cue] === 'string' && work.sounds[cue];
      var chip = row.querySelector('.wmcp-chip');
      var cb = row.querySelector('[data-sact="clear"]');
      if (chip) chip.classList.toggle('wmcp-hide', !custom);
      if (cb) cb.classList.toggle('wmcp-hide', !custom);
    });
    /* 试听按钮：缺 WM.AUDIO 时隐藏 */
    var okAudio = hasAudio();
    Array.prototype.forEach.call(root.querySelectorAll('[data-sact="play"]'), function (b) {
      b.classList.toggle('wmcp-hide', !okAudio);
    });
    /* 营销文案 */
    ['title', 'subtitle', 'rules', 'supportUrl'].forEach(function (k) {
      var el = root.querySelector('[data-mkt="' + k + '"]');
      if (el && document.activeElement !== el && el.value !== work.marketing[k]) {
        el.value = work.marketing[k] || '';
      }
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-pidx]'), function (el) {
      var i = parseInt(el.getAttribute('data-pidx'), 10);
      var key = el.getAttribute('data-pkey');
      var p = work.marketing && work.marketing.prizes && work.marketing.prizes[i];
      if (p && document.activeElement !== el && el.value !== p[key]) el.value = p[key] || '';
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
    var c = (window.WM && window.WM.cfg && typeof window.WM.cfg === 'object')
      ? window.WM.cfg : defaultCfg();
    work = sanitize(deepCopy(c));   // 深拷贝 + schema 补全
    showTab(tab);
    syncUI();
    opened = true;
    root.hidden = false;
    root.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { root.classList.add('wmcp-open'); });
    });
  }

  function close() {
    if (!root || !opened) return;
    opened = false;
    root.classList.remove('wmcp-open');
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

  return { mount: mount, open: open, close: close, isOpen: isOpen, onChange: onChange };
})();
