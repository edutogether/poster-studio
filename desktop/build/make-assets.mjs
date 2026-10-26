/* 설치판 아이콘 · 설치 화면 그림 만들기(2026-10-27). 저장소 루트에서:  node desktop/build/make-assets.mjs [미리보기 폴더]

   만드는 것(desktop/build/ — 커밋한다, electron-builder가 읽는다):
     icon.ico                앱 아이콘(16 · 20 · 24 · 32 · 40 · 48 · 64 · 128 · 256) — InKY 로고 + 오른쪽 아래 «PS».
                             앱 실행 파일 · 바로가기 · 작업표시줄 · 앱 창 · «설치된 앱» 목록(제거 프로그램 아이콘)에 쓴다.
     installer.ico           설치 프로그램 아이콘 — InKY 로고만(글자 없음). 설치 파일 · 설치 창에 쓴다.
     installerSidebar.bmp    설치 · 제거 화면 왼쪽 그림(164×314 — NSIS 규격). 로고 원본 + 앱 이름, «PS» 없음
     installerHeader.bmp     설치 화면 위쪽 띠 그림(150×57 — NSIS 규격). 로고 원본만
     icon-spec.json          배지 수치

   규칙(2026-10-27 Bumm님, 팀장 전달):
   - 노란 InKY 로고 원본(_shared/favicons/inky-camera-512.png를 옮긴 desktop/build/inky-camera-512.png)을 다시 그리거나 색을 바꾸지 않고 그대로 줄여 깐다.
   - 오른쪽 아래에 모서리 둥근 검은 이름표와 흰 «PS»만 더한다. Voice Cinema 시안과 같은 모양 · 위치 · 비율이다.
     크기는 그 시안보다 작게(약 0.8배 — «너무 커서 화질 떨어지는 게 보인다»)다.
   - 글자는 앱 아이콘에만 넣는다. 설치 화면(머리 · 옆 그림, 설치 창 아이콘)에는 넣지 않는다.
   - 크기마다 따로 그린다(큰 그림을 줄이지 않는다). 16~32px는 글꼴을 줄이면 «P8»처럼 뭉개져, 화소 하나하나를 정한 글자를 찍는다
     (Voice Cinema 시안의 PIXEL_GLYPHS와 같은 모양). 40px 이상은 Pretendard ExtraBold로 쓴다. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const preview = process.argv[2];
GlobalFonts.registerFromPath(path.join(ROOT, 'public/fonts/Pretendard-Black.woff2'), 'Pretendard Black');
GlobalFonts.registerFromPath(path.join(ROOT, 'public/fonts/Pretendard-ExtraBold.woff2'), 'Pretendard ExtraBold');
GlobalFonts.registerFromPath(path.join(ROOT, 'public/fonts/Pretendard-Bold.woff2'), 'Pretendard Bold');
const logo = await loadImage(path.join(HERE, 'inky-camera-512.png'));

export const BADGE = {
  text: 'PS',
  fill: 'rgb(18, 18, 18)', // 거의 검정 — Voice Cinema 시안과 같은 값
  ink: '#ffffff',
  font: 'Pretendard ExtraBold',
  // 크기 → [이름표 너비, 높이, 모서리 반지름, 글자]. 이름표는 오른쪽 아래 모서리에 붙는다(x = 크기 − 너비, y = 크기 − 높이).
  // 글자가 'pixel5' 등이면 화소 글자, 숫자면 Pretendard ExtraBold의 대문자 높이(px). 너비 ÷ 높이 ≈ 1.6, 대문자 ÷ 높이 ≈ 0.57(시안과 같음).
  // Voice Cinema 시안(괄호)보다 작게: 16 (12×7) · 20 (14×9) · 24 (16×11) · 32 (20×13) · 40 (24×16) · 48 (28×18) · 64 (36×22) · 128 (56×35) · 256 (112×70).
  // 16 · 20px의 11×7은 화소 글자 «PS»(4 + 1 + 4 = 9칸)에 좌우 1칸 · 위아래 1칸만 둔 가장 작은 이름표다.
  sizes: {
    16: [11, 7, 1, 'pixel5'],
    20: [11, 7, 1, 'pixel5'],
    24: [14, 9, 2, 'pixel7'],
    32: [17, 11, 2, 'pixel9'],
    40: [20, 13, 3, 8],
    48: [23, 15, 3, 9],
    64: [30, 19, 4, 11],
    128: [46, 29, 7, 17],
    256: [92, 58, 13, 33],
  },
};
// Voice Cinema 시안(desktop/tools/make-icons.py PIXEL_GLYPHS)과 같은 화소 글자. X = 칠함, 글자 사이 1칸.
const GLYPHS = {
  pixel5: {
    P: ['XXX.', 'X..X', 'XXX.', 'X...', 'X...'],
    S: ['.XXX', 'X...', '.XX.', '...X', 'XXX.'],
  },
  pixel7: {
    P: ['XXXX.', 'XX.XX', 'XX.XX', 'XXXX.', 'XX...', 'XX...', 'XX...'],
    S: ['.XXXX', 'XX...', 'XX...', '.XXX.', '...XX', '...XX', 'XXXX.'],
  },
  pixel9: {
    P: ['XXXXX.', 'XXXXXX', 'XX..XX', 'XX..XX', 'XXXXXX', 'XXXXX.', 'XX....', 'XX....', 'XX....'],
    S: ['.XXXXX', 'XXXXXX', 'XX....', 'XXXXX.', '.XXXXX', '....XX', '....XX', 'XXXXXX', 'XXXXX.'],
  },
};

function drawLogo(c, S) {
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.drawImage(logo, 0, 0, S, S);
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** 로고만(설치 프로그램 아이콘) 또는 로고 + «PS»(앱 아이콘). */
function iconPixels(S, withBadge = true) {
  const cv = createCanvas(S, S);
  const c = cv.getContext('2d');
  drawLogo(c, S);
  if (!withBadge) return cv;
  const [w, h, r, glyph] = BADGE.sizes[S];
  const x0 = S - w, y0 = S - h;
  if (typeof glyph === 'string') {
    // 화소 이름표: 모서리 r화소를 계단으로 깎은 사각형(흐림 없이) + 화소 글자
    const img = c.getImageData(0, 0, S, S);
    const set = (x, y, [R, G, B]) => { const i = (y * S + x) * 4; img.data[i] = R; img.data[i + 1] = G; img.data[i + 2] = B; img.data[i + 3] = 255; };
    const cut = (dx, dy) => dx + dy < r; // 모서리에서 맨해튼 거리 r 미만은 비운다(r=1: 모서리 1화소 · r=2: 3화소)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = Math.min(x, w - 1 - x), dy = Math.min(y, h - 1 - y);
      if (cut(dx, dy)) continue;
      set(x0 + x, y0 + y, [18, 18, 18]);
    }
    const glyphs = [...BADGE.text].map((ch) => GLYPHS[glyph][ch]);
    const textW = glyphs.reduce((sum, g) => sum + g[0].length, 0) + (glyphs.length - 1);
    let tx = x0 + Math.floor((w - textW) / 2);
    const ty = y0 + Math.floor((h - glyphs[0].length) / 2);
    for (const g of glyphs) {
      g.forEach((row, yy) => [...row].forEach((cell, xx) => { if (cell === 'X') set(tx + xx, ty + yy, [255, 255, 255]); }));
      tx += g[0].length + 1;
    }
    c.putImageData(img, 0, 0);
  } else {
    c.fillStyle = BADGE.fill;
    roundRect(c, x0, y0, w, h, r);
    c.fill();
    // 대문자 높이 = 글꼴 크기 × 0.71(Pretendard) — 글줄 기준선을 화소에 맞춰 흐림을 줄인다
    c.font = `${Math.round(glyph / 0.71)}px "${BADGE.font}"`;
    c.textBaseline = 'alphabetic';
    c.textAlign = 'left';
    const m = c.measureText(BADGE.text);
    const left = m.actualBoundingBoxLeft, width = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
    c.fillStyle = BADGE.ink;
    c.fillText(BADGE.text, Math.round(x0 + (w - width) / 2 + left), Math.round(y0 + (h + glyph) / 2));
  }
  return cv;
}

