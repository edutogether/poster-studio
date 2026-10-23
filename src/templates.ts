/** 그림 한 장을 서로 다른 면적·여백·프레임으로 조판하는 8종 디자인.
 *  2026-10-14 다시 설계(Bumm님) — 레퍼런스와 디자인별 «가져올 것»: _docs/intents/2026-10-14-poster-select-redesign/references.md
 *
 *  조판 원칙(8종 공통)
 *  - 위계는 세 단계: 제목(아주 크게) · 홍보 문구(중간) · 빌링(작게, 한 덩어리).
 *  - 제목은 기본 한 줄, 글자 수에 맞춰 크기가 자동으로 정해진다. 한 줄로 최소 크기 밑으로 내려가야 할 만큼 길 때만
 *    띄어쓰기 자리에서 균형 있게 줄을 바꾼다(단어 중간·조사 앞에서 끊지 않는다 — 한국어 조사는 앞말에 붙어 있으므로
 *    띄어쓰기에서만 끊으면 된다). 띄어쓰기가 없는 아주 긴 제목만 글자 단위로 나눈다.
 *  - 요소는 고정 좌표가 아니라 아래에서 위로 쌓는다 — 긴 제목·단체 출연진이 와도 서로 겹치지 않고 간격이 유지된다.
 *  - 바깥 여백은 디자인마다 한 값, 정렬은 디자인마다 한 축(왼쪽 선 또는 가운데 선)만 쓴다.
 *  - 문구는 바꾸지 않는다: 두 로고 · 홍보 문구 · 제목 · 주연/단체·출연 · 영화제명 · 날짜·장소. */
import { FEST, DATE, VENUE, W, H, type Genre } from './constants.js';
import { state, type Meta } from './state.js';
import { setLS, roundRect, drawOrgLogo } from './layout.js';
import { artColors, colorBlockSet, archSet, css, artTone, triptychGrade, luminance } from './palette.js';

export function creditMain(m: Meta) { return m.mode === 'group' ? m.groupName : `주연 · 감독   ${m.name}`; }
export function creditSub(m: Meta) { return m.mode === 'group' && m.members ? `출연  ${m.members}` : ''; }
export interface Template {
  label: string;
  render(ctx: CanvasRenderingContext2D, art: HTMLImageElement, m: Meta, g: Genre): void;
}
type Ctx = CanvasRenderingContext2D;
type Align = 'left' | 'center' | 'right';
const SANS = "'PretendardFull', sans-serif";
const SERIF = "'Noto Serif KR', serif";
const DISPLAY = "'Black Han Sans', sans-serif";
/** 폴라로이드 캡션 손글씨 — Gaegu 700(OFL): 획 굵기가 고른 유성 매직 느낌(2026-10-14 Dokdo와 같은 캡션으로 견줘 골랐다). */
const MARKER = "'Gaegu', 'PretendardFull', sans-serif";
/** 타이포그래피 세로 제목 — Song Myung(OFL): 옛 활판 명조의 굵고 가는 획 대비. */
const SONG = "'Song Myung', 'Noto Serif KR', serif";
const WHEN = `${DATE}  ·  ${VENUE}`;

/* ───────────── 글자 조판 ───────────── */
interface Style { family: string; weight: number; tracking?: number /* em */ }
interface Block { lines: string[]; size: number; style: Style; asc: number; desc: number; step: number; width: number; height: number }

function setFont(c: Ctx, s: Style, size: number) {
  c.font = `${s.weight} ${size}px ${s.family}`;
  setLS(c, (s.tracking ?? 0) * size);
}
/** 보이는 폭 — 캔버스는 마지막 글자 뒤에도 자간을 더해 재므로 그만큼 뺀다(2026-10-14 실측: 8글자 × 10px = 80px). */
function inkWidth(c: Ctx, s: Style, size: number, text: string) {
  setFont(c, s, size);
  return c.measureText(text).width - (s.tracking ?? 0) * size;
}
function block(c: Ctx, lines: string[], s: Style, size: number, lh: number): Block {
  setFont(c, s, size);
  let asc = 0, desc = 0, width = 0;
  for (const line of lines) {
    const mt = c.measureText(line);
    asc = Math.max(asc, mt.actualBoundingBoxAscent ?? size * 0.8);
    desc = Math.max(desc, mt.actualBoundingBoxDescent ?? size * 0.2);
    width = Math.max(width, inkWidth(c, s, size, line));
  }
  const step = size * lh;
  return { lines, size, style: s, asc, desc, step, width, height: asc + desc + (lines.length - 1) * step };
}
/** 줄을 바꾸면 안 되는 자리·좋은 자리 점수(한국어). 단어 사이(띄어쓰기)에서만 끊으므로 조사는 늘 앞말에 붙어 있다.
 *  - 한 음절 낱말 뒤는 끊지 않는다: 첫·두·긴·새·옛·한 같은 꾸밈말·수 낱말이 뒷말과 떨어진다(«두 / 줄로», «첫 / 번째»).
 *  - 마지막 줄이 한 음절만 남지 않게 한다.
 *  - 꾸미는 말(«찾는», «달리던»)은 꾸밈 받는 말과 붙는 쪽을 조금 더 좋게 친다.
 *  - 쉼표 뒤는 좋은 자리다. */
function breakPenalty(lines: string[], size: number) {
  let p = 0;
  lines.forEach((line, i) => {
    const words = line.split(' ');
    const last = (words[words.length - 1] ?? '').replace(/[,，.!?·…:]+$/, '');
    if (i < lines.length - 1) {
      if ([...last].length === 1) p += size * 4;
      else if (/[는던]$/.test(last) && !/[,，]$/.test(line)) p += size * 0.5;
      if (/[,，·:]$/.test(line)) p -= size * 0.6;
    } else if ([...line.replace(/\s/g, '')].length === 1) p += size * 4;
  });
  return p;
}
/** 단어 묶음을 n줄로 나누는 모든 방법 중 «가장 긴 줄 + 줄바꿈 자리 점수»가 가장 작은 것(균형 + 의미 단위). */
function balanced(c: Ctx, words: string[], n: number, s: Style, size: number): string[] | null {
  let best: string[] | null = null, bestScore = Infinity;
  const walk = (start: number, left: number, acc: string[]) => {
    if (left === 1) {
      const lines = [...acc, words.slice(start).join(' ')];
      const widths = lines.map((l) => inkWidth(c, s, size, l));
      const score = Math.max(...widths) + breakPenalty(lines, size);
      if (score < bestScore) { bestScore = score; best = lines; }
      return;
    }
    for (let i = start + 1; i <= words.length - left + 1; i++) walk(i, left - 1, [...acc, words.slice(start, i).join(' ')]);
  };
  if (words.length >= n) walk(0, n, []);
  return best;
}
interface FitOpts { width: number; max: number; min: number; oneLineMin?: number; max2?: number; maxLines?: number; lh?: number; maxHeight?: number }
/** 제목 맞춤 — 한 줄(최대 → oneLineMin) → 띄어쓰기 균형 2줄·3줄(max2 → min) → 띄어쓰기 없는 긴 제목만 글자 단위. */
function fitTitle(c: Ctx, text: string, s: Style, o: FitOpts): Block {
  const lh = o.lh ?? 1.08, one = o.oneLineMin ?? o.min, max2 = o.max2 ?? o.max;
  const ok = (b: Block) => b.width <= o.width && (o.maxHeight == null || b.height <= o.maxHeight);
  const t = text.trim();
  for (let size = o.max; size >= one; size -= 2) { const b = block(c, [t], s, size, lh); if (ok(b)) return b; }
  const words = t.split(/\s+/).filter(Boolean);
  for (let n = 2; n <= (o.maxLines ?? 3); n++) {
    if (words.length < n) break;
    for (let size = max2; size >= o.min; size -= 2) {
      const lines = balanced(c, words, n, s, size);
      if (lines) { const b = block(c, lines, s, size, lh); if (ok(b)) return b; }
    }
  }
  // 띄어쓰기가 없거나 단어 하나가 너무 긴 제목: 글자 단위로 고르게 나눈다(최후 수단).
  const chars = [...t];
  for (let n = 2; n <= 4; n++) {
    const per = Math.ceil(chars.length / n);
    const lines = Array.from({ length: n }, (_, i) => chars.slice(i * per, (i + 1) * per).join('').trim()).filter(Boolean);
    for (let size = max2; size >= o.min; size -= 2) { const b = block(c, lines, s, size, lh); if (ok(b)) return b; }
  }
  const lines = Array.from({ length: 4 }, (_, i) => chars.slice(i * Math.ceil(chars.length / 4), (i + 1) * Math.ceil(chars.length / 4)).join(''));
  let size = o.min; while (size > 12 && block(c, lines, s, size, lh).width > o.width) size -= 1;
  return block(c, lines, s, size, lh);
}
/** 작은 글(문구·빌링) — 폭에 맞춰 줄이되 min 밑이면 띄어쓰기에서 줄을 바꾼다. 한 줄로만 둘 글(영화제명)은 oneLine. */
function fitSmall(c: Ctx, text: string, s: Style, size: number, width: number, lh = 1.4, min = Math.round(size * 0.78), oneLine = false): Block {
  for (let z = size; z >= min; z -= 1) { const b = block(c, [text], s, z, lh); if (b.width <= width) return b; }
  if (oneLine) { let z = min; while (z > 12 && block(c, [text], s, z, lh).width > width) z -= 1; return block(c, [text], s, z, lh); }
  const words = text.split(/\s+/).filter(Boolean);
  for (let n = 2; n <= 4; n++) {
    const lines = balanced(c, words, n, s, size);
    if (lines) { const b = block(c, lines, s, size, lh); if (b.width <= width) return b; }
  }
  let z = min; while (z > 12 && block(c, [text], s, z, lh).width > width) z -= 1;
  return block(c, [text], s, z, lh);
}
/** top에서부터 그린다. 반환: 아래 끝 y. */
function draw(c: Ctx, b: Block, x: number, top: number, color: string | CanvasGradient, align: Align = 'left') {
  c.save(); setFont(c, b.style, b.size); c.fillStyle = color; c.textAlign = align; c.textBaseline = 'alphabetic';
  const t = (b.style.tracking ?? 0) * b.size;
  const dx = align === 'center' ? t / 2 : align === 'right' ? t : 0;
  b.lines.forEach((line, i) => c.fillText(line, x + dx, top + b.asc + i * b.step));
  c.restore();
  return top + b.height;
}
/* ───────────── 그림·바탕 ───────────── */
/** 상자 안에 그림을 덮어 채운다. ax·ay = 남는 부분을 어디서 자를지(0 왼쪽/위 · 0.5 가운데 · 1 오른쪽/아래). */
function rectPath(c: Ctx, x: number, y: number, w: number, h: number) {
  c.moveTo(x, y); c.lineTo(x + w, y); c.lineTo(x + w, y + h); c.lineTo(x, y + h); c.closePath();
}
function photo(c: Ctx, art: HTMLImageElement, x: number, y: number, w: number, h: number, ay = 0.45, ax = 0.5) {
  const s = Math.max(w / art.width, h / art.height);
  const iw = art.width * s, ih = art.height * s;
  c.save(); c.beginPath(); rectPath(c, x, y, w, h); c.clip();
  c.drawImage(art, x + (w - iw) * ax, y + (h - ih) * ay, iw, ih);
  c.restore();
}
/* ───── 주인공 자리를 지키는 배치(2026-10-14 Bumm님: «얼굴이 아치 안에 들어와야 함 — 지금은 다 잘림») ─────
   AI 그림의 구도는 생성 지시문이 정한다(functions/index.js buildPrompt: «세로 2:3, 주인공은 위쪽 2/3 안에 머리까지 다 보이게,
   머리 위 여백, 아래 1/3은 비움», 혼자면 «가운데»). 그래서 주인공 상자를 그 약속대로 둔다 — 혼자: 가로 16~84%, 단체: 4~96%,
   세로 5~67%(그림 비율). 틀은 그림을 «덮어 채우기» 대신, 이 상자가 틀의 안전 영역 안에 다 들어오게 크기·자리를 정한다.
   그러다 그림이 칸을 다 못 덮으면, 남는 자리는 같은 그림을 크게 흐려 깐 «배경 연장»으로 채운다(0원·0초 — AI 배경 연장 없음). */
