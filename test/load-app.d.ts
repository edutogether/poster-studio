/* load-app.js(JS 시험 도우미)의 타입 — test/*.ts(x)를 타입검사에 넣으면서(2026-10-17 종합감사) react-setup.ts가 이것을 가져온다.
   캔버스 2D 문맥을 흉내 내는 가짜라 속성·메서드를 다 적지 않고 열어 둔다. */
export class FakeCtx {
  [key: string]: any;
}
export function loadApp(options?: { createRealCanvas?: boolean }): Promise<any>;
