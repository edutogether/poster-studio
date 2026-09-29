# HANDOFF_CURRENT — Poster Studio 공통 인계 문서

**Claude와 Codex가 같이 쓰는 단 하나의 인계 문서다.** 도구별로 따로 원장을 만들지 않는다.
작업을 **시작하기 전에 이 문서를 먼저 읽고**, 넘길 때 이 문서를 고친 뒤 넘긴다.
비밀값(API 키·토큰·서비스 계정)은 이 문서에 절대 쓰지 않는다 — 이름과 보관 위치만 적는다.

| 항목 | 값 |
|---|---|
| **현재 담당** | **Codex (일시)** — Claude가 AI Ways Incheon을 개발하는 동안 사용량을 나누기 위한 것이다. 영구 이관이 아니다 |
| **마지막 인계 방향** | Claude → Codex (2026-09-29, Bumm님 직접 지시) |
| 저장소 | `edutogether/poster-studio` · 기본 가지 `master`(= 라이브 배포 가지) |
| 인계 가지 | `handoff/codex-20260929` — 이 문서와 안내 한 줄씩만 담은 문서 커밋. **master에는 아직 없다** |
| 인계 기준 master | `facd660194a13816c528e5d7207bde7fe7de32cd` |
| 라이브 코드 기준 | `696f351`(React 19.3.0, 2026-09-27 배포). 그 뒤 master 커밋은 문서·PR 검사 워크플로뿐이라 배포물은 그대로다 |

---

## 1. 인계 절차 — "Codex로 인계" / "Claude로 인계"라고 하면 이대로 한다 (2026-09-29 Bumm님 확정)

1. 새 작업 착수를 멈추고 진행 중인 변경을 안전한 상태로 정리한다.
2. 미커밋 변경을 확인하고 **다른 작업자의 변경은 보존한다**(남의 가지·파일을 지우거나 덮지 않는다).
3. 이 문서를 갱신하고 **자기 변경만** 작업 가지에 커밋·푸시한다. 미완료 작업은 미완료라고 명시한다.
4. 원격 반영을 확인하고, 저장소·가지·최종 커밋 **전체 SHA**·이 문서 경로·다음 작업을 채운 인수 프롬프트를 준다.
5. **넘긴 쪽은 이 앱의 수정을 잠시 멈춘다.** 다시 인수할 때는 아래 "인수할 때 할 일"로 변경분만 확인하고 이어간다.

- 인계를 위해 **전체 검사·전체 감사를 되풀이하지 않는다.** 마지막 검증 기록(§5)을 옮기고, 그 뒤 달라진 것만 적는다.
- 인계 과정에서 **병합·배포·삭제·강제 푸시를 하지 않는다.**

### 인수할 때 할 일 (어느 도구든)

```bash
git fetch --all --prune
git log --oneline <이 문서의 "최종 커밋">..origin/master      # 넘긴 뒤 master에 들어온 것
git log --oneline --all --since=<마지막 인계 날짜>             # 다른 가지에서 생긴 것
git diff <이 문서의 "최종 커밋"> origin/master -- _docs/ops/HANDOFF_CURRENT.md AGENTS.md CLAUDE.md .claude/rules/app.md
```

변경분이 없으면 §4 "다음 작업"부터 이어간다. 처음부터 다시 조사하지 않는다.

---

## 2. 앱 목적·구조·적용 규칙

- **무엇**: 제4회 인천어린이청소년영화제(**2026-11-14, 인천 CGV, 10:30~15:00**) 체험부스 웹앱. 웹캠 사진 → AI 포스터 그림
  → 브라우저 캔버스가 제목·크레딧을 합성해 4종 → 4×6 인화지 즉석 인쇄. 명단 기준 참가자 **최대 2000명**.
- **구조**: 프론트 `src/`(TypeScript + React 19.3 + Vite 7) → 빌드 `dist/` → Firebase Hosting.
  백엔드 `functions/index.js` 하나(Cloud Functions v2 `posterStudio`, asia-northeast3) — OpenAI 이미지 생성 중계만.
  Firebase 프로젝트 `inky-poster-studio`. 주소 둘 다 살아 있어야 한다: `https://poster.edutogether.kr`(정식) · `https://poster-studio.web.app`.
- **운영 규모**(2026-09-11 확정): 노트북 6대 = 가동 4 + 대기 2, 포토프린터 3대(충전하며 인쇄), 공인 IP 3개.
  먼저 막히는 곳은 서버가 아니라 **프린터**다(`_docs/ops/printer-capacity.md`).
- **적용 규칙은 원문을 읽는다** — 이 문서에 다시 베끼지 않는다:
  `AGENTS.md`(모든 도구 공통: 명령·배포·금지·함정 9개·조직 공통 규칙) → `.claude/rules/app.md`(이 앱의 금지사항 전부) →
  `CLAUDE.md`(Claude 전용 운영 규칙) → `.claude/rules/intent-workflow.md`(작업 의도 문서 등급).
