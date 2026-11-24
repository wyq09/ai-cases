import {
  clamp,
  lerp,
  fbm2D,
  mulberry32,
  v3Norm,
  v3Add,
  v3Sub,
  v3Scale,
  m4Identity,
  m4Mul,
  m4Translate,
  m4Scale,
  m4RotateX,
  m4RotateY,
  m4RotateZ,
  m4Perspective,
  m4Ortho,
  m4LookAt,
  m4NormalMat3,
  m4TransformPoint,
  solveTwoBoneIK2D,
} from './math3d.js';
import {
  BASE_PROPS,
  BEACONS,
  BOULDERS,
  getTerrainHeight,
} from './terrain.js';
import { BIKE_PARAMS, MAX_DUST } from './physics.js';
import {
  buildTerrainMesh,
  buildBikeFrameMesh,
  buildBikeForkMesh,
  buildBikeWheelMesh,
  buildBikeCrankMesh,
  buildPedalMesh,
  buildPelicanTorsoMesh,
  buildPelicanHeadMesh,
  buildPelicanPouchMesh,
  buildPelicanHelmetMesh,
  buildPelicanWingMesh,
  buildPelicanThighMesh,
  buildPelicanShinMesh,
  buildPelicanFootMesh,
  buildLanderMesh,
  buildFlagMesh,
  buildSolarArrayMesh,
  buildBoulderMesh,
  buildBeaconBaseMesh,
  buildBeaconBeamMesh,
  buildEarthMesh,
} from './mesh.js';

const SUN_DIR = v3Norm([0.72, 0.36, 0.59]);
const EARTH_DIR = v3Norm([0.20, 0.11, 0.97]);
const SHADOW_SIZE = 1024;
const MAX_TRACK_VERTS = 1200;

function compileShader(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('Shader error: ' + info);
  }
  return sh;
}

function createProgram(gl, vsSrc, fsSrc) {
  const prog = gl.createProgram();
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error('Program link error: ' + info);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

function createMeshGPU(gl, data) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const posBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, data.positions, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

  const normBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
  gl.bufferData(gl.ARRAY_BUFFER, data.normals, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

  const colBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
  gl.bufferData(gl.ARRAY_BUFFER, data.colors, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);

  const uvBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
  gl.bufferData(gl.ARRAY_BUFFER, data.uvs, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 0, 0);

  const idxBuf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.indices, gl.STATIC_DRAW);

  gl.bindVertexArray(null);
  return { vao, count: data.indices.length };
}

