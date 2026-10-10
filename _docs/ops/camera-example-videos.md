# 촬영 화면 «자리 잡는 영상» 2편 — 시나리오·스토리보드·대본·키프레임·프롬프트 (2026-10-11)

개인·단체 촬영 화면에서 카메라를 켜기 전에 보이는 예시 자리(지금은 정지 그림 `public/studio/camera-student.webp`·`camera-group.webp`)에
**«이렇게 앉고, 이렇게 모여서, 이렇게 찍는다»를 보여 주는 짧은 영상**을 넣는다(2026-10-10 밤 Bumm님, 팀장 전달).
이 문서는 영상을 만들기 전에 Bumm님께 보여 드릴 글 전부다. **영상 생성은 Bumm님 허락 전 0.** 키프레임 그림은 ChatGPT로 «시안»을 그린다 —
원래 Bumm님이 직접 그리시기로 한 자리라, 시안을 그대로 쓰실지 직접 그리실지는 Bumm님이 고르신다.

## 공통

| 항목 | 정한 것 | 근거 |
|---|---|---|
| 등장인물 | 가상의 한국인 청소년(10/1 결정). 개인 = 지금 개인 안내 그림의 학생, 단체 = 지금 단체 그림의 네 명 | 같은 얼굴·머리·옷을 유지하려고 키프레임마다 지금 그림을 첨부한다 |
| 배경 | 지금 그림의 밝은 미술실(왼쪽 큰 창, 오른쪽 선반·화분·이젤). 단체는 사진·슬레이트가 붙은 게시판이 보이는 같은 교실 | 두 화면이 한 장소처럼 보이게 |
| 시점 | 노트북 웹캠 자리 — 책상 높이, 정면, 카메라 고정 | 아이들이 실제로 보게 될 화면과 같은 눈높이 |
| 소리 | 없음(영상은 소리 없이 재생) | 부스는 시끄럽고 노트북 소리는 끈다 |
| 대사 | 앱이 말풍선 자막으로 얹는다(영상에 글자를 굽지 않는다) | 생성 영상 속 글자는 깨지고 매번 달라진다. 앱 글꼴(Studio)과 같아야 한다 |
| 숫자 3·2·1 | 앱 오버레이(큰 흰 숫자, 화면 가운데 위쪽) | 선명·글꼴 통일·문구와 타이밍을 코드로 고칠 수 있다 |
| 필터·찰칵 플래시·정지 | 후반(ffmpeg)으로 영상에 넣는다: 은은한 따뜻한 색 필터 → 하얀 플래시 0.15초 → 0.6초에 걸쳐 돌아오며 포즈 그대로 멈춘 장면 | 영상과 한 몸으로 타이밍이 고정되고 0원. 생성 모델에 맡기면 매번 길이·밝기가 다르다 |
| 화면 사양 | 정지 그림과 같은 칸에 들어간다 — `camera-example-art-spec.md`: 칸을 꽉 채워 잘라 보임(cover), **중요한 것은 가운데 1760×1500(2560×1600 기준) 안**, **아래 15%에는 두지 않음**(안내 글·«카메라 켜기» 단추 자리), 그림 속 글자 없음 | 칸 비율 1.56~1.68(PC)·1.10(휴대폰) |
| 영상 화면비·크기 | **16:9, 1080p(1920×1080)로 만들어** 칸에 cover로 얹는다. 칸이 16:9보다 조금 좁아 좌우가 약간 잘린다 → 인물은 가운데 62% 안에 | 생성 모델에 16:10이 없다. 4:3은 PC에서 위아래가 21% 잘려 얼굴이 위험하다 |
| 자막 위치 | 말한 사람 머리 옆 위쪽(위 20% 띠 안). 아래 15%는 쓰지 않는다 | 화면 안내 글·단추와 겹치지 않게 |

## 개인 — 약 10초

