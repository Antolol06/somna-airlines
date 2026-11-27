// Exports the deck: full-resolution stills of every slide, overview thumbnails, a slide PDF
// and a speaker-notes PDF. Needs the deck running (npx vite --config presentation/vite.config.ts).
//
//   node presentation/scripts/export.mjs [http://localhost:5180/]
import { launch, sleep } from './cdp.mjs';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const base = process.argv[2] || 'http://localhost:5180/';
const out = join(root, 'export');
const thumbs = join(root, 'public', 'media', 'thumbs');
mkdirSync(join(out, 'slides'), { recursive: true });
mkdirSync(thumbs, { recursive: true });
const pad = (n) => String(n).padStart(2, '0');

const b = await launch({ profile: join(tmpdir(), 'somna-deck-export'), url: 'about:blank' });

// slide count and notes come from the deck itself
await b.navigate(`${base}?still=1&i=0#1`);
await sleep(2500);
const meta = await b.evaluate(`(async () => { const m = await import('/src/slides/index.ts'); const c = await import('/src/config.ts');
  return { slides: m.SLIDES.map(s => ({ title: s.title, part: s.part, chapter: s.chapter, seconds: s.seconds, notes: s.notes, speaker: 'Speaker ' + (s.speaker + 1) })), total: m.TOTAL_SECONDS } })()`);
console.log('slides', meta.slides.length);

for (let i = 0; i < meta.slides.length; i++) {
  await b.navigate(`${base}?still=1&i=${i}#${i + 1}`);
  await b.evaluate(`(async () => { await document.fonts.ready; const imgs = [...document.images]; await Promise.all(imgs.map(im => im.complete ? 1 : new Promise(r => { im.onload = im.onerror = r; }))); await new Promise(r => setTimeout(r, 500)); return imgs.length })()`);
  await b.shot(join(out, 'slides', `${pad(i + 1)}.jpg`), { quality: 90 });
  await b.shot(join(thumbs, `${pad(i + 1)}.jpg`), { quality: 80, clip: { x: 0, y: 0, width: 1920, height: 1080, scale: 1 / 3 } });
  console.log('slide', pad(i + 1), meta.slides[i].title);
}

// ---- slide PDF (16:9, one slide per page)
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const slidesHtml = `<!doctype html><meta charset="utf-8"><style>@page{size:1920px 1080px;margin:0}html,body{margin:0;background:#000}img{display:block;width:1920px;height:1080px;page-break-after:always;break-after:page}</style>
${meta.slides.map((_, i) => `<img src="${pathToFileURL(join(out, 'slides', `${pad(i + 1)}.jpg`)).href}">`).join('\n')}`;
writeFileSync(join(out, 'deck.html'), slidesHtml);
await b.navigate(pathToFileURL(join(out, 'deck.html')).href);
await sleep(2500);
let pdf = await b.send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 });
writeFileSync(join(root, 'SOMNA-Presentation.pdf'), Buffer.from(pdf.data, 'base64'));
console.log('wrote SOMNA-Presentation.pdf');

// ---- speaker notes PDF (A4 landscape: slide + speaker, timing and notes)
// notes: paragraphs split on blank lines; [square brackets] = a direction or a click cue
const script = (notes) =>
  notes
    .split(/\n\s*\n/)
    .map((p) => `<p>${esc(p).replace(/\[([^\]]*)\]/g, '<span class="c">$1</span>')}</p>`)
    .join('');
let t = 0;
const notesHtml = `<!doctype html><meta charset="utf-8"><style>
@page{size:A4 landscape;margin:14mm}body{font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#111;margin:0}
.p{display:grid;grid-template-columns:150mm 1fr;gap:10mm;page-break-after:always;break-after:page;align-items:start}
img{width:150mm;border-radius:2mm;border:0.3mm solid #ccc}h2{margin:0 0 2mm;font-weight:500;font-size:16pt}
.m{font-size:9pt;letter-spacing:0.08em;text-transform:uppercase;color:#7a6342;margin-bottom:4mm}p{font-size:11pt;line-height:1.5;margin:0 0 2.4mm}
.c{font-family:Consolas,'Courier New',monospace;font-size:8.6pt;color:#6b5434;background:#f4ede2;border-radius:1mm;padding:0.2mm 1.2mm}
</style>
${meta.slides
  .map((s, i) => {
    const at = t;
    t += s.seconds;
    return `<div class="p"><img src="${pathToFileURL(join(out, 'slides', `${pad(i + 1)}.jpg`)).href}"><div><div class="m">${pad(i + 1)} · Part ${s.part} · ${esc(s.chapter)} · ${esc(s.speaker)} · ${Math.floor(at / 60)}:${pad(at % 60)} → ${s.seconds}s</div><h2>${esc(s.title)}</h2>${script(s.notes)}</div></div>`;
  })
  .join('\n')}`;
writeFileSync(join(out, 'notes.html'), notesHtml);
await b.navigate(pathToFileURL(join(out, 'notes.html')).href);
await sleep(2500);
pdf = await b.send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
writeFileSync(join(root, 'SOMNA-Speaker-Notes.pdf'), Buffer.from(pdf.data, 'base64'));
console.log('wrote SOMNA-Speaker-Notes.pdf · planned length', Math.floor(meta.total / 60) + ':' + pad(meta.total % 60));
await b.close();
void readFileSync;
