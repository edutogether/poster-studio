// @vitest-environment jsdom
/* 화면 알림(src/studio/StatusToast.tsx — 2026-11-03 Bumm님 실기기 확인) — 11/8 종합감사 D6.
   보이는 시간(글 길이에 따라 4~6.5초 + 사라지는 0.3초) · 같은 글을 다시 내면 다시 뜸 · 로딩 중엔 숨김 · 자리(2단계는 사진 칸 가운데 · 위에서 66%,
   그 밖이나 칸이 화면 밖이면 화면 가운데) · 문장 나눔을 고정한다. 실제 화면에서 재는 것은 scripts/verify/status-toast-probe.mjs. */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import StatusToast from '../src/studio/StatusToast.js';

const toast = () => document.querySelector<HTMLDivElement>('.studio-status')!;
let frame: HTMLElement | null = null;

function cameraFrame(rect: { left: number; top: number; width: number; height: number }) {
  const view = document.createElement('div');
  view.id = 'cameraView';
  frame = document.createElement('div');
  frame.className = 'camera-frame';
  frame.getBoundingClientRect = () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top, toJSON: () => ({}) });
  view.append(frame);
  document.body.append(view);
}

beforeEach(() => {
  vi.useFakeTimers();
  Object.assign(window, { innerWidth: 1024, innerHeight: 768 });
});
afterEach(() => {
  cleanup();
  document.getElementById('cameraView')?.remove();
  frame = null;
  vi.useRealTimers();
});

test('짧은 글은 4초 보인 뒤 0.3초 동안 사라지고 숨는다', () => {
  render(<StatusToast text="촬영 완료 !" id={1} step={1} suppressed={false} />);
  expect(toast().hidden).toBe(false);
  act(() => { vi.advanceTimersByTime(3_999); });
  expect(toast().dataset.leaving).toBeUndefined();
  act(() => { vi.advanceTimersByTime(1); });
  expect(toast().dataset.leaving).toBe('true');
  act(() => { vi.advanceTimersByTime(299); });
  expect(toast().hidden).toBe(false);
  act(() => { vi.advanceTimersByTime(1); });
  expect(toast().hidden).toBe(true);
});

test('긴 글은 길이에 따라 더 오래 — 상한 6.5초', () => {
  const { rerender } = render(<StatusToast text={'가'.repeat(40)} id={1} step={1} suppressed={false} />);
  act(() => { vi.advanceTimersByTime(2_500 + 40 * 60 - 1); });
  expect(toast().dataset.leaving).toBeUndefined();
  act(() => { vi.advanceTimersByTime(1); });
  expect(toast().dataset.leaving).toBe('true');
  rerender(<StatusToast text={'나'.repeat(200)} id={2} step={1} suppressed={false} />);
  act(() => { vi.advanceTimersByTime(6_499); });
  expect(toast().dataset.leaving).toBeUndefined();
  act(() => { vi.advanceTimersByTime(1); });
  expect(toast().dataset.leaving).toBe('true');
});

test('사라진 뒤 같은 글을 새 번호로 내면 다시 뜬다 · 로딩 중(suppressed)이면 숨는다', () => {
  const { rerender } = render(<StatusToast text="다시 해 주세요" id={1} step={1} suppressed={false} />);
  act(() => { vi.advanceTimersByTime(5_000); });
  expect(toast().hidden).toBe(true);
  rerender(<StatusToast text="다시 해 주세요" id={2} step={1} suppressed={false} />);
  expect(toast().hidden).toBe(false);
  rerender(<StatusToast text="다시 해 주세요" id={2} step={1} suppressed />);
  expect(toast().hidden).toBe(true);
});

test('2단계는 사진 칸의 가로 가운데 · 위에서 66%에 뜬다', () => {
  cameraFrame({ left: 100, top: 200, width: 300, height: 400 });
  render(<StatusToast text="카메라를 켜 주세요" id={1} step={2} suppressed={false} />);
  expect(toast().style.left).toBe('250px');
  expect(toast().style.top).toBe(`${200 + 400 * 0.66}px`);
});

test('1 · 3단계, 또는 사진 칸이 화면 밖이면 화면 가운데에 뜬다', () => {
  cameraFrame({ left: 100, top: 900, width: 300, height: 400 });   // 화면(높이 768) 아래
  const { rerender } = render(<StatusToast text="알림" id={1} step={2} suppressed={false} />);
  expect([toast().style.left, toast().style.top]).toEqual(['512px', '384px']);
  rerender(<StatusToast text="알림" id={2} step={3} suppressed={false} />);
  expect([toast().style.left, toast().style.top]).toEqual(['512px', '384px']);
});

test('글 안의 «\\n»은 문장마다 한 줄 조각이다', () => {
  render(<StatusToast text={'첫 문장이에요.\n둘째 문장이에요.'} id={1} step={1} suppressed={false} />);
  const lines = [...toast().querySelectorAll('.status-line')].map((s) => s.textContent);
  expect(lines).toEqual(['첫 문장이에요.', ' 둘째 문장이에요.']);
  expect(toast().querySelector('#status')!.getAttribute('role')).toBe('status');
});
