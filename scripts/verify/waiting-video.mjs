// 기술 검사용 testsrc2만 인코딩한다. 승인 영상 제작·생성 서비스 호출이 아니다.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { startVideoPreview } from '../media/wait-video-preview-server.mjs';

const out = path.resolve('.cache/video-followup-checks', new Date().toISOString().replace(/[:.]/g, '-'));
await fs.mkdir(out, { recursive: true });
const fixture = path.join(out, 'QA-ONLY-NOT-ARTWORK.mp4');
const encode = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=704x704:rate=30', '-t', '3', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', fixture], { windowsHide: true, encoding: 'utf8' });
assert.equal(encode.status, 0, encode.error?.message || encode.stderr);
const review = await startVideoPreview({ port: 5525 });
const qa = await startVideoPreview({ port: 5526, fixture });
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-port=9564', `--user-data-dir=${out}/chrome`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const delay = ms => new Promise(resolve => globalThis.setTimeout(resolve, ms));
const pending = new Map(), errors = [], requests = [], layouts = [];
let socket, seq = 0;
try {
  let target;
  for (let i = 0; i < 50; i++) { try { target = (await (await fetch('http://127.0.0.1:9564/json')).json()).find(item => item.type === 'page'); if (target) break; } catch {} await delay(100); }
  assert.ok(target);
  socket = new globalThis.WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails);
    if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url);
  };
  const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => { const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails)); return result.result.value; };
  const until = async expression => { for (let i = 0; i < 80; i++) { if (await evaluate(expression)) return; await delay(100); } throw Error(`조건 실패: ${expression}`); };
  await call('Page.enable'); await call('Runtime.enable'); await call('Network.enable');
  await call('Network.setBlockedURLs', { urls: ['https://*'] });
  const navigate = async url => { await call('Page.navigate', { url }); await until('!!document.querySelector(".waiting-art-frame")'); await evaluate('document.fonts.ready'); };
  for (const width of [390, 730, 1366]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    for (let id = 1; id <= 12; id++) {
      await navigate(`http://127.0.0.1:5525/?set=${id}`);
      await until('document.querySelector(".generation-robot-film").complete');
      const row = await evaluate(`(() => {const frame=document.querySelector('.waiting-art-frame'),image=frame.querySelector('img'),h=document.getElementById('generationTitle');return {id:+frame.dataset.art,width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,gap:h.getBoundingClientRect().top-frame.getBoundingClientRect().bottom,loaded:image.naturalWidth>0,videos:document.querySelectorAll('video').length};})()`);
      assert.equal(row.id, id); assert.equal(row.overflow, false); assert.ok(row.gap >= 0); assert.equal(row.loaded, true); assert.equal(row.videos, 0);
      layouts.push(row);
    }
    await navigate('http://127.0.0.1:5525/videos.html');
    assert.equal(await evaluate('document.querySelectorAll(".video-review article").length'), 12);
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
    const shot = await call('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(out, `review-${width}.png`), Buffer.from(shot.data, 'base64'));
  }
  assert.equal(requests.filter(url => url.endsWith('.mp4')).length, 0, '미제작 영상 요청 없음');
  const range = await fetch('http://127.0.0.1:5526/qa-only.mp4', { headers: { Range: 'bytes=0-31' } });
  assert.equal(range.status, 206); assert.equal((await range.arrayBuffer()).byteLength, 32);
  await navigate('http://127.0.0.1:5526/');
  await until('document.querySelector("video")?.currentTime > .2');
  const video = await evaluate(`(() => {const v=document.querySelector('video');return {muted:v.muted,inline:v.playsInline,loop:v.loop,active:v.dataset.active,transform:getComputedStyle(v).transform,imageTransform:getComputedStyle(document.querySelector('img')).transform};})()`);
  assert.equal(video.muted, true); assert.equal(video.inline, true); assert.equal(video.loop, false); assert.equal(video.active, 'true'); assert.equal(video.transform, video.imageTransform);
  await evaluate('document.getElementById("pause").click()');
  const pausedAt = await evaluate('document.querySelector("video").currentTime'); await delay(500);
  assert.equal(await evaluate('document.querySelector("video").currentTime'), pausedAt);
  await evaluate('document.getElementById("pause").click()');
  await until('document.querySelector("video")?.ended');
  await delay(500); assert.equal(await evaluate('document.querySelector("video").ended'), true);
  await evaluate('window.__oldVideo=document.querySelector("video");document.getElementById("unmount").click()');
  assert.equal(await evaluate('window.__oldVideo.paused && !window.__oldVideo.hasAttribute("src")'), true);
  await navigate('http://127.0.0.1:5526/?broken=1'); await until('!document.querySelector("video")');
  assert.equal(await evaluate('document.querySelector("img").naturalWidth>0'), true);
  const reject = await call('Page.addScriptToEvaluateOnNewDocument', { source: 'HTMLMediaElement.prototype.play=()=>Promise.reject(new Error("QA autoplay rejected"))' });
  await navigate('http://127.0.0.1:5526/'); await until('!document.querySelector("video")');
  await call('Page.removeScriptToEvaluateOnNewDocument', { identifier: reject.identifier });
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const beforeReduced = requests.filter(url => url.endsWith('/qa-only.mp4')).length;
  await navigate('http://127.0.0.1:5526/');
  assert.equal(await evaluate('document.querySelector("video")===null'), true);
  assert.equal(requests.filter(url => url.endsWith('/qa-only.mp4')).length, beforeReduced);
  assert.equal(errors.length, 0);
  assert.equal(requests.filter(url => /cloudfunctions|run\.app|api\.openai/.test(url)).length, 0);
  const report = { layouts, galleryViewports: 3, realDecoder: 'QA 색상 패턴 H264 3초', approvedVideos: 0, pauseResume: true, endedWithoutLoop: true, fallback404: true, fallbackAutoplay: true, reducedNoDownload: true, releaseOnUnmount: true, errors: 0, externalApiRequests: 0 };
  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, layouts: layouts.length, evidence: out }));
  await call('Browser.close');
} finally { socket?.close(); chrome.kill(); review.close(); qa.close(); }
