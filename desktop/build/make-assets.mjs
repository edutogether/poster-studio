/* 설치판 아이콘 · 설치 화면 그림 만들기(2026-10-27). 저장소 루트에서:  node desktop/build/make-assets.mjs [미리보기 폴더]

   만드는 것(desktop/build/ — 커밋한다, electron-builder가 읽는다):
     icon.ico                아이콘(16 · 20 · 24 · 32 · 40 · 48 · 64 · 128 · 256) — InKY 로고 + 오른쪽 아래 «PS».
                             앱 실행 파일 · 바로가기 · 작업표시줄 · 앱 창 · «설치된 앱» 목록, 그리고 설치 파일 · 설치 창 · 제거 프로그램에 쓴다.
     installer-art/header-<배율>.bmp   설치 화면 머리 로고(로고 + «PS») — 배율 100~300%마다 칸 크기(100%에서 175×53) 그대로
     installer-art/finish-<배율>.bmp   설치 완료 화면 왼쪽 그림(영화관 + 제목 글귀) — 배율마다 칸 크기(100%에서 191×290) 그대로
     installerHeader.bmp · installerSidebar.bmp   위 두 그림의 100% 판(electron-builder 설정의 기본 그림). 설치기는 칸에 맞는 판으로 바꾼다(installer.nsh)
     uninstallerSidebar.bmp  제거 화면 왼쪽 그림(191×290) — 로고 + «PS» · 앱 이름
     icon-spec.json          배지 · 설치 화면 그림 수치

   규칙(2026-10-27 Bumm님, 팀장 전달):
   - 노란 InKY 로고 원본(_shared/favicons/inky-camera-512.png를 옮긴 desktop/build/inky-camera-512.png)을 다시 그리거나 색을 바꾸지 않고 그대로 줄여 깐다.
   - 오른쪽 아래에 모서리 둥근 검은 이름표와 흰 «PS»만 더한다. Voice Cinema 시안과 같은 모양 · 위치 · 비율이다.
     크기는 그 시안보다 작게(약 0.8배 — «너무 커서 화질 떨어지는 게 보인다»)다.
   - «PS»는 설치 파일 아이콘 · 설치 화면 로고에도 넣는다(10/27 오전 Bumm님이 설치해 보고 기준을 바꿈 — 처음엔 앱 아이콘에만 넣었다).
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

/** 로고 + «PS»를 S×S 정사각에 그린다(아이콘 · 설치 화면 머리 로고 · 제거 화면 그림).
    BADGE.sizes에 없는 크기(설치 화면 그림 안의 로고)는 256 기준 수치를 S/256배로 줄인다 — 40px 이상이라 글꼴 글자로 쓴다. */
function iconPixels(S) {
  const cv = createCanvas(S, S);
  const c = cv.getContext('2d');
  drawLogo(c, S);
  const k = S / 256, [w256, h256, r256, cap256] = BADGE.sizes[256];
  const [w, h, r, glyph] = BADGE.sizes[S] ?? [Math.round(w256 * k), Math.round(h256 * k), Math.max(2, Math.round(r256 * k)), Math.round(cap256 * k)];
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


// ── 설치 화면 그림(2026-10-27 Bumm님 설치 확인 뒤 지시, 팀장 전달) ──────────────────────────────────────────────
// NSIS 설치 화면의 그림 칸은 한글 Windows 글꼴로 정해진다 — 화면 배율 100%에서 머리 로고 칸 175×53, 완료 · 제거 화면 왼쪽 칸 191×290
// (desktop-installer-probe.ps1이 잰 값, 10/27). NSIS 규격 크기(150×57 · 164×314)로 그리면 칸에 맞게 비율 없이 늘어나 «가로로 늘어나 깨져» 보였다.
// 그래서 칸 크기 그대로, 화면 배율마다(SCALES) 따로 그려 둔다. 설치기는 칸의 실제 너비를 재서 가장 가까운 판을 고른다(installer.nsh).
export const ART = {
  scales: [100, 125, 150, 175, 200, 225, 250, 300],
  header: [175, 53],
  finish: [191, 290],
};
const theater = await loadImage(path.join(ROOT, 'public/studio/theater.webp'));
GlobalFonts.registerFromPath(path.join(ROOT, 'public/fonts/Pretendard-Regular.woff2'), 'Pretendard Regular');
GlobalFonts.registerFromPath(path.join(ROOT, 'public/fonts/Pretendard-Medium.woff2'), 'Pretendard Medium');
const at = (base, pct) => base.map((v) => Math.round((v * pct) / 100));
// 로고 원본 512 정사각에서 그림이 있는 세로 범위는 97~410이고, «PS» 이름표는 정사각 아래 끝에 붙는다 — 이름표까지 보이는 높이 = 정사각의 (512 − 97)/512
const BADGED_LOGO_TALL = (512 - 97) / 512;

// 머리 로고: 흰 바탕 오른쪽에 로고 + «PS». 칸 위아래에 4px(100% 기준) 여백.
function header(W, H) {
  const s = H / ART.header[1];
  const cv = createCanvas(W, H);
  const c = cv.getContext('2d');
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H);
  const m = Math.round(4 * s);
  const S = Math.round((H - 2 * m) / BADGED_LOGO_TALL);
  c.drawImage(iconPixels(S), W - S - Math.round(8 * s), H - m - S);
  return cv;
}

