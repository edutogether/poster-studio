import { describe, expect, test } from "vitest";
import { archPlacement } from "../src/templates";

// 아치 프레임 창 배치(2026-10-23 Bumm님 «아치 모양으로 안에는 잘 보이고 밖에는 흐리게»): 창 안은 곡선 꼭대기까지 선명한 그림으로 꽉,
// 얼굴 띠(혼자 가로 30~70% · 단체 8~92%, 세로 8~35%)는 아치 곡선 안 24px 안쪽. 아치 값은 templates.ts 아치 프레임과 같다(r 440, 꼭대기 176).
const r = 440, cx = 600, spring = 176 + r, m = 24;
const FACE = { solo: [0.3, 0.7], group: [0.08, 0.92] } as const;

/** 점이 아치(위 반원 + 아래 네모) 안 m px 안쪽인가 */
function insideArch(x: number, y: number, bottom: number) {
  if (y > bottom - m) return false;
  if (y >= spring) return Math.abs(x - cx) <= r - m;
  return Math.hypot(x - cx, y - spring) <= r - m;
}

describe("아치 프레임 창 배치", () => {
  // 아치 아래 끝은 제목 길이에 따라 움직인다 — 짧은 제목부터 세 줄 제목까지
  for (const archBottom of [1200, 1290, 1340, 1400]) {
    const win = { x: cx - r, y: spring - r, w: 2 * r, h: archBottom - (spring - r) };
    for (const [aw, ah, shape] of [[1024, 1536, "세로 2:3"], [1024, 1024, "정사각"], [1536, 1024, "가로 3:2"]] as const) {
      for (const mode of ["solo", "group"] as const) {
        test(`${shape} · ${mode === "solo" ? "혼자" : "단체"} · 아치 아래 ${archBottom}: 얼굴 띠가 곡선 안`, () => {
          const p = archPlacement(aw, ah, win, cx, spring, r, mode);
          const [fx0, fx1] = FACE[mode];
          const corners = [[fx0, 0.08], [fx1, 0.08], [fx0, 0.35], [fx1, 0.35]].map(([u, v]) => [p.x + u * p.w, p.y + v * p.h]);
          for (const [x, y] of corners) expect(insideArch(x, y, archBottom), `모서리 (${x.toFixed(0)}, ${y.toFixed(0)})`).toBe(true);
        });
      }
    }
    test(`세로 2:3 · 혼자 · 아치 아래 ${archBottom}: 창을 꼭대기까지 꽉 덮는다(실제 AI 그림 비율)`, () => {
      const p = archPlacement(1024, 1536, win, cx, spring, r, "solo");
      expect(p.y).toBeLessThanOrEqual(win.y + 0.5);
      expect(p.y + p.h).toBeGreaterThanOrEqual(win.y + win.h - 0.5);
      expect(p.x).toBeLessThanOrEqual(win.x + 0.5);
      expect(p.x + p.w).toBeGreaterThanOrEqual(win.x + win.w - 0.5);
    });
  }
});
