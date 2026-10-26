#!/usr/bin/env node
/* net-perf.mjs 결과 여러 벌을 조건마다 묶어 p50 · p95를 낸다(2026-10-26).

     node scripts/verify/net-perf-summary.mjs <결과 상위 폴더> [--json <출력>]

   상위 폴더 아래 폴더 이름이 «판-망-기기-번호»(예: before-slow4g-pc-03)인 net-perf.json을 모은다.
   p50 · p95는 가까운 순위(nearest-rank) — 10회면 p95는 가장 큰 값이다. 표: 조건 · 횟수 · 1단계 쓸 수 있음 · 누른 때 → 포스터 ·
   응답 완료 → 포스터 · 받은 용량 · AI 대기 중(응답 완료 전에 시작한) 장면 가운데 영상이 재생된 장면 · 같은 파일 두 번 받기(합계).
   2026-10-26: 장면 기록이 있는 결과(net-perf.mjs 10/26 이후)면 정상 재생 장면(영상 재생 + 재생 중 멈춤 0회) · 재생 중 멈춤 횟수 ·
   멈춘 시간 · 영상 두 번 받기 열과, 영상(1~12번)별 표(판 · 망 · 방문마다 PC · 휴대폰을 합쳐: 나온 장면 · 영상 재생 · 정상 재생 ·
   멈춤 · 시작까지 걸린 시간 p50 · 끝까지 재생)를 더한다. 영상별 표는 --json 출력과 «--videos <망>» 표(마크다운)로 낸다.
   시간 안에 못 끝난 실행은 «실패»로 세고 백분위에서 가장 큰 값(∞)으로 둔다 — 빼면 실패가 있어도 p95가 작아진다(10/26 종합감사).
   결과가 하나도 없거나, 결과 파일이 없는 실행 폴더 · 생성 기록이 빈 실행 · 실패가 하나라도 있으면 종료코드 1. */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const top = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--json' && args[i - 1] !== '--videos');
const jsonAt = args.indexOf('--json');
const videosAt = args.indexOf('--videos');
const perVideo = new Map();   // «판 · 망 · 방문» → 번호 → 기록
if (!top) { console.error('사용: net-perf-summary.mjs <결과 상위 폴더> [--json <출력>]'); process.exit(2); }
const q = (xs, p) => { const s = xs.map((x) => (x == null ? Infinity : x)).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] : null; };
const groups = new Map();
const missing = [];
const noGens = [];
for (const d of fs.readdirSync(top)) {
  const f = path.join(top, d, 'net-perf.json');
  const m = d.match(/^(.+)-(\d+)$/); if (!m || !fs.statSync(path.join(top, d)).isDirectory()) continue;
  if (!fs.existsSync(f)) { missing.push(d); continue; }
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  // --real 없이 잰 실행은 생성 기록이 비어 있다 — 건너뛰면 횟수에도 실패에도 안 잡혀 조건마다 «10회»가 사실보다 적게 나간다(10/26 재채점)
  if (!(j.gens || []).length) { noGens.push(d); continue; }
  for (const g of j.gens) {
    const visit = g.label.startsWith('재방문') ? '재방문' : '첫 방문';
    const row = j.rows.find((r) => r.name === visit);
    const key = `${m[1]} · ${visit}`;
    const a = groups.get(key) || { key, n: 0, ready: [], shown: [], after: [], answered: [], bytes: [], scenes: 0, videoScenes: 0, waitScenes: 0, waitVideoScenes: 0, dup: 0, fail: 0,
      logged: 0, smooth: 0, waitSmooth: 0, rebuffers: 0, stallMs: 0, videoDup: 0 };
    a.n++; a.ready.push(row?.ready); a.shown.push(g.shownMs); a.after.push(g.afterAnswerMs); a.answered.push(g.answeredMs); a.bytes.push(g.bytes);
    a.scenes += g.scenes; a.videoScenes += g.videoScenes; a.waitScenes += g.waitScenes ?? 0; a.waitVideoScenes += g.waitVideoScenes ?? 0; a.dup += g.duplicates.length;
    if (g.shownMs == null || row?.ready == null) a.fail++;
    if (g.smoothScenes != null) {
      a.logged++; a.smooth += g.smoothScenes; a.waitSmooth += g.waitSmoothScenes; a.rebuffers += g.rebuffers; a.stallMs += g.stallMs; a.videoDup += g.videoDuplicates.length;
      const vkey = `${m[1].replace(/-(pc|phone)$/, '')} · ${visit}`;
      const byId = perVideo.get(vkey) || new Map(); perVideo.set(vkey, byId);
      for (const sc of g.sceneLog) {
        if (!sc.id) continue;
        const v = byId.get(sc.id) || { id: sc.id, shown: 0, played: 0, smooth: 0, rebuffers: 0, stallMs: 0, start: [], ended: 0 };
        v.shown++; if (sc.video) { v.played++; if (!sc.rebuffers) v.smooth++; } v.rebuffers += sc.rebuffers; v.stallMs += sc.stallMs; v.ended += sc.ended ? 1 : 0;
        if (sc.startMs != null) v.start.push(sc.startMs);
        byId.set(sc.id, v);
      }
    }
    groups.set(key, a);
  }
}
const s = (ms) => (ms == null ? '—' : ms === Infinity ? '실패' : (ms / 1000).toFixed(1));
const mb = (b) => (b == null ? '—' : (b / 1048576).toFixed(1));
const rows = [...groups.values()].sort((a, b) => a.key.localeCompare(b.key, 'ko'));
const logged = rows.some((a) => a.logged);
console.log('| 조건 | 횟수 | 1단계 p50/p95(초) | 누른 때→포스터 p50/p95(초) | 응답 완료→포스터 p50/p95(초) | 받은 용량 p50/p95(MB) | AI 대기 중 영상 재생 장면 | 두 번 받기 | 실패 |' + (logged ? ' AI 대기 중 정상 재생 장면 | 전체 정상 재생 장면 | 재생 중 멈춤(회 · 초) | 영상 두 번 받기 |' : ''));
console.log('|---|---|---|---|---|---|---|---|---|' + (logged ? '---|---|---|---|' : ''));
for (const a of rows) console.log(`| ${a.key} | ${a.n} | ${s(q(a.ready, 0.5))}/${s(q(a.ready, 0.95))} | ${s(q(a.shown, 0.5))}/${s(q(a.shown, 0.95))} | ${s(q(a.after, 0.5))}/${s(q(a.after, 0.95))} | ${mb(q(a.bytes, 0.5))}/${mb(q(a.bytes, 0.95))} | ${a.waitVideoScenes}/${a.waitScenes} | ${a.dup} | ${a.fail} |`
  + (logged ? (a.logged === a.n ? ` ${a.waitSmooth}/${a.waitScenes} | ${a.smooth}/${a.scenes} | ${a.rebuffers} · ${(a.stallMs / 1000).toFixed(1)} | ${a.videoDup} |` : ' — | — | — | — |') : ''));
