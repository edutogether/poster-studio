/* 첫 화면 «↓ 다운로드» — 개인정보처리방침 링크 바로 옆의 작은 보조 링크(2026-10-27 Bumm님, 팀장 전달).
   누르면 작은 메뉴에 «Poster Studio 설치»가 나오고, 그 항목이 곧 설치 파일 링크다(Voice Cinema 항목은 두지 않는다 — 10/27 정정).
   🔴 누르기 전에는 설치 파일을 하나도 받지 않는다 — 평범한 <a href>라 사람이 항목을 누를 때만 받는다. prefetch · preload ·
   서비스워커 미리 받기에 넣지 않는다(scripts/verify/download-button-probe.mjs가 네트워크 기록으로 «누르기 전 0건 · 누른 뒤 시작»을 잰다).
   화살표(↓)는 글자가 아니라 그림이다 — 화면 글꼴 서브셋에 없는 글자라, 서브셋(웹 글꼴 파일)을 다시 만들지 않으려고(npm run fonts:check). */
import { useEffect, useRef, useState } from "react";
import { DOWNLOADS } from "../downloads.js";
import "./download-menu.css";

export default function DownloadMenu() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<Array<HTMLAnchorElement | null>>([]);

  // 메뉴 밖을 누르거나 Esc면 닫는다. Esc는 초점을 단추로 돌려준다.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const onTriggerKey = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowDown") return;
    event.preventDefault();
    setOpen(true);
    requestAnimationFrame(() => items.current[0]?.focus());
  };
  const onItemKey = (event: React.KeyboardEvent, i: number) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const next = (i + (event.key === "ArrowDown" ? 1 : -1) + DOWNLOADS.length) % DOWNLOADS.length;
    items.current[next]?.focus();
  };

  return (
    <div className="download-menu" ref={root}>
      <button type="button" ref={trigger} className="download-link" aria-haspopup="menu" aria-expanded={open} aria-controls="downloadMenuList"
        onClick={() => setOpen((v) => !v)} onKeyDown={onTriggerKey}>
        <svg className="download-arrow" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.5v8M2.5 6 6 9.5 9.5 6"/></svg>다운로드
      </button>
      {open && (
        <div id="downloadMenuList" className="download-menu-list" role="menu" aria-label="설치 파일 받기">
          {DOWNLOADS.map((d, i) => (
            <a key={d.file} ref={(el) => { items.current[i] = el; }} role="menuitem" href={d.href} download={d.file}
              onClick={() => setOpen(false)} onKeyDown={(event) => onItemKey(event, i)}>
              {d.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
