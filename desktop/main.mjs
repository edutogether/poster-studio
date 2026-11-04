/* Poster Studio 설치판(Windows) — Electron 주 프로세스(2026-10-27, _docs/intents/2026-10-27-desktop-installer).

   화면은 웹과 같은 React/Vite 프론트를 설치판 모드로 빌드한 것이다(저장소 루트 `npm run build:desktop` → desktop/web).
   그것을 app://studio/ 로 연다 — file://는 «/studio/…» 같은 절대 경로 자산과 모듈 스크립트가 깨진다.

   지키는 것:
   - 인터넷을 쓰지 않는다. http · https · ws 요청은 앱이 전부 끊고(webRequest), 화면 정책(CSP)도 connect-src 'self'다.
     설치판에는 AI 생성이 없다(부스 토큰 · 키 없음 — src/desktop.ts).
   - 카메라는 앱 화면(app://studio)이 «영상만» 달라고 할 때만 허락한다. 마이크 · 위치 등 다른 권한은 모두 거절한다.
   - 앱 밖 주소로 이동하지 않는다. 새 창은 앱 안 주소(개인정보처리방침)만 연다.
   - 저장은 Windows 저장 창으로 위치를 묻는다. 인쇄는 4×6 인화지 · 여백 없음으로 Windows 인쇄 창을 연다(미리보기는 화면이 먼저 보인다).
   - 화면이 죽거나 · 멈추거나 · 앱 화면을 못 읽으면 첫 화면을 다시 읽는다. 짧은 간격에 되풀이되면 «다시 시작» 안내 창을 띄운다(recovery.mjs, 11/2).
     원인은 %APPDATA%\Poster Studio\logs\desktop.log에 남긴다(앱 데이터 폴더라 제거할 때 함께 지워진다 · 사진 · 이름은 적지 않는다).

   확인 도구(scripts/verify/desktop-*.mjs)만 쓰는 환경 변수 — 사람이 쓰는 설치판에서는 비어 있다:
     POSTER_STUDIO_TEST_SAVE_DIR   저장 창 없이 이 폴더에 저장한다
     POSTER_STUDIO_TEST_PRINT_PDF  인쇄 창 대신 같은 규격(4×6 · 여백 없음)으로 이 PDF 파일에 «인쇄»한다
     POSTER_STUDIO_TEST_WINDOW     창 자리 — «x,y»면 그 점의 모니터에서 최대화, «hidden»이면 창을 보이지 않는다(아래 readTestWindow) */
import { app, BrowserWindow, Menu, dialog, ipcMain, protocol, screen, session, shell } from 'electron';
import fs from 'node:fs/promises';
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// 방어 판정(앱 주소 서빙 · 바깥 요청 차단 · 권한 · 이동 · 새 창)은 guards.mjs에 있다 — Electron 없이 시험한다(test/desktop-guards.test.js)
import { ORIGIN, createAppServer, isAppUrl, lockDownSession, windowOpenAction } from './guards.mjs';
// 화면이 죽거나 멈췄을 때 다시 읽기(test/desktop-recovery.test.js)
import { saveResult, watchRenderer } from './recovery.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(HERE, 'web');
const APP_ID = 'kr.edutogether.posterstudio';
// 4×6 인치 인화지(마이크로미터) — 화면 인쇄 규격(src/studio.css @media print의 @page 4in 6in · 여백 0)과 같다.
const PAGE_4X6 = { width: 101600, height: 152400 };

// 앱 데이터(캐시 · 화면 저장소) 폴더를 설치기의 앱 폴더 이름(electron-builder APP_FILENAME = «Poster Studio»)과 같게 둔다 —
// 제거할 때 %APPDATA%\Poster Studio를 지운다. 두 이름이 어긋나면 제거한 뒤에도 앱 데이터가 남는다(2026-10-27 설치 · 제거 확인에서 실측).
app.setPath('userData', path.join(app.getPath('appData'), 'Poster Studio'));

