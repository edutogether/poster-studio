# 보안 참고사항 (감사마다 반복 질문되지 않도록 기록)

## `npm audit`가 보고하는 moderate 9건은 실위험 없음 — `npm audit fix --force` 절대 금지

`npm audit`를 돌리면 `uuid`(v3/v5/v6, buffer bounds check 누락)의 취약점이 아래 경로로
전이 의존성에 걸려 있다고 9건 뜬다:

```
uuid → gaxios/teeny-request/retry-request → google-gax
     → @google-cloud/firestore, @google-cloud/storage
     → firebase-admin
     → firebase-functions (우리가 실제로 의존하는 패키지)
```

**이 앱은 `firebase-admin`을 전혀 import하지 않고, Firestore/Storage를 아예 쓰지
않는다**(사진은 처리 직후 삭제, DB 미사용 — 개인정보 최소화 설계). 취약점이 실제로
발동하는 경로(`uuid`에 `buf` 인자를 넘기는 호출)에 우리 코드가 도달하지 않으므로
**실질적 위험은 없다.**

`npm audit fix --force`가 제안하는 해결책은 `firebase-functions`를 **4.9.0으로
다운그레이드**하는 것인데, 이는 현재 쓰는 v7 계열보다 훨씬 오래된 major 버전이라
오히려 기능 퇴행·호환성 문제를 일으킨다. **절대 실행하지 말 것.**

해소되려면 `firebase-functions`(또는 그 상위 의존성)가 새 버전에서 이 전이
의존성 자체를 없애야 하는데, 이는 우리가 통제할 수 없는 upstream 문제다. 주기적으로
`npm outdated`/`npm audit`로 새 버전이 나왔는지만 확인하면 된다.
