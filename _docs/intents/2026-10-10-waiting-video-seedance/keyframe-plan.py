"""대기 영상 12편 키프레임 계획(2026-10-10 Bumm님 «11편 싹 다» — 08 기준: 1초마다, 원화에서 자세만, 0·8초 = 원화).

편마다 «초 · 한국어 연출 · ChatGPT에 넣는 영어 지시»를 한곳에 둔다. 그림을 그릴 때 이 파일이 만든 문장을 그대로 넣고,
같은 문장이 «영상 만들기 전 확인» 칸과 스토리보드 문서(storyboards.md)의 근거가 된다.
고정 문장(얼굴·손·구도)은 모든 편에 똑같이 붙는다 — 2026-10-10 Bumm님: 입·이빨·혀·미소선 없음(08만 예외), 손끝 검정.
05·09·12는 이야기상 끝 상태가 원화와 달라(발자국 넷·물방울 없음·조각 끼움) 8초 끝 그림을 한 장 더 둔다.
사용: python keyframe-plan.py            → keyframe-plan.json(편·초·연출·전체 지시문) + storyboards.md(편별 시나리오·0~8초 스토리보드·
                                          Seedance 프롬프트 전문·설정·크레딧·뒤처리 = «영상 만들기 전 확인»의 글)
      python keyframe-plan.py 06 t5     → 그 한 장의 전체 지시문을 출력
      python keyframe-plan.py --review <검토 폴더> <그림 작업 폴더>
                                        → 맞춘 키프레임(<작업>/kf-NN-matched, 08은 kf-matched)과 원화(<작업>/../k0/K0-NN.png)를
                                          <검토>/kf/NN/로 복사하고 <검토>/keyframes.json(편별 줄 + «영상 만들기 전 확인» 자료)을 쓴다.
                                          그림이 하나도 없는 편은 넣지 않는다. 다시 그린 판(-v2)이 있으면 그것을 쓴다
"""
import json, os, re, shutil, sys

FACE = ("Keep the robot's face exactly like the attached artwork: only two glowing orange arc eyes in the same arc shape - "
        "no mouth, no teeth, no tongue, no smile line, no eyebrows. Its hands have black fingers with black fingertips and one cream thumb.")
FACE_11 = ("Keep both robots' faces exactly like the attached artwork: each visor shows only its two glowing orange arc eyes in the same arc shape - "
           "no mouth, no teeth, no tongue, no smile line, no eyebrows, and the child's eyes are never reflected on the mother's visor. "
           "Their hands have black fingers with black fingertips and one cream thumb.")
TAIL = ("Keep the exact same composition, camera angle, framing, scale and position of everything, the same pure white background, "
        "lighting and colors, and {keep} exactly where they are; only {change}. Square 1:1, no text.")

