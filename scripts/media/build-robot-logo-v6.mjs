// 생성 원화의 패널을 분리하고 로컬 샘플·영상 제작 자료를 만든다. 영상 생성은 수행하지 않는다.
import fs from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { extractSymbol, placeSymbol } from './original-brand-symbol.mjs';

const root = '_docs/intents/2026-09-30-studio-design-integration';
const version = 'v20';
const source = `${root}/robot-logo-${version}`;
const preview = '.cache/wait-preview';
const pack = `${preview}/robot-logo-${version}`;
fs.mkdirSync(pack, { recursive: true });
const symbol = await extractSymbol(source);
const sets = JSON.parse(fs.readFileSync(`${root}/waiting-set-proposal.json`, 'utf8'));
const actions = [
  '0~0.5초: 이젤의 풍경화를 바라본다. 0.5~2초: 붓으로 풀밭과 꽃의 물감 결을 덧칠한다. 2~3초: 붓을 떼고 그림 전체를 살핀다. 로고는 풍경 속 꽃밭과 분수의 형태다. 간판이나 스티커로 바꾸지 않는다.',
  '0~0.5초: 옆으로 기울인 화판의 바닷마을 그림을 바라본다. 0.5~2초: 색연필로 항구와 정원에 선을 더한다. 로고는 방파제·정원·분수의 형태로 풍경에 녹아 있다. 2~3초: 연필을 들어 그림을 확인한다. 그림은 그리는 로봇에게 똑바로 보이는 방향을 유지한다.',
  '0~1초: 열린 슬레이트를 바라보고 관객 쪽으로 살짝 돌린다. 1~1.5초: 윗대를 한 번 닫는다. 1.5~3초: 고개를 끄덕이고 웃는다. 슬레이트를 역재생으로 다시 열지 않는다.',
  '0~1초: 아이들이 로고 모양 불꽃놀이를 구경하는 크레파스 포스터를 들어 보인다. 1~2초: 빈 손으로 그림 속 불꽃놀이와 아이들을 소개한다. 2~3초: 관객과 눈을 맞추고 고개를 끄덕인다. 로고는 밤하늘의 불꽃 형태로 유지한다. 하단에 별도 로고를 추가하지 않는다.',
  '0~0.5초: 모래판을 내려다본다. 0.5~2초: 작은 신발 두 개를 차례로 모래 위에 눌러 발자국을 만든다. 2~3초: 녹음기를 바라보며 소리에 귀를 기울인다. 발자국은 남아 있어야 한다.',
  '0~1초: 찰흙 로고의 바닥을 살짝 정렬한다. 1~2초: 손을 치우고 삼각대 카메라 셔터를 누른다. 2~3초: 카메라 화면과 작품을 번갈아 확인한다. 로고 자체는 다른 모양으로 변하지 않는다.',
  '0~0.5초: 건반을 바라본다. 0.5~2초: 양손 손가락이 다른 순서로 건반을 누르고 몸이 작은 박자를 탄다. 2~3초: 오선지의 음표를 보고 미소 짓는다. 악보에 로고를 넣지 않는다.',
  '0~1초: 양손으로 헤드폰의 양쪽 귀를 감싸고 마이크 쪽으로 조금 기울인다. 1~2초: 노래하듯 입과 고개가 자연스럽게 움직인다. 2~3초: 헤드폰을 잡은 자세로 미소 짓는다. 종이나 악보를 새로 만들지 않는다.',
  '0~1초: 무릎을 꿇은 채 오른손으로 배낭 끈을 잡고 새싹을 바라본다. 1~2초: 왼손의 작은 짐벌 카메라와 마이크를 새싹 가까이 조심스럽게 낮춘다. 2~3초: 이슬방울을 바라보며 따뜻하게 미소 짓는다. 오른손은 계속 배낭 끈을 잡는다. 카메라에 로고를 넣지 않는다.',
  '0~0.5초: 앞치마를 두른 로봇이 냄비 안을 바라본다. 0.5~2초: 한 손으로 냄비 손잡이를 잡고 다른 손의 나무 주걱으로 수프를 천천히 한 바퀴 젓는다. 2~3초: 주걱을 조금 들어 수프를 확인하며 미소 짓는다. 김이 은은하게 올라오고 앞치마의 작은 공식 로고는 유지한다.',
  '0~3초: 엄마와 아이가 손을 잡고 화면 오른쪽을 향해 나란히 걷는다. 얼굴·가슴·골반·발끝이 같은 진행 방향을 유지한다. 목을 뒤로 돌리지 않는다. 발이 번갈아 바닥에 닿고 무게중심이 부드럽게 이동한다. 엄마의 짧은 빨간 목도리 끝만 걸음 뒤에 살짝 따라 움직인다. 아이는 끝이 없는 파란 목도리와 파란 신발을 유지한다.',
  '0~0.7초: 서로 다른 작은 그림들이 모인 모자이크 협동화의 마지막 빈칸을 바라본다. 0.7~2초: 두 손에 든 꽃 그림 조각을 오른쪽 아래 빈칸에 맞추어 붙이고 모서리를 가볍게 누른다. 2~3초: 손을 떼고 완성된 협동화를 바라보며 미소 짓는다. 각 조각은 서로 다른 아이 그림이며 전체로 보면 빨강·초록·파랑·주황의 같이교육 심벌을 이룬다. 붙인 조각은 그대로 남는다. 그림이 순간적으로 바뀌거나 조각을 다시 떼지 않는다.',
];
const common = '첨부한 원화를 시작 장면으로 사용한다. 흰 배경의 고급 3D 캐릭터 애니메이션, 정사각형, 3초 단일 연속 숏. 카메라 고정, 화면 전체와 소품이 잘리지 않게 유지. 아이보리 로봇·검은 얼굴·노란 눈·빨간 안테나와 운동화를 유지한다. 제품의 작은 로고는 제공된 원본 심벌의 형태·비율·색을 그대로 보존하고 글자를 추가하지 않는다. 그림은 풍경과 이야기가 있는 전체 작품으로 유지하고 작은 로고만 자연스럽게 포함한다. 7번 악보는 종이 평면과 같은 방향의 오선지·음표를 유지한다. 8번은 악보 없이 두 손으로 헤드폰을 잡는다. 카메라와 검은 휴대용 녹음 마이크에는 로고가 없다. 앞치마와 어른 스카프에는 작고 정돈된 공식 심벌을 유지한다. 11번 아이는 목을 가로로 감싼 파란 목도리와 파란 신발을 유지한다. 파란 목도리에는 늘어진 끝이나 술을 만들지 않는다. 12번 필통의 작은 공식 심벌을 유지한다. 소품 재질에 맞는 물감·색연필·크레파스·찰흙·인쇄·자수 질감을 유지한다. 행동에 따라 눈길·머리·몸의 무게중심이 함께 움직인다. 처음부터 끝까지 시간은 앞으로 진행하며 각각의 동작을 실제 연속 프레임으로 생성한다. 로고를 별이나 다른 기호로 치환하는 것, 로고 변형, 소품 교체, 순간이동, 발 미끄러짐, 카메라 흔들림, 정지 프레임 늘리기, 역재생, 왕복 반복, 프레임 모핑, 강제 루프 금지. 음성·자막 없음.';

