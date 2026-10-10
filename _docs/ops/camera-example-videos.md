# 촬영 화면 «자리 잡는 영상» 2편 — 시나리오·스토리보드·대본·키프레임·프롬프트 (2026-10-11)

개인·단체 촬영 화면에서 카메라를 켜기 전에 보이는 예시 자리(지금은 정지 그림 `public/studio/camera-student.webp`·`camera-group.webp`)에
**«이렇게 앉고, 이렇게 모여서, 이렇게 찍는다»를 보여 주는 짧은 영상**을 넣는다(2026-10-10 밤 Bumm님, 팀장 전달).
이 문서는 영상을 만들기 전에 Bumm님께 보여 드릴 글 전부다. **영상 생성은 Bumm님 허락 전 0.** 키프레임 그림은 ChatGPT로 «시안»을 그린다 —
원래 Bumm님이 직접 그리시기로 한 자리라, 시안을 그대로 쓰실지 직접 그리실지는 Bumm님이 고르신다.

## 공통

| 항목 | 정한 것 | 근거 |
|---|---|---|
| 등장인물 | 개인 = **가상의 한국인 20대 성인 여성**(26세 안팎) — 갸름한 얼굴(V라인·날씬한 볼·또렷한 턱선), 얼굴에 맞는 자연스러운 성인 체형, 어깨 길이 검은 머리·앞머리, 네이비 카디건 + 흰 티 + 짙은 회색 바지, 목걸이(아래). 단체 = 아래 «단체» 참고 | 10/11 Bumm님: 컷마다 얼굴형이 통통했다 말랐다 하고 «성인 얼굴에 초등학생 몸»처럼 보였다 → 20대 성인으로 분명히, 얼굴형 하나로 고정(10/1 «청소년» 결정을 개인 영상에서는 이것으로 바꾼다) |
| 목걸이 | 가는 옐로골드 체인 + 작은 네잎(쿼터포일) 펜던트 하나 — 안은 검은 오닉스, 둘레는 옐로골드 테두리에 작은 금 알갱이 테두리, 쇄골 바로 아래 짧은 길이. **모든 인물 컷에 같은 목걸이** | 10/11 Bumm님 지정. 프롬프트에는 **브랜드 이름을 쓰지 않고 생김새만** 적는다, 로고·글자 없음 |
| 고정 기준 그림 | 모든 인물 컷에 네 장을 같은 순서로 첨부한다(`.cache/seedance-20261010/gpt/cam-v2/`): ① `ps-cam2-person-v3.png` 인물(얼굴·체형·옷) ② 자리 그림(서 있는 컷 = `ps-cam2-P0.png`, 앉은 컷 = `ps-cam2-P2.png`, 당겨 앉은 뒤 = `ps-cam2-P4.png`) ③ `ps-cam2-chair.png` 의자 ④ `ps-cam2-necklace.png` 목걸이 | 그림 한 장만 붙이면 컷마다 의자·얼굴형이 바뀌었다(10/11 Bumm님 지적). 의자는 짙은 차콜 천 등받이·좌판, 가는 검은 철제 다리 넷, 팔걸이·바퀴 없음, 카메라를 향함 |
| 배경 | 지금 그림의 밝은 미술실(왼쪽 큰 창, 오른쪽 선반·화분·이젤). 단체는 사진·슬레이트가 붙은 게시판이 보이는 같은 교실 | 두 화면이 한 장소처럼 보이게 |
| 시점 | 노트북 웹캠 자리 — 책상 높이, 정면, 카메라 고정 | 아이들이 실제로 보게 될 화면과 같은 눈높이 |
| 소리 | **자연스러운 생활 소리를 깐다** — 그 자리에 실제로 있으면 들릴 법한 소리: 걸어오는 발소리, 의자 끄는·앉는 소리, 옷 스치는 소리, 작은 숨·웃음, 방 안의 은은한 공간음. 특정 효과음 목록이 아니라 «아무 소리 없어서 어색하지 않을 만큼». **단체는 여기에 가벼운 대사**(아래 대본) | 10/11 Bumm님(팀장 전달). 영상 생성 때 함께 만든다(Seedance `generate_audio: true`). **대기 영상(로딩 화면) 11편은 계속 무음**이다 — 이 줄은 촬영 화면 영상 2편에만 해당한다 |
| 대사 | 단체의 말은 소리로 들리고, 같은 말을 앱이 말풍선 자막으로도 얹는다(영상에 글자를 굽지 않는다) | 생성 영상 속 글자는 깨지고 매번 달라진다. 앱 글꼴(Studio)과 같아야 한다. 부스가 시끄러워 소리만으로는 안 들린다 |
| 숫자 3·2·1 | 앱 오버레이(큰 흰 숫자, 화면 가운데 위쪽) | 선명·글꼴 통일·문구와 타이밍을 코드로 고칠 수 있다 |
| 필터·찰칵 플래시·정지 | 후반(ffmpeg)으로 영상에 넣는다: 은은한 따뜻한 색 필터 → 하얀 플래시 0.15초 → 0.6초에 걸쳐 돌아오며 포즈 그대로 멈춘 장면 | 영상과 한 몸으로 타이밍이 고정되고 0원. 생성 모델에 맡기면 매번 길이·밝기가 다르다 |
| 화면 사양 | 정지 그림과 같은 칸에 들어간다 — `camera-example-art-spec.md`: 칸을 꽉 채워 잘라 보임(cover), **중요한 것은 가운데 1760×1500(2560×1600 기준) 안**, **아래 15%에는 두지 않음**(안내 글·«카메라 켜기» 단추 자리), 그림 속 글자 없음 | 칸 비율 1.56~1.68(PC)·1.10(휴대폰) |
| 영상 화면비·크기 | **16:9, 1080p(1920×1080)로 만들어** 칸에 cover로 얹는다. 칸이 16:9보다 조금 좁아 좌우가 약간 잘린다 → 인물은 가운데 62% 안에 | 생성 모델에 16:10이 없다. 4:3은 PC에서 위아래가 21% 잘려 얼굴이 위험하다 |
| 자막 위치 | 말한 사람 머리 옆 위쪽(위 20% 띠 안). 아래 15%는 쓰지 않는다 | 화면 안내 글·단추와 겹치지 않게 |

