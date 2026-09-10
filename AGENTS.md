# AGENTS.md — Poster Studio

이 저장소에서 작업하는 **모든 AI 코딩 도구**(Claude Code, Codex 등)를 위한 안내다.
클로드 전용 규칙·이력은 `CLAUDE.md`에 있고, 여기엔 **어떤 도구로 열든 알아야 하는 것**만 적는다.

---

## 이 앱이 뭔가

제4회 인천어린이청소년영화제(**2026-11-14, 인천 CGV**) 체험부스 웹앱. 아이가 웹캠으로 사진을 찍으면
AI가 영화 포스터 그림을 만들고, 브라우저 캔버스가 제목·크레딧을 합성해 4종을 만든 뒤 4×6 인화지로 즉석 인쇄한다.

- **프론트엔드** TypeScript + React 19 + Vite. 소스는 `src/`, 배포되는 것은 빌드 산출물 `dist/`
  → Firebase Hosting. 주소는 **`https://poster.edutogether.kr`**(2026-09-10부로 정식),
  `https://poster-studio.web.app`도 계속 살아 있다(이미 나간 QR·링크용). `public/`은 이제 정적 자산만 담는다.
- **백엔드** `functions/` → Firebase Cloud Functions v2, `posterStudio` (asia-northeast3)
  — 하는 일은 OpenAI 이미지 생성 중계 하나뿐이다.
- Firebase 프로젝트: `inky-poster-studio`

**행사용 앱이다.** 행사 당일 부스 20대가 동시에 쓰는 것을 전제로 모든 한도·타임아웃이 계산돼 있고,
실제 아동의 얼굴 사진을 다룬다. "일단 돌아가게" 고치는 변경이 그날 부스 전체를 멈출 수 있다.

---

## 명령

```bash
# 백엔드
cd functions && npm ci
npm test          # vitest run — 61개, OpenAI/Firestore 실호출 0건
npm run lint      # eslint
npm run format    # prettier

# 프론트엔드 (저장소 루트)
npm ci
npm test              # vitest run — 66개 (화면 전체를 실제로 렌더한다)
npm run lint          # eslint
npm run typecheck     # TS strict
npm run build         # -> dist/ (배포되는 것)
npm run fonts:check   # 서브셋 폰트에 빠진 글자가 없는지 — 없으면 화면에 □가 나온다
npm run verify:selftest  # 대조 도구가 빈 게이트가 아닌지
```

로컬 미리보기는 `npm run dev`(Vite). 라이브와 같은 형태로 보려면 `npm run build` 후 `dist/`를
정적 서버로 연다(포트 5500).
`localhost:5500`·`localhost:8080`은 `functions/index.js`의 `ALLOWED_ORIGINS`에 이미 들어 있다.
단, AI 생성은 로컬에서도 **라이브 Functions를 호출**한다 — 즉 진짜 돈이 나간다(아래 참고).

## 배포

**`master`에 push하면 CI가 자동 배포한다.** 수동 `firebase deploy`는 원칙적으로 하지 않는다.

```
.github/workflows/deploy.yml:  test → deploy-functions → deploy-hosting
```

- `test`가 실패하면 배포는 아예 안 나간다(`needs:` 체인).
- `test`에는 lint·typecheck·**폰트 글자 검사(`fonts:check`)**·테스트·**대조 도구 자기검사**가 들어 있다.
- `deploy-functions` 뒤에 **부스토큰 스모크테스트**가 붙어 있다 — 라이브 `/generate`가
  **400(사진 없는 요청의 정상 응답)이어야 통과**하고, 401(토큰 불일치)·그 밖의 응답은 실패다
  (429만 경고 후 통과). "401이 아니면 통과"였다가 2026-09-10에 고쳤다 — 그 형태는 함수가
  아예 배포 안 됐을 때도 통과했다.
