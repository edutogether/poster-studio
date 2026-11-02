/* Poster Studio 설치판 — 화면(렌더러)이 죽거나 · 멈추거나 · 앱 화면을 못 읽어도 빈 창이 그대로 남지 않게 한다(2026-11-02 종합감사).
   부스 진행자가 앱을 다시 켜지 않아도 되게 앱 첫 화면을 다시 읽고, 원인을 기록한다. 짧은 간격에 되풀이되면 더 읽지 않고 안내한다
   (끝없이 다시 읽는 고리를 막는다). Electron을 불러오지 않으므로 vitest가 그대로 시험한다(test/desktop-recovery.test.js). */

export const RELOAD_LIMIT = 3;              // RELOAD_WINDOW_MS 안에 이만큼 다시 읽었으면 멈추고 안내한다
export const RELOAD_WINDOW_MS = 60_000;
export const RELOAD_DELAY_MS = 1_000;       // 실패 직후 바로 읽지 않는다 — 크로뮴이 오류 화면을 붙이는 것과 겹치지 않게
export const UNRESPONSIVE_GRACE_MS = 10_000; // «응답 없음»(크로뮴 기준 약 15초 멈춤) 뒤에도 이만큼 더 멈춰 있으면 화면 프로세스를 끊고 다시 읽는다
const ERR_ABORTED = -3;                     // 다른 이동이 앞선 읽기를 끊은 것 — 실패가 아니다

/** 다시 읽어도 되는가 — windowMs 안에 limit번 읽었으면 거짓. */
export function createReloadGate({ limit = RELOAD_LIMIT, windowMs = RELOAD_WINDOW_MS, now = Date.now } = {}) {
  const times = [];
  return () => {
    const t = now();
    while (times.length && t - times[0] >= windowMs) times.shift();
    if (times.length >= limit) return false;
    times.push(t);
    return true;
  };
}

/**
 * 창 하나의 화면(webContents)을 지켜본다.
 * @param contents Electron webContents 모양(on · isDestroyed · forcefullyCrashRenderer)
 * @param o.home   앱 첫 화면 주소 접두(«app://studio/») — 이 주소의 본 화면을 못 읽었을 때만 다시 읽는다
 * @param o.reload 앱 첫 화면을 다시 연다
 * @param o.giveUp 다시 읽기를 멈추고 안내한다(한 번만 부른다)
 * @param o.log    원인 한 줄을 남긴다
 * @param o.isBusy 참이면(인쇄 창이 열려 있는 동안) «응답 없음»이어도 끊지 않고 다시 기다린다 — 인쇄 창이 화면을 붙잡고 있을 수 있다
 */
export function watchRenderer(contents, { home, reload, giveUp, log, isBusy = () => false, gate = createReloadGate(), setTimer = setTimeout, clearTimer = clearTimeout }) {
  let stopped = false;
  let hang = null;
  const alive = () => !stopped && !contents.isDestroyed();
  const recover = (cause) => {
    if (!alive()) return;
    log(cause);
    if (!gate()) {
      stopped = true;
      log(`${RELOAD_WINDOW_MS / 1000}초 안에 ${RELOAD_LIMIT}번 다시 읽어 멈춤 — 안내 창`);
      giveUp();
      return;
    }
    setTimer(() => { if (alive()) reload(); }, RELOAD_DELAY_MS);
  };
  const clearHang = () => {
    if (hang) clearTimer(hang);
    hang = null;
  };
  const armHang = () => {
    hang = setTimer(() => {
      if (!alive()) { hang = null; return; }
      if (isBusy()) { armHang(); return; }
      hang = null;
      log(`화면이 ${UNRESPONSIVE_GRACE_MS / 1000}초 더 응답하지 않아 화면 프로세스를 끊음`);
      contents.forcefullyCrashRenderer();   // → render-process-gone(killed) → 다시 읽기
    }, UNRESPONSIVE_GRACE_MS);
  };

  contents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return;   // 창을 닫을 때의 정상 종료
    clearHang();
    recover(`화면 프로세스 끝남: ${details.reason} (종료 코드 ${details.exitCode})`);
  });
  contents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === ERR_ABORTED || !String(validatedURL).startsWith(home)) return;
    recover(`화면을 읽지 못함: ${errorCode} ${errorDescription} ${validatedURL}`);
  });
  contents.on('unresponsive', () => {
    if (hang || !alive()) return;
    log('화면 응답 없음');
    armHang();
  });
  contents.on('responsive', () => {
    if (!hang) return;
    clearHang();
    log('화면 응답 돌아옴');
  });
}

/** 저장(will-download)이 끝난 상태 → 화면에 알릴 결과. 사람이 저장 창을 닫은 것(cancelled)은 알리지 않는다(null). */
export function saveResult(state) {
  if (state === 'completed') return true;
  if (state === 'cancelled') return null;
  return false;
}