**시나리오**: 빈 자리에 학생이 와서 앉는다. 머리를 만지고 의자를 살짝 당겨 고쳐 앉고, 손을 뻗어 카메라 각도를 맞춘 뒤 화면을 보고 씩 웃는다.
은은한 필터가 깔리며 큰 숫자 3·2·1, 1에 맞춰 포즈를 딱 잡는다. 찰칵 — 화면이 하얘졌다가 은은하게 돌아오며 포즈 그대로 멈춘 장면으로 끝난다. 대사 없음.

| 초 | 장면·동작 | 표정 | 화면 효과(앱·후반) |
|---|---|---|---|
| 0.0~0.8 | 빈 의자와 미술실(아무도 없음) | — | — |
| 0.8~2.0 | 학생이 화면 오른쪽에서 걸어 들어와 의자에 앉는다 | 편안함 | — |
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

### 키프레임(ChatGPT 시안, 11장)

매번 `public/studio/camera-student.webp`를 첨부한다. 모든 지시문 뒤에 같은 고정 문장을 붙인다:

```text
Keep the same teenage girl as in the attached photo - the same face, shoulder-length black hair with bangs, navy cardigan over a white T-shirt -
and the same bright art studio background (large window on the left, shelves with plants and plaster busts on the right, easel and drawing table),
photographed from a laptop webcam at desk height, straight on, fixed camera. Natural, wholesome, realistic photo with soft daylight.
Wide landscape 3:2 frame; keep her face and upper body inside the central area and leave the bottom 15% of the frame free of anything important.
No text, no logos, no watermark.
```

| 번호 | 초 | 지시문(앞부분) |
|---|---|---|
| P0 | 0.0 | Edit the attached photo: the same room and the same chair with NOBODY in it - the empty seat in front of the camera. |
| P1 | 0.9 | The girl walks in from the right side of the frame toward the chair, half of her body still at the frame edge. |
| P2 | 1.8 | The girl sits down on the chair, settling in, looking slightly down. |
| P3 | 2.6 | Seated, she smooths her bangs with one hand and tucks hair behind her ear with the other. |
| P4 | 3.7 | She pulls the chair a little closer with both hands under the seat, leaning forward. |
| P5 | 4.6 | She reaches one hand toward the camera to adjust its angle - her hand is large and close to the lens at the frame edge, her face still visible. |
| P6 | 5.4 | She fine-tunes the camera with her fingertips, eyes checking the screen. |
| P7 | 6.0 | She takes her hand back and sits upright, looking at the screen. |
| P8 | 6.6 | She looks at the screen and breaks into a bright, natural grin. |
| P9 | 7.5 | She waits for the countdown, smiling, shoulders relaxed. |
| P10 | 8.0~8.5 | She strikes a pose exactly on "1": a cheerful V sign beside her cheek, big smile - the final frozen frame. Same framing as the attached photo. |

## 단체 — 약 14초

**시나리오**: 한 명이 먼저 자리에 와서 친구들을 부르고, 늦게 오는 친구를 끌어와, 카메라를 가리키며 «찍는다?» 한 명이 카메라로 와서 뭔가 누르고(«삑»)
서둘러 제자리로. 다 같이 어깨동무 — 필터가 깔리며 큰 숫자 3·2·1, 아이들이 «하나, 둘, 셋!» 외치고 포즈. 찰칵 — 하얘졌다가 은은하게 돌아오며 멈춘 장면.

등장인물(지금 단체 그림 왼쪽부터): **A** 남(네이비 가디건·흰 티) · **B** 여(크림 니트 가디건, 브이) · **C** 여(하늘색 셔츠·회색 가디건) · **D** 남(초록빛 회색 가디건·흰 티)

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

