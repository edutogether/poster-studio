import "./kakaoEscape.css";

/* 카카오톡 안 브라우저로 열리면 바깥 브라우저(아이폰은 사파리, 갤럭시는 기본 브라우저)로 한 번 넘긴다(2026-10-20 Bumm님, 팀장 전달).
   주소 형식 kakaotalk://web/openExternal?url=<encodeURIComponent(지금 주소)>는 카카오 공식 문서가 없는 비공식 방식이다 —
   카카오 데브톡 질문 · 개발자 글에서 널리 쓰이는 형식 그대로다. 실제 카카오톡에서 열리는지는 실기기로만 확인된다.
   다른 인앱(인스타그램 · 네이버 등)은 건드리지 않는다. 같은 탭에서는 한 번만 시도한다(세션 저장소) — 실패하면 안내만 남기고 다시 넘기지 않는다. */

const TRIED_KEY = "poster-studio-kakao-external";
export const OPENING_TEXT = "브라우저로 여는 중…";
export const FALLBACK_BEFORE = "오른쪽 위";
export const FALLBACK_AFTER = "→ ‘다른 브라우저로 열기’를 눌러 주세요";
const OPEN_DELAY_MS = 500;
const FAIL_AFTER_MS = 1500;

export function isKakaoInApp(userAgent: string) {
  return /KAKAOTALK/i.test(userAgent);
}

export function kakaoExternalUrl(href: string) {
  return `kakaotalk://web/openExternal?url=${encodeURIComponent(href)}`;
}

type Options = {
  userAgent?: string;
  href?: string;
  /** 시험용 주입 지점 — jsdom의 location은 바꿔 끼울 수 없다. */
  navigate?: (url: string) => void;
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
};

function sessionStore(): Pick<Storage, "getItem" | "setItem"> | null {
  try { return window.sessionStorage; } catch { return null; }
}

/** 화면 맨 위 한 줄. 스플래시보다 위에 뜬다(kakaoEscape.css). */
function banner() {
  const bar = document.createElement("div");
  bar.className = "kakao-escape";
  bar.setAttribute("role", "status");
  document.body.prepend(bar);
  return bar;
}

/** 글꼴 서브셋에 «⋯»가 없어 점 세 개는 그림으로 그린다(서브셋을 다시 만들지 않게). */
function dots() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 8");
  svg.setAttribute("class", "kakao-escape-dots");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "메뉴 단추");
  for (const cx of [4, 12, 20]) {
    const c = document.createElementNS(ns, "circle");
    c.setAttribute("cx", String(cx)); c.setAttribute("cy", "4"); c.setAttribute("r", "2.4");
    svg.append(c);
  }
  return svg;
}

function showFallback(bar: HTMLElement) {
  bar.replaceChildren(document.createTextNode(`${FALLBACK_BEFORE} `), dots(), document.createTextNode(` ${FALLBACK_AFTER}`));
  const close = document.createElement("button");
  close.type = "button";
  close.className = "kakao-escape-close";
  close.textContent = "닫기";
  close.addEventListener("click", () => bar.remove());
  bar.append(close);
}

/** 카카오톡 안이면 true(넘기기를 시도했거나 안내를 띄움). 그 밖은 아무것도 하지 않고 false. */
export function escapeKakaoInApp(options: Options = {}) {
  const userAgent = options.userAgent ?? navigator.userAgent;
  if (!isKakaoInApp(userAgent)) return false;
  const storage = options.storage === undefined ? sessionStore() : options.storage;
  let tried = false;
  try { tried = storage?.getItem(TRIED_KEY) === "1"; } catch { /* 저장소가 막혀도 넘기기는 한 번 시도한다 */ }
  const bar = banner();
  if (tried) { showFallback(bar); return true; }
  try { storage?.setItem(TRIED_KEY, "1"); } catch { /* 위와 같음 */ }
  bar.textContent = OPENING_TEXT;
  const href = options.href ?? window.location.href;
  const navigate = options.navigate ?? ((url: string) => { window.location.href = url; });
  let left = false;
  // 바깥 브라우저가 열리면 카카오톡 화면이 가려진다(hidden). 돌아오면 «여는 중» 줄을 걷는다.
  const onVisibility = () => {
    if (document.hidden) left = true;
    else if (left) { bar.remove(); document.removeEventListener("visibilitychange", onVisibility); }
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.setTimeout(() => {
    navigate(kakaoExternalUrl(href));
    window.setTimeout(() => {
      if (left) return;
      document.removeEventListener("visibilitychange", onVisibility);
      showFallback(bar);
    }, FAIL_AFTER_MS);
  }, OPEN_DELAY_MS);
  return true;
}
