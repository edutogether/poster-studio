/* 휴대폰 화면 배치 점검(2026-10-17 Bumm님: «요즘 애들은 다 핸드폰으로 본다. 모바일판 배열이 엉망인 것 손봐야 한다»).

     node scripts/verify/mobile-layout-probe.mjs <dist 폴더> <결과 폴더> [--sizes 360x780,390x844,430x932] [--scale 3] [--desktop] [--real]

   샘플 모드 빌드(dist)를 127.0.0.1의 작은 정적 서버로 열고, 휴대폰 흉내(터치·모바일 화면)로 샘플 모드 흐름을 끝까지 누른다.
   화면: 1단계(혼자·같이) · 2단계(혼자·같이) · 로딩 · 3단계(완성 알림 · 고르기) · 포스터 크게 보기 · 개인정보 안내.
   화면마다 지금 보이는 화면(<크기>-<화면>-view.png)과 전체 페이지(<크기>-<화면>.png)를 원본 해상도로 찍고 잰다:
   ① 가로 넘침(문서 폭 > 화면 폭) ② 화면 밖으로 나간 요소(잘라 주는 부모가 없는 것)
   ③ 서로 겹치는 단추·입력칸(모달이 떠 있으면 그 안의 것만) ④ 높이 40px 미만 단추·입력칸(손가락으로 누르기 어려움)
   ⑤ 넘쳐서 잘린 글자(넘침 숨김 + 내용이 더 큼) ⑥ 맨 아래 단추가 문서 끝에서 12px 안(화면 끝에 붙음)
   ⑦ 단계에 막 도착한 화면이 맨 위가 아닌 곳에서 시작(1단계는 끝까지 내린 뒤 «다음»을 누른다 — 사람이 그렇게 한다)
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
// --desktop: 터치·휴대폰 흉내 없이 PC 브라우저로 같은 흐름을 찍는다 — 휴대폰 규칙이 PC 화면을 바꾸지 않았는지 대조할 때
const desktop = args.includes('--desktop');
// --real: 실제 모드 빌드(VITE_SAMPLE_MODE=0)를 가짜 카메라(dist/studio/camera-student.webp — 이미 공개된 지어낸 인물)로 찍고,
// 서버 요청(https)은 페이지 안에서 흉내 낸 응답으로 돌려준다 — 네트워크로는 한 건도 나가지 않는다(https 차단도 그대로).
const real = args.includes('--real');
const sizes = opt('--sizes', '360x780,390x844,430x932').split(',').map((s) => { const [w, h] = s.split('x').map(Number); return { w, h }; });
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
  const ff = spawnSync('ffmpeg', ['-v', 'error', '-y', '-loop', '1', '-i', art, '-t', '3', '-r', '15', '-pix_fmt', 'yuv420p', '-vf', 'scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720', y4m]);
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
  } else {
    await call('Page.addScriptToEvaluateOnNewDocument', { source: "if(navigator.mediaDevices){navigator.mediaDevices.getUserMedia=async()=>{throw Error('확인 중 카메라 차단');};}window.print=()=>{};" });
  }
  if (!desktop) await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

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
    const tips = document.querySelector('#cameraView:not([hidden]) .camera-tips');
    return { overflowX, offscreen: offscreen.slice(0, 20), overlaps, small, endTight, clipped: clipped.slice(0, 20), height: document.documentElement.scrollHeight, vh: innerHeight, tipsBottom: tips ? Math.round(tips.getBoundingClientRect().bottom) : null, scrollY: Math.round(scrollY), focus: document.activeElement && document.activeElement !== document.body ? name(document.activeElement) : 'body' };
  })()`;
  // fit: 휴대폰 3단계는 스크롤 없이 한 화면(팀장 설계 ⑬). tips: 휴대폰 2단계 도착 화면에 안내 1~3이 잘리지 않는다(⑤).
  const shot = async (tag, screen, { arrival = false, fit = false, tips = false } = {}) => {
    await delay(400);
    const m = await evaluate(MEASURE);
    m.arrivalScroll = arrival && m.scrollY > 0 ? m.scrollY : 0;
    m.notFit = fit && m.height > m.vh + 1 ? m.height - m.vh : 0;
    m.tipsCut = tips && m.tipsBottom !== null && m.tipsBottom > m.vh ? m.tipsBottom - m.vh : 0;
    const v = await call('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(out, `${tag}-${screen}-view.png`), Buffer.from(v.data, 'base64'));
    const metrics = await call('Page.getLayoutMetrics');
    const h = Math.ceil(metrics.cssContentSize.height);
    const s = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: metrics.cssLayoutViewport.clientWidth, height: Math.min(h, 12000), scale: 1 } });
    await fs.writeFile(path.join(out, `${tag}-${screen}.png`), Buffer.from(s.data, 'base64'));
    report.push({ size: tag, screen, ...m });
    const bad = m.overflowX > 0 || m.offscreen.length || m.overlaps.length || m.small.length || m.endTight !== null || m.clipped.length || m.arrivalScroll || m.notFit || m.tipsCut;
    console.log(`${tag} ${screen}: 높이 ${m.height} · 가로 넘침 ${m.overflowX} · 화면 밖 ${m.offscreen.length} · 겹침 ${m.overlaps.length} · 작은 단추 ${m.small.length} · 잘린 글자 ${m.clipped.length}${m.endTight !== null ? ` · 맨 아래 단추가 끝에서 ${m.endTight}px` : ''}${m.arrivalScroll ? ` · 도착 때 ${m.arrivalScroll}px 내려간 채 시작` : ''}${m.notFit ? ` · 한 화면보다 ${m.notFit}px 김` : ''}${m.tipsCut ? ` · 안내 1~3이 ${m.tipsCut}px 잘림` : ''}${bad ? '  ← 확인' : ''}`);
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
    await shot(tag, '2-step2-group', { arrival: true, tips: !desktop });
    await evaluate(`document.querySelector('.camera-actions .back-button').click() || true`);
    await waitFor('!document.getElementById("prepareNextBtn").closest("[hidden]")');
    await evaluate(`document.querySelector('[data-mode="solo"]').click() || true`);
    await evaluate('scrollTo(0, document.scrollingElement.scrollHeight); document.getElementById("prepareNextBtn").click() || true');
    if (!await waitFor('!document.getElementById("cameraView").hidden')) { fail(tag, '2단계(혼자)'); continue; }
    await shot(tag, '2-step2-solo', { arrival: true, tips: !desktop });
    // 휴대폰: 빨간 원형 단추(⑥) — 샘플 모드는 «오늘 촬영할 영화»와 단추 줄까지 내려간다(⑦). 단추가 없는 옛 빌드(대조용 «전»)는 이 화면만 건너뛴다.
    if (!desktop && await evaluate(`!!document.getElementById('phoneShotBtn')`)) {
      await evaluate(`document.getElementById('phoneShotBtn').click() || true`);
      // 실제 모드: 카메라를 켜고 3·2·1 뒤 찍힌다 — «이 사진으로 만들기»가 나올 때까지 기다린다
      if (real && !await waitFor('!document.getElementById("generateBtn").hidden', 20000)) { fail(tag, '실제 모드 촬영'); continue; }
      await delay(900);
      await shot(tag, '2-step2-after-shot');
    } else if (real) {
      await evaluate('document.getElementById("shotBtn").click() || true');
      if (!await waitFor('!document.getElementById("generateBtn").hidden', 20000)) { fail(tag, '실제 모드 촬영'); continue; }
    }
    await evaluate(real ? 'document.getElementById("generateBtn").click() || true' : 'document.getElementById("shotBtn").click() || true');
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
const issues = report.filter((r) => r.overflowX > 0 || r.offscreen.length || r.overlaps.length || r.small.length || r.endTight !== null || r.clipped.length || r.arrivalScroll || r.notFit || r.tipsCut).length;
console.log(issues ? `걸린 화면 ${issues}개 / ${report.length}` : `통과 — ${report.length}개 화면 모두 결함 없음`);
process.exit(issues ? 1 : 0);
