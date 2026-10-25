/* ────────────────────────────────────────────────────────────────────
   AI 그림 N장 × 템플릿 8종 → 포스터 캔버스 목록.

   3단계 React 전환(2026-09-09)으로 api.ts의 buildAll에서 **화면과 무관한 부분만**
   떼어냈다. 예전엔 이 함수가 포스터를 만들고 갤러리 DOM까지 직접 그렸는데,
   만드는 일과 그리는 일이 붙어 있으면 React가 그릴 수 없다. 로직·인자는
   그대로다 — 폰트·글리프·로고·그림을 다 받은 뒤 템플릿 8종 렌더.
   2026-10-24: 받는 일 넷을 차례로 기다리던 것을 한꺼번에 받는다 — 느린 와이파이에서 샘플 흐름이
   글꼴(4.6MB) → 로고 → 원화(2.4MB)를 줄 세워 받느라 40초 로딩 뒤 40초를 더 기다렸다(net-perf.mjs).
   그리는 것은 다 받은 다음이라 결과는 같다.
   ──────────────────────────────────────────────────────────────────── */
import { GENRES } from './constants.js';
import { ensureFonts, ensureGlyphs, ensureLogo, loadImg } from './layout.js';
import { TEMPLATES } from './templates.js';
import type { Meta, Poster } from './state.js';

/* 조판에 쓸 글꼴·로고를 받는다. 생성 단추를 누른 순간 불러 AI를 기다리는 동안 받아 두고(PosterStudio),
   조판할 때 다시 불러 다 왔는지 기다린다 — 이미 받은 것은 곧바로 끝난다. 실패해도 던지지 않는다(각 함수가 삼킨다). */
export async function preparePosterAssets(meta: Meta): Promise<void> {
  await Promise.all([ensureFonts(), ensureGlyphs(meta), ensureLogo()]);
}

export async function buildPosters(images: string[], meta: Meta): Promise<Poster[]> {
  const [arts] = await Promise.all([Promise.all(images.map(loadImg)), preparePosterAssets(meta)]);
  const posters: Poster[] = [];
  for (const art of arts) {
    for (const t of TEMPLATES) {
      const cv = document.createElement('canvas');
      cv.width = 1200;
      cv.height = 1800;
      t.render(cv.getContext('2d')!, art, meta, GENRES[meta.genre]);
      posters.push({ label: t.label, canvas: cv });
    }
  }
  return posters;
}
