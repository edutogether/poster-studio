// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import BoothCodeDialog from "../src/studio/BoothCodeDialog";

// 부스 코드 입력 창(2026-10-16): 닫혀 있으면 아무것도 그리지 않고, 맞는 코드만 부모에게 넘긴다.
afterEach(() => cleanup());

const setup = (verify: (code: string) => Promise<"ok" | "wrong" | "format" | "offline" | "error">) => {
  const onSaved = vi.fn(), onClose = vi.fn();
  const view = render(<BoothCodeDialog open verify={verify} onSaved={onSaved} onClose={onClose} />);
  const input = view.getByLabelText("부스 코드") as HTMLInputElement;
  return { view, input, onSaved, onClose };
};
const submit = async (view: ReturnType<typeof render>) => { await act(async () => { fireEvent.submit(view.container.querySelector("form")!); }); };

test("닫혀 있으면 그리지 않는다", () => {
  const view = render(<BoothCodeDialog open={false} verify={vi.fn()} onSaved={vi.fn()} onClose={vi.fn()} />);
  expect(view.container.innerHTML).toBe("");
});

test("맞는 코드는 앞뒤 빈칸을 떼고 부모에게 넘긴다", async () => {
  const verify = vi.fn(async () => "ok" as const);
  const { view, input, onSaved } = setup(verify);
  expect(document.activeElement).toBe(input);
  input.value = "  INKY-2026-ABCD "; await submit(view);
  expect(verify).toHaveBeenCalledWith("INKY-2026-ABCD");
  expect(onSaved).toHaveBeenCalledWith("INKY-2026-ABCD");
});

test("틀림·형식·오프라인·오류는 넘기지 않고 이유를 보인다", async () => {
  for (const [result, text] of [["wrong", "코드가 맞지 않아요"], ["format", "4~64자"], ["offline", "인터넷 연결"], ["error", "잠시 후"]] as const) {
    const { view, input, onSaved } = setup(async () => result);
    input.value = "x"; await submit(view);
    expect(onSaved).not.toHaveBeenCalled();
    expect(view.getByRole("alert").textContent).toContain(text);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    cleanup();
  }
});

test("«취소» 단추와 Esc는 취소(onClose)를 부른다 — 문구는 10/17 Bumm님 확정 문구", async () => {
  const { view, onClose } = setup(async () => "ok");
  expect(view.getByRole("dialog").textContent).toContain("행사 부스 진행용 기기에서만 접속할 수 있어요. 운영자에게 받은 코드를 한 번만 넣으면 이 기기를 기억할게요.");
  const [cancel, ok] = [...view.container.querySelectorAll(".booth-code-actions button")];
  expect([cancel.textContent, ok.textContent]).toEqual(["취소", "확인"]);   // 왼쪽 취소 · 오른쪽 확인
  fireEvent.click(view.getByText("취소"));
  fireEvent.keyDown(view.getByRole("dialog"), { key: "Escape" });
  expect(onClose).toHaveBeenCalledTimes(2);
});
