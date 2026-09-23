/* art.js — tower-crane 程序化美术（SVG dataURI + canvas 天空/城市绘制），零依赖 */
window.TC = window.TC || {};
TC.ART = (function () {
  'use strict';

  /* 调色板（契约颜色表）：body / dark 描边 / light 高光 */
  var PAL = [
    { b: '#ef6a5e', d: '#c94b41', l: '#ff9285' }, /* red    */
    { b: '#7cdcb4', d: '#54b78e', l: '#aaf0d2' }, /* mint   */
    { b: '#f5a733', d: '#d1821a', l: '#ffc76e' }, /* orange */
    { b: '#5fb7ef', d: '#3d8fc9', l: '#96d5fb' }  /* blue   */
  ];
  var CREAM = '#f7f3e8', GLASS = '#3d5a80';

  function svg(vb, inner) {
    return 'data:image/svg+xml,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '">' + inner + '</svg>');
  }

  /* ---------- 房间块（集装箱，viewBox 0 0 240 152 = 2x 逻辑块） ---------- */
  function room(i) {
    var p = PAL[((i % 4) + 4) % 4];
    var s =
      /* 箱体 + 厚描边 */
      '<rect x="5" y="5" width="230" height="142" rx="19" fill="{b}" stroke="{d}" stroke-width="6"/>' +
      /* 竖向波纹板条（dark 8% 细竖条） */
      '<pattern id="c" width="13" height="20" patternUnits="userSpaceOnUse"><rect width="6.5" height="20" fill="{d}" opacity=".08"/></pattern>' +
      '<rect x="27" y="10" width="186" height="132" fill="url(#c)"/>' +
      /* 顶部高光条 / 底部阴影边 */
      '<rect x="16" y="11" width="208" height="7" rx="3.5" fill="{l}" opacity=".9"/>' +
      '<rect x="16" y="134" width="208" height="6" rx="3" fill="{d}" opacity=".5"/>' +
      /* 四角角柱 + 白点铆钉 */
      '<g fill="{d}"><rect x="8" y="8" width="21" height="27" rx="8"/><rect x="211" y="8" width="21" height="27" rx="8"/>' +
      '<rect x="8" y="117" width="21" height="27" rx="8"/><rect x="211" y="117" width="21" height="27" rx="8"/></g>' +
      '<g fill="#fff"><circle cx="18.5" cy="21.5" r="3"/><circle cx="221.5" cy="21.5" r="3"/>' +
      '<circle cx="18.5" cy="130.5" r="3"/><circle cx="221.5" cy="130.5" r="3"/></g>' +
      /* 左门：奶白框 + 门板 + 小方窗深蓝玻璃 + 黄把手 */
      '<rect x="46" y="46" width="56" height="97" rx="7" fill="' + CREAM + '"/>' +
      '<rect x="53" y="53" width="42" height="90" rx="5" fill="{b}"/>' +
      '<rect x="59" y="61" width="30" height="26" rx="4" fill="' + CREAM + '"/>' +
      '<rect x="63" y="65" width="22" height="18" rx="2.5" fill="' + GLASS + '"/>' +
      '<circle cx="88" cy="107" r="4" fill="#ffd34d"/>' +
      /* 右四格窗：奶白框十字分格 + 玻璃斜高光 */
      '<rect x="116" y="56" width="66" height="54" rx="7" fill="' + CREAM + '"/>' +
      '<rect x="123" y="63" width="52" height="40" rx="3" fill="' + GLASS + '"/>' +
      '<path d="M128 98l13-29" stroke="rgba(255,255,255,.35)" stroke-width="5" stroke-linecap="round" fill="none"/>' +
      '<path d="M149 63v40M123 83h52" stroke="' + CREAM + '" stroke-width="6" fill="none"/>' +
      /* 最右点线装饰 + 小白牌 */
      '<path d="M203 44v64" stroke="' + CREAM + '" stroke-width="5.5" stroke-linecap="round" stroke-dasharray="0.1 10.5" fill="none"/>' +
      '<rect x="187" y="117" width="20" height="16" rx="4" fill="' + CREAM + '"/>';
    s = s.replace(/\{b\}/g, p.b).replace(/\{d\}/g, p.d).replace(/\{l\}/g, p.l);
    return svg('0 0 240 152', s);
  }

  /* ---------- 吊钩：横销在上 + 金黄 U 形弓 + 穿挂的灰色圆钢环 ---------- */
  function hook() {
    var bow = 'M36 70V46a24 24 0 0 1 48 0v24';
    return svg('0 0 120 120',
      '<circle cx="60" cy="86" r="17" fill="none" stroke="#6f7887" stroke-width="12"/>' +
      '<circle cx="60" cy="86" r="17" fill="none" stroke="#9aa4b2" stroke-width="5"/>' +
      '<path d="' + bow + '" fill="none" stroke="#c98a1e" stroke-width="22" stroke-linecap="round"/>' +
      '<path d="' + bow + '" fill="none" stroke="#f2b53d" stroke-width="12" stroke-linecap="round"/>' +
      '<path d="M45 34a16 16 0 0 1 7-8" fill="none" stroke="#ffe1a1" stroke-width="5" stroke-linecap="round"/>' +
      '<rect x="32" y="4" width="56" height="13" rx="6.5" fill="#f2b53d" stroke="#c98a1e" stroke-width="4.5"/>');
  }

  /* ---------- 云：白色积云 3 变体，底部 #d8ecf9 阴影 ---------- */
  function cloud(i) {
    var v = [
      ['0 0 150 86',
        '<ellipse cx="75" cy="61" rx="54" ry="17"/><circle cx="47" cy="47" r="18"/><circle cx="77" cy="39" r="23"/><circle cx="105" cy="49" r="15"/>'],
      ['0 0 210 92',
        '<ellipse cx="105" cy="65" rx="86" ry="19"/><circle cx="58" cy="51" r="20"/><circle cx="104" cy="41" r="27"/><circle cx="150" cy="53" r="18"/>'],
      ['0 0 170 102',
        '<ellipse cx="85" cy="73" rx="64" ry="20"/><circle cx="50" cy="58" r="20"/><circle cx="86" cy="47" r="26"/><circle cx="118" cy="61" r="16"/><circle cx="28" cy="67" r="12"/>']
    ][((i % 3) + 3) % 3];
    return svg(v[0],
      '<defs><g id="a">' + v[1] + '</g></defs>' +
      '<use href="#a" y="7" fill="#d8ecf9"/>' +
      '<use href="#a" fill="#ffffff"/>');
  }

  /* ---------- 图标：白色粗描边圆角线条风，viewBox 0 0 48 48 ---------- */
  var ICONS = {
    menu: '<path d="M9 15h30M9 24h30M9 33h30"/>',
    close: '<path d="M14 14l20 20M34 14L14 34"/>',
    heart: '<path d="M24 38C11.5 29.5 7.5 20.5 13 14.5c4.2-4.4 9.2-2 11 2.2 1.8-4.2 6.8-6.6 11-2.2 5.5 6 1.5 15-11 23.5z"/>',
    play: '<path d="M17 12l20 12-20 12z"/>',
    pause: '<path d="M17 13v22M31 13v22"/>',
    upload: '<path d="M24 31V13M15.5 21L24 12.5 32.5 21M10 37h28"/>',
    download: '<path d="M24 13v18M15.5 24l8.5 8.5L32.5 24M10 37h28"/>',
    reset: '<path d="M30.5 13A12.5 12.5 0 1 0 36.5 24"/><path d="M30.5 13l3.6 6M30.5 13l7-.1"/>',
    check: '<path d="M12 25l8.5 8.5L36 15"/>',
    info: '<circle cx="24" cy="24" r="15.5"/><path d="M24 22v9.5M24 16.2h.01"/>',
    volumeOn: '<path d="M11 19h6.5l8-7v24l-8-7H11z"/><path d="M31 19.5a8 8 0 0 1 0 9M35 15.5a13.5 13.5 0 0 1 0 17"/>',
    volumeOff: '<path d="M11 19h6.5l8-7v24l-8-7H11z"/><path d="M32.5 19.5l9 9M41.5 19.5l-9 9"/>',
    trophy: '<path d="M16 9h16v9a8 8 0 0 1-16 0z"/><path d="M16 12H9.5a6.5 6.5 0 0 0 6.8 7M32 12h6.5a6.5 6.5 0 0 1-6.8 7"/><path d="M24 26v6.5M17 38.5h14M19.5 38.5c0-3.4 1.9-6 4.5-6s4.5 2.6 4.5 6"/>',
    home: '<path d="M9 23.5L24 10.5l15 13"/><path d="M13 20.5V38h22V20.5"/><path d="M20 38v-9.5h8V38"/>'
  };
  function icon(name) {
    return svg('0 0 48 48',
      '<g fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">' +
      (ICONS[name] || ICONS.info) + '</g>');
  }

  /* ---------- 天空：垂直渐变 + 右上柔和太阳光晕（径向渐变，禁 shadowBlur） ---------- */
  function paintSky(ctx, w, h) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#2e8fe0');
    g.addColorStop(0.55, '#6fc0ee');
    g.addColorStop(1, '#c9ecfa');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    var sx = w * 0.82, sy = h * 0.14, r = Math.max(w, h) * 0.55;
    var rg = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    rg.addColorStop(0, 'rgba(255,246,214,0.9)');
    rg.addColorStop(0.18, 'rgba(255,242,205,0.42)');
    rg.addColorStop(1, 'rgba(255,242,205,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);
  }

  /* ---------- 塔吊剪影（几何简形，供城市层调用） ---------- */
  function craneShape(ctx, x, baseY, s, col) {
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineCap = 'round';
    var topY = baseY - s, jibY = topY + s * 0.16, y;
    ctx.lineWidth = Math.max(3, s * 0.05);
    ctx.beginPath(); ctx.moveTo(x, topY); ctx.lineTo(x, baseY); ctx.stroke(); /* 塔 身 */
    ctx.lineWidth = Math.max(1.5, s * 0.018);
    for (y = topY + s * 0.06; y < baseY - s * 0.03; y += s * 0.085) {
      ctx.beginPath(); ctx.moveTo(x - s * 0.028, y); ctx.lineTo(x + s * 0.028, y + s * 0.05); ctx.stroke();
    }
    ctx.lineWidth = Math.max(3, s * 0.045);
    ctx.beginPath(); ctx.moveTo(x - s * 0.2, jibY); ctx.lineTo(x + s * 0.72, jibY); ctx.stroke(); /* 大 臂 */
    ctx.lineWidth = Math.max(1.2, s * 0.014);
    ctx.beginPath();
    ctx.moveTo(x, topY + 2); ctx.lineTo(x + s * 0.72, jibY);
    ctx.moveTo(x, topY + 2); ctx.lineTo(x - s * 0.2, jibY);
    ctx.stroke(); /* 拉 索 */
    ctx.fillRect(x - s * 0.04, jibY, s * 0.08, s * 0.075); /* 驾驶室 */
    var tx = x + s * 0.52;
    ctx.beginPath(); ctx.moveTo(tx, jibY); ctx.lineTo(tx, jibY + s * 0.14); ctx.stroke();
    ctx.fillRect(tx - s * 0.018, jibY + s * 0.14, s * 0.036, s * 0.03); /* 吊 重 */
  }

  function rnd(seed) {
    var s = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  }

  /* ---------- 城市背景：depth 0 远层（淡蓝灰+1橙吊） / depth 1 近层（蓝灰+2黄吊+树+草坡） ---------- */
  function paintCity(ctx, w, h, depth) {
    var i, x, bw, bh, r1, r2;
    if (depth === 0) {
      var farCols = ['#c6dbe9', '#bdd5e6', '#b3cde1', '#cadfec'];
      x = -30; i = 0;
      while (x < w + 30) {
        r1 = rnd(i + 1); r2 = rnd(i + 51);
        bw = 46 + r1 * 58;
        bh = h * (0.18 + r2 * 0.30);
        ctx.fillStyle = farCols[i % 4];
        ctx.fillRect(x, h - bh, bw, bh);
        if (rnd(i + 7) > 0.6) ctx.fillRect(x + bw * 0.28, h - bh - h * 0.03, bw * 0.2, h * 0.03);   /* 楼 顶 箱 */
        if (rnd(i + 13) > 0.72) ctx.fillRect(x + bw * 0.5 - 1.5, h - bh - h * 0.055, 3, h * 0.055); /* 天 线 */
        x += bw + 6 + rnd(i + 3) * 20; i++;
      }
      craneShape(ctx, w * 0.30, h, h * 0.40, '#e8ab7d'); /* 橙色塔吊 1 台 */
    } else {
      var nearCols = ['#9fbfd8', '#93b3cf', '#a9c5da', '#8aa8c4'];
      x = -40; i = 0;
      while (x < w + 40) {
        r1 = rnd(i + 5); r2 = rnd(i + 91);
        bw = 58 + r1 * 60;
        bh = h * (0.20 + r2 * 0.36);
        ctx.fillStyle = nearCols[i % 4];
        ctx.fillRect(x, h - bh, bw, bh);
        if (rnd(i + 17) > 0.5) ctx.fillRect(x + bw * 0.3, h - bh - h * 0.035, bw * 0.22, h * 0.035);
        x += bw + 10 + rnd(i + 23) * 30; i++;
      }
      craneShape(ctx, w * 0.14, h, h * 0.46, '#f0c34e'); /* 黄 塔 吊 ×2 */
      craneShape(ctx, w * 0.70, h, h * 0.38, '#f0c34e');
      /* 草 坡 */
      ctx.fillStyle = '#9ccf7a';
      ctx.beginPath();
      ctx.moveTo(-10, h * 0.90);
      ctx.quadraticCurveTo(w * 0.25, h * 0.84, w * 0.5, h * 0.90);
      ctx.quadraticCurveTo(w * 0.75, h * 0.96, w + 10, h * 0.88);
      ctx.lineTo(w + 10, h + 10); ctx.lineTo(-10, h + 10);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#b2dd92';
      ctx.beginPath();
      ctx.moveTo(-10, h * 0.94);
      ctx.quadraticCurveTo(w * 0.3, h * 0.90, w * 0.55, h * 0.95);
      ctx.quadraticCurveTo(w * 0.8, h, w + 10, h * 0.93);
      ctx.lineTo(w + 10, h + 10); ctx.lineTo(-10, h + 10);
      ctx.closePath(); ctx.fill();
      /* 绿色圆树丛 */
      var treeCols = ['#8fc973', '#a3d689', '#7cba62'];
      for (var t = 0; t < 7; t++) {
        var tx2 = w * (0.03 + rnd(t + 31) * 0.94);
        var ty = h * (0.88 + rnd(t + 67) * 0.09);
        var tr = h * (0.026 + rnd(t + 41) * 0.028);
        ctx.fillStyle = '#8a6b4f';
        ctx.fillRect(tx2 - tr * 0.12, ty + tr * 0.5, tr * 0.24, tr * 1.1);
        ctx.fillStyle = treeCols[t % 3];
        ctx.beginPath();
        ctx.arc(tx2, ty, tr, 0, 7);
        ctx.arc(tx2 + tr * 0.9, ty + tr * 0.35, tr * 0.72, 0, 7);
        ctx.arc(tx2 - tr * 0.9, ty + tr * 0.3, tr * 0.68, 0, 7);
        ctx.fill();
      }
    }
  }

  return {
    room: room,
    hook: hook,
    cloud: cloud,
    icon: icon,
    paintSky: paintSky,
    paintCity: paintCity
  };
})();
