// 설치판 사진 자르기(src/desktopCrop.ts — 2026-11-08) 전 · 후를 같은 사진으로 찍고 잰다(창 없는 크롬, 개발 서버의 실제 모듈).
//   전 = 지금까지의 설치판: 사진을 그대로 buildPosters([사진])  ·  후 = cropForPoster(사진) → buildPosters([자른 그림])
// 포스터는 1200×1800 원본 그대로 PNG로 둔다(전 8 + 후 8 — 사진마다). 흐린 «배경 연장»(templates.ts drawPlaced → extendEdges)이
// 칸의 위 · 아래 · 옆을 몇 px 채웠는지도 잰다 — 연장은 filter 'blur(36px) saturate(1.1)'로 그리므로 그 drawImage만 가로챈다(아치 바깥 흐림은 설계라 따로 센다).
// 얼굴 찾기 결과(상자)와 자른 자리도 그림 · 숫자로 남긴다. 서버 · AI 요청 없음(개발 서버의 화면 모듈만 쓴다).
//   node scripts/verify/desktop-crop-probe.mjs <개발 서버 주소> <결과 폴더> <이름=사진=solo|group> ...
// 판정(종료코드 1): 자른 그림이 사진 안이 아님 · 후의 흐린 연장이 전보다 넓어진 디자인이 있음 · 포스터가 8장이 아님.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const [base, outArg, ...specs] = process.argv.slice(2);
if (!base || !outArg || !specs.length) { console.error('쓰는 법: node scripts/verify/desktop-crop-probe.mjs <개발 서버> <결과 폴더> <이름=사진=solo|group> ...'); process.exit(2); }
const out = path.resolve(outArg);
await fs.mkdir(out, { recursive: true });
const delay = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

