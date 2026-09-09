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

/* AI가 완전히 막힌 상황(네트워크 두절·크레딧 소진·서버 장애)에서도 부스가 통째로
   멈추지 않도록, AI 그림 없이 같은 타이포·크레딧 레이아웃으로 인쇄 가능한 버전을
   만드는 최소한의 폴백. api.ts에 있던 것을 3단계에서 여기로 옮겼다 — React 컴포넌트 안에 두면
   폴백 그림 하나 테스트하려고 React까지 끌어와야 해서, 화면과 무관한 캔버스
   함수들이 모인 이 파일이 제자리다. */
export function makePlaceholderArt(genre: string): string {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1536;
  const ctx = c.getContext('2d')!;
  const accent = (GENRES[genre] || GENRES.animation).accent;
  const g = ctx.createLinearGradient(0, 0, 0, c.height);
  g.addColorStop(0, accent);
  g.addColorStop(1, '#0b1020');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = 'rgba(255,255,255,.10)';
  for (let i = 0; i < 50; i++) {
    ctx.beginPath();
    ctx.arc(Math.random() * c.width, Math.random() * c.height, Math.random() * 3 + 1, 0, Math.PI * 2);
    ctx.fill();
  }
  return c.toDataURL('image/png');
}
