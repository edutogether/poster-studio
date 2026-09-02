// ES모듈 전환(2026-08-30) 이후의 테스트 하네스. public/*.js는 이제 진짜
// import/export를 쓰는 ES모듈이라 예전처럼 여러 <script> 파일을 순서대로
// 한 vm 컨텍스트에 실행해 전역을 공유시키는 방식이 안 통한다 — 대신 Node의
// vm.SourceTextModule(--experimental-vm-modules)로 실제 모듈 그래프를
// 링크·평가한다. 여전히 외부 패키지(jsdom 등) 없이 zero-dependency 유지.
// state.js가 내보내는 state 객체는 모듈 그래프 전체가 같은 참조를 공유하므로
// (실제 브라우저의 ES모듈과 동일한 라이브 바인딩 성질), 이 객체 하나만 있으면
// __eval 같은 우회 없이도 캡처된 사진·재생성 횟수 등을 테스트에서 그대로
// 읽고 쓸 수 있다.
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.join(__dirname, '..');

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

/* public/*.js 소스를 읽어 최소 가짜 DOM 환경(vm 컨텍스트)에서 실제 ES모듈
   그래프로 링크·평가하고, 모든 모듈의 export를 하나의 평평한 객체로 합쳐
   돌려준다(app.TEMPLATES, app.state, app.getMeta 처럼 접근). loadApp()을
   호출할 때마다 새 vm 컨텍스트 + 새 모듈 인스턴스를 만들어(모듈 캐시를
   호출마다 새로 시작) 테스트 간 상태가 절대 새지 않게 한다.
   createRealCanvas: templates-canvas.test.js가 @napi-rs/canvas의 createCanvas를
   넘겨준다 — grain()이 만드는 오프스크린 캔버스가 진짜 캔버스 ctx와 같은
   구현체(realm)여야 createPattern()이 받아준다(가짜 캔버스 객체는 타입
   검사에서 거부됨). */
export async function loadApp({ createRealCanvas } = {}) {
  const elements = new Map();
  const document = {
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
    visibilityState: 'visible',
    hasFocus: () => true
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
    FormData: FakeFormData,
    URL: { createObjectURL: () => 'blob:fake', revokeObjectURL() {} },
    addEventListener() {}
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const context = vm.createContext(sandbox);
  const moduleCache = new Map(); // 이 loadApp() 호출 전용 — 매번 새로 시작해 테스트 격리 보장

  async function loadModule(filePath) {
    if (moduleCache.has(filePath)) return moduleCache.get(filePath);
    const src = fs.readFileSync(filePath, 'utf8');
    const mod = new vm.SourceTextModule(src, { identifier: filePath, context });
    moduleCache.set(filePath, mod);
    await mod.link(async (specifier) => loadModule(path.join(path.dirname(filePath), specifier)));
    await mod.evaluate();
    return mod;
  }

  await loadModule(path.join(APP_DIR, 'app.js'));

  // 모든 모듈의 export를 sandbox 위에 얹는다 — sandbox 자체를 반환해서
  // (복사본이 아니라) app.fetch = fn 같은 테스트 쪽 오버라이드가 실제 vm
  // 컨텍스트의 전역을 그대로 바꾸도록 한다(기존 하네스와 동일한 성질).
  for (const mod of moduleCache.values()) {
    for (const key of Object.keys(mod.namespace)) {
      if (!(key in sandbox)) sandbox[key] = mod.namespace[key];
    }
  }
  return sandbox;
}

export { FakeCtx };
