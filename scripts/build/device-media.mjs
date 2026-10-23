/* 비율 기준 전환(2026-10-23, _docs/intents/2026-10-23-ratio-canvas) — 빌드 단계 PostCSS 플러그인.

   갈래(PC · 태블릿 가로 · 태블릿 세로 · 휴대폰)마다 기준 화면 하나를 통째로 줄이고 키운다. 그러면 «창 폭 · 높이» 미디어 쿼리는 더 이상
   창 크기로 고르면 안 되고, 그 갈래의 기준 크기에서 켜지던 규칙만 늘 켜져야 한다(기준 크기 화면이 지금과 화소 하나 다르지 않게).
   그래서 src/의 CSS를 빌드할 때:
   ① 폭 · 높이 조건(min/max-width/height)이 든 @media는 갈래마다 기준 크기로 미리 평가해, 맞는 갈래의 선택자로 바꾼다 —
      `:where([data-device="phone"]) .x` 꼴(:where라 우선순위가 그대로 — 원래 규칙과 같은 무게로 같은 자리에서 이긴다).
      폭 · 높이 말고 다른 조건(움직임 줄이기 · 인쇄 · 마우스)은 @media로 남긴다. 맞는 갈래가 없으면 규칙을 지운다.
   ② 화면 단위(vw · vh · svh · dvh · lvh · vmax)는 `calc(N * var(--vw, 1vw))` 꼴로 — 휴대폰 · 태블릿은 변수가 없어 그대로(viewport 폭을
      기준 폭으로 맞추므로 화면 단위가 이미 기준 크기다), PC는 public/device-canvas.js가 캔버스 단위(25.6px · 14.4px)를 넣는다(zoom이라 화면 단위가 틀린다).
   data-device는 public/device-canvas.js가 <head> 맨 앞에서 붙인다. privacy.html의 안쪽 <style>은 건드리지 않는다(src/ CSS 파일만).
   PC 캔버스 스위치(public/device-canvas.js의 `var PC_CANVAS = …;` 한 줄이 유일한 원본 — 이 플러그인은 그 줄을 읽는다):
     켜짐 — PC도 위처럼 2560×1440에서 미리 평가한다.
     꺼짐 — PC는 지금 라이브 배치 그대로: PC 몫은 원래 @media를 그대로 두고 선택자에 `:where([data-device="pc"])`만 붙인 사본으로 남기고,
            휴대폰 · 태블릿 몫만 기준 크기로 평가한다. 화면 단위 변수(--vw · --vh)도 넣지 않으므로 PC는 원래 vw · vh 그대로다. */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REFERENCE = { pc: [2560, 1440], 'tablet-l': [1366, 1024], 'tablet-p': [1024, 1366], phone: [390, 844] };
const SIZE = /^\((min|max)-(width|height)\s*:\s*([\d.]+)px\)$/;

/** «a and b» 꼴 미디어 쿼리 하나를 갈래마다 평가한다. 폭 · 높이 조건이 없으면 null. */
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

const ALL = Object.keys(REFERENCE).length;
const prefixRules = (node, devices) => node.walkRules((rule) => {
  if (rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
  rule.selectors = rule.selectors.map((s) => prefixSelector(s, devices));
});
export default function deviceMedia({ pcCanvas = readPcCanvas() } = {}) {
  return {
    postcssPlugin: 'device-media',
    Once(root) {
      const file = root.source?.input?.file || '';
      if (!/[\\/]src[\\/].*\.css$/.test(file) || /html-proxy/.test(file)) return;
      root.walkDecls((d) => { if (/\d(vw|vh|svh|dvh|lvh|vmax)\b/.test(d.value)) d.value = convertUnits(d.value); });
      root.walkAtRules('media', (at) => {
        if (at.params.includes(',')) throw at.error('쉼표로 묶은 미디어 쿼리는 아직 다루지 않는다 — device-media.mjs를 늘릴 것');
        const q = splitQuery(at.params);
        if (!q) return;
        // PC 캔버스가 꺼져 있으면 PC 몫은 원래 조건 그대로(창 크기로 고른다) — 같은 자리에 사본으로 둔다
        if (!pcCanvas) { const pc = at.clone(); prefixRules(pc, ['pc']); at.before(pc); }
        const devices = pcCanvas ? q.devices : q.devices.filter((d) => d !== 'pc');
        if (!devices.length) { at.remove(); return; }
        if (devices.length < ALL) prefixRules(at, devices);
        if (q.rest) at.params = q.rest; else at.replaceWith(at.nodes);
      });
    },
  };
}
deviceMedia.postcss = true;
