/* 화면 알림(검은 상자 — «AI 서버 연결을 확인할 수 없습니다» · «재생성 횟수를 모두 사용했어요» 등, 2026-11-03 Bumm님 실기기 확인).
   - 자리: 2단계는 사진(카메라) 칸의 가로 가운데 · 세로는 목과 어깨 높이(칸 위에서 66%)에, 사진 칸이 없거나 화면 밖이면 화면 가운데에 띄운다.
     예전에는 PC 왼쪽 아래 구석 · 휴대폰 맨 아래에 붙어 «왼쪽 구석은 보이지 않는다»(PC) · 사진과 동떨어졌다(휴대폰).
   - 잠깐 보였다가 사라진다 — 글 길이에 따라 4~6.5초. 같은 글을 다시 내면(번호 id가 바뀌면) 다시 뜬다.
   - 글 안의 «\n»은 문장 나눔이다. 휴대폰은 문장마다 줄을 바꾸고(이어 쓰다 어색한 곳에서 잘리지 않게), PC는 한 줄에 들어가면 한 줄이다(studio.css).
   - 누르는 것이 없는 알림이라 손가락 · 마우스 입력은 아래로 흘려보낸다 — 가운데에 떠도 아래 단추가 그대로 눌린다. */
import { useEffect, useLayoutEffect, useRef, useState } from "react";

const NECK = 0.66;

function anchorPoint(step: number): { x: number; y: number } {
  const center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  if (step !== 2) return center;
  for (const selector of ["#cameraView .camera-frame", "#cameraView .cameraBox"]) {
    const box = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
    if (!box || box.width < 40 || box.height < 40) continue;
    if (box.bottom < 0 || box.top > window.innerHeight) return center;
    return { x: box.left + box.width / 2, y: box.top + box.height * NECK };
  }
  return center;
}

export default function StatusToast({ text, id, step, suppressed }: { text: string; id: number; step: number; suppressed: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!text || suppressed) { setShown(false); return; }
    setShown(true);
    setLeaving(false);
    const stay = Math.min(6_500, Math.max(4_000, 2_500 + text.length * 60));
    const fade = window.setTimeout(() => setLeaving(true), stay);
    const hide = window.setTimeout(() => setShown(false), stay + 300);
    return () => { window.clearTimeout(fade); window.clearTimeout(hide); };
  }, [text, id, suppressed]);

  // 뜰 때 · 창 크기가 바뀔 때 자리를 다시 잰다. 상자가 화면 밖으로 나가지 않게 위아래만 화면 안으로 당긴다.
  useLayoutEffect(() => {
    if (!shown) return;
    const place = () => {
      const p = anchorPoint(step);
      const half = (box.current?.offsetHeight ?? 0) / 2 + 8;
      setPoint({ x: p.x, y: Math.min(Math.max(p.y, half), window.innerHeight - half) });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [shown, step, text]);

  const lines = text.split("\n");
  return (
    <div ref={box} className="studio-status" data-leaving={leaving || undefined} hidden={!shown}
      style={point ? { left: `${point.x}px`, top: `${point.y}px` } : undefined}>
      <p id="status" role="status">
        {lines.map((line, i) => <span key={i} className="status-line">{i > 0 && " "}{line}</span>)}
      </p>
    </div>
  );
}