## 개인 — 약 10초

**시나리오**: 빈 자리에 20대 여성이 와서 앉는다. 머리를 만지고 의자를 살짝 당겨 고쳐 앉고, 손을 뻗어 카메라 각도를 맞춘 뒤 화면을 보고 씩 웃는다.
은은한 필터가 깔리며 큰 숫자 3·2·1, 1에 맞춰 포즈를 딱 잡는다. 찰칵 — 화면이 하얘졌다가 은은하게 돌아오며 포즈 그대로 멈춘 장면으로 끝난다. 대사 없음.

| 초 | 장면·동작 | 표정 | 화면 효과(앱·후반) |
|---|---|---|---|
| 0.0~0.8 | 빈 의자와 미술실(아무도 없음) | — | — |
| 0.8~2.0 | 여성이 화면 오른쪽에서 걸어 들어와 의자에 앉는다 | 편안함 | — |
| 2.0~3.2 | 두 손으로 앞머리·옆머리를 정돈한다 | 살짝 집중 | — |
| 3.2~4.2 | 의자를 살짝 당겨 앞으로 고쳐 앉는다 | — | — |
| 4.2~5.6 | 손을 카메라 쪽으로 뻗어 각도를 맞춘다(손이 화면 가까이 크게) | 집중 | — |
| 5.6~6.4 | 손을 거두고 화면을 본다 | — | — |
| 6.4~7.0 | 화면을 보며 씩 웃는다 | 씩 웃음 | 은은한 필터가 깔리기 시작(후반) |
| 7.0~8.5 | 웃으며 기다린다 | 웃음 | 큰 숫자 **3**(7.0) · **2**(7.5) · **1**(8.0) — 앱 |
| 8.0 | «1»에 맞춰 포즈(브이)를 딱 잡는다 | 활짝 | — |
| 8.5 | 찰칵 | — | 하얀 플래시 0.15초(후반) |
| 8.65~9.25 | 화면이 은은하게 돌아온다 | — | 흰색 → 멈춘 장면 0.6초(후반) |
| 9.25~10.0 | 포즈 그대로 멈춘 장면 | — | 정지(후반) |

