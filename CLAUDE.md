# CLAUDE.md — Poster Studio (InKY AI 영화 포스터 제작소)

InKY Festival(제4회 인천어린이청소년영화제, 2026.11.14. 인천 CGV) "InKY 놀이터" 6부스 중 하나. 상위 원칙은 [D:\Projects\CLAUDE.md](../../CLAUDE.md) 상속 — 여기는 이 저장소 전용 상태/규칙만 기록한다.

## 정체성
- **위치**: `D:\Projects\inky-festival\poster-studio`
- **스택(2026-08-26 재설계)**: 정적 프론트엔드(`public/`, GitHub Pages 배포) + Firebase Cloud Functions(`functions/`, OpenAI 이미지 생성 API 전담). 예전 Node/Express 로컬 서버(`server.js`)는 제거됨 — 행사장 교육청 MDM 노트북이 설치를 못 받을 수 있고 방화벽 문제도 있어서, 나머지 5개 앱과 동일하게 "주소만 열면 되는" 방식으로 전환.
- **기능**: 웹캠 촬영(브라우저) → Firebase Functions가 AI 그림 생성 → 브라우저 캔버스가 타이포·크레딧 합성해 4종 완성 → 4×6 현장 인쇄
- **상태**: **정상 운영중 (2026-08-26 배포 완료)**. Firebase 프로젝트 `inky-poster`(Blaze), Cloud Functions `posterStudio`(asia-northeast3) 배포됨, GitHub Pages Actions로 라이브: `https://edutogether.github.io/poster-studio/`. 실제 웹캠 촬영→AI 포스터 생성까지 실사용 확인 완료. 포털 카드도 이 실주소로 연결됨.

## 2026-08-26 배포 후 발견·수정한 버그
Cloud Functions(v2)는 핸들러 실행 전에 요청 본문 전체를 읽어 `req.rawBody`로 채워두고, 원본 `req` 스트림은 이미 끝난 상태로 넘어온다. `multer`는 그 원본 스트림에서 직접 읽으려 해서 이 환경에서는 매번 "Unexpected end of form" 오류로 사진 업로드가 실패했다. `multer`를 제거하고 `req.rawBody`를 `busboy`에 직접 흘려보내는 방식([functions/index.js](functions/index.js))으로 교체해 해결, 실제 업로드로 재확인함.

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
