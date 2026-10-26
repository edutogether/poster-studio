#!/usr/bin/env node
/* 느린 망 첫 방문 · 재방문 재기(2026-10-24 Bumm님 «와이파이 환경에서 너무 느려서 제대로 사용하지 못할 정도», 팀장 전달) — 고치기 전과 뒤를 같은 자로 잰다.

     node scripts/verify/net-perf.mjs <주소> <결과 폴더> [--net slow4g|fast3g|wifi] [--device pc|phone] [--flow] [--real <AI 초>] [--replay] [--repeat] [--prewarm]

   창 없는 크롬(새 프로필 = 캐시 없음)으로 망을 흉내 내고(slow4g: 지연 150ms · 내려받기 1.6Mbps, fast3g: 562ms · 1.47Mbps, wifi: 40ms · 10Mbps):
     ① 첫 방문 — 첫 그림(FCP) · 큰 그림(LCP) · 1단계가 쓸 수 있게 된 때(스플래시가 걷히고 «주인공이 될 순간 만들러 가기»가 보임) ·
        그때까지 받은 용량 · 요청 수, 그리고 5초 더 기다리며 미리 받는 것까지
     ② 재방문 — 같은 창에서 다시 열기(캐시 그대로): 같은 수치 · 캐시에서 온 요청 수
     ③ --flow: 첫 방문 뒤 2단계로 넘어가 예시 영상 · «샘플 포스터 보기» → 로딩 → 3단계까지 — 단계마다 받은 용량 · 걸린 시간
     ④ --real N: 첫 방문 뒤 진짜 생성 흐름(가짜 카메라 · 찍기 · 생성). AI 응답은 N초 뒤에 준다 — 망에 안 나간다.
        · 기본: 페이지 안에서 작은 그림으로 답한다(응답 그림을 받는 시간은 빠진다)
        · --replay(2026-10-26): 같은 출처의 /__replay/answer로 보내 scripts/verify/serve-dist.mjs --replay <응답 JSON>이 N초 뒤 그 응답을
          압축 없이(라이브 함수와 같다) 보낸다 — 실제 응답 그림(약 3.1MB)을 흉내 낸 망으로 받는 시간까지 잰다. 응답 완료 = 본문을 다 받은 때
        · --repeat(2026-10-26): 첫 방문 생성 뒤 같은 창(캐시 그대로)을 다시 열어 생성을 한 번 더 — 부스 노트북의 두 번째 아이
        · --prewarm(2026-10-26): 첫 방문 뒤 생성 전에, 앱 번들에 적힌 대기 영상 · 정지 그림 주소를 전부 받아 둔다(같은 망 흉내로) —
          행사 전에 노트북 캐시를 채워 둔 상태. 받은 것은 «미리 받기» 단계로 따로 센다
        생성마다: 누른 때 → 응답 완료 → 포스터가 보임, 받은 용량, 대기 영상 장면별 재생 여부(.generation-robot-video[data-active]),
        같은 파일을 망에서 두 번 이상 받은 것(영상의 구간 요청은 뺀다)
        · 대기 영상 장면별 재생 기록(2026-10-26): 영상 요소의 미디어 이벤트를 받아 장면마다 영상 시작까지 걸린 시간 · 재생 중 멈춤
          횟수(첫 playing 뒤의 waiting) · 멈춘 시간(waiting → 다음 playing, 장면이 끝나면 거기까지) · 끝까지 재생(ended)을 적는다.
          «정상 재생» = 영상이 재생됐고 재생 중 멈춤이 0회. 같은 영상 파일을 망에서 끝까지 두 번 받은 것(영상 바이트가 파일 크기를 넘음)도 센다
   결과: 표준 출력 표 + <결과 폴더>/net-perf.json(요청 전부: 주소 · 종류 · 받은 바이트 · 캐시 여부 · 언제). 큰 파일 위 10개를 함께 적는다.
   생성(/generate)은 부르지 않는다 — 페이지가 진짜 생성 요청을 내면 종료코드 2. 라이브 /health(읽기 전용)는 페이지가 원래 부른다. */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const [url, outArg] = args.filter((a, i) => !a.startsWith('--') && !['--net', '--device', '--real'].includes(args[i - 1]));
