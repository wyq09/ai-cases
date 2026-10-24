(function (global) {
  'use strict';

  const SPLAT_VERTEX = `#version 300 es
  precision highp float;
  precision highp int;
  uniform sampler2D uPosition0;
  uniform sampler2D uPosition1;
  uniform sampler2D uPosition2;
  uniform sampler2D uNormals;
  uniform sampler2D uMeta;
  uniform sampler2D uOrder;
  uniform mat4 uView;
  uniform mat4 uViewProj;
  uniform vec2 uResolution;
  uniform vec2 uCenter;
  uniform float uFocal;
  uniform float uPointSize;
  uniform float uTime;
  uniform float uMorph;
  uniform float uMotion;
  uniform float uMaxSize;
  uniform float uBeat;
  uniform vec4 uAudio;
  uniform float uBands[32];
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform int uFrom;
  uniform int uTo;
  uniform int uTextureWidth;
  out vec4 vColor;
  out vec2 vQuad;

  vec3 positionAt(int form, ivec2 uv) {
    if (form == 0) return texelFetch(uPosition0, uv, 0).xyz;
    if (form == 1) return texelFetch(uPosition1, uv, 0).xyz;
    return texelFetch(uPosition2, uv, 0).xyz;
  }

  void main() {
    ivec2 orderUV = ivec2(gl_InstanceID % uTextureWidth, gl_InstanceID / uTextureWidth);
    int index = int(texelFetch(uOrder, orderUV, 0).r + 0.5);
    ivec2 uv = ivec2(index % uTextureWidth, index / uTextureWidth);
    vec4 normalSize = texelFetch(uNormals, uv, 0);
    vec4 meta = texelFetch(uMeta, uv, 0);
    vec3 pos = mix(positionAt(uFrom, uv), positionAt(uTo, uv), uMorph);
    float dust = meta.w;
    float live = 1.0 - dust;
    float energy = uBands[int(clamp(floor(meta.z * 32.0), 0.0, 31.0))];
    float bass = uAudio.x * live;
    float mid = uAudio.y * live;
    float high = uAudio.z * live;
    float phase = meta.x * 6.2831853;
    vec3 direction = normalize(pos + vec3(0.0001));
    if (live > 0.5 && bass + mid + high + uBeat > 0.0001) {
      float travelling = sin(length(pos.xz) * 9.0 - uTime * 3.2 + phase * 0.15);
      pos += direction * (bass * 0.18 + energy * 0.18 + uBeat * 0.13);
      pos.z += travelling * (mid * 0.11 + uBeat * 0.035);
      pos.y += sin(pos.x * 4.0 + pos.z * 3.0 + uTime * 1.8 + phase) * high * 0.07;
    }
    pos += normalSize.xyz * sin(uTime * 1.1 + phase * 5.0) * 0.014 * uMotion * live;
    pos *= 1.0 + bass * 0.055 + uBeat * 0.025 * live;

    vec4 clip = uViewProj * vec4(pos, 1.0);
    if (clip.w <= 0.1) {
      gl_Position = vec4(3.0, 3.0, 3.0, 1.0);
      vColor = vec4(0.0);
      vQuad = vec2(0.0);
      return;
    }
    vec3 eye = (uView * vec4(pos, 1.0)).xyz;
    float depth = max(-eye.z, 0.08);
    vec3 normal = normalize(mix(normalSize.xyz, direction, float(uTo == 2) * uMorph + float(uFrom == 2) * (1.0 - uMorph)));
    vec3 tangent = normalize(cross(normal, abs(normal.y) < 0.94 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    vec3 bitangent = normalize(cross(normal, tangent));
    float size = normalSize.w * uPointSize * (1.0 + energy * 0.65 + uBeat * 0.18 * live);
    mat3 covariance = mat3(tangent * size * 1.35, bitangent * size * 0.78, normal * size * 0.42);
    covariance = covariance * transpose(covariance);
    mat3 viewRotation = mat3(uView[0].xyz, uView[1].xyz, uView[2].xyz);
    mat3 viewCovariance = viewRotation * covariance * transpose(viewRotation);
    float invZ = 1.0 / depth;
    mat3 jacobian = mat3(
      vec3(uFocal * invZ, 0.0, 0.0),
      vec3(0.0, uFocal * invZ, 0.0),
      vec3(-uFocal * eye.x * invZ * invZ, -uFocal * eye.y * invZ * invZ, 0.0)
    );
    mat3 projected = jacobian * viewCovariance * transpose(jacobian);
    float a = projected[0][0] + 0.18;
    float b = projected[0][1];
    float c = projected[1][1] + 0.18;
    float middle = (a + c) * 0.5;
    float radius = sqrt(max(0.01, 0.25 * (a - c) * (a - c) + b * b));
    float lambda1 = middle + radius;
    float lambda2 = max(0.05, middle - radius);
    vec2 eigen = vec2(b, lambda1 - a);
    if (dot(eigen, eigen) < 0.000001) eigen = vec2(1.0, 0.0);
    eigen = normalize(eigen);
    vec2 axisX = eigen * min(sqrt(lambda1) * 1.8, uMaxSize);
    vec2 axisY = vec2(-eigen.y, eigen.x) * min(sqrt(lambda2) * 1.8, uMaxSize);
    vec2 corner;
    if (gl_VertexID == 0) corner = vec2(-1.0, -1.0);
    else if (gl_VertexID == 1) corner = vec2(1.0, -1.0);
    else if (gl_VertexID == 2) corner = vec2(-1.0, 1.0);
    else corner = vec2(1.0, 1.0);
    vec2 ndc = clip.xy / clip.w + uCenter;
    vec2 delta = (axisX * corner.x + axisY * corner.y) * 2.0 / uResolution;
    gl_Position = vec4(ndc + delta, 0.0, 1.0);
    vQuad = corner;
    vec3 viewNormal = normalize(viewRotation * normal);
    vec3 light = normalize(vec3(-0.45, 0.75, 0.60));
    vec3 viewDirection = normalize(-eye);
    float diffuse = 0.52 + 0.48 * max(dot(viewNormal, light), 0.0);
    float specular = pow(max(dot(reflect(-light, viewNormal), viewDirection), 0.0), 18.0);
    float rim = pow(1.0 - abs(dot(viewNormal, viewDirection)), 2.0);
    float depthShade = clamp(1.18 - (depth - 5.0) * 0.12, 0.55, 1.1);
    vec3 color = mix(uColorB, uColorA, meta.y);
    color *= (0.65 + meta.x * 0.32 + energy * 0.55 + uBeat * 0.25 * live) * diffuse * depthShade;
    if (dust > 0.5) {
      color = mix(vec3(0.50, 0.62, 0.58), uColorB, 0.25);
    } else {
      color += vec3(0.88, 1.0, 0.76) * specular * 0.42 + color * rim * 0.12;
    }
    float fog = exp(-max(depth - 9.0, 0.0) * 0.11);
    float alpha = dust > 0.5 ? 0.08 + meta.x * 0.19 : 0.24 + meta.x * 0.26;
    vColor = vec4(color * mix(0.4, 1.0, fog), alpha);
  }`;

  const SPLAT_FRAGMENT = `#version 300 es
  precision highp float;
  in vec4 vColor;
  in vec2 vQuad;
  out vec4 outColor;
  void main() {
    float r2 = dot(vQuad, vQuad);
    if (r2 > 1.0) discard;
    float gaussian = exp(-3.4 * r2) - 0.03337;
    float alpha = vColor.a * gaussian;
    if (alpha < 0.002) discard;
    outColor = vec4(vColor.rgb * alpha, alpha);
  }`;

  const SCREEN_VERTEX = `#version 300 es
  precision highp float;
  out vec2 vUV;
  void main() {
    vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    vUV = p;
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  }`;

  const BLOOM_FRAGMENT = `#version 300 es
  precision highp float;
  uniform sampler2D uImage;
  uniform vec2 uDirection;
  uniform float uExtract;
  in vec2 vUV;
  out vec4 outColor;
  vec3 sampleLight(vec2 uv) {
    vec3 color = texture(uImage, uv).rgb;
    return mix(color, max(color - vec3(0.28), vec3(0.0)), uExtract);
  }
  void main() {
    vec3 color = sampleLight(vUV) * 0.227027;
    color += sampleLight(vUV + uDirection * 1.384615) * 0.316216;
    color += sampleLight(vUV - uDirection * 1.384615) * 0.316216;
    color += sampleLight(vUV + uDirection * 3.230769) * 0.070270;
    color += sampleLight(vUV - uDirection * 3.230769) * 0.070270;
    outColor = vec4(color, 1.0);
  }`;

  const COMPOSITE_FRAGMENT = `#version 300 es
  precision highp float;
  uniform sampler2D uScene;
  uniform sampler2D uBloom;
  uniform vec3 uColorA;
  uniform float uTime;
  uniform float uBeat;
  uniform float uBeatAge;
  uniform float uGrain;
  in vec2 vUV;
  out vec4 outColor;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec3 scene = texture(uScene, vUV).rgb;
    vec3 bloom = texture(uBloom, vUV).rgb;
    vec3 color = scene + bloom * 0.43;
    vec2 p = (vUV - 0.5) * vec2(1.0, 0.86);
    float radius = length(p);
    float ringRadius = uBeatAge * 0.62;
    float ring = exp(-pow((radius - ringRadius) * 65.0, 2.0)) * uBeat;
    color += uColorA * ring * 0.028;
    color = vec3(1.0) - exp(-color * 1.16);
    float vignette = 1.0 - smoothstep(0.15, 0.80, radius) * 0.42;
    color = pow(max(color, vec3(0.0)), vec3(0.91)) * vignette;
    color += (hash(gl_FragCoord.xy + fract(uTime) * 31.0) - 0.5) * 0.009 * uGrain;
    outColor = vec4(color, 1.0);
  }`;

  function shader(gl, type, source) {
    const result = gl.createShader(type);
    gl.shaderSource(result, source);
    gl.compileShader(result);
    if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(result);
      gl.deleteShader(result);
      throw new Error('着色器编译失败：' + log);
    }
    return result;
  }

  function program(gl, vertex, fragment) {
    const result = gl.createProgram();
    const vs = shader(gl, gl.VERTEX_SHADER, vertex);
    const fs = shader(gl, gl.FRAGMENT_SHADER, fragment);
    gl.attachShader(result, vs);
    gl.attachShader(result, fs);
    gl.linkProgram(result);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(result, gl.LINK_STATUS)) {
      throw new Error('着色器链接失败：' + gl.getProgramInfoLog(result));
    }
    return result;
  }

  function uniforms(gl, program, names) {
    const result = {};
    names.forEach((name) => { result[name] = gl.getUniformLocation(program, name); });
    return result;
  }

  class Renderer {
    constructor(canvas, geometry) {
      this.canvas = canvas;
      this.geometry = geometry;
      this.gl = canvas.getContext('webgl2', {
        alpha: false, antialias: false, depth: false, stencil: false,
        powerPreference: 'high-performance', preserveDrawingBuffer: false,
        premultipliedAlpha: true,
      });
      if (!this.gl) throw new Error('当前浏览器不支持 WebGL2，无法呈现三维高斯。请使用新版 Safari、Chrome 或 Edge。');
      const gl = this.gl;
      this.textureWidth = 1024;
      this.textureHeight = Math.ceil(geometry.count / this.textureWidth);
      this.splatProgram = program(gl, SPLAT_VERTEX, SPLAT_FRAGMENT);
      this.bloomProgram = program(gl, SCREEN_VERTEX, BLOOM_FRAGMENT);
      this.compositeProgram = program(gl, SCREEN_VERTEX, COMPOSITE_FRAGMENT);
      this.splatUniforms = uniforms(gl, this.splatProgram, [
        'uPosition0', 'uPosition1', 'uPosition2', 'uNormals', 'uMeta', 'uOrder',
        'uView', 'uViewProj', 'uResolution', 'uCenter', 'uFocal', 'uPointSize',
        'uTime', 'uMorph', 'uMotion', 'uMaxSize', 'uBeat', 'uAudio', 'uBands[0]',
        'uColorA', 'uColorB', 'uFrom', 'uTo', 'uTextureWidth',
      ]);
      this.bloomUniforms = uniforms(gl, this.bloomProgram, ['uImage', 'uDirection', 'uExtract']);
      this.compositeUniforms = uniforms(gl, this.compositeProgram, [
        'uScene', 'uBloom', 'uColorA', 'uTime', 'uBeat', 'uBeatAge', 'uGrain',
      ]);
      this.vao = gl.createVertexArray();
      this.textures = geometry.positions.map((data) => this.dataTexture(data, gl.RGBA));
      this.normalTexture = this.dataTexture(geometry.normals, gl.RGBA);
      this.metaTexture = this.dataTexture(geometry.meta, gl.RGBA);
      this.order = new Float32Array(this.textureWidth * this.textureHeight);
      this.depth = new Float32Array(geometry.count);
      this.bucket = new Uint16Array(geometry.count);
      this.counts = new Uint32Array(1024);
      this.starts = new Uint32Array(1024);
      this.orderTexture = this.dataTexture(this.order, gl.RED);
      this.bandData = new Float32Array(32);
      this.targets = [];
      this.frame = 0;
      this.visibleCount = geometry.count;
      this.sortMs = 0;
      this.lastSortFrame = -10;
      this.lastEye = null;
      this.lastFeatures = null;
      this.hdr = Boolean(gl.getExtension('EXT_color_buffer_float'));
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.DITHER);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    }

    dataTexture(data, format) {
      const gl = this.gl;
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const channels = format === gl.RED ? 1 : 4;
      const required = this.textureWidth * this.textureHeight * channels;
      if (data.length < required) {
        const padded = new Float32Array(required);
        padded.set(data);
        data = padded;
      }
      gl.texImage2D(gl.TEXTURE_2D, 0, format === gl.RED ? gl.R32F : gl.RGBA32F,
        this.textureWidth, this.textureHeight, 0, format, gl.FLOAT, data);
      return texture;
    }

    target(width, height) {
      const gl = this.gl;
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, this.hdr ? gl.RGBA16F : gl.RGBA8,
        width, height, 0, gl.RGBA, this.hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error('无法建立高斯渲染帧缓冲。');
      }
      return { texture, framebuffer, width, height };
    }

    resize(width, height, dpr) {
      const pixelWidth = Math.max(1, Math.round(width * dpr));
      const pixelHeight = Math.max(1, Math.round(height * dpr));
      this.width = width;
      this.height = height;
      this.dpr = dpr;
      if (this.canvas.width === pixelWidth && this.canvas.height === pixelHeight && this.scene) return;
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
      this.targets.forEach((target) => {
        this.gl.deleteTexture(target.texture);
        this.gl.deleteFramebuffer(target.framebuffer);
      });
      try {
        this.scene = this.target(pixelWidth, pixelHeight);
      } catch (error) {
        if (!this.hdr) throw error;
        this.hdr = false;
        this.scene = this.target(pixelWidth, pixelHeight);
      }
      this.bloomA = this.target(Math.max(1, Math.ceil(pixelWidth / 3)), Math.max(1, Math.ceil(pixelHeight / 3)));
      this.bloomB = this.target(this.bloomA.width, this.bloomA.height);
      this.targets = [this.scene, this.bloomA, this.bloomB];
      this.lastEye = null;
    }

    bindTexture(texture, unit) {
      const gl = this.gl;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
    }

    sort(eye, forward, limit) {
      const start = performance.now();
      const count = Math.min(limit, this.geometry.count);
      const positions = this.geometry.positions[0];
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < count; i++) {
        const offset = i * 4;
        const value = (positions[offset] - eye[0]) * forward[0]
          + (positions[offset + 1] - eye[1]) * forward[1]
          + (positions[offset + 2] - eye[2]) * forward[2];
        this.depth[i] = value > 0 ? value : 1000000;
        if (value > 0) { min = Math.min(min, value); max = Math.max(max, value); }
      }
      if (!Number.isFinite(min)) { min = 0; max = 1; }
      const scale = 1023 / Math.max(max - min, 0.00001);
      this.counts.fill(0);
      for (let i = 0; i < count; i++) {
        const bucket = Math.max(0, Math.min(1023, Math.floor((this.depth[i] - min) * scale)));
        this.bucket[i] = bucket;
        this.counts[bucket]++;
      }
      let offset = 0;
      for (let i = 1023; i >= 0; i--) {
        this.starts[i] = offset;
        offset += this.counts[i];
      }
      for (let i = 0; i < count; i++) {
        this.order[this.starts[this.bucket[i]]++] = i;
      }
      this.bindTexture(this.orderTexture, 5);
      this.gl.texSubImage2D(this.gl.TEXTURE_2D, 0, 0, 0, this.textureWidth,
        this.textureHeight, this.gl.RED, this.gl.FLOAT, this.order);
      this.sortMs = performance.now() - start;
      this.lastEye = eye.slice();
    }

    pass(program, target, setup) {
      const gl = this.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
      gl.viewport(0, 0, target ? target.width : this.canvas.width, target ? target.height : this.canvas.height);
      gl.useProgram(program);
      setup();
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    draw(view, features) {
      const gl = this.gl;
      if (!this.scene) return;
      const limit = Math.max(1024, Math.min(this.geometry.count, Math.round(view.limit || this.geometry.count)));
      this.visibleCount = limit;
      const moved = !this.lastEye || Math.hypot(...this.lastEye.map((v, i) => v - view.eye[i])) > 0.005;
      if (moved || this.frame - this.lastSortFrame >= 8 || limit !== this.lastLimit) {
        this.sort(view.eye, view.fwd, limit);
        this.lastSortFrame = this.frame;
        this.lastLimit = limit;
      }
      this.bandData.set(features.bands || this.bandData);
      this.lastFeatures = { ...features };
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.scene.framebuffer);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(0.005, 0.007, 0.006, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this.splatProgram);
      gl.bindVertexArray(this.vao);
      [this.textures[0], this.textures[1], this.textures[2], this.normalTexture, this.metaTexture, this.orderTexture]
        .forEach((texture, i) => this.bindTexture(texture, i));
      const u = this.splatUniforms;
      ['uPosition0', 'uPosition1', 'uPosition2', 'uNormals', 'uMeta', 'uOrder']
        .forEach((name, i) => gl.uniform1i(u[name], i));
      gl.uniformMatrix4fv(u.uView, false, view.view);
      gl.uniformMatrix4fv(u.uViewProj, false, view.viewProj);
      gl.uniform2f(u.uResolution, this.canvas.width, this.canvas.height);
      gl.uniform2fv(u.uCenter, view.center);
      gl.uniform1f(u.uFocal, view.focalPx);
      gl.uniform1f(u.uPointSize, view.pointSize);
      gl.uniform1f(u.uTime, view.time);
      gl.uniform1f(u.uMorph, view.morph);
      gl.uniform1f(u.uMotion, view.motion);
      gl.uniform1f(u.uMaxSize, view.maxSize || 30);
      gl.uniform1f(u.uBeat, features.envelope || 0);
      gl.uniform4f(u.uAudio, features.bass || 0, features.mid || 0, features.high || 0, features.level || 0);
      gl.uniform1fv(u['uBands[0]'], this.bandData);
      gl.uniform3fv(u.uColorA, view.palette[0]);
      gl.uniform3fv(u.uColorB, view.palette[1]);
      gl.uniform1i(u.uFrom, view.from);
      gl.uniform1i(u.uTo, view.to);
      gl.uniform1i(u.uTextureWidth, this.textureWidth);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, limit);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);

      this.pass(this.bloomProgram, this.bloomA, () => {
        this.bindTexture(this.scene.texture, 0);
        gl.uniform1i(this.bloomUniforms.uImage, 0);
        gl.uniform2f(this.bloomUniforms.uDirection, 1 / this.bloomA.width, 0);
        gl.uniform1f(this.bloomUniforms.uExtract, 1);
      });
      this.pass(this.bloomProgram, this.bloomB, () => {
        this.bindTexture(this.bloomA.texture, 0);
        gl.uniform1i(this.bloomUniforms.uImage, 0);
        gl.uniform2f(this.bloomUniforms.uDirection, 0, 1 / this.bloomA.height);
        gl.uniform1f(this.bloomUniforms.uExtract, 0);
      });
      this.pass(this.compositeProgram, null, () => {
        this.bindTexture(this.scene.texture, 0);
        this.bindTexture(this.bloomB.texture, 1);
        gl.uniform1i(this.compositeUniforms.uScene, 0);
        gl.uniform1i(this.compositeUniforms.uBloom, 1);
        gl.uniform3fv(this.compositeUniforms.uColorA, view.palette[0]);
        gl.uniform1f(this.compositeUniforms.uTime, view.time);
        gl.uniform1f(this.compositeUniforms.uBeat, features.envelope || 0);
        gl.uniform1f(this.compositeUniforms.uBeatAge, features.beatAge || 1);
        gl.uniform1f(this.compositeUniforms.uGrain, view.motion > 0.5 ? 1 : 0.3);
      });
      this.frame++;
    }

    info() {
      return {
        backend: 'WebGL2', generated: this.geometry.count, visible: this.visibleCount,
        sortMs: this.sortMs, hdr: this.hdr, frame: this.frame,
        width: this.canvas.width, height: this.canvas.height,
        bands: Array.from(this.bandData), features: this.lastFeatures,
      };
    }
  }

  global.PulseRenderer = { Renderer, SPLAT_VERTEX, SPLAT_FRAGMENT };
})(window);
