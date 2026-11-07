// 地摊套圈 — 美术资产（全部 SVG dataURI，零依赖，单图源码 ≤3KB）
// 风格：参考照片的陶瓷玩偶质感——亮色平涂 + 2~3 个暗面色块 + 一个高光斑
window.RT = window.RT || {};
RT.ART = (() => {
  'use strict';
  const E = encodeURIComponent;
  const svg = (vb, body) =>
    'data:image/svg+xml,' + E("<svg xmlns='http://www.w3.org/2000/svg' viewBox='" + vb + "'>" + body + '</svg>');
  const sh = (cy, rx, ry) => "<ellipse cx='100' cy='" + cy + "' rx='" + rx + "' ry='" + ry + "' fill='#000' opacity='.12'/>";

  // ---------- 9 种奖品（viewBox 0 0 200 240）----------
  const BODIES = {
    // 白鹅：红丝带白鹅，橙喙橙脚
    goose:
      sh(221, 58, 9) +
      "<path d='M158 152q24-16 28-38-26 2-40 18z' fill='#fbfaf5'/>" +
      "<ellipse cx='102' cy='172' rx='60' ry='46' fill='#fbfaf5'/>" +
      "<path d='M112 150q34 4 44 26-26 20-56 10 2-22 12-36z' fill='#eceadf'/>" +
      "<path d='M134 158q18 6 24 18-16 10-34 6 2-14 10-24z' fill='#dbd6c6'/>" +
      "<path d='M74 88c-14 26-8 52 22 66' stroke='#fbfaf5' stroke-width='26' fill='none' stroke-linecap='round'/>" +
      "<circle cx='76' cy='78' r='24' fill='#fbfaf5'/>" +
      "<path d='M54 72l-24 6 24 10z' fill='#f59e2c'/>" +
      "<path d='M54 82l-18 2 18 6z' fill='#d9821c'/>" +
      "<circle cx='70' cy='70' r='4.5' fill='#22201d'/><circle cx='71.6' cy='68.4' r='1.6' fill='#fff'/>" +
      "<circle cx='67' cy='63' r='5.5' fill='#fff' opacity='.7'/>" +
      "<path d='M76 118l-20-11-4 17z' fill='#e04a45'/><path d='M76 118l20-13 6 17z' fill='#e04a45'/>" +
      "<path d='M74 122l-10 17 9 2z' fill='#e04a45'/><circle cx='77' cy='120' r='6.5' fill='#c93833'/>" +
      "<path d='M56 221c2-9 10-13 22-11l-3 11z' fill='#f59e2c'/>" +
      "<path d='M120 221c0-9 10-13 22-11l-3 11z' fill='#f59e2c'/>",

    // 青蛙王：白脸 + 绿冠 + 大眼
    frog:
      sh(221, 62, 9) +
      "<ellipse cx='100' cy='182' rx='70' ry='50' fill='#3fae4a'/>" +
      "<path d='M32 188q68 32 136 0-10 44-68 44t-68-44z' fill='#2f8f3c'/>" +
      "<ellipse cx='56' cy='215' rx='22' ry='10' fill='#2f8f3c'/><ellipse cx='144' cy='215' rx='22' ry='10' fill='#2f8f3c'/>" +
      "<circle cx='100' cy='108' r='56' fill='#3fae4a'/>" +
      "<circle cx='66' cy='60' r='22' fill='#3fae4a'/><circle cx='134' cy='60' r='22' fill='#3fae4a'/>" +
      "<circle cx='66' cy='58' r='14' fill='#fff'/><circle cx='134' cy='58' r='14' fill='#fff'/>" +
      "<circle cx='69' cy='60' r='6.5' fill='#1c1b18'/><circle cx='131' cy='60' r='6.5' fill='#1c1b18'/>" +
      "<circle cx='71' cy='57' r='2.2' fill='#fff'/><circle cx='129' cy='57' r='2.2' fill='#fff'/>" +
      "<path d='M84 48L84 26 93 36 100 22 107 36 116 26 116 48z' fill='#f4b62c'/>" +
      "<rect x='82' y='43' width='36' height='7' rx='3' fill='#e39d12'/><circle cx='100' cy='46.5' r='2' fill='#e04a45'/>" +
      "<ellipse cx='100' cy='124' rx='42' ry='28' fill='#f4f1e8'/>" +
      "<circle cx='92' cy='114' r='2.6' fill='#5d6152'/><circle cx='108' cy='114' r='2.6' fill='#5d6152'/>" +
      "<path d='M84 126q16 13 32 0' stroke='#8a8f7e' stroke-width='3' fill='none' stroke-linecap='round'/>" +
      "<ellipse cx='76' cy='90' rx='9' ry='6' fill='#fff' opacity='.35'/>",

    // 熊猫：黑耳黑眼圈，抱竹子
    panda:
      sh(222, 64, 9) +
      "<ellipse cx='100' cy='178' rx='62' ry='50' fill='#f6f4ee'/>" +
      "<ellipse cx='100' cy='190' rx='30' ry='22' fill='#e9e6dd'/>" +
      "<ellipse cx='58' cy='208' rx='26' ry='17' fill='#2b2926'/><ellipse cx='142' cy='208' rx='26' ry='17' fill='#2b2926'/>" +
      "<path d='M126 222L52 116' stroke='#5aa53c' stroke-width='15' stroke-linecap='round'/>" +
      "<path d='M110 196l12-9M96 175l12-9M82 154l12-9M68 133l12-9' stroke='#3c7a26' stroke-width='4'/>" +
      "<path d='M52 116q-28-8-34-30 26 0 38 18z' fill='#5aa53c'/>" +
      "<path d='M52 116q-6-26 8-40 12 22 4 40z' fill='#6cb54a'/>" +
      "<path d='M48 154q-4 40 60 54' stroke='#2b2926' stroke-width='22' fill='none' stroke-linecap='round'/>" +
      "<path d='M152 154q4 40-34 54' stroke='#2b2926' stroke-width='22' fill='none' stroke-linecap='round'/>" +
      "<circle cx='56' cy='52' r='20' fill='#2b2926'/><circle cx='144' cy='52' r='20' fill='#2b2926'/>" +
      "<circle cx='100' cy='84' r='50' fill='#f6f4ee'/>" +
      "<ellipse cx='74' cy='82' rx='15' ry='19' fill='#2b2926' transform='rotate(-14 74 82)'/>" +
      "<ellipse cx='126' cy='82' rx='15' ry='19' fill='#2b2926' transform='rotate(14 126 82)'/>" +
      "<circle cx='75' cy='81' r='6.5' fill='#efece4'/><circle cx='77' cy='82' r='3.4' fill='#141311'/>" +
      "<circle cx='125' cy='81' r='6.5' fill='#efece4'/><circle cx='127' cy='82' r='3.4' fill='#141311'/>" +
      "<path d='M92 102h16l-8 9z' fill='#2b2926'/>" +
      "<path d='M100 111v6m0 0q-6 8-14 4m14-4q6 8 14 4' stroke='#4a4640' stroke-width='3' fill='none' stroke-linecap='round'/>" +
      "<circle cx='82' cy='62' r='7' fill='#fff' opacity='.55'/>",

    // 小狗：棕白花狗，垂耳白胸
    dog:
      sh(222, 58, 9) +
      "<path d='M58 52q-24 6-20 44 8 16 26 10-8-32-6-54z' fill='#a06c38'/>" +
      "<path d='M142 52q24 6 20 44-8 16-26 10 8-32 6-54z' fill='#a06c38'/>" +
      "<path d='M100 122c-38 0-60 30-60 62 0 20 13 30 29 30h62c16 0 29-10 29-30 0-32-22-62-60-62z' fill='#c08a4e'/>" +
      "<path d='M40 190q60 22 120 0-8 28-60 28t-60-28z' fill='#a97840'/>" +
      "<ellipse cx='100' cy='192' rx='28' ry='32' fill='#f3ece1'/>" +
      "<rect x='76' y='190' width='18' height='42' rx='9' fill='#f3ece1'/><rect x='106' y='190' width='18' height='42' rx='9' fill='#f3ece1'/>" +
      "<path d='M78 226h14M108 226h14' stroke='#d8cbb4' stroke-width='3'/>" +
      "<circle cx='100' cy='76' r='46' fill='#c08a4e'/>" +
      "<path d='M100 32c-11 11-13 32 0 48 13-16 11-37 0-48z' fill='#f3ece1'/>" +
      "<ellipse cx='100' cy='97' rx='24' ry='16' fill='#f3ece1'/>" +
      "<ellipse cx='100' cy='89' rx='9' ry='7' fill='#26221e'/>" +
      "<path d='M100 96v6m0 0q-9 7-17 1m17-1q9 7 17 1' stroke='#6b4a26' stroke-width='3' fill='none' stroke-linecap='round'/>" +
      "<circle cx='80' cy='64' r='5.5' fill='#26221e'/><circle cx='120' cy='64' r='5.5' fill='#26221e'/>" +
      "<circle cx='82' cy='62' r='1.8' fill='#fff'/><circle cx='122' cy='62' r='1.8' fill='#fff'/>" +
      "<path d='M138 56q10 18 5 42l-13 8q10-26 8-50z' fill='#a97840'/>" +
      "<circle cx='84' cy='50' r='7' fill='#fff' opacity='.45'/>",

    // 粉猪：存钱罐，顶部投币口
    pig:
      sh(228, 70, 8) +
      "<path d='M172 160q14-2 12-12-2-8-10-6' stroke='#e59aae' stroke-width='6' fill='none' stroke-linecap='round'/>" +
      "<path d='M56 110l-6-36 32 13z' fill='#f6b6c3'/><path d='M58 106l-3-22 18 8z' fill='#d67f96'/>" +
      "<path d='M144 110l6-36-32 13z' fill='#f6b6c3'/><path d='M142 106l3-22-18 8z' fill='#d67f96'/>" +
      "<ellipse cx='100' cy='164' rx='74' ry='60' fill='#f6b6c3'/>" +
      "<path d='M30 178q70 34 140 0-10 42-70 42t-70-42z' fill='#e59aae'/>" +
      "<rect x='80' y='101' width='40' height='10' rx='5' fill='#7d3b4d'/>" +
      "<rect x='84' y='103' width='32' height='3' rx='1.5' fill='#a05568'/>" +
      "<ellipse cx='100' cy='158' rx='27' ry='19' fill='#e89aac'/>" +
      "<ellipse cx='91' cy='158' rx='5' ry='7' fill='#a04a60'/><ellipse cx='109' cy='158' rx='5' ry='7' fill='#a04a60'/>" +
      "<circle cx='64' cy='140' r='6' fill='#33262a'/><circle cx='136' cy='140' r='6' fill='#33262a'/>" +
      "<circle cx='66' cy='138' r='1.8' fill='#fff'/><circle cx='138' cy='138' r='1.8' fill='#fff'/>" +
      "<ellipse cx='54' cy='160' rx='10' ry='6' fill='#f193a8'/><ellipse cx='146' cy='160' rx='10' ry='6' fill='#f193a8'/>" +
      "<rect x='58' y='214' width='20' height='18' rx='7' fill='#e59aae'/><rect x='122' y='214' width='20' height='18' rx='7' fill='#e59aae'/>" +
      "<ellipse cx='70' cy='120' rx='14' ry='9' fill='#fff' opacity='.55' transform='rotate(-24 70 120)'/>",

    // 巴哥：黑脸褶皱
    pug:
      sh(222, 58, 9) +
      "<path d='M100 120c-38 0-58 30-58 60 0 20 12 30 28 30h60c16 0 28-10 28-30 0-30-20-60-58-60z' fill='#d9cfc0'/>" +
      "<path d='M46 190q54 20 108 0-8 26-54 26t-54-26z' fill='#c4b8a5'/>" +
      "<ellipse cx='100' cy='190' rx='25' ry='29' fill='#efe8db'/>" +
      "<rect x='72' y='198' width='20' height='20' rx='9' fill='#efe8db'/><rect x='108' y='198' width='20' height='20' rx='9' fill='#efe8db'/>" +
      "<circle cx='100' cy='74' r='46' fill='#d9cfc0'/>" +
      "<path d='M100 56c22 0 36 17 34 38-2 19-15 31-34 31s-32-12-34-31c-2-21 12-38 34-38z' fill='#2e2a27'/>" +
      "<path d='M74 46q26-13 52 0' stroke='#b3a691' stroke-width='3.5' fill='none' stroke-linecap='round'/>" +
      "<path d='M80 36q20-10 40 0' stroke='#b3a691' stroke-width='3.5' fill='none' stroke-linecap='round'/>" +
      "<path d='M58 44q-16 6-12 28 10 9 22 3z' fill='#2e2a27'/><path d='M142 44q16 6 12 28-10 9-22 3z' fill='#2e2a27'/>" +
      "<circle cx='78' cy='74' r='9.5' fill='none' stroke='#786d63' stroke-width='2.5'/><circle cx='122' cy='74' r='9.5' fill='none' stroke='#786d63' stroke-width='2.5'/>" +
      "<circle cx='78' cy='74' r='6.5' fill='#171412'/><circle cx='81' cy='70.5' r='3' fill='#fff'/>" +
      "<circle cx='122' cy='74' r='6.5' fill='#171412'/><circle cx='125' cy='70.5' r='3' fill='#fff'/>" +
      "<path d='M88 104q12 12 24 0l-3 9q-9 7-18 0z' fill='#171412'/>" +
      "<path d='M97 112q3 7 8 1z' fill='#e0707c'/>" +
      "<circle cx='72' cy='46' r='6' fill='#fff' opacity='.5'/>",

    // 护目镜小子：金护目镜 + 黄衣 + 手持金盘
    goggle:
      "<ellipse cx='100' cy='229' rx='54' ry='7' fill='#000' opacity='.12'/>" +
      "<rect x='79' y='190' width='17' height='36' rx='8' fill='#f2efe8'/><rect x='104' y='190' width='17' height='36' rx='8' fill='#f2efe8'/>" +
      "<rect x='75' y='216' width='25' height='14' rx='6' fill='#fff'/><rect x='100' y='216' width='25' height='14' rx='6' fill='#fff'/>" +
      "<rect x='71' y='166' width='58' height='30' rx='10' fill='#2e2b28'/>" +
      "<rect x='90' y='96' width='20' height='14' fill='#f2efe8'/>" +
      "<rect x='70' y='106' width='60' height='66' rx='20' fill='#f7cf3c'/>" +
      "<path d='M100 110v58' stroke='#2e2b28' stroke-width='3'/>" +
      "<rect x='70' y='158' width='60' height='10' rx='5' fill='#2e2b28'/>" +
      "<path d='M74 118q-16 22-10 46' stroke='#f7cf3c' stroke-width='16' fill='none' stroke-linecap='round'/>" +
      "<path d='M126 122q22 8 32 24' stroke='#f7cf3c' stroke-width='16' fill='none' stroke-linecap='round'/>" +
      "<circle cx='63' cy='168' r='8' fill='#fff'/><circle cx='160' cy='149' r='8' fill='#fff'/>" +
      "<ellipse cx='167' cy='136' rx='30' ry='9' fill='#f4c542'/><ellipse cx='167' cy='139' rx='30' ry='9' fill='#c8901c'/>" +
      "<ellipse cx='167' cy='136' rx='19' ry='5' fill='#dfae2b'/><ellipse cx='155' cy='134' rx='7' ry='2.4' fill='#fff' opacity='.65'/>" +
      "<circle cx='100' cy='66' r='38' fill='#f2efe8'/>" +
      "<path d='M70 44l-8-24 22 12z' fill='#f2efe8'/><path d='M130 44l8-24-22 12z' fill='#f2efe8'/>" +
      "<path d='M71 38l-4-12 12 7z' fill='#f0b9c4'/><path d='M129 38l4-12-12 7z' fill='#f0b9c4'/>" +
      "<rect x='61' y='46' width='78' height='13' rx='6.5' fill='#c8901c'/>" +
      "<circle cx='82' cy='43' r='13' fill='#e8b62c'/><circle cx='118' cy='43' r='13' fill='#e8b62c'/>" +
      "<circle cx='82' cy='43' r='8' fill='#f8dd7a'/><circle cx='118' cy='43' r='8' fill='#f8dd7a'/>" +
      "<circle cx='79' cy='40' r='3' fill='#fff'/><circle cx='115' cy='40' r='3' fill='#fff'/>" +
      "<circle cx='86' cy='74' r='5' fill='#26221e'/><circle cx='114' cy='74' r='5' fill='#26221e'/>" +
      "<path d='M94 87q6 5 12 0' stroke='#c99a68' stroke-width='3' fill='none' stroke-linecap='round'/>",

    // 蓝裙娃娃：金发卷 + 蓝蓬裙
    doll:
      sh(224, 58, 9) +
      "<circle cx='100' cy='58' r='40' fill='#eec25c'/>" +
      "<circle cx='64' cy='72' r='15' fill='#eec25c'/><circle cx='136' cy='72' r='15' fill='#eec25c'/>" +
      "<circle cx='72' cy='38' r='13' fill='#eec25c'/><circle cx='128' cy='38' r='13' fill='#eec25c'/>" +
      "<rect x='93' y='92' width='14' height='18' fill='#ffe3c9'/>" +
      "<circle cx='100' cy='66' r='33' fill='#ffe3c9'/>" +
      "<path d='M67 62q3-28 33-28t33 28q-10-13-33-13t-33 13z' fill='#eec25c'/>" +
      "<circle cx='88' cy='70' r='4.5' fill='#26221e'/><circle cx='112' cy='70' r='4.5' fill='#26221e'/>" +
      "<circle cx='89.6' cy='68.4' r='1.5' fill='#fff'/><circle cx='113.6' cy='68.4' r='1.5' fill='#fff'/>" +
      "<ellipse cx='80' cy='79' rx='7' ry='4' fill='#f6b4a0'/><ellipse cx='120' cy='79' rx='7' ry='4' fill='#f6b4a0'/>" +
      "<path d='M96 84q4 4 8 0' stroke='#c66a4a' stroke-width='2.5' fill='none' stroke-linecap='round'/>" +
      "<circle cx='130' cy='40' r='6' fill='#7db4f0'/><circle cx='130' cy='40' r='2.5' fill='#fff'/>" +
      "<path d='M100 106c-34 0-56 40-62 78-3 20 10 30 24 30h76c14 0 27-10 24-30-6-38-28-78-62-78z' fill='#2f6fd8'/>" +
      "<path d='M100 112c-8 26-10 58-6 96h12c4-38 2-70-6-96z' fill='#2456b0'/>" +
      "<path d='M60 200q40 18 80 0l3 12q-43 18-86 0z' fill='#8fb8ee'/>" +
      "<path d='M78 118q-16 16-12 38' stroke='#ffdcc2' stroke-width='12' fill='none' stroke-linecap='round'/>" +
      "<path d='M122 118q16 16 12 38' stroke='#ffdcc2' stroke-width='12' fill='none' stroke-linecap='round'/>" +
      "<circle cx='70' cy='176' r='5' fill='#ffdcc2'/><circle cx='130' cy='176' r='5' fill='#ffdcc2'/>" +
      "<circle cx='84' cy='42' r='6' fill='#fff' opacity='.55'/>",

    // 小火龙：红色幼龙，头顶棘刺，喷小火
    dragon:
      sh(224, 60, 9) +
      "<path d='M146 196q30-4 28-30' stroke='#e8484f' stroke-width='13' fill='none' stroke-linecap='round'/>" +
      "<path d='M172 168l10-14 5 16z' fill='#c23540'/>" +
      "<path d='M58 172q-28-8-32-32 24 2 36 16z' fill='#c23540'/>" +
      "<path d='M142 172q28-8 32-32-24 2-36 16z' fill='#c23540'/>" +
      "<ellipse cx='100' cy='186' rx='52' ry='40' fill='#e8484f'/>" +
      "<ellipse cx='100' cy='194' rx='31' ry='25' fill='#ffd9a8'/>" +
      "<path d='M76 190q24 12 48 0' stroke='#f0b070' stroke-width='3' fill='none'/>" +
      "<ellipse cx='70' cy='222' rx='17' ry='8' fill='#c23540'/><ellipse cx='130' cy='222' rx='17' ry='8' fill='#c23540'/>" +
      "<path d='M64 62l-16-18 22 2z' fill='#c23540'/><path d='M92 50l8-28 10 28z' fill='#c23540'/><path d='M136 62l16-18-22 2z' fill='#c23540'/>" +
      "<circle cx='100' cy='94' r='48' fill='#e8484f'/>" +
      "<path d='M134 64q14 16 11 42-8 15-22 19 15-28 11-61z' fill='#c23540'/>" +
      "<ellipse cx='100' cy='114' rx='26' ry='15' fill='#f2707a'/>" +
      "<circle cx='92' cy='110' r='2.5' fill='#a12a34'/><circle cx='108' cy='110' r='2.5' fill='#a12a34'/>" +
      "<path d='M88 122q12 10 24 0l-4 9q-8 6-16 0z' fill='#7c1f28'/>" +
      "<path d='M100 132q-9 5-5 16 3 8 5 14 2-6 5-14 4-11-5-16z' fill='#f59e2c'/>" +
      "<path d='M100 139q-4 4-2 11 1 5 2 9 1-4 2-9 2-7-2-11z' fill='#ffd23f'/>" +
      "<circle cx='76' cy='84' r='14' fill='#fff'/><circle cx='124' cy='84' r='14' fill='#fff'/>" +
      "<circle cx='79' cy='86' r='7' fill='#1c1b18'/><circle cx='121' cy='86' r='7' fill='#1c1b18'/>" +
      "<circle cx='82' cy='81' r='2.6' fill='#fff'/><circle cx='124' cy='81' r='2.6' fill='#fff'/>" +
      "<circle cx='76' cy='60' r='8' fill='#fff' opacity='.4'/>"
  };

  const CACHE = {};
  function prize(id) {
    return CACHE[id] || (CACHE[id] = svg('0 0 200 240', BODIES[id] || BODIES.goose));
  }

  // ---------- 凳子：厚凳面板 + 四短腿，顶面比侧面亮一档 ----------
  const STOOLS = {
    red:    { t: '#f2574e', f: '#d23b36', l: '#a52c29' },
    green:  { t: '#4ec95b', f: '#33a844', l: '#268236' },
    yellow: { t: '#ffd94f', f: '#f0b52e', l: '#c98f20' }
  };
  function stool(color) {
    const c = STOOLS[color] || STOOLS.red;
    return svg('0 0 200 160',
      "<ellipse cx='104' cy='151' rx='88' ry='7' fill='#000' opacity='.10'/>" +
      "<path d='M112 30h14l-2 106h-10z' fill='" + c.l + "'/>" +
      "<path d='M22 52l66 32 96-42v16L88 100 22 68z' fill='" + c.f + "'/>" +
      "<path d='M88 84l96-42v16L88 100z' fill='" + c.l + "' opacity='.55'/>" +
      "<path d='M22 52L118 16l66 26-96 42z' fill='" + c.t + "'/>" +
      "<path d='M28 52l84-33 10 4-84 33z' fill='#fff' opacity='.22'/>" +
      "<path d='M22 68h14l-2 82H24z' fill='" + c.l + "'/>" +
      "<path d='M81 100h14l-1 50H82z' fill='" + c.l + "'/>" +
      "<path d='M170 58h14l-1 88h-12z' fill='" + c.l + "'/>"
    );
  }

  // ---------- 老板：格子衬衫 + 深色裤，站立微侧，不画圈 ----------
  const VENDOR =
    "<defs><pattern id='pc' width='18' height='18' patternUnits='userSpaceOnUse'>" +
    "<rect width='18' height='18' fill='#8e959c'/>" +
    "<path d='M0 4h18M0 12h18' stroke='#6d747b' stroke-width='4'/>" +
    "<path d='M4 0v18M12 0v18' stroke='#565d64' stroke-width='4'/></pattern></defs>" +
    "<ellipse cx='110' cy='288' rx='66' ry='8' fill='#000' opacity='.14'/>" +
    "<path d='M88 196h22l-4 88H84z' fill='#2c3446'/><path d='M112 196h22l6 88h-22z' fill='#2c3446'/>" +
    "<ellipse cx='86' cy='286' rx='15' ry='6' fill='#1d222e'/><ellipse cx='130' cy='286' rx='16' ry='6' fill='#1d222e'/>" +
    "<path d='M74 134q-18 24-11 58' stroke='#82898f' stroke-width='19' fill='none' stroke-linecap='round'/>" +
    "<path d='M146 134q18 24 11 58' stroke='#82898f' stroke-width='19' fill='none' stroke-linecap='round'/>" +
    "<rect x='51' y='182' width='24' height='10' rx='5' fill='#4a5057'/><rect x='145' y='182' width='24' height='10' rx='5' fill='#4a5057'/>" +
    "<circle cx='62' cy='199' r='9' fill='#e8b48e'/><circle cx='158' cy='199' r='9' fill='#e8b48e'/>" +
    "<path d='M110 116c32 0 48 14 48 36v40c0 14-9 20-22 20H84c-13 0-22-6-22-20v-40c0-22 16-36 48-36z' fill='url(#pc)'/>" +
    "<path d='M96 116l14 16 14-16-9-6h-10z' fill='#4a5057'/>" +
    "<path d='M66 204h88v6q-44 8-88 0z' fill='#6d747b'/>" +
    "<rect x='100' y='100' width='20' height='20' fill='#e0ac84'/>" +
    "<circle cx='110' cy='80' r='30' fill='#eec39a'/>" +
    "<circle cx='81' cy='84' r='5.5' fill='#eec39a'/>" +
    "<path d='M80 82q0-30 30-30t30 30q-7-15-30-15t-30 15z' fill='#332f2c'/>" +
    "<circle cx='100' cy='82' r='3' fill='#26221e'/><circle cx='119' cy='82' r='3' fill='#26221e'/>" +
    "<path d='M110 88q4 4 0 8' stroke='#c98f68' stroke-width='2.5' fill='none' stroke-linecap='round'/>" +
    "<path d='M104 98q7 5 14 0' stroke='#a97550' stroke-width='2.5' fill='none' stroke-linecap='round'/>" +
    "<circle cx='99' cy='68' r='5' fill='#fff' opacity='.5'/>";

  // ---------- 圈堆：8 个彩虹圈黄红蓝绿循环叠放 ----------
  const RING_COLORS = ['#f2c53d', '#e2544a', '#3d9fe0', '#48b45c'];
  function ringEllipse(cy, col) {
    return "<ellipse cx='120' cy='" + cy + "' rx='88' ry='18' fill='none' stroke='" + col + "' stroke-width='12'/>";
  }
  let RINGS = '';
  for (let i = 0; i < 8; i++) RINGS += ringEllipse(114 - i * 12, RING_COLORS[i % 4]);
  const RING_STACK =
    "<ellipse cx='120' cy='132' rx='94' ry='7' fill='#000' opacity='.12'/>" + RINGS +
    "<path d='M64 24q26-10 52-6' stroke='#fff' opacity='.5' stroke-width='4' fill='none' stroke-linecap='round'/>" +
    "<path d='M74 48q18-7 36-5' stroke='#fff' opacity='.35' stroke-width='3.5' fill='none' stroke-linecap='round'/>";

  // ---------- 游戏币：金色圆币 ¥ ----------
  const COIN =
    "<circle cx='50' cy='50' r='46' fill='#f2c043'/>" +
    "<circle cx='50' cy='50' r='43' fill='none' stroke='#d29a26' stroke-width='5'/>" +
    "<circle cx='50' cy='50' r='34' fill='none' stroke='#e3ad32' stroke-width='3'/>" +
    "<text x='50' y='67' font-family='sans-serif' font-size='46' font-weight='700' text-anchor='middle' fill='#a8740f'>¥</text>" +
    "<path d='M24 32q9-13 25-16' stroke='#ffe9a8' stroke-width='6' fill='none' stroke-linecap='round'/>";

  // ---------- 灯泡：暖白光晕小灯泡 ----------
  const BULB =
    "<defs><radialGradient id='bg'><stop offset='0' stop-color='#fff8dc' stop-opacity='.95'/>" +
    "<stop offset='.5' stop-color='#ffedaa' stop-opacity='.38'/>" +
    "<stop offset='1' stop-color='#ffedaa' stop-opacity='0'/></radialGradient></defs>" +
    "<circle cx='30' cy='40' r='30' fill='url(#bg)'/>" +
    "<circle cx='30' cy='38' r='16' fill='#fff6cf'/>" +
    "<circle cx='30' cy='38' r='16' fill='none' stroke='#e5c468' stroke-width='1.6'/>" +
    "<path d='M25 38l5 7 5-7' stroke='#e8a53c' stroke-width='2' fill='none' stroke-linecap='round'/>" +
    "<circle cx='24' cy='32' r='4' fill='#fff'/>" +
    "<path d='M24 54h12l-1 5H25z' fill='#b8b19c'/>" +
    "<path d='M25 59h10M25.5 63h9' stroke='#8f8974' stroke-width='2'/>" +
    "<path d='M26 66h8l-1.5 6h-5z' fill='#7d7663'/>";

  return {
    prize,
    stool,
    vendor: () => svg('0 0 220 300', VENDOR),
    ringStack: () => svg('0 0 240 140', RING_STACK),
    coin: () => svg('0 0 100 100', COIN),
    bulb: () => svg('0 0 60 90', BULB)
  };
})();
