<!-- 원본 최종 수정: 2026-09-08 · 원본 위치: D:\Projects\_shared\intent-kit\README-template.md
     원본 버전: eb0eda204b4e
     사본의 "원본 버전"이 위와 다르면 원본이 갱신된 것이다. 다만 이 파일은 통째로 덮어쓰지 않는다 —
     아래 인덱스 표는 저장소마다 내용이 다르므로 반드시 보존하고, 등급표·설명 등 나머지만 원본에 맞춘다.
     (intent-workflow.md·TEMPLATE.md는 순수 사본이라 통째로 재복사하면 된다.)
     이 스탬프 블록은 사본에도 남긴다 — 지우면 그 저장소만 드리프트를 감지할 수 없게 된다. -->

# Intent 문서

이 폴더는 이 저장소에서 진행한(또는 진행 중인) 의미 있는 작업 하나하나가
"왜" 필요했는지, 뭘 원했는지, 어떤 제약 안에서 했는지를 기록한다. 규칙 원본은
[`.claude/rules/intent-workflow.md`](../../.claude/rules/intent-workflow.md) 참고.

## 등급 기준

| 등급 | 해당하는 것 |
|---|---|
| 0 | 오탈자, 명백한 버그 수정, 이미 확정된 결정의 재확인·재적용 — intent 문서 없이 진행 |
| 1 | 여러 파일/화면에 걸치거나 되돌리기가 약간 번거로운 작업 — 간단한 intent.md |
| 2 | 사용자 데이터·과금·보안·배포·실사용자 경험에 영향, 되돌리기 어려운 작업 — 전체 intent.md, 미결 질문은 멈추고 확인 |

**이 앱에서 등급 판단이 특히 갈리는 지점**: `functions/` 설정값(타임아웃·레이트리밋·예산 상한) 변경은
그 자체로 등급 1 이상이다. 숫자 하나만 바꾸는 것처럼 보여도 행사 당일 부스 전체의 가용성과 실제 지출에
직결되고, 값들이 서로 물려 있다(`AGENTS.md` "함정" 참고).

## 인덱스

| 날짜 | 슬러그 | 등급 | 상태 | 요약 |
|---|---|---|---|---|
| 2026-09-11 | [loadtest-3ip](2026-09-11-loadtest-3ip/intent.md) | 2 | draft | 공인 IP 3곳에서 동시에 쏘는 부하테스트 — 한 대로는 "여러 대를 버틴다"를 잴 수 없다 |
| 2026-09-09 | [react-ts-conversion](2026-09-09-react-ts-conversion/intent.md) | 2 | in-progress | 프론트엔드를 React+TypeScript로 전환하되 UI/UX는 체감까지 동일 유지 |

## 폴더 규칙

- 새 intent: `_docs/intents/YYYY-MM-DD-슬러그/intent.md` (`TEMPLATE.md` 복사해서 시작)
- 등급 2는 `intent.md` → `spec.md` → `plan.md` 순으로 이어 쓴다(헌법 §1.5).
- 초기 개발 단계(기능이 아직 잡히는 중)라 건별 intent보다 전체 방향 문서가 더
  맞으면, 건별 대신 `_docs/intents/00-charter.md` 하나로 시작해도 된다.
- 상태는 `draft` → `accepted` → `in-progress` → `done` | `dropped` 이고, 파일 맨 위
  frontmatter 의 `status` 로만 관리한다(폴더를 옮겨서 표시하지 않는다).
  상태를 바꾸는 것은 Bumm님이고, 바뀔 때마다 별도 커밋으로 남긴다.
  단, **팀장이 지시한 작업은 그 지시 자체가 승인**이므로(헌법 §1), 세션이 `accepted`로
  쓰고 바로 `in-progress`로 진행한다 — 기다리지 않는다. 위 규칙은 **세션이 스스로
  제안한 건**에 적용된다. 자세한 것은 `intent-workflow.md`의 "상태" 절을 본다.
- `done`/`dropped` 상태가 된 intent도 지우지 않는다 — 나중에 "왜 그때 이렇게
  안 했는지"를 다시 확인할 수 있는 유일한 기록이다.
