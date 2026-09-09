/* ────────────────────────────────────────────────────────────────────
   앱 화면 전체. 3단계 React 전환(2026-09-09).

   **결과물은 전환 전과 완전히 같아야 한다.** 그래서 index.html에 있던 마크업을
   요소·클래스·id·속성 하나까지 그대로 옮겼고, 지금 화면에 없는 속성을 새로
   붙이지 않았다(예: button에 type을 달지 않는다 — 원본에 없다).

   입력값은 **비제어(uncontrolled)로 둔다.** 원본이 생성 시점에 val(id)로 DOM에서
   직접 읽는 방식이었고, 제어 컴포넌트로 바꾸면 타이핑마다 렌더가 돌아 입력
   반응 지연이 달라질 수 있다("체감까지 동일"). id를 그대로 유지했으므로
   constants.ts의 val()이 예전과 똑같이 동작한다.
   ──────────────────────────────────────────────────────────────────── */
import { useCallback, useEffect, useRef, useState } from 'react';
import { $, val, pick, GENRES, API_BASE, BOOTH_TOKEN, W, H } from './constants.js';
import { buildPosters, makePlaceholderArt } from './poster.js';
import { useLayoutMatch } from './useLayoutMatch.js';
import type { Meta, Poster } from './state.js';

/* 한 장의 사진으로는 최초 생성 1회 + 재생성 1회, 총 2회까지만 허용한다
   (2026-08-29 대표 결정) — 무제한은 남용/과금 위험, 금지는 "결과가 안 좋게 나온
   아이는 그대로 끝"이 되는 문제가 있어 절충한 값. 다시 촬영하면 초기화된다. */
const MAX_GENERATIONS_PER_PHOTO = 2;

/** 화면 입력값 수집. 원본 api.ts의 getMeta()와 동일 — id가 그대로라 val()이 그대로 쓰인다. */
export function getMeta(mode: string): Meta {
  const genre = val('genre') || 'animation';
  let tagline = val('tagline');
  if (!tagline) tagline = pick(GENRES[genre].taglines);
  return {
    mode,
    name: val('studentName') || '인키',
    groupName: val('groupName') || '우리들',
    members: val('members'),
    title: val('movieTitle') || '나의 영화',
    genre,
    tagline
  };
}

const REGEN_LABEL = '🔄 다른 그림으로';
const REGEN_LABEL_SPENT = '🔄 재생성 횟수 소진(다시 촬영 시 초기화)';

