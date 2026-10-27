/* 설치판 «인쇄하기» 순간 화면이 움직이는지(2026-10-27 Bumm님 «인쇄하기를 누르면 페이지 전체가 왼쪽으로 밀리거나 줄어든다», 팀장 전달).

     node scripts/verify/desktop-print-shift.mjs <결과 폴더> (--exe <Poster Studio.exe> | --dev)

   앱을 원격 디버깅 포트로 띄우고(창은 최대화), 사람이 하는 순서대로 «사진 불러오기» → 포스터 만들기 → 3단계 → «이 포스터로 출력하기»(인쇄 미리보기)
   → «인쇄하기»를 누른다. 진짜 Windows 인쇄 창이 뜬다 — win-capture.ps1이 앱 창을 0.15초마다 원본 해상도로 12초 동안 찍는다. 인쇄 창은 찾으면
   2.5초 뒤 닫고, 끝나면 앱을 통째로 닫는다(인쇄 창이 떠 있는 동안 앱은 응답하지 않는다 · 실제로 인쇄하지 않는다).
   찍은 화면마다 «인쇄 미리보기를 열기 전 3단계 화면»과 화소를 견준다(창 테두리 · 제목 줄은 빼고 앱 화면만).
   잰다(하나라도 걸리면 종료코드 1):
     ① «인쇄하기»를 누른 뒤의 모든 장면 = 인쇄 전 3단계 화면(채널 32단계 넘는 차이 0화소) — 밀림 · 줄어듦 · 깜박임이 없다
        (10/27 고치기 전: 누르자마자 세로 스크롤바가 생겨 31장 모두 앱 화면 478,960화소가 32단계 넘게 달라졌다)
     ② 인쇄 전 문서에 세로 스크롤바가 없다
   인쇄 창(Windows 11은 PrintDialog 프로세스의 «Windows 인쇄»)을 본 기록은 report.json의 printDialog에 남긴다 — 뜨는 시간이 들쭉날쭉해 걸림으로 세지 않는다.
   결과: <결과 폴더>/frames/*.png(연속 캡처) · reference.png · report.json. 생성 · 과금 · 서버 요청 없음(설치판에는 AI가 없다). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadImage, createCanvas } from '@napi-rs/canvas';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const out = path.resolve(args[0] ?? '');
if (!args[0] || args[0].startsWith('--') || (!args.includes('--dev') && !opt('--exe'))) {
  console.error('사용: desktop-print-shift.mjs <결과 폴더> (--exe <Poster Studio.exe> | --dev)');
  process.exit(2);
}
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'frames'), { recursive: true });
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-print-shift-'));
const photo = path.join(work, 'photo.jpg');
spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(ROOT, 'public/studio/camera-student.webp'), '-frames:v', '1', photo]);

const port = 9500 + Math.floor(Math.random() * 400);
const exe = args.includes('--dev') ? path.join(ROOT, 'desktop/node_modules/electron/dist/electron.exe') : path.resolve(opt('--exe'));
const app = spawn(exe, [...(args.includes('--dev') ? [path.join(ROOT, 'desktop')] : []), `--remote-debugging-port=${port}`, '--mute-audio',
  '--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'], { stdio: 'ignore' });
const report = { exe, checks: [] };
const check = (name, ok, detail) => { report.checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? '통과' : '걸림'}  ${name}${detail === undefined ? '' : ' — ' + JSON.stringify(detail)}`); };

let target;
for (let i = 0; i < 120 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page' && t.url.startsWith('app://studio')); } catch { /* 아직 */ } }
const ws = new globalThis.WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const wait = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
const waitFor = async (expr, ms = 20000) => { for (const end = Date.now() + ms; Date.now() < end; await sleep(200)) if (await evaluate(expr)) return true; return false; };
const click = (sel) => evaluate(`document.querySelector(${JSON.stringify(sel)}).click()`);
const capture = (dir, seconds, cancelAfter = 2500) => new Promise((resolve) => {
  const ps = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'scripts/verify/win-capture.ps1'), '-AppPid', String(app.pid), '-Out', dir, '-Seconds', String(seconds), '-IntervalMs', '150', '-CancelPrintAfterMs', String(cancelAfter)], { stdio: 'ignore' });
  ps.on('exit', () => resolve(JSON.parse(fs.readFileSync(path.join(dir, 'frames.json'), 'utf8').replace(/^﻿/, ''))));
});
// 화면 캡처(원본 해상도 — 최대화한 창의 앱 화면): 2단계 · 로딩 · 3단계 · 인쇄 미리보기. 인쇄 순간 비교와 따로 남기는 기록이다.
const screen = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(out, `화면-${name}.png`), Buffer.from(r.result.data, 'base64')); };
const metrics = () => evaluate(`({ clientW: document.documentElement.clientWidth, innerW: innerWidth, scrollH: document.documentElement.scrollHeight, innerH: innerHeight, printArea: !!document.getElementById('printArea'), step: document.body.dataset.step })`);

