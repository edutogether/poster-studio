import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { toFile } from 'openai';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ──────────────────────────────────────────────────────────
   운영 설정 (행사 상황에 맞춰 조절)
   - QUALITY    : 'low' | 'medium' | 'high'  (high=가장 예쁨/느림/비쌈, medium 권장)
   - ART_SIZE   : 포스터 원본 비율 (1024x1536 = 세로 2:3, 영화 포스터 표준)
   - VARIANTS   : 한 번에 만들 'AI 그림' 장수 (1 권장. 2로 올리면 더 다양하지만 2배 비쌈/느림)
   ────────────────────────────────────────────────────────── */
const QUALITY = process.env.IMAGE_QUALITY || 'medium';
const ART_SIZE = process.env.IMAGE_SIZE || '1024x1536';
const VARIANTS = Math.max(1, Math.min(2, parseInt(process.env.VARIANTS || '1', 10)));
// 이미지 모델: 기본 최신 gpt-image-2. 문제 생기면 .env에서 gpt-image-1.5 등으로 교체.
const MODEL = process.env.IMAGE_MODEL || 'gpt-image-2';
// 얼굴 보존 강화: 'high'(품질 우선, 기본) | 'off'(속도 우선, 수~십수 초 단축)
const INPUT_FIDELITY = (process.env.INPUT_FIDELITY || 'high').toLowerCase();

const app = express();
const UPLOAD_DIR = path.join(__dirname, 'uploads');
try { fs.rmSync(UPLOAD_DIR, { recursive: true, force: true }); } catch (e) {} // 이전 실행 잔재 청소
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    /^image\/(png|jpe?g|webp)$/i.test(file.mimetype) ? cb(null, true) : cb(new Error('이미지 파일만 업로드할 수 있습니다.'))
});
let _client = null;
function getClient(){
  if(!_client) _client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 90_000,   // 한 번의 생성 호출 최대 90초(와이파이 불안정 시 무한 대기 방지)
    maxRetries: 0      // 재시도는 아래 editWithRetry가 전담(중복 재시도로 대기 폭증 방지)
  });
  return _client;
}

