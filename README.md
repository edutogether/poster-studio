# 🎬 InKY AI 영화 포스터 제작소 (v3 — 정적 웹앱 + Firebase Functions)

노트북(웹캠) + 포토프린터로 운영하는 **제4회 인천어린이청소년영화제** 체험부스 웹앱입니다.
웹캠으로 찍은 사진을 AI가 영화 포스터로 바꾸고, **클래식·임팩트·시네마·포토카드 4가지 버전**을 즉석에서 골라 인쇄합니다.

## v3에서 바뀐 점
- **설치 없이 브라우저 주소만 열면 바로 됨** — 이전 버전은 노트북마다 Node.js 서버를 설치·실행해야 했지만, 이제 GitHub Pages에 배포된 정적 웹페이지를 여는 것만으로 끝난다. 교육청 관리 노트북(MDM)이라 소프트웨어 설치가 막혀 있어도 문제없다.
- **AI 이미지 생성만 Firebase Functions(서버리스)가 처리** — OpenAI API 키는 노트북이 아니라 Firebase Secret Manager에 보관되고, 웹캠 촬영·포스터 합성(타이포·크레딧·필름그레인)은 이전처럼 전부 브라우저에서 그대로 실행된다.
- v2 기능(개인/단체 선택, 자동 타이포그래피, 4가지 고퀄 버전, 얼굴 보존 강화)은 그대로 유지.

## 구조
```
public/          정적 프론트엔드 (GitHub Pages로 배포)
  index.html
  app.js         촬영 → 프롬프트 구성 → Functions 호출 → 캔버스 합성
  style.css
functions/       Firebase Cloud Functions (AI 이미지 생성 API만 담당)
  index.js
  package.json
firebase.json
.github/workflows/pages.yml   master 푸시 시 public/ 을 GitHub Pages로 자동 배포
```

## 운영 순서 (행사 당일)
1. 부스 노트북에서 배포된 GitHub Pages 주소를 연다 (즐겨찾기 권장).
2. 카메라 켜기 → 3·2·1 촬영
3. 개인/단체 선택, 이름(또는 단체명·출연진), 영화 제목, 장르 입력
4. AI 포스터 만들기 → 4가지 버전 자동 생성
5. 갤러리에서 마음에 드는 버전 클릭 → 인쇄하기(또는 PNG 저장)

## 개발/배포 (관리자용)
### 프론트엔드
`public/` 아래 정적 파일을 고치고 `master`에 푸시하면 `.github/workflows/pages.yml`이 자동으로 GitHub Pages에 배포한다. 로컬 미리보기는 `public/index.html`을 정적 서버(예: VS Code Live Server)로 열면 된다 — 단, AI 생성 버튼은 Firebase Functions 배포가 끝나야 동작한다.

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

> 비용 감(참고): gpt-image-2 세로 medium 약 $0.04/장. 행사 규모(약 1,000명, 1인 1~2회)면 대략 $20~30 수준.
> 2K·4K는 4x6 인화에 불필요하니 medium 권장.

## 프린터 팁
- SELPHY는 4×6 인화지 기준. 포스터가 2:3 비율이라 4×6에 꽉 맞습니다.
- 인쇄 대화상자에서 여백 없음(Borderless) 선택.
- 행사 전 10장 이상 테스트 출력 권장.

## 개인정보 안내
- 학생 사진을 사용하므로 부스 안내문에 AI 이미지 생성·출력 체험 동의 및 **사진이 OpenAI(미국) 서버로 전송되어 처리된다는 사실**을 함께 게시하세요.
- 사진과 함께 입력한 영화 제목·홍보 문구도 프롬프트에 포함돼 OpenAI로 함께 전송됩니다(이름·단체명·출연진은 브라우저 안에서만 쓰이고 전송되지 않습니다).
- OpenAI는 남용 모니터링 목적으로 입력을 최대 30일 보관할 수 있습니다(자체 저장이 아니라 OpenAI 측 정책).
- 촬영 사진과 AI 생성 결과물은 노트북/서버에 영구 저장하지 않으며, Functions 인스턴스의 임시 파일은 정상/오류 경로 모두에서 생성 직후 삭제됩니다.
- 단, 완성된 포스터를 **`PNG 저장` 버튼으로 직접 내려받으면** 아동 얼굴·이름이 담긴 파일이 노트북 다운로드 폴더에 남습니다. 이 파일은 **2026-12-31까지 보관 후 삭제**하며, 삭제는 앱이 자동으로 하지 않고 **교육청 장학사가 직접 처리**합니다(2026-08-29 대표 결정).
- 이 행사는 교육청이 사전에 서면 참여동의를 받은 아동·교사만 참여하는 폐쇄형 행사로, 앱 내 별도 동의 절차는 두지 않습니다(화면 상단 고지 배너만 유지).
