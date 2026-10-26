import { test, expect } from 'vitest';
import fs from 'node:fs';
import crypto from 'node:crypto';
import manifest from '../src/studio/waiting-videos.json';
import { waitingSets } from '../src/studio/waitingSets.js';
import { hostingCacheControl } from '../scripts/verify/hosting-glob.mjs';

// 대기 영상 12편(2026-10-12 Bumm님 «앱 장착»). 목록·파일·정지 그림이 서로 맞는지 고정한다.
// 파일은 scripts/media/encode-waiting-videos.py가 만든다 — 다시 만들면 해시가 바뀌므로 목록을 그 출력으로 바꾼다.
// 2026-10-26: 앱은 느린 와이파이용으로 다시 인코딩한 waiting-v3(CRF 22)을 쓴다. 10/12 승인본 waiting-v2는 기록으로 그대로 둔다(고치거나 지우지 않는다).
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

test('목록은 01~12 열두 편이고 모두 승인된 파일을 가리킨다', () => {
  expect(manifest.map(entry => entry.id)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
  for (const entry of manifest) {
    const nn = String(entry.id).padStart(2, '0');
    expect(entry.status).toBe('approved');
    expect(entry.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(entry.src).toBe(`/studio/waiting-v3/${nn}-${entry.sha256.slice(0, 12)}.mp4`);
    expect(entry.still).toBe(`/studio/waiting-v3/${nn}.webp`);
  }
});

test('영상 파일은 목록의 해시·크기와 같고, 한 편씩 받을 만한 크기(3MB 이하)의 mp4다', () => {
  for (const entry of manifest) {
    const file = 'public' + entry.src;
    const bytes = fs.readFileSync(file);
    expect(sha(file)).toBe(entry.sha256);
    expect(bytes.length).toBe(entry.bytes);
    expect(bytes.length).toBeLessThanOrEqual(3 * 1024 * 1024);
    expect(bytes.subarray(4, 8).toString('latin1')).toBe('ftyp');   // mp4 상자 머리
  }
});

test('대기 화면의 정지 그림은 그 편 영상의 첫 프레임 그림(목록의 해시)이다 — 정지 그림 → 영상이 튀지 않게', () => {
  for (const scene of waitingSets) {
    const entry = manifest.find(item => item.id === scene.id);
    expect(scene.image).toBe(entry.still);
    expect(sha('public' + scene.image)).toBe(entry.stillSha256);
  }
});

test('목록에 없는 파일이 폴더에 남아 있지 않다(옛 판이 함께 배포되지 않게)', () => {
  const expected = new Set(manifest.flatMap(entry => [entry.src, entry.still].map(path => path.split('/').pop())));
  expect(new Set(fs.readdirSync('public/studio/waiting-v3'))).toEqual(expected);
});

test('대기 영상은 1년 immutable로 서빙되고, 이름이 고정인 정지 그림은 그 규칙에 걸리지 않는다(2026-10-26)', () => {
  // 이름에 내용 해시가 있는 파일만 오래 둔다 — 정지 그림까지 걸리면 영상을 바꿨을 때 옛 첫 프레임이 1년 남아 넘어가는 순간 튄다
  const rules = JSON.parse(fs.readFileSync('firebase.json', 'utf8')).hosting.headers;
  for (const entry of manifest) {
    expect(hostingCacheControl(rules, entry.src)).toBe('public, max-age=31536000, immutable');
    expect(hostingCacheControl(rules, entry.still)).toBeUndefined();
  }
  expect(hostingCacheControl(rules, '/studio/waiting-approved-v1/01.webp')).toBeUndefined();
});
