// public/app.js는 모듈이 아니라 <script src> 로만 로드되는 평범한 브라우저 스크립트다.
// export가 없으므로, 실제 브라우저 API 없이 Node에서 그대로 실행해 top-level
// function 선언(hoist되어 전역 객체 속성이 됨)들을 꺼내 쓰기 위한 최소한의 가짜
// document/window/canvas 환경을 vm 샌드박스로 만든다. 외부 패키지(jsdom, canvas 등)
// 없이 zero-dependency로 유지한다 — canvas 네이티브 바이너리는 이 환경(Windows,
// Visual C++ 빌드툴 없음)에서 설치가 안 됐고, 텍스트 레이아웃 "계산" 로직 검증에는
// 실제 폰트 렌더링이 필요 없다(measureText를 텍스트 길이 비례로 흉내내는 것으로 충분).
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_JS_PATH = path.join(__dirname, '..', 'app.js');

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

/* app.js 소스를 읽어 최소 가짜 DOM 환경에서 실행하고, top-level function 선언들이
   담긴 샌드박스(전역 객체 역할)를 돌려준다. */
export function loadApp() {
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, id === 'posterCanvas' ? makeCanvasElement() : makeElement());
      }
      return elements.get(id);
    },
    createElement(tag) {
      return tag === 'canvas' ? makeCanvasElement() : makeElement();
    },
    fonts: { load: async () => {}, ready: Promise.resolve() },
    addEventListener() {},
    querySelector: () => makeElement()
  };

  const sandbox = {
    document,
    navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) } },
    fetch: async () => { throw new Error('네트워크 사용 안 함(테스트 환경)'); },
    AbortController: globalThis.AbortController,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
    queueMicrotask: globalThis.queueMicrotask,
    console,
    Math,
    Date,
    Image: FakeImage,
    URL: { createObjectURL: () => 'blob:fake', revokeObjectURL() {} },
    addEventListener() {}
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const context = vm.createContext(sandbox);
  const code = fs.readFileSync(APP_JS_PATH, 'utf8');
  vm.runInContext(code, context, { filename: 'app.js' });
  return sandbox;
}

export { FakeCtx };
