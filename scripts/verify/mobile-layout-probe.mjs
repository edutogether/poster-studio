/* 휴대폰 화면 배치 점검(2026-10-17 Bumm님: «요즘 애들은 다 핸드폰으로 본다. 모바일판 배열이 엉망인 것 손봐야 한다»).

     node scripts/verify/mobile-layout-probe.mjs <dist 폴더> <결과 폴더> [--sizes 360x640,390x664,430x740,360x780,390x844,430x932] [--scale 3] [--desktop] [--real] [--device iphone|galaxy]
   기본 크기의 앞 셋은 실제 브라우저 높이(주소창 · 아래 막대를 뺀 높이 — 아이폰 사파리 390×664 등), 뒤 셋은 화면 전체 높이다.
   10/19까지는 뒤 셋만 재서, 아이폰 사파리에서 2단계 단추가 61px 잘린 것을 못 잡았다(10/20 Bumm님 캡처).

   샘플 모드 빌드(dist)를 127.0.0.1의 작은 정적 서버로 열고, 휴대폰 흉내(터치·모바일 화면)로 샘플 모드 흐름을 끝까지 누른다.
   화면: 1단계(혼자·같이) · 2단계(혼자·같이) · 로딩 · 3단계(완성 알림 · 고르기) · 포스터 크게 보기 · 개인정보 안내.
   화면마다 지금 보이는 화면(<크기>-<화면>-view.png)과 전체 페이지(<크기>-<화면>.png)를 원본 해상도로 찍고 잰다:
   ① 가로 넘침(문서 폭 > 화면 폭) ② 화면 밖으로 나간 요소(잘라 주는 부모가 없는 것)
   ③ 서로 겹치는 단추·입력칸(모달이 떠 있으면 그 안의 것만) ④ 높이 40px 미만 단추·입력칸(손가락으로 누르기 어려움)
   ⑤ 넘쳐서 잘린 글자(넘침 숨김 + 내용이 더 큼) ⑥ 맨 아래 단추가 문서 끝에서 12px 안(화면 끝에 붙음)
   ⑦ 단계에 막 도착한 화면이 맨 위가 아닌 곳에서 시작(1단계는 끝까지 내린 뒤 «다음»을 누른다 — 사람이 그렇게 한다)
   휴대폰만: 2단계 도착 화면에 원형 촬영 단추 · 안내 1~3 · 회색 칸 끝 빨간 단추(«샘플 포스터 보기» / «3초 뒤 사진 찍기»)가 다 보인다
   (못 찾으면 그것도 걸림) · 3단계가 스크롤 없이 한 화면
   (2026-10-18 · 10-19 Bumm님 휴대폰 검토). 3단계 큰 포스터 위 화살표는 일부러 포스터에 걸친 것이라 겹침으로 세지 않는다.
   전체 페이지 캡처에는 화면 위에 숨겨 둔 고정 요소(바로가기 링크 등)가 비쳐 보일 수 있다 — 사람이 보는 화면은 -view.png다.
   --desktop은 터치·휴대폰 흉내 없이 같은 흐름을 찍는다(휴대폰 규칙이 PC 화면을 바꾸지 않았는지 대조용, 판정은 휴대폰 기준이라 참고만).
   결과는 <결과 폴더>/report.json. 하나라도 걸리면 종료코드 1, 화면을 하나라도 못 찍으면(흐름이 막힘) 종료코드 2.
   카메라·인쇄·https 요청은 막는다 — 생성·과금은 없다. */
