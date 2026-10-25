// 안전 차단 안내 창 확인(2026-10-26 Bumm님 «오류 안내창 ① 조건부 승인» B) — 진짜 촬영 판 빌드를 헤드리스 크롬으로 열어
// 가짜 카메라로 찍고, 생성 요청에 페이지 안에서 «안전 차단(400 safety)»을 돌려준다(망으로는 한 건도 나가지 않는다).
//   node scripts/verify/safety-dialog-probe.mjs <check-real 빌드 폴더> <결과 폴더> [--sizes 360x780,390x844,430x932,1366x768,1920x1080]
// 크기마다 잰다: 안내 창(alertdialog) · 제목 · 문구가 한 줄에 다 들어가는가(말줄임 없음) · 단추는 «다시 찍기» · «제목 · 문구 고치기» 둘뿐
// («다시 만들기» 없음) · 처음 초점이 주 단추에 있는가 · 단추 높이 40px 이상 · «제목 · 문구 고치기» → 1단계 → 바꾸지 않고 다시 만들기를
// 누르면 요청이 늘지 않고 같은 안내가 다시 뜨는가 · 제목을 바꾸면 요청이 하나 는다. 하나라도 어긋나면 종료 코드 1.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import fss from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const dist = path.resolve(args[0] || ''), out = path.resolve(args[1] || '');
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
if (!args[0] || !args[1] || !fss.existsSync(path.join(dist, 'index.html'))) { console.error('사용: safety-dialog-probe.mjs <check-real 빌드> <결과 폴더> [--sizes …]'); process.exit(2); }
const sizes = opt('--sizes', '360x780,390x844,430x932,1366x768,1920x1080').split(',').map((s) => { const [w, h] = s.split('x').map(Number); return { w, h }; });
await fs.mkdir(out, { recursive: true });
const delay = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webm': 'video/webm' };
const server = http.createServer((req, res) => {
  let p; // 깨진 주소면 400 — 예외로 서버가 죽지 않게(10/26)
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); res.end(); return; }
  const file = path.resolve(dist, '.' + (p.endsWith('/') ? p + 'index.html' : p));
  if (!file.startsWith(dist + path.sep) || !fss.existsSync(file) || fss.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fss.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const report = [];
let bad = 0;
for (const { w, h } of sizes) {
  const phone = w < 768;
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'safety-probe-'));
  const y4m = path.join(profile, 'cam.y4m');
  const [cw, ch] = phone ? [960, 1280] : [1280, 720];
  const ff = spawnSync('ffmpeg', ['-v', 'error', '-y', '-loop', '1', '-i', path.join(dist, 'studio', 'camera-student.webp'), '-t', '3', '-r', '15', '-pix_fmt', 'yuv420p', '-vf', `scale=${cw}:${ch}:force_original_aspect_ratio=increase,crop=${cw}:${ch}`, y4m]);
  if (ff.status !== 0) { console.error('가짜 카메라 영상을 못 만들었다: ' + ff.stderr); process.exit(2); }
  const port = 9571;
  const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--no-default-browser-check', '--mute-audio',
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`, `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let socket, seq = 0; const pending = new Map();
  const row = { size: `${w}x${h}`, phone, problems: [] };
  const fail = (m) => { row.problems.push(m); };
  try {
    let target;
    for (let i = 0; i < 80 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {} if (!target) await delay(100); }
    socket = new globalThis.WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r, j) => { socket.onopen = r; socket.onerror = j; });
    socket.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result); } };
    const call = (method, params = {}) => new Promise((resolve, reject) => { const i = ++seq; pending.set(i, { resolve, reject }); socket.send(JSON.stringify({ id: i, method, params })); });
    const evaluate = async (expression) => { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result.value; };
    const waitFor = async (expr, ms = 15000) => { for (let i = 0; i < ms / 100; i++) { if (await evaluate(expr).catch(() => false)) return true; await delay(100); } return false; };
    const shot = async (name) => { const s = await call('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(out, `${w}x${h}-${name}.png`), Buffer.from(s.data, 'base64')); };
    await call('Network.enable');
    await call('Network.setBlockedURLs', { urls: ['https://*'] });   // 망으로는 한 건도 나가지 않는다
    await call('Page.enable');
    await call('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: phone ? 3 : 1, mobile: phone });
    if (phone) await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { window.__generate = 0; const net = window.fetch.bind(window); window.fetch = async (input, init) => {
      const url = String((input && input.url) || input);
      if (!/^https:/.test(url)) return net(input, init);
      if (/\\/generate/.test(url)) { window.__generate++; return new Response(JSON.stringify({ error: '입력한 제목·문구 또는 사진이 안전 기준에 걸렸어요.', code: 'safety' }), { status: 400, headers: { 'content-type': 'application/json' } }); }
      return new Response('{"ok":true,"openaiReachable":true}', { status: 200, headers: { 'content-type': 'application/json' } });
    }; })();` });
    if (phone) await call('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const md = navigator.mediaDevices; if (!md) return; const gum = md.getUserMedia.bind(md);
      md.getUserMedia = (c) => { const v = c && c.video; return gum(v && typeof v === 'object' && v.width && v.height ? { ...c, video: { ...v, width: v.height, height: v.width } } : c); }; })();` });
    await call('Page.navigate', { url: base });
    if (!await waitFor('!!document.getElementById("prepareNextBtn")', 20000)) throw Error('1단계가 열리지 않음');
    await evaluate('document.getElementById("prepareNextBtn").click() || true');
    if (!await waitFor('!document.getElementById("cameraView").hidden')) throw Error('2단계가 열리지 않음');
    const phoneBtn = phone && await evaluate("!!document.getElementById('phoneShotBtn')");
    if (!phoneBtn) {
      await evaluate("document.getElementById('startBtn') && document.getElementById('startBtn').click() || true");
      if (!await waitFor('(() => { const v = document.getElementById("video"); return !!v && v.videoWidth > 0; })()')) throw Error('카메라가 켜지지 않음');
    }
    await evaluate(`document.getElementById('${phoneBtn ? 'phoneShotBtn' : 'shotBtn'}').click() || true`);
    if (!await waitFor('!document.getElementById("generateBtn").hidden', 20000)) throw Error('촬영되지 않음');
    await evaluate('document.getElementById("generateBtn").click() || true');
    if (!await waitFor('!!document.querySelector(".generate-failure-dialog")', 10000)) throw Error('안내 창이 뜨지 않음');
    await delay(400);
    const m = await evaluate(`(() => { const d = document.querySelector('.generate-failure-dialog'); const h2 = d.querySelector('h2'), p = d.querySelector('#generateFailureMessage');
      const btns = [...d.querySelectorAll('button')]; const fits = (e) => e.scrollWidth <= e.clientWidth + 1;
      return { role: d.getAttribute('role'), modal: d.getAttribute('aria-modal'), title: h2.textContent, message: p.textContent, titleFits: fits(h2), messageFits: fits(p),
        buttons: btns.map((b) => b.textContent.trim()), minHeight: Math.min(...btns.map((b) => b.getBoundingClientRect().height)),
        focused: document.activeElement && document.activeElement.textContent.trim(), sent: window.__generate,
        inView: (() => { const r = d.getBoundingClientRect(); return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth; })() }; })()`);
    Object.assign(row, m);
    await shot('1-safety');
    if (m.role !== 'alertdialog' || m.modal !== 'true') fail('안내 창 역할(alertdialog · aria-modal)');
    if (!m.titleFits || !m.messageFits) fail('제목 또는 문구가 한 줄에 다 들어가지 않음(말줄임)');
    if (JSON.stringify(m.buttons) !== JSON.stringify(['다시 찍기', '제목 · 문구 고치기'])) fail('단추가 «다시 찍기 · 제목 · 문구 고치기»가 아님: ' + m.buttons.join(' | '));
    if (m.minHeight < 40) fail('단추 높이 ' + m.minHeight);
    if (m.focused !== '제목 · 문구 고치기') fail('처음 초점: ' + m.focused);
    if (!m.inView) fail('안내 창이 화면 밖으로 나감');
    if (m.sent !== 1) fail('첫 요청 수 ' + m.sent);
    // 바꾸지 않고 다시 → 요청이 늘지 않고 같은 안내
    await evaluate(`[...document.querySelectorAll('.generate-failure-dialog button')].find((b) => b.textContent.includes('고치기')).click() || true`);
    if (!await waitFor('!document.getElementById("prepareView").hidden')) fail('«제목 · 문구 고치기»가 1단계로 가지 않음');
    await evaluate('document.getElementById("prepareNextBtn").click() || true');
    await waitFor('!document.getElementById("cameraView").hidden');
    await evaluate('document.getElementById("generateBtn").click() || true');
    const again = await waitFor('!!document.querySelector(".generate-failure-dialog")', 5000);
    row.sentAfterUnchanged = await evaluate('window.__generate');
    if (!again) fail('바꾸지 않고 다시 눌렀을 때 안내가 다시 뜨지 않음');
    if (row.sentAfterUnchanged !== 1) fail('바꾸지 않은 요청이 나감: ' + row.sentAfterUnchanged);
    await shot('2-unchanged-again');
    // 제목을 바꾸면 요청이 하나 는다
    await evaluate(`[...document.querySelectorAll('.generate-failure-dialog button')].find((b) => b.textContent.includes('고치기')).click() || true`);
    await waitFor('!document.getElementById("prepareView").hidden');
    await evaluate(`(() => { const i = document.getElementById('movieTitle'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, '바꾼 제목'); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    await evaluate('document.getElementById("prepareNextBtn").click() || true');
    await waitFor('!document.getElementById("cameraView").hidden');
    await evaluate('document.getElementById("generateBtn").click() || true');
    await waitFor('!!document.querySelector(".generate-failure-dialog")', 5000);
    row.sentAfterChange = await evaluate('window.__generate');
    if (row.sentAfterChange !== 2) fail('제목을 바꾼 요청 수: ' + row.sentAfterChange);
  } catch (e) { fail('오류: ' + String(e.message || e).slice(0, 200)); } finally {
    try { socket?.close(); } catch {}
    chrome.kill(); await delay(500); await fs.rm(profile, { recursive: true, force: true }).catch(() => {});
  }
  if (row.problems.length) bad++;
  report.push(row);
  console.log(`${row.size} ${row.problems.length ? '걸림 ' + row.problems.join(' / ') : '통과'} — «${row.message}» 단추 ${(row.buttons || []).join(' | ')} 초점 ${row.focused} 요청 ${row.sent}→${row.sentAfterUnchanged}→${row.sentAfterChange}`);
}
server.close();
await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
console.log(bad ? `걸린 크기 ${bad} / ${report.length}` : `통과 — ${report.length}개 크기 모두`);
process.exit(bad ? 1 : 0);
