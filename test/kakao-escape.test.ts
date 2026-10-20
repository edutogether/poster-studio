// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { escapeKakaoInApp, isKakaoInApp, kakaoExternalUrl, OPENING_TEXT } from "../src/kakaoEscape";

// 카카오톡 안 브라우저 → 바깥 브라우저 넘기기(2026-10-20). 실제 카카오톡 동작은 실기기 확인 몫이고, 여기서는 앱이 무엇을 부르는지만 고정한다.
const IPHONE_KAKAO = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.0";
const GALAXY_KAKAO = "Mozilla/5.0 (Linux; Android 15; SM-S921N Build/AP3A.240905.015; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.58 Mobile Safari/537.36 KAKAOTALK/10.8.0 (INAPP)";
const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const INSTAGRAM = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0";
const NAVER = "Mozilla/5.0 (Linux; Android 15; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 NAVER(inapp; search; 2000; 12.10.1)";
const HREF = "https://poster.edutogether.kr/?a=1&b=가#code-1";

const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };
const bar = () => document.querySelector(".kakao-escape");
beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = '<main class="app"></main>'; });
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ""; });

test("카카오톡 안 브라우저만 가린다 — 사파리 · 인스타그램 · 네이버는 아니다", () => {
  expect(isKakaoInApp(IPHONE_KAKAO)).toBe(true);
  expect(isKakaoInApp(GALAXY_KAKAO)).toBe(true);
  for (const ua of [IPHONE_SAFARI, INSTAGRAM, NAVER]) expect(isKakaoInApp(ua)).toBe(false);
});

test("넘길 주소는 kakaotalk://web/openExternal?url= 뒤에 지금 주소 전체(물음표 · 한글 · # 포함)를 인코딩해 붙인다", () => {
  expect(kakaoExternalUrl(HREF)).toBe("kakaotalk://web/openExternal?url=https%3A%2F%2Fposter.edutogether.kr%2F%3Fa%3D1%26b%3D%EA%B0%80%23code-1");
  expect(decodeURIComponent(kakaoExternalUrl(HREF).split("url=")[1])).toBe(HREF);
});

test("카카오톡이 아니면 아무것도 하지 않는다", () => {
  const navigate = vi.fn();
  expect(escapeKakaoInApp({ userAgent: IPHONE_SAFARI, href: HREF, navigate, storage: memory() })).toBe(false);
  vi.advanceTimersByTime(5_000);
  expect(navigate).not.toHaveBeenCalled();
  expect(bar()).toBeNull();
});

test("«여는 중» 한 줄을 0.5초 보인 뒤 한 번 넘기고, 화면이 그대로면(카카오톡이 막음) 안내를 남긴다", () => {
  const navigate = vi.fn();
  expect(escapeKakaoInApp({ userAgent: GALAXY_KAKAO, href: HREF, navigate, storage: memory() })).toBe(true);
  expect(bar()!.textContent).toBe(OPENING_TEXT);
  vi.advanceTimersByTime(499);
  expect(navigate).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(navigate).toHaveBeenCalledExactlyOnceWith(kakaoExternalUrl(HREF));
  vi.advanceTimersByTime(1_500);
  expect(bar()!.textContent).toContain("‘다른 브라우저로 열기’를 눌러 주세요");
  expect(bar()!.querySelector("svg.kakao-escape-dots circle")).not.toBeNull();
  (bar()!.querySelector("button") as HTMLButtonElement).click();
  expect(bar()).toBeNull();
  expect(navigate).toHaveBeenCalledTimes(1);
});

test("바깥 브라우저가 열려 화면이 가려졌다 돌아오면 안내 없이 줄을 걷는다", () => {
  const navigate = vi.fn();
  escapeKakaoInApp({ userAgent: IPHONE_KAKAO, href: HREF, navigate, storage: memory() });
  vi.advanceTimersByTime(500);
  Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
  document.dispatchEvent(new Event("visibilitychange"));
  vi.advanceTimersByTime(1_500);
  expect(bar()!.textContent).toBe(OPENING_TEXT);
  Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
  document.dispatchEvent(new Event("visibilitychange"));
  expect(bar()).toBeNull();
  // @ts-expect-error 시험에서 덮은 것을 걷는다
  delete document.hidden;
});

test("같은 탭에서는 한 번만 넘긴다 — 다시 열리면 안내만 보인다(무한 이동 없음)", () => {
  const storage = memory();
  const navigate = vi.fn();
  escapeKakaoInApp({ userAgent: IPHONE_KAKAO, href: HREF, navigate, storage });
  vi.advanceTimersByTime(2_000);
  document.body.innerHTML = '<main class="app"></main>';
  escapeKakaoInApp({ userAgent: IPHONE_KAKAO, href: HREF, navigate, storage });
  vi.advanceTimersByTime(5_000);
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(bar()!.textContent).toContain("다른 브라우저로 열기");
});

test("세션 저장소가 막혀도 한 번은 넘긴다", () => {
  const navigate = vi.fn();
  const blocked = { getItem: () => { throw new Error("차단"); }, setItem: () => { throw new Error("차단"); } };
  escapeKakaoInApp({ userAgent: IPHONE_KAKAO, href: HREF, navigate, storage: blocked });
  vi.advanceTimersByTime(500);
  expect(navigate).toHaveBeenCalledTimes(1);
});
