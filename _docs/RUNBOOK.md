# RUNBOOK — Poster Studio

> 이 저장소에서 되풀이하는 일을 **그대로 따라 하면 끝나는 순서**로 적는다. 명령은 복사해서 바로 돌릴 수 있게 쓰고,
> 단계마다 «됐는지 확인하는 법»을 붙인다. 무엇을 지켜야 하는지는 `_docs/RULES.md`, 함정이 생긴 사연은
> `.claude/rules/app.md`에 있다 — 이 문서는 «어떻게 하나»만 다룬다(원본 양식: `D:\Projects\_shared\doc-kit\`).
> 일을 시작할 때 그 일의 절을 열고, 첫 진행 설명과 완료 보고에 «읽은 것: RUNBOOK §1»을 적는다.
> 검사기는 자잘하게 고치는 동안 돌리지 않는다 — 한 덩어리가 끝나면 «이제 검사기를 한 번에 돌리겠습니다»라고 알리고 한 번 돌린다.

## 목차

| 일 | 언제 하나 | 절 |
|---|---|---|
| 로컬에서 화면 보기 | 화면을 고치고 눈으로 볼 때 | §1 |
| 테스트 · 린트 · 빌드 | 한 덩어리를 끝내고 커밋 전에 | §2 |
| 배포 (main push) | 코드가 바뀐 커밋을 올릴 때 | §3 |
| 배포 후 라이브 확인 | 배포가 끝난 직후 | §4 |
| GitHub 정지 중 로컬 배포 | push · CI가 안 될 때만 | §5 |
| Windows 설치판 빌드 · 확인 · 공개 교체 | 설치판을 새로 낼 때 | §6 |
| 폰트 서브셋 다시 만들기 | 화면 · og 문구에 새 글자가 들어갔을 때 | §7 |
| 대기 영상 한 편 교체 | 영상을 다시 만들었을 때 | §8 |
| 현장 의견 내보내기 · 삭제 | 의견 모으기가 끝난 뒤 | §9 |
| 의존성 최신화 | 팀장이 §36 최신화를 지시할 때 | §10 |
| 행사 당일 장애 대응 | 행사 중 이상이 생겼을 때 | §11 |

## 1. 로컬에서 화면 보기

- **언제**: 화면(`src/`)을 고치고 눈으로 볼 때
- **시작 전에 읽을 규칙**: `RULES.md` R-9 · R-24 · R-35 · R-38
- **순서**
  1. 저장소 루트에서 `npm ci` → **확인**: 오류 없이 끝남
  2. `npm run dev` → **확인**: Vite 주소가 열림. 포스터 고르기 화면만 보려면 주소 끝에 `?preview=posters`(서버 · 카메라 · AI 요청 0)
  3. 운영과 같은 모양은 `npm run build` 뒤 `dist/`를 5500 또는 8080 포트 정적 서버로 연다(`ALLOWED_ORIGINS`에 허용됨) → **확인**: 첫 화면이 뜸
  4. 카메라 흐름은 가짜 카메라로: `ffmpeg`로 사진을 y4m으로 만들고 크롬에 `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream --use-file-for-fake-video-capture=<y4m>`
- **끝나면 남길 것**: 없음(보기만)
- **막히면**: AI 생성은 로컬에서도 라이브 Functions를 불러 실비가 난다 — 누르지 않는다. 시간을 재야 하는 확인은 패널이 아니라 헤드리스 크롬으로.

## 2. 테스트 · 린트 · 빌드

- **언제**: 한 덩어리가 끝나 커밋하기 전. 한 글자 · 그림 하나 고치는 동안에는 돌리지 않는다
- **시작 전에 읽을 규칙**: `RULES.md` R-43 · R-46
- **순서**
  1. `cd functions && npm ci && npm test && npm run lint` → **확인**: 시험 전부 통과(2026-11-16 기준 143개), 린트 0
  2. 루트에서 `npm ci && npm test && npm run lint && npm run typecheck` → **확인**: 전부 통과(776개), 타입 오류 0
  3. `npm run build && npm run fonts:check && npm run verify:selftest` → **확인**: `dist/` 생성, 서브셋 누락 글자 0, 대조 도구 자기검사 통과
  4. 화면(CSS · 배치)을 바꿨으면 `node scripts/verify/mobile-layout-probe.mjs <dist> <out>`를 손으로 돌린다(CI에 없다)
- **끝나면 남길 것**: 새 검사를 넣었으면 일부러 깨뜨려 빨간불이 켜지는 것을 본다
- **막히면**: 실패한 커밋을 main에 올리면 그 사이 배포가 통째로 멈춘다 — 고친 뒤에 올린다.

## 3. 배포 (main push)

- **언제**: 코드가 바뀐 커밋을 올릴 때. 작고 급한 것은 main 직접 커밋, 큰 구조 변경은 짧은 브랜치 → PR → 설명 후 사람이 머지
- **시작 전에 읽을 규칙**: `RULES.md` R-39 · R-40 · R-41 · R-42
- **순서**
  1. §2를 통과시키고 커밋한다
  2. 큰 변경이면 먼저 프리즈 태그를 찍는다
  3. `git push origin main` → **확인**: CI가 `test` → `deploy-functions` → `deploy-hosting` 순으로 돈다
  4. 내 커밋의 실행을 `headSha`로 고른다: `gh run list --limit 5 --json databaseId,headSha,conclusion -q '.[] | select(.headSha|startswith("<커밋>"))'` → **확인**: `conclusion`이 success
- **끝나면 남길 것**: `_docs/CHANGELOG.md` 한 줄
- **막히면**: 문서 · 시험 · 워크플로만 바뀐 커밋은 배포 잡이 건너뛰는 것이 정상. 행사 당일에는 `desktop/`만 바뀐 커밋도 건너뛴다. `gh run list --limit 1`은 직전 성공을 보여 줄 수 있어 믿지 않는다.

## 4. 배포 후 라이브 확인

- **언제**: 배포 직후
- **시작 전에 읽을 규칙**: `RULES.md` R-5 · R-38
- **순서**
  1. `curl -I https://poster.edutogether.kr/` 와 `https://poster-studio.web.app/` → **확인**: 둘 다 200, HTML은 `no-cache`
  2. `curl -s https://asia-northeast3-inky-poster-studio.cloudfunctions.net/posterStudio/health` → **확인**: 정상 응답
  3. 새 번들이 나갔는지 `dist-vs-live.mjs`로 대조: `node scripts/verify/dist-vs-live.mjs` → **확인**: 파일 해시 전부 같음
  4. 세션 브라우저로 첫 화면 열어 콘솔 오류 0 확인(생성은 누르지 않는다)
- **끝나면 남길 것**: CHANGELOG에 «라이브 확인» 한 줄
- **막히면**: 스크린샷만으로 확인하면 캐시에 속는다 — 서버에서 `curl`로 받아 대조한다.

## 5. GitHub 정지 중 로컬 배포

- **언제**: GitHub가 정지돼 push · CI가 안 될 때만. 매번 팀장을 거친 Bumm님 승인 뒤
- **시작 전에 읽을 규칙**: `RULES.md` R-39 · R-40
- **순서**
  1. 이 체크아웃에서 바로 빌드하지 않는다(CRLF). `git -c core.autocrlf=false worktree add --detach <폴더> <커밋>`로 LF 사본을 만든다
  2. 되돌릴 자리부터: 지금 라이브를 30일 채널 `rollback-<날짜>`로 `hosting:clone` → **확인**: 채널 주소가 열림
  3. 사본에서 `npm ci && npm run build`, `npx --yes firebase-tools@15.37.0 deploy --only hosting`
  4. `node scripts/ci/run-workflow-step.mjs`로 `deploy.yml`의 배포 후 확인 단계를 그대로 돌리고 `dist-vs-live.mjs`로 바이트 대조 → **확인**: 모두 통과
- **끝나면 남길 것**: CHANGELOG 한 줄(승인 근거 · 커밋 · 롤백 채널 이름)
- **막히면**: 상세 절차는 `_docs/ops/runbook.md` §9.

## 6. Windows 설치판 빌드 · 확인 · 공개 교체

- **언제**: 설치판을 새로 낼 때. 설치 확인은 Bumm님이 이 PC 앞에 계실 때만(관리자 승인 창 3번)
- **시작 전에 읽을 규칙**: `RULES.md` R-28 · R-29 · R-30 · R-31 · R-32 · R-33
- **순서**
  1. 루트에서 `npm run build:desktop` → **확인**: `desktop/web` 생성
  2. `cd desktop && npm ci && node node_modules/electron/install.js` → **확인**: Electron 실행 파일이 받아짐
  3. `npx electron-builder --win nsis --x64 --publish never` → **확인**: `desktop/out/Poster Studio Setup.exe`(약 159MB, 커밋하지 않음)
  4. `Get-FileHash`로 SHA-256을 적어 둔다. 판 번호는 `node scripts/build/app-version.mjs HEAD`
  5. 설치기 확인 세 가지를 관리자 권한으로 창 없이 돌린다(각각 승인 창 1번): `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify/run-hidden.ps1 -Script <절대경로>\scripts\verify\desktop-installer-probe.ps1 -ArgsLine "-Step install -Mode all [-Replace] -Installer '<exe 절대경로>' -Out '<결과 폴더>'" -Log <결과 폴더>\log.txt` 를 설치 → `-Replace` → 제거(`-Step uninstall -Mode all -Via startmenu`) 순으로 → **확인**: 각 로그 끝이 «모두 통과 N건»
  6. 앱 동작: `node scripts/verify/desktop-app-probe.mjs <결과> --exe <설치한 exe>`
  7. 팀장 OK 뒤에만 공개 교체: `gcloud storage cp <exe> gs://inky-poster-studio-download/PosterStudio-Setup.exe --content-type=application/vnd.microsoft.portable-executable --content-disposition='attachment; filename="Poster Studio Setup.exe"' --cache-control=no-cache --predefined-acl=publicRead --account <프로젝트 소유 계정>` → **확인**: 복사 끝남
  8. `node scripts/verify/download-live.mjs <결과 폴더> --sha256 <해시>` → **확인**: 세 주소 모두 같은 크기 · SHA-256, 「모두 통과」
- **끝나면 남길 것**: CHANGELOG 한 줄(크기 · SHA-256 · 판 번호 · 확인 건수), 팀장 보고 한 번
- **막히면**: 확인 도구를 관리자 권한 없이 돌리면 단추를 못 눌러 전부 «걸림»이 난다(결함 아님). 세 확인 중 하나라도 실패하면 공개 파일을 바꾸지 않는다. 이전 공개판은 7일간 소프트 삭제로 되살릴 수 있다.

## 7. 폰트 서브셋 다시 만들기

- **언제**: 화면 문구 · `index.html` / `privacy.html` · og 문구에 새 글자가 들어가 `npm run fonts:check`가 실패할 때
- **시작 전에 읽을 규칙**: `RULES.md` R-6
- **순서**
  1. `npm run fonts:charset` → **확인**: 글자 목록 갱신
  2. `python scripts/fonts/subset.py` → **확인**: 서브셋 woff2 생성
  3. `npm run fonts:check`가 알려 주는 `?v=` 판으로 서브셋 주소 전부를 바꾼다 → **확인**: `npm run fonts:check` 통과
  4. 포스터 글꼴 조각을 다시 만들었으면 `node scripts/verify/release-baseline.mjs` 화소 대조(기준 지문은 app.md «느린 와이파이 최적화»)
- **끝나면 남길 것**: CHANGELOG 한 줄
- **막히면**: 검사를 좁혀 통과시키지 않는다 — 글자 몇 개 더 담는 쪽이 싸다.

## 8. 대기 영상 한 편 교체

- **언제**: 로딩 화면 영상을 다시 만들었을 때
- **시작 전에 읽을 규칙**: `RULES.md` R-19 · R-20 · R-21
- **순서**
  1. 유료 생성 전 팀장에게 «무엇을 몇 번 · 예상 $ · 누적 $» 한 줄(R-21)
  2. 새 원본이 눈 · 입 규칙을 지키는지: `python scripts/media/check-face-elements.py <장면> <영상>` → **확인**: 한 프레임도 걸리지 않음
  3. `.cache/video-review-20261007/waiting-sources.json`의 그 편 경로만 새 원본으로 바꾸고 `scripts/media/encode-waiting-videos.py`로 12편 전체를 다시 굽는다 → **확인**: 바꾼 편만 해시 · 정지 그림이 바뀜
  4. 목록 `src/studio/waiting-videos.json` 갱신 후 `npm run build`, `node scripts/verify/waiting-videos-live.mjs` → **확인**: 12편 재생 · 첫 프레임 이음매 통과
- **끝나면 남길 것**: CHANGELOG 한 줄, 누적 비용 기록
- **막히면**: 같은 방식으로 두 번 실패하면 세 번째는 하지 않는다 — 방향을 바꾸거나 최선으로 완성하거나 결정을 올린다.

## 9. 현장 의견 내보내기 · 삭제

- **언제**: 의견 모으기가 끝난 뒤(받기는 11/14 00:00에 닫힘, 90일 뒤 자동 삭제)
- **시작 전에 읽을 규칙**: `RULES.md` R-12 · R-15
- **순서**
  1. `gcloud auth application-default login`(프로젝트 소유 계정)
  2. `node scripts/ops/feedback-export.mjs export <폴더>` → **확인**: CSV · json 생성
  3. 팀장에게 넘긴 뒤 `node scripts/ops/feedback-export.mjs delete <json> --confirm` → **확인**: 내보낸 것만 지워짐
- **끝나면 남길 것**: CHANGELOG 한 줄
- **막히면**: 카카오 연결 · 비밀 값은 app.md «현장 의견 받기». 비밀 값은 Bumm님이 직접 넣는다.

## 10. 의존성 최신화

- **언제**: 팀장이 COMMON_STANDARDS §36 최신화를 지시할 때
- **시작 전에 읽을 규칙**: `RULES.md` R-39 · R-43
- **순서**
  1. 새 가지를 따고 프리즈 태그를 먼저 찍는다
  2. 루트 · `functions/` · `desktop/`의 `package.json`을 최신 안정판으로 올리고 `overrides`는 걷는다(남기는 것: desktop의 minimatch)
  3. `deploy.yml` · `pr-check.yml`의 action SHA와 `FIREBASE_TOOLS`를 맞추고, 그 판을 인용한 문서(CLAUDE.md · app.md · runbook)를 같이 grep해 고친다
  4. §2 전부 + 포스터 화소 대조 → **확인**: 시험 통과, 화소 차이 0
  5. PR → CI green → 배포 → §4
- **끝나면 남길 것**: CHANGELOG, 팀장 보고
- **막히면**: 시험이 새 판에서 깨지면 시험을 약하게 만들지 말고 원인을 찾아 고친 뒤 일부러 깨뜨려 빨간불을 본다.

## 11. 행사 당일 장애 대응

- **언제**: 행사 중 429 · AI 실패 · 콜드스타트 등 이상이 생겼을 때
- **시작 전에 읽을 규칙**: `RULES.md` R-4 · R-17 · R-18
- **순서**: `_docs/ops/runbook.md`를 연다 — 콜드스타트, 429 네 종류, AI 실패, 롤백이 거기 있다
- **막히면**: 라이브 부하테스트 · 확인용 생성을 하지 않는다. 팀장에게 한 줄 보고.

## 따로 있는 상세 런북

- `_docs/ops/runbook.md` — 행사 당일 장애 대응 · GitHub 정지 중 로컬 배포(§9)
- `_docs/ops/printer-capacity.md` — 프린터 · 노트북 처리량 계산
- `_docs/ops/camera-example-videos.md` — 촬영 예시 영상 앱 연결 순서
