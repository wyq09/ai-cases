/* =====================================================================
   splat-portal · WebGL2 渲染器
   ---------------------------------------------------------------------
   每帧计数排序（按视深分 2048 桶），索引写进 R32F 顺序纹理；
   顶点着色器用 gl_InstanceID 查顺序纹理，取属性并投影协方差。
   传送门在片元里用「视线 × 门盘」求交决定该像素属于门内还是门外。
   ===================================================================== */
(function (global) {
  'use strict';

  const VS = `#version 300 es
  precision highp float;

  // 每个实例一份属性（instanceAttrib），不用纹理采样：
  // aPos = xyz + seed, aScale = xyz, aQuat = xyzw(wxyz), aColor = rgba
  layout(location=0) in vec4 aPos;
  layout(location=1) in vec3 aScale;
  layout(location=2) in vec4 aQuat;
  layout(location=3) in vec4 aColor;

  uniform mat4 uViewProj;
  uniform mat4 uView;
  uniform vec2 uViewportPx;
  uniform float uFocal;
  uniform float uPointScale;
  uniform float uMorph;
  uniform float uMorphAmount;
  uniform vec3 uMorphCenter;
  uniform float uMaxPointPx;
  uniform float uAlphaScale;
  uniform float uFogStart;
  uniform float uFogRange;

  out vec4 vColor;
  out vec2 vQuad;

  void main() {
    vec3 pos = aPos.xyz;
    vec3 scl = aScale;
    // .splat 的四元数按 (w, x, y, z) 存储
    float w = aQuat.x, x = aQuat.y, y = aQuat.z, z = aQuat.w;
    vec4 col = aColor;

    float fade = 1.0;
    if (uMorph > 0.0001) {
      vec3 dir = normalize(pos - uMorphCenter + vec3(0.0001));
      pos += dir * (uMorph * uMorphAmount) * (0.5 + aPos.w);
      fade = 1.0 - uMorph * 0.9;
    }

    vec4 clip = uViewProj * vec4(pos, 1.0);
    if (clip.w <= 0.02) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      vColor = vec4(0.0); vQuad = vec2(0.0);
      return;
    }

    vec3 camPos = (uView * vec4(pos, 1.0)).xyz;
    float depth = max(-camPos.z, 0.05);

    // 直接用四元数构造旋转后的三根轴（与 3DGS 参考实现一致）。
    // 注意 GLSL mat3(c0,c1,c2) 的参数是「列」，所以这里三列就是三根本体轴。
    vec3 a0 = vec3(
      1.0 - 2.0*(y*y + z*z),
      2.0*(x*y + w*z),
      2.0*(x*z - w*y)
    );
    vec3 a1 = vec3(
      2.0*(x*y - w*z),
      1.0 - 2.0*(x*x + z*z),
      2.0*(y*z + w*x)
    );
    vec3 a2 = vec3(
      2.0*(x*z + w*y),
      2.0*(y*z - w*x),
      1.0 - 2.0*(x*x + y*y)
    );
    mat3 M = mat3(a0 * scl.x, a1 * scl.y, a2 * scl.z);
    mat3 Sigma = M * transpose(M);

    mat3 V = mat3(uView[0].xyz, uView[1].xyz, uView[2].xyz);
    mat3 Vrk = V * Sigma * transpose(V);

    float invZ = 1.0 / depth;
    float fx = uFocal;
    float fy = uFocal;
    vec3 j0 = vec3(fx*invZ, 0.0, 0.0);
    vec3 j1 = vec3(0.0, fy*invZ, 0.0);
    vec3 j2 = vec3(-fx*camPos.x*invZ*invZ, -fy*camPos.y*invZ*invZ, 0.0);
    mat3 J = mat3(j0, j1, j2);
    mat3 cov = J * Vrk * transpose(J);

    float a = cov[0][0] + 0.3;
    float b = cov[0][1];
    float c = cov[1][1] + 0.3;

    float mid = 0.5 * (a + c);
    float rad = sqrt(max(0.05, 0.25*(a-c)*(a-c) + b*b));
    float l1 = mid + rad;
    float l2 = max(0.05, mid - rad);

    // 单颗高斯的屏幕半轴上限（像素）
    float maxAxis = max(6.0, uMaxPointPx);
    float s1 = min(sqrt(l1), maxAxis);
    float s2 = min(sqrt(l2), maxAxis);

    vec2 v1 = vec2(b, l1 - a);
    if (dot(v1, v1) < 1e-12) v1 = vec2(1.0, 0.0);
    v1 = normalize(v1);
    vec2 v2 = vec2(-v1.y, v1.x);

    vec2 axis1 = v1 * s1 * uPointScale;
    vec2 axis2 = v2 * s2 * uPointScale;

    vec2 off;
    if (gl_VertexID == 0) off = vec2(-1.0, -1.0);
    else if (gl_VertexID == 1) off = vec2(1.0, -1.0);
    else if (gl_VertexID == 2) off = vec2(-1.0, 1.0);
    else if (gl_VertexID == 3) off = vec2(-1.0, 1.0);
    else if (gl_VertexID == 4) off = vec2(1.0, -1.0);
    else off = vec2(1.0, 1.0);

    vQuad = off;
    vec2 ndc = clip.xy / clip.w;
    vec2 delta = (axis1 * off.x + axis2 * off.y) * (2.0 / uViewportPx);
    gl_Position = vec4(ndc + delta, 0.0, 1.0);

    // 远景轻微压暗，制造纵深（不改 alpha，避免出现硬边）
    float fog = exp(-max(depth - uFogStart, 0.0) / uFogRange);
    vec3 shaped = col.rgb * mix(0.55, 1.0, clamp(fog, 0.0, 1.0));
    vColor = vec4(shaped, col.a * fade * uAlphaScale);
  }`;

  const FS = `#version 300 es
  precision highp float;

  in vec4 vColor;
  in vec2 vQuad;

  uniform float uAlphaCut;
  uniform float uOpacity;
  uniform float uKernel;
  uniform vec2 uViewportPx;

  uniform vec3 uCamPos;
  uniform vec3 uCamRight;
  uniform vec3 uCamUp;
  uniform vec3 uCamFwd;
  uniform float uTanHalfFov;
  uniform float uAspect;

  uniform int uPortalMode;
  uniform vec3 uPortalCenter;
  uniform vec3 uPortalNormal;
  uniform float uPortalRadius;
  uniform float uPortalSoft;
  uniform float uPortalRing;
  uniform vec3 uPortalColor;

  out vec4 outColor;

  void main() {
    float r2 = dot(vQuad, vQuad);
    if (r2 > 1.0) discard;
    // vQuad ∈ [-1,1] 对应 1σ 半径；在 1σ 处截断
    float g = exp(-1.5 * r2);
    float alpha = vColor.a * g * uOpacity;
    if (alpha < uAlphaCut) discard;

    vec3 col = vColor.rgb;

    if (uPortalMode != 0) {
      vec2 uv = gl_FragCoord.xy / uViewportPx;
      float ndcX = (uv.x * 2.0 - 1.0) * uTanHalfFov * uAspect;
      float ndcY = (uv.y * 2.0 - 1.0) * uTanHalfFov;
      vec3 dir = normalize(uCamFwd + uCamRight * ndcX + uCamUp * ndcY);

      float denom = dot(dir, uPortalNormal);
      float inside = 0.0;
      float ring = 0.0;
      if (abs(denom) > 1e-4) {
        float t = dot(uPortalCenter - uCamPos, uPortalNormal) / denom;
        if (t > 0.0) {
          vec3 hit = uCamPos + dir * t;
          float dist = length(hit - uPortalCenter);
          float edge = uPortalRadius;
          inside = 1.0 - smoothstep(edge - uPortalSoft, edge + uPortalSoft * 0.2, dist);
          ring = smoothstep(edge - uPortalSoft * 2.4, edge - uPortalSoft * 0.5, dist) * (1.0 - inside);
        }
      }

      if (uPortalMode == 1) {
        if (inside > 0.002) discard;
        col += uPortalColor * ring * uPortalRing;
      } else {
        if (inside < 0.998) discard;
      }
    }

    // 高光软膝：大量半透明高斯叠在一起时亮部会顶到 255 丢掉层次，
    // 这里在 0.75 以上做平滑压缩，保留纹理感。
    vec3 c = max(col, 0.0);
    vec3 knee = 0.72 + (1.0 - 0.72) * (1.0 - exp(-(c - 0.72) / (1.0 - 0.72)));
    c = mix(c, knee, step(0.72, c));
    outColor = vec4(c * alpha, alpha);
  }`;

  function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error('shader: ' + log);
    }
    return sh;
  }

  class SceneGL {
    constructor(gl, program, loc) {
      this.gl = gl;
      this.program = program;
      this.loc = loc;
      this.vao = gl.createVertexArray();
      this.buf = {};
      this.count = 0;
      this.ready = false;
      this.posArr = null;
    }

    upload(splat) {
      const gl = this.gl;
      const n = splat.count;
      this.count = n;
      this.posArr = splat.pos;

      const mk = (data) => {
        const b = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        return b;
      };

      const pos = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        pos[i * 4] = splat.pos[i * 3];
        pos[i * 4 + 1] = splat.pos[i * 3 + 1];
        pos[i * 4 + 2] = splat.pos[i * 3 + 2];
        pos[i * 4 + 3] = SplatGL.hash01(i * 2654435761);
      }
      const color = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        color[i * 4] = splat.color[i * 4] / 255;
        color[i * 4 + 1] = splat.color[i * 4 + 1] / 255;
        color[i * 4 + 2] = splat.color[i * 4 + 2] / 255;
        color[i * 4 + 3] = splat.color[i * 4 + 3] / 255;
      }

      this.buf.pos = mk(pos);
      this.buf.scale = mk(splat.scale);
      this.buf.quat = mk(splat.quat);
      this.buf.color = mk(color);
      this.srcPos = pos;
      this.srcScale = splat.scale.slice();
      this.srcQuat = splat.quat.slice();
      this.srcColor = color;

      gl.bindVertexArray(this.vao);
      const bind = (buf, loc, size) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(loc, 1);
      };
      bind(this.buf.pos, 0, 4);
      bind(this.buf.scale, 1, 3);
      bind(this.buf.quat, 2, 4);
      bind(this.buf.color, 3, 4);
      gl.bindVertexArray(null);

      // 排序索引：用 Uint32 索引缓冲 + drawElementsInstanced 的实例化索引
      // 这里改用「每帧重排 pos/scale/... 不可行」，因此使用实例属性的索引缓冲：
      // WebGL2 没有 instance ID 间接寻址，改为把排序结果写成一份索引，
      // 并用 drawArraysInstanced 的实例顺序天然为 0..n-1；排序通过重排属性缓冲实现成本高。
      // 折中：排序只在相机明显移动时重排一次，并把重排结果写入新的属性缓冲。
      this.sortOrder = new Uint32Array(n);
      this.depths = new Float32Array(n);
      this.buckets = new Uint16Array(n);
      this.counts = new Uint32Array(2048);
      this.starts = new Uint32Array(2048);
      this.ready = true;
      this.lastEye = null;
    }

    /* 排序后直接重排属性缓冲（每帧只在需要时做） */
    reorder(eye, fwd, limit) {
      const n = limit;
      // 必须从原始快照排序；posArr 会被重排覆盖，用它会导致顺序逐帧劣化
      const p = this.srcPos;
      const depths = this.depths;
      let minD = Infinity, maxD = -Infinity;
      // 视深排序（近在前）。相机背后的点给 1e6 排到最后。
      for (let i = 0; i < n; i++) {
        const dx = p[i * 4] - eye[0], dy = p[i * 4 + 1] - eye[1], dz = p[i * 4 + 2] - eye[2];
        const d = dx * fwd[0] + dy * fwd[1] + dz * fwd[2];
        depths[i] = d > 0 ? d : 1e6;
        if (d > 0) {
          if (d < minD) minD = d;
          if (d > maxD) maxD = d;
        }
      }
      if (!isFinite(minD)) { minD = 0; maxD = 1; }
      const B = 2048;
      const counts = this.counts;
      counts.fill(0);
      const span = Math.max(maxD - minD, 1e-5);
      const k = (B - 1) / span;
      const buckets = this.buckets;
      for (let i = 0; i < n; i++) {
        let b = ((depths[i] - minD) * k) | 0;
        if (b < 0) b = 0; else if (b >= B) b = B - 1;
        buckets[i] = b;
        counts[b]++;
      }
      // 前向 alpha 混合必须「由远到近」绘制：远桶先占位
      const starts = this.starts;
      let acc = 0;
      for (let b = B - 1; b >= 0; b--) { starts[b] = acc; acc += counts[b]; }
      const order = this.sortOrder;
      for (let i = 0; i < n; i++) {
        const b = buckets[i];
        order[starts[b]++] = i;
      }
      // 用 order 重排属性：写进 staging 数组再整体上传
      const gl = this.gl;
      const pos = this.stagingPos || (this.stagingPos = new Float32Array(this.count * 4));
      const scale = this.stagingScale || (this.stagingScale = new Float32Array(this.count * 3));
      const quat = this.stagingQuat || (this.stagingQuat = new Float32Array(this.count * 4));
      const color = this.stagingColor || (this.stagingColor = new Float32Array(this.count * 4));
      const srcPos = this.srcPos || (this.srcPos = new Float32Array(this.count * 4));
      const srcScale = this.srcScale || (this.srcScale = new Float32Array(this.count * 3));
      const srcQuat = this.srcQuat || (this.srcQuat = new Float32Array(this.count * 4));
      const srcColor = this.srcColor || (this.srcColor = new Float32Array(this.count * 4));
      if (!this.cached) {
        // 首次从 GPU 缓冲回读不现实，保存一份 CPU 副本
        this.cached = true;
      }
      for (let i = 0; i < n; i++) {
        const j = order[i];
        pos[i*4] = srcPos[j*4]; pos[i*4+1] = srcPos[j*4+1]; pos[i*4+2] = srcPos[j*4+2]; pos[i*4+3] = srcPos[j*4+3];
        scale[i*3] = srcScale[j*3]; scale[i*3+1] = srcScale[j*3+1]; scale[i*3+2] = srcScale[j*3+2];
        quat[i*4] = srcQuat[j*4]; quat[i*4+1] = srcQuat[j*4+1]; quat[i*4+2] = srcQuat[j*4+2]; quat[i*4+3] = srcQuat[j*4+3];
        color[i*4] = srcColor[j*4]; color[i*4+1] = srcColor[j*4+1]; color[i*4+2] = srcColor[j*4+2]; color[i*4+3] = srcColor[j*4+3];
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf.pos); gl.bufferSubData(gl.ARRAY_BUFFER, 0, pos);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf.scale); gl.bufferSubData(gl.ARRAY_BUFFER, 0, scale);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf.quat); gl.bufferSubData(gl.ARRAY_BUFFER, 0, quat);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf.color); gl.bufferSubData(gl.ARRAY_BUFFER, 0, color);
    }

    draw(view, limit) {
      const gl = this.gl;
      const n = Math.min(this.count, limit || this.count);
      if (!n) return;
      const { program, loc } = this;
      gl.useProgram(program);
      gl.bindVertexArray(this.vao);
      gl.uniformMatrix4fv(loc.uViewProj, false, view.viewProj);
      gl.uniformMatrix4fv(loc.uView, false, view.view);
      gl.uniform2f(loc.uViewportPx, view.widthPx, view.heightPx);
      gl.uniform1f(loc.uFocal, view.focalPx);
      gl.uniform1f(loc.uPointScale, view.pointScale);
      gl.uniform1f(loc.uMorph, view.morph);
      gl.uniform1f(loc.uMorphAmount, view.morphAmount);
      gl.uniform3fv(loc.uMorphCenter, view.morphCenter);
      gl.uniform1f(loc.uAlphaCut, view.alphaCut);
      gl.uniform1f(loc.uOpacity, view.opacity);
      gl.uniform1f(loc.uKernel, view.kernel);
      gl.uniform1f(loc.uMaxPointPx, view.maxPointPx || 24);
      gl.uniform1f(loc.uAlphaScale, view.alphaScale ?? 1);
      gl.uniform3fv(loc.uCamPos, view.eye);
      gl.uniform3fv(loc.uCamRight, view.right);
      gl.uniform3fv(loc.uCamUp, view.up);
      gl.uniform3fv(loc.uCamFwd, view.fwd);
      gl.uniform1f(loc.uTanHalfFov, view.tanHalfFov);
      gl.uniform1f(loc.uAspect, view.widthPx / view.heightPx);

      const p = view.portal;
      if (p) {
        gl.uniform1i(loc.uPortalMode, p.mode);
        gl.uniform3fv(loc.uPortalCenter, p.center);
        gl.uniform3fv(loc.uPortalNormal, p.normal);
        gl.uniform1f(loc.uPortalRadius, p.radius);
        gl.uniform1f(loc.uPortalSoft, p.soft);
        gl.uniform1f(loc.uPortalRing, p.ring);
        gl.uniform3fv(loc.uPortalColor, p.color);
      } else {
        gl.uniform1i(loc.uPortalMode, 0);
      }
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n);
      gl.bindVertexArray(null);
    }
  }

  function hash01(x) {
    x = (x ^ 61) ^ (x >>> 16);
    x = x + (x << 3);
    x = x ^ (x >>> 4);
    x = x * 0x27d4eb2d;
    x = x ^ (x >>> 15);
    return (x >>> 0) / 4294967295;
  }

  class RendererGL {
    constructor(canvas) {
      this.canvas = canvas;
      const gl = canvas.getContext('webgl2', {
        alpha: false, antialias: false, depth: false, stencil: false,
        powerPreference: 'high-performance', preserveDrawingBuffer: false,
        premultipliedAlpha: true,
      });
      if (!gl) throw new Error('WebGL2 不可用');
      this.gl = gl;
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

      const program = gl.createProgram();
      gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VS));
      gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error('link: ' + gl.getProgramInfoLog(program));
      }
      const loc = {};
      ['uOrder','uT0','uT1','uT2','uT3','uTexWidth','uCount','uViewProj','uView',
       'uViewportPx','uFocal','uPointScale','uMorph','uMorphAmount','uMorphCenter','uMaxPointPx','uAlphaScale','uFogStart','uFogRange',
       'uAlphaCut','uOpacity','uKernel','uCamPos','uCamRight','uCamUp','uCamFwd',
       'uTanHalfFov','uAspect','uPortalMode','uPortalCenter','uPortalNormal',
       'uPortalRadius','uPortalSoft','uPortalRing','uPortalColor']
        .forEach(n => { loc[n] = gl.getUniformLocation(program, n); });
      this.program = program;
      this.loc = loc;
      this.scenes = new Map();
    }

    get name() { return 'WebGL2'; }

    upload(slot, splat) {
      let s = this.scenes.get(slot);
      if (!s) { s = new SceneGL(this.gl, this.program, this.loc); this.scenes.set(slot, s); }
      s.upload(splat);
    }

    resize(w, h, dpr) {
      const c = this.canvas;
      const pw = Math.max(1, Math.round(w * dpr));
      const ph = Math.max(1, Math.round(h * dpr));
      if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; }
      this.width = w; this.height = h; this.dpr = dpr;
    }

    begin() {
      const gl = this.gl;
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(0.026, 0.025, 0.028, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    drawScene(slot, view, limit) {
      const s = this.scenes.get(slot);
      if (!s || !s.ready) return;
      const n = Math.min(s.count, limit || s.count);
      // 视角变化超过阈值才重排，避免每帧上传几十万点
      const le = s.lastEye;
      const moved = !le || Math.hypot(view.eye[0]-le[0], view.eye[1]-le[1], view.eye[2]-le[2]) > 0.02;
      if (moved) {
        s.reorder(view.eye, view.fwd, n);
        s.lastEye = view.eye.slice();
      }
      s.draw(view, n);
    }

    end() {}
  }

  global.SplatGL = { RendererGL, SceneGL, VS, FS, hash01 };
})(window);
