import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const dist = 'dist';
const extra = [];
for (const dir of ['assets', 'wallpapers']) {
  const path = join(dist, dir);
  if (existsSync(path)) for (const name of readdirSync(path)) extra.push(`/${dir}/${name}`);
}
// Same-origin assets do not need the crossorigin attribute; removing it keeps
// offline module/style loads compatible with cached SW responses in all browsers.
const indexPath = join(dist, 'index.html');
const indexHTML = readFileSync(indexPath, 'utf8').replace(/\s+crossorigin(?:="[^"]*")?/g, '');
writeFileSync(indexPath, indexHTML);
const template = readFileSync('public/sw.js', 'utf8');
const hash = createHash('sha256').update(indexHTML).update(extra.join('|')).digest('hex').slice(0, 10);
const output = template
  .replace("const CACHE = 'netronim-shell-v1';", `const CACHE = 'netronim-shell-${hash}';`)
  .replace('const EXTRA = [];', `const EXTRA = ${JSON.stringify(extra)};`);
writeFileSync(join(dist, 'sw.js'), output);
console.log(`Service worker precaches ${extra.length} build assets (${hash}).`);
