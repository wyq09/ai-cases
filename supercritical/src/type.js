(() => {
  'use strict';
  const SC = (window.__SC = window.__SC || {});

  const CJK_SANS = '"PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Source Han Sans SC", "Microsoft YaHei", sans-serif';
  const CJK_SERIF =
    '"Songti SC", "Noto Serif CJK SC", "Noto Serif SC", "Source Han Serif SC", "Source Han Serif CN", "STZhongsong", "SimSun", serif';
  const LATIN_SERIF = '"Didot", "Bodoni 72", "Bodoni 72 Smallcaps", "New York", "Times New Roman", Georgia, serif';

  const FONTS = {
    song: { family: CJK_SERIF, weight: 400 },
    songBold: { family: CJK_SERIF, weight: 700 },
    songBlack: { family: CJK_SERIF, weight: 900 },
    serif: { family: `Georgia, Baskerville, ${CJK_SERIF}`, weight: 400 },
    didot: { family: LATIN_SERIF, weight: 400 },
    didotBold: { family: LATIN_SERIF, weight: 700 },
    text: {
      family: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", "Segoe UI", ${CJK_SANS}`,
      weight: 400,
    },
    textMed: {
      family: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", "Segoe UI", ${CJK_SANS}`,
      weight: 500,
    },
    textBold: {
      family: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", "Segoe UI", ${CJK_SANS}`,
      weight: 700,
    },
    mono: {
      family: `"SF Mono", ui-monospace, Menlo, "JetBrains Mono", Consolas, "Courier New", ${CJK_SANS}`,
      weight: 400,
    },
    monoMed: {
      family: `"SF Mono", ui-monospace, Menlo, "JetBrains Mono", Consolas, "Courier New", ${CJK_SANS}`,
      weight: 600,
    },
    monoBold: {
      family: `"SF Mono", ui-monospace, Menlo, "JetBrains Mono", Consolas, "Courier New", ${CJK_SANS}`,
      weight: 700,
    },
  };

  function fontCss(font, size) {
    const spec =
      typeof font === 'string'
        ? FONTS[font] || FONTS.text
        : font && typeof font === 'object'
        ? font
        : FONTS.text;
    return `${spec.style || 'normal'} ${spec.weight || 400} ${size}px ${spec.family || CJK_SANS}`;
  }

  const TEXT_VERT = `
precision highp float;
in vec2 position;
in vec4 iRect, iUv, iT, iF, iC, iX;
uniform mat4 projectionMatrix, modelViewMatrix;
uniform float uFlip;
out vec2 vUv;
out vec4 vC;
out vec4 vF;
out vec2 vP;
out vec4 vClip;
flat out vec4 vCell;
void main(){
  vec2 c = iRect.xy + iRect.zw * 0.5;
  vec2 q = position * iRect.zw * iX.xy * iT.z;
  q.x += -q.y * iF.w;
  float s = sin(iT.w), k = cos(iT.w);
  q = vec2(q.x * k - q.y * s, q.x * s + q.y * k);
  vec2 p = c + q + iT.xy;
  vP = p;
  vUv = iUv.xy + (position + 0.5) * iUv.zw;
  vCell = vec4(iUv.xy, iUv.xy + iUv.zw);
  vC = iC;
  vF = iF;
  vClip = vec4(iX.zw, 0.0, 0.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p.x, uFlip > 0.5 ? -p.y : p.y, 0.0, 1.0);
}
`;

  const TEXT_FRAG = `
precision highp float;
in vec2 vUv;
in vec4 vC, vF;
in vec2 vP;
in vec4 vClip;
flat in vec4 vCell;
out vec4 o;
uniform sampler2D tA;
uniform vec2 uPx;
uniform float uAlpha, uLinear, uGain, uPpu;

float sampleGlyph(vec2 u){
  return (any(lessThan(u, vCell.xy)) || any(greaterThan(u, vCell.zw))) ? 0.0 : texture(tA, u).a;
}

void main(){
  if(vF.z > 0.5 && (vP.y < vClip.x || vP.y > vClip.y)) discard;
  float a;
  float b = vF.y * uPpu;
  if(b < 0.4){
    a = sampleGlyph(vUv);
  } else {
    a = 0.0;
    float w = 0.0;
    for(int i = 0; i < 28; i++){
      float f = (float(i) + 0.5) / 28.0;
      float r = sqrt(f) * b;
      float th = float(i) * 2.3999632;
      float g = exp(-2.2 * f);
      a += g * sampleGlyph(vUv + vec2(cos(th), sin(th)) * r * uPx);
      w += g;
    }
    a /= w;
  }
  a *= vF.x * uAlpha;
  vec3 c = vC.rgb;
  if(uLinear > 0.5){
    c = mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
  }
  c *= uGain;
  o = vec4(c * a, a * vC.a);
}
`;

  let quadGeo = null;
  function getQuadGeo() {
    if (!quadGeo) {
      quadGeo = new THREE.BufferGeometry();
      quadGeo.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5]), 2)
      );
      quadGeo.setIndex([0, 1, 2, 0, 2, 3]);
    }
    return quadGeo;
  }

  let measureCtx = null;
  function getMeasureCtx() {
    if (!measureCtx) {
      const c = document.createElement('canvas');
      measureCtx = c.getContext('2d');
    }
    return measureCtx;
  }

  const CJK_RE = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/;
  const NO_LINE_START_RE = /[，。！？、；：）》】”’·…—％‰.,!?;:\)\]\}\>]/;
  const NO_LINE_END_RE = /[（《【“‘\(\[\{]/;

  function createType(gfx, getPpu) {
    const { clamp, ease, hash, hexToRgb } = SC.math;
    const blocks = new Set();
    const maxTexSize = Math.min(4096, (gfx && gfx.gl && gfx.gl.getParameter(gfx.gl.MAX_TEXTURE_SIZE)) || 4096);

    class TextBlock {
      constructor(str, opts = {}) {
        this.o = {
          x: 0,
          y: 0,
          size: 48,
          font: 'display',
          color: '#ffffff',
          align: 'left',
          valign: 'top',
          leading: 1.18,
          tracking: 0,
          maxWidth: 0,
          raster: 1,
          order: 10,
          ...opts,
        };
        this.alpha = 1;
        this.x = this.o.x;
        this.y = this.o.y;
        this.scale = 1;
        this.rotation = 0;
        this.max = 0;
        this._ppu = 0;
        this._fn = null;
        this.text = null;
        this.glyphs = [];
        this.lines = [];
        this.width = 0;
        this.height = 0;
        this.n = 0;
        this.words = 0;
        this.box = { x: 0, y: 0, w: 0, h: 0 };

        this.mat = new THREE.RawShaderMaterial({
          vertexShader: TEXT_VERT,
          fragmentShader: TEXT_FRAG,
          glslVersion: THREE.GLSL3,
          transparent: true,
          depthTest: false,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.CustomBlending,
          blendSrc: THREE.OneFactor,
          blendDst: THREE.OneMinusSrcAlphaFactor,
          blendSrcAlpha: THREE.OneFactor,
          blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
          uniforms: {
            tA: { value: null },
            uPx: { value: new THREE.Vector2(1, 1) },
            uAlpha: { value: 1 },
            uLinear: { value: 0 },
            uGain: { value: 1 },
            uFlip: { value: 0 },
            uPpu: { value: 1 },
          },
        });

        this.canvas = document.createElement('canvas');
        this.canvas.width = 4;
        this.canvas.height = 4;
        this.tex = new THREE.CanvasTexture(this.canvas);
        this.tex.colorSpace = THREE.NoColorSpace;
        this.tex.generateMipmaps = false;
        this.tex.minFilter = THREE.LinearFilter;
        this.tex.magFilter = THREE.LinearFilter;
        this.tex.premultiplyAlpha = false;
        this.tex.flipY = false;
        this.mat.uniforms.tA.value = this.tex;

        const initGeo = new THREE.InstancedBufferGeometry();
        initGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
        this.mesh = new THREE.Mesh(initGeo, this.mat);
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = this.o.order;
        this.mesh.onBeforeRender = () => this._sync();

        blocks.add(this);
        this.set(str == null ? '' : str);
      }

      set(str) {
        const next = str == null ? '' : str;
        if (next === this.text) return this;
        this.text = next;
        this._layout();
        this._ppu = 0;
        this._raster();
        this.animate(this._fn);
        return this;
      }

      style(opts = {}) {
        Object.assign(this.o, opts);
        if ('x' in opts) this.x = opts.x;
        if ('y' in opts) this.y = opts.y;
        if ('order' in opts) this.mesh.renderOrder = opts.order;
        if (
          'size' in opts ||
          'font' in opts ||
          'align' in opts ||
          'valign' in opts ||
          'tracking' in opts ||
          'leading' in opts ||
          'maxWidth' in opts ||
          'color' in opts ||
          'raster' in opts
        ) {
          const prev = this.text;
          this.text = null;
          this.set(prev);
        } else {
          this.mesh.position.set(this.x, this.y, 0);
        }
        return this;
      }

      _layout() {
        const o = this.o;
        const mctx = getMeasureCtx();
        const spans = typeof this.text === 'string' ? [{ t: this.text }] : Array.isArray(this.text) ? this.text : [{ t: String(this.text) }];
        const chars = [];
        let ci = 0;
        for (const sp of spans) {
          const txt = String(sp.t == null ? '' : sp.t);
          for (const ch of txt) {
            chars.push({
              ch,
              size: sp.size || o.size,
              font: sp.font || o.font,
              color: sp.color || o.color,
              i: ci++,
            });
          }
        }

        let rawLines = [[]];
        for (const item of chars) {
          if (item.ch === '\n') rawLines.push([]);
          else rawLines[rawLines.length - 1].push(item);
        }

        const measureLine = (line) => {
          let x = 0;
          let idx = 0;
          while (idx < line.length) {
            let end = idx;
            while (end < line.length && line[end].font === line[idx].font && line[end].size === line[idx].size) {
              end++;
            }
            mctx.font = fontCss(line[idx].font, line[idx].size);
            let run = '';
            for (let k = idx; k < end; k++) {
              run += line[k].ch;
              const runW = mctx.measureText(run).width;
              const chW = mctx.measureText(line[k].ch).width;
              line[k].x = x + runW - chW + (k - idx) * o.tracking * line[k].size;
              line[k].w = chW;
            }
            x += mctx.measureText(run).width + (end - idx) * o.tracking * line[idx].size;
            idx = end;
          }
          return line.length ? x - o.tracking * line[line.length - 1].size : 0;
        };

        if (o.maxWidth > 0) {
          const wrapped = [];
          for (const line of rawLines) {
            if (!line.length) {
              wrapped.push([]);
              continue;
            }
            let cur = [];
            let tok = [];
            const flush = () => {
              if (!tok.length) return;
              const cand = cur.concat(tok);
              if (cur.length && measureLine(cand) > o.maxWidth) {
                while (cur.length && cur[cur.length - 1].ch === ' ') cur.pop();
                wrapped.push(cur);
                while (tok.length && tok[0].ch === ' ') tok.shift();
                cur = tok;
              } else {
                cur = cand;
              }
              tok = [];
            };
            for (const item of line) {
              const ch = item.ch;
              if (ch === ' ') {
                flush();
                tok = [item];
                flush();
              } else if (NO_LINE_START_RE.test(ch)) {
                tok.push(item);
                flush();
              } else if (NO_LINE_END_RE.test(ch)) {
                flush();
                tok.push(item);
              } else if (CJK_RE.test(ch)) {
                if (tok.length && !NO_LINE_END_RE.test(tok[tok.length - 1].ch)) {
                  flush();
                }
                tok.push(item);
              } else {
                if (tok.length && CJK_RE.test(tok[tok.length - 1].ch) && !NO_LINE_END_RE.test(tok[tok.length - 1].ch)) {
                  flush();
                }
                tok.push(item);
              }
            }
            flush();
            wrapped.push(cur);
          }
          rawLines = wrapped;
        }

        const lineHeights = rawLines.map((line) => {
          const maxSz = line.length ? Math.max(...line.map((c) => c.size)) : o.size;
          return maxSz * o.leading;
        });
        this.height = lineHeights.reduce((acc, v) => acc + v, 0);
        this.width = 0;
        this.glyphs = [];
        this.lines = [];

        rawLines.forEach((line) => {
          const w = measureLine(line);
          line._w = w;
          if (w > this.width) this.width = w;
        });

        const yStart =
          o.valign === 'middle'
            ? -this.height * 0.5
            : o.valign === 'bottom'
            ? -this.height
            : o.valign === 'base'
            ? -(lineHeights[0] || o.size) * 0.5 - o.size * 0.35
            : 0;

        let yOff = 0;
        let wordIdx = 0;
        let glyphIdx = 0;
        rawLines.forEach((line, li) => {
          const xOff = o.align === 'center' ? -line._w * 0.5 : o.align === 'right' ? -line._w : 0;
          const lh = lineHeights[li];
          const maxSz = line.length ? Math.max(...line.map((c) => c.size)) : o.size;
          const base = yStart + yOff + lh * 0.5 + maxSz * 0.35;
          this.lines.push({ x: xOff, y: yStart + yOff, w: line._w, h: lh, base });

          let inWord = false;
          line.forEach((ch, j) => {
            if (ch.ch === ' ' || ch.ch === '\t') {
              inWord = false;
              return;
            }
            if (!inWord) {
              wordIdx++;
              inWord = true;
            }
            this.glyphs.push({
              ch: ch.ch,
              n: glyphIdx++,
              ci: ch.i,
              line: li,
              j,
              word: wordIdx - 1,
              x: xOff + ch.x,
              y: base,
              w: Math.max(1, ch.w),
              size: ch.size,
              font: ch.font,
              color: hexToRgb(ch.color),
              alphaC: 1,
              top: yStart + yOff,
              bot: yStart + yOff + lh,
              cx: xOff + ch.x + ch.w * 0.5,
              cy: yStart + yOff + lh * 0.5,
              rect: [0, 0, 1, 1],
              uv: [0, 0, 1, 1],
            });
          });
          yOff += lh;
        });

        this.n = glyphIdx;
        this.words = wordIdx;
        const bx = o.align === 'center' ? -this.width * 0.5 : o.align === 'right' ? -this.width : 0;
        this.box = { x: bx, y: yStart, w: this.width, h: this.height };

        if (glyphIdx > this.max || !this.buf) {
          this.max = Math.max(24, glyphIdx);
          const geo = new THREE.InstancedBufferGeometry();
          geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
          const qg = getQuadGeo();
          geo.setIndex(qg.index.clone());
          geo.setAttribute('position', qg.getAttribute('position').clone());
          this.buf = new THREE.InstancedInterleavedBuffer(new Float32Array(this.max * 24), 24, 1);
          this.buf.setUsage(THREE.DynamicDrawUsage);
          ['iRect', 'iUv', 'iT', 'iF', 'iC', 'iX'].forEach((name, idx) => {
            geo.setAttribute(name, new THREE.InterleavedBufferAttribute(this.buf, 4, idx * 4));
          });
          this.mesh.geometry.dispose();
          this.mesh.geometry = geo;
        }
        this.mesh.geometry.instanceCount = glyphIdx;
      }

      _raster() {
        const rawPpu = typeof getPpu === 'function' ? getPpu() : 1;
        let s = clamp(rawPpu * this.o.raster, 0.5, 4.5);
        if (Math.abs(s - this._ppu) < 0.002 && this._ppu > 0) return;

        if (!this.glyphs.length) {
          this._ppu = s;
          return;
        }

        const padOf = (g) => g.size * 0.3 + 3;
        const pack = (scaleVal) => {
          let area = 0;
          for (const g of this.glyphs) {
            const p = padOf(g);
            area += (g.w + 2 * p) * (g.size * 1.45 + 2 * p);
          }
          const w = Math.min(maxTexSize, Math.max(64, Math.ceil(Math.sqrt(area * scaleVal * scaleVal) * 1.18 + 64)));
          let cx = 1;
          let cy = 1;
          let rowH = 0;
          const cells = [];
          for (const g of this.glyphs) {
            const p = padOf(g);
            const gw = Math.ceil((g.w + 2 * p) * scaleVal);
            const gh = Math.ceil((g.size * 1.28 + 2 * p) * scaleVal);
            if (cx + gw + 1 > w) {
              cx = 1;
              cy += rowH + 1;
              rowH = 0;
            }
            cells.push([cx, cy, gw, gh]);
            cx += gw + 1;
            if (gh > rowH) rowH = gh;
          }
          const h = Math.max(4, cy + rowH + 1);
          return { w, h, cells };
        };

        let packed = pack(s);
        while (packed.h > maxTexSize && s > 0.4) {
          s *= 0.72;
          packed = pack(s);
        }
        this._ppu = s;

        const { w: W, h: H, cells } = packed;
        if (this.canvas.width !== W || this.canvas.height !== H) {
          this.canvas.width = W;
          this.canvas.height = H;
          this.tex.dispose();
        }
        const ctx2d = this.canvas.getContext('2d');
        ctx2d.clearRect(0, 0, W, H);
        ctx2d.fillStyle = '#ffffff';
        ctx2d.textBaseline = 'alphabetic';

        for (let i = 0; i < this.glyphs.length; i++) {
          const g = this.glyphs[i];
          const [gx, gy, gw, gh] = cells[i];
          const p = padOf(g);
          ctx2d.font = fontCss(g.font, g.size * s);
          ctx2d.fillText(g.ch, gx + p * s, gy + (p + g.size * 0.95) * s);
          g.rect = [g.x - p, g.y - p - g.size * 0.95, gw / s, gh / s];
          g.uv = [gx / W, gy / H, gw / W, gh / H];
        }

        this.tex.needsUpdate = true;
        this.mat.uniforms.uPx.value.set(1 / W, 1 / H);
        this.mat.uniforms.uPpu.value = s;
      }

      _sync() {
        this.mat.uniforms.uAlpha.value = this.alpha;
      }

      animate(fn) {
        this._raster();
        this._fn = fn || null;
        if (this.buf && this.glyphs.length) {
          const arr = this.buf.array;
          const props = {};
          for (let i = 0; i < this.glyphs.length; i++) {
            const g = this.glyphs[i];
            props.dx = 0;
            props.dy = 0;
            props.rot = 0;
            props.blur = 0;
            props.clip = 0;
            props.skew = 0;
            props.scale = 1;
            props.sx = 1;
            props.sy = 1;
            props.alpha = 1;
            props.r = g.color[0];
            props.g = g.color[1];
            props.b = g.color[2];
            if (fn) fn(g, props, this);
            const off = i * 24;
            arr[off + 0] = g.rect[0];
            arr[off + 1] = g.rect[1];
            arr[off + 2] = g.rect[2];
            arr[off + 3] = g.rect[3];
            arr[off + 4] = g.uv[0];
            arr[off + 5] = g.uv[1];
            arr[off + 6] = g.uv[2];
            arr[off + 7] = g.uv[3];
            arr[off + 8] = props.dx;
            arr[off + 9] = props.dy;
            arr[off + 10] = props.scale;
            arr[off + 11] = props.rot;
            arr[off + 12] = props.alpha;
            arr[off + 13] = props.blur;
            arr[off + 14] = props.clip;
            arr[off + 15] = props.skew;
            arr[off + 16] = props.r;
            arr[off + 17] = props.g;
            arr[off + 18] = props.b;
            arr[off + 19] = 1;
            arr[off + 20] = props.sx;
            arr[off + 21] = props.sy;
            arr[off + 22] = g.top;
            arr[off + 23] = g.bot;
          }
          this.buf.needsUpdate = true;
        }
        this.mesh.position.set(this.x, this.y, 0);
        this.mesh.scale.setScalar(this.scale);
        this.mesh.rotation.z = this.rotation;
        this.mesh.visible = this.alpha > 0.001 && this.n > 0;
        return this;
      }

      show(p, { style = 'rise', q = 0, stagger = 0.5, by = 'glyph', seed = 1 } = {}) {
        if (p <= 0 || q >= 1 || this.n === 0) {
          this.mesh.visible = false;
          return this;
        }
        const total = by === 'word' ? this.words : by === 'line' ? this.lines.length : this.n;
        const stg = clamp(stagger, 0, 0.95);
        const span = Math.max(0.05, 1 - stg);

        this.animate((g, d) => {
          const idx = by === 'word' ? g.word : by === 'line' ? g.line : g.n;
          const off = total > 1 ? (idx / (total - 1)) * stg : 0;
          const v = clamp((p - off) / span, 0, 1);
          const m = clamp((q - off) / span, 0, 1);
          const eIn = ease.out4(v);
          const eOut = ease.in3(m);

          if (style === 'rise') {
            d.dy = (1 - eIn) * g.size * 1.15 - eOut * g.size * 1.15;
            d.clip = 1;
            d.alpha = v > 0 ? 1 : 0;
          } else if (style === 'blur') {
            d.alpha = ease.out2(v) * (1 - eOut);
            d.blur = (1 - eIn + eOut) * g.size * 0.28;
            d.dx = (1 - eIn) * g.size * 0.12;
            d.scale = 1 + (1 - eIn) * 0.06;
          } else if (style === 'type') {
            d.alpha = v > 0 && m < 1 ? 1 : 0;
          } else if (style === 'fade') {
            d.alpha = ease.out2(v) * (1 - eOut);
          } else if (style === 'scatter') {
            const ang = hash(g.n + seed * 17) * Math.PI * 2;
            const dist = (1 - eIn) * (200 + 500 * hash(g.n * 3 + seed)) + eOut * 600;
            d.dx = Math.cos(ang) * dist;
            d.dy = Math.sin(ang) * dist;
            d.rot = (1 - eIn + eOut) * (hash(g.n + 5) - 0.5) * 5;
            d.alpha = ease.out2(clamp(v * 2, 0, 1)) * (1 - eOut);
          } else if (style === 'track') {
            const center = this.box.x + this.box.w * 0.5;
            d.dx = (g.cx - center) * ((1 - eIn) * 0.35 + eOut * 0.5);
            d.alpha = ease.out2(v) * (1 - eOut);
            d.blur = (1 - eIn + eOut) * 6;
          } else if (style === 'drop') {
            const eb = ease.outBack(v, 1.9);
            d.dy = (1 - eb) * -g.size * 0.9 + eOut * g.size;
            d.rot = (1 - eb) * (hash(g.n + seed) - 0.5) * 0.8;
            d.alpha = ease.out2(clamp(v * 2, 0, 1)) * (1 - eOut);
          }
        });
        return this;
      }

      in3D(scale = 0.01, { gain = 1, depthTest = true } = {}) {
        this.mat.uniforms.uLinear.value = 1;
        this.mat.uniforms.uGain.value = gain;
        this.mat.uniforms.uFlip.value = 1;
        this.mat.depthTest = depthTest;
        const grp = new THREE.Group();
        grp.scale.setScalar(scale);
        grp.add(this.mesh);
        this.x = 0;
        this.y = 0;
        this.mesh.position.set(0, 0, 0);
        return grp;
      }

      dispose() {
        blocks.delete(this);
        this.tex.dispose();
        this.mat.dispose();
        this.mesh.geometry.dispose();
      }
    }

    return {
      TextBlock,
      block: (str, opts) => new TextBlock(str, opts),
      blocks,
      refresh() {
        for (const b of blocks) {
          b._ppu = 0;
          b._raster();
          b.animate(b._fn);
        }
      },
    };
  }

  // ===== Rect2D (Crisp SDF Rounded/Bordered/Shadowed 2D Rectangle) =====
  const RECT_VERT = `
precision highp float;
in vec3 position;
uniform mat4 projectionMatrix;
uniform vec4 uRect;
uniform float uRot, uPad;
out vec2 vP;
void main(){
  vec2 h = uRect.zw * 0.5 + uPad;
  vec2 q = position.xy * 2.0 * h;
  vP = q;
  float s = sin(uRot), k = cos(uRot);
  vec2 p = uRect.xy + uRect.zw * 0.5 + vec2(q.x * k - q.y * s, q.x * s + q.y * k);
  gl_Position = projectionMatrix * vec4(p, 0.0, 1.0);
}
`;

  const RECT_FRAG = `
precision highp float;
in vec2 vP;
out vec4 o;
uniform vec4 uRect;
uniform vec3 uColor, uBorder;
uniform float uAlpha, uRadius, uBorderW, uShadow, uPx;

float sdRound2(vec2 p, vec2 b, float r){
  r = min(r, min(b.x, b.y));
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main(){
  vec2 h = max(uRect.zw * 0.5, vec2(0.0));
  if(h.x < 0.05 || h.y < 0.05) discard;
  float px = max(uPx, 0.5);
  float d = sdRound2(vP, h, uRadius);

  vec4 outC = vec4(0.0);

  if(uShadow > 0.01){
    float sd = sdRound2(vP - vec2(0.0, uShadow * 0.28), h, uRadius);
    float sh = exp(-max(sd, 0.0) / max(uShadow * 0.55, 1.0)) * 0.28 * smoothstep(uShadow * 2.2, -px, sd);
    outC = vec4(0.0, 0.0, 0.0, sh);
  }

  float fillA = smoothstep(px, -px, d);
  vec4 fillC = vec4(uColor * fillA, fillA);

  if(uBorderW > 0.01){
    float innerD = d + uBorderW;
    float innerA = smoothstep(px, -px, innerD);
    float strokeA = max(0.0, fillA - innerA);
    fillC = vec4(uColor * innerA + uBorder * strokeA, fillA);
  }

  // Premultiplied over: fillC over shadow
  vec3 rgb = fillC.rgb + outC.rgb * (1.0 - fillC.a);
  float a = fillC.a + outC.a * (1.0 - fillC.a);
  o = vec4(rgb * uAlpha, a * uAlpha);
}
`;

  class Rect2D {
    constructor({ color = '#ffffff', border = null, borderWidth = 0, radius = 0, shadow = 0, order = 5 } = {}) {
      const { hexToRgb } = SC.math;
      const c = hexToRgb(color);
      const bc = border ? hexToRgb(border) : c;
      this.mat = new THREE.RawShaderMaterial({
        vertexShader: RECT_VERT,
        fragmentShader: RECT_FRAG,
        glslVersion: THREE.GLSL3,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        blendSrcAlpha: THREE.OneFactor,
        blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
        uniforms: {
          uRect: { value: new THREE.Vector4(0, 0, 10, 10) },
          uColor: { value: new THREE.Vector3(c[0], c[1], c[2]) },
          uBorder: { value: new THREE.Vector3(bc[0], bc[1], bc[2]) },
          uAlpha: { value: 1 },
          uRadius: { value: radius },
          uBorderW: { value: border ? Math.max(1, borderWidth || 1) : borderWidth || 0 },
          uShadow: { value: shadow },
          uRot: { value: 0 },
          uPad: { value: Math.max(8, shadow * 2.5 + 4) },
          uPx: { value: 0.7 },
        },
      });
      this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
      this.mesh.frustumCulled = false;
      this.mesh.renderOrder = order;
      this.set(0, 0, 10, 10);
    }

    set(x, y, w, h, rot = 0) {
      const u = this.mat.uniforms;
      u.uRect.value.set(x, y, Math.max(0, w), Math.max(0, h));
      u.uRot.value = rot;
      return this;
    }

    alpha(a) {
      this.mat.uniforms.uAlpha.value = a;
      this.mesh.visible = a > 0.002;
      return this;
    }

    color(hex) {
      const c = SC.math.hexToRgb(hex);
      this.mat.uniforms.uColor.value.set(c[0], c[1], c[2]);
      return this;
    }

    border(hex, width) {
      if (hex != null) {
        const c = SC.math.hexToRgb(hex);
        this.mat.uniforms.uBorder.value.set(c[0], c[1], c[2]);
      }
      if (width != null) {
        this.mat.uniforms.uBorderW.value = width;
      }
      return this;
    }

    radius(r) {
      this.mat.uniforms.uRadius.value = r;
      return this;
    }

    shadow(s) {
      this.mat.uniforms.uShadow.value = s;
      this.mat.uniforms.uPad.value = Math.max(8, s * 2.5 + 4);
      return this;
    }

    px(px) {
      this.mat.uniforms.uPx.value = px;
      return this;
    }

    dispose() {
      this.mesh.geometry.dispose();
      this.mat.dispose();
    }
  }

  function rectOf(points, camera, view) {
    let minX = 1e9;
    let minY = 1e9;
    let maxX = -1e9;
    let maxY = -1e9;
    const v = new THREE.Vector3();
    for (const pt of points) {
      v.copy(pt).project(camera);
      const sx = view.x0 + (v.x * 0.5 + 0.5) * view.w;
      const sy = view.y0 + (-v.y * 0.5 + 0.5) * view.h;
      if (sx < minX) minX = sx;
      if (sy < minY) minY = sy;
      if (sx > maxX) maxX = sx;
      if (sy > maxY) maxY = sy;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  SC.createType = createType;
  SC.Rect2D = Rect2D;
  SC.rectOf = rectOf;
})();
