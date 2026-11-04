---
status: done
등급: 2
작성자: Poster Studio 세션 (Claude Opus 5.5)
작성 시각: 2026-11-01 10:20 KST
---

# Dependabot 알림 6건을 고친 판으로 닫는다 — 배포 도구는 잠금 파일 밖 `npx firebase-tools@15.32.1`

## 문제

2026-10-31 10:01Z에 새 권고 3종(GHSA-6pq8-jhm2-2vcw qs · GHSA-3g3m-2fjr-6pw4 glob · GHSA-g3hv-75wg-m249 minimatch, 모두 보통)으로
알림 6건이 열렸다. 잠금 파일이 실제로 고치기 전 판이다.

| # | 패키지 | 잠금 파일 | 지금 | 고친 판 |
|---|---|---|---|---|
| 84 | qs | functions(운영) | 6.16.0 | 6.16.1 |
| 85 | glob | functions(운영) | 10.5.0 | 14.0.2 |
| 86 | minimatch | functions(운영) | 9.0.9 · 10.2.6(eslint) | 11.0.1 |
| 87 | minimatch | 루트(개발) | 10.2.6 | 11.0.1 |
| 88 | qs | tools/deploy(개발) | 6.16.0 | 6.16.1 |
| 90 | minimatch | tools/deploy(개발) | 3.1.5 · 5.1.9 · 6.2.3 · 9.0.9 | 11.0.1 |

Dependabot 보안 갱신은 #88만 PR(#23)을 만들었다. glob(functions)과 minimatch(tools/deploy)는
10/31 10:02 · 12:06 · 12:44Z에 `security_update_not_possible`로 실패했다(Actions «Dependabot Updates» 로그).

- glob: firebase-admin 14.3.0 → @google-cloud/firestore → firestore-api 0.2.0 → google-gax 5.0.8 → rimraf 5.0.10이 `glob ^10.3.7`을 적는다.
  최신 firebase-admin 14.5.0 · Firestore 9.4.0도 firestore-api `^0.2.0`(google-gax 5)이라 위쪽을 올려도 안 닫힌다(실제로 올려 봄).
- minimatch: 고친 판은 11뿐이다. eslint 10.14.0(최신)은 `^10.2.6`, firebase-tools 15.34.2(최신)는 `^3.0.4`를 적는다.

## 원하는 결과

- 알림 6건이 손으로 닫지 않고 저절로 닫힌다.
- 루트·functions: `overrides`로 qs 6.16.2 · glob 14.0.3 · minimatch 11.0.3을 쓴다(Codyssey PR #104와 같은 방식).
- 배포 도구: `tools/deploy/`(firebase-tools만 담은 잠금 파일)를 없애고, CI·로컬 배포 절차가
  `npx firebase-tools@15.32.1`을 정확한 판으로 부른다(`_shared/CONVENTIONS.md` §3.7, 2026-11-01 Bumm님 결정).
  설치 스크립트는 지금처럼 끈다(`--ignore-scripts`와 같은 효과의 `npm_config_ignore_scripts=true`).

## 영향받는 사용자·시스템

- **화면·함수 동작 변화 0이 조건이다**(11/7 표본 모드 · 11/12 현장 시험 앞).
  - 화면: 루트 변경은 개발 의존성(eslint의 minimatch)뿐이다. `dist`가 바이트까지 같아야 한다.
  - 함수: 소스는 그대로고 잠금 파일만 바뀐다. 바뀌는 세 패키지(qs · glob · minimatch)가 실행 중 불리지 않아야 한다.
    glob·minimatch는 rimraf만 끌어오는데 rimraf를 부르는 코드가 없다. qs는 express가 불러오지만 이 앱은 `query parser`(기본 `simple`)도 urlencoded 본문 해석도 쓰지 않는다.
- CI 배포 경로: 함수 세 개(`posterStudio` · `keepWarm` · `cleanupOldCountersSchedule`)와 hosting이 다시 배포된다.
  배포 도구의 하위 의존성은 실행할 때마다 정해진다(§3.7이 알고 고른 대가).

## 제약

- 화면·함수 동작 변화 0. `dist` 바이트 대조 · 라이브 대조 · 시험 · 린트 결과 동일 · 에뮬레이터로 확인한다.
- minimatch 11을 firebase-tools 아래에 덮어쓰지 않는다(§3.7: `fsAsync`·`superstatic`이 «m is not a function»으로 깨진다).
- 알림을 손으로 닫지 않는다. 라이브에서 «생성»을 누르지 않는다.
- 배포가 생기면 «배포 직전 한 줄» 뒤 팀장 승인을 받는다. 강제 push 없음.
- 되돌릴 자리: 함수는 지금 판 `posterstudio-00044-gaf`, hosting은 배포 전에 지금 라이브를 30일 채널로 복제한다. 코드는 태그 `pre-deps-20261101`(= `adff28b`).

## 미결 질문

- 없음. 방향은 팀장 메시지 2건(11/1, 대표님 결정 전달)으로 정해졌다.
- 기록: overrides 쪽(qs · glob · minimatch)은 첫 지시(«원인을 찾아 고쳐 저절로 닫히게») 직후 이 문서보다 먼저 손댔다.
  두 번째 지시가 같은 방식을 정했고, 시험 결과는 이 문서의 조건으로 다시 잰다.
