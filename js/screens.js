// Canvas-drawn surfaces for the 3D scene: the Apex logo, live device screens, and printed labels.

const MONO = "'JetBrains Mono', ui-monospace, Consolas, monospace";
const SANS = "'Space Grotesk', 'Inter', system-ui, sans-serif";
const SLAB = "800 1px Rokkitt, Rockwell, 'Roboto Slab', Georgia, serif".slice(8); // heavy slab, as in the logo lockup

const PALETTES = {
  dark: { bg: '#070b14', panel: '#0e1524', line: '#1d2638', ink: '#e8eefc', muted: '#6f7c96' },
  light: { bg: '#ffffff', panel: '#f1f4fa', line: '#dde3ee', ink: '#0d1424', muted: '#8792a8' },
};

function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }
function make(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  return { canvas, c: canvas.getContext('2d'), w, h };
}

// ------------------------------------------------------------- Apex logo
// Traced from the company logo. Coordinates live in a 182-wide box; the wordmark spans x 2..174, y 65.5..109.
export const BRAND = { ink: '#282828', green: '#84b81b', greenDeep: '#6f9e14', blue: '#0c8ccc', blueLight: '#1ba7e8' };
export const LOGO = {
  aInk: 'M2.2 109 20.5 74h8.9L47.3 109H36.3L29.2 95.2l-4.45 4.6-4.45-4.6L13 109z',
  aPeak: 'M25 65.5 29.4 74h-8.9z',
  p: 'M51.5 66H77a9.5 9.5 0 0 1 9.5 9.5v7A9.5 9.5 0 0 1 77 92H63.5q-2.5 0-2.5 2.5V109h-9.5V92.5A9.5 9.5 0 0 1 61 83h12.5a4 4 0 0 0 0-8h-22z',
  e: 'M126.5 66H101a10 10 0 0 0-10 10v6q0 3 4.5 5.5-4.5 2.5-4.5 5.5v6a10 10 0 0 0 10 10h25.5v-9h-21a4 4 0 0 1 0-8h21v-9h-21a4 4 0 0 1 0-8h21z',
  brace: 'M133 66h7a8 8 0 0 1 8 8v8.5q0 2 2 2t2 2v2q0 2-2 2t-2 2V101a8 8 0 0 1-8 8h-7v-8h2.5q1.5 0 1.5-1.5V92q0-2 2.5-2.5v-4Q137 85 137 83v-7.5q0-1.5-1.5-1.5H133z',
  width: 172.8, height: 43.5,
};

// Draws the APEX wordmark with its top-left at (x, y); k scales it (1 = 172.8 x 43.5).
export function drawLogo(c, x, y, k, ink = BRAND.ink, col = BRAND) {
  c.save();
  c.translate(x, y); c.scale(k, k); c.translate(-2, -65.5);
  c.fillStyle = ink;
  for (const d of [LOGO.aInk, LOGO.p, LOGO.e]) c.fill(new Path2D(d));
  c.fillStyle = col.green; c.fill(new Path2D(LOGO.aPeak));
  let g = c.createLinearGradient(133, 0, 152, 0);
  g.addColorStop(0, col.green); g.addColorStop(1, col.greenDeep || col.green);
  c.fillStyle = g; c.fill(new Path2D(LOGO.brace));
  c.translate(307, 0); c.scale(-1, 1);
  g = c.createLinearGradient(133, 0, 152, 0);
  g.addColorStop(0, col.blueLight || col.blue); g.addColorStop(1, col.blue);
  c.fillStyle = g; c.fill(new Path2D(LOGO.brace));
  c.restore();
}
function tagline(c, cx, y, width, ink) {
  c.fillStyle = ink; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  let size = 40;
  c.font = `800 ${size}px ${SLAB}`;
  size *= width / c.measureText('SOFTWARE SERVICES').width;
  c.font = `800 ${size}px ${SLAB}`;
  c.fillText('SOFTWARE SERVICES', cx, y);
}
const GLOW_COLORS = { green: '#a6f03c', greenDeep: '#8fd42a', blue: '#33b6ff', blueLight: '#6fd0ff' };

// ------------------------------------------------------------------ laptop
const CODE = [
  "export const platform = defineApp({",
  "  name: 'your-idea',",
  "  targets: ['web', 'mobile', 'desktop'],",
  "  auth: ['sso', 'roles'],",
  "  api: rest({ version: 'v1' }),",
  "  cloud: azure({ scale: 'auto' }),",
  "  ai: assistant({ runs: 'on-prem' }),",
  "});",
  "",
  "await platform.ship();",
  "// build ok   tests ok   live",
];
const CODE_TOTAL = CODE.reduce((n, l) => n + l.length + 1, 0);

