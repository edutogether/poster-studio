/* 설치판 앱 창을 실제로 크기마다 바꿔 화면 배치를 잰다(2026-10-28 Bumm님 «설치판 앱도 창 크기에 맞게 자연스럽게 — 찌그러지거나 잘리거나 겹치면 안 된다»,
   «528개 크기 겹침 측정을 이번엔 설치판 창을 실제로 그 크기로 바꿔서», 팀장 전달).

     node scripts/verify/desktop-window-sweep.mjs <결과 폴더> (--exe <설치한 Poster Studio.exe> | --dev) --web-dist <웹 빌드(dist)> [--sizes 1366x768,…] [--quick]

   ① 설치판 앱을 숨긴 채 띄운다 — 환경 변수 POSTER_STUDIO_TEST_WINDOW=hidden을 받은 앱은 창을 보이지 않고 배경 늦춤을 끈다(desktop/main.mjs — 이 도구가 띄운 앱에만 간다).
      대부분의 크기(최대 3840×2160)가 검사용 아래 모니터(1408×792)보다 커서, 화면에 띄우지 않고 진짜 창의 크기만 바꾼다. 위 모니터에는 한순간도 뜨지 않는다.
   ② 같은 크기의 웹 화면 — 같은 Electron의 숨은 창이 127.0.0.1의 작은 서버로 웹 빌드를 연다(스크롤 막대 · 배율이 설치판 창과 같게). /health는 «정상»으로 대신 답한다.
   ③ 두 창의 안쪽(client) 크기를 Windows로 바꾸고(win-ctl.ps1 — 실제 WM_SIZE), 화면이 그 크기가 된 뒤 화면마다 잰다:
      1단계(혼자) · 2단계(카메라 켜기 전) · 3단계(샘플 포스터 8종) · 인쇄 미리보기(설치판만).
      - 가로 넘침(문서 폭 > 화면 폭) · 단추 · 입력칸끼리 겹침(모달 창이 열려 있으면 그 안끼리) · 단추가 화면 왼쪽 · 오른쪽 밖 · 잘린 글자(넘침 숨김인데 내용이 더 큼, «…» 줄임과 줄 수 제한은 뺀다)
      - 단추가 보이는 칸 밖(11/4): 화면이나 넘침을 자르는 칸(안쪽 스크롤 칸 등) 밖으로 조금이라도 나간 단추 — 문서 스크롤이 있는 휴대폰 배치(760 이하)는 그 자체가 정상이라 문서 스크롤로 닿는 것은 뺀다.
        11/3 Bumm님 «창을 끌어 너무 작게 만들면 많이 깨진다»: 600×480 근처에서 2단계 주 단추가 오른쪽 칸 스크롤 뒤로 숨었는데 겹침 · 잘린 글자 검사는 통과였다(보는 층에 없던 결함).
      - 같은 크기 웹과 요소 자리 비교(0.5px) — 설치판 전용 차이는 뺀다: «설치판» 표시 · 웹 «다운로드», 2단계 오른쪽 칸(제목 · 안내 · 영화 · 단추 줄 — 폭 1100 이상 · 높이 680 이상, desktop.css 높이 구간),
        3단계 단추 줄(«PC에 저장») · 낮은 창의 3단계 디자인 8칸(폭 1100 이상 · 높이 679 이하와 700~729 — desktop.css가 일부러 다르게 줄인다). 웹이 세로로 스크롤되지 않는데 설치판만 스크롤되면 그것도 걸림.
      - 앱이 정한 최소 창(안쪽 1100×648 — 11/4, 그 전 600×480 · 1024×640)보다 작은 크기는 창이 그 크기가 되지 않는다 — «최소 창보다 작음»으로 적고 판정에서 뺀다.
   ④ 배율: 두 창을 125% 모니터 자리(숨은 채)로 옮겨 같은 CSS 크기에서 배치가 100%와 같은지(반올림 1px), 옮겼다가 돌아와도 같은지 잰다.
   결과: <결과 폴더>/report.json, 하나라도 걸리면 종료코드 1. 서버 요청 · 생성 · 카메라 0건. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ELECTRON = path.join(ROOT, 'desktop/node_modules/electron/dist/electron.exe');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const out = args[0];
const webDist = opt('--web-dist');
if (!out || out.startsWith('--') || !webDist || !fs.existsSync(path.join(webDist, 'index.html')) || (!args.includes('--dev') && !opt('--exe'))) {
  console.error('사용: desktop-window-sweep.mjs <결과 폴더> (--exe <Poster Studio.exe> | --dev) --web-dist <웹 dist> [--sizes WxH,…] [--quick] [--force-scale S]');
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });

// 크기 목록 — desktop-layout-sweep.mjs와 같은 528개(구간 경계 · 흔한 노트북 · 최대화 크기 + 격자)
const NAMED = [[760, 1000], [1024, 768], [1099, 900], [1099, 1440], [1100, 820], [1100, 821], [1100, 869], [1100, 870], [1100, 959], [1280, 679], [1280, 680], [1280, 720], [1280, 800], [1280, 1024],
  [1366, 768], [1440, 810], [1440, 900], [1536, 731], [1536, 864], [1600, 900], [1680, 1050], [1920, 869], [1920, 870], [1920, 879], [1920, 959], [1920, 1080], [1920, 1200], [2048, 1152],
  [2560, 1080], [2560, 1369], [2560, 1440], [2560, 1600], [2560, 1700], [2560, 1759], [2560, 1760], [3440, 1440], [3840, 1600], [3840, 2160],
  [1280, 649], [1366, 697], [1440, 829], [1536, 793], [1600, 829], [1920, 1009], [3840, 2089]];
const GRID = [];
for (let w = 1100; w <= 3840; w += 137) for (let h = 640; h <= 2160; h += 67) GRID.push([w, h]);
// 최소 창 근처와 반 화면 크기(11/2 — 1366×768 · 1920×1080 125 · 150% · 1280×800의 반 화면 안쪽, 760 · 761 휴대폰 ↔ PC 경계, 3단계 단추 줄이 넘치던 761~950)를 촘촘히
const SMALL = [[584, 441], [600, 480], [624, 649], [640, 480], [667, 689], [700, 560], [752, 785], [760, 600], [761, 480], [761, 600], [800, 600], [900, 560], [944, 1001], [950, 640], [1000, 600], [1093, 543],
  [1008, 601], [1008, 640], [1008, 700], [1024, 601], [1024, 640], [1050, 620], [1099, 601], [1100, 601], [1100, 640], [1200, 601], [1280, 601], [1366, 601]];
SMALL.push([1100, 648], [1100, 649], [1101, 660], [1100, 679], [1100, 680], [1100, 699], [1100, 700], [1100, 729], [1100, 730], [1280, 649], [1366, 697], [1920, 648], [1920, 700], [1920, 720], [2560, 648]);
const parseSizes = (s) => s.split(',').map((x) => x.split('x').map(Number));
const SIZES = opt('--sizes') ? parseSizes(opt('--sizes')) : args.includes('--quick') ? [...NAMED, ...SMALL] : [...new Map([...NAMED, ...GRID, ...SMALL].map((s) => [s.join('x'), s])).values()];
const MIN_CLIENT = { w: 1100, h: 648 };   // 앱 최소 창(desktop/main.mjs — 11/4부터 안쪽 크기로 정한다, useContentSize). 그 전 600×480 → 안쪽 584×441(11/2) · 1024×640 → 1008×601(10/28)
const DPI_SIZES = [[1366, 768], [1536, 793], [1280, 649], [1100, 820], [1366, 697], [1440, 829]];   // 125% 모니터 자리(1760×990)에 들어가는 크기

// ── 앱 · 웹 창 띄우기 ──
const children = [];
const cleanup = () => { for (const c of children) { try { c.kill(); } catch { /* 이미 끝남 */ } } };
process.on('exit', cleanup);
const FLAGS = ['--mute-audio', '--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'];
// --force-scale S(11/2): 두 창에 배율 S를 강제한다(Electron --force-device-scale-factor) — 이 PC에 없는 150~300% 모니터 대신. 크기는 CSS px로 주고 실제 창은 S배.
const FORCE = opt('--force-scale') ? Number(opt('--force-scale')) : null;
if (FORCE) FLAGS.push(`--force-device-scale-factor=${FORCE}`);
const deskPort = 9300 + Math.floor(Math.random() * 100), webPort = 9400 + Math.floor(Math.random() * 100);
const exe = args.includes('--dev') ? ELECTRON : path.resolve(opt('--exe'));
const desk = spawn(exe, [...(args.includes('--dev') ? [path.join(ROOT, 'desktop')] : []), `--remote-debugging-port=${deskPort}`, ...FLAGS], { stdio: 'ignore', windowsHide: true, env: { ...process.env, POSTER_STUDIO_TEST_WINDOW: 'hidden' } });
children.push(desk);