SCENES = {
    '01': {'title': '이젤 그림', 'keep': 'the easel, the painting (the picture itself stays exactly the same - any new stroke is the same color as the spot it touches), and the palette with its paint colors',
           'change': "the robot's pose changes",
           'shots': [
               (1, '붓을 그림에서 떼어 팔레트의 주황 물감을 찍는다', 'the robot lifts the brush from the canvas and dips its tip into the orange paint on the palette, looking at the palette'),
               (2, '주황 붓으로 그림 속 주황 꽃길을 칠한다', 'the robot touches the orange-loaded brush to the curved orange flower path of the garden logo in the painting, painting a short stroke along it'),
               (3, '주황 꽃길을 따라 계속 칠한다', 'the robot keeps painting further along the orange flower path, brush and head following the curve'),
               (4, '팔레트로 돌아가 초록 물감을 찍는다', 'the robot brings the brush back to the palette and dips its tip into the green paint'),
               (5, '초록 붓으로 둥근 초록 덤불을 칠한다', 'the robot touches the green-loaded brush to the round green hedge of the garden logo in the painting'),
               (6, '초록 덤불 둘레를 칠하며 고개를 살짝 기울인다', 'the robot paints around the round green hedge, head tilted slightly as it looks closely'),
               (7, '붓을 원화 자리로 가져간다', 'the robot moves the brush back toward the spot where it touches the canvas in the attached artwork - almost the same pose, a moment before'),
           ]},
    '02': {'title': '책상 색칠', 'keep': 'the slanted drawing board with its harbor drawing (exactly the same), the desk, the chair, the pencil cup with its small logo, and the colored pencils lying on the desk',
           'change': "the robot's pose and which pencil it holds change",
           'shots': [
               (1, '빨간 색연필로 빨간 꽃길을 칠한다', 'the robot colors the red flower path of the logo in the drawing with the red pencil in its hand'),
               (2, '빨간 색연필을 책상 위에 내려놓는다', 'the robot puts the red pencil down on the desk next to the other pencils; its hand is now empty'),
               (3, '파란 색연필을 집어 든다', 'the robot picks up the blue pencil from the desk; the red pencil now lies on the desk'),
               (4, '파란 색연필로 파란 바다를 칠한다', 'the robot colors the blue sea in the drawing with the blue pencil'),
               (5, '파란 색연필을 책상에 내려놓는다', 'the robot puts the blue pencil back down on the desk; its hand is empty'),
               (6, '빨간 색연필을 다시 집는다', 'the robot picks the red pencil up again from the desk'),
               (7, '빨간 색연필을 빨간 꽃길로 가져간다', 'the robot brings the red pencil back to the red flower path - almost the same pose as the attached artwork, a moment before'),
           ]},
    '03': {'title': '슬레이트', 'keep': 'the clapperboard with its small logo',
           'change': "the robot's pose and the clapperboard's hinged stick change",
           'shots': [
               (1, '슬레이트를 조금 들어 올려 준비한다', 'the robot raises the open clapperboard a little higher, ready to clap'),
               (2, '막대를 «탁» 닫는다', 'the robot snaps the hinged striped stick shut - the clapperboard is now closed'),
               (3, '닫힌 슬레이트를 든 채 고개를 끄덕인다', 'holding the closed clapperboard, the robot gives a small nod'),
               (4, '닫힌 슬레이트를 높이 들어 보인다', 'the robot lifts the closed clapperboard up high, showing it to the viewer'),
               (5, '슬레이트를 가슴 높이로 내린다', 'the robot lowers the closed clapperboard back to chest height'),
               (6, '손으로 막대를 천천히 들어 연다', "the robot's hand lifts the hinged striped stick open again by hand - the stick is half open"),
               (7, '막대가 원화만큼 열린다', 'the hinged stick is open as in the attached artwork and the robot holds the clapperboard almost exactly as in the attached artwork; no motion lines, no spark marks and no drawn effects anywhere'),
           ]},
    '04': {'title': '포스터 소개', 'keep': 'the poster (the fireworks logo, the two children and the dog) exactly the same',
           'change': "the robot's pose changes",
           'shots': [
               (1, '고개를 돌려 포스터를 본다', 'the robot turns its head to look at the poster, its other hand still holding the top of the poster'),
               (2, '위쪽 불꽃 로고를 가리킨다', 'the robot points with its free hand at the fireworks logo at the top of the poster'),
               (3, '아래쪽 아이 둘과 강아지를 가리킨다', 'the robot points down at the two children and the dog watching the fireworks at the bottom of the poster'),
               (4, '신나서 팔을 번쩍 든다', 'excited, the robot raises its free arm high with an open hand, body bouncing slightly, the other hand still holding the poster top'),
               (5, '보는 사람 쪽으로 돌아선다', 'the robot turns back toward the viewer, free hand coming down'),
               (6, '손바닥을 펴 내밀기 시작한다', 'the robot starts to open its free hand palm-up toward the viewer'),
               (7, '원화의 손바닥 내민 자세에 거의 닿는다', 'the robot presents the poster with its palm open toward the viewer - almost exactly the pose in the attached artwork'),
           ]},
    '05': {'title': '모래 발자국 소리', 'keep': 'the sandbox, the small black handheld recorder with its microphone on the tripod, and the red and blue slip-on shoes (no laces)',
           'change': "the robot's pose and the footprints in the sand change (the sand never rises or sprays)",
           'shots': [
               (1, '두 손을 신발 뒤축에 하나씩 넣어 모래 위에 든다', 'the robot slips one hand into the heel of each shoe - red shoe on one hand, blue shoe on the other - holding them just above the sand like feet'),
               (2, '빨간 신발로 모래를 밟아 첫 발자국', 'the robot presses the red shoe down onto the smooth sand at the left end, leaving exactly ONE shoe print where it stepped - the rest of the sand stays perfectly smooth'),
               (3, '파란 신발로 다음 걸음, 발자국 둘', 'the robot steps the blue shoe ahead onto the sand; there are now two shoe prints, only where the shoes stepped'),
               (4, '빨간 신발 셋째 걸음, 발자국 셋', 'the robot steps the red shoe ahead again; three shoe prints in a walking line'),
               (5, '파란 신발 넷째 걸음, 발자국 넷', 'the robot steps the blue shoe ahead; four shoe prints in a walking line across the sand'),
               (6, '두 손으로 신발을 들어 올린다', 'the robot lifts both shoes up off the sand with both hands, looking at the four shoe prints'),
               (7, '신발 한 쌍을 뒤축으로 들고 다른 손은 귀에', 'the robot holds the pair of shoes by their heels in one hand and puts its other hand to its ear disc to listen, as in the attached artwork; the four shoe prints stay in the sand'),
               (8, '끝: 원화 자세 + 모래에 발자국 넷', 'final frame: exactly the pose of the attached artwork, and the four shoe prints remain in the sand in a walking line'),
           ]},
    '06': {'title': '점토 로고 촬영', 'keep': 'the clay logo on its round base, the table, the clay pieces, the tool cup, and the camera with its tripod (all three legs on the floor)',
           'change': "the robot's pose and the camera's rear screen change",
           'shots': [
               (1, '조각칼을 든 채 다른 손으로 로고 받침을 누른다', 'the robot keeps the thin sculpting tool in its right hand and with its other hand gently presses the bottom of the clay logo onto its round base'),
               (2, '조각칼을 든 채 다른 손을 카메라로 뻗는다', 'still holding the thin sculpting tool in its right hand, the robot takes its other hand off the clay logo and reaches toward the camera on the tripod, head starting to turn toward the camera'),
               (3, '셔터를 누른다', 'the robot presses the shutter button on top of the camera with one finger, its head turned toward the camera, the thin sculpting tool still in its right hand'),
               (4, '카메라 화면으로 찍힌 사진을 본다', "still holding the thin sculpting tool in its right hand, the robot leans toward the camera and looks at the camera's rear screen, which shows a small photo of the clay logo; its other hand rests on top of the camera"),
               (5, '사진이 마음에 들어 두 손을 살짝 든다', "the robot straightens up, pleased with the photo it just took - both hands lifted a little in joy, the thin sculpting tool still in its right hand, head turned back toward the clay logo; the camera's rear screen still shows a small photo of the clay logo"),
               (6, '다시 로고로 돌아가 조각칼을 빨간 글자에 댄다', "the robot leans back to the clay logo and brings the thin sculpting tool close to the red clay letter, its other hand resting on the clay; the camera's rear screen is dark again as in the artwork"),
               (7, '원화처럼 빨간 글자를 다듬는다', 'the robot shapes the red clay letter with the thin sculpting tool - almost exactly the pose in the attached artwork, a moment before'),
           ]},
    '07': {'title': '피아노', 'keep': 'the black upright piano, the sheet music on it and the piano bench',
           'change': "the robot's pose changes",
           'shots': [
               (1, '두 손으로 화음을 누른다', 'the robot presses a chord on the keys with both hands, fingers spread'),
               (2, '오른손이 건반 오른쪽으로 달린다', "the robot's right hand runs up the keyboard to the right, body leaning slightly the same way"),
               (3, '고개를 들어 악보를 본다', 'the robot lifts its head to read the sheet music, hands still on the keys'),
               (4, '다시 건반을 보며 연주, 고개 끄덕', 'the robot looks back down at the keys and plays with both hands, head nodding down a little to the beat - the head stays in the same side view as in the attached artwork, not turned toward the viewer'),
               (5, '연주하며 몸을 왼쪽으로 흔든다', 'the robot sways its upper body gently to the left while playing'),
               (6, '두 손을 건반 위로 살짝 든다', 'the robot lifts both hands a little above the keys for a big final chord'),
               (7, '화음을 누르며 원화 자세로', 'the robot presses the final chord - almost exactly the pose in the attached artwork'),
           ]},
    '09': {'title': '새싹 물방울', 'keep': 'the backpack, the small black action camera in its hand (no water ever comes out of the camera), the sprout and its soil mound',
           'change': "the robot's pose and the single water drop on the leaf tip change",
           'shots': [
               (1, '카메라를 새싹 가까이 대고 찍는다', 'the robot leans in a little, holding the camera closer to the sprout, filming the single water drop at the leaf tip'),
               (2, '잎끝 물방울이 커진다', 'the single water drop at the tip of the leaf grows a little rounder and heavier; the robot holds the camera very still'),
               (3, '물방울이 잎끝에서 떨어진다', 'the single water drop has just let go of the leaf tip and is falling in the air just below the leaf'),
               (4, '물방울이 흙에 닿는다', 'the single water drop lands on the soil mound with a tiny splash; the leaf tip is now dry'),
               (5, '몸 전체로 크게 놀란다(눈은 그대로)', 'the robot is startled: its whole body jerks back, both arms flung up with the camera still in its hand, eyes still the same arc shape; no water drop on the leaf'),
               (6, '놀람이 풀리며 팔을 내린다', 'the robot relaxes and lowers its arms, chuckling, still kneeling; no water drop on the leaf'),
               (7, '다시 무릎 꿇고 새싹을 찍는다', 'the robot kneels and films the sprout again - almost the pose of the attached artwork, but there is no water drop on the leaf'),
               (8, '끝: 원화 자세 + 물방울 없음', 'final frame: exactly the pose of the attached artwork, but the water drop is gone from the leaf tip'),
           ]},
    '10': {'title': '요리', 'keep': 'the solid wooden table (never transparent), the red pot with steam, the wooden spoon, the vegetables, the cutting board and the apron with its small logo',
           'change': "the robot's pose changes",
           'shots': [
               (1, '국자를 냄비 반대쪽으로 저어 간다', 'the robot stirs the soup, moving the wooden spoon to the far side of the red pot'),
               (2, '한 바퀴 계속 젓는다', 'the robot keeps stirring in a circle, the spoon on the near side of the pot now'),
               (3, '국자를 살짝 들자 김이 오른다', 'the robot lifts the spoon slightly and a soft wisp of steam rises from the pot (the steam passes in front of nothing on the face)'),
               (4, '냄비 쪽으로 몸을 숙여 냄새를 맡는다', 'the robot leans toward the pot to smell the soup, head tilted, the spoon resting in the pot'),
               (5, '맛있는 냄새에 몸을 살짝 흔든다', 'pleased by the smell, the robot sways happily, one hand on the pot handle'),
               (6, '다시 젓기 시작한다', 'the robot starts stirring again'),
               (7, '원화처럼 젓는다', 'the robot stirs the soup - almost exactly the pose in the attached artwork'),
           ]},
    '11': {'title': '엄마와 아이', 'keep': 'both robots - the mother with the red knitted scarf and its small logo tag, the child with the blue scarf wrapped across its neck (no hanging ends) and blue shoes',
           'change': 'the poses change; the two robots stay in about the same area of the frame',
           'face': FACE_11,
           'shots': [
               (1, '손잡고 한 걸음 더 걷는다', 'holding hands, the mother and child take one more step together, the other feet forward now'),
               (2, '멈춰서 서로 마주 본다', 'they stop and look at each other - the mother turns her head down toward the child, the child looks up'),
               (3, '엄마가 몸을 숙여 두 손을 아이에게', 'the mother bends down and reaches both hands toward the child, who raises its arms'),
               (4, '엄마가 아이를 안아 올린다(얼굴 겹치지 않음)', "the mother lifts the child up in a hug, holding it out to the side at her shoulder so that there is clear empty space between the two heads - both visors fully visible, the two heads and faces never touching or overlapping"),
               (5, '안은 채 살짝 돈다', 'the mother holds the child up happily and turns a little, both faces visible, never overlapping'),
               (6, '아이를 땅에 내려놓는다', 'the mother sets the child back down on the ground, both feet on the floor'),
               (7, '다시 손잡고 걷기 시작한다', 'they hold hands again and start walking - almost exactly the pose in the attached artwork'),
           ]},
    '12': {'title': '퍼즐 판', 'keep': 'the puzzle board on its wooden stand (every tile the same size and filling its cell completely) and the pencil cup with its small logo',
           'change': "the robot's pose and the last tile change",
           'shots': [
               (1, '마지막 조각을 빈칸으로 곧장 밀어 넣는다', 'the robot pushes the tilted sun-and-flowers tile straight into its empty cell - half of it is already in'),
               (2, '조각이 딱 맞게 들어간다', 'the sun-and-flowers tile is now fully in its cell, flat and flush with the others; the board is complete'),
               (3, '두 손으로 조각을 꾹 눌러 편다', 'the robot presses the new tile flat with both hands'),
               (4, '한 걸음 물러나 완성된 판을 본다', 'the robot steps back a little and looks up at the completed board'),
               (5, '손뼉을 친다', 'the robot claps its hands happily, eyes the same arc shape'),
               (6, '완성된 로고를 가리킨다', 'the robot points at the big logo on the completed board'),
               (7, '판 가장자리로 손을 가져간다', 'the robot brings its hands back toward the edge of the board'),
               (8, '끝: 원화 자세 + 조각이 다 끼워진 판', 'final frame: exactly the pose of the attached artwork, but the sun-and-flowers tile is fully in place, so the board is complete'),
           ]},
}


