/**
 * exporter.js — 静图 / 动图导出
 * PNG:canvas 直出;GIF:自研编码器逐帧渲染;WebM:MediaRecorder 实时录制。
 * canvas 渲染与 DOM 共用 computeFrame 纯函数,导出画面 = 页面所见。
 */
import { computeFrame } from './core/engine.js';

const VIEW = 316; // viewBox -158..158

/** 建离线画布,返回 {canvas, ctx, renderFrame(state, t, bgColor|null)} */
function makeCanvas(px) {
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext('2d', { alpha: true });
  const renderFrame = (state, t, bgColor) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, px, px);
    if (bgColor) {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, px, px);
    }
    const scale = px / VIEW;
    ctx.setTransform(scale, 0, 0, scale, px / 2, px / 2);
    const { bodyD, eyeD } = computeFrame(state.shape, state.mood, state.animId || 'idle', t);
    const path = new Path2D(bodyD + eyeD);
    ctx.fillStyle = state.color;
    ctx.fill(path, 'evenodd');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };
  return { canvas, ctx, renderFrame };
}

/** 当前帧 PNG blob */
export async function exportPng(state, px = 720, bgColor = null) {
  const { canvas, renderFrame } = makeCanvas(px);
  renderFrame(state, 0, bgColor);
  return await new Promise((res) => canvas.toBlob(res, 'image/png'));
}

export function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export async function copyPngToClipboard(state, px = 720) {
  const blob = await exportPng(state, px, '#ffffff');
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

/**
 * 逐帧渲染 GIF。duration 毫秒,fps 帧率,bg: null(透明)|'#fff'
 */
export async function exportGif(state, { duration = 3000, fps = 25, px = 480, bg = null, onProgress } = {}) {
  const total = Math.max(2, Math.round((duration / 1000) * fps));
  const delay = 1000 / fps;
  const { canvas, ctx, renderFrame } = makeCanvas(px);
  const frames = [];
  for (let i = 0; i < total; i++) {
    renderFrame(state, i / fps, bg);
    frames.push({ width: px, height: px, data: ctx.getImageData(0, 0, px, px).data });
    if (onProgress) onProgress(i / total);
    if (i % 4 === 0) await new Promise((r) => setTimeout(r)); // 让出主线程
  }
  const { buildPalette, encodeGif, setPaletteCache } = await import('./core/gif.js');
  const { palette, index } = buildPalette(frames);
  setPaletteCache(index);
  const blob = encodeGif({ frames, palette, delays: frames.map(() => delay) });
  if (onProgress) onProgress(1);
  return blob;
}

/** WebM 录制:实时播放 duration 毫秒并录制 */
export function exportWebm(state, { duration = 3000, px = 480, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const { canvas, renderFrame } = makeCanvas(px);
    // 首帧铺白底,WebM 无透明通道
    renderFrame(state, 0, '#ffffff');
    const stream = canvas.captureStream(60);
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
      .find((m) => MediaRecorder.isTypeSupported(m));
    if (!mime) return reject(new Error('MediaRecorder unsupported'));
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
    rec.onerror = reject;
    const t0 = performance.now();
    rec.start();
    const draw = (now) => {
      const t = now - t0;
      renderFrame(state, t / 1000, '#ffffff');
      if (onProgress) onProgress(Math.min(1, t / duration));
      if (t < duration) requestAnimationFrame(draw);
      else rec.stop();
    };
    requestAnimationFrame(draw);
  });
}

/** 序列导出:把整个轨道合成成一段连续动画(把轨道条目依次映射为状态动画段) */
export async function exportSequenceGif(clips, getClipState, { fps = 25, px = 480, bg = '#ffffff', onProgress } = {}) {
  const totalMs = clips.reduce((s, c) => s + c.duration, 0);
  const total = Math.max(2, Math.round((totalMs / 1000) * fps));
  const { canvas, ctx, renderFrame } = makeCanvas(px);
  const frames = [];
  const delays = [];
  for (let i = 0; i < total; i++) {
    const tMs = (i / fps) * 1000;
    // 定位片段
    let acc = 0, clip = clips[clips.length - 1], localT = 0;
    for (const c of clips) {
      if (tMs < acc + c.duration) { clip = c; localT = (tMs - acc) / 1000; break; }
      acc += c.duration;
    }
    const st = { ...getClipState(clip) };
    renderFrame(st, localT, bg === null ? null : bg);
    frames.push({ width: px, height: px, data: ctx.getImageData(0, 0, px, px).data });
    delays.push(1000 / fps);
    if (onProgress) onProgress(i / total);
    if (i % 4 === 0) await new Promise((r) => setTimeout(r));
  }
  const { buildPalette, encodeGif, setPaletteCache } = await import('./core/gif.js');
  const { palette, index } = buildPalette(frames);
  setPaletteCache(index);
  return encodeGif({ frames, palette, delays });
}
