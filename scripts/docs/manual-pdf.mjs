/* 설명서(_docs/manual/*.md)를 인쇄용 A4 PDF로 만든다(2026-10-16). 화면과 같은 Pretendard 글꼴(전체판)을 쓴다.

     node scripts/docs/manual-pdf.mjs <설명서.md> <출력.pdf>

   마크다운은 설명서가 쓰는 만큼만 읽는다: 제목(#~###) · 문단 · 목록(-, 1.) · 표 · 인용(>) · 굵게(**) · 코드(`) ·
   그림(![설명](경로) — md 파일 기준 상대 경로) · 링크. 모르는 문법은 글자 그대로 둔다(조용히 빼지 않는다).
   같은 폴더에 같은 이름의 .html도 남긴다(브라우저로 미리 보기). 헤드리스 크롬으로 인쇄한다. */
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const [src, out] = process.argv.slice(2);
if (!src || !out) { console.error('사용: node scripts/docs/manual-pdf.mjs <설명서.md> <출력.pdf>'); process.exit(2); }
const md = await fs.readFile(src, 'utf8');
const base = path.dirname(path.resolve(src));
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const inline = (s) => esc(s)
  .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, p) => `<img src="${pathToFileURL(path.resolve(base, p)).href}" alt="${alt}">`)
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/`([^`]+)`/g, '<code>$1</code>');

export function toHtml(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    let m;
    if ((m = /^(#{1,3}) (.*)$/.exec(line))) { html.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); i++; continue; }
    if (line.startsWith('>')) {
      const body = []; while (i < lines.length && lines[i].startsWith('>')) body.push(lines[i++].replace(/^> ?/, ''));
      html.push(`<blockquote>${inline(body.join(' '))}</blockquote>`); continue;
    }
    if (line.startsWith('|')) {
      const rows = []; while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(rows[0]); const body = rows.slice(2).map(cells);
      html.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if ((m = /^(\s*)(-|\d+\.) /.exec(line))) {
      const ordered = /\d/.test(m[2]); const items = [];
      while (i < lines.length && /^\s*(-|\d+\.) /.test(lines[i])) {
        let item = lines[i++].replace(/^\s*(-|\d+\.) /, '');
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*(-|\d+\.) /.test(lines[i])) item += ' ' + lines[i++].trim();
        items.push(`<li>${inline(item)}</li>`);
      }
      html.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`); continue;
    }
    const para = []; while (i < lines.length && lines[i].trim() && !/^(#{1,3} |>|\||\s*(-|\d+\.) )/.test(lines[i])) para.push(lines[i++].trim());
    html.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return html.join('\n');
}

const fontDir = path.resolve('public/fonts');
const face = (w, file) => `@font-face{font-family:Manual;font-weight:${w};src:url("${pathToFileURL(path.join(fontDir, file)).href}") format("woff2")}`;
const page = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(path.basename(src, '.md'))}</title><style>
${face(400, 'Pretendard-Regular.woff2')}${face(600, 'Pretendard-SemiBold.woff2')}${face(800, 'Pretendard-ExtraBold.woff2')}
@page{size:A4;margin:16mm 15mm}
body{font-family:Manual,sans-serif;font-size:10.5pt;line-height:1.6;color:#1c1c1c;margin:0}
h1{font-size:19pt;font-weight:800;margin:0 0 8pt}h2{font-size:13.5pt;font-weight:800;margin:16pt 0 6pt;padding-bottom:3pt;border-bottom:1.5pt solid #ed3124;break-after:avoid}h3{font-size:11.5pt;margin:10pt 0 4pt;break-after:avoid}
p{margin:0 0 6pt}ul,ol{margin:0 0 6pt;padding-left:16pt}li{margin:0 0 2pt}strong{font-weight:800}
blockquote{margin:0 0 10pt;padding:6pt 10pt;background:#f4f4f6;border-radius:4pt;color:#555;font-size:9.5pt}
table{width:100%;border-collapse:collapse;margin:0 0 8pt;font-size:9.5pt;break-inside:auto}th,td{border:0.6pt solid #cfcfd6;padding:4pt 6pt;text-align:left;vertical-align:top}th{background:#f4f4f6;font-weight:800}tr{break-inside:avoid}
code{font-family:Consolas,monospace;font-size:9pt}img{max-width:100%;border:0.6pt solid #cfcfd6;border-radius:3pt;margin:4pt 0}a{color:#1c1c1c}
</style></head><body>${toHtml(md)}</body></html>`;
const htmlPath = out.replace(/\.pdf$/i, '.html');
await fs.mkdir(path.dirname(path.resolve(out)), { recursive: true });
await fs.writeFile(htmlPath, page);

const port = 9549;
const profile = path.resolve(path.dirname(out), '.manual-chrome');
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--disable-background-networking', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--allow-file-access-from-files', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let socket, seq = 0; const pending = new Map();
try {
  let target;
  for (let i = 0; i < 50; i++) { try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); if (target) break; } catch {} await delay(100); }
  assert.ok(target, '브라우저 시작');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => { socket.onopen = r; });
  socket.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result); } };
  const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  await call('Page.enable'); await call('Runtime.enable');
  await call('Page.navigate', { url: pathToFileURL(path.resolve(htmlPath)).href });
  await delay(400);
  const ready = await call('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => [...document.fonts].filter(f => f.status === "loaded").length)', awaitPromise: true, returnByValue: true });
  assert.ok(ready.result.value >= 1, '설명서 글꼴을 하나도 못 읽었다(Pretendard 경로 확인)');
  const imgs = await call('Runtime.evaluate', { expression: 'Promise.all([...document.images].map(i => i.decode().then(() => null, () => i.src)))', awaitPromise: true, returnByValue: true });
  const broken = imgs.result.value.filter(Boolean);
  assert.equal(broken.length, 0, `그림을 못 읽었다: ${broken.join(', ')}`);
  const pdf = await call('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
  await fs.writeFile(out, Buffer.from(pdf.data, 'base64'));
  const pages = (Buffer.from(pdf.data, 'base64').toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  console.log(`${out} · ${pages}쪽 · 글꼴 ${ready.result.value}벌 · 그림 ${imgs.result.value.length}장`);
} finally { try { socket?.close(); } catch {} chrome.kill(); if (fss.existsSync(profile)) await fs.rm(profile, { recursive: true, force: true }).catch(() => {}); }
