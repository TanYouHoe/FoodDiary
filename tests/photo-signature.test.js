// Logic test: photo file types from their first bytes, and stored photo names.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { photoTypeFromBytes, photoExtension, storedPhotoName, PHOTO_SIGNATURE_BYTES } from '../logic/meals.js';

const bytes = (...values) => Uint8Array.from(values);
const ascii = (text) => Uint8Array.from(Buffer.from(text, 'latin1'));

describe('photoTypeFromBytes', () => {
  it('knows JPEG, PNG and WebP', () => {
    assert.equal(photoTypeFromBytes(bytes(0xFF, 0xD8, 0xFF, 0xE0, 0, 0x10)), 'image/jpeg');
    assert.equal(photoTypeFromBytes(bytes(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D)), 'image/png');
    assert.equal(photoTypeFromBytes(ascii('RIFF\x24\x00\x00\x00WEBPVP8 ')), 'image/webp');
  });

  it('refuses everything else', () => {
    assert.equal(photoTypeFromBytes(ascii('<!doctype html><script>')), null);
    assert.equal(photoTypeFromBytes(ascii('RIFF\x24\x00\x00\x00WAVEfmt ')), null);
    assert.equal(photoTypeFromBytes(bytes(0xFF, 0xD8)), null, 'too short');
    assert.equal(photoTypeFromBytes(bytes(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A)), null, 'truncated PNG');
    assert.equal(photoTypeFromBytes(bytes()), null);
    assert.equal(photoTypeFromBytes(ascii('GIF89a......')), null);
  });

  it('needs no more than PHOTO_SIGNATURE_BYTES bytes', () => {
    assert.equal(PHOTO_SIGNATURE_BYTES, 12);
  });
});

describe('stored photo names', () => {
  const HEX = '0123456789abcdef0123456789abcdef';

  it('takes the extension from the accepted MIME type', () => {
    assert.equal(photoExtension('image/jpeg'), '.jpg');
    assert.equal(photoExtension('image/png'), '.png');
    assert.equal(photoExtension('image/webp'), '.webp');
    assert.equal(photoExtension('text/html'), null);
  });

  it('is the random hex plus the extension, never a client name', () => {
    assert.equal(storedPhotoName(HEX, 'image/png'), `${HEX}.png`);
    assert.equal(storedPhotoName(HEX, 'image/jpeg'), `${HEX}.jpg`);
  });

  it('refuses a bad hex or MIME type', () => {
    assert.throws(() => storedPhotoName('../../evil', 'image/png'));
    assert.throws(() => storedPhotoName(HEX.slice(1), 'image/png'));
    assert.throws(() => storedPhotoName(HEX, 'text/html'));
  });
});
