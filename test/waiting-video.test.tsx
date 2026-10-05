// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { createRef, StrictMode } from "react";
import WaitingArtwork from "../src/studio/WaitingArtwork";
import GenerationWait from "../src/studio/GenerationWait";
import { approvedWaitingVideo } from "../src/studio/waitingVideo";
import manifest from "../src/studio/waiting-videos.json";

const props = { image: "/studio/waiting-approved-v1/11.webp", theme: "움직임에 생기를", video: "/test-only.mp4", paused: false, reduced: false };
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

test("미제작 항목은 영상 요청 없이 승인 원화를 사용한다", () => {
  for (const item of manifest.filter(entry => entry.status !== "approved")) expect(approvedWaitingVideo(item.id)).toBeUndefined();
  expect(approvedWaitingVideo(99)).toBeUndefined();
  const view = render(<WaitingArtwork {...props} video={undefined}/>);
  expect(view.container.querySelector("video")).toBeNull();
  expect(view.getByAltText(props.theme).getAttribute("src")).toBe(props.image);
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
});
test("실제 playing 전에는 원화가 유지되고 무음·인라인·비반복으로 재생한다", () => {
  const view = render(<WaitingArtwork {...props}/>);
  const video = view.container.querySelector("video")!;
  expect(video.muted).toBe(true); expect(video.playsInline).toBe(true); expect(video.loop).toBe(false);
  expect(video.dataset.active).toBe("false");
  fireEvent.loadedData(video);
  expect(video.dataset.active).toBe("false");
  fireEvent.playing(video);
  expect(video.dataset.active).toBe("true");
  expect(view.getByAltText(props.theme)).toBeTruthy();
});
test("StrictMode의 effect 정리·재실행 뒤에도 재생 소스를 유지한다", () => {
  const view = render(<StrictMode><WaitingArtwork {...props}/></StrictMode>);
  expect(view.container.querySelector('video')!.getAttribute('src')).toBe(props.video);
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
});
test("영상 종료 뒤 재시작하지 않고 마지막 프레임을 유지한다", () => {
  const view = render(<WaitingArtwork {...props}/>);
  const video = view.container.querySelector("video")!;
  fireEvent.playing(video); fireEvent.ended(video);
  act(() => vi.advanceTimersByTime(5000));
  expect(video.dataset.active).toBe("true");
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
});
test("일시 정지는 현재 재생 위치를 보존하며 재개한다", () => {
  const view = render(<WaitingArtwork {...props}/>);
  const video = view.container.querySelector("video")!;
  video.currentTime = 1.2; fireEvent.playing(video);
  view.rerender(<WaitingArtwork {...props} paused/>);
  act(() => vi.advanceTimersByTime(10000));
  expect(video.currentTime).toBe(1.2); expect(video.getAttribute("src")).toBe(props.video);
  view.rerender(<WaitingArtwork {...props}/>);
  expect(video.currentTime).toBe(1.2); expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
});
test("움직임 줄이기는 영상 요소를 만들지 않는다", () => {
  const view = render(<WaitingArtwork {...props} reduced/>);
  expect(view.container.querySelector("video")).toBeNull();
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
});
test("움직임 설정 변경·장면 해제는 재생과 다운로드를 정리한다", () => {
  const view = render(<WaitingArtwork {...props}/>);
  const video = view.container.querySelector("video")!;
  view.rerender(<WaitingArtwork {...props} reduced/>);
  expect(video.hasAttribute("src")).toBe(false);
  expect(HTMLMediaElement.prototype.load).toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
test("움직임 줄이기 해제 후 새 영상의 로드 정체도 감지한다", () => {
  const view = render(<WaitingArtwork {...props}/>);
  fireEvent.playing(view.container.querySelector("video")!);
  view.rerender(<WaitingArtwork {...props} reduced/>);
  view.rerender(<WaitingArtwork {...props}/>);
  expect(view.container.querySelector("video")!.dataset.active).toBe("false");
  act(() => vi.advanceTimersByTime(4000));
  expect(view.container.querySelector("video")).toBeNull();
});
test("자동 재생 거부는 원화로 복구하고 재시도 폭주가 없다", async () => {
  vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(new Error("NotAllowedError"));
  const view = render(<WaitingArtwork {...props}/>);
  await act(async () => {});
  expect(view.container.querySelector("video")).toBeNull();
  expect(view.getByAltText(props.theme)).toBeTruthy();
  act(() => vi.advanceTimersByTime(16000));
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
});
test("미디어 오류는 즉시 원화로 복구한다", () => {
  const view = render(<WaitingArtwork {...props}/>);
  fireEvent.error(view.container.querySelector("video")!);
  expect(view.container.querySelector("video")).toBeNull();
  expect(view.getByAltText(props.theme)).toBeTruthy();
});
test("로드 또는 재생 중 버퍼 정체는 4초 뒤 원화로 복구한다", () => {
  const view = render(<WaitingArtwork {...props}/>);
  const video = view.container.querySelector("video")!;
  fireEvent.playing(video);
  act(() => vi.advanceTimersByTime(4500));
  expect(view.container.querySelector("video")).toBe(video);
  fireEvent.waiting(video);
  act(() => vi.advanceTimersByTime(4000));
  expect(view.container.querySelector("video")).toBeNull();
});
test("처음부터 로드가 멈춘 영상도 4초 뒤 정리한다", () => {
  const view = render(<WaitingArtwork {...props}/>);
  act(() => vi.advanceTimersByTime(4000));
  expect(view.container.querySelector("video")).toBeNull();
});
test("장면 제거 후 늦게 도착하는 play 거부는 새 장면에 영향을 주지 않는다", async () => {
  let reject!: (error: Error) => void;
  vi.mocked(HTMLMediaElement.prototype.play).mockReturnValue(new Promise((_, fail) => { reject = fail; }));
  const view = render(<WaitingArtwork {...props}/>);
  view.unmount();
  await act(async () => { reject(new Error("AbortError")); });
  expect(vi.getTimerCount()).toBe(0);
});
test("숨겨진 탭에서는 세트가 바뀌지 않고 복귀 후 8초에 전환한다", () => {
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  const view = render(<GenerationWait spinTextRef={createRef()} initialSetId={11}/>);
  const id = () => document.getElementById("spinner")!.dataset.setId;
  expect(id()).toBe("11");
  hidden.mockReturnValue(true); fireEvent(document, new Event("visibilitychange"));
  act(() => vi.advanceTimersByTime(24000)); expect(id()).toBe("11");
  hidden.mockReturnValue(false); fireEvent(document, new Event("visibilitychange"));
  act(() => vi.advanceTimersByTime(8000)); expect(id()).not.toBe("11");
  view.unmount(); expect(vi.getTimerCount()).toBe(0);
});
