#!/usr/bin/env node
/* ────────────────────────────────────────────────────────────────────
   compare.mjs 자기검사 (_shared/CONVENTIONS.md §5.4).

     node scripts/verify/selftest.mjs

   "차이 0건"이라는 결과가 증명이 되려면, 이 도구가 **진짜 차이를 잡을 수
   있다는 것**이 먼저 증명돼야 한다. 그래서 일부러 틀린 스냅샷을 만들어
   넣고, 심어둔 결함이 하나도 빠짐없이 잡히는지 확인한다.

   Portal은 배포를 막는 게이트가 3열을 2열로 바꿔도 통과하는 **빈 게이트**인
   것을 이 방식으로 찾아냈다. 여기서 심는 결함은 실제로 겪은 사고를 본뜬 것이다:
     - Voice Cinema: 요소 id 20여 개 유실 (픽셀 대조 통과)
     - Portal: 카드 alt 변경 (픽셀 대조 통과)
     - 이 저장소가 가장 두려워하는 것: transition/animation 타이밍 변화
   ──────────────────────────────────────────────────────────────────── */
import assert from 'node:assert/strict';
import { diffSnapshots, summarize } from './compare.mjs';

const base = () => ({
  meta: { url: '/', viewport: { w: 1366, h: 768 }, capturedAt: '2026-09-09T00:00:00Z' },
  document: {
    title: 'InKY AI 영화 포스터 제작소',
    lang: 'ko',
    ids: ['bootSplash', 'generateBtn', 'posterCanvas', 'video'],
    metas: [{ name: 'viewport', property: null, charset: null, content: 'width=device-width', httpEquiv: null }],
    links: [{ rel: 'stylesheet', href: '/style.css', as: null, type: null }]
  },
  elements: {
    '#generateBtn': {
      tag: 'button', classes: ['big', 'btn', 'primary'], text: '✨ AI 포스터 만들기',
      attrs: { type: 'button', 'aria-label': '포스터 생성' },
      style: {
        'background-color': 'rgb(233, 185, 73)',
        'transition-duration': '0.15s',
        'transition-timing-function': 'ease',
        'animation-name': 'none',
        'font-size': '16px'
      },
      rect: { w: 240, h: 48, x: 40, y: 500 }
    },
    'section.left>div.panel>img|"": ': {
      tag: 'img', classes: [], text: '',
      attrs: { alt: '촬영 사진', src: '/poster-wall.webp' },
      style: { 'background-color': 'rgba(0, 0, 0, 0)', 'transition-duration': '0s', 'transition-timing-function': 'ease', 'animation-name': 'none', 'font-size': '14px' },
      rect: { w: 100, h: 100, x: 0, y: 0 }
    }
  }
});

const clone = (o) => JSON.parse(JSON.stringify(o));
let failures = 0;
const check = (label, fn) => {
  try { fn(); console.log(`  ✅ ${label}`); }
  catch (e) { failures++; console.log(`  ❌ ${label}\n     ${e.message}`); }
};

console.log('compare.mjs 자기검사 — 심어둔 결함이 실제로 잡히는가\n');

// 0) 같은 것끼리는 반드시 0건이어야 한다. 여기서 실패하면 도구가 노이즈를 만든다는 뜻.
check('동일한 스냅샷 → 차이 0건 (오탐 없음)', () => {
  const d = diffSnapshots(base(), base());
  assert.equal(d.length, 0, `오탐 ${d.length}건: ${JSON.stringify(d.slice(0, 3))}`);
});

// 1) 요소 id 유실 — Voice Cinema에서 실제로 20여 개가 사라졌던 것
check('요소 id 유실을 high로 잡는다', () => {
  const after = clone(base());
  after.document.ids = after.document.ids.filter((i) => i !== 'video');
  const d = diffSnapshots(base(), after);
  const hit = d.find((x) => x.kind === 'id-missing' && x.key === 'video');
  assert.ok(hit, 'id 유실이 안 잡혔다');
  assert.equal(hit.severity, 'high');
});

// 2) alt 변경 — Portal에서 실제로 바뀐 채 배포됐던 것
check('alt 변경을 high로 잡는다', () => {
  const after = clone(base());
  const k = Object.keys(after.elements)[1];
  after.elements[k].attrs.alt = '사진';
  const d = diffSnapshots(base(), after);
  const hit = d.find((x) => x.kind === 'attr' && x.prop === 'alt');
  assert.ok(hit, 'alt 변경이 안 잡혔다');
  assert.equal(hit.severity, 'high');
});

// 3) 움직임 — "체감까지 동일"의 핵심. 0.15s → 0.3s는 눈에 잘 안 띄지만 체감은 다르다.
check('transition-duration 변화를 motion/high로 잡는다', () => {
  const after = clone(base());
  after.elements['#generateBtn'].style['transition-duration'] = '0.3s';
  const d = diffSnapshots(base(), after);
  const hit = d.find((x) => x.kind === 'motion' && x.prop === 'transition-duration');
  assert.ok(hit, 'transition 변화가 안 잡혔다');
  assert.equal(hit.severity, 'high');
});

check('animation-name 변화를 motion으로 잡는다', () => {
  const after = clone(base());
  after.elements['#generateBtn'].style['animation-name'] = 'pulse';
  const d = diffSnapshots(base(), after);
  assert.ok(d.some((x) => x.kind === 'motion' && x.prop === 'animation-name'));
});

