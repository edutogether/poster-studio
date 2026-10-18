import { useEffect, useRef, useState } from "react";
import type { GenerateFailure } from "../generateFailure.js";
import DialogIcon, { type DialogIconName } from "./DialogIcon.js";

type Props = {
  failure: GenerateFailure | null;
  /** 인터넷이 끊긴 실패(offline)일 때 부모가 연결을 확인해 알려 준다. */
  online: boolean;
  onRetry: () => void;
  onRetake: () => void;
  onEditInputs: () => void;
  onHome: () => void;
};

type Button = { label: string; icon: DialogIconName; onClick: () => void; primary?: boolean; disabled?: boolean };

// «포스터를 만들지 못했어요» 안내 창(2026-10-16 다시 만들기 설계, 2026-10-17 Bumm님 피드백 반영).
// - 단추는 늘 두 개, 같은 크기, lucide 아이콘. 창 크기는 종류와 상관없이 같다(문구 한 줄 + 상태 한 줄 자리 + 단추 줄).
// - 문구는 한 줄. 진행자용 원인은 화면에 보이지 않는다(브라우저 콘솔에만 남긴다).
// 부스 코드 실패(booth)는 이 창이 아니라 부스 코드 입력 창이 맡는다 — 부모가 그쪽을 연다.
export default function GenerateFailureDialog({ failure, online, onRetry, onRetake, onEditInputs, onHome }: Props) {
  const primary = useRef<HTMLButtonElement>(null);
  const [left, setLeft] = useState(0);
  const [dots, setDots] = useState(0);

  // 남은 초는 마감 시각에서 계산한다 — 화면이 잠깐 멈췄다 돌아와도 실제 시간대로 줄어든다.
  useEffect(() => {
    if (failure?.action !== "wait") { setLeft(0); return; }
    const deadline = Date.now() + (failure.waitSeconds ?? 20) * 1_000;
    const update = () => setLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1_000)));
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [failure]);
  // 인터넷을 확인하는 동안 «중 → 중. → 중.. → 중...»으로 점이 돌아 계속 시도하고 있는 것이 보이게 한다.
  const checking = failure?.action === "offline" && !online;
  useEffect(() => {
    if (!checking) { setDots(0); return; }
    const timer = window.setInterval(() => setDots(value => (value + 1) % 4), 500);
    return () => window.clearInterval(timer);
  }, [checking]);
  useEffect(() => {
    if (failure?.staffNote) console.warn("[포스터 생성 실패]", failure.staffNote);
    primary.current?.focus();
  }, [failure]);

  if (!failure || failure.action === "booth") return null;
  const { action } = failure;
  const waiting = action === "wait" && left > 0;
  const retake: Button = { label: "다시 찍기", icon: "camera", onClick: onRetake };
  const retry: Button = { label: waiting ? `다시 만들기 (${left}초)` : "다시 만들기", icon: "refresh", onClick: onRetry, primary: true, disabled: waiting || checking };
  const buttons: Button[] =
    action === "fix" ? [retake, { label: "제목 · 문구 고치기", icon: "pencil", onClick: onEditInputs, primary: true }]
    : action === "retake" ? [{ label: "처음으로", icon: "house", onClick: onHome }, { ...retake, primary: true }]
    : [retake, retry];
  const state = action !== "offline" ? "" : online ? "인터넷이 다시 연결됐어요." : `인터넷 연결을 확인하는 중${".".repeat(dots)}`;
  return <div className="generate-failure-backdrop">
    <div className="generate-failure-dialog" role="alertdialog" aria-modal="true" aria-labelledby="generateFailureTitle" aria-describedby="generateFailureMessage">
      <h2 id="generateFailureTitle">포스터를 만들지 못했어요</h2>
      <p id="generateFailureMessage">{failure.message}</p>
      <p className="generate-failure-state" role="status">{state}</p>
      <div className="generate-failure-actions">
        {buttons.map(b => <button key={b.label} ref={b.primary ? primary : undefined} type="button"
          className={b.primary ? "primary-button" : "back-button"} onClick={b.onClick} disabled={b.disabled}>
          <DialogIcon name={b.icon} />{b.label}
        </button>)}
      </div>
    </div>
  </div>;
}
