#!/usr/bin/env node
/* ────────────────────────────────────────────────────────────────────
   스냅샷 수집 서버 — 브라우저가 뽑은 JSON을 파일로 받아 적는다.

     node scripts/verify/capture-server.mjs          (기본 포트 5502)

   브라우저는 파일을 못 쓰고, 스냅샷을 콘솔로 되받으면 크기가 커서 다루기
   힘들다(요소 56개 × 속성 85개). 그래서 페이지에서 이 서버로 POST해 바로
   `scripts/verify/snapshots/<이름>.json`에 저장한다.

   페이지 쪽 사용법:
     await fetch('http://localhost:5502/save?name=before-1366', {
       method: 'POST', body: JSON.stringify(window.__posterSnapshot())
     }).then(r => r.text());

   전환 내내 (전/후) × (뷰포트) × (반복) 만큼 반복해서 쓴다.

   받는 요청은 같은 컴퓨터의 페이지(http://localhost·127.0.0.1, 포트 무관)가 보낸 것뿐이다.
   다른 사이트가 열린 브라우저가 이 서버로 POST해 기준선을 덮어쓰지 못하게 Origin·Host를 보고,
   본문은 MAX_BYTES까지만 받는다. Origin이 없는 요청(curl·node)은 같은 컴퓨터의 도구로 본다.
   ──────────────────────────────────────────────────────────────────── */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'snapshots');
const PORT = Number(process.env.CAPTURE_PORT || 5502);
const SAFE_NAME = /^[A-Za-z0-9._-]{1,80}$/;
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;
const LOCAL_HOST = /^(localhost|127\.0\.0\.1)(:\d{1,5})?$/;
export const MAX_BYTES = 20 * 1024 * 1024;

export function createCaptureServer(dir = DIR) {
  fs.mkdirSync(dir, { recursive: true });
  return http.createServer((req, res) => {
    const origin = req.headers.origin;
    if (!LOCAL_HOST.test(req.headers.host || '') || (origin !== undefined && !LOCAL_ORIGIN.test(origin))) {
      return res.writeHead(403).end('같은 컴퓨터의 페이지만 저장할 수 있습니다');
    }
    const cors = origin
      ? { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', vary: 'Origin' }
      : {};
    if (req.method === 'OPTIONS') return res.writeHead(204, cors).end();

    const url = new URL(req.url, 'http://localhost');
    if (req.method !== 'POST' || url.pathname !== '/save') {
      return res.writeHead(404, cors).end('POST /save?name=<이름>');
    }

    // 파일명은 화이트리스트로만 받는다 — 경로 조작(../)을 원천 차단한다.
    const name = url.searchParams.get('name') || '';
    if (!SAFE_NAME.test(name)) {
      return res.writeHead(400, cors).end('name은 영문/숫자/._- 만, 1~80자');
    }

    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BYTES) {
        res.writeHead(413, cors).end('스냅샷이 너무 큽니다');
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      try {
        JSON.parse(raw); // 깨진 JSON을 그대로 저장해 나중에 헷갈리는 일이 없게 한다
      } catch {
        return res.writeHead(400, cors).end('JSON 파싱 실패');
      }
      const file = path.join(dir, `${name}.json`);
      fs.writeFileSync(file, raw);
      console.log(`저장: ${path.relative(process.cwd(), file)} (${(raw.length / 1024).toFixed(1)}KB)`);
      res.writeHead(200, cors).end(file);
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createCaptureServer().listen(PORT, '127.0.0.1', () => {
    console.log(`스냅샷 수집 서버: http://127.0.0.1:${PORT}/save?name=<이름>`);
    console.log(`저장 위치: ${DIR}`);
  });
}
