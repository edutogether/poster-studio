// @vitest-environment jsdom
/* 조판(buildPosters)의 두 실패 길 — 11/8 종합감사 D3.
   ① 조판 준비(글꼴 · 로고 · 그림 받기)가 끝나지 않으면 30초(ASSET_LIMIT_MS)에 실패로 끝난다 — 11/3 «무한 로딩»의 고침.
   ② 몇 장 만든 뒤 PNG(toBlob)가 실패하면 이미 만든 장의 그림 주소 · 캔버스 메모리를 놓고 실패한다(releasePosters).
   받기 · 그리기는 가짜로 바꾼다(시험이 보는 것은 시한과 정리뿐이다). */
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Meta } from '../src/state.js';

const hold = vi.hoisted(() => ({ fonts: null as null | Promise<void> }));
vi.mock('../src/layout.js', () => ({
  ensureFonts: () => hold.fonts ?? Promise.resolve(),
  ensureGlyphs: () => Promise.resolve(),
  ensureLogo: () => Promise.resolve(),
  loadImg: (src: string) => Promise.resolve({ src })
}));
vi.mock('../src/templates.js', () => ({
  TEMPLATES: ['가', '나', '다'].map((label) => ({ label, render: () => {} }))
}));

import { ASSET_LIMIT_MS, buildPosters } from '../src/poster.js';

const meta = { genre: 'animation' } as unknown as Meta;
let blobs: (Blob | null)[];
let urls: string[];
const revoke = vi.fn();

beforeEach(() => {
  hold.fonts = null;
  blobs = [];
  urls = [];
  revoke.mockClear();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (cb) {
    const next = blobs.length ? blobs.shift()! : new Blob(['png']);
    queueMicrotask(() => cb(next));
  });
  vi.stubGlobal('URL', Object.assign(Object.create(URL), {
    createObjectURL: () => { const u = `blob:poster-${urls.length}`; urls.push(u); return u; },
    revokeObjectURL: revoke
  }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('조판 준비가 끝나지 않으면 30초에 실패로 끝난다 — 그 전에는 기다린다', async () => {
  vi.useFakeTimers();
  hold.fonts = new Promise<void>(() => {});   // 멈춘 글꼴 요청
  let settled: 'ok' | Error | null = null;
  buildPosters(['art.png'], meta).then(() => { settled = 'ok'; }, (e: Error) => { settled = e; });
  await vi.advanceTimersByTimeAsync(ASSET_LIMIT_MS - 1);
  expect(settled).toBe(null);
  await vi.advanceTimersByTimeAsync(1);
  expect(settled).toBeInstanceOf(Error);
  expect((settled as unknown as Error).message).toContain('30초 안에 끝나지 않음');
  expect(ASSET_LIMIT_MS).toBe(30_000);
});

test('제때 받으면 포스터 장 수 = 그림 × 틀이고, 시한 타이머를 남기지 않는다', async () => {
  vi.useFakeTimers();
  const posters = await buildPosters(['a.png', 'b.png'], meta);
  expect(posters.map((p) => p.label)).toEqual(['가', '나', '다', '가', '나', '다']);
  expect(posters.map((p) => p.url)).toEqual(urls);
  expect(vi.getTimerCount()).toBe(0);
});

test('PNG가 중간에 실패하면 이미 만든 장의 그림 주소 · 캔버스 메모리를 놓고 실패한다', async () => {
  blobs = [new Blob(['1']), new Blob(['2']), null];   // 셋째 장에서 실패
  const made: HTMLCanvasElement[] = [];
  const create = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    const el = create(tag);
    if (tag === 'canvas') made.push(el as HTMLCanvasElement);
    return el;
  }) as typeof document.createElement);
  await expect(buildPosters(['art.png'], meta)).rejects.toThrow('포스터 그림(PNG)을 만들지 못함');
  expect(revoke.mock.calls.map(([u]) => u)).toEqual(['blob:poster-0', 'blob:poster-1']);
  expect(made).toHaveLength(3);
  expect(made.slice(0, 2).map((c) => [c.width, c.height])).toEqual([[0, 0], [0, 0]]);
});
