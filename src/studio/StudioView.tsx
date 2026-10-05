import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type { Poster } from "../state.js";
import { DEFAULT_MOVIE_TITLE, DEFAULT_PERSON_NAME } from "../defaults.js";
import MemberField from "./MemberField.js";
import GenerationWait from "./GenerationWait.js";

const choices = [
  ["sf", "SF", "reference-sf.jpg"],
  ["fantasy", "판타지", "reference-fantasy.png"],
  ["animation", "애니메이션", "reference-animation.jpg"],
  ["hero", "히어로", "reference-hero.jpg"],
  ["mystery", "스릴러", "parasite-en.webp"],
  ["director", "드라마", "director.webp"],
  ["sports", "스포츠", "rocky-title-edited.webp"],
  ["music", "뮤지컬", "reference-La-La-Land.png"],
];
type Action = () => void | Promise<void>;
export interface StudioViewProps {
  mode: string;
  setMode: (mode: string) => void;
  phase: string;
  snapshotURL: string | null;
  countdown: string | null;
  generating: boolean;
  spinning: boolean;
  fallbackShown: boolean;
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
  onStart: Action;
  onStop: Action;
  cameraReadyId: number;
  onShot: Action;
  designPreview?: boolean;
  onRetake: Action;
  onGenerate: Action;
  onFallback: Action;
  onPrint: Action;
  onNewPerson: Action;
  onHome: Action;
  stopCamera: Action;
}

