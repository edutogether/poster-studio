/* ────────────────────────────────────────────────────────────────────
   포스터 색을 그림에서 뽑는다(2026-10-14 Bumm님: «포스터마다 색이 그 그림에 어울리게 바뀌나 ? 위아래 색이 알맞게
   대비되게 바뀌나 ?» — 그 전까지 컬러 블록은 노랑·파랑, 아치 프레임은 초록으로 어떤 그림에나 같았다).

   1. 그림을 48×72로 줄여 색상(hue) 분포를 잰다 — 채도·밝기가 있는 화소만 센다(회색·검정·흰색은 색을 말해 주지 않는다).
   2. 가장 많은 색상 = 주색, 주색에서 60° 넘게 떨어진 색 중 가장 밝고 진한 것 = 강조색(없으면 주색의 보색).
   3. 쓰는 쪽(틀)은 이 값과 그림 밝기로 «정해 둔 색 세트»(아래, 2026-10-17) 하나를 고른다. 글자 색은 면 색에 맞춰
      «상대 휘도(WCAG)» 대비로 정하고, 세트 전부의 대비는 수치로 보장한다(test/palette.test.js).
   ──────────────────────────────────────────────────────────────────── */

export interface ArtColors { hue: number; accentHue: number; strength: number }
const DEFAULT: ArtColors = { hue: 215, accentHue: 42, strength: 0 };

/** 화소 배열(RGBA)에서 주색·강조색 색상을 잰다. 색이 거의 없는 그림이면 strength가 낮고 기본값 쪽으로 간다. */
export function analyzePixels(data: ArrayLike<number>): ArtColors {
  const bins = new Float64Array(36), bright = new Float64Array(36);
  let total = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    const s = max ? d / max : 0;
    if (s < 0.12 || max < 0.15) continue;
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    const w = s * Math.sqrt(max);
    const k = Math.floor(h / 10) % 36;
    bins[k] += w; bright[k] += s * max * max; total += w;
  }
  const smooth = (a: Float64Array) => Array.from(a, (_, k) => a[(k + 35) % 36] + 2 * a[k] + a[(k + 1) % 36]);
  const sb = smooth(bins), sl = smooth(bright);
  if (total < 1) return DEFAULT;
  let top = 0;
  for (let k = 1; k < 36; k++) if (sb[k] > sb[top]) top = k;
  const hue = (top * 10 + 5) % 360;
  let acc = -1;
  for (let k = 0; k < 36; k++) {
    const dist = Math.min(Math.abs(k - top), 36 - Math.abs(k - top));
    if (dist >= 6 && (acc < 0 || sl[k] > sl[acc])) acc = k;
  }
  const accentHue = acc >= 0 && sl[acc] > total * 0.02 ? (acc * 10 + 5) % 360 : (hue + 180) % 360;
  return { hue, accentHue, strength: Math.min(1, total / (data.length / 4) / 0.25) };
}

