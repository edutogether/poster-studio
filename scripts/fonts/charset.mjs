/* ────────────────────────────────────────────────────────────────────
   UI에 실제로 나오는 글자 집합을 소스에서 뽑는다. 폰트 서브셋(2026-09-09)의
   입력이자, CI가 "빠진 글자가 없는지" 검사할 때 쓰는 기준이다.

   🔴 왜 HTML만 훑으면 안 되는가
   글자가 하나라도 빠지면 화면에 두부(□)로 나온다. 그런데 이 앱의 문구는
   HTML에만 있지 않다 — 상태 표시줄 문구, 오류 메시지, 버튼 라벨 변경
   ("🔄 재생성 횟수 소진…"), 파일명, 장르 이름과 자동 추천 홍보문구가 전부
   **JS 안의 문자열**이다. 그래서 js도 함께 훑는다.

   ⚠ 캔버스에 그리는 글자는 여기 없어도 된다 — 아이가 입력하는 임의의 한글은
   애초에 미리 알 수 없고, 그쪽은 서브셋이 아니라 전체 폰트(PretendardFull)가
   맡는다. 여기 모으는 것은 **화면 UI에 고정으로 나오는 글자**뿐이다.
   ──────────────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** 화면에 글자로 나올 수 있는 곳을 전부 모은다. */
export function collectStrings() {
  const out = [];
  const push = (s) => { if (s) out.push(s); };

  /* 🔴 전환 브랜치는 파일 배치가 master와 다르다 — html이 저장소 루트에 있고
     화면 문구는 public/*.js가 아니라 src/*.ts(x) 안에 있다. master 경로를 그대로
     쓰면 **읽을 파일이 없어 글자 집합이 조용히 비어버리고**, 검사는 통과하는데
     화면에는 두부(□)가 나온다. 그래서 경로를 여기서 갈라 둔다. */
  for (const f of ['index.html', 'privacy.html']) {
    let t = fs.readFileSync(path.join(ROOT, f), 'utf8');
    t = t.replace(/<!--[\s\S]*?-->/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
    for (const m of t.matchAll(/>([^<>]+)</g)) push(m[1]);
    for (const a of ['placeholder', 'alt', 'title', 'aria-label', 'value', 'content']) {
      for (const m of t.matchAll(new RegExp(`${a}="([^"]*)"`, 'g'))) push(m[1]);
    }
  }

  const SRC = path.join(ROOT, 'src');
  const srcFiles = fs.readdirSync(SRC).filter((x) => x.endsWith('.ts') || x.endsWith('.tsx'));
  if (!srcFiles.length) throw new Error('src/에서 소스를 하나도 못 찾았습니다 — 경로가 틀리면 글자 집합이 비어 검사가 무의미해집니다.');
  for (const f of srcFiles) {
    let t = fs.readFileSync(path.join(SRC, f), 'utf8');
    t = t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
    // 따옴표 3종 모두 — 템플릿 리터럴 안의 고정 문구도 화면에 나온다.
    for (const m of t.matchAll(/'([^'\n\\]*)'|"([^"\n\\]*)"|`([^`\\]*)`/g)) {
      push(m[1]); push(m[2]); push(m[3]);
    }
  }
  return out;
}

/** 정렬된 고유 글자 문자열. 공백·제어문자는 뺀다(폰트에 필요 없다). */
export function charset() {
  const set = new Set();
  for (const s of collectStrings()) for (const ch of s) if (ch.codePointAt(0) > 32) set.add(ch);
  // 기본 라틴/숫자/구두점은 어차피 작으니 통째로 넣어 둔다 — 문구가 바뀌어도 잘 안 깨진다.
  for (let c = 0x21; c <= 0x7e; c++) set.add(String.fromCharCode(c));
  return [...set].sort().join('');
}

/* 직접 실행할 때만 파일을 쓴다. endsWith('charset.mjs')로 판정하면
   **check-charset.mjs도 그 조건에 걸려** import하는 순간 목록을 새로 써버리고,
   그러면 검사가 자기가 방금 쓴 파일과 비교하게 되어 **절대 실패하지 않는 빈 게이트**가
   된다(실제로 그렇게 만들었다가 잡았다). 파일 이름을 정확히 비교한다. */
if (path.basename(process.argv[1] || '') === 'charset.mjs') {
  const cs = charset();
  const outFile = path.join(ROOT, 'scripts/fonts/subset-charset.txt');
  fs.writeFileSync(outFile, cs, 'utf8');
  console.log(`글자 ${[...cs].length}자 → ${path.relative(ROOT, outFile)}`);
}