if (!url || !outArg) { console.error('사용법: node scripts/verify/net-perf.mjs <주소> <결과 폴더> [--net slow4g|fast3g|wifi] [--device pc|phone] [--flow] [--real <AI 초>] [--replay] [--repeat] [--prewarm]'); process.exit(2); }
const NETS = { slow4g: { latency: 150, down: 1.6e6, up: 750e3 }, fast3g: { latency: 562.5, down: 1.47e6, up: 675e3 }, wifi: { latency: 40, down: 10e6, up: 5e6 } };
const netName = opt('--net', 'slow4g'); const net = NETS[netName]; if (!net) { console.error('망: ' + Object.keys(NETS).join(' · ')); process.exit(2); }
const device = opt('--device', 'pc');
const FLOW = args.includes('--flow');
const REAL = Number(opt('--real', 0));
const REPLAY = args.includes('--replay');
const REPEAT = args.includes('--repeat');
const PREWARM = args.includes('--prewarm');
if ((REPLAY || REPEAT) && !REAL) { console.error('--replay · --repeat는 --real <AI 초>와 같이 쓴다'); process.exit(2); }
const out = path.resolve(outArg); await fs.mkdir(out, { recursive: true });
const delay = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'netperf-'));
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--ignore-certificate-errors',
  '--remote-debugging-port=0', `--user-data-dir=${dir}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let port;
for (let i = 0; i < 100 && !port; i++) { try { port = (await fs.readFile(path.join(dir, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; } catch { await delay(100); } }
let target;
for (let i = 0; i < 50 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch { /* 아직 */ } if (!target) await delay(100); }
const ws = new globalThis.WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let seq = 0; const pend = new Map();
const reqs = new Map();   // requestId → { url, type, bytes, cached, t0, t1, phase }
let phase = '';
let generate = 0;
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
  const p = m.params;
  if (m.method === 'Network.requestWillBeSent') {
    if (/cloudfunctions\.net.*\/generate|\/generate\?|\/generate$/.test(p.request.url)) generate++;
    reqs.set(p.requestId, { url: p.request.url, type: p.type, bytes: 0, cached: false, t0: p.timestamp, phase });
  }
  if (m.method === 'Network.responseReceived') { const r = reqs.get(p.requestId); if (r) { r.mime = p.response.mimeType; r.status = p.response.status;
    const hd = p.response.headers || {}; r.total = Number(String(hd['content-range'] ?? hd['Content-Range'] ?? '').split('/')[1]) || Number(hd['content-length'] ?? hd['Content-Length']) || 0; if (p.response.fromDiskCache || p.response.fromMemoryCache || p.response.fromServiceWorker) r.cached = true; } }
  if (m.method === 'Network.requestServedFromCache') { const r = reqs.get(p.requestId); if (r) r.cached = true; }
  // 받은 만큼 센다 — 끝까지 안 받고 끊긴 요청(장면이 넘어가 그만 받은 대기 영상 등)도 망을 쓴 것이다
  if (m.method === 'Network.dataReceived') { const r = reqs.get(p.requestId); if (r) r.bytes += p.encodedDataLength; }
  if (m.method === 'Network.loadingFinished') { const r = reqs.get(p.requestId); if (r) { r.bytes = Math.max(r.bytes, p.encodedDataLength); r.t1 = p.timestamp; } }
  if (m.method === 'Network.loadingFailed') { const r = reqs.get(p.requestId); if (r) { r.failed = true; r.t1 = p.timestamp; } }
};
const call = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expression) => { const m = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); return m.result?.result?.value; };
const waitFor = async (expr, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(expr).catch(() => false)) return Date.now() - t; await delay(50); } return null; };

await call('Network.enable');
await call('Network.setCacheDisabled', { cacheDisabled: false });
await call('Network.emulateNetworkConditions', { offline: false, latency: net.latency, downloadThroughput: net.down / 8, uploadThroughput: net.up / 8 });
await call('Network.setBlockedURLs', { urls: ['*cloudfunctions.net*/generate*'] });
await call('Page.enable');
await call('Emulation.setDeviceMetricsOverride', device === 'phone' ? { width: 390, height: 844, deviceScaleFactor: 3, mobile: true } : { width: 1536, height: 864, deviceScaleFactor: 1.25, mobile: false });
if (device === 'phone') {
  await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await call('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
}
// 첫 그림 · 큰 그림을 페이지 안에서 받아 둔다
await call('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { window.__perf = { fcp: null, lcp: null };
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__perf.fcp = e.startTime; }).observe({ type: 'paint', buffered: true });
  new PerformanceObserver((l) => { const es = l.getEntries(); window.__perf.lcp = es[es.length - 1].startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); })();` });
