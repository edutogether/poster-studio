/* 웹 첫 화면 다운로드 아이콘 확인(2026-10-27, _docs/intents/2026-10-27-download-button-deploy). 라이브 확인은 download-live.mjs.

     node scripts/verify/download-button-probe.mjs <dist 폴더> <결과 폴더> --before                 바꾸기 전 판: 첫 화면만 찍는다
     node scripts/verify/download-button-probe.mjs <dist 폴더> <결과 폴더> --compare <전 결과 폴더>  바꾼 판: 찍고 · 재고 · 전과 대조한다

   dist를 127.0.0.1의 작은 서버로 열고(설치 파일 자리 /download/PosterStudio-Setup.exe는 이 서버가 1KB 가짜 파일로 답한다 — 시험 전용),
   크롬을 헤드리스로 띄워 PC 3크기(1366×768 · 1920×1080 · 2560×1440, 1배) · 세로 태블릿(1024×1366, 2배) · 휴대폰 3크기(360×780 · 390×844 · 430×932, 3배)의
   첫 화면을 원본 해상도로 따로 찍는다(<결과 폴더>/home-<크기>.png). 바깥 주소는 하나도 나가지 않는다 — AI 서버 확인(/health)은 이 도구가
   «정상»으로 대신 답하고, 그 밖의 https는 막는다(실제 서버 요청 0건 · 생성 · 과금 없음).

   --compare일 때 재는 것(하나라도 걸리면 종료코드 1):
     ① 전/후 첫 화면 화소 대조 — 다운로드 단추 상자 밖은 차이 0화소(단추 말고는 시각적 차이가 없어야 한다)
     ② 단추가 개인정보처리방침 링크와 같은 줄 · 바로 왼쪽(간격 14px) · 다른 요소와 안 겹침 · 화면 안 · 휴대폰은 누르는 높이 44px 이상
     ③ 단추는 메뉴 없이 바로 받는 링크 하나(<a href download>, 10/27 Bumm님 A안 — 받는 것이 Poster Studio 설치판 하나뿐) ·
        글자 없이 lucide download 아이콘 · 화면 읽기용 이름(aria-label) · 툴팁 없음 · PC에서 마우스를 올리면 커서만 손가락(색 · 밑줄 그대로)
     ④ 네트워크 기록(1920×1080에서): 접속 · 새로고침 · 2단계로 갔다 돌아오기까지 설치 파일 요청 0건,
        단추를 누르면 그때 첫 요청 · 내려받기 시작
     ⑤ 첫 화면에만 있다(2단계에는 없다) */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { spawn } from 'node:child_process';
import { loadImage, createCanvas } from '@napi-rs/canvas';

const args = process.argv.slice(2);
const [dist, out] = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--compare');
const before = args.includes('--before');
const compareDir = args.includes('--compare') ? args[args.indexOf('--compare') + 1] : null;
if (!dist || !out || !fs.existsSync(path.join(dist, 'index.html')) || (!before && !compareDir)) {
  console.error('사용: download-button-probe.mjs <dist 폴더> <결과 폴더> (--before | --compare <전 결과 폴더>)');
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });
const root = path.resolve(dist);
const SIZES = [
  { name: '1366x768', w: 1366, h: 768, s: 1 }, { name: '1920x1080', w: 1920, h: 1080, s: 1 }, { name: '2560x1440', w: 2560, h: 1440, s: 1 },
  { name: '1024x1366', w: 1024, h: 1366, s: 2, touch: true },
  { name: '360x780', w: 360, h: 780, s: 3, mobile: true }, { name: '390x844', w: 390, h: 844, s: 3, mobile: true }, { name: '430x932', w: 430, h: 932, s: 3, mobile: true },
];
const SETUP = /Setup\.exe/i;
const TYPE = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4', '.svg': 'image/svg+xml' };
const fakeExe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(1022)]);
let serverExeHits = 0;
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/download/PosterStudio-Setup.exe') {
    serverExeHits += 1;
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename="PosterStudio-Setup.exe"', 'content-length': fakeExe.length });
    res.end(fakeExe);
    return;
  }
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPE[path.extname(f)] ?? 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-probe-'));
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

