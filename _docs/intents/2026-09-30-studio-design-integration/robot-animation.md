## 대기 화면·포스터 후속 보완 (2026-10-01, Bumm님 직접 지시)

- 로봇 v4 직접 모델을 제거하고 최초 생성 이미지의 재질을 참조한 v5 스프라이트로 교체. 이젤 옆 그리기/책상에 앉아 작업/클래퍼보드/작품 들고 인사 네 구도다. 내장 image_gen으로 6열×4행 원본을 생성한 후 바닥과 중심을 맞추고 30fps 무음 루프로 인코딩했다. 직접 영상 생성 모델의 결과는 아니며 이미지 기반 모션 보간이다.
- 자산 public/studio/robot-{paint,desk,direct,present}-v5.mp4 및 webp. MP4 합계 720751바이트, 각 384×384. 원본은 robot-studio-sprite-v5.png, 재현 도구 scripts/media/build-robot-v5.mjs.
- 점은 고정 DOM에서 2.4초 파동으로 계속 흐르고 문구 교체 시 재시작하지 않는다. 음수 지연으로 첫 화면부터 흐르는 상태이며 위아래 여백 각각 24px. 영화 상식의 추가 위 여백을 제거했다.
- 메인 문구 12종·상식 12종을 UI 전용 crypto 난수로 각각 섞는다. 한 바퀴 중복 없음, 같은 앱에서 직전 대기의 첫 제목/상식을 다시 첫 항목으로 선택하지 않는다. 8초마다 네 로봇 장면과 문구를 교체한다. 일시 정지/움직임 줄이기/60초 지연 안내 유지.
- 영화 상식은 아카데미 음향 교육 자료 및 Disney Animation의 Story/Layout/Animation/Lighting 제작 설명으로 확인했다. 출처 URL은 movieFacts.ts에 보존.
- 포스터 8종의 사진 면적·제목·태그라인·크레딧 간격을 재조정했다. 노란 사진판/종이 프레임은 큰 사진과 하단 제목, 판타지는 금색 테두리와 한 줄 제목, 히어로/스포츠는 사선 대제목, 나머지는 장르별 강조를 유지한다. 중첩 문구를 렌더로 확인해 간격을 수정했다. 출력 1200×1800과 브랜드 배치 유지.
- 결과 갤러리 최대 폭과 카드 간격, 제목/인쇄 버튼 주변 여백 조정. 원래 열려 있던 캔버스는 빌드만으로 갱신되지 않으므로 최신 디자인 확인용 5524를 다시 빌드해 제공한다. 5523은 대기 전용, 5500은 실제 앱 최신 빌드.
- 타입·빌드 종료 코드 0. 변경된 회귀 검사는 수정해 두었고 §31에 따라 전체 테스트/린트/브라우저 검사는 마무리 때 실행. 실제 생성 API·카메라·인쇄 호출 0. 미커밋·미배포.

### v5 내장 image_gen 최종 프롬프트 원문

Create a NEW production sprite sheet using EXACTLY this reference character's premium cinematic material quality and identity: ivory porcelain shell with delicate seams, glossy deep black face, warm golden smiling eyes, fine mechanical joints, red antenna and red canvas sneakers. DO NOT simplify into primitive spheres. Render premium animated-feature quality with soft studio light and contact shadows on pure white. Output landscape 3:2 canvas, exactly 6 equal columns by 4 equal rows, 24 equal SQUARE cells, NO lines, NO labels, NO text. Each row is a DIFFERENT camera composition and action, six adjacent tiny incremental animation keyframes, same camera and scale within that row. All props and entire figure fit inside each cell with 12 percent white margins. Floor baseline consistent. NO overlapping cells. Row 1: full-body left three-quarter SIDE view of robot standing next to a wooden easel on its right, attentively painting a small red star on white canvas with a red brush. In six frames its right hand gently moves down in a short brush stroke; head gaze follows brush, feet and easel stay exactly fixed. Row 2: front three-quarter view, robot seated at a tiny drawing desk, thoughtfully making pencil strokes on paper, gently leaning over paper then looking slightly up; keep desk and chair fixed, small smooth progressive arm movement. Row 3: front view standing robot as film director holding a black-and-white clapperboard with NO TEXT, six frames opening clapper a little then closing it, face looks toward clapper, head slowly tilts. Row 4: opposite right three-quarter view standing robot proudly holding a small colorful abstract movie poster in left hand and greeting audience with right hand, six small consecutive wave poses with head turning gently toward camera; poster illustration only no writing. Each row must show coherent incremental motion, not six unrelated illustrations. Lock proportions and camera within each row, physical contact preserved. Four different poses/compositions, not just objects changing in the same standing pose. Cinematic fine texture and appealing high-end character design are essential. Precisely 6 columns and 4 rows of equally spaced frames.

