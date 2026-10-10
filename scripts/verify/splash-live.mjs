/* 스플래시 실측 — 끊김·깜빡임·글꼴 바뀜을 프레임 단위로 잰다(2026-10-09, Bumm님 «어떨 땐 뚝뚝 끊기고, 어떨 땐 깜빡이고,
   어떨 땐 글꼴이 다른 걸로 떴다가 바뀐다»).

     node scripts/verify/splash-live.mjs <주소> <결과 폴더> [--runs 3] [--cpu 4] [--net slow4g] [--record] [--width 2560 --height 1440] [--scale 3]

   한 바퀴 = 새 프로필로 첫 방문 1번 + 같은 프로필로 재방문 1번. --runs만큼 반복한다.
   페이지 안에서 requestAnimationFrame마다 적는 것: 스플래시 불투명도, 막대 위치(transform), 제목 너비(글꼴이 바뀌면
   한글 기준 13~16% 달라진다 — pretendard.css 설명), 제목 글꼴이 준비됐는지(document.fonts.check), 스플래시 그림이 그려졌는지.
   그리고 프레임 사이 간격(멈춤), 브라우저 성능 기록의 긴 작업(50ms 이상)을 같은 시간축에 놓는다.
   글꼴은 «불러왔는가»가 아니라 **실제로 그 글자를 어느 글꼴이 그렸는가**를 본다 — 40ms마다 브라우저에 제목·부제의
   실제 사용 글꼴(CSS.getPlatformFontsForNode)을 물어 바뀐 순간을 적는다. 화면 합성 쪽 끊김은 성능 기록의 프레임 항목
   (그려진 프레임 간격·버려진 프레임)으로 잰다 — 막대·페이드는 합성 단계에서 돌아 페이지 안 rAF만으로는 안 보인다.
   --net slow4g는 대여 와이파이가 붐빌 때를 흉내 낸다(왕복 150ms · 내려받기 1.6Mbps).
   --record면 화면 프레임을 원본 해상도 PNG로 받아 둔다(영상은 따로 묶는다). 생성 버튼은 누르지 않는다. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const url = args[0];
const outDir = path.resolve(args[1] || '.cache/splash-live');
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const RUNS = Number(opt('--runs', 3));
const CPU = Number(opt('--cpu', 1));
const RECORD = args.includes('--record');
const NET = opt('--net', '');
const NETS = { slow4g: { latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 } };
if (NET && !NETS[NET]) { console.error(`--net은 ${Object.keys(NETS).join('·')} 중 하나`); process.exit(2); }
const W = Number(opt('--width', 1366)), H = Number(opt('--height', 768));
// --scale: 화면 배율(휴대폰은 3). 폭이 768 미만이면 휴대폰으로 흉내 낸다 — 녹화는 배율을 곱한 원본 화소로 받는다.
const SCALE = Number(opt('--scale', 1)), MOBILE = W < 768;
if (!url) { console.error('사용: node scripts/verify/splash-live.mjs <주소> <결과 폴더> [--runs N] [--cpu N] [--net slow4g] [--record]'); process.exit(2); }
await fs.mkdir(outDir, { recursive: true });
const wait = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));

const RECORDER = `
(() => {
  const log = []; const t0 = performance.timeOrigin;
  window.__splashLog = log; window.__splashMarks = {};
  const mark = (k) => { if (!(k in window.__splashMarks)) window.__splashMarks[k] = performance.now(); };
  new MutationObserver(() => { if (document.body && document.body.classList.contains('app-ready')) mark('appReady'); })
    .observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });   // 문서 뿌리는 이 시점에 아직 없다
  document.fonts && document.fonts.addEventListener('loadingdone', (e) => {
    for (const f of e.fontfaces) mark('font:' + f.family + ':' + f.weight);
  });
  let gone = null, seen = false;
  const tick = () => {
    const now = performance.now();
    const s = document.getElementById('splash');
    if (s) seen = true;
    if (!s) { if (seen && gone === null) { gone = now; mark('splashRemoved'); } }
    else {
      const cs = getComputedStyle(s);
      const bar = s.querySelector('.sbar i'); const m = bar ? getComputedStyle(bar).transform : 'none';
      const tx = m && m.startsWith('matrix') ? Number(m.slice(7, -1).split(',')[4]) : null;
      const name = s.querySelector('.name'); const tag = s.querySelector('.stagline');
      const logo = s.querySelector('.logo img'); const edu = s.querySelector('.splash-education-logo');
      log.push({ t: now, op: Number(cs.opacity), tx, nameW: name ? name.getBoundingClientRect().width : null,
        tagW: tag ? tag.getBoundingClientRect().width : null,
        cvis: name ? getComputedStyle(name).visibility : null,
        f800: document.fonts ? document.fonts.check('800 20px Studio') : null,
        f400: document.fonts ? document.fonts.check('400 20px Studio') : null,
        logo: !!(logo && logo.complete && logo.naturalWidth), edu: !!(edu && edu.complete && edu.naturalWidth),
        ready: document.body ? document.body.classList.contains('app-ready') : false,
        play: s.getAnimations ? (s.getAnimations()[0] || {}).playState : null });
    }
    if (gone === null || now - gone < 600) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();`;

async function session(profile) {
  const port = 9541;
  const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--mute-audio',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${W},${H}`,
    // 화면 흉내(setDeviceMetricsOverride)의 배율만으로는 녹화 프레임이 CSS 화소 크기로 온다 — 창 자체를 그 배율로 띄워야 원본 화소로 받는다.
    ...(SCALE !== 1 ? [`--force-device-scale-factor=${SCALE}`] : []), 'about:blank'
  ], { windowsHide: true, stdio: 'ignore' });
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {}
    if (!target) await wait(200);
  }
  if (!target) throw new Error('헤드리스 브라우저가 뜨지 않았다');
  const ws = new globalThis.WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pend = new Map(); const events = [];
  ws.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (m.id) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
    else events.push(m);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pend.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })); });
  return { chrome, ws, send, events, close: async () => { try { await send('Browser.close'); } catch {} ws.close(); chrome.kill(); } };
}

async function visit(S, label) {
  const { send, events } = S;
  events.length = 0;
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: SCALE, mobile: MOBILE });
  await send('Emulation.setCPUThrottlingRate', { rate: CPU });
  if (NET) await send('Network.emulateNetworkConditions', { offline: false, ...NETS[NET] });
  await send('DOM.enable'); await send('CSS.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: RECORDER });
  await send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,blink.user_timing', transferMode: 'ReportEvents' });
  const frames = [];
  if (RECORD) {
    await send('Page.startScreencast', { format: 'png', maxWidth: W * SCALE, maxHeight: H * SCALE, everyNthFrame: 1 });
  }
  const onFrame = async (m) => {
    if (m.method === 'Page.screencastFrame') {
      frames.push({ ts: m.params.metadata.timestamp, data: m.params.data });
      send('Page.screencastFrameAck', { sessionId: m.params.sessionId }).catch(() => {});
    }
  };
  const origPush = events.push.bind(events);
  events.push = (m) => { onFrame(m); return origPush(m); };
  await send('Page.navigate', { url });
  const t0 = Date.now();
  /* 실제로 그린 글꼴 — 문서가 바뀔 때마다 노드 번호가 새로 매겨지므로 매번 다시 찾는다. */
  const fontLog = []; let polling = true;
  const fontKey = (fs) => fs.map((f) => `${f.familyName}${f.isCustomFont ? '(웹)' : '(시스템)'}×${f.glyphCount}`).join(' + ');
  const poll = (async () => {
    while (polling) {
      try {
        const { root } = await send('DOM.getDocument', { depth: 0 });
        const row = { t: Date.now() - t0 };
        for (const [k, sel] of [['name', '#splash .name'], ['tag', '#splash .stagline']]) {
          const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: sel });
          if (!nodeId) continue;
          const { fonts } = await send('CSS.getPlatformFontsForNode', { nodeId });
          row[k] = fontKey(fonts);
        }
        const last = fontLog[fontLog.length - 1];
        if ((row.name || row.tag) && (!last || last.name !== row.name || last.tag !== row.tag)) fontLog.push(row);
      } catch {}
      await wait(40);
    }
  })();
  let result = null;
  for (let i = 0; i < 300; i++) {
    await wait(100);
    try {
      const r = await send('Runtime.evaluate', { expression: 'JSON.stringify({m:window.__splashMarks||{},n:(window.__splashLog||[]).length,nav:performance.getEntriesByType("navigation")[0]?.toJSON()})', returnByValue: true });
      const v = JSON.parse(r.result.value || '{}');
      if (v.m && v.m.splashRemoved) { await wait(800); result = v; break; }
    } catch {}
  }
  polling = false; await poll;
  if (RECORD) await send('Page.stopScreencast');
  const gpu = await send('Runtime.evaluate', { expression: `(() => { try { const g = document.createElement('canvas').getContext('webgl'); const d = g.getExtension('WEBGL_debug_renderer_info'); return g.getParameter(d.UNMASKED_RENDERER_WEBGL); } catch (e) { return 'unknown'; } })()`, returnByValue: true }).then((r) => r.result.value).catch(() => 'unknown');
  const traceDone = new Promise((res) => { const iv = globalThis.setInterval(() => { if (events.some((e) => e.method === 'Tracing.tracingComplete')) { globalThis.clearInterval(iv); res(); } }, 50); });
  await send('Tracing.end'); await traceDone;
  const trace = events.filter((e) => e.method === 'Tracing.dataCollected').flatMap((e) => e.params.value);
  const r = await send('Runtime.evaluate', { expression: 'JSON.stringify({log:window.__splashLog||[],marks:window.__splashMarks||{},origin:performance.timeOrigin,res:performance.getEntriesByType("resource").map(e=>({n:e.name.replace(location.origin,""),s:Math.round(e.startTime),e:Math.round(e.responseEnd),sz:e.transferSize}))})', returnByValue: true });
  const page = JSON.parse(r.result.value);
  events.push = origPush;
  return { label, page, trace, frames, marks: result?.m, fontLog, gpu };
}