// 기록: 요청 · 내려받기 시작. 바깥 주소는 이 도구가 받는다 — AI 서버 확인은 «정상»으로 대신 답하고, 나머지는 막되 기록한다(바깥 설치 파일 요청도 센다).
const log = { requests: [], downloads: [], outside: [] };
handlers.push(async (m) => {
  if (m.method === 'Network.requestWillBeSent') log.requests.push(m.params.request.url);
  if (m.method === 'Page.downloadWillBegin' || m.method === 'Browser.downloadWillBegin') log.downloads.push(m.params.url);
  if (m.method === 'Fetch.requestPaused') {
    const url = m.params.request.url;
    log.outside.push(url);
    if (/\/health$/.test(url)) {
      const body = Buffer.from(JSON.stringify({ ok: true, openaiReachable: true })).toString('base64');
      await send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: 'content-type', value: 'application/json' }, { name: 'access-control-allow-origin', value: '*' }], body });
    } else {
      await send('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'BlockedByClient' });
    }
  }
});
await send('Network.enable');
await send('Page.enable');
await send('Fetch.enable', { patterns: [{ urlPattern: 'https://*' }, { urlPattern: 'http://*/*' }].filter((p) => p.urlPattern !== 'http://*/*') });
await send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: downloads, eventsEnabled: true });

const report = { mode: before ? 'before' : 'after', dist: root, sizes: {}, network: null, checks: [] };
const check = (name, ok, detail) => { report.checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? '통과' : '걸림'}  ${name}${detail === undefined ? '' : ' — ' + JSON.stringify(detail)}`); };
const setSize = async (s) => {
  await send('Emulation.setDeviceMetricsOverride', { width: s.w, height: s.h, deviceScaleFactor: s.s, mobile: !!s.mobile });
  await send('Emulation.setTouchEmulationEnabled', { enabled: !!(s.mobile || s.touch), maxTouchPoints: s.mobile || s.touch ? 5 : 0 });
};
const open = async () => {
  await send('Page.navigate', { url: `${base}/` });
  await evaluate(`new Promise((r) => { const t = setInterval(() => { if (document.body.classList.contains('app-ready') && !document.getElementById('splash')) { clearInterval(t); r(); } }, 100); setTimeout(() => { clearInterval(t); r(); }, 10000); })`);
  await evaluate(`document.fonts.ready`);
  // 전/후를 같은 순간으로 맞춘다: 그림을 다 풀고(큰 그림을 줄여 그리는 순간이 다르면 화소가 갈린다), 반복 애니메이션(휴대폰 «아래로» 화살표 등)을 0초에 세운다
  await evaluate(`Promise.all([...document.images].map((i) => i.decode().catch(() => {})))`);
  await sleep(700);
  await evaluate(`(document.getAnimations().forEach((a) => { a.pause(); a.currentTime = 0; }), new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))`);
  await sleep(300);
};
const shot = async (file) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(out, file), Buffer.from(r.result.data, 'base64')); };
const RECT = (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`;

