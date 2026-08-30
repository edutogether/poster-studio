/* ────────────────────────────────────────────────────────────────────
   파비콘 — 📷 이모지를 캔버스에 그려 data URL로 만들어 <link rel="icon">에
   꽂는다(별도 이미지 파일 불필요). 탭이 비활성(포커스를 잃거나 백그라운드로
   감)이면 흑백 버전으로, 다시 활성화되면 컬러 버전으로 바꿔치기한다
   (대표 요청, 2026-08-31). visibilitychange만으로는 "다른 창에 가려졌지만
   여전히 보이는" 케이스를 못 잡아서 focus/blur도 같이 본다.
   ──────────────────────────────────────────────────────────────────── */

const FAVICON_SIZE = 64;

function renderColorFavicon() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = FAVICON_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.font = `${FAVICON_SIZE * 0.8}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('📷', FAVICON_SIZE / 2, FAVICON_SIZE / 2 + FAVICON_SIZE * 0.05);
  return canvas;
}

// ctx.filter='grayscale()'는 브라우저 지원이 갈릴 수 있어(구형 Safari 등),
// 픽셀 데이터를 직접 desaturate하는 방식(휘도 공식)으로 확실하게 흑백화한다.
function toGrayscale(canvas) {
  const ctx = canvas.getContext('2d');
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    d[i] = d[i + 1] = d[i + 2] = gray;
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

const colorCanvas = renderColorFavicon();
const COLOR_ICON = colorCanvas.toDataURL('image/png');
const GRAY_ICON = toGrayscale(renderColorFavicon()).toDataURL('image/png');

function setFaviconHref(href) {
  let link = document.querySelector("link[rel~='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = href;
}

function updateFavicon() {
  const active = document.visibilityState === 'visible' && document.hasFocus();
  setFaviconHref(active ? COLOR_ICON : GRAY_ICON);
}

document.addEventListener('visibilitychange', updateFavicon);
window.addEventListener('focus', updateFavicon);
window.addEventListener('blur', updateFavicon);
updateFavicon();