**자막 대본**: 없음.
**생성 구간**: 0.0~8.5초(포즈를 잡고 0.5초 유지)만 만든다. 8.5초부터는 마지막 프레임으로 후반 처리.

### 키프레임(ChatGPT 시안 v2, 11장 — 10/11 다시 그림)

`.cache/seedance-20261010/gpt/cam-v2/`(옛 시안 `cam/`은 덮지 않고 그대로 둔다). 먼저 기준 그림 네 장을 그렸다:

| 기준 그림 | 지시문 요지 |
|---|---|
| `ps-cam2-necklace.png` | 흰 바탕 보석 제품 사진 — 가는 옐로골드 체인, 작은 네잎 펜던트 하나(안은 광택 있는 검은 오닉스, 둘레는 옐로골드 테두리 + 작은 금 알갱이). 글자·로고·브랜드 표시 없음 |
| `ps-cam2-chair.png` | 옛 P0의 의자만 흰 바탕 제품 사진으로 — 둥근 사각 등받이·좌판(짙은 차콜 천), 가는 곧은 검은 철제 다리 넷, 팔걸이·바퀴 없음, 정면에서 살짝 비스듬히 |
| `ps-cam2-P0.png` | 옛 P0(방)에 위 의자를 **카메라를 향하게** 놓은 빈 자리(옛 P0은 의자 등이 카메라 쪽이었다) |
| `ps-cam2-person-v3.png` | 새 인물(이전 얼굴을 쓰지 않음): 26세 안팎 한국인 여성, V라인 갸름한 얼굴·날씬한 볼·또렷한 턱선·좁은 턱, 성숙한 얼굴, 옅은 화장, 어깨 길이 검은 생머리·시스루 앞머리, 네이비 니트 카디건 + 흰 라운드 티, 날씬한 성인 체형, 위 목걸이, 위 의자에 앉아 정면 |

> 처음 그린 기준 인물(`camera-student.webp`를 고친 것)과 그 수정판은 얼굴이 여전히 둥글고 앳되어 버렸다 — 그 기준으로 그린 P1~P4도 함께
> `cam-v2/old-face-v1/`로 뺐다.

컷마다 기준 그림 네 장(위 «고정 기준 그림» 순서)을 붙이고, 지시문 뒤에 같은 고정 문장을 붙인다:

```text
Keep exactly the same woman as in the FIRST image: a Korean woman about 26 years old with the same slim V-line face, slender cheeks,
defined jawline and narrow chin exactly as in the first image (not round, not chubby, not childlike), natural adult proportions
(adult neck, shoulders, torso, arms and legs - not childlike), shoulder-length black hair with bangs, navy cardigan over a white T-shirt,
and exactly the necklace from the FOURTH image (thin yellow-gold chain, one small black onyx quatrefoil pendant with a beaded gold rim,
short, just below the collarbone). Exactly the same art studio and the same chair in the same place as in the SECOND image; the chair is
the one in the THIRD image (dark charcoal-gray fabric rounded backrest and seat, four thin black metal legs, no armrests, no wheels,
facing the camera). Photographed from a laptop webcam at desk height, straight on, fixed camera, same framing as the second image.
Natural, realistic photo with soft daylight. Wide landscape 3:2 frame; keep her face and upper body inside the central area and leave
the bottom 15% of the frame free of anything important. No text, no logos, no watermark.
```

