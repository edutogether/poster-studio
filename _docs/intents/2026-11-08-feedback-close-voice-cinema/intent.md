---
status: in-progress
등급: 2
작성자: Poster Studio 세션
작성 시각: 2026-11-08
---

# «의견 보내기» 11/14 0시 마감 · 설치판 제외 · Voice Cinema 의견도 이 서버로

> 팀장 전달(2026-11-08, Bumm님 결정)이라 그 지시가 승인이다. 배포는 감사 → 태그 → «배포 직전 한 줄» → 팀장 OK 뒤.
> 앞선 의견 받기: [2026-11-05-field-feedback](../2026-11-05-field-feedback/intent.md).

## 문제

- «의견 보내기»는 행사 전 시험용이다. 행사 날(11/14)에는 Poster Studio · Voice Cinema 두 앱에서 모두 빠져야 한다.
  - 그날 배포를 하지 않고 시각이 되면 저절로 빠져야 한다.
- 설치판은 인터넷이 안 되는 것이 기준이라 의견 보내기를 두지 않는다. 웹에만 둔다.
- Voice Cinema에도 같은 의견 받기가 필요하다. Bumm님: «포스터랑 똑같은 걸 써 … 보이스 · 포스터 하위 폴더만 갈라서 받으면 안 돼 ?»

## 원하는 결과

- **마감 시각 하나**: `functions/feedback-window.json`의 `closesAt` = `2026-11-14T00:00:00+09:00`.
  - 서버(`functions/index.js`)와 Poster Studio 화면(`src/feedback.ts`)이 같은 파일을 읽는다. 다른 곳에 시각을 적지 않는다.
- **서버**: 그 시각부터 `/feedback` · `/feedback/voice-cinema` 모두 410 `feedback_closed`.
  - 본문을 읽기 전에 거절한다. 카운터 · 저장 · 카카오가 하나도 일어나지 않는다.
  - 이미 받은 의견 · 내보내기 도구 · 90일 정리는 그대로다.
- **화면**(웹 PC · 휴대폰): 그 시각 이후 연 화면에는 링크가 없다.
  - 열어 둔 화면은 0시가 되는 순간 링크와 열린 창이 내려간다(타이머).
  - 잠든 탭은 다시 보이는 순간 잰다.
  - 기기 시계가 틀려 보내면 서버가 410이고, 창에 «의견은 이제 받지 않아요.»가 뜬다.
- **설치판**: 이미 빠져 있다(`StudioView.tsx`의 `!DESKTOP` — 11/5부터). 시험이 고정한다.
  - 설명서 00~03에는 «의견 보내기» 안내가 없다(11/8 PDF 글자 확인). 그래서 설명서는 바꾸지 않는다.
- **Voice Cinema 의견**: `POST /feedback/voice-cinema`.
  - 받는 칸 · 검사 · 크기 · 한도는 Poster Studio와 같다(여섯 칸 · 8KB · 같은 곳 10분 10건 · 하루 300건).
  - 저장은 Firestore `feedbackVoiceCinema`이고, Poster Studio는 예전 그대로 `feedback`이다.
  - 한도 카운터 문서 이름이 앱마다 달라 서로의 한도를 먹지 않는다.
  - 카카오 글 첫머리는 앱 이름이다: «[Voice Cinema 의견]» / «[Poster Studio 의견]».
  - 링크는 두 앱 모두 이미 등록한 `poster.edutogether.kr`이다. 카카오 콘솔에 새로 등록할 것이 없다.
- **받는 방법(안전)**:
  - Voice Cinema 화면에는 이 서버의 부스 토큰이 없다.
  - Voice Cinema의 App Check 토큰은 그 프로젝트(`inky-voice-cinema`) 것이라 여기서 확인할 수 없다.
  - 그래서 Origin을 본다. Voice Cinema 주소에서 온 요청만 받는다:
    - 정식 `voice.edutogether.kr`
    - 옛 주소 `voice-cinema.web.app` · `voice-cinema.firebaseapp.com`
    - Portal `edutogether.kr`
  - Origin은 브라우저 밖에서는 꾸밀 수 있다. 그래서 진짜 막는 것은 칸 검사 · 크기 · 한도 · 마감이다.
  - 거꾸로 Voice Cinema 전용 주소 세 곳은 CORS 목록에 넣는 대신 이 자리만 쓴다. `/generate` · `/health` · `/feedback` · `/kakao/*`는 403이다.
- **내보내기**: `node scripts/ops/feedback-export.mjs export <폴더> --app voice-cinema`.
  - 앱을 주지 않으면 예전 그대로 Poster Studio다.
  - 지우기는 json에 적힌 컬렉션만 지운다.
  - 90일 정리 작업도 두 컬렉션을 모두 본다.

## 영향받는 사용자·시스템

- 웹 1단계 «의견 보내기»(PC · 휴대폰), 서버 `posterStudio` 함수(새 경로 · CORS 목록 · 정리 작업), 내보내기 도구.
- Voice Cinema 저장소는 이 세션이 고치지 않는다. 호출 규격은 팀장에게 보내고, 팀장이 Voice Cinema 세션에 전달한다.

## 제약

- 비용 0 — 라이브 «생성» 없음, 카카오 실제 호출 없음(시험은 가짜 카카오).
- 개인정보: 받는 칸은 여섯 칸 그대로(사진 · 아동 이름 없음). 예외 컬렉션은 `feedback`에 `feedbackVoiceCinema` 하나만 더한다(같은 성격 · 같은 90일).
- 시각 경계는 «1ms 전 받음 · 그 시각부터 거절»을 시험으로 고정하고, 일부러 깨뜨려 걸리는지 본다.
- 카카오 앱 키 · 토큰 값은 보지도 적지도 않는다.

## 미결 질문

- 없음. 남는 위험: Origin은 꾸밀 수 있다. 그래서 마감 전 5일 동안 최악의 경우는 Voice Cinema 자리로 하루 300건의 글 · 카카오 알림이다(저장 · 알림 모두 그 안에서 멈춘다).
