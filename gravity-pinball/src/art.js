/* ============================================================
 * gravity-pinball · GP.ART
 * 扁平圆润矢量图标集 -> SVG dataURI
 * 唯一接口: GP.ART.icon(name) -> 'data:image/svg+xml,...'
 * 纯字符串拼接，不依赖 DOM，node 下可直接 require
 * ============================================================ */
(function () {
  'use strict';

  var GP = (typeof window !== 'undefined')
    ? (window.GP = window.GP || {})
    : ((typeof global !== 'undefined') ? (global.GP = global.GP || {}) : {});

  /* ---------- 基础工具 ---------- */

  // 统一 64x64 viewBox 起头；SVG 属性用单引号，避免引号嵌套问题
  function wrap(inner) {
    return "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>" + inner + '</svg>';
  }

  function toURI(svgStr) {
    if (typeof encodeURIComponent === 'function') {
      return 'data:image/svg+xml,' + encodeURIComponent(svgStr);
    }
    // 极端环境兜底：手动最小转义（保证无裸 < > # & " % 与空格）
    return 'data:image/svg+xml,' + svgStr
      .replace(/%/g, '%25')
      .replace(/"/g, '%22')
      .replace(/#/g, '%23')
      .replace(/&/g, '%26')
      .replace(/</g, '%3C')
      .replace(/>/g, '%3E')
      .replace(/\?/g, '%3F')
      .replace(/ /g, '%20');
  }

  var W = '#f2efe9'; // 图标通用暖白（对应游戏白线/白字色调）

  /* ---------- 各图标（每个独立函数，64x64） ---------- */

  // 白色圆环 + 内部三条横线（菜单钮，叠在黑圆上）
  function iMenu() {
    return wrap(
      "<circle cx='32' cy='32' r='25' fill='none' stroke='" + W + "' stroke-width='3.6'/>" +
      "<path d='M22 24.5h20M22 32h20M22 39.5h20' stroke='" + W + "' stroke-width='3.6' stroke-linecap='round' fill='none'/>"
    );
  }

  // 卡通黑炸弹：径向球体 + 白眼黑瞳 + 咧嘴白牙笑 + 短引线 + 橙黄火花
  function iBomb() {
    return wrap(
      "<defs><radialGradient id='gpBombG' cx='0.36' cy='0.32' r='0.9'>" +
      "<stop offset='0' stop-color='#383838'/>" +
      "<stop offset='0.55' stop-color='#2a2a2a'/>" +
      "<stop offset='1' stop-color='#111111'/>" +
      '</radialGradient></defs>' +
      // 火花星
      "<path d='M43.5 0.6L45 4.5L49 6L45 7.5L43.5 11.4L42 7.5L38 6L42 4.5Z' fill='#f5b63f'/>" +
      "<circle cx='43.5' cy='6' r='1.5' fill='#ffdf8a'/>" +
      // 引线
      "<path d='M31.5 14.5C31.5 9.5 35.5 10 39 7.2' fill='none' stroke='#6e4a2a' stroke-width='2.8' stroke-linecap='round'/>" +
      // 球体
      "<circle cx='31' cy='40' r='20' fill='url(#gpBombG)'/>" +
      // 引线座
      "<rect x='26.5' y='13.5' width='9' height='8' rx='3' fill='#333333'/>" +
      // 高光
      "<ellipse cx='23' cy='28.5' rx='5.5' ry='3.5' fill='#ffffff' opacity='0.3' transform='rotate(-28 23 28.5)'/>" +
      // 眼睛（歪一点的椭圆 + 同向黑瞳）
      "<ellipse cx='24.5' cy='35' rx='5.4' ry='7.4' fill='#ffffff' transform='rotate(-9 24.5 35)'/>" +
      "<ellipse cx='37' cy='35.6' rx='5.4' ry='7.4' fill='#ffffff' transform='rotate(7 37 35.6)'/>" +
      "<circle cx='23' cy='36.8' r='2.5' fill='#141414'/>" +
      "<circle cx='35.4' cy='37.4' r='2.5' fill='#141414'/>" +
      "<circle cx='22.2' cy='35.9' r='0.9' fill='#ffffff'/>" +
      "<circle cx='34.6' cy='36.5' r='0.9' fill='#ffffff'/>" +
      // 咧嘴笑 + 牙缝
      "<path d='M17.5 44.5Q31 49.5 44.5 44.5Q43 55.5 31 56.5Q19 55.5 17.5 44.5Z' fill='#ffffff'/>" +
      "<path d='M24.2 46.2V50.8M31 47V52.6M37.8 46.2V50.8' stroke='#141414' stroke-width='1.5' stroke-linecap='round' fill='none'/>"
    );
  }

  // 卡通沙漏：橙色粗框（上下横杆 + 左右框柱）+ 上橙沙下蓝沙 + 顶部青色五角星
  function iHourglass() {
    return wrap(
      // 玻璃体
      "<path d='M22 17H42C42 27.5 35.5 29.5 33.6 32C35.5 34.5 42 36.5 42 47H22C22 36.5 28.5 34.5 30.4 32C28.5 29.5 22 27.5 22 17Z' " +
      "fill='#d9edf5' fill-opacity='0.35' stroke='#cfe9f2' stroke-width='1.6' stroke-linejoin='round'/>" +
      // 上半橙黄沙
      "<path d='M23 21L32 31.8L41 21Q32 26 23 21Z' fill='#f4b04a'/>" +
      // 沙流
      "<rect x='31.3' y='31.8' width='1.4' height='11' fill='#7cc3ea'/>" +
      // 下半蓝沙堆
      "<path d='M23 48.2H41V47.6Q32 40.2 23 47.6Z' fill='#6fb9e6'/>" +
      // 橙色粗框：上下横杆 + 左右框柱
      "<rect x='15' y='9' width='34' height='7' rx='3.5' fill='#ec9a33'/>" +
      "<rect x='15' y='48' width='34' height='7' rx='3.5' fill='#ec9a33'/>" +
      "<rect x='16.5' y='10' width='4.5' height='44' rx='2' fill='#ec9a33'/>" +
      "<rect x='43' y='10' width='4.5' height='44' rx='2' fill='#ec9a33'/>" +
      // 顶部青色五角星
      "<path d='M32 1.6L33.6 5.8L38.1 6L34.6 8.8L35.8 13.2L32 10.7L28.2 13.2L29.4 8.8L25.9 6L30.4 5.8Z' " +
      "fill='#6fd9e8' stroke='#3cb4cc' stroke-width='1' stroke-linejoin='round'/>"
    );
  }

  // 白色实心圆 + 红色粗加号（加球钮）
  function iPlus() {
    return wrap(
      "<circle cx='32' cy='32' r='24' fill='#f7f4ef'/>" +
      "<rect x='26.5' y='17' width='11' height='30' rx='4.5' fill='#e84a5e'/>" +
      "<rect x='17' y='26.5' width='30' height='11' rx='4.5' fill='#e84a5e'/>"
    );
  }

  // ×：深灰衬底 + 暖白主线（深浅底都可见）
  function iClose() {
    var d = 'M20.5 20.5L43.5 43.5M43.5 20.5L20.5 43.5';
    return wrap(
      "<path d='" + d + "' stroke='#1c1814' stroke-opacity='0.3' stroke-width='8.5' stroke-linecap='round' fill='none'/>" +
      "<path d='" + d + "' stroke='" + W + "' stroke-width='5.5' stroke-linecap='round' fill='none'/>"
    );
  }

  function iSpeaker() {
    return "<path d='M14.5 26.5h6.5l9.5-8.5v28l-9.5-8.5H14.5z' fill='" + W + "' stroke='" + W +
      "' stroke-width='3' stroke-linejoin='round'/>";
  }

  function iVolumeOn() {
    return wrap(
      iSpeaker() +
      "<path d='M37.5 24.5q4.5 7.5 0 15' fill='none' stroke='" + W + "' stroke-width='4' stroke-linecap='round'/>" +
      "<path d='M43.5 19q8.5 13 0 26' fill='none' stroke='" + W + "' stroke-width='4' stroke-linecap='round'/>"
    );
  }

  function iVolumeOff() {
    return wrap(
      iSpeaker() +
      "<path d='M38.5 21.5L52 42.5' stroke='" + W + "' stroke-width='4.5' stroke-linecap='round' fill='none'/>"
    );
  }

  function iTray() {
    return "<path d='M15.5 39.5v6a5.5 5.5 0 0 0 5.5 5.5h21.5a5.5 5.5 0 0 0 5.5-5.5v-6' fill='none' stroke='" +
      W + "' stroke-width='4.6' stroke-linecap='round' stroke-linejoin='round'/>";
  }

  function iUpload() {
    return wrap(
      iTray() +
      "<path d='M32 35.5V15M23.5 23.5L32 14.8L40.5 23.5' fill='none' stroke='" + W +
      "' stroke-width='4.6' stroke-linecap='round' stroke-linejoin='round'/>"
    );
  }

  function iDownload() {
    return wrap(
      iTray() +
      "<path d='M32 14.8V34.8M23.5 26.2L32 35L40.5 26.2' fill='none' stroke='" + W +
      "' stroke-width='4.6' stroke-linecap='round' stroke-linejoin='round'/>"
    );
  }

  // 环形箭头（顺时针，右上开口）
  function iReset() {
    return wrap(
      "<path d='M49 32A17 17 0 1 1 32 15' fill='none' stroke='" + W +
      "' stroke-width='4.8' stroke-linecap='round'/>" +
      "<path d='M31 8.5L42.5 15L31 21.5Z' fill='" + W + "' stroke='" + W +
      "' stroke-width='2' stroke-linejoin='round'/>"
    );
  }

  function iInfo() {
    return wrap(
      "<circle cx='32' cy='32' r='24' fill='none' stroke='" + W + "' stroke-width='3.6'/>" +
      "<circle cx='32' cy='20' r='3.4' fill='" + W + "'/>" +
      "<rect x='28.8' y='26.5' width='6.4' height='18.5' rx='3.2' fill='" + W + "'/>"
    );
  }

  function iPause() {
    return wrap(
      "<rect x='20.5' y='18.5' width='9' height='27' rx='4.4' fill='" + W + "'/>" +
      "<rect x='34.5' y='18.5' width='9' height='27' rx='4.4' fill='" + W + "'/>"
    );
  }

  function iPlay() {
    return wrap(
      "<path d='M25 17.5L46 32L25 46.5Z' fill='" + W + "' stroke='" + W +
      "' stroke-width='4' stroke-linejoin='round'/>"
    );
  }

  function iCheck() {
    return wrap(
      "<path d='M17.5 33.5L27.5 43.5L46.5 21.5' fill='none' stroke='" + W +
      "' stroke-width='6.4' stroke-linecap='round' stroke-linejoin='round'/>"
    );
  }

  /* ---------- 注册表与对外接口 ---------- */

  var builders = {
    menu: iMenu,
    bomb: iBomb,
    hourglass: iHourglass,
    plus: iPlus,
    close: iClose,
    volumeOn: iVolumeOn,
    volumeOff: iVolumeOff,
    upload: iUpload,
    download: iDownload,
    reset: iReset,
    info: iInfo,
    pause: iPause,
    play: iPlay,
    check: iCheck
  };

  var cache = {};
  var warned = {};

  GP.ART = {
    names: ['menu', 'bomb', 'hourglass', 'plus', 'close', 'volumeOn', 'volumeOff',
      'upload', 'download', 'reset', 'info', 'pause', 'play', 'check'],

    /** icon(name) -> SVG dataURI；未知名回落 menu 并 warn 一次 */
    icon: function (name) {
      var known = Object.prototype.hasOwnProperty.call(builders, name);
      var key = known ? name : 'menu';
      if (!known && !warned[name]) {
        warned[name] = true;
        try { console.warn('[GP.ART] unknown icon "' + name + '", fallback to "menu"'); } catch (e) { /* ignore */ }
      }
      if (!cache[key]) { cache[key] = toURI(builders[key]()); }
      return cache[key];
    }
  };
})();

/* node 自测/导出入口（浏览器下忽略） */
if (typeof module !== 'undefined' && module.exports) { module.exports = (typeof window !== 'undefined' ? window.GP : (global.GP = global.GP || {})).ART; }
