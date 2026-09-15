// Connector: writes the app icons into public/ (next to this script's repo
// root, whatever the working directory). Touches nothing else: no database, no
// uploads. The art and the encoder are in tools/icon-image.mjs.
//
//   node tools/make-icons.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ICON_FILES, drawIcon, encodePng } from './icon-image.mjs';

const PUBLIC_DIR = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'public');

mkdirSync(PUBLIC_DIR, { recursive: true });
for (const { name, size, variant } of ICON_FILES) {
  const png = encodePng(size, size, drawIcon(size, variant));
  writeFileSync(join(PUBLIC_DIR, name), png);
  console.log(`public/${name}  ${size}x${size} ${variant}  ${png.length} bytes`);
}
