// 실제 모드 한 바퀴(QA 전용 · 유료) — 가짜 카메라(시험 사진) → 이 컴퓨터에서 띄운 후보 서버 코드(인메모리 카운터) → 실제 OpenAI 생성
// → 3단계 포스터 → 출력(인쇄 화면). 라이브 서버 · 라이브 «생성» 단추는 쓰지 않는다 — 브라우저는 https를 전부 막는다.
//
//   node scripts/qa/ai-ab/real-loop.mjs --module <functions/index.js> --dist <check-real 빌드 폴더> --manifest <manifest.json>
//        --solo <사진 ID> --group <사진 ID> --out <결과 폴더> --ledger <ledger.jsonl> --cap <달러> [--dry --dry-art <png>]
//   또는 --solo · --group 대신 --cases <cases.json> — [{ name, genre, mode, photoId, title }] 장면마다 장르 · 제목을 화면에서 고르고 한 번만 만든다
//        (다시 만들기 없음). [--reserve <달러>](1회 예약, 기본 0.09) [--max-calls <n>](이 실행의 OpenAI 호출 상한)
//
// - 정적 파일과 서버를 같은 주소(127.0.0.1:5500 — 서버 허용 출처)에 둔다: /posterStudio/* 는 후보 함수 앱(express)으로, 나머지는 빌드 파일.
//   페이지 안에서 API_BASE(라이브 함수 주소)만 이 주소로 바꿔 부른다 — 같은 출처라 CSP · CORS를 바꾸지 않는다.
// - 카운터(레이트리밋 · 사진당 2회 · 하루 예산)는 운영 Firestore가 아니라 인메모리 — 함수 테스트의 가짜와 같은 규칙.
// - 키는 OPENAI_API_KEY_QA로만 받는다. 생성마다 비용을 gen.mjs와 같은 ledger에 적고(tag real-loop), 부르기 전에
//   «지금까지 비용 + 나가 있는 요청 예약 + 이번 1회 최대($0.09)» ≤ --cap을 확인한다(넘으면 부르지 않고 실패로 둔다).
// - 장면: ① 혼자 — 찍기 → 생성 → 포스터 → 출력 → «이전»으로 돌아가 같은 사진으로 두 번째 생성 → 세 번째는 «사진당 2회» 한도로 막히는지
//         ② 단체 — 찍기 → 생성 → 포스터 → 출력. 화면은 <out>에 찍는다(아이 사진 · AI 그림이 들어 있으니 이 폴더 밖으로 옮기지 않는다).
import fs from 'node:fs/promises';
import fss from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes('--' + k);
const modulePath = arg('module'), dist = path.resolve(arg('dist', '')), manifestPath = arg('manifest'), out = arg('out'), ledger = arg('ledger');
const soloId = arg('solo'), groupId = arg('group'), cap = Number(arg('cap', '0')), dry = has('dry'), dryArt = arg('dry-art');
const cases = arg('cases') ? JSON.parse(fss.readFileSync(arg('cases'), 'utf8')) : null;
const RESERVE = Number(arg('reserve', '0.09')), maxCalls = Number(arg('max-calls', 'Infinity'));
if (!modulePath || !manifestPath || !out || !ledger || !(cases?.length || (soloId && groupId)) || !(cap > 0) || !(RESERVE > 0) || !(maxCalls > 0) || !fss.existsSync(path.join(dist, 'index.html')) || (dry && !dryArt)) {
  console.error('사용: real-loop.mjs --module <index.js> --dist <빌드> --manifest <manifest.json> (--solo <ID> --group <ID> | --cases <json>) --out <폴더> --ledger <jsonl> --cap <달러> [--reserve <달러>] [--max-calls <n>] [--dry --dry-art <png>]');
  process.exit(1);
}
await fs.mkdir(out, { recursive: true });
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const photoDir = path.resolve(path.dirname(manifestPath), manifest.photoDir || '.');
const sleep = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));
const PRICE = { text: 5, image: 8, out: 30 };   // gpt-image-2, 100만 토큰당(2026-10-25 공식 단가)

