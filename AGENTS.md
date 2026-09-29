# AGENTS.md — Poster Studio

이 저장소에서 작업하는 **모든 AI 코딩 도구**(Claude Code, Codex 등)를 위한 안내다.
클로드 전용 규칙은 `CLAUDE.md`·`.claude/rules/app.md`, 이력은 `_docs/CHANGELOG.md`에 있고,
여기엔 **어떤 도구로 열든 알아야 하는 것**만 적는다. **작업 전에 공통 인계 문서 `_docs/ops/HANDOFF_CURRENT.md`(담당·현재 상태)를 먼저 읽는다.**

---

## 조직 공통 규칙 — 다른 도구·클라우드에서도 (D:\Projects 헌법 요약)

이 저장소만 받아서 일하는 도구(Codex 클라우드, Claude Code 클라우드, 다른 기기)는 `D:\Projects`의 공통
문서를 못 본다. 그래서 꼭 지켜야 할 것을 여기 옮겨 둔다. 원본은 `817beatles/projects`의 `_shared/constitution.md`.

- **사람**: 최종 결정권자는 **Bumm님**. 모든 답·문서·커밋은 **한국어**, 호칭은 늘 "Bumm님".
- **앱 이름**은 정식 이름 하나로만: CLASSCADE · Poster Studio · Be a Googler · Voice Cinema · Portal ·
  Codyssey · InKY Calculator · AI Ways Incheon (줄임말·별명·번역어 금지).
- **보고 경로**: 앱 담당은 팀장(Project Engineering)과만 주고받는다. Bumm님이 직접 말을 걸면 그 건만 직접 답한다.
- 🔴 **`main` 푸시 = 라이브 배포.** Codex·클라우드·다른 기기에서 한 작업은 `main`에 직접 푸시하지 않는다 —
  작업 가지 → PR로 내고, 합치는 것은 팀장 확인 뒤. 되돌리기는 CI로만(프리즈 태그 기준), 라이브에 직접 손대지 않는다.
- 🔴 **멈추고 Bumm님께 묻는 것**: 콘솔 전용 작업(Firebase/GCP), 돈이 드는 결정, 법률·정책 판단, 되돌리기 어렵거나
  파괴적인 행동, 영구 식별자(프로젝트·사이트 ID, 버킷 이름) 생성, 새 제품 방향.
- **한 번에 완성**: "일단", "차선책", "우회", "나중에" 금지. 제대로 못 하면 멈추고 보고. `TODO`/`FIXME`/`임시` 금지.
  검사를 느슨하게 하거나 빼서 통과시키지 않는다. 검사는 실제로 돌리고 종료 코드로 확인한다.
- **숨길 것**: 어드민 화면·기능은 저장소·배포·커밋 어디에도 드러내지 않는다. 비밀 키·토큰·인증 코드는 쓰지 않는다.
- **인계(도구·기기를 바꿔 가며 이어서 할 때)**: 단계를 끝낼 때마다 작업 가지에 올리고, PR 설명에
  "한 일 / 다음에 할 일 / 주의할 것"을 적는다. 같은 가지를 두 도구가 동시에 고치지 않는다 — 한쪽이 올린 뒤 이어받는다.
- **로컬(집 PC) 전용 작업** — 클라우드에서는 하지 않는다: 콘솔 작업, 운영 데이터 읽기·쓰기, 배포 승인,
  집 PC 모니터를 쓰는 측정. 클라우드는 코드 수정·검사·PR까지만.
  **이 앱에서는 특히**: 라이브 `/generate` 호출(한 번이 실제 OpenAI 과금 약 $0.04 + 실사용 카운터 소모 —
  `npm run dev`로 띄운 로컬 화면도 라이브 Functions를 부른다), `scripts/loadtest.mjs --confirm` 실행,
  Secret Manager의 `BOOTH_TOKEN`·`OPENAI_API_KEY` 교체.

> 이 저장소의 기본 가지는 **`master`**다 — 위의 `main`은 여기서 `master`로 읽는다.

---

## 이 앱이 뭔가

