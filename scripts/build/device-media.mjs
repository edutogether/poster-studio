/* 비율 기준 전환(2026-10-23, _docs/intents/2026-10-23-ratio-canvas) — 빌드 단계 PostCSS 플러그인. PC 캔버스가 켜졌을 때만 일한다.

   휴대폰 · 태블릿은 public/device-canvas.js가 viewport 폭을 기준 폭(390 · 1024 · 1366)으로 맞춘다 — 브라우저가 폭 조건을 이미 기준 폭으로 고르고,
   높이 조건은 실제 화면 높이(폭 비율만큼 줄이고 키운 것)로 고른다. 그래서 휴대폰 · 태블릿 몫의 미디어 쿼리는 원래대로 둔다.
   높이를 기준 높이(844)로 미리 정해 버리면 낮은 폰(390×664 · 430×740)의 «한 화면» 규칙이 사라져 2단계 빨간 단추가 11~19px 잘렸다(10/23 실측).

   PC 캔버스 스위치(public/device-canvas.js의 `var PC_CANVAS = …;` 한 줄이 유일한 원본 — 이 플러그인은 그 줄을 읽는다):
     꺼짐 — 아무것도 바꾸지 않는다. PC는 지금 라이브 배치 그대로(창 크기로 고르는 미디어 쿼리 · 원래 vw · vh).
     켜짐 — PC는 2560×1440 캔버스를 <html> zoom으로 통째로 줄이므로 창 크기로 고르면 틀린다. src/의 CSS를 빌드할 때:
       ① 폭 · 높이 조건(min/max-width/height)이 든 @media는 PC 몫을 2560×1440으로 미리 평가해 `:where([data-device="pc"]) .x` 꼴로 바꾸고
          (:where라 우선순위가 그대로 — 원래 규칙과 같은 무게로 같은 자리에서 이긴다), 휴대폰 · 태블릿 몫은 원래 @media에 그 갈래 선택자를 붙인 사본으로 둔다.
          폭 · 높이 말고 다른 조건(움직임 줄이기 · 인쇄 · 마우스)은 @media로 남긴다.
       ② 화면 단위(vw · vh · svh · dvh · lvh · vmax)는 `calc(N * var(--vw, 1vw))` 꼴로 — PC 캔버스만 device-canvas.js가 캔버스 단위(25.6px · 14.4px)를 넣는다.
   data-device는 device-canvas.js가 <head> 맨 앞에서 붙인다. privacy.html의 안쪽 <style>은 건드리지 않는다(src/ CSS 파일만). */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REFERENCE = { pc: [2560, 1440], 'tablet-l': [1366, 1024], 'tablet-p': [1024, 1366], phone: [390, 844] };
const SIZE = /^\((min|max)-(width|height)\s*:\s*([\d.]+)px\)$/;

/** «a and b» 꼴 미디어 쿼리 하나를 갈래마다 기준 크기로 평가한다. 폭 · 높이 조건이 없으면 null. */
export function splitQuery(params) {
  const parts = params.split(/\s+and\s+/i).map((p) => p.trim()).filter(Boolean);
  const size = [], rest = [];
  for (const p of parts) (SIZE.test(p) ? size : rest).push(p);
  if (!size.length) return null;
  const devices = Object.entries(REFERENCE).filter(([, [w, h]]) => size.every((p) => {
    const [, mm, dim, v] = p.match(SIZE), x = dim === 'width' ? w : h;
    return mm === 'min' ? x >= Number(v) : x <= Number(v);
  })).map(([k]) => k);
  return { devices, rest: rest.join(' and ') };
}

/** 선택자 하나 앞에 갈래 조건을 붙인다(우선순위 0). :root · html로 시작하면 그 자리에 붙인다. */
export function prefixSelector(sel, devices) {
  const attrs = devices.map((d) => `[data-device="${d}"]`).join(',');
  const m = sel.match(/^(\s*)(:root|html)(?![\w-])/);
  if (m) return `${m[1]}${m[2]}:where(${attrs})${sel.slice(m[0].length)}`;
  return `:where(${attrs}) ${sel.trim()}`;
}

const UNIT = /(-?\d*\.?\d+)(vw|vh|svh|dvh|lvh|vmax)\b/g;
export function convertUnits(value) {
  return value.replace(UNIT, (_, n, u) => {
    if (u === 'vw') return `calc(${n} * var(--vw, 1vw))`;
    if (u === 'vmax') return `calc(${n} * max(var(--vw, 1vw), var(--vh, 1vh)))`;
    return `calc(${n} * var(--vh, 1${u}))`;
  });
}

/** public/device-canvas.js의 `var PC_CANVAS = true|false;` — 없거나 모양이 다르면 빌드를 멈춘다(조용히 한쪽으로 기울지 않게). */
// 경로는 문자열로 — 시험(jsdom)에서는 전역 URL이 jsdom 것이라 fs가 URL 객체를 받지 않는다
const CANVAS_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../../public/device-canvas.js');
export function readPcCanvas(src = readFileSync(CANVAS_FILE, 'utf8')) {
  const m = src.match(/^\s*var PC_CANVAS = (true|false);/m);
  if (!m) throw new Error('public/device-canvas.js에 «var PC_CANVAS = true|false;» 줄이 없다');
  return m[1] === 'true';
}

const NOT_PC = ['phone', 'tablet-p', 'tablet-l'];
const prefixRules = (node, devices) => node.walkRules((rule) => {
  if (rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
  rule.selectors = rule.selectors.map((s) => prefixSelector(s, devices));
});
export default function deviceMedia({ pcCanvas = readPcCanvas() } = {}) {
  return {
    postcssPlugin: 'device-media',
    Once(root) {
      if (!pcCanvas) return;
      const file = root.source?.input?.file || '';
      if (!/[\\/]src[\\/].*\.css$/.test(file) || /html-proxy/.test(file)) return;
      root.walkDecls((d) => { if (/\d(vw|vh|svh|dvh|lvh|vmax)\b/.test(d.value)) d.value = convertUnits(d.value); });
      root.walkAtRules('media', (at) => {
        if (at.params.includes(',')) throw at.error('쉼표로 묶은 미디어 쿼리는 아직 다루지 않는다 — device-media.mjs를 늘릴 것');
        const q = splitQuery(at.params);
        if (!q) return;
        // 휴대폰 · 태블릿 몫은 원래 조건 그대로 — 같은 자리에 사본으로 둔다
        const others = at.clone(); prefixRules(others, NOT_PC); at.before(others);
        if (!q.devices.includes('pc')) { at.remove(); return; }
        prefixRules(at, ['pc']);
        if (q.rest) at.params = q.rest; else at.replaceWith(at.nodes);
      });
    },
  };
}
deviceMedia.postcss = true;
