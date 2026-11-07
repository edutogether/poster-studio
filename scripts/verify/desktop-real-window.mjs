/* 설치판을 강제 크기 없이 «실제 창»으로 재는 도구(2026-11-07 Bumm님 «다 커져서 틀어지고 잘려 있다, 한 페이지에 딱 나오게 맞춘다고 하지 않았냐», 팀장 전달).

     node scripts/verify/desktop-real-window.mjs <결과 폴더> (--exe <Poster Studio.exe> | --dev) [--w-step 20] [--h-step 8]

   앱을 검사용 아래 모니터(test-monitor.json)에 띄우고, CDP 화면 흉내(Emulation)는 쓰지 않는다 — 창 크기는 Windows로만 바꾼다(win-ctl.ps1).
   화면 넷(1단계 · 2단계 · 3단계 · 인쇄 미리보기)마다 재는 크기:
     ① 그 모니터에서 최대화 ② 앱 최소 창(안쪽 1100×648)부터 그 모니터 작업 영역에 들어가는 가장 큰 창까지의 격자(기본 폭 20 · 높이 8 CSS px 간격) + CSS 구간 경계(높이 679 · 680 · 699 · 700 · 729 · 730, 폭 1280 · 1366)
   크기마다 잰다: 안쪽 창 크기 · 문서 폭 · 높이 · 가로 · 세로 스크롤 · 잘린 요소 수 ·  안쪽 스크롤 칸.
   잘린 요소 = ① 넘침을 숨긴 칸에서 잘린 글자 ② 화면 옆 밖 단추 ③ 스크롤해도 닿지 않거나 안쪽 칸 스크롤 뒤로 숨은 단추 ④ 문서 스크롤 없이 화면 밖으로 나간 주요 요소.
   결과: report.json(전 크기) · 표.md(화면별 요약 + 스크롤 · 잘림이 있는 크기) · shots/(최대화 · 최소 · 가장 큰 창의 앱 화면, 원본 화소).
   가로 스크롤 · 세로 스크롤 · 잘린 요소 · 안쪽 스크롤 칸이 하나라도 있으면 종료코드 1. 잰 크기가 없거나 창이 그 크기가 되지 않아도 1이다. 서버 요청 · 과금 없음.
   --break-cut: 도구 자기검사 — 1단계 제목을 화면 밖으로 밀어 넣는다. 종료코드 1이어야 한다. */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const out = args[0] && !args[0].startsWith('--') ? path.resolve(args[0]) : null;
if (!out || (!args.includes('--dev') && !opt('--exe'))) {
  console.error('사용: desktop-real-window.mjs <결과 폴더> (--exe <Poster Studio.exe> | --dev) [--w-step 20] [--h-step 8]');
  process.exit(2);
}
const W_STEP = Number(opt('--w-step') ?? 20), H_STEP = Number(opt('--h-step') ?? 8);
fs.mkdirSync(path.join(out, 'shots'), { recursive: true });

const tm = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/verify/test-monitor.json'), 'utf8'));
const port = 9700 + Math.floor(Math.random() * 100);
const exe = args.includes('--dev') ? path.join(ROOT, 'desktop/node_modules/electron/dist/electron.exe') : path.resolve(opt('--exe'));
const app = spawn(exe, [...(args.includes('--dev') ? [path.join(ROOT, 'desktop')] : []), `--remote-debugging-port=${port}`, '--mute-audio',
  '--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
{ stdio: 'ignore', windowsHide: true, env: { ...process.env, POSTER_STUDIO_TEST_WINDOW: `${tm.point[0]},${tm.point[1]}` } });
const ctl = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'scripts/verify/win-ctl.ps1')], { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true });
const pending = [];
readline.createInterface({ input: ctl.stdout }).on('line', (l) => pending.shift()?.(l.trim()));
const cmd = (c) => new Promise((r) => { pending.push(r); ctl.stdin.write(c + '\n'); });

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
if (args.includes('--break-cut')) await ev(`(() => { const st = document.createElement('style'); st.textContent = '#prepareView h1{margin-left:-4000px!important}'; document.head.append(st); })()`);

