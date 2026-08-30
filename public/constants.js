/* ────────────────────────────────────────────────────────────────────
   앱 전역 상수 + 작은 DOM/배열 헬퍼. ES모듈 전환(2026-08-30)으로 신설 —
   이전엔 app.js의 top-level const/let이 모든 <script>가 공유하는 전역
   스코프에 그냥 놓여 있었는데, 그 중 재할당 없는 순수 상수/헬퍼만 여기로
   옮겼다(재할당이 필요한 값은 state.js 참고). 로직 변경 없음.
   ──────────────────────────────────────────────────────────────────── */

/* AI 생성은 이 노트북 안 서버가 아니라 Firebase Functions(서버리스)가 처리한다.
   Firebase 프로젝트를 새로 만들거나 옮기면 이 URL이 바뀐다 — 그럴 땐 아래 두 곳을
   반드시 같이 고칠 것(한쪽만 고치면 CORS가 막히거나 엉뚱한 프로젝트를 호출하게 됨):
     1. 이 줄의 API_BASE
     2. functions/index.js의 ALLOWED_ORIGINS (지금 이 페이지 도메인이 그 목록에 있어야
        Functions가 브라우저 요청을 허용한다) */
export const API_BASE = 'https://asia-northeast3-inky-poster-studio.cloudfunctions.net/posterStudio';

/* 부스 공유 토큰 — functions/index.js의 BOOTH_TOKEN 시크릿과 같은 값이어야 한다.
   정적 사이트라 이 값은 누구나 소스에서 볼 수 있다(진짜 비밀이 아니다) — 목적은
   자동화 스크립트가 소스를 안 보고 /generate URL만 찔러보는 걸 막는 최소한의
   문지기이지, 강한 인증이 아니다. 교체 절차는 RUNBOOK.md "부스토큰 교체" 참고. */
export const BOOTH_TOKEN = 'XQp4tQ97rS_fUPz4zgCEBTYnUEOs48C0';

export const FEST = '제4회 인천어린이청소년영화제';
export const DATE = '2026. 11. 14. (토)';
export const VENUE = 'CGV 인천';
export const EN = 'INKY  ·  INCHEON KIDS & YOUTH FILM FESTIVAL';

/* 장르별 컨셉: 제목 폰트(한글 가능)·강조색·자동 추천 홍보문구 */
export const GENRES = {
  animation:{ font:"'Black Han Sans'", accent:'#ffd23f', taglines:['상상은 현실이 된다','오늘, 가장 신나는 모험','웃음과 용기가 가득한 이야기'] },
  fantasy:  { font:"'Noto Serif KR'", accent:'#f6d27a', taglines:['전설이 깨어난다','마법의 문이 열린다','운명을 향한 모험의 시작'] },
  sf:       { font:"'Black Han Sans'", accent:'#7fe7ff', taglines:['우주 너머, 미지의 세계로','별을 향한 위대한 도약','내일을 여는 탐험가'] },
  hero:     { font:"'Black Han Sans'", accent:'#ff6b6b', taglines:['세상을 지키는 작은 영웅','용기가 가장 큰 힘이다','지금, 영웅이 깨어난다'] },
  mystery:  { font:"'Noto Serif KR'", accent:'#d7c79a', taglines:['진실을 쫓는 명탐정','단 하나의 단서','수수께끼가 시작된다'] },
  director: { font:"'Noto Serif KR'", accent:'#ffd23f', taglines:['카메라 뒤, 또 하나의 주인공','나의 첫 영화가 시작된다','세상을 담는 한 컷'] },
  sports:   { font:"'Black Han Sans'", accent:'#ffae3b', taglines:['포기하지 않는 한, 끝이 아니다','함께라서 더 빛난다','한계를 넘어'] },
  music:    { font:"'Black Han Sans'", accent:'#ff8fe0', taglines:['오늘 밤, 무대의 주인공','마음을 울리는 한 곡','빛나는 순간이 시작된다'] }
};

/* 포스터 캔버스 크기 — templates.js의 TEMPLATES와 app.js의 placeholder()가 함께 쓴다. */
export const W = 1200, H = 1800;

export const $ = id => document.getElementById(id);
export const val = id => ($(id)?.value || '').trim();
export const pick = arr => arr[Math.floor(Math.random()*arr.length)];
