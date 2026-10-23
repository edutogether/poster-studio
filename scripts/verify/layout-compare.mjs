#!/usr/bin/env node
/* 배치 대조(2026-10-23 비율 기준 전환) — viewport-survey.mjs --snapshot이 남긴 «snap-갈래-크기-화면.json» 두 묶음을 견준다.

     node scripts/verify/layout-compare.mjs <전 폴더> <뒤 폴더> [--ignore 정규식] | --scaled-pc <기준 폴더> <크기별 폴더>

   화면마다 보이는 요소의 목록(DOM 자리)이 같고, 요소마다 자리 · 크기(0.5px 단위) · 글자 크기 · 줄 높이 · 글자색 · 바탕색이 같아야 같다.
   하나라도 다르면 화면마다 처음 몇 개를 적고 종료코드 1. 전 폴더의 화면이 뒤 폴더에 없어도 실패(빈 대조 금지).
   --ignore: 찍을 때마다 달라지는 요소(대기 영상 장면 글 등)를 key 정규식으로 뺀다 — 무엇을 뺐는지 출력에 적는다. */
import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
// --scaled-pc: 뒤 폴더의 PC 크기마다(snap-pc-WxH-화면) 전 폴더의 기준(snap-pc-2560x1440-화면)을 배율 k = min(W/2560, H/1440, 1)로 줄이고
// 가로 가운데로 옮긴 것과 견준다 — «PC는 2560 화면을 통째로 줄인 것»인지(자리 · 크기 1px 안, 글자 · 색은 그대로). 비율 기준 전환(10/23).
if (args.includes('--scaled-pc')) {
  const [ra, rb] = args.filter((x) => !x.startsWith('--'));
  const others = (await fs.readdir(rb)).filter((f) => /^snap-pc-\d+x\d+-.*\.json$/.test(f) && !f.startsWith('snap-pc-2560x1440-')).sort();
  if (!others.length) { console.error('뒤 폴더에 기준 밖 PC 크기 snap이 없습니다'); process.exit(2); }
  let badS = 0;
  for (const f of others) {
    const [, w, h, screen] = f.match(/^snap-pc-(\d+)x(\d+)-(.*)\.json$/);
    const ref = JSON.parse(await fs.readFile(path.join(ra, `snap-pc-2560x1440-${screen}.json`), 'utf8'));
    const B = JSON.parse(await fs.readFile(path.join(rb, f), 'utf8'));
    const k = Math.min(w / 2560, h / 1440, 1), ox = (w - 2560 * k) / 2, diffs = [];
    const mb = new Map(B.els.map((e) => [e[0], e]));
    for (const e of ref.els) {
      const o = mb.get(e[0]);
      if (!o) { diffs.push(`없어짐 ${e[0]}`); continue; }
      const want = [e[1] * k + ox, e[2] * k, e[3] * k, e[4] * k];
      const i = want.findIndex((v, j) => Math.abs(v - o[j + 1]) > 1.01);
      if (i >= 0) diffs.push(`${e[0]} ${['x', 'y', '폭', '높이'][i]} 기대 ${want[i].toFixed(1)} · 실제 ${o[i + 1]}`);
    }
    if (diffs.length) { badS++; console.log(`❌ ${f}(×${k.toFixed(3)}): ${diffs.length}건`); for (const d of diffs.slice(0, 5)) console.log(`   ${d}`); }
    else console.log(`🟢 ${f}(×${k.toFixed(3)}): 요소 ${ref.els.length}개 모두 기준 × 배율`);
  }
  console.log(badS ? `❌ ${badS}/${others.length}` : `✅ ${others.length}화면 모두 기준을 통째로 줄인 모양`);
  process.exit(badS ? 1 : 0);
}
const ignoreAt = args.indexOf('--ignore');
const ignore = ignoreAt >= 0 ? new RegExp(args[ignoreAt + 1]) : null;
const [a, b] = args.filter((x, i) => !x.startsWith('--') && args[i - 1] !== '--ignore');
if (!a || !b) { console.error('사용법: node scripts/verify/layout-compare.mjs <전 폴더> <뒤 폴더> [--ignore 정규식]'); process.exit(2); }
const files = (await fs.readdir(a)).filter((f) => /^snap-.*\.json$/.test(f)).sort();
if (!files.length) { console.error(`전 폴더에 snap-*.json이 없습니다: ${a}`); process.exit(2); }
const NAMES = ['자리 x', '자리 y', '폭', '높이', '글자 크기', '줄 높이', '글자색', '바탕색'];
let bad = 0, ignored = 0;
for (const f of files) {
  let B;
  try { B = JSON.parse(await fs.readFile(path.join(b, f), 'utf8')); } catch { console.log(`❌ ${f}: 뒤 폴더에 없음`); bad++; continue; }
  const A = JSON.parse(await fs.readFile(path.join(a, f), 'utf8'));
  const diffs = [];
  if (A.w !== B.w || A.h !== B.h) diffs.push(`창 ${A.w}×${A.h} → ${B.w}×${B.h}`);
  if (A.docH !== B.docH) diffs.push(`문서 높이 ${A.docH} → ${B.docH}`);
  const keep = (els) => els.filter((e) => { if (ignore && ignore.test(e[0])) { ignored++; return false; } return true; });
  const ma = new Map(keep(A.els).map((e) => [e[0], e])), mb = new Map(keep(B.els).map((e) => [e[0], e]));
  for (const [k, ea] of ma) {
    const eb = mb.get(k);
    if (!eb) { diffs.push(`없어짐 ${k}`); continue; }
    for (let i = 1; i < ea.length; i++) if (ea[i] !== eb[i]) { diffs.push(`${k} ${NAMES[i - 1]} ${ea[i]} → ${eb[i]}`); break; }
  }
  for (const k of mb.keys()) if (!ma.has(k)) diffs.push(`새로 생김 ${k}`);
  if (diffs.length) { bad++; console.log(`❌ ${f}: ${diffs.length}건`); for (const d of diffs.slice(0, 6)) console.log(`   ${d}`); }
  else console.log(`🟢 ${f}: 요소 ${ma.size}개 같음`);
}
if (ignore) console.log(`(뺀 요소 ${ignored}개 — ${ignore})`);
console.log(bad ? `❌ 다른 화면 ${bad}개 / ${files.length}` : `✅ ${files.length}화면 모두 같음`);
process.exit(bad ? 1 : 0);
