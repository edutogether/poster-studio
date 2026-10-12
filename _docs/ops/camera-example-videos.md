# 촬영 화면 «자리 잡는 영상» 2편 — 시나리오·스토리보드·대본·키프레임·프롬프트 (2026-10-11)

개인·단체 촬영 화면에서 카메라를 켜기 전에 보이는 예시 자리(지금은 정지 그림 `public/studio/camera-student.webp`·`camera-group.webp`)에
**«이렇게 앉고, 이렇게 모여서, 이렇게 찍는다»를 보여 주는 짧은 영상**을 넣는다(2026-10-10 밤 Bumm님, 팀장 전달).
이 문서는 영상을 만들기 전에 Bumm님께 보여 드릴 글 전부다. **영상 생성은 Bumm님 허락 전 0.** 키프레임 그림은 ChatGPT로 «시안»을 그린다 —
원래 Bumm님이 직접 그리시기로 한 자리라, 시안을 그대로 쓰실지 직접 그리실지는 Bumm님이 고르신다.

## 공통

| 항목 | 정한 것 | 근거 |
|---|---|---|
| 등장인물 | 개인 = **가상의 한국인 20대 여성**(26세 안팎) — 갸름한 얼굴, 자연스러운 성인 체형, 쇄골까지 오는 검은 머리·시스루 앞머리. **옷(10/11 Bumm님 최종)**: 앞을 연 박시한 연청 데님 셔츠(소매 걷음) + 몸에 붙는 흰 라운드 티 + 하이웨이스트 흑청 플레어 청바지 + 흰 운동화 + 목걸이(아래). 단체 = 아래 «단체»(20대 초반 넷) | 10/11 Bumm님: 컷마다 얼굴형·의자·하의가 바뀌고 «성인 얼굴에 초등학생 몸»처럼 보였다 → 20대 성인으로 분명히, 사람·옷·의자를 기준 그림으로 고정 |
| 목걸이 | 가는 옐로골드 체인 + 작은 네잎(쿼터포일) 펜던트 하나 — 안은 검은 오닉스, 둘레는 옐로골드 테두리에 작은 금 알갱이 테두리, 쇄골 바로 아래 짧은 길이. **모든 인물 컷에 같은 목걸이** | 10/11 Bumm님 지정. 프롬프트에는 **브랜드 이름을 쓰지 않고 생김새만** 적는다, 로고·글자 없음 |
| 고정 기준 그림 | `.cache/seedance-20261010/gpt/cam-v3/` — 인물마다 3면 전신 시트(정면·3/4·옆, 옷·하의 실루엣까지): 개인 `ps-cam3-person-sheet.png`, 단체 `ps-cam3-sheet-A~D.png` · 의자 `cam-v2/ps-cam2-chair.png` · 목걸이 `cam-v2/ps-cam2-necklace.png` · 빈 자리 `final/ps-cam3-P0.png`·`final/ps-cam3-G0.png`. **키프레임은 바로 앞 장을 고쳐 다음 장을 만들고 매번 시트를 붙인다**(10/11 팀장 지시) | 컷마다 새로 그리면 사람·의자·옷·카메라가 매번 다시 정해졌다(v1·v2) |
| 배경 고정(뒤처리) | 사람·의자 밖은 빈 자리 그림 하나로 바꿔 끼운다 — `scripts/media/clean-plate-composite.py`(BiRefNet 로컬 모델, 0원) | 앞 장을 고칠 때마다 ChatGPT가 배경을 조금씩 다시 그려 잔무늬가 쌓였다(단체 G15 창가 화분이 G0 대비 평균 화소 차 24, 눈으로도 뭉개짐). 카메라가 고정이면 배경은 같아야 맞다 |
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
| 4.2~5.6 | 한 손을 위로 뻗어 노트북 화면(카메라) 각도를 맞춘다 — 손은 화면 위 가장자리에 작고 선명하게, 얼굴을 가리지 않음 | 집중 | — |
| 5.6~6.4 | 손을 거두고 화면을 본다 | — | — |
| 6.4~7.0 | 화면을 보며 씩 웃는다 | 씩 웃음 | 은은한 필터가 깔리기 시작(후반) |
| 7.0~8.5 | 웃으며 기다린다 | 웃음 | 큰 숫자 **3**(7.0) · **2**(7.5) · **1**(8.0) — 앱 |
| 8.0 | «1»에 맞춰 포즈(브이)를 딱 잡는다 | 활짝 | — |
| 8.5 | 찰칵 | — | 하얀 플래시 0.15초(후반) |
| 8.65~9.25 | 화면이 은은하게 돌아온다 | — | 흰색 → 멈춘 장면 0.6초(후반) |
| 9.25~10.0 | 포즈 그대로 멈춘 장면 | — | 정지(후반) |

