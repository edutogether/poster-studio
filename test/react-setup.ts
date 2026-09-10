/* ────────────────────────────────────────────────────────────────────
   React 컴포넌트 테스트용 준비물. 3단계 전환(2026-09-09)으로 신설.

   왜 jsdom이 필요해졌나: 예전 하네스(load-app.js)는 손수 만든 가짜 document로
   충분했다. 모듈들이 getElementById로 몇 개를 집어 핸들러를 붙이는 게 전부였기
   때문이다. React는 진짜 DOM 트리를 만들고 다시 그리므로 그 가짜로는 안 된다.
   **2026-09-07의 "jsdom 안 쓴다" 판단을 뒤집는 게 아니라 범위를 나눈 것이다** —
   순수 로직 테스트(layout/templates/favicon)는 그대로 node 환경에서 돌고,
   컴포넌트 테스트만 파일 단위로 jsdom을 쓴다(`@vitest-environment jsdom`).

   캔버스는 @napi-rs/canvas를 jsdom에 붙이지 않고 **기존 FakeCtx를 재사용**한다.
   이 테스트들이 캔버스에 요구하는 건 "예외 없이 호출되고 measureText가 폰트
   크기에 비례한 너비를 준다"뿐이고, 픽셀 정확도는 templates-canvas.test.js가
   진짜 캔버스로 따로 본다. 실물을 두 군데서 붙일 이유가 없다.
   ──────────────────────────────────────────────────────────────────── */
import { vi } from 'vitest';
import { FakeCtx } from './load-app.js';

export type CanvasCall = { type: string };

/** jsdom의 캔버스는 getContext가 null이라 그대로는 아무것도 못 한다 — 가짜를 꽂는다. */
export function installCanvas() {
  const contexts: FakeCtx[] = [];
  (HTMLCanvasElement.prototype as any).getContext = function () {
    const ctx = new (FakeCtx as any)();
    /* 몇 번 '실제로 그렸는지'를 세어 둔다 — 위험 E(StrictMode에서 두 번 그리기)를
       판정하려면 컨텍스트를 몇 개 만들었는지가 아니라 몇 번 그렸는지를 봐야 한다. */
    ctx.__fillTextCalls = 0;
    const realFillText = ctx.fillText.bind(ctx);
    ctx.fillText = (...a: unknown[]) => { ctx.__fillTextCalls++; return realFillText(...a); };
    contexts.push(ctx);
    return ctx;
  };
  (HTMLCanvasElement.prototype as any).toDataURL = () => 'data:image/png;base64,FAKE';
  (HTMLCanvasElement.prototype as any).toBlob = function (cb: (b: Blob | null) => void, type?: string) {
    cb(new Blob(['FAKE'], { type: type || 'image/png' }));
  };
  return contexts;
}

/** 가짜 카메라. stopped 배열로 "정말 껐는가"(위험 D)를 확인한다. */
export function installCamera() {
  const stopped: string[] = [];
  const tracks = [{ kind: 'video', stop: () => stopped.push('video') }];
  const stream = { getTracks: () => tracks } as unknown as MediaStream;
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => stream) }
  });
  return { stopped, stream };
}

/** 촬영이 성립하려면 video가 준비된 것처럼 보여야 한다(videoWidth는 읽기전용). */
export function makeVideoReady(video: HTMLVideoElement, w = 1280, h = 960) {
  Object.defineProperty(video, 'videoWidth', { configurable: true, value: w });
  Object.defineProperty(video, 'videoHeight', { configurable: true, value: h });
}

export function installObjectURL() {
  const created: string[] = [];
  const revoked: string[] = [];
  (URL as any).createObjectURL = (_b: Blob) => {
    const u = 'blob:fake-' + created.length;
    created.push(u);
    return u;
  };
  (URL as any).revokeObjectURL = (u: string) => { revoked.push(u); };
  return { created, revoked };
}

/** /generate 응답만 가로챈다. 실제 OpenAI·Firestore는 절대 부르지 않는다. */
export function installFetch(handler?: (url: string) => Response | Promise<Response>) {
  const calls: string[] = [];
  /* 무엇을 보냈는지도 잡아둔다 — "이름·단체명·출연진은 서버로 안 보낸다"는 화면
     고지(privacy.html)의 약속을 테스트가 지키려면 URL만으로는 부족하다. */
  const bodies: FormData[] = [];
  const fn = vi.fn(async (input: any, init?: any) => {
    const url = String(input);
    calls.push(url);
    if (init?.body instanceof FormData) bodies.push(init.body);
    if (handler) return handler(url);
    if (url.includes('/generate')) {
      return new Response(JSON.stringify({ images: ['data:image/png;base64,FAKE'] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ ok: true, openaiReachable: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  });
  vi.stubGlobal('fetch', fn);
  return { calls, fn, bodies };
}

/** 로고 이미지 로드(layout.ts의 loadImg)가 테스트에서 영원히 매달리지 않게 한다. */
export function installImage() {
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 380;
    naturalHeight = 100;
    width = 380;
    height = 100;
    set src(_v: string) { queueMicrotask(() => this.onload?.()); }
  }
  vi.stubGlobal('Image', FakeImage);
}

/** document.fonts는 jsdom에 없다. 폰트 준비 단계가 그냥 통과하게 한다. */
export function installFonts() {
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { load: async () => [], ready: Promise.resolve() }
  });
}

/** 컴포넌트가 마운트될 <main class="app">를 만든다 — 실제 index.html과 같은 모양. */
export function makeAppContainer() {
  document.body.innerHTML = '<main class="app"></main>';
  return document.querySelector('main.app') as HTMLElement;
}
