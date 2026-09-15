// Unit test: the build id rule (logic/app-build.js), and the connector that
// reads dist/build-id.txt (server/paths.js readAppBuild) from temp directories.
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeBuildId, isNewBuild, BUILD_HEADER, BUILD_ID_FILE } from '../logic/app-build.js';
import { readAppBuild } from '../server/paths.js';

describe('normalizeBuildId', () => {
  it('keeps a short id of letters, digits, dot, dash and underscore, trimmed', () => {
    assert.equal(normalizeBuildId('2637926-mf3k9x1'), '2637926-mf3k9x1');
    assert.equal(normalizeBuildId('  abc.def_1\n'), 'abc.def_1');
  });
  it('anything else is no build', () => {
    for (const value of [undefined, null, '', '   ', 42, 'a b', 'x'.repeat(65), 'id;evil', 'id\r\nSet-Cookie: x']) {
      assert.equal(normalizeBuildId(value), null, JSON.stringify(value));
    }
  });
  it('names the header and the file', () => {
    assert.equal(BUILD_HEADER, 'X-App-Build');
    assert.equal(BUILD_ID_FILE, 'build-id.txt');
  });
});

describe('isNewBuild', () => {
  it('a different non-empty server build means an update is available', () => {
    assert.equal(isNewBuild('aaa', 'bbb'), true);
  });
  it('the same build, a missing or empty server build, or no client build is not', () => {
    assert.equal(isNewBuild('aaa', 'aaa'), false);
    assert.equal(isNewBuild('aaa', null), false);
    assert.equal(isNewBuild('aaa', ''), false);
    assert.equal(isNewBuild('aaa', ' aaa '), false);
    assert.equal(isNewBuild('', 'bbb'), false);
    assert.equal(isNewBuild(undefined, 'bbb'), false);
  });
});

describe('readAppBuild', () => {
  const root = mkdtempSync(join(tmpdir(), 'fooddiary-build-'));
  after(() => rmSync(root, { recursive: true, force: true }));

  it('reads the id from <dist>/build-id.txt', () => {
    const dist = mkdtempSync(join(root, 'dist-'));
    writeFileSync(join(dist, BUILD_ID_FILE), 'abc123\n');
    assert.equal(readAppBuild(dist), 'abc123');
  });
  it('no file, no dist or a bad id is null', () => {
    assert.equal(readAppBuild(join(root, 'missing')), null);
    assert.equal(readAppBuild(null), null);
    const bad = mkdtempSync(join(root, 'bad-'));
    writeFileSync(join(bad, BUILD_ID_FILE), 'not an id');
    assert.equal(readAppBuild(bad), null);
  });
});
