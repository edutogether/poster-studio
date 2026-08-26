# CLAUDE.md — Poster Studio (InKY AI 영화 포스터 제작소)

InKY Festival(제4회 인천어린이청소년영화제, 2026.11.14. 인천 CGV) "InKY 놀이터" 6부스 중 하나. 상위 원칙은 [D:\Projects\CLAUDE.md](../../CLAUDE.md) 상속 — 여기는 이 저장소 전용 상태/규칙만 기록한다.

## 정체성
- **위치**: `D:\Projects\inky-festival\poster-studio`
- **스택(2026-08-26 재설계)**: 정적 프론트엔드(`public/`, GitHub Pages 배포) + Firebase Cloud Functions(`functions/`, OpenAI 이미지 생성 API 전담). 예전 Node/Express 로컬 서버(`server.js`)는 제거됨 — 행사장 교육청 MDM 노트북이 설치를 못 받을 수 있고 방화벽 문제도 있어서, 나머지 5개 앱과 동일하게 "주소만 열면 되는" 방식으로 전환.
- **기능**: 웹캠 촬영(브라우저) → Firebase Functions가 AI 그림 생성 → 브라우저 캔버스가 타이포·크레딧 합성해 4종 완성 → 4×6 현장 인쇄
- **상태**: **정상 운영중 (2026-08-26 배포 완료, 같은 날 정밀감사+수정까지 반영)**. Firebase 프로젝트 `inky-poster`(Blaze), Cloud Functions `posterStudio`(asia-northeast3) 배포됨, GitHub Pages Actions로 라이브: `https://edutogether.github.io/poster-studio/`. 실제 웹캠 촬영→AI 포스터 생성까지 실사용 확인 완료. 포털 카드도 이 실주소로 연결됨. `poster-studio-freeze-20260826` 태그는 정밀감사 "이전" 스냅샷이고, master는 그 뒤 감사에서 나온 결함 수정·재배포까지 반영해 태그보다 앞서 있다(아래 "감사 이력" 참고).

## 2026-08-26 배포 후 발견·수정한 버그
Cloud Functions(v2)는 핸들러 실행 전에 요청 본문 전체를 읽어 `req.rawBody`로 채워두고, 원본 `req` 스트림은 이미 끝난 상태로 넘어온다. `multer`는 그 원본 스트림에서 직접 읽으려 해서 이 환경에서는 매번 "Unexpected end of form" 오류로 사진 업로드가 실패했다. `multer`를 제거하고 `req.rawBody`를 `busboy`에 직접 흘려보내는 방식([functions/index.js](functions/index.js))으로 교체해 해결, 실제 업로드로 재확인함.

## 알아야 할 것
- **실비용 발생**: OpenAI 이미지 생성 API가 장당 약 $0.04(medium 화질). 행사 규모(약 1,000명, 1인 1~2회 예상)면 대략 $20~30 예상. API 키는 Firebase Secret Manager 보관 — 절대 코드/커밋에 직접 작성 금지.
- **인터넷 필수** — AI 생성에 필요, 끊기면 생성 자체가 안 됨(로컬 폴백 없음).
- 노트북 최대 4대(3대 운영+1대 예비), 포토프린터 최대 3대 공유 구성. 노트북은 이제 브라우저만 있으면 되므로 설치 요건이 사라졌음.
- 학생 얼굴 사진 + 입력정보 수집 — 실명 필수 아님(별명 허용), 체험목적 외 사용 금지, 현장출력 중심(별도 QR전달 없음). 사진이 OpenAI(미국) 서버로 전송되는 사실을 부스 안내문에 명시할 것(README 참고).
- **행사 종료 후 조치 불필요** — 이전 버전은 노트북 로컬 저장물 수동 삭제가 필요했으나, 정적 웹앱 전환 후 노트북에는 아무 것도 남지 않는다(브라우저 캐시만 존재).

## 감사 이력
- **1차 (2026-08-26, 구 Node/Express 서버 버전 기준, 평균 71.1점)** — 재설계로 아키텍처가 통째로 바뀌면서 무효 처리.
- **2차 정밀감사 (2026-08-26, 배포 후 `poster-studio-freeze-20260826` 기준, COMMON_STANDARDS.md §7·§4-1·§4-2 적용, 실행+실측 포함)** — Sonnet+Opus 역할분리로 처음부터 독립 조사, 발견된 진짜 결함은 같은 라운드에서 수정→재배포→재검증까지 완료.

