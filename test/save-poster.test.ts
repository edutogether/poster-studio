// @vitest-environment jsdom
/* 휴대폰 3단계 «내 휴대폰에 저장»(2026-10-17 ⑪): 파일 공유가 되면 공유, 안 되면 PNG 내려받기, 공유 창을 닫으면 아무것도 안 한다.
   10/20부터 공유는 아이폰 · 아이패드만 — 안드로이드 · PC는 공유가 되더라도 바로 내려받는다. */
import { afterEach, describe, expect, test, vi } from 'vitest';
import { posterFileName, savePlatform, savePoster } from '../src/savePoster.js';

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  galaxyChrome: 'Mozilla/5.0 (Linux; Android 15; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 15; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
};

describe('기기 가르기', () => {
  test('아이폰 · 아이패드(맥 UA + 터치)는 공유, 안드로이드(크롬 · 삼성 인터넷)는 안드로이드, 윈도 · 맥은 PC', () => {
    expect(savePlatform(UA.iphone, 5)).toBe('ios');
    expect(savePlatform(UA.ipad, 5)).toBe('ios');
    expect(savePlatform(UA.galaxyChrome, 5)).toBe('android');
    expect(savePlatform(UA.samsung, 5)).toBe('android');
    expect(savePlatform(UA.windows, 0)).toBe('desktop');
    expect(savePlatform(UA.windows, 10)).toBe('desktop');
    expect(savePlatform(UA.mac, 0)).toBe('desktop');
  });
});

const canvas = () => ({ toBlob: (cb: BlobCallback) => cb(new Blob(['png'], { type: 'image/png' })) }) as unknown as HTMLCanvasElement;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const key of ['canShare', 'share'] as const) delete (navigator as unknown as Record<string, unknown>)[key];
});

describe('파일 이름', () => {
  test('앱 이름 규칙 «Poster Studio_영화제목.png» — 쓸 수 없는 글자는 지우고, 비면 기본 제목', () => {
    expect(posterFileName('별을 찾는 아이')).toBe('Poster Studio_별을 찾는 아이.png');
    expect(posterFileName('  우리/별:빛*?  ')).toBe('Poster Studio_우리 별 빛.png');
    expect(posterFileName('   ')).toBe('Poster Studio_별을 찾는 아이.png');
  });
});

describe('저장', () => {
  test('아이폰은 파일 공유가 되면 사진 앱으로 공유하고 내려받지 않는다', async () => {
    const share = vi.fn(async () => {});
    Object.assign(navigator, { canShare: () => true, share });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    expect(await savePoster(canvas(), '우리의 별', 'ios')).toBe('shared');
    const files = (share.mock.calls[0] as unknown as [{ files: File[] }])[0].files;
    expect(files[0].name).toBe('Poster Studio_우리의 별.png');
    expect(files[0].type).toBe('image/png');
    expect(click).not.toHaveBeenCalled();
  });

  test('공유 창을 닫으면 내려받기로 넘어가지 않는다', async () => {
    Object.assign(navigator, { canShare: () => true, share: async () => { throw new DOMException('닫음', 'AbortError'); } });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    expect(await savePoster(canvas(), '우리의 별', 'ios')).toBe('cancelled');
    expect(click).not.toHaveBeenCalled();
  });

  test('공유를 못 하는 브라우저는 같은 이름의 PNG로 내려받는다', async () => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:poster', revokeObjectURL: () => {} }));
    let name = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { name = this.download; });
    expect(await savePoster(canvas(), '우리의 별', 'ios')).toBe('downloaded');
    expect(name).toBe('Poster Studio_우리의 별.png');
  });

  test('안드로이드 · PC는 공유가 되더라도 공유 창을 띄우지 않고 바로 내려받는다', async () => {
    const share = vi.fn(async () => {});
    Object.assign(navigator, { canShare: () => true, share });
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:poster', revokeObjectURL: () => {} }));
    const names: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { names.push(this.download); });
    expect(await savePoster(canvas(), '우리의 별', 'android')).toBe('downloaded');
    expect(await savePoster(canvas(), '우리의 별', 'desktop')).toBe('downloaded');
    expect(share).not.toHaveBeenCalled();
    expect(names).toEqual(['Poster Studio_우리의 별.png', 'Poster Studio_우리의 별.png']);
  });

  test('공유가 실패하면(취소가 아니면) 내려받기로 넘어간다', async () => {
    Object.assign(navigator, { canShare: () => true, share: async () => { throw new Error('권한 없음'); } });
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:poster', revokeObjectURL: () => {} }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    expect(await savePoster(canvas(), '우리의 별', 'ios')).toBe('downloaded');
    expect(click).toHaveBeenCalledTimes(1);
  });
});