// 같은 판을 여러 번 열면 큰 그림(장르 포스터)을 줄여 그리는 필터 차이로 화소가 1~2단계씩 갈리는 판이 섞인다(2026-10-27 실측 — 기준 판끼리 0 · 7만 화소).
// 그래서 전 판은 TRIES번 열어 다 찍어 두고, 후 판도 TRIES번까지 열어 «단추 밖 차이 0»인 짝이 하나라도 있는지 본다(가장 가까운 짝을 기록).
const TRIES = 3;
const readPng = async (file) => { const img = await loadImage(file); const c = createCanvas(img.width, img.height); const x = c.getContext('2d'); x.drawImage(img, 0, 0); return { w: img.width, h: img.height, data: x.getImageData(0, 0, img.width, img.height).data }; };
for (const s of SIZES) {
  await setSize(s);
  await open();
  await shot(`home-${s.name}.png`);
  if (before) {
    for (let t = 2; t <= TRIES; t++) { await open(); await shot(`home-${s.name}-${t}.png`); }
    continue;
  }
  const m = await evaluate(`(() => {
    const R = (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; };
    const link = document.querySelector('.download-link'), privacy = document.querySelector('.privacy-link'), box = link;
    if (!link || !privacy) return null;
    const a = R(link), p = R(privacy);
    const textOf = (e) => { const rg = document.createRange(); rg.selectNodeContents(e); const r = rg.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; };
    const at = textOf(link), pt = textOf(privacy);
    // 겹침: 화면에 보이는 다른 글자(글자 줄 상자)와 누르는 것(단추 · 링크 · 입력칸)이 단추 상자와 겹치는가.
    // 사진 · 바탕 그림과 큰 블록 상자는 세지 않는다 — 단추는 방침 링크처럼 영화관 사진 위 · 제목 줄 오른쪽 빈자리에 놓인다.
    const shown = (e) => { for (let x = e; x && x !== document.body; x = x.parentElement) { const cs = getComputedStyle(x); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return false; } return true; };
    const hit = [];
    const over = (r) => r.width && r.height && r.right > a.x && r.x < a.r && r.bottom > a.y && r.y < a.b;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const n = walker.currentNode, pe = n.parentElement;
      if (!n.textContent.trim() || box.contains(pe) || privacy.contains(pe) || !shown(pe)) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) if (over(r)) hit.push('글자 «' + n.textContent.trim().slice(0, 20) + '»');
    }
    for (const e of document.querySelectorAll('button, a, input, select, textarea')) {
      if (box.contains(e) || e === privacy || !shown(e)) continue;
      if (over(e.getBoundingClientRect())) hit.push(e.tagName + ' ' + (e.id || e.className));
    }
    return { innerWidth, link: a, text: at, privacyText: pt, gap: pt.x - at.r, sameLine: Math.abs((at.y + at.h / 2) - (pt.y + pt.h / 2)), font: [getComputedStyle(link).fontSize, getComputedStyle(privacy).fontSize], color: [getComputedStyle(link).color, getComputedStyle(privacy).color], hit, inView: a.x >= 0 && a.r <= innerWidth && a.y >= 0,
      kind: { tag: link.tagName, href: link.getAttribute('href'), download: link.getAttribute('download'), text: link.textContent, label: link.getAttribute('aria-label'), icon: link.querySelectorAll('svg path').length,
        title: link.hasAttribute('title') || !!link.querySelector('title'), menu: !!document.querySelector('[role="menu"]') || link.hasAttribute('aria-haspopup') } };
  })()`);
  report.sizes[s.name] = { measure: m };
  check(`${s.name}: 방침 링크 바로 왼쪽 · 같은 줄 · 같은 글자 크기 · 같은 색`, m && Math.abs(m.gap - 14) <= 1 && m.sameLine <= 1 && m.font[0] === m.font[1] && m.color[0] === m.color[1], m && { gap: Math.round(m.gap * 10) / 10, sameLine: m.sameLine, font: m.font, color: m.color });
  check(`${s.name}: 다른 요소와 안 겹침 · 화면 안`, m && m.hit.length === 0 && m.inView, m && { hit: m.hit, inView: m.inView });
  if (s.mobile) check(`${s.name}: 누르는 높이 44px 이상`, m && m.link.h >= 44, m && Math.round(m.link.h));
  check(`${s.name}: 메뉴 없이 바로 받는 링크 하나(<a href download>) · 글자 없이 아이콘 · 화면 읽기용 이름 · 툴팁 없음`, m && m.kind.tag === 'A' && m.kind.href === '/download/PosterStudio-Setup.exe' && m.kind.download === 'PosterStudio-Setup.exe'
    && m.kind.text === '' && m.kind.icon === 3 && m.kind.label === 'Poster Studio 설치 파일 다운로드' && !m.kind.title && !m.kind.menu, m && m.kind);

  // 전/후 화소 대조 — 단추 상자(단추 + 2px) 밖은 같아야 한다. 화면 화소 = CSS px × (캡처 폭 ÷ innerWidth) — 휴대폰은 기준 폭(390)을 실제 폭에 맞춰 줄이고 키운다.
  const pres = [`home-${s.name}.png`, ...Array.from({ length: TRIES - 1 }, (_, t) => `home-${s.name}-${t + 2}.png`)].map((n) => path.join(compareDir, n)).filter((p) => fs.existsSync(p));
  if (pres.length && m) {
    const before = await Promise.all(pres.map(readPng));
    let best = null;
    for (let t = 1; t <= TRIES && !(best?.outside === 0); t++) {
      if (t > 1) { await open(); await shot(`home-${s.name}.png`); }
      const B = await readPng(path.join(out, `home-${s.name}.png`));
      const k = B.w / m.innerWidth, pad = 2;
      const box = [Math.floor((m.link.x - pad) * k), Math.floor((m.link.y - pad) * k), Math.ceil((m.link.r + pad) * k), Math.ceil((m.link.b + pad) * k)];
      for (const [pi, A] of before.entries()) {
        if (A.w !== B.w || A.h !== B.h) continue;
        let outside = 0, inside = 0;
        for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) {
          const i = (y * B.w + x) * 4;
          if (A.data[i] === B.data[i] && A.data[i + 1] === B.data[i + 1] && A.data[i + 2] === B.data[i + 2]) continue;
          if (x >= box[0] && x < box[2] && y >= box[1] && y < box[3]) inside += 1; else outside += 1;
        }
        if (!best || outside < best.outside) best = { size: [B.w, B.h], afterTry: t, beforeShot: path.basename(pres[pi]), outsideButton: outside, insideButton: inside, buttonBox: box, outside };
      }
    }
    report.sizes[s.name].pixels = best;
    check(`${s.name}: 전/후 화소 — 단추 밖 차이 0`, best && best.outside === 0 && best.insideButton > 0, best);
  } else check(`${s.name}: 전 화면 캡처가 있다`, false, compareDir);
  // 마우스를 올렸을 때(PC): 커서만 손가락 — 색 · 밑줄은 그대로, 툴팁 없음(10/27 Bumm님)
  if (m && !s.mobile && !s.touch) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: m.link.x + m.link.w / 2, y: m.link.y + m.link.h / 2 });
    await sleep(200);
    const hv = await evaluate(`(() => { const l = document.querySelector('.download-link'); const cs = getComputedStyle(l); return { hover: l.matches(':hover'), color: cs.color, deco: cs.textDecorationLine, cursor: cs.cursor }; })()`);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 });
    report.sizes[s.name].hover = hv;
    check(`${s.name}: 마우스를 올리면 커서만 손가락(색 · 밑줄 그대로)`, hv.hover && hv.color === m.color[0] && hv.deco === 'none' && hv.cursor === 'pointer', hv);
  }
}