# 08은 10/8 통과판의 동작을 1초마다 그린 키프레임 7장이 이미 있다(입 그대로 — 10/10 Bumm님 재확인). 영상 프롬프트용으로만 둔다.
SCENES['08'] = {'title': '노래(입 그대로)', 'keep': 'the microphone, pop filter, stand and cable', 'change': "the robot's pose changes",
                'shots': [
                    (1, '헤드폰을 감싸며 마이크 쪽으로', 'the robot cups both headphone ear cups and leans a little toward the microphone'),
                    (2, '마이크에 가장 가까이, 고개 숙여 노래 시작', 'the robot leans its upper body closest to the microphone, head tipped slightly down toward the pop filter as if starting to sing'),
                    (3, '화면 왼쪽으로 갸웃, 몸도 같은 쪽', 'the robot sings with feeling - head tilts toward the left of the picture and its upper body sways the same way'),
                    (4, '고개 들고 긴 음, 몸 가운데', 'the robot holds a long high note - head upright and lifted a little, body centered and straight'),
                    (5, '화면 오른쪽으로 갸웃, 몸도 같은 쪽', 'the robot sways to the other side - head tilts toward the right of the picture and its upper body leans the same way'),
                    (6, '다시 왼쪽으로 살짝, 마지막 소절', 'the robot sways gently back toward the left, head tilted only slightly, singing the last line'),
                    (7, '노래를 마치고 작게 끄덕임', 'the robot finishes the song and gives a small happy nod, body upright and centered'),
                ]}
