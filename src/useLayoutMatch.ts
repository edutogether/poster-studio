/* ────────────────────────────────────────────────────────────────────
   좌우 컬럼 높이 맞춤 — public/layout-match.js를 React 안으로 옮긴 것이다.

   왜 옮겼나(2026-09-09, 3단계): 그 파일은 </body> 직전의 고전 <script>라
   **파싱 시점에 동기 실행**되면서 `.left`와 `.right .panel`을 찾는다. React가
   마크업을 그리게 되면 그 시점엔 두 요소가 아직 없어서 `if (!left || !rightPanel)
   return;`으로 조용히 아무 일도 안 하고 끝난다 — 높이 맞춤이 사라진 걸
   아무도 모르는 채로. 그래서 마운트 이후에 도는 훅으로 옮겼다.

   원본 주석의 판단 근거는 그대로 유효하다: 순수 CSS(vh/calc)로 몇 라운드를
   실패했고, 오른쪽은 갤러리가 빈 상태와 4장 채워진 상태의 콘텐츠 높이가
   350px 이상 차이 나는데 왼쪽은 거의 고정이라 어느 한쪽에 맞추면 반드시
   다른 쪽이 어긋난다. min-height가 아니라 height를 확정값으로 꽂아야 하는
   이유도 그대로다 — .panel이 auto면 그 안의 .stage(flex:1)와
   #posterCanvas(max-height:100%)가 기준 삼을 확정 높이가 없어 캔버스가
   원본 비율대로 커져버린다(실제로 겪음).

   ⚠ ResizeObserver 폭주(위험 F): 관찰 대상은 **왼쪽**이고 높이를 꽂는 대상은
   **오른쪽**이다. 둘은 그리드의 서로 다른 열이라 오른쪽 높이가 왼쪽 크기를
   되돌려 바꾸지 않는다 — 이 방향성이 깨지면 관찰↔변경이 서로를 부르며 폭주한다.
   그래서 "오른쪽을 관찰하지 않는다"를 테스트로 고정한다.
   ──────────────────────────────────────────────────────────────────── */
import { useLayoutEffect } from 'react';
import type { RefObject } from 'react';

export const TWO_COL_MIN_WIDTH = 900; // style.css의 @media (max-width:900px)와 같은 값

/** 테스트가 재사용할 수 있게 순수 계산부만 떼어 둔다. 반환값이 곧 꽂을 height다. */
export function heightToApply(innerWidth: number, leftHeight: number): string {
  return innerWidth <= TWO_COL_MIN_WIDTH ? '' : leftHeight + 'px';
}

export function useLayoutMatch(
  leftRef: RefObject<HTMLElement | null>,
  rightPanelRef: RefObject<HTMLElement | null>
) {
  useLayoutEffect(() => {
    const left = leftRef.current;
    const rightPanel = rightPanelRef.current;
    if (!left || !rightPanel) return;

    const applyHeight = () => {
      rightPanel.style.height = heightToApply(window.innerWidth, left.offsetHeight);
    };

    let ro: ResizeObserver | undefined;
    if (window.ResizeObserver) {
      ro = new ResizeObserver(() => applyHeight());
      ro.observe(left);
    }
    window.addEventListener('resize', applyHeight);
    applyHeight();

    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', applyHeight);
    };
  }, [leftRef, rightPanelRef]);
}