| 번호 | 초 | 둘째 그림 | 지시문(앞부분) |
|---|---|---|---|
| P0 | 0.0 | — | (기준 그림 `ps-cam2-P0.png` 그대로) |
| P1 | 0.9 | P0 | She walks in from the right side of the frame toward the empty chair, a couple of steps behind it, half of her body still at the right frame edge; she wears dark charcoal trousers; we see her from head to thighs, the empty chair in front of the camera. |
| P2 | 1.8 | P0 | She sits down on the chair, settling in, looking slightly down; she wears dark charcoal trousers; the same chair under her, its dark gray backrest edges visible at her sides and its seat at the bottom of the frame. |
| P3 | 2.6 | P2 | Seated on the same chair in the same position as in the second image, she now looks up toward the camera, smoothing her bangs with one hand and tucking her hair behind her ear with the other. |
| P4 | 3.7 | P2 | Seated on the same chair, she leans forward and pulls the chair a little closer to the camera, both hands gripping the sides of the seat; she looks at the camera; she is now slightly closer and slightly larger in the frame than in the second image. |
| P5 | 4.6 | P4 | Seated on the same chair in the same position as in the second image, she reaches one hand toward the camera to adjust its angle - her hand is large and close to the lens at the left frame edge, slightly out of focus, her face still clearly visible. |
| P6 | 5.4 | P4 | ... she fine-tunes the camera angle with just her fingertips - her hand small at the top-left frame edge touching the lens rim, slightly out of focus - while her eyes check the screen, concentrating. |
| P7 | 6.0 | P4 | ... she has taken her hand back and sits upright, both hands resting on her thighs, looking straight at the screen with a calm, neutral expression. |
| P8 | 6.6 | P4 | Seated upright ..., hands resting on her thighs, she looks at the screen and breaks into a bright, natural grin. |
| P9 | 7.5 | P4 | Seated upright ..., she waits for the countdown, smiling warmly at the camera, shoulders relaxed, hands resting together on her lap. |
| P10 | 8.0~8.5 | P4 | Seated upright ..., she strikes a pose: a cheerful V sign beside her cheek, big smile - the final frozen frame. |

## 단체 — 약 14초

**시나리오**: 한 명이 먼저 자리에 와서 친구들을 부르고, 늦게 오는 친구를 끌어와, 카메라를 가리키며 «찍는다?» 한 명이 카메라로 와서 뭔가 누르고(«삑»)
서둘러 제자리로. 다 같이 어깨동무 — 필터가 깔리며 큰 숫자 3·2·1, 넷이 «하나, 둘, 셋!» 외치고 포즈. 찰칵 — 하얘졌다가 은은하게 돌아오며 멈춘 장면.

등장인물(왼쪽부터) — **가상의 한국인 20대 성인 넷**(25~27세 안팎, 갸름한 성인 얼굴·자연스러운 성인 체형, 두 남자가 두 여자보다 크다. 10/11 개인과 같은 규칙으로 다시 그림 — 옛 단체 그림의 얼굴은 쓰지 않았다):
**A** 남(헝클어진 짧은 검은 머리, 네이비 카디건·흰 티·청바지) · **B** 여(앞머리 있는 긴 검은 머리, 크림 니트 카디건·흰 티·연청바지) · **C** 여(앞머리 없는 긴 검은 머리, 하늘색 셔츠·회색 카디건·청바지) · **D** 남(단정한 짧은 검은 머리, 초록빛 회색 카디건·흰 티·청바지). 목걸이는 개인 영상 인물의 것이라 넣지 않았다

