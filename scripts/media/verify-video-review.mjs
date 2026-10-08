// 검토 페이지(build-video-review.py 결과)가 실제로 동작하는지 헤드리스 크롬으로 확인한다.
/* global WebSocket, setTimeout -- Node 22 내장(WebSocket·타이머). scripts 아래 .mjs 공통 globals에는 없어 여기서만 밝힌다 */
// 영상마다 불러오기 — 최신판(videos/)·이전 판(prev/ 의 .webm)은 8초·704×704, 고치기 전/뒤(ab/)·판단용(judge/)은 길이가 있으면 된다(구간 영상).
// 그림이 모두 열리는지, «지점» 단추가 그 초로 옮기는지, 콘솔 오류 0, 캡처·관련 파일 링크가 실제 파일인지.
// 사용: node scripts/media/verify-video-review.mjs <검토 폴더> [캡처 PNG 저장 경로]
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process'; import { setTimeout as sleep } from 'node:timers/promises';
const [DIR, SHOT] = process.argv.slice(2);
const page = path.resolve(DIR, 'index.html'); if (!fs.existsSync(page)) { console.error('index.html 없음'); process.exit(2); }
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=9601', '--user-data-dir=' + fs.mkdtempSync(path.join(os.tmpdir(), 'review-')), '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
let ws, id = 0; const pend = new Map(), errors = [];
for (let i = 0; i < 100 && !ws; i++) { try { const j = await (await fetch('http://127.0.0.1:9601/json/version')).json(); const w = new WebSocket(j.webSocketDebuggerUrl); await new Promise((a, b) => { w.onopen = a; w.onerror = b; }); ws = w; } catch { await sleep(300); } }
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const { ok, no } = pend.get(m.id); pend.delete(m.id); m.error ? no(new Error(m.error.message)) : ok(m.result); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text); if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(m.params.entry.text); };
const send = (m, p = {}, s) => new Promise((ok, no) => { const i = ++id; pend.set(i, { ok, no }); ws.send(JSON.stringify({ id: i, method: m, params: p, sessionId: s })); });
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const s = (await send('Target.attachToTarget', { targetId, flatten: true })).sessionId;
await send('Page.enable', {}, s); await send('Runtime.enable', {}, s); await send('Log.enable', {}, s);
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false }, s);
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }, s); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value; };
let fail = 0;
try {
  await send('Page.navigate', { url: pathToFileURL(page).href }, s); await sleep(3000);
  const vids = await ev(`Promise.all([...document.querySelectorAll('video')].map(v=>new Promise(r=>{const done=()=>r({src:v.getAttribute('src'),dur:v.duration,w:v.videoWidth,h:v.videoHeight}); if(v.readyState>=1)done(); else {v.onloadedmetadata=done; v.onerror=()=>r({src:v.getAttribute('src'),error:true});}})))`);
  for (const v of vids) {
    const full = /^videos\//.test(v.src) || /^prev\/.*\.webm$/.test(v.src);
    const ok = !v.error && (full ? Math.abs(v.dur - 8) <= 0.1 && v.w === 704 && v.h === 704 : v.dur > 0 && v.w > 0);
    if (!ok) fail++; console.log(ok ? '통과' : '실패', JSON.stringify(v)); }
  const imgs = await ev(`Promise.all([...document.images].map(i=>new Promise(r=>{const done=()=>r({src:i.getAttribute('src'),w:i.naturalWidth}); if(i.complete)done(); else {i.onload=done;i.onerror=done;}})))`);
  for (const i of imgs) if (!i.w) { fail++; console.log('그림 실패', i.src); }
  console.log(`그림 ${imgs.length}장 확인`);
  const links = await ev(`[...document.querySelectorAll('a[href]')].map(a=>a.getAttribute('href')).filter(h=>!h.startsWith('#')&&!/^https?:/.test(h))`);
  for (const l of links) if (!fs.existsSync(path.join(DIR, decodeURIComponent(l)))) { fail++; console.log('링크 파일 없음', l); }
  console.log(`링크 ${links.length}개 확인`);
  if (!vids.length) console.log('영상 0편(정지 그림만)');
  if (SHOT) { const top = await send('Page.captureScreenshot', { format: 'png' }, s); fs.writeFileSync(SHOT.replace(/\.png$/, '-top.png'), Buffer.from(top.data, 'base64')); }
  const seek = await ev(`(async()=>{const out=[];for(const b of document.querySelectorAll('button.seek')){const sec=b.closest('section');const v=sec.querySelector('.top video');if(!v)continue;b.click();await new Promise(r=>setTimeout(r,400));out.push({want:+b.dataset.t,got:Math.round(v.currentTime*100)/100,paused:v.paused});}return out;})()`);
  for (const k of seek) { const ok = Math.abs(k.want - k.got) < 0.06 && k.paused; if (!ok) fail++; console.log(ok ? '지점 통과' : '지점 실패', JSON.stringify(k)); }
  const caps = await ev(`[...document.querySelectorAll('a[href^="captures/"]')].map(a=>decodeURIComponent(a.getAttribute('href')))`);
  for (const c of caps) if (!fs.existsSync(path.join(DIR, c))) { fail++; console.log('캡처 파일 없음', c); }
  console.log(`캡처 링크 ${caps.length}개 확인`);
  if (SHOT) { const shot = await send('Page.captureScreenshot', { format: 'png' }, s); fs.writeFileSync(SHOT, Buffer.from(shot.data, 'base64')); }
  if (errors.length) { fail++; console.log('콘솔 오류', errors); }
  console.log(fail ? `실패 ${fail}건` : '전부 통과');
} finally { chrome.kill(); setTimeout(() => process.exit(fail ? 1 : 0), 300); }
