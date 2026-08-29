/* exported BOOTH_TOKEN, FEST, DATE, VENUE, EN, GENRES, val, pick, video, snapshot,
   stream, capturedBlob, currentMode, posters, LOGO_LIGHT, LOGO_DARK, LOGO_TRIED, selected */
/* ====================================================================
   InKY AI 영화 포스터 제작소 — 앱 진입점(공유 상수/상태 + 부트스트랩)
   나머지 로직은 역할별로 분리됨(5차 감사 후속조치, 2026-08-30, 순수 파일
   분리만 수행 — 동작/로직 변경 없음):
     layout.js    — 폰트 준비, 캔버스 그리기 공통 도구(측정/타이틀 레이아웃/로고)
     templates.js — 포스터 4종 템플릿(TEMPLATES) + 크레딧 문구 조립
     camera.js    — 웹캠 촬영
     api.js       — 메타데이터 수집, AI 생성 요청, 갤러리 빌드
     print.js     — PNG 저장/인쇄
   index.html의 <script> 로드 순서가 곧 실행 순서이므로 이 파일이 항상 먼저
   로드돼야 한다(다른 파일들이 여기 정의된 $, 상태변수, DOM 참조를 그대로 씀 —
   브라우저의 non-module <script>들은 top-level let/const까지 같은 전역
   스코프를 공유하므로 별도 export/import 없이도 가능하다). */

/* AI 생성은 더 이상 이 노트북 안 서버가 아니라 Firebase Functions(서버리스)가 처리한다.
   Firebase 프로젝트를 새로 만들거나 옮기면 이 URL이 바뀐다 — 그럴 땐 아래 두 곳을
   반드시 같이 고칠 것(한쪽만 고치면 CORS가 막히거나 엉뚱한 프로젝트를 호출하게 됨):
     1. 이 줄의 API_BASE
     2. functions/index.js의 ALLOWED_ORIGINS (지금 이 페이지 도메인이 그 목록에 있어야
        Functions가 브라우저 요청을 허용한다) */
const API_BASE = 'https://asia-northeast3-inky-poster-studio.cloudfunctions.net/posterStudio';

/* 부스 공유 토큰 — functions/index.js의 BOOTH_TOKEN 시크릿과 같은 값이어야 한다.
   정적 사이트라 이 값은 누구나 소스에서 볼 수 있다(진짜 비밀이 아니다) — 목적은
   자동화 스크립트가 소스를 안 보고 /generate URL만 찔러보는 걸 막는 최소한의
   문지기이지, 강한 인증이 아니다. 교체 절차는 RUNBOOK.md "부스토큰 교체" 참고.
   2026-08-30: 5차 감사에서 이전 값이 예측 가능한 패턴이라는 지적을 받아 무작위
   문자열로 교체함(무작위 자체가 보안을 강하게 만들진 않지만, 최소한 "부스 이름을
   안다"는 정보만으로는 더 이상 추측할 수 없게 함). */
const BOOTH_TOKEN = 'XQp4tQ97rS_fUPz4zgCEBTYnUEOs48C0';

const FEST   = '제4회 인천어린이청소년영화제';
const DATE   = '2026. 11. 14. (토)';
const VENUE  = 'CGV 인천';
const EN      = 'INKY  ·  INCHEON KIDS & YOUTH FILM FESTIVAL';

