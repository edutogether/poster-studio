#!/usr/bin/env node
/* ────────────────────────────────────────────────────────────────────
   포스터 픽셀 지문 대조 — `poster-pixels-ui.js`가 뜬 두 결과를 비교한다.

     node scripts/verify/poster-pixels-compare.mjs <전.json> <후.json>

   🔴 왜 스크립트로 두는가 (COMMON_STANDARDS §21-2)
   2026-09-09 머지 검증 때 이 대조를 **그때그때 손으로 짠 한 줄**로 했다.
   그 코드는 두 배열을 zip해서 다른 것만 셌는데, **"20건 중"이 계산값이 아니라
   손으로 박아넣은 문자열**이었다. 한쪽이 비어 있었으면 zip이 아무것도 내놓지
   않아 **"20건 중 불일치 0건"이라고 찍혔을 것**이다 — 아무것도 안 보고 통과하는
   바로 그 형태다(다행히 실제로는 20개가 들어 있어 보고는 유효했다).

   그래서 이 파일이 지키는 것:
     1. 양쪽이 비어 있으면 **실패**한다. 0건은 통과가 아니다.
     2. 개수가 서로 다르면 **실패**한다. zip이 조용히 짧은 쪽에 맞추지 못하게.
     3. 케이스·판 이름으로 **짝이 맞는지** 확인한다. 어긋난 짝을 비교하면 무의미하다.
     4. 한쪽 지문이 전부 같은 값이면 **실패**한다. 도구가 고장나 상수를 뱉는 경우다.
     5. 개수는 **세어서** 출력한다. 어디에도 기대 개수를 박아넣지 않는다.

   "불일치 0건"이 증명이 되려면 **정말 0건인지, 아무것도 안 본 것인지**를
   구분할 수 있어야 한다. 위 다섯 가지가 그 구분이다.
   ──────────────────────────────────────────────────────────────────── */
import fs from 'node:fs';

const die = (msg) => { console.error(`❌ ${msg}`); process.exit(2); };

export function loadFingerprints(path) {
  if (!fs.existsSync(path)) die(`${path}가 없습니다.`);
  let d;
  try { d = JSON.parse(fs.readFileSync(path, 'utf8')); }
  catch (e) { die(`${path}를 JSON으로 읽지 못했습니다: ${e.message}`); }
  if (!Array.isArray(d)) die(`${path}가 배열이 아닙니다.`);
  if (d.length === 0) die(`${path}에 항목이 0개입니다 — 대조가 무의미합니다.`);
  for (const e of d) {
    if (!e || !e.케이스 || !e.판 || !e.지문) die(`${path}에 케이스·판·지문이 없는 항목이 있습니다: ${JSON.stringify(e)}`);
  }
  if (new Set(d.map((e) => e.지문)).size === 1) {
    die(`${path}의 지문이 전부 같은 값입니다 — 도구가 상수를 뱉고 있습니다.`);
  }
  return d;
}

export function comparePixels(before, after) {
  if (before.length !== after.length) {
    die(`항목 수가 다릅니다: ${before.length} vs ${after.length} — 같은 케이스 집합으로 떠야 비교가 성립합니다.`);
  }
  const misaligned = before
    .map((a, i) => [a, after[i]])
    .filter(([a, b]) => a.케이스 !== b.케이스 || a.판 !== b.판);
  if (misaligned.length) {
    die(`짝이 어긋났습니다(${misaligned.length}건). 첫 건: ${misaligned[0][0].케이스}/${misaligned[0][0].판} ↔ ${misaligned[0][1].케이스}/${misaligned[0][1].판}`);
  }
  return before
    .map((a, i) => [a, after[i]])
    .filter(([a, b]) => a.지문 !== b.지문)
    .map(([a, b]) => ({ 케이스: a.케이스, 판: a.판, 전: a.지문, 후: b.지문 }));
}

const invokedDirectly =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());

if (invokedDirectly) {
  const [bp, ap] = process.argv.slice(2);
  if (!bp || !ap) die('사용법: node scripts/verify/poster-pixels-compare.mjs <전.json> <후.json>');
  const before = loadFingerprints(bp);
  const after = loadFingerprints(ap);
  const diffs = comparePixels(before, after);

  const cases = [...new Set(before.map((e) => e.케이스))];
  console.log(`대조: ${bp} ↔ ${ap}`);
  console.log(`비교한 짝 ${before.length}쌍 (입력 ${cases.length}종 × 템플릿 ${before.length / cases.length}판)`);
  console.log(`서로 다른 지문 ${new Set(before.map((e) => e.지문)).size}종 / ${new Set(after.map((e) => e.지문)).size}종`);
  if (!diffs.length) {
    console.log(`\n✅ 불일치 0건 — ${before.length}쌍을 전부 비교한 결과입니다.`);
    process.exit(0);
  }
  console.log(`\n❌ 불일치 ${diffs.length}건:`);
  for (const d of diffs) console.log(`   ${d.케이스} / ${d.판}\n      전: ${d.전}\n      후: ${d.후}`);
  process.exit(1);
}
