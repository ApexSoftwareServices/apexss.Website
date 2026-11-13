// The Apex A1 mainboard: where everything sits, how it is routed, and the artwork printed on it.
// layoutBoard() decides the parts and traces; paintBoard() draws the copper, solder mask, gold and
// silkscreen onto canvases that world.js uses as the board's colour and relief textures.
import { drawLogo, LOGO } from './screens.js';

export const BOARD = { x0: -10, x1: 12, z0: -10.5, z1: 8.5 };
export const BOARD_W = BOARD.x1 - BOARD.x0, BOARD_D = BOARD.z1 - BOARD.z0;

// Fixed, named parts (x/z = centre, w = size along x, d = size along z)
export const PARTS = {
  cpu: { x: 0, z: 0 },
  vrmW: { x: -3.3, z: 0, w: 1.3, d: 4.4 },
  vrmN: { x: 0, z: -3.3, w: 4.4, d: 1.3 },
  io: { x: -8.8, z: -2.0, w: 2.4, d: 11 },
  ram: { xs: [3.4, 3.95, 4.5, 5.05], z: 0, len: 5.6 },
  atx: { x: 6.9, z: 0, w: 0.9, d: 2.8 },
  eps: { x: -6.0, z: -3.6, w: 0.9, d: 1.7 },
  m2: { x: 5.4, z: -4.8, w: 3.6, d: 0.9 },
  pcie: [{ z: -5.9, x0: -6.5, x1: 1.0 }, { z: -8.6, x0: -6.5, x1: -4.3 }, { z: -9.6, x0: -6.5, x1: 1.0 }],
  gpu: { x0: -7.3, x1: 3.3, z: -5.9 },
  chipset: { x: 6.5, z: 5.1, s: 2.8 },
  sata: { x: 11.35, zs: [3.0, 4.1, 5.2] },
  battery: { x: 0, z: 6.3, r: 0.55 },
  headers: [
    { id: 'tablet', x: -4.0, z: 7.85, n: 10, label: 'USB_C1' },
    { id: 'phone', x: 3.4, z: 7.85, n: 10, label: 'USB_C2' },
    { id: 'usb3', x: 6.4, z: 7.85, n: 10, label: 'USB3_1' },
    { id: 'fpanel', x: 9.6, z: 7.85, n: 12, label: 'F_PANEL' },
  ],
  buttons: [{ x: 10.3, z: -8.7 }, { x: 11.15, z: -8.7 }],
  post: { x: 9.0, z: -8.7 },
  holes: [[-9.45, -9.95], [11.45, -9.95], [-9.45, 7.95], [11.45, 7.95], [4.8, -9.95], [-6.6, 7.95]],
  fiber: { x: -2.0, z: -10.2 },     // north-edge header feeding the server racks
  ioPort: { x: -10, z: 0 },         // rear I/O port feeding the laptop
};

export function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// offset a polyline sideways by d, with mitred corners
export function offsetPath(P, d) {
  const out = [];
  for (let k = 0; k < P.length; k++) {
    const a = P[k - 1], b = P[k], c = P[k + 1];
    let n0 = null, n1 = null;
    if (a) { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; n0 = [-(b[1] - a[1]) / l, (b[0] - a[0]) / l]; }
    if (c) { const l = Math.hypot(c[0] - b[0], c[1] - b[1]) || 1; n1 = [-(c[1] - b[1]) / l, (c[0] - b[0]) / l]; }
    let m, s = 1;
    if (n0 && n1) {
      m = [n0[0] + n1[0], n0[1] + n1[1]];
      const l = Math.hypot(m[0], m[1]) || 1;
      m = [m[0] / l, m[1] / l];
      s = 1 / Math.max(0.4, m[0] * n0[0] + m[1] * n0[1]);
    } else m = n0 || n1;
    out.push([b[0] + m[0] * d * s, b[1] + m[1] * d * s]);
  }
  return out;
}

