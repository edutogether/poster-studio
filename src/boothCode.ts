/* 부스 코드 — 행사 기기에서만 AI 생성을 허용할 때 서버가 확인하는 값(서버 스위치는 기본 꺼짐).
   화면에는 입력칸이 없다. 진행자가 주소 뒤에 #booth=<코드>를 붙여 한 번 열면 이 브라우저에
   보관하고 주소창에서는 바로 지운다(#booth= 로 비워 열면 지운다). 보관된 값이 있을 때만 생성
   요청 헤더에 싣는다 — 없으면 요청은 예전과 같다. 형식은 서버(functions/index.js)와 같다. */
const KEY = "poster-studio-booth-code";
const FORMAT = /^[A-Za-z0-9-]{4,64}$/;
const HASH = /^#booth=(.*)$/;
// 저장소가 막힌 브라우저(사이트 데이터 차단 정책 등)용 — 이 문서가 열려 있는 동안만 기억한다(2026-10-17 종합감사 발견:
// 저장이 안 되면 확인은 «맞음»인데 다시 보낸 요청이 또 거절돼 입력 창이 끝없이 되풀이됐다).
let memoryCode: string | null = null;

export function captureBoothCode(loc: Location = window.location, hist: History = window.history) {
  const match = HASH.exec(loc.hash);
  if (!match) return;
  let code: string | null = null;
  try { code = decodeURIComponent(match[1]).trim(); } catch { /* 깨진 값은 무시한다(보관된 코드도 그대로 둔다) */ }
  try {
    if (code === "") { memoryCode = null; localStorage.removeItem(KEY); }
    else if (code && FORMAT.test(code)) { memoryCode = code; localStorage.setItem(KEY, code); }
  } catch { /* 저장소가 막힌 브라우저는 코드 없이 동작한다 */ }
  hist.replaceState(hist.state, "", loc.pathname + loc.search);
}

export function boothCodeHeaders(): Record<string, string> {
  let code: string | null = null;
  try { code = localStorage.getItem(KEY); } catch { /* 저장소가 막힌 브라우저 — 아래 메모리 값을 쓴다 */ }
  code = code ?? memoryCode;
  return code && FORMAT.test(code) ? { "x-booth-code": code } : {};
}

/* 부스 코드 입력 창(2026-10-16) — 생성 요청이 «부스 코드» 거절(403, code: "booth_code")을 받으면 화면이 입력 창을 연다.
   넣은 코드는 사진 없는 요청으로 먼저 확인한다: 코드 문지기를 지나면 사진 확인에서 400이 난다(그 앞에서 끝나므로
   이용 횟수·예산 카운터를 쓰지 않는다 — functions/index.js의 순서). 맞으면 이 브라우저에 보관한다. */
export function isBoothCodeRefusal(status: number, body: unknown): boolean {
  return status === 403 && typeof body === "object" && body !== null && (body as { code?: unknown }).code === "booth_code";
}

/** 맞는 코드를 보관한다. 저장소에 못 쓰면(false) 이 문서가 열려 있는 동안만 메모리로 기억한다 — 다시 열면 다시 넣어야 한다. */
export function saveBoothCode(code: string): boolean {
  if (!FORMAT.test(code)) return false;
  memoryCode = code;
  try { localStorage.setItem(KEY, code); return true; } catch { return false; }
}

export type BoothCodeCheck = "ok" | "wrong" | "format" | "offline" | "error";

export async function verifyBoothCode(raw: string, deps: { apiBase: string; boothToken: string; fetch?: typeof fetch }): Promise<BoothCodeCheck> {
  const code = raw.trim();
  if (!FORMAT.test(code)) return "format";
  let res: Response;
  try {
    res = await (deps.fetch ?? fetch)(`${deps.apiBase}/generate`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-booth-token": deps.boothToken, "x-booth-code": code },
      body: "{}",
    });
  } catch {
    return "offline";
  }
  if (res.status === 400) return "ok";
  const body = await res.json().catch(() => null);
  return isBoothCodeRefusal(res.status, body) ? "wrong" : "error";
}
