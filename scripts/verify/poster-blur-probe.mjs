#!/usr/bin/env node
/* 포스터 흐림 확인(2026-10-20 저녁 Bumm님 «휴대폰에서 아치프레임 바깥 블러가 안 보임»).

     node scripts/verify/poster-blur-probe.mjs <dist 폴더> <결과 폴더> [--no-filter] [--size 390x664] [--compare <다른 결과 폴더>]

   빌드본을 로컬 서버로 열어 샘플 흐름(«샘플 포스터 보기»)으로 8개 포스터를 만들고, 포스터마다 PNG와 SHA-256을 남긴다.
   - 필름 그레인 등 난수를 씨앗 고정 생성기로 바꿔 같은 코드 · 같은 입력이면 화소까지 같게 나온다.
   - --no-filter: 캔버스 필터(ctx.filter)를 지운 채로 연다 — 캔버스 필터를 그리지 않는 아이폰 사파리를 흉내 낸다.
   - --compare: 다른 결과 폴더의 PNG와 포스터별로 화소를 대조한다(브라우저 안에서 풀어 채널 차이를 잰다).
     같은 빌드를 두 번 돌려도 글자 가장자리 몇십 화소가 1단계씩 다르다(10/20 실측: 에디토리얼 · 컬러 블록 · 타이포그래피, 최대 1) —
     그래서 «채널 차이 1 이하»를 같음으로 친다. 개수 · 이름이 안 맞거나 1을 넘는 화소가 하나라도 있으면 종료코드 1.
   서버 · 카메라 · AI 요청은 없다(https 차단). */
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import fss from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const [distArg, outArg] = args.filter((a, i) => !a.startsWith('--') && !['--size', '--compare'].includes(args[i - 1]));
if (!distArg || !outArg) { console.error('사용법: node scripts/verify/poster-blur-probe.mjs <dist> <out> [--no-filter] [--size WxH] [--compare <폴더>]'); process.exit(2); }
const dist = path.resolve(distArg), out = path.resolve(outArg);
const noFilter = args.includes('--no-filter');
const [vw, vh] = opt('--size', '390x664').split('x').map(Number);
const phone = vw <= 760;
const compareDir = opt('--compare', null);
await fs.mkdir(out, { recursive: true });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webm': 'video/webm' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.resolve(dist, '.' + (p.endsWith('/') ? p + 'index.html' : p));
  if (!file.startsWith(dist + path.sep) || !fss.existsSync(file) || fss.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fss.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'blur-probe-'));
