# 보안 참고사항 (감사마다 반복 질문되지 않도록 기록)

## `npm audit`가 보고하는 moderate 7건은 실위험 없음 — `npm audit fix --force` 절대 금지

`npm audit`를 돌리면 `uuid`(v3/v5/v6, buffer bounds check 누락)의 취약점이 아래 경로로
전이 의존성에 걸려 있다고 뜬다(2026-09-01 기준 7건 — 예전엔 9건이었는데 의존성
업데이트로 줄었다):

```
uuid → gaxios/teeny-request/retry-request → @google-cloud/storage
     → firebase-admin
     → firebase-functions (우리가 실제로 의존하는 패키지)
```

**정정(2026-09-01, 6차 감사 발견)**: 이 문서는 예전에 "이 앱은 firebase-admin을
전혀 import하지 않고 Firestore/Storage를 아예 안 쓴다"고 적혀 있었는데, 이건
2026-08-30 Firestore 기반 전역 레이트리밋 도입 이후로 **더 이상 사실이 아니다** —
`functions/index.js`가 `firebase-admin/app`·`firebase-admin/firestore`를 실제로
import하고, `/generate`·`/health` 요청마다 Firestore 트랜잭션을 실행한다.

그래도 **실질적 위험은 여전히 낮다** — 단, 이유가 바뀌었다. `npm audit`가 짚어주는
정확한 취약점 경로를 다시 추적해보면(`npm ls @google-cloud/firestore` +
`npm audit --json`으로 확인), 문제의 uuid 취약점은 **`@google-cloud/storage`를
거쳐야만** 도달한다 — `@google-cloud/firestore`(우리가 실제로 쓰는 패키지)는 이
취약 경로에 아예 등장하지 않는다. 즉:
- **맞는 이유**: "Firestore/firebase-admin을 안 쓴다" (더 이상 사실 아님)
- **지금 맞는 이유**: "Firestore는 쓰지만, npm audit이 지목한 정확한 취약 경로는
  우리가 절대 호출하지 않는 `@google-cloud/storage`(파일 저장소, 이 앱은 사진을
  즉시 삭제하고 어디에도 영구 저장하지 않으므로 Storage API를 쓸 이유 자체가 없다)를
  거쳐야만 발동한다."

`npm audit fix --force`가 제안하는 해결책은 `firebase-admin`을 **10.3.0으로
다운그레이드**하는 것인데(우리가 실제로 쓰는 Firestore 트랜잭션 API가 그 버전에서도
동작하는지 검증되지 않았고, 현재 쓰는 v14 계열보다 훨씬 오래된 major다), 오히려
기능 퇴행·호환성 문제를 일으킬 수 있다. **절대 실행하지 말 것.**

해소되려면 `firebase-admin`(또는 그 상위 의존성 `@google-cloud/storage`)이 새
버전에서 이 전이 의존성 자체를 없애야 하는데, 이는 우리가 통제할 수 없는 upstream
문제다. 주기적으로 `npm outdated`/`npm audit`로 새 버전이 나왔는지만 확인하면 된다.

## Firestore에 저장하는 값과 보관 기간

`rateLimitBuckets`(10분 버킷별 요청 수) · `ipRateLimitBuckets`(IP별 10분 버킷 요청 수,
6차 감사 후속조치) · `dailyBudgetBuckets`(KST 날짜별 하루 총 요청 수, 6차 감사
후속조치) · `photoGenCounts`(사진 SHA-256 해시별 생성 횟수) 4개 컬렉션만 쓴다 —
전부 정수 카운터 + `updatedAt` 타임스탬프뿐이고, 사진 원본·이름 등 개인정보는
어디에도 저장하지 않는다. 다만 `photoGenCounts`의 문서ID 자체가 사진의 SHA-256
해시라 완전한 익명 데이터는 아니다(원본 사진을 따로 가진 사람이 "이 사진이 언제
제출됐는지" 대조 확인 가능 — README 개인정보 안내 참고).

**정정(2026-09-01, 6차 감사 발견)**: 이 문서는 예전에 "30일 TTL 정책을 걸어 자동
삭제되게 할 것(대표 콘솔 작업 필요)"이라고 적혀 있었는데, 같은 시점 README.md는
반대로 "TTL 정책을 적용합니다"라고 이미 완료된 것처럼 단정하고 있어 두 문서가
서로 모순됐다. 실제로는 콘솔 TTL 정책도, 코드상 삭제 경로도 둘 다 없었다.
"콘솔 작업이라 코드로는 불가능하다"는 전제 자체가 틀렸다는 게 이번에 확인돼(이미
운영 중인 `keepWarm`과 같은 `onSchedule` 패턴을 그대로 재사용할 수 있음), 매일
04:00(KST)에 `updatedAt` 기준 30일 지난 문서를 지우는 `functions/index.js`의
`cleanupOldCountersSchedule` 함수로 실제 구현했다. 콘솔 TTL 정책(있으면 더 저렴하고
정확함)과는 별개로 동작하는 애플리케이션 레벨 삭제이며, 실제 Firestore를 두드리지
않는 인메모리 가짜 db로 삭제 로직 자체는 테스트로 검증돼 있다(`functions/test/index.test.js`의
`cleanupOldCounters` 테스트 참고).