---

## 2026-10-01 v4 최신 반영

Bumm님이 고정 시선·소품 교체에 보이는 어색함을 지적했다. 현재 자산은 아래 옛 이미지 보간 기록과 달리 직접 모델링한 3D 로봇의 연속 렌더다. 눈동자가 작업을 따라가고 고개·몸·팔이 함께 움직인다. 손과 도구는 동일 축을 쓰고 두 관절 팔은 길이를 유지한다. 같은 도구를 모든 장면에서 유지한다.

- 소스: scripts/media/render-robot-scenes.py, scripts/media/encode-robot-scenes.mjs
- 원본 프레임: .cache/robot-3d-v4/{sketch,color,admire}/0001.png~0180.png
- 앱 자산: public/studio/robot-{sketch,color,admire}-v4.mp4 및 .webp
- 각 512px·30fps·6초, MP4 3개 합계 667286바이트.
- 재현 명령은 기존과 같으며 출력 경로만 v4로 분리했다. --preview --frame=75로 동작 중간 포즈를 렌더할 수 있다.
- 점은 메인 제목 아래, 공통 빨강의 농도가 1.5초마다 좌→우로 흐르는 CSS 애니메이션. 상식 제목도 공통 색상이다.
- 빌드/타입 통과. 브라우저 화면 검사와 전체 회귀는 §31에 따라 마무리 때 실행한다.

---

# Poster Studio 대기 로봇 제작 기록

2026-10-01 Bumm님 요청. 내장 이미지 생성 도구와 imagegen 스킬을 사용했다. 실제 Poster Studio의 유료 생성 API는 호출하지 않았다.

## 현재 자산 — 연속 3D 장면 v3 (2026-10-01 후속 지시)

Bumm님이 v2의 잔상·덜컥거림과 한 가지 동작 반복을 지적해 직접 모델링한 3D 관절 애니메이션으로 교체했다. 프레임 사이를 이미지 보간하지 않는다. 몸체·발·카메라 위치를 고정하고 머리·팔·소품의 연속 좌표를 렌더한다. 기존 이미지와 비슷한 아이보리 몸체·검은 얼굴·빨간 포인트를 쓰는 새 로봇 모델이다.

| 장면 | 자산 | 규격 | 영상 바이트 |
|---|---|---|---:|
| 스케치 | `public/studio/robot-sketch-v3.mp4` 및 `.webp` | 512×512, 30fps, 180프레임, 6초 | 110744 |
| 색 고르기 | `public/studio/robot-color-v3.mp4` 및 `.webp` | 동일 | 132877 |
| 완성작 살펴보기 | `public/studio/robot-admire-v3.mp4` 및 `.webp` | 동일 | 143997 |

