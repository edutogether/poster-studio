/* 설치판 화면이 웹과 같은지(2026-10-27, _docs/intents/2026-10-27-desktop-installer).

     node scripts/verify/desktop-vs-web.mjs <결과 폴더> (--exe <설치한 Poster Studio.exe> | --dev) --web-dist <바꾸기 전 웹 dist> [--chrome <크롬 첫 화면 PNG 폴더>]

   ① 설치판을 원격 디버깅으로 띄워 첫 화면을 크기별(1366×768 · 1920×1080 · 2560×1440, 1배)로 찍는다(desktop-home-<크기>.png).
   ② 바꾸기 전 웹 빌드(--web-dist — 라이브와 같은 판)를 «같은 엔진»으로 띄워 같은 크기로 찍는다(web-electron-home-<크기>.png):
      설치판에 든 것과 같은 Electron(desktop/node_modules/electron)의 빈 창이 127.0.0.1의 작은 서버로 dist를 연다.
      AI 서버 확인(/health)은 이 도구가 «정상»으로 대신 답하고 나머지 바깥 요청은 막는다(실제 서버 요청 0건).
   ③ 둘을 화소로 대조한다 — 설치판에만 있는 «설치판 · AI 없이 사진 그대로» 표시 상자(+2px) 밖은 차이 0이어야 한다(아니면 종료코드 1).
   --chrome을 주면 크롬(헤드리스)으로 찍은 웹 첫 화면과의 차이도 적는다(참고만 — 크롬과 Electron의 크로뮴은 판이 달라 WebP 그림을 푸는 값 ·
   글자 그림자의 흐림이 1~수 단계 갈린다. 10/27 실측: 판타지 · 스릴러 · 드라마 WebP 그림과 그림자 진 문장 한 줄뿐, 배치 · 글자 · 색 차이는 0).
   찍기 전 맞추는 것(두 창 같게): 그림을 다 풀고, 반복 애니메이션은 0초에 세우고, CSS 전환은 끝까지 보낸다.
   찍는 동안만 포인터 반응을 끈다(숨긴 창 위에는 진짜 포인터가 없다 — 올림 요소 0개를 확인한다).
   🔴 크기를 CDP로 강제하는 시험이라 두 창 모두 보이지 않게 띄운다(11/7 Bumm님 «다 커져서 틀어지고 잘려 있다» — 작은 모니터의 보이는 창 안에 2560×1440을 강제해 잘린 화면이 보였다). 실제 창 크기의 배치는 desktop-real-window.mjs가 잰다. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { loadImage, createCanvas } from '@napi-rs/canvas';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ELECTRON = path.join(ROOT, 'desktop/node_modules/electron/dist/electron.exe');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const out = args[0];
const webDist = opt('--web-dist');
const chromeDir = opt('--chrome');
if (!out || out.startsWith('--') || !webDist || !fs.existsSync(path.join(webDist, 'index.html')) || (!args.includes('--dev') && !opt('--exe'))) {
  console.error('사용: desktop-vs-web.mjs <결과 폴더> (--exe <Poster Studio.exe> | --dev) --web-dist <바꾸기 전 웹 dist> [--chrome <PNG 폴더>]');
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });
const SIZES = [[1366, 768], [1920, 1080], [2560, 1440]];
// 첫 화면 설명 한 줄(.exhibition-description)은 StudioCaption(Medium · font-display: optional)으로 그린다. 글꼴이 늦게 오면 그 화면은 끝까지
// Studio(Regular)로 그린다 — 열 때마다 굵기가 갈리는 것은 웹 · 설치판 같은 제품 동작이다(10/27 실측: 그 줄만 7,249화소, 설치판 Medium · 웹 Regular).
// 그래서 ① 캐시를 지우지 않고 다시 열어(창이 처음 열 때 받은 글꼴을 캐시에서 쓴다) 글꼴이 제때 오게 하고 ② 크기마다 TRIES번 찍어, 그린 글꼴이 같은 짝 가운데서만
// 표시 상자 밖 차이 0인 짝을 찾는다. 같은 글꼴 짝이 없으면 판정할 수 없으므로 걸림이다(시도마다 그린 글꼴은 report.json에 남긴다).
const TRIES = 3;
// 새 창이 다른 창 뒤에서 열리면 Windows가 가려진 창으로 보고 크로뮴이 그리기를 멈춘다(10/27 실측 — 찍기가 끝나지 않았다). 확인할 때만 끈다(제품 코드는 그대로).
// 그래픽 카드로 그리면 흐린 글자 그림자(.exhibition-description text-shadow 12px)가 실행마다 조금씩 갈린다(10/27 실측 7,650 · 21,218화소) — 확인할 때만 소프트웨어로 그린다.
const NO_OCCLUSION = ['--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-gpu'];
const readPng = async (file) => { const img = await loadImage(file); const c = createCanvas(img.width, img.height); const x = c.getContext('2d'); x.drawImage(img, 0, 0); return { w: img.width, h: img.height, data: x.getImageData(0, 0, img.width, img.height).data }; };

/** 창 하나를 원격 디버깅으로 잡아 크기마다 첫 화면을 찍는다. 돌려주는 것: { [크기]: { file, hovered, badge } } */
async function captureAll(child, port, urlPrefix, prefix) {
  let target;
  for (let i = 0; i < 120 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page' && t.url.startsWith(urlPrefix)); } catch { /* 아직 */ } }
  if (!target) throw new Error(`${prefix}: 화면을 못 찾음`);
  const ws = new globalThis.WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const wait = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const ws2 = new globalThis.WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws2.addEventListener('open', r));
  const shoot = () => new Promise((resolve, reject) => {
    const ids = new Set();
    const ask = () => { const i = ++id; ids.add(i); ws2.send(JSON.stringify({ id: i, method: 'Page.captureScreenshot', params: { format: 'png' } })); };
    // 숨긴 창의 첫 찍기는 혼자 끝나지 않고, 둘째 찍기가 오면 둘 다 끝났다(11/7 실측) — 3초 안에 답이 없으면 한 번 더 부른다
    const again = globalThis.setTimeout(ask, 3000);
    const timer = globalThis.setTimeout(() => reject(new Error(`${prefix}: 화면 찍기가 30초 안에 끝나지 않음`)), 30000);
    const on = (e) => { const m = JSON.parse(e.data); if (ids.has(m.id) && m.result?.data) { globalThis.clearTimeout(timer); globalThis.clearTimeout(again); ws2.removeEventListener('message', on); resolve(m); } };
    ws2.addEventListener('message', on);
    ask();
  });
  await send('Page.enable');
  await send('DOM.enable');
  await send('CSS.enable');
  const shots = {};
  for (const [w, h] of SIZES) for (let t = 1; t <= TRIES; t++) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await send('Page.reload', { ignoreCache: false });
    await sleep(1000);
    await ev(`new Promise((r) => { const t = setInterval(() => { if (document.body.classList.contains('app-ready') && !document.getElementById('splash')) { clearInterval(t); r(); } }, 100); setTimeout(() => { clearInterval(t); r(); }, 10000); })`);
    await ev(`document.fonts.ready`);
    await ev(`Promise.all([...document.images].map((i) => i.decode().catch(() => {})))`);
    await sleep(700);
    await ev(`(() => { const st = document.createElement('style'); st.textContent = '*{pointer-events:none!important}'; document.head.append(st); })()`);
    // 흉내 낸 마우스는 보내지 않는다 — 숨긴 창 위에는 진짜 포인터도 없다(올림 요소 0개는 아래에서 확인한다).
    await sleep(400);
    const hovered = await ev(`document.querySelectorAll(':hover').length - document.querySelectorAll('html:hover, body:hover').length`);
    await ev(`(document.getAnimations().forEach((a) => { if (a instanceof CSSTransition) a.finish(); else { a.pause(); a.currentTime = 0; } }), new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))`);
    await sleep(300);
    const badge = await ev(`(() => { const b = document.querySelector('.desktop-badge'); if (!b) return null; const r = b.getBoundingClientRect(); return [r.x, r.y, r.right, r.bottom]; })()`);
    // 웹 첫 화면의 다운로드 아이콘 — 설치판은 같은 자리에 표시 상자를 둔다(StudioView «DESKTOP ? 표시 : DownloadLink»). 11/4 합친 웹의 아이콘 끝이 표시 상자 밖으로 2~3화소 나가 11화소가 «차이»로 세였다.
    const download = await ev(`(() => { const b = document.querySelector('.download-link'); if (!b) return null; const r = b.getBoundingClientRect(); return r.width ? [r.x, r.y, r.right, r.bottom] : null; })()`);
    // 화면 글자가 실제로 어떤 글꼴로 그려졌는지(두 창이 같은 글꼴을 썼는지 — 다르면 글자 화소가 갈린다)
    const fonts = {};
    const { result: { root } } = await send('DOM.getDocument', { depth: 0 });
    for (const sel of ['.exhibition h2', '.exhibition-description', '#prepareView h1', '.privacy-link']) {
      const q = await send('DOM.querySelector', { nodeId: root.nodeId, selector: sel });
      if (!q.result?.nodeId) continue;
      const pf = await send('CSS.getPlatformFontsForNode', { nodeId: q.result.nodeId });
      fonts[sel] = (pf.result?.fonts ?? []).map((x) => `${x.familyName}·${x.glyphCount}`).join(' + ');
    }
    // 찍기는 흉내를 켜지 않은 둘째 연결로 한다 — 숨긴 창에서 흉내를 켠 연결의 찍기는 끝나지 않았다(11/7 실측: 10분 멈춤, 다른 연결에서 찍자 1.2초에 끝나며 함께 풀림).
    const shot = await shoot();
    const file = path.join(out, `${prefix}-home-${w}x${h}${t > 1 ? '-' + t : ''}.png`);
    fs.writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
    (shots[`${w}x${h}`] ??= []).push({ file, hovered, badge, download, fonts });
  }
  // 기다리지 않는다 — 숨긴 창은 답하기 전에 닫혀 그 답을 영영 못 받고, 할 일이 없어진 node가 그대로 끝났다(11/7 실측 exit 13).
  void ev('window.close()');
  ws2.close();
  ws.close();
  await sleep(1500);
  child.kill();
  return shots;
}