function createEarthTexture(gl) {
  const w = 512;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;

  for (let py = 0; py < h; py++) {
    const v = py / (h - 1);
    const lat = (0.5 - v) * Math.PI;
    const absLat = Math.abs(v - 0.5) * 2;
    for (let px = 0; px < w; px++) {
      const u = px / w;
      const lon = u * Math.PI * 2;
      const sx = Math.cos(lat) * Math.cos(lon);
      const sy = Math.sin(lat);
      const sz = Math.cos(lat) * Math.sin(lon);

      const cont = fbm2D(sx * 2.1 + sz * 1.4 + 4.2, sy * 2.4 - sx * 0.9 + 7.1, 4);
      const cloud = fbm2D(sx * 3.8 + 11.4, sz * 3.8 + sy * 2.1 - 3.3, 4);

      let r = 18, g = 68, b = 152;
      if (absLat > 0.82 - cont * 0.08) {
        r = 228;
        g = 236;
        b = 246;
      } else if (cont > 0.52) {
        const dry = clamp((cont - 0.52) * 4.5, 0, 1);
        r = lerp(52, 165, dry * 0.7);
        g = lerp(118, 148, dry * 0.7);
        b = lerp(58, 96, dry * 0.7);
      } else {
        const shallow = clamp((cont - 0.42) * 10, 0, 1);
        r = lerp(14, 34, shallow);
        g = lerp(58, 112, shallow);
        b = lerp(138, 184, shallow);
      }

      if (cloud > 0.54) {
        const ca = clamp((cloud - 0.54) * 2.6, 0, 0.88);
        r = lerp(r, 245, ca);
        g = lerp(g, 248, ca);
        b = lerp(b, 255, ca);
      }

      const idx = (py * w + px) * 4;
      d[idx] = r;
      d[idx + 1] = g;
      d[idx + 2] = b;
      d[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.generateMipmap(gl.TEXTURE_2D);
  return tex;
}

const SHADOW_VS = `#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uLightMVP;
void main() {
  gl_Position = uLightMVP * vec4(aPos, 1.0);
}`;

const SHADOW_FS = `#version 300 es
precision mediump float;
void main() {}`;

const TERRAIN_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
layout(location=2) in vec3 aCol;
layout(location=3) in vec2 aUv;

uniform mat4 uViewProj;
uniform mat4 uLightViewProj;

out vec3 vWorldPos;
out vec3 vNorm;
out vec3 vCol;
out vec4 vShadowCoord;

void main() {
  vWorldPos = aPos;
  vNorm = aNorm;
  vCol = aCol;
  vShadowCoord = uLightViewProj * vec4(aPos, 1.0);
  gl_Position = uViewProj * vec4(aPos, 1.0);
}`;

const TERRAIN_FS = `#version 300 es
precision highp float;
precision highp sampler2DShadow;

in vec3 vWorldPos;
in vec3 vNorm;
in vec3 vCol;
in vec4 vShadowCoord;

uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uEarthDir;
uniform vec3 uHeadPos;
uniform vec3 uHeadDir;
uniform float uEnvAir;
uniform sampler2DShadow uShadowMap;

out vec4 fragColor;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float sampleShadowPCF(vec4 sc, float ndotl) {
  vec3 proj = sc.xyz / sc.w;
  proj = proj * 0.5 + 0.5;
  if (proj.x < 0.01 || proj.x > 0.99 || proj.y < 0.01 || proj.y > 0.99 || proj.z > 0.999) {
    return 1.0;
  }
  float bias = max(0.0042 * (1.0 - ndotl), 0.0022);
  float texel = 1.0 / 1024.0;
  float sum = 0.0;
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      sum += texture(uShadowMap, vec3(proj.xy + vec2(float(x), float(y)) * texel, proj.z - bias));
    }
  }
  return sum / 9.0;
}

void main() {
  vec3 N = normalize(vNorm);
  float distCam = length(uCamPos - vWorldPos);
  float detailFade = 1.0 - smoothstep(18.0, 95.0, distCam);

  // High-frequency regolith grain micro-perturbation (consistent frequency finite difference)
  float g0 = vnoise(vWorldPos.xz * 3.8);
  float gx = vnoise(vWorldPos.xz * 3.8 + vec2(0.08, 0.0));
  float gz = vnoise(vWorldPos.xz * 3.8 + vec2(0.0, 0.08));
  float g2 = vnoise(vWorldPos.xz * 9.5);
  float micro = ((g0 * 0.65 + g2 * 0.35) - 0.5) * detailFade;
  vec3 microN = normalize(N + vec3(
    (g0 - gx) * 0.14 * detailFade,
    0.0,
    (g0 - gz) * 0.14 * detailFade
  ));

  vec3 V = normalize(uCamPos - vWorldPos);
  vec3 L = normalize(uSunDir);

  float mu0 = max(dot(microN, L), 0.0);
  float mu = max(dot(microN, V), 0.05);
  // Lommel-Seeliger lunar regolith photometric function + opposition surge
  float lommel = (mu0 / max(mu0 + mu, 0.04)) * 1.45;
  float phaseAngle = dot(L, V);
  float surge = 1.0 + 0.22 * pow(max(phaseAngle, 0.0), 6.0);

  float shadow = sampleShadowPCF(vShadowCoord, max(dot(N, L), 0.0));
  vec3 sunColor = mix(vec3(1.18, 1.15, 1.10), vec3(1.15, 1.08, 0.95), uEnvAir);
  vec3 albedo = vCol * (0.88 + micro * 0.24);

  // Sharp vacuum shadow vs faint cool Earthshine fill
  vec3 earthFill = mix(vec3(0.036, 0.058, 0.105), vec3(0.22, 0.30, 0.42), uEnvAir);
  float earthWrap = 0.5 + 0.5 * dot(microN, normalize(uEarthDir));
  vec3 ambient = albedo * earthFill * (0.45 + 0.55 * earthWrap);

  // Bike LED headlamp spotlight cone
  vec3 toFrag = vWorldPos - uHeadPos;
  float headDist = length(toFrag);
  vec3 headVec = toFrag / max(headDist, 0.001);
  float cone = smoothstep(0.84, 0.965, dot(headVec, normalize(uHeadDir)));
  float atten = 1.0 / (1.0 + 0.045 * headDist * headDist);
  vec3 headLight = albedo * vec3(1.15, 1.08, 0.92) * cone * atten * max(dot(microN, -headVec), 0.0) * 1.8;

  vec3 lit = ambient + albedo * sunColor * lommel * surge * shadow + headLight;

  // Subtle horizon fade only near world edge (more atmospheric in Earth mode)
  if (uEnvAir > 0.5) {
    float fog = smoothstep(35.0, 220.0, distCam);
    lit = mix(lit, vec3(0.46, 0.62, 0.85), fog * 0.72);
  } else {
    float edgeFade = smoothstep(175.0, 240.0, length(vWorldPos.xz));
    lit *= (1.0 - edgeFade * 0.75);
  }

  // ACES-lite filmic tone curve + gamma
  lit = lit / (lit + vec3(0.75));
  lit = pow(clamp(lit, 0.0, 1.0), vec3(1.0 / 2.2));
  fragColor = vec4(lit, 1.0);
}`;

const MESH_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
layout(location=2) in vec3 aCol;

uniform mat4 uModel;
uniform mat3 uNormalMat;
uniform mat4 uViewProj;
uniform mat4 uLightViewProj;

out vec3 vWorldPos;
out vec3 vNorm;
out vec3 vCol;
out vec4 vShadowCoord;

void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorldPos = wp.xyz;
  vNorm = normalize(uNormalMat * aNorm);
  vCol = aCol;
  vShadowCoord = uLightViewProj * wp;
  gl_Position = uViewProj * wp;
}`;

const MESH_FS = `#version 300 es
precision highp float;
precision highp sampler2DShadow;

in vec3 vWorldPos;
in vec3 vNorm;
in vec3 vCol;
in vec4 vShadowCoord;

uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uEarthDir;
uniform vec3 uTint;
uniform vec3 uEmissive;
uniform float uRoughness;
uniform float uMetalness;
uniform float uAlpha;
uniform float uEnvAir;
uniform sampler2DShadow uShadowMap;

out vec4 fragColor;

float sampleShadowPCF(vec4 sc) {
  vec3 proj = sc.xyz / sc.w;
  proj = proj * 0.5 + 0.5;
  if (proj.x < 0.01 || proj.x > 0.99 || proj.y < 0.01 || proj.y > 0.99 || proj.z > 0.999) {
    return 1.0;
  }
  float texel = 1.0 / 1024.0;
  float sum = 0.0;
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      sum += texture(uShadowMap, vec3(proj.xy + vec2(float(x), float(y)) * texel, proj.z - 0.0018));
    }
  }
  return sum / 9.0;
}

void main() {
  vec3 N = normalize(vNorm);
  vec3 V = normalize(uCamPos - vWorldPos);
  vec3 L = normalize(uSunDir);
  vec3 H = normalize(L + V);

  vec3 baseCol = vCol * uTint;
  float ndotl = max(dot(N, L), 0.0);
  float shadow = sampleShadowPCF(vShadowCoord);

  float specPower = mix(128.0, 10.0, uRoughness);
  float spec = pow(max(dot(N, H), 0.0), specPower) * mix(0.28, 1.15, uMetalness);
  vec3 specCol = mix(vec3(1.0), baseCol, uMetalness);

  vec3 earthFill = mix(vec3(0.04, 0.07, 0.13), vec3(0.24, 0.34, 0.48), uEnvAir);
  float earthWrap = 0.5 + 0.5 * dot(N, normalize(uEarthDir));
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.14;

  vec3 sunCol = vec3(1.22, 1.18, 1.12);
  vec3 lit = baseCol * earthFill * (0.5 + 0.5 * earthWrap)
           + (baseCol * ndotl + specCol * spec) * sunCol * shadow
           + earthFill * rim
           + uEmissive;

  lit = lit / (lit + vec3(0.75));
  lit = pow(clamp(lit, 0.0, 1.0), vec3(1.0 / 2.2));
  fragColor = vec4(lit, uAlpha);
}`;

const VISOR_FS = `#version 300 es
precision highp float;

in vec3 vWorldPos;
in vec3 vNorm;
in vec3 vCol;

uniform vec3 uCamPos;
uniform vec3 uSunDir;

out vec4 fragColor;

void main() {
  vec3 N = normalize(vNorm);
  vec3 V = normalize(uCamPos - vWorldPos);
  vec3 L = normalize(uSunDir);
  vec3 H = normalize(L + V);

  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 2.8);
  float sunGlint = pow(max(dot(N, H), 0.0), 96.0);

  vec3 glassCol = mix(vec3(0.60, 0.80, 0.98), vec3(1.0, 0.80, 0.36), fresnel);
  vec3 col = glassCol * (0.28 + fresnel * 0.85) + vec3(1.4, 1.35, 1.2) * sunGlint;
  float alpha = clamp(0.11 + fresnel * 0.44 + sunGlint * 0.55, 0.1, 0.82);

  col = col / (col + vec3(0.8));
  col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));
  fragColor = vec4(col, alpha);
}`;

const EARTH_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
layout(location=3) in vec2 aUv;

uniform mat4 uModel;
uniform mat4 uViewProj;

out vec3 vWorldPos;
out vec3 vNorm;
out vec2 vUv;

void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorldPos = wp.xyz;
  vNorm = normalize(mat3(uModel) * aNorm);
  vUv = aUv;
  gl_Position = uViewProj * wp;
}`;

const EARTH_FS = `#version 300 es
precision highp float;

