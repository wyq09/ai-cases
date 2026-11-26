(() => {
  'use strict';
  const SC = window.__SC;
  const K = SC.kit;
  const M = SC.math;
  const D = SC.D;
  const { T, HDR } = K;
  const { clamp, lerp, ease } = M;
  const act1 = 'Ⅰ · 亚临界  k < 1';

  // ===========================================================================
  // S1 · 输入 — the deck opens with the only thing a human wrote: the brief itself.
  // ===========================================================================
  (() => {
    const chars = Array.from(D.BRIEF);
    const N = chars.length;
    const rnd = M.rng(20261126);
    const times = [0];
    for (let i = 0; i < N; i++) {
      const ch = chars[i];
      let dt = 0.03 + rnd() * 0.05;
      if ('，。；：！？'.includes(ch)) dt += 0.2 + rnd() * 0.22;
      times.push(times[i] + dt);
    }
    const total = times[N];
    const nsPrefix = [0];
    for (let i = 0; i < N; i++) nsPrefix.push(nsPrefix[i] + (/\s/.test(chars[i]) ? 0 : 1));
    const typedBy = (t) => {
      let lo = 0;
      let hi = N;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (times[mid] <= t) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    };

    K.scene({
      id: 'brief',
      title: '输入',
      enterWith: 'fade',
      beats: [
        { dur: 1.8, hold: 1.4 },
        { dur: total + 0.5, hold: 1.8 },
        { dur: 2.2, hold: 1.8 },
        { dur: 3.4, hold: 8 },
      ],
      thumbBeat: 3,
      notes: [
        '（先别说话。黑屏上只有一根光标在闪。让它闪够三下，等观众安静下来。）',
        '这是我收到的全部指示。一个字都没改。\n接下来的每一页、每一张图、每一段音效，都是从这段话里长出来的。',
        '人类的输入：' + N + ' 个字。写完，就去喝了杯咖啡。',
        '机器的输出：你现在看到的一切。\n' +
          K.BUILD.authorLines.toLocaleString('en-US') +
          ' 行代码，十四幕，一个文件，没有一张外部图片、没有一段外部音频。\n这份演示文稿本身，就是它要讲的那个话题的第一份证据。',
      ],
      create(ctx) {
        const { gfx } = ctx;
        const ov = ctx.overlay();
        const V = K.vec(ctx);
        const bgp = K.bg(ctx, { grid: 0, vig: 0.55, base: [0.022, 0.021, 0.02] });
        const rt = gfx.target({});
        const rtP = gfx.target({});
        const X = 140;
        const Y = 196;
        K.chrome(ctx, ov, { act: '序' });

        const typed = K.text(ctx, ov, D.BRIEF, 'monoL', {
          x: X, y: Y, size: 33, color: T.text, leading: 1.8, maxWidth: 1640,
        });
        const caret = V.rects(1, { order: 20 });
        const lab = K.text(
          ctx,
          ov,
          [{ t: '输入 · 人类 · ' }, { t: `${N} 字`, color: T.ember }, { t: ` · ${D.BRIEF_DATE}` }],
          'mono',
          { x: X, y: 0 }
        );

        const title = K.text(ctx, ov, '超临界', 'h1', { size: 250, leading: 1.0, x: 124, y: 436, order: 30 });
        const rule = V.line(2, { width: 3, color: HDR.ember, glow: 1, order: 31 });
        rule.set([140, 744, 650, 744], { draw: 0 });
        const en = K.text(ctx, ov, 'SUPERCRITICAL', 'didot', {
          size: 46, color: T.ember, tracking: 0.46, x: 146, y: 768,
        });
        const tag = K.text(ctx, ov, '关于智能爆炸', 'text', { size: 36, color: T.dim, tracking: 0.3, x: 146, y: 858 });

        const B = K.BUILD;
        const outLab = K.text(ctx, ov, '输出 · 机器', 'lab', { x: T.R, y: 462, align: 'right' });
        const out = K.text(
          ctx,
          ov,
          `${B.authorLines.toLocaleString('en-US')} 行代码\n1 个文件 · ${(B.bytes / 1048576).toFixed(1)} MB · 0 项外部资源\n用时：一次对话`,
          'mono',
          { x: T.R, y: 512, align: 'right', leading: 1.9, color: T.text }
        );
        const ratio = K.text(ctx, ov, `1 : ${Math.round(B.authorLines / N)}`, 'didot', {
          size: 128, color: T.white, x: T.R, y: 716, align: 'right',
        });
        const ratioCap = K.text(ctx, ov, '人类的每一个字，换来这么多行', 'monoS', { x: T.R, y: 872, align: 'right' });
        const right = [ratio, ratioCap, out, outLab];

        let lastN = -1;

        return {
          update(s) {
            const nT = s.beat < 1 ? 0 : s.beat > 1 ? N : typedBy(clamp(s.at(1) - 0.45, 0, total));
            if (nT !== lastN) {
              if (nT > lastN && K.live(s)) ctx.sfx('type', { gain: 0.5 });
              lastN = nT;
            }
            const e2 = K.seg(s, 2, 0.05, 0.8, ease.io3);
            const sc = lerp(1, 0.5, e2);
            const fade = lerp(1, 0.42, e2);
            typed.scale = sc;
            typed.mesh.visible = s.beat < 4 && nT > 0;
            typed.animate((g, d) => {
              d.alpha = g.ci < nT ? fade : 0;
            });

            // caret rides the last typed glyph
            const gi = nsPrefix[nT] - 1;
            const g = gi >= 0 ? typed.glyphs[gi] : null;
            const cx = g ? X + g.x + g.w + 6 : X + 2;
            const cy = g ? Y + g.top + g.size * 0.25 : Y + 6;
            const typing = nT > 0 && nT < N;
            const blink = typing ? 1 : Math.sin(s.t * Math.PI * 2 * 1.4) > -0.15 ? 1 : 0.12;
            caret.set(0, cx, cy, 3, 38, HDR.ember, s.beat <= 1 ? blink : s.beat === 2 ? blink * (1 - e2 * 3) : 0);
            caret.commit();

            lab.y = Y + typed.height * sc + 22;
            K.show(lab, s.beat >= 2 ? K.seg(s, 2, 0.55, 1, ease.out2) : 0, 'fade');

            const g3 = K.gate(s);
            const p3 = (a, b) => K.seg(s, 3, a, b) * g3;
            K.show(title, s.beat >= 3 ? p3(0.06, 0.66) : 0, 'blur', 0.5);
            K.show(en, s.beat >= 3 ? p3(0.42, 0.8) : 0, 'fade');
            K.show(tag, s.beat >= 3 ? p3(0.6, 0.96) : 0, 'fade');
            const heat = s.beat >= 3 ? p3(0.1, 0.9) : 0;
            rule.draw(rule.len * ease.io3(K.seg(s, 3, 0.12, 0.8)));
            rule.color(K.lerp3(HDR.ember, HDR.emberHot, heat * 0.6));
            rule.visible(s.beat >= 3);
            const rv = s.beat >= 3 ? p3(0.5, 1) : 0;
            for (const b of right) K.show(b, rv, 'fade');
          },

          render(target, s) {
            bgp.render(rt, s.t, true);
            V.render(rt);
            K.post(ctx, rt, rtP, {
              bloom: 0.3 + 0.45 * K.seg(s, 3, 0, 0.5),
              grain: 0.016,
              exposure: 1.2,
              vignette: 0.5,
              time: s.t,
            });
            gfx.copy(rtP, target);
            ov.render(target);
          },
        };
      },
    });
  })();

  // ===========================================================================
  // S2 · 对折 42 次 — the exponential you "know" and do not believe.
  // ===========================================================================
  (() => {
    const F = D.FOLD;
    const NF = F.n;
    K.scene({
      id: 'fold',
      title: '对折 42 次',
      enterWith: 'plot',
      beats: [
        { dur: 1.6, hold: 2.8 },
        { dur: 5.4, hold: 2.8 },
        { dur: 4.4, hold: 2.8 },
        { dur: 6.2, hold: 3.2 },
        { dur: 2.6, hold: 6 },
      ],
      thumbBeat: 3,
      notes: [
        '（先让观众猜。真的等三秒。）',
        '前二十折，无聊透顶：105 米，三十层楼。直觉到这儿还跟得上。\n注意屏幕上那根柱子：它在匀速上升。那是坐标系在骗你——每上一格，都是翻倍。',
        '第二十三折，超过哈利法塔。第二十六折，珠穆朗玛峰。第三十折，卡门线：你已经离开了大气层。',
        '（放慢）第三十八折，越过 GPS 卫星。第四十一折，过半程。\n第四十二折：43.98 万公里。月球到了。中间隔着的，是真空。',
        '最后一折的距离，比之前所有折加起来还长。\n现实中没人能把纸对折超过 12 次。但接下来你们要看的曲线，14 年翻了 31 番。',
      ],
      create(ctx) {
        const { gfx } = ctx;
        const ov = ctx.overlay();
        const ovH = ctx.overlay();
        const V = K.vec(ctx);
        const bgp = K.bg(ctx, { grid: 1, vig: 0.45 });
        const rt = gfx.target({});
        const rtP = gfx.target({});
        const RX = 1120;
        const RB = 912;
        const RT = 150;
        const STEP = (RB - RT) / NF;
        const BW = 40;
        const BN = [0, 0, 20, 30, NF, NF];
        const yOf = (n) => RB - n * STEP;
        K.chrome(ctx, ov, { act: act1 });

        // ruler
        const spine = V.line(2, { width: 2, color: HDR.faint, order: 2 });
        spine.set([RX - 16, RT - 34, RX - 16, RB + 26]);
        const ticks = V.rects(NF + 1, { order: 3 });
        for (let i = 0; i <= NF; i++) ticks.set(i, RX - 36, yOf(i) - 0.5, 16, i % 10 === 0 ? 2 : 1.2, HDR.dim, i % 10 === 0 ? 0.9 : 0.4);
        ticks.commit();
        for (const d of [0, 10, 20, 30, 40]) {
          const b = K.text(ctx, ov, String(d), 'monoS', { x: RX - 52, y: yOf(d), align: 'right', valign: 'middle', color: T.faint });
          void b;
        }
        const bar = V.rects(1, { order: 6 });
        const cap = V.line(2, { width: 2, color: HDR.white, glow: 0.6, order: 8 });
        const hits = V.dots(F.marks.length, { order: 9 });
        const marks = F.marks.map(([n, name, dist]) => {
          const ln = V.line(2, { width: 1.5, color: HDR.dim, order: 4 });
          ln.set([RX + BW + 30, yOf(n), 1764, yOf(n)]);
          const lab = K.text(
            ctx,
            ovH,
            [{ t: `${name}  `, font: 'textMed', size: 28, color: T.text }, { t: dist, font: 'mono', size: 24, color: T.dim }],
            'mono',
            { x: RX + BW + 54, y: yOf(n), valign: 'middle' }
          );
          return { n, name, ln, lab, hit: false, idx: 0 };
        });
        marks.forEach((m, i) => (m.idx = i));

        // left column
        const heads = ['一张纸。', '对折 20 次。', '对折 30 次。', '第 42 次。', '最后 12 折，\n是全程的 99.98%。'].map((t) =>
          K.text(ctx, ov, t, 'h1', { size: 84, x: 136, y: 164, maxWidth: 900 })
        );
        const readout = K.text(ctx, ov, '', 'h2', { x: 132, y: 330, size: 128, leading: 1.15 });
        const foldLine = K.text(ctx, ov, '', 'mono', { x: 144, y: 522, size: 26 });
        const leads = [
          '厚度 0.1 毫米。\n对折 42 次，会有多厚？先在心里猜一个数。',
          '105 米，三十层楼。\n到这里，直觉还跟得上。',
          '107 公里。\n你已经穿过了大气层。',
          '43.98 万公里。\n月球到了。中间隔着的，是真空。',
          '现实中，没人能把纸对折超过 12 次。\n但有一条曲线，14 年翻了 31 番。',
        ].map((t) => K.text(ctx, ov, t, 'lead', { x: 140, y: 604, maxWidth: 900, size: 36 }));

        const thick = (n) => F.base * Math.pow(2, n);
        const fmtThick = (mm) => {
          if (mm < 10) return [{ t: mm.toFixed(1) }, { t: ' 毫米', size: 52, font: 'songBold', color: T.dim }];
          if (mm < 1000) return [{ t: `${Math.round(mm)}` }, { t: ' 毫米', size: 52, font: 'songBold', color: T.dim }];
          if (mm < 1e6) return [{ t: K.fmtInt(mm / 1000) }, { t: ' 米', size: 52, font: 'songBold', color: T.dim }];
          return [{ t: K.fmtInt(mm / 1e6) }, { t: ' 公里', size: 52, font: 'songBold', color: T.dim }];
        };

        let lastFloor = -1;
        let lastTxt = '';
        const hOf = (n) => lerp(Math.pow(2, n) - 1, n * STEP, M.smoothstep(6, 10.5, n));
        const barColor = (n) => {
          const c = K.lerp3(HDR.white, HDR.ember, M.smoothstep(3, 15, n));
          const k = K.lerp3(c, HDR.amber, M.smoothstep(30, NF, n));
          const g = 1 + 1.1 * M.smoothstep(20, NF, n);
          return [k[0] * g, k[1] * g, k[2] * g];
        };

        return {
          update(s) {
            const b = s.beat;
            const n0 = BN[b];
            const n1 = BN[b + 1];
            const raw = s.p[b] || 0;
            const u = b === 3 ? Math.pow(raw, 1.7) : raw;
            const n = n0 + (n1 - n0) * u;
            const fl = Math.floor(n + 1e-6);
            if (fl !== lastFloor) {
              if (fl > lastFloor && K.live(s)) ctx.sfx('tick', { gain: 0.55, pitch: Math.min(2.4, Math.pow(2, fl / 40)) });
              lastFloor = fl;
            }
            const h = hOf(n);
            const col = barColor(n);
            ctx.audio.param('hum', 0.25 + (n / NF) * 0.75);
            bar.set(0, RX, RB - h, BW, h, col, n > 0.05 ? 1 : 0, 0, 0);
            bar.commit();
            cap.set([RX - 46, RB - h, 1764, RB - h], { draw: 1640 * clamp(h / 24, 0, 1) });
            cap.u.uColor.value.set(col[0] * 1.3, col[1] * 1.3, col[2] * 1.3);
            cap.visible(n > 0.4);
            cap.alpha(clamp((h - 20) / 60, 0, 1) * 0.9);

            marks.forEach((m, i) => {
              const near = M.smoothstep(m.n - 6.5, m.n - 1.5, n);
              const was = m.hit;
              m.hit = n >= m.n - 1e-6;
              if (m.hit && !was && K.live(s)) {
                ctx.sfx('snap', { gain: 0.7 });
                ctx.sfx('chime', { gain: 0.3, pitch: 0.5 + i * 0.08 });
              }
              const hot = m.hit ? 1 : 0;
              m.ln.u.uColor.value.set(...K.lerp3(HDR.faint, HDR.emberHot, hot));
              m.ln.u.uAlpha.value = 0.5 + near * 0.5;
              m.ln.visible(near > 0.01);
              m.lab.alpha = near;
              m.lab.animate((g, d) => {
                const f = m.hit ? 1.9 : 1;
                d.r = g.color[0] * f;
                d.g = g.color[1] * f;
                d.b = g.color[2] * f;
              });
              m.lab.mesh.visible = near > 0.01;
              hits.set(i, RX - 16, yOf(m.n), m.hit ? 9 : 5, m.hit ? HDR.emberHot : HDR.dim, near * (m.hit ? 1 : 0.6), m.hit ? 0.5 : 0);
            });
            hits.commit();

            // copy
            heads.forEach((hb, i) => {
              let p = 0;
              if (i === b) p = i === 0 ? K.seg(s, 0, 0.15, 0.7) * K.gate(s) : K.seg(s, b, 0.66, 0.94);
              else if (i === b - 1 && b > 0) p = 1 - K.seg(s, b, 0, 0.12);
              K.show(hb, p, i === 0 ? 'blur' : 'rise', 0.35);
            });
            leads.forEach((lb, i) => {
              let p = 0;
              if (i === b) p = i === 0 ? K.seg(s, 0, 0.45, 1) * K.gate(s) : i === 4 ? K.seg(s, b, 0.05, 0.5) : K.seg(s, b, 0.78, 1);
              else if (i === b - 1 && b > 0) p = 1 - K.seg(s, b, 0, 0.12);
              K.show(lb, p, 'fade');
            });

            const txt = `${fl}|${b}`;
            if (txt !== lastTxt) {
              lastTxt = txt;
              readout.set(fmtThick(thick(fl)));
              foldLine.set(`对折 ${fl} 次 · 厚度 ×${K.fmtInt(Math.pow(2, fl))}`);
            }
            K.show(readout, b === 0 ? K.seg(s, 0, 0.1, 0.6) * K.gate(s) : 1, 'fade');
            K.show(foldLine, b === 0 ? K.seg(s, 0, 0.3, 0.8) * K.gate(s) : 1, 'fade');
          },

          anchor() {
            return { x: 960, y: 912 };
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
  // S3 · 二十亿倍 — frontier training compute, 2012 → 2026 (Epoch AI estimates)
  // ===========================================================================
  (() => {
    const X0 = 330, X1 = 1740, Y0 = 336, Y1 = 892;
    const T0 = 2012.25, T1 = 2027.15, L0 = 16.4, L1 = 28.1, VMAX = 9.4e26;
    const W = X1 - X0, H = Y1 - Y0;
    const X = (t) => X0 + ((t - T0) / (T1 - T0)) * W;
    const yLog = (f) => Y1 - ((Math.log10(f) - L0) / (L1 - L0)) * H;
    const yLin = (f) => Y1 - Math.min(1, f / VMAX) * H;
    const pts = D.COMPUTE.map(([d, name, f, cost]) => ({ t: D.dy(d), name, f, cost, year: +d.slice(0, 4) }));
    const cloud = D.COMPUTE_CLOUD.map(([d, name, f]) => ({ t: D.dy(d), name, f, year: +d.slice(0, 4) }));
    const fmtCost = (c) => (c == null ? '' : c < 1e4 ? `$${K.fmtInt(c)}` : c < 1e8 ? `$${K.fmtInt(c / 1e4)} 万` : `$${(c / 1e8).toFixed(1)} 亿`);
    const LB = {
      AlexNet: [18, -14, 'left'],
      'GPT-2': [16, -12, 'left'],
      'GPT-3': [-12, 14, 'right'],
      'GPT-4': [-12, 12, 'right'],
      'Gemini 1.0 Ultra': [-10, -42, 'right'],
      'Grok 3': [0, 26, 'center'],
      'GPT-4.5': [0, 26, 'center'],
      'Grok 4': [0, -28, 'center'],
      'GPT-6 Astra': [14, 10, 'left'],
    };
    const LB2 = { ...LB, 'Gemini 1.0 Ultra': [-12, 10, 'right'], 'Grok 3': [-12, 8, 'right'], 'Grok 4': [16, -12, 'left'], 'GPT-6 Astra': [-14, -14, 'right'] };
    const HEADS = ['十四年，二十亿倍。', '换成线性坐标。', '然后，它慢了下来。', '慢的是「堆芯片」。'];
    const LEADS = [
      '训练前沿模型所需的算力。纵轴每一格，是十倍。\n小字是训练成本——AlexNet：16 美元。',
      '前面十一年，贴着地。\n不是没增长。是增长后的数字，在前面的尺度下仍然是零。',
      '前沿训练算力，2025 年初到 2026 年秋：不到三倍。\n按原来的斜率，现在应该是 4.5×10²⁷。',
      '不是它变聪明的速度。\n2026 年的新模型，大多用更少的算力，做更多的事。',
    ];

    K.scene({
      id: 'compute',
      title: '二十亿倍',
      enterWith: 'burn',
      beats: [{ dur: 5.2, hold: 3.4 }, { dur: 3.4, hold: 3.4 }, { dur: 4.2, hold: 3.6 }, { dur: 3.2, hold: 6 }],
      thumbBeat: 2,
      notes: [
        '纵轴是对数的：每上一格，是十倍。从 AlexNet 到 GPT-6 Astra，二十亿倍，十四年。\n顺便看小字：2012 年训练 AlexNet 花了 16 美元。2025 年训练 Grok 4，三亿九千万美元。',
        '对数坐标是科学家的习惯，也是安慰剂——它让爆炸看起来像一条安稳的直线。\n换成我们大脑习惯的线性坐标：前面十一年，贴着地。',
        '但这里要说一句对论点不利的话：按 Epoch 的估算，最大的训练从 2025 年初的 3.8×10²⁶ 到 2026 年秋的 9.4×10²⁶，不到三倍。斜率断了。\n（Gemini 和 Claude 的训练算力没有公开估算，这是能查到的最大数字。）',
        '慢下来的是「把更多芯片堆进一个机房」。不是能力。\n后面三页会证明这一点：价格、任务时长、它做研究的能力——没有一条线慢下来。',
      ],
      create(ctx) {
        const { gfx } = ctx;
        const ov = ctx.overlay();
        const V = K.vec(ctx);
        const bgp = K.bg(ctx, { grid: 1, vig: 0.45 });
        const rt = gfx.target({});
        const rtP = gfx.target({});
        K.chrome(ctx, ov, { act: act1 });

        const grid = [];
        const glab = [];
        for (let e = 17; e <= 28; e++) {
          const ln = V.line(2, { width: e % 5 === 0 ? 1.6 : 1, color: e % 5 === 0 ? HDR.dim : HDR.faint, order: 2 });
          grid.push({ e, v: Math.pow(10, e), ln });
          glab.push(K.text(ctx, ov, `10${K.sup(e)}`, 'mono', { x: X0 - 24, y: 0, size: 19, align: 'right', valign: 'middle', color: T.dim }));
        }
        const xlab = [];
        for (let y = 2012; y <= 2026; y += 2) {
          xlab.push(K.text(ctx, ov, String(y), 'mono', { x: X(y), y: Y1 + 12, size: 20, align: 'center', valign: 'top', color: T.dim }));
        }
        const axis = V.line(4, { width: 1.5, color: HDR.dim, order: 3 });
        axis.set([X0 - 34, Y0 - 30, X0 - 34, Y1 + 1, X1 + 20, Y1 + 1]);
        const curve = V.line(16, { width: 4.5, color: HDR.ember, glow: 1, order: 10 });
        const trend = V.line(4, { width: 2.5, color: HDR.cold, order: 9 });
        trend.u.uDash.value = 16;
        const dots = V.dots(19, { order: 12 });
        const leader = V.line(2, { width: 1.2, color: HDR.dim, order: 8 });

        const ptx = pts.map((p) => {
          const [dx, dy, al] = LB[p.name];
          const name = p.name === 'Grok 3' ? 'Grok 3 · GPT-4.5' : p.name;
          const b = K.text(
            ctx, ov,
            [{ t: name, font: 'textMed', size: 25, color: T.white }, { t: `  ${p.year}${p.cost != null ? ' · ' + fmtCost(p.cost) : ''}`, font: 'mono', size: 19, color: T.dim }],
            'mono', { x: 0, y: 0, align: al, valign: dy < 0 ? 'bottom' : 'top' }
          );
          return { ...p, b, hidden: p.name === 'GPT-4.5' };
        });
        ptx.forEach((p, i) => (pts[i] = p));

        const heads = HEADS.map((t) => K.text(ctx, ov, t, 'h1', { x: 136, y: 150 }));
        const leads = LEADS.map((t, i) => K.text(ctx, ov, t, 'lead', { x: 140, y: 272, maxWidth: 1640, size: i === 0 ? 30 : 32, color: i === 0 ? T.dim : T.text }));
        const slope = K.text(ctx, ov, '× 5.2 / 年', 'monoMed', { x: 0, y: 0, size: 26, color: T.ember, align: 'center', valign: 'middle' });
        const trendLab = K.text(ctx, ov, [{ t: '按原斜率  ', font: 'mono', size: 22, color: T.cold }, { t: '4.5 × 10²⁷', font: 'monoMed', size: 24, color: T.cold }], 'mono', { x: 0, y: 0, align: 'right', valign: 'bottom' });
        const actLab = K.text(ctx, ov, [{ t: '实际  ', font: 'mono', size: 22, color: T.ember }, { t: '9.4 × 10²⁶', font: 'monoMed', size: 24, color: T.ember }], 'mono', { x: 0, y: 0, align: 'right', valign: 'top' });
        const cloudLab = K.text(ctx, ov, '2026 年的新模型', 'mono', { x: 0, y: 0, size: 24, color: T.amber, align: 'center', valign: 'top' });
        const linTop = K.text(ctx, ov, '9.4 × 10²⁶', 'monoS', { x: X0 - 24, y: Y0, align: 'right', valign: 'middle', color: T.dim });
        const linBot = K.text(ctx, ov, '0', 'monoS', { x: X0 - 24, y: Y1, align: 'right', valign: 'middle', color: T.dim });
        const src = K.text(ctx, ov, '数据：Epoch AI · Notable AI Models · 训练算力估算（2026 年 11 月）', 'monoS', { x: T.M, y: 1004, align: 'left', color: T.faint });

        const cum = [0];
        let lastAlign = null;
        const copyVis = (i, b, s) => {
          let p = 0;
          if (i === b) p = i === 0 ? K.gate(s, 0.2, 0.7) : K.seg(s, b, 0.02, 0.22);
          else if (i === b - 1) p = 1 - K.seg(s, b, 0, 0.1);
          return p;
        };

        return {
          update(s) {
            const b = s.beat;
            const g = K.gate(s);
            let m = 0;
            if (b === 1) m = ease.io3(K.seg(s, 1, 0.1, 0.74));
            else if (b === 2) m = 1 - ease.io3(K.seg(s, 2, 0, 0.24));
            const ga = K.seg(s, 0, 0, 0.2) * g;
            ctx.audio.param('deep', 0.5);

            grid.forEach(({ e, v, ln }, i) => {
              const y = lerp(yLog(v), yLin(v), m);
              ln.set([X0 - 34, y, X1, y]);
              ln.u.uAlpha.value = ga * (1 - m * 0.55);
              ln.visible(ga > 0.01 && !(m > 0.6 && e < 27));
              const lb = glab[i];
              lb.y = y;
              K.show(lb, clamp(ga * (1 - m * 2.4) + (e >= 27 ? m * 1.2 : 0) + (e === 16 ? m * 1.2 : 0), 0, 1), 'fade');
            });
            xlab.forEach((lb) => K.show(lb, ga, 'fade'));
            K.show(linTop, clamp((m - 0.5) * 3, 0, 1), 'fade');
            K.show(linBot, clamp((m - 0.5) * 3, 0, 1), 'fade');
            axis.u.uAlpha.value = ga;

            const alignNow = m > 0.5 ? 'lin' : 'log';
            if (alignNow !== lastAlign) {
              lastAlign = alignNow;
              ptx.forEach((p) => {
                const al = (alignNow === 'lin' ? LB2 : LB)[p.name][2];
                p.b.style({ align: al, valign: (alignNow === 'lin' ? LB2 : LB)[p.name][1] < 0 ? 'bottom' : 'top' });
              });
            }
            const df = b === 0 ? ease.io2(K.seg(s, 0, 0.12, 0.86)) * g : 1;
            const arr = [];
            pts.forEach((p, i) => {
              p.x = X(p.t);
              p.y = lerp(yLog(p.f), yLin(p.f), m);
              arr.push(p.x, p.y);
              if (i) cum[i] = cum[i - 1] + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y);
            });
            curve.set(arr);
            const total = curve.len || 1;
            curve.draw(total * df);
            curve.visible(df > 0.001);
            curve.u.uAlpha.value = b === 1 ? 1 - 0.5 * m : 1;
            pts.forEach((p, i) => {
              const f = cum[i] / total;
              const pop = b === 0 ? clamp((df - f) / 0.05, 0, 1) : 1;
              dots.set(i, p.x, p.y, 8 * ease.outBack(pop, 2), HDR.hot, pop, 0.3);
              const big = m < 0.5 || yLin(p.f) < Y1 - 30;
              const lp = p.hidden ? 0 : b === 0 ? ease.out2(clamp((df - f) / 0.1, 0, 1)) * g : big ? 1 : 0;
              K.show(p.b, lp, 'fade');
              const L = (m > 0.5 ? LB2 : LB)[p.name];
              p.b.x = p.x + L[0];
              p.b.y = p.y + L[1];
            });
            cloud.forEach((c, j) => {
              c.x = X(c.t);
              c.y = lerp(yLog(c.f), yLin(c.f), m);
              const lit = b >= 3 ? K.seg(s, 3, 0.15 + j * 0.035, 0.55 + j * 0.035) : 0;
              const on = b === 0 ? K.seg(s, 0, 0.7 + j * 0.02, 0.9 + j * 0.02) * g : 1;
              dots.set(9 + j, c.x, c.y, 5 + 2.5 * lit, K.lerp3(HDR.cold, HDR.amber, lit), on * (0.5 + 0.5 * lit) * (1 - m), 0.2 + lit * 0.35);
            });
            dots.commit();

            // slope label rides the straight part of the log line
            const sx = X(2018.3);
            const sy = lerp(yLog(pts[0].f * Math.pow(5.2, 2018.3 - pts[0].t)), yLin(pts[0].f * Math.pow(5.2, 2018.3 - pts[0].t)), m);
            slope.x = sx; slope.y = sy - 46;
            slope.rotation = -0.352;
            K.show(slope, b === 0 ? ease.out2(clamp((df - 0.45) / 0.2, 0, 1)) * g * (1 - m * 2) : b === 1 ? 0 : b === 2 ? 1 - K.seg(s, 2, 0.3, 0.5) : 0, 'fade');

            const k0 = pts[6];
            const kT = pts[8].t;
            const kF = k0.f * Math.pow(5.2, kT - k0.t);
            const tf = ease.io2(K.seg(s, 2, 0.3, 0.8));
            trend.set([k0.x, k0.y, X(kT), yLog(kF)]);
            trend.draw(trend.len * tf);
            trend.visible(tf > 0.01 && b === 2);
            trendLab.x = X(kT) + 150; trendLab.y = yLog(kF) - 6;
            K.show(trendLab, b === 2 ? K.seg(s, 2, 0.7, 0.95) : 0, 'fade');
            actLab.x = pts[8].x + 120; actLab.y = pts[8].y + 40;
            K.show(actLab, b === 2 ? K.seg(s, 2, 0.6, 0.9) : 0, 'fade');

            const cl = b >= 3 ? K.seg(s, 3, 0.05, 0.4) : 0;
            leader.set([X(2026.05), yLog(6e25) - 22, X(2026.45), yLog(5.5e25)]);
            leader.u.uAlpha.value = cl * 0.9;
            leader.visible(cl > 0.01);
            cloudLab.x = X(2026.0); cloudLab.y = yLog(6e25) - 30;
            K.show(cloudLab, cl, 'fade');

            heads.forEach((hb, i) => K.show(hb, copyVis(i, b, s), i === 0 ? 'blur' : 'rise', 0.3));
            leads.forEach((lb, i) => K.show(lb, i === b ? (i === 0 ? K.seg(s, 0, 0.3, 0.8) * g : K.seg(s, b, 0.1, 0.5)) : 0, 'fade'));
            K.show(src, ga * 0.9, 'fade');
          },

          anchor() {
            return { x: 1090, y: 560 };
          },

          render(target, s) {
            bgp.render(rt, s.t, true);
            V.render(rt);
            K.post(ctx, rt, rtP, { bloom: 0.45, grain: 0.018, exposure: 1.25, vignette: 0.45, time: s.t });
            gfx.copy(rtP, target);
            ov.render(target);
          },
        };
      },
    });
  })();

  // ===========================================================================
  // S4 · 思想的价格 — what a fixed level of intelligence costs, and how fast that falls
  // ===========================================================================
  (() => {
    const X0 = 1000, X1 = 1740, Y0 = 300, Y1 = 900;
    const T0 = 2023.0, T1 = 2026.95, P0 = 2, P1 = -4.2;
    const W = X1 - X0, H = Y1 - Y0;
    const X = (t) => X0 + ((t - T0) / (T1 - T0)) * W;
    const Y = (p) => Y1 - ((Math.log10(p) - P1) / (P0 - P1)) * H;
    const TAGS = [
      ['2023-03-14', 'GPT-4', 37.5, 22, -44, 'left', 0, 0.05, 0.2, 'a'],
      ['2024-07-18', 'Llama 3.1 8B', 0.1, -18, 12, 'right', 0, 0.34, 0.5, 'a'],
      ['2024-10-24', 'Gemini 1.5 Flash-8B', 0.07, 20, 10, 'left', 0, 0.6, 0.76, 'a'],
      ['2025-01-31', 'o3', 0.3, 22, -44, 'left', 1, 0.06, 0.22, 'b'],
      ['2026-07-09', 'GPT-5.6 Luna', 0.0004, -20, -18, 'right', 1, 0.46, 0.62, 'b'],
    ].map(([d, name, p, dx, dy, al, beat, a0, a1, series]) => ({
      t: D.dy(d), name, p, dx, dy, al, beat, a0, a1, series,
      txt: p >= 1 ? `$${p.toFixed(2)}` : `$${p.toFixed(p < 0.01 ? 4 : 2)}`,
      date: d.slice(0, 7).replace('-', '.'),
    }));
    const HEADS = ['买 GPT-4 级别的智能。', '同一道博士级的科学题。', '每年，便宜 13 倍。', '摩尔定律六年的跌幅，它一年。'];
    const LEADS = [
      '2023 年 3 月，每百万 token：37.5 美元。\n最便宜的同级模型，之后是这两个。',
      '2025 年 1 月，o3 答一道：30 美分。\n一年半以后——',
      '达到同等性能的价格，每年下降 13 倍。\n越靠近前沿，跌得越快：每年 75 倍。',
      '电、电池、芯片、基因测序。\n人类最擅长的几样降价，都没有这个速度。',
    ];
    const READ = [
      ['536', '倍', '19 个月 · GPT-4 → Gemini 1.5 Flash-8B'],
      ['≈ 725', '倍', '不到 18 个月 · o3 → GPT-5.6 Luna'],
      ['', '', ''],
      ['6', '年', '摩尔定律追平它一年的跌幅，需要的时间'],
    ];
    const TECH = D.PRICE.tech;

    K.scene({
      id: 'price',
      title: '思想的价格',
      enterWith: 'drop',
      beats: [{ dur: 6.0, hold: 3.2 }, { dur: 5.6, hold: 3.2 }, { dur: 4.4, hold: 3.6 }, { dur: 3.4, hold: 6 }],
      thumbBeat: 0,
      notes: [
        '价格，是比算力更诚实的尺子：它把算力、算法、竞争全算进去了。\nGPT-4 级别的智能，2023 年 3 月每百万 token 37.5 美元；2024 年 10 月，7 美分。十九个月，536 倍。',
        '再看一道题。GPQA，博士水平的物理化学生物题。o3 答一道 30 美分；不到 18 个月，GPT-5.6 Luna 答得一样好，0.04 美分。\n（价格是四舍五入的，Epoch 按原始数字算出 725 倍。）',
        '这不是某一个模型的促销。Epoch 把「达到某个固定成绩的最低价」连成线：2023 年以来，每季度跌 47%，一年 13 倍。\n那么别的技术要跌这么多，得花多少年？（让观众自己看那几根条。）',
        'Epoch 的对照：AI 一年的跌幅，DNA 测序要四年，摩尔定律下的算力要六年，锂电池要十八年，电气化早期的电要五十四年。\n而它跌价的同时，还在变强。这是经济学里没有先例的组合。',
      ],
      create(ctx) {
        const { gfx } = ctx;
        const ov = ctx.overlay();
        const V = K.vec(ctx);
        const bgp = K.bg(ctx, { grid: 1, vig: 0.45 });
        const rt = gfx.target({});
        const rtP = gfx.target({});
        K.chrome(ctx, ov, { act: act1 });

        const grid = [];
        for (let e = 2; e >= -4; e--) {
          const v = Math.pow(10, e);
          const ln = V.line(2, { width: e >= 0 ? 1.4 : 1, color: e >= 0 ? HDR.dim : HDR.faint, order: 2 });
          ln.set([X0 - 30, Y(v), X1 + 20, Y(v)]);
          const lab = K.text(ctx, ov, '$' + (v >= 0.01 ? v.toFixed(2) : v.toFixed(-e)), 'mono', { x: X0 - 42, y: Y(v), size: 19, align: 'right', valign: 'middle', color: T.dim });
          grid.push({ ln, lab });
        }
        const xlab = [];
        for (let y = 2023; y <= 2026; y++) xlab.push(K.text(ctx, ov, String(y), 'monoS', { x: X(y + 0.5), y: Y1 + 12, align: 'center', valign: 'top', color: T.faint }));
        const axis = V.line(4, { width: 1.5, color: HDR.dim, order: 3 });
        axis.set([X0 - 34, Y0 - 30, X0 - 34, Y1 + 1, X1 + 30, Y1 + 1]);
        const la = V.line(4, { width: 3, color: HDR.white, order: 8 });
        const lb = V.line(4, { width: 3, color: HDR.ember, glow: 1, order: 9 });
        const dots = V.dots(10, { order: 12 });
        const tags = TAGS.map((tg) => {
          tg.x = X(tg.t);
          tg.y = Y(tg.p);
          tg.b = K.text(ctx, ov, [{ t: tg.txt, font: 'didot', size: tg.p < 1 ? 52 : 64, color: tg.series === 'b' ? T.ember : T.white }, { t: `\n${tg.name} · ${tg.date}`, font: 'mono', size: 19, color: T.dim }], 'mono', { x: 0, y: 0, align: tg.al, valign: tg.dy < 0 ? 'bottom' : 'top', leading: 1.12 });
          return tg;
        });

        const heads = HEADS.map((t) => K.text(ctx, ov, t, 'h1', { x: 136, y: 150, size: 80 }));
        const leads = LEADS.map((t) => K.text(ctx, ov, t, 'lead', { x: 140, y: 268, maxWidth: 760, size: 32 }));
        const readN = K.text(ctx, ov, '', 'didot', { x: 124, y: 440, size: 230, leading: 1.0 });
        const readU = K.text(ctx, ov, '', 'songBlack', { x: 0, y: 620, size: 64, color: T.ember });
        const readC = K.text(ctx, ov, '', 'mono', { x: 146, y: 712, size: 24, maxWidth: 760 });
        const src = K.text(ctx, ov, '数据：Epoch AI《思想的价格》2026.09 · 《大模型推理价格趋势》2025.03', 'monoS', { x: T.M, y: 1004, align: 'left', color: T.faint });

        const bars = V.rects(TECH.length, { order: 8 });
        const techLab = TECH.map(([name], i) => ({
          name: K.text(ctx, ov, name, 'text', { x: 960, y: 404 + i * 96, size: 30, align: 'right', valign: 'middle', color: i === TECH.length - 1 ? T.white : T.text }),
          val: K.text(ctx, ov, '', 'mono', { x: 0, y: 404 + i * 96, size: 26, align: 'left', valign: 'middle', color: i === TECH.length - 1 ? T.ember : T.text }),
        }));
        const techCap = K.text(ctx, ov, 'AI 推理价格一年的跌幅 · 其他技术要跌这么多，需要多少年', 'monoS', { x: 1000, y: 318, color: T.dim });

        let lastRead = '';
        const cumA = [0], cumB = [0];
        for (const [ser, cum] of [['a', cumA], ['b', cumB]]) {
          const list = tags.filter((t) => t.series === ser);
          list.forEach((t, i) => cum.push(i ? cum[i - 1] + Math.hypot(t.x - list[i - 1].x, t.y - list[i - 1].y) : 0));
        }

        return {
          update(s) {
            const b = s.beat;
            const g = K.gate(s);
            const fadeChart = b >= 2 ? 1 - K.seg(s, 2, 0, 0.25) : 1;
            const g0 = K.seg(s, 0, 0, 0.2) * g * fadeChart;
            grid.forEach(({ ln, lab }) => {
              ln.u.uAlpha.value = g0;
              ln.visible(g0 > 0.01);
              K.show(lab, g0, 'fade');
            });
            xlab.forEach((lb2) => K.show(lb2, g0, 'fade'));
            axis.u.uAlpha.value = g0;

            const landed = { a: 0, b: 0 };
            const frac = { a: 0, b: 0 };
            tags.forEach((tg, i) => {
              const inB = b === tg.beat;
              const past = b > tg.beat;
              const f = inB ? K.seg(s, b, tg.a0, tg.a1, ease.lin) : past ? 1 : 0;
              const fall = 1 - ease.in2(f);
              const vis = f > 0;
              tg.b.x = tg.x + tg.dx;
              tg.b.y = tg.y + tg.dy - fall * 600;
              tg.b.alpha = vis ? 1 : 0;
              tg.b.animate(() => {});
              tg.b.mesh.visible = vis && fadeChart > 0.3;
              const col = tg.series === 'b' ? HDR.emberHot : HDR.white;
              dots.set(i, tg.x, tg.y, 9, col, vis ? fadeChart : 0, 0.3);
              const fl = inB ? clamp((s.p[b] - tg.a1) / 0.14, 0, 1) : 1;
              dots.set(5 + i, tg.x, tg.y, 16 + 90 * ease.out3(fl), col, vis && fl < 1 ? (1 - fl) * 0.9 * fadeChart : 0, 1);
              if (vis && inB) {
                landed[tg.series] = i;
                frac[tg.series] = ease.in2(f);
              } else if (vis) landed[tg.series] = i;
              if (inB && f > 0 && f < 0.05 && K.live(s)) ctx.sfx('whoosh', { gain: 0.35, pitch: 0.8 });
              if (inB && s.p[b] >= tg.a1 && tg._lastP < tg.a1 && K.live(s)) ctx.sfx('thud', { gain: 0.7, pitch: tg.series === 'b' ? 0.7 : 1 });
              tg._lastP = inB ? s.p[b] : -1;
            });
            dots.commit();
            const drawSeries = (line, ser, cum) => {
              const list = tags.filter((t) => t.series === ser);
              const last = landed[ser];
              line.visible(last > 0 && fadeChart > 0.3);
              if (last < 1) return;
              line.set(list.slice(0, last + 1).flatMap((t) => [t.x, t.y]));
              line.draw(cum[last - 1] + (cum[last] - cum[last - 1]) * (frac[ser] || 1));
              line.u.uAlpha.value = fadeChart;
            };
            drawSeries(la, 'a', cumA);
            drawSeries(lb, 'b', cumB);

            heads.forEach((hb, i) => {
              let p = 0;
              if (i === b) p = i === 0 ? K.gate(s, 0.2, 0.7) : K.seg(s, b, 0.02, 0.2);
              else if (i === b - 1) p = 1 - K.seg(s, b, 0, 0.1);
              K.show(hb, p, 'rise', 0.3);
            });
            leads.forEach((lb2, i) => {
              let p = 0;
              if (i === b) p = i === 0 ? K.seg(s, 0, 0.22, 0.6) * g : i === 3 ? K.seg(s, b, 0.05, 0.45) : K.seg(s, b, 0.4, 0.7);
              else if (i === b - 1) p = 1 - K.seg(s, b, 0, 0.1);
              K.show(lb2, p, 'fade');
            });
            const rk = b === 2 ? '' : `${b}`;
            if (rk !== lastRead) {
              lastRead = rk;
              const r = READ[b];
              readN.set(r[0]);
              readU.set(r[1]);
              readC.set(r[2]);
            }
            const rp = b === 0 ? K.seg(s, 0, 0.78, 0.98) : b === 1 ? K.seg(s, 1, 0.64, 0.84) : b === 3 ? K.seg(s, 3, 0.1, 0.45) : 0;
            K.show(readN, rp, 'blur', 0.4);
            K.show(readU, rp, 'fade');
            K.show(readC, rp, 'fade');
            readU.x = 136 + readN.width + 22;
            readU.y = 440 + 150;
            readU.mesh.position.set(readU.x, readU.y, 0);
            K.show(src, g * 0.9, 'fade');

            const tp = K.seg(s, 2, 0.05, 0.6);
            TECH.forEach(([name, yrs, mult], i) => {
              const e = ease.out3(clamp((tp - i * 0.07) / 0.5, 0, 1));
              const len = (yrs / 54) * 740 * e;
              const last = i === TECH.length - 1;
              bars.set(i, 1000, 404 + i * 96, len, last ? 26 : 20, last ? [2.6, 0.62, 0.14] : HDR.cold, e * (last ? 1 : 0.7), 0, 0.5);
              techLab[i].val.x = 1000 + len + 20;
              techLab[i].val.set([{ t: `${yrs} 年`, font: 'monoMed', size: 28, color: i === TECH.length - 1 ? T.ember : T.white }, { t: `   每年 ×${mult.toFixed(2)}`, font: 'mono', size: 19, color: T.dim }]);
              K.show(techLab[i].name, e, 'fade');
              K.show(techLab[i].val, e, 'fade');
              if (e > 0 && techLab[i]._e === 0 && K.live(s)) ctx.sfx('tick', { gain: 0.5, pitch: 0.8 + i * 0.12 });
              techLab[i]._e = e;
            });
            bars.commit();
            K.show(techCap, tp, 'fade');
          },

          anchor() {
            return { x: 1400, y: 300 };
          },

          render(target, s) {
            bgp.render(rt, s.t, true);
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
  // S5 · 时长 — how long a task AI can finish on its own (METR time horizons)
  // ===========================================================================
  (() => {
    const X0 = 400, X1 = 1640, Y0 = 326, Y1 = 806;
    const W = X1 - X0, H = Y1 - Y0;
    const T0 = 2022.6, T1 = 2027.9;
    const X = K.scale([T0, T1], [X0, X1]);
    const Y = K.scale([3, 4e7], [Y1, Y0], true);
    const rows = D.HORIZON.map(([d, name, m, lo, hi]) => ({ t: D.dy(d), name, m, lo, hi }));
    const n = rows.length;
    // Least-squares on the models released since 2023 (the stretch METR reports as ~4 months per doubling)
    const recent = rows.filter((r) => r.t >= 2023);
    const mt = recent.reduce((a, r) => a + r.t, 0) / recent.length;
    const my = recent.reduce((a, r) => a + Math.log10(r.m), 0) / recent.length;
    const slope = recent.reduce((a, r) => a + (r.t - mt) * (Math.log10(r.m) - my), 0) / recent.reduce((a, r) => a + (r.t - mt) ** 2, 0);
    const ia = my - slope * mt;
    const allMt = rows.reduce((a, r) => a + r.t, 0) / n;
    const allMy = rows.reduce((a, r) => a + Math.log10(r.m), 0) / n;
    const allSlope = rows.reduce((a, r) => a + (r.t - allMt) * (Math.log10(r.m) - allMy), 0) / rows.reduce((a, r) => a + (r.t - allMt) ** 2, 0);
    const allDbl = (Math.log10(2) / allSlope) * 12;
    const lastT = rows[n - 1].t;
    const fit = (t) => Math.pow(10, ia + slope * t);
    const dbl = (Math.log10(2) / slope) * 12;
    const when = (min) => (Math.log10(min) - ia) / slope;
    const LEVELS = [[60, '1 分钟'], [600, '10 分钟'], [3600, '1 小时'], [86400, '1 天'], [604800, '1 周'], [2629800, '1 个月'], [31557600, '1 年']];
    const NOTE = { 3600: '一次会议', 86400: '一个工作日', 604800: '一次产品迭代', 2629800: '一个完整项目', 31557600: '一个硕士学位' };
    // model -> [text, dx, dy, align, valign]
    const LAB = { 'GPT-4': ['4 分钟', 14, 8, 'left', 'top'], 'Claude 3.7 Sonnet': ['1 小时', -14, 8, 'right', 'top'], 'GPT-5': ['3.4 小时', 14, 8, 'left', 'top'], 'Claude Opus 4.6': ['12 小时', -16, -8, 'right', 'bottom'], 'Claude Mythos Preview': ['17 小时', 14, -8, 'left', 'bottom'] };
    const HEADS = ['它能独立做完的事，正在变长。', '每 ' + Math.round(dbl) + ' 个月，翻一倍。', '照这条线走下去——', '换三把尺子，是同一条线。'];
    const CROSS = [[1440, '一整天 · 已经到了'], [10080, '一周 · 2027 年秋'], [43800, '一个月 · 2028 年中'], [525600, '一年 · 2029 年底']];
    void W; void H;

    K.scene({
      id: 'horizon',
      title: '时长',
      enterWith: 'stretch',
      beats: [{ dur: 5.6, hold: 3 }, { dur: 3.6, hold: 3 }, { dur: 5.2, hold: 3.6 }, { dur: 5.0, hold: 6 }],
      thumbBeat: 2,
      notes: [
        'METR 专门量了这件事：一个任务，人类专家要干多久，AI 才有 50% 的把握独立做完。\n2023 年的 GPT-4：4 分钟。上个月的 Claude Mythos：17 个小时。',
        '把 2023 年以后的每个模型画上去，是一条笔直的线——在对数坐标上。意思是：每 ' + dbl.toFixed(1) + ' 个月，翻一倍。和 METR 自己的估算（4.2 个月）对得上。',
        '照这条线往下走：一周，2027 年秋；一个月，2028 年中；一年，2029 年底。而「一整天」，按这条线，已经到了。\n如果按 2019 年以来的全程速度（每 ' + allDbl.toFixed(1) + ' 个月翻倍）算，这三个日期各往后推一两年。哪个对？没人知道。',
        '不信这一把尺子？换三把。「人类最后的考试」、专为抗大模型而设计的 ARC-AGI-2、博士水平的 GPQA。\n同一个形状。',
      ],
      create(ctx) {
        const { gfx } = ctx;
        const ov = ctx.overlay();
        const V = K.vec(ctx);
        const bgp = K.bg(ctx, { grid: 1, vig: 0.45 });
        const rt = gfx.target({});
        const rtP = gfx.target({});
        K.chrome(ctx, ov, { act: act1 });

        const grid = LEVELS.map(([sec, name]) => {
          const ln = V.line(2, { width: sec >= 3600 ? 1.5 : 1, color: sec >= 86400 ? HDR.dim : HDR.faint, order: 2 });
          ln.set([X0 - 34, Y(sec), X1 + 30, Y(sec)]);
          const lab = K.text(ctx, ov, name, 'mono', { x: X0 - 46, y: Y(sec), size: 20, align: 'right', valign: 'middle', color: T.dim });
          const note = NOTE[sec] ? K.text(ctx, ov, NOTE[sec], 'text', { x: X1 + 46, y: Y(sec), size: 22, valign: 'middle', color: T.faint }) : null;
          return { ln, lab, note };
        });
        const xlab = [];
        for (let y = 2023; y <= 2027; y++) xlab.push(K.text(ctx, ov, String(y), 'mono', { x: X(y), y: Y1 + 10, size: 19, align: 'center', valign: 'top', color: T.dim }));
        const axis = V.line(4, { width: 1.5, color: HDR.dim, order: 3 });
        axis.set([X0 - 38, Y0 - 30, X0 - 38, Y1 + 1, X1 + 34, Y1 + 1]);
        const now = V.line(2, { width: 1.5, color: HDR.cold, order: 4 });
        now.set([X(D.NOW), Y0 - 10, X(D.NOW), Y1]);
        const nowLab = K.text(ctx, ov, '今天', 'monoMed', { x: X(D.NOW), y: Y0 - 24, size: 20, color: T.cold, align: 'center', valign: 'bottom' });
        const bars = V.rects(n, { order: 8 });
        const dots = V.dots(n + 8, { order: 12 });
        const lineFit = V.line(8, { width: 4, color: HDR.ember, glow: 1, order: 10 });
        const lineExt = V.line(8, { width: 3, color: HDR.ember, order: 10 });
        lineExt.u.uDash.value = 16;
        lineFit.set([X(2023.0), Y(fit(2023.0) * 60), X(lastT), Y(fit(lastT) * 60)]);
        lineExt.set([X(lastT), Y(fit(lastT) * 60), X(T1), Y(fit(T1) * 60)]);
        const slopeLab = K.text(ctx, ov, `×2 每 ${dbl.toFixed(1)} 个月`, 'monoMed', { x: X(2024.55), y: Y(fit(2024.55) * 60) - 42, size: 26, color: T.ember, align: 'center', valign: 'middle' });
        slopeLab.rotation = -0.24;
        rows.forEach((r) => {
          r.x = X(r.t);
          r.y = Y(r.m * 60);
          r.yLo = Y(r.lo * 60);
          r.yHi = Y(r.hi * 60);
          r.appear = (r.t - T0) / (lastT + 0.15 - T0);
          r.b = LAB[r.name] ? K.text(ctx, ov, LAB[r.name][0], 'monoMed', { x: r.x + LAB[r.name][1], y: r.y + LAB[r.name][2], size: 22, color: T.white, align: LAB[r.name][3], valign: LAB[r.name][4] }) : null;
        });
        const cross = CROSS.map(([min, label], i) => ({
          min, label,
          b: K.text(ctx, ov, label, 'text', { x: 0, y: 0, size: i < 2 ? 26 : 30, color: i < 2 ? T.ember : T.white, align: i < 2 ? 'left' : 'left', valign: i < 2 ? 'top' : 'top' }),
        }));
        const beyond = K.text(ctx, ov, '画不下的部分：', 'mono', { x: T.R, y: 118, size: 22, color: T.dim, align: 'right' });

        // small multiples
        const MP = D.BENCH.map((bm, i) => {
          const px = 330 + i * 480, pw = 440, py = 452, ph = 392;
          const sx = K.scale([2024.3, 2028.1], [px + 16, px + pw - 16]);
          const sy = K.scale([0, 1], [py + ph, py]);
          const flat = [];
          bm.rows.forEach(([d, v], j) => {
            const x = sx(D.dy(d));
            const y = sy(v);
            if (j === 0) flat.push(x, y);
            else {
              flat.push(x, bm._prevY);
              flat.push(x, y);
            }
            bm._prevY = y;
          });
          const ln = V.line(64, { width: 3.5, color: HDR.ember, glow: 0.6, order: 10 });
          ln.set(flat);
          const frame = V.line(8, { width: 1.2, color: HDR.dim, order: 4 });
          frame.set([px, py, px, py + ph, px + pw, py + ph]);
          const title = K.text(ctx, ov, bm.name, 'textMed', { x: px, y: py + ph + 46, size: 27, color: T.white });
          const note = K.text(ctx, ov, bm.note, 'monoS', { x: px, y: py + ph + 88, size: 19, color: T.dim, maxWidth: pw });
          const v0 = bm.rows[0][1], v1 = bm.rows[bm.rows.length - 1][1];
          const a = K.text(ctx, ov, `${(v0 * 100).toFixed(v0 < 0.1 ? 1 : 0)}%`, 'mono', { x: px + 20, y: py + ph - 14, size: 22, color: T.dim, valign: 'bottom' });
          const z = K.text(ctx, ov, `${Math.round(v1 * 100)}%`, 'didot', { x: sx(D.dy(bm.rows[bm.rows.length - 1][0])) + 22, y: sy(v1), size: 66, color: T.white, align: 'left', valign: 'middle' });
          const span = K.text(ctx, ov, `${bm.rows[0][0].slice(0, 7).replace('-', '.')} → ${bm.rows[bm.rows.length - 1][0].slice(0, 7).replace('-', '.')} · 最佳模型的得分`, 'monoS', { x: px + pw, y: py + ph + 50, size: 18, color: T.faint, align: 'right' });
          return { ln, frame, title, note, a, z, span, i };
        });

        const heads = HEADS.map((t) => K.text(ctx, ov, t, 'h1', { x: 136, y: 150 }));
        const src = K.text(ctx, ov, '数据：METR Time Horizons v1.1（50% 成功率时长）· Epoch AI Benchmarking Hub', 'monoS', { x: T.M, y: 1004, align: 'left', color: T.faint });

        return {
          update(s) {
            const b = s.beat;
            const g = K.gate(s);
            const fadeMain = b >= 3 ? 1 - K.seg(s, 3, 0, 0.25) : 1;
            const g0 = K.seg(s, 0, 0, 0.18) * g * fadeMain;
            grid.forEach(({ ln, lab, note }) => {
              ln.u.uAlpha.value = g0;
              ln.visible(g0 > 0.01);
              K.show(lab, g0, 'fade');
              if (note) K.show(note, b >= 2 ? K.seg(s, 2, 0.2, 0.6) * fadeMain : 0, 'fade');
            });
            xlab.forEach((lb) => K.show(lb, g0, 'fade'));
            axis.u.uAlpha.value = g0;
            now.u.uAlpha.value = g0 * 0.8;
            K.show(nowLab, b >= 1 ? K.seg(s, 1, 0.3, 0.7) * fadeMain : 0, 'fade');

            rows.forEach((r, i) => {
              if (r.t < T0 + 0.05) {
                // released before the visible window (GPT-2, GPT-3.5): keep the slot empty
                bars.set(i, 0, 0, 0, 0, HDR.cold, 0);
                dots.set(i, 0, 0, 0, HDR.white, 0, 0);
                return;
              }
              const e = b === 0 ? ease.out3(clamp((s.p[0] - 0.06 - r.appear * 0.78) / 0.08, 0, 1)) * g : 1;
              const hgt = (r.yLo - r.yHi) * e;
              bars.set(i, r.x - 1.5, r.yHi, 3, hgt, HDR.cold, 0.55 * fadeMain, 0, 0);
              dots.set(i, r.x, r.y, 6.5 * e, HDR.white, e * fadeMain, 0.25);
              if (e > 0 && r._e === 0 && K.live(s)) ctx.sfx('tick', { gain: 0.35, pitch: 0.9 + i * 0.05 });
              r._e = e;
              if (r.b) {
                K.show(r.b, b === 0 ? ease.out2(clamp((e - 0.6) / 0.4, 0, 1)) * fadeMain : fadeMain, 'fade');
                r.b.y = r.y + LAB[r.name][2];
              }
            });
            bars.commit();
            dots.commit();

            const f1 = b === 0 ? 0 : b === 1 ? ease.io2(K.seg(s, 1, 0.05, 0.7)) : 1;
            lineFit.draw(lineFit.len * f1);
            lineFit.visible(f1 > 0.001 && fadeMain > 0.3);
            lineFit.u.uAlpha.value = fadeMain;
            lineFit.gu.uAlpha.value = 0.16 * fadeMain;
            const f2 = b >= 2 ? ease.io2(K.seg(s, 2, 0.05, 0.5)) : 0;
            lineExt.draw(lineExt.len * f2);
            lineExt.visible(f2 > 0.001 && fadeMain > 0.3);
            lineExt.u.uAlpha.value = 0.85 * fadeMain;
            K.show(slopeLab, b === 1 ? K.seg(s, 1, 0.5, 0.95) * fadeMain : b === 2 ? fadeMain : b === 0 ? 0 : fadeMain, 'fade');

            cross.forEach((c, i) => {
              const ty = when(c.min);
              const inFrame = ty <= T1;
              const on = b >= 2 ? K.seg(s, 2, 0.45 + i * 0.1, 0.75 + i * 0.1) * fadeMain : 0;
              if (inFrame) {
                const x = X(ty);
                const y = Y(fit(ty) * 60);
                dots.set(n + i, x, y, 9, HDR.emberHot, on, 0.3);
                const left = x > X1 - 330;
                c.b.o.align = left ? 'right' : 'left';
                c.b.x = x + (left ? -22 : 22);
                c.b.y = y + (left ? -16 : 18);
                c.b.o.valign = left ? 'bottom' : 'top';
              } else {
                c.b.x = 1430;
                c.b.y = 150 + (i - 2) * 52;
              }
              K.show(c.b, on, 'fade');
            });
            for (let i = cross.length; i < 8; i++) dots.set(n + i, 0, 0, 0, HDR.white, 0, 0);
            dots.commit();
            K.show(beyond, b >= 2 ? K.seg(s, 2, 0.6, 0.95) * fadeMain : 0, 'fade');

            heads.forEach((hb, i) => {
              let p = 0;
              if (i === b) p = i === 0 ? K.gate(s, 0.2, 0.7) : K.seg(s, b, 0.02, 0.22);
              else if (i === b - 1) p = 1 - K.seg(s, b, 0, 0.1);
              K.show(hb, p, 'rise', 0.3);
            });
            K.show(src, g * 0.9 * (b >= 3 ? 0 : 1), 'fade');

            const q = b >= 3 ? K.seg(s, 3, 0.05, 0.4) : 0;
            MP.forEach((m) => {
              const e = ease.io2(clamp((q - 0.15 - m.i * 0.06) / 0.55, 0, 1));
              m.ln.draw(m.ln.len * e);
              m.ln.visible(e > 0.001);
              m.frame.u.uAlpha.value = q;
              m.frame.visible(q > 0.01);
              K.show(m.title, q, 'fade');
              K.show(m.note, q, 'fade');
              K.show(m.a, q, 'fade');
              K.show(m.z, e > 0.98 ? clamp((e - 0.98) * 50, 0, 1) : 0, 'blur', 0.3);
              K.show(m.span, q, 'fade');
            });
          },

          anchor() {
            return { x: 960, y: 560 };
          },

          render(target, s) {
            bgp.render(rt, s.t, true);
            V.render(rt);
            K.post(ctx, rt, rtP, { bloom: 0.5, grain: 0.018, exposure: 1.25, vignette: 0.45, time: s.t });
            gfx.copy(rtP, target);
            ov.render(target);
          },
        };
      },
    });
  })();
})();