interface Rect { x: number; y: number; w: number; h: number }
interface Box { x0: number; y0: number; x1: number; y1: number }
function subjectBox(m: Meta): Box {
  return m.mode === 'group' ? { x0: 0.04, y0: 0.05, x1: 0.96, y1: 0.67 } : { x0: 0.16, y0: 0.05, x1: 0.84, y1: 0.67 };
}
/** cover = 그림이 채울 칸, safe = 주인공 상자가 들어와야 할 영역(cover 안). 반환: 그린 그림의 자리·크기. */
function placeArt(c: Ctx, art: HTMLImageElement, cover: Rect, safe: Rect, box: Box) {
  const aw = art.width, ah = art.height;
  const bw = (box.x1 - box.x0) * aw, bh = (box.y1 - box.y0) * ah;
  const sCover = Math.max(cover.w / aw, cover.h / ah), sFit = Math.min(safe.w / bw, safe.h / bh);
  const s = Math.min(sCover, sFit);
  const pick = (lo: number, hi: number, want: number) => (lo <= hi ? Math.min(hi, Math.max(lo, want)) : want);
  // 주인공 상자가 safe 안에 들어오는 범위와, 그림이 cover를 덮는 범위를 겹쳐 고른다(겹치지 않으면 주인공이 먼저).
  const bx = (lo0: number, hi0: number) => [lo0, hi0];
  const [sxLo, sxHi] = bx(safe.x - s * box.x0 * aw, safe.x + safe.w - s * box.x1 * aw);
  const [syLo, syHi] = bx(safe.y - s * box.y0 * ah, safe.y + safe.h - s * box.y1 * ah);
  const [cxLo, cxHi] = bx(cover.x + cover.w - s * aw, cover.x);
  const [cyLo, cyHi] = bx(cover.y + cover.h - s * ah, cover.y);
  const wantX = safe.x + safe.w / 2 - s * (box.x0 + box.x1) / 2 * aw;
  const wantY = safe.y + safe.h / 2 - s * (box.y0 + box.y1) / 2 * ah;
  const ox = Math.max(sxLo, cxLo) <= Math.min(sxHi, cxHi) ? pick(Math.max(sxLo, cxLo), Math.min(sxHi, cxHi), wantX) : pick(sxLo, sxHi, wantX);
  const oy = Math.max(syLo, cyLo) <= Math.min(syHi, cyHi) ? pick(Math.max(syLo, cyLo), Math.min(syHi, cyHi), wantY) : pick(syLo, syHi, wantY);
  const r = { x: ox, y: oy, w: aw * s, h: ah * s };
  const covers = r.x <= cover.x + 0.5 && r.y <= cover.y + 0.5 && r.x + r.w >= cover.x + cover.w - 0.5 && r.y + r.h >= cover.y + cover.h - 0.5;
  c.save(); c.beginPath(); rectPath(c, cover.x, cover.y, cover.w, cover.h); c.clip();
  if (!covers) {
    // 배경 연장: 선명한 그림과 같은 자리 · 크기로 깔고, 칸에서 모자란 쪽은 그림의 가장자리 띠를 늘여 채운 뒤 크게 흐리고 살짝 가라앉혀,
    // 그 위에 선명한 그림을 가장자리를 부드럽게 해서 얹는다. 2026-10-23 Bumm님 «포스터 사진 위쪽에 크게 흐린 얼굴이 하나 더 보인다»:
    // 예전에는 같은 그림을 칸을 덮는 크기로 키워 깔아, 그 안의 얼굴이 선명한 얼굴보다 크게 · 다른 자리에 흐리게 비쳤다.
    // 가장자리 띠는 생성 지시문이 비워 두는 머리 위 여백 · 옆 · 아래라 얼굴이 들어가지 않는다.
    c.save();
    drawBlurred(c, 36, 1.1, (t) => extendEdges(t, art, r, cover));
    c.restore();
    c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(cover.x, cover.y, cover.w, cover.h);
    featherDraw(c, art, r, 56);
  } else {
    c.drawImage(art, r.x, r.y, r.w, r.h);
  }
  c.restore();
  return r;
}
/** 그림을 r에 그리고, cover에서 r이 못 덮는 쪽(위 · 아래 · 옆 · 모서리)은 그림 가장자리의 얇은 띠(2%)를 늘여 채운다. 얼굴이 두 번 나오지 않는 배경 연장. */
function extendEdges(t: Ctx, art: HTMLImageElement, r: Rect, cover: Rect) {
  const aw = art.width, ah = art.height, kx = Math.max(2, aw * 0.02), ky = Math.max(2, ah * 0.02);
  const cx1 = cover.x + cover.w, cy1 = cover.y + cover.h, rx1 = r.x + r.w, ry1 = r.y + r.h;
  const left = r.x - cover.x, right = cx1 - rx1, top = r.y - cover.y, bottom = cy1 - ry1;
  // 띠는 늘이는 방향과 직각으로 몇 칸(위 · 아래 24칸, 옆 32칸, 모서리 1칸)으로 평균 내어 늘인다 — 화소 그대로 늘이면 띠의 무늬가
  // 길게 끌려 줄무늬가 된다(가로 그림을 아치에 작게 앉힐 때 아치 바깥에 세로 줄이 보였다). 이음매가 벌어지지 않게 그림 쪽으로 1px 겹친다.
  const strip = (sx: number, sy: number, sw: number, sh: number, nx: number, ny: number, dx: number, dy: number, dw: number, dh: number) => {
    if (dw <= 0.5 || dh <= 0.5) return;
    const s = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    const sc = s?.getContext?.('2d');
    if (!s || !sc) { t.drawImage(art, sx, sy, sw, sh, dx, dy, dw, dh); return; }
    s.width = nx; s.height = ny; sc.imageSmoothingQuality = 'high';
    sc.drawImage(art, sx, sy, sw, sh, 0, 0, nx, ny);
    t.save(); t.imageSmoothingEnabled = true; t.imageSmoothingQuality = 'high'; t.drawImage(s, dx, dy, dw, dh); t.restore();
  };
  t.drawImage(art, r.x, r.y, r.w, r.h);
  if (top > 0) strip(0, 0, aw, ky, 24, 1, r.x, cover.y, r.w, top + 1);
  if (bottom > 0) strip(0, ah - ky, aw, ky, 24, 1, r.x, ry1 - 1, r.w, bottom + 1);
  if (left > 0) strip(0, 0, kx, ah, 1, 32, cover.x, r.y, left + 1, r.h);
  if (right > 0) strip(aw - kx, 0, kx, ah, 1, 32, rx1 - 1, r.y, right + 1, r.h);
  if (top > 0 && left > 0) strip(0, 0, kx, ky, 1, 1, cover.x, cover.y, left + 1, top + 1);
  if (top > 0 && right > 0) strip(aw - kx, 0, kx, ky, 1, 1, rx1 - 1, cover.y, right + 1, top + 1);
  if (bottom > 0 && left > 0) strip(0, ah - ky, kx, ky, 1, 1, cover.x, ry1 - 1, left + 1, bottom + 1);
  if (bottom > 0 && right > 0) strip(aw - kx, ah - ky, kx, ky, 1, 1, rx1 - 1, ry1 - 1, right + 1, bottom + 1);
}
/* ───── 흐림(2026-10-20 저녁 Bumm님 «휴대폰에서 아치프레임 바깥 블러가 안 보임») ─────
   원인: 흐림을 캔버스 필터(ctx.filter = 'blur(…)')로만 그렸는데 아이폰 사파리는 캔버스 필터를 그리지 않는다 — 그래서 아치 바깥 ·
   배경 연장 · 빛 번짐이 흐림 없이 선명하게 나갔다(PC · 안드로이드 크롬은 그린다). 브라우저가 필터를 실제로 그리는지 한 번 재 보고,
   못 그리면 같은 것을 화면 밖 캔버스에 그려 1/4로 줄인 뒤 화소를 직접 흐려(상자 흐림 세 번 ≈ 가우스, 투명도를 곱한 채로) 다시 키워 얹는다.
   필터를 그리는 브라우저는 예전과 똑같은 명령을 그대로 쓴다 — PC 출력은 화소 하나 바뀌지 않는다. */