- 모델·조명·관절 동작 원본: `scripts/media/render-robot-scenes.py`. Blender 4.5.9 LTS의 EEVEE로 렌더한다. 공식 배포 ZIP은 로컬 `.cache/blender-runtime/`에만 있다. 앱 의존성이 아니다.
- 각 장면 렌더: `blender -b -t 6 -P scripts/media/render-robot-scenes.py -- sketch` (`color`, `admire`도 같은 방식).
- 웹 자산 인코딩: `node scripts/media/encode-robot-scenes.mjs`. ffmpeg로 H.264 MP4와 정지 WebP를 만든다. 과금 API·네트워크 호출 없음.
- 영상 3개 합계 387618바이트. 브라우저는 현재 장면 하나만 재생하고 나머지는 정지한다.
- UI는 3초마다 연한 빨강→중간 빨강→진한 빨강 점을 하나씩 표시한다. 9초마다 영상·제목·영화 상식을 한 세트로 전환하며 총 5세트를 순환한다. 영상 동작은 3종이다.
- 점은 영화 상식의 굵은 제목과 설명 사이에 중앙 배치한다. 모든 문구가 같은 그리드 칸에서 높이를 확보하므로 교체 시 로봇 위치가 바뀌지 않는다. 긴 문장은 줄바꿈하며 잘라내지 않는다.
- 기존 일시 정지·움직임 줄이기·60초 지연 안내를 유지한다. 실제 AI 작업 단계나 진행률을 나타내는 연출이 아니다.
- 빌드·타입 검사 종료 코드 0. 자산은 렌더 결과를 확인하고 ffprobe로 규격을 확인했다. §31에 따라 브라우저 검사·전체 테스트는 마무리 시 실행한다.

## 이전 자산 — 이미지 보간 v2 (v3로 대체)

- 원본: 이 문서 옆 `robot-artist-sprite-v2.png` — 4×4 연속 포즈 16개, 1254×1254 PNG.
- 웹 화면: `public/studio/robot-artist-v2.mp4` — 384×384, 30fps, 3.83초, 무음, 187,865바이트.
- 정지 이미지: `public/studio/robot-artist-v2.webp` — 자동 재생 전과 움직임 줄이기 설정에서 사용.
- 재현: `node scripts/media/build-robot-loop.mjs`. 로컬 ffmpeg가 필요하며 네트워크를 사용하지 않는다.

## 생성 프롬프트 기록(한국어)

첫 생성: 영화 스튜디오 오프닝 같은 고품질 3D 로봇의 애니메이션 연속 프레임. 도자기 같은 아이보리 몸체, 검은 유광 얼굴, 따뜻하게 빛나는 눈, 빨간 안테나와 운동화, 커다란 빨간 연필. 부드러운 스튜디오 조명, 재질의 반사광과 바닥 접촉 그림자. 카메라·비율·크기를 유지한 채 웅크리고 뛰었다 착지하고 그림을 그리는 동작을 흰 배경에 배열한다. 글씨·상표·격자·번호 없음. 첫 시트의 격자 수가 일정하지 않아 웹 자산으로 쓰지 않았다.

최종 편집: 첫 이미지의 로봇 정체성과 재질을 그대로 유지한다. 정확히 4열×4행의 정사각형 셀 16개로 만든다. 각 셀에 로봇 전신 하나만, 모든 몸체와 연필이 셀 안에 들어오고 바닥 기준선·크기·카메라가 일치해야 한다. 1행은 서 있기 → 조금 웅크리기 → 깊이 웅크리기 → 도약 시작. 2행은 상승 → 정상 근처 → 최고점 → 하강 시작. 3행은 하강 → 발 착지 → 무릎 굽히기 → 일어서기. 4행은 관객 보기 → 만족스럽게 고개 기울이기 → 고개 펴기 → 첫 자세와 같은 서 있기. 셀마다 흰 여백 15%, 궤적·입자·글씨·격자 없이 작은 연속 동작으로 표현한다.

## 매체와 범위

완성물은 생성 이미지의 포즈를 연결하고 중간 프레임을 보간한 애니메이션이다. 직접 영상 생성 모델로 제작한 영상이나 실제 3D 리깅 결과는 아니다. GIF처럼 반복 재생하되 파일 크기와 기기 부하를 줄이기 위해 MP4를 사용한다. 화면은 로봇, 순환하는 제목 한 줄, 자동으로 바뀌는 영화 상식 한 토막으로 구성한다. 실제 서버 진행률이나 작업 단계를 연출하지 않는다.

## 상식 출처

영화예술과학아카데미의 토이 스토리·음향·애니메이션 교육 자료, 월트 디즈니 애니메이션 스튜디오의 스토리·조명 제작 자료를 근거로 한다. 각 원문 URL은 `src/studio/movieFacts.ts`에 남긴다. 생성 대기 화면에 외부 링크나 추가 선택을 요구하지 않는다.
