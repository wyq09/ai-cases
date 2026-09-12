/* slide-puzzle 程序化 SVG 美术：SP.ART.icon(id) / SP.ART.leaf(i)
 * 风格：奶油 #f7e6c4 图形 + 深棕 #5b2410 细节，圆角卡通粗笔画（深棕描边保证浅底可读） */
window.SP = window.SP || {};
SP.ART = (() => {
  const CR = '#f7e6c4', DK = '#5b2410', VN = '#b5541c';
  const W = b => '<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">' + b + '</svg>';
  const uri = s => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
  // 双层描线：深棕晕边 + 奶油芯
  const duo = (d, w) => '<path d="' + d + '" fill="none" stroke="' + DK + '" stroke-width="' + (w + 4.5) + '" stroke-linecap="round" stroke-linejoin="round"/><path d="' + d + '" fill="none" stroke="' + CR + '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round"/>';
  // 奶油填充形 + 深棕描边
  const fs = (d, sw) => '<path d="' + d + '" fill="' + CR + '" stroke="' + DK + '" stroke-width="' + (sw || 3) + '" stroke-linejoin="round"/>';

  const icons = {};

  // 左箭头：粗圆箭头 + 短杆
  icons.back = duo('M20.5 10.5 L9.5 24 L20.5 37.5', 8) + duo('M12.5 24 H39', 8);

  // 扬声器主体
  const SPK = fs('M6.5 18 h7.5 l10 -8 v28 l-10 -8 H6.5 z');
  const WAVES = duo('M30 18.5 a9 9 0 0 1 0 11', 4.5) + duo('M35.5 13 a16 16 0 0 1 0 22', 4.5);
  icons.sndOn = SPK + WAVES;
  icons.sndOff = SPK + WAVES + duo('M11 9.5 L38.5 37', 5);

  // 秒表
  icons.timer =
    '<rect x="20" y="3.5" width="8" height="7" rx="2.6" fill="' + CR + '" stroke="' + DK + '" stroke-width="2.6"/>' +
    '<path d="M24 16.4 v3 M12.6 27.5 h2.6 M35.4 27.5 h-2.6" stroke="' + DK + '" stroke-width="2.4" stroke-linecap="round" fill="none"/>' +
    '<circle cx="24" cy="27.5" r="14.5" fill="none" stroke="' + DK + '" stroke-width="9.5"/>' +
    '<circle cx="24" cy="27.5" r="14.5" fill="none" stroke="' + CR + '" stroke-width="5.5"/>' +
    '<path d="M24 27.5 V19 M24 27.5 L30 32.5" fill="none" stroke="' + CR + '" stroke-width="6.2" stroke-linecap="round"/>' +
    '<path d="M24 27.5 V19 M24 27.5 L30 32.5" fill="none" stroke="' + DK + '" stroke-width="3" stroke-linecap="round"/>' +
    '<circle cx="24" cy="27.5" r="2.3" fill="' + DK + '"/>';

  // 脚印：裸足印——大趾右上（大）、3 小趾弧列、饱满脚掌，斜轴 12°
  icons.foot =
    '<g transform="rotate(12 24 24)" fill="' + CR + '" stroke="' + DK + '">' +
    '<ellipse cx="23.5" cy="28" rx="9.2" ry="13.8" stroke-width="3"/>' +
    '<ellipse cx="33.5" cy="9" rx="7" ry="5.6" transform="rotate(18 33.5 9)" stroke-width="2.6"/>' +
    '<circle cx="23" cy="7.5" r="3.1" stroke-width="1.9"/>' +
    '<circle cx="17" cy="11.5" r="2.8" stroke-width="1.9"/>' +
    '<circle cx="13.4" cy="16.6" r="2.6" stroke-width="1.9"/>' +
    '</g>';

  // 双循环箭头（半边旋转复制）
  const rArc = 'M35.1 16.3 A13.5 13.5 0 0 0 12.9 16.3';
  const rHead = '<path d="M9.2 21.6 L9.1 13.7 L16.7 18.9 z" fill="' + CR + '" stroke="' + DK + '" stroke-width="2.6" stroke-linejoin="round"/>';
  const rHalf = duo(rArc, 5.5) + rHead;
  icons.reset = rHalf + '<g transform="rotate(180 24 24)">' + rHalf + '</g>';

  // 灯泡
  icons.bulb =
    fs('M24 5.2 c7.6 0 13.2 5.7 13.2 12.9 0 4.7 -2.5 7.7 -4.7 10.1 -1.2 1.3 -1.9 2.3 -1.9 3.8 h-13.2 c0 -1.5 -.7 -2.5 -1.9 -3.8 -2.2 -2.4 -4.7 -5.4 -4.7 -10.1 C10.8 10.9 16.4 5.2 24 5.2 z') +
    '<path d="M19.6 26.2 q4.4 -3.8 8.8 0" fill="none" stroke="' + DK + '" stroke-width="2.5" stroke-linecap="round"/>' +
    '<rect x="17.6" y="31.6" width="12.8" height="4.6" rx="2.2" fill="' + CR + '" stroke="' + DK + '" stroke-width="2.6"/>' +
    '<path d="M20.5 38.4 h7" stroke="' + DK + '" stroke-width="2.2" stroke-linecap="round"/>' +
    '<rect x="20.4" y="40.4" width="7.2" height="4.2" rx="2.1" fill="' + CR + '" stroke="' + DK + '" stroke-width="2.6"/>';

  // 齿轮：4 根圆头齿条 + 圆身，双层轮廓 + 深棕轴心
  let gt = '';
  for (let a = 0; a < 180; a += 45) gt += '<rect x="20.3" y="2.2" width="7.4" height="43.6" rx="2.6" transform="rotate(' + a + ' 24 24)"/>';
  const gBody = gt + '<circle cx="24" cy="24" r="14.6"/>';
  icons.gear =
    '<g fill="' + DK + '" stroke="' + DK + '" stroke-width="4" stroke-linejoin="round">' + gBody + '</g>' +
    '<g fill="' + CR + '">' + gBody + '</g>' +
    '<circle cx="24" cy="24" r="5.2" fill="' + DK + '"/>';

  // 奖杯
  icons.trophy =
    duo('M14.5 11.5 H10 a4.6 4.6 0 0 0 0 9.2 h4', 4) +
    duo('M33.5 11.5 H38 a4.6 4.6 0 0 1 0 9.2 h-4', 4) +
    fs('M13.5 7 h21 v9.5 a10.5 10.5 0 0 1 -21 0 z') +
    '<path d="M24 10.8 l1.6 3.6 3.6 1.6 -3.6 1.6 -1.6 3.6 -1.6 -3.6 -3.6 -1.6 3.6 -1.6 z" fill="' + DK + '"/>' +
    duo('M24 27.2 v5.5', 4.6) +
    '<rect x="14" y="33.5" width="20" height="5.2" rx="2.2" fill="' + CR + '" stroke="' + DK + '" stroke-width="2.6"/>' +
    '<rect x="11.5" y="39.6" width="25" height="4.6" rx="2.1" fill="' + CR + '" stroke="' + DK + '" stroke-width="2.6"/>';

  // 关闭 ×
  icons.close = duo('M14 14 L34 34', 7.5) + duo('M34 14 L14 34', 7.5);

  // 三种落叶：橙黄渐变 + 叶脉 + 短柄
  const leafSvg = (grad, body, veins, stem) => W(
    '<defs>' + grad + '</defs>' +
    '<path d="' + body + '" fill="url(#g)" stroke="' + VN + '" stroke-width="1.8" stroke-linejoin="round"/>' +
    '<path d="' + veins + '" fill="none" stroke="' + VN + '" stroke-width="1.6" stroke-linecap="round"/>' +
    '<path d="' + stem + '" fill="none" stroke="' + VN + '" stroke-width="2.3" stroke-linecap="round"/>'
  );
  const grad = (x1, y1, x2, y2, c1, c2, c3) =>
    '<linearGradient id="g" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '">' +
    '<stop offset="0" stop-color="' + c1 + '"/><stop offset=".52" stop-color="' + c2 + '"/><stop offset="1" stop-color="' + c3 + '"/></linearGradient>';

  const leaves = [
    // 0 斜向尖叶（参考图同款）
    leafSvg(
      grad(0, 1, 1, 0, '#d96b1f', '#e8912a', '#f6c14b'),
      'M7 40 C3 22 17 7 41 6 C42 29 28 44 7 40 z',
      'M9 38 C18 30 30 19 39 9 M15.5 33.5 l-4.5 -7 M22 27 l-5 -7.5 M29 20.5 l-5 -7.5 M35 14.5 l-6.5 -4 M24 24.5 l6.5 5 M31 17.5 l7 4.5',
      'M7 40 q-2.8 2.6 -4.6 3.2'
    ),
    // 1 竖向水滴叶
    leafSvg(
      grad(0, 0, 0, 1, '#f6c14b', '#e8912a', '#d96b1f'),
      'M24 4 C38 14 41 31 24 43.5 C7 31 10 14 24 4 z',
      'M24 8 V42 M24 15 l-8 -3.5 M24 15 l8 -3.5 M24 23.5 l-10 -2.5 M24 23.5 l10 -2.5 M24 31.5 l-9 .8 M24 31.5 l9 .8',
      'M24 43.5 q.5 3 3 4.3'
    ),
    // 2 圆阔叶
    leafSvg(
      grad(0, 0, 1, 1, '#f9d268', '#f2a53a', '#d96b1f'),
      'M12 38 C4 28 8 11 24 7 C38 3.5 45 15 39 26 C33 36.5 21 42 12 38 z',
      'M13.5 36 C20 29 28 20 35.5 11.5 M19 29.5 l-7 -1.5 M19 29.5 l1.5 7 M26 22.5 l-8 -1 M26 22.5 l6 5 M32 16.5 l-7 -2.5 M32 16.5 l6.5 3.5',
      'M12 38 q-3 2.5 -5.5 2.8'
    )
  ];

  return {
    icon: id => uri(W(icons[id] || '')),
    leaf: i => uri(leaves[i] || leaves[0])
  };
})();
