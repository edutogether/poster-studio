/* 촬영 화면(2단계)에 들어가는 순간 예시 칸에 무엇이 그려지는지 프레임마다 기록한다
   (2026-10-20 Bumm님 «개인 촬영 영상이 시작할 때 사진이 잠깐 뜨는 것 같다», 팀장 전달).

     node scripts/verify/camera-entry-frames.mjs <주소> <결과 폴더> [--sizes 1366x768,2560x1600,390x844@3] [--modes solo,group] [--ms 1500]

   크기 × 모드마다 새 프로필(캐시 없음)로 «처음» 방문하고, 같은 브라우저로 다시 열어 «두번째» 방문을 잰다.
   1단계 «다음» 단추를 진짜 클릭(CDP 입력)으로 누르고, 그 뒤 --ms 동안 화면 프레임(Page.startScreencast)을 모두 받는다.
   프레임마다 촬영 칸 가운데(글자 · 단추가 얹히는 아래쪽은 뺀다)를 같은 자리에 그린 기준 그림과 견준다 — 페이지 안 캔버스에서
   하므로 같은 출처 그림을 읽을 수 있다. 기준: 첫 프레임(still) · 끝 정지 그림(endStill) · 옛 예시 사진(camera-student · camera-group).
   먼저 클릭 직전 프레임(1단계 화면)과 같은 자리를 견줘 같으면 «1단계»(페이지는 2단계로 바뀌었지만 아직 그려지지 않은 프레임 — 10/20 실측 1장).
   그다음 가장 가까운 기준의 평균 차이가 MATCH 미만이고 둘째보다 세 배 이상 가까우면 그 이름, 아니면 칸이 한 색이면 «빈 칸», 영상이 보이는 중이면 «영상», 그 밖은 «기타».
   판정(하나라도 어긋나면 종료코드 1): 2단계가 그려진 뒤의 프레임은 «첫 프레임»과 «영상»만이어야 한다.
   2단계 프레임이 0장이거나 «첫 프레임»이 한 장도 없으면 그것도 실패(빈 게이트 방지).
   프레임은 <결과 폴더>/<크기>-<모드>-<방문>/<클릭 뒤 ms>-<이름>.jpg, 요약은 <결과 폴더>/report.json. 카메라 · 인쇄 · AI 서버는 막는다(생성 0). */
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const positional = args.filter((a, i) => !a.startsWith('--') && !['--sizes', '--modes', '--ms'].includes(args[i - 1]));
const url = positional[0] || 'http://127.0.0.1:5500/';
const out = path.resolve(positional[1] || path.join(os.tmpdir(), 'camera-entry-frames'));
const sizes = opt('--sizes', '1366x768,2560x1600,390x844@3').split(',').map((s) => { const [wh, dpr] = s.split('@'); const [w, h] = wh.split('x').map(Number); return { w, h, dpr: Number(dpr || 1) }; });
const modes = opt('--modes', 'solo,group').split(',');
const windowMs = Number(opt('--ms', '1500'));
const MATCH = 24;   // 평균 차이(0~255) — 같은 그림을 프레임(JPEG)으로 받아 줄여 견주면 4~16(10/20 라이브: 첫 프레임 4.1, 끝 정지 그림 15.2), 다른 그림끼리는 75 이상
const manifest = JSON.parse(fss.readFileSync('src/studio/camera-videos.json', 'utf8'));
const delay = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));
const report = [];
const fails = [];
await fs.mkdir(out, { recursive: true });

// 페이지가 열릴 때마다: 카메라 · 인쇄 막기, 알림 숨기기(캡처를 가린다), 예시 칸 상태가 바뀔 때마다 시각과 함께 적기
const pageScript = `
  if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => { throw Error('확인 중 카메라 차단'); };
  window.print = () => { throw Error('확인 중 인쇄 차단'); };
  document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '.studio-status{display:none!important}'; document.head.append(s); });
  window.__ce = []; let last = '';
  const tick = () => {
    const img = document.querySelector('.camera-example-still'), v = document.querySelector('.camera-example-video');
    const e = { step: document.body ? document.body.dataset.step : null, still: img ? img.getAttribute('src') : null, stillShown: img ? img.dataset.active : null, video: v ? v.dataset.active : null };
    const key = JSON.stringify(e);
    if (key !== last) { last = key; window.__ce.push(Object.assign({ t: Date.now() }, e)); }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);`;

