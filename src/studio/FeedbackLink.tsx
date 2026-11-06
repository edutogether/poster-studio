/* 첫 화면 «의견 보내기» 링크와 의견 창(2026-11-05 Bumm님 9 ① · 11 ② — 11/4 시안 feedback-mock-20261104 그대로).
   링크는 개인정보처리방침과 같은 줄 · 같은 글자다(자리는 feedback.css). 창: 이름(그 기기에 기억) · 의견(500자) · 함께 보내는 것 안내 · «취소» · «보내기».
   개인정보처리방침은 바꾸지 않는다(11 ②) — 알림은 이 창의 «함께 보내는 것» · «보내지 않는 것»으로 한다. */
import { useEffect, useRef, useState } from "react";
import { FEEDBACK_NAME_MAX, FEEDBACK_TEXT_MAX, rememberName, rememberedName, sendFeedback, type FeedbackResult } from "../feedback.js";
import "./feedback.css";

const PROBLEM: Record<Exclude<FeedbackResult, "ok">, string> = {
  offline: "인터넷 연결을 확인해 주세요.",
  busy: "잠시 뒤에 다시 보내 주세요.",
  error: "지금은 보낼 수 없어요. 잠시 뒤에 다시 해 주세요.",
};

export default function FeedbackLink({ step }: { step: number }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="feedback-link" onClick={() => setOpen(true)}>의견 보내기</button>
    {open && <FeedbackDialog step={step} onClose={() => setOpen(false)} />}
  </>;
}

function FeedbackDialog({ step, onClose }: { step: number; onClose: () => void }) {
  const [name, setName] = useState(rememberedName);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const textInput = useRef<HTMLTextAreaElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  // 이름을 기억하고 있으면 바로 의견 칸에서 시작한다
  const startWithText = useRef(name.trim() !== "");
  useEffect(() => { (startWithText.current ? textInput : nameInput).current?.focus(); }, []);
  useEffect(() => { if (sent) closeButton.current?.focus(); }, [sent]);

  const submit = async () => {
    const n = name.trim(), t = text.trim();
    if (!n) { setProblem("이름을 적어 주세요."); nameInput.current?.focus(); return; }
    if (!t) { setProblem("의견을 적어 주세요."); textInput.current?.focus(); return; }
    setSending(true); setProblem(null);
    const result = await sendFeedback(n, t, step);
    setSending(false);
    if (result === "ok") { rememberName(n); setText(""); setSent(true); }
    else setProblem(PROBLEM[result]);
  };

  return <div className="feedback-backdrop">
    <div className="feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="feedbackTitle"
      onKeyDown={e => { if (e.key === "Escape" && !sending) onClose(); }}>
      {sent ? <>
        <h2 id="feedbackTitle">보냈어요</h2>
        <p className="feedback-sub">의견을 잘 받았어요. 고맙습니다.</p>
        <div className="feedback-actions">
          <button type="button" ref={closeButton} className="feedback-send" onClick={onClose}>닫기</button>
        </div>
      </> : <>
        <h2 id="feedbackTitle">의견 보내기</h2>
        <p className="feedback-sub">테스트하면서 불편했던 점이나 고칠 점, 오류를 적어 주세요.</p>
        <form onSubmit={e => { e.preventDefault(); if (!sending) void submit(); }}>
          <label htmlFor="feedbackName">이름 <span className="feedback-hint"><span className="feedback-dash">— </span>피드백을 살펴보고 추가로 문의드릴 것이 있을 때를 위해 적어 주세요.</span></label>
          <input id="feedbackName" ref={nameInput} type="text" autoComplete="off" maxLength={FEEDBACK_NAME_MAX}
            value={name} onChange={e => setName(e.target.value)} disabled={sending} />
          <div className="feedback-text-head">
            <label htmlFor="feedbackText">의견 <span className="feedback-hint"><span className="feedback-dash">— </span>어느 화면에서 어떤 문제가 있었는지 함께 적어 주세요.</span></label>
            <p id="feedbackCount" className="feedback-count">{[...text].length} / {FEEDBACK_TEXT_MAX}</p>
          </div>
          <textarea id="feedbackText" ref={textInput} maxLength={FEEDBACK_TEXT_MAX}
            value={text} onChange={e => setText(e.target.value)} disabled={sending} aria-describedby="feedbackCount" />
          <p className="feedback-auto"><span>함께 보내는 것: 판 번호 · 화면 크기 · 기기 · 단계</span> <span>보내지 않는 것: 여러분이 찍은 사진</span></p>
          <p className="feedback-problem" role="alert">{problem ?? ""}</p>
          <div className="feedback-actions">
            <button type="button" className="feedback-cancel" onClick={onClose} disabled={sending}>취소</button>
            <button type="submit" className="feedback-send" disabled={sending}>{sending ? "보내는 중…" : "보내기"}</button>
          </div>
        </form>
      </>}
    </div>
  </div>;
}
