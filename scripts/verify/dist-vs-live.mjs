/* 빌드 폴더(dist/)의 파일을 배포된 주소에서 하나씩 받아 바이트(SHA-256)로 대조한다(2026-10-15).

     node scripts/verify/dist-vs-live.mjs <dist 폴더> <주소>      예: node scripts/verify/dist-vs-live.mjs dist https://poster.edutogether.kr

   GitHub 정지 중 로컬 배포(_docs/ops/runbook.md §9)에서 쓴다 — ① 배포 전: 마지막 push 커밋의 빌드가 지금 라이브와 같은지
   (= 이 컴퓨터의 빌드가 CI 산출물을 재현하는지), ② 되돌림 채널이 그 판을 담았는지, ③ 배포 뒤: 두 주소가 이번 빌드와 같은지.
   대조는 빌드 쪽 파일 목록 기준이다(라이브에만 있는 파일은 보지 않는다). dist가 비었으면 종료코드 1, 하나라도 다르면 2. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [dist, host] = process.argv.slice(2);
if (!dist || !/^https?:\/\/[^/]+$/.test(host || '')) {
  console.error('사용: node scripts/verify/dist-vs-live.mjs <dist 폴더> <주소(끝에 / 없이)>');
  process.exit(1);
}
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = fs.existsSync(dist) ? walk(dist).map((f) => path.relative(dist, f).split(path.sep).join('/')) : [];
if (!files.length) { console.error(`${dist}가 없거나 비었다 — 대조할 것이 0개면 통과가 아니라 실패다`); process.exit(1); }
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
let same = 0;
const diff = [];
for (const f of files) {
  const r = await fetch(`${host}/${encodeURI(f)}`, { headers: { 'cache-control': 'no-cache' } });
  const live = Buffer.from(await r.arrayBuffer());
  const local = fs.readFileSync(path.join(dist, f));
  if (r.status === 200 && sha(live) === sha(local)) same++;
  else diff.push(`${f} (${r.status}, 라이브 ${live.length}B / 빌드 ${local.length}B)`);
}
console.log(JSON.stringify({ 주소: host, 파일: files.length, 같음: same, 다름: diff.length, 다른것: diff.slice(0, 20) }, null, 1));
process.exit(diff.length ? 2 : 0);
