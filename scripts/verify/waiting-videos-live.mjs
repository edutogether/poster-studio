/* 대기 영상 12편이 실제 앱 화면에서 도는지 확인한다(2026-10-12 Bumm님 «12편 앱 장착», 팀장 전달).

     node scripts/verify/waiting-videos-live.mjs [결과 폴더] [--runs 8] [--url <주소>]

   빌드본(dist/)을 이 도구 안의 작은 서버(127.0.0.1, 영상 Range 요청 지원)로 열고(--url을 주면 그 주소 — 배포 직후 라이브 확인,
   2026-10-15), 헤드리스 크롬으로 샘플 흐름
   («샘플 포스터 보기» → 로딩 40초)을 12편이 다 나올 때까지 되풀이한다(장면 순서는 앱이 섞는다).
   판정: ① 12편 모두 로딩 화면에 나왔고, 나온 편마다 영상이 실제로 재생됐다(playing) — 정지 그림으로 되돌아간 편 0
         ② 재생 주소가 목록(src/studio/waiting-videos.json)과 같다
         ③ 이음매: 브라우저가 디코딩한 영상 첫 프레임과 정지 그림의 평균 화소 차이 < 4(편마다) — 정지 그림은 ffmpeg로 디코딩한
            첫 프레임이라 크롬과 색 가장자리 보간만 다르다(1~3.7, 압축 잡음 수준). 장면이 다르면 수십이 나온다(옛 정지 그림 02는 42)
   하나라도 어긋나면 종료코드 1. 서버·카메라·인쇄는 쓰지 않는다(샘플 모드). 캡처는 원본 해상도 PNG. */
