import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import type { Poster } from "../state.js";
import { DEFAULT_MOVIE_TITLE, DEFAULT_PERSON_NAME } from "../defaults.js";
import MemberField from "./MemberField.js";
import GenerationWait, { type SceneEnd } from "./GenerationWait.js";
import CameraExample from "./CameraExample.js";
import GenerateFailureDialog from "./GenerateFailureDialog.js";
import BoothCodeDialog from "./BoothCodeDialog.js";
import type { GenerateFailure } from "../generateFailure.js";
import type { BoothCodeCheck } from "../boothCode.js";
import { approvedCameraVideo } from "./cameraVideo.js";
import { savePlatform, savePoster } from "../savePoster.js";
import { designName } from "../designNames.js";
import { deviceKind, pcCanvas } from "../deviceCanvas.js";
// 장르 그림은 빌드가 이름에 해시를 붙여 내는 자산이다(1년 캐시). 원래 PNG 두 장(판타지 · 뮤지컬)은 무손실 WebP로 바꿨다 — 화소 그대로(10/24 와이파이 최적화).
// public/studio의 옛 파일 8장(reference-*.* · parasite-en · director · rocky-title-edited)은 지우지 않는다 — 이미 나간 옛 주소가 200으로 남게(2026-10-26 Bumm님).
import sfArt from "./genre/sf.jpg";
import fantasyArt from "./genre/fantasy.webp";
import animationArt from "./genre/animation.jpg";
import heroArt from "./genre/hero.jpg";
import mysteryArt from "./genre/mystery.webp";
import directorArt from "./genre/director.webp";
import sportsArt from "./genre/sports.webp";
import musicArt from "./genre/music.webp";

const choices = [
  ["sf", "SF", sfArt],
  ["fantasy", "판타지", fantasyArt],
  ["animation", "애니메이션", animationArt],
  ["hero", "히어로", heroArt],
  ["mystery", "스릴러", mysteryArt],
  ["director", "드라마", directorArt],
  ["sports", "스포츠", sportsArt],
  ["music", "뮤지컬", musicArt],
];
type Action = () => void | Promise<void>;
/** 휴대폰 흐름(2026-10-17)을 켜는 기준 — studio.css의 @media (max-width: 760px)와 같은 값이다. */
export const PHONE_QUERY = "(max-width: 760px)";
// 휴대폰 판정은 기기 갈래(data-device — 비율 기준 전환 10/23)로. 갈래가 없거나(시험 · 옛 판) PC 캔버스가 꺼진 PC(창 크기로 고르는 라이브 배치 —
// 760보다 좁은 PC 창은 휴대폰 화면)는 예전처럼 창 폭으로
const isPhone = () => { const d = deviceKind(); return d && (d !== "pc" || pcCanvas()) ? d === "phone" : window.matchMedia?.(PHONE_QUERY)?.matches ?? false; };
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
export interface StudioViewProps {
  mode: string;
  setMode: (mode: string) => void;
  phase: string;
  snapshotURL: string | null;
  countdown: string | null;
  generating: boolean;
  spinning: boolean;
  failure: GenerateFailure | null;
  online: boolean;
  boothOpen: boolean;
  onRetryFailure: Action;
  onRetakeFailure: Action;
  onDismissFailure: Action;
  onBoothCodeSaved: (code: string) => void;
  onBoothCodeClose: Action;
  verifyBooth: (code: string) => Promise<BoothCodeCheck>;
  status: string;
  completionId: number;
  posters: Poster[];
  selected: number;
  select: (index: number) => void;
  resetKey: number;
  capturing: boolean;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  videoRef: RefObject<HTMLVideoElement | null>;
  spinTextRef: RefObject<HTMLParagraphElement | null>;
  sceneEndRef?: { current: SceneEnd | null };
  onStart: Action;
  onStop: Action;
  cameraReadyId: number;
  onShot: Action;
  sampleMode?: boolean;
  /** 두 단추(src/studioMode.ts «both»): 카메라를 켜기 전 아래 단추가 «샘플 포스터 보기»가 된다. */
  sampleChoice?: boolean;
  onSample?: () => void;
  onRetake: Action;
  onGenerate: Action;
  onPrint: Action;
  onNewPerson: Action;
  onHome: Action;
  stopCamera: Action;
}

/** 가로로 밀어 넘기는 줄에서 지금 가운데에 온 장의 번호. 한 칸 = 장 너비 + 간격이고, 줄 양끝 여백이 첫 장을 가운데에 두므로
    scrollLeft를 한 칸으로 나눈 값이 곧 번호다(2026-10-17 휴대폰 3단계 ⑧). */
export function slideAt(scrollLeft: number, slideWidth: number, gap: number, count: number): number {
  const step = slideWidth + gap;
  if (!(step > 0) || count < 1) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(scrollLeft / step)));
}
const slideStep = (el: HTMLElement) => {
  const first = el.firstElementChild as HTMLElement | null;
  return first ? first.offsetWidth + (parseFloat(getComputedStyle(el).columnGap) || 0) : 0;
};

