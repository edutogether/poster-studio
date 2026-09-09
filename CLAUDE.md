# CLAUDE.md — Poster Studio (InKY AI 영화 포스터 제작소)

InKY Festival(제4회 인천어린이청소년영화제, 2026.11.14. 인천 CGV) "InKY 놀이터" 6부스 중 하나.
웹캠으로 찍은 사진을 AI가 영화 포스터로 바꿔 4종을 만들고, 4×6 인화지로 즉석 인쇄하는 체험부스 웹앱이다.

상위 원칙은 [D:\Projects\CLAUDE.md](../../CLAUDE.md) 상속 — 여기는 이 저장소 전용 상태/규칙만 기록한다.

## 문서 지도 — 찾는 게 여기 없으면 여기 있다

| 문서 | 무엇이 있나 |
|---|---|
| [`AGENTS.md`](AGENTS.md) | **모든 AI 도구(Codex 포함)가 읽는 안내.** 명령·배포·금지사항 + 이 저장소의 함정 9건(XFF 규칙, 타임아웃 체인, hosting ignore 등) |
| [`.claude/rules/app.md`](.claude/rules/app.md) | 개별법 — 행사 정보, 개인정보 취급·보관 정책, 절대 금지사항, 자주 틀리는 것 |
| [`_docs/ops/runbook.md`](_docs/ops/runbook.md) | **행사 당일 장애 대응**(콜드스타트, 429 4종, AI 실패, 롤백). 부스 진행자가 실제로 펴보는 문서 |
| [`_docs/CHANGELOG.md`](_docs/CHANGELOG.md) | 날짜별 전체 이력 — 1~8차 감사, 디자인 개편 7라운드, 부하테스트, vitest 이전 등 |
| [`_docs/intents/`](_docs/intents/) | 건별 작업 의도. 등급 기준은 [`.claude/rules/intent-workflow.md`](.claude/rules/intent-workflow.md) |
| [`functions/security-notes.md`](functions/security-notes.md) | `npm audit` 경고를 왜 그대로 두는지 |

## 정체성
- **위치**: `D:\Projects\inky-festival\poster-studio`
- **스택**: 정적 프론트엔드(`public/`, ES모듈, 번들러 없음) + Firebase Cloud Functions(`functions/`, OpenAI 이미지 생성 전담).
  교육청 MDM 노트북이 설치를 못 받을 수 있어 "주소만 열면 되는" 방식이다 — 설치형 서버는 없다.
- **배포처**: Firebase Hosting `https://poster-studio.web.app` + Cloud Functions `posterStudio`(asia-northeast3).
  Firebase 프로젝트는 `inky-poster-studio` 하나뿐이다.
- **상태**: **실운영 모드**(아래 섹션 참고). 8차 종합감사 100/100(2026-09-07). 최신 프리즈 태그는
  `poster-studio-freeze-20260907-pre-vitest` — 그 뒤로 8차 감사 수정과 문서 정비가 들어갔으므로,
  큰 변경을 시작하기 전에는 새 freeze 태그를 먼저 찍는다.

## 명령
```bash
cd functions && npm ci && npm test    # vitest 56개
cd functions && npm run lint          # eslint
cd functions && npm run format        # prettier (functions에만 있음)

npm ci && npm test                    # vitest 66개 (저장소 루트 = 프론트엔드 루트)
npm run lint                          # eslint
npm run typecheck                     # TS strict
npm run build                         # -> dist/ (배포되는 것)
npm run fonts:check                   # 서브셋에 빠진 글자가 없는지
npm run verify:selftest               # 대조 도구가 빈 게이트가 아닌지
```
- **로컬 실행**: `npm run dev`(Vite). 라이브와 같은 형태로 보려면 `npm run build` 후 `dist/`를
  정적 서버로 연다(포트 5500 또는 8080 — `ALLOWED_ORIGINS`에 이미 허용됨).
  AI 생성은 로컬에서도 라이브 Functions를 호출하므로 **실비용이 나간다**.
- **배포**: `master`에 push하면 CI가 `test` → `deploy-functions` → `deploy-hosting` 순으로 자동 배포한다.
  수동 `firebase deploy`는 하지 않는다(예외: `keepWarm` 스케줄 변경 — RUNBOOK 참고).
- **코드를 고쳤으면 양쪽 test·lint를 돌리고 커밋한다.** 실패한 커밋이 `master`에 올라가면 그 사이 배포가 통째로 멈춘다.

## 폴더 구조
```
index.html    Vite 진입 HTML(저장소 루트). privacy.html도 루트에 있다
src/          프론트엔드 소스(TypeScript + React 19)
              main.tsx(마운트) PosterStudio.tsx(화면·로직 전부)
              constants.ts state.ts layout.ts templates.ts poster.ts
              favicon.ts useLayoutMatch.ts style.css
public/       정적 자산. Vite가 dist/ 루트로 그대로 복사한다
              boot-splash.js fonts/ poster-wall.webp logo-*.png
dist/         빌드 산출물 = 배포 폴더(firebase.json의 public). 커밋하지 않는다
test/         vitest 66개 — poster-studio.test.tsx가 화면 전체를 실제로 렌더한다
functions/    Cloud Functions — index.js 하나에 전부(미들웨어 체인·프롬프트·OpenAI·Firestore 카운터·스케줄러)
scripts/      loadtest.mjs(부하테스트, --dry 먼저) fonts/(서브셋) verify/(전환 대조 도구)
_docs/        저장소 문서(배포 대상 아님) — ops/ intents/ CHANGELOG.md
.claude/rules/  app.md(개별법) intent-workflow.md
```
**배포되는 것은 `dist/`다**(2026-09-09 리액트+TS 전환 머지). 다만 `public/`의 내용이 `dist/` 루트로
그대로 복사되므로 **"여기 설정파일을 만들면 라이브에 그대로 서빙된다"는 함정은 남아 있다**
(`vitest.config.js`가 실제로 그랬음). 자세한 함정은 `AGENTS.md`.

