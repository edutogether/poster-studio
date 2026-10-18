import manifest from "./camera-videos.json";

/** 숫자 3·2·1(count)과 단체 대사 말풍선(say). 시각은 영상 초, x·y는 영상 화면의 %(말풍선 꼬리가 가리키는 점). */
export type CameraCue =
  | { kind: "count"; from: number; to: number; text: string }
  | { kind: "say"; from: number; to: number; text: string; x: number; y: number };

export type CameraVideoEntry = {
  mode: "solo" | "group";
  status: string;
  src: string | null;
  sha256: string | null;
  bytes: number;
  still: string | null;
  stillSha256: string | null;
  /** 마지막 프레임(찰칵 뒤 멈춘 장면) — 영상을 못 틀 때 보이는 그림(10/19). */
  endStill: string | null;
  endStillSha256: string | null;
  duration: number;
  cues: CameraCue[];
};

export type ApprovedCameraVideo = CameraVideoEntry & { src: string; still: string; endStill: string };

// 촬영 화면 예시 영상(2026-10-16) — 검수된 파일만 연결한다(대기 영상과 같은 규칙). 승인 전에는 주소조차 요청하지 않아
// 지금 정지 그림(camera-student.webp·camera-group.webp) 그대로다. 이름에 내용 해시 앞 12자리가 들어가야 옛 캐시에 갇히지 않는다.
export function approvedCameraVideo(mode: string): ApprovedCameraVideo | undefined {
  const item = (manifest as CameraVideoEntry[]).find(entry => entry.mode === mode);
  if (!item || item.status !== "approved" || !item.src || !item.still || !item.endStill || !item.sha256 || !/^[a-f0-9]{64}$/.test(item.sha256)) return;
  if (item.src !== `/studio/camera-v1/${mode}-${item.sha256.slice(0, 12)}.mp4`) return;
  return item as ApprovedCameraVideo;
}

/** t초에 보여야 할 신호(from 이상 to 미만). 영상이 멈춘 뒤(ended)에는 부르는 쪽이 비운다. */
export function activeCues(cues: CameraCue[], t: number): CameraCue[] {
  return cues.filter(cue => t >= cue.from && t < cue.to);
}
