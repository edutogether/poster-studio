// AI 품질 A/B — 결과를 사람이 보는 페이지와 기계가 읽는 결과 파일로 만든다(QA 전용, 로컬 파일로만 연다).
//
//   node scripts/qa/ai-ab/report.mjs --out <페이지 폴더> --manifest <manifest.json> --inputs <입력 폴더> --run <실행 폴더> --results <그림 폴더> [--designs <합성 폴더>]
//     실행 폴더 = plan.json · ledger.jsonl · checks.json, 입력 폴더 = prep.mjs 출력(prep.json 포함), 합성 폴더 = compose.mjs 출력(compose.json 포함)
//
// 만드는 것(--out 안):
//   poster-ai-quality-gallery.html      원본 → 기존(A) → 개선(B · C · D) 나란히, 확대 · 얼굴 확대 · 시간 · 모델 · 지시문 판 · 비용 · 자동 검사 · 사람 채점
//   poster-template-compatibility.html  같은 그림에 디자인 8종 — 대표 조건 A/B, 단체 아치 프레임 전부, 디자인 계약 검사 집계
//   poster-test-photo-manifest.md      사진마다 출처 · 권한 · 인원 · 조건 · 변형 · 실제 사용 · 자동 검사 결과
//   poster-ai-test-results.json         호출마다 기록 + 갈래별 집계(사람 점수는 비워 둔다 — 사람이 매기기 전에는 채우지 않는다)
// 그림은 파일로 두고 페이지에서 상대 경로로 부른다(사진을 페이지에 넣지 않는다). 드라이런 그림이면 페이지에 «가짜»로 크게 표시한다.
import fs from 'node:fs';
import path from 'node:path';

// --run · --results · --designs는 쉼표로 여러 폴더를 받는다(예: 10/25 A/B 회차 + 기존+ 회차). 같은 조건 · 갈래는 뒤 폴더가 이긴다.
// --arms A,B,E: 이 갈래만 보인다(없으면 계획에 있는 전부). --score-key: 갤러리 사람 채점을 브라우저에 저장하는 이름(회차마다 따로).
const arg = (k) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : undefined; };
const list = (v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);
const outDir = arg('out'), manifestPath = arg('manifest'), inputsDir = arg('inputs');
const runDirs = list(arg('run')), resultsDirs = list(arg('results')), designsDirs = list(arg('designs'));
const armsShown = list(arg('arms'));
const scoreKey = arg('score-key') || 'aiq-human-scores-v1';
// --picks <json>: 사람이 조건마다 고른 판 { caseId: { arms: ['A'], how: '화소' | '설명', note } } — 갤러리에서 그 칸에 «선택» 표시를 한다
const picksPath = arg('picks');
if (!outDir || !manifestPath || !inputsDir || !runDirs.length || !resultsDirs.length) {
  console.error('사용: report.mjs --out <폴더> --manifest <manifest.json> --inputs <폴더> --run <폴더[,폴더]> --results <폴더[,폴더]> [--designs <폴더[,폴더]>] [--arms A,B,E] [--score-key 이름]');
  process.exit(1);
}
const runDir = runDirs[0];
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const readIf = (p, empty) => (fs.existsSync(p) ? readJson(p) : empty);
const manifest = readJson(manifestPath);
const prep = Object.fromEntries(readJson(path.join(inputsDir, 'prep.json')).map((p) => [p.id, p]));
const planAll = runDirs.flatMap((d) => readJson(path.join(d, 'plan.json')));
const plan = [...new Map(planAll.filter((c) => !armsShown.length || armsShown.includes(c.arm)).map((c) => [`${c.caseId}-${c.arm}`, c])).values()];
const ledgerRows = runDirs.flatMap((d) => fs.readFileSync(path.join(d, 'ledger.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
const checks = runDirs.flatMap((d) => readIf(path.join(d, 'checks.json'), []));
const colors = runDirs.flatMap((d) => readIf(path.join(d, 'color.json'), []));
const picks = picksPath ? readJson(picksPath) : null;
const compose = designsDirs.flatMap((d) => readIf(path.join(d, 'compose.json'), []).map((c) => ({ ...c, dir: d })));

const url = (abs) => path.relative(outDir, abs).split(path.sep).map(encodeURIComponent).join('/');
const resultPath = (file) => path.join(resultsDirs.find((d) => fs.existsSync(path.join(d, file))) || resultsDirs[0], file);
const photoDir = path.resolve(path.dirname(manifestPath), manifest.photoDir || '.');
const key = (caseId, arm) => `${caseId}-${arm}`;
// 같은 조건 · 갈래를 다시 돌렸으면 마지막 기록이 그 호출의 결과다(예산 정지 뒤 이어서 돌린 경우 등)
const last = new Map();
for (const r of ledgerRows) if (r.type !== 'start' && r.type !== 'carry') last.set(key(r.caseId, r.arm), r);   // 출발 줄(동시 실행 잠금용) · 이월 줄(누적 상한용)은 결과가 아니다
const checkOf = new Map(checks.map((c) => [key(c.caseId, c.arm), c]));
const colorOf = new Map(colors.map((c) => [key(c.caseId, c.arm), c]));
const designsOf = new Map(compose.map((c) => [c.id, c.files.map((f) => ({ label: f.label, src: url(path.join(c.dir, f.file)) }))]));

const GENRE = { sf: 'SF', fantasy: '판타지', animation: '애니메이션', hero: '히어로', mystery: '스릴러', director: '드라마', sports: '스포츠', music: '뮤지컬' };
const ARM = { A: '기존 — 운영 지시문 v1', B: '새것 — 개선 지시문 v2', C: '새것 v2 + 전처리', D: '새것 v2 + high 화질', E: '기존+ — v1 + 채점에서 좋았던 것(v1plus)', F: '기존+2 — v1 + 고르신 그림의 공통점(v1plus2)' };
const LEVEL = { easy: '쉬움', medium: '보통', hard: '어려움' };
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)]; };
// 자동 주의 표시(사람 판단을 돕는 기준 — 10/25 A/B 수치와 Bumm님 채점이 맞아떨어진 값으로 정했다. 얼굴 닮음 · 의상은 재지 않는다)
const FLAG_RULES = {
  count: '인원 검출이 기대와 다름', edge: '얼굴이 가장자리에 잘림', position: '얼굴 자리 벗어남', text: '글자처럼 읽히는 것', bottom: '아래 1/3이 복잡(제목 자리)',
  skew: '혼자 얼굴 쏠림 — 가운데에서 가로 12% 넘게', gold: '황금빛 · 주황 화소 30% 이상', teal: '푸른빛 화소 15% 이상(SF 제외)',
  darkFace: '얼굴 평균 밝기 85 미만', dull: '평균 채도 0.33 미만(탁함)', blackBand: '뮤지컬 아래 1/3의 절반 이상이 거의 검정',
};
function flagsOf(c, ch, col) {
  if (c.status !== 'ok') return [];
  const f = [];
  if (ch?.count?.v && ch.count.v !== 'PASS') f.push({ k: 'count', t: `인원 검출 ${ch.count.got}/${ch.count.want}` });
  if (ch?.edge?.v === 'FAIL') f.push({ k: 'edge', t: '얼굴 가장자리 잘림' });
  if (ch?.position?.v && ch.position.v !== 'PASS') f.push({ k: 'position', t: '얼굴 자리 벗어남' });
  if (ch?.text?.v && ch.text.v !== 'PASS') f.push({ k: 'text', t: '글자처럼 읽히는 것' });
  if (ch?.bottom?.v && ch.bottom.v !== 'PASS') f.push({ k: 'bottom', t: '아래 1/3 복잡' });
  if (col) {
    if (c.mode === 'solo' && col.faceCx != null && Math.abs(col.faceCx - 0.5) > 0.12) f.push({ k: 'skew', t: `얼굴 쏠림(가로 ${Math.round(col.faceCx * 100)}%)` });
    if (col.gold >= 0.3) f.push({ k: 'gold', t: `황금빛 ${Math.round(col.gold * 100)}%` });
    if (c.genre !== 'sf' && col.teal >= 0.15) f.push({ k: 'teal', t: `푸른빛 ${Math.round(col.teal * 100)}%` });
    if (col.faceLuma != null && col.faceLuma < 85) f.push({ k: 'darkFace', t: `얼굴 어두움(${Math.round(col.faceLuma)})` });
    if (col.sat < 0.33) f.push({ k: 'dull', t: `탁함(채도 ${col.sat.toFixed(2)})` });
    if (c.genre === 'music' && col.bottomBlack >= 0.5) f.push({ k: 'blackBand', t: `아래 검은 띠 ${Math.round(col.bottomBlack * 100)}%` });
  }
  return f;
}

