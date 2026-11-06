/* 기기의 다크 모드와 상관없이 화면이 늘 밝은지 잰다(2026-11-06 Bumm님 «갤럭시 폴드 7에서 밤에 열면 검은 화면»).

     node scripts/verify/dark-mode-probe.mjs <주소> <결과 폴더> [--sizes 412x960@2.625,750x832@2.625] [--expect-dark]

   같은 샘플 흐름(스플래시 → 1단계 → 2단계 → 로딩 → 3단계 → 개인정보처리방침)을 세 조건으로 돈다:
     light   — 기준. 밝은 설정
     dark    — prefers-color-scheme: dark
     forced  — dark + 크롬 강제 다크(--enable-features=WebContentsForceDark · --blink-settings=forceDarkModeEnabled=true)
   장면마다 캡처의 흰 화소 비율 · 평균 밝기를 재어 light와 견준다. 평균 밝기가 12단계 넘게 낮으면 실패다(영상 · 움직임으로 조금은 갈린다). 로딩만 무작위 장면이라 평균 180 미만이면 실패다.
   --expect-dark는 자기 검사다 — 선언을 뺀 빌드에서는 forced가 실제로 어두워져야 통과한다(강제 다크가 안 걸린 크롬이면 이 도구는 아무것도 못 잡는다).
   서버 AI 요청은 막고, 생성(/generate) 요청이 잡히면 종료코드 2다. 삼성 인터넷 · 실기기는 이 도구로 잴 수 없다. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--sizes');
const url = positional[0];
const out = positional[1] && path.resolve(positional[1]);
if (!url || !out) { console.error('주소와 결과 폴더를 주세요'); process.exit(1); }
const expectDark = args.includes('--expect-dark');
const sizes = opt('--sizes', '412x960@2.625,750x832@2.625').split(',').map((s) => { const [wh, dpr] = s.split('@'); const [w, h] = wh.split('x').map(Number); return { w, h, dpr: Number(dpr || 1) }; });
const UA = 'Mozilla/5.0 (Linux; Android 16; SM-F966N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
const CONDITIONS = { light: [], dark: [], forced: ['--enable-features=WebContentsForceDark', '--blink-settings=forceDarkModeEnabled=true'] };
const delay = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));
await fs.mkdir(out, { recursive: true });
const results = {};
let generated = 0;
let port = 9571;

async function run(cond, size) {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'probe-chrome-'));
  const p = port++;
  const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--no-default-browser-check', '--mute-audio', `--remote-debugging-port=${p}`, `--user-data-dir=${profile}`, ...CONDITIONS[cond], 'about:blank'], { stdio: 'ignore' });
  let socket, seq = 0;
  const pending = new Map();
  try {
    let target;
    for (let i = 0; i < 80; i++) { try { target = (await (await fetch(`http://127.0.0.1:${p}/json`)).json()).find((t) => t.type === 'page'); if (target) break; } catch {} await delay(100); }
    if (!target) throw Error('브라우저를 못 띄움');
    socket = new globalThis.WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r, j) => { socket.onopen = r; socket.onerror = j; });
    socket.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id) { const q = pending.get(m.id); pending.delete(m.id); if (m.error) q.reject(Error(m.error.message)); else q.resolve(m.result); }
      if (m.method === 'Network.requestWillBeSent' && /\/generate/.test(m.params.request.url)) generated++;
    };
    const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
    const evaluate = async (expression) => { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result.value; };
    const scene = async (name) => {
      const s = await call('Page.captureScreenshot', { format: 'png' });
      const file = path.join(out, `${cond}-${size.w}x${size.h}-${name}.png`);
      await fs.writeFile(file, Buffer.from(s.data, 'base64'));
      const stat = await evaluate(`new Promise((res) => { const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(i, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data; let sum = 0, white = 0; for (let k = 0; k < d.length; k += 4) { const v = (d[k] + d[k + 1] + d[k + 2]) / 3; sum += v; if (v >= 240) white++; } res({ mean: Math.round(sum / (d.length / 4) * 10) / 10, white: Math.round(white / (d.length / 4) * 1000) / 10 }); }; i.onerror = () => res(null); i.src = 'data:image/png;base64,${s.data}'; })`);
      (results[`${size.w}x${size.h}`] ??= {})[name] ??= {};
      results[`${size.w}x${size.h}`][name][cond] = stat;
    };
    await call('Page.enable');
    await call('Network.enable');
    await call('Network.setBlockedURLs', { urls: ['*cloudfunctions.net*', '*/generate*'] });
    await call('Emulation.setDeviceMetricsOverride', { width: size.w, height: size.h, deviceScaleFactor: size.dpr, mobile: true, screenWidth: size.w, screenHeight: size.h });
    await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await call('Emulation.setUserAgentOverride', { userAgent: UA, platform: 'Linux armv8l' });
    await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: cond === 'light' ? 'light' : 'dark' }] });
    await call('Page.navigate', { url });
    await delay(900);
    await scene('splash');
    for (let i = 0; i < 80; i++) { if (await evaluate('!document.getElementById("splash") && !!document.getElementById("prepareNextBtn")')) break; await delay(200); }
    await delay(600);
    await scene('step1');
    await evaluate('scrollTo(0, document.scrollingElement.scrollHeight); document.getElementById("prepareNextBtn").click() || true');
    await delay(1500);
    await scene('step2');
    await evaluate(`document.getElementById('shotBtn').click() || true`);
    await delay(2500);
    await scene('loading');
    for (let i = 0; i < 200; i++) { if (await evaluate('document.body.dataset.step === "3"')) break; await delay(250); }
    await delay(1500);
    await scene('step3');
    await call('Page.navigate', { url: new globalThis.URL('privacy.html', url).href });
    await delay(1500);
    await scene('privacy');
  } finally {
    try { socket?.close(); } catch {}
    chrome.kill();
    await delay(400);
    await fs.rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

for (const size of sizes) for (const cond of Object.keys(CONDITIONS)) await run(cond, size);

let bad = 0, forcedDark = 0;
for (const [size, scenes] of Object.entries(results)) {
  console.log(`== ${size}`);
  for (const [name, c] of Object.entries(scenes)) {
    const line = Object.entries(c).map(([k, v]) => `${k} 평균 ${v?.mean} 흰 ${v?.white}%`).join(' · ');
    // 로딩은 장면이 무작위라 조건끼리 그림이 다르다 — 견주지 않고 밝은 바탕인지만 본다(강제 다크에 뒤집히면 평균 58~106)
    const low = (k) => !c.light || !c[k] || (name === 'loading' ? c[k].mean < 180 : c.light.mean - c[k].mean > 12);
    const lows = ['dark', 'forced'].filter(low);
    if (low('forced')) forcedDark++;
    if (!expectDark && lows.length) bad++;
    console.log(`  ${name}: ${line}${lows.length ? ` ← 어두움(${lows.join(',')})` : ''}`);
  }
}
await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(results, null, 1));
console.log(`생성 요청 ${generated}건`);
if (generated) process.exit(2);
if (expectDark) { console.log(forcedDark ? `자기 검사 통과: 강제 다크가 ${forcedDark}장면을 어둡게 했다` : '자기 검사 실패: 강제 다크가 한 장면도 어둡게 하지 못했다'); process.exit(forcedDark ? 0 : 1); }
console.log(bad ? `실패 ${bad}장면` : '모든 장면이 밝은 화면과 같다');
process.exit(bad ? 1 : 0);
