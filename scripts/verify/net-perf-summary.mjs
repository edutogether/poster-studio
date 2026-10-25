#!/usr/bin/env node
/* net-perf.mjs 결과 여러 벌을 조건마다 묶어 p50 · p95를 낸다(2026-10-26).

     node scripts/verify/net-perf-summary.mjs <결과 상위 폴더> [--json <출력>]

   상위 폴더 아래 폴더 이름이 «판-망-기기-번호»(예: before-slow4g-pc-03)인 net-perf.json을 모은다.
   p50 · p95는 가까운 순위(nearest-rank) — 10회면 p95는 가장 큰 값이다. 표: 조건 · 횟수 · 1단계 쓸 수 있음 · 누른 때 → 포스터 ·
   응답 완료 → 포스터 · 받은 용량 · AI 대기 중(응답 완료 전에 시작한) 장면 가운데 영상이 재생된 장면 · 같은 파일 두 번 받기(합계). */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const top = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--json');
const jsonAt = args.indexOf('--json');
if (!top) { console.error('사용: net-perf-summary.mjs <결과 상위 폴더> [--json <출력>]'); process.exit(2); }
const q = (xs, p) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] : null; };
const groups = new Map();
for (const d of fs.readdirSync(top)) {
  const f = path.join(top, d, 'net-perf.json');
  if (!fs.existsSync(f)) continue;
  const m = d.match(/^(.+)-(\d+)$/); if (!m) continue;
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const g of j.gens || []) {
    const visit = g.label.startsWith('재방문') ? '재방문' : '첫 방문';
    const row = j.rows.find((r) => r.name === visit);
    const key = `${m[1]} · ${visit}`;
    const a = groups.get(key) || { key, n: 0, ready: [], shown: [], after: [], answered: [], bytes: [], scenes: 0, videoScenes: 0, waitScenes: 0, waitVideoScenes: 0, dup: 0 };
    a.n++; a.ready.push(row?.ready); a.shown.push(g.shownMs); a.after.push(g.afterAnswerMs); a.answered.push(g.answeredMs); a.bytes.push(g.bytes);
    a.scenes += g.scenes; a.videoScenes += g.videoScenes; a.waitScenes += g.waitScenes ?? 0; a.waitVideoScenes += g.waitVideoScenes ?? 0; a.dup += g.duplicates.length;
    groups.set(key, a);
  }
}
const s = (ms) => (ms == null ? '—' : (ms / 1000).toFixed(1));
const mb = (b) => (b == null ? '—' : (b / 1048576).toFixed(1));
const rows = [...groups.values()].sort((a, b) => a.key.localeCompare(b.key, 'ko'));
console.log('| 조건 | 횟수 | 1단계 p50/p95(초) | 누른 때→포스터 p50/p95(초) | 응답 완료→포스터 p50/p95(초) | 받은 용량 p50/p95(MB) | AI 대기 중 영상 재생 장면 | 두 번 받기 |');
console.log('|---|---|---|---|---|---|---|---|');
for (const a of rows) console.log(`| ${a.key} | ${a.n} | ${s(q(a.ready, 0.5))}/${s(q(a.ready, 0.95))} | ${s(q(a.shown, 0.5))}/${s(q(a.shown, 0.95))} | ${s(q(a.after, 0.5))}/${s(q(a.after, 0.95))} | ${mb(q(a.bytes, 0.5))}/${mb(q(a.bytes, 0.95))} | ${a.waitVideoScenes}/${a.waitScenes} | ${a.dup} |`);
if (jsonAt >= 0) fs.writeFileSync(args[jsonAt + 1], JSON.stringify(rows.map((a) => ({ ...a, p: { ready: [q(a.ready, 0.5), q(a.ready, 0.95)], shown: [q(a.shown, 0.5), q(a.shown, 0.95)], after: [q(a.after, 0.5), q(a.after, 0.95)], bytes: [q(a.bytes, 0.5), q(a.bytes, 0.95)] } })), null, 1));