- `deploy-hosting`에는 **빌드 → `dist/`에 나가면 안 되는 것 검사 → 배포 → 라이브 확인**이
  붙어 있다. 라이브 확인은 **두 주소(`poster.edutogether.kr`·`poster-studio.web.app`)를 다**
  본다(홈 200 · 금지 경로 404 · CORS가 보낸 오리진을 반사) — **하나라도 실패하면 배포 실패**다.
- 예외 하나: `keepWarm`(Cloud Scheduler) **스케줄 자체를 바꾸는** 배포는 CI 계정 IAM 이슈 이력이 있어
  소유자급 계정으로 로컬 배포하는 경우가 있다 — `_docs/ops/runbook.md` 참고.

---

## 절대 하면 안 되는 것

1. **API 키·시크릿을 코드에 쓰지 않는다.** `OPENAI_API_KEY`·`BOOTH_TOKEN`은 Firebase Secret Manager에 있다.
   (`src/constants.ts`의 `BOOTH_TOKEN`은 예외처럼 보이지만 "정적 사이트라 어차피 공개되는 문지기 값"이라고
   합의된 것이다 — 진짜 비밀을 여기 추가하지 말 것.)
2. **테스트에서 진짜 OpenAI를 호출하지 않는다.** 매 실행마다 돈이 나가고 인터넷이 필요해진다.
   주입 지점이 이미 있다: `_setClientForTesting` / `_setSleepForTesting` / `_setCounterImplForTesting` /
   `_resetOpenAIHealthCacheForTesting`.
3. **테스트에서 진짜 Firestore를 두드리지 않는다.** 같은 이유. 인메모리 가짜를 주입한다.
4. **`npm audit fix --force`를 `functions/`에서 돌리지 않는다.** 제안되는 "수정"이 firebase-functions 메이저
   다운그레이드라 오히려 퇴행한다. moderate 경고들은 미사용 경로(firebase-admin → storage)라 실위험이 없고
   `functions/security-notes.md`에 근거가 적혀 있다.
5. **Firestore에 개인정보를 넣지 않는다.** 저장하는 건 정수 카운터 4종과 사진의 SHA-256 해시뿐이다.
   사진 원본·이름·단체명은 서버 어디에도 저장되지 않는다(README의 개인정보 고지가 이걸 약속하고 있다).
6. **라이브에 부하를 주지 않는다.** `/generate` 한 번 = 실제 OpenAI 과금(약 $0.04).
   `scripts/loadtest.mjs`에는 `--dry`(헬스체크만, 비용 0) 모드가 있으니 먼저 그걸 쓴다.
   행사 당일에는 어떤 부하테스트도 금지.

---

## 함정 — 실제로 뚫렸거나 깨졌던 것들

### 1. 레이트리밋 IP는 X-Forwarded-For의 **맨 오른쪽** 값이어야 한다

`app.set('trust proxy', true)`가 켜져 있어서 Express의 `req.ip`는 XFF 체인의 **맨 왼쪽** 값이 된다.
Cloud Run/GFE는 클라이언트가 보낸 XFF를 지우지 않고 뒤에 덧붙이므로, **맨 왼쪽은 요청자가 헤더 한 줄로
마음대로 정할 수 있는 값**이다. 이 상태에서는 `x-forwarded-for: 1.2.3.4` 한 줄만 붙이면 IP별 한도
(`IP_RATE_LIMIT_MAX=50`)가 완전히 무력화된다 — 2026-09-07 감사에서 **라이브에서 실제로 뚫리는 것을 재현**했다.

→ 반드시 `clientIpForRateLimit()`을 쓴다. 맨 오른쪽 값만 신뢰할 수 있다(GFE가 직접 붙인, 조작 불가능한 항목).
→ 나중에 이 API를 CDN이나 Hosting rewrite 뒤로 옮기면 맨 오른쪽이 그 CDN 주소가 되어 **모든 부스가 한 버킷을
공유**하게 된다. 그때는 이 함수를 반드시 같이 고쳐야 한다.