const READY = '!!document.getElementById("prepareNextBtn") && !document.getElementById("splash") && !document.getElementById("bootSplash") && getComputedStyle(document.getElementById("prepareNextBtn")).visibility !== "hidden" && document.fonts.status === "loaded"';
const sum = (ph) => { const l = [...reqs.values()].filter((r) => r.phase === ph); return { req: l.length, net: l.filter((r) => !r.cached).length, cached: l.filter((r) => r.cached).length, bytes: l.reduce((a, r) => a + (r.cached ? 0 : r.bytes), 0) }; };
const kb = (b) => (b / 1024).toFixed(0) + 'KB';
// 같은 파일을 망에서 두 번 이상 받은 것 — 영상(구간 요청으로 여러 번 받는 것이 정상)과 생성 응답은 뺀다
const duplicates = (ph) => {
  const n = new Map();
  for (const r of reqs.values()) if (r.phase === ph && !r.cached && !r.failed && r.type !== 'Media' && !/\/__replay\//.test(r.url)) n.set(r.url, (n.get(r.url) || 0) + 1);
  return [...n].filter(([, c]) => c > 1).map(([u, c]) => ({ url: u.replace(/^https?:\/\/[^/]+/, ''), times: c }));
};

async function visit(name) {
  phase = name + ' 1단계까지';
  const t0 = Date.now();
  await call('Page.navigate', { url });
  const ready = (await waitFor(READY, 180000)) === null ? null : Date.now() - t0;   // 이동을 시작한 때부터
  const perf = await ev('window.__perf');
  const first = sum(phase);
  phase = name + ' 그 뒤 5초';
  await delay(5000);
  const after = sum(phase);
  return { name, ready, fcp: perf?.fcp, lcp: perf?.lcp, first, after };
}

// 진짜 생성 흐름: 가짜 카메라(캔버스) → 찍기 → «이 사진으로 포스터 만들기» → AI 응답은 REAL초 뒤에(망에 안 나감).
async function realFlow(label) {
  phase = label;
  const answer = REPLAY
    ? `{ const r = await original('/__replay/answer?delay=${REAL}', o); const buf = await r.arrayBuffer(); window.__answered = performance.now();
        return new Response(buf, { status: r.status, headers: { 'content-type': 'application/json' } }); }`
    : `{ await new Promise((r) => setTimeout(r, ${REAL} * 1000)); window.__answered = performance.now();
        return new Response(JSON.stringify({ images: [art] }), { status: 200, headers: { 'content-type': 'application/json' } }); }`;
  await ev(`(() => { const c = document.createElement('canvas'); c.width = 1024; c.height = 1536; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 1024, 1536); g.addColorStop(0, '#d9a44a'); g.addColorStop(1, '#172633'); x.fillStyle = g; x.fillRect(0, 0, 1024, 1536);
    window.__tick = setInterval(() => x.fillRect(0, 1534, 2, 2), 33); const stream = c.captureStream(30);
    navigator.mediaDevices.getUserMedia = async () => stream; const art = c.toDataURL('image/png'); const original = window.fetch;
    window.fetch = async (u, o) => { if (String(u).includes('/generate')) ${answer} return original(u, o); };
    if (!document.getElementById('cameraView').hidden) return true; scrollTo(0, 1e5); document.getElementById('prepareNextBtn').click(); return true; })()`);
  await waitFor('!document.getElementById("cameraView").hidden && !!document.getElementById("startBtn")', 30000);
  await ev('document.getElementById("startBtn").click(); true');
  await waitFor('document.getElementById("video").videoWidth > 0', 30000);
  await ev('document.getElementById("shotBtn").click(); true');
  await waitFor('!document.getElementById("generateBtn").hidden', 30000);
  // 대기 영상: 0.2초마다 «지금 장면(정지 그림 주소) · 영상이 보이는가»를 적는다
  await ev(`(() => { window.__media = []; if (!window.__mediaHooked) { window.__mediaHooked = true;
      for (const type of ['playing', 'waiting', 'stalled', 'ended', 'error']) document.addEventListener(type, (e) => { const v = e.target;
        if (v instanceof HTMLVideoElement && v.classList.contains('generation-robot-video')) window.__media.push({ t: performance.now(), type, src: v.getAttribute('src') || '', ct: v.currentTime }); }, true); }
    window.__wait = []; window.__waitTimer = setInterval(() => { const s = document.querySelector('.generation-robot-still'); const v = document.querySelector('.generation-robot-video');
    if (s) window.__wait.push({ t: performance.now(), scene: s.getAttribute('src'), video: !!v && v.dataset.active === 'true' }); }, 200);
    window.__clicked = performance.now(); document.getElementById('generateBtn').click(); return true; })()`);
  const shown = await waitFor('!document.getElementById("resultView").hidden && !!document.querySelector("#gallery img, .poster-slide img, .style-option")', 300000);
  const t = await ev(`(() => { clearInterval(window.__waitTimer); const scenes = [];
    for (const w of window.__wait) { let s = scenes[scenes.length - 1]; if (!s || s.scene !== w.scene) scenes.push(s = { scene: w.scene, start: w.t - window.__clicked, ms: 0, video: false, videoAt: null });
      s.ms += 200; if (w.video && !s.video) { s.video = true; s.videoAt = w.t - window.__clicked - s.start; } }
    // 장면마다 그 장면 영상(같은 번호)의 이벤트만 본다 — 정지 그림 «NN.webp» ↔ 영상 «NN-해시.mp4»
    const num = (u) => ((u || '').match(/\/(\d\d)(?:-[0-9a-f]+)?\.(?:webp|mp4)/) || [])[1];
    for (const s of scenes) {
      const from = window.__clicked + s.start, to = from + s.ms, id = num(s.scene);
      const evs = window.__media.filter((m) => m.t >= from - 100 && m.t <= to && num(m.src) === id);
      let first = null, rebuffers = 0, stallMs = 0, since = null, ended = false;
      for (const m of evs) {
        if (m.type === 'playing') { if (first === null) first = m.t; if (since !== null) { stallMs += m.t - since; since = null; } }
        if ((m.type === 'waiting' || m.type === 'stalled') && first !== null && since === null && !ended) { rebuffers++; since = m.t; }
        if (m.type === 'ended') { ended = true; if (since !== null) { stallMs += m.t - since; since = null; } }
      }
      if (since !== null) stallMs += to - since;
      Object.assign(s, { id, startMs: first === null ? null : first - from, rebuffers, stallMs: Math.round(stallMs), ended, errors: evs.filter((m) => m.type === 'error').length });
    }
    return { answered: window.__answered - window.__clicked, shown: performance.now() - window.__clicked, scenes }; })()`);
  await delay(2000);
  // 1초 넘게 보인 장면만(넘어가는 순간 한 번 잡힌 것은 뺀다). «AI 대기 중» = 응답 완료 전에 시작한 장면 — 응답 뒤 장면은 조판 중이라 따로 본다
  const scenes = (t.scenes || []).filter((s) => s.ms >= 1000);
  const waiting = scenes.filter((s) => s.start < t.answered);
  // 같은 영상 파일을 망에서 파일 크기보다 많이 받았으면 두 번 받은 것이다(구간 요청 여러 번은 합이 파일 크기를 넘지 않는다).
  // 파일 크기는 응답 머리글(Content-Range의 전체 · Content-Length)에서 — 크기를 재려고 따로 요청하지 않는다
  const mediaBytes = new Map();
  for (const r of reqs.values()) if (r.phase === label && !r.cached && /\.mp4(\?|$)/.test(r.url)) {
    const m = mediaBytes.get(r.url) || { bytes: 0, size: 0 }; m.bytes += r.bytes; m.size = Math.max(m.size, r.total || 0); mediaBytes.set(r.url, m); }
  const videoDuplicates = [...mediaBytes].filter(([, m]) => m.size && m.bytes > m.size * 1.05).map(([u, m]) => ({ url: u.replace(/^https?:\/\/[^/]+/, ''), ...m }));
  const played = scenes.filter((s) => s.video);
  return { label, shownMs: shown === null ? null : t.shown, answeredMs: t.answered, afterAnswerMs: shown === null ? null : t.shown - t.answered,
    scenes: scenes.length, videoScenes: played.length, waitScenes: waiting.length, waitVideoScenes: waiting.filter((s) => s.video).length,
    smoothScenes: played.filter((s) => s.rebuffers === 0).length, waitSmoothScenes: waiting.filter((s) => s.video && s.rebuffers === 0).length,
    rebuffers: scenes.reduce((n, s) => n + s.rebuffers, 0), stallMs: scenes.reduce((n, s) => n + s.stallMs, 0),
    sceneLog: scenes, duplicates: duplicates(label), videoDuplicates, ...sum(label) };
}

const rows = [];
rows.push(await visit('첫 방문'));
const flow = [];
const gens = [];
if (FLOW) {
  // 2단계 → 예시 영상이 실제로 재생될 때까지
  phase = '2단계';
  await ev('scrollTo(0, 1e5); document.getElementById("prepareNextBtn").click(); true');
  const ex = await waitFor('(() => { const v = document.querySelector(".camera-example-stage video, video.camera-example"); return !!document.querySelector("#cameraView:not([hidden])") && (!v || (v.readyState >= 3 && !v.paused)); })()', 60000);
  await delay(3000);
  flow.push({ step: '2단계(예시 영상 재생까지)', ms: ex, ...sum('2단계') });
  // 샘플 포스터 보기 → 로딩 → 3단계
  phase = '로딩 → 3단계';
  await ev('(() => { const b = document.getElementById("shotBtn"); if (b && !b.hidden) b.click(); else document.getElementById("phoneShotBtn")?.click(); return true; })()');
  const done = await waitFor('!document.getElementById("resultView").hidden && !!document.querySelector("#gallery img, .poster-slide img")', 240000);
  await delay(3000);
  flow.push({ step: '샘플 → 로딩 → 3단계', ms: done, ...sum('로딩 → 3단계') });
}
if (PREWARM) {
  // 앱 번들(main-*.js)에서 대기 영상 · 정지 그림 주소를 모아 차례로 받는다 — 목록을 따로 들고 있지 않아 판이 바뀌어도 그 판의 것을 받는다
  phase = '미리 받기';
  const warmed = await ev(`(async () => { const main = [...document.querySelectorAll('script[src]')].map((x) => x.src).find((u) => /\\/assets\\/main-/.test(u));
    const text = await (await fetch(main)).text(); const urls = [...new Set(text.match(/\\/studio\\/waiting-v\\d+\\/\\d\\d(?:-[0-9a-f]{12}\\.mp4|\\.webp)/g) || [])];
    for (const u of urls) await (await fetch(u)).arrayBuffer(); return urls.length; })()`);
  if (!(warmed >= 24)) {   // 크롬 · 임시 프로필을 남기지 않고 끝낸다
    console.error(`❌ 미리 받을 대기 영상 · 정지 그림을 ${warmed}개만 찾았다(24개여야 한다)`);
    ws.close(); chrome.kill(); await delay(300); await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); process.exit(1);
  }
  flow.push({ step: `미리 받기(대기 영상 · 정지 그림 ${warmed}개)`, ms: 0, ...sum('미리 받기') });
}
if (REAL) gens.push(await realFlow(PREWARM ? '미리 받은 뒤 생성' : '첫 방문 생성'));
rows.push(await visit('재방문'));
if (REAL && REPEAT) gens.push(await realFlow('재방문 생성'));
ws.close(); chrome.kill(); await delay(300); await fs.rm(dir, { recursive: true, force: true }).catch(() => {});

