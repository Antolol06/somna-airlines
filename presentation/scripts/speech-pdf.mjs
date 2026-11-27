// Builds the Part I speech as a printable A4 PDF, from the deck's own speaker notes — the same
// script the presenter view shows, so the two never drift apart. Needs the deck running
// (npx vite --config presentation/vite.config.ts).
//
//   node presentation/scripts/speech-pdf.mjs [http://localhost:5180/] [--speakers=1,2]
//
// --speakers picks whose parts go in the PDF (default 1,2; Speaker 3, the demo, is left out).
import { launch, sleep } from './cdp.mjs';
import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const fonts = join(root, '..', 'node_modules', '@fontsource');
const args = process.argv.slice(2);
const base = args.find((a) => !a.startsWith('--')) || 'http://localhost:5180/';
const SPEAKERS = (args.find((a) => a.startsWith('--speakers='))?.slice(11) || '1,2').split(',').map(Number);
const OUT = join(root, 'SOMNA-Part-I-Speech.pdf');

const pad = (n) => String(n).padStart(2, '0');
const mmss = (s) => `${Math.floor(s / 60)}:${pad(s % 60)}`;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
// the brand name with its drawn macron (Jost's own Ō puts the bar over the M)
const brand = (html) => html.replace(/SŌMNA/g, '<span class="br">S<span class="bo">O<i></i></span>MNA</span>');
const script = (notes) =>
  notes
    .split(/\n\s*\n/)
    .map((p) => `<p>${brand(esc(p)).replace(/\[([^\]]*)\]/g, (_, c) => `<span class="c${c === '→' ? ' k' : ''}">${c}</span>`)}</p>`)
    .join('');
const font = (file, weight, style = 'normal', family = 'Jost') =>
  `@font-face{font-family:'${family}';font-weight:${weight};font-style:${style};src:url(${pathToFileURL(join(fonts, family === 'Jost' ? 'jost' : 'ibm-plex-mono', 'files', file)).href}) format('woff2')}`;

const b = await launch({ port: 9353, profile: join(tmpdir(), 'somna-speech-pdf'), url: 'about:blank' });
await b.navigate(`${base}?still=1#1`);
await sleep(2500);
const slides = await b.evaluate(`(async () => { const m = await import('/src/slides/index.ts');
  return m.SLIDES.map((s, i) => ({ n: i + 1, id: s.id, part: s.part, title: s.title, seconds: s.seconds, notes: s.notes, speaker: s.speaker + 1 })).filter((s) => s.part === 'I') })()`).then(
  (all) => all.filter((s) => SPEAKERS.includes(s.speaker)),
);
const total = slides.reduce((a, s) => a + s.seconds, 0);
const hasDemo = slides.some((s) => s.id === 'demo');

// consecutive slides by the same speaker form one section
const groups = [];
for (const s of slides) {
  const g = groups[groups.length - 1];
  if (g && g.speaker === s.speaker) g.slides.push(s);
  else groups.push({ speaker: s.speaker, slides: [s] });
}
const range = (g) => (g.slides.length > 1 ? `slides ${g.slides[0].n}–${g.slides[g.slides.length - 1].n}` : `slide ${g.slides[0].n}`);

