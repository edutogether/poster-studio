/* 첫 화면 «↓ 다운로드»가 받는 설치 파일(2026-10-27 Bumm님 A안, 팀장 전달 — _docs/intents/2026-10-27-download-button-deploy).
   이 주소는 firebase.json의 리디렉션(302)이 Cloud Storage 공개 객체 gs://inky-poster-studio-download/PosterStudio-Setup.exe로 넘긴다.
   설치 파일은 저장소에 넣지 않는다(100MB 넘음 · Hosting에 두면 다음 배포가 dist를 새로 만들며 지운다).
   주소를 바꾸면 firebase.json의 리디렉션과 같이 고친다 — test/download-link.test.tsx가 둘을 맞춰 본다. */
// 받는 주소(href)는 Bumm님이 승인한 주소 그대로 두고, 저장되는 이름(file)만 «Poster Studio Setup.exe»다(10/27) — 실제로 이름을 정하는 것은
// Storage 객체의 Content-Disposition이다(다른 주소로 넘어가면 download 속성이 듣지 않는다). 둘을 같은 이름으로 맞춰 둔다.
export const SETUP_DOWNLOAD = { href: "/download/PosterStudio-Setup.exe", file: "Poster Studio Setup.exe" } as const;
