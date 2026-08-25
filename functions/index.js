import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import express from 'express';
import multer from 'multer';
import fs from 'fs';
import os from 'os';
import path from 'path';
import OpenAI from 'openai';
import { toFile } from 'openai';

const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');

/* ──────────────────────────────────────────────────────────
   운영 설정 (행사 상황에 맞춰 조절 — Firebase Functions 환경변수로 주입)
   - QUALITY    : 'low' | 'medium' | 'high'  (high=가장 예쁨/느림/비쌈, medium 권장)
   - ART_SIZE   : 포스터 원본 비율 (1024x1536 = 세로 2:3, 영화 포스터 표준)
   - VARIANTS   : 한 번에 만들 'AI 그림' 장수 (1 권장. 2로 올리면 더 다양하지만 2배 비쌈/느림)
   ────────────────────────────────────────────────────────── */
const QUALITY = process.env.IMAGE_QUALITY || 'medium';
const ART_SIZE = process.env.IMAGE_SIZE || '1024x1536';
const VARIANTS = Math.max(1, Math.min(2, parseInt(process.env.VARIANTS || '1', 10)));
const MODEL = process.env.IMAGE_MODEL || 'gpt-image-2';
const INPUT_FIDELITY = (process.env.INPUT_FIDELITY || 'high').toLowerCase();

// 원본(server.js)의 노트북 상주 서버와 달리, Functions 인스턴스는 파일시스템이 읽기전용이라
// 업로드는 반드시 /tmp(os.tmpdir()) 아래에만 써야 한다.
const UPLOAD_DIR = path.join(os.tmpdir(), 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    /^image\/(png|jpe?g|webp)$/i.test(file.mimetype) ? cb(null, true) : cb(new Error('이미지 파일만 업로드할 수 있습니다.'))
});

let _client = null;
function getClient() {
  if (!_client) _client = new OpenAI({
    apiKey: OPENAI_API_KEY.value(),
    timeout: 90_000,
    maxRetries: 0
  });
  return _client;
}

const app = express();
app.use(express.json({ limit: '12mb' }));

/* 장르별 '그림 컨셉' 프롬프트.
   공통 규칙: 글자/문자 절대 금지(한글은 브라우저 캔버스가 입힘), 세로 영화 포스터,
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
   - 한도(429)·일시 서버오류(5xx): 잠깐 기다렸다 자동 재시도(여러 인스턴스 동시 실행 대비) */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function editWithRetry(params) {
  const maxRetries = 4;
  for (let attempt = 0; ; attempt++) {
    try {
      return await getClient().images.edit(params);
    } catch (err) {
      const status = err?.status || err?.response?.status;
      const retryable = status === 429 || (status >= 500 && status < 600);
      if (retryable && attempt < maxRetries) {
        const waitMs = Math.min(1000 * 2 ** attempt, 8000) + Math.floor(Math.random() * 600);
        console.warn(`[retry] ${status} → ${waitMs}ms 후 재시도 (${attempt + 1}/${maxRetries})`);
        await sleep(waitMs);
        continue;
      }
      throw err;
    }
  }
}

async function generateArt(filePath, mimetype, prompt) {
  const mime = /^image\/(png|jpe?g|webp)$/i.test(mimetype || '') ? mimetype : 'image/png';
  const ext = /jpe?g/i.test(mime) ? 'jpg' : (/webp/i.test(mime) ? 'webp' : 'png');
  const image = await toFile(fs.createReadStream(filePath), 'photo.' + ext, { type: mime });
  const baseParams = { model: MODEL, image, prompt, size: ART_SIZE, quality: QUALITY, n: VARIANTS };
  const noQuality = { model: MODEL, image, prompt, size: ART_SIZE, n: VARIANTS };
  const tries = [];
  if (INPUT_FIDELITY === 'high') tries.push({ ...baseParams, input_fidelity: 'high' });
  tries.push(baseParams, noQuality);
  let lastErr;
  // 요청마다 항상 가장 좋은 조합(얼굴보존 high)부터 새로 시도한다.
  // (server.js 원본은 이 시작 지점을 프로세스 전역에 기억해뒀는데, 동시 요청이 겹치면
  //  한 요청의 폴백이 이후 모든 요청에 영구히 적용되는 버그가 있었다 — Functions는
  //  인스턴스가 매번 새로 뜨므로 이 최적화 자체가 무의미해 제거했다.)
  for (let i = 0; i < tries.length; i++) {
    try {
      const result = await editWithRetry(tries[i]);
      const imgs = (result.data || []).map(d => `data:image/png;base64,${d.b64_json}`).filter(Boolean);
      if (imgs.length) return imgs;
      throw new Error('이미지 생성 결과가 비어 있습니다.');
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message || '');
      const paramRejected = err?.status === 400 && /unknown|unsupported|invalid|not (allowed|supported)|input_fidelity|quality/i.test(msg);
      if (paramRejected && i < tries.length - 1) continue;
      throw err;
    }
  }
  throw lastErr;
}

app.get('/health', (req, res) => {
  res.json({ ok: true, hasKey: !!OPENAI_API_KEY.value(), model: MODEL, quality: QUALITY, fidelity: INPUT_FIDELITY, size: ART_SIZE, variants: VARIANTS });
});

app.post('/generate', upload.single('photo'), async (req, res) => {
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
    console.log(`[generate] 완료 ${sec}초  (모델=${MODEL} · 화질=${QUALITY} · 얼굴보존=${INPUT_FIDELITY})`);
    res.json({ images, meta: { genre, mode, seconds: Number(sec) } });
  } catch (err) {
    const status = err?.status || err?.response?.status;
    const raw = String(err?.message || '');
    console.error('[generate]', status || '', raw || err);
    let msg = raw || 'AI 이미지 생성 중 오류가 발생했습니다.';
    if (status === 429) msg = '지금 요청이 몰려 잠시 대기가 필요합니다. 10~20초 후 다시 시도해 주세요.';
    else if (/billing|quota|hard limit/i.test(raw)) msg = 'OpenAI 크레딧 잔액이 부족합니다. platform.openai.com에서 크레딧을 충전해 주세요.';
    else if (status === 401 || /api key|incorrect key/i.test(raw)) msg = 'API 키가 올바르지 않습니다. Firebase 시크릿(OPENAI_API_KEY)을 확인해 주세요.';
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

// GitHub Pages(edutogether.github.io)에서만 호출 가능하도록 CORS 제한.
// 로컬 개발 시에는 5500(Live Server)·8080(firebase serve) 포트도 허용.
const ALLOWED_ORIGINS = [
  /^https:\/\/edutogether\.github\.io$/,
  /^http:\/\/localhost:(5500|8080)$/,
  /^http:\/\/127\.0\.0\.1:(5500|8080)$/
];

export const posterStudio = onRequest(
  {
    region: 'asia-northeast3',
    memory: '512MiB',
    timeoutSeconds: 120,
    concurrency: 1,
    maxInstances: 10,
    secrets: [OPENAI_API_KEY],
    cors: ALLOWED_ORIGINS
  },
  app
);