- 모든 답·문서·커밋은 **한국어**, 앱 이름은 정식 이름만(Poster Studio, AI Ways Incheon 등).

---

## 3. LOCKED — Bumm님 확인 없이 바꾸지 않는 것

| 영역 | 왜 잠겼나 / 지키는 장치 |
|---|---|
| **포스터 출력 픽셀**(`src/layout.ts`·`templates.ts`·`poster.ts`와 그 입력) | 🔴 아이가 인쇄해 가는 포스터가 **1픽셀도 달라지면 안 된다.** 바꿀 일이 있으면 `scripts/verify/poster-pixels-ui.js`로 전/후 지문을 떠서 20쌍 0건을 확인한다 |
| 이름·단체명·출연진 **서버 미전송** | 🔴 `privacy.html`의 약속. `test/poster-studio.test.tsx` "개인정보: 서버로 보내는 것" 2건이 지킨다 — 지우지 않는다 |
| Firestore = **정수 카운터 4종 + 사진 SHA-256만** | 개인정보 추가 금지(승인 조건) |
| 타임아웃 4단 체인 120 < 125 < 140 < 150초 | 하나만 바꾸면 임시 사진 삭제가 안 돈다 |
| 레이트리밋 IP = `clientIpForRateLimit()`(XFF 맨 오른쪽) | `req.ip`로 되돌리면 헤더 한 줄로 뚫린다(라이브 재현 이력) |
| 한도값 `RATE_LIMIT_MAX=150`·`IP_RATE_LIMIT_MAX=50`·`PHOTO_GENERATION_LIMIT=2`·`DAILY_BUDGET_MAX=4000` | IP 3개 전제로 산정. 재산정 조건은 "공인 IP 개수 변경" |
| `ALLOWED_ORIGINS` 두 주소 + 앵커(`^…$`) | 옛 주소 테스트를 지우지 않는다. 서브도메인은 규칙 완화가 아니라 항목 추가 |
| `BOOTH_TOKEN` 변경 | `src/constants.ts`와 Secret Manager를 **같은 커밋·같은 배포**로 |
| og 태그 값(`index.html`) | 포털이 정한 6개 앱 공통 규칙 |
| 스플래시 두 바퀴 하한(`src/style.css`의 `--splash-cycle`·`--splash-min-cycles`) | 조직 표준 §27 |
| 부하테스트 | 하지 않기로 결정(2026-09-11). 행사 당일 라이브 부하 금지 |
| `.claude/settings*.json` | 세션 권한 파일 — **Bumm님이 그 세션 창에 직접 지시할 때만** |
| `deploy.yml` test 잡 ↔ `pr-check.yml` | 검사 단계가 같아야 한다. 한쪽을 바꾸면 다른 쪽도 |

---

## 4. 작업 현황

### 완료 (최근 것부터)

