// node scripts/media/wait-preview-server.mjs — 확정 자료와 실제 로딩 화면을 API 없이 확인한다.
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';

const root = process.cwd();
const archive = path.join(root, '_docs/intents/2026-09-30-studio-design-integration/loading-approved-2026-10-01');
const result = await build({ write: false, entryPoints: ['scripts/media/wait-preview-entry.tsx'], bundle: true, format: 'esm', jsx: 'automatic', outfile: 'app.js', define: { 'process.env.NODE_ENV': '"production"' } });
const compiled = new Map(result.outputFiles.map(file => ['/' + path.basename(file.path), file.contents]));
const html = '<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Poster Studio · 로딩 미리보기</title><link rel="stylesheet" href="/fonts/pretendard.css"><link rel="stylesheet" href="/app.css"><style>*{box-sizing:border-box}body{margin:0}button{font:inherit}</style><div id="root"></div><script type="module" src="/app.js"></script></html>';
const mime = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp', '.txt': 'text/plain;charset=utf-8', '.json': 'application/json', '.zip': 'application/zip' };
http.createServer(async (req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (req.method !== 'GET') return res.writeHead(405).end();
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', mime[path.extname(name)] || 'text/html;charset=utf-8');
  if (name === '/') return res.end(html);
  if (compiled.has(name)) return res.end(compiled.get(name));
  const base = name.startsWith('/fonts/') || name.startsWith('/studio/') ? path.join(root, 'public') : archive;
  const file = path.resolve(base, '.' + name);
  if (!file.startsWith(base + path.sep)) return res.writeHead(404).end();
  try { res.end(await fs.readFile(file)); } catch { res.writeHead(404).end(); }
}).listen(5523, '127.0.0.1', () => console.log('Poster Studio 미리보기: http://127.0.0.1:5523/ · 확정 자료: /samples.html · API 연결 없음'));
