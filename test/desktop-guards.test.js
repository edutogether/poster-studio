/* 설치판 방어층(desktop/guards.mjs, 2026-11-02 종합감사) — Electron 없이 판정을 그대로 시험한다.
   앱 주소 서빙(web 밖 경로 404 · 부분 요청 206 · 416), 바깥 요청 차단, 권한(카메라 영상만), 이동 · 새 창.
   각 방어를 일부러 빼면 아래 시험이 빨간불이 되는 것을 확인했다(11/2 — 16가지, 커밋 메시지에 목록). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import {
  ORIGIN, CSP, BLOCKED_URLS, isAppUrl, appFilePath, byteRange, createAppServer,
  allowPermissionRequest, allowPermissionCheck, lockDownSession, windowOpenAction,
} from '../desktop/guards.mjs';

let root, web, serve;
const VIDEO = Buffer.from(Array.from({ length: 100 }, (_, i) => i));
beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-guards-'));
  web = path.join(root, 'web');
  fs.mkdirSync(path.join(web, 'studio'), { recursive: true });
  fs.writeFileSync(path.join(web, 'index.html'), '<!doctype html>');
  fs.writeFileSync(path.join(web, 'studio', 'clip.mp4'), VIDEO);
  fs.writeFileSync(path.join(web, 'data.bin'), 'x');
  // web 바로 옆 폴더 — «web-evil»은 «web»으로 시작하지만 web 안이 아니다
  fs.mkdirSync(path.join(root, 'web-evil'));
  fs.writeFileSync(path.join(root, 'web-evil', 'secret.txt'), 'secret');
  fs.writeFileSync(path.join(root, 'secret.txt'), 'secret');
  serve = createAppServer(web);
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

const get = (url, range) => serve(new Request(url, range ? { headers: { range } } : {}));

describe('앱 주소 서빙 — web 안 파일만', () => {
  test('app://studio/ 는 index.html, 화면 정책 · nosniff · 부분 요청 가능 머리글을 단다', async () => {
    const res = await get(`${ORIGIN}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('<!doctype html>');
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(res.headers.get('content-security-policy')).toBe(CSP);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
  });

  test('화면 정책은 바깥 주소로 연결하지 않는다(connect-src self · object none · frame-ancestors none)', () => {
    expect(CSP).toMatch(/connect-src 'self';/);
    expect(CSP).not.toMatch(/https?:/);
    expect(CSP).toMatch(/object-src 'none'/);
    expect(CSP).toMatch(/frame-ancestors 'none'/);
  });

  test('영상 · 모르는 확장자의 형식', async () => {
    expect((await get(`${ORIGIN}/studio/clip.mp4`)).headers.get('content-type')).toBe('video/mp4');
    expect((await get(`${ORIGIN}/data.bin`)).headers.get('content-type')).toBe('application/octet-stream');
  });

  test.each([
    ['..%2Fsecret.txt'],
    ['..%2F..%2Fsecret.txt'],
    ['%2e%2e%2fsecret.txt'],
    ['studio%2F..%2F..%2Fsecret.txt'],
    ['..%2Fweb-evil%2Fsecret.txt'],   // web으로 시작하는 옆 폴더(«web-evil») — 경로 구분자까지 맞춰야 막힌다
  ])('web 밖으로 나가는 경로 %s 는 404 — 파일을 읽지도 않는다', async (rel) => {
    expect(appFilePath(web, `${ORIGIN}/${rel}`)).toBeNull();
    const res = await get(`${ORIGIN}/${rel}`);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('');
  });

  test('다른 호스트(app://evil/)는 404 · 없는 파일은 404', async () => {
    expect((await get('app://evil/index.html')).status).toBe(404);
    expect((await get(`${ORIGIN}/nope.html`)).status).toBe(404);
  });
});

describe('부분 요청(Range) — 영상', () => {
  test.each([
    ['bytes=0-9', 0, 9],
    ['bytes=90-', 90, 99],
    ['bytes=-10', 90, 99],
    ['bytes=95-200', 95, 99],   // 끝이 넘치면 파일 끝까지
    ['bytes=-500', 0, 99],      // 뒤에서 N이 파일보다 크면 처음부터
  ])('%s → 206 · %i-%i', async (range, start, end) => {
    const res = await get(`${ORIGIN}/studio/clip.mp4`, range);
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe(`bytes ${start}-${end}/100`);
    expect(Buffer.from(await res.arrayBuffer())).toEqual(VIDEO.subarray(start, end + 1));
    expect(res.headers.get('content-security-policy')).toBe(CSP);
  });

  test.each([['bytes=100-'], ['bytes=50-40'], ['bytes=-0'], ['bytes=1000-2000']])('%s → 416 · bytes */100', async (range) => {
    const res = await get(`${ORIGIN}/studio/clip.mp4`, range);
    expect(res.status).toBe(416);
    expect(res.headers.get('content-range')).toBe('bytes */100');
    expect(await res.arrayBuffer()).toHaveProperty('byteLength', 0);
  });

  test.each([['bytes=-'], ['bytes=0-9,20-29'], ['items=0-9'], ['']])('모양이 다른 %j 는 전체 200', async (range) => {
    const res = await get(`${ORIGIN}/studio/clip.mp4`, range);
    expect(res.status).toBe(200);
    expect((await res.arrayBuffer()).byteLength).toBe(100);
    expect(byteRange(range, 100)).toBeNull();
  });
});

