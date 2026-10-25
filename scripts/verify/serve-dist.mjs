#!/usr/bin/env node
/* 빌드한 dist를 firebase.json의 머리글(캐시 · 보안) + gzip으로 서빙하는 작은 서버 — 로컬에서 전/후를 라이브와 같은 캐시 조건으로 재려고(2026-10-24).

     node scripts/verify/serve-dist.mjs <저장소 폴더(dist · firebase.json이 있는 곳)> <포트> [--replay <응답 JSON 파일>] [--h2 <인증서 폴더(key.pem · cert.pem)>]

   --replay(2026-10-26): POST /__replay/answer?delay=N 에 N초 기다렸다가 그 파일을 그대로 보낸다(압축 없음 — 라이브 함수도
   응답을 압축하지 않는다). net-perf.mjs --real N --replay가 생성 요청을 여기로 돌려, 실제 응답 그림(약 3.1MB)을 흉내 낸 망으로 받게 한다.
   응답 파일은 실제 생성 결과로 만든 것이라 저장소 밖에 둔다(아이 사진 · AI 그림을 저장소에 넣지 않는다).
   --h2(2026-10-26): 라이브(Firebase Hosting)처럼 HTTP/2로 서빙한다 — HTTP/1.1은 주소당 연결이 6개라 글꼴 여러 개가 몰리면 영상 요청이
   줄을 서서 라이브에 없는 정체가 생긴다. 자체 서명 인증서(127.0.0.1)를 쓰고 net-perf.mjs의 크롬은 인증서 오류를 무시한다. */
import http from 'node:http';
import http2 from 'node:http2';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const args = process.argv.slice(2);
const replayAt = args.indexOf('--replay');
const replay = replayAt >= 0 ? fs.readFileSync(args[replayAt + 1]) : null;
const h2At = args.indexOf('--h2');
// 선택의 값 자리만 뺀다 — 선택이 없으면 indexOf가 -1이라 «-1 + 1 = 0번째», 곧 저장소 폴더를 빼는 일이 없게
const valueAt = new Set([replayAt, h2At].filter((i) => i >= 0).map((i) => i + 1));
const [repo, port] = args.filter((a, i) => !a.startsWith('--') && !valueAt.has(i));
if (!repo || !port || !fs.existsSync(path.join(repo, 'dist', 'index.html'))) { console.error('사용: serve-dist.mjs <저장소 폴더> <포트> [--replay <응답 JSON>]'); process.exit(2); }
const root = path.resolve(repo, 'dist');
const rules = JSON.parse(fs.readFileSync(path.join(repo, 'firebase.json'), 'utf8')).hosting.headers;
// Hosting 글롭: «**/»는 앞 경로 아무것이나, 끝의 «**»는 그 아래 전부(«/assets/**»가 /assets/main-….js를 잡아야 한다 — 10/24판은 못 잡아 1시간 캐시로 서빙했다)
const glob = (g) => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '\u0000').replace(/\*\*/g, '\u0001').replace(/\*/g, '[^/]*').replace(/\u0000/g, '(?:.*/)?').replace(/\u0001/g, '.*') + '$');
const TYPE = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon' };

const handler = (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/__replay/answer') {
    if (!replay) { res.writeHead(404); res.end(); return; }
    req.resume();   // 올린 사진(본문)은 받아서 버린다 — 망 흉내로 올리는 시간까지 든다
    req.on('end', () => globalThis.setTimeout(() => { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': replay.length, 'Cache-Control': 'no-store' }); res.end(replay); }, Number(u.searchParams.get('delay') || 0) * 1000));
    return;
  }
  const p = decodeURIComponent(u.pathname);
  let file = path.join(root, p);
  if (p.endsWith('/')) file = path.join(file, 'index.html');
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  const h = { 'Content-Type': TYPE[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'max-age=3600', 'Accept-Ranges': 'bytes' };
  for (const r of rules) if (glob(r.source).test(p)) for (const x of r.headers) h[x.key] = x.value;
  let body = fs.readFileSync(file);
  const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
  if (range) {
    const a = range[1] ? +range[1] : 0, b = range[2] ? +range[2] : body.length - 1;
    h['Content-Range'] = `bytes ${a}-${b}/${body.length}`;
    res.writeHead(206, h); res.end(body.subarray(a, b + 1)); return;
  }
  if (/^(text|application\/json|image\/svg)/.test(h['Content-Type']) && /gzip/.test(req.headers['accept-encoding'] || '')) { body = zlib.gzipSync(body); h['Content-Encoding'] = 'gzip'; h.Vary = 'Accept-Encoding'; }
  res.writeHead(200, h); res.end(body);
};
const server = h2At >= 0
  ? http2.createSecureServer({ key: fs.readFileSync(path.join(args[h2At + 1], 'key.pem')), cert: fs.readFileSync(path.join(args[h2At + 1], 'cert.pem')), allowHTTP1: true }, handler)
  : http.createServer(handler);
server.listen(+port, '127.0.0.1', () => console.log(`${root} → ${h2At >= 0 ? 'https' : 'http'}://127.0.0.1:${port}/${h2At >= 0 ? ' (HTTP/2)' : ''}${replay ? ` · 응답 재생 ${(replay.length / 1024).toFixed(0)}KB` : ''}`));
