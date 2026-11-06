#!/usr/bin/env node
/* 1단계 «다음»을 누른 뒤 2단계 예시 영상이 시작할 때까지 걸리는 시간을 나눠 잰다(2026-11-07 Bumm님 «넘기면 처음에 좀 딜레이되었다 시작», 팀장 전달).

     node scripts/verify/camera-start-timing.mjs <주소> <결과 폴더> [--net wifi|slow4g|none] [--sizes 1366x768,390x844@3] [--modes solo,group]
       [--reps 3] [--dwell 8000] [--cpu 1] [--type] [--cert <cert.pem>] [--reduced]

   반복마다 새 프로필(캐시 없음)로 «처음», 같은 프로필로 다시 열어 «다시»를 잰다. 1단계에서 --dwell ms 머문 뒤 진짜 클릭(CDP 입력)으로 넘어간다.
   «다시»는 영상이 캐시에 있으므로 그 값이 디코딩 · 첫 재생 준비 몫이고, «처음»과의 차이가 다운로드 몫이다.
   적는 것(모두 클릭 기준 ms): step2(화면이 2단계로) · loadstart · metadata · loadeddata · canplay · playing · frame(첫 프레임이 표시됨, requestVideoFrameCallback) · moving(둘째 표시 프레임) · ended(끝까지 재생) · stalls · stallMs(재생 중 멈춘 횟수 · 시간).
   1단계에 머무는 동안 이 크롬 프로세스들의 CPU 시간과 클릭 때 메모리도 적는다.
   영상 요청(클릭 전 / 뒤 받은 바이트, 캐시 여부, 받기 끝난 시각), 1단계 자원 끝난 시각, --type이면 1단계에서 타자를 쳐 입력 지연 · 긴 작업도 적는다.
   판정: 잴 수 없으면(첫 프레임 없음 · 영상 요청 0건이 아닌데 응답 없음 등) 결과를 숨기지 않고 ok:false와 종료코드 1.
   카메라 · 인쇄 · AI 서버는 막는다(생성 0). 결과는 <결과 폴더>/report.json. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { createHash, X509Certificate } from 'node:crypto';

const args = process.argv.slice(2);
const VALUE = new Set(['--net', '--sizes', '--modes', '--reps', '--dwell', '--cpu', '--cert']);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const [url, outArg] = args.filter((a, i) => !a.startsWith('--') && !VALUE.has(args[i - 1]));
if (!url || !outArg) { console.error('사용법: node scripts/verify/camera-start-timing.mjs <주소> <결과 폴더> [--net wifi|slow4g|none] [--sizes …] [--modes …] [--reps 3] [--dwell 8000] [--cpu 1] [--type] [--cert <cert.pem>] [--reduced]'); process.exit(2); }
const NETS = { none: null, slow4g: { latency: 150, down: 1.6e6, up: 750e3 }, wifi: { latency: 40, down: 10e6, up: 5e6 } };
const netName = opt('--net', 'wifi');
if (!(netName in NETS)) { console.error('망: ' + Object.keys(NETS).join(' · ')); process.exit(2); }
const net = NETS[netName];
const sizes = opt('--sizes', '1366x768,390x844@3').split(',').map((s) => { const [wh, dpr] = s.split('@'); const [w, h] = wh.split('x').map(Number); return { w, h, dpr: Number(dpr || 1) }; });
const modes = opt('--modes', 'solo,group').split(',');
const reps = Number(opt('--reps', '3'));
const dwell = Number(opt('--dwell', '8000'));
const cpu = Number(opt('--cpu', '1'));
const typing = args.includes('--type');
const reduced = args.includes('--reduced');
const CERT = opt('--cert', null);
const out = path.resolve(outArg);
const PLAY_LIMIT_MS = 60_000;
const delay = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
await fs.mkdir(out, { recursive: true });
const certFlag = CERT ? '--ignore-certificate-errors-spki-list=' + createHash('sha256').update(new X509Certificate(await fs.readFile(CERT)).publicKey.export({ type: 'spki', format: 'der' })).digest('base64') : '--no-first-run';

// 페이지 시각은 performance.now(), 망 시각은 벽시계로 받아 둘 다 벽시계(ms)로 맞춘다
const pageScript = `
  if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => { throw Error('확인 중 카메라 차단'); };
  window.print = () => { throw Error('확인 중 인쇄 차단'); };
  (() => {
    const wall = () => performance.timeOrigin + performance.now();
    const log = window.__t = { media: {}, frames: [], events: [], long: [], click: null, step2: null, muted: null, waits: [], resumes: [], ended: null };
    document.addEventListener('pointerdown', (e) => { if (e.target.closest && e.target.closest('#prepareNextBtn')) log.click = wall(); }, true);
    for (const name of ['loadstart', 'loadedmetadata', 'loadeddata', 'canplay', 'playing']) document.addEventListener(name, (e) => {
      const v = e.target;
      if (!v.classList || !v.classList.contains('camera-example-video') || log.media[name]) return;
      log.media[name] = wall();
      if (name === 'playing') log.muted = v.muted;
      if (name === 'loadstart' && v.requestVideoFrameCallback) {
        const seen = (now, meta) => { log.frames.push({ t: performance.timeOrigin + now, media: meta.mediaTime, n: meta.presentedFrames }); if (log.frames.length < 8) v.requestVideoFrameCallback(seen); };
        v.requestVideoFrameCallback(seen);
      }
    }, true);
    document.addEventListener('waiting', (e) => { if (e.target.classList && e.target.classList.contains('camera-example-video') && log.click) log.waits.push(wall()); }, true);
    document.addEventListener('playing', (e) => { if (e.target.classList && e.target.classList.contains('camera-example-video') && log.click) log.resumes.push(wall()); }, true);
    document.addEventListener('ended', (e) => { if (e.target.classList && e.target.classList.contains('camera-example-video')) log.ended = wall(); }, true);
    const tick = () => { if (!log.step2 && document.body && document.body.dataset.step === '2') log.step2 = wall(); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) log.events.push({ name: e.name, d: e.duration, t: performance.timeOrigin + e.startTime }); }).observe({ type: 'event', durationThreshold: 16 }); } catch { /* 없으면 안 잰다 */ }
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) log.long.push({ d: e.duration, t: performance.timeOrigin + e.startTime }); }).observe({ type: 'longtask', buffered: true }); } catch { /* 없으면 안 잰다 */ }
  })();`;

async function oneRun({ w, h, dpr }, mode, rep) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cam-start-'));
  const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--mute-audio', certFlag,
    '--remote-debugging-port=0', `--user-data-dir=${dir}`, `--window-size=${w},${h}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  const rows = [];
  let ws;
  try {
    let port;
    for (let i = 0; i < 100 && !port; i++) { try { port = (await fs.readFile(path.join(dir, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; } catch { await delay(100); } }
    if (!port) throw Error('브라우저가 뜨지 않음');
    let target;
    for (let i = 0; i < 50 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch { /* 아직 */ } if (!target) await delay(100); }
    if (!target) throw Error('페이지를 찾지 못함');
    ws = new globalThis.WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    let seq = 0; const pending = new Map(); let requests = new Map();
    const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id) { const p = pending.get(m.id); pending.delete(m.id); if (m.error) p.reject(Error(m.error.message)); else p.resolve(m.result); return; }
      const q = m.params;
      if (m.method === 'Network.requestWillBeSent') requests.set(q.requestId, { url: q.request.url, type: q.type, start: q.wallTime * 1000, base: q.wallTime * 1000 - q.timestamp * 1000, bytes: 0, chunks: [] });
      const r = q && q.requestId && requests.get(q.requestId);
      if (!r) return;
      if (m.method === 'Network.responseReceived') { r.status = q.response.status; r.cache = Boolean(q.response.fromDiskCache || q.response.fromPrefetchCache); r.first = r.base + q.timestamp * 1000; }
      if (m.method === 'Network.requestServedFromCache') r.cache = true;
      if (m.method === 'Network.dataReceived') { const n = q.dataLength; r.bytes += n; r.chunks.push({ t: r.base + q.timestamp * 1000, n }); }
      if (m.method === 'Network.loadingFinished') { r.done = r.base + q.timestamp * 1000; r.total = q.encodedDataLength; }
      if (m.method === 'Network.loadingFailed') { r.failed = q.errorText; r.done = r.base + q.timestamp * 1000; }
    };
    const evaluate = async (expression) => { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
    await call('Network.enable', { maxTotalBufferSize: 1024 * 1024, maxResourceBufferSize: 1024 * 1024 });
    await call('Network.setBlockedURLs', { urls: ['https://*.cloudfunctions.net/*', 'https://*.run.app/*'] });
    await call('Page.enable');
    await call('Page.addScriptToEvaluateOnNewDocument', { source: pageScript });
    await call('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: w < 768 });
    if (w < 768) { await call('Emulation.setUserAgentOverride', { userAgent: ANDROID_UA }); await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); }
    if (reduced) await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    if (cpu > 1) await call('Emulation.setCPUThrottlingRate', { rate: cpu });
    if (net) await call('Network.emulateNetworkConditions', { offline: false, latency: net.latency, downloadThroughput: net.down / 8, uploadThroughput: net.up / 8 });

    for (const visit of ['처음', '다시']) {
      requests = new Map();
      const navStart = Date.now();
      await call('Page.navigate', { url });
      let ready = false;
      for (let i = 0; i < 1200 && !ready; i++) { try { ready = await evaluate('!!document.getElementById("prepareNextBtn") && !document.getElementById("splash")'); } catch { /* 이동 중 */ } if (!ready) await delay(50); }
      if (!ready) throw Error('첫 화면이 열리지 않음');
      const readyAt = Date.now();
      const loadAtReady = await chromeLoad(port);
      await evaluate(`(document.querySelector('[data-mode="${mode}"]').click(), true)`);
      const typed = [];
      const dwellEnd = readyAt + dwell;
      if (typing) {
        const at = await evaluate(`(() => { const el = document.querySelector('input[type="text"], input:not([type])'); if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
        if (at) {
          for (const type of ['mousePressed', 'mouseReleased']) await call('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount: 1 });
          while (Date.now() < dwellEnd - 400) {
            const t = Date.now();
            await call('Input.dispatchKeyEvent', { type: 'keyDown', text: 'a', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 });
            await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 });
            typed.push(Date.now() - t);
            await delay(150);
          }
        }
      }
      await delay(Math.max(0, dwellEnd - Date.now()));
      const loadAtClick = await chromeLoad(port);
      const b = await evaluate(`(() => { const el = document.getElementById('prepareNextBtn'); el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); const x = r.x + r.width / 2, y = r.y + r.height / 2; return el.contains(document.elementFromPoint(x, y)) ? { x, y } : null; })()`);
      if (!b) throw Error('«다음» 단추가 가려져 있다');
      await delay(150);
      for (const type of ['mousePressed', 'mouseReleased']) await call('Input.dispatchMouseEvent', { type, x: b.x, y: b.y, button: 'left', clickCount: 1 });
      // 끝까지 재생될 때까지(최대 PLAY_LIMIT_MS) 기다린다 — 일찍 시작하고 중간에 멈추면 나아진 것이 아니다
      const limit = Date.now() + PLAY_LIMIT_MS;
      let log;
      for (;;) { log = await evaluate('window.__t'); if (log.ended || Date.now() > limit) break; await delay(100); }
      await delay(300);
      log = await evaluate('window.__t');
      const c = log.click;
      const rel = (t) => (t && c ? Math.round(t - c) : null);
      const mp4 = [...requests.values()].filter((r) => /camera-v1\/.*\.mp4/.test(r.url));
      const before = (r) => (r.cache ? 0 : r.chunks.filter((x) => x.t < c).reduce((s, x) => s + x.n, 0));   // 캐시에서 읽은 것은 망 바이트가 아니다
      const after = (r) => (r.cache ? 0 : r.chunks.filter((x) => x.t >= c).reduce((s, x) => s + x.n, 0));
      const step1Others = [...requests.values()].filter((r) => !/\.mp4/.test(r.url) && r.done && r.done < c);
      const shown = log.frames.filter((f) => f.t >= c);   // 미리 연 영상은 누르기 전에 첫 프레임을 이미 표시했다 — 누른 뒤 표시된 것만 센다
      const row = {
        size: `${w}x${h}${dpr > 1 ? '@' + dpr : ''}`, mode, rep, visit, net: netName, cpu, dwell,
        readyMs: readyAt - navStart, step1CpuSec: +(loadAtClick.cpu - loadAtReady.cpu).toFixed(2), memMBAtClick: loadAtClick.memMB,
        step2: rel(log.step2), loadstart: rel(log.media.loadstart), metadata: rel(log.media.loadedmetadata), loadeddata: rel(log.media.loadeddata), canplay: rel(log.media.canplay), playing: rel(log.media.playing),
        frame: rel(shown[0] && shown[0].t), moving: rel(shown[1] && shown[1].t), muted: log.muted,
        ended: rel(log.ended), stalls: log.waits.length, stallMs: Math.round(log.waits.reduce((sum, w) => { const back = log.resumes.find((t) => t > w); return sum + ((back || log.ended || w) - w); }, 0)),
        ok: Boolean(log.media.playing && shown.length >= 2 && log.ended),
        mp4: mp4.map((r) => ({ url: path.posix.basename(r.url), status: r.status, cache: r.cache, startMs: rel(r.start), firstMs: rel(r.first), doneMs: rel(r.done), beforeClick: before(r), afterClick: after(r), total: r.total, failed: r.failed })),
        mp4BytesBeforeClick: mp4.reduce((s, r) => s + before(r), 0), mp4BytesAfterClick: mp4.reduce((s, r) => s + after(r), 0),
        step1LastOtherDoneFromNav: step1Others.length ? Math.round(Math.max(...step1Others.map((r) => r.done)) - navStart) : null,
        step1OtherBytes: step1Others.reduce((s, r) => s + (r.total || 0), 0),
        step1LateOthers: step1Others.sort((x, y) => y.done - x.done).slice(0, 12).map((r) => ({ url: path.posix.basename(new URL(r.url).pathname), type: r.type, startMs: Math.round(r.start - navStart), doneMs: Math.round(r.done - navStart), total: r.total })),
        typedCount: typed.length, typedAckMaxMs: typed.length ? Math.max(...typed) : null,
        inputEventMaxMs: Math.round(Math.max(0, ...log.events.filter((e) => e.t < c && ['keydown', 'keypress', 'keyup', 'input', 'beforeinput'].includes(e.name)).map((e) => e.d))),
        longTasksAfterReady: log.long.filter((e) => e.t >= readyAt && e.t < c).length, longTaskMaxAfterReady: Math.round(Math.max(0, ...log.long.filter((e) => e.t >= readyAt && e.t < c).map((e) => e.d))),
      };
      rows.push(row);
      console.log(`${row.size} ${mode} ${rep} ${visit}: step2 ${row.step2} · 요청 ${row.mp4[0] ? row.mp4[0].startMs : '-'} · 첫응답 ${row.mp4[0] ? row.mp4[0].firstMs : '-'} · loadeddata ${row.loadeddata} · playing ${row.playing} · 첫프레임 ${row.frame} · 움직임 ${row.moving} · 클릭전 ${row.mp4BytesBeforeClick} · 클릭뒤 ${row.mp4BytesAfterClick}${row.ok ? '' : ' · 🔴 못 잼'}`);
    }
  } finally {
    if (ws) ws.close();
    chrome.kill();
    await delay(400);
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }).catch(() => {});
  }
  return rows;
}

// 이 크롬 프로세스들의 CPU 시간(초) · 메모리(MB). 프로세스 번호는 크롬에게 묻고, 메모리는 그 번호만 tasklist로 읽는다.
async function chromeLoad(port) {
  const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const sock = new globalThis.WebSocket(webSocketDebuggerUrl);
  await new Promise((r, j) => { sock.onopen = r; sock.onerror = j; });
  const info = await new Promise((resolve) => { sock.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id === 1) resolve(m.result); }; sock.send(JSON.stringify({ id: 1, method: 'SystemInfo.getProcessInfo' })); });
  sock.close();
  const procs = info.processInfo;
  const list = execFileSync('tasklist', ['/fo', 'csv', '/nh', '/fi', 'imagename eq chrome.exe'], { windowsHide: true, encoding: 'utf8' });
  const memory = new Map();
  for (const line of list.split('\n')) { const f = line.split('","'); if (f.length >= 5) memory.set(Number(f[1]), Number(f[4].replace(/[^0-9]/g, '')) / 1024); }
  return { cpu: +procs.reduce((s, p) => s + p.cpuTime, 0).toFixed(2), memMB: Math.round(procs.reduce((s, p) => s + (memory.get(p.id) || 0), 0)), gpuCpu: +procs.filter((p) => p.type === 'gpu-process').reduce((s, p) => s + p.cpuTime, 0).toFixed(2) };
}

const median = (a) => { const s = a.filter((x) => x !== null && x !== undefined).sort((p, q) => p - q); return s.length ? s[Math.floor(s.length / 2)] : null; };
const all = [];
for (const size of sizes) for (const mode of modes) for (let rep = 1; rep <= reps; rep++) all.push(...await oneRun(size, mode, rep));
const summary = [];
for (const size of [...new Set(all.map((r) => r.size))]) for (const mode of modes) for (const visit of ['처음', '다시']) {
  const rows = all.filter((r) => r.size === size && r.mode === mode && r.visit === visit);
  summary.push({ size, mode, visit, n: rows.length, ...Object.fromEntries(['step2', 'loadeddata', 'canplay', 'playing', 'frame', 'moving', 'ended', 'stalls', 'stallMs', 'mp4BytesBeforeClick', 'mp4BytesAfterClick', 'readyMs', 'step1CpuSec', 'memMBAtClick', 'inputEventMaxMs', 'longTaskMaxAfterReady', 'step1LastOtherDoneFromNav'].map((k) => [k, median(rows.map((r) => r[k]))])) });
}
await fs.writeFile(path.join(out, 'report.json'), JSON.stringify({ url, net: netName, cpu, dwell, typing, reduced, summary, all }, null, 1));
console.log('\n중앙값(ms · 바이트)');
console.table(summary.map((s) => ({ 크기: s.size, 모드: s.mode, 방문: s.visit, n: s.n, 화면2단계: s.step2, loadeddata: s.loadeddata, 재생: s.playing, 첫프레임: s.frame, 움직임: s.moving, 끝: s.ended, 멈춤: s.stalls, 멈춤ms: s.stallMs, 클릭전받음: s.mp4BytesBeforeClick, 클릭뒤받음: s.mp4BytesAfterClick, CPU초: s.step1CpuSec, 메모리MB: s.memMBAtClick, 입력최대: s.inputEventMaxMs, 긴작업최대: s.longTaskMaxAfterReady })));
const bad = all.filter((r) => !r.ok);
if (bad.length) { console.error(`🔴 재지 못한 판 ${bad.length}건`); process.exit(1); }
