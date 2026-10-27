/* 설치판 2단계 오른쪽 칸(«오늘 촬영할 영화») 배치를 창 크기 전 구간에서 잰다(2026-10-27 Bumm님 — 2560 «포스터 · 티켓이 위로 몰림»,
   이어서 «1366×768 · 1536×864는 포스터 왼쪽 · 세로형 티켓 오른쪽, 3840×2160은 포스터 · 세로형 티켓 위아래», 팀장 전달).

     node scripts/verify/desktop-layout-sweep.mjs <설치판 화면 빌드(desktop/web)> <웹 빌드(dist)> <결과 폴더> [--prev <직전 설치판 화면 빌드>] [--sizes 1366x768,…] [--shots 1366x768,…]

   빌드들을 127.0.0.1의 작은 서버로 헤드리스 크롬에 열고 2단계로 간 뒤, 창 크기만 바꿔 가며 칸 안 요소들의 자리를 잰다.
   바깥 요청은 막고 AI 서버 확인(/health)만 «정상»으로 대신 답한다(서버 요청 · 생성 0건). 구간과 잴 것(하나라도 걸리면 종료코드 1):
     좁은 창(폭 1100 미만)             설치판 = 웹 — 요소 자리가 0.5px 안에서 같다(웹 배치 그대로)
     가운데(폭 1100 이상 · 높이 870~1759) · 아주 낮은 창(높이 680 미만)  --prev를 주면 설치판 = 직전 설치판(이번에 바꾸지 않은 구간) · 늘 겹침 · 화면 밖 · 가로 넘침 없음 ·
                                       보이는 포스터가 웹보다 작아지지 않음(object-fit: contain이라 상자가 아니라 보이는 크기로 잰다)
     낮은 창(폭 1100 이상 · 높이 680~869)  포스터 왼쪽 · 세로 티켓 오른쪽(같은 높이 · 둘 다 2:3) · 겹침 · 화면 밖(웹보다 더 내려가지 않음) · 가로 넘침 없음 ·
                                       세로 티켓 모양(정보 칸 · 절취선 아래 칸 보임, 가로 티켓 오른쪽 칸 숨김) · 티켓 글자 잘림 없음 · 포스터 칸 2:3
     높은 창(폭 1100 이상 · 높이 1760 이상) 포스터 위 · 세로 티켓 아래(칸 폭을 채움) · 나머지는 낮은 창과 같다
   크기별 간격(설치판 표시 ↔ 제목, 안내 항목 사이, 안내 ↔ «오늘 촬영할 영화», 티켓 ↔ 단추)은 report.json에 적는다.
   대표 크기(--shots)는 «전»(직전 설치판, 없으면 웹)과 «후»(설치판)를 따로 찍는다: <결과 폴더>/전-<크기>.png · 후-<크기>.png(원본 해상도, 1배). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const [deskDir, webDir, out] = args;
const prevDir = opt('--prev');
const builds = [deskDir, webDir, ...(prevDir ? [prevDir] : [])];
if (!deskDir || !webDir || !out || out.startsWith('--') || !builds.every((d) => fs.existsSync(path.join(d, 'index.html')))) {
  console.error('사용: desktop-layout-sweep.mjs <설치판 화면 빌드(desktop/web)> <웹 빌드(dist)> <결과 폴더> [--prev <직전 설치판 화면 빌드>] [--sizes WxH,…] [--shots WxH,…]');
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

const parseSizes = (s) => s.split(',').map((x) => x.split('x').map(Number));
// 기본 크기 목록 — 구간 경계 바로 안팎 · 흔한 노트북 배율 · 태블릿 폭 · 대표 크기 + 촘촘한 격자(폭 1100~3840 · 높이 640~2160)
const NAMED = [[760, 1000], [1024, 768], [1099, 900], [1099, 1440], [1100, 820], [1100, 821], [1100, 869], [1100, 870], [1100, 959], [1280, 679], [1280, 680], [1280, 720], [1280, 800], [1280, 1024],
  [1366, 768], [1440, 810], [1440, 900], [1536, 731], [1536, 864], [1600, 900], [1680, 1050], [1920, 869], [1920, 870], [1920, 879], [1920, 959], [1920, 1080], [1920, 1200], [2048, 1152],
  [2560, 1080], [2560, 1369], [2560, 1440], [2560, 1600], [2560, 1700], [2560, 1759], [2560, 1760], [3440, 1440], [3840, 1600], [3840, 2160],
  // 그 화면에서 앱을 최대화했을 때의 실제 화면 크기(창 제목 줄 · 작업 표시줄 71px을 뺀 것 — 2560×1440에서 2560×1369를 잰 것과 같은 차이)
  [1280, 649], [1366, 697], [1440, 829], [1536, 793], [1600, 829], [1920, 1009], [3840, 2089]];
const GRID = [];
for (let w = 1100; w <= 3840; w += 137) for (let h = 640; h <= 2160; h += 67) GRID.push([w, h]);
const SIZES = opt('--sizes') ? parseSizes(opt('--sizes')) : [...new Map([...NAMED, ...GRID].map((size) => [size.join('x'), size])).values()];
const SHOTS = opt('--shots') ? opt('--shots').split(',') : ['1366x768', '1536x864', '2560x1369', '3840x2160'];
const band = (w, h) => (w < 1100 ? 'narrow' : h < 680 ? 'short' : h <= 869 ? 'low' : h >= 1760 ? 'tall' : 'mid');
const BAND_NAME = { narrow: '좁은 창(폭 1100 미만)', short: '아주 낮은 창(높이 680 미만)', mid: '가운데(높이 870~1759)', low: '낮은 창(높이 680~869)', tall: '높은 창(높이 1760 이상)' };

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'layout-sweep-'));
const port = 9700 + Math.floor(Math.random() * 200);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--mute-audio', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
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

const SEL = { badge: '.desktop-badge', pageHeading: '#cameraWorkspace .page-heading', tips: '.camera-instructions', filmHeading: '.camera-film-heading', card: '.camera-film-card', scene: '.camera-film-scene',
  poster: '.camera-film-poster img', ticket: '.camera-ticket', ticketInfo: '.camera-ticket .ticket-info', ticketStub: '.camera-ticket .ticket-stub', ticketAdmit: '.camera-ticket .ticket-admit',
  actions: '#cameraWorkspace .camera-actions', guide: '.camera-guide', cameraBox: '#cameraView .cameraBox' };
const COMPARE = ['pageHeading', 'tips', 'filmHeading', 'card', 'scene', 'poster', 'ticket', 'actions', 'guide', 'cameraBox'];
const MEASURE = `(() => { const r = {}; for (const [k, s] of Object.entries(${JSON.stringify(SEL)})) { const e = document.querySelector(s); if (!e) { r[k] = null; continue; } const b = e.getBoundingClientRect();
    r[k] = { x: b.x, y: b.y, w: b.width, h: b.height, b: b.bottom, r: b.right, shown: getComputedStyle(e).display !== 'none' && b.width > 0 && b.height > 0 }; }
  const img = document.querySelector(${JSON.stringify(SEL.poster)}); r.natural = img ? img.naturalWidth / img.naturalHeight : null;
  const tips = [...document.querySelectorAll('.camera-instructions li')].map((li) => li.getBoundingClientRect()); r.tipGap = tips.length > 1 ? Math.min(...tips.slice(1).map((b, i) => b.top - tips[i].bottom)) : null;
  // 티켓 안 글자가 칸 밖으로 잘리지 않는지(줄임표 «…»로 줄이는 이름 줄은 디자인이라 뺀다)
  r.clipped = [...document.querySelectorAll('.camera-ticket strong, .camera-ticket .ticket-info dd, .camera-ticket .ticket-info dt, .camera-ticket .ticket-stub small, .camera-ticket .ticket-label')]
    .filter((e) => e.getBoundingClientRect().width > 0 && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 2)).map((e) => e.textContent.trim().slice(0, 20));
  const d = document.documentElement; r.doc = { sw: d.scrollWidth, cw: d.clientWidth, sh: d.scrollHeight, ih: innerHeight }; return r; })()`;
// 탭이 여럿이라 뒤로 간 탭은 그리기(requestAnimationFrame)가 멈춘다 — 잴 탭을 앞으로 가져오고, 프레임 기다림에는 상한을 둔다(10/27 실측: 상한 없이 멈춤)
const FRAMES = `new Promise((r) => { const t = setTimeout(r, 400); requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(t); r(); })); })`;
async function measure(page, w, h) {
  await page.send('Page.bringToFront');
  await page.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await page.ev(FRAMES);
  await sleep(120);
  return page.ev(MEASURE);
}

for (let i = 0; i < 60; i++) { await sleep(200); try { await fetch(`http://127.0.0.1:${port}/json/version`); break; } catch { /* 아직 */ } }
const servers = await Promise.all(builds.map(serve));
const pages = [];
for (const s of servers) pages.push(await openPage(s.base));
const [deskPage, webPage, prevPage] = pages;
if (!(await deskPage.ev(`document.body.hasAttribute('data-desktop')`)) || (await webPage.ev(`document.body.hasAttribute('data-desktop')`))) throw new Error('빌드가 뒤바뀜(설치판 표시 확인 실패)');

