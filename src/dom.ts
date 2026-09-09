/* ────────────────────────────────────────────────────────────────────
   자주 쓰는 DOM 참조 + 상태 표시줄 헬퍼. ES모듈 전환(2026-08-30)으로 신설.
   ──────────────────────────────────────────────────────────────────── */
import { $ } from './constants.js';

export const video = $<HTMLVideoElement>('video'), snapshot = $<HTMLImageElement>('snapshot');
/* getContext('2d')는 타입상 null이 될 수 있지만(2d 미지원 환경), 지금 코드도
   이미 non-null 전제로 pctx를 바로 쓴다 — 타입만 맞춘다. */
export const posterCanvas = $<HTMLCanvasElement>('posterCanvas'), pctx = posterCanvas.getContext('2d')!;

export function setStatus(m: string){ $('status').textContent = m; }
