/* bull-flight 美术资源（全 SVG dataURI，无外部依赖）
 * 接口：BF.ART.bullFrame(i) / bullHead() / bullBig() / icon(name) / qr(seed) / ready
 */
(function () {
  'use strict';

  var D = '#4a2f1a';   // 深描边
  var B = '#eecf96';   // 奶油黄棕身体
  var P = '#8a5a33';   // 深棕斑块
  var W = '#fdfaf2';   // 翅膀白 / 浅色
  var G = '#8f97a4';   // 翅膀灰描边
  var PK = '#ef9d94';  // 粉鼻粉耳
 var HN = '#cf8b41';  // 角

  function esc(s) { return 'data:image/svg+xml,' + encodeURIComponent(s); }

  function svg(vb, w, h, inner) {
    return "<svg xmlns='http://www.w3.org/2000/svg' viewBox='" + vb + "' width='" + w + "' height='" + h + "'>" + inner + '</svg>';
  }

  // 翅膀（三羽瓣、圆钝羽尖），t 为 transform；羽瓣+羽纹同组
  function wing(t, fill) {
    return "<g transform='" + t + "'><path d='M58 42Q44 34 34 16Q42 19 46 25Q45 9 51 3Q56 10 58 21Q65 9 71 7Q72 22 66 33Q61 40 58 42Z' fill='" + fill + "' stroke='" + G + "' stroke-width='2'/><path d='M48 30Q42 24 38 15M56 25Q54 14 53 7' stroke='" + G + "' stroke-width='1.5' fill='none'/></g>";
  }

  // 远侧翅膀基变换：肩点挪到(50,46)并缩小
  var FARB = 'translate(50 46) scale(.8) ';
  var HOOF = '#3a2410';

  /* 小飞牛本体（120x90 画布，朝右），nearT/farT 为两片翅膀 transform */
  function bullInner(nearT, farT) {
    return wing(farT, '#e7dfca') +
      // 尾巴
      "<path d='M40 52Q28 48 26 37' stroke='" + D + "' stroke-width='2.4' fill='none'/>" +
      "<path d='M26 37q-6-4-3-9q6 1 7 6q4 0 5 4q-4 3-9-1z' fill='" + P + "' stroke='" + D + "' stroke-width='2'/>" +
      // 远侧两腿（略深，成对合并）
      "<path d='M72 62L84 75M46 68L37 79' stroke='" + D + "' stroke-width='8' fill='none'/>" +
      "<path d='M72 62L84 75M46 68L37 79' stroke='#d9b878' stroke-width='4.2' fill='none'/>" +
      "<circle cx='85.5' cy='76.5' r='2.4' fill='" + HOOF + "'/><circle cx='36' cy='80.5' r='2.4' fill='" + HOOF + "'/>" +
      // 身体 + 两块斑块
      "<ellipse cx='56' cy='58' rx='25' ry='19' fill='" + B + "' stroke='" + D + "' stroke-width='2.4'/>" +
      "<path d='M44 46q-8 2-7 9q1 6 8 5q7-1 6-8q-1-7-7-6zM63 68q-6 0-6 6q0 5 6 5q6 0 6-5q0-6-6-6z' fill='" + P + "'/>" +
      // 近侧两腿（前伸/后蹬）
      "<path d='M78 64L90 74M52 72L46 84' stroke='" + D + "' stroke-width='8' fill='none'/>" +
      "<path d='M78 64L90 74M52 72L46 84' stroke='" + B + "' stroke-width='4.2' fill='none'/>" +
      "<circle cx='91.5' cy='75.5' r='2.4' fill='" + HOOF + "'/><circle cx='45.5' cy='85.5' r='2.4' fill='" + HOOF + "'/>" +
      // 耳（近侧）
      "<path d='M63 29Q53 25 51 16Q61 17 66 25Z' fill='" + B + "' stroke='" + D + "' stroke-width='2.2'/>" +
      // 双角
      "<path d='M70 22Q64 10 74 8Q73 15 78 20Z' fill='" + HN + "' stroke='" + D + "' stroke-width='2'/>" +
      "<path d='M84 22Q90 10 80 8Q81 15 76 20Z' fill='" + HN + "' stroke='" + D + "' stroke-width='2'/>" +
      // 刘海
      "<path d='M68 24Q76 17 85 24Q80 28 76 27Q72 28 68 24Z' fill='" + W + "' stroke='" + D + "' stroke-width='1.8'/>" +
      // 头 + 脸部斑块
      "<circle cx='77' cy='38' r='17.5' fill='" + B + "' stroke='" + D + "' stroke-width='2.4'/>" +
      "<path d='M79 21q13 1 14 13q0 9-9 9q-7 0-8-8q-1-10 3-14z' fill='" + P + "'/>" +
      // 眼（黑豆眼+高光）+ 眉
      "<circle cx='74' cy='36' r='3.1' fill='#241505'/><circle cx='72.9' cy='34.9' r='1.05' fill='#fff'/>" +
      "<path d='M69 30Q74 27.5 79 29' stroke='" + D + "' stroke-width='2.2' fill='none'/>" +
      // 吻部：粉鼻 + 笑
      "<ellipse cx='87' cy='47' rx='12' ry='9.5' fill='" + W + "' stroke='" + D + "' stroke-width='2.4'/>" +
      "<ellipse cx='91.5' cy='45' rx='2' ry='2.6' fill='" + PK + "'/>" +
      "<path d='M80 52Q85 56 91 52' stroke='" + D + "' stroke-width='2' fill='none'/>" +
      // 近侧大翅膀
      wing(nearT, W);
  }

  function bullWrap(nearT, farT, tilt) {
    // linecap/linejoin 提到根组继承，压缩体积
    return "<g stroke-linecap='round' stroke-linejoin='round'><g transform='rotate(" + tilt + " 58 50)'>" +
      bullInner(nearT, farT) + '</g></g>';
  }

  function bullFrame(i) {
    var near = 'translate(-4 2) ' + (i ? 'rotate(-60 58 42)' : 'rotate(26 58 42)');
    var far = FARB + (i ? 'rotate(15)' : 'rotate(-55)') + ' translate(-58 -42)';
    return esc(svg('0 0 120 90', 120, 90, bullWrap(near, far, -8)));
  }

  function bullBig() {
    return esc(svg('0 0 240 180', 240, 180,
      "<g transform='translate(20 12) scale(1.7)'>" +
      bullWrap('translate(-4 2) rotate(32 58 42)', FARB + 'rotate(-20) translate(-58 -42)', -6) + '</g>'));
  }

  /* 圆脸牛头 96x96：眨眼笑 */
  function bullHead() {
    return esc(svg('0 0 96 96', 96, 96,
      // 耳
      "<path d='M20 36Q9 31 10 21Q21 24 26 33Z' fill='" + B + "' stroke='" + D + "' stroke-width='2.2' stroke-linejoin='round'/>" +
      "<path d='M76 36Q87 31 86 21Q75 24 70 33Z' fill='" + B + "' stroke='" + D + "' stroke-width='2.2' stroke-linejoin='round'/>" +
      // 角
      "<path d='M32 22Q26 9 37 7Q36 15 41 20Z' fill='" + HN + "' stroke='" + D + "' stroke-width='2' stroke-linejoin='round'/>" +
      "<path d='M64 22Q70 9 59 7Q60 15 55 20Z' fill='" + HN + "' stroke='" + D + "' stroke-width='2' stroke-linejoin='round'/>" +
      // 脸
      "<circle cx='48' cy='50' r='30' fill='" + B + "' stroke='" + D + "' stroke-width='2.6'/>" +
      // 斑块（右上含眼）
      "<path d='M50 22q16 1 17 15q0 11-11 11q-9 0-10-10q-1-12 4-16z' fill='" + P + "'/>" +
      // 刘海
      "<path d='M36 25Q48 17 60 25Q54 30 48 29Q42 30 36 25Z' fill='" + W + "' stroke='" + D + "' stroke-width='1.8' stroke-linejoin='round'/>" +
      // 眨眼笑：左眼弯弯闭眼，右眼黑豆眼
      "<path d='M28 48Q32 43.5 36 48' stroke='" + D + "' stroke-width='2.6' fill='none' stroke-linecap='round'/>" +
      "<circle cx='61' cy='48' r='3.4' fill='#241505'/><circle cx='59.8' cy='46.8' r='1.15' fill='#fff'/>" +
      // 腮红
      "<ellipse cx='30' cy='58' rx='4.2' ry='2.6' fill='" + PK + "' opacity='.75'/>" +
      // 吻部
      "<ellipse cx='48' cy='66' rx='17' ry='11.5' fill='" + W + "' stroke='" + D + "' stroke-width='2.6'/>" +
      "<ellipse cx='41.5' cy='62.5' rx='2.4' ry='3' fill='" + PK + "'/>" +
      "<ellipse cx='54.5' cy='62.5' rx='2.4' ry='3' fill='" + PK + "'/>" +
      "<path d='M42 71Q48 76 54 71' stroke='" + D + "' stroke-width='2.2' fill='none' stroke-linecap='round'/>"));
  }

  /* ---------------- 图标：24x24 单色线条 #e6e8ec ---------------- */
  var IC = {
    pause: "<path d='M9 5v14M15.5 5v14'/>",
    play: "<path d='M8 5.5l10.5 6.5L8 18.5z'/>",
    lock: "<rect x='5' y='11' width='14' height='9' rx='2'/><path d='M8 11V8a4 4 0 0 1 8 0v3'/><path d='M12 14.5v2' stroke-width='2.4'/>",
    back: "<path d='M14.5 6l-6 6 6 6'/>",
    settings: "<circle cx='12' cy='12' r='3.4'/><path d='M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z'/>",
    loan: "<path d='M9.5 7.5h5l3 4.2c1.4 2 .8 6.8-5.5 6.8s-6.9-4.8-5.5-6.8l3-4.2z'/><path d='M9.5 7.5L8.5 5h7l-1 2.5'/><path d='M18.8 3v4M16.8 5h4'/>",
    share: "<path d='M13.5 5.5l6 4.7-6 4.7v-3.2c-4.6.2-7 2.4-8.6 5.8.3-5.2 3-8.9 8.6-9.6V5.5z'/>",
    dividend: "<circle cx='12' cy='12' r='8.5'/><path d='M9 7.5l3 4 3-4M12 11.5V17M9.3 13h5.4M9.3 15.2h5.4'/>",
    buyback: "<path d='M5.2 13a7 7 0 0 1 12.1-4.8'/><path d='M17.6 4.4v4h-4'/><path d='M18.8 11a7 7 0 0 1-12.1 4.8'/><path d='M6.4 19.6v-4h4'/>",
    issue: "<rect x='5.5' y='3.5' width='11.5' height='17' rx='1.6'/><path d='M11.2 16.5v-5.2M8.9 13.4l2.3-2.3 2.3 2.3'/>",
    bank: "<path d='M4 9.5L12 4l8 5.5H4z'/><path d='M6.5 12.5v4.5M10.2 12.5v4.5M13.8 12.5v4.5M17.5 12.5v4.5M4 19.5h16'/>",
    microloan: "<rect x='3.5' y='6.5' width='17' height='12' rx='2'/><path d='M15 10.5h5.5v4H15a2 2 0 0 1 0-4z'/>",
    leverage: "<path d='M6.5 6.5l11 11M17.5 6.5l-11 11'/>",
    short: "<path d='M12 4.5V17M6.8 12.2L12 17.5l5.2-5.3M6 20h12'/>"
  };

  function icon(name) {
    var p = IC[name];
    if (!p) return '';
    return esc(svg('0 0 24 24', 24, 24,
      "<g fill='none' stroke='#e6e8ec' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>" + p + '</g>'));
  }

  /* ---------------- 装饰二维码：seed 确定性 21x21 ---------------- */
  function qr(seed) {
    var h = 1779033703 ^ String(seed).length;
    for (var i = 0; i < String(seed).length; i++) {
      h = Math.imul(h ^ String(seed).charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    var s = (h ^= h >>> 16) >>> 0;
    function rnd() {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    function finder(r, c) {
      return (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) ? 1 : 0;
    }
    var d = '', r, c, run = 0, on = 0;
    function flush(j) {
      if (on) d += 'M' + (j - run) + ' ' + r + 'h' + run + 'v1h-' + run + 'z';
      on = 0; run = 0;
    }
    for (r = 0; r < 21; r++) {
      for (c = 0; c <= 21; c++) {
        var v = 0;
        if (c < 21) {
          if (r < 7 && c < 7) v = finder(r, c);
          else if (r < 7 && c > 13) v = finder(r, c - 14);
          else if (r > 13 && c < 7) v = finder(r - 14, c);
          else if (r === 6 || c === 6) v = ((r + c) % 2 === 0) ? 1 : 0;
          else v = rnd() < 0.47 ? 1 : 0;
        }
        if (v) { on = 1; run++; } else flush(c);
      }
    }
    return esc(svg('0 0 21 21', 160, 160,
      "<rect width='21' height='21' fill='#fff'/>" +
      "<path d='" + d + "' fill='#17181c'/>").replace("<svg ", "<svg shape-rendering='crispEdges' "));
  }

  window.BF = window.BF || {};
  window.BF.ART = {
    bullFrame: bullFrame,
    bullHead: bullHead,
    bullBig: bullBig,
    icon: icon,
    qr: qr,
    ready: true
  };
})();