SCENARIO = {
    '01': '이젤 앞에서 팔레트를 든 채 그림 속 정원 로고를 칠한다. 주황 물감을 찍어 주황 꽃길을, 초록 물감을 찍어 둥근 덤불을 칠하고 원래 자세로 돌아온다. 걸어 나가지 않고, 붓·팔레트 든 손은 끝까지 그대로, 그림은 바뀌지 않는다.',
    '02': '의자에 앉아 항구 그림을 색칠한다. 빨간 색연필로 빨간 꽃길을 칠하고 내려놓은 뒤 파란 색연필을 집어 바다를 칠하고, 다시 빨간 색연필을 집어 원래 자세로. 날아오는 연필 없음, 그림판은 그대로.',
    '03': '슬레이트를 «탁» 닫고, 닫힌 채 높이 들어 보인 뒤, 손으로 막대를 다시 들어 원화처럼 연다(역재생처럼 저절로 열리지 않음).',
    '04': '포스터를 보며 위쪽 불꽃 로고와 아래쪽 아이 둘·강아지를 차례로 가리키고, 신나서 팔을 든 뒤 손바닥을 내미는 원화 자세로 돌아온다.',
    '05': '끈 없는 신발 두 짝에 손을 넣어 모래 위를 걷듯 번갈아 밟아 발자국 넷을 만들고, 신발을 들어 올려 귀를 기울이는 원화 자세로 끝난다. 발자국은 밟은 자리에만 남고 모래는 솟지 않는다.',
    '06': '조각칼을 든 채 점토 로고 받침을 다듬고, 카메라 셔터를 눌러 찍은 사진을 화면으로 보고 기뻐한 뒤 다시 빨간 글자를 다듬는다. 삼각대 세 다리는 늘 바닥에.',
    '07': '화음을 누르고, 오른손으로 건반을 달리고, 악보를 보고, 다시 연주하며 몸을 흔들다가 마지막 화음으로 원화 자세.',
    '08': '헤드폰을 감싸고 마이크 쪽으로 다가가 노래한다 — 좌우로 갸웃, 긴 음, 작은 끄덕임(10/8 통과판의 동작). 08만 원화의 벌린 입을 그대로 둔다.',
    '09': '무릎 꿇고 새싹을 찍다가 잎끝 물방울 하나가 떨어지자 몸 전체로 크게 놀라고(눈 모양은 그대로) 다시 찍는다. 카메라에서 물이 나오지 않는다. 끝은 물방울이 없는 원화 자세.',
    '10': '냄비를 젓다가 김이 오르자 냄새를 맡고 기분 좋게 흔들린 뒤 다시 젓는다. 김이 얼굴 앞을 지나도 입은 없고, 탁자는 투명해지지 않는다.',
    '11': '손잡고 걷다 멈춰 마주 보고, 엄마가 아이를 안아 올렸다가(두 얼굴 겹치지 않음) 내려놓고 다시 손잡고 걷는다(끝 = 원화). 엄마 얼굴판에 아이 눈이 비치지 않는다.',
    '12': '마지막 조각(해와 꽃)을 빈칸으로 곧장 밀어 한 번에 끼우고, 꾹 눌러 편 뒤 물러나 완성된 판을 보고 손뼉 치고 로고를 가리킨다. 끝은 원화 자세 + 다 끼워진 판.',
}
SEED_FACE = ('The visor shows only two glowing orange arc eyes the whole time - no mouth, no teeth, no tongue, no smile line, no eyebrows; '
             'hands have black fingers with black fingertips and one cream thumb.')
