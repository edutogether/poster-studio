/* 화면 알림(.studio-status — «AI 서버 연결을 확인할 수 없습니다» 등)이 단추를 덮지 않는지 잰다(2026-10-17).

     node scripts/verify/status-toast-probe.mjs [주소] [결과 폴더] [--sizes 2560x1600,1366x768,390x844@3]

   https 요청을 막아 /health 확인을 실패시키면 앱이 실제로 알림을 띄운다(행사장 와이파이가 흔들릴 때와 같은 화면).
   1단계·2단계(카메라 차단)·3단계(개발 서버 ?preview=posters — 서버 확인을 안 해 같은 문구를 알림 칸에 넣어 잼)에서 화면에 보이는 단추·입력칸마다 알림과 겹치는 넓이를 재고, 하나라도 겹치면 종료코드 1.
   알림이 화면 안에 다 보이지 않아도 실패다. 휴대폰(폭 768 미만, 화면이 스크롤된다)만은 단추 없는 빈자리가 없어, 알림이 손가락 입력을
   흘려보낼 때(pointer-events: none) 겹침을 허용하고 목록으로만 적는다.
   알림이 뜨지 않거나 잴 단추가 0개면 그것도 실패다(빈 검사가 되지 않게). 캡처는 원본 해상도 PNG(<크기>-<단계>.png). */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--sizes');
const url = positional[0] || 'http://localhost:5602/';
const out = path.resolve(positional[1] || '.cache/status-toast-probe');
const sizes = opt('--sizes', '2560x1600,1366x768,390x844@3').split(',').map((s) => { const [wh, dpr] = s.split('@'); const [w, h] = wh.split('x').map(Number); return { w, h, dpr: Number(dpr || 1) }; });
await fs.mkdir(out, { recursive: true });
const port = 9548;
// 크롬 프로필은 임시 폴더에 둔다 — 결과 폴더(.cache 안)에 두면 확장 코드 수천 줄을 린트가 훑는다(2026-10-17).
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'probe-chrome-'));
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--no-default-browser-check', '--mute-audio', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const delay = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));
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
  const capture = async (name) => { const s = await call('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(out, `${name}.png`), Buffer.from(s.data, 'base64')); };
  const measure = () => evaluate(`(() => {
    const t = document.querySelector('.studio-status'); if (!t || t.hidden || !document.getElementById('status').textContent.trim()) return null;
    const a = t.getBoundingClientRect();
    const hits = [];
    let count = 0;
    for (const el of document.querySelectorAll('button, input, a[href], select, textarea')) {
      if (t.contains(el) || el.closest('dialog:not([open])') || el.closest('[hidden]')) continue;
      const b = el.getBoundingClientRect(); if (b.width < 2 || b.height < 2 || b.bottom < 0 || b.top > innerHeight || b.right < 0 || b.left > innerWidth) continue;
      const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none') continue;
      count++;
      const ow = Math.min(a.right, b.right) - Math.max(a.left, b.left), oh = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ow > 0 && oh > 0) hits.push((el.id || el.className || el.tagName) + ' ' + Math.round(ow) + '×' + Math.round(oh));
    }
    const onScreen = a.top >= 0 && a.left >= 0 && a.bottom <= innerHeight && a.right <= innerWidth;
    return { toast: [a.x, a.y, a.width, a.height].map(Math.round), count, hits, onScreen, passThrough: getComputedStyle(t).pointerEvents === 'none' };
  })()`);
  await call('Network.enable');
  await call('Network.setBlockedURLs', { urls: ['https://*'] });
  await call('Page.enable');
  await call('Page.addScriptToEvaluateOnNewDocument', { source: "if(navigator.mediaDevices){navigator.mediaDevices.getUserMedia=async()=>{throw Error('확인 중 카메라 차단');};}window.print=()=>{throw Error('확인 중 인쇄 차단');};" });
  for (const { w, h, dpr } of sizes) {
    const tag = `${w}x${h}${dpr > 1 ? '@' + dpr : ''}`;
    await call('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: w < 768 });
    await call('Page.navigate', { url });
    for (let i = 0; i < 150; i++) { if (await evaluate('!!document.getElementById("prepareNextBtn") && !document.getElementById("splash")')) break; await delay(100); }
    for (const step of ['step1', 'step2', 'step3']) {
      if (step === 'step2') { await evaluate('document.getElementById("prepareNextBtn").click()'); await delay(800); }
      if (step === 'step3') {
        await call('Page.navigate', { url: new URL('/?preview=posters', url).href });
        for (let i = 0; i < 150; i++) { if (await evaluate('!document.getElementById("splash") && !!document.querySelector(".result-layout")')) break; await delay(100); }
        await delay(800);
        // 미리보기 주소는 서버 확인을 하지 않아 알림이 뜨지 않는다 — 같은 알림 칸에 같은 문구를 넣어 자리만 잰다(규칙은 그대로 CSS가 정한다).
        await evaluate(`(() => { const t = document.querySelector('.studio-status'); t.hidden = false;
          document.getElementById('status').textContent = '⚠ AI 서버 연결을 확인할 수 없습니다. 와이파이를 확인해 주세요. (촬영은 가능하지만 포스터 생성이 실패할 수 있어요)'; return true; })()`);
      }
      let m = null;
      for (let i = 0; i < 100 && !m; i++) { m = await measure(); if (!m) await delay(100); }
      await capture(`${tag}-${step}`);
      if (!m) { fails.push(`${tag} ${step}: 알림이 뜨지 않았다(https 차단이 안 먹었거나 알림 자리가 바뀜)`); continue; }
      if (!m.count) fails.push(`${tag} ${step}: 잴 단추가 0개`);
      if (!m.onScreen) fails.push(`${tag} ${step}: 알림이 화면 안에 다 보이지 않는다(${m.toast.join(',')})`);
      const phone = w < 768;
      if (m.hits.length && !(phone && m.passThrough)) fails.push(`${tag} ${step}: 알림이 덮는 것 — ${m.hits.join(', ')}`);
      console.log(`${tag} ${step}: 알림 ${m.toast.join(',')} · 단추·입력칸 ${m.count}개 · 겹침 ${m.hits.length}${m.hits.length && m.passThrough ? ' (입력은 아래로 통과: ' + m.hits.join(', ') + ')' : ''}`);
    }
  }
} finally { try { socket?.close(); } catch {} chrome.kill(); await delay(500); await fs.rm(profile, { recursive: true, force: true }).catch(() => {}); }
if (fails.length) { console.error('실패:\n- ' + fails.join('\n- ')); process.exit(1); }
console.log('통과 — 알림이 화면 안에 보이고, PC에서는 어떤 단추·입력칸과도 겹치지 않는다(휴대폰 겹침은 입력이 아래로 통과하는 것만)');