app.use(express.json({ limit: '12mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* 장르별 '그림 컨셉' 프롬프트.
   공통 규칙: 글자/문자 절대 금지(한글은 캔버스가 입힘), 세로 영화 포스터,
   하단 1/3은 어둡고 단순하게 비워서 제목 자리 확보, 아이 얼굴은 알아볼 수 있게 유지. */
const genrePrompts = {
  animation: 'a premium 3D animated feature-film poster key art in the polished style of a major animation studio, the subject as a cheerful heroic main character, warm cinematic rim lighting, vibrant but tasteful color palette, soft depth of field, sense of wonder and adventure',
  fantasy:   'an epic fantasy adventure movie poster key art, the subject as a young hero of legend, magical glowing particles, enchanted painterly atmosphere, dramatic golden-hour light, sweeping mythical landscape, rich saturated jewel tones',
  sf:        'a sleek science-fiction blockbuster movie poster key art, the subject as a brave young space explorer, futuristic suit, glowing holographic interfaces, distant planets and starfield, cinematic teal-and-orange grade, lens flares',
  hero:      'a dynamic superhero blockbuster movie poster key art, the subject as a courageous young hero in a heroic pose, dramatic backlight, city skyline at dusk, comic-cinematic energy, bold confident composition',
  mystery:   'a stylish mystery-adventure movie poster key art, the subject as a clever young detective, moody cinematic lighting, fog and warm street lamps, intriguing but child-friendly noir atmosphere, elegant muted palette',
  director:  'a heartfelt movie-about-movies poster key art, the subject as a passionate young film director holding a camera, glowing stage and studio lights, film reels and clapperboard motifs, warm nostalgic cinematic mood',
  sports:    'an inspiring sports movie poster key art, the subject as a determined young athlete mid-motion, dramatic stadium lights, dust and energy, triumphant golden cinematic glow, sense of teamwork and growth',
  music:     'a vibrant music movie poster key art, the subject as a radiant young performer on a glowing stage, colorful concert lighting, bokeh light beams, joyful uplifting festival atmosphere'
};

function buildPrompt({ genre, mode, title, tagline }) {
  const base = genrePrompts[genre] || genrePrompts.animation;
  const ensemble = mode === 'group'
    ? 'Treat the people in the photo as an ENSEMBLE CAST of co-stars standing together as a team, all of them transformed into the same heroic poster style.'
    : 'Treat the person in the photo as the single lead star (hero portrait), centered and prominent.';
  const concept = (title || tagline)
    ? `This film is titled "${title || ''}"${tagline ? ` with the tagline "${tagline}"` : ''}. Let the scene's mood, energy and theme clearly reflect that idea (while keeping the chosen genre style), but render absolutely NO text or letters.`
    : '';
  return [
    base + '.',
    'Transform the uploaded photo of real student(s) into this poster, keeping their faces clearly recognizable and friendly but stylized to match the art.',
    ensemble,
    concept,
    'Composition: tall vertical 2:3 movie poster, the subject(s) in the upper two-thirds, FULLY VISIBLE.',
    'Frame with comfortable margin: include the entire head and hair with empty space ABOVE the head; never crop or cut off the top of the head, and keep everyone fully within the frame.',
    'IMPORTANT: keep the BOTTOM THIRD darker, calmer and uncluttered so a title can be placed there later.',
    'Absolutely NO text, NO letters, NO numbers, NO logos, NO watermark anywhere in the image.',
    'Safe, wholesome, child-appropriate. High detail, professional, keepsake quality.'
  ].filter(Boolean).join(' ');
}

/* 이미지 생성 호출.
   - 파라미터 폴백: 일부 모델/SDK가 input_fidelity·quality를 거부하면 빼고 재시도
   - 한도(429)·일시 서버오류(5xx): 잠깐 기다렸다 자동 재시도(여러 대 동시 운영 대비) */
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

async function editWithRetry(params) {
  const maxRetries = 4;
  for (let attempt = 0; ; attempt++) {
    try {
      return await getClient().images.edit(params);
    } catch (err) {
      const status = err?.status || err?.response?.status;
      const retryable = status === 429 || (status >= 500 && status < 600);
      if (retryable && attempt < maxRetries) {
        // 지수 백오프(1→2→4→8초) + 무작위 지터(동시에 몰린 노트북들 분산)
        const waitMs = Math.min(1000 * 2 ** attempt, 8000) + Math.floor(Math.random() * 600);
        console.warn(`[retry] ${status} → ${waitMs}ms 후 재시도 (${attempt + 1}/${maxRetries})`);
        await sleep(waitMs);
        continue;
      }
      throw err;
    }
  }
}

let PARAM_LEVEL = 0; // 성공한 파라미터 조합을 기억(다음 요청부터 실패 호출 생략)

async function generateArt(filePath, mimetype, prompt) {
  const mime = /^image\/(png|jpe?g|webp)$/i.test(mimetype || '') ? mimetype : 'image/png';
  const ext = /jpe?g/i.test(mime) ? 'jpg' : (/webp/i.test(mime) ? 'webp' : 'png');
  const image = await toFile(fs.createReadStream(filePath), 'photo.' + ext, { type: mime });
  const baseParams = { model: MODEL, image, prompt, size: ART_SIZE, quality: QUALITY, n: VARIANTS };
  const noQuality = { model: MODEL, image, prompt, size: ART_SIZE, n: VARIANTS };
  const tries = [];
  if (INPUT_FIDELITY === 'high') tries.push({ ...baseParams, input_fidelity: 'high' }); // 얼굴 보존 강화(속도↓)
  tries.push(baseParams, noQuality);
  let lastErr;
  for (let i = PARAM_LEVEL; i < tries.length; i++) {
    try {
      const result = await editWithRetry(tries[i]);
      PARAM_LEVEL = i; // 이 조합이 통했음 → 다음 요청은 여기서 시작
      const imgs = (result.data || []).map(d => `data:image/png;base64,${d.b64_json}`).filter(Boolean);
      if (imgs.length) return imgs;
      throw new Error('이미지 생성 결과가 비어 있습니다.');
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message || '');
      const paramRejected = err?.status === 400 && /unknown|unsupported|invalid|not (allowed|supported)|input_fidelity|quality/i.test(msg);
      if (paramRejected && i < tries.length - 1) continue; // 다음(축소된) 조합으로
      throw err; // 그 외(429 소진·결제·안전정책 등)는 즉시 보고
    }
  }
  throw lastErr;
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, hasKey: !!process.env.OPENAI_API_KEY, model: MODEL, quality: QUALITY, fidelity: INPUT_FIDELITY, size: ART_SIZE, variants: VARIANTS });
});

