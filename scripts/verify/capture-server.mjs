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
   ──────────────────────────────────────────────────────────────────── */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'snapshots');
const PORT = Number(process.env.CAPTURE_PORT || 5502);
const SAFE_NAME = /^[A-Za-z0-9._-]{1,80}$/;

fs.mkdirSync(DIR, { recursive: true });

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type'
};

http
  .createServer((req, res) => {
    if (req.method === 'OPTIONS') return res.writeHead(204, cors).end();

    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (req.method !== 'POST' || url.pathname !== '/save') {
      return res.writeHead(404, cors).end('POST /save?name=<이름>');
    }

    // 파일명은 화이트리스트로만 받는다 — 경로 조작(../)을 원천 차단한다.
    const name = url.searchParams.get('name') || '';
    if (!SAFE_NAME.test(name)) {
      return res.writeHead(400, cors).end('name은 영문/숫자/._- 만, 1~80자');
    }

    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      try {
        JSON.parse(raw); // 깨진 JSON을 그대로 저장해 나중에 헷갈리는 일이 없게 한다
      } catch {
        return res.writeHead(400, cors).end('JSON 파싱 실패');
      }
      const file = path.join(DIR, `${name}.json`);
      fs.writeFileSync(file, raw);
      console.log(`저장: ${path.relative(process.cwd(), file)} (${(raw.length / 1024).toFixed(1)}KB)`);
      res.writeHead(200, cors).end(file);
    });
  })
  .listen(PORT, '127.0.0.1', () => {
    console.log(`스냅샷 수집 서버: http://127.0.0.1:${PORT}/save?name=<이름>`);
    console.log(`저장 위치: ${DIR}`);
  });