| 초 | 장면·동작 | 표정 | 자막(말풍선, 앱) | 화면 효과 |
|---|---|---|---|---|
| 0.0~0.8 | 빈 자리(같은 교실) | — | — | — |
| 0.8~1.8 | A가 걸어와 카메라 앞에 선다 | 신남 | — | — |
| 1.8~2.6 | A가 뒤돌아 친구들을 부른다 | 손나팔 | A: «야, 빨리 와~» | — |
| 2.6~3.6 | B·C가 화면 왼쪽에서 걸어 들어온다. D는 뒤쪽에서 휴대폰을 보며 꾸물 | — | — | — |
| 3.6~4.4 | A가 D를 보며 | 살짝 시큰둥(ㅡㅡ) | A: «아, 뭐 해~» | — |
| 4.4~5.8 | B가 손짓하다 D의 팔을 잡아 끌어온다 | 장난스럽게 | B: «일로 와, 일로 와!» | — |
| 5.8~7.0 | 넷이 대충 모이고 C가 카메라를 가리킨다 | 들뜸 | C: «저기, 저기 봐! 찍는다?» | — |
| 7.0~7.8 | A가 카메라 쪽으로 걸어온다(얼굴·몸이 크게) | 집중 | — | — |
| 7.8~8.4 | A가 노트북 키를 누른다(손가락·얼굴 아주 가까이) | — | «삑» | — |
| 8.4~9.4 | A가 서둘러 돌아서 제자리로 뛰어간다 | 다급·웃음 | — | — |
| 9.4~10.6 | 넷이 모여 어깨동무 | 웃음 | — | 은은한 필터가 깔리기 시작(후반) |
| 10.6~12.1 | 카메라를 보며 기다림 → 외침 | 활짝 | 다 같이: «하나, 둘, 셋!» | 큰 숫자 **3**(10.6) · **2**(11.1) · **1**(11.6) — 앱 |
| 11.6~12.1 | «셋»에 맞춰 포즈(브이·볼하트·엄지) | 활짝 | — | — |
| 12.1 | 찰칵 | — | — | 하얀 플래시 0.15초(후반) |
| 12.25~12.85 | 화면이 은은하게 돌아온다 | — | — | 흰색 → 멈춘 장면 0.6초(후반) |
| 12.85~14.0 | 포즈 그대로 멈춘 장면 | — | — | 정지(후반) |

**대본** — 소리로 말하고(영상 생성 때 함께, 한국어), 같은 말을 앱 말풍선으로도 얹는다(말한 사람 머리 옆 위쪽): A «야, 빨리 와~»(1.8~2.6) · A «아, 뭐 해~»(3.6~4.4) · B «일로 와, 일로 와!»(4.4~5.8) ·
C «저기, 저기 봐! 찍는다?»(5.8~7.0) · «삑»(7.8~8.4, 노트북 쪽 작은 효과 글자) · 다 같이 «하나, 둘, 셋!»(11.0~12.1, 숫자와 겹치지 않게 아래쪽 말풍선이 아니라 인물 머리 위).
**생성 구간**: 0.0~12.1초만 만든다. 12.1초부터는 마지막 프레임으로 후반 처리.

### 키프레임(ChatGPT 시안 v2, 16장 — 10/11 다시 그림)

`.cache/seedance-20261010/gpt/cam-v2/`(옛 시안 `cam/`은 그대로 둔다). 개인과 같은 규칙 — 기준 그림을 먼저 정하고 모든 컷에 같은 순서로 붙인다:
① `ps-cam2-group-v2.png` 네 사람(얼굴·키·옷) ② `ps-cam2-G0.png` 빈 교실(방·책상·카메라 자리).

| 기준 그림 | 지시문 요지 |
|---|---|
| `ps-cam2-G0.png` | 네 사람을 지운 같은 교실 — 사진 게시판·슬레이트·필름 릴, 카메라·책·화분이 놓인 나무 선반, 왼쪽 큰 창, 뒤쪽 책상·의자. 같은 구도 |
| `ps-cam2-group-v2.png` | 새 네 사람(이전 얼굴을 쓰지 않음): 25~27세 한국인 성인, 갸름한 성인 얼굴, 자연스러운 성인 체형·키(남자 둘이 더 큼), 위 등장인물 옷차림, 교실 앞쪽에 나란히 서서 머리부터 무릎까지 |