function tokenColor(line, i, p, accent, accent2) {
  if (line.trimStart().startsWith('//')) return p.muted;
  let open = false;
  for (let k = 0; k <= i; k++) if (line[k] === "'") { if (k === i) return accent2; open = !open; }
  if (open) return accent2;
  const m = /\b(export|const|await)\b/g;
  let r;
  while ((r = m.exec(line))) if (i >= r.index && i < r.index + r[0].length) return accent;
  if (/[{}()\[\];,.:]/.test(line[i])) return p.muted;
  return p.ink;
}

function drawLaptop(s, t, p, accent, accent2) {
  const { c, w, h } = s;
  c.textAlign = 'left'; c.textBaseline = 'middle';
  c.fillStyle = p.bg; c.fillRect(0, 0, w, h);
  c.fillStyle = p.panel; c.fillRect(0, 0, w, 52);
  ['#ff5f57', '#febc2e', '#28c840'].forEach((col, i) => { c.fillStyle = col; c.beginPath(); c.arc(28 + i * 24, 26, 7, 0, 7); c.fill(); });
  c.fillStyle = p.bg; rr(c, 130, 10, 210, 42, 8); c.fill();
  c.fillStyle = p.ink; c.font = `500 17px ${MONO}`;
  c.fillText('apex.config.ts', 150, 31);
  c.fillStyle = p.panel; c.fillRect(0, 52, 190, h - 52);
  c.font = `15px ${MONO}`;
  ['src', '  api', '  web', '  mobile', '  desktop', '  ai', 'apex.config.ts'].forEach((f, i) => {
    c.fillStyle = i === 6 ? accent : p.muted;
    c.fillText(f, 22, 86 + i * 30);
  });
  const typed = Math.min(CODE_TOTAL, Math.floor((t % 15) * 26));
  let budget = typed;
  const x0 = 250, y0 = 96, lh = 37, cw = 12.6;
  c.font = `500 21px ${MONO}`;
  let cx = x0, cy = y0;
  for (let li = 0; li < CODE.length; li++) {
    const line = CODE[li];
    c.fillStyle = p.muted; c.globalAlpha = 0.6;
    c.fillText(String(li + 1).padStart(2, ' '), 204, y0 + li * lh);
    c.globalAlpha = 1;
    const n = Math.min(line.length, budget);
    for (let i = 0; i < n; i++) {
      if (line[i] === ' ') continue;
      c.fillStyle = tokenColor(line, i, p, accent, accent2);
      c.fillText(line[i], x0 + i * cw, y0 + li * lh);
    }
    if (budget >= 0 && budget <= line.length) { cx = x0 + n * cw; cy = y0 + li * lh; }
    budget -= line.length + 1;
    if (budget < 0) break;
  }
  if (Math.floor(t * 2.5) % 2 === 0 || typed < CODE_TOTAL) { c.fillStyle = accent; c.fillRect(cx + 2, cy - 13, 11, 26); }
  const done = typed >= CODE_TOTAL, px = w - 250;
  c.fillStyle = p.panel; rr(c, px, h - 190, 226, 166, 14); c.fill();
  c.font = `500 14px ${MONO}`; c.fillStyle = p.muted; c.fillText('PIPELINE', px + 20, h - 162);
  ['build', 'tests', 'deploy'].forEach((name, i) => {
    const on = typed / CODE_TOTAL > 0.55 + i * 0.2 || done;
    c.fillStyle = on ? accent : p.line;
    c.beginPath(); c.arc(px + 30, h - 124 + i * 36, 8, 0, 7); c.fill();
    c.fillStyle = on ? p.ink : p.muted; c.font = `17px ${MONO}`;
    c.fillText(name, px + 52, h - 123 + i * 36);
  });
  c.fillStyle = accent; c.fillRect(0, h - 8, w * (typed / CODE_TOTAL), 8);
}

