// Screen and surface artwork for the service builds, drawn with Canvas 2D.
// Interfaces are drawn as stacked, transparent layers on a shared canvas size, so a build can
// explode a screen into its parts (shell, navigation, cards, charts) and bring them back together.
import * as THREE from 'three';
import { drawLogo, LOGO } from './screens.js';

const SANS = "'Space Grotesk', 'Inter', system-ui, sans-serif";
const BODY = "'Inter', system-ui, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, Consolas, monospace";
const C = {
  bg: '#f4f6fb', card: '#ffffff', ink: '#0e1626', ink2: '#3b465c', muted: '#8a94a8', line: '#e4e8f0', soft: '#eef1f7',
  navy: '#0d1424', navy2: '#172138', blue: '#1296d6', blue2: '#5cc4f5', green: '#7fb21a', green2: '#b4dc5a', orange: '#f7941d', orange2: '#ffc070', rose: '#ef5b7b',
};

const cache = new Map();
function tex(key, w, h, draw, opaque = null) {
  if (cache.has(key)) return cache.get(key);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const x = cv.getContext('2d');
  if (opaque) { x.fillStyle = opaque; x.fillRect(0, 0, w, h); }
  x.textBaseline = 'middle'; x.lineJoin = 'round'; x.lineCap = 'round';
  draw(kit(x), w, h, x);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  cache.set(key, t);
  return t;
}

// a small drawing kit: cards with soft shadows, type, charts
function kit(x) {
  const rnd = (seed) => { let s = seed * 9301 + 49297; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); };
  const k = {
    rr(a, b, w, h, r, fill) { x.beginPath(); x.roundRect(a, b, w, h, r); x.fillStyle = fill; x.fill(); },
    card(a, b, w, h, r = 22, fill = C.card, depth = 1) {
      x.save(); x.shadowColor = `rgba(18, 38, 84, ${0.13 * depth})`; x.shadowBlur = 34 * depth; x.shadowOffsetY = 14 * depth;
      k.rr(a, b, w, h, r, fill); x.restore();
    },
    t(str, a, b, size, color = C.ink, weight = 500, font = BODY, align = 'left') { x.font = `${weight} ${size}px ${font}`; x.fillStyle = color; x.textAlign = align; x.fillText(str, a, b); x.textAlign = 'left'; },
    h(str, a, b, size, color = C.ink, align = 'left') { k.t(str, a, b, size, color, 700, SANS, align); },
    m(str, a, b, size, color = C.muted, align = 'left') { k.t(str, a, b, size, color, 500, MONO, align); },
    dot(a, b, r, fill) { x.beginPath(); x.arc(a, b, r, 0, 7); x.fillStyle = fill; x.fill(); },
    pill(str, a, b, color, bg, size = 15) { x.font = `600 ${size}px ${BODY}`; const w = x.measureText(str).width + size * 1.4; k.rr(a, b - size * 0.95, w, size * 1.9, size, bg); k.t(str, a + size * 0.7, b + 1, size, color, 600); return w; },
    series(n, seed, trend = 0.25) { const r = rnd(seed), out = []; let v = 0.35 + r() * 0.2; for (let i = 0; i < n; i++) { v += (r() - 0.45) * 0.16 + trend / n; out.push(Math.min(0.96, Math.max(0.08, v))); } return out; },
    path(pts) { x.beginPath(); pts.forEach((p, i) => { if (!i) x.moveTo(p[0], p[1]); else { const q = pts[i - 1], mx = (q[0] + p[0]) / 2; x.bezierCurveTo(mx, q[1], mx, p[1], p[0], p[1]); } }); },
    area(a, b, w, h, color, seed, trend = 0.3, fill = true, lw = 5) {
      const s = k.series(14, seed, trend), pts = s.map((v, i) => [a + (i / (s.length - 1)) * w, b + h - v * h]);
      if (fill) { k.path(pts); x.lineTo(a + w, b + h); x.lineTo(a, b + h); x.closePath(); const g = x.createLinearGradient(0, b, 0, b + h); g.addColorStop(0, color + '55'); g.addColorStop(1, color + '00'); x.fillStyle = g; x.fill(); }
      k.path(pts); x.strokeStyle = color; x.lineWidth = lw; x.stroke();
      return pts;
    },
    bars(a, b, w, h, n, color, seed, color2) { const r = rnd(seed), bw = (w / n) * 0.56; for (let i = 0; i < n; i++) { const v = 0.25 + r() * 0.75; k.rr(a + (i + 0.22) * (w / n), b + h - v * h, bw, v * h, bw / 2.4, color2 && i % 3 === 1 ? color2 : color); } },
    donut(cx, cy, R, th, parts) { let a0 = -Math.PI / 2; x.lineWidth = th; x.lineCap = 'butt'; for (const [frac, col] of parts) { x.beginPath(); x.arc(cx, cy, R, a0 + 0.04, a0 + frac * Math.PI * 2 - 0.04); x.strokeStyle = col; x.stroke(); a0 += frac * Math.PI * 2; } x.lineCap = 'round'; },
    avatar(cx, cy, r, color, letter) { k.dot(cx, cy, r, color); k.t(letter, cx, cy + 1, r, '#fff', 700, SANS, 'center'); },
    grad(a, b, w, h, c0, c1, r = 0) { const g = x.createLinearGradient(a, b, a + w, b + h); g.addColorStop(0, c0); g.addColorStop(1, c1); k.rr(a, b, w, h, r, g); },
    line(a, b, c, d, color, lw = 2) { x.beginPath(); x.moveTo(a, b); x.lineTo(c, d); x.strokeStyle = color; x.lineWidth = lw; x.stroke(); },
    chrome(w, url) { k.rr(0, 0, w, 62, 0, '#e9ecf3'); ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => k.dot(34 + i * 28, 31, 9, c)); k.rr(160, 14, w - 320, 34, 17, '#fff'); k.m(url, 184, 32, 17, C.muted); },
  };
  return k;
}

