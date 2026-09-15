// Guards the four-layer standard (docs/standards/four-layer.md in the AI repo).
//
// Logic (logic/) and UI (src/ui/, src/**/*-view.js, src/components/) are pure.
// They may not reach a wiring layer, the network, a file, the environment,
// the clock, a random source, a browser global or a log.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const rel = (p) => relative(ROOT, p).split(sep).join('/');
const code = (p) => readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const importsOf = (src) => [...src.matchAll(/(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1] || m[2]);

// Reads that make a file impure.
const AMBIENT = [
  [/\bDate\.now\s*\(/, 'Date.now()'],
  [/\bnew Date\(\s*\)/, 'new Date() with no argument'],
  [/\bMath\.random\s*\(/, 'Math.random()'],
  [/\bprocess\./, 'process'],
  [/\bimport\.meta\.env\b/, 'import.meta.env'],
  [/\bconsole\./, 'console'],
  [/\bfetch\s*\(/, 'fetch()'],
  [/\b(localStorage|sessionStorage)\b/, 'browser storage'],
  [/\bwindow\./, 'window'],
  [/\bdocument\./, 'document'],
  [/\bnavigator\./, 'navigator'],
  [/\bURL\.createObjectURL\b/, 'URL.createObjectURL'],
  [/\b(setTimeout|setInterval)\s*\(/, 'timer'],
  [/\brequire\s*\(/, 'require()'],
];

// React state and effects are UI connector work.
const HOOKS = [/\buse(State|Effect|Ref|Callback|Memo|Context|Reducer|LayoutEffect)\s*\(/, 'a React hook'];

function violations(file, { allowImport, extra = [] }) {
  const src = code(file);
  const found = [];
  for (const [re, name] of [...AMBIENT, ...extra]) if (re.test(src)) found.push(name);
  for (const spec of importsOf(src)) if (!allowImport(spec, file)) found.push(`import '${spec}'`);
  return found;
}

const LOGIC_FILES = walk(join(ROOT, 'logic')).filter(f => f.endsWith('.js'));

const isUiFile = (f) => {
  const r = rel(f);
  return /\.(js|jsx)$/.test(r) && (r.startsWith('src/ui/') || /-view\.js$/.test(r));
};
const UI_FILES = walk(join(ROOT, 'src')).filter(isUiFile);

// Pure files outside logic/ and src/ui/, each with the only imports it may use.
const PURE_EXTRA = [
  ['pwa.config.js', () => false],
  ['tools/icon-image.mjs', (spec) => spec === 'node:zlib' || spec === '../pwa.config.js'],
];

const resolvesInside = (spec, file, ...roots) => {
  if (!spec.startsWith('.')) return false;
  const target = rel(resolve(dirname(file), spec));
  return roots.some(root => target.startsWith(root));
};

describe('layering', () => {
  it('finds the pure files', () => {
    assert.ok(LOGIC_FILES.length > 0);
  });

  for (const file of LOGIC_FILES) {
    it(`Logic ${rel(file)} is pure and imports only Logic`, () => {
      const found = violations(file, { allowImport: (spec, f) => resolvesInside(spec, f, 'logic/') });
      assert.deepEqual(found, []);
    });
  }

  for (const [path, allowImport] of PURE_EXTRA) {
    it(`pure ${path} reads nothing ambient and imports only what it is allowed`, () => {
      const file = join(ROOT, path);
      assert.ok(existsSync(file), path);
      assert.deepEqual(violations(file, { allowImport }), []);
    });
  }

  for (const file of UI_FILES) {
    it(`UI ${rel(file)} is pure and imports only UI and Logic`, () => {
      const allowImport = (spec, f) =>
        spec === 'react' || spec === 'react/jsx-runtime' ||
        (resolvesInside(spec, f, 'logic/', 'src/ui/', 'src/components/') ||
          (spec.startsWith('.') && /-view(\.js)?$/.test(spec)));
      const found = violations(file, { allowImport, extra: [HOOKS] });
      assert.deepEqual(found, []);
    });
  }
});
