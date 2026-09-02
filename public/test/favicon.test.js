// favicon.js는 진짜 캔버스 픽셀 desaturate 로직(toGrayscale)을 갖고 있어
// FakeCtx(항상 같은 fake toDataURL 반환)로는 검증할 수 없다 — 실제 캔버스
// 파이프라인을 쓰는 templates-canvas.test.js와 같은 방식(@napi-rs/canvas)을 쓴다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { loadApp } from './load-app.js';

test('renderColorFavicon: 64x64 캔버스에 이모지를 그려 데이터URL을 만든다', async () => {
  const app = await loadApp({ createRealCanvas: createCanvas });
  const canvas = app.renderColorFavicon();
  assert.equal(canvas.width, 64);
  assert.equal(canvas.height, 64);
});

test('toGrayscale: RGB 픽셀을 휘도 공식으로 desaturate한다(R=G=B가 되고, 원래 밝기 근처로 남는다)', async () => {
  const app = await loadApp({ createRealCanvas: createCanvas });
  const canvas = app.renderColorFavicon();
  const ctx = canvas.getContext('2d');
  const before = ctx.getImageData(0, 0, canvas.width, canvas.height);
  // 순수 빨강 픽셀 하나를 심어서 desaturate 공식이 실제로 적용되는지 검증한다.
  before.data[0] = 200; before.data[1] = 0; before.data[2] = 0; before.data[3] = 255;
  ctx.putImageData(before, 0, 0);

  const gray = app.toGrayscale(canvas);
  const after = gray.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  const expected = Math.round(200 * 0.299);
  assert.equal(after.data[0], after.data[1], 'R과 G가 같아야 한다(무채색)');
  assert.equal(after.data[1], after.data[2], 'G와 B가 같아야 한다(무채색)');
  assert.equal(after.data[0], expected, '휘도 공식(R*0.299)대로 desaturate돼야 한다');
});

test('updateFavicon: visibilityState/hasFocus 조합에 따라 올바른 아이콘 상수(COLOR_ICON/GRAY_ICON)를 고른다', async () => {
  // 헤드리스 캔버스(@napi-rs/canvas)엔 컬러 이모지 글꼴이 없어 렌더된 픽셀 자체는
  // 늘 비어있다 — 그래서 여기서는 "실제로 다른 그림이 나오는가"가 아니라
  // "updateFavicon이 상태에 따라 올바른 분기(활성→컬러/비활성→흑백)를 타는가"를
  // 검증한다. desaturate 공식 자체의 정확성은 위 toGrayscale 테스트가 이미 검증한다.
  const app = await loadApp({ createRealCanvas: createCanvas });
  const link = { rel: '', href: '' };
  app.document.querySelector = () => link;

  app.document.visibilityState = 'visible';
  app.document.hasFocus = () => true;
  app.updateFavicon();
  assert.equal(link.href, app.COLOR_ICON);

  app.document.hasFocus = () => false;
  app.updateFavicon();
  assert.equal(link.href, app.GRAY_ICON);

  app.document.hasFocus = () => true;
  app.document.visibilityState = 'hidden';
  app.updateFavicon();
  assert.equal(link.href, app.GRAY_ICON, '탭이 안 보이면 포커스가 있어도 흑백이어야 한다');
});