const hwnd = await cmd(`find ${app.pid} Poster Studio`);
if (hwnd === 'none') throw new Error('앱 창을 못 찾음');
const state = async () => { const [visible, x, y, cw, ch, dpi, zoomed] = (await cmd(`state ${hwnd}`)).split(' ').map(Number); return { visible, x, y, cw, ch, dpi, zoomed }; };
const [mL, mT, mR, mB, aL, aT, aR, aB] = (await cmd(`monitor ${tm.point[0]} ${tm.point[1]}`)).split(' ').map(Number);
const monitor = { bounds: [mL, mT, mR, mB], work: [aL, aT, aR, aB] };

const MEASURE = `(() => {
  const vis = (e) => { if (e.closest('[hidden], dialog:not([open])')) return false; const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false; const b = e.getBoundingClientRect(); return b.width > 0.5 && b.height > 0.5; };
  const name = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\\s+/).join('.') : '');
  const modal = [...document.querySelectorAll('dialog[open]')].find((x) => x.matches(':modal'));
  const scope = (e) => !modal || modal.contains(e);
  const d = document.documentElement, se = document.scrollingElement;
  const vscroll = se.scrollHeight > innerHeight + 1, hscroll = d.scrollWidth > d.clientWidth + 0.5;
  // ① 넘침을 숨긴 칸에서 잘린 글자(«…» 줄임 · 줄 수 제한은 일부러 한 것이라 뺀다)
  const clippedText = [...document.querySelectorAll('body *')].filter((e) => {
    if (!scope(e) || !vis(e) || ![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return false;
    const s = getComputedStyle(e); if (s.textOverflow === 'ellipsis' || s.webkitLineClamp !== 'none') return false;
    const hide = (v) => v === 'hidden' || v === 'clip';
    return (hide(s.overflowX) && e.scrollWidth > e.clientWidth + 1) || (hide(s.overflowY) && e.scrollHeight > e.clientHeight + 2);
  }).map((e) => name(e) + ': ' + e.textContent.trim().slice(0, 24));
  const ctrls = [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button]')].filter((e) => vis(e) && scope(e) && !e.classList.contains('skip-link'));
  const clipBox = (e) => { let r = { t: 0, b: innerHeight, l: 0, rr: innerWidth }; for (let p = e.parentElement; p && p !== document.body && p !== d; p = p.parentElement) { const s = getComputedStyle(p); if (s.overflowY !== 'visible' || s.overflowX !== 'visible') { const b = p.getBoundingClientRect(); r = { t: Math.max(r.t, b.top), b: Math.min(r.b, b.bottom), l: Math.max(r.l, b.left), rr: Math.min(r.rr, b.right) }; } } return r; };
  // ② 화면 옆 밖 단추 ③ 보이는 칸 밖 단추(문서 스크롤로 닿는 아래쪽은 세로 스크롤 값으로 따로 적는다)
  const offside = ctrls.filter((e) => { const b = e.getBoundingClientRect(); return b.left < -0.5 || b.right > innerWidth + 0.5; }).map(name);
  const hiddenCtrls = ctrls.filter((e) => { const b = e.getBoundingClientRect(), c = clipBox(e); const reach = c.b === innerHeight && vscroll; return b.top < c.t - 0.5 || b.left < c.l - 0.5 || b.right > c.rr + 0.5 || (b.bottom > c.b + 0.5 && !reach); }).map(name);
  // ④ 문서 스크롤 없이 화면 밖으로 나간 주요 요소
  const main = [...document.querySelectorAll('h1, h2, h3, img, video, label, .cameraBox, .camera-film-scene, .camera-ticket, .result-poster, .poster-option')].filter((e) => vis(e) && scope(e));
  // 넘침을 숨긴 칸 안에서 일부러 잘라 쓰는 것(머리글 로고 칸, 카메라 칸을 덮는 예시 영상)은 그 칸이 보여 주는 부분으로 판정한다 — 칸 자체가 화면 밖이면 걸리고, 칸에 가려 하나도 안 보여도 걸린다.
  const shown = (e) => { const b = e.getBoundingClientRect(); let l = b.left, t = b.top, r = b.right, bm = b.bottom; for (let p = e.parentElement; p && p !== document.body && p !== d; p = p.parentElement) { const s = getComputedStyle(p), c = p.getBoundingClientRect(); if (s.overflowX !== 'visible') { l = Math.max(l, c.left); r = Math.min(r, c.right); } if (s.overflowY !== 'visible') { t = Math.max(t, c.top); bm = Math.min(bm, c.bottom); } } return { l, t, r, b: bm }; };
  const cut = main.filter((e) => { const v = shown(e); return v.r - v.l < 0.5 || v.b - v.t < 0.5 || (v.b > innerHeight + 0.5 && !vscroll) || v.r > innerWidth + 0.5 || v.l < -0.5 || v.t < -0.5; }).map((e) => { const v = shown(e); return name(e) + (e.currentSrc || e.src ? ' ' + String(e.currentSrc || e.src).split('/').pop().slice(0, 30) : '') + ' 보이는 칸 [' + [v.l, v.t, v.r, v.b].map((n) => Math.round(n)).join(',') + '] ' + getComputedStyle(e).position + ' 부모 ' + name(e.parentElement); });
  // 안쪽 스크롤 칸 — 문서는 그대로인데 칸 안에서만 스크롤되는 곳(한 페이지에 다 보이지 않는 것이다)
  const innerScroll = [...document.querySelectorAll('body *')].filter((e) => { if (!scope(e) || !vis(e)) return false; const s = getComputedStyle(e); return ((s.overflowY === 'auto' || s.overflowY === 'scroll') && e.scrollHeight > e.clientHeight + 1) || ((s.overflowX === 'auto' || s.overflowX === 'scroll') && e.scrollWidth > e.clientWidth + 1); }).map((e) => name(e) + ' ' + e.clientWidth + '×' + e.clientHeight + ' 내용 ' + e.scrollWidth + '×' + e.scrollHeight);
  return { step: document.body.dataset.step, iw: innerWidth, ih: innerHeight, ihExact: visualViewport.height, dpr: devicePixelRatio, docW: d.scrollWidth, docH: se.scrollHeight, clientW: d.clientWidth, hscroll, vscroll, over: se.scrollHeight - innerHeight, clippedText, offside, hiddenCtrls, cut, innerScroll };
})()`;
const settle = () => ev(`new Promise((r) => { const t = setTimeout(r, 500); requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(t); r(); })); })`);
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(out, 'shots', `${name}.png`), Buffer.from(r.result.data, 'base64')); return `shots/${name}.png`; };

