/* Windows 설치판(desktop/) 실제 실행 확인(2026-10-27, _docs/intents/2026-10-27-desktop-installer).

     node scripts/verify/desktop-app-probe.mjs <결과 폴더> --exe <설치된 PosterStudio.exe>   설치한 판을 띄운다
     node scripts/verify/desktop-app-probe.mjs <결과 폴더> --dev                             desktop/의 개발 Electron으로 desktop/web을 띄운다
       [--photo <사진>]  가짜 카메라에 쓸 사진(기본: 앱에 이미 공개된 예시 그림 public/studio/camera-student.webp)

   설치판을 원격 디버깅 포트와 가짜 카메라(그 사진)로 띄우고, 사람이 하는 순서대로 누른다:
     1단계(설치판 표시 · 다운로드 단추 없음 · 화면 글꼴 · 한글 입력) → 2단계(예시 영상 · 켜기 전 «샘플 포스터 보기» · 카메라 켜기 · 3초 뒤 찍기)
     → «이 사진으로 포스터 만들기»(로딩 화면 장면 둘 → AI 없이 로컬 합성 8종) → PC에 저장(PNG 1200×1800) → 인쇄 미리보기 → 인쇄하기(4×6 PDF로 받음)
     → 다음 주인공 → «샘플 포스터 보기»(화면의 촬영 구도 예시 사진 · 로컬 합성 — 웹의 AI 원화가 아니다) → 8종 → 개인정보처리방침 새 창 → 창 닫기로 종료.
   잰다: 앱이 보낸 요청이 전부 앱 안 주소(app://studio)·blob·data인지(바깥 인터넷 0건), 바깥 주소 fetch가 막히는지,
         콘솔 오류 · 못 받은 파일 0건, 화면마다 원본 해상도 캡처(<결과 폴더>/*.png), 결과 report.json.
   저장 · 인쇄 창은 확인용 환경 변수로 대신한다(desktop/main.mjs 머리말) — 사람이 쓰는 설치판은 Windows 저장 창 · 인쇄 창이 뜬다.
   하나라도 걸리면 종료코드 1. 생성 · 과금 · 서버 요청 없음(설치판에는 AI가 없다). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const out = args[0];
if (!out || out.startsWith('--') || (!args.includes('--dev') && !opt('--exe'))) {
  console.error('사용: desktop-app-probe.mjs <결과 폴더> (--exe <PosterStudio.exe> | --dev) [--photo <사진>]');
  process.exit(2);
}
const photo = path.resolve(opt('--photo') ?? path.join(ROOT, 'public/studio/camera-student.webp'));
fs.mkdirSync(out, { recursive: true });
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-desktop-'));
const saveDir = path.join(work, 'saved');
fs.mkdirSync(saveDir);
const printPdf = path.join(work, 'print.pdf');
const y4m = path.join(work, 'camera.y4m');
// 가짜 카메라 화면(4:3 1280×960 — 앱이 카메라에 요청하는 크기)
for (const [dst, vf, extra] of [[y4m, 'scale=1280:960:force_original_aspect_ratio=increase,crop=1280:960', ['-t', '2', '-r', '15', '-pix_fmt', 'yuv420p']]]) {
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-i', photo, ...extra, '-vf', vf, dst]);
  if (r.status !== 0) { console.error('ffmpeg 실패', String(r.stderr)); process.exit(2); }
}

const port = 9500 + Math.floor(Math.random() * 400);
const exe = args.includes('--dev') ? path.join(ROOT, 'desktop/node_modules/electron/dist/electron.exe') : path.resolve(opt('--exe'));
const exeArgs = [...(args.includes('--dev') ? [path.join(ROOT, 'desktop')] : []), `--remote-debugging-port=${port}`, '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`, '--mute-audio',
  // 앱 창이 다른 창 뒤에서 열려도 그리기를 멈추지 않게(확인할 때만 — desktop-vs-web.mjs 머리말)
  '--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'];
const env = { ...process.env, POSTER_STUDIO_TEST_SAVE_DIR: saveDir, POSTER_STUDIO_TEST_PRINT_PDF: printPdf };
const started = Date.now();
const app = spawn(exe, exeArgs, { env, stdio: 'ignore' });
// 앱 창은 검사용 아래 모니터에서 최대화한다(10/28 «자동 검사 창은 아래 작은 모니터에만» — win-capture.ps1 -Maximize, 창을 찾으면 끝난다)
spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'scripts/verify/win-capture.ps1'), '-AppPid', String(app.pid), '-Out', os.tmpdir(), '-Maximize'], { stdio: 'ignore', windowsHide: true });
let exitCode = null;
const exited = new Promise((resolve) => app.on('exit', (code) => { exitCode = code; resolve(code); }));

const report = { exe, startedAt: new Date(started).toISOString(), checks: [], requests: [], failedRequests: [], consoleErrors: [], shots: [] };
const check = (name, ok, detail) => { report.checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? '통과' : '걸림'}  ${name}${detail === undefined ? '' : ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail))}`); };


async function targets() {
  try { return await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { return []; }
}
async function waitTarget(pred, ms = 30000) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(250)) { const t = (await targets()).find(pred); if (t) return t; }
  return null;
}
async function connect(target) {
  const ws = new globalThis.WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  let id = 0; const wait = new Map(); const handlers = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } else if (m.method) handlers.forEach((h) => h(m));
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'evaluate'); return r.result?.result?.value; };
  return { ws, send, evaluate, on: (h) => handlers.push(h) };
}

let main;
try {
  const target = await waitTarget((t) => t.type === 'page' && t.url.startsWith('app://studio/'));
  check('앱이 뜨고 화면 주소가 app://studio/', !!target, target?.url);
  if (!target) throw new Error('앱 화면을 못 찾음');
  main = await connect(target);
  main.on((m) => {
    if (m.method === 'Network.requestWillBeSent') report.requests.push(m.params.request.url.slice(0, 160));
    if (m.method === 'Network.loadingFailed' && !m.params.canceled) report.failedRequests.push(m.params.errorText + ' ' + m.params.requestId);
    if (m.method === 'Runtime.exceptionThrown') report.consoleErrors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') report.consoleErrors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') report.consoleErrors.push(`${m.params.entry.source}: ${m.params.entry.text}`);
  });
  await main.send('Network.enable');
  await main.send('Runtime.enable');
  await main.send('Log.enable');
  await main.send('DOM.enable');
  await main.send('CSS.enable');
  await main.send('Page.enable');
  // 이미 그려진 첫 화면의 요청까지 기록하려고 한 번 다시 연다(사람이 앱을 처음 연 것과 같다).
  await main.send('Page.reload', { ignoreCache: true });
  await sleep(1500);
  await main.evaluate(`new Promise((r) => { const t = setInterval(() => { if (document.body.classList.contains('app-ready') && !document.getElementById('splash')) { clearInterval(t); r(); } }, 100); setTimeout(() => { clearInterval(t); r(); }, 8000); })`);
  await sleep(2600);

  const shot = async (name) => {
    const r = await main.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const file = path.join(out, `${String(report.shots.length + 1).padStart(2, '0')}-${name}.png`);
    fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    report.shots.push(path.basename(file));
  };
  const click = async (selector) => main.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`);
  const waitFor = async (expression, ms = 15000) => { for (const end = Date.now() + ms; Date.now() < end; await sleep(150)) { if (await main.evaluate(expression)) return true; } return false; };

  // 창 제목(작업표시줄에 보이는 이름)
  const title = spawnSync('powershell', ['-NoProfile', '-Command', `(Get-Process -Id ${app.pid}).MainWindowTitle`], { encoding: 'utf8' }).stdout.trim();
  check('창 제목 «Poster Studio»', title === 'Poster Studio', title);
  const view = await main.evaluate(`({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio, step: document.body.dataset.step, desktop: 'desktop' in document.body.dataset, badge: document.querySelector('.desktop-badge')?.textContent ?? null, download: !!document.querySelector('.download-menu') })`);
  check('1단계 · 설치판 표시', view.step === '1' && view.desktop && view.badge === '설치판 · AI 없이 사진 그대로', view);
  check('설치판에는 다운로드 단추가 없다', !view.download);   // «샘플 포스터 보기»는 10/28부터 설치판 2단계에도 있다(아래)
  // 키 · 토큰을 설치판에 넣지 않는다 — 화면이 실제로 받은 스크립트에 부스 토큰 값이 없는지(값은 CI와 같은 방식으로 src/constants.ts에서 읽는다)
  const token = fs.readFileSync(path.join(ROOT, 'src/constants.ts'), 'utf8').match(/const BOOTH_TOKEN = '([^']+)'/)?.[1];
  const scripts = await main.evaluate(`Promise.all([...document.scripts].filter((s) => s.src).map((s) => fetch(s.src).then((r) => r.text()))).then((t) => ({ n: t.length, bytes: t.join('').length, text: t.join('') }))`);
  check('설치판 화면 스크립트에 부스 토큰이 없다', token && scripts.n > 0 && scripts.bytes > 100000 && !scripts.text.includes(token), { scripts: scripts.n, bytes: scripts.bytes });
  // 화면 글꼴: 제목 · 본문이 실제로 앱 글꼴(Studio = Pretendard 서브셋)로 그려졌는지(맑은 고딕 대체가 아닌지)
  const { result: { root } } = await main.send('DOM.getDocument', { depth: 0 });
  const fontsOf = async (selector) => {
    const { result } = await main.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    if (!result?.nodeId) return null;
    const r = await main.send('CSS.getPlatformFontsForNode', { nodeId: result.nodeId });
    return (r.result?.fonts ?? []).map((f) => `${f.familyName}${f.isCustomFont ? '(웹글꼴)' : ''}`);
  };
  const headingFonts = await fontsOf('#prepareView h1');
  check('화면 글꼴이 앱 글꼴(웹글꼴)로 그려진다', headingFonts?.length && headingFonts.every((f) => f.includes('(웹글꼴)')), headingFonts);
  await shot('1단계');

  // 한글 입력: 조합(IME) 한 글자 + 확정 입력
  await main.evaluate(`document.getElementById('movieTitle').focus()`);
  await main.send('Input.imeSetComposition', { text: '우', selectionStart: 1, selectionEnd: 1 });
  await main.send('Input.insertText', { text: '우주 탐험대' });
  await main.evaluate(`document.getElementById('studentName').focus()`);
  await main.send('Input.insertText', { text: '김인키' });
  const typed = await main.evaluate(`[document.getElementById('movieTitle').value, document.getElementById('studentName').value]`);
  check('한글 입력(조합 · 확정)', typed[0] === '우주 탐험대' && typed[1] === '김인키', typed);
  const inputFonts = await fontsOf('#movieTitle');
  check('입력칸 한글이 앱 글꼴로 그려진다', inputFonts?.length && inputFonts.every((f) => f.includes('(웹글꼴)')), inputFonts);
  await shot('1단계-한글입력');

  // 2단계: 예시 영상 · 카메라
  await click('#prepareNextBtn');
  check('2단계로 간다', await waitFor(`document.body.dataset.step === '2'`));
  await sleep(2500);
  const example = await main.evaluate(`(() => { const v = document.querySelector('#cameraView video:not(#video)'); return v ? { src: v.currentSrc.replace(/^.*\\/studio\\//, '/studio/'), ready: v.readyState, t: Math.round(v.currentTime * 10) / 10 } : null; })()`);
  check('촬영 예시 영상이 재생된다(필수 미디어)', !example || (example.ready >= 2 && example.t > 0), example ?? '예시 영상 없음(정지 그림)');
  // 10/28 Bumm님: 설치판도 카메라를 켜기 전에는 빨간 단추가 «샘플 포스터 보기», «사진 불러오기»는 없다
  const idle = await main.evaluate(`({ shot: document.getElementById('shotBtn')?.textContent.trim(), load: !!document.getElementById('loadPhotoBtn'), file: !!document.querySelector('input[type=file]') })`);
  check('카메라를 켜기 전 빨간 단추 = «샘플 포스터 보기» · «사진 불러오기» 없음', idle.shot === '샘플 포스터 보기' && !idle.load && !idle.file, idle);
  await shot('2단계');
  await click('#startBtn');
  check('카메라가 켜진다(권한 허용 · 가짜 카메라)', await waitFor(`(() => { const v = document.getElementById('video'); return !!v && !v.classList.contains('hidden') && v.videoWidth > 0; })()`));
  check('카메라를 켜면 빨간 단추 = «3초 뒤 사진 찍기»', await main.evaluate(`document.getElementById('shotBtn')?.textContent.trim() === '3초 뒤 사진 찍기'`));
  await sleep(800);
  await shot('2단계-카메라');
  await click('#shotBtn');
  check('3초 뒤 찍기 → 찍은 사진', await waitFor(`(() => { const s = document.getElementById('snapshot'); return !!s && !s.classList.contains('hidden') && s.naturalWidth > 0; })()`, 10000));
  const snap = await main.evaluate(`[document.getElementById('snapshot').naturalWidth, document.getElementById('snapshot').naturalHeight]`);
  check('설치판은 카메라 화질 그대로(1024로 줄이지 않음)', snap[0] === 1280 && snap[1] === 960, snap);
  check('찍은 뒤 카메라를 끈다', await main.evaluate(`!document.getElementById('video').srcObject`));
  await sleep(2600);
  await shot('2단계-촬영완료');

  // 로컬 합성 — 로딩 화면이 무작위 장면 둘(8초씩) 동안 돈 뒤 결과로 간다(10/27 Bumm님 «최소 두 개 · 최소 두 바퀴»). AI 문구 장면은 없다.
  // 장면마다 웹과 같은 승인된 대기 영상(/studio/waiting-v3/<장면 번호>-<해시>.mp4)이 실제로 재생돼야 한다(10/27 Bumm님 «승인된 영상과 디자인을 그대로»).
  await click('#generateBtn');
  const waitScenes = [];
  const waitStart = Date.now();
  const shotScenes = [];
  for (let i = 0; i < 80; i++) {
    const w = await main.evaluate(`(() => { const d = document.querySelector('.generation-wait'); const v = d?.querySelector('video[data-active="true"]');
      return { step: document.body.dataset.step, open: !!d?.open, scene: d?.dataset.setId ?? null, ai: d ? /AI/.test(d.innerText) : false, img: !!d?.querySelector('.generation-film img'),
        video: v ? { src: v.currentSrc.replace(/^.*\\/studio\\//, '/studio/'), t: Math.round(v.currentTime * 10) / 10, paused: v.paused } : null }; })()`);
    waitScenes.push({ t: Date.now() - waitStart, ...w });
    // 장면마다 영상이 3초쯤 돈 순간을 한 장씩 찍는다(첫 장면 · 둘째 장면)
    if (w.open && w.video && w.video.t >= 3 && !shotScenes.includes(w.scene) && shotScenes.length < 2) {
      shotScenes.push(w.scene);
      await shot(shotScenes.length === 1 ? '2단계-로딩' : '2단계-로딩-둘째');
    }
    if (w.step === '3') break;
    await sleep(500);
  }
  const seen = [...new Set(waitScenes.filter((w) => w.open).map((w) => w.scene))];
  const shown = waitScenes.filter((w) => w.open);
  check('로딩 화면이 무작위 장면 둘 동안 돈다(AI 문구 장면 없음)', seen.length >= 2 && shown.every((w) => !w.ai && w.img), { 장면: seen, 문구AI: shown.some((w) => w.ai) });
  // 장면마다 그 장면 번호의 승인된 영상이 3초 넘게 실제로 재생됐다(정지 그림으로 내려앉지 않음)
  const played = seen.map((id) => {
    const best = shown.filter((w) => w.scene === id && w.video).map((w) => w.video).sort((a, b) => b.t - a.t)[0];
    return { 장면: id, 영상: best?.src ?? null, 최대재생초: best?.t ?? 0 };
  });
  const approvedFor = (id) => new RegExp('^/studio/waiting-v3/' + String(id).padStart(2, '0') + '-[a-f0-9]{12}\\.mp4$');
  check('장면마다 승인된 대기 영상이 재생된다(웹과 같은 영상 · 3초 넘게)', played.length >= 2 && played.every((p) => approvedFor(p.장면).test(p.영상 ?? '') && p.최대재생초 >= 3), played);
  check('두 장면(16초)이 끝난 뒤 3단계로 간다(최소 두 바퀴)', (waitScenes.find((w) => w.step === '3')?.t ?? 0) >= 15500, { 넘어간때ms: waitScenes.find((w) => w.step === '3')?.t });
  check('AI 없이 8종이 만들어진다(3단계)', await waitFor(`document.body.dataset.step === '3' && document.querySelectorAll('#resultView .style-option.thumb').length === 8`, 20000));
  await sleep(1500);
  await shot('3단계');

  // PC에 저장
  await click('#desktopSaveBtn');
  let saved = null;
  for (let i = 0; i < 40 && !saved; i++) { await sleep(250); saved = fs.readdirSync(saveDir).find((f) => f.endsWith('.png')); }
  let size = null;
  if (saved) { const b = fs.readFileSync(path.join(saveDir, saved)); size = [b.readUInt32BE(16), b.readUInt32BE(20)]; }
  check('PC에 저장 → PNG 1200×1800', saved && size?.[0] === 1200 && size?.[1] === 1800, { saved, size });

  // 인쇄 미리보기 → 인쇄하기
  const pb = await main.evaluate(`(() => { const r = document.getElementById('printBtn').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await main.send('Input.dispatchMouseEvent', { type, x: pb[0], y: pb[1], button: 'left', clickCount: 1 });
  check('인쇄 미리보기 창이 열린다', await waitFor(`document.querySelector('.print-preview')?.open === true && document.querySelector('.print-preview-page img')?.naturalWidth === 1200`));
  check('미리보기 창의 초점은 «인쇄하기»', await main.evaluate(`document.activeElement?.textContent?.includes('인쇄하기') === true`));
  const pv = await main.evaluate(`(() => { const a = document.activeElement, bs = [...document.querySelectorAll('.print-preview-actions button')].map((b) => b.getBoundingClientRect()); return { outline: getComputedStyle(a).outlineStyle, heights: bs.map((r) => Math.round(r.height)), tops: bs.map((r) => Math.round(r.top)) }; })()`);
  check('마우스로 열면 «인쇄하기»에 초점 테두리(빨간 외곽선)가 없다', pv.outline === 'none', pv);
  check('«닫기»와 «인쇄하기»가 같은 높이(52px) · 같은 줄(위 끝이 같다)', pv.heights.length === 2 && pv.heights.every((h) => h === 52) && pv.tops[0] === pv.tops[1], { heights: pv.heights, tops: pv.tops });
  await sleep(500);
  await shot('인쇄-미리보기');
  await main.evaluate(`[...document.querySelectorAll('.print-preview-actions button')].find((b) => b.textContent.includes('인쇄하기')).click()`);
  for (let i = 0; i < 60 && !fs.existsSync(printPdf); i++) await sleep(250);
  await sleep(500);
  let pdfInfo = null;
  if (fs.existsSync(printPdf)) {
    const t = fs.readFileSync(printPdf).toString('latin1');
    const box = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(t);
    pdfInfo = { bytes: fs.statSync(printPdf).size, pages: (t.match(/\/Type\s*\/Page[^s]/g) ?? []).length, mediaBox: box ? [Number(box[1]), Number(box[2])] : null, images: (t.match(/\/Subtype\s*\/Image/g) ?? []).length };
    fs.copyFileSync(printPdf, path.join(out, 'print-4x6.pdf'));
  }
  check('인쇄 = 4×6인치(288×432pt) 한 장 · 포스터 그림 포함', pdfInfo && pdfInfo.pages === 1 && pdfInfo.mediaBox?.[0] === 288 && pdfInfo.mediaBox?.[1] === 432 && pdfInfo.images >= 1, pdfInfo);
  check('인쇄 뒤 인쇄용 화면을 걷는다', await waitFor(`!document.getElementById('printArea')`, 5000));

  // 다음 주인공 → «샘플 포스터 보기»(10/28 Bumm님): 화면의 촬영 구도 예시 사진(승인된 예시 영상의 «찰칵» 뒤 마지막 장면)을 로컬 합성으로 8종에 넣는다.
  // 로딩 화면은 설치판 것(장면 둘 · AI 문구 없음)이고, 웹의 AI 원화(design-sample)는 받지 않는다.
  await click('#resultView .result-tools .icon-button[aria-label="다음 주인공"]');
  await sleep(800);
  const afterReset = await main.evaluate(`({ step: document.body.dataset.step, title: document.getElementById('movieTitle').value, thumbs: document.querySelectorAll('#resultView .style-option.thumb').length, snapshot: !document.getElementById('snapshot').classList.contains('hidden') })`);
  check('다음 주인공 → 입력 · 사진 · 포스터 초기화', afterReset.title === '' && afterReset.thumbs === 0 && !afterReset.snapshot, afterReset);
  if (afterReset.step !== '2') { await main.evaluate(`document.querySelectorAll('.stepper button')[1].click()`); await waitFor(`document.body.dataset.step === '2'`); }
  await sleep(600);
  check('다시 2단계: 빨간 단추 = «샘플 포스터 보기»', await main.evaluate(`document.getElementById('shotBtn')?.textContent.trim() === '샘플 포스터 보기'`));
  const reqBefore = report.requests.length;
  await click('#shotBtn');
  const sampleWait = [];
  for (let i = 0; i < 60; i++) {
    const w = await main.evaluate(`(() => { const d = document.querySelector('.generation-wait'); return { step: document.body.dataset.step, open: !!d?.open, ai: d ? /AI/.test(d.innerText) : false }; })()`);
    sampleWait.push(w);
    if (w.open && sampleWait.filter((x) => x.open).length === 6) await shot('2단계-샘플-로딩');
    if (w.step === '3') break;
    await sleep(500);
  }
  check('샘플: 설치판 로딩 화면(AI 문구 없음) 뒤 8종', sampleWait.some((w) => w.open) && sampleWait.every((w) => !w.ai) && await waitFor(`document.body.dataset.step === '3' && document.querySelectorAll('#resultView .style-option.thumb').length === 8`, 20000), { 로딩표본: sampleWait.filter((w) => w.open).length, 문구AI: sampleWait.some((w) => w.ai) });
  const sampleReq = report.requests.slice(reqBefore).map((u) => u.replace(/^app:\/\/studio/, ''));
  const examplePhoto = sampleReq.find((u) => /^\/studio\/camera-(v1\/(solo|group)-end|student|group)\.webp/.test(u));
  check('샘플 사진 = 화면의 촬영 구도 예시 사진(웹의 AI 원화를 받지 않는다)', !!examplePhoto && !sampleReq.some((u) => /design-sample/.test(u)), { examplePhoto, 원화: sampleReq.filter((u) => /design-sample/.test(u)) });
  await sleep(1200);
  await shot('3단계-샘플');

  // 머리글 로고 → 처음으로(문서를 새로 연다 — 사진 · 포스터를 남김없이 버린다). 설치판(app://)에서도 같은지
  await main.evaluate(`document.querySelector('.brand.header-home').click()`);
  await sleep(2500);
  const home = await main.evaluate(`new Promise((r) => { const t = setInterval(() => { if (document.body.classList.contains('app-ready')) { clearInterval(t); r({ url: location.href, step: document.body.dataset.step, snapshot: !document.getElementById('snapshot')?.classList.contains('hidden'), thumbs: document.querySelectorAll('#resultView .style-option.thumb').length }); } }, 100); setTimeout(() => { clearInterval(t); r(null); }, 8000); })`);
  check('머리글 로고 → 처음 화면(사진 · 포스터 없음)', home && home.url === 'app://studio/' && home.step === '1' && !home.snapshot && home.thumbs === 0, home);

  // 바깥 인터넷: 앱이 보낸 요청은 전부 앱 안 · 바깥 주소는 막힌다
  const outside = report.requests.filter((u) => !/^(app:\/\/studio\/|blob:|data:)/.test(u));
  check('앱이 보낸 요청 = 앱 안 주소뿐(바깥 0건)', outside.length === 0, { total: report.requests.length, outside });
  // 여기까지의 콘솔 오류 · 못 받은 파일(아래 «막히는지» 시험이 일부러 남기는 화면 정책 기록 앞에서 센다)
  check('콘솔 오류 · 못 받은 파일 0건', report.consoleErrors.length === 0 && report.failedRequests.length === 0, { console: report.consoleErrors, failed: report.failedRequests });
  const before = report.consoleErrors.length;
  const blocked = await main.evaluate(`fetch('https://poster.edutogether.kr/health').then(() => 'ok', (e) => 'blocked: ' + e.message)`);
  await sleep(300);
  const policy = report.consoleErrors.slice(before);
  check('바깥 주소로 보내기가 화면 정책(connect-src)에서 막힌다', blocked.startsWith('blocked') && policy.some((m) => m.includes("connect-src 'self'")), { blocked, policy });
  report.consoleErrors.splice(before);

  // 개인정보처리방침 새 창(앱 안 주소)
  await click('.privacy-link');
  const privacy = await waitTarget((t) => t.type === 'page' && t.url.startsWith('app://studio/privacy.html'), 8000);
  check('개인정보처리방침이 앱 안 새 창으로 열린다', !!privacy, privacy?.url);
  if (privacy) { const pw = await connect(privacy); await sleep(1200); const r = await pw.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(out, 'privacy.png'), Buffer.from(r.result.data, 'base64')); report.shots.push('privacy.png'); await pw.evaluate('window.close()').catch(() => {}); pw.ws.close(); }

  check('개인정보 창 뒤에도 콘솔 오류 0건', report.consoleErrors.length === 0 && report.failedRequests.length === 0, { console: report.consoleErrors, failed: report.failedRequests });

  // 종료: 창을 닫으면 앱이 끝난다
  await main.evaluate('window.close()').catch(() => {});
  const code = await Promise.race([exited, sleep(10000).then(() => 'timeout')]);
  check('창을 닫으면 앱이 끝난다', code !== 'timeout', code);
} catch (e) {
  check('흐름이 끝까지 돈다', false, String(e?.stack ?? e));
} finally {
  main?.ws.close();
  if (exitCode === null) app.kill();
  report.finishedAt = new Date().toISOString();
  report.seconds = Math.round((Date.now() - started) / 1000);
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  fs.rmSync(work, { recursive: true, force: true });
}
const failed = report.checks.filter((c) => !c.ok);
console.log(failed.length ? `걸림 ${failed.length}건 / ${report.checks.length}` : `모두 통과 ${report.checks.length}건`);
process.exit(failed.length ? 1 : 0);
