/* ============================================================
 * FIERY DRAGON 火龙珠 — ART 模块 (纯程序化 SVG, 无外部资源)
 * window.ART.symbol / luckEgg / coin / jpCoin / scene
 * 所有渐变 id 加前缀 fdart- 防冲突; svg 以 viewBox 起头, 无宽高
 * ============================================================ */
window.ART = (() => {

  const P = 'fdart-';
  const FONT = "'Arial Black',Arial,sans-serif";

  /* ---------- 小工具 ---------- */
  const stops = arr => arr.map(s =>
    `<stop offset="${s[0]}" stop-color="${s[1]}"${s[2] != null ? ` stop-opacity="${s[2]}"` : ''}/>`).join('');

  const lg = (id, arr, x1 = 0, y1 = 0, x2 = 0, y2 = 1) =>
    `<linearGradient id="${P}${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops(arr)}</linearGradient>`;

  const rg = (id, arr, cx = 0.34, cy = 0.28, r = 0.95) =>
    `<radialGradient id="${P}${id}" cx="${cx}" cy="${cy}" r="${r}">${stops(arr)}</radialGradient>`;

  const svg = (vb, defs, body) =>
    `<svg viewBox="0 0 ${vb}" xmlns="http://www.w3.org/2000/svg"><defs>${defs}</defs>${body}</svg>`;

  const n = v => (+v).toFixed(1).replace(/\.0$/, '');

  // 双层描边肢体/杆件: 先粗描边再细填充 → 卡通轮廓
  const limb = (pts, w, fill, line) => {
    const ps = pts.map(p => `${n(p[0])},${n(p[1])}`).join(' ');
    return `<polyline points="${ps}" fill="none" stroke="${line}" stroke-width="${w + 6}" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<polyline points="${ps}" fill="none" stroke="${fill}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  };

  const hoof = (x, y, rot, f = '#4a3f45') =>
    `<rect x="-8" y="-5.5" width="17" height="12" rx="3.5" transform="translate(${n(x)},${n(y)}) rotate(${rot})" fill="${f}" stroke="#2a2228" stroke-width="2"/>`;

  const starPath = (cx, cy, R, r, rot = -90) => {
    let d = '';
    for (let i = 0; i < 10; i++) {
      const rad = (rot + i * 36) * Math.PI / 180;
      const rr = i % 2 ? r : R;
      d += (i ? 'L' : 'M') + n(cx + rr * Math.cos(rad)) + ',' + n(cy + rr * Math.sin(rad));
    }
    return d + 'Z';
  };

  // 放射光楔形
  const wedge = (cx, cy, r, a0, a1, fill) => {
    const p = a => [cx + r * Math.cos(a * Math.PI / 180), cy + r * Math.sin(a * Math.PI / 180)];
    const [x1, y1] = p(a0), [x2, y2] = p(a1);
    return `<path d="M${cx},${cy} L${n(x1)},${n(y1)} A${r},${r} 0 0 1 ${n(x2)},${n(y2)} Z" fill="${fill}"/>`;
  };

  const spark4 = (x, y, s, op, fill = '#ffffff') =>
    `<path transform="translate(${n(x)},${n(y)}) scale(${s})" d="M0,-15 L3,-3 L15,0 L3,3 L0,15 L-3,3 L-15,0 L-3,-3 Z" fill="${fill}" opacity="${op}"/>`;

  const leaf = (d) =>
    `<path d="${d}" fill="url(#${P}leaf)" stroke="#3f7a16" stroke-width="2.5" stroke-linejoin="round"/>`;

  const vein = (d) =>
    `<path d="${d}" stroke="#eafccd" stroke-width="1.6" fill="none" opacity=".8" stroke-linecap="round"/>`;

  /* ---------- 水果机符号 (viewBox 0 0 100 100) ---------- */
  const SYM = {

    apple: () => svg('100 100',
      rg('ap', [[0, '#ff8f72'], [0.45, '#ee3b30'], [1, '#ad111a']]) +
      lg('leaf', [[0, '#a4e455'], [1, '#4f9c1e']], 0, 0, 1, 1),
      leaf(`M57,27 C60,13 76,7 88,12 C87,25 74,34 60,31 C57,30 56,29 57,27 Z `) +
      `<path d="M62,27 C71,21 79,16 86,13" stroke="#3f7a16" stroke-width="1.6" fill="none" opacity=".7"/>` +
      `<path d="M50,37 C50,29 52,24 56,19" stroke="#7a4218" stroke-width="5" fill="none" stroke-linecap="round"/>` +
      `<path d="M50,37 C61,26 82,32 83,55 C84,77 67,89 56,89 C53,89 51,88 50,86.5 C49,88 47,89 44,89 C33,89 16,77 17,55 C18,32 39,26 50,37 Z" fill="url(#${P}ap)" stroke="#66110f" stroke-width="3.5" stroke-linejoin="round"/>` +
      `<path d="M44,84 C36,84 24,76 21,62" stroke="#8f1520" stroke-width="3" fill="none" opacity=".5" stroke-linecap="round"/>` +
      `<ellipse cx="35" cy="49" rx="8" ry="13" fill="#fff" opacity=".78" transform="rotate(-22 35 49)"/>` +
      `<circle cx="30" cy="67" r="3" fill="#fff" opacity=".45"/>`
    ),

    orange: () => svg('100 100',
      rg('or', [[0, '#ffd95e'], [0.5, '#ff9c22'], [1, '#df6906']]) +
      lg('leaf', [[0, '#a4e455'], [1, '#4f9c1e']], 0, 0, 1, 1),
      `<circle cx="50" cy="57" r="31" fill="url(#${P}or)" stroke="#a35408" stroke-width="3.5"/>` +
      [[62, 68, 2.2], [70, 58, 1.8], [55, 76, 2], [40, 74, 1.7], [66, 44, 1.5], [30, 62, 1.6]]
        .map(d => `<circle cx="${d[0]}" cy="${d[1]}" r="${d[2]}" fill="#c65f06" opacity=".4"/>`).join('') +
      [[42, 46, 2.4], [34, 56, 1.8], [52, 40, 1.8], [60, 52, 1.6]]
        .map(d => `<circle cx="${d[0]}" cy="${d[1]}" r="${d[2]}" fill="#ffe08a" opacity=".6"/>`).join('') +
      `<ellipse cx="37" cy="45" rx="8" ry="13" fill="#fff" opacity=".8" transform="rotate(-24 37 45)"/>` +
      `<circle cx="32" cy="63" r="3" fill="#fff" opacity=".4"/>` +
      `<path d="M50,27 C49,23 50,20 52,17" stroke="#8a5a1e" stroke-width="4" fill="none" stroke-linecap="round"/>` +
      `<circle cx="51" cy="26" r="4" fill="#8a5a1e"/>` +
      leaf(`M53,22 C57,9 73,4 85,10 C83,22 70,30 57,27 C54,26 52,24 53,22 Z`) +
      vein(`M58,24 C66,18 73,14 80,11`)
    ),

    lemon: () => svg('100 100',
      rg('le', [[0, '#f4f98e'], [0.55, '#cde14b'], [1, '#9fc22e']]) +
      lg('leaf', [[0, '#a4e455'], [1, '#4f9c1e']], 0, 0, 1, 1),
      `<path d="M47,31 C45,26 45,22 47,18" stroke="#7a9a18" stroke-width="3.5" fill="none" stroke-linecap="round"/>` +
      leaf(`M48,28 C50,16 62,9 75,11 C74,21 63,29 51,29 Z`) +
      vein(`M52,25 C58,19 65,15 71,12`) +
      `<path d="M50,31 C65,31 79,40 84,51 L91,55 L84,60 C79,71 65,80 50,80 C35,80 21,71 16,60 L9,55 L16,51 C21,40 35,31 50,31 Z" fill="url(#${P}le)" stroke="#5f7d10" stroke-width="3.5" stroke-linejoin="round"/>` +
      `<path d="M26,68 C33,74 44,77 54,76" stroke="#7f9e1c" stroke-width="3" fill="none" opacity=".55" stroke-linecap="round"/>` +
      `<ellipse cx="36" cy="44" rx="8" ry="11" fill="#fff" opacity=".72" transform="rotate(-18 36 44)"/>` +
      `<circle cx="31" cy="58" r="2.6" fill="#fff" opacity=".4"/>`
    ),

    bell: () => svg('100 100',
      lg('be', [[0, '#fff0a0'], [0.5, '#ffd23e'], [1, '#eba412']]) +
      lg('bs', [[0, '#f6bd3c'], [1, '#df9006']]),
      `<circle cx="50" cy="16" r="6" fill="url(#${P}be)" stroke="#8a5a08" stroke-width="3"/>` +
      `<path d="M50,20 C37,20 31,31 30,45 C29,57 26,64 21,70 C19,73 21,77 25,77 L75,77 C79,77 81,73 79,70 C74,64 71,57 70,45 C69,31 63,20 50,20 Z" fill="url(#${P}be)" stroke="#8a5a08" stroke-width="3.5" stroke-linejoin="round"/>` +
      `<path d="M63,28 C68,34 70,42 70,50" stroke="#c87e08" stroke-width="4" fill="none" opacity=".45" stroke-linecap="round"/>` +
      `<ellipse cx="40" cy="34" rx="4.5" ry="9" fill="#fff" opacity=".8" transform="rotate(12 40 34)"/>` +
      `<path d="M19,73 C13,71 8,73 5,78 C9,80 12,82 13,85 C16,82 19,80 21,80 Z" fill="#f08a28" stroke="#a35408" stroke-width="2" stroke-linejoin="round"/>` +
      `<path d="M81,73 C87,71 92,73 95,78 C88,80 84,82 87,85 C84,82 81,80 79,80 Z" fill="#f08a28" stroke="#a35408" stroke-width="2" stroke-linejoin="round"/>` +
      `<path d="M21,70 L79,70 L82,81 C82,86 78,89 73,89 L27,89 C22,89 18,86 18,81 Z" fill="url(#${P}bs)" stroke="#8a5a08" stroke-width="3.5" stroke-linejoin="round"/>` +
      `<path d="M25,74 L75,74" stroke="#fff" stroke-width="2.5" opacity=".5" stroke-linecap="round"/>` +
      `<circle cx="50" cy="92" r="5.5" fill="#9a6510" stroke="#5a3808" stroke-width="2.5"/>`
    ),

    melon: () => svg('100 100',
      rg('mf', [[0, '#ff8a78'], [0.6, '#f0453f'], [1, '#cf2430']], 0.4, 0.32) +
      lg('mr', [[0, '#4d9c48'], [1, '#256e2c']]),
      `<path d="M10,42 A40,40 0 0 0 90,42 Z" fill="url(#${P}mr)" stroke="#1c5220" stroke-width="3.5" stroke-linejoin="round"/>` +
      `<path d="M15,42 A35,35 0 0 0 85,42 Z" fill="#e6f3c4"/>` +
      `<path d="M19,42 A31,31 0 0 0 81,42 Z" fill="url(#${P}mf)" stroke="#a31c28" stroke-width="2.5" stroke-linejoin="round"/>` +
      [[38, 56, -18, 4.6], [50, 63, 3, 5], [62, 56, 18, 4.6], [44, 48, -8, 4], [57, 47, 9, 4]]
        .map(s => `<ellipse cx="${s[0]}" cy="${s[1]}" rx="2.7" ry="${s[3] / 2}" fill="#2a1a1e" transform="rotate(${s[2]} ${s[0]} ${s[1]})"/>`).join('') +
      `<ellipse cx="32" cy="49" rx="7" ry="4.5" fill="#fff" opacity=".45" transform="rotate(-28 32 49)"/>`
    ),

    star: () => svg('100 100',
      rg('st', [[0, '#fff8b0'], [0.5, '#ffce1e'], [1, '#f08a06']], 0.38, 0.32),
      `<path d="${starPath(60, 37, 27, 11.5, -70)}" fill="#f5a812" stroke="#6e3c02" stroke-width="3.6" stroke-linejoin="round"/>` +
      `<path d="${starPath(44, 59, 30, 13, -98)}" fill="url(#${P}st)" stroke="#6e3c02" stroke-width="4.2" stroke-linejoin="round"/>` +
      `<path d="${starPath(44, 59, 21, 8.6, -98)}" fill="#fff" opacity=".32"/>` +
      `<path d="${starPath(44, 59, 30, 13, -98)}" fill="none" stroke="#fff2b0" stroke-width="1.2" opacity=".8" transform="translate(-1,-1.5)"/>` +
      spark4(64, 62, 0.55, 0.95)
    ),

    seven: () => {
      const one = (dx, dy) =>
        `<g transform="translate(${dx},${dy})">` +
        `<polygon points="24,29 84,29 88,37 52,95 36,95 66,43 24,43" fill="#ff9e28" stroke="#8a1015" stroke-width="3" stroke-linejoin="round"/>` +
        `<polygon points="18,22 78,22 82,30 46,88 30,88 60,36 18,36" fill="url(#${P}s7)" stroke="#8a1015" stroke-width="3" stroke-linejoin="round"/>` +
        `<path d="M23,27 L73,27" stroke="#ffc0a8" stroke-width="3.2" opacity=".75" stroke-linecap="round"/>` +
        `</g>`;
      return svg('100 100',
        lg('s7', [[0, '#ff7454'], [0.5, '#f02a24'], [1, '#c40e18']]),
        `<g transform="translate(50,50) scale(0.8) translate(-65,-58)">` + one(-6, 1) + one(30, -1) + `</g>` +
        spark4(24, 26, 0.55, 0.9) + spark4(79, 60, 0.4, 0.8)
      );
    },

    bar: () => svg('100 100',
      lg('bp', [[0, '#4c4c4c'], [0.5, '#1c1c1c'], [1, '#0a0a0a']]),
      `<rect x="9" y="17" width="82" height="66" rx="10" fill="url(#${P}bp)" stroke="#000" stroke-width="3"/>` +
      `<rect x="13.5" y="21.5" width="73" height="57" rx="7" fill="none" stroke="#565656" stroke-width="2"/>` +
      `<path d="M14,25 Q50,20 86,25 L86,42 Q50,35 14,42 Z" fill="#fff" opacity=".1"/>` +
      [39, 58, 77].map(y =>
        `<text x="50" y="${y}" font-family="${FONT}" font-weight="900" font-size="18.5" letter-spacing="1" text-anchor="middle" fill="#ffffff">BAR</text>`
      ).join('')
    )
  };

  /* ---------- LUCK 蛋 ---------- */
  const EGG = {
    orange: {
      bg: '#ef8c2c', ray1: '#f8b055', ray2: '#ffc678',
      grad: ['eo', [[0, '#fff8ee'], [0.55, '#f9dcc4'], [1, '#eaa081']]],
      stroke: '#b06a48', spot: '#eba08c', shade: '#d98a68', outline: '#d94f16', halo: '#fff3da'
    },
    blue: {
      bg: '#4fb394', ray1: '#3f86c2', ray2: '#74c6de',
      grad: ['eb', [[0, '#f4fcfe'], [0.55, '#d5e9f2'], [1, '#a2bbcf']]],
      stroke: '#4a6a8a', spot: '#8fb4d4', shade: '#7fa2bd', outline: '#1d5a9e', halo: '#eafaff'
    }
  };
  const EGG_D = 'M50,20 C62,20 73,37 73,57 C73,75 63,86 50,86 C37,86 27,75 27,57 C27,37 38,20 50,20 Z';

  function luckEgg(color) {
    const c = EGG[color] || EGG.orange;
    let rays = '';
    for (let i = 0; i < 6; i++) {
      const a = -90 + i * 60;
      rays += wedge(50, 54, 78, a, a + 30, c.ray1) + wedge(50, 54, 78, a + 30, a + 60, c.ray2);
    }
    const spots = [[42, 36, 6], [60, 48, 5], [38, 60, 5.5], [56, 72, 6], [48, 50, 4]]
      .map(s => `<circle cx="${s[0]}" cy="${s[1]}" r="${s[2]}" fill="${c.spot}" opacity=".8"/>`).join('');
    const txt = (extra) =>
      `<text x="50" y="76" transform="rotate(-8 50 66)" font-family="${FONT}" font-weight="900" font-size="30" letter-spacing="1" text-anchor="middle" ${extra}>LUCK</text>`;
    return svg('100 100',
      rg(c.grad[0], c.grad[1]) +
      lg('lg1', [[0, '#fff7a8'], [0.55, '#ffd83e'], [1, '#f5a81e']]) +
      `<clipPath id="${P}ec"><path d="${EGG_D}"/></clipPath>`,
      `<rect width="100" height="100" fill="${c.bg}"/>` + rays +
      `<circle cx="50" cy="54" r="31" fill="${c.halo}" opacity=".35"/>` +
      `<path d="${EGG_D}" fill="url(#${P}${c.grad[0]})" stroke="${c.stroke}" stroke-width="3"/>` +
      `<g clip-path="url(#${P}ec)">${spots}<ellipse cx="50" cy="88" rx="24" ry="9" fill="${c.shade}" opacity=".55"/></g>` +
      `<ellipse cx="38" cy="33" rx="6" ry="10" fill="#fff" opacity=".85" transform="rotate(-16 38 33)"/>` +
      txt(`fill="none" stroke="${c.halo}" stroke-width="10" stroke-linejoin="round"`) +
      txt(`fill="none" stroke="${c.outline}" stroke-width="5.5" stroke-linejoin="round"`) +
      txt(`fill="url(#${P}lg1)" stroke="${c.outline}" stroke-width="1.4" paint-order="stroke"`)
    );
  }

  /* ---------- 金币 ---------- */
  function coin() {
    let ticks = '';
    for (let i = 0; i < 14; i++) {
      const a = i * (360 / 14) * Math.PI / 180;
      ticks += `<line x1="${n(50 + 39.5 * Math.cos(a))}" y1="${n(50 + 39.5 * Math.sin(a))}" x2="${n(50 + 44 * Math.cos(a))}" y2="${n(50 + 44 * Math.sin(a))}" stroke="#b8820f" stroke-width="2" opacity=".7"/>`;
    }
    const t = (dx, dy, fill) =>
      `<text x="${50 + dx}" y="${61 + dy}" font-family="${FONT}" font-weight="900" font-size="27" letter-spacing="1" text-anchor="middle" fill="${fill}">FD</text>`;
    return svg('100 100',
      lg('c1', [[0, '#f8c93e'], [1, '#e29a14']]) +
      rg('c2', [[0, '#fff0a2'], [0.55, '#f8cb42'], [1, '#e9a516']], 0.36, 0.3),
      `<circle cx="50" cy="50" r="47" fill="url(#${P}c1)" stroke="#7a4e08" stroke-width="4"/>` +
      ticks +
      `<circle cx="50" cy="50" r="38" fill="url(#${P}c2)" stroke="#c88818" stroke-width="2.5"/>` +
      `<path d="M19,33 A37,37 0 0 1 47,13" stroke="#fff6c8" stroke-width="5" fill="none" stroke-linecap="round" opacity=".8"/>` +
      t(-1, -1.5, '#ffedb0') + t(0.8, 0.8, '#a87008') + t(0, 0, '#b87810')
    );
  }

  function jpCoin() {
    // 内芯放射光楔 (橙红交替)
    let rays = '';
    for (let i = 0; i < 12; i++) {
      const a = -90 + i * 30;
      rays += wedge(50, 51, 32, a, a + 15, i % 2 ? '#ffb434' : '#f4801c');
    }
    // 金环铆珠
    let beads = '';
    for (let i = 0; i < 18; i++) {
      const a = i * 20 * Math.PI / 180;
      beads += `<circle cx="${n(50 + 39.2 * Math.cos(a))}" cy="${n(50 + 39.2 * Math.sin(a))}" r="1.5" fill="#a86e08" opacity=".8"/>`;
    }
    const t = (dx, dy, fill, extra = '') =>
      `<text x="${50 + dx}" y="${64 + dy}" font-family="${FONT}" font-weight="900" font-size="31" letter-spacing="1" text-anchor="middle" stroke-linejoin="round" fill="${fill}" ${extra}>JP</text>`;
    return svg('100 100',
      rg('jg', [[0, '#ffedb0', 0.9], [0.55, '#ffcf56', 0.42], [1, '#ffcf56', 0]], 0.5, 0.5, 0.52) +
      lg('j1', [[0, '#fff0ae'], [0.3, '#f9ca4c'], [0.65, '#eda41e'], [1, '#b26e08']]) +
      lg('j3', [[0, '#d89414'], [1, '#f6c852']]) +
      rg('j2', [[0, '#fff3a2'], [0.42, '#ffc23a'], [0.78, '#f2781a'], [1, '#dd4c14']], 0.5, 0.46, 0.62) +
      lg('jt', [[0, '#e02818'], [0.5, '#c01512'], [1, '#8f0a0a']]),
      `<circle cx="50" cy="50" r="49" fill="url(#${P}jg)"/>` +
      `<circle cx="50" cy="50" r="43.5" fill="url(#${P}j1)" stroke="#6e4406" stroke-width="2.5"/>` +
      beads +
      `<circle cx="50" cy="50" r="35" fill="url(#${P}j3)" stroke="#8a5208" stroke-width="1.6"/>` +
      `<circle cx="50" cy="51" r="32" fill="url(#${P}j2)" stroke="#a3510a" stroke-width="2"/>` +
      rays +
      `<circle cx="50" cy="51" r="32" fill="none" stroke="#e05a12" stroke-width="1.3" opacity=".5"/>` +
      // 内芯底部暗弧 (体积感)
      `<path d="M26,66 A29,29 0 0 0 74,66" stroke="#c44a0e" stroke-width="4" fill="none" stroke-linecap="round" opacity=".45"/>` +
      // 红字 JP: 投影 → 金描边 → 红渐变主体
      t(1.6, 2.4, '#8e1208') +
      t(0, 0, 'none', `stroke="#ffe2a0" stroke-width="4"`) +
      t(0, 0, `url(#${P}jt)`, `stroke="#7a0c10" stroke-width="1.4" paint-order="stroke"`) +
      // 高光: 环弧 + 内芯弧 + 亮点
      `<path d="M15,38 A38,38 0 0 1 40,14" stroke="#fffbe2" stroke-width="4.5" fill="none" stroke-linecap="round" opacity=".95"/>` +
      `<path d="M24,40 A30,30 0 0 1 44,22" stroke="#fff8d8" stroke-width="3.5" fill="none" stroke-linecap="round" opacity=".9"/>` +
      `<circle cx="33" cy="30" r="2.5" fill="#fff" opacity=".85"/>`
    );
  }

  /* ---------- 中央场景 560×640 ---------- */
  function scene() {
    const d = [];
    // defs
    let defs =
      lg('sky', [[0, '#88448a'], [0.4, '#a76d9e'], [0.72, '#c49ab2'], [1, '#e2bdc9']]) +
      rg('jhalo', [[0, '#fff3d8', 0.55], [0.55, '#ffe9c4', 0.22], [1, '#ffe9c4', 0]], 0.5, 0.5, 0.5) +
      lg('ttl', [[0, '#e8452a'], [0.5, '#d01818'], [1, '#8f0f12']]) +
      lg('tgl', [[0, '#ffc93e'], [1, '#e89a12']]) +
      lg('hb1', [[0, '#b7d274'], [1, '#8bb050']]) +
      lg('mound', [[0, '#e3ec9e'], [1, '#9cba4c']]) +
      lg('hf1', [[0, '#8cc254'], [1, '#4e9134']]) +
      lg('sd', [[0, '#efca80'], [1, '#ca974f']]) +
      lg('cw', [[0, '#fbf5e2'], [0.6, '#f1e7cd'], [1, '#ddd0ae']]) +
      lg('cr', [[0, '#ffe27a'], [0.5, '#f4b32a'], [1, '#d8860e']]) +
      rg('dm', [[0, '#f06850'], [0.6, '#d93a28'], [1, '#ac1e16']], 0.4, 0.3) +
      lg('hood', [[0, '#f4684c'], [0.55, '#dc3026'], [1, '#a41216']]) +
      lg('cap', [[0, '#ee5540'], [1, '#b41820']]) +
      lg('hbd', [[0, '#fdfbf6'], [1, '#dcd8cc']]) +
      lg('ard', [[0, '#f4f2ec'], [1, '#c9c6bb']]) +
      lg('plm', [[0, '#ff5a3a'], [1, '#c81f1f']]) +
      lg('dbd', [[0, '#4aa2da'], [1, '#1f6fb0']]) +
      lg('dhd', [[0, '#4aa2da'], [1, '#2a80bc']]) +
      lg('dbly', [[0, '#eaf09c'], [1, '#b5ca48']]);

    const cloud = (x, y, s, op) =>
      `<g transform="translate(${x},${y}) scale(${s})" fill="#ffffff" opacity="${op}">` +
      `<ellipse cx="0" cy="0" rx="30" ry="17"/><ellipse cx="-26" cy="7" rx="20" ry="12"/>` +
      `<ellipse cx="27" cy="7" rx="23" ry="13"/><ellipse cx="2" cy="10" rx="34" ry="11"/></g>`;

    const pine = (x, y, H) => {
      const tri = (w, yT, yB) => `<path d="M${x},${n(yT)} L${n(x - w)},${n(yB)} L${n(x + w)},${n(yB)} Z" fill="#2c7a3e" stroke="#153f22" stroke-width="2" stroke-linejoin="round"/>`;
      const lite = (w, yT, yB) => `<path d="M${x},${n(yT)} L${n(x - w * 0.55)},${n(yB)} L${x},${n(yB)} Z" fill="#4a9a50" opacity=".85"/>`;
      const t1 = [0.36 * H, y - 0.62 * H, y - 0.16 * H], t2 = [0.30 * H, y - 0.86 * H, y - 0.44 * H], t3 = [0.22 * H, y - H, y - 0.62 * H];
      return `<rect x="${n(x - 0.05 * H)}" y="${n(y - 0.22 * H)}" width="${n(0.1 * H)}" height="${n(0.22 * H)}" fill="#6a4a2a"/>` +
        tri(...t1) + lite(...t1) + tri(...t2) + lite(...t2) + tri(...t3) + lite(...t3);
    };

    const tuft = (x, y) =>
      `<path d="M${x},${y} Q${x - 3},${y - 8} ${x - 7},${y - 13} M${x},${y} Q${x + 1},${y - 10} ${x - 1},${y - 16} M${x},${y} Q${x + 5},${y - 8} ${x + 9},${y - 12}" stroke="#3f7f28" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;

    const arch = (x, y, w, h, f = '#4a3a52') =>
      `<path d="M${x},${y + h} L${x},${y + w / 2} Q${x + w / 2},${y - w * 0.28} ${x + w},${y + w / 2} L${x + w},${y + h} Z" fill="${f}" stroke="#6a5848" stroke-width="1.4"/>`;

    // 城墙顶部: 压顶石 + 雉堞
    const merlons = (x, y, w, cnt) => {
      const mw = w / (cnt * 2 - 1);
      let s = `<rect x="${x}" y="${y}" width="${w}" height="${n(mw + 4)}" fill="url(#${P}cw)" stroke="#8a765a" stroke-width="1.8"/>`;
      for (let i = 0; i < cnt; i++)
        s += `<rect x="${n(x + i * 2 * mw)}" y="${n(y - mw - 1)}" width="${n(mw)}" height="${n(mw + 3)}" fill="url(#${P}cw)" stroke="#8a765a" stroke-width="1.6"/>`;
      return s;
    };

    // 砖缝纹理: 横缝 + 交错竖缝
    const bricks = (x, y, w, h) => {
      let s = '', row = 0;
      for (let ly = y + 13; ly < y + h - 3; ly += 13) {
        row++;
        s += `<line x1="${x + 2}" y1="${ly}" x2="${x + w - 2}" y2="${ly}" stroke="#c9b790" stroke-width="1.1" opacity=".5"/>`;
        for (let tx = x + (row % 2 ? 8 : 19); tx < x + w - 3; tx += 22)
          s += `<line x1="${tx}" y1="${ly - 13}" x2="${tx}" y2="${ly}" stroke="#c9b790" stroke-width="1" opacity=".42"/>`;
      }
      return s;
    };

    /* --- 标题: 弧形排列, 红渐变字母 + 金橙描边 --- */
    let title = '';
    {
      const word = 'FIERY DRAGON', R = 352, cx = 282, cy = 452, a0 = -31.2, st = 6.24;
      for (let i = 0; i < word.length; i++) {
        const ch = word[i];
        if (ch === ' ') continue;
        const a = a0 + st * i, rad = a * Math.PI / 180;
        const x = cx + R * Math.sin(rad), y = cy - R * Math.cos(rad);
        const base = `transform="translate(${n(x)},${n(y)}) rotate(${n(a)})" font-family="${FONT}" font-weight="900" font-size="45" text-anchor="middle" stroke-linejoin="round"`;
        title += `<text ${base} fill="none" stroke="#6e150c" stroke-width="14">${ch}</text>` +
          `<text ${base} fill="none" stroke="url(#${P}tgl)" stroke-width="9">${ch}</text>` +
          `<text ${base} fill="url(#${P}ttl)" stroke="#8e1810" stroke-width="1.3">${ch}</text>`;
      }
    }

    /* --- 天空 柔光(JP位留白) 云 星光 --- */
    d.push(`<rect width="560" height="640" fill="url(#${P}sky)"/>`);
    d.push(`<ellipse cx="262" cy="298" rx="122" ry="102" fill="url(#${P}jhalo)"/>`);
    d.push(cloud(80, 254, 1.05, 0.95), cloud(158, 214, 0.62, 0.8), cloud(300, 186, 0.5, 0.6),
      cloud(470, 236, 0.92, 0.92), cloud(534, 330, 0.66, 0.75), cloud(44, 330, 0.6, 0.7));
    // 右上星光十字闪
    d.push(`<path d="M378,138 L381.5,168 L411,172 L381.5,176 L378,206 L374.5,176 L345,172 L374.5,168 Z" fill="#fff" opacity=".95"/>` +
      `<path d="M378,152 L380,168 L396,172 L380,176 L378,192 L376,176 L360,172 L376,168 Z" fill="#fff" opacity=".55"/>`);
    d.push(spark4(410, 142, 0.5, 0.75), spark4(344, 198, 0.42, 0.6), spark4(430, 206, 0.38, 0.55),
      spark4(140, 220, 0.45, 0.55), spark4(320, 128, 0.35, 0.5));

    /* --- 城堡 (中偏右, 大体量精细) --- */
    d.push(
      // 左塔 红洋葱顶
      `<rect x="330" y="350" width="50" height="122" fill="url(#${P}cw)" stroke="#8a765a" stroke-width="2.5"/>` +
      `<rect x="371" y="353" width="8" height="117" fill="#d9c8a4" opacity=".55"/>` +
      bricks(330, 350, 50, 118) +
      arch(342, 378, 14, 22) + arch(342, 414, 14, 20) +
      `<path d="M324,350 C324,326 336,308 355,294 C374,308 386,326 386,350 Z" fill="url(#${P}dm)" stroke="#7a140e" stroke-width="2.5" stroke-linejoin="round"/>` +
      `<rect x="326" y="344" width="58" height="9" rx="3.5" fill="#a8281e" stroke="#7a140e" stroke-width="1.5"/>` +
      `<line x1="355" y1="294" x2="355" y2="280" stroke="#8a5a10" stroke-width="2.5"/><circle cx="355" cy="277" r="3.5" fill="#f8c84a" stroke="#8a5a10" stroke-width="1.5"/>` +
      // 连墙A + 雉堞 + 城门
      `<rect x="380" y="398" width="34" height="74" fill="url(#${P}cw)" stroke="#8a765a" stroke-width="2.2"/>` +
      bricks(380, 398, 34, 70) +
      merlons(380, 396, 34, 3) +
      `<path d="M383,436 L383,424 Q396,407 409,424 L409,436 Z" fill="#4a3a52" stroke="#6a5848" stroke-width="1.4"/>` +
      // 主楼 + 金色锥顶
      `<rect x="414" y="268" width="64" height="204" fill="url(#${P}cw)" stroke="#8a765a" stroke-width="2.5"/>` +
      `<rect x="468" y="272" width="9" height="198" fill="#d9c8a4" opacity=".55"/>` +
      bricks(414, 268, 64, 200) +
      arch(424, 288, 13, 20) + arch(452, 288, 13, 20) +
      arch(424, 326, 13, 20) + arch(452, 326, 13, 20) +
      arch(438, 368, 15, 24) +
      `<rect x="409" y="262" width="74" height="9" rx="2.5" fill="url(#${P}cw)" stroke="#8a765a" stroke-width="2"/>` +
      `<path d="M402,266 L490,266 L446,160 Z" fill="url(#${P}cr)" stroke="#8a5a10" stroke-width="2.5" stroke-linejoin="round"/>` +
      `<path d="M416,260 L446,174 L444,260 Z" fill="#fff" opacity=".3"/>` +
      `<line x1="446" y1="160" x2="446" y2="144" stroke="#8a5a10" stroke-width="3"/><circle cx="446" cy="140" r="4.5" fill="#f8c84a" stroke="#8a5a10" stroke-width="2"/>` +
      // 连墙B + 雉堞
      `<rect x="478" y="406" width="28" height="66" fill="url(#${P}cw)" stroke="#8a765a" stroke-width="2.2"/>` +
      bricks(478, 406, 28, 62) +
      merlons(478, 404, 28, 3) +
      // 右塔 红洋葱顶
      `<rect x="506" y="330" width="50" height="142" fill="url(#${P}cw)" stroke="#8a765a" stroke-width="2.5"/>` +
      `<rect x="546" y="334" width="8" height="136" fill="#d9c8a4" opacity=".55"/>` +
      bricks(506, 330, 50, 138) +
      arch(518, 358, 14, 22) + arch(518, 394, 14, 18) +
      `<path d="M500,330 C500,306 512,288 531,274 C550,288 562,306 562,330 Z" fill="url(#${P}dm)" stroke="#7a140e" stroke-width="2.5" stroke-linejoin="round"/>` +
      `<rect x="502" y="324" width="58" height="9" rx="3.5" fill="#a8281e" stroke="#7a140e" stroke-width="1.5"/>` +
      `<line x1="531" y1="274" x2="531" y2="260" stroke="#8a5a10" stroke-width="2.5"/><circle cx="531" cy="257" r="4" fill="#f8c84a" stroke="#8a5a10" stroke-width="1.5"/>`
    );

    /* --- 丘陵 与 松树 --- */
    d.push(`<path d="M0,432 C70,404 150,398 230,410 C290,419 330,430 390,434 C450,438 510,422 560,412 L560,640 L0,640 Z" fill="url(#${P}hb1)"/>`);
    d.push(pine(26, 452, 52), pine(58, 444, 64), pine(96, 456, 44));
    d.push(`<path d="M118,640 C136,520 178,442 262,418 C332,398 402,422 442,472 C468,506 478,570 470,640 Z" fill="url(#${P}mound)"/>`);
    d.push(pine(218, 494, 56), pine(252, 470, 80), pine(296, 454, 94), pine(342, 468, 82), pine(390, 488, 62));
    d.push(`<path d="M0,512 C80,488 170,482 260,494 C350,506 450,498 560,516 L560,640 L0,640 Z" fill="url(#${P}hf1)"/>`);

    /* --- 底部沙地 + 石头草丛 --- */
    d.push(`<path d="M0,564 C90,552 200,556 320,562 C420,567 500,560 560,566 L560,640 L0,640 Z" fill="url(#${P}sd)"/>`);
    d.push(`<path d="M0,564 C90,552 200,556 320,562 C420,567 500,560 560,566" stroke="#a5793c" stroke-width="3.5" fill="none" opacity=".75"/>`);
    d.push(
      `<path d="M96,612 C95,600 105,590 120,589 C135,588 143,596 144,606 L143,613 L97,613 Z" fill="#e3b878" stroke="#8a6634" stroke-width="2.5" stroke-linejoin="round"/>` +
      `<path d="M138,606 C140,598 148,593 156,595 C163,597 167,602 166,608 L165,611 L139,611 Z" fill="#d9ab68" stroke="#8a6634" stroke-width="2" stroke-linejoin="round"/>` +
      `<path d="M110,592 L106,610 M126,590 L124,610" stroke="#b98f52" stroke-width="1.5" opacity=".8"/>` +
      `<path d="M428,608 C429,598 437,592 447,592 C457,592 463,598 463,605 L462,609 L429,609 Z" fill="#e3b878" stroke="#8a6634" stroke-width="2.5" stroke-linejoin="round"/>` +
      `<ellipse cx="496" cy="607" rx="10" ry="6" fill="#d9ab68" stroke="#8a6634" stroke-width="2"/>` +
      `<ellipse cx="474" cy="611" rx="4.5" ry="3" fill="#c99a54" stroke="#8a6634" stroke-width="1.5"/>` +
      tuft(66, 592) + tuft(184, 602) + tuft(352, 588) + tuft(372, 618) + tuft(518, 600) + tuft(244, 620) +
      tuft(208, 566) + tuft(452, 566)
    );
    d.push(`<ellipse cx="158" cy="560" rx="86" ry="9" fill="#6a4a20" opacity=".25"/>`);
    d.push(`<ellipse cx="516" cy="632" rx="46" ry="8" fill="#6a4a20" opacity=".25"/>`);

    /* --- 蓝龙 (右下, 昂首, 金色火舌, 卷尾) --- */
    d.push(
      // 卷尾 (压在身体后, 伸向左侧沙地)
      limb([[478, 632], [446, 622], [428, 602]], 13, '#2f86c2', '#123f66') +
      limb([[428, 602], [432, 586], [444, 580]], 9, '#2f86c2', '#123f66') +
      `<circle cx="446" cy="579" r="5.5" fill="#2f86c2" stroke="#123f66" stroke-width="2"/>` +
      // 背鳍 (先画, 根部被颈部遮住)
      `<path d="M506,462 L532,440 L521,494 Z" fill="#1c5c96" stroke="#0f3557" stroke-width="2" stroke-linejoin="round"/>` +
      `<path d="M520,516 L546,496 L535,550 Z" fill="#1c5c96" stroke="#0f3557" stroke-width="2" stroke-linejoin="round"/>` +
      `<path d="M531,572 L556,554 L547,606 Z" fill="#1c5c96" stroke="#0f3557" stroke-width="2" stroke-linejoin="round"/>` +
      // 颈身
      `<path d="M452,452 C462,506 472,566 474,640 L540,640 C538,560 526,490 508,448 C496,420 468,424 452,452 Z" fill="url(#${P}dbd)" stroke="#123f66" stroke-width="3.5" stroke-linejoin="round"/>` +
      // 黄绿腹甲 + 横纹
      `<path d="M456,458 C466,508 474,566 476,640 L494,640 C492,566 484,506 472,456 C467,449 460,451 456,458 Z" fill="url(#${P}dbly)" stroke="#6e8a1c" stroke-width="2"/>` +
      `<path d="M461,500 l15,-3 M465,536 l15,-3 M469,572 l15,-3 M472,606 l15,-3" stroke="#93ad2c" stroke-width="2.5" fill="none" stroke-linecap="round"/>` +
      // 红鞍带 + 金扣
      `<path d="M476,588 C492,578 512,576 530,582" stroke="#c82832" stroke-width="9" fill="none" stroke-linecap="round"/>` +
      `<circle cx="504" cy="580" r="4.5" fill="#f0b030" stroke="#8a5f10" stroke-width="2"/>` +
      // 手持长杆 (杆梢红缨)
      limb([[490, 566], [472, 554], [458, 546]], 8, '#3f92cc', '#123f66') +
      `<line x1="460" y1="548" x2="404" y2="482" stroke="#6a4c24" stroke-width="7" stroke-linecap="round"/>` +
      `<line x1="460" y1="548" x2="404" y2="482" stroke="#b08a52" stroke-width="3.5" stroke-linecap="round"/>` +
      `<path d="M405,483 C397,473 389,469 381,469 M405,483 C399,477 391,475 383,477 M405,483 C403,475 399,469 393,463" stroke="#c82832" stroke-width="3.5" fill="none" stroke-linecap="round"/>` +
      `<circle cx="456" cy="545" r="5" fill="#3f92cc" stroke="#123f66" stroke-width="2"/>`
    );
    // 龙头 (朝左张口, 金色火舌伸向前方)
    d.push(`<g transform="translate(456,430) rotate(-12)">` +
      // 头顶背鳍 + 后颈鬃
      `<path d="M6,-24 L16,-44 L26,-26 L36,-40 L44,-22 L30,-14 L12,-16 Z" fill="#1c5c96" stroke="#0f3557" stroke-width="2" stroke-linejoin="round"/>` +
      `<path d="M22,-14 C34,-34 56,-42 70,-36 C58,-30 50,-22 46,-8 C38,-14 28,-16 22,-14 Z" fill="#1c5c96" stroke="#0f3557" stroke-width="2.5" stroke-linejoin="round"/>` +
      // 头骨上颚
      `<path d="M46,-12 C36,-26 8,-30 -20,-20 C-48,-10 -68,0 -74,7 L-74,10 C-50,10 -20,14 4,20 L30,24 C46,16 52,0 46,-12 Z" fill="url(#${P}dhd)" stroke="#123f66" stroke-width="3.5" stroke-linejoin="round"/>` +
      // 口腔 + 下颚
      `<path d="M-56,12 L38,12 L-6,42 Z" fill="#8e1420"/>` +
      `<path d="M-54,14 C-46,32 -24,46 2,48 C20,49 34,42 39,28 C40,22 39,16 38,12 L-56,12 Z" fill="#2f86c2" stroke="#123f66" stroke-width="3" stroke-linejoin="round"/>` +
      // 牙齿
      `<path d="M-48,12 l5,9 l5,-9 Z M-32,12 l5,9 l5,-9 Z M-16,12 l5,9 l5,-9 Z M0,13 l5,9 l5,-9 Z" fill="#ffffff" stroke="#8a8a92" stroke-width="1"/>` +
      `<path d="M-42,14 l5,-8 l5,8 Z M-26,14 l5,-8 l5,8 Z M-10,14 l5,-8 l5,8 Z" fill="#ffffff" stroke="#8a8a92" stroke-width="1"/>` +
      // 金色火舌 (伸向前方)
      `<path d="M-46,8 C-66,-4 -88,-2 -108,8 L-128,0 L-116,12 L-130,24 L-110,20 C-88,28 -62,26 -46,20 Z" fill="#f28c14" stroke="#cc5a0a" stroke-width="1.6" stroke-linejoin="round"/>` +
      `<path d="M-46,13 C-62,7 -82,9 -100,16 C-88,22 -74,23 -60,23 C-52,22 -47,19 -46,18 Z" fill="#ffd23e"/>` +
      `<circle cx="-98" cy="16" r="3.5" fill="#fff2a0"/>` +
      // 鼻孔 眉 眼
      `<circle cx="-58" cy="2" r="2.2" fill="#123f66"/>` +
      `<path d="M-2,-16 L14,-12" stroke="#123f66" stroke-width="3" stroke-linecap="round"/>` +
      `<circle cx="6" cy="-7" r="7.5" fill="#ffffff" stroke="#123f66" stroke-width="2.5"/>` +
      `<circle cx="4" cy="-6" r="3.4" fill="#123f66"/><circle cx="5.4" cy="-7.6" r="1.2" fill="#ffffff"/>` +
      `</g>`);

    /* --- 白马骑士 (左, 红头罩, 扬蹄冲锋, 持长枪白旗) --- */
    d.push(
      // 马尾
      `<path d="M118,452 C94,464 76,490 78,524 C88,514 94,518 92,532 C104,518 112,508 118,494 L124,456 Z" fill="#d9d5c9" stroke="#3a3540" stroke-width="3" stroke-linejoin="round"/>` +
      // 远侧腿 (后腿撑地, 前腿腾空)
      limb([[140, 470], [112, 516], [92, 548]], 11, '#d8d5cb', '#3a3540') + hoof(90, 550, 18, '#3f363c') +
      limb([[198, 440], [224, 424], [236, 430]], 9.5, '#d8d5cb', '#3a3540') + hoof(238, 431, -40, '#3f363c') +
      // 躯干 (扬起)
      `<path d="M96,492 C92,466 106,444 134,432 C162,420 194,416 214,424 C230,430 238,444 234,458 C230,472 214,484 190,490 C158,498 118,502 96,492 Z" fill="url(#${P}hbd)" stroke="#3a3540" stroke-width="3.5" stroke-linejoin="round"/>` +
      `<path d="M108,486 C112,468 124,454 142,448 C132,460 126,472 126,488 C118,488 112,487 108,486 Z" fill="#dcd9cf" opacity=".7"/>` +
      // 近侧后腿
      limb([[158, 478], [150, 524], [134, 556]], 12, '#f6f4ee', '#3a3540') + hoof(132, 558, 8) +
      // 红鞍 (金边, 骑士臀位正下)
      `<path d="M130,434 C146,424 172,420 190,428 C198,436 200,448 196,458 C182,468 154,470 140,462 C130,452 128,442 130,434 Z" fill="url(#${P}cap)" stroke="#6e0e12" stroke-width="2.5" stroke-linejoin="round"/>` +
      `<path d="M136,458 C150,466 176,468 192,460" stroke="#f2b428" stroke-width="2.5" fill="none" stroke-linecap="round"/>` +
      // 红头罩颈 (自胸背上扬)
      `<path d="M176,452 C178,424 180,398 190,374 L220,398 C208,412 200,432 196,454 C184,466 174,464 176,452 Z" fill="url(#${P}hood)" stroke="#6e1210" stroke-width="3.5" stroke-linejoin="round"/>` +
      // 红罩马头 (双耳 眼 鼻 嘴)
      `<path d="M178,334 L184,314 L196,332 Z" fill="url(#${P}hood)" stroke="#6e1210" stroke-width="2.5" stroke-linejoin="round"/>` +
      `<path d="M192,328 L202,312 L210,334 Z" fill="url(#${P}hood)" stroke="#6e1210" stroke-width="2.5" stroke-linejoin="round"/>` +
      `<path d="M172,340 C178,328 192,322 204,326 C216,330 228,340 234,352 C238,360 239,368 236,376 C232,386 220,392 206,390 C192,388 178,380 172,366 C169,357 169,348 172,340 Z" fill="url(#${P}hood)" stroke="#6e1210" stroke-width="3" stroke-linejoin="round"/>` +
      `<circle cx="210" cy="354" r="3" fill="#2a1a1e"/><circle cx="211" cy="353" r="1" fill="#fff"/>` +
      `<circle cx="232" cy="368" r="2" fill="#7a1410"/>` +
      `<path d="M236,376 C230,382 222,384 214,383" stroke="#8e1a12" stroke-width="2" fill="none" stroke-linecap="round"/>` +
      `<path d="M196,386 C206,376 216,366 222,352" stroke="#a02018" stroke-width="2" fill="none" opacity=".55"/>` +
      // 缰绳
      `<path d="M198,388 C190,406 184,420 180,436" stroke="#7a0e14" stroke-width="2.5" fill="none"/>` +
      // 近侧前腿 (腾空, 画在颈前)
      limb([[206, 450], [240, 440], [256, 456]], 11, '#f6f4ee', '#3a3540') + hoof(258, 458, -25) +
      // 骑手: 跨坐鞍上, 一腿贴马身侧
      limb([[150, 412], [184, 422], [178, 452]], 9, '#e8e6de', '#3a3540') + hoof(180, 456, 75, '#4a3f45') +
      `<path d="M124,371 C124,355 134,346 147,346 C160,346 170,355 170,371 L167,400 C164,414 152,420 142,420 C133,420 127,414 127,406 Z" fill="url(#${P}ard)" stroke="#3a3540" stroke-width="3" stroke-linejoin="round"/>` +
      `<path d="M142,349 L141,414 M154,349 L155,414" stroke="#a8a496" stroke-width="1.8"/>` +
      `<circle cx="126" cy="370" r="8" fill="#e6e3da" stroke="#3a3540" stroke-width="2.5"/>` +
      `<circle cx="168" cy="370" r="8" fill="#e6e3da" stroke="#3a3540" stroke-width="2.5"/>` +
      limb([[128, 374], [110, 354], [96, 334]], 9, '#e8e6de', '#3a3540') +
      // 盔 + 领甲 + 红缨
      `<path d="M126,316 C126,300 134,290 147,290 C160,290 168,300 168,316 L166,324 L128,324 Z" fill="url(#${P}ard)" stroke="#3a3540" stroke-width="3" stroke-linejoin="round"/>` +
      `<rect x="137" y="322" width="20" height="26" rx="4" fill="url(#${P}ard)" stroke="#3a3540" stroke-width="2.5"/>` +
      `<path d="M147,290 L147,283" stroke="#3a3540" stroke-width="2.5" stroke-linecap="round"/>` +
      `<path d="M144,294 C146,268 160,246 186,234 C178,252 176,272 182,292 C170,286 154,288 144,294 Z" fill="url(#${P}plm)" stroke="#7a0e14" stroke-width="2.5" stroke-linejoin="round"/>` +
      `<path d="M148,290 C154,270 164,254 178,242" stroke="#8a1a12" stroke-width="2" fill="none" opacity=".6"/>` +
      `<rect x="131" y="306" width="28" height="8" rx="4" fill="#2a2430"/>` +
      `<circle cx="139" cy="310" r="2.6" fill="#ff3b2e"/><circle cx="152" cy="310" r="2.6" fill="#ff3b2e"/>`
    );
    // 长枪 + 白旗 (持于手中)
    d.push(`<g transform="translate(94,332) rotate(-118)">` +
      `<path d="M40,-4 L102,-4 L102,-27 L86,-16 L70,-27 L70,-4 Z" fill="#f9f6ec" stroke="#3a3540" stroke-width="2.5" stroke-linejoin="round"/>` +
      `<line x1="12" y1="0" x2="140" y2="0" stroke="#6a6a74" stroke-width="9" stroke-linecap="round"/>` +
      `<line x1="12" y1="0" x2="140" y2="0" stroke="#eceff4" stroke-width="4.5" stroke-linecap="round"/>` +
      `<path d="M138,-5.5 L160,0 L138,5.5 Z" fill="#c9ccd4" stroke="#3a3540" stroke-width="2" stroke-linejoin="round"/>` +
      `<rect x="20" y="-4.5" width="8" height="9" rx="2" fill="#c82832" stroke="#6e0e12" stroke-width="1.5"/>` +
      `</g>` +
      `<circle cx="94" cy="332" r="6.5" fill="#d6d3ca" stroke="#3a3540" stroke-width="2.5"/>`);

    /* --- 标题压顶 --- */
    d.push(title);

    return svg('560 640', defs, d.join('\n'));
  }

  return { symbol, luckEgg, coin, jpCoin, scene };

  function symbol(key) {
    const f = SYM[key];
    if (!f) throw new Error('unknown symbol: ' + key);
    return f();
  }
})();
