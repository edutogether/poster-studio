import manifest from "./waiting-videos.json";

export type WaitingVideoEntry = { id: number; status: string; src: string | null; sha256: string | null; bytes: number; still: string; stillSha256: string };

// 검수된 파일만 연결한다. 승인되지 않은 항목은 주소조차 요청하지 않는다.
// 파일 이름에 내용 해시 앞 12자리가 들어가 있어야 한다 — 파일을 바꾸면 이름도 바뀌어 옛 캐시에 갇히지 않는다.
export function approvedWaitingVideo(id: number): string | undefined {
  const item = (manifest as WaitingVideoEntry[]).find(entry => entry.id === id);
  if (!item || item.status !== "approved" || !item.src || !item.sha256) return;
  const name = String(id).padStart(2, "0");
  return item.src === `/studio/waiting-v3/${name}-${item.sha256.slice(0, 12)}.mp4`
    && /^[a-f0-9]{64}$/.test(item.sha256) ? item.src : undefined;
}
