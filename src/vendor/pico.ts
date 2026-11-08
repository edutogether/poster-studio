/* pico.js 얼굴 찾기 — 설치판(desktopCrop.ts)만 불러온다. 웹 번들에는 들어가지 않는다.
   원본: https://github.com/nenadmarkus/picojs (pico.js, 커밋 afffa50ec4134a47005f2cbf8112eaa69f65f37e) — «released under the MIT license».
   학습 파일 facefinder.bin: https://github.com/nenadmarkus/pico (rnt/cascades/facefinder, 커밋 7d550c78b2c31a4e1dfc5bcdfe9da013297b5cc8),
   MIT License, Copyright (c) 2013 Nenad Markus — 전문은 같은 폴더 LICENSE-pico.txt.
   원본의 unpack_cascade · run_cascade · cluster_detections를 동작 그대로 타입만 붙여 옮겼다(쓰지 않는 instantiate_detection_memory는 뺐다). */

/** 찾은 자리: [행(세로 가운데), 열(가로 가운데), 크기(정사각형 한 변), 점수] — 회색조 그림의 화소 단위. */
export type Detection = [number, number, number, number];
export type ClassifyRegion = (r: number, c: number, s: number, pixels: Uint8Array, ldim: number) => number;
export interface GrayImage { pixels: Uint8Array; nrows: number; ncols: number; ldim: number }
export interface CascadeParams { shiftfactor: number; minsize: number; maxsize: number; scalefactor: number }

export function unpackCascade(bytes: Int8Array): ClassifyRegion {
  const dview = new DataView(new ArrayBuffer(4));
  const int32 = (p: number) => { for (let i = 0; i < 4; i++) dview.setUint8(i, bytes[p + i]); return dview.getInt32(0, true); };
  const float32 = (p: number) => { for (let i = 0; i < 4; i++) dview.setUint8(i, bytes[p + i]); return dview.getFloat32(0, true); };
  // 앞 8바이트(판 번호 · 학습용 값)는 건너뛰고, 나무 깊이 · 나무 수를 읽는다.
  let p = 8;
  const tdepth = int32(p); p += 4;
  const ntrees = int32(p); p += 4;
  const tcodesLs: number[] = [], tpredsLs: number[] = [], threshLs: number[] = [];
  const leaves = Math.pow(2, tdepth);
  for (let t = 0; t < ntrees; ++t) {
    tcodesLs.push(0, 0, 0, 0);
    for (let i = p; i < p + 4 * leaves - 4; i++) tcodesLs.push(bytes[i]);
    p += 4 * leaves - 4;
    for (let i = 0; i < leaves; ++i) { tpredsLs.push(float32(p)); p += 4; }
    threshLs.push(float32(p)); p += 4;
  }
  const tcodes = new Int8Array(tcodesLs), tpreds = new Float32Array(tpredsLs), thresh = new Float32Array(threshLs);
  const pow2tdepth = leaves >> 0;
  return (r0, c0, s, pixels, ldim) => {
    const r = 256 * r0, c = 256 * c0;
    let root = 0, o = 0.0;
    for (let i = 0; i < ntrees; ++i) {
      let idx = 1;
      for (let j = 0; j < tdepth; ++j)
        idx = 2 * idx + Number(pixels[((r + tcodes[root + 4 * idx + 0] * s) >> 8) * ldim + ((c + tcodes[root + 4 * idx + 1] * s) >> 8)]
          <= pixels[((r + tcodes[root + 4 * idx + 2] * s) >> 8) * ldim + ((c + tcodes[root + 4 * idx + 3] * s) >> 8)]);
      o = o + tpreds[pow2tdepth * i + idx - pow2tdepth];
      if (o <= thresh[i]) return -1;
      root += 4 * pow2tdepth;
    }
    return o - thresh[ntrees - 1];
  };
}

export function runCascade(image: GrayImage, classify: ClassifyRegion, params: CascadeParams): Detection[] {
  const { pixels, nrows, ncols, ldim } = image;
  const detections: Detection[] = [];
  let scale = params.minsize;
  while (scale <= params.maxsize) {
    const step = Math.max(params.shiftfactor * scale, 1) >> 0;
    const offset = (scale / 2 + 1) >> 0;
    for (let r = offset; r <= nrows - offset; r += step)
      for (let c = offset; c <= ncols - offset; c += step) {
        const q = classify(r, c, scale, pixels, ldim);
        if (q > 0.0) detections.push([r, c, scale, q]);
      }
    scale = scale * params.scalefactor;
  }
  return detections;
}

export function clusterDetections(input: Detection[], iouthreshold: number): Detection[] {
  const dets = [...input].sort((a, b) => b[3] - a[3]);
  const iou = (d1: Detection, d2: Detection) => {
    const [r1, c1, s1] = d1, [r2, c2, s2] = d2;
    const overr = Math.max(0, Math.min(r1 + s1 / 2, r2 + s2 / 2) - Math.max(r1 - s1 / 2, r2 - s2 / 2));
    const overc = Math.max(0, Math.min(c1 + s1 / 2, c2 + s2 / 2) - Math.max(c1 - s1 / 2, c2 - s2 / 2));
    return (overr * overc) / (s1 * s1 + s2 * s2 - overr * overc);
  };
  const assigned = new Array<boolean>(dets.length).fill(false);
  const clusters: Detection[] = [];
  for (let i = 0; i < dets.length; ++i) {
    if (assigned[i]) continue;
    let r = 0, c = 0, s = 0, q = 0, n = 0;
    for (let j = i; j < dets.length; ++j)
      if (iou(dets[i], dets[j]) > iouthreshold) {
        assigned[j] = true;
        r += dets[j][0]; c += dets[j][1]; s += dets[j][2]; q += dets[j][3]; n += 1;
      }
    clusters.push([r / n, c / n, s / n, q]);
  }
  return clusters;
}
