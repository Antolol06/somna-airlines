// Records the website's 3D sequences as perfectly even 60 fps clips.
//
// Real-time screen capture drops and repeats frames (that is what made the first clips judder).
// Here the website's clock is virtualised instead: performance.now, Date.now, requestAnimationFrame
// and timers only advance when this script says so — exactly 1/60 s per frame — and every frame is
// captured before the next one is computed. CSS transitions (the capsule's touchscreen) are slowed
// by the same factor through the DevTools animation domain, so they stay in step with the 3D.
//
// Needs the website's dev server (npm run dev → http://localhost:5173, which exposes its dev-only
// inspection hooks). Nothing in the website is modified.
//   node presentation/scripts/record.mjs [clip,clip…]      clips: cabin hero finale dream panel arrival
import { launch, sleep } from './cdp.mjs';
import { mkdirSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const CLIPS = join(here, '..', 'public', 'media', 'clips');
const SITE = process.env.SITE || 'http://localhost:5173/';
const ONLY = process.argv[2] ? process.argv[2].split(',') : null;
const FPS = 60;
const DT = 1000 / FPS;

// ---------------------------------------------------------------- the virtual clock (page side)
const VIRTUAL_TIME = `(() => {
  const realRaf = window.requestAnimationFrame.bind(window), realCaf = window.cancelAnimationFrame.bind(window);
  const realNow = performance.now.bind(performance), realDate = Date.now;
  const realST = window.setTimeout.bind(window), realCT = window.clearTimeout.bind(window);
  const realSI = window.setInterval.bind(window), realCI = window.clearInterval.bind(window);
  const V = { on: false, t: 0, dateBase: 0, rafs: new Map(), id: 0, timers: new Map(), tid: 1e7 };
  performance.now = () => (V.on ? V.t : realNow());
  Date.now = () => (V.on ? Math.round(V.dateBase + V.t) : realDate());
  window.requestAnimationFrame = (cb) => { if (!V.on) return realRaf(cb); const id = ++V.id; V.rafs.set(id, cb); return id; };
  window.cancelAnimationFrame = (id) => (V.rafs.has(id) ? V.rafs.delete(id) : realCaf(id));
  window.setTimeout = (fn, ms, ...a) => { if (!V.on) return realST(fn, ms, ...a); const id = ++V.tid; V.timers.set(id, { at: V.t + (+ms || 0), fn, a }); return id; };
  window.setInterval = (fn, ms, ...a) => { if (!V.on) return realSI(fn, ms, ...a); const id = ++V.tid; V.timers.set(id, { at: V.t + Math.max(1, +ms || 0), fn, a, every: Math.max(1, +ms || 0) }); return id; };
  window.clearTimeout = (id) => (V.timers.has(id) ? V.timers.delete(id) : realCT(id));
  window.clearInterval = (id) => (V.timers.has(id) ? V.timers.delete(id) : realCI(id));
  // keep the compositor producing frames (the page itself no longer asks for any), so a
  // screenshot never waits for an idle renderer to wake up
  let dot = null, flip = false;
  const keepAlive = () => {
    if (!dot && document.body) {
      dot = document.createElement('div');
      dot.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;background:#000;z-index:2147483647;pointer-events:none;will-change:opacity';
      document.body.appendChild(dot);
    }
    if (dot) dot.style.opacity = (flip = !flip) ? '0.011' : '0.012';
    realRaf(keepAlive);
  };
  window.__freeze = () => { V.dateBase = realDate() - realNow(); V.t = realNow(); V.on = true; keepAlive(); return V.t; };
  window.__advance = (ms) => {
    V.t += ms;
    for (let guard = 0; guard < 500; guard++) {
      let next = null;
      for (const [id, tm] of V.timers) if (tm.at <= V.t && (!next || tm.at < next[1].at)) next = [id, tm];
      if (!next) break;
      const [id, tm] = next;
      if (tm.every) tm.at += tm.every; else V.timers.delete(id);
      try { typeof tm.fn === 'function' ? tm.fn(...tm.a) : 0; } catch (e) { console.error(e); }
    }
    const cbs = [...V.rafs.values()];
    V.rafs.clear();
    for (const cb of cbs) { try { cb(V.t); } catch (e) { console.error(e); } }
    return V.t;
  };
})();`;

// ---------------------------------------------------------------- the recorder
const b = await launch({ port: 9340, profile: join(tmpdir(), 'somna-record-' + Date.now()), url: 'about:blank' });
const E = b.evaluate;
await b.send('Page.addScriptToEvaluateOnNewDocument', { source: VIRTUAL_TIME });
await b.send('Animation.enable');
const errors = [];
b.on('Runtime.exceptionThrown', (p) => errors.push(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text));

const ease = (k) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, k)));
const easeOut = (k) => 1 - (1 - k) * (1 - k);

