/* 대기 화면 동안 망을 쓰는 차례(2026-10-26 Bumm님 «대기 영상이 멈추는 것을 포스터 속도의 대가로 보지 않는다», 팀장 전달).
   느린 와이파이(1.6Mbps)에서 생성 단추를 누르자마자 조판 글꼴 · 로고(첫 방문 약 1.3MB)를 함께 받으면 첫 장면 영상이 4초 넘게
   멈춰 정지 그림으로 내려앉았다(10/26 측정: AI 대기 중 영상 69/90장면, 미리 받기 전 85/89).
   그래서 차례를 둔다: ① 첫 장면 영상 → ② 둘째 장면 영상(첫 장면 동안 미리) → ③ 조판 글꼴 · 로고(둘째 장면 영상이 받아진 뒤).
   ③은 둘째 장면이 화면에 올라와 그 영상을 다 받은 뒤에 풀린다 — 장면이 8초라 빠른 망에서도 약 8초 뒤다. 느린 망에서는 영상이 먼저 간다.
   받을 영상이 없거나(움직임 줄이기 · 승인 안 된 편) 받지 못하면 바로 넘긴다.
   ③이 도는 동안에는 그다음 장면 영상 받기를 미룬다 — 글꼴 조각 여러 개가 한꺼번에 망을 차지해, 함께 받으면 영상이 장면 시작에
   못 맞춰 <video>가 같은 파일을 따로 받았다(10/26 시범 측정).
   ③은 늦어도 생성 단추 뒤 BACKGROUND_CAP_MS에 시작하고, 영상 받기를 미루는 것도 길어야 그만큼이다 — 응답(느린 망에서 AI 30초 +
   그림 약 3MB)이 오기 전에 글꼴이 와 있게. 20초인 까닭: 느린 망 첫 방문은 첫 장면 영상 · 정지 그림 둘 · 둘째 장면 영상을 받는 데
   10초 남짓 걸린다 — 10초로 두면 둘째 장면 영상을 받는 중에 글꼴이 끼어들었다(10/26 시범 측정).
   응답이 그보다 먼저 와도 조판(buildPosters)이 그 자리에서 받기 시작하므로, 이 차례 때문에 포스터가 미리 받기 전보다 늦어지지 않는다. */
export const BACKGROUND_CAP_MS = 20_000;

let pending: { start: () => void; timer: number } | null = null;
let busy: Promise<void> = Promise.resolve();

/** 생성 단추에서 부른다 — 대기 화면이 첫 · 둘째 장면 영상을 받아 두면(늦어도 capMs 뒤) job(조판 글꼴 · 로고 받기)을 시작한다.
 *  새로 부르면 아직 시작하지 않은 앞의 job은 버린다(그 생성은 끝났다). */
export function afterWaitingVideos(job: () => Promise<void>, capMs = BACKGROUND_CAP_MS): void {
  if (pending) window.clearTimeout(pending.timer);
  const start = () => {
    if (pending?.start !== start) return;
    window.clearTimeout(pending.timer);
    pending = null;
    const running = job().catch(() => undefined);
    busy = Promise.race([running, new Promise<void>((resolve) => window.setTimeout(resolve, capMs))]);
  };
  pending = { start, timer: window.setTimeout(start, capMs) };
}

/** 대기 화면이 부른다 — 앞 차례(첫 · 둘째 장면 영상)를 다 받았다. 기다리는 job이 없으면 아무 일도 하지 않는다. */
export function waitingVideosReady() {
  pending?.start();
}

/** 대기 화면이 다음 장면 영상을 받기 전에 기다린다 — job이 끝나면(늦어도 시작 뒤 capMs) 풀린다. job이 없으면 곧바로. */
export function backgroundIdle(): Promise<void> {
  return busy;
}

const prefetched = new Map<string, Promise<void>>();

/** 다음 장면 영상을 미리 받아 브라우저 캐시에 둔다 — 장면이 바뀌면 <video>가 망에 다시 나가지 않고 캐시에서 읽는다.
 *  같은 주소는 한 번만 받는다(받는 중이면 같은 약속). 망 오류 · 서버 오류(404 · 503 등)로 못 받아도 던지지 않고, 다음에 다시 받을 수 있게 기억에서 지운다. */
export function prefetchWaitingVideo(src: string): Promise<void> {
  let job = prefetched.get(src);
  if (!job) {
    job = fetch(src)
      .then((res) => { if (!res.ok) throw new Error(`대기 영상 미리 받기 ${res.status}`); return res.arrayBuffer(); })
      .then(() => undefined, () => { prefetched.delete(src); });
    prefetched.set(src, job);
  }
  return job;
}

/** 시험 전용 — 모듈에 남는 상태(미리 받은 주소 · 기다리는 job · 도는 job)를 비운다. 시험끼리 섞인 장면 순서가 겹쳐도 서로 새지 않게. */
export function _resetWaitingNetworkForTesting() {
  prefetched.clear();
  if (pending) window.clearTimeout(pending.timer);
  pending = null;
  busy = Promise.resolve();
}
