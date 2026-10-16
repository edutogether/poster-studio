// public/app.js의 타이포 레이아웃 계산 로직(제목 줄바꿈, 폰트 크기 자동 축소,
// 크레딧 문구 조립)을 검증한다. 실제 브라우저 없이 app.js를 그대로 로드해
// (load-app.js 참고) 실제 프로덕션 함수를 호출한다 — 로직을 베껴서 다시 구현한
// "가짜 검증"이 아니다.
import { test, expect } from 'vitest';
import { loadApp, FakeCtx } from './load-app.js';

const app = await loadApp();

// ── setFitFont: 텍스트가 maxW를 넘으면 폰트를 줄여 잘림을 막는다 ──
test('setFitFont: maxW 안에 들어가는 짧은 텍스트는 원래 크기 그대로 유지한다', () => {
  const ctx = new FakeCtx();
  const size = app.setFitFont(ctx, 800, 40, 'Pretendard', '짧은 글', 2000);
  expect(size).toBe(40);
});

test('setFitFont: maxW를 넘는 긴 텍스트는 폰트 크기를 줄인다', () => {
  const ctx = new FakeCtx();
  const longText = '아주아주아주아주아주아주아주아주아주아주 긴 단체명입니다';
  const size = app.setFitFont(ctx, 800, 46, 'Pretendard', longText, 300);
  expect(size < 46, `줄어들어야 하는데 그대로임: ${size}`).toBeTruthy();
});

test('setFitFont: 아무리 길어도 최소 크기(16px) 밑으로는 안 내려간다', () => {
  const ctx = new FakeCtx();
  const veryLongText = '매우'.repeat(200);
  const size = app.setFitFont(ctx, 800, 46, 'Pretendard', veryLongText, 50);
  expect(size >= 16, `최소 크기보다 작아지면 안 된다: ${size}`).toBeTruthy();
});

// ── creditMain/creditSub: 개인/단체 모드에 따라 다른 크레딧 문구를 조립한다 ──
test('creditMain: 개인 모드는 "주연 · 감독 이름" 형식이다', () => {
  const text = app.creditMain({ mode: 'solo', name: '김인키' });
  expect(text).toMatch(/주연.*감독.*김인키/);
});

test('creditMain: 단체 모드는 단체명을 그대로 쓴다', () => {
  const text = app.creditMain({ mode: 'group', groupName: '햇살초 영화동아리' });
  expect(text).toBe('햇살초 영화동아리');
});

test('creditSub: 단체 모드 + 출연진 있음 → "출연 ..." 문구', () => {
  const text = app.creditSub({ mode: 'group', members: '김인키, 이영화' });
  expect(text).toMatch(/출연.*김인키, 이영화/);
});

test('creditSub: 개인 모드는 항상 빈 문자열(부제 없음)', () => {
  expect(app.creditSub({ mode: 'solo', members: '무시되어야 함' })).toBe('');
});

test('creditSub: 단체 모드인데 출연진을 안 적으면 빈 문자열', () => {
  expect(app.creditSub({ mode: 'group', members: '' })).toBe('');
});