**자막 대본**: 없음.
**생성 구간**: 0.0~8.5초(포즈를 잡고 0.5초 유지)만 만든다. 8.5초부터는 마지막 프레임으로 후반 처리.

### 키프레임(ChatGPT 시안 v3, 11장 — 10/11 다시 그림, 대조표 `cam-v3/check-table.md`)

`.cache/seedance-20261010/gpt/cam-v3/final/`. v1(`cam/`)·v2(`cam-v2/`)는 덮지 않고 둔다. 순서: 3면 시트 → P0(빈 자리) → **앞 장을 고쳐 다음 장** → 배경을 P0으로 고정.
모든 장에 붙인 그림: ① 앞 장 ② 인물 시트 ③ 의자 ④ 목걸이 (P6부터 ⑤ 기준 얼굴 `cam-v2/ps-cam2-person-v3.png` — 얼굴이 조금 둥글어지는 기미가 있어 더함).

고정 문장(모든 컷 뒤에, `PREV`는 앞 장):

```text
Keep everything else exactly as in the FIRST image: the same camera position, angle and zoom (fixed camera - do not zoom, crop or reframe),
the same art studio background and light, and the same chair in the same place (the chair from the THIRD image: dark charcoal fabric
rounded backrest and seat, four thin black metal legs, no armrests, no wheels, facing the camera). The woman is exactly the person in the
SECOND image (character sheet): the same face, the same shoulder-length black hair with see-through bangs ending at the collarbone, the same
adult body proportions, the same outfit - an oversized boxy light-blue denim shirt worn open with rolled sleeves over a fitted white crew-neck
T-shirt, high-waisted washed-black flared jeans, white low-top sneakers - and the necklace from the FOURTH image (thin yellow-gold chain, one
small black onyx quatrefoil pendant with a beaded gold rim) lying on the white T-shirt just below the collarbone. Realistic photo, soft daylight.
Wide landscape 3:2 frame. No large blurred hands or arms in front of the lens. No text, no logos, no watermark.
(+ The background must stay identical to the FIRST image in every detail ... only the woman changes.)
(+ P6부터: Her face must match the FIFTH image exactly ...)
```

| 번호 | 초 | 연출 |
|---|---|---|
| P0 | 0.0 | 빈 자리 — 의자 하나, 카메라를 향함(빈 자리 그림) |
| P1 | 0.9 | 오른쪽에서 의자 쪽으로 걸어 들어옴(머리부터 무릎까지) |
| P2 | 1.8 | 의자에 앉음, 살짝 아래를 봄 |
| P3 | 2.6 | 카메라를 보며 앞머리·옆머리 정돈 |
| P4 | 3.7 | 앞으로 숙여 의자를 당겨 앉음(사람·의자만 조금 커짐) |
| P5 | 4.6 | 한 손을 위로 뻗어 화면 각도를 맞춤(손은 위 가장자리에 작고 선명) |
| P6 | 5.4 | 살짝 기대어 화면을 확인, 턱에 손가락 |
| P7 | 6.0 | 바로 앉아 카메라를 봄 |
| P8 | 6.6 | 씩 웃음 |
| P9 | 7.5 | 입 다문 미소로 기다림, 손은 무릎 |
| P10 | 8.0~8.5 | 볼 옆 브이(끝 그림) |

> 다시 그린 장: P2(첫 판은 오른쪽 선반이 달라짐) · P0·P1(처음 빈 자리는 P2부터의 배경과 선반이 달라, P2에서 사람을 지워 빈 자리를 새로 만들고 P1을 다시 그림).

### 개인 v4 고칠 계획(10/11 Bumm님 판정 «나쁘지 않다» — 그림 0, Chrome을 넘겨받은 뒤 그린다)

**그대로 둔다**: 얼굴 · 청남방 · 흰 티 · 흑청 바지 · 의자 · 미술실 배경(v3).
**고친다**: ① 시작을 «의자에 앉는 순간»으로 ② 목걸이를 실제 사진대로(지금은 검은 십자·클로버처럼 보임) ③ 체형 — 얼굴·골반에 맞는 자연스러운 20대 평균(흰 티에 자연스러운 곡선만, 허벅지는 조금 날씬하게, 노출·강조 없음) ④ P3 왼쪽 아래, 의자 등받이 왼쪽에 흐릿하게 비치는 얼룩을 지운다.