async function openSite() {
  await b.navigate(SITE + '?rec=' + Date.now());
  await sleep(4000);
  await E(`new Promise(r=>{let n=0;const t=setInterval(()=>{n++;const x=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Begin in silence'); if(x&&!x.disabled){clearInterval(t);x.click();r(1)} if(n>400){clearInterval(t);r(0)}},250)})`);
  await sleep(2500);
  await E(`(() => { const s = document.createElement('style'); s.id = '__clean'; s.media = 'not all';
    s.textContent = '#root > *:not(.webgl-layer):not(.veil):not(.breath), #root > *:not(.webgl-layer):not(.veil):not(.breath) * { visibility: hidden !important; } .veil{opacity:0!important}';
    document.head.appendChild(s); return 1 })()`);
  await E('window.__freeze()');
}
const clean = (on) => E(`(document.getElementById('__clean').media = ${on ? "'all'" : "'not all'"}, 1)`);
/** run the site forward without capturing (yielding to the event loop every few frames) */
async function ff(seconds, drive = () => '') {
  const n = Math.round(seconds * FPS);
  for (let i = 0; i < n; i += 4) {
    let js = '';
    for (let j = i; j < Math.min(n, i + 4); j++) js += `${drive(j / FPS)};window.__advance(${DT});`;
    await E(`(() => { ${js} return 1 })()`);
  }
}

/**
 * Record `seconds` of the site: before each frame `drive(t)` returns JS to run at virtual time t,
 * `at` lists actions to run at given times. Frames → H.264, 60 fps.
 */
async function record(name, seconds, { drive = () => '', at = [], ui = false, crf = 22, trim = 0, vf = null } = {}) {
  if (ONLY && !ONLY.includes(name)) return;
  const dir = join(tmpdir(), 'somna-frames-' + name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  if (!ui) await clean(true);
  const n = Math.round(seconds * FPS);
  const todo = [...at].sort((a, c) => a[0] - c[0]);
  let rate = 0.35;
  await b.send('Animation.setPlaybackRate', { playbackRate: rate });
  let t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const t = i / FPS;
    while (todo.length && todo[0][0] <= t) await todo.shift()[1]();
    await E(`(() => { ${drive(t)}; window.__advance(${DT}); return 1 })()`);
    const shot = await b.send('Page.captureScreenshot', { format: 'jpeg', quality: 94, captureBeyondViewport: false });
    writeFileSync(join(dir, String(i).padStart(5, '0') + '.jpg'), Buffer.from(shot.data, 'base64'));
    // keep CSS transitions in step with the virtual clock
    if (i % 30 === 29) {
      const per = (Date.now() - t0) / 30;
      t0 = Date.now();
      rate = Math.min(1, Math.max(0.05, DT / per));
      await b.send('Animation.setPlaybackRate', { playbackRate: rate });
    }
  }
  await b.send('Animation.setPlaybackRate', { playbackRate: 1 });
  if (!ui) await clean(false);
  const out = join(CLIPS, name + '.mp4');
  const opts = ['-v', 'error', '-y', '-framerate', String(FPS), '-start_number', String(Math.round(trim * FPS)), '-i', join(dir, '%05d.jpg')];
  if (vf) opts.push('-vf', vf);
  execFileSync('ffmpeg', [...opts, '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', out]);
  // the video's poster is its own first frame (the deck's stills keep their chosen frame in <name>.jpg)
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', out, '-frames:v', '1', '-q:v', '3', join(CLIPS, name + '_0.jpg')]);
  rmSync(dir, { recursive: true, force: true });
  console.log(`${name}: ${n} frames · ${seconds}s @ ${FPS} fps · ${(statSync(out).size / 1e6).toFixed(1)} MB · css rate ≈ ${rate.toFixed(2)}`);
}

