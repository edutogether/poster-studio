/* ────────────────────────────────────────────────────────────────────
   여러 파일이 공유하는 가변 상태. ES모듈 전환(2026-08-30, 5차 감사 후속조치
   1·5번)으로 신설 — import 바인딩은 읽기전용 라이브뷰라 다른 모듈이 재할당할
   수 없으므로(예: 촬영 모듈이 진입점의 capturedBlob을 직접 재할당하는 건 ES모듈
   문법상 불가능), 재할당이 필요한 값은 이 객체의 속성으로 옮겨 각 모듈이
   state.xxx = ... 형태로 값만 바꾼다(객체 참조 자체는 안 바뀌므로 import는 그대로
   유효). 로직/동작은 파일 분리 전과 동일 — 상태를 담는 그릇만 바뀌었다. */
/* 포스터 한 장(템플릿 1종 × 그림 1장)과 화면 입력값의 형태.
   api.ts의 getMeta()가 Meta를 만들고 templates.ts/layout.ts가 그대로 받아 쓴다. */
export interface Poster {
  label: string;
  canvas: HTMLCanvasElement;
}
export interface Meta {
  mode: string;
  name: string;
  groupName: string;
  members: string;
  title: string;
  genre: string;
  tagline: string;
}

export const state = {
  stream: null as MediaStream | null,
  capturedBlob: null as Blob | null,
  currentMode: 'solo' as string,
  posters: [] as Poster[],       // [{label, canvas}]
  selected: 0,
  genCount: 0,
  pendingMeta: null as Meta | null,   // AI 생성 실패 시 폴백 버튼이 재사용할 마지막 입력값(camera.ts도 다시 촬영 시 초기화함)
  LOGO_LIGHT: null as HTMLImageElement | null,
  LOGO_DARK: null as HTMLImageElement | null,
  LOGO_TRIED: false
};