- **방식**: v3의 각 장을 기준으로 **한 번씩만** 고친다. 앞 장을 고친 그림을 다시 고치지 않는다(v3에서 화질이 무너진 까닭). 붙이는 그림은 ① v3의 그 장 ② 목걸이 사진, 두 장뿐이다. 다 그린 뒤 배경은 v3처럼 빈 자리 그림(P0)과 합성해 고정한다(`scripts/media/clean-plate-composite.py` — 그림을 다시 그리는 것이 아니라 붙이는 것이다).
- **P0(빈 의자)**: 영상 장면에서는 뺀다. 첫 장부터 사람이 의자 앞에 있으므로 영상의 시작 그림이 될 일이 없다. 다만 배경 합성의 기준 그림으로는 그대로 쓴다.
- **목걸이 사진(후보, 아직 안 받음)**: 공식 판매 페이지(vancleefarpels.com, VCARA45800 «Vintage Alhambra pendant, 18K yellow gold, Onyx»)의 확대 사진 `rWXl_1YZTmipGvOt7-UprA.png`(3000×3000 PNG, 891,647바이트 — 클로버·금 알갱이 테두리·가는 체인이 한 장에 보임). 정면 전체 사진 `jIPnZwLARp6Fno7RGxW6iQ.png`(3000×3000, 593,412바이트)는 펜던트가 작아 고르지 않았다. 지시문에는 브랜드 이름을 쓰지 않는다.

고치는 문장(모든 장 공통, FIRST = v3의 그 장, SECOND = 목걸이 사진):

```text
Edit the FIRST image and keep it as the base: the same photo, camera position, framing and zoom, background, light, chair, pose,
face, hair and outfit. Change only these two things.
1) Necklace: the pendant becomes exactly the necklace in the SECOND image - a small black onyx four-leaf clover motif with a fine
beaded gold rim on a thin yellow-gold chain - at the same small real-life size, lying on the white T-shirt just below the collarbone.
Copy its shape and its gold bead border exactly; no cross, no other pendant shape.
2) Figure: a natural, average woman in her mid-twenties whose upper body matches her face and hips - under the fitted white T-shirt
a gentle, natural bust curve (modest, not emphasized), and slightly slimmer thighs in the black jeans, in proportion with her slim face.
Neat and modest, nothing revealing.
Do not change anything else. Photorealistic, the same resolution and sharpness as the FIRST image. No text, no logos, no watermark.
```

| 새 번호 | 초(제안) | 바탕(v3) | 이 장에만 더하는 말 |
|---|---|---|---|
| S1 | 0.0 | P2 | `She is just sitting down: standing in front of the chair with her knees bending and her body lowering toward the seat, one hand resting on the front edge of the chair seat to steady herself, looking down at the seat. The chair stays exactly where it is.` |
| P2 | 0.7 | P2 | — |
| P3 | 1.5 | P3 | `Also remove the faint blurry translucent smudge just left of the chair back (over the easel legs at the lower left) and fill it with the background that is really there.` |
| P4~P10 | 2.6~6.9 | 같은 번호 | — (P5는 위로 뻗은 손이 위 가장자리에 작고 선명하게 남는지 본다) |

- [확인] 걸어 들어오는 1.1초가 빠져 영상이 약 7.4초로 짧아진다. 앱의 큰 숫자 3·2·1(지금 7.0·7.5·8.0초)을 같이 당길지, 기다리는 장면을 늘려 길이를 지킬지는 영상 지시문을 쓸 때 팀장께 여쭌다.

**그린 결과(10/11, `.cache/seedance-20261010/gpt/cam-v4/final/` 10장 — S1·P2~P10, ChatGPT 대화 주소는 `gpt/chat-url.txt`)**

