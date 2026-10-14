// 그림에서 뽑은 색(src/palette.ts) — 주색을 맞게 찾는지, 그리고 «어떤 그림이 와도» 위아래 색·글자 대비가 무너지지 않는지.
// 대비는 사람이 그림마다 보고 고칠 수 없으므로(아이마다 그림이 다르다) 수치로 고정한다(2026-10-14 Bumm님 질문).
import { test, expect } from 'vitest';
import { analyzePixels, colorBlockColors, archColors, contrast, hsl } from '../src/palette.ts';

function pixels(colors) {
  // colors: [[r,g,b,개수], ...] → RGBA 배열
  const out = [];
  for (const [r, g, b, n] of colors) for (let i = 0; i < n; i++) out.push(r, g, b, 255);
  return new Uint8ClampedArray(out);
}

test('주색: 초록이 대부분인 그림에서 초록 색상을 찾는다', () => {
  const a = analyzePixels(pixels([[40, 140, 60, 800], [230, 190, 60, 100], [20, 20, 20, 300]]));
  expect(a.hue).toBeGreaterThan(110);
  expect(a.hue).toBeLessThan(150);
});

test('강조색: 주색과 60° 넘게 떨어진 밝은 색(노랑)을 찾는다', () => {
  const a = analyzePixels(pixels([[40, 140, 60, 800], [240, 200, 60, 200]]));
  expect(Math.min(Math.abs(a.accentHue - 45), 360 - Math.abs(a.accentHue - 45))).toBeLessThan(15);
});

test('회색뿐인 그림은 기본값(색 세기 0)으로 간다', () => {
  const a = analyzePixels(pixels([[128, 128, 128, 500], [10, 10, 10, 500]]));
  expect(a.strength).toBe(0);
});

// 색상 360°를 10°마다 돌려 «어떤 주색이 와도» 대비 기준을 지키는지 본다.
for (let h = 0; h < 360; h += 10) {
  test(`컬러 블록: 주색 ${h}°에서도 아래 면 위 큰 제목 대비 4.5:1 이상, 위 면 위 글자 7:1 이상`, () => {
    const c = colorBlockColors({ hue: h, accentHue: (h + 120) % 360, strength: 1 });
    expect(contrast(c.onBottom, c.bottom)).toBeGreaterThanOrEqual(4.5);
    expect(contrast([255, 255, 255], c.bottom)).toBeGreaterThanOrEqual(7);
    expect(contrast(c.ink, c.top)).toBeGreaterThanOrEqual(7);
    expect(contrast(c.onBottomSoft, c.bottom)).toBeGreaterThanOrEqual(4.5);
  });
  test(`아치 프레임: 주색 ${h}°에서도 막 위 금빛 제목 7:1 이상, 작은 글 4.5:1 이상`, () => {
    const c = archColors({ hue: h, accentHue: (h + 150) % 360, strength: 1 });
    expect(contrast(c.gold, c.veil)).toBeGreaterThanOrEqual(7);
    expect(contrast(c.text, c.veil)).toBeGreaterThanOrEqual(4.5);
  });
}

test('hsl: 기본 색 변환이 맞다', () => {
  expect(hsl(0, 1, 0.5)).toEqual([255, 0, 0]);
  expect(hsl(120, 1, 0.5)).toEqual([0, 255, 0]);
  expect(hsl(240, 1, 0.5)).toEqual([0, 0, 255]);
});
