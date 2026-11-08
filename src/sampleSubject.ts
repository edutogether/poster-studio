/* 샘플 단체 그림(src/studio/sample-group.webp)의 얼굴(머리) 범위 — 그림 비율 0~1(2026-11-08 밤, 팀장 «얼굴이 안전 영역에 막 들어오는 만큼만»).
   설치판과 같은 얼굴 찾기(desktopCrop detectFaces · pickFaces · subjectOf)로 잰 값이다(얼굴 4개). 얼굴을 지키는 틀(templates.ts fitBox)이
   샘플에서도 설치판 사진과 같은 규칙으로 줄이게 Meta.subject로 넘긴다. 그림을 바꾸면 face-clear-probe.mjs가 다시 재어 0.01 넘게 다르면 실패한다. */
export const SAMPLE_GROUP_SUBJECT = { x0: 0.142, y0: 0.020, x1: 0.827, y1: 0.751 };
