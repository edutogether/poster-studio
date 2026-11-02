// 휴대폰 가로 안내(2026-11-02 해상도 점검): 휴대폰은 폭을 390에 맞춰 가로로 들면 보이는 높이가 180~219px뿐이라 화면이 깨졌다 — 세로로 돌려 달라는 안내로 덮는다.
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const css = readFileSync(new URL("../src/studio.css", import.meta.url), "utf8");
const view = readFileSync(new URL("../src/studio/StudioView.tsx", import.meta.url), "utf8");

test("안내는 평소 숨기고, 휴대폰 갈래 · 가로일 때만 화면 전체를 덮는다", () => {
  expect(css).toContain(".rotate-notice { display: none; }");
  const landscape = css.slice(css.lastIndexOf("@media (orientation: landscape) {"));
  expect(landscape).toContain('html[data-device="phone"] .rotate-notice {');
  expect(landscape).toMatch(/display: flex; position: fixed; inset: 0; z-index: 1000;/);
  // 태블릿 · PC는 덮지 않는다 — 휴대폰 갈래가 아닌 선택자로 안내를 보이는 규칙이 없다
  expect(css.match(/\.rotate-notice \{[^}]*display: flex/g)).toHaveLength(1);
});

test("안내 글은 화면에 있고 «!» «?» 앞 띄어쓰기 규칙에 걸리는 기호가 없다", () => {
  expect(view).toContain("휴대폰을 세로로 돌려 주세요");
  expect(view).toContain("세로로 들면 지금 화면에서 이어서 할 수 있어요");
});