제4회 인천어린이청소년영화제(**2026-11-14, 인천 CGV**) 체험부스 웹앱. 아이가 웹캠으로 사진을 찍으면
AI가 영화 포스터 그림을 만들고, 브라우저 캔버스가 제목·크레딧을 합성해 4종을 만든 뒤 4×6 인화지로 즉석 인쇄한다.

- **프론트엔드** TypeScript + React 19 + Vite. 소스 `src/`, 배포되는 것은 빌드 산출물 `dist/` → Firebase Hosting.
  주소는 **`https://poster.edutogether.kr`**(정식), `https://poster-studio.web.app`도 계속 살아 있다(이미 나간 링크용).
- **백엔드** `functions/` → Cloud Functions v2 `posterStudio`(asia-northeast3) — OpenAI 이미지 생성 중계 하나뿐.
  Firebase 프로젝트 `inky-poster-studio`.

**행사용 앱이고 실제 아동의 얼굴 사진을 다룬다.** 한도·타임아웃이 행사 운영 규모(노트북 가동 4대, 공인 IP 3개)로
계산돼 있다 — "일단 돌아가게" 고치는 변경이 그날 부스 전체를 멈출 수 있다.

---

## 명령

```bash
# 백엔드
cd functions && npm ci
npm test          # vitest — OpenAI/Firestore 실호출 0건
npm run lint      # eslint
npm run format    # prettier

# 프론트엔드 (저장소 루트)
npm ci
npm test              # vitest — 화면 전체를 실제로 렌더한다
npm run lint          # eslint
npm run typecheck     # TS strict
npm run build         # -> dist/ (배포되는 것)
npm run fonts:check   # 서브셋 폰트에 빠진 글자가 없는지 — 없으면 화면에 □가 나온다
npm run verify:selftest  # 대조 도구가 빈 게이트가 아닌지
```

로컬 미리보기는 `npm run dev`, 라이브와 같은 형태는 `npm run build` 후 `dist/`를 정적 서버(포트 5500 또는 8080 —
`ALLOWED_ORIGINS`에 이미 있음)로 연다. 단, AI 생성은 로컬에서도 **라이브 Functions를 호출해 진짜 돈이 나간다.**

## 배포

**`master`에 push하면 CI(`.github/workflows/deploy.yml`)가 `test → deploy-functions → deploy-hosting` 순으로 자동 배포한다.**
수동 `firebase deploy`는 하지 않는다(예외: `keepWarm` 스케줄 변경 — `_docs/ops/runbook.md`).

- `test`(lint·typecheck·`fonts:check`·테스트·대조 도구 자기검사)가 실패하면 배포는 아예 안 나간다.
- 부스토큰 스모크테스트는 라이브 `/generate`가 **400(사진 없는 요청의 정상 응답)일 때만** 통과한다(429만 경고 후 통과).
  "401이 아니면 통과"였을 때는 함수가 아예 배포 안 됐어도 통과했다.
- `deploy-hosting`은 `dist/`에 나가면 안 되는 것을 검사한 뒤 배포하고, **두 주소 모두**(홈 200 · 금지 경로 404 ·
  CORS 오리진 반사) 확인한다 — **하나라도 실패하면 배포 실패**다.

---

## 절대 하면 안 되는 것

1. **API 키·시크릿을 코드에 쓰지 않는다.** `OPENAI_API_KEY`·`BOOTH_TOKEN`은 Firebase Secret Manager에 있다.
   (`src/constants.ts`의 `BOOTH_TOKEN`은 "정적 사이트라 어차피 공개되는 문지기 값"으로 합의된 예외다 — 진짜 비밀을 추가하지 말 것.)
2. **테스트에서 진짜 OpenAI를 호출하지 않는다.** 주입 지점이 있다: `_setClientForTesting` / `_setSleepForTesting` /
   `_setCounterImplForTesting` / `_resetOpenAIHealthCacheForTesting`.
