/* 샘플 모드 흐름을 끝까지 눌러 보고 «카메라·서버 요청이 하나도 없는지»를 네트워크 기록으로 증명한다(2026-10-09).
   샘플 모드 = .env.production의 VITE_SAMPLE_MODE=1(Bumm님: 샘플이어도 로딩 화면 40초 뒤 포스터 고르기).

     node scripts/verify/design-sample-flow.mjs [주소] [결과 폴더] [--width 2560 --height 1440 --scale 1] [--record]

   주소를 안 주면 로컬 개발 서버(http://127.0.0.1:5500/)를 열고, 그때는 https 요청을 아예 막는다.
   라이브 주소를 주면 막지 않고 **모든 요청을 적어 두고** 판정한다 — 막아 두면 «안 보냈다»가 아니라 «못 보냈다»가 된다.
   판정: ① getUserMedia 호출 0회 · 카메라 권한 상태가 «묻기 전» 그대로 ② Functions·OpenAI·/generate·/health 요청 0건
         ③ «샘플 포스터 보기»부터 포스터 고르기까지 40초 이상(장면 5개), 그 사이 로딩 화면 장면이 8초마다 넘어감
         ④ 포스터 8종이 모두 서로 다르게 그려짐. 하나라도 어긋나면 종료코드 1.
   캡처는 원본 해상도 PNG, --record면 화면 프레임(JPEG)과 ffmpeg 묶음 목록을 남긴다. 인쇄·생성은 누르지 않는다. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const flags = new Set(['--width', '--height', '--scale']);
const positional = args.filter((a, i) => !a.startsWith('--') && !flags.has(args[i - 1]));
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const url = positional[0] || 'http://127.0.0.1:5500/';
const out = path.resolve(positional[1] || '.cache/design-sample-flow');
const W = Number(opt('--width', 1920)), H = Number(opt('--height', 1080)), SCALE = Number(opt('--scale', 1));
const RECORD = args.includes('--record');
const local = /^http:\/\/(127\.0\.0\.1|localhost)/.test(url);
const MOBILE = W < 768;
await fs.mkdir(out, { recursive: true });

const port = 9538;
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--mute-audio', `--remote-debugging-port=${port}`, `--user-data-dir=${out}/chrome`, `--window-size=${W},${H}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const delay = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));
let socket, seq = 0;
const pending = new Map();
const requests = [];
const frames = [];
try {
  let target;
  for (let i = 0; i < 50; i++) { try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); if (target) break; } catch {} await delay(100); }
  assert.ok(target, '브라우저 시작');
  socket = new globalThis.WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { socket.onopen = r; socket.onerror = j; });
  const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  socket.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result); return; }
    if (m.method === 'Network.requestWillBeSent') requests.push({ t: Date.now(), method: m.params.request.method, url: m.params.request.url, type: m.params.type });
    if (m.method === 'Page.screencastFrame') { frames.push({ ts: m.params.metadata.timestamp, data: m.params.data }); call('Page.screencastFrameAck', { sessionId: m.params.sessionId }).catch(() => {}); }
  };
  const evaluate = async (expression) => { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); assert.ok(!r.exceptionDetails, JSON.stringify(r.exceptionDetails)); return r.result.value; };
  const capture = async (name) => { const s = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await fs.writeFile(path.join(out, `${name}.png`), Buffer.from(s.data, 'base64')); };
  await call('Network.enable');
  if (local) await call('Network.setBlockedURLs', { urls: ['https://*'] });
  await call('Page.enable');
  // 카메라를 부르면 센다(권한 창 대신). 인쇄는 막는다 — 이 확인은 프린터를 쓰지 않는다.
  await call('Page.addScriptToEvaluateOnNewDocument', { source: "if(navigator.mediaDevices){navigator.mediaDevices.getUserMedia=async()=>{window.__cameraCalls=(window.__cameraCalls||0)+1;throw Error('샘플 확인 중 카메라 차단');};}window.print=()=>{throw Error('샘플 확인 중 인쇄 차단');};" });
  await call('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: SCALE, mobile: MOBILE });
  if (RECORD) await call('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: W * SCALE, maxHeight: H * SCALE, everyNthFrame: 1 });
  await call('Page.navigate', { url });
  for (let i = 0; i < 100; i++) { if (await evaluate('!!document.getElementById("shotBtn") && !document.getElementById("splash")')) break; await delay(100); }
  await evaluate('document.fonts.ready.then(() => true)');
  await capture('1-영화준비');
  await evaluate("document.getElementById('prepareNextBtn').click()");
  await delay(400);
  assert.ok((await evaluate("document.getElementById('shotBtn').textContent")).includes('샘플 포스터 보기'), '샘플 모드가 켜져 있어야 한다(VITE_SAMPLE_MODE=1)');
  assert.equal(await evaluate("!!document.getElementById('startBtn')"), false, '카메라 켜기 단추가 없어야 한다');
  await capture('2-사진촬영-샘플단추');
  const clicked = Date.now();
  // 대기 길이는 페이지 안에서 잰다 — 바깥에서 재면 캡처하는 동안의 지연이 섞인다.
  await evaluate("(() => { window.__clickAt = performance.now(); new MutationObserver(() => { if (document.body.dataset.step === '3' && !window.__step3At) window.__step3At = performance.now(); }).observe(document.body, { attributes: true, attributeFilter: ['data-step'] }); document.getElementById('shotBtn').click(); })()");
  const scenes = [];
  let shotWait = false, shotMid = false;
  for (let i = 0; i < 700; i++) {
    const s = await evaluate("(() => { const d = document.getElementById('spinner'); return { open: !!(d && d.open), scene: d ? d.dataset.scene : null, step: document.body.dataset.step }; })()");
    const t = Date.now() - clicked;
    if (s.open && (!scenes.length || scenes[scenes.length - 1].scene !== s.scene)) scenes.push({ t, scene: s.scene });
    if (s.open && !shotWait && t > 1500) { shotWait = true; await capture('3-로딩화면-첫장면'); }
    if (s.open && !shotMid && t > 20000) { shotMid = true; await capture('4-로딩화면-20초'); }
    if (s.step === '3' && !s.open) break;
    await delay(100);
  }
  const waitedMs = Math.round(await evaluate('window.__step3At - window.__clickAt'));
  assert.equal(await evaluate('document.body.dataset.step'), '3', '포스터 고르기로 넘어가야 한다');
  assert.ok(waitedMs >= 40_000, `로딩 화면이 40초 이상이어야 한다(실제 ${waitedMs}ms)`);
  assert.ok(scenes.length >= 5, `로딩 화면 장면이 5개 이상 지나가야 한다(실제 ${scenes.length})`);
  await delay(2600);   // «완성 !» 알림(2.2초)이 닫힌 뒤의 화면
  await capture('5-포스터선택');
  const count = await evaluate("document.querySelectorAll('.style-option').length");
  assert.equal(count, 8);
  const images = new Set();
  for (let i = 0; i < 8; i++) { await evaluate(`document.querySelectorAll('.style-option')[${i}].click()`); await delay(80); images.add(await evaluate("document.querySelector('#resultView canvas').toDataURL()")); }
  assert.equal(images.size, 8, '8개 틀 선택 시 큰 포스터도 변경');
  await evaluate("document.querySelectorAll('.style-option')[0].click()"); await delay(200);
  const cameraCalls = await evaluate('window.__cameraCalls||0');
  const cameraPermission = await evaluate("navigator.permissions ? navigator.permissions.query({name:'camera'}).then(p=>p.state).catch(()=>'unknown') : 'unknown'");
  if (RECORD) await call('Page.stopScreencast');
  const server = requests.filter((r) => /cloudfunctions\.net|run\.app|api\.openai\.com|\/generate|\/health/.test(r.url));
  const origin = new URL(url).origin;
  const external = requests.filter((r) => !r.url.startsWith(origin) && !r.url.startsWith('data:') && !r.url.startsWith('blob:'));
  const result = { url, viewport: `${W}x${H}@${SCALE}`, waitedMs, scenes, templates: images.size, cameraCalls, cameraPermission, serverRequests: server.length, externalRequests: external.map((r) => r.url), requests: requests.length };
  await fs.writeFile(path.join(out, 'network-log.json'), JSON.stringify({ ...result, all: requests.map((r) => ({ ...r, t: r.t - clicked })) }, null, 1));
  if (RECORD && frames.length) {
    const fd = path.join(out, 'frames'); await fs.mkdir(fd, { recursive: true });
    const lines = [];
    for (let i = 0; i < frames.length; i++) {
      const f = `${String(i).padStart(5, '0')}.jpg`;
      await fs.writeFile(path.join(fd, f), Buffer.from(frames[i].data, 'base64'));
      lines.push(`file '${f}'`, `duration ${(i + 1 < frames.length ? frames[i + 1].ts - frames[i].ts : 0.5).toFixed(4)}`);
    }
    lines.push(`file '${String(frames.length - 1).padStart(5, '0')}.jpg'`);
    await fs.writeFile(path.join(fd, 'list.txt'), lines.join('\n'));
  }
  console.log(JSON.stringify(result));
  assert.equal(cameraCalls, 0, '카메라를 부르면 안 된다');
  assert.equal(server.length, 0, `서버 요청이 있으면 안 된다: ${server.map((r) => r.url).join(', ')}`);
  assert.equal(cameraPermission === 'granted' || cameraPermission === 'denied', false, `카메라 권한을 물은 흔적: ${cameraPermission}`);
  await call('Browser.close');
} finally { socket?.close(); chrome.kill(); }
