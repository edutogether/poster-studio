/* 2단계 화면 배치를 빌드 두 개 사이에서 견주고, «나답게 …» 제목 윗선이 왼쪽 카메라 사진 윗선과 맞는지 잰다(2026-10-31 Bumm님 —
   1536×864 · 1536×793에서 제목이 사진보다 약 20px 위에 떠 있다, 다른 크기는 그대로. 팀장 전달).

     node scripts/verify/step2-geometry.mjs <결과 폴더> --build 전=<빌드> --build 후=<빌드> [--sizes WxH,… | sweep]
          [--changed WxH,…] [--align WxH,…] [--shots WxH,…] [--same-as <빌드>]

   빌드들을 127.0.0.1의 작은 서버로 헤드리스 크롬에 열고 2단계로 간 뒤 창 크기만 바꿔 가며 화면 요소의 자리를 잰다.
   바깥 요청은 막고 AI 서버 확인(/health)만 «정상»으로 대신 답한다(서버 요청 · 생성 0건). 하나라도 걸리면 종료코드 1:
     --changed에 없는 크기   «전»과 «후»의 요소 자리 · 크기가 모두 0.5px 안에서 같다(회귀 없음)
     --changed의 크기        «전»과 «후»가 실제로 다르다(고친 것이 먹었는지 — 같으면 빈 고침)
     --align의 크기(«후»)    제목 글자 윗선(화소로 찾은 첫 어두운 줄)이 카메라 사진 윗선과 1px 안 · 제목 ↔ 안내 ↔ «오늘 촬영할 영화» ↔ 포스터 · 티켓 ↔ 단추가
                             겹치지 않음 · 단추가 화면 안 · 가로 넘침 없음 · 티켓 글자 잘림 없음 · 보이는 포스터가 «전»보다 작아지지 않음
     --same-as <빌드>        그 빌드와 «후»의 2단계 요소 자리가 모든 크기에서 0.5px 안에서 같다(설치판 = 웹 확인용 — 설치판에만 있는 표시는 뺀다)
   --shots의 크기는 빌드마다 <결과 폴더>/<이름>-<크기>.png로 찍는다(원본 해상도, 1배). 잰 값은 <결과 폴더>/geometry.json.
   빌드 자리에 https 주소(라이브)를 주면 그 주소를 그대로 연다 — 배포한 화면이 빌드와 같은지 볼 때(바깥 요청 차단 · /health 대신 답하기는 같다). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { spawn, spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const out = args[0];
const all = (name) => args.flatMap((a, i) => (a === name ? [args[i + 1]] : []));
const opt = (name) => all(name)[0];
const parseSizes = (s) => (s ? s.split(',').filter(Boolean).map((x) => x.split('x').map(Number)) : []);
const builds = all('--build').map((b) => { const i = b.indexOf('='); return { name: b.slice(0, i), dir: b.slice(i + 1) }; });
const sameAs = opt('--same-as');
const usable = (d) => /^https:\/\//.test(d) || fs.existsSync(path.join(d, 'index.html'));
if (!out || out.startsWith('--') || builds.length !== 2 || !builds.every((b) => b.name && usable(b.dir)) || (sameAs && !usable(sameAs))) {
  console.error('사용: step2-geometry.mjs <결과 폴더> --build 전=<빌드> --build 후=<빌드> [--sizes WxH,…|sweep] [--changed WxH,…] [--align WxH,…] [--shots WxH,…] [--same-as <빌드>]');
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });

// desktop-layout-sweep.mjs와 같은 크기 목록(구간 경계 안팎 · 흔한 노트북 · 최대화한 앱 · 촘촘한 격자) + 휴대폰 · 태블릿 폭
const NAMED = [[360, 780], [390, 844], [430, 932], [768, 1024], [820, 1180], [1024, 1366], [1366, 1024], [760, 1000], [1024, 768], [1099, 900], [1099, 1440], [1100, 820], [1100, 821], [1100, 869], [1100, 870], [1100, 959], [1280, 679],
  [1280, 680], [1280, 720], [1280, 800], [1280, 1024], [1366, 768], [1440, 810], [1440, 900], [1536, 731], [1536, 864], [1600, 900], [1680, 1050], [1920, 869], [1920, 870], [1920, 879], [1920, 959],
  [1920, 1080], [1920, 1200], [2048, 1152], [2560, 1080], [2560, 1369], [2560, 1440], [2560, 1600], [2560, 1700], [2560, 1759], [2560, 1760], [3440, 1440], [3840, 1600], [3840, 2160],
  [1280, 649], [1366, 697], [1440, 829], [1536, 793], [1600, 829], [1920, 1009], [3840, 2089], [1536, 760], [1536, 768], [1536, 780], [1536, 800], [1536, 820], [1536, 869], [1536, 870]];
const GRID = [];
for (let w = 1100; w <= 3840; w += 137) for (let h = 640; h <= 2160; h += 67) GRID.push([w, h]);
const sizeArg = opt('--sizes');
const SIZES = sizeArg && sizeArg !== 'sweep' ? parseSizes(sizeArg) : [...new Map([...NAMED, ...GRID].map((s) => [s.join('x'), s])).values()];
const CHANGED = new Set((opt('--changed') ?? '').split(',').filter(Boolean));
const ALIGN = new Set((opt('--align') ?? '').split(',').filter(Boolean));
const SHOTS = new Set((opt('--shots') ?? '').split(',').filter(Boolean));
for (const s of [...CHANGED, ...ALIGN, ...SHOTS]) if (!SIZES.some(([w, h]) => `${w}x${h}` === s)) SIZES.push(s.split('x').map(Number));
if (!SIZES.length) { console.error('잴 크기가 없다'); process.exit(2); }

const TYPE = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4', '.svg': 'image/svg+xml' };
async function serve(dir) {
  const root = path.resolve(dir);
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(root, p);
    if (!f.startsWith(root + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    const type = TYPE[path.extname(f)] ?? 'application/octet-stream', size = fs.statSync(f).size;
    // 영상은 부분 받기(Range)가 되어야 재생된다 — 라이브 · 설치판 앱처럼 «촬영 구도 예시» 영상이 돌게(10/31, 안 되면 정지 그림에 머문다)
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2])), end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start > end || start >= size) { res.writeHead(416, { 'content-range': `bytes */${size}` }); res.end(); return; }
      res.writeHead(206, { 'content-type': type, 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 });
      fs.createReadStream(f, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': size });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'step2-geometry-'));
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
  return { send, ev };
}

// 2단계 요소 — 설치판에만 있는 표시(.desktop-badge)는 «같은 화면» 비교에서 뺀다
const SEL = { cameraTop: '#cameraView .camera-top', cameraBox: '#cameraView .cameraBox', pageHeading: '#cameraWorkspace .page-heading', title: '#cameraWorkspace .page-heading h1',
  tips: '.camera-instructions', tip: '.camera-instructions li', filmHeading: '.camera-film-heading', card: '.camera-film-card', scene: '.camera-film-scene', poster: '.camera-film-poster img',
  ticket: '.camera-ticket', actions: '#cameraWorkspace .camera-actions', actionBtn: '#cameraWorkspace .camera-actions button', guide: '.camera-guide' };
const MEASURE = `(() => { const r = {};
  for (const [k, s] of Object.entries(${JSON.stringify(SEL)})) r[k] = [...document.querySelectorAll(s)].filter((e) => e.getClientRects().length).map((e) => { const b = e.getBoundingClientRect(); return [b.x, b.y, b.width, b.height].map((v) => Math.round(v * 100) / 100); });
  const img = document.querySelector(${JSON.stringify(SEL.poster)}); r.natural = img ? img.naturalWidth / img.naturalHeight : null;
  r.clipped = [...document.querySelectorAll('.camera-ticket strong, .camera-ticket .ticket-info dd, .camera-ticket .ticket-info dt, .camera-ticket .ticket-stub small, .camera-ticket .ticket-label, #cameraWorkspace .page-heading h1, .camera-instructions li *, .camera-film-heading h2')]
    .filter((e) => e.getClientRects().length && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 2)).map((e) => e.textContent.trim().slice(0, 20));
  const d = document.documentElement; r.doc = [d.scrollWidth, d.clientWidth, d.scrollHeight, innerHeight]; return r; })()`;
const FRAMES = `new Promise((r) => { const t = setTimeout(r, 400); requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(t); r(); })); })`;

// 제목 글자 윗선: 제목 상자 둘레를 찍어 위에서부터 첫 «어두운» 줄(밝기 < 160 — 검정 글자 · 빨간 «나답게,» 모두 걸린다)을 찾는다
function inkTop(pngBase64, clipY) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1'], { input: Buffer.from(pngBase64, 'base64'), maxBuffer: 1 << 26 });
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width', '-of', 'csv=p=0', '-i', 'pipe:0'], { input: Buffer.from(pngBase64, 'base64'), encoding: 'utf8' });
  const w = Number(probe.stdout.trim());
  if (!w || !r.stdout.length) throw new Error('제목 그림을 읽지 못함');
  for (let y = 0; y * w < r.stdout.length; y++) for (let x = 0; x < w; x++) if (r.stdout[y * w + x] < 160) return clipY + y;
  return null;
}

async function measure(page, w, h, shotName) {
  await page.send('Page.bringToFront');
  await page.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await page.ev(FRAMES);
  await sleep(120);
  const m = await page.ev(MEASURE);
  const t = m.title?.[0];
  if (t) {
    const clip = { x: t[0], y: Math.max(0, t[1] - 6), width: t[2], height: Math.min(t[3] + 6, 120), scale: 1 };
    const shot = await page.send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: false });
    m.titleInk = inkTop(shot.result.data, clip.y);
  }
  if (shotName) {
    // «촬영 구도 예시» 영상이 도는 중이면 찍을 때마다 장면이 달라진다(10/31 라이브에서 손이 얼굴을 가린 장면 — 첫 장면도 그렇다).
    // 화면을 건드리지 않고 한 번 재생이 끝나 마지막 장면에 머물 때까지 기다렸다 찍는다(아직 시작 전이어도 기다린다, 상한 20초 — 재생이 안 되는 브라우저는 정지 그림 그대로).
    await page.ev(`Promise.all([...document.querySelectorAll('video.camera-example-video')].map((v) => (v.ended ? null
      : new Promise((r) => { const t = setTimeout(r, 20000); v.addEventListener('ended', () => { clearTimeout(t); r(); }, { once: true }); }))))`);
    await page.ev(FRAMES);
    const shot = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(out, `${shotName}-${w}x${h}.png`), Buffer.from(shot.result.data, 'base64'));
  }
  return m;
}

for (let i = 0; i < 60; i++) { await sleep(200); try { await fetch(`http://127.0.0.1:${port}/json/version`); break; } catch { /* 아직 */ } }
const dirs = [...builds.map((b) => b.dir), ...(sameAs ? [sameAs] : [])];
const servers = await Promise.all(dirs.map((d) => (/^https:\/\//.test(d) ? { base: d.replace(/\/$/, '') } : serve(d))));
const pages = [];
for (const s of servers) pages.push(await openPage(s.base));

const close = (a, b) => Math.abs(a - b) <= 0.5;
const KEYS = Object.keys(SEL);
const diffKeys = (a, b) => KEYS.filter((k) => a[k].length !== b[k].length || a[k].some((r, i) => r.some((v, j) => !close(v, b[k][i][j]))));
const top = (r) => r[1], bottom = (r) => r[1] + r[3];
const seen = (m) => { const p = m.poster[0]; return p && m.natural ? Math.min(p[3], p[2] / m.natural) : 0; };
const report = { builds, sameAs: sameAs ?? null, sizes: [] };
let bad = 0;
for (const [w, h] of SIZES) {
  const key = `${w}x${h}`;
  const shot = SHOTS.has(key);
  const [a, b, c] = [await measure(pages[0], w, h, shot && builds[0].name), await measure(pages[1], w, h, shot && builds[1].name), sameAs ? await measure(pages[2], w, h) : null];
  const issues = [];
  const diff = diffKeys(a, b);
  if (CHANGED.has(key) && !diff.length) issues.push('«전»과 «후»가 같다(고친 것이 먹지 않음)');
  if (!CHANGED.has(key) && diff.length) issues.push(`«전»과 다름: ${diff.join(', ')}`);
  if (c) { const d2 = diffKeys(b, c); if (d2.length) issues.push(`--same-as 빌드와 다름: ${d2.join(', ')}`); }
  const row = { size: key, titleInk: [a.titleInk, b.titleInk], cameraTop: [a.cameraBox[0]?.[1], b.cameraBox[0]?.[1]], poster: [Math.round(seen(a)), Math.round(seen(b))], changed: diff };
  if (ALIGN.has(key)) {
    const cam = top(b.cameraBox[0]);
    if (b.titleInk === null || Math.abs(b.titleInk - cam) > 1) issues.push(`제목 윗선 ${b.titleInk} ≠ 사진 윗선 ${cam}`);
    const gaps = { 제목_안내: top(b.tips[0]) - bottom(b.pageHeading[0]), 안내_영화제목: top(b.filmHeading[0]) - bottom(b.tips[0]), 영화제목_포스터: top(b.scene[0]) - bottom(b.filmHeading[0]),
      포스터티켓_단추: top(b.actions[0]) - Math.max(bottom(b.scene[0]), bottom(b.ticket[0])), 단추_화면끝: b.doc[3] - bottom(b.actions[0]) };
    for (const [k, v] of Object.entries(gaps)) if (v < -0.5) issues.push(`겹침 · 넘침: ${k} ${v.toFixed(1)}px`);
    if (b.doc[0] > b.doc[1]) issues.push(`가로 넘침(${b.doc[0]} > ${b.doc[1]})`);
    if (b.clipped.length) issues.push(`글자 잘림: ${b.clipped.join(' · ')}`);
    if (seen(b) < seen(a) - 0.5) issues.push(`보이는 포스터가 작아짐(${Math.round(seen(a))} → ${Math.round(seen(b))})`);
    row.gaps = Object.fromEntries(Object.entries(gaps).map(([k, v]) => [k, Math.round(v * 10) / 10]));
  }
  row.issues = issues;
  if (issues.length) bad++;
  report.sizes.push(row);
  if (issues.length || ALIGN.has(key) || CHANGED.has(key)) console.log(`${issues.length ? '걸림' : '통과'}  ${key}  제목 윗선 ${a.titleInk} → ${b.titleInk} · 사진 윗선 ${row.cameraTop.join(' → ')} · 보이는 포스터 ${row.poster.join(' → ')}${row.gaps ? ' · 간격 ' + JSON.stringify(row.gaps) : ''}${issues.length ? '\n      ' + issues.join('\n      ') : ''}`);
}
fs.writeFileSync(path.join(out, 'geometry.json'), JSON.stringify(report, null, 1));
const unchanged = report.sizes.filter((r) => !r.changed.length).length;
console.log(`${bad ? `걸림 ${bad}건` : '모두 통과'} · 크기 ${SIZES.length}개(«전»과 같은 크기 ${unchanged}개 · 바뀐 크기 ${SIZES.length - unchanged}개)`);
for (const s of servers) s.server?.close();
process.exit(bad ? 1 : 0);
