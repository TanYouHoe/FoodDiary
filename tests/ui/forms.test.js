import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { newMealForm } from '../../src/ui/forms.js';

// Node applies a change to process.env.TZ at once. Each case runs in a zone
// where the local day and the UTC day differ, so a UTC default fails on any machine.
const inZone = (zone) => {
  let saved;
  before(() => { saved = process.env.TZ; process.env.TZ = zone; });
  after(() => { if (saved === undefined) delete process.env.TZ; else process.env.TZ = saved; });
};

describe('newMealForm', () => {
  describe('just after midnight in Kuala Lumpur (still yesterday in UTC)', () => {
    inZone('Asia/Kuala_Lumpur');
    it('defaults the date to the local day', () => {
      const form = newMealForm(new Date(2026, 2, 29, 0, 30));
      assert.equal(form.date, '2026-03-29');
      assert.equal(form.time, '00:30');
    });
  });

  describe('just before midnight in New York (already tomorrow in UTC)', () => {
    inZone('America/New_York');
    it('defaults the date to the local day', () => {
      const form = newMealForm(new Date(2026, 2, 29, 23, 30));
      assert.equal(form.date, '2026-03-29');
      assert.equal(form.time, '23:30');
    });
  });
});