in vec3 vWorldPos;
in vec3 vNorm;
in vec2 vUv;

uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform sampler2D uEarthTex;

out vec4 fragColor;

void main() {
  vec3 N = normalize(vNorm);
  vec3 V = normalize(uCamPos - vWorldPos);
  vec3 L = normalize(uSunDir);
  vec3 texCol = texture(uEarthTex, vUv).rgb;

  float ndotl = smoothstep(-0.08, 0.45, dot(N, L));
  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.2);
  vec3 atmo = vec3(0.28, 0.62, 1.0) * fresnel * (0.25 + 0.9 * ndotl);

  vec3 col = texCol * (0.04 + 1.15 * ndotl) + atmo;
  col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));
  fragColor = vec4(col, 1.0);
}`;

const STAR_VS = `#version 300 es
layout(location=0) in vec3 aDir;
layout(location=1) in vec3 aCol;
layout(location=2) in float aSize;

uniform mat4 uViewProj;
uniform vec3 uCamPos;
uniform float uEnvAir;

out vec3 vCol;
out float vAlpha;

void main() {
  vec4 pos = uViewProj * vec4(uCamPos + aDir * 350.0, 1.0);
  gl_Position = vec4(pos.xy, pos.w * 0.9999, pos.w);
  gl_PointSize = aSize;
  vCol = aCol;
  vAlpha = 1.0 - uEnvAir;
}`;

const STAR_FS = `#version 300 es
precision mediump float;
in vec3 vCol;
in float vAlpha;
out vec4 fragColor;
void main() {
  if (vAlpha <= 0.02) discard;
  vec2 c = gl_PointCoord - 0.5;
  float r2 = dot(c, c);
  if (r2 > 0.25) discard;
  float glow = smoothstep(0.25, 0.02, r2);
  fragColor = vec4(vCol * glow, glow * vAlpha);
}`;

const DUST_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in float aAge;
layout(location=2) in float aMaxAge;
layout(location=3) in float aSize;

uniform mat4 uViewProj;
uniform float uViewportH;

out float vLife;

void main() {
  if (aAge <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vLife = 0.0;
    return;
  }
  vec4 clip = uViewProj * vec4(aPos, 1.0);
  gl_Position = clip;
  float dist = max(clip.w, 0.5);
  gl_PointSize = clamp((aSize * uViewportH) / dist * 1.15, 1.5, 14.0);
  vLife = 1.0 - clamp(aAge / max(aMaxAge, 0.01), 0.0, 1.0);
}`;

const DUST_FS = `#version 300 es
precision mediump float;
in float vLife;
out vec4 fragColor;
void main() {
  if (vLife <= 0.01) discard;
  vec2 c = gl_PointCoord - 0.5;
  if (dot(c, c) > 0.25) discard;
  // Crisp sunlit regolith dust grains (not smoky cloud)
  fragColor = vec4(0.68, 0.67, 0.65, 0.85 * vLife);
}`;