- 2026-09-29 Codex 일시 인수 — 지정 커밋 `cab49455d9cb7be33fbefb17ad392ff8261c526c`와 원격 가지 일치, 미커밋 변경 없음, 인계 뒤 master 추가 커밋 없음 확인. 문서 반영 [PR #3](https://github.com/edutogether/poster-studio/pull/3)을 열었다. 병합은 사람 확인 대기이며 배포하지 않았다.
- 2026-09-27 `facd660` — PR 자동 검사 워크플로 `PR Check`(`.github/workflows/pr-check.yml`). 확인 PR #2: 깨뜨린 커밋 빨강 → 되돌린 커밋 초록(24초), 합치지 않고 닫음.
- 2026-09-27 `105468c` — `AGENTS.md`에 조직 공통 규칙 절(클라우드·Codex 대비), 199→180줄.
- 2026-09-27 `696f351` — React 19.2.8 → **19.3.0**(react·react-dom·두 타입 패키지, `scheduler` 0.28 동반). 배포·라이브 확인 끝.
- 2026-09-22 `786cd1d` — 브라우저 확인 기본을 세션 자체 브라우저로(Bumm님 Chrome은 요청 시에만).
- 2026-09-17 `12721b8`·`2a5f865` — 포스터 버전 썸네일 대체 텍스트, 키보드 선택(div → button).
- 더 이전 이력은 `_docs/CHANGELOG.md`.

### 진행 중

- **없음.** 이 인계 시점에 반쯤 된 코드 변경은 없다.

### 다음 작업 (담당이 이어서 할 것)

1. **[문서 PR #3](https://github.com/edutogether/poster-studio/pull/3) 사람 병합 대기** — 문서만 담은 가지다. Codex는 병합하지 않는다.
2. **2026-09-30 분기 정기 종합감사** — 여덟 저장소가 같은 날 돈다(조직 표준 §25). 채점 원문은 `817beatles/projects`의 `COMMON_STANDARDS.md` §4~§7.
   점수 표기는 `10/10 (YYYY-MM-DD 트리 기준, 이후 커밋 N건)`, N은 `git rev-list --count poster-studio-freeze-20260910-audited-100..master`로 센다.
3. **외부 확인 대기(재촉하지 않는다)** — 교육청 장학사에게 ① 실제 한 장 인쇄 시간 ② 인화지 팩 규격·수량(~400장).
   인쇄가 3분이면 프린터 3대 구성에서 60장이 모자란다 — 이 구성의 유일한 위험이다.
4. **다른 작업자의 가지 `claude/cloud-session-setup`**(`db73821`, 2026-09-28, Claude 클라우드) — 클라우드 세션용
   `SessionStart` 훅과 `scripts/cloud-session-start.sh`. **master 미반영, 팀장 확인 대기.** `.claude/settings.json`을 바꾸므로
   **Bumm님 직접 확인 대상**이다. 이 인계에서는 손대지 않고 보존했다.
5. **알려진 작은 문서 어긋남(미처리, 감사 때 함께)** — `CLAUDE.md`·`.claude/rules/app.md`의 테스트 개수 표기(65·68개, 실제 71·71개),
   `_docs/intents/README.md`의 loadtest 행 상태가 `draft`인데 파일은 `dropped`.
6. 행사 당일 운영은 `_docs/ops/runbook.md`.

---

## 5. 검증 결과와 미검증 항목

**마지막 전체 검증 — 2026-09-27, 코드 `696f351`(현재 라이브와 같은 코드)**:
루트 lint·typecheck·test 71·build·fonts:check·verify:selftest, functions test 71·lint 전부 통과, 새 경고 0건.
포스터 픽셀 지문 **20쌍 불일치 0건**(두 번), 화면 스냅샷 4조합 전↔후 0건, CI 4잡 통과,
라이브 두 주소 번들 `main-ry86cvGP.js`·요소 id 25/25·콘솔 오류 0건·스플래시 약 3.2초에 걷힘.

**그 뒤 바뀐 것**: 문서, `pr-check.yml`(PR #2에서 빨강·초록 확인). 이 인계 커밋은 문서만이라 검사를 다시 돌리지 않았다.

**미검증**:
- **React 19.3.0 이후 라이브 실제 `/generate`(OpenAI 호출)** — 검증 도구가 응답을 가로채 비용 0으로만 확인했다.
  마지막 실제 생성은 2026-09-11($0.08). 실제 호출은 과금이므로 지시가 있을 때만.
- **실제 프린터 출력** — 자동 검증 범위 밖. 현장 리허설 몫.
- 라이브 스플래시 **첫 페인트 시각**은 따로 재지 않았다(걷히는 시각만 잼).

---

## 6. 실제 배포 상태 (2026-09-29 확인)

- 두 주소 모두 번들 `/assets/main-ry86cvGP.js`(React 19.3.0) 서빙 중.
- 마지막으로 배포 잡이 돈 실행: `36291384513`(`696f351`, 2026-09-27, 성공). 이후 실행은 문서 커밋이라 배포 잡이 건너뛰어졌다.
- 되돌릴 지점: `poster-studio-freeze-20260927-pre-react-19.3`(= `786cd1d`, 되돌려 태그와 0건 차이 확인함),
  `poster-studio-freeze-20260910-audited-100`(= `c6608b9`, 대조용). 되돌리기는 CI 경로(`git revert` + push)로만.
- **`master`에 push = 라이브 배포.** 클라우드·Codex는 작업 가지 → PR이고, PR이면 `PR Check`가 자동으로 돈다.

---

## 7. 로컬(집 PC)에만 있는 필수 환경

비밀값은 적지 않는다. **클라우드에서는 아래가 없으므로 해당 작업을 하지 않는다.**

| 무엇 | 쓰는 곳 |
|---|---|
| Firebase·Google Cloud 로그인(`firebase` 15.x, `gcloud`) | `keepWarm` 스케줄 변경 배포(유일한 수동 배포 예외), Secret Manager 교체 |
| Secret Manager의 `OPENAI_API_KEY`·`BOOTH_TOKEN` | Functions 실행 — 값은 콘솔에만 있다 |
| GitHub 저장소 비밀 `FIREBASE_SERVICE_ACCOUNT` | CI 배포 잡 전용. PR 검사는 쓰지 않는다 |
| `gh` 로그인(`817beatles`) | CI 결과 확인·PR |
| Chrome(헤드리스 CDP) + `ffmpeg` | 화면 대조·가짜 카메라 촬영 검증(`.claude/rules/app.md` "카메라를 타는 흐름") |
| Python + `fonttools`(woff2) | 폰트 서브셋 재생성(`scripts/fonts/subset.py`) — 화면 문구에 새 글자가 들어갈 때 |
| Node | CI는 22, 집 PC는 24. 둘 다 통과 확인됨 |