// ---------------------------------------------------------------- layout
export function layoutBoard() {
  const rand = mulberry32(20261112);
  const L = { traces: [], vias: [], pads: [], silk: [], smd: [], keep: [] };
  const trace = (pts, w = 0.042, o = {}) => L.traces.push({ pts, w, ...o });
  const via = (x, z, r = 0.05) => L.vias.push([x, z, r]);
  const pad = (x, z, w, d) => L.pads.push([x, z, w, d]);
  const text = (str, x, z, s = 0.17, o = {}) => L.silk.push({ t: 'text', str, x, z, s, ...o });
  const box = (x, z, w, d, o = {}) => L.silk.push({ t: 'rect', x, z, w, d, ...o });
  const keep = (x0, z0, x1, z1) => L.keep.push([x0, z0, x1, z1]);
  const bundle = (centre, lanes, pitch, w, o = {}) => {
    for (let i = 0; i < lanes; i++) trace(offsetPath(centre, (i - (lanes - 1) / 2) * pitch), w, typeof o === 'function' ? o(i) : o);
  };
  // insert a length-matching serpentine into a straight horizontal/vertical run
  const meander = (a, b, amp, step) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len, nx = -uz, nz = ux;
    const pts = [a], n = Math.max(2, Math.floor(len / step));
    for (let i = 1; i < n; i++) {
      const s = (i % 2 ? 1 : -1) * amp, t0 = (i - 0.5) * (len / n), t1 = (i + 0.5) * (len / n);
      pts.push([a[0] + ux * t0 + nx * s, a[1] + uz * t0 + nz * s], [a[0] + ux * t1 + nx * s, a[1] + uz * t1 + nz * s]);
    }
    pts.push(b);
    return pts;
  };

  // ---- keep-outs for the big parts
  const P = PARTS;
  keep(-2.25, -2.25, 2.25, 2.25);
  keep(-4.2, -2.5, -2.0, 2.5); keep(-2.5, -4.2, 2.5, -2.0);
  keep(-10, -7.7, -7.4, 3.7);
  keep(2.9, -3.3, 5.6, 3.3);
  keep(6.2, -1.7, 7.6, 1.7); keep(-6.7, -4.7, -5.3, -2.5);
  keep(3.4, -5.45, 7.4, -4.15);
  keep(-7.5, -7.9, 3.5, -5.5); keep(-6.7, -8.95, -4.1, -8.25); keep(-6.7, -9.95, 1.2, -9.25);
  keep(4.9, 3.5, 8.1, 6.7);
  keep(10.7, 2.3, 12, 5.9);
  keep(-0.8, 5.55, 0.8, 7.05);
  for (const h of P.headers) keep(h.x - h.n * 0.09 - 0.25, 7.4, h.x + h.n * 0.09 + 0.25, 8.3);
  keep(8.3, -9.4, 11.8, -8.0);
  keep(-2.3, 4.4, 2.3, 5.5);                     // silkscreen logo
  for (const [x, z] of P.holes) keep(x - 0.6, z - 0.6, x + 0.6, z + 0.6);

  // ---- live buses: these also become animated ribbons carrying current
  const live = (bus, speed = 4.4) => () => ({ live: { bus, speed: speed + rand() * 1.2, period: 6 + rand() * 6 }, band: true });
  bundle([[-0.8, 1.9], [-0.8, 2.7], [-4.0, 5.9], [-4.0, 7.6]], 9, 0.11, 0.046, live(2));     // -> tablet header
  bundle([[0.8, 1.9], [0.8, 2.7], [3.4, 5.3], [3.4, 7.6]], 9, 0.11, 0.046, live(3));         // -> phone header
  bundle([[-1.9, 0], [-7.7, 0]], 9, 0.11, 0.046, live(1));                                   // -> rear I/O (laptop)
  bundle([[0, -1.9], [0, -5.7]], 11, 0.11, 0.046, live(0));                                  // -> graphics slot (AI)
  bundle([[-2.0, -6.1], [-2.0, -10.15]], 8, 0.11, 0.046, live(0, 5));                        // -> fibre header (racks)
  for (let i = 0; i < 31; i++) {                                                             // memory bus, length-matched
    const z = -1.5 + i * 0.1, a = [1.9, z], b = [3.05, z];
    const o = i % 2 ? {} : { live: { bus: -1, speed: 3 + rand() * 1.5, period: 3 + rand() * 3 } };
    trace(i % 3 === 1 ? meander(a, b, 0.028, 0.09) : [a, b], 0.04, o);
  }
  bundle([[0, 1.9], [0, 3.25]], 5, 0.11, 0.042, live(-1, 2.6));                               // clock fan-out

  // ---- static routing (printed only)
  // chipset: east to storage, south to headers, north "highway" to the far expansion slot
  for (let i = 0; i < 6; i++) {
    const z = 4.0 + i * 0.36;
    trace([[7.9, z], [9.2, z], [9.6, z + (i < 3 ? -0.4 : 0.4)], [10.8, z + (i < 3 ? -0.4 : 0.4)]], 0.036);
    trace([[7.9, z + 0.09], [9.24, z + 0.09], [9.64, z + (i < 3 ? -0.31 : 0.49)], [10.8, z + (i < 3 ? -0.31 : 0.49)]], 0.036);
  }
  bundle([[6.4, 6.5], [6.4, 7.6]], 10, 0.1, 0.04, { band: true });
  bundle([[7.6, 6.2], [8.2, 6.8], [9.6, 6.8], [9.6, 7.6]], 8, 0.1, 0.04, { band: true });
  const north = [[6.6, 3.7], [6.6, 3.25], [8.7, 1.15], [8.7, -8.35], [7.55, -9.5], [1.2, -9.5]];
  for (let i = 0; i < 14; i++) {
    const pts = offsetPath(north, (i - 6.5) * 0.105);
    if (i % 3 === 0) { const x = pts[2][0]; pts.splice(3, 0, ...meander([x, -1.2 - (i % 2)], [x, -4.6 - (i % 2)], 0.03, 0.1)); }
    trace(pts, 0.038, { band: true });
  }
  for (let i = 0; i < 4; i++) trace([[8.1, -4.55 - i * 0.16], [7.3, -4.55 - i * 0.16]], 0.036);
  // power: wide copper from the connectors to the regulators
  for (let i = 0; i < 3; i++) { const x0 = 6.6 + i * 0.3, zt = -3.5 - i * 0.3; trace([[x0, -1.5], [x0, zt + 0.4], [x0 - 0.4, zt], [2.45, zt]], 0.2, { pwr: true }); }
  for (let i = 0; i < 2; i++) trace([[-5.5, -3.3 - i * 0.5], [-4.6, -3.3 - i * 0.5], [-4.1, -2.8 - i * 0.5 + 0.3]], 0.26, { pwr: true });
  // extra rear-I/O lanes either side of the live bus
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) { const z = s * (0.75 + i * 0.11); trace([[-4.05, z], [-5.2, z], [-5.2 - 0.6, z + s * 0.6], [-7.6, z + s * 0.6]], 0.038); }
  // audio section, fenced off by an isolation gap
  L.silk.push({ t: 'gap', pts: [[-10, 4.25], [-6.3, 4.25], [-5.5, 5.05], [-5.5, 8.5]] });
  for (let i = 0; i < 6; i++) trace([[-7.3 + i * 0.12, 5.75], [-7.3 + i * 0.12, 5.2], [-7.75 + i * 0.12, 4.75], [-9.3, 4.75 - i * 0.0]].slice(0, 3), 0.036);

  // ---- surface-mount parts, placed into free space
  const G = 0.25, cols = Math.ceil(BOARD_W / G), rows = Math.ceil(BOARD_D / G), occ = new Uint8Array(cols * rows);
  const mark = (x0, z0, x1, z1) => {
    for (let i = Math.max(0, Math.floor((x0 - BOARD.x0) / G)); i <= Math.min(cols - 1, Math.floor((x1 - BOARD.x0) / G)); i++)
      for (let j = Math.max(0, Math.floor((z0 - BOARD.z0) / G)); j <= Math.min(rows - 1, Math.floor((z1 - BOARD.z0) / G)); j++) occ[j * cols + i] = 1;
  };
  const isFree = (x0, z0, x1, z1) => {
    if (x0 < BOARD.x0 + 0.5 || x1 > BOARD.x1 - 0.5 || z0 < BOARD.z0 + 0.5 || z1 > BOARD.z1 - 0.5) return false;
    for (let i = Math.floor((x0 - BOARD.x0) / G); i <= Math.floor((x1 - BOARD.x0) / G); i++)
      for (let j = Math.floor((z0 - BOARD.z0) / G); j <= Math.floor((z1 - BOARD.z0) / G); j++) if (occ[j * cols + i]) return false;
    return true;
  };
  for (const k of L.keep) mark(...k);
  for (const t of L.traces) if (t.band) for (let k = 1; k < t.pts.length; k++) {
    const a = t.pts[k - 1], b = t.pts[k], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / G) + 1;
    for (let s = 0; s <= n; s++) { const x = a[0] + (b[0] - a[0]) * (s / n), z = a[1] + (b[1] - a[1]) * (s / n); mark(x - 0.1, z - 0.1, x + 0.1, z + 0.1); }
  }

  const ref = { U: 1, L: 1, Y: 1 };
  const stub = (x, z, ox, oz) => {
    const sg = rand() < 0.5 ? -1 : 1, tx = -oz, tz = ox;
    const a = 0.15 + rand() * 0.35, b = rand() < 0.7 ? 0.15 + rand() * 0.5 : 0, c = 0.2 + rand() * 1.0;
    const p1 = [x + ox * a, z + oz * a], p2 = [p1[0] + (ox + tx * sg) * b, p1[1] + (oz + tz * sg) * b];
    const p3 = rand() < 0.5 ? [p2[0] + ox * c, p2[1] + oz * c] : [p2[0] + tx * sg * c, p2[1] + tz * sg * c];
    if (p3[0] < BOARD.x0 + 0.4 || p3[0] > BOARD.x1 - 0.4 || p3[1] < BOARD.z0 + 0.4 || p3[1] > BOARD.z1 - 0.4) return;
    trace([[x, z], p1, p2, p3], 0.034);
    via(p3[0], p3[1], 0.045);
  };
  const place = (kind, x, z, w, d, ry, extra = {}) => {
    const sx = ry ? d : w, sz = ry ? w : d;
    if (!isFree(x - sx / 2 - 0.22, z - sz / 2 - 0.22, x + sx / 2 + 0.22, z + sz / 2 + 0.22)) return false;
    mark(x - sx / 2 - 0.12, z - sz / 2 - 0.12, x + sx / 2 + 0.12, z + sz / 2 + 0.12);
    L.smd.push({ kind, x, z, w, d, ry, ...extra });
    return true;
  };
  const local = (x, z, ry, lx, lz) => (ry ? [x + lz, z - lx] : [x + lx, z + lz]);

  // a few specific chips first
  place('qfn', 0, 3.75, 1.0, 1.0, 0, { name: 'U' + ref.U++ });
  place('qfp', -2.2, 6.7, 1.5, 1.5, 0, { name: 'U' + ref.U++ });
  place('qfp', -6.9, 6.5, 1.2, 1.2, 0, { name: 'U' + ref.U++ });
  place('soic', 1.9, 6.7, 1.1, 0.6, 0, { name: 'U' + ref.U++ });
  for (let i = 0; i < 6; i++) place('ecap', -9.35 + (i % 3) * 0.6, 5.0 + Math.floor(i / 3) * 0.62, 0.42, 0.42, 0, { gold: true });

  for (let gz = BOARD.z0 + 0.7; gz < BOARD.z1 - 0.5; gz += 0.44) for (let gx = BOARD.x0 + 0.7; gx < BOARD.x1 - 0.5; gx += 0.44) {
    const x = Math.round((gx + (rand() - 0.5) * 0.3) * 8) / 8, z = Math.round((gz + (rand() - 0.5) * 0.3) * 8) / 8;
    const r = rand(), ry = rand() < 0.5 ? 1 : 0;
    if (r < 0.07) {
      const len = 0.7 + Math.floor(rand() * 4) * 0.2;
      place('soic', x, z, len, 0.52 + rand() * 0.12, ry, { name: 'U' + ref.U++ });
    } else if (r < 0.095) {
      const s = 0.8 + Math.floor(rand() * 3) * 0.25;
      place(rand() < 0.5 ? 'qfp' : 'qfn', x, z, s, s, 0, { name: 'U' + ref.U++ });
    } else if (r < 0.36) {
      const n = 2 + Math.floor(rand() * 5), kind = rand() < 0.55 ? 'r' : 'c';
      for (let k = 0; k < n; k++) { const [px, pz] = local(x, z, ry, 0, (k - (n - 1) / 2) * 0.17); place(kind, px, pz, 0.24, 0.12, ry); }
    } else if (r < 0.44) place('ecap', x, z, 0.4, 0.4, 0);
    else if (r < 0.465) place('ind', x, z, 0.55, 0.55, 0, { name: 'L' + ref.L++ });
    else if (r < 0.48) place('xtal', x, z, 0.62, 0.26, ry, { name: 'Y' + ref.Y++ });
    else if (r < 0.53) place('led', x, z, 0.14, 0.1, ry);
    else if (r < 0.66 && isFree(x - 0.2, z - 0.2, x + 0.2, z + 0.2)) { pad(x, z, 0.11, 0.11); if (rand() < 0.6) { via(x + 0.2, z, 0.04); stub(x, z, rand() < 0.5 ? -1 : 1, 0); } }
  }

  // footprints, designators and escape routing for everything placed
  for (const s of L.smd) {
    const { kind, x, z, w, d, ry } = s;
    const W = (lx, lz) => local(x, z, ry, lx, lz), D = (lx, lz) => (ry ? [lz, -lx] : [lx, lz]);
    const rpad = (lx, lz, pw, pd) => { const [px, pz] = W(lx, lz); pad(px, pz, ry ? pd : pw, ry ? pw : pd); };
    if (kind === 'soic') {
      const n = Math.max(3, Math.round((w - 0.16) / 0.17));
      s.leads = n;
      for (let k = 0; k < n; k++) for (const sd of [-1, 1]) {
        const lx = -((n - 1) * 0.17) / 2 + k * 0.17, lz = sd * (d / 2 + 0.1);
        rpad(lx, lz, 0.085, 0.22);
        if (rand() < 0.42) { const [px, pz] = W(lx, lz + sd * 0.1), o = D(0, sd); stub(px, pz, o[0], o[1]); }
      }
      box(x, z, ry ? d : w, ry ? w : d);
    } else if (kind === 'qfp') {
      const n = Math.max(4, Math.round((w - 0.3) / 0.17));
      s.leads = n;
      for (let k = 0; k < n; k++) for (const sd of [-1, 1]) {
        const u = -((n - 1) * 0.17) / 2 + k * 0.17, e = sd * (w / 2 + 0.1);
        pad(x + u, z + e, 0.085, 0.22); pad(x + e, z + u, 0.22, 0.085);
        if (rand() < 0.32) stub(x + u, z + e + sd * 0.1, 0, sd);
        if (rand() < 0.32) stub(x + e + sd * 0.1, z + u, sd, 0);
      }
      box(x, z, w + 0.5, w + 0.5, { corner: true });
    } else if (kind === 'qfn') {
      for (let k = 0; k < 4; k++) if (rand() < 0.9) for (let m = 0; m < 2; m++) { const o = [[0, 1], [1, 0], [0, -1], [-1, 0]][k]; stub(x + o[0] * (w / 2 + 0.02) + o[1] * (m ? 0.2 : -0.2), z + o[1] * (w / 2 + 0.02) + o[0] * (m ? 0.2 : -0.2), o[0], o[1]); }
      box(x, z, w + 0.16, w + 0.16, { corner: true });
    } else if (kind === 'r' || kind === 'c') {
      rpad(-0.1, 0, 0.09, 0.13); rpad(0.1, 0, 0.09, 0.13);
      if (rand() < 0.3) { const sg = rand() < 0.5 ? -1 : 1, o = D(sg, 0), [px, pz] = W(sg * 0.16, 0); stub(px, pz, o[0], o[1]); }
    } else if (kind === 'ecap') {
      rpad(-0.2, 0, 0.14, 0.2); rpad(0.2, 0, 0.14, 0.2);
      L.silk.push({ t: 'circle', x, z, r: 0.27 });
    } else if (kind === 'ind') {
      rpad(-0.3, 0, 0.14, 0.4); rpad(0.3, 0, 0.14, 0.4);
      box(x, z, 0.75, 0.75);
    } else if (kind === 'xtal') {
      rpad(-0.36, 0, 0.12, 0.2); rpad(0.36, 0, 0.12, 0.2);
    } else if (kind === 'led') {
      rpad(-0.1, 0, 0.07, 0.1); rpad(0.1, 0, 0.07, 0.1);
    }
    if (s.name) text(s.name, x - (ry ? d : w) / 2, z - (ry ? w : d) / 2 - 0.3, 0.13, { align: 'left' });
  }

  // ---- stitching vias round the board edge, and via farms near the processor
  for (let x = BOARD.x0 + 0.3; x <= BOARD.x1 - 0.3; x += 0.34) { via(x, BOARD.z0 + 0.22, 0.04); via(x, BOARD.z1 - 0.22, 0.04); }
  for (let z = BOARD.z0 + 0.56; z <= BOARD.z1 - 0.5; z += 0.34) { via(BOARD.x0 + 0.22, z, 0.04); via(BOARD.x1 - 0.22, z, 0.04); }
  for (const [cx, cz] of [[-2.05, 2.05], [2.05, -2.05], [-2.05, -2.05], [2.6, 2.6], [8.9, 2.4], [-5.0, 3.2]])
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) via(cx + i * 0.13 - 0.2, cz + j * 0.13 - 0.2, 0.035);

  // ---- silkscreen: labels people will recognise
  text('CPU_SOCKET', -1.75, 2.45, 0.18, { align: 'left' });
  text('VRM', -4.0, 2.75, 0.16, { align: 'left' });
  P.ram.xs.forEach((x, i) => text(['DIMM_A1', 'DIMM_A2', 'DIMM_B1', 'DIMM_B2'][i], x, 3.2, 0.13, { rot: 90, align: 'left' }));
  text('PCIE_X16_1', 1.3, -5.9, 0.15, { align: 'left' }); text('PCIE_X1', -4.1, -8.6, 0.15, { align: 'left' }); text('PCIE_X16_2', 1.35, -9.75, 0.15, { align: 'left' });
  text('M2_1', 3.6, -5.6, 0.15, { align: 'left' });
  text('ATX_PWR', 7.75, 0, 0.15, { rot: 90, align: 'center' }); text('ATX_12V', -6.0, -2.2, 0.14, { align: 'center' });
  text('SATA6G', 10.55, 4.1, 0.14, { rot: 90, align: 'center' });
  text('BAT1', 0, 7.2, 0.14, { align: 'center' });
  text('CHIPSET', 6.5, 3.3, 0.15, { align: 'center' });
  text('FIBER', -2.0, -9.05, 0.14, { align: 'center' });
  text('AUDIO', -9.4, 8.05, 0.14, { align: 'left' });
  text('PWR   RST', 10.75, -7.75, 0.13, { align: 'center' }); text('POST', 9.0, -7.75, 0.13, { align: 'center' });
  for (const h of P.headers) text(h.label, h.x, 7.2, 0.14, { align: 'center' });
  text('A1 MAINBOARD   REV 1.0', 0, 5.53, 0.12, { align: 'center' });
  L.silk.push({ t: 'logo', x: 0, z: 4.95, w: 3.3 });
  box(0, 0, 4.3, 4.3, { corner: true });
  return L;
}

