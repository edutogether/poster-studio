/* 휴대폰 3단계 «내 휴대폰에 저장»(2026-10-17 팀장 설계 ⑪). 휴대폰에서 인쇄는 쓸모가 없으니 그림을 기기에 남긴다.
   파일 이름은 앱 이름 규칙 «Poster Studio_영화제목.png». 그림은 사용자 기기 안에서만 오간다(서버로 보내지 않는다).
   기기별 길(2026-10-20 Bumm님, 팀장 전달):
   - 아이폰 · 아이패드: 파일 공유(공유 창). 웹에서 사진 앱(사진첩)에 넣는 길은 공유 창의 «이미지 저장»뿐이다 — 내려받기는 «파일» 앱으로 간다.
     공유를 못 하는 옛 판은 내려받기.
   - 안드로이드: 바로 내려받기. 공유 창에는 «이미지 저장»이 없는 경우가 많고, 내려받은 그림은 갤러리의 «Download» 앨범에 보인다.
   - PC(그 밖): 바로 내려받기. 윈도 크롬은 공유 창(윈도 «공유»)을 띄워 이상해 보였다(10/20 Bumm님 좁은 창). */
import { DEFAULT_MOVIE_TITLE } from "./defaults.js";

export type SaveResult = "shared" | "downloaded" | "cancelled" | "failed";
export type SavePlatform = "ios" | "android" | "desktop";

/** 아이패드 사파리는 맥처럼 자신을 알리므로(Macintosh) 터치 점 수로 가른다. */
export function savePlatform(userAgent = navigator.userAgent, touchPoints = navigator.maxTouchPoints || 0): SavePlatform {
  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && touchPoints > 1)) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "desktop";
}

/** 파일 이름에 쓸 수 없는 글자(\ / : * ? " < > |)와 줄바꿈을 지우고, 비면 기본 제목을 쓴다. */
export function posterFileName(title: string): string {
  const clean = title.replace(/[\\/:*?"<>|\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  return `Poster Studio_${clean || DEFAULT_MOVIE_TITLE}.png`;
}

export async function savePoster(canvas: HTMLCanvasElement, title: string, platform: SavePlatform = savePlatform()): Promise<SaveResult> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return "failed";
  const name = posterFileName(title);
  const file = new File([blob], name, { type: "image/png" });
  if (platform === "ios" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
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
