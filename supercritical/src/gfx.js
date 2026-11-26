(() => {
  'use strict';
  const SC = (window.__SC = window.__SC || {});

  const FS_VERT = `
precision highp float;
in vec3 position;
out vec2 vUv;
void main(){
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

  const FS_FRAG_HEAD = `
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler3D;
in vec2 vUv;
out vec4 o;
uniform vec2 uRes;
uniform float uTime;
`;

  function createGfx(canvas, { headless = false } = {}) {
    const { GLSL_HASH, GLSL_COLOR } = SC.math;
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: headless,
    });
    renderer.setPixelRatio(1);
    renderer.autoClear = false;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.debug.checkShaderErrors = true;

    const gl = renderer.getContext();
    if (!gl || !(typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext)) {
      throw new Error('WebGL 2 is required');
    }

    const extFloat = gl.getExtension('EXT_color_buffer_float');
    const extHalfFloat = gl.getExtension('EXT_color_buffer_half_float');
    gl.getExtension('OES_texture_float_linear');
    const supportsHalfFloatRT = !!(extFloat || extHalfFloat);
    const maxSamples = Math.min(8, gl.getParameter(gl.MAX_SAMPLES) || 0);

    const fsGeo = new THREE.BufferGeometry();
    fsGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)
    );
    const dummyCam = new THREE.Camera();
    const targets = new Set();

    const gfx = {
      THREE,
      r: renderer,
      gl,
      W: 2,
      H: 2,
      aspect: 1,
      q: 1,
      owner: null,

      target({
        scale = 1,
        w = 0,
        h = 0,
        samples = 0,
        depth = false,
        depthTexture = false,
        type = THREE.HalfFloatType,
        filter = THREE.LinearFilter,
        wrap = THREE.ClampToEdgeWrapping,
        mips = false,
        count = 1,
      } = {}) {
        const effType =
          !supportsHalfFloatRT && (type === THREE.HalfFloatType || type === THREE.FloatType)
            ? THREE.UnsignedByteType
            : type;
        const effSamples = depthTexture ? 0 : Math.min(samples || 0, maxSamples);
        const tw = w || Math.max(1, Math.round(gfx.W * scale));
        const th = h || Math.max(1, Math.round(gfx.H * scale));
        const rt = new THREE.WebGLRenderTarget(tw, th, {
          samples: effSamples,
          depthBuffer: depth || depthTexture,
          stencilBuffer: false,
          type: effType,
          minFilter: mips ? THREE.LinearMipmapLinearFilter : filter,
          magFilter: filter,
          wrapS: wrap,
          wrapT: wrap,
          generateMipmaps: mips,
          count,
        });
        if (depthTexture) {
          rt.depthTexture = new THREE.DepthTexture(rt.width, rt.height, THREE.UnsignedIntType);
        }
        rt._scale = scale;
        rt._fixed = !!(w || h);
        rt._owner = gfx.owner;
        rt._parked = false;
        targets.add(rt);
        return rt;
      },

      free(rt) {
        if (!rt) return;
        targets.delete(rt);
        rt.dispose();
      },

      park(owner, parked) {
        for (const rt of targets) {
          if (rt._owner === owner && !rt._fixed && rt._parked !== parked) {
            rt._parked = parked;
            if (parked) {
              rt.setSize(2, 2);
            } else {
              rt.setSize(
                Math.max(1, Math.round(gfx.W * rt._scale)),
                Math.max(1, Math.round(gfx.H * rt._scale))
              );
            }
          }
        }
      },

      resize(W, H, cssW = W, cssH = H) {
        gfx.W = Math.max(2, Math.round(W));
        gfx.H = Math.max(2, Math.round(H));
        gfx.aspect = gfx.W / gfx.H;
        renderer.setSize(Math.max(2, Math.round(cssW)), Math.max(2, Math.round(cssH)), false);
        for (const rt of targets) {
          if (!rt._fixed && !rt._parked) {
            rt.setSize(
              Math.max(1, Math.round(gfx.W * rt._scale)),
              Math.max(1, Math.round(gfx.H * rt._scale))
            );
          }
        }
      },

      pass(fragBody, uniforms = {}, { blending = THREE.NoBlending, defines = {}, transparent = false } = {}) {
        const u = {
          uRes: { value: new THREE.Vector2(gfx.W, gfx.H) },
          uTime: { value: 0 },
        };
        for (const k in uniforms) {
          const val = uniforms[k];
          u[k] = val && typeof val === 'object' && 'value' in val ? val : { value: val };
        }
        const defStr = Object.entries(defines)
          .map(([k, v]) => `#define ${k} ${v}\n`)
          .join('');
        const cleanedBody = String(fragBody || '').replace(/^\s*#version\s+300\s+es\s*\n?/i, '');
        const material = new THREE.RawShaderMaterial({
          vertexShader: FS_VERT,
          fragmentShader: FS_FRAG_HEAD + defStr + cleanedBody,
          uniforms: u,
          glslVersion: THREE.GLSL3,
          depthTest: false,
          depthWrite: false,
          blending,
          transparent,
        });
        const mesh = new THREE.Mesh(fsGeo, material);
        mesh.frustumCulled = false;
        const scene = new THREE.Scene();
        scene.add(mesh);
        scene.matrixWorldAutoUpdate = false;
        return {
          u,
          material,
          render(target = null, clear = false) {
            u.uRes.value.set(target ? target.width : gfx.W, target ? target.height : gfx.H);
            renderer.setRenderTarget(target);
            if (clear) {
              renderer.setClearColor(0x000000, 0);
              renderer.clear(true, false, false);
            }
            renderer.render(scene, dummyCam);
          },
          dispose() {
            material.dispose();
          },
        };
      },

      draw(scene, cam, target = null, { clear = true, color = null, alpha = 1 } = {}) {
        renderer.setRenderTarget(target);
        if (clear) {
          if (color !== null) renderer.setClearColor(color, alpha);
          else renderer.setClearColor(0x000000, 1);
          renderer.clear(true, true, false);
        }
        renderer.render(scene, cam);
      },

      copy(src, dst = null) {
        copyPass.u.tA.value = src && src.texture ? src.texture : src;
        copyPass.render(dst);
      },

      time(fn, n = 12) {
        const px = new Uint8Array(4);
        const sync = () => {
          renderer.setRenderTarget(null);
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        };
        fn();
        sync();
        const t0 = performance.now();
        for (let i = 0; i < n; i++) fn();
        sync();
        return (performance.now() - t0) / n;
      },
    };

    const copyPass = gfx.pass(
      `
      uniform sampler2D tA;
      void main(){
        o = texture(tA, vUv);
      }
      `,
      { tA: null }
    );

    // 6-level 13-tap Downsample + 3x3 Tent Upsample Bloom Pyramid
    const BLOOM_LEVELS = 6;
    const bloomDown = [];
    const bloomUp = [];
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      const sc = 1 / (2 << i);
      bloomDown.push(gfx.target({ scale: sc }));
      bloomUp.push(gfx.target({ scale: sc }));
    }

    const downPass = gfx.pass(
      `
      uniform sampler2D tA;
      uniform vec2 uPx;
      uniform float uThr, uFirst;
      vec3 tap(vec2 d){
        vec3 c = texture(tA, vUv + d * uPx).rgb;
        c = min(max(c, 0.0), vec3(400.0));
        if(uFirst > 0.5){
          float l = max(c.r, max(c.g, c.b));
          float k = max(0.0, l - uThr) / max(l, 1e-4);
          c *= k;
          c /= 1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722)) * 0.12;
        }
        return c;
      }
      void main(){
        vec3 c = tap(vec2(0.0)) * 0.125;
        c += (tap(vec2(-1.0, -1.0)) + tap(vec2(1.0, -1.0)) + tap(vec2(-1.0, 1.0)) + tap(vec2(1.0, 1.0))) * 0.125;
        c += (tap(vec2(-2.0, 0.0)) + tap(vec2(2.0, 0.0)) + tap(vec2(0.0, -2.0)) + tap(vec2(0.0, 2.0))) * 0.0625;
        c += (tap(vec2(-2.0, -2.0)) + tap(vec2(2.0, -2.0)) + tap(vec2(-2.0, 2.0)) + tap(vec2(2.0, 2.0))) * 0.03125;
        o = vec4(c, 1.0);
      }
      `,
      { tA: null, uPx: new THREE.Vector2(1, 1), uThr: 1.0, uFirst: 0.0 }
    );

    const upPass = gfx.pass(
      `
      uniform sampler2D tA, tB;
      uniform vec2 uPx;
      uniform float uR;
      void main(){
        vec3 c = vec3(0.0);
        for(int y = -1; y <= 1; y++){
          for(int x = -1; x <= 1; x++){
            float w = (x == 0 ? 2.0 : 1.0) * (y == 0 ? 2.0 : 1.0);
            c += w * texture(tA, vUv + vec2(float(x), float(y)) * uPx).rgb;
          }
        }
        o = vec4(texture(tB, vUv).rgb + (c / 16.0) * uR, 1.0);
      }
      `,
      { tA: null, tB: null, uPx: new THREE.Vector2(1, 1), uR: 0.85 }
    );

    const postPass = gfx.pass(
      GLSL_COLOR +
        GLSL_HASH +
        `
        uniform sampler2D tA, tB;
        uniform float uExp, uBloom, uTone, uCon, uSat, uVig, uGrain, uCA, uHal, uFade;
        uniform vec3 uLift, uGain, uFadeC;

        vec3 agx(vec3 v){
          const mat3 M = mat3(
            0.842479062253094, 0.0423282422610123, 0.0423756549057051,
            0.0784335999999992, 0.878468636469772, 0.0784336,
            0.0792237451477643, 0.0791661274605434, 0.879142973793104
          );
          v = M * v;
          v = clamp(log2(max(v, 1e-10)), -12.47393, 4.026069);
          v = (v + 12.47393) / (4.026069 + 12.47393);
          vec3 x2 = v * v;
          vec3 x4 = x2 * x2;
          v = 15.5 * x4 * x2 - 40.14 * x4 * v + 31.96 * x4 - 6.868 * x2 * v + 0.4298 * x2 + 0.1191 * v - 0.00232;
          const mat3 I = mat3(
            1.19687900512017, -0.0528968517574562, -0.0529716355144438,
            -0.0980208811401368, 1.15190312990417, -0.0980434501171241,
            -0.0990297440797205, -0.0989611768448433, 1.15107367264116
          );
          return pow(max(I * v, 0.0), vec3(2.2));
        }

        vec3 aces(vec3 x){
          return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
        }

        void main(){
          vec2 d = vUv - 0.5;
          vec3 c;
          if(uCA > 0.0){
            vec2 k = d * dot(d, d) * uCA;
            c = vec3(
              texture(tA, vUv - k).r,
              texture(tA, vUv).g,
              texture(tA, vUv + k).b
            );
          } else {
            c = texture(tA, vUv).rgb;
          }
          c = max(c, 0.0);
          if(uBloom > 0.0){
            vec3 b = max(texture(tB, vUv).rgb, 0.0);
            c += b * uBloom * vec3(1.0 + uHal * 0.35, 1.0, 1.0 - uHal * 0.35);
          }
          c *= uExp;
          if(uTone > 1.5) c = aces(c);
          else if(uTone > 0.5) c = agx(c);
          c = toSrgb(c);
          c = (c - 0.5) * uCon + 0.5;
          c = mix(vec3(luma(c)), c, uSat);
          c = c * uGain + uLift * (1.0 - c);
          float asp = uRes.x / max(uRes.y, 1.0);
          c *= 1.0 - uVig * smoothstep(0.25, 1.05, length(d * vec2(asp, 1.0) * 1.1));
          c = mix(c, uFadeC, uFade);
          if(uGrain > 0.0){
            float n = hash13(vec3(gl_FragCoord.xy, fract(uTime * 7.3) * 97.0));
            c += (n - 0.5) * uGrain * (1.0 - abs(luma(c) - 0.5));
          }
          o = vec4(clamp(c, 0.0, 1.0), 1.0);
        }
        `,
      {
        tA: null,
        tB: null,
        uExp: 1.0,
        uBloom: 0.0,
        uTone: 1.0,
        uCon: 1.0,
        uSat: 1.0,
        uVig: 0.0,
        uGrain: 0.0,
        uCA: 0.0,
        uHal: 0.0,
        uFade: 0.0,
        uLift: new THREE.Vector3(0, 0, 0),
        uGain: new THREE.Vector3(1, 1, 1),
        uFadeC: new THREE.Vector3(0, 0, 0),
      }
    );

    gfx.post = (src, dst, opts = {}) => {
      const {
        exposure = 1,
        bloom = 0,
        threshold = 1,
        radius = 0.85,
        tone = 'agx',
        contrast = 1,
        saturation = 1,
        vignette = 0,
        grain = 0,
        ca = 0,
        halation = 0,
        lift = [0, 0, 0],
        gain = [1, 1, 1],
        fade = 0,
        fadeColor = [0, 0, 0],
        time = 0,
      } = opts;

      if (bloom > 0) {
        let cur = src;
        for (let i = 0; i < BLOOM_LEVELS; i++) {
          downPass.u.tA.value = cur.texture || cur;
          downPass.u.uPx.value.set(1 / Math.max(1, cur.width), 1 / Math.max(1, cur.height));
          downPass.u.uFirst.value = i === 0 ? 1 : 0;
          downPass.u.uThr.value = threshold;
          downPass.render(bloomDown[i]);
          cur = bloomDown[i];
        }
        let upCur = bloomDown[BLOOM_LEVELS - 1];
        for (let i = BLOOM_LEVELS - 2; i >= 0; i--) {
          upPass.u.tA.value = upCur.texture;
          upPass.u.tB.value = bloomDown[i].texture;
          upPass.u.uPx.value.set(1 / Math.max(1, upCur.width), 1 / Math.max(1, upCur.height));
          upPass.u.uR.value = radius;
          upPass.render(bloomUp[i]);
          upCur = bloomUp[i];
        }
      }

      const u = postPass.u;
      u.tA.value = src.texture || src;
      u.tB.value = bloomUp[0].texture;
      u.uExp.value = exposure;
      u.uBloom.value = (bloom / BLOOM_LEVELS) * 1.6;
      u.uTone.value = tone === 'aces' ? 2 : tone === 'agx' ? 1 : 0;
      u.uCon.value = contrast;
      u.uSat.value = saturation;
      u.uVig.value = vignette;
      u.uGrain.value = grain;
      u.uCA.value = ca;
      u.uHal.value = halation;
      u.uLift.value.set(lift[0] || 0, lift[1] || 0, lift[2] || 0);
      u.uGain.value.set(gain[0] ?? 1, gain[1] ?? 1, gain[2] ?? 1);
      u.uFade.value = fade;
      u.uFadeC.value.set(fadeColor[0] || 0, fadeColor[1] || 0, fadeColor[2] || 0);
      u.uTime.value = time;
      postPass.render(dst);
    };

    const presentPass = gfx.pass(
      GLSL_HASH +
        `
        uniform sampler2D tA;
        uniform float uBlack;
        void main(){
          vec3 c = texture(tA, vUv).rgb * (1.0 - uBlack);
          float n = hash13(vec3(gl_FragCoord.xy, fract(uTime) * 61.0))
                  + hash13(vec3(gl_FragCoord.xy, fract(uTime) * 61.0 + 7.0)) - 1.0;
          vec3 d = clamp(c + n / 255.0, 0.0, 1.0);
          o = vec4(all(greaterThan(c, vec3(0.9985))) ? vec3(1.0) : d, 1.0);
        }
        `,
      { tA: null, uBlack: 0.0 }
    );

    gfx.present = (src, time = 0, black = 0) => {
      presentPass.u.tA.value = src.texture || src;
      presentPass.u.uTime.value = time;
      presentPass.u.uBlack.value = black;
      presentPass.render(null);
    };

    return gfx;
  }

  SC.createGfx = createGfx;
})();