- 목걸이 사진은 공식 판매 페이지에서 받았다: `cam-v4/ref/vca-vcara45800-onyx-detail-rWXl_1YZTmipGvOt7-UprA.png`(출처·크기는 같은 폴더 `source.txt`). 10장 모두 둥근 네 잎·금 테두리·가는 체인으로 나왔다(`cam4-P-necklace.png`).
- 체형 문장은 첫 장(P3) 뒤에 «허벅지를 첫 그림보다 분명히 약 15% 날씬하게»로 세게 고쳐 나머지에 썼다. ChatGPT는 허벅지를 조금만 줄였다(P3을 두 번 그려 둘 다 비슷 — 세 번째는 하지 않았다). 다른 장과 같은 문장으로 그린 두 번째 판을 P3으로 쓰고, 목걸이가 더 또렷한 첫 판은 `alt/`에 남겼다.
- **P3 얼룩의 원인은 v3 배경 합성이었다.** 빈 자리 그림(P0)의 의자가 장마다 그린 의자보다 조금 오른쪽에 있어, 합성 경계에서 의자 등받이 왼쪽 가장자리가 흐려졌다. v3 P2에도 같은 흐림이 있었고 ChatGPT가 그것까지 따라 그렸다(S1·P2 첫 판). 그래서 ① 합성할 때 의자 등받이 왼쪽 띠(`--keep 470,580,580,960`)는 그 장 그대로 두고 ② S1·P2는 «의자 등받이 왼쪽 가장자리의 흐린 자국을 또렷한 천 가장자리로» 문장을 더해 v3 P2에서 한 번 더 고쳐 그렸다. S1은 앉는 면 아래도 합성 얼룩이 생겨 `--keep 380,900,1000,1024`를 더했다. 고친 뒤 10장 모두 의자 가장자리가 또렷하다(`check-chair-left2.png`).

## 단체 — 약 14초

**시나리오**(10/11 팀장 지시 — 실제 친구들이 사진 찍을 때처럼): 한 명이 의자에 앉아 정면을 보다가 고개만 문 쪽으로 돌려 친구들을 부른다. 둘이 걸어 들어와 의자 뒤에 서고, 문간에서 휴대폰만 보던 친구를 손짓으로 불러온다. «찍는다?» 앉은 친구가 몸을 숙여 노트북 키를 누르고(«삑»), 넷이 바짝 붙어 — 필터가 깔리며 큰 숫자 3·2·1, «하나, 둘, 셋!» 외치고 각자 다른 포즈. 찰칵 — 하얘졌다가 은은하게 돌아오며 멈춘 장면. **앉고 서는 자리는 처음 정한 그대로**(A 의자 · B 의자 뒤 왼쪽 · C 의자 뒤 오른쪽 · D 의자 오른쪽).

등장인물 — **가상의 한국인 20대 초반 넷**(대학생 또래, 중고생으로 보이지 않게), 얼굴·머리·키가 서로 분명히 다름. 옷은 10/11 Bumm님 최종(브랜드 이름은 프롬프트에 쓰지 않고 생김새로만):

| 사람 | 키 | 얼굴·머리 | 옷 |
|---|---|---|---|
| **A** 남 | 176 | 계란형·곧은 코, 가운데 가르마 웨이브 중간 길이 | 앞을 연 네이비 니트 카디건 + 흰 티 + 진청 일자 청바지 + 흰 운동화 |
| **B** 여 | 160 | 부드러운 계란형, 커튼 앞머리 긴 생머리 | 부드러운 톤 큰 체크의 박시한 남방(앞 열림) + 몸에 붙는 고급 무지 흰 티 + 가는 은색 체인에 작은 은색 하트 태그 목걸이(각인 안 보임) + 연청 와이드 편한 바지 + 흰 운동화 |
| **C** 여 | 167 | 광대가 또렷한 얼굴, 앞머리 없는 턱선 단발(한쪽 귀 뒤로) | 박시한 무지 차콜 니트 V넥 카디건(앞 열림) + 흰 티, 왼쪽 가슴에 작은 여우 머리 패치 둘(검정·흰색) + 중간 톤 청 일자 청바지 + 검은 로퍼 |
| **D** 남 | 184 | 각진 턱·짙은 일자 눈썹, 옆 가르마 짧은 머리 | 세이지 그린 니트 + 베이지 치노 + 무지 회색 운동화(로고 없음) |

