/* 설치판 판 번호를 커밋에서 센다(2026-11-03 Bumm님 F-5 «A» — 앱이 바뀐 커밋만 센다, 팀장 전달).

     node scripts/build/app-version.mjs [커밋 …]        → 그 커밋들에 닿는 모든 커밋(병합 커밋 빼고, 겹치면 한 번)으로 센 판 번호
     node scripts/build/app-version.mjs --selftest      → 11/3 결정 때 센 값(master 1c2049d + 설치판 82e0e76 = 커밋 682개 → 17.2.5)이 다시 나오는지

   셈: 큰 구조 변경은 첫째 자리, 기능(feat)은 둘째 자리, 고침(fix · 성능 · 정리 등)은 셋째 자리에 하나씩 더하고, 10이 되면 윗자리로 올린다.
   - 큰 구조 변경은 아래 BIG 세 커밋이다(8/25 첫 판 · 9/9 React 전환 · 10/27 설치판). 새로 생기면 Bumm님이 정한 뒤 여기 더한다.
   - 문서 · 시험 · CI · 잡일(docs · test · ci · chore · verify · mock)은 앱이 바뀌지 않아 세지 않는다. 종류가 안 붙은 8/26 영어 제목 · «docs · verify» 제목도 세지 않는다.
   - 모르는 종류가 나오면 멈춘다 — 어디에 셀지 정한 뒤 아래 표에 더한다(조용히 빠지지 않게).
   판 번호를 올리는 커밋(desktop/package.json)은 chore라 그 자신은 세지 않는다 — 판을 정한 뒤 문서 커밋이 더해져도 번호는 그대로다. */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BIG = ['b108f3b', 'd193f07', 'a4c3024'];   // 첫 판(8/25) · 화면을 React로(9/9) · Windows 설치판(10/27)
const MINOR = new Set(['feat']);
const PATCH = new Set(['fix', 'perf', 'refactor', 'style', 'revert', 'build', 'config', 'privacy', 'security', 'migrate', 'perf+fix']);
const SKIP = new Set(['docs', 'test', 'ci', 'chore', 'verify', 'mock']);

export function count(refs, cwd = ROOT) {
  const log = execFileSync('git', ['log', '--no-merges', '--format=%H%x09%s', ...refs], { cwd, encoding: 'utf8', maxBuffer: 1 << 28 });
  const tally = { commits: 0, big: 0, minor: 0, patch: 0, skipped: 0 };
  const unknown = [];
  for (const line of log.trim().split('\n')) {
    const [hash, subject = ''] = line.split('\t');
    tally.commits++;
    if (BIG.some((b) => hash.startsWith(b))) { tally.big++; continue; }
    const type = /^([a-z]+(?:\+[a-z]+)*)(?:\([^)]*\))*!?:/.exec(subject)?.[1];
    if (!type) { tally.skipped++; continue; }
    if (MINOR.has(type)) tally.minor++;
    else if (PATCH.has(type)) tally.patch++;
    else if (SKIP.has(type)) tally.skipped++;
    else unknown.push(`${hash.slice(0, 7)} ${subject}`);
  }
  if (tally.big !== BIG.length) throw new Error(`큰 구조 변경 커밋 ${BIG.length}개 가운데 ${tally.big}개만 닿는다 — 잘못된 커밋을 줬다`);
  if (unknown.length) throw new Error(`어디에 셀지 정하지 않은 종류:\n${unknown.join('\n')}`);
  let patch = tally.patch, minor = tally.minor, major = tally.big;
  minor += Math.floor(patch / 10); patch %= 10;
  major += Math.floor(minor / 10); minor %= 10;
  return { version: `${major}.${minor}.${patch}`, ...tally };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args[0] === '--selftest') {
    const got = count(['1c2049d', '82e0e76']);
    const ok = got.version === '17.2.5' && got.commits === 682 && got.minor === 123 && got.patch === 195;
    console.log(JSON.stringify(got), ok ? '통과' : '걸림 — 11/3 값(682개 · feat 123 · 고침 195 → 17.2.5)과 다르다');
    process.exit(ok ? 0 : 1);
  }
  console.log(JSON.stringify(count(args.length ? args : ['HEAD'])));
}