function compare(A, B, boxes) {
  if (A.w !== B.w || A.h !== B.h) return null;
  let outside = 0, inside = 0;
  for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) {
    const i = (y * B.w + x) * 4;
    if (A.data[i] === B.data[i] && A.data[i + 1] === B.data[i + 1] && A.data[i + 2] === B.data[i + 2]) continue;
    if (boxes.some((box) => x >= box[0] && x < box[2] && y >= box[1] && y < box[3])) inside += 1; else outside += 1;
  }
  return { outside, inside };
}

// ① 설치판 — 보이지 않는 창(POSTER_STUDIO_TEST_WINDOW=hidden). 화면 크기는 아래에서 CDP로 정한다(배율 1).
const p1 = 9450 + Math.floor(Math.random() * 40);
const exe = args.includes('--dev') ? ELECTRON : path.resolve(opt('--exe'));
const desktop = await captureAll(spawn(exe, [...(args.includes('--dev') ? [path.join(ROOT, 'desktop')] : []), `--remote-debugging-port=${p1}`, '--mute-audio', ...NO_OCCLUSION], { stdio: 'ignore', env: { ...process.env, POSTER_STUDIO_TEST_WINDOW: 'hidden' } }), p1, 'app://studio/', 'desktop');

// ② 같은 엔진(Electron)으로 바꾸기 전 웹
const root = path.resolve(webDist);
const TYPE = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/__health') { res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); res.end(JSON.stringify({ ok: true, openaiReachable: true })); return; }
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  // 글꼴은 라이브 Hosting과 같은 캐시(firebase.json «**/*.woff2» 30일)로 준다 — 캐시 머리글이 없으면 다시 열 때마다 새로 받아 optional 글꼴이 늘 늦는다(10/27 실측: 웹만 9번 모두 Regular).
  const cache = path.extname(f) === '.woff2' ? { 'cache-control': 'public, max-age=2592000' } : {};
  res.writeHead(200, { 'content-type': TYPE[path.extname(f)] ?? 'application/octet-stream', ...cache });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const shell = fs.mkdtempSync(path.join(os.tmpdir(), 'web-electron-'));