// ---------------------------------------------------- tablet: Apex Studio
function drawTablet(s, t, p, accent, accent2) {
  const { c, w, h } = s;
  c.textAlign = 'left'; c.textBaseline = 'middle';
  c.fillStyle = p.bg; c.fillRect(0, 0, w, h);
  c.fillStyle = p.ink; c.font = `600 38px ${SANS}`; c.fillText('Apex Studio', 44, 74);
  c.fillStyle = p.muted; c.font = `17px ${MONO}`; c.fillText('PRODUCT FILM · SCENE 03', 46, 116);
  c.fillStyle = accent; rr(c, w - 150, 54, 106, 44, 22); c.fill();
  c.fillStyle = p.bg; c.font = `600 18px ${SANS}`; c.textAlign = 'center'; c.fillText('Render', w - 97, 77); c.textAlign = 'left';

  // viewport: a turntable render of a product
  const vx = 44, vy = 152, vw = w - 88, vh = 392;
  const g = c.createLinearGradient(vx, vy, vx + vw, vy + vh);
  g.addColorStop(0, p.panel); g.addColorStop(1, p.line);
  c.fillStyle = g; rr(c, vx, vy, vw, vh, 22); c.fill();
  c.save(); rr(c, vx, vy, vw, vh, 22); c.clip();
  const cx = vx + vw / 2, cy = vy + vh / 2 + 16, a = t * 0.7;
  c.strokeStyle = p.line; c.lineWidth = 2; // floor grid
  for (let i = -6; i <= 6; i++) { c.beginPath(); c.moveTo(cx + i * 60, cy + 70); c.lineTo(cx + i * 150, vy + vh); c.stroke(); }
  for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(vx, cy + 70 + i * i * 9 + i * 14); c.lineTo(vx + vw, cy + 70 + i * i * 9 + i * 14); c.stroke(); }
  // spinning pyramid (the Apex mark), far faces first
  const proj = (x, y, z) => { const X = x * Math.cos(a) - z * Math.sin(a), Z = x * Math.sin(a) + z * Math.cos(a), k = 420 / (420 + Z * 60); return [cx + X * 96 * k, cy - y * 96 * k + 60, Z]; };
  const base = [[-1, 0, -1], [1, 0, -1], [1, 0, 1], [-1, 0, 1]].map((v) => proj(...v)), top = proj(0, 1.9, 0);
  const faces = base.map((b, i) => [b, base[(i + 1) % 4]]).sort((f1, f2) => (f2[0][2] + f2[1][2]) - (f1[0][2] + f1[1][2]));
  faces.forEach(([b0, b1], i) => {
    c.beginPath(); c.moveTo(b0[0], b0[1]); c.lineTo(b1[0], b1[1]); c.lineTo(top[0], top[1]); c.closePath();
    c.fillStyle = i < 2 ? accent2 : accent; c.globalAlpha = i < 2 ? 0.35 : 0.9; c.fill();
    c.globalAlpha = 1; c.strokeStyle = p.bg; c.lineWidth = 3; c.stroke();
  });
  c.restore();
  c.fillStyle = p.bg; c.globalAlpha = 0.85; c.beginPath(); c.arc(vx + 44, vy + vh - 44, 24, 0, 7); c.fill(); c.globalAlpha = 1;
  c.fillStyle = p.ink; c.beginPath(); c.moveTo(vx + 37, vy + vh - 56); c.lineTo(vx + 57, vy + vh - 44); c.lineTo(vx + 37, vy + vh - 32); c.closePath(); c.fill();

  // timeline
  const ty = 584, th = 250;
  c.fillStyle = p.panel; rr(c, 44, ty, w - 88, th, 22); c.fill();
  c.fillStyle = p.muted; c.font = `15px ${MONO}`; c.fillText('TIMELINE', 68, ty + 30);
  const clips = [[0, 0.02, 0.34, accent], [0, 0.38, 0.3, accent2], [0, 0.7, 0.26, accent], [1, 0.1, 0.5, accent2], [1, 0.64, 0.3, accent], [2, 0.04, 0.22, accent], [2, 0.3, 0.62, accent2]];
  clips.forEach(([row, x, len, col], i) => {
    c.fillStyle = col; c.globalAlpha = 0.3 + 0.5 * ((i * 37) % 10) / 10;
    rr(c, 68 + x * (w - 136), ty + 58 + row * 58, len * (w - 136), 42, 9); c.fill();
  });
  c.globalAlpha = 1;
  const ph = 68 + ((t * 0.09) % 1) * (w - 136);
  c.fillStyle = p.ink; c.fillRect(ph - 1.5, ty + 46, 3, th - 62);
  c.beginPath(); c.moveTo(ph - 9, ty + 44); c.lineTo(ph + 9, ty + 44); c.lineTo(ph, ty + 58); c.closePath(); c.fill();

  // outputs
  ['Website', 'Commercial', 'Game'].forEach((label, i) => {
    const bw = (w - 88 - 40) / 3, x = 44 + i * (bw + 20), y = 862;
    c.fillStyle = p.panel; rr(c, x, y, bw, 118, 18); c.fill();
    c.fillStyle = i === Math.floor(t * 0.5) % 3 ? accent : p.line; c.beginPath(); c.arc(x + 30, y + 36, 10, 0, 7); c.fill();
    c.fillStyle = p.ink; c.font = `600 22px ${SANS}`; c.fillText(label, x + 20, y + 82);
  });
}