// 크기 목록 — 최대화해 작업 영역에서 안쪽 크기를 알고, 창을 풀어 테두리 두께를 잰 뒤 그 모니터에 들어가는 가장 큰 안쪽 크기를 정한다
await cmd(`show ${hwnd} 3`);
await sleep(600);
const maxed = await state();
const scale = maxed.dpi / 96;
await cmd(`show ${hwnd} 9`);
await sleep(400);
await cmd(`client ${hwnd} ${Math.round(1100 * scale)} ${Math.round(648 * scale)} ${aL} ${aT}`);
await sleep(300);
const frame = (await cmd(`state ${hwnd}`)).split(' ');
const outerNow = await ev(`[outerWidth, outerHeight]`);
const frameW = Math.ceil((outerNow[0] - (Number(frame[3]) / scale))), frameH = Math.ceil((outerNow[1] - (Number(frame[4]) / scale)));
const maxW = Math.floor((aR - aL) / scale) - frameW, maxH = Math.floor((aB - aT) / scale) - frameH;
const ws0 = [], hs0 = [];
for (let w = 1100; w <= maxW; w += W_STEP) ws0.push(w);
for (let h = 648; h <= maxH; h += H_STEP) hs0.push(h);
ws0.push(maxW, ...[1280, 1366].filter((w) => w <= maxW));
hs0.push(maxH, ...[679, 680, 699, 700, 729, 730].filter((h) => h <= maxH));
// CSS 구간 경계 사이의 소수 높이 — 125%면 실제 874화소가 699.2다. «최대 699» · «최소 700» 어느 쪽에도 들지 않는 틈이라 실제 화소 하나하나로 잰다(11/7 실측: 3단계 안쪽 칸이 20px 넘쳤다).
for (const n of [679, 699, 729]) for (let p = Math.ceil(n * scale); p <= Math.floor((n + 1) * scale); p++) if (p / scale <= maxH) hs0.push(p / scale);
const WS = [...new Set(ws0)].sort((a, b) => a - b), HS = [...new Set(hs0)].sort((a, b) => a - b);
const report = { exe, startedAt: new Date().toISOString(), monitor, dpi: maxed.dpi, scale, maximizedClient: [maxed.cw, maxed.ch], maxClientCss: [maxW, maxH], widths: WS, heights: HS, emulation: false, screens: {} };

