import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 브라우저 DOM은 손수 만든 가짜(test/load-app.js)로 흉내낸다 — jsdom을 쓰지
    // 않는 이유는 그 하네스가 이미 필요한 만큼만 정확히 흉내내고 있고,
    // 캔버스 픽셀 테스트용 @napi-rs/canvas 연결은 jsdom을 쓰든 안 쓰든
    // 어차피 따로 해줘야 하기 때문이다(2026-09-07 vitest 이전 때의 판단).
    environment: 'node',
    include: ['test/**/*.test.{js,ts}']
  }
});
