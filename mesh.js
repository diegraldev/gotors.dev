(() => {
  const canvas = document.getElementById("mesh");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const GAP = 32;
  const RADIUS = 150;
  const PULL = 18;
  const ACCENT = "34, 211, 238";

  let width = 0;
  let height = 0;
  let dots = [];
  let grid = [];
  let cols = 0;
  let rows = 0;
  let raf = 0;
  let dpr = 1;

  const pointer = { x: -9999, y: -9999, active: false };

  function build() {
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    cols = Math.ceil(width / GAP) + 1;
    rows = Math.ceil(height / GAP) + 1;

    const offsetX = (width - (cols - 1) * GAP) / 2;
    const offsetY = (height - (rows - 1) * GAP) / 2;

    dots = [];
    grid = [];

    for (let row = 0; row < rows; row++) {
      const line = [];
      for (let col = 0; col < cols; col++) {
        const dot = {
          bx: offsetX + col * GAP,
          by: offsetY + row * GAP,
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

  function draw() {
    ctx.clearRect(0, 0, width, height);

    // Connections between active neighbours: a small mesh around the cursor.
    ctx.lineWidth = 1;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const dot = grid[row][col];
        if (dot.a < 0.08) continue;

        if (col + 1 < cols) {
          const right = grid[row][col + 1];
          if (right.a > 0.08) {
            const alpha = Math.min(dot.a, right.a) * 0.3;
            ctx.strokeStyle = "rgba(" + ACCENT + ", " + alpha.toFixed(3) + ")";
            ctx.beginPath();
            ctx.moveTo(dot.x, dot.y);
            ctx.lineTo(right.x, right.y);
            ctx.stroke();
          }
        }

        if (row + 1 < rows) {
          const down = grid[row + 1][col];
          if (down.a > 0.08) {
            const alpha = Math.min(dot.a, down.a) * 0.3;
            ctx.strokeStyle = "rgba(" + ACCENT + ", " + alpha.toFixed(3) + ")";
            ctx.beginPath();
            ctx.moveTo(dot.x, dot.y);
            ctx.lineTo(down.x, down.y);
            ctx.stroke();
          }
        }
      }
    }

    for (let i = 0; i < dots.length; i++) {
      const dot = dots[i];

      ctx.fillStyle = "rgba(250, 250, 250, 0.18)";
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, 0.9, 0, Math.PI * 2);
      ctx.fill();

      if (dot.a > 0.01) {
        ctx.fillStyle = "rgba(" + ACCENT + ", " + dot.a.toFixed(3) + ")";
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, 0.9 + dot.a * 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function tick() {
    raf = 0;
    let energy = 0;

    for (let i = 0; i < dots.length; i++) {
      const dot = dots[i];
      let targetX = dot.bx;
      let targetY = dot.by;
      let targetA = 0;

      if (pointer.active) {
        const dx = pointer.x - dot.bx;
        const dy = pointer.y - dot.by;
        const dist = Math.hypot(dx, dy);

        if (dist < RADIUS) {
          const force = 1 - dist / RADIUS;
          const eased = force * force;
          targetA = force;

          if (dist > 0.001) {
            targetX += (dx / dist) * eased * PULL;
            targetY += (dy / dist) * eased * PULL;
          }
        }
      }

      const nx = dot.x + (targetX - dot.x) * 0.14;
      const ny = dot.y + (targetY - dot.y) * 0.14;
      const na = dot.a + (targetA - dot.a) * 0.12;

      energy += Math.abs(nx - dot.x) + Math.abs(ny - dot.y) + Math.abs(na - dot.a);

      dot.x = nx;
      dot.y = ny;
      dot.a = na;
    }

    draw();

    if (energy > 0.02) {
      raf = requestAnimationFrame(tick);
    }
  }

  function ensureLoop() {
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function onMove(event) {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.active = true;
    ensureLoop();
  }

  function onLeave() {
    pointer.active = false;
    ensureLoop();
  }

  function onResize() {
    build();
    ensureLoop();
  }

  if (reducedMotion.matches) {
    build();
    return;
  }

  build();
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerdown", onMove, { passive: true });
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

  reducedMotion.addEventListener?.("change", (event) => {
    if (event.matches) {
      onLeave();
    }
  });
})();