let canvasFilterOk: boolean | null = null;
/** 캔버스 필터가 실제로 그려지는지(속성만 있고 무시하는 브라우저도 있다) — 투명 바탕에 1px 점을 흐려 찍고 옆 화소가 물드는지 본다. */
function canvasFilterWorks(): boolean {
  if (canvasFilterOk !== null) return canvasFilterOk;
  canvasFilterOk = false;
  try {
    const t = document.createElement('canvas'); t.width = 9; t.height = 1;
    const tc = t.getContext('2d', { willReadFrequently: true });
    if (tc && 'filter' in tc) {
      tc.filter = 'blur(2px)'; tc.fillStyle = '#000'; tc.fillRect(4, 0, 1, 1);
      canvasFilterOk = tc.getImageData(2, 0, 1, 1).data[3] > 0;
    }
  } catch { /* 잴 수 없으면 직접 흐린다 */ }
  return canvasFilterOk;
}
/** paint가 그리는 것을 px만큼 흐려 c에 얹는다(saturate는 CSS saturate()와 같은 뜻). 화면 밖 캔버스를 못 쓰면 예전처럼 흐림 없이 그린다. */
function drawBlurred(c: Ctx, px: number, saturate: number, paint: (t: Ctx) => void) {
  if (canvasFilterWorks()) {
    c.filter = saturate === 1 ? `blur(${px}px)` : `blur(${px}px) saturate(${saturate})`;
    paint(c);
    return;
  }
  try {
    const cw = c.canvas.width, ch = c.canvas.height, k = 4, sw = Math.ceil(cw / k), sh = Math.ceil(ch / k);
    const big = document.createElement('canvas'); big.width = cw; big.height = ch;
    const bc = big.getContext('2d');
    const small = document.createElement('canvas'); small.width = sw; small.height = sh;
    const sc = small.getContext('2d', { willReadFrequently: true });
    if (!bc || !sc) throw new Error('no canvas');
    bc.setTransform(c.getTransform());   // 돌려 놓은 틀(폴라로이드 등)도 같은 자리에
    paint(bc);
    sc.imageSmoothingQuality = 'high';
    sc.drawImage(big, 0, 0, sw, sh);
    const id = sc.getImageData(0, 0, sw, sh);
    blurPixels(id, px / k, saturate);
    sc.putImageData(id, 0, 0);
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.imageSmoothingQuality = 'high'; c.drawImage(small, 0, 0, cw, ch); c.restore();
  } catch {
    paint(c);
  }
}
/** 화소 흐림: 가우스 sigma를 상자 흐림 세 번으로(가장자리는 끝 화소를 늘인다). 투명도를 곱한 채로 흐려 투명한 곳 옆이 검게 물들지 않는다. */
export function blurPixels(id: ImageData, sigma: number, saturate = 1) {
  const { width: w, height: h, data: d } = id, n = w * h;
  const chans = [0, 1, 2, 3].map(() => new Float32Array(n)), tmp = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = d[i * 4 + 3];
    chans[0][i] = d[i * 4] * a; chans[1][i] = d[i * 4 + 1] * a; chans[2][i] = d[i * 4 + 2] * a; chans[3][i] = a;
  }
  // 상자 셋의 너비(Ivan Kutskir의 가우스 근사): 홀수 너비 wl · wl+2를 섞어 분산을 sigma²에 맞춘다
  const wIdeal = Math.sqrt(4 * sigma * sigma + 1);
  let wl = Math.floor(wIdeal); if (wl % 2 === 0) wl--;
  const m = Math.round((12 * sigma * sigma - 3 * wl * wl - 12 * wl - 9) / (-4 * wl - 4));
  for (let pass = 0; pass < 3; pass++) {
    const r = ((pass < m ? wl : wl + 2) - 1) / 2;
    if (r < 1) continue;
    const inv = 1 / (2 * r + 1);
    for (const p of chans) {
      for (let y = 0; y < h; y++) {   // 가로
        const o = y * w;
        let acc = p[o] * (r + 1);
        for (let j = 1; j <= r; j++) acc += p[o + Math.min(j, w - 1)];
        for (let x = 0; x < w; x++) { tmp[o + x] = acc * inv; acc += p[o + Math.min(x + r + 1, w - 1)] - p[o + Math.max(x - r, 0)]; }
      }
      for (let x = 0; x < w; x++) {   // 세로
        let acc = tmp[x] * (r + 1);
        for (let j = 1; j <= r; j++) acc += tmp[Math.min(j, h - 1) * w + x];
        for (let y = 0; y < h; y++) { p[y * w + x] = acc * inv; acc += tmp[Math.min(y + r + 1, h - 1) * w + x] - tmp[Math.max(y - r, 0) * w + x]; }
      }
    }
  }
  const s = saturate;
  for (let i = 0; i < n; i++) {
    const a = chans[3][i];
    if (a <= 0) { d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = d[i * 4 + 3] = 0; continue; }
    const r = chans[0][i] / a, g = chans[1][i] / a, b = chans[2][i] / a;
    d[i * 4] = s === 1 ? r : (0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * g + (0.072 - 0.072 * s) * b;
    d[i * 4 + 1] = s === 1 ? g : (0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * g + (0.072 - 0.072 * s) * b;
    d[i * 4 + 2] = s === 1 ? b : (0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * g + (0.072 + 0.928 * s) * b;
    d[i * 4 + 3] = a;
  }
}
/** 그림을 가장자리 f px만큼 투명하게 녹여 그린다(배경 연장과 이음매가 보이지 않게). 화면 밖 캔버스가 없으면 그냥 그린다. */
function featherDraw(c: Ctx, art: HTMLImageElement, r: Rect, f: number) {
  const t = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const tc = t?.getContext?.('2d');
  if (!t || !tc || typeof tc.createLinearGradient !== 'function') { c.drawImage(art, r.x, r.y, r.w, r.h); return; }
  const w = Math.max(1, Math.round(r.w)), h = Math.max(1, Math.round(r.h));
  t.width = w; t.height = h;
  tc.drawImage(art, 0, 0, w, h);
  tc.globalCompositeOperation = 'destination-out';
  const edge = (x0: number, y0: number, x1: number, y1: number, rx: number, ry: number, rw: number, rh: number) => {
    const g = tc.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    tc.fillStyle = g; tc.fillRect(rx, ry, rw, rh);
  };
  edge(0, 0, f, 0, 0, 0, f, h); edge(w, 0, w - f, 0, w - f, 0, f, h);
  edge(0, 0, 0, f, 0, 0, w, f); edge(0, h, 0, h - f, 0, h - f, w, f);
  c.drawImage(t, r.x, r.y, r.w, r.h);
}
function paper(c: Ctx, color: string, grainAlpha = 0.05) {
  c.fillStyle = color; c.fillRect(0, 0, W, H);
  grain(c, 0, 0, W, H, grainAlpha);
}
/** 종이 결 — 고정 씨앗의 잡음이라 같은 입력이면 늘 같은 그림이 나온다(무작위 금지: 인쇄·대조가 흔들린다). */
let grainTile: HTMLCanvasElement | null = null;
function grain(c: Ctx, x: number, y: number, w: number, h: number, alpha: number, mode: GlobalCompositeOperation = 'multiply') {
  if (!alpha || typeof document === 'undefined' || !c.createPattern) return;
  if (!grainTile) {
    const t = document.createElement('canvas'); t.width = t.height = 192;
    const tc = t.getContext?.('2d'); if (!tc) return;
    const id = tc.createImageData(192, 192);
    let seed = 0x2f6b9d;
    for (let i = 0; i < id.data.length; i += 4) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const v = 96 + (seed >>> 24) % 64;
      id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255;
    }
    tc.putImageData(id, 0, 0); grainTile = t;
  }
  const p = c.createPattern(grainTile, 'repeat'); if (!p) return;
  c.save(); c.globalAlpha = alpha; c.globalCompositeOperation = mode; c.fillStyle = p; c.fillRect(x, y, w, h); c.restore();
}
/** 필름 빛 번짐(헐레이션): 그림의 밝은 곳만 골라 붉은 주황으로 물들여 흐리게 겹친다(Vision3·Cinestill 필름의 붉은 테).
 *  작은 캔버스(가로 120px)에 그려 늘이므로 그 자체로 부드럽게 퍼진다. 그림을 읽을 수 없는 환경이면 건너뛴다. */
function halation(c: Ctx, art: HTMLImageElement, x: number, y: number, w: number, h: number, ay: number, at?: Rect) {
  if (typeof document === 'undefined') return;
  try {
    const sw = 120, sh = Math.max(1, Math.round(120 * h / w));
    const t = document.createElement('canvas'); t.width = sw; t.height = sh;
    const tc = t.getContext?.('2d'); if (!tc || typeof tc.getImageData !== 'function') return;
    // at = 칸 안에 실제로 그린 그림의 자리(placeArt). 빛 번짐도 그 자리에서 뽑는다 — 칸을 덮게 키운 그림에서 뽑으면 밝은 곳이 어긋난 자리에 번진다(10/23)
    if (at) { const k = sw / w; tc.drawImage(art, (at.x - x) * k, (at.y - y) * k, at.w * k, at.h * k); } else {
      const s = Math.max(sw / art.width, sh / art.height), iw = art.width * s, ih = art.height * s;
      tc.drawImage(art, (sw - iw) / 2, (sh - ih) * ay, iw, ih);
    }
    const id = tc.getImageData(0, 0, sw, sh), d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255, k = Math.max(0, (l - 0.7) / 0.3);
      d[i] = 255 * k; d[i + 1] = 72 * k; d[i + 2] = 30 * k; d[i + 3] = 255;
    }
    tc.putImageData(id, 0, 0);
    c.save(); c.globalCompositeOperation = 'screen'; c.globalAlpha = 0.6;
    drawBlurred(c, 10, 1, (b) => b.drawImage(t, x - 12, y - 12, w + 24, h + 24)); c.restore();
  } catch { /* 그림을 읽을 수 없으면 번짐 없이 */ }
}
/** 옛 필름 색(2026-10-18 Bumm님 필름스트립 «옛날 진짜 필름 색(필름 필터)을 씌워 봄»): 칸 안 화소에 직접 —
 *  색을 조금 빼고(0.78), 완만한 S자 대비, 중간 밝기를 살짝 따뜻하게, 검정은 갈색으로 들뜨고 흰색은 크림색으로 눌린다(바랜 인화 필름).
 *  화소를 읽을 수 없는 환경이면 건너뛴다. */
