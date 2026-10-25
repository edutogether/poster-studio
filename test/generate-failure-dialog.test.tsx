// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import GenerateFailureDialog from "../src/studio/GenerateFailureDialog";
import type { GenerateFailure } from "../src/generateFailure";

// «포스터를 만들지 못했어요» 안내 창(2026-10-16, 2026-10-17 Bumm님 피드백): 단추는 늘 두 개·같은 크기·아이콘,
// 진행자용 원인은 화면에 없다, 창의 줄 구성(제목·문구·상태 줄·단추 줄)은 종류와 상관없이 같다.
beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

const show = (failure: GenerateFailure | null, online = true) => {
  const handlers = { onRetry: vi.fn(), onRetake: vi.fn(), onEditInputs: vi.fn(), onHome: vi.fn() };
  const view = render(<GenerateFailureDialog failure={failure} online={online} {...handlers} />);
  const buttons = () => [...view.container.querySelectorAll("button")].map(b => `${b.textContent}${b.disabled ? "(꺼짐)" : ""}`);
  return { view, buttons, ...handlers };
};
const shape = (view: ReturnType<typeof render>) => [...view.container.querySelector(".generate-failure-dialog")!.children].map(el => el.tagName + (el.className ? "." + el.className : ""));

test("실패가 없거나 부스 코드 실패면 그리지 않는다(부스 코드는 입력 창이 맡는다)", () => {
  expect(show(null).view.container.innerHTML).toBe("");
  cleanup();
  expect(show({ action: "booth", message: "x" }).view.container.innerHTML).toBe("");
});

test("모든 종류가 단추 두 개·아이콘·같은 줄 구성이고, 진행자용 원인은 화면에 없다", () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const kinds: GenerateFailure[] = [
    { action: "retry", message: "그림을 다 그리지 못했어요.", staffNote: "응답 504" },
    { action: "wait", waitSeconds: 3, message: "지금 만드는 사람이 많아요.", staffNote: "x" },
    { action: "fix", message: "내용을 바꾸거나 다시 찍어 볼까요 ?", staffNote: "x" },
    { action: "retake", message: "이 사진으로는 더 만들 수 없어요.", staffNote: "x" },
    { action: "offline", message: "인터넷 연결이 끊겼어요." },
    { action: "staff", message: "지금은 만들 수 없어요.", staffNote: "오늘의 생성 한도에 도달했습니다." },
  ];
  const shapes = new Set<string>();
  for (const f of kinds) {
    const { view } = show(f, false);
    const buttons = view.container.querySelectorAll("button");
    expect(buttons, f.action).toHaveLength(2);
    for (const b of buttons) expect(b.querySelector("svg.studio-icon"), `${f.action}: ${b.textContent}`).not.toBeNull();
    expect(view.container.textContent, f.action).not.toContain("진행자");
    expect(view.container.textContent, f.action).not.toContain("선생님을 불러 주세요");
    shapes.add(shape(view).join(","));
    cleanup();
  }
  expect([...shapes], "창의 줄 구성이 종류마다 같아야 한다").toHaveLength(1);
});

test("다시 하면 될 수 있는 실패: «다시 찍기» · «다시 만들기»", () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const { view, buttons, onRetry, onRetake } = show({ action: "retry", message: "그림을 다 그리지 못했어요.", staffNote: "응답 504" });
  expect(buttons()).toEqual(["다시 찍기", "다시 만들기"]);
  expect(console.warn).toHaveBeenCalledWith("[포스터 생성 실패]", "응답 504");
  fireEvent.click(view.getByText("다시 만들기")); fireEvent.click(view.getByText("다시 찍기"));
  expect(onRetry).toHaveBeenCalledTimes(1); expect(onRetake).toHaveBeenCalledTimes(1);
});

test("기다렸다 다시: 초를 센 뒤에 «다시 만들기»가 켜진다", () => {
  const { buttons } = show({ action: "wait", waitSeconds: 3, message: "지금 만드는 사람이 많아요." });
  expect(buttons()).toEqual(["다시 찍기", "다시 만들기 (3초)(꺼짐)"]);
  act(() => vi.advanceTimersByTime(2_000));
  expect(buttons()).toEqual(["다시 찍기", "다시 만들기 (1초)(꺼짐)"]);
  act(() => vi.advanceTimersByTime(1_000));
  expect(buttons()).toEqual(["다시 찍기", "다시 만들기"]);
});

test("안전 기준: «다시 찍기» · «제목 · 문구 고치기»", () => {
  const { view, buttons, onEditInputs } = show({ action: "fix", message: "내용을 바꾸거나 다시 찍어 볼까요 ?" });
  expect(buttons()).toEqual(["다시 찍기", "제목 · 문구 고치기"]);
  fireEvent.click(view.getByText("제목 · 문구 고치기"));
  expect(onEditInputs).toHaveBeenCalled();
});

test("사진별 한도: «처음으로» · «다시 찍기»", () => {
  const { view, buttons, onHome, onRetake } = show({ action: "retake", message: "이 사진으로는 더 만들 수 없어요." });
  expect(buttons()).toEqual(["처음으로", "다시 찍기"]);
  fireEvent.click(view.getByText("처음으로")); fireEvent.click(view.getByText("다시 찍기"));
  expect(onHome).toHaveBeenCalledTimes(1); expect(onRetake).toHaveBeenCalledTimes(1);
});

test("인터넷 끊김: 확인하는 동안 점이 돌고, 연결될 때까지 «다시 만들기»가 꺼져 있다", () => {
  const failure: GenerateFailure = { action: "offline", message: "인터넷 연결이 끊겼어요." };
  const { view, buttons } = show(failure, false);
  const state = () => view.container.querySelector(".generate-failure-state")!.textContent;
  expect(buttons()).toEqual(["다시 찍기", "다시 만들기(꺼짐)"]);
  const seen = [state()];
  for (let i = 0; i < 4; i++) { act(() => vi.advanceTimersByTime(500)); seen.push(state()); }
  expect(seen).toEqual(["인터넷 연결을 확인하는 중", "인터넷 연결을 확인하는 중.", "인터넷 연결을 확인하는 중..", "인터넷 연결을 확인하는 중...", "인터넷 연결을 확인하는 중"]);
  view.rerender(<GenerateFailureDialog failure={failure} online onRetry={vi.fn()} onRetake={vi.fn()} onEditInputs={vi.fn()} onHome={vi.fn()} />);
  expect(buttons()).toEqual(["다시 찍기", "다시 만들기"]);
  expect(state()).toBe("인터넷이 다시 연결됐어요.");
});
