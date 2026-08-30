/* ────────────────────────────────────────────────────────────────────
   자주 쓰는 DOM 참조 + 상태 표시줄 헬퍼. ES모듈 전환(2026-08-30)으로 신설.
   ──────────────────────────────────────────────────────────────────── */
import { $ } from './constants.js';

export const video = $('video'), snapshot = $('snapshot');
export const posterCanvas = $('posterCanvas'), pctx = posterCanvas.getContext('2d');

export function setStatus(m){ $('status').textContent = m; }
