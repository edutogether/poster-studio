import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 브라우저 DOM은 손수 만든 가짜(test/load-app.js)로 흉내낸다 — jsdom을 쓰지
    // 않는 이유는 그 하네스가 이미 필요한 만큼만 정확히 흉내내고 있고,
    // 캔버스 픽셀 테스트용 @napi-rs/canvas 연결은 jsdom을 쓰든 안 쓰든
    // 어차피 따로 해줘야 하기 때문이다(2026-09-07 vitest 이전 때의 판단).
    /* 기본은 node — 순수 로직 테스트(layout/templates/favicon)는 손수 만든 가짜
       DOM으로 충분하다. React 컴포넌트 테스트만 파일 맨 위 `@vitest-environment jsdom`
       주석으로 jsdom을 쓴다(2026-09-09, 3단계). 전체를 jsdom으로 올리지 않는 건
       나머지 테스트가 그걸 필요로 하지 않기 때문이다. */
    environment: 'node',
    include: ['test/**/*.test.{js,ts,tsx}']
  }
});
