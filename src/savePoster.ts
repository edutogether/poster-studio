/* 휴대폰 3단계 «내 휴대폰에 저장»(2026-10-17 팀장 설계 ⑪). 휴대폰에서 인쇄는 쓸모가 없으니
   파일 공유(Web Share — 사진 앱에 저장)를 먼저 쓰고, 공유를 못 하는 브라우저는 PNG로 내려받는다.
   파일 이름은 앱 이름 규칙 «Poster Studio_영화제목.png». 그림은 사용자 기기 안에서만 오간다(서버로 보내지 않는다). */
import { DEFAULT_MOVIE_TITLE } from "./defaults.js";

export type SaveResult = "shared" | "downloaded" | "cancelled" | "failed";

/** 파일 이름에 쓸 수 없는 글자(\ / : * ? " < > |)와 줄바꿈을 지우고, 비면 기본 제목을 쓴다. */
export function posterFileName(title: string): string {
  const clean = title.replace(/[\\/:*?"<>|\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  return `Poster Studio_${clean || DEFAULT_MOVIE_TITLE}.png`;
}

export async function savePoster(canvas: HTMLCanvasElement, title: string): Promise<SaveResult> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return "failed";
  const name = posterFileName(title);
  const file = new File([blob], name, { type: "image/png" });
  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return "shared";
    } catch (error) {
      // 사람이 공유 창을 닫은 것은 실패가 아니다 — 내려받기로 넘어가지 않는다.
      if ((error as Error)?.name === "AbortError") return "cancelled";
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded";
}