3. **테스트에서 진짜 Firestore를 두드리지 않는다.** 인메모리 가짜를 주입한다.
4. **`npm audit fix --force`를 `functions/`에서 돌리지 않는다.** firebase-functions 메이저 다운그레이드가 된다.
   남은 moderate 경고는 미사용 경로라 실위험이 없다 — 근거는 `functions/security-notes.md`.
5. **Firestore에 개인정보를 넣지 않는다.** 정수 카운터 4종과 사진 SHA-256 해시뿐이다. 사진·이름·단체명은 서버 어디에도 없다.
6. **라이브에 부하를 주지 않는다.** `/generate` 한 번 = 실제 과금. 부하테스트는 **하지 않기로 했다**(2026-09-11) —
   `scripts/loadtest.mjs`는 `--confirm` 없이는 거부하며, 실행은 Bumm님 승인이 먼저다. 행사 당일에는 어떤 경우에도 금지.
7. **이 목록이 전부가 아니다.** `.claude/rules/app.md`의 "이 앱에서 절대 하면 안 되는 것"도 반드시 읽는다 —
   이름·단체명·출연진 서버 전송 금지, `ALLOWED_ORIGINS` 앵커 유지, 촬영 후 카메라 스트림 정지 등.

---

## 함정 — 실제로 뚫렸거나 깨졌던 것들

**1. 레이트리밋 IP는 X-Forwarded-For의 맨 오른쪽 값이어야 한다.** `trust proxy`가 켜져 있어 `req.ip`는 XFF **맨 왼쪽**,
즉 요청자가 헤더 한 줄로 정하는 값이다 — 그러면 IP별 한도(`IP_RATE_LIMIT_MAX=50`)가 무력화된다(2026-09-07 라이브에서 재현).
→ 반드시 `clientIpForRateLimit()`(맨 오른쪽, GFE가 붙인 조작 불가 항목)을 쓴다. 이 API를 CDN·Hosting rewrite 뒤로
옮기면 맨 오른쪽이 CDN 주소가 되어 **모든 부스가 한 버킷을 공유**한다 — 그때 이 함수를 같이 고친다.

**2. 타임아웃 4단 체인 — 한쪽만 바꾸면 학생 사진이 서버에 남는다.**

```
120초  OPENAI_TIMEOUT_MS      한 번의 OpenAI 호출
125초  GENERATE_BUDGET_MS     재시도·폴백 포함 요청 전체 예산
140초  timeoutSeconds         Cloud Functions 플랫폼 강제종료
150초  src/PosterStudio.tsx의 abort  프론트 fetch 중단
```

순서가 깨지면 플랫폼이 강제종료해 핸들러의 `finally`(임시 사진 삭제)가 **실행되지 못한다**(Cloud Run `/tmp`는 메모리).
한 값을 바꾸면 넷을 같이 확인한다. `scripts/loadtest.mjs`의 `SERVER_TIMEOUT_MS`도 같은 값을 문다.

**3. `public/`에 파일을 추가하면 그대로 라이브에 서빙된다.** Vite가 `public/`을 `dist/` 루트로 복사한다
(`public/vitest.config.js`가 실제로 200을 응답했다). 추가 후 배포되면 `curl https://poster.edutogether.kr/<파일명>`이 404인지 본다.

**4. 부스토큰은 3곳이 동시에 맞아야 한다** — `src/constants.ts` ↔ Secret Manager ↔ `functions/index.js`.
하나만 먼저 배포되면 부스 전체가 401이다. **반드시 같은 커밋에** 넣는다(CI 스모크테스트가 `constants.ts`를 문자열로
읽으므로 파일을 옮기면 `deploy.yml`도 고친다). 절차는 `_docs/ops/runbook.md` "부스토큰 교체".

**5. 같은 사진으로는 2번까지만 생성된다.** `checkPhotoGenerationLimit`이 사진 해시별 최대 2회 — 같은 파일을 반복
전송하는 스크립트는 3번째부터 전부 429다. JPEG 끝(`FF D9`) 뒤에 랜덤 바이트를 붙여 해시만 바꾼다(`loadtest.mjs` 방식).

