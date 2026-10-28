/* 설치판 앱 창을 검사용 아래 모니터에서 실제로 끌어 줄이고 · 늘리고 · 최대화 ↔ 원래 크기를 오가며 녹화하고 잰다
   (2026-10-28 Bumm님 «창 크기에 맞게 자연스럽게 — 끌어서 크기를 바꾸는 동안 깨지는 순간이 없는지는 녹화로», 팀장 전달).

     node scripts/verify/desktop-resize-record.mjs <결과 폴더> (--exe <설치한 Poster Studio.exe> | --dev)
     (창 감시와 함께: powershell -File scripts/verify/with-window-watch.ps1 -Out <폴더> -Script scripts/verify/desktop-resize-record.mjs -ArgsLine "…")

   창은 처음부터 검사용 아래 모니터에만 뜬다 — 환경 변수 POSTER_STUDIO_TEST_WINDOW=«x,y»(test-monitor.json의 점)를 받은 앱이
   보이기 전에 그 모니터로 옮겨 최대화한다(desktop/main.mjs). 그 모니터가 없으면 아무것도 띄우지 않고 멈춘다(종료코드 2).
   화면마다(1단계 · 2단계 · 3단계 샘플 8종 · 인쇄 미리보기):
     ① 최대화 상태를 잰다 → 원래 크기로(창 크기 = 그 모니터 작업 영역)
     ② 빠른 끌기 — 오른쪽 아래 모서리 · 오른쪽 변 · 아래 변을 최소 크기까지 줄였다 다시 늘린다(16ms마다 한 걸음, 앞뒤로 «크기 바꾸기 시작 · 끝» 알림 — win-ctl drag).
        그동안 페이지 안에서 그려지는 프레임마다 가로 넘침 · 단추 겹침 · 단추가 화면 옆 밖을 잰다(마우스는 쓰지 않는다 — 사람의 마우스를 빼앗지 않게).
     ③ 느린 걸음 — 같은 길을 12걸음으로, 걸음마다 다 그려진 뒤 잘린 글자까지 잰다
     ④ 최대화 ↔ 원래 크기 세 번
   화면마다 그 모니터 작업 영역을 녹화한다(ffmpeg gdigrab, 초당 30장, 마우스 커서 빼고) → resize-<화면>.mkv · 보기용 .mp4 · 0.2초 간격 모아 보기(contact-<화면>.png).
   창 자리는 걸음마다 확인한다(그 모니터 밖이면 걸림). 결과: <결과 폴더>/report.json, 하나라도 걸리면 종료코드 1. 서버 생성 · 카메라 · 인쇄 0건. */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const out = args[0];
if (!out || out.startsWith('--') || (!args.includes('--dev') && !opt('--exe'))) {
  console.error('사용: desktop-resize-record.mjs <결과 폴더> (--exe <Poster Studio.exe> | --dev)');
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });

const ctl = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'scripts/verify/win-ctl.ps1')], { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true });
const pending = [];
readline.createInterface({ input: ctl.stdout }).on('line', (l) => pending.shift()?.(l.trim()));
const cmd = (c) => new Promise((r) => { pending.push(r); ctl.stdin.write(c + '\n'); });

// 검사용 아래 모니터 — 없으면 아무 창도 띄우지 않는다
const tm = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/verify/test-monitor.json'), 'utf8'));
const mon = await cmd(`monitor ${tm.point[0]} ${tm.point[1]}`);
if (mon === 'none' || mon.startsWith('error')) { console.error(`검사용 모니터(점 ${tm.point})가 없다 — 화면에 띄우는 시험이라 멈춘다`); ctl.stdin.write('quit\n'); process.exit(2); }
const [mL, mT, mR, mB, wL, wT, wR, wB] = mon.split(' ').map(Number);
const work = { x: wL, y: wT, w: wR - wL, h: wB - wT };

const children = [ctl];
const cleanup = () => { for (const c of children) { try { c.kill(); } catch { /* 이미 끝남 */ } } };
process.on('exit', cleanup);

const FLAGS = ['--mute-audio'];
const port = 9500 + Math.floor(Math.random() * 100);
const exe = args.includes('--dev') ? path.join(ROOT, 'desktop/node_modules/electron/dist/electron.exe') : path.resolve(opt('--exe'));
const app = spawn(exe, [...(args.includes('--dev') ? [path.join(ROOT, 'desktop')] : []), `--remote-debugging-port=${port}`, ...FLAGS], { stdio: 'ignore', windowsHide: true, env: { ...process.env, POSTER_STUDIO_TEST_WINDOW: `${tm.point[0]},${tm.point[1]}` } });
children.push(app);

