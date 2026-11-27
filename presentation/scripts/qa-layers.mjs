// QA for the deck's layers: live-website demo, overview grid, help, and the presenter
// window (synced from a second tab over BroadcastChannel).   node presentation/scripts/qa-layers.mjs
import { launch, sleep } from './cdp.mjs';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'export', 'qa');
mkdirSync(out, { recursive: true });
const base = process.argv[2] || 'http://localhost:5180/';
const b = await launch({ profile: join(tmpdir(), 'somna-deck-qa2'), url: 'about:blank' });
const key = async (k, code, vk) => {
  await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk });
  await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
};

// overview
await b.navigate(base + '?r=1#8');
await sleep(2500);
await key('o', 'KeyO', 79);
await sleep(1200);
await b.shot(join(out, 'layer_overview.jpg'), { quality: 75 });
await key('Escape', 'Escape', 27);
// help
await key('h', 'KeyH', 72);
await sleep(600);
await b.shot(join(out, 'layer_help.jpg'), { quality: 75 });
await key('h', 'KeyH', 72);

// demo: Enter on slide 12 opens the live site in the deck
await b.navigate(base + '?r=2#12');
await sleep(2500);
await key('Enter', 'Enter', 13);
await sleep(9000);
const frame = await b.evaluate(`(() => { const f = document.querySelector('.demo-layer iframe'); return f ? f.src : (document.querySelector('.demo-offline') ? 'offline-fallback' : 'none') })()`);
console.log('demo layer:', frame);
await b.shot(join(out, 'layer_demo.jpg'), { quality: 75 });
await b.evaluate(`document.querySelector('.demo-back').click(), 1`);
await sleep(800);
console.log('after back, hash', await b.evaluate('location.hash'), 'demo open', await b.evaluate(`!!document.querySelector('.demo-layer')`));

// presenter window in a second tab, driven from the presenter
const t = await b.send('Target.createTarget', { url: base + '?presenter' });
const targets = await (await fetch('http://127.0.0.1:9333/json')).json();
const pt = targets.find((x) => x.id === t.targetId);
const ws = new WebSocket(pt.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pend = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) {
    pend.get(m.id)(m.result);
    pend.delete(m.id);
  }
});
const psend = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await psend('Emulation.setDeviceMetricsOverride', { width: 1400, height: 860, deviceScaleFactor: 1, mobile: false });
await sleep(3500);
// press → in the presenter: the main deck must advance
await psend('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
await psend('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
await sleep(1500);
console.log('main deck after presenter →:', await b.evaluate('location.hash'));
const shot = await psend('Page.captureScreenshot', { format: 'jpeg', quality: 75 });
const { writeFileSync } = await import('node:fs');
writeFileSync(join(out, 'layer_presenter.jpg'), Buffer.from(shot.data, 'base64'));
ws.close();
await b.close();
console.log('done');