for (const g of gens) flow.push({ step: `진짜 생성(AI ${REAL}초${REPLAY ? ' · 실제 응답 재생' : ' 흉내'}) ${g.label} → 3단계 · 응답 뒤 ${g.afterAnswerMs === null ? '시간 넘음' : (g.afterAnswerMs / 1000).toFixed(1) + '초'}`,
  ms: g.shownMs, req: g.req, net: g.net, cached: g.cached, bytes: g.bytes });
console.log(`망 ${netName}(지연 ${net.latency}ms · 내려받기 ${net.down / 1e6}Mbps) · 기기 ${device} · ${url}`);
console.log('| 방문 | 첫 그림 | 큰 그림 | 1단계 쓸 수 있음 | 그때까지 받은 것 | 요청(망/캐시) | 뒤 5초에 더 받은 것 |');
console.log('|---|---|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.name} | ${r.fcp ? (r.fcp / 1000).toFixed(1) + '초' : '—'} | ${r.lcp ? (r.lcp / 1000).toFixed(1) + '초' : '—'} | ${r.ready === null ? '3분 넘음' : (r.ready / 1000).toFixed(1) + '초'} | ${kb(r.first.bytes)} | ${r.first.req}(${r.first.net}/${r.first.cached}) | ${kb(r.after.bytes)} · ${r.after.req}개 |`);
for (const f of flow) console.log(`· ${f.step}: ${f.ms === null ? '시간 넘음' : (f.ms / 1000).toFixed(1) + '초'} · ${kb(f.bytes)} · 요청 ${f.req}(망 ${f.net})`);
for (const g of gens) console.log(`  └ ${g.label}: 응답 완료 ${(g.answeredMs / 1000).toFixed(1)}초 · AI 대기 중 영상 ${g.waitVideoScenes}/${g.waitScenes}장면 재생(전체 ${g.videoScenes}/${g.scenes}) · 정상 재생(멈춤 0회) ${g.smoothScenes}/${g.scenes} · 재생 중 멈춤 ${g.rebuffers}회 ${(g.stallMs / 1000).toFixed(1)}초 · 같은 파일 두 번 받기 ${g.duplicates.length}건${g.duplicates.length ? ' ' + JSON.stringify(g.duplicates).slice(0, 200) : ''} · 영상 두 번 받기 ${g.videoDuplicates.length}건`);
const all = [...reqs.values()];
const top = all.filter((r) => !r.cached).sort((a, b) => b.bytes - a.bytes).slice(0, 10);
console.log('큰 파일 위 10개(첫 방문 · 흐름, 망에서 받은 것):');
for (const r of top) console.log(`  ${kb(r.bytes).padStart(7)}  ${r.type?.padEnd(10)} ${r.phase.padEnd(12)} ${r.url.replace(/^https?:\/\/[^/]+/, '').slice(0, 90)}`);
await fs.writeFile(path.join(out, 'net-perf.json'), JSON.stringify({ net: netName, device, url, replay: REPLAY, rows, flow, gens, requests: all }, null, 1));
if (generate) { console.error(`❌ 생성 요청 ${generate}건`); process.exit(2); }
if (gens.some((g) => g.shownMs === null)) { console.error('❌ 포스터가 5분 안에 안 보였다'); process.exit(1); }
// 잴 것을 못 쟀으면 통과가 아니다(10/26 종합감사: 1단계가 안 떠도 «3분 넘음»만 찍고 0으로 끝났다 — 없는 주소를 먹여도 통과했다)
if (rows.some((r) => r.ready === null)) { console.error('❌ 1단계가 3분 안에 쓸 수 있게 되지 않았다'); process.exit(1); }
if (flow.some((f) => f.ms === null)) { console.error('❌ 흐름의 한 단계가 시간 안에 끝나지 않았다'); process.exit(1); }
