import { expect, test } from "vitest";
import { TEMPLATES } from "../src/templates";
import { DESIGN_NAMES_EN, designNameEn } from "../src/designNames";

// 휴대폰 3단계 디자인 이름(영어, 2026-10-20) — 디자인마다 하나씩, 남는 이름 없이.
test("디자인 8종 모두 영어 이름이 있고, 목록에 없는 이름은 없다", () => {
  const labels = TEMPLATES.map((t) => t.label);
  expect(labels.length).toBe(8);
  for (const label of labels) expect(DESIGN_NAMES_EN[label], label).toMatch(/^[A-Z][A-Za-z ]+$/);
  expect(Object.keys(DESIGN_NAMES_EN).sort()).toEqual([...labels].sort());
  expect(designNameEn("시네마")).toBe("Cinema");
  expect(designNameEn("없는 이름")).toBe("없는 이름");
});
