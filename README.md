# 🎬 InKY AI 영화 포스터 제작소 (v3 — 정적 웹앱 + Firebase Functions)

노트북(웹캠) + 포토프린터로 운영하는 **제4회 인천어린이청소년영화제** 체험부스 웹앱입니다.
웹캠으로 찍은 사진을 AI가 영화 포스터로 바꾸고, **클래식·임팩트·시네마·포토카드 4가지 버전**을 즉석에서 골라 인쇄합니다.

## v3에서 바뀐 점
- **설치 없이 브라우저 주소만 열면 바로 됨** — 이전 버전은 노트북마다 Node.js 서버를 설치·실행해야 했지만, 이제 Firebase Hosting에 배포된 정적 웹페이지를 여는 것만으로 끝난다(2026-09-01부로 GitHub Pages에서 이전). 교육청 관리 노트북(MDM)이라 소프트웨어 설치가 막혀 있어도 문제없다.
- **AI 이미지 생성만 Firebase Functions(서버리스)가 처리** — OpenAI API 키는 노트북이 아니라 Firebase Secret Manager에 보관되고, 웹캠 촬영·포스터 합성(타이포·크레딧·필름그레인)은 이전처럼 전부 브라우저에서 그대로 실행된다.
- v2 기능(개인/단체 선택, 자동 타이포그래피, 4가지 고퀄 버전, 얼굴 보존 강화)은 그대로 유지.

## 📕 행사 당일 문제가 생기면 → [`_docs/ops/runbook.md`](_docs/ops/runbook.md)
부스 진행자용 장애 대응 런북(콜드스타트, 429 오류 3종, AI 생성 실패, 인쇄 문제, 롤백 절차)입니다.
**2026-09-08 문서 정비로 저장소 루트에서 `_docs/ops/` 아래로 옮겼습니다** — 예전 위치(루트 `runbook.md`)를 기억하고 계셨다면 여기로 오시면 됩니다.

## 구조
```
public/          정적 프론트엔드 (Firebase Hosting으로 배포 — https://poster-studio.web.app)
  index.html
  app.js         진입점(ES모듈) — 아래 모듈들을 import해 부팅
  camera.js      웹캠 촬영          api.js       Functions 호출 + 갤러리
  layout.js      폰트·캔버스 도구    templates.js 포스터 4종 템플릿
  print.js       PNG 저장·인쇄      constants.js/state.js/dom.js  공용 상수·상태·DOM
  style.css      privacy.html       poster-wall.webp
functions/       Firebase Cloud Functions (AI 이미지 생성 API만 담당)
  index.js
  package.json
_docs/           저장소 문서 (배포 대상 아님 — hosting public은 public/ 뿐)
  ops/runbook.md   행사 당일 장애 대응 런북
  intents/         건별 작업 의도 기록(intent.md)
AGENTS.md        AI 코딩 도구(Claude Code / Codex 등)가 읽는 저장소 안내
firebase.json    hosting(poster-studio 타겟) + functions 설정, 보안헤더(CSP 등) 포함
.github/workflows/deploy.yml   master 푸시 시 test → functions 배포 → hosting(poster-studio) 배포 순서로 자동 진행
```

## 운영 순서 (행사 당일)
1. 부스 노트북에서 https://poster-studio.web.app 을 연다 (즐겨찾기 권장).
2. 카메라 켜기 → 3·2·1 촬영
3. 개인/단체 선택, 이름(또는 단체명·출연진), 영화 제목, 장르 입력
4. AI 포스터 만들기 → 4가지 버전 자동 생성
5. 갤러리에서 마음에 드는 버전 클릭 → 인쇄하기(또는 PNG 저장)

## 개발/배포 (관리자용)
### 프론트엔드
`public/` 아래 정적 파일을 고치고 `master`에 푸시하면 `.github/workflows/deploy.yml`이 자동으로 Firebase Hosting(`poster-studio` 사이트)에 배포한다. 로컬 미리보기는 `public/index.html`을 정적 서버(예: VS Code Live Server)로 열면 된다 — 단, AI 생성 버튼은 Firebase Functions 배포가 끝나야 동작한다. `firebase.json`의 CSP 등 보안헤더는 정적 서버 미리보기에는 안 걸리므로, 헤더 관련 동작을 확인하려면 `firebase deploy --only hosting:poster-studio`로 실제 배포하거나 `firebase emulators:start --only hosting`을 쓸 것.

### Firebase Functions (AI 생성 API)
```bash
cd functions
npm install
firebase functions:secrets:set OPENAI_API_KEY   # 최초 1회, 콘솔에 값 직접 입력
firebase deploy --only functions
```
배포 후 발급되는 함수 URL을 `public/constants.js`의 `API_BASE` 상수에 넣어야 프론트엔드가 연결된다.

> Firebase 프로젝트 생성·Blaze(종량제) 플랜 전환은 콘솔(대표 계정) 작업이 먼저 필요하다 — 자세한 내용은 `CLAUDE.md` 참고.

