import { useEffect, useRef, useState } from "react";
import type { GenerateFailure } from "../generateFailure.js";

type Props = {
  failure: GenerateFailure | null;
  /** 인터넷이 끊긴 실패(offline)일 때 부모가 연결을 확인해 알려 준다. */
  online: boolean;
  onRetry: () => void;
  onRetake: () => void;
  onEditInputs: () => void;
};

// «포스터를 만들지 못했어요» 안내 창(2026-10-16, 다시 만들기 설계). 빈 그라데이션 포스터로 넘어가지 않고,
// 실패 종류(src/generateFailure.ts)에 맞는 다음 단추를 보인다. 진행자용 원인은 작게 함께 보인다.
// 부스 코드 실패(booth)는 이 창이 아니라 부스 코드 입력 창이 맡는다 — 부모가 그쪽을 연다.
export default function GenerateFailureDialog({ failure, online, onRetry, onRetake, onEditInputs }: Props) {
  const primary = useRef<HTMLButtonElement>(null);
  const [left, setLeft] = useState(0);

  // 남은 초는 마감 시각에서 계산한다 — 화면이 잠깐 멈췄다 돌아와도 실제 시간대로 줄어든다.
  useEffect(() => {
    if (failure?.action !== "wait") { setLeft(0); return; }
    const deadline = Date.now() + (failure.waitSeconds ?? 20) * 1_000;
    const update = () => setLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1_000)));
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [failure]);
  useEffect(() => { primary.current?.focus(); }, [failure]);

  if (!failure || failure.action === "booth") return null;
  const { action } = failure;
  const waiting = action === "wait" && left > 0;
  const offline = action === "offline" && !online;
  return <div className="generate-failure-backdrop">
    <div className="generate-failure-dialog" role="alertdialog" aria-modal="true" aria-labelledby="generateFailureTitle" aria-describedby="generateFailureMessage">
      <h2 id="generateFailureTitle">포스터를 만들지 못했어요</h2>
      <p id="generateFailureMessage">{failure.message}</p>
      {action === "offline" && <p className="generate-failure-state" role="status">{online ? "인터넷이 다시 연결됐어요." : "인터넷 연결을 확인하는 중…"}</p>}
      {action === "staff" && <p className="generate-failure-state">선생님을 불러 주세요.</p>}
      {failure.staffNote && <p className="generate-failure-note">진행자 확인용: {failure.staffNote}</p>}
      <div className="generate-failure-actions">
        {action === "fix" && <>
          <button type="button" className="back-button" onClick={onRetake}>다시 찍기</button>
          <button ref={primary} type="button" className="primary-button" onClick={onEditInputs}>제목·문구 고치기</button>
        </>}
        {action === "retake" && <button ref={primary} type="button" className="primary-button" onClick={onRetake}>다시 찍기</button>}
        {(action === "retry" || action === "wait" || action === "offline" || action === "staff") && <>
          <button type="button" className="back-button" onClick={onRetake}>다시 찍기</button>
          <button ref={primary} type="button" className="primary-button" onClick={onRetry} disabled={waiting || offline}>
            {waiting ? `다시 만들기 (${left}초)` : "다시 만들기"}
          </button>
        </>}
      </div>
    </div>
  </div>;
}
