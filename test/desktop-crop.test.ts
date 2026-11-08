/* 설치판 사진 자르기(src/desktopCrop.ts — 2026-11-08 Bumm님 «고침», _docs/intents/2026-11-08-desktop-photo-crop).
   얼굴 찾기(pico)는 그림판이 있어야 해서 여기서는 돌리지 않는다 — 실제 사진으로 찾는 것은 scripts/verify/desktop-crop-probe.mjs(창 없는 크롬).
   여기서는 찾은 얼굴 → 자를 자리 계산과, 이 모듈이 웹 빌드에 들어가지 않게 하는 불러오기 모양을 고정한다. */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { cropRect, mergeFaces, pickFaces, type Face } from '../src/desktopCrop.js';

const f = (x: number, y: number, size: number, score: number): Face => ({ x, y, size, score });

describe('자를 자리(cropRect)', () => {
  test('혼자 16:9(설치판 예시 사진 solo-end 1920×1080에서 찾은 얼굴): 얼굴 가운데 세로 2:3, 높이는 사진 전체', () => {
    expect(cropRect(1920, 1080, [f(954, 227, 214, 65)], 'solo')).toEqual({ x: 594, y: 0, w: 720, h: 1080 });
  });

  test('혼자 4:3 웹캠(1280×960): 얼굴이 작으면 얼굴 크기의 5배 높이까지만 당기고, 아래(몸)는 사진 끝까지', () => {
    const r = cropRect(1280, 960, [f(640, 300, 180, 40)], 'solo');
    expect(r).toEqual({ x: 340, y: 60, w: 600, h: 900 });
    expect(r!.w / r!.h).toBeCloseTo(2 / 3, 2);
    expect(r!.y + r!.h).toBe(960);
  });

  test('혼자 가까이 선 얼굴(정지 그림 camera-student 1536×1024): 어깨가 넓어도 세로 2:3 — 얼굴은 가운데, 다 든다', () => {
    const r = cropRect(1536, 1024, [f(754, 348, 324, 112)], 'solo')!;
    expect(r.w / r.h).toBeCloseTo(2 / 3, 2);
    expect(r.x).toBeLessThanOrEqual(754 - 324 / 2);
    expect(r.x + r.w).toBeGreaterThanOrEqual(754 + 324 / 2);
  });

  test('혼자: 얼굴이 사진 가장자리에 있으면 자리를 사진 안으로 민다(밖을 자르지 않는다)', () => {
    const r = cropRect(1280, 960, [f(100, 300, 180, 40)], 'solo')!;
    expect(r.x).toBe(0);
    expect(r.w).toBe(600);
  });

  test('단체(group-end 1920×1080에서 찾은 네 얼굴): 모두와 양옆 어깨 몫 — 2:3보다 넓으면 그 폭 그대로 · 높이 전체', () => {
    const faces = [f(1110, 448, 252, 77), f(1445, 377, 256, 32), f(857, 396, 232, 28), f(545, 343, 255, 11)];
    expect(cropRect(1920, 1080, faces, 'group')).toEqual({ x: 239, y: 0, w: 1513, h: 1080 });
  });

  test('단체: 잘못 찾은 «얼굴»은 폭을 넓힐 뿐 좁히지 않는다', () => {
    const faces = [f(900, 400, 240, 60), f(1100, 400, 240, 50)];
    const base = cropRect(1920, 1080, faces, 'group')!;
    const wider = cropRect(1920, 1080, [...faces, f(1700, 380, 200, 12)], 'group')!;
    expect(wider.x).toBeLessThanOrEqual(base.x);
    expect(wider.x + wider.w).toBeGreaterThanOrEqual(base.x + base.w);
  });

  test('단체 두 명이 가운데에 모이면 세로 2:3이 된다(두 사람과 어깨 몫이 다 든다)', () => {
    const r = cropRect(1920, 1080, [f(920, 400, 200, 60), f(1080, 400, 200, 50)], 'group')!;
    expect(r).toEqual({ x: 667, y: 80, w: 667, h: 1000 });
    expect(r.x).toBeLessThanOrEqual(920 - 1.2 * 200);
    expect(r.x + r.w).toBeGreaterThanOrEqual(1080 + 1.2 * 200);
  });

  test('얼굴을 못 찾으면 혼자는 가운데 기준 세로 2:3, 단체는 자르지 않는다(지금과 같다)', () => {
    expect(cropRect(1280, 960, [], 'solo')).toEqual({ x: 320, y: 0, w: 640, h: 960 });
    expect(cropRect(1280, 960, [], 'group')).toBeNull();
  });

  test('세로 사진(폭이 2:3보다 좁음)은 폭을 다 쓰고 머리 위 여백을 남겨 위아래만 자른다', () => {
    expect(cropRect(900, 1600, [f(450, 300, 200, 50)], 'solo')).toEqual({ x: 0, y: 59, w: 900, h: 1350 });
  });

  test('자를 것이 없으면(이미 세로 2:3이고 머리가 위에 붙음) null — 원래 사진 그대로', () => {
    expect(cropRect(720, 1080, [f(360, 200, 214, 60)], 'solo')).toBeNull();
  });

  test('어떤 경우에도 자리는 사진 안이고 정수다', () => {
    for (const [w, h] of [[1280, 960], [1920, 1080], [640, 480], [1000, 1500]])
      for (const mode of ['solo', 'group'])
        for (const faces of [[], [f(10, 10, 300, 20)], [f(w - 5, h * 0.7, 120, 30), f(5, 20, 140, 30)]]) {
          const r = cropRect(w, h, faces, mode);
          if (!r) continue;
          expect([r.x, r.y, r.w, r.h].every(Number.isInteger)).toBe(true);
          expect(r.x).toBeGreaterThanOrEqual(0);
          expect(r.y).toBeGreaterThanOrEqual(0);
          expect(r.x + r.w).toBeLessThanOrEqual(w);
          expect(r.y + r.h).toBeLessThanOrEqual(h);
          expect(r.w).toBeGreaterThan(0);
          expect(r.h).toBeGreaterThan(0);
        }
  });
});