const root = path.resolve(webDist);
const TYPE = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/__health') { res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); res.end(JSON.stringify({ ok: true, openaiReachable: true })); return; }
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPE[path.extname(f)] ?? 'application/octet-stream', ...(path.extname(f) === '.woff2' ? { 'cache-control': 'public, max-age=2592000' } : {}) });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const shell = fs.mkdtempSync(path.join(os.tmpdir(), 'web-window-'));
fs.writeFileSync(path.join(shell, 'package.json'), JSON.stringify({ name: 'web-window-sweep', main: 'main.cjs' }));
fs.writeFileSync(path.join(shell, 'main.cjs'), `const { app, BrowserWindow, Menu, session } = require('electron');
app.setPath('userData', ${JSON.stringify(path.join(shell, 'profile'))});
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['https://*/*', 'wss://*/*'] }, (d, cb) => cb(/\\/health$/.test(d.url) ? { redirectURL: ${JSON.stringify(base + '/__health')} } : { cancel: true }));
  // 숨은 창(보이지 않는다) — 설치판 창과 같은 기본 크기 · 같은 배경 늦춤 끔
  const w = new BrowserWindow({ width: 1366, height: 860, show: false, title: 'Poster Studio Web', autoHideMenuBar: true, backgroundColor: '#ffffff', webPreferences: { backgroundThrottling: false } });
  w.on('page-title-updated', (e) => e.preventDefault());
  w.loadURL(${JSON.stringify(base + '/')});
});
app.on('window-all-closed', () => app.quit());
`);
const web = spawn(ELECTRON, [shell, `--remote-debugging-port=${webPort}`, ...FLAGS], { stdio: 'ignore', windowsHide: true });
children.push(web);