export default function PosterStudio() {
  const [mode, setMode] = useState('solo');
  const [status, setStatus] = useState('카메라를 켜고 사진을 촬영해 주세요.');
  /* 촬영 영역의 3상태. 원본의 classList 조작을 그대로 옮긴 것이다:
       idle — video 보임(빈 화면) · snapshot 숨김 · camHint 보임 (초기)
       live — video 보임(스트림)  · snapshot 숨김 · camHint 숨김 (startCamera)
       shot — video 숨김          · snapshot 보임 · camHint 숨김 (촬영 완료)
     video는 처음부터 보인다 — 원본 마크업에 hidden이 없다. 여기서 초기에
     숨겼다가 대조에서 #video 유실로 바로 잡혔다. */
  const [phase, setPhase] = useState<'idle' | 'live' | 'shot'>('idle');
  const [snapshotURL, setSnapshotURL] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [fallbackShown, setFallbackShown] = useState(false);
  const [posters, setPosters] = useState<Poster[]>([]);
  const [selected, setSelected] = useState(0);
  const [genCount, setGenCount] = useState(0);
  const [generating, setGenerating] = useState(false);

  const leftRef = useRef<HTMLElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spinTextRef = useRef<HTMLParagraphElement>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const capturedBlobRef = useRef<Blob | null>(null);
  const pendingMetaRef = useRef<Meta | null>(null);
  const snapshotURLRef = useRef<string | null>(null);
  const isGeneratingRef = useRef(false);   // 이중 클릭 방지(중복 과금 차단)
  const genCountRef = useRef(0);
  const placeholderDrawnRef = useRef(false);

  useLayoutMatch(leftRef, rightPanelRef);

  /* <video muted>는 React가 속성이 아니라 프로퍼티로만 다뤄서 DOM에 muted 속성이
     남지 않는다. 원본 마크업에는 있고, 브라우저 자동재생 정책이 그 속성을 보므로
     직접 달아준다(§5.5 비가시 값 대조에서도 잡히는 차이다). */
  useEffect(() => {
    videoRef.current?.setAttribute('muted', '');
  }, []);

  /* 촬영 후 카메라를 켜둔 채 두지 않는다 — 최소수집 원칙이고 아동 대상이라 더
     중요하다(6차 감사에서 고친 것). 화면을 떠날 때도 반드시 꺼야 하므로 정리
     함수에서도 끈다(위험 D). */
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  /* 초기 플레이스홀더 포스터. StrictMode가 효과를 두 번 부르더라도 **정확히 한 번만**
     그린다(위험 E) — 그린 뒤 부트 스플래시를 내리는 신호를 보내므로, 두 번 도는 것
     자체가 "첫 의미있는 화면" 시점을 흐린다. */
  useEffect(() => {
    if (placeholderDrawnRef.current) return;
    placeholderDrawnRef.current = true;
    const pctx = canvasRef.current?.getContext('2d');
    if (!pctx) return;
    pctx.fillStyle = '#0d0f14';
    pctx.fillRect(0, 0, W, H);
    pctx.fillStyle = '#e9b949';
    pctx.textAlign = 'center';
    pctx.font = "900 84px 'Black Han Sans', sans-serif";
    pctx.fillText('🎬', W / 2, 760);
    pctx.fillStyle = '#f4f6fb';
    pctx.font = "900 56px 'Black Han Sans', sans-serif";
    pctx.fillText('AI 영화 포스터', W / 2, 880);
    pctx.fillStyle = '#aeb7d0';
    pctx.font = '500 30px sans-serif';
    pctx.fillText('촬영 후 이곳에 4가지 버전이 표시됩니다', W / 2, 950);
    /* 첫 의미있는 화면이 그려졌다 — 스플래시의 시계를 흐르게 한다(로드 게이트 B).
       **여기서 스플래시를 숨기지 않는다.** 숨기는 타이밍은 style.css의 splashOut이
       잡고, 이 신호는 '언제부터 재기 시작할지'만 정한다. 그래서 번들이 늦게 붙어도
       사용자는 항상 1800ms 동안 온전한 브랜드 화면을 보고, 걷힌 뒤에는 덜 그려진
       화면이 아니라 완성된 첫 화면을 본다. */
    document.body.classList.add('app-ready');
  }, []);

  /* 선택된 포스터를 큰 캔버스에 그린다. 원본 select()와 같은 순서(clear → draw). */
  useEffect(() => {
    const pctx = canvasRef.current?.getContext('2d');
    if (!pctx || !posters.length) return;
    pctx.clearRect(0, 0, 1200, 1800);
    pctx.drawImage(posters[selected].canvas, 0, 0);
  }, [posters, selected]);

  /* AI 서버 연결 상태를 미리 확인한다. 촬영·정보입력을 다 마친 뒤에야 실패를 알게
     되는 것보다, 페이지를 여는 순간 문제를 아는 게 낫다. 실패해도 촬영은 막지
     않는다(연결이 잠깐 불안정했을 수도 있으므로 fail-open). */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 6000);
        const r = await fetch(`${API_BASE}/health`, { signal: ctrl.signal });
        clearTimeout(timer);
        if (!r.ok) throw new Error('unhealthy');
        const data = await r.json().catch(() => ({}));
        // 5차 감사 발견: HTTP 상태만 보면 /health가 "키는 있음"만 확인하고 OpenAI가
        // 실제로 죽어있어도 경고가 안 떴다 — 응답 본문의 openaiReachable도 확인한다.
        if (alive && data.openaiReachable === false) {
          setStatus('⚠ AI(OpenAI) 서버에 연결할 수 없습니다. 잠시 후 다시 열어보거나 담당자에게 알려주세요. (촬영은 가능하지만 포스터 생성이 실패할 수 있어요)');
        }
      } catch {
        if (alive) setStatus('⚠ AI 서버 연결을 확인할 수 없습니다. 와이파이를 확인해 주세요. (촬영은 가능하지만 포스터 생성이 실패할 수 있어요)');
      }
    })();
    return () => { alive = false; };
  }, []);

  /* 인쇄가 끝나면 인쇄용 노드를 걷어낸다. 원본의 window afterprint 리스너와 동일. */
  useEffect(() => {
    const onAfterPrint = () => { $('printArea')?.remove(); };
    window.addEventListener('afterprint', onAfterPrint);
    return () => window.removeEventListener('afterprint', onAfterPrint);
  }, []);

  const startCamera = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 960, facingMode: 'user' },
      audio: false
    });
    streamRef.current = stream;
    if (videoRef.current) videoRef.current.srcObject = stream;
    setPhase('live');
    setStatus('카메라 준비 완료. ‘3·2·1 촬영’을 누르세요.');
  }, []);

  const onStart = async () => {
    try { await startCamera(); }
    catch { setStatus('카메라를 열 수 없습니다. 브라우저 카메라 권한을 허용해 주세요.'); }
  };

  const onShot = async () => {
    if (!streamRef.current) {
      try { await startCamera(); }
      catch { setStatus('카메라 권한을 허용해 주세요.'); return; }
    }
    for (let i = 3; i > 0; i--) {
      setCountdown(String(i));
      await new Promise((r) => setTimeout(r, 800));
    }
    setCountdown('📸');
    await new Promise((r) => setTimeout(r, 250));
    setCountdown(null);

    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setStatus('카메라가 아직 준비 중이에요. 1~2초 후 다시 촬영해 주세요.');
      return;
    }
    const MAXW = 1024; // 전송용 축소(AI가 스타일을 새로 그리므로 화질 손해 없음)
    const scale = Math.min(1, MAXW / video.videoWidth);
    const cap = document.createElement('canvas');
    cap.width = Math.round(video.videoWidth * scale);
    cap.height = Math.round(video.videoHeight * scale);
    const c = cap.getContext('2d')!;
    c.translate(cap.width, 0);
    c.scale(-1, 1);           // 거울 모드(셀카 느낌)
    c.drawImage(video, 0, 0, cap.width, cap.height);
    cap.toBlob((blob) => {
      if (!blob) { setStatus('촬영에 실패했어요. 다시 시도해 주세요.'); return; }
      capturedBlobRef.current = blob;
      if (snapshotURLRef.current) URL.revokeObjectURL(snapshotURLRef.current); // 장시간 운영 대비
      const url = URL.createObjectURL(blob);
      snapshotURLRef.current = url;
      setSnapshotURL(url);
      setPhase('shot');
      // 촬영이 끝나면 스트림을 실제로 끈다(6차 감사).
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setStatus('촬영 완료! 정보를 입력하고 ‘AI 포스터 만들기’를 누르세요.');
      genCountRef.current = 0;
      setGenCount(0);
    }, 'image/jpeg', 0.85);
  };

  const onRetake = async () => {
    capturedBlobRef.current = null;
    setFallbackShown(false);
    pendingMetaRef.current = null;
    genCountRef.current = 0;
    setGenCount(0);
    try { await startCamera(); }
    catch { setStatus('카메라 권한을 허용해 주세요.'); }
  };

  const applyPosters = (built: Poster[]) => { setPosters(built); setSelected(0); };

  const onGenerate = async () => {
    if (isGeneratingRef.current) return;
    if (!capturedBlobRef.current) { setStatus('먼저 사진을 촬영해 주세요.'); return; }
    if (genCountRef.current >= MAX_GENERATIONS_PER_PHOTO) {
      setStatus('이 사진으로는 재생성 횟수를 모두 사용했어요. 다시 촬영하면 새로 만들 수 있어요.');
      return;
    }
    const meta = getMeta(mode);
    isGeneratingRef.current = true;
    genCountRef.current += 1;
    setGenCount(genCountRef.current);
    setGenerating(true);
    setFallbackShown(false);
    setSpinning(true);
    setStatus('AI가 영화 포스터 그림을 그리는 중입니다… (10~25초)');

    const form = new FormData();
    form.append('photo', capturedBlobRef.current, 'capture.jpg');
    form.append('movieTitle', meta.title);
    form.append('tagline', meta.tagline);
    form.append('genre', meta.genre);
    form.append('mode', meta.mode);

    const started = Date.now();
    const tick = setInterval(() => {                    // 경과 시간 표시(체감 대기 개선)
      const el = spinTextRef.current;
      if (el) el.textContent = `AI가 그리는 중… ${Math.round((Date.now() - started) / 1000)}초`;
    }, 1000);
    const ctrl = new AbortController();                 // 요청 시간 제한(부스 무한 멈춤 방지)
    const timer = setTimeout(() => ctrl.abort(), 150_000);
    try {
      const res = await fetch(`${API_BASE}/generate`, {
        method: 'POST',
        headers: { 'x-booth-token': BOOTH_TOKEN },
        body: form,
        signal: ctrl.signal
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '생성 실패');
      applyPosters(await buildPosters(data.images, meta));
      setStatus('완성! 아래에서 마음에 드는 버전을 고르고 인쇄하세요.');
    } catch (e: any) {
      let msg = e.message;
      if (e.name === 'AbortError') msg = '시간이 너무 오래 걸려 중단했어요. 잠시 후 다시 시도해 주세요.';
      else if (e instanceof TypeError) msg = '서버 또는 인터넷 연결을 확인해 주세요. (검은 창이 켜져 있나요? 와이파이는 연결됐나요?)';
      setStatus('오류: ' + msg + ' — 계속 안 되면 아래 "AI 없이 계속하기"로 진행할 수 있어요.');
      pendingMetaRef.current = meta;
      setFallbackShown(true);
    } finally {
      clearTimeout(timer);
      clearInterval(tick);
      if (spinTextRef.current) spinTextRef.current.textContent = 'AI가 그리는 중…';
      isGeneratingRef.current = false;
      setGenerating(false);
      setSpinning(false);
    }
  };

  const onRegen = () => { if (posters.length) void onGenerate(); };

  const onFallback = async () => {
    const meta = pendingMetaRef.current;
    if (!meta || isGeneratingRef.current) return;
    setFallbackShown(false);
    setStatus('AI 없이 기본 버전을 만드는 중…');
    applyPosters(await buildPosters([makePlaceholderArt(meta.genre)], meta));
    setStatus('AI 그림 없이 만든 기본 버전이에요(얼굴 그림은 안 들어갑니다). 인쇄는 그대로 가능해요.');
  };

  const onDownload = () => {
    if (!posters.length) { setStatus('먼저 포스터를 만들어 주세요.'); return; }
    const a = document.createElement('a');
    a.download = `InKY_영화포스터_${posters[selected].label}_${Date.now()}.png`;
    a.href = posters[selected].canvas.toDataURL('image/png');
    a.click();
  };

  const onPrint = () => {
    if (!posters.length) { setStatus('먼저 포스터를 만들어 주세요.'); return; }
    $('printArea')?.remove();
    const area = document.createElement('div');
    area.id = 'printArea';
    const img = document.createElement('img');
    img.src = posters[selected].canvas.toDataURL('image/png');
    area.appendChild(img);
    document.body.appendChild(area);
    img.onload = () => { window.print(); };
  };

  const spent = genCount >= MAX_GENERATIONS_PER_PHOTO;
  const cls = (base: string, hidden: boolean) => (hidden ? base + ' hidden' : base);

  return (
    <>
      <section className="left" ref={leftRef}>
        <div className="panel">
          <div className="panel-head"><span className="num">1</span><h2>촬영</h2></div>
          <div className="cameraBox">
            <video id="video" ref={videoRef} autoPlay playsInline muted className={phase === 'shot' ? 'hidden' : undefined}></video>
            <img id="snapshot" className={phase === 'shot' ? undefined : 'hidden'} alt="촬영 사진" src={snapshotURL ?? undefined} />
            <div id="countdown" className={cls('countdown', countdown === null)}>{countdown}</div>
            <div id="camHint" className={cls('camHint', phase !== 'idle')}>‘카메라 켜기’를 누르세요</div>
          </div>
          <div className="buttons">
            <button id="startBtn" className="btn" onClick={onStart}>📷 카메라 켜기</button>
            <button id="shotBtn" className="btn primary" onClick={onShot}>3·2·1 촬영</button>
            <button id="retakeBtn" className="btn ghost" onClick={onRetake}>다시 촬영</button>
          </div>
        </div>

        <div className="panel">
          {/* 개인/단체 선택은 2026-09-09 대표 지시로 제목 줄 오른쪽 끝의 작은
              좌우 스위치가 됐다. 예전엔 제목 아래에서 가로 한 줄을 통째로 썼고,
              그 한 줄이 없어지면서 약 44px이 여백으로 돌아갔다.
              id·클래스·data-mode를 그대로 두는 이유는 대조 스냅샷과 라이브(master)
              쪽 구조를 같게 유지하기 위해서다. */}
          <div className="panel-head"><span className="num">2</span><h2>포스터 정보</h2>
            <div className="seg" id="modeSeg">
              <button className={mode === 'solo' ? 'seg-btn active' : 'seg-btn'} data-mode="solo" onClick={() => setMode('solo')}>👤 개인</button>
              <button className={mode === 'group' ? 'seg-btn active' : 'seg-btn'} data-mode="group" onClick={() => setMode('group')}>👥 단체</button>
            </div>
          </div>

          <div id="soloFields" className={mode !== 'solo' ? 'hidden' : undefined}>
            <label>이름 <input id="studentName" placeholder="예: 김인키" maxLength={20} /></label>
          </div>

          <div id="groupFields" className={cls('', mode !== 'group').trim() || undefined}>
            <label>단체명 <input id="groupName" placeholder="예: 햇살초 5학년 2반 영화동아리" maxLength={40} /></label>
            <label>출연진 <span className="hint">(선택 · 쉼표로 구분)</span>
              <input id="members" placeholder="예: 김인키, 이영화, 박감독" maxLength={120} />
            </label>
          </div>

          <label>영화 제목 <input id="movieTitle" placeholder="예: 우주를 달리는 인키" maxLength={40} /></label>

          {/* 홍보 문구 입력란은 삭제(2026-09-03 대표 지시) — 항상 장르별 자동 추천 문구를 쓴다.
              getMeta()가 val('tagline')로 읽던 걸 그대로 두되, #tagline 요소가 없으면 val()이
              빈 문자열을 반환해 자동으로 GENRES[genre].taglines 중 하나를 고른다. */}
          <div className="genreRow">
            <label className="genreField">장르
              <select id="genre" defaultValue="animation">
                <option value="animation">🎨 애니메이션</option>
                <option value="fantasy">🐉 판타지</option>
                <option value="sf">🚀 SF·우주탐험</option>
                <option value="hero">🦸 슈퍼히어로</option>
                <option value="mystery">🔍 미스터리</option>
                <option value="director">🎥 영화감독</option>
                <option value="sports">🏃 스포츠·성장</option>
                <option value="music">🎵 음악</option>
              </select>
            </label>
            <button id="generateBtn" className="btn primary big genreRowBtn" disabled={generating} onClick={onGenerate}>✨ AI 포스터 만들기</button>
          </div>
          <button id="fallbackBtn" className={cls('btn ghost', !fallbackShown)} onClick={onFallback}>🎨 AI 없이 기본 버전으로 계속하기</button>
          <p id="status" className="status">{status}</p>
        </div>
      </section>

      <section className="right">
        <div className="panel result" ref={rightPanelRef}>
          <div className="panel-head"><span className="num">3</span><h2>완성 · 버전 선택 · 출력</h2></div>

          <div className="stage">
            <canvas id="posterCanvas" ref={canvasRef} width={1200} height={1800}></canvas>
            <div id="spinner" className={cls('spinner', !spinning)}><div className="ring"></div><p ref={spinTextRef}>AI가 그리는 중…</p></div>
          </div>

          <div id="gallery" className="gallery">
            {posters.map((p, i) => (
              <div key={p.label + i}>
                <div className={i === selected ? 'thumb active' : 'thumb'} onClick={() => setSelected(i)}>
                  <img src={p.canvas.toDataURL('image/png')} />
                </div>
                <div className="label">{p.label}</div>
              </div>
            ))}
          </div>

          <div className="buttons out">
            <button id="printBtn" className="btn primary big" onClick={onPrint}>🖨️ 인쇄하기</button>
            <button id="downloadBtn" className="btn ghost" onClick={onDownload}>PNG 저장</button>
            <button id="regenBtn" className="btn ghost" disabled={generating || spent} onClick={onRegen}>
              {spent ? REGEN_LABEL_SPENT : REGEN_LABEL}
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
