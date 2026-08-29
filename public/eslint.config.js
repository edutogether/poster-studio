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
        Uint8ClampedArray: 'readonly'
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
