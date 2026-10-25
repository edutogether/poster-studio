// AI 품질 A/B — 동시 실행(스트레스) 기록 정리(QA 전용). gen.mjs가 남긴 ledger의 출발 줄 · 끝 줄로 잰다.
//   node scripts/qa/ai-ab/stress.mjs <ledger.jsonl> --tag <이름> [--out stress.json] [--event-concurrency 4] [--event-per-min 6]
// - 한 건 걸린 시간 = 출발 줄 시각 → 끝 줄 시각(운영 코드의 재시도 · 기다림 포함). 성공한 건만으로 p50 · p95(최근접 순위).
// - 동시 건수 = 출발 ~ 끝 구간이 겹치는 수(최대 · 시간 가중 평균).
// - 분당 받아 준 장수 = 성공 끝 시각을 60초 창으로 훑은 최댓값과, 첫 출발 ~ 마지막 끝 전체의 평균.
// - 속도 한도(429, 잔액 오류 아님)는 엔진 실패로 세지 않고 «OpenAI 한도 관측»으로 따로 센다: 시도 수 · 걸린 건수 · 처음 걸린 건이 몇 번째로 출발했는지.
import fs from 'node:fs';

const [ledgerPath] = process.argv.slice(2);
const opt = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const tag = opt('tag', null);
const outPath = opt('out', null);
const eventConc = Number(opt('event-concurrency', '4')), eventPerMin = Number(opt('event-per-min', '6'));
if (!ledgerPath || !tag) { console.error('사용: stress.mjs <ledger.jsonl> --tag <이름> [--out stress.json]'); process.exit(1); }
const rows = fs.readFileSync(ledgerPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.tag === tag);
const starts = new Map(rows.filter((r) => r.type === 'start').map((r) => [r.key, r]));
const ends = rows.filter((r) => r.type !== 'start' && r.key && starts.has(r.key));
if (!ends.length) { console.error(`태그 ${tag}의 끝난 요청이 없다 — 잴 것이 없다`); process.exit(2); }
const iv = ends.map((r) => ({ r, s: Date.parse(starts.get(r.key).at), e: Date.parse(r.at) })).sort((a, b) => a.s - b.s);
const pct = (xs, p) => { if (!xs.length) return null; const a = [...xs].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.ceil((p / 100) * a.length) - 1)]; };
const sec = (ms) => (ms == null ? null : Math.round(ms / 100) / 10);
const durOf = (list) => list.map((x) => x.e - x.s);
const ok = iv.filter((x) => x.r.status === 'ok');
const byArm = {};
for (const arm of [...new Set(iv.map((x) => x.r.arm))].sort()) {
  const a = ok.filter((x) => x.r.arm === arm);
  byArm[arm] = { ok: a.length, all: iv.filter((x) => x.r.arm === arm).length, p50s: sec(pct(durOf(a), 50)), p95s: sec(pct(durOf(a), 95)), maxS: sec(Math.max(...durOf(a))) };
}
// 동시 건수
const evts = iv.flatMap((x) => [[x.s, 1], [x.e, -1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
let cur = 0, peak = 0, weighted = 0;
for (let i = 0; i < evts.length; i++) { cur += evts[i][1]; peak = Math.max(peak, cur); if (i + 1 < evts.length) weighted += cur * (evts[i + 1][0] - evts[i][0]); }
const t0 = iv[0].s, t1 = Math.max(...iv.map((x) => x.e));
// 분당 장수
const okEnds = ok.map((x) => x.e).sort((a, b) => a - b);
let peakPerMin = 0;
for (let i = 0, j = 0; i < okEnds.length; i++) { while (okEnds[i] - okEnds[j] >= 60_000) j++; peakPerMin = Math.max(peakPerMin, i - j + 1); }
const avgPerMin = okEnds.length / ((t1 - t0) / 60_000);
// 속도 한도
const rlCalls = iv.filter((x) => (x.r.rateLimitAttempts || 0) > 0);
const rlAttempts = iv.reduce((s, x) => s + (x.r.rateLimitAttempts || 0), 0);
const firstRl = rlCalls.length ? rlCalls.reduce((m, x) => { const t = Math.min(...x.r.attempts.filter((a) => a.rateLimit).map((a) => Date.parse(a.at))); return !m || t < m.t ? { t, x } : m; }, null) : null;
const result = {
  tag, calls: iv.length, statuses: iv.reduce((m, x) => ({ ...m, [x.r.status]: (m[x.r.status] || 0) + 1 }), {}),
  windowS: sec(t1 - t0), concurrencyPeak: peak, concurrencyAvg: Math.round((weighted / (t1 - t0)) * 10) / 10,
  durationOk: { p50s: sec(pct(durOf(ok), 50)), p95s: sec(pct(durOf(ok), 95)), maxS: sec(Math.max(...durOf(ok))) }, byArm,
  imagesPerMin: { peak60s: peakPerMin, average: Math.round(avgPerMin * 10) / 10 },
  rateLimit: {
    attempts: rlAttempts, callsHit: rlCalls.length, callsFailedByRateLimit: iv.filter((x) => x.r.status === 'rate-limit').length,
    firstHit: firstRl ? { startOrder: iv.indexOf(firstRl.x) + 1, caseId: firstRl.x.r.caseId, arm: firstRl.x.r.arm, afterS: sec(firstRl.t - t0) } : null,
  },
  // 출발했지만 끝 줄이 없는 요청(실행기가 죽은 경우) — 결과를 못 받았고 청구됐을 수 있다. 시간 통계에는 넣지 않는다.
  startsWithoutEnd: [...starts.keys()].filter((k) => !ends.some((r) => r.key === k)).length,
  otherErrors: iv.filter((x) => x.r.status === 'error').map((x) => ({ caseId: x.r.caseId, arm: x.r.arm, code: x.r.error?.code, message: x.r.error?.message?.slice(0, 120) })),
  event: { concurrency: eventConc, perMin: eventPerMin, concurrencyRatio: Math.round((peak / eventConc) * 10) / 10, perMinRatio: Math.round((peakPerMin / eventPerMin) * 10) / 10 },
};
if (outPath) fs.writeFileSync(outPath, JSON.stringify(result, null, 1));
console.log(JSON.stringify(result, null, 1));