import fs from 'node:fs/promises';
import fss from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const out = path.resolve(args.find((a, i) => !a.startsWith('--') && !['--runs', '--url'].includes(args[i - 1])) || '.cache/waiting-videos-live');
const RUNS = Number(opt('--runs', 8));
const DIST = path.resolve('dist');
const manifest = JSON.parse(fss.readFileSync('src/studio/waiting-videos.json', 'utf8'));
assert.equal(manifest.length, 12, '목록 12편');
const LIVE = opt('--url', '');
if (LIVE) assert.match(LIVE, /^https?:\/\/[^/]+\/?$/, '--url은 주소의 처음(예: https://poster.edutogether.kr)만');
else assert.ok(fss.existsSync(path.join(DIST, 'index.html')), 'dist/가 없다 — npm run build 먼저');
await fs.mkdir(out, { recursive: true });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.mp4': 'video/mp4', '.webp': 'image/webp',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.resolve(DIST, '.' + p);
  if (!file.startsWith(DIST + path.sep) || !fss.existsSync(file) || fss.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
  const size = fss.statSync(file).size, type = TYPES[path.extname(file)] || 'application/octet-stream';
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (range) {
    const start = range[1] ? Number(range[1]) : 0, end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${start}-${end}/${size}`, 'accept-ranges': 'bytes', 'content-length': end - start + 1, 'cache-control': 'no-store' });
    fss.createReadStream(file, { start, end }).pipe(res); return;
  }
  res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': size, 'cache-control': 'no-store' });
  fss.createReadStream(file).pipe(res);
});
if (!LIVE) await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = LIVE ? LIVE.replace(/\/?$/, '/') : `http://127.0.0.1:${server.address().port}/`;

const port = 9541;
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--mute-audio', `--remote-debugging-port=${port}`, `--user-data-dir=${out}/chrome`, '--window-size=1920,1080', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const delay = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));
let socket, seq = 0;
const pending = new Map();
let failed = false;
try {
  let target;
  for (let i = 0; i < 50; i++) { try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); if (target) break; } catch {} await delay(100); }
  assert.ok(target, '브라우저 시작');
  socket = new globalThis.WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { socket.onopen = r; socket.onerror = j; });
  const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  socket.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result); } };
  const evaluate = async (expression) => { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); assert.ok(!r.exceptionDetails, JSON.stringify(r.exceptionDetails)); return r.result.value; };
  const capture = async (name) => { const s = await call('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(out, `${name}.png`), Buffer.from(s.data, 'base64')); };
  await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  // 로딩 화면의 장면·영상 사건을 페이지 안에서 적는다(media 사건은 거품이 없어 문서에서 «잡기» 단계로 받는다).
  // 로딩 화면(#spinner) 안의 영상만 센다 — 10/19 촬영 화면 예시 영상이 2단계에서 재생되자 그 사건이 미리 정해 둔 장면 번호(6번)에 붙어 «주소 다름»으로 실패했다.
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__wv = []; const now = () => Math.round(performance.now());
    const log = (type, extra) => window.__wv.push(Object.assign({ type, t: now(), set: document.getElementById('spinner')?.dataset.setId || null }, extra));
    for (const type of ['playing', 'error', 'ended']) document.addEventListener(type, e => { if (e.target.tagName === 'VIDEO' && e.target.closest('#spinner')) log(type, { src: e.target.currentSrc }); }, true);
    new MutationObserver(() => { const s = document.getElementById('spinner'); const id = s?.dataset.setId || null; if (id !== window.__lastSet) { window.__lastSet = id; if (id) log('scene', { video: !!s.querySelector('video') }); } })
      .observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-set-id'] });   // 이 시점엔 documentElement가 아직 없을 수 있다
    window.print = () => { throw Error('확인 중 인쇄 차단'); };` });

  const seen = new Map();   // id -> { scenes, playing, fallback, src, startMs }
  for (let run = 1; run <= RUNS && seen.size < 12; run++) {
    await call('Page.navigate', { url });
    for (let i = 0; i < 100; i++) { if (await evaluate('!!document.getElementById("shotBtn") && !document.getElementById("splash")')) break; await delay(100); }
    await evaluate("document.getElementById('prepareNextBtn').click()"); await delay(400);
    assert.ok((await evaluate("document.getElementById('shotBtn').textContent")).includes('샘플 포스터 보기'), '샘플 모드(VITE_SAMPLE_MODE=1) 빌드여야 한다');
    await evaluate("document.getElementById('shotBtn').click()");
    let shot = false;
    for (let i = 0; i < 520; i++) {
      const s = await evaluate("(() => { const d = document.getElementById('spinner'); const v = d && d.querySelector('video'); return { open: !!(d && d.open), active: v ? v.dataset.active : null, step: document.body.dataset.step }; })()");
      if (s.open && s.active === 'true' && !shot && run === 1) { shot = true; await delay(1500); await capture('로딩화면-영상재생중'); }
      if (s.step === '3' && !s.open) break;
      await delay(100);
    }
    const events = await evaluate('window.__wv');
    assert.ok(events.some(e => e.type === 'scene'), '장면 기록 0건 — 기록 장치가 안 붙었다(통과가 아니라 실패)');
    let current = null;
    for (const ev of events) {
      if (ev.type === 'scene') { current = ev; const v = seen.get(ev.set) || { scenes: 0, playing: 0, fallback: 0, src: new Set(), startMs: [] }; v.scenes++; seen.set(ev.set, v); continue; }
      const v = seen.get(ev.set); if (!v) continue;
      if (ev.type === 'playing') { v.playing++; v.src.add(new URL(ev.src).pathname); if (current && current.set === ev.set) v.startMs.push(ev.t - current.t); }
      if (ev.type === 'error') v.fallback++;
    }
    console.error(`${run}바퀴: 지금까지 ${seen.size}편 — ${[...seen.keys()].sort((a, b) => a - b).join(' ')}`);
  }

  // 이음매: 브라우저 디코딩 첫 프레임 대 정지 그림
  const seams = await evaluate(`(async () => {
    const list = ${JSON.stringify(manifest.map(e => ({ id: e.id, src: e.src, still: e.still })))};
    const out = [];
    for (const e of list) {
      const img = new Image(); img.src = e.still; await img.decode();
      const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.src = e.src;
      await new Promise((ok, no) => { v.onloadeddata = ok; v.onerror = () => no(Error('영상 오류 ' + e.src)); });
      v.currentTime = 0; await new Promise(ok => { v.onseeked = ok; setTimeout(ok, 500); });
      const c = document.createElement('canvas'); c.width = c.height = 704; const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0, 704, 704); const a = g.getImageData(0, 0, 704, 704).data;
      g.drawImage(v, 0, 0, 704, 704); const b = g.getImageData(0, 0, 704, 704).data;
      let sum = 0; for (let i = 0; i < a.length; i += 4) sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      out.push({ id: e.id, seam: +(sum / (704 * 704 * 3)).toFixed(2), duration: +v.duration.toFixed(3) });
    }
    return out;
  })()`);

  const rows = manifest.map(e => {
    const v = seen.get(String(e.id)) || { scenes: 0, playing: 0, fallback: 0, src: new Set(), startMs: [] };
    const s = seams.find(x => x.id === e.id);
    return { id: e.id, 나온횟수: v.scenes, 재생: v.playing, 정지그림으로되돌아감: v.fallback, 주소맞음: [...v.src].every(p => p === e.src) && v.src.size > 0,
      재생시작ms: v.startMs.length ? Math.max(...v.startMs) : null, 이음매: s.seam, 길이초: s.duration };
  });
  await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(rows, null, 1));
  console.table(rows);
  for (const r of rows) {
    if (!(r.나온횟수 > 0 && r.재생 > 0 && r.정지그림으로되돌아감 === 0 && r.주소맞음 && r.이음매 < 4)) { failed = true; console.error(`실패: ${r.id}`); }
  }
  await call('Browser.close');
} finally { socket?.close(); chrome.kill(); if (server.listening) server.close(); }
process.exit(failed ? 1 : 0);
