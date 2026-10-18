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

test('4차 판정(10/18): 통과한 시네마 · 트립틱만 새 디자인이고 수정 6종은 지금 라이브 디자인이다', () => {
  expect([...KEEP_LIVE]).toEqual(['에디토리얼', '컬러 블록', '아치 프레임', '필름스트립', '폴라로이드', '타이포그래피']);
  for (const [i, t] of TEMPLATES.entries()) {
    if (t.label === '시네마' || t.label === '트립틱') expect(t, t.label).not.toBe(LIVE_TEMPLATES[i]);
    else expect(t, t.label).toBe(LIVE_TEMPLATES[i]);
  }
});
