/* ────────────────────────────────────────────────────────────────────
   포스터 색을 그림에서 뽑는다(2026-10-14 Bumm님: «포스터마다 색이 그 그림에 어울리게 바뀌나 ? 위아래 색이 알맞게
   대비되게 바뀌나 ?» — 그 전까지 컬러 블록은 노랑·파랑, 아치 프레임은 초록으로 어떤 그림에나 같았다).

   1. 그림을 48×72로 줄여 색상(hue) 분포를 잰다 — 채도·밝기가 있는 화소만 센다(회색·검정·흰색은 색을 말해 주지 않는다).
   2. 가장 많은 색상 = 주색, 주색에서 60° 넘게 떨어진 색 중 가장 밝고 진한 것 = 강조색(없으면 주색의 보색).
   3. 쓰는 쪽(틀)은 색상만 받고, 밝기는 «상대 휘도(WCAG)»를 목표값에 맞춰 정한다 — 노랑과 파랑은 같은 L이라도 밝기가
      전혀 달라서, L을 고정하면 어떤 그림에서는 대비가 무너진다. 그래서 대비는 수치로 보장한다(test/palette.test.js).
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
export function hsl(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
export function luminance([r, g, b]: [number, number, number]) {
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contrast(a: [number, number, number], b: [number, number, number]) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/** 색상 h·채도 s를 지키고 상대 휘도가 target에 가장 가까운 색(L을 이분 탐색). */
export function tone(h: number, s: number, target: number): [number, number, number] {
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (luminance(hsl(h, s, mid)) < target) lo = mid; else hi = mid; }
  return hsl(h, s, (lo + hi) / 2);
}
export const css = ([r, g, b]: [number, number, number], a = 1) => a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;

/* ───── 틀별 색 짝 ───── */
/** 컬러 블록: 위 = 그림의 주색(진하게 — 파스텔이 되지 않게 휘도 0.36), 아래 = 주색의 보색(깊되 색이 남게). 위 색이 아래 면 위 제목
 *  색이 되므로 둘의 대비를 4.5:1 이상으로 맞춘다 — 제목은 96px 넘는 큰 글자라(큰 글자 기준 3:1) 4.5:1이면 넉넉하고,
 *  7:1까지 올리면 아래 면이 거의 검정이 되어 «두 색 면»이 사라졌다(2026-10-14 렌더로 확인). */
export function colorBlockColors(a: ArtColors) {
  const top = tone(a.hue, 0.86, 0.36);
  let bottomLum = 0.07, bottom = tone((a.hue + 180) % 360, 0.72, bottomLum);
  while (contrast(top, bottom) < 4.5 && bottomLum > 0.01) { bottomLum -= 0.004; bottom = tone((a.hue + 180) % 360, 0.72, bottomLum); }
  return { top, bottom, onBottom: top, onBottomSoft: tone((a.hue + 180) % 360, 0.25, 0.72), ink: tone(a.hue, 0.5, 0.004) };
}
/** 아치 프레임: 막 = 주색을 아주 깊게, 선·제목 = 같은 주색을 밝고 부드럽게(한 색 계열 — 막과 글자가 한 집안 색).
 *  막 위 제목 대비 7:1 이상, 작은 글 4.5:1 이상. */
export function archColors(a: ArtColors) {
  const veil = tone(a.hue, 0.42, 0.014);
  let lum = 0.55, gold = tone(a.hue, 0.5, lum);
  while (contrast(gold, veil) < 7 && lum < 0.9) { lum += 0.03; gold = tone(a.hue, 0.5, lum); }
  return { veil, gold, text: tone(a.hue, 0.18, 0.7), soft: tone(a.hue, 0.28, 0.45) };
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
