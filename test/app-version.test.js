/* 설치판 판 번호 셈(scripts/build/app-version.mjs versionOf) — 11/8 종합감사 D5.
   git 기록으로 세는 것(count · --selftest)은 CI 시험 잡이 얕은 체크아웃이라 돌 수 없어, 셈 규칙만 커밋 목록으로 고정한다.
   규칙(11/3 Bumm님 F-5 «A» · 11/5 시작점 2.7.4): 큰 구조 변경 첫째 · feat 둘째 · 고침 셋째 자리, 10이면 윗자리로, 문서 · 시험 · 잡일은 세지 않음, 모르는 종류는 멈춤. */
import { expect, test } from 'vitest';
import { versionOf } from '../scripts/build/app-version.mjs';

const line = (subject, hash = Math.random().toString(16).slice(2).padEnd(40, '0')) => `${hash}\t${subject}`;
const BIG = ['b108f3b', 'd193f07', 'a4c3024'].map((h) => line('큰 구조 변경', h.padEnd(40, '0')));

test('시작점(2.7.4) 뒤: 고침은 셋째, 기능은 둘째 자리 — 문서 · 시험 · 잡일 · 종류 없는 제목은 세지 않는다', () => {
  const got = versionOf([
    line('fix(functions): 고침'), line('perf: 빠르게'), line('feat(desktop): 기능'),
    line('docs: 문서'), line('test: 시험'), line('chore(desktop): 판 번호 2.9.4'), line('ci: 배포'), line('verify: 탐침'), line('mock: 시안'),
    line('Initial commit'),
  ], true);
  expect(got).toEqual({ version: '2.8.6', commits: 10, big: 0, minor: 1, patch: 2, skipped: 7 });
});

test('셋째 자리가 10이면 둘째로, 둘째가 10이면 첫째로 올린다', () => {
  expect(versionOf(Array.from({ length: 6 }, () => line('fix: 고침')), true).version).toBe('2.8.0');
  expect(versionOf(Array.from({ length: 3 }, () => line('feat: 기능')), true).version).toBe('3.0.4');
});

test('처음부터 셀 때(시작점에 닿지 않는 옛 커밋)는 큰 구조 변경 셋이 첫째 자리다', () => {
  expect(versionOf([...BIG, line('feat: 기능'), line('fix!: 고침')], false)).toEqual({ version: '3.1.1', commits: 5, big: 3, minor: 1, patch: 1, skipped: 0 });
});

test('처음부터 세는데 큰 구조 변경 커밋이 다 닿지 않으면 멈춘다(잘못된 커밋)', () => {
  expect(() => versionOf([BIG[0], line('fix: 고침')], false)).toThrow('큰 구조 변경 커밋 3개 가운데 1개만');
});

test('표에 없는 종류가 나오면 그 커밋을 적고 멈춘다 — 조용히 빠지지 않는다', () => {
  expect(() => versionOf([line('fix: 고침'), line('wip: 하던 것', 'abcdef1'.padEnd(40, '0'))], true)).toThrow(/어디에 셀지 정하지 않은 종류:\nabcdef1 wip: 하던 것/);
});
