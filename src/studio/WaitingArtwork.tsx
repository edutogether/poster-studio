import { useEffect, useRef, useState } from "react";

type Props = { image: string; theme: string; video?: string; paused: boolean; reduced: boolean };

// 장면 교체 시 부모의 key로 폐기한다. 인쇄 캔버스나 생성 요청과 연결하지 않는다.
export default function WaitingArtwork({ image, theme, video, paused, reduced }: Props) {
  const player = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const enabled = Boolean(video) && !reduced && !failed;

  useEffect(() => {
    const element = player.current;
    if (enabled && element && video) {
      // 개발 모드의 effect 재실행에서도 정리된 소스를 복구한다.
      element.src = video;
      setVisible(false); setBuffering(true);
    }
    return () => {
      if (!element) return;
      element.pause();
      element.removeAttribute("src");
      element.load();
    };
  }, [enabled, video]);

  useEffect(() => {
    const element = player.current;
    if (!enabled || !element) return;
    let cancelled = false;
    if (paused) element.pause();
    else if (!element.ended) {
      element.muted = true;
      // 자동 재생 거부 시에도 검은 화면 대신 승인 원화를 표시한다.
      void element.play().catch(() => { if (!cancelled) setFailed(true); });
    }
    return () => { cancelled = true; element.pause(); };
  }, [enabled, paused, video]);

  useEffect(() => {
    if (!enabled || paused || !buffering) return;
    const timer = window.setTimeout(() => setFailed(true), 4_000);
    return () => window.clearTimeout(timer);
  }, [enabled, paused, buffering]);

  return <>
    <img className="generation-robot-film" data-active="true" src={image} width={704} height={704} alt={theme} />
    {enabled && <video ref={player} className="generation-robot-film generation-robot-video"
      data-active={visible} src={video} poster={image} width={704} height={704}
      muted playsInline preload="auto" aria-hidden="true" disablePictureInPicture
      onPlaying={() => { setVisible(true); setBuffering(false); }}
      onWaiting={() => setBuffering(true)} onStalled={() => setBuffering(true)}
      onEnded={() => setBuffering(false)} onError={() => setFailed(true)} />}
  </>;
}
