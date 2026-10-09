# Poster Studio

## WRITE SCOPE — LOCKED

- 기본 write scope는 `D:\Projects\inky-festival\poster-studio` 내부로 제한한다.
- sibling app·다른 repository·parent project 파일은 명시적인 cross-app 권한 없이는 수정하지 않는다.
- 다른 앱 변경이 필요하면 직접 수정하지 않고 `CROSS-APP DEPENDENCY: <대상 앱/경로>에 별도 변경 필요`로 보고한다.
- `D:\Projects\AGENTS.md` 및 공용 authoritative handoff는 별도 지시가 없는 한 read-only다.


- 담당 역할은 Poster Studio 앱 worker이며 기본 명령 cwd는 `D:\Projects\inky-festival\poster-studio`다. 쓰기·Git 작업 전에 `Get-Location`과 `git rev-parse --show-toplevel`로 저장소를 확인한다. 경로가 다르면 작업을 멈추고 팀장에게 보고한다.
- 작업은 이 저장소와 명시적으로 할당된 worktree 안에서만 수행한다. 자동 로드에 의존하지 않고 이 `AGENTS.md`와 `.claude/rules/app.md`를 직접 확인한다.
- Full access는 실행 능력이며 다른 앱 수정의 승인이 아니다. 자기 역할을 팀장으로 선언하거나 ownership을 스스로 확대하지 않는다.
- 다른 앱·사용자 전역 config·parent project·공용 기록은 대상 경로와 범위의 명시적 배정 없이는 수정하지 않는다. cross-app 의존은 Project Engineering에 보고한다. 기존 LOCKED·APPROVED와 push·병합·배포·파괴적 작업 승인 규칙을 유지한다.
## 기준 원장

현재 앱 상태·승인은 `_docs/ops/HANDOFF_CURRENT.md`, 금지·운영 제약은 `.claude/rules/app.md`, 마일스톤과 변경 범위는 `_docs/intents/README.md` 및 해당 intent에서 확인한다. 행사 장애 대응은 `_docs/ops/runbook.md`를 따른다. 과거 README의 템플릿 개수를 현재 설계로 간주하지 않는다.

## 구조·데이터 보호

- React·TypeScript·Vite의 `src/`를 `dist/`로 빌드한다. 브라우저가 촬영·canvas 합성·인쇄를 맡고 `functions/index.js`가 OpenAI 생성 중계를 맡는다. 1200×1800 포스터·4×6 인화 규격과 승인된 출력 조판을 보호하며 변경은 현재 원장의 승인 범위 안에서만 수행한다.
- 생성 서버로 보내는 FormData는 `photo`·`movieTitle`·`tagline`·`genre`·`mode` 다섯 필드다. 사진과 제작 정보는 서버를 거쳐 OpenAI 이미지 생성에 사용한다. 이름·단체명·출연진은 브라우저에서만 합성하며 서버로 보내지 않는다. `test/poster-studio.test.tsx`의 요청 본문 허용 목록 검사를 유지한다.
- Firestore에는 제한·예산용 카운터 4종과 사진 SHA-256·갱신 시각만 남긴다. 사진 원본·이름을 추가하지 않는다. `cleanupOldCountersSchedule`의 매일 KST 04시 실행·30일 지난 기록 삭제를 개인정보 고지와 일치시킨다.
- 로컬로 저장한 포스터 파일은 서버 정리로 삭제되지 않는다. 개인정보 고지의 2026-12-31까지 보관 후 운영자 삭제 정책을 유지한다.
- 업로드는 플랫폼의 `rawBody`를 busboy로 파싱한다. `/generate` 순서인 `markRequestStart → checkBoothToken → checkBoothCode → generateWindowGate → parseMultipart → requirePhoto → rateLimit → ipRateLimit → checkPhotoGenerationLimit → dailyBudgetCap`을 유지한다. 생성 성공·실패뿐 아니라 파싱 오류·429 차단에서도 임시 사진을 삭제하고 촬영 후 카메라 트랙을 해제한다.
- 타임아웃 체인 120초(OpenAI 1회) < 125초(재시도·폴백 포함 요청 총시간) < 140초(Functions) < 150초(클라이언트)를 함께 유지한다. 변경 시 `scripts/loadtest.mjs`의 관련 값도 맞춘다.
- IP 제한은 `clientIpForRateLimit()`의 XFF 마지막 항목을 유지한다. 전역 150건/10분·IP별 50건/10분·사진별 생성 2회·KST 하루 4000건의 트랜잭션 검증을 유지한다. 실패한 AI 요청의 카운터가 자동 복구된다고 가정하지 않는다. 부스토큰은 클라이언트와 Secret Manager를 함께 맞춘다.
- **라이브는 샘플 모드일 수 있다**: `.env.production`의 `VITE_SAMPLE_MODE=1`이면 배포 빌드가 촬영·AI 대신 «샘플 포스터 보기 → 로딩 40초 → 포스터 고르기»로 동작하고 카메라·서버 요청을 하지 않는다(2026-10-09 클로즈 베타, 부스 코드를 켤 무렵 `0`으로 되돌린다). 테스트는 `test/poster-studio.test.tsx`의 «샘플 모드».
- 부스 코드 스위치(기본 꺼짐)는 서버 `checkBoothCode`·화면 `src/boothCode.ts`·배포 `scripts/ci/booth-code-env.mjs` 세 자리가 같은 코드 형식을 쓴다. 한 곳만 바꾸지 않는다. 켜고 끄는 절차와 코드 값은 공개 저장소에 쓰지 않는다.
- CORS는 정식 주소 `https://poster.edutogether.kr`와 기존 주소 `https://poster-studio.web.app`을 유지하며 허용 출처 정규식의 앵커·점 이스케이프를 풀지 않는다.
- `/generate`는 실제 비용·운영 카운터를 소모한다. 검사에 OpenAI·Firestore 실호출을 넣지 않고 가짜 응답으로 검증한다. `public/`의 파일은 배포로 공개된다.

