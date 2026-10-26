import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { waitingSets } from "./waitingSets.js";
import { approvedWaitingVideo } from "./waitingVideo.js";
import { prefetchWaitingVideo, waitingVideosReady } from "./waitingNetwork.js";
import WaitingArtwork from "./WaitingArtwork.js";
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

/** 생성이 끝났을 때 부르는 «지금 대기 영상이 끝날 때까지 기다리기»(2026-10-20 Bumm님 «재생 중인 대기 영상은 끝까지 틀고 넘어감» — PC도).
 *  영상이 재생 중이 아니면(정지 그림 · 움직임 줄이기) 바로 끝난다. 기다리는 동안은 8초 장면 넘김을 멈춘다 — 늦게 시작한 영상이
 *  장면 경계에서 잘리지 않게. 한도는 남은 길이 + 0.3초(«ended»가 오지 않는 경우), 많아야 9초. */
export type SceneEnd = () => Promise<void>;

export default function GenerationWait({ spinTextRef, sceneEndRef }: { spinTextRef: RefObject<HTMLParagraphElement | null>; sceneEndRef?: { current: SceneEnd | null } }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [reduced, setReduced] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  const [scenes] = useState(createWaitSequence);
  const [sceneIndex, setSceneIndex] = useState(0);
  const holdRef = useRef(false);
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
    const timer = window.setInterval(() => { if (!holdRef.current) setSceneIndex(value => (value + 1) % scenes.length); }, SCENE_MS);
    return () => window.clearInterval(timer);
  }, [still, scenes.length]);

  useEffect(() => {
    if (!sceneEndRef) return;
    sceneEndRef.current = () => new Promise<void>((resolve) => {
      const v = dialog.current?.querySelector<HTMLVideoElement>('video[data-active="true"]');
      if (still || !v || v.paused || v.ended) { resolve(); return; }
      holdRef.current = true;
      const left = Math.max(0, ((Number.isFinite(v.duration) ? v.duration : SCENE_MS / 1000) - v.currentTime) * 1000);
      const done = () => { v.removeEventListener("ended", done); window.clearTimeout(timer); resolve(); };
      const timer = window.setTimeout(done, Math.min(left + 300, 9_000));
      v.addEventListener("ended", done);
    });
    return () => { sceneEndRef.current = null; };
  }, [sceneEndRef, still]);

  useEffect(() => {
    const next = new Image();
    next.src = scenes[(sceneIndex + 1) % scenes.length].image;
  }, [sceneIndex, scenes]);

  // 망을 쓰는 차례(waitingNetwork.ts — 2026-10-26): 지금 장면 영상을 다 받은 뒤에 다음 장면 영상을 받고, 그것까지 받으면
  // 생성 단추가 걸어 둔 조판 받기를 연다. 느린 망에서 지금 장면 영상이 다른 받기와 망을 나눠 멈추지 않게.
  // 정지 그림은 장면이 바뀌자마자 보여야 하므로 위에서 따로(예전처럼 장면 시작에) 받는다.
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const onSceneLoaded = () => {
    const video = reduced ? undefined : approvedWaitingVideo(scenes[(sceneIndex + 1) % scenes.length].id);
    void (video ? prefetchWaitingVideo(video) : Promise.resolve()).then(() => { if (alive.current) waitingVideosReady(); });
  };

  return (
    <dialog ref={dialog} id="spinner" className="generation-wait spinner" data-paused={still} data-scene={sceneIndex} data-set-id={scene.id} aria-labelledby="generationTitle" onCancel={event => event.preventDefault()}>
      <div className="generation-content">
        <div className="generation-film waiting-art-frame" data-art={scene.id}>
          <WaitingArtwork key={scene.id} image={scene.image} theme={scene.theme} video={approvedWaitingVideo(scene.id)} paused={still} reduced={reduced} onLoaded={onSceneLoaded} />
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