function analyse(v) {
  const { log, marks, res } = v.page;
  const vis = log.filter((x) => x.op > 0.01);
  const gaps = []; for (let i = 1; i < vis.length; i++) { const d = vis[i].t - vis[i - 1].t; if (d > 50) gaps.push({ at: Math.round(vis[i - 1].t), ms: Math.round(d) }); }
  // 막대가 멈췄는가: 막대는 1.15초에 266px을 간다 — 33ms(두 프레임) 넘게 같은 자리면 멈춘 것
  const stalls = []; for (let i = 1; i < vis.length; i++) { if (vis[i].tx !== null && vis[i].tx === vis[i - 1].tx && vis[i].t - vis[i - 1].t > 33) stalls.push(Math.round(vis[i].t)); }
  const widths = [...new Set(vis.map((x) => x.nameW && x.nameW.toFixed(1)))].filter(Boolean);
  // 제목 폭이 바뀌는 순간은 글자가 보일 때만 센다 — 글꼴 게이트(.fonts-wait)로 숨겨 둔 동안의 배치 변화는 화면에 안 나온다.
  const shown = vis.filter((x) => x.cvis !== 'hidden');
  const swap = []; for (let i = 1; i < shown.length; i++) if (shown[i].nameW && shown[i - 1].nameW && Math.abs(shown[i].nameW - shown[i - 1].nameW) > 1) swap.push({ at: Math.round(shown[i].t), from: shown[i - 1].nameW.toFixed(1), to: shown[i].nameW.toFixed(1) });
  const firstVis = vis[0]?.t ?? null;
  const logoLate = vis.filter((x) => !x.logo).length, eduLate = vis.filter((x) => !x.edu).length;
  const main = v.trace.filter((e) => e.name === 'RunTask' && e.ph === 'X' && e.dur > 50000);
  const navStart = v.trace.find((e) => e.name === 'navigationStart')?.ts;
  const longTasks = navStart ? main.map((e) => ({ at: Math.round((e.ts - navStart) / 1000), ms: Math.round(e.dur / 1000) })).filter((e) => e.at >= 0 && e.at < (marks.splashRemoved || 1e9)) : [];
  /* 합성 프레임: 스플래시가 보이는 동안 실제로 그려진 프레임 사이 간격과 버려진 프레임 수. */
  const inSplash = (e) => { const at = (e.ts - navStart) / 1000; return at >= (firstVis ?? 0) && at <= (marks.splashRemoved || 1e9); };
  const draws = navStart ? v.trace.filter((e) => e.name === 'DrawFrame' && inSplash(e)).map((e) => (e.ts - navStart) / 1000).sort((a, b) => a - b) : [];
  const drawGaps = []; for (let i = 1; i < draws.length; i++) { const d = draws[i] - draws[i - 1]; if (d > 50) drawGaps.push({ at: Math.round(draws[i - 1]), ms: Math.round(d) }); }
  const dropped = navStart ? v.trace.filter((e) => (e.name === 'DroppedFrame' || e.name === 'PipelineReporter' && e.args?.data?.frame_type === 'DROPPED') && inSplash(e)).length : 0;
  return {
    label: v.label, firstVisibleMs: firstVis && Math.round(firstVis), appReadyMs: marks.appReady && Math.round(marks.appReady), splashRemovedMs: marks.splashRemoved && Math.round(marks.splashRemoved),
    shownMs: firstVis && marks.splashRemoved ? Math.round(marks.splashRemoved - firstVis) : null,
    frames: vis.length, gapsOver50ms: gaps, barStalls: stalls.length, titleWidths: widths, titleWidthChanges: swap,
    f800AtFirst: vis[0]?.f800, f800AtEnd: vis[vis.length - 1]?.f800,
    contentHiddenMs: vis.length && shown.length ? Math.round(shown[0].t - vis[0].t) : null,
    shownWithoutFontFrames: shown.filter((x) => x.f800 === false).length, logoNotDrawnFrames: logoLate, eduLogoNotDrawnFrames: eduLate,
    fonts: Object.fromEntries(Object.entries(marks).filter(([k]) => k.startsWith('font:')).map(([k, t]) => [k, Math.round(t)])),
    longTasksDuringSplash: longTasks,
    drawnFrames: draws.length, drawGapsOver50ms: drawGaps, droppedFrames: dropped,
    fontsUsed: v.fontLog, gpu: v.gpu,
    fontRequests: res.filter((x) => /\.woff2/.test(x.n)).map((x) => `${x.n} ${x.s}→${x.e}ms`),
  };
}

