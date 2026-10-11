// Draws the add-on icon (128x128) and logo (250x100) shown by Home Assistant: a calendar page with a
// heart on the Familywall green. Plain PNG written with zlib, no image libraries needed.
// Usage: node scripts/make-addon-icons.mjs
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const GREEN = [58, 125, 110];
const DARK = [44, 98, 86];
const WHITE = [255, 255, 255];
const AMBER = [233, 162, 77];
const LINE = [210, 222, 218];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});
const crc32 = (buffer) => {
  let c = 0xffffffff;
  for (const byte of buffer) {
    c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

/** RGBA canvas with 4x supersampling for smooth edges. */
const canvas = (width, height) => {
  const scale = 4;
  const w = width * scale;
  const h = height * scale;
  const pixels = new Float32Array(w * h * 4);
  const fill = (inside, color) => {
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (inside((x + 0.5) / scale, (y + 0.5) / scale)) {
          const i = (y * w + x) * 4;
          pixels[i] = color[0];
          pixels[i + 1] = color[1];
          pixels[i + 2] = color[2];
          pixels[i + 3] = 255;
        }
      }
    }
  };
  const png = () => {
    const rows = [];
    for (let y = 0; y < height; y += 1) {
      const row = Buffer.alloc(1 + width * 4);
      for (let x = 0; x < width; x += 1) {
        const sum = [0, 0, 0, 0];
        for (let sy = 0; sy < scale; sy += 1) {
          for (let sx = 0; sx < scale; sx += 1) {
            const i = ((y * scale + sy) * w + x * scale + sx) * 4;
            const alpha = pixels[i + 3];
            sum[0] += pixels[i] * alpha;
            sum[1] += pixels[i + 1] * alpha;
            sum[2] += pixels[i + 2] * alpha;
            sum[3] += alpha;
          }
        }
        const alpha = sum[3] / (scale * scale);
        const offset = 1 + x * 4;
        row[offset] = sum[3] ? Math.round(sum[0] / sum[3]) : 0;
        row[offset + 1] = sum[3] ? Math.round(sum[1] / sum[3]) : 0;
        row[offset + 2] = sum[3] ? Math.round(sum[2] / sum[3]) : 0;
        row[offset + 3] = Math.round(alpha);
      }
      rows.push(row);
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = 6;
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(Buffer.concat(rows), { level: 9 })),
      chunk("IEND", Buffer.alloc(0))
    ]);
  };
  return { fill, png };
};

const roundedRect = (x0, y0, x1, y1, r) => (x, y) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) {
    return false;
  }
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
const circle = (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
/** Heart centred on (cx, cy), about 2*size wide. */
const heart = (cx, cy, size) => (x, y) => {
  const u = (x - cx) / size;
  const v = (cy - y) / size + 0.25;
  return (u * u + v * v - 1) ** 3 - u * u * v * v * v <= 0;
};

/** Calendar page with a heart, drawn in the square (ox, oy, size). */
const drawMark = (c, ox, oy, size, background) => {
  const s = size / 128;
  const at = (value) => value * s;
  if (background) {
    c.fill(roundedRect(ox, oy, ox + size, oy + size, at(26)), GREEN);
  }
  c.fill(roundedRect(ox + at(22), oy + at(30), ox + at(106), oy + at(106), at(12)), WHITE);
  c.fill(roundedRect(ox + at(22), oy + at(30), ox + at(106), oy + at(50), at(12)), DARK);
  c.fill((x, y) => x >= ox + at(22) && x <= ox + at(106) && y >= oy + at(42) && y <= oy + at(50), DARK);
  c.fill(roundedRect(ox + at(40), oy + at(20), ox + at(48), oy + at(40), at(4)), WHITE);
  c.fill(roundedRect(ox + at(80), oy + at(20), ox + at(88), oy + at(40), at(4)), WHITE);
  for (const [cx, cy] of [
    [38, 62],
    [54, 62],
    [70, 62],
    [38, 76],
    [38, 90]
  ]) {
    c.fill(circle(ox + at(cx), oy + at(cy), at(4)), LINE);
  }
  c.fill(heart(ox + at(80), oy + at(84), at(17)), AMBER);
};

const icon = canvas(128, 128);
drawMark(icon, 0, 0, 128, true);
writeFileSync(path.join(root, "familywall", "icon.png"), icon.png());

// Logo: the mark and a calendar strip in the family colours.
const logo = canvas(250, 100);
drawMark(logo, 6, 0, 100, true);
const colors = [GREEN, AMBER, [219, 39, 119], [14, 165, 233], [139, 92, 246]];
colors.forEach((color, index) => {
  logo.fill(roundedRect(122, 14 + index * 15, 122 + 120 - index * 16, 24 + index * 15, 5), color);
});
writeFileSync(path.join(root, "familywall", "logo.png"), logo.png());
console.log("familywall/icon.png and familywall/logo.png written.");