SEED_FACE_08 = ('The face stays exactly as in the start image the whole time: the two glowing eyes and the same small open mouth, nothing added; '
                'hands have black fingers with black fingertips and one cream thumb.')
SEED_FACE_11 = ('Each visor shows only its two glowing orange arc eyes the whole time - no mouth, no teeth, no tongue, no smile line, no eyebrows, '
                "and the child's eyes are never reflected on the mother's visor; while hugging the two faces never overlap; "
                'hands have black fingers with black fingertips and one cream thumb.')
SEEDANCE = {'모델': 'Seedance 2.0 (seedance_2_0)', 'mode': 'fast — 빠른 모드(10/11 Bumm님 결정, 한 편씩 승인)', '해상도': '720p', '화면비': '1:1', '길이': '8초',
            '소리': '없음(generate_audio false)', '시작 그림(start_image)': '원화', '끝 그림(end_image)': '원화(05·09·12는 끝 그림)',
            '참고 그림(image_references)': '넣지 않음 — 넣으면 시작·끝 그림이 참고 목록으로 합쳐져 첫·끝이 고정되지 않았다(10/10 08 시험). 중간 키프레임은 아래 초별 연출 글로 준다',
            '크레딧': '20(빠른 모드) — 보통 모드(std)면 36'}
POST = ['결과 크기(10/10 시험은 960×960) → 704×704로 줄임(앱 자리와 같은 크기)',
        '24fps로 정확히 192프레임: 첫 프레임은 원화와 같은 장면이라 버리고 2~193번을 쓴다(10/10 시험 결과 193프레임). 모자라면 끝 프레임을 늘린다',
        '처음·끝 6프레임(0.25초)을 원화(05·09·12의 끝은 끝 그림)로 겹쳐 넘겨 첫·끝 프레임이 원화와 화소까지 같게 한다 — 앱이 원화 정지 화면에서 영상으로 넘어갈 때 튀지 않게',
        '검사: scripts/media/review-generated-video.py(192프레임·첫/끝 ΔE·키프레임 따르기·튐·깜박임·노이즈·색) + check-face-elements.py(08은 입 그대로) — 걸린 것은 프레임을 사람이 본다']


# 품질 기준 — Bumm님이 만든 영상을 보고 짚은 것과 세션이 본 걱정을 쌓아, 다음 편부터 모든 편의 프롬프트에 미리 넣는다
# (10/11 팀장 지시: «뒤로 갈수록 실패가 줄게»). 번호는 늘리기만 하고 지우지 않는다.
QUALITY = [
    ('Q1', '01 Bumm님(10/11)', '물건·색의 대응이 영상 내내 바뀌지 않는다 — 찍은 물감 색 = 붓끝 색 = 칠해지는 색(01에서 초록을 찍었는데 주황이 묻어났다)'),
    ('Q2', '01 세션 관찰(10/11)', '배경 소품은 제자리에 못 박는다 — 미끄러지거나 기울거나 크기·모양이 바뀌지 않고, 그림 속 그림은 새로 칠한 자국 말고는 그대로(01에서 0.5초쯤 이젤·그림이 옮겨졌다)'),
    ('Q3', '01 세션 관찰(10/11)', '닿는 동작은 닿는다고 쓴다 — 붓끝·연필 끝·손가락이 실제로 표면에 닿는다(01에서 붓이 캔버스에 거의 닿지 않았다)'),
    ('Q4', '02 Bumm님(10/11)', '도구·물건의 생김새가 실제와 맞는다 — 연필은 한쪽만 깎이고 반대쪽은 뭉툭, 붓·국자·조각칼은 손잡이와 날·끝이 한쪽씩(02에서 연필이 앞뒤 양쪽 다 깎여 있었다)'),
    ('Q5', '04 세션 관찰(10/11)', '감정이 큰 순간(신남·기쁨·놀람·웃음)에도 얼굴판은 주황 눈 두 개뿐 — 그 초 연출 문장 안에 «eyes only, no mouth»를 다시 쓴다(04에서 신나서 팔을 드는 3.0~4.75초에 분홍 입이 생겼고, 얼굴 검사 도구는 1프레임만 잡았다)'),
]
QUALITY_EN = ('Every object keeps the same identity, color, size and position from the first frame to the last unless the robot itself picks it up and moves it; '
              'colors never swap between objects, and nothing appears from nowhere or vanishes. The props are locked in place: they never slide, tilt, rotate, '
              'resize, bend or get redrawn - only the robot moves.')