// ── 후보 서버 코드 ────────────────────────────────────────────────
// 부스 토큰: 화면 번들에 이미 들어 있는 공개 값(src/constants.ts)을 그대로 쓴다 — 출력하지 않는다.
const constantsSrc = await fs.readFile(path.resolve(path.dirname(modulePath), '../src/constants.ts'), 'utf8');
const boothToken = (constantsSrc.match(/export const BOOTH_TOKEN = '([^']+)'/) || [])[1];
const apiBase = (constantsSrc.match(/export const API_BASE = '([^']+)'/) || [])[1];
if (!boothToken || !apiBase) { console.error('src/constants.ts에서 BOOTH_TOKEN · API_BASE를 못 읽었다'); process.exit(1); }
process.env.BOOTH_TOKEN = boothToken;
process.env.OPENAI_API_KEY = dry ? 'dry-not-used' : 'qa-client-injected';   // 실제 호출은 아래 주입한 클라이언트만 쓴다
const mod = await import(pathToFileURL(path.resolve(modulePath)).href);
const counters = new Map();
const counterImpl = async (collectionName, docId, max) => {
  const key = `${collectionName}/${docId}`; const cur = counters.get(key) || 0;
  if (cur >= max) return { allowed: false, count: cur };
  counters.set(key, cur + 1); return { allowed: true, count: cur + 1 };
};
counterImpl.release = async (collectionName, docId) => { const key = `${collectionName}/${docId}`; const next = Math.max(0, (counters.get(key) || 0) - 1); counters.set(key, next); return { count: next }; };
mod._setCounterImplForTesting(counterImpl);

