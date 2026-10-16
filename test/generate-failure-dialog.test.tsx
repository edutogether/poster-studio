// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import GenerateFailureDialog from "../src/studio/GenerateFailureDialog";
import type { GenerateFailure } from "../src/generateFailure";

// «포스터를 만들지 못했어요» 안내 창(2026-10-16): 실패 종류마다 다음 단추가 다르다.
beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

const show = (failure: GenerateFailure | null, online = true) => {
  const handlers = { onRetry: vi.fn(), onRetake: vi.fn(), onEditInputs: vi.fn() };
  const view = render(<GenerateFailureDialog failure={failure} online={online} {...handlers} />);
  const buttons = () => [...view.container.querySelectorAll("button")].map(b => `${b.textContent}${b.disabled ? "(꺼짐)" : ""}`);
  return { view, buttons, ...handlers };
};

test("실패가 없거나 부스 코드 실패면 그리지 않는다(부스 코드는 입력 창이 맡는다)", () => {
  expect(show(null).view.container.innerHTML).toBe("");
  cleanup();
  expect(show({ action: "booth", message: "x" }).view.container.innerHTML).toBe("");
});

test("다시 하면 될 수 있는 실패: «다시 만들기»가 바로 켜지고 «다시 찍기»도 있다", () => {
  const { view, buttons, onRetry, onRetake } = show({ action: "retry", message: "그림을 다 그리지 못했어요.", staffNote: "응답 504" });
  expect(view.getByRole("alertdialog")).toBeTruthy();
  expect(buttons()).toEqual(["다시 찍기", "다시 만들기"]);
  expect(view.getByText("진행자 확인용: 응답 504")).toBeTruthy();
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

test("안전 기준: «제목·문구 고치기»와 «다시 찍기», 다시 만들기는 없다", () => {
  const { view, buttons, onEditInputs } = show({ action: "fix", message: "안전 기준에 걸렸어요." });
  expect(buttons()).toEqual(["다시 찍기", "제목·문구 고치기"]);
  fireEvent.click(view.getByText("제목·문구 고치기"));
  expect(onEditInputs).toHaveBeenCalled();
});

test("사진별 한도: «다시 찍기»만", () => {
  expect(show({ action: "retake", message: "다시 찍어 주세요." }).buttons()).toEqual(["다시 찍기"]);
});

test("인터넷 끊김: 연결될 때까지 «다시 만들기»가 꺼져 있다", () => {
  const failure: GenerateFailure = { action: "offline", message: "인터넷 연결이 끊겼어요." };
  const { view, buttons } = show(failure, false);
  expect(buttons()).toEqual(["다시 찍기", "다시 만들기(꺼짐)"]);
  expect(view.getByText("인터넷 연결을 확인하는 중…")).toBeTruthy();
  view.rerender(<GenerateFailureDialog failure={failure} online onRetry={vi.fn()} onRetake={vi.fn()} onEditInputs={vi.fn()} />);
  expect(buttons()).toEqual(["다시 찍기", "다시 만들기"]);
});

test("현장에서 못 푸는 실패: 선생님을 부르라고 하고, 원인을 진행자용으로 보인다", () => {
  const { view } = show({ action: "staff", message: "지금은 만들 수 없어요.", staffNote: "오늘의 생성 한도에 도달했습니다." });
  expect(view.getByText("선생님을 불러 주세요.")).toBeTruthy();
  expect(view.getByText("진행자 확인용: 오늘의 생성 한도에 도달했습니다.")).toBeTruthy();
});
