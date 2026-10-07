/* 부스 코드 — 행사 기기에서만 AI 생성을 허용할 때 서버가 확인하는 값(서버 스위치는 기본 꺼짐).
   화면에는 입력칸이 없다. 진행자가 주소 뒤에 #booth=<코드>를 붙여 한 번 열면 이 브라우저에
   보관하고 주소창에서는 바로 지운다(#booth= 로 비워 열면 지운다). 보관된 값이 있을 때만 생성
   요청 헤더에 싣는다 — 없으면 요청은 예전과 같다. 형식은 서버(functions/index.js)와 같다. */
const KEY = "poster-studio-booth-code";
const FORMAT = /^[A-Za-z0-9-]{4,64}$/;
const HASH = /^#booth=(.*)$/;

export function captureBoothCode(loc: Location = window.location, hist: History = window.history) {
  const match = HASH.exec(loc.hash);
  if (!match) return;
  let code: string | null = null;
  try { code = decodeURIComponent(match[1]).trim(); } catch { /* 깨진 값은 무시한다(보관된 코드도 그대로 둔다) */ }
  try {
    if (code === "") localStorage.removeItem(KEY);
    else if (code && FORMAT.test(code)) localStorage.setItem(KEY, code);
  } catch { /* 저장소가 막힌 브라우저는 코드 없이 동작한다 */ }
  hist.replaceState(hist.state, "", loc.pathname + loc.search);
}

export function boothCodeHeaders(): Record<string, string> {
  try {
    const code = localStorage.getItem(KEY);
    return code && FORMAT.test(code) ? { "x-booth-code": code } : {};
  } catch {
    return {};
  }
}
