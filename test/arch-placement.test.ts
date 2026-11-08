import { describe, expect, test } from "vitest";
import { archPlacement, coverPlacement } from "../src/templates";

// 사진 칸 덮어 채우기(2026-11-08 Bumm님 «위에 지워지는 거 개짜증나는데 좌우 얼굴 옆쪽을 잘라서라도 최대한 채워. 모든 이미지들을 1번 시네마랑 8번 트립틱처럼»):
// 에디토리얼 · 컬러 블록 · 아치 프레임 · 필름스트립 · 폴라로이드 · 타이포그래피도 그림이 칸을 늘 덮는다(흐린 배경 연장 없음).
type Rect = { x: number; y: number; w: number; h: number };
const covers = (p: Rect, c: Rect) =>
  p.x <= c.x + 0.5 && p.y <= c.y + 0.5 && p.x + p.w >= c.x + c.w - 0.5 && p.y + p.h >= c.y + c.h - 0.5;

// 그림 모양: AI 세로 2:3 · 정사각 · 가로 3:2 · 설치판 단체 자른 그림(얼굴 넷 + 어깨 몫 — 11/8 실측 1135×1080)
const ARTS = [[1024, 1536, "세로 2:3"], [1024, 1024, "정사각"], [1536, 1024, "가로 3:2"], [1135, 1080, "설치판 단체"]] as const;
const BOX = {
  solo: { x0: 0.16, y0: 0.05, x1: 0.84, y1: 0.67 },
  group: { x0: 0.04, y0: 0.05, x1: 0.96, y1: 0.67 },
} as const;

// 디자인마다 사진 칸 · 안전 영역(templates.ts 기본 제목 · 문구로 그린 값에 가깝게 — 제목이 길어지면 안전 영역 아래가 올라간다)
const SLOTS: Record<string, { cover: Rect; safes: Rect[] }> = {
  에디토리얼: { cover: { x: 28, y: 28, w: 1144, h: 1744 }, safes: [{ x: 52, y: 470, w: 1096, h: 900 }, { x: 52, y: 640, w: 1096, h: 420 }] },
  "컬러 블록": { cover: { x: 72, y: 168, w: 1056, h: 1010 }, safes: [{ x: 72, y: 168, w: 1056, h: 1010 }, { x: 72, y: 168, w: 1056, h: 760 }] },
  필름스트립: { cover: { x: 226, y: 150, w: 748, h: 1580 }, safes: [{ x: 242, y: 174, w: 716, h: 1000 }, { x: 242, y: 174, w: 716, h: 700 }] },
  폴라로이드: { cover: { x: 88, y: 159, w: 1024, h: 1305 }, safes: [{ x: 88, y: 159, w: 1024, h: 1305 }, { x: 88, y: 159, w: 1024, h: 1150 }] },
  타이포그래피: { cover: { x: 0, y: 0, w: 1200, h: 1120 }, safes: [{ x: 56, y: 150, w: 1088, h: 700 }, { x: 56, y: 150, w: 1088, h: 300 }] },
};

describe("사진 칸 덮어 채우기(coverPlacement)", () => {
  for (const [name, { cover, safes }] of Object.entries(SLOTS)) {
    for (const safe of safes) {
      for (const [aw, ah, shape] of ARTS) {
        for (const mode of ["solo", "group"] as const) {
          test(`${name} · ${shape} · ${mode === "solo" ? "혼자" : "단체"} · 안전 높이 ${safe.h}: 칸을 덮고, 머리가 칸 위로 잘리지 않는다`, () => {
            const b = BOX[mode], p = coverPlacement(aw, ah, cover, safe, b);
            expect(covers(p, cover), JSON.stringify(p)).toBe(true);
            expect(p.y + b.y0 * p.h, "머리(주인공 상자 위)").toBeGreaterThanOrEqual(cover.y - 0.5);
            // 크기는 덮는 데 필요한 만큼만(더 키우지 않는다)
            expect(Math.min(p.w - cover.w, p.h - cover.h)).toBeLessThanOrEqual(0.5);
          });
        }
      }
    }
  }

  test("주인공이 안전 영역보다 낮으면 가운데에, 높으면 머리를 안전 영역 위에 맞춘다(덮을 수 있는 범위 안에서)", () => {
    // 칸 1000×1000에 1000×3000 그림(배율 1) — 위아래로 -2000~0 사이를 움직일 수 있다. 주인공 상자 높이 0.62 × 3000 = 1860.
    const cover = { x: 0, y: 0, w: 1000, h: 1000 };
    const roomy = coverPlacement(1000, 3000, cover, { x: 0, y: 100, w: 1000, h: 1900 }, BOX.solo);
    expect(roomy.y).toBeCloseTo(100 + 950 - 0.36 * 3000, 6);   // 들어간다 → 가운데(-30)
    const tight = coverPlacement(1000, 3000, cover, { x: 0, y: 100, w: 1000, h: 300 }, BOX.solo);
    expect(tight.y + 0.05 * 3000).toBeCloseTo(100, 6);          // 안 들어간다 → 머리가 안전 위(100) — 가운데였다면 머리가 -680으로 잘린다
    const pinned = coverPlacement(1000, 3000, cover, { x: 0, y: 400, w: 1000, h: 300 }, BOX.solo);
    expect(pinned.y).toBe(0);                                    // 머리를 400에 두려면 칸 위가 비므로 덮는 범위 끝(0)에서 멈춘다
  });
});

// 아치 프레임 창 배치: 창 안은 곡선 꼭대기까지 선명한 그림으로 꽉, 그림 위 = 창 꼭대기(얼굴이 가장 낮게 — 곡선이 넓은 쪽).
// 아치 값은 templates.ts 아치 프레임과 같다(r 440, 꼭대기 176). 얼굴 띠(혼자 가로 30~70%, 세로 8~35%).
const r = 440, cx = 600, spring = 176 + r, m = 24;
function insideArch(x: number, y: number, bottom: number) {
  if (y > bottom - m) return false;
  if (y >= spring) return Math.abs(x - cx) <= r - m;
  return Math.hypot(x - cx, y - spring) <= r - m;
}

describe("아치 프레임 창 배치", () => {
  // 아치 아래 끝은 제목 길이에 따라 움직인다 — 짧은 제목부터 세 줄 제목까지
  for (const archBottom of [1200, 1290, 1340, 1400]) {
    const win = { x: cx - r, y: spring - r, w: 2 * r, h: archBottom - (spring - r) };
    for (const [aw, ah, shape] of ARTS) {
      test(`${shape} · 아치 아래 ${archBottom}: 창을 꼭대기까지 꽉 덮고, 그림 위가 창 꼭대기 · 가운데 맞춤`, () => {
        const p = archPlacement(aw, ah, win, cx);
        expect(covers(p, win), JSON.stringify(p)).toBe(true);
        expect(p.y).toBe(win.y);
        expect(p.x + p.w / 2).toBeCloseTo(cx, 6);
      });
    }
    test(`세로 2:3 · 혼자 · 아치 아래 ${archBottom}: 얼굴 띠가 곡선 안(실제 AI 그림 비율)`, () => {
      const p = archPlacement(1024, 1536, win, cx);
      const corners = [[0.3, 0.08], [0.7, 0.08], [0.3, 0.35], [0.7, 0.35]].map(([u, v]) => [p.x + u * p.w, p.y + v * p.h]);
      for (const [x, y] of corners) expect(insideArch(x, y, archBottom), `모서리 (${x.toFixed(0)}, ${y.toFixed(0)})`).toBe(true);
    });
  }
});
