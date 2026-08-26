/**
 * gif.js — 精简 GIF89a 编码器(自研实现)
 * 输入:RGBA 帧序列 + 全局调色板 + 每帧延时 → 输出动画 GIF Blob。
 * 全有或全无透明:alpha < 128 视为透明色索引。
 */

/** 从多帧 RGBA 收集精确调色板(最多 255 色 + 1 透明位),返回 {palette:[[r,g,b]], index:Map} */
export function buildPalette(frames) {
  const freq = new Map();
  for (const data of frames) {
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      // 边缘抗锯齿色很多 —— 按 3bit 量化入桶统计,取代表色
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      const e = freq.get(key);
      if (e) { e.n++; e.r += r; e.g += g; e.b += b; }
      else freq.set(key, { n: 1, r, g, b });
    }
  }
  const sorted = [...freq.values()].sort((a, b) => b.n - a.n).slice(0, 255);
  const palette = sorted.map((e) => [
    Math.round(e.r / e.n) & 0xf8,
    Math.round(e.g / e.n) & 0xf8,
    Math.round(e.b / e.n) & 0xf8,
  ]);
  const index = new Map();
  palette.forEach(([r, g, b], i) => index.set(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3), i));
  return { palette, index };
}

/** 全帧 LZW 编码(GIF 变体) */
function lzwEncode(indices, minCodeSize) {
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  let codeSize = minCodeSize + 1;
  let dictSize = eoi + 1;
  let dict = new Map();
  const resetDict = () => { dict = new Map(); dictSize = eoi + 1; codeSize = minCodeSize + 1; };

  // 位流(LSB first)
  const bytes = [];
  let cur = 0, curBits = 0;
  const emit = (code) => {
    cur |= code << curBits;
    curBits += codeSize;
    while (curBits >= 8) {
      bytes.push(cur & 0xff);
      cur >>= 8;
      curBits -= 8;
    }
  };

  emit(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (prefix << 8) | k;
    const found = dict.get(key);
    if (found !== undefined) {
      prefix = found;
    } else {
      emit(prefix);
      dict.set(key, dictSize++);
      if (dictSize === 1 << codeSize) {
        if (codeSize < 12) codeSize++;
        else { emit(clear); resetDict(); }
      }
      prefix = k;
    }
  }
  emit(prefix);
  emit(eoi);
  if (curBits > 0) bytes.push(cur & 0xff);
  return bytes;
}

/** 打包为 GIF 文件字节 */
export function encodeGif({ frames, palette, delays, loop = 0 }) {
  const out = [];
  const push = (...b) => out.push(...b);
  const pushShort = (v) => push(v & 0xff, (v >> 8) & 0xff);

  // Header + LSD
  push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61); // GIF89a
  const w = frames[0].width, h = frames[0].height;
  let colorBits = 1;
  while ((1 << colorBits) < palette.length) colorBits++;
  const tableSize = 1 << colorBits;
  push(w & 0xff, (w >> 8) & 0xff, h & 0xff, (h >> 8) & 0xff);
  push(0x80 | ((colorBits - 1) << 4) | (colorBits - 1), 0, 0); // 全局色表
  for (let i = 0; i < tableSize; i++) {
    const c = palette[i] || [0, 0, 0];
    push(c[0], c[1], c[2]);
  }

  // Netscape 循环扩展
  push(0x21, 0xff, 0x0b);
  for (const ch of 'NETSCAPE2.0') push(ch.charCodeAt(0));
  push(0x03, 0x01);
  pushShort(loop);
  push(0);

  const transparentIndex = tableSize - 1 >= 255 ? 255 : palette.length; // 追加一个透明槽
  frames.forEach((frame, fi) => {
    // GCE
    push(0x21, 0xf9, 0x04);
    push(0x01, Math.round(delays[fi] / 10) & 0xff, (Math.round(delays[fi] / 10) >> 8) & 0xff); // 处置=不处置
    push(transparentIndex, 0);

    // Image Descriptor
    push(0x2c, 0, 0, w & 0xff, (w >> 8) & 0xff, h & 0xff, (h >> 8) & 0xff, 0);

    // 索引化
    const { data } = frame;
    const indices = new Uint8Array(w * h);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      if (data[i + 3] < 128) { indices[p] = transparentIndex; continue; }
      const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
      indices[p] = indexLookup(palette, key);
    }
    // LZW
    const minCodeSize = Math.max(2, colorBits);
    push(minCodeSize);
    const compressed = lzwEncode(indices, minCodeSize);
    for (let i = 0; i < compressed.length; i += 255) {
      const chunk = compressed.slice(i, i + 255);
      push(chunk.length, ...chunk);
    }
    push(0);
  });

  push(0x3b); // Trailer
  return new Blob([new Uint8Array(out)], { type: 'image/gif' });
}

function indexLookup(palette, key) {
  // 命中缓存表由调用方传入 index map 更快;此处直接线性回退(色表桶一致,基本直接命中)
  return PALETTE_CACHE.get(key) ?? 0;
}

let PALETTE_CACHE = new Map();
export function setPaletteCache(map) { PALETTE_CACHE = map; }