// 완료 화면 왼쪽 그림: 웹 첫 화면 왼쪽 영화관(public/studio/theater.webp · cinema.css의 그늘 · 글자 색)에 제목 글귀만 얹는다.
// 왼쪽 위 «• Poster Studio · CGV 인천»과 아래 티켓은 넣지 않는다(10/27 Bumm님).
function finish(W, H) {
  const s = W / ART.finish[0];
  const cv = createCanvas(W, H);
  const c = cv.getContext('2d');
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  const k = Math.max(W / theater.width, H / theater.height);
  c.drawImage(theater, (W - theater.width * k) / 2, (H - theater.height * k) / 2, theater.width * k, theater.height * k);
  const g = c.createLinearGradient(0, 0, 0, H);
  [[0, '#1010103d'], [0.27, '#10101018'], [0.56, '#10101099'], [0.81, '#141414f0'], [1, '#141414']].forEach(([o, col]) => g.addColorStop(o, col));
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  const pad = 14 * s, maxW = W - 2 * pad;
  c.textBaseline = 'alphabetic'; c.textAlign = 'left';
  // 아래부터 쌓는다: 설명 두 줄 → 제목 두 줄 → 영화제 이름
  const desc = { size: 9.5 * s, line: 9.5 * s * 1.6, font: 'Pretendard Regular', color: '#dedede' };
  c.font = `${desc.size}px "${desc.font}"`; c.letterSpacing = '0px';
  // 뜻 단위로 끊는다(«…극장에서 / 만나는 …»). 칸이 좁아 안 들어가는 줄만 낱말 단위로 다시 나눈다.
  const lines = [];
  for (const phrase of ['인천을 대표하는 극장에서', '만나는 나의 첫 번째 영화 포스터']) {
    let cur = '';
    for (const w of phrase.split(' ')) {
      const next = cur ? `${cur} ${w}` : w;
      if (cur && c.measureText(next).width > maxW) { lines.push(cur); cur = w; } else cur = next;
    }
    lines.push(cur);
  }
  let y = H - 16 * s - desc.line * (lines.length - 1);
  c.fillStyle = desc.color;
  lines.forEach((t, i) => c.fillText(t, pad, y + desc.line * i));
  // 제목: 두 줄이 다 들어가는 가장 큰 크기(최대 26px · 100% 기준). 글자 사이는 웹과 같은 비율(−2.2/61em).
  let size = 26 * s;
  const fit = () => { c.font = `${size}px "Pretendard ExtraBold"`; c.letterSpacing = `${(-2.2 / 61) * size}px`; return Math.max(c.measureText('이번 영화의').width, c.measureText('주인공은, 나.').width); };
  while (fit() > maxW) size -= 0.5 * s;
  const titleLine = size * 1.16;
  const t2 = y - desc.line - 6 * s;        // 둘째 줄 기준선
  const t1 = t2 - titleLine;
  c.fillStyle = '#ffffff';
  c.fillText('이번 영화의', pad, t1);
  const head = '주인공은, ';
  c.fillText(head, pad, t2);
  c.fillStyle = '#ff5148';
  c.fillText('나.', pad + c.measureText(head).width, t2);
  c.font = `${9.5 * s}px "Pretendard Medium"`; c.letterSpacing = `${-0.15 * s}px`;
  c.fillStyle = '#dedede';
  c.fillText('제4회 인천어린이청소년영화제', pad, t1 - size - 7 * s);
  c.letterSpacing = '0px';
  return cv;
}

