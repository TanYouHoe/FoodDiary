// Connector test: where the server keeps its files. Computes paths only; it
// creates, opens and reads nothing.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { ROOT_DIR, DATABASE_PATH, UPLOADS_DIR, dataDirFromEnv, dataPathsFromEnv, databasePathFromArgs } from '../server/paths.js';

describe('FOOD_DIARY_DATA_DIR', () => {
  const absolute = join(tmpdir(), 'fooddiary-paths');

  it('unset or empty keeps the repo paths', () => {
    assert.equal(dataDirFromEnv({}), null);
    assert.equal(dataDirFromEnv({ FOOD_DIARY_DATA_DIR: '' }), null);
    assert.deepEqual(dataPathsFromEnv({}), { databasePath: DATABASE_PATH, uploadsDir: UPLOADS_DIR });
  });

  it('a relative directory resolves against the app directory, not the working directory', () => {
    assert.equal(dataDirFromEnv({ FOOD_DIARY_DATA_DIR: 'data' }), join(ROOT_DIR, 'data'));
    assert.deepEqual(dataPathsFromEnv({ FOOD_DIARY_DATA_DIR: 'data' }), {
      databasePath: join(ROOT_DIR, 'data', 'fooddiary.db'),
      uploadsDir: join(ROOT_DIR, 'data', 'uploads'),
    });
    assert.equal(databasePathFromArgs([], { FOOD_DIARY_DATA_DIR: 'data' }), join(ROOT_DIR, 'data', 'fooddiary.db'));
  });

  it('an absolute directory is used as it is', () => {
    assert.equal(dataDirFromEnv({ FOOD_DIARY_DATA_DIR: absolute }), resolve(absolute));
    assert.deepEqual(dataPathsFromEnv({ FOOD_DIARY_DATA_DIR: absolute }), {
      databasePath: join(absolute, 'fooddiary.db'),
      uploadsDir: join(absolute, 'uploads'),
    });
    assert.equal(databasePathFromArgs([], { FOOD_DIARY_DATA_DIR: absolute }), join(absolute, 'fooddiary.db'));
  });
});
