/* Windows 설치판(desktop/ — Electron) 빌드인가(2026-10-27, _docs/intents/2026-10-27-desktop-installer).
   `npm run build:desktop`(= vite build --mode desktop)일 때만 참이다. 웹 빌드(`npm run build`)에서는 "production" === "desktop"이 거짓으로 접혀
   설치판 갈래(로컬 합성 · 예시 사진 샘플 · PC에 저장 · 인쇄 미리보기)가 웹 번들에서 통째로 빠진다.
   설치판에는 AI 생성이 없다 — 부스 토큰을 넣지 않고(constants.ts) 서버에 아무것도 보내지 않는다. */
export const DESKTOP = import.meta.env.MODE === "desktop";

/** 설치판 껍데기(desktop/preload.cjs)가 화면에 열어 준 창구. 웹에서는 없다. */
export interface DesktopBridge {
  /** 지금 화면을 4×6 인화지 · 여백 없음으로 Windows 인쇄 창에 넘긴다. 인쇄 창이 닫히면 끝난다. */
  print(): Promise<{ ok: boolean; reason?: string }>;
}

export function desktopBridge(): DesktopBridge | null {
  return DESKTOP ? ((window as unknown as { posterStudioDesktop?: DesktopBridge }).posterStudioDesktop ?? null) : null;
}