**자막 대본**(앱 말풍선, 말한 사람 머리 옆 위쪽): A «야, 빨리 와~»(1.8~2.6) · A «아, 뭐 해~»(3.6~4.4) · B «일로 와, 일로 와!»(4.4~5.8) ·
C «저기, 저기 봐! 찍는다?»(5.8~7.0) · «삑»(7.8~8.4, 노트북 쪽 작은 효과 글자) · 다 같이 «하나, 둘, 셋!»(11.0~12.1, 숫자와 겹치지 않게 아래쪽 말풍선이 아니라 인물 머리 위).
**생성 구간**: 0.0~12.1초만 만든다. 12.1초부터는 마지막 프레임으로 후반 처리.

### 키프레임(ChatGPT 시안, 16장)

매번 `public/studio/camera-group.webp`를 첨부한다. 고정 문장:

```text
Keep the same four teenagers as in the attached photo - the same faces, hair and clothes: A (boy, navy cardigan, white T-shirt), B (girl, cream knit cardigan),
C (girl, light blue shirt, grey cardigan), D (boy, sage-grey cardigan, white T-shirt) - and the same bright classroom with the photo board, shelves and plants,
photographed from a laptop webcam at desk height, straight on, fixed camera. Natural, wholesome, realistic photo with soft daylight.
Wide landscape 3:2 frame; keep faces inside the central area and leave the bottom 15% of the frame free of anything important. No text, no logos, no watermark.
```

| 번호 | 초 | 지시문(앞부분) |
|---|---|---|
| G0 | 0.0 | Edit the attached photo: the same classroom with NOBODY in front of the camera - an empty space. |
| G1 | 1.0 | Only A walks in and stands in front of the camera, smiling. |
| G2 | 2.0 | A turns his head back over his shoulder and cups one hand by his mouth, calling his friends. |
| G3 | 3.0 | B and C walk in from the left side of the frame; D is in the background looking down at his phone, dawdling; A watches. |
| G4 | 3.9 | A looks at D with a slightly unimpressed, flat expression (half-lidded eyes); B and C stand beside A. |
| G5 | 4.6 | B waves D over with a big beckoning gesture. |
| G6 | 5.3 | B grabs D's arm and pulls him toward the group, D laughing. |
| G7 | 6.3 | The four stand loosely together; C points at the camera excitedly. |
| G8 | 7.3 | A walks toward the camera - his face and body large and close in the frame, the others behind him. |
| G9 | 8.0 | A presses a key on the laptop - his finger and face very close to the lens, partly out of focus, the others visible behind. |
| G10 | 8.8 | A turns and hurries back toward the group, mid-stride, the others laughing and making room. |
| G11 | 9.8 | The four gather and start putting their arms around each other's shoulders. |
| G12 | 10.5 | Arms around each other's shoulders, all four looking at the camera, smiling. |
| G13 | 11.2 | All four wait for the countdown with bright smiles, leaning in. |
| G14 | 11.7 | All four shout together "one, two, three!" - mouths open in a cheerful shout, eyes on the camera. |
| G15 | 12.1 | Final pose: A thumbs up, B V sign, C cheek heart, D V sign, all smiling - the final frozen frame. Same framing as the attached photo. |

## 영상 만들기 전 확인(생성 0 — 허락 뒤)

| 항목 | 개인 | 단체 |
|---|---|---|
| 모델 | Seedance 2.0 (seedance_2_0) · std | 같음 |
| 해상도·화면비 | 1080p · 16:9 | 같음 |
| 길이 | 9초(0.0~8.5초를 쓰고 끝 0.5초는 여유) | 13초(0.0~12.1초를 쓰고 끝은 여유) |
| 소리 | 없음(generate_audio false) | 같음 |
| 시작·끝 그림 | start_image = P0(빈 자리), end_image = P10(포즈) | start_image = G0, end_image = G15 |
| 중간 키프레임 | 참고 그림으로 넣지 않고 초별 연출 글로 준다(10/10 08 시험: 참고 그림을 넣으면 시작·끝이 고정되지 않았다) | 같음 |
| 예상 크레딧 | 1080p std는 8초 72(초당 9) → **약 81** | **약 117** |
| 길이 한도 | Seedance 2.0은 4~15초 — 한 번에 된다 | 한 번에 된다(13초) |
| 나눠 만들기(대안) | 중간이 안 따라오면 0~4.2초(P0→P4) · 4.2~8.5초(P4→P10) 두 구간, 둘째는 첫 구간의 실제 마지막 프레임에서 시작 | 0~5.8(G0→G7) · 5.8~9.4(G7→G10) · 9.4~12.1(G10→G15, 4초 최소라 4초로 만들고 자름) |
| 뒤처리(0원) | 1920×1080 → 칸 cover · 마지막 프레임 정지 · 필터·플래시·되돌아옴(ffmpeg) · 숫자·말풍선은 앱 | 같음 |