// ------------------------------------------------------------------- phone
function drawPhone(s, t, p, accent, accent2, dive = 0, pageBg = p.bg) {
  const { c, w, h } = s;
  c.textAlign = 'left'; c.textBaseline = 'middle';
  c.fillStyle = p.bg; c.fillRect(0, 0, w, h);
  c.fillStyle = p.ink; c.font = `600 24px ${SANS}`; c.fillText('9:41', 40, 50);
  rr(c, w / 2 - 70, 30, 140, 40, 20); c.fill();
  c.fillStyle = p.muted; c.font = `20px ${MONO}`; c.fillText('GOOD MORNING', 40, 138);
  c.fillStyle = p.ink; c.font = `600 44px ${SANS}`; c.fillText('Release 2.4', 40, 190);

  const v = Math.min(1, (t * 0.11) % 1.25), cx = w / 2, cy = 430, R = 132;
  c.fillStyle = p.panel; rr(c, 32, 250, w - 64, 360, 34); c.fill();
  c.lineWidth = 22; c.lineCap = 'round';
  c.strokeStyle = p.line; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke();
  const grad = c.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
  grad.addColorStop(0, accent); grad.addColorStop(1, accent2);
  c.strokeStyle = grad; c.beginPath(); c.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * v); c.stroke();
  c.fillStyle = p.ink; c.font = `600 62px ${SANS}`; c.textAlign = 'center';
  c.fillText(Math.round(v * 100) + '%', cx, cy - 6);
  c.fillStyle = p.muted; c.font = `18px ${MONO}`; c.fillText(v >= 1 ? 'LIVE' : 'ROLLING OUT', cx, cy + 44);
  c.textAlign = 'left';

  ['Build', 'Tests', 'Deploy'].forEach((name, i) => {
    const y = 646 + i * 96, on = v > 0.3 + i * 0.3;
    c.fillStyle = p.panel; rr(c, 32, y, w - 64, 80, 22); c.fill();
    c.fillStyle = on ? accent : p.line; c.beginPath(); c.arc(78, y + 40, 16, 0, 7); c.fill();
    if (on) { c.strokeStyle = p.bg; c.lineWidth = 4; c.beginPath(); c.moveTo(70, y + 40); c.lineTo(76, y + 47); c.lineTo(87, y + 33); c.stroke(); }
    c.fillStyle = p.ink; c.font = `600 26px ${SANS}`; c.fillText(name, 114, y + 40);
    c.fillStyle = p.muted; c.font = `17px ${MONO}`; c.textAlign = 'right';
    c.fillText(on ? 'done' : 'queued', w - 58, y + 41); c.textAlign = 'left';
  });
  c.fillStyle = p.panel; rr(c, 32, h - 104, w - 64, 72, 36); c.fill();
  for (let i = 0; i < 4; i++) { c.fillStyle = i === 0 ? accent : p.line; c.beginPath(); c.arc(w / 2 - 105 + i * 70, h - 68, 10, 0, 7); c.fill(); }

  // dive: the UI dissolves into the page itself
  if (dive > 0) {
    const k = Math.min(1, dive * 1.15);
    c.globalAlpha = k;
    c.fillStyle = pageBg; c.fillRect(0, 0, w, h);
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, h * 0.6);
    g.addColorStop(0, accent); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = k * 0.14; c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.globalAlpha = 1;
  }
}

