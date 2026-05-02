// Generates icon-192.png, icon-512.png, icon-maskable-512.png using only Node built-ins.
import { writeFileSync } from 'fs';
import { deflateSync } from 'zlib';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = (c >>> 8) ^ CRC_TABLE[(c ^ b) & 0xff];
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const tb = Buffer.from(type, 'ascii');
  const lb = Buffer.allocUnsafe(4);
  lb.writeUInt32BE(data.length, 0);
  const cb = Buffer.allocUnsafe(4);
  cb.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0);
  return Buffer.concat([lb, tb, data, cb]);
}

function makePNG(size, maskable = false) {
  // RGBA pixel buffer
  const px = new Uint8Array(size * size * 4);

  function set(x, y, r, g, b, a = 255) {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const i = (y * size + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
  }

  // Fill background
  const [bgR, bgG, bgB] = maskable ? [16, 185, 129] : [23, 23, 23];
  for (let i = 0; i < size * size; i++) {
    px[i * 4] = bgR; px[i * 4 + 1] = bgG; px[i * 4 + 2] = bgB; px[i * 4 + 3] = 255;
  }

  // Draw a rounded rect, filling pixels inside with (r,g,b)
  function fillRR(x1p, y1p, x2p, y2p, radp, r, g, b) {
    const x1 = Math.round(x1p * size), y1 = Math.round(y1p * size);
    const x2 = Math.round(x2p * size), y2 = Math.round(y2p * size);
    const rad = Math.max(1, Math.round(radp * size));
    for (let y = y1; y < y2; y++) {
      for (let x = x1; x < x2; x++) {
        const tl = x < x1 + rad && y < y1 + rad;
        const tr = x >= x2 - rad && y < y1 + rad;
        const bl = x < x1 + rad && y >= y2 - rad;
        const br = x >= x2 - rad && y >= y2 - rad;
        if (tl) {
          const dx = (x1 + rad) - x, dy = (y1 + rad) - y;
          if (dx * dx + dy * dy > rad * rad) continue;
        } else if (tr) {
          const dx = x - (x2 - rad), dy = (y1 + rad) - y;
          if (dx * dx + dy * dy > rad * rad) continue;
        } else if (bl) {
          const dx = (x1 + rad) - x, dy = y - (y2 - rad);
          if (dx * dx + dy * dy > rad * rad) continue;
        } else if (br) {
          const dx = x - (x2 - rad), dy = y - (y2 - rad);
          if (dx * dx + dy * dy > rad * rad) continue;
        }
        set(x, y, r, g, b);
      }
    }
  }

  // --- Standard icon: dark bg + emerald rounded square + white wallet ---
  if (!maskable) {
    fillRR(0.08, 0.08, 0.92, 0.92, 0.20, 16, 185, 129); // emerald card shape
  }

  // Wallet body (white)
  fillRR(0.22, 0.40, 0.78, 0.70, 0.05, 255, 255, 255);
  // Wallet top flap (white, overlaps top of body)
  fillRR(0.30, 0.30, 0.70, 0.47, 0.05, 255, 255, 255);

  // Coin pocket (dark emerald on right side of body)
  const [pr, pg, pb] = maskable ? [9, 120, 82] : [10, 145, 95];
  fillRR(0.53, 0.46, 0.72, 0.64, 0.05, pr, pg, pb);

  // Small circle in pocket (white)
  fillRR(0.59, 0.51, 0.66, 0.59, 0.04, 255, 255, 255);

  // Build PNG scanlines
  const raw = Buffer.allocUnsafe(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 4)] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4;
      const dst = y * (1 + size * 4) + 1 + x * 4;
      raw[dst]     = px[src];
      raw[dst + 1] = px[src + 1];
      raw[dst + 2] = px[src + 2];
      raw[dst + 3] = px[src + 3];
    }
  }

  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr.writeUInt8(8, 8);  // bit depth
  ihdr.writeUInt8(6, 9);  // RGBA color type
  ihdr.fill(0, 10);       // compression, filter, interlace = 0

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const icons = [
  { file: 'public/icon-192.png',         size: 192, maskable: false },
  { file: 'public/icon-512.png',         size: 512, maskable: false },
  { file: 'public/icon-maskable-512.png', size: 512, maskable: true  },
];

for (const { file, size, maskable } of icons) {
  const buf = makePNG(size, maskable);
  writeFileSync(file, buf);
  console.log(`✓ ${file}  (${(buf.length / 1024).toFixed(1)} KB)`);
}