function StudioIcon({name}: {name: 'camera' | 'arrow' | 'reset' | 'expand' | 'print' | 'mic' | 'download'}) {
  // Lucide 공식 SVG: camera · rotate-ccw · maximize · mic (ISC 고지: public/studio/lucide-LICENSE.txt)
  const paths = {
    // Lucide 공식 camera 아이콘. 원본 고지: public/studio/lucide-LICENSE.txt
    camera: <><path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"/><circle cx="12" cy="13" r="3"/></>,
    arrow: <path d="M4 12h15m-6-6 6 6-6 6"/>,
    reset: <><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></>,
    expand: <><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></>,
    mic: <><path d="M12 19v3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><rect x="9" y="2" width="6" height="13" rx="3"/></>,
    print: <><path d="M7 8V3h10v5M7 17H3V8h18v9h-4M7 14h10v7H7Z"/><path d="M17 11h1"/></>,
    // Lucide 공식 download 아이콘
    download: <><path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/></>
  };
  return <svg className="studio-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

/** 아이폰 사파리는 누르는 순간 화면 어딘가가 바뀌면(예: 예시 영상 위에 숫자 3·2·1이 뜨고 지는 때) 첫 누름을 «마우스 올림»으로만 쓰고
 *  click을 보내지 않는다(WebKit의 내용 변화 감시 — 10/20 저녁 Bumm님 «영상이 재생되는 동안 두 번 눌러야 들어감», 실기기 확인 필요).
 *  그래서 손가락은 떼는 순간(pointerup)에 바로 처리하고 뒤따라오는 click은 한 번 거른다. 밀거나(12px 넘게) 오래 누른(0.8초) 것은 누름이 아니다.
 *  마우스 · 키보드 · 화면 읽기 프로그램은 click 그대로다. */
export function useTap(action: () => void) {
  const latest = useRef(action);
  latest.current = action;
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const handledAt = useRef(-Infinity);
  return useMemo(() => ({
    onPointerDown: (event: React.PointerEvent) => { start.current = event.pointerType === "touch" ? { x: event.clientX, y: event.clientY, t: event.timeStamp } : null; },
    onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => {
      const s = start.current;
      start.current = null;
      if (event.pointerType !== "touch" || !s || event.currentTarget.disabled) return;
      if (Math.hypot(event.clientX - s.x, event.clientY - s.y) > 12 || event.timeStamp - s.t > 800) return;
      handledAt.current = performance.now();
      latest.current();
    },
    onClick: () => { if (performance.now() - handledAt.current < 800) return; latest.current(); },
  }), []);
}

function PeopleIcon({ group }: { group: boolean }) {
  return (
    <span className="people-icon" aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {group ? (
          <>
            <circle cx="9" cy="7" r="3" />
            <path d="M3 21v-3a6 6 0 0 1 12 0v3 M16 4a3 3 0 0 1 0 6 M18 13a5 5 0 0 1 3 5v3" />
          </>
        ) : (
          <>
            <circle cx="12" cy="7" r="3" />
            <path d="M5 21v-3a7 7 0 0 1 14 0v3" />
          </>
        )}
      </svg>
    </span>
  );
}

export default function StudioView(p: StudioViewProps) {
  const [step, setStep] = useState(1);
  const [completionVisible, setCompletionVisible] = useState(false);
  const [cameraReadyVisible, setCameraReadyVisible] = useState(false);
  // 카메라 · 찍은 사진의 가로 ÷ 세로 — 사진 틀을 이 비율로 맞춘다(PC · 태블릿, studio.css «사진 틀»)
  const [camAspect, setCamAspect] = useState<number | null>(null);
  const readAspect = (w: number, h: number) => { if (w > 0 && h > 0) setCamAspect(w / h); };
  const [captureNoticeVisible, setCaptureNoticeVisible] = useState(false);
  const [genre, setGenre] = useState("sf");
  const [preview, setPreview] = useState({
    title: "",
    name: "",
    group: "",
    members: "",
  });
  const dialog = useRef<HTMLDialogElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const dialogCarouselRef = useRef<HTMLDivElement>(null);
  const galleryRef = useRef<HTMLDivElement>(null);
  const swipeTimer = useRef(0);
  const hinted = useRef(false);
  const [hint, setHint] = useState(false);
  const posterURLs = useMemo(() => p.posters.map(poster => poster.canvas.toDataURL("image/png")), [p.posters]);
  const shownPosters = useRef<Poster[]>([]);
  const prevReset = useRef(p.resetKey);
  const previousStep = useRef(step);
  const refresh = () => {
    const value = (id: string) =>
      (document.getElementById(id) as HTMLInputElement | null)?.value.trim() ??
      "";
    setPreview({
      title: value("movieTitle"),
      name: value("studentName"),
      group: value("groupName"),
      members: value("members"),
    });
  };
  const go = (next: number) => {
    if (p.generating || p.capturing || (next === 3 && !p.posters.length))
      return;
    if (next !== 2) void p.stopCamera();
    refresh();
    setCompletionVisible(false);
    setCameraReadyVisible(false);
    setCaptureNoticeVisible(false);
    setStep(next);
  };
  useEffect(() => {
    document.body.dataset.step = String(step);
    if (previousStep.current !== step) {
      const view = document.getElementById(["prepareView", "cameraView", "resultView"][step - 1]);
      const heading = view?.querySelector<HTMLHeadingElement>("h1");
      // 새 단계는 맨 위에서 시작한다. 제목 초점이 화면을 끌어내리면 휴대폰에서 2단계 카메라·3단계 포스터가 위로 밀린 채 열린다(2026-10-17).
      // PC는 문서가 스크롤되지 않아 그대로다.
      if (window.scrollY > 0) window.scrollTo(0, 0);
      if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
      previousStep.current = step;
    }
  }, [step]);
  // 단계를 넘기면 마우스를 움직이거나 누를 때까지 단추 «올림» 색을 쓰지 않는다(body[data-hover-rest], studio.css) — 2026-10-25 Bumm님 «1024×1366에서만
  // «샘플 포스터 보기»가 탁하다»: «다음»을 누른 자리에 2단계 빨간 단추가 그대로 와서, 움직이지 않은 마우스(터치는 누른 손가락)가 올림 색(#bd241c)을 켰다.
  useEffect(() => {
    const body = document.body;
    body.dataset.hoverRest = "";
    const clear = () => { delete body.dataset.hoverRest; };
    window.addEventListener("pointermove", clear, { once: true });
    window.addEventListener("pointerdown", clear, { once: true });
    return () => { window.removeEventListener("pointermove", clear); window.removeEventListener("pointerdown", clear); };
  }, [step]);
  // 포스터가 오면 그리기 전에 3단계로(useLayoutEffect) — 같은 렌더에서 로딩 화면이 걷히므로, 그린 뒤(useEffect)에 넘기면
  // 2단계가 두 프레임 보였다가 3단계로 넘어갔다(2026-10-24 Bumm님, 모든 해상도 — 프레임 기록으로 확인).
  useLayoutEffect(() => {
    if (p.posters.length && p.posters !== shownPosters.current) setStep(3);
    shownPosters.current = p.posters;
  }, [p.posters]);
  useEffect(() => {
    if (!p.completionId) return;
    setCompletionVisible(true);
    const timer = window.setTimeout(() => setCompletionVisible(false), 2200);
    return () => window.clearTimeout(timer);
  }, [p.completionId]);
  useEffect(() => {
    if (p.generating) setCompletionVisible(false);
  }, [p.generating]);
  useEffect(() => {
    if (p.resetKey === prevReset.current) return;
    prevReset.current = p.resetKey;
    setPreview({ title: "", name: "", group: "", members: "" });
    setGenre("animation");
    setCompletionVisible(false);
    setStep(1);
  }, [p.resetKey]);
  useEffect(() => {
    if (!p.cameraReadyId) return;
    setCameraReadyVisible(true);
    const timer = window.setTimeout(() => setCameraReadyVisible(false), 1800);
    return () => window.clearTimeout(timer);
  }, [p.cameraReadyId]);
  useEffect(() => {
    if (p.phase !== "live" || p.capturing || step !== 2) setCameraReadyVisible(false);
  }, [p.phase, p.capturing, step]);
  useEffect(() => {
    if (p.phase !== "shot") {
      setCaptureNoticeVisible(false);
      return;
    }
    setCaptureNoticeVisible(true);
    const timer = window.setTimeout(() => setCaptureNoticeVisible(false), 2400);
    return () => window.clearTimeout(timer);
  }, [p.phase, p.snapshotURL]);
  useEffect(() => {
    if (step !== 2 || p.generating) setCaptureNoticeVisible(false);
  }, [step, p.generating]);
  const title = preview.title || DEFAULT_MOVIE_TITLE;
  const members = preview.members
    .split(/[,\.·/|;\s]+/u)
    .filter(Boolean)
    .join(" · ");
  const groupExample = !preview.group && !members;
  const exampleVideo = approvedCameraVideo(p.mode);
  const cast =
    p.mode === "solo"
      ? preview.name || DEFAULT_PERSON_NAME
      : members ||
        (groupExample
          ? "북두칠성 · 북극성 · 시리우스 · 오리온 · 카시오페아"
          : "");
  /* ② 휴대폰 1단계: 극장 사진(첫 페이지) 어디를 눌러도 둘째 페이지(«오늘의 주인공, 등장 !»)로 넘어간다. PC에서는 아무 일도 없다. */
  const toStoryForm = () => {
    if (!isPhone()) return;
    document.getElementById("prepareWorkspace")?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
  };
  /* ⑧~⑩ 휴대폰 3단계: 큰 포스터 줄(과 크게 보기 창의 줄)을 밀어 멈추면 가운데 장이 선택된다. 썸네일을 누르면 거꾸로 줄이 그 장으로 간다. */
  const onSwipe = (el: HTMLDivElement) => {
    window.clearTimeout(swipeTimer.current);
    swipeTimer.current = window.setTimeout(() => {
      const first = el.firstElementChild as HTMLElement | null;
      const i = slideAt(el.scrollLeft, first?.offsetWidth ?? 0, parseFloat(getComputedStyle(el).columnGap) || 0, p.posters.length);
      if (i !== p.selected) p.select(i);
    }, 90);
  };
  const showSelected = (behavior: ScrollBehavior) => {
    for (const el of [carouselRef.current, dialogCarouselRef.current]) {
      if (!el) continue;
      const left = p.selected * slideStep(el);
      if (Math.abs(el.scrollLeft - left) > 2) el.scrollTo({ left, behavior });
    }
    const gallery = galleryRef.current;
    const thumb = gallery?.children[p.selected] as HTMLElement | undefined;
    if (gallery && thumb) gallery.scrollTo({ left: thumb.offsetLeft - (gallery.clientWidth - thumb.offsetWidth) / 2, behavior });
  };
  useEffect(() => {
    if (step === 3 && isPhone()) showSelected(reducedMotion() ? "auto" : "smooth");
  }, [p.selected, step, p.posters]);
  // 처음 3단계에 들어올 때 한 번만 줄을 살짝 움찔해 «옆으로 밀 수 있다»를 알린다(움직임 줄이기면 하지 않는다).
  useEffect(() => {
    if (step !== 3 || hinted.current || !isPhone() || reducedMotion()) return;
    hinted.current = true;
    setHint(true);
    const timer = window.setTimeout(() => setHint(false), 1300);
    return () => window.clearTimeout(timer);
  }, [step]);
  const openDialog = () => {
    dialog.current?.showModal();
    if (isPhone()) requestAnimationFrame(() => showSelected("auto"));
  };
  // 10/20 Bumm님: 아이폰은 공유 창으로 사진첩에 넣는다(웹에서 사진 앱으로 가는 유일한 길) — 누를 때 무엇을 눌러야 하는지 한 줄로 알린다.
  const [saveHint, setSaveHint] = useState(false);
  const saveHintTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(saveHintTimer.current), []);
  // 2단계 촬영 단추들 — 손가락은 떼는 순간(pointerup)에 처리한다(useTap). 단추가 하는 일은 누르는 그때의 상태로 고른다.
  const shotTap = useTap(() => (p.sampleChoice && p.phase === "idle" && !p.capturing ? p.onSample?.() : p.onShot()));
  const phoneShotTap = useTap(() => p.onShot());
  // 3단계 마지막 장에서 왼쪽으로 한 번 더 밀면 «처음 포스터로»와 같이 맨 앞으로(10/20 저녁 Bumm님). 오른쪽으로 미는 것은 보통 넘김.
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const onCarouselTouchStart = (event: React.TouchEvent) => { const t = event.touches[0]; swipeStart.current = t ? { x: t.clientX, y: t.clientY } : null; };
  const onCarouselTouchEnd = (event: React.TouchEvent) => {
    const s = swipeStart.current, t = event.changedTouches[0];
    swipeStart.current = null;
    if (!s || !t) return;
    const dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (p.posters.length > 1 && p.selected >= p.posters.length - 1 && dx < -50 && Math.abs(dx) > Math.abs(dy) * 1.5) p.select(0);
  };
  const onSave = () => {
    const poster = p.posters[p.selected];
    if (!poster) return;
    const platform = savePlatform();
    if (platform === "ios") {
      setSaveHint(true);
      window.clearTimeout(saveHintTimer.current);
      saveHintTimer.current = window.setTimeout(() => setSaveHint(false), 6000);
    }
    void savePoster(poster.canvas, title, platform);
  };
  const selectedFilm = choices.find((c) => c[0] === genre) ?? choices[0];
  const genreLabel = selectedFilm[1];
  const locked = p.generating || p.capturing;

  return (
    <>
      <a className="skip-link" href="#prepareWorkspace">
        본문으로 바로가기
      </a>
      <header className="app-header">
        <div className="header-inner">
          <button type="button" className="brand header-home" onClick={p.onHome} aria-label="CGV · 인천광역시교육청 — 처음으로" title="처음부터 다시 시작">
            <span className="cgv-symbol">
              <img
                src="/studio/cgv-app-logo.jpg"
                alt="CGV"
                width="512"
                height="512"
              />
            </span>
            <span className="brand-divider" aria-hidden="true">
              ×
            </span>
            <span className="education-wordmark">
              <img
                src="/studio/ice-logo.png"
                alt="인천광역시교육청"
                width="199"
                height="53"
              />
            </span>
          </button>
          <nav aria-label="포스터 만들기 진행 단계">
            <ol className="stepper">
              {["영화 준비", "사진 촬영", "포스터 선택"].map((label, i) => (
                <li key={label}>
                  {i > 0 && <span className="step-line" />}
                  <button
                    type="button"
                    onClick={() => go(i + 1)}
                    disabled={locked || (i === 2 && !p.posters.length)}
                    aria-current={step === i + 1 ? "step" : undefined}
                  >
                    <span className="step-index">{i + 1}</span>
                    <span>{label}</span>
                  </button>
                </li>
              ))}
            </ol>
          </nav>
          <div className="header-tools">
            <button type="button" className="festival-brand header-home" onClick={p.onHome} aria-label="InKY Film Festival — 처음으로" title="처음부터 다시 시작">
              <span className="festival-symbol">
                <img
                  src="/studio/inky-logo.png"
                  alt=""
                  width="800"
                  height="201"
                />
              </span>
              <span>
                InKY <strong>Film Festival</strong>
              </span>
            </button>
            {/* 10/20 저녁 Bumm님: «사진은 OpenAI(미국)로 전송돼요» 줄은 휴대폰 · PC 모두 뺀다 — 개인정보처리방침 링크만 예전 자리 그대로. */}
            <a
              className="privacy-link"
              href="privacy.html"
              target="_blank"
              rel="noopener"
              aria-label="개인정보처리방침 (새 탭)"
            >
              개인정보처리방침
            </a>
          </div>
        </div>
      </header>

      <section
        id="prepareView"
        className="prepare-layout"
        hidden={step !== 1}
        aria-label="영화 준비"
      >
        <div className="preview-panel" onClick={toStoryForm}>
          <div className="exhibition">
            <img
              className="poster-wall"
              src="/studio/theater.webp"
              alt="붉은 좌석이 있는 영화관"
            />
            <div className="exhibition-shade" />
            <span className="sample-tag">
              <span className="live-dot" aria-hidden="true" /> Poster Studio{" "}
              <span className="sample-divider">·</span> CGV 인천
            </span>
            <div className="exhibition-copy">
              <p className="event-name">제4회 인천어린이청소년영화제</p>
              <h2>
                이번 영화의
                <br />
                주인공은, <em>나.</em>
              </h2>
              <p className="exhibition-description">
                인천을 대표하는 극장에서 만나는 나의 첫 번째 영화 포스터
              </p>
            </div>
            <div className="movie-ticket">
              <div>
                <span className="ticket-label">
                  {genreLabel} · 나의 첫 번째 영화
                </span>
                <strong>{title}</strong>
                <span id="ticketName">
                  {p.mode === "solo"
                    ? "주연"
                    : preview.group ||
                      (groupExample ? "별 보러 가요" : "단체 이름")}
                  <span className="ticket-cast">
                    {cast ? (p.mode === "solo" ? " · " : " | ") + cast : ""}
                  </span>
                </span>
              </div>
              <div className="ticket-admit">
                <span>11.14</span>
                <small>CGV 인천</small>
              </div>
            </div>
            <div className="venue-info">
              <span>2026. 11. 14. 토요일</span>
              <span>제4회 인천어린이청소년영화제</span>
            </div>
            <span className="hero-next" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
            </span>
          </div>
        </div>
        <div className="workspace" id="prepareWorkspace">
          <div className="page-heading">
            <h1>오늘의 <span className="camera-heading-accent">주인공,</span> 등장 !</h1>
          </div>
          <form
            className="story-form"
            onSubmit={(event) => event.preventDefault()}
            onInput={refresh}
          >
            <div className="form-section identity-section">
              <div className="section-top">
                <div
                  className="segmented"
                  id="modeSeg"
                  aria-label="단독 주연 또는 우리 같이 선택"
                >
                  {[
                    ["solo", "단독 주연"],
                    ["group", "우리 같이"],
                  ].map(([mode, label]) => (
                    <button
                      type="button"
                      className={p.mode === mode ? "seg-btn active" : "seg-btn"}
                      key={mode}
                      data-mode={mode}
                      aria-pressed={p.mode === mode}
                      onClick={() => {
                        p.setMode(mode);
                        refresh();
                      }}
                    >
                      <PeopleIcon group={mode === "group"} />
                      <span className="mode-copy">
                        <strong>{label}</strong>
                      </span>
                      <span className="mode-check" aria-hidden="true">
                        ✓
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="movieTitle">영화 제목</label>
                  <input
                    id="movieTitle"
                    placeholder="예: 별을 찾는 아이"
                    maxLength={40}
                    autoComplete="off"
                  />
                </div>
                <div
                  id="soloFields"
                  className={p.mode === "solo" ? "field" : "field hidden"}
                >
                  <label htmlFor="studentName">이름 또는 별명</label>
                  <input
                    id="studentName"
                    placeholder="예: 김인키"
                    maxLength={20}
                    autoComplete="off"
                  />
                </div>
                <div
                  id="groupFields"
                  className={
                    p.mode === "group"
                      ? "participant-fields"
                      : "participant-fields hidden"
                  }
                >
                  <div className="field">
                    <label htmlFor="groupName">단체 이름</label>
                    <input
                      id="groupName"
                      placeholder="예: 별 보러 가요"
                      maxLength={40}
                      autoComplete="off"
                    />
                  </div>
                  <MemberField key={p.resetKey} onChange={refresh} />
                </div>
              </div>
            </div>
            <section
              className="form-section genre-section"
              aria-labelledby="genreHeading"
            >
              <h2 id="genreHeading">어떤 영화로 떠나볼까요 ?</h2>
              <select
                id="genre"
                hidden
                defaultValue="sf"
                aria-label="영화 장르"
                onChange={(event) => setGenre(event.target.value)}
              >
                {[
                  "animation",
                  "fantasy",
                  "sf",
                  "hero",
                  "mystery",
                  "director",
                  "sports",
                  "music",
                ].map((key) => (
                  <option key={key} value={key}>
                    {choices.find((c) => c[0] === key)?.[1]}
                  </option>
                ))}
              </select>
              <div className="genre-grid">
                {choices.map(([key, label, image]) => (
                  <button
                    key={key}
                    type="button"
                    className="genre-option"
                    data-genre={key}
                    aria-label={label}
                    aria-pressed={genre === key}
                    onClick={() => {
                      const select = document.getElementById(
                        "genre",
                      ) as HTMLSelectElement;
                      select.value = key;
                      setGenre(key);
                    }}
                  >
                    <span
                      className={`genre-art genre-art-${key}`}
                      aria-hidden="true"
                    >
                      <img
                        src={image}
                        alt=""
                        width="400"
                        height="600"
                      />
                      <span className="poster-pick">✓</span>
                    </span>
                    <span className="genre-caption">
                      <strong>{label}</strong>
                    </span>
                  </button>
                ))}
              </div>
            </section>
            <div className="action-dock">
              <button
                type="button"
                id="prepareNextBtn"
                className="primary-button"
                onClick={() => go(2)}
              >
                {/* «주인공이 될 순간 보러 가기» + 앞에 Lucide clapperboard — 10/20 저녁 휴대폰에 먼저, 10/24 Bumm님 «모든 해상도 같이»(PC «만들러 가기 →»를 바꿈) */}
                <span className="next-label"><svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z"/><path d="m6.2 5.3 3.1 3.9"/><path d="m12.4 3.4 3.1 4"/><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>주인공이 될 순간 보러 가기</span>
              </button>
            </div>
          </form>
        </div>
      </section>

      <section id="cameraView" className="camera-layout" hidden={step !== 2} aria-label="사진 촬영">
        <div className="camera-surface">
          <div className="camera-top"><span>카메라 미리 보기</span><span>{p.phase === "shot" ? "촬영 완료" : p.phase === "live" ? "카메라 연결됨" : "촬영 구도 예시"}</span></div>
          {/* 카메라 · 찍은 사진은 칸 안의 «사진 틀»(camera-frame)에 담는다 — PC · 태블릿은 켠 뒤 · 찍은 뒤 틀을 사진 비율에 맞춰 칸 가운데에 둔다
              (data-fit · --cam-ar, studio.css «사진 틀»). 칸 비율과 사진 비율이 달라 위아래 · 양옆에 검은 띠가 남던 것(10/23 팀장, 태블릿 세로 · PC 1024×768). */}
          <div className={`camera-large cameraBox${exampleVideo ? " has-example-video" : ""}`}
            data-fit={(p.phase === "live" || p.phase === "shot") && camAspect ? "" : undefined}
            style={camAspect ? { "--cam-ar": camAspect } as CSSProperties : undefined}>
            {/* 로딩 화면이 뜨면(2단계를 떠난 것과 같다) 예시 영상을 내려 소리도 멈춘다 — 10/20 저녁 Bumm님 «로딩 뒤에서 소리가 들림», PC도 */}
            <CameraExample mode={p.mode} video={exampleVideo} hidden={p.phase !== "idle"} offstage={step !== 2 || p.spinning} />
            <div className="camera-frame">
            <video id="video" ref={p.videoRef} autoPlay playsInline muted className={p.phase === "live" ? "" : "hidden"}
              onLoadedMetadata={(e) => readAspect(e.currentTarget.videoWidth, e.currentTarget.videoHeight)}
              onResize={(e) => readAspect(e.currentTarget.videoWidth, e.currentTarget.videoHeight)}/>
            <img id="snapshot" src={p.snapshotURL ?? undefined} className={p.phase === "shot" ? "" : "hidden"} alt="촬영 사진"
              onLoad={(e) => readAspect(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}/>
            <div id="camHint" className={p.phase === "idle" ? "camHint camera-example-caption" : "camHint hidden"}>
              <span className="camera-example-label">{p.mode === "group" ? "이렇게, 모두의 얼굴이 보이게" : "이렇게, 얼굴과 어깨가 보이게"}</span>
              {!p.sampleMode && <button type="button" id="startBtn" className="camera-start-button" onClick={p.onStart} disabled={locked}>카메라 켜기 <StudioIcon name="camera"/></button>}
            </div>
            {p.phase === "live" && <>
              <span className="camera-live-indicator"><i aria-hidden="true"/>실시간 미리보기</span>
              <div className="camHint camera-example-caption">
                <button type="button" id="stopCameraBtn" className="camera-start-button" onClick={p.onStop} disabled={locked}>카메라 끄기 <StudioIcon name="camera"/></button>
              </div>
            </>}
            {cameraReadyVisible && step === 2 && p.phase === "live" && !p.capturing && <div className="camera-ready-notice" role="status">카메라 준비 완료</div>}
            {captureNoticeVisible && step === 2 && p.phase === "shot" && !p.generating && <div className="camera-ready-notice camera-capture-notice" role="status"><strong>촬영 완료 !</strong><span>사진을 확인하고 ‘이 사진으로 포스터 만들기’를 눌러주세요.</span></div>}
            <div className="camera-guides" aria-hidden="true"><i/><i/><i/><i/></div>
            {p.phase === "shot" && captureNoticeVisible && <span className="captured-badge">✓ 촬영 완료</span>}   {/* 10/20 저녁 Bumm님 «잠깐 떴다가 사라지게» — 가운데 알림과 함께(2.4초), PC도 */}
            <div id="countdown" className={p.countdown === null ? "countdown hidden" : "countdown"} aria-live="assertive">{p.countdown}</div>
            </div>
          </div>
          {/* ⑥ 휴대폰: 엄지 자리 빨간 원형 촬영 단추(PC에서는 숨김) — 아래 «3초 뒤 사진 찍기»와 같은 일을 한다. 휴대폰 2단계에는
              이 단추 하나만 남는다(10/18 Bumm님 «사진과 카메라 단추만 남기고»). 샘플 모드는 찍을 카메라가 없어 바로 샘플 포스터로 간다. */}
          <button type="button" id="phoneShotBtn" className="phone-shot" hidden={p.phase === "shot"} disabled={locked}
            aria-label={p.sampleMode ? "샘플 포스터 보기" : "3초 뒤 사진 찍기"}
            {...phoneShotTap}>
            <StudioIcon name="camera"/>
          </button>
          <p className="camera-bottom">{p.mode === "group" ? "모두의 얼굴이 잘 보이도록, 조금씩 가까이 모여주세요." : "얼굴과 어깨가 화면 안에 들어오도록 맞춰주세요."}</p>

        </div>
        <div className="workspace" id="cameraWorkspace">
          <div className="page-heading"><h1>{p.phase === "shot" ? "이 사진으로 만들까요 ?" : <><span className="camera-heading-accent">{p.mode === "group" ? "우리답게," : "나답게,"}</span> 편하게 웃어주세요.</>}</h1></div>
          <aside className="camera-guide">
            <div className="camera-instructions" data-review={p.phase === "shot"}>
            <ul className="camera-tips" aria-hidden={p.phase === "shot"}>
              <li><span>1</span><div><strong>{p.mode === "group" ? "모두의 얼굴이 잘 보이게" : "얼굴이 잘 보이게"}</strong><p>{p.mode === "group" ? "앞뒤로 겹치지 않게, 프레임 안에 모여주세요." : "머리 위부터 어깨까지 화면에 담아주세요."}</p></div></li>
              <li><span>2</span><div><strong>{p.mode === "group" ? "표정은 우리답게" : "표정은 나답게"}</strong><p>편하게 웃어도, 멋진 포즈를 지어도 좋아요.</p></div></li>
              <li><span>3</span><div><strong>준비되면 촬영</strong><p>버튼을 누르고 3초만 포즈를 유지해 주세요.</p></div></li>
            </ul>

            <div className="photo-review" aria-hidden={p.phase !== "shot"}><p><span className="label-pc">표정과 구도가 마음에 드나요 ?<br/>다시 찍어도 괜찮아요.</span><span className="label-phone">표정과 구도가 마음에 드나요 ?</span></p><button id="retakeBtn" type="button" className="quiet-button" disabled={locked || p.phase !== "shot"} onClick={p.onRetake}><StudioIcon name="reset"/>다시 찍기</button></div>
            </div>
            <div className="camera-film-heading"><h2>오늘 촬영할 <span className="camera-heading-accent">영화</span></h2></div>
            <div className="camera-film-card">
              <div className="camera-film-scene"><div className="camera-film-poster"><img src={selectedFilm[2]} alt={genreLabel + ' 선택 포스터'}/><span>{p.mode === "solo" ? "단독 주연" : "우리 같이"}</span></div></div>
              <div className="movie-ticket camera-ticket" data-mode={p.mode}>
                <div>
                  <span className="ticket-label">{genreLabel} · 나의 첫 번째 영화</span>
                  <strong>{title}</strong>
                  <span className="camera-ticket-name">
                    {p.mode === 'solo' ? '주연' : preview.group || (groupExample ? '별 보러 가요' : '단체 이름')}
                    {cast && <span className="ticket-sep">{p.mode === 'solo' ? ' · ' : ' | '}</span>}
                    <span className="ticket-cast">{cast}</span>
                  </span>
                  <dl className="ticket-info">
                    <div><dt>상영일</dt><dd className="ticket-date">11.14 (토)</dd></div>
                    <div><dt>극장</dt><dd>CGV 인천</dd></div>
                    <div><dt>장르</dt><dd>{genreLabel}</dd></div>
                    <div><dt>관람</dt><dd>{p.mode === 'solo' ? '단독 주연' : '우리 같이'}</dd></div>
                  </dl>
                </div>
                <div className="ticket-admit"><span>11.14</span><small>CGV 인천</small></div>
                <div className="ticket-stub" aria-hidden="true"><i className="ticket-barcode"/><small>NO. 2026-1114 · ADMIT ONE</small></div>
              </div>
            </div>
          </aside>
          <div className="action-dock camera-actions">
            <button type="button" className="back-button" aria-label="이전 단계로" disabled={locked} onClick={() => go(1)}><span aria-hidden="true">←</span> 이전</button>
            {/* 두 단추(10/20): 카메라를 켜기 전에는 «샘플 포스터 보기»(안 찍고 넘어가기), 켠 뒤에는 «3초 뒤 사진 찍기»(PC에는 원형 단추가 없다) */}
            <button id="shotBtn" type="button" className="primary-button" hidden={p.phase === "shot"} disabled={locked} {...shotTap}>
              <StudioIcon name="camera"/>{p.sampleMode || (p.sampleChoice && p.phase === "idle" && !p.capturing) ? '샘플 포스터 보기' : p.capturing ? '촬영 중…' : '3초 뒤 사진 찍기'}
            </button>
            <button id="generateBtn" type="button" className="primary-button" hidden={p.phase !== "shot"} disabled={p.generating} onClick={p.onGenerate}>이 사진으로 포스터 만들기 <StudioIcon name="arrow"/></button>
          </div>
        </div>
      </section>

      <section
        id="resultView"
        className="result-layout"
        hidden={step !== 3}
        aria-label="포스터 선택"
      >
        <div className="result-artboard">
          <div className="result-artboard-top">
            <span className="result-brand"><img className="result-brand-icon" src="/studio/clapperboard-apple.png" alt="" width="160" height="160"/><span>Poster <em>Studio</em></span></span>
            <div className="result-tools"><button type="button" className="icon-button" aria-label="다음 주인공" title="다음 주인공" disabled={locked} onClick={p.onNewPerson}><StudioIcon name="reset"/></button><button
              className="icon-button"
              type="button"
              aria-label="포스터 크게 보기"
              onClick={openDialog}
            >
              <StudioIcon name="expand"/>
            </button></div>
          </div>
          <div className="result-poster-slot">
            <canvas
              id="posterCanvas"
              ref={p.canvasRef}
              width={1200}
              height={1800}
            />
          </div>
          <span className="print-size">4 × 6 인화 비율</span>
          {/* ⑧ 휴대폰: 큰 포스터 한 장씩 좌우로 밀어 넘긴다(PC에서는 숨김 — 위 캔버스가 그대로 보인다). 가운데 장을 누르면 크게 보기(⑩). */}
          <div className="phone-stage">
            <div className="poster-carousel" ref={carouselRef} data-hint={hint || undefined} role="group"
              aria-label="완성 포스터 — 옆으로 밀어 넘기기" onScroll={(event) => onSwipe(event.currentTarget)}
              onTouchStart={onCarouselTouchStart} onTouchEnd={onCarouselTouchEnd}>
              {p.posters.map((poster, i) => (
                <button type="button" key={poster.label + i} className="poster-slide" aria-current={i === p.selected || undefined}
                  aria-label={i === p.selected ? `${designName(poster.label)} 크게 보기` : `${designName(poster.label)} 보기`}
                  onClick={() => (i === p.selected ? openDialog() : p.select(i))}>
                  <img src={posterURLs[i]} alt="" />
                </button>
              ))}
            </div>
            {/* 10/19 Bumm님 «양쪽에 화살표를 두어 넘기며 보게» — 누르면 앞 · 뒤 장을 고르고, 줄은 고른 장으로 따라간다(showSelected) */}
            <button type="button" className="carousel-arrow prev" aria-label="이전 포스터" disabled={p.selected <= 0} onClick={() => p.select(p.selected - 1)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            {/* 10/20 Bumm님: 마지막 장에서는 오른쪽 단추가 «되돌리기»(Lucide undo-2) — 누르면 줄이 맨 앞까지 빠르게 넘어간다(showSelected의 부드러운 이동) */}
            {(() => {
              const atEnd = p.posters.length > 1 && p.selected >= p.posters.length - 1;
              return <button type="button" className="carousel-arrow next" data-rewind={atEnd || undefined} aria-label={atEnd ? "처음 포스터로" : "다음 포스터"}
                disabled={p.posters.length < 2} onClick={() => p.select(atEnd ? 0 : p.selected + 1)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {atEnd ? <><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/></> : <path d="m9 18 6-6-6-6"/>}
                </svg>
              </button>;
            })()}
          </div>
          {/* 디자인 이름은 한글(10/23 Bumm님 «아이들 대상이라») · 순번(1 / 8)은 없음(10/20) */}
          {p.posters[p.selected] && <p className="poster-carousel-caption">{designName(p.posters[p.selected].label)}</p>}
        </div>
        <div className="workspace" id="resultWorkspace">
          <div className="page-heading">
            <h1>나만의 영화 포스터, <span className="result-accent">완성 !</span></h1>
            <p>마음에 드는 디자인을 고르고 인쇄하세요.</p>
          </div>
          <aside className="result-settings">
            <p className="section-description">
              아래 스타일을 누르면 크게 볼 수 있어요.
            </p>
            <div
              id="gallery"
              ref={galleryRef}
              className="gallery style-grid"
              aria-label="포스터 스타일"
            >
              {p.posters.map((poster, i) => (
                <button
                  type="button"
                  key={poster.label + i}
                  className={`style-option thumb${i === p.selected ? " active" : ""}`}
                  aria-pressed={i === p.selected}
                  aria-label={`${designName(poster.label)} 버전 고르기`}
                  onClick={() => p.select(i)}
                >
                  <span className="style-image">
                    <img src={posterURLs[i]} alt="" />
                    <span className="style-check" aria-hidden="true">
                      ✓
                    </span>
                  </span>
                  <span className="style-caption">
                    <span className="style-name label">{designName(poster.label)}</span>
                  </span>
                </button>
              ))}
            </div>
          </aside>
          <div className="action-dock result-actions">
            <button type="button" className="back-button" onClick={() => go(2)} disabled={locked}><span aria-hidden="true">←</span> <span className="label-pc">이전</span><span className="label-phone">다시 찍기</span></button>
            <button id="printBtn" type="button" className="primary-button" onClick={p.onPrint}><StudioIcon name="print"/>이 포스터로 출력하기</button>
            {/* ⑪ 휴대폰: 인쇄 대신 내 휴대폰에 저장(파일 공유 → 안 되면 PNG 내려받기). PC에서는 숨김. */}
            <button id="saveBtn" type="button" className="primary-button" onClick={onSave} disabled={!p.posters[p.selected]}><StudioIcon name="download"/>내 휴대폰에 저장</button>
          </div>
        </div>
      </section>
      {p.spinning && <GenerationWait spinTextRef={p.spinTextRef} sceneEndRef={p.sceneEndRef}/>}
      {saveHint && step === 3 && <p className="save-hint" role="status">공유 창에서 ‘이미지 저장’을 누르세요</p>}
      {completionVisible && step === 3 && !p.generating && <div className="completion-notice" role="status">
        <span className="completion-notice-mark" aria-hidden="true">✓</span>
        <strong>완성 !</strong>
        {/* 휴대폰은 단추가 «내 휴대폰에 저장»이라 «저장하세요»(10/25 Bumm님) */}
        <p><span className="label-pc">마음에 드는 버전을 고르고 인쇄하세요.</span><span className="label-phone">마음에 드는 버전을 고르고 저장하세요.</span></p>
      </div>}
      <div className="studio-status" hidden={p.spinning || !p.status}>
        <p id="status" role="status">
          {p.status}
        </p>
      </div>
      {!p.spinning && <GenerateFailureDialog failure={p.failure} online={p.online}
        onRetry={p.onRetryFailure} onRetake={p.onRetakeFailure} onEditInputs={() => { void p.onDismissFailure(); go(1); }} onHome={() => void p.onHome()} />}
      <BoothCodeDialog open={p.boothOpen && !p.spinning} verify={p.verifyBooth} onSaved={p.onBoothCodeSaved} onClose={() => void p.onBoothCodeClose()} />
      <dialog
        ref={dialog}
        className="poster-dialog"
        aria-label="포스터 크게 보기"
      >
        <button
          type="button"
          className="dialog-close"
          aria-label="닫기"
          onClick={() => dialog.current?.close()}
        >
          ×
        </button>
        {p.posters[p.selected] && (
          <img
            src={posterURLs[p.selected]}
            alt="선택한 완성 포스터"
          />
        )}
        {/* ⑩ 휴대폰: 크게 보기 창 안에서도 좌우로 넘긴다(PC에서는 숨김 — 위 한 장이 그대로 보인다) */}
        <div className="dialog-carousel" ref={dialogCarouselRef} onScroll={(event) => onSwipe(event.currentTarget)}>
          {p.posters.map((poster, i) => <img key={poster.label + i} src={posterURLs[i]} alt={`${designName(poster.label)} 포스터`} />)}
        </div>
      </dialog>
    </>
  );
}
