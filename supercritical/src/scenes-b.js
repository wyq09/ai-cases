(() => {
  'use strict';
  const SC = window.__SC;
  const K = SC.kit;
  const M = SC.math;
  const D = SC.D;
  const { T, HDR } = K;
  const { clamp, lerp, ease } = M;
  const act1 = 'Ⅰ · 亚临界  k < 1';
  const act2 = 'Ⅱ · 临 界  k → 1';
  const act3 = 'Ⅲ · 超临界  k > 1';

  // ===========================================================================
  // S6 · 八个环节 — eight stages of AI research, each with a dated case of AI doing it
  // ===========================================================================
  (() => {
    const CX = 1250, CY = 606, R = 292, N = 8;
    const RAD = Math.PI / 180;
    const a0 = (i) => (-90 + i * 45 + 3.4) * RAD;
    const a1 = (i) => (-90 + (i + 1) * 45 - 3.4) * RAD;
    const am = (i) => (-90 + (i + 0.5) * 45) * RAD;
    const NUM = ['$15', '80%', '52×', '−20%', '2020 →', '48', '35 / 42', '97%'];
    const NUMLAB = [
      '一篇完整论文的成本',
      '合入代码库的代码，由 Claude 写下',
      '同一道优化题：一年前是 3×',
      '推理成本。它重写了自家的生产内核',
      '以来的每一代 TPU 芯片布局',
      '次乘法。此前最好的结果：49',
      '国际数学奥林匹克 · 金牌线',
      '两位人类研究员一周：23%',
    ];

    const beats = [{ dur: 2.8, hold: 3 }];
    for (let i = 0; i < N; i++) beats.push({ dur: 3.0, hold: 2.6 });
    beats.push({ dur: 4.0, hold: 7 });

    K.scene({
      id: 'lab',
      title: '八个环节',
      enterWith: 'ring',
      beats,
      thumbBeat: 8,
      notes: [
        '一份 AI 研究工作，拆开来是八个环节。问题是：这八个环节里，有多少已经能由 AI 自己完成？\n（别急着念。一个一个来。）',
        '读文献、提想法、写论文。Sakana 的 AI Scientist 在 2024 年做出了第一篇完整论文，成本大约十五美元。',
        '写代码。Anthropic 自己披露：到 2026 年 5 月，合入代码库的代码超过 80% 由 Claude 写下。2025 年 2 月以前，还是个位数。',
        '调实验。同一道代码优化题：2025 年 5 月的 Opus 平均提速 3 倍；2026 年 4 月的 Mythos，52 倍。',
        '写内核。OpenAI 披露，GPT-5.6 Sol 自主重写并优化了他们的生产内核，端到端推理成本降了 20%。',
        '设计芯片。AlphaChip 从 2020 年起参与每一代 TPU 的布局：几个小时，而不是几周。',
        '发现算法。AlphaEvolve 找到 4×4 复数矩阵乘法的 48 次乘法解——上一项纪录是 1969 年的 49 次。',
        '做数学。Gemini Deep Think 在 2025 年国际数学奥林匹克拿下 35 / 42，金牌线，由 IMO 协调员正式评卷。',
        '做研究。弱到强泛化实验：智能体在 800 个累计小时里找回了 97% 的差距，用了约 1.8 万美元算力；两位人类研究员一周，23%。',
        '八个环节，全部有了可复现的样本。\n没有一项是完美的。但把它们放进同一张清单，只是这两年的事。\n这个环一旦闭合，改进 AI 的速度，就不再由人决定。',
      ],
      create(ctx) {
        const { gfx } = ctx;
        const ov = ctx.overlay();
        const ovH = ctx.overlay();
        const V = K.vec(ctx);
        const bgp = K.bg(ctx, { grid: 1, vig: 0.45 });
        const rt = gfx.target({});
        const rtP = gfx.target({});
        K.chrome(ctx, ov, { act: act1 });

        const arcs = [];
        const labs = [];
        const stages = [];
        for (let i = 0; i < N; i++) {
          const ln = V.line(48, { width: 9, color: HDR.dim, glow: 1, order: 10 });
          ln.gu.uAlpha.value = 0;
          ln.gu.uWidth.value = 60;
          const pts = [];
          for (let j = 0; j <= 40; j++) {
            const a = a0(i) + (a1(i) - a0(i)) * (j / 40);
            pts.push(CX + Math.cos(a) * R, CY + Math.sin(a) * R);
          }
          ln.set(pts);
          ln.draw(0);
          arcs.push({ ln, len: ln.len });
          labs.push(K.text(ctx, ov, D.LAB[i][0], 'songBold', { x: CX + Math.cos(am(i)) * (R + 64), y: CY + Math.sin(am(i)) * (R + 64), size: 34, align: 'center', valign: 'middle', color: T.dim }));
          stages.push({
            tag: K.text(ctx, ov, `${D.LAB[i][0]} · ${i + 1} / 8`, 'lab', { x: 146, y: 366 }),
            name: K.text(ctx, ov, D.LAB[i][1], 'h2', { x: 136, y: 420, size: 66, maxWidth: 700 }),
            meta: K.text(ctx, ov, `${D.LAB[i][2]} · ${D.LAB[i][3]}`, 'mono', { x: 146, y: 520, size: 24, color: T.dim }),
            desc: K.text(ctx, ov, D.LAB[i][4], 'lead', { x: 140, y: 580, size: 34, maxWidth: 680 }),
          });
        }
        const flow = V.dots(N * 2, { order: 12 });
        const halo = V.line(96, { width: 2.5, color: HDR.amber, glow: 1, order: 9 });
        {
          const c = [];
          for (let j = 0; j <= 95; j++) {
            const a = (j / 95) * Math.PI * 2;
            c.push(CX + Math.cos(a) * (R + 26), CY + Math.sin(a) * (R + 26));
          }
          halo.set(c);
          halo.draw(0);
          halo.gu.uWidth.value = 40;
        }
        const num = K.text(ctx, ovH, '', 'didot', { x: CX, y: CY - 22, size: 176, align: 'center', valign: 'middle', color: T.white });
        const numLab = K.text(ctx, ovH, '', 'mono', { x: CX, y: CY + 92, size: 24, align: 'center', valign: 'top', color: T.text, maxWidth: 430 });

        const head = K.text(ctx, ov, '让它变强的那份工作，\n它自己做了多少？', 'h1', { x: 136, y: 150, size: 84 });
        const headEnd = K.text(ctx, ov, '八个环节，全部有了样本。', 'h1', { x: 136, y: 150, size: 84 });
        const leadEnd = K.text(ctx, ov, '没有一项是完美的。但把它们放进同一张清单，\n只是这两年的事。\n这个环一旦闭合，改进 AI 的速度，就不再由人决定。', 'lead', { x: 140, y: 372, size: 36, maxWidth: 640 });
        const src = K.text(ctx, ov, '来源：Sakana AI · Anthropic · OpenAI · Google DeepMind（各自于 2024–2026 年公开披露）', 'monoS', { x: T.M, y: 1004, align: 'left', color: T.faint });

        let lastTxt = '';
        return {
          update(s) {
            const b = s.beat;
            const g = K.gate(s);
            let litCount = 0;
            arcs.forEach((a, i) => {
              const mb = i + 1;
              let p = 0;
              if (b > mb) p = 1;
              else if (b === mb) p = ease.io2(K.seg(s, b, 0.05, 0.4));
              a.ln.draw(a.len * p);
              a.ln.u.uColor.value.set(...K.lerp3(HDR.dim, HDR.emberHot, p));
              a.ln.gu.uAlpha.value = p * 0.22;
              a.ln.u.uAlpha.value = g * (b === 0 ? 0.5 + 0.5 * K.seg(s, 0, 0.1, 0.6) : 1);
              litCount += p > 0.98 ? 1 : 0;
              const lb = labs[i];
              lb.animate((gl, d) => {
                const f = p > 0.98 ? 1 : 0.6;
                d.r = gl.color[0] * f;
                d.g = gl.color[1] * f;
                d.b = gl.color[2] * f;
              });
              lb.alpha = g;
              lb.animate((gl, d) => {
                const f = p > 0.98 ? 1 : 0.6;
                d.r = gl.color[0] * f;
                d.g = gl.color[1] * f;
                d.b = gl.color[2] * f;
              });
              for (let j = 0; j < 2; j++) {
                const f = ((s.t * 0.22 + j * 0.5 + i * 0.13) % 1 + 1) % 1;
                const a2 = a0(i) + (a1(i) - a0(i)) * f;
                flow.set(i * 2 + j, CX + Math.cos(a2) * R, CY + Math.sin(a2) * R, 5.5, HDR.hot, p * g * (0.4 + 0.6 * Math.sin(f * Math.PI)), 0.4);
              }
            });
            flow.commit();

            const endP = b >= 9 ? K.seg(s, 9, 0.1, 0.8) : 0;
            halo.draw(halo.len * ease.io2(endP));
            halo.visible(endP > 0.001);
            halo.u.uAlpha.value = endP * (0.7 + 0.3 * Math.sin(s.t * 3.1));
            halo.gu.uAlpha.value = endP * 0.25;

            stages.forEach((st, i) => {
              const p = b === i + 1 ? K.seg(s, b, 0.08, 0.55) : 0;
              K.show(st.tag, p, 'fade');
              K.show(st.name, p, 'rise', 0.3);
              K.show(st.meta, p, 'fade');
              K.show(st.desc, K.seg(s, b, 0.3, 0.75) * (b === i + 1 ? 1 : 0), 'fade');
            });
            K.show(head, b < 9 ? g : 1 - K.seg(s, 9, 0, 0.15), 'blur', 0.4);
            K.show(headEnd, b >= 9 ? K.seg(s, 9, 0.15, 0.5) : 0, 'rise', 0.3);
            K.show(leadEnd, b >= 9 ? K.seg(s, 9, 0.45, 0.9) : 0, 'fade');
            K.show(src, g * 0.9, 'fade');

            const txt = `${b}`;
            if (txt !== lastTxt) {
              lastTxt = txt;
              num.set(b >= 1 && b <= 8 ? NUM[b - 1] : b >= 9 ? '8 / 8' : '');
              numLab.set(b >= 1 && b <= 8 ? NUMLAB[b - 1] : b >= 9 ? '个环节，全部有了可复现的样本' : '');
            }
            num.mesh.visible = b >= 1;
            numLab.mesh.visible = b >= 1;
            const np = b >= 1 && b <= 8 ? K.seg(s, b, 0.25, 0.6) : b >= 9 ? 1 : 0;
            num.alpha = np;
            num.animate((gl, d) => {
              const f = 1 + 1.3 * np;
              d.r = gl.color[0] * f;
              d.g = gl.color[1] * f;
              d.b = gl.color[2] * f;
            });
            K.show(numLab, b >= 1 && b <= 8 ? K.seg(s, b, 0.4, 0.75) : b >= 9 ? endP : 0, 'fade');
          },

          anchor() {
            return { x: CX, y: CY };
          },

          render(target, s) {
            bgp.render(rt, s.t, true);
            ovH.render(rt);
            V.render(rt);
            K.post(ctx, rt, rtP, { bloom: 0.5, grain: 0.018, exposure: 1.25, vignette: 0.45, time: s.t });
            gfx.copy(rtP, target);
            ov.render(target);
          },
        };
      },
    });
  })();

  // ===========================================================================
  // S7 · k — criticality, as a thing you can put your hand on
  // ===========================================================================
  (() => {
    const COLS = 46, ROWS = 26, PITCH = 40, OX = 40, OY = 40;
    const NC = COLS * ROWS;
    const KX0 = 146, KX1 = 1090;
    const fmtK = (k) => (k < 1 ? k.toFixed(2) : k.toFixed(1));

    K.scene({
      id: 'critical',
      title: '临界 k',
      enterWith: 'burn',
      beats: [
        { dur: 3.6, hold: 3.4 },
        { dur: 6.0, hold: 4 },
        { dur: 6.0, hold: 4 },
        { dur: 7.0, hold: 30 },
        { dur: 4.0, hold: 7 },
      ],
      thumbBeat: 3,
      notes: [
        '核物理里有个数，叫 k：一次裂变，平均点燃几次新的裂变。\n把每个点想成一个待解决的问题。这一页，整个屏幕就是一堆等待被点燃的问题。',
        'k 小于 1：每一代点燃的，比上一代少。火会熄。\n人类文明的大多数时候都是这样：每一代人，都得把火重新点一遍。',
        'k 等于 1：刚好自持。不灭，也不长大。\n这是一台乖乖运转的反应堆。也是一家还没开始让 AI 做研究的实验室。',
        '（把鼠标往右移，把 k 推过 1。可以来回玩。）\n过线之前，一切都很慢。过线之后，没有「慢慢来」这回事。',
        '那么今天，AI 研究里的 k 是多少？没人知道那个数。\n只知道：上一页那八个环节，每点亮一个，k 就大一点。',
      ],
      create(ctx) {
        const { gfx } = ctx;
        const ov = ctx.overlay();
        const V = K.vec(ctx);
        const bgp = K.bg(ctx, { grid: 0, vig: 0.5 });
        const rt = gfx.target({});
        const rt2 = gfx.target({});
        const rtP = gfx.target({});
        K.chrome(ctx, ov, { act: act2 });

        const scrim = K.pass(
          ctx,
          `
uniform sampler2D tA;
uniform float uA;
void main(){
  vec3 c = texture(tA, vUv).rgb;
  vec2 s = stage();
  c *= 1.0 - uA * (1.0 - smoothstep(560.0, 1200.0, s.x));
  o = vec4(c, 1.0);
}`,
          { tA: null, uA: 0.985 }
        );

        const state = new Uint8Array(NC);
        const age = new Float32Array(NC);
        const rst = new Float32Array(NC);
        const emitted = new Uint8Array(NC);
        const rnd = M.rng(777);
        let neutrons = [];
        let k = 0.5;
        let idleT = 0;
        let burn = 0;

        const ignite = (i) => {
          if (state[i] !== 0) return;
          state[i] = 1;
          age[i] = 0;
          emitted[i] = 0;
        };
        const step = (dt, kk) => {
          const toAdd = [];
          burn = 0;
          for (let i = 0; i < NC; i++) {
            const st = state[i];
            if (st === 1) {
              burn++;
              age[i] += dt;
              if (!emitted[i] && age[i] >= 0.1) {
                emitted[i] = 1;
                const whole = Math.floor(kk);
                let count = kk >= 1 ? whole + (rnd() < kk - whole ? 1 : 0) : rnd() < kk ? 1 : 0;
                const cx = i % COLS;
                const cy = (i / COLS) | 0;
                while (count-- > 0 && neutrons.length + toAdd.length < 2600) {
                  const d = 3 + (rnd() * 4) | 0;
                  const a = rnd() * Math.PI * 2;
                  const tx = (((cx + Math.round(Math.cos(a) * d)) % COLS) + COLS) % COLS;
                  const ty = (((cy + Math.round(Math.sin(a) * d)) % ROWS) + ROWS) % ROWS;
                  toAdd.push({ x: cx, y: cy, tx, ty, i: ty * COLS + tx, t: 0, dur: 0.22 + rnd() * 0.1 });
                }
              }
              if (age[i] >= 0.55) {
                state[i] = 2;
                age[i] = 0;
                rst[i] = 0.9 + rnd() * 1.1;
              }
            } else if (st === 2) {
              age[i] += dt;
              if (age[i] >= rst[i]) state[i] = 0;
            }
          }
          neutrons.push(...toAdd);
          const keep = [];
          for (const n of neutrons) {
            n.t += dt;
            if (n.t >= n.dur) ignite(n.i);
            else keep.push(n);
          }
          neutrons = keep;
          if (burn === 0 && neutrons.length === 0) {
            idleT += dt;
            if (idleT > 0.5) {
              idleT = 0;
              for (let tries = 0; tries < 20; tries++) {
                const i = (rnd() * NC) | 0;
                if (state[i] === 0) {
                  ignite(i);
                  break;
                }
              }
            }
          } else idleT = 0;
        };

        const cells = V.dots(NC, { order: 10 });
        const sparks = V.dots(5200, { order: 12 });
        const track = V.line(2, { width: 2, color: HDR.dim, order: 6 });
        track.set([KX0, 724, KX1, 724]);
        const one = V.line(2, { width: 2, color: HDR.ember, glow: 1, order: 8 });
        one.set([(KX0 + KX1) / 2 - 150, 704, (KX0 + KX1) / 2 - 150, 744]);
        const kmark = V.dots(2, { order: 9 });

        const head = K.text(ctx, ov, '把每个点，想成一个待解决的问题。', 'h1', { x: 136, y: 150, size: 80 });
        const heads = [
          'k < 1：火会熄。',
          'k = 1：刚好自持。',
          'k > 1：没有人能叫停。',
          '今天，AI 研究里的 k 是多少？',
        ].map((t) => K.text(ctx, ov, t, 'h1', { x: 136, y: 150, size: 80 }));
        const lead = K.text(ctx, ov, '一次「裂变」，会点燃几个新的？\n这个数字，叫 k。', 'lead', { x: 140, y: 292, maxWidth: 820, size: 32 });
        const leads = [
          '每一代点燃的，比上一代少。\n人类文明的大多数时候都是这样：每一代人，都得把火重新点一遍。',
          '不灭。也不长大。\n这是一台乖乖运转的反应堆。也是一家还没让 AI 做研究的实验室。',
          '把鼠标往右移，把 k 推过 1。\n过线之前，一切都很慢。过线之后，没有「慢慢来」这回事。',
          '没人知道那个数。\n只知道：上一页那八个环节，每点亮一个，k 就大一点。',
        ].map((t) => K.text(ctx, ov, t, 'lead', { x: 140, y: 292, maxWidth: 820, size: 32 }));
        const kLab = K.text(ctx, ov, 'k', 'lab', { x: 150, y: 454, size: 30 });
        const kVal = K.text(ctx, ov, '0.50', 'didot', { x: 130, y: 480, size: 172, leading: 1.0 });
        const zones = ['k < 1   熄灭', 'k = 1   自持', 'k > 1   失控'].map((t, i) => K.text(ctx, ov, t, 'mono', { x: KX0 + i * 314, y: 762, size: 26, color: T.faint }));
        const hint = K.text(ctx, ov, '← 移动鼠标，调节 k →', 'monoS', { x: (KX0 + KX1) / 2, y: 818, align: 'center', color: T.faint });

        let lastZone = -1;
        return {
          update(s) {
            const b = s.beat;
            const g = K.gate(s);
            const [mx] = K.mouseStage(ctx);
            let kt = 0.5;
            if (b === 1) kt = 0.5;
            else if (b === 2) kt = 1.0;
            else if (b >= 3) kt = lerp(0.2, 2.6, clamp((mx - KX0) / (KX1 - KX0), 0, 1));
            k += (kt - k) * M.damp(9, s.dt);
            if (b === 0) {
              k = 0.5;
            } else if (s.dt > 0) step(Math.min(s.dt, 0.05), k);
            ctx.audio.param('tension', clamp(k / 2.6, 0, 1));
            ctx.audio.param('speed', clamp(burn / 260, 0, 1));

            for (let i = 0; i < NC; i++) {
              const x = OX + (i % COLS) * PITCH + PITCH / 2;
              const y = OY + ((i / COLS) | 0) * PITCH + PITCH / 2;
              const st = state[i];
              if (st === 1) {
                const a = clamp(age[i] / 0.55, 0, 1);
                cells.set(i, x, y, 5 + 13 * (1 - a) * (1 - a), HDR.emberHot, (1 - a * 0.6) * g, 0.35);
              } else if (st === 2) {
                const c = clamp(age[i] / rst[i], 0, 1);
                cells.set(i, x, y, 3.6, HDR.ember, (1 - c) * 0.7 * g, 0.4);
              } else {
                cells.set(i, x, y, 1.7, HDR.cold, 0.3 * g, 0);
              }
            }
            cells.commit();
            let n = 0;
            for (const nt of neutrons) {
              if (n >= 5198) break;
              const f = nt.t / nt.dur;
              const x = OX + lerp(nt.x, nt.tx, f) * PITCH + PITCH / 2;
              const y = OY + lerp(nt.y, nt.ty, f) * PITCH + PITCH / 2;
              const x2 = OX + lerp(nt.x, nt.tx, Math.max(0, f - 0.14)) * PITCH + PITCH / 2;
              const y2 = OY + lerp(nt.y, nt.ty, Math.max(0, f - 0.14)) * PITCH + PITCH / 2;
              sparks.set(n++, x, y, 2.4, HDR.hot, 0.95 * g, 0.5);
              sparks.set(n++, x2, y2, 3.4, HDR.amber, 0.35 * g, 1);
            }
            for (let i = n; i < 5200; i++) sparks.set(i, 0, 0, 0, HDR.hot, 0, 0);
            sparks.commit();

            const kx = KX0 + clamp((k - 0.2) / 2.4, 0, 1) * (KX1 - KX0);
            kmark.set(0, kx, 724, 9, HDR.hot, b >= 3 ? g : g * 0.6, 0.3);
            kmark.set(1, kx, 724, 26, HDR.ember, b >= 3 ? 0.5 * g : 0.25 * g, 1);
            kmark.commit();
            track.u.uAlpha.value = g * (b === 0 ? 0 : 0.9);
            one.u.uAlpha.value = g * (b === 0 ? 0 : 0.8 + 0.4 * Math.sin(s.t * 3));
            one.gu.uAlpha.value = g * (b === 0 ? 0 : 0.3);

            K.show(head, b === 0 ? g : 1 - K.seg(s, 1, 0, 0.1), 'blur', 0.4);
            heads.forEach((hb, i) => K.show(hb, b === i + 1 ? K.seg(s, b, 0.02, 0.25) : b === i + 2 ? 1 - K.seg(s, b, 0, 0.1) : 0, 'rise', 0.3));
            K.show(lead, b === 0 ? K.seg(s, 0, 0.3, 0.8) * g : b === 1 ? 1 - K.seg(s, 1, 0, 0.1) : 0, 'fade');
            leads.forEach((lb, i) => K.show(lb, b === i + 1 ? K.seg(s, b, 0.22, 0.55) : b === i + 2 ? 1 - K.seg(s, b, 0, 0.1) : 0, 'fade'));
            K.show(kLab, b >= 1 ? K.seg(s, 1, 0.1, 0.4) : 0, 'fade');
            K.show(kVal, b >= 1 ? 1 : 0, 'fade');
            const txt = b === 0 ? '' : fmtK(k);
            if (kVal.text !== txt) kVal.set(txt);
            const zone = k < 0.97 ? 0 : k <= 1.03 ? 1 : 2;
            if (zone !== lastZone && K.live(s) && b >= 1) ctx.sfx(zone === 2 ? 'riser' : zone === 1 ? 'chime' : 'tick', { gain: 0.5 });
            lastZone = zone;
            zones.forEach((zb, i) => {
              const on = i === zone && b >= 1;
              if (zb._on !== on) {
                zb._on = on;
                zb.style({ color: on ? T.white : T.faint });
              }
              zb.alpha = b >= 1 ? 1 : 0;
              zb.animate(() => {});
            });
            K.show(hint, b >= 3 ? K.seg(s, 3, 0.2, 0.6) : 0, 'fade');
            if (burn > 0 && K.live(s) && burn < 40 && s.t % 0.12 < s.dt) ctx.sfx('tick', { gain: 0.25, pitch: 1.4 + rnd() * 0.6 });
          },

          anchor() {
            return { x: 1090, y: 560 };
          },

          render(target, s) {
            bgp.render(rt, s.t, true);
            V.render(rt);
            scrim.u.tA.value = rt.texture;
            scrim.u.uA.value = 0.985 * K.seg(s, 0, 0.1, 0.6);
            scrim.render(rt2);
            K.post(ctx, rt2, rtP, { bloom: 0.55, grain: 0.018, exposure: 1.3, vignette: 0.45, time: s.t });
            gfx.copy(rtP, target);
            ov.render(target);
          },
        };
      },
    });
  })();

  // ===========================================================================
  // S8 · 1965 — the idea is old; the dates are what moved
  // ===========================================================================
  (() => {
    const TL = [['1951', '图灵'], ['1960', '维纳'], ['1965', '古德'], ['1993', '文奇'], ['2001', '库兹韦尔'], ['2024', '阿莫迪'], ['今天', '']];
    const AX0 = 240, AX1 = 1380, AY = 680;
    const YX = (y) => AX0 + ((y - 2025) / 45) * (AX1 - AX0);

    K.scene({
      id: 'good',
      title: '1965 · 智能爆炸',
      enterWith: 'rewind',
      beats: [
        { dur: 5.0, hold: 4 },
        { dur: 6.0, hold: 5 },
        { dur: 4.6, hold: 4.5 },
        { dur: 6.4, hold: 5 },
        { dur: 6.0, hold: 8 },
      ],
      thumbBeat: 1,
      notes: [
        '这不是一个新想法。1951 年，图灵在 BBC 的广播里就说：到了某个阶段，我们只能预期机器接管控制。',
        '1965 年，统计学家 I. J. 古德，把它写成了四句话。「智能爆炸」这个词，就从这里来。\n（慢慢念。念到最后一句停一下。）',
        '1993 年，科幻作家兼数学教授文奇，给它起了一个更出名的名字：技术奇点。「此后不久，人类时代将会结束。」',
        '说回现在。AI Impacts 每年调查上千名 AI 研究者：50% 概率出现「高级机器智能」是哪一年？2016 年说 2061，2023 年说 2047，2024 年说 2042。\n每过一年，日期提前 3.4 年。而造模型的那几个人，说的是 2026 到 2030。',
        '你可以说：1970 年明斯基也说过「三到八年」，然后错了半个世纪。对。\n区别是：1970 年没有曲线，只有信念。今天有三条线，都是测出来的。它们可能在明天弯掉。但到目前为止，每一年，都是预测在追着现实跑。',
      ],
      create(ctx) {
        const { gfx } = ctx;
        const ov = ctx.overlay();
        const ovH = ctx.overlay();
        const V = K.vec(ctx);
        const bgp = K.bg(ctx, { grid: 1, vig: 0.5 });
        const rt = gfx.target({});
        const rtP = gfx.target({});
        K.chrome(ctx, ov, { act: act2 });

        const quotes = ['turing', 'good', 'vinge'].map((key, i) => {
          const q = D.QUOTES[key];
          const head = K.text(ctx, ov, `${q.who} · ${q.when}`, 'lab', { x: 146, y: 150, size: 28 });
          const zh = K.text(ctx, ov, q.zh, 'quote', { x: 140, y: 246, size: i === 1 ? 46 : 50, maxWidth: 1040, color: T.white });
          const en = K.text(ctx, ov, `${q.en}\n— ${q.src}`, 'monoS', { x: 144, y: 0, maxWidth: 1040, color: T.faint, size: 19 });
          return { q, head, zh, en };
        });

        // right-hand timeline
        const spine = V.line(2, { width: 1.5, color: HDR.dim, order: 4 });
        spine.set([1332, 236, 1332, 884]);
        let fcBarLab;
        const tl = TL.map(([y, name], j) => ({
          year: K.text(ctx, ov, y, 'didot', { x: 1368, y: 236 + j * 98, size: 44, color: T.dim }),
          name: K.text(ctx, ov, name, 'text', { x: 1372, y: 284 + j * 98, size: 24, color: T.dim }),
          dot: j,
        }));
        const dots = V.dots(24, { order: 12 });

        // B3 · survey dates sliding left
        const axis = V.line(4, { width: 1.5, color: HDR.dim, order: 4 });
        axis.set([AX0 - 50, AY, AX1 + 50, AY]);
        const ticks = [];
        for (let y = 2025; y <= 2070; y += 5) ticks.push(K.text(ctx, ov, String(y), 'monoS', { x: YX(y), y: AY + 14, size: 19, align: 'center', valign: 'top', color: T.faint }));
        const survey = D.SURVEY.map(([sy, py]) => ({
          sy, py,
          top: K.text(ctx, ov, `${sy} 年的调查`, 'mono', { x: YX(py), y: AY - (D.SURVEY.findIndex((r) => r[1] === py) % 2 ? 226 : 136), size: 22, align: 'center', valign: 'bottom', color: T.dim }),
          big: K.text(ctx, ov, String(py), 'didot', { x: YX(py), y: AY + (D.SURVEY.findIndex((r) => r[1] === py) % 2 ? 176 : 76), size: 76, align: 'center', valign: 'top', color: T.white }),
        }));
        const sline = V.line(6, { width: 3, color: HDR.ember, glow: 1, order: 9 });
        const nowLine = V.line(2, { width: 1.5, color: HDR.cold, order: 5 });
        nowLine.set([YX(D.NOW), AY - 190, YX(D.NOW), AY + 30]);
        const nowLab = K.text(ctx, ov, '今天', 'monoMed', { x: YX(D.NOW), y: AY - 204, size: 20, color: T.cold, align: 'center', valign: 'bottom' });
        const fc = D.FORECASTS.map(([who, when, py, q], i) => ({
          py, when,
          lab: K.text(ctx, ov, `${who} · ${when}\n「${q}」`, 'mono', { x: T.R, y: 440 + i * 84, size: 22, align: 'right', leading: 1.5, color: T.text }),
        }));
        const fcLab = K.text(ctx, ov, '造模型的人怎么说', 'lab', { x: T.R, y: 392, align: 'right' });
        const fcBar = V.line(2, { width: 8, color: HDR.ember, glow: 1, order: 9 });
        fcBar.set([YX(2026.5), AY, YX(2033.2), AY]);
        fcBarLab = K.text(ctx, ov, '他们说的年份', 'monoMed', { x: YX(2030), y: AY - 22, size: 22, align: 'center', valign: 'bottom', color: T.ember });

        const h3 = [
          '每一次新调查，日期都更早。',
          '然后错了半个世纪。',
          '为什么这次不一样？',
        ].map((t) => K.text(ctx, ov, t, 'h1', { x: 136, y: 150, size: 84 }));
        const l3 = K.text(ctx, ov, '1,580 位 AI 研究者的中位预测：50% 概率出现「高级机器智能」的年份。\n每过一年，预计日期提前 3.4 年。', 'lead', { x: 140, y: 272, maxWidth: 1040, size: 32 });
        const minsky = K.text(ctx, ov, D.QUOTES.minsky.zh, 'quote', { x: 140, y: 470, size: 58, maxWidth: 1040, color: T.white });
        const minskyBy = K.text(ctx, ov, `— ${D.QUOTES.minsky.who} · ${D.QUOTES.minsky.when} · ${D.QUOTES.minsky.src}`, 'mono', { x: 146, y: 640, size: 24, color: T.ember });
        const answer = K.text(ctx, ov, '因为 1970 年没有曲线，只有信念。\n今天有三条线，都是测出来的：算力、价格、任务时长。\n它们可能在明天弯掉。但到目前为止，每一年，都是预测在追着现实跑。', 'lead', { x: 140, y: 300, maxWidth: 1040, size: 36 });
        const spark = ['算力', '价格', '时长'].map((t, i) => {
          const x = 150 + i * 330;
          const ln = V.line(4, { width: 4, color: HDR.ember, glow: 1, order: 10 });
          ln.set([x, 700, x + 120, 650, x + 190, 590, x + 250, 500]);
          return { ln, lab: K.text(ctx, ov, t, 'monoMed', { x, y: 720, size: 26, color: T.text }) };
        });
        const src = K.text(ctx, ov, '来源：AI Impacts《全球 AI 研究者调查》（2024 年执行，n = 1,580）· Metaculus · 各人公开表态', 'monoS', { x: T.M, y: 1004, align: 'left', color: T.faint });

        const cumSv = [0];
        for (let j = 1; j < survey.length; j++) cumSv.push(cumSv[j - 1] + Math.abs(YX(survey[j].py) - YX(survey[j - 1].py)));
        const activeOf = (b) => (b === 0 ? 0 : b === 1 ? 2 : b === 2 ? 3 : 6);

        return {
          update(s) {
            const b = s.beat;
            const g = K.gate(s);
            const showQ = b <= 2;
            quotes.forEach((qq, i) => {
              const p = b === i ? ease.lin(K.seg(s, b, 0.04, 0.62)) * g : 0;
              K.show(qq.head, b === i ? K.seg(s, b, 0.0, 0.2) * g : 0, 'fade');
              K.show(qq.zh, b === i ? p : 0, 'type', 0.96, 'word');
              qq.en.y = qq.zh.y + qq.zh.height + 40;
              K.show(qq.en, b === i ? K.seg(s, b, 0.6, 0.95) : 0, 'fade');
            });
            spine.u.uAlpha.value = showQ ? g : g * (1 - K.seg(s, 3, 0, 0.2));
            spine.visible(b < 4);
            tl.forEach((t, j) => {
              const on = showQ && j === activeOf(b);
              const vis = b < 3 ? g : 0;
              K.show(t.year, vis, 'fade');
              K.show(t.name, vis, 'fade');
              if (t._on !== on) {
                t._on = on;
                t.year.style({ color: on ? T.ember : T.dim });
              }
              dots.set(j, 1332, 258 + j * 98, on ? 8 : 4.5, on ? HDR.emberHot : HDR.dim, vis * (on ? 1 : 0.7), on ? 0.4 : 0);
            });

            const a3 = b >= 3 ? K.seg(s, 3, 0, 0.25) * g : 0;
            axis.u.uAlpha.value = a3 * (b === 3 ? 1 : 0);
            axis.visible(b === 3);
            ticks.forEach((t) => K.show(t, b === 3 ? a3 : 0, 'fade'));
            let last = null;
            survey.forEach((sv, j) => {
              const p = b === 3 ? K.seg(s, 3, 0.08 + j * 0.13, 0.26 + j * 0.13) : 0;
              K.show(sv.top, p, 'fade');
              K.show(sv.big, p, 'blur', 0.3);
              if (p > 0) last = sv;
            });
            {
              const f = b === 3 ? clamp(K.seg(s, 3, 0.08, 0.65) * (survey.length - 1), 0, survey.length - 1) : 0;
              const whole = Math.min(survey.length - 2, Math.floor(f));
              sline.visible(b === 3 && f > 0.01);
              sline.set(survey.map((sv) => [YX(sv.py), AY]).flat());
              sline.draw(cumSv[whole] + (cumSv[whole + 1] - cumSv[whole]) * (f - whole));
              survey.forEach((sv, j) => {
                const p = b === 3 ? K.seg(s, 3, 0.08 + j * 0.13, 0.26 + j * 0.13) : 0;
                dots.set(8 + j, YX(sv.py), AY, 9, HDR.emberHot, p * (b === 3 ? 1 : 0), 0.3);
              });
            }
            nowLine.u.uAlpha.value = a3;
            K.show(nowLab, a3, 'fade');
            fc.forEach((f, i) => {
              const p = b === 3 ? K.seg(s, 3, 0.62 + i * 0.06, 0.82 + i * 0.06) : 0;
              K.show(f.lab, p, 'fade');
              dots.set(12 + i, 0, 0, 0, HDR.cold, 0, 0);
            });
            const fb = b === 3 ? ease.io2(K.seg(s, 3, 0.52, 0.75)) : 0;
            fcBar.draw(fcBar.len * fb);
            fcBar.visible(fb > 0.01);
            fcBar.gu.uAlpha.value = 0.2;
            K.show(fcLab, b === 3 ? K.seg(s, 3, 0.56, 0.75) : 0, 'fade');
            K.show(fcBarLab, b === 3 ? K.seg(s, 3, 0.6, 0.8) : 0, 'fade');
            dots.commit();

            h3.forEach((hb, i) => {
              let p = 0;
              if (i === 0) p = b === 3 ? K.seg(s, 3, 0.02, 0.22) : 0;
              else if (i === 1) p = b === 4 ? K.seg(s, 4, 0.3, 0.5) : 0;
              else p = b === 4 ? K.seg(s, 4, 0.55, 0.8) : 0;
              K.show(hb, p, 'rise', 0.3);
            });
            K.show(l3, b === 3 ? K.seg(s, 3, 0.15, 0.45) : 0, 'fade');
            const q4 = b === 4 ? ease.lin(K.seg(s, 4, 0.02, 0.3)) : 0;
            K.show(minsky, q4 > 0 && s.p[4] < 0.52 ? q4 : 0, 'type', 0.96, 'word');
            K.show(minskyBy, b === 4 ? K.seg(s, 4, 0.28, 0.42) * (1 - K.seg(s, 4, 0.5, 0.58)) : 0, 'fade');
            const an = b === 4 ? K.seg(s, 4, 0.58, 0.86) : 0;
            K.show(answer, an, 'fade');
            spark.forEach((sp, i) => {
              const p = b === 4 ? ease.io2(K.seg(s, 4, 0.74 + i * 0.04, 0.95 + i * 0.04)) : 0;
              sp.ln.draw(sp.ln.len * p);
              sp.ln.visible(p > 0.01);
              K.show(sp.lab, b === 4 ? K.seg(s, 4, 0.72 + i * 0.04, 0.86 + i * 0.04) : 0, 'fade');
            });
            K.show(src, g * 0.9, 'fade');
          },

          anchor() {
            return { x: 640, y: 520 };
          },

          render(target, s) {
            bgp.render(rt, s.t, true);
            ovH.render(rt);
            V.render(rt);
            K.post(ctx, rt, rtP, { bloom: 0.4, grain: 0.02, exposure: 1.25, vignette: 0.5, time: s.t });
            gfx.copy(rtP, target);
            ov.render(target);
          },
        };
      },
    });
  })();

  // ===========================================================================
  // S9 · 时间 — generations arrive faster and faster, and the series has an end
  // ===========================================================================
  (() => {
    const AX0 = 250, AX1 = 1590, AY = 610, G = 14;
    const xOf = (tau) => AX0 + (tau / 2) * (AX1 - AX0);
    const tauOf = (n) => 2 * (1 - Math.pow(2, -n));
    const GAP = ['2 年', '1 年', '6 个月'];
    const ROWS = D.ZENO;

    K.scene({
      id: 'zeno',
      title: '时间',
      enterWith: 'zeno',
      beats: [
        { dur: 7.6, hold: 3.4 },
        { dur: 4.4, hold: 4 },
        { dur: 6.6, hold: 5 },
        { dur: 5.0, hold: 8 },
      ],
      thumbBeat: 1,
      notes: [
        '智能爆炸的机制，一句话：每一代，帮忙造出下一代。\n所以每一代，都比上一代来得更快。注意屏幕上这些柱子出现的节奏：第一代到第二代，两年。然后一年。然后半年。',
        '这个序列有一个终点。无限多代，塞进有限的时间里。\n数学上，这叫「奇点」。不是玄学，是等比数列求和。',
        '做个算术。如果「进步的速度」每年翻一倍——注意，这还不到算力过去十四年的速度——那么 20 世纪那一百年的进步：七年后，九个月一次。十年后，三十六天一次。十六年后，每 13.4 个小时一次。\n这不是预言，是除法。唯一的前提是：翻倍，不停。',
        '库兹韦尔在 2001 年写下这句话的时候，所有人都笑了。\n他没说的是：两万年，也是线性外推。',
      ],
      create(ctx) {
        const { gfx } = ctx;
        const ov = ctx.overlay();
        const ovH = ctx.overlay();
        const V = K.vec(ctx);
        const bgp = K.bg(ctx, { grid: 1, vig: 0.45 });
        const rt = gfx.target({});
        const rtP = gfx.target({});
        K.chrome(ctx, ov, { act: act2 });

        const axis = V.line(4, { width: 1.5, color: HDR.dim, order: 4 });
        axis.set([AX0 - 60, AY, AX1 + 70, AY]);
        const bars = V.rects(G, { order: 8 });
        const headsB = V.dots(G, { order: 9 });
        const genLab = [0, 1, 2, 3].map((n) => K.text(ctx, ov, `第 ${n + 1} 代`, 'mono', { x: xOf(tauOf(n)), y: AY - 176, size: 24, align: 'center', valign: 'bottom', color: T.text }));
        const gapLab = GAP.map((t, n) => K.text(ctx, ov, t, 'mono', { x: (xOf(tauOf(n)) + xOf(tauOf(n + 1))) / 2, y: AY + 22, size: 24, align: 'center', valign: 'top', color: T.ember }));
        const gapMore = K.text(ctx, ov, '3 个月 · 6 周 · 3 周 · 10 天 · 5 天 …', 'mono', { x: AX1 - 210, y: AY + 68, size: 22, align: 'center', valign: 'top', color: T.dim });
        const moreLab = K.text(ctx, ovH, '第 4 代 … 第 14 代', 'mono', { x: AX1 - 120, y: AY - 196, size: 22, align: 'center', valign: 'bottom', color: T.text });
        const wall = V.line(2, { width: 5, color: HDR.hot, glow: 1, order: 11 });
        const wallLab = K.text(ctx, ovH, '无限多代', 'songBlack', { x: AX1 + 34, y: AY - 250, size: 60, color: T.white });
        const wallLab2 = K.text(ctx, ovH, '有限的时间', 'songBlack', { x: AX1 + 34, y: AY + 196, size: 60, color: T.white });
        const startLab = K.text(ctx, ovH, '第 1 代', 'songBold', { x: AX0 - 20, y: AY + 196, size: 40, align: 'center', color: T.text });

        const heads = ['每一代，帮忙造出下一代。', '这个序列有一个终点。', '十六年后，每 13.4 小时，\n重演一次二十世纪。', '两万年。'];
        const hN = [0, 1, 2, 3].map((i) => K.text(ctx, ov, heads[i], 'h1', { x: 136, y: 150, size: i === 2 ? 72 : 84, maxWidth: 1500 }));
        const leads = [
          '于是每一代，都比上一代来得更快。\n看柱子出现的节奏。',
          '无限多代，塞进有限的时间里。\n数学家管这个叫「奇点」。就是这个意思，没有更玄的。',
          '前提只有一个：进步的速度，每年翻一倍。\n二十世纪 = 100 年的进步。同一个一百年的量，之后需要——',
          '',
        ].map((t, i) => K.text(ctx, ov, t, 'lead', { x: 140, y: i === 2 ? 356 : 272, maxWidth: 1500, size: 32 }));
        const rowLab = ROWS.map(([yr, span], i) => ({
          when: K.text(ctx, ov, yr === 0 ? '今天' : `${yr} 年后`, 'text', { x: 400, y: 0, size: 34, align: 'right', valign: 'middle', color: i === ROWS.length - 1 ? T.white : T.text }),
          span: K.text(ctx, ov, span, 'songBlack', { x: 1560, y: 0, size: i === ROWS.length - 1 ? 72 : 50, align: 'right', valign: 'middle', color: i === ROWS.length - 1 ? T.amber : T.white }),
        }));
        const rowBars = V.rects(ROWS.length, { order: 8 });
        const rowCap = K.text(ctx, ov, '一个世纪的进步，之后需要——', 'mono', { x: 1560, y: 452, size: 24, color: T.dim, align: 'right' });
        const quote = K.text(ctx, ov, D.QUOTES.kurzweil.zh, 'quote', { x: 140, y: 330, size: 56, maxWidth: 1560, color: T.white });
        const quoteBy = K.text(ctx, ov, `— 雷 · 库兹韦尔 · 2001 · 《加速回报定律》`, 'mono', { x: 146, y: 0, size: 24, color: T.ember });
        const quoteTail = K.text(ctx, ov, '当时，所有人都笑了。', 'lead', { x: 140, y: 0, size: 40, color: T.text });

        let lit = new Array(G).fill(false);
        const axis2 = V.line(2, { width: 1.5, color: HDR.faint, order: 4 });

        return {
          update(s) {
            const b = s.beat;
            const g = K.gate(s);
            const showT = b <= 1;
            axis.u.uAlpha.value = showT ? g * K.seg(s, 0, 0.05, 0.4) : 0;
            axis.visible(showT);
            const tau = b === 0 ? 2 * (s.p[0] || 0) * (1 - Math.pow(2, -(G - 1))) : 2;
            for (let n = 0; n < G; n++) {
              const tn = tauOf(n);
              const on = b >= 1 || tau >= tn - 1e-9;
              if (on && !lit[n] && K.live(s)) {
                ctx.sfx(n < 3 ? 'thud' : 'tick', { gain: 0.6 + n * 0.03, pitch: 0.7 + n * 0.07 });
              }
                lit[n] = on;
              const x = xOf(tn);
              const e = b === 0 ? clamp((tau - tn) / 0.06, 0, 1) : 1;
              const h = 150 * ease.out3(e);
              const heat = clamp(n / 9, 0, 1);
              const col = K.lerp3(HDR.white, HDR.emberHot, heat);
              bars.set(n, x - 7, AY - h, 14, h, col, showT ? g : 0, 0, 0);
              headsB.set(n, x, AY - h, 6 + 3 * heat, col, showT ? g * e : 0, 0.4);
            }
            bars.commit();
            headsB.commit();
            genLab.forEach((lb, n) => K.show(lb, b === 0 ? clamp((tau - tauOf(n)) / 0.05, 0, 1) * g * (b <= 1 ? 1 : 0) : 0, 'fade'));
            gapLab.forEach((lb, n) => K.show(lb, b === 0 ? clamp((tau - tauOf(n + 1)) / 0.05, 0, 1) * g : 0, 'fade'));
            K.show(gapMore, b === 0 ? clamp((tau - tauOf(5)) / 0.05, 0, 1) * g : 0, 'fade');
            K.show(moreLab, b === 1 ? K.seg(s, 1, 0.1, 0.4) : 0, 'fade');
            K.show(startLab, showT ? g : 0, 'fade');

            const w = b === 1 ? ease.io2(K.seg(s, 1, 0.05, 0.55)) : b >= 2 ? 1 - K.seg(s, 2, 0, 0.14) : 0;
            wall.set([AX1, lerp(AY, 300, w), AX1, lerp(AY, 900, w)]);
            wall.draw(wall.len * w);
            wall.visible(w > 0.001);
            wall.u.uAlpha.value = w * (0.85 + 0.15 * Math.sin(s.t * 5));
            wall.gu.uAlpha.value = w * 0.5;
            K.show(wallLab, b === 1 ? K.seg(s, 1, 0.35, 0.7) : 0, 'blur', 0.3);
            K.show(wallLab2, b === 1 ? K.seg(s, 1, 0.45, 0.8) : 0, 'blur', 0.3);

            hN.forEach((hb, i) => {
              let p = 0;
              if (i === b) p = i === 0 ? K.gate(s, 0.2, 0.7) : K.seg(s, b, 0.02, 0.2);
              else if (i === b - 1) p = 1 - K.seg(s, b, 0, 0.1);
              K.show(hb, p, 'rise', 0.3);
            });
            leads.forEach((lb, i) => {
              let p = 0;
              if (i === b) p = i === 0 ? K.seg(s, 0, 0.25, 0.7) * g : i === 3 ? 0 : K.seg(s, b, 0.2, 0.5);
              else if (i === b - 1) p = 1 - K.seg(s, b, 0, 0.1);
              K.show(lb, p, 'fade');
            });

            const q = b >= 2 ? K.seg(s, 2, 0.1, 0.4) : 0;
            K.show(rowCap, b === 2 ? q : 0, 'fade');
            axis2.u.uAlpha.value = b === 2 ? q * 0.9 : 0;
            axis2.visible(b === 2);
            ROWS.forEach(([yr, , span], i) => {
              const e = b === 2 ? ease.out3(K.seg(s, 2, 0.22 + i * 0.11, 0.5 + i * 0.11)) : 0;
              const y = 530 + i * 84;
              const len = (1080 / (1 + Math.log10(100 / span) * 2.2)) * e;
              rowLab[i].when.y = y;
              rowLab[i].span.y = y - 6;
              rowBars.set(i, 440, y - 11, len, 22, i === ROWS.length - 1 ? HDR.amber : HDR.dim, b === 2 ? e : 0, 0, 0);
              K.show(rowLab[i].when, b === 2 ? e : 0, 'fade');
              K.show(rowLab[i].span, b === 2 ? e : 0, 'fade');
              if (e > 0 && rowLab[i]._e === 0 && K.live(s)) ctx.sfx('tick', { gain: 0.5, pitch: 0.9 + i * 0.1 });
              rowLab[i]._e = e;
            });
            rowBars.commit();

            const q4 = b >= 3 ? ease.lin(K.seg(s, 3, 0.02, 0.5)) : 0;
            K.show(quote, q4, 'type', 0.96, 'word');
            quoteBy.y = quote.y + quote.height + 30;
            quoteTail.y = quoteBy.y + 84;
            K.show(quoteBy, b >= 3 ? K.seg(s, 3, 0.48, 0.62) : 0, 'fade');
            K.show(quoteTail, b >= 3 ? K.seg(s, 3, 0.66, 0.86) : 0, 'fade');
          },

          anchor() {
            return { x: AX1, y: AY };
          },

          render(target, s) {
            bgp.render(rt, s.t, true);
            ovH.render(rt);
            V.render(rt);
            K.post(ctx, rt, rtP, { bloom: 0.55, grain: 0.018, exposure: 1.25, vignette: 0.45, time: s.t });
            gfx.copy(rtP, target);
            ov.render(target);
          },
        };
      },
    });
  })();

  // ===========================================================================
  // S10 · 天才国度 — "a country of geniuses in a datacenter"
  // ===========================================================================
  (() => {
    const fmtMinds = (v) => (v < 1e4 ? K.fmtInt(v) : v < 1e8 ? `${(v / 1e4).toFixed(v < 1e5 ? 1 : 0)} 万` : `${(v / 1e8).toFixed(v < 1e9 ? 1 : 0)} 亿`);
    const E = D.ECON;

    K.scene({
      id: 'nation',
      title: '天才国度',
      enterWith: 'shockwave',
      hud: { color: '#141210', alpha: 0.82 },
      beats: [
        { dur: 4.6, hold: 4 },
        { dur: 5.4, hold: 4 },
        { dur: 5.0, hold: 5 },
        { dur: 5.6, hold: 8 },
      ],
      thumbBeat: 3,
      notes: [
        '2024 年 10 月，达里奥 · 阿莫迪写了一篇文章，叫《优雅机器》。里面有一句话，当时听着像修辞：\n「我们可以把这概括为：一个数据中心里的天才国度。」',
        '想象一下：一个国家，居民全是顶尖专家，每个人以十倍于人的速度工作，需要多少就复制多少。\n2026 年，这不再像修辞了。',
        '钱已经投票了。ChatGPT 每周 12 亿人在用。四大云厂商今年在数据中心上花大约 7,300 亿美元，明年预计超过一万亿。Anthropic 的年化收入，810 亿美元。',
        '它们不需要睡眠。不需要读十年博士。不会退休。以光速互相交谈。\n（停在这里，让这片灯海自己说话。）',
      ],
      create(ctx) {
        const { gfx } = ctx;
        const ov = ctx.overlay();
        const V = K.vec(ctx);
        const rt = gfx.target({});
        const rt2 = gfx.target({});
        const rtP = gfx.target({});
        K.chrome(ctx, ov, { act: act3 });

        const field = K.pass(
          ctx,
          `
uniform float uDensity, uReveal;
void main(){
  vec2 s = stage();
  // stage coords have y pointing down; flip so "up" on screen is up for the camera
  vec2 uv = vec2(s.x - 960.0, 540.0 - s.y) / 1080.0;
  vec3 col = vec3(0.02, 0.019, 0.018);
  float hor = exp(-abs(uv.y - 0.3) * 7.0);
  col += vec3(1.0, 0.32, 0.1) * hor * (0.05 + 0.2 * uDensity);
  vec3 rd = normalize(vec3(uv.x, uv.y - 0.3, 1.0));
  if (rd.y < -0.002) {
    float t = 46.0 / -rd.y;
    vec3 P = rd * t;
    float sp = mix(30.0, 8.0, uDensity);
    vec2 cell = floor(P.xz / sp);
    vec2 f = fract(P.xz / sp) - 0.5 - (hash22(cell) - 0.5) * 0.56;
    float d = length(f) * sp;
    float r = 0.5 + 0.5 * hash12(cell + 3.1);
    float px = max(t * 1.3 * pxUnit() / 1080.0, sp * 0.9 * smoothstep(160.0, 520.0, t));
    float disc = 1.0 - smoothstep(r, r + px, d);
    float tw = 0.6 + 0.4 * sin(uTime * (0.5 + hash12(cell) * 2.2) + hash12(cell + 7.0) * 40.0);
    float rev = 1.0 - smoothstep(uReveal - 60.0, uReveal, length(P.xz));
    float fog = exp(-t * 0.0016);
    float on = step(hash12(cell + 11.0), uDensity);
    col += (vec3(1.0, 0.5, 0.16) * tw * (0.8 + 0.5 * uDensity) + vec3(0.5, 0.15, 0.04)) * disc * rev * fog * on;
  }
  vec2 dd = (vUv - 0.5) * vec2(uRes.x / max(uRes.y, 1.0), 1.0);
  col *= 1.0 - 0.5 * smoothstep(0.3, 1.3, length(dd));
  o = vec4(max(col, 0.0), 1.0);
}`,
          { uDensity: 0, uReveal: 120 }
        );
        const scrim = K.pass(
          ctx,
          `
uniform sampler2D tA;
uniform float uA;
void main(){
  vec3 c = texture(tA, vUv).rgb;
  vec2 s = stage();
  c *= 1.0 - uA * (1.0 - smoothstep(260.0, 1060.0, s.x));
  o = vec4(c, 1.0);
}`,
          { tA: null, uA: 0 }
        );
        const seed = V.dots(2, { order: 10 });

        const quote = K.text(ctx, ov, D.QUOTES.amodei.zh, 'h1', { x: 136, y: 300, size: 92, maxWidth: 1600 });
        const quoteBy = K.text(ctx, ov, `${D.QUOTES.amodei.who} · ${D.QUOTES.amodei.when} · 《优雅机器》。当时听着像修辞。`, 'mono', { x: 146, y: 520, size: 26, color: T.dim });
        const h2 = ['一个国家，居民全是顶尖专家。', '钱已经投票了。', '它们不需要睡眠。'].map((t) => K.text(ctx, ov, t, 'h1', { x: 136, y: 150, size: 84, maxWidth: 900 }));
        const l2 = K.text(ctx, ov, '每个都以十倍于人的速度工作。\n需要多少，就复制多少。\n2026 年，这不再像修辞。', 'lead', { x: 140, y: 290, maxWidth: 840, size: 38 });
        const rows = [
          ['ChatGPT 每周使用人数', `12 亿`, '2026.11'],
          ['四大云厂商 2026 年资本开支', '约 7,300 亿 美元', 'Alphabet · 微软 · Meta · 亚马逊'],
          ['2027 年，预计', '超过 1 万亿 美元', ''],
          ['Anthropic 年化收入', '810 亿 美元', 'IPO 文件，2026.10'],
        ].map(([k, v, n]) => ({
          k: K.text(ctx, ov, k, 'text', { x: 146, y: 0, size: 30, color: T.dim }),
          v: K.text(ctx, ov, v, 'songBlack', { x: 146, y: 0, size: 64, color: T.white }),
          n: K.text(ctx, ov, n, 'monoS', { x: 150, y: 0, size: 19, color: T.faint }),
        }));
        const l3 = K.text(ctx, ov, '不需要读十年博士。不会退休。以光速互相交谈。\n人类有史以来所有的科学家加起来，也填不满这样一片田野。', 'lead', { x: 140, y: 290, maxWidth: 900, size: 38 });
        const cntLab = K.text(ctx, ov, '地球上的在职科研人员，总共约 900 万', 'monoS', { x: T.R, y: 118, size: 20, align: 'right', color: T.dim });
        const cntSub = K.text(ctx, ov, '而一片田野的容量，取决于芯片，不取决于出生率。', 'mono', { x: T.R, y: 320, size: 22, align: 'right', color: T.text });
        const cnt = K.text(ctx, ov, '1', 'didot', { x: T.R, y: 146, size: 132, align: 'right', color: T.white });
        const src = K.text(ctx, ov, '来源：OpenAI · CNBC（2026.10）· 路透社 · 联合国教科文组织', 'monoS', { x: T.M, y: 1004, align: 'left', color: T.faint });

        let lastCnt = '';
        return {
          update(s) {
            const b = s.beat;
            const g = K.gate(s);
            const dens = b === 0 ? 0 : b === 1 ? ease.io2(K.seg(s, 1, 0.05, 0.9)) : 1;
            ctx.audio.param('deep', 0.5 + 0.5 * dens);
            ctx.audio.param('wind', 0.25 * dens);
            field.u.uDensity.value = dens;
            field.u.uReveal.value = b === 0 ? 0 : lerp(150, 1500, ease.out2(K.seg(s, 1, 0.0, 0.9)));
            const seedA = b === 0 ? K.seg(s, 0, 0.0, 0.25) * g * (1 - K.seg(s, 1, 0, 0.3)) : 0;
            seed.set(0, 960, 640, 5, HDR.hot, seedA, 0.3);
            seed.set(1, 960, 640, 46 + 6 * Math.sin(s.t * 2.2), HDR.amber, seedA * 0.55, 1);
            seed.commit();
            scrim.u.uA.value = (b === 0 ? 0.72 : 0.84) * K.seg(s, 0, 0.2, 0.7) * (1 - K.seg(s, 3, 0.5, 0.9));

            K.show(quote, b === 0 ? K.seg(s, 0, 0.12, 0.7) * g * (1 - K.seg(s, 1, 0, 0.15)) : 0, 'blur', 0.5);
            K.show(quoteBy, b === 0 ? K.seg(s, 0, 0.6, 0.95) * (1 - K.seg(s, 1, 0, 0.15)) : 0, 'fade');
            h2.forEach((hb, i) => {
              let p = 0;
              if (i === b - 1) p = K.seg(s, b, 0.04, 0.24);
              else if (i === b - 2) p = 1 - K.seg(s, b, 0, 0.12);
              K.show(hb, p, 'rise', 0.3);
            });
            K.show(l2, b === 1 ? K.seg(s, 1, 0.3, 0.6) : 0, 'fade');
            K.show(l3, b === 3 ? K.seg(s, 3, 0.2, 0.55) : 0, 'fade');
            rows.forEach((r, i) => {
              const p = b === 2 ? ease.out3(K.seg(s, 2, 0.22 + i * 0.13, 0.42 + i * 0.13)) : 0;
              const y = 300 + i * 150;
              r.k.y = y;
              r.v.y = y + 44;
              r.n.y = y + 118;
              K.show(r.k, p, 'fade');
              K.show(r.v, p, 'rise', 0.2);
              K.show(r.n, p, 'fade');
            });
            const minds = Math.pow(10, lerp(0, Math.log10(E.researchers * 1e4), dens));
            const txt = minds < 1.5 ? '1' : fmtMinds(minds);
            if (txt !== lastCnt) {
              lastCnt = txt;
              cnt.set(txt);
            }
            K.show(cntLab, b >= 1 ? K.seg(s, 1, 0.1, 0.5) : 0, 'fade');
            K.show(cnt, b >= 1 ? 1 : 0, 'fade');
            K.show(cntSub, b >= 1 ? K.seg(s, 1, 0.85, 1) : 0, 'fade');
            K.show(src, g * 0.9 * (b === 2 ? 1 : 0), 'fade');
                  },

          anchor() {
            return { x: 960, y: 640 };
          },

          render(target, s) {
            field.render(rt, s.t, true);
            scrim.u.tA.value = rt.texture;
            scrim.render(rt2);
            V.render(rt2);
            K.post(ctx, rt2, rtP, { bloom: 0.62, grain: 0.02, exposure: 1.3, vignette: 0.4, time: s.t, threshold: 0.9 });
            gfx.copy(rtP, target);
            ov.render(target);
          },
        };
      },
    });
  })();
})();
