import { useEffect, useRef, useState } from "react";
import type { BoothCodeCheck } from "../boothCode.js";

type Props = { open: boolean; verify: (code: string) => Promise<BoothCodeCheck>; onSaved: (code: string) => void; onClose: () => void };

const MESSAGE: Record<Exclude<BoothCodeCheck, "ok">, string> = {
  wrong: "코드가 맞지 않아요. 다시 확인해 주세요.",
  format: "영문·숫자·하이픈으로 4~64자를 넣어 주세요.",
  offline: "인터넷 연결을 확인해 주세요.",
  error: "지금은 확인할 수 없어요. 잠시 후 다시 해 주세요.",
};

// 부스 코드 입력 창(2026-10-16). 생성 요청이 «부스 코드» 거절을 받았을 때만 열린다(서버 스위치가 꺼져 있으면 열릴 일이 없다).
// 넣은 코드는 확인(verify)을 거쳐 맞을 때만 부모에게 넘긴다 — 보관과 생성 다시 시도는 부모가 한다.
export default function BoothCodeDialog({ open, verify, onSaved, onClose }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setProblem(null); setChecking(false);
    input.current?.focus();
  }, [open]);

  if (!open) return null;
  const submit = async () => {
    const code = (input.current?.value ?? "").trim();
    setChecking(true); setProblem(null);
    const result = await verify(code);
    setChecking(false);
    if (result === "ok") onSaved(code);
    else { setProblem(MESSAGE[result]); input.current?.select(); }
  };
  return <div className="booth-code-backdrop">
    <div className="booth-code-dialog" role="dialog" aria-modal="true" aria-labelledby="boothCodeTitle"
      onKeyDown={e => { if (e.key === "Escape" && !checking) onClose(); }}>
      <h2 id="boothCodeTitle">부스 코드를 넣어 주세요</h2>
      <p>행사 부스 노트북에서만 포스터를 만들 수 있어요. 진행 선생님께 받은 코드를 한 번 넣으면 이 노트북이 기억해요.</p>
      <form onSubmit={e => { e.preventDefault(); if (!checking) void submit(); }}>
        <label htmlFor="boothCodeInput">부스 코드</label>
        <input id="boothCodeInput" ref={input} type="text" autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={64}
          aria-invalid={problem ? true : undefined} aria-describedby={problem ? "boothCodeProblem" : undefined} disabled={checking} />
        <p id="boothCodeProblem" className="booth-code-problem" role="alert">{problem ?? ""}</p>
        <div className="booth-code-actions">
          <button type="button" className="back-button" onClick={onClose} disabled={checking}>닫기</button>
          <button type="submit" className="primary-button" disabled={checking}>{checking ? "확인하는 중…" : "확인"}</button>
        </div>
      </form>
    </div>
  </div>;
}