let target;
for (let i = 0; i < 160 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page' && t.url.startsWith('app://studio')); } catch { /* 아직 */ } }
if (!target) throw new Error('앱 화면을 못 찾음');
const ws = new globalThis.WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const wait = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
const waitFor = async (expr, ms = 20000) => { for (const end = Date.now() + ms; Date.now() < end; await sleep(150)) if (await ev(expr)) return true; return false; };
if (!await waitFor(`document.body.classList.contains('app-ready') && !document.getElementById('splash')`, 40000)) throw new Error('앱이 뜨지 않음');
await ev('document.fonts.ready.then(() => true)');

// 앱 창(제목 Poster Studio) — 프로세스 번호로 찾는다. 설치판은 실행 파일이 곧 주 프로세스다.
let hwnd = 'none';
for (let i = 0; i < 40 && hwnd === 'none'; i++) { hwnd = await cmd(`find ${app.pid} Poster Studio`); if (hwnd === 'none') await sleep(250); }
if (hwnd === 'none') throw new Error('앱 창을 못 찾음');

const report = { exe, monitor: { rect: [mL, mT, mR, mB], work }, startedAt: new Date().toISOString(), placement: [], screens: {}, checks: [] };
// 창 자리 — 보이는 동안 창 가운데가 검사 모니터 안이어야 한다(최대화 창은 테두리만큼 모니터 밖으로 걸친다)
async function where(label) {
  const [vis, x, y, cw, ch, dpi, zoomed] = (await cmd(`state ${hwnd}`)).split(' ').map(Number);
  const cx = x + cw / 2, cy = y + ch / 2;
  const onTest = cx >= mL && cx < mR && cy >= mT && cy < mB;
  const row = { label, vis, x, y, cw, ch, dpi, zoomed, onTest };
  report.placement.push(row);
  return row;
}
const first = await where('처음 보일 때');
if (!first.vis || !first.onTest || !first.zoomed) throw new Error(`앱 창이 검사 모니터에서 최대화로 뜨지 않음: ${JSON.stringify(first)}`);

const settle = () => ev(`new Promise((r) => { const t = setTimeout(r, 500); requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(t); r(); })); })`);
// 다 그려진 뒤의 잼(desktop-window-sweep.mjs와 같은 기준) — 가로 넘침 · 단추 겹침(모달이면 그 안끼리) · 단추가 화면 옆 밖 · 잘린 글자
const MEASURE = `(() => {
  const vis = (e) => { if (e.closest('[hidden], dialog:not([open])')) return false; const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false; const b = e.getBoundingClientRect(); return b.width > 0.5 && b.height > 0.5; };
  const modal = [...document.querySelectorAll('dialog[open]')].find((x) => x.matches(':modal'));
  const ctrls = [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button]')].filter((e) => vis(e) && (!modal || modal.contains(e)));
  const rect = (e) => e.getBoundingClientRect();
  const name = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.classList.length ? '.' + [...e.classList].join('.') : '');
  const overlaps = [];
  for (let a = 0; a < ctrls.length; a++) for (let b = a + 1; b < ctrls.length; b++) {
    const A = ctrls[a], B = ctrls[b]; if (A.contains(B) || B.contains(A)) continue;
    const p = rect(A), q = rect(B);
    if (Math.min(p.right, q.right) - Math.max(p.left, q.left) > 1 && Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top) > 1) overlaps.push(name(A) + ' × ' + name(B));
  }
  const offside = ctrls.filter((e) => { const b = rect(e); return b.left < -0.5 || b.right > innerWidth + 0.5; }).map(name);
  const d = document.documentElement;
  const res = { iw: innerWidth, ih: innerHeight, dpr: devicePixelRatio, over: d.scrollWidth > d.clientWidth + 0.5, overlaps, offside };
  if (FULL) res.clipped = [...document.querySelectorAll('body *')].filter((e) => {
    if (!vis(e) || ![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return false;
    const s = getComputedStyle(e); if (s.textOverflow === 'ellipsis' || s.webkitLineClamp !== 'none') return false;
    const hide = (v) => v === 'hidden' || v === 'clip';
    return (hide(s.overflowX) && e.scrollWidth > e.clientWidth + 1) || (hide(s.overflowY) && e.scrollHeight > e.clientHeight + 2);
  }).map((e) => (e.className || e.tagName) + ': ' + e.textContent.trim().slice(0, 24));
  return res;
})`;
const measure = () => ev(`(${MEASURE.replace('FULL', 'true')})()`);
const badOf = (m) => [...(m.over ? ['가로 넘침'] : []), ...(m.overlaps.length ? [`단추 겹침: ${m.overlaps.slice(0, 3).join(' | ')}`] : []),
  ...(m.offside.length ? [`단추가 화면 옆 밖: ${m.offside.slice(0, 3).join(' | ')}`] : []), ...(m.clipped?.length ? [`잘린 글자: ${m.clipped.slice(0, 3).join(' | ')}`] : [])];
// 끄는 동안 그려지는 프레임마다 재는 표본기(잘린 글자는 무거워 걸음 잼에서만)
const SAMPLER_START = `(() => { const m = ${MEASURE.replace('FULL', 'false')}; const s = window.__rs = { frames: 0, sizes: new Set(), bad: [], run: true };
  const tick = () => { if (!s.run) return; s.frames++; const r = m(); s.sizes.add(r.iw + 'x' + r.ih); if (r.over || r.overlaps.length || r.offside.length) s.bad.push(r); requestAnimationFrame(tick); };
  requestAnimationFrame(tick); return true; })()`;
const SAMPLER_STOP = `(() => { const s = window.__rs; s.run = false; return { frames: s.frames, sizes: s.sizes.size, bad: s.bad.slice(0, 20), badCount: s.bad.length }; })()`;

function record(file) {
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'gdigrab', '-framerate', '30', '-draw_mouse', '0', '-offset_x', String(work.x), '-offset_y', String(work.y),
    '-video_size', `${work.w - (work.w % 2)}x${work.h - (work.h % 2)}`, '-i', 'desktop', '-c:v', 'ffv1', file], { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
  let err = ''; ff.stderr.on('data', (d) => { err += d; });
  return { stop: () => new Promise((r) => { ff.on('exit', (code) => r({ code, err })); ff.stdin.end('q'); }) };
}

async function screenRun(screen) {
  const rows = { measured: [], drags: [], toggles: [] };
  const file = path.join(out, `resize-${screen}.mkv`);
  const rec = record(file);
  await sleep(700);   // 녹화가 시작되기를
  const t0 = Date.now();
  const note = (what) => rows.measured.push({ t: (Date.now() - t0) / 1000, what });
  await settle(); let m = await measure(); note('최대화'); rows.measured.at(-1).bad = badOf(m); rows.measured.at(-1).size = `${m.iw}x${m.ih}`;
  // 원래 크기 — 창 = 작업 영역(시험 자리에서 보이기 전에 그 크기로 두었다)
  await cmd(`show ${hwnd} 9`); await sleep(400); await settle();
  const restored = await where(`${screen} 원래 크기`);
  if (restored.zoomed) throw new Error('원래 크기로 돌아가지 않음');
  const [ow, oh] = [work.w, work.h];
  // 끌기는 앱 최소 창(1024×640 DIP — desktop/main.mjs)보다 더 작게까지 끈다 — 사람이 최소보다 더 끌어도 Windows가 최소 크기에서 멈추는지까지 본다.
  // 느린 걸음은 최대에서 정확히 최소 창까지.
  const scale = restored.dpi / 96;
  const [pastW, pastH] = [Math.round(ow * 0.5), Math.round(oh * 0.5)];
  const [minW, minH] = [Math.round(1024 * scale), Math.round(640 * scale)];
  const paths = [['모서리', ow, oh, pastW, pastH], ['오른쪽 변', ow, oh, pastW, oh], ['아래 변', ow, oh, ow, pastH]];
  for (const [label, w0, h0, w1, h1] of paths) {
    for (const [a, b, c, d, dir] of [[w0, h0, w1, h1, '줄이기'], [w1, h1, w0, h0, '늘리기']]) {
      await ev(SAMPLER_START);
      const r = await cmd(`drag ${hwnd} ${a} ${b} ${c} ${d} 40 16`);
      await settle();
      const s = await ev(SAMPLER_STOP);
      const p = await where(`${screen} 끌기 ${label} ${dir}`);
      rows.drags.push({ t: (Date.now() - t0) / 1000, path: label, dir, took: r, ...s, end: `${p.cw}x${p.ch}`, onTest: p.onTest });
    }
  }
  // 느린 걸음 — 걸음마다 다 그린 뒤 전부 잰다(모서리 길)
  for (let i = 0; i <= 12; i++) {
    const w = Math.round(ow + (minW - ow) * i / 12), h = Math.round(oh + (minH - oh) * i / 12);
    await cmd(`outer ${hwnd} ${w} ${h}`); await settle();
    m = await measure(); note(`걸음 ${i}/12`); Object.assign(rows.measured.at(-1), { size: `${m.iw}x${m.ih}`, dpr: m.dpr, bad: badOf(m) });
  }
  await cmd(`outer ${hwnd} ${ow} ${oh}`); await settle();
  // 최대화 ↔ 원래 크기 세 번
  for (let i = 0; i < 3; i++) {
    for (const [n, label] of [[3, '최대화'], [9, '원래 크기']]) {
      await ev(SAMPLER_START);
      await cmd(`show ${hwnd} ${n}`); await sleep(500); await settle();
      const s = await ev(SAMPLER_STOP);
      m = await measure();
      const p = await where(`${screen} ${label} ${i + 1}`);
      rows.toggles.push({ t: (Date.now() - t0) / 1000, to: label, zoomed: p.zoomed, onTest: p.onTest, size: `${m.iw}x${m.ih}`, frames: s.frames, badFrames: s.badCount, bad: badOf(m) });
    }
  }
  await cmd(`show ${hwnd} 3`); await sleep(400); await settle();
  await sleep(300);
  const stopped = await rec.stop();
  // 보기용 mp4와 0.2초 간격 모아 보기
  spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', file.replace(/\.mkv$/, '.mp4')], { windowsHide: true });
  spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-vf', 'fps=5,scale=440:-2,tile=8x20:padding=4:color=gray', '-frames:v', '1', path.join(out, `contact-${screen}.png`)], { windowsHide: true });
  rows.recording = { file: path.basename(file), ffmpeg: stopped.code, err: stopped.err.trim().slice(0, 200) };
  report.screens[screen] = rows;
  const bad = [...rows.measured.filter((r) => r.bad?.length), ...rows.drags.filter((r) => r.badCount || !r.onTest), ...rows.toggles.filter((r) => r.badFrames || r.bad.length || !r.onTest)];
  const zoomOk = rows.toggles.every((r) => r.zoomed === (r.to === '최대화' ? 1 : 0));
  report.checks.push({ name: `${screen}: 끌기 ${rows.drags.length}번(그려진 프레임 ${rows.drags.reduce((a, r) => a + r.frames, 0)}장) · 걸음 13 · 최대화 ↔ 원래 크기 6번`, ok: !bad.length && zoomOk && stopped.code === 0, bad: bad.length });
  console.log(`${bad.length || !zoomOk ? '걸림' : '통과'}  ${screen} — 걸린 것 ${bad.length}${zoomOk ? '' : ' · 최대화 상태가 어긋남'} · 녹화 ffmpeg ${stopped.code}`);
  for (const r of bad.slice(0, 5)) console.log('   ' + JSON.stringify(r).slice(0, 300));
}

await screenRun('step1');
await ev(`document.getElementById('prepareNextBtn').click()`);
if (!await waitFor(`document.body.dataset.step === '2'`)) throw new Error('2단계로 가지 않음');
await screenRun('step2');
await ev(`document.getElementById('shotBtn').click()`);   // 카메라를 켜기 전 빨간 단추 = «샘플 포스터 보기»
if (!await waitFor(`document.body.dataset.step === '3' && document.querySelectorAll('#resultView .style-option.thumb').length === 8`, 90000)) throw new Error('3단계(샘플 8종)로 가지 않음');
await screenRun('step3');
await ev(`document.getElementById('printBtn').click()`);
if (!await waitFor(`document.querySelector('.print-preview')?.open === true`)) throw new Error('인쇄 미리보기가 열리지 않음');
await screenRun('printPreview');

const off = report.placement.filter((p) => !p.onTest);
report.checks.push({ name: `창 자리 ${report.placement.length}번 확인 — 모두 검사 모니터 안`, ok: off.length === 0, off });
report.finishedAt = new Date().toISOString();
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
const failed = report.checks.filter((c) => !c.ok).length;
console.log(failed ? `걸림 ${failed}건 / ${report.checks.length}` : `모두 통과 ${report.checks.length}건`);
ws.close(); ctl.stdin.write('quit\n');
cleanup();
process.exit(failed ? 1 : 0);
