/* 라이브 «↓ 다운로드» · 설치 파일 확인(2026-10-27, _docs/intents/2026-10-27-download-button-deploy). dist 확인은 download-button-probe.mjs.

     node scripts/verify/download-live.mjs <결과 폴더> --before                                         배포 전: 첫 화면만 찍는다
     node scripts/verify/download-live.mjs <결과 폴더> --sha256 <기대 해시> [--compare <전 결과 폴더>]  배포 후: 아래를 전부 잰다

   주소: 대표 https://poster.edutogether.kr, 보조 https://poster-studio.web.app · https://poster-studio.firebaseapp.com.
   요청은 인증 정보 없이 보낸다 — Node fetch(쿠키 · 로그인 없음), 헤드리스 크롬은 이 도구가 만든 빈 프로필.
   AI 서버 확인(/health)만 이 도구가 «정상»으로 대신 답한다(함수 요청 0건 · 생성 · 과금 없음). 첫 화면은 PC 2560×1440(1배) ·
   휴대폰 390×844(3배)로 원본 해상도 그대로 찍는다(<결과 폴더>/<주소>-<크기>.png, 같은 판을 3번 연 것은 -2 · -3).

   배포 후 재는 것(하나라도 걸리면 종료코드 1):
     ① 세 주소 각각: 첫 화면 200 · /download/PosterStudio-Setup.exe가 302로 Storage 객체를 가리킴 · 넘어간 곳 200 ·
        Content-Type · Content-Disposition(attachment, 이름 PosterStudio-Setup.exe) · Content-Length = 받은 바이트 · 끝까지 받은 SHA-256 = 기대값
     ② 세 주소 각각 헤드리스 첫 화면(PC 2560): 앱이 뜨고 단추가 하나 있다 · 세 주소의 본 번들이 같다
     ③ 대표 주소 PC 2560 · 휴대폰 3배: 접속 · 새로고침 · 2단계 갔다 오기까지 설치 파일 요청 0건 → 단추를 마우스(휴대폰은 손가락)로
        누르면 그때 내려받기가 시작돼 끝까지 받아진다 · 저장 이름 PosterStudio-Setup.exe · SHA-256 = 기대값 · 페이지는 그대로
     ④ --compare: 대표 주소 전/후 첫 화면 화소 — 단추 상자 밖 차이 0(같은 판을 3번 열어 가장 가까운 짝) */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { spawn } from 'node:child_process';
import { loadImage, createCanvas } from '@napi-rs/canvas';

const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const out = args.find((a, i) => !a.startsWith('--') && !['--sha256', '--compare'].includes(args[i - 1]));
const before = args.includes('--before');
const expectSha = opt('--sha256');
const compareDir = opt('--compare');
if (!out || (!before && !/^[0-9a-f]{64}$/.test(expectSha ?? ''))) {
  console.error('사용: download-live.mjs <결과 폴더> (--before | --sha256 <기대 해시> [--compare <전 결과 폴더>])');
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });
const HOSTS = [
  { name: 'edutogether', url: 'https://poster.edutogether.kr' },
  { name: 'webapp', url: 'https://poster-studio.web.app' },
  { name: 'firebaseapp', url: 'https://poster-studio.firebaseapp.com' },
];
const PATH = '/download/PosterStudio-Setup.exe';
const OBJECT = 'https://storage.googleapis.com/inky-poster-studio-download/PosterStudio-Setup.exe';
const FILE = 'PosterStudio-Setup.exe';
const SIZES = [{ name: 'pc-2560x1440', w: 2560, h: 1440, s: 1 }, { name: 'phone-390x844x3', w: 390, h: 844, s: 3, mobile: true }];
const SETUP = /Setup\.exe/i;
const TRIES = 3;

