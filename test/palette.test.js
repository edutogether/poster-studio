// 그림에서 뽑은 색(src/palette.ts) — 주색을 맞게 찾는지, 정해 둔 색 세트를 맞게 고르는지, 그리고 «어떤 세트가 골라져도»
// 면 색·글자 대비가 무너지지 않고 세트끼리 서로 다른지.
// 대비는 사람이 그림마다 보고 고칠 수 없으므로(아이마다 그림이 다르다) 수치로 고정한다(2026-10-14 Bumm님 질문),
// 세트끼리 다른지도 수치로 고정한다(2026-10-17 Bumm님: «색 세트가 적어도 10개 · 비슷하거나 중복인 세트가 너무 많음»).
import { test, expect } from 'vitest';
import { analyzePixels, contrast, familyOf, setKey, vividOf, COLOR_BLOCK_SETS, ARCH_SETS, colorBlockSet, archSet } from '../src/palette.ts';

function pixels(colors) {
  // colors: [[r,g,b,개수], ...] → RGBA 배열
  const out = [];
  for (const [r, g, b, n] of colors) for (let i = 0; i < n; i++) out.push(r, g, b, 255);
  return new Uint8ClampedArray(out);
}
const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
// 세트 이름(계열-밝기)과 두 가지 중 하나(0 차분 · 1 선명)가 골라지는 그림 값
const HUE = { red: 0, orange: 38, green: 110, teal: 178, blue: 222, purple: 285, neutral: 0 };
const LUM = { dark: 0.2, mid: 0.45, light: 0.7 };
const inputs = (key, variant) => {
  const [fam, b] = key.split('-');
  return [{ hue: HUE[fam], accentHue: 0, strength: fam === 'neutral' ? 0 : variant ? 0.8 : 0.3 }, { lum: fam === 'neutral' ? (b === 'dark' ? 0.2 : 0.6) : LUM[b], sat: 0.3 }];
};
// 무채색 세트는 색 세기가 0.12 미만인 그림이라 «선명한 그림»(1)이 될 수 없다 — 쓰이지 않는 칸은 검사에서 뺀다.
const combos = Object.keys(COLOR_BLOCK_SETS).flatMap((key) => (key.startsWith('neutral') ? [[key, 0]] : [[key, 0], [key, 1]]));

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

test('세트 고르기: 주색 계열 × 그림 밝기 3단계(무채색은 2단계), 세트 안에서는 색 세기로 차분/선명', () => {
  expect(familyOf({ hue: 350, accentHue: 0, strength: 1 })).toBe('red');
  expect(familyOf({ hue: 45, accentHue: 0, strength: 1 })).toBe('orange');
  expect(familyOf({ hue: 215, accentHue: 0, strength: 1 })).toBe('blue');
  expect(familyOf({ hue: 215, accentHue: 0, strength: 0.05 })).toBe('neutral');
  const green = { hue: 120, accentHue: 30, strength: 1 };
  expect(setKey(green, { lum: 0.2, sat: 0.3 })).toBe('green-dark');
  expect(setKey(green, { lum: 0.45, sat: 0.3 })).toBe('green-mid');
  expect(setKey(green, { lum: 0.7, sat: 0.3 })).toBe('green-light');
  expect(setKey({ hue: 0, accentHue: 0, strength: 0 }, { lum: 0.5, sat: 0 })).toBe('neutral-light');
  expect(vividOf({ hue: 0, accentHue: 0, strength: 0.3 })).toBe(0);
  expect(vividOf({ hue: 0, accentHue: 0, strength: 0.6 })).toBe(1);
  // 실제 문제였던 경우: 주색이 같은 주황인 사람 사진 넷(로비·단체·피아노·그림, 2026-10-17 렌더)이 서로 다른 색으로 간다
  const people = [[0.67, 0.51], [0.28, 0.52], [0.24, 0.67], [0.82, 0.73]].map(([strength, lum]) => {
    const k = colorBlockSet({ hue: 25, accentHue: 220, strength }, { lum, sat: 0.2 });
    return `${k.key}/${k.variant}`;
  });
  expect(new Set(people).size).toBe(4);
});

test('세트 수: 20세트 × 차분/선명 = 40가지(무채색은 한 가지씩 — 실제로 쓰이는 것은 38가지), 10가지 이상', () => {
  expect(Object.keys(COLOR_BLOCK_SETS).length).toBe(20);
  expect(Object.keys(ARCH_SETS).sort()).toEqual(Object.keys(COLOR_BLOCK_SETS).sort());
  expect(combos.length).toBeGreaterThanOrEqual(10);
});

test('세트끼리 겹치지 않는다: 컬러 블록 위 면 색끼리 RGB 거리 40 이상, 아치 (막, 선·제목) 조합끼리 40 이상', () => {
  const tops = Object.entries(COLOR_BLOCK_SETS);
  for (let i = 0; i < tops.length; i++) for (let j = i + 1; j < tops.length; j++) {
    expect(dist(hex(tops[i][1].top), hex(tops[j][1].top)), `${tops[i][0]} ↔ ${tops[j][0]}`).toBeGreaterThanOrEqual(40);
  }
  // 같은 위 면 안에서 아래 면 두 가지도 뚜렷이 다르다
  for (const [key, s] of tops) expect(dist(hex(s.bottoms[0]), hex(s.bottoms[1])), key).toBeGreaterThanOrEqual(48);
  // 아치: 막과 선·제목을 함께 본 거리(6차원) — 막이 비슷한 «어두운 그림» 세트끼리는 선·제목 색이 달라야 한다
  const arch = combos.map(([key, v]) => [`${key}/${v}`, hex(ARCH_SETS[key].veil), hex(ARCH_SETS[key].golds[v])]);
  for (let i = 0; i < arch.length; i++) for (let j = i + 1; j < arch.length; j++) {
    const d = Math.hypot(dist(arch[i][1], arch[j][1]), dist(arch[i][2], arch[j][2]));
    expect(d, `${arch[i][0]} ↔ ${arch[j][0]}`).toBeGreaterThanOrEqual(40);
  }
});

for (const [key, variant] of combos) {
  const name = `${key}/${variant ? '선명' : '차분'}`;
  test(`컬러 블록 ${name}: 아래 면 위 제목·크레딧·작은 글, 위 면 위 세로 문구 모두 4.5:1 이상`, () => {
    const k = colorBlockSet(...inputs(key, variant));
    expect([k.key, k.variant]).toEqual([key, variant]);
    expect(contrast(k.title, k.bottom)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(k.credit, k.bottom)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(k.soft, k.bottom)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(k.ink, k.top)).toBeGreaterThanOrEqual(4.5);
  });
  test(`아치 프레임 ${name}: 막 위 제목·크레딧 7:1 이상, 홍보 문구 4.5:1 이상`, () => {
    const k = archSet(...inputs(key, variant));
    expect([k.key, k.variant]).toEqual([key, variant]);
    expect(contrast(k.gold, k.veil)).toBeGreaterThanOrEqual(7);
    expect(contrast(k.text, k.veil)).toBeGreaterThanOrEqual(7);
    expect(contrast(k.soft, k.veil)).toBeGreaterThanOrEqual(4.5);
  });
}
