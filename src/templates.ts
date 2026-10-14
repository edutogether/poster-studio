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
import { artColors, colorBlockColors, archColors, css, artTone, triptychGrade } from './palette.js';

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
    // 배경 연장: 같은 그림을 칸을 덮는 크기로 크게 흐리고 살짝 가라앉혀 깐 뒤, 선명한 그림을 가장자리를 부드럽게 해서 얹는다.
    const sc = sCover * 1.08, iw = aw * sc, ih = ah * sc;
    c.save();
    if ('filter' in c) c.filter = 'blur(36px) saturate(1.1)';
    c.drawImage(art, cover.x + (cover.w - iw) / 2, cover.y + (cover.h - ih) * 0.45, iw, ih);
    c.restore();
    c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(cover.x, cover.y, cover.w, cover.h);
    featherDraw(c, art, r, 56);
  } else {
    c.drawImage(art, r.x, r.y, r.w, r.h);
  }
  c.restore();
  return r;
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
function halation(c: Ctx, art: HTMLImageElement, x: number, y: number, w: number, h: number, ay: number) {
  if (typeof document === 'undefined') return;
  try {
    const sw = 120, sh = Math.max(1, Math.round(120 * h / w));
    const t = document.createElement('canvas'); t.width = sw; t.height = sh;
    const tc = t.getContext?.('2d'); if (!tc || typeof tc.getImageData !== 'function') return;
    const s = Math.max(sw / art.width, sh / art.height), iw = art.width * s, ih = art.height * s;
    tc.drawImage(art, (sw - iw) / 2, (sh - ih) * ay, iw, ih);
    const id = tc.getImageData(0, 0, sw, sh), d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255, k = Math.max(0, (l - 0.7) / 0.3);
      d[i] = 255 * k; d[i + 1] = 72 * k; d[i + 2] = 30 * k; d[i + 3] = 255;
    }
    tc.putImageData(id, 0, 0);
    c.save(); c.globalCompositeOperation = 'screen'; c.globalAlpha = 0.6;
    if ('filter' in c) c.filter = 'blur(10px)';
    c.drawImage(t, x - 12, y - 12, w + 24, h + 24); c.restore();
  } catch { /* 그림을 읽을 수 없으면 번짐 없이 */ }
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

/** 한글 세로쓰기(위 → 아래, 여러 열이면 오른쪽 열부터). 캔버스에는 세로쓰기가 없어 글자를 하나씩 세운다.
 *  - 크기 = 기둥 높이 ÷ 글자 수(띄어쓰기는 0.45글자), 최대 기둥 폭·170px. 한 열이 88px 밑이면 띄어쓰기에서 균형 있게 2열·3열.
 *  - fixed를 주면 그 크기로 한 열(부제처럼 작은 세로 글).
 *  - justify: 글줄 길이가 기둥 높이의 70%를 넘으면 글자 사이를 고르게 벌려 정확히 기둥 높이를 채운다(그림 높이와 맞물리게).
 *  - 한글이 없는 제목(영문)은 통째로 90° 돌려 한 줄로 세운다(세로쓰기에서 라틴 글자를 눕히는 관례).
 *  - 쉼표·마침표는 글자 칸 오른쪽 위로 옮긴다(세로쓰기 문장부호 자리).
 *  반환: 실제로 그린 가장 왼쪽 x와 글자 크기(옆에 다른 세로 글을 붙일 때 쓴다). */
