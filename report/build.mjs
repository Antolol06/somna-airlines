// Builds the report PDF from report/index.html (headless Chrome, A4, backgrounds on), checks that no
// page's content overflows, and optionally writes a PNG preview of every page.
//   node report/build.mjs [previewDir]
import { launch, sleep } from '../presentation/scripts/cdp.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, 'SOMNA-Project-Report-MANA.pdf');
const preview = process.argv[2];

const b = await launch({ port: 9352, width: 794, height: 1123, profile: join(tmpdir(), 'somna-report-' + Date.now()), url: 'about:blank' });
await b.navigate(pathToFileURL(join(here, 'index.html')).href);
await b.evaluate('document.fonts.ready.then(() => 1)');
await sleep(800);

// every page's body must fit inside its page
const overflow = await b.evaluate(`[...document.querySelectorAll('.page')].map((p, i) => {
  const body = p.querySelector('.body'); if (!body) return null;
  const limit = body.getBoundingClientRect().bottom;
  const lowest = Math.max(...[...body.querySelectorAll('*')].map((e) => e.getBoundingClientRect().bottom));
  return lowest > limit + 0.5 ? 'page ' + (i + 1) + ' overflows by ' + Math.round(lowest - limit) + 'px' : null;
}).filter(Boolean)`);
console.log(overflow.length ? overflow.join('\n') : 'no page overflows');

const fonts = await b.evaluate(`[...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family + ' ' + f.weight + ' ' + f.style)`);
console.log('fonts loaded:', fonts.length);

const pdf = await b.send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 });
writeFileSync(OUT, Buffer.from(pdf.data, 'base64'));
console.log('wrote', OUT);

if (preview) {
  mkdirSync(preview, { recursive: true });
  await b.evaluate(`(document.body.style.padding = '0', document.querySelectorAll('.page').forEach((p) => (p.style.margin = '0', p.style.boxShadow = 'none')), 1)`);
  const n = await b.evaluate(`document.querySelectorAll('.page').length`);
  for (let i = 0; i < n; i++) {
    const r = await b.evaluate(`(() => { const r = document.querySelectorAll('.page')[${i}].getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height } })()`);
    const shot = await b.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 1.4 } });
    writeFileSync(join(preview, `report_${i + 1}.png`), Buffer.from(shot.data, 'base64'));
  }
  console.log('previews in', preview);
}
await b.close();