QUALITY_EN_Q4 = ('Every tool and object has its real, correct shape the whole time: one working end and one handle end - never two tips, '
                 'mirrored ends, extra parts or duplicated pieces.')
# Q5: 이 낱말이 든 초(감정이 큰 순간)에는 얼굴 규칙을 그 문장 끝에 다시 붙인다.
EMO = re.compile(r'excited|happ|pleased|startled|joy|laugh|chuckl|claps|bounc|delight|smil', re.I)
EMO_FACE = ' - its visor still shows only the two glowing orange arc eyes, no mouth and no smile'
# Q4를 편마다 그 편의 도구 말로 옮긴 것(02 Bumm님 지적 뒤, 03부터).
TOOLS = {
    '03': 'The clapperboard is one board with a single hinged striped stick on top - one hinge, one stick, never two.',
    '04': 'The poster is one flat printed sheet with straight edges; when pointing, the robot extends one finger of a normal hand.',
    '05': 'Each slip-on shoe has one heel opening and one toe, a real shoe shape with no laces; the recorder has one microphone on top of one tripod.',
    '06': ('The thin sculpting tool has a handle at one end and a small shaping tip at the other end only. The camera has one lens on the front, '
           'one shutter button on top and one rear screen; the tripod has exactly three legs.'),
    '07': 'The piano has one keyboard whose black keys come in the normal groups of two and three; the bench is one bench.',
    '09': 'The small black action camera has one lens on its front; the sprout has the same leaves as in the start image.',
    '10': ('The wooden spoon has one bowl at one end and a handle at the other; the knife, if seen, has one blade and one handle; '
           'the red pot has one lid edge and its two side handles.'),
    '11': 'Each scarf is one continuous piece; each robot has two arms, two hands and two feet.',
    '12': ('Every tile is one square tile filling one cell; the pencils in the pencil cup are each sharpened at one end only, '
           'with the sharpened tips pointing up out of the cup.'),
}
# 편마다 Q1~Q3를 그 장면 말로 옮긴 것(색 대응·닿는 동작). 01·08은 이미 만들어 확정된 편이라 넣지 않는다.
RULES = {
    '02': ('The red pencil always has a red tip and only ever adds red to the red flower path; the blue pencil always has a blue tip and only ever adds blue to the blue sea. '
           'The other pencils lying on the desk keep their own colors and exact positions, and a pencil the robot puts down stays exactly where it was put. '
           'While coloring, the pencil tip visibly touches the drawing on the slanted board. No pencil flies, floats or appears from nowhere.'),
    '03': ("The striped hinged stick stays attached to the clapperboard at its hinge the whole time and keeps its black-and-white stripe pattern; "
           "when it snaps shut it visibly hits the board, and it opens again only because the robot's hand lifts it."),
    '04': ("The poster stays the same size in the robot's hand and its picture never changes; when the robot points, its fingertip points right at the part of the poster named."),
    '05': ('The red shoe always stays red and on the same hand, the blue shoe always stays blue and on the other hand. Each shoe visibly presses into the sand; '
           'a shoe print appears only where a shoe pressed and then stays exactly there - the sand never sprays, rises or smooths over.'),
    '06': ("The thin sculpting tool stays in the robot's right hand the whole time and the red clay letter stays red. The fingertip visibly presses the shutter button, "
           "and the tool tip touches the red clay letter when shaping it. The tripod's three legs stay on the floor."),
    '07': ('While playing, the fingertips press down on the keys and touch them - they never hover above the keyboard except at 5-6s; the black and white keys keep their order.'),
    '09': ("There is only one water drop: it forms at the leaf tip, falls straight down and lands on the soil mound. The camera stays black, stays in the robot's hand "
           "and never sprays or drips water."),
    '10': ("The pot stays red and the spoon stays wooden; while stirring, the spoon's bowl stays inside the pot. The vegetables keep their colors and places on the board, "
           "and the table stays solid wood, never transparent."),
    '11': ('The mother always wears the red knitted scarf and the child always wears the blue scarf and blue shoes - they never swap or change color. '
           'When they hold hands, their hands are clearly joined.'),
    '12': ("Every tile keeps its own picture and stays in its own cell; the sun-and-flowers tile goes into the one empty cell and then stays there flush. "
           "The robot's hands touch the tile when pushing and pressing it."),
}
# 이미 만든 편 — (기록, 그때 쓴 문장의 판). 판 1 = 품질 기준 없음, 2 = Q1~Q3, 3 = Q1~Q4, 4 = Q1~Q5.
MADE = {'01': ('10/11 빠른 모드로 만듦(작업 c5510fd8) — Bumm님 OK, 그대로 확정', 1),
        '02': ('10/11 빠른 모드로 만듦(작업 c9ae7e97) — Bumm님 OK, 그대로 확정', 2),
        '03': ('10/11 빠른 모드로 만듦(작업 6f09427a) — Bumm님 OK, 그대로 확정', 3),
        '04': ('10/11 빠른 모드로 만듦(작업 022b63ac) — 3.0~4.75초 입 생김, Bumm님 판정 대기', 3),
        '08': ('10/10 시험 영상(작업 94360a13) — 확정', 1)}


def _timeline(sc):
    shots = dict((t, en) for t, _, en in sc['shots'])
    steps = ' '.join(f'{t - 1}-{t}s: {shots[t]}.' for t in range(1, 8))
    end = (f"7-8s: {shots[8].replace('final frame: ', '')} - this is the end image." if 8 in shots
           else '7-8s: the robot settles smoothly back into exactly the opening pose - this is the end image, identical to the start image.')
    return steps, end


