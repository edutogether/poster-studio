/* 웹에서 «이 포스터로 출력하기»를 누를 때 화면 폭 · 문서 길이가 바뀌는지(2026-10-27 — 설치판 «인쇄하기» 때 화면 밀림과 같은 결함이 웹에도 있는지, 팀장 전달).

     node scripts/verify/web-print-shift.mjs <웹 빌드(dist)> <결과 폴더>

   빌드를 127.0.0.1의 작은 서버로 헤드리스 크롬(2560×1440)에 열고 «샘플 포스터 보기»로 3단계까지 간다(카메라 · AI · 서버 요청 0 —
   AI 서버 확인(/health)만 이 도구가 «정상»으로 대신 답하고 나머지 바깥 요청은 막는다). 3단계를 찍고 «이 포스터로 출력하기»를 누른 뒤 다시 찍는다
   (헤드리스 크롬은 인쇄 창을 띄우지 않고 바로 돌아온다 — 인쇄용 그림이 문서에 붙은 뒤의 화면이다).
   잰다: 누르기 전후 문서 폭(clientWidth) · 문서 길이(scrollHeight)가 같아야 한다. 다르면(세로 스크롤바가 생겨 화면이 밀림) 종료코드 1.
   10/27 실측(웹 빌드 = 라이브와 같은 코드): 폭 2560 → 2545 · 길이 1440 → 3247, 인쇄용 그림(#printArea 1200×1800)이 화면 아래에 그려져 있었다.
   결과: <결과 폴더>/웹-3단계-인쇄전.png · 웹-3단계-인쇄후.png(원본 해상도) · report.json. 설치판 쪽은 desktop-print-shift.mjs. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { spawn } from 'node:child_process';

const [dist, out] = process.argv.slice(2);
if (!dist || !out || !fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('사용: web-print-shift.mjs <웹 빌드(dist)> <결과 폴더>');
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });
const root = path.resolve(dist);
const TYPE = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPE[path.extname(f)] ?? 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'web-print-'));
const port = 9300 + Math.floor(Math.random() * 400);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--mute-audio', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => chrome.kill());
let target;
for (let i = 0; i < 60 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* 아직 */ } }
const ws = new globalThis.WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const wait = new Map(); const handlers = [];
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } else if (m.method) handlers.forEach((h) => h(m)); });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
const waitFor = async (expr, ms = 30000) => { for (const end = Date.now() + ms; Date.now() < end; await sleep(200)) if (await ev(expr)) return true; return false; };
const shot = async (file) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(out, file), Buffer.from(r.result.data, 'base64')); };
handlers.push(async (m) => {
  if (m.method !== 'Fetch.requestPaused') return;
  if (/\/health$/.test(m.params.request.url)) await send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: 'content-type', value: 'application/json' }, { name: 'access-control-allow-origin', value: '*' }], body: Buffer.from('{"ok":true,"openaiReachable":true}').toString('base64') });
  else await send('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'BlockedByClient' });
});
await send('Page.enable');
await send('Fetch.enable', { patterns: [{ urlPattern: 'https://*' }] });
await send('Emulation.setDeviceMetricsOverride', { width: 2560, height: 1440, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: base + '/' });
await waitFor(`document.body.classList.contains('app-ready') && !document.getElementById('splash')`);
await ev(`document.getElementById('prepareNextBtn').click()`);
await waitFor(`document.body.dataset.step === '2'`);
await sleep(800);
await ev(`document.getElementById('shotBtn').click()`);   // «샘플 포스터 보기»(카메라를 켜기 전)
const reached = await waitFor(`document.body.dataset.step === '3' && document.querySelectorAll('#resultView .style-option.thumb').length === 8`, 60000);
await sleep(1500);
const measure = () => ev(`({ clientW: document.documentElement.clientWidth, innerW: innerWidth, scrollH: document.documentElement.scrollHeight, innerH: innerHeight,
  printArea: (() => { const a = document.getElementById('printArea'); if (!a) return null; const r = a.getBoundingClientRect(); return { display: getComputedStyle(a).display, top: Math.round(r.top + scrollY), h: Math.round(r.height) }; })() })`);
const before = await measure();
await shot('웹-3단계-인쇄전.png');
await ev(`document.getElementById('printBtn').click()`);
await sleep(2500);
const after = await measure();
await shot('웹-3단계-인쇄후.png');
const changed = before.clientW !== after.clientW || before.scrollH !== after.scrollH;
const report = { dist: root, reachedStep3: reached, before, after, changed };
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
console.log(!reached ? '걸림  3단계까지 가지 못함' : changed ? `걸림  누른 뒤 화면이 바뀜(폭 ${before.clientW} → ${after.clientW} · 길이 ${before.scrollH} → ${after.scrollH})` : '통과  누른 뒤에도 폭 · 길이 그대로');
ws.close(); chrome.kill(); server.close();
process.exit(reached && !changed ? 0 : 1);
