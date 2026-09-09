/* ────────────────────────────────────────────────────────────────────
   AI 그림 N장 × 템플릿 4종 → 포스터 캔버스 목록.

   3단계 React 전환(2026-09-09)으로 api.ts의 buildAll에서 **화면과 무관한 부분만**
   떼어냈다. 예전엔 이 함수가 포스터를 만들고 갤러리 DOM까지 직접 그렸는데,
   만드는 일과 그리는 일이 붙어 있으면 React가 그릴 수 없다. 로직·순서·인자는
   그대로다 — 폰트 준비 → 글리프 준비 → 로고 준비 → 그림 로드 → 템플릿 4종 렌더.
   ──────────────────────────────────────────────────────────────────── */
import { GENRES } from './constants.js';
import { ensureFonts, ensureGlyphs, ensureLogo, loadImg } from './layout.js';
import { TEMPLATES } from './templates.js';
import type { Meta, Poster } from './state.js';

export async function buildPosters(images: string[], meta: Meta): Promise<Poster[]> {
  await ensureFonts();
  await ensureGlyphs(meta);
  await ensureLogo();
  const arts = await Promise.all(images.map(loadImg));
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
