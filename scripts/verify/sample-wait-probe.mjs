/* «샘플 포스터 보기» 대기가 로딩 영상 두 편에서 멈추고, 포스터 글꼴이 늦거나 멈춰도 끝나는지 잰다(2026-11-03 Bumm님 휴대폰 «엄청 많이 열림» · «무한 로딩»).

     node scripts/verify/sample-wait-probe.mjs [주소] [결과 폴더]

   빌드를 정적 서버로 연 주소를 준다(serve-dist.mjs). 휴대폰(390×844 · 3배 · 터치)으로 1단계 → 2단계 → «샘플 포스터 보기»를 누른 뒤,
   포스터 글꼴(fonts/full · fonts/poster) 요청을 세 가지로 다룬다 — ① 그대로 ② 25초 늦춤(휴대폰 망) ③ 영영 답하지 않음(멈춘 요청).
   ①② 로딩 장면이 2개 이하이고 3단계(포스터 8장)가 열려야 통과, ③ 장면 2개 이하이고 시한(조판 준비 30초) 뒤 로딩이 닫히며 «샘플 포스터를 불러오지 못했어요» 알림이 떠야 통과.
   장면을 하나도 못 보았거나 알림 · 3단계를 못 보면 실패다(빈 검사가 되지 않게). 11/3 master(6b1ef9c)는 ②에서 장면 4개, ③에서 120초 동안 장면 15개로 걸렸다.
   https는 막고 카메라 · 인쇄는 막는다 — 생성 요청 · 과금 없음. 마지막 화면은 원본 해상도 PNG(<경우>.png). */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const url = args[0] || 'http://127.0.0.1:5600/';
const out = path.resolve(args[1] || '.cache/sample-wait-probe');
await fs.mkdir(out, { recursive: true });
const port = 9549;
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'probe-chrome-'));
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--no-default-browser-check', '--mute-audio', '--autoplay-policy=no-user-gesture-required', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const delay = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const FONT = /\/fonts\/(full|poster)\//;
const SCENE_LIMIT = 2;
const fails = [];
let socket, seq = 0;
const pending = new Map();
let mode = 'pass', armed = false;
try {
  let target;
  for (let i = 0; i < 50; i++) { try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); if (target) break; } catch {} await delay(100); }
  if (!target) throw Error('브라우저를 못 띄움');
  socket = new globalThis.WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { socket.onopen = r; socket.onerror = j; });
  const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  socket.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result); return; }
    if (m.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = m.params;
    const go = () => call('Fetch.continueRequest', { requestId }).catch(() => {});
    if (!armed || !FONT.test(request.url) || mode === 'pass') go();
    else if (mode === 'slow') globalThis.setTimeout(go, 25_000);
    // mode === 'hang': 답하지 않는다
  };
  const evaluate = async (expression) => { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result.value; };
  const capture = async (name) => { const s = await call('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(out, `${name}.png`), Buffer.from(s.data, 'base64')); };
  await call('Network.enable');
  await call('Network.setBlockedURLs', { urls: ['https://*'] });
  await call('Network.setCacheDisabled', { cacheDisabled: true });
  await call('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await call('Page.enable');
  await call('Page.addScriptToEvaluateOnNewDocument', { source: "if(navigator.mediaDevices){navigator.mediaDevices.getUserMedia=async()=>{throw Error('확인 중 카메라 차단');};}window.print=()=>{throw Error('확인 중 인쇄 차단');};" });
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
  await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await call('Emulation.setUserAgentOverride', { userAgent: IPHONE });
  for (const [name, m, limitMs] of [['그대로', 'pass', 60_000], ['글꼴 25초 늦춤', 'slow', 90_000], ['글꼴 요청 멈춤', 'hang', 90_000]]) {
    mode = m; armed = false;
    await call('Page.navigate', { url });
    let ready = false;
    for (let i = 0; i < 200 && !ready; i++) { ready = await evaluate('!!document.getElementById("prepareNextBtn") && !document.getElementById("splash")'); if (!ready) await delay(100); }
    if (!ready) { fails.push(`${name}: 첫 화면이 열리지 않았다`); continue; }
    await evaluate('document.getElementById("prepareNextBtn").click()');
    let step2 = false;
    for (let i = 0; i < 100 && !step2; i++) { step2 = await evaluate('!document.getElementById("cameraView").hidden'); if (!step2) await delay(100); }
    if (!step2) { fails.push(`${name}: 2단계가 열리지 않았다`); continue; }
    armed = true;
    await evaluate('document.getElementById("shotBtn").click()');
    const t0 = Date.now();
    const scenes = [];
    let end = null;
    while (Date.now() - t0 < limitMs && !end) {
      const s = await evaluate(`(() => {
        const d = document.getElementById('spinner');
        const art = d && d.open && d.querySelector('img, video');
        const scene = art ? (art.getAttribute('poster') || art.getAttribute('src') || '').replace(/^.*\\//, '') : '';
        const opened = !document.getElementById('resultView').hidden && document.querySelectorAll('#gallery img').length >= 8;
        const status = (document.getElementById('status')?.textContent || '').trim();
        return { scene, open: !!(d && d.open), opened, status };
      })()`);
      if (s.scene && scenes[scenes.length - 1] !== s.scene) scenes.push(s.scene);
      if (s.opened) end = { kind: 'opened' };
      else if (m === 'hang' && !s.open && scenes.length && /샘플 포스터를 불러오지 못했어요/.test(s.status)) end = { kind: 'failed', status: s.status };
      if (!end) await delay(150);
    }
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    await capture(name.replace(/\s+/g, '-'));
    if (!scenes.length) fails.push(`${name}: 로딩 장면을 하나도 못 보았다`);
    if (scenes.length > SCENE_LIMIT) fails.push(`${name}: 로딩 장면이 ${scenes.length}개 — ${SCENE_LIMIT}개까지여야 한다`);
    if (m === 'hang' ? end?.kind !== 'failed' : end?.kind !== 'opened') fails.push(`${name}: ${m === 'hang' ? '시한 뒤 알림으로 끝나지 않았다' : '3단계가 열리지 않았다'}(${secs}초)`);
    console.log(`${name}: 장면 ${scenes.length}개(${scenes.join(' → ')}) · ${end ? (end.kind === 'opened' ? '3단계 열림' : '알림 «' + end.status.replace(/\s+/g, ' ') + '»') : '끝나지 않음'} ${secs}초`);
  }
} finally { try { socket?.close(); } catch {} chrome.kill(); await delay(500); await fs.rm(profile, { recursive: true, force: true }).catch(() => {}); }
if (fails.length) { console.error('실패:\n- ' + fails.join('\n- ')); process.exit(1); }
console.log(`통과 — 샘플 대기는 로딩 장면 ${SCENE_LIMIT}개 안에서 끝나고, 글꼴이 늦으면 늦게라도 열리며, 멈추면 시한 뒤 다시 누르라고 알린다`);
