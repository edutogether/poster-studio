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

/* 조판 준비(글꼴 · 로고 · 그림 받기)의 시한(2026-11-03 Bumm님 휴대폰 «포스터 고르는 화면으로 안 넘어가고 무한 로딩»).
   글꼴 받기(document.fonts.load · fonts.ready)에는 끝나는 시한이 없어, 휴대폰 망에서 요청 하나가 멈추면 로딩 화면이 끝나지 않을 수 있었다.
   시한을 넘기면 실패로 끝낸다 — 대체 글꼴로 그린 포스터를 내보내지 않고, 진짜 생성은 «다시 만들기»(사진 · 횟수 그대로), 샘플은 다시 누르게 한다.
   30초: 느린 와이파이(1.6Mbps) 첫 방문에서 조판 글꼴 · 로고(약 1.3MB)를 받는 데 걸리는 시간(약 7초)의 네 배다. */
export const ASSET_LIMIT_MS = 30_000;

function withinLimit<T>(job: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${what} — ${ms / 1000}초 안에 끝나지 않음`)), ms);
    job.then((value) => { window.clearTimeout(timer); resolve(value); }, (error) => { window.clearTimeout(timer); reject(error); });
  });
}

/* 화면용 그림은 비동기 PNG(toBlob)의 개체 주소로 만든다(2026-11-03). 예전 toDataURL은 8장을 한꺼번에 동기로 바꿔(WebKit 실측 2.5초)
   그동안 화면이 멈추고, 29MB짜리 글자열이 메모리에 남았다. 그림(PNG)은 같다 — 인쇄 · 저장은 지금처럼 캔버스에서 바로 만든다. */
function pngURL(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error('포스터 그림(PNG)을 만들지 못함'))), 'image/png');
  });
}

/** 다 쓴 포스터(새 포스터로 바뀌었거나 처음으로 돌아감)의 그림 주소와 캔버스 메모리를 바로 놓는다 — 아이폰 사파리는 캔버스 메모리를
 *  늦게 돌려줘, 여러 번 만들면 한도에 닿을 수 있다. */
export function releasePosters(posters: Poster[]) {
  for (const p of posters) {
    URL.revokeObjectURL(p.url);
    p.canvas.width = 0;
    p.canvas.height = 0;
  }
}

export async function buildPosters(images: string[], meta: Meta): Promise<Poster[]> {
  const [arts] = await withinLimit(Promise.all([Promise.all(images.map(loadImg)), preparePosterAssets(meta)]), ASSET_LIMIT_MS, '조판 준비(글자 · 로고 · 그림)');
  const posters: Poster[] = [];
  try {
    for (const art of arts) {
      for (const t of TEMPLATES) {
        // 한 장마다 PNG(toBlob)를 기다리는 동안 브라우저가 쉬어 간다 — 8장을 한 번에 붙잡지 않아 로딩 화면이 멈추지 않는다(휴대폰은 한 장에 수백 ms).
        const cv = document.createElement('canvas');
        cv.width = 1200;
        cv.height = 1800;
        const ctx = cv.getContext('2d');
        if (!ctx) throw new Error('포스터 그림판을 만들지 못함(메모리)');
        t.render(ctx, art, meta, GENRES[meta.genre]);
        posters.push({ label: t.label, canvas: cv, url: await pngURL(cv) });
      }
    }
  } catch (error) {
    releasePosters(posters);
    throw error;
  }
  return posters;
}