| 항목 | 최초 점수 | 수정 후 | 담당 |
|---|---|---|---|
| 개인정보/규정 준수 | 74 | **100** | Opus |
| 확장성 | 90 | **96** | Opus |
| 비용 관리/과금 안전장치 | 58 | **88** | Opus |
| 운영 안정성 | 82 | **87** | Opus |
| 아키텍처/구조 설계 | 88 | 88 | Opus |
| 보안 | 77 | **83** | Opus |
| 코드 품질/일관성 | 76 | **85** | Sonnet |
| 에러 핸들링 | 70 | **82** | Sonnet |
| 기술 부채 | 78 | 78 | Sonnet |
| 테스트 커버리지 | 30 | 30 | Sonnet |
| **평균** | 72.3 | **81.7** | |

**이 라운드에서 실제로 고치고 재배포·재검증까지 끝낸 것**([functions/index.js](functions/index.js)):
- `parseMultipart`가 12MB 초과·잘못된 파일타입·busboy 내부 오류 등 여러 실패 경로에서 학생 사진 임시파일을 `/tmp`에 영구히 남기던 버그 제거(모든 종료 경로가 `finish()` 하나를 거치도록 재구성) + `files:1` 한도 추가(같은 필드에 파일 2개를 보내면 어느 게 채택될지 불확정해지던 경쟁조건도 같이 해소).
- 서버 측 레이트리밋 신규 추가(인스턴스당 최근 10분에 10건 초과 시 429) — 실제로 11번째 요청에서 429가 뜨는 것까지 라이브에서 확인함(2026-08-26 테스트로 그 부스 인스턴스는 10분간 실사용도 막혔을 수 있음 — 행사 당일에는 이런 식으로 라이브에 직접 부하테스트 하지 말 것).
- `maxInstances` 10 → 5(노트북 대수에 맞춤, 폭주 시 이론상 과금 상한을 대폭 축소).
- README 개인정보 안내에 OpenAI 최대 30일 보관 고지, 영화 제목/문구도 전송된다는 사실 추가.
- `.github/workflows/pages.yml`의 `configure-pages@v5` `enablement:true` 제거 — 이게 원인으로 push 트리거 배포가 3연속 실패했었는데(Pages 사이트가 이미 있는데도 매번 새로 만들려다 권한 부족으로 실패), 제거 후 push 배포가 실제로 성공하는 것까지 확인함(commit `d6e8b42`, run 32961706735).
- `firebase deploy --only functions --project inky-poster`로 실제 재배포 후 `/health`·실제 사진 업로드(`/generate`) 재확인 완료.

**이번 라운드에서 발견됐지만 아직 안 고친 것(다음 라운드 또는 사용자 요청 시)**:
- 프론트(`public/app.js:9`)의 `API_BASE` 하드코딩, `functions/`는 CI 배포 파이프라인 밖(수동 `firebase deploy`만 존재), `/health` 엔드포인트를 프론트가 아예 안 씀(연결 끊김을 촬영 전에 미리 알 방법이 없음).
- 프롬프트 인젝션 미방어(`functions/index.js`의 `buildPrompt`), Pretendard/구글폰트 CDN 단일장애점, `openai`·`firebase-functions` 의존성 각각 major 1개 뒤처짐, 자동화 테스트 0개(재발 — 1차 감사 때도 지적됐던 항목).
- **대표 콘솔 작업 필요**: OpenAI 대시보드 월 하드리밋 + GCP 예산 알림 설정 — 코드 레벨 방어(레이트리밋·maxInstances)는 끝났지만 이건 세션 권한 밖.

## 자율 권한
`.claude/settings.json` = `bypassPermissions`. push/배포/프리즈태그까지 전부 자율 진행, 완료 후 팀장에게 결과만 보고(코디세이만 예외). 단, 외부 서비스 계정 생성·결제수단 등록처럼 대표 본인만 할 수 있는 것은 이 정책과 별개로 auto mode classifier가 차단하며, 그 경우 팀장에게 보고하고 대표 처리를 기다린다.

## 대표와의 소통 경로 (2026-08-26 확정 — 반드시 지킬 것)
이 세션은 대표와 직접 대화를 시작하지 않는다. 진행상황 공유·질문·의사결정 요청은 전부 **팀장(D:\Projects 최상위 세션, "Project Engineering")을 거쳐서만** 한다 — 대표가 이 세션 창을 직접 열어서 먼저 말을 걸어온 경우에만 그 건에 한해 답한다(최상위 CLAUDE.md "조직 구조" 섹션 참고). 팀장에게서 온 메시지("Project Engineering의 메시지")는 곧 대표의 지시가 전달된 것이므로 별도로 대표에게 재확인하지 말고 그대로 실행한다.
