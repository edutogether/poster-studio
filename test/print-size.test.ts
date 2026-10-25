/* 4×6 인화 규격(2026-10-26 종합감사): 인쇄 화면의 종이가 4in × 6in · 여백 0이고, 포스터 캔버스가 그 비율(2:3)의 1200×1800인지 고정한다.
   예전에는 이 둘을 단언하는 시험이 없었다 — 실제 브라우저의 캔버스 규격은 scripts/verify/release-baseline.mjs가 따로 본다(«인화 규격 불일치»). */
import { expect, test } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { W, H } from "../src/constants";

const css = fs.readFileSync(path.join(process.cwd(), "src", "studio.css"), "utf8");

test("인쇄 종이는 4in × 6in · 여백 0이다(@media print 안의 @page)", () => {
  const print = css.slice(css.indexOf("@media print"));
  expect(css.includes("@media print"), "@media print 구역이 있어야 한다").toBe(true);
  const page = print.match(/@page\s*\{([^}]*)\}/);
  expect(page, "@page 규칙").not.toBeNull();
  expect(page![1].replace(/\s+/g, " ")).toMatch(/size: 4in 6in;/);
  expect(page![1]).toMatch(/margin:\s*0;/);
});

test("포스터 캔버스는 1200×1800 — 4×6(2:3) 인화지 비율 그대로다", () => {
  expect([W, H]).toEqual([1200, 1800]);
  expect(W / H).toBeCloseTo(4 / 6, 10);
});
