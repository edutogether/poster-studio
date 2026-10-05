import manifest from "./waiting-videos.json";
type VideoEntry = { id: number; status: string; src: string | null; sha256: string | null };

// 검수된 파일만 연결한다. 미제작 항목은 URL조차 요청하지 않는다.
export function approvedWaitingVideo(id: number): string | undefined {
  const item = (manifest as VideoEntry[]).find(entry => entry.id === id);
  if (!item || item.status !== "approved" || !item.src || !item.sha256) return;
  const name = String(id).padStart(2, "0");
  return item.src === `/studio/waiting-video-v1/${name}-${item.sha256.slice(0, 12)}.webm`
    && /^[a-f0-9]{64}$/.test(item.sha256) ? item.src : undefined;
}
