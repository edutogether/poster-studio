// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postcss from "postcss";
import { afterEach, describe, expect, test, vi } from "vitest";
import deviceMedia, { convertUnits, prefixSelector, readPcCanvas, splitQuery } from "../scripts/build/device-media.mjs";

// 비율 기준 전환(2026-10-23) — 빌드 변환(scripts/build/device-media.mjs)과 기기 판정(public/device-canvas.js)
describe("빌드 변환: 폭 · 높이 미디어 쿼리 → 기기 갈래", () => {
  test("기준 크기(PC 2560×1440 · 태블릿 1366×1024 / 1024×1366 · 휴대폰 390×844)로 미리 평가한다", () => {
    expect(splitQuery("(max-width: 760px)")).toEqual({ devices: ["phone"], rest: "" });
    expect(splitQuery("(min-width: 761px) and (max-width: 1099px)")).toEqual({ devices: ["tablet-p"], rest: "" });
    expect(splitQuery("(min-width: 1100px) and (max-height: 820px)")).toEqual({ devices: [], rest: "" });
    expect(splitQuery("(min-width: 1100px) and (min-height: 700px)")).toEqual({ devices: ["pc", "tablet-l"], rest: "" });
    expect(splitQuery("(prefers-reduced-motion: reduce)")).toBeNull();
  });
  test("선택자 앞에 우선순위 0인 갈래 조건을 붙인다(:root · html은 그 자리에)", () => {
    expect(prefixSelector(".a .b", ["phone"])).toBe(':where([data-device="phone"]) .a .b');
    expect(prefixSelector(":root", ["phone"])).toBe(':root:where([data-device="phone"])');
    expect(prefixSelector("html.x body", ["pc", "tablet-l"])).toBe('html:where([data-device="pc"],[data-device="tablet-l"]).x body');
  });
  test("화면 단위는 변수 + 원래 단위 대체값(휴대폰 · 태블릿은 그대로)", () => {
    expect(convertUnits("calc(100svh - 120px)")).toBe("calc(calc(100 * var(--vh, 1svh)) - 120px)");
    expect(convertUnits("50vw")).toBe("calc(50 * var(--vw, 1vw))");
  });
  const CSS = "@media (max-width: 760px) { .a { color: red } } @media (min-width: 1100px) and (max-height: 820px) { .b { color: blue } } @media print { .c { display: none } } .d { width: 10vw }";
  test("PC 캔버스 켜짐: src/ CSS만 바꾸고, 맞는 갈래가 없으면 지우고, 다른 조건은 남긴다", async () => {
    const out = (await postcss([deviceMedia({ pcCanvas: true })]).process(CSS, { from: resolve("src/x.css") })).css;
    expect(out).toContain(':where([data-device="phone"]) .a');
    expect(out).not.toContain(".b");
    expect(out).toContain("@media print");
    expect(out).toContain("calc(10 * var(--vw, 1vw))");
    expect(out).not.toContain("max-width");
    const html = (await postcss([deviceMedia({ pcCanvas: true })]).process(CSS, { from: resolve("privacy.html?html-proxy&index=0.css") })).css;
    expect(html).toBe(CSS);
  });
  test("PC 캔버스 꺼짐: PC 몫은 원래 미디어 쿼리 그대로(PC 선택자만 붙인 사본), 휴대폰 · 태블릿 몫만 기준 크기로", async () => {
    const out = (await postcss([deviceMedia({ pcCanvas: false })]).process(CSS, { from: resolve("src/x.css") })).css;
    expect(out).toMatch(/@media \(max-width: 760px\) \{ :where\(\[data-device="pc"\]\) \.a \{ color: red \} \}\s*:where\(\[data-device="phone"\]\) \.a/);
    expect(out).toContain('@media (min-width: 1100px) and (max-height: 820px) { :where([data-device="pc"]) .b');
    expect(out.match(/\.b /g)).toHaveLength(1);   // 기준 크기에서 맞는 휴대폰 · 태블릿이 없으니 PC 사본만
    expect(out).toContain("@media print { .c");
    expect(out).toContain(".d { width: calc(10 * var(--vw, 1vw)) }");   // PC는 변수가 없어 원래 1vw
  });
  test("스위치는 public/device-canvas.js 한 줄이 원본 — 줄이 없으면 빌드를 멈춘다", () => {
    expect(typeof readPcCanvas()).toBe("boolean");
    expect(readPcCanvas("(function () {\n  var PC_CANVAS = true;\n")).toBe(true);
    expect(() => readPcCanvas("var PC_CANVAS = 1;")).toThrow(/PC_CANVAS/);
  });
});