| 초 | 장면·동작 | 표정 | 대사(소리 + 앱 말풍선) | 화면 효과 |
|---|---|---|---|---|
| 0.0~0.8 | 빈 교실, 가운데 의자 하나(오른쪽에 열린 문) | — | — | — |
| 0.8~1.8 | A가 들어와 의자에 앉는다 | 편안함 | — | — |
| 1.8~2.6 | A가 앉은 채 고개만 문 쪽으로 돌려 손짓하며 부른다 | 신남 | A: «야, 빨리 와~» | — |
| 2.6~3.6 | B·C가 문으로 들어와 의자 쪽으로 걸어온다. D는 문간에서 휴대폰을 보며 꾸물 | — | — | — |
| 3.6~4.4 | B·C가 의자 뒤(B 왼쪽·C 오른쪽)에 선다. A가 D를 보며 | 살짝 시큰둥(ㅡㅡ) | A: «아, 뭐 해~» | — |
| 4.4~5.8 | B가 D 쪽으로 팔을 뻗어 부르고, D가 휴대폰을 주머니에 넣으며 걸어온다 | 장난스럽게 | B: «일로 와, 일로 와!» | — |
| 5.8~7.0 | D가 의자 오른쪽에 선다. C가 카메라를 가리킨다 | 들뜸 | C: «저기, 저기 봐! 찍는다?» | — |
| 7.0~8.4 | A가 앉은 채 몸을 숙여 아래 노트북 키를 누르고(손은 화면 아래로) 고개를 들어 씩 웃는다 | 장난 | «삑» | — |
| 8.4~9.4 | A가 바로 앉고 셋이 의자 쪽으로 바짝 붙는다 | 웃음 | — | — |
| 9.4~10.6 | 넷이 붙고 C가 A 어깨에 손을 얹는다 | 웃음 | — | 은은한 필터가 깔리기 시작(후반) |
| 10.6~12.1 | 카메라를 보며 기다림 → 외침 | 활짝 | 다 같이: «하나, 둘, 셋!» | 큰 숫자 **3**(10.6) · **2**(11.1) · **1**(11.6) — 앱 |
| 11.6~12.1 | «셋»에 맞춰 각자 다른 포즈(A 엄지 둘 · B 브이 · C 손가락 하트 · D 주먹) | 활짝 | — | — |
| 12.1 | 찰칵 | — | — | 하얀 플래시 0.15초(후반) |
| 12.25~12.85 | 화면이 은은하게 돌아온다 | — | — | 흰색 → 멈춘 장면 0.6초(후반) |
| 12.85~14.0 | 포즈 그대로 멈춘 장면 | — | — | 정지(후반) |

**대본** — 소리로 말하고(영상 생성 때 함께, 한국어), 같은 말을 앱 말풍선으로도 얹는다(말한 사람 머리 옆 위쪽): A «야, 빨리 와~»(1.8~2.6) · A «아, 뭐 해~»(3.6~4.4) · B «일로 와, 일로 와!»(4.4~5.8) ·
C «저기, 저기 봐! 찍는다?»(5.8~7.0) · «삑»(7.8~8.4, 노트북 쪽 작은 효과 글자) · 다 같이 «하나, 둘, 셋!»(11.0~12.1, 숫자와 겹치지 않게 아래쪽 말풍선이 아니라 인물 머리 위).
**생성 구간**: 0.0~12.1초만 만든다. 12.1초부터는 마지막 프레임으로 후반 처리.

### 키프레임(ChatGPT 시안 v3, 16장 — 10/11 다시 그림, 대조표 `cam-v3/check-table.md`)

`.cache/seedance-20261010/gpt/cam-v3/final/`. 순서: 네 사람 3면 시트 → G0(빈 교실 — 앞쪽 책상을 비우고 의자 하나, 오른쪽에 문) → **앞 장을 고쳐 다음 장** → 배경을 G0으로 고정.
모든 장에 붙인 그림: ① 앞 장 ② A 시트 ③ B 시트 ④ C 시트 ⑤ D 시트. 고정 문장은 «same camera position, angle and zoom (fixed camera) … the people are exactly the ones in the character sheets … height order D, A, C, B … they keep their places … no large blurred hands in front of the lens» (전문은 `cam-v3/` 작업 기록).

