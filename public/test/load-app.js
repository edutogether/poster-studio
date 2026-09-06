// vitest 이전(2026-09-07) 테스트 하네스. 예전엔 Node의 vm.SourceTextModule로
// 직접 모듈 그래프를 링크·평가하는 손수 구현이었는데, vitest는 이미 자기만의
// ESM 모듈 레지스트리를 갖고 있어 그 위에서 똑같은 격리를 훨씬 단순하게 할 수
// 있다: vi.stubGlobal으로 document/window 등 브라우저 전역을 흉내낸 뒤,
// vi.resetModules()로 모듈 캐시를 비우고 실제 public/*.js를 동적 import한다.
// (jsdom은 일부러 안 썼다 — 이 손수 만든 가짜 document/canvas가 이미 필요한
// 만큼만 정확히 흉내내고 있고, jsdom은 캔버스를 지원하지 않아 어차피
// @napi-rs/canvas를 별도로 연결해야 하는 건 똑같다. 굳이 무거운 의존성을
// 더 들이는 대신 기존 zero-dependency 하네스를 그대로 살렸다.)
// state.js가 내보내는 state 객체는 모듈 그래프 전체가 같은 참조를 공유하므로
// (실제 브라우저의 ES모듈과 동일한 라이브 바인딩 성질), 이 객체 하나만 있으면
// __eval 같은 우회 없이도 캡처된 사진·재생성 횟수 등을 테스트에서 그대로
// 읽고 쓸 수 있다.
import { vi } from 'vitest';

/* measureText가 "글자 수 × 현재 폰트 크기 비례"로 너비를 흉내낸다 — 실제 폰트와
   글자 폭은 다르지만, "폰트를 줄이면 measureText 너비도 줄어든다"는 setFitFont/
   layoutTitle이 의존하는 유일한 성질만 정확히 재현하면 그 알고리즘을 검증하기에
   충분하다. */
class FakeCtx {
  constructor() {
    this.font = '16px sans-serif';
    this.fillStyle = '#000';
    this.strokeStyle = '#000';
    this.textAlign = 'left';
    this.textBaseline = 'alphabetic';
    this.lineWidth = 1;
    this.lineJoin = 'miter';
    this.globalAlpha = 1;
    this.shadowColor = 'transparent';
    this.shadowBlur = 0;
    this.globalCompositeOperation = 'source-over';
  }
  _fontPx() {
    const m = /([\d.]+)px/.exec(this.font);
    return m ? parseFloat(m[1]) : 16;
  }
  measureText(text) {
    return { width: (text ? text.length : 0) * this._fontPx() * 0.55 };
  }
  save() {}
  restore() {}
  fillRect() {}
  clearRect() {}
  beginPath() {}
  moveTo() {}
  lineTo() {}
  arc() {}
  arcTo() {}
  ellipse() {}
  closePath() {}
  clip() {}
  stroke() {}
  fill() {}
  fillText() {}
  strokeText() {}
  drawImage() {}
  scale() {}
  translate() {}
  rotate() {}
  createLinearGradient() { return { addColorStop() {} }; }
  createRadialGradient() { return { addColorStop() {} }; }
  createPattern() { return {}; }
  getImageData(w, h) { return { data: new Uint8ClampedArray((w || 1) * (h || 1) * 4) }; }
  putImageData() {}
  createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; }
}

function makeElement() {
  return {
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    style: {},
    dataset: {},
    children: [],
    onclick: null,
    onerror: null,
    onload: null,
    textContent: '',
    value: '',
    src: '',
    disabled: false,
    appendChild() {},
    remove() {},
    querySelectorAll: () => [],
    addEventListener() {}
  };
}

function makeCanvasElement() {
  const el = makeElement();
  el.width = 0;
  el.height = 0;
  el.getContext = () => new FakeCtx();
  el.toDataURL = () => 'data:image/png;base64,FAKE';
  return el;
}

class FakeImage {
  set src(_v) {
    queueMicrotask(() => { if (this.onload) this.onload(); });
  }
}

