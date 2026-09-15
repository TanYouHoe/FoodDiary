import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { updateBannerState } from '../../src/ui/pwa.js';

describe('updateBannerState', () => {
  it('nothing to say: no banner', () => {
    assert.equal(updateBannerState({ needRefresh: false, offlineReady: false }), null);
  });

  it('a new version offers Reload and Later', () => {
    assert.deepEqual(updateBannerState({ needRefresh: true, offlineReady: false }),
      { message: 'A new version of Food Diary is ready.', canReload: true, dismissLabel: 'Later' });
  });

  it('offline ready is a note that can be closed, with no reload', () => {
    assert.deepEqual(updateBannerState({ needRefresh: false, offlineReady: true }),
      { message: 'Ready to work offline.', canReload: false, dismissLabel: 'OK' });
  });

  it('a new version wins over the offline note', () => {
    assert.equal(updateBannerState({ needRefresh: true, offlineReady: true }).canReload, true);
  });
});
