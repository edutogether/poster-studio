// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import CameraExample from "../src/studio/CameraExample";
import { activeCues, approvedCameraVideo, type ApprovedCameraVideo, type CameraCue } from "../src/studio/cameraVideo";
import manifest from "../src/studio/camera-videos.json";

// 촬영 화면 예시 영상 연결 부품(2026-10-16). 동작은 가짜 항목으로 고정하고, 실제 목록(10/19 장착)은 파일 해시로 따로 본다.
const cues: CameraCue[] = [
  { kind: "say", from: 2, to: 3.5, text: "여기 서 볼까?", x: 40, y: 12 },
  { kind: "count", from: 7, to: 7.5, text: "3" },
  { kind: "count", from: 7.5, to: 8, text: "2" },
  { kind: "count", from: 8, to: 8.5, text: "1" },
];
const fake: ApprovedCameraVideo = {
  mode: "group", status: "approved", src: "/test-only.mp4", sha256: "0".repeat(64), bytes: 1,
  still: "/test-only.webp", stillSha256: "0".repeat(64), endStill: "/test-only-end.webp", endStillSha256: "0".repeat(64), duration: 12, cues,
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
    expect(sha(path.join(pub, item.endStill!))).toBe(item.endStillSha256);
    expect(item.endStillSha256).not.toBe(item.stillSha256);
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
  // 폴더에는 목록이 가리키는 파일만 — 옛 영상이 남아 배포되지 않게(대기 영상과 같은 규칙)
  const listed = manifest.filter(entry => entry.status === "approved").flatMap(entry => [entry.src!, entry.still!, entry.endStill!]);
  const dir = path.join(pub, "studio", "camera-v1");
  const present = fs.existsSync(dir) ? fs.readdirSync(dir).map(name => `/studio/camera-v1/${name}`) : [];
  expect(new Set(present)).toEqual(new Set(listed));
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
  expect(still.getAttribute("src")).toBe(fake.still);
  fireEvent.playing(video);
  expect(video.dataset.active).toBe("true"); expect(still.dataset.active).toBe("false");
});

test("1단계에서도 정지 그림은 첫 프레임 — 2단계로 들어올 때 그림 주소가 바뀌지 않는다", () => {
  // 10/20 Bumm님 «개인 촬영 영상이 시작할 때 사진이 잠깐 뜬다»: 1단계(offstage)에 끝 정지 그림을 두면 2단계로 오는 순간 주소가 첫 프레임으로 바뀌고,
  // 첫 프레임을 다 받기 전까지 브라우저가 옛 그림(끝 정지 그림)을 그린다 — 처음 방문 390에서 약 180ms(camera-entry-frames.mjs).
  const view = render(<CameraExample {...base} offstage />);
  const still = view.container.querySelector(".camera-example-still") as HTMLImageElement;
  expect(still.getAttribute("src")).toBe(fake.still);
  view.rerender(<CameraExample {...base} />);
  expect(still.getAttribute("src")).toBe(fake.still);
  view.rerender(<CameraExample {...base} hidden />);
  expect(still.getAttribute("src")).toBe(fake.still);
});

test("소리 있는 재생이 거부되면 소리 없이, 그것도 거부되면 끝 정지 그림으로", async () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(new Error("NotAllowedError"));
  const view = render(<CameraExample {...base} />);
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
  expect(play).toHaveBeenCalledTimes(2);
  expect(view.container.querySelector("video")).toBeNull();
  const still = view.container.querySelector(".camera-example-still") as HTMLImageElement;
  expect(still.dataset.active).toBe("true");
  expect(still.getAttribute("src")).toBe(fake.endStill);
});

test("4초 동안 재생이 시작되지 않으면 끝 정지 그림으로 돌아간다", () => {
  const view = render(<CameraExample {...base} />);
  act(() => vi.advanceTimersByTime(4_000));
  expect(view.container.querySelector("video")).toBeNull();
  expect(view.container.querySelector(".camera-example-still")!.getAttribute("src")).toBe(fake.endStill);
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
  expect(view.container.querySelector(".camera-example-still")!.getAttribute("src")).toBe(fake.endStill);
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
});
