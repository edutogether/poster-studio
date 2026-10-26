---
status: done
등급: 2
작성자: Poster Studio 세션
작성 시각: 2026-10-27
---

# 첫 화면 «↓ 다운로드» 배포 · 설치 파일 공개

팀장 전달 Bumm님 A안 승인(2026-10-27)이라 지시 자체가 승인이다. 설치판을 만든 작업은 가지 `desktop-20261027`
(`_docs/intents/2026-10-27-desktop-installer`)에 있고, 이 작업은 그 결과물 중 **설치 파일 공개와 첫 화면 단추만** 라이브에 낸다.

## 문제

- 설치판 `PosterStudio-Setup.exe`(147,366,342바이트, SHA-256 `5e24eeff206ce1607b2d4bc4a1397ebef6fb911ffbf6e1e3e8de03d2f9b6bdf4`)를
  현장 노트북이 받을 자리가 없다.
- 첫 화면에 받는 단추가 없다.

## 원하는 결과

1. `https://poster.edutogether.kr/download/PosterStudio-Setup.exe`를 열면 바로 .exe가 `PosterStudio-Setup.exe`라는 이름으로 받아진다.
   보조 주소(`poster-studio.web.app` · `poster-studio.firebaseapp.com`)도 같다. 로그인 없이 받아진다.
2. 첫 화면 «개인정보처리방침» 바로 옆에 작게 «↓ 다운로드». 메뉴 없이 누르면 바로 받는다.
   누르기 전에는 설치 파일 요청이 0건이다. 디자인 · 여백 · 색 · 글꼴 · 반응형 · 체험 흐름은 그대로다.
3. 라이브 배포는 `836b1b9`에 단추와 연결 설정만 더한 것이다.

## 정한 것(근거)

- **파일 자리**: 같은 Firebase 프로젝트(`inky-poster-studio`)의 Cloud Storage 버킷 `inky-poster-studio-download`(서울 `asia-northeast3`).
  - 프로젝트에 Firebase Storage 버킷이 아직 없다. Firebase Storage 기능(전용 API · 보안 규칙)을 켜면 규칙 배포가 따라와 «hosting만 낸다»를 넘는다.
    그래서 Firebase 쪽 기능은 켜지 않고 같은 프로젝트의 Cloud Storage 버킷만 쓴다.
  - 서울 리전: 받는 사람이 한국의 현장 노트북이다.
- **공개 범위 = 이 객체 하나**: 버킷은 객체별 권한(균일 접근 끔)이고, 버킷 권한(IAM)에는 공개 항목이 없다.
  `PosterStudio-Setup.exe` 객체 하나에만 `allUsers` 읽기를 준다. 버킷 목록 · 다른 객체 · 객체 권한 정보는 익명으로 거부된다(실측).
- **파일 정보**: `Content-Type: application/vnd.microsoft.portable-executable`, `Content-Disposition: attachment; filename="PosterStudio-Setup.exe"`,
  `Cache-Control: no-cache`(같은 이름으로 새 파일을 올리면 곧바로 새 파일이 나가게).
  다른 주소로 넘어가면 `<a download>`의 이름이 듣지 않으므로 받는 이름은 이 `Content-Disposition`이 정한다.
- **주소 연결**: `firebase.json` 리디렉션 302(`/download/PosterStudio-Setup.exe` → Storage 객체 주소).
  301이 아니라 302인 까닭: 브라우저가 영구 기억하지 않아 나중에 파일 자리를 바꿀 수 있다.
  Hosting(`dist/`)에 파일을 두지 않는 까닭: 저장소에 넣을 수 없고(100MB 넘음), 다음 배포가 `dist/`를 새로 만들며 지운다.
- **단추**: 평범한 `<a href download>` 하나. 메뉴 · 미리 받기(prefetch · preload) · 서비스워커가 없다.
- **배포**: `firebase deploy --only hosting:poster-studio`(runbook §9 절차 — LF 사본 · 되돌림 채널 · 배포 직후 CI 확인).
  GitHub push · master 변경 · 함수 배포는 하지 않는다.

## 영향받는 사용자·시스템

- 웹 첫 화면 사용자: 단추 하나가 생긴다. 그 밖의 화면은 바이트까지 같아야 한다.
- 비용: 저장 약 0.15GB(월 1센트 미만), 한 번 받을 때마다 나가는 데이터 약 0.15GB(인터넷 송신 GB당 약 $0.12 → 한 번에 약 $0.02).

## 제약

- 다시 빌드하지 않는다 — 검증을 마친 설치 파일을 그대로 올린다.
- 서버 함수 · AI 엔진 · 동결 지시문 16개 · 영상 12개 · 포스터 8종 · 개인정보처리방침을 바꾸지 않는다.
- 라이브에서 «생성»을 누르지 않는다. 유료 AI 생성 0건. Bumm님 Chrome을 쓰지 않는다.
- 🟠 master에는 이 단추와 연결이 없다(master 변경 금지). 이 가지를 master에 합치기 전에 master를 push하면 CI가 단추와 `/download` 연결을 지운다.

## 미결 질문

- 실제 프린터 출력(11/12) · 교육청 노트북 설치 권한 · 서명이 없어서 뜨는 Windows 보안 경고는 현장 점검으로 남는다.

## 결과(2026-10-27 08:10)

- Hosting만 배포: 사본 `85a6a5c` → 판 `8bf7bafcabfd3329`. 함수 `81a07b4` 그대로, push · master 변경 없음. 되돌림 채널 `rollback-20261027`.
- 세 주소 모두 302 → Storage 객체, 끝까지 받은 SHA-256 일치, 형식 · attachment 이름 · 크기 맞음. PC 2560 · 휴대폰 3배에서 누르기 전 0건 · 눌러서 끝까지 받기.
  같은 시각 되돌림 채널 대 새 라이브 단추 밖 화소 차이 0. 숫자는 CHANGELOG 10/27.
- PDF 2종은 주소 · 단추 이름을 적지 않아 고치지 않았다.
