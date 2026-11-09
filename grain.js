(() => {
  const canvas = document.getElementById("grain");
  const shell = document.querySelector(".shell");
  if (!canvas || !shell) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const COLORS = [
    [120, 228, 255],
    [222, 246, 255],
    [130, 255, 236],
  ];
  const ALPHA = [0.1, 0.2, 0.34, 0.52, 0.78];
  const PAD = 6;
  const MAX_LIFE = 120;
  const MIN_LIFE = 52;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let maxParticles = 1600;
  let particles = [];
  let pool = [];
  let raf = 0;
  let lastTime = 0;
  let lastFrame = 0;
  let clock = 0;
  let lastMove = 0;
  let boxDirty = true;
  let enabled = true;

  const content = { x: 0, y: 0, w: 0, h: 0 };
  const pointer = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    active: false,
    inside: false,
  };
  const trail = { x: -1, y: -1 };
  let idleTick = 0;

  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function measure() {
    const rect = shell.getBoundingClientRect();
    const styles = getComputedStyle(shell);
    const padL = parseFloat(styles.paddingLeft) || 0;
    const padR = parseFloat(styles.paddingRight) || 0;
    const padT = parseFloat(styles.paddingTop) || 0;
    const padB = parseFloat(styles.paddingBottom) || 0;

    content.x = rect.left + padL;
    content.y = rect.top + padT;
    content.w = Math.max(0, rect.width - padL - padR);
    content.h = Math.max(0, rect.height - padT - padB);
    boxDirty = false;
  }

  function insideBox(x, y) {
    return (
      x > content.x &&
      x < content.x + content.w &&
      y > content.y &&
      y < content.y + content.h
    );
  }

  function surface(x, y) {
    const left = x - content.x;
    const right = content.x + content.w - x;
    const top = y - content.y;
    const bottom = content.y + content.h - y;
    const min = Math.min(left, right, top, bottom);

    if (min === left) return { x: content.x - PAD, y, nx: -1, ny: 0 };
    if (min === right)
      return { x: content.x + content.w + PAD, y, nx: 1, ny: 0 };
    if (min === top) return { x, y: content.y - PAD, nx: 0, ny: -1 };
    return { x, y: content.y + content.h + PAD, nx: 0, ny: 1 };
  }

  function emit(x, y, vx, vy, glow) {
    const particle = pool.pop() || {};

    particle.x = x;
    particle.y = y;
    particle.vx = vx;
    particle.vy = vy;
    particle.life = rand(MIN_LIFE, MAX_LIFE);
    particle.max = particle.life;
    particle.age = 0;
    particle.size = 0.5 + Math.pow(Math.random(), 2.2) * 1.6;
    particle.glow = glow || Math.random() < 0.045;
    particle.seed = Math.random() * Math.PI * 2;
    particle.color = Math.random() < 0.16 ? 2 : Math.random() < 0.45 ? 1 : 0;

    if (particle.glow) {
      particle.size += 0.7;
      particle.life += 18;
      particle.max = particle.life;
    }

    particles.push(particle);
  }

  function burst(x, y, amount, speed) {
    for (let i = 0; i < amount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const power = rand(0.4, 1) * speed;
      emit(
        x + Math.cos(angle) * 4,
        y + Math.sin(angle) * 4,
        Math.cos(angle) * power,
        Math.sin(angle) * power,
        Math.random() < 0.2
      );
    }
  }

  function spawnAt(x, y, vx, vy) {
    if (particles.length >= maxParticles) return;

    let px = x;
    let py = y;
    let nx = 0;
    let ny = 0;

    if (insideBox(x, y)) {
      const edge = surface(x, y);
      px = edge.x;
      py = edge.y;
      nx = edge.nx;
      ny = edge.ny;
    }

    const speed = Math.sqrt(vx * vx + vy * vy);
    const spread = speed < 0.6 ? Math.PI * 2 : rand(0.8, 1.9);
    const base = speed < 0.6 ? Math.PI * 2 : Math.atan2(vy, vx);
    const angle = speed < 0.6 ? Math.random() * Math.PI * 2 : base + rand(-spread, spread);
    const kick = speed < 0.6 ? rand(0.15, 0.5) : rand(0.35, 1.1) + speed * 0.028;

    let mx = Math.cos(angle) * kick;
    let my = Math.sin(angle) * kick;

    if (nx || ny) {
      mx += nx * rand(0.4, 1.1);
      my += ny * rand(0.4, 1.1);
    }

    emit(px + rand(-3, 3), py + rand(-3, 3), mx, my);
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const area = width * height;
    enabled = width >= 720;
    maxParticles = area > 2000000 ? 1600 : 2200;

    measure();

    if (!enabled) stop();
    else clear();
  }

  function stop() {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }

    for (let i = 0; i < particles.length; i++) pool.push(particles[i]);

    particles = [];
    pointer.active = false;
    pointer.inside = false;
    trail.x = -1;
    trail.y = -1;
    clear();
  }

  function clear() {
    ctx.clearRect(0, 0, width, height);
  }

  function update(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];

      const flow =
        Math.sin(p.y * 0.011 + clock * 0.0011 + p.seed) +
        Math.cos(p.x * 0.009 - clock * 0.0013 + p.seed * 1.7);

      p.vx += Math.cos(flow * 3.1) * 0.028 * dt;
      p.vy += Math.sin(flow * 3.1) * 0.028 * dt + 0.007 * dt;

      if (pointer.active) {
        const dx = p.x - pointer.x;
        const dy = p.y - pointer.y;
        const dist2 = dx * dx + dy * dy;

        if (dist2 < 8100) {
          const dist = Math.sqrt(dist2) || 1;
          const falloff = 1 - dist / 90;
          p.vx += (-dy / dist) * falloff * 0.16 * dt;
          p.vy += (dx / dist) * falloff * 0.16 * dt;
        }
      }

      const drag = Math.pow(0.955, dt);
      p.vx *= drag;
      p.vy *= drag;

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (insideBox(p.x, p.y)) {
        const edge = surface(p.x, p.y);
        p.x = edge.x;
        p.y = edge.y;

        const vn = p.vx * edge.nx + p.vy * edge.ny;
        if (vn < 0) {
          p.vx -= 1.5 * vn * edge.nx;
          p.vy -= 1.5 * vn * edge.ny;
        }
      }

      p.age += dt;
      p.life -= dt;

      if (
        p.life <= 0 ||
        p.x < -40 ||
        p.x > width + 40 ||
        p.y < -40 ||
        p.y > height + 40
      ) {
        pool.push(p);
        particles[i] = particles[particles.length - 1];
        particles.pop();
      }
    }
  }

  function draw() {
    clear();

    if (!particles.length) return;

    ctx.globalCompositeOperation = "lighter";

    for (let buzz = 0; buzz < 3; buzz++) {
      const color = COLORS[buzz];

      for (let bucket = 0; bucket < ALPHA.length; bucket++) {
        let open = false;

        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          if (p.color !== buzz) continue;

          const fadeIn = Math.min(1, p.age / 7);
          const fadeOut = Math.min(1, p.life / (p.max * 0.55));
          let alpha = fadeIn * fadeOut;

          if (p.glow) alpha *= 0.8 + Math.sin(p.age * 0.35 + p.seed) * 0.2;

          const level = Math.min(
            ALPHA.length - 1,
            Math.floor(alpha * ALPHA.length)
          );
          if (level !== bucket) continue;

          const radius = p.size * (0.55 + 0.45 * fadeOut);

          if (!open) {
            ctx.beginPath();
            open = true;
          }

          ctx.moveTo(p.x + radius, p.y);
          ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        }

        if (open) {
          ctx.fillStyle =
            "rgba(" +
            color[0] +
            ", " +
            color[1] +
            ", " +
            color[2] +
            ", " +
            ALPHA[bucket] +
            ")";
          ctx.fill();
        }
      }
    }

    ctx.globalCompositeOperation = "source-over";
  }

  function frame(now) {
    raf = 0;

    if (now - lastFrame < 1000 / 60) {
      raf = requestAnimationFrame(frame);
      return;
    }

    const dt = Math.min(42, now - lastTime || 16.667) / 16.667;
    lastTime = now;
    lastFrame = now;
    clock = now;

    if (
      pointer.active &&
      !pointer.inside &&
      now - lastMove > 90 &&
      now - lastMove < 4000
    ) {
      idleTick += dt;
      if (idleTick > 2.4) {
        idleTick = 0;
        spawnAt(
          pointer.x + rand(-26, 26),
          pointer.y + rand(-26, 26),
          0,
          0
        );
      }
    }

    update(dt);
    draw();

    if (particles.length || pointer.active) {
      raf = requestAnimationFrame(frame);
    } else {
      clear();
    }
  }

  function start() {
    if (raf) return;
    lastTime = performance.now();
    lastFrame = 0;
    raf = requestAnimationFrame(frame);
  }

  function onMove(event) {
    if (!enabled) return;
    if (boxDirty) measure();

    const now = performance.now();
    const x = event.clientX;
    const y = event.clientY;

    pointer.vx = pointer.vx * 0.55 + (x - pointer.x) * 0.45;
    pointer.vy = pointer.vy * 0.55 + (y - pointer.y) * 0.45;
    pointer.vx = clamp(pointer.vx, -70, 70);
    pointer.vy = clamp(pointer.vy, -70, 70);

    pointer.x = x;
    pointer.y = y;
    pointer.inside = insideBox(x, y);
    pointer.active = !pointer.inside;
    lastMove = now;

    if (pointer.inside) {
      trail.x = x;
      trail.y = y;
      return;
    }

    if (trail.x >= 0) {
      const dx = x - trail.x;
      const dy = y - trail.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const steps = clamp(Math.round(dist / 3), 1, 10);

      for (let i = 0; i < steps; i++) {
        const t = (i + 1) / steps;
        const px = trail.x + dx * t;
        const py = trail.y + dy * t;

        spawnAt(px, py, pointer.vx, pointer.vy);
        if (dist > 14 && Math.random() < 0.45) {
          spawnAt(px, py, pointer.vx, pointer.vy);
        }
      }
    }

    trail.x = x;
    trail.y = y;

    if (!raf) start();
  }

  function onLeave() {
    pointer.active = false;
    pointer.inside = false;
    trail.x = -1;
    trail.y = -1;
  }

  function onDown(event) {
    if (!enabled) return;
    if (boxDirty) measure();

    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.inside = insideBox(pointer.x, pointer.y);
    pointer.active = !pointer.inside;

    if (pointer.inside) return;

    burst(pointer.x, pointer.y, 60, 3);

    if (!raf) start();
  }

  function onScroll() {
    boxDirty = true;
  }

  function onResize() {
    resize();
    if (particles.length) start();
  }

  if (reducedMotion.matches) return;

  resize();

  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerdown", onDown, { passive: true });
  window.addEventListener("pointerup", (event) => {
    if (event.pointerType !== "mouse") onLeave();
  });
  document.addEventListener("pointerleave", onLeave);
  window.addEventListener("blur", onLeave);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    } else if (particles.length || pointer.active) {
      start();
    }
  });
})();
