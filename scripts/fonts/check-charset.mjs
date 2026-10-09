/* ────────────────────────────────────────────────────────────────────
   서브셋 폰트에 빠진 글자가 없는지 검사한다. CI에서 돈다.

   왜 필요한가: 행사 문구는 앞으로도 바뀐다. 문구에 새 글자가 들어왔는데
   서브셋을 다시 만들지 않으면 **화면에 두부(□)로 나온다** — 그것도 배포된
   뒤에야 눈으로 발견하게 된다. 그래서 소스에서 글자를 다시 뽑아
   `public/fonts/subset-charset.txt`와 대조하고, 빠진 글자가 있으면 실패한다.

   폰트 파일을 직접 파싱하지 않는 이유: 서브셋을 만들 때 이 txt를 입력으로
   썼으므로 둘이 같으면 폰트도 같은 글자를 담고 있다. Node만으로 검사할 수
   있어야 CI가 파이썬 없이 돈다.
   ──────────────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { charset } from './charset.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FILE = path.join(ROOT, 'scripts/fonts/subset-charset.txt');

if (!fs.existsSync(FILE)) {
  console.error('scripts/fonts/subset-charset.txt가 없습니다. `npm run fonts:charset` 후 서브셋을 다시 만드세요.');
  process.exit(1);
}

/* 🔴 빈 게이트 방지(COMMON_STANDARDS §21-1). 이 검사는 글자 목록(txt)만 대조하므로,
   **정작 서브셋 폰트 파일이 없어도 통과한다.** 그러면 CSS가 가리키는 파일이 404가 되어
   화면이 대체 글꼴로 떨어지는데 검사는 초록불이다. 파일이 실제로 있는지 먼저 본다. */
const SUBSET_DIR = path.join(ROOT, 'public/fonts/subset');
const WEIGHTS = ['Regular', 'Medium', 'SemiBold', 'Bold', 'ExtraBold'];
const missingFiles = WEIGHTS
  .map((w) => `Pretendard-${w}.woff2`)
  .filter((f) => {
    const p = path.join(SUBSET_DIR, f);
    return !fs.existsSync(p) || fs.statSync(p).size < 1024;
  });
if (missingFiles.length) {
  console.error(`서브셋 폰트 파일이 없거나 비어 있습니다: ${missingFiles.join(', ')}`);
  console.error('`npm run fonts:charset` 후 `python scripts/fonts/subset.py`로 다시 만드세요.');
  process.exit(1);
}

const have = new Set(fs.readFileSync(FILE, 'utf8'));
const need = [...charset()];
const missing = need.filter((c) => !have.has(c));

if (missing.length) {
  // 띄어쓰기처럼 눈에 안 보이는 글자는 코드로 적는다 — 빈칸으로 찍히면 무엇이 빠졌는지 알 수 없다.
  const shown = missing.map((c) => (/\s/.test(c) ? `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}(띄어쓰기)` : c));
  console.error(`서브셋 폰트에 없는 글자 ${missing.length}자: ${shown.join(' ')}`);
  console.error('문구가 바뀌었습니다. `npm run fonts:charset` 후 서브셋을 다시 만들고 커밋하세요.');
  console.error('(안 고치면 그 글자가 화면에 □ 로 나옵니다.)');
  process.exit(1);
}

/* 🔴 서브셋 주소의 판(?v=)이 지금 서브셋 내용과 맞는지 본다(2026-10-09).
   서브셋은 파일 이름이 고정이고 30일 캐시라(firebase.json의 woff2 규칙), 다시 만들어도 이미 받은 브라우저는
   **옛 파일을 30일 동안 그대로 쓴다** — 띄어쓰기를 넣은 날 실제로 그랬다. 그래서 모든 주소에 서브셋 내용에서 나온
   판을 붙이고, 서브셋을 다시 만들었는데 주소를 안 바꿨으면 여기서 실패한다(사람이 기억하는 게 아니라 검사가 잡는다). */
const digest = crypto.createHash('sha256');
for (const w of WEIGHTS) digest.update(fs.readFileSync(path.join(SUBSET_DIR, `Pretendard-${w}.woff2`)));
const VER = digest.digest('hex').slice(0, 10);
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const refFiles = [
  path.join(ROOT, 'index.html'), path.join(ROOT, 'privacy.html'),
  ...walk(path.join(ROOT, 'public/fonts')).filter((f) => f.endsWith('.css')),
  ...walk(path.join(ROOT, 'src')).filter((f) => /\.(css|ts|tsx)$/.test(f)),
];
const stale = []; let refs = 0;
for (const f of refFiles) {
  // 주소로 쓰인 자리만 센다 — 바로 뒤에 따옴표나 닫는 괄호가 온다(url('…'), url("…"), url(…), href="…").
  // 주석 속 파일 이름(뒤에 글자가 이어진다)은 주소가 아니다.
  const t = fs.readFileSync(f, 'utf8');
  for (const m of t.matchAll(/subset\/Pretendard-[A-Za-z]+\.woff2(\?v=[0-9a-f]+)?(?=['")])/g)) {
    refs++;
    if (m[1] !== `?v=${VER}`) stale.push(`${path.relative(ROOT, f)}: ${m[0]}`);
  }
}
if (!refs) {
  console.error('서브셋 글꼴 주소를 하나도 못 찾았습니다 — 찾는 자리가 틀리면 이 검사는 아무것도 지키지 못합니다.');
  process.exit(1);
}
if (stale.length) {
  console.error(`서브셋 글꼴 주소의 판이 지금 서브셋과 다릅니다(맞는 판: ?v=${VER}) — ${stale.length}곳:`);
  for (const s of stale) console.error(`  ${s}`);
  console.error('주소를 전부 위 판으로 바꾸세요. 안 바꾸면 이미 받은 브라우저가 옛 서브셋을 30일 동안 씁니다.');
  process.exit(1);
}
console.log(`서브셋 글자 검사 통과 — 필요한 ${need.length}자가 모두 들어 있습니다. 서브셋 주소 ${refs}곳 모두 판 ?v=${VER}.`);
