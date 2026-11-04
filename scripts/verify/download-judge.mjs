/* download-button-probe.mjs · download-live.mjs가 «0건» · «전부»로 판정하는 자리(2026-11-02 종합감사 — 빈 게이트, COMMON_STANDARDS §21-1).
   브라우저 · 네트워크 없이 selftest.mjs가 같은 함수를 시험한다.

   «0건» · «전부»는 무언가를 실제로 봤을 때만 증거다. 아무것도 안 봐도 똑같이 참이 되는 세 자리를 허용 목록으로 바꿨다:
     - 누르기 전 설치 파일 요청 0건 — 그동안 요청 기록이 이 페이지 자신의 요청을 하나 이상 봤어야 한다(기록이 죽어 있어도 0건이 나온다).
     - 바깥 · 함수 주소 요청은 AI 서버 확인(/health)뿐 — 가로챈 요청이 하나 이상 있어야 한다(빈 목록의 every는 참이다).
       두 단추 판(LIVE_MODE «both»)은 열 때마다 /health를 부르므로, 0건이면 가로채기가 앱의 요청을 못 본 것이다 — 다른 주소로 실제로 나갔을 수 있다.
     - 세 주소의 본 번들이 같다 — 세 주소 모두 번들 이름을 읽었어야 한다(셋 다 못 읽으면 null 하나로 «같다»가 됐다). */

// 요청 기록이 살아 있었다 = 이 페이지(<주소>/…)의 요청을 하나 이상 봤다
export const sawPage = (requests, base) => requests.some((u) => typeof u === 'string' && u.startsWith(`${base}/`));

// 가로챈 바깥 요청이 하나 이상이고, 전부 AI 서버 확인(/health)이다
export const onlyHealth = (urls) => urls.length > 0 && urls.every((u) => /\/health$/.test(u));

// 번들 이름을 하나도 빠짐없이 읽었고(빈 값 없음), 모두 같다
export const sameBundle = (bundles) => bundles.length > 0 && bundles.every((b) => typeof b === 'string' && b.length > 0) && new Set(bundles).size === 1;