**6. 레이트리밋 카운터는 10분 버킷이다.** 순차로 수십~150건을 보내는 테스트는 매시 00·10·20분 경계를 넘으면
카운터가 리셋돼 **반드시 실패한다**. `runInSingleRateLimitBucket()`으로 감싼다.

**7. Cloud Functions v2에서는 multer가 안 된다.** 본문이 이미 `req.rawBody`로 읽혀 스트림이 끝나 있다
("Unexpected end of form"). `parseMultipart`가 `req.rawBody`를 busboy에 직접 넣는다 — 되돌리지 않는다.

**8. 미들웨어 순서 자체가 안전장치다.**

```
checkBoothToken → parseMultipart → requirePhoto → rateLimit → ipRateLimit
                → checkPhotoGenerationLimit → dailyBudgetCap → handler
```

`requirePhoto`가 레이트리밋 **앞**이어야 사진 없는 빈 요청이 전역 예산을 공짜로 태우지 못하고(170건으로 10.5초 만에
소진된 이력), `checkPhotoGenerationLimit`이 `dailyBudgetCap` **앞**이어야 돈 안 드는 요청이 하루 예산을 태우지 못한다.
순서를 바꾸면 회귀 테스트가 잡는다.

**9. 브라우저 캐시가 "배포가 안 된 것처럼" 보이게 한다.** 배포 정확성은 스크린샷이 아니라 `curl`로 서버에서 받아 대조한다.

---

## 코드 지도

| 위치 | 하는 일 |
|---|---|
| `functions/index.js` | 전부 여기 — 미들웨어 체인, 프롬프트, OpenAI 호출, Firestore 카운터, 스케줄러 2종 |
| `functions/test/index.test.js` | 백엔드 테스트 전부 |
| `src/main.tsx` | 진입점. 기존 `main.app` 요소 **안에** 마운트한다(래퍼 div를 만들지 않는다) |
| `src/PosterStudio.tsx` | 화면과 로직 전부 — 촬영, `/generate` 호출, 폴백, 갤러리, 초기화, 인쇄 |
| `src/layout.ts` · `templates.ts` · `poster.ts` | 캔버스 타이포·포스터 4종 |
| `src/useLayoutMatch.ts` | 왼쪽 기둥 높이를 재서 오른쪽에 꽂아준다(ResizeObserver). 방향을 뒤집으면 폭주한다 |
| `src/constants.ts` | 부스토큰·장르·상수 |
| `test/react-setup.ts` | 프론트 테스트 하네스 — 가짜 카메라/캔버스/폰트를 깔고 진짜 컴포넌트를 렌더 |
| `scripts/fonts/` | UI 폰트 서브셋 — `charset.mjs`(글자 뽑기) `check-charset.mjs`(CI 게이트) `subset.py` |
| `scripts/verify/` | 대조 도구 — `snapshot.js` `compare.mjs` `poster-pixels-ui.js`(포스터 픽셀 지문) |
| `scripts/loadtest.mjs` | 라이브 부하테스트(`--confirm` 없이는 거부, 실행은 승인 필수) |
| `_docs/ops/runbook.md` | 행사 당일 장애 대응 |

---

## 작업 흐름

- **집 PC의 Claude Code 세션**은 `master`에 직접 커밋한다(팀장 승인 경로). **Codex·클라우드·다른 기기**는 작업 가지 → PR,
  머지 버튼은 사람이 누른다. **PR이면 `pr-check.yml`(배포 전 검사와 같은 것)이 요청 없이 자동으로 돈다.**
- 커밋 메시지: `type: 한글 설명 (승인 Bumm M/D)` — type은 feat/fix/docs/chore/refactor/test.
- 코드를 고쳤으면 **양쪽 `npm test`와 `npm run lint`를 돌리고** 커밋한다 — 실패한 커밋이 `master`에 오르면 배포가 멈춘다.
- 의미 있는 변경(Functions 설정, 사용자 흐름, 개인정보 취급)은 `_docs/intents/`에 intent를 남긴다 — 기준은 `_docs/intents/README.md`.
- "왜 이렇게 됐는지"는 대개 `_docs/CHANGELOG.md`에 있다.