/* ───── 색 계산 ───── */
export function luminance([r, g, b]: [number, number, number]) {
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contrast(a: [number, number, number], b: [number, number, number]) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export const css = ([r, g, b]: [number, number, number], a = 1) => a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;

/* ───── 정해 둔 색 세트(2026-10-17 Bumm님: «색 세트가 적어도 10개는 있어야 함. 지금은 비슷하거나 중복인 세트가 너무 많음») ─────
   계산으로 뽑은 색은 비슷한 그림끼리 거의 같은 색이 나왔다. 그래서 색은 사람이 고른 세트에서 고르고, 고르는 기준만 그림에서 잰다:
   그림의 주색 계열 6가지(빨강·주황노랑·초록·청록·파랑·보라) × 그림 밝기 3단계(어두움·보통·밝음) = 18세트, 색이 거의 없는 그림은
   무채색 2세트(어두움·밝음) — 모두 20세트. 세트 안에서는 그림이 차분한지(색 세기 0.45 미만) 선명한지로 두 가지 중 하나를 고른다
   (컬러 블록 = 아래 면 색, 아치 프레임 = 선·제목 색) — 모두 40가지.
   처음(13세트)에는 세트 안 두 가지를 «강조색이 따뜻한지»로 골랐는데, 사람 사진은 피부·나무 바닥 때문에 주색이 주황이고 강조색은 거의
   늘 그 반대색(파랑)이라 갈리지 않았다 — 그림 10장 중 4장이 같은 색으로 나왔다. 글자 색은 면 색에 맞춰 대비를 계산해 정한다
   (test/palette.test.js가 40가지 전부의 대비와 서로 겹치지 않음을 본다). */
export type Rgb = [number, number, number];
const hex = (s: string): Rgb => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
export const FAMILIES = ['red', 'orange', 'green', 'teal', 'blue', 'purple'] as const;
export type Family = typeof FAMILIES[number] | 'neutral';
const CENTERS: Record<typeof FAMILIES[number], number> = { red: 0, orange: 38, green: 110, teal: 178, blue: 222, purple: 285 };
export function familyOf(c: ArtColors): Family {
  if (c.strength < 0.12) return 'neutral';
  let best: typeof FAMILIES[number] = 'red', dist = 999;
  for (const f of FAMILIES) { const d = Math.min(Math.abs(c.hue - CENTERS[f]), 360 - Math.abs(c.hue - CENTERS[f])); if (d < dist) { dist = d; best = f; } }
  return best;
}
/** 그림 밝기 3단계(상대 휘도 평균): 0.33 미만 어두움, 0.6 넘으면 밝음. 무채색은 0.45로 두 단계. */
export function brightnessOf(f: Family, t: ArtTone) {
  if (f === 'neutral') return t.lum < 0.45 ? 'dark' : 'light';
  return t.lum < 0.33 ? 'dark' : t.lum > 0.6 ? 'light' : 'mid';
}
/** 세트 안 두 가지: 0 = 차분한 그림(색 세기 0.45 미만), 1 = 선명한 그림. */
export const vividOf = (c: ArtColors) => (c.strength >= 0.45 ? 1 : 0);
export function setKey(c: ArtColors, t: ArtTone) { const f = familyOf(c); return `${f}-${brightnessOf(f, t)}`; }

/** 컬러 블록: 위 면(사진 둘레) · 아래 면 두 가지([차분한 그림, 선명한 그림]). */
export const COLOR_BLOCK_SETS: Record<string, { top: string; bottoms: [string, string] }> = {
  'red-dark': { top: '#7A1424', bottoms: ['#E9D8C4', '#F2B33D'] },
  'red-mid': { top: '#C93A30', bottoms: ['#1F2A3A', '#0F6E6A'] },
  'red-light': { top: '#F2A39A', bottoms: ['#3B2A2E', '#2E4BB8'] },
  'orange-dark': { top: '#9A4A1C', bottoms: ['#EFE2CB', '#1E5A8C'] },
  'orange-mid': { top: '#F08A24', bottoms: ['#2B2320', '#1F3FA0'] },
  'orange-light': { top: '#F7D08A', bottoms: ['#4A3B33', '#C8372D'] },
  'green-dark': { top: '#1F5A3A', bottoms: ['#E8DCC0', '#F2A0B4'] },
  'green-mid': { top: '#4E9A5A', bottoms: ['#262B22', '#F5D547'] },
  'green-light': { top: '#BFE0A8', bottoms: ['#3A3F2E', '#7B3FA0'] },
  'teal-dark': { top: '#0B5563', bottoms: ['#EAD9C6', '#F08A5D'] },
  'teal-mid': { top: '#2FA3A0', bottoms: ['#1E2B2E', '#5A2A6E'] },
  'teal-light': { top: '#A8DDD6', bottoms: ['#2F3B3D', '#D23A4E'] },
  'blue-dark': { top: '#1B2A80', bottoms: ['#E6DCCB', '#F25C54'] },
  'blue-mid': { top: '#3366CC', bottoms: ['#1C1F2B', '#FFD447'] },
  'blue-light': { top: '#9DB8F0', bottoms: ['#2A2F45', '#E8652A'] },
  'purple-dark': { top: '#4B1D6B', bottoms: ['#E8DFEA', '#F7B32B'] },
  'purple-mid': { top: '#8551C4', bottoms: ['#221B2B', '#9BE3A0'] },
  'purple-light': { top: '#D7C2F0', bottoms: ['#3A2E45', '#1A7A63'] },
  'neutral-dark': { top: '#2B2B2B', bottoms: ['#E9E2D3', '#C23A2B'] },
  'neutral-light': { top: '#E8E6E0', bottoms: ['#222222', '#2E4BB8'] },
};
const DARK_INK: Rgb = [28, 28, 28], WHITE: Rgb = [255, 255, 255];
/** 면 위 글자: 밝은 면이면 먹색, 어두운 면이면 흰색(대비가 더 큰 쪽). */
const onPlane = (plane: Rgb) => (contrast(plane, DARK_INK) >= contrast(plane, WHITE) ? DARK_INK : WHITE);
/** 면 위 작은 글: 같은 쪽 색을 조금 누그러뜨리되 4.5:1은 지킨다. */
const softOn = (plane: Rgb) => { const base = onPlane(plane); for (let k = 0.3; k >= 0; k -= 0.05) { const c = base.map((v, i) => Math.round(v + (plane[i] - v) * k)) as Rgb; if (contrast(c, plane) >= 4.5) return c; } return base; };

/** 아래 면 위 제목 색. 위 면 색(4.5:1) → 흰색/먹색 중 대비가 큰 쪽. 그 쪽이 먹색이면 먹색 대신(2026-10-18 Bumm님 «로봇 불꽃 · 음악 · SF의
 *  제목 글자 검정이 별로»): 위 면 색 → 흰색(제목은 64px 넘는 큰 글이라 WCAG 큰 글 기준 3:1) → 위 면 색을 같은 색조로 어둡게 한 것(4.5:1). */
function titleOn(top: Rgb, bottom: Rgb): Rgb {
  if (contrast(top, bottom) >= 4.5) return top;
  const plain = onPlane(bottom);
  if (plain !== DARK_INK) return plain;
  if (contrast(top, bottom) >= 3) return top;
  if (contrast(WHITE, bottom) >= 3) return WHITE;
  for (let k = 0.9; k > 0; k -= 0.05) { const d = top.map((v) => Math.round(v * k)) as Rgb; if (contrast(d, bottom) >= 4.5) return d; }
  return plain;
}
export function colorBlockSet(c: ArtColors, t: ArtTone) {
  const key = setKey(c, t), set = COLOR_BLOCK_SETS[key], variant = vividOf(c);
  const top = hex(set.top), bottom = hex(set.bottoms[variant]);
  return { key, variant, top, bottom, title: titleOn(top, bottom), credit: onPlane(bottom), soft: softOn(bottom), ink: onPlane(top) };
}

/** 아치 세트: 막(아주 깊은 색, 그림이 밝을수록 조금 덜 깊게) · 선·제목 두 가지([차분한 그림 = 은은한 색, 선명한 그림 = 밝은 색]).
 *  막은 같은 계열의 아주 깊은 색이라 그 위 제목 대비가 7:1을 넘는다. */
export const ARCH_SETS: Record<string, { veil: string; golds: [string, string] }> = {
  'red-dark': { veil: '#220709', golds: ['#E6BE6E', '#F6B8A8'] },
  'red-mid': { veil: '#3A0D14', golds: ['#D7B7A2', '#8ED8EC'] },
  'red-light': { veil: '#46141E', golds: ['#F7CFE0', '#F4E27A'] },
  'orange-dark': { veil: '#1C140C', golds: ['#F1E4C6', '#FFA27A'] },
  'orange-mid': { veil: '#361A09', golds: ['#DAA481', '#AEC8FF'] },
  'orange-light': { veil: '#422510', golds: ['#FFE9A0', '#FFB3C7'] },
  'green-dark': { veil: '#08180F', golds: ['#DAC881', '#EB8E8E'] },
  'green-mid': { veil: '#0E2C1D', golds: ['#B9DDA0', '#FFB3D1'] },
  'green-light': { veil: '#143524', golds: ['#DDF5C8', '#FFD86B'] },
  'teal-dark': { veil: '#051A1E', golds: ['#9FD6C8', '#FFAD99'] },
  'teal-mid': { veil: '#082C34', golds: ['#E5C99B', '#8EE6F0'] },
  'teal-light': { veil: '#0C353E', golds: ['#C4F2F2', '#FABDBD'] },
  'blue-dark': { veil: '#070D24', golds: ['#CCD2D8', '#FFD447'] },
  'blue-mid': { veil: '#0D1B42', golds: ['#B8CFF5', '#FFB46B'] },
  'blue-light': { veil: '#122452', golds: ['#DCE6FF', '#FFC7A0'] },
  'purple-dark': { veil: '#140822', golds: ['#E1DA98', '#F48FD0'] },
  'purple-mid': { veil: '#260F40', golds: ['#D8C7E8', '#9FF0D8'] },
  'purple-light': { veil: '#30164A', golds: ['#FABDF4', '#F3C968'] },
  'neutral-dark': { veil: '#171717', golds: ['#D9BFBF', '#F0AF4C'] },
  'neutral-light': { veil: '#242424', golds: ['#ECECEC', '#EBA18E'] },
};
export function archSet(c: ArtColors, t: ArtTone) {
  const key = setKey(c, t), set = ARCH_SETS[key], variant = vividOf(c);
  const veil = hex(set.veil), gold = hex(set.golds[variant]);
  const text = gold.map((v) => Math.round(v + (255 - v) * 0.55)) as Rgb;
  return { key, variant, veil, gold, text, soft: softOn(veil).map((v, i) => Math.round(v * 0.7 + gold[i] * 0.3)) as Rgb };
}

/* ───── 그림에서 화소 받기(틀이 쓰는 입구) ───── */
const cache = new WeakMap<object, ArtColors>();
/** 그림(HTMLImageElement·캔버스)의 색을 잰다. 캔버스가 없거나 읽을 수 없는 환경(테스트의 가짜 캔버스)에서는 기본값. */
export function artColors(art: CanvasImageSource & { width: number; height: number }): ArtColors {
  if (cache.has(art)) return cache.get(art)!;
  let out = DEFAULT;
  try {
    const cv = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    const cx = cv && typeof cv.getContext === 'function' ? cv.getContext('2d', { willReadFrequently: true } as CanvasRenderingContext2DSettings) : null;
    if (cv && cx && typeof cx.getImageData === 'function') {
      cv.width = 48; cv.height = 72;
      cx.drawImage(art, 0, 0, 48, 72);
      out = analyzePixels(cx.getImageData(0, 0, 48, 72).data);
    }
  } catch { out = DEFAULT; }
  cache.set(art, out);
  return out;
}

/* ───── 그림의 밝기·채도(트립틱 색 세기 조절용, 2026-10-14 Bumm님: «어두운 영화관 장면·사람 사진에선 세 칸 차이가 티가 안 난다») ───── */
export interface ArtTone { lum: number; sat: number }
const toneCache = new WeakMap<object, ArtTone>();
export function toneOfPixels(data: ArrayLike<number>): ArtTone {
  let L = 0, S = 0, n = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    L += 0.2126 * r + 0.7152 * g + 0.0722 * b; S += max ? (max - min) / max : 0; n++;
  }
  return n ? { lum: L / n, sat: S / n } : { lum: 0.4, sat: 0.4 };
}
export function artTone(art: CanvasImageSource & { width: number; height: number }): ArtTone {
  if (toneCache.has(art)) return toneCache.get(art)!;
  let out: ArtTone = { lum: 0.4, sat: 0.4 };
  try {
    const cv = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    const cx = cv && typeof cv.getContext === 'function' ? cv.getContext('2d', { willReadFrequently: true } as CanvasRenderingContext2DSettings) : null;
    if (cv && cx && typeof cx.getImageData === 'function') {
      cv.width = 48; cv.height = 72; cx.drawImage(art, 0, 0, 48, 72);
      out = toneOfPixels(cx.getImageData(0, 0, 48, 72).data);
    }
  } catch { /* 기본값 */ }
  toneCache.set(art, out);
  return out;
}
/** 트립틱 양쪽 칸 색 세기: 채도가 낮은 사진(사람)일수록 색을 더 입히고, 어두운 그림일수록 같은 색을 밝혀 덧칠해 차이가 보이게 한다. */
export function triptychGrade(t: ArtTone) {
  const color = Math.max(0.78, Math.min(0.96, 0.78 + (0.5 - t.sat) * 0.5));
  const lift = Math.max(0, Math.min(0.42, (0.3 - t.lum) * 1.6));
  const deep = t.lum > 0.3 ? 0.22 : 0;
  return { color, lift, deep };
}
