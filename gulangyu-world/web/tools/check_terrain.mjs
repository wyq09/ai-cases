import fs from 'node:fs';
import zlib from 'node:zlib';

const bin = fs.readFileSync('../assets/terrain.bin');
const meta = JSON.parse(fs.readFileSync('../assets/meta.json', 'utf8'));
const { cols, rows, originX, originZ, cell } = meta.grid;
const h = new Int16Array(bin.buffer, bin.byteOffset, cols * rows);

function sample(x, z) {
  const c = Math.floor((x - originX) / cell), r = Math.floor((z - originZ) / cell);
  if (c < 0 || r < 0 || c >= cols || r >= rows) return null;
  return h[r * cols + c] === -32768 ? 'BLOCKED' : (h[r * cols + c] / 100).toFixed(1) + 'm';
}
console.log('spawn meta (318,66):', sample(318, 66));
console.log('spawn actual (359,107):', sample(359, 107));
console.log('longtou (329,47):', sample(329, 47));
console.log('bagua base (24,-348):', sample(24, -348));
console.log('sunlight rock (-80,265):', sample(-80, 265));
console.log('bridge deck (221,661):', sample(221, 661));
console.log('shuzhuang (130,634):', sample(130, 634));
console.log('catholic (483,62):', sample(483, 62));
console.log('--- 海上抽查（应全部 BLOCKED）---');
console.log('open sea (0,-900):', sample(0, -900));
console.log('open sea east (900,62):', sample(900, 62));
console.log('open sea south (500,-700):', sample(500, -700));
console.log('open sea west (-400,-500):', sample(-400, -500));
let seaBlocked = 0, seaTotal = 0;
for (const [sx, sz] of [[0, -900], [900, 62], [500, -700], [-400, -500]]) {
  seaTotal++;
  if (sample(sx, sz) === 'BLOCKED') seaBlocked++;
}
console.log(`sea check: ${seaBlocked}/${seaTotal} BLOCKED`);

// PNG 输出：blocked=深蓝，高度绿阶
const px = Buffer.alloc(cols * rows * 3);
for (let i = 0; i < cols * rows; i++) {
  if (h[i] === -32768) { px[i * 3] = 18; px[i * 3 + 1] = 42; px[i * 3 + 2] = 84; }
  else {
    const t = Math.max(0, Math.min(1, h[i] / 9500));
    px[i * 3] = 90 + t * 120; px[i * 3 + 1] = 150 - t * 40; px[i * 3 + 2] = 70;
  }
}
// PNG 编码（无滤波）
const raw = Buffer.alloc((cols * 3 + 1) * rows);
for (let r = 0; r < rows; r++) {
  raw[r * (cols * 3 + 1)] = 0;
  px.copy(raw, r * (cols * 3 + 1) + 1, r * cols * 3, (r + 1) * cols * 3);
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crcTable = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
  let crc = 0xffffffff;
  for (const b of td) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8);
  crc = (crc ^ 0xffffffff) >>> 0;
  const crcB = Buffer.alloc(4); crcB.writeUInt32BE(crc);
  return Buffer.concat([len, td, crcB]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(cols, 0); ihdr.writeUInt32BE(rows, 4);
ihdr[8] = 8; ihdr[9] = 2;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
]);
fs.writeFileSync('terrain_preview.png', png);
console.log('terrain_preview.png written');