fs.writeFileSync(path.join(shell, 'package.json'), JSON.stringify({ name: 'web-electron-check', main: 'main.cjs' }));
fs.writeFileSync(path.join(shell, 'main.cjs'), `const { app, BrowserWindow, Menu, session } = require('electron');
app.setPath('userData', ${JSON.stringify(path.join(shell, 'profile'))});
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['https://*/*', 'wss://*/*'] }, (d, cb) => cb(/\\/health$/.test(d.url) ? { redirectURL: ${JSON.stringify(base + '/__health')} } : { cancel: true }));
  const w = new BrowserWindow({ width: 1366, height: 860, show: false, autoHideMenuBar: true, backgroundColor: '#ffffff', webPreferences: { backgroundThrottling: false } });
  w.loadURL(${JSON.stringify(base + '/')});
});
app.on('window-all-closed', () => app.quit());
`);
const p2 = 9490 + Math.floor(Math.random() * 40);
const web = await captureAll(spawn(ELECTRON, [shell, `--remote-debugging-port=${p2}`, '--mute-audio', ...NO_OCCLUSION], { stdio: 'ignore' }), p2, base, 'web-electron');
server.close();
fs.rmSync(shell, { recursive: true, force: true });

// ③ 대조
const report = { exe, webDist: root, sizes: [], checks: [] };
for (const [w, h] of SIZES) {
  const key = `${w}x${h}`;
  const ds = desktop[key], wvs = web[key];
  const d = ds[0];
  const grow = (r) => [Math.floor(r[0] - 2), Math.floor(r[1] - 2), Math.ceil(r[2] + 2), Math.ceil(r[3] + 2)];
  const box = d.badge ? grow(d.badge) : null;
  // 뺄 칸: 설치판 표시 상자 + 웹 다운로드 아이콘(있으면). 표시 상자가 없으면 판정하지 않는다(아래 ok).
  const boxes = [box, wvs[0].download ? grow(wvs[0].download) : null].filter(Boolean);
  let same = null;
  for (const x of ds) for (const y of wvs) {
    if (JSON.stringify(x.fonts) !== JSON.stringify(y.fonts)) continue;
    const c = compare(await readPng(y.file), await readPng(x.file), boxes);
    if (c && (!same || c.outside < same.outside)) same = { ...c, desktop: path.basename(x.file), web: path.basename(y.file) };
  }
  const B = await readPng(d.file);
  const row = { size: key, hovered: [ds.map((x) => x.hovered), wvs.map((x) => x.hovered)], badgeBox: box, skipBoxes: boxes, sameEngine: same, fonts: { desktop: ds.map((x) => x.fonts), web: wvs.map((x) => x.fonts) } };
  if (chromeDir && fs.existsSync(path.join(chromeDir, `home-${key}.png`))) row.vsChrome = compare(await readPng(path.join(chromeDir, `home-${key}.png`)), B, boxes);
  report.sizes.push(row);
  const ok = ds.every((x) => x.hovered === 0) && wvs.every((x) => x.hovered === 0) && box && same && same.outside === 0 && same.inside > 0;
  report.checks.push({ name: `${key}: 설치판 첫 화면 = 같은 엔진의 웹 첫 화면(표시 상자 밖 차이 0)`, ok });
  console.log(`${ok ? '통과' : '걸림'}  ${key}: 설치판 첫 화면 = 같은 엔진의 웹 첫 화면(표시 상자 밖 차이 0) — ${JSON.stringify(row)}`);
}
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
const failed = report.checks.filter((c) => !c.ok).length;
console.log(failed ? `걸림 ${failed}건 / ${report.checks.length}` : `모두 통과 ${report.checks.length}건`);
process.exit(failed ? 1 : 0);