const report = { mode: before ? 'before' : 'after', at: new Date().toISOString(), http: {}, browser: {}, checks: [] };
const check = (name, ok, detail) => { report.checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? '통과' : '걸림'}  ${name}${detail === undefined ? '' : ' — ' + JSON.stringify(detail)}`); };
const sha256 = (file) => new Promise((resolve, reject) => { const h = crypto.createHash('sha256'); fs.createReadStream(file).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject); });

// ① 인증 정보 없는 HTTP — 첫 화면 · 리디렉션 · 끝까지 받은 바이트의 해시
for (const host of HOSTS) {
  const r = {};
  const home = await fetch(host.url + '/', { redirect: 'manual' });
  const html = await home.text();
  r.home = { status: home.status, type: home.headers.get('content-type'), bundle: html.match(/\/assets\/main-[\w-]+\.js/)?.[0] ?? null };
  const hop = await fetch(host.url + PATH, { redirect: 'manual' });
  await hop.arrayBuffer();
  r.hop = { status: hop.status, location: hop.headers.get('location') };
  if (before) { report.http[host.name] = r; console.log(host.name, JSON.stringify(r)); continue; }
  check(`${host.name}: 첫 화면 200 · HTML`, r.home.status === 200 && /text\/html/.test(r.home.type ?? '') && r.home.bundle, r.home);
  check(`${host.name}: ${PATH} → 302 → Storage 객체`, r.hop.status === 302 && r.hop.location === OBJECT, r.hop);
  if (r.hop.status === 302 && r.hop.location) {
    const res = await fetch(new URL(r.hop.location, host.url), { redirect: 'manual' });
    const h = crypto.createHash('sha256');
    let bytes = 0;
    for await (const chunk of res.body) { h.update(chunk); bytes += chunk.length; }
    r.file = { status: res.status, type: res.headers.get('content-type'), disposition: res.headers.get('content-disposition'), length: Number(res.headers.get('content-length')), cache: res.headers.get('cache-control'), bytes, sha256: h.digest('hex') };
    check(`${host.name}: 넘어간 곳 200 · 형식 · attachment 이름 · 크기`, r.file.status === 200 && r.file.type === 'application/vnd.microsoft.portable-executable' && r.file.disposition === `attachment; filename="${FILE}"` && r.file.length === r.file.bytes, r.file);
    check(`${host.name}: 끝까지 받은 SHA-256 = 기대값`, r.file.sha256 === expectSha, { bytes: r.file.bytes, sha256: r.file.sha256 });
  }
  report.http[host.name] = r;
}
if (!before) check('세 주소의 본 번들이 같다', new Set(HOSTS.map((h) => report.http[h.name].home.bundle)).size === 1, HOSTS.map((h) => report.http[h.name].home.bundle));

// 헤드리스 크롬 — 빈 프로필(로그인 · 쿠키 없음)
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-live-'));
const downloads = path.join(profile, 'downloads');
fs.mkdirSync(downloads);
const port = 9300 + Math.floor(Math.random() * 400);
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--no-default-browser-check', '--mute-audio', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
let target;
for (let i = 0; i < 60 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* 아직 */ } }
const ws = new globalThis.WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const wait = new Map(); const handlers = [];
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } else if (m.method) handlers.forEach((h) => h(m)); });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;

// 기록: 요청 · 내려받기. AI 서버(함수 주소)만 이 도구가 받아 /health는 «정상»으로 답하고 나머지는 막는다.
const log = { requests: [], begins: [], progress: new Map(), fn: [] };
handlers.push(async (m) => {
  if (m.method === 'Network.requestWillBeSent') log.requests.push(m.params.request.url);
  if (m.method === 'Page.downloadWillBegin' || m.method === 'Browser.downloadWillBegin') log.begins.push({ url: m.params.url, name: m.params.suggestedFilename, guid: m.params.guid });
  if (m.method === 'Page.downloadProgress' || m.method === 'Browser.downloadProgress') log.progress.set(m.params.guid, m.params);
  if (m.method === 'Fetch.requestPaused') {
    const url = m.params.request.url;
    log.fn.push(url);
    if (/\/health$/.test(url)) {
      const body = Buffer.from(JSON.stringify({ ok: true, openaiReachable: true })).toString('base64');
      await send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: 'content-type', value: 'application/json' }, { name: 'access-control-allow-origin', value: '*' }], body });
    } else await send('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'BlockedByClient' });
  }
});
await send('Network.enable');
await send('Page.enable');
await send('Fetch.enable', { patterns: [{ urlPattern: 'https://*.cloudfunctions.net/*' }, { urlPattern: 'https://*.run.app/*' }] });
await send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: downloads, eventsEnabled: true });

const setSize = async (s) => {
  await send('Emulation.setDeviceMetricsOverride', { width: s.w, height: s.h, deviceScaleFactor: s.s, mobile: !!s.mobile });
  await send('Emulation.setTouchEmulationEnabled', { enabled: !!s.mobile, maxTouchPoints: s.mobile ? 5 : 0 });
};
const open = async (url) => {
  await send('Page.navigate', { url: url + '/' });
  await evaluate(`new Promise((r) => { const t = setInterval(() => { if (document.body?.classList.contains('app-ready') && !document.getElementById('splash')) { clearInterval(t); r(); } }, 100); setTimeout(() => { clearInterval(t); r(); }, 20000); })`);
  await evaluate(`document.fonts.ready`);
  // 전/후를 같은 순간으로 맞춘다(download-button-probe.mjs와 같은 방법): 그림을 다 풀고 반복 애니메이션을 0초에 세운다
  await evaluate(`Promise.all([...document.images].map((i) => i.decode().catch(() => {})))`);
  await sleep(700);
  await evaluate(`(document.getAnimations().forEach((a) => { a.pause(); a.currentTime = 0; }), new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))`);
  await sleep(300);
  return evaluate(`({ ready: document.body.classList.contains('app-ready'), step: document.body.dataset.step, links: document.querySelectorAll('.download-link').length, privacy: !!document.querySelector('.privacy-link') })`);
};
const shot = async (file) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(out, file), Buffer.from(r.result.data, 'base64')); };
const linkRect = () => evaluate(`(() => { const e = document.querySelector('.download-link'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom, innerWidth }; })()`);
const readPng = async (file) => { const img = await loadImage(file); const c = createCanvas(img.width, img.height); const x = c.getContext('2d'); x.drawImage(img, 0, 0); return { w: img.width, h: img.height, data: x.getImageData(0, 0, img.width, img.height).data }; };

const main = HOSTS[0];
for (const s of SIZES) {
  await setSize(s);
  const state = await open(main.url);
  await shot(`${main.name}-${s.name}.png`);
  report.browser[`${main.name}-${s.name}`] = { state };
  if (before) {
    for (let t = 2; t <= TRIES; t++) { await open(main.url); await shot(`${main.name}-${s.name}-${t}.png`); }
    continue;
  }
  check(`${main.name} ${s.name}: 앱이 뜨고 단추가 하나`, state.ready && state.step === '1' && state.links === 1 && state.privacy, state);
  // ④ 전/후 화소 — 단추 상자(+2px) 밖 차이 0
  const m = await linkRect();
  const pres = [`${main.name}-${s.name}.png`, ...Array.from({ length: TRIES - 1 }, (_, t) => `${main.name}-${s.name}-${t + 2}.png`)].map((n) => path.join(compareDir ?? '', n)).filter((p) => compareDir && fs.existsSync(p));
  if (compareDir) {
    const A = await Promise.all(pres.map(readPng));
    let best = null;
    for (let t = 1; t <= TRIES && !(best?.outside === 0); t++) {
      if (t > 1) { await open(main.url); await shot(`${main.name}-${s.name}.png`); }
      const B = await readPng(path.join(out, `${main.name}-${s.name}.png`));
      const k = B.w / m.innerWidth, pad = 2;
      const box = [Math.floor((m.x - pad) * k), Math.floor((m.y - pad) * k), Math.ceil((m.r + pad) * k), Math.ceil((m.b + pad) * k)];
      for (const [pi, P] of A.entries()) {
        if (P.w !== B.w || P.h !== B.h) continue;
        let outside = 0, inside = 0;
        for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) {
          const i = (y * B.w + x) * 4;
          if (P.data[i] === B.data[i] && P.data[i + 1] === B.data[i + 1] && P.data[i + 2] === B.data[i + 2]) continue;
          if (x >= box[0] && x < box[2] && y >= box[1] && y < box[3]) inside += 1; else outside += 1;
        }
        if (!best || outside < best.outside) best = { size: [B.w, B.h], afterTry: t, beforeShot: path.basename(pres[pi]), outside, inside, buttonBox: box };
      }
    }
    report.browser[`${main.name}-${s.name}`].pixels = best;
    check(`${main.name} ${s.name}: 전/후 화소 — 단추 밖 차이 0`, pres.length > 0 && best && best.outside === 0 && best.inside > 0, best ?? pres);
  }
  // ③ 누르기 전 0건 → 눌러서 끝까지 받기
  log.requests.length = 0; log.begins.length = 0; log.progress.clear();
  const count = () => ({ requests: log.requests.filter((u) => SETUP.test(u)).length, begins: log.begins.length });
  const steps = [];
  await open(main.url); steps.push(['접속', count()]);
  await send('Page.reload', { ignoreCache: true }); await sleep(4000); steps.push(['새로고침', count()]);
  await evaluate(`document.getElementById('prepareNextBtn').click()`); await sleep(1200);
  const onStep2 = await evaluate(`({ step: document.body.dataset.step, link: !!document.querySelector('.download-link') })`);
  steps.push(['2단계로 감', count()]);
  await evaluate(`document.querySelectorAll('.stepper button')[0].click()`); await sleep(1000); steps.push(['1단계로 돌아옴', count()]);
  const pre = count();
  check(`${main.name} ${s.name}: 2단계에는 단추가 없다`, onStep2.step === '2' && !onStep2.link, onStep2);
  check(`${main.name} ${s.name}: 누르기 전 설치 파일 요청 0건(접속 · 새로고침 · 화면 전환)`, pre.requests === 0 && pre.begins === 0, steps);
  const r = await linkRect();
  const x = r.x + r.w / 2, y = r.y + r.h / 2;
  if (s.mobile) {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }
  let done = null;
  for (let i = 0; i < 1200 && !done; i++) { await sleep(500); done = [...log.progress.values()].find((p) => p.state === 'completed' || p.state === 'canceled') ?? null; }
  const begin = log.begins[0] ?? null;
  const file = done && done.state === 'completed' ? path.join(downloads, done.guid) : null;
  const got = file && fs.existsSync(file) ? { bytes: fs.statSync(file).size, sha256: await sha256(file) } : null;
  const after = await evaluate(`({ step: document.body.dataset.step, path: location.pathname, host: location.host })`);
  report.browser[`${main.name}-${s.name}`].download = { steps, begin, state: done?.state ?? null, got, after, setupRequests: log.requests.filter((u) => SETUP.test(u)) };
  check(`${main.name} ${s.name}: 단추를 누르면 내려받기가 시작돼 끝까지 받아진다(저장 이름 ${FILE})`, begin && begin.name === FILE && new URL(begin.url).pathname === PATH && done?.state === 'completed', { begin, state: done?.state });
  check(`${main.name} ${s.name}: 받은 파일 SHA-256 = 기대값`, got && got.sha256 === expectSha, got);
  check(`${main.name} ${s.name}: 누른 뒤에도 첫 화면 그대로`, after.step === '1' && after.path === '/', after);
  if (file) fs.rmSync(file, { force: true });
}

// ② 보조 주소 첫 화면
if (!before) {
  await setSize(SIZES[0]);
  for (const host of HOSTS.slice(1)) {
    const state = await open(host.url);
    await shot(`${host.name}-${SIZES[0].name}.png`);
    report.browser[`${host.name}-${SIZES[0].name}`] = { state };
    check(`${host.name} ${SIZES[0].name}: 앱이 뜨고 단추가 하나`, state.ready && state.step === '1' && state.links === 1 && state.privacy, state);
  }
  check('함수 주소로 나간 것은 AI 서버 확인뿐(이 도구가 대신 답함 — 실제로 나간 것 0)', log.fn.every((u) => /\/health$/.test(u)), [...new Set(log.fn)]);
}

ws.close(); chrome.kill();
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
if (before) { console.log(`배포 전 첫 화면을 찍었다(${SIZES.length}크기 × ${TRIES}번) — ${out}`); process.exit(0); }
const failed = report.checks.filter((c) => !c.ok);
console.log(failed.length ? `걸림 ${failed.length}건 / ${report.checks.length}` : `모두 통과 ${report.checks.length}건`);
process.exit(failed.length ? 1 : 0);
