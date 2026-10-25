// AI 품질 A/B — 성공한 생성 그림마다 디자인 8종 합성 작업(compose.mjs 입력)을 만든다.
//   node scripts/qa/ai-ab/compose-jobs.mjs <plan.json> <ledger.jsonl> <그림 폴더> > jobs.json
// 이름 · 단체 이름은 앱의 빈칸 기본값(김인키 · 우리들, src/PosterStudio.tsx getMeta)을 쓴다 — 시험에 실명을 넣지 않는다.
import fs from 'node:fs';
import path from 'node:path';

const [planPath, ledgerPath, artDir] = process.argv.slice(2);
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
// 계획에 있는 조건의 성공 그림만 — ledger에는 출발 줄 · 실제 모드 한 바퀴(real-loop) 줄도 함께 있다
const rows = fs.readFileSync(ledgerPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  .filter((r) => r.status === 'ok' && r.file && plan.some((p) => p.caseId === r.caseId && p.arm === r.arm));
const jobs = rows.map((r) => {
  const c = plan.find((p) => p.caseId === r.caseId && p.arm === r.arm);
  return { id: `${r.caseId}-${r.arm}`, art: path.resolve(artDir, r.file), meta: { mode: c.mode, name: '김인키', groupName: '우리들', members: '', title: c.title, genre: c.genre, tagline: c.tagline } };
});
process.stdout.write(JSON.stringify(jobs, null, 1));
