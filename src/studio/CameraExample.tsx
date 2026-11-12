import { useEffect, useRef, useState, type CSSProperties } from "react";
import { activeCues, type ApprovedCameraVideo, type CameraCue } from "./cameraVideo.js";
import { cameraPrefetchAllowed, whenPageIdle } from "./cameraPrefetch.js";
import CAMERA_LOGO from "./camera-logo.png";

type Props = { mode: string; video?: ApprovedCameraVideo; hidden: boolean; offstage: boolean; prefetch?: boolean };

const ALT = {
  group: "모두 잘 보이게 서서 신나게 웃는 단체 촬영 구도 예시",
  solo: "얼굴과 어깨를 담고 편하게 웃는 촬영 구도 예시",
};

// 촬영 화면 예시 칸(2026-10-16). 승인된 영상이 없으면 지금 정지 그림 그대로다.
// 영상이 있으면 정지 그림(영상 첫 프레임)을 먼저 보이고, 실제로 재생되면 영상으로 넘긴다. 소리를 켜고 한 번 재생한 뒤
// 마지막 프레임(찰칵 뒤 멈춘 장면)에 머문다. 숫자 3·2·1과 대사 말풍선은 영상 시간에 맞춰 앱이 얹는다(_docs/ops/camera-example-videos.md).
// 2단계가 아니거나(offstage) 카메라를 켜면(hidden) 영상 요소를 내려 재생·소리·다운로드를 정리한다.
// 영상을 못 틀 때(자동 재생 거부 · 오류)와 4초 안에 재생이 시작되지 않을 때는 끝 정지 그림(마지막 프레임)을 보인다 — 10/19 영상은
// 손이 렌즈를 가린 어두운 장면으로 시작해, 첫 프레임을 그대로 두면 칸이 거의 검다. 그 밖(1단계 · 카메라 켬 · 재생 전)에는 늘 첫 프레임이다 —
// 10/20: 1단계에 끝 정지 그림을 두었더니 2단계로 오는 순간 주소가 바뀌어, 첫 프레임을 받기 전까지 끝 정지 그림이 잠깐 보였다(처음 방문 약 180ms).
// 10/24 Bumm님(F12 1024×768) «단체 영상이 재생 안 됨 — 이전 갔다 와도 안 됨»: 느린 망에서 4초 안에 재생이 안 시작되면 실패로 굳혀 영상 요소를 내렸고,
// 실패는 다시 2단계에 와도 풀리지 않았다(단체 4.9MB가 개인 3.9MB보다 더 자주 걸림 — 1.5Mbps 실측). 그래서 4초 정체는 끝 정지 그림만 보이고
// 영상은 계속 받아 재생이 시작되면 넘기며, 2단계를 떠나거나 카메라를 켜면 실패 표시를 지워 다음에 다시 시도한다.
// 11/11 Bumm님 «가. 늘 돌게 하기»(팀장 전달): 예시 영상은 장식이 아니라 «이렇게 서세요» 안내라 «움직임 줄이기»(prefers-reduced-motion) 신호로 막지 않는다 —
// 원격으로 연 PC의 크롬이 사람이 켠 적 없는 그 신호를 보고해 개인 · 단체 예시가 끝 정지 그림으로 멈춰 있었다. 행사 노트북도 모르게 켜져 있을 수 있다.
// 11/12 Bumm님 «안 1»(팀장 전달): 영상을 만든 도구의 로고(camera-logo.png)를 영상에 굽지 않고 칸의 보이는 오른쪽 위에 얹는다 — 영상이 칸을 덮어 좌우가 잘리므로
// 영상 모서리에 구우면 칸 밖으로 잘린다. 그림은 1920×1080 영상 안에서 보일 크기 그대로 그린 파일이고(지금 209×76), 화면 크기는 그 그림의 폭(naturalWidth)에
// 영상이 칸을 덮는 배율을 곱한 것이다 — 그림 파일만 바꾸면 크기 · 비율이 따라간다(studio.css «.camera-example-logo»).
export default function CameraExample({ mode, video, hidden, offstage, prefetch = false }: Props) {
  const alt = mode === "group" ? ALT.group : ALT.solo;
  const player = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  const [stalled, setStalled] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [cues, setCues] = useState<CameraCue[]>([]);
  const [logoWidth, setLogoWidth] = useState(0);
  const onstage = Boolean(video) && !hidden && !offstage;
  const enabled = onstage && !failed;
  // 영상 요소가 있어야 하는 때: 2단계이거나, 1단계에서 미리 준비할 때
  const armed = enabled || (Boolean(video) && !hidden && prefetch && cameraPrefetchAllowed());

  useEffect(() => { if (!onstage) { setFailed(false); setStalled(false); } }, [onstage]);

  // 1단계에 있는 동안 2단계에서 쓸 영상 요소를 미리 열어 둔다 — 파일 · 첫 프레임 · 디코더가 준비되어 넘어가면 바로 재생된다(cameraPrefetch.ts).
  // 재생 전 영상 요소는 정지 그림 뒤에서 보이지 않고 소리도 나지 않는다. 요소를 내릴 때 재생 · 소리 · 다운로드를 정리한다.
  useEffect(() => {
    const element = player.current;
    if (!armed || !element || !video) return;
    const cancel = whenPageIdle(() => { if (!element.getAttribute("src")) element.src = video.src; });
    return () => {
      cancel();
      element.pause();
      element.removeAttribute("src");
      element.load();
    };
  }, [armed, video]);

  useEffect(() => {
    const element = player.current;
    if (!enabled || !element || !video) return;
    let cancelled = false;
    if (element.getAttribute("src") !== video.src || element.error) element.src = video.src;
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
      // 1단계로 돌아가 요소가 남으면 다음에 처음부터 재생한다
      element.currentTime = 0;
    };
  }, [enabled, video]);

  useEffect(() => {
    if (!enabled || !buffering) return;
    const timer = window.setTimeout(() => setStalled(true), 4_000);
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
  return <>
  <div className="camera-example-stage" hidden={hidden}>
    <img className="camera-example-still" data-active={!(enabled && visible)} src={failed || stalled ? video.endStill : video.still} alt={alt} />
    {armed && <video ref={player} className="camera-example-video" data-active={visible} poster={video.still}
      playsInline preload="auto" aria-hidden="true" disablePictureInPicture
      onPlaying={() => { setVisible(true); setBuffering(false); setStalled(false); }}
      onWaiting={() => setBuffering(true)} onStalled={() => setBuffering(true)}
      onEnded={() => setBuffering(false)} onError={() => { if (enabled) setFailed(true); }} />}
    {cues.map(cue => cue.kind === "count"
      ? <span key={`c${cue.from}`} className="camera-example-count" aria-hidden="true">{cue.text}</span>
      : <span key={`s${cue.from}`} className="camera-example-say" style={{ left: `${cue.x}%`, top: `${cue.y}%` }}>{cue.text}</span>)}
  </div>
  <img className="camera-example-logo" src={CAMERA_LOGO} alt="" aria-hidden="true" hidden={hidden}
    style={logoWidth ? { "--logo-px": logoWidth } as CSSProperties : undefined} onLoad={(e) => setLogoWidth(e.currentTarget.naturalWidth)} />
  </>;
}
