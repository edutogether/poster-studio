# CLAUDE.md — Poster Studio (InKY AI 영화 포스터 제작소)

> **표시**: 🔴 어기면 실사용자 화면이 깨지거나 개인정보가 샌다 · 🟠 중간 · 🟡 낮음 · 🟢 확인 끝남 (`COMMON_STANDARDS.md` §30)

InKY Festival(제4회 인천어린이청소년영화제, 2026.11.14. 인천 CGV) "InKY 놀이터" 6부스 중 하나.
웹캠으로 찍은 사진을 AI가 영화 포스터로 바꿔 8종 디자인으로 보여 주고, 4×6 인화지로 즉석 인쇄하는 체험부스 웹앱이다.

상위 원칙은 [D:\Projects\CLAUDE.md](../../CLAUDE.md) 상속 — 여기는 이 저장소 전용 상태/규칙만 기록한다.

## 문서 지도 — 찾는 게 여기 없으면 여기 있다

| 문서 | 무엇이 있나 |
|---|---|
| [`_docs/ops/HANDOFF_CURRENT.md`](_docs/ops/HANDOFF_CURRENT.md) | **Claude·Codex 공통 인계 문서** — 현재 담당·상태·다음 작업. **작업 전에 먼저 읽는다** |
| [`AGENTS.md`](AGENTS.md) | **모든 AI 도구(Codex 포함)가 읽는 안내.** 명령·배포·금지사항 + 이 저장소의 함정 9건(임시 사진 삭제, `public/` 서빙, hosting ignore 등) |
| [`.claude/rules/app.md`](.claude/rules/app.md) | 개별법 — 행사 정보·운영 규모, 개인정보 취급·보관 정책, 절대 금지사항, 자주 틀리는 것 |
| [`_docs/ops/runbook.md`](_docs/ops/runbook.md) | **행사 당일 장애 대응**(콜드스타트, 429 4종, AI 실패, 롤백, GitHub 정지 중 로컬 배포 §9). 부스 진행자가 실제로 펴보는 문서 |
| [`_docs/CHANGELOG.md`](_docs/CHANGELOG.md) | 날짜별 전체 이력 — 감사·채점 결과의 원장, 디자인 개편, 부하테스트 결정, vitest 이전 등 |
| [`_docs/intents/`](_docs/intents/) | 건별 작업 의도. 등급 기준은 [`.claude/rules/intent-workflow.md`](.claude/rules/intent-workflow.md) |
| [`functions/security-notes.md`](functions/security-notes.md) | `npm audit` 경고를 왜 그대로 두는지 |

## 정체성
- **위치**: `D:\Projects\inky-festival\poster-studio`
- **스택**: TypeScript + React 19 + Vite로 빌드한 프론트엔드(소스 `src/`, 배포는 산출물 `dist/`)
  + Firebase Cloud Functions(`functions/`, OpenAI 이미지 생성 전담). 2026-09-09 머지 전에는 번들러 없는 정적 ES모듈이었다.
  서버는 여전히 없다 — 교육청 MDM 노트북이 설치를 못 받을 수 있어 "주소만 열면 되는" 방식이다.
- **주소**: **`https://poster.edutogether.kr`**(2026-09-10부 정식 — 안내문·QR을 새로 만들 때 쓰는 주소).
  **`https://poster-studio.web.app`도 계속 살아 있다** — 이미 나간 링크가 죽으면 안 되므로 없애지 않는다.
  두 주소는 같은 것을 서빙하고, CI가 배포마다 둘 다 확인한다(app.md «앱»). 🟢
- **배포처**: Firebase Hosting + Cloud Functions `posterStudio`(asia-northeast3). Firebase 프로젝트는 `inky-poster-studio` 하나뿐이다.
- 🟢 **상태**: **실운영 모드**(아래 섹션). 최근 종합감사는 **2026-10-17**(출시 후보 `release-20261018` 트리 기준) —
  항목별 점수·고친 것·남은 것은 `_docs/CHANGELOG.md`가 원장이다. 큰 변경을 시작하기 전에는 새 freeze 태그를 먼저 찍는다.
  - 🟠 **점수는 `10/10`으로만 적고 언제 트리의 점수인지 붙인다** — `10/10 (날짜 트리 기준, 이후 커밋 N건)`. N은 이 파일에 박지 않고
    보고할 때 센다(`git rev-list --count <감사 태그>..master`). `100`·`만점` 표기는 쓰지 않는다(예외는 이미 박힌 태그 이름 `…-audited-100`).
    원문은 `COMMON_STANDARDS.md` §29. ⚠ CHANGELOG 5~8차 감사의 100점 평균은 그 시절 채점 방식이라 기록 그대로 둔다.

