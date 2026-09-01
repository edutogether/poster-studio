/* 부트 스플래시 숨김 로직. Firebase Hosting 전환(2026-09-01)으로 엄격한 CSP
   (script-src 'self', 인라인 스크립트 불허)를 적용하면서 index.html에 있던
   인라인 <script>를 이 외부 파일로 옮겼다 — 동작은 전혀 안 바꿈. classic
   <script src>로 그대로 로드해 문서 파싱 중 동기 실행되는 성질(모듈 스크립트의
   defer 동작과 달리)을 유지한다. */
(function () {
  var el = document.getElementById('bootSplash');
  var done = false;
  var shownAt = Date.now();
  // 로딩이 실제로 아무리 빨리 끝나도(로컬/캐시 환경 등) 브랜드 화면이
  // 최소 이만큼은 화면에 떠 있어야 사람이 인지할 수 있다 — 대표 피드백
  // (2026-08-31): 너무 빨리 사라져서 못 봤다는 지적 반영.
  var MIN_VISIBLE_MS = 1600;
  function reallyHide() {
    el.style.opacity = '0';
    el.style.pointerEvents = 'none';
    window.setTimeout(function () { el.style.display = 'none'; }, 470);
  }
  function hide() {
    if (done) return;
    done = true;
    var elapsed = Date.now() - shownAt;
    var remaining = MIN_VISIBLE_MS - elapsed;
    if (remaining > 0) window.setTimeout(reallyHide, remaining);
    else reallyHide();
  }
  window.__posterStudioHideBootSplash = hide;
  // 부팅이 실패해도 사용자가 스플래시 뒤에 영영 갇히는 일은 없게 한다.
  window.setTimeout(hide, 5000);
})();