## 운영 옵션 (Firebase Functions 환경변수/시크릿)
- `OPENAI_API_KEY`: 필수, Secret Manager로 등록
- `IMAGE_MODEL`: 기본 gpt-image-2(최신·얼굴보존 우수). 문제 시 gpt-image-1.5로 교체 가능.
- `IMAGE_QUALITY`: low / medium / high (4x6 인화는 medium 충분, 귀빈용만 high)
- `VARIANTS`: 한 번에 만드는 AI 그림 장수(1~2). 1이면 4컷, 2면 8컷.

> 비용 감(참고): gpt-image-2 세로 medium 약 **$0.04/장**. 2K·4K는 4x6 인화에 불필요하니 medium 권장.
>
> **상한은 추정이 아니라 코드가 물리적으로 강제한다.** 참가자는 교육청 명단 기준 **2,000명 하드캡**이고
> 사진 한 장당 생성은 **최대 2회**(최초 1회 + 재생성 1회, `PHOTO_GENERATION_LIMIT`)이므로 산술 상한은
> 2,000 × 2 × $0.04 = **$160**이다. 여기에 더해 `functions/index.js`가 두 겹으로 막는다 —
> `DAILY_BUDGET_MAX=4000`(하루 $160)과 `RATE_LIMIT_MAX=150`(10분당). 행사시간 270분은 10분 구간 27개라
> 레이트리밋만으로도 최대 4,050건 = **$162**를 넘길 수 없다. OpenAI 대시보드 월 하드리밋 **$200**이 최종 백스톱이다.
>
> ⚠️ 그 월 하드리밋은 개발기간 동안 **$10**으로 걸어둔 상태다 — **행사 전 $200으로 올리지 않으면 오전 중에 생성이 멈춘다.**
> `_docs/ops/runbook.md`의 "행사 전 필수 체크리스트" 참고.

## 프린터 팁
- SELPHY는 4×6 인화지 기준. 포스터가 2:3 비율이라 4×6에 꽉 맞습니다.
- 인쇄 대화상자에서 여백 없음(Borderless) 선택.
- 행사 전 10장 이상 테스트 출력 권장.

## 개인정보 안내
- 학생 사진을 사용하므로 부스 안내문에 AI 이미지 생성·출력 체험 동의 및 **사진이 OpenAI(미국) 서버로 전송되어 처리된다는 사실**을 함께 게시하세요.
- 사진과 함께 입력한 영화 제목·홍보 문구도 프롬프트에 포함돼 OpenAI로 함께 전송됩니다(이름·단체명·출연진은 브라우저 안에서만 쓰이고 전송되지 않습니다).
- OpenAI는 남용 모니터링 목적으로 입력을 최대 30일 보관할 수 있습니다(자체 저장이 아니라 OpenAI 측 정책).
- 촬영 사진과 AI 생성 결과물은 노트북/서버에 영구 저장하지 않으며, Functions 인스턴스의 임시 파일은 정상/오류 경로 모두에서 생성 직후 삭제됩니다.
- "사진 1장당 재생성 2회까지" 한도를 서버에서도 강제하기 위해, 촬영한 사진의 SHA-256 해시값(사진 원본이 아니라 그 해시)과 생성 시각만 Firestore에 저장합니다. 사진 원본이나 이 앱만으로는 누구 사진인지 알 수 없지만, 원본 사진 파일을 따로 가진 사람이 있다면 "이 사진이 언제 제출됐는지"는 대조해 확인할 수 있어 완전한 익명 데이터는 아닙니다(2026-09-01 6차 감사 발견). 이 값(및 레이트리밋용 숫자 카운터들)은 매일 새벽 4시(KST)에 실행되는 `cleanupOldCountersSchedule` 함수가 30일 지난 것을 자동으로 지웁니다(2026-09-01, 콘솔 TTL 정책이 아니라 코드로 직접 구현 — 자세한 내용은 `functions/security-notes.md` 참고).
- 단, 완성된 포스터를 **`PNG 저장` 버튼으로 직접 내려받으면** 아동 얼굴·이름이 담긴 파일이 노트북 다운로드 폴더에 남습니다. 이 파일은 **2026-12-31까지 보관 후 삭제**하며, 삭제는 앱이 자동으로 하지 않고 **교육청 장학사가 직접 처리**합니다(2026-08-29 대표 결정).
- 이 행사는 교육청이 사전에 서면 참여동의를 받은 아동·교사만 참여하는 폐쇄형 행사로, 앱 내 별도 동의 절차는 두지 않습니다. 고지는 화면 상단 헤더의 "개인정보 처리방침 보기" 링크(`public/privacy.html`)로 제공합니다 — 2026-09-03 화면 개편 전에는 같은 내용을 헤더에 배너로 길게 펼쳐뒀었고, 내용은 그대로 두고 노출 방식만 링크로 바뀌었습니다.
