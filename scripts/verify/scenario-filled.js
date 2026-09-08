/* ────────────────────────────────────────────────────────────────────
   "갤러리 4장이 채워진 상태"를 결정적으로 만드는 시나리오.

   전환 전/후가 **완전히 같은 조작**을 해야 대조가 성립하므로 파일로 고정한다
   (그때그때 손으로 치면 입력값이 달라져 비교가 무의미해진다).

   왜 이 상태가 중요한가: 오른쪽 패널의 실제 높이가 빈 상태(약 423px)와
   4장 채운 상태(약 780px+)에서 350px 이상 차이 난다. 6·7라운드에서 좌우 높이
   "핑퐁"이 계속 뒤집힌 게 정확히 이 두 상태를 같이 안 봐서였다.
   빈 상태만 대조하면 그때와 같은 실수를 반복하게 된다.

   실제 카메라와 실제 OpenAI 호출은 쓰지 않는다 —
   카메라는 사람이 있어야 하고 AI 호출은 건당 실비용($0.04)이 나가며,
   무엇보다 매번 다른 그림이 나와 대조가 불가능하다. 대신
     - state.capturedBlob에 결정적으로 만든 사진을 직접 넣고
     - /generate 응답만 가로채 **고정된 그라디언트 그림**을 돌려준다.
   그 뒤의 캔버스 합성·갤러리 렌더는 전부 진짜 프로덕션 코드가 수행한다.

   사용법(페이지 안에서):
     await fetch('http://localhost:5501/scripts/verify/scenario-filled.js')
       .then(r => r.text()).then(t => (0, eval)(t));
     await window.__posterScenarioFilled();
   ──────────────────────────────────────────────────────────────────── */
window.__posterScenarioFilled = async () => {
  // ES모듈 그래프가 이미 로드돼 있으므로, 같은 경로를 다시 import하면
  // 브라우저 모듈 캐시가 **같은 살아있는 인스턴스**를 돌려준다.
  const { state } = await import('/state.js');

  const solid = (w, h, draw) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), c);
    return c;
  };

  // 1) 촬영 결과 대신 넣을 결정적 사진 (내용이 매번 같아야 한다)
  const photo = solid(640, 480, (x) => {
    x.fillStyle = '#3b4a63'; x.fillRect(0, 0, 640, 480);
    x.fillStyle = '#e9b949'; x.beginPath(); x.arc(320, 200, 90, 0, Math.PI * 2); x.fill();
  });
  state.capturedBlob = await new Promise((r) => photo.toBlob(r, 'image/jpeg', 0.85));
  state.genCount = 0;

  // 2) /generate 응답만 가로챈다. 그 외 요청(폰트 등)은 원래대로 통과시킨다.
  const realFetch = window.fetch;
  window.fetch = async (u, o) => {
    if (String(u).includes('/generate')) {
      const art = solid(1024, 1536, (x, c) => {
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

  // 3) 입력값도 고정한다 — 글자 수가 다르면 타이포 레이아웃이 달라진다.
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  set('studentName', '김인키');
  set('movieTitle', '우주를 달리는 인키');
  const genre = document.getElementById('genre');
  if (genre) genre.value = 'animation';

  // 4) 진짜 클릭 핸들러를 그대로 호출한다(로직을 베껴 재현하지 않는다)
  document.getElementById('generateBtn').click();

  // 5) 갤러리 4장이 실제로 렌더될 때까지 기다린다
  const gallery = document.getElementById('gallery');
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (gallery && gallery.children.length >= 4) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  // 캔버스 드로잉이 끝나고 레이아웃이 안정될 시간을 준다
  // (layout-match.js의 ResizeObserver가 오른쪽 패널 높이를 다시 잡는다)
  await new Promise((r) => setTimeout(r, 600));

  window.fetch = realFetch;
  return {
    갤러리: gallery ? gallery.children.length : 0,
    포스터: state.posters.length,
    상태문구: (document.getElementById('status') || {}).textContent
  };
};
