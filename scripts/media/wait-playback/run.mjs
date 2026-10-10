// 대기 영상 실제 재생 시험(2026-10-10 팀장 지시 «7초 영상은 8초마다 넘길 때 어떻게 보이나 — 실제 재생 동작으로 확인»).
// 검토 폴더의 survey.json에 적힌 12편을 sim.html(가지의 대기 화면과 같은 재생 방식)로 헤드리스 크롬에서 차례로 틀고,
// 편마다 재생 시작까지 걸린 시간 · 넘길 때 어디까지 봤는지 · 끝 프레임에서 머문 시간 · 4초 안에 못 틀어 원화로 돌아갔는지를 남긴다.
// 조건: fast(그대로) · slow4g(1.6Mbps·150ms) · cpu4(CPU 4배 느리게). 셋 다 HTTP 캐시를 끈다(첫 바퀴 = 가장 나쁜 경우).
// 사용: node scripts/media/wait-playback/run.mjs <검토 폴더> [fast slow4g cpu4]  → <검토 폴더>/analysis/playback-<조건>.json
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const [dir, ...conds] = process.argv.slice(2);
if (!dir) { console.error('사용: node run.mjs <검토 폴더> [fast slow4g cpu4]'); process.exit(2); }
const root = path.resolve(dir);
const survey = JSON.parse(fs.readFileSync(path.join(root, 'survey.json'), 'utf8'));
const videos = survey.items.sort((a, b) => a.id - b.id).map((it) => it.video);
if (!videos.length) { console.error('영상 0편 — 대상이 없으면 통과가 아니라 실패다'); process.exit(2); }
for (const v of videos) if (!fs.existsSync(path.join(root, v))) { console.error(`없는 영상: ${v}`); process.exit(2); }
const TYPES = { '.html': 'text/html; charset=utf-8', '.mp4': 'video/mp4', '.webm': 'video/webm' };
const CONDS = {
  fast: async () => {},
  slow4g: (send) => send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 }),
  cpu4: (send) => send('Emulation.setCPUThrottlingRate', { rate: 4 }),
};

// 시험 페이지와 검토 폴더의 영상을 내주는 작은 서버 — 검토 폴더 밖은 내주지 않는다.
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = p === '/sim.html' ? path.join(HERE, 'sim.html') : path.resolve(root, '.' + p);
  if ((file !== path.join(HERE, 'sim.html') && !file.startsWith(root + path.sep)) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/sim.html`;

let failed = false;
for (const cond of conds.length ? conds : Object.keys(CONDS)) {
  if (!CONDS[cond]) { console.error(`모르는 조건: ${cond}`); failed = true; continue; }
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'wait-playback-'));
  const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--no-default-browser-check',
    '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--remote-debugging-port=0', `--user-data-dir=${prof}`, '--window-size=900,900', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let gone = null;   // 크롬이 도중에 꺼지면 기다리지 말고 실패한다(꺼진 줄 모르고 멈춰 있던 일이 실제로 있었다)
  const pend = new Map();
  const fail = (why) => { gone = why; for (const p of pend.values()) p.reject(Error(why)); pend.clear(); };
  chrome.on('exit', (code, sig) => fail(`크롬이 꺼짐(code ${code}, ${sig})`));
  let target;
  for (let i = 0; i < 100 && !target && !gone; i++) {
    try {
      const port = fs.readFileSync(path.join(prof, 'DevToolsActivePort'), 'utf8').split('\n')[0];
      target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page');
    } catch { /* 아직 안 뜸 */ }
    if (!target) await wait(100);
  }
  if (!target) throw Error(gone || '크롬 페이지를 10초 안에 못 찾음');
  const ws = new globalThis.WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onclose = () => fail('크롬 연결이 끊김');
  let id = 0;
  ws.onmessage = ({ data }) => { const m = JSON.parse(data); const p = m.id && pend.get(m.id); if (!p) return; pend.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    if (gone) { reject(Error(gone)); return; }
    const i = ++id; pend.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params }));
  });
  await send('Page.enable'); await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
  await CONDS[cond](send);
  await send('Page.navigate', { url });
  await wait(1500);
  // 영상 목록은 코드 문자열에 끼워 넣지 않고 함수 인자로 넘긴다
  const win = (await send('Runtime.evaluate', { expression: 'window' })).result.objectId;
  const log = (await send('Runtime.callFunctionOn', { objectId: win, functionDeclaration: 'function (list) { return this.__run(list); }',
    arguments: [{ value: videos }], awaitPromise: true, returnByValue: true })).result.value;
  const rows = log.map((x) => ({
    영상: x.scene, 길이초: x.durationS ?? null, 재생시작ms: x.playingAt == null ? null : Math.round(x.playingAt),
    끝까지봄: x.ended, 끝프레임에서머문초: x.ended && x.lastFrameAt != null ? +((x.unmountAt - x.lastFrameAt) / 1000).toFixed(3) : 0,
    못본초: x.ended ? 0 : x.durationS ? +(x.durationS - x.currentTimeAtSwitch).toFixed(2) : null,
    보인프레임: x.lastPresented, 원화로돌아감ms: x.failedAt == null ? null : Math.round(x.failedAt),
  }));
  fs.mkdirSync(path.join(root, 'analysis'), { recursive: true });
  fs.writeFileSync(path.join(root, 'analysis', `playback-${cond}.json`), JSON.stringify({ 조건: cond, 측정: new Date().toISOString(), rows, log }, null, 1));
  for (const r of rows) console.log(cond, r.영상, `길이 ${r.길이초?.toFixed(3) ?? '-'}초 · 시작 ${r.재생시작ms ?? '-'}ms · ` +
    (r.끝까지봄 ? `끝 프레임에서 ${r.끝프레임에서머문초}초 머묾` : r.못본초 == null ? '재생 안 됨' : `마지막 ${r.못본초}초 못 봄`) + (r.원화로돌아감ms != null ? ` · ${r.원화로돌아감ms}ms에 원화로` : ''));
  try { await send('Browser.close'); } catch { /* 이미 닫힘 */ }
  ws.close(); chrome.kill();
  await wait(500);
  fs.rmSync(prof, { recursive: true, force: true });
}
server.close();
process.exit(failed ? 1 : 0);
