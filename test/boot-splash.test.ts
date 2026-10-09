// @vitest-environment jsdom
/* ────────────────────────────────────────────────────────────────────
   부트 스플래시의 글꼴 게이트(2026-10-09) — public/boot-splash.js.
   스플래시 글꼴(Studio 800·400)이 아직 없으면 .fonts-wait로 내용을 숨기고 시계를 멈췄다가,
   글꼴이 오면 뗀다. 막히는 쪽으로 실패하면 안 된다 — 글꼴이 끝내 안 와도 3초 뒤에는 떼고,
   글꼴 API가 없으면 아예 붙이지 않는다. 라이브 실측은 scripts/verify/splash-live.mjs.
   ──────────────────────────────────────────────────────────────────── */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(path.join(process.cwd(), 'public/boot-splash.js'), 'utf8');
const CSS = fs.readFileSync(path.join(process.cwd(), 'src/studio/splash.css'), 'utf8');

function installFonts(loaded: boolean, load: () => Promise<unknown>) {
  const check = vi.fn(() => loaded);
  Object.defineProperty(document, 'fonts', { configurable: true, value: { check, load: vi.fn(load) } });
  return check;
}
const splash = () => document.getElementById('splash')!;
const run = () => new Function(SRC)();

beforeEach(() => {
  document.body.className = '';
  document.body.innerHTML = '<div id="splash"><div class="name">InKY Poster Studio</div></div>';
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  delete (document as { fonts?: unknown }).fonts;
});

describe('부트 스플래시 글꼴 게이트', () => {
  test('글꼴이 아직 없으면 내용을 숨기고, 두 굵기가 오면 뗀다', async () => {
    let arrive!: () => void;
    const both = new Promise<void>((resolve) => { arrive = resolve; });
    const check = installFonts(false, () => both);
    run();
    expect(check).toHaveBeenCalledWith('800 1em Studio');
    expect(splash().classList.contains('fonts-wait')).toBe(true);
    expect((document.fonts.load as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])).toEqual(['800 1em Studio', '400 1em Studio']);
    arrive();
    await vi.advanceTimersByTimeAsync(0);
    expect(splash().classList.contains('fonts-wait')).toBe(false);
  });

  test('글꼴이 이미 있으면(재방문) 아무것도 붙이지 않는다', () => {
    installFonts(true, () => Promise.resolve([]));
    run();
    expect(splash().classList.contains('fonts-wait')).toBe(false);
    expect(document.fonts.load).not.toHaveBeenCalled();
  });

  test('글꼴이 끝내 안 와도 3초 뒤에는 뗀다(막히지 않는다)', async () => {
    installFonts(false, () => new Promise(() => {}));
    run();
    await vi.advanceTimersByTimeAsync(2999);
    expect(splash().classList.contains('fonts-wait')).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(splash().classList.contains('fonts-wait')).toBe(false);
  });

  test('글꼴을 받다 실패해도 뗀다', async () => {
    installFonts(false, () => Promise.reject(new Error('네트워크')));
    run();
    await vi.advanceTimersByTimeAsync(0);
    expect(splash().classList.contains('fonts-wait')).toBe(false);
  });

  test('글꼴 API가 없는 브라우저에서는 붙이지 않는다', () => {
    run();
    expect(splash().classList.contains('fonts-wait')).toBe(false);
  });

  test('CSS: 기다리는 동안 내용을 숨기고 유지·로고·막대 시계를 모두 멈춘다', () => {
    expect(CSS).toMatch(/#splash\.fonts-wait > \*\s*\{\s*visibility: hidden;/);
    const paused = CSS.match(/([^{}]+)\{\s*animation-play-state: paused;\s*\}/g)!.join('\n');
    for (const sel of ['#splash.fonts-wait,', '#splash.fonts-wait .logo,', '#splash.fonts-wait .sbar i']) expect(paused).toContain(sel);
  });
});