// 호출마다 기록
const calls = plan.map((c) => {
  const r = last.get(key(c.caseId, c.arm));
  const ch = checkOf.get(key(c.caseId, c.arm));
  const col = colorOf.get(key(c.caseId, c.arm)) || null;
  const status = r ? r.status : 'not-run';
  return {
    caseId: c.caseId, arm: c.arm, photoId: c.photoId, mode: c.mode, genre: c.genre, difficulty: c.difficulty, title: c.title, tagline: c.tagline, input: c.input,
    color: col && Object.fromEntries(Object.entries(col).filter(([k]) => !['caseId', 'arm', 'file'].includes(k))), flags: flagsOf({ ...c, status }, ch, col),
    status, dry: r?.dry ?? null, file: r?.file ?? null, image: r?.file ? url(resultPath(r.file)) : null,
    ms: r?.ms ?? null, cost: r?.cost ?? null, model: r?.model ?? null, quality: r?.quality ?? null, promptVersion: r?.promptVersion ?? null, promptChars: r?.promptChars ?? null,
    attempts: (r?.attempts || []).map((a) => ({ at: a.at, ms: a.ms, request_id: a.request_id ?? a.error?.request_id ?? null, params: a.params, usage: a.usage ?? null, error: a.error ?? null })),
    error: r?.error ?? null, checks: ch ? { overall: ch.overall, ...Object.fromEntries(Object.entries(ch.checks).map(([k, v]) => [k, v])) } : null, faces: ch?.faces ?? [],
    designs: designsOf.get(key(c.caseId, c.arm)) || [],
  };
});

