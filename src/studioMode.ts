/** 라이브 동작 스위치 — 2026-10-20 Bumm님 결정으로 `.env.production`의 VITE_SAMPLE_MODE에서 이 파일로 옮겼다.
 *  예전 값 «1»은 10/9~10/20에 «샘플만», 10/20부터 «두 단추»로 뜻이 바뀌어 헷갈렸다 — 이름이 곧 뜻인 값으로 바꾼다.
 *
 *  "both"   두 단추 — 찍기 전 «샘플 포스터 보기»(카메라 · 서버 요청 없이 샘플 흐름), 찍은 뒤 «이 사진으로 포스터 만들기»(진짜 AI 생성).
 *           베타(10/20~)와 행사 날(11/14) 모두 이 값이다(10/20 Bumm님 «행사 날도 두 단추»).
 *  "sample" 샘플만 — 카메라 권한도 서버 요청도 없다(10/9~10/20 클로즈 베타의 값).
 *  "real"   진짜 생성만 — 샘플 단추가 없다.
 *
 *  바꾸면 다음 배포에 그대로 나간다. 부스 코드 스위치(켤지 미정 — 장학사님과 정함)와는 따로 논다. */
export type StudioMode = "both" | "sample" | "real";

export const LIVE_MODE: StudioMode = "both";

/** 확인 도구가 다른 판을 빌드할 때만: `npx vite build --mode check-real`(또는 check-sample · check-both).
 *  배포 빌드(`npm run build`)는 모드가 production이라 언제나 LIVE_MODE다 — .env 파일로는 바꿀 수 없다. */
const CHECK_BUILDS: Record<string, StudioMode> = { "check-both": "both", "check-sample": "sample", "check-real": "real" };

/** Windows 설치판(`npm run build:desktop`, src/desktop.ts)은 «진짜 생성만» 자리에 AI 대신 로컬 합성을 쓴다. 샘플 흐름은 두지 않는다 —
 *  샘플의 로딩 화면이 «AI가 당신의 영화를 그리고 있어요»라, AI가 없는 설치판에서는 거짓 표시가 된다(2026-10-27). */
export const STUDIO_MODE: StudioMode = import.meta.env.MODE === "desktop" ? "real" : CHECK_BUILDS[import.meta.env.MODE] ?? LIVE_MODE;