const TRACK_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in float aAlpha;
uniform mat4 uViewProj;
out float vAlpha;
void main() {
  vAlpha = aAlpha;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}`;

const TRACK_FS = `#version 300 es
precision mediump float;
in float vAlpha;
out vec4 fragColor;
void main() {
  fragColor = vec4(0.14, 0.14, 0.15, vAlpha * 0.52);
}`;

export class WebGLRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    if (!gl) {
      throw new Error('WebGL2 is unavailable in this browser.');
    }
    this.gl = gl;
    this.width = 1;
    this.height = 1;
    this.dpr = 1;
    this.fps = 60;
    this._fpsAccum = 0;
    this._fpsFrames = 0;
    this._lastFpsTime = performance.now();

    this._initPrograms();
    this._initShadowMap();
    this._initMeshes();
    this._initStars();
    this._initDustBuffers();
    this._initTrackBuffers();
    this.earthTex = createEarthTexture(gl);
    this.resize();
  }

  _initPrograms() {
    const gl = this.gl;
    this.shadowProg = createProgram(gl, SHADOW_VS, SHADOW_FS);
    this.terrainProg = createProgram(gl, TERRAIN_VS, TERRAIN_FS);
    this.meshProg = createProgram(gl, MESH_VS, MESH_FS);
    this.visorProg = createProgram(gl, MESH_VS, VISOR_FS);
    this.earthProg = createProgram(gl, EARTH_VS, EARTH_FS);
    this.starProg = createProgram(gl, STAR_VS, STAR_FS);
    this.dustProg = createProgram(gl, DUST_VS, DUST_FS);
    this.trackProg = createProgram(gl, TRACK_VS, TRACK_FS);
  }

  _initShadowMap() {
    const gl = this.gl;
    this.shadowTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.DEPTH_COMPONENT24,
      SHADOW_SIZE,
      SHADOW_SIZE,
      0,
      gl.DEPTH_COMPONENT,
      gl.UNSIGNED_INT,
      null
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);

    this.shadowFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowTex, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  _initMeshes() {
    const gl = this.gl;
    this.meshes = {
      terrain: createMeshGPU(gl, buildTerrainMesh(172)),
      bikeFrame: createMeshGPU(gl, buildBikeFrameMesh()),
      bikeFork: createMeshGPU(gl, buildBikeForkMesh()),
      bikeWheel: createMeshGPU(gl, buildBikeWheelMesh()),
      bikeCrank: createMeshGPU(gl, buildBikeCrankMesh()),
      pedal: createMeshGPU(gl, buildPedalMesh()),
      pelicanTorso: createMeshGPU(gl, buildPelicanTorsoMesh()),
      pelicanHead: createMeshGPU(gl, buildPelicanHeadMesh()),
      pelicanPouch: createMeshGPU(gl, buildPelicanPouchMesh()),
      pelicanHelmet: createMeshGPU(gl, buildPelicanHelmetMesh()),
      pelicanWingL: createMeshGPU(gl, buildPelicanWingMesh(1)),
      pelicanWingR: createMeshGPU(gl, buildPelicanWingMesh(-1)),
      pelicanThigh: createMeshGPU(gl, buildPelicanThighMesh()),
      pelicanShin: createMeshGPU(gl, buildPelicanShinMesh()),
      pelicanFoot: createMeshGPU(gl, buildPelicanFootMesh()),
      lander: createMeshGPU(gl, buildLanderMesh()),
      flag: createMeshGPU(gl, buildFlagMesh()),
      solar: createMeshGPU(gl, buildSolarArrayMesh()),
      boulder: createMeshGPU(gl, buildBoulderMesh()),
      beaconBase: createMeshGPU(gl, buildBeaconBaseMesh()),
      beaconBeam: createMeshGPU(gl, buildBeaconBeamMesh()),
      earth: createMeshGPU(gl, buildEarthMesh()),
    };
  }

  _initStars() {
    const gl = this.gl;
    const count = 2000;
    const rng = mulberry32(991177);
    const dirs = new Float32Array(count * 3);
    const cols = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const u = rng() * 2 - 1;
      const theta = rng() * Math.PI * 2;
      const rHoriz = Math.sqrt(Math.max(0, 1 - u * u));
      dirs[i * 3] = rHoriz * Math.cos(theta);
      dirs[i * 3 + 1] = Math.abs(u) * 0.92 + 0.04;
      dirs[i * 3 + 2] = rHoriz * Math.sin(theta);

      const tint = rng();
      const bright = 0.45 + Math.pow(rng(), 2.2) * 0.65;
      if (tint < 0.25) {
        cols[i * 3] = 0.78 * bright;
        cols[i * 3 + 1] = 0.88 * bright;
        cols[i * 3 + 2] = 1.0 * bright;
      } else if (tint < 0.45) {
        cols[i * 3] = 1.0 * bright;
        cols[i * 3 + 1] = 0.92 * bright;
        cols[i * 3 + 2] = 0.78 * bright;
      } else {
        cols[i * 3] = bright;
        cols[i * 3 + 1] = bright;
        cols[i * 3 + 2] = bright;
      }
      sizes[i] = 1.8 + Math.pow(rng(), 2.6) * 3.4;
    }

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const bDir = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bDir);
    gl.bufferData(gl.ARRAY_BUFFER, dirs, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    const bCol = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bCol);
    gl.bufferData(gl.ARRAY_BUFFER, cols, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

    const bSize = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bSize);
    gl.bufferData(gl.ARRAY_BUFFER, sizes, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
    this.starVao = vao;
    this.starCount = count;
  }

  _initDustBuffers() {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    this.dustPosBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dustPosBuf);
    gl.bufferData(gl.ARRAY_BUFFER, MAX_DUST * 3 * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    this.dustAgeBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dustAgeBuf);
    gl.bufferData(gl.ARRAY_BUFFER, MAX_DUST * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);

    this.dustMaxAgeBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dustMaxAgeBuf);
    gl.bufferData(gl.ARRAY_BUFFER, MAX_DUST * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);

    this.dustSizeBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dustSizeBuf);
    gl.bufferData(gl.ARRAY_BUFFER, MAX_DUST * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
    this.dustVao = vao;
  }

  _initTrackBuffers() {
    const gl = this.gl;
    this.trackPosData = new Float32Array(MAX_TRACK_VERTS * 3);
    this.trackAlphaData = new Float32Array(MAX_TRACK_VERTS);
    this.trackCount = 0;
    this.trackHead = 0;
    this.lastTrackPos = null;

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    this.trackPosBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.trackPosBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.trackPosData.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    this.trackAlphaBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.trackAlphaBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.trackAlphaData.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
    this.trackVao = vao;
  }

  clearTracks() {
    this.trackCount = 0;
    this.trackHead = 0;
    this.lastTrackPos = null;
  }

  _recordTrackPoint(state) {
    if (!state.grounded) {
      this.lastTrackPos = null;
      return;
    }
    const rearX = state.x - Math.sin(state.heading) * (BIKE_PARAMS.wheelbase * 0.5);
    const rearZ = state.z - Math.cos(state.heading) * (BIKE_PARAMS.wheelbase * 0.5);
    const rearY = getTerrainHeight(rearX, rearZ) + 0.022;

    if (this.lastTrackPos) {
      const dx = rearX - this.lastTrackPos[0];
      const dz = rearZ - this.lastTrackPos[2];
      if (dx * dx + dz * dz < 0.09) return;
      const len = Math.hypot(dx, dz);
      const sx = (-dz / len) * 0.055;
      const sz = (dx / len) * 0.055;

      const p0 = [this.lastTrackPos[0] + sx, this.lastTrackPos[1], this.lastTrackPos[2] + sz];
      const p1 = [this.lastTrackPos[0] - sx, this.lastTrackPos[1], this.lastTrackPos[2] - sz];
      const p2 = [rearX + sx, rearY, rearZ + sz];
      const p3 = [rearX - sx, rearY, rearZ - sz];

      const verts = [p0, p1, p2, p1, p3, p2];
      for (let i = 0; i < 6; i++) {
        const idx = this.trackHead;
        this.trackHead = (idx + 1) % MAX_TRACK_VERTS;
        this.trackPosData[idx * 3] = verts[i][0];
        this.trackPosData[idx * 3 + 1] = verts[i][1];
        this.trackPosData[idx * 3 + 2] = verts[i][2];
        this.trackAlphaData[idx] = 0.85;
        if (this.trackCount < MAX_TRACK_VERTS) this.trackCount++;
      }
    }
    this.lastTrackPos = [rearX, rearY, rearZ];
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.width = w;
    this.height = h;
    this.dpr = dpr;
  }

  getStats() {
    return {
      fps: Math.round(this.fps),
      width: this.width,
      height: this.height,
      dpr: this.dpr,
      webgl2: true,
    };
  }

  _drawMesh(prog, mesh, modelMat, viewProj, lightVP, opts = {}) {
    const gl = this.gl;
    gl.useProgram(prog);
    const uModel = gl.getUniformLocation(prog, 'uModel');
    if (uModel) gl.uniformMatrix4fv(uModel, false, modelMat);
    const uNorm = gl.getUniformLocation(prog, 'uNormalMat');
    if (uNorm) gl.uniformMatrix3fv(uNorm, false, m4NormalMat3(modelMat));
    const uVP = gl.getUniformLocation(prog, 'uViewProj');
    if (uVP) gl.uniformMatrix4fv(uVP, false, viewProj);
    const uLVP = gl.getUniformLocation(prog, 'uLightViewProj');
    if (uLVP) gl.uniformMatrix4fv(uLVP, false, lightVP);

    if (opts.tint) gl.uniform3fv(gl.getUniformLocation(prog, 'uTint'), opts.tint);
    if (opts.emissive) gl.uniform3fv(gl.getUniformLocation(prog, 'uEmissive'), opts.emissive);
    if (opts.roughness !== undefined) gl.uniform1f(gl.getUniformLocation(prog, 'uRoughness'), opts.roughness);
    if (opts.metalness !== undefined) gl.uniform1f(gl.getUniformLocation(prog, 'uMetalness'), opts.metalness);
    if (opts.alpha !== undefined) gl.uniform1f(gl.getUniformLocation(prog, 'uAlpha'), opts.alpha);

    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
  }

  _drawShadowMesh(mesh, modelMat, lightVP) {
    const gl = this.gl;
    gl.useProgram(this.shadowProg);
    const mvp = m4Mul(lightVP, modelMat);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.shadowProg, 'uLightMVP'), false, mvp);
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
  }

  _computeRigMatrices(state) {
    const suspAvg = 0.5 * (state.suspRear + state.suspFront);
    const bikeY = state.y + BIKE_PARAMS.wheelRadius - suspAvg;

    const bikeWorld = m4Mul(
      m4Translate(state.x, bikeY, state.z),
      m4Mul(
        m4RotateY(state.heading),
        m4Mul(m4RotateZ(state.roll), m4RotateX(-state.pitch))
      )
    );

    const rearWheelMat = m4Mul(
      bikeWorld,
      m4Mul(m4Translate(0, 0, -0.59), m4RotateX(state.wheelRotRear))
    );

    const forkBase = m4Mul(
      bikeWorld,
      m4Mul(
        m4Translate(0, 0.43, 0.39),
        m4Mul(m4RotateX(-0.32), m4Mul(m4RotateY(state.steerAngle), m4RotateX(0.32)))
      )
    );

    // Front wheel local position relative to forkBase is (0, -0.43, 0.20)
    const frontWheelMat = m4Mul(
      forkBase,
      m4Mul(m4Translate(0, -0.43, 0.20), m4RotateX(state.wheelRotFront))
    );

    const crankMat = m4Mul(
      bikeWorld,
      m4Mul(m4Translate(0, -0.04, -0.14), m4RotateX(state.crankAngle))
    );

    // Pedals stay level in bike frame
    const pedalPosL = [0.14, -0.04 - Math.sin(state.crankAngle) * 0.16, -0.14 + Math.cos(state.crankAngle) * 0.16];
    const pedalPosR = [-0.14, -0.04 + Math.sin(state.crankAngle) * 0.16, -0.14 - Math.cos(state.crankAngle) * 0.16];
    const pedalLMat = m4Mul(bikeWorld, m4Translate(pedalPosL[0], pedalPosL[1], pedalPosL[2]));
    const pedalRMat = m4Mul(bikeWorld, m4Translate(pedalPosR[0], pedalPosR[1], pedalPosR[2]));

    // Pelican torso crouch & subtle cadence sway
    const crouchY = -state.crouchCharge * 0.08;
    const cadenceRock = Math.sin(state.crankAngle) * 0.035 * state.pedalLoad;
    const torsoLocal = m4Mul(
      m4Translate(0, 0.64 + crouchY, -0.32),
      m4RotateZ(cadenceRock)
    );
    const torsoMat = m4Mul(bikeWorld, torsoLocal);

    // Head looks into turn slightly
    const headLocal = m4Mul(
      torsoLocal,
      m4Mul(m4Translate(0, 0.51, 0.23), m4RotateY(state.steerAngle * 0.55))
    );
    const headMat = m4Mul(bikeWorld, headLocal);

    // Gular pouch bounces/floats with feltG (pouchOffset)
    const pouchMat = m4Mul(
      headMat,
      m4Mul(m4Translate(0, 0.065 + state.pouchOffset * 0.45, 0.095), m4RotateX(-state.pouchOffset * 2.5))
    );

    // Helmet encloses head & beak
    const helmetMat = headMat;

    // 2-bone IK for left & right legs
    const buildLegMats = (side, pedalPos) => {
      const hipX = side * 0.11;
      const hipY = 0.63 + crouchY;
      const hipZ = -0.29;
      const ik = solveTwoBoneIK2D(hipZ, hipY, pedalPos[2], pedalPos[1], 0.46, 0.46, 1);

      // Thigh built along +Z: map +Z to (0, sin(thighAngle), cos(thighAngle))
      // Since m4RotateX(rad) maps +Z to (0, -sin(rad), cos(rad)), use rad = -thighAngle!
      const thighLocal = m4Mul(m4Translate(hipX, hipY, hipZ), m4RotateX(-ik.thighAngle));
      const shinLocal = m4Mul(m4Translate(hipX, ik.kneeY, ik.kneeZ), m4RotateX(-ik.shinAngle));
      const footLocal = m4Translate(pedalPos[0], pedalPos[1] + 0.015, pedalPos[2]);
      return {
        thigh: m4Mul(bikeWorld, thighLocal),
        shin: m4Mul(bikeWorld, shinLocal),
        foot: m4Mul(bikeWorld, footLocal),
      };
    };
    const legL = buildLegMats(1, pedalPosL);
    const legR = buildLegMats(-1, pedalPosR);

    // Wings: reach handlebar grips when grounded, spread & flap dramatically in air
    const buildWingMat = (side) => {
      const shoulder = [side * 0.16, 0.64 + crouchY + 0.40, -0.32 + 0.19];
      let target;
      if (state.grounded) {
        const gripInFork = [side * 0.26, 0.17, -0.05];
        const forkToBike = m4Mul(
          m4Translate(0, 0.43, 0.39),
          m4Mul(m4RotateX(-0.32), m4Mul(m4RotateY(state.steerAngle), m4RotateX(0.32)))
        );
        target = m4TransformPoint(forkToBike, gripInFork);
      } else {
        const flapY = Math.sin(state.wingFlapPhase + (side > 0 ? 0 : 0.12)) * (0.28 * state.wingFlapBoost + 0.08);
        target = [side * 0.64, shoulder[1] + 0.12 + flapY, shoulder[2] + 0.12];
      }
      const dx = target[0] - shoulder[0];
      const dy = target[1] - shoulder[1];
      const dz = target[2] - shoulder[2];
      const horiz = Math.hypot(dx, dz);
      const yaw = Math.atan2(dx, dz);
      const pitch = -Math.atan2(dy, horiz);
      const dist = Math.hypot(dx, dy, dz);
      const stretch = clamp(dist / 0.64, 0.78, 1.15);
      const wingLocal = m4Mul(
        m4Translate(shoulder[0], shoulder[1], shoulder[2]),
        m4Mul(m4RotateY(yaw), m4Mul(m4RotateX(pitch), m4Scale(1, 1, stretch)))
      );
      return m4Mul(bikeWorld, wingLocal);
    };

    const wingLMat = buildWingMat(1);
    const wingRMat = buildWingMat(-1);

    const headWorldPos = m4TransformPoint(forkBase, [0, 0.13, 0.10]);
    const headTipPos = m4TransformPoint(forkBase, [0, 0.09, 1.10]);
    const headWorldDir = v3Norm(v3Sub(headTipPos, headWorldPos));

    return {
      bikeWorld,
      rearWheelMat,
      forkBase,
      frontWheelMat,
      crankMat,
      pedalLMat,
      pedalRMat,
      torsoMat,
      headMat,
      pouchMat,
      helmetMat,
      legL,
      legR,
      wingLMat,
      wingRMat,
      headWorldPos,
      headWorldDir,
    };
  }

  _drawRig(rig, viewProj, lightVP, shadowOnly = false) {
    const draw = (mesh, mat, opts) => {
      if (shadowOnly) {
        this._drawShadowMesh(mesh, mat, lightVP);
      } else {
        this._drawMesh(this.meshProg, mesh, mat, viewProj, lightVP, opts);
      }
    };

    const matte = { tint: [1, 1, 1], emissive: [0, 0, 0], roughness: 0.72, metalness: 0.05, alpha: 1 };
    const metal = { tint: [1, 1, 1], emissive: [0, 0, 0], roughness: 0.28, metalness: 0.75, alpha: 1 };
    const tire = { tint: [1, 1, 1], emissive: [0, 0, 0], roughness: 0.85, metalness: 0.05, alpha: 1 };

    draw(this.meshes.bikeFrame, rig.bikeWorld, metal);
    draw(this.meshes.bikeFork, rig.forkBase, metal);
    draw(this.meshes.bikeWheel, rig.rearWheelMat, tire);
    draw(this.meshes.bikeWheel, rig.frontWheelMat, tire);
    draw(this.meshes.bikeCrank, rig.crankMat, metal);
    draw(this.meshes.pedal, rig.pedalLMat, matte);
    draw(this.meshes.pedal, rig.pedalRMat, matte);

    draw(this.meshes.pelicanTorso, rig.torsoMat, matte);
    draw(this.meshes.pelicanHead, rig.headMat, matte);
    draw(this.meshes.pelicanPouch, rig.pouchMat, matte);
    draw(this.meshes.pelicanWingL, rig.wingLMat, matte);
    draw(this.meshes.pelicanWingR, rig.wingRMat, matte);
    draw(this.meshes.pelicanThigh, rig.legL.thigh, matte);
    draw(this.meshes.pelicanShin, rig.legL.shin, matte);
    draw(this.meshes.pelicanFoot, rig.legL.foot, matte);
    draw(this.meshes.pelicanThigh, rig.legR.thigh, matte);
    draw(this.meshes.pelicanShin, rig.legR.shin, matte);
    draw(this.meshes.pelicanFoot, rig.legR.foot, matte);
  }

  _drawWorldProps(state, time, viewProj, lightVP, shadowOnly = false) {
    const draw = (mesh, mat, opts) => {
      if (shadowOnly) {
        this._drawShadowMesh(mesh, mat, lightVP);
      } else {
        this._drawMesh(this.meshProg, mesh, mat, viewProj, lightVP, opts);
      }
    };

    // Base Camp props
    const landerH = getTerrainHeight(BASE_PROPS.lander.x, BASE_PROPS.lander.z);
    const landerMat = m4Mul(
      m4Translate(BASE_PROPS.lander.x, landerH - 0.03, BASE_PROPS.lander.z),
      m4RotateY(BASE_PROPS.lander.rotY)
    );
    draw(this.meshes.lander, landerMat, { tint: [1, 1, 1], emissive: [0, 0, 0], roughness: 0.35, metalness: 0.72, alpha: 1 });

    const flagH = getTerrainHeight(BASE_PROPS.flag.x, BASE_PROPS.flag.z);
    const flagMat = m4Mul(
      m4Translate(BASE_PROPS.flag.x, flagH - 0.02, BASE_PROPS.flag.z),
      m4RotateY(BASE_PROPS.flag.rotY)
    );
    draw(this.meshes.flag, flagMat, { tint: [1, 1, 1], emissive: [0, 0, 0], roughness: 0.55, metalness: 0.25, alpha: 1 });

    const solarH = getTerrainHeight(BASE_PROPS.solar.x, BASE_PROPS.solar.z);
    const solarMat = m4Mul(
      m4Translate(BASE_PROPS.solar.x, solarH - 0.02, BASE_PROPS.solar.z),
      m4RotateY(BASE_PROPS.solar.rotY)
    );
    draw(this.meshes.solar, solarMat, { tint: [1, 1, 1], emissive: [0, 0, 0], roughness: 0.25, metalness: 0.65, alpha: 1 });

    // Boulders
    for (let i = 0; i < BOULDERS.length; i++) {
      const b = BOULDERS[i];
      if (shadowOnly && Math.hypot(b.x - state.x, b.z - state.z) > 34) continue;
      const bh = getTerrainHeight(b.x, b.z);
      const bMat = m4Mul(
        m4Translate(b.x, bh + b.radius * b.scaleY * 0.45, b.z),
        m4Mul(m4RotateY(b.rotY), m4Mul(m4RotateX(b.rotX), m4Scale(b.radius, b.radius * b.scaleY, b.radius)))
      );
      draw(this.meshes.boulder, bMat, { tint: [b.tint, b.tint, b.tint], emissive: [0, 0, 0], roughness: 0.92, metalness: 0.02, alpha: 1 });
    }

    // Beacons
    for (let i = 0; i < BEACONS.length; i++) {
      const bc = BEACONS[i];
      const found = state.beaconsCollected.indexOf(bc.id) !== -1;
      const bh = getTerrainHeight(bc.x, bc.z);
      const mat = m4Mul(m4Translate(bc.x, bh, bc.z), m4RotateY(time * 0.6 + i));
      draw(this.meshes.beaconBase, mat, {
        tint: [1, 1, 1],
        emissive: found ? [0.12, 0.45, 0.22] : [0.08, 0.35, 0.55],
        roughness: 0.32,
        metalness: 0.65,
        alpha: 1,
      });
    }
  }

  render(state, camEye, camTarget, time) {
    const gl = this.gl;
    this.resize();
    this._recordTrackPoint(state);

    // FPS tracking
    const now = performance.now();
    this._fpsFrames++;
    this._fpsAccum += now - this._lastFpsTime;
    this._lastFpsTime = now;
    if (this._fpsAccum >= 400) {
      this.fps = (this._fpsFrames * 1000) / this._fpsAccum;
      this._fpsFrames = 0;
      this._fpsAccum = 0;
    }

    const isEarth = state.envId === 'earth';
    const envAir = isEarth ? 1.0 : 0.0;

    // Snap shadow frustum center to texel grid around bike to eliminate shadow crawl
    const shadowHalf = 26.0;
    const texelSize = (shadowHalf * 2) / SHADOW_SIZE;
    const snapX = Math.round(state.x / texelSize) * texelSize;
    const snapY = Math.round(state.y / texelSize) * texelSize;
    const snapZ = Math.round(state.z / texelSize) * texelSize;
    const shadowFocus = [snapX, snapY, snapZ];
    const lightEye = v3Add(shadowFocus, v3Scale(SUN_DIR, 42));
    const lightView = m4LookAt(lightEye, shadowFocus, [0, 1, 0]);
    const lightProj = m4Ortho(-shadowHalf, shadowHalf, -shadowHalf, shadowHalf, 4.0, 96.0);
    const lightVP = m4Mul(lightProj, lightView);

    const rig = this._computeRigMatrices(state);

    // 1. Shadow Pass (polygonOffset eliminates shadow-map surface acne)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
    gl.viewport(0, 0, SHADOW_SIZE, SHADOW_SIZE);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(2.5, 4.0);
    gl.clearDepth(1.0);
    gl.clear(gl.DEPTH_BUFFER_BIT);

    this._drawShadowMesh(this.meshes.terrain, m4Identity(), lightVP);
    this._drawRig(rig, lightVP, lightVP, true);
    this._drawWorldProps(state, time, lightVP, lightVP, true);
    gl.disable(gl.POLYGON_OFFSET_FILL);

    // 2. Main Render Pass
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    if (isEarth) {
      gl.clearColor(0.32, 0.50, 0.78, 1.0);
    } else {
      gl.clearColor(0.008, 0.012, 0.028, 1.0);
    }
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const aspect = this.width / Math.max(1, this.height);
    const fov = aspect < 0.85 ? (56 * Math.PI) / 180 : (48 * Math.PI) / 180;
    const proj = m4Perspective(fov, aspect, 0.15, 900);
    const view = m4LookAt(camEye, camTarget, [0, 1, 0]);
    const viewProj = m4Mul(proj, view);

    // 2a. Stars (drawn at far depth in vacuum)
    gl.disable(gl.CULL_FACE);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.useProgram(this.starProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.starProg, 'uViewProj'), false, viewProj);
    gl.uniform3fv(gl.getUniformLocation(this.starProg, 'uCamPos'), camEye);
    gl.uniform1f(gl.getUniformLocation(this.starProg, 'uEnvAir'), envAir);
    gl.bindVertexArray(this.starVao);
    gl.drawArrays(gl.POINTS, 0, this.starCount);
    gl.disable(gl.BLEND);
    gl.depthMask(true);

    // 2b. Distant Earth hanging in lunar sky (positioned relative to camera so zero parallax clipping)
    const earthPos = v3Add(camEye, v3Scale(EARTH_DIR, 420));
    const earthMat = m4Mul(
      m4Translate(earthPos[0], earthPos[1], earthPos[2]),
      m4Mul(m4RotateY(time * 0.018 + 1.2), m4Scale(16, 16, 16))
    );
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.useProgram(this.earthProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.earthProg, 'uModel'), false, earthMat);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.earthProg, 'uViewProj'), false, viewProj);
    gl.uniform3fv(gl.getUniformLocation(this.earthProg, 'uCamPos'), camEye);
    gl.uniform3fv(gl.getUniformLocation(this.earthProg, 'uSunDir'), SUN_DIR);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.earthTex);
    gl.uniform1i(gl.getUniformLocation(this.earthProg, 'uEarthTex'), 0);
    gl.bindVertexArray(this.meshes.earth.vao);
    gl.drawElements(gl.TRIANGLES, this.meshes.earth.count, gl.UNSIGNED_INT, 0);

    // Clear depth after sky backdrop so Earth & stars never occlude terrain!
    gl.clear(gl.DEPTH_BUFFER_BIT);

    // Bind shadow map on texture unit 1
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);

    // 2c. Lunar Terrain
    gl.useProgram(this.terrainProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.terrainProg, 'uViewProj'), false, viewProj);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.terrainProg, 'uLightViewProj'), false, lightVP);
    gl.uniform3fv(gl.getUniformLocation(this.terrainProg, 'uCamPos'), camEye);
    gl.uniform3fv(gl.getUniformLocation(this.terrainProg, 'uSunDir'), SUN_DIR);
    gl.uniform3fv(gl.getUniformLocation(this.terrainProg, 'uEarthDir'), EARTH_DIR);
    gl.uniform3fv(gl.getUniformLocation(this.terrainProg, 'uHeadPos'), rig.headWorldPos);
    gl.uniform3fv(gl.getUniformLocation(this.terrainProg, 'uHeadDir'), rig.headWorldDir);
    gl.uniform1f(gl.getUniformLocation(this.terrainProg, 'uEnvAir'), envAir);
    gl.uniform1i(gl.getUniformLocation(this.terrainProg, 'uShadowMap'), 1);
    gl.bindVertexArray(this.meshes.terrain.vao);
    gl.drawElements(gl.TRIANGLES, this.meshes.terrain.count, gl.UNSIGNED_INT, 0);

    // 2d. Tire tracks on regolith
    if (this.trackCount > 0) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      gl.useProgram(this.trackProg);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.trackProg, 'uViewProj'), false, viewProj);
      gl.bindVertexArray(this.trackVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.trackPosBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.trackPosData.subarray(0, this.trackCount * 3));
      gl.bindBuffer(gl.ARRAY_BUFFER, this.trackAlphaBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.trackAlphaData.subarray(0, this.trackCount));
      gl.drawArrays(gl.TRIANGLES, 0, this.trackCount);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.enable(gl.CULL_FACE);
    }

    // 2e. Common uniforms on MeshProg
    gl.useProgram(this.meshProg);
    gl.uniform3fv(gl.getUniformLocation(this.meshProg, 'uCamPos'), camEye);
    gl.uniform3fv(gl.getUniformLocation(this.meshProg, 'uSunDir'), SUN_DIR);
    gl.uniform3fv(gl.getUniformLocation(this.meshProg, 'uEarthDir'), EARTH_DIR);
    gl.uniform1f(gl.getUniformLocation(this.meshProg, 'uEnvAir'), envAir);
    gl.uniform1i(gl.getUniformLocation(this.meshProg, 'uShadowMap'), 1);

    // 2f. World props + Bike + Pelican
    this._drawWorldProps(state, time, viewProj, lightVP, false);
    this._drawRig(rig, viewProj, lightVP, false);

    // 2g. Translucent pass: Beacon plasma beams + Pelican glass helmet visor
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);

    // Beacon energy beams
    for (let i = 0; i < BEACONS.length; i++) {
      const bc = BEACONS[i];
      const found = state.beaconsCollected.indexOf(bc.id) !== -1;
      const bh = getTerrainHeight(bc.x, bc.z);
      const pulse = 0.85 + 0.15 * Math.sin(time * 3.0 + i);
      const mat = m4Mul(m4Translate(bc.x, bh, bc.z), m4Scale(pulse, 1, pulse));
      this._drawMesh(this.meshProg, this.meshes.beaconBeam, mat, viewProj, lightVP, {
        tint: found ? [0.22, 0.96, 0.56] : [0.22, 0.82, 1.0],
        emissive: found ? [0.18, 0.72, 0.40] : [0.16, 0.62, 0.92],
        roughness: 0.4,
        metalness: 0,
        alpha: found ? 0.16 : 0.34,
      });
    }

    // Pelican Glass Space Helmet Dome (renders over the head & beak cleanly)
    gl.useProgram(this.visorProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.visorProg, 'uModel'), false, rig.helmetMat);
    gl.uniformMatrix3fv(gl.getUniformLocation(this.visorProg, 'uNormalMat'), false, m4NormalMat3(rig.helmetMat));
    gl.uniformMatrix4fv(gl.getUniformLocation(this.visorProg, 'uViewProj'), false, viewProj);
    gl.uniform3fv(gl.getUniformLocation(this.visorProg, 'uCamPos'), camEye);
    gl.uniform3fv(gl.getUniformLocation(this.visorProg, 'uSunDir'), SUN_DIR);
    gl.bindVertexArray(this.meshes.pelicanHelmet.vao);
    gl.drawElements(gl.TRIANGLES, this.meshes.pelicanHelmet.count, gl.UNSIGNED_INT, 0);

    // 2h. Ballistic lunar dust particles
    gl.useProgram(this.dustProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.dustProg, 'uViewProj'), false, viewProj);
    gl.uniform1f(gl.getUniformLocation(this.dustProg, 'uViewportH'), this.height);
    gl.bindVertexArray(this.dustVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dustPosBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, state.dustPos);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dustAgeBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, state.dustAge);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dustMaxAgeBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, state.dustMaxAge);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dustSizeBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, state.dustSize);
    gl.drawArrays(gl.POINTS, 0, MAX_DUST);

    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }
}
