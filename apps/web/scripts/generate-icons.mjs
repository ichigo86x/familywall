// Renders the app icons into public/ without image dependencies: a brand-green tile
// with a white calendar card and an accent header. Run with `npm run icons`.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const GREEN = [0x3a, 0x7d, 0x6e];
const ACCENT = [0xe9, 0xa2, 0x4d];
const WHITE = [0xff, 0xff, 0xff];
const DOT = [0xcf, 0xe3, 0xdd];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buffer) => {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

const insideRoundedRect = (x, y, left, top, right, bottom, radius) => {
  if (x < left || x > right || y < top || y > bottom) return false;
  const cx = Math.min(Math.max(x, left + radius), right - radius);
  const cy = Math.min(Math.max(y, top + radius), bottom - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
};

/** `padding` shrinks the artwork so maskable icons survive circular crops. */
const render = (size, { roundedTile, padding }) => {
  const s = (value) => value * size;
  const scale = 1 - padding * 2;
  const p = (value) => s(padding + value * scale);
  const rows = [];

  for (let y = 0; y < size; y += 1) {
    const row = [0];
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      let color = GREEN;
      let alpha = 255;

      if (roundedTile && !insideRoundedRect(px, py, 0, 0, size, size, s(0.22))) {
        alpha = 0;
      } else if (insideRoundedRect(px, py, p(0.2), p(0.24), p(0.8), p(0.8), p(0.08))) {
        color = py < p(0.38) ? ACCENT : WHITE;
        const col = Math.floor((px - p(0.26)) / p(0.12));
        const line = Math.floor((py - p(0.44)) / p(0.11));
        const inDot =
          col >= 0 && col < 4 && line >= 0 && line < 3 &&
          (px - (p(0.26) + col * p(0.12) + p(0.06))) ** 2 + (py - (p(0.44) + line * p(0.11) + p(0.05))) ** 2 <= p(0.03) ** 2;
        if (inDot) color = line === 1 && col === 2 ? ACCENT : DOT;
      }

      row.push(...color, alpha);
    }
    rows.push(Buffer.from(row));
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0))
  ]);
};

const out = new URL("../public/", import.meta.url);
// iOS applies its own rounded mask, so the touch icon is a full square.
writeFileSync(new URL("apple-touch-icon.png", out), render(180, { roundedTile: false, padding: 0 }));
writeFileSync(new URL("icon-192.png", out), render(192, { roundedTile: true, padding: 0 }));
writeFileSync(new URL("icon-512.png", out), render(512, { roundedTile: true, padding: 0 }));
writeFileSync(new URL("icon-maskable-512.png", out), render(512, { roundedTile: false, padding: 0.1 }));
console.log("Icons written to public/");
