/* 多福巨奖 777 — DF.CONFIG_PANEL 游戏内配置面板（图标/音效/玩法/数据 四标签）
   面板持有 work 副本（open 时从 DF.cfg 深拷贝），所有编辑改 work 后立即
   onChange(完整 cfg 深拷贝快照)；持久化由主线负责，本模块不碰 localStorage。 */
window.DF = window.DF || {};
DF.CONFIG_PANEL = (() => {
  'use strict';

  /* ------------------------------ 常量 ------------------------------ */
  var TABS = [
    { key: 'icons', label: '图标' },
    { key: 'sound', label: '音效' },
    { key: 'play',  label: '玩法' },
    { key: 'data',  label: '数据' }
  ];
  var TAB_ALIAS = { 图标: 'icons', 音效: 'sound', 玩法: 'play', 数据: 'data' };

  // 可替换图标清单：12 滚轮符号 + 4 金身 + 金币
  var ICON_DEFS = [
    { id: '10',      name: '10',        kind: 'sym',  group: '滚轮符号' },
    { id: 'J',       name: 'J',         kind: 'sym',  group: '滚轮符号' },
    { id: 'Q',       name: 'Q',         kind: 'sym',  group: '滚轮符号' },
    { id: 'K',       name: 'K',         kind: 'sym',  group: '滚轮符号' },
    { id: 'A',       name: 'A',         kind: 'sym',  group: '滚轮符号' },
    { id: 'koi',     name: '金鱼',      kind: 'sym',  group: '滚轮符号' },
    { id: 'frog',    name: '金蟾',      kind: 'sym',  group: '滚轮符号' },
    { id: 'turtle',  name: '金龟',      kind: 'sym',  group: '滚轮符号' },
    { id: 'dragon',  name: '金龙',      kind: 'sym',  group: '滚轮符号' },
    { id: 'ingot',   name: '元宝碗',    kind: 'sym',  group: '滚轮符号' },
    { id: 'gong',    name: '金锣',      kind: 'sym',  group: '滚轮符号' },
    { id: 'wild',    name: '福WILD',    kind: 'sym',  group: '滚轮符号' },
    { id: 'g_koi',   name: '金身·金鱼', kind: 'gold', group: '金身符号' },
    { id: 'g_frog',  name: '金身·金蟾', kind: 'gold', group: '金身符号' },
    { id: 'g_turtle',name: '金身·金龟', kind: 'gold', group: '金身符号' },
    { id: 'g_ingot', name: '金身·元宝', kind: 'gold', group: '金身符号' },
    { id: 'coin',    name: '金币',      kind: 'coin', group: '其他' }
  ];

  var FALLBACK_CUES = ['bgm', 'reelSpin', 'reelStop', 'allStop', 'betUp', 'betDown',
    'button', 'goldLand', 'railFill', 'countTick', 'wayWin', 'winSmall',
    'winMid', 'winBig', 'jackpot', 'freeTrigger', 'pickReveal', 'pickMatch',
    'coinRain', 'refill', 'error'];
  var CUE_CN = {
    bgm: '背景音乐', reelSpin: '滚轮滚动', reelStop: '滚轮制动', allStop: '全部落定',
    betUp: '加注', betDown: '减注', button: '按键嗒', goldLand: '金身上桌',
    railFill: '轨道推进', countTick: '计分滴答', wayWin: '中奖和弦',
    winSmall: '小奖铃', winMid: '中奖铃', winBig: '大奖号角', jackpot: '奖池演出',
    freeTrigger: '免费局锣响', pickReveal: '翻币', pickMatch: '凑齐叮咚',
    coinRain: '金币雨', refill: '补币流入', error: '错误提示'
  };
  var VOL_CN = { master: '总音量', bgm: 'BGM 音量', sfx: '音效音量' };

  // DF.cfg 缺失/缺字段时的兜底 schema（与 DF.LOGIC.defaultCfg 对齐）
  function fallbackCfg() {
    return {
      startCredits: 10000,
      betTiers: [8, 18, 38, 68, 88],
      railNeed: { mini: 80, minor: 115, major: 160, grand: 215 },
      pickWeights: { mini: 0.70, minor: 0.22, major: 0.065, grand: 0.015 },
      fsRemove: ['10', 'J', 'Q'],
      freeSpins: 10, freeRetrigger: 10, tier5Boost: 1.2, fsScale: 1.0,
      stripGold: { frog: 1, koi: 1, turtle: 1, ingot: 1 },
      wildPerReel: 1,
      payDivisor: 12, winScale: 1.0, bigWinTiers: [15, 30],
      jackpots: {
        grand: { seed: 38888.88, grow: 0.010 },
        major: { seed: 6888.88,  grow: 0.006 },
        minor: { seed: 688.88,   grow: 0.003 },
        mini:  { seed: 188.88,   grow: 0.0015 }
      },
      vols: { master: 1, bgm: 0.5, sfx: 1 },
      icons: {}, sounds: {},
      turbo: false, autoStopBigWin: true, sound: true
    };
  }

  /* ------------------------------ 状态 ------------------------------ */
  var container = null, rootEl = null, bodyEl = null, msgEl = null, fileInput = null;
  var tabBtns = {}, paneEls = {}, paneRendered = {};
  var work = null;            // 面板内工作副本（完整 cfg）
  var cbs = [];               // onChange 回调列表
  var visible = false;
  var curTab = 'icons';
  var pending = null;         // {type:'icon'|'sound'|'cfgjson', id}
  var resetArmed = false, resetTimer = 0, msgTimer = 0;

  /* ------------------------------ 工具 ------------------------------ */
  function deep(o) { return JSON.parse(JSON.stringify(o)); }
  function snap() { return deep(work); }
  function emit() {
    var s = snap();
    cbs.forEach(function (cb) { try { cb(s); } catch (e) { console.warn('[DF.CONFIG_PANEL] onChange 回调异常:', e); } });
  }
  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function btn(label, onClick, cls) {
    var b = el('button', 'dfcp-btn' + (cls ? ' ' + cls : ''), label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }
  function cueList() {
    try {
      if (DF.AUDIO && Array.isArray(DF.AUDIO.names) && DF.AUDIO.names.length) return DF.AUDIO.names.slice();
    } catch (e) { /* 忽略 */ }
    return FALLBACK_CUES.slice();
  }
  function hasArt() {
    return !!(DF.ART && typeof DF.ART.symbol === 'function' &&
      typeof DF.ART.gold === 'function' && typeof DF.ART.coin === 'function');
  }
  function defaultIconSrc(def) {
    try {
      if (def.kind === 'coin') return DF.ART.coin();
      if (def.kind === 'gold') return DF.ART.gold(def.id.slice(2)); // 去 g_ 前缀
      return DF.ART.symbol(def.id);
    } catch (e) { return ''; }
  }
  function iconSrc(def) {
    return (work.icons && work.icons[def.id]) || defaultIconSrc(def);
  }
  function showMsg(text) {
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.classList.add('show');
    clearTimeout(msgTimer);
    msgTimer = setTimeout(function () { msgEl.classList.remove('show'); }, 2400);
  }
  // work 缺失字段用兜底 schema 补齐（快照始终是完整 cfg）
  function normalize(w) {
    var base = fallbackCfg();
    Object.keys(base).forEach(function (k) {
      if (w[k] === undefined) w[k] = deep(base[k]);
    });
    if (!w.vols || typeof w.vols !== 'object') w.vols = { master: 1, bgm: 0.5, sfx: 1 };
    ['master', 'bgm', 'sfx'].forEach(function (k) {
      if (typeof w.vols[k] !== 'number') w.vols[k] = base.vols[k];
    });
    if (!w.icons || typeof w.icons !== 'object') w.icons = {};
    if (!w.sounds || typeof w.sounds !== 'object') w.sounds = {};
    return w;
  }

  // file → canvas 压缩 → dataURL（参照 merge-watermelon readImageToDataURL）
  function readImageToDataURL(file, maxSize, mime, quality, cb) {
    var fr = new FileReader();
    fr.onload = function () {
      var img = new Image();
      img.onload = function () {
        var s = Math.min(1, maxSize / Math.max(img.width || 1, img.height || 1));
        var cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round((img.width || maxSize) * s));
        cv.height = Math.max(1, Math.round((img.height || maxSize) * s));
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        cb(cv.toDataURL(mime, quality));
      };
      img.onerror = function () { cb(null); };
      img.src = fr.result;
    };
    fr.onerror = function () { cb(null); };
    fr.readAsDataURL(file);
  }
  function readFileAs(file, as, cb) {
    var fr = new FileReader();
    fr.onload = function () { cb(fr.result); };
    fr.onerror = function () { cb(null); };
    if (as === 'text') fr.readAsText(file); else fr.readAsDataURL(file);
  }

  function deepMerge(dst, src) {
    Object.keys(src).forEach(function (k) {
      var v = src[k];
      if (v && typeof v === 'object' && !Array.isArray(v) &&
          dst[k] && typeof dst[k] === 'object' && !Array.isArray(dst[k])) {
        deepMerge(dst[k], v);
      } else {
        dst[k] = deep(v);
      }
    });
    return dst;
  }

  /* ------------------------------ 样式 ------------------------------ */
  var CSS = `
.dfcp-root{position:fixed;inset:0;z-index:95;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
.dfcp-root[hidden]{display:none!important}
.dfcp-mask{position:absolute;inset:0;background:rgba(8,2,16,.72);backdrop-filter:blur(3px);opacity:0;transition:opacity .25s}
.dfcp-drawer{position:absolute;top:0;right:0;bottom:0;width:min(430px,94vw);display:flex;flex-direction:column;
  background:linear-gradient(170deg,#2c0f42,#160326 70%);border-left:2px solid #d9a83f;
  box-shadow:-10px 0 50px rgba(0,0,0,.7),0 0 20px rgba(217,168,63,.3);
  transform:translateX(100%);transition:transform .28s cubic-bezier(.25,.9,.35,1)}
.dfcp-root.open .dfcp-mask{opacity:1}
.dfcp-root.open .dfcp-drawer{transform:none}
.dfcp-head{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;padding:14px 14px 8px}
.dfcp-head b{font-size:17px;letter-spacing:4px;color:#ffe2a0}
.dfcp-x{width:34px;height:34px;border-radius:50%;font-size:16px;color:#ffdca0;background:rgba(120,20,40,.85);
  border:1.5px solid #d9a83f;flex:0 0 auto}
.dfcp-x:active{transform:scale(.92)}
.dfcp-tabs{flex:0 0 auto;display:flex;gap:6px;padding:4px 12px 10px;border-bottom:1px solid rgba(217,168,63,.35)}
.dfcp-tab{flex:1;min-height:42px;border-radius:11px;font-size:14px;font-weight:800;letter-spacing:2px;color:#c9a5ee;
  background:rgba(40,10,64,.6);border:1.5px solid rgba(165,101,232,.5)}
.dfcp-tab.on{color:#5d1503;background:linear-gradient(180deg,#ffe08a,#f0a12e 60%,#c9862e);border-color:#fff0c2;
  box-shadow:0 2px 10px rgba(255,190,60,.4)}
.dfcp-tab:active{transform:scale(.97)}
.dfcp-body{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;
  padding:10px 12px calc(18px + env(safe-area-inset-bottom))}
.dfcp-sec{margin:0 0 12px;border-radius:13px;overflow:hidden;background:rgba(52,16,84,.35);border:1px solid rgba(217,168,63,.3)}
.dfcp-sec>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:8px;min-height:44px;padding:8px 14px;
  font-size:13px;font-weight:800;letter-spacing:2px;color:#ffd257;user-select:none}
.dfcp-sec>summary::-webkit-details-marker{display:none}
.dfcp-sec>summary::after{content:"▾";margin-left:auto;color:#c9a5ee;transition:transform .2s}
.dfcp-sec:not([open])>summary::after{transform:rotate(-90deg)}
.dfcp-item{display:flex;align-items:center;gap:10px;padding:8px 12px;border-top:1px solid rgba(217,168,63,.15);min-height:56px}
.dfcp-item:first-of-type{border-top:none}
.dfcp-ico{width:46px;height:46px;flex:0 0 auto;object-fit:contain;border-radius:9px;
  background:rgba(10,2,20,.55);border:1.5px solid rgba(217,168,63,.55)}
.dfcp-meta{flex:1;min-width:0}
.dfcp-meta b{display:block;font-size:14px;color:#fff3cf}
.dfcp-meta small{display:block;font-size:11px;color:#9d86c9;margin-top:2px}
.dfcp-meta small.custom{color:#ffd257}
.dfcp-btn{min-height:38px;padding:7px 13px;border-radius:10px;font-size:13px;font-weight:700;color:#ffe6b3;
  background:linear-gradient(180deg,#3c1560,#22093a);border:1.5px solid #a565e8;flex:0 0 auto}
.dfcp-btn:active{transform:scale(.96)}
.dfcp-btn.gold{color:#5d1503;background:linear-gradient(180deg,#ffe08a,#f0a12e 60%,#c9862e);border-color:#fff0c2;font-weight:800}
.dfcp-btn.danger{color:#ffd7cf;background:linear-gradient(180deg,#6e1420,#42060e);border-color:#e0573f}
.dfcp-btn.wide{width:100%;min-height:46px;font-size:15px;letter-spacing:2px}
.dfcp-note{font-size:12px;line-height:1.7;color:#c9a5ee;padding:10px 4px 6px}
.dfcp-cue{display:flex;align-items:center;gap:8px;padding:7px 12px;border-top:1px solid rgba(217,168,63,.15);min-height:54px;flex-wrap:wrap}
.dfcp-cue .dfcp-meta{flex:1 1 96px}
.dfcp-cue .dfcp-btn{min-height:34px;padding:5px 10px;font-size:12px}
.dfcp-frow{display:flex;align-items:center;gap:10px;padding:10px 14px;border-top:1px solid rgba(217,168,63,.15);min-height:54px;flex-wrap:wrap}
.dfcp-frow:first-child{border-top:none}
.dfcp-flabel{flex:1 1 92px;font-size:14px;font-weight:700;color:#ffe6b3}
.dfcp-flabel small{display:block;font-size:11px;font-weight:500;color:#9d86c9;margin-top:2px}
.dfcp-num{box-sizing:border-box;width:86px;min-height:40px;padding:6px 8px;border-radius:10px;text-align:center;font-size:15px;font-weight:700;
  color:#fff3cf;background:rgba(10,2,20,.7);border:1.5px solid #d9a83f;-webkit-appearance:none;appearance:none}
.dfcp-num:focus{outline:none;border-color:#ffd257;box-shadow:0 0 8px rgba(255,210,87,.5)}
.dfcp-arr{display:flex;gap:6px;flex-wrap:wrap}
.dfcp-arr .dfcp-cell{display:flex;flex-direction:column;align-items:center;gap:3px}
.dfcp-arr .dfcp-cell i{font-style:normal;font-size:10px;color:#c9a5ee}
.dfcp-arr .dfcp-num{width:62px;min-height:38px;font-size:14px}
.dfcp-slider{flex:1 1 130px;min-height:34px;accent-color:#f2b93c;cursor:pointer}
.dfcp-val{flex:0 0 44px;text-align:center;font-size:13px;font-weight:800;color:#ffd257}
.dfcp-chk{width:24px;height:24px;accent-color:#f2b93c;cursor:pointer;flex:0 0 auto}
.dfcp-data{display:flex;flex-direction:column;gap:10px;padding:12px 4px}
.dfcp-data p{margin:0;font-size:12px;line-height:1.7;color:#c9a5ee}
.dfcp-msg{position:absolute;left:50%;bottom:calc(20px + env(safe-area-inset-bottom));transform:translateX(-50%) translateY(8px);
  max-width:86%;background:rgba(20,4,30,.94);border:1.5px solid #d9a83f;color:#ffe6b3;font-size:13px;font-weight:700;
  padding:9px 18px;border-radius:999px;box-shadow:0 6px 24px rgba(0,0,0,.6);opacity:0;transition:all .25s;pointer-events:none;
  text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dfcp-msg.show{opacity:1;transform:translateX(-50%) translateY(0)}
@media (max-width:640px){
  .dfcp-drawer{top:auto;left:0;right:0;bottom:0;width:auto;height:86dvh;border-radius:18px 18px 0 0;
    border-left:none;border-top:2px solid #d9a83f;transform:translateY(100%)}
  .dfcp-root.open .dfcp-drawer{transform:none}
  .dfcp-num{width:78px}
}`;
  var styleEl = null;

  /* ------------------------------ DOM 构建 ------------------------------ */
  function buildSkeleton() {
    styleEl = document.createElement('style');
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);

    rootEl = el('div', 'dfcp-root');
    rootEl.hidden = true;

    var mask = el('div', 'dfcp-mask');
    mask.addEventListener('click', close);
    rootEl.appendChild(mask);

    var drawer = el('aside', 'dfcp-drawer');
    var head = el('div', 'dfcp-head');
    head.appendChild(el('b', null, '设 置'));
    var x = btn('✕', close, '');
    x.className = 'dfcp-x';
    head.appendChild(x);
    drawer.appendChild(head);

    var tabs = el('div', 'dfcp-tabs');
    TABS.forEach(function (t) {
      var b = el('button', 'dfcp-tab', t.label);
      b.type = 'button';
      b.addEventListener('click', function () { setTab(t.key); });
      tabBtns[t.key] = b;
      tabs.appendChild(b);
    });
    drawer.appendChild(tabs);

    bodyEl = el('div', 'dfcp-body');
    TABS.forEach(function (t) {
      var p = el('section', 'dfcp-pane');
      p.hidden = true;
      paneEls[t.key] = p;
      bodyEl.appendChild(p);
    });
    drawer.appendChild(bodyEl);

    msgEl = el('div', 'dfcp-msg');
    drawer.appendChild(msgEl);

    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.hidden = true;
    fileInput.addEventListener('change', onFilePicked);

    rootEl.appendChild(drawer);
    rootEl.appendChild(fileInput);
    container.appendChild(rootEl);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && visible) close();
    });
  }

  function setTab(key) {
    curTab = key;
    TABS.forEach(function (t) {
      tabBtns[t.key].classList.toggle('on', t.key === key);
      var render = { icons: renderIconsPane, sound: renderSoundPane, play: renderPlayPane, data: renderDataPane }[t.key];
      if (t.key === key) { render(paneEls[t.key]); paneEls[t.key].hidden = false; }
      else paneEls[t.key].hidden = true;
    });
    bodyEl.scrollTop = 0;
  }

  /* ------------------------------ 图标页 ------------------------------ */
  function iconRow(def) {
    var row = el('div', 'dfcp-item');
    var img = el('img', 'dfcp-ico');
    img.alt = def.name;
    img.src = iconSrc(def);
    row.appendChild(img);

    var meta = el('div', 'dfcp-meta');
    meta.appendChild(el('b', null, def.name));
    var badge = el('small', work.icons[def.id] ? 'custom' : null, work.icons[def.id] ? '已自定义' : '默认图');
    meta.appendChild(badge);
    row.appendChild(meta);

    row.appendChild(btn('上传', function () {
      pending = { type: 'icon', id: def.id };
      fileInput.accept = 'image/*';
      fileInput.value = '';
      fileInput.click();
    }));
    row.appendChild(btn('恢复默认', function () {
      if (!work.icons[def.id]) { showMsg(def.name + '：已是默认图'); return; }
      delete work.icons[def.id];
      img.src = iconSrc(def);
      badge.textContent = '默认图';
      badge.className = '';
      emit();
    }));
    return row;
  }

  function renderIconsPane(pane) {
    pane.textContent = '';
    pane.appendChild(el('div', 'dfcp-note',
      '替换滚轮符号 / 金身 / 金币图片，上传后自动压缩到 128px 并立即生效。'));

    var groups = [{ title: '滚轮符号', open: true }, { title: '金身符号', open: true }, { title: '其他', open: true }];
    groups.forEach(function (g) {
      var det = el('details', 'dfcp-sec');
      det.open = g.open;
      var sum = el('summary', null, g.title);
      det.appendChild(sum);
      ICON_DEFS.forEach(function (def) { if (def.group === g.title) det.appendChild(iconRow(def)); });
      pane.appendChild(det);
    });
  }

  /* ------------------------------ 音效页 ------------------------------ */
  function cueRow(cue) {
    var row = el('div', 'dfcp-cue');
    var meta = el('div', 'dfcp-meta');
    meta.appendChild(el('b', null, CUE_CN[cue] || cue));
    var badge = el('small', work.sounds[cue] ? 'custom' : null,
      work.sounds[cue] ? '已自定义' : cue);
    meta.appendChild(badge);
    row.appendChild(meta);

    row.appendChild(btn('上传自定义', function () {
      pending = { type: 'sound', id: cue };
      fileInput.accept = 'audio/*';
      fileInput.value = '';
      fileInput.click();
    }));
    row.appendChild(btn('恢复', function () {
      if (!work.sounds[cue]) { showMsg((CUE_CN[cue] || cue) + '：已是合成音效'); return; }
      delete work.sounds[cue];
      badge.textContent = cue;
      badge.className = '';
      emit();
    }));
    return row;
  }

  function volRow(key) {
    var row = el('div', 'dfcp-frow');
    var lab = el('div', 'dfcp-flabel', VOL_CN[key]);
    row.appendChild(lab);
    var range = document.createElement('input');
    range.className = 'dfcp-slider';
    range.type = 'range';
    range.min = '0'; range.max = '1'; range.step = '0.05';
    range.value = String(work.vols[key]);
    var val = el('span', 'dfcp-val', Number(work.vols[key]).toFixed(2));
    range.addEventListener('input', function () {
      work.vols[key] = parseFloat(range.value);
      val.textContent = Number(range.value).toFixed(2);
      emit();
    });
    row.appendChild(range);
    row.appendChild(val);
    return row;
  }

  function renderSoundPane(pane) {
    pane.textContent = '';
    pane.appendChild(el('div', 'dfcp-note',
      '为音效 cue 上传自定义音频（wav/mp3/ogg），恢复后回到程序化合成。'));

    var det = el('details', 'dfcp-sec');
    det.open = true;
    det.appendChild(el('summary', null, '音效清单（' + cueList().length + ' 个）'));
    cueList().forEach(function (cue) { det.appendChild(cueRow(cue)); });
    pane.appendChild(det);

    var volSec = el('details', 'dfcp-sec');
    volSec.open = true;
    volSec.appendChild(el('summary', null, '音量与开关'));
    ['master', 'bgm', 'sfx'].forEach(function (k) { volSec.appendChild(volRow(k)); });

    var sndRow = el('div', 'dfcp-frow');
    sndRow.appendChild(el('div', 'dfcp-flabel', '声音开关'));
    var chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.className = 'dfcp-chk';
    chk.checked = !!work.sound;
    chk.addEventListener('change', function () { work.sound = chk.checked; emit(); });
    sndRow.appendChild(chk);
    volSec.appendChild(sndRow);
    pane.appendChild(volSec);
  }

  /* ------------------------------ 玩法页 ------------------------------ */
  function numField(attrs, get, set) {
    var input = document.createElement('input');
    input.className = 'dfcp-num';
    input.type = 'number';
    input.inputMode = 'decimal';
    Object.keys(attrs).forEach(function (k) { input.setAttribute(k, attrs[k]); });
    input.value = String(get());
    input.addEventListener('change', function () {
      var v = parseFloat(input.value);
      if (isNaN(v)) { input.value = String(get()); showMsg('请输入有效数字'); return; }
      if (attrs.min != null) v = Math.max(parseFloat(attrs.min), v);
      if (attrs.max != null) v = Math.min(parseFloat(attrs.max), v);
      set(v);
      input.value = String(v);
      emit();
    });
    return input;
  }
  function fieldRow(label, hint, control) {
    var row = el('div', 'dfcp-frow');
    var lab = el('div', 'dfcp-flabel', label);
    if (hint) lab.appendChild(el('small', null, hint));
    row.appendChild(lab);
    row.appendChild(control);
    return row;
  }
  function checkRow(label, get, set) {
    var row = el('div', 'dfcp-frow');
    row.appendChild(el('div', 'dfcp-flabel', label));
    var chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.className = 'dfcp-chk';
    chk.checked = !!get();
    chk.addEventListener('change', function () { set(chk.checked); emit(); });
    row.appendChild(chk);
    return row;
  }
  function arrRow(label, cells) {
    // cells: [{sub, attrs, get, set}]
    var arr = el('div', 'dfcp-arr');
    cells.forEach(function (c) {
      var cell = el('div', 'dfcp-cell');
      if (c.sub) cell.appendChild(el('i', null, c.sub));
      cell.appendChild(numField(c.attrs, c.get, c.set));
      arr.appendChild(cell);
    });
    return fieldRow(label, null, arr);
  }

  function renderPlayPane(pane) {
    pane.textContent = '';
    var sec = el('details', 'dfcp-sec');
    sec.open = true;
    sec.appendChild(el('summary', null, '积分与押注'));
    sec.appendChild(fieldRow('初始积分', null,
      numField({ min: '0', step: '100' }, function () { return work.startCredits; },
        function (v) { work.startCredits = v; })));
    sec.appendChild(arrRow('押注档位', work.betTiers.map(function (_, i) {
      return {
        sub: '档' + (i + 1),
        attrs: { min: '1', step: '1' },
        get: function () { return work.betTiers[i]; },
        set: function (v) { work.betTiers[i] = v; }
      };
    })));
    pane.appendChild(sec);

    var rail = el('details', 'dfcp-sec');
    rail.open = true;
    rail.appendChild(el('summary', null, '奖池轨道需求'));
    var railCells = [
      { key: 'mini', cn: '小奖' }, { key: 'minor', cn: '中奖' },
      { key: 'major', cn: '大奖' }, { key: 'grand', cn: '巨奖' }
    ].map(function (r) {
      return {
        sub: r.cn,
        attrs: { min: '1', step: '1' },
        get: function () { return work.railNeed[r.key]; },
        set: function (v) { work.railNeed[r.key] = v; }
      };
    });
    rail.appendChild(arrRow('轨道需求', railCells));
    pane.appendChild(rail);

    var fs = el('details', 'dfcp-sec');
    fs.open = true;
    fs.appendChild(el('summary', null, '免费局'));
    fs.appendChild(fieldRow('免费局次数', null,
      numField({ min: '3', max: '50', step: '1' }, function () { return work.freeSpins; },
        function (v) { work.freeSpins = v; })));
    fs.appendChild(fieldRow('追加次数', '再触发 3+ 金锣时追加',
      numField({ min: '0', max: '50', step: '1' }, function () { return work.freeRetrigger; },
        function (v) { work.freeRetrigger = v; })));
    pane.appendChild(fs);

    var win = el('details', 'dfcp-sec');
    win.open = true;
    win.appendChild(el('summary', null, '赔付与大奖'));
    var tierArr = el('div', 'dfcp-arr');
    [['大奖 ≥', 0], ['超级大奖 ≥', 1]].forEach(function (p) {
      var cell = el('div', 'dfcp-cell');
      cell.appendChild(el('i', null, p[0]));
      cell.appendChild(numField({ min: '1', step: '1' },
        function () { return work.bigWinTiers[p[1]]; },
        function (v) { work.bigWinTiers[p[1]] = v; }));
      tierArr.appendChild(cell);
    });
    win.appendChild(fieldRow('大奖倍率阈值', '本轮赢分 ÷ 押注', tierArr));

    var srow = el('div', 'dfcp-frow');
    srow.appendChild(el('div', 'dfcp-flabel', '中奖倍率 winScale'));
    var srange = document.createElement('input');
    srange.className = 'dfcp-slider';
    srange.type = 'range';
    srange.min = '0.5'; srange.max = '2'; srange.step = '0.05';
    srange.value = String(work.winScale);
    var sval = el('span', 'dfcp-val', '×' + Number(work.winScale).toFixed(2));
    srange.addEventListener('input', function () {
      work.winScale = parseFloat(srange.value);
      sval.textContent = '×' + Number(srange.value).toFixed(2);
      emit();
    });
    srow.appendChild(srange);
    srow.appendChild(sval);
    win.appendChild(srow);

    win.appendChild(fieldRow('每路赔付除数', '越小赢越大',
      numField({ min: '1', step: '1' }, function () { return work.payDivisor; },
        function (v) { work.payDivisor = v; })));
    win.appendChild(checkRow('大奖自动停', function () { return work.autoStopBigWin; },
      function (v) { work.autoStopBigWin = v; }));
    win.appendChild(checkRow('快速旋转', function () { return work.turbo; },
      function (v) { work.turbo = v; }));
    pane.appendChild(win);
  }

  /* ------------------------------ 数据页 ------------------------------ */
  function renderDataPane(pane) {
    pane.textContent = '';
    var wrap = el('div', 'dfcp-data');

    wrap.appendChild(el('p', null, '导出当前全部配置（含自定义图标/音效的 dataURL）为 JSON 文件；导入会覆盖当前配置并立即生效。'));

    var exp = btn('导出配置 JSON', function () {
      try {
        var blob = new Blob([JSON.stringify(snap(), null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'df777-config.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
        showMsg('已导出 df777-config.json');
      } catch (e) { showMsg('导出失败：' + e.message); }
    }, 'gold wide');
    wrap.appendChild(exp);

    var imp = btn('导入配置 JSON', function () {
      pending = { type: 'cfgjson' };
      fileInput.accept = '.json,application/json';
      fileInput.value = '';
      fileInput.click();
    }, 'wide');
    wrap.appendChild(imp);

    var rst = btn('一键恢复出厂', function () {
      if (!resetArmed) {
        resetArmed = true;
        rst.textContent = '再点一次确认恢复出厂';
        rst.classList.add('danger');
        clearTimeout(resetTimer);
        resetTimer = setTimeout(function () {
          resetArmed = false;
          if (rst.isConnected) { rst.textContent = '一键恢复出厂'; rst.classList.remove('danger'); }
        }, 3000);
        return;
      }
      resetArmed = false;
      clearTimeout(resetTimer);
      var base = fallbackCfg();
      try { if (DF.LOGIC && typeof DF.LOGIC.defaultCfg === 'function') base = DF.LOGIC.defaultCfg(); } catch (e) { /* 忽略 */ }
      base = normalize(base);
      base.icons = {};
      base.sounds = {};
      base.vols = deep(work.vols);   // 保留音量听感设置
      base.sound = !!work.sound;
      work = base;
      emit();
      setTab(curTab);               // 重绘当前页（切页时其余页会重绘）
      showMsg('已恢复出厂设置（保留音量）');
    }, 'danger wide');
    wrap.appendChild(rst);

    wrap.appendChild(el('p', null, '提示：积分、奖池等运行时进度存于游戏存档，此处仅管理配置。'));
    pane.appendChild(wrap);
  }

  /* ------------------------------ 文件选择分发 ------------------------------ */
  function onFilePicked() {
    var f = fileInput.files && fileInput.files[0];
    var req = pending;
    pending = null;
    fileInput.value = '';
    if (!f || !req) return;

    if (req.type === 'icon') {
      readImageToDataURL(f, 128, 'image/png', 0.92, function (dataURL) {
        if (!dataURL) { showMsg('图片读取失败'); return; }
        work.icons[req.id] = dataURL;
        emit();
        setTab('icons');  // 重绘以刷新该行预览
        showMsg('图标已更新：' + (ICON_DEFS.filter(function (d) { return d.id === req.id; })[0] || {}).name);
      });
    } else if (req.type === 'sound') {
      readFileAs(f, 'url', function (dataURL) {
        if (!dataURL) { showMsg('音频读取失败'); return; }
        work.sounds[req.id] = dataURL;
        emit();
        setTab('sound');
        showMsg('音效已更新：' + (CUE_CN[req.id] || req.id));
      });
    } else if (req.type === 'cfgjson') {
      readFileAs(f, 'text', function (text) {
        var obj;
        try { obj = JSON.parse(text); } catch (e) { showMsg('JSON 解析失败'); return; }
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) { showMsg('配置格式不正确'); return; }
        work = normalize(deepMerge(work, obj));
        emit();
        setTab(curTab);
        showMsg('配置已导入并生效');
      });
    }
  }

  /* ------------------------------ 对外 API ------------------------------ */
  function tabKey(t) {
    if (t == null) return null;
    return TAB_ALIAS[t] || (TABS.some(function (x) { return x.key === t; }) ? t : null);
  }
  function mount(containerEl) {
    var host = containerEl || document.body;
    if (container === host && rootEl && rootEl.isConnected) return;
    if (rootEl && rootEl.isConnected && rootEl.parentNode) rootEl.parentNode.removeChild(rootEl);
    if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
    container = host;
    buildSkeleton();
    if (visible) { rootEl.hidden = false; rootEl.classList.add('open'); setTab(curTab); }
  }
  function open(tab) {
    if (!rootEl || !rootEl.isConnected) mount(document.body);
    work = normalize(deep((typeof DF !== 'undefined' && DF.cfg) ? DF.cfg : fallbackCfg()));
    var k = tabKey(tab);
    visible = true;
    rootEl.hidden = false;
    void rootEl.offsetWidth;   // 强制回流，保证抽屉滑入过渡生效
    rootEl.classList.add('open');
    setTab(k || curTab || 'icons');
  }
  function close() {
    if (!rootEl) return;
    visible = false;
    rootEl.classList.remove('open');
    setTimeout(function () { if (!visible && rootEl) rootEl.hidden = true; }, 300);
  }
  function isOpen() { return !!visible; }
  function onChange(cb) {
    if (typeof cb !== 'function') return function () {};
    cbs.push(cb);
    return function () {
      var i = cbs.indexOf(cb);
      if (i >= 0) cbs.splice(i, 1);
    };
  }

  return { mount: mount, open: open, close: close, isOpen: isOpen, onChange: onChange };
})();