def seedance_prompt_v1(scene):
    """01·08을 만들 때 쓴 원래 문장 — 확정된 편의 기록이라 바꾸지 않는다."""
    sc = SCENES[scene]
    steps, end = _timeline(sc)
    face = SEED_FACE_08 if scene == '08' else SEED_FACE_11 if scene == '11' else SEED_FACE
    return ('8-second single continuous shot, square 1:1, fixed camera, pure white background, premium 3D character animation. '
            'The first frame is exactly the start image and the last frame is exactly the end image. '
            f"Same robot design, materials, colors and lighting throughout; {sc['keep']} stay exactly as they are. "
            f'Timeline - {steps} {end} {face} '
            'Smooth, natural, continuous motion; no morphing, no teleporting, no reverse playback, no back-and-forth looping, '
            'no camera movement or shake, no frozen frames, no added text or logos. No audio.')


def seedance_prompt(scene, version=None):
    """품질 기준을 넣은 문장. 판(version)을 주지 않으면 이미 만든 편은 만들 때의 판, 나머지는 최신 판(3 = Q1~Q4)."""
    if version is None: version = MADE[scene][1] if scene in MADE else 4
    if version == 1: return seedance_prompt_v1(scene)
    sc = SCENES[scene]
    steps, end = _timeline(sc)
    steps = steps.replace('the attached artwork', 'the start image')  # 영상 모델에는 «첨부한 원화»가 아니라 시작 그림이다
    if version >= 4:  # Q5: 감정이 큰 초마다 얼굴 규칙을 그 자리에서 다시 말한다
        steps = ' '.join(re.sub(r'\.$', EMO_FACE + '.', st) if EMO.search(st) else st for st in re.split(r'(?<=\.) (?=\d-\ds:)', steps))
    face = SEED_FACE_11 if scene == '11' else SEED_FACE
    quality = QUALITY_EN + (' ' + QUALITY_EN_Q4 if version >= 3 else '')
    rules = RULES[scene] + (' ' + TOOLS[scene] if version >= 3 else '')
    return ('8-second single continuous shot, square 1:1, fixed camera, pure white background, premium 3D character animation. '
            'The first frame is exactly the start image and the last frame is exactly the end image. '
            f"Same robot design, materials, colors and lighting throughout; {sc['keep']} stay exactly as they are. {quality} "
            f'Timeline - {steps} {end} {rules} {face} '
            'Smooth, natural, continuous motion; no morphing, no teleporting, no reverse playback, no back-and-forth looping, '
            'no camera movement or shake, no frozen frames, no added text or logos. No audio.')


# 바로 앞 장면을 둘째 그림으로 함께 붙여 그린 장(10/10~11 다시 그림) — 원화만 붙이면 발자국 수·조각 자리가 장마다 달라졌다.
# (편, 초): (둘째로 붙인 그림, 그 그림에 대한 말, 지시를 바꿔 쓴 경우 그 지시). 첫째 그림은 언제나 원화(K0-NN)다.
PREV = {
    ('05', 3): ('ps-kf-05-t2', 'keep its shoe print exactly where it is in the sand and add the new blue-shoe print just ahead of it', None),
    ('05', 4): ('ps-kf-05-t3', 'keep its two shoe prints exactly where they are in the sand and add the new red-shoe print just ahead of them', None),
    ('05', 5): ('ps-kf-05-t4', 'keep its three shoe prints exactly where they are in the sand and add the new blue-shoe print just ahead of them', None),
    ('05', 6): ('ps-kf-05-t5', 'keep its four shoe prints exactly where they are in the sand and add no new ones', None),
    ('05', 7): ('ps-kf-05-t5', 'keep its four shoe prints exactly where they are in the sand and add no new ones',
                'the robot holds the pair of shoes by their heels in one hand and puts its other hand to its ear disc to listen, as in the first image'),
    ('05', 8): ('ps-kf-05-t5', 'copy its four shoe prints exactly where they are in the sand and add no new ones',
                'final frame: exactly the pose of the first image, and the four shoe prints remain in the sand in a walking line'),
    ('12', 6): ('ps-kf-12-end', 'its board is complete - the sun-and-flowers tile sits fully in its cell, flat and flush exactly like every other tile; keep the board exactly like that', None),
    ('12', 7): ('ps-kf-12-end', 'its board is complete - the sun-and-flowers tile sits fully in its cell, flat and flush exactly like every other tile; keep the board exactly like that', None),
}


def prompt(scene, t):
    sc = SCENES[scene]
    action = dict((s[0], s[2]) for s in sc['shots'])[t]
    head = f'Keyframe {scene}-t{t}.' if t < 8 else f'Keyframe {scene}-end.'
    tail = f"{sc.get('face', FACE)} " + TAIL.format(keep=sc['keep'], change=sc['change'])
    if (scene, t) in PREV:
        prev, note, override = PREV[(scene, t)]
        return (f'{head} Edit the FIRST attached image, the original artwork (not the previous result): {override or action}. '
                f'The SECOND attached image shows the moment just before: {note}. {tail}')
    return f'{head} Edit THIS newly attached original artwork (not the previous result): {action}. {tail}'


def best(folder, scene, t):
    name = f'ps-kf-{scene}-t{t}' if t < 8 else f'ps-kf-{scene}-end'
    for cand in (f'{name}-v2.png', f'{name}.png'):
        if os.path.exists(os.path.join(folder, cand)): return os.path.join(folder, cand)
    return None