const readLedger = async () => { try { return (await fs.readFile(ledger, 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
// gen.mjs와 같은 잠금(윈도의 삭제 대기 EPERM · EACCES · EBUSY도 «잠시 뒤 다시»)
const lockDir = ledger + '.lock';
const BUSY = new Set(['EEXIST', 'EPERM', 'EACCES', 'EBUSY']);
async function withLock(fn) {
  for (;;) { try { await fs.mkdir(lockDir); break; } catch (e) { if (!BUSY.has(e.code)) throw e; await sleep(30); } }
  try { return await fn(); } finally {
    for (let i = 0; ; i++) { try { await fs.rmdir(lockDir); break; } catch (e) { if (e.code === 'ENOENT') break; if (!BUSY.has(e.code) || i >= 200) throw e; await sleep(20); } }
  }
}
const calls = [];
let started = 0, current = null, lastForm = null;
// 서버가 실제로 보낸 지시문이 어느 판인지: 화면이 보낸 입력(장르 · 혼자/단체 · 제목 · 문구)으로 판마다 지시문을 만들어 글자 그대로 견준다.
// 맞는 판이 선택표(PROMPT_VARIANT_BY_CELL)의 그 칸 하나뿐이어야 한다 — 다른 판이 불리거나 조용히 기본값으로 떨어지면 여기서 드러난다.
const promptCheck = (prompt) => {
  if (!lastForm) return null;
  const input = { genre: lastForm.genre || 'animation', mode: lastForm.mode === 'group' ? 'group' : 'solo', title: mod.sanitizePromptField(lastForm.movieTitle, 60), tagline: mod.sanitizePromptField(lastForm.tagline, 80) };
  const matched = ['v1', 'v1plus', 'v1plus2', 'v2'].filter((variant) => { try { return mod.buildPrompt({ ...input, variant }) === prompt; } catch { return false; } });
  return { sha256: createHash('sha256').update(prompt).digest('hex'), chars: prompt.length, genre: input.genre, mode: input.mode, title: input.title, tagline: input.tagline,
    frozen: mod.PROMPT_VARIANT_BY_CELL[input.genre]?.[input.mode] ?? null, version: mod.promptVersionFor(input.genre, input.mode), matched };
};
let realClient;
if (!dry) {
  if (!process.env.OPENAI_API_KEY_QA) { console.error('OPENAI_API_KEY_QA가 없다'); process.exit(1); }
  const { default: OpenAI } = await import(pathToFileURL(path.resolve(path.dirname(modulePath), 'node_modules/openai/index.mjs')).href);
  realClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY_QA, timeout: 120_000, maxRetries: 0 });
}
const dryB64 = dry ? (await fs.readFile(dryArt)).toString('base64') : null;
mod._setClientForTesting({
  images: {
    edit: async (params, opts) => {
      const key = randomUUID();
      if (started >= maxCalls) throw Object.assign(new Error(`QA 호출 상한 ${maxCalls}건 — 부르지 않음`), { status: 400 });
      const prompt = promptCheck(params.prompt);
      const ok = await withLock(async () => {
        const rows = await readLedger();
        const ended = new Set(rows.filter((r) => r.key && r.type !== 'start').map((r) => r.key));
        const spent = rows.reduce((s, r) => s + (r.type === 'start' ? 0 : r.cost || 0), 0);
        const reserved = rows.filter((r) => r.type === 'start' && !ended.has(r.key)).reduce((s, r) => s + r.reserve, 0);
        if (spent + reserved + RESERVE > cap) return false;
        await fs.appendFile(ledger, JSON.stringify({ type: 'start', key, caseId: current ?? 'real-loop', arm: 'R', reserve: RESERVE, quality: params.quality ?? null, at: new Date().toISOString(), pid: process.pid, tag: 'real-loop' }) + '\n');
        return true;
      });
      if (!ok) throw Object.assign(new Error('QA 예산 상한 — 부르지 않음'), { status: 400 });
      started++;
      const t0 = Date.now();
      let data, error = null;
      try {
        if (dry) { await sleep(3000); data = { data: [{ b64_json: dryB64 }], usage: { input_tokens_details: { text_tokens: 0, image_tokens: 0 }, output_tokens: 0 } }; }
        else data = await realClient.images.edit(params, opts);
        // AI가 그린 원본 그림(포스터에 얹기 전) — 같은 사진 · 같은 판의 예전 결과와 나란히 보려고 남긴다(이 폴더 밖으로 옮기지 않는다)
        const b64 = data?.data?.[0]?.b64_json;
        if (b64 && current) await fs.writeFile(path.join(out, `${current}-art.png`), Buffer.from(b64, 'base64')).catch((e) => console.error('원본 그림 저장 실패', e.message));
        return data;
      } catch (e) { error = { status: e?.status ?? null, code: e?.code ?? null, message: String(e?.message || e).slice(0, 200) }; throw e; } finally {
        const u = data?.usage;
        const cost = u ? ((u.input_tokens_details?.text_tokens ?? 0) * PRICE.text + (u.input_tokens_details?.image_tokens ?? 0) * PRICE.image + (u.output_tokens ?? 0) * PRICE.out) / 1e6 : 0;
        const row = { key, caseId: current ?? 'real-loop', arm: 'R', status: error ? 'error' : 'ok', error, prompt, model: params.model, size: params.size ?? null, n: params.n ?? null, quality: params.quality ?? null, input_fidelity: params.input_fidelity ?? null, ms: Date.now() - t0, cost: Number(cost.toFixed(5)), usage: u ?? null, at: new Date().toISOString(), dry, tag: 'real-loop' };
        calls.push(row);
        await withLock(() => fs.appendFile(ledger, JSON.stringify(row) + '\n'));
      }
    },
  },
  models: { list: async () => ({ data: [] }) },
});

// ── 같은 주소의 정적 파일 + 함수 앱 ───────────────────────────────
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webm': 'video/webm', '.txt': 'text/plain' };
const served = [];
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/posterStudio/')) {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      req.rawBody = Buffer.concat(chunks);
      req.url = req.url.slice('/posterStudio'.length);
      if (req.method === 'POST' && req.url.startsWith('/generate')) {
        try { const fd = await new globalThis.Response(req.rawBody, { headers: { 'content-type': req.headers['content-type'] || '' } }).formData(); lastForm = Object.fromEntries(['genre', 'mode', 'movieTitle', 'tagline'].map((k) => [k, fd.get(k)])); } catch { lastForm = null; }
      }
      const end = res.end.bind(res);
      const bodyParts = [];
      const write = res.write.bind(res);
      res.write = (c, ...a) => { if (c) bodyParts.push(Buffer.from(c)); return write(c, ...a); };
      res.end = (c, ...a) => {
        if (c && typeof c !== 'function') bodyParts.push(Buffer.from(c));
        let code = null; if (res.statusCode !== 200) { try { code = JSON.parse(Buffer.concat(bodyParts).toString('utf8')).code ?? null; } catch {} }
        served.push({ at: new Date().toISOString(), method: req.method, path: req.url, status: res.statusCode, code });
        return end(c, ...a);
      };
      mod.app(req, res);
    });
    return;
  }
  const p = decodeURIComponent(u.pathname);
  const file = path.resolve(dist, '.' + (p.endsWith('/') ? p + 'index.html' : p));
  if (!file.startsWith(dist + path.sep) || !fss.existsSync(file) || fss.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fss.createReadStream(file).pipe(res);
});
// 서버 허용 출처의 두 자리(5500 · 8080)를 먼저 쓰고, 둘 다 다른 로컬 서버가 쓰고 있으면 빈 자리 아무 데나 — 페이지와 함수 앱이
// 같은 출처라 CORS를 타지 않고, 함수 코드에는 출처 검사가 따로 없다(출처 제한은 배포 때 onRequest의 cors 옵션이 한다).
let PORT = null;
for (const p of [5500, 8080, 0]) {
  const ok = await new Promise((resolve) => { server.once('error', () => resolve(false)); server.listen(p, '127.0.0.1', () => resolve(true)); });
  if (ok) { PORT = server.address().port; break; }
}
if (!PORT) { console.error('로컬 서버를 열지 못했다'); process.exit(2); }
const base = `http://127.0.0.1:${PORT}/`;

