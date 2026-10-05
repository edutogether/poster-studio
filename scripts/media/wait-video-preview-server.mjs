// 승인 자료를 수정하지 않는 영상 후속 검토 서버. loopback만, 생성 API 없음.
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

export async function startVideoPreview({ port = 5524, fixture } = {}) {
  const root = process.cwd();
  const archive = path.join(root, '_docs/intents/2026-09-30-studio-design-integration/loading-approved-2026-10-01');
  const followup = path.join(root, '_docs/intents/2026-09-30-studio-design-integration/video-followup-2026-10-03');
  const result = await build({ write: false, entryPoints: [fixture ? 'scripts/verify/wait-video-fixture-entry.tsx' : 'scripts/media/wait-video-preview-entry.tsx'], bundle: true, format: 'esm', jsx: 'automatic', outfile: 'app.js', define: { 'process.env.NODE_ENV': '"production"' } });
  const compiled = new Map(result.outputFiles.map(file => ['/' + path.basename(file.path), file.contents]));
  const html = '<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Poster Studio · 영상 제작 검토</title><link rel="stylesheet" href="/fonts/pretendard.css"><link rel="stylesheet" href="/app.css"><div id="root"></div><script type="module" src="/app.js"></script></html>';
  const mime = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp', '.txt': 'text/plain;charset=utf-8', '.json': 'application/json', '.mp4': 'video/mp4' };
  const server = http.createServer(async (req, res) => {
    try {
      const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (!['GET', 'HEAD'].includes(req.method)) return res.writeHead(405).end();
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; media-src 'self'; connect-src 'self'");
      let bytes, ext = path.extname(name);
      if (name === '/' || name === '/videos.html') { bytes = Buffer.from(html); ext = '.html'; }
      else if (compiled.has(name)) bytes = compiled.get(name);
      else if (fixture && name === '/qa-only.mp4') bytes = await fs.readFile(fixture);
      else {
        const approved = name.startsWith('/approved/'), briefs = name.startsWith('/briefs/');
        const base = approved ? path.join(archive, 'assets') : briefs ? path.join(followup, 'prompts') : name.startsWith('/fonts/') || name.startsWith('/studio/') ? path.join(root, 'public') : archive;
        const relative = approved ? name.slice('/approved/'.length) : briefs ? name.slice('/briefs/'.length) : '.' + name;
        const file = path.resolve(base, relative);
        if (!file.startsWith(base + path.sep)) return res.writeHead(404).end();
        bytes = await fs.readFile(file);
      }
      res.setHeader('Content-Type', mime[ext] || 'application/octet-stream');
      res.setHeader('Accept-Ranges', 'bytes');
      let begin = 0, end = bytes.length - 1;
      if (req.headers.range) {
        const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
        if (!match || Number(match[1]) >= bytes.length || (match[2] && Number(match[2]) < Number(match[1]))) return res.writeHead(416, { 'Content-Range': `bytes */${bytes.length}` }).end();
        begin = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), end) : end;
        res.statusCode = 206; res.setHeader('Content-Range', `bytes ${begin}-${end}/${bytes.length}`);
      }
      res.setHeader('Content-Length', end - begin + 1);
      res.end(req.method === 'HEAD' ? undefined : bytes.subarray(begin, end + 1));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return server;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await startVideoPreview();
  console.log('Poster Studio 영상 후속: http://127.0.0.1:5524/videos.html · API 연결 없음');
}