class FakeFormData {
  constructor() { this._entries = []; }
  append(name, value) { this._entries.push([name, value]); }
}

/* createRealCanvas: templates-canvas.test.js/favicon.test.js가 @napi-rs/canvas의
   createCanvas를 넘겨준다 — grain()이 만드는 오프스크린 캔버스가 진짜 캔버스
   ctx와 같은 구현체(realm)여야 createPattern()이 받아준다(가짜 캔버스 객체는
   타입 검사에서 거부됨). */
function makeFakeDocument(createRealCanvas) {
  const elements = new Map();
  return {
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(
          id,
          id === 'posterCanvas'
            ? (createRealCanvas ? createRealCanvas(1200, 1800) : makeCanvasElement())
            : makeElement()
        );
      }
      return elements.get(id);
    },
    createElement(tag) {
      if (tag !== 'canvas') return makeElement();
      return createRealCanvas ? createRealCanvas(1, 1) : makeCanvasElement();
    },
    fonts: { load: async () => {}, ready: Promise.resolve() },
    addEventListener() {},
    querySelector: () => null,
    head: { appendChild() {} },
    body: { appendChild() {} },
    visibilityState: 'visible',
    hasFocus: () => true
  };
}

/* public/*.js는 브라우저 전역(document/window/navigator/fetch/...)에 직접
   의존하는 classic 코드가 아니라 진짜 ES모듈이지만, 여전히 실행 시점에는
   이 전역들을 참조한다 — vi.stubGlobal으로 이 전역들을 흉내낸 뒤 실제
   app.js(및 그 의존 그래프)를 동적 import해서 진짜 프로덕션 코드를 그대로
   실행시킨다. loadApp()을 호출할 때마다 vi.resetModules()로 모듈 캐시를
   새로 시작해(=이번 호출의 import들만의 새 모듈 인스턴스) 테스트 간 상태가
   절대 새지 않게 한다. */
export async function loadApp({ createRealCanvas } = {}) {
  const document = makeFakeDocument(createRealCanvas);
  const windowStub = {
    addEventListener() {},
    print() {}
  };

  vi.stubGlobal('document', document);
  vi.stubGlobal('window', windowStub);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) } });
  vi.stubGlobal('fetch', async () => { throw new Error('네트워크 사용 안 함(테스트 환경)'); });
  vi.stubGlobal('Image', FakeImage);
  vi.stubGlobal('FormData', FakeFormData);
  // URL 자체를 통째로 갈아치우면 vite/vitest 내부(모듈 해석 등)가 쓰는 진짜
  // `new URL(...)` 생성자가 깨진다(실제로 겪음: "URL is not a constructor") —
  // 진짜 URL 클래스는 그대로 두고, camera.js가 쓰는 두 정적 메서드만 흉내낸다.
  URL.createObjectURL = () => 'blob:fake';
  URL.revokeObjectURL = () => {};

  vi.resetModules();

  const [appMod, stateMod, constantsMod, domMod, layoutMod, templatesMod, apiMod, faviconMod] = await Promise.all([
    import('../app.js'),
    import('../state.js'),
    import('../constants.js'),
    import('../dom.js'),
    import('../layout.js'),
    import('../templates.js'),
    import('../api.js'),
    import('../favicon.js')
  ]);

  const flat = { document };
  Object.assign(flat, stateMod, constantsMod, domMod, layoutMod, templatesMod, apiMod, faviconMod, appMod);

  // app.fetch = mockFn 같은 기존 테스트 패턴이 실제 전역 fetch(=api.js가 호출을
  // 읽어들이는 그 fetch)를 바꾸도록, 단순 값 복사가 아니라 getter/setter로
  // globalThis.fetch에 그대로 연결한다.
  Object.defineProperty(flat, 'fetch', {
    get: () => globalThis.fetch,
    set: (v) => { globalThis.fetch = v; },
    enumerable: true,
    configurable: true
  });

  return flat;
}

export { FakeCtx };