> 처음에는 옛 단체 그림을 고쳐 그렸는데(`cam-v2/old-group-v1/`) 체형은 성인이 됐지만 두 여성의 얼굴이 여전히 앳되어 새로 그렸다.
> G5는 B가 D 반대쪽을 보고 손짓한 판이 나와 방향을 적어 한 번 다시 그렸다(`G5-v2`, 첫 판은 `old-group-v1/`).

고정 문장(모든 컷 뒤에):

```text
Keep exactly the same four people as in the FIRST image - the same faces, face shapes, hairstyles, heights and clothes:
A (man, short tousled black hair, navy cardigan, white T-shirt, jeans), B (woman, long black hair with bangs, cream knit cardigan,
white T-shirt, light jeans), C (woman, long black hair without bangs, light blue shirt under a grey cardigan, jeans),
D (man, short neat black hair, sage-green-grey cardigan, white T-shirt, jeans) - all grown-up adults about 25-27 with slim adult faces
and natural adult proportions (not childlike, not teenagers). Exactly the same classroom as in the SECOND image (photo board with
snapshots, clapperboard, wooden shelves with cameras and plants, window on the left, desks behind). Photographed from a laptop webcam
at desk height, straight on, fixed camera, same framing and same camera position as in the second image. Natural, realistic photo
with soft daylight. Wide landscape 3:2 frame; keep faces inside the central area and leave the bottom 15% of the frame free of
anything important. No text, no logos, no watermark.
```

| 번호 | 초 | 지시문(앞부분) |
|---|---|---|
| G0 | 0.0 | (기준 그림 `ps-cam2-G0.png` 그대로) |
| G1 | 1.0 | Only A is in the room: he has just walked in and stands alone in the foreground in front of the camera, slightly left of center, smiling, from the top of his head to his knees; nobody else is visible. |
| G2 | 2.0 | Only A is in the room, standing in the same place: he turns his head back over his shoulder toward the right side of the room and cups one hand by his mouth, calling his friends; nobody else is visible. |
| G3 | 3.0 | B and C walk in from the left side of the frame toward A, mid-stride; D is far in the background between the desks, looking down at his phone, dawdling; A, standing in the foreground, watches them. |
| G4 | 3.9 | A, B and C stand together in the foreground; A looks back over his shoulder at D, who is still far in the background between the desks looking at his phone, with a slightly unimpressed, flat expression (half-lidded eyes, lips pressed); B and C stand beside A. |
| G5 | 4.6 | A, B and C in the foreground; D is still in the background at the RIGHT side of the room between the desks, looking at his phone. B turns her head and body to HER LEFT (toward the right side of the picture, toward D) and waves him over with a big beckoning gesture, her arm stretched toward D; A and C also glance toward D, amused. |
| G6 | 5.3 | B has walked over to the right side, grabbed D by the arm and pulls him from the background toward the group in the foreground; D laughs and stumbles along, his phone in his other hand; A and C, standing in the foreground, laugh. |
| G7 | 6.3 | The four now stand loosely together in the foreground, left to right A, B, C, D; C points at the camera excitedly with a big smile, the others look at the camera, curious and amused. |
| G8 | 7.3 | A walks toward the camera - his face and upper body large and close in the frame, slightly left of center, eyes on the laptop below the lens; B, C and D stand behind him in the foreground, smiling. |
| G9 | 8.0 | A leans in very close to the lens to press a key on the laptop - his face and one outstretched finger very close to the camera, large and partly out of focus at the left of the frame, looking down at the keyboard; B, C and D are visible behind him in the foreground, watching and smiling. |
| G10 | 8.8 | A has turned away from the camera and hurries back toward the group, mid-stride, seen from the side and back, at the left of the frame; B, C and D stand in the foreground, laughing and making room for him in the middle. |
| G11 | 9.8 | The four gather in a row in the foreground facing the camera, left to right A, B, C, D, and start putting their arms around each other's shoulders, laughing. |
| G12 | 10.5 | Left to right A, B, C, D stand close together in the foreground with their arms around each other's shoulders, all four looking straight at the camera, smiling. |
| G13 | 11.2 | Left to right A, B, C, D, arms around each other's shoulders, all four leaning in toward the camera with bright smiles, waiting for the countdown. |
| G14 | 11.7 | Left to right A, B, C, D, arms around each other's shoulders, all four shouting together with mouths open in a cheerful shout, eyes on the camera. |
| G15 | 12.1 | Final pose, left to right in the foreground: A gives a thumbs up, B makes a V sign, C makes a finger heart by her cheek, D makes a V sign, standing close together, all four smiling at the camera - the final frozen frame. Same framing as the first image. |

