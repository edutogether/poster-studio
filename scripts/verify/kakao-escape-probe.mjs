/* 카카오톡 안 브라우저 → 바깥 브라우저 넘기기(src/kakaoEscape.ts, 2026-10-20)를 카카오톡 UA로 흉내 내 확인한다.

     node scripts/verify/kakao-escape-probe.mjs <주소> <결과 폴더>

   기기 셋: 아이폰 카카오톡(390×664 · 3배) · 갤럭시 카카오톡(360×740 · 3배) · 아이폰 사파리(대조군, 넘기면 안 됨).
   기기마다 같은 탭으로 두 번 연다(두 번째 = 새로 고침). 앱이 요청한 이동은 CDP Page.frameRequestedNavigation으로 받는다 —
   헤드리스 크롬은 kakaotalk:// 를 열 앱이 없으니 화면은 그대로 남고, 그래서 «실패하면 안내»까지 같은 실행에서 본다.
   판정(하나라도 어긋나면 종료코드 1):
   - 카카오톡: 첫 열기에 이동 요청이 정확히 하나, 주소 = kakaotalk://web/openExternal?url=<encodeURIComponent(연 주소)>,
     줄이 처음 보인 때(앱이 실행된 때)부터 0.1초에 «브라우저로 여는 중…», 2.3초에 «다른 브라우저로 열기» 안내. 두 번째 열기는 이동 요청 0 · 안내가 바로 보임.
     시각은 페이지를 연 때가 아니라 줄이 처음 보인 때부터 잰다 — 라이브 첫 방문은 앱 파일을 받는 데 시간이 걸려 고정 시각으로 재면 어긋났다(10/20).
   - 안내 줄은 글자만 있으면 안 되고 화면 맨 위에 실제로 보여야 한다(가운데 점이 줄 안 — 10/20 스플래시에 가려진 채 글자 검사만 통과했다).
   - 사파리: 이동 요청 0 · 안내 줄 없음.
   캡처(원본 해상도 PNG)는 <결과 폴더>/<기기>-<열기>-<초>.png, 기록은 report.json. 카메라 · 인쇄 · AI 서버는 막는다(생성 0). */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const url = args[0] || 'http://127.0.0.1:5500/';
