// 贴图工厂：格纹围巾 / 南瓜帽球面贴图 / 接触阴影。统一 document.createElement('canvas') + CanvasTexture。
import * as THREE_NS from 'three';

// 确定性伪随机（LCG）：同参数重生成贴图结果一致
function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function makeCanvas(size) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  return [cv, cv.getContext('2d')];
}

// 苏格兰格：深底 + 半透明宽带 + 亮橙中线（lighter 叠加，横竖交点自然提亮）+ 棕细线，最后撒布纹噪点
export function makePlaidTexture(THREE, opts = {}) {
  const T = THREE || THREE_NS;
  const S = opts.size || 512;
  const P = S / 4; // 格周期，实际重复次数由调用方设 repeat
  const [cv, g] = makeCanvas(S);
  g.fillStyle = '#2b2732';
  g.fillRect(0, 0, S, S);
  const band = P * 0.52;
  g.fillStyle = 'rgba(58,51,66,0.55)';
  for (let c = 0; c <= S; c += P) { // 循环画到 S 保证左右/上下 wrap 连续
    g.fillRect(c - band / 2, 0, band, S);
    g.fillRect(0, c - band / 2, S, band);
  }
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = 'rgba(217,142,60,0.85)';
  const lw = P * 0.11;
  for (let c = 0; c <= S; c += P) {
    g.fillRect(c - lw / 2, 0, lw, S);
    g.fillRect(0, c - lw / 2, S, lw);
  }
  g.fillStyle = 'rgba(138,90,51,0.9)';
  const tw = Math.max(3, P * 0.035);
  for (let c = 0; c <= S; c += P) {
    const d = c + P / 2;
    g.fillRect(d - tw / 2, 0, tw, S);
    g.fillRect(0, d - tw / 2, S, tw);
  }
  g.globalCompositeOperation = 'source-over';
  const rnd = lcg(7); // 布纹噪点：细碎冷暖明暗点
  for (let i = 0; i < S * 14; i++) {
    const a = (0.03 + rnd() * 0.06).toFixed(3);
    g.fillStyle = rnd() < 0.5 ? `rgba(255,244,225,${a})` : `rgba(10,8,14,${a})`;
    g.fillRect((rnd() * S) | 0, (rnd() * S) | 0, rnd() < 0.7 ? 1 : 2, rnd() < 0.5 ? 1 : 2);
  }
  const tex = new T.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = T.RepeatWrapping;
  tex.colorSpace = T.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

// 南瓜帽球面贴图。CanvasTexture flipY：画布 y=0 即球顶。瓣沟画在 u = k/8，
// 与几何位移 r *= 1 + 0.055*cos(8θ)（θ=atan2(x,z)，three 球体 u→θ 相位差恰为 cos(8θ) 整周期）的波峰对准。
export function makePumpkinTexture(THREE, opts = {}) {
  const T = THREE || THREE_NS;
  const S = opts.size || 1024;
  const [cv, g] = makeCanvas(S);
  const rnd = lcg(21);
  g.fillStyle = '#e08832';
  g.fillRect(0, 0, S, S);
  for (let k = 0; k < 8; k++) { // 瓣面中央提亮，逐瓣微差
    const xc = (k + 0.5) * S / 8, w = S * 0.11;
    const gr = g.createLinearGradient(xc - w / 2, 0, xc + w / 2, 0);
    gr.addColorStop(0, 'rgba(235,154,66,0)');
    gr.addColorStop(0.5, `rgba(235,154,66,${(0.30 + rnd() * 0.12).toFixed(2)})`);
    gr.addColorStop(1, 'rgba(235,154,66,0)');
    g.fillStyle = gr;
    g.fillRect(xc - w / 2, 0, w, S);
  }
  const groove = (w, col) => { // 微弯手绘沟；u=0 接缝处平移补画一份保证环绕连续
    g.lineWidth = w;
    g.strokeStyle = col;
    g.beginPath();
    for (let k = 0; k < 8; k++) {
      const x0 = k * S / 8, ph = k * 2.399;
      for (let y = -8; y <= S + 8; y += S / 24) {
        const x = x0 + Math.sin(y * 0.012 + ph) * S * 0.004 + (rnd() - 0.5) * 3;
        if (y < 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
    }
    g.stroke();
    g.save();
    g.translate(S, 0);
    g.stroke();
    g.restore();
  };
  groove(S * 0.024, 'rgba(200,112,31,0.50)');
  groove(S * 0.009, 'rgba(146,76,20,0.42)');
  const ao = (from, to, a) => { // 顶/底轻压暗（AO 感）
    const gr = g.createLinearGradient(0, from, 0, to);
    gr.addColorStop(0, `rgba(104,50,12,${a})`);
    gr.addColorStop(1, 'rgba(104,50,12,0)');
    g.fillStyle = gr;
    g.fillRect(0, Math.min(from, to), S, Math.abs(to - from));
  };
  ao(0, S * 0.11, 0.38);
  ao(S, S * 0.885, 0.32);
  // 杰克灯脸：u=0.5（画布 x 中心），v∈[0.40,0.70] → 画布 y∈[0.30,0.60]S；顶点抖 2-3px 手绘感，不发光
  const K = S / 1024;
  const j = (p, a = 2.6) => [p[0] * K + (rnd() - 0.5) * 2 * a, p[1] * K + (rnd() - 0.5) * 2 * a];
  const poly = (pts) => {
    g.beginPath();
    pts.forEach((p, i) => { const q = j(p); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); });
    g.closePath();
    g.fill();
  };
  g.fillStyle = '#3a2418';
  poly([[398, 346], [472, 366], [448, 452]]); // 左眼：顶边内低外高、底尖偏内 = 内倾
  poly([[626, 346], [552, 366], [576, 452]]); // 右眼镜像
  const A = j([402, 494]), B = j([622, 494]);
  g.beginPath(); // 咧嘴：上缘浅弧 + 下缘深弧的月牙 grin
  g.moveTo(A[0], A[1]);
  g.quadraticCurveTo(j([512, 526])[0], j([512, 526])[1], B[0], B[1]);
  g.quadraticCurveTo(j([512, 640])[0], j([512, 640])[1], A[0], A[1]);
  g.closePath();
  g.fill();
  g.fillStyle = '#e08832'; // 三角齿：上唇挂下的瓜肉三角，齿间留暗缝
  poly([[432, 503], [472, 505], [452, 540]]);
  poly([[492, 509], [532, 509], [512, 548]]);
  poly([[552, 505], [592, 503], [572, 540]]);
  const tex = new T.CanvasTexture(cv);
  tex.wrapS = T.RepeatWrapping;
  tex.wrapT = T.ClampToEdgeWrapping;
  tex.colorSpace = T.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

// 接触阴影：径向渐变中心黑 alpha 0.55 → 边缘 0
export function makeSoftShadowTexture(THREE, opts = {}) {
  const T = THREE || THREE_NS;
  const S = opts.size || 256;
  const [cv, g] = makeCanvas(S);
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  const tex = new T.CanvasTexture(cv);
  tex.colorSpace = T.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
