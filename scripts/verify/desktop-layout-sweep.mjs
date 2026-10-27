/* 설치판 2단계 오른쪽 칸(«오늘 촬영할 영화») 배치를 창 크기 전 구간에서 잰다(2026-10-27 Bumm님 «2560에서 포스터 · 티켓이 위로 몰림 →
   기존 디자인을 지키면서 화면 높이에 자연스럽게 · 다른 해상도와 반응형이 깨지지 않았는지 전 구간 확인», 팀장 전달).

     node scripts/verify/desktop-layout-sweep.mjs <설치판 화면 빌드(desktop/web)> <웹 빌드(dist)> <결과 폴더>

   두 빌드를 127.0.0.1의 작은 서버로 헤드리스 크롬에 열고 2단계로 간 뒤, 창 크기만 바꿔 가며 칸 안 요소들의 자리를 잰다.
   바깥 요청은 막고 AI 서버 확인(/health)만 «정상»으로 대신 답한다(서버 요청 · 생성 0건). 잰다(하나라도 걸리면 종료코드 1):
     ① 설치판 규칙이 걸리지 않는 크기(폭 1100 미만 또는 높이 821 미만): 설치판 = 웹 — 요소 자리가 0.5px 안에서 같다(웹 배치 그대로)
     ② 규칙이 걸리는 크기(폭 1100 이상 · 높이 821 이상, 촘촘한 격자):
        - 위에서 아래로 «안내 → 제목 → 포스터 → 티켓 → 단추»가 겹치지 않는다
        - 단추 줄이 화면 안에 있고 문서가 웹보다 길어지지 않는다 · 가로 넘침 없음
        - 포스터 칸 비율 = 그림 비율(빈 여백 없음) · 보이는 포스터가 웹보다 작아지지 않는다(object-fit: contain이라 상자가 아니라 보이는 크기로 잰다)
     크기별 위 · 아래 남는 간격(안내 ↔ 제목, 티켓 ↔ 단추)은 report.json에 적는다.
   대표 크기는 웹(= 고치기 전 설치판)과 설치판을 따로 찍는다: <결과 폴더>/전-웹-<크기>.png · 후-설치판-<크기>.png(원본 해상도, 1배). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { spawn } from 'node:child_process';

const [deskDir, webDir, out] = process.argv.slice(2);
if (!deskDir || !webDir || !out || ![deskDir, webDir].every((d) => fs.existsSync(path.join(d, 'index.html')))) {
  console.error('사용: desktop-layout-sweep.mjs <설치판 화면 빌드(desktop/web)> <웹 빌드(dist)> <결과 폴더>');
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });

const TYPE = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4', '.svg': 'image/svg+xml' };
async function serve(dir) {
  const root = path.resolve(dir);
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(root, p);
    if (!f.startsWith(root + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPE[path.extname(f)] ?? 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

// 크기 목록 — ① 규칙 밖(웹과 같아야 함): 경계 바로 밖 · 흔한 노트북 배율 · 태블릿 폭
const OUTSIDE = [[760, 1000], [1024, 768], [1099, 900], [1099, 1440], [1100, 820], [1280, 720], [1280, 800], [1366, 768], [1440, 810], [1536, 731], [1600, 820], [1920, 820], [2560, 820]];
// ② 규칙 안 — 대표 크기 + 촘촘한 격자(폭 1100~3840 · 높이 821~2160)
const NAMED = [[1100, 821], [1280, 1024], [1440, 900], [1536, 864], [1600, 900], [1680, 1050], [1920, 1080], [1920, 1200], [2048, 1152], [2560, 1080], [2560, 1369], [2560, 1440], [2560, 1600], [3440, 1440], [3840, 2160]];
const GRID = [];
for (let w = 1100; w <= 3840; w += 137) for (let h = 821; h <= 2160; h += 67) GRID.push([w, h]);
const SHOTS = ['1366x768', '1536x864', '1920x1080', '2560x1369', '2560x1440', '3840x2160'];

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'layout-sweep-'));
const port = 9700 + Math.floor(Math.random() * 200);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--mute-audio', '--hide-scrollbars=false', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => chrome.kill());

async function openPage(base) {
  const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new globalThis.WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const wait = new Map();
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); return; }
    if (m.method === 'Fetch.requestPaused') {
      const { requestId, request } = m.params;
      if (request.url.startsWith(base)) send('Fetch.continueRequest', { requestId });
      else if (/\/health$/.test(request.url)) send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'content-type', value: 'application/json' }, { name: 'access-control-allow-origin', value: '*' }], body: Buffer.from(JSON.stringify({ ok: true, openaiReachable: true })).toString('base64') });
      else send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
    }
  });
  const ev = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const waitFor = async (expr, ms = 20000) => { for (const end = Date.now() + ms; Date.now() < end; await sleep(150)) if (await ev(expr)) return true; return false; };
  await send('Page.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await send('Emulation.setDeviceMetricsOverride', { width: 2560, height: 1440, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: base + '/' });
  if (!await waitFor(`document.body.classList.contains('app-ready') && !document.getElementById('splash')`)) throw new Error(`앱이 뜨지 않음: ${base}`);
  await ev(`document.fonts.ready`);
  await ev(`document.getElementById('prepareNextBtn').click()`);
  if (!await waitFor(`document.body.dataset.step === '2'`)) throw new Error(`2단계로 가지 않음: ${base}`);
  await ev(`Promise.all([...document.images].map((i) => i.decode().catch(() => {})))`);
  return { send, ev, close: () => ws.close() };
}

const SEL = { tips: '.camera-instructions', filmHeading: '.camera-film-heading', card: '.camera-film-card', scene: '.camera-film-scene', poster: '.camera-film-poster img', ticket: '.camera-ticket', actions: '#cameraWorkspace .camera-actions', guide: '.camera-guide', pageHeading: '#cameraWorkspace .page-heading', cameraBox: '#cameraView .cameraBox' };
const MEASURE = `(() => { const r = {}; for (const [k, s] of Object.entries(${JSON.stringify(SEL)})) { const e = document.querySelector(s); if (!e) { r[k] = null; continue; } const b = e.getBoundingClientRect(); r[k] = { x: b.x, y: b.y, w: b.width, h: b.height, b: b.bottom }; }
  const img = document.querySelector(${JSON.stringify(SEL.poster)}); r.natural = img ? img.naturalWidth / img.naturalHeight : null;
  const d = document.documentElement; r.doc = { sw: d.scrollWidth, cw: d.clientWidth, sh: d.scrollHeight, ih: innerHeight }; r.desktop = document.body.hasAttribute('data-desktop'); return r; })()`;

// 탭이 둘이라 뒤로 간 탭은 그리기(requestAnimationFrame)가 멈춘다 — 잴 탭을 앞으로 가져오고, 프레임 기다림에는 상한을 둔다(10/27 실측: 상한 없이 멈춤)
const FRAMES = `new Promise((r) => { const t = setTimeout(r, 400); requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(t); r(); })); })`;
async function measure(page, w, h) {
  await page.send('Page.bringToFront');
  await page.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await page.ev(FRAMES);
  await sleep(120);
  return page.ev(MEASURE);
}

for (let i = 0; i < 60; i++) { await sleep(200); try { await fetch(`http://127.0.0.1:${port}/json/version`); break; } catch { /* 아직 */ } }
const deskSrv = await serve(deskDir), webSrv = await serve(webDir);
const desk = await openPage(deskSrv.base), web = await openPage(webSrv.base);
const report = { desktopBuild: path.resolve(deskDir), webBuild: path.resolve(webDir), outside: [], inside: [], checks: [] };
const fails = [];
const near = (a, b) => Math.abs(a - b) <= 0.5;
// 포스터 그림은 object-fit: contain — 상자가 길어도 폭에 막히면 보이는 포스터는 그만큼만 크다(10/27 실측: 폭 1100 창에서 웹 상자 520 · 보이는 포스터 453).
// 그래서 견주는 것은 상자 높이가 아니라 «보이는 포스터 높이» = min(상자 높이, 상자 폭 ÷ 그림 비율)이다.
const seen = (m) => (m.poster && m.natural ? Math.min(m.poster.h, m.poster.w / m.natural) : 0);
const sameRect = (a, b) => (a === null && b === null) || (a && b && near(a.x, b.x) && near(a.y, b.y) && near(a.w, b.w) && near(a.h, b.h));

