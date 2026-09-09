/* ────────────────────────────────────────────────────────────────────
   앱 진입점. 3단계 React 전환(2026-09-09).

   **<main class="app">를 대체하지 않고 그 안에 렌더한다.** 루트용 <div>를 새로
   끼우면 body와 main 사이에 없던 요소가 하나 생겨 레이아웃 계산이 달라질 수
   있는데, 결과물은 바뀌면 안 된다. main 자체는 index.html에 그대로 두고
   children만 React가 소유한다 — 그래서 대조 스냅샷의 `main.app` 항목이
   전환 전후로 같은 요소를 가리킨다.

   favicon.ts는 React 트리 밖의 document 전역(<link rel=icon>)만 다루므로
   예전처럼 부수효과 import로 둔다 — 컴포넌트로 옮길 이유가 없다.

   스플래시는 여기서 건드리지 않는다(4단계). 마크업은 index.html에 정적으로 있고,
   타이밍은 style.css가, 노드 제거와 안전판은 public/boot-splash.js가 맡는다.
   ──────────────────────────────────────────────────────────────────── */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import PosterStudio from './PosterStudio.js';
import './favicon.js';

const container = document.querySelector('main.app');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <PosterStudio />
    </StrictMode>
  );
}
