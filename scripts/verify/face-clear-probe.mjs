// 포스터 8종에서 얼굴(머리 상자 = 정수리 · 양옆 · 턱)이 칸 밖으로 잘리거나 글자(제목 · 문구 · 크레딧 · 바코드 · 로고)에 가리는지 잰다
// (2026-11-08 Bumm님 «사람 얼굴을 좀 내려야지» · «남자애들 안 잘리게» · «필름스트립 얼굴 사이드 안 날아가게», 팀장 전달).
// 창 없는 크롬 + 개발 서버의 실제 모듈(templates.ts · desktopCrop.ts). 서버 · AI 요청 없음.
//   node scripts/verify/face-clear-probe.mjs <개발 서버> <결과 폴더> [--vis-only] <이름=그림=solo|group=web|desktop[=장르]> ...
//     web     = 그림을 그대로 넣는다(AI 결과 · 샘플)   desktop = 설치판처럼 cropForPoster(사진)로 자른 뒤 넣는다
// 재는 법: 얼굴은 넣는 그림에서 pico로 찾는다(설치판과 같은 찾기). 그림이 포스터 어디에 그려지는지는 drawImage를 가로채 변환을 따라간다
// (그림 → 중간 캔버스 → 포스터, 흐림 층은 뺀다). 실제로 보이는지는 그림 대신 체크무늬 두 장(서로 뒤집은 것 — 평균 색이 같아 디자인 색 뽑기가 같다)을
// 넣어 그린 두 포스터의 차이로 본다: 차이가 큰 화소 = 그림이 보이는 곳(칸 밖 · 글자 · 로고 · 짙은 어둠 · 흐림은 0).
// 글자 · 로고 자리는 fillText · drawImage를 가로채 상자로 남긴다(무엇에 가렸는지 이름 붙이기).
// 판정(종료코드 1): 머리 상자의 위 · 옆 · 아래 띠가 2% 넘게 안 보임, 또는 머리 상자가 제목 · 문구 · 크레딧 · 바코드 · 로고 상자와 겹침,
// 또는 샘플 단체의 얼굴 범위가 src/sampleSubject.ts 값과 0.01 넘게 다름. 마지막 «걸림 N건»은 그림 단위(얼굴을 못 찾은 그림 포함)다.
// ⚠ 얼굴 찾기는 간판 · 덤불 · 가로등 · 외투를 얼굴로 잡기도 한다(11/8 실측) — 걸린 줄은 표시 그림(-표시.jpg)을 보고 가른다.
// 틀마다 배치가 다르다: 얼굴을 지키는 다섯 종(시네마 · 에디토리얼 · 컬러 블록 · 필름스트립 · 트립틱)과 덮어 채우는 세 종(아치 · 폴라로이드 · 타이포그래피) — app.md «섞기».
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const visOnly = args.includes('--vis-only');   // 포스터 PNG는 남기지 않고 표시 그림(jpg)만 — 많이 잴 때
const [base, outArg, ...specs] = args.filter((a) => a !== '--vis-only');
if (!base || !outArg || !specs.length) { console.error('쓰는 법: node scripts/verify/face-clear-probe.mjs <개발 서버> <결과 폴더> <이름=그림=solo|group=web|desktop[=장르]> ...'); process.exit(2); }
const out = path.resolve(outArg);
await fs.mkdir(out, { recursive: true });
const delay = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const PROBE = (src, mode, pathKind, genre, sampleGroup) => `(async () => {
  const { TEMPLATES } = await import('/src/templates.ts');
  const { preparePosterAssets } = await import('/src/poster.ts');
  const { cropForPoster, detectFaces, pickFaces, subjectOf } = await import('/src/desktopCrop.ts');
  const { SAMPLE_GROUP_SUBJECT } = await import('/src/sampleSubject.ts');
  const { unpackCascade } = await import('/src/vendor/pico.ts');
  const { GENRES } = await import('/src/constants.ts');
  const { DEFAULT_MOVIE_TITLE, DEFAULT_PERSON_NAME } = await import('/src/defaults.ts');
  const genre = ${JSON.stringify(genre)} in GENRES ? ${JSON.stringify(genre)} : 'sf';
  const meta = { mode: ${JSON.stringify(mode)}, name: DEFAULT_PERSON_NAME, groupName: '우리들', members: '', title: DEFAULT_MOVIE_TITLE, genre, tagline: GENRES[genre].taglines[0] };
  await preparePosterAssets(meta);
  const load = async (u) => { const i = new Image(); i.src = u; await i.decode(); return i; };
  // 앱과 같게: 설치판은 자르기가 준 얼굴 범위, 샘플 단체는 sampleSubject.ts의 값을 Meta.subject로 넘긴다
  const sampleGroup = ${JSON.stringify(!!sampleGroup)};
  const put = ${JSON.stringify(pathKind)} === 'desktop' ? await cropForPoster(${JSON.stringify(src)}, meta.mode) : { url: ${JSON.stringify(src)}, subject: sampleGroup ? SAMPLE_GROUP_SUBJECT : undefined };
  meta.subject = put.subject;
  const artURL = put.url;
  const art = await load(artURL);
  const AW = art.naturalWidth, AH = art.naturalHeight;
  const classify = unpackCascade(new Int8Array(await (await fetch('/src/vendor/facefinder.bin')).arrayBuffer()));
  const faces = pickFaces(detectFaces(art, AW, AH, classify), AH, meta.mode);
  // 머리 상자(그림 좌표): 정수리 = 얼굴 가운데 위 0.8배(desktopCrop HEAD_ABOVE와 같다), 턱 = 아래 0.6배, 양옆 = ±0.6배(귀 · 머리카락)
  const heads = faces.map((f) => ({ x0: f.x - 0.6 * f.size, x1: f.x + 0.6 * f.size, y0: f.y - 0.8 * f.size, y1: f.y + 0.6 * f.size }));
  // 샘플 단체: 그림에서 다시 잰 얼굴 범위와 sampleSubject.ts 값의 가장 큰 차이(그림을 바꾸고 값을 안 바꾸면 걸린다)
  const measured = sampleGroup ? subjectOf(faces, { x: 0, y: 0, w: AW, h: AH }, 'group') : null;
  const subjectDiff = measured ? Math.max(...['x0', 'y0', 'x1', 'y1'].map((k) => Math.abs(measured[k] - SAMPLE_GROUP_SUBJECT[k]))) : sampleGroup ? 1 : null;
  const checker = async (inv) => {
    const cv = document.createElement('canvas'); cv.width = AW; cv.height = AH; const x = cv.getContext('2d');
    const q = 16; for (let y = 0; y < AH; y += q) for (let xx = 0; xx < AW; xx += q) { x.fillStyle = (((xx + y) / q) & 1) ^ inv ? '#c0c0c0' : '#404040'; x.fillRect(xx, y, q, q); }
    return load(cv.toDataURL('image/png'));
  };
  const chA = await checker(0), chB = await checker(1);
  const P = CanvasRenderingContext2D.prototype, oDraw = P.drawImage, oText = P.fillText;
  // 변환: [a,b,c,d,e,f] — 그림 좌표 → 캔버스 좌표
  const mul = (m, n) => [m[0]*n[0]+m[2]*n[1], m[1]*n[0]+m[3]*n[1], m[0]*n[2]+m[2]*n[3], m[1]*n[2]+m[3]*n[3], m[0]*n[4]+m[2]*n[5]+m[4], m[1]*n[4]+m[3]*n[5]+m[5]];
  const ap = (m, x, y) => [m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5]];
  const render = (t, im) => {
    const maps = new Map(), boxes = [];   // 캔버스 → 그림 좌표에서 오는 변환들
    const isArt = (s) => s === im;
    P.drawImage = function (s, ...a) {
      const blur = (this.filter || '').includes('blur');
      let sx = 0, sy = 0, sw = s.width, sh = s.height, dx, dy, dw, dh;
      if (a.length === 2) { [dx, dy] = a; dw = sw; dh = sh; } else if (a.length === 4) { [dx, dy, dw, dh] = a; } else { [sx, sy, sw, sh, dx, dy, dw, dh] = a; }
      const T = this.getTransform(), tm = [T.a, T.b, T.c, T.d, T.e, T.f];
      const local = [dw / sw, 0, 0, dh / sh, dx - sx * dw / sw, dy - sy * dh / sh];
      const srcMaps = isArt(s) ? [[1, 0, 0, 1, 0, 0]] : maps.get(s);
      if (srcMaps) {
        if (blur && im !== art) return;   // 흐림 층은 «보이는 그림»이 아니다 — 체크무늬 그림에서 빼 차이 0
        if (!blur) { const list = maps.get(this.canvas) || []; for (const m of srcMaps) list.push(mul(mul(tm, local), m)); maps.set(this.canvas, list); }
      } else if (s instanceof HTMLImageElement || s instanceof HTMLCanvasElement) {
        const c = [[dx, dy], [dx + dw, dy], [dx, dy + dh], [dx + dw, dy + dh]].map(([x, y]) => [T.a*x + T.c*y + T.e, T.b*x + T.d*y + T.f]);
        if (!blur && dw * dh > 400) boxes.push({ kind: '로고', text: '', x0: Math.min(...c.map((p) => p[0])), y0: Math.min(...c.map((p) => p[1])), x1: Math.max(...c.map((p) => p[0])), y1: Math.max(...c.map((p) => p[1])), cv: this.canvas });
      }
      return oDraw.call(this, s, ...a);
    };
    P.fillText = function (str, x, y, ...rest) {
      const mt = this.measureText(str), T = this.getTransform();
      const al = this.textAlign, w = mt.width;
      const lx = al === 'center' ? x - w / 2 : al === 'right' || al === 'end' ? x - w : x;
      const c = [[lx, y - mt.actualBoundingBoxAscent], [lx + w, y - mt.actualBoundingBoxAscent], [lx, y + mt.actualBoundingBoxDescent], [lx + w, y + mt.actualBoundingBoxDescent]].map(([px, py]) => [T.a*px + T.c*py + T.e, T.b*px + T.d*py + T.f]);
      boxes.push({ kind: '', text: String(str), x0: Math.min(...c.map((p) => p[0])), y0: Math.min(...c.map((p) => p[1])), x1: Math.max(...c.map((p) => p[0])), y1: Math.max(...c.map((p) => p[1])), cv: this.canvas });
      return oText.call(this, str, x, y, ...rest);
    };
    try {
      const cv = document.createElement('canvas'); cv.width = 1200; cv.height = 1800;
      t.render(cv.getContext('2d'), im, meta, GENRES[meta.genre]);
      return { cv, maps: maps.get(cv) || [], boxes: boxes.filter((b) => b.cv === cv) };
    } finally { P.drawImage = oDraw; P.fillText = oText; }
  };
  const titleWords = meta.title.split(/\\s+/);
  const kindOf = (b) => {
    if (b.kind) return b.kind;
    if (/^[0-9]$/.test(b.text) || b.text.startsWith('ISBN')) return '바코드';
    if (b.text === meta.tagline || meta.tagline.includes(b.text)) return '문구';
    if (b.text === meta.title || titleWords.some((w) => b.text.includes(w)) || meta.title.includes(b.text)) return '제목';
    return '글자';
  };
  const results = [];
  for (const t of TEMPLATES) {
    const real = render(t, art), A = render(t, chA), B = render(t, chB);
    const da = A.cv.getContext('2d').getImageData(0, 0, 1200, 1800).data, db = B.cv.getContext('2d').getImageData(0, 0, 1200, 1800).data;
    // 그림이 보이는 화소: 두 체크무늬 포스터의 차이가 30 넘음(로고 줄의 옅은 어둠 · 문구 뒤 어둠은 보이는 것으로 친다).
    // 6px 안에 보이는 화소가 있으면 보인다 — 트립틱 칸 사이 선처럼 얇은 선은 얼굴을 «자르지» 않는다.
    const vis1 = (x, y) => { if (x < 0 || y < 0 || x >= 1200 || y >= 1800) return false; const i = (y * 1200 + x) * 4; return Math.abs(da[i] - db[i]) + Math.abs(da[i+1] - db[i+1]) + Math.abs(da[i+2] - db[i+2]) > 30; };
    const shownAt = (x, y) => { x = Math.round(x); y = Math.round(y); return vis1(x, y) || vis1(x - 6, y) || vis1(x + 6, y) || vis1(x, y - 6) || vis1(x, y + 6); };
    const boxes = real.boxes.map((b) => ({ ...b, kind: kindOf(b) }));
    const N = 24;
    const per = heads.map((h, k) => {
      let shown = 0, top = 0, topN = 0, side = 0, sideN = 0, chin = 0, chinN = 0;
      const hit = {}; const pts = [];
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const u = (i + 0.5) / N, v = (j + 0.5) / N, ax = h.x0 + u * (h.x1 - h.x0), ay = h.y0 + v * (h.y1 - h.y0);
        let at = null; for (const m of A.maps) { const p = ap(m, ax, ay); if (shownAt(p[0], p[1])) { at = p; break; } }
        const p = at || (A.maps[0] ? ap(A.maps[0], ax, ay) : null);
        // 글자 · 로고 상자 안이면 «겹침»으로 세고, 그 밖에서 안 보이면 «잘림»(칸 밖 · 흐림 · 짙은 어둠)
        let under = null;
        if (p) for (const b of boxes) if (p[0] >= b.x0 && p[0] <= b.x1 && p[1] >= b.y0 && p[1] <= b.y1) { hit[b.kind] = (hit[b.kind] || 0) + 1; under = under || b.kind; }
        const ok = !!at || !!under; if (ok) shown++;
        if (v < 0.2) { topN++; if (ok) top++; } if (u < 0.12 || u > 0.88) { sideN++; if (ok) side++; } if (v > 0.85) { chinN++; if (ok) chin++; }
        pts.push({ p, ok: !!at && !under, cut: !ok });
      }
      const corner = A.maps[0] ? [ap(A.maps[0], h.x0, h.y0), ap(A.maps[0], h.x1, h.y1)] : null;
      return { face: k, shown: shown / (N*N), top: top / topN, side: side / sideN, chin: chin / chinN, hit: Object.fromEntries(Object.entries(hit).map(([k2, v]) => [k2, v / (N*N)])), corner, pts };
    });
    // 표시 그림: 실제 포스터 위에 머리 상자(초록 = 다 보임, 빨강 점 = 안 보이는 곳)와 글자 상자(하늘)
    const vis = document.createElement('canvas'); vis.width = 1200; vis.height = 1800; const vx = vis.getContext('2d');
    oDraw.call(vx, real.cv, 0, 0);
    vx.lineWidth = 2; vx.strokeStyle = 'rgba(14,165,233,.9)'; for (const b of boxes) vx.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    for (const f of per) {
      const bad = f.top < 0.98 || f.side < 0.98 || f.chin < 0.98 || Object.keys(f.hit).length;
      for (const q of f.pts) if (q.p && !q.ok) { vx.fillStyle = q.cut ? '#F43F5E' : '#F59E0B'; vx.fillRect(q.p[0] - 3, q.p[1] - 3, 6, 6); }
      if (f.corner) { vx.lineWidth = 5; vx.strokeStyle = bad ? '#F43F5E' : '#10B981'; vx.strokeRect(f.corner[0][0], f.corner[0][1], f.corner[1][0] - f.corner[0][0], f.corner[1][1] - f.corner[0][1]); }
    }
    results.push({ label: t.label, faces: per.map(({ pts, ...r }) => r), png: real.cv.toDataURL('image/png'), vis: vis.toDataURL('image/jpeg', 0.88) });
  }
  return { art: [AW, AH], artURL: artURL.startsWith('data:') && ${JSON.stringify(pathKind)} === 'desktop' ? artURL : null, faces: faces.map((f) => ({ x: Math.round(f.x), y: Math.round(f.y), size: Math.round(f.size) })), results, subjectDiff };
})()`;

