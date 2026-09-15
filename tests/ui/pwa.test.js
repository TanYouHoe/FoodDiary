import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { updateBannerState } from '../../src/ui/pwa.js';

describe('updateBannerState', () => {
  it('no new version: no banner', () => {
    assert.equal(updateBannerState({ needRefresh: false }), null);
  });

  it('a new version offers Reload and Later', () => {
    assert.deepEqual(updateBannerState({ needRefresh: true }),
      { message: 'A new version of Food Diary is ready.', reloadLabel: 'Reload', dismissLabel: 'Later' });
  });
});