// 페이지 안에서: 촬영 칸 가운데를 작게 줄여 기준 그림들과 견준다
const classifierScript = (refs, baseline) => `(async () => {
  const box = document.querySelector('#cameraView .cameraBox').getBoundingClientRect();
  const stage = document.querySelector('.camera-example-stage');
  const st = stage ? stage.getBoundingClientRect() : box;
  const R = { x: box.x + box.width * 0.06, y: box.y + box.height * 0.08, w: box.width * 0.88, h: box.height * 0.6 };   // 아래 글자 · 원형 단추 자리 뺌
  const W = 96, H = Math.max(8, Math.round(W * R.h / R.w));
  const load = async (src) => { const im = new Image(); im.src = src; await im.decode(); return im; };
  const pixels = (draw) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, W, H); draw(g); return g.getImageData(0, 0, W, H).data; };
  const k = W / R.w;
  window.__refs = {};
  for (const [name, src] of ${JSON.stringify(Object.entries(refs))}) {
    const im = await load(src);
    window.__refs[name] = pixels((g) => g.drawImage(im, (st.x - R.x) * k, (st.y - R.y) * k, st.width * k, st.height * k));
  }
  const crop = async (dataUrl) => { const im = await load(dataUrl); const f = im.naturalWidth / innerWidth; return pixels((g) => g.drawImage(im, R.x * f, R.y * f, R.w * f, R.h * f, 0, 0, W, H)); };
  const diff = (p, q) => { let s = 0; for (let i = 0; i < p.length; i += 4) s += Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]); return +(s / (W * H * 3)).toFixed(1); };
  const before = await crop(${JSON.stringify(baseline)});
  window.__classify = async (dataUrl) => {
    const p = await crop(dataUrl);
    const mad = {};
    for (const [name, q] of Object.entries(window.__refs)) mad[name] = diff(p, q);
    const step1 = diff(p, before);
    let sum = 0, sq = 0; const n = W * H;
    for (let i = 0; i < p.length; i += 4) { const y = (p[i] + p[i + 1] + p[i + 2]) / 3; sum += y; sq += y * y; }
    const sd = Math.sqrt(Math.max(0, sq / n - (sum / n) ** 2));
    return { mad, step1, sd: +sd.toFixed(1) };
  };
  return true;
})()`;

