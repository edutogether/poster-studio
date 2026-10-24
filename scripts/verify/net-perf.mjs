#!/usr/bin/env node
/* 느린 망 첫 방문 · 재방문 재기(2026-10-24 Bumm님 «와이파이 환경에서 너무 느려서 제대로 사용하지 못할 정도», 팀장 전달) — 고치기 전과 뒤를 같은 자로 잰다.

     node scripts/verify/net-perf.mjs <주소> <결과 폴더> [--net slow4g|fast3g|wifi] [--device pc|phone] [--flow] [--real <AI 초>]

   창 없는 크롬(새 프로필 = 캐시 없음)으로 망을 흉내 내고(slow4g: 지연 150ms · 내려받기 1.6Mbps, fast3g: 562ms · 1.47Mbps, wifi: 40ms · 10Mbps):
     ① 첫 방문 — 첫 그림(FCP) · 큰 그림(LCP) · 1단계가 쓸 수 있게 된 때(스플래시가 걷히고 «주인공이 될 순간 만들러 가기»가 보임) ·
        그때까지 받은 용량 · 요청 수, 그리고 5초 더 기다리며 미리 받는 것까지
     ② 재방문 — 같은 창에서 다시 열기(캐시 그대로): 같은 수치 · 캐시에서 온 요청 수
     ③ --flow: 첫 방문 뒤 2단계로 넘어가 예시 영상 · «샘플 포스터 보기» → 로딩 → 3단계까지 — 단계마다 받은 용량 · 걸린 시간
     ④ --real N: 첫 방문 뒤 진짜 생성 흐름(가짜 카메라 · 찍기 · 생성) — AI 응답은 페이지 안에서 N초 뒤에 준다(망에 안 나감, 실제 응답 그림을 받는
        시간은 빠진다). 응답이 온 뒤 포스터가 보일 때까지를 따로 적는다(--flow와 같이 쓰지 않는다 — 앞 흐름이 3단계에서 끝난다)
   결과: 표준 출력 표 + <결과 폴더>/net-perf.json(요청 전부: 주소 · 종류 · 받은 바이트 · 캐시 여부 · 언제). 큰 파일 위 10개를 함께 적는다.
   생성(/generate)은 부르지 않는다 — 샘플 흐름만 지난다(페이지가 생성 요청을 내면 종료코드 2). */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const [url, outArg] = args.filter((a, i) => !a.startsWith('--') && !['--net', '--device', '--real'].includes(args[i - 1]));