### 2. 타임아웃 4단 체인 — 한쪽만 바꾸면 학생 사진이 서버에 남는다

```
120초  OPENAI_TIMEOUT_MS      한 번의 OpenAI 호출
125초  GENERATE_BUDGET_MS     재시도·파라미터 폴백까지 포함한 요청 전체 예산
140초  timeoutSeconds         Cloud Functions 플랫폼 강제종료
150초  src/PosterStudio.tsx의 abort  프론트 fetch 중단
```

이 순서가 깨지면(예: OpenAI 타임아웃만 올리면) 플랫폼이 함수를 **강제종료**하고, 그러면
`/generate` 핸들러의 `finally`(임시 사진 삭제)가 **아예 실행되지 못한다**. Cloud Run의 `/tmp`는 메모리라
사진이 그대로 남고, README가 명시한 "임시 파일은 정상/오류 경로 모두에서 삭제됩니다" 약속이 깨진다.
한 값을 바꾸면 네 개를 같이 확인할 것. `scripts/loadtest.mjs`의 `SERVER_TIMEOUT_MS`도 같은 값을 물고 있다.

### 3. `public/`에 파일을 추가하면 그대로 라이브에 서빙된다

전환(2026-09-09) 전에는 `public/`이 통째로 배포 폴더였다. 지금은 `dist/`가 배포 폴더지만
**Vite가 `public/`의 내용을 `dist/` 루트로 그대로 복사하므로 결과는 같다.**
vitest 이전 때 `public/vitest.config.js`가 실제로 라이브에서 200으로 응답하고 있었다(2026-09-07 발견).
`public/`에 파일을 추가할 때마다 배포 후 `curl https://poster.edutogether.kr/<파일명>`이
404인지 확인한다.

### 4. 부스토큰은 3곳이 동시에 맞아야 한다

`src/constants.ts`의 `BOOTH_TOKEN` ↔ Secret Manager의 `BOOTH_TOKEN` ↔ `functions/index.js`의 `ALLOWED_ORIGINS`.
(CI 스모크테스트가 이 파일을 문자열로 읽는다 — 파일을 옮기면 `.github/workflows/deploy.yml`도 같이 고칠 것.)
하나만 먼저 배포되면 그 사이에 부스 전체가 401이 된다. **반드시 같은 커밋에** 넣는다.
교체 절차는 `_docs/ops/runbook.md` "부스토큰 교체".

### 5. 같은 사진으로는 2번까지만 생성된다 (테스트·스크립트가 여기 걸린다)

`checkPhotoGenerationLimit`이 사진 바이트의 SHA-256 해시별로 최대 2회를 강제한다.
부하테스트나 스크립트가 **같은 파일을 반복 전송하면 3번째부터 전부 429**라 측정 자체가 안 된다.
`scripts/loadtest.mjs`처럼 JPEG의 EOI 마커(`FF D9`) 뒤에 랜덤 바이트를 붙여 해시만 바꾸면 된다
(디코딩되는 이미지는 그대로다).

### 6. 레이트리밋 카운터는 10분 버킷이라 테스트가 경계에서 깨진다

문서 ID가 `floor(Date.now() / 10분)`을 포함한다. 수십~150건을 순차 전송하는 테스트는 실행 중
매시 00·10·20분 경계를 넘으면 카운터가 리셋되어 **반드시 실패한다**(실제로 관측됨).
그런 테스트는 `runInSingleRateLimitBucket()`으로 감싼다.

### 7. Cloud Functions v2에서는 multer가 안 된다

핸들러 실행 전에 본문을 전부 읽어 `req.rawBody`로 넘겨주고 원본 스트림은 이미 끝나 있다.
multer는 그 스트림에서 읽으려 해서 매번 "Unexpected end of form"으로 실패한다.
그래서 `parseMultipart`가 `req.rawBody`를 busboy에 직접 흘려보낸다 — 이 구조를 되돌리지 말 것.