async function run({ w, h, dpr }, mode, port) {
  const entry = manifest.find((e) => e.mode === mode);
  assert.ok(entry && entry.status === 'approved' && entry.still && entry.endStill, `${mode}: 승인된 영상 항목(첫 · 끝 정지 그림)이 있어야 잰다`);
  const refs = { '첫 프레임': entry.still, '끝 정지 그림': entry.endStill, '옛 예시 사진': mode === 'group' ? '/studio/camera-group.webp' : '/studio/camera-student.webp' };
  const tag = `${w}x${h}${dpr > 1 ? '@' + dpr : ''}`;
  // 크롬 프로필은 임시 폴더(C:)에 둔다 — 크기 × 모드마다 새 프로필이라 «처음» 방문은 캐시가 비어 있다.
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'entry-chrome-'));
  const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--mute-audio', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--window-size=1920,1080', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let socket, seq = 0;
  const pending = new Map();
  let frames = null;
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
      if (m.method === 'Page.screencastFrame') {
        if (frames) frames.push({ data: m.params.data, t: m.params.metadata.timestamp ? m.params.metadata.timestamp * 1000 : Date.now() });
        call('Page.screencastFrameAck', { sessionId: m.params.sessionId }).catch(() => {});
      }
    };
    const evaluate = async (expression) => { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); assert.ok(!r.exceptionDetails, JSON.stringify(r.exceptionDetails)); return r.result.value; };
    await call('Network.enable');
    // 라이브(https)는 AI 서버만, 로컬(http)은 https 전부를 막는다(camera-example-probe.mjs와 같은 규칙)
    await call('Network.setBlockedURLs', { urls: url.startsWith('https://') ? ['https://*.cloudfunctions.net/*'] : ['https://*'] });
    await call('Page.enable');
    await call('Page.addScriptToEvaluateOnNewDocument', { source: pageScript });
    await call('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: w < 768 });
    for (const visit of ['처음', '두번째']) {
      await call('Page.navigate', { url });
      let ready = false;
      for (let i = 0; i < 200; i++) { if (await evaluate('!!document.getElementById("prepareNextBtn") && !document.getElementById("splash")')) { ready = true; break; } await delay(100); }
      assert.ok(ready, `${tag} ${mode} ${visit}: 첫 화면이 열리지 않음`);
      await evaluate('document.fonts.ready.then(() => true)');
      await evaluate(`(document.querySelector('[data-mode="${mode}"]').click(), true)`);
      await delay(300);
      // 단추를 먼저 화면 가운데로 옮겨 둔다 — 스크롤이 녹화에 섞이지 않게
      const b = await evaluate(`(() => { const el = document.getElementById('prepareNextBtn'); el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect();
        const x = r.x + r.width / 2, y = r.y + r.height / 2; return el.contains(document.elementFromPoint(x, y)) ? { x, y } : null; })()`);
      assert.ok(b, `${tag} ${mode} ${visit}: «다음» 단추 가운데가 가려져 있다`);
      await delay(300);
      frames = [];
      await call('Page.startScreencast', { format: 'jpeg', quality: 90, everyNthFrame: 1 });
      await delay(300);
      const t0 = Date.now();
      for (const type of ['mousePressed', 'mouseReleased']) await call('Input.dispatchMouseEvent', { type, x: b.x, y: b.y, button: 'left', clickCount: 1 });
      await delay(windowMs);
      await call('Page.stopScreencast');
      const got = frames; frames = null;
      const log = await evaluate('window.__ce');
      const step2 = log.find((e) => e.step === '2');
      assert.ok(step2, `${tag} ${mode} ${visit}: 2단계로 넘어가지 않음`);
      const baseline = [...got].reverse().find((f) => f.t < t0);
      assert.ok(baseline, `${tag} ${mode} ${visit}: 클릭 전 프레임(1단계 화면)이 없다`);
      await evaluate(classifierScript(refs, 'data:image/jpeg;base64,' + baseline.data));
      const dir = path.join(out, `${tag}-${mode}-${visit}`);
      await fs.mkdir(dir, { recursive: true });
      const rows = [];
      for (const f of got) {
        if (f.t < t0 - 50) continue;
        const ms = Math.round(f.t - t0);
        let label;
        let detail = null;
        if (f.t < step2.t) label = '1단계';
        else {
          detail = await evaluate(`window.__classify(${JSON.stringify('data:image/jpeg;base64,' + f.data)})`);
          const [[best, bestMad], [, nextMad]] = Object.entries(detail.mad).sort((a, c) => a[1] - c[1]);
          const state = [...log].reverse().find((e) => e.t <= f.t) || step2;
          if (detail.step1 < 3) label = '1단계';
          else if (bestMad < MATCH && bestMad * 3 < nextMad) label = best;
          else if (detail.sd < 4) label = '빈 칸';
          else if (state.video === 'true') label = '영상';
          else label = '기타';
        }
        rows.push({ ms, label, ...(detail || {}) });
        await fs.writeFile(path.join(dir, `${String(Math.max(0, ms)).padStart(4, '0')}-${label}.jpg`), Buffer.from(f.data, 'base64'));
      }
      const after = rows.filter((r) => r.label !== '1단계');
      const segments = [];
      for (const r of after) { const s = segments[segments.length - 1]; if (s && s.label === r.label) { s.to = r.ms; s.n++; } else segments.push({ label: r.label, from: r.ms, to: r.ms, n: 1 }); }
      const bad = after.filter((r) => !['첫 프레임', '영상'].includes(r.label));
      const problems = [];
      if (!after.length) problems.push('2단계 프레임 0장');
      if (!after.some((r) => r.label === '첫 프레임')) problems.push('«첫 프레임»이 한 장도 없음');
      if (bad.length) problems.push(`허용 밖 ${bad.length}장: ${[...new Set(bad.map((r) => r.label))].join(' · ')}`);
      const line = segments.map((s) => `${s.label} ${s.from}~${s.to}ms(${s.n}장)`).join(' → ');
      console.log(`${tag} ${mode} ${visit}: 2단계 표시 ${step2.t - t0}ms · ${line}${problems.length ? '  ← ' + problems.join(' / ') : ''}`);
      report.push({ size: tag, mode, visit, step2Ms: step2.t - t0, segments, problems, log: log.map((e) => ({ ...e, t: e.t - t0 })), frames: rows });
      if (problems.length) fails.push(`${tag} ${mode} ${visit}: ${problems.join(' / ')}`);
    }
  } finally { socket?.close(); chrome.kill(); await delay(500); await fs.rm(profile, { recursive: true, force: true }).catch(() => {}); }
}

let port = 9561;
for (const size of sizes) for (const mode of modes) await run(size, mode, port++);
await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
console.log(fails.length ? `실패 ${fails.length}건\n${fails.join('\n')}` : `통과 — ${report.length}번 모두 2단계가 첫 프레임부터 그려졌다`);
process.exit(fails.length ? 1 : 0);