// ① 규칙 밖 — 설치판 = 웹
if (!(await desk.ev(`document.body.hasAttribute('data-desktop')`)) || (await web.ev(`document.body.hasAttribute('data-desktop')`))) throw new Error('빌드가 뒤바뀜(설치판 표시 확인 실패)');
for (const [w, h] of OUTSIDE) {
  const d = await measure(desk, w, h), v = await measure(web, w, h);
  const diff = Object.keys(SEL).filter((k) => !sameRect(d[k], v[k]));
  report.outside.push({ size: `${w}x${h}`, diff });
  if (diff.length) fails.push(`${w}x${h} 규칙 밖인데 웹과 다름: ${diff.join(', ')}`);
}

// ② 규칙 안 — 순서 · 화면 안 · 포스터 비율 · 웹보다 작아지지 않음
const INSIDE = [...new Map([...NAMED, ...GRID].map((size) => [size.join('x'), size])).values()];   // 겹치는 크기는 한 번만
for (const [w, h] of INSIDE) {
  const d = await measure(desk, w, h), v = await measure(web, w, h);
  const bad = [];
  for (const k of ['tips', 'filmHeading', 'scene', 'poster', 'ticket', 'actions']) if (!d[k] || d[k].h <= 0) bad.push(`${k} 없음`);
  if (!bad.length) {
    if (d.filmHeading.y < d.tips.b - 0.5) bad.push('안내와 제목이 겹침');
    if (d.scene.y < d.filmHeading.b - 0.5) bad.push('제목과 포스터가 겹침');
    if (d.ticket.y < d.scene.b - 0.5) bad.push('포스터와 티켓이 겹침');
    if (d.actions.y < d.ticket.b - 0.5) bad.push('티켓과 단추가 겹침');
    if (d.actions.b > Math.max(d.doc.ih, v.actions.b) + 0.5) bad.push(`단추가 화면 밖(${Math.round(d.actions.b)} > ${d.doc.ih})`);
    if (d.doc.sh > v.doc.sh + 0.5) bad.push(`문서가 웹보다 길어짐(${d.doc.sh} > ${v.doc.sh})`);
    if (d.doc.sw > d.doc.cw) bad.push(`가로 넘침(${d.doc.sw} > ${d.doc.cw})`);
    if (d.natural && Math.abs(d.poster.w / d.poster.h - d.natural) > 0.01) bad.push(`포스터 칸 비율 ≠ 그림 비율(${(d.poster.w / d.poster.h).toFixed(3)} ≠ ${d.natural.toFixed(3)} — 빈 여백)`);
    if (seen(d) < seen(v) - 0.5) bad.push(`보이는 포스터가 웹보다 작음(${Math.round(seen(d))} < ${Math.round(seen(v))})`);
  }
  const row = { size: `${w}x${h}`, posterH: [Math.round(seen(v)), Math.round(seen(d))], gapAbove: Math.round(d.filmHeading.y - d.tips.b), gapBelow: Math.round(d.actions.y - d.ticket.b), webGapBelow: Math.round(v.actions.y - v.ticket.b), bad };
  report.inside.push(row);
  if (bad.length) fails.push(`${w}x${h}: ${bad.join(', ')}`);
}

