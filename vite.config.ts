import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/* ────────────────────────────────────────────────────────────────────
   Vite 설정 — 리액트+TS 전환(2026-09-09)으로 빌드 단계를 처음 도입한다.
   전환 전에는 번들러가 없었고 `public/`을 그대로 Hosting에 올렸다.

   ⚠ modulePreload.polyfill을 반드시 끈다.
   firebase.json의 CSP가 `script-src 'self'`라 **인라인 스크립트를 금지**하는데,
   Vite는 이 폴리필을 인라인 <script>로 주입하는 게 기본값이다. 그대로 배포하면
   CSP에 막혀 앱이 아예 안 뜬다(8차 감사 이후 보안헤더를 두 번 손댄 영역이라
   더 조심해야 한다). 대상 브라우저가 행사장 노트북의 최신 크롬이라
   폴리필 자체가 필요 없다.
   ──────────────────────────────────────────────────────────────────── */
export default defineConfig({
  // public/ = 정적 자산(폰트·로고·배경 이미지·클래식 스크립트). 그대로 dist/로 복사된다.
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        privacy: resolve(__dirname, 'privacy.html')
      }
    }
  },
  server: { port: 5173 }
});
