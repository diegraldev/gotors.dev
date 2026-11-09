(() => {
  const canvas = document.getElementById("mesh");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const TARGET_DOTS = 6500;
  const MIN_GAP = 16;
  const ACCENT = "34, 211, 238";
  const MAX_TRAIL = 5;
  const MAX_SHIFT = 14;
  const SATELLITES = [
    { phase: 0, speed: 0.005, dist: 58, r: 120, s: 0.45, pull: 9, dir: 1 },
    { phase: 2.4, speed: -0.008, dist: 92, r: 110, s: 0.3, pull: 7, dir: -1 },
    { phase: 4.6, speed: 0.011, dist: 38, r: 85, s: 0.22, pull: 5, dir: 1 },
  ];

  let width = 0;
  let height = 0;
  let gap = MIN_GAP;
  let dots = [];
  let grid = [];
  let cols = 0;
  let rows = 0;
  let raf = 0;
  let lastTime = 0;
  let lastMove = 0;
  let phase = 0;
  let dpr = 1;

  const pointer = { x: 0, y: 0, active: false };
  const lastSpawn = { x: -9999, y: -9999 };
  const mainWell = { x: 0, y: 0, s: 1, r: 170, pull: 11, dir: 1 };
  const satWells = SATELLITES.map((sat) => ({
    x: 0,
    y: 0,
    s: sat.s,
    r: sat.r,
    pull: sat.pull,
    dir: sat.dir,
  }));
  const activeWells = [];
  let wells = [];

  function build() {
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    gap = Math.max(MIN_GAP, Math.sqrt((width * height) / TARGET_DOTS));

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    cols = Math.ceil(width / gap) + 1;
    rows = Math.ceil(height / gap) + 1;

    const offsetX = (width - (cols - 1) * gap) / 2;
    const offsetY = (height - (rows - 1) * gap) / 2;

    dots = [];
    grid = [];

    for (let row = 0; row < rows; row++) {
      const line = [];
      for (let col = 0; col < cols; col++) {
        const dot = {
          bx: offsetX + col * gap,
          by: offsetY + row * gap,
          x: 0,
          y: 0,
          a: 0,
        };
        dot.x = dot.bx;
        dot.y = dot.by;
        line.push(dot);
        dots.push(dot);
      }
      grid.push(line);
    }

    draw();
  }

  function connect(a, b, alpha) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const limit = gap * 1.85;
    if (dx * dx + dy * dy > limit * limit) return;

    ctx.strokeStyle = "rgba(" + ACCENT + ", " + alpha.toFixed(3) + ")";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const dot = grid[row][col];
        if (dot.a < 0.02) continue;

        if (col + 1 < cols) {
          const right = grid[row][col + 1];
          if (right.a > 0.02) {
            connect(dot, right, Math.min(dot.a, right.a) * 0.28);
          }
        }

        if (row + 1 < rows) {
          const down = grid[row + 1][col];
          if (down.a > 0.02) {
            connect(dot, down, Math.min(dot.a, down.a) * 0.28);
          }
        }
      }
    }

    for (let i = 0; i < dots.length; i++) {
      const dot = dots[i];
      if (dot.a < 0.02) continue;

      ctx.fillStyle =
        "rgba(" + ACCENT + ", " + Math.min(1, 0.22 + dot.a * 0.85).toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, 0.55 + dot.a * 0.95, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function addTrailWell() {
    wells.push({
      x: pointer.x + (Math.random() * 2 - 1) * 30,
      y: pointer.y + (Math.random() * 2 - 1) * 30,
      s: 0.3 + Math.random() * 0.25,
      r: 65 + Math.random() * 50,
      pull: 5 + Math.random() * 3,
      dir: Math.random() < 0.5 ? -1 : 1,
    });
    if (wells.length > MAX_TRAIL) wells.shift();
  }

  function tick() {
    raf = 0;

    const now = performance.now();
    const dt = Math.min(48, now - lastTime || 16.667) / 16.667;
    lastTime = now;

    const ease = 1 - Math.pow(0.86, dt);
    const easeA = 1 - Math.pow(0.88, dt);
    const decay = Math.pow(0.95, dt);
    const orbiting = pointer.active && now - lastMove < 2600;

    if (orbiting) phase += dt * 0.045;

    activeWells.length = 0;

    if (pointer.active) {
      mainWell.x = pointer.x;
      mainWell.y = pointer.y;
      activeWells.push(mainWell);

      for (let s = 0; s < SATELLITES.length; s++) {
        const sat = SATELLITES[s];
        const well = satWells[s];
        const angle = sat.phase + phase * sat.speed;
        well.x = pointer.x + Math.cos(angle) * sat.dist;
        well.y = pointer.y + Math.sin(angle) * sat.dist * 0.75;
        activeWells.push(well);
      }
    }

    for (let w = wells.length - 1; w >= 0; w--) {
      wells[w].s *= decay;
      if (wells[w].s < 0.03) wells.splice(w, 1);
      else activeWells.push(wells[w]);
    }

    let energy = 0;

    for (let i = 0; i < dots.length; i++) {
      const dot = dots[i];
      let forceSum = 0;
      let pullX = 0;
      let pullY = 0;

      for (let k = 0; k < activeWells.length; k++) {
        const well = activeWells[k];
        const dx = well.x - dot.bx;
        const dy = well.y - dot.by;
        const distSq = dx * dx + dy * dy;
        const radiusSq = well.r * well.r;

        if (distSq < radiusSq && distSq > 0.0001) {
          const dist = Math.sqrt(distSq);
          const t = dist / well.r;
          const fall = 1 - t;
          const envelope = Math.sin(Math.PI * t);
          const strength = envelope * well.s;
          const ux = dx / dist;
          const uy = dy / dist;

          forceSum += fall * well.s;
          pullX += (ux + -uy * 0.35 * well.dir) * strength * well.pull;
          pullY += (uy + ux * 0.35 * well.dir) * strength * well.pull;
        }
      }

      const targetA = Math.min(1, forceSum);

      const pullMag = Math.sqrt(pullX * pullX + pullY * pullY);
      if (pullMag > MAX_SHIFT) {
        pullX = (pullX / pullMag) * MAX_SHIFT;
        pullY = (pullY / pullMag) * MAX_SHIFT;
      }

      const targetX = dot.bx + pullX;
      const targetY = dot.by + pullY;

      const nx = dot.x + (targetX - dot.x) * ease;
      const ny = dot.y + (targetY - dot.y) * ease;
      const na = dot.a + (targetA - dot.a) * easeA;

      energy += Math.abs(nx - dot.x) + Math.abs(ny - dot.y) + Math.abs(na - dot.a);

      dot.x = nx;
      dot.y = ny;
      dot.a = na;
    }

    const settled = energy < 0.03;

    if (settled && !pointer.active && wells.length === 0) {
      for (let i = 0; i < dots.length; i++) {
        dots[i].x = dots[i].bx;
        dots[i].y = dots[i].by;
        dots[i].a = 0;
      }
      draw();
      return;
    }

    draw();

    if (!settled || wells.length > 0 || orbiting) {
      raf = requestAnimationFrame(tick);
    }
  }

  function ensureLoop() {
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function spawnCheck() {
    const dx = pointer.x - lastSpawn.x;
    const dy = pointer.y - lastSpawn.y;
    if (Math.sqrt(dx * dx + dy * dy) > 30) {
      lastSpawn.x = pointer.x;
      lastSpawn.y = pointer.y;
      addTrailWell();
    }
  }

  function onMove(event) {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.active = true;
    lastMove = performance.now();
    spawnCheck();
    ensureLoop();
  }

  function onLeave() {
    pointer.active = false;
    ensureLoop();
  }

  function onResize() {
    build();
    lastSpawn.x = -9999;
    ensureLoop();
  }

  if (reducedMotion.matches) {
    return;
  }

  build();
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerdown", onMove, { passive: true });
  window.addEventListener("pointerup", (event) => {
    if (event.pointerType !== "mouse") onLeave();
  });
  document.addEventListener("pointerleave", onLeave);
  window.addEventListener("blur", onLeave);
  window.addEventListener("resize", onResize);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    } else {
      ensureLoop();
    }
  });
})();
