#!/usr/bin/env node
/* 포스터 «두 번째 얼굴» 검사(2026-10-23 Bumm님 «포스터 사진 위쪽에 크게 흐린 얼굴이 하나 더 보인다», 팀장 전달).

     node scripts/verify/poster-art-fill.mjs <개발 서버 주소> <결과 폴더> [--arts 그림1.png,그림2.png] [--max 600]

   개발 서버(Vite)의 /src/poster.ts buildPosters로 8종을 실제로 그린다 — 화면 · 휴대폰 · 인쇄가 모두 이 1200×1800 캔버스를 쓴다.
   ① 판정: 청록 바탕에 빨간 원(얼굴 자리 — 주인공 상자 안, 그림 높이 25%, 단체는 왼쪽 · 가운데 · 오른쪽 셋)을 둔 시험 그림과, 원이 없는 같은 그림으로 디자인마다 두 번 그린다.
      선명한 그림의 자리(원 위 · 아래의 작은 파란 표지 — 흐린 사본에서는 번져 사라진다)로 원의 자리 · 크기를 찾고, 그 원을 90px 넓힌 바깥의
      «빨간 기운» 화소 수에서 원 없는 그림의 수를 뺀다 = 흐린 사본이 비친 넓이. 표지를 못 찾으면 실패로 센다.
      배경 연장이 같은 그림을 크게 키워 흐리게 깔면 그 안의 원(얼굴)이 바깥에 크고 흐리게 비친다. 디자인마다 혼자 · 단체, 세로 2:3 · 가로 3:2 그림.
      --max(기본 600px)를 넘는 디자인이 하나라도 있으면 종료코드 1.
   ② 사람이 볼 그림: --arts로 준 사진마다 혼자 · 단체 8종을 «사진-갈래/NN-이름.png»(1200×1800, 인쇄와 같은 화소)로 남긴다. */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const [base, outArg] = args.filter((a, i) => !a.startsWith('--') && !['--arts', '--max'].includes(args[i - 1]));
if (!base || !outArg) { console.error('사용법: node scripts/verify/poster-art-fill.mjs <개발 서버 주소> <결과 폴더> [--arts a.png,b.png] [--max 600]'); process.exit(2); }
const out = path.resolve(outArg);
const MAX = Number(opt('--max', 600));
const arts = (opt('--arts', '') || '').split(',').filter(Boolean);
await fs.mkdir(out, { recursive: true });
const delay = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));

