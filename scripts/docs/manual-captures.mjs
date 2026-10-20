/* 설명서(_docs/manual/)에 넣을 화면 캡처를 만든다(2026-10-16). 실제 모드 개발 서버 + 가짜 카메라(공개 예시 그림)로 찍는다.

     node scripts/docs/manual-captures.mjs [개발 서버=http://localhost:5602/] [샘플 모드 빌드 서버=http://localhost:5500/] [--phone]

   빌드 서버는 서버가 허용하는 주소(http://localhost:5500 또는 8080)로 연다 — 두 단추 판은 열 때 /health를 부르므로 다른 주소면 «AI 서버 연결» 경고가 그림에 찍힌다.

   --phone: 휴대폰 그림(09~13)만 다시 찍는다(2026-10-20 — 첫 페이지 단추 «보러 가기»처럼 휴대폰 화면만 바뀌었을 때). PC 그림(01~08)은 그대로 둔다.

   - 생성 요청(cloudfunctions의 /generate)은 막는다 — 비용이 드는 요청은 하나도 나가지 않는다. /health는 허용해 화면에 «서버 연결» 경고가 뜨지 않게 한다.
   - 가짜 카메라 화면은 public/studio/camera-student.webp(촬영 화면 예시로 이미 공개된 지어낸 인물)를 1280×720 y4m으로 바꿔 쓴다.
   - 로딩 화면은 샘플 모드 빌드에서 찍는다(실제 생성을 하지 않고 같은 로딩 화면을 보이는 유일한 길).
   - 결과: _docs/manual/img/NN-이름.jpg(1600px 폭, 품질 88). 하나라도 못 찍으면 종료코드 1. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';

const cli = process.argv.slice(2);
const phoneOnly = cli.includes('--phone');
const [dev = 'http://localhost:5602/', sample = 'http://localhost:5500/'] = cli.filter((a) => !a.startsWith('--'));
const outDir = path.resolve('_docs/manual/img');
await fs.mkdir(outDir, { recursive: true });
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'manual-cap-'));
const y4m = path.join(tmp, 'cam.y4m');
const ff = spawnSync('ffmpeg', ['-v', 'error', '-y', '-loop', '1', '-i', path.resolve('public/studio/camera-student.webp'), '-t', '3', '-r', '15', '-pix_fmt', 'yuv420p',
  '-vf', 'scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720', y4m]);
assert.equal(ff.status, 0, '가짜 카메라 영상(y4m)을 못 만들었다: ' + ff.stderr);

const port = 9555;
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--disable-background-networking', '--mute-audio',
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`,
  `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(tmp, 'chrome')}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const delay = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));
let socket, seq = 0; const pending = new Map(); const made = [];
try {
  let target;
  for (let i = 0; i < 50; i++) { try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); if (target) break; } catch {} await delay(100); }
  assert.ok(target, '브라우저 시작');
  socket = new globalThis.WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => { socket.onopen = r; });
  socket.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result); } };
  const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expression) => { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); assert.ok(!r.exceptionDetails, JSON.stringify(r.exceptionDetails)); return r.result.value; };
  const open = async (url) => {
    await call('Page.navigate', { url });
    for (let i = 0; i < 150; i++) { if (await evaluate('!!document.getElementById("prepareNextBtn") && !document.getElementById("splash")')) break; await delay(100); }
    await evaluate('document.fonts.ready.then(() => true)'); await delay(400);
  };
  const shot = async (name, check, width = 1600) => {
    if (check) assert.ok(await evaluate(check), `${name}: 화면 조건이 맞지 않는다(${check})`);
    const s = await call('Page.captureScreenshot', { format: 'png' });
    const png = path.join(tmp, `${name}.png`); await fs.writeFile(png, Buffer.from(s.data, 'base64'));
    const jpg = path.join(outDir, `${name}.jpg`);
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', png, '-vf', `scale=${width}:-2:flags=lanczos`, '-q:v', '3', jpg]);
    assert.equal(r.status, 0, `${name}: jpg 변환 실패`);
    made.push(path.relative(process.cwd(), jpg));
  };
  await call('Network.enable');
  // 생성 API만 막는다 — '*/generate*'로 넓게 막으면 개발 서버의 /src/generateFailure.ts 모듈까지 막혀 앱이 안 뜬다(10/16 실제로 겪음).
  await call('Network.setBlockedURLs', { urls: ['*cloudfunctions.net/*/generate*'] });
  await call('Page.enable');
  await call('Page.addScriptToEvaluateOnNewDocument', { source: "window.print=()=>{throw Error('캡처 중 인쇄 차단');};" });
  await call('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });

  if (!phoneOnly) {
  await open(dev);
  await shot('01-step1-prepare', '!document.getElementById("prepareView").hidden');
  await evaluate("document.getElementById('prepareNextBtn').click()"); await delay(800);
  await shot('02-step2-example', '!document.getElementById("cameraView").hidden');
  await evaluate("document.getElementById('startBtn').click()");
  for (let i = 0; i < 50; i++) { if (await evaluate("document.getElementById('video').readyState >= 2")) break; await delay(100); }
  await delay(1600);
  await shot('03-step2-live', "document.getElementById('video').readyState >= 2");
  await evaluate("document.getElementById('shotBtn').click()"); await delay(3800);
  // 찍은 뒤 «촬영 완료» 알림(2.4초)이 사라진 모습으로 찍는다 — 알림이 얼굴을 가린 그림이 설명서에 들어가지 않게(10/21)
  for (let i = 0; i < 60; i++) { if (await evaluate("!document.querySelector('.camera-capture-notice, .captured-badge')")) break; await delay(100); }
  await shot('04-step2-review', "!document.getElementById('generateBtn').hidden && !document.querySelector('.camera-capture-notice, .captured-badge')");

  await open(`${dev}?preview=posters`);
  for (let i = 0; i < 100; i++) { if (await evaluate("document.querySelectorAll('#gallery .thumb').length === 8")) break; await delay(100); }
  await delay(500);
  await shot('06-step3-posters', "document.querySelectorAll('#gallery .thumb').length === 8");
  await open(`${dev}?preview=failure-retry`); await evaluate("document.getElementById('prepareNextBtn').click()"); await delay(700);
  await shot('07-failure', "!!document.querySelector('.generate-failure-dialog')");
  await open(`${dev}?preview=booth-code`); await evaluate("document.getElementById('prepareNextBtn').click()"); await delay(700);
  await shot('08-booth-code', "!!document.querySelector('.booth-code-dialog')");

  await open(sample);
  await evaluate("document.getElementById('prepareNextBtn').click()"); await delay(500);
  await evaluate("document.getElementById('shotBtn').click()"); await delay(3000);
  await shot('05-loading', "document.getElementById('spinner') && document.getElementById('spinner').open");
  }

  // 휴대폰 흐름(2026-10-17) — 설명서의 짧은 절에 넣는 세로 화면 넷. 390×844 · 2배 · 터치 흉내, 780px 폭으로 줄인다.
  // 첫 페이지 · 둘째 페이지 · 촬영 화면은 공개판과 같은 샘플 모드 빌드에서, 포스터 넘기기는 개발 서버 미리보기에서 찍는다.
  await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await open(sample);
  await shot('09-phone-first', "document.body.dataset.step === '1' && scrollY === 0", 780);
  await evaluate("document.querySelector('.preview-panel').click()"); await delay(1100);
  // 영화 준비는 길어 한 화면에 다 안 든다 — 맨 아래 단추(휴대폰 «주인공이 될 순간 보러 가기», 10/20)가 보이는 자리에서 찍는다
  await evaluate("document.getElementById('prepareNextBtn').scrollIntoView({ block: 'end' }); scrollBy(0, 28); true"); await delay(700);
  await shot('10-phone-story', "scrollY > 0 && document.getElementById('prepareNextBtn').getBoundingClientRect().bottom <= innerHeight", 780);
  await evaluate("document.getElementById('prepareNextBtn').click()"); await delay(900);
  await shot('11-phone-camera', "!!document.getElementById('phoneShotBtn') && !document.getElementById('phoneShotBtn').hidden", 780);
  await open(`${dev}?preview=posters`);
  for (let i = 0; i < 100; i++) { if (await evaluate("!!document.querySelector('.poster-slide[aria-current]')")) break; await delay(100); }
  await delay(1600);   // 처음 한 번 살짝 움찔하는 움직임이 끝난 뒤
  await shot('12-phone-posters', "!!document.querySelector('.poster-slide[aria-current]') && !document.getElementById('saveBtn').hidden", 780);
  // 설명서에는 넷을 한 줄로 묶어 한 그림으로 넣는다(세로 그림 넷이면 쪽이 넷으로 늘어난다)
  const phones = ['09-phone-first', '10-phone-story', '11-phone-camera', '12-phone-posters'].map((n) => path.join(outDir, `${n}.jpg`));
  const flow = path.join(outDir, '13-phone-flow.jpg');
  const joined = spawnSync('ffmpeg', ['-v', 'error', '-y', ...phones.flatMap((p) => ['-i', p]), '-filter_complex',
    '[0]pad=iw+24:ih:0:0:white[a];[1]pad=iw+24:ih:0:0:white[b];[2]pad=iw+24:ih:0:0:white[c];[a][b][c][3]hstack=4,scale=1600:-2:flags=lanczos', '-q:v', '3', flow]);
  assert.equal(joined.status, 0, '휴대폰 네 장 묶기 실패: ' + joined.stderr);
  made.push(path.relative(process.cwd(), flow));
  console.log(made.sort().join('\n'));
} finally { try { socket?.close(); } catch {} chrome.kill(); await fs.rm(tmp, { recursive: true, force: true }).catch(() => {}); }
