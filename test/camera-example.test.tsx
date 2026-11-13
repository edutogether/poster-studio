// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi, type MockInstance } from "vitest";
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
let imageComplete: MockInstance<() => boolean>;

beforeEach(() => {
  reduce = false;
  vi.useFakeTimers();
  imageComplete = vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
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

test("4초 동안 재생이 시작되지 않으면 끝 정지 그림을 보이되 영상은 계속 받아, 늦게라도 재생되면 영상으로 넘긴다(10/24)", () => {
  const view = render(<CameraExample {...base} />);
  act(() => vi.advanceTimersByTime(4_000));
  expect(view.container.querySelector(".camera-example-still")!.getAttribute("src")).toBe(fake.endStill);
  const video = view.container.querySelector("video")!;
  expect(video.getAttribute("src")).toBe(fake.src);
  fireEvent.playing(video);
  expect(video.dataset.active).toBe("true");
  expect((view.container.querySelector(".camera-example-still") as HTMLElement).dataset.active).toBe("false");
});

test("재생에 실패해도 2단계를 떠났다 다시 오면 다시 시도한다(10/24 «이전 갔다 와도 안 됨»)", async () => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(new Error("NotAllowedError"));
  const view = render(<CameraExample {...base} />);
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
  expect(view.container.querySelector("video")).toBeNull();
  view.rerender(<CameraExample {...base} offstage />);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  view.rerender(<CameraExample {...base} />);
  expect(view.container.querySelector("video")!.getAttribute("src")).toBe(fake.src);
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

// 예시 영상은 장식이 아니라 «이렇게 서세요» 안내다 — «움직임 줄이기» 신호와 상관없이 언제나 튼다(2026-11-11 Bumm님 «가. 늘 돌게 하기», 팀장 전달).
// 원격으로 연 PC의 크롬이 사람이 켠 적 없는 이 신호를 보고해 개인 · 단체 예시가 끝 정지 그림으로 멈춰 있었다.
test("움직임 줄이기여도 영상을 재생하고 정지 그림은 첫 프레임이다", () => {
  reduce = true;
  const view = render(<CameraExample {...base} />);
  expect(view.container.querySelector("video")!.getAttribute("src")).toBe(fake.src);
  expect(view.container.querySelector(".camera-example-still")!.getAttribute("src")).toBe(fake.still);
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
});

// 1단계에 있는 동안 2단계 영상 요소를 미리 연다(2026-11-07 Bumm님 «넘기면 처음에 좀 딜레이되었다 시작», 팀장 전달).
const step1 = { ...base, offstage: true, prefetch: true };
const idle = () => act(() => vi.advanceTimersByTime(200));   // jsdom에는 requestIdleCallback이 없어 200ms 타이머로 간다
const saveData = () => vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { connection: { saveData: true } }));

test("1단계는 페이지가 한가해진 뒤 주소만 건다 — 재생 · 소리 없음, 정지 그림 그대로", () => {
  const view = render(<CameraExample {...step1} />);
  const video = view.container.querySelector("video")!;
  expect(video.getAttribute("src")).toBeNull();
  idle();
  expect(video.getAttribute("src")).toBe(fake.src);
  expect(video.preload).toBe("auto");
  fireEvent.loadedData(video);
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  expect(video.dataset.active).toBe("false");
  expect((view.container.querySelector(".camera-example-still") as HTMLElement).dataset.active).toBe("true");
});

test("2단계로 넘어가면 같은 요소가 받던 것을 이어 받아 재생한다 — 다시 받지 않는다", () => {
  const view = render(<CameraExample {...step1} />);
  const video = view.container.querySelector("video")!;
  idle();
  let assigned = 0;
  Object.defineProperty(video, "src", { configurable: true, get: () => video.getAttribute("src") ?? "", set: (value: string) => { assigned++; video.setAttribute("src", value); } });
  view.rerender(<CameraExample {...base} />);
  expect(view.container.querySelector("video")).toBe(video);
  expect(assigned).toBe(0);
  expect(HTMLMediaElement.prototype.load).not.toHaveBeenCalled();
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  expect(video.muted).toBe(false);
  fireEvent.playing(video);
  expect(video.dataset.active).toBe("true");
});

test("주소를 걸기 전에 넘어가도 2단계에서 바로 걸고, 예약해 둔 것은 두 번 걸지 않는다", () => {
  const view = render(<CameraExample {...step1} />);
  const video = view.container.querySelector("video")!;
  let assigned = 0;
  Object.defineProperty(video, "src", { configurable: true, get: () => video.getAttribute("src") ?? "", set: (value: string) => { assigned++; video.setAttribute("src", value); } });
  view.rerender(<CameraExample {...base} />);
  expect(video.getAttribute("src")).toBe(fake.src);
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  idle();
  expect(assigned).toBe(1);
});

test("미리 받다 오류가 나도 1단계에서는 실패로 굳히지 않고, 2단계에서 다시 받는다", () => {
  const view = render(<CameraExample {...step1} />);
  const video = view.container.querySelector("video")!;
  idle();
  Object.defineProperty(video, "error", { configurable: true, get: () => ({ code: 2 }) });
  fireEvent.error(video);
  expect(view.container.querySelector("video")).toBe(video);
  let assigned = 0;
  Object.defineProperty(video, "src", { configurable: true, get: () => video.getAttribute("src") ?? "", set: (value: string) => { assigned++; video.setAttribute("src", value); } });
  view.rerender(<CameraExample {...base} />);
  expect(assigned).toBe(1);
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  expect(view.container.querySelector(".camera-example-still")!.getAttribute("src")).toBe(fake.still);
});

test("1단계에서 혼자 · 단체를 바꾸면 받던 것을 끊고 고른 영상으로 바꾼다", () => {
  const other = { ...fake, mode: "solo" as const, src: "/test-other.mp4" };
  const view = render(<CameraExample {...step1} />);
  const video = view.container.querySelector("video")!;
  idle();
  view.rerender(<CameraExample {...step1} mode="solo" video={other} />);
  expect(video.getAttribute("src")).toBeNull();
  expect(HTMLMediaElement.prototype.load).toHaveBeenCalledTimes(1);
  idle();
  expect(video.getAttribute("src")).toBe(other.src);
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
});

test("2단계에서 1단계로 돌아오면 멈춰 처음으로 되감고 정지 그림을 보인다 — 다시 오면 처음부터", () => {
  const view = render(<CameraExample {...base} prefetch={false} />);
  const video = view.container.querySelector("video")!;
  fireEvent.playing(video);
  video.currentTime = 3;
  view.rerender(<CameraExample {...step1} />);
  expect(view.container.querySelector("video")).toBe(video);
  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  expect(video.currentTime).toBe(0);
  expect((view.container.querySelector(".camera-example-still") as HTMLElement).dataset.active).toBe("true");
  view.rerender(<CameraExample {...base} prefetch={false} />);
  expect(video.dataset.active).toBe("false");
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
});

test("1단계를 떠나 다른 단계로 가면 영상 요소를 내려 다운로드를 끊는다", () => {
  const view = render(<CameraExample {...step1} />);
  const video = view.container.querySelector("video")!;
  idle();
  view.rerender(<CameraExample {...base} offstage prefetch={false} />);
  expect(view.container.querySelector("video")).toBeNull();
  expect(video.getAttribute("src")).toBeNull();
  expect(HTMLMediaElement.prototype.load).toHaveBeenCalled();
});

test("움직임 줄이기여도 1단계에 미리 받는다 — 데이터 절약 · 카메라 켬에서는 받지 않는다", () => {
  reduce = true;
  const a = render(<CameraExample {...step1} />);
  idle();
  expect(a.container.querySelector("video")!.getAttribute("src")).toBe(fake.src);
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  a.unmount();
  reduce = false;
  const b = render(<CameraExample {...step1} hidden />);
  expect(b.container.querySelector("video")).toBeNull();
  b.unmount();
  saveData();
  const c = render(<CameraExample {...step1} />);
  expect(c.container.querySelector("video")).toBeNull();
  // 데이터 절약이어도 2단계는 지금처럼 재생한다
  c.rerender(<CameraExample {...base} />);
  expect(c.container.querySelector("video")!.getAttribute("src")).toBe(fake.src);
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
});

test("설치판은 미리 받지 않는다", async () => {
  vi.resetModules();
  vi.doMock("../src/desktop", () => ({ DESKTOP: true }));
  const { cameraPrefetchAllowed } = await import("../src/studio/cameraPrefetch");
  expect(cameraPrefetchAllowed()).toBe(false);
  vi.doUnmock("../src/desktop");
  vi.resetModules();
});

test("문서 · 그림 · 글꼴을 하나라도 받는 중이면 기다리고, 다 받으면 시작한다", async () => {
  const { whenPageIdle } = await import("../src/studio/cameraPrefetch");
  const poster = document.body.appendChild(document.createElement("img"));
  const state = vi.spyOn(document, "readyState", "get");
  const pending = [
    () => state.mockReturnValue("loading"),
    () => { imageComplete.mockReturnValue(false); },
    () => { Object.defineProperty(document, "fonts", { configurable: true, value: { status: "loading" } }); },
  ];
  for (const hold of pending) {
    const run = vi.fn();
    hold();
    whenPageIdle(run);
    act(() => vi.advanceTimersByTime(5_000));
    expect(run).not.toHaveBeenCalled();
    state.mockReturnValue("complete");
    imageComplete.mockReturnValue(true);
    Reflect.deleteProperty(document, "fonts");
    act(() => vi.advanceTimersByTime(450));   // 다음 확인(250ms) + 한가할 때(200ms)
    expect(run).toHaveBeenCalledTimes(1);
  }
  state.mockRestore();
  poster.remove();
});

test("첫 화면 그림이 20초 넘게 안 끝나도 시작하고, 떠나면 예약을 취소한다", async () => {
  const { whenPageIdle } = await import("../src/studio/cameraPrefetch");
  const poster = document.body.appendChild(document.createElement("img"));
  imageComplete.mockReturnValue(false);
  const run = vi.fn();
  whenPageIdle(run);
  act(() => vi.advanceTimersByTime(19_000));
  expect(run).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1_500));
  expect(run).toHaveBeenCalledTimes(1);
  const later = vi.fn();
  const stop = whenPageIdle(later);
  stop();
  act(() => vi.advanceTimersByTime(30_000));
  expect(later).not.toHaveBeenCalled();
  poster.remove();
});

