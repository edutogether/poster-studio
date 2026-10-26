// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import WaitingArtwork from "../src/studio/WaitingArtwork";
import GenerationWait from "../src/studio/GenerationWait";
import { afterWaitingVideos, BACKGROUND_CAP_MS, prefetchWaitingVideo, waitingVideosReady } from "../src/studio/waitingNetwork";
import { approvedWaitingVideo } from "../src/studio/waitingVideo";
import { waitingSets } from "../src/studio/waitingSets";

// 대기 화면 동안 망을 쓰는 차례(2026-10-26 팀장 지시 1번 ③): 지금 장면 영상 → 다음 장면 영상 → 조판 글꼴 · 로고.
const props = { image: "/studio/waiting-v3/11.webp", theme: "움직임에 생기를", video: "/test-only.mp4", paused: false, reduced: false };
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
});
afterEach(() => { waitingVideosReady(); cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

/** jsdom의 영상 요소에는 받은 구간 · 길이가 없다 — 받은 끝(초)과 길이를 심는다 */
const buffer = (video: HTMLVideoElement, end: number, duration = 8, readyState = 4) => {
  Object.defineProperty(video, "duration", { configurable: true, get: () => duration });
  Object.defineProperty(video, "readyState", { configurable: true, get: () => readyState });
  Object.defineProperty(video, "buffered", { configurable: true, get: () => ({ length: 1, start: () => 0, end: () => end }) });
};
const settled = (promise: Promise<void>) => { let done = false; void promise.then(() => { done = true; }); return () => done; };

test("조판 받기는 대기 화면이 영상을 받았다고 알릴 때 풀린다 — 그 전에는 기다린다", async () => {
  const isDone = settled(afterWaitingVideos());
  await act(async () => { vi.advanceTimersByTime(BACKGROUND_CAP_MS - 1); });
  expect(isDone()).toBe(false);
  await act(async () => { waitingVideosReady(); });
  expect(isDone()).toBe(true);
});

test("대기 화면이 끝내 알리지 않아도 늦어도 상한 시간 뒤에는 풀린다 — 응답 전에 글꼴이 와 있게", async () => {
  const isDone = settled(afterWaitingVideos());
  await act(async () => { vi.advanceTimersByTime(BACKGROUND_CAP_MS); });
  expect(isDone()).toBe(true);
});

test("새 생성이 시작되면 앞 생성의 기다림은 바로 풀리고, 알림은 새 기다림에만 간다", async () => {
  const first = settled(afterWaitingVideos());
  const second = settled(afterWaitingVideos());
  await act(async () => {});
  expect(first()).toBe(true);
  expect(second()).toBe(false);
  await act(async () => { waitingVideosReady(); });
  expect(second()).toBe(true);
});

test("다음 장면 영상은 주소마다 한 번만 받고, 망 오류로 못 받으면 다음에 다시 받는다", async () => {
  const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("offline")).mockResolvedValue(new Response(new Uint8Array(4)));
  vi.stubGlobal("fetch", fetchMock);
  await prefetchWaitingVideo("/studio/waiting-v3/01-aaaaaaaaaaaa.mp4");
  await prefetchWaitingVideo("/studio/waiting-v3/01-aaaaaaaaaaaa.mp4");
  await prefetchWaitingVideo("/studio/waiting-v3/01-aaaaaaaaaaaa.mp4");
  await Promise.all([prefetchWaitingVideo("/studio/waiting-v3/02-bbbbbbbbbbbb.mp4"), prefetchWaitingVideo("/studio/waiting-v3/02-bbbbbbbbbbbb.mp4")]);
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
    "/studio/waiting-v3/01-aaaaaaaaaaaa.mp4", "/studio/waiting-v3/01-aaaaaaaaaaaa.mp4", "/studio/waiting-v3/02-bbbbbbbbbbbb.mp4",
  ]);
});

test("장면 영상은 끝까지 받았을 때 한 번만 «받았다»를 알린다 — 덜 받은 동안은 알리지 않는다", () => {
  const onLoaded = vi.fn();
  const view = render(<WaitingArtwork {...props} onLoaded={onLoaded}/>);
  const video = view.container.querySelector("video")!;
  buffer(video, 3.2);
  fireEvent.progress(video); fireEvent.canPlayThrough(video);
  expect(onLoaded).not.toHaveBeenCalled();
  buffer(video, 8);
  fireEvent.progress(video); fireEvent.progress(video); fireEvent.ended(video);
  expect(onLoaded).toHaveBeenCalledTimes(1);
});

test("브라우저가 «충분히 받았다»며 받기를 쉬면(suspend · 끝까지 재생 가능) 그때 알린다", () => {
  const onLoaded = vi.fn();
  const view = render(<WaitingArtwork {...props} onLoaded={onLoaded}/>);
  const video = view.container.querySelector("video")!;
  buffer(video, 5, 8, 3);
  fireEvent.suspend(video);
  expect(onLoaded).not.toHaveBeenCalled();
  buffer(video, 5, 8, 4);
  fireEvent.suspend(video);
  expect(onLoaded).toHaveBeenCalledTimes(1);
});

test("받을 영상이 없거나(움직임 줄이기 · 승인 안 된 편) 영상이 실패하면 기다리지 않고 바로 알린다", () => {
  const none = vi.fn(), reduced = vi.fn(), broken = vi.fn();
  render(<WaitingArtwork {...props} video={undefined} onLoaded={none}/>);
  render(<WaitingArtwork {...props} reduced onLoaded={reduced}/>);
  const view = render(<WaitingArtwork {...props} onLoaded={broken}/>);
  expect([none, reduced].map((f) => f.mock.calls.length)).toEqual([1, 1]);
  expect(broken).not.toHaveBeenCalled();
  fireEvent.error(view.container.querySelectorAll("video")[0]);
  expect(broken).toHaveBeenCalledTimes(1);
});

test("대기 화면: 지금 장면 영상을 다 받은 뒤에 다음 장면 영상을 받고, 그것까지 받으면 조판 받기를 연다", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array(4)));
  vi.stubGlobal("fetch", fetchMock);
  const isDone = settled(afterWaitingVideos());
  render(<GenerationWait spinTextRef={{ current: null }}/>);
  const dialog = document.querySelector<HTMLDialogElement>("#spinner")!;
  // 제목 줄은 섞인 장면 순서대로 놓인다 — 두 번째 줄이 다음 장면
  const titles = [...dialog.querySelectorAll(".generation-copy")].map((el) => el.textContent);
  const [current, next] = titles.slice(0, 2).map((title) => waitingSets.find((set) => set.title === title)!.id);
  expect(Number(dialog.dataset.setId)).toBe(current);
  await act(async () => {});
  expect(fetchMock).not.toHaveBeenCalled();
  expect(isDone()).toBe(false);
  const video = dialog.querySelector("video")!;
  buffer(video, 8);
  await act(async () => { fireEvent.progress(video); });
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([approvedWaitingVideo(next)]);   // 지금 장면이 아니라 다음 장면 영상
  expect(isDone()).toBe(true);
});