## 명령
```bash
cd functions && npm ci && npm test    # vitest 97개(2026-10-17)
cd functions && npm run lint          # eslint
cd functions && npm run format        # prettier (functions에만 있음)

npm ci && npm test                    # vitest 228개(2026-10-17) (저장소 루트 = 프론트엔드 루트)
npm run lint                          # eslint
npm run typecheck                     # TS strict — src와 test/*.ts(x)
npm run build                         # -> dist/ (배포되는 것)
npm run fonts:check                   # 서브셋에 빠진 글자가 없는지
npm run verify:selftest               # 대조 도구가 빈 게이트가 아닌지
```
- **로컬 실행**: `npm run dev`(Vite). 라이브와 같은 형태로 보려면 `npm run build` 후 `dist/`를
  정적 서버로 연다(포트 5500 또는 8080 — `ALLOWED_ORIGINS`에 이미 허용됨).
  AI 생성은 로컬에서도 라이브 Functions를 호출하므로 **실비용이 나간다**.
- **배포**: `master`에 push하면 CI가 `test` → `deploy-functions` → `deploy-hosting` 순으로 자동 배포한다.
  수동 `firebase deploy`는 하지 않는다(예외: `keepWarm` 스케줄 변경, GitHub 정지 중 로컬 배포 — RUNBOOK §9 참고).
- **코드를 고쳤으면 양쪽 test·lint를 돌리고 커밋한다.** 실패한 커밋이 `master`에 올라가면 그 사이 배포가 통째로 멈춘다.

## 폴더 구조
```
index.html    Vite 진입 HTML(저장소 루트). privacy.html도 루트에 있다
src/          프론트엔드 소스(TypeScript + React 19)
              main.tsx(마운트) PosterStudio.tsx(촬영·API·출력) studio/StudioView.tsx(단계별 화면)
              constants.ts state.ts layout.ts templates.ts poster.ts defaults.ts
              generateFailure.ts(실패 → 다음 단추) boothCode.ts(부스 코드) restartHome.ts(처음으로)
              studio.css studio/(화면·창·대기 영상·스타일 — 휴대폰 정리는 studio.css 맨 끝)
public/       정적 자산. Vite가 dist/ 루트로 그대로 복사한다
              splash-font-gate.js(스플래시 글꼴 게이트) boot-splash.js fonts/ studio/ logo-*.png favicon-inky.png
dist/         빌드 산출물 = 배포 폴더(firebase.json의 public). 커밋하지 않는다
test/         vitest 228개(2026-10-17) — poster-studio.test.tsx가 화면 전체를 실제로 렌더한다
functions/    Cloud Functions — index.js 하나에 전부(미들웨어 체인·프롬프트·OpenAI·Firestore 카운터·스케줄러)
scripts/      verify/(확인·대조 도구) ci/(배포 단계 도구) media/(대기·예시 영상) fonts/(서브셋) docs/(설명서) loadtest.mjs
_docs/        저장소 문서(배포 대상 아님) — ops/ intents/ CHANGELOG.md
.claude/rules/  app.md(개별법) intent-workflow.md
```
**배포되는 것은 `dist/`다**(2026-09-09 리액트+TS 전환 머지). 다만 `public/`의 내용이 `dist/` 루트로
그대로 복사되므로 **"여기 설정파일을 만들면 라이브에 그대로 서빙된다"는 함정은 남아 있다**
(`vitest.config.js`가 실제로 그랬음). 자세한 함정은 `AGENTS.md`.

## 알아야 할 것
- 🔴 **2026-10-20부터 라이브는 «두 단추»다** — `.env.production`의 `VITE_SAMPLE_MODE=1`(10/20에 뜻이 바뀜: `1` 두 단추 · `sample` 샘플만 · `0` 실제만).
  **11/7쯤 `0`으로** — 세션은 `.env*`를 못 읽어(사용자 전역 settings의 deny) 그 한 줄은 Bumm님 몫. 자세히는 app.md «샘플 모드 스위치».
- **실비용 발생**: OpenAI 이미지 생성 API가 장당 약 $0.04(medium 화질). API 키는 Firebase Secret Manager 보관 — 절대 코드/커밋에 직접 작성 금지.
- **인터넷 필수** — AI 생성에 필요, 끊기면 생성 자체가 안 됨(로컬 폴백 없음). 실패하면 «포스터를 만들지 못했어요» 창이 종류별로 «다시 만들기»·«다시 찍기» 등을 보이고, 인터넷이 끊겼으면 연결이 돌아올 때까지 기다린다(2026-10-16 — 예전 «AI 없이 계속하기» 빈 그라데이션 인쇄는 없앴다).
- **운영 규모**: 노트북 6대(가동 4 + 대기 2) · 포토프린터 3대 · 공인 IP 3개. 🔴 프린터 대수는 행사 처리량 계산의 입력값이다
  (인쇄 2분이면 3대로 충분, 3분이면 60장 모자람). 숫자와 근거는 app.md «앱»과 [`_docs/ops/printer-capacity.md`](_docs/ops/printer-capacity.md).
  ⚠ "노트북 20대"와 부하테스트는 폐기됐다(2026-09-11 대표, `_docs/intents/2026-09-11-loadtest-3ip/intent.md`).
