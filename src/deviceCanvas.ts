/* 기기 갈래(2026-10-23 비율 기준 전환) — public/device-canvas.js가 <html data-device>에 붙인 갈래를 JS에서 읽는다.
   휴대폰 · 태블릿은 viewport 폭을 기준 폭(390 · 1024 · 1366)으로 맞추므로 창 폭(innerWidth)이 곧 기준 폭이다.
   PC는 <html>에 zoom을 걸어 창 폭이 기준 폭(2560)과 다르다 — 배치를 창 폭으로 판단하는 코드는 layoutWidth()를 쓴다.
   스크립트가 돌지 않은 곳(시험 · 옛 판)은 갈래가 없다 — 부르는 쪽이 예전 판정으로 돌아간다. */
export type DeviceKind = "phone" | "tablet-p" | "tablet-l" | "pc";

export function deviceKind(): DeviceKind | undefined {
  return document.documentElement.dataset.device as DeviceKind | undefined;
}

/** 배치를 고르는 폭 — PC는 캔버스 폭 2560, 그 밖은 창 폭 */
export function layoutWidth(): number {
  return deviceKind() === "pc" ? 2560 : window.innerWidth;
}