const near = (a, b) => Math.abs(a - b) <= 0.5;
const sameRect = (a, b) => (a === null && b === null) || (a && b && near(a.x, b.x) && near(a.y, b.y) && near(a.w, b.w) && near(a.h, b.h));
// 포스터 그림은 기본 object-fit: contain — 상자가 길어도 폭에 막히면 보이는 포스터는 그만큼만 크다. 견주는 것은 «보이는 포스터 높이»다.
const seen = (m) => (m.poster && m.natural ? Math.min(m.poster.h, m.poster.w / m.natural) : 0);
const gapsOf = (m) => (m.pageHeading && m.tips && m.filmHeading ? { 표시줄_제목: m.badge ? Math.round(m.pageHeading.y - m.badge.b) : null, 안내항목사이: m.tipGap === null ? null : Math.round(m.tipGap),
  안내_영화제목: Math.round(m.filmHeading.y - m.tips.b), 티켓_단추: m.actions && m.ticket ? Math.round(m.actions.y - Math.max(m.ticket.b, m.scene.b)) : null } : null);
const report = { desktopBuild: path.resolve(deskDir), webBuild: path.resolve(webDir), prevBuild: prevDir ? path.resolve(prevDir) : null, sizes: [] };

for (const [w, h] of SIZES) {
  const kind = band(w, h);
  const d = await measure(deskPage, w, h), v = await measure(webPage, w, h), p = prevPage ? await measure(prevPage, w, h) : null;
  const bad = [];
  const order = () => {
    for (const k of ['pageHeading', 'tips', 'filmHeading', 'scene', 'poster', 'ticket', 'actions']) if (!d[k]?.shown) bad.push(`${k} 안 보임`);
    if (bad.length) return;
    if (d.tips.y < d.pageHeading.b - 0.5) bad.push('제목과 안내가 겹침');
    if (d.filmHeading.y < d.tips.b - 0.5) bad.push('안내와 «오늘 촬영할 영화»가 겹침');
    if (d.scene.y < d.filmHeading.b - 0.5) bad.push('«오늘 촬영할 영화»와 포스터가 겹침');
    if (d.actions.y < Math.max(d.scene.b, d.ticket.b) - 0.5) bad.push('포스터 · 티켓과 단추가 겹침');
    if (d.actions.b > Math.max(d.doc.ih, v.actions.b) + 0.5) bad.push(`단추가 화면 밖(${Math.round(d.actions.b)} > ${d.doc.ih})`);
    if (d.doc.sw > d.doc.cw) bad.push(`가로 넘침(${d.doc.sw} > ${d.doc.cw})`);
  };
  if (kind === 'narrow') {
    const diff = COMPARE.filter((k) => !sameRect(d[k], v[k]));
    if (diff.length) bad.push(`웹과 다름: ${diff.join(', ')}`);
  } else if (kind === 'mid' || kind === 'short') {
    if (p) { const diff = COMPARE.filter((k) => !sameRect(d[k], p[k])); if (diff.length) bad.push(`직전 설치판과 다름: ${diff.join(', ')}`); }
    order();
    if (!bad.length && d.ticket.y < d.scene.b - 0.5) bad.push('포스터와 티켓이 겹침');
    if (!bad.length && seen(d) < seen(v) - 0.5) bad.push(`보이는 포스터가 웹보다 작음(${Math.round(seen(d))} < ${Math.round(seen(v))})`);
  } else {
    order();
    if (!bad.length) {
      if (!d.ticketInfo?.shown || !d.ticketStub?.shown || d.ticketAdmit?.shown) bad.push('세로 티켓 모양이 아님(정보 칸 · 절취선 아래 칸 · 가로 티켓 오른쪽 칸)');
      if (kind === 'low') {
        if (d.ticket.x < d.scene.r - 0.5) bad.push('포스터와 티켓이 겹침(가로)');
        if (Math.abs(d.ticket.h - d.scene.h) > 1) bad.push(`포스터 · 티켓 높이가 다름(${Math.round(d.scene.h)} · ${Math.round(d.ticket.h)})`);
        if (Math.abs(d.scene.w / d.scene.h - 2 / 3) > 0.02) bad.push(`포스터 칸이 2:3이 아님(${(d.scene.w / d.scene.h).toFixed(3)})`);
        if (Math.abs(d.ticket.w / d.ticket.h - 2 / 3) > 0.02) bad.push(`티켓이 2:3이 아님(${(d.ticket.w / d.ticket.h).toFixed(3)})`);
      } else {
        if (d.ticket.y < d.scene.b - 0.5) bad.push('포스터와 티켓이 겹침(세로)');
        if (Math.abs(d.ticket.w - d.card.w) > 1) bad.push('티켓이 칸 폭을 채우지 않음');
      }
      if (d.clipped.length) bad.push(`티켓 글자 잘림: ${d.clipped.join(' · ')}`);
    }
  }
  const before = p ?? v;
  report.sizes.push({ size: `${w}x${h}`, band: kind, poster: [Math.round(seen(before)), Math.round(seen(d))], ticket: d.ticket ? [Math.round(d.ticket.w), Math.round(d.ticket.h)] : null, gaps: gapsOf(d), gapsBefore: gapsOf(before), bad });
}

