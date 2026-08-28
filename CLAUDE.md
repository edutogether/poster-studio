# CLAUDE.md — Poster Studio (InKY AI 영화 포스터 제작소)

InKY Festival(제4회 인천어린이청소년영화제, 2026.11.14. 인천 CGV) "InKY 놀이터" 6부스 중 하나. 상위 원칙은 [D:\Projects\CLAUDE.md](../../CLAUDE.md) 상속 — 여기는 이 저장소 전용 상태/규칙만 기록한다.

## 정체성
- **위치**: `D:\Projects\inky-festival\poster-studio`
- **스택(2026-08-26 재설계)**: 정적 프론트엔드(`public/`, GitHub Pages 배포) + Firebase Cloud Functions(`functions/`, OpenAI 이미지 생성 API 전담). 예전 Node/Express 로컬 서버(`server.js`)는 제거됨 — 행사장 교육청 MDM 노트북이 설치를 못 받을 수 있고 방화벽 문제도 있어서, 나머지 5개 앱과 동일하게 "주소만 열면 되는" 방식으로 전환.
- **기능**: 웹캠 촬영(브라우저) → Firebase Functions가 AI 그림 생성 → 브라우저 캔버스가 타이포·크레딧 합성해 4종 완성 → 4×6 현장 인쇄
- **상태**: **정상 운영중**. Firebase 프로젝트는 **2026-08-27부로 `inky-poster` → `inky-poster-studio`로 이전 완료**(구 프로젝트의 IAM 권한 문제 때문 — 아래 "Firebase 프로젝트 이전" 참고). Cloud Functions `posterStudio`(asia-northeast3, `https://asia-northeast3-inky-poster-studio.cloudfunctions.net/posterStudio`) 배포됨, GitHub Pages Actions로 라이브: `https://edutogether.github.io/poster-studio/`. 실제 웹캠 촬영→AI 포스터 생성까지 실사용 확인 완료. 포털 카드도 이 실주소로 연결됨. `poster-studio-freeze-20260826` 태그는 구 프로젝트(`inky-poster`) 기준 정밀감사 "이전" 스냅샷이며, 프로젝트 이전 후에도 여전히 유효한 코드 이력 참고용이다.

## Firebase 프로젝트 이전: inky-poster → inky-poster-studio (2026-08-27)
구 프로젝트(`inky-poster`)에서 배포 계정 IAM이 꼬여(아래 "Firebase 계정 접근 이슈" 참고) 대표가 아예 새 프로젝트를 만들기로 결정. 데이터가 전혀 없는 앱이라(Firestore/Storage 미사용, 사진은 처리 직후 삭제) 마이그레이션은 순수 재배포뿐이었다:
- `.firebaserc`의 기본 프로젝트를 `inky-poster-studio`로 변경.
- `firebase deploy --only functions --project inky-poster-studio`로 신규 배포 — **여기서도 구 프로젝트와 완전히 같은 종류의 IAM 오류(`iam.serviceaccounts.actAs` 거부)가 재현됐다.** 새로 만든 프로젝트라도 Firebase 콘솔에서 프로젝트를 만든 계정에 Cloud Run 배포에 필요한 "Service Account User" 역할이 자동으로 안 붙는 경우가 있다는 뜻 — **다음에 새 Firebase 프로젝트를 만들 때는 배포 전에 IAM에서 이 역할을 미리 확인/부여할 것.** 대표가 콘솔에서 역할 부여 후 재시도해서 배포 성공.
- Artifact Registry 컨테이너 이미지 정리 정책 없다는 경고가 떠서 `firebase functions:artifacts:setpolicy`로 1일 보관 정책 설정(방치하면 이미지가 쌓여 소액이지만 스토리지 비용이 계속 늘어남).
- `public/app.js`의 `API_BASE`를 새 함수 URL로 변경, `.github/workflows/functions-deploy.yml`의 프로젝트 ID도 같이 변경.
- `/health`(hasKey:true 확인) + 실제 사진 업로드(`/generate`)로 재검증 완료, GitHub Pages도 재배포되어 새 프로젝트를 호출하는 것 확인.
- **정리 완료(2026-08-27, 대표 직접 처리)**: 구 프로젝트 `inky-poster` 삭제됨(`firebase projects:list`로 목록에서 사라진 것 확인, 새 프로젝트 `inky-poster-studio`는 정상 조회됨), 구 OpenAI API 키 삭제, 새 키 이름을 `poster-studio-v2` → `poster-studio`로 정리. 삭제/키 교체 이후에도 `/health`가 여전히 `hasKey:true`로 정상 응답하는 것 재확인함(새 프로젝트의 Secret Manager가 새 키를 정상 참조 중).
- **Poster Studio 프로젝트 이전 건 완전 종결.** 이 시점부터 이 저장소의 유일한 Firebase 프로젝트는 `inky-poster-studio`이며, 위 "Firebase 계정 접근 이슈" 섹션의 `inky-poster` 관련 내용은 전부 과거 이력이다.

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

