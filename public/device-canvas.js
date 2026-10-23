/* 기기 갈래 · 기준 화면 배율(2026-10-23 비율 기준 전환, _docs/intents/2026-10-23-ratio-canvas).

   갈래마다 기준 화면 하나를 디자인하고, 다른 크기는 그 화면을 통째로 줄이고 키운다:
     휴대폰  390×844  — viewport 폭을 390으로(브라우저가 기기 폭에 맞춰 통째로 줄이고 키운다, 손가락 확대는 그대로)
     태블릿  세로 1024×1366 · 가로 1366×1024 — viewport 폭을 1024 / 1366으로(돌리면 바꾼다)
     PC     2560×1440 — <html>에 zoom(창 폭/2560 · 창 높이/1440 중 작은 쪽, 2560보다 크면 1)을 걸고 캔버스를 가운데에
   <html data-device="phone | tablet-p | tablet-l | pc">로 CSS가 갈래를 고른다 — 빌드 단계(scripts/build/device-media.mjs)가 폭 · 높이
   미디어 쿼리를 이 선택자로 바꿔 두었다. PC는 zoom이라 화면 단위가 틀리므로 --vw · --vh에 캔버스 단위를 넣는다(빌드가 vw · vh를 이 변수로 바꿨다).

   갈래 판정은 입력 방식 먼저, 폭은 마지막 수단:
     휴대폰 — 이름표(iPhone · Android Mobile) 또는 손가락 입력 + 화면 짧은 변 < 600
     태블릿 — 이름표(iPad · Android 태블릿 · 터치 되는 «Macintosh» = 아이패드 사파리) 또는 손가락 입력 + 짧은 변 ≥ 600
              (갤럭시 탭 «데스크톱 보기»는 PC 이름표를 보내도 손가락 입력이라 태블릿)
     PC    — 그 밖(마우스가 주 입력이면 터치 노트북도 PC). 판정 재료가 없는 옛 브라우저는 폭 ≤ 760이면 휴대폰.
   이 파일은 <head>의 viewport 바로 뒤, 스타일시트보다 먼저 읽힌다(CSP script-src 'self' — 인라인 금지). */
(function () {
  var d = document.documentElement, ua = navigator.userAgent || '', tp = navigator.maxTouchPoints || 0;
  var mq = function (q) { return window.matchMedia ? window.matchMedia(q).matches : null; };
  var coarse = mq('(pointer: coarse)');
  var shortSide = Math.min(window.screen.width || 0, window.screen.height || 0) || Math.min(window.innerWidth, window.innerHeight);
  var phoneUA = /iPhone|iPod|Android.+Mobile/.test(ua);
  var tabletUA = /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)) || (/Macintosh/.test(ua) && tp > 1);
  var kind = phoneUA ? 'phone' : tabletUA ? 'tablet' : coarse ? (shortSide < 600 ? 'phone' : 'tablet') : coarse === null && window.innerWidth <= 760 ? 'phone' : 'pc';
  var meta = document.querySelector('meta[name="viewport"]');
  var REF_W = 2560, REF_H = 1440;

  function apply() {
    if (kind === 'phone') {
      d.setAttribute('data-device', 'phone');
      if (meta) meta.setAttribute('content', 'width=390, viewport-fit=cover');
    } else if (kind === 'tablet') {
      var land = mq('(orientation: landscape)');
      if (land === null) land = window.innerWidth > window.innerHeight;
      d.setAttribute('data-device', land ? 'tablet-l' : 'tablet-p');
      if (meta) meta.setAttribute('content', 'width=' + (land ? 1366 : 1024) + ', viewport-fit=cover');
    } else {
      d.setAttribute('data-device', 'pc');
      var k = Math.min(window.innerWidth / REF_W, window.innerHeight / REF_H, 1);
      d.style.setProperty('--vw', REF_W / 100 + 'px');
      d.style.setProperty('--vh', REF_H / 100 + 'px');
      // 기준 크기(2560×1440) 창에서는 아무것도 바꾸지 않는다 — 지금 화면과 화소 하나 다르지 않게
      var exact = window.innerWidth === REF_W && window.innerHeight === REF_H;
      d.style.zoom = exact || k === 1 ? '' : String(k);
      d.classList.toggle('ps-canvas', !exact);
    }
  }
  apply();
  // 창 크기 · 방향이 바뀌면 다시 맞춘다(갈래 자체는 처음 판정 그대로)
  var t;
  window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(apply, 60); });
  if (window.matchMedia) {
    var o = window.matchMedia('(orientation: landscape)');
    if (o.addEventListener) o.addEventListener('change', apply);
  }
})();