## 알아야 할 것
- **실비용 발생**: OpenAI 이미지 생성 API가 장당 약 $0.04(medium 화질). API 키는 Firebase Secret Manager 보관 — 절대 코드/커밋에 직접 작성 금지.
- **인터넷 필수** — AI 생성에 필요, 끊기면 생성 자체가 안 됨(로컬 폴백 없음. 단 "AI 없이 계속하기" 버튼으로 인쇄까지는 가능).
- ~~노트북 최대 4대(3대 운영+1대 예비), 포토프린터 최대 3대 공유 구성.~~ — **초기 설계 기준이며 2026-09-03에 노트북 20대(공인 IP 3개에 7/7/6 분산)로 확정되면서 대체됐다.** 현재 기준과 프린터 대수 미확인 건은 `.claude/rules/app.md` 참고. 노트북은 브라우저만 있으면 되므로 설치 요건은 없다.
- 학생 얼굴 사진 + 입력정보 수집 — 실명 필수 아님(별명 허용), 체험목적 외 사용 금지, 현장출력 중심(별도 QR전달 없음). 사진이 OpenAI(미국) 서버로 전송되는 사실을 부스 안내문에 명시할 것(README 참고).
- **"PNG 저장" 버튼을 누르지 않는 한 노트북에 남는 것은 없다** — 촬영 사진·AI 생성 이미지는 서버/노트북 어디에도 영구 저장되지 않는다(브라우저 메모리·캐시만 존재). 다만 완성 포스터를 `PNG 저장` 버튼으로 내려받으면 아동 얼굴+이름이 담긴 파일이 노트북 다운로드 폴더에 실제로 남는다 — 2026-08-29 대표 결정으로 이 버튼은 유지하고, 그렇게 쌓인 파일은 **연말(2026-12-31)까지 보관 후 삭제**하며, 삭제 작업은 앱이 자동으로 하지 않고 **교육청 장학사가 직접 처리**한다(`_docs/CHANGELOG.md`의 "4차 감사 🔴 후속조치" 참고).
- **2026-08-30부로 Firestore 사용 중**(`_docs/CHANGELOG.md`의 "5차 감사 후속조치" 참고) — **레이트리밋·재생성한도·일일예산용 순수 숫자 카운터와 사진 SHA-256 해시만** 저장한다. 사진·이름 등 개인정보는 Firestore를 포함해 그 어디에도 저장되지 않는다 — 이 원칙은 안 바뀜.
- 그 외 이 앱에서 **절대 하면 안 되는 것**(라이브 부하테스트, 타임아웃 체인 부분 변경, XFF 맨 왼쪽 사용, `npm audit fix --force` 등)은 `.claude/rules/app.md`에 모아 뒀다.

## 자율 권한
`.claude/settings.json` = `bypassPermissions`. push/배포/프리즈태그까지 전부 자율 진행, 완료 후 팀장에게 결과만 보고(코디세이만 예외). 단, 외부 서비스 계정 생성·결제수단 등록처럼 대표 본인만 할 수 있는 것은 이 정책과 별개로 auto mode classifier가 차단하며, 그 경우 팀장에게 보고하고 대표 처리를 기다린다.

## 실운영 모드 (2026-09-03 대표 지시, Portal과 동일 방침)
**2026-09-30 정기감사 전까지 이 세션은 스스로 재감사나 추가 작업을 먼저 제안하지 않는다.** 100/100이 확정된 시점부터는 실제 운영 중 발생하는 이슈 대응, 팀장이 명시적으로 요청하는 작업(기능 추가, 버그 수정, 스펙 산출 등)만 처리하고, "다시 감사해볼까요" "이 부분 더 개선할까요" 같은 세션 주도 제안은 하지 않는다. 이 방침은 §12(팀장 위임범위 확대)와는 다른 축이다 — §12는 "누가 결정하는가"를, 이 방침은 "이 세션이 먼저 일을 만들어내지 않는다"는 것을 다룬다. 팀장이나 대표가 요청하면 그 즉시 정상적으로 응답·작업한다.

## 대표와의 소통 경로 (2026-08-26 확정 — 반드시 지킬 것)
이 세션은 대표와 직접 대화를 시작하지 않는다. 진행상황 공유·질문·의사결정 요청은 전부 **팀장(D:\Projects 최상위 세션, "Project Engineering")을 거쳐서만** 한다 — 대표가 이 세션 창을 직접 열어서 먼저 말을 걸어온 경우에만 그 건에 한해 답한다(최상위 CLAUDE.md "조직 구조" 섹션 참고). 팀장에게서 온 메시지("Project Engineering의 메시지")는 곧 대표의 지시가 전달된 것이므로 별도로 대표에게 재확인하지 말고 그대로 실행한다.
