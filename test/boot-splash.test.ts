// @vitest-environment jsdom
/* ────────────────────────────────────────────────────────────────────
   부트 스플래시의 글꼴 게이트(2026-10-09, 2026-10-10 스플래시보다 먼저 돌게 옮김) — public/splash-font-gate.js.
   스플래시 글꼴(Studio 800·400)이 아직 없으면 <html>.splash-fonts-wait로 스플래시 내용을 숨기고 시계를 멈췄다가,
   글꼴이 오면 뗀다. 막히는 쪽으로 실패하면 안 된다 — 글꼴이 끝내 안 와도 3초 뒤에는 떼고,
   글꼴 API가 없으면 아예 붙이지 않는다.
   🔴 자리도 검사한다: 게이트가 스플래시 마크업 **뒤**에 있으면 스크립트가 늦게 올 때 게이트보다 먼저 한두 프레임이
   그려진다(2026-10-10 로컬 녹화로 확인한 바로 그 결함). 라이브 실측은 scripts/verify/splash-live.mjs.
   ──────────────────────────────────────────────────────────────────── */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const GATE = fs.readFileSync(path.join(ROOT, 'public/splash-font-gate.js'), 'utf8');
const BOOT = fs.readFileSync(path.join(ROOT, 'public/boot-splash.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'src/studio/splash.css'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function installFonts(loaded: boolean, load: () => Promise<unknown>) {
  const check = vi.fn(() => loaded);
  Object.defineProperty(document, 'fonts', { configurable: true, value: { check, load: vi.fn(load) } });
  return check;
}
const waiting = () => document.documentElement.classList.contains('splash-fonts-wait');
const run = () => new Function(GATE)();

beforeEach(() => {
  document.documentElement.className = '';
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  delete (document as { fonts?: unknown }).fonts;
});

describe('스플래시 글꼴 게이트', () => {
  test('글꼴이 아직 없으면 <html>에 붙여 내용을 숨기고, 두 굵기가 오면 뗀다', async () => {
    let arrive!: () => void;
    const both = new Promise<void>((resolve) => { arrive = resolve; });
    const check = installFonts(false, () => both);
    run();
    expect(check).toHaveBeenCalledWith('800 1em Studio');
    expect(waiting()).toBe(true);
    expect((document.fonts.load as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])).toEqual(['800 1em Studio', '400 1em Studio']);
    arrive();
    await vi.advanceTimersByTimeAsync(0);
    expect(waiting()).toBe(false);
  });

  test('글꼴이 이미 있으면(재방문) 아무것도 붙이지 않는다', () => {
    installFonts(true, () => Promise.resolve([]));
    run();
    expect(waiting()).toBe(false);
    expect(document.fonts.load).not.toHaveBeenCalled();
  });

  test('글꼴이 끝내 안 와도 3초 뒤에는 뗀다(막히지 않는다)', async () => {
    installFonts(false, () => new Promise(() => {}));
    run();
    await vi.advanceTimersByTimeAsync(2999);
    expect(waiting()).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(waiting()).toBe(false);
  });

  test('글꼴을 받다 실패해도 뗀다', async () => {
    installFonts(false, () => Promise.reject(new Error('네트워크')));
    run();
    await vi.advanceTimersByTimeAsync(0);
    expect(waiting()).toBe(false);
  });

  test('글꼴 API가 없는 브라우저에서는 붙이지 않는다', () => {
    run();
    expect(waiting()).toBe(false);
  });

  test('CSS: 기다리는 동안 내용을 숨기고 유지·로고·막대 시계를 모두 멈춘다', () => {
    expect(CSS).toMatch(/\.splash-fonts-wait #splash > \*\s*\{\s*visibility: hidden;/);
    const paused = CSS.match(/([^{}]+)\{\s*animation-play-state: paused;\s*\}/g)!.join('\n');
    for (const sel of ['.splash-fonts-wait #splash,', '.splash-fonts-wait #splash .logo,', '.splash-fonts-wait #splash .sbar i']) expect(paused).toContain(sel);
  });

  test('자리: 게이트는 파일로(인라인 아님) <body>의 첫 요소이고 스플래시보다 앞이며, 게이트는 한 곳에만 있다', () => {
    // 문자열을 다듬지 않고 문서 구조로 읽는다(주석은 요소가 아니라 저절로 빠진다)
    const doc = new DOMParser().parseFromString(HTML, 'text/html');
    const first = doc.body.firstElementChild as HTMLScriptElement;
    expect(first.tagName).toBe('SCRIPT');
    expect(first.getAttribute('src')).toBe('/splash-font-gate.js');
    expect(first.textContent).toBe('');   // 인라인이 아니다(CSP script-src 'self')
    const splash = doc.getElementById('splash')!;
    expect(first.compareDocumentPosition(splash) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();   // 그 앞에 그려질 것이 없다
    expect([...doc.querySelectorAll('script[src="/splash-font-gate.js"]')]).toHaveLength(1);
    expect(BOOT).not.toMatch(/fonts-wait|document\.fonts/);
  });
});