const ctl = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'scripts/verify/win-ctl.ps1')], { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true });
children.push(ctl);
const pending = [];
readline.createInterface({ input: ctl.stdout }).on('line', (l) => pending.shift()?.(l.trim()));
const cmd = (c) => new Promise((r) => { pending.push(r); ctl.stdin.write(c + '\n'); });

async function connect(port, prefix) {
  let target;
  for (let i = 0; i < 160 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page' && t.url.startsWith(prefix)); } catch { /* 아직 */ } }
  if (!target) throw new Error(`화면을 못 찾음: ${prefix}`);
  const ws = new globalThis.WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const wait = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const waitFor = async (expr, ms = 20000) => { for (const end = Date.now() + ms; Date.now() < end; await sleep(150)) if (await ev(expr)) return true; return false; };
  if (!await waitFor(`document.body.classList.contains('app-ready') && !document.getElementById('splash')`, 40000)) throw new Error(`앱이 뜨지 않음: ${prefix}`);
  await ev('document.fonts.ready.then(() => true)');
  return { ev, waitFor, close: () => ws.close() };
}
const D = await connect(deskPort, 'app://studio');
const Wb = await connect(webPort, base);
const hD = await cmd(`find ${desk.pid} Poster Studio`), hW = await cmd(`find ${web.pid} Poster Studio Web`);
if (hD === 'none' || hW === 'none') throw new Error(`창을 못 찾음(설치판 ${hD} · 웹 ${hW})`);
const report = { exe, webDist: root, forceScale: FORCE, startedAt: new Date().toISOString(), hidden: {}, screens: {}, dpi: [], checks: [] };
const visibleNow = async () => (await cmd(`state ${hD}`)).split(' ')[0] === '1' || (await cmd(`state ${hW}`)).split(' ')[0] === '1';
report.hidden.start = !(await visibleNow());

// 창 안쪽을 w×h(CSS px)로 — 100% 자리는 (0,0)(숨은 창이라 보이지 않는다), 125% 자리는 아래 모니터 왼쪽 위
async function resize(page, hwnd, w, h, scale = 1) {
  const [x, y] = scale === 1 ? [0, 0] : [1624, 1464];
  const r = (await cmd(`client ${hwnd} ${Math.round(w * scale)} ${Math.round(h * scale)} ${x} ${y}`)).split(' ');
  const want = { w: Math.round(Math.round(w * scale) / scale), h: Math.round(Math.round(h * scale) / scale) };
  await page.waitFor(`Math.abs(innerWidth - ${want.w}) <= 1 && Math.abs(innerHeight - ${want.h}) <= 1`, 3000);
  await page.ev(`new Promise((r) => { const t = setTimeout(r, 500); requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(t); r(); })); })`);
  await sleep(60);
  return { clientW: Number(r[1]), clientH: Number(r[2]), dpi: Number(r[3]) };
}

// 화면 잼 — 요소 열쇠(가장 가까운 id 조상 + 태그 · 클래스 + 순번)별 자리, 가로 넘침, 단추 겹침 · 화면 밖, 잘린 글자
const MEASURE = `(() => {
  const vis = (e) => { if (e.closest('[hidden], dialog:not([open])')) return false; const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false; const b = e.getBoundingClientRect(); return b.width > 0.5 && b.height > 0.5; };
  const SEL = 'button, a[href], input:not([type=hidden]), select, textarea, h1, h2, h3, img, video, label, [role=button], .stepper li, .cameraBox, .camera-film-scene, .camera-ticket, .result-poster, .poster-option';
  const all = [...document.querySelectorAll(SEL)].filter(vis);
  const count = new Map();
  const keyOf = (e) => { const anc = e.parentElement?.closest('[id]'); const sig = (anc ? '#' + anc.id + ' ' : '') + e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + '.' + [...e.classList].sort().join('.'); const n = (count.get(sig) ?? 0) + 1; count.set(sig, n); return sig + ':' + n; };
  const items = all.map((e) => { const b = e.getBoundingClientRect(); return { key: keyOf(e), x: b.x, y: b.y, w: b.width, h: b.height, el: e }; });
  // 모달 창(인쇄 미리보기 등)이 열려 있으면 그 안의 단추끼리만 본다 — 모달은 뒤 화면을 덮는 것이 정상이다
  const modal = [...document.querySelectorAll('dialog[open]')].find((x) => x.matches(':modal'));
  const ctrls = items.filter((i) => i.el.matches('button, a[href], input, select, textarea, [role=button]') && (!modal || modal.contains(i.el)));
  const overlaps = [];
  for (let a = 0; a < ctrls.length; a++) for (let b = a + 1; b < ctrls.length; b++) {
    const A = ctrls[a], B = ctrls[b];
    if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
    const ix = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x), iy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
    // 3단계 넘김 화살표는 포스터 줄 가장자리에 일부러 얹었다(10/19 «양쪽에 화살표» — mobile-layout-probe.mjs와 같은 예외)
    const arrowOnSlide = (p, q) => p.el.classList.contains('carousel-arrow') && q.el.classList.contains('poster-slide');
    if (arrowOnSlide(A, B) || arrowOnSlide(B, A)) continue;
    if (ix > 1 && iy > 1) overlaps.push(A.key + ' × ' + B.key);
  }
  // 3단계 휴대폰 배치의 포스터 넘기기(.poster-slide)는 가로로 넘겨 보는 줄이다 — 화면 옆 밖으로 세지 않는다(11/2 최소 창을 낮추며 760 이하 창이 생김).
  // 넘겨 보는 줄 안이라는 것만으로 빼면 안 된다: 3단계 «출력하기»도 가로로 스크롤되는 칸 안에 있어 밀려 나간 것을 놓쳤다(11/2).
  const offside = ctrls.filter((i) => (i.x < -0.5 || i.x + i.w > innerWidth + 0.5) && !i.el.classList.contains('poster-slide')).map((i) => i.key);
  const clipped = [...document.querySelectorAll('body *')].filter((e) => {
    if (!vis(e) || !e.childNodes.length || ![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return false;
    const s = getComputedStyle(e); if (s.textOverflow === 'ellipsis' || s.webkitLineClamp !== 'none') return false;
    const hide = (v) => v === 'hidden' || v === 'clip';
    return (hide(s.overflowX) && e.scrollWidth > e.clientWidth + 1) || (hide(s.overflowY) && e.scrollHeight > e.clientHeight + 2);
  }).map((e) => (e.className || e.tagName) + ': ' + e.textContent.trim().slice(0, 24));
  // 단추가 보이는 칸 밖(11/4) — 화면과 넘침을 자르는 조상 칸들의 겹친 영역 밖으로 나간 단추. 문서 스크롤로 닿는 아래쪽은 뺀다(휴대폰 배치 · 긴 페이지).
  // 휴대폰 배치 3단계 포스터 넘기기(.poster-slide)는 가로로 넘겨 보는 줄이라 뺀다(위 «화면 옆 밖»과 같은 까닭). «본문으로 건너뛰기»(.skip-link)는 키보드 초점을 받을 때만 화면 위에서 내려온다.
  const se = document.scrollingElement;
  const clipBox = (e) => { let r = { t: 0, b: innerHeight, l: 0, rr: innerWidth }; for (let p = e.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) { const s = getComputedStyle(p); if (s.overflowY !== 'visible' || s.overflowX !== 'visible') { const b = p.getBoundingClientRect(); r = { t: Math.max(r.t, b.top), b: Math.min(r.b, b.bottom), l: Math.max(r.l, b.left), rr: Math.min(r.rr, b.right) }; } } return r; };
  const hidden = ctrls.filter((i) => !i.el.classList.contains('poster-slide') && !i.el.classList.contains('skip-link')).filter((i) => {
    const c = clipBox(i.el);
    const docReach = c.b === innerHeight && i.y + i.h - innerHeight <= se.scrollHeight - innerHeight - scrollY + 0.5;   // 화면 아래로만 나갔고 문서 스크롤로 닿는다
    return i.y < c.t - 0.5 || i.x < c.l - 0.5 || i.x + i.w > c.rr + 0.5 || (i.y + i.h > c.b + 0.5 && !docReach);
  }).map((i) => i.key + '@' + Math.round(i.y) + '+' + Math.round(i.h));
  const d = document.documentElement;
  return { hidden, iw: innerWidth, ih: innerHeight, dpr: devicePixelRatio, sw: d.scrollWidth, cw: d.clientWidth, sh: d.scrollHeight, step: document.body.dataset.step,
    rects: Object.fromEntries(items.map((i) => [i.key, [i.x, i.y, i.w, i.h].map((v) => Math.round(v * 10) / 10)])), overlaps, offside, clipped };
})()`;
// 2단계 예시 칸의 영상 · 정지 그림은 재생 시점에 따라 서로 바뀐다(두 창이 같은 순간에 재지 않는다) — 칸(.cameraBox) 자리는 그대로 견준다(11/2 600×480에서 한쪽만 영상)
const EXCLUDE_ALWAYS = ['.desktop-badge', '.download-link', '.camera-example-video', '.camera-example-still'];
const exclusions = (screen, w, h) => [...EXCLUDE_ALWAYS,
  // 2단계 오른쪽 칸 — 설치판 높이 구간(desktop.css, 폭 1100 이상 · 높이 680 이상)에서 제목 · 안내 · 영화 · 단추 줄을 일부러 다르게 둔다(그 배치는 desktop-layout-sweep.mjs의 구간 규칙이 잰다)
  ...(screen === 'step2' && w >= 1100 && h >= 680 ? ['#cameraWorkspace .page-heading', '#cameraWorkspace .camera-guide', '#cameraWorkspace .camera-actions', '#cameraView .camera-tips'] : []),
  ...(screen === 'step3' ? ['#resultView .result-actions'] : []),
  // 낮은 창의 3단계 디자인 8칸 — 설치판은 단추가 하나 더 있어 8칸을 더 줄이고(높이 679 이하), 높이 700~729는 웹의 최소 폭 536px 없이 줄인다(desktop.css, 11/4)
  ...(screen === 'step3' && w >= 1100 && (h <= 679 || (h >= 700 && h <= 729)) ? ['#gallery'] : [])];
// 열쇠가 제외 영역 안 요소인지는 페이지에서 고른다 — 각 창에서 제외할 열쇠 목록을 받는다
const excludedKeys = (page, sels) => page.ev(`(() => { ${MEASURE.slice(MEASURE.indexOf('const vis'), MEASURE.indexOf('const ctrls'))} const sels = ${JSON.stringify(sels)}; return items.filter((i) => sels.some((s) => i.el.closest(s))).map((i) => i.key); })()`);

function judge(screen, w, h, d, v, exD, exV) {
  const bad = [];
  // 창이 그 크기가 되지 않았다 — 최소 창보다 작은 크기(그 방향이 최소에 걸림)일 때만 빼고, 그 밖에는 걸림(창이 크기를 따라오지 않은 것)
  // 최소 바로 아래(1099 등)는 창이 최소(1100)에 멈춰도 차이가 1이라 «그 크기가 됨»으로 보였다 — 최소보다 작은 크기에서 창이 더 크면 그 크기가 되지 않은 것이다(11/4)
  if (Math.abs(d.iw - w) > 1 || Math.abs(d.ih - h) > 1 || (w < MIN_CLIENT.w && d.iw > w) || (h < MIN_CLIENT.h && d.ih > h)) {
    const atMin = (Math.abs(d.iw - w) <= 1 || (w < d.iw && d.iw <= MIN_CLIENT.w + 1)) && (Math.abs(d.ih - h) <= 1 || (h < d.ih && d.ih <= MIN_CLIENT.h + 1));
    return atMin ? { skip: `최소 창보다 작음 — 창이 ${d.iw}×${d.ih}까지만 줄어든다` } : { bad: [`창이 ${w}×${h}가 되지 않음(${d.iw}×${d.ih})`] };
  }
  if (d.sw > d.cw + 0.5) bad.push(`가로 넘침 ${d.sw} > ${d.cw}`);
  if (d.overlaps.length) bad.push(`단추 겹침: ${d.overlaps.slice(0, 4).join(' | ')}`);
  if (d.offside.length) bad.push(`단추가 화면 옆 밖: ${d.offside.slice(0, 4).join(' | ')}`);
  if (d.hidden.length) bad.push(`단추가 보이는 칸 밖(스크롤해야 보임): ${d.hidden.slice(0, 4).join(' | ')}`);
  if (d.clipped.length) bad.push(`잘린 글자: ${d.clipped.slice(0, 4).join(' | ')}`);
  if (v) {
    if (d.sh > d.ih + 1 && !(v.sh > v.ih + 1)) bad.push(`설치판만 세로로 스크롤(${d.sh} > ${d.ih}, 웹 ${v.sh})`);
    const skip = new Set([...exD, ...exV]);
    const keys = new Set([...Object.keys(d.rects), ...Object.keys(v.rects)].filter((k) => !skip.has(k)));
    const diff = [];
    for (const k of keys) {
      const a = d.rects[k], b = v.rects[k];
      if (!a || !b) { diff.push(`${k} ${a ? '설치판에만' : '웹에만'}`); continue; }
      if (a.some((x, i) => Math.abs(x - b[i]) > 0.5)) diff.push(`${k} ${a.join(',')} ≠ ${b.join(',')}`);
    }
    if (diff.length) bad.push(`웹과 다름 ${diff.length}곳: ${diff.slice(0, 3).join(' | ')}`);
  }
  return { bad };
}

async function sweep(screen, withWeb) {
  const rows = [];
  for (const [w, h] of SIZES) {
    const rd = await resize(D, hD, w, h, FORCE ?? 1);
    if (withWeb) await resize(Wb, hW, w, h, FORCE ?? 1);
    const d = await D.ev(MEASURE), v = withWeb ? await Wb.ev(MEASURE) : null;
    const sels = exclusions(screen, w, h);
    const exD = withWeb ? await excludedKeys(D, sels) : [], exV = withWeb ? await excludedKeys(Wb, sels) : [];
    const j = judge(screen, w, h, d, v, exD, exV);
    rows.push({ size: `${w}x${h}`, client: [rd.clientW, rd.clientH], dpr: d.dpr, scroll: d.sh > d.ih + 1, rects: d.rects, ...j });
  }
  report.screens[screen] = rows;
  const judged = rows.filter((r) => !r.skip);
  const failed = judged.filter((r) => r.bad.length);
  report.checks.push({ name: `${screen}: ${judged.length}개 크기${withWeb ? ' · 같은 크기 웹과 비교' : ''}(최소 창보다 작아 뺀 것 ${rows.length - judged.length}개)`, ok: judged.length > 0 && failed.length === 0, failed: failed.length });   // 잰 크기가 0개면 통과가 아니다(11/2 감사 — 빈 게이트)
  console.log(`${failed.length ? '걸림' : '통과'}  ${screen} ${judged.length}개 크기(뺀 것 ${rows.length - judged.length}) — 걸린 크기 ${failed.length}`);
  for (const r of failed.slice(0, 6)) console.log(`   ${r.size}: ${r.bad.join(' / ')}`);
}

// 화면마다: 1단계 → 2단계 → (샘플) 3단계 → 인쇄 미리보기(설치판만)
await sweep('step1', true);
for (const p of [D, Wb]) { await p.ev(`document.getElementById('prepareNextBtn').click()`); if (!await p.waitFor(`document.body.dataset.step === '2'`)) throw new Error('2단계로 가지 않음'); }
await sweep('step2', true);

// 배율(④): 2단계에서 두 창을 125% 자리로 — 같은 CSS 크기의 100% 자리 잼과 견준다(반올림 1px). 옮겼다가 100%로 돌아와도 같은지.
for (const [w, h] of FORCE ? [] : DPI_SIZES) {   // 배율을 강제했으면 125% 옮기기는 하지 않는다
  await resize(D, hD, w, h, 1); const a = await D.ev(MEASURE);
  await resize(D, hD, w, h, 1.25); const b = await D.ev(MEASURE);
  await resize(D, hD, w, h, 1); const c = await D.ev(MEASURE);
  // 예시 칸 영상 · 정지 그림은 재생 시점에 따라 서로 바뀐다 — 배율 비교에서도 뺀다(웹 비교의 EXCLUDE_ALWAYS와 같은 까닭, 11/2 한 번 걸림)
  const diff = (x, y) => Object.keys(x.rects).filter((k) => !/camera-example-(video|still)/.test(k) && (!y.rects[k] || x.rects[k].some((v, i) => Math.abs(v - y.rects[k][i]) > 1.6)));
  const d125 = diff(a, b), back = diff(a, c);
  const bad = [...(b.dpr !== 1.25 ? [`125% 자리에서 배율 ${b.dpr}`] : []), ...(d125.length ? [`125%에서 자리 다름 ${d125.length}곳: ${d125.slice(0, 3).join(' | ')}`] : []),
    ...(back.length ? [`돌아온 뒤 자리 다름 ${back.length}곳`] : []), ...(b.overlaps.length || b.clipped.length || b.sw > b.cw + 0.5 ? ['125%에서 겹침 · 잘림 · 넘침'] : [])];
  report.dpi.push({ size: `${w}x${h}`, dpr: [a.dpr, b.dpr, c.dpr], bad });
}
{ const failed = report.dpi.filter((r) => r.bad.length); report.checks.push({ name: `배율 100% ↔ 125% 옮기기(2단계) ${report.dpi.length}개 크기`, ok: !failed.length, failed: failed.length });
  console.log(`${failed.length ? '걸림' : '통과'}  배율 100% ↔ 125% ${report.dpi.length}개 크기`); for (const r of failed) console.log(`   ${r.size}: ${r.bad.join(' / ')}`); }

for (const p of [D, Wb]) await p.ev(`document.getElementById('shotBtn').click()`);   // 카메라를 켜기 전 빨간 단추 = «샘플 포스터 보기»
for (const p of [D, Wb]) if (!await p.waitFor(`document.body.dataset.step === '3' && document.querySelectorAll('#resultView .style-option.thumb').length === 8`, 90000)) throw new Error('3단계(샘플 8종)로 가지 않음');
await sweep('step3', true);
await D.ev(`document.getElementById('printBtn').click()`);
if (!await D.waitFor(`document.querySelector('.print-preview')?.open === true`)) throw new Error('인쇄 미리보기가 열리지 않음');
await sweep('printPreview', false);

report.hidden.end = !(await visibleNow());
report.checks.push({ name: '두 창 모두 처음부터 끝까지 보이지 않았다(숨은 창)', ok: report.hidden.start && report.hidden.end });
report.finishedAt = new Date().toISOString();
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
for (const c of report.checks.slice(-1)) console.log(`${c.ok ? '통과' : '걸림'}  ${c.name}`);
const failed = report.checks.filter((c) => !c.ok).length;
console.log(failed ? `걸림 ${failed}건 / ${report.checks.length}` : `모두 통과 ${report.checks.length}건`);
D.close(); Wb.close(); server.close(); ctl.stdin.write('quit\n');
cleanup();
process.exit(failed ? 1 : 0);
