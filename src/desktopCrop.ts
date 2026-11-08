/* ───── 설치판 사진 자르기(2026-11-08 Bumm님 «고침», 팀장 전달 — _docs/intents/2026-11-08-desktop-photo-crop) ─────
   설치판은 AI가 없어 가로 카메라 사진(4:3 · 16:9)을 그대로 8종에 넣었다. 틀의 배치(templates.ts placeArt)는 AI 그림의 약속(세로 2:3,
   주인공은 위 2/3, 머리 위 여백)을 가정하므로, 가로 사진은 칸을 못 덮어 위아래가 흐린 «배경 연장»으로 찼다(4:3 혼자 8종 중 5종 · 단체 6종).
   그래서 넣기 전에 사진에서 얼굴을 찾아 사람 둘레를 세로 2:3으로 자른다 — 틀 · 배치 코드는 그대로다.
   - 혼자: 가장 뚜렷한 얼굴(점수 × 크기)을 가운데에, 머리 위는 그림 높이의 6%만 남기고 아래(몸)는 사진 끝까지. 늘 세로 2:3이다.
   - 단체: 찾은 얼굴 모두와 양옆 어깨 몫. 그 폭이 2:3보다 넓으면 2:3을 포기하고 그 폭 그대로(사람을 자르지 않는다).
   - 얼굴을 못 찾으면 혼자는 가운데 기준 2:3, 단체는 자르지 않는다(지금과 같다). 무엇이든 실패하면 원래 사진을 그대로 쓴다.
   잘못 찾은 얼굴(배경 포스터 등)은 단체의 폭을 넓힐 뿐 좁히지 않는다 — 틀리면 덜 자르는 쪽이다.
   이 모듈은 설치판에서만 동적으로 불러온다(PosterStudio.tsx) — 웹 번들 · dist에는 들어가지 않는다. 사진은 기기 밖으로 나가지 않는다. */
import { clusterDetections, runCascade, unpackCascade, type ClassifyRegion } from './vendor/pico.js';
import cascadeURL from './vendor/facefinder.bin?url';

/** 찾은 얼굴 — 원래 사진 화소 기준, 가운데(x, y)와 정사각형 한 변(size), 점수(score). */
export interface Face { x: number; y: number; size: number; score: number }
export interface Crop { x: number; y: number; w: number; h: number }

const PORTRAIT = 2 / 3;          // 세로 2:3(AI 그림 1024×1536과 같은 모양)
const DETECT_MAX_SIDE = 960;     // 얼굴 찾기는 긴 변 960으로 줄여서(1920 사진에서 약 0.6초)
const ANGLES = [-30, -15, 0, 15, 30];   // 고개를 기울인 얼굴(단체 사진)을 놓치지 않게 돌려서도 찾는다
// 이보다 낮은 점수는 버린다(11/8 예시 사진: 진짜 얼굴 10~143, 바닥 · 배경 대부분 3~13). 단체는 낮게 — 끝 사람을 놓치면 그 사람이 잘리고,
// 잘못 잡은 것은 폭을 넓힐 뿐이다(group-end 왼쪽 끝 얼굴이 10 언저리였다). 혼자는 가장 뚜렷한 하나만 쓰므로 문턱이 결과를 거의 바꾸지 않는다.
const MIN_SCORE = { solo: 10, group: 5 };
const MAX_FACE_Y = 0.75;         // 사진 아래 1/4의 «얼굴»은 버린다(옷 무늬 · 바닥)
const SIZE_BAND = [0.5, 2];      // 단체: 가장 뚜렷한 얼굴 크기의 0.5~2배만(멀리 걸린 포스터 속 얼굴 등을 뺀다)
const SIDE = { solo: 1.4, group: 1.2 };   // 얼굴 가운데에서 양옆으로 담을 폭(얼굴 크기 배) — 어깨 몫
const HEAD_ABOVE = 0.8;          // 얼굴 상자 가운데에서 머리 꼭대기까지(얼굴 크기 배)
const HEAD_ROOM = 0.06;          // 머리 위 여백(자른 그림 높이 대비)
const MIN_FACE_RATIO = 5;        // 자른 높이는 얼굴 크기의 5배 이상 — 너무 당겨 얼굴만 크게 나오지 않게
const MIN_HEIGHT = 0.5;          // 자른 높이는 사진 높이의 절반 이상

/** 찾은 얼굴 가운데 쓸 것만 고른다 — 혼자는 가장 뚜렷한 하나, 단체는 그와 비슷한 크기의 얼굴 모두. */
export function pickFaces(faces: Face[], h: number, mode: string): Face[] {
  const min = mode === 'group' ? MIN_SCORE.group : MIN_SCORE.solo;
  const ok = faces.filter((f) => f.score >= min && f.y <= MAX_FACE_Y * h);
  if (!ok.length) return [];
  const ref = ok.reduce((a, b) => (b.score * b.size > a.score * a.size ? b : a));
  if (mode !== 'group') return [ref];
  return ok.filter((f) => f.size >= SIZE_BAND[0] * ref.size && f.size <= SIZE_BAND[1] * ref.size);
}

