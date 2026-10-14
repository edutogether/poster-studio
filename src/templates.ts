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
function paper(c: Ctx, color: string, grainAlpha = 0.05) {
  c.fillStyle = color; c.fillRect(0, 0, W, H);
  grain(c, 0, 0, W, H, grainAlpha);
}
/** 종이 결 — 고정 씨앗의 잡음이라 같은 입력이면 늘 같은 그림이 나온다(무작위 금지: 인쇄·대조가 흔들린다). */
let grainTile: HTMLCanvasElement | null = null;
function grain(c: Ctx, x: number, y: number, w: number, h: number, alpha: number) {
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
  c.save(); c.globalAlpha = alpha; c.globalCompositeOperation = 'multiply'; c.fillStyle = p; c.fillRect(x, y, w, h); c.restore();
}
function hairline(c: Ctx, x: number, y: number, w: number, color: string, t = 2) { c.fillStyle = color; c.fillRect(x, Math.round(y), w, t); }

/* ───────────── 로고 두 개(윗줄 크레딧) — 자리·크기는 그대로(테스트로 고정) ───────────── */
function brands(c: Ctx, dark = false, veil = !dark) {
  const color = dark ? '#1d1d1b' : '#fff';
  if (veil) {
    const g = c.createLinearGradient(0, 0, 0, 240);
    g.addColorStop(0, '#0009'); g.addColorStop(1, 'transparent');
    c.fillStyle = g; c.fillRect(0, 0, W, 240);
  }
  if (state.LOGO_FESTIVAL) c.drawImage(state.LOGO_FESTIVAL, 120, 0, 145, 90, 64, 53, 93, 58);
  c.save(); c.textBaseline = 'middle'; c.fillStyle = color;
  c.font = `800 32px ${SANS}`; setLS(c, 0); c.fillText('InKY', 173, 86);
  c.font = `400 32px ${SANS}`; c.fillText('Film Festival', 257, 86);
  c.restore();
  const logo = dark ? state.LOGO_DARK : state.LOGO_LIGHT;
  const ratio = logo?.naturalWidth && logo.naturalHeight ? logo.naturalWidth / logo.naturalHeight : 3.8;
  c.save(); c.shadowColor = color; c.shadowBlur = 1.4;
  drawOrgLogo(c, W - 64 - 72 * ratio / 2, 86, 72, dark ? 'dark' : 'light'); c.restore();
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

  /* 2. 에디토리얼 — 미색 종이, 비대칭 격자: 왼쪽 좁은 칸(위 홍보 문구 · 아래 주연 크레딧) + 오른쪽 그림 상자,
        명조 제목 한 줄, 맨 아래 세 칸 정보 표(영화제 | 날짜 | 장소). 정렬은 왼쪽 선(x 80) 하나.
        레퍼런스: Tschichold «Die Frau ohne Namen»(비대칭 격자), Criterion 표지(여백이 곧 고급감), 벌새(글을 그림 둘레 여백에). */
  { label: '에디토리얼', render(c, art, m) {
    const ink = '#1c1c1a', mute = '#5d5a52';
    paper(c, '#f2ede3', 0.05); brands(c, true);
    hairline(c, 80, 150, 1040, ink, 2);
    // 맨 아래 정보 표 — 세 칸이 같은 위쪽 선에서 시작한다.
    const cells = [
      { x: 80, k: column(c, [{ text: FEST, s: { family: SANS, weight: 600 }, size: 24, color: ink, oneLine: true }], 400) },
      { x: 560, k: column(c, [{ text: DATE, s: { family: SANS, weight: 700 }, size: 24, color: ink, oneLine: true }], 260) },
      { x: 880, k: column(c, [{ text: VENUE, s: { family: SANS, weight: 600 }, size: 24, color: ink, oneLine: true }], 240) },
    ];
    const tableTop = 1720 - Math.max(...cells.map((t) => t.k.height));
    hairline(c, 80, tableTop - 24, 1040, ink, 2);
    cells.forEach((t) => t.k.draw(t.x, tableTop));
    const title = fitTitle(c, m.title, { family: SERIF, weight: 900, tracking: -0.03 }, { width: 1040, max: 146, oneLineMin: 92, max2: 104, min: 64, maxLines: 3, maxHeight: 330 });
    const titleTop = tableTop - 24 - 70 - title.height;
    const imgTop = 190, imgBottom = titleTop - 54;
    photo(c, art, 360, imgTop, 760, imgBottom - imgTop, 0.45);
    // 왼쪽 칸(240px): 위에는 홍보 문구(그림 위쪽 선), 아래에는 주연 크레딧(그림 아래쪽 선) — 칸의 두 끝이 그림의 두 끝과 맞는다.
    draw(c, fitSmall(c, m.tagline, { family: SERIF, weight: 500 }, 30, 240, 1.5), 80, imgTop - 4, ink, 'left');
    const credit = column(c, [{ text: creditMain(m), s: { family: SANS, weight: 700 }, size: 26, color: ink, lh: 1.35 },
      { text: creditSub(m), s: { family: SANS, weight: 400 }, size: 21, color: mute, gap: 10, lh: 1.45 }], 240);
    credit.draw(80, imgBottom - credit.height);
    draw(c, title, 76, titleTop, ink, 'left');
  } },

  /* 3. 컬러 블록 — 노랑 종이와 파랑 면 두 단, 그림은 두 면에 걸쳐 놓인 카드, 홍보 문구는 오른쪽 여백에 세로로.
        레퍼런스: Saul Bass «Anatomy of a Murder»(위아래 색 면이 정보 위계를 가름), «The Man with the Golden Arm»(색 면이 액자),
        The Green Knight(가장자리 세로 문구가 틀). 색은 노랑·파랑·검정 세 가지만. */
  { label: '컬러 블록', render(c, art, m) {
    const yellow = '#f3c234', blue = '#1b3aa3', ink = '#151515';
    paper(c, yellow, 0.04); brands(c, true);
    const bill = billing(c, m, {
      main: { family: SANS, weight: 700 }, mainSize: 30, mainColor: '#fff',
      sub: { family: SANS, weight: 400 }, subSize: 23, subColor: '#d5ddfb',
      fest: { family: SANS, weight: 600 }, festSize: 24, festColor: '#d5ddfb',
      when: { family: SANS, weight: 700 }, whenSize: 26, whenColor: '#fff', gapCredits: 30, gapFest: 8,
    }, 960);
    const billTop = 1724 - bill.height;
    // 짧은 제목은 더 크게(최대 190px) — 파랑 면 위에서 제목이 면의 주인이 되게.
    const title = fitTitle(c, m.title, { family: DISPLAY, weight: 400, tracking: -0.01 }, { width: 960, max: 190, oneLineMin: 96, max2: 104, min: 64, maxLines: 3, maxHeight: 330 });
    const titleTop = billTop - 46 - title.height;
    const cardBottom = titleTop - 44;
    const planeTop = Math.round(cardBottom - (cardBottom - 170) * 0.3);
    c.fillStyle = blue; c.fillRect(0, planeTop, W, H - planeTop);
    photo(c, art, 120, 170, 960, cardBottom - 170, 0.42);
    draw(c, title, 120, titleTop, yellow, 'left');
    bill.draw(120, 1724, 'left');
    // 세로 문구: 카드 오른쪽 여백(1080~1200)의 가운데 선, 카드 위쪽에서부터 아래로 읽힌다.
    const tag = fitSmall(c, m.tagline, { family: SANS, weight: 700, tracking: 0.1 }, 26, planeTop - 170 - 20, 1.2, 18);
    c.save(); c.translate(1140, 170); c.rotate(Math.PI / 2);
    draw(c, tag, 0, -tag.height / 2, ink, 'left');
    c.restore();
  } },

  /* 4. 아치 프레임 — 그림을 전면에 깔고, 아치 모양 창만 원래 색으로 남긴다(바깥은 깊은 초록 막). 금색 선 하나, 고전 명조, 가운데 축.
        레퍼런스: Criterion «The Spirit of the Beehive»(모양이 곧 색 창문), Mucha(세로로 긴 비례), «Pan's Labyrinth» 프랑스판(틀이 그림에 녹음). */
  { label: '아치 프레임', render(c, art, m) {
    const green = '#0d2a21', gold = '#d6bb7c';
    c.fillStyle = green; c.fillRect(0, 0, W, H);
    const bill = billing(c, m, {
      main: { family: SANS, weight: 500 }, mainSize: 30, mainColor: '#efe5cc',
      sub: { family: SANS, weight: 400 }, subSize: 23, subColor: '#cdbf9c',
      fest: { family: SANS, weight: 500, tracking: 0.06 }, festSize: 24, festColor: '#cdbf9c',
      when: { family: SANS, weight: 600 }, whenSize: 26, whenColor: '#efe5cc', gapCredits: 40, gapFest: 10,
    }, 1000);
    const billTop = 1728 - bill.height;
    const title = fitTitle(c, m.title, { family: SERIF, weight: 700, tracking: 0.04 }, { width: 1000, max: 116, oneLineMin: 80, max2: 92, min: 60, maxLines: 3, maxHeight: 260 });
    const titleTop = billTop - 52 - title.height;
    const tag = fitSmall(c, m.tagline, { family: SERIF, weight: 500, tracking: 0.14 }, 26, 960);
    const tagTop = titleTop - 30 - tag.height;
    const archBottom = tagTop - 56, r = 400, cx = W / 2, spring = 190 + r;
    // 그림은 아치 창이 가운데에 오도록 아치 아래 끝까지만 깐다(주인공은 대개 그림 가운데~아래).
    photo(c, art, 0, 0, W, archBottom + 160, 0.5);
    // 아치 바깥: 그림이 비치는 초록 막(Criterion «Beehive»처럼 모양 밖은 한 색으로 물들고, 안만 원래 색).
    c.save(); c.globalAlpha = 0.74; c.fillStyle = green;
    c.beginPath(); rectPath(c, 0, 0, W, H); archPath(c, cx, spring, r, archBottom); c.fill('evenodd'); c.restore();
    // 아치 아래 글 자리는 막을 짙게 — 그림 끝(archBottom + 160)이 보이지 않게 이어 준다.
    const fade = c.createLinearGradient(0, archBottom, 0, archBottom + 160);
    fade.addColorStop(0, 'rgba(13,42,33,0)'); fade.addColorStop(1, green);
    c.save(); c.beginPath(); rectPath(c, 0, archBottom, W, H - archBottom); archPath(c, cx, spring, r, archBottom); c.clip('evenodd');
    c.fillStyle = fade; c.fillRect(0, archBottom, W, 160); c.fillStyle = green; c.fillRect(0, archBottom + 160, W, H); c.restore();
    c.save(); c.strokeStyle = gold; c.lineWidth = 2; c.beginPath(); archPath(c, cx, spring, r + 14, archBottom + 14); c.stroke(); c.restore();
    draw(c, tag, cx, tagTop, '#d9c9a0', 'center');
    draw(c, title, cx, titleTop, '#ecd9a8', 'center');
    bill.draw(cx, 1728, 'center');
    brands(c, false, false);
  } },

  /* 5. 필름스트립 — 미색 종이 위 35mm 필름 한 토막: 작고 정돈된 구멍, 앞뒤 칸이 살짝 보여 «이어지는 필름»으로 읽힌다.
        제목·빌링은 필름 왼쪽 선에 맞춰 종이 위에. 레퍼런스: The Fabelmans(띠가 장면으로 이어짐), Day for Night 스페인어판(절제). */
  { label: '필름스트립', render(c, art, m) {
    const ink = '#1b1a17', mute = '#5b574e', base = '#16140f', sheet = '#ece6d9';
    paper(c, sheet, 0.05); brands(c, true);
    const left = 150, right = 1050;
    const credits = column(c, [{ text: creditMain(m), s: { family: SANS, weight: 700 }, size: 28, color: ink }, { text: creditSub(m), s: { family: SANS, weight: 400 }, size: 22, color: mute, gap: 8, lh: 1.45 }], 520);
    const when = column(c, [{ text: FEST, s: { family: SANS, weight: 600 }, size: 23, color: ink, oneLine: true }, { text: WHEN, s: { family: SANS, weight: 500 }, size: 23, color: mute, gap: 8 }], 470);
    const rowH = Math.max(credits.height, when.height), rowTop = 1724 - rowH;
    credits.draw(left, rowTop, 'left'); when.draw(right, rowTop, 'right');
    const title = fitTitle(c, m.title, { family: SANS, weight: 900, tracking: -0.03 }, { width: 900, max: 136, oneLineMin: 88, max2: 96, min: 60, maxLines: 3, maxHeight: 300 });
    const titleTop = rowTop - 52 - title.height;
    const tag = fitSmall(c, m.tagline, { family: SANS, weight: 500, tracking: 0.04 }, 27, 900);
    const tagTop = titleTop - 24 - tag.height;
    const stripBottom = tagTop - 44, stripTop = 168;
    c.fillStyle = base; c.fillRect(left, stripTop, right - left, stripBottom - stripTop);
    // 칸: 가운데 큰 칸 + 위·아래로 앞뒤 칸 끝자락(같은 그림을 어둡게) — 칸 사이 검은 띠(프레임 선) 18px.
    const fx = 228, fw = 744, mainTop = stripTop + 46, mainBottom = stripBottom - 46, fh = mainBottom - mainTop;
    c.save(); roundRect(c, fx, mainTop, fw, fh, 8); c.clip(); photo(c, art, fx, mainTop, fw, fh, 0.45); c.restore();
    for (const [y0, y1, from] of [[stripTop, mainTop - 18, mainTop - 18 - fh], [mainBottom + 18, stripBottom, mainBottom + 18]]) {
      if (y1 - y0 < 6) continue;
      c.save(); c.beginPath(); rectPath(c, fx, y0, fw, y1 - y0); c.clip();
      photo(c, art, fx, from, fw, fh, 0.45);
      c.fillStyle = 'rgba(22,20,15,.55)'; c.fillRect(fx, y0, fw, y1 - y0); c.restore();
    }
    // 구멍: 가로로 긴 둥근 사각형(KS 규격 비례), 좁은 간격 — 작게 해서 그림보다 튀지 않게. 구멍 너머로 종이가 보인다.
    c.fillStyle = sheet;
    for (let y = stripTop + 12; y + 18 <= stripBottom - 10; y += 40) {
      roundRect(c, left + 26, y, 26, 18, 4); c.fill();
      roundRect(c, right - 52, y, 26, 18, 4); c.fill();
    }
    draw(c, tag, left, tagTop, mute, 'left');
    draw(c, title, left, titleTop, ink, 'left');
  } },

  /* 6. 폴라로이드 — 사진관 앨범 한 장: 크라프트 종이, 2도만 기운 즉석 사진, 네 귀퉁이 사진 모서리, 제목은 사진 아래 흰 여백에 적은 캡션.
        레퍼런스: Memento(아래 여백이 글 쓰는 자리), Paper Moon(사진 모서리·기념사진관), Alice in the Cities(사진 캡션 문법). */
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
    const tagTop = billTop - 40 - tag.height;
    const cardX = 170, cardW = 860, cardTop = 186, cardBottom = tagTop - 56;
    const pad = 40, capH = 172;
    const title = fitTitle(c, m.title, { family: SERIF, weight: 700, tracking: -0.01 }, { width: cardW - 2 * pad, max: 96, oneLineMin: 64, max2: 64, min: 44, maxLines: 2, lh: 1.7, maxHeight: capH - 36 });   // 줄 간격 1.7: 2도 기운 카드에서 두 줄의 테두리 상자(기울기만큼 위아래로 늘어남)가 겹치지 않게
    c.save(); c.translate(W / 2, (cardTop + cardBottom) / 2); c.rotate(-0.035); c.translate(-W / 2, -(cardTop + cardBottom) / 2);
    c.save(); c.shadowColor = 'rgba(58,40,20,.35)'; c.shadowBlur = 26; c.shadowOffsetY = 10;
    c.fillStyle = '#fbf8f1'; c.fillRect(cardX, cardTop, cardW, cardBottom - cardTop); c.restore();
    photo(c, art, cardX + pad, cardTop + pad, cardW - 2 * pad, cardBottom - cardTop - pad - capH, 0.45);
    draw(c, title, cardX + pad, cardBottom - capH + (capH - title.height) / 2 - 4, ink, 'left');
    // 사진 모서리: 네 귀퉁이를 감싸는 작은 삼각 주머니.
    c.fillStyle = '#3a2c20';
    const k = 64;
    for (const [x, y, sx, sy] of [[cardX, cardTop, 1, 1], [cardX + cardW, cardTop, -1, 1], [cardX, cardBottom, 1, -1], [cardX + cardW, cardBottom, -1, -1]]) {
      c.beginPath(); c.moveTo(x - sx * 8, y - sy * 8); c.lineTo(x + sx * k, y - sy * 8); c.lineTo(x - sx * 8, y + sy * k); c.closePath(); c.fill();
    }
    c.restore();
    draw(c, tag, cardX, tagTop, ink, 'left');
    bill.draw(cardX, 1726, 'left');
  } },

  /* 7. 타이포그래피 — 스위스 문법: 위는 그림 한 덩어리, 아래는 제목을 폭 끝까지 채운 한 줄, 그 밑 세 칸 격자에 작은 글.
        레퍼런스: Müller-Brockmann «Der Film»(극단적 크기 대비 + 격자), Paula Scher(글자가 곧 그림), The Green Knight(굵은 제목). */
  { label: '타이포그래피', render(c, art, m) {
    const ink = '#111', accent = '#e5401d', mute = '#4d4a45';
    paper(c, '#efece6', 0.03);
    const colW = 320, gap = 40, xs = [80, 80 + colW + gap, 80 + 2 * (colW + gap)];
    const cols = [
      column(c, [{ text: m.tagline, s: { family: SANS, weight: 700 }, size: 26, color: accent, lh: 1.4 }], colW),
      column(c, [{ text: creditMain(m), s: { family: SANS, weight: 700 }, size: 26, color: ink }, { text: creditSub(m), s: { family: SANS, weight: 400 }, size: 22, color: mute, gap: 8, lh: 1.45 }], colW),
      column(c, [{ text: FEST, s: { family: SANS, weight: 600 }, size: 24, color: ink, lh: 1.4, oneLine: true }, { text: WHEN, s: { family: SANS, weight: 500 }, size: 24, color: mute, gap: 10, lh: 1.4 }], colW),
    ];
    const gridH = Math.max(...cols.map((k) => k.height));
    const gridTop = 1724 - gridH;
    // 제목은 폭 1040을 꽉 채우는 크기(최대 300px). 한 줄이 110px 밑으로 내려가야 하면 띄어쓰기에서 두 줄.
    const st: Style = { family: SANS, weight: 900, tracking: -0.04 };
    let size = 300; while (size > 110 && inkWidth(c, st, size, m.title.trim()) > 1040) size -= 2;
    const title = size > 110 ? block(c, [m.title.trim()], st, size, 1) : fitTitle(c, m.title, st, { width: 1040, max: 140, min: 64, maxLines: 3, lh: 1.02, maxHeight: 360 });
    const titleTop = gridTop - 70 - title.height;
    const imgBottom = titleTop - 44;
    photo(c, art, 0, 0, W, imgBottom, 0.5);
    brands(c);
    draw(c, title, 76, titleTop, ink, 'left');
    cols.forEach((k, i) => k.draw(xs[i], gridTop));
  } },

  /* 8. 트립틱 — 한 그림을 30·40·30 세 칸으로, 칸마다 색조를 달리해(새벽 파랑 · 원래 색 · 밤 보라) «시간의 세 칸»으로 읽힌다.
        레퍼런스: Moonlight 가로판(칸마다 색조), The Hours(빌링이 칸과 맞물림). 가운데 축은 세 칸의 대칭에서 나온다. */
  { label: '트립틱', render(c, art, m) {
    const ink = '#1f2a26', mute = '#56605a';
    paper(c, '#ebeae4', 0.05); brands(c, true);
    const bill = billing(c, m, {
      main: { family: SANS, weight: 600 }, mainSize: 28, mainColor: ink,
      sub: { family: SANS, weight: 400 }, subSize: 22, subColor: mute,
      fest: { family: SANS, weight: 500, tracking: 0.05 }, festSize: 23, festColor: mute,
      when: { family: SANS, weight: 700 }, whenSize: 25, whenColor: ink, gapCredits: 30, gapFest: 6,
    }, 1040);
    const billTop = 1726 - bill.height;
    const title = fitTitle(c, m.title, { family: SERIF, weight: 700, tracking: 0.02 }, { width: 1040, max: 120, oneLineMin: 84, max2: 90, min: 60, maxLines: 3, maxHeight: 270 });
    const titleTop = billTop - 50 - title.height;
    const tag = fitSmall(c, m.tagline, { family: SERIF, weight: 500, tracking: 0.12 }, 26, 1000);
    const tagTop = titleTop - 26 - tag.height;
    const top = 176, bottom = tagTop - 48, g = 16;
    const widths = [302, 404, 302], xs = [80, 80 + 302 + g, 80 + 302 + g + 404 + g];
    // 양쪽 칸 색조: 'color' 섞기로 색상만 바꾸고(밝고 어두움은 그림 그대로) 'multiply'로 조금 가라앉힌다.
    const grade = [{ hue: '#3c6fc6', deep: 'rgba(28,48,104,.28)' }, null, { hue: '#9a4b9e', deep: 'rgba(66,28,78,.28)' }];
    xs.forEach((x, i) => {
      c.save(); c.beginPath(); rectPath(c, x, top, widths[i], bottom - top); c.clip();
      photo(c, art, 80, top, 1040, bottom - top, 0.45);
      const t = grade[i];
      if (t) {
        c.globalCompositeOperation = 'color'; c.globalAlpha = 0.62; c.fillStyle = t.hue; c.fillRect(x, top, widths[i], bottom - top);
        c.globalCompositeOperation = 'multiply'; c.globalAlpha = 1; c.fillStyle = t.deep; c.fillRect(x, top, widths[i], bottom - top);
      }
      c.restore();
    });
    draw(c, tag, W / 2, tagTop, mute, 'center');
    draw(c, title, W / 2, titleTop, ink, 'center');
    bill.draw(W / 2, 1726, 'center');
  } },
];
