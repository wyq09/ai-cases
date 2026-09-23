/* =========================================================
 * 羊了个羊 · 游戏内设置面板 — SH.PANEL
 * 契约接口：mount({root,get,onChange,onClose,stats,onClearProgress,audioNames,onAudioOverride})
 *           open() / close() / isOpen()
 * - open() 时 work = sanitize(deepCopy(opts.get()))，缺失字段补默认值
 * - 任何编辑先改 work，再 onChange(完整深拷贝快照)；音效替换额外走 onAudioOverride(map)
 * - 永不直接读写持久化存储；清进度只通过 onClearProgress 回调
 * - 图片先缩放再入 cfg：图标 256px / 背景 720px（canvas → PNG dataURI）
 * - 样式内联注入一次，类名前缀 shcp-；暖米白 + 木棕抽屉
 * ======================================================= */
window.SH = window.SH || {};
SH.PANEL = (function () {
  'use strict';

  /* ---------------- 默认配置（与 logic.DEFAULT_CFG 对齐） ---------------- */
  function defaultCfg() {
    return {
      slots: 7, kindsStart: 5, kindsMax: 12,
      tilesStart: 30, tilesPerLevel: 12, tilesMax: 150,
      layersStart: 3, layersMax: 8,
      density: 0.6, sideStacks: 2, sideLen: 5,
      propsOut: 1, propsUndo: 1, propsShuffle: 1,
      revives: 1, guaranteed: true, breatherEvery: 5,
      icons: {}, bgCustom: '', tileSkin: 0,
      sfxVol: 0.9, bgmVol: 0.45, muted: false,
      audioOverrides: {}
    };
  }

  var KINDS = ['carrot', 'cabbage', 'corn', 'mushroom', 'scissors', 'flame', 'grass', 'pine',
               'cotton', 'bucket', 'sickle', 'fork', 'hat', 'glove'];
  var KIND_NAME = {
    carrot: '胡萝卜', cabbage: '白菜', corn: '玉米', mushroom: '蘑菇',
    scissors: '剪刀', flame: '火苗', grass: '小草', pine: '松树',
    cotton: '棉花', bucket: '水桶', sickle: '镰刀', fork: '草叉',
    hat: '草帽', glove: '手套'
  };
  var CUE_TABLE = [
    ['pick', '拿牌'], ['place', '落槽'], ['match', '消除'], ['deny', '点不了'],
    ['out', '移出'], ['undo', '撤销'], ['shuffle', '洗牌'], ['win', '过关'],
    ['lose', '失败'], ['click', '点击'], ['revive', '复活'], ['bgm', '背景音乐']
  ];
  var SKINS = [['米白', '#FDF6E9', '#E4D3B2'], ['纸浆', '#F0E4CB', '#CBB48C'], ['薄荷', '#E2EFE4', '#A8CBB0']];
  var TABS = [['play', '玩法'], ['look', '外观'], ['av', '音画/数据']];

  /* 滑杆注册表：key -> [标签, min, max, step, 说明] */
  var SLIDERS = {
    slots:         ['槽位格数', 5, 9, 1, '底部待消槽位数，越少越难'],
    kindsStart:    ['首关种类', 3, 8, 1, '第 1 关出现的图案种类数'],
    kindsMax:      ['种类上限', 6, 14, 1, '关卡成长中图案种类的天花板'],
    tilesStart:    ['首关牌数', 24, 60, 3, '第 1 关的牌总数（按 3 的倍数取整）'],
    tilesPerLevel: ['每关增量', 0, 24, 1, '每过一关增加的牌数'],
    tilesMax:      ['牌数上限', 60, 198, 3, '关卡牌数的天花板'],
    layersStart:   ['首关层数', 2, 5, 1, '第 1 关牌堆的叠层层数'],
    layersMax:     ['层数上限', 3, 9, 1, '叠层层数的天花板'],
    density:       ['叠压密度', 0.4, 0.85, 0.05, '上层牌压住下层牌的程度，越高越缠'],
    sideLen:       ['侧堆长度', 3, 8, 1, '每条侧堆柱的牌数'],
    propsOut:      ['移出道具', 0, 9, 1, '「移出」每关可用次数'],
    propsUndo:     ['撤销道具', 0, 9, 1, '「撤销」每关可用次数'],
    propsShuffle:  ['洗牌道具', 0, 9, 1, '「洗牌」每关可用次数'],
    revives:       ['复活次数', 0, 3, 1, '失败弹窗里每关可复活的次数'],
    breatherEvery: ['喘息关间隔', 0, 10, 1, '每 N 关安排一关低难喘息关（0=关闭）'],
    sfxVol:        ['音效音量', 0, 1, 0.05, ''],
    bgmVol:        ['音乐音量', 0, 1, 0.05, '']
  };
  var PLAY_ORDER = ['slots', 'kindsStart', 'kindsMax', 'tilesStart', 'tilesPerLevel', 'tilesMax',
                    'layersStart', 'layersMax', 'density', 'sideLen',
                    'propsOut', 'propsUndo', 'propsShuffle', 'revives', 'breatherEvery'];
  var FMT = {
    slots: function (v) { return v + ' 格'; },
    kindsStart: function (v) { return v + ' 种'; },
    kindsMax: function (v) { return v + ' 种'; },
    tilesStart: function (v) { return v + ' 张'; },
    tilesPerLevel: function (v) { return '+' + v + ' 张'; },
    tilesMax: function (v) { return v + ' 张'; },
    layersStart: function (v) { return v + ' 层'; },
    layersMax: function (v) { return v + ' 层'; },
    density: function (v) { return (Math.round(v * 100) / 100).toFixed(2); },
    sideLen: function (v) { return v + ' 张'; },
    propsOut: function (v) { return v + ' 次'; },
    propsUndo: function (v) { return v + ' 次'; },
    propsShuffle: function (v) { return v + ' 次'; },
    revives: function (v) { return v + ' 次'; },
    breatherEvery: function (v) { return v === 0 ? '无' : '每 ' + v + ' 关'; },
    sfxVol: function (v) { return Math.round(v * 100) + '%'; },
    bgmVol: function (v) { return Math.round(v * 100) + '%'; }
  };
  var ARM_TEXT = { resetcfg: '恢复出厂设置', clearprog: '清除进度存档' };

  /* ---------------- 工具 ---------------- */
  function deepCopy(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function clamp(v, min, max, fb) {
    var n = Number(v);
    return isFinite(n) ? Math.min(max, Math.max(min, n)) : fb;
  }
  function stepClamp(v, min, max, step, fb) {
    var n = Number(v);
    if (!isFinite(n)) return fb;
    n = Math.min(max, Math.max(min, n));
    n = min + Math.round((n - min) / step) * step;
    n = Math.min(max, Math.max(min, n));
    return step < 1 ? Math.round(n * 100) / 100 : Math.round(n);
  }
  function cueLabel(id) {
    for (var i = 0; i < CUE_TABLE.length; i++) if (CUE_TABLE[i][0] === id) return CUE_TABLE[i][1];
    return id;
  }
  function cueList() {
    var names = opts && opts.audioNames;
    if (names && names.length) {
      return names.map(function (n) { return [n, cueLabel(n)]; });
    }
    return CUE_TABLE.slice();
  }
  function hasAudio() {
    try {
      return !!(window.SH && window.SH.AUDIO && typeof window.SH.AUDIO.play === 'function');
    } catch (e) { return false; }
  }
  function placeholderIcon(label) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">'
      + '<rect width="48" height="48" rx="9" fill="#F0E4CC"/>'
      + '<text x="24" y="29" font-size="13" text-anchor="middle" fill="#8A5A2A" font-family="sans-serif">' + label + '</text>'
      + '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  function iconSrc(id) {
    var custom = work && work.icons && typeof work.icons[id] === 'string' ? work.icons[id] : '';
    if (custom) return custom;
    try {
      if (window.SH && window.SH.ART && typeof window.SH.ART.icon === 'function') {
        var u = window.SH.ART.icon(id);
        if (typeof u === 'string' && u) return u;
      }
    } catch (e) {}
    return placeholderIcon(KIND_NAME[id] || id);
  }
  function bgSrc() {
    if (work && typeof work.bgCustom === 'string' && work.bgCustom) return work.bgCustom;
    try {
      if (window.SH && window.SH.ART && typeof window.SH.ART.bg === 'function') {
        var u = window.SH.ART.bg(0);
        if (typeof u === 'string' && u) return u;
      }
    } catch (e) {}
    return placeholderIcon('背景');
  }
  function skinSwatch(i) {
    try {
      if (window.SH && window.SH.ART && typeof window.SH.ART.tileSkin === 'function') {
        var s = window.SH.ART.tileSkin(i);
        if (s && s.fill && s.edge) return [s.fill, s.edge];
      }
    } catch (e) {}
    return [SKINS[i][1], SKINS[i][2]];
  }
  /* 难度粗评：按首关牌量 / 种类 / 密度 / 槽位稀缺 / 层数打分 */
  function difficultyLine() {
    if (!work) return '';
    var tn = clamp((work.tilesStart - 24) / 36, 0, 1, 0);
    var kn = clamp((work.kindsStart - 3) / 5, 0, 1, 0);
    var dn = clamp((work.density - 0.4) / 0.45, 0, 1, 0);
    var sn = clamp((9 - work.slots) / 4, 0, 1, 0);
    var ln = clamp((work.layersStart - 2) / 3, 0, 1, 0);
    var score = tn * 0.36 + kn * 0.20 + dn * 0.26 + sn * 0.10 + ln * 0.08;
    var name, desc;
    if (!work.guaranteed) { name = '地狱'; desc = '未验证可解，纯属硬核自虐'; }
    else if (score < 0.36) { name = '休闲'; desc = '牌少层浅，随手点点就能过'; }
    else if (score < 0.56) { name = '进阶'; desc = '有点上头，偶尔要动动脑'; }
    else if (score < 0.76) { name = '硬核'; desc = '槽位紧张，得算着拿牌'; }
    else { name = '地狱'; desc = '牌山压顶，非酋勿入'; }
    return '当前组合约「' + name + '」：' + desc;
  }

  /* ---------------- 白名单 sanitize（全部 clamp 到 schema 区间） ---------------- */
  function sanitize(raw) {
    var d = defaultCfg();
    if (!raw || typeof raw !== 'object') return d;
    d.slots = stepClamp(raw.slots, 5, 9, 1, d.slots);
    d.kindsStart = stepClamp(raw.kindsStart, 3, 8, 1, d.kindsStart);
    d.kindsMax = stepClamp(raw.kindsMax, 6, 14, 1, d.kindsMax);
    d.tilesStart = stepClamp(raw.tilesStart, 24, 60, 3, d.tilesStart);
    d.tilesPerLevel = stepClamp(raw.tilesPerLevel, 0, 24, 1, d.tilesPerLevel);
    d.tilesMax = stepClamp(raw.tilesMax, 60, 198, 3, d.tilesMax);
    d.layersStart = stepClamp(raw.layersStart, 2, 5, 1, d.layersStart);
    d.layersMax = stepClamp(raw.layersMax, 3, 9, 1, d.layersMax);
    d.density = stepClamp(raw.density, 0.4, 0.85, 0.05, d.density);
    d.sideLen = stepClamp(raw.sideLen, 3, 8, 1, d.sideLen);
    d.sideStacks = stepClamp(raw.sideStacks, 0, 2, 1, d.sideStacks);
    d.propsOut = stepClamp(raw.propsOut, 0, 9, 1, d.propsOut);
    d.propsUndo = stepClamp(raw.propsUndo, 0, 9, 1, d.propsUndo);
    d.propsShuffle = stepClamp(raw.propsShuffle, 0, 9, 1, d.propsShuffle);
    d.revives = stepClamp(raw.revives, 0, 3, 1, d.revives);
    d.breatherEvery = stepClamp(raw.breatherEvery, 0, 10, 1, d.breatherEvery);
    d.tileSkin = stepClamp(raw.tileSkin, 0, 2, 1, d.tileSkin);
    d.sfxVol = clamp(raw.sfxVol, 0, 1, d.sfxVol);
    d.bgmVol = clamp(raw.bgmVol, 0, 1, d.bgmVol);
    if (typeof raw.guaranteed === 'boolean') d.guaranteed = raw.guaranteed;
    if (typeof raw.muted === 'boolean') d.muted = raw.muted;
    if (raw.icons && typeof raw.icons === 'object') {
      var ic = {};
      KINDS.forEach(function (id) {
        var v = raw.icons[id];
        if (typeof v === 'string' && v.indexOf('data:image') === 0) ic[id] = v;
      });
      d.icons = ic;
    }
    if (typeof raw.bgCustom === 'string'
        && (raw.bgCustom === '' || raw.bgCustom.indexOf('data:image') === 0)) d.bgCustom = raw.bgCustom;
    if (raw.audioOverrides && typeof raw.audioOverrides === 'object') {
      var ov = {};
      cueList().forEach(function (p) {
        var v = raw.audioOverrides[p[0]];
        if (typeof v === 'string' && v.indexOf('data:') === 0) ov[p[0]] = v;
      });
      d.audioOverrides = ov;
    }
    /* 交叉约束：起点不得超过天花板 */
    if (d.kindsStart > d.kindsMax) d.kindsMax = d.kindsStart;
    if (d.layersStart > d.layersMax) d.layersMax = d.layersStart;
    if (d.tilesStart > d.tilesMax) d.tilesMax = d.tilesStart;
    return d;
  }

  /* ---------------- 模块状态 ---------------- */
  var opts = null, root = null, ui = {};
  var work = null, opened = false, curTab = 'play';
  var armedAct = '', armTimer = 0, toastTimer = 0;
  var imgTarget = '';  // 待上传的图标 kindId；'@bg' 表示背景
  var sndCue = '';     // 待上传的音效 cue

  /* ---------------- 样式（暖米白 + 木棕，扁平田园风） ---------------- */
  var CSS = [
    '.shcp-root{position:absolute;inset:0;z-index:9000;font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;',
      'color:#4A3B2A;-webkit-tap-highlight-color:transparent;}',
    '.shcp-root,.shcp-root *{box-sizing:border-box;}',
    '.shcp-root[hidden]{display:none!important;}',
    '.shcp-mask{position:absolute;inset:0;background:rgba(58,38,14,.52);opacity:0;transition:opacity .22s ease;}',
    '.shcp-root.shcp-open .shcp-mask{opacity:1;}',
    '.shcp-drawer{position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column;max-height:92%;',
      'background:#FFF8EA;border:2px solid #D9B98C;border-bottom:none;border-radius:16px 16px 0 0;',
      'transform:translateY(105%);transition:transform .28s cubic-bezier(.22,.9,.3,1);}',
    '.shcp-root.shcp-open .shcp-drawer{transform:translateY(0);}',
    '.shcp-head{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:2px solid #EFDDBE;flex:0 0 auto;}',
    '.shcp-title{font-size:17px;font-weight:900;letter-spacing:3px;flex:1;min-width:0;color:#7A4A1E;}',
    '.shcp-close{width:40px;height:40px;flex:0 0 auto;border:2px solid #D9B98C;border-radius:10px;background:#FFFDF6;',
      'color:#8A5A2A;font:900 15px/1 system-ui;cursor:pointer;}',
    '.shcp-close:active{background:#F5EBD4;}',
    '.shcp-tabs{display:flex;gap:8px;padding:10px 16px 0;flex:0 0 auto;}',
    '.shcp-tab{flex:1;height:40px;border:2px solid #D9B98C;border-radius:999px;background:#FFFDF6;color:#8A5A2A;',
      'font:700 14px/1 system-ui;cursor:pointer;letter-spacing:2px;text-indent:2px;font-family:inherit;}',
    '.shcp-tab.shcp-on{background:#7A4A1E;color:#FFF3DC;border-color:#7A4A1E;}',
    '.shcp-body{flex:1 1 auto;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:2px 16px 14px;}',
    '.shcp-panel[hidden]{display:none!important;}',
    '.shcp-note{margin:10px 0 2px;font-size:12px;line-height:1.7;color:#A5794A;}',
    '.shcp-sec{display:inline-block;margin:14px 0 2px;padding:3px 9px;background:#7A4A1E;color:#FFF3DC;',
      'font-size:11px;font-weight:700;letter-spacing:2px;border-radius:5px;}',
    '.shcp-diff{margin:12px 0 2px;padding:9px 12px;background:#F6ECD4;border-left:4px solid #7A4A1E;',
      'font-size:13px;line-height:1.6;color:#6B4A22;border-radius:0 8px 8px 0;}',
    '.shcp-srow{padding:9px 0;border-bottom:1px dashed #EBD9B4;}',
    '.shcp-shead{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;}',
    '.shcp-lab{font-size:14px;font-weight:700;line-height:1.4;}',
    '.shcp-sub{display:block;font-size:11px;font-weight:400;color:#A5794A;margin-top:2px;}',
    '.shcp-sval{font:italic 900 15px/1.2 system-ui;color:#5E8C3A;white-space:nowrap;}',
    '.shcp-range{-webkit-appearance:none;appearance:none;display:block;width:100%;height:36px;margin:0;padding:0;',
      'background:transparent;cursor:pointer;}',
    '.shcp-range::-webkit-slider-runnable-track{height:10px;border:2px solid #D9B98C;border-radius:6px;background:#F0E3C6;}',
    '.shcp-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:24px;height:24px;margin-top:-9px;',
      'border:2px solid #4A7030;border-radius:8px;background:#6FA24A;}',
    '.shcp-range::-moz-range-track{height:10px;border:2px solid #D9B98C;border-radius:6px;background:#F0E3C6;}',
    '.shcp-range::-moz-range-thumb{width:20px;height:20px;border:2px solid #4A7030;border-radius:8px;background:#6FA24A;}',
    '.shcp-row{min-height:52px;padding:10px 0;border-bottom:1px dashed #EBD9B4;display:flex;align-items:center;',
      'justify-content:space-between;gap:10px;}',
    '.shcp-seg{display:flex;gap:6px;flex:0 0 auto;}',
    '.shcp-seg button{min-width:48px;height:40px;border:2px solid #D9B98C;border-radius:10px;background:#FFFDF6;',
      'color:#8A5A2A;font:700 14px/1 system-ui;cursor:pointer;font-family:inherit;padding:0 10px;}',
    '.shcp-seg button.shcp-on{background:#5E8C3A;border-color:#4A7030;color:#fff;}',
    '.shcp-sw{position:relative;width:52px;height:32px;flex:0 0 auto;cursor:pointer;display:inline-block;}',
    '.shcp-sw input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer;z-index:2;}',
    '.shcp-track{position:absolute;inset:0;border:2px solid #D9B98C;border-radius:10px;background:#F0E3C6;transition:background .15s;}',
    '.shcp-knob{position:absolute;top:3px;left:3px;width:20px;height:20px;border:2px solid #D9B98C;border-radius:7px;',
      'background:#FFFDF6;transition:left .15s;pointer-events:none;}',
    '.shcp-sw input:checked ~ .shcp-track{background:#6FA24A;}',
    '.shcp-sw input:checked ~ .shcp-knob{left:23px;}',
    '.shcp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:10px;margin:8px 0 2px;}',
    '.shcp-icell{border:2px solid #E4CFA6;border-radius:12px;background:#FFFDF6;padding:10px 8px 9px;',
      'display:flex;flex-direction:column;align-items:center;gap:6px;}',
    '.shcp-ibox{width:64px;height:64px;border:2px solid #E4CFA6;border-radius:10px;background:#FBF3DF;',
      'display:flex;align-items:center;justify-content:center;overflow:hidden;}',
    '.shcp-iimg{width:52px;height:52px;object-fit:contain;display:block;}',
    '.shcp-iname{font-size:13px;font-weight:700;color:#6B4A22;display:flex;align-items:center;gap:5px;}',
    '.shcp-chip{font-size:10px;font-weight:700;line-height:1;color:#5E8C3A;border:1px solid #5E8C3A;border-radius:4px;',
      'padding:2px 4px;letter-spacing:1px;}',
    '.shcp-irow{display:flex;gap:6px;width:100%;}',
    '.shcp-irow .shcp-btn{flex:1;min-width:0;height:40px;padding:0 6px;font-size:12px;}',
    '.shcp-btn{min-height:40px;padding:0 14px;border:2px solid #D9B98C;border-radius:10px;background:#FFFDF6;',
      'color:#8A5A2A;font:700 13px/1.2 system-ui;cursor:pointer;font-family:inherit;}',
    '.shcp-btn:active{background:#F5EBD4;}',
    '.shcp-btn-primary{background:#7A4A1E;color:#FFF3DC;border-color:#5E3A16;}',
    '.shcp-btn-warn{color:#B0523C;border-color:#D99A82;}',
    '.shcp-btn-warn:active{background:#F9EDE8;}',
    '.shcp-btn.shcp-armed{background:#B0523C;border-color:#8F3F2C;color:#fff;}',
    '.shcp-bgprev{margin:8px 0 2px;border:2px solid #E4CFA6;border-radius:12px;overflow:hidden;background:#F6ECD4;}',
    '.shcp-bgprev img{display:block;width:100%;height:120px;object-fit:cover;}',
    '.shcp-skins{display:flex;gap:8px;margin:8px 0 2px;}',
    '.shcp-skin{flex:1;min-height:56px;border:2px solid #E4CFA6;border-radius:10px;background:#FFFDF6;cursor:pointer;',
      'display:flex;flex-direction:column;align-items:center;gap:5px;padding:8px 4px;font:700 12px/1 system-ui;',
      'color:#6B4A22;font-family:inherit;}',
    '.shcp-skin.shcp-on{border-color:#5E8C3A;background:#F0F5E8;}',
    '.shcp-skinsw{display:flex;width:64%;height:18px;border:2px solid #D9B98C;border-radius:5px;overflow:hidden;}',
    '.shcp-skinsw i{flex:1;height:100%;}',
    '.shcp-cue{display:flex;align-items:center;gap:6px;min-height:50px;padding:5px 0;}',
    '.shcp-cue + .shcp-cue{border-top:1px dashed #EBD9B4;}',
    '.shcp-cuename{flex:1;min-width:0;font-size:14px;font-weight:700;display:flex;align-items:center;gap:6px;flex-wrap:wrap;}',
    '.shcp-cue .shcp-btn{height:40px;padding:0 10px;font-size:12px;flex:0 0 auto;}',
    '.shcp-stats{display:flex;border:2px solid #D9B98C;border-radius:12px;background:#FFFDF6;margin:10px 0 2px;overflow:hidden;}',
    '.shcp-statcell{flex:1;min-width:0;padding:12px 6px 10px;text-align:center;}',
    '.shcp-statcell + .shcp-statcell{border-left:2px solid #EFDDBE;}',
    '.shcp-statnum{font:italic 900 24px/1.2 system-ui;color:#7A4A1E;}',
    '.shcp-statkey{font-size:11px;color:#A5794A;letter-spacing:2px;margin-top:3px;}',
    '.shcp-btnrow{display:flex;gap:8px;margin:10px 0 2px;}',
    '.shcp-btnrow .shcp-btn{flex:1;min-width:0;padding:0 6px;}',
    '.shcp-btn-block{display:block;width:100%;margin-top:8px;}',
    '.shcp-foot{flex:0 0 auto;padding:10px 16px calc(10px + env(safe-area-inset-bottom));border-top:2px solid #EFDDBE;}',
    '.shcp-done{width:100%;height:44px;font-size:15px;letter-spacing:8px;text-indent:8px;}',
    '.shcp-toast{position:absolute;left:50%;bottom:calc(78px + env(safe-area-inset-bottom));transform:translateX(-50%);',
      'z-index:6;max-width:86%;background:#4A3B2A;color:#FFF3DC;font-size:13px;line-height:1.4;padding:8px 14px;',
      'border-radius:999px;pointer-events:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.shcp-toast[hidden]{display:none!important;}',
    '.shcp-file{display:none!important;}',
    '.shcp-hide{display:none!important;}',
    '@media (min-width:700px){.shcp-drawer{left:auto;top:0;bottom:auto;width:420px;max-height:100%;height:100%;',
      'border-bottom:2px solid #D9B98C;border-radius:16px 0 0 16px;transform:translateX(105%);}',
      '.shcp-root.shcp-open .shcp-drawer{transform:translateX(0);}}'
  ].join('\n');

  function ensureStyle() {
    if (document.getElementById('shcp-style')) return;
    var st = document.createElement('style');
    st.id = 'shcp-style';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  /* ---------------- HTML 片段 ---------------- */
  function sliderHTML(k) {
    var s = SLIDERS[k];
    return '<div class="shcp-srow">'
      + '<div class="shcp-shead"><span class="shcp-lab">' + s[0]
      + (s[4] ? '<span class="shcp-sub">' + s[4] + '</span>' : '')
      + '</span><span class="shcp-sval" data-sval="' + k + '"></span></div>'
      + '<input type="range" class="shcp-range" data-slider="' + k + '" min="' + s[1] + '" max="' + s[2]
      + '" step="' + s[3] + '" aria-label="' + s[0] + '">'
      + '</div>';
  }
  function kindCellHTML(id) {
    var nm = KIND_NAME[id] || id;
    return '<div class="shcp-icell" data-kind="' + id + '">'
      + '<span class="shcp-ibox"><img class="shcp-iimg" data-iimg="' + id + '" alt="' + nm + '"></span>'
      + '<span class="shcp-iname">' + nm + '<span class="shcp-chip shcp-hide">已自定义</span></span>'
      + '<span class="shcp-irow"><button type="button" class="shcp-btn" data-iact="up">替换</button>'
      + '<button type="button" class="shcp-btn shcp-btn-warn shcp-hide" data-iact="reset">还原</button></span>'
      + '</div>';
  }
  function skinBtnHTML(i) {
    return '<button type="button" class="shcp-skin" data-skin="' + i + '">'
      + '<span class="shcp-skinsw" data-skinsw="' + i + '"></span>'
      + '<span>' + SKINS[i][0] + '</span></button>';
  }
  function volRowHTML(k) {
    return sliderHTML(k);
  }
  function cueRowHTML(cue, label) {
    return '<div class="shcp-cue" data-cue="' + cue + '">'
      + '<span class="shcp-cuename">' + label + '<span class="shcp-chip shcp-hide">已自定义</span></span>'
      + '<button type="button" class="shcp-btn shcp-hide" data-sact="play">试听</button>'
      + '<button type="button" class="shcp-btn" data-sact="up">替换</button>'
      + '<button type="button" class="shcp-btn shcp-btn-warn shcp-hide" data-sact="reset">还原</button>'
      + '</div>';
  }

  function buildDOM() {
    root = document.createElement('div');
    root.className = 'shcp-root';
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = ''
      + '<div class="shcp-mask"></div>'
      + '<section class="shcp-drawer" role="dialog" aria-modal="true" aria-label="设置">'
      +   '<header class="shcp-head"><div class="shcp-title">设 置</div>'
      +     '<button type="button" class="shcp-close" aria-label="关闭设置">✕</button></header>'
      +   '<nav class="shcp-tabs">' + TABS.map(function (t) {
            return '<button type="button" class="shcp-tab" data-tab="' + t[0] + '">' + t[1] + '</button>';
          }).join('') + '</nav>'
      +   '<div class="shcp-body">'
      /* —— 玩法 —— */
      +     '<div class="shcp-panel" data-panel="play">'
      +       '<p class="shcp-diff" data-role="diff"></p>'
      +       '<p class="shcp-note">难度参数改动从「下一关」生效；当前关不受影响。</p>'
      +       PLAY_ORDER.map(sliderHTML).join('')
      +       '<div class="shcp-row"><span class="shcp-lab">侧堆数量'
      +         '<span class="shcp-sub">场边长条叠牌柱的条数（下一关生效）</span></span>'
      +         '<span class="shcp-seg" data-role="sideseg">'
      +           '<button type="button" data-side="0">无</button>'
      +           '<button type="button" data-side="1">1 条</button>'
      +           '<button type="button" data-side="2">2 条</button>'
      +         '</span></div>'
      +       '<div class="shcp-row"><span class="shcp-lab">保证可解'
      +         '<span class="shcp-sub">每关先跑求解器验证；关闭 = 硬核模式，不保证能过</span></span>'
      +         '<label class="shcp-sw"><input type="checkbox" data-role="guaranteed" aria-label="保证可解">'
      +         '<span class="shcp-track"></span><span class="shcp-knob"></span></label></div>'
      +     '</div>'
      /* —— 外观 —— */
      +     '<div class="shcp-panel" data-panel="look" hidden>'
      +       '<div class="shcp-sec">牌面图标</div>'
      +       '<p class="shcp-note">「替换」上传自己的图（自动缩到 256px），「还原」恢复内置图案，即时生效。</p>'
      +       '<div class="shcp-grid" data-role="kinds">' + KINDS.map(kindCellHTML).join('') + '</div>'
      +       '<input type="file" accept="image/*" class="shcp-file" data-role="iconfile">'
      +       '<div class="shcp-sec">背景图</div>'
      +       '<p class="shcp-note">上传竖屏图替换背景（自动缩到 720px）。</p>'
      +       '<div class="shcp-bgprev"><img data-role="bgimg" alt="背景预览"></div>'
      +       '<div class="shcp-btnrow">'
      +         '<button type="button" class="shcp-btn" data-bgact="up">替换背景</button>'
      +         '<button type="button" class="shcp-btn shcp-btn-warn shcp-hide" data-bgact="reset">还原背景</button>'
      +       '</div>'
      +       '<input type="file" accept="image/*" class="shcp-file" data-role="bgfile">'
      +       '<div class="shcp-sec">牌面配色</div>'
      +       '<div class="shcp-skins" data-role="skins">' + [0, 1, 2].map(skinBtnHTML).join('') + '</div>'
      +     '</div>'
      /* —— 音画 / 数据 —— */
      +     '<div class="shcp-panel" data-panel="av" hidden>'
      +       '<div class="shcp-sec">音量</div>'
      +       volRowHTML('sfxVol') + volRowHTML('bgmVol')
      +       '<div class="shcp-sec">自定义音效</div>'
      +       '<p class="shcp-note">上传本地音频替换对应音效（≤2MB），可试听、可还原合成音。</p>'
      +       '<div data-role="cuelist"></div>'
      +       '<input type="file" accept="audio/*" class="shcp-file" data-role="sndfile">'
      +       '<div class="shcp-sec">进度与配置</div>'
      +       '<div class="shcp-stats">'
      +         '<div class="shcp-statcell"><div class="shcp-statnum" data-role="statLv">—</div><div class="shcp-statkey">当前关卡</div></div>'
      +         '<div class="shcp-statcell"><div class="shcp-statnum" data-role="statBest">—</div><div class="shcp-statkey">最高纪录</div></div>'
      +         '<div class="shcp-statcell"><div class="shcp-statnum" data-role="statRev">—</div><div class="shcp-statkey">已用复活</div></div>'
      +       '</div>'
      +       '<p class="shcp-note">导出全部配置为 sh-config.json（含自定义图与音效）；导入会立即覆盖当前配置。</p>'
      +       '<div class="shcp-btnrow">'
      +         '<button type="button" class="shcp-btn" data-act="export">配置导出</button>'
      +         '<button type="button" class="shcp-btn" data-act="import">配置导入</button>'
      +       '</div>'
      +       '<button type="button" class="shcp-btn shcp-btn-warn shcp-btn-block" data-act="resetcfg">恢复出厂设置</button>'
      +       '<p class="shcp-note">恢复出厂只重置配置，不动关卡进度。</p>'
      +       '<button type="button" class="shcp-btn shcp-btn-warn shcp-btn-block" data-act="clearprog">清除进度存档</button>'
      +       '<input type="file" accept="application/json,.json,text/plain" class="shcp-file" data-role="cfgfile">'
      +     '</div>'
      +   '</div>'
      +   '<footer class="shcp-foot"><button type="button" class="shcp-btn shcp-btn-primary shcp-done" data-act="done">完 成</button></footer>'
      +   '<div class="shcp-toast" data-role="toast" hidden></div>'
      + '</section>';

    ui.toast = root.querySelector('[data-role="toast"]');
    ui.tabs = Array.prototype.slice.call(root.querySelectorAll('.shcp-tab'));
    ui.panels = Array.prototype.slice.call(root.querySelectorAll('.shcp-panel'));
    ui.diff = root.querySelector('[data-role="diff"]');
    ui.guaranteed = root.querySelector('[data-role="guaranteed"]');
    ui.bgimg = root.querySelector('[data-role="bgimg"]');
    ui.bgReset = root.querySelector('[data-bgact="reset"]');
    ui.cuelist = root.querySelector('[data-role="cuelist"]');
    ui.iconfile = root.querySelector('[data-role="iconfile"]');
    ui.bgfile = root.querySelector('[data-role="bgfile"]');
    ui.sndfile = root.querySelector('[data-role="sndfile"]');
    ui.cfgfile = root.querySelector('[data-role="cfgfile"]');
    ui.statLv = root.querySelector('[data-role="statLv"]');
    ui.statBest = root.querySelector('[data-role="statBest"]');
    ui.statRev = root.querySelector('[data-role="statRev"]');
    ui.sliders = {}; ui.svals = {};
    Object.keys(SLIDERS).forEach(function (k) {
      ui.sliders[k] = root.querySelector('[data-slider="' + k + '"]');
      ui.svals[k] = root.querySelector('[data-sval="' + k + '"]');
    });
    /* 皮肤色块 */
    [0, 1, 2].forEach(function (i) {
      var sw = root.querySelector('[data-skinsw="' + i + '"]');
      if (!sw) return;
      var c = skinSwatch(i);
      sw.innerHTML = '<i style="background:' + c[0] + '"></i><i style="background:' + c[1] + '"></i>';
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
    if (t.closest('.shcp-mask') || t.closest('.shcp-close')) { close(); return; }
    var tab = t.closest('.shcp-tab');
    if (tab) { showTab(tab.getAttribute('data-tab')); return; }
    var side = t.closest('[data-side]');
    if (side) {
      if (work) {
        var v = stepClamp(side.getAttribute('data-side'), 0, 2, 1, work.sideStacks);
        if (work.sideStacks !== v) { work.sideStacks = v; notify(); }
        syncUI();
      }
      return;
    }
    var skin = t.closest('[data-skin]');
    if (skin) {
      if (work) {
        var s = stepClamp(skin.getAttribute('data-skin'), 0, 2, 1, work.tileSkin);
        if (work.tileSkin !== s) { work.tileSkin = s; notify(); }
        syncUI();
      }
      return;
    }
    var iact = t.closest('[data-iact]');
    if (iact) {
      var cell = iact.closest('[data-kind]');
      if (!cell || !work) return;
      var kind = cell.getAttribute('data-kind');
      if (iact.getAttribute('data-iact') === 'up') {
        imgTarget = kind;
        ui.iconfile.click();
      } else {
        delete work.icons[kind];
        notify(); syncUI();
        toast('「' + (KIND_NAME[kind] || kind) + '」已还原');
      }
      return;
    }
    var bgact = t.closest('[data-bgact]');
    if (bgact) {
      if (!work) return;
      if (bgact.getAttribute('data-bgact') === 'up') {
        imgTarget = '@bg';
        ui.bgfile.click();
      } else {
        work.bgCustom = '';
        notify(); syncUI();
        toast('背景已还原');
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
    if (!(t && t.classList && t.classList.contains('shcp-range'))) return;
    var k = t.getAttribute('data-slider');
    var b = k && SLIDERS[k];
    if (!b) return;
    work[k] = stepClamp(t.value, b[1], b[2], b[3], work[k]);
    notify();
    syncVal(k);
    if (k !== 'sfxVol' && k !== 'bgmVol') syncDiff();
  }

  function onInputChange(e) {
    if (!work) return;
    var t = e.target;
    if (t === ui.guaranteed) { work.guaranteed = !!ui.guaranteed.checked; notify(); syncDiff(); return; }
    if (t === ui.iconfile) {
      var f = ui.iconfile.files && ui.iconfile.files[0];
      ui.iconfile.value = '';
      if (f && imgTarget && imgTarget !== '@bg') {
        var kind = imgTarget; imgTarget = '';
        shrinkImage(f, 256, function (url) {
          work.icons[kind] = url;
          notify(); syncUI();
          toast('「' + (KIND_NAME[kind] || kind) + '」图案已更新');
        }, function () { toast('图片读取失败'); });
      }
      return;
    }
    if (t === ui.bgfile) {
      var bf = ui.bgfile.files && ui.bgfile.files[0];
      ui.bgfile.value = '';
      if (bf && imgTarget === '@bg') {
        imgTarget = '';
        shrinkImage(bf, 720, function (url) {
          work.bgCustom = url;
          notify(); syncUI();
          toast('背景已更新');
        }, function () { toast('图片读取失败'); });
      }
      return;
    }
    if (t === ui.sndfile) {
      var sf = ui.sndfile.files && ui.sndfile.files[0];
      ui.sndfile.value = '';
      handleSndFile(sndCue, sf);
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

  /* ---------------- 图片缩放（canvas → PNG dataURI） ---------------- */
  function shrinkImage(file, maxSide, ok, fail) {
    var draw = function (src, w, h) {
      try {
        var k = Math.min(1, maxSide / Math.max(w || 1, h || 1));
        var cw = Math.max(1, Math.round((w || 1) * k));
        var ch = Math.max(1, Math.round((h || 1) * k));
        var cv = document.createElement('canvas');
        cv.width = cw;
        cv.height = ch;
        cv.getContext('2d').drawImage(src, 0, 0, cw, ch);
        var url = '';
        try { url = cv.toDataURL('image/png'); } catch (e) { url = ''; }
        if (typeof url === 'string' && url.indexOf('data:image/png') === 0) ok(url);
        else if (fail) fail();
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

  /* ---------------- 音效自定义 ---------------- */
  function doCueAct(row, act) {
    if (!row || !work) return;
    var cue = row.getAttribute('data-cue');
    if (act === 'play') { previewCue(cue); return; }
    if (act === 'up') {
      sndCue = cue;
      ui.sndfile.click();
    } else if (act === 'reset') {
      setOverride(cue, '');
      toast('「' + cueLabel(cue) + '」已还原合成音');
    }
  }
  function setOverride(cue, url) {
    if (!work) return;
    if (url) work.audioOverrides[cue] = url;
    else delete work.audioOverrides[cue];
    notify();
    fireAudio();
    syncUI();
  }
  function fireAudio() {
    if (opts && typeof opts.onAudioOverride === 'function') {
      try { opts.onAudioOverride(deepCopy(work.audioOverrides || {})); } catch (e) {}
    }
  }
  function previewCue(cue) {
    var A = window.SH && window.SH.AUDIO;
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
    if (file.size > 2 * 1024 * 1024) { toast('音频过大（请 ≤ 2MB）'); return; }
    var fr = new FileReader();
    fr.onload = function () {
      if (typeof fr.result !== 'string' || fr.result.indexOf('data:') !== 0) { toast('音频读取失败'); return; }
      if (!work) return;
      setOverride(cue, fr.result);
      toast('「' + cueLabel(cue) + '」音效已更新');
    };
    fr.onerror = function () { toast('音频读取失败'); };
    try { fr.readAsDataURL(file); } catch (e) { toast('音频读取失败'); }
  }

  /* ---------------- 导入 / 导出 ---------------- */
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
      notify(); fireAudio(); syncUI();
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
      a.href = url;
      a.download = 'sh-config.json';
      document.body.appendChild(a);
      a.click();
      a.parentNode.removeChild(a);
      setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) {} }, 800);
      toast('配置已导出');
    } catch (e) { toast('导出失败'); }
  }

  /* ---------------- 数据动作（双击确认） ---------------- */
  function disarm() {
    armedAct = '';
    clearTimeout(armTimer);
    ['resetcfg', 'clearprog'].forEach(function (act) {
      var b = root && root.querySelector('[data-act="' + act + '"]');
      if (b) { b.textContent = ARM_TEXT[act]; b.classList.remove('shcp-armed'); }
    });
  }
  function arm(act) {
    armedAct = act;
    clearTimeout(armTimer);
    var b = root.querySelector('[data-act="' + act + '"]');
    if (b) { b.textContent = '再点一次，确认' + ARM_TEXT[act]; b.classList.add('shcp-armed'); }
    armTimer = setTimeout(disarm, 3000);
  }
  function doAct(act) {
    if (!work) return;
    switch (act) {
      case 'done': close(); break;
      case 'export': doExport(); break;
      case 'import': ui.cfgfile.click(); break;
      case 'resetcfg':
        if (armedAct !== 'resetcfg') { arm('resetcfg'); return; }
        disarm();
        work = sanitize(defaultCfg());
        notify(); fireAudio(); syncUI();
        toast('已恢复出厂设置（进度不受影响）');
        break;
      case 'clearprog':
        if (armedAct !== 'clearprog') { arm('clearprog'); return; }
        disarm();
        if (opts && typeof opts.onClearProgress === 'function') {
          try { opts.onClearProgress(); } catch (e) {}
          toast('进度存档已清除');
          renderStats();
        } else {
          toast('当前无法清除进度');
        }
        break;
    }
  }

  /* ---------------- 渲染同步 ---------------- */
  function showTab(tab) {
    for (var i = 0; i < TABS.length; i++) if (TABS[i][0] === tab) curTab = tab;
    ui.tabs.forEach(function (b) {
      var on = b.getAttribute('data-tab') === curTab;
      b.classList.toggle('shcp-on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    ui.panels.forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== curTab; });
  }

  function syncVal(k) {
    if (ui.sliders[k]) ui.sliders[k].value = String(work[k]);
    if (ui.svals[k] && FMT[k]) ui.svals[k].textContent = FMT[k](work[k]);
  }

  function syncDiff() {
    if (ui.diff) ui.diff.textContent = difficultyLine();
  }

  function syncUI() {
    if (!root || !work) return;
    Object.keys(SLIDERS).forEach(syncVal);
    Array.prototype.forEach.call(root.querySelectorAll('[data-side]'), function (b) {
      b.classList.toggle('shcp-on', +b.getAttribute('data-side') === work.sideStacks);
    });
    if (ui.guaranteed) ui.guaranteed.checked = !!work.guaranteed;
    syncDiff();
    KINDS.forEach(function (id) {
      var img = root.querySelector('[data-iimg="' + id + '"]');
      if (img) img.src = iconSrc(id);
      var cell = root.querySelector('[data-kind="' + id + '"]');
      if (cell) {
        var custom = !!(work.icons && typeof work.icons[id] === 'string' && work.icons[id]);
        var chip = cell.querySelector('.shcp-chip');
        var rb = cell.querySelector('[data-iact="reset"]');
        if (chip) chip.classList.toggle('shcp-hide', !custom);
        if (rb) rb.classList.toggle('shcp-hide', !custom);
      }
    });
    if (ui.bgimg) ui.bgimg.src = bgSrc();
    if (ui.bgReset) ui.bgReset.classList.toggle('shcp-hide', !work.bgCustom);
    Array.prototype.forEach.call(root.querySelectorAll('[data-skin]'), function (b) {
      b.classList.toggle('shcp-on', +b.getAttribute('data-skin') === work.tileSkin);
    });
    Array.prototype.forEach.call(root.querySelectorAll('.shcp-cue'), function (row) {
      var cue = row.getAttribute('data-cue');
      var custom = typeof work.audioOverrides[cue] === 'string' && work.audioOverrides[cue];
      var chip = row.querySelector('.shcp-chip');
      var rb = row.querySelector('[data-sact="reset"]');
      if (chip) chip.classList.toggle('shcp-hide', !custom);
      if (rb) rb.classList.toggle('shcp-hide', !custom);
    });
    var okAudio = hasAudio();
    Array.prototype.forEach.call(root.querySelectorAll('[data-sact="play"]'), function (b) {
      b.classList.toggle('shcp-hide', !okAudio);
    });
  }

  function renderStats() {
    var s = opts && typeof opts.stats === 'function' ? opts.stats() : null;
    if (ui.statLv) ui.statLv.textContent = s && s.lv != null ? s.lv : '—';
    if (ui.statBest) ui.statBest.textContent = s && s.best != null ? s.best : '—';
    if (ui.statRev) ui.statRev.textContent = s && s.revUsed != null ? s.revUsed : '—';
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
    if (opts && typeof opts.onChange === 'function') {
      try { opts.onChange(deepCopy(work)); } catch (e) {}
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
      requestAnimationFrame(function () { root.classList.add('shcp-open'); });
    });
  }

  function close() {
    if (!root || !opened) return;
    opened = false;
    disarm();
    imgTarget = '';
    sndCue = '';
    root.classList.remove('shcp-open');
    root.setAttribute('aria-hidden', 'true');
    setTimeout(function () { if (!opened && root) root.hidden = true; }, 300);
    if (opts && typeof opts.onClose === 'function') { try { opts.onClose(); } catch (e) {} }
  }

  function isOpen() { return opened; }

  return { mount: mount, open: open, close: close, isOpen: isOpen };
})();
