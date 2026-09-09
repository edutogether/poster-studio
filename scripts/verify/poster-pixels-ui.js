/* ────────────────────────────────────────────────────────────────────
   포스터 픽셀 지문 — **번들에서도 되는 판**. 전환 브랜치 검증용으로 만들었다.

   ⚠ master의 `poster-pixels.js`를 그대로 쓸 수 없는 이유
   그쪽은 `import('/api.js')`, `import('/state.js')`로 앱 모듈을 직접 부른다.
   빌드하면 모듈이 번들로 합쳐져 그 URL이 사라진다 — 전환본에서는 아예 안 돈다.
   그렇다고 프로덕션 코드에 테스트용 훅을 뚫을 수는 없다(§1). 그래서
   `scenario-filled.js`와 같은 방식으로 **브라우저 API 두 개만 갈아끼우고
   나머지는 전부 진짜 버튼 클릭**으로 간다.

   🔴 예전 숫자(`snapshots/poster-pixels-*.json`)와 직접 비교하면 안 된다.
   그쪽은 모듈을 직접 부르는 경로라 `Math.random` 호출 순서가 여기와 다르고,
   홍보 문구를 고르는 `pick()`이 그 난수를 쓴다 — 경로가 다르면 같은 씨앗이라도
   다른 문구가 뽑혀 **전환과 무관한 가짜 차이**가 난다.
   **이 도구로 뜬 것끼리만 비교한다**(master 라이브 1회, 전환본 1회).

   ⚠ 왜 난수를 고정해야 하는가
   layout의 grain()이 Math.random()으로 필름 그레인을 그린다. 같은 코드로 같은
   입력을 넣어도 매번 픽셀이 다르다(실측 0.03~1.2%). 고정해야 **완전 일치**를
   요구할 수 있다. grain 타일은 모듈에 한 번 캐시되므로 **페이지를 새로 로드한
   상태에서** 돌려야 한다.

   사용법(앱 페이지 안에서):
     await fetch('http://localhost:5501/scripts/verify/poster-pixels-ui.js')
       .then(r => r.text()).then(t => (0, eval)(t));
     await window.__posterPixelsUI();
   ──────────────────────────────────────────────────────────────────── */
