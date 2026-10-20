import { useEffect, useRef, useState } from "react";
import { activeCues, type ApprovedCameraVideo, type CameraCue } from "./cameraVideo.js";

type Props = { mode: string; video?: ApprovedCameraVideo; hidden: boolean; offstage: boolean };

const ALT = {
  group: "모두의 얼굴이 보이게 모여 웃는 단체 촬영 구도 예시",
  solo: "얼굴과 어깨를 담고 편하게 웃는 촬영 구도 예시",
};

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const change = () => setReduced(query.matches);
    query.addEventListener?.("change", change);
    return () => query.removeEventListener?.("change", change);
  }, []);
  return reduced;
}

// 촬영 화면 예시 칸(2026-10-16). 승인된 영상이 없으면 지금 정지 그림 그대로다.
// 영상이 있으면 정지 그림(영상 첫 프레임)을 먼저 보이고, 실제로 재생되면 영상으로 넘긴다. 소리를 켜고 한 번 재생한 뒤
// 마지막 프레임(찰칵 뒤 멈춘 장면)에 머문다. 숫자 3·2·1과 대사 말풍선은 영상 시간에 맞춰 앱이 얹는다(_docs/ops/camera-example-videos.md).
// 2단계가 아니거나(offstage) 카메라를 켜면(hidden) 영상 요소를 내려 재생·소리·다운로드를 정리한다.
// 영상을 아예 못 틀 때(움직임 줄이기 · 자동 재생 거부 · 4초 정체 · 오류)는 끝 정지 그림(마지막 프레임)을 보인다 — 10/19 영상은
// 손이 렌즈를 가린 어두운 장면으로 시작해, 첫 프레임을 그대로 두면 칸이 거의 검다. 그 밖(1단계 · 카메라 켬 · 재생 전)에는 늘 첫 프레임이다 —
// 10/20: 1단계에 끝 정지 그림을 두었더니 2단계로 오는 순간 주소가 바뀌어, 첫 프레임을 받기 전까지 끝 정지 그림이 잠깐 보였다(처음 방문 약 180ms).
export default function CameraExample({ mode, video, hidden, offstage }: Props) {
  const alt = mode === "group" ? ALT.group : ALT.solo;
  const reduced = useReducedMotion();
  const player = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [cues, setCues] = useState<CameraCue[]>([]);
  const enabled = Boolean(video) && !reduced && !failed && !hidden && !offstage;

  useEffect(() => {
    const element = player.current;
    if (!enabled || !element || !video) return;
    let cancelled = false;
    element.src = video.src;
    setVisible(false); setBuffering(true);
    // 2단계로 오는 단추를 누른 뒤라 소리 있는 자동 재생이 허용된다. 그래도 거부되면 소리 없이, 그것도 안 되면 정지 그림.
    element.muted = false;
    void element.play()?.catch(() => {
      if (cancelled) return;
      element.muted = true;
      void element.play()?.catch(() => { if (!cancelled) setFailed(true); });
    });
    return () => {
      cancelled = true;
      element.pause();
      element.removeAttribute("src");
      element.load();
    };
  }, [enabled, video]);

  useEffect(() => {
    if (!enabled || !buffering) return;
    const timer = window.setTimeout(() => setFailed(true), 4_000);
    return () => window.clearTimeout(timer);
  }, [enabled, buffering]);

  // 숫자·말풍선은 매 화면마다 영상 시각을 읽어, 보여야 할 것이 바뀔 때만 다시 그린다. 화면 갱신이 멈추거나 늦는 브라우저에서도
  // 빠지지 않게 영상의 시각 갱신 사건(timeupdate, 초당 약 4번)으로도 같은 판정을 한다.
  useEffect(() => {
    const element = player.current;
    if (!enabled || !visible || !element || !video?.cues.length) return;
    let frame = 0, last = "";
    const update = () => {
      const now = element.ended ? [] : activeCues(video.cues, element.currentTime);
      const key = now.map(cue => video.cues.indexOf(cue)).join(",");
      if (key !== last) { last = key; setCues(now); }
    };
    const tick = () => { update(); if (!element.ended) frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    element.addEventListener("timeupdate", update);
    element.addEventListener("ended", update);
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener("timeupdate", update);
      element.removeEventListener("ended", update);
      setCues([]);
    };
  }, [enabled, visible, video]);

  if (!video) {
    return <img className={`camera-example${mode === "group" ? " camera-example-group" : ""}`}
      src={mode === "group" ? "/studio/camera-group.webp" : "/studio/camera-student.webp"} alt={alt} hidden={hidden} />;
  }
  return <div className="camera-example-stage" hidden={hidden}>
    <img className="camera-example-still" data-active={!(enabled && visible)} src={failed || reduced ? video.endStill : video.still} alt={alt} />
    {enabled && <video ref={player} className="camera-example-video" data-active={visible} poster={video.still}
      playsInline preload="auto" aria-hidden="true" disablePictureInPicture
      onPlaying={() => { setVisible(true); setBuffering(false); }}
      onWaiting={() => setBuffering(true)} onStalled={() => setBuffering(true)}
      onEnded={() => setBuffering(false)} onError={() => setFailed(true)} />}
    {cues.map(cue => cue.kind === "count"
      ? <span key={`c${cue.from}`} className="camera-example-count" aria-hidden="true">{cue.text}</span>
      : <span key={`s${cue.from}`} className="camera-example-say" style={{ left: `${cue.x}%`, top: `${cue.y}%` }}>{cue.text}</span>)}
  </div>;
}