function filmGrade(c: Ctx, x: number, y: number, w: number, h: number) {
  if (typeof c.getImageData !== 'function') return;
  try {
    const id = c.getImageData(Math.round(x), Math.round(y), Math.round(w), Math.round(h)), d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const r0 = d[i] / 255, g0 = d[i + 1] / 255, b0 = d[i + 2] / 255;
      const l = 0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0, mid = 4 * l * (1 - l);
      const tone = (v: number, warm: number, black: number, white: number) => {
        v = l + (v - l) * 0.78;
        v += (v * v * (3 - 2 * v) - v) * 0.3;
        v = Math.min(1, Math.max(0, v + warm * mid));
        return Math.round(255 * (black + (white - black) * v));
      };
      d[i] = tone(r0, 0.035, 0.1, 0.98); d[i + 1] = tone(g0, 0.012, 0.072, 0.95); d[i + 2] = tone(b0, -0.04, 0.05, 0.86);
    }
    c.putImageData(id, Math.round(x), Math.round(y));
  } catch { /* 화소를 읽을 수 없으면 그대로 */ }
}
function hairline(c: Ctx, x: number, y: number, w: number, color: string, t = 2) { c.fillStyle = color; c.fillRect(x, Math.round(y), w, t); }

/* ───────────── 로고 두 개(윗줄 크레딧) — 자리·크기는 그대로(테스트로 고정) ───────────── */
/** left·right = 두 로고의 바깥 끝(기본 64 · W-64). 필름처럼 가장자리를 다른 것이 차지하는 틀만 안쪽으로 들인다. */
function brands(c: Ctx, dark = false, veil = !dark, left = 64, right = W - 64) {
  const color = dark ? '#1d1d1b' : '#fff';
  if (veil) {
    const g = c.createLinearGradient(0, 0, 0, 240);
    g.addColorStop(0, '#0009'); g.addColorStop(1, 'transparent');
    c.fillStyle = g; c.fillRect(0, 0, W, 240);
  }
  if (state.LOGO_FESTIVAL) c.drawImage(state.LOGO_FESTIVAL, 120, 0, 145, 90, left, 53, 93, 58);
  c.save(); c.textBaseline = 'middle'; c.fillStyle = color;
  c.font = `800 32px ${SANS}`; setLS(c, 0); c.fillText('InKY', left + 109, 86);
  c.font = `400 32px ${SANS}`; c.fillText('Film Festival', left + 193, 86);
  c.restore();
  const logo = dark ? state.LOGO_DARK : state.LOGO_LIGHT;
  const ratio = logo?.naturalWidth && logo.naturalHeight ? logo.naturalWidth / logo.naturalHeight : 3.8;
  c.save(); c.shadowColor = color; c.shadowBlur = 1.4;
  drawOrgLogo(c, right - 72 * ratio / 2, 86, 72, dark ? 'dark' : 'light'); c.restore();
}

/* ───────────── 빌링(크레딧 + 영화제·날짜·장소)을 한 덩어리로 — 먼저 재고, 나중에 그린다 ───────────── */
interface BillStyle { main: Style; mainSize: number; mainColor: string; sub: Style; subSize: number; subColor: string;
  fest: Style; festSize: number; festColor: string; when: Style; whenSize: number; whenColor: string; gapCredits: number; gapFest: number }
interface Bill { height: number; draw(x: number, bottom: number, align: Align): number }
function billing(c: Ctx, m: Meta, b: BillStyle, width: number): Bill {
  const rows: { blk: Block; color: string; gap: number }[] = [];
  rows.push({ blk: fitSmall(c, creditMain(m), b.main, b.mainSize, width, 1.3), color: b.mainColor, gap: 0 });
  if (creditSub(m)) rows.push({ blk: fitSmall(c, creditSub(m), b.sub, b.subSize, width, 1.35), color: b.subColor, gap: Math.round(b.subSize * 0.55) });
  rows.push({ blk: fitSmall(c, FEST, b.fest, b.festSize, width, 1.3, Math.round(b.festSize * 0.78), true), color: b.festColor, gap: b.gapCredits });
  rows.push({ blk: fitSmall(c, WHEN, b.when, b.whenSize, width, 1.3), color: b.whenColor, gap: b.gapFest });
  const height = rows.reduce((h, r) => h + r.gap + r.blk.height, 0);
  return { height, draw(x, bottom, align) {
    let y = bottom - height;
    for (const r of rows) y = draw(c, r.blk, x, y + r.gap, r.color, align);
    return bottom - height;
  } };
}
interface ColItem { text: string; s: Style; size: number; color: string; gap?: number; lh?: number; oneLine?: boolean }
/** 작은 글 여러 덩어리를 한 칸(열)에 위에서 아래로 쌓는다. */
function column(c: Ctx, items: ColItem[], width: number) {
  const rows = items.filter((it) => it.text).map((it) => ({ blk: fitSmall(c, it.text, it.s, it.size, width, it.lh ?? 1.4, Math.round(it.size * 0.78), it.oneLine), color: it.color, gap: it.gap ?? 0 }));
  const height = rows.reduce((h, r, i) => h + (i ? r.gap : 0) + r.blk.height, 0);
  return { height, draw(x: number, top: number, align: Align = 'left') {
    let y = top;
    rows.forEach((r, i) => { y = draw(c, r.blk, x, y + (i ? r.gap : 0), r.color, align); });
    return y;
  } };
}
function archPath(c: Ctx, cx: number, spring: number, r: number, bottom: number) {
  c.moveTo(cx - r, bottom); c.lineTo(cx - r, spring); c.arc(cx, spring, r, Math.PI, 0); c.lineTo(cx + r, bottom); c.closePath();
}

/* ISBN 바코드(EAN-13) — 표준 부호표 그대로 막대를 만든다(에디토리얼 «잡지 표지»의 뒤표지 바코드, 2026-10-17).
   ean13('979112026114') → 확인 숫자를 붙인 13자리. ean13Modules는 막대 칸(1 = 검정) 95칸을 돌려준다.
   5자리 부가기호(EAN-5)는 2026-10-18 Bumm님 «바코드가 왜 두 개 ? → 하나로»로 뺐다. */
const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const EAN_G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const EAN_R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const EAN13_PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
export function ean13(twelve: string) {
  const d = [...twelve].map(Number);
  const sum = d.reduce((s, v, i) => s + v * (i % 2 ? 3 : 1), 0);
  return twelve + String((10 - (sum % 10)) % 10);
}
export function ean13Modules(code: string): boolean[] {
  const d = [...code].map(Number), parity = EAN13_PARITY[d[0]];
  let bits = '101';
  for (let i = 1; i <= 6; i++) bits += (parity[i - 1] === 'L' ? EAN_L : EAN_G)[d[i]];
  bits += '01010';
  for (let i = 7; i <= 12; i++) bits += EAN_R[d[i]];
  bits += '101';
  return [...bits].map((b) => b === '1');
}