// 4) 요소 자체가 사라짐
check('요소 유실을 high로 잡는다', () => {
  const after = clone(base());
  delete after.elements['#generateBtn'];
  const d = diffSnapshots(base(), after);
  const hit = d.find((x) => x.kind === 'element-missing');
  assert.ok(hit, '요소 유실이 안 잡혔다');
  assert.equal(hit.severity, 'high');
});

// 5) 레이아웃 — 서브픽셀은 통과, 진짜 차이는 잡아야 한다
check('rect 0.4px 차이는 통과시킨다(서브픽셀 허용)', () => {
  const after = clone(base());
  after.elements['#generateBtn'].rect.w = 240.4;
  assert.equal(diffSnapshots(base(), after).filter((x) => x.kind === 'rect').length, 0);
});
check('rect 2px 차이는 잡는다', () => {
  const after = clone(base());
  after.elements['#generateBtn'].rect.w = 242;
  assert.ok(diffSnapshots(base(), after).some((x) => x.kind === 'rect'));
});

// 6) 문서 수준
check('meta 유실을 잡는다', () => {
  const after = clone(base());
  after.document.metas = [];
  assert.ok(diffSnapshots(base(), after).some((x) => x.kind === 'metas-missing'));
});
check('title 변경을 잡는다', () => {
  const after = clone(base());
  after.document.title = 'InKY Poster Studio';
  assert.ok(diffSnapshots(base(), after).some((x) => x.kind === 'document' && x.prop === 'title'));
});
check('텍스트 변경을 잡는다', () => {
  const after = clone(base());
  after.elements['#generateBtn'].text = 'AI 포스터 생성';
  assert.ok(diffSnapshots(base(), after).some((x) => x.kind === 'text'));
});
check('클래스 변경을 잡는다', () => {
  const after = clone(base());
  after.elements['#generateBtn'].classes = ['btn', 'primary'];
  assert.ok(diffSnapshots(base(), after).some((x) => x.kind === 'classes'));
});

/* 8) 비결정 값 정규화 — 느슨하게 만든 만큼, 진짜 회귀까지 놓치면 안 된다.
      완화가 과하면 게이트가 비는 것이므로 양쪽을 다 확인한다. */
check('blob: URL이 달라도 통과시킨다(매 실행 새로 발급되는 값)', () => {
  const before = clone(base()), after = clone(base());
  const k = Object.keys(before.elements)[1];
  before.elements[k].attrs.src = 'blob:http://localhost:5500/aaaa-1111';
  after.elements[k].attrs.src = 'blob:http://localhost:5500/bbbb-2222';
  assert.equal(diffSnapshots(before, after).filter((x) => x.kind === 'attr').length, 0);
});
check('data: 이미지 바이트가 1% 안팎 흔들리면 통과시킨다(grain()이 Math.random을 쓴다)', () => {
  const before = clone(base()), after = clone(base());
  const k = Object.keys(before.elements)[1];
  before.elements[k].attrs.src = 'data:image/png;bytes=4433806';
  after.elements[k].attrs.src = 'data:image/png;bytes=4435294';
  assert.equal(diffSnapshots(before, after).filter((x) => x.kind === 'attr').length, 0);
});
check('data: 이미지가 사실상 비면(수십 KB로 급감) 반드시 잡는다', () => {
  const before = clone(base()), after = clone(base());
  const k = Object.keys(before.elements)[1];
  before.elements[k].attrs.src = 'data:image/png;bytes=4433806';
  after.elements[k].attrs.src = 'data:image/png;bytes=52000';
  assert.ok(diffSnapshots(before, after).some((x) => x.kind === 'attr' && x.prop === 'src'));
});
check('data: 이미지가 10% 이상 달라지면 잡는다', () => {
  const before = clone(base()), after = clone(base());
  const k = Object.keys(before.elements)[1];
  before.elements[k].attrs.src = 'data:image/png;bytes=4400000';
  after.elements[k].attrs.src = 'data:image/png;bytes=4900000';
  assert.ok(diffSnapshots(before, after).some((x) => x.kind === 'attr' && x.prop === 'src'));
});
check('일반 src(파일 경로)는 정규화 대상이 아니라 그대로 잡는다', () => {
  const before = clone(base()), after = clone(base());
  const k = Object.keys(before.elements)[1];
  after.elements[k].attrs.src = '/poster-wall-2.webp';
  assert.ok(diffSnapshots(before, after).some((x) => x.kind === 'attr' && x.prop === 'src'));
});

// 7) high가 하나라도 있으면 CLI가 실패(exit 1)해야 게이트로서 의미가 있다
check('high가 있으면 summarize가 high>0을 보고한다', () => {
  const after = clone(base());
  delete after.elements['#generateBtn'];
  assert.ok(summarize(diffSnapshots(base(), after)).high > 0);
});

console.log(failures === 0
  ? '\n✅ 자기검사 통과 — 이 도구는 빈 게이트가 아니다.'
  : `\n❌ 자기검사 실패 ${failures}건 — 이 상태의 "차이 0건"은 신뢰할 수 없다.`);
process.exit(failures === 0 ? 0 : 1);
