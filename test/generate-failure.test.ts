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

/* code 17종 전부 → 단추(2026-10-17 종합감사: token · too_large · no_photo · bad_request의 종류를 바꿔도 통과했다).
   표의 열쇠가 FAILURE_CODES와 꼭 같아야 해서 code를 새로 만들면 여기도 채워야 한다(타입과 첫 단언이 함께 막는다). */
const EXPECTED: Record<(typeof FAILURE_CODES)[number], { action: string; waitSeconds?: number }> = {
  booth_code: { action: "booth" },
  busy_global: { action: "wait", waitSeconds: 20 },
  busy_network: { action: "wait", waitSeconds: 20 },
  openai_busy: { action: "wait", waitSeconds: 15 },
  timeout: { action: "retry" },
  upstream: { action: "retry" },
  unknown: { action: "retry" },
  bad_request: { action: "retry" },
  safety: { action: "fix" },
  photo_limit: { action: "retake" },
  too_large: { action: "retake" },
  no_photo: { action: "retake" },
  budget: { action: "staff" },
  credit: { action: "staff" },
  key: { action: "staff" },
  token: { action: "staff" },
  closed: { action: "staff" },
};

test("종류별 행동 — 서버 code 17종 전부", () => {
  expect(Object.keys(EXPECTED).sort()).toEqual([...FAILURE_CODES].sort());
  for (const [code, want] of Object.entries(EXPECTED)) {
    const got = classifyGenerateFailure({ status: 500, body: { code, error: "x" } });
    expect({ action: got.action, waitSeconds: got.waitSeconds }, code).toEqual({ waitSeconds: undefined, ...want });
  }
});

test("화면 시간 제한·인터넷 끊김·code 없는 응답", () => {
  expect(classifyGenerateFailure({ aborted: true }).action).toBe("retry");
  expect(classifyGenerateFailure({ network: true }).action).toBe("offline");
  expect(classifyGenerateFailure({ status: 429, body: {} })).toMatchObject({ action: "wait", waitSeconds: 20 });
  expect(classifyGenerateFailure({ status: 403, body: "<html>" }).action).toBe("staff");
  expect(classifyGenerateFailure({ status: 500, body: null })).toMatchObject({ action: "retry", staffNote: "응답 500" });
  // 서버는 성공(200)이라 했는데 그림을 쓸 수 없다 — 인터넷 끊김이 아니라 다시 만들기, 원인은 진행자용으로(2026-10-17)
  expect(classifyGenerateFailure({ malformed: "응답에 그림이 없음(응답 200)" })).toEqual({ action: "retry", message: "그림을 다 그리지 못했어요.", staffNote: "응답에 그림이 없음(응답 200)" });
});