// ---------------------------------------------------------------- web app (1600 x 1000)
const W = 1600, H = 1000;
export const ART = {
  // SaaS dashboard, in four layers
  dashShell: () => tex('dashShell', W, H, (k) => {
    k.rr(0, 0, 250, H, 0, C.navy);
    k.grad(34, 34, 44, 44, C.blue, C.green, 12); k.h('Orbit', 92, 57, 26, '#fff');
    ['Overview', 'Customers', 'Billing', 'Reports', 'Automations', 'Settings'].forEach((s, i) => {
      if (i === 0) k.rr(20, 118, 210, 50, 14, C.navy2);
      k.rr(40, 135 + i * 62, 18, 18, 5, i === 0 ? C.blue : '#3a4763'); k.t(s, 74, 145 + i * 62, 18, i === 0 ? '#fff' : '#93a0ba', i === 0 ? 600 : 500);
    });
    k.rr(20, H - 150, 210, 110, 18, C.navy2); k.t('Team plan', 40, H - 112, 17, '#fff', 600); k.rr(40, H - 84, 170, 8, 4, '#2c3954'); k.rr(40, H - 84, 118, 8, 4, C.green);
    k.h('Overview', 290, 64, 34); k.t('Welcome back. Here is what changed this week.', 290, 104, 18, C.muted);
    k.rr(W - 520, 40, 300, 48, 24, '#fff'); k.t('Search', W - 480, 65, 17, C.muted);
    [C.orange, C.blue, C.green].forEach((c, i) => k.avatar(W - 170 + i * 44, 64, 24, c, 'ARK'[i]));
  }, C.bg),
  dashKpis: () => tex('dashKpis', W, H, (k) => {
    [['Monthly revenue', '$48.2k', '+12.4%', C.blue, 3], ['Active tenants', '312', '+8', C.green, 7], ['Seats in use', '4,906', '+3.1%', C.orange, 11], ['Uptime', '99.98%', '30 days', C.blue, 5]].forEach(([l, v, d, c, s], i) => {
      const a = 290 + i * 322;
      k.card(a, 150, 300, 168); k.t(l, a + 24, 186, 17, C.muted); k.h(v, a + 24, 236, 40);
      k.pill(d, a + 24, 286, c, c + '1f', 15); k.area(a + 150, 252, 126, 46, c, s, 0.5, false, 4);
    });
  }),
  dashChart: () => tex('dashChart', W, H, (k) => {
    k.card(290, 350, 830, 400); k.h('Revenue', 322, 394, 26); k.t('Last 12 months', 322, 428, 16, C.muted);
    k.pill('Subscriptions', 836, 396, C.blue, C.blue + '1f'); k.pill('Add-ons', 984, 396, C.green, C.green + '1f');
    for (let i = 0; i < 4; i++) k.line(322, 480 + i * 60, 1090, 480 + i * 60, C.line, 2);
    k.area(322, 470, 768, 240, C.green, 21, 0.25, true, 4); k.area(322, 450, 768, 260, C.blue, 9, 0.5, true, 5);
    k.card(1150, 350, 406, 400); k.h('Plans', 1182, 394, 26);
    k.donut(1353, 560, 104, 34, [[0.52, C.blue], [0.3, C.green], [0.18, C.orange]]); k.h('312', 1353, 552, 44, C.ink, 'center'); k.t('tenants', 1353, 590, 16, C.muted, 500, BODY, 'center');
  }),
  dashTable: () => tex('dashTable', W, H, (k) => {
    k.card(290, 782, 1266, 188); k.h('Recent tenants', 322, 822, 24);
    [['Northwind Labs', 'Team', C.blue, 'Active'], ['Harbor & Finch', 'Scale', C.green, 'Active'], ['Juniper Works', 'Starter', C.orange, 'Trial']].forEach(([n, p, c, s], i) => {
      const b = 872 + i * 34; k.avatar(340, b, 13, c, n[0]); k.t(n, 366, b, 17, C.ink, 600); k.t(p, 760, b, 17, C.ink2); k.rr(980, b - 5, 240, 10, 5, C.soft); k.rr(980, b - 5, 80 + i * 60, 10, 5, c);
      k.pill(s, 1420, b, s === 'Trial' ? C.orange : C.green, (s === 'Trial' ? C.orange : C.green) + '22', 14);
    });
  }),

  // workflow board for custom software
  flow: () => tex('flow', W, H, (k) => {
    k.rr(0, 0, W, 86, 0, '#fff'); k.h('Work orders', 40, 44, 30); k.pill('Automation on', 300, 44, C.green, C.green + '22'); k.rr(W - 220, 22, 180, 44, 22, C.blue); k.t('New order', W - 130, 45, 17, '#fff', 600, BODY, 'center');
    ['Intake', 'In review', 'Approved', 'Shipped'].forEach((s, i) => {
      const a = 34 + i * 392; k.rr(a, 112, 366, H - 146, 24, '#e9edf5'); k.h(s, a + 26, 150, 22); k.m(String(4 - i).padStart(2, '0'), a + 322, 151, 15);
      for (let j = 0; j < 4 - (i % 2); j++) {
        const b = 186 + j * 190; k.card(a + 18, b, 330, 168, 18);
        k.pill(['Priority', 'Standard', 'Rush'][(i + j) % 3], a + 38, b + 36, [C.rose, C.blue, C.orange][(i + j) % 3], [C.rose, C.blue, C.orange][(i + j) % 3] + '22', 14);
        k.t(['Calibrate line 4', 'Vendor onboarding', 'Site inspection', 'Renewal review'][(i + j) % 4], a + 38, b + 80, 19, C.ink, 600);
        k.rr(a + 38, b + 110, 200, 9, 5, C.soft); k.rr(a + 38, b + 110, 60 + ((i * 3 + j * 5) % 8) * 16, 9, 5, C.blue);
        k.avatar(a + 304, b + 132, 16, [C.green, C.orange, C.blue][(i + j) % 3], 'MJR'[(i + j) % 3]);
      }
    });
  }, C.bg),

  // marketing website, in layers
  siteShell: () => tex('siteShell', W, H, (k, w, h, x) => {
    const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#0b1020'); g.addColorStop(0.55, '#121a36'); g.addColorStop(1, '#2a1638'); x.fillStyle = g; x.fillRect(0, 62, w, h);
    const r = x.createRadialGradient(1180, 520, 0, 1180, 520, 620); r.addColorStop(0, 'rgba(247,148,29,0.5)'); r.addColorStop(1, 'rgba(247,148,29,0)'); x.fillStyle = r; x.fillRect(0, 62, w, h);
    k.chrome(w, 'yourbrand.com');
  }, '#0b1020'),
  siteNav: () => tex('siteNav', W, H, (k) => {
    k.grad(60, 92, 40, 40, C.orange, C.rose, 11); k.h('Lumen', 114, 113, 24, '#fff');
    ['Product', 'Stories', 'Pricing', 'Docs'].forEach((s, i) => k.t(s, 760 + i * 130, 113, 18, '#c7cee0'));
    k.rr(W - 230, 88, 170, 50, 25, '#fff'); k.t('Get started', W - 145, 114, 17, C.ink, 600, BODY, 'center');
  }),
  siteHero: () => tex('siteHero', W, H, (k) => {
    k.pill('New  ·  Spring release', 60, 250, '#ffd9a8', 'rgba(247,148,29,0.2)', 17);
    k.h('Make it', 60, 360, 104, '#fff'); k.h('unforgettable.', 60, 476, 104, C.orange2);
    k.t('An interactive product story, rendered live in the browser.', 62, 570, 24, '#b9c2d8');
    k.grad(60, 620, 230, 66, C.orange, C.rose, 33); k.t('Watch the film', 175, 654, 20, '#fff', 600, BODY, 'center');
    k.rr(310, 620, 190, 66, 33, 'rgba(255,255,255,0.12)'); k.t('Live demo', 405, 654, 20, '#fff', 600, BODY, 'center');
  }),
  siteCards: () => tex('siteCards', W, H, (k) => {
    [['Real-time 3D', C.orange], ['Motion design', C.blue2], ['Fast everywhere', C.green2]].forEach(([s, c], i) => {
      const a = 60 + i * 300; k.rr(a, 770, 276, 170, 24, 'rgba(255,255,255,0.1)'); k.rr(a + 24, 794, 46, 46, 13, c); k.t(s, a + 24, 874, 21, '#fff', 600); k.rr(a + 24, 900, 180, 9, 5, 'rgba(255,255,255,0.25)');
    });
  }),

  // professional desktop application (dark), in layers
  deskShell: () => tex('deskShell', W, H, (k) => {
    k.rr(0, 0, W, 54, 0, '#1b2233'); ['File', 'Edit', 'View', 'Project', 'Window', 'Help'].forEach((s, i) => k.t(s, 26 + i * 78, 28, 17, '#aab4ca'));
    k.rr(0, 54, W, 58, 0, '#151b2a'); for (let i = 0; i < 9; i++) k.rr(22 + i * 54, 68, 36, 30, 8, i === 2 ? C.blue : '#252e44');
    k.rr(W - 330, 66, 150, 34, 17, C.green); k.t('Run', W - 255, 84, 16, '#0b1408', 700, BODY, 'center'); k.rr(W - 164, 66, 140, 34, 17, '#252e44'); k.t('Publish', W - 94, 84, 16, '#d6dcec', 600, BODY, 'center');
    k.rr(0, H - 34, W, 34, 0, C.blue); k.m('READY   ·   main   ·   0 problems', 22, H - 16, 15, '#fff');
  }, '#0f1420'),
  deskPanels: () => tex('deskPanels', W, H, (k) => {
    k.rr(14, 126, 290, H - 174, 16, '#171e2f'); k.m('PROJECT', 36, 158, 14, '#7f8ba6');
    ['assets', '  models', '  textures', 'scenes', '  intro', '  product', 'scripts', 'exports'].forEach((s, i) => { if (i === 5) k.rr(26, 220 + i * 40 - 18, 266, 36, 9, '#24304c'); k.t(s.trim(), 44 + (s.startsWith(' ') ? 22 : 0), 222 + i * 40, 17, i === 5 ? '#fff' : '#a3aec6'); });
    k.rr(W - 344, 126, 330, H - 174, 16, '#171e2f'); k.m('INSPECTOR', W - 322, 158, 14, '#7f8ba6');
    ['Position', 'Rotation', 'Scale', 'Material', 'Lighting'].forEach((s, i) => { const b = 204 + i * 92; k.t(s, W - 322, b, 17, '#d6dcec', 600); k.rr(W - 322, b + 24, 286, 36, 10, '#101624'); k.rr(W - 322, b + 24, 90 + i * 34, 36, 10, [C.blue, C.green, C.orange, C.blue, C.green][i] + 'aa'); });
  }),
  deskCanvas: () => tex('deskCanvas', W, H, (k, w, h, x) => {
    k.rr(318, 126, W - 676, 590, 16, '#0b0f19');
    x.strokeStyle = 'rgba(255,255,255,0.06)'; x.lineWidth = 2; for (let i = 0; i < 16; i++) { x.beginPath(); x.moveTo(318 + i * 60, 126); x.lineTo(318 + i * 60, 716); x.stroke(); } for (let i = 0; i < 10; i++) { x.beginPath(); x.moveTo(318, 126 + i * 60); x.lineTo(W - 358, 126 + i * 60); x.stroke(); }
    const cx = 780, cy = 440;
    [[C.blue, 0], [C.green, 1], [C.orange, 2]].forEach(([c, i]) => { x.beginPath(); x.moveTo(cx - 150 + i * 60, cy + 150 - i * 20); x.lineTo(cx + 20 + i * 60, cy - 170 + i * 40); x.lineTo(cx + 170 + i * 50, cy + 150 - i * 20); x.closePath(); x.fillStyle = c + (i === 0 ? 'dd' : '88'); x.fill(); });
    k.rr(318, 730, W - 676, H - 778, 16, '#171e2f'); k.m('TIMELINE', 340, 760, 14, '#7f8ba6');
    [[0, 0.3, C.blue], [0.32, 0.4, C.green], [0.1, 0.5, C.orange], [0.62, 0.3, C.blue]].forEach(([a, l, c], i) => k.rr(340 + a * 860, 786 + (i % 3) * 44, l * 860, 32, 9, c + 'cc'));
    k.rr(700, 772, 3, 168, 1, '#fff');
  }),

  // phone app (600 x 1300), in layers
  appShell: () => tex('appShell', 600, 1300, (k, w, h, x) => {
    const g = x.createLinearGradient(0, 0, w, 620); g.addColorStop(0, '#0f6fc4'); g.addColorStop(1, '#19b6c9'); k.rr(0, 0, w, 560, 0, g);
    k.t('9:41', 44, 56, 26, '#fff', 600, SANS); k.rr(w / 2 - 80, 30, 160, 46, 23, '#04121f');
    k.t('Good morning, Sam', 44, 168, 26, '#d9f1ff'); k.h('$12,480.20', 44, 238, 64, '#fff'); k.pill('+ 4.2% this month', 44, 310, '#fff', 'rgba(255,255,255,0.2)', 20);
  }, C.bg),
  appCards: () => tex('appCards', 600, 1300, (k) => {
    k.card(34, 400, 532, 290, 34); k.t('Spending', 68, 446, 22, C.muted); k.area(68, 480, 464, 170, C.blue, 4, 0.35, true, 6);
    [['Groceries', '-$84.10', C.green], ['Transit pass', '-$32.00', C.blue], ['Salary', '+$3,200', C.orange]].forEach(([s, v, c], i) => { const b = 724 + i * 124; k.card(34, b, 532, 104, 28); k.rr(58, b + 26, 52, 52, 16, c + '26'); k.dot(84, b + 52, 11, c); k.t(s, 132, b + 40, 24, C.ink, 600); k.t('Today', 132, b + 72, 18, C.muted); k.t(v, 540, b + 52, 24, v[0] === '+' ? C.green : C.ink, 700, SANS, 'right'); });
  }),
  appNav: () => tex('appNav', 600, 1300, (k) => {
    k.card(34, 1166, 532, 96, 48, '#0d1424'); [C.blue2, '#55627e', '#55627e', '#55627e'].forEach((c, i) => k.rr(98 + i * 124, 1196, 34, 34, 11, c));
    k.card(442, 1050, 104, 104, 52, C.orange); k.t('+', 494, 1100, 56, '#fff', 500, SANS, 'center');
  }),

  // tablet app (1000 x 1340), in layers
  padShell: () => tex('padShell', 1000, 1340, (k) => {
    k.rr(0, 0, 250, 1340, 0, C.navy); k.grad(34, 40, 46, 46, C.blue, C.green, 13); k.h('Field', 96, 64, 28, '#fff');
    ['Today', 'Routes', 'Customers', 'Inventory', 'Reports'].forEach((s, i) => { if (i === 1) k.rr(20, 150 + i * 70 - 26, 210, 54, 15, C.navy2); k.rr(42, 150 + i * 70 - 10, 20, 20, 6, i === 1 ? C.blue : '#3a4763'); k.t(s, 80, 150 + i * 70, 21, i === 1 ? '#fff' : '#93a0ba', i === 1 ? 600 : 500); });
    k.h('Routes', 290, 72, 44); k.t('Tuesday  ·  14 stops', 292, 122, 22, C.muted);
  }, C.bg),
  padCards: () => tex('padCards', 1000, 1340, (k, w, h, x) => {
    k.card(290, 170, 672, 470, 30, '#dfeaf3'); x.save(); x.beginPath(); x.roundRect(290, 170, 672, 470, 30); x.clip();
    x.strokeStyle = '#fff'; x.lineWidth = 16; [[300, 250, 960, 420], [420, 170, 560, 640], [290, 560, 960, 480], [760, 170, 700, 640]].forEach(([a, b, c, d]) => { x.beginPath(); x.moveTo(a, b); x.lineTo(c, d); x.stroke(); });
    x.strokeStyle = C.blue; x.lineWidth = 9; x.beginPath(); x.moveTo(350, 560); x.bezierCurveTo(480, 400, 560, 520, 690, 380); x.lineTo(880, 300); x.stroke(); x.restore();
    [[350, 560, C.green], [690, 380, C.blue], [880, 300, C.orange]].forEach(([a, b, c]) => { k.dot(a, b, 22, '#fff'); k.dot(a, b, 13, c); });
    for (let i = 0; i < 4; i++) { const a = 290 + (i % 2) * 344, b = 676 + Math.floor(i / 2) * 250; k.card(a, b, 328, 226, 28); k.pill(['On time', 'Next', 'Delayed', 'Done'][i], a + 26, b + 44, [C.green, C.blue, C.rose, C.muted][i], [C.green, C.blue, C.rose, C.muted][i] + '22', 17); k.t(['Harbor St depot', 'Finch & Co', 'Juniper Works', 'Northwind Labs'][i], a + 26, b + 106, 25, C.ink, 600); k.t(['2 pallets', '6 cartons', '1 pallet', 'Signed'][i], a + 26, b + 146, 20, C.muted); k.rr(a + 26, b + 184, 276, 10, 5, C.soft); k.rr(a + 26, b + 184, 80 + i * 60, 10, 5, [C.green, C.blue, C.rose, C.muted][i]); }
  }),
  padNav: () => tex('padNav', 1000, 1340, (k) => { k.card(626, 1206, 336, 96, 48, C.blue); k.t('Start route', 794, 1256, 26, '#fff', 600, BODY, 'center'); k.avatar(914, 74, 34, C.orange, 'S'); }),

  // big-screen slide, game, drafting table, training chart
  slide: () => tex('slide', W, 900, (k, w, h, x) => {
    const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#0d1424'); g.addColorStop(1, '#16321a'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    k.m('WORKSHOP 02  ·  WORKING WITH AI', 90, 110, 22, '#9fb38a'); k.h('Give it context.', 90, 250, 96, '#fff'); k.h('Check the result.', 90, 370, 96, C.green2);
    ['Describe the task and the constraints', 'Share the examples you already have', 'Review, correct, and keep the good prompts'].forEach((s, i) => { k.dot(108, 520 + i * 84, 18, C.green); k.t(String(i + 1), 108, 521 + i * 84, 20, '#0b1408', 700, SANS, 'center'); k.t(s, 150, 520 + i * 84, 32, '#dfe6f3'); });
    k.rr(w - 470, 470, 380, 320, 28, 'rgba(255,255,255,0.08)'); k.area(w - 440, 520, 320, 220, C.green, 12, 0.6, true, 6);
  }),
  game: () => tex('game', 1000, 620, (k, w, h, x) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#132447'); g.addColorStop(1, '#0c1730'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    k.h('Mystery Chip', 44, 60, 34, '#fff'); k.pill('Level 3', 290, 60, C.orange2, 'rgba(247,148,29,0.22)', 18);
    for (let i = 0; i < 5; i++) k.dot(w - 240 + i * 44, 60, 14, i < 3 ? C.orange : '#2c3a5e');
    x.strokeStyle = C.orange; x.lineWidth = 10; x.beginPath(); x.moveTo(170, 230); x.lineTo(360, 230); x.lineTo(360, 290); x.moveTo(170, 420); x.lineTo(360, 420); x.lineTo(360, 360); x.moveTo(600, 325); x.lineTo(740, 325); x.stroke();
    [['A', 230, C.orange], ['B', 420, '#2c3a5e']].forEach(([s, b, c]) => { k.rr(70, b - 34, 100, 68, 34, '#1d2c50'); k.dot(s === 'A' ? 136 : 104, b, 24, c); k.h(s, 34, b, 30, '#93a3c8'); });
    k.card(360, 235, 240, 180, 26, '#1a2748'); k.h('?', 480, 328, 96, '#fff', 'center');
    k.dot(810, 325, 96, 'rgba(247,148,29,0.25)'); k.dot(810, 325, 58, C.orange);
    ['AND', 'OR', 'XOR', 'NAND'].forEach((s, i) => { k.rr(70 + i * 220, 520, 196, 64, 18, i === 1 ? C.orange : '#1d2c50'); k.t(s, 168 + i * 220, 553, 24, '#fff', 700, MONO, 'center'); });
  }),
  diagram: () => tex('diagram', 1400, 1000, (k, w, h, x) => {
    x.fillStyle = '#0a2146'; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(160,205,255,0.1)'; x.lineWidth = 2; for (let i = 0; i < w; i += 50) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); } for (let i = 0; i < h; i += 50) { x.beginPath(); x.moveTo(0, i); x.lineTo(w, i); x.stroke(); }
    x.strokeStyle = '#bfe0ff'; x.lineWidth = 5; x.setLineDash([18, 14]); x.beginPath(); x.moveTo(190, 800); x.bezierCurveTo(420, 560, 560, 860, 760, 500); x.bezierCurveTo(900, 280, 1060, 430, 1210, 190); x.stroke(); x.setLineDash([]);
    [[90, 720, 'NOW', 'Current systems'], [640, 410, 'NEXT', 'Phased roadmap'], [1050, 110, 'GOAL', 'Target architecture']].forEach(([a, b, s, d]) => { x.strokeStyle = '#bfe0ff'; x.lineWidth = 4; x.strokeRect(a, b, 260, 130); k.m(s, a + 24, b + 44, 30, '#fff'); k.t(d, a + 24, b + 90, 21, '#9cc4ee'); });
    k.m('APEX  ·  ARCHITECTURE REVIEW  ·  SHEET 01', 60, 60, 22, '#9cc4ee');
  }),
  chart: () => tex('chart', 800, 500, (k, w, h, x) => {
    k.card(20, 20, w - 40, h - 40, 34, 'rgba(13,20,36,0.92)'); k.m('TRAINING LOSS', 60, 76, 22, '#93a0ba'); k.h('0.184', w - 60, 80, 44, C.green2, 'right');
    x.strokeStyle = C.green; x.lineWidth = 8; x.beginPath(); for (let i = 0; i <= 48; i++) { const u = i / 48, v = 0.86 * Math.exp(-u * 3.6) + 0.07 + 0.02 * Math.sin(i * 1.9); x[i ? 'lineTo' : 'moveTo'](60 + u * (w - 120), 130 + (1 - v) * 30 + v * (h - 220)); } x.stroke();
    k.m('EPOCH', 60, h - 60, 18, '#5d6a85'); k.m('24 / 24', w - 60, h - 60, 18, '#5d6a85', 'right');
  }),
  crt: () => tex('crt', 512, 400, (k, w, h, x) => { x.fillStyle = '#04180c'; x.fillRect(0, 0, w, h); ['C:\\> RUN LEDGER.EXE', 'LOADING......', 'RECORDS  004,211', 'PRINT QUEUE  BUSY', 'C:\\> _'].forEach((s, i) => k.m(s, 28, 60 + i * 62, 30, '#39e06b')); }),

  // small glass tiles with icons, for agents and tools
  tile: (name, color) => tex('tile-' + name, 256, 256, (k, w, h, x) => {
    k.card(18, 18, 220, 220, 44, '#ffffff');
    x.strokeStyle = color; x.fillStyle = color; x.lineWidth = 14;
    if (name === 'doc') { x.strokeRect(84, 60, 88, 120); for (let i = 0; i < 3; i++) k.line(102, 96 + i * 26, 154, 96 + i * 26, color, 10); }
    else if (name === 'db') { for (let i = 0; i < 3; i++) { x.beginPath(); x.ellipse(128, 82 + i * 42, 52, 18, 0, 0, 7); x.stroke(); } k.line(76, 82, 76, 166, color, 14); k.line(180, 82, 180, 166, color, 14); }
    else if (name === 'mail') { x.strokeRect(66, 80, 124, 92); x.beginPath(); x.moveTo(66, 84); x.lineTo(128, 132); x.lineTo(190, 84); x.stroke(); }
    else if (name === 'chat') { x.beginPath(); x.roundRect(62, 70, 132, 92, 26); x.stroke(); x.beginPath(); x.moveTo(96, 160); x.lineTo(92, 194); x.lineTo(128, 162); x.fill(); }
    else if (name === 'cal') { x.strokeRect(66, 76, 124, 104); k.line(66, 108, 190, 108, color, 12); k.line(98, 60, 98, 86, color, 12); k.line(158, 60, 158, 86, color, 12); }
    else if (name === 'check') { x.beginPath(); x.moveTo(74, 132); x.lineTo(112, 168); x.lineTo(184, 92); x.stroke(); }
  }),
  // labelled interface components for the design-system build
  button: () => tex('button', 520, 160, (k) => { k.card(20, 20, 480, 110, 55, C.orange); k.t('Get started', 260, 76, 40, '#fff', 600, BODY, 'center'); }),
  field: () => tex('field', 620, 190, (k) => { k.card(20, 20, 580, 150, 30); k.m('EMAIL', 54, 62, 20); k.t('sam@northwind.io', 54, 116, 36, C.ink); k.rr(560, 78, 4, 70, 2, C.blue); }),
  uiCard: () => tex('uiCard', 620, 420, (k) => { k.card(20, 20, 580, 380, 40); k.grad(52, 52, 516, 150, C.blue, C.green, 26); k.h('Card title', 56, 250, 40); k.t('Supporting copy sits here.', 56, 304, 26, C.muted); k.pill('Tag', 56, 356, C.blue, C.blue + '22', 20); }),
  toggle: () => tex('toggle', 420, 150, (k) => { k.card(20, 20, 380, 110, 55); k.rr(48, 44, 110, 62, 31, C.green); k.dot(126, 75, 24, '#fff'); k.t('Notify me', 184, 76, 32, C.ink, 600); }),
  swatches: () => tex('swatches', 520, 190, (k) => { k.card(20, 20, 480, 150, 34); [C.blue, C.green, C.orange, C.navy].forEach((c, i) => { k.rr(48 + i * 110, 46, 92, 70, 18, c); k.m(c.toUpperCase(), 48 + i * 110, 140, 15); }); }),
  board: () => tex('board', 800, 1040, (k, w, h, x) => { x.strokeStyle = '#dfe4ee'; x.lineWidth = 2; for (let i = 80; i < w; i += 80) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); } for (let i = 80; i < h; i += 80) { x.beginPath(); x.moveTo(0, i); x.lineTo(w, i); x.stroke(); } k.m('DESIGN SYSTEM  ·  v2', 44, 54, 22); }, '#f7f9fc'),

  // hardware surfaces
  keys: () => tex('keys', 1024, 340, (k) => { [14, 14, 13, 12, 10].forEach((n, r) => { const kw = (1024 - 24 - (n - 1) * 8) / n; for (let i = 0; i < n; i++) k.rr(12 + i * (kw + 8), 12 + r * 64, r === 4 && i === 4 ? kw * 3 + 16 : kw, 54, 9, '#20242c'); }); }, '#111318'),
  mobo: () => tex('mobo', 1024, 1024, (k, w, h, x) => {
    x.fillStyle = '#0c0f14'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#1d232d'; x.lineWidth = 3;
    for (let i = 0; i < 46; i++) { const a = 40 + ((i * 97) % 940), b = 40 + ((i * 53) % 940); x.beginPath(); x.moveTo(a, b); x.lineTo(a + 60 + (i % 5) * 30, b); x.lineTo(a + 100 + (i % 5) * 30, b + 40); x.lineTo(a + 100 + (i % 5) * 30, b + 120); x.stroke(); }
    k.rr(300, 150, 250, 250, 10, '#161a21'); x.strokeStyle = '#8f98a8'; x.lineWidth = 6; x.strokeRect(318, 168, 214, 214);
    for (let i = 0; i < 4; i++) k.rr(640 + i * 44, 110, 26, 380, 5, i % 2 ? '#23272f' : '#3a404b');
    [560, 700, 850].forEach((b, i) => { k.rr(110, b, 560, 28, 6, '#1d2129'); k.rr(110, b + 9, 560, 6, 3, i === 0 ? '#aeb5c1' : '#30353f'); });
    k.rr(730, 600, 200, 200, 16, '#20252e'); x.strokeStyle = '#2f3540'; x.lineWidth = 5; for (let i = 0; i < 9; i++) k.line(740 + i * 22, 610, 740 + i * 22, 790, '#2f3540', 4);
    for (let i = 0; i < 26; i++) k.dot(60 + ((i * 131) % 900), 60 + ((i * 71) % 900), 9, i % 3 ? '#262b34' : '#b08d3c');
    k.m('APEX A1', 110, 930, 34, '#d7dce5'); k.rr(96, 120, 150, 330, 14, '#1b2028'); k.rr(96, 120, 8, 330, 4, '#3d4350');
  }),
  mesh: () => tex('mesh', 512, 512, (k, w, h, x) => { x.fillStyle = '#0a0b0e'; for (let r = 0; r < 34; r++) for (let c = 0; c < 34; c++) { x.beginPath(); x.arc(8 + c * 15 + (r % 2) * 7.5, 8 + r * 15, 5, 0, 7); x.fill(); } }, '#e9ebef'),
  meshDark: () => tex('meshDark', 512, 512, (k, w, h, x) => { x.fillStyle = '#050608'; for (let r = 0; r < 34; r++) for (let c = 0; c < 34; c++) { x.beginPath(); x.arc(8 + c * 15 + (r % 2) * 7.5, 8 + r * 15, 5, 0, 7); x.fill(); } }, '#22262d'),
  brushed: () => tex('brushed', 512, 512, (k, w, h, x) => { for (let i = 0; i < 1500; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.06})`; x.fillRect(Math.random() * w, Math.random() * h, 80 + Math.random() * 300, 1); } }, '#8c8c8c'),
  gpuPlate: () => tex('gpuPlate', 1024, 360, (k, w, h, x) => {
    const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#2b3038'); g.addColorStop(1, '#1b1f26'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(255,255,255,0.07)'; x.lineWidth = 3; for (let i = 0; i < 12; i++) { x.beginPath(); x.moveTo(560 + i * 44, 0); x.lineTo(760 + i * 44, h); x.stroke(); }
    drawLogo(x, 60, 96, 2.0, '#d9dee6'); k.m('A1  /  AI ACCELERATOR', 62, 232, 24, '#aeb6c2');
  }),
  psu: () => tex('psu', 512, 512, (k, w, h, x) => { x.fillStyle = '#15171c'; x.fillRect(0, 0, w, h); drawLogo(x, 70, 150, 2.1, '#cfd5de'); k.m('MODULAR POWER SUPPLY', 72, 290, 22, '#8a93a3'); k.rr(70, 330, 370, 6, 3, '#3a404b'); for (let i = 0; i < 5; i++) k.m(['+12V', '+5V', '+3.3V', '-12V', '+5VSB'][i], 72 + i * 76, 372, 16, '#6c7585'); }),
  bezel: () => tex('bezel', 1024, 240, (k, w, h, x) => {
    x.fillStyle = '#14161b'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) { k.rr(170 + i * 96, 34, 84, 172, 8, '#0a0b0e'); k.rr(178 + i * 96, 44, 68, 120, 5, '#20242c'); k.dot(212 + i * 96, 186, 6, i % 4 === 3 ? '#f7941d' : '#7fd13b'); }
    k.dot(70, 70, 22, '#0a0b0e'); k.dot(70, 70, 12, '#7fd13b'); for (let i = 0; i < 3; i++) k.rr(40, 120 + i * 30, 90, 16, 4, '#0a0b0e');
    drawLogo(x, w - 190, 96, 0.85, '#aeb6c2');
  }),
  clap: () => tex('clap', 640, 420, (k, w, h, x) => {
    x.fillStyle = '#101319'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) { x.fillStyle = i % 2 ? '#f3f5f8' : '#101319'; x.beginPath(); x.moveTo(i * 80 - 40, 0); x.lineTo(i * 80 + 40, 0); x.lineTo(i * 80, 90); x.lineTo(i * 80 - 80, 90); x.closePath(); x.fill(); }
    k.m('PROD.', 40, 160, 24, '#8a93a3'); k.h('Product launch film', 40, 210, 40, '#fff');
    k.m('SCENE', 40, 300, 24, '#8a93a3'); k.h('03', 40, 356, 56, C.orange); k.m('TAKE', 260, 300, 24, '#8a93a3'); k.h('01', 260, 356, 56, '#fff'); k.m('STUDIO', 440, 300, 24, '#8a93a3'); k.h('APEX', 440, 356, 44, '#fff');
  }),
};

export { C as UI_COLORS, LOGO };
