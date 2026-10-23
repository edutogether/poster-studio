import { expect, test } from "vitest";
import { collectStrings } from "../scripts/fonts/charset.mjs";

// 화면 문구의 «!» «?» 앞은 한 칸 띄운다 — «완성 !» · «만들까요 ?»(Bumm님 2026-10-01, COMMON_STANDARDS §32).
// 10/23 팀장 확인에서 PC · 태블릿 2단계 «이 사진으로 만들까요?» · «표정과 구도가 마음에 드나요?»가 붙어 있었다(휴대폰 쪽 문구만 띄어 있었다).
// 화면 글자 추출기(폰트 서브셋 · fonts:check와 같은 것 — index.html · privacy.html · src의 문자열 · JSX 글 · JSON 대사 · CSS content)가 모은 것 중
// 한글이 든 한 줄짜리를 본다. 여러 줄짜리는 코드 조각(템플릿 문자열 사이)이라 뺀다.
const TIGHT = /[^\s(«“‘'"[]([?!])(?=$|[\s»”’'"<)\]])/;

test("규칙이 붙은 것은 잡고, 띄운 것 · 코드 기호는 안 잡는다", () => {
  for (const s of ["이 사진으로 만들까요?", "완성!", "드나요?</span>", "«등장!»"]) expect(s).toMatch(TIGHT);
  for (const s of ["이 사진으로 만들까요 ?", "완성 !", "a ? b : c", "x?.y", "!important", "?v=20261008", "!== 0"]) expect(s).not.toMatch(TIGHT);
});

test("화면 문구에 붙은 «!» «?»가 없다", () => {
  const all = collectStrings();
  expect(all.length).toBeGreaterThan(500);   // 추출기가 비면 이 시험은 빈 게이트다
  const bad = [...new Set(all.filter((s) => /[가-힣]/.test(s) && !s.includes("\n") && TIGHT.test(s)).map((s) => s.trim()))];
  expect(bad).toEqual([]);
});
