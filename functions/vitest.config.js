import { defineConfig } from 'vitest/config';

// 테스트 파일이 하나(test/index.test.js)뿐이고 그 안의 여러 테스트가 공유
// 상태(파일시스템 UPLOAD_DIR, 인메모리 가짜 Firestore 카운터)에 의존해
// 순서대로(직렬) 실행돼야 한다 — node:test 시절의 `--test-concurrency=1`과
// 동일한 효과를 위해 파일 내부를 순차 실행하는 vitest 기본 동작을 그대로 쓴다.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js']
  }
});
