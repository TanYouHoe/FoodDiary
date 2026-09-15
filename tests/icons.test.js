// Unit test: the PNG encoder and the icon art used by tools/make-icons.mjs,
// and the committed icons in public/. No mock; the committed files are only read.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, encodePng, drawIcon, ICON_FILES } from '../tools/icon-image.mjs';
import { manifest, APPLE_TOUCH_ICON, BRAND_COLOR } from '../pwa.config.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

// Returns [{ type, data }] and checks every chunk's CRC.
function chunksOf(png) {
  assert.deepEqual(png.subarray(0, 8), SIGNATURE);
  const chunks = [];
  for (let at = 8; at < png.length;) {
    const length = png.readUInt32BE(at);
    const typeAndData = png.subarray(at + 4, at + 8 + length);
    assert.equal(png.readUInt32BE(at + 8 + length), crc32(typeAndData), 'chunk CRC');
    chunks.push({ type: typeAndData.subarray(0, 4).toString('ascii'), data: typeAndData.subarray(4) });
    at += 12 + length;
  }
  return chunks;
}

const header = (png) => {
  const ihdr = chunksOf(png)[0];
  assert.equal(ihdr.type, 'IHDR');
  return { width: ihdr.data.readUInt32BE(0), height: ihdr.data.readUInt32BE(4), bitDepth: ihdr.data[8], colorType: ihdr.data[9] };
};

const rgb = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

describe('crc32', () => {
  it('matches the standard check value', () => {
    assert.equal(crc32(Buffer.from('123456789')), 0xCBF43926);
    assert.equal(crc32(Buffer.alloc(0)), 0);
  });
});

describe('encodePng', () => {
  it('writes the signature, an 8-bit RGBA header, image data and an end chunk', () => {
    const pixels = Buffer.alloc(3 * 2 * 4, 0xFF);
    const png = encodePng(3, 2, pixels);
    assert.deepEqual(header(png), { width: 3, height: 2, bitDepth: 8, colorType: 6 });
    assert.deepEqual(chunksOf(png).map(c => c.type), ['IHDR', 'IDAT', 'IEND']);
  });

  it('stores each row behind filter byte 0', () => {
    const pixels = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]); // 2x1
    const idat = chunksOf(encodePng(2, 1, pixels)).find(c => c.type === 'IDAT');
    assert.deepEqual(inflateSync(idat.data), Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8]));
  });

  it('refuses pixels of the wrong length', () => {
    assert.throws(() => encodePng(2, 2, Buffer.alloc(4)), /pixels/);
  });
});

describe('drawIcon', () => {
  const pixel = (image, size, x, y) => [...image.subarray((y * size + x) * 4, (y * size + x) * 4 + 4)];

  it('any: a brand-orange rounded tile with transparent corners and a white mark', () => {
    const size = 96;
    const image = drawIcon(size, 'any');
    assert.equal(image.length, size * size * 4);
    assert.equal(pixel(image, size, 0, 0)[3], 0);
    assert.deepEqual(pixel(image, size, 8, size / 2), [...rgb(BRAND_COLOR), 255]);
    assert.ok(image.some((v, i) => i % 4 === 0 && v === 255 && image[i + 1] === 255 && image[i + 2] === 255), 'has white');
  });

  it('maskable and apple: opaque to every edge', () => {
    for (const variant of ['maskable', 'apple']) {
      const size = 64;
      const image = drawIcon(size, variant);
      for (let i = 3; i < image.length; i += 4) assert.equal(image[i], 255, variant);
    }
  });

  it('maskable: the whole mark sits inside the 80% safe-zone circle', () => {
    const size = 512;
    const image = drawIcon(size, 'maskable');
    const [r, g, b] = rgb(BRAND_COLOR);
    let marked = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const [pr, pg, pb] = pixel(image, size, x, y);
        if (pr === r && pg === g && pb === b) continue;
        marked++;
        const distance = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2);
        assert.ok(distance <= 0.4 * size, `pixel ${x},${y} at ${distance.toFixed(1)}`);
      }
    }
    assert.ok(marked > 1000, 'the mark is drawn');
  });

  it('refuses an unknown variant', () => {
    assert.throws(() => drawIcon(16, 'round'), /variant/);
  });
});

describe('committed icons', () => {
  it('one file for every manifest icon and the apple touch icon', () => {
    const names = ICON_FILES.map(f => f.name).sort();
    assert.deepEqual(names, [...manifest.icons.map(i => i.src.slice(1)), APPLE_TOUCH_ICON].sort());
    const maskable = manifest.icons.find(i => i.purpose === 'maskable');
    assert.equal(ICON_FILES.find(f => f.name === maskable.src.slice(1)).variant, 'maskable');
  });

  for (const { name, size } of ICON_FILES) {
    it(`public/${name} is a ${size}x${size} PNG`, () => {
      const png = readFileSync(join(ROOT, 'public', name));
      assert.deepEqual(header(png), { width: size, height: size, bitDepth: 8, colorType: 6 });
    });
  }
});