const SCREENS = [
  { key: '1단계', enter: async () => {} },
  { key: '2단계', enter: async () => { await ev(`document.getElementById('prepareNextBtn').click()`); if (!await waitFor(`document.body.dataset.step === '2'`)) throw new Error('2단계로 가지 않음'); await sleep(1200); } },
  { key: '3단계', enter: async () => { await ev(`document.getElementById('shotBtn').click()`); if (!await waitFor(`document.body.dataset.step === '3' && document.querySelectorAll('#resultView .style-option.thumb').length === 8`, 60000)) throw new Error('3단계로 가지 않음'); await sleep(1500); } },
  { key: '인쇄 미리보기', enter: async () => { await ev(`document.getElementById('printBtn').click()`); if (!await waitFor(`document.querySelector('.print-preview')?.open === true`)) throw new Error('인쇄 미리보기가 열리지 않음'); await sleep(600); } },
];
const row = (m, label, phys) => ({ label, physClient: phys, iw: m.iw, ih: m.ih, ihExact: m.ihExact, dpr: m.dpr, docW: m.docW, docH: m.docH, hscroll: m.hscroll, vscroll: m.vscroll, over: m.over, clipped: m.clippedText.length + m.offside.length + m.hiddenCtrls.length + m.cut.length, clippedText: m.clippedText, offside: m.offside, hiddenCtrls: m.hiddenCtrls, cut: m.cut, innerScroll: m.innerScroll });
const safe = (s) => s.replace(/\s+/g, '-');
for (const sc of SCREENS) {
  await sc.enter();
  const rows = [];
  await cmd(`show ${hwnd} 3`);
  await sleep(500);
  await settle();
  const st = await state();
  const r0 = row(await ev(MEASURE), '최대화', [st.cw, st.ch]);
  r0.zoomed = st.zoomed; r0.shot = await shot(`${safe(sc.key)}-최대화`);
  rows.push(r0);
  await cmd(`show ${hwnd} 9`);
  await sleep(300);
  for (const w of WS) for (const h of HS) {
    const a = (await cmd(`client ${hwnd} ${Math.round(w * scale)} ${Math.round(h * scale)} ${aL} ${aT}`)).split(' ');
    await settle();
    await sleep(40);
    const m = row(await ev(MEASURE), `${w}×${h}`, [Number(a[1]), Number(a[2])]);
    m.want = [w, h];
    m.sizeOk = Math.abs(m.iw - w) <= 1 && Math.abs(m.ih - h) <= 1;
    if ((w === WS[0] && h === HS[0]) || (w === maxW && h === maxH)) m.shot = await shot(`${safe(sc.key)}-${w}x${h}`);
    rows.push(m);
  }
  report.screens[sc.key] = rows;
  const bad = rows.filter((r) => r.hscroll || r.vscroll || r.clipped);
  console.log(`${sc.key}: 잰 크기 ${rows.length} · 가로 스크롤 ${rows.filter((r) => r.hscroll).length} · 세로 스크롤 ${rows.filter((r) => r.vscroll).length} · 잘린 요소 있는 크기 ${rows.filter((r) => r.clipped).length} · 안쪽 스크롤 칸 있는 크기 ${rows.filter((r) => r.innerScroll.length).length} · 창이 그 크기가 안 된 것 ${rows.filter((r) => r.sizeOk === false).length} · 걸린 크기 ${bad.length}`);
}
report.finishedAt = new Date().toISOString();
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));

