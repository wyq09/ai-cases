/* 鹈鹕骑车 · 月面世界 —— 渲染层：地形 LOD 网格与着色器、天空（星空 / 地球 / 太阳）、
 * 光照与阴影、岩石、车辙、月尘、知识牌、营地。
 *
 * 视觉上同样守物理：
 *  · 没有大气 → 天空永远是黑的、没有雾、远景同样清晰；星星不闪烁；太阳是一枚刺眼的白盘，没有光晕散射
 *  · 影子锐利（太阳角直径只有 0.5°），影子里只剩"月面反光"（从下方来的补光）和极弱的地球照
 *  · 太阳颜色不变红：月面日落不会像地球那样变暖，只是光照面积缩到零
 *  · 地形自阴影用高度场沿太阳方向步进求交，所以远处坑壁的長影子也有；月面曲率让地平线更近
 *  · 月壤被扬起后走抛物线，不留烟尘；车辙不会被抹掉 */
(function () {
  'use strict';
  window.PM = window.PM || {};
  var PM = window.PM, T = PM.TERRAIN, S = PM.SIM;
  var MOON_R = 1737400;            // m
  var SUN_I = 7.0;                 // 太阳方向光强度（决定曝光基准：太阳高度 22° 时平地约 175/255，向阳坡不溢出）
  var ALBEDO = 0.27;               // 月壤反照率（渲染取值；真实约 0.12，按相机观感提亮）
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var smooth = function (a, b, x) { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };

  /* ───────── float32 → float16 位模式（DataTexture 用） ───────── */
  var _fb = new ArrayBuffer(4), _f32 = new Float32Array(_fb), _u32 = new Uint32Array(_fb);
  function f2h(v) {
    _f32[0] = v;
    var x = _u32[0], s = (x >>> 16) & 0x8000, e = (x >>> 23) & 0xff, m = x & 0x7fffff;
    if (e > 142) return s | 0x7c00;                    // 溢出 / inf / NaN
    if (e < 113) return s;                             // 下溢
    return s | ((e - 112) << 10) | (m >>> 13);
  }

  /* ───────── 哈希 / 周期值噪声（贴图用） ───────── */
  function hash3(i, j, k) {
    var h = Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(j | 0, 0x165667b1) ^ Math.imul(k | 0, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  }
  function noise3(x, y, z) {                           // 三维值噪声（地球贴图用，球面无缝）
    var i = Math.floor(x), j = Math.floor(y), k = Math.floor(z), fx = x - i, fy = y - j, fz = z - k;
    var sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
    function c(a, b) { return hash3(i + a, j + b, k) + (hash3(i + 1 + a, j + b, k) - hash3(i + a, j + b, k)) * sx; }
    var u0 = c(0, 0) + (c(0, 1) - c(0, 0)) * sy, u1 = c(1, 0) + (c(1, 1) - c(1, 0)) * sy;
    return u0 + (u1 - u0) * sz;
  }
  function fbm3(x, y, z, oct) {
    var a = 0.5, s = 0, n = 0;
    for (var o = 0; o < oct; o++) { s += a * noise3(x, y, z); n += a; a *= 0.5; x *= 2.03; y *= 2.03; z *= 2.03; }
    return s / n;
  }
  function pnoise2(u, v, per, seed) {                  // 周期值噪声：u,v ∈ [0,1)，per = 格点数
    var x = u * per, y = v * per, i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    var sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    function h(a, b) { return hash3((i + a) % per, (j + b) % per, seed); }
    var u0 = h(0, 0) + (h(1, 0) - h(0, 0)) * sx, u1 = h(0, 1) + (h(1, 1) - h(0, 1)) * sx;
    return u0 + (u1 - u0) * sy;
  }
  function pfbm(u, v, per, oct, seed) {
    var a = 0.5, s = 0, n = 0;
    for (var o = 0; o < oct; o++) { s += a * pnoise2(u, v, per, seed + o * 17); n += a; a *= 0.5; per *= 2; }
    return s / n;
  }

  function canvasTex(w, h, draw, opts) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    var t = new THREE.CanvasTexture(c);
    opts = opts || {};
    if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    t.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    t.anisotropy = opts.aniso || 4;
    if (opts.mips !== false) t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  }

  /* ───────── 程序化贴图 ───────── */
  function makeTextures(renderer) {
    var aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    var tx = {};

    // 柔和圆点：月尘粒子 / 太阳光斑
    tx.soft = canvasTex(64, 64, function (g) {
      var gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    }, { mips: false });

    // 月壤细节（周期）：R 低频明暗 / G 高频颗粒 / BA 微起伏梯度。
    // 梯度幅度只给 ±0.06 左右的坡度：月壤在分米尺度上是光滑细粉，而太阳只有二十几度高，
    // 法线偏过 20° 就会整片背光发黑
    var N = 256, img = new Uint8Array(N * N * 4), hgt = new Float32Array(N * N);
    for (var j = 0; j < N; j++) for (var i = 0; i < N; i++) {
      var u = i / N, v = j / N;
      hgt[j * N + i] = pfbm(u, v, 8, 3, 300) + 0.35 * pfbm(u, v, 32, 2, 410);
    }
    for (j = 0; j < N; j++) for (i = 0; i < N; i++) {
      var gx = (hgt[j * N + (i + 1) % N] - hgt[j * N + (i + N - 1) % N]) * 0.25;
      var gz = (hgt[((j + 1) % N) * N + i] - hgt[((j + N - 1) % N) * N + i]) * 0.25;
      var o = (j * N + i) * 4;
      img[o] = 255 * clamp(pfbm(i / N, j / N, 4, 3, 100), 0, 1);
      img[o + 1] = 255 * clamp(pfbm(i / N, j / N, 64, 2, 200), 0, 1);
      img[o + 2] = 255 * clamp(0.5 + gx, 0, 1);
      img[o + 3] = 255 * clamp(0.5 + gz, 0, 1);
    }
    tx.detail = new THREE.DataTexture(img, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
    tx.detail.wrapS = tx.detail.wrapT = THREE.RepeatWrapping;
    tx.detail.magFilter = THREE.LinearFilter; tx.detail.minFilter = THREE.LinearMipmapLinearFilter;
    tx.detail.generateMipmaps = true; tx.detail.colorSpace = THREE.NoColorSpace; tx.detail.anisotropy = aniso;
    tx.detail.needsUpdate = true;

    // 地球（等距圆柱）：程序化大陆 / 海洋 / 冰盖
    var EW = 512, EH = 256, eimg = new Uint8Array(EW * EH * 4);
    for (j = 0; j < EH; j++) {
      var lat = (0.5 - j / EH) * Math.PI;
      for (i = 0; i < EW; i++) {
        var lon = (i / EW) * 2 * Math.PI;
        var px = Math.cos(lat) * Math.cos(lon), py = Math.sin(lat), pz = Math.cos(lat) * Math.sin(lon);
        var n = fbm3(px * 2.1 + 5, py * 2.1 + 3, pz * 2.1 + 7, 5);
        var fine = fbm3(px * 9 + 1, py * 9, pz * 9 + 2, 3);
        var r, g, b, land = n + 0.12 * (fine - 0.5);
        var ice = smooth(1.15, 1.38, Math.abs(lat) + 0.12 * (fine - 0.5) + 0.25 * Math.max(land - 0.52, 0));
        if (land > 0.535) {                              // 陆地：苔绿 → 黄褐 → 灰白高地
          var dry = smooth(0.12, 0.36, Math.abs(lat)) * smooth(0.53, 0.58, land) + 0.3 * smooth(0.58, 0.64, land);
          var green = [46, 92, 52], sand = [168, 146, 96], rock = [128, 118, 100];
          var hi = smooth(0.6, 0.68, land);
          r = green[0] + (sand[0] - green[0]) * clamp(dry, 0, 1); g = green[1] + (sand[1] - green[1]) * clamp(dry, 0, 1); b = green[2] + (sand[2] - green[2]) * clamp(dry, 0, 1);
          r = r + (rock[0] - r) * hi; g = g + (rock[1] - g) * hi; b = b + (rock[2] - b) * hi;
        } else {                                         // 海洋：浅海略亮
          var sh = smooth(0.535, 0.45, land);
          r = 8 + 10 * sh + 34 * sh * sh; g = 26 + 30 * sh + 40 * sh * sh; b = 62 + 40 * sh + 30 * sh * sh;
        }
        o = (j * EW + i) * 4;
        eimg[o] = r + (236 - r) * ice; eimg[o + 1] = g + (240 - g) * ice; eimg[o + 2] = b + (244 - b) * ice; eimg[o + 3] = 255;
      }
    }
    tx.earth = new THREE.DataTexture(eimg, EW, EH, THREE.RGBAFormat, THREE.UnsignedByteType);
    tx.earth.colorSpace = THREE.SRGBColorSpace; tx.earth.minFilter = THREE.LinearMipmapLinearFilter;
    tx.earth.magFilter = THREE.LinearFilter; tx.earth.generateMipmaps = true; tx.earth.anisotropy = aniso; tx.earth.needsUpdate = true;

    // 云层（带 alpha）
    var cimg = new Uint8Array(EW * EH * 4);
    for (j = 0; j < EH; j++) {
      lat = (0.5 - j / EH) * Math.PI;
      for (i = 0; i < EW; i++) {
        lon = (i / EW) * 2 * Math.PI;
        px = Math.cos(lat) * Math.cos(lon); py = Math.sin(lat); pz = Math.cos(lat) * Math.sin(lon);
        var cn = fbm3(px * 4 + 11, py * 5 + 4, pz * 4 + 9, 5) + 0.1 * Math.cos(lat * 6);
        var a = 255 * smooth(0.5, 0.7, cn) * (0.55 + 0.45 * smooth(0.72, 0.5, Math.abs(lat)));
        o = (j * EW + i) * 4; cimg[o] = 255; cimg[o + 1] = 255; cimg[o + 2] = 255; cimg[o + 3] = a;
      }
    }
    tx.clouds = new THREE.DataTexture(cimg, EW, EH, THREE.RGBAFormat, THREE.UnsignedByteType);
    tx.clouds.colorSpace = THREE.SRGBColorSpace; tx.clouds.minFilter = THREE.LinearMipmapLinearFilter;
    tx.clouds.magFilter = THREE.LinearFilter; tx.clouds.generateMipmaps = true; tx.clouds.anisotropy = aniso; tx.clouds.needsUpdate = true;

    // 银河带（天球贴图，加色）：只负责一条平滑的暗光带。颗粒感交给沿带密集分布的暗星（见 _sky）——
    // 贴图一个纹素在屏幕上占好几个像素，靠它出细节只会糊成一团烟
    tx.milky = canvasTex(512, 256, function (g, w, h) {
      var id = g.createImageData(w, h), d = id.data;
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var u = x / w, v = y / h, dv = v - 0.5;
        var band = 0.55 * Math.exp(-Math.pow(dv / 0.045, 2)) + 0.45 * Math.exp(-Math.pow(dv / 0.13, 2));
        var cloud = pfbm(u, v, 6, 3, 900), dust = pfbm(u, v * 1.6, 8, 3, 950);
        var a = 255 * clamp(band * (0.45 + 0.55 * cloud) * (0.30 + 0.70 * smooth(0.64, 0.44, dust)) * 0.062, 0, 1);   // 很暗：肉眼里的银河只是一条淡淡的光带
        var o = (y * w + x) * 4;
        d[o] = a * 0.80; d[o + 1] = a * 0.84; d[o + 2] = a * 0.96; d[o + 3] = 255;             // 加色混合：RGB 即亮度，偏一点冷白
      }
      g.putImageData(id, 0, 0);
    }, { linear: true, repeat: true, aniso: aniso });

    // 反射环境（等距圆柱）：上半黑天、下半灰月面、一枚太阳 —— 金属件反射的就是它
    tx.env = canvasTex(256, 128, function (g, w, h) {
      var gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#000000'); gr.addColorStop(0.5, '#020202'); gr.addColorStop(0.56, '#4a4743'); gr.addColorStop(1, '#7a766f');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      var sg = g.createRadialGradient(w * 0.72, h * 0.26, 0, w * 0.72, h * 0.26, 22);
      sg.addColorStop(0, 'rgba(255,255,255,1)'); sg.addColorStop(0.25, 'rgba(255,250,240,0.5)'); sg.addColorStop(1, 'rgba(255,250,240,0)');
      g.fillStyle = sg; g.fillRect(0, 0, w, h);
    }, { linear: true });
    tx.env.mapping = THREE.EquirectangularReflectionMapping;

    // 营地旗帜：橙底白鱼（靠横杆撑开，没有风）
    tx.flag = canvasTex(256, 144, function (g, w, h) {
      g.fillStyle = '#d9482b'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#f6f2ea';
      g.beginPath();                                   // 鱼身
      g.ellipse(118, 76, 52, 25, 0, 0, Math.PI * 2); g.fill();
      g.beginPath();                                   // 鱼尾
      g.moveTo(160, 76); g.lineTo(206, 46); g.lineTo(198, 76); g.lineTo(206, 106); g.closePath(); g.fill();
      g.fillStyle = '#d9482b'; g.beginPath(); g.arc(86, 70, 5, 0, Math.PI * 2); g.fill();
    });
    return tx;
  }

  function plaqueTexture(id, title) {
    return canvasTex(256, 160, function (g, w, h) {
      g.fillStyle = '#1b1c1e'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#ffa21f'; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12);
      g.fillStyle = '#ffa21f'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '700 62px ui-monospace, Menlo, monospace'; g.fillText((id < 10 ? '0' : '') + id, w / 2, 62);
      g.fillStyle = '#ecebe6'; g.font = '600 30px -apple-system, "PingFang SC", "Helvetica Neue", sans-serif'; g.fillText(title, w / 2, 122);
    }, { mips: true, aniso: 8 });
  }

  /* ───────── 英雄材质：乘上月面自遮挡因子（坑壁的影子会罩住车） ───────── */
  var SHADOW_ANCHOR = 'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ]';
  var patchedLightsChunk = null;
  function lightsChunkPatched() {
    if (patchedLightsChunk === null) {
      if (THREE.ShaderChunk.lights_fragment_begin.indexOf(SHADOW_ANCHOR) < 0) console.warn('[pm] shadow anchor not found');
      patchedLightsChunk = THREE.ShaderChunk.lights_fragment_begin.replace(SHADOW_ANCHOR,
        'directLight.color *= ( directLight.visible && receiveShadow ) ? PM_SUNVIS * getShadow( directionalShadowMap[ i ]')
        // 坡度缩放偏移：太阳只有二十几度高，掠射面上每个阴影纹素的深度差很大，固定偏移挡不住自遮挡条纹；
        // 掠射面本来就几乎没有直射光，多让一点看不出来
        .replace('directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius',
          '( directionalLightShadow.shadowBias - 0.0022 * pow( 1.0 - max( dot( normal, directionalLight.direction ), 0.0 ), 4.0 ) ), directionalLightShadow.shadowRadius');
    }
    return patchedLightsChunk;
  }
  // mode: 'u' = 共享 uniform（车与鹈鹕）；'a' = 每实例 attribute aVis（岩石）
  function withSunVis(material, uniform, mode) {
    material.onBeforeCompile = function (shader) {
      if (mode === 'a') {
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nattribute float aVis; varying float vSunVis;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSunVis = aVis;');
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vSunVis;')
          .replace('#include <lights_fragment_begin>', lightsChunkPatched().replace(/PM_SUNVIS/g, 'vSunVis'));
      } else {
        shader.uniforms.uSunVis = uniform;
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uSunVis;')
          .replace('#include <lights_fragment_begin>', lightsChunkPatched().replace(/PM_SUNVIS/g, 'uSunVis'));
      }
    };
    material.customProgramCacheKey = function () { return 'sunvis-' + (mode || 'u'); };
    return material;
  }

  /* ───────── 地形几何：以鹈鹕为中心的嵌套方环（每环外缘距离翻倍，格尺寸翻倍） ─────────
   * 相邻两环格尺寸不同，交界处必然有 T 形顶点。这里让交界零缝隙、不用裙边：
   *  · 外圈矩形上的顶点用"邻居那一环"的 LOD 采样，和粗邻居完全一致
   *  · T 形顶点的高度取粗边两端的线性插值 —— 粗边是直线，所以它精确落在直线上
   *  · 环内从内缘到外缘做几何渐变（本环 LOD → 邻居 LOD），骑动时环带边界不会跳变
   * aA = (本环 lod, 渐变权重, T 形分数, 邻居 lod)；aEdge = 指向后一个粗顶点的偏移 */
  var RING_N = [16, 32, 32, 32, 32, 32, 16, 16, 16, 16];       // 每环径向格数（环 1..10）：32 格 ≈ 屏幕上 33px
  function buildTerrainGeometry(low) {
    var pos = [], attr = [], edge = [], idx = [], base = 0, nrm = [];
    var N = low ? [16, 16, 16, 16, 16, 16, 16, 16, 16, 16] : RING_N;
    function grid(x0, z0, nx, nz, step, l, nl, r, a) {
      var i, j, k, c2 = r * step, lim = 2 * a;
      for (j = 0; j <= nz; j++) for (i = 0; i <= nx; i++) {
        var x = x0 + i * step, z = z0 + j * step, d = Math.max(Math.abs(x), Math.abs(z)), t = clamp((d - a) / a, 0, 1);
        var f = -1, ex = 0, ez = 0;
        // 外圈矩形上的顶点。边的参数从本条带的角点起算：远边沿 +x，侧边沿 +z
        if (Math.abs(Math.abs(z) - lim) < 1e-6 && (j === 0 || j === nz)) { f = (i % r) / r; ex = c2; }
        else if (Math.abs(Math.abs(x) - lim) < 1e-6 && (i === 0 || i === nx)) { f = (j % r) / r; ez = c2; }
        pos.push(x, 0, z); nrm.push(0, 1, 0);            // 法线在片元里由高度场重算；这里给 (0,1,0) 只为让 three 的阴影法线偏移不是 NaN
        if (f < 0) { attr.push(l, t * t * (3 - 2 * t), 0, nl); edge.push(0, 0); }
        else { attr.push(l, 1, f, nl); edge.push(ex, ez); }
      }
      for (j = 0; j < nz; j++) for (i = 0; i < nx; i++) {
        var p = base + j * (nx + 1) + i, q = p + 1, c = p + nx + 1, e = c + 1;
        idx.push(p, e, q, p, c, e);
      }
      base += (nz + 1) * (nx + 1);
    }
    grid(-8, -8, 32, 32, 0.5, 0, 0, 1, 8);                                           // 中心：0.5 m
    for (var k = 1; k <= 10; k++) {
      var a = 8 << (k - 1), b = a << 1, n = N[k - 1], st = a / n, l = Math.round(Math.log2(st / T.TEX));
      var nextCell = k < 10 ? b / N[k] : st, nl = k < 10 ? Math.round(Math.log2(nextCell / T.TEX)) : l, r = Math.round(nextCell / st);
      grid(-b, -b, 4 * n, n, st, l, nl, r, a); grid(-b, a, 4 * n, n, st, l, nl, r, a);   // 北 / 南条：宽 4a（= 2b）、深 a
      grid(-b, -a, n, 2 * n, st, l, nl, r, a); grid(a, -a, n, 2 * n, st, l, nl, r, a);   // 西 / 东条
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('aA', new THREE.Float32BufferAttribute(attr, 4));
    g.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 2));
    g.setIndex(idx);
    return g;
  }

  var VS_HEAD = [
    'uniform sampler2D uTerr; uniform float uTile; uniform float uTexel; uniform float uDebug;',
    'attribute vec4 aA; attribute vec2 aEdge;',
    'varying vec3 vTPos; varying vec2 vTUv; varying vec2 vTL; varying float vLod;',
    'float terrSample( vec2 xz, float l ) { return textureLod( uTerr, ( xz + 0.5 * uTexel ) / uTile, l ).r; }'
  ].join('\n');
  var VS_BODY = [
    'vec2 wxz = ( modelMatrix * vec4( position, 1.0 ) ).xz;',
    'vTUv = ( wxz + 0.5 * uTexel ) / uTile;',
    'vTL = position.xz;',                                             // 相对地形锚点（≈车）的局部坐标
    'float l0 = uDebug == 6.0 ? 0.0 : aA.x, l1 = uDebug == 6.0 ? 0.0 : aA.w;',
    'vec2 p0 = wxz - aA.z * aEdge;',
    'float h = mix( terrSample( wxz, l0 ), mix( terrSample( p0, l1 ), terrSample( p0 + aEdge, l1 ), aA.z ), aA.y );',
    'vLod = mix( l0, l1, aA.y );',
    'transformed.y += h - ( uDebug == 9.0 ? 0.0 : 1.0 ) * dot( vTL, vTL ) / ( 2.0 * 1737400.0 );',   // 月面曲率：以观察者为中心，d²/2R
    'if ( uDebug == 3.0 ) transformed.y = position.y;',
    'vTPos = vec3( wxz.x, transformed.y, wxz.y );'
  ].join('\n');
  // 高度必须和顶点位移用同一个基准（含曲率），否则步进射线会从"地下"出发，整片地面被自己挡住
  var FS_HEAD = [
    'uniform sampler2D uTerr; uniform sampler2D uGrad; uniform sampler2D uDetail; uniform vec3 uSunDir; uniform vec3 uRegolith;',
    'uniform float uTile; uniform float uTexel; uniform vec2 uRayC; uniform float uDebug;',
    'varying vec3 vTPos; varying vec2 vTUv; varying vec2 vTL; varying float vLod;',
    'float terrH( vec2 xz, vec2 lz, float l ) { vec4 t = textureLod( uTerr, ( xz + 0.5 * uTexel ) / uTile, uDebug == 6.0 ? 0.0 : l ); return t.r - dot( lz, lz ) / ( 2.0 * 1737400.0 ); }',
    // 高度场沿太阳方向步进：只管"别的东西挡光"，本地坡面的明暗由 N·L 给出。射线（起点和取样）放在比网格高一级的曲面上，
    // 起点与取样自洽。过渡宽度随步长放大：射线掠过一道平缓的脊时，离散采样点会在"擦到 / 没擦到"之间跳变，
    // 过渡带不够宽就成了一条条沿太阳方位的细带。0.5° 的太阳本来也有约 1% 距离的半影
    'float terrShadow( vec3 p, vec2 lp, float ml ) {',
    '  float sh = 1.0, t = 0.3, ln = max( 1.0, ml + 1.0 ), lf = max( 3.0, ml + 1.0 );',
    '  if ( uDebug == 6.0 ) { ln = 0.0; lf = 0.0; }',
    '  vec3 o = vec3( p.x, terrH( p.xz, lp, ln ), p.z );',
    '  if ( uDebug != 10.0 ) for ( int i = 0; i < 26; i ++ ) { vec3 q = o + uSunDir * t; sh = min( sh, clamp( 0.5 + ( q.y - terrH( q.xz, lp + ( q.xz - p.xz ), ln ) ) / ( ( 0.10 + 0.04 * t ) * ( 1.0 + 0.4 * max( ml - 1.0, 0.0 ) ) ), 0.0, 1.0 ) ); t *= 1.17; }',   // 10 = 调试：只看远段
    '  if ( uDebug != 11.0 ) for ( int i = 0; i < 12; i ++ ) { vec3 q = o + uSunDir * t; sh = min( sh, clamp( 0.5 + ( q.y - terrH( q.xz, lp + ( q.xz - p.xz ), lf ) ) / ( ( 0.5 + 0.05 * t ) * ( 1.0 + 0.5 * max( ml - 2.0, 0.0 ) ) ), 0.0, 1.0 ) ); t += 9.0; }',   // 11 = 调试：只看近段。远处小坑的碎影比像素还小：越远越放宽，免得走样成噪点
    '  return sh;',
    '}'
  ].join('\n');
  var FS_ALBEDO = [
    'vec4 dn1 = texture2D( uDetail, vTPos.xz * 0.0137 );',
    'vec4 dn2 = texture2D( uDetail, vTPos.xz * 0.191 );',
    'vec4 dn3 = texture2D( uDetail, vTPos.xz * 1.13 );',
    'float mott = dn1.r * 0.55 + dn2.r * 0.3 + dn3.r * 0.15;',
    'vec2 rc = vTPos.xz - uRayC; float rd = length( rc ); float ra = atan( rc.y, rc.x );',
    'float ray = pow( 0.5 + 0.5 * sin( ra * 29.0 + 2.1 * sin( ra * 9.0 + 1.3 ) + 1.7 * sin( ra * 17.0 ) ), 12.0 );',
    'float ejecta = smoothstep( 560.0, 150.0, rd ) * ( 0.5 + 0.5 * ray ) * 0.40 + smoothstep( 172.0, 146.0, rd ) * 0.22;',   // 大坑的溅射裙与辐射纹
    'diffuseColor.rgb = uRegolith * ( 0.80 + 0.30 * mott + 0.14 * ( dn2.g - 0.5 ) ) * ( 1.0 + ejecta );'
  ].join('\n');
  var FS_NORMAL = [
    'float dcam = length( vViewPosition );',
    'float dfade = clamp( 1.0 - dcam / 70.0, 0.0, 1.0 );',
    // 近处的法线用高度的中心差分：梯度通道是双线性插值的，纹素对角线上有折痕，
    // 平时看不出来，但在 N·L 过零的明暗过渡带上（坡度 ≈ 太阳高度角）会显成一圈圈细线
    'float fp = length( fwidth( vTPos.xz ) ), fd = 1.0 - smoothstep( 0.4, 1.6, fp );',
    'vec2 gW = texture2D( uGrad, vTUv ).rg;',                     // 远处：预存的梯度（按屏幕足迹自动选 mip）
    'if ( fd > 0.0 ) {',
    '  float e = 0.75 * uTexel, k = 1.0 / ( 2.0 * e );',
    '  vec4 hx1 = textureGrad( uTerr, ( vTPos.xz + vec2( e, 0.0 ) + 0.5 * uTexel ) / uTile, vec2( 0.0 ), vec2( 0.0 ) ), hx0 = textureGrad( uTerr, ( vTPos.xz - vec2( e, 0.0 ) + 0.5 * uTexel ) / uTile, vec2( 0.0 ), vec2( 0.0 ) );   // 零导数：不吃各向异性',
    '  vec4 hz1 = textureGrad( uTerr, ( vTPos.xz + vec2( 0.0, e ) + 0.5 * uTexel ) / uTile, vec2( 0.0 ), vec2( 0.0 ) ), hz0 = textureGrad( uTerr, ( vTPos.xz - vec2( 0.0, e ) + 0.5 * uTexel ) / uTile, vec2( 0.0 ), vec2( 0.0 ) );',
    '  gW = mix( gW, vec2( hx1.r + hx1.g - hx0.r - hx0.g, hz1.r + hz1.g - hz0.r - hz0.g ) * k, fd );',
    '}',
    'vec2 db = ( uDebug == 18.0 || uDebug == 19.0 ) ? vec2( 0.0 ) : ( ( texture2D( uDetail, vTPos.xz * 1.13 ).ba - 0.5 ) * 0.7 + ( texture2D( uDetail, vTPos.xz * 0.191 ).ba - 0.5 ) * 0.9 ) * dfade;',   // 18/19 = 调试：关掉细节凹凸
    'vec3 nW = normalize( vec3( -( gW.x + db.x ), 1.0, -( gW.y + db.y ) ) );',
    'normal = normalize( ( viewMatrix * vec4( nW, 0.0 ) ).xyz );',
    'float selfShadow = ( uDebug == 7.0 || uDebug == 19.0 ) ? 1.0 : terrShadow( vTPos, vTL, vLod );',   // 7 = 调试：关掉自遮挡，只看阴影贴图
    'if ( uDebug == 4.0 || uDebug == 10.0 || uDebug == 11.0 ) diffuseColor.rgb = vec3( selfShadow );',
    // 12/13/14 = 调试：贴图里高度（lod 1 / 0 / 3）的 12.5cm 等值带 —— 看数据有没有台阶或噪点
    'if ( uDebug == 12.0 || uDebug == 13.0 || uDebug == 14.0 ) diffuseColor.rgb = vec3( fract( terrH( vTPos.xz, vTL, uDebug == 12.0 ? 1.0 : ( uDebug == 13.0 ? 0.0 : 3.0 ) ) * 8.0 ), 0.5 * fract( terrH( vTPos.xz, vTL, 0.0 ) * 80.0 ), 0.0 );',
    'if ( uDebug == 15.0 ) { float dh = terrH( vTPos.xz, vTL, 1.0 ) - vTPos.y; diffuseColor.rgb = vec3( clamp( 0.5 + dh * 300.0, 0.0, 1.0 ), clamp( 0.5 + dh * 30.0, 0.0, 1.0 ), 0.0 ); }',   // 15 = lod1 与网格高度之差
    // 16/17 = 调试：地面片元的阴影坐标 / 阴影贴图判定
    '#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0',   // 夜里太阳光被隐藏时会重编译出无阴影的变体
    'if ( uDebug == 16.0 ) diffuseColor.rgb = vDirectionalShadowCoord[ 0 ].xyz;',
    'if ( uDebug == 17.0 ) diffuseColor.rgb = vec3( getShadow( directionalShadowMap[ 0 ], directionalLightShadows[ 0 ].shadowMapSize, directionalLightShadows[ 0 ].shadowIntensity, directionalLightShadows[ 0 ].shadowBias, directionalLightShadows[ 0 ].shadowRadius, vDirectionalShadowCoord[ 0 ] ) );',
    '#endif',
    'if ( uDebug == 18.0 || uDebug == 19.0 ) diffuseColor.rgb = vec3( 0.27 );',
    'if ( uDebug > 0.5 && uDebug < 12.0 && uDebug != 4.0 && uDebug != 10.0 && uDebug != 11.0 ) diffuseColor.rgb = uDebug == 1.0 ? vec3( clamp( ( vTPos.y + 20.0 ) / 60.0, 0.0, 1.0 ) ) : ( uDebug == 2.0 ? abs( nW ) : vec3( 0.27 ) );'
  ].join('\n');

  /* ═══════════════ World ═══════════════ */
  function World(renderer, scene, camera, field, opts) {
    var THREE = window.THREE;
    this.THREE = THREE; this.renderer = renderer; this.scene = scene; this.camera = camera; this.field = field;
    this.tex = makeTextures(renderer);
    this.low = !!(opts && opts.low);           // 低配：每环 16 格
    this.uSunDir = { value: new THREE.Vector3() };
    this.uSunVis = { value: 1 };
    this.uDebug = { value: 0 };
    this.clock = 0;                                    // 月面时钟（秒），随"时间流速"推进
    this.phase = S.DEFAULT_PHASE;
    this.sky = S.sky(this.phase);
    this.lastCell = null;
    this.envPMREM(renderer);
    this._lights(); this._terrain(); this._sky(); this._rocks(); this._dust(); this._tracks(); this._props();
  }

  World.prototype.envPMREM = function (renderer) {
    var pmrem = new window.THREE.PMREMGenerator(renderer);
    var env = pmrem.fromEquirectangular(this.tex.env).texture;
    this.scene.environment = env;
    this.scene.environmentIntensity = 0.35;
    pmrem.dispose();
  };

  World.prototype._lights = function () {
    var THREE = this.THREE;
    this.sun = new THREE.DirectionalLight(0xfff7ee, SUN_I);
    this.sun.castShadow = true;
    var sh = this.sun.shadow;
    sh.mapSize.set(2048, 2048);
    sh.camera.left = sh.camera.bottom = -26; sh.camera.right = sh.camera.top = 26;
    sh.camera.near = 1; sh.camera.far = 240;
    sh.bias = -0.0002; sh.normalBias = 0.035; sh.radius = 1.2;
    this.bounce = new THREE.HemisphereLight(0x000000, 0xffffff, 1);      // 天空半球近黑，月面反光从下方来
    this.earthshine = new THREE.AmbientLight(0x9db4e6, 0);
    this.scene.add(this.sun, this.sun.target, this.bounce, this.earthshine);
  };

  World.prototype._terrain = function () {
    var THREE = this.THREE, N = T.N, H = this.field.H, GX = this.field.GX, GZ = this.field.GZ, i;
    // 高度图与梯度图分开存，mip 链自己逐级算（每级在浮点里取 2×2 平均）。
    // 高度用单通道 32 位浮点：half 精度在几百米的量级上只能分辨 0.125 m，硬件做双线性过滤时整数部分会被量化，
    // 采样到的曲面就成了台阶状（阴影里漏光成条带、明暗过渡带起细纹、远处几何出梯田）。不支持浮点线性过滤的设备退回 16F
    var renderer = this.renderer, useF32 = renderer.extensions.has('OES_texture_float_linear');
    var src = { h: H, gx: GX, gz: GZ }, w = N, hMips = [], gMips = [];
    function pack(sw) {
      var n = sw * sw, hd = useF32 ? new Float32Array(n) : new Uint16Array(n), gd = new Uint16Array(n * 2), sh = src.h, sx = src.gx, sz = src.gz;
      for (var k = 0; k < n; k++) { hd[k] = useF32 ? sh[k] : f2h(sh[k]); gd[k * 2] = f2h(sx[k]); gd[k * 2 + 1] = f2h(sz[k]); }
      hMips.push({ data: hd, width: sw, height: sw }); gMips.push({ data: gd, width: sw, height: sw });
    }
    pack(N);
    for (var L = 1; L < 12; L++) {
      var w2 = w >> 1, nh = new Float32Array(w2 * w2), ngx = new Float32Array(w2 * w2), ngz = new Float32Array(w2 * w2);
      for (var j = 0; j < w2; j++) for (i = 0; i < w2; i++) {
        var a = (2 * j) * w + 2 * i, b = a + 1, c = a + w, d = c + 1, q = j * w2 + i;
        nh[q] = (src.h[a] + src.h[b] + src.h[c] + src.h[d]) * 0.25;
        ngx[q] = (src.gx[a] + src.gx[b] + src.gx[c] + src.gx[d]) * 0.25;
        ngz[q] = (src.gz[a] + src.gz[b] + src.gz[c] + src.gz[d]) * 0.25;
      }
      src = { h: nh, gx: ngx, gz: ngz }; w = w2; pack(w2);
    }
    function upload(tex, mips) {
      tex.mipmaps = mips;                               // 手工 mip：three 逐级 texSubImage2D 上传
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = false;
      tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      tex.needsUpdate = true;
      return tex;
    }
    this.heightTex = upload(new THREE.DataTexture(hMips[0].data, N, N, THREE.RedFormat, useF32 ? THREE.FloatType : THREE.HalfFloatType), hMips);
    this.gradTex = upload(new THREE.DataTexture(gMips[0].data, N, N, THREE.RGFormat, THREE.HalfFloatType), gMips);
    this.heightF32 = useF32;

    var that = this;
    var mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.97, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0 });
    mat.onBeforeCompile = function (shader) {
      shader.uniforms.uTerr = { value: that.heightTex };
      shader.uniforms.uGrad = { value: that.gradTex };
      shader.uniforms.uDetail = { value: that.tex.detail };
      shader.uniforms.uSunDir = that.uSunDir;
      shader.uniforms.uRegolith = { value: new THREE.Color().setScalar(ALBEDO) };
      shader.uniforms.uTile = { value: T.TILE };
      shader.uniforms.uTexel = { value: T.TEX };
      shader.uniforms.uRayC = { value: new THREE.Vector2(330, -140) };
      shader.uniforms.uDebug = that.uDebug;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + VS_HEAD)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VS_BODY);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + FS_HEAD)
        .replace('#include <map_fragment>', FS_ALBEDO)
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n' + FS_NORMAL)
        .replace('#include <lights_fragment_begin>', lightsChunkPatched().replace(/PM_SUNVIS/g, 'selfShadow'));
    };
    mat.customProgramCacheKey = function () { return 'terrain'; };
    this.terrain = new THREE.Mesh(buildTerrainGeometry(this.low), mat);
    this.terrain.receiveShadow = true;
    this.terrain.frustumCulled = false;
    this.scene.add(this.terrain);
  };

  World.prototype._sky = function () {
    var THREE = this.THREE;
    this.skyScene = new THREE.Scene();
    this.skyCam = new THREE.PerspectiveCamera(50, 1, 0.5, 1200);
    // 星表：全天均匀 + 银河带内加密的暗星。真空中星星不闪烁，所以没有任何时间项
    var n1 = 3600, n2 = 16000, n = n1 + n2, rnd = T.mulberry32(4242);
    // 银河带上的恒星云：沿带疏密不均，中间夹几条窄的暗尘带
    function milkyDensity(a, o) {
      var cloud = 0.5 + 0.5 * Math.sin(a * 2.3 + 1.1 + 0.8 * Math.sin(a * 5.1 + 2.0)), lane = 0.5 + 0.5 * Math.sin(a * 3.7 + 0.4 + 1.3 * Math.sin(a * 7.3));
      cloud = 0.22 + 0.78 * cloud * cloud;
      var rift = Math.exp(-Math.pow((o - 0.012 * Math.sin(a * 4.0)) / 0.014, 2)) * smooth(0.45, 0.7, lane);
      return clamp(cloud * (1 - 0.85 * rift) * Math.exp(-Math.pow(o / 0.075, 2)) * 1.35, 0, 1);
    }
    var p = new Float32Array(n * 3), col = new Float32Array(n * 3), sz = new Float32Array(n);
    var tilt = 1.05, ct = Math.cos(tilt), st = Math.sin(tilt);
    for (var i = 0; i < n; i++) {
      var x, y, z;
      if (i < n1) { z = rnd() * 2 - 1; var ph = rnd() * 6.2832, r = Math.sqrt(1 - z * z); x = r * Math.cos(ph); y = r * Math.sin(ph); }
      else {                                      // 银河：绕一条倾斜大圆的带（拒绝采样出恒星云和暗尘带）
        var a, o;
        do { a = rnd() * 6.2832; o = (rnd() + rnd() + rnd() - 1.5) * 0.12; } while (rnd() > milkyDensity(a, o));
        x = Math.cos(a); y = o; z = Math.sin(a);
        var y2 = y * ct - z * st, z2 = y * st + z * ct; y = y2; z = z2;
        var L = Math.hypot(x, y, z); x /= L; y /= L; z /= L;
      }
      p[i * 3] = x * 480; p[i * 3 + 1] = y * 480; p[i * 3 + 2] = z * 480;
      var band = i < n1 ? 0 : 1;
      var mag = band ? 0.10 + 0.34 * rnd() * rnd() : 0.35 + 0.65 * Math.pow(rnd(), 2.2);
      var temp = rnd();                           // 蓝白 → 白 → 黄 → 橙
      var cr = temp < 0.25 ? 0.78 : temp < 0.6 ? 1 : temp < 0.9 ? 1 : 1, cg = temp < 0.25 ? 0.86 : temp < 0.6 ? 0.97 : temp < 0.9 ? 0.93 : 0.8, cb = temp < 0.25 ? 1 : temp < 0.6 ? 0.95 : temp < 0.9 ? 0.74 : 0.52;
      col[i * 3] = mag * cr; col[i * 3 + 1] = mag * cg; col[i * 3 + 2] = mag * cb;
      sz[i] = (band ? 0.85 : 1.1) + 1.9 * mag;
    }
    var sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(p, 3));
    sg.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    sg.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
    this.starMat = new THREE.ShaderMaterial({
      uniforms: { uDpr: { value: 1 }, uScale: { value: 1 } },
      vertexShader: 'attribute vec3 aColor; attribute float aSize; uniform float uDpr; varying vec3 vC;\nvoid main(){ vC = aColor; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); gl_PointSize = aSize * uDpr; }',
      fragmentShader: 'varying vec3 vC;\nvoid main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep( 0.5, 0.12, length( d ) ); gl_FragColor = vec4( vC * a, 1.0 );\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.frustumCulled = false;
    this.skyScene.add(this.stars);
    var mw = new THREE.Mesh(new THREE.SphereGeometry(470, 32, 16), new THREE.MeshBasicMaterial({
      map: this.tex.milky, side: THREE.BackSide, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    this.milky = mw;
    this.skyScene.add(mw);

    // 地球：角直径 1.90°，受光面由同一枚太阳决定（圆缺自动正确）
    this.earthGroup = new THREE.Group();
    var dist = 420, er = dist * Math.sin(0.95 * Math.PI / 180);
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(er, 48, 32), new THREE.MeshStandardMaterial({ map: this.tex.earth, roughness: 0.82, metalness: 0 }));
    this.earthClouds = new THREE.Mesh(new THREE.SphereGeometry(er * 1.006, 48, 32), new THREE.MeshStandardMaterial({
      map: this.tex.clouds, transparent: true, depthWrite: false, roughness: 1, metalness: 0
    }));
    var atmo = new THREE.Mesh(new THREE.SphereGeometry(er * 1.04, 48, 32), new THREE.ShaderMaterial({
      uniforms: { uSun: this.uSunDir },
      vertexShader: 'varying vec3 vN; varying vec3 vV;\nvoid main(){ vec4 mv = modelViewMatrix * vec4( position, 1.0 ); vN = normalize( normalMatrix * normal ); vV = normalize( - mv.xyz ); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 uSun; varying vec3 vN; varying vec3 vV;\nvoid main(){ float f = pow( 1.0 - max( dot( normalize( vN ), normalize( vV ) ), 0.0 ), 3.2 ); vec3 nW = normalize( ( vec4( normalize( vN ), 0.0 ) * viewMatrix ).xyz ); float lit = smoothstep( -0.3, 0.5, dot( nW, uSun ) ); gl_FragColor = vec4( vec3( 0.30, 0.56, 1.0 ) * f * lit * 1.5, 1.0 );\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    this.earthGroup.add(this.earth, this.earthClouds, atmo);
    this.skyScene.add(this.earthGroup);
    this.skyLight = new THREE.DirectionalLight(0xffffff, SUN_I);
    this.skyScene.add(this.skyLight, this.skyLight.target);
    this.skyScene.add(new THREE.AmbientLight(0xffffff, 0.02));

    // 太阳：角直径 0.53° 的白盘 + 一圈很淡的镜头内反射（相机光学，不是大气散射）
    var mk = function (scale, rgb) {
      var m = new THREE.SpriteMaterial({ map: this.tex.soft, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
      m.color.setRGB(rgb[0], rgb[1], rgb[2]);
      var sp = new THREE.Sprite(m); sp.scale.set(scale, scale, 1); return sp;
    };
    this.sunDisk = mk.call(this, 2 * 470 * Math.tan(0.265 * Math.PI / 180) * 2.4, [7, 6.8, 6.4]);
    this.sunHalo = mk.call(this, 46, [0.20, 0.19, 0.18]);
    this.skyScene.add(this.sunHalo, this.sunDisk);
  };

  World.prototype._rocks = function () {
    var THREE = this.THREE, MAX = 700;
    var geo = new THREE.IcosahedronGeometry(1, 1);
    var pa = geo.attributes.position, v = new THREE.Vector3();
    for (var i = 0; i < pa.count; i++) {                 // 不规则化：同一顶点位置的位移一致，保持面闭合
      v.fromBufferAttribute(pa, i);
      var key = Math.round(v.x * 1000) * 7.13 + Math.round(v.y * 1000) * 3.71 + Math.round(v.z * 1000) * 1.37;
      v.multiplyScalar(0.82 + 0.36 * T.hash2(Math.round(key), 11, 5)).setY(v.y * 0.8);
      pa.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    var mat = withSunVis(new THREE.MeshStandardMaterial({ color: 0x6f6b66, roughness: 0.93, metalness: 0, flatShading: true }), null, 'a');
    this.rocks = new THREE.InstancedMesh(geo, mat, MAX);
    this.rocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rocks.geometry.setAttribute('aVis', new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1));
    this.rocks.castShadow = true; this.rocks.receiveShadow = true; this.rocks.frustumCulled = false;
    this.rocks.count = 0;
    this.scene.add(this.rocks);
  };

  World.prototype._refreshRocks = function (x, z) {
    var THREE = this.THREE, m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    var n = 0, R = 6, vis = this.rocks.geometry.attributes.aVis;
    for (var cj = -R; cj <= R && n < 700; cj++) for (var ci = -R; ci <= R && n < 700; ci++) {
      var cell = T.rocksInCell(Math.floor(x / T.ROCK_CELL) + ci, Math.floor(z / T.ROCK_CELL) + cj);
      for (var k = 0; k < cell.length && n < 700; k++) {
        var rk = cell[k];
        if (T.nearPlaque(this.field, rk.x, rk.z, T.CLEAR) || T.dist2(rk.x, rk.z, 0, 0) < 56) continue;
        if (rk.r < 0.06 && T.dist2(rk.x, rk.z, x, z) > 900) continue;                       // 小石子只在近处画
        var y = T.heightMesh(this.field, rk.x, rk.z);
        e.set(rk.b * 0.3, rk.a, rk.b * 0.3); q.setFromEuler(e);
        s.set(rk.r * rk.sx, rk.r * rk.sy, rk.r * rk.sz);
        p.set(x + T.dWrap(rk.x - x), y + rk.r * rk.sy * 0.28, z + T.dWrap(rk.z - z));   // 取离车最近的那个周期像
        m.compose(p, q, s);
        this.rocks.setMatrixAt(n, m);
        vis.setX(n, this.sunVisibilityAt(rk.x, y + rk.r * rk.sy, rk.z));
        n++;
      }
    }
    this.rocks.count = n;
    this.rocks.instanceMatrix.needsUpdate = true;
    vis.needsUpdate = true;
  };

  World.prototype._dust = function () {
    var THREE = this.THREE;
    var g = new THREE.BufferGeometry();
    this.dustPos = new Float32Array(S.K.DUST_MAX * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.dustPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    var mat = new THREE.PointsMaterial({ size: 0.05, map: this.tex.soft, transparent: true, opacity: 0.85, depthWrite: false, color: 0x2c2b2e, sizeAttenuation: true });
    this.dust = new THREE.Points(g, mat);
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
  };

  // 车辙：两条带状网格（前 / 后轮），环形缓冲。月面没有风和水，不会消失
  function Ribbon(field, tex, sunVis, THREE) {
    this.MAX = 2600; this.n = 0; this.prev = null; this.field = field;
    this.pos = new Float32Array(this.MAX * 6); this.col = new Float32Array(this.MAX * 6);
    var idx = new Uint32Array((this.MAX - 1) * 6), ni = 0;
    for (var i = 0; i < this.MAX - 1; i++) { var a = i * 2; idx[ni++] = a; idx[ni++] = a + 1; idx[ni++] = a + 2; idx[ni++] = a + 1; idx[ni++] = a + 3; idx[ni++] = a + 2; }
    this.g = new THREE.BufferGeometry();
    this.g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.g.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(this.g, withSunVis(new THREE.MeshStandardMaterial({
      color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.86, roughness: 1, metalness: 0, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3
    }), sunVis));
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
  }
  Ribbon.prototype.add = function (pt) {
    if (this.prev && T.dist2(pt.x, pt.z, this.prev.x, this.prev.z) > 4) this.prev = null;     // 传送 / 跨瓦片：断开
    if (this.n >= this.MAX) {                  // 满了：丢掉最旧的 400 点
      this.pos.copyWithin(0, 400 * 6); this.col.copyWithin(0, 400 * 6); this.n -= 400; this.prev = null;
    }
    var i = this.n, o = i * 6, dx = 0, dz = 1;
    if (this.prev) { dx = pt.x - this.prev.x; dz = pt.z - this.prev.z; var L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L; }
    var w = pt.side === 'f' ? 0.021 : 0.027, shade = pt.skid ? 0.035 : 0.105;       // 压实/翻出的月壤比浮沙暗
    this.pos[o] = pt.x - dz * w; this.pos[o + 1] = T.heightMesh(this.field, pt.x - dz * w, pt.z + dx * w) + 0.012; this.pos[o + 2] = pt.z + dx * w;
    this.pos[o + 3] = pt.x + dz * w; this.pos[o + 4] = T.heightMesh(this.field, pt.x + dz * w, pt.z - dx * w) + 0.012; this.pos[o + 5] = pt.z - dx * w;
    for (var c = 0; c < 6; c++) this.col[o + c] = shade;
    this.n++;
    this.prev = pt;
    this.g.attributes.position.needsUpdate = true;
    this.g.attributes.color.needsUpdate = true;
    this.g.setDrawRange(0, this.prev && this.n > 1 ? (this.n - 1) * 6 : 0);
  };

  World.prototype._tracks = function () {
    this.ribbons = { r: new Ribbon(this.field, this.tex, this.uSunVis, this.THREE), f: new Ribbon(this.field, this.tex, this.uSunVis, this.THREE) };
    this.scene.add(this.ribbons.r.mesh, this.ribbons.f.mesh);
  };

  World.prototype._props = function () {
    var THREE = this.THREE, f = this.field, that = this;
    var poleMat = withSunVis(new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.5, metalness: 0.8 }), this.uSunVis);
    var plateSide = withSunVis(new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.6, metalness: 0.3 }), this.uSunVis);
    this.plaques = [];
    var poleGeo = new THREE.CylinderGeometry(0.02, 0.026, 1.3, 8), footGeo = new THREE.CylinderGeometry(0.17, 0.21, 0.05, 10);
    var plateGeo = new THREE.BoxGeometry(0.52, 0.33, 0.016), lampGeo = new THREE.SphereGeometry(0.04, 12, 8);
    for (var k = 0; k < f.plaques.length; k++) {
      var p = f.plaques[k], g = new THREE.Group();
      g.position.set(p.x, T.heightMesh(f, p.x, p.z), p.z);
      var pole = new THREE.Mesh(poleGeo, poleMat); pole.position.y = 0.65; pole.castShadow = true;
      var foot = new THREE.Mesh(footGeo, poleMat); foot.position.y = 0.02;
      var face = new THREE.MeshStandardMaterial({ map: plaqueTexture(p.id, p.title), roughness: 0.55, metalness: 0.1 });
      var plate = new THREE.Mesh(plateGeo, [plateSide, plateSide, plateSide, plateSide, face, plateSide]);
      plate.position.y = 1.02; plate.rotation.y = -Math.PI / 2; plate.castShadow = true;
      var lampMat = new THREE.MeshBasicMaterial({ color: 0xffa21f, toneMapped: false });
      var lamp = new THREE.Mesh(lampGeo, lampMat); lamp.position.y = 1.33;
      var beam = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.soft, color: 0xffa21f, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55, toneMapped: false }));
      beam.scale.set(0.9, 0.9, 1); beam.position.y = 1.33;
      g.add(pole, foot, plate, lamp, beam);
      this.scene.add(g);
      this.plaques.push({ data: p, group: g, lamp: lampMat, beam: beam.material, lampMesh: lamp });
    }
    this._camp();
  };

  // 营地：一台小型着陆器 + 一面靠横杆撑开的旗（月球没有风，旗子自己立不住也飘不起来）
  World.prototype._camp = function () {
    var THREE = this.THREE, f = this.field, c = T.CAMP, g = new THREE.Group();
    var y = T.heightMesh(f, c.x, c.z);
    g.position.set(c.x, y, c.z);
    function mat(o) { return withSunVis(new THREE.MeshStandardMaterial(o), this.uSunVis); }
    var gold = mat.call(this, { color: 0xc9a24a, metalness: 0.85, roughness: 0.32 });
    var white = mat.call(this, { color: 0xd8d6d0, metalness: 0.35, roughness: 0.42 });
    var dark = mat.call(this, { color: 0x2a2a2c, metalness: 0.6, roughness: 0.5 });
    var V3 = function (x, y, z) { return new THREE.Vector3(x, y, z); };
    var cyl = function (a, b, r0, r1, n) {                    // 两点之间的（锥形）圆柱
      var d = b.clone().sub(a), L = d.length();
      var geo = new THREE.CylinderGeometry(r1, r0, L, n, 1, false);
      geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.normalize()));
      geo.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      return geo;
    };
    var add = function (geo, m, x, yy, z, rx, ry, rz, sx, sy, sz) {
      var me = new THREE.Mesh(geo, m); me.position.set(x || 0, yy || 0, z || 0); if (rx || ry || rz) me.rotation.set(rx || 0, ry || 0, rz || 0);
      if (sx) me.scale.set(sx, sy, sz); me.castShadow = true; me.receiveShadow = true; g.add(me); return me;
    };
    add(new THREE.CylinderGeometry(1.9, 2.05, 1.0, 8), gold, 0, 1.9, 0);                       // 下降级（金色隔热层）
    add(new THREE.CylinderGeometry(1.45, 1.9, 0.25, 8), dark, 0, 1.3, 0);
    var cab = add(new THREE.SphereGeometry(1.25, 20, 14), white, 0, 3.35, 0); cab.scale.set(1, 0.92, 1);   // 上升级
    add(new THREE.CylinderGeometry(0.22, 0.3, 0.35, 10), dark, 0, 2.42, 0);
    add(new THREE.CylinderGeometry(0.1, 0.1, 1.1, 6), white, 0.5, 4.9, -0.3);                  // 天线杆
    var dish = add(new THREE.ConeGeometry(0.42, 0.22, 16, 1, true), white, 0.5, 5.5, -0.3, 0.9, 0, 0);
    dish.material = white;
    for (var k = 0; k < 4; k++) {                                                              // 四条着陆腿：主腿 + 斜撑，都用两点圆柱摆
      var a = Math.PI / 4 + k * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
      add(cyl(V3(ca * 1.55, 1.36, sa * 1.55), V3(ca * 3.05, 0.10, sa * 3.05), 0.055, 0.045, 7), dark);
      add(cyl(V3(ca * 2.45, 0.62, sa * 2.45), V3(ca * 1.15, 1.95, sa * 1.15), 0.028, 0.028, 5), dark);
      add(new THREE.CylinderGeometry(0.46, 0.5, 0.08, 14), gold, ca * 3.05, 0.04, sa * 3.05);    // 脚垫
    }
    add(new THREE.CylinderGeometry(0.05, 0.06, 1.0, 8), dark, -1.3, 3.2, 1.0);                 // 小舱窗
    var flagX = 3.6, flagZ = 2.6;
    add(new THREE.CylinderGeometry(0.028, 0.034, 3.2, 8), white, flagX, 1.6, flagZ);
    add(new THREE.CylinderGeometry(0.016, 0.016, 1.25, 6), white, flagX, 3.16, flagZ + 0.62, Math.PI / 2);   // 顶部横杆
    var flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.66), withSunVis(new THREE.MeshStandardMaterial({ map: this.tex.flag, roughness: 0.85, side: THREE.DoubleSide }), this.uSunVis));
    flag.position.set(flagX, 2.81, flagZ + 0.62); flag.castShadow = true;
    g.add(flag);
    g.rotation.y = -0.55;
    this.scene.add(g);
    this.camp = g;
  };

  /* 月面上某点是否被地形挡住阳光（与着色器里同一步进），给车、鹈鹕、石头用 */
  World.prototype.sunVisibilityAt = function (x, y, z) {
    var sd = this.uSunDir.value;
    if (sd.y <= 0.0) return 0;
    var sh = 1, t = 0.3, i, h;
    for (i = 0; i < 18; i++) {
      h = T.heightAt(this.field, x + sd.x * t, z + sd.z * t);
      sh = Math.min(sh, clamp(0.5 + 60 * (y + sd.y * t - h), 0, 1)); t *= 1.22;
    }
    for (i = 0; i < 12; i++) {
      h = T.heightAt(this.field, x + sd.x * t, z + sd.z * t);
      sh = Math.min(sh, clamp(0.5 + 2 * (y + sd.y * t - h), 0, 1)); t += 9;
    }
    return sh;
  };

  /* 每帧：state = 车的快照；dt 实际秒；timeScale = 月面时间流速 */
  World.prototype.update = function (dt, st, bike, timeScale, dpr) {
    var THREE = this.THREE;
    this.clock += dt * timeScale;
    this.phase = S.DEFAULT_PHASE + this.clock / (S.DAY * 86400);
    var sky = this.sky = S.sky(this.phase);
    var sd = sky.sun, sun = this.uSunDir.value;
    sun.set(sd[0], sd[1], sd[2]);

    // 光照：太阳白光恒定（没有大气散射，日落也不会变红），只是高度角决定一切
    var day = smooth(-0.015, 0.06, sd[1]);
    this.sun.intensity = SUN_I * day;
    this.sun.visible = day > 0.001;
    this.bounce.intensity = ALBEDO * SUN_I * Math.max(sd[1], 0);                 // 月面反光 ≈ 反照率 × 太阳辐照 × sin(高度角)
    this.bounce.color.setRGB(1, 0.985, 0.95);
    this.earthshine.intensity = 0.055 * sky.earthLit * smooth(-0.05, 0.1, -sd[1]) * (0.6 + 0.4 * S.EARTH_DIR[1]);   // 夜里只剩地球照（已放大约 200 倍以便观看）
    this.scene.environmentIntensity = 0.35 * Math.max(day, 0.25 * sky.earthLit);
    this.starMat.uniforms.uDpr.value = dpr;

    // 地形网格跟随（对齐到 2 m 格，顶点不游动）
    var snap = 0.5;                                  // 跟着车走：顶点沿着双线性曲面滑动，不会一格一格跳
    this.terrain.position.set(Math.round(st.x / snap) * snap, 0, Math.round(st.z / snap) * snap);
    var key = Math.floor(st.x / T.ROCK_CELL) * 1000 + Math.floor(st.z / T.ROCK_CELL);
    if (key !== this.lastCell) { this.lastCell = key; this._refreshRocks(st.x, st.z); }

    // 阴影相机跟着车
    var tx = Math.round(st.x * 4) / 4, tz = Math.round(st.z * 4) / 4, ty = Math.round(st.y * 4) / 4;
    this.sun.target.position.set(tx, ty, tz);
    this.sun.position.set(tx + sun.x * 90, ty + sun.y * 90, tz + sun.z * 90);
    this.sun.target.updateMatrixWorld();

    // 月尘：解析抛物线的位置由仿真给出，这里只搬运
    if (bike) {
      var d = bike.dust, n = d.n;
      for (var i = 0; i < n; i++) { this.dustPos[i * 3] = d.px[i]; this.dustPos[i * 3 + 1] = d.py[i]; this.dustPos[i * 3 + 2] = d.pz[i]; }
      this.dust.geometry.attributes.position.needsUpdate = true;
      this.dust.geometry.setDrawRange(0, n);
    }

    // 天空：地球自转 + 天平动；星空绕黄极慢转（时间加速时才看得出）
    var E = S.EARTH_DIR, P = this._pole || (this._pole = new THREE.Vector3(-0.0947, 0.8387, 0.5366).normalize());
    var secs = this.clock + S.DEFAULT_PHASE * S.DAY * 86400;
    var lonL = 6.8 * Math.PI / 180 * Math.sin(2 * Math.PI * secs / (27.554 * 86400) - 1.2);
    var latL = 5.5 * Math.PI / 180 * Math.sin(2 * Math.PI * secs / (27.213 * 86400) + 0.4);
    var eDir = new THREE.Vector3(E[0], E[1], E[2]);
    var east = new THREE.Vector3().crossVectors(P, eDir).normalize(), north = new THREE.Vector3().crossVectors(eDir, east).normalize();
    eDir.addScaledVector(east, Math.tan(lonL)).addScaledVector(north, Math.tan(latL)).normalize();
    this.earthGroup.position.copy(eDir).multiplyScalar(420);
    var s0 = S.sky(S.DEFAULT_PHASE).sun, q = new THREE.Vector3(s0[0], s0[1], s0[2]);
    var axis = new THREE.Vector3().copy(P).addScaledVector(q.clone().sub(P.clone().multiplyScalar(q.dot(P))).normalize(), 0.43).normalize();   // 地轴：黄赤交角 23.4°
    this.earth.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
    this.earth.rotateY(secs / 86164 * 2 * Math.PI + 2.1);
    this.earthClouds.quaternion.copy(this.earth.quaternion); this.earthClouds.rotateY(secs / 86164 * 2 * Math.PI * 1.035);
    this.skyLight.position.copy(this.earthGroup.position).addScaledVector(sun, 100);
    this.skyLight.target.position.copy(this.earthGroup.position);
    this.skyLight.target.updateMatrixWorld();
    this.skyLight.intensity = SUN_I;
    this.skyScene.children[this.skyScene.children.indexOf(this.stars)] && this.stars.rotation.set(0, 0, 0);
    this.stars.quaternion.setFromAxisAngle(P, -secs / (S.DAY * 86400) * 2 * Math.PI);
    this.milky.quaternion.copy(this.stars.quaternion);
    this.sunDisk.position.copy(sun).multiplyScalar(470); this.sunHalo.position.copy(this.sunDisk.position);
    this.sunDisk.visible = this.sunHalo.visible = sd[1] > -0.02;
    this.uSunVis.value = Math.min(1, this.sunVisibilityAt(st.x, st.y + 1.0, st.z) + 0.0);   // 车身处的月面自遮挡

    // 知识牌 / 营地：摆在离车最近的那个周期像上（坐标是周期的，牌子要出现在骑得到的地方）
    for (k = 0; k < this.plaques.length; k++) { var pd = this.plaques[k].data; this.plaques[k].group.position.x = st.x + T.dWrap(pd.x - st.x); this.plaques[k].group.position.z = st.z + T.dWrap(pd.z - st.z); }
    this.camp.position.x = st.x + T.dWrap(T.CAMP.x - st.x); this.camp.position.z = st.z + T.dWrap(T.CAMP.z - st.z);

    // 知识牌：未发现的灯呼吸，发现的常亮白色
    var t = this.clock;
    for (var k = 0; k < this.plaques.length; k++) {
      var pl = this.plaques[k], found = pl.data.found;
      pl.lamp.color.setHex(found ? 0xf2f0ea : 0xffa21f);
      pl.beam.opacity = found ? 0.12 : 0.38 + 0.26 * Math.sin(t * 3.1 + k);
      pl.lampMesh.scale.setScalar(found ? 0.85 : 1 + 0.18 * Math.sin(t * 3.1 + k));
    }
  };

  // 世界平移了一个瓦片周期（车跨过坐标边界）：车辙是唯一记着世界坐标的东西，跟着挪
  World.prototype.shift = function (dx, dz) {
    var names = ['r', 'f'], i, k, rb, a;
    for (i = 0; i < 2; i++) {
      rb = this.ribbons[names[i]]; a = rb.pos;
      for (k = 0; k < rb.n; k++) { a[k * 6] += dx; a[k * 6 + 2] += dz; a[k * 6 + 3] += dx; a[k * 6 + 5] += dz; }
      if (rb.prev) { rb.prev = { side: rb.prev.side, x: rb.prev.x + dx, z: rb.prev.z + dz, skid: rb.prev.skid }; }
      rb.g.attributes.position.needsUpdate = true;
    }
  };

  World.prototype.addTracks = function (queue) {
    for (var i = 0; i < queue.length; i++) this.ribbons[queue[i].side === 'f' ? 'f' : 'r'].add(queue[i]);
  };

  World.prototype.resize = function (w, h) {
    this.skyCam.aspect = w / h;
    this.skyCam.fov = this.camera.fov;
    this.skyCam.updateProjectionMatrix();
  };

  World.prototype.render = function () {
    var r = this.renderer;
    this.skyCam.quaternion.copy(this.camera.quaternion);
    r.clear();
    r.render(this.skyScene, this.skyCam);
    r.clearDepth();
    r.render(this.scene, this.camera);
  };

  World.prototype.setCameraFov = function (fov) { this.skyCam.fov = fov; this.skyCam.updateProjectionMatrix(); };

  PM.World = World;
  PM.withSunVis = withSunVis;
  PM.f2h = f2h;
  PM.MOON_R = MOON_R;
})();
