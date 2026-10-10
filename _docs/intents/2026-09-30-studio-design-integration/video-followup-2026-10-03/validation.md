# 영상 후속 · 이번 실행 검증

검증일: 2026-10-03 KST. Windows, Node 24.18.0, 헤드리스 Chrome. 시작/종료 HEAD는 `fa097922714d57daae4e720ced8d22b9db2d81d3`. 아래는 미커밋 로컬 변경의 결과이며 이전 운영 배포 감사 결과를 재사용한 성공 주장이 아니다.

| 이번 실행 | 결과 |
|---|---|
| `npm run typecheck` / `npm run lint` / `npm run build` | 모두 종료 0 |
| `npm test` | 10파일 · 148개 통과 (기존 132 + 이번 영상 관련 16) |
| `npm --prefix functions test` / `npm --prefix functions run lint` | 서버 72개 통과 / 린트 종료 0 |
| `npm run fonts:check` | 필요한 504자 포함 |
| `npm run verify:selftest` | 결함 주입 자기검사 18개 통과 |
| `node scripts/media/check-waiting-videos.mjs` | 원화·프롬프트 12개 보존 · 승인 영상 0 · 미제작 12 |
| 같은 명령 `--require-complete` | 의도대로 종료 1: 0/12이므로 완료 불가 |
| `node scripts/verify/waiting-video.mjs` | 12세트 × 390/730/1366px = 36화면 · 검토 목록 3화면 · 겹침/넘침/JS 오류 0 |
| 실제 H.264 디코더 시험 | 3초 QA 색상 패턴만 사용. 무음 인라인·재생/정지/재개·마지막 프레임 유지·404/자동재생 거부 복구·움직임 줄이기 다운로드 0·해제 후 소스 정리 통과 |
| 실제 빌드 생성 대기 흐름 | 3화면, 대기→세트 전환→일시정지→완료 알림·오류 0, 실제 API 요청 0 |
| 출력 회귀 | 가짜 입력 5개 × 8개 출력, 1200×1800·인쇄 호출/정리·사진 해제·전송 허용목록 통과. 기존 프리즈 지문 40쌍과 불일치 0 |
| 보존 확인 | `public/`, `src/templates.ts`, `waitingSets.ts`, 이전 로고 변경 `compact.css`, 승인 보관본, 검증 기준선은 HEAD와 차이 0 |
| `git diff --check` | 종료 0 |

이번 기능의 테스트는 재생 시작 전 원화 유지, 일시정지 위치, 오류·정체·자동재생 거부, 동적 움직임 줄이기 전환, StrictMode 재실행, 비동기 취소, 탭 숨김, 완료 자산 게이트를 확인한다. 자산 검사에는 일부러 변조한 해시·오디오 트랙·틀린 크기/길이·외부 URL·검수자 누락을 넣어 실패를 확인했다.

## 새 증거 위치

- 최종 디코더/뷰포트: `.cache/video-followup-checks/2026-10-03T09-32-31-464Z/results.json`, `review-390.png`, `review-730.png`, `review-1366.png`.
- 첫 디코더/뷰포트 실행도 `2026-10-03T09-27-05-320Z/`에 보존했다.
- 실제 앱 흐름: `.cache/video-followup-20261003/production-flow/result.json` 및 화면 캡처.
- 출력 회귀: `.cache/video-followup-20261003/print-regression/pixels.json`. 비교 대상은 기존 `scripts/verify/snapshots/release-20261003-windows.json`이며 갱신하지 않았다.
- 과거 `.cache/release-local/`, `.cache/release-live/`, `.cache/wait-v2-verification/` 및 복원 ZIP을 덮어쓰지 않았다.

## 아직 검증할 수 없는 것

- 승인 원화 12편의 실제 동작 품질과 해당 영상 파일의 브라우저 재생: 영상 자체가 없어 **미검증**. QA 패턴의 디코더 성공을 원화 영상 완성으로 취급하지 않는다.
- 실제 유료 생성, 실제 얼굴 촬영·프린터 인쇄·실기 모바일/iOS 재생은 실행하지 않았다. 모바일 너비 검증은 Windows Chrome의 뷰포트 검사다.
- 프리즈 이후 운영 배포를 새로 수행하거나 운영 상태를 재감사하지 않았다. 커밋·푸시·병합·태그 변경도 없다.

최종 영상 검수 12편과 `--require-complete` 통과 전에는 이 마일스톤을 완료하지 않는다.