// 원인 기록(11/2) — 화면이 죽거나 멈춘 까닭을 행사 뒤에도 볼 수 있게 앱 데이터 폴더에 한 줄씩 남긴다. 기록을 못 써도 앱은 그대로 돈다.
// 바로 쓴다(동기) — 안내 뒤 곧 app.exit가 오면 비동기 쓰기는 마지막 줄(멈춘 까닭)을 잃는다(11/2 숨긴 창 시험에서 실측). 실패 때만 쓰는 드문 길이다.
const LOG_FILE = path.join(app.getPath('userData'), 'logs', 'desktop.log');
function log(line) {
  console.error(`[Poster Studio] ${line}`);
  try {
    mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    appendFileSync(LOG_FILE, `${new Date().toISOString()} ${line}\n`);
  } catch { /* 기록을 못 써도 앱은 그대로 */ }
}
// 인쇄 창이 열려 있는 동안은 화면이 «응답 없음»이어도 끊지 않는다(recovery.mjs isBusy)
let printing = 0;

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

/** 저장 — Windows 저장 창으로 위치를 묻는다. 끝나면 결과를 그 화면에 보낸다(11/2 — 예전에는 저장이 끊겨도 아무 말이 없었다).
    사람이 저장 창을 닫은 것은 보내지 않는다(recovery.mjs saveResult). 화면은 실패만 알린다(PosterStudio.tsx). */
function handleSaves(ses) {
  ses.on('will-download', (_event, item, contents) => {
    item.once('done', (_e, state) => {
      const ok = saveResult(state);
      if (ok === null) return;
      if (!ok) log(`저장 실패: ${state}`);
      if (!contents.isDestroyed()) contents.send('poster-studio:save-done', ok);
    });
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
  if (!isAppUrl(event.senderFrame?.url)) return { ok: false, reason: 'not-app' };
  const contents = event.sender;
  printing += 1;
  try {
    const testPdf = process.env.POSTER_STUDIO_TEST_PRINT_PDF;
    if (testPdf) {
      const pdf = await contents.printToPDF({ printBackground: true, margins: { marginType: 'none' }, pageSize: { width: 4, height: 6 } });
      await fs.writeFile(testPdf, pdf);
      return { ok: true, reason: 'test-pdf' };
    }
    return await new Promise((resolve) => {
      contents.print({ silent: false, printBackground: true, margins: { marginType: 'none' }, pageSize: PAGE_4X6 },
        (ok, reason) => {
          if (!ok) log(`인쇄 안 됨: ${reason}`);   // 사람이 닫은 것(…canceled)도 남긴다 — 화면은 실패만 알린다(src/desktop.ts printFailed)
          resolve(ok ? { ok } : { ok, reason });
        });
    });
  } finally {
    printing -= 1;
  }
});

// 시험용 창 자리(2026-10-28 팀장 — 자동 시험 창은 아래 작은 모니터에만, 위 모니터에는 한순간도 뜨지 않게. 시험 도구가 줄 때만 켜지고 사용자 PC에는 영향이 없게).
// 확인 도구가 앱을 띄울 때 넘기는 환경 변수 POSTER_STUDIO_TEST_WINDOW만 읽는다(위 두 변수와 같은 방식). 없으면 지금 그대로 주 모니터에서 최대화한다.
//   «x,y»     그 점(화면 실제 화소 좌표)을 품은 모니터에서 최대화해 보인다 — 보이기 전에 그 모니터로 옮긴다. 새 창(개인정보처리방침)도 그 모니터에.
//   «hidden»  창을 보이지 않는다 — 창 크기를 바꿔 가며 배치를 재는 확인 도구용(scripts/verify/desktop-window-sweep.mjs). 숨은 창에서도 배치가 돌게 배경 늦춤을 끈다.
function readTestWindow() {
  const v = (process.env.POSTER_STUDIO_TEST_WINDOW ?? '').trim();
  if (v === 'hidden') return { point: null, hidden: true };
  const m = v.match(/^(-?\d+),(-?\d+)$/);
  return m ? { point: { x: Number(m[1]), y: Number(m[2]) }, hidden: false } : null;
}
const TEST_WINDOW = readTestWindow();
// 시험 자리를 품은 모니터의 작업 영역(DIP) — 시험 파일이 없거나 그 점에 모니터가 없으면 null
function testWorkArea() {
  if (!TEST_WINDOW?.point) return null;
  const p = screen.screenToDipPoint(TEST_WINDOW.point);
  const d = screen.getDisplayNearestPoint(p);
  const b = d.bounds;
  return p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height ? d.workArea : null;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1366,
    height: 860,
    // 최소 창은 안쪽(화면이 그려지는 칸) 1100×648이다(11/4 — Bumm님 11/3 «창을 끌어 너무 작게 만들면 많이 깨진다» «1번: 깨지지 않는 가장 작은 크기로», 팀장 전달).
    // 1 · 2 · 3단계 · 인쇄 미리보기를 줄여 가며 재(scripts/verify/desktop-window-sweep.mjs), 단추가 화면 밖 · 안쪽 스크롤 뒤로 숨지 않고 겹침 · 잘림이 0인 가장 작은 크기다:
    // 폭 1100 미만은 2단계 «샘플 포스터 보기» · «이전»이 오른쪽 칸 스크롤 뒤로 숨고(높이 680 이하 — 폭 1100 이상은 웹처럼 한 화면 배치), 높이 648 미만은 3단계 아래 끝이 화면 밖으로 나간다.
    // 현장 노트북의 최대화 안쪽(1366×768 → 1366×697 · 1920×1080 150% → 1280×649)은 이보다 커서 최대화가 그대로 된다. 그 전 600×480(11/2 «반 화면 붙이기»)은 반 화면이 되던 대신 위처럼 숨었다.
    // 크기를 안쪽으로 정해야(useContentSize) 테두리 · 제목 줄 두께가 다른 배율 모니터에서도 같은 칸이 남는다 — 처음 크기 1366×860도 안쪽 크기다(보일 때는 최대화한다).
    useContentSize: true,
    minWidth: 1100,
    minHeight: 648,
    show: false,
    title: 'Poster Studio',
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(HERE, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false, ...(TEST_WINDOW?.hidden ? { backgroundThrottling: false } : {}) },
  });
  win.once('ready-to-show', () => {
    if (TEST_WINDOW?.hidden) return;
    const area = testWorkArea();
    if (area) win.setBounds(area);   // 보이기 전에 시험 모니터로 — 최대화는 창이 놓인 모니터에서 된다
    win.maximize();
    win.show();
  });
  win.on('page-title-updated', (event) => event.preventDefault());
  // 화면이 죽거나(render-process-gone) · 멈추거나(unresponsive) · 앱 첫 화면을 못 읽으면(did-fail-load) 첫 화면을 다시 연다(11/2 종합감사 — 예전에는 빈 창이 남았다).
  // 읽기 실패는 did-fail-load가 받으므로 loadURL의 거부는 여기서 버린다.
  const home = `${ORIGIN}/`;
  const open = () => win.loadURL(home).catch(() => {});
  watchRenderer(win.webContents, { home, reload: open, giveUp: () => giveUp(win), log, isBusy: () => printing > 0 });
  // F11: 전체 화면(부스 노트북) — 메뉴를 없앴으므로 단축키만 남긴다.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });
  void open();
}

