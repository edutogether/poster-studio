import { useEffect, useRef, useState } from "react";

type Props = { image: string; theme: string; video?: string; paused: boolean; reduced: boolean; onLoaded?: () => void };

// 장면 교체 시 부모의 key로 폐기한다. 인쇄 캔버스나 생성 요청과 연결하지 않는다.
// 2026-10-07 장착 가지(codex/claude-handoff-20261005)의 재생 부품을 2026-10-12 Seedance 최종본(흰 바탕 mp4)에 맞춰 옮겼다.
// onLoaded: 이 장면 영상을 끝까지 받았거나 받을 영상이 없을 때(움직임 줄이기 · 실패 포함) 한 번 — 다음 차례 받기를 여는 신호(waitingNetwork.ts)
export default function WaitingArtwork({ image, theme, video, paused, reduced, onLoaded }: Props) {
  const player = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const enabled = Boolean(video) && !reduced && !failed;
  const loaded = useRef(false);
  const onLoadedRef = useRef(onLoaded);
  useEffect(() => { onLoadedRef.current = onLoaded; });
  const markLoaded = () => { if (!loaded.current) { loaded.current = true; onLoadedRef.current?.(); } };
  // 끝까지 받았거나, 브라우저가 «충분히 받았다»며 받기를 쉰 때(suspend + 끝까지 재생 가능)
  const checkLoaded = (element: HTMLVideoElement, suspended = false) => {
    const range = element.buffered;
    const end = range.length ? range.end(range.length - 1) : 0;
    if ((Number.isFinite(element.duration) && element.duration > 0 && end >= element.duration - 0.1)
      || (suspended && element.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA)) markLoaded();
  };

  useEffect(() => { if (!enabled) markLoaded(); }, [enabled]);

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
      // 자동 재생 거부 시에도 검은 화면 대신 정지 그림을 표시한다.
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
    {/* 정지 그림은 영상 첫 프레임과 같은 그림이다(scripts/media/encode-waiting-videos.py) — 영상이 실제로 재생되기 시작하면
        영상으로 넘기고 정지 그림을 숨긴다. 숨기는 쪽만 영상이 다 나타난 뒤(0.18초)로 늦춰 흰 바탕이 번쩍이지 않게 한다(generation-wait.css). */}
    <img className="generation-robot-film generation-robot-still" data-active={!(enabled && visible)} src={image} width={704} height={704} alt={theme} />
    {enabled && <video ref={player} className="generation-robot-film generation-robot-video"
      data-active={visible} src={video} poster={image} width={704} height={704}
      muted playsInline preload="auto" aria-hidden="true" disablePictureInPicture
      onPlaying={() => { setVisible(true); setBuffering(false); }}
      onWaiting={() => setBuffering(true)} onStalled={() => setBuffering(true)}
      onProgress={(event) => checkLoaded(event.currentTarget)} onCanPlayThrough={(event) => checkLoaded(event.currentTarget)}
      onSuspend={(event) => checkLoaded(event.currentTarget, true)}
      onEnded={() => { setBuffering(false); markLoaded(); }} onError={() => setFailed(true)} />}
  </>;
}
