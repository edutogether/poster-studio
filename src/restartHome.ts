const RESTART_QUERY = "studio-start";

/** navigate는 시험용 주입 지점이다 — jsdom의 location.replace는 바꿔 끼울 수 없다(test/restart-home.test.ts). */
export function restartAtHome(navigate: (href: string) => void = (href) => window.location.replace(href)) {
  // 앱 상태는 문서 자체를 다시 열어 폐기한다. 다른 앱의 저장소·캐시는 지우지 않는다.
  try { sessionStorage.removeItem("poster-studio-wait-opening"); } catch { /* 저장소 차단 시에도 재시작 */ }
  const home = new URL("/", window.location.href);
  home.searchParams.set(RESTART_QUERY, crypto.randomUUID());
  navigate(home.href);
}

export function finishHomeRestart() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(RESTART_QUERY)) return;
  url.searchParams.delete(RESTART_QUERY);
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
}
