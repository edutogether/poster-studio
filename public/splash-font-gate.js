/* 스플래시 글꼴 게이트 — 스플래시를 그리기 **전에** 돈다(2026-10-10 Bumm님 결정, 팀장 전달).

   스플래시 글자를 그릴 두 굵기(index.html이 미리 받는 Studio 800·400)가 아직 없으면 <html>에
   .splash-fonts-wait를 붙여 스플래시 내용을 숨기고 모든 시계를 멈췄다가(src/studio/splash.css),
   글꼴이 오면 뗀다 — 내용은 그 글꼴로 한 번에 나타난다.

   왜 boot-splash.js가 아니라 여기인가: 예전에는 이 일을 스플래시 마크업 **뒤**의 boot-splash.js가 했는데,
   그 파일이 첫 화면보다 늦게 도착하면 게이트가 걸리기 전에 한두 프레임(15~84ms)이 그려졌다 — 막대 바탕선만
   보였다가 흰 화면이 됐다(이 PC 로컬 재현 느린 회선 3조건, 2026-10-10 녹화). 이 파일은 <body> 맨 앞,
   스플래시 마크업 **위**에서 읽힌다:
     - 앞선 스타일시트(머리의 main CSS 포함)가 다 읽힐 때까지 실행을 기다리므로 Studio 글꼴 정의가 이미 있다.
     - 이 파일이 끝날 때까지 그 아래(스플래시)는 문서에 없으므로 게이트보다 먼저 그려질 수 없다.
   CSP가 script-src 'self'라 인라인으로 쓰지 않고 파일로 둔다.

   ⚠ 막히는 쪽으로 실패하지 않는다: 이 파일이 안 돌면 클래스가 안 붙어 예전처럼 보이고, 글꼴이 끝내 안 와도
   3초(Studio의 font-display: block 대기와 같은 길이) 뒤에는 뗀다. */
(function () {
  var root = document.documentElement;
  var fonts = document.fonts;
  var SPLASH_FONTS = ['800 1em Studio', '400 1em Studio'];
  if (!fonts || !fonts.check || !fonts.load) return;
  if (SPLASH_FONTS.every(function (f) { return fonts.check(f); })) return;
  root.classList.add('splash-fonts-wait');
  var release = function () { root.classList.remove('splash-fonts-wait'); };
  Promise.all(SPLASH_FONTS.map(function (f) { return fonts.load(f); })).then(release, release);
  window.setTimeout(release, 3000);
})();