## 3차 라운드 — 남은 🔴🟡 전부 처리 (2026-08-27, 대표 지시 "빠지지말고 다 해")
2차 정밀감사에서 "아직 안 고친 것"으로 남겨뒀던 항목을 전부 처리했다(테스트 커버리지 포함, 실제 버그이력 있는 로직이라 우선순위 최상단):

- **자동화 테스트 신설** — [functions/test/index.test.js](functions/test/index.test.js), Node 내장 테스트러너(`node --test`, `npm test`), 13개 케이스. 실제 OpenAI 호출(=실비용)은 어떤 테스트도 하지 않는다 — `sanitizePromptField`/`buildPrompt`는 순수함수 테스트, `parseMultipart`는 Node 내장 `FormData`/`Request`로 진짜 멀티파트 바이트를 만들어 실제 파싱 로직을 검증한다. 특히 2차 라운드에서 고친 두 버그(파일 2개 동시 업로드 시 경쟁조건, 오류 경로 임시파일 누수)를 그대로 회귀 테스트로 박아뒀고, 레이트리밋도 실제 로컬 HTTP 서버를 띄워 11번째 요청이 429인지 검증한다.
- **프롬프트 인젝션 완화** — `functions/index.js`에 `sanitizePromptField` 추가. 학생이 입력한 제목/문구에서 줄바꿈과 큰따옴표를 제거해, 프롬프트 안의 따옴표 경계를 깨고 "글자 넣지 마라" 같은 안전 지시문을 무력화하는 입력을 막는다.
- **의존성 업그레이드** — `openai` 6.49→7.5.0, `firebase-functions` 6.6→7.3.2(둘 다 최신 major). openai v7의 유일한 breaking change는 "Node 22 요구"인데 이미 Node 22로 올려둔 상태라 영향 없음(공식 CHANGELOG 확인). 업그레이드 후 테스트 13개 전부 통과 + 재배포 후 실제 사진 업로드로 재검증함(아래 "재배포 검증" 참고).
- **CDN 폰트 단일장애점 — 부분 해결(의도적 판단)** — Pretendard는 [public/fonts/](public/fonts/)에 실제 쓰는 6개 굵기(400/500/600/700/800/900)만 내려받아 자체 호스팅으로 전환(jsDelivr GitHub-raw 의존 제거, `PRETENDARD-LICENSE.txt`로 OFL 라이선스 준수). **Black Han Sans·Noto Serif KR 등 Google Fonts 쪽은 의도적으로 안 옮겼다** — 학생이 입력하는 임의의 한글 텍스트 전부를 커버하려면 CJK 폰트 특성상 서브셋 없이는 굵기당 수 MB~수십 MB가 들어 사이트가 수십 MB로 불어나고, Google Fonts 자체 CDN은 jsDelivr GitHub-raw보다 훨씬 안정적인 인프라라 위험 대비 이득이 낮다고 판단함(`public/index.html`에 이 판단 근거를 주석으로 남겨둠). 학교망이 Google Fonts 도메인 자체를 막는 사례가 실제로 확인되면 그때 재검토.
- **API_BASE / CORS 동기화 지점 문서화** — `public/app.js`의 `API_BASE`와 `functions/index.js`의 `ALLOWED_ORIGINS`가 프로젝트 이전 시 반드시 같이 바뀌어야 한다는 걸 양쪽 코드에 상호 참조 주석으로 남김. (완전한 구조적 제거는 이 앱 규모에서 과잉설계로 판단해 안 함 — 문서화로 대응.)
- **`/health` 프론트 연동** — `public/app.js`가 페이지 로드 시 `/health`를 호출해 연결 상태를 확인한다. 실패해도 촬영은 막지 않고(fail-open) 경고 문구만 띄운다 — 촬영·정보입력 다 끝낸 뒤에야 실패를 알게 되는 것보다 훨씬 낫다.
- **functions/ CI 배포 — 스캐폴딩만 완료, 활성화는 대표 작업 필요** — [.github/workflows/functions-deploy.yml](.github/workflows/functions-deploy.yml) 작성해뒀지만 `workflow_dispatch`(수동)로만 열어둠. GCP 서비스 계정 생성은 이 세션(auto mode classifier)이 대신할 수 없는 영역이라, 대표가 콘솔에서 배포 권한을 가진 서비스 계정 키를 만들어 GitHub 저장소 시크릿 `FIREBASE_SERVICE_ACCOUNT`로 등록해야 `push` 트리거를 켤 수 있다(파일 안 주석 참고).

