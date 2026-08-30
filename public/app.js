/* ====================================================================
   InKY AI 영화 포스터 제작소 — 앱 진입점.
   index.html이 이 파일 하나만 <script type="module">로 불러오고, 나머지는
   ES모듈 import 그래프로 자동 로드된다(2026-08-30, 5차 감사 후속조치
   1·5번 — 490줄 단일파일 분리 이후의 두 번째 단계로 진짜 ES모듈 전환):
     state.js     — 여러 파일이 공유하는 가변 상태(재할당 가능한 값들)
     constants.js — 공유 상수/DOM·배열 헬퍼
     dom.js       — 자주 쓰는 DOM 참조 + 상태표시줄
     layout.js    — 폰트 준비, 캔버스 그리기 공통 도구(측정/타이틀 레이아웃/로고)
     templates.js — 포스터 4종 템플릿(TEMPLATES) + 크레딧 문구 조립
     camera.js    — 웹캠 촬영(import만으로 버튼 핸들러가 등록됨)
     api.js       — 메타데이터 수집, AI 생성 요청, 갤러리 빌드(위와 동일)
     print.js     — PNG 저장/인쇄(위와 동일)
   이전(2026-08-30 1차 분리)엔 classic <script> 6개가 하나의 전역 스코프를
   공유해서 재할당 가능한 상태(capturedBlob 등)를 그냥 top-level let으로
   뒀는데, ES모듈의 import 바인딩은 읽기전용 라이브뷰라 다른 모듈이 직접
   재할당할 수 없다 — 그래서 재할당이 필요한 값들은 state.js의 객체
   속성으로 옮겼다(state.capturedBlob = ... 형태). 동작/로직 자체는 이번에도
   변경 없음, 상태를 담는 그릇과 로드 방식만 바뀌었다. */
import { API_BASE } from './constants.js';
import { pctx } from './dom.js';
import { setStatus } from './dom.js';
import { W, H } from './constants.js';
import './camera.js';
import './api.js';
import './print.js';

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

// 첫 의미있는 화면(플레이스홀더 포스터)이 그려졌으니 부트 스플래시를 내린다(index.html 참고).
window.__posterStudioHideBootSplash?.();
