/* 多福巨奖 777 — ART 模块：全部资产程序化 SVG，data URL 导出 */
window.DF = window.DF || {};
const DF = window.DF;
DF.ART = (() => {
  const enc = s => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);

  /* ---- 公共渐变：g=金浮雕 t=金线性 r=红底 ---- */
  const G = '<radialGradient id="g" cx="50%" cy="35%" r="75%"><stop offset="0" stop-color="#fff7cf"/><stop offset=".45" stop-color="#ffd964"/><stop offset=".8" stop-color="#e8a51e"/><stop offset="1" stop-color="#9a6406"/></radialGradient>';
  const T = '<linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3bd"/><stop offset=".5" stop-color="#ffcf4d"/><stop offset="1" stop-color="#c98a12"/></linearGradient>';
  const R = '<radialGradient id="r" cx="50%" cy="35%" r="80%"><stop offset="0" stop-color="#e03535"/><stop offset=".6" stop-color="#b01218"/><stop offset="1" stop-color="#6d040b"/></radialGradient>';
  const svg100 = (inner, extra) => '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><defs>' + G + T + R + (extra || '') + '</defs>' + inner + '</svg>';
  const DK = '#6b3e00';

  /* 元宝（ingot 碗堆 / gong 顶 共用），中心 x,y 缩放 s */
  const ING = (x, y, s, rot) => '<g transform="translate(' + x + ' ' + y + ')' + (rot ? ' rotate(' + rot + ')' : '') + ' scale(' + s + ')">' +
    '<path d="M-18 0 C-14 -6 -8 -9 0 -9 C8 -9 14 -6 18 0 C12 5 6 7 0 7 C-6 7 -12 5 -18 0 Z" fill="url(#g)" stroke="' + DK + '" stroke-width="2"/>' +
    '<path d="M-18 1 C-21 -4 -19 -10 -14 -12 C-12 -8 -13 -3 -11 1 Z" fill="url(#t)" stroke="' + DK + '" stroke-width="1.6"/>' +
    '<path d="M18 1 C21 -4 19 -10 14 -12 C12 -8 13 -3 11 1 Z" fill="url(#t)" stroke="' + DK + '" stroke-width="1.6"/></g>';

  /* ---- 金鱼：大头飘逸双尾鳍 ---- */
  const KOI =
    '<path d="M38 28 C42 17 52 13 62 15 C56 21 50 26 46 31 Z" fill="url(#t)" stroke="' + DK + '" stroke-width="2"/>' +
    '<path d="M12 50 C13 35 26 26 42 28 C55 30 64 39 66 49 C71 39 79 28 92 20 C88 32 87 42 84 49 C88 57 91 68 93 80 C82 71 72 61 67 53 C63 65 52 73 39 72 C24 71 11 63 12 50 Z" fill="url(#g)" stroke="' + DK + '" stroke-width="2.5" stroke-linejoin="round"/>' +
    '<path d="M46 66 C52 62 60 62 65 66 C60 71 52 72 46 66 Z" fill="#f5b91e" stroke="' + DK + '" stroke-width="1.5"/>' +
    '<path d="M40 34 C35 42 35 56 40 64" fill="none" stroke="#8a5a00" stroke-width="2" opacity=".55"/>' +
    '<path d="M48 40 q5 4 0 9 M56 44 q4 4 0 8" fill="none" stroke="#8a5a00" stroke-width="1.6" opacity=".45"/>' +
    '<ellipse cx="34" cy="38" rx="8" ry="5" fill="#fff" opacity=".4" transform="rotate(-22 34 38)"/>' +
    '<circle cx="26" cy="42" r="4.6" fill="#fff" stroke="' + DK + '" stroke-width="1"/><circle cx="27" cy="43" r="2.2" fill="#241811"/><circle cx="26" cy="41.4" r=".9" fill="#fff"/>' +
    '<path d="M13 51 q4 3.5 8 2.5" fill="none" stroke="' + DK + '" stroke-width="2" stroke-linecap="round"/>';

  /* ---- 三足金蟾：含钱币嘴 ---- */
  const FROG =
    '<path d="M14 62 C10 74 20 82 30 78 C36 75 38 68 34 62 Z" fill="url(#g)" stroke="' + DK + '" stroke-width="2"/>' +
    '<path d="M86 62 C90 74 80 82 70 78 C64 75 62 68 66 62 Z" fill="url(#g)" stroke="' + DK + '" stroke-width="2"/>' +
    '<ellipse cx="50" cy="58" rx="29" ry="24" fill="url(#g)" stroke="' + DK + '" stroke-width="2.5"/>' +
    '<ellipse cx="50" cy="67" rx="18" ry="12" fill="#ffe9a8" stroke="#c98a12" stroke-width="1.2"/>' +
    '<path d="M38 75 C36 81 38 85 44 85 C48 85 49 81 47 77" fill="none" stroke="' + DK + '" stroke-width="4" stroke-linecap="round"/>' +
    '<path d="M62 77 C60 81 61 85 65 85 C70 85 73 81 71 75" fill="none" stroke="' + DK + '" stroke-width="4" stroke-linecap="round"/>' +
    '<circle cx="37" cy="32" r="9.5" fill="url(#g)" stroke="' + DK + '" stroke-width="2"/><circle cx="63" cy="32" r="9.5" fill="url(#g)" stroke="' + DK + '" stroke-width="2"/>' +
    '<circle cx="37" cy="31" r="5.4" fill="#fff"/><circle cx="37.8" cy="31.8" r="2.6" fill="#241811"/><circle cx="36" cy="29.6" r="1.1" fill="#fff"/>' +
    '<circle cx="63" cy="31" r="5.4" fill="#fff"/><circle cx="63.8" cy="31.8" r="2.6" fill="#241811"/><circle cx="62" cy="29.6" r="1.1" fill="#fff"/>' +
    '<circle cx="46" cy="45" r="1.3" fill="' + DK + '"/><circle cx="54" cy="45" r="1.3" fill="' + DK + '"/>' +
    '<path d="M33 50 Q50 60 67 50" fill="none" stroke="' + DK + '" stroke-width="2.5" stroke-linecap="round"/>' +
    '<g transform="translate(50 57)"><circle r="7" fill="url(#t)" stroke="#7a4a00" stroke-width="1.5"/><rect x="-2.4" y="-2.4" width="4.8" height="4.8" fill="#8a4a06"/></g>';

  /* ---- 长寿金龟：侧视壳纹 ---- */
  const TURTLE =
    '<path d="M18 50 C10 50 6 56 8 62 C13 63 18 60 20 55 Z" fill="url(#g)" stroke="' + DK + '" stroke-width="2"/>' +
    '<path d="M30 60 C29 72 32 77 38 77 C42 77 43 72 41 66 Z" fill="url(#g)" stroke="' + DK + '" stroke-width="2"/>' +
    '<path d="M58 62 C57 74 60 79 66 79 C70 79 71 74 69 68 Z" fill="url(#g)" stroke="' + DK + '" stroke-width="2"/>' +
    '<path d="M17 58 C17 38 31 24 50 24 C69 24 83 38 83 56 C83 60 80 62 76 62 L24 62 C20 62 17 60 17 58 Z" fill="url(#g)" stroke="' + DK + '" stroke-width="2.5" stroke-linejoin="round"/>' +
    '<path d="M17 55 L83 55 L83 58 C83 60 80 62 76 62 L24 62 C20 62 17 60 17 58 Z" fill="#c98a12" stroke="' + DK + '" stroke-width="1.5"/>' +
    '<path d="M33 27 C31 38 31 50 32 60 M50 24 V60 M67 27 C69 38 69 50 68 60 M21 42 C36 48 64 48 79 42" fill="none" stroke="#8a5a00" stroke-width="1.8" opacity=".6"/>' +
    '<path d="M78 38 C90 36 97 43 96 50 C95 57 88 61 81 58 C76.5 55.5 75 49 77 44 Z" fill="url(#g)" stroke="' + DK + '" stroke-width="2"/>' +
    '<circle cx="88" cy="47" r="2.6" fill="#241811"/><circle cx="87.2" cy="46" r=".9" fill="#fff"/>' +
    '<path d="M94 52 q-4 3 -8 2" fill="none" stroke="' + DK + '" stroke-width="1.8" stroke-linecap="round"/>' +
    '<ellipse cx="40" cy="35" rx="12" ry="6" fill="#fff" opacity=".35" transform="rotate(-18 40 35)"/>';

  /* ---- 金龙：正面盘旋，龙头为主 ---- */
  const DRAGON =
    '<path d="M50 8 L58 20 L72 12 L74 27 L90 26 L81 39 L94 49 L79 54 L84 70 L68 66 L60 82 L50 70 L40 82 L32 66 L16 70 L21 54 L6 49 L19 39 L10 26 L26 27 L28 12 L42 20 Z" fill="#e2951b" stroke="#7a4a00" stroke-width="2" stroke-linejoin="round"/>' +
    '<path d="M36 22 C32 13 35 6 44 4 C40 12 41 18 45 23 Z" fill="url(#t)" stroke="' + DK + '" stroke-width="1.8"/>' +
    '<path d="M64 22 C68 13 65 6 56 4 C60 12 59 18 55 23 Z" fill="url(#t)" stroke="' + DK + '" stroke-width="1.8"/>' +
    '<path d="M50 20 C66 20 78 30 78 44 C78 58 66 67 50 67 C34 67 22 58 22 44 C22 30 34 20 50 20 Z" fill="url(#g)" stroke="' + DK + '" stroke-width="2.5"/>' +
    '<path d="M22 42 C13 40 9 46 12 52 C17 54 21 51 23 47 Z" fill="url(#t)" stroke="' + DK + '" stroke-width="1.5"/>' +
    '<path d="M78 42 C87 40 91 46 88 52 C83 54 79 51 77 47 Z" fill="url(#t)" stroke="' + DK + '" stroke-width="1.5"/>' +
    '<path d="M30 36 Q38 30 45 35 M55 35 Q62 30 70 36" fill="none" stroke="#8a4a06" stroke-width="3" stroke-linecap="round"/>' +
    '<circle cx="38" cy="42" r="5" fill="#fff" stroke="' + DK + '" stroke-width="1"/><circle cx="39" cy="43" r="2.4" fill="#241811"/><circle cx="37.4" cy="40.6" r="1" fill="#fff"/>' +
    '<circle cx="62" cy="42" r="5" fill="#fff" stroke="' + DK + '" stroke-width="1"/><circle cx="61" cy="43" r="2.4" fill="#241811"/><circle cx="62.6" cy="40.6" r="1" fill="#fff"/>' +
    '<rect x="40" y="50" width="20" height="11" rx="5.5" fill="#ffe08a" stroke="' + DK + '" stroke-width="1.8"/>' +
    '<circle cx="45.5" cy="55.5" r="1.4" fill="' + DK + '"/><circle cx="54.5" cy="55.5" r="1.4" fill="' + DK + '"/>' +
    '<path d="M42 64 Q50 70 58 64" fill="none" stroke="' + DK + '" stroke-width="2.2" stroke-linecap="round"/>' +
    '<path d="M43 65 l2.5 4 2.5 -3.5 Z" fill="#fff"/><path d="M52 65.5 l2.5 3.5 2.5 -4 Z" fill="#fff"/>' +
    '<path d="M26 50 C16 52 12 60 18 67 M74 50 C84 52 88 60 82 67" fill="none" stroke="#d99a15" stroke-width="2.5" stroke-linecap="round"/>' +
    '<path d="M46 68 C47 76 53 76 54 68 C52 71 48 71 46 68 Z" fill="#e2951b" stroke="#7a4a00" stroke-width="1.2"/>';

  /* ---- 元宝碗：金碗堆满元宝 ---- */
  const BOWL =
    ING(35, 40, 0.85, -10) + ING(65, 40, 0.85, 10) + ING(50, 46, 1) +
    '<path d="M19 58 C19 76 32 86 50 86 C68 86 81 76 81 58 C70 64 30 64 19 58 Z" fill="url(#g)" stroke="' + DK + '" stroke-width="2.5"/>' +
    '<path d="M21 60 C30 66 70 66 79 60 L78 66 C68 71 32 71 22 66 Z" fill="#a3121f"/>' +
    '<ellipse cx="50" cy="57" rx="31" ry="7.5" fill="#ffe08a" stroke="' + DK + '" stroke-width="2.5"/>';

  /* ---- 金锣：支架+顶元宝 ---- */
  const GONG =
    '<rect x="13" y="44" width="9" height="42" rx="3.5" fill="url(#t)" stroke="' + DK + '" stroke-width="1.8"/>' +
    '<rect x="78" y="44" width="9" height="42" rx="3.5" fill="url(#t)" stroke="' + DK + '" stroke-width="1.8"/>' +
    '<rect x="8" y="84" width="19" height="7" rx="3" fill="#c98a12" stroke="' + DK + '" stroke-width="1.5"/>' +
    '<rect x="73" y="84" width="19" height="7" rx="3" fill="#c98a12" stroke="' + DK + '" stroke-width="1.5"/>' +
    ING(50, 26, 0.8) +
    '<rect x="7" y="34" width="86" height="10" rx="5" fill="url(#t)" stroke="' + DK + '" stroke-width="2"/>' +
    '<circle cx="22" cy="39" r="1.8" fill="#8a4a06"/><circle cx="50" cy="39" r="1.8" fill="#8a4a06"/><circle cx="78" cy="39" r="1.8" fill="#8a4a06"/>' +
    '<path d="M40 44 L44 49 M60 44 L56 49" stroke="' + DK + '" stroke-width="2"/>' +
    '<circle cx="50" cy="66" r="22" fill="url(#g)" stroke="' + DK + '" stroke-width="2.5"/>' +
    '<circle cx="50" cy="66" r="15.5" fill="none" stroke="#8a5a00" stroke-width="1.6" opacity=".8"/>' +
    '<circle cx="50" cy="66" r="7.5" fill="#ffe08a" stroke="#8a5a00" stroke-width="1.5"/>' +
    '<path d="M36 58 A19 19 0 0 1 47 47" fill="none" stroke="#fff" stroke-width="3" opacity=".5" stroke-linecap="round"/>' +
    '<path d="M11 44 V53 M89 44 V53" stroke="#c31432" stroke-width="3.5" stroke-linecap="round"/>' +
    '<circle cx="11" cy="56" r="2.5" fill="#c31432"/><circle cx="89" cy="56" r="2.5" fill="#c31432"/>';

  const IN = { koi: KOI, frog: FROG, turtle: TURTLE, dragon: DRAGON, ingot: BOWL, gong: GONG };

  /* ---- Wild 万能符：放射金光 + 双圈金边 + 大「福」+ WILD 标识 ---- */
  const WILD =
    '<circle cx="50" cy="50" r="49" fill="url(#r)"/>' +
    '<g fill="#ffd76e" opacity=".55"><use href="#w"/><use href="#w" transform="rotate(30 50 50)"/><use href="#w" transform="rotate(60 50 50)"/><use href="#w" transform="rotate(90 50 50)"/><use href="#w" transform="rotate(120 50 50)"/><use href="#w" transform="rotate(150 50 50)"/><use href="#w" transform="rotate(180 50 50)"/><use href="#w" transform="rotate(210 50 50)"/><use href="#w" transform="rotate(240 50 50)"/><use href="#w" transform="rotate(270 50 50)"/><use href="#w" transform="rotate(300 50 50)"/><use href="#w" transform="rotate(330 50 50)"/></g>' +
    '<circle cx="50" cy="50" r="46.5" fill="none" stroke="#8a1005" stroke-width="7"/>' +
    '<circle cx="50" cy="50" r="46.5" fill="none" stroke="url(#t)" stroke-width="4.5"/>' +
    '<circle cx="50" cy="50" r="40.5" fill="none" stroke="url(#t)" stroke-width="1.6" opacity=".9"/>' +
    '<circle cx="50" cy="50" r="37" fill="#7a0a10" stroke="#8a5a00" stroke-width="1.5"/>' +
    '<text x="50" y="46" text-anchor="middle" dominant-baseline="central" font-family="\'Songti SC\',\'STSong\',\'SimSun\',serif" font-weight="900" font-size="44" fill="url(#t)" stroke="#7a4a00" stroke-width="1.8" paint-order="stroke">福</text>' +
    '<text x="50" y="74" text-anchor="middle" dominant-baseline="central" font-family="\'Arial Black\',Arial,sans-serif" font-weight="900" font-size="12" letter-spacing="2" fill="url(#t)" stroke="#5a2a00" stroke-width="2.6" paint-order="stroke">WILD</text>';

  /* ---- 金身：红底放射金光 + 圆形金描边圈 ---- */
  const goldWrap = inner => svg100(
    '<circle cx="50" cy="50" r="49" fill="url(#r)"/>' +
    '<g fill="#ffd76e" opacity=".5"><use href="#w"/><use href="#w" transform="rotate(45 50 50)"/><use href="#w" transform="rotate(90 50 50)"/><use href="#w" transform="rotate(135 50 50)"/><use href="#w" transform="rotate(180 50 50)"/><use href="#w" transform="rotate(225 50 50)"/><use href="#w" transform="rotate(270 50 50)"/><use href="#w" transform="rotate(315 50 50)"/></g>' +
    '<g transform="translate(50 50) scale(.72) translate(-50 -50)">' + inner + '</g>' +
    '<circle cx="50" cy="50" r="45.5" fill="none" stroke="#8a1005" stroke-width="6.5"/>' +
    '<circle cx="50" cy="50" r="45.5" fill="none" stroke="url(#t)" stroke-width="3.5"/>',
    '<path id="w" d="M50 50 L46.5 5 L53.5 5 Z"/>');

  /* ---- 低符号：红底金框牌面 ---- */
  const card = ch => svg100(
    '<rect x="5" y="5" width="90" height="90" rx="12" fill="url(#r)" stroke="#4d0308" stroke-width="2"/>' +
    '<ellipse cx="50" cy="54" rx="31" ry="26" fill="#ffd964" opacity=".14"/>' +
    '<rect x="11" y="11" width="78" height="78" rx="8" fill="none" stroke="url(#t)" stroke-width="3.2"/>' +
    '<rect x="16.5" y="16.5" width="67" height="67" rx="5" fill="none" stroke="#8a5a00" stroke-width="1.2" opacity=".65"/>' +
    '<circle cx="50" cy="24" r="2" fill="url(#t)"/><circle cx="50" cy="76" r="2" fill="url(#t)"/>' +
    '<text x="50" y="52" text-anchor="middle" dominant-baseline="central" font-family="\'Arial Black\',Arial,sans-serif" font-weight="900" font-size="' + (ch.length > 1 ? 38 : 50) + '" fill="url(#t)" stroke="#4a1a00" stroke-width="2.4" paint-order="stroke">' + ch + '</text>');

  /* ---- 金币：浮雕福字 ---- */
  const coinSvg = svg100(
    '<circle cx="50" cy="50" r="46" fill="url(#g)" stroke="' + DK + '" stroke-width="3"/>' +
    '<circle cx="50" cy="50" r="41" fill="none" stroke="#8a5a00" stroke-width="1.6" stroke-dasharray="5 4" opacity=".8"/>' +
    '<circle cx="50" cy="50" r="34" fill="none" stroke="#a06a08" stroke-width="2" opacity=".7"/>' +
    '<text x="50" y="53" text-anchor="middle" dominant-baseline="central" font-family="\'Songti SC\',\'STSong\',\'SimSun\',serif" font-weight="900" font-size="42" fill="url(#t)" stroke="#7a4a00" stroke-width="1.6" paint-order="stroke">福</text>' +
    '<ellipse cx="33" cy="27" rx="13" ry="7" fill="#fff" opacity=".35" transform="rotate(-35 33 27)"/>');

  /* ---- LOGO 多福巨奖 400x100 ---- */
  const logoSvg = '<svg viewBox="0 0 400 100" xmlns="http://www.w3.org/2000/svg"><defs>' + T +
    '<linearGradient id="lr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c8203a"/><stop offset="1" stop-color="#6e0710"/></linearGradient></defs>' +
    '<rect x="3" y="8" width="394" height="84" rx="17" fill="url(#lr)" stroke="#5a0409" stroke-width="2"/>' +
    '<rect x="8" y="12.5" width="384" height="75" rx="13" fill="none" stroke="url(#t)" stroke-width="4"/>' +
    '<rect x="15" y="19" width="370" height="62" rx="9" fill="none" stroke="#f2c14e" stroke-width="1.4" opacity=".75"/>' +
    '<g fill="#f2c14e"><circle cx="24" cy="24" r="2.6"/><circle cx="376" cy="24" r="2.6"/><circle cx="24" cy="76" r="2.6"/><circle cx="376" cy="76" r="2.6"/></g>' +
    '<circle cx="54" cy="50" r="29" fill="#7a0a10" stroke="url(#t)" stroke-width="4"/>' +
    '<circle cx="54" cy="50" r="23" fill="none" stroke="#f2c14e" stroke-width="1.2" opacity=".7"/>' +
    '<text x="54" y="52" text-anchor="middle" dominant-baseline="central" font-family="\'Songti SC\',\'STSong\',\'SimSun\',serif" font-weight="900" font-size="34" fill="url(#t)">福</text>' +
    '<text x="248" y="65" text-anchor="middle" font-family="\'Songti SC\',\'STSong\',\'SimSun\',serif" font-weight="900" font-size="56" letter-spacing="6" fill="#4a0406">多福巨奖</text>' +
    '<text x="245" y="61" text-anchor="middle" font-family="\'Songti SC\',\'STSong\',\'SimSun\',serif" font-weight="900" font-size="56" letter-spacing="6" fill="url(#t)" stroke="#8a5a00" stroke-width="1.4" paint-order="stroke">多福巨奖</text></svg>';

  /* ---- 主屏背景 800x480：紫红渐变+暗金回纹龙纹+四角金饰 ---- */
  const bgMainSvg = '<svg viewBox="0 0 800 480" xmlns="http://www.w3.org/2000/svg"><defs>' +
    '<linearGradient id="bm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b1557"/><stop offset=".5" stop-color="#420d44"/><stop offset="1" stop-color="#1f0530"/></linearGradient>' +
    '<radialGradient id="bmg" cx="50%" cy="42%" r="65%"><stop offset="0" stop-color="#a1307e" stop-opacity=".5"/><stop offset="1" stop-color="#a1307e" stop-opacity="0"/></radialGradient>' +
    '<radialGradient id="bmv" cx="50%" cy="46%" r="72%"><stop offset=".62" stop-color="#12021c" stop-opacity="0"/><stop offset="1" stop-color="#12021c" stop-opacity=".55"/></radialGradient>' +
    '<linearGradient id="t2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe9a0"/><stop offset="1" stop-color="#c98a12"/></linearGradient>' +
    '<pattern id="bmm" width="26" height="14" patternUnits="userSpaceOnUse"><path d="M2 12 V2 H24 V9 H12 V5 H18" fill="none" stroke="#d9a441" stroke-width="2"/></pattern>' +
    '<path id="bc" d="M4 44 V16 Q4 4 16 4 H44" fill="none" stroke="url(#t2)" stroke-width="5"/></defs>' +
    '<rect width="800" height="480" fill="url(#bm)"/><rect width="800" height="480" fill="url(#bmg)"/>' +
    '<g opacity=".08" fill="none" stroke="#ffd76e" stroke-width="7" stroke-linecap="round">' +
    '<path d="M520 470 C560 380 500 330 560 250 C610 185 570 130 620 60"/><path d="M60 470 C100 400 40 340 90 270 C140 205 100 140 150 70"/></g>' +
    '<g opacity=".09" fill="none" stroke="#ffd76e" stroke-width="4"><path d="M560 320 a22 15 0 0 1 44 0 M585 250 a22 15 0 0 1 44 0 M555 175 a22 15 0 0 1 44 0 M95 350 a22 15 0 0 1 44 0 M80 200 a22 15 0 0 1 44 0"/></g>' +
    '<g opacity=".1" fill="none" stroke="#ffd76e" stroke-width="4" stroke-linecap="round"><path d="M240 420 q28 -24 56 0 q28 24 56 0 M440 60 q28 -24 56 0 q28 24 56 0"/></g>' +
    '<rect x="0" y="8" width="800" height="14" fill="url(#bmm)" opacity=".4"/><rect x="0" y="458" width="800" height="14" fill="url(#bmm)" opacity=".4"/>' +
    '<use href="#bc"/><use href="#bc" transform="translate(800 0) scale(-1 1)"/><use href="#bc" transform="translate(0 480) scale(1 -1)"/><use href="#bc" transform="translate(800 480) scale(-1 -1)"/>' +
    '<rect width="800" height="480" fill="url(#bmv)"/></svg>';

  /* ---- 顶部奖池屏背景 800x300：深红+金框+暗纹 ---- */
  const bgTopSvg = '<svg viewBox="0 0 800 300" xmlns="http://www.w3.org/2000/svg"><defs>' + T +
    '<linearGradient id="bt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#96182a"/><stop offset=".55" stop-color="#5e0a14"/><stop offset="1" stop-color="#36050c"/></linearGradient>' +
    '<radialGradient id="btg" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#d3404f" stop-opacity=".35"/><stop offset="1" stop-color="#d3404f" stop-opacity="0"/></radialGradient>' +
    '<pattern id="btm" width="26" height="14" patternUnits="userSpaceOnUse"><path d="M2 12 V2 H24 V9 H12 V5 H18" fill="none" stroke="#d9a441" stroke-width="2"/></pattern></defs>' +
    '<rect width="800" height="300" fill="url(#bt)"/><rect width="800" height="300" fill="url(#btg)"/>' +
    '<g opacity=".12" fill="none" stroke="#ffd76e" stroke-width="4"><circle cx="110" cy="150" r="34"/><circle cx="110" cy="150" r="22"/><rect x="102" y="142" width="16" height="16"/><circle cx="690" cy="150" r="34"/><circle cx="690" cy="150" r="22"/><rect x="682" y="142" width="16" height="16"/></g>' +
    '<g opacity=".1" fill="none" stroke="#ffd76e" stroke-width="4" stroke-linecap="round"><path d="M300 250 q25 -22 50 0 q25 22 50 0 M450 60 q25 -22 50 0 q25 22 50 0"/></g>' +
    '<rect x="10" y="12" width="780" height="12" fill="url(#btm)" opacity=".45"/><rect x="10" y="276" width="780" height="12" fill="url(#btm)" opacity=".45"/>' +
    '<rect x="6" y="6" width="788" height="288" rx="14" fill="none" stroke="url(#t)" stroke-width="6"/>' +
    '<rect x="15" y="15" width="770" height="270" rx="10" fill="none" stroke="#f2c14e" stroke-width="1.5" opacity=".7"/>' +
    '<g fill="#f2c14e"><circle cx="26" cy="26" r="3"/><circle cx="774" cy="26" r="3"/><circle cx="26" cy="274" r="3"/><circle cx="774" cy="274" r="3"/></g></svg>';

  /* ---- 福娃孩童头像 ---- */
  const kidSvg = '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><defs>' +
    '<radialGradient id="kf" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="#ffe9d2"/><stop offset=".7" stop-color="#f8c79b"/><stop offset="1" stop-color="#e8a878"/></radialGradient>' + T + '</defs>' +
    '<path d="M16 100 C16 84 31 75 50 75 C69 75 84 84 84 100 Z" fill="#c31432" stroke="#7a0810" stroke-width="2"/>' +
    '<path d="M22 96 C30 86 40 81 50 81 C60 81 70 86 78 96" fill="none" stroke="#f2c14e" stroke-width="2.5"/>' +
    '<circle cx="50" cy="89" r="3.5" fill="url(#t)" stroke="#8a5a00" stroke-width="1"/>' +
    '<circle cx="19" cy="50" r="5.5" fill="url(#kf)" stroke="#b5713d" stroke-width="1.5"/><circle cx="81" cy="50" r="5.5" fill="url(#kf)" stroke="#b5713d" stroke-width="1.5"/>' +
    '<circle cx="50" cy="47" r="30" fill="url(#kf)" stroke="#b5713d" stroke-width="2"/>' +
    '<circle cx="50" cy="9" r="6" fill="#33221a" stroke="#1c120c" stroke-width="1.5"/><rect x="43" y="10.5" width="14" height="4.5" rx="2.2" fill="#c31432"/>' +
    '<path d="M19 46 C16 22 32 11 50 11 C68 11 84 22 81 46 C77 37 73 35 68 41 C65 32 57 30 53 39 C50 31 43 31 39 39 C35 31 27 33 23 42 C22 43 20 45 19 46 Z" fill="#33221a" stroke="#1c120c" stroke-width="2"/>' +
    '<path d="M30 20 C36 15 44 13 52 14" stroke="#6b4a35" stroke-width="2" fill="none" opacity=".7" stroke-linecap="round"/>' +
    '<path d="M31 44 Q37 40.5 43 44 M57 44 Q63 40.5 69 44" fill="none" stroke="#33221a" stroke-width="2.2" stroke-linecap="round"/>' +
    '<circle cx="37" cy="50" r="4.6" fill="#241811"/><circle cx="35.6" cy="48.4" r="1.4" fill="#fff"/><circle cx="63" cy="50" r="4.6" fill="#241811"/><circle cx="61.6" cy="48.4" r="1.4" fill="#fff"/>' +
    '<path d="M48.5 57 Q50 59 51.5 57" fill="none" stroke="#c08050" stroke-width="1.8" stroke-linecap="round"/>' +
    '<path d="M42 62 Q50 71 58 62 Q50 66 42 62 Z" fill="#a8322a" stroke="#7a1a14" stroke-width="1.5"/>' +
    '<circle cx="28" cy="57" r="4.2" fill="#ff9e9e" opacity=".55"/><circle cx="72" cy="57" r="4.2" fill="#ff9e9e" opacity=".55"/></svg>';

  /* ---- 导出（memoized） ---- */
  const cache = {};
  const memo = (k, f) => cache[k] || (cache[k] = f());
  const CARDS = { 10: 1, J: 1, Q: 1, K: 1, A: 1 };

  return {
    symbol(id) {
      return memo('s' + id, () => enc(id === 'wild' ? svg100(WILD, '<path id="w" d="M50 50 L46.5 5 L53.5 5 Z"/>') : CARDS[id] ? card(id) : svg100(IN[id])));
    },
    gold(id) {
      return memo('g' + id, () => enc(goldWrap(IN[id])));
    },
    coin: () => memo('coin', () => enc(coinSvg)),
    logo: () => memo('logo', () => enc(logoSvg)),
    bgMain: () => memo('bgMain', () => enc(bgMainSvg)),
    bgTop: () => memo('bgTop', () => enc(bgTopSvg)),
    kidFu: () => memo('kidFu', () => enc(kidSvg))
  };
})();