// 창 최대화(Bumm님 화면처럼 큰 창) — Electron은 CDP 창 크기 명령을 받지 않아 Windows API로 한다
spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'scripts/verify/win-capture.ps1'), '-AppPid', String(app.pid), '-Out', work, '-Maximize']);
await sleep(800);
await waitFor(`document.body.classList.contains('app-ready') && !document.getElementById('splash')`);
await click('#prepareNextBtn');
await waitFor(`document.body.dataset.step === '2'`);
await sleep(1500);
await screen('2단계');
await send('DOM.enable');
const { result: { root } } = await send('DOM.getDocument', { depth: 0 });
const { result: input } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: '#loadPhotoBtn ~ input[type=file]' });
await send('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [photo] });
await waitFor(`!document.getElementById('generateBtn').hidden`);
await click('#generateBtn');
await sleep(2500);
await screen('로딩');
check('3단계로 간다(포스터 8종)', await waitFor(`document.body.dataset.step === '3' && document.querySelectorAll('#resultView .style-option.thumb').length === 8`, 60000));
await sleep(2500);
await screen('3단계');
const before = await metrics();
const ref = await capture(path.join(out, 'reference'), 0.2);
fs.copyFileSync(path.join(out, 'reference', ref.frames[0].shot), path.join(out, 'reference.png'));
const pb = await evaluate(`(() => { const r = document.getElementById('printBtn').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: pb[0], y: pb[1], button: 'left', clickCount: 1 });   // 사람처럼 마우스로
check('인쇄 미리보기 창이 열린다', await waitFor(`document.querySelector('.print-preview')?.open === true`));
await sleep(800);
await screen('인쇄-미리보기');
// 미리보기가 열린 화면도 하나 찍어 둔다 — 캡처가 «인쇄하기»를 누르기 전에 시작되면 앞쪽 장면은 이 화면이다(누르기 전이라 뺀다)
const pvShot = await capture(path.join(out, 'preview'), 0.2);
fs.copyFileSync(path.join(out, 'preview', pvShot.frames[0].shot), path.join(out, 'preview.png'));
const cap = capture(path.join(out, 'frames'), 12);
await sleep(600);
await evaluate(`[...document.querySelectorAll('.print-preview-actions button')].find((b) => b.textContent.includes('인쇄하기')).click()`);
const frames = await cap;
await sleep(800);
report.appAliveAtEnd = app.exitCode === null;
// 인쇄 창은 Windows 11에서 PrintDialog 프로세스가 띄우고(«Windows 인쇄»), 뜨는 데 걸리는 시간이 들쭉날쭉해 찾지 못할 때가 있다 — 기록만 한다.
// 인쇄 창이 떠 있는 동안 앱 화면은 응답하지 않으므로(인쇄 준비), 끝나면 앱을 통째로 닫아 인쇄 창도 함께 닫는다(인쇄하지 않는다).
report.printDialog = { at: frames.printDialogAt, cancelled: frames.cancelled, seen: frames.frames.filter((f) => f.printDialog).map((f) => f.dialog).slice(0, 3) };

// 화소 비교 — 창 테두리 · 제목 줄(인쇄 창이 초점을 가져가면 색이 바뀐다)은 빼고 앱 화면만
const read = async (file) => { const img = await loadImage(file); const c = createCanvas(img.width, img.height); const x = c.getContext('2d'); x.drawImage(img, 0, 0); return { w: img.width, h: img.height, d: x.getImageData(0, 0, img.width, img.height).data }; };
const A = await read(path.join(out, 'reference.png'));
const PV = await read(path.join(out, 'preview.png'));
const REF = A;
const TOP = 40, SIDE = 8, BIG = 32;   // BIG: 이보다 큰 채널 차이만 «달라짐»으로 센다 — 썸네일을 다시 그릴 때 생기는 작은 색 차이(10/27 실측 최대 14)는 밀림이 아니다
const compare = (B, A = REF) => {
  if (B.w !== A.w || B.h !== A.h) return { size: [B.w, B.h], diff: -1 };
  let diff = 0, box = [1e9, 1e9, -1, -1];
  for (let y = TOP; y < A.h - SIDE; y++) for (let x = SIDE; x < A.w - SIDE; x++) {
    const i = (y * A.w + x) * 4;
    if (Math.max(Math.abs(A.d[i] - B.d[i]), Math.abs(A.d[i + 1] - B.d[i + 1]), Math.abs(A.d[i + 2] - B.d[i + 2])) > BIG) { diff++; box = [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)]; }
  }
  return { diff, box: diff ? box : null };
};
// «인쇄하기»를 누른 뒤 = 미리보기 창이 닫힌 장면부터(누르기 전 장면은 미리보기가 떠 있어 다르다)
const rows = [];
let clicked = false;
for (const f of frames.frames) {
  if (!f.shot) continue;
  const B = await read(path.join(out, 'frames', f.shot));
  const r = { n: f.n, t: f.t, printDialog: f.printDialog, cancelled: !!f.cancelled, ...compare(B), previewDiff: compare(B, PV).diff };
  rows.push(r);
}
// 캡처 도구는 PowerShell이 C#을 컴파일한 뒤 찍기 시작해 시작 시각이 들쭉날쭉하다 — 앞쪽에서 미리보기 화면과 같은 장면(누르기 전)은 뺀다.
let start = 0;
while (start < rows.length && rows[start].previewDiff === 0) start++;
const afterClick = rows.slice(start);
report.beforeClickFrames = start;
clicked = afterClick.length > 0;
report.frames = rows;
const moved = afterClick.filter((r) => r.diff !== 0);
check('«인쇄하기»를 누른 뒤 모든 장면 = 인쇄 전 3단계 화면(채널 32단계 넘는 차이 0 — 밀림 · 줄어듦 · 깜박임 없음)', clicked && moved.length === 0, { 장면: afterClick.length, 달라진장면: moved.map((r) => ({ n: r.n, t: r.t, diff: r.diff, box: r.box })) .slice(0, 12) });
check('인쇄 전 문서에 세로 스크롤바가 없다(문서 폭 = 창 폭)', before.clientW === before.innerW && before.scrollH === before.innerH, before);

spawnSync('taskkill', ['/PID', String(app.pid), '/T', '/F']);   // 인쇄 창이 떠 있으면 앱이 CDP에 답하지 않는다 — 통째로 닫는다
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
const failed = report.checks.filter((c) => !c.ok);
console.log(failed.length ? `걸림 ${failed.length}건 / ${report.checks.length}` : `모두 통과 ${report.checks.length}건`);
process.exit(failed.length ? 1 : 0);
