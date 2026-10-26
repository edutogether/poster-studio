/* 첫 화면 «↓ 다운로드» — 개인정보처리방침 링크 바로 옆의 작은 보조 링크(2026-10-27 Bumm님 A안, 팀장 전달).
   받는 것은 Poster Studio 설치판 하나뿐이라 메뉴 없이 누르면 바로 받는다. 받는 이름은 Storage 객체의 Content-Disposition이 정한다
   (리디렉션으로 다른 주소로 넘어가면 download 속성의 이름이 듣지 않는다).
   🔴 누르기 전에는 설치 파일을 하나도 받지 않는다 — 평범한 <a href>다. prefetch · preload · 서비스워커 미리 받기에 넣지 않는다
   (scripts/verify/download-button-probe.mjs · download-live.mjs가 네트워크 기록으로 «누르기 전 0건 · 누른 뒤 시작»을 잰다).
   화살표(↓)는 글자가 아니라 그림이다 — 화면 글꼴 서브셋에 없는 글자라, 서브셋(웹 글꼴 파일)을 다시 만들지 않으려고(npm run fonts:check). */
import { SETUP_DOWNLOAD } from "../downloads.js";
import "./download-link.css";

export default function DownloadLink() {
  return (
    <a className="download-link" href={SETUP_DOWNLOAD.href} download={SETUP_DOWNLOAD.file}>
      <svg className="download-arrow" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.5v8M2.5 6 6 9.5 9.5 6"/></svg>다운로드
    </a>
  );
}
