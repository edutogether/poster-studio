/* ────────────────────────────────────────────────────────────────────
   좌우 컬럼 높이 맞춤 (2026-09-03) — 몇 라운드째 순수 CSS(vh/calc 매직넘버)로
   왼쪽(촬영+정보)과 오른쪽(완성·출력) 높이를 맞추려다 실패했다: 오른쪽은
   갤러리가 비어있을 때(약 420px)와 4장 채워졌을 때(약 780px+) 실제 콘텐츠
   높이가 350px 이상 차이나는데, 왼쪽은 거의 고정이라 어느 한쪽 상태에
   맞추면 반드시 다른 쪽에서 어긋난다(대표가 "왼쪽이 짧다"→"오른쪽이 짧다"를
   번갈아 지적한 이유). CSS 그리드의 기본 stretch로 풀어보려 했으나 캔버스의
   height:100%가 아직 크기가 안 정해진 조상(.right)을 기준으로 계산되며
   순환 참조를 일으켜 오히려 더 커지는 버그가 났다 — 그래서 실제 측정값을
   아는 JS로 왼쪽 높이를 재서 오른쪽에 그대로 꽂아주는 방식으로 바꿨다.
   레이아웃(높이)만 건드리고 기능 로직(api.js 등)은 전혀 안 건드린다 —
   ResizeObserver로 왼쪽 컬럼의 렌더링된 높이 변화를 그냥 관찰만 한다. */
(function () {
  const left = document.querySelector('.left');
  const rightPanel = document.querySelector('.right .panel');
  if (!left || !rightPanel) return;

  const TWO_COL_MIN_WIDTH = 900; // style.css의 @media (max-width:900px) 브레이크포인트와 동일

  function applyHeight() {
    if (window.innerWidth <= TWO_COL_MIN_WIDTH) {
      rightPanel.style.height = ''; // 모바일(1컬럼)에서는 맞출 필요 없음
      return;
    }
    // min-height가 아니라 height를 확정값으로 꽂아야 한다 — min-height만 걸면
    // .panel 자신의 높이가 여전히 'auto'(콘텐츠 기반)라, 그 안의 .stage(flex:1)와
    // #posterCanvas(max-height:100%)가 기준으로 삼을 "확정된 높이"가 없어서
    // 캔버스가 원래 크기(1200×1800 비율)대로 커져버리는 걸 실제로 겪었다.
    // height를 확정값으로 주면 flex:1/percentage 체인이 전부 그 값을 기준으로
    // 정상적으로 계산된다.
    rightPanel.style.height = left.offsetHeight + 'px';
  }

  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => applyHeight());
    ro.observe(left);
  }
  window.addEventListener('resize', applyHeight);
  applyHeight();
})();
