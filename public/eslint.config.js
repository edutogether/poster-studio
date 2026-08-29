// 최소 설정 — 5차 감사 발견 "public/app.js에 ESLint 미적용" 대응.
// functions/eslint.config.js와 동일한 취지: 스타일 강제보다 실수(안 쓰는 변수,
// undefined 참조 등) 검출에 초점. public/app.js는 브라우저 전역 script(모듈 아님).
export default [
  {
    // 이 설정 파일 자체는 ESM(import/export)이라 아래 'script' 규칙 대상에서 제외.
    ignores: ['eslint.config.js']
  },
  {
    files: ['**/*.js'],
    ignores: ['eslint.config.js', 'test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        AbortController: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        Image: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        queueMicrotask: 'readonly',
        Uint8ClampedArray: 'readonly',

        // app.js/layout.js/templates.js/camera.js/api.js는 전부 classic <script>로
        // 로드되는 하나의 공유 전역 스코프다(모듈 아님, import/export 없음) — 5차
        // 감사 후속조치로 app.js 하나였던 걸 역할별 6개 파일로 분리(2026-08-30)하면서
        // ESLint가 파일 단위로만 보기 때문에 "여기 정의 안 됨" 오탐이 생긴다. 실제
        // 브라우저에서는 전부 같은 전역이므로 여기서 한 번에 선언해 오탐을 없앤다.
        API_BASE: 'readonly', BOOTH_TOKEN: 'readonly', FEST: 'readonly', DATE: 'readonly',
        VENUE: 'readonly', EN: 'readonly', GENRES: 'readonly', $: 'readonly', val: 'readonly',
        pick: 'readonly', video: 'readonly', snapshot: 'readonly', posterCanvas: 'readonly',
        pctx: 'readonly', W: 'readonly', H: 'readonly', setStatus: 'readonly',
        stream: 'writable', capturedBlob: 'writable', currentMode: 'writable',
        posters: 'writable', LOGO_LIGHT: 'writable', LOGO_DARK: 'writable',
        LOGO_TRIED: 'writable', selected: 'writable',
        ensureFonts: 'readonly', ensureGlyphs: 'readonly', loadImg: 'readonly',
        coverDraw: 'readonly', roundRect: 'readonly', vignette: 'readonly',
        grain: 'readonly', grainTile: 'writable', setLS: 'readonly',
        setFitFont: 'readonly', layoutTitle: 'readonly', drawTitle: 'readonly',
        ensureLogo: 'readonly', drawOrgLogo: 'readonly',
        creditMain: 'readonly', creditSub: 'readonly', TEMPLATES: 'readonly',
        startCamera: 'readonly', snapshotURL: 'writable',
        getMeta: 'readonly', makePlaceholderArt: 'readonly', pendingMeta: 'writable',
        MAX_GENERATIONS_PER_PHOTO: 'readonly', genCount: 'writable', isGenerating: 'writable',
        buildAll: 'readonly', renderGallery: 'readonly', select: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-undef': 'error'
    }
  },
  {
    // test/ 안은 Node ESM(node:test 등)이라 모듈 스코프 + Node 전역이 필요.
    files: ['test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        queueMicrotask: 'readonly',
        FormData: 'readonly',
        Request: 'readonly',
        Blob: 'readonly',
        Response: 'readonly',
        fetch: 'readonly',
        AbortController: 'readonly',
        Image: 'readonly',
        Uint8ClampedArray: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-undef': 'error'
    }
  }
];
