import { expect, test } from "vitest";
import { TEMPLATES } from "../src/templates";
import { DESIGN_NAMES, designName } from "../src/designNames";

// 3단계 디자인 이름(한글, 2026-10-23 Bumm님 «아이들 대상이라») — 디자인마다 하나씩, 남는 이름 없이.
test("디자인 8종 모두 한글 이름이 있고, 목록에 없는 이름은 없다", () => {
  const labels = TEMPLATES.map((t) => t.label);
  expect(labels.length).toBe(8);
  for (const label of labels) expect(DESIGN_NAMES[label], label).toMatch(/^[가-힣]+( [가-힣]+)?$/);
  expect(Object.keys(DESIGN_NAMES).sort()).toEqual([...labels].sort());
  // 10/23 Bumm님이 준 글자 그대로(띄어쓰기 — «필름 스트립»은 label «필름스트립»과 다르다)
  expect(labels.map((l) => DESIGN_NAMES[l])).toEqual(["시네마", "에디토리얼", "컬러 블록", "아치 프레임", "필름 스트립", "폴라로이드", "타이포그래피", "트립틱"]);
  expect(designName("필름스트립")).toBe("필름 스트립");
  expect(designName("없는 이름")).toBe("없는 이름");
});