window.__posterPixelsUI = async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (id) => document.getElementById(id);

  const mkCanvas = (w, h, draw) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), c);
    return c;
  };

  /* 씨앗 있는 난수(mulberry32) — 매 실행 같은 수열이 나온다. */
  const seeded = (seed) => () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const sha256 = async (str) => {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
  };

  /* 가짜 카메라 — 정지 화면이라 촬영 결과가 매 실행 같다. */
  const camCanvas = mkCanvas(1280, 960, (x) => {
    x.fillStyle = '#3b4a63'; x.fillRect(0, 0, 1280, 960);
    x.fillStyle = '#e9b949'; x.beginPath(); x.arc(640, 400, 150, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#1b2233'; x.fillRect(0, 700, 1280, 260);
  });
  const fakeStream = camCanvas.captureStream(30);
  const realGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async () => fakeStream;

  /* 고정된 AI 그림 — 매번 같아야 포스터도 같다. */
  const art = mkCanvas(1024, 1536, (x, c) => {
    const g = x.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, '#e9b949'); g.addColorStop(1, '#0b1020');
    x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = 'rgba(255,255,255,.18)';
    for (let i = 0; i < 24; i++) x.fillRect((i * 97) % 1000, (i * 173) % 1400, 40, 40);
  }).toDataURL('image/png');

  const realFetch = window.fetch;
  window.fetch = async (u, o) => {
    if (String(u).includes('/generate')) {
      return new Response(
        JSON.stringify({ images: [art], meta: { genre: 'animation', mode: 'solo', seconds: 1 } }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    return realFetch(u, o);
  };

  /* 실제로 쓰일 만한 입력을 폭넓게 — 한글 이름, 영문 제목, 아주 긴 제목,
     단체명+출연진(출연진 줄은 굵기 600으로 그려진다), 장르별 폰트 양쪽. */
  const CASES = [
    { 이름: '개인·한글·애니', mode: 'solo', genre: 'animation', studentName: '김인키', movieTitle: '우주를 달리는 인키' },
    { 이름: '개인·영문제목·SF', mode: 'solo', genre: 'sf', studentName: '박하늘', movieTitle: 'GALAXY RUNNER' },
    { 이름: '개인·긴제목·판타지', mode: 'solo', genre: 'fantasy', studentName: '이영화', movieTitle: '아주아주 긴 제목을 넣으면 두 줄로 갈라지는지 보는 시험' },
    { 이름: '단체·출연진·미스터리', mode: 'group', genre: 'mystery', groupName: '햇살초 5학년 2반 영화동아리', members: '김인키, 이영화, 박감독', movieTitle: '사라진 급식의 비밀' },
    { 이름: '개인·음악', mode: 'solo', genre: 'music', studentName: '최소리', movieTitle: '오늘 밤의 무대' }
  ];

  /* 🔴 클릭한 뒤 **화면이 실제로 그 모드가 될 때까지 기다린다.**
     전환본은 모드가 React 상태라 클릭 직후에는 아직 반영 전이다 — 안 기다리고
     바로 만들기를 누르면 단체 케이스가 개인으로 그려진다(실제로 겪었다:
     단체 케이스 4장만 master와 달라서 굵기 600 문제인 줄 알았다).
     master는 클릭 핸들러가 동기라 기다려도 손해가 없다. */
  const clickMode = async (mode) => {
    const seg = $('modeSeg');
    if (!seg) return;
    for (const b of seg.querySelectorAll('.seg-btn')) if (b.dataset.mode === mode) b.click();
    const shown = mode === 'group' ? 'groupFields' : 'soloFields';
    for (let i = 0; i < 50; i++) {
      if ($(shown) && !$(shown).classList.contains('hidden')) return;
      await wait(20);
    }
    throw new Error(`모드 전환이 화면에 반영되지 않았습니다(${mode}) — 이대로 재면 잘못된 포스터를 비교하게 됩니다.`);
  };
  const set = (id, v) => { const el = $(id); if (el) el.value = v ?? ''; };

  /* 촬영은 한 번만 한다 — 가짜 카메라가 정지 화면이라 매번 같은 사진이고,
     `초기화`가 재생성 한도를 풀어주므로 케이스마다 다시 찍을 필요가 없다.
     (이 성질 자체가 초기화 버튼이 제대로 도는지에 대한 검사이기도 하다.) */
  $('startBtn').click();
  const video = document.querySelector('#video');
  for (let i = 0; i < 60 && !(video && video.videoWidth); i++) await wait(100);
  $('shotBtn').click();
  const snapshot = $('snapshot');
  for (let i = 0; i < 80; i++) {
    if (snapshot && !snapshot.classList.contains('hidden') && snapshot.src) break;
    await wait(100);
  }

  const out = [];
  for (const c of CASES) {
    $('resetBtn').click();                 // 입력만 지우고 사진은 남긴다
    await wait(120);
    await clickMode(c.mode);
    set('studentName', c.studentName); set('groupName', c.groupName);
    set('members', c.members); set('movieTitle', c.movieTitle);
    const g = $('genre'); if (g) g.value = c.genre;

    // 케이스마다 같은 씨앗에서 시작해야 케이스 간 순서에 안 흔들린다.
    Math.random = seeded(20260909);

    $('generateBtn').click();
    const gallery = $('gallery');
    for (let i = 0; i < 200; i++) {
      if (gallery && gallery.querySelectorAll('.thumb img').length >= 4) break;
      await wait(100);
    }
    await wait(300);

    const thumbs = [...gallery.querySelectorAll('.thumb img')];
    const labels = [...gallery.querySelectorAll('.label')].map((e) => e.textContent);
    if (thumbs.length !== 4) throw new Error(`${c.이름}: 포스터가 4장이 아니라 ${thumbs.length}장입니다 — 지문을 뜰 수 없습니다.`);
    for (let i = 0; i < thumbs.length; i++) {
      out.push({ 케이스: c.이름, 판: labels[i], 지문: await sha256(thumbs[i].src) });
    }
  }

  window.fetch = realFetch;
  navigator.mediaDevices.getUserMedia = realGUM;
  return out;
};