/* ───────────── 8종 ───────────── */
export const TEMPLATES: Template[] = [
  /* 1. 시네마 — 전면 그림 + 아래로 깊어지는 어둠, 가운데 축. Bumm님이 만족한 방향 그대로, 쌓는 방식만 바꿨다:
        긴 제목이 와도 문구·제목·선·빌링이 겹치지 않고, 빌링은 한 덩어리로 묶인다. 레퍼런스: Beasts of the Southern Wild, 4등. */
  { label: '시네마', render(c, art, m) {
    photo(c, art, 0, 0, W, H, 0.35);
    const bill = billing(c, m, {
      main: { family: SANS, weight: 600 }, mainSize: 33, mainColor: '#eee9db',
      sub: { family: SANS, weight: 400 }, subSize: 25, subColor: '#d9d3c4',
      fest: { family: SANS, weight: 600, tracking: 0.07 }, festSize: 25, festColor: '#cfc8b8',
      when: { family: SANS, weight: 700 }, whenSize: 28, whenColor: '#fff', gapCredits: 64, gapFest: 14,
    }, 1040);
    const billTop = 1730 - bill.height;
    const title = fitTitle(c, m.title, { family: SANS, weight: 900, tracking: -0.02 }, { width: 1040, max: 156, oneLineMin: 100, max2: 116, min: 70, maxLines: 3, maxHeight: 400 });
    const ruleY = billTop - 50;
    const titleTop = ruleY - 46 - title.height;
    const tag = fitSmall(c, m.tagline, { family: SANS, weight: 500, tracking: 0.07 }, 31, 1000);
    const tagTop = titleTop - 30 - tag.height;
    // 어둠은 문구 위 300px에서 시작해 빌링 아래에서 가장 짙다 — 제목이 길어 위로 올라가면 함께 올라간다.
    const fadeStart = Math.min(940, tagTop - 300);
    const g = c.createLinearGradient(0, fadeStart, 0, H);
    g.addColorStop(0, 'rgba(6,16,26,0)'); g.addColorStop(0.45, 'rgba(6,16,26,.74)'); g.addColorStop(1, 'rgba(6,16,26,.97)');
    c.fillStyle = g; c.fillRect(0, fadeStart, W, H - fadeStart);
    bill.draw(W / 2, 1730, 'center');
    hairline(c, W / 2 - 90, ruleY, 180, '#d9c297');
    draw(c, title, W / 2, titleTop, '#fff', 'center');
    draw(c, tag, W / 2, tagTop, '#e8e6dc', 'center');
    brands(c);
  } },

  /* 2. 에디토리얼 — «서점 잡지 표지». 시네마가 극장에 붙는 포스터라면 이건 서점에 꽂힌 영화 잡지다:
        흰 테두리 안의 사진, 맨 위 폭 가득한 제호(= 영화 제목)와 발행 줄(날짜 · 장소), 왼쪽 아래 표지 문구(홍보 문구가 가장 크다),
        오른쪽 아래 실제 규칙대로 부호화한 ISBN 바코드 하나(EAN-13, 2026-10-17 · 10-18)와 영화제 이름. 주인공은 제호·표지 문구와 겹치지 않는 안전 영역에 둔다(placeArt).
        레퍼런스: references-round2.md B — Sight and Sound(제호), Little White Lies(일러스트 초상 표지), 잡지 표지 문법. */
  { label: '에디토리얼', render(c, art, m) {
    const B = 28, frame: Rect = { x: B, y: B, w: W - 2 * B, h: H - 2 * B };
    c.fillStyle = '#fbfaf7'; c.fillRect(0, 0, W, H);
    // 제호 — 폭 1080을 꽉 채우는 명조(최대 210px), 너무 길면 띄어쓰기에서 두 줄.
    const st: Style = { family: SERIF, weight: 900, tracking: -0.035 };
    let size = 210; while (size > 104 && inkWidth(c, st, size, m.title.trim()) > 1080) size -= 2;
    const title = size > 104 ? block(c, [m.title.trim()], st, size, 1) : fitTitle(c, m.title, st, { width: 1080, max: 110, min: 60, maxLines: 3, lh: 1.04, maxHeight: 300 });
    const mastTop = 150, mastBottom = mastTop + title.height, issueY = mastBottom + 28;
    const ds: Style = { family: SANS, weight: 700, tracking: 0.12 };
    const dateB = fitSmall(c, DATE, ds, 22, 480, 1.2, 16, true), venueB = fitSmall(c, VENUE, ds, 22, 360, 1.2, 16, true);
    const issueBottom = issueY + 14 + Math.max(dateB.height, venueB.height);
    // 표지 문구(왼쪽 아래) — 먼저 재서 안전 영역을 정한다.
    const cover = column(c, [
      { text: m.tagline, s: { family: SANS, weight: 800, tracking: -0.015 }, size: 56, color: '#fff', lh: 1.14 },
      { text: creditMain(m), s: { family: SANS, weight: 600 }, size: 28, color: '#fff', gap: 24, lh: 1.3 },
      { text: creditSub(m), s: { family: SANS, weight: 400 }, size: 22, color: 'rgba(255,255,255,.9)', gap: 8, lh: 1.4 },
    ], 640);
    const coverTop = 1716 - cover.height;
    const safe: Rect = { x: B + 24, y: issueBottom + 26, w: W - 2 * B - 48, h: coverTop - 40 - (issueBottom + 26) };
    placeArt(c, art, frame, safe, subjectBox(m));
    // 글자 자리만 살짝 어둡게 — 위(로고·제호)와 왼쪽 아래(표지 문구).
    const top = c.createLinearGradient(0, B, 0, issueBottom + 80);
    top.addColorStop(0, 'rgba(0,0,0,.62)'); top.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = top; c.fillRect(B, B, W - 2 * B, issueBottom + 80 - B);
    const bot = c.createLinearGradient(0, coverTop - 140, 0, H - B);
    bot.addColorStop(0, 'rgba(0,0,0,0)'); bot.addColorStop(1, 'rgba(0,0,0,.66)');
    c.fillStyle = bot; c.fillRect(B, coverTop - 140, W - 2 * B, H - B - (coverTop - 140));
    brands(c, false, false);
    draw(c, title, 60, mastTop, '#fff', 'left');
    hairline(c, 62, issueY, 1076, 'rgba(255,255,255,.92)', 2);
    draw(c, dateB, 62, issueY + 14, '#fff', 'left');
    draw(c, venueB, W - 62, issueY + 14, '#fff', 'right');
    cover.draw(62, coverTop);
    // 바코드(2026-10-17 Bumm님 «ISBN 바코드 부분만 좀 더 현실적으로», 10-18 «바코드가 왜 두 개 ? → 하나로»): 실제 책 뒤표지처럼 흰 칸에
    // ISBN 글자와 EAN-13 막대 하나(규칙대로 부호화한 진짜 막대 — 가운데·양끝 긴 막대, 아래 숫자 13자리). 번호는 행사 날짜로 지은 979-11-2026-1114 계열이다.
    const isbn = ean13('979112026114');
    // 흰 칸 = 여백 12 + 앞 빈 칸 9칸 + EAN-13 95칸 + 뒤 빈 칸 7칸 + 여백 12
    const mod = 3, barH = 100, boxW = 2 * 12 + (9 + 95 + 7) * mod, boxH = 30 + barH + 34 + 12;
    const bx = W - B - 24 - boxW, by = H - B - 24 - boxH;
    c.fillStyle = '#fff'; c.fillRect(bx, by, boxW, boxH);
    c.fillStyle = '#111'; c.textBaseline = 'alphabetic';
    c.font = `500 19px ${SANS}`; setLS(c, 1.2); c.fillText(`ISBN ${isbn.slice(0, 3)}-${isbn.slice(3, 5)}-${isbn.slice(5, 9)}-${isbn.slice(9, 12)}-${isbn[12]}`, bx + 12 + 11 * mod, by + 22);
    const x0 = bx + 12 + 9 * mod, barTop = by + 30;
    ean13Modules(isbn).forEach((on, i) => { if (on) c.fillRect(x0 + i * mod, barTop, mod, barH + (i < 3 || (i >= 45 && i < 50) || i >= 92 ? 12 : 0)); });
    c.font = `500 20px ${SANS}`; setLS(c, 0); c.textAlign = 'center';
    const digitY = barTop + barH + 30;
    c.fillText(isbn[0], x0 - 5 * mod, digitY);
    for (let i = 0; i < 6; i++) c.fillText(isbn[1 + i], x0 + (3 + 7 * i + 3.5) * mod, digitY);
    for (let i = 0; i < 6; i++) c.fillText(isbn[7 + i], x0 + (50 + 7 * i + 3.5) * mod, digitY);
    c.textAlign = 'left';
    const fest = fitSmall(c, FEST, { family: SANS, weight: 600, tracking: 0.02 }, 20, 300, 1.2, 15, true);
    draw(c, fest, W - B - 24, by - 12 - fest.height, '#fff', 'right');
  } },

  /* 3. 컬러 블록 — 위아래 두 색 면. 사진은 위 색 면 «안쪽 여백 안»에 들어간다(사방 같은 여백 — 색 면이 사진의 액자).
        색은 정해 둔 20세트 × 차분/선명 2가지에서 그림의 주색 계열·밝기·색 세기로 고른다(2026-10-17 «색 세트 10개 이상», src/palette.ts — 대비·겹침은 수치로 고정).
        사진은 주인공 상자를 지키며 칸에 맞춘다(placeArt). 레퍼런스: Saul Bass «The Man with the Golden Arm»(색 면이 액자), «Anatomy of a Murder». */
  { label: '컬러 블록', render(c, art, m) {
    const k = colorBlockSet(artColors(art), artTone(art));
    const topC = css(k.top), bottomC = css(k.bottom), onBottom = css(k.title), credit = css(k.credit), soft = css(k.soft), ink = css(k.ink);
    paper(c, topC, 0.04); brands(c, luminance(k.top) > 0.3, false);
    const M = 72;
    const bill = billing(c, m, {
      main: { family: SANS, weight: 700 }, mainSize: 30, mainColor: credit,
      sub: { family: SANS, weight: 400 }, subSize: 23, subColor: soft,
      fest: { family: SANS, weight: 600 }, festSize: 24, festColor: soft,
      when: { family: SANS, weight: 700 }, whenSize: 26, whenColor: credit, gapCredits: 30, gapFest: 8,
    }, W - 2 * M);
    const billTop = 1724 - bill.height;
    // 짧은 제목은 더 크게(최대 190px) — 아래 면 위에서 제목이 면의 주인이 되게.
    const title = fitTitle(c, m.title, { family: DISPLAY, weight: 400, tracking: -0.01 }, { width: W - 2 * M, max: 190, oneLineMin: 96, max2: 104, min: 64, maxLines: 3, maxHeight: 330 });
    const titleTop = billTop - 46 - title.height;
    const planeTop = titleTop - 64;
    c.fillStyle = bottomC; c.fillRect(0, planeTop, W, H - planeTop);
    const box: Rect = { x: M, y: 168, w: W - 2 * M, h: planeTop - M - 168 };
    placeArt(c, art, box, box, subjectBox(m));
    draw(c, title, M, titleTop, onBottom, 'left');
    bill.draw(M, 1724, 'left');
    // 세로 문구: 사진 오른쪽 여백(1128~1200)의 가운데 선, 사진 위쪽에서부터 아래로 읽힌다.
    const tag = fitSmall(c, m.tagline, { family: SANS, weight: 700, tracking: 0.1 }, 24, box.h - 20, 1.2, 16);
    c.save(); c.translate(W - M / 2, box.y); c.rotate(Math.PI / 2);
    draw(c, tag, 0, -tag.height / 2, ink, 'left');
    c.restore();
  } },

  /* 4. 아치 프레임 — 아치 모양 창 안에 주인공이 온전히 들어오게 그림을 놓는다(placeArt — 창 안쪽의 안전 영역에 주인공 상자).
        바깥은 같은 그림을 흐려 깐 위에 깊은 색 막 — 위쪽은 옅게 덮어 흐린 그림이 보이고, 글자가 놓이는 아래로 갈수록 짙게(2026-10-17
        «바깥쪽도 블러로 은은하게 보이게», 10-18 «바깥이 거의 안 보임 → 투명도 · 블러를 줄여»). 색은 정해 둔 20세트 × 차분/선명 2가지에서 고른다(src/palette.ts, 대비·겹침 수치 고정).
        레퍼런스: Criterion «The Spirit of the Beehive»(모양이 곧 색 창문), Mucha(세로로 긴 비례). */
  { label: '아치 프레임', render(c, art, m) {
    const k = archSet(artColors(art), artTone(art));
    const veil = css(k.veil), gold = css(k.gold), text = css(k.text), soft = css(k.soft);
    c.fillStyle = veil; c.fillRect(0, 0, W, H);
    const bill = billing(c, m, {
      main: { family: SANS, weight: 500 }, mainSize: 30, mainColor: text,
      sub: { family: SANS, weight: 400 }, subSize: 23, subColor: text,
      fest: { family: SANS, weight: 500, tracking: 0.06 }, festSize: 24, festColor: text,
      when: { family: SANS, weight: 600 }, whenSize: 26, whenColor: text, gapCredits: 40, gapFest: 10,
    }, 1000);
    const billTop = 1728 - bill.height;
    const title = fitTitle(c, m.title, { family: SERIF, weight: 700, tracking: 0.04 }, { width: 1000, max: 116, oneLineMin: 80, max2: 92, min: 60, maxLines: 3, maxHeight: 260 });
    const titleTop = billTop - 52 - title.height;
    const tag = fitSmall(c, m.tagline, { family: SERIF, weight: 500, tracking: 0.14 }, 26, 960);
    const tagTop = titleTop - 30 - tag.height;
    const archBottom = tagTop - 56, r = 440, cx = W / 2, spring = 176 + r;
    // 창 안: 주인공을 지키며 선명한 그림.
    const win: Rect = { x: cx - r, y: spring - r, w: 2 * r, h: archBottom - (spring - r) };
    const safe: Rect = { x: cx - 0.8 * r, y: spring - 0.62 * r, w: 1.6 * r, h: archBottom - 18 - (spring - 0.62 * r) };
    c.save(); c.beginPath(); archPath(c, cx, spring, r, archBottom); c.clip();
    const placed = placeArt(c, art, win, safe, subjectBox(m));
    c.restore();
    // 바깥: 창 안 그림이 아치 밖으로 흐리게 이어지게 — 2026-10-18 Bumm님 «바깥 흐림과 색이 너무 세서 바깥이 거의 안 보임»: 흐림 28 → 16px, 막을 옅게.
    // 2026-10-23 Bumm님 «흐린 얼굴이 하나 더»: 예전에는 같은 그림을 화면을 덮는 크기로 키워 깔아, 창 안 얼굴과 크기 · 자리가 다른 흐린 얼굴(머리)이
    // 아치 위 · 옆으로 비쳤다. 이제 창 안과 같은 자리 · 크기로 깐다 — 그림 가까이는 같은 그림을 16px로, 그 바깥은 가장자리 띠를 늘여 36px로.
    // 가장자리가 흐림에 비어 보이지 않게 화면보다 30px씩 크게 깐다.
    const pad = 30;
    c.save(); c.beginPath(); rectPath(c, 0, 0, W, H); archPath(c, cx, spring, r, archBottom); c.clip('evenodd');
    drawBlurred(c, 36, 1, (t) => extendEdges(t, art, placed, { x: -pad, y: -pad, w: W + 2 * pad, h: H + 2 * pad }));
    drawBlurred(c, 16, 1, (t) => featherDraw(t, art, placed, 56));
    c.restore();
    // 막: 위·옆은 옅게(그림이 보이게), 글자가 놓이는 아래로 갈수록 짙게(글자 대비).
    const vg = c.createLinearGradient(0, 0, 0, H);
    vg.addColorStop(0, css(k.veil, 0.22)); vg.addColorStop(Math.max(0.05, (archBottom - 120) / H), css(k.veil, 0.3));
    vg.addColorStop(Math.min(0.98, (tagTop - 10) / H), css(k.veil, 0.84)); vg.addColorStop(1, css(k.veil, 0.92));
    c.save(); c.fillStyle = vg;
    c.beginPath(); rectPath(c, 0, 0, W, H); archPath(c, cx, spring, r, archBottom); c.fill('evenodd'); c.restore();
    c.save(); c.strokeStyle = gold; c.lineWidth = 2; c.beginPath(); archPath(c, cx, spring, r + 14, archBottom + 14); c.stroke(); c.restore();
    draw(c, tag, cx, tagTop, soft, 'center');
    draw(c, title, cx, titleTop, gold, 'center');
    bill.draw(cx, 1728, 'center');
    brands(c, false, false);
  } },

  /* 5. 필름스트립 — 화면 전체가 35mm 영화 필름 한 토막(필름 폭 35mm = 1200px, 1mm ≈ 34.3px).
        검은 필름 바탕, 실제 비례의 구멍(2.8×1.98mm, 간격 4.75mm, 가장자리에서 2.01mm), 가장자리 주황 인쇄(번호·화살표 — 상표 없이),
        그림 칸(좌우를 잘라 글 자리까지 꽉 채움, 2026-10-17) + 프레임 선, 필름 결과 밝은 곳 둘레의 붉은 빛 번짐(헐레이션). 레퍼런스: references-round2.md C. */
  { label: '필름스트립', render(c, art, m) {
    const mm = W / 35;
    const perfW = 2.8 * mm, perfH = 1.98 * mm, pitch = 4.75 * mm, edge = 2.01 * mm;
    // 사진 양옆에 검은 필름 여백을 둔다 — 3차는 사진이 구멍 바로 옆까지 와서 답답했다(2026-10-17 Bumm님).
    const imgX = Math.round(6.6 * mm), imgW = W - 2 * imgX;
    // 필름 바탕: 빛에 비춘 필름처럼 아주 깊은 갈색 검정, 가장자리(구멍 줄)는 조금 더 비친다.
    c.fillStyle = '#100c08'; c.fillRect(0, 0, W, H);
    const sideG = c.createLinearGradient(0, 0, W, 0);
    sideG.addColorStop(0, 'rgba(70,48,26,.55)'); sideG.addColorStop(0.16, 'rgba(70,48,26,0)');
    sideG.addColorStop(0.84, 'rgba(70,48,26,0)'); sideG.addColorStop(1, 'rgba(70,48,26,.55)');
    c.fillStyle = sideG; c.fillRect(0, 0, W, H);
    // 글 덩어리를 먼저 재서, 사진이 그 아래까지 내려가 글 뒤를 채우게 한다(사진과 글 사이 빈 칸 없음).
    const bill = billing(c, m, {
      main: { family: SANS, weight: 600 }, mainSize: 30, mainColor: '#f3ede0',
      sub: { family: SANS, weight: 400 }, subSize: 22, subColor: '#d8cfbd',
      fest: { family: SANS, weight: 500, tracking: 0.06 }, festSize: 23, festColor: '#d8cfbd',
      when: { family: SANS, weight: 700 }, whenSize: 25, whenColor: '#f3ede0', gapCredits: 30, gapFest: 8,
    }, imgW - 80);
    const frameTop = 150, frameBottom = H - 70;
    const billTop = frameBottom - 44 - bill.height;
    const title = fitTitle(c, m.title, { family: SANS, weight: 900, tracking: -0.02 }, { width: imgW - 80, max: 120, oneLineMin: 78, max2: 88, min: 54, maxLines: 3, maxHeight: 240 });
    const titleTop = billTop - 36 - title.height;
    const tag = fitSmall(c, m.tagline, { family: SANS, weight: 500, tracking: 0.16 }, 24, imgW - 80);
    const tagTop = titleTop - 20 - tag.height;
    const frame: Rect = { x: imgX, y: frameTop, w: imgW, h: frameBottom - frameTop };
    // 사진은 늘리지 않고 칸을 덮게(좌우를 자른다), 주인공 상자는 글 덩어리 위쪽 안전 영역에 지킨다.
    const safe: Rect = { x: imgX + 16, y: frameTop + 24, w: imgW - 32, h: tagTop - 40 - (frameTop + 24) };
    c.save(); roundRect(c, imgX, frameTop, imgW, frame.h, 10); c.clip();
    const placed = placeArt(c, art, frame, safe, subjectBox(m));
    halation(c, art, imgX, frameTop, imgW, frame.h, 0.45, placed);
    const fade = c.createLinearGradient(0, tagTop - 260, 0, frameBottom);
    fade.addColorStop(0, 'rgba(10,7,4,0)'); fade.addColorStop(0.45, 'rgba(10,7,4,.62)'); fade.addColorStop(1, 'rgba(10,7,4,.9)');
    c.fillStyle = fade; c.fillRect(imgX, tagTop - 260, imgW, frameBottom - tagTop + 260);
    grain(c, imgX, frameTop, imgW, frame.h, 0.14, 'overlay');
    c.restore();
    // 앞·뒤 칸의 끝자락(위 26px 프레임 선 너머, 아래 프레임 선 너머)
    for (const [y0, y1] of [[-60, frameTop - 26], [frameBottom + 26, H + 60]]) {
      c.save(); roundRect(c, imgX, y0, imgW, y1 - y0, 10); c.clip();
      photo(c, art, imgX, y0 < 0 ? y1 - frame.h : y0, imgW, frame.h, 0.45);
      c.fillStyle = 'rgba(10,7,4,.55)'; c.fillRect(imgX, y0, imgW, y1 - y0); c.restore();
    }
    filmGrade(c, imgX, 0, imgW, H);   // 그림 칸과 앞·뒤 칸 끝자락을 한 필름처럼 같은 색으로
    // 구멍: 라이트박스에 비춘 필름처럼 테두리 없는 맑은 흰빛 + 둘레 필름으로 번지는 따뜻한 빛, 모서리 0.5mm 둥글게,
    // 윗변에만 필름 두께 그늘(4차 «베이지 구멍이 싸 보임» — 베이지 바탕·회색 테두리를 걷었다).
    const perf = (x: number, y: number) => {
      c.save(); c.shadowColor = 'rgba(255,226,180,.5)'; c.shadowBlur = 18;
      c.fillStyle = '#fbfcfd'; roundRect(c, x, y, perfW, perfH, 0.5 * mm); c.fill(); c.restore();
      c.save(); roundRect(c, x, y, perfW, perfH, 0.5 * mm); c.clip();
      const g = c.createLinearGradient(0, y, 0, y + perfH);
      g.addColorStop(0, 'rgba(110,90,70,.3)'); g.addColorStop(0.14, 'rgba(110,90,70,0)');
      c.fillStyle = g; c.fillRect(x, y, perfW, perfH);
      c.restore();
    };
    for (let y = -pitch / 3; y < H; y += pitch) { perf(edge, y); perf(W - edge - perfW, y); }
    // 가장자리 인쇄 — 왼쪽: 필름 번호·칸 번호, 오른쪽: 키 코드식 번호(행사 날짜 1114를 넣었다). 상표 이름은 쓰지 않는다.
    //   화살표는 글자가 아니라 도형으로 그린다(글꼴에 없는 기호를 쓰지 않는다 — 화면 글꼴 검사 fonts:check와도 맞물린다).
    const edgeInk = 'rgba(232,140,58,.92)', ARROW = 1, BACK = -1;
    const edgePrint = (x: number, parts: (string | number)[], flip: boolean) => {
      c.save(); c.translate(x, flip ? H : 0); c.rotate(flip ? -Math.PI / 2 : Math.PI / 2);
      c.font = `400 22px 'Bebas Neue', ${SANS}`; setLS(c, 3); c.fillStyle = edgeInk; c.textBaseline = 'middle';
      let u = 40;
      for (const p of parts) {
        const w = typeof p === 'number' ? 12 : c.measureText(p).width;
        if (u + w > H - 30) break;
        if (typeof p === 'number') { c.beginPath(); c.moveTo(u + (p > 0 ? 0 : 12), -7); c.lineTo(u + (p > 0 ? 12 : 0), 0); c.lineTo(u + (p > 0 ? 0 : 12), 7); c.closePath(); c.fill(); }
        else c.fillText(p, u, 0);
        u += w + 34;
      }
      c.restore();
    };
    edgePrint(edge / 2, ['INKY 1114', ...Array.from({ length: 8 }, (_, i) => [ARROW, String(14 + i), `${14 + i}A`]).flat()], false);
    edgePrint(W - edge / 2, Array.from({ length: 8 }, (_, i) => [`IN 26 1114 00${24 + i}+0${(i * 4) % 10}`, BACK]).flat(), true);
    draw(c, tag, W / 2, tagTop, '#e2d9c6', 'center');
    draw(c, title, W / 2, titleTop, '#fbf6ea', 'center');
    bill.draw(W / 2, frameBottom - 44, 'center');
    grain(c, 0, 0, W, H, 0.05, 'overlay');
    brands(c, false, false, imgX + 18, W - imgX - 18);
  } },

  /* 6. 폴라로이드 — 짙은 차콜 펠트 위에 놓인 즉석 사진 한 장, 2도 기울기. 영화제·교육청 로고는 위쪽 흰 테두리 안(2026-10-17 Bumm님).
        2026-10-18 Bumm님: «위·옆 여백은 지금 정도(살짝 비뚤어진 느낌 좋음)인데 아래가 너무 짧음 → 아래 글씨가 있는 데까지 길게» ·
        «사진 부분을 더 폴라로이드답게, 더 길고 크게» · «그 글씨는 폴라로이드 종이 위에 인쇄된 것처럼(예: 오른쪽에)».
        → 카드가 화면 거의 전체(위·옆 테두리는 그대로), 사진은 세로로 긴 칸, 아래 흰 여백 왼쪽에 유성 매직 손글씨 제목,
        오른쪽에 종이에 찍힌 글(홍보 문구 · 크레딧 · 영화제 · 날짜 · 장소). 사진은 즉석 사진처럼: 검정이 들뜨고 따뜻하게 바랜 색,
        가장자리가 살짝 어둡고(주변 감광), 종이 테두리 안쪽으로 한 단 들어간 그늘. 레퍼런스: Memento(아래 여백이 글 쓰는 자리). */
  { label: '폴라로이드', render(c, art, m) {
    const ink = '#2a2723', inkSoft = '#5f5a52';
    // 바탕: 짙은 차콜 펠트 — 고른 잡음 결 + 가운데가 살짝 밝은 조명
    c.fillStyle = '#26241f'; c.fillRect(0, 0, W, H);
    grain(c, 0, 0, W, H, 0.22, 'overlay');
    const light = c.createRadialGradient(W / 2, H * 0.42, H * 0.1, W / 2, H * 0.5, H * 0.78);
    light.addColorStop(0, 'rgba(255,240,220,.09)'); light.addColorStop(1, 'rgba(0,0,0,.42)');
    c.fillStyle = light; c.fillRect(0, 0, W, H);
    // 카드: 위 52px부터 아래 52px까지. 테두리는 옆 58 · 위 107px.
    // 10/20 Bumm님 «위쪽 로고와 사진이 위 가장자리에 너무 바짝 붙어 답답 → 종이는 그대로, 로고와 사진을 조금 아래로, 아래 글 쪽 여유를 그만큼 당겨 씀»:
    // 위 테두리 71 → 107(로고 위 여백 13 → 31px), 아래 글 띠는 같은 36px만큼 줄인다(사진 크기는 그대로).
    const cardW = 1140, cardX = (W - cardW) / 2, cardTop = 52, cardBottom = H - 52, cardH = cardBottom - cardTop;
    const side = 58, topB = 107, photoW = cardW - 2 * side;
    // 아래 흰 여백: 왼쪽 손글씨 제목 | 오른쪽 인쇄된 글. 줄 간격은 2도 기운 카드에서 줄끼리 테두리 상자가 겹치지 않게 넉넉히(1.5).
    // 글 크기는 다른 디자인의 빌링과 같은 급(4×6 인화에서 읽히게).
    // 10/20 저녁 Bumm님 «이제 완전 좋다 — 제목 글씨만 조금 더 키우자»: 제목 칸을 넓히고(오른쪽 글 420 → 380, 사이 44 → 36) 큰 글자 한도를 올린다.
    const gut = 36, rightW = 380, leftW = photoW - rightW - gut;
    const printed = column(c, [
      { text: m.tagline, s: { family: SERIF, weight: 600 }, size: 27, color: ink, lh: 1.5 },
      { text: creditMain(m), s: { family: SANS, weight: 700 }, size: 24, color: ink, gap: 22, lh: 1.55 },
      { text: creditSub(m), s: { family: SANS, weight: 400 }, size: 20, color: inkSoft, gap: 6, lh: 1.6 },
      { text: FEST, s: { family: SANS, weight: 600 }, size: 20, color: inkSoft, gap: 22, oneLine: true },
      { text: WHEN, s: { family: SANS, weight: 700 }, size: 22, color: ink, gap: 10, oneLine: true },
    ], rightW);
    const title = fitTitle(c, m.title, { family: MARKER, weight: 700, tracking: -0.03 }, { width: leftW, max: 150, oneLineMin: 88, max2: 94, min: 48, maxLines: 3, lh: 1.3, maxHeight: 380 });
    const stripH = Math.max(284, Math.max(title.height, printed.height) + 64);
    const photoH = cardH - topB - stripH, capTop = cardTop + topB + photoH;
    c.save(); c.translate(W / 2, cardTop + cardH / 2); c.rotate(-0.026); c.translate(-W / 2, -(cardTop + cardH / 2));
    // 종이: 살짝 누런 흰 종이 + 결 + 위에서 오는 은은한 광택
    c.save(); c.shadowColor = 'rgba(0,0,0,.55)'; c.shadowBlur = 34; c.shadowOffsetY = 14;
    c.fillStyle = '#f9f7f1'; c.fillRect(cardX, cardTop, cardW, cardH); c.restore();
    grain(c, cardX, cardTop, cardW, cardH, 0.05);
    const sheen = c.createLinearGradient(cardX, cardTop, cardX + cardW * 0.6, cardBottom);
    sheen.addColorStop(0, 'rgba(255,255,255,.35)'); sheen.addColorStop(1, 'rgba(225,218,204,.25)');
    c.fillStyle = sheen; c.fillRect(cardX, cardTop, cardW, cardH);
    const ph: Rect = { x: cardX + side, y: cardTop + topB, w: photoW, h: photoH };
    placeArt(c, art, ph, ph, subjectBox(m));
    // 즉석 사진 색: 검정이 들뜨고(바램), 따뜻하게, 가장자리가 살짝 어둡다(주변 감광).
    c.save();
    c.globalCompositeOperation = 'screen'; c.fillStyle = 'rgba(52,40,30,.2)'; c.fillRect(ph.x, ph.y, ph.w, ph.h);
    c.globalCompositeOperation = 'soft-light'; c.fillStyle = 'rgba(255,212,156,.28)'; c.fillRect(ph.x, ph.y, ph.w, ph.h);
    c.globalCompositeOperation = 'multiply';
    const vig = c.createRadialGradient(ph.x + ph.w / 2, ph.y + ph.h * 0.45, ph.h * 0.3, ph.x + ph.w / 2, ph.y + ph.h / 2, ph.h * 0.78);
    vig.addColorStop(0, 'rgba(255,255,255,1)'); vig.addColorStop(1, 'rgba(150,132,112,1)');
    c.fillStyle = vig; c.fillRect(ph.x, ph.y, ph.w, ph.h);
    c.restore();
    // 사진이 종이 테두리 안쪽으로 한 단 들어간 그늘(위·왼쪽 안쪽 그늘 + 가는 테)
    c.save(); c.beginPath(); rectPath(c, ph.x, ph.y, ph.w, ph.h); c.clip();
    const inTop = c.createLinearGradient(0, ph.y, 0, ph.y + 14); inTop.addColorStop(0, 'rgba(0,0,0,.3)'); inTop.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = inTop; c.fillRect(ph.x, ph.y, ph.w, 14);
    const inLeft = c.createLinearGradient(ph.x, 0, ph.x + 10, 0); inLeft.addColorStop(0, 'rgba(0,0,0,.22)'); inLeft.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = inLeft; c.fillRect(ph.x, ph.y, 10, ph.h);
    c.restore();
    c.strokeStyle = 'rgba(60,50,40,.35)'; c.lineWidth = 1.5; c.strokeRect(ph.x + 0.75, ph.y + 0.75, ph.w - 1.5, ph.h - 1.5);
    // 위쪽 흰 테두리 안의 로고(작게, 사진 폭 양끝에 맞춤). 크기는 위 테두리가 71px이던 때 그대로(10/20 — 자리만 내린다).
    const logoH = Math.min(46, 71 * 0.62), logoY = cardTop + (topB - logoH) / 2;
    if (state.LOGO_FESTIVAL) {
      const lw = logoH * (93 / 58);
      c.drawImage(state.LOGO_FESTIVAL, 120, 0, 145, 90, ph.x, logoY, lw, logoH);
      c.save(); c.textBaseline = 'middle'; c.fillStyle = '#1d1d1b';
      const fs = logoH * 0.55; c.font = `800 ${fs}px ${SANS}`; setLS(c, 0); c.fillText('InKY', ph.x + lw + fs * 0.35, logoY + logoH / 2);
      const iw = c.measureText('InKY').width; c.font = `400 ${fs}px ${SANS}`; c.fillText('Film Festival', ph.x + lw + fs * 0.35 + iw + fs * 0.28, logoY + logoH / 2);
      c.restore();
    }
    const org = state.LOGO_DARK, oh = logoH * (72 / 58), ratio = org?.naturalWidth && org.naturalHeight ? org.naturalWidth / org.naturalHeight : 3.8;
    // 상단 띠(brands)와 같은 비례(영화제 아이콘 58 : 교육청 72, 같은 굵기 보정) — 3차 렌더에서 교육청 로고가 눈에 띄게 작았다.
    c.save(); c.shadowColor = '#1d1d1b'; c.shadowBlur = 1.2; drawOrgLogo(c, ph.x + photoW - (oh * ratio) / 2, logoY + logoH / 2, oh, 'dark'); c.restore();
    // 아래 흰 여백: 손글씨 제목(왼쪽, 세로 가운데) | 종이에 찍힌 글(오른쪽 끝 맞춤, 세로 가운데)
    draw(c, title, ph.x + 8, capTop + (stripH - title.height) / 2 - 4, '#1d1b19', 'left');
    printed.draw(ph.x + photoW, capTop + (stripH - printed.height) / 2, 'right');
    c.restore();
  } },

  /* 7. 타이포그래피 — «타이포그래피 잡지 표지»(2026-10-18 Bumm님: «매번 제일 마음에 안 듦 → 진짜 타이포그래피 매거진 느낌으로 새로.
        기본은 포스터라 사진 위주여야 하고, 지금은 사진이 너무 작음»). 사진이 화면 위쪽 3분의 2 남짓을 가장자리까지 채우고,
        아주 큰 제목이 사진과 종이의 경계에 걸쳐 놓인다 — 같은 글자가 사진 위에서는 흰색, 종이 위에서는 먹색으로 갈린다
        (경계에서 글자 색이 바뀌는 잡지 표지 활자 기법 — 줄마다 한 번만 그리고 색만 경계에서 나눈다).
        종이 쪽은 스위스식 3단 격자: 굵은 먹선과 주홍 표지 아래 홍보 문구 | 크레딧 | 영화제 · 날짜(주홍) · 장소.
        레퍼런스: Müller-Brockmann 격자, 잡지 «Eye» · «Slanted» 표지(활자와 사진이 한 면을 나눠 씀). */
  { label: '타이포그래피', render(c, art, m) {
    const ink = '#141414', red = '#E0412B', M = 56, colW = W - 2 * M;
    c.fillStyle = '#F2F1EC'; c.fillRect(0, 0, W, H); grain(c, 0, 0, W, H, 0.05);
    // 아래 격자(종이)를 먼저 잰다.
    const gap = 36, cw = (colW - 2 * gap) / 3;
    const cols = [
      column(c, [{ text: m.tagline, s: { family: SONG, weight: 400 }, size: 32, color: ink, lh: 1.3 }], cw),
      column(c, [
        { text: creditMain(m), s: { family: SANS, weight: 700 }, size: 24, color: ink, lh: 1.4 },
        { text: creditSub(m), s: { family: SANS, weight: 400 }, size: 20, color: '#55524c', gap: 8, lh: 1.45 },
      ], cw),
      column(c, [
        { text: FEST, s: { family: SANS, weight: 600 }, size: 20, color: ink, oneLine: true },
        { text: DATE, s: { family: SANS, weight: 800 }, size: 30, color: red, gap: 10, oneLine: true },
        { text: VENUE, s: { family: SANS, weight: 600 }, size: 20, color: ink, gap: 8, oneLine: true },
      ], cw),
    ];
    const gridTop = H - M - Math.max(...cols.map((k) => k.height)), ruleY = gridTop - 36;
    // 제목: 폭 가득(짧으면 한 줄로 아주 크게), 마지막 줄 글자 한가운데를 사진과 종이의 경계가 지나간다.
    const title = fitTitle(c, m.title, { family: DISPLAY, weight: 400, tracking: -0.03 }, { width: colW, max: 360, oneLineMin: 150, max2: 190, min: 84, maxLines: 3, lh: 1.0, maxHeight: 560 });
    const titleTop = ruleY - 48 - title.height;
    const lastBase = titleTop + title.asc + (title.lines.length - 1) * title.step;
    const edge = Math.round(lastBase - title.size * 0.36);
    // 사진: 위쪽 가장자리까지 꽉. 주인공은 로고 아래 ~ 제목 위 안전 영역에 지킨다.
    const safeTop = 150, safe: Rect = { x: M, y: safeTop, w: colW, h: Math.max(240, titleTop - 24 - safeTop) };
    placeArt(c, art, { x: 0, y: 0, w: W, h: edge }, safe, subjectBox(m));
    const shade = c.createLinearGradient(0, titleTop - 160, 0, edge);
    shade.addColorStop(0, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(0,0,0,.52)');
    c.fillStyle = shade; c.fillRect(0, titleTop - 160, W, edge - titleTop + 160);
    brands(c);
    const split = c.createLinearGradient(0, edge - 0.5, 0, edge + 0.5);
    split.addColorStop(0, '#fff'); split.addColorStop(1, ink);
    draw(c, title, M - 6, titleTop, split, 'left');
    // 굵은 먹선 + 왼쪽 주홍 표지, 그 아래 3단
    c.fillStyle = ink; c.fillRect(M, ruleY, colW, 6);
    c.fillStyle = red; c.fillRect(M, ruleY - 14, 64, 14);
    cols.forEach((k, i) => k.draw(M + i * (cw + gap), gridTop));
  } },

  /* 8. 트립틱 — 한 그림을 30·40·30 세 칸으로 화면 가득(4px 가는 틈), 칸마다 색조를 달리해(새벽 파랑 · 원래 색 · 밤 보라)
        «시간의 세 칸»으로 읽힌다. 색 세기는 그림의 밝기·채도에 맞춘다(src/palette.ts triptychGrade):
        채도 낮은 사람 사진은 색을 더 입히고, 어두운 그림은 같은 색을 밝혀 덧칠해 어떤 그림이든 세 칸 차이가 보인다.
        글은 아래 어둠 위에 가운데 축(세 칸의 대칭). 레퍼런스: Moonlight 가로판(칸마다 색조). */
  { label: '트립틱', render(c, art, m) {
    c.fillStyle = '#0a0a0a'; c.fillRect(0, 0, W, H);
    const g = 4, widths = [354, 484, 354], xs = [0, 354 + g, 354 + g + 484 + g];
    const grade = triptychGrade(artTone(art));
    // 그림의 주색이 그 칸의 색(파랑 220° · 보라 285°)과 가까우면 칸 색을 더 깊게 가라앉혀 가운데 칸과 갈라지게 한다
    // (불꽃놀이처럼 원래 푸른 그림에서 왼쪽 칸 차이가 ΔE 13.8에 그쳤다).
    const main = artColors(art).hue, near = (h: number) => Math.min(Math.abs(main - h), 360 - Math.abs(main - h)) < 40;
    const tints = [{ hue: '#2f6fe0', deep: 'rgb(20,40,104)', extra: near(220) ? 0.42 : 0 }, null,
      { hue: '#a23fc4', deep: 'rgb(70,24,86)', extra: near(285) ? 0.42 : 0 }];
    xs.forEach((x, i) => {
      c.save(); c.beginPath(); rectPath(c, x, 0, widths[i], H); c.clip();
      photo(c, art, 0, 0, W, H, 0.4);
      const t = tints[i];
      if (t) {
        c.globalCompositeOperation = 'color'; c.globalAlpha = grade.color; c.fillStyle = t.hue; c.fillRect(x, 0, widths[i], H);
        if (grade.lift) { c.globalCompositeOperation = 'screen'; c.globalAlpha = grade.lift; c.fillStyle = t.hue; c.fillRect(x, 0, widths[i], H); }
        const deep = Math.max(grade.deep, t.extra);
        if (deep) { c.globalCompositeOperation = 'multiply'; c.globalAlpha = deep; c.fillStyle = t.deep; c.fillRect(x, 0, widths[i], H); }
      }
      c.restore();
    });
    const bill = billing(c, m, {
      main: { family: SANS, weight: 600 }, mainSize: 30, mainColor: '#f1eee8',
      sub: { family: SANS, weight: 400 }, subSize: 23, subColor: '#cfcac0',
      fest: { family: SANS, weight: 500, tracking: 0.06 }, festSize: 24, festColor: '#cfcac0',
      when: { family: SANS, weight: 700 }, whenSize: 26, whenColor: '#fff', gapCredits: 34, gapFest: 8,
    }, 1040);
    const billTop = 1730 - bill.height;
    const title = fitTitle(c, m.title, { family: SERIF, weight: 700, tracking: 0.02 }, { width: 1040, max: 132, oneLineMin: 88, max2: 96, min: 60, maxLines: 3, maxHeight: 280 });
    const titleTop = billTop - 52 - title.height;
    const tag = fitSmall(c, m.tagline, { family: SERIF, weight: 500, tracking: 0.14 }, 27, 1000);
    const tagTop = titleTop - 28 - tag.height;
    const fadeStart = Math.min(1000, tagTop - 260);
    const fade = c.createLinearGradient(0, fadeStart, 0, H);
    fade.addColorStop(0, 'rgba(8,8,10,0)'); fade.addColorStop(0.5, 'rgba(8,8,10,.7)'); fade.addColorStop(1, 'rgba(8,8,10,.94)');
    c.fillStyle = fade; c.fillRect(0, fadeStart, W, H - fadeStart);
    draw(c, tag, W / 2, tagTop, '#e2ddd2', 'center');
    draw(c, title, W / 2, titleTop, '#fff', 'center');
    bill.draw(W / 2, 1730, 'center');
    brands(c);
  } },
];
