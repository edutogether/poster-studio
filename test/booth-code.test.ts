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

test("형식이 틀린 값으로 열어도 이미 보관된 코드는 지우지 않는다", () => {
  localStorage.setItem(KEY, "INKY-2026-ABCD");
  for (const bad of ["%E0%A4%A", "abc", "%ED%95%9C%EA%B8%80"]) {
    open(`/#booth=${bad}`);
    expect(localStorage.getItem(KEY), bad).toBe("INKY-2026-ABCD");
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

/* 부스 코드 입력 창(2026-10-16)이 쓰는 확인·보관. 확인은 사진 없는 요청이라 맞으면 400(사진 확인에서 끝남), 틀리면 403 booth_code다. */
import { isBoothCodeRefusal, saveBoothCode, verifyBoothCode } from "../src/boothCode";

const respond = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("확인: 400이면 맞음, 403 booth_code면 틀림, 다른 403·500은 오류, 연결 실패는 오프라인, 형식이 틀리면 요청하지 않는다", async () => {
  const deps = (f: () => Promise<Response>) => ({ apiBase: "https://api.test", boothToken: "t", fetch: f as unknown as typeof fetch });
  expect(await verifyBoothCode(" INKY-2026-ABCD ", deps(respond(400, { error: "사진 파일이 없습니다." })))).toBe("ok");
  expect(await verifyBoothCode("INKY-2026-ABCD", deps(respond(403, { error: "행사 부스에서만 만들 수 있어요.", code: "booth_code" })))).toBe("wrong");
  expect(await verifyBoothCode("INKY-2026-ABCD", deps(respond(403, { error: "운영 시간이 아닙니다" })))).toBe("error");
  expect(await verifyBoothCode("INKY-2026-ABCD", deps(respond(500, {})))).toBe("error");
  expect(await verifyBoothCode("INKY-2026-ABCD", deps(async () => { throw new TypeError("Failed to fetch"); }))).toBe("offline");
  let called = 0;
  expect(await verifyBoothCode("한글", deps(async () => { called++; return new Response("{}", { status: 400 }); }))).toBe("format");
  expect(called).toBe(0);
});

test("확인 요청은 사진 없이 토큰·코드 헤더만 싣는다", async () => {
  let seen: { url: string; init: RequestInit } | null = null;
  await verifyBoothCode("INKY-2026-ABCD", { apiBase: "https://api.test", boothToken: "tok", fetch: (async (url: string, init: RequestInit) => { seen = { url, init }; return new Response("{}", { status: 400 }); }) as unknown as typeof fetch });
  expect(seen!.url).toBe("https://api.test/generate");
  expect(seen!.init.body).toBe("{}");
  expect(seen!.init.headers).toEqual({ "content-type": "application/json", "x-booth-token": "tok", "x-booth-code": "INKY-2026-ABCD" });
});

test("보관은 형식이 맞을 때만, 거절 판정은 403 + code booth_code일 때만", () => {
  expect(saveBoothCode("abc")).toBe(false);
  expect(localStorage.getItem(KEY)).toBeNull();
  expect(saveBoothCode("INKY-2026-ABCD")).toBe(true);
  expect(boothCodeHeaders()).toEqual({ "x-booth-code": "INKY-2026-ABCD" });
  expect(isBoothCodeRefusal(403, { code: "booth_code" })).toBe(true);
  expect(isBoothCodeRefusal(403, { error: "행사 부스에서만 만들 수 있어요." })).toBe(false);
  expect(isBoothCodeRefusal(400, { code: "booth_code" })).toBe(false);
  expect(isBoothCodeRefusal(403, null)).toBe(false);
});
