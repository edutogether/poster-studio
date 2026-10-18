/* 촬영 화면 예시 영상(2026-10-16, src/studio/CameraExample.tsx)이 실제 브라우저에서 어떻게 보이는지 재고 캡처한다.

     node scripts/verify/camera-example-probe.mjs [주소] [결과 폴더] [--mode solo|group] [--sizes 2560x1600,1366x768,390x844@3]

   2단계로 가는 단추를 «진짜 클릭»(CDP 입력 사건 — 사람의 클릭처럼 사용자 활성화가 생긴다)으로 눌러, 소리 있는 자동 재생이 실제와 같은
   조건에서 허용되는지 본다. 카메라·인쇄·https는 막는다. 크기마다 처음부터 다시 돌아 영상 0초부터 잰다.
   판정(하나라도 어긋나면 종료코드 1) — 승인된 영상이 그 모드에 있을 때:
   ① 영상이 실제로 재생된다(playing) · 소리 켬(muted=false) · 좌우를 뒤집지 않는다(transform none)
   ② 무대가 칸을 다 덮는다(cover) — 무대 폭·높이 ≥ 칸, 가운데 정렬(±1px)
   ③ 목록의 숫자·말풍선이 그 시각에 화면에 있고(시각마다 표본), 말풍선은 칸 안·칸 위 20% 띠 안이다
   ④ 영상이 끝나면 숫자·말풍선이 없고 마지막 프레임에 머문다(다시 재생하지 않음)
   승인된 영상이 없으면 지금 정지 그림이 그대로인지만 본다(영상 요소 0). 캡처는 원본 해상도 PNG(<크기>-<초>.png). */
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const positional = args.filter((a, i) => !a.startsWith('--') && !['--mode', '--sizes'].includes(args[i - 1]));
const url = positional[0] || 'http://127.0.0.1:5602/';
const out = path.resolve(positional[1] || '.cache/camera-example-probe');
const mode = opt('--mode', 'group');
const sizes = opt('--sizes', '2560x1600,1366x768,390x844@3').split(',').map((s) => { const [wh, dpr] = s.split('@'); const [w, h] = wh.split('x').map(Number); return { w, h, dpr: Number(dpr || 1) }; });
const entry = JSON.parse(fss.readFileSync('src/studio/camera-videos.json', 'utf8')).find((e) => e.mode === mode);
assert.ok(entry, `목록에 ${mode} 항목`);
const approved = entry.status === 'approved';
await fs.mkdir(out, { recursive: true });

