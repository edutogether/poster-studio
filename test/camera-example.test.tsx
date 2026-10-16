// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import CameraExample from "../src/studio/CameraExample";
import { activeCues, approvedCameraVideo, type ApprovedCameraVideo, type CameraCue } from "../src/studio/cameraVideo";
import manifest from "../src/studio/camera-videos.json";

// 촬영 화면 예시 영상 연결 부품(2026-10-16). 영상 파일은 Bumm님 판정 뒤에 들어오므로, 여기서는 가짜 항목으로 동작을 고정한다.
const cues: CameraCue[] = [
  { kind: "say", from: 2, to: 3.5, text: "여기 서 볼까?", x: 40, y: 12 },
  { kind: "count", from: 7, to: 7.5, text: "3" },
  { kind: "count", from: 7.5, to: 8, text: "2" },
  { kind: "count", from: 8, to: 8.5, text: "1" },
];
const fake: ApprovedCameraVideo = {
  mode: "group", status: "approved", src: "/test-only.mp4", sha256: "0".repeat(64), bytes: 1,
  still: "/test-only.webp", stillSha256: "0".repeat(64), duration: 12, cues,
};
const base = { mode: "group", video: fake, hidden: false, offstage: false };
let reduce = false;
beforeEach(() => {
  reduce = false;
  vi.useFakeTimers();
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduce && q.includes("reduce"), addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => window.setTimeout(() => cb(performance.now()), 16));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

test("승인 전에는 지금 정지 그림 그대로다 — 영상 요청 0", () => {
  for (const mode of ["solo", "group"]) {
    const item = manifest.find(entry => entry.mode === mode);
    expect(item, `${mode} 항목`).toBeTruthy();
    if (item!.status !== "approved") expect(approvedCameraVideo(mode)).toBeUndefined();
  }
  const view = render(<CameraExample mode="solo" hidden={false} offstage={false} />);
  const img = view.container.querySelector("img")!;
  expect(img.className).toBe("camera-example");
  expect(img.getAttribute("src")).toBe("/studio/camera-student.webp");
  expect(img.getAttribute("alt")).toBe("얼굴과 어깨를 담고 편하게 웃는 촬영 구도 예시");
  view.rerender(<CameraExample mode="group" hidden offstage={false} />);
  expect(img.className).toBe("camera-example camera-example-group");
  expect(img.getAttribute("src")).toBe("/studio/camera-group.webp");
  expect(img.hidden).toBe(true);
  expect(view.container.querySelector("video")).toBeNull();
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
});

test("승인 항목은 파일 해시·크기·정지 그림·신호 위치가 맞아야 연결된다", () => {
  const pub = path.resolve("public");
  const sha = (p: string) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  for (const item of manifest.filter(entry => entry.status === "approved")) {
    const ok = approvedCameraVideo(item.mode);
    expect(ok, `${item.mode}: 이름에 해시 12자리`).toBeTruthy();
    const file = path.join(pub, item.src!);
    expect(fs.existsSync(file), item.src!).toBe(true);
    expect(sha(file)).toBe(item.sha256);
    expect(fs.statSync(file).size).toBe(item.bytes);
    expect(sha(path.join(pub, item.still!))).toBe(item.stillSha256);
    for (const cue of item.cues as CameraCue[]) {
      expect(cue.from).toBeGreaterThanOrEqual(0);
      expect(cue.to).toBeGreaterThan(cue.from);
      expect(cue.to).toBeLessThanOrEqual(item.duration);
      if (cue.kind === "count") expect(["3", "2", "1"]).toContain(cue.text);
      else {
        // 말풍선은 위 20% 띠 안, 사람이 서는 가운데 62% 안(camera-example-videos.md «자막 위치»)
        expect(cue.y).toBeGreaterThan(0); expect(cue.y).toBeLessThanOrEqual(20);
        expect(cue.x).toBeGreaterThanOrEqual(19); expect(cue.x).toBeLessThanOrEqual(81);
        expect(cue.text.trim()).not.toBe("");
      }
    }
  }
  expect(approvedCameraVideo("nobody")).toBeUndefined();
});

test("신호는 from 이상 to 미만에만 보인다", () => {
  expect(activeCues(cues, 1.99)).toEqual([]);
  expect(activeCues(cues, 2).map(c => c.text)).toEqual(["여기 서 볼까?"]);
  expect(activeCues(cues, 7.49).map(c => c.text)).toEqual(["3"]);
  expect(activeCues(cues, 7.5).map(c => c.text)).toEqual(["2"]);
  expect(activeCues(cues, 8.5)).toEqual([]);
});

test("실제 playing 전에는 정지 그림을 유지하고, 소리를 켠 채 인라인·한 번 재생한다", () => {
  const view = render(<CameraExample {...base} />);
  const video = view.container.querySelector("video")!;
  const still = view.container.querySelector(".camera-example-still") as HTMLImageElement;
  expect(video.getAttribute("src")).toBe(fake.src);
  expect(video.muted).toBe(false); expect(video.playsInline).toBe(true); expect(video.loop).toBe(false);
  expect(still.dataset.active).toBe("true"); expect(video.dataset.active).toBe("false");
  fireEvent.playing(video);
  expect(video.dataset.active).toBe("true"); expect(still.dataset.active).toBe("false");
});

test("소리 있는 재생이 거부되면 소리 없이, 그것도 거부되면 정지 그림으로", async () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(new Error("NotAllowedError"));
  const view = render(<CameraExample {...base} />);
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
  expect(play).toHaveBeenCalledTimes(2);
  expect(view.container.querySelector("video")).toBeNull();
  expect((view.container.querySelector(".camera-example-still") as HTMLImageElement).dataset.active).toBe("true");
});

