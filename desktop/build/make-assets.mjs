/* 설치판 아이콘 · 설치 화면 그림 만들기(2026-10-27). 저장소 루트에서:  node desktop/build/make-assets.mjs [미리보기 폴더]

   만드는 것(desktop/build/ — 커밋한다, electron-builder가 읽는다):
     icon.ico                Windows 아이콘(16 · 20 · 24 · 32 · 40 · 48 · 64 · 128 · 256). 앱 · 바로가기 · 작업표시줄 · 설치 · 제거 프로그램에 같이 쓴다.
     installerSidebar.bmp    설치 · 제거 화면 왼쪽 그림(164×314 — NSIS 규격)
     installerHeader.bmp     설치 화면 위쪽 띠 그림(150×57 — NSIS 규격)
     icon-spec.json          배지 수치(Voice Cinema «VC»와 맞추려고 — 같은 수치를 작업자료 폴더에도 남긴다)

   아이콘 = 노란 InKY 로고 원본(_shared/favicons/inky-camera-512.png를 저장소에 옮긴 desktop/build/inky-camera-512.png — 웹 파비콘의 원본 계열)을
   그대로 깔고(다시 그리거나 색을 바꾸지 않는다), 오른쪽 아래에 «PS» 배지만 얹는다(2026-10-27 Bumm님).
   작은 크기(16~32px)는 글꼴 글자가 뭉개져 «PS»를 화소 단위로 찍는다 — 작업표시줄(24 · 32px)에서도 읽혀야 한다. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const preview = process.argv[2];
GlobalFonts.registerFromPath(path.join(ROOT, 'public/fonts/Pretendard-Black.woff2'), 'Pretendard Black');
GlobalFonts.registerFromPath(path.join(ROOT, 'public/fonts/Pretendard-Bold.woff2'), 'Pretendard Bold');
const logo = await loadImage(path.join(HERE, 'inky-camera-512.png'));

export const BADGE = {
  text: 'PS',
  fill: '#d82d23', // 앱의 주 단추 빨강(src/studio/cinema.css .primary-button) — 노란 로고 위에서도, 밝은 · 어두운 작업표시줄에서도 보인다
  ink: '#ffffff',
  font: 'Pretendard Black',
  // 40px 이상: 아이콘 한 변(S)에 대한 비율. 배지는 오른쪽 아래 모서리에 붙인다(x = S − w, y = S − h).
  large: { w: 0.46, h: 0.32, radius: 0.07, fontSize: 0.25, letterSpacing: -0.01 },
  // 32px 이하: 화소로 찍는다. 글자 한 칸 = 3×5(16 · 20px) · 4×7(24 · 32px), 글자 사이 1칸, 배지 안쪽 여백 1칸(위아래 같음).
  // 배지 모서리는 1화소만 깎는다. w · h는 화소 수다.
  small: {
    16: { cell: 1, glyph: '3x5', w: 9, h: 7 },
    20: { cell: 1, glyph: '3x5', w: 9, h: 7 },
    24: { cell: 1, glyph: '4x7', w: 11, h: 9 },
    32: { cell: 1, glyph: '4x7', w: 13, h: 11 },
  },
};
const GLYPHS = {
  '3x5': {
    P: ['###', '#.#', '###', '#..', '#..'],
    S: ['###', '#..', '###', '..#', '###'],
    V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
    C: ['###', '#..', '#..', '#..', '###'],
  },
  '4x7': {
    P: ['###.', '#..#', '#..#', '###.', '#...', '#...', '#...'],
    S: ['.###', '#...', '#...', '.##.', '...#', '...#', '###.'],
    V: ['#..#', '#..#', '#..#', '#..#', '#..#', '.##.', '.##.'],
    C: ['.###', '#...', '#...', '#...', '#...', '#...', '.###'],
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

function iconPixels(S) {
  const cv = createCanvas(S, S);
  const c = cv.getContext('2d');
  drawLogo(c, S);
  const small = BADGE.small[S];
  if (small) {
    // 화소 배지: 모서리 1화소 깎은 사각형 + 화소 글자
    const k = small.scale ?? 1;
    const w = Math.round(small.w * k), h = Math.round(small.h * k);
    const x0 = S - w, y0 = S - h;
    c.fillStyle = BADGE.fill;
    c.fillRect(x0 + 1, y0, w - 1, h);
    c.fillRect(x0, y0 + 1, 1, h - 2);
    const [gw, gh] = small.glyph.split('x').map(Number);
    const textW = gw * 2 + 1, cellPx = k;
    const tx = x0 + Math.floor((w - textW * cellPx) / 2), ty = y0 + Math.floor((h - gh * cellPx) / 2);
    c.fillStyle = BADGE.ink;
    [...BADGE.text].forEach((ch, i) => {
      GLYPHS[small.glyph][ch].forEach((row, ry) => [...row].forEach((on, rx) => {
        if (on === '#') c.fillRect(tx + Math.round((i * (gw + 1) + rx) * cellPx), ty + Math.round(ry * cellPx), Math.ceil(cellPx), Math.ceil(cellPx));
      }));
    });
  } else {
    const L = BADGE.large;
    const w = Math.round(L.w * S), h = Math.round(L.h * S);
    const x0 = S - w, y0 = S - h;
    c.fillStyle = BADGE.fill;
    roundRect(c, x0, y0, w, h, Math.round(L.radius * S));
    c.fill();
    c.fillStyle = BADGE.ink;
    const size = Math.round(L.fontSize * S);
    c.font = `${size}px "${BADGE.font}"`;
    c.letterSpacing = `${(L.letterSpacing * size).toFixed(2)}px`;
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    const m = c.measureText(BADGE.text);
    const capH = m.actualBoundingBoxAscent; // 대문자 높이
    c.fillText(BADGE.text, x0 + w / 2, y0 + (h + capH) / 2);
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
const icons = SIZES.map(iconPixels);
writeIco(path.join(HERE, 'icon.ico'), icons);
writeBmp(path.join(HERE, 'installerSidebar.bmp'), sidebar());
writeBmp(path.join(HERE, 'installerHeader.bmp'), header());
fs.writeFileSync(path.join(HERE, 'icon-spec.json'), JSON.stringify({ source: '_shared/favicons/inky-camera-512.png', sizes: SIZES, badge: BADGE, glyphs: GLYPHS }, null, 2) + '\n');
console.log('만듦: icon.ico(' + SIZES.join(' · ') + ') · installerSidebar.bmp · installerHeader.bmp · icon-spec.json');

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
