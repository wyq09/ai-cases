(() => {
  const LHP = (window.__LHP = window.__LHP || {});

  // Helper: deterministic one-shot SFX trigger that respects scrub/direction
  function makeOnce() {
    const fired = Object.create(null);
    return {
      reset() {
        for (const k in fired) delete fired[k];
      },
      fire(key, cond, fn, s) {
        if (cond && !fired[key] && s.dt > 0 && s.dir > 0) fn();
        fired[key] = !!cond;
      },
    };
  }

  // Helper: safe audio param
  function setParam(ctx, name, val) {
    if (ctx.audio && typeof ctx.audio.param === 'function') {
      ctx.audio.param(name, val);
    }
  }

  // Helper: format 24h clock string from seconds (0 .. 86400)
  function fmtClock(sec, decimals = 0) {
    const s = Math.max(0, Math.min(86400, sec));
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    const hStr = String(hh).padStart(2, '0');
    const mStr = String(mm).padStart(2, '0');
    if (decimals <= 0) {
      return `${hStr}:${mStr}:${String(Math.floor(ss)).padStart(2, '0')}`;
    }
    const whole = Math.floor(ss);
    const frac = (ss - whole).toFixed(decimals).slice(1); // ".996"
    return `${hStr}:${mStr}:${String(whole).padStart(2, '0')}${frac}`;
  }

  // Helper: generate bespoke procedural fallback CanvasTextures for Scene 9 (zoom)
  // when a user jumps directly to #zoom without visiting earlier scenes
  function makeFallbackThumb(THREE, id) {
    const W = 512, H = 288;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');

    const palettes = {
      scale:   { bg0: '#040814', bg1: '#0b1c36', acc: '#f5b95b', acc2: '#38bdf8', label: '1920 像素的地球', sub: '0.002 PX' },
      breath:  { bg0: '#041217', bg1: '#113a42', acc: '#5be3b7', acc2: '#d96b43', label: '第一次呼吸', sub: '24 亿年前' },
      five:    { bg0: '#0b060a', bg1: '#260c14', acc: '#ff5247', acc2: '#f59e0b', label: '五次清零', sub: '-96% 物种' },
      window:  { bg0: '#081526', bg1: '#1d3b5c', acc: '#ffd479', acc2: '#7dd3fc', label: '11,700 年的奇迹', sub: '全新世 ±0.5°C' },
      coal:    { bg0: '#070a09', bg1: '#17261e', acc: '#ffb84d', acc2: '#3fb984', label: '三亿年的阳光', sub: '1,500,000 : 1' },
      flicker: { bg0: '#050711', bg1: '#141a2e', acc: '#e7c178', acc2: '#7dd3fc', label: '一眨眼之间', sub: '23:59:59.996' },
      split:   { bg0: '#2d160d', bg1: '#0c2d45', acc: '#f08c4b', acc2: '#4fd1c5', label: '两种下个一万年', sub: '惯性 | 选择' },
    };
    const p = palettes[id] || palettes.scale;

    const grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, p.bg0);
    grad.addColorStop(1, p.bg1);
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);

    // Subtle iconic motif per scene
    g.save();
    if (id === 'scale') {
      g.strokeStyle = 'rgba(125,211,252,0.35)';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(36, 175); g.lineTo(476, 175); g.stroke();
      for (let i = 0; i <= 24; i++) {
        const x = 36 + (i / 24) * 440;
        g.beginPath(); g.moveTo(x, 165); g.lineTo(x, i % 4 === 0 ? 190 : 182); g.stroke();
      }
      const rg = g.createRadialGradient(470, 175, 2, 470, 175, 42);
      rg.addColorStop(0, '#fff7d6'); rg.addColorStop(0.3, p.acc); rg.addColorStop(1, 'transparent');
      g.fillStyle = rg; g.fillRect(420, 130, 90, 90);
    } else if (id === 'breath') {
      const rg = g.createRadialGradient(340, 144, 10, 340, 144, 96);
      rg.addColorStop(0, '#72f0c8'); rg.addColorStop(0.55, '#1b6e68'); rg.addColorStop(0.88, '#102e3a'); rg.addColorStop(1, 'transparent');
      g.fillStyle = rg; g.beginPath(); g.arc(340, 144, 96, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(120,245,215,0.55)'; g.lineWidth = 3;
      g.beginPath(); g.arc(340, 144, 86, 0, Math.PI * 2); g.stroke();
    } else if (id === 'five') {
      for (let k = 0; k < 5; k++) {
        const y = 78 + k * 38;
        g.fillStyle = k === 2 ? 'rgba(255,68,56,0.75)' : 'rgba(245,158,11,0.35)';
        g.fillRect(36, y, 440, k === 2 ? 5 : 2);
      }
    } else if (id === 'window') {
      g.strokeStyle = '#7dd3fc'; g.lineWidth = 2.5;
      g.beginPath();
      for (let x = 36; x <= 395; x += 6) {
        const y = 165 + Math.sin(x * 0.14) * 34 + Math.cos(x * 0.27) * 18;
        if (x === 36) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
      g.strokeStyle = '#ffd479'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(395, 142); g.lineTo(476, 142); g.stroke();
    } else if (id === 'coal') {
      const pl = g.createLinearGradient(256, 20, 256, 260);
      pl.addColorStop(0, 'rgba(255,220,130,0.85)'); pl.addColorStop(1, 'rgba(255,130,40,0.05)');
      g.fillStyle = pl; g.fillRect(238, 28, 36, 232);
      g.fillStyle = 'rgba(255,180,70,0.5)'; g.fillRect(40, 212, 432, 4);
      g.fillStyle = 'rgba(63,185,132,0.35)'; g.fillRect(40, 234, 432, 3);
    } else if (id === 'flicker') {
      g.strokeStyle = 'rgba(231,193,120,0.75)'; g.lineWidth = 3;
      g.beginPath(); g.arc(345, 144, 78, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = '#7dd3fc'; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(345, 144); g.lineTo(345, 76); g.stroke();
      g.fillStyle = '#fff3c4'; g.beginPath(); g.arc(345, 66, 5, 0, Math.PI * 2); g.fill();
    } else if (id === 'split') {
      g.fillStyle = '#5c2612'; g.fillRect(0, 0, 256, H);
      g.fillStyle = '#0e4766'; g.fillRect(256, 0, 256, H);
      g.fillStyle = '#ffffff'; g.fillRect(255, 0, 2, H);
    }
    g.restore();

    // Subtle border & typography
    g.strokeStyle = 'rgba(255,255,255,0.16)';
    g.lineWidth = 2;
    g.strokeRect(10, 10, W - 20, H - 20);

    g.fillStyle = p.acc;
    g.font = '600 18px ui-monospace, SFMono-Regular, Menlo, monospace';
    g.fillText(p.sub, 36, 62);

    g.fillStyle = '#f8fafc';
    g.font = '700 34px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
    g.fillText(p.label, 36, 114);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  }

  // ============================================================================
  // SCENE 6: coal — 《三亿年的阳光》
  // ============================================================================
  const sceneCoal = {
    id: 'coal',
    title: '三亿年的阳光',
    enterWith: 'slam',
    hud: { color: '#d8be8e', font: 'monoMed', alpha: 0.85 },
    beats: [
      { dur: 5.5, delay: 0.8, hold: 3.5, page: '300,000,000 年前' },
      { dur: 6.0, hold: 3.5, page: '200 年前' },
      { dur: 7.0, hold: 4.5, page: '此刻' },
    ],
    notes: [
      '三亿年前的石炭纪，地球上长满了巨型蕨类森林。它们把每一缕阳光写进纤维素里，死后沉入缺氧的沼泽，被岩层一寸寸封存进地底。',
      '整整三亿年的高温与地壳高压，把阳光压成了黑亮的煤层与石油。这是一本埋在我们脚下的、攒了三亿年的能量账本。',
      '而工业革命以来，我们只用了两百年，就把它一次点亮。三亿年的沉积，对比两百年的释放——一百五十万比一。',
    ],
    create(ctx) {
      const M = LHP.math;
      const { THREE, gfx, view } = ctx;
      const { clamp, lerp, smoothstep, ease, rng } = M;

      const rt = gfx.target({ samples: 4, depth: true });
      const ov = ctx.overlay();
      const scene3D = new THREE.Scene();
      const cam = new THREE.PerspectiveCamera(44, gfx.aspect, 0.1, 200);

      // Fullscreen 3D geological light-chamber cross-section shader
      const bgPass = gfx.pass(
        M.GLSL_NOISE +
          M.GLSL_COLOR +
          `
        uniform float uCompress;
        uniform float uErupt;
        uniform float uCamY;
        uniform vec2 uMouse;

        float strataHeight(float x, float seed) {
          return 0.032 * sin(x * 3.1 + seed) + 0.016 * (fbm(vec2(x * 2.4, seed * 3.7)) - 0.5);
        }

        void main() {
          vec2 uv = vUv;
          float asp = uRes.x / max(uRes.y, 1.0);
          vec2 p = (uv - 0.5) * vec2(asp, 1.0);
          p += uMouse * vec2(0.035, -0.025);

          // Camera vertical travel down into strata, then tilting slightly up for eruption
          float wy = p.y + uCamY;
          float wx = p.x;

          // Surface line separates canopy sky (wy > surfY) and geological cross-section (wy <= surfY)
          float surfY = mix(0.22, 0.56, uCompress) - 0.08 * uErupt + 0.025 * sin(wx * 2.3);
          float depth = surfY - wy; // > 0 underground, < 0 above ground

          // Sky & Carboniferous emerald-gold canopy
          vec3 skyTop = mix(vec3(0.03, 0.09, 0.08), vec3(0.02, 0.03, 0.05), clamp(uCompress + uErupt * 0.8, 0.0, 1.0));
          vec3 skyHor = mix(vec3(0.24, 0.34, 0.18), vec3(0.10, 0.08, 0.06), uCompress);
          skyHor = mix(skyHor, vec3(0.32, 0.14, 0.04), uErupt * 0.7);
          vec3 col = mix(skyHor, skyTop, smoothstep(-0.05, 0.72, -depth));

          // Volumetric golden-emerald sunlight shafts descending in Beat 0
          float rayFade = (1.0 - smoothstep(0.0, 0.85, uCompress)) * (1.0 - uErupt);
          if (rayFade > 0.001) {
            float sx = wx * 1.15 - wy * 0.38;
            float r1 = pow(max(0.5 + 0.5 * sin(sx * 7.5 + 0.6), 0.0), 3.0);
            float r2 = pow(max(0.5 + 0.5 * sin(sx * 14.0 - 1.2 + uTime * 0.15), 0.0), 4.0);
            float mist = fbm(vec2(wx * 2.5 + uTime * 0.05, wy * 2.0 - uTime * 0.08));
            float rays = (r1 * 0.65 + r2 * 0.45) * (0.55 + 0.7 * mist);
            float vMask = smoothstep(-0.35, 0.15, -depth) * smoothstep(0.95, 0.05, -depth);
            // Soft canopy silhouette at top
            float canopy = smoothstep(0.42, 0.78, fbm(vec2(wx * 4.5, wy * 3.0 + 1.7)) + smoothstep(0.25, 0.65, wy) * 0.35);
            vec3 sunCol = mix(vec3(0.42, 0.82, 0.48), vec3(1.15, 0.86, 0.36), smoothstep(-0.1, 0.55, r1));
            col += sunCol * rays * (1.0 - canopy * 0.68) * vMask * rayFade * 0.62;
            // Subtle sunlit mist right above forest floor
            col += vec3(0.65, 0.82, 0.38) * exp(-max(-depth, 0.0) * 6.5) * rayFade * 0.22;
          }

          // Underground stratified sedimentary chamber
          float inRock = smoothstep(-0.008, 0.014, depth);
          if (inRock > 0.001) {
            // Geological strata coordinates compress vertically under lithospheric pressure
            float compScale = mix(1.0, 2.35, uCompress);
            float dWarp = depth * compScale + strataHeight(wx, 1.3) * 1.4;

            // Fine mineral noise & sedimentary bedding
            float nCoarse = fbm(vec2(wx * 3.0, dWarp * 6.5));
            float nFine = vnoise(vec2(wx * 28.0, dWarp * 64.0));
            float bed = sin(dWarp * 36.0 + nCoarse * 4.2) * 0.5 + 0.5;
            float wor = worley(vec2(wx * 6.0, dWarp * 11.0));

            vec3 shale = mix(vec3(0.032, 0.036, 0.042), vec3(0.085, 0.078, 0.072), bed * 0.7 + nFine * 0.3);
            shale *= 0.82 + 0.32 * smoothstep(0.08, 0.55, wor);
            // Darker obsidian pressure toning in Beat 1+
            shale = mix(shale, shale * vec3(0.55, 0.60, 0.75), uCompress * 0.65);

            // Three major buried sunlight -> coal/oil seams
            float seamY1 = mix(0.24, 0.32, uCompress) + strataHeight(wx, 2.1);
            float seamY2 = mix(0.48, 0.49, uCompress) + strataHeight(wx, 5.4);
            float seamY3 = mix(0.74, 0.66, uCompress) + strataHeight(wx, 8.9);

            float thick = mix(0.068, 0.017, uCompress);
            float s1 = exp(-pow((depth - seamY1) / thick, 2.0));
            float s2 = exp(-pow((depth - seamY2) / (thick * 1.15), 2.0));
            float s3 = exp(-pow((depth - seamY3) / (thick * 0.9), 2.0));
            float seam = clamp(s1 + s2 * 1.15 + s3 * 0.9, 0.0, 1.35);

            // Obsidian glossy coal body + iridescent hydrocarbon sheen
            float coalBody = smoothstep(0.25, 0.85, seam);
            vec3 obsidian = vec3(0.012, 0.014, 0.020);
            float iridPhase = wx * 6.0 + dWarp * 14.0 + uTime * 0.35 + nCoarse * 3.0;
            vec3 irid = 0.5 + 0.5 * cos(iridPhase + vec3(0.0, 2.0, 4.2));
            obsidian += irid * vec3(0.08, 0.14, 0.18) * uCompress * (0.4 + 0.6 * nFine);
            shale = mix(shale, obsidian, coalBody * mix(0.35, 0.92, uCompress));

            // Glowing compressed solar veins running inside seams
            float veinNoise = fbm(vec2(wx * 9.0 + uTime * 0.12, depth * 32.0));
            float veinPulse = 0.75 + 0.25 * sin(uTime * 2.2 + wx * 4.0 + depth * 10.0);
            float veinCore = pow(max(seam, 0.0), mix(1.4, 3.2, uCompress)) * smoothstep(0.28, 0.82, veinNoise + 0.25);

            vec3 veinCol = mix(vec3(0.75, 0.92, 0.35), vec3(1.55, 0.78, 0.18), smoothstep(0.1, 0.9, uCompress));
            // During eruption, veins drain toward the central shaft (wx -> 0) and blaze white-gold
            float drainFlow = 0.5 + 0.5 * sin(abs(wx) * 18.0 + uTime * 9.0);
            float centerPull = exp(-abs(wx) * 2.2) * uErupt;
            veinCol = mix(veinCol, vec3(2.1, 1.35, 0.45), centerPull * 0.75);
            shale += veinCol * veinCore * (mix(0.55, 1.45, uCompress) * veinPulse + uErupt * (0.6 + 0.9 * drainFlow) * exp(-abs(wx) * 1.4));

            // Subtle side canyon vignette & depth darkening
            float depthShade = exp(-max(depth, 0.0) * 0.65);
            shale *= 0.65 + 0.45 * depthShade;

            // Surface topsoil / peat rim highlight
            float rim = exp(-abs(depth) * 42.0);
            shale += mix(vec3(0.35, 0.55, 0.22), vec3(0.28, 0.22, 0.15), uCompress) * rim * 0.5;

            col = mix(col, shale, inRock);
          }

          // BEAT 2: Blinding vertical geothermal / fossil energy plume erupting from the central shaft
          if (uErupt > 0.001) {
            float e = smoothstep(0.0, 1.0, uErupt);
            // Plume rises from deep seam (wy = -0.35) all the way through the top of the screen
            float riseHead = mix(-0.35, 1.25, smoothstep(0.0, 0.55, e));
            float aboveBase = smoothstep(-0.55, -0.15, wy) * smoothstep(riseHead + 0.18, riseHead - 0.06, wy);

            // Narrow shaft underground, flaring slightly into an incandescent sky geyser above surfY
            float flare = 1.0 + 1.8 * smoothstep(-0.05, 0.55, -depth);
            float turb = (fbm(vec2(wx * 5.5, wy * 3.8 - uTime * 3.4)) - 0.5) * 0.09 * flare;
            float dx = abs(wx + turb * (0.4 + 0.6 * e));
            float wCore = mix(0.012, 0.048, e) * flare;
            float wHalo = mix(0.06, 0.24, e) * flare;

            float core = exp(-pow(dx / max(wCore, 0.005), 2.0));
            float inner = exp(-pow(dx / max(wCore * 2.8, 0.01), 2.0));
            float halo = exp(-pow(dx / max(wHalo, 0.02), 2.0));

            float streaks = fbm(vec2(wx * 18.0, wy * 6.0 - uTime * 6.5));
            float flicker = 0.88 + 0.12 * sin(uTime * 28.0 + wy * 12.0);

            vec3 plume = vec3(2.8, 2.35, 1.65) * core * (0.9 + 0.4 * streaks)
                       + vec3(1.65, 0.72, 0.14) * inner * (0.7 + 0.6 * streaks)
                       + vec3(0.85, 0.24, 0.05) * halo * 0.65;
            col += plume * aboveBase * e * flicker;

            // Illuminate flanking canyon rock walls with warm bounce light from the geyser
            float wallBounce = exp(-abs(wx) * 2.8) * smoothstep(0.02, 0.22, abs(wx)) * inRock;
            col += vec3(0.55, 0.22, 0.05) * wallBounce * e * (0.65 + 0.35 * streaks);

            // Shockwave flash right at ignition
            float ignFlash = exp(-pow((e - 0.18) / 0.12, 2.0));
            col += vec3(1.6, 1.05, 0.45) * exp(-length(vec2(wx, wy + 0.08)) * 2.2) * ignFlash * 0.9;
          }

          // Subtle editorial readability gradient on the left margin
          float leftScrim = smoothstep(0.58, 0.0, uv.x) * smoothstep(0.15, 0.85, uv.y);
          col *= 1.0 - 0.38 * leftScrim;

          o = vec4(max(col, 0.0), 1.0);
        }
      `,
        {
          uCompress: 0,
          uErupt: 0,
          uCamY: 0,
          uMouse: new THREE.Vector2(),
        }
      );

      // 3D Instanced Photon / Rising Ember Streaks (2,400 glowing quads)
      const COUNT = 2400;
      const rand = rng(603);
      const quadGeo = new THREE.PlaneGeometry(1, 1);
      const aSeed = new Float32Array(COUNT * 4);
      for (let i = 0; i < COUNT; i++) {
        aSeed[i * 4 + 0] = rand(); // x lane / radial
        aSeed[i * 4 + 1] = rand(); // phase
        aSeed[i * 4 + 2] = rand(); // seam index / speed
        aSeed[i * 4 + 3] = rand(); // size / color mix
      }

      const instGeo = new THREE.InstancedBufferGeometry();
      instGeo.index = quadGeo.index;
      instGeo.attributes.position = quadGeo.attributes.position;
      instGeo.attributes.uv = quadGeo.attributes.uv;
      instGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(aSeed, 4));
      instGeo.instanceCount = COUNT;

      const partMat = new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uCompress: { value: 0 },
          uErupt: { value: 0 },
        },
        vertexShader: `
          precision highp float;
          in vec3 position;
          in vec2 uv;
          in vec4 aSeed;
          uniform mat4 viewMatrix;
          uniform mat4 projectionMatrix;
          uniform float uTime;
          uniform float uCompress;
          uniform float uErupt;
          out vec2 vUv;
          out vec3 vCol;
          out float vAlpha;

          void main() {
            vUv = uv;
            float s0 = aSeed.x;
            float s1 = aSeed.y;
            float s2 = aSeed.z;
            float s3 = aSeed.w;

            // Phase 0: Golden-emerald solar photons drifting down into strata
            float fallCycle = fract(s1 - uTime * (0.045 + s2 * 0.04));
            vec3 posFall = vec3(
              (s0 - 0.5) * 15.0 + sin(uTime * 0.6 + s1 * 12.0) * 0.45 + (1.0 - fallCycle) * 1.4,
              mix(-3.2, 5.2, fallCycle),
              (s3 - 0.5) * 6.0 - 1.0
            );

            // Phase 1: Compressed horizontally into 3 dense obsidian-gold seams
            float seamIdx = floor(s2 * 3.0);
            float seamY = -0.35 - seamIdx * 1.25 + (s1 - 0.5) * 0.16;
            vec3 posComp = vec3(
              (s0 - 0.5) * 14.5 + sin(uTime * 0.8 + s3 * 9.0) * 0.15,
              seamY + sin(s0 * 14.0 + seamIdx * 2.0) * 0.16,
              (s3 - 0.5) * 3.2 - 1.0
            );

            // Phase 2: Violent upward energy geyser eruption!
            float eruptSpeed = 0.55 + s2 * 1.15;
            float eruptCycle = fract(s1 + uTime * eruptSpeed);
            float angle = s0 * 6.28318 + uTime * (1.2 + s3 * 1.5);
            float rad = (0.12 + pow(s0, 1.8) * 1.35) * (0.45 + 1.45 * eruptCycle);
            vec3 posErupt = vec3(
              cos(angle) * rad,
              mix(-3.6, 6.2, eruptCycle),
              sin(angle) * rad * 0.7 - 1.0
            );

            vec3 p = mix(posFall, posComp, smoothstep(0.0, 1.0, uCompress));
            p = mix(p, posErupt, smoothstep(0.0, 0.9, uErupt));

            // Billboard quad with vertical motion stretch during eruption
            float baseSz = mix(0.045, 0.11, s3);
            float sx = baseSz * mix(1.0, 0.55, uErupt);
            float sy = baseSz * mix(1.0, 3.8 + s2 * 5.0, uErupt);

            vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
            vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
            vec3 worldPos = p + camRight * position.x * sx + camUp * position.y * sy;

            gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);

            vec3 colSun = mix(vec3(0.45, 0.95, 0.55), vec3(1.15, 0.88, 0.35), s3);
            vec3 colSeam = mix(vec3(1.25, 0.72, 0.18), vec3(0.35, 0.75, 0.95), step(0.82, s3));
            vec3 colFire = mix(vec3(1.6, 0.65, 0.12), vec3(2.2, 1.75, 0.85), s3);
            vCol = mix(mix(colSun, colSeam, uCompress), colFire, uErupt);

            float fadeFall = smoothstep(0.0, 0.12, fallCycle) * smoothstep(1.0, 0.85, fallCycle);
            float fadeErupt = smoothstep(0.0, 0.1, eruptCycle) * smoothstep(1.0, 0.65, eruptCycle);
            vAlpha = mix(mix(fadeFall * 0.65, 0.75, uCompress), fadeErupt * 0.95, uErupt);
          }
        `,
        fragmentShader: `
          precision highp float;
          in vec2 vUv;
          in vec3 vCol;
          in float vAlpha;
          out vec4 o;
          void main() {
            vec2 d = (vUv - 0.5) * 2.0;
            float r2 = dot(d, d);
            float glow = exp(-r2 * 4.5);
            if (glow < 0.01) discard;
            o = vec4(vCol * glow, glow * vAlpha);
          }
        `,
      });

      const particles = new THREE.Mesh(instGeo, partMat);
      particles.frustumCulled = false;
      scene3D.add(particles);

      // 2D Editorial Typography Overlay
      const tTag0 = ctx.text('CARBONIFEROUS · 石炭纪沉积', {
        x: 112, y: 158, size: 22, font: 'monoMed', color: '#9cdba6', tracking: 0.08,
      });
      const tMain0 = ctx.text('三亿年前，石炭纪的森林\n把阳光一寸寸封进地底。', {
        x: 110, y: 215, size: 68, font: 'displayBold', color: '#f7f3e8', leading: 1.24,
      });

      const tTag1 = ctx.text('LITHOSPHERE · 三亿年高压封存', {
        x: 112, y: 158, size: 22, font: 'monoMed', color: '#f0b65a', tracking: 0.08,
      });
      const tMain1 = ctx.text('整整三亿年，\n才攒下一本埋在脚下的能量账本。', {
        x: 110, y: 215, size: 68, font: 'displayBold', color: '#f7f3e8', leading: 1.24,
      });
      const tDepth1 = ctx.text('地壳埋深 -1,800 m\n煤层 · 油母页岩 · 封存太阳能', {
        x: 1808, y: 810, size: 22, font: 'mono', color: '#d8be8e', align: 'right', leading: 1.45,
      });

      const tTag2 = ctx.text('INDUSTRIAL IGNITION · 工业释放', {
        x: 112, y: 142, size: 22, font: 'monoMed', color: '#ffbe66', tracking: 0.08,
      });
      const tMain2 = ctx.text('而我们用两百年，\n把它一次点亮。', {
        x: 110, y: 198, size: 70, font: 'displayBold', color: '#fff8eb', leading: 1.22,
      });

      // Stark logarithmic ratio counter panel (bottom-left, clear of central plume!)
      const tCompLbl = ctx.text('300,000,000 年沉积  vs  200 年释放', {
        x: 114, y: 744, size: 24, font: 'monoMed', color: '#e8cfa0',
      });
      const tRatio = ctx.text('1 : 1', {
        x: 110, y: 786, size: 84, font: 'monoMed', color: '#ffd580',
      });
      const barBg = new ctx.Rect2D({ color: '#ffffff', radius: 2, order: 4 });
      const barDep = new ctx.Rect2D({ color: '#45b87c', radius: 2, order: 5 });
      const barRel = new ctx.Rect2D({ color: '#ffae38', radius: 1, order: 6 });

      ov.add(tTag0, tMain0, tTag1, tMain1, tDepth1, tTag2, tMain2, tCompLbl, tRatio, barBg, barDep, barRel);

      const once = makeOnce();
      let lastRatioStr = '';

      return {
        enter() {
          once.reset();
          lastRatioStr = '';
        },
        update(s) {
          const compress = ease.io3(s.k(1, 0.0, 3.8, ease.lin));
          const erupt = ease.io3(s.k(2, 0.55, 3.2, ease.lin));

          // Sound choreography
          once.fire('thud1', s.p[1] > 0 && s.at(1) > 0.35, () => ctx.sfx('thud', { gain: 0.85, pitch: 0.72 }), s);
          once.fire('creak1', s.p[1] > 0 && s.at(1) > 1.8, () => ctx.sfx('creak', { gain: 0.45, pitch: 0.8 }), s);
          once.fire('riser2', s.p[2] > 0 && s.at(2) > 0.05, () => ctx.sfx('riser', { gain: 0.75 }), s);
          once.fire('boom2', s.p[2] > 0 && s.at(2) > 0.85, () => ctx.sfx('boom', { gain: 0.95, pitch: 0.85 }), s);
          once.fire('sub2', s.p[2] > 0 && s.at(2) > 0.95, () => ctx.sfx('sub', { gain: 0.7 }), s);

          setParam(ctx, 'deep', 0.35 + compress * 0.45);
          setParam(ctx, 'tension', erupt * 0.85);
          setParam(ctx, 'hum', 0.25 + erupt * 0.55);

          // Camera & parallax
          cam.aspect = gfx.aspect;
          const camY = lerp(0.18, -0.35, compress) + erupt * 0.28;
          cam.position.set(s.mouse.x * 0.45, camY * 2.2 - s.mouse.y * 0.3, lerp(8.5, 7.6, compress) + erupt * 0.6);
          cam.lookAt(0, camY * 1.4 + erupt * 0.6, -1.0);
          cam.updateProjectionMatrix();

          bgPass.u.uTime.value = s.t;
          bgPass.u.uCompress.value = compress;
          bgPass.u.uErupt.value = erupt;
          bgPass.u.uCamY.value = lerp(0.14, -0.22, compress) + erupt * 0.12;
          bgPass.u.uMouse.value.set(s.mouse.x, s.mouse.y);

          partMat.uniforms.uTime.value = s.t;
          partMat.uniforms.uCompress.value = compress;
          partMat.uniforms.uErupt.value = erupt;

          // Beat typography reveals
          const q0 = s.k(1, 0.0, 0.8, ease.lin);
          tTag0.show(s.k(0, 0.1, 1.2, ease.lin), { style: 'fade', q: q0 });
          tMain0.show(s.k(0, 0.3, 2.4, ease.lin), { style: 'rise', by: 'line', stagger: 0.45, q: q0 });

          const q1 = s.k(2, 0.0, 0.7, ease.lin);
          tTag1.show(s.k(1, 0.5, 1.6, ease.lin), { style: 'fade', q: q1 });
          tMain1.show(s.k(1, 0.7, 2.8, ease.lin), { style: 'rise', by: 'line', stagger: 0.45, q: q1 });
          tDepth1.show(s.k(1, 1.8, 3.6, ease.lin), { style: 'blur', q: q1 });

          const q2 = smoothstep(0.0, 0.4, s.exit);
          tTag2.show(s.k(2, 0.9, 1.8, ease.lin), { style: 'fade', q: q2 });
          tMain2.show(s.k(2, 1.0, 2.8, ease.lin), { style: 'rise', by: 'line', stagger: 0.45, q: q2 });

          // Logarithmic ratio animation: 1 : 1 -> 1,500,000 : 1
          const rProg = ease.out3(s.k(2, 1.4, 3.8, ease.lin));
          const val = rProg <= 0.001 ? 1 : Math.round(Math.pow(1500000, rProg));
          const str = `${val.toLocaleString('en-US')} : 1`;
          if (str !== lastRatioStr) {
            lastRatioStr = str;
            tRatio.set(str);
          }
          const hudShow = s.k(2, 1.5, 2.6, ease.lin);
          tCompLbl.show(hudShow, { style: 'fade', q: q2 });
          tRatio.show(hudShow, { style: 'fade', q: q2 });

          const barA = hudShow * (1 - q2);
          barBg.set(114, 892, 540, 6).alpha(barA * 0.18);
          barDep.set(114, 892, 540 * rProg, 6).alpha(barA * 0.72);
          barRel.set(114 + 536, 886, 4, 18).alpha(barA * 0.98);
        },
        render(target, s) {
          const erupt = ease.io3(s.k(2, 0.55, 3.2, ease.lin));
          bgPass.render(rt, true);
          gfx.draw(scene3D, cam, rt, { clear: false });
          gfx.post(rt, target, {
            bloom: lerp(0.32, 0.62, erupt),
            threshold: lerp(0.88, 0.72, erupt),
            exposure: lerp(1.04, 1.12, erupt),
            contrast: 1.06,
            saturation: 1.08,
            vignette: 0.34,
            grain: 0.028,
            time: s.t,
          });
          ov.render(target);
        },
      };
    },
  };

  // ============================================================================
  // SCENE 7: flicker — 《一眨眼之间》
  // ============================================================================
  const sceneFlicker = {
    id: 'flicker',
    title: '一眨眼之间',
    enterWith: 'fold',
    hud: { color: '#e6ca8a', font: 'monoMed', alpha: 0.9 },
    beats: [
      { dur: 6.0, delay: 1.0, hold: 3.5, page: '00:00:00' },
      { dur: 6.0, hold: 3.5, page: '23:59:56' },
      { dur: 6.5, hold: 4.5, page: '23:59:59.996' },
    ],
    notes: [
      '换一个尺度感受一下。如果把地球 46 亿年压成一昼夜二十四小时——零点诞生，凌晨四点生命萌芽，晚上九点才迎来寒武纪，恐龙在晚上十点五十六分登场。',
      '镜头推近午夜十二点。直到 23 点 59 分 56 秒——距离午夜只剩最后四秒——智人才刚刚推门走进房间。0.1 秒前，人类才学会耕种。',
      '再放大一千倍。工业时代始于午夜前 0.004 秒——连一次眨眼的十分之一都不到。我们在午夜前 0.004 秒按下开关，却正在改写明天一整天的天气。',
    ],
    anchor() {
      return { x: 960, y: 540, size: 420, angle: 0 };
    },
    create(ctx) {
      const M = LHP.math;
      const { THREE, gfx } = ctx;
      const { clamp, lerp, smoothstep, ease, rng } = M;

      const rt = gfx.target({ samples: 4, depth: true });
      const ov = ctx.overlay();
      const scene3D = new THREE.Scene();
      const cam = new THREE.PerspectiveCamera(40, gfx.aspect, 0.01, 200);

      // Deep velvet astronomical space backdrop
      const bgPass = gfx.pass(
        M.GLSL_NOISE +
          `
        uniform vec2 uMouse;
        uniform float uZoom;
        void main() {
          vec2 uv = vUv;
          float asp = uRes.x / max(uRes.y, 1.0);
          vec2 p = (uv - 0.5) * vec2(asp, 1.0);
          vec2 mp = p + uMouse * 0.03;

          float r = length(mp);
          vec3 col = mix(vec3(0.042, 0.056, 0.105), vec3(0.010, 0.013, 0.024), smoothstep(0.0, 0.95, r));
          // Subtle cosmic nebula wash
          float neb = fbm(mp * 2.6 + vec2(uTime * 0.012, -uTime * 0.008));
          col += vec3(0.045, 0.038, 0.026) * smoothstep(0.45, 0.9, neb) * exp(-r * 1.4);
          col += vec3(0.02, 0.04, 0.08) * smoothstep(0.4, 0.85, fbm(mp * 4.2 - 1.5)) * 0.6;

          // Fine starfield
          vec2 sg = floor(uv * vec2(220.0, 130.0));
          vec2 sf = fract(uv * vec2(220.0, 130.0)) - 0.5;
          float h = hash12(sg);
          if (h > 0.986) {
            float tw = 0.6 + 0.4 * sin(uTime * (2.0 + h * 5.0) + h * 60.0);
            float star = exp(-dot(sf, sf) * 42.0) * tw;
            col += mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.9, 0.72), fract(h * 73.1)) * star * (1.0 - 0.55 * uZoom);
          }

          o = vec4(col, 1.0);
        }
      `,
        { uMouse: new THREE.Vector2(), uZoom: 0 }
      );

      // 3D Precision Astronomical 24-Hour Clock Dial (infinite-precision GLSL engravings)
      const dialMat = new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3,
        transparent: true,
        side: THREE.DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uAngle: { value: 0 },       // Current hand angle in radians (0 at 12 o'clock, clockwise positive)
          uMacro: { value: 0 },       // 0 = full clock, 1 = 4-second push-in, 2 = 4-ms macro close-up
          uSparkHuman: { value: 0 },  // 23:59:56 spark
          uSparkAgri: { value: 0 },   // 23:59:59.9 spark
          uTension: { value: 0 },     // 0.004s trembling needle
        },
        vertexShader: `
          precision highp float;
          in vec3 position;
          in vec2 uv;
          uniform mat4 modelMatrix;
          uniform mat4 viewMatrix;
          uniform mat4 projectionMatrix;
          out vec2 vLocal;
          out vec3 vWorld;
          void main() {
            vLocal = position.xy;
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorld = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader:
          `precision highp float;
          ` +
          M.GLSL_NOISE +
          `
          in vec2 vLocal;
          in vec3 vWorld;
          uniform vec3 cameraPosition;
          uniform float uTime;
          uniform float uAngle;
          uniform float uMacro;
          uniform float uSparkHuman;
          uniform float uSparkAgri;
          uniform float uTension;
          out vec4 o;

          const float TAU = 6.28318530718;

          float arcMask(float a, float a0, float a1) {
            return smoothstep(a0 - 0.008, a0 + 0.004, a) * (1.0 - smoothstep(a1 - 0.004, a1 + 0.008, a));
          }

          void main() {
            vec2 p = vLocal;
            float r = length(p);
            float R = 4.8;
            if (r > R + 0.35) discard;

            // Angle clockwise from 12 o'clock (+Y): [0, TAU)
            float ang = mod(atan(p.x, p.y) + TAU, TAU);
            float fw = max(fwidth(r), 0.00025);
            float fwa = max(fwidth(atan(p.x, p.y)), 0.00005);

            // Outer chamfered spun-brass bezel
            float discMask = 1.0 - smoothstep(R + 0.14 - fw, R + 0.14 + fw, r);
            float bezel = smoothstep(R - 0.24, R - 0.16, r) * discMask;
            float innerRing = exp(-pow((r - 3.62) / max(0.018, fw * 1.4), 2.0));
            float outerHair = exp(-pow((r - 4.46) / max(0.014, fw * 1.2), 2.0));

            // Brushed obsidian face + fine guilloche concentric micro-rings
            float brush = vnoise(vec2(ang * 48.0, r * 14.0));
            float guilloche = 0.5 + 0.5 * sin(r * 68.0 + sin(ang * 24.0) * 1.6);
            vec3 obs = vec3(0.016, 0.020, 0.032) * (0.85 + 0.25 * brush) + vec3(0.012, 0.014, 0.022) * guilloche * smoothstep(3.6, 0.5, r);

            // Anisotropic specular highlight on spun brass bezel
            vec3 L = normalize(vec3(-0.45, 0.65, 0.85));
            vec3 V = normalize(cameraPosition - vWorld);
            vec3 H = normalize(L + V);
            float aniso = pow(abs(sin(ang * 2.0 - 0.6)), 3.0);
            vec3 brass = vec3(0.42, 0.31, 0.16) + vec3(0.68, 0.53, 0.27) * (0.35 + 0.65 * aniso) + vec3(1.1, 0.92, 0.6) * pow(max(H.z, 0.0), 18.0) * 0.35;

            vec3 col = mix(obs, brass, bezel * 0.92);
            col += vec3(0.75, 0.58, 0.30) * (innerRing * 0.45 + outerHair * 0.55);

            // Radial tick marks (24 hours, 96 quarters, 288 fine ticks)
            float t24 = abs(fract(ang / TAU * 24.0 + 0.5) - 0.5) / 24.0 * TAU * r;
            float t96 = abs(fract(ang / TAU * 96.0 + 0.5) - 0.5) / 96.0 * TAU * r;
            float t288 = abs(fract(ang / TAU * 288.0 + 0.5) - 0.5) / 288.0 * TAU * r;

            float m24 = (1.0 - smoothstep(0.012, 0.012 + fw * 1.6, t24)) * smoothstep(3.75, 3.79, r) * (1.0 - smoothstep(4.36, 4.40, r));
            float m96 = (1.0 - smoothstep(0.007, 0.007 + fw * 1.4, t96)) * smoothstep(4.02, 4.05, r) * (1.0 - smoothstep(4.36, 4.39, r));
            float m288 = (1.0 - smoothstep(0.004, 0.004 + fw * 1.2, t288)) * smoothstep(4.18, 4.20, r) * (1.0 - smoothstep(4.36, 4.38, r));

            col += vec3(0.95, 0.80, 0.48) * m24 * 0.95;
            col += vec3(0.68, 0.58, 0.42) * m96 * 0.45;
            col += vec3(0.45, 0.48, 0.56) * m288 * 0.25;

            // Fine vernier ticks around 12 o'clock when zooming into the last 4 seconds & 4 milliseconds!
            float signedTop = atan(p.x, p.y); // 0 at 12 o'clock, negative just before midnight
            float nearTop = smoothstep(0.32, 0.02, abs(signedTop)) * smoothstep(0.15, 0.95, uMacro);
            if (nearTop > 0.001) {
              // Second ticks (1 second scale amplified visually near midnight notch)
              float secGrid = abs(fract(signedTop * 140.0 + 0.5) - 0.5) / 140.0 * r;
              float msGrid = abs(fract(signedTop * 1400.0 + 0.5) - 0.5) / 1400.0 * r;
              float secTick = (1.0 - smoothstep(fw * 0.8, fw * 2.2, secGrid)) * smoothstep(4.05, 4.08, r) * (1.0 - smoothstep(4.44, 4.46, r));
              float msTick = (1.0 - smoothstep(fw * 0.6, fw * 1.8, msGrid)) * smoothstep(4.24, 4.26, r) * (1.0 - smoothstep(4.44, 4.46, r)) * smoothstep(0.9, 1.8, uMacro);
              col += vec3(0.58, 0.78, 0.96) * secTick * nearTop * 0.52;
              col += vec3(0.95, 0.76, 0.44) * msTick * nearTop * 0.30;
            }

            // Glowing Epoch Arcs along the rim (illuminated up to current sweep uAngle)
            float arcBand = exp(-pow((r - 3.92) / 0.11, 2.0));
            float swept = 1.0 - smoothstep(uAngle - 0.02, uAngle + 0.005, ang);
            // 00:00 -> 04:00 (Hadean/Archean crimson-gold)
            vec3 e0 = vec3(1.25, 0.44, 0.18) * arcMask(ang, 0.0, TAU * (4.0 / 24.0));
            // 04:00 -> 21:00 (3B years single-cell ocean cyan-blue)
            vec3 e1 = vec3(0.18, 0.68, 0.98) * arcMask(ang, TAU * (4.0 / 24.0), TAU * (21.0 / 24.0));
            // 21:00 -> 22:56 (Cambrian/Forests emerald)
            vec3 e2 = vec3(0.24, 0.92, 0.60) * arcMask(ang, TAU * (21.0 / 24.0), TAU * (22.933 / 24.0));
            // 22:56 -> 23:39 (Dinosaurs warm amber-gold)
            vec3 e3 = vec3(1.25, 0.86, 0.25) * arcMask(ang, TAU * (22.933 / 24.0), TAU * (23.65 / 24.0));
            // 23:39 -> 24:00 (Post-K-Pg lavender-ivory)
            vec3 e4 = vec3(0.88, 0.82, 1.15) * arcMask(ang, TAU * (23.65 / 24.0), TAU);

            col += (e0 + e1 + e2 + e3 + e4) * arcBand * swept * 0.88;

            // Asteroid impact scarlet notch at 23:39
            float astAng = TAU * (23.65 / 24.0);
            float dAst = abs(ang - astAng) * r;
            col += vec3(1.8, 0.25, 0.18) * exp(-pow(dAst / 0.032, 2.0)) * smoothstep(3.65, 4.35, r) * step(astAng, uAngle + 0.02);

            // Razor-bright MIDNIGHT 12-o'clock line (signedTop == 0)
            float dMid = abs(signedTop) * r;
            float midLine = (1.0 - smoothstep(max(0.003, fw * 0.9), max(0.012, fw * 2.8), dMid)) * smoothstep(3.55, 3.65, r) * (1.0 - smoothstep(4.52, 4.56, r));
            float midGlow = exp(-dMid / mix(0.06, 0.014, clamp(uMacro * 0.5, 0.0, 1.0))) * smoothstep(3.5, 4.55, r);
            col += vec3(1.9, 1.75, 1.45) * midLine * (0.85 + 0.8 * clamp(uMacro, 0.0, 1.0));
            col += vec3(1.1, 0.85, 0.45) * midGlow * (0.28 + 0.45 * clamp(uMacro * 0.5, 0.0, 1.0));

            // 23:59:56 Homo sapiens silver spark & 23:59:59.9 Agriculture warm-gold ember
            // Positioned on the amplified midnight vernier scale so they are clearly readable in Beats 1 & 2
            vec2 pHuman = vec2(-0.088, 4.18);
            float dHuman = length(p - pHuman);
            float sparkH = (exp(-dHuman * 45.0) + 0.45 * exp(-dHuman * 14.0)) * uSparkHuman;
            col += vec3(1.45, 1.75, 2.2) * sparkH;

            vec2 pAgri = vec2(-0.018, 4.18);
            float dAgri = length(p - pAgri);
            float sparkA = (exp(-dAgri * 65.0) + 0.45 * exp(-dAgri * 20.0)) * uSparkAgri;
            col += vec3(2.2, 1.55, 0.55) * sparkA;

            // Main sweeping luminous clock hand (trembles with electric tension in Beat 2 at -0.004s!)
            float jitter = uTension * (sin(uTime * 68.0) * 0.00055 + sin(uTime * 113.0) * 0.00035);
            float handAng = uAngle + jitter;
            vec2 handDir = vec2(sin(handAng), cos(handAng));
            vec2 handPerp = vec2(handDir.y, -handDir.x);
            float along = dot(p, handDir);
            float across = abs(dot(p, handPerp));

            float hWidth = mix(0.036, 0.0045, clamp(uMacro * 0.5, 0.0, 1.0)) * mix(1.0, 0.28, clamp(along / 4.4, 0.0, 1.0));
            float handBody = (1.0 - smoothstep(hWidth, hWidth + fw * 1.5, across)) * smoothstep(-0.65, -0.55, along) * (1.0 - smoothstep(4.42, 4.46, along));
            float handGlow = exp(-across / max(hWidth * 4.5, 0.012)) * smoothstep(-0.3, 0.2, along) * (1.0 - smoothstep(4.45, 4.55, along));

            vec3 handCol = mix(vec3(1.35, 1.15, 0.78), vec3(1.65, 2.05, 2.45), clamp(uMacro * 0.5, 0.0, 1.0));
            handCol = mix(handCol, vec3(2.4, 1.35, 0.45), uTension * 0.75);
            col = mix(col, handCol, clamp(handBody, 0.0, 1.0));
            col += handCol * handGlow * (0.35 + 0.55 * uTension);

            // Center pivot jewel & brass cap
            float hub = 1.0 - smoothstep(0.18, 0.21, r);
            float hubRing = exp(-pow((r - 0.26) / 0.022, 2.0));
            col = mix(col, vec3(1.15, 0.92, 0.52), hub);
            col += vec3(0.9, 0.72, 0.40) * hubRing;

            // Subtle domed glass specular crescent across dial
            float glass = pow(max(0.0, 1.0 - length(p - vec2(-1.4, 1.7)) * 0.22), 4.0) * smoothstep(R, R - 0.6, r);
            col += vec3(0.18, 0.22, 0.30) * glass * (1.0 - 0.75 * clamp(uMacro * 0.5, 0.0, 1.0));

            // Macro readability vignette on left side of midnight notch so top-left & bottom-left typography stay crisp
            float macroScrim = smoothstep(0.6, 1.6, uMacro) * smoothstep(-0.04, -0.26, signedTop) * 0.52;
            col *= 1.0 - macroScrim;

            o = vec4(col, discMask);
          }
        `,
      });

      const dial = new THREE.Mesh(new THREE.PlaneGeometry(10.6, 10.6), dialMat);
      scene3D.add(dial);

      // 3D Sculpted Brass Astronomical Gimbal Rings orbiting the dial
      const ringMat = new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3,
        uniforms: { uTime: { value: 0 } },
        vertexShader: `
          precision highp float;
          in vec3 position;
          in vec3 normal;
          uniform mat4 modelMatrix;
          uniform mat4 viewMatrix;
          uniform mat4 projectionMatrix;
          out vec3 vN;
          out vec3 vW;
          void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vW = wp.xyz;
            vN = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: `
          precision highp float;
          in vec3 vN;
          in vec3 vW;
          uniform vec3 cameraPosition;
          out vec4 o;
          void main() {
            vec3 N = normalize(vN);
            vec3 V = normalize(cameraPosition - vW);
            vec3 L = normalize(vec3(-0.5, 0.7, 0.8));
            float diff = max(dot(N, L), 0.0);
            float spec = pow(max(dot(reflect(-L, N), V), 0.0), 28.0);
            float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
            vec3 c = vec3(0.16, 0.12, 0.06) + vec3(0.75, 0.58, 0.28) * diff + vec3(1.3, 1.05, 0.65) * spec * 0.8 + vec3(0.45, 0.58, 0.85) * fres * 0.35;
            o = vec4(c, 1.0);
          }
        `,
      });
      const gimbal1 = new THREE.Mesh(new THREE.TorusGeometry(5.32, 0.045, 16, 128), ringMat);
      const gimbal2 = new THREE.Mesh(new THREE.TorusGeometry(5.78, 0.025, 12, 128), ringMat);
      scene3D.add(gimbal1, gimbal2);

      // Floating DOF dust motes in 3D space around the clock
      const MOTE_N = 520;
      const mRand = rng(712);
      const mGeo = new THREE.InstancedBufferGeometry();
      const pQuad = new THREE.PlaneGeometry(1, 1);
      mGeo.index = pQuad.index;
      mGeo.attributes.position = pQuad.attributes.position;
      mGeo.attributes.uv = pQuad.attributes.uv;
      const mPos = new Float32Array(MOTE_N * 4);
      for (let i = 0; i < MOTE_N; i++) {
        mPos[i * 4 + 0] = (mRand() - 0.5) * 18.0;
        mPos[i * 4 + 1] = (mRand() - 0.5) * 12.0;
        mPos[i * 4 + 2] = (mRand() - 0.5) * 10.0;
        mPos[i * 4 + 3] = mRand();
      }
      mGeo.setAttribute('aMote', new THREE.InstancedBufferAttribute(mPos, 4));
      mGeo.instanceCount = MOTE_N;

      const moteMat = new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 } },
        vertexShader: `
          precision highp float;
          in vec3 position;
          in vec2 uv;
          in vec4 aMote;
          uniform mat4 viewMatrix;
          uniform mat4 projectionMatrix;
          uniform float uTime;
          out vec2 vUv;
          out float vA;
          void main() {
            vUv = uv;
            vec3 c = aMote.xyz;
            c.x += sin(uTime * 0.25 + aMote.w * 18.0) * 0.35;
            c.y += cos(uTime * 0.21 + aMote.w * 13.0) * 0.35;
            float sz = mix(0.025, 0.085, aMote.w);
            vec3 r = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
            vec3 u = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
            gl_Position = projectionMatrix * viewMatrix * vec4(c + r * position.x * sz + u * position.y * sz, 1.0);
            vA = 0.2 + 0.45 * sin(uTime * 1.4 + aMote.w * 30.0) * 0.5 + 0.25;
          }
        `,
        fragmentShader: `
          precision highp float;
          in vec2 vUv;
          in float vA;
          out vec4 o;
          void main() {
            vec2 d = (vUv - 0.5) * 2.0;
            float g = exp(-dot(d, d) * 4.5);
            if (g < 0.01) discard;
            o = vec4(vec3(0.95, 0.84, 0.58) * g, g * vA * 0.55);
          }
        `,
      });
      const motes = new THREE.Mesh(mGeo, moteMat);
      motes.frustumCulled = false;
      scene3D.add(motes);

      // 2D Editorial Typography Overlay
      const tClockRead = ctx.text('00:00:00', {
        x: 96, y: 118, size: 54, font: 'monoMed', color: '#f6d78e',
      });
      const tEpochBadge = ctx.text('地球诞生 · 46 亿年前', {
        x: 98, y: 188, size: 25, font: 'textMed', color: '#eef5ff',
      });

      const tCopy0 = ctx.text('如果把 46 亿年，\n拨成一昼夜二十四小时——', {
        x: 96, y: 782, size: 54, font: 'displayBold', color: '#f5f6fa', leading: 1.26,
      });

      const tCopy1 = ctx.text('距离午夜还剩四秒，\n智人才刚刚走进房间。', {
        x: 96, y: 762, size: 56, font: 'displayBold', color: '#f5f6fa', leading: 1.24,
      });
      const tMarkHuman = ctx.text('23:59:56 · 智人出现', {
        x: 1806, y: 310, size: 28, font: 'monoMed', color: '#cce6ff', align: 'right',
      });
      const tMarkAgri = ctx.text('23:59:59.9 · 农业诞生', {
        x: 1806, y: 368, size: 28, font: 'monoMed', color: '#ffd988', align: 'right',
      });

      const tCopy2 = ctx.text('我们在午夜前 0.004 秒按下开关，\n却在改写明天一整天的天气。', {
        x: 92, y: 752, size: 48, font: 'displayBold', color: '#fffaf0', leading: 1.32,
      });
      const tMarkInd = ctx.text('23:59:59.996 · 工业时代\n距午夜 0.004 秒', {
        x: 1796, y: 292, size: 28, font: 'monoMed', color: '#ffb85c', align: 'right', leading: 1.45,
      });

      ov.add(tClockRead, tEpochBadge, tCopy0, tCopy1, tMarkHuman, tMarkAgri, tCopy2, tMarkInd);

      const once = makeOnce();
      let lastTimeTxt = '';
      let lastBadgeTxt = '';
      let curPageTxt = '00:00:00';

      const milestones = [
        { sec: 0, label: '00:00 · 地球诞生（46 亿年前）', key: 'm0' },
        { sec: 4 * 3600, label: '04:00 · 最早的生命（38 亿年前）', key: 'm1' },
        { sec: 21 * 3600, label: '21:00 · 寒武纪生命大爆发（5.4 亿年前）', key: 'm2' },
        { sec: 22 * 3600 + 56 * 60, label: '22:56 · 恐龙称霸陆地（2.3 亿年前）', key: 'm3' },
        { sec: 23 * 3600 + 39 * 60, label: '23:39 · 小行星撞击（6,600 万年前）', key: 'm4' },
      ];

      return {
        anchor() {
          return { x: 960, y: 540, size: 420, angle: 0 };
        },
        page() {
          return curPageTxt;
        },
        enter() {
          once.reset();
          lastTimeTxt = '';
          lastBadgeTxt = '';
          curPageTxt = '00:00:00';
        },
        update(s) {
          const TAU = Math.PI * 2;
          // Beat 0 sweep: 00:00 -> 23:39 (85140s)
          const p0 = ease.io3(s.k(0, 0.3, 5.4, ease.lin));
          const p1 = ease.io3(s.k(1, 0.0, 4.8, ease.lin));
          const p2 = ease.io3(s.k(2, 0.0, 4.6, ease.lin));

          let curSec = p0 * (23 * 3600 + 39 * 60);
          let decimals = 0;
          let badge = milestones[0].label;

          for (let i = 0; i < milestones.length; i++) {
            if (curSec >= milestones[i].sec - 60) {
              badge = milestones[i].label;
              if (i > 0) {
                once.fire(milestones[i].key, s.p[0] > 0 && curSec >= milestones[i].sec, () => {
                  ctx.sfx('tick', { gain: 0.75, pitch: 0.9 + i * 0.09 });
                }, s);
              }
            }
          }

          if (s.p[1] > 0) {
            // Advance from 23:39:00 -> 23:59:56 -> 23:59:59.9
            const toHuman = ease.out3(s.k(1, 0.4, 2.8, ease.lin));
            const toAgri = ease.io2(s.k(1, 3.2, 5.0, ease.lin));
            curSec = lerp(85140, 86396, toHuman);
            curSec = lerp(curSec, 86399.9, toAgri);
            decimals = toAgri > 0.15 ? 1 : 0;
            badge = toAgri > 0.4 ? '23:59:59.9 · 农业诞生（1 万年前）' : '23:59:56 · 智人走进房间（30 万年前）';
          }
          if (s.p[2] > 0) {
            const toInd = ease.out3(s.k(2, 0.4, 3.2, ease.lin));
            curSec = lerp(86399.9, 86399.996, toInd);
            decimals = 3;
            badge = '23:59:59.996 · 工业时代（距午夜 0.004 秒）';
          }

          const timeStr = fmtClock(curSec, decimals);
          curPageTxt = timeStr;
          if (timeStr !== lastTimeTxt) {
            lastTimeTxt = timeStr;
            tClockRead.set(timeStr);
          }
          if (badge !== lastBadgeTxt) {
            lastBadgeTxt = badge;
            tEpochBadge.set(badge);
          }

          // Sound hits for Beats 1 & 2
          once.fire('humanChime', s.p[1] > 0 && s.at(1) > 2.4, () => ctx.sfx('chime', { gain: 0.72, pitch: 1.15 }), s);
          once.fire('agriTick', s.p[1] > 0 && s.at(1) > 4.2, () => ctx.sfx('tick', { gain: 0.85, pitch: 1.45 }), s);
          once.fire('indTick', s.p[2] > 0 && s.at(2) > 1.2, () => ctx.sfx('tick', { gain: 0.9, pitch: 1.75 }), s);
          once.fire('indSub', s.p[2] > 0 && s.at(2) > 2.6, () => ctx.sfx('sub', { gain: 0.55 }), s);

          // Hand angle: physical angle in Beat 0, amplified micro-scale right before midnight in Beats 1–2
          let handAngle = (curSec / 86400) * TAU;
          if (s.p[1] > 0) {
            const push = ease.io3(s.k(1, 0.4, 2.8, ease.lin));
            const agri = ease.io2(s.k(1, 3.2, 5.0, ease.lin));
            const visualBeat1 = lerp(TAU - 0.021, TAU - 0.0043, agri);
            handAngle = lerp(handAngle, visualBeat1, push);
          }
          if (s.p[2] > 0) {
            const macro = ease.io3(s.k(2, 0.2, 3.0, ease.lin));
            handAngle = lerp(handAngle, TAU - 0.0014, macro);
          }

          // Camera choreography:
          // Beat 0: majestic full view centered at (0,0) matching anchor(s)={960,540}
          // Beat 1: push right into 12-o'clock midnight notch (0, +4.18)
          // Beat 2: ultra-macro close-up on the final 0.004s hairline gap!
          const z1 = ease.io4(s.k(1, 0.0, 2.8, ease.lin));
          const z2 = ease.io4(s.k(2, 0.0, 3.0, ease.lin));

          const camZ = lerp(lerp(15.6, 2.85, z1), 0.78, z2);
          const camY = lerp(lerp(0.0, 4.16, z1), 4.20, z2);
          const camX = lerp(lerp(0.0, -0.04, z1), -0.006, z2);

          const parScale = lerp(lerp(0.55, 0.12, z1), 0.025, z2);
          cam.aspect = gfx.aspect;
          cam.position.set(camX + s.mouse.x * parScale, camY - s.mouse.y * parScale * 0.7, camZ);
          cam.lookAt(camX, camY, 0);
          cam.updateProjectionMatrix();

          // Subtle 3D gimbal rotation
          gimbal1.rotation.set(0.18 + Math.sin(s.t * 0.22) * 0.08, s.t * 0.09, 0.12);
          gimbal2.rotation.set(-0.24 + Math.cos(s.t * 0.17) * 0.1, -s.t * 0.06, -0.18);

          // Update shader uniforms
          const macroLevel = z1 + z2;
          const tension = smoothstep(0.3, 1.0, z2);
          bgPass.u.uTime.value = s.t;
          bgPass.u.uMouse.value.set(s.mouse.x, s.mouse.y);
          bgPass.u.uZoom.value = clamp(macroLevel * 0.5, 0, 1);

          dialMat.uniforms.uTime.value = s.t;
          dialMat.uniforms.uAngle.value = handAngle;
          dialMat.uniforms.uMacro.value = macroLevel;
          dialMat.uniforms.uSparkHuman.value = smoothstep(1.8, 3.2, s.at(1));
          dialMat.uniforms.uSparkAgri.value = smoothstep(3.6, 5.0, s.at(1));
          dialMat.uniforms.uTension.value = tension;

          ringMat.uniforms.uTime.value = s.t;
          moteMat.uniforms.uTime.value = s.t;

          setParam(ctx, 'hum', 0.2 + z1 * 0.25);
          setParam(ctx, 'tension', tension * 0.9);
          setParam(ctx, 'deep', 0.25);

          // Typography reveals
          const qExit = smoothstep(0.0, 0.4, s.exit);
          tClockRead.show(s.k(0, 0.0, 0.9, ease.lin), { style: 'fade', q: qExit });
          tEpochBadge.show(s.k(0, 0.15, 1.1, ease.lin), { style: 'fade', q: qExit });

          const q0 = s.k(1, 0.0, 0.7, ease.lin);
          tCopy0.show(s.k(0, 0.4, 2.2, ease.lin), { style: 'rise', by: 'line', stagger: 0.4, q: q0 });

          const q1 = s.k(2, 0.0, 0.7, ease.lin);
          tCopy1.show(s.k(1, 0.9, 2.8, ease.lin), { style: 'rise', by: 'line', stagger: 0.4, q: q1 });
          tMarkHuman.show(s.k(1, 2.2, 3.2, ease.lin), { style: 'blur', q: q1 });
          tMarkAgri.show(s.k(1, 3.8, 4.9, ease.lin), { style: 'blur', q: q1 });

          tCopy2.show(s.k(2, 0.9, 2.9, ease.lin), { style: 'rise', by: 'line', stagger: 0.4, q: qExit });
          tMarkInd.show(s.k(2, 1.4, 2.6, ease.lin), { style: 'blur', q: qExit });
        },
        render(target, s) {
          const z2 = ease.io4(s.k(2, 0.0, 3.0, ease.lin));
          bgPass.render(rt, true);
          gfx.draw(scene3D, cam, rt, { clear: false });
          gfx.post(rt, target, {
            bloom: lerp(0.36, 0.52, z2),
            threshold: 0.78,
            exposure: 1.06,
            contrast: 1.08,
            saturation: 1.08,
            vignette: 0.36,
            grain: 0.024,
            time: s.t,
          });
          ov.render(target);
        },
      };
    },
  };

  // ============================================================================
  // SCENE 8: split — 《两种下个一万年》 (Interactive Draggable Split-Screen!)
  // ============================================================================
  const sceneSplit = {
    id: 'split',
    title: '两种下个一万年',
    enterWith: 'tear',
    hud: { color: '#e6edf5', font: 'monoMed', alpha: 0.88 },
    beats: [
      { dur: 5.0, delay: 0.8, hold: 5.0, page: '+10,000 年' },
      { dur: 5.0, hold: 4.5, page: '+100,000 年' },
      { dur: 5.0, hold: 6.0, page: '+1,000,000 年' },
    ],
    notes: [
      '同一片海湾，同一颗行星。你可以直接左右拖动屏幕中央的分界线：左边是失控的惯性轨道——干裂的高地、热浪与吞噬海岸的风暴潮；右边是稳态延续轨道——清澈的全新世海湾与清洁能源光弧。',
      '但说句实话：地球其实不在乎。四十六亿年里，它经历过岩浆海、雪球地球与五次物种清零。无论我们怎么选，再过十万年、一百万年，它终究会恢复平静。',
      '真正会在乎的，只有住在这 0.002 像素里的我们。',
    ],
    create(ctx) {
      const M = LHP.math;
      const { THREE, gfx, view } = ctx;
      const { clamp, lerp, smoothstep, invLerp, damp, ease } = M;

      const rt = gfx.target({ samples: 1, depth: false });
      const ov = ctx.overlay();

      // Single-pass synchronized raymarched dual-world coastal bay & mountain shader
      // Both left (inertia/scorched) and right (Holocene/lush) share IDENTICAL topography!
      const worldPass = gfx.pass(
        M.GLSL_NOISE +
          M.GLSL_COLOR +
          `
        uniform float uSplit;      // Divider X in 0..1 screen UV
        uniform float uDrag;       // 0..1 active drag glow
        uniform float uPulse;      // Breathing invitation highlight before first drag
        uniform vec2 uMouse;
        uniform float uBeat1;
        uniform float uBeat2;

        // Shared deterministic coastal bay & mountain range topography
        float terrainH(vec2 p) {
          // Crescent bay carved on center-right, steep coastal ridge on left/back, headland peninsula
          float bay = exp(-dot((p - vec2(1.45, 7.6)) * vec2(0.30, 0.24), (p - vec2(1.45, 7.6)) * vec2(0.30, 0.24)));
          float inlet = exp(-dot((p - vec2(-0.6, 5.4)) * vec2(0.42, 0.35), (p - vec2(-0.6, 5.4)) * vec2(0.42, 0.35)));
          float ridgeBack = smoothstep(5.5, 16.5, p.y) * (1.25 + 0.85 * sin(p.x * 0.26 + 0.7));
          float ridgeLeft = smoothstep(1.2, -5.8, p.x) * smoothstep(2.0, 9.0, p.y) * 1.45;
          float headland = exp(-dot((p - vec2(3.9, 9.2)) * vec2(0.28, 0.32), (p - vec2(3.9, 9.2)) * vec2(0.28, 0.32))) * 1.35;
          float island = exp(-dot((p - vec2(1.6, 13.8)) * vec2(0.45, 0.55), (p - vec2(1.6, 13.8)) * vec2(0.45, 0.55))) * 0.82;

          // Ridged multi-octave detail
          float n1 = fbm(p * 0.26 + vec2(1.7, -0.9));
          float n2 = 1.0 - abs(vnoise(p * 0.68 + vec2(3.1, 2.4)) * 2.0 - 1.0);
          float detail = (n1 * 0.85 + n2 * n2 * 0.52);

          float h = 0.08 + ridgeBack * 1.25 + ridgeLeft * 0.95 + headland + island;
          h += detail * (0.38 + 0.55 * ridgeBack + 0.4 * ridgeLeft + 0.35 * headland);
          h -= (bay * 1.35 + inlet * 0.52);
          return h;
        }

        vec3 calcNormal(vec2 p, float eps) {
          float hL = terrainH(p - vec2(eps, 0.0));
          float hR = terrainH(p + vec2(eps, 0.0));
          float hD = terrainH(p - vec2(0.0, eps));
          float hU = terrainH(p + vec2(0.0, eps));
          return normalize(vec3(hL - hR, 2.0 * eps, hD - hU));
        }

        vec3 skyColor(vec3 rd, float isRight, vec3 sunDir) {
          float h = clamp(rd.y, 0.0, 1.0);
          float sunAmt = max(dot(rd, sunDir), 0.0);

          // Left: Scorched terracotta-amber dust haze
          vec3 skyL = mix(vec3(0.86, 0.44, 0.21), vec3(0.42, 0.16, 0.09), smoothstep(0.0, 0.38, h));
          skyL = mix(skyL, vec3(0.18, 0.07, 0.05), smoothstep(0.32, 0.95, h));
          skyL += vec3(1.45, 0.72, 0.28) * (pow(sunAmt, 7.0) * 0.35 + pow(sunAmt, 42.0) * 0.75);

          // Right: Crisp Holocene azure & golden sunlit horizon
          vec3 skyR = mix(vec3(0.76, 0.88, 0.96), vec3(0.24, 0.54, 0.86), smoothstep(0.0, 0.36, h));
          skyR = mix(skyR, vec3(0.06, 0.18, 0.44), smoothstep(0.30, 0.95, h));
          skyR += vec3(1.15, 0.94, 0.68) * (pow(sunAmt, 8.0) * 0.22 + pow(sunAmt, 72.0) * 0.85);

          vec3 col = mix(skyL, skyR, isRight);

          // Procedural atmospheric clouds / dust strata
          if (rd.y > 0.01) {
            vec2 cp = rd.xz / (rd.y + 0.14) * 0.9 + vec2(uTime * (isRight > 0.5 ? 0.015 : 0.028), 0.0);
            float cn = fbm(cp * 1.4 + fbm(cp * 2.2));
            if (isRight > 0.5) {
              float cl = smoothstep(0.50, 0.82, cn) * smoothstep(0.01, 0.22, rd.y);
              vec3 clCol = mix(vec3(0.92, 0.96, 1.02), vec3(1.08, 0.98, 0.86), pow(sunAmt, 3.0));
              col = mix(col, clCol, cl * 0.62);
            } else {
              float smog = smoothstep(0.35, 0.78, cn) * smoothstep(0.0, 0.35, rd.y);
              col = mix(col, vec3(0.68, 0.30, 0.14), smog * 0.48);
            }
          }
          return col;
        }

        void main() {
          vec2 uv = vUv;
          float asp = uRes.x / max(uRes.y, 1.0);
          float isRight = step(uSplit, uv.x);

          // Subtle heat-shimmer distortion ONLY on the scorched left side!
          vec2 uvDist = uv;
          if (isRight < 0.5) {
            float shim = sin(uv.y * 95.0 - uTime * 7.5 + uv.x * 24.0) * 0.0009 * smoothstep(0.15, 0.65, uv.y) * smoothstep(0.95, 0.45, uv.y);
            uvDist.x += shim;
          }

          // Shared camera overlooking the sweeping coastal bay
          vec3 ro = vec3(-0.35 + uMouse.x * 0.55 + sin(uTime * 0.14) * 0.18, 2.55 - uMouse.y * 0.22, -0.4);
          vec3 ta = vec3(0.65, 0.55, 8.2);
          vec3 ww = normalize(ta - ro);
          vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
          vec3 vv = cross(uu, ww);

          vec2 sc = (uvDist - 0.5) * vec2(asp, 1.0);
          vec3 rd = normalize(sc.x * uu + sc.y * vv + 1.32 * ww);

          vec3 sunDir = normalize(vec3(0.55, 0.34, 0.76));
          float seaLevel = mix(0.24, 0.02, isRight); // Left suffers +0.22 storm-surge sea-level rise!

          // Raymarch shared coastal terrain
          float t = 0.2;
          float tMax = 28.0;
          bool hit = false;
          for (int i = 0; i < 64; i++) {
            vec3 pos = ro + rd * t;
            float h = terrainH(pos.xz);
            float d = pos.y - h;
            if (d < 0.008 * t) {
              // Binary refine
              float tLo = max(0.0, t - 0.32 * (0.35 + t * 0.04));
              float tHi = t;
              for (int j = 0; j < 4; j++) {
                float tm = 0.5 * (tLo + tHi);
                vec3 pm = ro + rd * tm;
                if (pm.y - terrainH(pm.xz) < 0.0) tHi = tm; else tLo = tm;
              }
              t = 0.5 * (tLo + tHi);
              hit = true;
              break;
            }
            t += max(0.08, d * 0.58);
            if (t > tMax) break;
          }

          // Intersect ocean plane
          float tSea = (seaLevel - ro.y) / (rd.y + sign(rd.y + 1e-6) * 1e-5);
          bool hitSea = (rd.y < -0.001) && (tSea > 0.1) && (tSea < tMax) && (!hit || tSea < t);

          vec3 col = skyColor(rd, isRight, sunDir);

          if (hitSea) {
            vec3 wp = ro + rd * tSea;
            float shoreDepth = seaLevel - terrainH(wp.xz);

            // Animated wave normal
            float wAmp = mix(0.065, 0.022, isRight);
            float wSpd = mix(1.4, 0.65, isRight);
            float w1 = vnoise(wp.xz * 2.8 + vec2(uTime * wSpd, -uTime * 0.45));
            float w2 = vnoise(wp.xz * 7.5 - vec2(uTime * wSpd * 0.7, uTime * 0.9));
            vec3 wn = normalize(vec3((w1 - 0.5) * wAmp * 3.0, 1.0, (w2 - 0.5) * wAmp * 3.0));

            vec3 refDir = reflect(rd, wn);
            refDir.y = max(refDir.y, 0.03);
            vec3 refCol = skyColor(refDir, isRight, sunDir);
            float fres = pow(1.0 - max(dot(-rd, wn), 0.0), 4.2);

            // Water body color: murky storm-surge bronze vs crystal sapphire-turquoise bay
            vec3 deepL = vec3(0.09, 0.055, 0.042);
            vec3 shalL = vec3(0.32, 0.18, 0.09);
            vec3 deepR = vec3(0.02, 0.14, 0.28);
            vec3 shalR = vec3(0.08, 0.48, 0.52);

            float shal = exp(-max(shoreDepth, 0.0) * 3.2);
            vec3 waterCol = mix(mix(deepL, shalL, shal), mix(deepR, shalR, shal), isRight);
            col = mix(waterCol, refCol, 0.20 + 0.68 * fres);

            // Specular sun glitter on bay
            float spec = pow(max(dot(refDir, sunDir), 0.0), mix(36.0, 120.0, isRight));
            col += mix(vec3(1.4, 0.72, 0.30), vec3(1.35, 1.18, 0.88), isRight) * spec * 0.95;

            // Coastal surf foam
            float foam = smoothstep(0.14, 0.0, shoreDepth) * (0.5 + 0.5 * sin(shoreDepth * 42.0 - uTime * 3.2 + w1 * 5.0));
            col = mix(col, mix(vec3(0.75, 0.56, 0.42), vec3(0.92, 0.98, 1.0), isRight), foam * mix(0.68, 0.45, isRight));

            // Atmospheric fog over sea
            float fog = 1.0 - exp(-tSea * mix(0.058, 0.022, isRight));
            col = mix(col, skyColor(normalize(vec3(rd.x, 0.04, rd.z)), isRight, sunDir), fog);
          } else if (hit) {
            vec3 wp = ro + rd * t;
            vec3 n = calcNormal(wp.xz, 0.03 + t * 0.003);
            float diff = max(dot(n, sunDir), 0.0);
            float slope = 1.0 - n.y;
            float alt = wp.y - seaLevel;
            float micro = fbm(wp.xz * 2.2);

            vec3 alb;
            if (isRight > 0.5) {
              // Lush Holocene emerald-pine highlands, sandy shore, alpine snow tips
              vec3 sand = vec3(0.68, 0.60, 0.46);
              vec3 meadow = vec3(0.12, 0.34, 0.16) * (0.75 + 0.5 * micro);
              vec3 pine = vec3(0.055, 0.19, 0.11) * (0.75 + 0.45 * micro);
              vec3 rock = vec3(0.24, 0.27, 0.30);
              vec3 snow = vec3(0.90, 0.94, 0.98);
              alb = mix(sand, meadow, smoothstep(0.04, 0.16, alt));
              alb = mix(alb, pine, smoothstep(0.28, 0.85, alt));
              alb = mix(alb, rock, smoothstep(0.32, 0.62, slope));
              alb = mix(alb, snow, smoothstep(1.55, 2.25, wp.y) * smoothstep(0.6, 0.22, slope));
            } else {
              // Scorched terracotta cracked highlands, bleached salt flats, charred scars
              float crack = smoothstep(0.09, 0.01, worley(wp.xz * 4.5));
              vec3 salt = vec3(0.55, 0.38, 0.24);
              vec3 ochre = vec3(0.46, 0.21, 0.10) * (0.78 + 0.42 * micro);
              vec3 basalt = vec3(0.18, 0.10, 0.08);
              alb = mix(salt, ochre, smoothstep(0.04, 0.24, alt));
              alb = mix(alb, basalt, smoothstep(0.35, 0.68, slope));
              alb *= 1.0 - 0.38 * crack;
            }

            vec3 amb = mix(vec3(0.42, 0.20, 0.11), vec3(0.22, 0.38, 0.56), isRight);
            vec3 sunCol = mix(vec3(1.38, 0.68, 0.30), vec3(1.18, 1.04, 0.84), isRight);
            col = alb * (sunCol * diff * 1.15 + amb * (0.45 + 0.45 * n.y));

            // Delicate clean-energy coastal light arcs & warm beacons on the right headland!
            if (isRight > 0.5) {
              float coastBand = smoothstep(0.03, 0.10, alt) * smoothstep(0.36, 0.14, alt) * smoothstep(0.42, 0.15, slope);
              float arcGrid = exp(-pow(fract(wp.x * 1.1 + wp.z * 0.45) - 0.5, 2.0) * 90.0)
                            * exp(-pow(fract(wp.z * 1.1 - wp.x * 0.35) - 0.5, 2.0) * 90.0);
              float shimmer = 0.7 + 0.3 * sin(uTime * 2.4 + wp.x * 3.0 + wp.z * 2.0);
              col += vec3(0.55, 1.45, 1.35) * coastBand * arcGrid * shimmer * 1.4;
              // Soft coastal ribbon glow along the headland bay
              float ribbon = exp(-pow((alt - 0.12) / 0.035, 2.0)) * smoothstep(3.0, 10.5, wp.z) * smoothstep(13.0, 9.5, wp.z);
              col += vec3(0.95, 0.88, 0.62) * ribbon * 0.35;
            }

            // Atmospheric perspective haze
            float fog = 1.0 - exp(-t * mix(0.056, 0.022, isRight));
            col = mix(col, skyColor(normalize(vec3(rd.x, 0.05, rd.z)), isRight, sunDir), fog);
          }

          // Top & bottom subtle readability scrims so Chinese copy pops over BOTH worlds
          float botScrim = smoothstep(0.42, 0.0, uv.y) * 0.52;
          float topScrim = smoothstep(0.78, 1.0, uv.y) * 0.36;
          col *= (1.0 - botScrim) * (1.0 - topScrim);

          // Glowing vertical split-screen divider & tactile handle (◀ | ▶)
          float dxPx = (uv.x - uSplit) * uRes.x;
          float absDx = abs(dxPx);
          float dyPx = (uv.y - 0.5) * uRes.y;

          // Subtle luminous prism seam
          float seamLine = 1.0 - smoothstep(1.0, 2.2, absDx);
          float seamGlow = exp(-absDx / mix(12.0, 24.0, uDrag + uPulse * 0.4));
          vec3 seamCol = mix(vec3(1.15, 0.88, 0.65), vec3(0.75, 1.15, 1.25), isRight);
          col += seamCol * seamGlow * (0.28 + 0.35 * uDrag + 0.16 * uPulse);
          col = mix(col, vec3(1.55, 1.55, 1.60), seamLine * 0.92);

          // Circular glass handle centered at (uSplit, 0.5)
          float handleR = mix(28.0, 34.0, uDrag) + 2.5 * uPulse;
          float distH = length(vec2(dxPx, dyPx));
          float hFill = 1.0 - smoothstep(handleR - 1.2, handleR + 1.2, distH);
          float hRing = exp(-pow((distH - handleR) / 2.2, 2.0));
          col = mix(col, col * 0.35 + vec3(0.09, 0.11, 0.14), hFill * 0.88);
          col += vec3(1.35, 1.38, 1.45) * hRing * (0.85 + 0.45 * uDrag);

          // Crisp SDF chevrons ◀ | ▶ inside handle
          vec2 hp = vec2(dxPx, dyPx);
          float bar = step(abs(hp.x), 1.3) * step(abs(hp.y), 9.5);
          // Right chevron >
          float rChev = step(6.0, hp.x) * step(hp.x, 14.5) * step(abs(abs(hp.y) - (14.5 - hp.x) * 0.85), 1.6);
          // Left chevron <
          float lChev = step(-14.5, hp.x) * step(hp.x, -6.0) * step(abs(abs(hp.y) - (hp.x + 14.5) * 0.85), 1.6);
          float chev = clamp(bar + rChev + lChev, 0.0, 1.0);
          col = mix(col, vec3(1.6, 1.62, 1.68), chev * hFill);

          o = vec4(max(col, 0.0), 1.0);
        }
      `,
        {
          uSplit: 0.5,
          uDrag: 0,
          uPulse: 0,
          uMouse: new THREE.Vector2(),
          uBeat1: 0,
          uBeat2: 0,
        }
      );

      // 2D Editorial Typography Overlay
      const tLeftTag = ctx.text('失控惯性轨道', {
        x: 92, y: 84, size: 30, font: 'displayBold', color: '#ffb078',
      });
      const tLeftSub = ctx.text('海平面上升 · 干旱热浪 · 生态坍缩', {
        x: 92, y: 126, size: 20, font: 'mono', color: '#e6c2a8',
      });

      const tRightTag = ctx.text('稳态延续轨道', {
        x: 1828, y: 84, size: 30, font: 'displayBold', color: '#8ef0dc', align: 'right',
      });
      const tRightSub = ctx.text('全新世气候 · 清洁共生 · 海岸存续', {
        x: 1828, y: 126, size: 20, font: 'mono', color: '#c4e8e3', align: 'right',
      });

      const tHint = ctx.text('◀  可左右拖动分界线  ▶', {
        x: 960, y: 616, size: 22, font: 'monoMed', color: '#f5f7fa', align: 'center', valign: 'middle',
      });

      const tMain0 = ctx.text('同一片海湾，同一颗行星。', {
        x: 960, y: 814, size: 66, font: 'displayBold', color: '#ffffff', align: 'center',
      });
      const tSub0 = ctx.text('左侧是惯性，右侧是选择。', {
        x: 960, y: 904, size: 34, font: 'textMed', color: '#dce6f2', align: 'center',
      });

      const tMain1 = ctx.text('地球其实不在乎。', {
        x: 960, y: 782, size: 68, font: 'displayBold', color: '#ffffff', align: 'center',
      });
      const tSub1 = ctx.text('46 亿年里它经历过熔岩、雪球与五次清零，\n它终究会恢复平静。', {
        x: 960, y: 874, size: 32, font: 'text', color: '#dbe4f0', align: 'center', leading: 1.42,
      });

      const tMain2 = ctx.text('在乎的，\n只有住在这 0.002 像素里的我们。', {
        x: 960, y: 804, size: 64, font: 'displayBold', color: '#fff8ec', align: 'center', leading: 1.28,
      });

      ov.add(tLeftTag, tLeftSub, tRightTag, tRightSub, tHint, tMain0, tSub0, tMain1, tSub1, tMain2);

      // Interactive divider state
      let splitX = 0.5;
      let targetSplit = 0.5;
      let dragging = false;
      let dragVis = 0;
      let userDragged = false;
      let lastTickBucket = 10;

      const xToNorm = (x) => clamp((x - view.x0) / Math.max(1, view.w), 0.06, 0.94);

      return {
        enter() {
          splitX = 0.5;
          targetSplit = 0.5;
          dragging = false;
          dragVis = 0;
          userDragged = false;
          lastTickBucket = 10;
        },
        pointer(type, x, y, s) {
          const divVirtX = lerp(view.x0, view.x1, splitX);
          if (type === 'down') {
            // Generous grab corridor around the vertical divider (never accidentally advances slide!)
            const dist = Math.abs(x - divVirtX);
            if (dist < 280 || (Math.abs(y - 540) < 180 && dist < 380)) {
              dragging = true;
              userDragged = true;
              targetSplit = xToNorm(x);
              splitX = lerp(splitX, targetSplit, 0.65);
              ctx.sfx('click', { gain: 0.45, pitch: 1.15 });
              return true;
            }
            return false;
          }
          if (type === 'move') {
            if (dragging) {
              targetSplit = xToNorm(x);
              splitX = lerp(splitX, targetSplit, 0.82);
              const bucket = Math.round(targetSplit * 20);
              if (bucket !== lastTickBucket) {
                lastTickBucket = bucket;
                ctx.sfx('tick', { gain: 0.18, pitch: 0.85 + targetSplit * 0.5 });
              }
              return true;
            }
            return false;
          }
          if (type === 'up' || type === 'cancel') {
            if (dragging) {
              dragging = false;
              ctx.sfx('snap', { gain: 0.3, pitch: 1.1 });
              return true;
            }
            return false;
          }
          return false;
        },
        update(s) {
          // Gentle autonomous breathing sway before the user drags
          const autoTarget = userDragged ? targetSplit : 0.5 + Math.sin(s.t * 0.72) * 0.055;
          splitX = lerp(splitX, autoTarget, damp(dragging ? 22 : 7, s.dt));
          dragVis = lerp(dragVis, dragging ? 1 : 0, damp(12, s.dt));

          // Convert virtual divider X into exact render-target UV.x (0..1)
          const divVirtX = lerp(view.x0, view.x1, splitX);
          const uSplitUv = clamp((divVirtX - view.x0) / Math.max(1, view.w), 0.05, 0.95);

          worldPass.u.uTime.value = s.t;
          worldPass.u.uSplit.value = uSplitUv;
          worldPass.u.uDrag.value = dragVis;
          worldPass.u.uPulse.value = userDragged ? 0 : 0.5 + 0.5 * Math.sin(s.t * 3.0);
          worldPass.u.uMouse.value.set(s.mouse.x, s.mouse.y);
          worldPass.u.uBeat1.value = s.p[1];
          worldPass.u.uBeat2.value = s.p[2];

          // Audio shifts smoothly with which future dominates the viewport!
          setParam(ctx, 'wind', lerp(0.75, 0.18, splitX));
          setParam(ctx, 'water', lerp(0.18, 0.65, splitX));
          setParam(ctx, 'tension', lerp(0.55, 0.12, splitX));

          // Orbit labels fade cleanly if divider is pushed to the edge
          const qExit = smoothstep(0.0, 0.4, s.exit);
          const leftFade = smoothstep(0.14, 0.30, splitX) * s.k(0, 0.0, 0.9, ease.lin);
          const rightFade = smoothstep(0.86, 0.70, splitX) * s.k(0, 0.0, 0.9, ease.lin);

          tLeftTag.x = view.x0 + 82;
          tLeftSub.x = view.x0 + 82;
          tRightTag.x = view.x1 - 82;
          tRightSub.x = view.x1 - 82;

          tLeftTag.show(leftFade, { style: 'fade', q: qExit });
          tLeftSub.show(leftFade, { style: 'fade', q: qExit });
          tRightTag.show(rightFade, { style: 'fade', q: qExit });
          tRightSub.show(rightFade, { style: 'fade', q: qExit });

          // Interactive drag invitation follows divider on Beat 0 until dragged
          tHint.x = clamp(divVirtX, view.x0 + 220, view.x1 - 220);
          const hintA = userDragged ? 0 : s.k(0, 0.6, 1.6, ease.lin) * (1 - s.k(1, 0.0, 0.8, ease.lin));
          tHint.show(hintA, { style: 'fade', q: qExit });

          // Beat copy
          const q0 = s.k(1, 0.0, 0.7, ease.lin);
          tMain0.show(s.k(0, 0.3, 1.9, ease.lin), { style: 'rise', by: 'word', stagger: 0.35, q: q0 });
          tSub0.show(s.k(0, 1.2, 2.5, ease.lin), { style: 'blur', q: q0 });

          const q1 = s.k(2, 0.0, 0.7, ease.lin);
          tMain1.show(s.k(1, 0.5, 2.0, ease.lin), { style: 'rise', by: 'word', stagger: 0.35, q: q1 });
          tSub1.show(s.k(1, 1.4, 3.0, ease.lin), { style: 'blur', q: q1 });

          tMain2.show(s.k(2, 0.6, 2.6, ease.lin), { style: 'rise', by: 'line', stagger: 0.45, q: qExit });
        },
        render(target, s) {
          worldPass.render(rt, true);
          gfx.post(rt, target, {
            bloom: 0.24,
            threshold: 0.86,
            exposure: 1.04,
            contrast: 1.06,
            saturation: 1.08,
            vignette: 0.28,
            grain: 0.022,
            time: s.t,
          });
          ov.render(target);
        },
      };
    },
  };

  // ============================================================================
  // SCENE 9: zoom — 《你在此处》
  // ============================================================================
  const sceneZoom = {
    id: 'zoom',
    title: '你在此处',
    enterWith: 'portal-in',
    hud: { color: '#cbd9ee', font: 'monoMed', alpha: 0.88 },
    beats: [
      { dur: 7.0, delay: 0.5, hold: 3.0, page: '此刻' },
      { dur: 6.0, hold: 4.5, page: '0.002 px' },
    ],
    notes: [
      '整场演讲走过的每一个地质纪元，都在同一条时间曲线上。现在，我们沿着它一路退回此刻的地面——这就是今天。',
      '从谷底抬头仰望，脚下永远看似平缓。所有改写历史的拐点，身处其中时，都是静悄悄的。',
    ],
    create(ctx) {
      const M = LHP.math;
      const { THREE, gfx, view } = ctx;
      const { clamp, lerp, smoothstep, ease, rng } = M;

      const rt = gfx.target({ samples: 4, depth: true });
      const ov = ctx.overlay();
      const scene3D = new THREE.Scene();
      const cam = new THREE.PerspectiveCamera(40, gfx.aspect, 0.2, 1600);

      // Exponential deep-time cliff curve parameterized by arc-like parameter u:
      // u <= 0: calm nearly flat floor of "today"
      // u > 0: smooth exponential sweep upward into a soaring vertical cliff!
      const PLATE_W = 16.0;
      const PLATE_H = 9.0;
      const STEP_U = 11.4;
      const SCENE_IDS = ['scale', 'breath', 'five', 'window', 'coal', 'flicker', 'split'];

      // Build dense arc-length table for smooth uniform plate spacing along the curve
      const RAW_MIN = -120;
      const RAW_MAX = 460;
      const RAW_N = 900;
      const rawT = new Float32Array(RAW_N + 1);
      const rawX = new Float32Array(RAW_N + 1);
      const rawY = new Float32Array(RAW_N + 1);
      const rawS = new Float32Array(RAW_N + 1);

      function rawPos(u) {
        // Flat floor for u <= 0, smooth vertical rise as u grows
        const x = u <= 0 ? u : 34.0 * Math.atan(u / 34.0) + Math.min(u, 20.0) * 0.15;
        const y = u <= 0 ? 0.0 : 0.00018 * u * u * u / (1.0 + 0.00018 * u * u) + Math.max(0, u - 14.0) * 0.92;
        return [x, y];
      }

      let accLen = 0;
      let zeroArc = 0;
      for (let i = 0; i <= RAW_N; i++) {
        const u = lerp(RAW_MIN, RAW_MAX, i / RAW_N);
        const [x, y] = rawPos(u);
        rawT[i] = u;
        rawX[i] = x;
        rawY[i] = y;
        if (i > 0) {
          accLen += Math.hypot(x - rawX[i - 1], y - rawY[i - 1]);
        }
        rawS[i] = accLen;
        if (i > 0 && rawT[i - 1] <= 0 && u >= 0) {
          const f = (0 - rawT[i - 1]) / (u - rawT[i - 1]);
          zeroArc = lerp(rawS[i - 1], rawS[i], f);
        }
      }
      // Shift arc length so s = 0 sits right at the bend foot
      for (let i = 0; i <= RAW_N; i++) rawS[i] -= zeroArc;

      function sampleCurve(sVal) {
        const sClamped = clamp(sVal, rawS[0], rawS[RAW_N]);
        let lo = 0, hi = RAW_N;
        while (lo + 1 < hi) {
          const mid = (lo + hi) >> 1;
          if (rawS[mid] <= sClamped) lo = mid; else hi = mid;
        }
        const span = Math.max(1e-5, rawS[hi] - rawS[lo]);
        const f = (sClamped - rawS[lo]) / span;
        const x = lerp(rawX[lo], rawX[hi], f);
        const y = lerp(rawY[lo], rawY[hi], f);
        const dx = rawX[hi] - rawX[lo];
        const dy = rawY[hi] - rawY[lo];
        const len = Math.max(1e-5, Math.hypot(dx, dy));
        return { x, y, tx: dx / len, ty: dy / len };
      }

      // Plate center arc positions: index -1 is "Today" on the quiet flat floor;
      // indices 0..6 ascend up the soaring cliff (scale -> split)
      const plateArc = (idx) => -6.0 + (idx + 1) * STEP_U;

      // Sky & reflective mineral-salt twilight floor pass
      const skyFn = `
        vec3 skyc(vec3 d) {
          float h = max(d.y, 0.0);
          vec3 c = mix(vec3(0.84, 0.62, 0.48), vec3(0.18, 0.30, 0.56), smoothstep(0.0, 0.32, h));
          c = mix(c, vec3(0.045, 0.085, 0.22), smoothstep(0.24, 0.92, h));
          float sun = max(dot(d, normalize(vec3(0.45, 0.24, -0.62))), 0.0);
          c += vec3(1.15, 0.78, 0.46) * (pow(sun, 6.0) * 0.25 + pow(sun, 48.0) * 0.45);
          return c;
        }
      `;

      const bgPass = gfx.pass(
        M.GLSL_NOISE +
          skyFn +
          `
        uniform mat4 uInv;
        uniform vec3 uCam;
        void main() {
          vec4 f = uInv * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
          vec3 d = normalize(f.xyz / max(abs(f.w), 1e-4) - uCam);
          vec3 c = skyc(d);

          if (d.y > 0.0) {
            vec2 cp = d.xz / (d.y + 0.14) * 1.0 + vec2(uTime * 0.008, 0.0);
            float n = fbm(cp * 1.3 + fbm(cp * 2.0));
            float cl = smoothstep(0.54, 0.86, n) * smoothstep(0.0, 0.22, d.y);
            c = mix(c, vec3(0.95, 0.86, 0.80), cl * 0.42);
          } else {
            float t = -(uCam.y + 1.1) / min(d.y, -0.001);
            vec3 p = uCam + d * t;
            float gn = fbm(p.xz * 0.032 + fbm(p.xz * 0.09));
            vec3 g = mix(vec3(0.11, 0.14, 0.21), vec3(0.18, 0.21, 0.28), gn);
            // Soft cast shadow under the towering cliff ribbon
            float zDist = max(abs(p.z) - 8.5, 0.0);
            float sh = 1.0 - 0.55 * exp(-zDist * 0.28) * smoothstep(-35.0, 35.0, p.x);
            g *= sh;
            // Subtle mirror reflection of sky
            float fr = pow(1.0 - abs(d.y), 4.5);
            vec3 rf = skyc(normalize(vec3(d.x, -d.y + 0.02 * (vnoise(p.xz * 0.45 + uTime * 0.15) - 0.5), d.z)));
            g = mix(g, rf, 0.18 + 0.52 * fr);
            c = mix(g, skyc(vec3(d.x, 0.02, d.z)), 1.0 - exp(-t * 0.0048));
          }
          o = vec4(c, 1.0);
        }
      `,
        { uInv: new THREE.Matrix4(), uCam: new THREE.Vector3() }
      );

      // Build curved ribbon / plate mesh along curve arc [s0, s1]
      // Guaranteed UV orientation: z = -W/2 -> u = 0 (screen-left), z = +W/2 -> u = 1 (screen-right),
      // s = s0 -> v = 0 (bottom), s = s1 -> v = 1 (top)
      function buildRibbonGeo(s0, s1, width, normalOff, segs) {
        const pos = [], norm = [], uvs = [], idx = [];
        for (let i = 0; i <= segs; i++) {
          const v = i / segs;
          const pt = sampleCurve(lerp(s0, s1, v));
          const nx = -pt.ty;
          const ny = pt.tx;
          // Left vertex (-width/2, u=0), Right vertex (+width/2, u=1)
          pos.push(pt.x + nx * normalOff, pt.y + ny * normalOff, -width * 0.5);
          norm.push(nx, ny, 0);
          uvs.push(0, v);

          pos.push(pt.x + nx * normalOff, pt.y + ny * normalOff, width * 0.5);
          norm.push(nx, ny, 0);
          uvs.push(1, v);

          if (i < segs) {
            const b = i * 2;
            idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
          }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geo.setIndex(idx);
        return geo;
      }

      const ribbonVert = `
        precision highp float;
        in vec3 position;
        in vec3 normal;
        in vec2 uv;
        uniform mat4 viewMatrix;
        uniform mat4 projectionMatrix;
        out vec3 vP;
        out vec3 vN;
        out vec2 vU;
        void main() {
          vP = position;
          vN = normal;
          vU = uv;
          gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
        }
      `;

      const plateFrag =
        `precision highp float;
        ` +
        M.GLSL_NOISE +
        M.GLSL_COLOR +
        skyFn +
        `
        in vec3 vP;
        in vec3 vN;
        in vec2 vU;
        uniform vec3 cameraPosition;
        uniform sampler2D tA;
        uniform float uPic;
        uniform float uTime;
        out vec4 o;

        void main() {
          vec3 n = normalize(vN);
          vec3 v = normalize(cameraPosition - vP);
          if (dot(n, v) < 0.0) n = -n;
          vec3 L = normalize(vec3(0.45, 0.35, -0.62));
          float diff = max(dot(n, L), 0.0);

          vec3 col;
          if (uPic > 0.5) {
            vec3 tex = toLin(clamp(texture(tA, vU).rgb, 0.0, 1.0));
            // Crisp luminous glass bezel frame around each epoch plate
            vec2 edge = min(vU, 1.0 - vU) * vec2(16.0, 9.0);
            float bd = min(edge.x, edge.y);
            float rim = 1.0 - smoothstep(0.06, 0.16, bd);
            col = tex * (0.86 + 0.24 * diff) + vec3(0.85, 0.92, 1.15) * rim * 0.45;
          } else {
            // Backbone dark mineral ribbon
            float fib = vnoise(vP * 0.8) * 0.5 + vnoise(vP * 3.5) * 0.5;
            vec3 alb = vec3(0.14, 0.17, 0.24) * (0.85 + 0.3 * fib);
            vec3 amb = mix(vec3(0.28, 0.30, 0.38), vec3(0.35, 0.44, 0.62), n.y * 0.5 + 0.5);
            col = alb * (diff * vec3(1.1, 0.88, 0.68) * 0.85 + amb * 0.72);
            // Subtle glowing edge tracks along the deep-time backbone
            float track = exp(-pow((abs(vU.x - 0.5) - 0.48) / 0.015, 2.0));
            col += vec3(0.75, 0.88, 1.15) * track * 0.35;
          }

          float dist = length(cameraPosition - vP);
          vec3 f = skyc(normalize(vP - cameraPosition));
          col = mix(col, f, (1.0 - exp(-dist * 0.0024)) * 0.88);
          col = mix(col, f, smoothstep(220.0, 440.0, vP.y));
          o = vec4(col, 1.0);
        }
      `;

      const makeMat = (tex, isPic) =>
        new THREE.RawShaderMaterial({
          glslVersion: THREE.GLSL3,
          side: THREE.DoubleSide,
          vertexShader: ribbonVert,
          fragmentShader: plateFrag,
          uniforms: {
            tA: { value: tex },
            uPic: { value: isPic ? 1 : 0 },
            uTime: { value: 0 },
          },
        });

      // Continuous backbone ribbon
      const backbone = new THREE.Mesh(buildRibbonGeo(-95, 380, PLATE_W + 2.2, 0.0, 600), makeMat(null, false));
      backbone.frustumCulled = false;
      scene3D.add(backbone);

      // Ghost outline frames for deep past (below today) and deep future (high above split)
      const ghostMat = new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
        vertexShader: ribbonVert,
        fragmentShader: `
          precision highp float;
          in vec3 vP;
          in vec2 vU;
          uniform vec3 cameraPosition;
          out vec4 o;
          void main() {
            vec2 p = min(vU, 1.0 - vU) * vec2(16.0, 9.0);
            float d = min(p.x, p.y);
            float w = max(fwidth(d), 0.035);
            float a = 1.0 - smoothstep(w * 0.5, w * 1.8, d);
            a *= 0.34 * exp(-length(cameraPosition - vP) * 0.0065);
            o = vec4(0.68, 0.82, 1.0, a);
          }
        `,
      });

      for (let i = -8; i <= -1; i++) {
        const cArc = plateArc(i);
        const m = new THREE.Mesh(buildRibbonGeo(cArc - PLATE_H * 0.5, cArc + PLATE_H * 0.5, PLATE_W, 0.08, 12), ghostMat);
        m.frustumCulled = false;
        scene3D.add(m);
      }
      for (let i = SCENE_IDS.length; i < SCENE_IDS.length + 14; i++) {
        const cArc = plateArc(i);
        const m = new THREE.Mesh(buildRibbonGeo(cArc - PLATE_H * 0.5, cArc + PLATE_H * 0.5, PLATE_W, 0.08, 12), ghostMat);
        m.frustumCulled = false;
        scene3D.add(m);
      }

      // 7 Hero Epoch Snapshot Plates
      const plates = SCENE_IDS.map((id, i) => {
        const cArc = plateArc(i);
        const fallback = makeFallbackThumb(THREE, id);
        const mesh = new THREE.Mesh(
          buildRibbonGeo(cArc - PLATE_H * 0.5, cArc + PLATE_H * 0.5, PLATE_W, 0.14, 24),
          makeMat(fallback, true)
        );
        mesh.frustumCulled = false;
        scene3D.add(mesh);
        return { id, mesh, fallback };
      });

      function refreshSnapshots() {
        for (const p of plates) {
          const snap = ctx.snapshots && ctx.snapshots[p.id];
          p.mesh.material.uniforms.tA.value = snap && snap.texture ? snap.texture : p.fallback;
        }
      }

      // 220 Floating luminous memory shards tumbling around the cliff
      const SHARD_N = 220;
      const sRand = rng(904);
      const shardGeo = new THREE.PlaneGeometry(1.4, 0.8);
      const shardMat = new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3,
        side: THREE.DoubleSide,
        vertexShader: `
          precision highp float;
          in vec3 position;
          in mat4 instanceMatrix;
          uniform mat4 viewMatrix;
          uniform mat4 projectionMatrix;
          out vec3 vN;
          out vec3 vP;
          void main() {
            vec4 wp = instanceMatrix * vec4(position, 1.0);
            vN = normalize(mat3(instanceMatrix) * vec3(0.0, 0.0, 1.0));
            vP = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: `
          precision highp float;
          in vec3 vN;
          in vec3 vP;
          uniform vec3 cameraPosition;
          out vec4 o;
          void main() {
            float d = abs(dot(normalize(vN), normalize(vec3(0.45, 0.35, -0.62))));
            float fog = 1.0 - exp(-length(cameraPosition - vP) * 0.0055);
            vec3 c = mix(vec3(0.76, 0.82, 0.92) * (0.45 + 0.65 * d * vec3(1.1, 0.92, 0.76)), vec3(0.42, 0.48, 0.62), fog);
            o = vec4(c, 1.0);
          }
        `,
      });
      const shards = new THREE.InstancedMesh(shardGeo, shardMat, SHARD_N);
      shards.frustumCulled = false;
      scene3D.add(shards);
      const shardData = Array.from({ length: SHARD_N }, () => [sRand(), sRand(), sRand(), sRand(), sRand()]);

      // Temp math objects
      const m4 = new THREE.Matrix4();
      const qTmp = new THREE.Quaternion();
      const eTmp = new THREE.Euler();
      const vPos = new THREE.Vector3();
      const vTarget = new THREE.Vector3();
      const vUp = new THREE.Vector3();
      const vScale = new THREE.Vector3();
      const kMat = new THREE.Matrix4();

      const pA = new THREE.Vector3();
      const qA = new THREE.Quaternion();
      const pB = new THREE.Vector3();
      const qB = new THREE.Quaternion();
      const pC = new THREE.Vector3();
      const qC = new THREE.Quaternion();

      function poseOnCurve(arc, dist, outP, outQ) {
        const pt = sampleCurve(arc);
        const nx = -pt.ty;
        const ny = pt.tx;
        outP.set(pt.x + nx * dist, pt.y + ny * dist, 0);
        vTarget.set(pt.x, pt.y, 0);
        vUp.set(pt.tx, pt.ty, 0);
        kMat.lookAt(outP, vTarget, vUp);
        outQ.setFromRotationMatrix(kMat);
      }

      // Compute 4 world corners of plate idx for SelectBox framing & portal interface
      function plateCorners(idx) {
        const cArc = plateArc(idx);
        const topPt = sampleCurve(cArc + PLATE_H * 0.5);
        const botPt = sampleCurve(cArc - PLATE_H * 0.5);
        const off = 0.14;
        return [
          new THREE.Vector3(topPt.x - topPt.ty * off, topPt.y + topPt.tx * off, -PLATE_W * 0.5),
          new THREE.Vector3(topPt.x - topPt.ty * off, topPt.y + topPt.tx * off, PLATE_W * 0.5),
          new THREE.Vector3(botPt.x - botPt.ty * off, botPt.y + botPt.tx * off, PLATE_W * 0.5),
          new THREE.Vector3(botPt.x - botPt.ty * off, botPt.y + botPt.tx * off, -PLATE_W * 0.5),
        ];
      }
      const todayCorners = plateCorners(-1);
      const topCorners = plateCorners(SCENE_IDS.length - 1);

      function projectCorners(corners) {
        return corners.map((c) => {
          vPos.copy(c).project(cam);
          return [vPos.x, vPos.y];
        });
      }

      function rectOfWorld(corners) {
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (const c of corners) {
          vPos.copy(c).project(cam);
          const sx = view.x0 + (vPos.x * 0.5 + 0.5) * view.w;
          const sy = view.y0 + (-vPos.y * 0.5 + 0.5) * view.h;
          x0 = Math.min(x0, sx);
          y0 = Math.min(y0, sy);
          x1 = Math.max(x1, sx);
          y1 = Math.max(y1, sy);
        }
        return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      }

      // 2D Editorial Typography Overlay
      const tHere = ctx.text('你在此处。', {
        x: 120, y: 170, size: 102, font: 'displayBold', color: '#f7f9fc',
      });
      const tDate = ctx.text(' ', {
        x: 126, y: 300, size: 34, font: 'monoMed', color: '#b7d2f2',
      });
      const tCliff = ctx.text('站在谷底仰望，\n脚下永远看似平缓。', {
        x: 120, y: 170, size: 80, font: 'displayBold', color: '#ffffff', leading: 1.24,
      });
      const tCliffSub = ctx.text('所有的拐点，身处其中时都静悄悄的。', {
        x: 124, y: 398, size: 36, font: 'textMed', color: '#d4e2f5',
      });
      const sel = new ctx.SelectBox({ handle: 9, color: '#4d88ff' });
      ov.add(tHere, tDate, tCliff, tCliffSub, sel);

      const fullNdc = [[-1, 1], [1, 1], [1, -1], [-1, -1]];
      let prevSweep = 0;

      return {
        init() {
          refreshSnapshots();
        },
        enter() {
          refreshSnapshots();
          const now = new Date();
          tDate.set(`${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`);
          prevSweep = 0;
        },
        portal: {
          in(s) {
            const j = ease.io3(smoothstep(0, 0.35, s.enter));
            const pts = projectCorners(topCorners);
            return {
              c: pts.map((pt, i) => [lerp(fullNdc[i][0], pt[0], j), lerp(fullNdc[i][1], pt[1], j)]),
              a: 1 - smoothstep(0.45, 0.85, s.enter),
              shade: 1,
            };
          },
          out(s) {
            const j = ease.io3(smoothstep(0.3, 1.0, s.exit));
            const pts = projectCorners(todayCorners);
            return {
              c: pts.map((pt, i) => [lerp(pt[0], fullNdc[i][0], j), lerp(pt[1], fullNdc[i][1], j)]),
              a: smoothstep(0.0, 0.25, s.exit),
              shade: 1,
            };
          },
        },
        update(s) {
          cam.aspect = gfx.aspect;
          const tanHalf = Math.tan((40 * Math.PI) / 360);
          const fitDist = Math.min(PLATE_H / 2 / tanHalf, PLATE_W / 2 / (tanHalf * Math.max(0.5, gfx.aspect)));

          const ent = ease.out3(s.enter);
          const t0 = s.at(0);
          const sweep = ease.io4(smoothstep(0.4, 5.4, t0));
          const arcCur = lerp(plateArc(SCENE_IDS.length - 1), plateArc(0) - 2.0, sweep);
          const distCur = lerp(lerp(fitDist, 22.0, ent), 18.0, smoothstep(0, 0.5, sweep)) + 12.0 * Math.sin(Math.PI * sweep) * 0.55;
          poseOnCurve(arcCur, Math.max(fitDist * (1 - ent), distCur), pA, qA);

          // Settle gently onto the quiet floor looking across "today"
          const settle = ease.io4(smoothstep(4.6, 6.9, t0));
          const todayPt = sampleCurve(plateArc(-1));
          pB.set(todayPt.x - 24.0, 9.2, 8.5);
          vTarget.set(todayPt.x + 15.0, 4.2, -7.0);
          vUp.set(0, 1, 0);
          kMat.lookAt(pB, vTarget, vUp);
          qB.setFromRotationMatrix(kMat);

          cam.position.lerpVectors(pA, pB, settle);
          cam.quaternion.slerpQuaternions(qA, qB, settle);

          // Beat 1: Tilt slowly upward from quiet floor toward the towering glowing cliff!
          const tiltUp = ease.io4(s.k(1, 0.2, 4.8, ease.lin));
          pC.set(todayPt.x - 14.5 + Math.sin(s.t * 0.14) * 0.7, 4.8, 4.8);
          vTarget.set(todayPt.x + 42.0, 52.0 + Math.sin(s.t * 0.18) * 1.5, -14.0);
          vUp.set(0, 1, 0);
          kMat.lookAt(pC, vTarget, vUp);
          qC.setFromRotationMatrix(kMat);

          cam.position.lerp(pC, tiltUp);
          cam.quaternion.slerp(qC, tiltUp);

          // Exit alignment into "today" plate for portal-out into Scene 10!
          const ex = ease.io3(s.exit);
          if (ex > 0) {
            poseOnCurve(plateArc(-1), fitDist, pA, qA);
            cam.position.lerp(pA, ex);
            cam.quaternion.slerp(qA, ex);
          }

          // Smooth mouse parallax
          const parMask = ent * (1 - ex);
          cam.rotateY(-s.mouse.x * 0.036 * parMask + Math.sin(s.t * 0.21) * 0.005 * parMask);
          cam.rotateX(s.mouse.y * 0.024 * parMask + Math.sin(s.t * 0.26) * 0.004 * parMask);
          cam.fov = lerp(40, 50, tiltUp * (1 - ex));
          cam.updateProjectionMatrix();
          cam.updateMatrixWorld();

          // Animate tumbling shards
          for (let i = 0; i < SHARD_N; i++) {
            const [r0, r1, r2, r3, r4] = shardData[i];
            const yy = (((r1 * 120 - s.t * (0.9 + r3)) % 120) + 120) % 120;
            let zz = (r2 - 0.5) * 125 + Math.cos(s.t * 0.3 + r0 * 9) * 2.0;
            if (Math.abs(zz) < 10) zz += 14 * Math.sign(zz || 1);
            vPos.set(lerp(-65, 65, r0) + Math.sin(s.t * 0.35 + r4 * 8) * 2.0, yy, zz);
            eTmp.set(s.t * (0.35 + r3) + r0 * 6, s.t * 0.45 * (r4 - 0.5) + r1 * 6, r4 * 6);
            qTmp.setFromEuler(eTmp);
            vScale.setScalar(0.55 + r3 * 0.5);
            m4.compose(vPos, qTmp, vScale);
            shards.setMatrixAt(i, m4);
          }
          shards.instanceMatrix.needsUpdate = true;

          // Update sky pass
          bgPass.u.uTime.value = s.t;
          bgPass.u.uCam.value.copy(cam.position);
          bgPass.u.uInv.value
            .copy(cam.projectionMatrix)
            .multiply(kMat.copy(cam.matrixWorld).invert())
            .invert();

          // Audio swoosh proportional to sweep velocity
          const vel = Math.abs(sweep - prevSweep) / Math.max(0.001, s.dt);
          prevSweep = sweep;
          setParam(ctx, 'speed', clamp(vel * 2.2, 0, 1));
          setParam(ctx, 'wind', 0.28 + tiltUp * 0.25);

          // Typography & SelectBox around "today" frame on the floor
          const q0 = s.k(1, 0.0, 0.85, ease.lin);
          tHere.show(s.k(0, 5.4, 6.7, ease.lin), { style: 'rise', by: 'word', stagger: 0.4, q: q0 });
          tDate.show(s.k(0, 5.9, 6.9, ease.lin), { style: 'blur', q: q0 });

          const qExit = smoothstep(0.0, 0.35, s.exit);
          tCliff.show(s.k(1, 2.0, 3.8, ease.lin), { style: 'rise', by: 'line', stagger: 0.45, q: qExit });
          tCliffSub.show(s.k(1, 2.7, 3.9, ease.lin), { style: 'blur', q: qExit });

          const selVis = s.k(0, 5.7, 6.5, ease.lin) * (1 - s.k(1, 0.0, 0.55, ease.lin));
          if (selVis > 0.005) {
            const r = rectOfWorld(todayCorners);
            sel.set(r.x - 8, r.y - 8, r.w + 16, r.h + 16).appear(selVis);
          } else {
            sel.alpha(0);
          }
        },
        render(target, s) {
          bgPass.render(rt, true);
          gfx.draw(scene3D, cam, rt, { clear: false });
          gfx.post(rt, target, {
            bloom: 0.22,
            threshold: 0.88,
            exposure: 1.05,
            contrast: 1.07,
            saturation: 1.1,
            vignette: 0.26,
            grain: 0.02,
            time: s.t,
          });
          ov.render(target);
        },
      };
    },
  };

  // ============================================================================
  // SCENE 10: ending — 《感谢聆听》 (Chilling Callback to Scene 1 + 1° Tilt & Rift)
  // ============================================================================
  const sceneEnding = {
    id: 'ending',
    title: '感谢聆听',
    enterWith: 'portal-out',
    hud: { color: '#7f7f7f', font: 'arial', alpha: 0.9 },
    beats: [
      { dur: 0.6, hold: 3.8, page: '10 / 10' },
      { dur: 4.5, hold: 2.5, page: '10 / 10' },
      { dur: 11.5, hold: 8.0, page: '0.002 px' },
    ],
    notes: [
      '感谢聆听。各位有什么问题吗？\n（回到开场那套平淡无奇的模板，让观众以为演讲结束了。）',
      '（按下一页，然后注视屏幕，不要看台下。）',
      '让这句话留在屏幕上。整场演讲归根结底，落在这一个问题上：我们站在 46 亿年最珍贵的温暖窗口里，手握足以改写地质纪元的力量——我们究竟想把下一个像素，留给什么？\n（几秒后，这页幻灯片会微微错位并倾斜一度。）',
    ],
    create(ctx) {
      const M = LHP.math;
      const { THREE, gfx, view } = ctx;
      const { clamp, lerp, smoothstep, ease } = M;

      // Offscreen render target for the white corporate PPT slide so Beat 2 can tilt it 1° over obsidian void!
      const slideRT = gfx.target({});
      const slideOv = ctx.overlay();
      const topOv = ctx.overlay();

      // White corporate PPT slide template (mirrors Scene 1 `boring`)
      const bgWhite = new ctx.Rect2D({ color: '#ffffff', order: -10 });
      const topRule = new ctx.Rect2D({ color: '#d0d5dd', order: 1 });
      const botTrack = new ctx.Rect2D({ color: '#e5e7eb', order: 1 });
      const botBar = new ctx.Rect2D({ color: '#8a94a6', order: 2 });

      // Main centered bland corporate text (becomes typing target in Beats 1 & 2)
      const tMain = ctx.text('感谢聆听 · Q&A', {
        x: 960, y: 520, size: 84, font: 'arial', color: '#14161a', align: 'center', valign: 'middle',
      });
      const cursor = new ctx.Rect2D({ color: '#14161a', order: 6 });

      slideOv.add(bgWhite, topRule, botTrack, botBar, tMain, cursor);

      // Cobalt-blue SelectBox rendered on top overlay so it tilts in lockstep with the slide
      const sel = new ctx.SelectBox({ color: '#2b5cff', handle: 9, line: 2.4 });
      topOv.add(sel);

      // Final tilt + right-edge razor-thin glowing amber geological seam composite pass!
      const tiltPass = gfx.pass(
        M.GLSL_NOISE +
          `
        uniform sampler2D tSlide;
        uniform float uAng;
        uniform float uScale;
        uniform float uRift;
        uniform vec3 uVoid;

        void main() {
          vec2 as = vec2(uRes.x / max(uRes.y, 1.0), 1.0);
          vec2 p = (vUv - 0.5) * as;
          float c = cos(uAng);
          float sn = sin(uAng);
          vec2 pr = mat2(c, -sn, sn, c) * p / max(uScale, 0.1);
          vec2 u = pr / as + 0.5;

          // Crisp anti-aliased edge of the tilted white PPT canvas
          vec2 edgePx = min(u, 1.0 - u) * uRes;
          float inside = clamp(min(edgePx.x, edgePx.y) + 0.5, 0.0, 1.0);

          // Soft cast shadow on deep obsidian void behind the tilted slide
          vec2 qs = u - vec2(0.004, -0.007);
          vec2 dds = min(qs, 1.0 - qs);
          float sh = smoothstep(-0.025, 0.012, min(dds.x * as.x, dds.y));
          vec3 bg = uVoid * (1.0 - 0.65 * sh);

          // Subtle geological micro-texture in the dark obsidian void
          float rock = vnoise(vUv * vec2(18.0, 10.0)) * 0.012;
          bg += vec3(rock * 1.1, rock * 0.9, rock * 0.8);

          vec3 slideCol = texture(tSlide, clamp(u, 0.0, 1.0)).rgb;

          // Razor-thin glowing amber geological seam splitting along the RIGHT edge of the white slide!
          if (uRift > 0.001) {
            // Microscopic jagged mineral fracture line right at u.x ≈ 0.9965 (1–2px bright amber rift)
            float jag = (fbm(vec2(u.y * 28.0, 2.7)) - 0.5) * 0.0038 * uRift;
            float seamX = 1.0 - 0.0022 * uRift + jag;
            float distPx = abs(u.x - seamX) * uRes.x;
            float inY = smoothstep(-0.01, 0.02, u.y) * smoothstep(1.01, 0.98, u.y);

            // Molten amber-gold core (~1.8px razor line) + warm subsurface glow bleeding into right edge & void
            float pulse = 0.88 + 0.12 * sin(uTime * 2.1 + u.y * 6.0);
            float core = exp(-pow(distPx / (1.35 * uRift + 0.25), 2.0)) * inY;
            float bleed = exp(-distPx / (18.0 * uRift + 1.0)) * inY;
            float deepGlow = exp(-distPx / (64.0 * uRift + 1.0)) * inY;

            // Open the hairline rift inside the white slide right edge
            vec3 riftCore = vec3(1.85, 1.12, 0.34) * core * 1.45 * pulse;
            vec3 riftHalo = vec3(1.15, 0.48, 0.10) * bleed * 0.62 * pulse;
            vec3 voidGlow = vec3(0.75, 0.30, 0.06) * deepGlow * 0.32 * pulse;

            // Blend molten ember into both the void behind the right edge and the edge of the slide
            bg += voidGlow + riftHalo * 0.75;
            slideCol = mix(slideCol, vec3(0.10, 0.06, 0.04), smoothstep(2.4, 0.6, distPx) * uRift * 0.85);
            slideCol += riftCore + riftHalo * 0.55;
          }

          vec3 finalCol = mix(bg, slideCol, inside);

          // Add subtle luminous rim spill right across the right edge boundary
          if (uRift > 0.001) {
            float edgeDistPx = abs(u.x - 1.0) * uRes.x;
            float inY = smoothstep(-0.01, 0.01, u.y) * smoothstep(1.01, 0.99, u.y);
            finalCol += vec3(1.35, 0.68, 0.18) * exp(-edgeDistPx / 3.2) * uRift * inY * 0.65;
          }

          o = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
        }
      `,
        {
          tSlide: null,
          uAng: 0,
          uScale: 1,
          uRift: 0,
          uVoid: new THREE.Vector3(0.032, 0.035, 0.045),
        }
      );

      const STR0 = '感谢聆听 · Q&A';
      const STR1 = '这页幻灯片，才放了十秒。';
      const STR2 = '而人类文明，在地球的 24 小时里还没过完 0.1 秒。';
      const STR3 = '你想把下一格像素，留给什么？';

      const once = makeOnce();
      let curStr = STR0;
      let curStyleKey = 's0';
      let tiltAmt = 0;
      let riftAmt = 0;
      let tiltAng = 0;
      let tiltScale = 1;

      function applyText(str, styleKey) {
        const safeStr = str && str.length > 0 ? str : ' ';
        if (styleKey !== curStyleKey) {
          curStyleKey = styleKey;
          if (styleKey === 's0') {
            tMain.style({ size: 84, font: 'arial', color: '#14161a' });
          } else if (styleKey === 's1') {
            tMain.style({ size: 70, font: 'arial', color: '#111318' });
          } else if (styleKey === 's2') {
            tMain.style({ size: 52, font: 'arial', color: '#111318' });
          } else {
            tMain.style({ size: 88, font: 'displayBold', color: '#0a0c10' });
          }
        }
        if (safeStr !== curStr) {
          curStr = safeStr;
          tMain.set(safeStr);
          return true;
        }
        return false;
      }

      return {
        enter() {
          once.reset();
          curStr = '';
          curStyleKey = '';
          applyText(STR0, 's0');
          tiltAmt = 0;
          riftAmt = 0;
          tiltAng = 0;
          tiltScale = 1;
        },
        update(s) {
          // Layout corporate white slide chrome across responsive view
          bgWhite.set(view.x0, view.y0, view.w, view.h).alpha(1);
          topRule.set(view.x0 + 72, view.y0 + 76, view.w - 144, 2).alpha(0.95);
          botTrack.set(view.x0, view.y1 - 14, view.w, 14).alpha(1);
          botBar.set(view.x0, view.y1 - 14, view.w, 14).alpha(0.55);

          const t1 = s.at(1);
          const t2 = s.at(2);

          let nextStr = STR0;
          let nextStyle = 's0';
          let showCursor = false;
          let isDeleting = false;

          if (s.p[2] > 0) {
            if (t2 < 0.65) {
              // Delete STR1
              const keep = Math.max(0, STR1.length - Math.floor((t2 / 0.6) * STR1.length));
              nextStr = STR1.slice(0, keep);
              nextStyle = 's1';
              showCursor = true;
              isDeleting = true;
            } else if (t2 < 4.2) {
              // Type STR2 ("而人类文明，在地球的 24 小时里还没过完 0.1 秒。") & pause
              const n = Math.min(STR2.length, Math.max(0, Math.floor((t2 - 0.72) * 11.2)));
              nextStr = STR2.slice(0, n);
              nextStyle = 's2';
              showCursor = true;
            } else if (t2 < 4.9) {
              // Delete STR2 rapidly
              const keep = Math.max(0, STR2.length - Math.floor(((t2 - 4.2) / 0.62) * STR2.length));
              nextStr = STR2.slice(0, keep);
              nextStyle = 's2';
              showCursor = true;
              isDeleting = true;
            } else {
              // Type final haunting question STR3 ("你想把下一格像素，留给什么？")
              const n = Math.min(STR3.length, Math.max(0, Math.floor((t2 - 5.0) * 9.0)));
              nextStr = STR3.slice(0, n);
              nextStyle = 's3';
              showCursor = t2 < 7.4;
            }
          } else if (s.p[1] > 0) {
            if (t1 < 1.0) {
              nextStr = STR0;
              nextStyle = 's0';
            } else if (t1 < 1.75) {
              const keep = Math.max(0, STR0.length - Math.floor(((t1 - 1.0) / 0.68) * STR0.length));
              nextStr = STR0.slice(0, keep);
              nextStyle = 's0';
              showCursor = true;
              isDeleting = true;
            } else {
              const n = Math.min(STR1.length, Math.max(0, Math.floor((t1 - 1.88) * 8.5)));
              nextStr = STR1.slice(0, n);
              nextStyle = 's1';
              showCursor = true;
            }
          }

          const changed = applyText(nextStr, nextStyle);
          if (changed && s.dt > 0 && s.dir > 0) {
            if (isDeleting) {
              ctx.sfx('delete', { gain: 0.42, pitch: 0.95 + (nextStr.length % 3) * 0.05 });
            } else {
              ctx.sfx('type', { gain: 0.78, pitch: nextStyle === 's3' ? 0.86 : 1.0 });
            }
          }
          tMain.animate();

          // Blinking vertical cursor beside text
          const txtW = nextStr.trim().length > 0 ? tMain.width : 0;
          const curH = nextStyle === 's2' ? 54 : nextStyle === 's3' ? 86 : 74;
          const blink = Math.sin(s.t * 6.4) > -0.25 ? 1 : 0;
          cursor.set(960 + txtW * 0.5 + 8, 520 - curH * 0.5, 3.5, curH).alpha(showCursor ? blink : 0);

          // SelectBox choreography:
          // Beat 1: quietly wraps the text
          // Beat 2 (7.0s -> 8.35s): expands smoothly to frame the ENTIRE viewport!
          once.fire('sel1', s.p[1] > 0 && t1 > 0.45, () => ctx.sfx('select', { gain: 0.75 }), s);
          const selAppear = smoothstep(0.42, 0.85, t1) || (s.p[2] > 0 ? 1 : 0);
          const expand = ease.io4(smoothstep(7.0, 8.35, t2));
          once.fire('exp1', expand > 0.05, () => ctx.sfx('select', { gain: 0.7, pitch: 0.55 }), s);
          once.fire('expSub', expand > 0.88, () => ctx.sfx('sub', { gain: 0.6 }), s);

          const boxW = Math.max(300, txtW) + 72;
          const boxH = curH + 44;
          const rx0 = 960 - boxW * 0.5;
          const ry0 = 520 - boxH * 0.5;
          const pad = 26;
          const vx0 = view.x0 + pad;
          const vy0 = view.y0 + pad;
          const vw = view.w - pad * 2;
          const vh = view.h - pad * 2;

          const breath = expand * Math.sin(s.t * 0.9) * 3.0;
          const sx = lerp(rx0, vx0, expand) - breath;
          const sy = lerp(ry0, vy0, expand) - breath;
          const sw = lerp(boxW, vw, expand) + breath * 2;
          const sh = lerp(boxH, vh, expand) + breath * 2;

          // Final chilling gesture (8.55s -> 9.85s, holding cleanly through 11.5s):
          // Razor-thin glowing amber geological seam splits open on the right edge,
          // and the ENTIRE white slide tilts by exactly 1 degree (-Math.PI / 180) over obsidian void!
          riftAmt = ease.io3(smoothstep(8.55, 9.55, t2));
          tiltAmt = ease.io4(smoothstep(8.7, 9.85, t2));
          once.fire('riftCreak', riftAmt > 0.04, () => ctx.sfx('creak', { gain: 0.65, pitch: 0.85 }), s);

          tiltAng = -tiltAmt * (Math.PI / 180) * (1.0 + 0.025 * Math.sin(s.t * 0.65));
          tiltScale = 1.0 - 0.032 * tiltAmt;

          // Keep SelectBox locked seamlessly to the tilted white slide!
          const sc = tiltScale;
          const fx = 960 + (sx - 960) * sc;
          const fy = 540 + (sy - 540) * sc;
          const fw = sw * sc;
          const fh = sh * sc;

          sel
            .set(fx, fy, fw, fh, -tiltAng)
            .alpha(clamp(selAppear * 2.5, 0, 1))
            .size(Math.max(0.05, ease.outBack(clamp(selAppear, 0, 1), 2.0)) * (1 + 0.45 * expand))
            .knob(expand < 0.03);

          // Silence ambient beds cleanly on the white corporate slide; tiny deep rumble when rifting
          setParam(ctx, 'wind', 0);
          setParam(ctx, 'water', 0);
          setParam(ctx, 'hum', riftAmt * 0.18);
          setParam(ctx, 'deep', tiltAmt * 0.35);
          setParam(ctx, 'tension', riftAmt * 0.25);
        },
        render(target, s) {
          if (riftAmt <= 0.001 && tiltAmt <= 0.001) {
            slideOv.render(target);
            topOv.render(target);
            return;
          }
          slideOv.render(slideRT);
          tiltPass.u.uTime.value = s.t;
          tiltPass.u.tSlide.value = slideRT.texture;
          tiltPass.u.uAng.value = tiltAng;
          tiltPass.u.uScale.value = tiltScale;
          tiltPass.u.uRift.value = riftAmt;
          tiltPass.render(target, true);
          topOv.render(target);
        },
      };
    },
  };

  LHP.scenesLate = [sceneCoal, sceneFlicker, sceneSplit, sceneZoom, sceneEnding];
})();
