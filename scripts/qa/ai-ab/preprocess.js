/* AI 품질 A/B — 후보 전처리(C). 브라우저 캔버스만 쓴다(부스 노트북에 설치 없음). 시험에서 나아진 것이 확인돼야 앱에 옮긴다.
   window.aiqPreprocess(canvas) → { canvas, quality, stats, applied }
   - 밝기: «장면 전체가 어두울 때»만 고친다 — 전체 평균 < 80 이고 사람이 서는 가운데 영역(가로 20~80% · 세로 10~60%) 평균 < 65.
     얼굴 밝기나 좁은 대비로는 판단하지 않는다: 피부가 어두운 사람(실측 얼굴 평균 58~65)이나 회색 배경 사진을 «어둡다»로 읽어
     피부색을 밝게 바꾸게 된다(2026-10-25 실제 사진 24장에서 대비 기준이 그런 사진을 골랐다). 고칠 때는 레벨을 펴고 감마로 평균을
     122 쪽으로 옮긴다. 이득은 최대 2배 · 감마 0.6까지, 세 채널에 같은 곡선(색조 유지).
   - JPEG 품질 0.85 → 0.92: 얼굴 윤곽 · 눈가의 블록 흔적을 줄인다(크기는 늘지만 해상도 · 입력 토큰 수는 그대로 1024×768).
   - 흐림(라플라시안 분산)은 기록만 한다 — 흐린 사진은 보정으로 되살릴 수 없어 «다시 찍기» 안내 후보로만 본다. */
window.aiqPreprocess = function aiqPreprocess(src) {
  const w = src.width, h = src.height;
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const g = out.getContext('2d', { willReadFrequently: true }); g.drawImage(src, 0, 0);
  const id = g.getImageData(0, 0, w, h), d = id.data, n = w * h;
  const hist = new Uint32Array(256); let sum = 0;
  const luma = new Float32Array(n);
  for (let i = 0, k = 0; i < d.length; i += 4, k++) { const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; luma[k] = y; hist[y | 0]++; sum += y; }
  const pct = (p) => { let acc = 0; const t = n * p; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= t) return v; } return 255; };
  const mean = sum / n, p2 = pct(0.02), p98 = pct(0.98);
  // 흐림: 3×3 라플라시안 분산(가운데 영역만, 가장자리 제외)
  let lsum = 0, lsq = 0, ln = 0;
  for (let y = 1; y < h - 1; y += 2) for (let x = 1; x < w - 1; x += 2) { const k = y * w + x; const v = 4 * luma[k] - luma[k - 1] - luma[k + 1] - luma[k - w] - luma[k + w]; lsum += v; lsq += v * v; ln++; }
  const blurVar = lsq / ln - (lsum / ln) ** 2;
  // 가운데 영역(사람이 서는 자리) 평균
  let zsum = 0, zn = 0;
  for (let y = Math.floor(h * 0.1); y < h * 0.6; y++) for (let x = Math.floor(w * 0.2); x < w * 0.8; x++) { zsum += luma[y * w + x]; zn++; }
  const zoneMean = zsum / zn;
  const applied = [];
  let lo = 0, hi = 255, gamma = 1;
  if (mean < 80 && zoneMean < 65) {
    lo = Math.min(p2, 40); hi = Math.max(p98, lo + 128);   // 레벨 펴기 — 이득 최대 2배
    const meanAfterLevels = Math.max(1, Math.min(254, ((mean - lo) / (hi - lo)) * 255));
    gamma = Math.max(0.6, Math.min(1, Math.log(122 / 255) / Math.log(meanAfterLevels / 255)));
    const lut = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) lut[v] = 255 * Math.pow(Math.min(1, Math.max(0, (v - lo) / (hi - lo))), gamma);
    for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
    g.putImageData(id, 0, 0);
    applied.push(`levels ${lo}-${hi}`, `gamma ${gamma.toFixed(2)}`);
  }
  applied.push('jpeg 0.92');
  return { canvas: out, quality: 0.92, stats: { mean: Math.round(mean), zoneMean: Math.round(zoneMean), p2, p98, blurVar: Math.round(blurVar) }, applied };
};
