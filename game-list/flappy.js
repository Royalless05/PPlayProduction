/* =========================================================
   FLAPPY BIRD — Vanilla JavaScript
   Kontrol: Klik / Sentuh / Spasi / Panah Atas
   ========================================================= */
(() => {
  'use strict';

  // ---------- Elemen DOM ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const startScreen  = document.getElementById('startScreen');
  const overScreen   = document.getElementById('gameOverScreen');
  const finalScoreEl = document.getElementById('finalScore');
  const finalBestEl  = document.getElementById('finalBest');
  const newBestEl    = document.getElementById('newBest');
  const medalEl      = document.getElementById('medal');
  const bestStartEl  = document.getElementById('bestStart');
  const startBtn     = document.getElementById('startBtn');
  const restartBtn   = document.getElementById('restartBtn');

  // ---------- Konstanta ----------
  const W = canvas.width;
  const H = canvas.height;
  const GROUND_H   = 80;    // tinggi tanah
  const GRAVITY    = 0.45;  // percepatan jatuh
  const FLAP_V     = -7.6;  // kecepatan lompat
  const PIPE_W     = 66;    // lebar pipa
  const PIPE_GAP   = 155;   // celah antar pipa
  const PIPE_EVERY = 95;    // frame antar kemunculan pipa
  const PIPE_SPEED = 2.6;   // kecepatan gerak pipa
  const BIRD_X     = 90;    // posisi x burung
  const BIRD_R     = 14;    // radius burung

  // ---------- State ----------
  let state = 'start';      // 'start' | 'play' | 'over'
  let bird, pipes, particles, clouds;
  let frames = 0;
  let score = 0;
  let groundX = 0;
  let flash = 0;            // efek kedip putih saat mati
  let overAt = 0;           // waktu game over (cegah restart tak sengaja)
  let best = 0;
  try { best = Number(localStorage.getItem('flappy-best')) || 0; } catch (e) {}
  bestStartEl.textContent = best;

  // ---------- Efek suara (Web Audio API, tanpa file eksternal) ----------
  let actx = null;
  function beep(freq, dur, type, vol, slideTo) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const t = actx.currentTime;
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(actx.destination);
      o.start(t);
      o.stop(t + dur);
    } catch (e) { /* audio tidak tersedia, abaikan */ }
  }
  const sfxFlap  = () => beep(480, 0.08, 'square', 0.10, 760);
  const sfxScore = () => { beep(880, 0.07, 'square', 0.10); setTimeout(() => beep(1318, 0.09, 'square', 0.10), 70); };
  const sfxHit   = () => beep(220, 0.18, 'sawtooth', 0.18, 70);

  // ---------- Helper ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Deteksi tabrakan lingkaran (burung) vs persegi (pipa)
  function circleHitsRect(cx, cy, r, rx, ry, rw, rh) {
    const nx = clamp(cx, rx, rx + rw);
    const ny = clamp(cy, ry, ry + rh);
    const dx = cx - nx;
    const dy = cy - ny;
    return dx * dx + dy * dy < r * r;
  }

  // ---------- Inisialisasi / reset ----------
  function reset() {
    bird = { y: H / 2, vel: 0, rot: 0, wing: 0 };
    pipes = [];
    particles = [];
    clouds = Array.from({ length: 5 }, () => ({
      x: Math.random() * W,
      y: 40 + Math.random() * 180,
      s: 0.6 + Math.random() * 0.9,
      spd: 0.2 + Math.random() * 0.4,
    }));
    frames = 0;
    score = 0;
    flash = 0;
  }

  // ---------- Alur permainan ----------
  function startGame() {
    reset();
    state = 'play';
    startScreen.classList.add('hidden');
    overScreen.classList.add('hidden');
  }

  function flap() {
    if (state === 'start') { startGame(); return; }
    if (state !== 'play') return;
    bird.vel = FLAP_V;
    bird.wing = 1;
    sfxFlap();
    for (let i = 0; i < 3; i++) {
      particles.push({
        x: BIRD_X - 12,
        y: bird.y + 10,
        vx: -0.8 - Math.random() * 1.2,
        vy: 0.4 + Math.random() * 0.8,
        r: 2 + Math.random() * 2,
        life: 18 + Math.random() * 10,
        maxLife: 28,
      });
    }
  }

  function gameOver() {
    if (state !== 'play') return;
    state = 'over';
    overAt = performance.now();
    flash = 1;
    sfxHit();

    const isNew = score > best;
    if (isNew) {
      best = score;
      try { localStorage.setItem('flappy-best', best); } catch (e) {}
    }
    finalScoreEl.textContent = score;
    finalBestEl.textContent = best;
    bestStartEl.textContent = best;
    newBestEl.classList.toggle('hidden', !isNew);
    medalEl.textContent =
      score >= 40 ? '🏆' : score >= 30 ? '🥇' : score >= 20 ? '🥈' : score >= 10 ? '🥉' : '🪶';
    overScreen.classList.remove('hidden');
  }

  // ---------- Update logika ----------
  function spawnPipe() {
    const margin = 70;
    const top = margin + Math.random() * (H - GROUND_H - PIPE_GAP - margin * 2);
    pipes.push({ x: W + 10, top, passed: false });
  }

  function update() {
    frames++;
    groundX = (groundX - PIPE_SPEED) % 24;

    // Awan bergerak pelan (parallax)
    for (const c of clouds) {
      c.x -= c.spd;
      if (c.x < -90) { c.x = W + 90; c.y = 40 + Math.random() * 180; }
    }

    // Burung melayang di layar awal
    if (state === 'start') {
      bird.y = H / 2 + Math.sin(frames / 18) * 8;
    }

    if (state === 'play') {
      // Fisika burung
      bird.vel += GRAVITY;
      bird.y += bird.vel;
      bird.wing *= 0.82;
      bird.rot = clamp(bird.vel / 12, -0.45, 1.35);

      // Pipa
      if (frames % PIPE_EVERY === 0) spawnPipe();
      for (const p of pipes) p.x -= PIPE_SPEED;
      pipes = pipes.filter((p) => p.x + PIPE_W > -20);

      // Skor: pipa berhasil dilewati
      for (const p of pipes) {
        if (!p.passed && p.x + PIPE_W < BIRD_X - BIRD_R) {
          p.passed = true;
          score++;
          sfxScore();
        }
      }

      // Plafon & tanah
      if (bird.y - BIRD_R < 0) { bird.y = BIRD_R; bird.vel = 0; }
      if (bird.y + BIRD_R >= H - GROUND_H) {
        bird.y = H - GROUND_H - BIRD_R;
        gameOver();
      }

      // Tabrakan dengan pipa
      for (const p of pipes) {
        const bottomY = p.top + PIPE_GAP;
        const bottomH = H - GROUND_H - bottomY;
        if (
          circleHitsRect(BIRD_X, bird.y, BIRD_R - 2, p.x, 0, PIPE_W, p.top) ||
          circleHitsRect(BIRD_X, bird.y, BIRD_R - 2, p.x, bottomY, PIPE_W, bottomH)
        ) { gameOver(); break; }
      }
    } else if (state === 'over') {
      // Burung jatuh ke tanah setelah mati
      bird.vel += GRAVITY;
      bird.y = Math.min(bird.y + bird.vel, H - GROUND_H - BIRD_R);
      bird.rot = Math.min(bird.rot + 0.06, Math.PI / 2);
    }

    // Partikel
    for (const pt of particles) { pt.x += pt.vx; pt.y += pt.vy; pt.life--; }
    particles = particles.filter((p) => p.life > 0);

    if (flash > 0) flash -= 0.06;
  }

  // ---------- Gambar ----------
  function draw() {
    // Langit
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#54c9d8');
    sky.addColorStop(1, '#aee6ee');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Matahari
    ctx.fillStyle = 'rgba(255, 245, 180, 0.9)';
    ctx.beginPath();
    ctx.arc(W - 70, 80, 34, 0, Math.PI * 2);
    ctx.fill();

    // Awan
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const c of clouds) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 18 * c.s, 0, Math.PI * 2);
      ctx.arc(c.x + 20 * c.s, c.y - 8 * c.s, 22 * c.s, 0, Math.PI * 2);
      ctx.arc(c.x + 42 * c.s, c.y, 16 * c.s, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pipa
    for (const p of pipes) drawPipe(p);

    // Tanah
    drawGround();

    // Partikel
    for (const pt of particles) {
      ctx.globalAlpha = Math.max(pt.life / pt.maxLife, 0);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Burung
    drawBird();

    // Skor saat bermain
    if (state === 'play') {
      ctx.font = 'bold 44px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.strokeText(score, W / 2, 80);
      ctx.fillStyle = '#fff';
      ctx.fillText(score, W / 2, 80);
    }

    // Kedip putih saat mati
    if (flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${flash * 0.7})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawPipe(p) {
    const bottomY = p.top + PIPE_GAP;
    const bottomH = H - GROUND_H - bottomY;

    const g = ctx.createLinearGradient(p.x, 0, p.x + PIPE_W, 0);
    g.addColorStop(0, '#5ea832');
    g.addColorStop(0.5, '#8fd64f');
    g.addColorStop(1, '#4a7d24');
    ctx.fillStyle = g;

    // Badan pipa atas & bawah
    ctx.fillRect(p.x, 0, PIPE_W, p.top);
    ctx.fillRect(p.x, bottomY, PIPE_W, bottomH);

    // Bibir pipa
    ctx.fillRect(p.x - 4, p.top - 26, PIPE_W + 8, 26);
    ctx.fillRect(p.x - 4, bottomY, PIPE_W + 8, 26);

    // Garis tepi
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(p.x, -4, PIPE_W, p.top + 4);
    ctx.strokeRect(p.x - 4, p.top - 26, PIPE_W + 8, 26);
    ctx.strokeRect(p.x, bottomY, PIPE_W, bottomH + 4);
    ctx.strokeRect(p.x - 4, bottomY, PIPE_W + 8, 26);
  }

  function drawGround() {
    const gy = H - GROUND_H;
    ctx.fillStyle = '#ded895';
    ctx.fillRect(0, gy, W, GROUND_H);

    // Rumah pinggir jalan + pola diagonal bergerak
    ctx.fillStyle = '#7ac74a';
    ctx.fillRect(0, gy, W, 22);
    ctx.fillStyle = '#5ea832';
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, gy, W, 22);
    ctx.clip();
    for (let x = groundX - 24; x < W + 24; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, gy + 22);
      ctx.lineTo(x + 12, gy);
      ctx.lineTo(x + 24, gy);
      ctx.lineTo(x + 12, gy + 22);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, gy + 22, W, 3);
  }

  function drawBird() {
    ctx.save();
    ctx.translate(BIRD_X, bird.y);
    ctx.rotate(bird.rot);

    // Badan
    ctx.fillStyle = '#ffd93b';
    ctx.strokeStyle = '#b8860b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, BIRD_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Sayap (mengepak saat lompat)
    const up = bird.wing > 0.3;
    ctx.fillStyle = '#f6b93b';
    ctx.beginPath();
    ctx.ellipse(-4, up ? -6 : 4, 8, 5, up ? -0.6 : 0.5, 0, Math.PI * 2);
    ctx.fill();

    // Mata
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(6, -5, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(7.5, -5, 2.2, 0, Math.PI * 2);
    ctx.fill();

    // Paruh
    ctx.fillStyle = '#ff7f2a';
    ctx.beginPath();
    ctx.moveTo(10, -1);
    ctx.lineTo(20, 2);
    ctx.lineTo(10, 6);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  // ---------- Input ----------
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      if (state === 'over') {
        if (performance.now() - overAt > 500) startGame();
      } else {
        flap();
      }
    }
  });

  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); flap(); });
  startScreen.addEventListener('pointerdown', () => startGame());
  overScreen.addEventListener('pointerdown', () => {
    if (performance.now() - overAt > 500) startGame();
  });

  startBtn.addEventListener('click', startGame);
  restartBtn.addEventListener('click', startGame);

  // ---------- Game loop ----------
  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  reset();
  loop();

  // Hook kecil untuk debugging/otomasi (tidak mengganggu permainan)
  window.__flappy = {
    getState: () => state,
    getScore: () => score,
    getPipes: () => pipes.length,
    birdY: () => bird.y,
    pipeInfo: () => pipes.map((p) => ({ x: p.x, top: p.top })),
    flap,
    startGame,
  };
})();
