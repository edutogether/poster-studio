# Poster Studio 포스터 디자인 개편 — 2026-10-02

## 2026-10-02 — Poster Studio 결과 화면과 디자인 8종 재구성

- Bumm님 요청으로 결과 화면을 왼쪽 회색·오른쪽 흰색으로 교체하고, 왼쪽 상단에 마이크와 Voice Cinema(Cinema 빨강)를 표시했다. 되돌리기·확대는 Lucide 공식 SVG를 사용한다.
- 장르 이름 대신 시네마·에디토리얼·컬러 블록·아치 프레임·필름스트립·폴라로이드·타이포그래피·트립틱으로 구분한다. 사진 면적·위치·프레임·색면을 다르게 조판하고 상단 두 로고와 하단 행사 정보를 유지한다.
- 프론트 128검사, 타입·린트·빌드·폰트 504자 검사 통과. 실제 폰트로 8종×3가지 제목/출연진의 경계·겹침 검사 통과. 헤드리스에서 8개 선택·확대·1920/1366/390px 화면 확인, 카메라·생성 API 호출 0건.
- 로컬 5500에서 새로고침 후 샘플 포스터 보기로 다시 들어가면 새 틀이 적용된다. 푸시·배포 없음. 이전 촬영·로딩 작업의 미커밋 변경은 보존했다.

## 참고 자료와 적용

- [Adobe 포스터 디자인 가이드](https://blog.adobe.com/en/publish/2018/02/27/idmovieweek-designing-show-stopping-posters-type): 이미지·제목의 우선순위와 대비, 여백을 구성 기준으로 참고했다.
- [Canva 영화 포스터 템플릿 목록](https://www.canva.com/posters/templates/movie/): 장르와 별개인 레이아웃 선택 방식을 참고했다. 기존 템플릿·이미지를 복사하지 않았다.
- Lucide 공식 [rotate-ccw](https://lucide.dev/icons/rotate-ccw), [maximize](https://lucide.dev/icons/maximize), [mic](https://lucide.dev/icons/mic): 원본 SVG 경로와 ISC 고지 포함.

## 확인

`npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run fonts:check` 통과. `node scripts/verify/poster-design-refresh.mjs`는 로컬 샘플 진입, 8종 전환, 색상·표기, 확대 열기, 가로 넘침을 검증한다. 유료 생성·카메라·실제 인쇄는 호출하지 않는다.
