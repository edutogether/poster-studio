/* 포스터 4차 판정(2026-10-18) 준비: 탈락한 디자인만 지금 라이브 디자인으로 바꿔 끼운다(src/templates.ts의 KEEP_LIVE). */
import { expect, test } from 'vitest';
import { KEEP_LIVE, pickTemplates, TEMPLATES } from '../src/templates.js';
import { LIVE_TEMPLATES } from '../src/templates-live.js';

test('두 목록은 같은 이름 8종이다 — 이름으로 바꿔 끼울 수 있다', () => {
  expect(TEMPLATES.map((t) => t.label)).toEqual(LIVE_TEMPLATES.map((t) => t.label));
  expect(TEMPLATES).toHaveLength(8);
});

test('판정 이름을 넣으면 그 디자인만 라이브 것으로 바뀌고 순서 · 나머지는 그대로다', () => {
  const picked = pickTemplates(TEMPLATES, LIVE_TEMPLATES, new Set(['폴라로이드', '트립틱']));
  expect(picked.map((t) => t.label)).toEqual(TEMPLATES.map((t) => t.label));
  for (const [i, t] of picked.entries()) {
    const fromLive = t.label === '폴라로이드' || t.label === '트립틱';
    expect(t, t.label).toBe(fromLive ? LIVE_TEMPLATES[i] : TEMPLATES[i]);
  }
});

test('목록에 없는 이름(오타)은 조용히 넘어가지 않고 멈춘다', () => {
  expect(() => pickTemplates(TEMPLATES, LIVE_TEMPLATES, new Set(['폴라로이도']))).toThrow('폴라로이도');
});

test('판정 끝(10/19): 8종 모두 새 디자인이다', () => {
  expect(KEEP_LIVE.size).toBe(0);
  for (const [i, t] of TEMPLATES.entries()) expect(t, t.label).not.toBe(LIVE_TEMPLATES[i]);
});