describe("기기 판정(public/device-canvas.js)", () => {
  const file = readFileSync(resolve("public/device-canvas.js"), "utf8");
  const withCanvas = (on: boolean) => { const s = file.replace(/var PC_CANVAS = (true|false);/, `var PC_CANVAS = ${on};`); if (!s.includes(`var PC_CANVAS = ${on};`)) throw new Error("device-canvas.js에 PC_CANVAS 줄이 없다"); return s; };
  let src = withCanvas(true);
  afterEach(() => { vi.unstubAllGlobals(); src = withCanvas(true); const d = document.documentElement; d.removeAttribute("data-device"); d.removeAttribute("data-pc-canvas"); d.removeAttribute("style"); d.className = ""; document.head.innerHTML = ""; });
  function run({ ua, tp = 0, coarse = false, landscape = false, screen = [1920, 1080], win = [1920, 1080] }: { ua: string; tp?: number; coarse?: boolean; landscape?: boolean; screen?: number[]; win?: number[] }) {
    document.head.innerHTML = '<meta name="viewport" content="width=device-width, initial-scale=1">';
    vi.stubGlobal("navigator", { userAgent: ua, maxTouchPoints: tp });
    vi.stubGlobal("screen", { width: screen[0], height: screen[1] });
    vi.stubGlobal("innerWidth", win[0]); vi.stubGlobal("innerHeight", win[1]);
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q === "(pointer: coarse)" ? coarse : q === "(orientation: landscape)" ? landscape : false, addEventListener() {} }));
    new Function(src)();
    return { device: document.documentElement.dataset.device, meta: document.querySelector('meta[name="viewport"]')!.getAttribute("content"), zoom: document.documentElement.style.zoom };
  }
  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
  const GALAXY = "Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36";
  const IPAD_SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15";
  const LINUX_DESKTOP = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130 Safari/537.36";
  const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36";
  test("아이폰 · 갤럭시 → 휴대폰, viewport 폭 390", () => {
    expect(run({ ua: IPHONE, tp: 5, coarse: true, screen: [390, 844] })).toMatchObject({ device: "phone", meta: "width=390, viewport-fit=cover" });
    expect(run({ ua: GALAXY, tp: 5, coarse: true, screen: [360, 780] })).toMatchObject({ device: "phone" });
  });
  test("아이패드 사파리(맥 이름표 + 터치) → 태블릿, 세로 1024 · 가로 1366", () => {
    expect(run({ ua: IPAD_SAFARI, tp: 5, coarse: true, screen: [820, 1180] })).toMatchObject({ device: "tablet-p", meta: "width=1024, viewport-fit=cover" });
    expect(run({ ua: IPAD_SAFARI, tp: 5, coarse: true, landscape: true, screen: [820, 1180] })).toMatchObject({ device: "tablet-l", meta: "width=1366, viewport-fit=cover" });
  });
  test("갤럭시 탭 «데스크톱 보기»(PC 이름표 + 손가락 입력, 짧은 변 800) → 태블릿", () => {
    expect(run({ ua: LINUX_DESKTOP, tp: 10, coarse: true, landscape: true, screen: [1280, 800] })).toMatchObject({ device: "tablet-l" });
  });
  test("터치 노트북(마우스가 주 입력) · 일반 PC → PC, 창 크기로 zoom(기준 크기 창은 zoom 없음)", () => {
    expect(run({ ua: WINDOWS, tp: 10, coarse: false, win: [1280, 720] })).toMatchObject({ device: "pc", zoom: "0.5" });
    expect(run({ ua: WINDOWS, win: [2560, 1440] })).toMatchObject({ device: "pc", zoom: "" });
    expect(run({ ua: WINDOWS, win: [1366, 635] }).zoom).toBe(String(635 / 1440));
    expect(run({ ua: WINDOWS, win: [3440, 1440] })).toMatchObject({ device: "pc", zoom: "" });
  });
  test("PC 화면에서는 휴대폰 갈래가 되지 않는다(창이 760보다 좁아도)", () => {
    expect(run({ ua: WINDOWS, win: [700, 900] }).device).toBe("pc");
  });
  test("PC 캔버스 꺼짐: 갈래 이름만 붙이고 zoom · 변수 · 캔버스 표시는 없다(지금 라이브 배치) — 휴대폰 · 태블릿은 그대로", () => {
    src = withCanvas(false);
    expect(run({ ua: WINDOWS, win: [1280, 720] })).toMatchObject({ device: "pc", zoom: "" });
    const d = document.documentElement;
    expect(d.hasAttribute("data-pc-canvas") || d.classList.contains("ps-canvas") || d.style.getPropertyValue("--vw") !== "").toBe(false);
    expect(run({ ua: IPHONE, tp: 5, coarse: true, screen: [390, 844] })).toMatchObject({ device: "phone", meta: "width=390, viewport-fit=cover" });
    expect(run({ ua: IPAD_SAFARI, tp: 5, coarse: true, screen: [820, 1180] })).toMatchObject({ device: "tablet-p", meta: "width=1024, viewport-fit=cover" });
  });
  test("PC 캔버스 켜짐: <html data-pc-canvas>", () => {
    run({ ua: WINDOWS, win: [1280, 720] });
    expect(document.documentElement.hasAttribute("data-pc-canvas")).toBe(true);
  });
});
