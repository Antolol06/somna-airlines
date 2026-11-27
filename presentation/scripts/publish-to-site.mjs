// Publishes the presentation inside the website: builds it, then copies the build into the
// website's public folder, so the website serves it at /presentation/ (in development and once
// deployed). Only that one folder is written; no website source file is touched.
//   node presentation/scripts/publish-to-site.mjs
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmdirSync, statSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const project = join(here, '..', '..');
const dist = join(project, 'presentation', 'dist');
const target = join(project, 'public', 'presentation');

// Plain file-by-file remove and copy: Node's recursive cpSync / rmSync crash on Windows when the
// path contains a non-ASCII character (this project's folder name has the "Ō") — which also
// stops Vite from emptying the build folder, so it is emptied here first (no stale files).
const remove = (d) => {
  if (!existsSync(d)) return;
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) remove(p);
    else unlinkSync(p);
  }
  rmdirSync(d);
};
const copy = (from, to) => {
  mkdirSync(to, { recursive: true });
  for (const f of readdirSync(from)) {
    const a = join(from, f);
    const b = join(to, f);
    if (statSync(a).isDirectory()) copy(a, b);
    else copyFileSync(a, b);
  }
};
remove(dist);
execSync('npx vite build --config presentation/vite.config.ts', { cwd: project, stdio: 'inherit' });
if (!existsSync(join(dist, 'index.html'))) throw new Error('build failed: no presentation/dist/index.html');
remove(target);
copy(dist, target);

let bytes = 0;
let files = 0;
const walk = (d) =>
  readdirSync(d).forEach((f) => {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else {
      bytes += statSync(p).size;
      files++;
    }
  });
walk(target);
console.log(`\npublished ${files} files (${(bytes / 1e6).toFixed(1)} MB) to public/presentation/`);
console.log('  website dev server:  http://localhost:5173/presentation/index.html');
console.log('  deployed website:    https://<your-site>/presentation/');
