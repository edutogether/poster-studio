import { expect, test } from "vitest";
import fs from "node:fs";
import path from "node:path";

// 2026-11-11 Bumm님 «가. 늘 돌게 하기»(팀장 전달): 원격으로 연 PC의 크롬이 사람이 켠 적 없는 «움직임 줄이기»(prefers-reduced-motion: reduce)를 보고해
// 스플래시 막대 · 개인 · 단체 촬영 예시 영상 · 로딩 화면이 멈춰 있었다. 이 넷은 그 신호와 상관없이 돈다 — 브라우저 실측은 scripts/verify/reduced-motion-probe.mjs,
// 여기서는 소스가 다시 그 신호로 막지 않는지만 본다(CI에서 도는 쪽).
const root = path.resolve(__dirname, "..");
const cssFiles = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  const p = path.join(dir, d.name);
  return d.isDirectory() ? cssFiles(p) : d.name.endsWith(".css") ? [p] : [];
});

/** CSS 안의 «움직임 줄이기» 블록 본문들(괄호 짝을 세어 자른다) */
function reduceBlocks(css: string) {
  const blocks: string[] = [];
  for (const m of css.matchAll(/@media[^{]*prefers-reduced-motion:\s*reduce[^{]*\{/g)) {
    const start = m.index + m[0].length;
    let depth = 1, i = start;
    while (depth && i < css.length) { if (css[i] === "{") depth++; else if (css[i] === "}") depth--; i++; }
    blocks.push(css.slice(start, i - 1));
  }
  return blocks;
}
/** 블록 안에서 animation을 끄는 규칙의 선택자들 */
const animationOffSelectors = (block: string) => [...block.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .filter(([, , body]) => /animation\s*:\s*none/.test(body)).map(([, sel]) => sel.trim());

const files = cssFiles(path.join(root, "src"));

test("검사 대상이 있다 — CSS 파일과 «움직임 줄이기» 블록을 실제로 찾는다(빈 게이트 막기)", () => {
  expect(files.length).toBeGreaterThan(5);
  expect(files.flatMap((f) => reduceBlocks(fs.readFileSync(f, "utf8"))).length).toBeGreaterThan(3);
  // 장식 움직임은 그대로 끈다 — 이 검사가 «끄는 규칙»을 실제로 읽는지 확인
  const all = files.flatMap((f) => reduceBlocks(fs.readFileSync(f, "utf8")).flatMap(animationOffSelectors));
  expect(all.some((s) => s.includes(".hero-next"))).toBe(true);
});

test("«움직임 줄이기»가 스플래시 · 로딩 점 · 모든 요소(*)의 애니메이션을 끄지 않는다", () => {
  const offenders = files.flatMap((f) => reduceBlocks(fs.readFileSync(f, "utf8")).flatMap(animationOffSelectors)
    .filter((sel) => /#splash|\.sbar|\.logo|generation-dots|(^|,)\s*\*/.test(sel)).map((sel) => `${path.relative(root, f)}: ${sel}`));
  expect(offenders).toEqual([]);
});

test("촬영 예시 · 로딩 화면 부품이 «움직임 줄이기» 신호를 읽지 않는다", () => {
  for (const f of ["CameraExample.tsx", "cameraPrefetch.ts", "GenerationWait.tsx", "WaitingArtwork.tsx"]) {
    expect(fs.readFileSync(path.join(root, "src/studio", f), "utf8"), f).not.toMatch(/matchMedia[^;\n]*prefers-reduced-motion|useReducedMotion/);
  }
});