test("4초 동안 재생이 시작되지 않으면 정지 그림으로 돌아간다", () => {
  const view = render(<CameraExample {...base} />);
  act(() => vi.advanceTimersByTime(4_000));
  expect(view.container.querySelector("video")).toBeNull();
});

test("숫자·말풍선은 영상 시각에 맞춰 얹고, 끝나면 지운다(다시 재생하지 않음)", () => {
  const view = render(<CameraExample {...base} />);
  const video = view.container.querySelector("video")!;
  fireEvent.playing(video);
  video.currentTime = 2.4; act(() => vi.advanceTimersByTime(20));
  const say = view.container.querySelector(".camera-example-say") as HTMLElement;
  expect(say.textContent).toBe("여기 서 볼까?");
  expect(say.style.left).toBe("40%"); expect(say.style.top).toBe("12%");
  video.currentTime = 7.6; act(() => vi.advanceTimersByTime(20));
  expect(view.container.querySelector(".camera-example-say")).toBeNull();
  expect(view.container.querySelector(".camera-example-count")!.textContent).toBe("2");
  Object.defineProperty(video, "ended", { configurable: true, get: () => true });
  fireEvent.ended(video); act(() => vi.advanceTimersByTime(20));
  expect(view.container.querySelector(".camera-example-count")).toBeNull();
  expect(video.dataset.active).toBe("true");
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
});

test("카메라를 켜거나 2단계를 떠나면 영상 요소를 내려 소리·다운로드를 정리한다", () => {
  const view = render(<CameraExample {...base} />);
  expect(view.container.querySelector("video")).not.toBeNull();
  view.rerender(<CameraExample {...base} hidden />);
  expect(view.container.querySelector("video")).toBeNull();
  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  view.rerender(<CameraExample {...base} offstage />);
  expect(view.container.querySelector("video")).toBeNull();
  view.rerender(<CameraExample {...base} />);
  expect(view.container.querySelector("video")!.getAttribute("src")).toBe(fake.src);
});

test("움직임 줄이기는 영상 요소를 만들지 않는다", () => {
  reduce = true;
  const view = render(<CameraExample {...base} />);
  expect(view.container.querySelector("video")).toBeNull();
  expect(view.container.querySelector(".camera-example-still")).not.toBeNull();
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
});
