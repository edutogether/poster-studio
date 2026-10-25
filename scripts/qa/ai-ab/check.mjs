// AI 품질 A/B — 생성 결과 자동 검사(QA 전용). PASS / WARN / FAIL.
//   node scripts/qa/ai-ab/check.mjs <ledger.jsonl> <그림 폴더> <manifest.json> <출력 checks.json>
// 검사 도구: 윈도 내장 얼굴 검출(Windows.Media.FaceAnalysis) · 글자 인식(Windows.Media.Ocr) — 설치 · 내려받기 없음, 생체 식별(누구인지) 아님.
// 오탐으로 멀쩡한 그림을 버리지 않게 FAIL은 «틀림없는 것»에만 쓴다: 파일 손상 · 크기 · 얼굴 상자가 그림 가장자리에 닿음(잘림).
// 얼굴 수 · 자리 · 글자 · 아래 1/3 · 디자인 계약은 검출기가 그림체 얼굴을 놓치거나 무늬를 글자로 읽을 수 있어 WARN(사람 확인)까지만.
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const [ledgerPath, imgDir, manifestPath, outPath] = process.argv.slice(2);
if (!outPath) { console.error('사용: check.mjs <ledger.jsonl> <그림 폴더> <manifest.json> <checks.json>'); process.exit(1); }
const here = path.dirname(fileURLToPath(import.meta.url));
const rows = (await fs.readFile(ledgerPath, 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.status === 'ok' && r.file);
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const people = Object.fromEntries(manifest.photos.map((p) => [p.id, p.people]));
const files = rows.map((r) => path.join(imgDir, r.file));

const lines = async (cmd, args) => (await run(cmd, args, { maxBuffer: 64 << 20, windowsHide: true })).stdout.split(/\r?\n/).filter((l) => l.trim().startsWith('{')).map((l) => JSON.parse(l));
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const det = [], st = [];
for (const part of chunk(files, 20)) {
  det.push(...await lines('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(here, 'winrt-detect.ps1'), ...part]));
  st.push(...await lines(process.env.AIQ_PYTHON || 'python', ['-I', path.join(here, 'stats.py'), ...part]));
}
const byFile = (arr, k) => Object.fromEntries(arr.map((x) => [path.resolve(x[k]).toLowerCase(), x]));
const D = byFile(det, 'file'), S = byFile(st, 'file');

const out = [];
for (const r of rows) {
  const f = path.resolve(imgDir, r.file).toLowerCase();
  const d = D[f], s = S[f], want = people[r.photoId];
  const c = {};
  // 1. 파일 손상 · 규격
  c.file = !s?.ok ? { v: 'FAIL', why: s?.error || '디코딩 실패' } : (s.size[0] === 1024 && s.size[1] === 1536 ? { v: 'PASS' } : { v: 'FAIL', why: `크기 ${s.size.join('×')}` });
  const W = d?.w || 1024, H = d?.h || 1536;
  const faces = (d?.faces || []).filter((b) => b[2] * b[3] >= (W * 0.03) * (H * 0.02));   // 아주 작은 오검출(무늬)은 뺀다
  // 2. 인원수(검출기 기준) — 같으면 PASS, 다르면 WARN(그림체 얼굴은 놓칠 수 있다)
  c.count = { v: faces.length === want ? 'PASS' : 'WARN', got: faces.length, want };
  // 3. 가장자리 잘림 — 얼굴 상자가 그림 왼쪽 · 오른쪽 · 위 가장자리에 닿으면 FAIL
  const cut = faces.filter((b) => b[0] <= W * 0.005 || b[0] + b[2] >= W * 0.995 || b[1] <= H * 0.003);
  c.edge = cut.length ? { v: 'FAIL', boxes: cut } : { v: faces.length ? 'PASS' : 'WARN', why: faces.length ? undefined : '얼굴 검출 0 — 사람 확인' };
  // 4. 얼굴 자리 — 틀(templates.ts)이 기대하는 띠: 세로 5~45%(얼굴 가운데), 혼자 가로 25~75% · 단체 6~94%
  const xr = r.mode === 'group' ? [0.06, 0.94] : [0.25, 0.75];
  const off = faces.filter((b) => { const cx = (b[0] + b[2] / 2) / W, cy = (b[1] + b[3] / 2) / H; return cy < 0.05 || cy > 0.45 || cx < xr[0] || cx > xr[1]; });
  c.position = faces.length ? { v: off.length ? 'WARN' : 'PASS', off: off.length } : { v: 'WARN', why: '얼굴 검출 0' };
  // 5. 아래 1/3 — 제목 자리: 위 2/3보다 어둡거나 비슷하고(+8 이하), 결(가장자리) 밀도가 위의 1.1배 이하
  c.bottom = s?.ok ? ((s.lumaBottom <= s.lumaTop + 8 && s.edgeBottom <= s.edgeTop * 1.1) ? { v: 'PASS' } : { v: 'WARN', lumaTop: s.lumaTop, lumaBottom: s.lumaBottom, edgeTop: s.edgeTop, edgeBottom: s.edgeBottom }) : { v: 'FAIL' };
  // 6. 글자 · 로고 의심 — 글자 인식이 이어진 낱말(글자 · 숫자 3자 이상 연속)을 찾으면 WARN. 흩어진 1~2자는 무늬 오인식이라 세지 않는다
  const words = (d?.text || []).map((x) => x.text).filter((tx) => /[0-9A-Za-z가-힣]{3,}/.test(tx));
  c.text = { v: words.length ? 'WARN' : 'PASS', words: words.slice(0, 5) };
  // 7. 디자인 8종 계약(src/templates.ts) — 얼굴 상자가 «주인공 상자»(subjectBox: 혼자 가로 16~84% · 단체 4~96%, 세로 5~67%, 디자인 6종)와
  //    아치 프레임 «얼굴 띠»(archPlacement: 혼자 가로 30~70% · 단체 8~92%, 세로 8~35%) 안에 드는지. 밖이면 그 디자인에서 얼굴이 작아지거나 곡선에 걸릴 수 있다.
  const inside = (b, [xa, xb], [ya, yb]) => b[0] / W >= xa && (b[0] + b[2]) / W <= xb && b[1] / H >= ya && (b[1] + b[3]) / H <= yb;
  const group = r.mode === 'group';
  c.designBox = faces.length ? { v: faces.every((b) => inside(b, group ? [0.04, 0.96] : [0.16, 0.84], [0.05, 0.67])) ? 'PASS' : 'WARN' } : { v: 'WARN', why: '얼굴 검출 0' };
  c.archBand = faces.length ? { v: faces.every((b) => inside(b, group ? [0.08, 0.92] : [0.3, 0.7], [0.08, 0.35])) ? 'PASS' : 'WARN' } : { v: 'WARN', why: '얼굴 검출 0' };
  const vs = Object.values(c).map((x) => x.v);
  const overall = vs.includes('FAIL') ? 'FAIL' : vs.includes('WARN') ? 'WARN' : 'PASS';
  out.push({ caseId: r.caseId, arm: r.arm, file: r.file, overall, checks: c, faces });
}
await fs.writeFile(outPath, JSON.stringify(out, null, 2));
const tally = out.reduce((m, x) => ((m[x.arm + ':' + x.overall] = (m[x.arm + ':' + x.overall] || 0) + 1), m), {});
console.log('검사', out.length, '장', JSON.stringify(tally));