// ── 가짜 카메라: 시험 사진의 4:3 프레임(manifest 잘라내기)을 1280×960 영상으로 ─────────────
const tmp = path.join(out, '_tmp');
await fs.mkdir(tmp, { recursive: true });
async function makeY4m(id) {
  const p = manifest.photos.find((x) => x.id === id);
  if (!p) throw Error('사진 ' + id + '이 manifest에 없다');
  const [x, y, w, h] = p.cropPx;
  const y4m = path.join(tmp, id + '.y4m');
  const ff = spawnSync('ffmpeg', ['-v', 'error', '-y', '-loop', '1', '-i', path.join(photoDir, p.file), '-t', '3', '-r', '15', '-pix_fmt', 'yuv420p', '-vf', `crop=${w}:${h}:${x}:${y},scale=1280:960`, y4m]);
  if (ff.status !== 0) throw Error('ffmpeg: ' + ff.stderr);
  return { y4m };
}

const steps = [];
async function scenario(name, id, mode, { regen, genre, title }) {
  current = name; lastForm = null;
  const { y4m } = await makeY4m(id);
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'real-loop-'));
  const port = 9563;
  const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--no-default-browser-check', '--mute-audio',
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`,
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let socket, seq = 0; const pending = new Map();
  const log = (step, ok, extra = {}) => { const r = { scenario: name, photoId: id, mode, step, ok, at: new Date().toISOString(), ...extra }; steps.push(r); console.log(`${name} ${step} ${ok ? 'OK' : '실패'} ${extra.note || ''}`); return ok; };
  try {
    let target;
    for (let i = 0; i < 80 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {} if (!target) await sleep(100); }
    if (!target) throw Error('브라우저를 못 띄움');
    socket = new globalThis.WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r, j) => { socket.onopen = r; socket.onerror = j; });
    socket.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result); } };
    const call = (method, params = {}) => new Promise((resolve, reject) => { const i = ++seq; pending.set(i, { resolve, reject }); socket.send(JSON.stringify({ id: i, method, params })); });
    const evaluate = async (expression) => { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result.value; };
    const waitFor = async (expr, ms) => { for (let i = 0; i < ms / 200; i++) { if (await evaluate(expr).catch(() => false)) return true; await sleep(200); } return false; };
    const shot = async (file) => { const s = await call('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(out, `${name}-${file}.png`), Buffer.from(s.data, 'base64')); };
    await call('Network.enable');
    await call('Network.setBlockedURLs', { urls: ['https://*'] });   // 라이브 · 외부로는 한 건도 나가지 않는다
    await call('Page.enable');
    await call('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const net = window.fetch.bind(window); const API = ${JSON.stringify(apiBase)};
      window.fetch = (input, init) => { const url = String((input && input.url) || input); return url.startsWith(API) ? net('/posterStudio' + url.slice(API.length), init) : net(input, init); };
      window.__printed = 0; window.print = () => { window.__printed++; }; })();` });
    await call('Page.navigate', { url: base });
    if (!log('1단계 열림', await waitFor('!!document.getElementById("prepareNextBtn")', 20000))) return;
    await evaluate(`document.querySelector('[data-mode="${mode}"]').click() || true`);
    await sleep(300);
    if (genre) {
      await evaluate(`document.querySelector('.genre-option[data-genre="${genre}"]').click() || true`);
      // 제목: 화면 입력칸에 사람이 친 것처럼(값 + input 이벤트). 문구 입력칸은 화면에 없다 — 앱이 장르 예시에서 고른다(getMeta)
      if (title) await evaluate(`(() => { const el = document.getElementById("movieTitle"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, ${JSON.stringify(title)}); el.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
      await sleep(300);
      const picked = await evaluate(`(() => ({ genre: document.getElementById("genre").value, pressed: document.querySelector('.genre-option[aria-pressed="true"]')?.dataset.genre ?? null, title: document.getElementById("movieTitle").value }))()`);
      if (!log('장르 · 제목', picked.genre === genre && picked.pressed === genre && (!title || picked.title === title), { note: JSON.stringify(picked) })) return;
    }
    await shot('1-step1');
    await evaluate('document.getElementById("prepareNextBtn").click() || true');
    if (!log('2단계', await waitFor('!document.getElementById("cameraView").hidden', 10000))) return;
    await evaluate("document.getElementById('startBtn') && document.getElementById('startBtn').click() || true");
    if (!log('카메라 켜짐(가짜 카메라)', await waitFor('(() => { const v = document.getElementById("video"); return !!v && !v.classList.contains("hidden") && v.videoWidth > 0; })()', 15000))) return;
    await evaluate("document.getElementById('shotBtn').click() || true");
    if (!log('촬영', await waitFor('!document.getElementById("generateBtn").hidden', 20000))) return;
    await sleep(2600);
    await shot('2-shot');
    const generate = async (n) => {
      const before = served.filter((s) => s.path === '/generate').length;
      await evaluate('document.getElementById("generateBtn").click() || true');
      log(`생성 ${n} 요청`, await waitFor('!!document.querySelector(".generation-wait, [class*=generation-wait]")', 10000));
      await sleep(1500);
      await shot(`3-loading-${n}`);
      const t0 = Date.now();
      // 끝 = 3단계가 보이고 로딩 창(#spinner)이 닫힘, 또는 «포스터를 만들지 못했어요» 창(.generate-failure-dialog)
      const done = await waitFor(`(() => (!document.getElementById("resultView").hidden && !document.querySelector("#spinner[open]")) || !!document.querySelector(".generate-failure-dialog"))()`, 160000);
      const resp = served.filter((s) => s.path === '/generate').slice(before)[0] ?? null;
      return { done, ms: Date.now() - t0, resp, result: await evaluate('!document.getElementById("resultView").hidden && !document.querySelector(".generate-failure-dialog")'), dialog: await evaluate('(() => { const d = document.querySelector(".generate-failure-dialog"); return d ? d.innerText.replace(/\\s+/g, " ").slice(0, 200) : null; })()') };
    };
    const g1 = await generate(1);
    if (!log('생성 1 → 3단계 포스터', g1.done && g1.result, { serverStatus: g1.resp?.status, waitS: Math.round(g1.ms / 100) / 10, note: g1.dialog || '' })) { await shot('3-fail-1'); return; }
    await sleep(3500);
    await shot('4-step3');
    const posters = await evaluate('document.querySelectorAll("#gallery .style-option").length');
    log('8개 디자인 생성', posters === 8, { note: `디자인 ${posters}개` });
    await evaluate('document.getElementById("printBtn").click() || true');
    await sleep(800);
    log('출력 단추 → 인쇄 호출', (await evaluate('window.__printed')) >= 1);
    await call('Emulation.setEmulatedMedia', { media: 'print' });
    await sleep(500);
    await shot('5-print');
    await call('Emulation.setEmulatedMedia', { media: '' });
    if (regen) {
      // 같은 사진으로 다시: 3단계 «이전» → 2단계(찍은 사진 그대로) → «이 사진으로 포스터 만들기»
      await evaluate('document.querySelector(".result-actions .back-button").click() || true');
      if (!log('이전 → 2단계(같은 사진)', await waitFor('!document.getElementById("cameraView").hidden && !document.getElementById("generateBtn").hidden', 10000))) return;
      const g2 = await generate(2);
      if (!log('같은 사진 생성 2 → 3단계', g2.done && g2.result, { serverStatus: g2.resp?.status, waitS: Math.round(g2.ms / 100) / 10, note: g2.dialog || '' })) { await shot('3-fail-2'); return; }
      await sleep(3500);
      await shot('6-step3-second');
      await evaluate('document.querySelector(".result-actions .back-button").click() || true');
      await waitFor('!document.getElementById("cameraView").hidden && !document.getElementById("generateBtn").hidden', 10000);
      // 세 번째: 화면이 먼저 막는다(사진당 2회 — 서버도 같은 한도를 지키지만 여기까지 오지 않는다). 서버 요청 0건 + 안내 문구.
      const before3 = served.filter((s) => s.path === '/generate').length;
      await evaluate('document.getElementById("generateBtn").click() || true');
      await sleep(1500);
      const notice = await evaluate('(document.getElementById("status") && document.getElementById("status").innerText || "").replace(/\\s+/g, " ")');
      const sent3 = served.filter((s) => s.path === '/generate').length - before3;
      log('같은 사진 생성 3 → «사진당 2회» 한도(화면에서 막음)', sent3 === 0 && /횟수를 모두/.test(notice), { serverRequests: sent3, note: notice });
      await shot('7-photo-limit');
    }
  } catch (e) { log('오류', false, { note: String(e.message || e).slice(0, 200) }); } finally {
    try { socket?.close(); } catch {}
    chrome.kill(); await sleep(500); await fs.rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

try {
  if (cases) for (const c of cases) await scenario(c.name, c.photoId, c.mode, { regen: false, genre: c.genre, title: c.title });
  else {
    await scenario('solo', soloId, 'solo', { regen: true });
    await scenario('group', groupId, 'group', { regen: false });
  }
} finally {
  server.close();
  await fs.rm(tmp, { recursive: true, force: true });
}
const openaiCalls = calls.length, cost = calls.reduce((s, c) => s + c.cost, 0);
// 지시문 판 확인: 생성마다 «맞는 판 = 선택표의 그 칸 하나»
for (const c of calls) {
  const ok = !!c.prompt && c.prompt.matched.length === 1 && c.prompt.matched[0] === c.prompt.frozen;
  const note = c.prompt ? `${c.prompt.genre}/${c.prompt.mode} 선택표 ${c.prompt.frozen} · 맞는 판 ${c.prompt.matched.join(',') || '없음'} · ${c.prompt.version}` : '화면 입력을 못 읽음';
  steps.push({ scenario: c.caseId, step: '지시문 판 = 선택표 칸', ok, at: new Date().toISOString(), note });
  console.log(`${c.caseId} 지시문 판 = 선택표 칸 ${ok ? 'OK' : '실패'} ${note}`);
}
const summary = { createdAt: new Date().toISOString(), dry, module: modulePath, photos: cases ?? { solo: soloId, group: groupId }, reserve: RESERVE, maxCalls, cap, steps, server: served, openai: { calls: openaiCalls, cost: Number(cost.toFixed(4)), detail: calls }, blockedExternal: 'https://*' };
await fs.writeFile(path.join(out, 'real-loop.json'), JSON.stringify(summary, null, 1));
const failed = steps.filter((s) => !s.ok);
console.log(`실제 모드 한 바퀴: 단계 ${steps.length - failed.length}/${steps.length} 통과 · OpenAI 호출 ${openaiCalls}건 · $${cost.toFixed(4)}${dry ? ' (DRY)' : ''}`);
process.exit(failed.length ? 1 : 0);