def review(out, work):
    k0 = os.path.join(work, '..', 'k0')
    scenes = []
    for sc in sorted(SCENES):
        folder = os.path.join(work, 'kf-matched' if sc == '08' else f'kf-{sc}-matched')
        ts = sorted(t for t, _, _ in SCENES[sc]['shots'])
        found = {t: best(folder, sc, t) for t in ts}
        if not any(found.values()): continue
        dst = os.path.join(out, 'kf', sc); os.makedirs(dst, exist_ok=True)
        shutil.copyfile(os.path.join(k0, f'K0-{sc}.png'), os.path.join(dst, 'K0.png'))
        labels = dict((t, ko) for t, ko, _ in SCENES[sc]['shots'])
        items = [{'label': '0초 · 원화(앱 정지 화면과 같음)', 'image': f'kf/{sc}/K0.png'}]
        for t in ts:
            if found[t]:
                shutil.copyfile(found[t], os.path.join(dst, os.path.basename(found[t])))
                items.append({'label': f'{t}초 · {labels[t]}', 'image': f'kf/{sc}/{os.path.basename(found[t])}'})
            else:
                items.append({'label': f'{t}초 · {labels[t]} — 아직 안 그림', 'missing': True})
        if 8 not in ts: items.append({'label': '8초 · 원화(처음 자세로 돌아옴)', 'image': f'kf/{sc}/K0.png'})
        scenes.append({'id': sc, 'title': f"{sc} {SCENES[sc]['title']}", 'items': items,
                       'preflight': {'scenario': SCENARIO[sc], 'prompt': seedance_prompt(sc), 'settings': SEEDANCE, 'post': POST}})
    json.dump({'scenes': scenes}, open(os.path.join(out, 'keyframes.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('편', [s['id'] for s in scenes], '그림', sum(1 for s in scenes for i in s['items'] if not i.get('missing')))


def storyboards(path):
    lines = ['# 대기 영상 12편 — 시나리오·스토리보드·Seedance 프롬프트(«영상 만들기 전 확인»의 글)', '',
             '> 이 문서는 `keyframe-plan.py`가 만든다 — 고칠 때는 그 파일을 고치고 다시 돌린다. 그림·수치는 검토 페이지 «⑥ 키프레임»에 있다.', '',
             '## 공통 설정', '', '| 항목 | 값 |', '|---|---|'] + [f'| {k} | {v} |' for k, v in SEEDANCE.items()] + [
             '', '## 뒤처리(0원, 편마다 똑같이)', ''] + [f'{i}. {p}' for i, p in enumerate(POST, 1)] + [
             '', '## 품질 기준(만든 영상에서 짚은 것 — 다음 편부터 모든 프롬프트에 미리 넣는다)', ''] + [f'- **{q}** ({src}) {txt}' for q, src, txt in QUALITY] + [
             '', '영어로 아직 안 만든 편에 붙는 문장(Q1~Q4, Q5는 감정이 큰 초마다 «eyes only, no mouth»):', '', '```text', QUALITY_EN + ' ' + QUALITY_EN_Q4, '```', '',
             '## 크레딧', '', '- std 36 × 12편 = 432 · fast 20 × 12편 = 240 (08은 시험 영상이 이미 있음 — 다시 만들면 포함)',
             '- 영상 생성은 편마다 이 칸을 Bumm님께 보여 드리고 «해»를 받은 뒤에만 한다(10/10).', '']
    for sc in sorted(SCENES):
        v = SCENES[sc]
        lines += [f"## {sc} {v['title']}", '', f'**시나리오** — {SCENARIO[sc]}', '', '| 초 | 연출(키프레임) |', '|---|---|', '| 0 | 원화 |']
        lines += [f'| {t if t < 8 else "8(끝)"} | {ko} |' for t, ko, _ in v['shots']]
        if all(t < 8 for t, _, _ in v['shots']): lines.append('| 8 | 원화(처음 자세로 돌아옴) |')
        if sc in MADE: lines += ['', f'**만든 편** — {MADE[sc][0]}. 아래는 만들 때 넣은 문장 그대로다.']
        lines += ['', '**Seedance 프롬프트 전문**', '', '```text', seedance_prompt(sc), '```', '']
        if sc != '08':
            lines += ['<details><summary>키프레임 그림 지시문(ChatGPT, 원화를 매번 첨부)</summary>', '']
            lines += [f'- {t}: `{prompt(sc, t)}`' for t, _, _ in v['shots']] + ['', '</details>', '']
    open(path, 'w', encoding='utf-8', newline='\n').write('\n'.join(lines) + '\n')


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    if len(sys.argv) == 4 and sys.argv[1] == '--review':
        review(os.path.abspath(sys.argv[2]), os.path.abspath(sys.argv[3])); return 0
    if len(sys.argv) == 3:
        print(prompt(sys.argv[1], int(sys.argv[2].lstrip('t')))); return 0
    out = {sc: {'title': v['title'], 'shots': [{'초': t, '연출': ko, '지시': prompt(sc, t)} for t, ko, _ in v['shots']]}
           for sc, v in SCENES.items() if sc != '08'}
    json.dump(out, open(os.path.join(here, 'keyframe-plan.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    storyboards(os.path.join(here, 'storyboards.md'))
    print({k: len(v['shots']) for k, v in out.items()}, sum(len(v['shots']) for v in out.values()), '+ storyboards.md')
    return 0


if __name__ == '__main__':
    sys.exit(main())
