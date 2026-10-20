/* 로딩 화면 문구(장면 12개의 제목 · 빨간 문구 · 회색 설명)가 휴대폰 폭마다 실제로 어디서 줄이 바뀌는지 잰다
   (2026-10-20 저녁 Bumm님 «설명 줄을 한 줄에 나오게 하거나 어디서 끊을지 — 360 · 390 · 430에서 실제로 끊기는 자리를 조사», 팀장 전달).

     node scripts/verify/loading-linebreaks.mjs <주소> <결과 JSON>

   샘플 흐름으로 로딩 화면을 연다. 문구 칸은 장면 12개를 한 칸에 겹쳐 두므로(보이지만 않을 뿐 자리는 잡혀 있다) 한 번 열면 전부 잴 수 있다.
   글자마다 화면 위치(Range.getClientRects)를 읽어 윗변이 바뀌는 곳을 줄바꿈으로 본다. 기록: [{ id, width, title:[줄…], factTitle:[줄…], body:[줄…] }].
   대상이 0개면 실패(빈 검사 방지). 카메라 · 인쇄 · AI 서버는 막는다. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const [url = 'http://127.0.0.1:5500/', outArg = path.join(os.tmpdir(), 'loading-linebreaks.json')] = process.argv.slice(2);
const widths = [360, 390, 430];
const delay = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));
const port = 9791;
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'lines-chrome-'));
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--mute-audio', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let socket, seq = 0;
const pending = new Map();
const rows = [];
try {
  let target;
  for (let i = 0; i < 50; i++) { try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); if (target) break; } catch { /* 아직 안 떴다 */ } await delay(100); }
  assert.ok(target, '브라우저 시작');
  socket = new globalThis.WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { socket.onopen = r; socket.onerror = j; });
  const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  socket.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result); } };
  const evaluate = async (expression) => { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); assert.ok(!r.exceptionDetails, JSON.stringify(r.exceptionDetails)); return r.result.value; };
  await call('Network.enable');
  await call('Network.setBlockedURLs', { urls: url.startsWith('https://') ? ['https://*.cloudfunctions.net/*'] : ['https://*'] });
  await call('Page.addScriptToEvaluateOnNewDocument', { source: "if(navigator.mediaDevices){navigator.mediaDevices.getUserMedia=async()=>{throw Error('확인 중 카메라 차단');};}window.print=()=>{throw Error('확인 중 인쇄 차단');};" });
  for (const width of widths) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 780, deviceScaleFactor: 3, mobile: true });
    await call('Page.navigate', { url });
    for (let i = 0; i < 150; i++) { if (await evaluate('!!document.getElementById("prepareNextBtn") && !document.getElementById("splash")')) break; await delay(100); }
    await evaluate("document.getElementById('prepareNextBtn').click(), true"); await delay(600);
    await evaluate("document.getElementById('shotBtn').click(), true");
    for (let i = 0; i < 100; i++) { if (await evaluate("!!document.querySelector('#spinner .generation-copy')")) break; await delay(100); }
    await evaluate('document.fonts.ready.then(() => true)'); await delay(400);
    const got = await evaluate(`(() => {
      const lines = (el) => { const out = []; let top = null; let cur = '';
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let node;
        while ((node = walker.nextNode())) for (let i = 0; i < node.length; i++) {
          const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + 1); const rect = [...r.getClientRects()].pop();
          const ch = node.data[i]; if (!rect || !rect.width) { cur += ch; continue; }
          const t = Math.round(rect.top); if (top !== null && Math.abs(t - top) > 4) { out.push(cur); cur = ''; } top = t; cur += ch; }
        if (cur) out.push(cur); return out.map((s) => s.trim()).filter(Boolean); };
      const pick = (sel) => [...document.querySelectorAll(sel)];
      const titles = pick('#spinner .generation-copy-stack:not(.movie-fact-titles):not(.movie-fact-bodies) > *');
      const factTitles = pick('#spinner .movie-fact-titles > *');
      const bodies = pick('#spinner .movie-fact-bodies > *');
      return { titles: titles.map(lines), factTitles: factTitles.map(lines), bodies: bodies.map(lines), ids: titles.map((e) => e.textContent.trim()) };
    })()`);
    assert.ok(got.bodies.length >= 12 && got.titles.length >= 12, `${width}: 문구 칸을 못 찾음(제목 ${got.titles.length} · 설명 ${got.bodies.length})`);
    got.titles.forEach((t, i) => rows.push({ index: i, width, title: t, factTitle: got.factTitles[i], body: got.bodies[i] }));
    console.log(`${width}px: 장면 ${got.titles.length}개 — 설명이 두 줄 이상 ${got.bodies.filter((b) => b.length > 1).length}개, 빨간 문구 두 줄 이상 ${got.factTitles.filter((b) => b.length > 1).length}개, 제목 두 줄 이상 ${got.titles.filter((b) => b.length > 1).length}개`);
  }
} finally { socket?.close(); chrome.kill(); await delay(500); await fs.rm(profile, { recursive: true, force: true }).catch(() => {}); }
await fs.writeFile(path.resolve(outArg), JSON.stringify(rows, null, 1));
console.log(`기록 ${rows.length}줄 → ${path.resolve(outArg)}`);