### 8. 미들웨어 순서 자체가 안전장치다

```
checkBoothToken → parseMultipart → requirePhoto → rateLimit → ipRateLimit
                → checkPhotoGenerationLimit → dailyBudgetCap → handler
```

- `requirePhoto`가 레이트리밋보다 **앞**이어야 한다: 사진 없는 빈 요청이 전역 예산을 공짜로 태우는 걸 막는다
  (실제로 사진 없는 요청 170개로 전역 한도를 10.5초 만에 소진시킨 이력이 있다).
- `checkPhotoGenerationLimit`이 `dailyBudgetCap`보다 **앞**이어야 한다: OpenAI를 절대 안 부르는 요청
  (= 돈이 안 나가는 요청)이 하루 예산을 태워 행사를 셧다운시키는 걸 막는다.
- 이 순서를 바꾸는 변경은 회귀 테스트가 잡도록 되어 있다.

### 9. 브라우저 캐시가 "배포가 안 된 것처럼" 보이게 한다

라이브 화면을 확인할 때 브라우저 디스크 캐시가 구버전 CSS/JS를 계속 쓰는 일이 반복적으로 있었다.
배포 정확성은 스크린샷이 아니라 `curl`로 서버에서 직접 받아 대조하는 게 확실하다.

---

## 코드 지도

| 위치 | 하는 일 |
|---|---|
| `functions/index.js` | 전부 여기 있다 — 미들웨어 체인, 프롬프트 구성, OpenAI 호출, Firestore 카운터, 스케줄러 2종 |
| `functions/test/index.test.js` | 백엔드 테스트 전부 |
| `src/main.tsx` | 진입점. 기존 `main.app` 요소 **안에** 마운트한다(래퍼 div를 만들지 않는다) |
| `src/PosterStudio.tsx` | 화면과 로직 전부 — 촬영, `/generate` 호출, 폴백, 갤러리, 초기화, 인쇄 |
| `src/layout.ts` · `templates.ts` · `poster.ts` | 캔버스 타이포·포스터 4종 |
| `src/useLayoutMatch.ts` | 왼쪽 기둥 높이를 재서 오른쪽에 꽂아준다(ResizeObserver). 방향을 뒤집으면 폭주한다 |
| `src/constants.ts` | 부스토큰·장르·상수 |
| `test/react-setup.ts` | 프론트 테스트 하네스 — 가짜 카메라/캔버스/폰트를 깔고 진짜 컴포넌트를 렌더 |
| `scripts/fonts/` | UI 폰트 서브셋 — `charset.mjs`(글자 뽑기) `check-charset.mjs`(CI 게이트) `subset.py` |
| `scripts/verify/` | 전환 대조 도구 — `snapshot.js` `compare.mjs` `poster-pixels-ui.js`(포스터 픽셀 지문) |
| `scripts/loadtest.mjs` | 라이브 부하테스트(`--dry` 필수 확인) |
| `_docs/ops/runbook.md` | 행사 당일 장애 대응 |

---

## 작업 흐름

- 브랜치 없이 `master`에 직접 커밋한다(PR 없음).
- 커밋 메시지: `type: 한글 설명 (승인 Bumm M/D)` — type은 feat/fix/docs/chore/refactor/test 여섯 개.
- 코드를 고쳤으면 **양쪽 `npm test`와 `npm run lint`를 돌리고** 커밋한다. CI가 어차피 막지만, 실패한 커밋이
  `master`에 올라가면 그 사이 배포가 통째로 멈춘다.
- 의미 있는 변경(Functions 설정, 사용자 흐름, 개인정보 취급)은 `_docs/intents/`에 intent를 남긴다 —
  기준은 `_docs/intents/README.md`.
- 이 저장소의 상세 이력·감사 기록은 `CLAUDE.md`에 있다. 뭔가 이상해 보이면 대개 거기에 "왜 그렇게 됐는지"가 적혀 있다.