| 번호 | 초 | 연출 |
|---|---|---|
| G0 | 0.0 | 빈 교실(빈 자리 그림) |
| G1 | 1.4 | A 앉음 |
| G2 | 2.2 | 고개만 문 쪽, 손짓 |
| G3 | 3.0 | B·C 들어옴, D 문간 |
| G4 | 3.9 | B·C 의자 뒤, A가 D를 시큰둥하게 |
| G5 | 4.6 | B가 D 쪽으로 팔을 뻗어 부름 |
| G6 | 5.4 | D 걸어옴 |
| G7 | 6.3 | D 도착, C가 카메라를 가리킴 |
| G8 | 7.3 | A가 숙여 키를 누름 |
| G9 | 8.0 | A 고개 들어 씩 웃음, D 엄지 |
| G10 | 8.8 | 넷이 바짝 모임 |
| G11 | 9.8 | C가 A 어깨에 손, 웃음 |
| G12 | 10.5 | 카메라 보고 미소 |
| G13 | 11.2 | 활짝 웃으며 기다림 |
| G14 | 11.7 | «하나, 둘, 셋!» |
| G15 | 12.1 | 각자 다른 포즈(끝 그림) |

> 다시 그린 장: G1(첫 판은 뒤 책상이 사라짐) · G1·G2(A가 G3부터보다 1.4배 크게 그려져 카메라가 당겨진 것처럼 보였다 — G3에서 셋을 지워 다시) · G3(A·의자가 옮겨짐) · G4(B가 C보다 커 보임 — 다시 그려도 B≈C, 대조표 남은 점 3) · G5(팔이 문 반대쪽) · G7(B가 가리킴·D 운동화 로고) · G11(D 팔이 누구 팔인지 모호). C 시트는 패치가 고양이처럼 나와 한 번, D 시트는 운동화 로고를 지우려 한 번 고쳤다.
> 배경 고정 뒤처리에서 문간의 D(작고 멀어 사람 인식이 놓침)가 지워지는 것을 찾아, G3~G5는 문간 상자를 그대로 두게 했다(`--keep`).

### 단체 v4 계획(10/12 Bumm님 최종, 팀장 전달 — 동선은 Bumm님 확인 대기, 그림 0)

- **그대로 둔다**: 네 사람의 얼굴·머리·키와 전체 느낌, 그리고 남자 둘(A·D)의 옷 전부(Bumm님 «지금도 마음에 든다»).
- **여자 둘의 옷만** 실제 제품 사진을 붙여 그 생김새대로 바꾼다. 사진·출처·크기는 `.cache/seedance-20261010/gpt/cam-group-ref/source.txt`에 있다(공식 판매처의 제품만 나온 사진). 지시문에는 지금처럼 브랜드 이름을 쓰지 않는다.
- **자리**(끝 그림, 왼쪽부터): A(남 176) · B(여 160, 의자에 앉음) · C(여 167) · D(남 184).
  - 키 큰 남자 둘이 바깥, 여자 둘이 안쪽이다.
  - 문이 오른쪽이라 늦게 오는 D가 오른쪽 끝에 선다.
- **v3에서 바뀌는 것**:
  - 의자에 앉는 사람이 A에서 B로 바뀐다. 가장 작은 B가 앉아야 남-여-여-남 줄에서 얼굴 높이가 고르다.
  - 문에 가장 가까운 C가 D를 부른다.
  - 앉은 B가 카메라를 가리키고 노트북 키를 누른다.
  - A가 처음에 친구들을 부르는 흐름은 그대로 둔다.

| 사람 | 옷 |
|---|---|
| A | v3 그대로 — 네이비 카디건 + 흰 티 + 진청 일자 청바지 + 흰 운동화 |
| B | 은색 오브 펜던트 목걸이 + 하늘·베이지 톤 체크 남방(앞 열림) + 안에 크림색 티(왼쪽 가슴에 여우 머리 둘, 회색·주황) · 하의·신발은 v3 |
| C | 은색 하트 태그 목걸이(각인 앞면) + 검정 V넥 카디건(왼쪽 가슴에 하트 하나, 흰색 또는 검정 — Bumm님 선택) + 안에 무지 흰 티 · 하의·로퍼는 v3 |
| D | v3 그대로 — 세이지 그린 니트 + 베이지 치노 + 회색 운동화 |