if (!url || !outArg) { console.error('사용법: node scripts/verify/net-perf.mjs <주소> <결과 폴더> [--net slow4g|fast3g|wifi] [--device pc|phone] [--flow] [--real <AI 초>]'); process.exit(2); }
const NETS = { slow4g: { latency: 150, down: 1.6e6, up: 750e3 }, fast3g: { latency: 562.5, down: 1.47e6, up: 675e3 }, wifi: { latency: 40, down: 10e6, up: 5e6 } };
const netName = opt('--net', 'slow4g'); const net = NETS[netName]; if (!net) { console.error('망: ' + Object.keys(NETS).join(' · ')); process.exit(2); }
const device = opt('--device', 'pc');
const FLOW = args.includes('--flow');
const REAL = Number(opt('--real', 0));
const out = path.resolve(outArg); await fs.mkdir(out, { recursive: true });
const delay = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'netperf-'));
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--mute-audio', '--autoplay-policy=no-user-gesture-required',
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
  if (m.method === 'Network.responseReceived') { const r = reqs.get(p.requestId); if (r) { r.mime = p.response.mimeType; r.status = p.response.status; if (p.response.fromDiskCache || p.response.fromMemoryCache || p.response.fromServiceWorker) r.cached = true; } }
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
const rows = [];
rows.push(await visit('첫 방문'));
const flow = [];
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
if (REAL) {
  // 진짜 생성 흐름: 가짜 카메라(캔버스) → 찍기 → «이 사진으로 포스터 만들기» → AI 응답은 페이지 안에서 REAL초 뒤에 준다(망에 안 나감).
  // 응답이 온 뒤 포스터가 보일 때까지 = 조판 준비(글꼴 · 로고)를 응답 뒤에 받느라 더 기다리는 시간.
  phase = '진짜 생성';
  await ev(`(() => { const c = document.createElement('canvas'); c.width = 1024; c.height = 1536; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 1024, 1536); g.addColorStop(0, '#d9a44a'); g.addColorStop(1, '#172633'); x.fillStyle = g; x.fillRect(0, 0, 1024, 1536);
    window.__tick = setInterval(() => x.fillRect(0, 1534, 2, 2), 33); const stream = c.captureStream(30);
    navigator.mediaDevices.getUserMedia = async () => stream; const art = c.toDataURL('image/png'); const original = window.fetch;
    window.fetch = async (u, o) => { if (String(u).includes('/generate')) { await new Promise((r) => setTimeout(r, ${REAL} * 1000)); window.__answered = performance.now();
      return new Response(JSON.stringify({ images: [art] }), { status: 200, headers: { 'content-type': 'application/json' } }); } return original(u, o); };
    if (!document.getElementById('cameraView').hidden) return true; scrollTo(0, 1e5); document.getElementById('prepareNextBtn').click(); return true; })()`);
  await waitFor('!document.getElementById("cameraView").hidden && !!document.getElementById("startBtn")', 30000);
  await ev('document.getElementById("startBtn").click(); true');
  await waitFor('document.getElementById("video").videoWidth > 0', 30000);
  await ev('document.getElementById("shotBtn").click(); true');
  await waitFor('!document.getElementById("generateBtn").hidden', 30000);
  await ev('window.__clicked = performance.now(); document.getElementById("generateBtn").click(); true');
  const shown = await waitFor('!document.getElementById("resultView").hidden && !!document.querySelector("#gallery img, .poster-slide img, .style-option")', 300000);
  const t = await ev('({ answered: window.__answered - window.__clicked, shown: performance.now() - window.__clicked })');
  await delay(2000);
  flow.push({ step: `진짜 생성(AI ${REAL}초 흉내) → 3단계 · 응답 뒤 ${shown === null ? '시간 넘음' : ((t.shown - t.answered) / 1000).toFixed(1) + '초'}`, ms: shown === null ? null : t.shown, ...sum('진짜 생성') });
}
rows.push(await visit('재방문'));
ws.close(); chrome.kill(); await delay(300); await fs.rm(dir, { recursive: true, force: true }).catch(() => {});

console.log(`망 ${netName}(지연 ${net.latency}ms · 내려받기 ${net.down / 1e6}Mbps) · 기기 ${device} · ${url}`);
console.log('| 방문 | 첫 그림 | 큰 그림 | 1단계 쓸 수 있음 | 그때까지 받은 것 | 요청(망/캐시) | 뒤 5초에 더 받은 것 |');
console.log('|---|---|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.name} | ${r.fcp ? (r.fcp / 1000).toFixed(1) + '초' : '—'} | ${r.lcp ? (r.lcp / 1000).toFixed(1) + '초' : '—'} | ${r.ready === null ? '3분 넘음' : (r.ready / 1000).toFixed(1) + '초'} | ${kb(r.first.bytes)} | ${r.first.req}(${r.first.net}/${r.first.cached}) | ${kb(r.after.bytes)} · ${r.after.req}개 |`);
for (const f of flow) console.log(`· ${f.step}: ${f.ms === null ? '시간 넘음' : (f.ms / 1000).toFixed(1) + '초'} · ${kb(f.bytes)} · 요청 ${f.req}(망 ${f.net})`);
const all = [...reqs.values()];
const top = all.filter((r) => !r.cached).sort((a, b) => b.bytes - a.bytes).slice(0, 10);
console.log('큰 파일 위 10개(첫 방문 · 흐름, 망에서 받은 것):');
for (const r of top) console.log(`  ${kb(r.bytes).padStart(7)}  ${r.type?.padEnd(10)} ${r.phase.padEnd(12)} ${r.url.replace(/^https?:\/\/[^/]+/, '').slice(0, 90)}`);
await fs.writeFile(path.join(out, 'net-perf.json'), JSON.stringify({ net: netName, device, url, rows, flow, requests: all }, null, 1));
if (generate) { console.error(`❌ 생성 요청 ${generate}건`); process.exit(2); }