/* 짧은 간격에 여러 번 다시 읽어도 같으면 더 읽지 않고 안내한다(recovery.mjs). «다시 시작»은 앱을 새로 띄운다 — 진행자가 바탕화면 아이콘을 찾지 않아도 된다. */
function giveUp(win) {
  if (TEST_WINDOW?.hidden) { app.exit(1); return; }   // 숨긴 창 확인 도구: 안내 창도 띄우지 않고 끝낸다(도구가 앱이 끝난 것을 잡는다)
  const options = {
    type: 'error',
    title: 'Poster Studio',
    message: '화면을 열지 못했어요.',
    detail: '여러 번 다시 열어 봤지만 같은 문제가 되풀이됐어요. «다시 시작»을 눌러 주세요. 그래도 같으면 노트북을 다시 켠 뒤 Poster Studio를 열어 주세요.',
    buttons: ['다시 시작', '끝내기'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  };
  void (win.isVisible() ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options)).then(({ response }) => {
    if (response === 0) app.relaunch();
    app.exit(0);
  });
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
      if (!isAppUrl(url)) event.preventDefault();
    });
    contents.on('will-attach-webview', (event) => event.preventDefault());
    contents.setWindowOpenHandler(({ url }) => {
      const action = windowOpenAction(url);
      if (action === 'app') {
        const area = testWorkArea();
        return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, width: 900, height: 860, ...(area ? { x: area.x + 24, y: area.y + 24 } : {}) } };
      }
      if (action === 'external') void shell.openExternal(url);
      return { action: 'deny' };
    });
  });
  app.whenReady().then(() => {
    app.setAppUserModelId(APP_ID);
    Menu.setApplicationMenu(null);
    protocol.handle('app', createAppServer(WEB));
    lockDownSession(session.defaultSession);
    handleSaves(session.defaultSession);
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
