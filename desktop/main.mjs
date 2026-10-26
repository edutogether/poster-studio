/* Poster Studio 설치판(Windows) — Electron 주 프로세스(2026-10-27, _docs/intents/2026-10-27-desktop-installer).

   화면은 웹과 같은 React/Vite 프론트를 설치판 모드로 빌드한 것이다(저장소 루트 `npm run build:desktop` → desktop/web).
   그것을 app://studio/ 로 연다 — file://는 «/studio/…» 같은 절대 경로 자산과 모듈 스크립트가 깨진다.

   지키는 것:
   - 인터넷을 쓰지 않는다. http · https · ws 요청은 앱이 전부 끊고(webRequest), 화면 정책(CSP)도 connect-src 'self'다.
     설치판에는 AI 생성이 없다(부스 토큰 · 키 없음 — src/desktop.ts).
   - 카메라는 앱 화면(app://studio)이 «영상만» 달라고 할 때만 허락한다. 마이크 · 위치 등 다른 권한은 모두 거절한다.
   - 앱 밖 주소로 이동하지 않는다. 새 창은 앱 안 주소(개인정보처리방침)만 연다.
   - 저장은 Windows 저장 창으로 위치를 묻는다. 인쇄는 4×6 인화지 · 여백 없음으로 Windows 인쇄 창을 연다(미리보기는 화면이 먼저 보인다).

   확인 도구(scripts/verify/desktop-app-probe.mjs)만 쓰는 환경 변수 — 사람이 쓰는 설치판에서는 비어 있다:
     POSTER_STUDIO_TEST_SAVE_DIR   저장 창 없이 이 폴더에 저장한다
     POSTER_STUDIO_TEST_PRINT_PDF  인쇄 창 대신 같은 규격(4×6 · 여백 없음)으로 이 PDF 파일에 «인쇄»한다 */
import { app, BrowserWindow, Menu, ipcMain, protocol, session, shell } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(HERE, 'web');
const ORIGIN = 'app://studio';
const APP_ID = 'kr.edutogether.posterstudio';
// 웹 화면 정책(firebase.json)에서 바깥 주소(AI 서버)만 뺀 것. 영상은 앱 안 파일과 카메라(blob)만.
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
const TYPE = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.txt': 'text/plain; charset=utf-8',
};
// 4×6 인치 인화지(마이크로미터) — 화면 인쇄 규격(src/studio.css @media print의 @page 4in 6in · 여백 0)과 같다.
const PAGE_4X6 = { width: 101600, height: 152400 };

// 앱 데이터(캐시 · 화면 저장소) 폴더를 설치기와 같은 이름으로 — 제거할 때 %APPDATA%PosterStudio를 지운다(electron-builder APP_FILENAME).
// 그대로 두면 Electron이 화면 이름(«Poster Studio»)으로 폴더를 만들어 제거한 뒤에도 남는다(2026-10-27 설치 · 제거 확인에서 실측).
app.setPath('userData', path.join(app.getPath('appData'), 'PosterStudio'));

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

/** app://studio/<경로> → 설치 폴더의 web/<경로>. 영상은 부분 요청(Range)에 206으로 답한다. */
async function serve(request) {
  const url = new URL(request.url);
  if (url.host !== 'studio') return new Response(null, { status: 404 });
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(WEB, rel);
  if (!file.startsWith(WEB + path.sep)) return new Response(null, { status: 404 });
  let body;
  try {
    body = await fs.readFile(file);
  } catch {
    return new Response(null, { status: 404 });
  }
  const headers = {
    'content-type': TYPE[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
    'content-security-policy': CSP,
    'x-content-type-options': 'nosniff',
    'accept-ranges': 'bytes',
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '');
  if (range && (range[1] || range[2])) {
    const size = body.length;
    let start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    let end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
    return new Response(body.subarray(start, end + 1), { status: 206, headers: { ...headers, 'content-range': `bytes ${start}-${end}/${size}` } });
  }
  return new Response(body, { status: 200, headers });
}

function lockDownSession(ses) {
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, callback) => callback({ cancel: true }));
  const fromApp = (url) => typeof url === 'string' && url.startsWith(`${ORIGIN}/`);
  ses.setPermissionRequestHandler((_contents, permission, callback, details) => {
    const videoOnly = (details.mediaTypes ?? []).length > 0 && details.mediaTypes.every((type) => type === 'video');
    callback(permission === 'media' && videoOnly && fromApp(details.requestingUrl));
  });
  ses.setPermissionCheckHandler((_contents, permission, origin) => permission === 'media' && origin === ORIGIN);
  ses.on('will-download', (_event, item) => {
    const testDir = process.env.POSTER_STUDIO_TEST_SAVE_DIR;
    if (testDir) {
      item.setSavePath(path.join(testDir, item.getFilename()));
      return;
    }
    item.setSaveDialogOptions({
      title: '포스터 저장',
      defaultPath: path.join(app.getPath('downloads'), item.getFilename()),
      filters: [{ name: 'PNG 그림', extensions: ['png'] }],
    });
  });
}

/** 화면의 «인쇄하기» — 4×6 · 여백 없음으로 Windows 인쇄 창을 연다. 인쇄 창이 닫히면(인쇄 · 취소) 답한다. */
ipcMain.handle('poster-studio:print', async (event) => {
  if (!event.senderFrame?.url.startsWith(`${ORIGIN}/`)) return { ok: false, reason: 'not-app' };
  const contents = event.sender;
  const testPdf = process.env.POSTER_STUDIO_TEST_PRINT_PDF;
  if (testPdf) {
    const pdf = await contents.printToPDF({ printBackground: true, margins: { marginType: 'none' }, pageSize: { width: 4, height: 6 } });
    await fs.writeFile(testPdf, pdf);
    return { ok: true, reason: 'test-pdf' };
  }
  return new Promise((resolve) => {
    contents.print({ silent: false, printBackground: true, margins: { marginType: 'none' }, pageSize: PAGE_4X6 },
      (ok, reason) => resolve(ok ? { ok } : { ok, reason }));
  });
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    title: 'Poster Studio',
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(HERE, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });
  win.on('page-title-updated', (event) => event.preventDefault());
  // F11: 전체 화면(부스 노트북) — 메뉴를 없앴으므로 단축키만 남긴다.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });
  void win.loadURL(`${ORIGIN}/`);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  // 앱 안 주소 밖으로는 이동하지 않는다. 새 창은 앱 안 주소만(개인정보처리방침), https 링크는 기본 브라우저로 넘긴다.
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (event, url) => {
      if (!url.startsWith(`${ORIGIN}/`)) event.preventDefault();
    });
    contents.on('will-attach-webview', (event) => event.preventDefault());
    contents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith(`${ORIGIN}/`)) return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, width: 900, height: 860 } };
      if (url.startsWith('https://')) void shell.openExternal(url);
      return { action: 'deny' };
    });
  });
  app.whenReady().then(() => {
    app.setAppUserModelId(APP_ID);
    Menu.setApplicationMenu(null);
    protocol.handle('app', serve);
    lockDownSession(session.defaultSession);
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
