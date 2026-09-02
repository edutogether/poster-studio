/* ────────────────────────────────────────────────────────────────────
   배경 파티클 — 극장 안을 떠다니는 금빛 먼지/조명 입자. 순수 canvas 2D,
   외부 라이브러리 없음(2026-09-03, 대표 지시로 디자인 밀도를 포털/클래스케이드
   수준까지 끌어올리는 작업의 일부). 매 프레임 shadowBlur를 쓰면 비용이 커서
   (booth 노트북 저사양 대비), 발광 효과는 미리 한 번만 그려둔 스프라이트
   (오프스크린 캔버스에 radial gradient)를 drawImage로 재사용해 값싸게 낸다.
   `prefers-reduced-motion`이면 정지된 한 프레임만 그리고 애니메이션 루프를
   아예 안 돈다. ──────────────────────────────────────────────────────── */
(function () {
  const canvas = document.getElementById('bgParticles');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const SPRITE_SIZE = 48;
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = SPRITE_SIZE;
  const sctx = sprite.getContext('2d');
  const g = sctx.createRadialGradient(SPRITE_SIZE / 2, SPRITE_SIZE / 2, 0, SPRITE_SIZE / 2, SPRITE_SIZE / 2, SPRITE_SIZE / 2);
  g.addColorStop(0, 'rgba(255,238,190,1)');
  g.addColorStop(0.22, 'rgba(255,232,170,0.95)');
  g.addColorStop(0.55, 'rgba(247,217,137,0.55)');
  g.addColorStop(1, 'rgba(233,185,73,0)');
  sctx.fillStyle = g;
  sctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);

  let W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  const COUNT = 80;
  const particles = Array.from({ length: COUNT }, () => makeParticle(true));
  function makeParticle(initial) {
    const size = 6 + Math.random() * 14;
    return {
      x: Math.random() * W,
      y: initial ? Math.random() * H : H + size,
      size,
      speed: 6 + Math.random() * 14, // px/초, 위로 떠오름
      sway: 8 + Math.random() * 18,
      swaySpeed: 0.3 + Math.random() * 0.5,
      phase: Math.random() * Math.PI * 2,
      alpha: 0.55 + Math.random() * 0.45
    };
  }

  function drawFrame() {
    ctx.clearRect(0, 0, W, H);
    for (const p of particles) {
      const dx = Math.sin(p.phase) * p.sway;
      const cx = p.x + dx, cy = p.y;
      // 소프트 후광(스프라이트) + 또렷한 밝은 중심점을 같이 그려 작은 크기에서도
      // 화면(특히 압축된 스크린샷)에서 확실히 보이게 한다.
      ctx.globalAlpha = p.alpha;
      ctx.drawImage(sprite, cx - p.size, cy - p.size, p.size * 2, p.size * 2);
      ctx.globalAlpha = Math.min(1, p.alpha + 0.25);
      ctx.fillStyle = '#fff6df';
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(1.2, p.size * 0.16), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  if (reduceMotion) {
    drawFrame();
    return;
  }

  let last = performance.now();
  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    for (const p of particles) {
      p.y -= p.speed * dt;
      p.phase += p.swaySpeed * dt;
      if (p.y < -p.size * 2) Object.assign(p, makeParticle(false));
    }
    drawFrame();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