const summary = [];
for (let run = 1; run <= RUNS; run++) {
  const profile = path.join(outDir, `profile-${run}`);
  const S = await session(profile);
  try {
    for (const label of [`첫방문-${run}`, `재방문-${run}`]) {
      const v = await visit(S, label);
      const a = analyse(v);
      summary.push(a);
      console.log(JSON.stringify(a));
      // 성능 기록 원본 — 크롬 개발자도구 «성능» 탭에 그대로 불러올 수 있다.
      await fs.writeFile(path.join(outDir, `${label}.trace.json`), JSON.stringify({ traceEvents: v.trace }));
      const traceNames = {}; for (const e of v.trace) traceNames[e.name] = (traceNames[e.name] || 0) + 1;
      await fs.writeFile(path.join(outDir, `${label}.json`), JSON.stringify({ analysis: a, log: v.page.log, marks: v.page.marks, res: v.page.res, traceNames }, null, 1));
      if (RECORD && v.frames.length) {
        const fd = path.join(outDir, `${label}-frames`); await fs.mkdir(fd, { recursive: true });
        const lines = [];
        for (let i = 0; i < v.frames.length; i++) {
          const f = `${String(i).padStart(4, '0')}.png`;
          await fs.writeFile(path.join(fd, f), Buffer.from(v.frames[i].data, 'base64'));
          const dur = i + 1 < v.frames.length ? v.frames[i + 1].ts - v.frames[i].ts : 0.5;
          lines.push(`file '${f}'`, `duration ${dur.toFixed(4)}`);
        }
        lines.push(`file '${String(v.frames.length - 1).padStart(4, '0')}.png'`);
        await fs.writeFile(path.join(fd, 'list.txt'), lines.join('\n'));
      }
    }
  } finally { await S.close(); await wait(500); }
}
await fs.writeFile(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 1));
