/* 현장 의견 보내기(2026-11-05 Bumm님 9 ① · 10 A · 11 ②, 팀장 전달 — _docs/intents/2026-11-05-field-feedback).
   첫 화면 «의견 보내기» 창이 이름 · 의견과 함께 판 번호 · 화면 크기 · 기기 · 단계를 서버(/feedback)로 보낸다.
   서버가 Firestore에 저장하고 Bumm님 카카오톡으로 알린다. 사진 · 영화 제목 · 출연진은 싣지 않는다. */
import { API_BASE, BOOTH_TOKEN } from "./constants.js";
import { deviceKind } from "./deviceCanvas.js";

/** 🟠 의견 받기 스위치 — 다 받으면 false로 바꿔 배포한다(링크가 사라진다). 그 뒤 쌓인 의견을 내려받아 넘기고 Firestore에서 지운다. */
export const FEEDBACK_OPEN = true;

export const FEEDBACK_NAME_MAX = 40;
export const FEEDBACK_TEXT_MAX = 500;
const NAME_KEY = "posterStudio.feedbackName";
const TIMEOUT_MS = 15_000;

export type FeedbackResult = "ok" | "offline" | "busy" | "error";

// 이름은 그 기기에만 기억한다(저장소가 막힌 브라우저에서는 기억하지 못할 뿐 보내기는 된다).
export function rememberedName(): string {
  try { return localStorage.getItem(NAME_KEY) ?? ""; } catch { return ""; }
}
export function rememberName(name: string): void {
  try { localStorage.setItem(NAME_KEY, name); } catch { /* 기억하지 못해도 된다 */ }
}

/** 함께 보내는 것 — 판 번호(화면 번들 파일 이름) · 화면 크기(창 폭 × 높이 @ 배율) · 기기 갈래 · 단계 */
export function feedbackContext(step: number) {
  const src = document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src ?? "";
  const file = src.split(/[?#]/)[0].split("/").pop() ?? "";
  const dpr = Math.round((window.devicePixelRatio || 1) * 100) / 100;
  return {
    version: /^[A-Za-z0-9._-]{1,80}$/.test(file) ? file : "unknown",
    screen: `${Math.round(window.innerWidth)}x${Math.round(window.innerHeight)}@${dpr}`,
    device: deviceKind() ?? "unknown",
    step,
  };
}

export async function sendFeedback(name: string, text: string, step: number): Promise<FeedbackResult> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
  try {
    const res = await fetch(`${API_BASE}/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-booth-token": BOOTH_TOKEN },
      body: JSON.stringify({ name, text, ...feedbackContext(step) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) return "ok";
    return res.status === 429 ? "busy" : "error";
  } catch {
    return navigator.onLine === false ? "offline" : "error";
  }
}
