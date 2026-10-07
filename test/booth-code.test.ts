/** @vitest-environment jsdom */
/* 부스 코드 보관(src/boothCode.ts): 화면 입력칸 없이 주소 뒤 #booth=<코드>로만 받고,
   받은 뒤에는 주소창에서 지운다. 형식이 틀린 값은 보관하지 않는다. */
import { test, expect, beforeEach } from "vitest";
import { captureBoothCode, boothCodeHeaders } from "../src/boothCode";

const KEY = "poster-studio-booth-code";
beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, "", "/");
});

function open(url: string) {
  history.replaceState(null, "", url);
  captureBoothCode();
}

test("#booth=<코드>로 열면 보관하고 주소창에서 지운다(경로·검색어는 그대로)", () => {
  open("/?set=4#booth=INKY-2026-ABCD");
  expect(localStorage.getItem(KEY)).toBe("INKY-2026-ABCD");
  expect(location.hash).toBe("");
  expect(location.pathname + location.search).toBe("/?set=4");
  expect(boothCodeHeaders()).toEqual({ "x-booth-code": "INKY-2026-ABCD" });
});

test("#booth= 로 비워 열면 보관한 코드를 지운다", () => {
  localStorage.setItem(KEY, "INKY-2026-ABCD");
  open("/#booth=");
  expect(localStorage.getItem(KEY)).toBeNull();
  expect(boothCodeHeaders()).toEqual({});
});

test("형식이 틀린 값(한글·짧은 값·특수문자·깨진 인코딩)은 보관하지 않고 주소창에서는 지운다", () => {
  for (const bad of ["%ED%95%9C%EA%B8%80", "abc", "a b c d", "ab%2Fcd", "%E0%A4%A"]) {
    open(`/#booth=${bad}`);
    expect(localStorage.getItem(KEY), bad).toBeNull();
    expect(location.hash, bad).toBe("");
  }
});

test("다른 주소 조각(#...)과 보통 방문은 건드리지 않는다", () => {
  open("/#top");
  expect(location.hash).toBe("#top");
  open("/");
  expect(localStorage.getItem(KEY)).toBeNull();
  expect(boothCodeHeaders()).toEqual({});
});

test("저장소에 형식이 틀린 값이 있으면 헤더로 싣지 않는다", () => {
  localStorage.setItem(KEY, "한글코드");
  expect(boothCodeHeaders()).toEqual({});
});
