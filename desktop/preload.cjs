/* Poster Studio 설치판 — 화면에 여는 창구는 «인쇄»와 «저장 결과 듣기» 둘뿐이다(src/desktop.ts DesktopBridge). 샌드박스 프리로드라 CommonJS다. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('posterStudioDesktop', {
  print: () => ipcRenderer.invoke('poster-studio:print'),
  // 저장(Windows 저장 창)이 끝나면 결과(참 · 거짓)를 받는다. 돌려준 함수를 부르면 그만 듣는다. 사람이 저장 창을 닫으면 오지 않는다.
  onSaveDone: (listener) => {
    const handler = (_event, ok) => listener(ok === true);
    ipcRenderer.on('poster-studio:save-done', handler);
    return () => ipcRenderer.removeListener('poster-studio:save-done', handler);
  },
});