for (let page = 0; page < 3; page++) {
  const sheet = await loadImage(`${source}/sheet-0${page + 1}.png`);
  if (sheet.width !== 1254 || sheet.height !== 1254) throw new Error('원화 크기 변경: 패널 경계를 다시 확인해야 합니다.');
  for (let cell = 0; cell < 4; cell++) {
    const index = page * 4 + cell;
    const id = String(index + 1).padStart(2, '0');
    const split = 627;
    const x = cell % 2 * 627;
    const y = cell < 2 ? 0 : split;
    const h = cell < 2 ? split : 1254 - split;
    const canvas = createCanvas(704, 704);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 704, 704);
    ctx.drawImage(sheet, x, y, 627, h, (704 - 627) / 2, (704 - h) / 2, 627, h);
    if([8,9,10,11].includes(index)){
      ctx.fillStyle='#fff';ctx.fillRect(0,0,704,704);
      ctx.drawImage(await loadImage(`${source}/${id}.png`),0,0,704,704);
    }
    if (![10,11].includes(index)) placeSymbol(ctx,symbol,index);
    fs.writeFileSync(`${pack}/${id}.png`, canvas.toBuffer('image/png'));
    fs.writeFileSync(`${pack}/${id}.webp`, canvas.toBuffer('image/webp'));
    // 11·12번은 새로 생성한 원화를 재압축·축소하지 않은 PNG로 제공한다.
    if([10,11].includes(index)) fs.copyFileSync(`${source}/${id}.png`,`${pack}/${id}.png`);
    // 통과한 일곱 장면은 이전 파일을 바이트 그대로 유지한다.
    if ([0,1,3,4,5,6,7].includes(index)) for (const ext of ['png','webp']) {
      fs.copyFileSync(`${source}/preserved/${id}.${ext}`,`${pack}/${id}.${ext}`);
    }
    fs.writeFileSync(`${pack}/${id}-영상-프롬프트.txt`, `${sets[index].theme}\n\n${common}\n\n${actions[index]}\n`, 'utf8');
    sets[index] = { ...sets[index], revision: version, scene: actions[index], film: null, image: `${id}.png`, videoDurationSeconds: 3, videoStatus: '미제작', motion: actions[index] };
  }
}
fs.copyFileSync(`${source}/logo-reference.png`, `${pack}/로고-원본.png`);
fs.copyFileSync(`${source}/brand-symbol.png`, `${pack}/브랜드-심벌-투명.png`);
fs.copyFileSync(`${source}/image-prompts.json`, `${pack}/image-prompts.json`);
fs.writeFileSync(`${pack}/sets.json`, JSON.stringify(sets, null, 2));
fs.writeFileSync(`${source}/sets.json`, JSON.stringify(sets, null, 2));
fs.writeFileSync(`${pack}/사용안내.txt`, 'Poster Studio 로딩 장면 12세트\n\n01~12.png: 내장 이미지 생성 도구로 제작한 원화.\n01~12-영상-프롬프트.txt: 장면별 3초 연속 영상 지시서.\n로고-원본.png: Bumm님 제공 로고.\nsets.json: 로딩 문구·영화 상식·원화 대응표.\nimage-prompts.json: 원화 제작에 사용한 프롬프트.\n\n현재는 원화 12장과 영상 지시서만 완성되었으며, 동영상은 제작되지 않았습니다.\n이미지-투-비디오 도구에 번호가 같은 PNG와 지시서를 넣습니다. 유료 생성은 Bumm님 확인 후 진행합니다.\n영상 완성 후 로고 형태·손·바닥 접지·3초 연속 동작을 확인하고 앱에 적용해야 합니다.\n');
const esc = v => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const styles = fs.readFileSync('scripts/media/robot-samples.css', 'utf8');
const cards = sets.map((s, i) => { const id=String(i+1).padStart(2,'0'); return `<article class="card"><div class="label"><span>${id} · ${esc(s.theme)}</span><span class="ready">원화</span></div><div class="media"><img src="/robot-logo-v20/${id}.${i >= 10 ? 'png' : 'webp'}" alt="${esc(s.theme)} 로봇과 같이교육 로고" loading="lazy"></div><div class="copy"><h2>${esc(s.title)}</h2><div class="dots" aria-hidden="true"><i></i><i></i><i></i></div><h3>${esc(s.fact.title)}</h3><p class="body">${esc(s.fact.body)}</p><details class="note"><summary>3초 동작 계획 · 영상 미제작</summary><p>${esc(s.motion)}</p></details><p class="downloads"><a download href="/robot-logo-v20/${id}.png">원화 PNG</a><a download href="/robot-logo-v20/${id}-영상-프롬프트.txt">영상 프롬프트</a></p></div></article>`; }).join('');
fs.writeFileSync(`${preview}/samples.html`, `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Poster Studio · 로고 원화 12세트</title><link rel="stylesheet" href="/fonts/pretendard.css"><style>${styles}</style><main><header><h1>Poster <span style="color:#ed3124">Studio</span> · 로고 원화 12세트</h1><p>수정본 v20 · 7~11번 상식 제목과 설명을 다듬었습니다. 1~6번·12번 문구와 모든 원화는 그대로입니다.<br>현재 그림은 원화입니다. 요청하신 3초 동영상 12편은 아직 제작되지 않았습니다.</p><p><a download href="/robot-logo-v20.zip">원화 12장 + 영상 프롬프트 전체 받기</a></p></header><div class="grid">${cards}</div></main></html>`);
console.log(JSON.stringify({images:sets.length,videoPrompts:actions.length,generatedVideos:0,preview:'http://127.0.0.1:5523/samples.html'}));