/* 장르별 컨셉: 제목 폰트(한글 가능)·강조색·자동 추천 홍보문구 */
const GENRES = {
  animation:{ font:"'Black Han Sans'", accent:'#ffd23f', taglines:['상상은 현실이 된다','오늘, 가장 신나는 모험','웃음과 용기가 가득한 이야기'] },
  fantasy:  { font:"'Noto Serif KR'", accent:'#f6d27a', taglines:['전설이 깨어난다','마법의 문이 열린다','운명을 향한 모험의 시작'] },
  sf:       { font:"'Black Han Sans'", accent:'#7fe7ff', taglines:['우주 너머, 미지의 세계로','별을 향한 위대한 도약','내일을 여는 탐험가'] },
  hero:     { font:"'Black Han Sans'", accent:'#ff6b6b', taglines:['세상을 지키는 작은 영웅','용기가 가장 큰 힘이다','지금, 영웅이 깨어난다'] },
  mystery:  { font:"'Noto Serif KR'", accent:'#d7c79a', taglines:['진실을 쫓는 명탐정','단 하나의 단서','수수께끼가 시작된다'] },
  director: { font:"'Noto Serif KR'", accent:'#ffd23f', taglines:['카메라 뒤, 또 하나의 주인공','나의 첫 영화가 시작된다','세상을 담는 한 컷'] },
  sports:   { font:"'Black Han Sans'", accent:'#ffae3b', taglines:['포기하지 않는 한, 끝이 아니다','함께라서 더 빛난다','한계를 넘어'] },
  music:    { font:"'Black Han Sans'", accent:'#ff8fe0', taglines:['오늘 밤, 무대의 주인공','마음을 울리는 한 곡','빛나는 순간이 시작된다'] }
};

const $ = id => document.getElementById(id);
const val = id => ($(id)?.value || '').trim();
const pick = arr => arr[Math.floor(Math.random()*arr.length)];

const video = $('video'), snapshot = $('snapshot');
const posterCanvas = $('posterCanvas'), pctx = posterCanvas.getContext('2d');
let stream = null, capturedBlob = null;
let currentMode = 'solo';
let posters = [];        // [{label, canvas}]
let LOGO_LIGHT = null, LOGO_DARK = null, LOGO_TRIED = false;  // 교육청 로고(흰글씨/짙은글씨)
let selected = 0;

/* 포스터 캔버스 크기 — templates.js의 TEMPLATES와 이 파일의 placeholder()가 함께 쓴다. */
const W=1200, H=1800;

function setStatus(m){ $('status').textContent = m; }

/* AI 서버(Firebase Functions) 연결 상태를 미리 확인한다.
   촬영·정보입력을 다 마친 뒤에야 실패를 알게 되는 것보다, 부스 진행자가
   페이지를 여는 순간 바로 문제를 알 수 있는 게 훨씬 낫다. 실패해도 촬영
   자체는 막지 않는다(연결이 잠깐 불안정했을 수도 있으므로 fail-open). */
(async function checkHealth(){
  try{
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(`${API_BASE}/health`, { signal: ctrl.signal });
    clearTimeout(timer);
    if(!r.ok) throw new Error('unhealthy');
    const data = await r.json().catch(() => ({}));
    // 5차 감사 발견: 예전엔 HTTP 상태만 봐서, /health가 "키는 있음"만 확인하고
    // OpenAI가 실제로 죽어있어도 이 경고가 안 떴다 — 응답 본문의 openaiReachable도 확인한다.
    if(data.openaiReachable === false){
      setStatus('⚠ AI(OpenAI) 서버에 연결할 수 없습니다. 잠시 후 다시 열어보거나 담당자에게 알려주세요. (촬영은 가능하지만 포스터 생성이 실패할 수 있어요)');
    }
  }catch(e){
    setStatus('⚠ AI 서버 연결을 확인할 수 없습니다. 와이파이를 확인해 주세요. (촬영은 가능하지만 포스터 생성이 실패할 수 있어요)');
  }
})();

/* ── 초기 플레이스홀더 ── */
(function placeholder(){
  pctx.fillStyle='#0b1020'; pctx.fillRect(0,0,W,H);
  pctx.fillStyle='#e9b949'; pctx.textAlign='center'; pctx.font="900 84px 'Black Han Sans', sans-serif";
  pctx.fillText('🎬', W/2, 760); pctx.fillStyle='#f4f6fb';
  pctx.font="900 56px 'Black Han Sans', sans-serif"; pctx.fillText('AI 영화 포스터', W/2, 880);
  pctx.fillStyle='#aeb7d0'; pctx.font="500 30px sans-serif"; pctx.fillText('촬영 후 이곳에 4가지 버전이 표시됩니다', W/2, 950);
})();
