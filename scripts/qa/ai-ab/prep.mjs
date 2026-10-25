// AI 품질 A/B 시험 — 사진 파일을 «웹캠이 찍은 프레임»처럼 앱의 촬영 경로에 넣는다(QA 전용, 앱 화면 · 배포물과 무관).
//
//   node scripts/qa/ai-ab/prep.mjs <manifest.json> <출력 폴더>
//
// 앱(src/PosterStudio.tsx 촬영)과 같은 순서를 헤드리스 크롬 캔버스로 재현한다:
//   ① 웹캠 프레임 1280×960(getUserMedia 요청값, 4:3) — 사진에서 manifest의 crop(정규화 x · y · w · h, 4:3)을 잘라 그린다
//   ② 앱 캡처: 가로 1024 이하로 줄이고(1024×768) 좌우 반전(거울 모드) → JPEG 품질 0.85  →  <id>.jpg   (A · B · D가 쓰는 «현재 입력»)
//   ③ 후보 전처리(C): 같은 캡처에 preprocess.js(장면 전체가 어두울 때만 밝기 보정, JPEG 0.92) → <id>-pre.jpg
// 원본과 결과 모두 같은 캡처 단계를 거치므로 A/B가 공정하다. 출력 폴더에 prep.json(크기 · 밝기 통계 · 보정 여부)을 쓴다.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [manifestPath, outDir] = process.argv.slice(2);
if (!manifestPath || !outDir) {
  console.error('사용: node scripts/qa/ai-ab/prep.mjs <manifest.json> <출력 폴더>');
  process.exit(1);
}
const here = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const photoDir = path.resolve(path.dirname(manifestPath), manifest.photoDir || '.');
await fs.mkdir(outDir, { recursive: true });
const preprocessSrc = await fs.readFile(path.join(here, 'preprocess.js'), 'utf8');
const delay = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aiq-prep-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--mute-audio', '--allow-file-access-from-files', '--remote-debugging-port=0', `--user-data-dir=${dir}`, 'about:blank'], { stdio: 'ignore' });
let port; for (let i = 0; i < 100 && !port; i++) { try { port = (await fs.readFile(path.join(dir, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; } catch { await delay(100); } }
let t; for (let i = 0; i < 50 && !t; i++) { try { t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === 'page'); } catch {} if (!t) await delay(100); }
const ws = new globalThis.WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => { ws.onopen = r; });
let seq = 0; const pend = new Map(); ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const call = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expression) => {
  const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400));
  return r.result?.result?.value;
};
await call('Page.navigate', { url: 'file:///' + path.resolve(photoDir).replace(/\\/g, '/') + '/' });
await delay(500);
await ev(preprocessSrc + '\n;true');

const results = [];
try {
  for (const p of manifest.photos) {
    const src = 'file:///' + path.join(photoDir, p.file).replace(/\\/g, '/');
    const crop = p.crop || null;
    const r = await ev(`(async () => {
      const img = new Image(); img.src = ${JSON.stringify(src)}; await img.decode();
      const W = img.naturalWidth, H = img.naturalHeight;
      // ① 웹캠 프레임(1280×960): crop이 없으면 4:3 가운데 자르기
      let c = ${JSON.stringify(crop)};
      if (!c) { const a = 4 / 3; if (W / H > a) { const w = H * a / W; c = { x: (1 - w) / 2, y: 0, w, h: 1 }; } else { const h = W / a / H; c = { x: 0, y: (1 - h) / 2, w: 1, h }; } }
      const frame = document.createElement('canvas'); frame.width = 1280; frame.height = 960;
      frame.getContext('2d').drawImage(img, c.x * W, c.y * H, c.w * W, c.h * H, 0, 0, 1280, 960);
      // ② 앱 캡처 — src/PosterStudio.tsx와 같은 연산
      const MAXW = 1024, scale = Math.min(1, MAXW / frame.width);
      const cap = document.createElement('canvas'); cap.width = Math.round(frame.width * scale); cap.height = Math.round(frame.height * scale);
      const g = cap.getContext('2d'); g.translate(cap.width, 0); g.scale(-1, 1); g.drawImage(frame, 0, 0, cap.width, cap.height);
      const toB64 = (cv, q) => new Promise((res) => cv.toBlob((b) => { const fr = new FileReader(); fr.onload = () => res(fr.result.split(',')[1]); fr.readAsDataURL(b); }, 'image/jpeg', q));
      const a = await toB64(cap, 0.85);
      // ③ 후보 전처리(C)
      const pre = window.aiqPreprocess(cap);
      const b = await toB64(pre.canvas, pre.quality);
      return { a, b, size: [cap.width, cap.height], src: [W, H], crop: c, stats: pre.stats, applied: pre.applied };
    })()`);
    await fs.writeFile(path.join(outDir, `${p.id}.jpg`), Buffer.from(r.a, 'base64'));
    await fs.writeFile(path.join(outDir, `${p.id}-pre.jpg`), Buffer.from(r.b, 'base64'));
    results.push({ id: p.id, file: p.file, src: r.src, crop: r.crop, capture: r.size, stats: r.stats, preprocessApplied: r.applied });
    console.log(p.id, r.size.join('x'), JSON.stringify(r.stats), r.applied.join(',') || '보정 없음');
  }
} finally {
  ws.close(); chrome.kill(); await delay(300); await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
}
await fs.writeFile(path.join(outDir, 'prep.json'), JSON.stringify(results, null, 2));