app.post('/api/generate', upload.single('photo'), async (req, res) => {
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.' });
  if (!req.file) return res.status(400).json({ error: '사진 파일이 없습니다. 먼저 촬영해 주세요.' });

  const genre = req.body.genre || 'animation';
  const mode = req.body.mode === 'group' ? 'group' : 'solo';
  const title = (req.body.movieTitle || '').slice(0, 60);
  const tagline = (req.body.tagline || '').slice(0, 80);
  const prompt = buildPrompt({ genre, mode, title, tagline });

  try {
    const t0 = Date.now();
    const images = await generateArt(req.file.path, req.file.mimetype, prompt);
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[generate] 완료 ${sec}초  (모델=${MODEL} · 화질=${QUALITY} · 얼굴보존=${INPUT_FIDELITY} · 조합레벨=${PARAM_LEVEL})`);
    res.json({ images, meta: { genre, mode, seconds: Number(sec) } });
  } catch (err) {
    const status = err?.status || err?.response?.status;
    const raw = String(err?.message || '');
    console.error('[generate]', status || '', raw || err);
    let msg = raw || 'AI 이미지 생성 중 오류가 발생했습니다.';
    if (status === 429) msg = '지금 요청이 몰려 잠시 대기가 필요합니다. 10~20초 후 다시 시도해 주세요.';
    else if (/billing|quota|hard limit/i.test(raw)) msg = 'OpenAI 크레딧 잔액이 부족합니다. platform.openai.com에서 크레딧을 충전해 주세요.';
    else if (status === 401 || /api key|incorrect key/i.test(raw)) msg = 'API 키가 올바르지 않습니다. .env 파일의 OPENAI_API_KEY를 확인해 주세요.';
    else if (/moderation|safety|content policy/i.test(raw)) msg = '입력한 제목·문구 또는 사진이 안전 기준에 걸렸어요. 문구를 바꾸거나 다시 촬영해 주세요.';
    else if (/timed? ?out|abort/i.test(raw)) msg = '생성 시간이 너무 오래 걸려 중단했습니다. 잠시 후 다시 시도해 주세요.';
    else if (/fetch failed|network|ECONN|ENOTFOUND|EAI_AGAIN/i.test(raw)) msg = '인터넷 연결이 불안정합니다. 와이파이 연결을 확인하고 다시 시도해 주세요.';
    res.status(status === 429 ? 429 : 500).json({ error: msg });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

// 업로드/기타 오류도 항상 JSON으로 응답(브라우저가 HTML 오류를 받아 이상한 문구가 뜨는 것 방지)
app.use((err, req, res, next) => {
  console.error('[error]', err?.message || err);
  const msg = err?.code === 'LIMIT_FILE_SIZE'
    ? '사진 파일이 너무 큽니다(최대 12MB).'
    : (err?.message || '요청 처리 중 오류가 발생했습니다.');
  res.status(400).json({ error: msg });
});

const PORT = process.env.PORT || 3000;
// 보안: 이 노트북 안에서만 접속 가능(루프백). 행사장 공용 와이파이의 타인이
// 이 서버로 크레딧을 소진시키는 것을 차단한다. (LAN 공유가 꼭 필요하면 .env에 HOST=0.0.0.0)
const HOST = process.env.HOST || '127.0.0.1';
app.listen(PORT, HOST, () => {
  console.log(`\n🎬 InKY AI 영화 포스터 제작소 실행 중`);
  console.log(`   브라우저에서 열기:  http://localhost:${PORT}`);
  console.log(`   모델=${MODEL} · 화질=${QUALITY} · 얼굴보존=${INPUT_FIDELITY} · 크기=${ART_SIZE} · AI그림 ${VARIANTS}장/회`);
  if (HOST !== '127.0.0.1') console.warn('   ⚠ 외부 접속 허용 상태(HOST 설정). 공용 네트워크에서는 권장하지 않습니다.');
  console.log('');
});
