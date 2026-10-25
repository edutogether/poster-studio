/* AI 품질 A/B — 생성된 그림 한 장에 앱의 디자인 8종(src/poster.ts buildPosters, 실제 화면과 같은 코드)을 입혀 PNG(또는 JPEG)로 돌려준다.
   QA 전용 페이지(scripts/qa/ai-ab/compose.html) — 빌드 · 배포에 들어가지 않는다(vite 진입점은 index.html · privacy.html뿐). */
import { buildPosters } from '../../../src/poster.js';
import type { Meta } from '../../../src/state.js';

type Fmt = { type: 'image/png' | 'image/jpeg'; q?: number };
declare global { interface Window { aiqCompose: (art: string, meta: Meta, fmt?: Fmt) => Promise<{ label: string; data: string }[]>; aiqReady: boolean } }
window.aiqCompose = async (art, meta, fmt = { type: 'image/png' }) => (await buildPosters([art], meta)).map((p) => ({ label: p.label, data: p.canvas.toDataURL(fmt.type, fmt.q) }));
window.aiqReady = true;
