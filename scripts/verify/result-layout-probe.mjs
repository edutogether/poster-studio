/* 포스터 고르기 화면(3단계)의 배치를 화면 크기마다 재고 판정한다(2026-10-14 Bumm님: «이전»·«이 포스터로 출력하기»가
   화면 아래에 잘리고, «이전»이 작고 연하다).

     node scripts/verify/result-layout-probe.mjs [주소] [결과 폴더] [--sizes 2560x1440,1920x1080,1366x768]

   샘플 모드 흐름(다음 → 샘플 포스터 보기)으로 3단계까지 간다. 로딩 화면 40초는 이 확인과 상관이 없어
   페이지의 setTimeout 가운데 2초 이상인 것만 20ms로 줄인다(화면 배치는 시간과 무관하다). 카메라·인쇄·https는 막는다.
   3단계에 닿으면 창 크기만 바꿔 가며 잰다 — 크기마다 흐름을 다시 돌지 않는다.

   판정(하나라도 어긋나면 종료코드 1)
   ① 두 단추가 화면 안에 다 보이고, 아래에 BOTTOM_GAP 이상 여백이 남는다 ② 오른쪽 작업 칸에 세로 스크롤이 생기지 않는다
   ③ «이전»과 «이 포스터로 출력하기»의 높이가 같다 ④ 단추 줄의 왼쪽·오른쪽 끝이 포스터 카드 격자의 왼쪽·오른쪽 끝과 같다(±2px)
   ⑤ «이전» 글씨가 진하다(밝기 ≤ 80) · 굵다(≥ 600)
   사진 촬영 화면(2단계)도 같은 기준으로 먼저 잰다(10/14 팀장 지시 «같은 문제라 같은 기준»): 두 단추 높이 같음 · «이전» 진하고 굵음 ·
   단추 줄 왼쪽·오른쪽 끝 = 바로 위 «오늘 촬영할 영화» 카드의 왼쪽·오른쪽 끝 · 단추 아래 여백. 캡처는 step2-<크기>.png.
   캡처는 원본 해상도 PNG(<크기>.png)와 잰 값(<크기>.json)으로 남긴다. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--sizes');
const url = positional[0] || 'http://127.0.0.1:5500/';
const out = path.resolve(positional[1] || '.cache/result-layout-probe');
const sizes = opt('--sizes', '2560x1440,1920x1080,1366x768').split(',').map((s) => s.split('x').map(Number));
const BOTTOM_GAP = 16;
await fs.mkdir(out, { recursive: true });

const port = 9541;
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--mute-audio', `--remote-debugging-port=${port}`, `--user-data-dir=${out}/chrome`, '--window-size=1920,1080', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const delay = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));
let socket, seq = 0, failed = 0;
const pending = new Map();
try {
  let target;
  for (let i = 0; i < 50; i++) { try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); if (target) break; } catch {} await delay(100); }
  assert.ok(target, '브라우저 시작');
  socket = new globalThis.WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { socket.onopen = r; socket.onerror = j; });
  const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  socket.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result); } };
  const evaluate = async (expression) => { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); assert.ok(!r.exceptionDetails, JSON.stringify(r.exceptionDetails)); return r.result.value; };
  await call('Network.enable');
  await call('Network.setBlockedURLs', { urls: ['https://*'] });
  await call('Page.enable');
  await call('Page.addScriptToEvaluateOnNewDocument', { source: "if(navigator.mediaDevices){navigator.mediaDevices.getUserMedia=async()=>{throw Error('배치 확인 중 카메라 차단');};}window.print=()=>{throw Error('배치 확인 중 인쇄 차단');};{const st=window.setTimeout;window.setTimeout=(f,ms,...a)=>st(f,ms>=2000?20:ms,...a);}" });
  const [W0, H0] = sizes[0];
  await call('Emulation.setDeviceMetricsOverride', { width: W0, height: H0, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url });
  for (let i = 0; i < 150; i++) { if (await evaluate('!!document.getElementById("shotBtn") && !document.getElementById("splash")')) break; await delay(100); }
  await evaluate('document.fonts.ready.then(() => true)');
  await evaluate("document.getElementById('prepareNextBtn').click()");
  await delay(400);
  const report2 = [];
  for (const [W, H] of sizes) {
    await call('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    await delay(500);
    const m = await evaluate(`(() => {
      const r = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.left), w: Math.round(b.width), h: Math.round(b.height), right: Math.round(b.right), bottom: Math.round(b.bottom) }; };
      const back = document.querySelector('#cameraView .camera-actions .back-button');
      const shot = document.getElementById('shotBtn');
      const card = document.querySelector('#cameraView .camera-film-card');
      const cs = getComputedStyle(back); const rgb = cs.color.match(/\\d+/g).map(Number);
      return { back: r(back), shot: r(shot), card: r(card), backLum: Math.round(0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]), backWeight: Number(cs.fontWeight), vh: innerHeight };
    })()`);
    const shot2 = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await fs.writeFile(path.join(out, `step2-${W}x${H}.png`), Buffer.from(shot2.data, 'base64'));
    const checks = {
      '2단계 두 단추 높이 같음': m.back.h === m.shot.h,
      '2단계 «이전» 진하고 굵음': m.backLum <= 80 && m.backWeight >= 600,
      '2단계 왼쪽 = 카드 왼쪽': Math.abs(m.back.x - m.card.x) <= 2,
      '2단계 오른쪽 = 카드 오른쪽': Math.abs(m.shot.right - m.card.right) <= 2,
      '2단계 단추 아래 여백': H - Math.max(m.back.bottom, m.shot.bottom) >= BOTTOM_GAP,
    };
    const bad = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);
    failed += bad.length;
    await fs.writeFile(path.join(out, `step2-${W}x${H}.json`), JSON.stringify({ ...m, checks }, null, 1));
    report2.push({ 크기: `${W}x${H}`, 이전: `${m.back.w}x${m.back.h}`, 촬영단추: `${m.shot.w}x${m.shot.h}`, 왼쪽차: m.back.x - m.card.x, 오른쪽차: m.shot.right - m.card.right, 아래여백: H - Math.max(m.back.bottom, m.shot.bottom), 이전글씨: `${m.backLum}/${m.backWeight}`, 실패: bad.join(', ') || '없음' });
  }
  console.table(report2);
  await evaluate("document.getElementById('shotBtn').click()");
  for (let i = 0; i < 300; i++) { if (await evaluate("document.body.dataset.step === '3' && !(document.getElementById('spinner')||{}).open")) break; await delay(100); }
  assert.equal(await evaluate('document.body.dataset.step'), '3', '포스터 고르기로 넘어가야 한다');
  await delay(600);
  const report = [];
  for (const [W, H] of sizes) {
    await call('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    await delay(500);
    const m = await evaluate(`(() => {
      const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), right: Math.round(b.right), bottom: Math.round(b.bottom) }; };
      const ws = document.getElementById('resultWorkspace');
      const back = document.querySelector('#resultView .result-actions .back-button');
      const cs = getComputedStyle(back);
      const rgb = cs.color.match(/\\d+/g).map(Number);
      const imgs = [...document.querySelectorAll('#gallery .style-image')].map(r);
      return {
        viewport: { w: innerWidth, h: innerHeight },
        h1: r(document.querySelector('#resultView .page-heading h1')),
        desc: r(document.querySelector('#resultView .page-heading p')),
        gallery: r(document.getElementById('gallery')),
        cardLeft: Math.min(...imgs.map((b) => b.x)), cardRight: Math.max(...imgs.map((b) => b.right)), cardW: imgs[0].w, cardH: imgs[0].h,
        captionBottom: r([...document.querySelectorAll('#gallery .style-caption')].at(-1)).bottom,
        back: r(back), print: r(document.getElementById('printBtn')),
        backColor: rgb, backLum: Math.round(0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]), backWeight: Number(cs.fontWeight), backFontSize: cs.fontSize,
        wsScroll: ws.scrollHeight - ws.clientHeight, docScroll: document.documentElement.scrollHeight - innerHeight,
        // 작업 칸을 넘치게 하는 것(스크롤이 생길 때 원인을 바로 보려고): 작업 칸 안쪽 아래 끝보다 아래로 나간 요소
        overflowers: [...ws.querySelectorAll('*')].filter((el) => el.getBoundingClientRect().bottom > ws.getBoundingClientRect().top + ws.clientHeight - parseFloat(getComputedStyle(ws).paddingBottom) + 0.5)
          .slice(0, 8).map((el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').join('.') : '') + ':' + Math.round(el.getBoundingClientRect().bottom)),
        wsBox: { top: Math.round(ws.getBoundingClientRect().top), clientH: ws.clientHeight, scrollH: ws.scrollHeight },
      };
    })()`);
    const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await fs.writeFile(path.join(out, `${W}x${H}.png`), Buffer.from(shot.data, 'base64'));
    const checks = {
      '단추 아래 여백': H - Math.max(m.back.bottom, m.print.bottom) >= BOTTOM_GAP,
      '작업 칸 스크롤 없음': m.wsScroll <= 0 && m.docScroll <= 0,
      '두 단추 높이 같음': m.back.h === m.print.h,
      '단추 줄 왼쪽 = 카드 왼쪽': Math.abs(m.back.x - m.cardLeft) <= 2,
      '단추 줄 오른쪽 = 카드 오른쪽': Math.abs(m.print.right - m.cardRight) <= 2,
      '«이전» 진하고 굵음': m.backLum <= 80 && m.backWeight >= 600,
    };
    const bad = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);
    failed += bad.length;
    await fs.writeFile(path.join(out, `${W}x${H}.json`), JSON.stringify({ ...m, checks }, null, 1));
    report.push({ 크기: `${W}x${H}`, 아래여백: H - Math.max(m.back.bottom, m.print.bottom), 스크롤: Math.max(m.wsScroll, m.docScroll), 이전높이: m.back.h, 출력높이: m.print.h,
      이전너비: m.back.w, 왼쪽차: m.back.x - m.cardLeft, 오른쪽차: m.print.right - m.cardRight, 카드: `${m.cardW}x${m.cardH}`, 제목위: m.h1.y, 이전글씨: `${m.backLum}/${m.backWeight}`, 실패: bad.join(', ') || '없음' });
  }
  console.table(report);
} finally {
  try { socket?.close(); } catch {}
  chrome.kill();
}
process.exit(failed ? 1 : 0);
