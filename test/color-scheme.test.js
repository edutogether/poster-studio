/* 기기의 다크 모드와 상관없이 늘 밝은 화면(2026-11-06 Bumm님 «갤럭시 폴드 7에서 밤에 열면 검은 화면 — 핸드폰 설정에 의지하지 말고»).
   원인은 사이트의 어두운 규칙이 아니라 브라우저 강제 다크다(scripts/verify/dark-mode-probe.mjs로 재현 — 12장면 모두 검게 뒤집힘).
   «light»만으로는 강제 다크를 막지 못해 «only light»로 거절한다. 실제 화면 확인은 그 도구로 하고, 여기는 선언이 빠지지 않게 고정한다. */
import { test, expect } from "vitest";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");
const HTML = ["index.html", "privacy.html"];

test("공개 HTML은 저장소 루트의 두 개뿐이다 — 늘어나면 여기 목록과 선언을 함께 본다", () => {
  const found = fs.readdirSync(".").filter((f) => f.endsWith(".html")).sort();
  expect(found).toEqual(HTML);
  expect(fs.readdirSync("public").filter((f) => f.endsWith(".html"))).toEqual([]);
});

test.each(HTML)("%s: 첫 화면이 그려지기 전에 밝은 화면을 선언한다", (file) => {
  const html = read(file);
  const meta = html.search(/<meta name="color-scheme" content="only light"/);
  expect(meta, "color-scheme 메타").toBeGreaterThan(0);
  for (const later of ["<script", "<style", '<link rel="stylesheet"']) {
    const at = html.indexOf(later);
    if (at >= 0) expect(meta, `${later}보다 앞`).toBeLessThan(at);
  }
  expect(html).toMatch(/<meta name="supported-color-schemes" content="light"/);
  expect(html).toMatch(/<meta name="theme-color" content="#ffffff"/);
  expect(html).toMatch(/<meta name="darkreader-lock"/);
});

test("CSS도 only light다 — privacy.html 안쪽 스타일과 앱 스타일", () => {
  expect(read("privacy.html")).toContain("html{color-scheme:only light}");
  expect(read("src/studio/style.css")).toMatch(/color-scheme: only light;/);
});

test("어두운 화면 규칙을 두지 않는다", () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]));
  const files = walk("src").filter((f) => /\.(css|tsx?)$/.test(f));
  expect(files.length).toBeGreaterThan(10);
  const hits = files.filter((f) => read(f).includes("prefers-color-scheme"));
  expect(hits).toEqual([]);
  expect(read("privacy.html")).not.toContain("prefers-color-scheme");
  expect(read("index.html")).not.toContain("prefers-color-scheme");
});