// 표
const lines = [`# 설치판 실제 창 측정 — ${report.startedAt}`, '', `- 앱: \`${exe}\``, `- 모니터: 전체 ${monitor.bounds.join(',')} · 작업 영역 ${monitor.work.join(',')} · ${maxed.dpi} DPI(배율 ${scale})`, `- 강제 크기(CDP Emulation): 쓰지 않음. 창 크기는 Windows로 바꿈`, `- 크기: 최대화(실제 화소 ${maxed.cw}×${maxed.ch}) + 안쪽 CSS 폭 ${WS.join(' · ')} × 높이 ${HS.join(' · ')}`, '', '## 화면별 요약', '', '| 화면 | 잰 크기 | 최대화 안쪽(CSS) | 최대화 문서 폭×높이 | 가로 스크롤 | 세로 스크롤 | 잘린 요소 있는 크기 | 안쪽 스크롤 칸 있는 크기 | 창이 그 크기가 안 된 것 |', '|---|---|---|---|---|---|---|---|---|'];
for (const [k, rows] of Object.entries(report.screens)) {
  const m = rows[0];
  lines.push(`| ${k} | ${rows.length} | ${m.iw}×${m.ih} | ${m.docW}×${m.docH} | ${rows.filter((r) => r.hscroll).length} | ${rows.filter((r) => r.vscroll).length} | ${rows.filter((r) => r.clipped).length} | ${rows.filter((r) => r.innerScroll.length).length} | ${rows.filter((r) => r.sizeOk === false).length} |`);
}
lines.push('', '## 최대화 값', '', '| 화면 | 안쪽 창 | 문서 폭×높이 | 가로 | 세로(넘친 px) | 잘린 요소 | 안쪽 스크롤 칸 | 캡처 |', '|---|---|---|---|---|---|---|---|');
for (const [k, rows] of Object.entries(report.screens)) { const m = rows[0]; lines.push(`| ${k} | ${m.iw}×${m.ih} | ${m.docW}×${m.docH} | ${m.hscroll ? '있음' : '없음'} | ${m.vscroll ? `있음(${m.over})` : '없음'} | ${m.clipped} | ${m.innerScroll.join(' / ') || '없음'} | ${m.shot} |`); }
lines.push('', '## 스크롤 · 잘림이 있는 크기', '', '| 화면 | 크기 | 문서 폭×높이 | 가로 | 세로(넘친 px) | 잘린 요소 | 무엇 | 안쪽 스크롤 칸 |', '|---|---|---|---|---|---|---|---|');
for (const [k, rows] of Object.entries(report.screens)) for (const m of rows.filter((r) => r.hscroll || r.vscroll || r.clipped)) lines.push(`| ${k} | ${m.label} | ${m.docW}×${m.docH} | ${m.hscroll ? '있음' : '없음'} | ${m.vscroll ? `있음(${m.over})` : '없음'} | ${m.clipped} | ${[...m.clippedText, ...m.offside, ...m.hiddenCtrls, ...m.cut].slice(0, 4).join(' · ').replace(/\|/g, '/')} | ${m.innerScroll.slice(0, 2).join(' / ')} |`);
fs.writeFileSync(path.join(out, '표.md'), lines.join('\n') + '\n');

const all = Object.values(report.screens).flat();
const failed = all.filter((r) => r.hscroll || r.vscroll || r.clipped || r.innerScroll.length || r.sizeOk === false).length;
await ev('window.close()').catch(() => {});
ws.close();
ctl.stdin.write('quit\n');
await sleep(1500);
try { app.kill(); } catch { /* 이미 끝남 */ }
console.log(failed || !all.length ? `걸림 ${failed}개 크기 / ${all.length}` : `모두 통과 ${all.length}개 크기`);
process.exit(failed || !all.length ? 1 : 0);