const chapter = (ch, p) => `window.__chapter('${ch}', ${p.toFixed(5)})`;
const clickText = (sel, text) => () => E(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.textContent.trim() === ${JSON.stringify(text)}); if (el) el.click(); return !!el })()`);
const store = (js) => () => E(`(${js}, 1)`);

// ---------------------------------------------------------------- scroll chapters (fallbacks + slide 18)
const scrollClips = [
  // name, chapter, from, to, seconds (the deck used to slow these down on playback; now baked in)
  ['cabin', 'cabin', 0.035, 0.27, 13],
  ['hero', 'hero', 0.12, 0.34, 9],
  ['finale', 'finale', 0.3, 0.62, 9],
];
if (!ONLY || scrollClips.some(([n]) => ONLY.includes(n))) {
  await openSite();
  for (const [name, ch, a, z, secs] of scrollClips) {
    if (ONLY && !ONLY.includes(name)) continue;
    await ff(3, () => chapter(ch, a)); // settle at the start of the move
    await record(name, secs, { drive: (t) => chapter(ch, a + (z - a) * ease(t / (secs - 0.6))) });
  }
}

// ---------------------------------------------------------------- the dream (boarding → in the capsule)
if (!ONLY || ['dream', 'panel', 'arrival'].some((n) => ONLY.includes(n))) {
  await openSite();
  await E(`window.__store().set({ guestCapsules: [null], activeGuest: 0, from: 'newyork', to: 'paris' }), 1`);
  await ff(3, () => chapter('globe', 0.35));
  if (!ONLY || ONLY.includes('dream')) {
    await record('dream', 21, { at: [[0.1, clickText('button', 'Dream me there')]], crf: 23 });
  } else {
    await clickText('button', 'Dream me there')();
    await ff(21);
  }
  await ff(2);

  // the capsule's touchscreen, with the website's UI visible
  await record('panel', 13, {
    ui: true,
    at: [
      [0.6, store(`window.__store().set({ capsuleControlsOpen: true })`)],
      [3.6, clickText('.capsule-tablet button', 'Dream')],
      [6.6, store(`window.__store().setPrefs({ ambient: 'lavender', ambientLevel: 55 })`)],
      [9.1, clickText('.capsule-tablet [role=tab]', 'Window')],
    ],
  });
  await E(`(window.__store().set({ capsuleControlsOpen: false }), window.__store().setPrefs({ lighting: 'relax' }), 1)`);
  await ff(1);

  // waking up in Paris
  await E(`(window.__store().set({ dreamPhase: 'idle', mode: 'scroll' }), 1)`);
  await ff(0.5);
  await E(`(window.__store().set({ mode: 'dream', dreamPhase: 'arrival', to: 'paris', from: 'newyork' }), Object.assign(window.__dream, { veil: 0, arrival: 0 }), 1)`);
  await ff(3, () => 'window.__dream.arrival = 0');
  const secs = 11;
  // the first second is the website's pure-white wake-up glow: trimmed, so a projector never flashes white.
  // A light denoise keeps the photograph's film grain from bloating the file.
  await record('arrival', secs, {
    drive: (t) => `window.__dream.arrival = ${0.75} * (${easeOut(Math.min(1, t / (secs - 0.4)))})`,
    trim: 1,
    vf: 'hqdn3d=1.5:1.5:4:4',
    crf: 24,
  });
}

console.log(errors.length ? 'page errors: ' + errors.slice(0, 5).join(' | ') : 'no page errors');
await b.close();
