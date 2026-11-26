(() => {
  'use strict';
  const LHP = (window.__LHP = window.__LHP || {});

  // ---------------------------------------------------------------------------
  // Shared helpers (read LHP.math lazily so load order / static checks are safe)
  // ---------------------------------------------------------------------------
  function getM() {
    return LHP.math;
  }

  // Normalized beat progress helper: maps s.p[b] in [a, c] -> [0, 1] with easing
  function seg(s, b, a, c, fn) {
    const M = getM();
    const e = fn || M.ease.io2;
    const p = (s.p && s.p[b]) || 0;
    return e(M.clamp((p - a) / Math.max(1e-4, c - a), 0, 1));
  }

  // Sync TextBlock transform & visibility when mutating .x/.y/.scale/.alpha directly
  function syncText(tb) {
    if (!tb || !tb.mesh) return;
    tb.mesh.position.set(tb.x, tb.y, 0);
    tb.mesh.scale.setScalar(tb.scale);
    tb.mesh.rotation.z = tb.rotation;
    tb.mesh.visible = tb.alpha > 0.001 && tb.n > 0;
  }

  // Only re-rasterize TextBlock color when hex string actually changes
  function setTextColor(tb, hex) {
    if (!tb || tb._lastCol === hex) return;
    tb._lastCol = hex;
    tb.style({ color: hex });
  }

  function makeCues() {
    const fired = new Set();
    let prevT = -1;
    let prevBeat = -1;
    return {
      step(s) {
        if (s.t < prevT - 0.05 || s.beat < prevBeat) fired.clear();
        prevT = s.t;
        prevBeat = s.beat;
      },
      fire(key, cond, s, fn) {
        if (!cond) {
          fired.delete(key);
          return;
        }
        if (fired.has(key)) return;
        fired.add(key);
        if (s.dt > 0 && s.dt < 0.25) fn();
      },
    };
  }

  function safeSfx(ctx, name, opts) {
    if (ctx && typeof ctx.sfx === 'function') ctx.sfx(name, opts);
  }

  function safeParam(ctx, name, val) {
    if (ctx && ctx.audio && typeof ctx.audio.param === 'function') {
      ctx.audio.param(name, val);
    }
  }

  function projectToView(vec3, cam, view) {
    const p = vec3.clone().project(cam);
    return {
      x: view.x0 + (p.x * 0.5 + 0.5) * view.w,
      y: view.y0 + (-p.y * 0.5 + 0.5) * view.h,
      z: p.z,
    };
  }

  function formatInt(n) {
    return Math.round(n)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  // Smooth typed string helper: computes substring during backspace -> type sequence
  function editText(fromStr, toStr, u) {
    const M = getM();
    const k = M.clamp(u, 0, 1);
    const a = Array.from(fromStr);
    const b = Array.from(toStr);
    const split = 0.36;
    if (k < split) {
      const rem = Math.ceil((1 - k / split) * a.length);
      return { text: a.slice(0, rem).join(''), editing: true, typing: false, len: rem };
    }
    const add = Math.floor(((k - split) / (1 - split)) * b.length);
    return { text: b.slice(0, Math.min(b.length, add)).join(''), editing: k < 0.999, typing: true, len: add };
  }

  // ===========================================================================
  // SCENE 1: boring — 《人类历史概览》 (Meta-narrative 4th-wall break!)
  // ===========================================================================
  const sceneBoring = {
    id: 'boring',
    title: '人类历史概览',
    enterWith: 'fade',
    beats: [
      { dur: 0.6, hold: 3.8 },
      { dur: 3.6, hold: 3.2 },
      { dur: 11.5, hold: 1.2 },
    ],
    notes: [
      '大家好。今天我们用十分钟，回顾一下人类历史的宏大进程。\n（语气平淡些，就像一场普通的科普汇报。停顿片刻。）',
      '这是大家最熟悉的历史时间轴：原始社会、农耕时代、工业革命、信息时代……每一章都工工整整，占着差不多的篇幅。\n（平稳念完，然后按下一页，不要说话。）',
      '（什么也别碰，让幻灯片自己接管舞台。看着那五个等宽的方块被压缩成屏幕最右侧不到一像素的亮线，等画面切入 46 亿年深时后再开口。）',
    ],
    page(s) {
      const M = getM();
      if (s.beat === 0) return '1';
      if (s.beat === 1) return '2';
      const p = (s.p && s.p[2]) || 0;
      if (p < 0.76) return '3';
      const u = M.clamp((p - 0.76) / 0.22, 0, 1);
      const years = Math.pow(4.6e9, Math.pow(u, 0.78));
      return formatInt(Math.max(3, Math.min(4600000000, years)));
    },

    create(ctx) {
      const { gfx } = ctx;
      const M = getM();
      const cues = makeCues();

      const rt = gfx.target({});
      const ovSlide1 = ctx.overlay();
      const ovSlide2 = ctx.overlay();
      const ovMontage = ctx.overlay();

      // --- Slide 1: Intentionally dull corporate white PPT ---
      const bg1 = new ctx.Rect2D({ color: '#ffffff', order: -10 });
      bg1.set(0, 0, 1920, 1080);
      const topRule1 = new ctx.Rect2D({ color: '#cfd6df', order: -5 });
      topRule1.set(0, 0, 1920, 12);
      const accentRule1 = new ctx.Rect2D({ color: '#5c728a', order: -4 });
      accentRule1.set(892, 404, 136, 5);
      const botTrack1 = new ctx.Rect2D({ color: '#e5e9ef', order: -5 });
      botTrack1.set(0, 1068, 1920, 12);
      const botFill1 = new ctx.Rect2D({ color: '#8f9eb0', order: -4 });
      botFill1.set(0, 1068, 192, 12);

      const kicker1 = ctx.text('通识课程 · 专题汇报', {
        x: 120, y: 128, size: 24, font: 'arial', color: '#8d97a5', align: 'left', valign: 'middle',
      });
      const title1 = ctx.text('人类历史与文明进程', {
        x: 960, y: 492, size: 88, font: 'arialBold', color: '#1b2028', align: 'center', valign: 'middle',
      });
      const sub1 = ctx.text('从远古到未来 · 概览', {
        x: 960, y: 596, size: 36, font: 'arial', color: '#788290', align: 'center', valign: 'middle',
      });
      const foot1 = ctx.text('第 1 章  背景综述', {
        x: 120, y: 1018, size: 22, font: 'arial', color: '#a0a9b5', align: 'left', valign: 'middle',
      });
      ovSlide1.add(bg1, topRule1, accentRule1, botTrack1, botFill1, kicker1, title1, sub1, foot1);

      // --- Slide 2: Boring 5-equal-box timeline + takeover elements ---
      const bg2 = new ctx.Rect2D({ color: '#ffffff', order: -10 });
      bg2.set(0, 0, 1920, 1080);
      const topRule2 = new ctx.Rect2D({ color: '#cfd6df', order: -5 });
      topRule2.set(0, 0, 1920, 12);
      const botTrack2 = new ctx.Rect2D({ color: '#e5e9ef', order: -5 });
      botTrack2.set(0, 1068, 1920, 12);
      const botFill2 = new ctx.Rect2D({ color: '#8f9eb0', order: -4 });
      botFill2.set(0, 1068, 384, 12);

      const title2 = ctx.text('时间轴概览', {
        x: 120, y: 152, size: 64, font: 'arialBold', color: '#1b2028', align: 'left', valign: 'middle',
      });
      const sub2 = ctx.text('人类演进的五个主要阶段（常规示意）', {
        x: 120, y: 226, size: 28, font: 'arial', color: '#848e9c', align: 'left', valign: 'middle',
      });
      const cursor2 = new ctx.Rect2D({ color: '#1a6bff', order: 60 });
      cursor2.alpha(0);

      // Exposed empty-void scale ruler that reveals as the 5 boxes get crushed right
      const voidBarBg = new ctx.Rect2D({ color: '#f1f4f8', border: '#dce2ea', borderWidth: 1.5, radius: 6, order: 0 });
      voidBarBg.alpha(0);
      const voidLabel = ctx.text('←  46 亿年地球史（被常规时间轴省略的前 99.9999%）', {
        x: 152, y: 513, size: 26, font: 'mono', color: '#8c97a8', align: 'left', valign: 'middle',
      });
      voidLabel.alpha = 0;
      syncText(voidLabel);

      const sliverCallout = ctx.text('人类文明全部历史  < 1 px', {
        x: 1765, y: 318, size: 26, font: 'monoMed', color: '#d9381e', align: 'right', valign: 'middle',
      });
      sliverCallout.alpha = 0;
      syncText(sliverCallout);
      const sliverLine = new ctx.Rect2D({ color: '#ff5226', order: 55 });
      sliverLine.alpha(0);

      const ERAS = [
        { name: '原始社会', sub: '采集与狩猎', idx: '01' },
        { name: '农耕时代', sub: '定居与城邦', idx: '02' },
        { name: '工业革命', sub: '蒸汽与机械', idx: '03' },
        { name: '信息时代', sub: '算力与网络', idx: '04' },
        { name: '未来展望', sub: '星辰与未知', idx: '05' },
      ];

      const boxCards = [];
      const boxTops = [];
      const boxTitles = [];
      const boxSubs = [];
      const boxNums = [];
      const arrows = [];
      const ticks = [];

      const BASE_X0 = 120;
      const BASE_X1 = 1800;
      const BASE_Y = 390;
      const BASE_H = 246;
      const BASE_GAP = 48;
      const BASE_W = (BASE_X1 - BASE_X0 - BASE_GAP * 4) / 5; // 297.6

      for (let i = 0; i < 5; i++) {
        const bx = BASE_X0 + i * (BASE_W + BASE_GAP);
        const card = new ctx.Rect2D({
          color: '#f1f5fa', border: '#c4cfdd', borderWidth: 2, radius: 8, shadow: 10, order: 10 + i,
        });
        card.set(bx, BASE_Y, BASE_W, BASE_H);

        const top = new ctx.Rect2D({ color: '#6b829e', radius: 2, order: 16 + i });
        top.set(bx, BASE_Y, BASE_W, 10);

        const num = ctx.text(ERAS[i].idx, {
          x: bx + 26, y: BASE_Y + 46, size: 22, font: 'mono', color: '#8a99ad', align: 'left', valign: 'middle', order: 22,
        });
        const nm = ctx.text(ERAS[i].name, {
          x: bx + BASE_W * 0.5, y: BASE_Y + 116, size: 38, font: 'arialBold', color: '#242c38', align: 'center', valign: 'middle', order: 23,
        });
        const sb = ctx.text(ERAS[i].sub, {
          x: bx + BASE_W * 0.5, y: BASE_Y + 174, size: 23, font: 'arial', color: '#6e7b8c', align: 'center', valign: 'middle', order: 23,
        });

        boxCards.push(card);
        boxTops.push(top);
        boxNums.push(num);
        boxTitles.push(nm);
        boxSubs.push(sb);
        ovSlide2.add(card, top, num, nm, sb);

        if (i < 4) {
          const arr = ctx.text('→', {
            x: bx + BASE_W + BASE_GAP * 0.5, y: BASE_Y + BASE_H * 0.5, size: 34, font: 'arial', color: '#9aa8ba', align: 'center', valign: 'middle', order: 15,
          });
          arrows.push(arr);
          ovSlide2.add(arr);
        }

        const tk = new ctx.Rect2D({ color: '#a8b5c6', order: 8 });
        tk.set(bx + BASE_W * 0.5 - 1.5, 744, 3, 18);
        ticks.push(tk);
        ovSlide2.add(tk);
      }

      const flatTrack = new ctx.Rect2D({ color: '#dde3ec', radius: 4, order: 6 });
      flatTrack.set(BASE_X0, 750, BASE_X1 - BASE_X0, 8);
      const flatFill = new ctx.Rect2D({ color: '#7087a3', radius: 4, order: 7 });
      flatFill.set(BASE_X0, 750, BASE_X1 - BASE_X0, 8);
      const foot2 = ctx.text('时间比例示意（等分）', {
        x: 120, y: 804, size: 22, font: 'arial', color: '#9aa4b2', align: 'left', valign: 'middle',
      });

      const sel = new ctx.SelectBox({ color: '#1a6bff', handle: 9, line: 2.5, knob: true, glow: 0.2, fill: 0.05 });
      sel.alpha(0);

      ovSlide2.add(
        bg2, topRule2, botTrack2, botFill2, voidBarBg, voidLabel, sliverLine,
        sliverCallout, flatTrack, flatFill, foot2, title2, sub2, cursor2, sel
      );

      // --- Phase D: Explosive kinetic montage overlay ---
      const montageBig = ctx.text('46亿年', {
        x: 960, y: 500, size: 230, font: 'displayBold', color: '#f7c552', align: 'center', valign: 'middle', tracking: -0.02, order: 40,
      });
      const montageSub = ctx.text('4,600,000,000 YEARS · DEEP TIME', {
        x: 960, y: 678, size: 34, font: 'monoMed', color: '#e6c88a', align: 'center', valign: 'middle', tracking: 0.14, order: 41,
      });
      const montageTop = ctx.text('REAL SCALE RECALIBRATION', {
        x: 960, y: 312, size: 22, font: 'mono', color: '#8f9bb0', align: 'center', valign: 'middle', tracking: 0.22, order: 41,
      });
      ovMontage.add(montageBig, montageSub, montageTop);

      // Fullscreen GLSL shader for glowing sliver flare + explosive montage backdrop
      const fxPass = gfx.pass(
        M.GLSL_NOISE + `
        uniform sampler2D tSlide;
        uniform float uSliver;
        uniform float uSliverX;
        uniform float uMontage;
        uniform float uStage;
        uniform float uFlash;
        uniform float uCollapse;

        void main() {
          vec3 col = texture(tSlide, vUv).rgb;

          // Glowing razor-thin sliver flare on right edge when boxes collapse
          if (uSliver > 0.001) {
            float dx = abs(vUv.x - uSliverX) * (uRes.x / max(uRes.y, 1.0));
            float dy = abs(vUv.y - 0.525);
            float vertMask = smoothstep(0.24, 0.08, dy);
            float core = exp(-dx * 420.0) * vertMask;
            float halo = exp(-dx * 32.0) * smoothstep(0.32, 0.0, dy);
            vec3 flareCol = mix(vec3(1.0, 0.36, 0.12), vec3(1.0, 0.94, 0.72), core);
            col += flareCol * (core * 2.4 + halo * 0.65) * uSliver;
          }

          // Explosive dark / gold / crimson montage takeover
          if (uMontage > 0.001) {
            vec2 p = (vUv - 0.5) * vec2(uRes.x / max(uRes.y, 1.0), 1.0);
            float n = fbm(vec2(vUv.x * 9.0 + uTime * 2.4, vUv.y * 5.0));

            vec3 bgA = vec3(0.025, 0.030, 0.048); // obsidian
            vec3 acA = vec3(0.98, 0.72, 0.22);    // gold
            vec3 bgB = vec3(0.075, 0.014, 0.022); // crimson black
            vec3 acB = vec3(1.0, 0.26, 0.14);     // vermilion
            vec3 bgC = vec3(0.015, 0.022, 0.040); // deep cosmos
            vec3 acC = vec3(1.0, 0.94, 0.78);     // white-gold

            vec3 bg = uStage < 0.5 ? bgA : (uStage < 1.5 ? bgB : bgC);
            vec3 ac = uStage < 0.5 ? acA : (uStage < 1.5 ? acB : acC);

            float gridX = smoothstep(0.975, 1.0, abs(sin(vUv.x * 160.0 + uTime * 3.0)));
            float rulerBand = smoothstep(0.08, 0.0, abs(vUv.y - 0.5));
            float beam = exp(-abs(vUv.y - 0.5) * mix(22.0, 120.0, uCollapse));
            float radial = exp(-dot(p, p) * 2.2);

            vec3 mCol = bg * (0.75 + 0.5 * n);
            mCol += ac * radial * 0.24;
            mCol += ac * gridX * rulerBand * 0.18;
            mCol += ac * beam * (0.35 + 1.45 * uCollapse);
            mCol += ac * uFlash * 0.65;

            col = mix(col, mCol, uMontage);
          }

          o = vec4(clamp(col, 0.0, 1.0), 1.0);
        }`,
        {
          tSlide: null,
          uSliver: 0,
          uSliverX: 1800 / 1920,
          uMontage: 0,
          uStage: 0,
          uFlash: 0,
          uCollapse: 0,
        }
      );

      let lastTitleStr = '时间轴概览';
      let lastMontageBig = '46亿年';
      let lastMontageSub = '4,600,000,000 YEARS · DEEP TIME';
      let lastTypingLen = -1;
      let activeMode = 0; // 0=slide1, 1=slide2, 2=montage

      const state = {
        sliver: 0,
        sliverU: 1800 / 1920,
        montage: 0,
        stage: 0,
        flash: 0,
        collapse: 0,
      };

      function setTitle2(str) {
        if (str !== lastTitleStr) {
          lastTitleStr = str;
          title2.set(str);
        }
      }

      return {
        update(s) {
          cues.step(s);
          const v = s.view;

          // Keep white slide full-bleed across desktop, ultrawide & mobile portrait!
          bg1.set(v.x0 - 4, v.y0 - 4, v.w + 8, v.h + 8);
          topRule1.set(v.x0, v.y0, v.w, 12);
          botTrack1.set(v.x0, v.y1 - 12, v.w, 12);
          botFill1.set(v.x0, v.y1 - 12, v.w * 0.12, 12);

          bg2.set(v.x0 - 4, v.y0 - 4, v.w + 8, v.h + 8);
          topRule2.set(v.x0, v.y0, v.w, 12);
          botTrack2.set(v.x0, v.y1 - 12, v.w, 12);
          botFill2.set(v.x0, v.y1 - 12, v.w * 0.22, 12);

          // Map virtual x = 1800 to exact screen UV for the sliver flare shader
          state.sliverU = (1800 - v.x0) / Math.max(1, v.w);

          safeParam(ctx, 'wind', 0);
          safeParam(ctx, 'water', 0);
          safeParam(ctx, 'hum', s.beat === 2 && s.p[2] > 0.5 ? 0.35 : 0);
          safeParam(ctx, 'tension', s.beat === 2 ? M.smoothstep(0.25, 0.95, s.p[2]) : 0);

          state.sliver = 0;
          state.montage = 0;
          state.stage = 0;
          state.flash = 0;
          state.collapse = 0;

          if (s.beat === 0) {
            activeMode = 0;
            const k0 = M.ease.out3(M.clamp(s.p[0] || 0, 0, 1));
            title1.alpha = Math.max(0.02, k0);
            sub1.alpha = M.smoothstep(0.12, 0.9, k0);
            kicker1.alpha = Math.max(0.02, k0);
            foot1.alpha = Math.max(0.02, k0);
            syncText(title1);
            syncText(sub1);
            syncText(kicker1);
            syncText(foot1);
            return;
          }

          if (s.beat === 1) {
            activeMode = 1;
            setTitle2('时间轴概览');
            setTextColor(title2, '#1b2028');
            title2.alpha = seg(s, 1, 0.0, 0.25, M.ease.out2);
            sub2.alpha = seg(s, 1, 0.08, 0.32, M.ease.out2);
            syncText(title2);
            syncText(sub2);
            cursor2.alpha(0);
            sel.alpha(0);
            voidBarBg.alpha(0);
            voidLabel.alpha = 0;
            syncText(voidLabel);
            sliverCallout.alpha = 0;
            syncText(sliverCallout);
            sliverLine.alpha(0);
            flatTrack.set(BASE_X0, 750, BASE_X1 - BASE_X0, 8);
            flatTrack.alpha(seg(s, 1, 0.18, 0.46, M.ease.out2));
            flatFill.set(BASE_X0, 750, (BASE_X1 - BASE_X0) * seg(s, 1, 0.22, 0.85, M.ease.io2), 8);
            flatFill.color('#7087a3');
            flatFill.alpha(1);
            foot2.alpha = seg(s, 1, 0.28, 0.58, M.ease.out2);
            syncText(foot2);

            for (let i = 0; i < 5; i++) {
              const ki = seg(s, 1, 0.12 + i * 0.11, 0.38 + i * 0.11, M.ease.out3);
              const bx = BASE_X0 + i * (BASE_W + BASE_GAP);
              const dy = (1 - ki) * 28;
              boxCards[i].set(bx, BASE_Y + dy, BASE_W, BASE_H);
              boxCards[i].alpha(ki);
              boxCards[i].color('#f1f5fa');
              boxTops[i].set(bx, BASE_Y + dy, BASE_W, 10);
              boxTops[i].alpha(ki);

              boxNums[i].x = bx + 26;
              boxNums[i].y = BASE_Y + dy + 46;
              boxNums[i].alpha = ki;
              syncText(boxNums[i]);

              boxTitles[i].x = bx + BASE_W * 0.5;
              boxTitles[i].y = BASE_Y + dy + 116;
              boxTitles[i].scale = 1;
              boxTitles[i].alpha = ki;
              syncText(boxTitles[i]);

              boxSubs[i].x = bx + BASE_W * 0.5;
              boxSubs[i].y = BASE_Y + dy + 174;
              boxSubs[i].alpha = ki;
              syncText(boxSubs[i]);

              ticks[i].set(bx + BASE_W * 0.5 - 1.5, 744, 3, 18);
              ticks[i].alpha(ki);

              if (i < 4) {
                const ka = seg(s, 1, 0.24 + i * 0.11, 0.44 + i * 0.11, M.ease.out2);
                arrows[i].x = bx + BASE_W + BASE_GAP * 0.5;
                arrows[i].y = BASE_Y + BASE_H * 0.5;
                arrows[i].alpha = ka;
                syncText(arrows[i]);
              }
            }
            return;
          }

          // --- BEAT 2: THE TAKEOVER! ---
          const p = s.p[2] || 0;
          activeMode = p < 0.78 ? 1 : 2;

          if (p < 0.78) {
            const inA = p < 0.25;
            const inB = p >= 0.25 && p < 0.58;
            const inC = p >= 0.58;

            sub2.alpha = M.clamp(1 - (p - 0.02) * 8, 0, 1);
            foot2.alpha = M.clamp(1 - (p - 0.26) * 8, 0, 1);
            syncText(sub2);
            syncText(foot2);

            let currentCursor = false;
            if (inA) {
              cues.fire('sel1', p >= 0.005, s, () => safeSfx(ctx, 'select', { gain: 0.85 }));
              const ed = editText('时间轴概览', '这条时间轴，骗了你。', M.clamp((p - 0.055) / 0.165, 0, 1));
              setTitle2(ed.text);
              if (ed.editing && ed.len !== lastTypingLen) {
                lastTypingLen = ed.len;
                if (s.dt > 0 && s.dt < 0.25) {
                  safeSfx(ctx, ed.typing ? 'type' : 'delete', { gain: 0.65, pitch: 0.92 + (ed.len % 5) * 0.04 });
                }
              }
              setTextColor(title2, p > 0.12 ? '#0e1420' : '#1b2028');
              title2.alpha = 1;
              syncText(title2);
              currentCursor = p >= 0.05 && p < 0.23;

              const selIn = M.clamp(p / 0.045, 0, 1);
              const selOut = 1 - M.clamp((p - 0.22) / 0.03, 0, 1);
              sel.color('#1a6bff').glow(0.25).fill(0.04).knob(true).dash(0, 0);
              sel.around(title2, 22);
              sel.appear(selIn);
              sel.alpha(M.clamp(selIn * 2.5, 0, 1) * selOut);
            } else if (inB) {
              setTitle2('这条时间轴，骗了你。');
              setTextColor(title2, '#0e1420');
              title2.alpha = 1;
              syncText(title2);
              lastTypingLen = -1;
            } else if (inC) {
              cues.fire('sel3', p >= 0.585, s, () => safeSfx(ctx, 'select', { gain: 0.9, pitch: 1.08 }));
              const ed = editText('这条时间轴，骗了你。', '按真实比例，重画一遍。', M.clamp((p - 0.605) / 0.145, 0, 1));
              setTitle2(ed.text);
              if (ed.editing && ed.len !== lastTypingLen) {
                lastTypingLen = ed.len;
                if (s.dt > 0 && s.dt < 0.25) {
                  safeSfx(ctx, ed.typing ? 'type' : 'delete', { gain: 0.72, pitch: 0.96 + (ed.len % 4) * 0.05 });
                }
              }
              setTextColor(title2, '#0b101a');
              title2.alpha = 1;
              syncText(title2);
              currentCursor = p >= 0.60 && p < 0.76;

              const selIn = M.clamp((p - 0.58) / 0.035, 0, 1);
              const selOut = 1 - M.clamp((p - 0.75) / 0.03, 0, 1);
              sel.color('#1a6bff').glow(0.35).fill(0.05).knob(true).dash(0, 0);
              sel.around(title2, 22);
              sel.appear(selIn);
              sel.alpha(M.clamp(selIn * 2.5, 0, 1) * selOut);
            }

            if (currentCursor) {
              const blink = Math.sin(s.t * 13) > -0.15 ? 1 : 0.15;
              const cx = title2.x + title2.width + 10;
              cursor2.set(cx, title2.y - 34, 4, 68);
              cursor2.alpha(blink);
            } else {
              cursor2.alpha(0);
            }

            // Compression progress (0.31 -> 0.54)
            const compRaw = M.clamp((p - 0.31) / 0.23, 0, 1);
            const comp = M.ease.in3(compRaw) * 0.75 + M.ease.io3(compRaw) * 0.25;

            cues.fire('selBoxes', p >= 0.255, s, () => safeSfx(ctx, 'select', { gain: 0.95, pitch: 0.9 }));
            cues.fire('creak', p >= 0.32, s, () => safeSfx(ctx, 'creak', { gain: 0.85 }));
            cues.fire('whoosh', p >= 0.42, s, () => safeSfx(ctx, 'whoosh', { gain: 0.9, pitch: 1.1 }));
            cues.fire('snap', p >= 0.535, s, () => safeSfx(ctx, 'snap', { gain: 1.0 }));

            // Total span shrinks from 1680px down to 1.8px at x = 1800
            const totalW = M.lerp(BASE_X1 - BASE_X0, 1.8, comp);
            const leftX = BASE_X1 - totalW;
            const gap = M.lerp(BASE_GAP, 0, M.clamp(comp * 2.2, 0, 1));
            const boxW = Math.max(0.36, (totalW - gap * 4) / 5);

            // Exposed void bar on the left
            const voidFade = M.smoothstep(0.18, 0.55, comp);
            if (voidFade > 0.005) {
              voidBarBg.set(BASE_X0, BASE_Y + 6, Math.max(20, leftX - BASE_X0 - 16), BASE_H - 12);
              voidBarBg.alpha(voidFade * 0.85);
              voidLabel.alpha = M.smoothstep(0.45, 0.85, comp);
            } else {
              voidBarBg.alpha(0);
              voidLabel.alpha = 0;
            }
            syncText(voidLabel);

            const textFade = M.clamp(1 - comp * 2.6, 0, 1);
            const arrowFade = M.clamp(1 - comp * 4.5, 0, 1);

            for (let i = 0; i < 5; i++) {
              const bx = leftX + i * (boxW + gap);
              boxCards[i].set(bx, BASE_Y, boxW, BASE_H);
              boxCards[i].alpha(1 - M.smoothstep(0.92, 1.0, comp) * 0.5);
              boxCards[i].color(comp > 0.82 ? '#ff6a2b' : '#f1f5fa');
              boxTops[i].set(bx, BASE_Y, boxW, 10);
              boxTops[i].alpha(1 - M.smoothstep(0.88, 1.0, comp));

              boxNums[i].x = bx + Math.min(26, boxW * 0.12);
              boxNums[i].y = BASE_Y + 46;
              boxNums[i].alpha = textFade;
              syncText(boxNums[i]);

              boxTitles[i].x = bx + boxW * 0.5;
              boxTitles[i].y = BASE_Y + 116;
              boxTitles[i].scale = M.lerp(1, 0.65, M.clamp(comp * 2.2, 0, 1));
              boxTitles[i].alpha = textFade;
              syncText(boxTitles[i]);

              boxSubs[i].x = bx + boxW * 0.5;
              boxSubs[i].y = BASE_Y + 174;
              boxSubs[i].alpha = M.clamp(1 - comp * 3.4, 0, 1);
              syncText(boxSubs[i]);

              ticks[i].set(bx + boxW * 0.5 - 1.5, 744, 3, 18);
              ticks[i].alpha(1 - comp * 0.85);

              if (i < 4) {
                arrows[i].x = bx + boxW + gap * 0.5;
                arrows[i].y = BASE_Y + BASE_H * 0.5;
                arrows[i].alpha = arrowFade;
                syncText(arrows[i]);
              }
            }

            flatTrack.set(BASE_X0, 750, BASE_X1 - BASE_X0, 8);
            flatTrack.alpha(1);
            flatFill.set(leftX, 750, Math.max(2.5, totalW), 8);
            flatFill.color(comp > 0.75 ? '#e03e1a' : '#7087a3');
            flatFill.alpha(1);

            const sliverK = M.smoothstep(0.88, 1.0, comp);
            state.sliver = sliverK * (1 - M.smoothstep(0.74, 0.78, p));
            sliverLine.set(BASE_X1 - 1.5, BASE_Y - 18, 3, BASE_H + 36);
            sliverLine.alpha(sliverK);
            sliverCallout.alpha = M.smoothstep(0.54, 0.59, p);
            syncText(sliverCallout);

            if (inB) {
              const sbIn = M.clamp((p - 0.25) / 0.045, 0, 1);
              const sbOut = 1 - M.clamp((p - 0.555) / 0.025, 0, 1);
              sel.color(comp > 0.85 ? '#ff4d22' : '#1a6bff');
              sel.glow(0.25 + comp * 0.75).fill(0.05 + comp * 0.06).knob(false);
              sel.dash(comp > 0.05 ? 20 : 0, s.t * 2.5);
              sel.set(leftX - 10, BASE_Y - 14, Math.max(18, totalW + 20), BASE_H + 28);
              sel.appear(sbIn);
              sel.alpha(M.clamp(sbIn * 3, 0, 1) * sbOut);
            }
          } else {
            // Phase D: Explosive kinetic montage (0.78 -> 1.00)
            const mp = M.clamp((p - 0.78) / 0.22, 0, 1);
            state.montage = M.smoothstep(0.0, 0.08, mp);

            let stage = 0;
            let bigStr = '46亿年';
            let subStr = '4,600,000,000 YEARS · DEEP TIME';
            let bigCol = '#f7c552';
            let subCol = '#e6c88a';
            let localK = 0;

            if (mp < 0.34) {
              stage = 0;
              localK = mp / 0.34;
              cues.fire('boom1', mp >= 0.01, s, () => safeSfx(ctx, 'boom', { gain: 0.95 }));
            } else if (mp < 0.67) {
              stage = 1;
              localK = (mp - 0.34) / 0.33;
              bigStr = '真实尺度';
              subStr = '1920 PIXELS · NO MORE EQUAL BOXES';
              bigCol = '#ff5430';
              subCol = '#ffb399';
              cues.fire('boom2', mp >= 0.34, s, () => safeSfx(ctx, 'slam', { gain: 0.95 }));
            } else {
              stage = 2;
              localK = (mp - 0.67) / 0.33;
              bigStr = '最后一格';
              subStr = 'HUMAN HISTORY  <  0.002 PIXEL';
              bigCol = '#fff6d8';
              subCol = '#f0cf85';
              cues.fire('boom3', mp >= 0.67, s, () => safeSfx(ctx, 'sub', { gain: 1.0 }));
              state.collapse = M.ease.in2(M.clamp((localK - 0.45) / 0.55, 0, 1));
            }

            state.stage = stage;
            state.flash = Math.exp(-localK * 9.0);

            if (bigStr !== lastMontageBig) {
              lastMontageBig = bigStr;
              montageBig.set(bigStr);
            }
            if (subStr !== lastMontageSub) {
              lastMontageSub = subStr;
              montageSub.set(subStr);
            }
            setTextColor(montageBig, bigCol);
            setTextColor(montageSub, subCol);
            montageBig.scale = M.lerp(1.16, 0.98, M.ease.out3(localK)) * (1 - state.collapse * 0.25);
            montageBig.alpha = 1 - state.collapse * 0.85;
            montageSub.alpha = M.smoothstep(0.05, 0.25, localK) * (1 - state.collapse);
            montageTop.alpha = 0.65 * (1 - state.collapse);
            syncText(montageBig);
            syncText(montageSub);
            syncText(montageTop);
          }
        },

        render(target, s) {
          if (activeMode === 0) {
            gfx.draw(ovSlide1.scene, ctx.view.cam, rt, { clear: true, color: '#ffffff', alpha: 1 });
          } else if (activeMode === 1) {
            gfx.draw(ovSlide2.scene, ctx.view.cam, rt, { clear: true, color: '#ffffff', alpha: 1 });
          } else {
            gfx.draw(ovMontage.scene, ctx.view.cam, rt, { clear: true, color: '#05060a', alpha: 1 });
          }

          if (activeMode === 2 || state.sliver > 0.001) {
            fxPass.u.tSlide.value = rt.texture;
            fxPass.u.uSliver.value = state.sliver;
            fxPass.u.uSliverX.value = state.sliverU;
            fxPass.u.uMontage.value = state.montage;
            fxPass.u.uStage.value = state.stage;
            fxPass.u.uFlash.value = state.flash;
            fxPass.u.uCollapse.value = state.collapse;
            fxPass.u.uTime.value = s.t;
            fxPass.render(target, true);

            if (activeMode === 2) {
              ovMontage.render(target);
            }
          } else {
            gfx.copy(rt, target);
          }
        },

        dispose() {
          gfx.free(rt);
          fxPass.dispose();
        },
      };
    },
  };

  // ===========================================================================
  // SCENE 2: scale — 《1920 像素的地球》 (3D Astronomical Ruler & Microscope Zoom)
  // ===========================================================================
  const sceneScale = {
    id: 'scale',
    title: '1920 像素的地球',
    enterWith: 'line',
    beats: [
      { dur: 5.0, delay: 0.8, hold: 3.5 },
      { dur: 6.0, hold: 3.5 },
      { dur: 6.0, hold: 3.5 },
      { dur: 7.0, hold: 5.0 },
    ],
    notes: [
      '把地球四十六亿年的全部历史，严格按比例压成眼前这 1920 个像素。最左侧的三百三十个像素，是滚烫的岩浆海与密集的陨石雨。',
      '接下来的三百三十到一千六百九十像素——几乎占满整块屏幕——没有森林，没有鱼群，甚至没有一只眼睛。只有单细胞微生物，在海里静静运转了三十亿年。',
      '直到第 1694 像素，寒武纪大爆发才让复杂生命突然盛放。恐龙称霸了 69 个像素，看起来漫长，其实已经在屏幕最右边了。',
      '现在把镜头推进到最后一格——第 1920 像素的最右边缘，放大十倍、一千倍、十万倍。整部有文字记载的人类文明史，只有 0.002 像素，连屏幕上一个子像素都填不满。',
    ],
    page(s) {
      if (s.beat === 0) return '4,600,000,000 年前';
      if (s.beat === 1) return '3,800,000,000 年前';
      if (s.beat === 2) return '540,000,000 年前';
      return '5,000 年前';
    },

    create(ctx) {
      const { THREE, gfx } = ctx;
      const M = getM();
      const cues = makeCues();

      const rt3d = gfx.target({ depth: true });
      const rtComp = gfx.target({});
      const scene3d = new THREE.Scene();
      const cam = new THREE.PerspectiveCamera(42, gfx.aspect || 16 / 9, 0.1, 220);

      // 1. Deep space volumetric cosmos backdrop + microscopic 1px cross-section
      const bgPass = gfx.pass(
        M.GLSL_NOISE + `
        uniform float uEpoch;
        uniform float uZoom;
        uniform vec2 uMouse;
        void main() {
          float asp = uRes.x / max(uRes.y, 1.0);
          vec2 p = (vUv - 0.5) * vec2(asp, 1.0);
          p += uMouse * 0.03;

          vec3 c0 = vec3(0.032, 0.015, 0.012); // Hadean warm charcoal
          vec3 c1 = vec3(0.008, 0.024, 0.046); // Microbial deep ocean navy
          vec3 c2 = vec3(0.015, 0.019, 0.044); // Cambrian cosmic indigo
          vec3 c3 = vec3(0.012, 0.013, 0.020); // Microscope obsidian

          vec3 base = mix(c0, c1, smoothstep(0.0, 1.0, uEpoch));
          base = mix(base, c2, smoothstep(1.0, 2.0, uEpoch));
          base = mix(base, c3, smoothstep(2.0, 3.0, uEpoch));

          float neb = fbm(p * 2.4 + vec2(uEpoch * 0.8, uTime * 0.02));
          vec3 nebCol = mix(vec3(0.50, 0.15, 0.05), vec3(0.05, 0.36, 0.56), smoothstep(0.0, 1.0, uEpoch));
          nebCol = mix(nebCol, vec3(0.18, 0.55, 0.46), smoothstep(1.3, 2.2, uEpoch));
          nebCol = mix(nebCol, vec3(0.55, 0.42, 0.18), smoothstep(2.3, 3.0, uEpoch));

          vec3 col = base + nebCol * pow(max(neb, 0.0), 2.2) * 0.30;

          // Starfield
          vec2 stCell = floor((vUv + uMouse * 0.01) * 180.0);
          vec2 stF = fract((vUv + uMouse * 0.01) * 180.0) - 0.5;
          float rnd = hash12(stCell);
          if (rnd > 0.964) {
            float d = length(stF);
            float tw = 0.65 + 0.35 * sin(uTime * (2.0 + rnd * 6.0) + rnd * 60.0);
            col += vec3(0.75, 0.86, 1.0) * smoothstep(0.14, 0.0, d) * tw * 0.58;
          }

          // Subtle dark readability scrim in upper-left text zone
          float scrim = smoothstep(0.65, 0.0, length((vUv - vec2(0.28, 0.72)) * vec2(1.0, 1.4)));
          col *= (1.0 - scrim * 0.34);

          // Microscopic golden filament cross-section glow when zooming into pixel #1920
          if (uZoom > 0.01) {
            float edgeX = 0.86;
            float dx = abs(vUv.x - edgeX);
            float barH = smoothstep(0.20, 0.02, abs(vUv.y - 0.46));
            float leftWall = exp(-abs(vUv.x - 0.14) * 260.0) * barH * 0.42;
            float rightWall = exp(-dx * 320.0) * barH * 0.65;
            float subGrid = smoothstep(0.985, 1.0, abs(sin((vUv.x - 0.14) / 0.72 * 3.14159 * 20.0))) * barH * 0.14;
            float filament = exp(-dx * 1300.0) * smoothstep(0.24, 0.0, abs(vUv.y - 0.46));
            float halo = exp(-dx * 52.0) * smoothstep(0.26, 0.0, abs(vUv.y - 0.46));
            col += vec3(0.22, 0.45, 0.74) * (leftWall + subGrid) * uZoom;
            col += vec3(1.0, 0.88, 0.55) * (rightWall + halo * 0.6) * uZoom;
            col += vec3(1.5, 1.32, 0.95) * filament * 2.4 * uZoom;
          }

          o = vec4(max(col, 0.0), 1.0);
        }`,
        { uEpoch: 0, uZoom: 0, uMouse: new THREE.Vector2() }
      );

      // 2. 3D Astronomical Ruler Ribbon along X ∈ [-24, +24] (maps u ∈ [0, 1] -> 0..1920 px)
      const RIBBON_LEN = 48;
      const ribbonGeom = new THREE.PlaneGeometry(RIBBON_LEN, 4.2, 240, 8);
      ribbonGeom.rotateX(-Math.PI * 0.42);
      const ribbonMat = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uFocusU: { value: 0.08 },
          uZoom: { value: 0 },
        },
        vertexShader: `
          out vec2 vUv;
          uniform float uTime;
          void main() {
            vUv = uv;
            vec3 pos = position;
            float wave = sin(uv.x * 26.0 - uTime * 1.1) * 0.08 * (1.0 - smoothstep(0.88, 0.99, uv.x));
            pos.y += wave;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `,
        fragmentShader: `
          in vec2 vUv;
          out vec4 fragColor;
          uniform float uTime;
          uniform float uFocusU;
          uniform float uZoom;

          vec3 epochColor(float u) {
            vec3 hadean = vec3(1.30, 0.36, 0.10);
            vec3 micro  = vec3(0.08, 0.64, 0.92);
            vec3 camb   = vec3(0.18, 0.98, 0.68);
            vec3 dino   = vec3(0.98, 0.46, 0.74);
            vec3 human  = vec3(1.55, 1.35, 0.88);
            vec3 c = mix(hadean, micro, smoothstep(0.155, 0.19, u));
            c = mix(c, camb, smoothstep(0.872, 0.892, u));
            c = mix(c, dino, smoothstep(0.942, 0.962, u));
            c = mix(c, human, smoothstep(0.988, 0.999, u));
            return c;
          }

          void main() {
            float u = vUv.x;
            float v = vUv.y - 0.5;
            vec3 col = epochColor(u);

            float spine = exp(-abs(v) * 24.0);
            float maj = smoothstep(0.96, 1.0, abs(cos(u * 19.2 * 3.1415926)));
            float minT = smoothstep(0.975, 1.0, abs(cos(u * 96.0 * 3.1415926)));
            float majMask = smoothstep(0.42, 0.12, abs(v));
            float minMask = smoothstep(0.22, 0.06, abs(v));

            float pulse = exp(-abs(fract(u - uTime * 0.06) - 0.5) * 14.0) * 0.42;
            float focusGlow = exp(-abs(u - uFocusU) * 7.0) * 0.55 + 0.45;

            float intensity = (spine * 0.95 + maj * majMask * 0.88 + minT * minMask * 0.46 + pulse * spine) * focusGlow;
            float edge = smoothstep(0.5, 0.36, abs(v));
            float alpha = clamp(intensity * edge, 0.0, 1.0) * (1.0 - uZoom * 0.82);

            fragColor = vec4(col * intensity, alpha);
          }
        `,
      });
      const ribbonMesh = new THREE.Mesh(ribbonGeom, ribbonMat);
      ribbonMesh.position.set(0, -1.15, 0);
      ribbonMesh.frustumCulled = false;
      scene3d.add(ribbonMesh);

      // 3. 14,000 GPU-instanced geological / bio-luminescent strata particles
      const PCOUNT = 14000;
      const rand = M.rng(4600);
      const quad = new THREE.PlaneGeometry(1, 1);
      const pGeom = new THREE.InstancedBufferGeometry();
      pGeom.index = quad.index;
      pGeom.attributes.position = quad.attributes.position;
      pGeom.attributes.uv = quad.attributes.uv;
      pGeom.instanceCount = PCOUNT;

      const aEpoch = new Float32Array(PCOUNT * 4);
      const aMeta = new Float32Array(PCOUNT * 3);

      for (let i = 0; i < PCOUNT; i++) {
        const r = rand();
        let u;
        if (r < 0.24) {
          u = rand() * 0.175;
        } else if (r < 0.66) {
          u = 0.175 + rand() * 0.707;
        } else if (r < 0.93) {
          u = 0.882 + rand() * 0.108;
        } else {
          u = 0.990 + rand() * 0.010;
        }
        const spreadY = u < 0.175 ? (rand() - 0.35) * 4.5
          : u < 0.882 ? (rand() - 0.5) * 2.2
          : u < 0.990 ? (rand() - 0.3) * 5.8
          : (rand() - 0.5) * 3.8;
        const spreadZ = (rand() - 0.5) * (u > 0.985 ? 1.4 : 6.2);

        aEpoch[i * 4 + 0] = u;
        aEpoch[i * 4 + 1] = spreadY;
        aEpoch[i * 4 + 2] = spreadZ;
        aEpoch[i * 4 + 3] = rand();

        aMeta[i * 3 + 0] = (u > 0.988 ? 0.065 : 0.048) + rand() * 0.11;
        aMeta[i * 3 + 1] = 0.4 + rand() * 1.4;
        aMeta[i * 3 + 2] = rand();
      }
      pGeom.setAttribute('aEpoch', new THREE.InstancedBufferAttribute(aEpoch, 4));
      pGeom.setAttribute('aMeta', new THREE.InstancedBufferAttribute(aMeta, 3));

      const pMat = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uZoom: { value: 0 },
        },
        vertexShader: `
          in vec4 aEpoch;
          in vec3 aMeta;
          out vec2 vUv;
          out vec3 vCol;
          out float vAlpha;
          uniform float uTime;
          uniform float uZoom;

          void main() {
            vUv = uv;
            float u = aEpoch.x;
            float seed = aEpoch.w;
            float t = uTime * aMeta.y + seed * 40.0;

            vec3 center = vec3((u - 0.5) * 48.0, aEpoch.y - 0.4, aEpoch.z);

            if (u < 0.175) {
              center.y += mod(t * 0.55, 4.6) - 2.3;
              center.x += sin(t * 1.3) * 0.25;
              vCol = mix(vec3(1.38, 0.30, 0.08), vec3(1.48, 0.80, 0.22), aMeta.z);
            } else if (u < 0.882) {
              center.y += sin(t * 0.55 + u * 24.0) * 0.35;
              center.z += cos(t * 0.42 + seed * 12.0) * 0.45;
              vCol = mix(vec3(0.06, 0.48, 0.88), vec3(0.14, 0.92, 0.95), aMeta.z);
            } else if (u < 0.990) {
              float ang = t * 0.9 + u * 80.0;
              center.y += sin(ang) * 0.7 + 0.55;
              center.z += cos(ang) * 0.65;
              vec3 cA = vec3(0.18, 1.08, 0.70);
              vec3 cB = vec3(1.08, 0.44, 0.74);
              vec3 cC = vec3(1.20, 0.88, 0.30);
              vCol = aMeta.z < 0.33 ? cA : (aMeta.z < 0.66 ? cB : cC);
            } else {
              center.y += sin(t * 1.4) * 0.35;
              vCol = vec3(1.58, 1.40, 0.94);
            }

            vec4 mv = modelViewMatrix * vec4(center, 1.0);
            float sz = aMeta.x * (0.75 + 0.35 * sin(t * 2.1));
            mv.xy += position.xy * sz;
            gl_Position = projectionMatrix * mv;

            float distFade = smoothstep(55.0, 6.0, -mv.z);
            vAlpha = distFade * (0.45 + 0.55 * sin(t * 1.7 + seed * 20.0) * 0.5 + 0.25) * (1.0 - uZoom * 0.78);
          }
        `,
        fragmentShader: `
          in vec2 vUv;
          in vec3 vCol;
          in float vAlpha;
          out vec4 fragColor;
          void main() {
            float d = length(vUv - 0.5) * 2.0;
            float glow = exp(-d * d * 4.5);
            if (glow < 0.01) discard;
            fragColor = vec4(vCol * glow, glow * vAlpha);
          }
        `,
      });
      const pMesh = new THREE.Mesh(pGeom, pMat);
      pMesh.frustumCulled = false;
      scene3d.add(pMesh);

      // 4. 2D HUD Overlay: Ruler bar, copy blocks, microscope caliper
      const ov = ctx.overlay();

      const head0 = ctx.text('把地球 46 亿年，\n压成 1920 像素。', {
        x: 128, y: 204, size: 76, font: 'displayBold', color: '#fff4e0', align: 'left', valign: 'top', leading: 1.24, order: 30,
      });
      const tag0 = ctx.text('0 — 330 px  ·  冥古宙 · 岩浆海与陨石轰击', {
        x: 132, y: 426, size: 28, font: 'monoMed', color: '#ff9452', align: 'left', valign: 'top', order: 30,
      });

      const head1 = ctx.text('前 1690 个像素里，\n没有树，没有鱼，没有眼睛。', {
        x: 128, y: 204, size: 70, font: 'displayBold', color: '#e8f7ff', align: 'left', valign: 'top', leading: 1.26, order: 30,
      });
      const sub1 = ctx.text('只有微生物，静静运转了三十亿年。', {
        x: 132, y: 418, size: 36, font: 'textMed', color: '#6fd6f0', align: 'left', valign: 'top', order: 30,
      });

      const head2 = ctx.text('直到第 1694 像素，\n复杂生命才突然点亮屏幕。', {
        x: 128, y: 204, size: 68, font: 'displayBold', color: '#f3fff8', align: 'left', valign: 'top', leading: 1.26, order: 30,
      });
      const sub2 = ctx.text('寒武纪爆发 · 恐龙称霸了 69 个像素（1823 — 1892 px）', {
        x: 132, y: 418, size: 30, font: 'monoMed', color: '#78f2c2', align: 'left', valign: 'top', order: 30,
      });

      const magLabel = ctx.text('PIXEL #1920  ·  放大 100,000×', {
        x: 132, y: 146, size: 26, font: 'monoMed', color: '#f0cb78', align: 'left', valign: 'middle', order: 35,
      });
      const num002 = ctx.text('0.002 像素', {
        x: 128, y: 248, size: 112, font: 'displayBold', color: '#fff6d6', align: 'left', valign: 'middle', order: 35,
      });
      const head3 = ctx.text('整部有文字记载的人类文明史，\n连屏幕上一个子像素都填不满。', {
        x: 132, y: 364, size: 40, font: 'textMed', color: '#dce6f5', align: 'left', valign: 'top', leading: 1.42, order: 35,
      });
      const pxLeftTag = ctx.text('1919.000 px', {
        x: 268, y: 716, size: 22, font: 'mono', color: '#7aa4d6', align: 'left', valign: 'middle', order: 35,
      });
      const pxRightTag = ctx.text('1920.000 px（此刻）', {
        x: 1650, y: 716, size: 22, font: 'monoMed', color: '#ffe599', align: 'right', valign: 'middle', order: 35,
      });

      // Persistent bottom 1920px HUD Ruler
      const RX = 96;
      const RW = 1728;
      const RY = 932;
      const rulerTrack = new ctx.Rect2D({ color: '#1b2738', border: '#354b66', borderWidth: 1.5, radius: 4, order: 20 });
      rulerTrack.set(RX, RY, RW, 14);
      const rulerFill = new ctx.Rect2D({ color: '#ff7838', radius: 3, order: 21 });
      const rulerCursor = new ctx.Rect2D({ color: '#ffffff', order: 25 });
      const rulerStartLbl = ctx.text('0 px  (46 亿年前)', {
        x: RX, y: RY + 36, size: 20, font: 'mono', color: '#7a8ea8', align: 'left', valign: 'middle', order: 24,
      });
      const rulerEndLbl = ctx.text('1920 px  (此刻)', {
        x: RX + RW, y: RY + 36, size: 20, font: 'mono', color: '#9cb2cc', align: 'right', valign: 'middle', order: 24,
      });
      const rulerSpanLbl = ctx.text('0 — 330 px', {
        x: RX, y: RY - 24, size: 22, font: 'monoMed', color: '#ffb070', align: 'left', valign: 'middle', order: 24,
      });

      const caliper = new ctx.SelectBox({ color: '#ffd166', handle: 8, line: 2.2, knob: false, glow: 0.75, fill: 0.04 });
      caliper.alpha(0);

      ov.add(
        head0, tag0, head1, sub1, head2, sub2,
        magLabel, num002, head3, pxLeftTag, pxRightTag,
        rulerTrack, rulerFill, rulerCursor, rulerStartLbl, rulerEndLbl, rulerSpanLbl, caliper
      );

      let lastMagStr = '';
      let lastSpanStr = '';
      let mx = 0, my = 0;

      const st = { epoch: 0, zoom: 0, focusU: 0.08 };

      return {
        update(s) {
          cues.step(s);
          const dt = Math.min(s.dt || 0.016, 0.1);
          const dmp = M.damp(5, dt);
          mx = M.lerp(mx, s.mouse.x, dmp);
          my = M.lerp(my, s.mouse.y, dmp);

          const p0 = s.p[0] || 0;
          const p1 = s.p[1] || 0;
          const p2 = s.p[2] || 0;
          const p3 = s.p[3] || 0;

          const e01 = s.beat >= 1 ? M.ease.io2(M.clamp(p1 * 1.4, 0, 1)) : 0;
          const e12 = s.beat >= 2 ? M.ease.io2(M.clamp(p2 * 1.4, 0, 1)) : 0;
          const e23 = s.beat >= 3 ? M.ease.io3(M.clamp(p3 * 1.15, 0, 1)) : 0;

          st.epoch = e01 + e12 + e23;
          st.zoom = s.beat >= 3 ? M.ease.io3(M.clamp((p3 - 0.12) / 0.56, 0, 1)) : 0;

          let pxA = 0, pxB = 330;
          let focusU = M.lerp(0.02, 0.16, M.ease.out2(p0));
          let barCol = '#ff6a2b';
          let spanStr = '0 — 330 px  (冥古宙 · 约 8 亿年)';

          if (s.beat === 1) {
            pxA = 330;
            pxB = M.lerp(330, 1690, M.ease.io2(p1));
            focusU = M.lerp(0.18, 0.84, M.ease.io2(p1));
            barCol = '#1cc2e8';
            spanStr = `330 — ${Math.round(pxB)} px  (单细胞时代 · 30 亿年)`;
          } else if (s.beat === 2) {
            pxA = 1694;
            pxB = M.lerp(1710, 1892, M.ease.out2(p2));
            focusU = M.lerp(0.87, 0.985, M.ease.out2(p2));
            barCol = '#2ef2a8';
            spanStr = '1694 — 1892 px  (寒武纪至白垩纪 · 恐龙 69 px)';
          } else if (s.beat === 3) {
            pxA = 1918;
            pxB = 1920;
            focusU = M.lerp(0.988, 0.9999, M.ease.out3(p3));
            barCol = '#ffe082';
            spanStr = '1919.998 — 1920.000 px  (人类文明 · 0.002 px)';
          }
          st.focusU = focusU;

          safeParam(ctx, 'deep', 0.55);
          safeParam(ctx, 'wind', s.beat === 0 ? 0.35 : 0.12);
          safeParam(ctx, 'water', s.beat === 1 ? 0.45 : 0.1);
          safeParam(ctx, 'tension', s.beat === 3 ? st.zoom * 0.7 : 0.15);

          cues.fire('b1', s.beat === 1 && p1 > 0.05, s, () => safeSfx(ctx, 'whoosh', { gain: 0.6 }));
          cues.fire('b2', s.beat === 2 && p2 > 0.08, s, () => safeSfx(ctx, 'shimmer', { gain: 0.75 }));
          cues.fire('b3tick1', s.beat === 3 && p3 > 0.15, s, () => safeSfx(ctx, 'tick', { gain: 0.7, pitch: 1.0 }));
          cues.fire('b3tick2', s.beat === 3 && p3 > 0.35, s, () => safeSfx(ctx, 'tick', { gain: 0.8, pitch: 1.25 }));
          cues.fire('b3tick3', s.beat === 3 && p3 > 0.55, s, () => safeSfx(ctx, 'chime', { gain: 0.85, pitch: 1.1 }));

          const camX = (focusU - 0.5) * RIBBON_LEN + mx * 1.1;
          const camY = M.lerp(2.4, 0.35, st.zoom) + my * 0.55;
          const camZ = M.lerp(s.beat === 1 ? 10.5 : 8.8, 3.2, st.zoom);
          cam.aspect = gfx.aspect || 16 / 9;
          cam.position.set(camX, camY, camZ);
          cam.lookAt((focusU - 0.5) * RIBBON_LEN + 1.2, -0.7, 0);
          cam.updateProjectionMatrix();

          ribbonMat.uniforms.uTime.value = s.t;
          ribbonMat.uniforms.uFocusU.value = focusU;
          ribbonMat.uniforms.uZoom.value = st.zoom;
          pMat.uniforms.uTime.value = s.t;
          pMat.uniforms.uZoom.value = st.zoom;

          // Update HUD ruler
          const fillX = RX + (pxA / 1920) * RW;
          const fillW = Math.max(4, ((pxB - pxA) / 1920) * RW);
          rulerFill.set(fillX, RY + 2, fillW, 10);
          rulerFill.color(barCol);
          rulerCursor.set(RX + focusU * RW - 1.5, RY - 8, 3, 30);
          if (spanStr !== lastSpanStr) {
            lastSpanStr = spanStr;
            rulerSpanLbl.set(spanStr);
          }
          setTextColor(rulerSpanLbl, barCol);
          rulerSpanLbl.x = M.clamp(fillX, RX, RX + RW - 540);
          syncText(rulerSpanLbl);

          // Beat typography fades (using normalized seg!)
          head0.show(s.beat === 0 ? seg(s, 0, 0.04, 0.36, M.ease.out3) : 0, { style: 'rise', stagger: 0.4 });
          tag0.show(s.beat === 0 ? seg(s, 0, 0.28, 0.62, M.ease.out2) : 0, { style: 'fade' });

          head1.show(s.beat === 1 ? seg(s, 1, 0.05, 0.36, M.ease.out3) : 0, { style: 'rise', stagger: 0.35 });
          sub1.show(s.beat === 1 ? seg(s, 1, 0.36, 0.68, M.ease.out2) : 0, { style: 'blur' });

          head2.show(s.beat === 2 ? seg(s, 2, 0.05, 0.34, M.ease.out3) : 0, { style: 'rise', stagger: 0.35 });
          sub2.show(s.beat === 2 ? seg(s, 2, 0.34, 0.66, M.ease.out2) : 0, { style: 'fade' });

          if (s.beat === 3) {
            const z = st.zoom;
            const magPow = M.lerp(1, 5, M.ease.io2(M.clamp((p3 - 0.1) / 0.55, 0, 1)));
            const magVal = Math.pow(10, magPow);
            const magStr = `PIXEL #1920  ·  放大 ${formatInt(magVal)}×`;
            if (magStr !== lastMagStr) {
              lastMagStr = magStr;
              magLabel.set(magStr);
            }
            magLabel.show(seg(s, 3, 0.08, 0.28, M.ease.out2), { style: 'fade' });
            num002.show(seg(s, 3, 0.40, 0.68, M.ease.out3), { style: 'rise', stagger: 0.35 });
            head3.show(seg(s, 3, 0.54, 0.84, M.ease.out2), { style: 'blur', stagger: 0.3 });
            pxLeftTag.alpha = z * 0.85;
            pxRightTag.alpha = z;
            syncText(pxLeftTag);
            syncText(pxRightTag);

            const cx0 = M.lerp(RX + RW - 26, 268, z);
            const cy0 = M.lerp(RY - 14, 502, z);
            const cw = M.lerp(34, 1384, z);
            const ch = M.lerp(42, 176, z);
            caliper.set(cx0, cy0, cw, ch);
            caliper.dash(z < 0.85 ? 24 : 0, s.t * 1.4);
            caliper.alpha(M.smoothstep(0.02, 0.16, p3));
          } else {
            magLabel.show(0);
            num002.show(0);
            head3.show(0);
            pxLeftTag.alpha = 0;
            pxRightTag.alpha = 0;
            syncText(pxLeftTag);
            syncText(pxRightTag);
            caliper.alpha(0);
          }
        },

        render(target, s) {
          bgPass.u.uEpoch.value = st.epoch;
          bgPass.u.uZoom.value = st.zoom;
          bgPass.u.uMouse.value.set(mx, my);
          bgPass.u.uTime.value = s.t;
          bgPass.render(rt3d, true);

          gfx.draw(scene3d, cam, rt3d, { clear: false });

          gfx.post(rt3d, rtComp, {
            exposure: 1.08,
            bloom: 0.55 + st.zoom * 0.35,
            threshold: 0.75,
            radius: 0.85,
            tone: 'agx',
            contrast: 1.06,
            saturation: 1.12,
            vignette: 0.34,
            grain: 0.022,
            halation: 0.18,
            time: s.t,
          });
          gfx.copy(rtComp, target);
          ov.render(target);
        },

        dispose() {
          gfx.free(rt3d);
          gfx.free(rtComp);
          bgPass.dispose();
          ribbonGeom.dispose();
          ribbonMat.dispose();
          pGeom.dispose();
          pMat.dispose();
        },
      };
    },
  };

  // ===========================================================================
  // SCENE 3: breath — 《第一次呼吸》 (Procedural Raymarched 3D Planet Shader)
  // ===========================================================================
  const sceneBreath = {
    id: 'breath',
    title: '第一次呼吸',
    enterWith: 'wash',
    beats: [
      { dur: 5.5, delay: 1.0, hold: 3.5 },
      { dur: 6.0, hold: 3.5 },
      { dur: 5.5, hold: 4.5 },
    ],
    notes: [
      '二十四亿年前，地球的海洋里漂浮着大量溶解铁，空气里几乎没有游离氧。小小的蓝藻，学会了光合作用，开始向世界释放一种剧毒气体——氧气。',
      '氧气先是把全球海洋里的铁锈成了血红色，接着瓦解了维持温暖的甲烷温室。两极的冰盖一路南下北上，在赤道彻底锁死，地球被冻成了一颗雪球。',
      '直到海底火山撕开冰壳，喷出积攒数百万年的二氧化碳，蓝色海洋才重新苏醒。生命从来不是安静的房客——每一次生态剧变，都始于某个物种的成功。',
    ],
    page(s) {
      if (s.beat === 0) return '2,400,000,000 年前';
      if (s.beat === 1) return '2,300,000,000 年前';
      return '2,100,000,000 年前';
    },

    create(ctx) {
      const { THREE, gfx } = ctx;
      const M = getM();
      const cues = makeCues();

      const rt = gfx.target({ depth: true });
      const rtPost = gfx.target({});

      // Museum-grade raymarched 3D planet with Archean ocean -> cyanobacteria -> banded iron -> Snowball Earth -> volcanic fissures -> sapphire thaw
      const planetPass = gfx.pass(
        M.GLSL_NOISE + `
        uniform float uCyan;
        uniform float uRust;
        uniform float uIce;
        uniform float uCrack;
        uniform float uThaw;
        uniform vec2 uMouse;

        mat2 rot2(float a) {
          float c = cos(a), s = sin(a);
          return mat2(c, -s, s, c);
        }

        void main() {
          float asp = uRes.x / max(uRes.y, 1.0);
          vec2 uv = (vUv - 0.5) * vec2(asp, 1.0) * 2.0;

          // Deep space starfield
          vec3 bg = vec3(0.008, 0.013, 0.024);
          vec2 stG = floor((vUv + uMouse * 0.008) * 190.0);
          vec2 stF = fract((vUv + uMouse * 0.008) * 190.0) - 0.5;
          float sr = hash12(stG);
          if (sr > 0.962) {
            float tw = 0.65 + 0.35 * sin(uTime * (1.8 + sr * 5.0) + sr * 40.0);
            bg += vec3(0.82, 0.90, 1.0) * smoothstep(0.14, 0.0, length(stF)) * tw * 0.65;
          }

          // Camera & sphere placed gracefully to the right-center on landscape, centered-lower on portrait
          float portrait = smoothstep(1.05, 0.72, asp);
          vec3 ro = vec3(mix(-0.62, 0.0, portrait) + uMouse.x * 0.14, mix(0.04, 0.25, portrait) + uMouse.y * 0.10, mix(3.35, 4.15, portrait));
          vec3 rd = normalize(vec3(uv * 0.62, -1.65));
          vec3 center = vec3(mix(0.32, 0.0, portrait), mix(-0.02, -0.32, portrait), 0.0);
          float R = 1.08;

          vec3 oc = ro - center;
          float b = dot(oc, rd);
          float c = dot(oc, oc) - R * R;
          float h = b * b - c;

          float minD = length(oc - rd * max(-b, 0.0));
          float atmoHalo = exp(-max(minD - R, 0.0) * 8.5) * smoothstep(R * 1.65, R * 0.98, minD);

          vec3 L = normalize(vec3(-0.68, 0.34, 0.65));

          vec3 atmoTint = mix(vec3(0.28, 0.64, 0.46), vec3(0.85, 0.36, 0.22), uRust * (1.0 - uIce * 0.8));
          atmoTint = mix(atmoTint, vec3(0.68, 0.92, 1.18), uIce * (1.0 - uThaw));
          atmoTint = mix(atmoTint, vec3(0.24, 0.70, 1.28), uThaw);

          vec3 closestP = normalize((ro + rd * max(-b, 0.0)) - center);
          float haloLit = smoothstep(-0.35, 0.65, dot(closestP, L));

          vec3 col = bg + atmoTint * atmoHalo * (0.28 + 0.95 * haloLit);

          if (h > 0.0) {
            float tHit = -b - sqrt(max(h, 0.0));
            vec3 P = ro + rd * tHit;
            vec3 N = normalize(P - center);
            vec3 V = -rd;

            vec3 q = N;
            q.xz = rot2(uTime * 0.12) * q.xz;
            q.yz = rot2(0.22) * q.yz;

            float f1 = fbm(q * 3.2 + vec3(0.0, 0.0, uTime * 0.03));
            float f2 = fbm(q * 7.5 + vec3(f1 * 1.4, -f1 * 1.1, uTime * 0.05));
            float swirl = fbm(q * 4.5 + vec3(sin(q.y * 6.0 + f1 * 3.0) * 0.6, f2 * 0.7, 0.0));
            float landMask = smoothstep(0.56, 0.66, f1 + 0.12 * f2);

            // 1. Archean iron-rich olive/rust-green ocean
            vec3 archOcean = mix(vec3(0.05, 0.15, 0.12), vec3(0.16, 0.26, 0.17), swirl);
            vec3 archLand  = mix(vec3(0.14, 0.11, 0.09), vec3(0.26, 0.20, 0.16), f2);
            vec3 surf = mix(archOcean, archLand, landMask);

            // Swirling emerald cyanobacteria oxygen plumes
            float plume = smoothstep(0.46, 0.78, swirl) * (1.0 - landMask * 0.85) * uCyan * (1.0 - uIce * 0.85);
            vec3 cyanCol = mix(vec3(0.06, 0.66, 0.44), vec3(0.28, 1.08, 0.74), f2);
            surf = mix(surf, cyanCol, plume * 0.74);

            // 2. Banded iron oxidation (blood-rust ocean bands)
            float bands = sin(q.y * 22.0 + f1 * 5.0) * 0.5 + 0.5;
            float rustMask = uRust * (1.0 - uThaw * 0.85) * (0.45 + 0.55 * bands);
            vec3 rustCol = mix(vec3(0.42, 0.08, 0.05), vec3(0.86, 0.26, 0.11), f2);
            surf = mix(surf, rustCol, rustMask * 0.80);

            // 3. Thawed sapphire ocean
            vec3 sapphOcean = mix(vec3(0.02, 0.15, 0.38), vec3(0.07, 0.40, 0.72), swirl);
            vec3 sapphLand  = mix(vec3(0.18, 0.25, 0.19), vec3(0.36, 0.32, 0.24), f2);
            vec3 thawedSurf = mix(sapphOcean, sapphLand, landMask);
            surf = mix(surf, thawedSurf, uThaw);

            // 4. Snowball Earth creeping glacial ice sheets from BOTH poles -> locking at equator
            float lat = abs(q.y);
            float iceNoise = (f1 - 0.5) * 0.26 + (f2 - 0.5) * 0.12;
            float effIce = clamp(uIce * (1.0 - uThaw * 0.76), 0.0, 1.0);
            float front = mix(1.06, -0.14, effIce);
            float iceMask = smoothstep(front - 0.05, front + 0.07, lat + iceNoise);

            // worley2 returns vec2(F1, F2); F2 - F1 gives razor-sharp glacial pressure ridges & cracks!
            vec2 sphUv = vec2(atan(q.z, q.x) * 4.2, q.y * 7.5);
            vec2 wIce = worley2(sphUv + f1 * 1.2);
            float iceRidge = smoothstep(0.0, 0.22, wIce.y - wIce.x);
            vec3 iceAlbedo = mix(vec3(0.62, 0.82, 0.96), vec3(0.96, 0.99, 1.03), iceRidge * 0.65 + 0.35 * smoothstep(0.1, 0.7, wIce.x));
            surf = mix(surf, iceAlbedo, iceMask);

            // 5. Volcanic amber fissures cracking through global ice shell along Voronoi cell seams (F2 - F1)
            float crackEdge = worley(sphUv * 1.35 + f2 * 0.75);
            float fissure = smoothstep(0.085, 0.012, crackEdge) * smoothstep(0.0, 0.45, uCrack) * (1.0 - uThaw * 0.78);
            float fissureHalo = smoothstep(0.19, 0.02, crackEdge) * uCrack * (1.0 - uThaw * 0.78);
            vec3 lavaEmissive = mix(vec3(1.65, 0.36, 0.05), vec3(2.45, 1.48, 0.48), fissure) * (fissure * 1.65 + fissureHalo * 0.45);

            // Relief normal perturbation
            vec3 bump = normalize(vec3(f2 - 0.5, swirl - 0.5, f1 - 0.5) + 1e-4) * (0.08 + 0.10 * iceMask);
            vec3 Np = normalize(N + bump);

            float ndl = dot(Np, L);
            float diff = max(ndl, 0.0);
            float twilight = smoothstep(-0.22, 0.18, ndl) * smoothstep(0.35, -0.05, ndl);
            vec3 H = normalize(L + V);
            float specPow = mix(48.0, 18.0, iceMask);
            float specAmt = mix(0.45 * (1.0 - landMask), 0.28, iceMask);
            float spec = pow(max(dot(Np, H), 0.0), specPow) * specAmt * smoothstep(0.0, 0.15, ndl);

            float cloudN = fbm(q * 5.2 + vec3(uTime * 0.07, 0.0, -uTime * 0.04));
            float cloudAmt = smoothstep(0.54, 0.78, cloudN) * (0.22 + 0.45 * uThaw) * (1.0 - effIce * 0.65);

            float fres = pow(1.0 - max(dot(N, V), 0.0), 3.4);

            vec3 lit = surf * (diff * 1.25 * vec3(1.04, 0.99, 0.92) + 0.058 * atmoTint);
            lit += atmoTint * twilight * 0.24;
            lit += vec3(1.0, 0.96, 0.88) * spec;
            lit = mix(lit, vec3(0.95, 0.98, 1.0) * (diff * 1.1 + 0.12), cloudAmt);
            lit += cyanCol * plume * 0.24 * (0.3 + 0.7 * diff);
            lit += lavaEmissive;
            lit += atmoTint * fres * (0.35 + 1.08 * smoothstep(-0.25, 0.55, dot(N, L)));

            col = lit;
          }

          float leftScrim = smoothstep(0.58, 0.05, vUv.x);
          col *= (1.0 - leftScrim * 0.24);

          o = vec4(max(col, 0.0), 1.0);
        }`,
        {
          uCyan: 0,
          uRust: 0,
          uIce: 0,
          uCrack: 0,
          uThaw: 0,
          uMouse: new THREE.Vector2(),
        }
      );

      // Foreground 3D orbital particles (oxygen bubbles -> frost shards -> volcanic embers)
      const scene3d = new THREE.Scene();
      const cam = new THREE.PerspectiveCamera(40, gfx.aspect || 16 / 9, 0.1, 100);
      cam.position.set(0, 0, 5.5);

      const NPART = 2800;
      const rand = M.rng(2400);
      const quad = new THREE.PlaneGeometry(1, 1);
      const pGeom = new THREE.InstancedBufferGeometry();
      pGeom.index = quad.index;
      pGeom.attributes.position = quad.attributes.position;
      pGeom.attributes.uv = quad.attributes.uv;
      pGeom.instanceCount = NPART;

      const aOrbit = new Float32Array(NPART * 4);
      const aSz = new Float32Array(NPART * 2);
      for (let i = 0; i < NPART; i++) {
        aOrbit[i * 4 + 0] = 1.65 + rand() * 2.2;
        aOrbit[i * 4 + 1] = rand() * Math.PI * 2;
        aOrbit[i * 4 + 2] = (rand() - 0.5) * 2.4;
        aOrbit[i * 4 + 3] = 0.08 + rand() * 0.28;
        aSz[i * 2 + 0] = 0.015 + rand() * 0.04;
        aSz[i * 2 + 1] = rand();
      }
      pGeom.setAttribute('aOrbit', new THREE.InstancedBufferAttribute(aOrbit, 4));
      pGeom.setAttribute('aSz', new THREE.InstancedBufferAttribute(aSz, 2));

      const pMat = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uIce: { value: 0 },
          uCrack: { value: 0 },
          uThaw: { value: 0 },
        },
        vertexShader: `
          in vec4 aOrbit;
          in vec2 aSz;
          out vec2 vUv;
          out vec3 vCol;
          out float vAlpha;
          uniform float uTime;
          uniform float uIce;
          uniform float uCrack;
          uniform float uThaw;

          void main() {
            vUv = uv;
            float ang = aOrbit.y + uTime * aOrbit.w;
            float r = aOrbit.x;
            vec3 pos = vec3(
              0.92 + cos(ang) * r,
              aOrbit.z + sin(uTime * 0.6 + aSz.y * 20.0) * 0.25,
              sin(ang) * r * 0.65
            );

            vec3 cOxy   = vec3(0.22, 1.15, 0.78);
            vec3 cFrost = vec3(0.82, 0.95, 1.18);
            vec3 cLava  = vec3(1.45, 0.68, 0.22);
            vec3 cBlue  = vec3(0.35, 0.82, 1.25);
            vCol = mix(cOxy, cFrost, uIce * (1.0 - uThaw));
            vCol = mix(vCol, cLava, uCrack * (1.0 - uThaw) * step(0.45, aSz.y));
            vCol = mix(vCol, cBlue, uThaw * 0.85);

            vec4 mv = modelViewMatrix * vec4(pos, 1.0);
            mv.xy += position.xy * aSz.x;
            gl_Position = projectionMatrix * mv;
            vAlpha = (0.28 + 0.45 * sin(uTime * 2.2 + aSz.y * 40.0) * 0.5 + 0.25) * smoothstep(-2.0, 1.2, pos.z);
          }
        `,
        fragmentShader: `
          in vec2 vUv;
          in vec3 vCol;
          in float vAlpha;
          out vec4 fragColor;
          void main() {
            float d = length(vUv - 0.5) * 2.0;
            float g = exp(-d * d * 5.0);
            if (g < 0.01) discard;
            fragColor = vec4(vCol * g, g * vAlpha);
          }
        `,
      });
      const pMesh = new THREE.Mesh(pGeom, pMat);
      pMesh.frustumCulled = false;
      scene3d.add(pMesh);

      const ov = ctx.overlay();

      const k0 = ctx.text('大氧化事件 · GREAT OXIDATION', {
        x: 120, y: 268, size: 22, font: 'monoMed', color: '#4ee6a8', align: 'left', valign: 'middle', tracking: 0.12, order: 20,
      });
      const h0 = ctx.text('24 亿年前，\n蓝藻学会了一件小事：\n释放氧气。', {
        x: 118, y: 318, size: 64, font: 'displayBold', color: '#f0fff8', align: 'left', valign: 'top', leading: 1.28, maxWidth: 760, order: 20,
      });

      const k1 = ctx.text('休伦冰期 · SNOWBALL EARTH', {
        x: 120, y: 268, size: 22, font: 'monoMed', color: '#9cd8ff', align: 'left', valign: 'middle', tracking: 0.12, order: 20,
      });
      const h1 = ctx.text('氧气毒杀了几乎所有\n原有生命，\n并把地球冻成了一颗雪球。', {
        x: 118, y: 318, size: 60, font: 'displayBold', color: '#f2f9ff', align: 'left', valign: 'top', leading: 1.28, maxWidth: 760, order: 20,
      });

      const k2 = ctx.text('生态重构 · PLANETARY FEEDBACK', {
        x: 120, y: 268, size: 22, font: 'monoMed', color: '#ffbe6b', align: 'left', valign: 'middle', tracking: 0.12, order: 20,
      });
      const h2 = ctx.text('生命从来不是\n安静的房客。', {
        x: 118, y: 318, size: 68, font: 'displayBold', color: '#fff8ec', align: 'left', valign: 'top', leading: 1.25, maxWidth: 760, order: 20,
      });
      const s2 = ctx.text('每一次生态剧变，\n都始于某个物种的成功。', {
        x: 120, y: 540, size: 38, font: 'textMed', color: '#a8d8ff', align: 'left', valign: 'top', leading: 1.45, maxWidth: 760, order: 20,
      });

      ov.add(k0, h0, k1, h1, k2, h2, s2);

      let mx = 0, my = 0;
      const st = { cyan: 0, rust: 0, ice: 0, crack: 0, thaw: 0 };

      return {
        update(s) {
          cues.step(s);
          const dt = Math.min(s.dt || 0.016, 0.1);
          const dmp = M.damp(4.5, dt);
          mx = M.lerp(mx, s.mouse.x, dmp);
          my = M.lerp(my, s.mouse.y, dmp);

          const p0 = s.p[0] || 0;
          const p1 = s.p[1] || 0;
          const p2 = s.p[2] || 0;

          st.cyan = s.beat === 0 ? M.ease.io2(M.clamp(p0 * 1.25, 0, 1)) : 1.0;
          st.rust = s.beat >= 1 ? M.ease.io2(M.clamp(p1 / 0.42, 0, 1)) : 0;
          st.ice = s.beat >= 1 ? M.ease.io3(M.clamp((p1 - 0.24) / 0.68, 0, 1)) : 0;
          st.crack = s.beat >= 2 ? M.ease.out2(M.clamp(p2 / 0.45, 0, 1)) : 0;
          st.thaw = s.beat >= 2 ? M.ease.io3(M.clamp((p2 - 0.30) / 0.65, 0, 1)) : 0;

          safeParam(ctx, 'water', s.beat === 0 ? 0.5 : (s.beat === 2 ? 0.45 * st.thaw : 0.08));
          safeParam(ctx, 'wind', s.beat === 1 ? 0.55 * st.ice : 0.12);
          safeParam(ctx, 'deep', 0.48);
          safeParam(ctx, 'tension', s.beat === 1 ? st.ice * 0.6 : 0.2);

          cues.fire('ox', s.beat === 0 && p0 > 0.2, s, () => safeSfx(ctx, 'shimmer', { gain: 0.65 }));
          cues.fire('freeze', s.beat === 1 && p1 > 0.32, s, () => safeSfx(ctx, 'creak', { gain: 0.85 }));
          cues.fire('lock', s.beat === 1 && p1 > 0.80, s, () => safeSfx(ctx, 'sub', { gain: 0.85 }));
          cues.fire('crack', s.beat === 2 && p2 > 0.08, s, () => safeSfx(ctx, 'boom', { gain: 0.9 }));
          cues.fire('thaw', s.beat === 2 && p2 > 0.42, s, () => safeSfx(ctx, 'wave', { gain: 0.75 }));

          cam.aspect = gfx.aspect || 16 / 9;
          cam.position.set(mx * 0.25, my * 0.18, 5.5);
          cam.lookAt(0, 0, 0);
          cam.updateProjectionMatrix();

          pMat.uniforms.uTime.value = s.t;
          pMat.uniforms.uIce.value = st.ice;
          pMat.uniforms.uCrack.value = st.crack;
          pMat.uniforms.uThaw.value = st.thaw;

          k0.show(s.beat === 0 ? seg(s, 0, 0.04, 0.28, M.ease.out2) : 0, { style: 'fade' });
          h0.show(s.beat === 0 ? seg(s, 0, 0.10, 0.48, M.ease.out3) : 0, { style: 'rise', stagger: 0.4 });

          k1.show(s.beat === 1 ? seg(s, 1, 0.04, 0.26, M.ease.out2) : 0, { style: 'fade' });
          h1.show(s.beat === 1 ? seg(s, 1, 0.10, 0.48, M.ease.out3) : 0, { style: 'rise', stagger: 0.38 });

          k2.show(s.beat === 2 ? seg(s, 2, 0.04, 0.24, M.ease.out2) : 0, { style: 'fade' });
          h2.show(s.beat === 2 ? seg(s, 2, 0.10, 0.44, M.ease.out3) : 0, { style: 'rise', stagger: 0.35 });
          s2.show(s.beat === 2 ? seg(s, 2, 0.42, 0.76, M.ease.out2) : 0, { style: 'blur', stagger: 0.3 });
        },

        render(target, s) {
          planetPass.u.uCyan.value = st.cyan;
          planetPass.u.uRust.value = st.rust;
          planetPass.u.uIce.value = st.ice;
          planetPass.u.uCrack.value = st.crack;
          planetPass.u.uThaw.value = st.thaw;
          planetPass.u.uMouse.value.set(mx, my);
          planetPass.u.uTime.value = s.t;
          planetPass.render(rt, true);

          gfx.draw(scene3d, cam, rt, { clear: false });

          gfx.post(rt, rtPost, {
            exposure: 1.06,
            bloom: 0.52 + st.crack * (1 - st.thaw * 0.6) * 0.42,
            threshold: 0.82,
            radius: 0.88,
            tone: 'agx',
            contrast: 1.06,
            saturation: 1.08,
            vignette: 0.32,
            grain: 0.02,
            halation: 0.16,
            time: s.t,
          });
          gfx.copy(rtPost, target);
          ov.render(target);
        },

        dispose() {
          gfx.free(rt);
          gfx.free(rtPost);
          planetPass.dispose();
          pGeom.dispose();
          pMat.dispose();
        },
      };
    },
  };

  // ===========================================================================
  // SCENE 4: five — 《五次清零》 (3D Stratified Canyon + 18,000 Biodiversity Particles)
  // ===========================================================================
  const sceneFive = {
    id: 'five',
    title: '五次清零',
    enterWith: 'flaps',
    beats: [
      { dur: 5.0, delay: 0.8, hold: 3.0 },
      { dur: 6.5, hold: 4.0 },
      { dur: 6.0, hold: 4.5 },
    ],
    notes: [
      '沿着沉积岩层一路向下，岩壁上刻着五道清晰的黑色伤疤——奥陶纪、泥盆纪、二叠纪、三叠纪、白垩纪。每一次，都有四分之三以上的物种被抹去。',
      '其中最残酷的是二叠纪末的大灭绝：西伯利亚暗色岩持续喷发，96% 的海洋物种彻底消失。屏幕里这片曾经密密麻麻的生命光海，瞬间只剩下零星火种。地球用了整整一千万年，才重新填满生态位。',
      '算上白垩纪那颗终结恐龙的小行星，地球上曾经存在过的物种，99.9% 已经灭绝。存续，从来不是默认选项。',
    ],
    page(s) {
      if (s.beat === 0) return '444,000,000 年前';
      if (s.beat === 1) return '252,000,000 年前';
      return '66,000,000 年前';
    },

    create(ctx) {
      const { THREE, gfx } = ctx;
      const M = getM();
      const cues = makeCues();

      const rt = gfx.target({ depth: true });
      const rtPost = gfx.target({});
      const scene3d = new THREE.Scene();
      const cam = new THREE.PerspectiveCamera(48, gfx.aspect || 16 / 9, 0.1, 160);

      // 1. Towering 3D Procedural Geological Canyon
      const cliffMat = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        uniforms: {
          uTime: { value: 0 },
          uCamY: { value: 14.0 },
          uPermPulse: { value: 0 },
          uChicxFlash: { value: 0 },
          uAllGlow: { value: 0 },
        },
        vertexShader: `
          ${M.GLSL_NOISE}
          out vec3 vWorldPos;
          out vec3 vNormalW;

          void main() {
            vec3 pos = position;
            float fold = sin(pos.x * 0.22 + pos.z * 0.18) * 1.1;
            float strata = sin((pos.y + fold) * 2.1) * 0.35 + sin((pos.y + fold) * 6.3) * 0.12;
            float crag = (fbm(pos * 0.24) - 0.5) * 2.6;
            pos += normal * (strata + crag);

            vec4 wp = modelMatrix * vec4(pos, 1.0);
            vWorldPos = wp.xyz;
            vNormalW = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: `
          ${M.GLSL_NOISE}
          in vec3 vWorldPos;
          in vec3 vNormalW;
          out vec4 fragColor;

          uniform float uTime;
          uniform float uCamY;
          uniform float uPermPulse;
          uniform float uChicxFlash;
          uniform float uAllGlow;

          void main() {
            vec3 p = vWorldPos;
            float fold = sin(p.x * 0.22 + p.z * 0.16) * 0.85 + (fbm(p * 0.18) - 0.5) * 0.9;
            float sy = p.y + fold;

            float l1 = sin(sy * 4.5) * 0.5 + 0.5;
            float l2 = sin(sy * 13.0 + fbm(p * 0.6) * 2.0) * 0.5 + 0.5;
            float grain = fbm(p * 1.4);

            float dh = cos(sy * 4.5) * 0.28 + cos(sy * 13.0) * 0.16;
            vec3 N = normalize(vNormalW + vec3((grain - 0.5) * 0.35, dh * 0.45, (l2 - 0.5) * 0.25));

            vec3 rockA = vec3(0.055, 0.062, 0.078);
            vec3 rockB = vec3(0.145, 0.115, 0.095);
            vec3 rockC = vec3(0.092, 0.098, 0.118);
            vec3 alb = mix(rockA, rockB, l1);
            alb = mix(alb, rockC, l2 * 0.55);
            alb *= 0.72 + 0.55 * grain;

            float seams[5];
            seams[0] = 11.0;
            seams[1] = 4.5;
            seams[2] = -3.0;
            seams[3] = -10.5;
            seams[4] = -17.0;

            float charMask = 0.0;
            vec3 seamEmissive = vec3(0.0);

            for (int i = 0; i < 5; i++) {
              float w = (i == 2) ? 0.62 : 0.36;
              float d = abs(sy - seams[i]);
              float scar = smoothstep(w * 2.2, 0.0, d);
              float core = exp(-d * d / (w * w * 0.16));
              float proximity = smoothstep(14.0, 2.0, abs(uCamY - seams[i]));
              float seamActive = max(proximity, uAllGlow * 0.92);

              charMask = max(charMask, scar * 0.88);
              vec3 sCol = (i == 2)
                ? vec3(2.2, 0.24, 0.08)
                : (i == 4 ? vec3(2.0, 0.72, 0.18) : vec3(1.55, 0.32, 0.12));
              float boost = (i == 2) ? (1.0 + uPermPulse * 1.4) : 1.0;
              seamEmissive += sCol * core * seamActive * boost * (0.75 + 0.25 * sin(uTime * 2.4 + p.x * 0.6));
            }

            alb = mix(alb, vec3(0.014, 0.012, 0.015), charMask);

            vec3 Ltop = normalize(vec3(0.18, 0.92, 0.35));
            float diff = max(dot(N, Ltop), 0.0);
            float rim = pow(1.0 - max(dot(N, normalize(cameraPosition - p)), 0.0), 2.8);

            vec3 col = alb * (diff * vec3(0.75, 0.88, 1.18) * 1.2 + vec3(0.10, 0.13, 0.20));
            col += vec3(0.14, 0.24, 0.38) * rim * 0.55;
            col += seamEmissive;
            col += vec3(1.4, 0.95, 0.55) * uChicxFlash * 0.55;

            float dist = length(cameraPosition - p);
            float fog = 1.0 - exp(-dist * 0.036);
            vec3 fogCol = vec3(0.018, 0.022, 0.034) + vec3(0.18, 0.03, 0.01) * uPermPulse;
            col = mix(col, fogCol, clamp(fog, 0.0, 1.0));

            fragColor = vec4(max(col, 0.0), 1.0);
          }
        `,
      });

      const wallGeoL = new THREE.PlaneGeometry(46, 66, 48, 110);
      const wallL = new THREE.Mesh(wallGeoL, cliffMat);
      wallL.position.set(-7.6, -2.0, -6.0);
      wallL.rotation.y = Math.PI * 0.44;
      scene3d.add(wallL);

      const wallGeoR = new THREE.PlaneGeometry(46, 66, 48, 110);
      const wallR = new THREE.Mesh(wallGeoR, cliffMat);
      wallR.position.set(7.6, -2.0, -6.0);
      wallR.rotation.y = -Math.PI * 0.44;
      scene3d.add(wallR);

      const wallGeoB = new THREE.PlaneGeometry(34, 66, 42, 110);
      const wallB = new THREE.Mesh(wallGeoB, cliffMat);
      wallB.position.set(0, -2.0, -21.0);
      scene3d.add(wallB);

      // 2. 18,000 GPU-instanced luminous biodiversity particles rising like fireflies
      const N = 18000;
      const rand = M.rng(252);
      const quad = new THREE.PlaneGeometry(1, 1);
      const pGeom = new THREE.InstancedBufferGeometry();
      pGeom.index = quad.index;
      pGeom.attributes.position = quad.attributes.position;
      pGeom.attributes.uv = quad.attributes.uv;
      pGeom.instanceCount = N;

      const aPos = new Float32Array(N * 4);
      const aParam = new Float32Array(N * 3);

      for (let i = 0; i < N; i++) {
        aPos[i * 4 + 0] = (rand() - 0.5) * 12.2;
        aPos[i * 4 + 1] = -26.0 + rand() * 48.0;
        aPos[i * 4 + 2] = -18.0 + rand() * 20.0;
        aPos[i * 4 + 3] = rand();

        aParam[i * 3 + 0] = 0.035 + rand() * 0.085;
        aParam[i * 3 + 1] = 0.35 + rand() * 1.1;
        aParam[i * 3 + 2] = rand();
      }
      pGeom.setAttribute('aPos', new THREE.InstancedBufferAttribute(aPos, 4));
      pGeom.setAttribute('aParam', new THREE.InstancedBufferAttribute(aParam, 3));

      const pMat = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uSurvival: { value: 1.0 },
          uSnuffWave: { value: 0.0 },
        },
        vertexShader: `
          in vec4 aPos;
          in vec3 aParam;
          out vec2 vUv;
          out vec3 vCol;
          out float vAlpha;

          uniform float uTime;
          uniform float uSurvival;
          uniform float uSnuffWave;

          void main() {
            vUv = uv;
            float rank = aPos.w;
            float seed = aParam.z;
            float t = uTime * aParam.y + seed * 50.0;

            float y = mod(aPos.y + uTime * (0.35 + aParam.y * 0.35) + 26.0, 48.0) - 26.0;
            vec3 pos = vec3(
              aPos.x + sin(t * 0.7) * 0.45,
              y,
              aPos.z + cos(t * 0.55) * 0.45
            );

            float waveBias = sin(y * 0.25 + seed * 6.0) * 0.06 * uSnuffWave;
            float alive = 1.0 - smoothstep(uSurvival - 0.05 + waveBias, uSurvival + 0.03 + waveBias, rank);

            vec3 cTeal = vec3(0.18, 1.05, 0.88);
            vec3 cGold = vec3(1.25, 0.92, 0.35);
            vec3 cRose = vec3(1.10, 0.46, 0.68);
            vec3 bio = seed < 0.45 ? cTeal : (seed < 0.78 ? cGold : cRose);
            vec3 ember = vec3(1.6, 0.25, 0.08);
            float dying = smoothstep(0.95, 0.15, alive) * uSnuffWave;
            vCol = mix(bio, ember, dying * 0.85);

            vec4 mv = modelViewMatrix * vec4(pos, 1.0);
            float sz = aParam.x * (0.7 + 0.4 * alive) * (0.8 + 0.25 * sin(t * 2.5));
            mv.xy += position.xy * sz;
            gl_Position = projectionMatrix * mv;

            float distFade = smoothstep(38.0, 3.0, -mv.z) * smoothstep(0.6, 2.2, -mv.z);
            vAlpha = alive * distFade * (0.45 + 0.45 * sin(t * 1.9 + seed * 20.0) * 0.5 + 0.2);
          }
        `,
        fragmentShader: `
          in vec2 vUv;
          in vec3 vCol;
          in float vAlpha;
          out vec4 fragColor;
          void main() {
            if (vAlpha < 0.005) discard;
            float d = length(vUv - 0.5) * 2.0;
            float g = exp(-d * d * 4.8);
            if (g < 0.01) discard;
            fragColor = vec4(vCol * g, g * vAlpha);
          }
        `,
      });
      const pMesh = new THREE.Mesh(pGeom, pMat);
      pMesh.frustumCulled = false;
      scene3d.add(pMesh);

      // 3. 2D Overlay: Copy & Vertical 5-Extinction Strata Gauge
      const ov = ctx.overlay();

      const h0 = ctx.text('岩层里藏着\n五道黑色的伤疤。', {
        x: 124, y: 248, size: 74, font: 'displayBold', color: '#f7f2eb', align: 'left', valign: 'top', leading: 1.24, order: 30,
      });
      const s0 = ctx.text('奥陶纪 (-85%)  ·  泥盆纪 (-75%)', {
        x: 128, y: 468, size: 28, font: 'monoMed', color: '#ff8a5c', align: 'left', valign: 'top', order: 30,
      });

      const big96 = ctx.text('-96%', {
        x: 120, y: 256, size: 138, font: 'displayBold', color: '#ff4226', align: 'left', valign: 'middle', order: 30,
      });
      const h1 = ctx.text('二叠纪末，96% 的海洋物种消失。', {
        x: 124, y: 374, size: 52, font: 'displayBold', color: '#fff0eb', align: 'left', valign: 'top', order: 30,
      });
      const s1 = ctx.text('恢复生态，花了整整一千万年。', {
        x: 126, y: 458, size: 36, font: 'textMed', color: '#e6a596', align: 'left', valign: 'top', order: 30,
      });

      const h2 = ctx.text('地球上曾经存在过的物种，\n99.9% 已经灭绝。', {
        x: 124, y: 236, size: 66, font: 'displayBold', color: '#fff6eb', align: 'left', valign: 'top', leading: 1.28, order: 30,
      });
      const s2 = ctx.text('存续，从来不是默认选项。', {
        x: 126, y: 454, size: 42, font: 'textMed', color: '#ffbe6b', align: 'left', valign: 'top', order: 30,
      });

      const GX = 1765;
      const gaugeLine = new ctx.Rect2D({ color: '#394354', order: 20 });
      gaugeLine.set(GX, 210, 2, 620);
      const gaugeDot = new ctx.Rect2D({ color: '#ff5a36', radius: 5, order: 26 });

      const EXT_META = [
        { name: '奥陶纪  -85%', y: 240 },
        { name: '泥盆纪  -75%', y: 378 },
        { name: '二叠纪  -96%', y: 520 },
        { name: '三叠纪  -80%', y: 662 },
        { name: '白垩纪  -76%', y: 800 },
      ];
      const gaugeTicks = [];
      const gaugeLabels = [];
      for (let i = 0; i < 5; i++) {
        const tk = new ctx.Rect2D({ color: '#7a879c', order: 22 });
        tk.set(GX - 12, EXT_META[i].y, 26, 3);
        const lb = ctx.text(EXT_META[i].name, {
          x: GX - 24, y: EXT_META[i].y, size: 22, font: 'monoMed', color: '#8a96ab', align: 'right', valign: 'middle', order: 24,
        });
        gaugeTicks.push(tk);
        gaugeLabels.push(lb);
        ov.add(tk, lb);
      }

      ov.add(h0, s0, big96, h1, s1, h2, s2, gaugeLine, gaugeDot);

      let mx = 0, my = 0;
      const st = { permPulse: 0, chicxFlash: 0, survival: 1.0 };

      return {
        update(s) {
          cues.step(s);
          const dt = Math.min(s.dt || 0.016, 0.1);
          const dmp = M.damp(5, dt);
          mx = M.lerp(mx, s.mouse.x, dmp);
          my = M.lerp(my, s.mouse.y, dmp);

          const p0 = s.p[0] || 0;
          const p1 = s.p[1] || 0;
          const p2 = s.p[2] || 0;

          let camY = 14.0;
          let camZ = 4.6;
          let lookY = 11.5;
          let survival = 0.92;
          let snuffWave = 0;
          let permPulse = 0;
          let chicxFlash = 0;
          let allGlow = 0;
          let activeSeam = 0;

          if (s.beat === 0) {
            camY = M.lerp(15.2, 2.2, M.ease.io2(p0));
            lookY = camY - 2.6;
            const dip1 = Math.exp(-Math.pow((p0 - 0.34) / 0.14, 2));
            const dip2 = Math.exp(-Math.pow((p0 - 0.78) / 0.14, 2));
            survival = 0.92 - dip1 * 0.68 - dip2 * 0.56;
            snuffWave = Math.max(dip1, dip2);
            activeSeam = p0 < 0.55 ? 0 : 1;
            cues.fire('seam1', p0 > 0.28, s, () => safeSfx(ctx, 'thud', { gain: 0.7 }));
            cues.fire('seam2', p0 > 0.72, s, () => safeSfx(ctx, 'thud', { gain: 0.75, pitch: 0.9 }));
          } else if (s.beat === 1) {
            camY = M.lerp(2.2, -5.8, M.ease.io2(p1));
            lookY = camY - 1.6;
            const snuff = M.ease.out3(M.clamp((p1 - 0.18) / 0.34, 0, 1));
            const slowRecov = M.smoothstep(0.75, 1.0, p1) * 0.08;
            survival = M.lerp(0.88, 0.04, snuff) + slowRecov;
            snuffWave = M.smoothstep(0.14, 0.35, p1);
            permPulse = Math.exp(-Math.pow((p1 - 0.24) / 0.22, 2));
            activeSeam = 2;
            cues.fire('permBoom', p1 > 0.19, s, () => {
              safeSfx(ctx, 'boom', { gain: 1.0 });
              safeSfx(ctx, 'sub', { gain: 0.95 });
            });
          } else {
            const pull = M.ease.io3(M.clamp((p2 - 0.22) / 0.72, 0, 1));
            camY = M.lerp(-5.8, -2.5, pull);
            camZ = M.lerp(4.6, 26.5, pull);
            lookY = M.lerp(-14.0, -3.0, pull);
            chicxFlash = Math.exp(-Math.pow((p2 - 0.20) / 0.08, 2));
            survival = M.lerp(0.24, 0.36, pull) - chicxFlash * 0.18;
            snuffWave = chicxFlash;
            allGlow = pull;
            activeSeam = p2 < 0.18 ? 3 : 4;
            cues.fire('chicx', p2 > 0.16, s, () => safeSfx(ctx, 'slam', { gain: 0.95, pitch: 0.85 }));
          }

          st.permPulse = permPulse;
          st.chicxFlash = chicxFlash;
          st.survival = survival;

          safeParam(ctx, 'deep', 0.65);
          safeParam(ctx, 'tension', s.beat === 1 ? 0.85 : 0.45);
          safeParam(ctx, 'wind', 0.28);

          cam.aspect = gfx.aspect || 16 / 9;
          cam.position.set(mx * 1.35, camY + my * 0.85, camZ);
          cam.lookAt(mx * 0.3, lookY, -14.0);
          cam.updateProjectionMatrix();

          cliffMat.uniforms.uTime.value = s.t;
          cliffMat.uniforms.uCamY.value = camY;
          cliffMat.uniforms.uPermPulse.value = permPulse;
          cliffMat.uniforms.uChicxFlash.value = chicxFlash;
          cliffMat.uniforms.uAllGlow.value = allGlow;

          pMat.uniforms.uTime.value = s.t;
          pMat.uniforms.uSurvival.value = M.clamp(survival, 0.03, 1.0);
          pMat.uniforms.uSnuffWave.value = snuffWave;

          const dotY = M.lerp(240, 800, M.clamp((14.0 - camY) / 30.0, 0, 1));
          gaugeDot.set(GX - 5, dotY - 5, 12, 12);
          for (let i = 0; i < 5; i++) {
            const lit = (s.beat === 2 && p2 > 0.35) || i === activeSeam;
            const past = i < activeSeam;
            gaugeTicks[i].color(lit ? (i === 2 ? '#ff3c20' : '#ff944d') : (past ? '#8a5248' : '#4a5568'));
            setTextColor(gaugeLabels[i], lit ? (i === 2 ? '#ff5538' : '#ffd2a8') : (past ? '#857874' : '#657082'));
            gaugeLabels[i].alpha = lit ? 1.0 : 0.58;
            syncText(gaugeLabels[i]);
          }

          h0.show(s.beat === 0 ? seg(s, 0, 0.04, 0.34, M.ease.out3) : 0, { style: 'rise', stagger: 0.35 });
          s0.show(s.beat === 0 ? seg(s, 0, 0.25, 0.56, M.ease.out2) : 0, { style: 'fade' });

          big96.show(s.beat === 1 ? seg(s, 1, 0.16, 0.42, M.ease.out3) : 0, { style: 'drop', stagger: 0.25 });
          h1.show(s.beat === 1 ? seg(s, 1, 0.22, 0.52, M.ease.out3) : 0, { style: 'rise', stagger: 0.35 });
          s1.show(s.beat === 1 ? seg(s, 1, 0.50, 0.80, M.ease.out2) : 0, { style: 'blur', stagger: 0.3 });

          h2.show(s.beat === 2 ? seg(s, 2, 0.18, 0.50, M.ease.out3) : 0, { style: 'rise', stagger: 0.35 });
          s2.show(s.beat === 2 ? seg(s, 2, 0.52, 0.84, M.ease.out2) : 0, { style: 'blur', stagger: 0.3 });
        },

        render(target, s) {
          gfx.draw(scene3d, cam, rt, { clear: true, color: '#05060b', alpha: 1 });
          gfx.post(rt, rtPost, {
            exposure: 1.12,
            bloom: 0.62 + st.permPulse * 0.45 + st.chicxFlash * 0.65,
            threshold: 0.72,
            radius: 0.88,
            tone: 'agx',
            contrast: 1.08,
            saturation: 1.12,
            vignette: 0.40,
            grain: 0.025,
            halation: 0.22,
            time: s.t,
          });
          gfx.copy(rtPost, target);
          ov.render(target);
        },

        dispose() {
          gfx.free(rt);
          gfx.free(rtPost);
          wallGeoL.dispose();
          wallGeoR.dispose();
          wallGeoB.dispose();
          cliffMat.dispose();
          pGeom.dispose();
          pMat.dispose();
        },
      };
    },
  };

  // ===========================================================================
  // SCENE 5: window — 《11,700 年的奇迹》 (3D Glacial Ice-Core Chamber & Holocene Curve)
  // ===========================================================================
  const sceneWindow = {
    id: 'window',
    title: '11,700 年的奇迹',
    enterWith: 'daybreak',
    beats: [
      { dur: 5.5, delay: 1.0, hold: 3.5 },
      { dur: 6.5, hold: 4.0 },
      { dur: 6.0, hold: 4.5 },
    ],
    notes: [
      '再把镜头推近到最近四十万年。南极冰芯里封存着一部精确的气温史：每隔十万年就是一次冰期与间冰期的剧烈震荡，平均气温动辄上下狂飙八度。',
      '直到一万一千七百年前，那条狂暴震荡的冰蓝色曲线，突然毫无征兆地平稳了下来，进入一段波动不超过正负半度的温暖走廊——地质学家叫它“全新世”。',
      '农业、城市、文字、科学、互联网……我们所熟知的整部人类文明史，完完整整地建在这道罕见而狭窄的暖廊里。',
    ],
    page(s) {
      if (s.beat === 0) return '400,000 年前';
      if (s.beat === 1) return '11,700 年前';
      return '11,700 年来';
    },

    create(ctx) {
      const { THREE, gfx } = ctx;
      const M = getM();
      const cues = makeCues();

      const rt = gfx.target({ depth: true });
      const rtPost = gfx.target({});
      const scene3d = new THREE.Scene();
      const cam = new THREE.PerspectiveCamera(44, gfx.aspect || 16 / 9, 0.1, 140);

      const HOLO_U = 0.78;
      function tempAt(u) {
        if (u >= HOLO_U) {
          const hu = (u - HOLO_U) / (1 - HOLO_U);
          return 1.35 + Math.sin(hu * 14.0) * 0.08 + Math.cos(hu * 29.0) * 0.04;
        }
        const cyc = (u / HOLO_U) * 3.85;
        const f = cyc - Math.floor(cyc);
        const saw = f < 0.16 ? M.lerp(-2.2, 1.45, f / 0.16) : M.lerp(1.45, -2.35, Math.pow((f - 0.16) / 0.84, 0.85));
        const jagged =
          Math.sin(u * 92.0) * 0.58 +
          Math.sin(u * 215.0 + 1.4) * 0.34 +
          Math.cos(u * 410.0) * 0.18;
        const raw = saw + jagged;
        const ramp = M.smoothstep(HOLO_U - 0.032, HOLO_U, u);
        return M.lerp(raw, 1.35, ramp);
      }

      // 1. Volumetric Glacial Ice-Core Chamber Backdrop with Light Shafts
      const chamberPass = gfx.pass(
        M.GLSL_NOISE + `
        uniform float uWarm;
        uniform vec2 uMouse;

        void main() {
          vec2 uv = vUv;

          vec3 coolTop = vec3(0.03, 0.11, 0.22);
          vec3 coolBot = vec3(0.01, 0.03, 0.07);
          vec3 warmTop = vec3(0.18, 0.13, 0.06);
          vec3 warmBot = vec3(0.02, 0.03, 0.06);

          vec3 col = mix(
            mix(coolBot, coolTop, smoothstep(0.0, 1.0, uv.y)),
            mix(warmBot, warmTop, smoothstep(0.0, 1.0, uv.y)),
            uWarm * 0.85
          );

          float sx = uv.x * 1.25 - uv.y * 0.42 + uMouse.x * 0.05;
          float ray1 = pow(max(sin(sx * 9.0 + uTime * 0.12) * 0.5 + 0.5, 0.0), 4.0);
          float ray2 = pow(max(sin(sx * 17.0 - uTime * 0.08 + 1.7) * 0.5 + 0.5, 0.0), 6.0);
          float shaft = (ray1 * 0.65 + ray2 * 0.45) * smoothstep(0.05, 0.95, uv.y);

          vec3 rayCol = mix(vec3(0.22, 0.62, 0.98), vec3(0.95, 0.70, 0.32), uWarm);
          col += rayCol * shaft * (0.14 + 0.08 * uWarm);

          float iceBands = fbm(vec2(uv.x * 3.0, uv.y * 16.0));
          col += mix(vec3(0.06, 0.18, 0.30), vec3(0.24, 0.18, 0.09), uWarm) * iceBands * 0.10;

          // Rich dark readability scrim across the top typography & milestone zone
          float topScrim = smoothstep(0.45, 0.95, uv.y);
          float leftScrim = smoothstep(0.75, 0.05, length((uv - vec2(0.32, 0.80)) * vec2(1.0, 1.5)));
          col *= (1.0 - topScrim * 0.34 - leftScrim * 0.24);

          o = vec4(max(col, 0.0), 1.0);
        }`,
        { uWarm: 0, uMouse: new THREE.Vector2() }
      );

      // 2. Soft Ethereal 3D Glacial Ice-Crystal Columns (soft volumetric falloff, zero hard edges)
      const pillarMat = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.FrontSide,
        uniforms: {
          uWarm: { value: 0 },
          uTime: { value: 0 },
        },
        vertexShader: `
          out vec3 vNormalW;
          out vec3 vWorldPos;
          out vec2 vUv;
          void main() {
            vUv = uv;
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldPos = wp.xyz;
            vNormalW = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: `
          ${M.GLSL_NOISE}
          in vec3 vNormalW;
          in vec3 vWorldPos;
          in vec2 vUv;
          out vec4 fragColor;
          uniform float uWarm;
          uniform float uTime;

          void main() {
            vec3 V = normalize(cameraPosition - vWorldPos);
            // Soft volumetric radial falloff: brightest at column core, fades smoothly to 0 at silhouette edges
            float facing = max(dot(normalize(vNormalW), V), 0.0);
            float softCol = pow(facing, 1.8);
            float frost = fbm(vWorldPos * 0.65 + vec3(0.0, uTime * 0.04, 0.0));
            vec3 cIce = mix(vec3(0.20, 0.62, 1.00), vec3(0.92, 0.68, 0.34), uWarm * 0.72);
            float vFade = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.65, vUv.y);
            float a = softCol * (0.045 + frost * 0.045) * vFade;
            fragColor = vec4(cIce * (0.55 + frost * 0.5), a);
          }
        `,
      });

      const pillarGeos = [];
      const prand = M.rng(11700);
      for (let i = 0; i < 14; i++) {
        const g = new THREE.CylinderGeometry(0.55 + prand() * 0.75, 0.65 + prand() * 0.85, 16 + prand() * 8, 16, 1, true);
        pillarGeos.push(g);
        const m = new THREE.Mesh(g, pillarMat);
        m.position.set(
          -18 + i * 2.7 + (prand() - 0.5) * 1.1,
          (prand() - 0.5) * 2.0,
          -7.0 - prand() * 6.5
        );
        m.rotation.z = (prand() - 0.5) * 0.07;
        scene3d.add(m);
      }

      // 3. Sculpted 3D Paleoclimate Temperature Ribbon + Translucent Curtain
      const SEGS = 480;
      const X_START = -16.0;
      const X_END = 14.0;
      const curveX = u => M.lerp(X_START, X_END, u);

      const cPos = new Float32Array((SEGS + 1) * 2 * 3);
      const cUv = new Float32Array((SEGS + 1) * 2 * 2);
      const cIdx = [];
      for (let i = 0; i <= SEGS; i++) {
        const u = i / SEGS;
        const x = curveX(u);
        const y = tempAt(u);
        cPos[i * 6 + 0] = x;
        cPos[i * 6 + 1] = y;
        cPos[i * 6 + 2] = 0;
        cUv[i * 4 + 0] = u;
        cUv[i * 4 + 1] = 1;

        cPos[i * 6 + 3] = x;
        cPos[i * 6 + 4] = -3.4;
        cPos[i * 6 + 5] = 0;
        cUv[i * 4 + 2] = u;
        cUv[i * 4 + 3] = 0;

        if (i < SEGS) {
          const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
          cIdx.push(a, b, c, b, d, c);
        }
      }
      const curtainGeo = new THREE.BufferGeometry();
      curtainGeo.setAttribute('position', new THREE.BufferAttribute(cPos, 3));
      curtainGeo.setAttribute('uv', new THREE.BufferAttribute(cUv, 2));
      curtainGeo.setIndex(cIdx);

      const curtainMat = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
          uReveal: { value: 1.0 },
          uWarm: { value: 0.0 },
          uTime: { value: 0.0 },
        },
        vertexShader: `
          out vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          in vec2 vUv;
          out vec4 fragColor;
          uniform float uReveal;
          uniform float uWarm;
          uniform float uTime;

          void main() {
            float mask = smoothstep(uReveal + 0.015, uReveal - 0.015, vUv.x);
            if (mask < 0.005) discard;

            float holo = smoothstep(0.765, 0.79, vUv.x);
            vec3 coldCol = vec3(0.18, 0.72, 1.15);
            vec3 warmCol = vec3(1.45, 0.98, 0.34);
            vec3 col = mix(coldCol, warmCol, holo * (0.35 + 0.65 * uWarm));

            float ridge = exp(-(1.0 - vUv.y) * 42.0);
            float skirt = pow(max(vUv.y, 0.0), 3.4) * 0.24;
            float scanFade = 1.0 - smoothstep(0.92, 0.995, uReveal);
            float scan = smoothstep(0.06, 0.0, abs(vUv.x - uReveal)) * 1.15 * scanFade;
            float holoBand = holo * uWarm * exp(-abs(vUv.y - 0.96) * 28.0) * 0.48;

            vec3 outCol = col * (ridge * 1.95 + skirt + scan + holoBand);
            float alpha = clamp((ridge * 0.92 + skirt + scan * 0.75) * mask, 0.0, 1.0);
            fragColor = vec4(outCol, alpha);
          }
        `,
      });
      const curtainMesh = new THREE.Mesh(curtainGeo, curtainMat);
      curtainMesh.frustumCulled = false;
      scene3d.add(curtainMesh);

      const rPos = new Float32Array((SEGS + 1) * 2 * 3);
      const rUv = new Float32Array((SEGS + 1) * 2 * 2);
      const rIdx = [];
      for (let i = 0; i <= SEGS; i++) {
        const u = i / SEGS;
        const x = curveX(u);
        const y = tempAt(u);
        const thick = u >= HOLO_U ? 0.085 : 0.065;
        rPos[i * 6 + 0] = x;
        rPos[i * 6 + 1] = y + thick;
        rPos[i * 6 + 2] = 0.04;
        rUv[i * 4 + 0] = u;
        rUv[i * 4 + 1] = 1;

        rPos[i * 6 + 3] = x;
        rPos[i * 6 + 4] = y - thick;
        rPos[i * 6 + 5] = 0.04;
        rUv[i * 4 + 2] = u;
        rUv[i * 4 + 3] = 0;

        if (i < SEGS) {
          const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
          rIdx.push(a, b, c, b, d, c);
        }
      }
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute('position', new THREE.BufferAttribute(rPos, 3));
      lineGeo.setAttribute('uv', new THREE.BufferAttribute(rUv, 2));
      lineGeo.setIndex(rIdx);
      const lineMat = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
          uReveal: { value: 1.0 },
          uWarm: { value: 0.0 },
        },
        vertexShader: `
          out vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          in vec2 vUv;
          out vec4 fragColor;
          uniform float uReveal;
          uniform float uWarm;
          void main() {
            float mask = smoothstep(uReveal + 0.01, uReveal - 0.01, vUv.x);
            if (mask < 0.005) discard;
            float holo = smoothstep(0.768, 0.788, vUv.x);
            float core = exp(-abs(vUv.y - 0.5) * 5.0);
            vec3 cCold = vec3(0.55, 0.92, 1.45);
            vec3 cGold = vec3(1.65, 1.28, 0.62);
            vec3 col = mix(cCold, cGold, holo * (0.4 + 0.6 * uWarm));
            fragColor = vec4(col * core * 1.4, core * mask);
          }
        `,
      });
      const lineMesh = new THREE.Mesh(lineGeo, lineMat);
      lineMesh.frustumCulled = false;
      scene3d.add(lineMesh);

      // 4. Floating ambient ice-core bubbles / golden motes
      const MCOUNT = 1800;
      const mrand = M.rng(400000);
      const quad = new THREE.PlaneGeometry(1, 1);
      const mGeom = new THREE.InstancedBufferGeometry();
      mGeom.index = quad.index;
      mGeom.attributes.position = quad.attributes.position;
      mGeom.attributes.uv = quad.attributes.uv;
      mGeom.instanceCount = MCOUNT;
      const aM = new Float32Array(MCOUNT * 4);
      for (let i = 0; i < MCOUNT; i++) {
        aM[i * 4 + 0] = -18 + mrand() * 34;
        aM[i * 4 + 1] = -4.5 + mrand() * 10.0;
        aM[i * 4 + 2] = -6 + mrand() * 10.0;
        aM[i * 4 + 3] = mrand();
      }
      mGeom.setAttribute('aM', new THREE.InstancedBufferAttribute(aM, 4));
      const mMat = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uWarm: { value: 0 } },
        vertexShader: `
          in vec4 aM;
          out vec2 vUv;
          out float vAlpha;
          out vec3 vCol;
          uniform float uTime;
          uniform float uWarm;
          void main() {
            vUv = uv;
            vec3 p = aM.xyz;
            p.y += sin(uTime * 0.45 + aM.w * 30.0) * 0.35;
            p.x += cos(uTime * 0.25 + aM.w * 20.0) * 0.25;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            mv.xy += position.xy * (0.03 + aM.w * 0.05);
            gl_Position = projectionMatrix * mv;
            vCol = mix(vec3(0.45, 0.85, 1.2), vec3(1.35, 1.02, 0.48), uWarm * step(0.3, aM.w));
            vAlpha = smoothstep(26.0, 2.0, -mv.z) * 0.45;
          }
        `,
        fragmentShader: `
          in vec2 vUv;
          in float vAlpha;
          in vec3 vCol;
          out vec4 fragColor;
          void main() {
            float d = length(vUv - 0.5) * 2.0;
            float g = exp(-d * d * 5.0);
            if (g < 0.01) discard;
            fragColor = vec4(vCol * g, g * vAlpha);
          }
        `,
      });
      const mMesh = new THREE.Mesh(mGeom, mMat);
      mMesh.frustumCulled = false;
      scene3d.add(mMesh);

      // 5. 5 Delicate 3D Glowing Vertical Milestone Pins on the Holocene Plateau
      const PINS = [
        { label: '农业', sub: '10,000 年前', u: 0.805, h: 1.05 },
        { label: '城市', sub: '6,000 年前', u: 0.855, h: 1.42 },
        { label: '文字', sub: '5,200 年前', u: 0.895, h: 1.05 },
        { label: '科学', sub: '400 年前', u: 0.945, h: 1.42 },
        { label: '互联网', sub: '40 年前', u: 0.985, h: 1.05 },
      ];
      const pinGeo = new THREE.PlaneGeometry(0.055, 1.0);
      pinGeo.translate(0, 0.5, 0);
      const pinMats = [];

      const ov = ctx.overlay();
      const pinLabels = [];
      const pinSubs = [];

      for (let i = 0; i < PINS.length; i++) {
        const pm = new THREE.ShaderMaterial({
          glslVersion: THREE.GLSL3,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          uniforms: { uGrow: { value: 0 } },
          vertexShader: `
            out vec2 vUv;
            uniform float uGrow;
            void main() {
              vUv = uv;
              vec3 pos = position;
              pos.y *= uGrow;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
          `,
          fragmentShader: `
            in vec2 vUv;
            out vec4 fragColor;
            uniform float uGrow;
            void main() {
              if (uGrow < 0.01) discard;
              float xCore = exp(-abs(vUv.x - 0.5) * 8.0);
              float tip = exp(-abs(vUv.y - 0.96) * 18.0);
              vec3 col = mix(vec3(1.3, 0.92, 0.36), vec3(1.8, 1.6, 1.1), tip);
              float a = xCore * (0.45 + 0.55 * vUv.y) * smoothstep(0.0, 0.15, uGrow);
              fragColor = vec4(col * (1.0 + tip * 1.2), a);
            }
          `,
        });
        pinMats.push(pm);
        const mesh = new THREE.Mesh(pinGeo, pm);
        mesh.position.set(curveX(PINS[i].u), tempAt(PINS[i].u), 0.08);
        mesh.scale.set(1, PINS[i].h, 1);
        scene3d.add(mesh);

        const lb = ctx.text(PINS[i].label, {
          x: 960, y: 500, size: 32, font: 'displayBold', color: '#fff8df', align: 'center', valign: 'bottom', order: 34,
        });
        const sb = ctx.text(PINS[i].sub, {
          x: 960, y: 520, size: 20, font: 'monoMed', color: '#ffe39e', align: 'center', valign: 'bottom', order: 33,
        });
        lb.alpha = 0;
        sb.alpha = 0;
        syncText(lb);
        syncText(sb);
        pinLabels.push(lb);
        pinSubs.push(sb);
        ov.add(lb, sb);
      }

      // 2D Overlay Typography
      const h0 = ctx.text('过去四十万年，地球气候\n是一场狂暴的过山车。', {
        x: 124, y: 146, size: 66, font: 'displayBold', color: '#e8f6ff', align: 'left', valign: 'top', leading: 1.26, order: 30,
      });
      const s0 = ctx.text('南极冰芯古气候记录  ·  平均气温剧烈震荡 ±8°C', {
        x: 128, y: 346, size: 26, font: 'monoMed', color: '#6cc8ff', align: 'left', valign: 'top', order: 30,
      });

      const h1 = ctx.text('直到一万一千七百年前，\n曲线突然平稳了下来。', {
        x: 124, y: 146, size: 66, font: 'displayBold', color: '#fff7e6', align: 'left', valign: 'top', leading: 1.26, order: 30,
      });
      const s1 = ctx.text('全新世（Holocene） ·  波动收窄至 ±0.5°C', {
        x: 128, y: 346, size: 28, font: 'monoMed', color: '#ffcb6b', align: 'left', valign: 'top', order: 30,
      });

      const h2 = ctx.text('农业、城市、文字、科学——\n人类全部文明，都建在这道狭窄的暖廊里。', {
        x: 124, y: 92, size: 52, font: 'displayBold', color: '#fff9ee', align: 'left', valign: 'top', leading: 1.28, maxWidth: 1180, order: 30,
      });

      const rangeTag = ctx.text('±0.5°C  全新世暖廊', {
        x: 1790, y: 740, size: 22, font: 'monoMed', color: '#ffcf70', align: 'right', valign: 'middle', order: 28,
      });
      rangeTag.alpha = 0;
      syncText(rangeTag);

      ov.add(h0, s0, h1, s1, h2, rangeTag);

      let mx = 0, my = 0;
      const st = { warm: 0 };

      return {
        update(s) {
          cues.step(s);
          const dt = Math.min(s.dt || 0.016, 0.1);
          const dmp = M.damp(4.5, dt);
          mx = M.lerp(mx, s.mouse.x, dmp);
          my = M.lerp(my, s.mouse.y, dmp);

          const p0 = s.p[0] || 0;
          const p1 = s.p[1] || 0;
          const p2 = s.p[2] || 0;

          const reveal = s.beat === 0
            ? M.lerp(0.10, 0.77, M.ease.io2(p0))
            : M.lerp(0.77, 1.0, M.ease.out2(s.beat === 1 ? p1 : 1));
          const warm = s.beat === 0
            ? 0
            : (s.beat === 1 ? M.ease.io2(M.clamp((p1 - 0.12) / 0.72, 0, 1)) : 1.0);
          st.warm = warm;

          safeParam(ctx, 'wind', s.beat === 0 ? 0.55 : 0.12 * (1 - warm));
          safeParam(ctx, 'deep', 0.35);
          safeParam(ctx, 'hum', warm * 0.45);
          cues.fire('calm', s.beat === 1 && p1 > 0.25, s, () => safeSfx(ctx, 'shimmer', { gain: 0.8 }));

          let camX, camY, camZ, lookX, lookY;
          if (s.beat === 0) {
            camX = M.lerp(-12.5, 2.2, M.ease.io2(p0));
            camY = 0.6 + Math.sin(p0 * 8.0) * 0.25;
            camZ = 9.4;
            lookX = camX + 3.2;
            lookY = -0.35;
          } else if (s.beat === 1) {
            const k = M.ease.io3(p1);
            camX = M.lerp(2.2, 9.6, k);
            camY = M.lerp(0.6, 1.55, k);
            camZ = M.lerp(9.4, 8.2, k);
            lookX = M.lerp(5.4, 10.6, k);
            lookY = M.lerp(-0.35, 1.15, k);
          } else {
            const k = M.ease.io2(p2);
            camX = M.lerp(9.6, 10.6, k);
            camY = M.lerp(1.55, 1.95, k);
            camZ = M.lerp(8.2, 8.1, k);
            lookX = 10.9;
            lookY = 1.78;
          }

          cam.aspect = gfx.aspect || 16 / 9;
          cam.position.set(camX + mx * 0.85, camY + my * 0.45, camZ);
          cam.lookAt(lookX, lookY, 0);
          cam.updateMatrixWorld();
          cam.updateProjectionMatrix();

          curtainMat.uniforms.uReveal.value = reveal;
          curtainMat.uniforms.uWarm.value = warm;
          curtainMat.uniforms.uTime.value = s.t;
          lineMat.uniforms.uReveal.value = reveal;
          lineMat.uniforms.uWarm.value = warm;
          pillarMat.uniforms.uWarm.value = warm;
          pillarMat.uniforms.uTime.value = s.t;
          mMat.uniforms.uTime.value = s.t;
          mMat.uniforms.uWarm.value = warm;

          for (let i = 0; i < PINS.length; i++) {
            const grow = s.beat === 2
              ? seg(s, 2, 0.08 + i * 0.13, 0.34 + i * 0.13, M.ease.out3)
              : 0;
            pinMats[i].uniforms.uGrow.value = grow;

            if (s.beat === 2 && grow > 0.05) {
              cues.fire('pin' + i, grow > 0.2, s, () => safeSfx(ctx, 'chime', { gain: 0.55, pitch: 0.9 + i * 0.09 }));
              const worldTop = new THREE.Vector3(
                curveX(PINS[i].u),
                tempAt(PINS[i].u) + PINS[i].h * grow + 0.14,
                0.08
              );
              const pt = projectToView(worldTop, cam, s.view);
              const px = M.clamp(pt.x, 120, 1800);
              const py = M.clamp(pt.y, 400, 840);
              pinLabels[i].x = px;
              pinLabels[i].y = py - 28;
              pinLabels[i].alpha = grow;
              pinSubs[i].x = px;
              pinSubs[i].y = py;
              pinSubs[i].alpha = grow;
            } else {
              pinLabels[i].alpha = 0;
              pinSubs[i].alpha = 0;
            }
            syncText(pinLabels[i]);
            syncText(pinSubs[i]);
          }

          const holoPt = projectToView(new THREE.Vector3(curveX(0.95), tempAt(0.95) - 0.55, 0), cam, s.view);
          rangeTag.y = M.clamp(holoPt.y, 460, 860);
          rangeTag.alpha = s.beat >= 1 ? M.smoothstep(0.35, 0.85, warm) * 0.9 : 0;
          syncText(rangeTag);

          h0.show(s.beat === 0 ? seg(s, 0, 0.04, 0.34, M.ease.out3) : 0, { style: 'rise', stagger: 0.35 });
          s0.show(s.beat === 0 ? seg(s, 0, 0.28, 0.58, M.ease.out2) : 0, { style: 'fade' });

          h1.show(s.beat === 1 ? seg(s, 1, 0.08, 0.40, M.ease.out3) : 0, { style: 'rise', stagger: 0.35 });
          s1.show(s.beat === 1 ? seg(s, 1, 0.38, 0.68, M.ease.out2) : 0, { style: 'fade' });

          h2.show(s.beat === 2 ? seg(s, 2, 0.04, 0.34, M.ease.out3) : 0, { style: 'rise', stagger: 0.32 });
        },

        render(target, s) {
          chamberPass.u.uWarm.value = st.warm;
          chamberPass.u.uMouse.value.set(mx, my);
          chamberPass.u.uTime.value = s.t;
          chamberPass.render(rt, true);

          gfx.draw(scene3d, cam, rt, { clear: false });

          gfx.post(rt, rtPost, {
            exposure: 1.06 + st.warm * 0.06,
            bloom: 0.55 + st.warm * 0.32,
            threshold: 0.72,
            radius: 0.88,
            tone: 'agx',
            contrast: 1.05,
            saturation: 1.08,
            vignette: 0.30,
            grain: 0.018,
            halation: 0.22 * st.warm,
            time: s.t,
          });
          gfx.copy(rtPost, target);
          ov.render(target);
        },

        dispose() {
          gfx.free(rt);
          gfx.free(rtPost);
          chamberPass.dispose();
          pillarGeos.forEach(g => g.dispose());
          pillarMat.dispose();
          curtainGeo.dispose();
          curtainMat.dispose();
          lineGeo.dispose();
          lineMat.dispose();
          mGeom.dispose();
          mMat.dispose();
          pinGeo.dispose();
          pinMats.forEach(m => m.dispose());
        },
      };
    },
  };

  LHP.scenesEarly = [sceneBoring, sceneScale, sceneBreath, sceneFive, sceneWindow];
})();
