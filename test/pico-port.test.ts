/* 설치판 얼굴 찾기(pico 옮긴 것 — src/vendor/pico.ts)와 자르기 실패 길 — 11/8 종합감사 D4.
   - 옮긴 코드가 원래 학습 파일(facefinder.bin)로 실제 사진의 얼굴을 찾는지: 설치판 예시 사진 solo-end(1920×1080)를 그림판(@napi-rs/canvas)으로 풀어
     desktopCrop.ts와 같은 조건(긴 변 960 · 같은 회색 변환 · 같은 찾기 값 · 0도)으로 돌린다. 기준 얼굴은 11/8 창 없는 크롬 실측(desktop-crop.test.ts와 같은 값).
   - 무늬 없는 회색에서는 얼굴을 찾지 않는다(빈 판정이 아니다).
   - cropForPoster는 무엇이 실패해도 받은 주소를 그대로 돌려준다(설치판 포스터가 멈추지 않는다). */
import { describe, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { clusterDetections, runCascade, unpackCascade } from '../src/vendor/pico.js';

const classify = unpackCascade(new Int8Array(readFileSync(new URL('../src/vendor/facefinder.bin', import.meta.url))));

function detect(pixels: Uint8Array, w: number, h: number) {
  return clusterDetections(runCascade({ pixels, nrows: h, ncols: w, ldim: w }, classify, {
    shiftfactor: 0.1, minsize: Math.max(20, Math.round(Math.min(w, h) * 0.06)), maxsize: Math.min(w, h), scalefactor: 1.1,
  }), 0.2);
}

describe('pico 옮긴 것 — 원래 학습 파일로 실제 사진', () => {
  test('solo-end(1920×1080)에서 가장 뚜렷한 얼굴이 기준 얼굴(954, 227 · 한 변 214) 자리에 있다', async () => {
    const img = await loadImage(readFileSync(new URL('../public/studio/camera-v1/solo-end.webp', import.meta.url)));
    expect([img.width, img.height]).toEqual([1920, 1080]);
    const k = 960 / 1920, w = 960, h = 540;
    const cv = createCanvas(w, h);
    const ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    const gray = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) gray[i] = (2 * d[4 * i] + 7 * d[4 * i + 1] + d[4 * i + 2]) / 10;
    const dets = detect(gray, w, h);
    expect(dets.length).toBeGreaterThan(0);
    const [r, c, s, q] = dets.reduce((a, b) => (b[3] * b[2] > a[3] * a[2] ? b : a));
    expect(q).toBeGreaterThanOrEqual(10);   // 혼자 문턱(MIN_SCORE.solo)을 넘는다
    expect(Math.hypot(c / k - 954, r / k - 227)).toBeLessThan(0.25 * 214);
    expect(s / k / 214).toBeGreaterThan(0.75);
    expect(s / k / 214).toBeLessThan(1.33);
  });

  test('무늬 없는 회색 그림에서는 얼굴을 하나도 찾지 않는다', () => {
    expect(detect(new Uint8Array(960 * 540).fill(128), 960, 540)).toEqual([]);
  });
});

describe('cropForPoster 실패 길 — 받은 주소 그대로', () => {
  test('그림을 풀지 못하면(decode 실패) 받은 주소를 그대로 돌려주고 기록만 남긴다', async () => {
    const decode = vi.fn().mockRejectedValue(new Error('풀 수 없음'));
    vi.stubGlobal('Image', class { src = ''; decode = decode; });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { cropForPoster } = await import('../src/desktopCrop.js');
      await expect(cropForPoster('blob:photo-1', 'solo')).resolves.toBe('blob:photo-1');
      expect(decode).toHaveBeenCalledTimes(1);
      expect(err).toHaveBeenCalledWith('[desktop-crop]', expect.any(Error));
    } finally {
      vi.unstubAllGlobals();
      err.mockRestore();
    }
  });
});
