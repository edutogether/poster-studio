import { describe, expect, test } from "vitest";
import { archPlacement, coverPlacement, fitPlacement } from "../src/templates";

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

// 얼굴을 지키는 다섯 종(시네마 · 에디토리얼 · 컬러 블록 · 필름스트립 · 트립틱 — 2026-11-08 밤 팀장 결정 «섞기»): fitPlacement.
// 주인공 상자는 AI 약속 상자 또는 단체 얼굴 범위(설치판 자르기 · 샘플 단체 — 아래 SUBJECT는 샘플 단체 값).
const SUBJECT = { x0: 0.142, y0: 0.02, x1: 0.827, y1: 0.751 };
const FIT_SLOTS: Record<string, { cover: Rect; safe: Rect }> = {
  시네마: { cover: { x: 0, y: 0, w: 1200, h: 1800 }, safe: { x: 48, y: 150, w: 1104, h: 1040 } },
  에디토리얼: { cover: SLOTS.에디토리얼.cover, safe: SLOTS.에디토리얼.safes[0] },
  "컬러 블록": { cover: SLOTS["컬러 블록"].cover, safe: SLOTS["컬러 블록"].safes[0] },
  필름스트립: { cover: SLOTS.필름스트립.cover, safe: SLOTS.필름스트립.safes[0] },
  트립틱: { cover: { x: 0, y: 0, w: 1200, h: 1800 }, safe: { x: 48, y: 150, w: 1104, h: 1030 } },
};
const BOXES = [["혼자 약속 상자", BOX.solo], ["단체 약속 상자", BOX.group], ["단체 얼굴 범위", SUBJECT]] as const;

describe("얼굴을 지키는 배치(fitPlacement)", () => {
  const near = (a: Rect, b: Rect) => (["x", "y", "w", "h"] as const).every((k) => Math.abs(a[k] - b[k]) < 1e-6);
  for (const [name, { cover, safe }] of Object.entries(FIT_SLOTS)) {
    for (const [aw, ah, shape] of ARTS) {
      for (const [boxName, b] of BOXES) {
        // 앱과 같게: 에디토리얼은 늘, 시네마 · 트립틱은 단체만 머리를 내린다(lowerHead)
        const group = b !== BOX.solo, lower = name === "에디토리얼" || (group && (name === "시네마" || name === "트립틱"));
        test(`${name} · ${shape} · ${boxName}: 상자 폭이 안전 영역에 막 들어오는 만큼만 줄이고, 줄었으면 남는 높이를 위아래로 나눈다`, () => {
          const p = fitPlacement(aw, ah, cover, safe, b, lower);
          const sCover = Math.max(cover.w / aw, cover.h / ah), s = p.w / aw;
          const head = p.y + b.y0 * p.h, end = p.y + b.y1 * p.h;
          if (s < sCover - 1e-9) {
            // 줄였다면 정확히 «막 들어오는 만큼» — 상자 폭 = 안전 영역 폭, 양끝도 안전 영역 안(양끝 얼굴이 칸 밖으로 잘리지 않는다)
            expect((b.x1 - b.x0) * p.w).toBeCloseTo(safe.w, 6);
            expect(p.x + b.x0 * p.w).toBeGreaterThanOrEqual(safe.x - 0.5);
            expect(p.x + b.x1 * p.w).toBeLessThanOrEqual(safe.x + safe.w + 0.5);
          } else if (!lower) {
            // 줄이지 않았으면 덮어 채우기와 같다
            expect(near(p, coverPlacement(aw, ah, cover, safe, b)), JSON.stringify(p)).toBe(true);
          }
          const capY = cover.y + cover.h - p.h * 0.75;   // 머리를 내려도 그림 아래가 칸 밖으로 4분의 1 넘게 나가지 않는다
          if (lower) {
            // 머리(상자 위)는 안전 영역 위보다 아래 — 내릴 수 있는 끝(capY)에 닿은 경우만 예외
            if (Math.abs(p.y - capY) > 0.5) expect(head, "머리").toBeGreaterThanOrEqual(safe.y - 0.5);
          } else if (p.h < cover.h) {
            // 칸 안에 들어가고, 칸 가운데(남는 높이를 위아래로 반씩)에서 벗어났다면 머리 · 상자 아래 · 칸 끝 가운데 하나에 닿아서다
            expect(p.y).toBeGreaterThanOrEqual(cover.y - 0.5);
            expect(p.y + p.h).toBeLessThanOrEqual(cover.y + cover.h + 0.5);
            const mid = cover.y + (cover.h - p.h) / 2;
            if (Math.abs(p.y - mid) > 0.5) {
              const atHead = Math.abs(head - safe.y) < 0.5, atEnd = Math.abs(end - (safe.y + safe.h)) < 0.5;
              const atCover = Math.abs(p.y - cover.y) < 0.5 || Math.abs(p.y + p.h - cover.y - cover.h) < 0.5;
              expect(atHead || atEnd || atCover, JSON.stringify({ p, head, end, mid })).toBe(true);
            }
            // 머리는 안전 영역 위보다 아래 — 그림이 칸 아래 끝에 붙어 더 내릴 수 없을 때만 예외
            if (Math.abs(p.y + p.h - cover.y - cover.h) > 0.5) expect(head, "머리").toBeGreaterThanOrEqual(safe.y - 0.5);
          }
        });
      }
    }
  }

  test("lowerHead: 덮는 그림도 머리를 안전 영역 위보다 아래에 둔다(칸 위는 바탕색 면)", () => {
    const cover = { x: 0, y: 0, w: 1000, h: 1000 }, safe = { x: 0, y: 200, w: 1000, h: 600 };
    expect(fitPlacement(1000, 1000, cover, safe, BOX.solo).y).toBe(0);    // 덮어 채우기는 칸 위에서 멈춘다(머리 50 — 제호에 걸림)
    const low = fitPlacement(1000, 1000, cover, safe, BOX.solo, true);
    expect(low.y + 0.05 * 1000).toBeGreaterThanOrEqual(200);             // 머리를 내린다
    expect(low.y).toBeLessThanOrEqual(1000 - 0.75 * 1000);               // 그림 아래는 칸 밖으로 4분의 1까지만
  });

  test("칸보다 낮아진 그림은 칸 가운데 — 남는 높이를 위아래로 반씩(아래로 몰지 않는다)", () => {
    // 칸 600×1600, 정사각 그림, 얼굴 범위 0.142~0.827 → 폭 600에 상자가 막 들어오는 크기(약 876)로, 칸 가운데
    const cover = { x: 0, y: 0, w: 600, h: 1600 }, safe = { x: 0, y: 0, w: 600, h: 1400 };
    const p = fitPlacement(1000, 1000, cover, safe, SUBJECT);
    expect((SUBJECT.x1 - SUBJECT.x0) * p.w).toBeCloseTo(600, 6);
    expect(p.y).toBeCloseTo((1600 - p.h) / 2, 6);
  });
});
