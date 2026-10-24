/* 포스터용 PretendardFull 조각(2026-10-24, scripts/fonts/slice-full.py).
   핵심 조각에 없는 글자는 PretendardFullRare의 구간 조각에서만 그려진다. 브라우저 쪽이 «핵심에 있다»고 잘못 알면
   그 조각을 미리 받지 않아 포스터 글자가 대체 글꼴로 인쇄된다 — 그래서 핵심의 정의가 도구(파이썬)와 화면(TS)에서
   같은지, 규칙이 가리키는 파일·판이 맞는지, 글꼴 순서에 드문 글자 패밀리가 빠지지 않았는지를 여기서 고정한다. */
import { afterEach, expect, test, vi } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ensureGlyphs, rareGlyphs } from "../src/layout";
import type { Meta } from "../src/state";

const ROOT = process.cwd();
const FONTS = path.join(ROOT, "public", "fonts");
const css = fs.readFileSync(path.join(FONTS, "pretendard.css"), "utf8");
const FACE = /@font-face\{font-family:'(PretendardFull|PretendardFullRare)';font-weight:(\d+);font-style:normal;font-display:block;src:url\('full\/([^?']+)\?v=([0-9a-f]+)'\) format\('woff2'\)(?:;unicode-range:U\+([0-9A-F]+)-([0-9A-F]+))?\}/g;
const faces = [...css.matchAll(FACE)].map((m) => ({ family: m[1], weight: Number(m[2]), file: m[3], ver: m[4], from: m[5] ? parseInt(m[5], 16) : null, to: m[6] ? parseInt(m[6], 16) : null }));
const WEIGHTS = [400, 500, 600, 700, 800, 900];

test("핵심 정의가 도구와 같다 — 상용 음절 2350자의 지문이 CSS에 적힌 것과 같다", () => {
  const all = Array.from({ length: 0xd7a3 - 0xac00 + 1 }, (_, i) => String.fromCodePoint(0xac00 + i)).join("");
  const rare = new Set(rareGlyphs(all));
  const common = [...all].filter((c) => !rare.has(c));
  expect(common.length).toBe(2350);
  expect(rare.size).toBe(11172 - 2350);
  const finger = crypto.createHash("sha256").update(common.join(""), "utf8").digest("hex").slice(0, 12);
  expect(css).toContain(`KS X 1001 상용 음절 2350자(지문 ${finger})`);
});

test("드문 글자만 골라낸다 — 상용 음절·영문·문장부호·자모·줄바꿈은 핵심이다", () => {
  expect(rareGlyphs("가나다 김태범 ABC 0-9 «·…» ※♥★ ㄱㅋ\n")).toBe("");
  expect(rareGlyphs("똠방각하 뷁햏 Ωmega™ ∞ 똠")).toBe("똠뷁햏Ω™∞");
});

test("굵기마다 핵심 하나 + 구간 조각들이고, 구간은 겹치지 않으며 파일·판이 실제 파일과 맞다", () => {
  expect(faces.length, "생성 구역에서 @font-face를 하나도 못 찾았다").toBeGreaterThan(WEIGHTS.length);
  expect(faces.length).toBe((css.match(/@font-face\{font-family:'PretendardFull/g) || []).length);
  for (const w of WEIGHTS) {
    const core = faces.filter((f) => f.family === "PretendardFull" && f.weight === w);
    expect(core.length, `${w} 핵심`).toBe(1);
    expect(core[0].from, `${w} 핵심에는 구간이 없다`).toBeNull();
    const rare = faces.filter((f) => f.family === "PretendardFullRare" && f.weight === w);
    expect(rare.length, `${w} 조각`).toBeGreaterThan(1);
    for (let i = 0; i < rare.length; i++) {
      expect(rare[i].from! <= rare[i].to!).toBe(true);
      if (i) expect(rare[i].from! > rare[i - 1].to!, `${w} 조각 ${i}이 앞 조각과 겹친다`).toBe(true);
    }
  }
  const files = fs.readdirSync(path.join(FONTS, "full"));
  expect(files.sort()).toEqual(faces.map((f) => f.file).sort());
  for (const f of faces) {
    const ver = crypto.createHash("sha256").update(fs.readFileSync(path.join(FONTS, "full", f.file))).digest("hex").slice(0, 10);
    expect(f.ver, `${f.file}의 판이 내용과 다르다 — slice-full.py를 다시 돌린다`).toBe(ver);
  }
});

test("PretendardFull을 쓰는 글꼴 순서에는 바로 뒤에 PretendardFullRare가 있다", () => {
  const templates = fs.readFileSync(path.join(ROOT, "src", "templates.ts"), "utf8");
  const stacks = [...templates.matchAll(/^const \w+ = "([^"]*PretendardFull[^"]*)";$/gm)].map((m) => m[1]);
  const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  for (const f of walk(path.join(ROOT, "src")).filter((f) => f.endsWith(".css"))) {
    for (const m of fs.readFileSync(f, "utf8").matchAll(/font(?:-family)?:([^;}]*PretendardFull[^;}]*)/g)) stacks.push(m[1]);
  }
  expect(stacks.length, "PretendardFull을 쓰는 글꼴 순서를 하나도 못 찾았다").toBeGreaterThanOrEqual(4);
  for (const s of stacks) expect(s, s).toMatch(/'?PretendardFull'?, '?PretendardFullRare'?/);
});

afterEach(() => { vi.unstubAllGlobals(); });

test("조판 전에 드문 글자의 조각만 굵기마다 미리 받는다", async () => {
  const load = vi.fn(async () => []);
  vi.stubGlobal("document", { fonts: { load, ready: Promise.resolve() } });
  const meta: Meta = { mode: "solo", title: "똠방각하", name: "김뷁", groupName: "", members: "", tagline: "", genre: "sf" };
  await ensureGlyphs(meta);
  const rare = load.mock.calls.filter((c) => String(c[0]).includes("PretendardFullRare")) as unknown as [string, string][];
  expect(rare.map((c) => c[0])).toEqual([400, 500, 600, 700, 800, 900].map((w) => `${w} 80px 'PretendardFullRare'`));
  for (const c of rare) expect(c[1]).toBe("똠뷁");
  load.mockClear();
  await ensureGlyphs({ ...meta, title: "우주를 달리는 인키", name: "김태범" });
  expect(load.mock.calls.some((c) => String(c[0]).includes("PretendardFullRare")), "드문 글자가 없으면 조각을 부르지 않는다").toBe(false);
});
