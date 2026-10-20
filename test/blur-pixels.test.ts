// 아이폰 사파리용 흐림(캔버스 필터를 못 그리는 브라우저 — src/templates.ts drawBlurred)의 화소 계산(2026-10-20 저녁 Bumm님 «휴대폰에서 아치프레임 바깥 블러가 안 보임»).
// 실제 화면 확인은 scripts/verify/poster-blur-probe.mjs --no-filter(헤드리스 크롬에서 캔버스 필터를 지우고 8장을 그려 PC와 대조).
import { expect, test } from 'vitest';
import { blurPixels } from '../src/templates.js';

const image = (w: number, h: number, fill: (x: number, y: number) => [number, number, number, number]) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(fill(x, y), (y * w + x) * 4);
  return { width: w, height: h, data, colorSpace: 'srgb' } as ImageData;
};
const at = (id: ImageData, x: number, y: number) => Array.from(id.data.slice((y * id.width + x) * 4, (y * id.width + x) * 4 + 4));

test('투명 바탕의 흰 네모(3×3)는 둘레로 번지고(가우스), 번진 곳이 검게 물들지 않는다(투명도를 곱한 채로 흐림)', () => {
  const id = image(31, 31, (x, y) => (Math.abs(x - 15) <= 1 && Math.abs(y - 15) <= 1 ? [255, 255, 255, 255] : [0, 0, 0, 0]));
  blurPixels(id, 3);
  expect(at(id, 15, 15)[3]).toBeLessThan(255);
  expect(at(id, 19, 15)[3]).toBeGreaterThan(0);
  expect(at(id, 15, 19)[3]).toBe(at(id, 19, 15)[3]);   // 가로 · 세로 같게
  expect(at(id, 15, 15)[3]).toBeGreaterThan(at(id, 19, 15)[3]);   // 가운데가 가장 진하다
  let mass = 0;
  for (let i = 0; i < id.data.length; i += 4) {
    if (id.data[i + 3] === 0) continue;
    mass += id.data[i + 3];
    expect(id.data[i]).toBeGreaterThanOrEqual(254);   // 흰 점이 번진 곳은 여전히 흰색 — 검은 테두리가 없다
  }
  expect(Math.abs(mass - 9 * 255) / (9 * 255)).toBeLessThan(0.03);   // 번져도 양은 그대로(3% 안 — 화소마다 정수로 반올림)
});

test('고른 색은 흐려도 그대로이고(가장자리 포함), saturate 1.1은 회색은 두고 색은 조금 진하게', () => {
  const flat = image(12, 9, () => [120, 60, 30, 255]);
  blurPixels(flat, 4);
  for (let i = 0; i < flat.data.length; i += 4) expect(Array.from(flat.data.slice(i, i + 4))).toEqual([120, 60, 30, 255]);
  const gray = image(4, 4, () => [100, 100, 100, 255]);
  blurPixels(gray, 1, 1.1);
  expect(at(gray, 1, 1)).toEqual([100, 100, 100, 255]);
  const color = image(4, 4, () => [180, 90, 60, 255]);
  blurPixels(color, 1, 1.1);
  const [r, g] = at(color, 1, 1);
  expect(r - g).toBeGreaterThan(90);
});
