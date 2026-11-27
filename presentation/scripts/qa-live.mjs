// QA for the live 3D slides (the website's own scenes rendered in the deck): walks into each one
// with the keyboard, measures frame pacing while it plays, and screenshots it.
//   node presentation/scripts/qa-live.mjs [url]
import { launch, sleep } from './cdp.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'export', 'qa-live');
mkdirSync(out, { recursive: true });
const base = process.argv[2] || 'http://localhost:5180/';
const b = await launch({ port: 9334, profile: join(tmpdir(), 'somna-deck-qa-live'), url: 'about:blank' });
const errors = [];
b.on('Runtime.exceptionThrown', (p) => errors.push('exception: ' + (p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text)));
b.on('Runtime.consoleAPICalled', (p) => (p.type === 'error' || p.type === 'warning') && errors.push(p.type + ': ' + p.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300)));

const key = async (k = 'ArrowRight') => {
  const vk = { ArrowRight: 39, ArrowLeft: 37 }[k];
  await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: vk });
  await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: vk });
};
// frame pacing over `ms`: every rAF interval, summarised
const pace = (ms) =>
  b.evaluate(`new Promise(r => { const d = []; let last = performance.now(); const t0 = last;
    const f = (t) => { d.push(t - last); last = t; if (t - t0 < ${ms}) requestAnimationFrame(f); else { d.sort((a, b) => a - b);
      const q = (p) => +d[Math.min(d.length - 1, Math.floor(d.length * p))].toFixed(1);
      r({ frames: d.length, fps: Math.round(d.length / (${ms} / 1000)), p50: q(0.5), p95: q(0.95), max: +d[d.length - 1].toFixed(1), over25: d.filter((x) => x > 25).length }); } };
    requestAnimationFrame(f); })`);
const canvasInfo = () =>
  b.evaluate(`(() => { const c = document.querySelector('.live3d canvas'); if (!c) return null; const r = c.getBoundingClientRect();
    return { buffer: c.width + 'x' + c.height, css: Math.round(r.width) + 'x' + Math.round(r.height), veil: getComputedStyle(document.querySelector('.live-veil')).opacity } })()`);

const report = [];
const log = (label, x) => {
  report.push({ label, ...x });
  console.log(label.padEnd(34), JSON.stringify(x));
};

// arrive at each 3D slide from the end of the slide before it, exactly as a presenter would
const arrive = async (from, label) => {
  await b.navigate(`${base}?qa=${Date.now()}#${from}`);
  for (let i = 0; i < 40 && !(await canvasInfo()); i++) await sleep(500);
  await sleep(4500); // load + the layer's warm-up
  log(`${from} (still slide, 3D prepared)`, await pace(1500));
  await key();
  log(`${label} — transition in`, await pace(1500));
};
const drag = async () => {
  const pt = (type, x, buttons) => b.send('Input.dispatchMouseEvent', { type, x, y: 560, button: 'left', buttons, clickCount: type === 'mouseMoved' ? 0 : 1 });
  await pt('mouseMoved', 1250, 0);
  await pt('mousePressed', 1250, 1);
  for (let i = 1; i <= 20; i++) {
    await pt('mouseMoved', 1250 - i * 12, 1);
    await sleep(16);
  }
  await pt('mouseReleased', 1010, 0);
};

await arrive('2.2', '3 reveal');
await sleep(1500);
await b.shot(join(out, '03_reveal_a.jpg'), { quality: 80 });
log('3 reveal (hero, live)', { canvas: await canvasInfo(), ...(await pace(6000)) });
await b.shot(join(out, '03_reveal_b.jpg'), { quality: 80 });
await key();
log('3 → 4 (dip between scenes)', await pace(1500));
await sleep(1000);
await b.shot(join(out, '04_manifesto_a.jpg'), { quality: 80 });
log('4 manifesto (cabin, live)', await pace(6000));
await b.shot(join(out, '04_manifesto_b.jpg'), { quality: 80 });
await key();
log('4 → 5 (3D covered)', await pace(1500));
await sleep(2000);
log('5 triptych (3D stopped)', await pace(1500));

await arrive('6', '7 capsule');
await sleep(1000);
await b.shot(join(out, '07_capsule_a.jpg'), { quality: 80 });
log('7 capsule (showcase, live)', await pace(3000));
await key();
log('7.1 explode', await pace(2500));
await b.shot(join(out, '07_capsule_b_exploded.jpg'), { quality: 80 });
await sleep(2600);
await b.shot(join(out, '07_capsule_c_next_part.jpg'), { quality: 80 });
await key();
await sleep(2500);
await b.shot(join(out, '07_capsule_d_dream.jpg'), { quality: 80 });
log('7.2 dream light', await pace(2500));
await drag();
await sleep(1500);
await b.shot(join(out, '07_capsule_e_dragged.jpg'), { quality: 80 });
await key();
log('7 → 8 (3D covered)', await pace(1500));

await arrive('12', '13 close');
await sleep(1500);
await b.shot(join(out, '13_close_a.jpg'), { quality: 80 });
log('13 close (finale, live)', await pace(6000));
await b.shot(join(out, '13_close_b.jpg'), { quality: 80 });

writeFileSync(join(out, 'report.json'), JSON.stringify({ report, errors }, null, 1));
console.log('errors:', errors.length ? errors : 'none');
await b.close();
