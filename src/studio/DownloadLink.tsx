/* 첫 화면 다운로드 아이콘 — 개인정보처리방침 링크 바로 옆의 작은 보조 링크(2026-10-27 Bumm님 A안, 팀장 전달).
   받는 것은 Poster Studio 설치판 하나뿐이라 메뉴 없이 누르면 바로 받는다. 받는 이름은 Storage 객체의 Content-Disposition이 정한다
   (리디렉션으로 다른 주소로 넘어가면 download 속성의 이름이 듣지 않는다).
   10/27 Bumm님(라이브를 보고): 글자 없이 lucide download 아이콘 하나 · 밑줄 없음 · 마우스를 올리면 커서만 손가락 · 툴팁 없음.
   글자가 없으니 화면 읽기 프로그램용 이름은 aria-label로 둔다(화면에는 안 보인다).
   🔴 누르기 전에는 설치 파일을 하나도 받지 않는다 — 평범한 <a href>다. prefetch · preload · 서비스워커 미리 받기에 넣지 않는다
   (scripts/verify/download-button-probe.mjs · download-live.mjs가 네트워크 기록으로 «누르기 전 0건 · 누른 뒤 시작»을 잰다). */
import { SETUP_DOWNLOAD } from "../downloads.js";
import "./download-link.css";

export default function DownloadLink() {
  return (
    <a className="download-link" href={SETUP_DOWNLOAD.href} download={SETUP_DOWNLOAD.file} aria-label="Poster Studio 설치 파일 다운로드">
      {/* Lucide 공식 download 아이콘(StudioView의 StudioIcon과 같은 SVG). ISC 고지: public/studio/lucide-LICENSE.txt */}
      <svg className="download-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>
      </svg>
    </a>
  );
}