// 설치판의 기본 입력(아무것도 안 고친 화면) — PosterStudio getMeta와 같은 기본값, 문구는 장르 첫 문구(샘플 흐름과 같다)
const PROBE = (src, mode) => `(async () => {
  const { buildPosters } = await import('/src/poster.ts');
  const { cropForPoster, detectFaces, pickFaces, cropRect } = await import('/src/desktopCrop.ts');
  const { unpackCascade } = await import('/src/vendor/pico.ts');
  const { GENRES } = await import('/src/constants.ts');
  const { DEFAULT_MOVIE_TITLE, DEFAULT_PERSON_NAME } = await import('/src/defaults.ts');
  const meta = { mode: ${JSON.stringify(mode)}, name: DEFAULT_PERSON_NAME, groupName: '우리들', members: '', title: DEFAULT_MOVIE_TITLE, genre: 'sf', tagline: GENRES.sf.taglines[0] };
  const src = ${JSON.stringify(src)};
  const load = async (u) => { const i = new Image(); i.src = u; await i.decode(); return i; };
  const img = await load(src);
  const classify = unpackCascade(new Int8Array(await (await fetch('/src/vendor/facefinder.bin')).arrayBuffer()));
  const t0 = performance.now();
  const all = detectFaces(img, img.naturalWidth, img.naturalHeight, classify);
  const detectMs = Math.round(performance.now() - t0);
  const faces = pickFaces(all, img.naturalHeight, meta.mode);
  const rect = cropRect(img.naturalWidth, img.naturalHeight, faces, meta.mode);
  const cropped = await cropForPoster(src, meta.mode);
  const cimg = await load(cropped);
  // 얼굴 상자(초록 = 쓴 얼굴, 빨강 = 버린 것)와 자른 자리(노랑)
  const ov = document.createElement('canvas'); ov.width = img.naturalWidth; ov.height = img.naturalHeight;
  const ox = ov.getContext('2d'); ox.drawImage(img, 0, 0); ox.lineWidth = 6; ox.font = 'bold 34px sans-serif';
  for (const f of all) { const used = faces.includes(f); ox.strokeStyle = ox.fillStyle = used ? '#10B981' : '#F43F5E'; ox.strokeRect(f.x - f.size / 2, f.y - f.size / 2, f.size, f.size); ox.fillText(String(Math.round(f.score)), f.x - f.size / 2, f.y - f.size / 2 - 8); }
  if (rect) { ox.strokeStyle = '#F59E0B'; ox.lineWidth = 10; ox.strokeRect(rect.x, rect.y, rect.w, rect.h); }

  const P = CanvasRenderingContext2D.prototype, orig = P.drawImage;
  const runOne = async (art) => {
    const log = [];
    P.drawImage = function (im, ...a) {
      const f = this.filter || '';
      if (f.startsWith('blur(36px)')) {
        const d = a.length === 8 ? a.slice(4) : a.length === 4 ? a : [a[0], a[1], im.width, im.height];
        log.push({ cv: this.canvas, ext: f.includes('saturate'), kind: im instanceof HTMLCanvasElement ? im.width + 'x' + im.height : 'art', d: d.map((v) => Math.round(v)) });
      }
      return orig.call(this, im, ...a);
    };
    try {
      const ps = await buildPosters([art], meta);
      return ps.map((p) => {
        const mine = log.filter((e) => e.cv === p.canvas), ext = mine.filter((e) => e.ext), artRect = ext.find((e) => e.kind === 'art');
        let top = 0, bottom = 0, left = 0, right = 0;
        for (const e of ext) {
          const [dx, dy, dw, dh] = e.d;
          if (e.kind === '24x1') { if (artRect && dy < artRect.d[1]) top = Math.max(top, dh - 1); else bottom = Math.max(bottom, dh - 1); }
          if (e.kind === '1x32') { if (artRect && dx < artRect.d[0]) left = Math.max(left, dw - 1); else right = Math.max(right, dw - 1); }
        }
        return { label: p.label, w: p.canvas.width, h: p.canvas.height, ext: ext.length > 0, top, bottom, left, right, archBlur: mine.some((e) => !e.ext), png: p.canvas.toDataURL('image/png') };
      });
    } finally { P.drawImage = orig; }
  };
  const before = await runOne(src), after = await runOne(cropped);
  return { w: img.naturalWidth, h: img.naturalHeight, detectMs, faces: all.map((f) => ({ ...f, used: faces.includes(f) })), rect, croppedSize: [cimg.naturalWidth, cimg.naturalHeight],
    overlay: ov.toDataURL('image/jpeg', 0.9), croppedPng: cropped.startsWith('data:') ? cropped : null, before, after };
})()`;