function StudioIcon({name}: {name: 'camera' | 'arrow' | 'reset' | 'expand' | 'print' | 'mic'}) {
  // Lucide 공식 SVG: camera · rotate-ccw · maximize · mic (ISC 고지: public/studio/lucide-LICENSE.txt)
  const paths = {
    // Lucide 공식 camera 아이콘. 원본 고지: public/studio/lucide-LICENSE.txt
    camera: <><path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"/><circle cx="12" cy="13" r="3"/></>,
    arrow: <path d="M4 12h15m-6-6 6 6-6 6"/>,
    reset: <><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></>,
    expand: <><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></>,
    mic: <><path d="M12 19v3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><rect x="9" y="2" width="6" height="13" rx="3"/></>,
    print: <><path d="M7 8V3h10v5M7 17H3V8h18v9h-4M7 14h10v7H7Z"/><path d="M17 11h1"/></>
  };
  return <svg className="studio-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
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
  const [captureNoticeVisible, setCaptureNoticeVisible] = useState(false);
  const [genre, setGenre] = useState("sf");
  const [preview, setPreview] = useState({
    title: "",
    name: "",
    group: "",
    members: "",
  });
  const dialog = useRef<HTMLDialogElement>(null);
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
      if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
      window.scrollTo({ top: 0, behavior: "instant" });
      previousStep.current = step;
    }
  }, [step]);
  useEffect(() => {
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
  const cast =
    p.mode === "solo"
      ? preview.name || DEFAULT_PERSON_NAME
      : members ||
        (groupExample
          ? "북두칠성 · 북극성 · 시리우스 · 오리온 · 카시오페아"
          : "");
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
        <div className="preview-panel">
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
                        src={"/studio/" + image}
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
                주인공이 될 순간 만들러 가기 <span aria-hidden="true">→</span>
              </button>
            </div>
          </form>
        </div>
      </section>

      <section id="cameraView" className="camera-layout" hidden={step !== 2} aria-label="사진 촬영">
        <div className="camera-surface">
          <div className="camera-top"><span>카메라 미리 보기</span><span>{p.phase === "shot" ? "촬영 완료" : p.phase === "live" ? "카메라 연결됨" : "촬영 구도 예시"}</span></div>
          <div className="camera-large cameraBox">
            <img className={`camera-example${p.mode === "group" ? " camera-example-group" : ""}`} src={p.mode === "group" ? "/studio/camera-group.webp" : "/studio/camera-student.webp"} alt={p.mode === "group" ? "모두의 얼굴이 보이게 모여 웃는 단체 촬영 구도 예시" : "얼굴과 어깨를 담고 편하게 웃는 촬영 구도 예시"} hidden={p.phase !== "idle"} />
            <video id="video" ref={p.videoRef} autoPlay playsInline muted className={p.phase === "live" ? "" : "hidden"}/>
            <img id="snapshot" src={p.snapshotURL ?? undefined} className={p.phase === "shot" ? "" : "hidden"} alt="촬영 사진"/>
            <div id="camHint" className={p.phase === "idle" ? "camHint camera-example-caption" : "camHint hidden"}>
              <span className="camera-example-label">{p.mode === "group" ? "이렇게, 모두의 얼굴이 보이게" : "이렇게, 얼굴과 어깨가 보이게"}</span>
              <button type="button" id="startBtn" className="camera-start-button" onClick={p.onStart} disabled={locked}>카메라 켜기 <StudioIcon name="camera"/></button>
            </div>
            {p.phase === "live" && <>
              <span className="camera-live-indicator"><i aria-hidden="true"/>실시간 미리보기</span>
              <div className="camHint camera-example-caption">
                <button type="button" id="stopCameraBtn" className="camera-start-button" onClick={p.onStop} disabled={locked}>카메라 끄기 <StudioIcon name="camera"/></button>
              </div>
            </>}
            {cameraReadyVisible && step === 2 && p.phase === "live" && !p.capturing && <div className="camera-ready-notice" role="status">카메라 준비 완료</div>}
            {captureNoticeVisible && step === 2 && p.phase === "shot" && !p.generating && <div className="camera-ready-notice camera-capture-notice" role="status"><strong>촬영 완료 !</strong><span>사진을 확인하고 ‘이 사진으로 만들기’를 눌러주세요.</span></div>}
            <div className="camera-guides" aria-hidden="true"><i/><i/><i/><i/></div>
            {p.phase === "shot" && <span className="captured-badge">✓ 촬영 완료</span>}
            <div id="countdown" className={p.countdown === null ? "countdown hidden" : "countdown"} aria-live="assertive">{p.countdown}</div>
          </div>
          <p className="camera-bottom">{p.mode === "group" ? "모두의 얼굴이 잘 보이도록, 조금씩 가까이 모여주세요." : "얼굴과 어깨가 화면 안에 들어오도록 맞춰주세요."}</p>

        </div>
        <div className="workspace" id="cameraWorkspace">
          <div className="page-heading"><h1>{p.phase === "shot" ? "이 사진으로 만들까요?" : <><span className="camera-heading-accent">{p.mode === "group" ? "우리답게," : "나답게,"}</span> 편하게 웃어주세요.</>}</h1></div>
          <aside className="camera-guide">
            <div className="camera-instructions" data-review={p.phase === "shot"}>
            <ul className="camera-tips" aria-hidden={p.phase === "shot"}>
              <li><span>1</span><div><strong>{p.mode === "group" ? "모두의 얼굴이 잘 보이게" : "얼굴이 잘 보이게"}</strong><p>{p.mode === "group" ? "앞뒤로 겹치지 않게, 프레임 안에 모여주세요." : "머리 위부터 어깨까지 화면에 담아주세요."}</p></div></li>
              <li><span>2</span><div><strong>{p.mode === "group" ? "표정은 우리답게" : "표정은 나답게"}</strong><p>편하게 웃어도, 멋진 포즈를 지어도 좋아요.</p></div></li>
              <li><span>3</span><div><strong>준비되면 촬영</strong><p>버튼을 누르고 3초만 포즈를 유지해 주세요.</p></div></li>
            </ul>

            <div className="photo-review" aria-hidden={p.phase !== "shot"}><p>표정과 구도가 마음에 드나요?<br/>다시 찍어도 괜찮아요.</p><button id="retakeBtn" type="button" className="quiet-button" disabled={locked || p.phase !== "shot"} onClick={p.onRetake}><StudioIcon name="reset"/>다시 찍기</button></div>
            </div>
            <div className="camera-film-heading"><h2>오늘 촬영할 <span className="camera-heading-accent">영화</span></h2></div>
            <div className="camera-film-card">
              <div className="camera-film-scene"><div className="camera-film-poster"><img src={'/studio/' + selectedFilm[2]} alt={genreLabel + ' 선택 포스터'}/><span>{p.mode === "solo" ? "단독 주연" : "우리 같이"}</span></div></div>
              <div className="movie-ticket camera-ticket"><div><span className="ticket-label">{genreLabel} · 나의 첫 번째 영화</span><strong>{title}</strong><span className="camera-ticket-name">{p.mode === 'solo' ? '주연' : preview.group || (groupExample ? '별 보러 가요' : '단체 이름')}<span className="ticket-cast">{cast ? (p.mode === 'solo' ? ' · ' : ' | ') + cast : ''}</span></span></div><div className="ticket-admit"><span>11.14</span><small>CGV 인천</small></div></div>
            </div>
          </aside>
          <div className="action-dock camera-actions">
            <button type="button" className="back-button" aria-label="이전 단계로" disabled={locked} onClick={() => go(1)}><span aria-hidden="true">←</span> 이전</button>
            <button id="shotBtn" type="button" className="primary-button" hidden={p.phase === "shot"} disabled={locked} onClick={p.onShot}><StudioIcon name="camera"/>{p.designPreview ? '샘플 포스터 보기' : p.capturing ? '촬영 중…' : '3초 뒤 사진 찍기'}</button>
            <button id="generateBtn" type="button" className="primary-button" hidden={p.phase !== "shot"} disabled={p.generating} onClick={p.onGenerate}>이 사진으로 만들기 <StudioIcon name="arrow"/></button>
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
              onClick={() => dialog.current?.showModal()}
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
              className="gallery style-grid"
              aria-label="포스터 스타일"
            >
              {p.posters.map((poster, i) => (
                <button
                  type="button"
                  key={poster.label + i}
                  className={`style-option thumb${i === p.selected ? " active" : ""}`}
                  aria-pressed={i === p.selected}
                  aria-label={`${poster.label} 버전 고르기`}
                  onClick={() => p.select(i)}
                >
                  <span className="style-image">
                    <img src={posterURLs[i]} alt="" />
                    <span className="style-check" aria-hidden="true">
                      ✓
                    </span>
                  </span>
                  <span className="style-caption">
                    <span className="style-name label">{poster.label}</span>
                  </span>
                </button>
              ))}
            </div>
          </aside>
          <div className="action-dock result-actions">
            <button type="button" className="back-button" onClick={() => go(2)} disabled={locked}><span aria-hidden="true">←</span> 이전</button>
            <button id="printBtn" type="button" className="primary-button" onClick={p.onPrint}><StudioIcon name="print"/>이 포스터로 출력하기</button>
          </div>
        </div>
      </section>
      {p.spinning && <GenerationWait spinTextRef={p.spinTextRef}/>}
      {completionVisible && step === 3 && !p.generating && <div className="completion-notice" role="status">
        <span className="completion-notice-mark" aria-hidden="true">✓</span>
        <strong>완성 !</strong>
        <p>마음에 드는 버전을 고르고 인쇄하세요.</p>
      </div>}
      <div className="studio-status" hidden={p.spinning || (!p.status && !p.fallbackShown)}>
        <p id="status" role="status">
          {p.status}
        </p>
        <button
          id="fallbackBtn"
          type="button"
          className={
            p.fallbackShown ? "secondary-button" : "secondary-button hidden"
          }
          onClick={p.onFallback}
        >
          AI 없이 기본 버전으로 계속하기
        </button>
      </div>
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
      </dialog>
    </>
  );
}
