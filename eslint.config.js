// 최소 설정 — 5차 감사 발견 "public/app.js에 ESLint 미적용" 대응.
// functions/eslint.config.js와 동일한 취지: 스타일 강제보다 실수(안 쓰는 변수,
// undefined 참조 등) 검출에 초점.
// ES모듈 전환(2026-08-30, 5차 감사 후속조치 1·5번) 이후로는 각 파일이 진짜
// import/export를 쓰는 독립 모듈이라, 예전처럼 "여러 파일이 공유하는 전역"을
// globals 블록에 일일이 나열해줄 필요가 없어졌다 — import 안 된 식별자는
// ESLint가 정상적으로 no-undef로 잡아준다.
export default [
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
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
        ResizeObserver: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-undef': 'error'
    }
  },
  {
    // test/ 안은 Node ESM(node:test 등)이라 브라우저 전역 대신 Node 전역이 필요.
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
  },
  {
    /* scripts/verify/ — 전환 검증 도구. 두 세계가 섞여 있다:
       *.js는 브라우저 페이지 안에서 평가되고(snapshot/timing/scenario),
       *.mjs는 Node에서 돈다(compare/selftest/capture-server). */
    files: ['scripts/verify/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        window: 'readonly', document: 'readonly', navigator: 'readonly',
        location: 'readonly', innerWidth: 'readonly', innerHeight: 'readonly',
        getComputedStyle: 'readonly', performance: 'readonly',
        fetch: 'readonly', Response: 'readonly', setTimeout: 'readonly',
        AnimationEvent: 'readonly',
        /* poster-pixels-ui.js가 지문(SHA-256)을 뜨는 데 쓴다. */
        crypto: 'readonly', TextEncoder: 'readonly',
        setInterval: 'readonly', clearInterval: 'readonly', console: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-undef': 'error'
    }
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { console: 'readonly', process: 'readonly', Buffer: 'readonly', fetch: 'readonly', Blob: 'readonly', FormData: 'readonly', URL: 'readonly' }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-undef': 'error'
    }
  },
  {
    /* 빌드 산출물과 워크트리는 검사 대상이 아니다.

       src 아래 .ts / .tsx 를 검사하지 않는 이유(2026-09-09, TS 전환 2·3단계):
       이 설정이 src에 대해 강제하던 건 no-unused-vars와 no-undef 둘뿐인데,
       tsconfig의 noUnusedLocals·noUnusedParameters와 컴파일러의 식별자 해석이
       그 둘을 그대로(오히려 더 강하게) 덮는다. 추측이 아니라 변형으로 확인했다 —
       안 쓰는 지역변수(TS6133), 정의되지 않은 식별자(TS2304), 잘못된 요소 타입
       사용(TS2339), 인자 타입 불일치(TS2345) 네 가지를 각각 넣어 `npm run typecheck`가
       전부 실패하는 것을 확인하고 원복했다.
       즉 src는 검사를 안 받는 게 아니라 **typecheck가 받는다.** 목록에서 빠진 것과
       일부러 뺀 것을 구분하려고 적어 둔다(5차 감사에서 'public/app.js에 ESLint
       미적용'이 정확히 이런 식으로 조용히 새어 있었다). typescript-eslint를 들이지
       않은 것도 같은 이유다 — 새 규칙을 추가할 게 아니라면 얻는 것 없이 의존성만 는다.
       3단계에서 들어온 .tsx는 아래 ignores에 없지만, 이 설정의 어떤 블록도
       .tsx를 files로 잡지 않아 애초에 검사 대상이 아니다(eslint -f json으로 확인함).
       역시 typecheck가 받는다. */
    ignores: ['dist/**', '.claude/worktrees/**', 'functions/**', 'public/fonts/**', 'src/**/*.ts']
  }
];