// 영상을 만든 도구의 로고(2026-11-12 Bumm님 «안 1», 팀장 전달): 영상에 굽지 않고 칸의 보이는 오른쪽 위에 앱이 얹는다.
// 크기는 그림 파일의 폭(1920 영상 기준의 3배)을 읽어 정하므로 그림 파일만 바꾸면 된다 — 화면 크기마다 칸 안에 다 보이는지는 실제 브라우저 캡처로 봤다.
test("로고는 승인된 영상이 있을 때만 칸에 얹고, 카메라를 켜면 숨기며, 크기는 그림 폭에서 읽는다", () => {
  const view = render(<CameraExample {...base} />);
  const logo = view.container.querySelector<HTMLImageElement>("img.camera-example-logo")!;
  expect(logo).not.toBeNull();
  const mark = logo.parentElement!;   // 칸을 꽉 채운 틀 — 무대(칸보다 큼) 밖, 칸 바로 아래 자식
  expect(mark.className).toBe("camera-example-mark");
  expect(mark.parentElement!.querySelector(":scope > .camera-example-stage")).not.toBeNull();
  expect(logo.getAttribute("alt")).toBe("");
  expect(mark.getAttribute("aria-hidden")).toBe("true");
  expect(mark.hidden).toBe(false);
  expect(logo.getAttribute("style")).toBeNull();   // 폭을 읽기 전에는 숨김(studio.css :not([style]))
  vi.spyOn(logo, "naturalWidth", "get").mockReturnValue(840);
  fireEvent.load(logo);
  expect(logo.style.getPropertyValue("--logo-px")).toBe("140");
  view.rerender(<CameraExample {...base} hidden />);
  expect(mark.hidden).toBe(true);
  view.rerender(<CameraExample {...base} offstage />);
  expect(mark.hidden).toBe(false);
  view.rerender(<CameraExample mode="group" hidden={false} offstage={false} />);
  expect(view.container.querySelector(".camera-example-logo")).toBeNull();
});

