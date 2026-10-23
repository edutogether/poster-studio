#!/usr/bin/env node
/* 라이브 한 바퀴 캡처(2026-10-23 팀장 «결정판에 지금 라이브 그대로») — 휴대폰 390×844(3배) · PC 2560×1440 · 태블릿 가로 1366×1024 · 세로 1024×1366(2배)으로
   처음부터 저장까지 찍는다.

     node scripts/verify/live-walkthrough.mjs <주소> <결과 폴더> [--device phone|pc|tablet-l|tablet-p] [--art 그림 파일]

   파일 이름은 «순서-화면-기기.png»(원본 해상도). 진짜 촬영 흐름을 가짜 카메라(라이브의 /studio/camera-student.webp — 이미 공개된 지어낸 인물)로 지나고,
   생성(/generate)은 페이지 안에서 같은 그림 한 장으로 답한다 — 네트워크로는 나가지 않는다(막아 두고, 생성 요청이 하나라도 잡히면 종료코드 2).
   --art: 생성 답으로 쓸 그림(기본은 카메라 그림 — 가로 3:2라 실제 AI 그림(세로 2:3)과 비율이 다르다. 포스터 배치를 볼 때는 세로 2:3 그림을 준다, 10/23).
   /health는 무료라 그대로 받는다(화면에 «AI 서버 연결» 경고가 뜨지 않게). 아이폰 «내 휴대폰에 저장»은 공유 창이 열렸다 닫힌 것으로 흉내 낸다.
   태블릿은 아이패드 사파리 그대로(맥 이름표 + 손가락 입력) — 흐름은 PC와 같다(칸 안 «카메라 켜기» · 썸네일 · «출력하기»). 세로는 카메라도 세로. */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const [url, outArg] = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--device' && args[i - 1] !== '--art');
const artFile = opt('--art', null);
const artData = artFile ? `data:image/${/.png$/i.test(artFile) ? 'png' : 'jpeg'};base64,${(await fs.readFile(artFile)).toString('base64')}` : null;
if (!url || !outArg) { console.error('사용법: node scripts/verify/live-walkthrough.mjs <주소> <결과 폴더> [--device phone|pc|tablet-l|tablet-p]'); process.exit(2); }
const DEVICES = {
  phone: { tag: '휴대폰', metrics: { width: 390, height: 844, deviceScaleFactor: 3, mobile: true }, portrait: true,
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' },
  pc: { tag: 'PC2560', metrics: { width: 2560, height: 1440, deviceScaleFactor: 1, mobile: false } },
  'tablet-l': { tag: '태블릿가로', metrics: { width: 1366, height: 1024, deviceScaleFactor: 2, mobile: true },
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15' },
  'tablet-p': { tag: '태블릿세로', metrics: { width: 1024, height: 1366, deviceScaleFactor: 2, mobile: true }, portrait: true,
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15' },
};
const device = opt('--device', 'phone');
const dev = DEVICES[device];
if (!dev) { console.error(`기기는 ${Object.keys(DEVICES).join(' · ')} 중 하나`); process.exit(2); }
const phone = device === 'phone';
const tagDev = dev.tag;
const out = path.resolve(outArg);
await fs.mkdir(out, { recursive: true });
const base = url.replace(/\/?$/, '/');
const delay = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));

// 가짜 카메라: 라이브의 공개 예시 인물 그림 → y4m(휴대폰 · 태블릿 세로는 세로 960×1280, PC · 태블릿 가로는 가로 1280×720)
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'walk-'));
const art = path.join(profile, 'art.webp'), y4m = path.join(profile, 'cam.y4m');
await fs.writeFile(art, Buffer.from(await (await fetch(base + 'studio/camera-student.webp')).arrayBuffer()));
const [cw, ch] = dev.portrait ? [960, 1280] : [1280, 720];
const ff = spawnSync('ffmpeg', ['-v', 'error', '-y', '-loop', '1', '-i', art, '-t', '3', '-r', '15', '-pix_fmt', 'yuv420p', '-vf', `scale=${cw}:${ch}:force_original_aspect_ratio=increase,crop=${cw}:${ch}`, y4m]);
if (ff.status !== 0) { console.error('가짜 카메라 영상을 못 만들었다: ' + ff.stderr); process.exit(2); }