/** 32비트 BGRA 비트맵(DIB) 항목 — 작은 크기는 PNG보다 옛 프로그램(설치기 NSIS 포함)이 확실히 읽는다. 256은 PNG로 넣는다(Windows 규약). */
function dibEntry(cv) {
  const S = cv.width;
  const { data } = cv.getContext('2d').getImageData(0, 0, S, S);
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0); header.writeInt32LE(S, 4); header.writeInt32LE(S * 2, 8);
  header.writeUInt16LE(1, 12); header.writeUInt16LE(32, 14); header.writeUInt32LE(S * S * 4, 20);
  const xor = Buffer.alloc(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const src = (y * S + x) * 4, dst = ((S - 1 - y) * S + x) * 4;
    xor[dst] = data[src + 2]; xor[dst + 1] = data[src + 1]; xor[dst + 2] = data[src]; xor[dst + 3] = data[src + 3];
  }
  const rowBytes = Math.ceil(S / 32) * 4;
  const and = Buffer.alloc(rowBytes * S); // 모두 0 = 알파 채널을 따른다
  return Buffer.concat([header, xor, and]);
}

function writeIco(file, canvases) {
  const entries = canvases.map((cv) => (cv.width >= 256 ? cv.toBuffer('image/png') : dibEntry(cv)));
  const head = Buffer.alloc(6 + 16 * entries.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(entries.length, 4);
  let offset = head.length;
  entries.forEach((buf, i) => {
    const S = canvases[i].width, at = 6 + i * 16;
    head.writeUInt8(S >= 256 ? 0 : S, at); head.writeUInt8(S >= 256 ? 0 : S, at + 1);
    head.writeUInt16LE(1, at + 4); head.writeUInt16LE(32, at + 6);
    head.writeUInt32LE(buf.length, at + 8); head.writeUInt32LE(offset, at + 12);
    offset += buf.length;
  });
  fs.writeFileSync(file, Buffer.concat([head, ...entries]));
}

/** 24비트 BMP(NSIS 설치 화면 그림 규격). 투명이 없으므로 흰 바탕 위에 그린 캔버스를 넘긴다. */
function writeBmp(file, cv) {
  const { width: W, height: H } = cv;
  const { data } = cv.getContext('2d').getImageData(0, 0, W, H);
  const rowBytes = Math.ceil((W * 3) / 4) * 4;
  const pixels = Buffer.alloc(rowBytes * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const src = (y * W + x) * 4, dst = (H - 1 - y) * rowBytes + x * 3;
    pixels[dst] = data[src + 2]; pixels[dst + 1] = data[src + 1]; pixels[dst + 2] = data[src];
  }
  const head = Buffer.alloc(54);
  head.write('BM', 0); head.writeUInt32LE(54 + pixels.length, 2); head.writeUInt32LE(54, 10);
  head.writeUInt32LE(40, 14); head.writeInt32LE(W, 18); head.writeInt32LE(H, 22);
  head.writeUInt16LE(1, 26); head.writeUInt16LE(24, 28); head.writeUInt32LE(pixels.length, 34);
  head.writeInt32LE(2835, 38); head.writeInt32LE(2835, 42);
  fs.writeFileSync(file, Buffer.concat([head, pixels]));
}

// 설치 화면 왼쪽 그림: 흰 바탕 · 로고 · 앱 이름 · 아래 InKY 노랑 띠
function sidebar() {
  const W = 164, H = 314;
  const cv = createCanvas(W, H);
  const c = cv.getContext('2d');
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#ffe700'; c.fillRect(0, H - 22, W, 22);
  const L = 116;
  c.imageSmoothingQuality = 'high';
  c.drawImage(logo, (W - L) / 2, 40, L, L);
  c.fillStyle = '#1d1d1f'; c.textAlign = 'center';
  c.font = '22px "Pretendard Black"'; c.fillText('Poster', W / 2, 196); c.fillText('Studio', W / 2, 222);
  c.fillStyle = '#6b6b70'; c.font = '11px "Pretendard Bold"'; c.fillText('InKY Film Festival', W / 2, 252);
  return cv;
}
// 설치 화면 위쪽 띠 그림(오른쪽 끝): 흰 바탕 · 로고
function header() {
  const W = 150, H = 57;
  const cv = createCanvas(W, H);
  const c = cv.getContext('2d');
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H);
  const L = 64;
  c.imageSmoothingQuality = 'high';
  c.drawImage(logo, W - L - 6, (H - L) / 2, L, L);
  return cv;
}

const SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const icons = SIZES.map((S) => iconPixels(S, true));
writeIco(path.join(HERE, 'icon.ico'), icons);
writeIco(path.join(HERE, 'installer.ico'), SIZES.map((S) => iconPixels(S, false)));
writeBmp(path.join(HERE, 'installerSidebar.bmp'), sidebar());
writeBmp(path.join(HERE, 'installerHeader.bmp'), header());
fs.writeFileSync(path.join(HERE, 'icon-spec.json'), JSON.stringify({ source: '_shared/favicons/inky-camera-512.png', sizes: SIZES, badge: BADGE, glyphs: GLYPHS }, null, 2) + '\n');
console.log('만듦: icon.ico(' + SIZES.join(' · ') + ') · installer.ico · installerSidebar.bmp · installerHeader.bmp · icon-spec.json');

if (preview) {
  fs.mkdirSync(preview, { recursive: true });
  // 크기별 원본 PNG + 8배로 키운 판(화소 그대로) + 밝은 · 어두운 작업표시줄 바탕에 놓은 실제 크기 판
  icons.forEach((cv) => fs.writeFileSync(path.join(preview, `icon-${cv.width}.png`), cv.toBuffer('image/png')));
  const sheet = createCanvas(1700, 520);
  const s = sheet.getContext('2d');
  s.fillStyle = '#f3f3f3'; s.fillRect(0, 0, 1700, 260); s.fillStyle = '#202020'; s.fillRect(0, 260, 1700, 260);
  s.imageSmoothingEnabled = false;
  let x = 16;
  for (const cv of icons.filter((i) => i.width <= 48)) {
    const z = Math.floor(200 / cv.width);
    s.drawImage(cv, x, 30, cv.width * z, cv.width * z);
    s.drawImage(cv, x, 290, cv.width * z, cv.width * z);
    x += cv.width * z + 24;
  }
  x = 1350;
  for (const cv of icons.filter((i) => [16, 24, 32, 48].includes(i.width))) {
    s.drawImage(cv, x, 120, cv.width, cv.width); s.drawImage(cv, x, 380, cv.width, cv.width); x += cv.width + 18;
  }
  fs.writeFileSync(path.join(preview, 'icon-sheet.png'), sheet.toBuffer('image/png'));
  fs.writeFileSync(path.join(preview, 'installerSidebar.png'), sidebar().toBuffer('image/png'));
  fs.writeFileSync(path.join(preview, 'installerHeader.png'), header().toBuffer('image/png'));
}