- 학생 얼굴 사진 + 입력정보 수집 — 실명 필수 아님(별명 허용), 체험목적 외 사용 금지, 현장출력 중심(별도 QR전달 없음). 사진이 OpenAI(미국) 서버로 전송되는 사실을 부스 안내문에 명시할 것(README 참고).
- **"PNG 저장" 버튼을 누르지 않는 한 노트북에 남는 것은 없다** — 촬영 사진·AI 생성 이미지는 서버/노트북 어디에도 영구 저장되지 않는다(브라우저 메모리·캐시만 존재). 다만 완성 포스터를 `PNG 저장` 버튼으로 내려받으면 아동 얼굴+이름이 담긴 파일이 노트북 다운로드 폴더에 실제로 남는다 — 2026-08-29 대표 결정으로 이 버튼은 유지하고, 그렇게 쌓인 파일은 **연말(2026-12-31)까지 보관 후 삭제**하며, 삭제 작업은 앱이 자동으로 하지 않고 **교육청 장학사가 직접 처리**한다(`_docs/CHANGELOG.md`의 "4차 감사 🔴 후속조치" 참고).
- **2026-08-30부로 Firestore 사용 중**(`_docs/CHANGELOG.md`의 "5차 감사 후속조치" 참고) — **레이트리밋·재생성한도·일일예산용 순수 숫자 카운터와 사진 SHA-256 해시만** 저장한다. 사진·이름 등 개인정보는 Firestore를 포함해 그 어디에도 저장되지 않는다 — 이 원칙은 안 바뀜.
- 그 외 이 앱에서 **절대 하면 안 되는 것**(라이브 부하테스트, 타임아웃 체인 부분 변경, XFF 맨 왼쪽 사용, `npm audit fix --force` 등)은 `.claude/rules/app.md`에 모아 뒀다.

## 자율 권한
`.claude/settings.json` = `bypassPermissions`. push/배포/프리즈태그까지 전부 자율 진행, 완료 후 팀장에게 결과만 보고(코디세이만 예외). 단, 외부 서비스 계정 생성·결제수단 등록처럼 대표 본인만 할 수 있는 것은 이 정책과 별개로 auto mode classifier가 차단하며, 그 경우 팀장에게 보고하고 대표 처리를 기다린다.
- **저장소 문서**(`CLAUDE.md`·`app.md`·`AGENTS.md`·`README.md`·`_docs/**`·intent)는 **팀장 전달로 고친다** — 낡은 문서 자체가 결함이다.
- 🔴 **`.claude/settings*.json`**(세션 자신의 권한·도구 접근 설정)은 **대표가 이 세션 창에 직접 말한 경우에만** 고친다 — 막으려는 것은 세션이 자기 권한을 스스로 넓히는 것이다.
- 🟠 제약이 잘못돼 보이면 우기지 말고 대표께 올려 규칙 자체를 바꾼다. 근거와 경위는 `COMMON_STANDARDS.md` §28(2026-09-11 대표 확정).

## 실운영 모드와 감사 주기 (2026-09-03 대표 지시 + 2026-09-10 §25 확정, Portal과 동일 방침)
- **정기 종합감사는 분기 말(3·6·9·12월 말)에 돈다 — 다음은 2026-12-31**(`COMMON_STANDARDS.md` §25). 그날이 지나면 다음 분기 말이 기준이다.
- **그 사이에는 이 세션이 스스로 재감사나 추가 작업을 먼저 제안하지 않는다.** 종합감사가 10/10으로 확정되면 "그만 만들어도 된다"는 신호이고,
  그 뒤로는 운영 이슈 대응과 팀장이 명시적으로 요청하는 작업만 한다. 팀장이나 대표가 요청하면 그 즉시 정상적으로 응답·작업한다.

## 대표와의 소통 경로 (2026-08-26 확정 — 반드시 지킬 것)
이 세션은 대표와 직접 대화를 시작하지 않는다. 진행상황 공유·질문·의사결정 요청은 전부 **팀장(D:\Projects 최상위 세션, "Project Engineering")을 거쳐서만** 한다 — 대표가 이 세션 창을 직접 열어서 먼저 말을 걸어온 경우에만 그 건에 한해 답한다(최상위 CLAUDE.md "조직 구조" 섹션 참고). 팀장에게서 온 메시지("Project Engineering의 메시지")는 곧 대표의 지시가 전달된 것이므로 별도로 대표에게 재확인하지 말고 그대로 실행한다.
