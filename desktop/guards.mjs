/* Poster Studio 설치판의 방어층 판정(2026-11-02 종합감사 — main.mjs에서 떼어 냈다. 판정 · 응답은 그 전과 같다).
   Electron을 불러오지 않으므로 vitest가 그대로 시험한다(test/desktop-guards.test.js). main.mjs는 이 판정을 Electron 자리에 걸기만 한다.
   - 앱 주소 서빙: app://studio/<경로> → 설치 폴더의 web/<경로>. web 밖으로 나가는 경로는 404, 영상의 부분 요청(Range)은 206 · 416.
   - 바깥 요청 차단: http · https · ws · wss 요청은 전부 끊는다(설치판에는 AI · 서버가 없다).
   - 권한: 앱 화면이 «영상만» 달라는 카메라만 허락한다. 마이크 · 위치 등 다른 권한은 모두 거절한다.
   - 이동 · 새 창: 앱 안 주소로만 이동한다. 새 창은 앱 안 주소(개인정보처리방침)만 열고, https 링크는 기본 브라우저로 넘긴다. */
import fs from 'node:fs/promises';
import path from 'node:path';

export const ORIGIN = 'app://studio';
// 웹 화면 정책(firebase.json)에서 바깥 주소(AI 서버)만 뺀 것. 영상은 앱 안 파일과 카메라(blob)만.
export const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
const TYPE = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.txt': 'text/plain; charset=utf-8',
};
// 앱이 끊는 바깥 요청(Electron webRequest 거르개 모양)
export const BLOCKED_URLS = ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'];

/** 앱 안 주소인가 — «app://studio/»로 시작해야 한다(«app://studio.evil/» · «app://studio»는 아니다). */
export const isAppUrl = (url) => typeof url === 'string' && url.startsWith(`${ORIGIN}/`);

/** app://studio/<경로>가 가리키는 web 안 파일. 다른 호스트이거나 web 밖으로 나가면 null(→ 404). */
export function appFilePath(webRoot, requestUrl) {
  const url = new URL(requestUrl);
  if (url.host !== 'studio') return null;
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(webRoot, rel);
  return file.startsWith(webRoot + path.sep) ? file : null;
}

/** 부분 요청(Range) 판정 — 없거나 모양이 다르면 null(전체 200), 맞으면 { start, end }(206), 범위 밖이면 'unsatisfiable'(416). */
export function byteRange(header, size) {
  const range = /^bytes=(\d*)-(\d*)$/.exec(header ?? '');
  if (!range || !(range[1] || range[2])) return null;
  const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
  const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  return start >= size || start > end ? 'unsatisfiable' : { start, end };
}

/** protocol.handle('app', …)에 거는 응답기. readFile은 시험에서 바꿔 끼울 수 있다. */
export function createAppServer(webRoot, readFile = fs.readFile) {
  return async function serve(request) {
    const file = appFilePath(webRoot, request.url);
    if (!file) return new Response(null, { status: 404 });
    let body;
    try {
      body = await readFile(file);
    } catch {
      return new Response(null, { status: 404 });
    }
    const headers = {
      'content-type': TYPE[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      'content-security-policy': CSP,
      'x-content-type-options': 'nosniff',
      'accept-ranges': 'bytes',
    };
    const size = body.length;
    const range = byteRange(request.headers.get('range'), size);
    if (range === 'unsatisfiable') return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
    if (range) return new Response(body.subarray(range.start, range.end + 1), { status: 206, headers: { ...headers, 'content-range': `bytes ${range.start}-${range.end}/${size}` } });
    return new Response(body, { status: 200, headers });
  };
}

/** 권한 요청(setPermissionRequestHandler) — 앱 화면이 «영상만» 달라는 카메라(media)만 허락한다. */
export function allowPermissionRequest(permission, details) {
  const videoOnly = (details.mediaTypes ?? []).length > 0 && details.mediaTypes.every((type) => type === 'video');
  return permission === 'media' && videoOnly && isAppUrl(details.requestingUrl);
}

/** 권한 확인(setPermissionCheckHandler) — 앱 화면의 media만 참. */
export const allowPermissionCheck = (permission, origin) => permission === 'media' && origin === ORIGIN;

/** 세션 잠그기 — 바깥 요청을 끊고 권한 판정을 건다(ses는 Electron session 모양이면 된다). */
export function lockDownSession(ses) {
  ses.webRequest.onBeforeRequest({ urls: BLOCKED_URLS }, (_details, callback) => callback({ cancel: true }));
  ses.setPermissionRequestHandler((_contents, permission, callback, details) => callback(allowPermissionRequest(permission, details)));
  ses.setPermissionCheckHandler((_contents, permission, origin) => allowPermissionCheck(permission, origin));
}

/** 새 창 요청(setWindowOpenHandler) — 'app' 앱 안 창으로 연다 · 'external' 기본 브라우저로 넘긴다 · 'deny' 막는다. */
export function windowOpenAction(url) {
  if (isAppUrl(url)) return 'app';
  if (url.startsWith('https://')) return 'external';
  return 'deny';
}