> 크레딧 숫자는 10/10 단가(720p std 8초 36 · 1080p std 8초 72)에서 초당으로 나눈 예상이다. 생성 전에 `get_cost`로 실제 값을 확인해 이 칸을 고친다.

### Seedance 프롬프트 전문 — 개인

```text
9-second single continuous shot, landscape 16:9, fixed laptop-webcam camera at desk height, realistic natural daylight in a bright art studio.
The first frame is exactly the start image (the empty chair) and the last frame is exactly the end image (the girl's V-sign pose).
The same teenage girl throughout - same face, shoulder-length black hair with bangs, navy cardigan over a white T-shirt.
Timeline - 0-0.8s: the empty chair. 0.8-2s: she walks in from the right and sits down. 2-3.2s: she smooths her bangs and tucks her hair behind her ear.
3.2-4.2s: she pulls the chair a little closer and sits forward. 4.2-5.6s: she reaches toward the camera and adjusts its angle, her hand large near the lens.
5.6-6.4s: she takes her hand back and looks at the screen. 6.4-7s: she breaks into a bright grin. 7-8s: she waits, smiling.
8-9s: she strikes a cheerful V sign beside her cheek and holds it still - this is the end image.
Natural human motion, no morphing, no extra people, no text, no numbers, no logos, no camera movement, no audio.
```

### Seedance 프롬프트 전문 — 단체

```text
13-second single continuous shot, landscape 16:9, fixed laptop-webcam camera at desk height, realistic natural daylight in a bright classroom.
The first frame is exactly the start image (the empty space) and the last frame is exactly the end image (the four friends' group pose).
The same four teenagers throughout, same faces and clothes: A boy in a navy cardigan, B girl in a cream knit cardigan, C girl in a light blue shirt and grey cardigan,
D boy in a sage-grey cardigan.
Timeline - 0-0.8s: empty space. 0.8-1.8s: A walks in and stands in front of the camera. 1.8-2.6s: A turns and calls his friends, hand cupped by his mouth.
2.6-3.6s: B and C walk in from the left; D dawdles in the back looking at his phone. 3.6-4.4s: A looks at D with a flat, unimpressed face.
4.4-5.8s: B beckons and pulls D over by the arm. 5.8-7s: the four gather loosely and C points at the camera excitedly.
7-7.8s: A walks up to the camera, large in the frame. 7.8-8.4s: A presses a key on the laptop, very close to the lens.
8.4-9.4s: A hurries back to the group. 9.4-10.6s: they put their arms around each other's shoulders.
10.6-11.6s: they wait, smiling, then shout together. 11.6-13s: final pose - A thumbs up, B V sign, C cheek heart, D V sign - held still; this is the end image.
Natural human motion, no morphing, no extra people, no text, no numbers, no logos, no camera movement, no audio.
```

## 다음 차례

1. Chrome을 다시 쓸 수 있을 때 키프레임 시안 27장(P0~P10, G0~G15)을 ChatGPT로 그린다 — 대기 영상 키프레임을 다 그린 뒤.
2. 그림을 검토 페이지 «촬영 화면 영상» 칸에 올리고, 이 문서의 «영상 만들기 전 확인»과 함께 Bumm님께 보여 드린다.
3. 허락을 받은 편만 Seedance로 만든다.
