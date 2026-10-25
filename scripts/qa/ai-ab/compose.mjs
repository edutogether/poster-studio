// AI 품질 A/B — 생성 그림에 앱의 디자인 8종을 실제로 입힌다(QA 전용).
//   node scripts/qa/ai-ab/compose.mjs <jobs.json> <출력 폴더> [--jpeg 0.9]
//   --jpeg를 주면 8장을 JPEG(같은 해상도)로 쓴다 — 갤러리용으로 결과 전부(96장 × 8)를 합성할 때 용량을 줄인다. 없으면 PNG.
//   jobs.json = [{ "id": "sf-solo-easy-B", "art": "<생성 PNG 경로>", "meta": { mode, name, groupName, members, title, genre, tagline } }]
// compose.html을 vite로 정적 빌드(앱과 같은 src/poster.ts · 글꼴 · 로고) → 내장 정적 서버 → 헤드리스 크롬에서 buildPosters → 8장 PNG(또는 JPEG).
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const [jobsPath, outDir] = process.argv.slice(2);
const qi = process.argv.indexOf('--jpeg');
const fmt = qi > 0 ? { type: 'image/jpeg', q: Number(process.argv[qi + 1]) } : { type: 'image/png' };
const ext = fmt.type === 'image/jpeg' ? 'jpg' : 'png';
if (!jobsPath || !outDir) { console.error('사용: node scripts/qa/ai-ab/compose.mjs <jobs.json> <출력 폴더>'); process.exit(1); }
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const jobs = JSON.parse(await fs.readFile(jobsPath, 'utf8'));
await fs.mkdir(outDir, { recursive: true });
const site = await fs.mkdtemp(path.join(os.tmpdir(), 'aiq-compose-'));
await build({ root, configFile: path.join(root, 'vite.config.ts'), logLevel: 'warn', build: { outDir: site, emptyOutDir: true, rollupOptions: { input: { compose: path.join(here, 'compose.html') } } } });

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(site, p.endsWith('/') ? p + 'index.html' : p);
  try { const b = await fs.readFile(f); res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const delay = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aiq-cc-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--mute-audio', '--remote-debugging-port=0', `--user-data-dir=${dir}`, 'about:blank'], { stdio: 'ignore' });
let port; for (let i = 0; i < 100 && !port; i++) { try { port = (await fs.readFile(path.join(dir, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; } catch { await delay(100); } }
let t; for (let i = 0; i < 50 && !t; i++) { try { t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === 'page'); } catch {} if (!t) await delay(100); }
const ws = new globalThis.WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => { ws.onopen = r; });
let seq = 0; const pend = new Map(); ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const call = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expression) => {
  const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400));
  return r.result?.result?.value;
};
const out = [];
try {
  await call('Page.navigate', { url: `${base}/scripts/qa/ai-ab/compose.html` });
  for (let i = 0; i < 100 && !(await ev('window.aiqReady === true')); i++) await delay(100);
  for (const j of jobs) {
    const art = 'data:image/png;base64,' + (await fs.readFile(j.art)).toString('base64');
    const posters = await ev(`window.aiqCompose(${JSON.stringify(art)}, ${JSON.stringify(j.meta)}, ${JSON.stringify(fmt)})`);
    const files = [];
    for (const [k, p] of posters.entries()) {
      const f = `${j.id}-d${k + 1}.${ext}`;
      await fs.writeFile(path.join(outDir, f), Buffer.from(p.data.split(',')[1], 'base64'));
      files.push({ label: p.label, file: f });
    }
    out.push({ id: j.id, art: j.art, files });
    console.log(j.id, files.length, '장');
  }
} finally {
  ws.close(); chrome.kill(); server.close(); await delay(300);
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  await fs.rm(site, { recursive: true, force: true }).catch(() => {});
}
await fs.writeFile(path.join(outDir, 'compose.json'), JSON.stringify(out, null, 2));
