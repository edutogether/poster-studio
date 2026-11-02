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

// 11/2 라이브 다시 찍기: 로딩 화면 · 포스터 크게 보기는 showModal() 창이라 브라우저 맨 위 층에 떠 z-index와 상관없이 안내 위에 보였다(로딩 글은 가로에서 잘림).
// 안내가 떠 있는 조건에서만 열린 창 · 그 배경 · 창 안 전부를 숨긴다 — 창 안에 visibility: visible을 스스로 거는 글(로딩 문구)이 있어 창만 숨기면 그 글이 남는다.
test("휴대폰 가로에서는 맨 위 층 창(<dialog>)과 그 배경 · 안쪽까지 숨겨 안내가 보이게 한다", () => {
  const landscape = css.slice(css.lastIndexOf("@media (orientation: landscape) {"));
  const block = landscape.slice(0, landscape.indexOf("\n}\n"));
  expect(block).toMatch(/html\[data-device="phone"\] dialog\[open\],\s*html\[data-device="phone"\] dialog\[open\] \*,\s*html\[data-device="phone"\] dialog\[open\]::backdrop \{ visibility: hidden !important; \}/);
  // 창 숨기기는 이 가로 블록 한 곳뿐이다 — 세로 · 태블릿 · PC에서는 창이 그대로 보인다
  expect(css.match(/dialog\[open\]::backdrop \{ visibility: hidden/g)).toHaveLength(1);
});

test("안내 글은 화면에 있고 «!» «?» 앞 띄어쓰기 규칙에 걸리는 기호가 없다", () => {
  expect(view).toContain("휴대폰을 세로로 돌려 주세요");
  expect(view).toContain("세로로 들면 지금 화면에서 이어서 할 수 있어요");
});
