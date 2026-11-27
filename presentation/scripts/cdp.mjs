// Minimal Chrome DevTools Protocol driver (Node 22+ built-in WebSocket).
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch({ port = 9333, width = 1920, height = 1080, url = 'about:blank', profile, headless = true } = {}) {
  mkdirSync(profile, { recursive: true });
  const args = [
    headless ? '--headless=new' : '',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization',
    '--use-angle=d3d11',
    '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--no-first-run',
    '--no-default-browser-check',
    url,
  ].filter(Boolean);
  const proc = spawn(CHROME, args, { stdio: 'ignore', detached: false });
  let targets;
  for (let i = 0; i < 60; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      if (targets.find((t) => t.type === 'page')) break;
    } catch {}
    await sleep(250);
  }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    } else if (m.method && listeners.has(m.method)) listeners.get(m.method).forEach((f) => f(m.params));
  });
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const i = ++id;
      pending.set(i, { res, rej });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const on = (method, f) => {
    if (!listeners.has(method)) listeners.set(method, []);
    listeners.get(method).push(f);
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  const evaluate = async (expression, awaitPromise = true) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + JSON.stringify(r.exceptionDetails.exception?.description ?? ''));
    return r.result.value;
  };
  const shot = async (file, { format = 'jpeg', quality = 92, clip } = {}) => {
    const r = await send('Page.captureScreenshot', { format, quality: format === 'jpeg' ? quality : undefined, clip, captureBeyondViewport: false });
    writeFileSync(file, Buffer.from(r.data, 'base64'));
    return file;
  };
  const navigate = async (u) => {
    await send('Page.navigate', { url: u });
    await sleep(1500);
  };
  const close = async () => {
    try {
      await send('Browser.close');
    } catch {}
    proc.kill();
  };
  return { send, on, evaluate, shot, navigate, close, sleep, proc };
}

export { sleep, join };