const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'desktop-crop-'));
const port = 9300 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ['--headless=new', '--no-first-run', '--mute-audio', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const report = [];
let bad = 0;
try {
  let target;
  for (let i = 0; i < 100 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch { /* 아직 */ } if (!target) await delay(100); }
  if (!target) throw new Error('크롬 조종 포트를 열지 못함');
  const ws = new globalThis.WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let seq = 0; const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const call = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expression) => { const m = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (m.result?.exceptionDetails) throw new Error(JSON.stringify(m.result.exceptionDetails).slice(0, 800)); return m.result?.result?.value; };
  await call('Page.enable');
  await call('Page.navigate', { url: base });
  for (let i = 0; i < 150; i++) { if (await evaluate('document.readyState === "complete"').catch(() => false)) break; await delay(100); }
  await delay(1500);
  const save = (file, dataURL) => fs.writeFile(file, Buffer.from(dataURL.split(',')[1], 'base64'));
  for (const spec of specs) {
    const [name, file, mode] = spec.split('=');
    if (!['solo', 'group'].includes(mode)) throw new Error(`모드는 solo · group: ${spec}`);
    const ext = path.extname(file).toLowerCase();
    const src = `data:image/${ext === '.webp' ? 'webp' : ext === '.jpg' || ext === '.jpeg' ? 'jpeg' : 'png'};base64,${(await fs.readFile(file)).toString('base64')}`;
    const r = await evaluate(PROBE(src, mode));
    const tag = `${name}-${mode === 'solo' ? '혼자' : '단체'}`;
    for (const [side, list] of [['전', r.before], ['후', r.after]]) {
      const dir = path.join(out, `${side}-${tag}`);
      await fs.mkdir(dir, { recursive: true });
      for (const [i, p] of list.entries()) await save(path.join(dir, `${String(i + 1).padStart(2, '0')}-${p.label.replace(/\s+/g, '')}.png`), p.png);
    }
    const cdir = path.join(out, '자른자리');
    await fs.mkdir(cdir, { recursive: true });
    await save(path.join(cdir, `${tag}-얼굴과-자른자리.jpg`), r.overlay);
    if (r.croppedPng) await save(path.join(cdir, `${tag}-자른그림.png`), r.croppedPng);
    const rows = r.before.map((b, i) => {
      const a = r.after[i];
      const gap = (p) => (p.ext ? p.top + p.bottom + p.left + p.right : 0);
      return { design: b.label, before: { ext: b.ext, top: b.top, bottom: b.bottom, left: b.left, right: b.right }, after: { ext: a.ext, top: a.top, bottom: a.bottom, left: a.left, right: a.right }, wider: gap(a) > gap(b), archBlur: b.archBlur };
    });
    const inside = !r.rect || (r.rect.x >= 0 && r.rect.y >= 0 && r.rect.x + r.rect.w <= r.w && r.rect.y + r.rect.h <= r.h);
    const problems = [];
    if (!inside) problems.push('자른 자리가 사진 밖');
    if (r.before.length !== 8 || r.after.length !== 8) problems.push(`포스터 수 전 ${r.before.length} · 후 ${r.after.length}`);
    for (const row of rows) if (row.wider) problems.push(`${row.design}: 흐린 연장이 넓어짐`);
    if (problems.length) bad++;
    report.push({ name, mode, file, photo: [r.w, r.h], detectMs: r.detectMs, faces: r.faces.map((f) => ({ x: Math.round(f.x), y: Math.round(f.y), size: Math.round(f.size), score: Math.round(f.score), used: f.used })), rect: r.rect, croppedSize: r.croppedSize, rows, problems });
    const ext1 = (side) => rows.filter((x) => x[side].ext).length;
    console.log(`${tag}: 사진 ${r.w}×${r.h} · 얼굴 ${r.faces.filter((f) => f.used).length}개 쓰고 ${r.faces.length - r.faces.filter((f) => f.used).length}개 버림(${r.detectMs}ms) · 자른 자리 ${r.rect ? `${r.rect.x},${r.rect.y} ${r.rect.w}×${r.rect.h}` : '없음(그대로)'}`);
    console.log(`  흐린 연장이 있는 디자인: 전 ${ext1('before')}/8 → 후 ${ext1('after')}/8${problems.length ? ' · ✗ ' + problems.join(' · ') : ''}`);
    for (const row of rows) {
      const s = (p) => (p.ext ? `위 ${p.top} 아래 ${p.bottom} 옆 ${p.left}/${p.right}` : '꽉 채움');
      console.log(`    ${row.design.padEnd(10)} 전 ${s(row.before).padEnd(26)} 후 ${s(row.after)}${row.archBlur ? ' (아치 바깥 흐림 — 설계)' : ''}`);
    }
  }
  ws.close();
} finally { chrome.kill(); await delay(300); await fs.rm(profile, { recursive: true, force: true }).catch(() => {}); }
await fs.writeFile(path.join(out, '측정.json'), JSON.stringify(report, null, 1));
if (bad) { console.error(`✗ 걸림 ${bad}건 — ${path.join(out, '측정.json')}`); process.exit(1); }
console.log(`통과 — ${path.join(out, '측정.json')}`);
