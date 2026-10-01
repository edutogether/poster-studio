/* 확정된 3단계 디자인은 StudioView가 표시한다.
   촬영·AI 요청·조판·저장·인쇄는 기존 핸들러를 재사용하며 출력 규격과
   개인정보 FormData 경계는 바꾸지 않는다. 입력 id를 유지해 getMeta를 재사용한다. */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  $,
  val,
  pick,
  GENRES,
  API_BASE,
  BOOTH_TOKEN,
  W,
  H,
} from "./constants.js";
import { buildPosters, makePlaceholderArt } from "./poster.js";
import StudioView from "./studio/StudioView.js";
import { DEFAULT_MOVIE_TITLE, DEFAULT_PERSON_NAME } from "./defaults.js";
import type { Meta, Poster } from "./state.js";

/* 한 장의 사진으로는 최초 생성 1회 + 재생성 1회, 총 2회까지만 허용한다
   (2026-08-29 대표 결정) — 무제한은 남용/과금 위험, 금지는 "결과가 안 좋게 나온
   아이는 그대로 끝"이 되는 문제가 있어 절충한 값. 다시 촬영하면 초기화된다. */
const MAX_GENERATIONS_PER_PHOTO = 2;

/** 화면 입력값 수집. 원본 api.ts의 getMeta()와 동일 — id가 그대로라 val()이 그대로 쓰인다. */
export function getMeta(mode: string): Meta {
  const genre = val("genre") || "animation";
  let tagline = val("tagline");
  if (!tagline) tagline = pick(GENRES[genre].taglines);
  return {
    mode,
    name: val("studentName") || DEFAULT_PERSON_NAME,
    groupName: val("groupName") || "우리들",
    members: val("members"),
    title: val("movieTitle") || DEFAULT_MOVIE_TITLE,
    genre,
    tagline,
  };
}

/* 초기 플레이스홀더 그림 — 처음 마운트할 때와 `초기화` 버튼이 되돌릴 때 둘 다 쓴다.
   두 벌로 두면 한쪽만 고치는 사고가 난다(master도 같은 이유로 api.js에 한 벌로 뒀다). */
function drawPlaceholder(pctx: CanvasRenderingContext2D) {
  pctx.fillStyle = "#0d0f14";
  pctx.fillRect(0, 0, W, H);
  pctx.fillStyle = "#e9b949";
  pctx.textAlign = "center";
  pctx.font = "900 84px 'Black Han Sans', sans-serif";
  pctx.fillText("🎬", W / 2, 760);
  pctx.fillStyle = "#f4f6fb";
  pctx.font = "900 56px 'Black Han Sans', sans-serif";
  pctx.fillText("AI 영화 포스터", W / 2, 880);
  pctx.fillStyle = "#aeb7d0";
  pctx.font = "500 30px sans-serif";
  pctx.fillText("촬영 후 이곳에 4가지 버전이 표시됩니다", W / 2, 950);
}

