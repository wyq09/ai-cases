(() => {
  'use strict';
  const SC = window.__SC;
  const K = SC.kit;
  const M = SC.math;
  const D = SC.D;
  const { T, HDR } = K;
  const { clamp, lerp, ease } = M;
  const act3 = 'Ⅲ · 超临界  k > 1';
  const INK = [0.078, 0.07, 0.063];
  const INK2 = [0.42, 0.4, 0.37];
  const INK3 = [0.8, 0.78, 0.74];

  // ===========================================================================
  // S11 · 快进的百年 — half a century of structures vs. one year of AlphaFold
  // ===========================================================================
  (() => {
    const G0 = [700, 150], G1 = [1760, 990], COLS = D.SCI.cols, ROWS = D.SCI.rows;
    const PER = D.SCI.perCell;
    const HUMAN = D.SCI.pdb / PER; // ≈ 11.9 cells

    K.scene({
      id: 'science',
      title: '快进的百年',
      enterWith: 'halftone',
      beats: [
        { dur: 5.0, hold: 4 },
        { dur: 7.0, hold: 5 },
        { dur: 5.0, hold: 5 },
        { dur: 4.6, hold: 7 },
      ],
      thumbBeat: 1,
      notes: [
        '换个学科看看。蛋白质结构：生命科学里最硬、最慢的活儿。\n从 1971 年建立蛋白数据库到今天，全人类用半个多世纪，一个一个解析出了大约 19 万个结构。\n（屏幕放大了：每一格是 16,000 个结构。这十二格，就是人类 50 年的全部成果。）',
        '2022 年 7 月，AlphaFold 一次性公开了两亿个预测结构，几乎所有已知的蛋白质。\n两年后，诺贝尔化学奖。\n（不说话。让洪水淹过去。）',
        '而这还只是「工具」。AlphaFold 不会提出假设，它只回答人类提出的问题。\n下一个版本，会提问。阿莫迪的估计：生物学的 50 到 100 年，压进 5 到 10 年。',
        '物理、材料、数学、医药。每一门学科，都有自己那张「19 万个」的表格。\n现在想象这场洪水，同时漫过所有的表格。',
      ],
      create(ctx) {
        const { gfx } = ctx;
        const ov = ctx.overlay();
        const bgp = K.bg(ctx, { grid: 1, vig: 0.4 });
        const grid = K.pass(
          ctx,
          `
uniform vec2 uG0, uG1, uN;
uniform float uHuman, uFlood, uZoom;
void main(){
  vec2 s = stage();
  vec3 col = vec3(0.026, 0.025, 0.024);
  vec2 span = uG1 - uG0;
  // zoomed-in view pins the grid's bottom-left corner to a fixed screen anchor
  float z01 = clamp((uZoom - 1.0) / 8.0, 0.0, 1.0);
  vec2 corner = uG0 + span * vec2(0.0, 1.0);
  vec2 anchor = vec2(720.0, 944.0);
  vec2 sp = mix(s, corner + (s - anchor) / uZoom, z01);
  vec2 g = (sp - uG0) / span;
  if (all(greaterThanEqual(g, vec2(0.0))) && all(lessThan(g, vec2(1.0)))) {
    vec2 cellId = floor(g * uN);
    vec2 cg = uG0 + (cellId + 0.5) / uN * span;
    vec2 cp = mix(cg, anchor + (cg - corner) * uZoom, z01);
    float pitch = (span.x / uN.x) * mix(1.0, uZoom, z01);
    float d = length(s - cp) / (pitch * 0.5);
    float h = hash12(cellId);
    float idx = (uN.y - 1.0 - cellId.y) * uN.x + cellId.x;
    float human = 1.0 - smoothstep(uHuman - 1.3, uHuman - 0.3, idx);
    float wave = g.x * 0.5 + (1.0 - g.y) * 0.5 + (h - 0.5) * 0.14;
    float flood = (1.0 - smoothstep(uFlood - 0.07, uFlood, wave)) * step(0.0005, uFlood);
    float px = pxUnit() / (pitch * 0.5);
    float r = 0.44;
    float disc = 1.0 - smoothstep(r - px, r + px, d);
    float tw = 0.82 + 0.18 * sin(uTime * (0.6 + h * 2.0) + h * 50.0);
    vec3 c = mix(vec3(0.07, 0.066, 0.062), vec3(0.9, 0.87, 0.82), human);
    c = mix(c, mix(vec3(1.0, 0.28, 0.07), vec3(1.0, 0.58, 0.17), h) * 1.35 * tw, flood);
    float front = exp(-abs(wave - uFlood) * 22.0) * step(0.0005, uFlood) * (1.0 - step(1.15, uFlood));
    c += vec3(2.2, 1.7, 1.1) * front;
    col = mix(col, c, disc);
  }
  vec2 dd = (vUv - 0.5) * vec2(uRes.x / max(uRes.y, 1.0), 1.0);
  col *= 1.0 - 0.32 * smoothstep(0.35, 1.3, length(dd));
  o = vec4(col, 1.0);
}`,
          {
            uG0: { value: new ctx.THREE.Vector2(...G0) },
            uG1: { value: new ctx.THREE.Vector2(...G1) },
            uN: { value: new ctx.THREE.Vector2(COLS, ROWS) },
            uHuman: 0,
            uFlood: 0,
            uZoom: 9,
          }
        );
        const rt = gfx.target({});
        const rtP = gfx.target({});
        K.chrome(ctx, ov, { act: act3 });

        const cap = K.text(ctx, ov, '每一格 = 16,000 个蛋白质结构', 'monoS', { x: G1[0], y: 1002, size: 19, color: T.dim, align: 'right' });
        const HEADS = ['半个世纪。\n19 万个。', '一年。两亿个。', '而这，还只是「工具」。', '想象它漫过所有的学科。'];
        const LEADS = [
          '蛋白质结构，人类一个一个解析出来的全部成果。\n放大看，这十二格，就是五十多年。',
          'AlphaFold，2022 年 7 月。几乎一次性预测了所有已知的蛋白质。\n两年后：诺贝尔化学奖。',
          'AlphaFold 不会提出假设，它只回答人类提出的问题。\n下一个版本，会提问。\n\n「生物学的 50–100 年，压进 5–10 年。」— 达里奥 · 阿莫迪，2024',
          '物理、材料、数学、医药。\n每一门，都有自己那张「19 万个」的表格。',
        ];
        const heads = HEADS.map((t) => K.text(ctx, ov, t, 'h1', { x: 136, y: 150, size: 76, maxWidth: 560 }));
        const leads = LEADS.map((t, i) => K.text(ctx, ov, t, 'lead', { x: 140, y: 404, maxWidth: 540, size: i === 2 ? 27 : 31 }));
        const cnt = K.text(ctx, ov, '0', 'didot', { x: 124, y: 716, size: 92, leading: 1.0 });
        const cntLab = K.text(ctx, ov, '个结构', 'songBold', { x: 138, y: 826, size: 40, color: T.dim });
        const src = K.text(ctx, ov, '来源：PDB · AlphaFold DB（2022.07）· 诺贝尔基金会（2024）', 'monoS', { x: T.M, y: 1004, align: 'left', color: T.faint });
        let lastTxt = '';
        const copyVis = (i, b, s) => {
          let p = 0;
          if (i === b) p = i === 0 ? K.gate(s, 0.2, 0.7) : K.seg(s, b, 0.02, 0.2);
          else if (i === b - 1) p = 1 - K.seg(s, b, 0, 0.1);
          return p;
        };

        return {
          update(s) {
            const b = s.beat;
            const g = K.gate(s);
            const u = grid.u;
            const h = b === 0 ? Math.floor(12 * K.seg(s, 0, 0.3, 0.95)) : HUMAN;
            const zoom = b === 0 ? 9 : b === 1 ? lerp(9, 1, ease.io3(K.seg(s, 1, 0.3, 0.6))) : 1;
            const fl = b === 1 ? 1.2 * ease.io2(K.seg(s, 1, 0.62, 0.98)) : b >= 2 ? 1.2 : 0;
            u.uHuman.value = h;
            u.uZoom.value = zoom;
            u.uFlood.value = fl;
            ctx.audio.param('water', 0.45 * clamp(fl / 1.2, 0, 1));
            if (h !== this._h && K.live(s)) ctx.sfx('tick', { gain: 0.5, pitch: 0.9 + h * 0.05 });
            this._h = h;
            heads.forEach((hb, i) => K.show(hb, copyVis(i, b, s), 'rise', 0.3));
            leads.forEach((lb, i) => K.show(lb, i === b ? (i === 0 ? K.seg(s, 0, 0.35, 0.85) * g : i === 1 ? K.seg(s, 1, 0.02, 0.3) : K.seg(s, b, 0.2, 0.6)) : 0, 'fade'));
            K.show(cap, b === 0 ? K.seg(s, 0, 0.2, 0.6) * g : 0, 'fade');
            K.show(src, g * 0.9, 'fade');
            const n = b === 0 ? Math.min(D.SCI.pdb, Math.round(h * PER)) : b === 1 ? Math.min(D.SCI.alphafold, Math.round(K.seg(s, 1, 0.62, 0.98) * D.SCI.alphafold)) : D.SCI.alphafold;
            const txt = n >= 1e8 ? K.fmtInt(n) : n >= 1e4 ? `${(n / 1e4).toFixed(1)} 万` : K.fmtInt(n);
            if (txt !== lastTxt) {
              lastTxt = txt;
              cnt.set(txt);
            }
            K.show(cnt, b === 0 ? K.seg(s, 0, 0.3, 0.5) * g : b === 1 ? 1 : 1, 'fade');
            K.show(cntLab, b === 0 ? K.seg(s, 0, 0.4, 0.7) * g : 1, 'fade');
            cntLab.x = 138;
            cntLab.y = 812;
          },

          anchor() {
            return { x: 760, y: 930 };
          },

          render(target, s) {
            grid.render(rt, s.t, true);
            K.post(ctx, rt, rtP, { bloom: 0.55, grain: 0.018, exposure: 1.25, vignette: 0.2, time: s.t });
            gfx.copy(rtP, target);
            ov.render(target);
          },
        };
      },
    });
  })();

  // ===========================================================================
  // S12 · 瓦 — nothing in physics says it has to stop at "about as smart as us"
  // ===========================================================================
  (() => {
    const CAMD = [6.5, 22, 44, 86, 112, 250];
    const SHIFT = 300; // stage px the 3D subject sits right of centre, clear of the number block
    const CORE = [0.9, 0, 0, 0.25, 2.6, 1.3];
    const RAD = [46, 0, 0, 100, 170, 70];
    const MANT = ['20', '2.25', '3.6', '1.7', '3.8', '4'];
    const EXPS = [null, 10, 12, 17, 26, 37];
    const NAMES = D.SCALE.map((r) => r.name);
    const NOTES = [
      '起点：人脑。860 亿个神经元，20 瓦。一台台灯。\n全人类 80 亿个大脑加起来，大约 160 吉瓦。而今天一座大型 AI 数据中心的功率，已经接近 1 吉瓦：一座楼，相当于 5,000 万个人脑。\n接下来每往上一级，都是一次巨大的跳跃。',
      '2.25 × 10¹⁰ 瓦。三峡。\n相当于 11 亿个人脑同时运转的功率。',
      '3.6 × 10¹² 瓦。2025 年全人类发了约 31,700 太瓦时电。\n这是一百六十座三峡。',
      '1.7 × 10¹⁷ 瓦。太阳照向地球的全部功率。\n卡尔达肖夫 Ⅰ 型：用上一颗行星收到的所有能量。是全人类发电量的 48,000 倍。',
      '3.8 × 10²⁶ 瓦。太阳的全部输出。\nⅡ 型：戴森云。是人类今天用电量的一百万亿倍。',
      '4 × 10³⁷ 瓦。整个银河系。Ⅲ 型。\n没有哪条物理定律说，智能必须停在「和人差不多」。一艘能自我复制的探测器，以亚光速航行，最短一百万年就能走遍银河系。\n对宇宙来说，一百万年，是一眨眼。',
    ];
    const LEADS = [
      '人脑。860 亿个神经元。\n一台台灯的功率。这是起点。',
      '相当于 11 亿个人脑，同时运转。',
      '2025 年，全世界发了约 31,700 太瓦时电。\n相当于 160 座三峡。',
      '用上一颗行星收到的全部阳光。\n是全人类发电量的 48,000 倍。',
      '戴森云：把一颗恒星包起来。\n是人类今天用电量的一百万亿倍。',
      '一艘能自我复制的探测器，以亚光速航行，\n最短一百万年，就能走遍银河系。',
    ];

    const PTS_VS = `
precision highp float;
uniform mat4 projectionMatrix, modelViewMatrix;
uniform float uLvl, uTime, uSize, uPx;
in vec3 position;
in vec4 aSeed;
out vec3 vCol;
out float vA;
vec3 cfg(float L, vec4 sd){
  vec3 dir = normalize(vec3(sd.x, sd.y, sd.z) * 2.0 - 1.0 + 0.001);
  if (L < 0.5) return dir * pow(sd.w, 0.33) * 1.0;
  if (L < 1.5) {
    float a = sd.x * 6.2831853;
    float ring = floor(sqrt(sd.y) * 7.0) / 7.0;
    return vec3(cos(a), 0.0, sin(a)) * ring * 5.0;
  }
  if (L < 2.5) return dir * 10.0;
  if (L < 3.5) return dir * (10.0 + step(0.62, sd.w) * sd.z * 10.0);
  if (L < 4.5) {
    float band = floor(sd.y * 11.0) / 11.0;
    float a = sd.x * 6.2831853;
    float lat = (band - 0.5) * 2.3 + (sd.z - 0.5) * 0.07;
    return vec3(cos(a) * cos(lat), sin(lat), sin(a) * cos(lat)) * 26.0;
  }
  float arm = floor(sd.y * 4.0);
  float a = arm * 1.5708 + pow(sd.x, 0.62) * 5.4;
  float r = pow(sd.x, 0.78) * 80.0 + 1.2;
  float y = (sd.z - 0.5) * (5.0 - r * 0.05) + (sd.w - 0.5) * 2.0;
  return vec3(cos(a) * r, y, sin(a) * r);
}
void main(){
  float L = uLvl;
  float f0 = floor(L);
  float f = smoothstep(0.0, 1.0, clamp((fract(L) - aSeed.x * 0.3) / 0.7, 0.0, 1.0));
  vec3 p = mix(cfg(f0, aSeed), cfg(f0 + 1.0, aSeed), f);
  p *= 1.0 + 0.012 * sin(uTime * 0.6 + aSeed.y * 30.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = max(1.0, -mv.z);
  gl_PointSize = clamp(uSize * 34.0 / dist, 1.1, 9.0) * uPx;
  float heat = clamp(L / 5.0, 0.0, 1.0);
  vec3 cold = vec3(0.62, 0.68, 0.74);
  vec3 warm = vec3(1.0, 0.36, 0.1);
  vec3 hot = vec3(1.0, 0.72, 0.34);
  vec3 c = mix(cold, warm, smoothstep(0.0, 0.5, heat));
  c = mix(c, hot, smoothstep(0.5, 1.0, heat));
  float tw = 0.55 + 0.45 * sin(uTime * (0.4 + aSeed.w * 1.6) + aSeed.z * 40.0);
  // the planet-wide shell spreads the same points over a far larger surface, so lift it
  float boost = (f0 > 1.5 && f0 < 2.5) ? 2.8 : 1.0;
  vCol = c * (0.9 + tw * 1.5) * (0.6 + aSeed.w * 0.8) * boost;
  vA = 0.45 + 0.55 * tw;
}`;
    const PTS_FS = `
precision highp float;
in vec3 vCol;
in float vA;
out vec4 o;
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float a = exp(-d * d * 3.0) * (1.0 - smoothstep(0.6, 1.0, d)) * vA;
  o = vec4(vCol, a);
}`;

    K.scene({
      id: 'scale',
      title: '瓦',
      enterWith: 'zoom',
      beats: [
        { dur: 4.4, hold: 4 },
        { dur: 4.4, hold: 4 },
        { dur: 4.4, hold: 4.4 },
        { dur: 5.0, hold: 4.6 },
        { dur: 5.2, hold: 4.6 },
        { dur: 6.4, hold: 8 },
      ],
      thumbBeat: 4,
      notes: NOTES,
      create(ctx) {
        const { THREE, gfx } = ctx;
        const ov = ctx.overlay();
        const ovH = ctx.overlay();
        const scene3d = new THREE.Scene();
        const cam = new THREE.PerspectiveCamera(36, gfx.aspect || 16 / 9, 0.1, 4000);
        const N = 26000;
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(N * 3);
        const seed = new Float32Array(N * 4);
        const rnd = M.rng(1212);
        for (let i = 0; i < N * 4; i++) seed[i] = rnd();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
        const u = { uLvl: { value: 0 }, uTime: { value: 0 }, uSize: { value: 1 }, uPx: { value: 1 } };
        const mat = new THREE.RawShaderMaterial({
          vertexShader: PTS_VS,
          fragmentShader: PTS_FS,
          glslVersion: THREE.GLSL3,
          uniforms: u,
          transparent: true,
          depthTest: false,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        const pts = new THREE.Points(geo, mat);
        pts.frustumCulled = false;
        scene3d.add(pts);
        const rt3 = gfx.target({ depth: true });
        const rtP = gfx.target({});
        const core = K.pass(
          ctx,
          `
uniform float uCore, uRad;
void main(){
  vec2 s = stage();
  float d = length(s - vec2(960.0 + 300.0, 520.0)) / uRad;
  vec3 c = mix(vec3(1.0, 0.42, 0.12), vec3(1.0, 0.86, 0.66), exp(-d * d)) * (exp(-d * d * 2.4) * 1.6 + exp(-d * 0.9) * 0.22) * uCore;
  o = vec4(c, 1.0);
}`,
          { uCore: 0, uRad: 60 },
          { blending: THREE.AdditiveBlending, transparent: true }
        );
        K.chrome(ctx, ov, { act: act3 });

        const mant = K.text(ctx, ov, '20', 'didot', { x: 124, y: 412, size: 150, leading: 1.0 });
        const times = K.text(ctx, ov, '×', 'didot', { x: 0, y: 486, size: 76, color: T.text });
        const base = K.text(ctx, ov, '10', 'didot', { x: 0, y: 392, size: 206, leading: 1.0 });
        const expo = K.text(ctx, ov, '10', 'didot', { x: 0, y: 396, size: 92, leading: 1.0 });
        const unit = K.text(ctx, ov, '瓦', 'songBlack', { x: 136, y: 604, size: 64, color: T.ember });
        const name = K.text(ctx, ov, '', 'h2', { x: 136, y: 150, size: 84 });
        const note = K.text(ctx, ov, '', 'mono', { x: 0, y: 622, size: 26, color: T.dim });
        const leads = LEADS.map((t) => K.text(ctx, ov, t, 'lead', { x: 140, y: 720, maxWidth: 900, size: 34 }));
        const ladder = D.SCALE.map((r, i) => ({
          y: K.text(ctx, ov, String(i + 1), 'mono', { x: 1700, y: 250 + i * 62, size: 20, align: 'right', valign: 'middle', color: T.faint }),
          n: K.text(ctx, ov, r.name, 'text', { x: 1722, y: 250 + i * 62, size: 24, valign: 'middle', color: T.faint }),
        }));
        const ladLab = K.text(ctx, ov, '卡尔达肖夫等级 · 功率', 'monoS', { x: 1722, y: 196, size: 18, color: T.faint });

        const copyVis = (i, b, s) => {
          let p = 0;
          if (i === b) p = i === 0 ? K.gate(s, 0.2, 0.7) : K.seg(s, b, 0.04, 0.3);
          else if (i === b - 1) p = 1 - K.seg(s, b, 0, 0.08);
          return p;
        };
        let lastL = -1;

        return {
          update(s) {
            const b = s.beat;
            const g = K.gate(s);
            const L = b === 0 ? 0 : b - 1 + ease.io3(K.seg(s, b, 0.02, 0.72));
            ctx.audio.param('deep', 0.6 + 0.4 * clamp(L / 5, 0, 1));
            ctx.audio.param('tension', clamp(L / 5, 0, 1) * 0.8);
            u.uLvl.value = L;
            u.uTime.value = s.t;
            u.uPx.value = ctx.gfx.W / ctx.view.w;
            const f0 = Math.min(4, Math.floor(L));
            const fr = L - f0;
            const dist = lerp(CAMD[f0], CAMD[f0 + 1], ease.io2(fr));
            const ang = 0.55 + s.t * 0.05;
            const elev = lerp(0.42, 0.95, clamp(L / 5, 0, 1));
            cam.position.set(Math.sin(ang) * dist * Math.cos(elev), Math.sin(elev) * dist, Math.cos(ang) * dist * Math.cos(elev));
            cam.lookAt(0, 0, 0);
            cam.aspect = ctx.gfx.W / ctx.gfx.H;
            cam.setViewOffset(ctx.gfx.W, ctx.gfx.H, -Math.round((SHIFT * ctx.gfx.W) / ctx.view.w), 0, ctx.gfx.W, ctx.gfx.H);
            core.u.uCore.value = lerp(CORE[f0], CORE[f0 + 1], fr) * g;
            core.u.uRad.value = lerp(RAD[f0], RAD[f0 + 1], fr) * (1 + 0.06 * Math.sin(s.t * 2.1));
            u.uSize.value = 1 + 0.5 * clamp(L / 5, 0, 1);

            leads.forEach((lb, i) => K.show(lb, b === i ? (i === 0 ? K.seg(s, 0, 0.35, 0.8) * g : K.seg(s, b, 0.3, 0.7)) : 0, 'fade'));
            ladder.forEach((r, i) => {
              const on = b >= i;
              if (r._on !== on) {
                r._on = on;
                r.n.style({ color: on ? T.white : T.faint });
                r.y.style({ color: on ? T.ember : T.faint });
              }
              K.show(r.y, K.seg(s, 0, 0.3, 0.8) * g, 'fade');
              K.show(r.n, K.seg(s, 0, 0.3, 0.8) * g, 'fade');
            });
            K.show(ladLab, K.seg(s, 0, 0.4, 0.9) * g, 'fade');
            if (lastL !== b) {
              lastL = b;
              const m = MANT[b];
              mant.set(m);
              if (EXPS[b] != null) {
                expo.set(String(EXPS[b]));
                base.set('10');
              }
              unit.set('瓦');
              name.set(NAMES[b]);
              note.set(D.SCALE[b].note);
            }
            const nP = b === 0 ? K.gate(s, 0.2, 0.6) : K.seg(s, b, 0.04, 0.26);
            K.show(name, nP, 'rise', 0.3);
            K.show(note, b === 0 ? K.seg(s, 0, 0.4, 0.8) * g : K.seg(s, b, 0.3, 0.6), 'fade');
            const numP = b === 0 ? K.gate(s, 0.25, 0.7) : K.seg(s, b, 0.08, 0.4);
            const hasExp = EXPS[b] != null;
            const x1 = 136 + mant.width;
            times.x = x1 + 6;
            const x2 = x1 + times.width + 30;
            base.x = x2;
            expo.x = x2 + base.width + 4;
            note.x = 136 + unit.width + 24;
            note.y = 622;
            K.show(mant, numP, 'blur', 0.3);
            K.show(times, hasExp ? numP : 0, 'fade');
            K.show(base, hasExp ? numP : 0, 'blur', 0.3);
            K.show(expo, hasExp ? numP : 0, 'blur', 0.3);
            K.show(unit, numP, 'fade');
          },

          anchor() {
            return { x: 960 + SHIFT, y: 520 };
          },

          resize() {
            cam.aspect = ctx.gfx.W / ctx.gfx.H;
            cam.updateProjectionMatrix();
          },

          render(target, s) {
            gfx.draw(scene3d, cam, rt3, { clear: true, color: 0x060606 });
            core.render(rt3);
            K.post(ctx, rt3, rtP, { bloom: 0.7, grain: 0.02, exposure: 1.35, vignette: 0.4, threshold: 0.9, time: s.t });
            gfx.copy(rtP, target);
            ovH.render(target);
            ov.render(target);
          },
        };
      },
    });
  })();

  // ===========================================================================
  // S13 · 视界 — past a certain point we cannot see; say only what survives that
  // ===========================================================================
  (() => {
    const PAPER = [0.949, 0.933, 0.902];
    const VQ = D.QUOTES.vinge;
    const WQ = D.QUOTES.wiener;
    const SURE = ['变化的速度，会超过人类适应的速度。', '我们将不再是房间里最聪明的那个。', '答案会变得无限便宜。问题，不会。'];

    K.scene({
      id: 'white',
      title: '视界',
      enterWith: 'overexpose',
      light: true,
      beats: [
        { dur: 6.0, hold: 5 },
        { dur: 7.0, hold: 6 },
        { dur: 6.0, hold: 7 },
      ],
      thumbBeat: 1,
      notes: [
        '（画面变白之后，停三秒再开口。）\n文奇那句话还有后半句：「此后不久，人类时代将会结束。」\n这句话让人不舒服。应该的。',
        '过了某个点，我们看不见了。谁都说不出之后的世界长什么样。\n这不是不认真，这是诚实。但有三件事，现在就能说。\n（一条一条来，每条之间停一拍。）',
        '维纳在 1960 年就写下了这一句，比古德还早五年。\n我们最好非常确定，放进机器里的目的，是我们真正想要的目的。\n因为一旦它跑起来，就没有「等等，我改主意了」。',
      ],
      create(ctx) {
        const ov = ctx.overlay();
        const V = K.vec(ctx);
        const bgp = K.bg(ctx, { base: PAPER, grid: 0, vig: 0, grain: 0.014, tint: [1, 1, 1] });
        K.chrome(ctx, ov, { act: '视 界', light: true });

        const vq = K.text(ctx, ov, '此后不久，\n人类时代将会结束。', 'h1', { x: 140, y: 300, size: 124, color: T.ink, leading: 1.28 });
        const vqBy = K.text(ctx, ov, `${VQ.who} · ${VQ.when} · 《即将到来的技术奇点》`, 'mono', { x: 146, y: 700, size: 26, color: '#6f6962' });
        const h2 = K.text(ctx, ov, '过了某个点，我们看不见了。', 'h2', { x: 136, y: 150, size: 76, color: T.ink });
        const l2 = K.text(ctx, ov, '谁都说不出之后的世界长什么样。这不是不认真，这是诚实。\n但有三件事，现在就能说。', 'lead', { x: 140, y: 272, size: 34, color: '#4a453f' });
        const sure = SURE.map((t, i) => ({
          n: K.text(ctx, ov, `0${i + 1}`, 'monoMed', { x: 146, y: 440 + i * 150, size: 26, color: '#b8351a' }),
          t: K.text(ctx, ov, t, 'songBold', { x: 240, y: 418 + i * 150, size: 60, color: T.ink }),
          ln: V.line(2, { width: 1.5, color: INK3, order: 4 }),
        }));
        sure.forEach((r) => r.ln.set([240, 500, 1680, 500]));
        const wq = K.text(ctx, ov, WQ.zh, 'quote', { x: 140, y: 230, size: 50, maxWidth: 1560, color: T.ink });
        const wqBy = K.text(ctx, ov, `— ${WQ.who} · ${WQ.when} · ${WQ.src}`, 'mono', { x: 146, y: 0, size: 26, color: '#b8351a' });
        const wqTail = K.text(ctx, ov, '因为一旦它跑起来，就没有「等等，我改主意了」。', 'lead', { x: 140, y: 0, size: 38, color: '#4a453f' });

        return {
          update(s) {
            const b = s.beat;
            K.show(vq, b === 0 ? K.seg(s, 0, 0.2, 0.75) * (1 - K.seg(s, 1, 0, 0.1)) : 0, 'blur', 0.4);
            K.show(vqBy, b === 0 ? K.seg(s, 0, 0.7, 0.95) * (1 - K.seg(s, 1, 0, 0.1)) : 0, 'fade');
            K.show(h2, b === 1 ? K.seg(s, 1, 0.05, 0.3) * (1 - K.seg(s, 2, 0, 0.1)) : 0, 'rise', 0.3);
            K.show(l2, b === 1 ? K.seg(s, 1, 0.3, 0.6) * (1 - K.seg(s, 2, 0, 0.1)) : 0, 'fade');
            sure.forEach((r, i) => {
              const p = b === 1 ? K.seg(s, 1, 0.5 + i * 0.14, 0.66 + i * 0.14) : b === 2 ? 1 - K.seg(s, 2, 0, 0.1) : 0;
              K.show(r.n, p, 'fade');
              K.show(r.t, p, 'rise', 0.2);
              r.ln.draw(r.ln.len * p);
              r.ln.visible(p > 0.01);
            });
            const q = b === 2 ? ease.lin(K.seg(s, 2, 0.08, 0.52)) : 0;
            K.show(wq, q, 'type', 0.96, 'word');
            wqBy.y = wq.y + wq.height + 34;
            wqTail.y = wqBy.y + 96;
            K.show(wqBy, b === 2 ? K.seg(s, 2, 0.52, 0.68) : 0, 'fade');
            K.show(wqTail, b === 2 ? K.seg(s, 2, 0.7, 0.9) : 0, 'fade');
          },

          render(target, s) {
            bgp.render(target, s.t, true);
            V.render(target);
            ov.render(target);
          },
        };
      },
    });
  })();

  // ===========================================================================
  // S14 · 祝你好运 — the last three characters of the brief, handed back
  // ===========================================================================
  (() => {
    const PAPER = [0.949, 0.933, 0.902];
    const TAIL = '祝你好运';
    const LINES = ['知道你要什么。', '在它还听得进去的时候，把话说清楚。', '别把未来画成一条直线。'];
    const N = Array.from(D.BRIEF).length;

    K.scene({
      id: 'luck',
      title: '祝你好运',
      enterWith: 'fade',
      light: true,
      beats: [
        { dur: 6.0, hold: 5 },
        { dur: 5.0, hold: 5 },
        { dur: 3.0, hold: 12 },
      ],
      thumbBeat: 1,
      notes: [
        '所以，你能做什么？三件事。\n知道你要什么——当答案无限便宜的时候，品味是唯一的稀缺。\n在它还听得进去的时候，把话说清楚。\n以及，别再把未来画成一条直线。',
        '（停。让那四个字自己打出来。）\n这三个字，是人类对机器说的。现在，还给你。',
        '（不用多说。停在这里。）',
      ],
      create(ctx) {
        const ov = ctx.overlay();
        const V = K.vec(ctx);
        const bgp = K.bg(ctx, { base: PAPER, grid: 0, vig: 0, grain: 0.014, tint: [1, 1, 1] });
        K.chrome(ctx, ov, { act: '尾 声', light: true });
        const lines = LINES.map((t, i) => ({
          n: K.text(ctx, ov, `0${i + 1}`, 'monoMed', { x: 146, y: 372 + i * 170, size: 26, color: '#b8351a' }),
          t: K.text(ctx, ov, t, 'songBold', { x: 250, y: 340 + i * 170, size: 66, color: T.ink }),
        }));
        const head = K.text(ctx, ov, '所以，你能做什么？', 'h2', { x: 136, y: 150, size: 72, color: T.ink });
        const said = K.text(ctx, ov, [{ t: '人类 → 机器 · ' }, { t: `${N} 字`, color: '#b8351a' }, { t: ' · 最后四个字' }], 'mono', { x: 146, y: 250, size: 26, color: '#6f6962' });
        const big = K.text(ctx, ov, TAIL, 'songBlack', { x: 128, y: 380, size: 300, leading: 1.0, color: T.ink });
        const caret = V.rects(1, { order: 20 });
        const back = K.text(ctx, ov, '这四个字，是人类对机器说的。\n现在，还给你。', 'lead', { x: 146, y: 760, size: 40, color: '#4a453f' });
        const title = K.text(ctx, ov, '超临界 · SUPERCRITICAL', 'didot', { x: 146, y: 300, size: 72, tracking: 0.12, color: T.ink });
        const thanks = K.text(ctx, ov, '谢谢。', 'songBlack', { x: 136, y: 420, size: 150, color: T.ink });
        const foot = K.text(
          ctx,
          ov,
          `数据：Epoch AI · METR · AI Impacts · OpenAI · Anthropic · Google DeepMind · UNESCO · 诺贝尔基金会\n本演示文稿的文案、图形、转场与音效，由 AI 生成。人类的输入：${N} 个字。${D.BRIEF_DATE}`,
          'monoS',
          { x: 146, y: 820, size: 19, leading: 1.8, color: '#6f6962' }
        );
        let lastN = -1;
        const glyphCount = (p) => Math.floor(clamp(p, 0, 1) * 4.4);

        return {
          update(s) {
            const b = s.beat;
            const g = K.gate(s);
            K.show(head, b === 0 ? K.seg(s, 0, 0.05, 0.4) * g * (1 - K.seg(s, 1, 0, 0.1)) : 0, 'rise', 0.3);
            lines.forEach((r, i) => {
              const p = b === 0 ? K.seg(s, 0, 0.28 + i * 0.2, 0.44 + i * 0.2) : b === 1 ? 1 - K.seg(s, 1, 0, 0.12) : 0;
              K.show(r.n, p, 'fade');
              K.show(r.t, p, 'rise', 0.2);
            });
            const nT = b < 1 ? 0 : b > 1 ? 4 : glyphCount(K.seg(s, 1, 0.2, 0.8, ease.lin));
            if (nT !== lastN) {
              if (nT > lastN && K.live(s)) ctx.sfx('type', { gain: 0.7, pitch: 0.6 });
              lastN = nT;
            }
            K.show(said, b === 1 ? K.seg(s, 1, 0.08, 0.3) * (1 - K.seg(s, 2, 0, 0.1)) : 0, 'fade');
            big.mesh.visible = b === 1;
            big.animate((gl, d) => {
              d.alpha = gl.n < nT ? 1 : 0;
            });
            const gl = nT > 0 ? big.glyphs[Math.min(3, nT - 1)] : null;
            caret.set(0, gl ? big.x + gl.x + gl.w + 14 : big.x + 10, gl ? big.y + gl.top + 40 : big.y + 40, 8, 250, [0.72, 0.17, 0.06], b === 1 ? (Math.sin(s.t * Math.PI * 2 * 1.3) > -0.2 ? 1 : 0.1) : 0, 0, 0);
            caret.commit();
            K.show(back, b === 1 ? K.seg(s, 1, 0.72, 0.95) * (1 - K.seg(s, 2, 0, 0.1)) : 0, 'fade');
            K.show(title, b >= 2 ? K.seg(s, 2, 0.1, 0.5) : 0, 'blur', 0.3);
            K.show(thanks, b >= 2 ? K.seg(s, 2, 0.3, 0.7) : 0, 'rise', 0.3);
            K.show(foot, b >= 2 ? K.seg(s, 2, 0.6, 0.95) : 0, 'fade');
          },

          render(target, s) {
            bgp.render(target, s.t, true);
            V.render(target);
            ov.render(target);
          },
        };
      },
    });
  })();
})();