describe('바깥 요청 차단 · 권한', () => {
  // Electron 거르개 «<scheme>://*/*»가 그 주소를 잡는가 — 모양이 그것뿐이라 계획만 본다
  const caught = (url) => BLOCKED_URLS.some((pattern) => url.startsWith(pattern.replace('*/*', '')));
  test.each([['http://example.com/'], ['https://poster.edutogether.kr/generate'], ['ws://127.0.0.1:9/'], ['wss://example.com/socket']])('%s 요청은 끊는다', (url) => {
    expect(caught(url)).toBe(true);
  });

  const fakeSession = () => {
    const ses = { requestFilter: null, onRequest: null, request: null, check: null };
    ses.webRequest = { onBeforeRequest: (filter, listener) => { ses.requestFilter = filter; ses.onRequest = listener; } };
    ses.setPermissionRequestHandler = (handler) => { ses.request = handler; };
    ses.setPermissionCheckHandler = (handler) => { ses.check = handler; };
    return ses;
  };

  test('세션 잠그기: 거르개에 걸린 요청은 모두 cancel, 권한 판정이 걸린다', () => {
    const ses = fakeSession();
    lockDownSession(ses);
    expect(ses.requestFilter).toEqual({ urls: BLOCKED_URLS });
    let answer;
    ses.onRequest({ url: 'https://example.com/' }, (a) => { answer = a; });
    expect(answer).toEqual({ cancel: true });
    const asked = (permission, details) => { let ok; ses.request(null, permission, (v) => { ok = v; }, details); return ok; };
    expect(asked('media', { mediaTypes: ['video'], requestingUrl: `${ORIGIN}/` })).toBe(true);
    expect(asked('media', { mediaTypes: ['video', 'audio'], requestingUrl: `${ORIGIN}/` })).toBe(false);
    expect(ses.check(null, 'media', ORIGIN)).toBe(true);
    expect(ses.check(null, 'geolocation', ORIGIN)).toBe(false);
  });

  test.each([
    ['media', ['video'], `${ORIGIN}/`, true],
    ['media', ['video'], `${ORIGIN}/privacy.html`, true],
    ['media', ['video', 'audio'], `${ORIGIN}/`, false],   // 마이크가 섞이면 거절
    ['media', ['audio'], `${ORIGIN}/`, false],
    ['media', [], `${ORIGIN}/`, false],
    ['media', undefined, `${ORIGIN}/`, false],
    ['media', ['video'], 'https://example.com/', false],
    ['media', ['video'], 'app://studio.evil/', false],
    ['media', ['video'], ORIGIN, false],                  // «app://studio/»로 시작해야 한다
    ['media', ['video'], undefined, false],
    ['geolocation', undefined, `${ORIGIN}/`, false],
    ['notifications', undefined, `${ORIGIN}/`, false],
    ['clipboard-read', undefined, `${ORIGIN}/`, false],
  ])('권한 요청 %s %j (%s) → %s', (permission, mediaTypes, requestingUrl, expected) => {
    expect(allowPermissionRequest(permission, { mediaTypes, requestingUrl })).toBe(expected);
  });

  test.each([
    ['media', ORIGIN, true],
    ['media', 'https://example.com', false],
    ['media', 'app://studio.evil', false],
    ['geolocation', ORIGIN, false],
  ])('권한 확인 %s (%s) → %s', (permission, origin, expected) => {
    expect(allowPermissionCheck(permission, origin)).toBe(expected);
  });
});

describe('이동 · 새 창', () => {
  test.each([
    [`${ORIGIN}/`, true],
    [`${ORIGIN}/privacy.html`, true],
    [ORIGIN, false],
    ['app://studio.evil/', false],
    ['https://poster.edutogether.kr/', false],
    ['file:///C:/Windows/win.ini', false],
    [undefined, false],
  ])('앱 안 주소인가 %s → %s', (url, expected) => {
    expect(isAppUrl(url)).toBe(expected);
  });

  test.each([
    [`${ORIGIN}/privacy.html`, 'app'],
    ['https://poster.edutogether.kr/privacy.html', 'external'],
    ['http://example.com/', 'deny'],
    ['file:///C:/Windows/win.ini', 'deny'],
    ['javascript:alert(1)', 'deny'],
    ['app://studio.evil/', 'deny'],
  ])('새 창 %s → %s', (url, expected) => {
    expect(windowOpenAction(url)).toBe(expected);
  });
});

describe('main.mjs가 방어층을 실제로 쓴다', () => {
  const main = fs.readFileSync('desktop/main.mjs', 'utf8');
  test('세션 잠그기 · 앱 주소 응답기 · 이동 · 새 창 판정을 건다', () => {
    expect(main).toMatch(/protocol\.handle\('app', createAppServer\(WEB\)\)/);
    expect(main).toMatch(/lockDownSession\(session\.defaultSession\)/);
    expect(main).toMatch(/'will-navigate', \(event, url\) => \{\s*if \(!isAppUrl\(url\)\) event\.preventDefault\(\);/);
    expect(main).toMatch(/'will-attach-webview', \(event\) => event\.preventDefault\(\)/);
    expect(main).toMatch(/windowOpenAction\(url\)/);
  });
  test('main.mjs가 불러오는 같은 폴더 파일은 모두 설치 파일에 들어간다(desktop/package.json build.files)', () => {
    const files = JSON.parse(fs.readFileSync('desktop/package.json', 'utf8')).build.files;
    const local = [...main.matchAll(/from '\.\/([^']+)'/g)].map((m) => m[1]);
    expect(local.length).toBeGreaterThan(0);
    for (const file of local) expect(files).toContain(file);
  });
});
