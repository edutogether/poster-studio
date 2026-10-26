/* 대기 화면 동안 망을 쓰는 차례(2026-10-26 Bumm님 «대기 영상이 멈추는 것을 포스터 속도의 대가로 보지 않는다», 팀장 전달).
   느린 와이파이(1.6Mbps)에서 생성 단추를 누르자마자 조판 글꼴 · 로고(첫 방문 약 1.3MB)를 함께 받으면 첫 장면 영상이 4초 넘게
   멈춰 정지 그림으로 내려앉았다(10/26 측정: AI 대기 중 영상 69/90장면, 미리 받기 전 85/89).
   그래서 차례를 둔다: ① 지금 장면 영상 → ② 다음 장면 영상 → ③ 조판 글꼴 · 로고. 앞 차례를 끝까지 받으면 다음을 시작하므로
   빠른 망에서는 1초 안에 다 풀리고, 느린 망에서는 영상이 먼저 간다. 받을 영상이 없거나(움직임 줄이기 · 승인 안 된 편) 받지 못하면 바로 넘긴다.
   ③은 늦어도 생성 단추 뒤 BACKGROUND_CAP_MS에 시작한다 — 응답(느린 망에서 AI 30초 + 그림 약 3MB)이 오기 전에 글꼴이 와 있게.
   20초인 까닭: 느린 망 첫 방문은 첫 장면 영상 · 정지 그림 둘 · 둘째 장면 영상을 받는 데 10초 남짓 걸린다 — 10초로 두면 둘째 장면 영상을
   받는 중에 글꼴이 끼어들었다(10/26 시범 측정). 그래도 글꼴(약 1.3MB, 느린 망 7초 안팎)은 응답이 다 오기 전에 끝난다.
   응답이 그보다 먼저 와도 조판(buildPosters)이 그 자리에서 받기 시작하므로, 이 차례 때문에 포스터가 미리 받기 전보다 늦어지지 않는다. */
export const BACKGROUND_CAP_MS = 20_000;

let release: (() => void) | null = null;

/** 생성 단추에서 부른다 — 대기 화면이 지금 · 다음 장면 영상을 받아 두면(늦어도 capMs 뒤) 풀린다. 새로 부르면 앞의 것은 바로 풀린다. */
export function afterWaitingVideos(capMs = BACKGROUND_CAP_MS): Promise<void> {
  release?.();
  return new Promise((resolve) => {
    const done = () => { window.clearTimeout(timer); if (release === done) release = null; resolve(); };
    const timer = window.setTimeout(done, capMs);
    release = done;
  });
}

/** 대기 화면이 부른다 — 앞 차례(지금 · 다음 장면 영상)를 다 받았다. 기다리는 쪽이 없으면 아무 일도 하지 않는다. */
export function waitingVideosReady() {
  release?.();
}

const prefetched = new Map<string, Promise<void>>();

/** 다음 장면 영상을 미리 받아 브라우저 캐시에 둔다 — 장면이 바뀌면 <video>가 망에 다시 나가지 않고 캐시에서 읽는다.
 *  같은 주소는 한 번만 받는다(받는 중이면 같은 약속). 실패해도 던지지 않고, 다음에 다시 받을 수 있게 기억에서 지운다. */
export function prefetchWaitingVideo(src: string): Promise<void> {
  let job = prefetched.get(src);
  if (!job) {
    job = fetch(src).then((res) => (res.ok ? res.arrayBuffer() : null)).then(() => undefined, () => { prefetched.delete(src); });
    prefetched.set(src, job);
  }
  return job;
}
