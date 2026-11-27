// Live QA run: walks the whole deck with the keyboard exactly as a presenter would (every
// build step), screenshots each state after its animation settles, and records console
// errors, failed requests and frame pacing.   node presentation/scripts/qa.mjs [url]
import { launch, sleep } from './cdp.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'export', 'qa');
mkdirSync(out, { recursive: true });
const base = process.argv[2] || 'http://localhost:5180/';
const b = await launch({ profile: join(tmpdir(), 'somna-deck-qa'), url: 'about:blank' });
const errors = [];
b.on('Runtime.exceptionThrown', (p) => errors.push('exception: ' + (p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text)));
b.on('Runtime.consoleAPICalled', (p) => p.type === 'error' && errors.push('console: ' + p.args.map((a) => a.value ?? a.description).join(' ')));
await b.send('Network.enable');
b.on('Network.loadingFailed', (p) => !p.canceled && errors.push('network: ' + p.errorText + ' ' + p.requestId));
b.on('Network.responseReceived', (p) => p.response.status >= 400 && errors.push(`http ${p.response.status}: ${p.response.url}`));

await b.navigate(base + '#1');
await sleep(3000);
const key = (k) =>
  b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k === ' ' ? 'Space' : k, windowsVirtualKeyCode: k === 'ArrowRight' ? 39 : 32 }).then(() =>
    b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k === ' ' ? 'Space' : k, windowsVirtualKeyCode: k === 'ArrowRight' ? 39 : 32 }),
  );
const fps = () => b.evaluate(`new Promise(r=>{let n=0,worst=0,last=performance.now();const t0=last;const f=t=>{n++;worst=Math.max(worst,t-last);last=t; if(t-t0<1000) requestAnimationFrame(f); else r({fps:n,worst:Math.round(worst)})};requestAnimationFrame(f)})`);
const report = [];
let guard = 0;
while (guard++ < 80) {
  const st = await b.evaluate(`location.hash`);
  await sleep(st === '#1' ? 4200 : 2600);
  const f = await fps();
  const name = st.replace('#', '').replace('.', '-');
  await b.shot(join(out, `${name.padStart(4, '0')}.jpg`), { quality: 70 });
  const vids = await b.evaluate(`[...document.querySelectorAll('.slide.is-active video')].map(v => ({ src: v.currentSrc.split('/').pop(), playing: !v.paused, t: +v.currentTime.toFixed(1), ready: v.readyState }))`);
  const canvas = await b.evaluate(`!!document.querySelector('.slide.is-active canvas')`);
  report.push({ at: st, ...f, vids, canvas });
  console.log(st, JSON.stringify(f), vids.map((v) => `${v.src}:${v.playing ? 'play' : 'paused'}@${v.t}`).join(' '), canvas ? '3D' : '');
  const before = st;
  await key('ArrowRight');
  await sleep(250);
  if ((await b.evaluate(`location.hash`)) === before) break; // end of deck
}
writeFileSync(join(out, 'report.json'), JSON.stringify({ report, errors }, null, 1));
console.log('errors:', errors.length ? errors : 'none');
await b.close();