## 영상 만들기 전 확인(생성 0 — 허락 뒤)

| 항목 | 개인 | 단체 |
|---|---|---|
| 모델 | Seedance 2.0 (seedance_2_0) · std | 같음 |
| 해상도·화면비 | 1080p · 16:9 | 같음 |
| 길이 | 9초(0.0~8.5초를 쓰고 끝 0.5초는 여유) | 13초(0.0~12.1초를 쓰고 끝은 여유) |
| 소리 | **켠다**(`generate_audio: true`) — 자연스러운 생활 소리: 걸어오는 발소리, 의자 앉는·끄는 소리, 카디건 스치는 소리, 작은 숨·웃음, 방 공간음. 음악·말 없음 | 켠다 — 같은 생활 소리 + **가벼운 대사**(대본의 말, 한국어). 음악·내레이션 없음 |
| 시작·끝 그림 | start_image = P0(빈 자리), end_image = P10(포즈) | start_image = G0, end_image = G15 |
| 중간 키프레임 | 참고 그림으로 넣지 않고 초별 연출 글로 준다(10/10 08 시험: 참고 그림을 넣으면 시작·끝이 고정되지 않았다) | 같음 |
| 예상 크레딧 | 1080p std는 8초 72(초당 9) → **약 81** | **약 117** |
| 소리 켠 단가 | 10/10 단가는 소리를 끈 조건이다. 소리를 켜면 달라질 수 있어 **생성 직전에 비용을 다시 확인**하고 이 칸을 고친다 | 같음 |
| 길이 한도 | Seedance 2.0은 4~15초 — 한 번에 된다 | 한 번에 된다(13초) |
| 나눠 만들기(대안) | 중간이 안 따라오면 0~4.2초(P0→P4) · 4.2~8.5초(P4→P10) 두 구간, 둘째는 첫 구간의 실제 마지막 프레임에서 시작 | 0~5.8(G0→G7) · 5.8~9.4(G7→G10) · 9.4~12.1(G10→G15, 4초 최소라 4초로 만들고 자름) |
| 뒤처리(0원) | 1920×1080 → 칸 cover · 마지막 프레임 정지 · 필터·플래시·되돌아옴(ffmpeg) · 숫자·말풍선은 앱 | 같음 |

> 크레딧 숫자는 10/10 단가(720p std 8초 36 · 1080p std 8초 72)에서 초당으로 나눈 예상이다. 생성 전에 `get_cost`로 실제 값을 확인해 이 칸을 고친다.

### Seedance 프롬프트 전문 — 개인

