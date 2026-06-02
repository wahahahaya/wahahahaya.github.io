// ═══════════════════════════════════════════════════
//  Shared
// ═══════════════════════════════════════════════════
const DPR = Math.min(window.devicePixelRatio || 1, 2);

// Signed angular distance — returns value in [-π, π]
function angleDist(a, b) {
  let d = a - b;
  while (d >  Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// ═══════════════════════════════════════════════════
//  BIO CANVAS — Living Cell Simulation (left)
// ═══════════════════════════════════════════════════
const bioCanvas = document.getElementById('bio-canvas');
const bCtx      = bioCanvas.getContext('2d');
let   W, H, cells, evs;
let   evSpawnTimer = 0;
const EV_INTERVAL  = 44;   // frames between new EVs (~5× original rate)
const EV_MAX       = 50;   // max simultaneous EVs

function resizeBio() {
  const r = bioCanvas.getBoundingClientRect();
  W = r.width; H = r.height;
  bioCanvas.width  = Math.round(W * DPR);
  bioCanvas.height = Math.round(H * DPR);
  bCtx.scale(DPR, DPR);
  cells = createCells();
  evs   = [];
}

// ─── Cell ─────────────────────────────────────────
//  Membrane shape = basal oscillation
//                 + outward Gaussian bumps (budding only)
class Cell {
  constructor(xR, yR, radius) {
    this.xR = xR; this.yR = yR; this.radius = radius;
    this.phase = Math.random() * Math.PI * 2;
    this.buds = [];
    // Nucleus (offset from cell centre, randomised once)
    this.nucOX = (Math.random() - 0.5) * 0.22 * radius;
    this.nucOY = (Math.random() - 0.5) * 0.18 * radius;
    this.nucR  = radius * (0.24 + Math.random() * 0.07);
  }

  get cx() { return W * this.xR; }
  get cy() { return H * this.yR; }

  // Radial distance of membrane at angle theta
  getRadiusAt(theta, t) {
    let r = this.radius;
    // Slow organic oscillation — low frequencies only for smooth shape
    r += Math.sin(theta * 3  + t * 0.22  + this.phase)        * 4.5;
    r += Math.sin(theta * 5  - t * 0.31  + this.phase * 0.7)  * 2.5;
    r += Math.sin(theta * 8  + t * 0.17  + this.phase * 1.3)  * 1.2;

    // Outward bumps — budding protrusions
    for (const bud of this.buds) {
      const d = angleDist(theta, bud.angle);
      r += bud.strength * Math.exp(-(d * d) / (2 * bud.width * bud.width));
    }

    return Math.max(r, this.radius * 0.45);
  }

  // World coordinate of membrane point at angle theta (+optional offset)
  pointAt(theta, t, offset = 0) {
    const r = this.getRadiusAt(theta, t) + offset;
    return { x: this.cx + Math.cos(theta) * r, y: this.cy + Math.sin(theta) * r };
  }

  // Trace the membrane as smooth Catmull-Rom → Bezier curves (no polygon edges)
  _membranePath(t, N = 72) {
    const pts = Array.from({ length: N }, (_, i) => {
      const theta = (i / N) * Math.PI * 2;
      return this.pointAt(theta, t);
    });
    bCtx.beginPath();
    for (let i = 0; i < N; i++) {
      const p0 = pts[(i - 1 + N) % N];
      const p1 = pts[i];
      const p2 = pts[(i + 1) % N];
      const p3 = pts[(i + 2) % N];
      if (i === 0) bCtx.moveTo(p1.x, p1.y);
      bCtx.bezierCurveTo(
        p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6,
        p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6,
        p2.x, p2.y
      );
    }
    bCtx.closePath();
  }

  draw(t) {
    const { cx, cy, radius } = this;

    // 1 — soft outer glow
    this._membranePath(t);
    bCtx.strokeStyle = 'rgba(74,222,128,0.16)';
    bCtx.lineWidth   = 14;
    bCtx.stroke();

    // 2 — cell body fill
    this._membranePath(t);
    const fill = bCtx.createRadialGradient(
      cx - radius * 0.25, cy - radius * 0.25, radius * 0.08,
      cx, cy, radius * 1.18
    );
    fill.addColorStop(0,   'rgba(144,255,180,0.13)');
    fill.addColorStop(0.45,'rgba(74,222,128,0.07)');
    fill.addColorStop(1,   'rgba(15,50,28,0.44)');
    bCtx.fillStyle = fill;
    bCtx.fill();

    // 3 — crisp membrane line
    this._membranePath(t);
    bCtx.strokeStyle = 'rgba(74,222,128,0.72)';
    bCtx.lineWidth   = 2.2;
    bCtx.shadowColor = '#4ade80';
    bCtx.shadowBlur  = 8;
    bCtx.stroke();
    bCtx.shadowBlur  = 0;

    // 4 — nucleus (only interior structure)
    const nx = cx + this.nucOX, ny = cy + this.nucOY, nr = this.nucR;
    const nGrad = bCtx.createRadialGradient(nx + nr*0.26, ny - nr*0.26, 2, nx, ny, nr);
    nGrad.addColorStop(0,   'rgba(160,255,195,0.55)');
    nGrad.addColorStop(0.65,'rgba(22,110,55,0.80)');
    nGrad.addColorStop(1,   'rgba(6,38,18,0.94)');
    bCtx.beginPath();
    bCtx.arc(nx, ny, nr, 0, Math.PI * 2);
    bCtx.fillStyle = nGrad;
    bCtx.fill();
    bCtx.strokeStyle = 'rgba(74,222,128,0.26)';
    bCtx.lineWidth   = 0.9;
    bCtx.stroke();
    // Nucleolus
    bCtx.beginPath();
    bCtx.arc(nx - nr*0.10, ny - nr*0.09, nr*0.34, 0, Math.PI * 2);
    bCtx.fillStyle = 'rgba(144,255,180,0.46)';
    bCtx.fill();
  }

  update() {
    for (const b of this.buds) {
      b.life += 0.008;
      b.strength = b.maxStrength * Math.sin(Math.min(b.life, 1) * Math.PI);
      if (b.life > 1) b.dead = true;
    }
    this.buds = this.buds.filter(b => !b.dead);
  }

  addBud(angle) {
    this.buds.push({
      angle, width: 0.18,
      maxStrength: this.radius * 0.30,
      strength: 0, life: 0, dead: false
    });
  }

}

function createCells() {
  const b = Math.min(W, H);
  return [
    new Cell(0.16, 0.26, b * 0.128),  // upper-left, large
    new Cell(0.52, 0.43, b * 0.094),  // center-left
    new Cell(0.13, 0.65, b * 0.188),  // lower-left
    new Cell(0.45, 0.80, b * 0.090),  // lower-center
  ];
}

// ─── Extracellular Vesicle ─────────────────────────
//  Life cycle: budding → free (drifting) → absorbing → inside (fade)
class EV {
  constructor(source, target, t) {
    this.source      = source;
    this.target      = target;
    this.angle       = Math.random() * Math.PI * 2;
    // Aim roughly toward target with a bit of randomness
    this.targetAngle = Math.atan2(source.cy - target.cy, source.cx - target.cx)
                       + (Math.random() - 0.5) * 1.0;
    const p = source.pointAt(this.angle, t, 0);
    this.x  = p.x;
    this.y  = p.y;
    this.r  = 4 + Math.random() * 5;

    this.state           = 'budding';
    this.buddingProgress = 0;
    this.absorbProgress  = 0;
    this.alpha           = 1;
    this.wobble          = Math.random() * Math.PI * 2;

    source.addBud(this.angle);
  }

  update(t) {
    if (this.state === 'budding') {
      this.buddingProgress += 0.007;   // ~143 frames to detach
      const out = this.source.radius * 0.05 + this.buddingProgress * this.source.radius * 0.48;
      const p   = this.source.pointAt(this.angle, t, out);
      this.x = p.x; this.y = p.y;
      if (this.buddingProgress >= 1) this.state = 'free';

    } else if (this.state === 'free') {
      const tm = this.target.pointAt(this.targetAngle, t, 0);
      const dx = tm.x - this.x, dy = tm.y - this.y;
      const d  = Math.hypot(dx, dy);
      this.wobble += 0.055;
      // Slow drift — 0.38 px/frame instead of ChatGPT's 1.4
      this.x += (dx / d) * 0.38 + Math.sin(this.wobble) * 0.28;
      this.y += (dy / d) * 0.38 + Math.cos(this.wobble) * 0.28;
      if (d < 15) {
        this.state = 'absorbing';
      }

    } else if (this.state === 'absorbing') {
      this.absorbProgress += 0.007;
      const depth = this.target.radius * 0.38 * this.absorbProgress;
      const mp = this.target.pointAt(this.targetAngle, t, -depth);
      this.x = mp.x; this.y = mp.y;
      this.r *= 0.998;
      if (this.absorbProgress >= 1) this.state = 'inside';

    } else {  // inside — fade and die
      this.alpha -= 0.012;
    }
  }

  draw() {
    if (this.alpha <= 0) return;
    bCtx.save();
    bCtx.globalAlpha = this.alpha;

    const grad = bCtx.createRadialGradient(
      this.x - this.r * 0.35, this.y - this.r * 0.35, 1,
      this.x, this.y, this.r
    );
    grad.addColorStop(0,    'rgba(210,255,225,0.95)');
    grad.addColorStop(0.55, 'rgba(74,222,128,0.80)');
    grad.addColorStop(1,    'rgba(18,88,42,0.28)');

    bCtx.beginPath();
    bCtx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    bCtx.fillStyle   = grad;
    bCtx.strokeStyle = 'rgba(144,255,180,0.80)';
    bCtx.lineWidth   = 1.2;
    bCtx.shadowColor = '#4ade80';
    bCtx.shadowBlur  = this.r * 2.2;
    bCtx.fill(); bCtx.stroke();
    bCtx.shadowBlur = 0;

    // Membrane surface proteins (3 small spikes)
    bCtx.strokeStyle = 'rgba(50,180,90,0.72)';
    bCtx.lineWidth   = 1.4;
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI * 2 / 3 + this.wobble;
      bCtx.beginPath();
      bCtx.moveTo(this.x + Math.cos(a) * this.r * 0.78, this.y + Math.sin(a) * this.r * 0.78);
      bCtx.lineTo(this.x + Math.cos(a) * this.r * 1.38, this.y + Math.sin(a) * this.r * 1.38);
      bCtx.stroke();
    }

    bCtx.restore();
  }
}

function spawnEV(t) {
  const si = Math.floor(Math.random() * cells.length);
  let   ti = Math.floor(Math.random() * cells.length);
  while (ti === si) ti = Math.floor(Math.random() * cells.length);
  evs.push(new EV(cells[si], cells[ti], t));
}

// ═══════════════════════════════════════════════════
//  TECH CANVAS — Plexus Network (right)
// ═══════════════════════════════════════════════════
const techCanvas = document.getElementById('tech-canvas');
const tCtx       = techCanvas.getContext('2d');
let   TW, TH, plexus;
const CONNECT_DIST = 145, N_PARTICLES = 95;

function resizeTech() {
  const r = techCanvas.getBoundingClientRect();
  TW = r.width; TH = r.height;
  techCanvas.width  = Math.round(TW * DPR);
  techCanvas.height = Math.round(TH * DPR);
  tCtx.scale(DPR, DPR);
  plexus = Array.from({ length: N_PARTICLES }, () => new Particle());
}

class Particle {
  constructor() { this.init(); }
  init() {
    this.x = Math.random() * TW; this.y = Math.random() * TH;
    const spd = 0.15 + Math.random() * 0.30, ang = Math.random() * Math.PI * 2;
    this.vx = Math.cos(ang) * spd; this.vy = Math.sin(ang) * spd;
    this.z  = Math.random();
    this.r  = (1.5 + Math.random() * 2.5) * (0.5 + this.z * 0.8);
    this.isPurple = Math.random() < 0.28;
  }
  get rgb()       { return this.isPurple ? '160,110,255' : '56,189,248'; }
  get glowColor() { return this.isPurple ? '#a06eff' : '#38bdf8'; }
  update() {
    this.x += this.vx; this.y += this.vy;
    if (this.x < 0)  this.vx =  Math.abs(this.vx);
    if (this.x > TW) this.vx = -Math.abs(this.vx);
    if (this.y < 0)  this.vy =  Math.abs(this.vy);
    if (this.y > TH) this.vy = -Math.abs(this.vy);
  }
  draw() {
    const a = 0.35 + this.z * 0.55, r = this.r;
    tCtx.beginPath(); tCtx.arc(this.x, this.y, r * 3.5, 0, Math.PI * 2);
    tCtx.fillStyle = `rgba(${this.rgb},${a * 0.12})`; tCtx.fill();
    tCtx.beginPath(); tCtx.arc(this.x, this.y, r * 1.8, 0, Math.PI * 2);
    tCtx.fillStyle = `rgba(${this.rgb},${a * 0.22})`; tCtx.fill();
    tCtx.beginPath(); tCtx.arc(this.x, this.y, r, 0, Math.PI * 2);
    tCtx.fillStyle = `rgba(${this.rgb},${a})`;
    tCtx.shadowColor = this.glowColor; tCtx.shadowBlur = r * 5; tCtx.fill(); tCtx.shadowBlur = 0;
    if (this.z > 0.55) {
      tCtx.beginPath(); tCtx.arc(this.x, this.y, r * 0.38, 0, Math.PI * 2);
      tCtx.fillStyle = `rgba(220,240,255,${(this.z - 0.55) * 1.5})`; tCtx.fill();
    }
  }
}

function drawEdges() {
  for (let i = 0; i < plexus.length; i++) {
    for (let j = i + 1; j < plexus.length; j++) {
      const a = plexus[i], b = plexus[j];
      const dx = a.x - b.x, dy = a.y - b.y, d = Math.sqrt(dx*dx + dy*dy);
      if (d >= CONNECT_DIST) continue;
      const alpha = (1 - d / CONNECT_DIST) * 0.28;
      const w     = 0.4 + ((a.z + b.z) / 2) * 0.6;
      tCtx.beginPath(); tCtx.moveTo(a.x, a.y); tCtx.lineTo(b.x, b.y);
      tCtx.lineWidth = w;
      if (a.isPurple !== b.isPurple) {
        const g = tCtx.createLinearGradient(a.x, a.y, b.x, b.y);
        g.addColorStop(0, `rgba(${a.rgb},${alpha})`);
        g.addColorStop(1, `rgba(${b.rgb},${alpha})`);
        tCtx.strokeStyle = g;
      } else {
        tCtx.strokeStyle = `rgba(${a.rgb},${alpha})`;
      }
      tCtx.stroke();
    }
  }
}

// ═══════════════════════════════════════════════════
//  Animation Loop
// ═══════════════════════════════════════════════════
let t = 0, alive = true;

function loop() {
  if (!alive) return;
  requestAnimationFrame(loop);
  t += 0.016;

  // ── Bio canvas ───────────────────────────────────
  bCtx.clearRect(0, 0, W, H);

  // Spawn new EVs periodically
  evSpawnTimer++;
  if (evSpawnTimer >= EV_INTERVAL && evs.length < EV_MAX) {
    spawnEV(t);
    evSpawnTimer = 0;
  }

  // Remove fully faded EVs
  evs = evs.filter(ev => ev.alpha > 0);

  cells.forEach(c => { c.update(); c.draw(t); });
  evs.forEach(ev => { ev.update(t); ev.draw(); });

  // ── Tech canvas ──────────────────────────────────
  tCtx.clearRect(0, 0, TW, TH);
  drawEdges();
  plexus.forEach(p => { p.update(); p.draw(); });
}

document.addEventListener('visibilitychange', () => {
  alive = !document.hidden;
  if (alive) loop();
});

function resizeAll() { resizeBio(); resizeTech(); }
window.addEventListener('resize', resizeAll);

// ═══════════════════════════════════════════════════
//  Email Copy
// ═══════════════════════════════════════════════════
function setupEmailBtn(id) {
  const btn   = document.getElementById(id);
  const label = btn.querySelector('span');
  const email = btn.dataset.email, orig = label.textContent;
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(email);
      label.textContent   = 'Copied!';
      btn.style.borderColor = 'rgba(74,222,128,0.55)';
      btn.style.boxShadow   = '0 0 16px rgba(74,222,128,0.30)';
      setTimeout(() => {
        label.textContent   = orig;
        btn.style.borderColor = '';
        btn.style.boxShadow   = '';
      }, 2000);
    } catch { window.location.href = `mailto:${email}`; }
  });
}
setupEmailBtn('btn-ntu');
setupEmailBtn('btn-gmail');

// ═══════════════════════════════════════════════════
//  Card Tilt
// ═══════════════════════════════════════════════════
const card = document.getElementById('card');
let ready = false;
card.addEventListener('animationend', () => { ready = true; }, { once: true });
if (!('ontouchstart' in window)) {
  document.addEventListener('mousemove', e => {
    if (!ready) return;
    const rect = card.getBoundingClientRect();
    const dx = (e.clientX - (rect.left + rect.width  / 2)) / (window.innerWidth  / 2);
    const dy = (e.clientY - (rect.top  + rect.height / 2)) / (window.innerHeight / 2);
    card.style.transition = 'transform 0.08s ease';
    card.style.transform  = `perspective(1100px) rotateX(${-dy * 6}deg) rotateY(${dx * 6}deg)`;
  });
  document.addEventListener('mouseleave', () => {
    if (!ready) return;
    card.style.transition = 'transform 0.55s ease';
    card.style.transform  = 'perspective(1100px) rotateX(0deg) rotateY(0deg)';
  });
}

// ═══════════════════════════════════════════════════
//  Init
// ═══════════════════════════════════════════════════
resizeAll();
loop();