// ----------------------------------------------------------------- paint
const C = {
  gap: '#07241a', pour: '#0f4735', trace: '#2c9773', pwr: '#278b69', via: '#3fae88', hole: '#051811',
  gold: '#dcb85e', goldDeep: '#b8923e', silk: '#e8f0ea',
};

export function paintBoard(L, width = 4096) {
  const S = width / BOARD_W, height = Math.round(BOARD_D * S);
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const color = mk(width, height), relief = mk(Math.round(width / 2), Math.round(height / 2));
  const X = (x) => (x - BOARD.x0) * S, Z = (z) => (z - BOARD.z0) * S;

  const paint = (canvas, col, isRelief) => {
    const c = canvas.getContext('2d'), k = canvas.width / width;
    c.setTransform(k, 0, 0, k, 0, 0);
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.fillStyle = col.pour; c.fillRect(0, 0, width, height);

    if (!isRelief) {
      // uneven solder mask + the faint weave of the glass fibre beneath it
      const rnd = mulberry32(7);
      for (let i = 0; i < 260; i++) {
        const x = rnd() * width, y = rnd() * height, r = 120 + rnd() * 520;
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, rnd() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.06)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
      }
      const tile = mk(6, 6), tc = tile.getContext('2d');
      tc.fillStyle = 'rgba(255,255,255,0.045)'; tc.fillRect(0, 0, 6, 1); tc.fillRect(0, 0, 1, 6);
      c.fillStyle = c.createPattern(tile, 'repeat'); c.fillRect(0, 0, width, height);
    }

    const stroke = (pts, w, style) => {
      c.strokeStyle = style; c.lineWidth = w * S;
      c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(X(p[0]), Z(p[1])) : c.moveTo(X(p[0]), Z(p[1])))); c.stroke();
    };
    // copper: each trace sits in a dark isolation gap cut out of the ground pour
    for (const t of L.traces) stroke(t.pts, t.w + (t.pwr ? 0.07 : 0.05), col.gap);
    for (const v of L.vias) { c.fillStyle = col.gap; c.beginPath(); c.arc(X(v[0]), Z(v[1]), (v[2] + 0.028) * S, 0, 7); c.fill(); }
    for (const t of L.traces) stroke(t.pts, t.w, t.pwr ? col.pwr : col.trace);
    for (const s of L.silk) if (s.t === 'gap') stroke(s.pts, 0.07, col.gap);
    for (const v of L.vias) {
      c.fillStyle = col.via; c.beginPath(); c.arc(X(v[0]), Z(v[1]), v[2] * S, 0, 7); c.fill();
      c.fillStyle = col.hole; c.beginPath(); c.arc(X(v[0]), Z(v[1]), v[2] * 0.42 * S, 0, 7); c.fill();
    }
    // gold: exposed pads
    for (const p of L.pads) {
      const x = X(p[0] - p[2] / 2), y = Z(p[1] - p[3] / 2), w = p[2] * S, h = p[3] * S;
      c.fillStyle = col.gap; c.fillRect(x - 2.5, y - 2.5, w + 5, h + 5);
      if (isRelief) c.fillStyle = col.gold;
      else { const g = c.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, col.gold); g.addColorStop(1, col.goldDeep); c.fillStyle = g; }
      c.fillRect(x, y, w, h);
    }
    // mounting holes with plated rings
    for (const [hx, hz] of PARTS.holes) {
      c.fillStyle = col.gap; c.beginPath(); c.arc(X(hx), Z(hz), 0.5 * S, 0, 7); c.fill();
      c.fillStyle = col.gold; c.beginPath(); c.arc(X(hx), Z(hz), 0.43 * S, 0, 7); c.fill();
      c.fillStyle = col.hole;
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; c.beginPath(); c.arc(X(hx) + Math.cos(a) * 0.33 * S, Z(hz) + Math.sin(a) * 0.33 * S, 0.035 * S, 0, 7); c.fill(); }
      c.beginPath(); c.arc(X(hx), Z(hz), 0.21 * S, 0, 7); c.fill();
    }
    // silkscreen
    c.fillStyle = col.silk; c.strokeStyle = col.silk;
    for (const s of L.silk) {
      if (s.t === 'text') {
        c.save(); c.translate(X(s.x), Z(s.z)); if (s.rot) c.rotate((-s.rot * Math.PI) / 180);
        c.font = `500 ${s.s * S}px 'JetBrains Mono', ui-monospace, monospace`;
        c.textAlign = s.align || 'center'; c.textBaseline = 'middle';
        c.fillText(s.str, 0, 0); c.restore();
      } else if (s.t === 'rect') {
        c.lineWidth = 0.022 * S;
        const x = X(s.x - s.w / 2), y = Z(s.z - s.d / 2), w = s.w * S, h = s.d * S;
        if (s.corner) {
          const q = Math.min(w, h) * 0.2;
          c.beginPath();
          c.moveTo(x, y + q); c.lineTo(x, y); c.lineTo(x + q, y); c.moveTo(x + w - q, y); c.lineTo(x + w, y); c.lineTo(x + w, y + q);
          c.moveTo(x + w, y + h - q); c.lineTo(x + w, y + h); c.lineTo(x + w - q, y + h); c.moveTo(x + q, y + h); c.lineTo(x, y + h); c.lineTo(x, y + h - q);
          c.stroke();
          c.beginPath(); c.arc(x - 0.09 * S, y - 0.09 * S, 0.04 * S, 0, 7); c.fill();
        } else c.strokeRect(x, y, w, h);
      } else if (s.t === 'circle') {
        c.lineWidth = 0.02 * S; c.beginPath(); c.arc(X(s.x), Z(s.z), s.r * S, 0, 7); c.stroke();
        c.fillRect(X(s.x + s.r * 0.75), Z(s.z) - 0.012 * S, s.r * 0.6 * S, 0.024 * S);
      } else if (s.t === 'logo') {
        const kk = (s.w * S) / LOGO.width;
        c.save(); c.setTransform(k, 0, 0, k, 0, 0);
        const mono = { green: col.silk, greenDeep: col.silk, blue: col.silk, blueLight: col.silk };
        drawLogo(c, X(s.x) - (LOGO.width * kk) / 2, Z(s.z) - (LOGO.height * kk) / 2, kk, col.silk, mono);
        c.restore();
      }
    }
    // board edge
    c.strokeStyle = col.gap; c.lineWidth = 0.1 * S; c.strokeRect(0, 0, width, height);
  };

  paint(color, C, false);
  paint(relief, { gap: '#3c3c3c', pour: '#6e6e6e', trace: '#a8a8a8', pwr: '#a8a8a8', via: '#b0b0b0', hole: '#000000', gold: '#d8d8d8', goldDeep: '#d8d8d8', silk: '#c0c0c0' }, true);
  return { color, relief };
}
