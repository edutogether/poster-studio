/* Poster Studio 설치판 — 화면에 여는 창구는 «인쇄» 하나뿐이다(src/desktop.ts DesktopBridge). 샌드박스 프리로드라 CommonJS다. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('posterStudioDesktop', {
  print: () => ipcRenderer.invoke('poster-studio:print'),
});
