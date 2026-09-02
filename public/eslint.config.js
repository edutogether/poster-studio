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
        performance: 'readonly',
        requestAnimationFrame: 'readonly'
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
  }
];
