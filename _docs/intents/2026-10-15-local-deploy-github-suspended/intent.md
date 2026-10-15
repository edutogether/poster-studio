---
status: done
등급: 2
작성자: Poster Studio 세션(팀장 전달, Bumm님 10/15 승인)
작성 시각: 2026-10-15
---

# GitHub 정지 중 master를 이 컴퓨터에서 Firebase로 직접 배포

## 문제

- GitHub 계정이 정지돼 push가 안 되고, CI(`.github/workflows/deploy.yml`)도 돌지 않는다.
- 라이브는 10/10 21:07 KST 릴리스(마지막 push a658d89)에 머물러 있다.
  그 뒤 master에 쌓인 대기 영상 12편 최신판(03·04·05·11·12 교체)과 단추 수정이 행사 전 확인에 나가지 못한다.

## 원하는 결과

- master(8d752d4)가 두 주소(`poster.edutogether.kr`·`poster-studio.web.app`)에 나간다. 샘플 모드(`VITE_SAMPLE_MODE=1`)는 그대로다.
- 내보내는 파일은 CI가 만들었을 파일과 바이트까지 같다. CI가 하던 검사와 배포 직후 확인을 같은 기준으로 로컬에서 한다.
- 되돌릴 자리를 배포 전에 만들어 둔다. 되돌리는 명령은 실제로 실행해 확인한다(«눌러본 것만 롤백 지점»).
- GitHub가 정지된 동안 다시 쓸 수 있게 절차를 runbook·app.md에 남긴다.

## 영향받는 사용자·시스템

- 라이브 화면(사내 클로즈 베타, 샘플 모드)이 바뀐다. 로딩 화면 영상과 1·2·3단계 단추다.
- Hosting(`poster-studio` 사이트)만 바뀐다. functions는 마지막 push 이후 바뀌지 않아 내보내지 않는다(근거는 아래 «확인한 것»).
- 포스터 디자인 가지 `poster-redesign-20261014`는 넣지 않는다(Bumm님 템플릿별 지적 대기).

## 제약

- 줄끝: 이 컴퓨터의 체크아웃은 CRLF(`core.autocrlf=true`)라 그대로 빌드하면 CI(LF)와 다른 파일이 나간다(app.md «자주 틀리는 것»).
  그래서 LF로 따로 꺼낸 사본(`git -c core.autocrlf=false worktree add`)에서 빌드·배포한다.
- 배포 도구는 CI와 같은 잠금 판(`tools/deploy`, firebase-tools 15.32.1)을 쓴다.
- 부스 코드 스위치는 꺼진 채로 둔다. 로컬에 `functions/.env.*` 비밀 파일을 만들지 않는다.
- 라이브에서 «생성»을 누르지 않는다. 확인은 샘플 흐름과 사진 없는 요청(400 기대)으로만 한다.

## 확인한 것(배포 전)

- 라이브와 같은 것을 만들 수 있다: a658d89를 LF 사본에서 빌드한 `dist/` 299개 파일이 라이브와 SHA-256까지 모두 같다.
- functions가 바뀌지 않았다:
  - `git diff origin/master master -- functions/`가 비어 있다.
  - 마지막 functions 변경(48e108b)은 화면 코드(`GenerationWait.tsx`)도 바꿨다. 그래서 라이브 화면이 a658d89 빌드와 같다는 것은 48e108b 이후 커밋이 배포됐다는 뜻이다.
  - CI는 functions 배포가 성공해야 hosting을 내보낸다.
- 라이브 함수 환경변수에 부스 코드 항목이 없다(스위치 꺼짐).

## 미결 질문

- 없음(대상·범위·샘플 모드는 팀장 지시로 정해졌다).

## 결과(2026-10-15)

- 라이브 두 주소 = master `8d752d4`(hosting 판 `ee321037c278595a`). 323개 파일이 빌드와 바이트까지 같다.
- CI 스모크와 라이브 대기 영상 12편 재생 확인을 통과했다.
- 되돌림 채널 `rollback-20261015`(이전 판 `2969227513313223`)로 실제로 되돌렸다가 다시 냈다.
- 절차는 `_docs/ops/runbook.md` §9에 있고, 자세한 숫자는 `_docs/CHANGELOG.md` 2026-10-15에 있다.
