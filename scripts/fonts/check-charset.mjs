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
import { fileURLToPath } from 'node:url';
import { charset } from './charset.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FILE = path.join(ROOT, 'scripts/fonts/subset-charset.txt');

if (!fs.existsSync(FILE)) {
  console.error('scripts/fonts/subset-charset.txt가 없습니다. `npm run fonts:charset` 후 서브셋을 다시 만드세요.');
  process.exit(1);
}

const have = new Set(fs.readFileSync(FILE, 'utf8'));
const need = [...charset()];
const missing = need.filter((c) => !have.has(c));

if (missing.length) {
  console.error(`서브셋 폰트에 없는 글자 ${missing.length}자: ${missing.join('')}`);
  console.error('문구가 바뀌었습니다. `npm run fonts:charset` 후 서브셋을 다시 만들고 커밋하세요.');
  console.error('(안 고치면 그 글자가 화면에 □ 로 나옵니다.)');
  process.exit(1);
}
console.log(`서브셋 글자 검사 통과 — 필요한 ${need.length}자가 모두 들어 있습니다.`);
