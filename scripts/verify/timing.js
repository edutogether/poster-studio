/* ────────────────────────────────────────────────────────────────────
   ② 시간으로만 체감되는 것 실측.

   computed style 대조로는 절대 안 잡히는 층이다. 스타일이 같아도 "언제
   보이기 시작하는지", "얼마나 걸리는지"는 다를 수 있고, 대표님이 "체감까지
   동일"이라고 못박은 게 바로 이 부분이다.

   ⚠ 반드시 3회 이상 재고 **원본 자체의 실행 간 편차**도 같이 본다.
   편차를 모르면 "18ms 차이"가 회귀인지 노이즈인지 판단할 수 없다
   (splash-standard.md §3: 같은 코드도 실행마다 27~29ms 흔들린다).

   재는 것
     1) 스플래시 — 표시 / 페이드 시작 / 소멸.
        ※ 스플래시는 전환에서 splash-standard.md에 맞춰 **의도적으로 바뀐다**.
          따라서 전/후 비교가 아니라 **표준값(유지1800 / 페이드500 / 소멸2400)**과
          비교하는 항목이다. 전환 전 값은 "무엇이 바뀌었는지" 기록용으로 남긴다.
     2) 캔버스 합성 — 4종 포스터를 다 그리는 데 걸리는 시간.
        전/후가 같아야 하는 항목이다(엔진 로직은 안 바뀌므로).
     3) 웹캠 미리보기 지연 — 권한이 없는 환경에서는 자동으로 건너뛴다.

   사용법(페이지 로드 **직후**에 주입해야 스플래시를 놓치지 않는다):
     await fetch('http://localhost:5501/scripts/verify/timing.js').then(r=>r.text()).then(t=>(0,eval)(t));
     await window.__posterTiming();
   ──────────────────────────────────────────────────────────────────── */
window.__posterTiming = async () => {
  const t = () => Math.round(performance.now());
  const out = { splash: {}, canvas: {}, camera: {} };

  /* 1) 스플래시 — 표준 명세 §6-②와 같은 방식으로 잰다.
        이 저장소의 현재 스플래시 id는 #bootSplash, 표준은 #splash라
        둘 다 찾는다(전환 전/후 같은 스크립트로 재기 위함). */
  const splash = document.getElementById('splash') || document.getElementById('bootSplash');
  if (splash) {
    out.splash.id = splash.id;
    out.splash.seen = t(); // 주입 시점 기준. 첫 페인트는 아래 paint 지표로 본다
    const paint = performance.getEntriesByType('paint').find((e) => e.name === 'first-contentful-paint');
    out.splash.firstContentfulPaint = paint ? Math.round(paint.startTime) : null;

    await new Promise((resolve) => {
      let fadeAt = null;
      const tick = setInterval(() => {
        const cur = document.getElementById(splash.id);
        if (!cur) { out.splash.gone = t(); clearInterval(tick); return resolve(); }
        const cs = getComputedStyle(cur);
        if (fadeAt === null && parseFloat(cs.opacity) < 0.99) { fadeAt = t(); out.splash.fade = fadeAt; }
        // display:none으로 숨기는 구현(현재 boot-splash.js)도 "사라짐"으로 본다
        if (cs.display === 'none') { out.splash.gone = t(); clearInterval(tick); return resolve(); }
        if (t() > 8000) { out.splash.gone = null; clearInterval(tick); return resolve(); }
      }, 8);
    });
  } else {
    out.splash.note = '스플래시 요소 없음(이미 제거된 뒤 주입된 것으로 보임)';
  }

  /* 2) 캔버스 합성 — 진짜 프로덕션 경로(api.ts의 buildAll)를 그대로 태워 잰다.
        buildAll은 모듈 내부 함수라 import하지 않고 버튼으로 도달한다.
        scenario-filled.js와 **같은 구동 방식**을 쓴다: 앱 내부 상태를 직접
        건드리지 않고 브라우저 API 두 개(getUserMedia, fetch)만 갈아끼운 뒤
        진짜 버튼을 누른다.

        예전엔 `import('/state.js')`로 state.capturedBlob을 직접 주입했는데,
        빌드하면 모듈이 번들로 합쳐져 그 URL이 사라진다 — 그런데 이 블록은
        try/catch에 감싸여 있어서 **터지지 않고 out.canvas.error에 조용히
        담긴 채 타이밍 값만 비어버린다.** 검증 도구가 조용히 아무것도 재지
        않는 게 가장 나쁜 실패 방식이라 구동 방식을 바꿨다.
        측정 구간(t0 → 갤러리 4장)은 그대로라 기존 기준선과 그대로 비교된다. */
  try {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const mk = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), c); return c; };

    // 가짜 카메라(정지 화면 — 움직이면 촬영 결과가 매번 달라져 대조가 깨진다)
    const camCanvas = mk(1280, 960, (x) => {
      x.fillStyle = '#3b4a63'; x.fillRect(0, 0, 1280, 960);
      x.fillStyle = '#e9b949'; x.beginPath(); x.arc(640, 400, 150, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#1b2233'; x.fillRect(0, 700, 1280, 260);
    });
    const fakeStream = camCanvas.captureStream(30);
    const realGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async () => fakeStream;

    const realFetch = window.fetch;
    window.fetch = async (u, o) => {
      if (String(u).includes('/generate')) {
        const art = mk(1024, 1536, (x, c) => {
          const g = x.createLinearGradient(0, 0, 0, c.height);
          g.addColorStop(0, '#e9b949'); g.addColorStop(1, '#0b1020');
          x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
        });
        return new Response(JSON.stringify({ images: [art.toDataURL('image/png')], meta: { seconds: 1 } }),
          { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return realFetch(u, o);
    };

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('studentName', '김인키');
    set('movieTitle', '우주를 달리는 인키');

    // 촬영까지는 진짜 버튼으로 간다(측정 구간 밖 — 3·2·1 카운트다운 약 2.65초 포함).
    document.getElementById('startBtn').click();
    const video = document.querySelector('#video');
    for (let i = 0; i < 60 && !(video && video.videoWidth); i++) await wait(100);
    document.getElementById('shotBtn').click();
    const snapshot = document.getElementById('snapshot');
    for (let i = 0; i < 80; i++) {
      if (snapshot && !snapshot.classList.contains('hidden') && snapshot.src) break;
      await wait(100);
    }

    const gallery = document.getElementById('gallery');
    const t0 = performance.now();
    document.getElementById('generateBtn').click();
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if (gallery && gallery.children.length >= 4) break;
      await new Promise((r) => setTimeout(r, 8));
    }
    out.canvas.composeMs = Math.round(performance.now() - t0);
    // 포스터 수는 앱 내부(state.posters)가 아니라 화면에서 센다 — 번들 후에도 동일하게 읽힌다.
    out.canvas.posters = gallery ? gallery.children.length : 0;
    window.fetch = realFetch;
    navigator.mediaDevices.getUserMedia = realGUM;
  } catch (e) {
    out.canvas.error = String(e && e.message || e);
  }

  /* 3) 웹캠 — 권한/장치가 없는 환경(CI·샌드박스)에서는 건너뛴다. */
  try {
    const t0 = performance.now();
    const s = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 960 }, audio: false });
    out.camera.openMs = Math.round(performance.now() - t0);
    s.getTracks().forEach((x) => x.stop());
  } catch (e) {
    out.camera.skipped = String(e && e.name || e);
  }

  return out;
};
