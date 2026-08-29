// 최소 설정 — 4차 감사 🟡 "ESLint/Prettier 미도입" 대응.
// 엄격한 스타일 강제보다는 실수(안 쓰는 변수, undefined 참조 등)를 잡는 데 초점.
export default [
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        setTimeout: 'readonly',
        FormData: 'readonly',
        Request: 'readonly',
        Blob: 'readonly',
        fetch: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error'
    }
  }
];