| 초 | 장면·동작 | 표정 | 대사(소리 + 앱 말풍선) | 키프레임 |
|---|---|---|---|---|
| 0.0~0.8 | 빈 교실, 가운데 의자 하나(오른쪽에 열린 문) | — | — | G0(v3 그대로) |
| 0.8~1.8 | A가 들어와 의자 왼쪽에 서서 등받이에 손을 얹고 노트북 화면을 들여다본다 | 신남 | — | G1 |
| 1.8~2.6 | A가 문 쪽으로 고개를 돌려 손짓하며 부른다 | 신남 | A: «야, 빨리 와~» | G2 |
| 2.6~3.6 | B·C가 문으로 들어와 의자 쪽으로 걸어온다. D는 문간에서 휴대폰을 보며 꾸물거린다 | — | — | G3 |
| 3.6~4.4 | B가 의자에 앉고 C가 의자 오른쪽에 선다. A가 D를 본다 | 살짝 시큰둥 | A: «아, 뭐 해~» | G4 |
| 4.4~5.8 | C가 D 쪽으로 팔을 뻗어 부르고, D가 휴대폰을 주머니에 넣으며 걸어온다 | 장난스럽게 | C: «일로 와, 일로 와!» | G5·G6 |
| 5.8~7.0 | D가 C 오른쪽(맨 오른쪽)에 선다. B가 카메라를 가리킨다 | 들뜸 | B: «저기, 저기 봐! 찍는다?» | G7 |
| 7.0~8.4 | B가 앉은 채 몸을 숙여 아래 노트북 키를 누르고(손은 화면 아래로), 고개를 들어 씩 웃는다 | 장난 | «삑» | G8·G9 |
| 8.4~9.4 | B가 바로 앉고 셋이 의자 쪽으로 바짝 붙는다 | 웃음 | — | G10 |
| 9.4~10.6 | C가 B 어깨에 손을 얹고, A·D가 바깥에서 안쪽으로 몸을 기울인다 | 웃음 | — | G11 |
| 10.6~12.1 | 카메라를 보며 기다리다 외친다 → «셋»에 맞춰 각자 다른 포즈(A 엄지 둘 · B 브이 · C 손가락 하트 · D 주먹) | 활짝 | 다 같이: «하나, 둘, 셋!» | G12~G15 |
| 12.1~14.0 | 찰칵 이후는 v3와 같다(플래시 → 멈춘 장면) | — | — | — |

- **그리는 방법**(팀장 지시):
  - 장마다 기준 사진을 붙여 한 번에 그린다. 앞 장을 고쳐 다음 장을 만드는 연쇄 편집은 하지 않는다.
  - 붙이는 기준 사진은 v3 네 사람 시트와 B·C 제품 사진이다.
  - 배경은 G0으로 고정한다(`clean-plate-composite.py`).
- 동선이 확정되면 아래 «Seedance 프롬프트 전문 — 단체»를 이 표대로 고친다.

## 영상 만들기 전 확인(생성 0 — 허락 뒤)