const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'face-clear-'));
const port = 9300 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ['--headless=new', '--no-first-run', '--mute-audio', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const report = [];
let bad = 0;
const pct = (v) => `${Math.round(v * 100)}%`;
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
    const [name, file, mode, kind, genre = 'sf'] = spec.split('=');
    if (!['solo', 'group'].includes(mode) || !['web', 'desktop'].includes(kind)) throw new Error(`모드는 solo · group, 경로는 web · desktop: ${spec}`);
    const ext = path.extname(file).toLowerCase();
    const src = `data:image/${ext === '.webp' ? 'webp' : ext === '.jpg' || ext === '.jpeg' ? 'jpeg' : 'png'};base64,${(await fs.readFile(file)).toString('base64')}`;
    const sampleGroup = mode === 'group' && kind === 'web' && path.basename(file) === 'sample-group.webp';
    const r = await evaluate(PROBE(src, mode, kind, genre, sampleGroup));
    const tag = `${name}-${mode === 'solo' ? '혼자' : '단체'}-${kind === 'web' ? '웹' : '설치판'}`;
    const dir = path.join(out, tag);
    await fs.mkdir(dir, { recursive: true });
    if (r.artURL) await save(path.join(dir, '00-넣은그림.png'), r.artURL);
    const rows = [];
    for (const [i, p] of r.results.entries()) {
      const n = `${String(i + 1).padStart(2, '0')}-${p.label.replace(/\s+/g, '')}`;
      if (!visOnly) await save(path.join(dir, `${n}.png`), p.png);
      await save(path.join(dir, `${n}-표시.jpg`), p.vis);
      const issues = [];
      for (const f of p.faces) {
        const cut = [];
        if (f.top < 0.98) cut.push(`정수리 ${pct(1 - f.top)}`);
        if (f.side < 0.98) cut.push(`옆 ${pct(1 - f.side)}`);
        if (f.chin < 0.98) cut.push(`턱 ${pct(1 - f.chin)}`);
        const hit = Object.entries(f.hit).map(([k, v]) => `${k} ${pct(v)}`);
        if (cut.length || hit.length) issues.push(`얼굴${f.face + 1}: ${[...cut.map((c) => c + ' 잘림'), ...hit.map((h) => h + ' 겹침')].join(' · ')}`);
      }
      rows.push({ design: p.label, faces: p.faces, issues });
    }
    const nIssue = rows.filter((x) => x.issues.length).length;
    const subjectOff = r.subjectDiff !== null && r.subjectDiff > 0.01;
    if (!r.faces.length || nIssue || subjectOff) bad++;
    if (subjectOff) console.log(`    ✗ 샘플 단체 얼굴 범위가 src/sampleSubject.ts 값과 ${r.subjectDiff.toFixed(3)} 다르다(0.01 이하여야 함) — 그림을 바꿨으면 값도 다시 잰다`);
    report.push({ name, file, mode, kind, genre, art: r.art, faces: r.faces, rows });
    console.log(`${tag}: 그림 ${r.art[0]}×${r.art[1]} · 얼굴 ${r.faces.length}개 · 걸린 디자인 ${nIssue}/8${r.faces.length ? '' : ' · ✗ 얼굴을 못 찾음'}`);
    for (const row of rows) if (row.issues.length) console.log(`    ${row.design.padEnd(8)} ${row.issues.join(' / ')}`);
  }
  ws.close();
} finally { chrome.kill(); await delay(300); await fs.rm(profile, { recursive: true, force: true }).catch(() => {}); }
await fs.writeFile(path.join(out, '측정.json'), JSON.stringify(report, null, 1));
if (bad) { console.error(`✗ 걸림 ${bad}건 — ${path.join(out, '측정.json')}`); process.exit(1); }
console.log(`통과 — ${path.join(out, '측정.json')}`);