test("로고 그림은 파일 하나이고, 화면 크기 · 여백은 그 그림 폭에 영상이 칸을 덮는 배율을 곱한다", () => {
  const png = fs.readFileSync(path.join("src", "studio", "camera-logo.png"));
  expect(png.subarray(1, 4).toString()).toBe("PNG");
  expect(png.readUInt8(25)).toBe(6);   // 투명 바탕(RGBA)
  expect(png.readUInt32BE(16)).toBe(840);   // 영상 기준 140px의 6배(11/13 흰 Higgsfield 로고 · «50» — 처음 280px의 절반)
  const css = fs.readFileSync(path.join("src", "studio.css"), "utf8");
  expect(css).toContain("width: calc(var(--logo-px, 0) * max(100cqw / 1920, 100cqh / 1080))");
  expect(css).toContain("top: max(100cqw * 17 / 1920, 100cqh * 17 / 1080); right: max(100cqw * 17 / 1920, 100cqh * 17 / 1080);");
  expect(css).toContain(".cameraBox > .camera-example-mark { position: absolute; inset: 0; container-type: size; pointer-events: none; }");
  expect(css).toContain(".camera-example-mark > .camera-example-logo:not([style]) { visibility: hidden; }");
  const source = fs.readFileSync(path.join("src", "studio", "CameraExample.tsx"), "utf8");
  expect(source).toContain('import CAMERA_LOGO from "./camera-logo.png";');
  expect(source).toContain("const LOGO_DENSITY = 6;");
});
