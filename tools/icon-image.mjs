// Pure: the app icon art and a minimal PNG encoder, for tools/make-icons.mjs.
// drawIcon returns RGBA pixels; encodePng returns PNG bytes. No file, no clock.
//
// Art: a white plate with an orange rim line between a fork and a knife, on
// the brand orange. Coordinates are fractions of the icon, centred on 0.

import { deflateSync } from 'node:zlib';
import { manifest, APPLE_TOUCH_ICON, BRAND_COLOR } from '../pwa.config.js';

// Every icon file: the manifest icons (variant = purpose) and the apple touch icon.
export const ICON_FILES = [
  ...manifest.icons.map(icon => ({ name: icon.src.slice(1), size: Number.parseInt(icon.sizes, 10), variant: icon.purpose })),
  { name: APPLE_TOUCH_ICON, size: 180, variant: 'apple' },
];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

// CRC-32 (IEEE), as PNG chunks use it.
export function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

// pixels: width * height * 4 bytes, RGBA, rows top to bottom. Returns a PNG.
export function encodePng(width, height, pixels) {
  if (pixels.length !== width * height * 4) throw new Error(`encodePng: pixels must be ${width * height * 4} bytes, got ${pixels.length}`);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;  // bit depth
  header[9] = 6;  // colour type: RGBA
  // compression, filter and interlace methods stay 0
  const rows = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const start = y * (1 + width * 4);
    rows[start] = 0; // filter: none
    Buffer.from(pixels.buffer, pixels.byteOffset + y * width * 4, width * 4).copy(rows, start + 1);
  }
  return Buffer.concat([PNG_SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// How large the mark is, as a fraction of the icon. The maskable mark stays
// inside the 80% safe-zone circle (its farthest point is 0.506 of the unit).
const MARK_SCALE = { any: 0.84, apple: 0.84, maskable: 0.76 };
const TILE_RADIUS = 0.18; // rounded corners of the 'any' tile only

const inRect = (x, y, left, top, right, bottom) => x >= left && x <= right && y >= top && y <= bottom;

// x, y: mark coordinates. Returns 'white', 'rim' (orange on the plate) or null.
function markAt(x, y) {
  const d = Math.hypot(x, y);
  if (d <= 0.25) return d >= 0.175 && d <= 0.195 ? 'rim' : 'white';
  // fork: three tines, a neck, a handle
  for (const cx of [-0.4, -0.37, -0.34]) if (inRect(x, y, cx - 0.008, -0.3, cx + 0.008, -0.14)) return 'white';
  if (inRect(x, y, -0.408, -0.14, -0.332, -0.08)) return 'white';
  if (inRect(x, y, -0.385, -0.08, -0.355, 0.3)) return 'white';
  // knife: a blade curved on its cutting side, a handle
  if (x >= 0.34 && x <= 0.4 && y <= 0 && y >= -0.3 && ((x - 0.34) / 0.06) ** 2 + (y / 0.3) ** 2 <= 1) return 'white';
  if (inRect(x, y, 0.352, 0, 0.388, 0.3)) return 'white';
  return null;
}

function inTile(u, v) {
  const inner = 0.5 - TILE_RADIUS;
  const au = Math.abs(u);
  const av = Math.abs(v);
  if (au > 0.5 || av > 0.5) return false;
  if (au <= inner || av <= inner) return true;
  return Math.hypot(au - inner, av - inner) <= TILE_RADIUS;
}

const rgbOf = (hex) => [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16));
const SAMPLES = 4; // per axis, for smooth edges

// size: pixels per side. variant: 'any' (rounded tile, transparent corners),
// 'maskable' or 'apple' (full bleed). Returns RGBA pixels.
export function drawIcon(size, variant) {
  const scale = MARK_SCALE[variant];
  if (!scale) throw new Error(`drawIcon: unknown variant ${variant}`);
  const orange = rgbOf(BRAND_COLOR);
  const pixels = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let covered = 0;
      let white = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const u = (px + (sx + 0.5) / SAMPLES) / size - 0.5;
          const v = (py + (sy + 0.5) / SAMPLES) / size - 0.5;
          if (variant === 'any' && !inTile(u, v)) continue;
          covered++;
          if (markAt(u / scale, v / scale) === 'white') white++;
        }
      }
      const at = (py * size + px) * 4;
      if (covered === 0) continue; // transparent
      const share = white / covered;
      for (let c = 0; c < 3; c++) pixels[at + c] = Math.round(255 * share + orange[c] * (1 - share));
      pixels[at + 3] = Math.round((255 * covered) / (SAMPLES * SAMPLES));
    }
  }
  return pixels;
}
