/* AI 생성 실패를 «다음에 무엇을 누르게 할지»로 가른다(2026-10-16, _docs/intents/2026-10-14-ai-retry-instead-of-fallback).
   문구는 휴대폰에서도 한 줄에 들어오게 짧게 쓴다(2026-10-17 Bumm님) — 무엇을 할지는 단추가 말한다.
   서버는 실패마다 code를 준다(functions/index.js). code가 없는 옛 응답·플랫폼 응답은 상태 번호로 가른다.
   아이에게 보이는 문구(message)와 진행자용 원인(staffNote)을 따로 둔다 — 원인 문구는 서버가 준 그대로다. */

export type FailureAction =
  | "retry"    // 같은 사진·같은 입력으로 다시 만들면 될 수 있다
  | "wait"     // 잠깐 기다렸다 다시 만들면 될 수 있다(waitSeconds 뒤에 단추를 켠다)
  | "fix"      // 제목·문구가 안전 기준에 걸렸다 — 문구를 고치거나 다시 찍는다
  | "retake"   // 이 사진으로는 더 만들 수 없다 — 다시 찍는다
  | "staff"    // 현장에서 풀 수 없다 — 선생님(진행자)을 부른다
  | "offline"  // 부스 인터넷이 끊겼다 — 연결이 돌아오면 다시 만든다
  | "booth";   // 부스 코드가 없거나 틀렸다 — 부스 코드 입력 창

export type GenerateFailure = { action: FailureAction; message: string; staffNote?: string; waitSeconds?: number };

type Input = { status?: number; body?: unknown; aborted?: boolean; network?: boolean };

/** 이 함수가 가르는 서버 code 전부. 서버에 code를 새로 만들면 여기와 아래 switch에 함께 넣는다(test/generate-failure.test.ts가 막는다). */
export const FAILURE_CODES = ["booth_code", "busy_global", "busy_network", "openai_busy", "timeout", "upstream", "unknown", "bad_request",
  "safety", "photo_limit", "too_large", "no_photo", "budget", "credit", "key", "token", "closed"] as const;

const server = (body: unknown) => {
  const b = (typeof body === "object" && body !== null ? body : {}) as { code?: unknown; error?: unknown };
  return { code: typeof b.code === "string" ? b.code : "", error: typeof b.error === "string" ? b.error : "" };
};

export function classifyGenerateFailure({ status, body, aborted, network }: Input): GenerateFailure {
  if (aborted) return { action: "retry", message: "시간이 너무 오래 걸려 멈췄어요." };
  if (network) return { action: "offline", message: "인터넷 연결이 끊겼어요." };
  const { code, error } = server(body);
  const staffNote = error || (status ? `응답 ${status}` : undefined);
  switch (code) {
    case "booth_code": return { action: "booth", message: "이 노트북에 부스 코드가 필요해요.", staffNote };
    case "busy_global":
    case "busy_network": return { action: "wait", waitSeconds: 20, message: "지금 만드는 사람이 많아요.", staffNote };
    case "openai_busy": return { action: "wait", waitSeconds: 15, message: "AI가 잠시 바빠요.", staffNote };
    case "timeout":
    case "upstream":
    case "unknown":
    case "bad_request": return { action: "retry", message: "그림을 다 그리지 못했어요.", staffNote };
    case "safety": return { action: "fix", message: "AI 안전 기준에 걸렸어요.", staffNote };
    case "photo_limit":
    case "too_large":
    case "no_photo": return { action: "retake", message: "이 사진으로는 더 만들 수 없어요.", staffNote };
    case "budget":
    case "credit":
    case "key":
    case "token":
    case "closed": return { action: "staff", message: "지금은 만들 수 없어요.", staffNote };
  }
  // code가 없는 응답(옛 서버·플랫폼 오류 페이지)
  if (status === 429) return { action: "wait", waitSeconds: 20, message: "지금 만드는 사람이 많아요.", staffNote };
  if (status === 401 || status === 403) return { action: "staff", message: "지금은 만들 수 없어요.", staffNote };
  return { action: "retry", message: "그림을 다 그리지 못했어요.", staffNote };
}
