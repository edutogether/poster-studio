import { expect, test } from "vitest";
import fs from "node:fs";
import path from "node:path";

// 2026-11-11 Bumm님 «여덟 앱 모두 같은 규칙: 움직임 줄이기 신호로 멈추는 것은 하나도 남기지 않는다»(팀장 전달).
// 그 전(같은 날 «가. 늘 돌게 하기»)에는 스플래시 · 촬영 예시 영상 · 로딩 화면만 풀고 장식(바뀜 · 부드러운 스크롤 · «아래로» 화살표 · 촬영 중 빨간 점 ·
// 휴대폰 3단계 넘김 안내 · 카드 · 단추 올림)은 그 신호로 껐다 — 이제 화면 코드 어디서도 prefers-reduced-motion을 읽지 않는다.
// 원격으로 연 PC의 크롬이 사람이 켠 적 없는 그 신호를 보고해 화면이 멈춰 있었다. 브라우저 실측은 scripts/verify/reduced-motion-probe.mjs, 여기서는 소스를 본다(CI에서 도는 쪽).
const root = path.resolve(__dirname, "..");
const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  const p = path.join(dir, d.name);
  return d.isDirectory() ? walk(p) : /\.(css|ts|tsx|js|mjs|html)$/.test(d.name) ? [p] : [];
});
// 화면에 실리는 코드: src 전체 + public의 스크립트 · 스타일 + 진입 HTML 두 개
const files = [...walk(path.join(root, "src")), ...walk(path.join(root, "public")), path.join(root, "index.html"), path.join(root, "privacy.html")];
/** 주석을 지운 코드 — 신호 이름을 설명하는 주석은 걸지 않는다(CSS · JS 블록 주석, JS 줄 주석, HTML 주석) */
const code = (file: string) => {
  const text = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "");
  return /\.(ts|tsx|js|mjs)$/.test(file) ? text.replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1") : text;
};

test("검사 대상이 있다 — CSS · TS 파일을 실제로 찾는다(빈 게이트 막기)", () => {
  expect(files.filter((f) => f.endsWith(".css")).length).toBeGreaterThan(5);
  expect(files.filter((f) => /\.tsx?$/.test(f)).length).toBeGreaterThan(20);
  // 주석 지우기가 코드까지 지우지 않는지: 남은 코드에 다른 미디어 조건(휴대폰 폭)은 그대로 보인다
  expect(files.some((f) => /@media[^{]*max-width:\s*760px/.test(code(f)))).toBe(true);
});

test("화면 코드 어디서도 «움직임 줄이기»(prefers-reduced-motion) 신호를 읽지 않는다 — CSS · JS 모두", () => {
  const offenders = files.flatMap((f) => (/prefers-reduced-motion|useReducedMotion|reducedMotion\s*\(/.test(code(f)) ? [path.relative(root, f)] : []));
  expect(offenders).toEqual([]);
});
