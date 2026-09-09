/* ────────────────────────────────────────────────────────────────────
   화면 스냅샷 추출기 — 리액트+TS 전환 전후 "동일함"을 증명하기 위한 도구.

   브라우저 페이지 안에서 이 파일 전체를 평가하면 스냅샷 객체 하나를 돌려준다
   (마지막 표현식이 결과). 전환 전 코드(freeze 태그를 워크트리로 꺼낸 것)와
   전환 후 코드를 **각각 띄워서 같은 걸 뽑고**, compare.mjs로 대조한다.
   기억이나 기록이 아니라 두 화면을 실제로 실행해서 재는 게 요점이다.

   세 층을 한 번에 뽑는다(_shared/CONVENTIONS.md §5.5, 팀장 지시 2026-09-09):
     ① computed style 전수      — 폰트·색·배경·그림자·transition/animation·transform·박스·flex/grid
     ② 기하(bounding rect)      — computed width/height가 auto로 같아도 실제 크기가 다를 수 있다
     ③ 화면에 안 보이는 값      — alt·aria-*·role·title·요소 id 집합·meta·href·lang·name/type/placeholder

   ⚠ 요소를 문서 순서(인덱스)로 짝지으면 안 된다. 전환 전 DOM은 모든 화면 요소를
   숨긴 채 들고 있고 전환 후는 현재 화면만 그릴 수 있어 인덱스가 밀린다.
   그래서 id → 구조 경로 + 텍스트 지문 순으로 **안정적인 키**를 만들어 짝짓는다.
   ──────────────────────────────────────────────────────────────────── */
/* 한 번 주입하면 window.__posterSnapshot()으로 몇 번이든 다시 뽑을 수 있다
   (뷰포트를 바꿔가며 캡처할 때 매번 재주입하지 않기 위함). 파일 자체를
   평가하면 곧바로 한 번 뽑은 결과가 반환된다. */
