# RULES — Poster Studio 규칙 장부

> Bumm님이 정하거나 바로잡은 것을 **들은 그 자리에서 한 줄로** 적는 장부다(헌법 §12, `COMMON_STANDARDS.md` §38).
> 대화에만 두면 요약 · 전달 · 다음 날에서 샌다. 팀장이 전한 지시도 받은 세션이 여기에 적는다.
> 일을 시작하기 전에 이 표를 끝까지 읽고, 그 일에 걸린 규칙을 **모두** 검사기에 넣는다.
> 바뀐 규칙은 지우지 않고 상태를 «대체됨 → R-n»으로 바꾼다. 사고의 사연은 `.claude/rules/app.md`에 두고 여기엔 규칙만.
> 이 파일은 `CLAUDE.md`의 `@_docs/RULES.md`로 세션마다 저절로 읽힌다 — 한 규칙 한 줄로 짧게 쓰고, 대체된 줄이 쌓이면
> `_docs/archive/RULES-superseded.md`로 옮긴다(번호는 그대로). 일을 시작할 때와 완료 보고에 «읽은 것: R-3 · R-7»을 적는다.
> 원본 양식: `D:\Projects\_shared\doc-kit\`
> 이 장부는 2026-11-22에 `.claude/rules/app.md` · `CLAUDE.md` · `AGENTS.md`에 흩어져 있던 Bumm님 지시를 모아 처음 만들었다. 날짜가 «출처 문서»인 줄은 원문이 그 문서에 정리돼 있다는 뜻이다.

**«검사» 칸**: 검사기 이름(`scripts/…`, 시험 이름) · «직접 열어 확인»(실제 프로그램으로 연다) · «검사기 없음» 셋 중 하나.
«검사기 없음»이 남아 있으면 그 규칙은 지켜진다는 보장이 없는 것이다 — 그 규칙이 걸린 일을 시작하기 전에 검사기를 만든다.

| 번호 | 날짜 | 범위 | 규칙 | Bumm님 원문 | 검사 | 상태 |
|---|---|---|---|---|---|---|
| R-1 | 2026-11-14 | 전체 | 모든 말 · 보고 · 커밋 설명은 한국어로만 쓴다 | «뭐라고 얘기하는지 하나도 모르겠어 한글로 말해라» | 직접 열어 확인 | 유효 |
| R-2 | 2026-11-14 | 문서 수정 | 팀장이 전한 지시는 Bumm님 지시다 — `CLAUDE.md` · `AGENTS.md` · `.claude/rules/` 수정과 커밋은 재확인 없이 한다. `.claude/settings*.json`만 Bumm님 직접 지시 | 출처: CLAUDE.md «자율 권한» | 검사기 없음 | 유효 |
| R-3 | 2026-11-07 | 운영 규모 | 처리량 · 부하 계산의 기준은 노트북 운영 2대 · 프린터 운영 2대(예비 1대는 세지 않는다). 노트북 3 · 프린터 3 · KT EGG 2 · 공인 IP 3 | 출처: app.md «앱» (Bumm님 11/7 교육청 제출 계획서) | 검사기 없음 | 유효 |
| R-4 | 2026-09-11 | 부하테스트 | 라이브 부하테스트를 하지 않는다(행사 당일은 더욱). 도구는 남기되 `--confirm` 없이 돌지 않는다 | «부하테스트 - 하지 맙시다» | `scripts/loadtest.mjs` `--confirm` 거부 시험 | 유효 |
| R-5 | 2026-09-11 | 주소 | 정식 주소는 poster.edutogether.kr, 옛 주소 poster-studio.web.app도 계속 살아 있어야 한다(둘 다 CORS 허용 · CI가 매 배포 확인) | 출처: app.md «앱» (Bumm님 9/10) | `functions/test/index.test.js` 옛 주소 허용 · deploy.yml 배포 후 확인 | 유효 |
| R-6 | 2026-10-01 | 화면 문구 | `!` · `?` 앞에는 한 칸을 띄운다(코드 · URL 제외) | 출처: 헌법 §2 (Bumm님 10/1) | `test/punctuation-spacing.test.js` | 유효 |
| R-7 | 2026-10-07 | 파비콘 | 파비콘은 InKY 노란 카메라 정적 아이콘 하나이고, 그림을 바꾸면 `?v=` 날짜도 같이 올린다 | «다른 앱들도 아이콘 주소에 날짜 붙여» | `test/favicon.test.js` | 유효 |
| R-8 | 2026-11-06 | 화면 색 | 늘 밝은 화면으로 둔다(`color-scheme: only light`) — 핸드폰 설정에 의지하지 않는다 | «핸드폰 설정에 의지하지 말고» | `test/color-scheme.test.js` · `scripts/verify/dark-mode-probe.mjs` | 유효 |
| R-9 | 2026-11-11 | 움직임 | 화면 코드 어디서도 `prefers-reduced-motion`을 읽지 않는다 — 스플래시 · 예시 영상 · 로딩은 그 신호로 멈추지 않는다 | «여덟 앱 모두 같은 규칙: 움직임 줄이기 신호로 멈추는 것은 하나도 남기지 않는다» | `test/reduced-motion.test.ts` · `scripts/verify/reduced-motion-probe.mjs` | 유효 |
| R-10 | 2026-10-23 | 부스 코드 | 부스 코드는 쓰지 않는다(장치는 남김). 행사 날(11/14)에도 두 단추 그대로 — 막는 것은 서버 한도뿐 | 출처: app.md «라이브 동작 스위치» (Bumm님 10/20 · 10/23) | `test/studio-mode.test.ts`(`LIVE_MODE`=`both`) | 유효 |
| R-11 | 2026-09-10 | 개인정보 | 이름 · 단체명 · 출연진을 서버로 보내지 않는다 | 출처: app.md «절대 하면 안 되는 것» (화면 고지 약속) | `test/poster-studio.test.tsx` «개인정보: 서버로 보내는 것» | 유효 |
| R-12 | 2026-08-30 | 개인정보 | Firestore에는 숫자 카운터 · 사진 해시만 둔다. 예외는 `feedback` · `kakaoAuth` 둘뿐 — 넓히지 않는다 | 출처: CLAUDE.md «알아야 할 것» (대표 승인 조건) | `functions/test/index.test.js` `validateFeedback` | 유효 |
| R-13 | 2026-10-26 | 개인정보처리방침 | 방침 문구는 현행 유지 — 10/26 대조에서 나온 차이는 결함으로 다시 올리지 않는다 | 출처: app.md «데이터» (Bumm님 10/26 결정) | 검사기 없음 | 유효 |
| R-14 | 2026-11-03 | 방침 화면 | 개인정보처리방침 휴대폰 화면은 양쪽 맞춤(390 기준, 줄마다 낱말 간격 5px 이하) | 출처: app.md «데이터» (Bumm님 11/3 캡처 13) | `scripts/verify/privacy-justify-probe.mjs` | 유효 |
| R-15 | 2026-11-08 | 현장 의견 | 의견 보내기는 보내는 여섯 칸 밖을 받지 않고, 2026-11-14 00:00(KST)에 저절로 닫힌다. Voice Cinema 의견은 받지 않는다 | «받을 필요 없어» · 출처: app.md «현장 의견 받기» (Bumm님 11/5 · 11/8) | `functions/test/index.test.js` · `test/feedback.test.tsx` | 유효 |
| R-16 | 2026-10-25 | AI 지시문 | 장르 × 혼자/단체 16칸의 지시문 판은 Bumm님 확정 없이 바꾸지 않는다 | 출처: app.md «AI 지시문 선택표 — 동결본» (Bumm님 10/25) | `FROZEN_CELLS` · `functions/test/fixtures/prompt-*.json` | 유효 |
| R-17 | 2026-10-26 | 안전 차단 | 안전 차단(moderation_blocked)은 같은 요청을 되풀이하는 단추 · 지시문 자동 변경 · 우회를 만들지 않는다. 품질 한계는 화면 · 설명서에 넣지 않는다 | 출처: app.md «AI 지시문 선택표» (Bumm님 10/26) | `test/poster-studio.test.tsx` `safetyBlockedRef` | 유효 |
| R-18 | 2026-10-16 | AI 실패 | 실패하면 종류별 «다시 만들기» · «다시 찍기»만 — 빈 그라데이션 «AI 없이 계속하기» 인쇄는 없앴고 되살리지 않는다 | 출처: CLAUDE.md «알아야 할 것» (10/16) | `test/poster-studio.test.tsx` · `src/generateFailure.ts` | 유효 |
| R-19 | 2026-10-06 | 대기 영상 | 얼굴은 주황 눈 두 개뿐(08번만 벌린 입) — 입 · 이빨 · 혀 · 미소선 · 눈썹을 만들지 않는다 | «미소선도 지운다» · «입 · 이빨 · 혀 · 미소선은 하나도 남기지 않는다»(10/8 · 10/10) | `scripts/media/check-face-elements.py` · `check-visor-still.py` | 유효 |
| R-20 | 2026-10-12 | 대기 영상 | 정지 그림은 그 편 영상의 첫 프레임이고, 처음 · 끝을 그림에 겹치지 않는다(유령 금지) | 출처: app.md «대기 영상» (Bumm님 10/12 Q18) | `test/waiting-video-assets.test.js` | 유효 |
| R-21 | 2026-10-08 | 영상 비용 | 유료 생성 시작 전마다 팀장에게 «무엇을 몇 번 · 예상 $X · 누적 $Y» 한 줄을 보낸다(상한은 없음). 같은 방식 두 번 실패하면 세 번째 없음 | «비용 상한 없애고, 그냥 다음에는 얼마 정도 든다 이것만 계속 알려 줘» | 직접 열어 확인(`cost-log.jsonl`) | 유효 |
| R-22 | 2026-10-19 | 예시 영상 | Higgsfield 등 유료 영상 생성은 매번 Bumm님 허락이 먼저다(10/19 허락은 촬영 예시 두 편까지) | 출처: app.md «촬영 화면 예시 영상» (Bumm님 10/19) | 검사기 없음 | 유효 |
| R-23 | 2026-11-13 | 예시 영상 | 단체 예시 영상은 v11 1080p를 그대로 쓴다(다시 뽑지 않음). Higgsfield 로고 자리 · 크기(영상 기준 폭 140 · 위 19.3 · 오른쪽 24.6)는 확정 | «로고는 훨씬 낫네. 이대로 … 모두 확정» | `test/camera-example.test.tsx` | 유효 |
| R-24 | 2026-11-12 | 2단계 화면 | 2단계 사진 칸 아래 안내 줄(`.camera-bottom`)은 개인 · 단체 모두 없다 | «모두 잘 보이게 서주세요. 빼» · «개인에서도 이거 빼버려» | `test/poster-studio.test.tsx` | 유효 |
| R-25 | 2026-10-31 | 2단계 배치 | 1366 · 1600 폭의 «나답게 …» 제목 20px 어긋남은 그대로 확정 — 결함으로 올리지 않는다 | «1440만 맞추고 나머지는 둔다» · 출처: app.md (Bumm님 10/31) | `scripts/verify/step2-geometry.mjs` | 유효 |
| R-26 | 2026-11-08 | 샘플 사진 | «샘플 포스터 보기» 사진은 웹 · 설치판이 같다 — 혼자는 카디건 사진, 단체는 «찰칵 포즈» 스틸 | «그 가디건 걸친 거 있잖아 원래 초반에 우리가 할려고 했던 거 그걸 써야지» | `test/desktop-and-download.test.tsx` · `desktop-crop-probe.mjs` | 유효 |
| R-27 | 2026-11-13 | 포스터 배치 | 아치 · 폴라로이드 · 타이포그래피 · 필름스트립은 덮어 채운다(양끝이 잘려도). 흐린 층에 그림을 다른 크기 · 자리로 깔지 않는다 | «위에 지워지는 거 개짜증나는데 좌우 얼굴 옆쪽을 잘라서라도 최대한 채워» | `test/templates.test.js` · `test/arch-placement.test.ts` | 유효 |
| R-28 | 2026-10-27 | 설치판 | 설치판에는 AI가 없고 서버 요청 · 부스 토큰이 0이다(`connect-src 'self'`) | 출처: app.md «Windows 설치판» (Bumm님 10/27) | `scripts/verify/desktop-app-probe.mjs` · `test/desktop-guards.test.js` | 유효 |
| R-29 | 2026-11-03 | 설치판 | 설치 위치 기본값은 `C:\Program Files\InKY Film Festival\Poster Studio`이고 위치 화면에서 바꿀 수 있다. 모든 사용자 설치만 한다 | «위치는 바꿀 수 있어야 — 기본 위치만 Program Files» | `scripts/verify/desktop-installer-probe.ps1` | 유효 |
| R-30 | 2026-10-28 | 설치기 | 설치 · 제거에 PowerShell을 쓰지 않는다. 검사 창은 아래 모니터에만, 위 모니터에는 한순간도 뜨지 않게 | «관리자: Windows PowerShell 창이 뜬다» · «위 큰 모니터 두 대에는 한순간도» | `installer-window-watch.ps1` | 유효 |
| R-31 | 2026-11-03 | 설치판 | 설치판 최소 창은 안쪽 1100×648이고, 이보다 키우지 않는다 | «창을 끌어 너무 작게 만들면 많이 깨진다» | `desktop-window-sweep.mjs` | 유효 |
| R-32 | 2026-11-05 | 설치판 판 번호 | 판 번호는 2.7.4에서 다시 세고, `app-version.mjs`가 커밋에서 센다 | «2.7.4 버전으로 써줘» | `node scripts/build/app-version.mjs --selftest` | 유효 |
| R-33 | 2026-10-27 | 설치 파일 공개 | 설치 파일은 Hosting에 넣지 않고 Cloud Storage 객체 하나(`PosterStudio-Setup.exe`)만 공개한다. 교체는 팀장 OK 뒤에만 | 출처: app.md «첫 화면 다운로드 아이콘» (Bumm님 10/27 A안) | `scripts/verify/download-live.mjs` | 유효 |
| R-34 | 2026-11-03 | 다운로드 단추 | 첫 화면 다운로드는 아이콘 하나이고 휴대폰(폭 760 이하)에서는 보이지 않는다. 누르기 전 설치 파일 요청은 0건 | «모바일에서는 첫 페이지 다운로드 버튼 없애» | `test/download-link.test.tsx` | 유효 |
| R-35 | 2026-10-17 | 휴대폰 | 휴대폰 정리는 `studio.css` 맨 끝 한 덩어리에 모으고 PC 화면은 바꾸지 않는다. 화면을 바꾼 커밋마다 `mobile-layout-probe.mjs`를 손으로 돌린다(CI에는 넣지 않음) | «요즘 애들은 다 핸드폰으로 본다» · 출처: app.md (팀장 결정 10/26) | `scripts/verify/mobile-layout-probe.mjs` | 유효 |
| R-36 | 2026-11-03 | 알림 · 3단계 | 화면 알림은 가운데에 잠깐 떴다 사라진다. 휴대폰 3단계 포스터 줄은 좌우로만 움직인다 | «왼쪽 구석은 보이지 않는다» · «위아래로 쓸데없이 움직여 혼란» | `scripts/verify/status-toast-probe.mjs` | 유효 |
| R-37 | 2026-10-08 | 외부 도구 | Bumm님 Chrome이나 돈이 드는 외부 도구를 새로 쓰기 전에 팀장에게 «무엇을 · 몇 분/몇 장 · 비용» 한 줄을 보낸다. 쓰던 탭 · 대화 · 입력칸은 건드리지 않는다 | «적어도 보고하고 시작해라» | 검사기 없음 | 유효 |
| R-38 | 2026-09-22 | 확인 방법 | 브라우저 확인의 기본은 세션 자신의 브라우저(내부 · 헤드리스)다. 확인하려고 라이브에서 «생성»을 누르지 않는다(실비 $0.05) | 출처: app.md «자주 틀리는 것» (대표 2026-09-22) | 직접 열어 확인 | 유효 |
| R-39 | 2026-11-01 | 배포 도구 | firebase-tools는 잠금 파일에 두지 않고 `npx --yes firebase-tools@15.37.0`으로 쓴다(`deploy.yml`의 `FIREBASE_TOOLS` 한 곳) | 출처: app.md «절대 하면 안 되는 것» (Bumm님 11/1 결정) | `deploy.yml` | 유효 |
| R-40 | 2026-09-09 | 배포 · 롤백 | 수동 `firebase deploy`는 하지 않는다(예외: keepWarm · GitHub 정지 중 로컬 배포). 되돌릴 때도 CI 경로(`git revert -m 1` + push). PR은 사람이 머지 버튼을 누른다 | 출처: app.md «자주 틀리는 것» (팀장 9/9 확정) | 검사기 없음 | 유효 |
| R-41 | 2026-11-17 | 가지 이름 | 기본 가지는 `main`이다(`master`에서 바꿈). 명령에 `master`를 넣지 않는다 | 출처: app.md (Bumm님 지시 11/17) | `deploy.yml`의 `branches: [main]` | 유효 |
| R-42 | 2026-11-04 | 행사 당일 배포 | 행사 당일(11/14)에는 바뀐 파일이 전부 `desktop/`인 커밋도 배포를 건너뛴다(그날 설치판만 낼 때는 문서를 따로 커밋) | 출처: app.md «CI» (Bumm님 11/4 결정 3 ①) | `test/deploy-filter-step.test.js` | 유효 |
| R-43 | 2026-11-19 | 의존성 | 의존성은 안정된 최신판만 둔다(§36). `overrides`는 걷었고 `npm audit fix --force`를 `functions/`에서 돌리지 않는다. 시험은 약하게 만들지 않고 고친다 | 출처: 팀장 전달 11/19 (COMMON_STANDARDS §36) | `npm test` · `npm audit` | 유효 |
| R-44 | 2026-08-26 | 소통 | 대표와 직접 대화를 시작하지 않는다 — 질문 · 보고는 팀장을 거쳐 «번호 + 선택지 + 추천»으로. 선택 창(AskUserQuestion)을 쓰지 않는다 | 출처: CLAUDE.md «대표와의 소통 경로» (2026-08-26) · 헌법 §9 | 검사기 없음 | 유효 |
| R-45 | 2026-09-10 | 감사 주기 | 정기 종합감사는 분기 말(다음 2026-12-31). 그 사이 스스로 재감사나 추가 작업을 제안하지 않는다 | 출처: CLAUDE.md «실운영 모드와 감사 주기» (대표 9/3 · §25) | 검사기 없음 | 유효 |
| R-46 | 2026-11-21 | 장부 | Bumm님 지시는 이 장부에 들은 자리에서 적고, 여러 건 · 반복 작업은 규칙을 전부 모은 뒤 검사기로 잰다. 자잘한 수정 중에는 전체 검사기를 돌리지 않는다 | «글자 하나 고치는 데도 검사기가 맨날 풀로 돌아 몇 시간씩 걸리고 토큰을 엄청 쓴다» | 직접 열어 확인 | 유효 |