/** 사진(w×h)에서 잘라 쓸 자리. null이면 자르지 않는다(원래 사진 그대로). */
export function cropRect(w: number, h: number, faces: Face[], mode: string): Crop | null {
  let x: number, y: number, W: number, H: number;
  if (!faces.length) {
    if (mode === 'group') return null;
    W = Math.min(w, h * PORTRAIT);
    H = Math.min(h, W / PORTRAIT);
    x = (w - W) / 2;
    y = 0;
  } else {
    const side = mode === 'group' ? SIDE.group : SIDE.solo;
    const x0 = Math.max(0, Math.min(...faces.map((f) => f.x - side * f.size)));
    const x1 = Math.min(w, Math.max(...faces.map((f) => f.x + side * f.size)));
    const headTop = Math.max(0, Math.min(...faces.map((f) => f.y - HEAD_ABOVE * f.size)));
    const ref = Math.max(...faces.map((f) => f.size));
    const minH = Math.min(h, Math.max(MIN_HEIGHT * h, MIN_FACE_RATIO * ref));
    // 머리 위 6%를 남기고 아래는 사진 끝까지 두는 높이 — 그 높이의 2:3 폭에 사람이 다 안 들어오면 높이를 늘리고, 그래도 넘치면 폭을 넓힌다.
    const fitHead = Math.min(h, Math.max(minH, (h - headTop) / (1 - HEAD_ROOM)));
    const span = x1 - x0;
    H = Math.max(fitHead, Math.min(h, span / PORTRAIT));
    // 혼자는 늘 세로 2:3 — 가까이 선 얼굴(어깨가 2:3 폭보다 넓음)은 얼굴 · 머리를 가운데 두고 어깨 끝만 칸 밖으로 둔다(초상 사진 모양).
    W = mode === 'group' ? Math.min(w, Math.max(H * PORTRAIT, span)) : Math.min(w, H * PORTRAIT);
    if (H * PORTRAIT > w) { W = w; H = Math.min(h, w / PORTRAIT); }
    x = Math.min(w - W, Math.max(0, (x0 + x1) / 2 - W / 2));
    y = Math.min(h - H, Math.max(0, Math.min(headTop - HEAD_ROOM * H, h - H)));
  }
  const r = { x: Math.round(x), y: Math.round(y), w: Math.round(W), h: Math.round(H) };
  r.w = Math.min(r.w, w - r.x);
  r.h = Math.min(r.h, h - r.y);
  return r.w >= w - 1 && r.h >= h - 1 ? null : r;
}

/** 그림에서 얼굴을 찾는다(pico — 긴 변 960, 다섯 각도). 돌려서 찾은 자리는 원래 사진 좌표로 되돌리고, 겹치는 것은 하나로 합친다. */
export function detectFaces(img: CanvasImageSource, W: number, H: number, classify: ClassifyRegion): Face[] {
  const k = Math.min(1, DETECT_MAX_SIDE / Math.max(W, H)), w = Math.round(W * k), h = Math.round(H * k);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  const gray = new Uint8Array(w * h), found: Face[] = [];
  for (const deg of ANGLES) {
    const a = (deg * Math.PI) / 180;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, w, h);
    ctx.translate(w / 2, h / 2);
    ctx.rotate(a);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    for (let i = 0; i < w * h; i++) gray[i] = (2 * d[4 * i] + 7 * d[4 * i + 1] + d[4 * i + 2]) / 10;
    const dets = clusterDetections(runCascade({ pixels: gray, nrows: h, ncols: w, ldim: w }, classify, {
      shiftfactor: 0.1, minsize: Math.max(20, Math.round(Math.min(w, h) * 0.06)), maxsize: Math.min(w, h), scalefactor: 1.1,
    }), 0.2);
    const ca = Math.cos(-a), sa = Math.sin(-a);
    for (const [r0, c0, s, q] of dets) {
      const dx = c0 - w / 2, dy = r0 - h / 2;
      found.push({ x: (dx * ca - dy * sa + w / 2) / k, y: (dx * sa + dy * ca + h / 2) / k, size: s / k, score: q });
    }
  }
  return mergeFaces(found);
}

/** 여러 각도에서 같은 얼굴을 찾은 것을 하나로 — 점수 높은 것부터, 가운데가 상자 반 안에 드는 것은 같은 얼굴(점수는 가장 높은 것). */
export function mergeFaces(found: Face[]): Face[] {
  const keep: Face[] = [];
  for (const f of [...found].sort((a, b) => b.score - a.score)) {
    if (!keep.some((e) => Math.hypot(e.x - f.x, e.y - f.y) < 0.5 * Math.max(e.size, f.size))) keep.push(f);
  }
  return keep;
}

let cascade: Promise<ClassifyRegion> | null = null;
const loadCascade = () =>
  (cascade ??= fetch(cascadeURL)
    .then((res) => { if (!res.ok) throw new Error(`facefinder ${res.status}`); return res.arrayBuffer(); })
    .then((buf) => unpackCascade(new Int8Array(buf)))
    .catch((e: unknown) => { cascade = null; throw e; }));

/** 포스터에 넣을 그림 주소 — 잘랐으면 무손실 PNG data: 주소(놓을 것이 없어 하루 내내 써도 쌓이지 않는다), 아니면 받은 주소 그대로. */
export async function cropForPoster(url: string, mode: string): Promise<string> {
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = img.naturalWidth, h = img.naturalHeight;
    let faces: Face[] = [];
    try { faces = pickFaces(detectFaces(img, w, h, await loadCascade()), h, mode); }
    catch (e) { console.error('[desktop-crop] face detection', e); }
    const r = cropRect(w, h, faces, mode);
    if (!r) return url;
    const cv = document.createElement('canvas');
    cv.width = r.w; cv.height = r.h;
    const ctx = cv.getContext('2d');
    if (!ctx) return url;
    ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    return cv.toDataURL('image/png');
  } catch (e) {
    console.error('[desktop-crop]', e);
    return url;
  }
}