const META = {
  solo: { mode: 'solo', name: '김인키', groupName: '', members: '', title: '별을 찾는 아이', genre: 'sf', tagline: '우주 너머, 미지의 세계로' },
  group: { mode: 'group', name: '', groupName: '인키 반', members: '김인키 · 이하나 · 박두리', title: '별을 찾는 아이', genre: 'sf', tagline: '우주 너머, 미지의 세계로' },
};
// 페이지 안: 시험 그림(원 있음 · 없음) → 8종 → 바깥 빨간 기운 차이
const MEASURE = (w, h, meta) => `(async () => {
  const { buildPosters } = await import('/src/poster.ts');
  // 선명한 그림의 자리는 원 위 · 아래의 작은 초록 표지 둘로 찾는다 — 흐린 사본에서는 표지가 번져 진한 초록이 남지 않는다.
  // 파랑으로 했더니 트립틱의 파란 칸이 표지로 읽혀 원의 자리를 놓쳤다(10/23) — 디자인에 없는 순한 초록을 쓴다.
  // (빨간 원 자체로 찾으면 흐린 사본의 원 가운데도 진한 빨강이라 둘이 한 덩어리로 잡혀 사본이 안 보였다 — 처음 판이 그랬다)
  const m = Math.min(${w}, ${h}), R = m * 0.11, cy = ${h} * 0.25, dy = m * 0.18;
  // 단체는 얼굴 셋(왼쪽 · 가운데 · 오른쪽) — 얼굴이 가장자리 가까이 있을 때 바깥 흐림 층(아치 바깥 등)에 비치는지도 본다
  const offs = ${JSON.stringify(meta.mode)} === 'group' ? [-0.3, 0, 0.3] : [0];
  const art = (disk) => { const c = document.createElement('canvas'); c.width = ${w}; c.height = ${h}; const x = c.getContext('2d');
    // 바탕은 청록 — 회색이면 빨간 원이 그림의 주된 색이 되어, 그림 색으로 포스터 색을 정하는 디자인(컬러 블록 · 아치)의 색이 통째로 바뀌었다
    x.fillStyle = '#2a8a8a'; x.fillRect(0, 0, ${w}, ${h});
    if (disk) { x.fillStyle = '#e01010'; for (const o of offs) { x.beginPath(); x.arc(${w} / 2 + o * ${w}, cy, R, 0, Math.PI * 2); x.fill(); } }
    x.fillStyle = '#00ff00'; for (const y of [cy - dy, cy + dy]) x.fillRect(${w} / 2 - 6, y - 6, 12, 12);
    return c.toDataURL('image/png'); };
  const meta = ${JSON.stringify(meta)};
  const withDisk = await buildPosters([art(true)], meta), without = await buildPosters([art(false)], meta);
  const red = (d, i) => d[i] - Math.max(d[i + 1], d[i + 2]);
  return withDisk.map((p, k) => {
    const W = p.canvas.width, H = p.canvas.height;
    const a = p.canvas.getContext('2d').getImageData(0, 0, W, H).data, b = without[k].canvas.getContext('2d').getImageData(0, 0, W, H).data;
    const marks = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (a[i + 1] > 120 && a[i + 1] - Math.max(a[i], a[i + 2]) > 90) marks.push([x, y]); }
    if (!marks.length || marks.length > 2000) return { label: p.label, png: p.canvas.toDataURL('image/png'), ghost: -1, note: marks.length ? '표지가 너무 큼 ' + marks.length : '표지 없음' };
    const top = marks.filter(([, y]) => y <= marks[0][1] + 40), bot = marks.filter(([, y]) => y > marks[0][1] + 40);
    const mid = (s) => [s.reduce((t, [x]) => t + x, 0) / s.length, s.reduce((t, [, y]) => t + y, 0) / s.length];
    if (!bot.length) return { label: p.label, png: p.canvas.toDataURL('image/png'), ghost: -1, note: '표지 하나뿐' };
    const [tx, ty] = mid(top), [bx, by] = mid(bot), scale = Math.hypot(bx - tx, by - ty) / (2 * dy);
    const ox = (tx + bx) / 2, oy = (ty + by) / 2, keep = R * scale + 90;
    let n = 0, gx0 = W, gy0 = H, gx1 = -1, gy1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (offs.some((o) => Math.hypot(x - (ox + o * ${w} * scale), y - oy) <= keep)) continue;
      const i = (y * W + x) * 4; if (red(a, i) > 18 && red(a, i) - red(b, i) > 12) { n++; gx0 = Math.min(gx0, x); gy0 = Math.min(gy0, y); gx1 = Math.max(gx1, x); gy1 = Math.max(gy1, y); }
    }
    return { label: p.label, ghost: n, scale: +scale.toFixed(3), where: n ? [gx0, gy0, gx1, gy1] : null, png: p.canvas.toDataURL('image/png') };
  });
})()`;
const RENDER = (dataURL, meta) => `(async () => {
  const { buildPosters } = await import('/src/poster.ts');
  const ps = await buildPosters([${JSON.stringify(dataURL)}], ${JSON.stringify(meta)});
  return ps.map((p) => ({ label: p.label, png: p.canvas.toDataURL('image/png') }));
})()`;

