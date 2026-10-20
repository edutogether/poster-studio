/* 폴라로이드 포스터를 그림 10장 × 제목 10가지(100장)로 그려 «글자가 사진에 걸침 · 종이 밖 · 글자끼리 겹침»을 재고 JPEG로 남긴다
   (2026-10-20 Bumm님 «로고와 사진이 위 가장자리에 너무 붙음 → 조금 아래로, 아래 글 쪽에서 당겨 씀» — 그 뒤 잘림 · 겹침 확인용).

     node scripts/verify/polaroid-bounds.mjs <그림 폴더> <결과 폴더>

   <그림 폴더>에는 forest · theater · studio · lobby · group · fireworks · piano · paint · music · sf .png(검토용 그림 10장)가 있어야 하고,
   이 작업 사본 안이어야 한다(예: .cache/poster-redesign-20261014/arts — 개발 서버가 그 자리 그대로 내준다. 밖의 폴더를 /@fs로 열면 그림을 못 읽었다, 10/20).
   이 작업 사본의 Vite 개발 서버로 scripts/verify/polaroid-bounds/(실험실)를 열고 헤드리스 크롬으로 그린다. 네트워크는 127.0.0.1만 쓴다.
   판정(하나라도 어긋나면 종료코드 1): 100장 모두 걸침 · 종이 밖 · 겹침 0, 100장이 다 나와야 한다(0장이면 실패).
   가장 좁은 사이(사진 아래 → 글, 글 → 종이 아래)와 로고 위 여백 · 사진 위 여백을 함께 적는다. 결과 폴더에 <번호>-<제목>-<그림>.jpg와 check.json. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const [artsArg, outArg] = process.argv.slice(2);
if (!artsArg || !outArg) { console.error('사용: node scripts/verify/polaroid-bounds.mjs <그림 폴더> <결과 폴더>'); process.exit(1); }
const arts = path.resolve(artsArg), out = path.resolve(outArg), root = process.cwd();
const artsUrl = '/' + path.relative(root, arts).split(path.sep).join('/') + '/';
if (artsUrl.startsWith('/..') || path.isAbsolute(path.relative(root, arts))) { console.error('그림 폴더는 이 작업 사본 안에 있어야 한다'); process.exit(1); }
for (const a of ['forest', 'theater', 'studio', 'lobby', 'group', 'fireworks', 'piano', 'paint', 'music', 'sf']) {
  if (!fs.existsSync(path.join(arts, `${a}.png`))) { console.error(`그림 없음: ${a}.png — 그림 폴더를 확인하세요`); process.exit(1); }
}
fs.mkdirSync(out, { recursive: true });
const vite = await import('vite');
const server = await vite.createServer({ root, logLevel: 'error', server: { port: 0, host: '127.0.0.1', strictPort: false, hmr: false } });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'polaroid-chrome-'));
const port = 9711;
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--disable-background-networking', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const delay = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));
let socket, seq = 0; const pending = new Map(); let failed = false;
try {
  let t; for (let i = 0; i < 80 && !t; i++) { try { t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === 'page'); } catch { /* 아직 안 떴다 */ } if (!t) await delay(100); }
  socket = new globalThis.WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => { socket.onopen = r; });
  socket.onmessage = (e) => { const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown') { failed = true; console.error('페이지 오류', JSON.stringify(m.params.exceptionDetails).slice(0, 800)); }
    if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result); } };
  const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expression) => { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails).slice(0, 600)); return r.result.value; };
  await call('Page.enable'); await call('Runtime.enable');
  await call('Page.navigate', { url: `${base}/scripts/verify/polaroid-bounds/index.html?arts=${encodeURIComponent(artsUrl)}` });
  let n = -1;
  for (let i = 0; i < 1500 && !failed; i++) { n = await evaluate('window.__posters ? window.__posters.length : -1').catch(() => -1); if (n > 0) break; await delay(200); }
  if (n !== 100) throw Error(`포스터 ${n}장 — 100장이어야 한다`);
  const checks = [];
  for (let i = 0; i < n; i++) {
    const p = await evaluate(`window.__posters[${i}]`);
    fs.writeFileSync(path.join(out, `${String(i).padStart(3, '0')}-${p.case}.jpg`), Buffer.from(p.url.split(',')[1], 'base64'));
    checks.push({ case: p.case, ...p.check });
  }
  fs.writeFileSync(path.join(out, 'check.json'), JSON.stringify(checks, null, 1));
  const bad = checks.filter((c) => c.onPhoto.length || c.offPaper.length || c.textOverlap.length);
  const vals = (k) => checks.map((c) => c[k]).filter((v) => v !== null);
  console.log(`${n}장 → ${out}`);
  console.log(`사진에 걸친 글자 · 종이 밖 · 글자끼리 겹침: ${bad.length}장${bad.length ? ' — ' + bad.slice(0, 5).map((c) => `${c.case}: ${[...c.onPhoto, ...c.offPaper, ...c.textOverlap].join(', ')}`).join(' | ') : ''}`);
  console.log(`가장 좁은 사이: 사진 아래 → 글 ${Math.min(...vals('gapPhotoToText'))}px · 글 → 종이 아래 ${Math.min(...vals('gapTextToPaper'))}px · 로고 위 여백 ${Math.min(...vals('logoTop'))}px · 사진 위 여백 ${Math.min(...vals('photoTop'))}px`);
  if (bad.length) failed = true;
} catch (error) {
  failed = true; console.error(error.message);
} finally {
  try { socket?.close(); } catch { /* 이미 닫힘 */ }
  chrome.kill(); await server.close(); await delay(300); fs.rmSync(profile, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
