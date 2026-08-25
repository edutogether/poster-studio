# CLAUDE.md — Poster Studio (InKY AI 영화 포스터 제작소)

InKY Festival(제4회 인천어린이청소년영화제, 2026.11.14. 인천 CGV) "InKY 놀이터" 6부스 중 하나. 상위 원칙은 [D:\Projects\CLAUDE.md](../../CLAUDE.md) 상속 — 여기는 이 저장소 전용 상태/규칙만 기록한다.

## 정체성
- **위치**: `D:\Projects\inky-festival\poster-studio`
- **스택(2026-08-26 재설계)**: 정적 프론트엔드(`public/`, GitHub Pages 배포) + Firebase Cloud Functions(`functions/`, OpenAI 이미지 생성 API 전담). 예전 Node/Express 로컬 서버(`server.js`)는 제거됨 — 행사장 교육청 MDM 노트북이 설치를 못 받을 수 있고 방화벽 문제도 있어서, 나머지 5개 앱과 동일하게 "주소만 열면 되는" 방식으로 전환.
- **기능**: 웹캠 촬영(브라우저) → Firebase Functions가 AI 그림 생성 → 브라우저 캔버스가 타이포·크레딧 합성해 4종 완성 → 4×6 현장 인쇄
- **상태**: 재설계 코드 작성 완료(2026-08-26), **배포는 아직 안 됨**. GitHub 저장소: `https://github.com/edutogether/poster-studio`.

## 재설계 후 남은 배포 단계 — 대표 확인/실행 필요 (2026-08-26)
아래 3가지는 이 세션이 콘솔 로그인·과금 동의가 필요해 직접 못 하고, 팀장을 거쳐 대표가 처리해야 한다:
1. **Firebase 프로젝트 생성 + Blaze(종량제) 플랜 전환** — Cloud Functions 2세대는 무료(Spark) 플랜에서 아예 배포가 안 됨. 콘솔(console.firebase.google.com)에서 새 프로젝트 만들고 결제수단 등록 필요. (CLI로 프로젝트 생성 자체는 가능하지만 이 세션 권한 정책상 자동 실행이 막혀 있음 — auto mode classifier가 차단.)
2. **`firebase functions:secrets:set OPENAI_API_KEY`** — 실제 운영용 API 키를 Firebase Secret Manager에 등록. 키 값은 세션에 노출하지 말고 대표가 터미널에서 직접 입력.
3. **`firebase deploy --only functions`** 실행 후 발급되는 함수 URL을 [public/app.js](public/app.js) 최상단 `API_BASE` 상수에 반영, GitHub Pages(`.github/workflows/pages.yml`, 이미 작성됨) 배포와 실제 라이브 동작(Claude in Chrome으로) 확인.

위 3가지가 끝나면 이 섹션은 지우고 "정상 운영중"으로 갱신할 것.

## 알아야 할 것
- **실비용 발생**: OpenAI 이미지 생성 API가 장당 약 $0.04(medium 화질). 행사 규모(약 1,000명, 1인 1~2회 예상)면 대략 $20~30 예상. API 키는 Firebase Secret Manager 보관 — 절대 코드/커밋에 직접 작성 금지.
- **인터넷 필수** — AI 생성에 필요, 끊기면 생성 자체가 안 됨(로컬 폴백 없음).
- 노트북 최대 4대(3대 운영+1대 예비), 포토프린터 최대 3대 공유 구성. 노트북은 이제 브라우저만 있으면 되므로 설치 요건이 사라졌음.
- 학생 얼굴 사진 + 입력정보 수집 — 실명 필수 아님(별명 허용), 체험목적 외 사용 금지, 현장출력 중심(별도 QR전달 없음). 사진이 OpenAI(미국) 서버로 전송되는 사실을 부스 안내문에 명시할 것(README 참고).
- **행사 종료 후 조치 불필요** — 이전 버전은 노트북 로컬 저장물 수동 삭제가 필요했으나, 정적 웹앱 전환 후 노트북에는 아무 것도 남지 않는다(브라우저 캐시만 존재).

## 이전 감사 결과 (2026-08-26, 구 Node/Express 서버 버전 기준)
COMMON_STANDARDS.md §7 기준 Sonnet+Opus 역할분리 첫 감사 완료(평균 71.1점). 재설계로 아키텍처가 통째로 바뀌어 이 점수는 무효 — **배포 완료 후 새 구조 기준으로 재감사 필요.** 감사에서 나온 실질적 결함 중 재설계에 이미 반영된 것: PARAM_LEVEL 전역 상태 버그 제거(요청마다 새로 계산), `.gitignore`에 `*.log`/`.cache` 추가, README 국외이전 고지 추가. 아직 안 옮긴 것(재감사 시 다시 확인): 서버 측 레이트리밋 없음, 생성 호출 로깅/카운터 없음, API 키 미설정 시 사진 유출 케이스, 자동화 테스트 0개.

## 자율 권한
`.claude/settings.json` = `bypassPermissions`. push/배포/프리즈태그까지 전부 자율 진행, 완료 후 팀장에게 결과만 보고(코디세이만 예외). 단, 외부 서비스 계정 생성·결제수단 등록처럼 대표 본인만 할 수 있는 것은 이 정책과 별개로 auto mode classifier가 차단하며, 그 경우 팀장에게 보고하고 대표 처리를 기다린다.
