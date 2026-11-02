/* 개인정보처리방침 휴대폰 양쪽 맞춤에서 낱말 사이가 크게 벌어진 줄이 없는지 잰다(2026-11-03 Bumm님 캡처 13 «자간이 엄청 벌어지거나 좁혀지지 않게»).

     node scripts/verify/privacy-justify-probe.mjs [방침 주소] [--widths 360,390,430] [--max 5]

   휴대폰 흉내(터치 · 아이폰 UA)로 여러 폭에서 연다. privacy.html은 device-canvas.js로 휴대폰을 기준 폭 390으로 그리므로 어느 폭에서도 화면 폭이 390이어야 한다.
   문단(.intro · .section-body p, 표 안 제외)마다 왼쪽 맞춤으로 잠깐 바꿔 줄마다 «남는 폭 ÷ 띄어쓰기 수»(= 양쪽 맞춤 때 띄어쓰기 하나가 더 벌어지는 폭)를 재고,
   마지막 줄이 아닌 줄이 --max(기본 5px)를 넘으면 실패. 문단이 양쪽 맞춤이 아니거나, 잰 문단이 0개거나, 화면 폭이 390이 아니어도 실패다.
   문구를 고치면 이 검사를 다시 돌린다 — 11/3 문구는 390에서 가장 벌어진 줄이 5px 이하다(WebKit · Chromium 같음). */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const url = args.find((a, i) => !a.startsWith('--') && !['--widths', '--max'].includes(args[i - 1])) || 'http://127.0.0.1:5600/privacy.html';
const widths = opt('--widths', '360,390,430').split(',').map(Number);
const max = Number(opt('--max', '5'));
const port = 9550;
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'probe-chrome-'));
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const delay = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const fails = [];
let socket, seq = 0;
const pending = new Map();
try {
  let target;
  for (let i = 0; i < 50; i++) { try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); if (target) break; } catch {} await delay(100); }
  if (!target) throw Error('브라우저를 못 띄움');
  socket = new globalThis.WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { socket.onopen = r; socket.onerror = j; });
  socket.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result); } };
  const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expression) => { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result.value; };
  await call('Page.enable');
  await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await call('Emulation.setUserAgentOverride', { userAgent: IPHONE });
  for (const w of widths) {
    await call('Emulation.setDeviceMetricsOverride', { width: w, height: 844, deviceScaleFactor: 3, mobile: true });
    await call('Page.navigate', { url });
    let loaded = false;
    for (let i = 0; i < 100 && !loaded; i++) { loaded = await evaluate('document.readyState === "complete"').catch(() => false); if (!loaded) await delay(100); }
    const r = await evaluate(`(async () => {
      await document.fonts.ready;
      const nodes = [...document.querySelectorAll('.intro, .section-body p')].filter(p => !p.closest('dd'));
      const paras = nodes.map((p, at) => {
        const align = getComputedStyle(p).textAlign;
        p.style.textAlign = 'left';
        const cs = getComputedStyle(p), right = p.getBoundingClientRect().right - parseFloat(cs.paddingRight);
        const chars = [];
        const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) for (let i = 0; i < n.data.length; i++) {
          const rg = document.createRange(); rg.setStart(n, i); rg.setEnd(n, i + 1);
          const rects = rg.getClientRects(); if (!rects.length) continue;
          const rc = rects[rects.length - 1]; chars.push({ ch: n.data[i], top: Math.round(rc.top), right: rc.right });
        }
        p.style.textAlign = '';
        const lines = [];
        for (const c of chars) { const l = lines[lines.length - 1]; if (l && Math.abs(l.top - c.top) < 4) l.chars.push(c); else lines.push({ top: c.top, chars: [c] }); }
        const wide = [];
        lines.forEach((l, i) => {
          if (i === lines.length - 1) return;
          const text = l.chars.map(c => c.ch).join('').trim();
          const vis = l.chars.filter(c => c.ch.trim());
          const spaces = (text.match(/ /g) || []).length, slack = right - vis[vis.length - 1].right;
          const extra = spaces ? slack / spaces : (slack > 8 ? 99 : 0);
          wide.push({ text, extra: Math.round(extra * 10) / 10 });
        });
        return { at, align, worst: wide.reduce((a, b) => (b.extra > a.extra ? b : a), { text: '', extra: 0 }) };
      });
      return { innerWidth, paras };
    })()`);
    if (r.innerWidth !== 390) fails.push(`${w}: 화면 폭 ${r.innerWidth} — 기준 폭 390이어야 한다(device-canvas.js)`);
    if (!r.paras.length) fails.push(`${w}: 잰 문단이 0개`);
    for (const p of r.paras) {
      if (p.align !== 'justify') fails.push(`${w}: 문단 ${p.at}이 양쪽 맞춤이 아니다(${p.align})`);
      if (p.worst.extra > max) fails.push(`${w}: 문단 ${p.at} «${p.worst.text}» — 띄어쓰기마다 ${p.worst.extra}px 더 벌어짐`);
    }
    const worst = r.paras.reduce((a, b) => (b.worst.extra > a.worst.extra ? b : a));
    console.log(`${w}: 화면 폭 ${r.innerWidth} · 문단 ${r.paras.length}개 · 가장 벌어진 줄 ${worst.worst.extra}px(문단 ${worst.at})`);
  }
} finally { try { socket?.close(); } catch {} chrome.kill(); await delay(500); await fs.rm(profile, { recursive: true, force: true }).catch(() => {}); }
if (fails.length) { console.error('실패:\n- ' + fails.join('\n- ')); process.exit(1); }
console.log(`통과 — 휴대폰은 폭 390 양쪽 맞춤이고, 띄어쓰기마다 더 벌어지는 폭이 ${max}px 이하다`);
