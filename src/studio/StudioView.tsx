import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type { Poster } from "../state.js";
import MemberField from "./MemberField.js";

const choices = [
  ["sf", "SF", "reference-sf.jpg"],
  ["fantasy", "판타지", "reference-fantasy.jpg"],
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
  posters: Poster[];
  selected: number;
  select: (index: number) => void;
  spent: boolean;
  resetKey: number;
  capturing: boolean;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  videoRef: RefObject<HTMLVideoElement | null>;
  spinTextRef: RefObject<HTMLParagraphElement | null>;
  onStart: Action;
  onShot: Action;
  onRetake: Action;
  onGenerate: Action;
  onRegen: Action;
  onFallback: Action;
  onDownload: Action;
  onPrint: Action;
  onReset: Action;
  onNewPerson: Action;
  stopCamera: Action;
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
    setStep(next);
  };
  useEffect(() => {
    document.body.dataset.step = String(step);
    if (previousStep.current !== step) {
      const view = document.getElementById(["prepareView", "cameraView", "resultView"][step - 1]);
      const heading = view?.querySelector<HTMLHeadingElement>("h1");
      if (heading) { heading.tabIndex = -1; heading.focus(); }
      previousStep.current = step;
    }
  }, [step]);
  useEffect(() => {
    if (p.posters.length && p.posters !== shownPosters.current) setStep(3);
    shownPosters.current = p.posters;
  }, [p.posters]);
  useEffect(() => {
    if (p.resetKey === prevReset.current) return;
    prevReset.current = p.resetKey;
    setPreview({ title: "", name: "", group: "", members: "" });
    setGenre("animation");
    setStep(1);
  }, [p.resetKey]);
  const title = preview.title || "별을 찾는 아이";
  const members = preview.members
    .split(/[,\.·/|;\s]+/u)
    .filter(Boolean)
    .join(" · ");
  const groupExample = !preview.group && !members;
  const cast =
    p.mode === "solo"
      ? preview.name || "김인키"
      : members ||
        (groupExample
          ? "북두칠성 · 북극성 · 시리우스 · 오리온 · 카시오페아"
          : "");
  const genreLabel = choices.find((c) => c[0] === genre)?.[1] ?? "애니메이션";
  const locked = p.generating || p.capturing;

  return (
    <>
      <a className="skip-link" href="#prepareWorkspace">
        본문으로 바로가기
      </a>
      <header className="app-header">
        <div className="header-inner">
          <div className="brand">
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
          </div>
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
            <div className="festival-brand">
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
            </div>
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
                인천의 극장에서 만나는 나만의 첫 번째 영화 포스터.
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
            <h1>오늘의 주인공, 등장 !</h1>
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
                  aria-label="나 혼자 또는 다 같이 선택"
                >
                  {[
                    ["solo", "나 혼자"],
                    ["group", "다 같이"],
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

      <section
        id="cameraView"
        className="camera-layout"
        hidden={step !== 2}
        aria-label="사진 촬영"
      >
        <div className="camera-surface">
          <div className="camera-top">
            <span>카메라 미리 보기</span>
            <span>{p.phase === "shot" ? "촬영 완료" : "사진 촬영"}</span>
          </div>
          <div className="camera-large cameraBox">
            <video
              id="video"
              ref={p.videoRef}
              autoPlay
              playsInline
              muted
              className={p.phase === "shot" ? "hidden" : ""}
            />
            <img
              id="snapshot"
              src={p.snapshotURL ?? undefined}
              className={p.phase === "shot" ? "" : "hidden"}
              alt="촬영 사진"
            />
            <div
              id="camHint"
              className={p.phase === "idle" ? "camHint" : "camHint hidden"}
            >
              <PeopleIcon group={p.mode === "group"} />
              <p>카메라를 켜고 주인공을 만나보세요.</p>
              <button
                type="button"
                id="startBtn"
                className="primary-button"
                onClick={p.onStart}
                disabled={locked}
              >
                카메라 켜기
              </button>
            </div>
            <div className="camera-guides" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </div>
            <div
              id="countdown"
              className={
                p.countdown === null ? "countdown hidden" : "countdown"
              }
              aria-live="assertive"
            >
              {p.countdown}
            </div>
          </div>
          <p className="camera-bottom">
            얼굴과 어깨가 화면 안에 충분히 보이도록 맞춰주세요.
          </p>
        </div>
        <div className="workspace">
          <div className="page-heading">
            <h1>
              {p.phase === "shot"
                ? "주인공의 순간, 준비 완료 !"
                : "나답게, 편하게 웃어주세요."}
            </h1>
          </div>
          <aside className="camera-guide">
            <ul className="camera-tips">
              <li>
                <span>1</span>
                <div>
                  <strong>얼굴이 잘 보이게</strong>
                  <p>머리 위부터 어깨까지 화면에 담아주세요.</p>
                </div>
              </li>
              <li>
                <span>2</span>
                <div>
                  <strong>표정은 나답게</strong>
                  <p>편하게 웃어도, 멋진 포즈를 지어도 좋아요.</p>
                </div>
              </li>
              <li>
                <span>3</span>
                <div>
                  <strong>준비되면 촬영</strong>
                  <p>버튼을 누르고 잠시 포즈를 유지해 주세요.</p>
                </div>
              </li>
            </ul>
            <p className="summary-label">오늘 촬영할 영화</p>
            <div className="movie-summary">
              <div className="ticket-icon" aria-hidden="true">
                ✧
              </div>
              <div>
                <span>{genreLabel}</span>
                <strong>{title}</strong>
                <p>
                  {p.mode === "solo"
                    ? preview.name || "김인키"
                    : preview.group || "별 보러 가요"}
                </p>
              </div>
            </div>
          </aside>
          <div className="action-dock camera-actions">
            <button
              type="button"
              className="back-button"
              disabled={locked}
              onClick={() => go(1)}
            >
              ← 정보 수정
            </button>
            <button
              id="shotBtn"
              type="button"
              className="primary-button"
              hidden={p.phase === "shot"}
              disabled={locked}
              onClick={p.onShot}
            >
              3·2·1 촬영
            </button>
            <button
              id="retakeBtn"
              type="button"
              className="secondary-button"
              hidden={p.phase !== "shot"}
              disabled={locked}
              onClick={p.onRetake}
            >
              다시 촬영
            </button>
            <button
              id="generateBtn"
              type="button"
              className="primary-button"
              hidden={p.phase !== "shot"}
              disabled={p.generating}
              onClick={p.onGenerate}
            >
              AI 포스터 만들기
            </button>
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
            <span>나의 영화 포스터</span>
            <button
              className="icon-button"
              type="button"
              aria-label="포스터 크게 보기"
              onClick={() => dialog.current?.showModal()}
            >
              ⛶
            </button>
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
        <div className="workspace">
          <div className="page-heading">
            <h1>나의 영화가 완성됐어요.</h1>
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
            <div className="result-secondary">
              <button
                type="button"
                className="quiet-button"
                disabled={locked}
                onClick={() => go(1)}
              >
                영화 정보 수정
              </button>
              <button
                id="regenBtn"
                type="button"
                className="quiet-button"
                disabled={p.generating || p.spent}
                onClick={p.onRegen}
              >
                {p.spent
                  ? "재생성 횟수 소진(다시 촬영 시 초기화)"
                  : "다른 그림으로"}
              </button>
              <button
                id="resetBtn"
                type="button"
                className="quiet-button"
                disabled={locked}
                onClick={p.onReset}
              >
                입력 초기화
              </button>
              <button
                type="button"
                className="quiet-button"
                disabled={locked}
                onClick={p.onNewPerson}
              >
                다음 주인공
              </button>
            </div>
          </aside>
          <div className="action-dock result-actions">
            <button
              id="downloadBtn"
              type="button"
              className="secondary-button"
              onClick={p.onDownload}
            >
              PNG 저장
            </button>
            <button
              id="printBtn"
              type="button"
              className="primary-button"
              onClick={p.onPrint}
            >
              인쇄하기
            </button>
          </div>
        </div>
      </section>
      <div
        className={
          p.spinning
            ? "generation-overlay spinner"
            : "generation-overlay spinner hidden"
        }
        id="spinner"
        role="status"
      >
        <div className="ring" />
        <p ref={p.spinTextRef}>AI가 그리는 중…</p>
      </div>
      <div className="studio-status" hidden={!p.status && !p.fallbackShown}>
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
