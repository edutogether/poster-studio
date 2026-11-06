/* 1단계에 머무는 동안 2단계 예시 영상을 미리 준비할지 · 언제 시작할지(2026-11-07 Bumm님 «넘기면 처음에 좀 딜레이되었다 시작», 팀장 전달).
   파일만 캐시에 받아 두면 그 브라우저의 첫 재생 준비(약 0.15초)가 그대로 남는다 — 그래서 fetch가 아니라 2단계에서 쓸 <video>를 1단계에 미리 연다.
   넘어가는 순간에도 같은 요소가 받던 것을 이어 받으므로 끊기거나 두 번 받지 않는다. */
import { DESKTOP } from "../desktop.js";

const IDLE_LIMIT_MS = 3_000;
const SETTLE_CHECK_MS = 250;
const SETTLE_LIMIT_MS = 20_000;

/** 설치판은 파일이 이 컴퓨터에 있어 미리 준비할 까닭이 없고, 데이터 절약 모드는 쓰지 않은 데이터를 쓰지 않는다. */
export function cameraPrefetchAllowed() {
  return !DESKTOP && (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData !== true;
}

/** 1단계 화면의 그림 · 글꼴을 다 받았는가. 장르 포스터는 load 뒤에 요청되므로 load만 기다리면 영상이 포스터와 망을 나눠 쓴다(1.6Mbps 실측: 가장 큰 포스터가 약 2~3초 늦었다). */
function firstScreenSettled() {
  return document.readyState === "complete"
    && document.fonts?.status !== "loading"
    && Array.from(document.images).every((image) => image.complete);
}

/** 1단계 화면이 다 받아진 뒤(늦어도 20초) 브라우저가 한가할 때 run을 부른다 — 화면 · 타자를 방해하지 않게. 돌려준 함수로 취소한다. */
export function whenPageIdle(run: () => void): () => void {
  let cancel = () => {};
  const idle = () => {
    if (!window.requestIdleCallback) { const timer = window.setTimeout(run, 200); cancel = () => window.clearTimeout(timer); return; }
    const id = window.requestIdleCallback(run, { timeout: IDLE_LIMIT_MS });
    cancel = () => window.cancelIdleCallback(id);
  };
  const started = Date.now();
  const check = () => {
    if (firstScreenSettled() || Date.now() - started >= SETTLE_LIMIT_MS) { idle(); return; }
    const timer = window.setTimeout(check, SETTLE_CHECK_MS);
    cancel = () => window.clearTimeout(timer);
  };
  check();
  return () => cancel();
}
