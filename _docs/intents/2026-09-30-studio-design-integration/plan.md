# 실행 순서와 증거

1. 기존 배포 빌드를 `.cache/integration-baseline/dist`에 보존하고 새 디자인과 기존 기능의 경계를 intent에 기록했다.
2. 확정된 자산·스타일을 운영 소스에 옮기고 React 화면과 이름 태그를 연결했다. 기존 조판 파일은 수정하지 않았다.
3. 실제 버튼 핸들러를 새 단계에 연결하고 카메라 이탈·다음 참가자 초기화·생성 실패 경로를 검사했다.
4. 새 회귀 테스트가 숨은 출연진 입력이 재렌더 때 지워지는 결함을 잡았고, 상태와 값을 동기화해 수정했다.
5. 하위 폴더의 JSX·CSS까지 폰트 수집 범위를 넓혔다. 누락 글자를 실제로 검출한 뒤 서브셋을 재생성했다.
6. `node scripts/verify/studio-flow.mjs .cache/integration-baseline/dist`로 실제 빌드·Hosting CSP에서 20장 픽셀, 화면 네 크기, 인쇄 호출과 정리를 검증한다. 결과는 `.cache/studio-verification/`에 남는다.
7. 변경·감사·공통 인계 문서를 갱신하고 작업 가지로 올려 PR 검사를 확인한다. master 직접 푸시·수동 Firebase 배포는 하지 않는다.

정적 디자인 서버 5522는 과거 검토용이다. 배포 대상은 `npm run build`로 만들어지는 실제 React 앱 `dist/`다.
