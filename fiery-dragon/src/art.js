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
      rg('st', [[0, '#fff3a0'], [0.55, '#ffd23e'], [1, '#f09f16']], 0.38, 0.32),
      `<path d="${starPath(60, 37, 27, 11.5, -70)}" fill="#f2b32a" stroke="#9a5e08" stroke-width="3" stroke-linejoin="round"/>` +
      `<path d="${starPath(44, 59, 30, 13, -98)}" fill="url(#${P}st)" stroke="#9a5e08" stroke-width="3.5" stroke-linejoin="round"/>` +
      `<path d="${starPath(44, 59, 22, 9, -98)}" fill="#fff" opacity=".28"/>` +
      spark4(64, 62, 0.5, 0.85)
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
    let ticks = '';
    for (let i = 0; i < 20; i++) {
      const a = i * 18 * Math.PI / 180;
      ticks += `<line x1="${n(50 + 36 * Math.cos(a))}" y1="${n(50 + 36 * Math.sin(a))}" x2="${n(50 + 41 * Math.cos(a))}" y2="${n(50 + 41 * Math.sin(a))}" stroke="#c8820f" stroke-width="2" opacity=".65"/>`;
    }
    const t = (dx, dy, fill) =>
      `<text x="${50 + dx}" y="${63 + dy}" font-family="${FONT}" font-weight="900" font-size="30" letter-spacing="1" text-anchor="middle" fill="${fill}">JP</text>`;
    return svg('100 100',
      rg('jg', [[0, '#ffd870', 0.9], [0.72, '#ffbe48', 0.5], [1, '#ffbe48', 0]], 0.5, 0.5, 0.5) +
      lg('j1', [[0, '#f8d05a'], [1, '#e89a1c']]) +
      rg('j2', [[0, '#fff6c0'], [0.55, '#ffd44e'], [1, '#f2a828']], 0.4, 0.32),
      `<circle cx="50" cy="50" r="49" fill="url(#${P}jg)"/>` +
      `<circle cx="50" cy="50" r="44" fill="url(#${P}j1)" stroke="#a35e0c" stroke-width="3.5"/>` +
      ticks +
      `<circle cx="50" cy="50" r="35" fill="url(#${P}j2)" stroke="#d88f1c" stroke-width="3"/>` +
      `<path d="M22,32 A33,33 0 0 1 46,18" stroke="#fff8d0" stroke-width="4.5" fill="none" stroke-linecap="round" opacity=".85"/>` +
      `<ellipse cx="50" cy="56" rx="25" ry="15" fill="#fff2a0" opacity=".8"/>` +
      t(1.2, 1.5, '#8a5208') + t(0, 0, '#7c4a06')
    );
  }

  /* ---------- 中央场景 560×640 ---------- */
  function scene() {
    const d = [];
    // defs
    let defs =
      lg('sky', [[0, '#8f5f96'], [0.45, '#b287a5'], [1, '#cbb4bc']]) +
      lg('tg', [[0, '#fff7a0'], [0.55, '#ffd23e'], [1, '#f5a01a']]) +
      lg('cw', [[0, '#f7f0dc'], [1, '#e6d9bc']]) +
      lg('cr', [[0, '#ffd96a'], [0.5, '#f2ab28'], [1, '#dd8c12']]) +
      rg('dm', [[0, '#f06850'], [0.6, '#d93a28'], [1, '#b02018']], 0.4, 0.3) +
      lg('hb1', [[0, '#b9d478'], [1, '#93bd52']]) +
      lg('hf1', [[0, '#8fc455'], [1, '#5f9a3a']]) +
      lg('sd', [[0, '#ecc77e'], [1, '#cf9d58']]) +
      lg('hbd', [[0, '#fcfaf4'], [1, '#ddd9ce']]) +
      lg('ard', [[0, '#f4f2ec'], [1, '#c9c6bb']]) +
      lg('cap', [[0, '#ee5540'], [1, '#b81820']]) +
      lg('plm', [[0, '#ff5a3a'], [1, '#c81f1f']]) +
      lg('dbd', [[0, '#4aa2da'], [1, '#1f6fb0']]) +
      lg('dhd', [[0, '#4aa2da'], [1, '#2a80bc']]);

    const cloud = (x, y, s, op) =>
      `<g transform="translate(${x},${y}) scale(${s})" fill="#ffffff" opacity="${op}">` +
      `<ellipse cx="0" cy="0" rx="30" ry="17"/><ellipse cx="-26" cy="7" rx="20" ry="12"/>` +
      `<ellipse cx="27" cy="7" rx="23" ry="13"/><ellipse cx="2" cy="10" rx="34" ry="11"/></g>`;

    const pine = (x, y, H) => {
      const tri = (w, yT, yB) => `<path d="M${x},${n(yT)} L${n(x - w)},${n(yB)} L${n(x + w)},${n(yB)} Z" fill="#2f8040" stroke="#1c5528" stroke-width="2" stroke-linejoin="round"/>`;
      const lite = (w, yT, yB) => `<path d="M${x},${n(yT)} L${n(x - w * 0.55)},${n(yB)} L${x},${n(yB)} Z" fill="#4d9c50" opacity=".85"/>`;
      const t1 = [0.36 * H, y - 0.62 * H, y - 0.16 * H], t2 = [0.30 * H, y - 0.86 * H, y - 0.44 * H], t3 = [0.22 * H, y - H, y - 0.62 * H];
      return `<rect x="${n(x - 0.05 * H)}" y="${n(y - 0.22 * H)}" width="${n(0.1 * H)}" height="${n(0.22 * H)}" fill="#6a4a2a"/>` +
        tri(...t1) + lite(...t1) + tri(...t2) + lite(...t2) + tri(...t3) + lite(...t3);
    };

    const tuft = (x, y) =>
      `<path d="M${x},${y} Q${x - 3},${y - 8} ${x - 7},${y - 13} M${x},${y} Q${x + 1},${y - 10} ${x - 1},${y - 16} M${x},${y} Q${x + 5},${y - 8} ${x + 9},${y - 12}" stroke="#4a8a30" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;

    const arch = (x, y, w, h, f = '#4a3a52') =>
      `<path d="M${x},${y + h} L${x},${y + w / 2} Q${x + w / 2},${y - w * 0.28} ${x + w},${y + w / 2} L${x + w},${y + h} Z" fill="${f}"/>`;

    /* --- 标题: 沿弧线排列的立体字母 --- */
    let title = '';
    {
      const word = 'FIERY DRAGON', R = 352, cx = 282, cy = 452, a0 = -31.2, st = 6.24;
      for (let i = 0; i < word.length; i++) {
        const ch = word[i];
        if (ch === ' ') continue;
        const a = a0 + st * i, rad = a * Math.PI / 180;
        const x = cx + R * Math.sin(rad), y = cy - R * Math.cos(rad);
        const tf = `transform="translate(${n(x)},${n(y)}) rotate(${n(a)})"`;
        const base = `${tf} font-family="${FONT}" font-weight="900" font-size="44" text-anchor="middle" stroke-linejoin="round"`;
        title += `<text ${base} fill="none" stroke="#8a2012" stroke-width="11">${ch}</text>` +
          `<text ${base} fill="url(#${P}tg)" stroke="#f06a2a" stroke-width="5" paint-order="stroke">${ch}</text>`;
      }
    }

    /* --- 天空 云 星光 --- */
    d.push(`<rect width="560" height="640" fill="url(#${P}sky)"/>`);
    d.push(cloud(86, 258, 1, 0.95), cloud(210, 218, 0.7, 0.8), cloud(470, 228, 0.9, 0.9), cloud(318, 180, 0.45, 0.55));
    d.push(spark4(452, 198, 1.2, 0.95), spark4(436, 224, 0.55, 0.7), spark4(468, 174, 0.5, 0.6), spark4(140, 218, 0.45, 0.5));

    /* --- 城堡 (右上) --- */
    d.push(
      // 后方矮墙+雉堞
      `<rect x="338" y="452" width="206" height="26" fill="url(#${P}cw)" stroke="#7a6850" stroke-width="2"/>` +
      [346, 374, 402, 458, 486, 514].map(x => `<rect x="${x}" y="442" width="14" height="12" fill="url(#${P}cw)" stroke="#7a6850" stroke-width="2"/>`).join('') +
      // 中央主楼 + 金色锥顶
      `<rect x="396" y="298" width="62" height="160" fill="url(#${P}cw)" stroke="#7a6850" stroke-width="2.5"/>` +
      `<rect x="444" y="300" width="12" height="156" fill="#d9c8a4" opacity=".7"/>` +
      `<polygon points="386,298 468,298 427,196" fill="url(#${P}cr)" stroke="#8a5a10" stroke-width="2.5" stroke-linejoin="round"/>` +
      `<line x1="427" y1="196" x2="427" y2="184" stroke="#8a5a10" stroke-width="3"/><circle cx="427" cy="181" r="4.5" fill="#f8c84a" stroke="#8a5a10" stroke-width="2"/>` +
      arch(406, 318, 12, 18) + arch(434, 318, 12, 18) + arch(406, 352, 12, 18) + arch(434, 352, 12, 18) + arch(420, 392, 12, 20) +
      // 左塔 红洋葱顶
      `<rect x="346" y="368" width="42" height="100" fill="url(#${P}cw)" stroke="#7a6850" stroke-width="2.5"/>` +
      `<rect x="377" y="370" width="9" height="96" fill="#d9c8a4" opacity=".7"/>` +
      `<path d="M344,368 C344,346 352,332 367,318 C382,332 390,346 390,368 Z" fill="url(#${P}dm)" stroke="#7a140e" stroke-width="2.5" stroke-linejoin="round"/>` +
      `<line x1="367" y1="318" x2="367" y2="306" stroke="#8a5a10" stroke-width="2.5"/><circle cx="367" cy="303" r="3.5" fill="#f8c84a" stroke="#8a5a10" stroke-width="1.5"/>` +
      arch(359, 396, 14, 20) + arch(359, 430, 14, 20) +
      // 右塔 红洋葱顶
      `<rect x="470" y="356" width="46" height="110" fill="url(#${P}cw)" stroke="#7a6850" stroke-width="2.5"/>` +
      `<rect x="504" y="358" width="10" height="106" fill="#d9c8a4" opacity=".7"/>` +
      `<path d="M468,356 C468,332 477,318 493,302 C509,318 518,332 518,356 Z" fill="url(#${P}dm)" stroke="#7a140e" stroke-width="2.5" stroke-linejoin="round"/>` +
      `<line x1="493" y1="302" x2="493" y2="289" stroke="#8a5a10" stroke-width="2.5"/><circle cx="493" cy="286" r="4" fill="#f8c84a" stroke="#8a5a10" stroke-width="1.5"/>` +
      arch(482, 384, 14, 20) + arch(482, 418, 14, 20) +
      // 最右小塔
      `<rect x="524" y="396" width="36" height="72" fill="url(#${P}cw)" stroke="#7a6850" stroke-width="2.5"/>` +
      `<path d="M522,396 C522,380 528,370 542,360 C556,370 562,380 562,396 Z" fill="url(#${P}dm)" stroke="#7a140e" stroke-width="2.5" stroke-linejoin="round"/>` +
      arch(536, 416, 12, 16)
    );

    /* --- 丘陵 与 松树 --- */
    d.push(`<path d="M0,462 C90,428 180,438 260,458 C340,478 460,456 560,470 L560,640 L0,640 Z" fill="url(#${P}hb1)"/>`);
    d.push(pine(334, 474, 52), pine(372, 464, 68), pine(408, 476, 46), pine(300, 480, 38));
    d.push(`<path d="M0,520 C100,488 200,500 300,512 C400,524 480,506 560,520 L560,640 L0,640 Z" fill="url(#${P}hf1)"/>`);
    d.push(pine(62, 518, 42), pine(110, 510, 54), pine(252, 522, 32));

    /* --- 底部沙地 + 石头草丛 --- */
    d.push(`<path d="M0,566 C110,550 240,556 360,564 C450,570 520,562 560,566 L560,640 L0,640 Z" fill="url(#${P}sd)"/>`);
    d.push(`<path d="M0,566 C110,550 240,556 360,564 C450,570 520,562 560,566" stroke="#a5793c" stroke-width="3.5" fill="none" opacity=".8"/>`);
    d.push(
      `<path d="M134,606 C134,596 142,590 152,590 C162,590 168,596 168,604 L166,608 L136,608 Z" fill="#dcb271" stroke="#8a6634" stroke-width="2.5" stroke-linejoin="round"/>` +
      `<path d="M146,591 L142,607" stroke="#b98f52" stroke-width="1.5"/>` +
      `<path d="M420,602 C421,594 428,590 436,590 C444,590 449,595 449,601 L448,604 L421,604 Z" fill="#dcb271" stroke="#8a6634" stroke-width="2.5" stroke-linejoin="round"/>` +
      `<ellipse cx="476" cy="604" rx="9" ry="5.5" fill="#d4a965" stroke="#8a6634" stroke-width="2"/>` +
      tuft(112, 586) + tuft(298, 594) + tuft(368, 588) + tuft(508, 598)
    );
    d.push(`<ellipse cx="152" cy="566" rx="88" ry="11" fill="#7a5a2c" opacity=".28"/>`);
    d.push(`<ellipse cx="512" cy="628" rx="46" ry="9" fill="#7a5a2c" opacity=".28"/>`);

    /* --- 蓝龙 (右下, 昂首喷火) --- */
    d.push(
      // 颈身
      `<path d="M470,640 C476,592 486,552 502,516 C512,494 522,480 534,473 C544,468 554,468 560,472 L560,640 Z" fill="url(#${P}dbd)" stroke="#123f66" stroke-width="3.5" stroke-linejoin="round"/>` +
      // 腹甲
      `<path d="M486,640 C492,596 502,558 518,526" stroke="#f2df9e" stroke-width="13" fill="none" stroke-linecap="round"/>` +
      `<path d="M484,618 l15,-4 M490,592 l14,-6 M500,566 l13,-8 M512,544 l12,-9 M526,524 l11,-9" stroke="#cfa852" stroke-width="2.5" fill="none" stroke-linecap="round"/>` +
      // 红鞍带
      `<path d="M496,638 C506,612 520,596 544,588" stroke="#c82832" stroke-width="9" fill="none" stroke-linecap="round"/>` +
      `<circle cx="524" cy="600" r="4.5" fill="#f0b030" stroke="#8a5f10" stroke-width="2"/>` +
      // 手持金环长杆 (挑火)
      limb([[520, 570], [498, 554], [482, 544]], 9, '#3f92cc', '#123f66') +
      `<line x1="488" y1="554" x2="410" y2="482" stroke="#6a4c24" stroke-width="8" stroke-linecap="round"/>` +
      `<line x1="488" y1="554" x2="410" y2="482" stroke="#b08850" stroke-width="4.5" stroke-linecap="round"/>` +
      `<circle cx="406" cy="479" r="9" fill="none" stroke="#8a5f12" stroke-width="8"/>` +
      `<circle cx="406" cy="479" r="9" fill="none" stroke="#f2b428" stroke-width="4.5"/>` +
      `<circle cx="480" cy="543" r="6" fill="#3f92cc" stroke="#123f66" stroke-width="2"/>`
    );
    // 龙头 (朝左张口)
    d.push(`<g transform="translate(468,468) rotate(-10)">` +
      `<path d="M22,-14 C34,-34 56,-42 70,-36 C58,-30 50,-22 46,-8 C38,-14 28,-16 22,-14 Z" fill="#1c5c96" stroke="#0f3557" stroke-width="2.5" stroke-linejoin="round"/>` +
      `<path d="M46,-12 C36,-26 8,-30 -20,-20 C-48,-10 -68,0 -74,7 L-74,10 C-50,10 -20,14 4,20 L30,24 C46,16 52,0 46,-12 Z" fill="url(#${P}dhd)" stroke="#123f66" stroke-width="3.5" stroke-linejoin="round"/>` +
      `<path d="M-16,22 C-38,22 -56,27 -64,35 C-60,43 -40,47 -16,45 C-4,43 2,35 0,27 Z" fill="#2f86c2" stroke="#123f66" stroke-width="3" stroke-linejoin="round"/>` +
      `<path d="M-70,8 L-14,17 L-58,33 C-66,27 -71,17 -70,8 Z" fill="#b02034"/>` +
      `<path d="M-64,10 l6,9 l6,-8 Z M-48,12 l6,9 l6,-8 Z M-32,14 l6,8 l6,-7 Z" fill="#ffffff" stroke="#8a8a92" stroke-width="1"/>` +
      `<path d="M-54,29 l5,-8 l5,7 Z M-39,31 l5,-8 l5,7 Z" fill="#ffffff" stroke="#8a8a92" stroke-width="1"/>` +
      `<path d="M-22,24 C-38,21 -52,24 -60,30 C-52,35 -36,34 -22,29 C-20,27 -20,25 -22,24 Z" fill="#ff6a55" stroke="#b02a30" stroke-width="2"/>` +
      `<circle cx="-58" cy="2" r="2.2" fill="#123f66"/>` +
      `<path d="M-2,-16 L14,-12" stroke="#123f66" stroke-width="3" stroke-linecap="round"/>` +
      `<circle cx="6" cy="-7" r="7.5" fill="#ffffff" stroke="#123f66" stroke-width="2.5"/>` +
      `<circle cx="4" cy="-6" r="3.4" fill="#123f66"/><circle cx="5.4" cy="-7.6" r="1.2" fill="#ffffff"/>` +
      // 火焰
      `<path d="M-78,2 L-104,-8 L-88,2 L-106,12 L-88,10 L-96,24 L-78,12 Z" fill="#ff8a1e" stroke="#cc5a0a" stroke-width="2" stroke-linejoin="round"/>` +
      `<path d="M-80,4 L-98,0 L-88,4 L-98,12 L-86,10 L-90,18 L-78,10 Z" fill="#ffd23e"/>` +
      `<circle cx="-84" cy="8" r="4" fill="#fff2a0"/>` +
      `</g>`);

    /* --- 白马骑士 (左, 持枪冲锋) --- */
    d.push(
      // 马尾
      `<path d="M96,446 C70,462 50,492 52,528 C62,518 68,522 66,536 C78,522 86,514 92,500 L98,456 Z" fill="#8a8a94" stroke="#3a3540" stroke-width="3" stroke-linejoin="round"/>` +
      // 远侧腿
      limb([[118, 478], [98, 518], [80, 550]], 11, '#d8d5cb', '#3a3540') + hoof(78, 552, 28, '#3f363c') +
      limb([[194, 458], [224, 432], [238, 406]], 10, '#d8d5cb', '#3a3540') + hoof(240, 402, -30, '#3f363c') +
      // 躯干
      `<path d="M94,450 C100,428 138,416 172,422 C198,427 216,440 218,458 C220,476 206,492 180,496 C148,501 110,496 98,480 C92,470 91,460 94,450 Z" fill="url(#${P}hbd)" stroke="#3a3540" stroke-width="3.5" stroke-linejoin="round"/>` +
      `<path d="M100,448 C104,436 116,430 128,430 C120,442 116,458 118,474 C108,470 100,462 100,448 Z" fill="#dcd9cf" opacity=".7"/>` +
      // 近侧腿
      limb([[130, 486], [120, 526], [102, 558]], 12, '#f6f4ee', '#3a3540') + hoof(102, 560, 24) +
      limb([[202, 466], [238, 452], [258, 470]], 11, '#f6f4ee', '#3a3540') + hoof(260, 472, 35) +
      // 颈 + 鬃毛 + 头
      `<circle cx="221" cy="401" r="11" fill="#a8402a" stroke="#6a2012" stroke-width="2.5"/>` +
      `<circle cx="205" cy="417" r="11" fill="#a8402a" stroke="#6a2012" stroke-width="2.5"/>` +
      `<circle cx="189" cy="433" r="11" fill="#a8402a" stroke="#6a2012" stroke-width="2.5"/>` +
      `<path d="M176,444 C194,432 212,418 226,398 L254,412 C242,434 224,450 202,460 Z" fill="url(#${P}hbd)" stroke="#3a3540" stroke-width="3.5" stroke-linejoin="round"/>` +
      `<path d="M238,392 L242,372 L253,386 Z" fill="url(#${P}hbd)" stroke="#3a3540" stroke-width="2.5" stroke-linejoin="round"/>` +
      `<path d="M232,394 C240,382 256,378 268,386 C278,393 286,408 288,422 L282,432 C272,428 260,426 250,427 C238,428 228,420 226,408 C225,400 227,396 232,394 Z" fill="url(#${P}hbd)" stroke="#3a3540" stroke-width="3.5" stroke-linejoin="round"/>` +
      `<circle cx="281" cy="420" r="2.5" fill="#3a3540"/>` +
      `<path d="M282,428 Q274,432 264,431" stroke="#3a3540" stroke-width="2.5" fill="none" stroke-linecap="round"/>` +
      `<circle cx="252" cy="402" r="3.2" fill="#2a2228"/><circle cx="253.2" cy="401" r="1" fill="#fff"/>` +
      `<path d="M240,400 C252,408 262,414 273,420" stroke="#c82832" stroke-width="3.5" fill="none"/>` +
      `<circle cx="273" cy="420" r="2.2" fill="#c82832"/>` +
      `<path d="M264,424 C253,430 242,432 231,430" stroke="#c82832" stroke-width="2.5" fill="none" opacity=".85"/>` +
      // 红鞍袍
      `<path d="M148,428 C168,420 192,424 208,438 C216,446 219,456 216,464 L200,459 C198,468 190,473 181,470 L176,459 C166,466 154,464 148,455 C140,459 131,455 130,446 L142,438 Z" fill="url(#${P}cap)" stroke="#7a0e14" stroke-width="2.5" stroke-linejoin="round"/>` +
      `<path d="M131,446 C140,452 150,456 160,454 M176,459 C186,464 196,462 201,458" stroke="#f2b428" stroke-width="2.5" fill="none" stroke-linecap="round"/>` +
      // 骑手: 腿/甲/盔/红羽
      limb([[158, 424], [176, 440], [188, 452]], 10, '#e8e6de', '#3a3540') + hoof(191, 454, 42, '#4a3f45') +
      `<path d="M142,394 C142,380 152,371 165,371 C178,371 188,380 188,394 L185,424 C174,433 156,433 146,424 Z" fill="url(#${P}ard)" stroke="#3a3540" stroke-width="3" stroke-linejoin="round"/>` +
      `<path d="M158,374 L157,426 M172,374 L173,426" stroke="#a8a496" stroke-width="1.8"/>` +
      `<circle cx="143" cy="384" r="8" fill="#e6e3da" stroke="#3a3540" stroke-width="2.5"/>` +
      `<circle cx="187" cy="384" r="8" fill="#e6e3da" stroke="#3a3540" stroke-width="2.5"/>` +
      limb([[150, 386], [136, 368], [126, 352]], 9, '#e8e6de', '#3a3540') +
      `<path d="M166,331 C172,312 188,300 206,302 C198,290 176,290 163,300 C154,308 152,320 156,331 Z" fill="url(#${P}plm)" stroke="#7a0e14" stroke-width="2.5" stroke-linejoin="round"/>` +
      `<path d="M164,330 C170,314 182,304 198,302" stroke="#8a1a12" stroke-width="2" fill="none" opacity=".6"/>` +
      `<path d="M147,358 C147,342 155,331 166,331 C177,331 185,342 185,358 L183,364 L149,364 Z" fill="url(#${P}ard)" stroke="#3a3540" stroke-width="3" stroke-linejoin="round"/>` +
      `<path d="M160,333 L159,362 M166,331 L166,362 M172,333 L173,362" stroke="#a8a496" stroke-width="1.6"/>` +
      `<rect x="151" y="350" width="30" height="8" rx="4" fill="#2a2430"/>` +
      `<circle cx="159" cy="354" r="2.6" fill="#ff3b2e"/><circle cx="172" cy="354" r="2.6" fill="#ff3b2e"/>` +
      // 长枪 + 红缨 (手握枪杆)
      `<line x1="126" y1="350" x2="56" y2="244" stroke="#6a6a74" stroke-width="9" stroke-linecap="round"/>` +
      `<line x1="126" y1="350" x2="56" y2="244" stroke="#eceff4" stroke-width="5" stroke-linecap="round"/>` +
      `<circle cx="124" cy="349" r="6.5" fill="#d6d3ca" stroke="#3a3540" stroke-width="2.5"/>` +
      `<path d="M62,252 L48,228 L70,240 Z" fill="#c9ccd4" stroke="#3a3540" stroke-width="2" stroke-linejoin="round"/>` +
      `<path d="M60,254 L30,252 L54,236 Z" fill="url(#${P}plm)" stroke="#7a0e14" stroke-width="2" stroke-linejoin="round"/>`
    );

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