```text
9-second single continuous shot, landscape 16:9, fixed laptop-webcam camera at desk height, realistic natural daylight in a bright art studio.
The first frame is exactly the start image (the empty chair facing the camera) and the last frame is exactly the end image (the woman's V-sign pose).
The same Korean woman in her mid-twenties throughout - the same slim V-line face, natural adult proportions, shoulder-length black hair with bangs,
navy cardigan over a white T-shirt, dark charcoal trousers, and a short thin yellow-gold necklace with one small black onyx quatrefoil pendant.
The same dark charcoal fabric chair with thin black metal legs throughout.
Timeline - 0-0.8s: the empty chair. 0.8-2s: she walks in from the right and sits down. 2-3.2s: she smooths her bangs and tucks her hair behind her ear.
3.2-4.2s: she pulls the chair a little closer and sits forward. 4.2-5.6s: she reaches toward the camera and adjusts its angle, her hand large near the lens.
5.6-6.4s: she takes her hand back and looks at the screen. 6.4-7s: she breaks into a bright grin. 7-8s: she waits, smiling.
8-9s: she strikes a cheerful V sign beside her cheek and holds it still - this is the end image.
Natural human motion, no morphing, no extra people, no text, no numbers, no logos, no camera movement.
Sound: only the natural ambient sound of the room - her footsteps as she walks in, the soft creak and scrape of the chair as she sits and pulls it closer,
the rustle of her cardigan, a small breath and a soft laugh as she smiles, quiet room tone. No music, no speech, no narration.
```

### Seedance 프롬프트 전문 — 단체

```text
13-second single continuous shot, landscape 16:9, fixed laptop-webcam camera at desk height, realistic natural daylight in a bright classroom.
The first frame is exactly the start image (the empty classroom) and the last frame is exactly the end image (the four friends' group pose).
The same four Korean adults in their mid-twenties throughout, same faces and clothes: A man in a navy cardigan, B woman in a cream knit cardigan,
C woman in a light blue shirt and grey cardigan, D man in a sage-grey cardigan; all four in jeans.
Timeline - 0-0.8s: empty space. 0.8-1.8s: A walks in and stands in front of the camera. 1.8-2.6s: A turns and calls his friends, hand cupped by his mouth.
2.6-3.6s: B and C walk in from the left; D dawdles in the back looking at his phone. 3.6-4.4s: A looks at D with a flat, unimpressed face.
4.4-5.8s: B beckons and pulls D over by the arm. 5.8-7s: the four gather loosely and C points at the camera excitedly.
7-7.8s: A walks up to the camera, large in the frame. 7.8-8.4s: A presses a key on the laptop, very close to the lens.
8.4-9.4s: A hurries back to the group. 9.4-10.6s: they put their arms around each other's shoulders.
10.6-11.6s: they wait, smiling, then shout together. 11.6-13s: final pose - A thumbs up, B V sign, C finger heart, D V sign - held still; this is the end image.
Natural human motion, no morphing, no extra people, no text, no numbers, no logos, no camera movement.
Sound: the natural ambient sound of the room - footsteps, clothes rustling, a chair scraping against the floor, laughter, quiet room tone -
and short, casual spoken lines in Korean by the matching person: 1.8-2.6s A: "야, 빨리 와~". 3.6-4.4s A: "아, 뭐 해~".
4.4-5.8s B: "일로 와, 일로 와!". 5.8-7s C: "저기, 저기 봐! 찍는다?". 7.8-8.4s: a short soft beep from the laptop.
11-12.1s all four together: "하나, 둘, 셋!". No music, no narration.
```

> [확인] 한국어 대사가 입 모양·목소리까지 자연스럽게 나오는지는 만들어 봐야 안다. 어색하면 대사만 빼고(생활 소리만) 다시 만들거나,
> 대사를 뒤에서 따로 입히는 방법을 Bumm님께 여쭌다 — 생성 전에 정하지 않는다.

## 다음 차례

1. ~~키프레임 시안 27장을 ChatGPT로 그린다~~ — 10/11 v2로 다시 그림(개인 11장 + 기준 그림 4장, 단체 16장 + 기준 그림 2장, `cam-v2/`).
   개인은 의자·얼굴형·목걸이를 11장 나란히 놓고 확인했다(`cam-v2/cam2-P-sheet.png`·`cam2-P-faces.png`), 단체는 `cam2-G-sheet.png`.
2. 그림을 검토 페이지 «촬영 화면 영상» 칸에 올리고, 이 문서의 «영상 만들기 전 확인»과 함께 Bumm님께 보여 드린다.
3. 허락을 받은 편만 Seedance로 만든다(소리를 켜므로 생성 직전에 비용을 다시 확인).