const out = path.resolve(args[1] || path.join(os.tmpdir(), 'kakao-escape-probe'));
const devices = [
  { name: '아이폰-카카오톡', kakao: true, w: 390, h: 664, dpr: 3, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.0' },
  { name: '갤럭시-카카오톡', kakao: true, w: 360, h: 740, dpr: 3, ua: 'Mozilla/5.0 (Linux; Android 15; SM-S921N Build/AP3A.240905.015; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.58 Mobile Safari/537.36 KAKAOTALK/10.8.0 (INAPP)' },
  { name: '아이폰-사파리', kakao: false, w: 390, h: 664, dpr: 3, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' },
];
const expected = `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
const delay = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));
await fs.mkdir(out, { recursive: true });
const port = 9581;
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'kakao-chrome-'));
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--mute-audio', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--window-size=1920,1080', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let socket, seq = 0;
const pending = new Map();
let navigations = [];
const report = [];
const fails = [];
try {
  let target;
  for (let i = 0; i < 50; i++) { try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); if (target) break; } catch { /* 아직 안 떴다 */ } await delay(100); }
  assert.ok(target, '브라우저 시작');
  socket = new globalThis.WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { socket.onopen = r; socket.onerror = j; });
  const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  socket.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result); return; }
    if (m.method === 'Page.frameRequestedNavigation') navigations.push(m.params.url);
  };
  const evaluate = async (expression) => { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); assert.ok(!r.exceptionDetails, JSON.stringify(r.exceptionDetails)); return r.result.value; };
  const capture = async (name) => { const s = await call('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(out, `${name}.png`), Buffer.from(s.data, 'base64')); };
  await call('Network.enable');
  await call('Network.setBlockedURLs', { urls: url.startsWith('https://') ? ['https://*.cloudfunctions.net/*'] : ['https://*'] });
  await call('Page.enable');
  await call('Page.addScriptToEvaluateOnNewDocument', { source: "if(navigator.mediaDevices){navigator.mediaDevices.getUserMedia=async()=>{throw Error('확인 중 카메라 차단');};}window.print=()=>{throw Error('확인 중 인쇄 차단');};" });
  // 안내 줄 글자. 줄이 있는데 다른 것(스플래시 등)에 가려 있으면 «가려짐»을 붙인다.
  const bannerText = () => evaluate(`(() => { const b = document.querySelector('.kakao-escape'); if (!b) return null;
    const r = b.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + Math.min(r.height / 2, 12));
    return (b.contains(top) ? '' : '[가려짐] ') + b.textContent; })()`);
  for (const d of devices) {
    await call('Emulation.setUserAgentOverride', { userAgent: d.ua });
    await call('Emulation.setDeviceMetricsOverride', { width: d.w, height: d.h, deviceScaleFactor: d.dpr, mobile: true });
    await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    // 세션 저장소는 출처(탭)마다라, 기기를 바꿀 때 비운다 — 기기마다 «첫 열기»부터 잰다.
    await call('Page.navigate', { url: 'about:blank' }); await delay(200);
    await call('Storage.clearDataForOrigin', { origin: new URL(url).origin, storageTypes: 'all' }).catch(() => {});
    for (const visit of ['첫열기', '새로고침']) {
      navigations = [];
      await call('Page.navigate', { url });
      // 앱이 실행되어 줄이 생길 때까지(카카오톡이 아니면 앱이 다 뜰 때까지) 기다린 뒤 그때부터 잰다
      let t0 = Date.now();
      for (let i = 0; i < 160; i++) {
        if (await evaluate("!!document.querySelector('.kakao-escape') || !!document.getElementById('prepareNextBtn')").catch(() => false)) { t0 = Date.now(); break; }
        await delay(50);
      }
      await delay(Math.max(0, 100 - (Date.now() - t0)));
      const at03 = await bannerText();
      await capture(`${d.name}-${visit}-0.1초`);
      await delay(Math.max(0, 2300 - (Date.now() - t0)));
      const at23 = await bannerText();
      await capture(`${d.name}-${visit}-2.3초`);
      const kakaoNavs = navigations.filter((u) => u.startsWith('kakaotalk:'));
      const problems = [];
      if (d.kakao && visit === '첫열기') {
        if (kakaoNavs.length !== 1) problems.push(`이동 요청 ${kakaoNavs.length}개(1개여야 함)`);
        else if (kakaoNavs[0] !== expected) problems.push(`이동 주소 다름: ${kakaoNavs[0]}`);
        if (at03 !== '브라우저로 여는 중…') problems.push(`0.1초 줄: ${at03}`);
        if (!at23 || !at23.includes('다른 브라우저로 열기')) problems.push(`2.3초 줄: ${at23}`);
      } else if (d.kakao) {
        if (kakaoNavs.length) problems.push(`다시 넘김 ${kakaoNavs.length}번(0이어야 함)`);
        if (!at03 || !at03.includes('다른 브라우저로 열기')) problems.push(`0.1초 줄: ${at03}`);
      } else {
        if (kakaoNavs.length) problems.push(`카카오톡이 아닌데 넘김 ${kakaoNavs.length}번`);
        if (at03 !== null || at23 !== null) problems.push('카카오톡이 아닌데 안내 줄이 있음');
      }
      console.log(`${d.name} ${visit}: 이동 요청 ${kakaoNavs.length ? kakaoNavs.join(' ') : '없음'} · 0.1초 «${at03 ?? '줄 없음'}» · 2.3초 «${at23 ?? '줄 없음'}»${problems.length ? '  ← ' + problems.join(' / ') : ''}`);
      report.push({ device: d.name, visit, userAgent: d.ua, size: `${d.w}x${d.h}@${d.dpr}`, navigations: kakaoNavs, expected: d.kakao && visit === '첫열기' ? expected : null, at03, at23, problems });
      if (problems.length) fails.push(`${d.name} ${visit}: ${problems.join(' / ')}`);
    }
  }
} finally { socket?.close(); chrome.kill(); await delay(500); await fs.rm(profile, { recursive: true, force: true }).catch(() => {}); }
await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
console.log(fails.length ? `실패 ${fails.length}건\n${fails.join('\n')}` : '통과 — 카카오톡은 한 번만 넘기고 실패 안내를 남김, 사파리는 그대로');
process.exit(fails.length ? 1 : 0);