const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>SŌMNA — Part I speech</title><style>
${font('jost-latin-300-normal.woff2', 300)}${font('jost-latin-400-normal.woff2', 400)}${font('jost-latin-500-normal.woff2', 500)}
${font('ibm-plex-mono-latin-400-normal.woff2', 400, 'normal', 'IBM Plex Mono')}${font('ibm-plex-mono-latin-500-normal.woff2', 500, 'normal', 'IBM Plex Mono')}
@page{size:A4;margin:16mm 17mm 16mm}
*{box-sizing:border-box}
body{margin:0;font-family:Jost,Arial,sans-serif;color:#14161c;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.mono{font-family:'IBM Plex Mono',monospace;text-transform:uppercase;letter-spacing:.2em;font-size:7.6pt;color:#8a6d45}
.br{white-space:nowrap}.bo{position:relative;display:inline-block}.bo i{position:absolute;left:50%;top:.02em;width:.52em;height:.07em;min-height:.6px;background:currentColor;transform:translateX(-50%)}
.head{padding-bottom:6mm;border-bottom:.4mm solid #c8ad85;margin-bottom:6mm}
.wm{font-size:24pt;font-weight:300;letter-spacing:.32em}.wm .bo i{background:#c8ad85;height:.06em;top:-.04em}
h1{margin:5mm 0 1.5mm;font-weight:300;font-size:22pt;line-height:1.15}
.lead{font-size:10.5pt;line-height:1.55;color:#3a3d45;margin:0 0 5mm}
table{width:100%;border-collapse:collapse;font-size:9.6pt;margin:0 0 5mm}
th{text-align:left;font-family:'IBM Plex Mono',monospace;font-weight:400;text-transform:uppercase;letter-spacing:.12em;font-size:7pt;color:#8a6d45;padding:0 0 1.6mm;border-bottom:.3mm solid #c8ad85}
td{padding:1.5mm 0;border-bottom:.2mm solid #e6e1d8}td:last-child,th:last-child{text-align:right}
.how{font-size:9.6pt;line-height:1.55;color:#3a3d45;margin:0}
h2{break-before:page;margin:0 0 5mm;padding-bottom:3mm;border-bottom:.4mm solid #c8ad85;font-weight:400;font-size:16pt}
h2 .mono{display:block;margin-bottom:1.5mm}
.slide{margin:0 0 6mm;break-inside:avoid}
.slide.long{break-inside:auto}
h3{display:flex;justify-content:space-between;align-items:baseline;margin:0 0 2.2mm;font-weight:500;font-size:11.6pt}
h3 .mono{font-size:7pt;letter-spacing:.14em}
p{margin:0 0 2.3mm;font-size:10.8pt;line-height:1.58;font-weight:400}
.c{font-family:'IBM Plex Mono',monospace;font-size:7.9pt;color:#6b5434;background:#f3ece1;border-radius:1mm;padding:.2mm 1.3mm;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.c.k{background:#c8ad85;color:#14161c;font-weight:500;padding:.2mm 1.6mm}
.tips{break-before:page}.tips li{font-size:10.2pt;line-height:1.55;margin:0 0 2mm}
</style><body>
<header class="head"><div class="wm">${brand('SŌMNA')}</div>
<h1>Part I speech — the pitch</h1>
<div class="mono">Slides ${slides[0].n}–${slides[slides.length - 1].n} · about ${mmss(total)} · ${groups.length} speakers</div></header>
<p class="lead">What to say on each slide of Part I, with every click. The same script appears in the presenter view (press P during the presentation).</p>
<table><tr><th>Slide</th><th>Title</th><th>Speaker</th><th>Time</th></tr>
${slides.map((s) => `<tr><td>${s.n}</td><td>${brand(esc(s.title))}</td><td>Speaker ${s.speaker}</td><td>${mmss(s.seconds)}</td></tr>`).join('')}
<tr><td></td><td><b>Total</b></td><td></td><td><b>${mmss(total)}</b></td></tr></table>
<p class="how"><span class="c k">→</span> press → or the clicker; on slides with builds it shows the next part of the same slide. <span class="c">Text like this</span> is a direction, not to be read aloud. Everything else is spoken, at a calm pace of about 130 words a minute.</p>
${groups
  .map(
    (g) => `<h2><span class="mono">Speaker ${g.speaker} · ${range(g)} · ${mmss(g.slides.reduce((a, s) => a + s.seconds, 0))}</span>Speaker ${g.speaker}</h2>
${g.slides
  .map((s) => `<section class="slide${s.notes.length > 1400 ? ' long' : ''}"><h3><span>${pad(s.n)} · ${brand(esc(s.title))}</span><span class="mono">${mmss(s.seconds)}</span></h3>${script(s.notes)}</section>`)
  .join('\n')}`,
  )
  .join('\n')}
<section class="tips"><h2 style="break-before:auto"><span class="mono">Before and during</span>Delivery tips</h2><ul>
<li><b>Keys:</b> →, Space or the clicker go forward; ← goes back;${hasDemo ? ' Enter on slide 12 opens the website and Esc returns;' : ''} F is full screen; B is a black screen.</li>
<li><b>Presenter view:</b> press P to open this script, a timer and the current and next slides on the laptop screen. It shows which speaker is on and when to hand over.</li>
<li><b>Builds:</b> slides 2, 7, 8 and 10 take extra clicks. Wait for each part to appear before you say it.</li>
<li><b>The live capsule (slide 7):</b> one slow drag is enough to show it is real.</li>
<li><b>Before you start:</b> open somnaairlines.netlify.app/presentation/ a minute early, so the 3D has loaded.</li>
${hasDemo ? '<li><b>No internet:</b> the demo slide plays a recorded walkthrough instead; narrate the same path over it.</li>' : ''}
</ul></section>
</body></html>`;

const tmp = join(tmpdir(), 'somna-speech.html');
writeFileSync(tmp, html);
await b.navigate(pathToFileURL(tmp).href);
await b.evaluate('document.fonts.ready.then(() => 1)');
await sleep(600);
const pdf = await b.send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
writeFileSync(OUT, Buffer.from(pdf.data, 'base64'));
console.log(`wrote ${OUT} · ${slides.length} slides · ${mmss(total)}`);
await b.close();