const port = 9564;
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--mute-audio', '--autoplay-policy=no-user-gesture-required',
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`,
  `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(profile, 'chrome')}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const generateSeen = [];
const made = [];
let code = 0;
try {
  let target;
  for (let i = 0; i < 80 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch { /* 아직 */ } if (!target) await delay(100); }
  if (!target) throw new Error('크롬에 붙지 못했다');
  const ws = new globalThis.WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let seq = 0; const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.method === 'Network.requestWillBeSent' && /\/generate/.test(m.params.request.url)) generateSeen.push(m.params.request.url);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const call = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expression) => { const m = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (m.result?.exceptionDetails) throw new Error(JSON.stringify(m.result.exceptionDetails).slice(0, 300)); return m.result?.result?.value; };
  const waitFor = async (expr, ms = 15000) => { for (let i = 0; i < ms / 100; i++) { if (await evaluate(expr).catch(() => false)) return true; await delay(100); } return false; };
  const must = async (expr, what, ms) => { if (!await waitFor(expr, ms)) throw new Error(`${what}에서 막힘`); };
  const shot = async (name) => {
    await delay(350);
    const s = await call('Page.captureScreenshot', { format: 'png' });
    const file = path.join(out, `${name}-${tagDev}.png`);
    await fs.writeFile(file, Buffer.from(s.result.data, 'base64'));
    made.push(path.basename(file));
  };
  const click = (sel) => evaluate(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b) throw Error('없음: ${sel.replace(/'/g, '')}'); b.click(); return true; })()`);
  const videoOn = '(() => { const v = document.getElementById("video"); return !!v && !v.classList.contains("hidden") && v.videoWidth > 0; })()';

  await call('Network.enable');
  await call('Network.setBlockedURLs', { urls: ['*cloudfunctions.net*/generate*'] });
  await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride', dev.metrics);
  if (dev.ua) {
    await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await call('Emulation.setUserAgentOverride', { userAgent: dev.ua });
  }
  // 생성은 페이지 안에서 같은 그림으로 답한다(4초) · 인쇄 창은 열지 않는다(«인쇄 끝»만 알림) · 휴대폰은 세로 카메라 · 아이폰 공유 창은 열렸다 닫힌 것으로
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    const net = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const u = String((input && input.url) || input);
      if (!/\\/generate/.test(u)) return net(input, init);
      await new Promise((r) => setTimeout(r, 4000));
      const given = ${JSON.stringify(artData)};
      const data = given || await (async () => { const b = await (await net('/studio/camera-student.webp')).blob(); return new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); }); })();
      return new Response(JSON.stringify({ images: [data] }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    // 인쇄 창은 열지 않되, 실제 브라우저처럼 «인쇄 끝»을 알린다 — 안 알리면 인쇄용 그림이 화면에 남아 스크롤 막대가 생긴다(10/23)
    window.print = () => { setTimeout(() => window.dispatchEvent(new Event('afterprint')), 0); };
    ${dev.portrait ? `const md = navigator.mediaDevices; const gum = md.getUserMedia.bind(md);
    md.getUserMedia = (c) => { const v = c && c.video; return gum(v && typeof v === 'object' && v.width && v.height ? { ...c, video: { ...v, width: v.height, height: v.width } } : c); };` : ''}
    ${phone ? 'navigator.canShare = () => true; navigator.share = async () => {};' : ''}
  })();` });

  await call('Page.navigate', { url: base });
  await must('!!document.getElementById("prepareNextBtn") && !document.getElementById("splash")', '첫 화면', 20000);
  await evaluate('document.fonts.ready.then(() => true)'); await delay(1200);
  await shot('01-첫페이지');
  if (phone) { await click('.preview-panel'); await delay(1200); }
  await shot('02-1단계');
  // 2단계 찍기 전 — 단체 먼저 찍고 개인으로 돌아온다
  await evaluate(`document.querySelector('[data-mode="group"]').click() || true`);
  await evaluate('scrollTo(0, document.scrollingElement.scrollHeight); true'); await click('#prepareNextBtn');
  await must('!document.getElementById("cameraView").hidden', '2단계(단체)'); await delay(2200);
  await shot('04-2단계-찍기전-단체');
  await click('.stepper li:first-child button');
  await must('!document.getElementById("prepareNextBtn").closest("[hidden]")', '1단계로 돌아가기');
  await evaluate(`document.querySelector('[data-mode="solo"]').click() || true`);
  await evaluate('scrollTo(0, document.scrollingElement.scrollHeight); true'); await click('#prepareNextBtn');
  await must('!document.getElementById("cameraView").hidden', '2단계(개인)'); await delay(2200);
  await shot('03-2단계-찍기전-개인');
  // 카메라: 휴대폰은 원형 단추(켜고 3초 뒤 찍음), PC는 칸 안 «카메라 켜기» → «3초 뒤 사진 찍기»
  if (phone) {
    await click('#phoneShotBtn');
    await must(videoOn, '카메라 켜짐'); await delay(400);
    await shot('05-2단계-켠뒤-숫자');
  } else {
    await click('#startBtn');
    await must(videoOn, '카메라 켜짐'); await delay(2400);
    await shot('05-2단계-켠뒤');
    await click('#shotBtn'); await delay(700);
    await shot('06-2단계-숫자');
  }
  await must('!document.getElementById("generateBtn").hidden', '촬영', 20000);
  await must('!document.querySelector(".captured-badge, .camera-capture-notice")', '촬영 완료 표시 사라짐', 6000);
  await shot(phone ? '06-2단계-찍은뒤' : '07-2단계-찍은뒤');
  if (phone) {
    // 켠 화면(기다리는 모습): «다시 찍기» 뒤 — 그다음 아래 줄 «3초 뒤 사진 찍기»로 다시 찍는다
    await click('#retakeBtn');
    await must(`${videoOn} && document.getElementById("countdown").classList.contains("hidden")`, '다시 찍기 뒤 카메라'); await delay(2400);
    await shot('07-2단계-켠뒤');
    await click('#shotBtn');
    await must('!document.getElementById("generateBtn").hidden', '다시 찍기', 20000);
    await must('!document.querySelector(".captured-badge, .camera-capture-notice")', '촬영 완료 표시 사라짐', 6000);
  }
  await click('#generateBtn');
  await must('!!document.getElementById("spinner")?.open', '로딩'); await delay(1800);
  await shot('08-로딩');
  await must('!document.getElementById("resultView").hidden', '3단계', 90000); await delay(3800);
  await shot('09-3단계');
  const n = await evaluate("document.querySelectorAll('#gallery .thumb').length");
  for (let i = 0; i < n; i++) {
    const name = await evaluate(`(() => { const t = document.querySelectorAll('#gallery .thumb')[${i}]; ${phone ? '' : 't.click();'} return t.querySelector('.style-name')?.textContent || String(${i + 1}); })()`);
    if (phone && i > 0) await click('.carousel-arrow.next');
    await delay(phone ? 900 : 500);
    await shot(`${String(10 + i).padStart(2, '0')}-3단계-포스터${i + 1}-${name.replace(/\s+/g, '')}`);
  }
  if (phone) {
    await click('#saveBtn');
    await must('!!document.querySelector(".save-hint")', '저장 안내', 5000);
    await shot(`${10 + n}-저장`);
  } else {
    await click('#printBtn'); await delay(800);
    await shot(`${10 + n}-출력`);
  }
  ws.close();
} catch (e) {
  console.error('❌ ' + e.message); code = 2;
} finally {
  chrome.kill();
  await delay(400); await fs.rm(profile, { recursive: true, force: true }).catch(() => {});
}
if (generateSeen.length) { console.error(`❌ 생성 요청이 네트워크에 ${generateSeen.length}건 잡혔다(막혔더라도 실패)`); code = 2; }
console.log(made.join('\n'));
console.log(`${tagDev} ${made.length}장 → ${out}`);
process.exit(code);