import fs from 'node:fs/promises';
import fss from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const positional = args.filter((a, i) => !a.startsWith('--') && !['--sizes', '--scale'].includes(args[i - 1]));
const [distArg, outArg] = positional;
if (!distArg || !outArg) { console.error('사용: node scripts/verify/mobile-layout-probe.mjs <dist 폴더> <결과 폴더> [--sizes …] [--scale 3]'); process.exit(2); }
const dist = path.resolve(distArg), out = path.resolve(outArg);
if (!fss.existsSync(path.join(dist, 'index.html'))) { console.error(`dist에 index.html이 없다: ${dist}`); process.exit(2); }
const scale = Number(opt('--scale', '3'));
// --device iphone|galaxy: 그 기기의 브라우저 이름표(UA)로 연다 — 저장 방식(아이폰 공유 · 갤럭시 내려받기) · 카카오 탈출처럼 UA로 갈리는 곳까지 같은 갈래로 그린다
const UAS = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  galaxy: 'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
};
const device = opt('--device', null);
if (device && !UAS[device]) { console.error('--device는 iphone 또는 galaxy'); process.exit(2); }
// --desktop: 터치·휴대폰 흉내 없이 PC 브라우저로 같은 흐름을 찍는다 — 휴대폰 규칙이 PC 화면을 바꾸지 않았는지 대조할 때
const desktop = args.includes('--desktop');
// --real: 진짜 촬영 흐름(«both» 판의 원형 단추, 또는 `npx vite build --mode check-real`로 만든 «real» 판)을 가짜 카메라(dist/studio/camera-student.webp — 이미 공개된 지어낸 인물)로 찍고,
// 서버 요청(https)은 페이지 안에서 흉내 낸 응답으로 돌려준다 — 네트워크로는 한 건도 나가지 않는다(https 차단도 그대로).
// 휴대폰 흉내에서는 가짜 카메라도 세로(960×1280, 3:4)다 — 휴대폰은 실제로 세로로 찍힌다(10/20 저녁 Bumm님). PC(--desktop)는 가로.
// 카메라가 켜진 화면(3·2·1 동안)과 찍은 뒤 화면에서 사진 · 영상이 칸에 좌우 · 위아래 띠(레터박스) 없이 차는지, 단추 줄 아래가 비지 않는지도 잰다.
// 10/20 밤(팀장 대조 다섯 가지): 장면은 «숫자 3 · 2 · 1(countdown) · 찍은 뒤(완료 표시가 사라진 뒤) · 켠 화면(다시 찍기 뒤 — live)» 셋이고,
// 칸이 세로 3:4인지 · 칸 안 표시가 구도 선과 겹치는지 · 원형 단추가 칸에 걸치는지 · «촬영 완료»가 둘 이상인지 · 찍은 뒤 제목이 보이는지 ·
// 흰 단추 줄 양쪽 여백이 같은지(2px 넘게 다르면) · 단추가 화면 밖인지까지 잰다.
const real = args.includes('--real');
const sizes = opt('--sizes', '360x640,390x664,430x740,360x780,390x844,430x932').split(',').map((s) => { const [w, h] = s.split('x').map(Number); return { w, h }; });
await fs.mkdir(out, { recursive: true });

// 정적 서버 — 127.0.0.1에만 묶고, dist 밖으로 나가는 경로는 막는다.
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webm': 'video/webm', '.txt': 'text/plain' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.resolve(dist, '.' + (p.endsWith('/') ? p + 'index.html' : p));
  if (!file.startsWith(dist + path.sep) || !fss.existsSync(file) || fss.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fss.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'mobile-probe-'));
