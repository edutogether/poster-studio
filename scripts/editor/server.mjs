#!/usr/bin/env node
/* 화면 편집판 작은 서버(2026-10-23) — «편집판 열기.cmd»가 띄운다. 이 컴퓨터(127.0.0.1)에서만 열린다.
   /            = 앱 빌드 사본(app/) — index.html 맨 앞에 편집판 준비 스크립트(inject.js)를 끼운다(앱 파일은 바꾸지 않음)
   /__editor/   = 편집판(editor/)
   열리면 기본 브라우저로 편집판을 띄운다. 창을 닫으면 서버도 끝난다. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, 'app'), ED = path.join(here, 'editor');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webm': 'video/webm', '.txt': 'text/plain; charset=utf-8' };

function send(res, file, req) {
  const stat = fs.statSync(file);
  const type = TYPES[path.extname(file)] || 'application/octet-stream';
  const range = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
  if (range && /^(video|audio)\//.test(type)) {   // 영상은 끊어 받기(Range)를 받아야 브라우저가 틀어 준다
    const start = range[1] ? Number(range[1]) : 0, end = range[2] ? Number(range[2]) : stat.size - 1;
    res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${start}-${end}/${stat.size}`, 'accept-ranges': 'bytes', 'content-length': end - start + 1, 'cache-control': 'no-cache' });
    fs.createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { 'content-type': type, 'content-length': stat.size, 'accept-ranges': 'bytes', 'cache-control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const root = p.startsWith('/__editor/') ? ED : APP;
  const rel = p.startsWith('/__editor/') ? p.slice('/__editor'.length) : p;
  let file = path.resolve(root, '.' + (rel.endsWith('/') ? rel + 'index.html' : rel));
  if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403); res.end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  if (root === APP && file === path.join(APP, 'index.html')) {   // 앱 첫 페이지에만 준비 스크립트를 끼운다
    const html = fs.readFileSync(file, 'utf8').replace(/<head>/i, '<head><script src="/__editor/inject.js"></script>');
    res.writeHead(200, { 'content-type': TYPES['.html'], 'cache-control': 'no-cache' });
    res.end(html);
    return;
  }
  send(res, file, req);
});

const ports = [5390, 5391, 5392, 5393, 5394, 6390, 7390];
// 포트마다 «열림 · 실패» 듣기를 한 쌍씩 걸고, 하나가 오면 다른 하나를 뗀다 — 떼지 않으면 실패한 포트의 «열림»이 남아 있다가
// 다음 포트가 열릴 때 같이 불려, 쓰지 못한 주소까지 찍고 브라우저를 여러 번 연다(2026-10-23 실측: 5390 · 5391 · 5392 세 번)
const listen = (i) => {
  const onError = (e) => {
    server.off('listening', onListening);
    if (i + 1 < ports.length) listen(i + 1); else { console.error('열 수 있는 포트가 없습니다: ' + e.message); process.exit(1); }
  };
  const onListening = () => {
    server.off('error', onError);
    const url = `http://127.0.0.1:${ports[i]}/__editor/`;
    console.log(`Poster Studio 화면 편집판: ${url}`);
    console.log('이 창을 닫으면 편집판도 꺼집니다.');
    if (!process.argv.includes('--no-open')) spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
  };
  server.once('error', onError);
  server.once('listening', onListening);
  server.listen(ports[i], '127.0.0.1');
};
listen(0);