const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'art-fill-'));
const port = 9761;
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let bad = 0;
try {
  let target;
  for (let i = 0; i < 80 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch { /* 아직 */ } if (!target) await delay(100); }
  if (!target) throw new Error('크롬에 붙지 못했다');
  const ws = new globalThis.WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let seq = 0; const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const call = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expression) => { const m = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (m.result?.exceptionDetails) throw new Error(JSON.stringify(m.result.exceptionDetails).slice(0, 400)); return m.result?.result?.value; };
  await call('Page.enable');
  await call('Page.navigate', { url: base });
  for (let i = 0; i < 150; i++) { if (await evaluate('document.readyState === "complete"').catch(() => false)) break; await delay(100); }
  await delay(1500);

  const rows = [];
  for (const [shape, w, h] of [['세로2x3', 1024, 1536], ['가로3x2', 1536, 1024]]) {
    for (const [mode, meta] of Object.entries(META)) {
      const r = await evaluate(MEASURE(w, h, meta));
      // 시험 그림 렌더도 남긴다 — 표가 무엇을 셌는지 사람이 눈으로 확인한다
      const dir = path.join(out, `시험그림-${shape}-${mode === 'solo' ? '혼자' : '단체'}`);
      await fs.mkdir(dir, { recursive: true });
      for (const [i, x] of r.entries()) {
        await fs.writeFile(path.join(dir, `${String(i + 1).padStart(2, '0')}-${x.label.replace(/\s+/g, '')}.png`), Buffer.from(x.png.split(',')[1], 'base64'));
        delete x.png; rows.push({ shape, mode, ...x }); if (x.ghost > MAX || x.ghost < 0) bad++;
      }
    }
  }
  const labels = [...new Set(rows.map((r) => r.label))];
  const cols = [...new Set(rows.map((r) => `${r.shape} ${r.mode}`))];
  const table = ['| 디자인 | ' + cols.join(' | ') + ' |', '|---|' + cols.map(() => '---|').join('')];
  for (const l of labels) table.push(`| ${l} | ` + cols.map((c) => { const r = rows.find((x) => x.label === l && `${x.shape} ${x.mode}` === c); return r.ghost < 0 ? `❓ ${r.note}` : (r.ghost > MAX ? '🔴 ' : '🟢 ') + r.ghost; }).join(' | ') + ' |');
  const where = rows.filter((r) => r.ghost > MAX).map((r) => `- ${r.label} · ${r.shape} ${r.mode}: ${r.ghost}px, 자리 x ${r.where[0]}~${r.where[2]} · y ${r.where[1]}~${r.where[3]}`);
  table.push('', ...where);
  console.log(table.join('\n'));
  await fs.writeFile(path.join(out, 'ghost.md'), `흐린 사본이 비친 넓이(px, 선명한 원 밖 빨간 기운 — 원 없는 그림과의 차이). 기준 ${MAX}px 이하.\n\n` + table.join('\n') + '\n');

  for (const file of arts) {
    const name = path.basename(file).replace(/\.[^.]+$/, '');
    const dataURL = `data:image/png;base64,${(await fs.readFile(file)).toString('base64')}`;
    for (const [mode, meta] of Object.entries(META)) {
      const dir = path.join(out, `${name}-${mode === 'solo' ? '혼자' : '단체'}`);
      await fs.mkdir(dir, { recursive: true });
      const ps = await evaluate(RENDER(dataURL, meta));
      for (const [i, p] of ps.entries()) await fs.writeFile(path.join(dir, `${String(i + 1).padStart(2, '0')}-${p.label.replace(/\s+/g, '')}.png`), Buffer.from(p.png.split(',')[1], 'base64'));
      console.log(`${dir}: ${ps.length}장`);
    }
  }
  ws.close();
} finally { chrome.kill(); await delay(300); await fs.rm(profile, { recursive: true, force: true }).catch(() => {}); }
console.log(bad ? `❌ 두 번째 얼굴이 비치는 조합 ${bad}개(기준 ${MAX}px)` : `✅ 두 번째 얼굴 없음(기준 ${MAX}px)`);
process.exit(bad ? 1 : 0);
