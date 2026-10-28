/* 설치판 아이콘 · 설치 화면 그림 만들기(2026-10-27). 저장소 루트에서:  node desktop/build/make-assets.mjs [미리보기 폴더]

   만드는 것(desktop/build/ — 커밋한다, electron-builder가 읽는다):
     icon.ico                아이콘(16 · 20 · 24 · 32 · 40 · 48 · 64 · 128 · 256) — Poster Studio 슬레이트.
                             앱 실행 파일 · 바로가기 · 작업표시줄 · 앱 창 · «설치된 앱» 목록, 그리고 설치 파일 · 설치 창 · 제거 프로그램에 쓴다.
     installer-art/header-<배율>.bmp   설치 화면 머리 로고(슬레이트) — 배율 100~300%마다 칸 크기(100%에서 175×53) 그대로
     installer-art/finish-<배율>.bmp   설치 완료 화면 · 제거기 첫 화면 · 제거 완료 화면 왼쪽 그림(영화관 + 제목 글귀) — 배율마다 칸 크기(100%에서 191×290) 그대로
     installerHeader.bmp · installerSidebar.bmp   위 두 그림의 100% 판(electron-builder 설정의 기본 그림 — installerSidebar는 제거기 그림 칸에도 쓴다).
                             설치기 · 제거기는 칸에 맞는 판으로 바꾼다(installer.nsh). 예전 제거기 전용 그림(흰 바탕 슬레이트)은 10/28 Bumm님 지시로 걷었다.
     icon-spec.json          원본 · 크기 · 설치 화면 그림 수치

   규칙(2026-10-27 Bumm님 «포스터 스튜디오 원래 아이콘 있잖아 ? 그 슬레이트 하자», 팀장 전달):
   - 원본은 웹이 쓰는 Poster Studio 슬레이트 public/studio/clapperboard-apple.png(160×160 투명 PNG)다. 다시 그리거나 색을 바꾸지 않는다.
   - InKY 로고와 «PS» 이름표는 넣지 않는다 — 슬레이트만으로 앱이 구분된다(그 전 판은 InKY 로고 + «PS»였다).
   - 크기마다 원본에서 따로 다시 표본을 뜬다(Lanczos3, 알파를 곱한 값으로 — 투명한 가장자리에 검은 테가 끼지 않게). 16~128은 줄이고,
     원본보다 큰 256만 같은 보간으로 키운다(원본이 160이라 확대가 불가피). 여백 · 비율은 원본 정사각 그대로다. */
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
const SLATE_SRC = 'public/studio/clapperboard-apple.png';
const slate = await loadImage(path.join(ROOT, SLATE_SRC));

/** Lanczos3로 정사각 원본을 S×S로 다시 뜬다(가로 → 세로 두 번). 줄일 때는 창을 넓혀 원본 화소를 고르게 모은다. 알파를 곱한 값으로 계산해
    투명한 곳의 색이 가장자리로 번지지 않게 하고, 넘친 값(링잉)은 0~255로 자른다. */
function lanczos(src, S) {
  const N = src.width;
  const sc = createCanvas(N, N).getContext('2d');
  sc.drawImage(src, 0, 0);
  const s = sc.getImageData(0, 0, N, N).data;
  const pm = new Float64Array(N * N * 4);
  for (let i = 0; i < N * N; i++) { const a = s[i * 4 + 3] / 255; pm[i * 4] = s[i * 4] * a; pm[i * 4 + 1] = s[i * 4 + 1] * a; pm[i * 4 + 2] = s[i * 4 + 2] * a; pm[i * 4 + 3] = s[i * 4 + 3]; }
  const A = 3, scale = S / N, stretch = Math.max(1, 1 / scale), radius = A * stretch;
  const kernel = (x) => { if (x === 0) return 1; if (Math.abs(x) >= A) return 0; const p = Math.PI * x; return (A * Math.sin(p) * Math.sin(p / A)) / (p * p); };
  const taps = Array.from({ length: S }, (_, o) => {
    const center = (o + 0.5) / scale - 0.5, list = [];
    let sum = 0;
    for (let i = Math.floor(center - radius) + 1; i <= Math.floor(center + radius); i++) { const w = kernel((i - center) / stretch); if (w) { list.push([Math.min(N - 1, Math.max(0, i)), w]); sum += w; } }
    return list.map(([i, w]) => [i, w / sum]);
  });
  const mid = new Float64Array(S * N * 4);   // 가로만 줄인 것(S × N)
  for (let y = 0; y < N; y++) for (let x = 0; x < S; x++) for (const [i, w] of taps[x]) for (let k = 0; k < 4; k++) mid[(y * S + x) * 4 + k] += pm[(y * N + i) * 4 + k] * w;
  const cv = createCanvas(S, S);
  const c = cv.getContext('2d');
  const img = c.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const v = [0, 0, 0, 0];
    for (const [i, w] of taps[y]) for (let k = 0; k < 4; k++) v[k] += mid[(i * S + x) * 4 + k] * w;
    const a = Math.min(255, Math.max(0, v[3])), o = (y * S + x) * 4;
    for (let k = 0; k < 3; k++) img.data[o + k] = a > 0 ? Math.min(255, Math.max(0, Math.round((v[k] * 255) / a))) : 0;
    img.data[o + 3] = Math.round(a);
  }
  c.putImageData(img, 0, 0);
  return cv;
}

/** 슬레이트를 S×S 정사각으로(아이콘 · 설치 화면 머리 로고 · 제거 화면 그림). */
const slateIcon = (S) => lanczos(slate, S);

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
// 머리 로고: 흰 바탕 오른쪽에 슬레이트(원본 정사각 그대로 — 원본의 투명 여백까지). 칸 위아래에 4px(100% 기준) 여백.
function header(W, H) {
  const s = H / ART.header[1];
  const cv = createCanvas(W, H);
  const c = cv.getContext('2d');
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H);
  const m = Math.round(4 * s);
  const S = H - 2 * m;
  c.drawImage(slateIcon(S), W - S - Math.round(8 * s), m);
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

const SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const icons = SIZES.map((S) => slateIcon(S));
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
fs.rmSync(path.join(HERE, 'installer.ico'), { force: true }); // 10/27: 설치 파일 아이콘도 앱 아이콘(icon.ico)을 쓴다
fs.writeFileSync(path.join(HERE, 'icon-spec.json'), JSON.stringify({ source: SLATE_SRC, sourceSize: slate.width, resample: 'lanczos3 (alpha premultiplied)', sizes: SIZES, installerArt: ART }, null, 2) + '\n');
console.log('만듦: icon.ico(' + SIZES.join(' · ') + ') · installer-art/header · finish(' + ART.scales.join(' · ') + '%) · installerHeader.bmp · installerSidebar.bmp · icon-spec.json');

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
}