// ------------------------------------------------------- printed surfaces
function brushed(c, w, h, a, b, mid) {
  const g = c.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, a); g.addColorStop(0.5, mid); g.addColorStop(1, b);
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 1100; i++) {
    c.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '40,50,70'},${Math.random() * 0.05})`;
    c.fillRect(Math.random() * w, Math.random() * h, 60 + Math.random() * 260, 1);
  }
}

// processor lid: the logo lockup, laser-marked on brushed metal; `glow` lights it up in dark mode
export function drawLid() {
  const face = make(512, 512), glow = make(512, 512);
  brushed(face.c, 512, 512, '#f3f5f8', '#e9ecf1', '#cdd2da');
  const k = 2.28, x = (512 - LOGO.width * k) / 2;
  drawLogo(face.c, x, 150, k);
  tagline(face.c, 256, 302, LOGO.width * k - 14, BRAND.ink);
  face.c.globalAlpha = 0.55; face.c.font = `15px ${MONO}`; face.c.textAlign = 'center';
  face.c.fillText('A1  ·  CHICAGO  ·  IL', 256, 356);
  face.c.globalAlpha = 1; face.c.fillRect(38, 448, 14, 14);

  const c = glow.c;
  c.fillStyle = '#000'; c.fillRect(0, 0, 512, 512);
  c.shadowColor = 'rgba(255,255,255,0.45)'; c.shadowBlur = 14;
  drawLogo(c, x, 150, k, '#eef3fb', GLOW_COLORS);
  c.shadowBlur = 0;
  tagline(c, 256, 302, LOGO.width * k - 14, '#8f9bb0');
  return { face: face.canvas, glow: glow.canvas };
}

// graphics-card backplate
export function drawBackplate() {
  const face = make(1280, 512), glow = make(1280, 512);
  let c = face.c;
  brushed(c, 1280, 512, '#2b3038', '#1d2128', '#343a44');
  c.fillStyle = 'rgba(0,0,0,0.35)';
  for (let i = 0; i < 14; i++) for (let j = 0; j < 3; j++) { rr(c, 70 + i * 44, 372 + j * 34, 30, 16, 8); c.fill(); }
  const k = 2.6;
  drawLogo(c, 76, 96, k, '#d9dee6');
  c.fillStyle = '#aeb6c2'; c.font = `500 26px ${MONO}`; c.textAlign = 'left'; c.textBaseline = 'middle';
  c.fillText('A1  /  AI ACCELERATOR', 80, 272);
  c.font = `20px ${MONO}`; c.globalAlpha = 0.6; c.fillText('LOCAL INFERENCE  ·  LOCAL TRAINING', 80, 314); c.globalAlpha = 1;

  c = glow.c;
  c.fillStyle = '#000'; c.fillRect(0, 0, 1280, 512);
  c.shadowColor = 'rgba(255,255,255,0.4)'; c.shadowBlur = 18;
  drawLogo(c, 76, 96, k, '#f2f6fc', GLOW_COLORS);
  return { face: face.canvas, glow: glow.canvas };
}

// low heatsink over the chipset
export function drawChipsetPlate() {
  const s = make(512, 512), c = s.c;
  brushed(c, 512, 512, '#30353e', '#22262d', '#3b414b');
  c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = 4;
  for (let i = -6; i < 12; i++) { c.beginPath(); c.moveTo(i * 60, 512); c.lineTo(i * 60 + 300, 0); c.stroke(); }
  drawLogo(c, 96, 206, 1.85, '#cfd5de');
  return s.canvas;
}

// two-digit status display near the board edge
export function drawPostCode() {
  const s = make(160, 112), c = s.c;
  c.fillStyle = '#050608'; c.fillRect(0, 0, 160, 112);
  c.fillStyle = '#fff'; c.font = `700 84px ${MONO}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('A1', 80, 60);
  return s.canvas;
}

export function drawKeyboard() {
  const s = make(920, 340), c = s.c;
  c.fillStyle = '#12151b'; c.fillRect(0, 0, 920, 340);
  [14, 14, 13, 12, 9].forEach((n, r) => {
    const kw = (920 - 20 - (n - 1) * 8) / n;
    for (let i = 0; i < n; i++) { c.fillStyle = '#242933'; rr(c, 10 + i * (kw + 8), 10 + r * 66, kw, 56, 8); c.fill(); }
  });
  return s.canvas;
}

export function createScreens() {
  const laptop = make(1024, 640), tablet = make(768, 1024), phone = make(512, 1060);
  return {
    laptop: laptop.canvas, tablet: tablet.canvas, phone: phone.canvas,
    draw(which, t, light, accent, accent2, dive, pageBg) {
      const p = light ? PALETTES.light : PALETTES.dark;
      if (which === 'laptop') drawLaptop(laptop, t, p, accent, accent2);
      else if (which === 'tablet') drawTablet(tablet, t, p, accent, accent2);
      else drawPhone(phone, t, p, accent, accent2, dive, pageBg);
    },
  };
}