const art = path.join(dist, 'studio', 'camera-student.webp');
const cameraFlags = [];
if (real) {
  const y4m = path.join(profile, 'cam.y4m');
  const [cw, ch] = desktop ? [1280, 720] : [960, 1280];
  const ff = spawnSync('ffmpeg', ['-v', 'error', '-y', '-loop', '1', '-i', art, '-t', '3', '-r', '15', '-pix_fmt', 'yuv420p', '-vf', `scale=${cw}:${ch}:force_original_aspect_ratio=increase,crop=${cw}:${ch}`, y4m]);
  if (ff.status !== 0) { console.error('가짜 카메라 영상을 못 만들었다: ' + ff.stderr); process.exit(2); }
  cameraFlags.push('--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`);
}
const port = 9562;
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--no-default-browser-check', '--mute-audio', ...cameraFlags, `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const delay = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));
let socket, seq = 0;
const pending = new Map();
const report = [];
let blocked = false;
try {
  let target;
  for (let i = 0; i < 50; i++) { try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); if (target) break; } catch {} await delay(100); }
  if (!target) throw Error('브라우저를 못 띄움');
  socket = new globalThis.WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { socket.onopen = r; socket.onerror = j; });
  socket.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result); } };
  const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expression) => { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result.value; };
  const waitFor = async (expr, ms = 15000) => { for (let i = 0; i < ms / 100; i++) { if (await evaluate(expr).catch(() => false)) return true; await delay(100); } return false; };
  await call('Network.enable');
  await call('Network.setBlockedURLs', { urls: ['https://*'] });
  await call('Page.enable');
  if (real) {
    // 생성(/generate)은 4초 뒤 그림 한 장(가짜 카메라와 같은 그림)으로, 나머지(/health)는 정상으로 답한다 — 로딩 화면을 찍을 시간을 둔다.
    const image = 'data:image/webp;base64,' + (await fs.readFile(art)).toString('base64');
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const net = window.fetch.bind(window); window.fetch = async (input, init) => {
      const url = String((input && input.url) || input);
      if (!/^https:/.test(url)) return net(input, init);
      if (/\\/generate/.test(url)) { await new Promise((r) => setTimeout(r, 4000)); return new Response(JSON.stringify({ images: [${JSON.stringify(image)}] }), { status: 200, headers: { 'content-type': 'application/json' } }); }
      return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } });
    }; window.print = () => {}; })();` });
    // 휴대폰은 세로로 들면 요청한 가로 · 세로를 바꿔 세로 화면을 준다(앱은 1280×960을 요청 → 960×1280). 크롬 가짜 카메라는 요청에 맞춰 잘라 내므로
    // 휴대폰 흉내에서는 요청의 가로 · 세로를 바꿔 넘긴다 — 바꾸지 않으면 960×960 정사각형이 와서 실제 휴대폰과 다른 화면을 잰다.
    if (!desktop) await call('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const md = navigator.mediaDevices; if (!md) return; const gum = md.getUserMedia.bind(md);
      md.getUserMedia = (c) => { const v = c && c.video; return gum(v && typeof v === 'object' && v.width && v.height ? { ...c, video: { ...v, width: v.height, height: v.width } } : c); }; })();` });
  } else {
    await call('Page.addScriptToEvaluateOnNewDocument', { source: "if(navigator.mediaDevices){navigator.mediaDevices.getUserMedia=async()=>{throw Error('확인 중 카메라 차단');};}window.print=()=>{};" });
  }
  if (!desktop) await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  if (device) await call('Emulation.setUserAgentOverride', { userAgent: UAS[device] });

  // 화면 하나를 재고 전체 페이지를 찍는다.
  const MEASURE = `(() => {
    const W = innerWidth, sx = scrollX, sy = scrollY;
    const vis = (el) => el.checkVisibility ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : el.getClientRects().length > 0;
    const name = (el) => { const t = (el.getAttribute('aria-label') || el.textContent || el.placeholder || '').trim().replace(/\\s+/g, ' ').slice(0, 24); return (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/)[0] : '')) + (t ? ' «' + t + '»' : ''); };
    const clipsX = (el) => { for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) { const s = getComputedStyle(a); if (/(hidden|clip|auto|scroll)/.test(s.overflowX)) { const r = a.getBoundingClientRect(); if (r.left >= -1 && r.right <= W + 1) return true; } } return false; };
    const overflowX = document.documentElement.scrollWidth - W;
    const offscreen = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (!vis(el)) continue; const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
      if ((r.right > W + 1 || r.left < -1) && !clipsX(el) && getComputedStyle(el).position !== 'fixed') offscreen.push(name(el) + ' ' + Math.round(r.left) + '~' + Math.round(r.right));
    }
    // 모달 창이 열려 있으면 바깥은 누를 수 없다(inert) — 창 안의 것끼리만 잰다
    const modal = document.querySelector('dialog:modal');
    // 화면에 고정된 요소가 화면 밖에 숨어 있으면(바로가기 링크의 top: -100px 등) 누를 수 없다 — 셈하지 않는다
    const fixedOff = (el) => { for (let x = el; x && x !== document.body; x = x.parentElement) if (getComputedStyle(x).position === 'fixed') { const r = el.getBoundingClientRect(); return r.bottom <= 0 || r.top >= innerHeight; } return false; };
    const inter = [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button]')].filter((el) => vis(el) && getComputedStyle(el).pointerEvents !== 'none' && !el.closest('dialog:not([open])') && (!modal || modal.contains(el)) && !fixedOff(el));
    const rects = inter.map((el) => { const r = el.getBoundingClientRect(); return { el, x: r.left + sx, y: r.top + sy, w: r.width, h: r.height }; }).filter((r) => r.w > 0 && r.h > 0);
    const overlaps = [];
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j]; if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      // 3단계 넘김 화살표는 포스터 줄 가장자리에 일부러 얹었다(10/19 «양쪽에 화살표») — 그 짝만 뺀다
      const arrowOnSlide = (x, y) => x.el.classList.contains('carousel-arrow') && y.el.classList.contains('poster-slide');
      if (arrowOnSlide(a, b) || arrowOnSlide(b, a)) continue;
      const ow = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oh = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ow > 2 && oh > 2) overlaps.push(name(a.el) + ' ↔ ' + name(b.el) + ' ' + Math.round(ow) + '×' + Math.round(oh));
    }
    const small = rects.filter((r) => r.h < 40 && !(r.el.tagName === 'A' && r.el.closest('p, li'))).map((r) => name(r.el) + ' ' + Math.round(r.w) + '×' + Math.round(r.h));
    // 맨 아래 단추와 문서 끝 사이 여백 — 12px 미만이면 화면 끝(아이폰 홈 표시줄)에 붙는다(모달이 떠 있으면 그 뒤라 셈하지 않는다)
    const lastBottom = Math.max(0, ...rects.map((r) => r.y + r.h)), endGap = Math.round(document.documentElement.scrollHeight - lastBottom);
    const endTight = !modal && rects.length && endGap < 12 ? endGap : null;
    const clipped = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (!vis(el) || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      const s = getComputedStyle(el);
      const hides = /(hidden|clip)/.test(s.overflowX + s.overflowY) || s.textOverflow === 'ellipsis';
      if (hides && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)) clipped.push(name(el) + ' ' + el.scrollWidth + '/' + el.clientWidth + '×' + el.scrollHeight + '/' + el.clientHeight);
    }
    // 휴대폰 2단계 원형 촬영 단추 아래 끝(보이는 단추가 없으면 null)
    const sb = document.querySelector('#cameraView:not([hidden]) #phoneShotBtn');
    const shotBottom = sb && vis(sb) ? Math.round(sb.getBoundingClientRect().bottom) : null;
    // 안내 1~3: 보이는 목록이 없으면 null — 숨긴 목록의 아래 끝(0)을 재고 늘 통과하던 빈 검사였다(10/18 발견)
    const tips = document.querySelector('#cameraView:not([hidden]) .camera-tips');
    const tipsBottom = tips && vis(tips) && tips.getBoundingClientRect().height > 0 ? Math.round(tips.getBoundingClientRect().bottom) : null;
    // 2단계 회색 칸 끝의 빨간 단추(보이는 것) — 10/19 Bumm님 «첫 화면에서 잘림»
    const dk = [...document.querySelectorAll('#cameraView:not([hidden]) .camera-actions .primary-button')].find((b) => !b.hidden && vis(b));
    const dockBottom = dk ? Math.round(dk.getBoundingClientRect().bottom) : null;
    // 카메라 칸의 띠: 보이는 #video · #snapshot의 그려진 그림이 칸보다 좁거나(좌우 띠) 낮은(위아래 띠) 만큼(px). 칸이 없으면 null.
    const media = [...document.querySelectorAll('#cameraView:not([hidden]) #video, #cameraView:not([hidden]) #snapshot')].find((el) => vis(el) && !el.classList.contains('hidden'));
    let camGap = null;
    if (media) {
      const nw = media.videoWidth || media.naturalWidth, nh = media.videoHeight || media.naturalHeight, r = media.getBoundingClientRect();
      const fit = getComputedStyle(media).objectFit, k = fit === 'cover' ? Math.max(r.width / nw, r.height / nh) : Math.min(r.width / nw, r.height / nh);
      camGap = nw && nh ? { x: Math.max(0, Math.round(r.width - nw * k)), y: Math.max(0, Math.round(r.height - nh * k)), box: Math.round(r.width) + '×' + Math.round(r.height), src: nw + '×' + nh, fit } : null;
    }
    // 카메라 칸 정리(10/20 밤): 칸 비율 · 칸 안 표시와 구도 선 겹침 · 원형 단추가 칸에 걸침 · «촬영 완료» 개수 · 찍은 뒤 제목 · 단추 줄 양쪽 여백
    const box = document.querySelector('#cameraView:not([hidden]) .cameraBox');
    const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
    let camBox = null;
    if (box && vis(box)) {
      const br = box.getBoundingClientRect();
      const guides = [...box.querySelectorAll('.camera-guides i')].filter(vis).map((g) => g.getBoundingClientRect());
      const marks = [...box.querySelectorAll('.camera-live-indicator, .captured-badge, .camera-ready-notice, button')].filter((m) => vis(m) && !m.closest('.hidden'));
      const overGuide = marks.filter((m) => guides.some((g) => hit(m.getBoundingClientRect(), g))).map(name);
      const sb2 = document.getElementById('phoneShotBtn');
      const shotOver = sb2 && vis(sb2) && !sb2.hidden ? Math.max(0, Math.round(br.bottom - sb2.getBoundingClientRect().top)) : null;
      const done = [...document.querySelectorAll('#cameraView:not([hidden]) *')].filter((e) => vis(e) && [...e.childNodes].some((n) => n.nodeType === 3 && /촬영 완료/.test(n.textContent))).length;
      const head = document.querySelector('#cameraView:not([hidden]) .page-heading');
      const btns = [...document.querySelectorAll('#cameraView:not([hidden]) .camera-actions > button')].filter((b) => !b.hidden && vis(b)).map((b) => b.getBoundingClientRect());
      const dockL = btns.length ? Math.round(Math.min(...btns.map((b) => b.left))) : null, dockR = btns.length ? Math.round(innerWidth - Math.max(...btns.map((b) => b.right))) : null;
      camBox = { ratio: +(br.width / br.height).toFixed(3), w: Math.round(br.width), h: Math.round(br.height), overGuide, shotOver, done, heading: !!(head && vis(head) && head.getBoundingClientRect().height > 0), dockL, dockR };
    }
    // 단추 줄 아래 빈 곳: 문서가 한 화면을 넘지 않을 때, 보이는 단추 줄(.camera-actions) 아래 끝에서 화면 끝까지(px)
    const ca = document.querySelector('#cameraView:not([hidden]) .camera-actions');
    const blankBelow = ca && vis(ca) && document.documentElement.scrollHeight <= innerHeight + 1 ? Math.round(innerHeight - ca.getBoundingClientRect().bottom) : null;
    return { overflowX, offscreen: offscreen.slice(0, 20), overlaps, small, endTight, clipped: clipped.slice(0, 20), height: document.documentElement.scrollHeight, vh: innerHeight, shotBottom, tipsBottom, dockBottom, camGap, blankBelow, camBox, scrollY: Math.round(scrollY), focus: document.activeElement && document.activeElement !== document.body ? name(document.activeElement) : 'body' };
  })()`;
  // fit: 휴대폰 3단계는 스크롤 없이 한 화면(팀장 설계 ⑬).
  // shotInView · tips: 휴대폰 2단계 도착 화면에 원형 촬영 단추 · 안내 1~3이 다 보인다(⑤ · ⑥) — 못 찾으면 걸린다(빈 검사가 되지 않게).
  // cam: 휴대폰 카메라 화면(켜진 화면 · 찍은 뒤) — 칸에 띠가 없고(2px 넘으면 걸림) 단추 줄 아래가 비지 않는다(2px 넘으면). dock: 빨간 단추가 첫 화면 안
  const shot = async (tag, screen, { arrival = false, fit = false, shotInView = false, tips = false, cam = false, dock = false } = {}) => {
    await delay(400);
    const m = await evaluate(MEASURE);
    m.arrivalScroll = arrival && m.scrollY > 0 ? m.scrollY : 0;
    m.notFit = fit && m.height > m.vh + 1 ? m.height - m.vh : 0;
    m.shotCut = shotInView ? (m.shotBottom === null ? '없음' : Math.max(0, m.shotBottom - m.vh)) : 0;
    m.tipsCut = tips ? (m.tipsBottom === null ? '없음' : Math.max(0, m.tipsBottom - m.vh)) : 0;
    m.dockCut = tips || dock ? (m.dockBottom === null ? '없음' : Math.max(0, m.dockBottom - m.vh)) : 0;
    m.camBand = cam ? (m.camGap === null ? '없음' : (m.camGap.x > 2 || m.camGap.y > 2 ? `좌우 ${m.camGap.x} · 위아래 ${m.camGap.y}px (칸 ${m.camGap.box} · 그림 ${m.camGap.src} · ${m.camGap.fit})` : 0)) : 0;
    m.blank = cam && m.blankBelow !== null && m.blankBelow > 2 ? m.blankBelow : 0;
    // 휴대폰 카메라 화면 정리(10/20 밤) — 하나라도 어긋나면 걸린다
    const cb = m.camBox, tidy = [];
    if (cam && cb) {
      if (Math.abs(cb.ratio - 0.75) > 0.01) tidy.push(`칸 비율 ${cb.w}×${cb.h}(3:4 아님)`);
      if (cb.overGuide.length) tidy.push(`구도 선과 겹침: ${cb.overGuide.join(', ')}`);
      if (cb.shotOver) tidy.push(`원형 단추가 칸에 ${cb.shotOver}px 걸침`);
      if (cb.done > (screen.endsWith('after-shot') ? 0 : 1)) tidy.push(`«촬영 완료» ${cb.done}개`);
      if (screen.endsWith('after-shot') && cb.heading) tidy.push('찍은 뒤 제목이 보임');
      if (cb.dockL !== null && (Math.abs(cb.dockL - cb.dockR) > 2 || cb.dockR < 8)) tidy.push(`단추 줄 여백 왼쪽 ${cb.dockL} · 오른쪽 ${cb.dockR}`);
    } else if (cam) tidy.push('카메라 칸을 못 찾음');
    m.camTidy = tidy.length ? tidy.join(' / ') : 0;
    const v = await call('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(out, `${tag}-${screen}-view.png`), Buffer.from(v.data, 'base64'));
    const metrics = await call('Page.getLayoutMetrics');
    const h = Math.ceil(metrics.cssContentSize.height);
    const s = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: metrics.cssLayoutViewport.clientWidth, height: Math.min(h, 12000), scale: 1 } });
    await fs.writeFile(path.join(out, `${tag}-${screen}.png`), Buffer.from(s.data, 'base64'));
    report.push({ size: tag, screen, ...m });
    const bad = m.overflowX > 0 || m.offscreen.length || m.overlaps.length || m.small.length || m.endTight !== null || m.clipped.length || m.arrivalScroll || m.notFit || m.shotCut || m.tipsCut || m.dockCut || m.camBand || m.blank || m.camTidy;
    console.log(`${tag} ${screen}: 높이 ${m.height} · 가로 넘침 ${m.overflowX} · 화면 밖 ${m.offscreen.length} · 겹침 ${m.overlaps.length} · 작은 단추 ${m.small.length} · 잘린 글자 ${m.clipped.length}${m.endTight !== null ? ` · 맨 아래 단추가 끝에서 ${m.endTight}px` : ''}${m.arrivalScroll ? ` · 도착 때 ${m.arrivalScroll}px 내려간 채 시작` : ''}${m.notFit ? ` · 한 화면보다 ${m.notFit}px 김` : ''}${m.tipsCut ? (typeof m.tipsCut === 'number' ? ` · 안내 1~3이 ${m.tipsCut}px 잘림` : ' · 안내 1~3을 못 찾음') : ''}${m.dockCut ? (typeof m.dockCut === 'number' ? ` · 빨간 단추가 ${m.dockCut}px 잘림` : ' · 빨간 단추를 못 찾음') : ''}${m.shotCut ? (typeof m.shotCut === 'number' ? ` · 원형 촬영 단추가 ${m.shotCut}px 잘림` : ' · 원형 촬영 단추를 못 찾음') : ''}${m.camBand ? ` · 카메라 칸 띠 ${m.camBand}` : ''}${m.blank ? ` · 단추 줄 아래 ${m.blank}px 빔` : ''}${m.camTidy ? ` · ${m.camTidy}` : ''}${m.camBox && cam ? ` · 칸 ${m.camBox.w}×${m.camBox.h}` : ''}${bad ? '  ← 확인' : ''}`);
  };
  const fail = (tag, what) => { blocked = true; console.error(`${tag}: ${what}에서 흐름이 막힘`); };

  for (const { w, h } of sizes) {
    const tag = `${w}x${h}@${scale}`;
    await call('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: scale, mobile: !desktop });
    await call('Page.navigate', { url: base });
    if (!await waitFor('!!document.getElementById("prepareNextBtn") && !document.getElementById("splash")', 20000)) { fail(tag, '스플래시'); continue; }
    await evaluate('document.fonts.ready.then(() => true)');
    await shot(tag, '1-step1-solo');
    if (!desktop) {   // 휴대폰: 극장 사진(첫 페이지)을 누르면 둘째 페이지로 넘어간다(②)
      await evaluate(`document.querySelector('.preview-panel').click() || true`);
      await delay(900);
      await shot(tag, '1-step1-page2');
    }
    await evaluate(`document.querySelector('[data-mode="group"]').click() || true`);
    await shot(tag, '1-step1-group');
    await evaluate('scrollTo(0, document.scrollingElement.scrollHeight); document.getElementById("prepareNextBtn").click() || true');
    if (!await waitFor('!document.getElementById("cameraView").hidden')) { fail(tag, '2단계(같이)'); continue; }
    await shot(tag, '2-step2-group', { arrival: true, shotInView: !desktop, tips: !desktop });
    // 1단계로 돌아가기 — 휴대폰 2단계에는 «이전» 단추가 없어(10/18) 위 단계 표시의 «영화 준비»를 누른다(사람도 그렇게 한다)
    await evaluate(`document.querySelector('.stepper li:first-child button').click() || true`);
    await waitFor('!document.getElementById("prepareNextBtn").closest("[hidden]")');
    await evaluate(`document.querySelector('[data-mode="solo"]').click() || true`);
    await evaluate('scrollTo(0, document.scrollingElement.scrollHeight); document.getElementById("prepareNextBtn").click() || true');
    if (!await waitFor('!document.getElementById("cameraView").hidden')) { fail(tag, '2단계(혼자)'); continue; }
    await shot(tag, '2-step2-solo', { arrival: true, shotInView: !desktop, tips: !desktop });
    // 촬영 단추: 휴대폰은 빨간 원형 단추(⑥), PC와 원형 단추가 없는 옛 빌드(대조용 «전»)는 «3초 뒤 사진 찍기» / «샘플 포스터 보기».
    // 샘플만인 판은 원형 단추가 곧 샘플 포스터 로딩이다(10/18). 두 단추 판(10/20)은 원형 단추가 진짜 촬영이라,
    // 샘플 흐름은 아래 «샘플 포스터 보기»(#shotBtn)로 간다 — 원형 단추를 누르면 카메라를 막은 이 확인에서는 로딩이 오지 않는다.
    const phoneBtn = !desktop && await evaluate(`(() => { const b = document.getElementById('phoneShotBtn'); return !!b && (${real} || b.getAttribute('aria-label') === '샘플 포스터 보기'); })()`);
    await evaluate(`document.getElementById('${phoneBtn ? 'phoneShotBtn' : 'shotBtn'}').click() || true`);
    if (real) {
      // 실제 모드: 카메라를 켜고 3·2·1 뒤 찍힌다 — 켜진 화면(숫자 동안)을 재고, «이 사진으로 만들기»가 나올 때까지 기다렸다가 그 화면을 재고 누른다
      if (!await waitFor('(() => { const v = document.getElementById("video"); return !!v && !v.classList.contains("hidden") && v.videoWidth > 0; })()', 15000)) { fail(tag, '카메라 켜짐'); continue; }
      await shot(tag, '2-step2-countdown', { cam: !desktop, shotInView: !desktop, dock: !desktop });   // 숫자 3 · 2 · 1 동안
      if (!await waitFor('!document.getElementById("generateBtn").hidden', 20000)) { fail(tag, '실제 모드 촬영'); continue; }
      await shot(tag, '2-step2-shot-moment', { cam: !desktop, dock: !desktop });   // 찍은 순간 — «촬영 완료»는 하나만
      // 찍은 뒤: «촬영 완료» 표시가 사라진 뒤(2.4초)의 모습
      if (!await waitFor('!document.querySelector(".captured-badge, .camera-capture-notice")', 6000)) { fail(tag, '촬영 완료 표시가 사라지지 않음'); continue; }
      await delay(300);
      await shot(tag, '2-step2-after-shot', { cam: !desktop, dock: !desktop });
      // 켠 화면(숫자 없이 기다리는 모습): «다시 찍기» → 카메라가 다시 켜진 뒤 → 다시 찍고 생성으로
      await evaluate('document.getElementById("retakeBtn").click() || true');
      if (!await waitFor('(() => { const v = document.getElementById("video"); return !!v && !v.classList.contains("hidden") && v.videoWidth > 0 && document.getElementById("countdown").classList.contains("hidden"); })()', 15000)) { fail(tag, '다시 찍기 뒤 카메라'); continue; }
      await delay(2000);
      await shot(tag, '2-step2-live', { cam: !desktop, shotInView: !desktop, dock: !desktop });
      await evaluate(`document.getElementById('${phoneBtn ? 'phoneShotBtn' : 'shotBtn'}').click() || true`);
      if (!await waitFor('!document.getElementById("generateBtn").hidden', 20000)) { fail(tag, '다시 찍기'); continue; }
      await evaluate('document.getElementById("generateBtn").click() || true');
    }
    if (!await waitFor('!!document.querySelector(".generation-wait, [class*=generation-wait]")', 10000)) { fail(tag, '로딩 화면'); continue; }
    await delay(1500);
    await shot(tag, '3-loading');
    if (!await waitFor('!document.getElementById("resultView").hidden', 70000)) { fail(tag, '3단계'); continue; }
    await shot(tag, '4-step3-notice', { arrival: true, fit: !desktop });
    await delay(3500);
    await shot(tag, '5-step3', { fit: !desktop });
    const opened = await evaluate(`(() => { const d = document.querySelector('.poster-dialog'); const b = [...document.querySelectorAll('#resultView button')].find((x) => x.getAttribute('aria-label') && /크게/.test(x.getAttribute('aria-label'))); if (!b) return false; b.click(); return !!(d && d.open); })()`);
    if (opened) { await shot(tag, '6-poster-dialog'); await evaluate(`document.querySelector('.poster-dialog').close() || true`); } else console.log(`${tag}: 포스터 크게 보기 단추를 못 찾음(건너뜀)`);
    await call('Page.navigate', { url: base + 'privacy.html' });
    await waitFor('document.readyState === "complete"');
    await shot(tag, '7-privacy');
  }
} finally {
  try { socket?.close(); } catch {}
  chrome.kill(); server.close();
  await delay(500); await fs.rm(profile, { recursive: true, force: true }).catch(() => {});
}
await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
if (blocked || !report.length) process.exit(2);
const issues = report.filter((r) => r.overflowX > 0 || r.offscreen.length || r.overlaps.length || r.small.length || r.endTight !== null || r.clipped.length || r.arrivalScroll || r.notFit || r.shotCut || r.tipsCut || r.dockCut || r.camBand || r.blank).length;
console.log(issues ? `걸린 화면 ${issues}개 / ${report.length}` : `통과 — ${report.length}개 화면 모두 결함 없음`);
process.exit(issues ? 1 : 0);
