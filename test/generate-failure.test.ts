import { expect, test } from "vitest";
import fs from "node:fs";
import { classifyGenerateFailure, FAILURE_CODES } from "../src/generateFailure";

// 실패 종류 → 다음 단추(2026-10-16). 서버가 주는 code를 하나도 빠뜨리지 않고 가르는지, code가 없을 때도 가르는지 고정한다.
test("서버가 주는 code는 전부 이 함수가 안다(모르는 code가 «다시 만들기»로 조용히 떨어지지 않게)", () => {
  const lines = fs.readFileSync("functions/index.js", "utf8").split(/\r?\n/);
  const codes = new Set<string>();
  for (const line of lines) {
    // 응답 본문의 code(json({ error, code }) · mapGenerateError의 { status, code, message })와 denyWithCleanup의 다섯째 인자
    if (/json\(\{ error:/.test(line) || /return \{ status: \d+, code:/.test(line) || /^\s+code: '/.test(line)) {
      for (const m of line.matchAll(/code: '([a-z_]+)'/g)) codes.add(m[1]);
    }
    if (/denyWithCleanup\(req, res, \d+,/.test(line)) {
      const m = /, '([a-z_]+)'\);/.exec(line);
      if (m) codes.add(m[1]);
    }
  }
  expect(codes.size, "서버에서 code를 거의 못 찾으면 이 검사는 빈 게이트다").toBeGreaterThanOrEqual(15);
  for (const code of codes) expect(FAILURE_CODES, `서버 code «${code}»를 판정 함수가 모른다`).toContain(code);
  for (const code of FAILURE_CODES) expect(classifyGenerateFailure({ status: 500, body: { code, error: "원인" } }).staffNote, code).toBe("원인");
});

test("종류별 행동", () => {
  const act = (code: string, status = 500) => classifyGenerateFailure({ status, body: { code, error: "x" } });
  expect(act("timeout", 504).action).toBe("retry");
  expect(act("upstream", 502).action).toBe("retry");
  expect(act("unknown").action).toBe("retry");
  expect(act("openai_busy", 429)).toMatchObject({ action: "wait", waitSeconds: 15 });
  expect(act("busy_global", 429)).toMatchObject({ action: "wait", waitSeconds: 20 });
  expect(act("busy_network", 429)).toMatchObject({ action: "wait", waitSeconds: 20 });
  expect(act("safety", 400).action).toBe("fix");
  expect(act("photo_limit", 429).action).toBe("retake");
  expect(act("budget", 429).action).toBe("staff");
  expect(act("credit").action).toBe("staff");
  expect(act("key").action).toBe("staff");
  expect(act("closed", 403).action).toBe("staff");
  expect(act("booth_code", 403).action).toBe("booth");
});

test("화면 시간 제한·인터넷 끊김·code 없는 응답", () => {
  expect(classifyGenerateFailure({ aborted: true }).action).toBe("retry");
  expect(classifyGenerateFailure({ network: true }).action).toBe("offline");
  expect(classifyGenerateFailure({ status: 429, body: {} })).toMatchObject({ action: "wait", waitSeconds: 20 });
  expect(classifyGenerateFailure({ status: 403, body: "<html>" }).action).toBe("staff");
  expect(classifyGenerateFailure({ status: 500, body: null })).toMatchObject({ action: "retry", staffNote: "응답 500" });
});
