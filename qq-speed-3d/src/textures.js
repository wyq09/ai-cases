import * as THREE from 'three';

function canvasTexture(w, h, draw, opts = {}) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  if (opts.repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(opts.repeat[0], opts.repeat[1]);
  }
  if (opts.clamp) {
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  }
  tex.anisotropy = opts.aniso || 4;
  tex.needsUpdate = true;
  return tex;
}

function noise(ctx, w, h, count, palette, alpha = 0.08, size = 2) {
  for (let i = 0; i < count; i++) {
    ctx.globalAlpha = alpha * (0.35 + Math.random() * 0.65);
    ctx.fillStyle = palette[(Math.random() * palette.length) | 0];
    const s = size * (0.5 + Math.random());
    ctx.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
  ctx.globalAlpha = 1;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createTextures(renderer) {
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const asphalt = canvasTexture(256, 512, (ctx, w, h) => {
    ctx.fillStyle = '#2c3542';
    ctx.fillRect(0, 0, w, h);
    // fine aggregate grain
    noise(ctx, w, h, 9000, ['#ffffff', '#0b0f18', '#556075'], 0.055, 1.2);
    // faint longitudinal tyre polish bands
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, 'rgba(0,0,0,.22)');
    grad.addColorStop(0.18, 'rgba(0,0,0,0)');
    grad.addColorStop(0.34, 'rgba(255,255,255,.035)');
    grad.addColorStop(0.5, 'rgba(0,0,0,.05)');
    grad.addColorStop(0.66, 'rgba(255,255,255,.035)');
    grad.addColorStop(0.82, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,.22)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    // subtle seams every few metres
    ctx.fillStyle = 'rgba(10,14,20,.16)';
    ctx.fillRect(0, 0, w, 3);
    // edge lines
    ctx.fillStyle = 'rgba(233,245,255,.82)';
    ctx.fillRect(3, 0, 4, h);
    ctx.fillRect(249, 0, 4, h);
    // slim dashed centre line
    for (let y = 0; y < h; y += 96) {
      ctx.fillStyle = 'rgba(230,240,252,.55)';
      ctx.fillRect(125, y, 6, 46);
    }
  }, { repeat: [1, 1], aniso });

  const arrowPad = canvasTexture(256, 512, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    for (let y = -32; y < h + 128; y += 128) {
      ctx.save();
      ctx.translate(w / 2, y + 64);
      ctx.shadowColor = '#2ee6ff';
      ctx.shadowBlur = 28;
      ctx.strokeStyle = '#b9fbff';
      ctx.lineWidth = 20;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-58, 34);
      ctx.lineTo(0, -34);
      ctx.lineTo(58, 34);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,255,255,.92)';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(-58, 34);
      ctx.lineTo(0, -34);
      ctx.lineTo(58, 34);
      ctx.stroke();
      ctx.fillStyle = 'rgba(46,230,255,.22)';
      ctx.fillRect(-88, -12, 176, 44);
      ctx.restore();
    }
  }, { repeat: [1, 1], aniso });

  const checker = canvasTexture(512, 128, (ctx, w, h) => {
    const cols = 16, rows = 4;
    for (let x = 0; x < cols; x++) {
      for (let y = 0; y < rows; y++) {
        ctx.fillStyle = (x + y) % 2 ? '#0a1018' : '#f4f7ff';
        ctx.fillRect((x * w) / cols, (y * h) / rows, w / cols, h / rows);
      }
    }
  }, { aniso });

  const crowd = canvasTexture(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#101c2e';
    ctx.fillRect(0, 0, w, h);
    const tones = ['#c9d6e6', '#f2b45c', '#e2604f', '#5fb4d8', '#e8eef6', '#7fae6d', '#d78bb4', '#9aa8c4'];
    for (let tier = 0; tier < 7; tier++) {
      ctx.fillStyle = tier % 2 ? '#16283f' : '#0f1d31';
      ctx.fillRect(0, tier * 37, w, 37);
      for (let x = 4 + (tier % 2) * 5; x < w; x += 10 + Math.random() * 4) {
        const y = tier * 37 + 16 + Math.random() * 7;
        const tone = tones[(Math.random() * tones.length) | 0];
        ctx.globalAlpha = 0.55 + Math.random() * 0.4;
        ctx.fillStyle = tone;
        ctx.beginPath();
        ctx.arc(x, y, 2.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(x - 2.4, y + 2.4, 4.8, 8);
      }
      // tier lip
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#050d18';
      ctx.fillRect(0, tier * 37 + 33, w, 4);
      ctx.globalAlpha = 1;
    }
    // scattered flags and leds
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      ctx.globalAlpha = 0.5 + Math.random() * 0.5;
      ctx.fillStyle = i % 3 === 0 ? '#ff8a2a' : i % 3 === 1 ? '#6ff0ff' : '#ffffff';
      ctx.fillRect(x, y, 2.2, 6 + Math.random() * 7);
    }
    ctx.globalAlpha = 1;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,255,255,.1)');
    g.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, { aniso });

  const cloud = canvasTexture(256, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const blobs = [
      [0.28, 0.62, 0.2], [0.43, 0.44, 0.26], [0.59, 0.52, 0.22],
      [0.72, 0.64, 0.17], [0.52, 0.7, 0.24], [0.36, 0.72, 0.18],
    ];
    for (const [x, y, r] of blobs) {
      const g = ctx.createRadialGradient(x * w, y * h, 0, x * w, y * h, r * w);
      g.addColorStop(0, 'rgba(255,255,255,.95)');
      g.addColorStop(0.55, 'rgba(245,251,255,.72)');
      g.addColorStop(1, 'rgba(230,246,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }, { aniso });

  const glow = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,.85)');
    g.addColorStop(0.55, 'rgba(255,255,255,.28)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, { linear: true, clamp: true });

  const smoke = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,.65)');
    g.addColorStop(0.4, 'rgba(255,255,255,.32)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, { linear: true, clamp: true });

  const grass = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#5cae57';
    ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 5200, ['#3f9544', '#86cf6d', '#2e7d3a', '#aee187'], 0.11, 2.4);
    for (let i = 0; i < 46; i++) {
      ctx.globalAlpha = 0.05 + Math.random() * 0.06;
      ctx.fillStyle = Math.random() > 0.5 ? '#2c7836' : '#a9e884';
      ctx.beginPath();
      ctx.ellipse(Math.random() * w, Math.random() * h, 8 + Math.random() * 22, 5 + Math.random() * 12, Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }, { repeat: [24, 24], aniso });

  const sand = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#efd49b';
    ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 3500, ['#ffe9b8', '#c9a86a', '#fff3d1'], 0.18, 2.2);
    for (let i = 0; i < 40; i++) {
      ctx.globalAlpha = 0.07;
      ctx.fillStyle = '#b08d55';
      ctx.beginPath();
      ctx.ellipse(Math.random() * w, Math.random() * h, 16 + Math.random() * 40, 4 + Math.random() * 10, Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }, { repeat: [12, 12], aniso });

  const windows = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#1a2a44';
    ctx.fillRect(0, 0, w, h);
    for (let y = 10; y < h; y += 22) {
      for (let x = 10; x < w; x += 20) {
        const on = Math.random() > 0.32;
        ctx.fillStyle = on
          ? (Math.random() > 0.72 ? '#7be8ff' : '#ffd98a')
          : '#0e1828';
        ctx.globalAlpha = on ? 0.55 + Math.random() * 0.45 : 0.8;
        ctx.fillRect(x, y, 10, 13);
      }
    }
    ctx.globalAlpha = 1;
  }, { repeat: [1, 1], aniso });

  const envMap = canvasTexture(512, 256, (ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.55);
    sky.addColorStop(0, '#2f7fd8');
    sky.addColorStop(0.55, '#8fdcff');
    sky.addColorStop(1, '#eaf9ff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h * 0.55);
    const ground = ctx.createLinearGradient(0, h * 0.55, 0, h);
    ground.addColorStop(0, '#e8d6ac');
    ground.addColorStop(0.4, '#5ea35c');
    ground.addColorStop(1, '#2f5d3a');
    ctx.fillStyle = ground;
    ctx.fillRect(0, h * 0.55, w, h * 0.45);
    const sun = ctx.createRadialGradient(w * 0.7, h * 0.26, 0, w * 0.7, h * 0.26, 70);
    sun.addColorStop(0, 'rgba(255,255,240,1)');
    sun.addColorStop(0.15, 'rgba(255,240,190,.95)');
    sun.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, w, h);
  }, { linear: true, clamp: true });
  envMap.mapping = THREE.EquirectangularReflectionMapping;

  const billboard = (title, sub, c1, c2, accent) => canvasTexture(512, 288, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 16;
    for (let i = -h; i < w + h; i += 54) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + h, h);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, 14, h);
    ctx.fillRect(w - 14, 0, 14, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(4,14,26,.35)';
    ctx.font = '900 104px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText(title, w / 2 + 5, h * 0.44 + 6);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(title, w / 2, h * 0.44);
    ctx.font = '700 34px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.82)';
    ctx.fillText(sub, w / 2, h * 0.72);
    ctx.strokeStyle = 'rgba(255,255,255,.5)';
    ctx.lineWidth = 3;
    ctx.strokeRect(22, 18, w - 44, h - 36);
  }, { aniso });

  const startBanner = canvasTexture(1024, 192, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#ff6a00');
    g.addColorStop(0.5, '#ffd23f');
    g.addColorStop(1, '#ff6a00');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#071626';
    ctx.fillRect(0, 0, w, 12);
    ctx.fillRect(0, h - 12, w, 12);
    for (let x = 0; x < w; x += 64) {
      ctx.fillStyle = (x / 64) % 2 ? '#071626' : '#f6fbff';
      ctx.fillRect(x, 0, 32, 12);
      ctx.fillRect(x + 32, h - 12, 32, 12);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'italic 900 86px "Arial Black","PingFang SC",sans-serif';
    ctx.fillStyle = 'rgba(6,18,32,.35)';
    ctx.fillText('QQ飞车 · 极速海岸', w / 2 + 6, h / 2 + 8);
    ctx.fillStyle = '#06182b';
    ctx.fillText('QQ飞车 · 极速海岸', w / 2, h / 2);
    ctx.font = '700 24px "PingFang SC",sans-serif';
    ctx.fillStyle = '#7a3a00';
    ctx.fillText('THREE.JS 3D ARCADE RACING · SEASIDE CIRCUIT', w / 2, h - 40);
  }, { aniso });

  const trackBanner = (title, sub, c1, c2, dark) => canvasTexture(1024, 192, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, c1);
    g.addColorStop(0.5, c2);
    g.addColorStop(1, c1);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = dark;
    ctx.fillRect(0, 0, w, 12);
    ctx.fillRect(0, h - 12, w, 12);
    for (let x = 0; x < w; x += 64) {
      ctx.fillStyle = (x / 64) % 2 ? dark : '#f6fbff';
      ctx.fillRect(x, 0, 32, 12);
      ctx.fillRect(x + 32, h - 12, 32, 12);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'italic 900 84px "Arial Black","PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillStyle = 'rgba(4,16,30,.38)';
    ctx.fillText(title, w / 2 + 6, h / 2 + 8);
    ctx.fillStyle = dark;
    ctx.fillText(title, w / 2, h / 2);
    ctx.font = '700 22px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillStyle = 'rgba(10,26,44,.72)';
    ctx.fillText(sub, w / 2, h - 38);
  }, { aniso });

  const flag = canvasTexture(256, 160, (ctx, w, h) => {
    ctx.fillStyle = '#ff7518';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w * 0.62, 0);
    ctx.lineTo(w * 0.4, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#071626';
    ctx.font = 'italic 900 64px "Arial Black",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SPEED', w / 2, h / 2);
  }, { aniso });

  const skid = canvasTexture(64, 64, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(10,12,16,.55)');
    g.addColorStop(0.5, 'rgba(10,12,16,.42)');
    g.addColorStop(1, 'rgba(10,12,16,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, { linear: true, clamp: true });

  // Item crates: glowing "?" cube faces, tinted per biome by the material colour.
  const itemBox = canvasTexture(256, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#1a5c86');
    g.addColorStop(0.5, '#0d2c4e');
    g.addColorStop(1, '#071a30');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // diagonal shine + scanlines
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 12;
    for (let i = -h; i < w + h; i += 46) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + h, h);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(147,247,255,.95)';
    ctx.lineWidth = 12;
    ctx.strokeRect(12, 12, w - 24, h - 24);
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = 3;
    ctx.strokeRect(26, 26, w - 52, h - 52);
    // corner brackets
    ctx.strokeStyle = '#eafcff';
    ctx.lineWidth = 9;
    for (const [x, y, sx, sy] of [[24, 24, 1, 1], [w - 24, 24, -1, 1], [24, h - 24, 1, -1], [w - 24, h - 24, -1, -1]]) {
      ctx.beginPath();
      ctx.moveTo(x, y + sy * 34);
      ctx.lineTo(x, y);
      ctx.lineTo(x + sx * 34, y);
      ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 150px "Arial Black","PingFang SC",sans-serif';
    ctx.shadowColor = '#5ef0ff';
    ctx.shadowBlur = 32;
    ctx.fillStyle = '#eafcff';
    ctx.fillText('?', w / 2, h / 2 + 8);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(94,240,255,.55)';
    ctx.font = '700 16px "Arial Black",sans-serif';
    ctx.fillText('ITEM', w / 2, h - 40);
  }, { aniso });

  // Procedural terrain by biome, cached so endless stage rebuilds never leak canvases.
  const terrainCache = new Map();
  const terrainFor = (theme) => {
    const t = theme.terrain;
    const key = `${theme.id}:${t.kind}:${t.base}`;
    if (terrainCache.has(key)) return terrainCache.get(key);
    const tex = canvasTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = t.base;
      ctx.fillRect(0, 0, w, h);
      noise(ctx, w, h, 6200, t.tones, 0.12, 2.2);
      if (t.kind === 'grass') {
        for (let i = 0; i < 900; i++) {
          ctx.strokeStyle = t.tones[(Math.random() * t.tones.length) | 0];
          ctx.globalAlpha = 0.12 + Math.random() * 0.3;
          ctx.lineWidth = 1 + Math.random();
          const x = Math.random() * w;
          const y = Math.random() * h;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + (Math.random() - 0.5) * 5, y - 3 - Math.random() * 7);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        for (let i = 0; i < 42; i++) {
          ctx.globalAlpha = 0.05 + Math.random() * 0.06;
          ctx.fillStyle = Math.random() > 0.5 ? t.tones[0] : t.accent;
          ctx.beginPath();
          ctx.ellipse(Math.random() * w, Math.random() * h, 8 + Math.random() * 26, 5 + Math.random() * 13, Math.random() * 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else if (t.kind === 'snow') {
        for (let i = 0; i < 40; i++) {
          ctx.globalAlpha = 0.05 + Math.random() * 0.09;
          ctx.fillStyle = i % 2 ? '#ffffff' : t.accent;
          ctx.beginPath();
          ctx.ellipse(Math.random() * w, Math.random() * h, 14 + Math.random() * 40, 7 + Math.random() * 16, Math.random() * 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 240; i++) ctx.fillRect(Math.random() * w, Math.random() * h, 1.4, 1.4);
        ctx.globalAlpha = 1;
      } else if (t.kind === 'crack') {
        ctx.globalAlpha = 0.85;
        for (let i = 0; i < 22; i++) {
          let x = Math.random() * w;
          let y = Math.random() * h;
          ctx.strokeStyle = t.accent;
          ctx.shadowColor = t.accent;
          ctx.shadowBlur = 8;
          ctx.lineWidth = 1.4 + Math.random() * 2.6;
          ctx.beginPath();
          ctx.moveTo(x, y);
          for (let k = 0; k < 4; k++) {
            x += (Math.random() - 0.5) * 34;
            y += (Math.random() - 0.5) * 34;
            ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      } else {
        for (let i = 0; i < 54; i++) {
          ctx.globalAlpha = 0.06 + Math.random() * 0.1;
          ctx.fillStyle = t.tones[(Math.random() * t.tones.length) | 0];
          ctx.beginPath();
          ctx.ellipse(Math.random() * w, Math.random() * h, 10 + Math.random() * 34, 5 + Math.random() * 14, Math.random() * 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }, { repeat: [1, 1], aniso });
    terrainCache.set(key, tex);
    return tex;
  };

  const flame = canvasTexture(64, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.12, 'rgba(255,255,255,.35)');
    g.addColorStop(0.55, 'rgba(255,255,255,.9)');
    g.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // soften side edges
    const side = ctx.createLinearGradient(0, 0, w, 0);
    side.addColorStop(0, 'rgba(0,0,0,1)');
    side.addColorStop(0.22, 'rgba(0,0,0,0)');
    side.addColorStop(0.78, 'rgba(0,0,0,0)');
    side.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = side;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    // hot core streak
    const core = ctx.createLinearGradient(w / 2 - 6, 0, w / 2 + 6, 0);
    core.addColorStop(0, 'rgba(255,255,255,0)');
    core.addColorStop(0.5, 'rgba(255,255,255,.9)');
    core.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = core;
    ctx.fillRect(w / 2 - 6, h * 0.3, 12, h * 0.7);
  }, { linear: true, clamp: true });

  return {
    asphalt, arrowPad, checker, crowd, cloud, glow, smoke, grass, sand,
    windows, envMap, startBanner, flag, skid, aniso, flame, itemBox,
    terrainFor, trackBanner,
    billboard,
    billboards: [
      billboard('氮气加速', 'NITRO BOOST', '#0b2b56', '#0a6f9e', '#2ee6ff'),
      billboard('漂移之王', 'DRIFT KING', '#5b1030', '#c81d5e', '#ffd23f'),
      billboard('极速海岸', 'SEASIDE CIRCUIT', '#0c4a3e', '#20a97e', '#ffd23f'),
      billboard('双喷 COMBO', 'DOUBLE BOOST', '#3a1c05', '#c05a08', '#2ee6ff'),
      billboard('QQ飞车', '3D FAN EDITION', '#101c3c', '#2b4ea8', '#ff7a1a'),
    ],
  };
}
