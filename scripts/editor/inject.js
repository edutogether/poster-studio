/* global location, URLSearchParams, Navigator, FileReader, Response, HTMLMediaElement, Event */
/* 화면 편집판 — 앱(iframe) 안에서 앱보다 먼저 도는 준비(2026-10-23 Bumm님 «화면 편집 판», 팀장 전달).
   서버(AI · /health)와 생성 요청은 하나도 나가지 않는다 — 페이지 안에서 답한다. 카메라는 공개 예시 인물 그림을 흘려보내는 가짜 카메라다.
   휴대폰 · 태블릿 갈래는 그 기기의 브라우저 이름표(UA) · 터치로 흉내 낸다. 소리는 끈다. 앱 코드는 바꾸지 않는다. */
(() => {
  const q = new URLSearchParams(location.search);
  const cls = q.get('__class') || 'pc';
  const UA = {
    phone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    'tablet-l': 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    'tablet-p': 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  };
  if (UA[cls]) {
    Object.defineProperty(Navigator.prototype, 'userAgent', { get: () => UA[cls], configurable: true });
    Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 5, configurable: true });
    // 폰 · 태블릿의 스크롤 막대는 화면 위에 겹쳐 떠 폭을 차지하지 않는다 — 데스크톱 막대(15px)가 390px 폭을 375px로 줄이지 않게 감춘다
    const sb = document.createElement('style'); sb.textContent = '*{scrollbar-width:none!important}'; document.head.append(sb);
  }
  const SAMPLE = '/studio/camera-student.webp';
  const dataURL = async (src) => { const b = await (await net(src)).blob(); return new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); }); };
  const net = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const u = String((input && input.url) || input);
    if (/cloudfunctions\.net|\/generate\b|\/health\b/.test(u)) {
      if (/\/generate/.test(u)) {
        if (window.__psHoldGenerate) return new Promise(() => {});   // 로딩 화면에 머문다
        await new Promise((r) => setTimeout(r, 300));
        return new Response(JSON.stringify({ images: [await dataURL(SAMPLE)] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return net(input, init);
  };
  // 인쇄 창은 띄우지 않고 닫힌 것처럼 afterprint를 보낸다 — 앱이 인쇄용 큰 포스터를 그때 걷어 낸다
  window.print = () => { setTimeout(() => window.dispatchEvent(new Event('afterprint')), 0); };
  // 시작 화면(로고)을 고칠 때는 스플래시가 사라지는 애니메이션(splashOut)만 빼서 붙잡아 둔다 — 로고 · 막대는 그대로 움직인다
  // 다른 화면에서는 스플래시가 끝나기를 기다리지 않고 바로 걷어 낸다(끝나면 앱이 하는 일과 같다). 애니메이션 시계는 창이 가려지면 멈춰 영영 안 끝날 수 있다
  if (q.get('__screen') === 'splash') { const st = document.createElement('style'); st.textContent = '#splash{animation:none!important}'; document.head.append(st); }
  else document.addEventListener('DOMContentLoaded', () => document.getElementById('splash')?.remove());
  navigator.canShare = () => true;
  navigator.share = async () => {};
  // 저장 안내(6초) · 완성 알림처럼 저절로 사라지는 것을 편집하는 동안 붙잡아 둔다(편집판이 __psFreeze를 켤 때만)
  const st = window.setTimeout.bind(window);
  window.setTimeout = (fn, ms, ...a) => (window.__psFreeze && ms >= 1500 ? 0 : st(fn, ms, ...a));
  // 소리 끄기
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...a) { this.muted = true; return play.apply(this, a); };
  // 가짜 카메라: 예시 인물 그림을 캔버스에 그려 흘려보낸다(휴대폰은 세로 960×1280, 나머지는 1280×960)
  const md = navigator.mediaDevices || {};
  if (!navigator.mediaDevices) Object.defineProperty(navigator, 'mediaDevices', { value: md, configurable: true });
  md.getUserMedia = async () => {
    const img = new Image(); img.src = SAMPLE; await img.decode();
    const c = document.createElement('canvas');
    [c.width, c.height] = cls === 'phone' ? [960, 1280] : [1280, 960];
    const ctx = c.getContext('2d');
    const draw = () => { const s = Math.max(c.width / img.width, c.height / img.height); ctx.drawImage(img, (c.width - img.width * s) / 2, (c.height - img.height * s) / 2, img.width * s, img.height * s); };
    draw(); setInterval(draw, 100);
    return c.captureStream(15);
  };
  md.enumerateDevices = async () => [{ kind: 'videoinput', deviceId: 'ps-editor', label: '편집판 가짜 카메라', groupId: 'ps' }];
})();