// 대표 크기 전/후 캡처(따로 파일). «전» = 직전 설치판(없으면 웹)
for (const key of SHOTS) {
  const [w, h] = key.split('x').map(Number);
  for (const [page, name] of [[prevPage ?? webPage, `전-${key}.png`], [deskPage, `후-${key}.png`]]) {
    await measure(page, w, h);
    await page.ev(`document.getAnimations().forEach((a) => { if (a instanceof CSSTransition) a.finish(); })`);
    await page.ev(FRAMES);
    const shot = await page.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(out, name), Buffer.from(shot.result.data, 'base64'));
  }
}

const checks = Object.keys(BAND_NAME).map((k) => { const rows = report.sizes.filter((r) => r.band === k); return { name: `${BAND_NAME[k]} ${rows.length}개 크기`, ok: rows.every((r) => !r.bad.length), rows: rows.length }; }).filter((c) => c.rows);
report.checks = checks;
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
for (const c of checks) console.log(`${c.ok ? '통과' : '걸림'}  ${c.name}`);
for (const r of report.sizes.filter((x) => x.bad.length).slice(0, 30)) console.log(`  - ${r.size}(${r.band}): ${r.bad.join(', ')}`);
for (const r of report.sizes.filter((x) => opt('--sizes') || NAMED.some(([w, h]) => `${w}x${h}` === x.size))) {
  console.log(`  ${r.size} ${r.band}: 포스터 ${r.poster[0]} → ${r.poster[1]} · 티켓 ${r.ticket?.join('×')} · 간격 ${JSON.stringify(r.gaps)} (전 ${JSON.stringify(r.gapsBefore)})`);
}
for (const pg of pages) pg.close();
for (const s of servers) s.server.close();
chrome.kill();
const failed = checks.filter((c) => !c.ok).length;
console.log(failed ? `걸림 ${failed}건 / ${checks.length}` : `모두 통과 ${checks.length}건 · 크기 ${report.sizes.length}개`);
process.exit(failed ? 1 : 0);
