/* Windows 설치판(desktop/ — Electron) 빌드인가(2026-10-27, _docs/intents/2026-10-27-desktop-installer).
   `npm run build:desktop`(= vite build --mode desktop)일 때만 참이다. 웹 빌드(`npm run build`)에서는 "production" === "desktop"이 거짓으로 접혀
   설치판 갈래(로컬 합성 · 예시 사진 샘플 · PC에 저장 · 인쇄 미리보기)가 웹 번들에서 통째로 빠진다.
   설치판에는 AI 생성이 없다 — 부스 토큰을 넣지 않고(constants.ts) 서버에 아무것도 보내지 않는다. */
export const DESKTOP = import.meta.env.MODE === "desktop";

export type PrintResult = { ok: boolean; reason?: string };

/** 설치판 껍데기(desktop/preload.cjs)가 화면에 열어 준 창구. 웹에서는 없다. */
export interface DesktopBridge {
  /** 지금 화면을 4×6 인화지 · 여백 없음으로 Windows 인쇄 창에 넘긴다. 인쇄 창이 닫히면 끝난다. */
  print(): Promise<PrintResult>;
  /** 저장(Windows 저장 창)이 끝날 때마다 결과를 받는다 — 사람이 저장 창을 닫으면 오지 않는다. 돌려준 함수를 부르면 그만 듣는다. */
  onSaveDone(listener: (ok: boolean) => void): () => void;
}

export function desktopBridge(): DesktopBridge | null {
  return DESKTOP ? ((window as unknown as { posterStudioDesktop?: DesktopBridge }).posterStudioDesktop ?? null) : null;
}

/** 인쇄가 실패했는가 — 사람이 인쇄 창을 닫은 것(Electron «Print job canceled» · 옛 판 «cancelled»)은 실패가 아니다(2026-11-02). */
export function printFailed(result: PrintResult): boolean {
  return !result.ok && !/cancel/i.test(result.reason ?? "");
}