window.__posterSnapshot = () => {
  const PROPS = [
    // 타이포
    'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing',
    'text-align', 'text-transform', 'text-decoration-line', 'white-space', 'word-break', 'color',
    // 배경·테두리·표면
    'background-color', 'background-image', 'background-size', 'background-position',
    'background-repeat', 'background-clip',
    'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
    'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
    'border-top-style', 'border-top-left-radius', 'border-top-right-radius',
    'border-bottom-right-radius', 'border-bottom-left-radius',
    'box-shadow', 'opacity', 'filter', 'backdrop-filter', 'mix-blend-mode',
    // 움직임 — 대표님이 "체감까지 동일"이라고 못박은 부분이 여기다
    'transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay',
    'animation-name', 'animation-duration', 'animation-timing-function', 'animation-delay',
    'animation-iteration-count', 'animation-direction', 'animation-fill-mode',
    'transform', 'transform-origin', 'will-change',
    // 박스
    'display', 'position', 'top', 'right', 'bottom', 'left', 'z-index', 'box-sizing',
    'overflow-x', 'overflow-y', 'visibility', 'pointer-events', 'cursor',
    'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    // flex / grid
    'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis',
    'justify-content', 'align-items', 'align-self', 'align-content',
    'gap', 'row-gap', 'column-gap', 'order',
    'grid-template-columns', 'grid-template-rows', 'grid-auto-flow', 'grid-column', 'grid-row',
    'aspect-ratio', 'object-fit', 'object-position'
  ];

  /* 빌드 도구가 붙이는 해시를 지운다 — Vite는 poster-wall.webp를
     poster-wall-a1b2c3d4.webp로 바꾼다. 그대로 대조하면 자산 전부가 차이로
     잡혀 진짜 신호가 묻힌다. 해시를 지운 값으로 비교하고 원본도 같이 남긴다. */
  const dehash = (s) => {
    const v = String(s == null ? '' : s);
    /* data: URL은 통째로 담으면 안 된다 — 갤러리 썸네일 4장만으로 스냅샷이
       13MB가 됐다(실측). 캔버스로 그린 그림의 픽셀 동일성은 이 도구가 아니라
       templates-canvas.test.js(픽셀 샘플링)와 스크린샷이 볼 일이고,
       여기서 필요한 건 "이미지가 여전히 붙어 있고 비어 있지 않은가"다.
       그래서 종류와 크기만 지문으로 남긴다. */
    if (v.startsWith('data:')) {
      const mime = v.slice(5, v.indexOf(',') < 0 ? 5 : v.indexOf(',')).split(';')[0];
      return `data:${mime};bytes=${v.length}`;
    }
    return v
      .replace(/-[A-Za-z0-9_]{8,}(\.[A-Za-z0-9]+)(?=$|[)"'?#\s])/g, '$1')
      .replace(/\?[A-Za-z0-9=&._-]*$/, '');
  };

  const isVisible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    // 크기가 0이어도 자식이 보일 수 있으므로(래퍼) 완전히 배제하지는 않는다.
    return r.width > 0 || r.height > 0 || el.children.length > 0;
  };

  /* 텍스트 지문 — 자식 요소 텍스트까지 합치면 부모마다 거대해지므로
     자기 직계 텍스트 노드만 모아 짧게 자른다.

     공백뿐인 텍스트 노드는 버린다(2026-09-09 추가). 예전엔 trim만 하고 join해서
     **직계 공백 텍스트 노드의 개수**가 그대로 키에 남았다(`main.app|"    "`) —
     그건 화면에 보이는 값이 아니라 **소스 들여쓰기**다. 3단계에서 마크업을 JSX로
     옮기면 요소 사이의 공백 줄이 사라지므로, 이대로 두면 `main.app`·`section.left`
     같은 **컨테이너들의 키가 통째로 어긋나** 비교가 성립하지 않는다. 하필 레이아웃이
     가장 중요한 자리들이 "요소 없어짐 + 새 요소 생김"으로 빠져버려, 진짜 회귀가
     그 구멍으로 새게 된다. 진짜 텍스트는 필터를 통과하므로 검출력은 그대로다. */
  const ownText = (el) =>
    Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.nodeValue.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join(' ')
      .slice(0, 40);

  const sig = (el) => {
    const cls = Array.from(el.classList).sort().join('.');
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '');
  };

  /* 안정적인 키: id가 있으면 그걸로 끝(가장 강함).
     없으면 body부터의 구조 경로 + 직계 텍스트 지문.
     그래도 겹치면 같은 키 안에서의 등장 순서를 붙인다. */
  const seen = new Map();
  const keyOf = (el) => {
    let base;
    if (el.id) {
      base = '#' + el.id;
    } else {
      const path = [];
      for (let n = el; n && n !== document.body; n = n.parentElement) path.unshift(sig(n));
      const t = ownText(el);
      base = path.join('>') + (t ? `|"${t}"` : '');
    }
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}#${n}`;
  };

  /* ③ 화면에 안 보이는 값 — 픽셀·스타일 대조를 전부 통과하고도 남는 것들.
     Portal은 카드 alt가, Voice Cinema는 요소 id 20여 개가 여기서 잡혔다. */
  const ATTRS = ['role', 'alt', 'title', 'name', 'type', 'placeholder', 'href', 'src',
    'lang', 'target', 'rel', 'for', 'download', 'value', 'disabled', 'hidden',
    'autoplay', 'playsinline', 'muted', 'controls', 'loop', 'poster', 'width', 'height'];

  const attrsOf = (el) => {
    const out = {};
    for (const a of ATTRS) {
      if (el.hasAttribute(a)) out[a] = dehash(el.getAttribute(a));
    }
    for (const a of el.attributes) {
      if (a.name.startsWith('aria-') || a.name.startsWith('data-')) out[a.name] = a.value;
    }
    return out;
  };

  const elements = {};
  const ids = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.id) ids.push(el.id);
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
    if (!isVisible(el)) continue;

    const cs = getComputedStyle(el);
    const style = {};
    for (const p of PROPS) style[p] = dehash(cs.getPropertyValue(p));

    const r = el.getBoundingClientRect();
    elements[keyOf(el)] = {
      tag: el.tagName.toLowerCase(),
      classes: Array.from(el.classList).sort(),
      text: ownText(el),
      attrs: attrsOf(el),
      style,
      rect: { w: +r.width.toFixed(1), h: +r.height.toFixed(1), x: +r.x.toFixed(1), y: +r.y.toFixed(1) }
    };
  }

  const metas = Array.from(document.querySelectorAll('meta')).map((m) => ({
    name: m.getAttribute('name'), property: m.getAttribute('property'),
    charset: m.getAttribute('charset'), content: m.getAttribute('content'),
    httpEquiv: m.getAttribute('http-equiv')
  }));

  const links = Array.from(document.querySelectorAll('link')).map((l) => ({
    rel: l.getAttribute('rel'), href: dehash(l.getAttribute('href')),
    as: l.getAttribute('as'), type: l.getAttribute('type')
  }));

  return {
    meta: {
      url: location.href.replace(/^https?:\/\/[^/]+/, ''),
      viewport: { w: innerWidth, h: innerHeight },
      capturedAt: new Date().toISOString()
    },
    document: {
      title: document.title,
      lang: document.documentElement.getAttribute('lang'),
      // 요소 id 집합 — Voice Cinema가 20여 개를 잃었던 바로 그 항목.
      // 보이는 요소만이 아니라 DOM 전체에서 모은다.
      ids: ids.sort(),
      metas,
      links
    },
    elements
  };
};
window.__posterSnapshot();