describe('쓸 얼굴 고르기(pickFaces) · 합치기(mergeFaces)', () => {
  // solo-end 1920×1080에서 찾은 것(11/8): 진짜 얼굴 [954,227,214,65], 배경 포스터 [1658,385,84,43], 바닥 [413,643,180,12] 등
  const soloEnd = [f(954, 227, 214, 65), f(1658, 385, 84, 43), f(1549, 381, 78, 27), f(457, 380, 89, 13), f(413, 643, 180, 12), f(1181, 388, 80, 9)];

  test('혼자: 점수 × 크기가 가장 큰 얼굴 하나', () => {
    expect(pickFaces(soloEnd, 1080, 'solo')).toEqual([f(954, 227, 214, 65)]);
  });

  // group-end 1920×1080에서 찾은 것(11/8 desktop-crop-probe): 왼쪽 끝 얼굴 [532,354,285]은 점수가 10 언저리였다
  const groupEnd = [f(1109, 449, 247, 79), f(1661, 337, 81, 47), f(1445, 377, 256, 35), f(857, 398, 228, 32), f(532, 354, 285, 9.6), f(591, 676, 147, 7), f(392, 697, 98, 6), f(700, 300, 250, 4)];

  test('단체: 점수 5 이상 · 가장 뚜렷한 얼굴 크기의 0.5~2배 — 멀리 걸린 작은 얼굴은 빼고, 점수 낮은 끝 사람은 담는다', () => {
    expect(pickFaces(groupEnd, 1080, 'group').map((x) => x.x)).toEqual([1109, 1445, 857, 532, 591]);
  });

  test('혼자는 점수 10 미만을 버린다 · 사진 아래 1/4은 둘 다 버린다 — 남는 것이 없으면 빈 목록', () => {
    expect(pickFaces([f(500, 300, 200, 9), f(500, 900, 200, 80)], 1080, 'solo')).toEqual([]);
    expect(pickFaces([f(500, 300, 200, 4), f(500, 900, 200, 80)], 1080, 'group')).toEqual([]);
  });

  test('여러 각도에서 같은 얼굴을 찾은 것은 하나로(점수 높은 것)', () => {
    expect(mergeFaces([f(500, 300, 200, 20), f(530, 310, 210, 45), f(900, 300, 200, 15)])).toEqual([f(530, 310, 210, 45), f(900, 300, 200, 15)]);
  });
});

test('desktopCrop은 import.meta.env.MODE를 그 자리에서 읽는 갈래 안에서만 불러온다 — 그래야 웹 dist에 조각 · 학습 파일이 생기지 않는다(11/8 실측)', () => {
  const src = readFileSync('src/PosterStudio.tsx', 'utf8');
  const imports = src.match(/import\(["']\.\/desktopCrop\.js["']\)/g) ?? [];
  const guarded = src.match(/import\.meta\.env\.MODE === "desktop" \? await \(await import\("\.\/desktopCrop\.js"\)\)\.cropForPoster\(/g) ?? [];
  expect(imports.length).toBe(1);   // «이 사진으로 포스터 만들기»(샘플 사진은 미리 자른 그림 — 11/8)
  expect(guarded.length).toBe(imports.length);
  expect(src).not.toMatch(/^import[^;]*desktopCrop/m);
});