| 항목 | 개인 | 단체 |
|---|---|---|
| 모델 | Seedance 2.0 (seedance_2_0) · std | 같음 |
| 해상도·화면비 | 1080p · 16:9 | 같음 |
| 길이 | 9초(0.0~8.5초를 쓰고 끝 0.5초는 여유) | 13초(0.0~12.1초를 쓰고 끝은 여유) |
| 소리 | **켠다**(`generate_audio: true`) — 자연스러운 생활 소리: 걸어오는 발소리, 의자 앉는·끄는 소리, 데님 셔츠 스치는 소리, 작은 숨·웃음, 방 공간음. 음악·말 없음 | 켠다 — 같은 생활 소리 + **가벼운 대사**(대본의 말, 한국어). 음악·내레이션 없음 |
| 시작·끝 그림 | start_image = `cam-v3/final/ps-cam3-P0.png`(빈 자리), end_image = `…/ps-cam3-P10.png`(포즈) | start_image = `…/ps-cam3-G0.png`, end_image = `…/ps-cam3-G15.png` |
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
The same Korean woman in her mid-twenties throughout - the same slim face, natural adult proportions, shoulder-length black hair with see-through bangs,
an oversized light-blue denim shirt worn open over a fitted white T-shirt, high-waisted washed-black flared jeans, white sneakers, and a short thin
yellow-gold necklace with one small black onyx quatrefoil pendant. The same dark charcoal fabric chair with thin black metal legs throughout.
The background and camera never change.
Timeline - 0-0.8s: the empty chair. 0.8-2s: she walks in from the right and sits down. 2-3.2s: she smooths her bangs and tucks her hair behind her ear.
3.2-4.2s: she pulls the chair a little closer and sits forward. 4.2-5.6s: she raises one hand to the top edge of the frame and tilts the laptop screen,
her hand small and sharp, never covering her face. 5.6-6.4s: she leans back, checks the screen, then sits upright and looks into the camera.
6.4-7s: she breaks into a bright grin. 7-8s: she waits, smiling. 8-9s: she strikes a cheerful V sign beside her cheek and holds it still - this is the end image.
Natural human motion, no morphing, no extra people, no text, no numbers, no logos, no camera movement, no large blurred hands in front of the lens.
Sound: only the natural ambient sound of the room - her footsteps as she walks in, the soft creak and scrape of the chair as she sits and pulls it closer,
the rustle of her denim shirt, a small breath and a soft laugh as she smiles, quiet room tone. No music, no speech, no narration.
```

### Seedance 프롬프트 전문 — 단체

```text
13-second single continuous shot, landscape 16:9, fixed laptop-webcam camera at desk height, realistic natural daylight in a bright classroom
with an open doorway on the right. The first frame is exactly the start image (the empty classroom with one charcoal chair) and the last frame is
exactly the end image (the four friends' group pose). The background and camera never change.
The same four Korean friends in their early twenties throughout, same faces, hair, heights and clothes: A man (wavy center-parted hair, navy cardigan,
white T-shirt, dark indigo jeans); B woman (long hair with curtain bangs, boxy soft check shirt over a white T-shirt, small silver heart necklace,
light-wash wide jeans); C woman (chin-length bob, boxy charcoal cardigan over a white T-shirt with two small fox-head patches, medium-blue jeans);
D tall man (short side-parted hair, sage-green sweater, beige chinos). Once in place they keep their places: A on the chair, B behind it on the left,
C behind it on the right, D at its right side.
Timeline - 0-0.8s: the empty classroom. 0.8-1.8s: A walks in and sits on the chair, facing the camera. 1.8-2.6s: still seated, A turns only his head
toward the doorway and waves his friends in. 2.6-3.6s: B and C walk in through the doorway toward the chair; D stays in the doorway looking at his phone.
3.6-4.4s: B and C stand behind the chair; A looks at D with a flat, unimpressed face. 4.4-5.8s: B stretches her arm toward D and beckons; D slips his
phone into his pocket and walks over. 5.8-7s: D stands at the right of the chair; C points at the camera excitedly. 7-8.4s: A leans forward and presses
a key on the laptop below the frame, then looks up grinning. 8.4-9.4s: A sits back; the others step in close. 9.4-10.6s: C rests a hand on A's
shoulder, everyone laughing. 10.6-11.6s: they wait, smiling, then shout together. 11.6-13s: each strikes a different pose - A double thumbs-up,
B V sign, C finger heart, D raised fist - held still; this is the end image.
Natural human motion, no morphing, no extra people, no text, no numbers, no logos (except C's two small fox-head patches), no camera movement,
no large blurred hands in front of the lens.
Sound: the natural ambient sound of the room - footsteps, clothes rustling, a chair creaking, laughter, quiet room tone - and short, casual spoken
lines in Korean by the matching person: 1.8-2.6s A: "야, 빨리 와~". 3.6-4.4s A: "아, 뭐 해~". 4.4-5.8s B: "일로 와, 일로 와!".
5.8-7s C: "저기, 저기 봐! 찍는다?". 7.8-8.4s: a short soft beep from the laptop. 11-12.1s all four together: "하나, 둘, 셋!". No music, no narration.
```

> [확인] 한국어 대사가 입 모양·목소리까지 자연스럽게 나오는지는 만들어 봐야 안다. 어색하면 대사만 빼고(생활 소리만) 다시 만들거나,
> 대사를 뒤에서 따로 입히는 방법을 Bumm님께 여쭌다 — 생성 전에 정하지 않는다.

## 다음 차례

1. ~~시안 v3를 팀장이 먼저 본다~~ — 10/11 팀장 검토 통과, Bumm님께 폴더를 열어 드렸다. 남은 점 세 가지(어깨동무·B·C 키·C 패치)와 단체 화면 크기는 Bumm님 답을 기다린다.
   개인은 10/11 Bumm님 판정으로 v4(위 «개인 v4 고칠 계획»)를 그렸다 — 팀장이 먼저 본다. 단체는 아직 v3.
   단체는 10/12 Bumm님 최종 배정으로 v4를 그린다(위 «단체 v4 계획»). C 카디건 하트 색과 동선을 Bumm님이 확인하신 뒤 그린다.
2. 통과하면 검토 페이지 «촬영 화면 영상» 칸과 이 문서의 «영상 만들기 전 확인»을 Bumm님께 보여 드린다.
3. 허락을 받은 편만 Seedance로 만든다(소리를 켜므로 생성 직전에 비용을 다시 확인).
