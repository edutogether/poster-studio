# Intent 문서

이 폴더는 이 저장소에서 진행한(또는 진행 중인) 의미 있는 작업 하나하나가 **왜** 필요했는지,
뭘 원했는지, 어떤 제약 안에서 했는지를 기록한다.

**등급 기준·상태 관리 규칙은 헌법에 있다** — `_shared/CONVENTIONS.md` §1.5(등급 0/1/2 판단 기준),
§1.6(draft → accepted → in-progress → done | dropped, 상태 변경은 Bumm만). 여기 다시 적지 않는다.
워크플로 원본은 `_shared/intent-kit/intent-workflow.md`(최상위 CLAUDE.md가 자동 로드).

이 앱에서 등급 판단이 특히 갈리는 지점: **`functions/` 설정값(타임아웃·레이트리밋·예산 상한) 변경은
그 자체로 등급 1 이상**이다. 숫자 하나만 바꾸는 것처럼 보여도 행사 당일 부스 전체의 가용성과 실제 지출에
직결되고, 값들이 서로 물려 있다(AGENTS.md "함정" 참고).

## 인덱스

| 날짜 | 슬러그 | 등급 | 상태 | 요약 |
|---|---|---|---|---|
| | | | | |

## 폴더 규칙

- 새 intent: `_docs/intents/YYYY-MM-DD-슬러그/intent.md` (`TEMPLATE.md` 복사해서 시작)
- 등급 2는 `intent.md` → `spec.md` → `plan.md` 순으로 이어 쓴다.
- `done`/`dropped` 상태가 된 intent도 지우지 않는다 — 나중에 "왜 그때 이렇게 안 했는지"를 다시 확인할 수 있는
  유일한 기록이다. 상태는 frontmatter로만 관리하고 폴더를 옮기지 않는다.
