import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { waitingSets } from "./waitingSets.js";
import "./generation-wait.css";
import "./waiting-art.css";

const OPENING_KEY = "poster-studio-wait-opening";
/** 로딩 화면 한 장면(그림·제목·상식 한 세트)이 머무는 시간. 샘플 모드의 대기 길이도 이것으로 센다. */
export const SCENE_MS = 8_000;
let lastOpeningId = -1;
/* 자리마다 균등한 32비트 난수 열쇠를 하나씩 뽑아 그 크기 순서로 늘어놓는다. 난수를 나누거나 곱해 범위를
   줄이지 않으므로 치우침이 없다(예전 «나눈 뒤 내림»은 2^32가 자리 수로 안 나눠떨어져 아주 조금 치우쳤다).
   열쇠가 같을 확률은 12장 기준 약 1/6,500만이고, 같으면 원래 순서를 따른다(정렬이 안정적이다). */
function shuffled(length: number) {
  const keys = crypto.getRandomValues(new Uint32Array(length));
  return Array.from({ length }, (_, i) => i).sort((a, b) => (keys[a] < keys[b] ? -1 : keys[a] > keys[b] ? 1 : 0));
}
// 그림·제목·상식을 한 세트로 섞는다. 포스터 조판의 Math.random과 독립적이다.
export function createWaitSequence() {
  let previous = lastOpeningId;
  try { previous = Number(sessionStorage.getItem(OPENING_KEY) ?? previous); } catch { /* 저장소 차단 시 메모리 기록 사용 */ }
  const sequence = shuffled(waitingSets.length).map(index => waitingSets[index]);
  if (sequence[0].id === previous) [sequence[0], sequence[1]] = [sequence[1], sequence[0]];
  lastOpeningId = sequence[0].id;
  try { sessionStorage.setItem(OPENING_KEY, String(lastOpeningId)); } catch { /* 세션 안에서는 메모리 기록 사용 */ }
  return sequence;
}

export default function GenerationWait({ spinTextRef }: { spinTextRef: RefObject<HTMLParagraphElement | null> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [reduced, setReduced] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  const [scenes] = useState(createWaitSequence);
  const [sceneIndex, setSceneIndex] = useState(0);
  // 로딩 화면은 멈추는 화면이 아니다(2026-10-06 Bumm님 결정 118) — 자동 넘김은 «움직임 줄이기» 설정에서만 멈춘다.
  const still = reduced;
  const scene = scenes[sceneIndex];

  useEffect(() => {
    const element = dialog.current!;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    if (typeof element.showModal === "function") element.showModal();
    else element.setAttribute("open", "");
    heading.current?.focus();
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media?.matches ?? false);
    media?.addEventListener?.("change", update);
    return () => {
      document.documentElement.style.overflow = previousOverflow;
      media?.removeEventListener?.("change", update);
      if (element.open && typeof element.close === "function") element.close();
    };
  }, []);

  useEffect(() => {
    if (still) return;
    const timer = window.setInterval(() => setSceneIndex(value => (value + 1) % scenes.length), SCENE_MS);
    return () => window.clearInterval(timer);
  }, [still, scenes.length]);

  useEffect(() => {
    const next = new Image();
    next.src = scenes[(sceneIndex + 1) % scenes.length].image;
  }, [sceneIndex, scenes]);

  return (
    <dialog ref={dialog} id="spinner" className="generation-wait spinner" data-paused={still} data-scene={sceneIndex} data-set-id={scene.id} aria-labelledby="generationTitle" onCancel={event => event.preventDefault()}>
      <div className="generation-content">
        <div className="generation-film waiting-art-frame" data-art={scene.id}>
          <img className="generation-robot-film" data-active="true" src={scene.image} width={704} height={704} alt={scene.theme} />
        </div>
        <h1 ref={heading} tabIndex={-1} id="generationTitle" className="generation-copy-stack">
          {scenes.map(({ id, title }, index) => <span key={id} className="generation-copy" data-active={index === sceneIndex} aria-hidden={index !== sceneIndex}>{title}</span>)}
        </h1>
        <div className="generation-dots" aria-hidden="true">
          {[0, 1, 2].map(index => <i key={index}/>)}
        </div>
        <section className="movie-fact" aria-label="영화 속 작은 이야기">
          <div className="generation-copy-stack movie-fact-titles">
            {scenes.map(({ fact: { title } }, index) => <h2 key={title} data-active={index === sceneIndex} aria-hidden={index !== sceneIndex}>{title}</h2>)}
          </div>
          <div className="generation-copy-stack movie-fact-bodies">
            {scenes.map(({ fact: { body } }, index) => <p key={body} data-active={index === sceneIndex} aria-hidden={index !== sceneIndex}>{body}</p>)}
          </div>
        </section>
        <p ref={spinTextRef} className="generation-elapsed" aria-hidden="true">기다린 시간 · 0초</p>
      </div>
    </dialog>
  );
}