// 제거 화면 왼쪽 그림(배율 하나 — 191×290): 흰 바탕 · 로고 + «PS» · 앱 이름 · 아래 InKY 노랑 띠
function unSidebar() {
  const [W, H] = ART.finish;
  const cv = createCanvas(W, H);
  const c = cv.getContext('2d');
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#ffe700'; c.fillRect(0, H - 20, W, 20);
  const L = 132;
  c.drawImage(iconPixels(L), (W - L) / 2, 22);
  c.fillStyle = '#1d1d1f'; c.textAlign = 'center';
  c.font = '23px "Pretendard Black"'; c.fillText('Poster', W / 2, 184); c.fillText('Studio', W / 2, 210);
  c.fillStyle = '#6b6b70'; c.font = '11px "Pretendard Bold"'; c.fillText('InKY Film Festival', W / 2, 238);
  return cv;
}

const SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const icons = SIZES.map((S) => iconPixels(S));
writeIco(path.join(HERE, 'icon.ico'), icons);
const ARTDIR = path.join(HERE, 'installer-art');
fs.rmSync(ARTDIR, { recursive: true, force: true });
fs.mkdirSync(ARTDIR);
const headers = ART.scales.map((pct) => [pct, header(...at(ART.header, pct))]);
const finishes = ART.scales.map((pct) => [pct, finish(...at(ART.finish, pct))]);
headers.forEach(([pct, cv]) => writeBmp(path.join(ARTDIR, `header-${pct}.bmp`), cv));
finishes.forEach(([pct, cv]) => writeBmp(path.join(ARTDIR, `finish-${pct}.bmp`), cv));
// electron-builder 설정의 기본 그림(설치기 안에 늘 들어가는 것) — 100% 판. 설치기는 시작할 때 칸에 맞는 판으로 바꾼다.
writeBmp(path.join(HERE, 'installerHeader.bmp'), headers[0][1]);
writeBmp(path.join(HERE, 'installerSidebar.bmp'), finishes[0][1]);
writeBmp(path.join(HERE, 'uninstallerSidebar.bmp'), unSidebar());
fs.rmSync(path.join(HERE, 'installer.ico'), { force: true }); // 10/27: 설치 파일 아이콘도 «PS» 앱 아이콘(icon.ico)을 쓴다
fs.writeFileSync(path.join(HERE, 'icon-spec.json'), JSON.stringify({ source: '_shared/favicons/inky-camera-512.png', sizes: SIZES, badge: BADGE, glyphs: GLYPHS, installerArt: ART }, null, 2) + '\n');
console.log('만듦: icon.ico(' + SIZES.join(' · ') + ') · installer-art/header · finish(' + ART.scales.join(' · ') + '%) · installerHeader.bmp · installerSidebar.bmp · uninstallerSidebar.bmp · icon-spec.json');

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
  headers.forEach(([pct, cv]) => fs.writeFileSync(path.join(preview, `installer-header-${pct}.png`), cv.toBuffer('image/png')));
  finishes.forEach(([pct, cv]) => fs.writeFileSync(path.join(preview, `installer-finish-${pct}.png`), cv.toBuffer('image/png')));
  fs.writeFileSync(path.join(preview, 'uninstaller-sidebar.png'), unSidebar().toBuffer('image/png'));
}
