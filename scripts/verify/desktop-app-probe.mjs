/* Windows 설치판(desktop/) 실제 실행 확인(2026-10-27, _docs/intents/2026-10-27-desktop-installer).

     node scripts/verify/desktop-app-probe.mjs <결과 폴더> --exe <설치된 PosterStudio.exe>   설치한 판을 띄운다
     node scripts/verify/desktop-app-probe.mjs <결과 폴더> --dev                             desktop/의 개발 Electron으로 desktop/web을 띄운다
       [--photo <사진>]  가짜 카메라 · «사진 불러오기»에 쓸 사진(기본: 앱에 이미 공개된 예시 그림 public/studio/camera-student.webp)

   설치판을 원격 디버깅 포트와 가짜 카메라(그 사진)로 띄우고, 사람이 하는 순서대로 누른다:
     1단계(설치판 표시 · 다운로드 단추 없음 · 화면 글꼴 · 한글 입력) → 2단계(예시 영상 · 카메라 켜기 · 3초 뒤 찍기)
     → «이 사진으로 포스터 만들기»(AI 없이 로컬 합성 8종) → PC에 저장(PNG 1200×1800) → 인쇄 미리보기 → 인쇄하기(4×6 PDF로 받음)
     → 다음 주인공 → «사진 불러오기» → 8종 → 개인정보처리방침 새 창 → 창 닫기로 종료.
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
const loadJpg = path.join(work, 'photo.jpg');
// 가짜 카메라 화면(4:3 1280×960 — 앱이 카메라에 요청하는 크기) · 불러오기용 JPG
for (const [dst, vf, extra] of [[y4m, 'scale=1280:960:force_original_aspect_ratio=increase,crop=1280:960', ['-t', '2', '-r', '15', '-pix_fmt', 'yuv420p']], [loadJpg, 'scale=iw:ih', ['-frames:v', '1', '-q:v', '3']]]) {
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-i', photo, ...extra, '-vf', vf, dst]);
  if (r.status !== 0) { console.error('ffmpeg 실패', String(r.stderr)); process.exit(2); }
}

const port = 9500 + Math.floor(Math.random() * 400);
const exe = args.includes('--dev') ? path.join(ROOT, 'desktop/node_modules/electron/dist/electron.exe') : path.resolve(opt('--exe'));
const exeArgs = [...(args.includes('--dev') ? [path.join(ROOT, 'desktop')] : []), `--remote-debugging-port=${port}`, '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`, '--mute-audio'];
const env = { ...process.env, POSTER_STUDIO_TEST_SAVE_DIR: saveDir, POSTER_STUDIO_TEST_PRINT_PDF: printPdf };
const started = Date.now();
const app = spawn(exe, exeArgs, { env, stdio: 'ignore' });
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
  const view = await main.evaluate(`({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio, step: document.body.dataset.step, desktop: 'desktop' in document.body.dataset, badge: document.querySelector('.desktop-badge')?.textContent ?? null, download: !!document.querySelector('.download-menu'), sampleButton: [...document.querySelectorAll('button')].some((b) => b.textContent.includes('샘플 포스터')) })`);
  check('1단계 · 설치판 표시', view.step === '1' && view.desktop && view.badge === '설치판 · AI 없이 사진 그대로', view);
  check('설치판에는 다운로드 단추 · 샘플 단추가 없다', !view.download && !view.sampleButton);
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
  await shot('2단계');
  await click('#startBtn');
  check('카메라가 켜진다(권한 허용 · 가짜 카메라)', await waitFor(`(() => { const v = document.getElementById('video'); return !!v && !v.classList.contains('hidden') && v.videoWidth > 0; })()`));
  await sleep(800);
  await shot('2단계-카메라');
  await click('#shotBtn');
  check('3초 뒤 찍기 → 찍은 사진', await waitFor(`(() => { const s = document.getElementById('snapshot'); return !!s && !s.classList.contains('hidden') && s.naturalWidth > 0; })()`, 10000));
  const snap = await main.evaluate(`[document.getElementById('snapshot').naturalWidth, document.getElementById('snapshot').naturalHeight]`);
  check('설치판은 카메라 화질 그대로(1024로 줄이지 않음)', snap[0] === 1280 && snap[1] === 960, snap);
  check('찍은 뒤 카메라를 끈다', await main.evaluate(`!document.getElementById('video').srcObject`));
  await sleep(2600);
  await shot('2단계-촬영완료');

  // 로컬 합성
  await click('#generateBtn');
  check('AI 없이 8종이 만들어진다(3단계)', await waitFor(`document.body.dataset.step === '3' && document.querySelectorAll('#resultView .style-option.thumb').length === 8`, 20000));
  check('로딩 화면(AI 대기 화면)이 뜨지 않는다', await main.evaluate(`!document.querySelector('.generation-wait')`));
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
  await click('#printBtn');
  check('인쇄 미리보기 창이 열린다', await waitFor(`document.querySelector('.print-preview')?.open === true && document.querySelector('.print-preview-page img')?.naturalWidth === 1200`));
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

  // 다음 주인공 → 사진 불러오기
  await click('#resultView .result-tools .icon-button[aria-label="다음 주인공"]');
  await sleep(800);
  const afterReset = await main.evaluate(`({ step: document.body.dataset.step, title: document.getElementById('movieTitle').value, thumbs: document.querySelectorAll('#resultView .style-option.thumb').length, snapshot: !document.getElementById('snapshot').classList.contains('hidden') })`);
  check('다음 주인공 → 입력 · 사진 · 포스터 초기화', afterReset.title === '' && afterReset.thumbs === 0 && !afterReset.snapshot, afterReset);
  if (afterReset.step !== '2') { await main.evaluate(`document.querySelectorAll('.stepper button')[1].click()`); await waitFor(`document.body.dataset.step === '2'`); }
  await sleep(600);
  const { result: fileInput } = await main.send('DOM.querySelector', { nodeId: (await main.send('DOM.getDocument', { depth: 0 })).result.root.nodeId, selector: '#loadPhotoBtn ~ input[type=file]' });
  check('사진 불러오기 단추와 파일 칸', !!fileInput?.nodeId);
  if (fileInput?.nodeId) await main.send('DOM.setFileInputFiles', { nodeId: fileInput.nodeId, files: [loadJpg] });
  check('불러온 사진이 이번 사진이 된다', await waitFor(`(() => { const s = document.getElementById('snapshot'); return !!s && !s.classList.contains('hidden') && s.naturalWidth > 0; })()`, 8000));
  await sleep(500);
  await shot('2단계-사진불러오기');
  await click('#generateBtn');
  check('불러온 사진으로 8종', await waitFor(`document.body.dataset.step === '3' && document.querySelectorAll('#resultView .style-option.thumb').length === 8`, 20000));
  await sleep(1200);
  await shot('3단계-불러온사진');

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
