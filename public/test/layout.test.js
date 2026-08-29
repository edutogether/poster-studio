// public/app.js의 타이포 레이아웃 계산 로직(제목 줄바꿈, 폰트 크기 자동 축소,
// 크레딧 문구 조립)을 검증한다. 실제 브라우저 없이 app.js를 그대로 로드해
// (load-app.js 참고) 실제 프로덕션 함수를 호출한다 — 로직을 베껴서 다시 구현한
// "가짜 검증"이 아니다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, FakeCtx } from './load-app.js';

const app = loadApp();

// ── setFitFont: 텍스트가 maxW를 넘으면 폰트를 줄여 잘림을 막는다 ──
test('setFitFont: maxW 안에 들어가는 짧은 텍스트는 원래 크기 그대로 유지한다', () => {
  const ctx = new FakeCtx();
  const size = app.setFitFont(ctx, 800, 40, 'Pretendard', '짧은 글', 2000);
  assert.equal(size, 40);
});

test('setFitFont: maxW를 넘는 긴 텍스트는 폰트 크기를 줄인다', () => {
  const ctx = new FakeCtx();
  const longText = '아주아주아주아주아주아주아주아주아주아주 긴 단체명입니다';
  const size = app.setFitFont(ctx, 800, 46, 'Pretendard', longText, 300);
  assert.ok(size < 46, `줄어들어야 하는데 그대로임: ${size}`);
});

test('setFitFont: 아무리 길어도 최소 크기(16px) 밑으로는 안 내려간다', () => {
  const ctx = new FakeCtx();
  const veryLongText = '매우'.repeat(200);
  const size = app.setFitFont(ctx, 800, 46, 'Pretendard', veryLongText, 50);
  assert.ok(size >= 16, `최소 크기보다 작아지면 안 된다: ${size}`);
});

// ── layoutTitle: 한 줄에 안 들어가면 두 줄로 나눈다(포스터 밖으로 삐져나가는 것 방지) ──
test('layoutTitle: 짧은 제목은 한 줄로 최대 크기 그대로 나온다', () => {
  const ctx = new FakeCtx();
  const result = app.layoutTitle(ctx, '나의 영화', "'Black Han Sans'", 1000, 130, 60);
  assert.equal(result.lines.length, 1);
  assert.equal(result.size, 130);
});

test('layoutTitle: 긴 제목(띄어쓰기 포함)은 띄어쓰기 기준으로 두 줄로 나뉜다', () => {
  const ctx = new FakeCtx();
  const longTitle = '우주를 건너 별들의 바다로 떠나는 아주 긴 모험 이야기';
  const result = app.layoutTitle(ctx, longTitle, "'Black Han Sans'", 1000, 130, 60);
  assert.equal(result.lines.length, 2);
  // 두 줄 다 원래 문장의 일부를 담고 있어야 한다(내용 유실 없이 분할)
  assert.equal((result.lines[0] + result.lines[1]).replace(/\s+/g, ''), longTitle.replace(/\s+/g, ''));
});

test('layoutTitle: 띄어쓰기 없는 긴 제목도 예외 없이 두 줄로 분할된다', () => {
  const ctx = new FakeCtx();
  const longNoSpace = '가'.repeat(40);
  const result = app.layoutTitle(ctx, longNoSpace, "'Black Han Sans'", 800, 130, 60);
  assert.equal(result.lines.length, 2);
  assert.equal(result.lines[0].length + result.lines[1].length, longNoSpace.length);
});

test('layoutTitle: 두 줄로도 안 들어가는 극단적으로 긴 제목은 최소 크기로 강제 표시된다(무한루프/예외 없음)', () => {
  const ctx = new FakeCtx();
  const extreme = '영'.repeat(200);
  const result = app.layoutTitle(ctx, extreme, "'Black Han Sans'", 500, 130, 60);
  assert.equal(result.lines.length, 2);
  assert.equal(result.size, 60); // minSize까지 내려가도 못 맞으면 minSize로 확정
});

// ── creditMain/creditSub: 개인/단체 모드에 따라 다른 크레딧 문구를 조립한다 ──
test('creditMain: 개인 모드는 "주연 · 감독 이름" 형식이다', () => {
  const text = app.creditMain({ mode: 'solo', name: '김인키' });
  assert.match(text, /주연.*감독.*김인키/);
});

test('creditMain: 단체 모드는 단체명을 그대로 쓴다', () => {
  const text = app.creditMain({ mode: 'group', groupName: '햇살초 영화동아리' });
  assert.equal(text, '햇살초 영화동아리');
});

test('creditSub: 단체 모드 + 출연진 있음 → "출연 ..." 문구', () => {
  const text = app.creditSub({ mode: 'group', members: '김인키, 이영화' });
  assert.match(text, /출연.*김인키, 이영화/);
});

test('creditSub: 개인 모드는 항상 빈 문자열(부제 없음)', () => {
  assert.equal(app.creditSub({ mode: 'solo', members: '무시되어야 함' }), '');
});

test('creditSub: 단체 모드인데 출연진을 안 적으면 빈 문자열', () => {
  assert.equal(app.creditSub({ mode: 'group', members: '' }), '');
});

// ── makePlaceholderArt: AI 장애 폴백용 그림이 어떤 장르에도 예외 없이 만들어진다 ──
test('makePlaceholderArt: 알려진 장르는 PNG data URL을 만든다', () => {
  const url = app.makePlaceholderArt('sf');
  assert.ok(url.startsWith('data:image/png'));
});

test('makePlaceholderArt: 모르는 장르 값이 와도 기본값(animation)으로 대체되어 예외 없이 동작한다', () => {
  const url = app.makePlaceholderArt('존재하지않는장르');
  assert.ok(url.startsWith('data:image/png'));
});
