import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { infoWindowLines } from '../../src/ui/lists.js';

describe('infoWindowLines', () => {
  it('gives the name in bold, then cuisine and address', () => {
    assert.deepEqual(
      infoWindowLines({ name: 'Nasi Kandar', cuisine_type: 'Malay', address: '1 Jalan Ampang' }),
      [
        { text: 'Nasi Kandar', strong: true },
        { text: 'Malay', strong: false },
        { text: '1 Jalan Ampang', strong: false },
      ],
    );
  });

  it('leaves out a missing cuisine or address', () => {
    assert.deepEqual(infoWindowLines({ name: 'Cafe', cuisine_type: null, address: '' }), [
      { text: 'Cafe', strong: true },
    ]);
  });

  it('keeps markup in a name as plain text', () => {
    const name = '<img src=x onerror=alert(1)>';
    const lines = infoWindowLines({ name, cuisine_type: '<b>x</b>', address: null });
    assert.deepEqual(lines, [
      { text: name, strong: true },
      { text: '<b>x</b>', strong: false },
    ]);
  });
});