const videoRows = [...perVideo].sort(([a], [b]) => a.localeCompare(b, 'ko')).map(([key, byId]) => ({ key, videos: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)).map((v) => ({ ...v, startP50: q(v.start, 0.5) })) }));
if (videosAt >= 0) for (const g of videoRows.filter((r) => r.key.includes(args[videosAt + 1]))) {
  console.log(`\n${g.key} — 영상별(PC · 휴대폰 합침)\n| 영상 | 나온 장면 | 영상 재생 | 정상 재생 | 재생 중 멈춤(회 · 초) | 시작까지 p50(초) | 끝까지 재생 |\n|---|---|---|---|---|---|---|`);
  for (const v of g.videos) console.log(`| ${v.id} | ${v.shown} | ${v.played} | ${v.smooth} | ${v.rebuffers} · ${(v.stallMs / 1000).toFixed(1)} | ${v.startP50 == null ? '—' : (v.startP50 / 1000).toFixed(2)} | ${v.ended} |`);
}
if (jsonAt >= 0) fs.writeFileSync(args[jsonAt + 1], JSON.stringify({ conditions: rows.map((a) => ({ ...a, p: { ready: [q(a.ready, 0.5), q(a.ready, 0.95)], shown: [q(a.shown, 0.5), q(a.shown, 0.95)], after: [q(a.after, 0.5), q(a.after, 0.95)], bytes: [q(a.bytes, 0.5), q(a.bytes, 0.95)] } })), videos: videoRows }, null, 1));
const failed = rows.reduce((n, a) => n + a.fail, 0);
if (!rows.length) { console.error('❌ 결과가 하나도 없다 — «판-망-기기-번호» 폴더의 net-perf.json(--real로 잰 것)을 찾지 못했다'); process.exit(1); }
if (missing.length || noGens.length || failed) {
  const list = (xs) => (xs.length ? ' (' + xs.slice(0, 5).join(', ') + ')' : '');
  console.error(`❌ 결과 파일이 없는 실행 ${missing.length}건${list(missing)} · 생성 기록이 빈 실행 ${noGens.length}건${list(noGens)} · 시간 안에 못 끝난 생성 ${failed}건`);
  process.exit(1);
}
