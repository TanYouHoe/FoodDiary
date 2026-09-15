import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { newMealForm } from '../../src/ui/forms.js';

// The tests run in the machine's zone, so each `now` is built from local parts.
// In any zone but UTC, one of the two lands on another UTC day.
describe('newMealForm', () => {
  it('defaults the date to the local day just after midnight', () => {
    const form = newMealForm(new Date(2026, 2, 29, 0, 30));
    assert.equal(form.date, '2026-03-29');
    assert.equal(form.time, '00:30');
  });

  it('defaults the date to the local day just before midnight', () => {
    const form = newMealForm(new Date(2026, 2, 29, 23, 30));
    assert.equal(form.date, '2026-03-29');
    assert.equal(form.time, '23:30');
  });
});