// 대표 크기 전/후 캡처(따로 파일)
for (const key of SHOTS) {
  const [w, h] = key.split('x').map(Number);
  for (const [page, name] of [[web, `전-웹-${key}.png`], [desk, `후-설치판-${key}.png`]]) {
    await measure(page, w, h);
    await page.ev(`document.getAnimations().forEach((a) => { if (a instanceof CSSTransition) a.finish(); })`);
    await page.ev(FRAMES);
    const shot = await page.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(out, name), Buffer.from(shot.result.data, 'base64'));
  }
}

report.checks = [
  { name: `규칙 밖 ${OUTSIDE.length}개 크기: 설치판 = 웹(요소 자리 0.5px 안)`, ok: report.outside.every((r) => !r.diff.length) },
  { name: `규칙 안 ${INSIDE.length}개 크기: 겹침 · 화면 밖 · 가로 넘침 · 포스터 빈 여백 · 보이는 포스터가 웹보다 작아짐 없음`, ok: report.inside.every((r) => !r.bad.length) },
];
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
for (const c of report.checks) console.log(`${c.ok ? '통과' : '걸림'}  ${c.name}`);
for (const f of fails.slice(0, 30)) console.log(`  - ${f}`);
for (const r of report.inside.filter((x) => NAMED.some(([w, h]) => `${w}x${h}` === x.size))) console.log(`  ${r.size}: 보이는 포스터 높이 웹 ${r.posterH[0]} → 설치판 ${r.posterH[1]} · 안내↔제목 ${r.gapAbove} · 티켓↔단추 ${r.gapBelow}(웹 ${r.webGapBelow})`);
desk.close(); web.close(); deskSrv.server.close(); webSrv.server.close(); chrome.kill();
const failed = report.checks.filter((c) => !c.ok).length;
console.log(failed ? `걸림 ${failed}건 / ${report.checks.length}` : `모두 통과 ${report.checks.length}건`);
process.exit(failed ? 1 : 0);