const port = 9563;
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--mute-audio', '--autoplay-policy=no-user-gesture-required', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const delay = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));
let code = 0;
try {
  let target;
  for (let i = 0; i < 80 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch { /* 아직 */ } if (!target) await delay(100); }
  if (!target) throw new Error('크롬에 붙지 못했다');
  const ws = new globalThis.WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let seq = 0; const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const call = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expression) => { const m = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (m.result?.exceptionDetails) throw new Error(m.result.exceptionDetails.text + ' ' + (m.result.exceptionDetails.exception?.description || '')); return m.result?.result?.value; };
  const waitFor = async (expr, ms) => { for (let i = 0; i < ms / 100; i++) { if (await evaluate(expr).catch(() => false)) return true; await delay(100); } return false; };
  await call('Network.enable');
  await call('Network.setBlockedURLs', { urls: ['https://*'] });
  await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: vw, height: vh, deviceScaleFactor: 1, mobile: phone });
  // 씨앗 고정 난수(mulberry32) — 그레인이 매번 같게
  let boot = 'Math.random = (() => { let a = 20261020; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();';
  if (noFilter) boot += 'delete CanvasRenderingContext2D.prototype.filter; delete OffscreenCanvasRenderingContext2D.prototype.filter;';
  await call('Page.addScriptToEvaluateOnNewDocument', { source: boot });
  await call('Page.navigate', { url: base });
  if (!await waitFor('!!document.getElementById("prepareNextBtn") && !document.getElementById("splash")', 20000)) throw new Error('1단계를 못 열었다');
  if (noFilter && await evaluate("'filter' in document.createElement('canvas').getContext('2d')")) throw new Error('--no-filter인데 캔버스 필터가 남아 있다');
  await evaluate('document.getElementById("prepareNextBtn").click() || true');
  if (!await waitFor('!document.getElementById("cameraView").hidden', 10000)) throw new Error('2단계를 못 열었다');
  const btn = await evaluate(`(() => { const b = [document.getElementById('shotBtn'), document.getElementById('phoneShotBtn')].find((x) => x && !x.hidden && /샘플 포스터 보기/.test((x.getAttribute('aria-label') || '') + x.textContent)); if (!b) return null; b.click(); return b.id; })()`);
  if (!btn) throw new Error('«샘플 포스터 보기» 단추가 없다');
  if (!await waitFor('!document.getElementById("resultView").hidden && document.querySelectorAll("#gallery img").length >= 8', 90000)) throw new Error('3단계 포스터 8장을 못 받았다');
  await delay(500);
  const posters = await evaluate(`(async () => { const out = []; for (const [i, img] of [...document.querySelectorAll('#gallery img')].entries()) {
    const label = img.closest('button')?.getAttribute('aria-label')?.replace(/ 버전 고르기$/, '') || String(i);
    const buf = await (await fetch(img.src)).arrayBuffer(); let s = ''; const u = new Uint8Array(buf); for (let j = 0; j < u.length; j += 0x8000) s += String.fromCharCode(...u.subarray(j, j + 0x8000));
    out.push({ label, b64: btoa(s) }); } return out; })()`);
  const hashes = [];
  for (const [i, p] of posters.entries()) {
    const buf = Buffer.from(p.b64, 'base64');
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    await fs.writeFile(path.join(out, `${String(i + 1).padStart(2, '0')}-${p.label.replace(/[^\w가-힣-]+/g, '_')}.png`), buf);
    hashes.push({ label: p.label, sha });
    console.log(`${p.label}: ${sha.slice(0, 16)}`);
  }
  await fs.writeFile(path.join(out, 'hashes.json'), JSON.stringify({ noFilter, size: `${vw}x${vh}`, hashes }, null, 1));
  if (hashes.length < 8) throw new Error(`포스터가 ${hashes.length}장뿐이다`);
  if (compareDir) {
    const otherDir = path.resolve(compareDir);
    const other = JSON.parse(await fs.readFile(path.join(otherDir, 'hashes.json'), 'utf8')).hashes;
    const otherFiles = (await fs.readdir(otherDir)).filter((f) => f.endsWith('.png')).sort();
    if (other.length !== hashes.length || otherFiles.length !== hashes.length) { console.log(`❌ 개수가 다르다: ${other.length} / ${hashes.length}`); code = 1; }
    let diff = 0;
    for (const [i, h] of hashes.entries()) {
      const o = other[i];
      if (!o || o.label !== h.label) { console.log(`❌ ${i + 1}번 짝이 안 맞다: ${o?.label} / ${h.label}`); code = 1; continue; }
      if (o.sha === h.sha) { console.log(`같음(바이트): ${h.label}`); continue; }
      const a = (await fs.readFile(path.join(otherDir, otherFiles[i]))).toString('base64'), b = posters[i].b64;
      const r = await evaluate(`(async () => { const load = (s) => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = 'data:image/png;base64,' + s; });
        const [x, y] = await Promise.all([load(${JSON.stringify(a)}), load(${JSON.stringify(b)})]);
        if (x.width !== y.width || x.height !== y.height) return { size: true };
        const px = (im) => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const t = c.getContext('2d'); t.drawImage(im, 0, 0); return t.getImageData(0, 0, im.width, im.height).data; };
        const p = px(x), q = px(y); let n1 = 0, nBig = 0, max = 0;
        for (let k = 0; k < p.length; k++) { const d = Math.abs(p[k] - q[k]); if (d > max) max = d; if (d === 1) n1++; else if (d > 1) nBig++; }
        return { n1, nBig, max }; })()`);
      if (r.size) { console.log(`❌ 크기가 다르다: ${h.label}`); code = 1; diff++; continue; }
      console.log(`${r.nBig ? '다름' : '같음(채널 차이 ≤1)'}: ${h.label} — 1단계 차이 ${r.n1} · 그보다 큰 차이 ${r.nBig} · 최대 ${r.max}`);
      if (r.nBig) diff++;
    }
    console.log(`대조 ${hashes.length}장 중 다른 것 ${diff}장`);
    if (diff) code = 1;
  }
  ws.close();
} catch (e) {
  console.error('❌ ' + e.message); code = 2;
} finally {
  chrome.kill(); server.close();
  await delay(400); await fs.rm(profile, { recursive: true, force: true }).catch(() => {});
}
process.exit(code);
