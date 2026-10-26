/* 첫 화면 «↓ 다운로드» 메뉴가 가리키는 설치 파일 주소(2026-10-27 Bumm님 지시, 팀장 전달 — _docs/intents/2026-10-27-desktop-installer).
   설치 파일은 저장소에 넣지 않는다(100MB 넘음 · Hosting에 두면 다음 CI 배포가 지운다). 올릴 자리와 업로드 · 배포는 별도 승인이다 —
   intent «올릴 자리» 절: Cloud Storage 공개 객체 + firebase.json 리디렉션으로 아래 주소에 고정. 주소가 바뀌면 이 두 줄만 고친다. */
export const DOWNLOADS = [
  { label: "Poster Studio 설치", href: "/download/PosterStudio-Setup.exe", file: "PosterStudio-Setup.exe" },
  { label: "Voice Cinema 설치", href: "https://voice.edutogether.kr/download/VoiceCinema-Setup.exe", file: "VoiceCinema-Setup.exe" },
] as const;
