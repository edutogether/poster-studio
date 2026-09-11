/* 부트 스플래시 — 노드를 치우는 일과 안전판만 맡는다.
   _shared/standards/splash-standard.md 규격(2026-09-09, 리액트 전환 4단계).

   **이 파일은 시간을 재지 않는다.** 유지 2300ms(= 막대 2바퀴, §27) / 페이드 474ms / 소멸 2875ms는
   전부 style.css의 splashOut 애니메이션이 잡는다. 예전 구현은 여기서
   MIN_VISIBLE_MS=1600을 Date.now() 기준으로 쟀는데, 그 시점이 곧 스크립트가
   실행된 시점이라 회선이 느릴수록 스플래시가 그만큼 더 오래 떠 있었다 —
   같은 코드가 기기마다 다른 시간 보이는 셈이었다.

   왜 여전히 고전 <script src>이고 번들에 안 들어가는가:
     1) CSP가 script-src 'self'라 인라인 <script>를 못 쓴다.
     2) 아래 안전판은 **번들이 끝내 안 왔을 때**를 위한 것이라, 번들 안에 있으면
        정작 필요한 상황에서 실행되지 않는다(§5.4의 '빈 게이트').

   JS가 하는 일은 두 가지뿐이고 둘 다 '시간을 재는 것'이 아니라 '조건을 보는 것'이다:
     - 애니메이션이 끝났으면 노드를 지운다(남아 있으면 body:has(#splash)가 계속
       매치돼 배경 의사요소가 안 돌아온다).
     - 스플래시가 멈춘 채(app-ready 미도달) 너무 오래 지나면 강제로 흐르게 한다. */
(function () {
  var el = document.getElementById('splash');
  if (!el) return;

  function remove() {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  el.addEventListener('animationend', function (e) {
    if (e.animationName === 'splashOut') remove();
  });

  /* 이 파일이 늦게 실행돼 애니메이션이 이미 끝났을 수도 있다 — 그러면
     animationend는 지나가 버려 영영 안 지워진다. 그 경우 바로 지운다. */
  if (el.getAnimations && el.getAnimations().length &&
      el.getAnimations().every(function (a) { return a.playState === 'finished'; })) {
    remove();
  }

  /* 안전판. 정지형 게이트라 app-ready가 안 붙으면 스플래시가 계속 멈춰 있는데,
     그건 정상적인 "로딩 중" 표시다(걷어내면 빈 화면이다). 다만 끝내 신호가 없으면
     렌더 실패로 보고 흐르게 한다 — 번들이 실행되기만 하면 첫 화면은 수십 ms 안에
     붙으므로, 이만큼 지나도 신호가 없다는 건 정상 로딩이 아니라는 뜻이다.
     시간을 '재는' 게 아니라 '실패로 판정하는' 상한이다. */
  window.setTimeout(function () {
    document.body.classList.add('app-ready');
  }, 8000);
})();