// 갈래별 집계
const arms = {};
const mean = (xs) => { const v = xs.filter((x) => x != null && Number.isFinite(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const colorMeans = (cs) => Object.fromEntries(['gold', 'teal', 'warm', 'sat', 'contrast', 'luma', 'faceLuma', 'faceCy', 'faceH', 'bottomBlack'].map((k) => [k, ((v) => (v == null ? null : +v.toFixed(3)))(mean(cs.map((c) => c.color?.[k])))]));
for (const a of [...new Set(plan.map((c) => c.arm))].sort()) {
  const cs = calls.filter((c) => c.arm === a);
  if (!cs.length) continue;
  const ok = cs.filter((c) => c.status === 'ok');
  const ms = ok.map((c) => c.ms);
  const tally = (k) => ok.reduce((m, c) => { const v = k === 'overall' ? c.checks?.overall : c.checks?.[k]?.v; if (v) m[v] = (m[v] || 0) + 1; return m; }, {});
  const flagCount = ok.reduce((m, c) => { for (const f of c.flags) m[f.k] = (m[f.k] || 0) + 1; return m; }, {});
  arms[a] = {
    label: ARM[a], planned: cs.length, ok: ok.length, error: cs.filter((c) => c.status === 'error').length, budgetSkip: cs.filter((c) => c.status === 'budget-skip').length,
    billingStop: cs.filter((c) => c.status === 'billing-stop' || c.status === 'billing-skip').length,
    notRun: cs.filter((c) => c.status === 'not-run').length, dry: ok.some((c) => c.dry),
    p50s: ms.length ? +(pct(ms, 0.5) / 1000).toFixed(1) : null, p95s: ms.length ? +(pct(ms, 0.95) / 1000).toFixed(1) : null,
    costUSD: +cs.reduce((s, c) => s + (c.cost || 0), 0).toFixed(4), attempts: cs.reduce((s, c) => s + c.attempts.length, 0),
    rejectedAttempts: cs.reduce((s, c) => s + c.attempts.filter((t) => t.error).length, 0),
    checks: Object.fromEntries(['overall', 'file', 'count', 'edge', 'position', 'bottom', 'text', 'designBox', 'archBand'].map((k) => [k, tally(k)])),
    color: colorMeans(ok), flags: flagCount, flagged: ok.filter((c) => c.flags.length).length,
    picked: picks ? cs.filter((c) => picks[c.caseId]?.arms.includes(a)).length : null,
    byGenre: Object.fromEntries(Object.keys(GENRE).map((g) => { const gs = ok.filter((c) => c.genre === g); return [g, { n: gs.length, flagged: gs.filter((c) => c.flags.length).length, ...colorMeans(gs) }]; })),
  };
}
const used = plan.filter((c) => c.arm === 'A' || c.arm === 'B').reduce((m, c) => ((m[c.photoId] = (m[c.photoId] || 0) + 1), m), {});
const anyDry = calls.some((c) => c.dry);
const results = {
  generatedAt: new Date().toISOString(),
  kind: anyDry ? 'DRY — 가짜 그림이 섞여 있다(실제 API 생성 아님)' : '실제 API 생성',
  photos: { distinct: Object.keys(used).length, usesPerPhotoInAB: used, variants: '원본 사진 24장 → 웹캠 재현 입력 24장(잘라내기 · 거울 · JPEG 0.85) + 전처리 입력 24장(C에서 8장 사용)' },
  arms, totalCostUSD: +calls.reduce((s, c) => s + (c.cost || 0), 0).toFixed(4),
  // ledger 전체 비용 — 계획 108건 밖의 기록(실제 모드 한 바퀴 · 중단 때 나가 있던 요청)과 끝 줄이 없는 출발(청구됐을 수 있음)까지
  costLedger: (() => {
    const ends = ledgerRows.filter((r) => r.type !== 'start' && r.type !== 'carry');   // 이월 줄은 앞 회차 누적의 사본이라 더하지 않는다
    const endedKeys = new Set(ends.filter((r) => r.key).map((r) => r.key));
    const openStarts = ledgerRows.filter((r) => r.type === 'start' && !endedKeys.has(r.key));
    const sum = (rs) => +rs.reduce((s, r) => s + (r.cost || 0), 0).toFixed(4);
    const unitMax = Math.max(0, ...ends.filter((r) => r.status === 'ok' && (r.quality || 'medium') === 'medium').map((r) => r.cost || 0));
    const recorded = sum(ends);
    return {
      recordedUSD: recorded, realLoopUSD: sum(ends.filter((r) => r.tag === 'real-loop')), killedInflightUSD: sum(ends.filter((r) => r.status === 'killed-inflight')),
      openStarts: openStarts.length, openStartsMaxUSD: +(openStarts.length * unitMax).toFixed(4), worstCaseUSD: +(recorded + openStarts.length * unitMax).toFixed(4),
      note: '끝 줄이 없는 출발 = 실행기가 죽어 결과를 못 받은 요청. 청구됐을 수 있어 «1건 최대 비용 × 개수»를 최악 합계에 더한다.',
    };
  })(),
  stress: fs.existsSync(path.join(runDir, 'stress.json')) ? readJson(path.join(runDir, 'stress.json')) : null,
  realLoop: (() => { const p = path.join(outDir, 'real-loop', 'real-loop.json'); if (!fs.existsSync(p)) return null; const r = readJson(p); return { dry: r.dry, steps: r.steps.map((s) => ({ scenario: s.scenario, photoId: s.photoId, step: s.step, ok: s.ok, note: s.note || null, serverStatus: s.serverStatus ?? null, waitS: s.waitS ?? null })), openai: { calls: r.openai.calls, cost: r.openai.cost }, blockedExternal: r.blockedExternal }; })(),
  picks: picks || null,
  humanScores: null, humanScoresNote: '사람 평가 전 — 갤러리의 채점을 «점수 내보내기»로 받은 JSON을 붙인다. 세션이 점수를 채우지 않는다.',
  calls,
};
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'poster-ai-test-results.json'), JSON.stringify(results, null, 1));

// 시험 사진 기록(사람이 읽는 표) — 출처 · 권한 · 인원(사람이 센 값) · 조건 · 변형 · 실제 사용 · 결과
const preFixed = manifest.photos.filter((p) => (prep[p.id]?.preprocessApplied || []).some((a) => a.startsWith('levels'))).map((p) => p.id);
const resultOf = (photoId) => [...new Set(plan.filter((c) => c.photoId === photoId).map((c) => c.caseId))].map((id) => {
  const v = (a) => calls.find((c) => c.caseId === id && c.arm === a);
  const s = (c) => (!c ? '—' : c.status !== 'ok' ? c.status : c.checks?.overall || '검사 전');
  const extra = ['C', 'D', 'E', 'F'].filter((a) => v(a)).map((a) => ` · ${a} ${s(v(a))}`).join('');
  return `${id}: ${v('A') ? 'A ' + s(v('A')) : ''}${v('B') ? ' → B ' + s(v('B')) : ''}${extra}`;
}).join('<br>');
const md = `# 시험 사진 기록 — Poster Studio AI 품질 A/B

만든 시각 ${results.generatedAt} · ${results.kind}

- 사진 ${manifest.photos.length}장(혼자 ${manifest.photos.filter((p) => p.mode === 'solo').length} · 단체 ${manifest.photos.filter((p) => p.mode === 'group').length}). 전부 Pexels에 있는, 실제 사람을 카메라로 찍은 사진이다. 단체는 여러 사람이 한 장에 함께 찍힌 사진이고, 따로 찍은 사람을 이어 붙이지 않았다.
- 사진 파일은 이 폴더의 \`${manifest.photoDir}\\\`에만 둔다. 공개 저장소나 웹에는 올리지 않는다.
- 출처 · 권한 확인: ${manifest.checkedAt}. 사진마다 Pexels 사진 페이지의 라이선스 표시 · 무료 여부 · 작가를 다시 읽었고, ${manifest.photos.length}장 모두 Pexels License · 무료였다.
- 인원수는 사람이 눈으로 센 값이다. 검출기가 놓친 얼굴은 눈으로 상자를 더했다(비고 칸).
- 나이 · 인종 같은 민감한 속성은 적지 않는다. 사진 페이지의 제목 · 설명도 옮기지 않았다(출신 · 인종 묘사가 들어 있다). 출처는 번호만 든 짧은 주소로 적었다.

## 권한 판단(24장 공통)

| 항목 | 확인 결과 |
|---|---|
| 수정 · 파생 이미지 만들기 | 허용 — Pexels License «You can modify the photos» |
| 외부 이미지 API(OpenAI)로 전송 · AI 편집 | 명시적 금지가 없고, 명시적 허용도 없다. Bumm님이 2026-10-25 아이 사진으로 시험하기로 정했다(팀장 전달), 검색 · 내려받기는 Poster Studio 창에서 직접 지시했다 |
| 모델 릴리스 | Pexels 이용약관상 올린 사람이 확보할 책임이다. 사진별 동의서는 공개되지 않는다 |
| 내부 QA 열람 | 이 PC의 로컬 폴더에서만 연다. 공개하지 않는 내부 시험용이다 |
| 금지 사항 | 식별되는 인물을 나쁘게 · 불쾌하게 보이게 하는 것, 보증을 암시하는 것, 재배포 · 판매. 결과는 공개하지 않는다 |
| 고른 기준 | ${manifest.selection || '—'} |
| 생체 식별 | 하지 않는다. 얼굴 검출은 잘라내기 · 인원 확인용 상자만 쓰고, 누구인지는 찾지 않는다. 실명 · 신상도 추정하지 않는다 |

## 사용한 변형(모든 사진에 같게)

1. 4:3 잘라내기 — 얼굴 상자에서 규칙으로 계산했다(${manifest.framing}). 조건 사진은 규칙을 일부러 바꿨다(작은 얼굴 · 위에 붙은 얼굴 · 양끝 얼굴 · 넓은 줄).
2. 1280×960 웹캠 프레임에 그린다.
3. 앱 캡처와 같은 연산: 가로 1024(1024×768) · 좌우 반전 · JPEG 0.85. 이것이 A · B · D의 입력이다.
4. C 입력 = 3번 결과에 후보 전처리(장면 전체가 어두울 때만 밝기 보정 + JPEG 0.92). 24장 중 실제로 밝기를 고친 사진: ${preFixed.join(' · ') || '없음'}.

## 사진별

| ID | 구분 | 난이도 | 촬영 조건 | 인원 | 출처 · 작가 | 원본 → 받은 크기 | 잘라내기(x, y, w, h px) | 얼굴 높이(프레임 대비) | 비고 | 실제 시험 사용 → 자동 검사 |
|---|---|---|---|---|---|---|---|---|---|---|
${manifest.photos.map((p) => `| ${p.id} | ${p.mode === 'group' ? '단체' : '혼자'} | ${LEVEL[p.difficulty]} | ${p.condition} | ${p.people} | [Pexels ${p.source.pexelsId}](${p.source.page}) · ${p.source.creator} | ${p.source.origSize.join('×')} → ${p.download.width}×${p.download.height} | ${p.cropPx.join(', ')} | ${Math.round(p.faceHeightInFrame * 100)}% | ${p.note || ''} | ${resultOf(p.id)} |`).join('\n')}

파일 지문(SHA-256)과 얼굴 상자 좌표는 \`manifest.json\`에 있다.
`;
fs.writeFileSync(path.join(outDir, 'poster-test-photo-manifest.md'), md);

// 페이지에 넣는 자료(그림은 경로만)
const page = {
  generatedAt: results.generatedAt, kind: results.kind, dry: anyDry, genre: GENRE, arm: ARM, level: LEVEL, arms, flagRules: FLAG_RULES, scoreKey, picks,
  photos: Object.fromEntries(manifest.photos.map((p) => [p.id, {
    id: p.id, mode: p.mode, difficulty: p.difficulty, condition: p.condition, people: p.people, note: p.note || '', facesInFrame: p.facesInFrame,
    input: url(path.join(inputsDir, `${p.id}.jpg`)), pre: url(path.join(inputsDir, `${p.id}-pre.jpg`)), original: url(path.join(photoDir, p.file)),
    preApplied: prep[p.id]?.preprocessApplied || [], source: p.source,
  }])),
  cases: [...new Set(plan.map((c) => c.caseId))].map((id) => {
    const base = plan.find((c) => c.caseId === id);
    return { caseId: id, photoId: base.photoId, mode: base.mode, genre: base.genre, difficulty: base.difficulty, title: base.title, tagline: base.tagline,
      runs: calls.filter((c) => c.caseId === id).map(({ caseId: _c, photoId: _p, mode: _m, genre: _g, difficulty: _d, title: _t, tagline: _l, ...rest }) => rest) };
  }),
};
const json = JSON.stringify(page).replace(/</g, '\\u003c');

const STYLE = `
:root{--bg:#f7f7fb;--card:#fff;--ink:#1f2333;--sub:#5b6178;--line:#e3e5ee;--ind:#6366F1;--ind-ink:#4F46E5;--ind-bg:#eef0ff;--ok:#047857;--ok-bg:#e7f8f1;--warn:#B45309;--warn-bg:#fdf4e3;--bad:#BE123C;--bad-bg:#fdecef;--info:#0369A1;--info-bg:#e6f4fb}
@media (prefers-color-scheme:dark){:root{--bg:#12141c;--card:#1b1e29;--ink:#e8eaf3;--sub:#a2a8bf;--line:#2c3142;--ind-ink:#a5a8ff;--ind-bg:#24264a;--ok:#5fd3a8;--ok-bg:#12352a;--warn:#f6c26b;--warn-bg:#3a2c12;--bad:#ff8aa1;--bad-bg:#3d1621;--info:#7cc8ef;--info-bg:#10304a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 "Malgun Gothic","Apple SD Gothic Neo",system-ui,sans-serif}
header,nav,main{max-width:1680px;margin:0 auto;padding:0 16px}h1{font-size:22px;margin:20px 0 4px}h2{font-size:16px;margin:0}.sub{color:var(--sub)}
.kind{display:inline-block;padding:2px 10px;border-radius:999px;font-weight:700}.kind.real{background:var(--ok-bg);color:var(--ok)}.kind.dry{background:var(--bad-bg);color:var(--bad);font-size:18px}
.tiles{display:flex;flex-wrap:wrap;gap:10px;margin:12px 0}.tile{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 14px;min-width:220px}
.tile b{font-size:15px}.tile .n{font-size:20px;font-weight:800;color:var(--ind-ink)}
nav{position:sticky;top:0;z-index:5;background:var(--bg);padding-top:8px;padding-bottom:8px;border-bottom:1px solid var(--line);display:flex;flex-wrap:wrap;gap:8px;align-items:center}
select,button,input[type=text]{font:inherit;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:8px;padding:5px 8px}button{cursor:pointer}
button.primary{background:var(--ind);color:#fff;border-color:var(--ind)}
.case{background:var(--card);border:1px solid var(--line);border-radius:12px;margin:14px 0;padding:14px}
.story{margin:2px 0 10px;color:var(--sub)}.row{display:flex;gap:12px;overflow-x:auto;align-items:flex-start}
figure{margin:0;flex:0 0 auto}figure img{display:block;height:360px;width:auto;border-radius:6px;cursor:zoom-in;background:#888}
figure.in img{height:240px}figcaption{font-size:12px;color:var(--sub);max-width:260px;margin-top:4px}
figure.arm figcaption{max-width:240px}.armname{font-weight:800;color:var(--ind-ink)}
.b{display:inline-block;padding:0 6px;border-radius:6px;font-size:11px;font-weight:700;margin:1px 2px 1px 0}.PASS{background:var(--ok-bg);color:var(--ok)}.WARN{background:var(--warn-bg);color:var(--warn)}.FAIL{background:var(--bad-bg);color:var(--bad)}
.dryflag{position:relative}.dryflag::after{content:"DRY · 가짜 그림";position:absolute;left:6px;top:6px;background:var(--bad);color:#fff;font-weight:800;padding:2px 8px;border-radius:6px}
.miss{width:240px;height:360px;display:flex;align-items:center;justify-content:center;border:2px dashed var(--line);border-radius:6px;color:var(--sub);text-align:center;padding:10px}
.faces{display:flex;gap:16px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px dashed var(--line)}.faces .grp{display:flex;gap:4px;align-items:flex-end}.faces .lbl{font-size:12px;color:var(--sub);writing-mode:vertical-rl}
.face{height:120px;border-radius:6px;background-repeat:no-repeat;background-color:#888;cursor:zoom-in}
details{margin-top:10px}summary{cursor:pointer;color:var(--ind-ink);font-weight:700}.dgrid{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:6px;margin-top:6px}.dgrid img{width:100%;border-radius:4px;cursor:zoom-in}.dgrid .cap{font-size:11px;color:var(--sub);text-align:center}
.score{margin-top:6px;font-size:12px;border:1px solid var(--line);border-radius:8px;padding:6px}.score .it{display:flex;align-items:center;gap:4px;margin:2px 0}.score .it span{width:74px;color:var(--sub);white-space:nowrap}
.score button{padding:0 6px;font-size:12px;border-radius:5px}.score button.on{background:var(--ind);color:#fff;border-color:var(--ind)}.score input{width:100%;margin-top:3px;font-size:12px}
#lb{position:fixed;inset:0;background:rgba(10,12,20,.92);display:none;z-index:20;overflow:auto}#lb.open{display:block}#lb .bar{position:sticky;top:0;display:flex;gap:8px;align-items:center;padding:8px 16px;background:rgba(10,12,20,.95);color:#fff}
#lb img{display:block;margin:12px auto;max-width:calc(100vw - 32px);max-height:calc(100vh - 80px)}#lb.full img{max-width:none;max-height:none}
.empty{padding:40px;text-align:center;color:var(--sub)}
table.cmp{border-collapse:collapse;margin:8px 0;font-size:12.5px;background:var(--card);display:block;overflow-x:auto;max-width:100%}table.cmp th,table.cmp td{border:1px solid var(--line);padding:4px 7px;white-space:nowrap;text-align:right}table.cmp th{background:var(--ind-bg);color:var(--ind-ink);text-align:center}table.cmp td:first-child{text-align:left}
figure.arm.picked img{outline:4px solid var(--bad);outline-offset:-4px}.pick{display:inline-block;background:var(--bad-bg);color:var(--bad);font-weight:700;border-radius:6px;padding:1px 7px;margin-bottom:2px}
.fgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin:8px 0}.fitem{display:block;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:6px;color:var(--ink);text-decoration:none}.fitem img{width:100%;border-radius:4px}.fitem .cap{font-size:12px;line-height:1.5}`;

const LIGHTBOX = `
<div id="lb"><div class="bar"><button id="lbPrev">◀</button><button id="lbNext">▶</button><button id="lbFull">실제 크기</button><span id="lbCap"></span><span style="flex:1"></span><button id="lbClose">닫기 (Esc)</button></div><img id="lbImg" alt=""></div>`;
const LIGHTBOX_JS = `
const lb={list:[],i:0};const $=(id)=>document.getElementById(id);
function openLb(list,i){lb.list=list;lb.i=i;showLb();$('lb').classList.add('open')}
function showLb(){const it=lb.list[lb.i];$('lbImg').src=it.src;$('lbCap').textContent=it.cap+'  ('+(lb.i+1)+'/'+lb.list.length+')'}
$('lbPrev').onclick=()=>{lb.i=(lb.i+lb.list.length-1)%lb.list.length;showLb()};$('lbNext').onclick=()=>{lb.i=(lb.i+1)%lb.list.length;showLb()};
$('lbFull').onclick=()=>$('lb').classList.toggle('full');$('lbClose').onclick=()=>$('lb').classList.remove('open','full');
document.addEventListener('keydown',(e)=>{if(!$('lb').classList.contains('open'))return;if(e.key==='Escape')$('lbClose').onclick();if(e.key==='ArrowLeft')$('lbPrev').onclick();if(e.key==='ArrowRight')$('lbNext').onclick()});
const esc=(s)=>String(s??'').replace(/[&<>"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const badge=(v,t)=>v?'<span class="b '+v+'" title="'+esc(t||'')+'">'+esc(t?t+' '+v:v)+'</span>':'';`;

const html = (title, desc, body, script) => `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<meta name="description" content="${desc}"><style>${STYLE}</style></head><body>
${body}
${LIGHTBOX}
<script type="application/json" id="aiq-data">${json}</script>
<script>const D=JSON.parse(document.getElementById('aiq-data').textContent);${LIGHTBOX_JS}${script}</script>
</body></html>
`;

// ───── 갤러리 ─────
const galleryBody = `
<header>
  <h1>Poster Studio AI 품질 A/B 갤러리</h1>
  <div class="sub" id="lead"></div>
  <div id="kind" style="margin-top:8px"></div>
  <div class="tiles" id="tiles"></div>
  <details id="cmpBox" open><summary><b>자동 비교 — 갈래별 · 장르별</b> <span class="sub">(얼굴 닮음 · 의상은 재지 않는다 — 사람 판단. 생체 식별 없음)</span></summary><div id="cmp"></div></details>
  <details id="failBox"><summary><b>자동 주의 사례</b> <span class="sub" id="failSum"></span></summary><div id="fails"></div></details>
</header>
<nav>
  <select id="fGenre"><option value="">장르 전체</option></select>
  <select id="fMode"><option value="">혼자 · 단체</option><option value="solo">혼자</option><option value="group">단체</option></select>
  <select id="fLevel"><option value="">촬영 난이도 전체</option><option value="easy">쉬움</option><option value="medium">보통</option><option value="hard">어려움</option></select>
  <select id="fPhoto"><option value="">촬영 조건(사진) 전체</option></select>
  <select id="fCheck"><option value="">자동 검사 전체</option><option value="FAIL">FAIL 있는 조건</option><option value="WARN">WARN 이상 있는 조건</option></select>
  <select id="fArm"><option value="">갈래 전체</option></select>
  <select id="fFlag"><option value="">주의 표시 전체</option></select>
  <span id="count" class="sub"></span><span style="flex:1"></span>
  <span id="scored" class="sub"></span><button id="exp" class="primary">점수 내보내기</button><label><button id="impBtn">점수 불러오기</button><input id="imp" type="file" accept="application/json" hidden></label>
</nav>
<main id="list"></main>`;

const galleryScript = `
const KEY=D.scoreKey;
const load=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch{return {}}};
const save=(s)=>{try{localStorage.setItem(KEY,JSON.stringify(s))}catch{}};
let scores=load();
const ITEMS=[['sim','얼굴 닮음',5],['craft','그림 완성도',5],['poster','포스터다움',5],['genre','장르 적합',5],['comp','구도',5],['count','인원수','PF'],['crop','얼굴 잘림','PF'],['text','글자 생성','PF']];
const done=(s)=>s&&ITEMS.every(([k])=>s[k]!=null);
const okRuns=D.cases.flatMap((c)=>c.runs.filter((r)=>r.status==='ok').map((r)=>c.caseId+'-'+r.arm));
function scoredText(){const n=okRuns.filter((k)=>done(scores[k])).length;document.getElementById('scored').textContent='사람 채점 '+n+' / '+okRuns.length}
document.getElementById('kind').innerHTML=D.dry?'<span class="kind dry">⚠ 드라이런(가짜) 그림이 섞여 있다 — 실제 API 생성 결과가 아니다</span>':'<span class="kind real">실제 API 생성 결과</span> <span class="sub">만든 시각 '+esc(D.generatedAt)+'</span>';
document.getElementById('tiles').innerHTML=Object.entries(D.arms).map(([a,s])=>'<div class="tile"><b>'+a+' · '+esc(s.label)+'</b><div class="n">'+s.ok+' / '+s.planned+' 성공</div>'+(s.picked!=null?'<div class="sub">★ Bumm님 선택 '+s.picked+'칸</div>':'')+'<div class="sub">p50 '+(s.p50s??'—')+'초 · p95 '+(s.p95s??'—')+'초 · $'+s.costUSD.toFixed(3)+'</div><div>'+['PASS','WARN','FAIL'].map((v)=>s.checks.overall[v]?'<span class="b '+v+'">'+v+' '+s.checks.overall[v]+'</span>':'').join('')+(s.error?badge('FAIL','오류 '+s.error):'')+(s.budgetSkip?badge('WARN','예산 정지 '+s.budgetSkip):'')+(s.billingStop?badge('FAIL','잔액 · 한도 정지 '+s.billingStop):'')+'</div></div>').join('');
const ARMS=Object.keys(D.arms);
document.getElementById('lead').textContent='원본 사진 → '+ARMS.map((a)=>a+' '+D.arm[a].split(' — ')[0]).join(' → ')+'을 같은 사진으로 나란히 본다. 그림을 누르면 크게, 얼굴 띠를 누르면 얼굴만 크게 본다.';
for(const a of ARMS.slice(1))fArm.insertAdjacentHTML('beforeend','<option value="'+a+'">'+a+' 있는 조건</option>');
for(const [k,v] of Object.entries(D.flagRules))fFlag.insertAdjacentHTML('beforeend','<option value="'+k+'">'+esc(v)+'</option>');
// 자동 비교 표 — 갈래별(검사 PASS · 색 · 주의 수) + 장르별(황금빛 · 푸른빛 · 채도 · 얼굴 밝기 · 아래 검정 · 주의)
const pctf=(x)=>x==null?'—':Math.round(x*100)+'%',n1=(x)=>x==null?'—':(+x).toFixed(x<1?2:0);
const pass=(s,k)=>{const t=s.checks[k]||{};const tot=Object.values(t).reduce((a,b)=>a+b,0);return tot?(t.PASS||0)+' / '+tot:'—'};
let cmp='<table class="cmp"><tr><th>갈래</th><th>인원수 PASS</th><th>가장자리 PASS</th><th>얼굴 자리 PASS</th><th>아래 1/3 PASS</th><th>글자 없음</th><th>아치 띠 PASS</th><th>황금빛</th><th>푸른빛</th><th>채도</th><th>대비</th><th>얼굴 밝기</th><th>얼굴 세로</th><th>주의 있는 그림</th><th>Bumm님 선택</th></tr>';
for(const a of ARMS){const s=D.arms[a],c=s.color||{};cmp+='<tr><td><b>'+a+'</b> '+esc(s.label)+'</td><td>'+pass(s,'count')+'</td><td>'+pass(s,'edge')+'</td><td>'+pass(s,'position')+'</td><td>'+pass(s,'bottom')+'</td><td>'+pass(s,'text')+'</td><td>'+pass(s,'archBand')+'</td><td>'+pctf(c.gold)+'</td><td>'+pctf(c.teal)+'</td><td>'+n1(c.sat)+'</td><td>'+n1(c.contrast)+'</td><td>'+n1(c.faceLuma)+'</td><td>'+pctf(c.faceCy)+'</td><td>'+s.flagged+' / '+s.ok+'</td><td>'+(s.picked??'—')+'</td></tr>'}
cmp+='</table><table class="cmp"><tr><th>장르</th>'+ARMS.map((a)=>'<th>'+a+' 황금빛 · 푸른빛</th><th>'+a+' 채도 · 얼굴 밝기</th><th>'+a+' 아래 검정</th><th>'+a+' 주의</th>').join('')+'</tr>';
for(const g of Object.keys(D.genre)){cmp+='<tr><td><b>'+esc(D.genre[g])+'</b></td>'+ARMS.map((a)=>{const x=D.arms[a].byGenre[g]||{};return '<td>'+pctf(x.gold)+' · '+pctf(x.teal)+'</td><td>'+n1(x.sat)+' · '+n1(x.faceLuma)+'</td><td>'+pctf(x.bottomBlack)+'</td><td>'+(x.flagged??'—')+' / '+(x.n??'—')+'</td>'}).join('')+'</tr>'}
cmp+='</table><div class="sub">주의 기준: '+Object.values(D.flagRules).map(esc).join(' · ')+'. 숫자는 그림 전체(1024×1536) 평균 · 얼굴은 검출 상자 안 평균.</div>';
document.getElementById('cmp').innerHTML=cmp;
const lastArm=ARMS[ARMS.length-1];
const failRuns=D.cases.flatMap((c)=>c.runs.filter((r)=>r.arm===lastArm&&r.status==='ok'&&r.flags.length).map((r)=>({c,r})));
document.getElementById('failSum').textContent=lastArm+' '+D.arm[lastArm].split(' — ')[0]+' — 주의 표시가 붙은 그림 '+failRuns.length+'장 / '+D.arms[lastArm].ok+'장(그림을 누르면 그 조건으로 간다)';
document.getElementById('fails').innerHTML='<div class="fgrid">'+failRuns.map(({c,r})=>'<a class="fitem" href="#'+c.caseId+'"><img loading="lazy" src="'+r.image+'" alt=""><div class="cap"><b>'+esc(D.genre[c.genre])+' · '+(c.mode==='group'?'단체':'혼자')+' · '+D.level[c.difficulty]+'</b> '+c.photoId+'<br>'+r.flags.map((f)=>'<span class="b WARN">'+esc(f.t)+'</span>').join(' ')+'</div></a>').join('')+'</div>';
for(const [k,v] of Object.entries(D.genre))fGenre.insertAdjacentHTML('beforeend','<option value="'+k+'">'+esc(v)+'</option>');
for(const p of Object.values(D.photos))fPhoto.insertAdjacentHTML('beforeend','<option value="'+p.id+'">'+p.id+' '+esc(p.condition)+'</option>');
const CHECK_NAMES={file:'파일',count:'인원(검출)',edge:'가장자리',position:'얼굴 자리',bottom:'아래 1/3',text:'글자',designBox:'디자인 주인공 상자',archBand:'아치 얼굴 띠'};
function faceTile(src,imgW,imgH,b,cap,list,idx){ // b = 정규화 [x,y,w,h]
  const m=0.25,x=Math.max(0,b[0]-b[2]*m),y=Math.max(0,b[1]-b[3]*m),w=Math.min(1-x,b[2]*(1+2*m)),h=Math.min(1-y,b[3]*(1+2*m));
  const th=120,tw=Math.round(th*(w*imgW)/(h*imgH));
  return '<div class="face" data-lb="'+idx+'" title="'+esc(cap)+'" style="width:'+tw+'px;background-image:url(\\''+src+'\\');background-size:'+(tw/w).toFixed(1)+'px '+(th/h).toFixed(1)+'px;background-position:'+(-x*tw/w).toFixed(1)+'px '+(-y*th/h).toFixed(1)+'px"></div>';
}
function render(){
  const g=fGenre.value,mo=fMode.value,lv=fLevel.value,ph=fPhoto.value,ck=fCheck.value,ar=fArm.value,fl=fFlag.value;
  const list=D.cases.filter((c)=>(!g||c.genre===g)&&(!mo||c.mode===mo)&&(!lv||c.difficulty===lv)&&(!ph||c.photoId===ph)&&(!ar||c.runs.some((r)=>r.arm===ar))&&(!fl||c.runs.some((r)=>r.flags.some((x)=>x.k===fl)))
    &&(!ck||c.runs.some((r)=>r.checks&&(ck==='FAIL'?r.checks.overall==='FAIL':r.checks.overall!=='PASS'))));
  document.getElementById('count').textContent=list.length+'개 조건';
  const box=document.getElementById('list');
  if(!list.length){box.innerHTML='<div class="empty">조건에 맞는 결과가 없다</div>';return}
  box.innerHTML=list.map((c)=>card(c)).join('');
  bind(list);
}
function card(c){
  const p=D.photos[c.photoId];
  let h='<section class="case" id="'+c.caseId+'"><h2>'+esc(D.genre[c.genre])+' · '+(c.mode==='group'?'단체':'혼자')+' · '+D.level[c.difficulty]+' — '+p.id+' '+esc(p.condition)+'</h2>';
  h+='<div class="story">제목 «'+esc(c.title)+'» · 문구 «'+esc(c.tagline)+'» · 기대 인원 '+p.people+'명'+(p.note?' · '+esc(p.note):'')+'</div><div class="row">';
  h+='<figure class="in"><img data-k="in" src="'+p.input+'" alt="입력"><figcaption><span class="armname">원본(입력)</span><br>웹캠 재현 1024×768 · 거울 · JPEG 0.85<br>원본 <a href="'+p.original+'" target="_blank">Pexels '+p.source.pexelsId+'</a> · '+esc(p.source.creator)+'</figcaption></figure>';
  for(const r of c.runs){
    const pk=D.picks&&D.picks[c.caseId];const picked=!!(pk&&pk.arms.includes(r.arm));
    h+='<figure class="arm'+(picked?' picked':'')+'" data-arm="'+r.arm+'">';
    if(r.status==='ok')h+='<div class="'+(r.dry?'dryflag':'')+'"><img data-k="'+r.arm+'" src="'+r.image+'" alt="'+r.arm+'"></div>';
    else h+='<div class="miss">'+r.arm+' — '+esc(r.status==='budget-skip'?'예산 상한으로 호출하지 않음':r.status==='billing-skip'?'잔액 · 지출 한도 오류 뒤라 호출하지 않음':r.status==='billing-stop'?'잔액 · 지출 한도 오류(429 '+(r.error?.code||'')+')':r.status==='not-run'?'아직 실행 안 함':'오류: '+(r.error?.message||''))+'</div>';
    const rej=r.attempts.filter((a)=>a.error);
    h+='<figcaption>'+(picked?'<span class="pick" title="'+esc(pk.note)+'">★ Bumm님 선택'+(pk.how==='설명'?' (설명으로 맞춤'+(pk.arms.length>1?' — '+pk.arms.join(' 또는 '):'')+')':'')+'</span><br>':'')+'<span class="armname">'+r.arm+' '+esc(D.arm[r.arm])+'</span>'+(r.dry?' <b style="color:var(--bad)">DRY</b>':'')+'<br>';
    if(r.status==='ok')h+=(r.ms/1000).toFixed(1)+'초 · $'+(r.cost??0).toFixed(4)+' · '+esc(r.model)+' '+esc(r.quality||'')+' · 지시문 '+esc(r.promptVersion)+' ('+r.promptChars+'자)<br>시도 '+r.attempts.length+(rej.length?' (거절 '+rej.map((a)=>a.error.status||'?').join(',')+' 뒤 재시도)':'')+(r.input.endsWith('-pre.jpg')?'<br>전처리: '+esc(p.preApplied.join(' · ')):'')+'<br>';
    if(r.checks)h+=badge(r.checks.overall,'검사')+'<br>'+Object.entries(CHECK_NAMES).map(([k,n])=>r.checks[k]?badge(r.checks[k].v,n):'').join('');
    if(r.color)h+='<br><span title="황금빛 · 푸른빛 화소 비율, 평균 채도, 얼굴 평균 밝기">황금빛 '+pctf(r.color.gold)+' · 푸른빛 '+pctf(r.color.teal)+' · 채도 '+n1(r.color.sat)+(r.color.faceLuma!=null?' · 얼굴 밝기 '+n1(r.color.faceLuma):'')+'</span>';
    if(r.flags&&r.flags.length)h+='<br>'+r.flags.map((x)=>'<span class="b WARN">주의 '+esc(x.t)+'</span>').join('');
    const req=r.attempts.map((a)=>a.request_id).filter(Boolean);if(req.length)h+='<br><span title="요청 ID">req '+esc(req[req.length-1])+'</span>';
    h+='</figcaption>';
    if(r.status==='ok')h+=scoreBox(c.caseId+'-'+r.arm);
    h+='</figure>';
  }
  h+='</div><div class="faces" data-faces="'+c.caseId+'"></div>';
  const withD=c.runs.filter((r)=>r.designs&&r.designs.length);
  if(withD.length)h+='<details><summary>디자인 8종에 입혀 보기</summary>'+withD.map((r)=>'<div class="sub" style="margin-top:6px">'+r.arm+' '+esc(D.arm[r.arm])+'</div><div class="dgrid">'+r.designs.map((d,i)=>'<div><img loading="lazy" data-k="'+r.arm+'-d'+i+'" src="'+d.src+'" alt=""><div class="cap">'+esc(d.label)+'</div></div>').join('')+'</div>').join('')+'</details>';
  return h+'</section>';
}
function scoreBox(k){
  const s=scores[k]||{};
  return '<div class="score" data-key="'+k+'">'+ITEMS.map(([id,n,t])=>'<div class="it"><span>'+n+'</span>'+(t==='PF'?['PASS','FAIL']:[1,2,3,4,5]).map((v)=>'<button data-i="'+id+'" data-v="'+v+'" class="'+(s[id]==v?'on':'')+'">'+(t==='PF'?(v==='PASS'?'P':'F'):v)+'</button>').join('')+'</div>').join('')+'<input type="text" data-i="memo" placeholder="메모" value="'+esc(s.memo||'')+'"></div>';
}
function bind(list){
  for(const c of list){
    const sec=document.getElementById(c.caseId),p=D.photos[c.photoId];
    const items=[{src:p.input,cap:c.caseId+' 원본(입력)'}];
    for(const r of c.runs)if(r.status==='ok')items.push({src:r.image,cap:c.caseId+' '+r.arm+' '+D.arm[r.arm]});
    sec.querySelectorAll('.row img').forEach((img,i)=>img.onclick=()=>openLb(items,i));
    // 얼굴 확대: 입력은 manifest 얼굴 상자(거울 반전), 결과는 검출 상자 — 검출이 없으면 «얼굴 자리»(가로 20~80% · 세로 5~45%)
    const faces=[],tiles=[];
    const inF=p.facesInFrame.map((b)=>[1-b[0]-b[2],b[1],b[2],b[3]]);
    let html='<div class="grp"><span class="lbl">원본</span>'+inF.map((b)=>{faces.push({src:p.input,cap:c.caseId+' 원본 얼굴'});return faceTile(p.input,1024,768,b,'원본',faces,faces.length-1)}).join('')+'</div>';
    for(const r of c.runs){if(r.status!=='ok')continue;
      const fs=(r.faces||[]).map((b)=>[b[0]/1024,b[1]/1536,b[2]/1024,b[3]/1536]);
      const use=fs.length?fs:[[0.2,0.05,0.6,0.4]];
      html+='<div class="grp"><span class="lbl">'+r.arm+(fs.length?'':' (검출 없음)')+'</span>'+use.map((b)=>{faces.push({src:r.image,cap:c.caseId+' '+r.arm+' 얼굴'});return faceTile(r.image,1024,1536,b,r.arm,faces,faces.length-1)}).join('')+'</div>';
    }
    const fbox=sec.querySelector('.faces');fbox.innerHTML=html;
    fbox.querySelectorAll('.face').forEach((el)=>el.onclick=()=>openLb(faces,+el.dataset.lb));
    const dimgs=[...sec.querySelectorAll('.dgrid img')];
    const ditems=dimgs.map((im)=>({src:im.getAttribute('src'),cap:c.caseId+' '+im.dataset.k}));
    dimgs.forEach((im,i)=>im.onclick=()=>openLb(ditems,i));
    sec.querySelectorAll('.score').forEach((box)=>{
      const k=box.dataset.key;
      box.querySelectorAll('button').forEach((b)=>b.onclick=()=>{const s=scores[k]||(scores[k]={});const v=isNaN(+b.dataset.v)?b.dataset.v:+b.dataset.v;s[b.dataset.i]=s[b.dataset.i]===v?null:v;s.at=new Date().toISOString();save(scores);
        box.querySelectorAll('button[data-i="'+b.dataset.i+'"]').forEach((x)=>x.classList.toggle('on',s[b.dataset.i]==x.dataset.v));scoredText()});
      box.querySelector('input').onchange=(e)=>{const s=scores[k]||(scores[k]={});s.memo=e.target.value;s.at=new Date().toISOString();save(scores)};
    });
  }
}
document.getElementById('exp').onclick=()=>{const blob=new Blob([JSON.stringify({gallery:D.generatedAt,kind:D.kind,exportedAt:new Date().toISOString(),items:ITEMS.map(([k,n,t])=>({k,n,scale:t})),scores},null,1)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='poster-ai-human-scores.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
document.getElementById('impBtn').onclick=()=>document.getElementById('imp').click();
document.getElementById('imp').onchange=async(e)=>{const f=e.target.files[0];if(!f)return;const j=JSON.parse(await f.text());scores={...scores,...(j.scores||{})};save(scores);render();scoredText()};
for(const id of ['fGenre','fMode','fLevel','fPhoto','fCheck','fArm','fFlag'])document.getElementById(id).onchange=render;
render();scoredText();`;

fs.writeFileSync(path.join(outDir, 'poster-ai-quality-gallery.html'), html('AI 품질 A/B 갤러리', 'Poster Studio 실제 사진 A/B — 원본 · 기존 · 개선 나란히', galleryBody, galleryScript));

// ───── 디자인 호환성 ─────
const compatBody = `
<header>
  <h1>Poster Studio 디자인 8종 호환성</h1>
  <div class="sub">같은 생성 그림에 앱의 디자인 8종(src/poster.ts · src/templates.ts — 화면과 같은 코드)을 실제로 입혔다. 이름 · 단체 이름은 앱 빈칸 기본값(김인키 · 우리들).</div>
  <div id="kind" style="margin-top:8px"></div>
  <p class="sub">디자인 계약(자동 검사): <b>주인공 상자</b> — 얼굴 상자가 그림의 가로 16~84%(혼자) · 4~96%(단체), 세로 5~67% 안(시네마 · 에디토리얼 · 컬러 블록 · 필름스트립 · 폴라로이드 · 타이포그래피가 이 상자를 지킨다).
  <b>아치 얼굴 띠</b> — 가로 30~70%(혼자) · 8~92%(단체), 세로 8~35% 안(아치 프레임이 이 띠를 곡선 안에 넣는다). 밖이면 그 디자인에서 얼굴이 작아지거나 곡선 · 흐린 띠에 걸릴 수 있다(WARN — 사람 확인).</p>
  <div class="tiles" id="tiles"></div>
</header>
<main id="list"></main>`;
const compatScript = `
document.getElementById('kind').innerHTML=D.dry?'<span class="kind dry">⚠ 드라이런(가짜) 그림이 섞여 있다 — 실제 API 생성 결과가 아니다</span>':'<span class="kind real">실제 API 생성 결과</span>';
const rate=(arm,mode,k)=>{const rs=D.cases.filter((c)=>c.mode===mode).flatMap((c)=>c.runs.filter((r)=>r.arm===arm&&r.status==='ok'&&r.checks));if(!rs.length)return '—';const n=rs.filter((r)=>r.checks[k]?.v==='PASS').length;return n+' / '+rs.length};
document.getElementById('tiles').innerHTML=Object.keys(D.arms).map((a)=>'<div class="tile"><b>'+a+' · '+esc(D.arm[a])+'</b><div class="sub">주인공 상자 PASS — 혼자 '+rate(a,'solo','designBox')+' · 단체 '+rate(a,'group','designBox')+'</div><div class="sub">아치 얼굴 띠 PASS — 혼자 '+rate(a,'solo','archBand')+' · 단체 '+rate(a,'group','archBand')+'</div><div class="sub">가장자리 잘림 FAIL — '+D.cases.flatMap((c)=>c.runs.filter((r)=>r.arm===a&&r.checks?.edge?.v==='FAIL')).length+'</div></div>').join('');
const REP=['sf-solo-easy','hero-solo-hard','fantasy-group-easy','music-group-hard'];
let h='<h2 style="margin-top:18px">대표 조건 — 디자인마다 '+Object.keys(D.arms).filter((a)=>a!=='C').join(' · ')+' 나란히</h2>';
const allItems=[];
for(const id of REP){const c=D.cases.find((x)=>x.caseId===id);if(!c)continue;const p=D.photos[c.photoId];
  const runs=c.runs.filter((r)=>r.status==='ok'&&r.designs.length&&r.arm!=='C');if(!runs.length)continue;
  h+='<section class="case"><h2>'+esc(D.genre[c.genre])+' · '+(c.mode==='group'?'단체':'혼자')+' · '+D.level[c.difficulty]+' — '+p.id+' '+esc(p.condition)+'</h2><div class="story">'+runs.map((r)=>r.arm+' '+badge(r.checks?.designBox?.v,'주인공 상자')+badge(r.checks?.archBand?.v,'아치 띠')).join(' · ')+'</div>';
  h+='<div style="display:grid;grid-template-columns:repeat('+runs.length+',minmax(0,300px));gap:10px">'+runs.map((r)=>'<div class="sub" style="font-weight:700">'+r.arm+' '+esc(D.arm[r.arm])+'</div>').join('');
  for(let i=0;i<8;i++)for(const r of runs){const d=r.designs[i];allItems.push({src:d.src,cap:id+' '+r.arm+' '+d.label});h+='<figure><div class="'+(r.dry?'dryflag':'')+'"><img data-i="'+(allItems.length-1)+'" src="'+d.src+'" style="height:auto;width:100%"></div><figcaption>'+esc(d.label)+'</figcaption></figure>'}
  h+='</div></section>';
}
const groups=D.cases.filter((c)=>c.mode==='group');
h+='<h2 style="margin-top:18px">단체 — 아치 프레임 전부('+['A','B','E','F'].filter((a)=>D.arms[a]).join(' · ')+'): 위쪽 흐린 띠 · 얼굴 잘림 · 인물 비율</h2><section class="case"><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px">';
for(const c of groups)for(const r of c.runs.filter((r)=>['A','B','E','F'].includes(r.arm)&&r.status==='ok'&&r.designs.length)){
  const d=r.designs.find((x)=>x.label==='아치 프레임')||r.designs[3];allItems.push({src:d.src,cap:c.caseId+' '+r.arm+' 아치 프레임'});
  h+='<figure><div class="'+(r.dry?'dryflag':'')+'"><img data-i="'+(allItems.length-1)+'" loading="lazy" src="'+d.src+'" style="height:auto;width:100%"></div><figcaption>'+c.caseId+' <b>'+r.arm+'</b> '+badge(r.checks?.archBand?.v,'아치 띠')+'</figcaption></figure>';
}
h+='</div></section>';
document.getElementById('list').innerHTML=h;
document.querySelectorAll('img[data-i]').forEach((im)=>im.onclick=()=>openLb(allItems,+im.dataset.i));`;
fs.writeFileSync(path.join(outDir, 'poster-template-compatibility.html'), html('디자인 8종 호환성', 'Poster Studio 생성 그림에 디자인 8종을 입힌 비교', compatBody, compatScript));

console.log('갤러리 · 호환성 페이지 · 결과 JSON —', calls.length, '호출,', Object.entries(arms).map(([a, s]) => `${a} ${s.ok}/${s.planned}`).join(' · '), anyDry ? '(DRY 포함)' : '');
