/* ────────────────────────────────────────────────────────────────────
   포스터 픽셀 지문 — "아이가 인쇄해 가는 결과물이 1픽셀도 안 바뀌었다"를
   증명하기 위한 도구. 폰트 서브셋 작업(2026-09-09) 때문에 만들었다.

   ⚠ 왜 그냥 두 번 만들어 비교하면 안 되는가
   layout.js의 grain()이 Math.random()으로 필름 그레인을 그린다. 그래서 **같은
   코드로 같은 입력을 넣어도 매번 픽셀이 다르다**(전환 검증에서 실측: 0.03~1.2%).
   비교하려면 먼저 그 난수를 고정해야 한다. 여기서는 Math.random을 씨앗 있는
   생성기로 갈아끼운다 — 결정적이 되므로 **완전 일치**를 요구할 수 있다.

   같은 이유로 grain 타일은 모듈 안에 한 번만 만들어 캐시되므로, 페이지를 새로
   로드한 상태에서 돌려야 한다(캐시된 타일이 남아 있으면 씨앗을 바꿔도 그림이
   안 바뀐다).

   사용법(페이지 로드 직후):
     await fetch('http://localhost:5501/scripts/verify/poster-pixels.js')
       .then(r=>r.text()).then(t=>(0,eval)(t));
     await window.__posterPixels();
   ──────────────────────────────────────────────────────────────────── */
window.__posterPixels = async () => {
  /* 프로덕션 코드에 테스트용 훅을 넣지 않는다 — master는 번들 없이 ES모듈을
     그대로 서빙하므로 여기서 직접 import하면 된다. (전환 브랜치는 번들이라
     이 경로가 없다 — 그쪽에서 쓸 때는 scenario-filled처럼 실제 UI를 태워야 한다.) */
  const api = await import('/api.js');
  const state = (await import('/state.js')).state;
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

  const mk = (w, h, draw) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), c); return c;
  };

  /* 고정된 AI 그림 — 매번 같아야 포스터도 같다. */
  const art = mk(1024, 1536, (x, c) => {
    const g = x.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, '#e9b949'); g.addColorStop(1, '#0b1020');
    x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = 'rgba(255,255,255,.18)';
    for (let i = 0; i < 24; i++) x.fillRect((i * 97) % 1000, (i * 173) % 1400, 40, 40);
  }).toDataURL('image/png');

  /* 실제로 쓰일 만한 입력을 폭넓게 — 한글 이름, 영문 제목, 아주 긴 제목,
     단체명+출연진, 장르별 폰트(Black Han Sans / Noto Serif KR) 양쪽. */
  const CASES = [
    { 이름: '개인·한글·애니', mode: 'solo',  genre: 'animation', name: '김인키',     title: '우주를 달리는 인키' },
    { 이름: '개인·영문제목·SF', mode: 'solo', genre: 'sf',        name: '박하늘',     title: 'GALAXY RUNNER' },
    { 이름: '개인·긴제목·판타지', mode: 'solo', genre: 'fantasy', name: '이영화',     title: '아주아주 긴 제목을 넣으면 두 줄로 갈라지는지 보는 시험' },
    { 이름: '단체·출연진·미스터리', mode: 'group', genre: 'mystery', groupName: '햇살초 5학년 2반 영화동아리', members: '김인키, 이영화, 박감독', title: '사라진 급식의 비밀' },
    { 이름: '개인·음악', mode: 'solo', genre: 'music', name: '최소리', title: '오늘 밤의 무대' }
  ];

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
  const out = [];

  for (const c of CASES) {
    // 매 케이스마다 같은 씨앗에서 시작해야 케이스 간 순서에 안 흔들린다.
    Math.random = seeded(20260909);

    document.querySelectorAll('#modeSeg .seg-btn').forEach((b) => {
      if (b.dataset.mode === c.mode) b.click();
    });
    set('studentName', c.name); set('groupName', c.groupName);
    set('members', c.members); set('movieTitle', c.title);
    const g = document.getElementById('genre'); if (g) g.value = c.genre;

    const meta = api.getMeta();
    await api.buildAll([art], meta);

    const posters = state.posters;
    for (const p of posters) {
      out.push({ 케이스: c.이름, 판: p.label, 지문: await sha256(p.canvas.toDataURL('image/png')) });
    }
  }
  return out;
};
