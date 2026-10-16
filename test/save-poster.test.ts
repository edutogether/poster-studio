// @vitest-environment jsdom
/* 휴대폰 3단계 «내 휴대폰에 저장»(2026-10-17 ⑪): 파일 공유가 되면 공유, 안 되면 PNG 내려받기, 공유 창을 닫으면 아무것도 안 한다. */
import { afterEach, describe, expect, test, vi } from 'vitest';
import { posterFileName, savePoster } from '../src/savePoster.js';

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
  test('파일 공유가 되면 사진 앱으로 공유하고 내려받지 않는다', async () => {
    const share = vi.fn(async () => {});
    Object.assign(navigator, { canShare: () => true, share });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    expect(await savePoster(canvas(), '우리의 별')).toBe('shared');
    const files = (share.mock.calls[0] as unknown as [{ files: File[] }])[0].files;
    expect(files[0].name).toBe('Poster Studio_우리의 별.png');
    expect(files[0].type).toBe('image/png');
    expect(click).not.toHaveBeenCalled();
  });

  test('공유 창을 닫으면 내려받기로 넘어가지 않는다', async () => {
    Object.assign(navigator, { canShare: () => true, share: async () => { throw new DOMException('닫음', 'AbortError'); } });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    expect(await savePoster(canvas(), '우리의 별')).toBe('cancelled');
    expect(click).not.toHaveBeenCalled();
  });

  test('공유를 못 하는 브라우저는 같은 이름의 PNG로 내려받는다', async () => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:poster', revokeObjectURL: () => {} }));
    let name = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { name = this.download; });
    expect(await savePoster(canvas(), '우리의 별')).toBe('downloaded');
    expect(name).toBe('Poster Studio_우리의 별.png');
  });

  test('공유가 실패하면(취소가 아니면) 내려받기로 넘어간다', async () => {
    Object.assign(navigator, { canShare: () => true, share: async () => { throw new Error('권한 없음'); } });
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:poster', revokeObjectURL: () => {} }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    expect(await savePoster(canvas(), '우리의 별')).toBe('downloaded');
    expect(click).toHaveBeenCalledTimes(1);
  });
});
