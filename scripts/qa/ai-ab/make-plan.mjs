// AI 품질 A/B 시험 계획 — 장르 8 × 혼자/단체 × 촬영 난이도 3 = 48조건, 조건마다 A(운영) · B(개선) 같은 사진.
//   node scripts/qa/ai-ab/make-plan.mjs [--compact] > plan.json
// 난이도마다 사진 4장 → 장르 i는 그 난이도의 사진 i % 4 (사진 한 장이 두 장르에 쓰인다).
// C(개선 지시문 + 전처리 입력) 8건 · D(개선 지시문 + high) 4건은 같은 조건 id로 B와 바로 견준다.
const GENRES = ['sf', 'fantasy', 'animation', 'hero', 'mystery', 'director', 'sports', 'music'];
// 같은 장르는 A · B · C · D가 같은 제목 · 홍보 문구를 쓴다(홍보 문구는 앱의 장르 추천 첫 줄 — src/constants.ts).
const STORY = {
  sf: ['별빛 탐험대', '우주 너머, 미지의 세계로'],
  fantasy: ['마법의 문', '마법의 문이 열린다'],
  animation: ['구름 위 모험', '오늘, 가장 신나는 모험'],
  hero: ['우리 동네 영웅', '세상을 지키는 작은 영웅'],
  mystery: ['사라진 열쇠', '단 하나의 단서'],
  director: ['나의 첫 영화', '카메라 뒤, 또 하나의 주인공'],
  sports: ['마지막 한 골', '포기하지 않는 한, 끝이 아니다'],
  music: ['무대 위의 별', '오늘 밤, 무대의 주인공'],
};
const PHOTOS = {
  solo: { easy: ['S01', 'S03', 'S04', 'S07'], medium: ['S02', 'S05', 'S06', 'S11'], hard: ['S08', 'S09', 'S10', 'S12'] },
  group: { easy: ['G01', 'G02', 'G03', 'G06'], medium: ['G04', 'G09', 'G11', 'G12'], hard: ['G05', 'G07', 'G08', 'G10'] },
};
const cases = [];
const push = (genre, mode, difficulty, photoId) => {
  const base = { caseId: `${genre}-${mode}-${difficulty}`, photoId, mode, genre, difficulty, title: STORY[genre][0], tagline: STORY[genre][1] };
  cases.push({ ...base, arm: 'A', input: `${photoId}.jpg` }, { ...base, arm: 'B', input: `${photoId}.jpg` });
};
// --compact(2026-10-25, 크레딧 잔액 $5.06): 사진 24장을 한 번씩만 = 24조건(48호출). 난이도마다 장르 8개가 혼자 · 단체를 번갈아
// 혼자 4 · 단체 4가 되고, 장르마다 3조건(혼자 · 단체 둘 다 포함)이 된다. C는 어려운 사진 4건, D는 혼자 쉬움 · 단체 어려움 1건씩.
const compact = process.argv.includes('--compact');
if (compact) {
  const used = {};
  ['easy', 'medium', 'hard'].forEach((difficulty, d) => GENRES.forEach((genre, i) => {
    const mode = (i + d) % 2 ? 'group' : 'solo', k = mode + difficulty;
    used[k] = (used[k] || 0) + 1;
    push(genre, mode, difficulty, PHOTOS[mode][difficulty][used[k] - 1]);
  }));
} else {
  for (const mode of ['solo', 'group']) for (const difficulty of ['easy', 'medium', 'hard']) GENRES.forEach((genre, i) => push(genre, mode, difficulty, PHOTOS[mode][difficulty][i % 4]));
}
// --plus(2026-10-25 저녁, Bumm님 눈 채점 뒤): 기존+(v1plus) 갈래 E만 · --plus2(Bumm님 «제일 마음에 드는 것» 뒤): 기존+2(v1plus2) 갈래 F만 —
// A와 같은 48조건 · 같은 입력 · 같은 제목. 지시문만 바뀐다. 처음 두 건이 혼자 1 · 단체 1이 되게 혼자 · 단체를 번갈아 놓는다(시범 두 건으로 둘 다 본다).
// (10/25 손질판 v1plus3 · 갈래 G는 동결 때 지웠다 — Bumm님이 21칸 중 0칸을 고르셨다. 그 회차 계획은 기존플러스3-손질/run/plan.json에 남아 있다.)
const PLUS = process.argv.includes('--plus2') ? { arm: 'F', variant: 'v1plus2' } : process.argv.includes('--plus') ? { arm: 'E', variant: 'v1plus' } : null;
if (PLUS) {
  const a = cases.filter((c) => c.arm === 'A');
  const solo = a.filter((c) => c.mode === 'solo'), group = a.filter((c) => c.mode === 'group');
  // 혼자 · 단체 수가 다를 수 있다(손질 7칸은 혼자 9 · 단체 12) — 긴 쪽 끝까지 번갈아 놓는다
  const e = Array.from({ length: Math.max(solo.length, group.length) }, (_, i) => [solo[i], group[i]]).flat().filter(Boolean).map((c) => ({ ...c, ...PLUS }));
  process.stdout.write(JSON.stringify(e, null, 1));
  process.exit(0);
}
// C: 어려운 촬영(어두움 · 역광 · 작은 얼굴 · 복잡한 배경 · 조도 낮은 단체 · 넓은 줄 · 가장자리 · 복잡한 배경 단체) — 각 사진의 첫 장르 조건
const firstCase = (photoId) => cases.find((c) => c.photoId === photoId && c.arm === 'B');
for (const p of compact ? ['S08', 'S09', 'G05', 'G10'] : ['S08', 'S09', 'S10', 'S12', 'G05', 'G07', 'G08', 'G10']) { const b = firstCase(p); cases.push({ ...b, arm: 'C', input: `${p}-pre.jpg` }); }
// D: high — 혼자 쉬움 · 어려움, 단체 쉬움 · 어려움 하나씩(--compact면 혼자 쉬움 · 단체 어려움 첫 조건)
const dIds = compact
  ? [cases.find((c) => c.mode === 'solo' && c.difficulty === 'easy').caseId, cases.find((c) => c.mode === 'group' && c.difficulty === 'hard').caseId]
  : ['sf-solo-easy', 'hero-solo-hard', 'fantasy-group-easy', 'music-group-hard'];
for (const id of dIds) { const b = cases.find((c) => c.caseId === id && c.arm === 'B'); cases.push({ ...b, arm: 'D', input: b.input }); }
process.stdout.write(JSON.stringify(cases, null, 1));