if (!before) {
  // 네트워크 기록: 누르기 전 0건 → 누른 뒤 시작
  await setSize(SIZES[1]);
  log.requests.length = 0; log.downloads.length = 0; log.outside.length = 0; serverExeHits = 0;
  const count = () => ({ requests: log.requests.filter((u) => SETUP.test(u)).length, downloads: log.downloads.length, server: serverExeHits, outsideSetup: log.outside.filter((u) => SETUP.test(u)).length });
  const steps = [];
  await open(); steps.push(['접속', count()]);
  await send('Page.reload', { ignoreCache: true }); await sleep(3500); steps.push(['새로고침', count()]);
  await evaluate(`document.getElementById('prepareNextBtn').click()`); await sleep(1200);
  const onStep2 = await evaluate(`({ step: document.body.dataset.step, button: !!document.querySelector('.download-link') })`);
  check('첫 화면에만 — 2단계에는 단추가 없다', onStep2.step === '2' && !onStep2.button, onStep2);
  steps.push(['2단계로 감', count()]);
  await evaluate(`document.querySelectorAll('.stepper button')[0].click()`); await sleep(800); steps.push(['1단계로 돌아옴', count()]);
  const beforeClick = count();
  check('누르기 전 설치 파일 요청 0건(접속 · 새로고침 · 화면 전환)', beforeClick.requests === 0 && beforeClick.downloads === 0 && beforeClick.server === 0 && beforeClick.outsideSetup === 0, steps);
  // 사람이 누르는 것처럼 실제 마우스로 누른다
  const press = async (sel) => {
    const r = await evaluate(RECT(sel));
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x + r.w / 2, y: r.y + r.h / 2, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x + r.w / 2, y: r.y + r.h / 2, button: 'left', clickCount: 1 });
  };
  await press('.download-link'); await sleep(2000);
  const afterPs = count(); steps.push(['단추 누름', afterPs]);
  // 같은 주소 내려받기는 브라우저가 맡아 페이지 네트워크 기록에는 안 남는다 — 서버가 받은 요청과 «내려받기 시작» 알림으로 잰다
  check('단추를 누르면 그때 요청 · 내려받기가 시작된다(메뉴 없이 한 번에)', afterPs.server === 1 && afterPs.downloads >= 1, afterPs);
  check('누른 뒤에도 첫 화면 그대로(다른 페이지로 넘어가지 않음)', await evaluate(`document.body.dataset.step === '1' && location.pathname === '/'`));
  report.network = { steps, requests: log.requests.filter((u) => SETUP.test(u)), downloads: log.downloads, outside: log.outside };
  check('바깥 주소 요청은 AI 서버 확인뿐(이 도구가 대신 답함 — 실제로 나간 것 0)', log.outside.every((u) => /\/health$/.test(u)), log.outside);
}

ws.close(); chrome.kill(); server.close();
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
if (before) { console.log(`전 화면을 찍었다(${SIZES.length}크기 × ${TRIES}번) — ${out}`); process.exit(0); }
const failed = report.checks.filter((c) => !c.ok);
console.log(failed.length ? `걸림 ${failed.length}건 / ${report.checks.length}` : `모두 통과 ${report.checks.length}건`);
process.exit(failed.length ? 1 : 0);
