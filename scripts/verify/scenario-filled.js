/* ────────────────────────────────────────────────────────────────────
   "갤러리 4장이 채워진 상태"를 결정적으로 만드는 시나리오.

   전환 전/후가 **완전히 같은 조작**을 해야 대조가 성립하므로 파일로 고정한다
   (그때그때 손으로 치면 입력값이 달라져 비교가 무의미해진다).

   왜 이 상태가 중요한가: 오른쪽 패널의 실제 높이가 빈 상태(약 423px)와
   4장 채운 상태(약 780px+)에서 350px 이상 차이 난다. 6·7라운드에서 좌우 높이
   "핑퐁"이 계속 뒤집힌 게 정확히 이 두 상태를 같이 안 봐서였다.

   ── 구동 방식: 실제 UI 경로 ──
   앱 모듈의 내부 상태(state.capturedBlob)를 직접 건드리지 않는다.
   빌드하면 모듈이 번들로 합쳐져 `/state.js` 같은 URL이 사라지고(실제로 겪음),
   무엇보다 그 방식은 프로덕션 코드에 테스트용 훅을 요구하게 된다.
   대신 **브라우저 API 두 개만 갈아끼우고 나머지는 전부 진짜 버튼 클릭으로 간다**:
     - navigator.mediaDevices.getUserMedia → 캔버스 captureStream(가짜 카메라)
     - fetch의 /generate 응답 → 고정된 그라디언트 그림
   촬영·블롭 생성·프롬프트 구성·캔버스 합성·갤러리 렌더는 전부 프로덕션 코드가 한다.
   이 방식은 전환 전(ES모듈 직접 서빙)과 전환 후(번들)에서 똑같이 동작한다.

   사용법(페이지 안에서):
     await fetch('http://localhost:5501/scripts/verify/scenario-filled.js')
       .then(r => r.text()).then(t => (0, eval)(t));
     await window.__posterScenarioFilled();
   ──────────────────────────────────────────────────────────────────── */
window.__posterScenarioFilled = async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (id) => document.getElementById(id);

  const mkCanvas = (w, h, draw) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), c);
    return c;
  };

  /* 1) 가짜 카메라 — 실제 장치 없이도 앱의 촬영 경로를 그대로 태운다.
        내용이 매 실행 같아야 하므로 정지 화면을 그린다(움직이면 촬영 결과가
        매번 달라져 대조가 깨진다). */
  const camCanvas = mkCanvas(1280, 960, (x) => {
    x.fillStyle = '#3b4a63'; x.fillRect(0, 0, 1280, 960);
    x.fillStyle = '#e9b949'; x.beginPath(); x.arc(640, 400, 150, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#1b2233'; x.fillRect(0, 700, 1280, 260);
  });
  const fakeStream = camCanvas.captureStream(30);
  const realGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async () => fakeStream;

  /* 2) /generate 응답만 가로챈다. 폰트 등 나머지 요청은 원래대로 통과시킨다. */
  const realFetch = window.fetch;
  window.fetch = async (u, o) => {
    if (String(u).includes('/generate')) {
      const art = mkCanvas(1024, 1536, (x, c) => {
        const g = x.createLinearGradient(0, 0, 0, c.height);
        g.addColorStop(0, '#e9b949'); g.addColorStop(1, '#0b1020');
        x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
        x.fillStyle = 'rgba(255,255,255,.18)';
        for (let i = 0; i < 24; i++) x.fillRect((i * 97) % 1000, (i * 173) % 1400, 40, 40);
      });
      return new Response(
        JSON.stringify({ images: [art.toDataURL('image/png')], meta: { genre: 'animation', mode: 'solo', seconds: 1 } }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    return realFetch(u, o);
  };

  /* 3) 입력값 고정 — 글자 수가 다르면 타이포 레이아웃이 달라진다. */
  const set = (id, v) => { const el = $(id); if (el) el.value = v; };
  set('studentName', '김인키');
  set('movieTitle', '우주를 달리는 인키');
  const genre = $('genre');
  if (genre) genre.value = 'animation';

  /* 4) 진짜 버튼을 순서대로 누른다. */
  $('startBtn').click();                       // 카메라 켜기
  const video = document.querySelector('#video');
  for (let i = 0; i < 60 && !(video && video.videoWidth); i++) await wait(100);

  $('shotBtn').click();                        // 3·2·1 촬영 (약 2.65초)
  const snapshot = $('snapshot');
  for (let i = 0; i < 80; i++) {
    if (snapshot && !snapshot.classList.contains('hidden') && snapshot.src) break;
    await wait(100);
  }

  $('generateBtn').click();                    // AI 포스터 만들기
  const gallery = $('gallery');
  for (let i = 0; i < 200; i++) {
    if (gallery && gallery.children.length >= 4) break;
    await wait(100);
  }

  // 캔버스 드로잉이 끝나고 레이아웃이 안정될 시간을 준다
  // (useLayoutMatch의 ResizeObserver가 오른쪽 패널 높이를 다시 잡는다)
  await wait(800);

  window.fetch = realFetch;
  navigator.mediaDevices.getUserMedia = realGUM;

  return {
    갤러리: gallery ? gallery.children.length : 0,
    촬영됨: !!(snapshot && snapshot.src),
    상태문구: ($('status') || {}).textContent
  };
};