export default function PosterStudio() {
  const designPreview = import.meta.env.DEV && import.meta.env.VITE_POSTER_DESIGN_PREVIEW === "1";
  const [mode, setMode] = useState("solo");
  /* 초기 문구("카메라를 켜고 사진을 촬영해 주세요.")는 페이지 맨 아래 ※ 영역으로
     옮겼다(2026-09-09 대표 지시). **요소는 남긴다** — 오류·진행 상황이 뜨는 자리다.
     비어 있을 때는 CSS(.status:empty)가 줄을 통째로 접는다. */
  const [status, setStatus] = useState("");
  /* 촬영 영역의 3상태. 원본의 classList 조작을 그대로 옮긴 것이다:
       idle — video 보임(빈 화면) · snapshot 숨김 · camHint 보임 (초기)
       live — video 보임(스트림)  · snapshot 숨김 · camHint 숨김 (startCamera)
       shot — video 숨김          · snapshot 보임 · camHint 숨김 (촬영 완료)
     video는 처음부터 보인다 — 원본 마크업에 hidden이 없다. 여기서 초기에
     숨겼다가 대조에서 #video 유실로 바로 잡혔다. */
  const [phase, setPhase] = useState<"idle" | "live" | "shot">("idle");
  const [snapshotURL, setSnapshotURL] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [fallbackShown, setFallbackShown] = useState(false);
  const [posters, setPosters] = useState<Poster[]>([]);
  const [selected, setSelected] = useState(0);
  const [genCount, setGenCount] = useState(0);
  const [generating, setGenerating] = useState(false);

  const [resetKey, setResetKey] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const shootingRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spinTextRef = useRef<HTMLParagraphElement>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const cameraEpoch = useRef(0);
  const cameraOpening = useRef<Promise<void> | null>(null);
  const capturedBlobRef = useRef<Blob | null>(null);
  const pendingMetaRef = useRef<Meta | null>(null);
  const snapshotURLRef = useRef<string | null>(null);
  const isGeneratingRef = useRef(false); // 이중 클릭 방지(중복 과금 차단)
  const genCountRef = useRef(0);
  const placeholderDrawnRef = useRef(false);

  /* <video muted>는 React가 속성이 아니라 프로퍼티로만 다뤄서 DOM에 muted 속성이
     남지 않는다. 원본 마크업에는 있고, 브라우저 자동재생 정책이 그 속성을 보므로
     직접 달아준다(§5.5 비가시 값 대조에서도 잡히는 차이다). */
  useEffect(() => {
    videoRef.current?.setAttribute("muted", "");
  }, []);

  /* 촬영 후 카메라를 켜둔 채 두지 않는다 — 최소수집 원칙이고 아동 대상이라 더
     중요하다(6차 감사에서 고친 것). 화면을 떠날 때도 반드시 꺼야 하므로 정리
     함수에서도 끈다(위험 D). */
  useEffect(() => {
    return () => {
      cameraEpoch.current += 1;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (snapshotURLRef.current) URL.revokeObjectURL(snapshotURLRef.current);
    };
  }, []);

  /* 초기 플레이스홀더 포스터. StrictMode가 효과를 두 번 부르더라도 **정확히 한 번만**
     그린다(위험 E) — 그린 뒤 부트 스플래시를 내리는 신호를 보내므로, 두 번 도는 것
     자체가 "첫 의미있는 화면" 시점을 흐린다. */
  useEffect(() => {
    if (placeholderDrawnRef.current) return;
    placeholderDrawnRef.current = true;
    const pctx = canvasRef.current?.getContext("2d");
    if (!pctx) return;
    drawPlaceholder(pctx);
    /* 첫 의미있는 화면이 그려졌다 — 스플래시의 시계를 흐르게 한다(로드 게이트 B).
       **여기서 스플래시를 숨기지 않는다.** 숨기는 타이밍은 style.css의 splashOut이
       잡고, 이 신호는 '언제부터 재기 시작할지'만 정한다. 그래서 번들이 늦게 붙어도
       사용자는 항상 1800ms 동안 온전한 브랜드 화면을 보고, 걷힌 뒤에는 덜 그려진
       화면이 아니라 완성된 첫 화면을 본다. */
    document.body.classList.add("app-ready");
  }, []);

  /* 선택된 포스터를 큰 캔버스에 그린다. 원본 select()와 같은 순서(clear → draw). */
  useEffect(() => {
    const pctx = canvasRef.current?.getContext("2d");
    if (!pctx || !posters.length) return;
    pctx.clearRect(0, 0, 1200, 1800);
    pctx.drawImage(posters[selected].canvas, 0, 0);
  }, [posters, selected]);

  /* AI 서버 연결 상태를 미리 확인한다. 촬영·정보입력을 다 마친 뒤에야 실패를 알게
     되는 것보다, 페이지를 여는 순간 문제를 아는 게 낫다. 실패해도 촬영은 막지
     않는다(연결이 잠깐 불안정했을 수도 있으므로 fail-open). */
  useEffect(() => {
    if (designPreview) return;
    let alive = true;
    (async () => {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 6000);
        const r = await fetch(`${API_BASE}/health`, { signal: ctrl.signal });
        clearTimeout(timer);
        if (!r.ok) throw new Error("unhealthy");
        const data = await r.json().catch(() => ({}));
        // 5차 감사 발견: HTTP 상태만 보면 /health가 "키는 있음"만 확인하고 OpenAI가
        // 실제로 죽어있어도 경고가 안 떴다 — 응답 본문의 openaiReachable도 확인한다.
        if (alive && data.openaiReachable === false) {
          setStatus(
            "⚠ AI(OpenAI) 서버에 연결할 수 없습니다. 잠시 후 다시 열어보거나 담당자에게 알려주세요. (촬영은 가능하지만 포스터 생성이 실패할 수 있어요)",
          );
        }
      } catch {
        if (alive)
          setStatus(
            "⚠ AI 서버 연결을 확인할 수 없습니다. 와이파이를 확인해 주세요. (촬영은 가능하지만 포스터 생성이 실패할 수 있어요)",
          );
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* 인쇄가 끝나면 인쇄용 노드를 걷어낸다. 원본의 window afterprint 리스너와 동일. */
  useEffect(() => {
    const onAfterPrint = () => {
      $("printArea")?.remove();
    };
    window.addEventListener("afterprint", onAfterPrint);
    return () => window.removeEventListener("afterprint", onAfterPrint);
  }, []);

  const startCamera = useCallback(() => {
    if (cameraOpening.current) return cameraOpening.current;
    const epoch = cameraEpoch.current;
    const opening = (async () => {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 960, facingMode: "user" },
        audio: false,
      });
      // 권한 창이 열린 사이 다른 단계로 돌아갔으면 뒤늦게 카메라를 켜지 않는다.
      if (epoch !== cameraEpoch.current || !videoRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      setPhase("live");
      setStatus("카메라 준비 완료. ‘3·2·1 촬영’을 누르세요.");
    })();
    cameraOpening.current = opening;
    void opening
      .finally(() => {
        if (cameraOpening.current === opening) cameraOpening.current = null;
      })
      .catch(() => {});
    return opening;
  }, []);

  const onStart = async () => {
    try {
      await startCamera();
    } catch {
      setStatus(
        "카메라를 열 수 없습니다. 브라우저 카메라 권한을 허용해 주세요.",
      );
    }
  };

  const onShot = async () => {
    if (shootingRef.current || isGeneratingRef.current) return;
    shootingRef.current = true;
    setCapturing(true);
    try {
      if (!streamRef.current) {
        try {
          await startCamera();
        } catch {
          setStatus("카메라 권한을 허용해 주세요.");
          return;
        }
      }
      if (!streamRef.current) return;
      for (let i = 3; i > 0; i--) {
        setCountdown(String(i));
        await new Promise((r) => setTimeout(r, 800));
      }
      setCountdown("📸");
      await new Promise((r) => setTimeout(r, 250));
      setCountdown(null);

      const video = videoRef.current;
      if (!video || !video.videoWidth) {
        setStatus("카메라가 아직 준비 중이에요. 1~2초 후 다시 촬영해 주세요.");
        return;
      }
      const MAXW = 1024; // 전송용 축소(AI가 스타일을 새로 그리므로 화질 손해 없음)
      const scale = Math.min(1, MAXW / video.videoWidth);
      const cap = document.createElement("canvas");
      cap.width = Math.round(video.videoWidth * scale);
      cap.height = Math.round(video.videoHeight * scale);
      const c = cap.getContext("2d")!;
      c.translate(cap.width, 0);
      c.scale(-1, 1); // 거울 모드(셀카 느낌)
      c.drawImage(video, 0, 0, cap.width, cap.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        cap.toBlob(resolve, "image/jpeg", 0.85),
      );
      if (!videoRef.current) return;
      if (!blob) {
        setStatus("촬영에 실패했어요. 다시 시도해 주세요.");
        return;
      }
      capturedBlobRef.current = blob;
      if (snapshotURLRef.current) URL.revokeObjectURL(snapshotURLRef.current); // 장시간 운영 대비
      const url = URL.createObjectURL(blob);
      snapshotURLRef.current = url;
      setSnapshotURL(url);
      setPhase("shot");
      // 촬영이 끝나면 스트림을 실제로 끈다(6차 감사).
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setStatus("촬영 완료! 사진을 확인하고 ‘AI 포스터 만들기’를 누르세요.");
      genCountRef.current = 0;
      setGenCount(0);
    } finally {
      shootingRef.current = false;
      setCapturing(false);
    }
  };

  const onRetake = async () => {
    capturedBlobRef.current = null;
    if (snapshotURLRef.current) URL.revokeObjectURL(snapshotURLRef.current);
    snapshotURLRef.current = null;
    setSnapshotURL(null);
    setPhase("idle");
    setPosters([]);
    setFallbackShown(false);
    pendingMetaRef.current = null;
    genCountRef.current = 0;
    setGenCount(0);
    try {
      await startCamera();
    } catch {
      setStatus("카메라 권한을 허용해 주세요.");
    }
  };

  const applyPosters = (built: Poster[]) => {
    setPosters(built);
    setSelected(0);
  };

  /* 초기화 — 입력한 것을 다 지우되 **촬영한 사진은 남긴다**(2026-09-09 대표 지시).
     `다시 촬영`과 정반대다: 그건 사진만 다시 찍고 입력은 남기고, 이쪽은 사진만 남기고
     입력을 지운다. 확인창은 두지 않는다(부스에서 아이가 쓰는 화면).
     🔴 capturedBlobRef · snapshotURL · phase는 일부러 건드리지 않는다 — 이 셋이
     사진이 남아 있다는 상태 그 자체다.
     입력칸이 비제어(uncontrolled)라 값은 DOM에서 직접 지운다(원본과 같은 방식). */
  const onReset = () => {
    if (isGeneratingRef.current) return;
    for (const id of ["studentName", "groupName", "members", "movieTitle"]) {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (el) el.value = "";
    }
    const genre = document.getElementById("genre") as HTMLSelectElement | null;
    if (genre) genre.selectedIndex = 0;
    setMode("solo");
    setResetKey((key) => key + 1);
    setPosters([]);
    setSelected(0);
    genCountRef.current = 0;
    setGenCount(0);
    pendingMetaRef.current = null;
    setFallbackShown(false);
    setStatus("");
    const pctx = canvasRef.current?.getContext("2d");
    if (pctx) drawPlaceholder(pctx);
  };

  const onGenerate = async () => {
    if (isGeneratingRef.current) return;
    if (!capturedBlobRef.current) {
      setStatus("먼저 사진을 촬영해 주세요.");
      return;
    }
    if (genCountRef.current >= MAX_GENERATIONS_PER_PHOTO) {
      setStatus(
        "이 사진으로는 재생성 횟수를 모두 사용했어요. 다시 촬영하면 새로 만들 수 있어요.",
      );
      return;
    }
    const meta = getMeta(mode);
    isGeneratingRef.current = true;
    genCountRef.current += 1;
    setGenCount(genCountRef.current);
    setGenerating(true);
    setFallbackShown(false);
    setSpinning(true);
    setStatus("AI가 영화 포스터 그림을 그리는 중입니다… (10~25초)");

    const form = new FormData();
    form.append("photo", capturedBlobRef.current, "capture.jpg");
    form.append("movieTitle", meta.title);
    form.append("tagline", meta.tagline);
    form.append("genre", meta.genre);
    form.append("mode", meta.mode);

    const started = Date.now();
    const tick = setInterval(() => {
      // 경과 시간 표시(체감 대기 개선)
      const el = spinTextRef.current;
      if (el)
        el.textContent = `AI가 그리는 중… ${Math.round((Date.now() - started) / 1000)}초`;
    }, 1000);
    const ctrl = new AbortController(); // 요청 시간 제한(부스 무한 멈춤 방지)
    const timer = setTimeout(() => ctrl.abort(), 150_000);
    try {
      const res = await fetch(`${API_BASE}/generate`, {
        method: "POST",
        headers: { "x-booth-token": BOOTH_TOKEN },
        body: form,
        signal: ctrl.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "생성 실패");
      applyPosters(await buildPosters(data.images, meta));
      setStatus("완성! 아래에서 마음에 드는 버전을 고르고 인쇄하세요.");
    } catch (e: any) {
      let msg = e.message;
      if (e.name === "AbortError")
        msg = "시간이 너무 오래 걸려 중단했어요. 잠시 후 다시 시도해 주세요.";
      else if (e instanceof TypeError)
        msg =
          "서버 또는 인터넷 연결을 확인해 주세요. (검은 창이 켜져 있나요? 와이파이는 연결됐나요?)";
      setStatus(
        "오류: " +
          msg +
          ' — 계속 안 되면 아래 "AI 없이 계속하기"로 진행할 수 있어요.',
      );
      pendingMetaRef.current = meta;
      setFallbackShown(true);
    } finally {
      clearTimeout(timer);
      clearInterval(tick);
      if (spinTextRef.current)
        spinTextRef.current.textContent = "AI가 그리는 중…";
      isGeneratingRef.current = false;
      setGenerating(false);
      setSpinning(false);
    }
  };

  const onRegen = () => {
    if (posters.length) void onGenerate();
  };

  const onFallback = async () => {
    const meta = pendingMetaRef.current;
    if (!meta || isGeneratingRef.current) return;
    isGeneratingRef.current = true;
    setGenerating(true);
    setFallbackShown(false);
    setStatus("AI 없이 기본 버전을 만드는 중…");
    try {
      applyPosters(await buildPosters([makePlaceholderArt(meta.genre)], meta));
      setStatus("AI 그림 없이 만든 기본 버전이에요(얼굴 그림은 안 들어갑니다). 인쇄는 그대로 가능해요.");
    } catch {
      setStatus("기본 버전을 만들지 못했어요. 다시 시도해 주세요.");
      setFallbackShown(true);
    } finally {
      isGeneratingRef.current = false;
      setGenerating(false);
    }
  };

  const onDownload = () => {
    if (!posters.length) {
      setStatus("먼저 포스터를 만들어 주세요.");
      return;
    }
    const a = document.createElement("a");
    a.download = `InKY_영화포스터_${posters[selected].label}_${Date.now()}.png`;
    a.href = posters[selected].canvas.toDataURL("image/png");
    a.click();
  };

  // 로컬 디자인 작업은 같은 원화 한 장으로 실제 8개 틀을 렌더한다.
  const onDesignPreview = async () => {
    if (!designPreview || isGeneratingRef.current) return;
    stopCamera();
    isGeneratingRef.current = true;
    setGenerating(true);
    setStatus("");
    setFallbackShown(false);
    try {
      const sampleURL = "/src/studio/design-sample.png";
      const meta = getMeta(mode);
      meta.tagline = val("tagline") || GENRES[meta.genre].taglines[0];
      applyPosters(await buildPosters([sampleURL], meta));
    } catch {
      setStatus("샘플 포스터를 불러오지 못했어요. 다시 눌러주세요.");
    } finally {
      isGeneratingRef.current = false;
      setGenerating(false);
    }
  };

  const onPrint = () => {
    if (!posters.length) {
      setStatus("먼저 포스터를 만들어 주세요.");
      return;
    }
    $("printArea")?.remove();
    const area = document.createElement("div");
    area.id = "printArea";
    const img = document.createElement("img");
    img.src = posters[selected].canvas.toDataURL("image/png");
    area.appendChild(img);
    document.body.appendChild(area);
    img.onload = () => {
      window.print();
    };
  };

  const stopCamera = () => {
    cameraEpoch.current += 1;
    cameraOpening.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (!capturedBlobRef.current) setPhase("idle");
  };
  const onNewPerson = () => {
    if (isGeneratingRef.current) return;
    stopCamera();
    capturedBlobRef.current = null;
    if (snapshotURLRef.current) URL.revokeObjectURL(snapshotURLRef.current);
    snapshotURLRef.current = null;
    setSnapshotURL(null);
    setPhase("idle");
    onReset();
  };
  return (
    <StudioView
      mode={mode}
      setMode={setMode}
      phase={phase}
      snapshotURL={snapshotURL}
      countdown={countdown}
      generating={generating}
      spinning={spinning}
      fallbackShown={fallbackShown}
      status={status}
      posters={posters}
      selected={selected}
      select={setSelected}
      spent={genCount >= MAX_GENERATIONS_PER_PHOTO}
      resetKey={resetKey}
      capturing={capturing}
      canvasRef={canvasRef}
      videoRef={videoRef}
      spinTextRef={spinTextRef}
      onStart={onStart}
      designPreview={designPreview}
      onShot={designPreview ? onDesignPreview : onShot}
      onRetake={onRetake}
      onGenerate={designPreview ? onDesignPreview : onGenerate}
      onRegen={onRegen}
      onFallback={onFallback}
      onDownload={onDownload}
      onPrint={onPrint}
      onReset={onReset}
      onNewPerson={onNewPerson}
      stopCamera={stopCamera}
    />
  );
}