function verticalTitle(c: Ctx, text: string, s: Style, x0: number, x1: number, top: number, height: number, color: string,
  justify = false, fixed = 0): { left: number; size: number } {
  const t = text.trim(), colW = x1 - x0;
  c.save(); c.fillStyle = color; c.textBaseline = 'alphabetic';
  if (!/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(t)) {
    let size = fixed || Math.min(colW * 0.9, 200);
    while (size > 18 && inkWidth(c, s, size, t) > height) size -= 2;
    const b = block(c, [t], s, size, 1);
    const left = x1 - b.asc - b.desc;
    c.translate(left + b.desc, top); c.rotate(Math.PI / 2);
    draw(c, b, 0, -b.asc, color, 'left');
    c.restore(); return { left, size };
  }
  const units = (w: string) => [...w].length;
  const colUnits = (words: string[]) => words.reduce((n, w, i) => n + units(w) + (i ? 0.45 : 0), 0);
  const words = t.split(/\s+/).filter(Boolean);
  let cols: string[][] = [words];
  let size = fixed || Math.min(170, colW, height / colUnits(words));
  for (let n = 2; !fixed && size < 88 && n <= 3 && words.length >= n; n++) {
    let best: string[][] | null = null, bestScore = Infinity;
    const walk = (start: number, left: number, acc: string[][]) => {
      if (left === 1) {
        const parts = [...acc, words.slice(start)];
        const score = Math.max(...parts.map(colUnits)) * 40 + breakPenalty(parts.map((p) => p.join(' ')), 40);
        if (score < bestScore) { bestScore = score; best = parts; }
        return;
      }
      for (let i = start + 1; i <= words.length - left + 1; i++) walk(i, left - 1, [...acc, words.slice(start, i)]);
    };
    walk(0, n, []);
    if (!best) break;
    cols = best;
    size = Math.min(170, (colW - (n - 1) * 24) / n, height / Math.max(...cols.map(colUnits)));
  }
  // 띄어쓰기가 없어 단어로 못 나누는 긴 제목: 글자 단위로 고르게 2~4열(최후 수단 — 가로 제목의 글자 단위 줄바꿈과 같은 규칙).
  if (!fixed && size < 40) {
    const chars = [...t.replace(/\s+/g, '')];
    for (let n = 2; n <= 4; n++) {
      const per = Math.ceil(chars.length / n);
      const parts = Array.from({ length: n }, (_, i) => [chars.slice(i * per, (i + 1) * per).join('')]).filter((p) => p[0]);
      const z = Math.min(170, (colW - (parts.length - 1) * 24) / parts.length, height / (per * 1.02));
      cols = parts; size = z;
      if (z >= 40) break;
    }
  }
  size = Math.max(fixed ? 12 : 20, Math.floor(size));
  setFont(c, { ...s, tracking: 0 }, size);
  c.textAlign = 'center';
  const colGap = size * 0.28;
  let left = x1;
  cols.forEach((ws, ci) => {
    const cx = x1 - size / 2 - ci * (size + colGap);
    left = Math.min(left, cx - size / 2);
    // 글자 칸 높이: 기본 1.02em, justify면 기둥 높이를 채우도록 늘린다(최대 1.6em).
    const natural = colUnits(ws) * size * 1.02;
    let step = size * 1.02;
    if (justify && natural >= height * 0.7 && natural < height) step = Math.min(size * 1.6, step * height / natural);   // 늘리기만 한다(줄이면 글자가 겹친다)
    const gapW = step * 0.45;
    let y = top;
    ws.forEach((w, wi) => {
      if (wi) y += gapW;
      for (const ch of w) {
        const m = c.measureText(ch);
        const asc = m.actualBoundingBoxAscent ?? size * 0.8;
        if (/[,.，。、]/.test(ch)) { c.fillText(ch, cx + size * 0.32, y + size * 0.35); y += step * 0.5; continue; }
        c.fillText(ch, cx, y + Math.max(asc, size * 0.82));
        y += step;
      }
    });
  });
  c.restore();
  return { left, size };
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
        오른쪽 아래 바코드 자리(영화제 이름). 주인공은 제호·표지 문구와 겹치지 않는 안전 영역에 둔다(placeArt).
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
    // 바코드 자리: 흰 상자 안에 막대(숫자 없음 — 글자를 지어내지 않는다), 그 위에 영화제 이름.
    const bx = W - B - 24 - 196, by = H - B - 24 - 104;
    c.fillStyle = '#fff'; c.fillRect(bx, by, 196, 104);
    c.fillStyle = '#111';
    const bars = [3, 1, 2, 1, 1, 3, 1, 2, 2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1, 2, 1, 1, 3, 1, 2];
    let x = bx + 16;
    bars.forEach((bw, i) => { if (i % 2 === 0) c.fillRect(x, by + 16, bw * 2.2, 72); x += bw * 2.2 + 1.6; });
    const fest = fitSmall(c, FEST, { family: SANS, weight: 600, tracking: 0.02 }, 20, 300, 1.2, 15, true);
    draw(c, fest, W - B - 24, by - 12 - fest.height, '#fff', 'right');
  } },

  /* 3. 컬러 블록 — 위아래 두 색 면. 사진은 위 색 면 «안쪽 여백 안»에 들어간다(사방 같은 여백 — 색 면이 사진의 액자).
        두 색은 그림에서 뽑는다: 위 = 그림의 주색(진하게), 아래 = 주색의 보색(깊게)(src/palette.ts, 대비는 수치로 고정).
        사진은 주인공 상자를 지키며 칸에 맞춘다(placeArt). 레퍼런스: Saul Bass «The Man with the Golden Arm»(색 면이 액자), «Anatomy of a Murder». */
  { label: '컬러 블록', render(c, art, m) {
    const k = colorBlockColors(artColors(art));
    const topC = css(k.top), bottomC = css(k.bottom), onBottom = css(k.onBottom), soft = css(k.onBottomSoft), ink = css(k.ink);
    paper(c, topC, 0.04); brands(c, true);
    const M = 72;
    const bill = billing(c, m, {
      main: { family: SANS, weight: 700 }, mainSize: 30, mainColor: '#fff',
      sub: { family: SANS, weight: 400 }, subSize: 23, subColor: soft,
      fest: { family: SANS, weight: 600 }, festSize: 24, festColor: soft,
      when: { family: SANS, weight: 700 }, whenSize: 26, whenColor: '#fff', gapCredits: 30, gapFest: 8,
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
        바깥은 같은 그림을 흐려 깐 위에 그림의 주색을 아주 깊게 덮은 막, 선·제목은 같은 색을 밝게(대비 수치 고정, src/palette.ts).
        레퍼런스: Criterion «The Spirit of the Beehive»(모양이 곧 색 창문), Mucha(세로로 긴 비례). */
  { label: '아치 프레임', render(c, art, m) {
    const k = archColors(artColors(art));
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
    // 바깥: 같은 그림을 크게 흐려 깔고(막 아래로 비친다), 창 안에는 주인공을 지키며 선명한 그림.
    c.save(); if ('filter' in c) c.filter = 'blur(28px)'; photo(c, art, 0, 0, W, H, 0.45); c.restore();
    const win: Rect = { x: cx - r, y: spring - r, w: 2 * r, h: archBottom - (spring - r) };
    const safe: Rect = { x: cx - 0.8 * r, y: spring - 0.62 * r, w: 1.6 * r, h: archBottom - 18 - (spring - 0.62 * r) };
    c.save(); c.beginPath(); archPath(c, cx, spring, r, archBottom); c.clip();
    placeArt(c, art, win, safe, subjectBox(m));
    c.restore();
    c.save(); c.globalAlpha = 0.84; c.fillStyle = veil;
    c.beginPath(); rectPath(c, 0, 0, W, H); archPath(c, cx, spring, r, archBottom); c.fill('evenodd'); c.restore();
    c.save(); c.strokeStyle = gold; c.lineWidth = 2; c.beginPath(); archPath(c, cx, spring, r + 14, archBottom + 14); c.stroke(); c.restore();
    draw(c, tag, cx, tagTop, soft, 'center');
    draw(c, title, cx, titleTop, gold, 'center');
    bill.draw(cx, 1728, 'center');
    brands(c, false, false);
  } },

  /* 5. 필름스트립 — 화면 전체가 35mm 영화 필름 한 토막(필름 폭 35mm = 1200px, 1mm ≈ 34.3px).
        검은 필름 바탕, 실제 비례의 구멍(2.8×1.98mm, 간격 4.75mm, 가장자리에서 2.01mm), 가장자리 주황 인쇄(번호·화살표 — 상표 없이),
        그림 칸 + 프레임 선 + 아래 «제목 칸», 필름 결과 밝은 곳 둘레의 붉은 빛 번짐(헐레이션). 레퍼런스: references-round2.md C. */
  { label: '필름스트립', render(c, art, m) {
    const mm = W / 35, base = '#110f0c';
    const perfW = 2.8 * mm, perfH = 1.98 * mm, pitch = 4.75 * mm, edge = 2.01 * mm;
    const imgX = Math.round(5.05 * mm), imgW = W - 2 * imgX;
    c.fillStyle = base; c.fillRect(0, 0, W, H);
    // 칸: 그림 칸(150~1236) · 프레임 선 26px · 제목 칸(1262~, 아래로 이어짐)
    const frameTop = 150, frameBottom = 1236, cardTop = frameBottom + 26;
    c.save(); roundRect(c, imgX, frameTop, imgW, frameBottom - frameTop, 14); c.clip();
    photo(c, art, imgX, frameTop, imgW, frameBottom - frameTop, 0.45);
    halation(c, art, imgX, frameTop, imgW, frameBottom - frameTop, 0.45);
    grain(c, imgX, frameTop, imgW, frameBottom - frameTop, 0.14, 'overlay');
    c.restore();
    c.fillStyle = '#050504'; roundRect(c, imgX, cardTop, imgW, H - cardTop + 40, 14); c.fill();
    // 위쪽 앞 칸의 끝자락
    c.save(); roundRect(c, imgX, -60, imgW, frameTop - 26 + 60, 14); c.clip();
    photo(c, art, imgX, frameTop - 26 - (frameBottom - frameTop), imgW, frameBottom - frameTop, 0.45);
    c.fillStyle = 'rgba(5,5,4,.45)'; c.fillRect(imgX, 0, imgW, frameTop); c.restore();
    // 구멍: 빛이 비치는 따뜻한 흰색, 모서리 0.5mm 둥글게
    c.fillStyle = '#efe6d2';
    for (let y = -pitch / 3; y < H; y += pitch) {
      roundRect(c, edge, y, perfW, perfH, 0.5 * mm); c.fill();
      roundRect(c, W - edge - perfW, y, perfW, perfH, 0.5 * mm); c.fill();
    }
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
    // 제목 칸: 오래된 영화의 타이틀 카드처럼 검은 칸 가운데 흰 글자
    const bill = billing(c, m, {
      main: { family: SANS, weight: 600 }, mainSize: 30, mainColor: '#f3ede0',
      sub: { family: SANS, weight: 400 }, subSize: 22, subColor: '#c9c0ae',
      fest: { family: SANS, weight: 500, tracking: 0.06 }, festSize: 23, festColor: '#c9c0ae',
      when: { family: SANS, weight: 700 }, whenSize: 25, whenColor: '#f3ede0', gapCredits: 30, gapFest: 8,
    }, imgW - 80);
    const billTop = 1734 - bill.height;
    const title = fitTitle(c, m.title, { family: SANS, weight: 900, tracking: -0.02 }, { width: imgW - 80, max: 132, oneLineMin: 84, max2: 92, min: 58, maxLines: 3, maxHeight: 250 });
    const titleTop = billTop - 40 - title.height;
    const tag = fitSmall(c, m.tagline, { family: SANS, weight: 500, tracking: 0.16 }, 24, imgW - 80);
    const tagTop = titleTop - 22 - tag.height;
    draw(c, tag, W / 2, Math.max(cardTop + 30, tagTop), '#c9c0ae', 'center');
    draw(c, title, W / 2, titleTop, '#fbf6ea', 'center');
    bill.draw(W / 2, 1734, 'center');
    grain(c, 0, 0, W, H, 0.06, 'overlay');
    brands(c, false, false, imgX + 18, W - imgX - 18);
  } },

  /* 6. 폴라로이드 — 사진관 앨범 한 장: 크라프트 종이 위 2도 기운 진짜 즉석 사진(i-Type 비례: 카드 88×107mm, 사진 79×79mm 정사각,
        아래 여백 22mm), 네 귀퉁이 사진 모서리, 제목은 아래 흰 여백에 유성 매직으로 손으로 쓴 캡션.
        레퍼런스: Memento(아래 여백이 글 쓰는 자리), Paper Moon(사진 모서리·기념사진관). */
  { label: '폴라로이드', render(c, art, m) {
    const ink = '#2a241d', mute = '#5e5141';
    paper(c, '#e2d3b8', 0.09); brands(c, true);
    const bill = billing(c, m, {
      main: { family: SANS, weight: 700 }, mainSize: 28, mainColor: ink,
      sub: { family: SANS, weight: 400 }, subSize: 22, subColor: mute,
      fest: { family: SANS, weight: 600 }, festSize: 23, festColor: mute,
      when: { family: SANS, weight: 700 }, whenSize: 25, whenColor: ink, gapCredits: 28, gapFest: 6,
    }, 860);
    const billTop = 1726 - bill.height;
    const tag = fitSmall(c, m.tagline, { family: SERIF, weight: 500 }, 28, 860);
    const tagTop = billTop - 34 - tag.height;
    // 카드 크기는 즉석 사진 비례 그대로 — 폭 1000px(1mm ≈ 11.4px)까지 키우고, 아래 글 자리가 모자라면 비례를 지킨 채 줄인다.
    const room = tagTop - 56 - 186, mmPx = Math.min(1000 / 88, room / 107);
    const cardW = 88 * mmPx, cardH = 107 * mmPx, cardX = (W - cardW) / 2, cardTop = 186, cardBottom = cardTop + cardH;
    const side = 4.5 * mmPx, topB = 5.5 * mmPx, photoS = 79 * mmPx, capTop = cardTop + topB + photoS, capH = cardBottom - capTop;
    const title = fitTitle(c, m.title, { family: MARKER, weight: 700, tracking: -0.03 }, { width: photoS - 24, max: 132, oneLineMin: 78, max2: 74, min: 46, maxLines: 2, lh: 1.6, maxHeight: capH - 30 });   // 줄 간격 1.6: 2도 기운 카드에서 두 줄 캡션의 테두리 상자가 겹치지 않게
    c.save(); c.translate(W / 2, cardTop + cardH / 2); c.rotate(-0.035); c.translate(-W / 2, -(cardTop + cardH / 2));
    c.save(); c.shadowColor = 'rgba(58,40,20,.35)'; c.shadowBlur = 26; c.shadowOffsetY = 10;
    c.fillStyle = '#fbfaf6'; c.fillRect(cardX, cardTop, cardW, cardH); c.restore();
    const sq: Rect = { x: cardX + side, y: cardTop + topB, w: photoS, h: photoS };
    placeArt(c, art, sq, sq, subjectBox(m));   // 정사각으로 자를 때도 주인공 상자를 지킨다
    // 즉석 사진 색: 검정이 살짝 들뜨고 따뜻하게.
    c.save(); c.globalCompositeOperation = 'screen'; c.fillStyle = 'rgba(46,34,24,.16)'; c.fillRect(cardX + side, cardTop + topB, photoS, photoS);
    c.globalCompositeOperation = 'soft-light'; c.fillStyle = 'rgba(255,214,160,.22)'; c.fillRect(cardX + side, cardTop + topB, photoS, photoS); c.restore();
    draw(c, title, cardX + side + 12, capTop + (capH - title.height) / 2 - 2, '#1d1b19', 'left');
    // 사진 모서리: 네 귀퉁이를 감싸는 작은 삼각 주머니.
    c.fillStyle = '#3a2c20';
    const k = 60;
    for (const [x, y, sx, sy] of [[cardX, cardTop, 1, 1], [cardX + cardW, cardTop, -1, 1], [cardX, cardBottom, 1, -1], [cardX + cardW, cardBottom, -1, -1]]) {
      c.beginPath(); c.moveTo(x - sx * 8, y - sy * 8); c.lineTo(x + sx * k, y - sy * 8); c.lineTo(x - sx * 8, y + sy * k); c.closePath(); c.fill();
    }
    c.restore();
    draw(c, tag, cardX, tagTop, ink, 'left');
    bill.draw(cardX, 1726, 'left');
  } },

  /* 7. 타이포그래피 — «개인 카페에 붙은 활판 포스터»: 결이 있는 따뜻한 종이, 왼쪽에 그림(2:3 그대로), 오른쪽에 한글 세로쓰기 제목(Song Myung)이
        그림 높이를 정확히 채우고, 그 왼쪽에 작은 세로 부제(홍보 문구)가 한 박자 아래에서 따라 내려온다. 아래는 넓은 여백 뒤 작은 정보 글.
        위계 = 세로 제목(아주 크게) · 세로 부제(작게) · 정보(가장 작게), 색은 먹색 하나 + 날짜에만 주홍. 정렬은 그림 왼쪽 선 하나.
        레퍼런스: references-round2.md A(⭐ A-2) — 슬기와 민·신신(제목 길이별 줄바꿈 체계), 한글 세로쓰기 활판 문법. */
  { label: '타이포그래피', render(c, art, m) {
    const ink = '#1d1a16', mute = '#6c6253', vermilion = '#b4462b';
    paper(c, '#f4efe5', 0.07);
    // 종이 가장자리를 아주 살짝 어둡게(인쇄 종이의 손때 — 4%).
    const v = c.createRadialGradient(W / 2, H * 0.45, H * 0.35, W / 2, H * 0.5, H * 0.75);
    v.addColorStop(0, 'rgba(80,60,30,0)'); v.addColorStop(1, 'rgba(80,60,30,.08)');
    c.fillStyle = v; c.fillRect(0, 0, W, H);
    brands(c, true);
    const L = 96, top = 232, imgW = 700, imgH = 1050;
    // 그림: 2:3 그대로(자르지 않는다). 종이에 붙인 인화지처럼 아주 옅은 그림자.
    c.save(); c.shadowColor = 'rgba(60,45,25,.22)'; c.shadowBlur = 18; c.shadowOffsetY = 6;
    c.fillStyle = '#fff'; c.fillRect(L, top, imgW, imgH); c.restore();
    photo(c, art, L, top, imgW, imgH, 0.5);
    // 세로 제목: 그림 오른쪽 기둥(그림 끝 + 64 ~ 오른쪽 여백). 길이가 그림 높이의 70%를 넘으면 그림 높이에 맞춰 고르게 벌린다.
    const tCol = verticalTitle(c, m.title, { family: SONG, weight: 400 }, L + imgW + 56, W - L, top, imgH, ink, true);
    // 세로 부제: 제목 기둥 왼쪽, 제목 한 글자 반 아래에서 시작. 자리가 모자라면 그림 아래 가로로.
    const tagSize = 30, tagX1 = tCol.left - 30;
    const tagLen = [...m.tagline.replace(/\s+/g, ' ')].length * tagSize * 1.05;
    let infoTopLimit = top + imgH;   // 주연 글은 그림(또는 가로 부제) 아래에서만
    if (tagX1 - tagSize >= L + imgW + 20 && tagLen <= imgH - tCol.size * 1.5) {
      verticalTitle(c, m.tagline, { family: SONG, weight: 400 }, tagX1 - tagSize, tagX1, top + tCol.size * 1.5, imgH - tCol.size * 1.5, mute, false, tagSize);
    } else {
      const tag = fitSmall(c, m.tagline, { family: SONG, weight: 400 }, 30, imgW, 1.4);
      draw(c, tag, L, top + imgH + 40, mute, 'left');
      infoTopLimit = top + imgH + 40 + tag.height;
    }
    // 정보: 주연(약간 크게) → 가는 선 → 영화제 · 날짜(주홍) · 장소. 왼쪽 선 하나.
    const info = column(c, [
      { text: FEST, s: { family: SANS, weight: 600, tracking: 0.02 }, size: 22, color: ink, oneLine: true },
      { text: DATE, s: { family: SANS, weight: 700, tracking: 0.04 }, size: 22, color: vermilion, gap: 8, oneLine: true },
      { text: VENUE, s: { family: SANS, weight: 600 }, size: 22, color: ink, gap: 8, oneLine: true },
    ], 520);
    const infoTop = 1728 - info.height;
    hairline(c, L, infoTop - 24, 360, 'rgba(29,26,22,.35)', 1);
    info.draw(L, infoTop);
    const credit = column(c, [
      { text: creditMain(m), s: { family: SANS, weight: 500, tracking: 0.06 }, size: 25, color: ink, lh: 1.35 },
      { text: creditSub(m), s: { family: SANS, weight: 400 }, size: 21, color: mute, gap: 8, lh: 1.45 },
    ], 760);
    credit.draw(L, Math.max(infoTopLimit + 24, infoTop - 24 - 36 - credit.height));
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