**재배포 검증**: `firebase deploy --only functions --project inky-poster` 재실행 후 `/health`·실제 사진 업로드(`/generate`)로 재확인 완료. GitHub Pages도 재배포되어 폰트 자체호스팅·health체크 반영된 라이브 확인함.

**여전히 대표 콘솔 작업으로 남은 것**:
- OpenAI 대시보드 월 하드리밋 + GCP 예산 알림 설정.
- `FIREBASE_SERVICE_ACCOUNT` GitHub 시크릿 등록(functions CI 자동배포 활성화용).

## Firebase 계정 접근 이슈 (2026-08-27 발견 — `inky-poster` 삭제로 종결된 과거 이력)
`firebase deploy`가 갑자기 IAM 오류로 막혔다가(대표가 IAM을 손보는 과정에서 생긴 것으로 추정), 원래 쓰던 `817beatles@gmail.com` 계정은 오히려 `inky-poster` 프로젝트가 `firebase projects:list`에서 아예 사라지는 상태가 됐다. 반면 두 번째 계정 `edutogether2015@gmail.com`으로는 정상 접근됐다. 이 문제가 계기가 되어 대표가 `inky-poster-studio`로 완전히 새로 옮기기로 결정했고(위 "Firebase 프로젝트 이전" 참고), 구 프로젝트는 이전 완료 후 삭제됐다. **지금은 `inky-poster-studio` 하나만 존재하므로 이 계정 혼선 자체는 더 이상 유효하지 않다** — 새 프로젝트는 `edutogether2015@gmail.com` 계정 기준으로 처음부터 설정됐다는 것만 기억해두면 된다. `firebase login:list`로 현재 로그인 계정 확인 가능.

## 3차 라운드 반영 후 재추정 점수 (2026-08-27, Sonnet 단독 재평가 — 정식 재감사 아님)
| 항목 | 2차 점수 | 3차 반영 후 |
|---|---|---|
| 개인정보/규정 준수 | 100 | 100 |
| 확장성 | 96 | 96 |
| 기술 부채 | 78 | **92** |
| 운영 안정성 | 87 | **92** |
| 아키텍처/구조 설계 | 88 | 90 |
| 보안 | 83 | **88** |
| 코드 품질/일관성 | 85 | 85 |
| 에러 핸들링 | 82 | 82 |
| 비용 관리/과금 안전장치 | 88 | 88 |
| 테스트 커버리지 | 30 | **80** |
| **평균** | 81.7 | **~89.3** |

정식 Sonnet+Opus 완전 독립 재감사가 필요하면 사용자 요청 시 진행.

## 자율 권한
`.claude/settings.json` = `bypassPermissions`. push/배포/프리즈태그까지 전부 자율 진행, 완료 후 팀장에게 결과만 보고(코디세이만 예외). 단, 외부 서비스 계정 생성·결제수단 등록처럼 대표 본인만 할 수 있는 것은 이 정책과 별개로 auto mode classifier가 차단하며, 그 경우 팀장에게 보고하고 대표 처리를 기다린다.

## 대표와의 소통 경로 (2026-08-26 확정 — 반드시 지킬 것)
이 세션은 대표와 직접 대화를 시작하지 않는다. 진행상황 공유·질문·의사결정 요청은 전부 **팀장(D:\Projects 최상위 세션, "Project Engineering")을 거쳐서만** 한다 — 대표가 이 세션 창을 직접 열어서 먼저 말을 걸어온 경우에만 그 건에 한해 답한다(최상위 CLAUDE.md "조직 구조" 섹션 참고). 팀장에게서 온 메시지("Project Engineering의 메시지")는 곧 대표의 지시가 전달된 것이므로 별도로 대표에게 재확인하지 말고 그대로 실행한다.