const port = 9547;
// 크롬 프로필은 임시 폴더에 둔다 — 결과 폴더(.cache 안)에 두면 확장 코드 수천 줄을 린트가 훑는다(2026-10-17).
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'probe-chrome-'));
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--mute-audio', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--window-size=1920,1080', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const delay = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));
let socket, seq = 0;
const pending = new Map();
const fails = [];
const report = [];
try {
  let target;
  for (let i = 0; i < 50; i++) { try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); if (target) break; } catch {} await delay(100); }
  assert.ok(target, '브라우저 시작');
  socket = new globalThis.WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { socket.onopen = r; socket.onerror = j; });
  const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  socket.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result); } };
  const evaluate = async (expression) => { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); assert.ok(!r.exceptionDetails, JSON.stringify(r.exceptionDetails)); return r.result.value; };
  // 사람의 클릭처럼 누른다. 단추 가운데가 다른 것(개발 서버의 «AI 서버 연결» 알림 등)에 가려지면 단추에서 가려지지 않은 점을 찾아 누른다.
  const click = async (selector) => {
    const b = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      for (const fy of [0.5, 0.3, 0.7]) for (const fx of [0.5, 0.8, 0.95, 0.2, 0.05]) {
        const x = r.x + r.width * fx, y = r.y + r.height * fy; if (el.contains(document.elementFromPoint(x, y))) return { x, y };
      }
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { covered: top ? top.outerHTML.slice(0, 200) : '(화면 밖 — 단추 자리 ' + [r.x, r.y, r.width, r.height].map(Math.round) + ', 창 ' + innerWidth + '×' + innerHeight + ')' }; })()`);
    assert.ok(b && !b.covered, `${selector}가 화면에서 모두 가려져 누를 수 없다 — 가운데에 있는 것: ${b && b.covered}`);
    for (const type of ['mousePressed', 'mouseReleased']) await call('Input.dispatchMouseEvent', { type, x: b.x, y: b.y, button: 'left', clickCount: 1 });
  };
  const capture = async (name) => { const s = await call('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(out, `${name}.png`), Buffer.from(s.data, 'base64')); };
  await call('Network.enable');
  await call('Network.setBlockedURLs', { urls: ['https://*'] });
  await call('Page.enable');
  await call('Page.addScriptToEvaluateOnNewDocument', { source: "if(navigator.mediaDevices){navigator.mediaDevices.getUserMedia=async()=>{throw Error('확인 중 카메라 차단');};}window.print=()=>{throw Error('확인 중 인쇄 차단');};" });
  // https를 막아 생기는 «AI 서버 연결» 알림은 이 확인과 상관없고 캡처를 가린다 — 이 확인에서만 숨긴다(알림 자리는 status-toast-probe.mjs가 따로 본다).
  await call('Page.addScriptToEvaluateOnNewDocument', { source: "document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent='.studio-status{display:none!important}';document.head.append(s);});" });
  for (const { w, h, dpr } of sizes) {
    const tag = `${w}x${h}${dpr > 1 ? '@' + dpr : ''}`;
    await call('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: w < 768 });
    await call('Page.navigate', { url });
    for (let i = 0; i < 150; i++) { if (await evaluate('!!document.getElementById("prepareNextBtn") && !document.getElementById("splash")')) break; await delay(100); }
    await evaluate('document.fonts.ready.then(() => true)');
    await evaluate(`document.querySelector('[data-mode="${mode}"]').click()`);
    await delay(200);
    await click('#prepareNextBtn');
    await delay(300);
    await evaluate("document.querySelector('.cameraBox').scrollIntoView({ block: 'center' }) || true");   // 휴대폰은 스크롤된다 — 촬영 칸이 화면 가운데 오게 해서 캡처한다
    const measure = () => evaluate(`(() => {
      const box = document.querySelector('.cameraBox'), stage = box.querySelector('.camera-example-stage'), v = stage && stage.querySelector('video');
      const r = (el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
      return { box: r(box), stage: stage && r(stage), video: v && { t: v.currentTime, playing: !v.paused && v.dataset.active === 'true', muted: v.muted, ended: v.ended, transform: getComputedStyle(v).transform },
        videos: box.querySelectorAll('.camera-example-video').length, still: box.querySelector('img.camera-example') && box.querySelector('img.camera-example').getAttribute('src'),
        count: [...box.querySelectorAll('.camera-example-count')].map((e) => e.textContent),
        say: [...box.querySelectorAll('.camera-example-say')].map((e) => ({ text: e.textContent, ...r(e) })) };
    })()`);
    if (!approved) {
      await delay(1500);
      const m = await measure();
      if (m.videos !== 0 || !m.still) fails.push(`${tag}: 승인 전인데 정지 그림이 아니다`);
      await capture(`${tag}-still`); report.push({ size: tag, ...m });
      continue;
    }
    // 시각 표본: 각 신호의 가운데 시각 + 끝난 뒤
    const samples = [...entry.cues.map((c) => ({ at: (c.from + c.to) / 2, cue: c })), { at: entry.duration + 0.6, end: true }].sort((a, b) => a.at - b.at);
    let started = false;
    for (let i = 0; i < 80 && !started; i++) { const m = await measure(); started = Boolean(m.video && m.video.playing); if (!started) await delay(100); }
    if (!started) { fails.push(`${tag}: 영상이 재생되지 않았다`); await capture(`${tag}-not-playing`); continue; }
    for (const s of samples) {
      for (let i = 0; i < 400; i++) { const m = await measure(); if (!m.video || m.video.ended || m.video.t >= s.at) break; await delay(25); }
      const m = await measure();
      // 큰 화면 캡처는 1초 가까이 걸려 그동안 영상이 흐르면 다음 표본을 신호가 지난 뒤에 잰다(2560에서 실제로 6.13초에 잼, 10/17).
      // 그래서 캡처하는 동안만 멈췄다가 다시 재생한다 — 신호는 영상 시각으로 정해지므로 멈춰도 같은 장면이 찍힌다.
      const paused = !s.end && await evaluate(`(() => { const v = document.querySelector('.camera-example-video'); if (!v || v.ended) return false; v.pause(); return true; })()`);
      await capture(`${tag}-${s.end ? 'end' : s.at.toFixed(2)}`);
      if (paused) await evaluate(`document.querySelector('.camera-example-video').play().then(() => true, () => false)`);
      report.push({ size: tag, at: s.at, ...m });
      const { box, stage, video } = m;
      if (!video) { fails.push(`${tag} ${s.at}: 영상 요소가 없다(정지 그림으로 돌아감)`); continue; }
      if (video.muted) fails.push(`${tag}: 소리가 꺼져 있다(자동 재생 거부?)`);
      if (video.transform !== 'none') fails.push(`${tag}: 영상이 뒤집혀 있다(${video.transform})`);
      if (stage.w + 0.5 < box.w || stage.h + 0.5 < box.h) fails.push(`${tag}: 무대가 칸을 다 덮지 않는다`);
      if (Math.abs(stage.x + stage.w / 2 - (box.x + box.w / 2)) > 1 || Math.abs(stage.y + stage.h / 2 - (box.y + box.h / 2)) > 1) fails.push(`${tag}: 무대가 가운데가 아니다`);
      if (s.end) {
        if (!video.ended) fails.push(`${tag}: 끝 시각이 지났는데 영상이 끝나지 않았다`);
        if (m.count.length || m.say.length) fails.push(`${tag}: 끝난 뒤에도 숫자·말풍선이 남아 있다`);
        continue;
      }
      const c = s.cue;
      if (c.kind === 'count' && !m.count.includes(c.text)) fails.push(`${tag} ${s.at.toFixed(2)}초: 숫자 «${c.text}»가 없다(${JSON.stringify(m.count)})`);
      if (c.kind === 'say') {
        const b = m.say.find((x) => x.text === c.text);
        if (!b) fails.push(`${tag} ${s.at.toFixed(2)}초: 말풍선 «${c.text}»가 없다`);
        else {
          if (b.x < box.x - 0.5 || b.x + b.w > box.x + box.w + 0.5 || b.y < box.y - 0.5) fails.push(`${tag}: 말풍선 «${c.text}»가 칸 밖으로 나간다`);
          if (b.y + b.h > box.y + box.h * 0.2 + 0.5) fails.push(`${tag}: 말풍선 «${c.text}»가 칸 위 20% 띠 밖이다(아래 끝 ${(b.y + b.h - box.y).toFixed(0)} / 띠 ${(box.h * 0.2).toFixed(0)})`);
        }
      }
    }
  }
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  console.log(JSON.stringify({ mode, approved, 표본: report.length, 실패: fails }, null, 1));
  await call('Browser.close');
} finally { socket?.close(); chrome.kill(); await delay(500); await fs.rm(profile, { recursive: true, force: true }).catch(() => {}); }
process.exit(fails.length ? 1 : 0);