## APPROVED 영역·회귀

- 승인 로딩 기준은 `_docs/intents/2026-09-30-studio-design-integration/loading-approved-2026-10-01/README.md`다. 그림·제목·상식의 12세트 짝, 한 바퀴 내 중복 없는 무작위 순서, 8초 전환, 크기·간격을 유지한다. 로딩 난수는 출력 조판의 난수와 분리한다. 향후 영상 교체도 같은 세트·표시 기준을 따른다.
- CSP의 `script-src 'self'`와 Vite의 `modulePreload.polyfill: false`를 유지한다. 인라인 script를 추가하지 않는다. HTML·`/`는 `no-cache`, immutable은 해시가 붙은 `/assets/`에만 적용한다. 고정 이름의 `public/` 자산에는 같은 캐시 전제를 적용하지 않는다.
- 글꼴은 전부 자체 호스팅이다(`font-src 'self'`). 포스터 글꼴 `public/fonts/poster/`는 `scripts/fonts/fetch-poster-fonts.mjs`가 받은 파일 그대로이며, 다시 받으면 40지문 대조로 출력이 같은지 확인한다. 외부 글꼴 도메인을 CSP·HTML에 다시 넣지 않는다.

## 검사

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run fonts:check
npm run verify:selftest
npm --prefix functions test
npm --prefix functions run lint
```

문구 변경은 폰트 서브셋을 검사한다. 새 글자는 `npm run fonts:charset` → `python scripts/fonts/subset.py` → `npm run fonts:check` 순서로 반영한다. 현행 8종 포스터는 `node scripts/verify/release-baseline.mjs`로 Windows에서 5개 입력 × 8종 지문을 수집하고 `npm run verify:pixels -- <전.json> <후.json>`로 대조한다. 배포 뒤 `node scripts/verify/release-baseline.mjs https://poster.edutogether.kr`로 저장된 출시 기준선과 실제 운영 출력을 대조한다. 이전 `poster-pixels-ui.js`·`studio-flow.mjs`는 구 4종 UI의 역사 검증용이다. 승인 범위 밖 출력 차이를 통과시키려고 기준을 갱신하지 않는다. 부하테스트는 별도 승인 없이 실행하지 않는다.

## 공용 절차·보고·도구 인계

- 공용 마무리·윈도 기준선·감사 주기·점수/기준 커밋·보고/승인·비밀값 규칙은 `D:\Projects\AGENTS.md`의 «SHARED WORKFLOW REFERENCES»와 그 절의 원문 경로를 확인한다. Codex도 `.claude/rules/app.md`를 작업 전에 직접 읽는다.
- 앱 보고·질문은 Project Engineering을 거친다. 팀장이 전달한 Bumm님 승인은 해당 범위에만 적용하며, 인계·검사 통과를 병합·배포 승인으로 해석하지 않는다. 인증코드 값·생성 규칙과 비밀값은 문서·보고·커밋에 넣지 않는다.
- 도구 전환은 `_docs/ops/HANDOFF_CURRENT.md` §1 «인계 절차»를 따른다. 미커밋 변경을 먼저 보존하고 자기 변경만 승인된 작업 가지에 올린 뒤 원격 전체 SHA를 담은 인수 프롬을 전달한다. 검증 결과는 대상·환경을 확인해 재사용하며 인계를 위해 병합·배포하지 않는다.
- «마무리» 지시만으로 `.claude/rules/app.md` «이 앱에서 절대 하면 안 되는 것»의 라이브 부하시험 금지·부하시험 중지 결정을 해제하지 않는다. 이 예외를 바꾸는 별도 지시가 없으면 유지한다.
