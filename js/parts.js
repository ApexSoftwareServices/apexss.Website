// Everything mounted on the Apex A1 mainboard: processor and socket, power stages, memory,
// the graphics card, connectors and the small surface-mount parts. Large parts are modelled
// individually (bevelled, extruded or lathed); the hundreds of small ones are instanced.
import * as THREE from 'three';
import { PARTS, mulberry32 } from './pcb.js';
import { drawLid, drawBackplate, drawChipsetPlate, drawPostCode, drawLogo, LOGO } from './screens.js';
import { FINISH } from './finish.js';
import * as GEO from './geo.js';

const MONO = "'JetBrains Mono', ui-monospace, Consolas, monospace";
const SANS = "'Space Grotesk', 'Inter', system-ui, sans-serif";
const H = Math.PI / 2;
const SILVER = 0xd3d8e0, GOLD = 0xf0c868, TIN = 0xc9ced6;

const D = new THREE.Object3D(), C = new THREE.Color();
export class Pool {
  constructor(geometry, material, max, shadows = true) {
    this.mesh = new THREE.InstancedMesh(geometry, material, max);
    this.mesh.count = 0; this.max = max;
    this.mesh.castShadow = shadows; this.mesh.receiveShadow = shadows;
  }
  add(x, y, z, sx, sy, sz, color = 0xffffff, ry = 0, rx = 0) {
    const i = this.mesh.count;
    if (i >= this.max) return -1;
    D.position.set(x, y, z); D.rotation.set(rx, ry, 0); D.scale.set(sx, sy, sz); D.updateMatrix();
    this.mesh.setMatrixAt(i, D.matrix);
    this.mesh.setColorAt(i, C.set(color));
    this.mesh.count = i + 1;
    return i;
  }
  done() {
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.computeBoundingSphere();
    return this.mesh;
  }
}

export function buildParts({ L, aniso, accentMat, floorY }) {
  const P = PARTS, rand = mulberry32(170_2026);
  const root = new THREE.Group(), ao = [], fans = [];
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const label = (w, h, draw) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); x.textAlign = 'center'; x.textBaseline = 'middle';
    draw(x, w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
    return t;
  };
  const canvasTex = (canvas) => { const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; return t; };
  const sides = (side, top) => [side, side, top, side, side, side];

  // ---- materials
  const M = {
    nickel: std({ color: 0xe2e5e9, metalness: 1, roughness: 0.46, roughnessMap: FINISH.brushed(1.2) }),
    steel: std({ color: 0xcdd1d7, metalness: 1, roughness: 0.5, roughnessMap: FINISH.satin(1.6) }),
    anod: std({ color: 0x24272d, metalness: 0.9, roughness: 0.58, roughnessMap: FINISH.brushed(0.8) }),
    gun: std({ color: 0x666c77, metalness: 1, roughness: 0.55, roughnessMap: FINISH.brushed(0.8) }),
    titan: std({ color: 0x8d939d, metalness: 1, roughness: 0.52, roughnessMap: FINISH.brushed(0.8) }),
    fin: std({ color: 0xbcc1c9, metalness: 1, roughness: 0.42 }),
    plastic: std({ color: 0x0d0f12, roughness: 0.46 }),
    plasticGrey: std({ color: 0x25282e, roughness: 0.55 }),
    shroud: std({ color: 0x16181c, roughness: 0.44, metalness: 0.1, normalMap: FINISH.grainNormal(3), normalScale: new THREE.Vector2(0.3, 0.3) }),
    pcb: std({ color: 0x0a0c0f, roughness: 0.45 }),
    substrate: std({ color: 0x173527, roughness: 0.5 }),
    gold: std({ color: GOLD, metalness: 1, roughness: 0.3 }),
    brass: std({ color: 0xd8b25a, metalness: 1, roughness: 0.4 }),
    blade: std({ color: 0x1b1e23, roughness: 0.36, metalness: 0.1, side: THREE.DoubleSide }),
    dark: std({ color: 0x050608, roughness: 0.8 }),
    // light bars: lit from inside, with a glossy cover (scene.js sets the colour)
    bar: std({ color: 0x000000, roughness: 0.26, emissive: 0xffffff, emissiveIntensity: 1 }),
  };
  const matteMat = std({ roughness: 0.6, metalness: 0.05 });
  const metalMat = std({ roughness: 0.32, metalness: 1 });

  // ---- placement helpers
  const mesh = (geometry, material) => { const m = new THREE.Mesh(geometry, material); m.castShadow = m.receiveShadow = true; return m; };
  const put = (geometry, material, x = 0, y = 0, z = 0, ry = 0) => { const m = mesh(geometry, material); m.position.set(x, y, z); m.rotation.y = ry; root.add(m); return m; };
  const group = (x, y, z, ry, ...kids) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; for (const k of kids) g.add(k); root.add(g); return g; };
  const at = (m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { m.position.set(x, y, z); m.rotation.set(rx, ry, rz); return m; };
  // soft contact shadow under a part, baked into the board's colour afterwards
  const shade = (x, z, w, d, blur = 0.14, alpha = 0.5, round = false) => ao.push([x, z, w, d, blur, alpha, round]);

  // ---- instanced small parts
  const box = new THREE.BoxGeometry(1, 1, 1);
  const matte = new Pool(box, matteMat, 2400);
  const metal = new Pool(box, metalMat, 7600);
  const cyl = new Pool(new THREE.CylinderGeometry(1, 1, 1, 20), metalMat, 200);
  const accent = new Pool(box, accentMat, 200, false);

  const icTop = std({ roughness: 0.52, metalness: 0.05, map: label(256, 256, (x) => {
    x.fillStyle = '#17191e'; x.fillRect(0, 0, 256, 256);
    x.strokeStyle = 'rgba(255,255,255,0.05)'; x.lineWidth = 5; x.strokeRect(9, 9, 238, 238);
    x.fillStyle = '#30353f'; x.beginPath(); x.arc(40, 216, 12, 0, 7); x.fill();
    x.fillStyle = '#aab3c2'; x.font = `700 54px ${SANS}`; x.fillText('APX', 128, 100);
    x.font = `500 26px ${MONO}`; x.fillText('7401-A', 128, 150);
  }) });
  const ic = new Pool(GEO.softBox(1, 1, 1, 0.07), sides(std({ color: 0x15171b, roughness: 0.58, metalness: 0.05 }), icTop), 400);

  // chip resistors and ceramic capacitors: one textured box each
  const chipTex = (body, text) => label(64, 32, (x) => {
    x.fillStyle = body; x.fillRect(0, 0, 64, 32);
    x.fillStyle = '#c9cdd4'; x.fillRect(0, 0, 13, 32); x.fillRect(51, 0, 13, 32);
    if (text) { x.fillStyle = '#d7dbe2'; x.font = `700 17px ${MONO}`; x.fillText(text, 32, 17); }
  });
  const endMat = std({ color: TIN, metalness: 1, roughness: 0.38 });
  const chip = (body, text, rough) => {
    const side = std({ map: chipTex(body, ''), roughness: rough, metalness: 0.1 }), top = std({ map: chipTex(body, text), roughness: rough, metalness: 0.1 });
    return new Pool(box, [endMat, endMat, top, side, side, side], 1500);
  };
  const res = chip('#0e0f12', '103', 0.5), cer = chip('#b59873', '', 0.62);

  // power chokes: moulded ferrite blocks with a printed value
  const choke = new Pool(GEO.softBox(1, 1, 1, 0.12), sides(std({ color: 0x4b4f57, roughness: 0.8, metalness: 0.15 }), std({ roughness: 0.74, metalness: 0.15, map: label(128, 128, (x) => {
    x.fillStyle = '#42464d'; x.fillRect(0, 0, 128, 128);
    x.fillStyle = '#4d5159'; x.beginPath(); x.roundRect(12, 12, 104, 104, 12); x.fill();
    x.fillStyle = '#c6cbd3'; x.font = `700 46px ${SANS}`; x.fillText('R15', 64, 58);
    x.fillStyle = '#8f96a2'; x.font = `500 15px ${MONO}`; x.fillText('APX 2611', 64, 97);
  }) })), 80);
  const addChoke = (x, z, s = 0.46, h = 0.4) => { choke.add(x, h / 2 + 0.012, z, s, h, s); metal.add(x, 0.012, z, s + 0.07, 0.024, s * 0.5, TIN); shade(x, z, s + 0.05, s + 0.05, 0.1, 0.5); };

  // solid capacitors: an aluminium can with a printed top
  const canBody = new Pool(GEO.can(0.5, 1, 0.07), metalMat, 160);
  const canTop = new Pool((() => { const g = new THREE.CircleGeometry(0.5, 24); g.rotateX(-H); return g; })(), std({ roughness: 0.4, metalness: 0.7, map: label(128, 128, (x) => {
    x.fillStyle = '#dadde2'; x.fillRect(0, 0, 128, 128);
    x.save(); x.beginPath(); x.arc(64, 64, 64, 0, 7); x.clip(); x.fillStyle = '#1b2233'; x.fillRect(0, 0, 128, 44); x.restore();
    x.fillStyle = '#2b303b'; x.font = `700 30px ${MONO}`; x.fillText('561', 64, 76); x.font = `500 17px ${MONO}`; x.fillText('2.5V', 64, 102);
  }) }), 160, false);
  const addCan = (x, z, r, h, color) => {
    canBody.add(x, 0.01, z, r * 2, h, r * 2, color);
    canTop.add(x, h + 0.012, z, r * 1.66, 1, r * 1.66, color === GOLD ? 0xfff1c9 : 0xffffff);
    shade(x, z, r * 2.2, r * 2.2, 0.09, 0.5, true);
  };
  // crystals and other small metal cans
  const pill = new Pool(GEO.softBox(1, 1, 1, 0.3), metalMat, 60);

  // screws: a pan head with a cross recess
  const screwHead = new Pool(GEO.lathe([[0, 0], [1, 0], [1, 0.3], [0.72, 0.82], [0.3, 1], [0, 1]], 20), std({ color: 0xd6dade, metalness: 1, roughness: 0.34 }), 60);
  const screwSlot = new Pool(box, M.dark, 120, false);
  const screw = (x, y, z, r = 0.1, facing = 'up') => {
    const h = r * 0.5, t = h * 1.01, a = r * 1.1, b = r * 0.22, e = r * 0.08;
    if (facing === 'up') { screwHead.add(x, y, z, r, h, r); screwSlot.add(x, y + t, z, a, e, b); screwSlot.add(x, y + t, z, b, e, a); }
    else { screwHead.add(x, y, z, r, h, r, 0xffffff, 0, H); screwSlot.add(x, y, z + t, a, b, e); screwSlot.add(x, y, z + t, b, a, e); }
  };

  // ---- mounting: hex standoffs under the board, screws on top
  const hex = new THREE.CylinderGeometry(0.17, 0.17, -floorY - 0.16, 6);
  for (const [hx, hz] of P.holes) { put(hex, M.brass, hx, (floorY - 0.16) / 2, hz); screw(hx, 0, hz, 0.2); }

  // ---- processor: socket, package and heat spreader under a steel retention frame
  put(GEO.softBox(3.56, 0.14, 3.56, 0.04), M.plastic, 0, 0.07, 0);
  shade(0, 0, 3.62, 3.62, 0.22, 0.62);
  put(GEO.softBox(2.66, 0.07, 2.66, 0.012), M.substrate, 0, 0.175, 0);
  put(GEO.plate(2.52, 2.52, 0.07, 0.1, 0.014), M.nickel, 0, 0.245, 0);
  put(GEO.plate(2.22, 2.22, 0.2, 0.2, 0.035), M.nickel, 0, 0.34, 0);
  const lidTex = drawLid();
  const lidMat = std({ map: canvasTex(lidTex.face), metalness: 1, roughness: 0.5, roughnessMap: FINISH.brushed(1), emissive: 0xffffff, emissiveMap: canvasTex(lidTex.glow), emissiveIntensity: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const lidFace = at(new THREE.Mesh(GEO.roundedPlane(2.1, 2.1, 0.15), lidMat), 0, 0.4415, 0, -H);
  lidFace.receiveShadow = true; root.add(lidFace);
  const frameShape = GEO.roundedShape(3.2, 3.2, 0.18); frameShape.holes.push(GEO.roundedShape(2.32, 2.32, 0.22));
  const frame = put(GEO.extrude(frameShape, 0.06, 0.014), M.steel, 0, 0.3, 0); frame.rotation.x = -H;
  put(new THREE.CylinderGeometry(0.065, 0.065, 2.5, 16), M.steel, 0, 0.27, -1.7).rotation.z = H;         // hinge
  put(new THREE.CylinderGeometry(0.032, 0.032, 3.0, 12), M.steel, 1.71, 0.31, -0.1).rotation.x = H;      // load lever
  put(new THREE.CylinderGeometry(0.032, 0.032, 0.3, 12), M.steel, 1.84, 0.31, 1.4).rotation.z = H;
  put(GEO.softBox(0.22, 0.06, 0.14, 0.025), M.steel, 2.02, 0.31, 1.4);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) screw(sx * 1.36, 0.33, sz * 1.36, 0.1);

  // ---- power stages: two extruded heatsinks, chokes and capacitors around the socket
  const sinkProfile = (w, h) => {
    const pts = [[-w / 2, 0], [-w / 2, h - 0.05], [-w / 2 + 0.05, h], [-w / 2 + 0.4, h], [-w / 2 + 0.44, h - 0.04]];
    const n = 5, fin = 0.075, gap = (w - 0.44 - n * fin) / n, base = 0.2;
    let x = -w / 2 + 0.44;
    for (let i = 0; i < n; i++) {
      const fh = h - 0.12 - i * 0.08;
      pts.push([x, base], [x + gap, base], [x + gap, fh - 0.02], [x + gap + 0.02, fh], [x + gap + fin - 0.02, fh], [x + gap + fin, fh - 0.02]);
      x += gap + fin;
    }
    pts.push([w / 2, 0]);
    return GEO.polygon(pts);
  };
  const heatsink = (cx, cz, w, len, ry) => {
    const h = 0.98;
    group(cx, 0.03, cz, ry, mesh(GEO.extrude(sinkProfile(w, h), len, 0.015, 4, 1), M.titan), at(mesh(GEO.softBox(0.07, 0.03, len - 0.5, 0.012), M.bar), -w / 2 + 0.22, h + 0.012, 0));
  };
  heatsink(P.vrmW.x, P.vrmW.z, P.vrmW.w, P.vrmW.d, 0);
  heatsink(P.vrmN.x, P.vrmN.z, P.vrmN.d, P.vrmN.w, -H);
  shade(P.vrmW.x, P.vrmW.z, P.vrmW.w + 0.06, P.vrmW.d + 0.06, 0.2, 0.6); shade(P.vrmN.x, P.vrmN.z, P.vrmN.w + 0.06, P.vrmN.d + 0.06, 0.2, 0.6);
  for (let k = -3; k <= 3; k++) {
    addChoke(-2.33, k * 0.56); addChoke(k * 0.56, -2.33);
    addCan(-4.32, k * 0.56, 0.15, 0.42, k % 2 ? 0x2a2e37 : SILVER); addCan(k * 0.56, -4.32, 0.15, 0.42, k % 2 ? SILVER : 0x2a2e37);
  }

  // ---- rear I/O: ports under a sculpted cover
  const io = GEO.polygon([[-9.86, 0.12], [-9.86, 1.42], [-9.78, 1.5], [-8.6, 1.5], [-7.68, 0.98], [-7.62, 0.88], [-7.62, 0.12]]);
  put(GEO.extrude(io, 10.7, 0.02, 4, 1), M.anod, 0, 0, -2.0);
  put(GEO.softBox(0.07, 0.03, 9.7, 0.012), M.bar, -8.12, 1.262, -2.0).rotation.z = -0.515;
  put(GEO.softBox(0.03, 0.05, 9.9, 0.01), M.bar, -7.6, 0.3, -2.0);
  shade(-8.74, -2.0, 2.34, 10.8, 0.26, 0.62);
  [[-6.6, 0.8, 1.15], [-5.5, 0.9, 0.5], [-4.4, 0.8, 1.15], [-3.2, 0.9, 1.25], [-1.9, 0.8, 1.15], [0, 1.1, 0.55], [1.5, 0.9, 1.25], [2.7, 0.7, 1.1]].forEach(([z, d, h]) => {
    metal.add(-9.9, h / 2 + 0.02, z, 0.16, h, d, 0xc9ced6);
    matte.add(-9.985, h / 2 + 0.02, z, 0.02, h * 0.6, d * 0.72, 0x07080a);
  });
  const ioLogo = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4 * LOGO.height / LOGO.width), std({ transparent: true, roughness: 0.6, metalness: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, map: label(512, 130, (x) => drawLogo(x, 1, 1, 510 / LOGO.width, '#c9ced6')) }));
  at(ioLogo, -9.2, 1.5215, -2.0, -H, 0, H); root.add(ioLogo);

  // ---- memory: four slots, four modules with heat spreaders and light bars
  const len = P.ram.len, sl = len - 0.5, y0 = 0.36, y1 = 1.3;
  const spreader = GEO.extrude(GEO.polygon([[-sl / 2, y0], [sl / 2, y0], [sl / 2, y1 - 0.24], [sl / 2 - 0.36, y1], [-sl / 2 + 0.36, y1], [-sl / 2, y1 - 0.24]]), 0.15, 0.016, 4, 1);
  spreader.rotateY(H);
  const slot = GEO.softBox(0.3, 0.24, len + 0.36, 0.03), latch = GEO.softBox(0.27, 0.5, 0.16, 0.035), stick = new THREE.BoxGeometry(0.045, 1.0, len - 0.4), lightBar = GEO.softBox(0.1, 0.09, sl - 0.9, 0.04);
  P.ram.xs.forEach((x, i) => {
    put(slot, i % 2 ? M.plasticGrey : M.plastic, x, 0.12, 0);
    for (const s of [-1, 1]) put(latch, M.plasticGrey, x, 0.37, s * (len / 2 + 0.11));
    put(stick, M.pcb, x, 0.74, 0);
    put(spreader, M.anod, x, 0, 0);
    put(lightBar, M.bar, x, y1 + 0.03, 0);
    shade(x, 0, 0.34, len + 0.5, 0.12, 0.55);
  });

  // ---- power connectors: nylon housings with their pin cavities
  const cavities = (cols, rows) => label(cols * 40, rows * 40, (x, w, h) => {
    x.fillStyle = '#0f1114'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const a = i * 40 + 6, b = j * 40 + 6;
      x.fillStyle = '#030304'; x.beginPath(); if ((i + j) % 2) x.roundRect(a, b, 28, 28, 3); else { x.moveTo(a, b); x.lineTo(a + 28, b); x.lineTo(a + 28, b + 20); x.lineTo(a + 20, b + 28); x.lineTo(a, b + 28); } x.fill();
      x.fillStyle = '#a8894a'; x.fillRect(a + 10, b + 10, 8, 8);
    }
  });
  const connector = (cx, cz, w, d, cols, rows) => {
    put(GEO.softBox(w, 0.78, d, 0.04), sides(M.plastic, std({ roughness: 0.5, map: cavities(cols, rows) })), cx, 0.4, cz);
    put(GEO.softBox(0.07, 0.5, d * 0.22, 0.02), M.plastic, cx + w / 2 + 0.03, 0.5, cz);
    shade(cx, cz, w + 0.06, d + 0.06, 0.16, 0.58);
  };
  connector(P.atx.x, P.atx.z, P.atx.w, P.atx.d, 2, 12);
  connector(P.eps.x, P.eps.z, P.eps.w, P.eps.d, 2, 4);

  // ---- M.2 drive under a ridged heatsink
  const ridges = GEO.extrude(GEO.comb(P.m2.d, 7, 0.12, 0.09, 0.155, 0.012), P.m2.w, 0.014, 4, 1); ridges.rotateY(H);
  put(ridges, M.gun, P.m2.x, 0.1, P.m2.z);
  put(new THREE.BoxGeometry(P.m2.w - 0.1, 0.04, P.m2.d - 0.1), M.pcb, P.m2.x, 0.08, P.m2.z);
  screw(P.m2.x + P.m2.w / 2 - 0.22, 0.265, P.m2.z, 0.09);
  accent.add(P.m2.x - P.m2.w / 2 + 0.2, 0.262, P.m2.z, 0.05, 0.012, P.m2.d * 0.6);
  shade(P.m2.x, P.m2.z, P.m2.w + 0.04, P.m2.d + 0.04, 0.12, 0.5);

  // ---- expansion slots
  const slotTop = (n) => std({ roughness: 0.5, map: label(n * 8, 24, (x, w, h) => {
    x.fillStyle = '#0d0f12'; x.fillRect(0, 0, w, h); x.fillStyle = '#020203'; x.fillRect(6, 8, w - 12, 8);
    x.fillStyle = '#b8964e'; for (let i = 2; i < n - 1; i++) { if (i === Math.round(n * 0.16)) continue; x.fillRect(i * 8, 8, 3, 2.5); x.fillRect(i * 8, 13.5, 3, 2.5); }
  }) });
  P.pcie.forEach((s, i) => {
    const w = s.x1 - s.x0, cx = (s.x0 + s.x1) / 2;
    put(GEO.softBox(w, 0.42, 0.3, 0.03), sides(M.plastic, slotTop(Math.round(w * 14))), cx, 0.21, s.z);
    if (i !== 1) for (const t of [-1, 1]) put(GEO.softBox(w + 0.04, 0.4, 0.025, 0.01), M.steel, cx, 0.2, s.z + t * 0.165);
    put(GEO.softBox(0.3, 0.5, 0.38, 0.04), M.plasticGrey, s.x1 + 0.17, 0.25, s.z);
    shade(cx + 0.08, s.z, w + 0.4, 0.42, 0.12, 0.52);
  });

  // ---- graphics card: the AI accelerator, standing in the first slot
  const gx0 = P.gpu.x0, gx1 = P.gpu.x1, gcx = (gx0 + gx1) / 2, glen = gx1 - gx0, gz = P.gpu.z, gy = 2.62;
  put(new THREE.BoxGeometry(6.5, 4.05, 0.06), M.pcb, gcx - 1.9, 2.5, gz);                 // a short board: the last fan blows straight through
  put(new THREE.BoxGeometry(7.2, 0.12, 0.05), M.gold, (P.pcie[0].x0 + P.pcie[0].x1) / 2, 0.45, gz);
  const plateShape = GEO.roundedShape(glen, 4.2, 0.14);
  for (let i = 0; i < 8; i++) { const x = 1.5 + i * 0.38; plateShape.holes.push(new THREE.Path([[x, -1.5], [x + 0.2, -1.5], [x + 0.95, 1.5], [x + 0.75, 1.5]].map((q) => new THREE.Vector2(q[0], q[1])))); }
  // the printed face is the plate's own front surface (its UVs are in board units), so the big area is shaded once
  const plateTex = drawBackplate(), faceMap = canvasTex(plateTex.face), glowMap = canvasTex(plateTex.glow);
  for (const t of [faceMap, glowMap]) { t.repeat.set(1 / glen, 1 / 4.2); t.offset.set(0.5, 0.5); }
  const gpuMat = std({ map: faceMap, metalness: 0.9, roughness: 0.62, roughnessMap: FINISH.brushed(1.5, 0.6), emissive: 0xffffff, emissiveMap: glowMap, emissiveIntensity: 0 });
  put(GEO.extrude(plateShape, 0.08, 0.015, 8, 1), [gpuMat, M.gun], gcx, gy, gz + 0.09);
  for (const [sx, sy] of [[-5.0, 1.85], [5.0, 1.85], [-5.0, -1.85], [5.0, -1.85], [0.9, 0.75], [2.9, 0.75], [0.9, -1.25], [2.9, -1.25]]) screw(gcx + sx, gy + sy, gz + 0.13, 0.075, 'front');
  // the cooler: a fin stack between the board and a three-fan shroud
  put(GEO.finStack(glen - 0.8, 3.75, 1.16, 44, 'x', 0.03), M.fin, gcx - 0.05, gy, gz - 0.7);
  for (const y of [-1.2, 0, 1.2]) put(new THREE.CylinderGeometry(0.06, 0.06, glen - 0.9, 10), M.nickel, gcx - 0.05, gy + y, gz - 0.2).rotation.z = H;
  const shroudShape = GEO.roundedShape(glen, 4.3, 0.34);
  for (let i = 0; i < 3; i++) shroudShape.holes.push(GEO.circlePath((i - 1) * 3.4, 0, 1.45));
  put(GEO.extrude(shroudShape, 0.5, 0.045, 28, 2), M.shroud, gcx, gy, gz - 1.47);
  for (const s of [-1, 1]) put(GEO.softBox(glen - 0.5, 0.05, 0.34, 0.02), M.shroud, gcx, gy + s * 2.1, gz - 1.08);              // top and bottom rails
  put(GEO.softBox(glen - 1.4, 0.06, 0.12, 0.02), M.bar, gcx, gy + 2.13, gz + 0.04);
  put(GEO.softBox(glen - 1.2, 0.045, 0.03, 0.01), M.bar, gcx, gy - 2.0, gz - 1.725);
  put(GEO.softBox(0.05, 4.6, 1.8, 0.02), M.steel, gx0 - 0.04, 2.45, gz - 0.78);                                                 // slot bracket
  for (let i = 0; i < 4; i++) matte.add(gx0 - 0.07, 1.3 + i * 0.75, gz - 0.55, 0.02, 0.5, i === 3 ? 0.6 : 0.42, 0x07080a);
  put(GEO.softBox(1.3, 0.2, 0.5, 0.03), M.plastic, gx1 - 1.2, gy + 2.2, gz - 0.62);                                             // power socket
  const bladeGeo = GEO.fanBlades(1.36, 0.44, 9), hubGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.22, 32), strut = GEO.softBox(2.9, 0.09, 0.05, 0.02);
  hubGeo.rotateX(H);
  const sticker = std({ roughness: 0.4, metalness: 0.3, map: label(256, 256, (x) => {
    x.fillStyle = '#101216'; x.fillRect(0, 0, 256, 256);
    x.strokeStyle = '#3a404b'; x.lineWidth = 4; x.beginPath(); x.arc(128, 128, 112, 0, 7); x.stroke();
    drawLogo(x, 128 - (LOGO.width * 1.0) / 2, 128 - (LOGO.height * 1.0) / 2, 1.0, '#d5dae2');
  }) });
  for (let i = 0; i < 3; i++) {
    const fx = gcx + (i - 1) * 3.4, fz = gz - 1.5;
    for (const a of [0.5, 0.5 + 2.094, 0.5 + 4.188]) at(put(strut, M.shroud, fx, gy, fz + 0.2), fx, gy, fz + 0.2, 0, 0, a);
    const rotor = new THREE.Group(); rotor.position.set(fx, gy, fz);
    const blades = mesh(bladeGeo, M.blade), hub = mesh(hubGeo, M.shroud);
    const cap = at(new THREE.Mesh(new THREE.CircleGeometry(0.4, 32), sticker), 0, 0, -0.112, 0, Math.PI, 0);
    const ring = at(new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.014, 8, 40), accentMat), 0, 0, -0.1);
    rotor.add(blades, hub, cap, ring);
    root.add(rotor); fans.push(rotor);
  }
  shade(gcx, gz - 0.8, glen + 0.2, 2.0, 0.5, 0.42);

  // ---- chipset heatsink, storage ports, battery, headers, buttons, status display
  const cs = P.chipset.s, cut = 0.36;
  const csShape = GEO.polygon([[-cs / 2 + cut, -cs / 2], [cs / 2 - cut, -cs / 2], [cs / 2, -cs / 2 + cut], [cs / 2, cs / 2 - cut], [cs / 2 - cut, cs / 2], [-cs / 2 + cut, cs / 2], [-cs / 2, cs / 2 - cut], [-cs / 2, -cs / 2 + cut]]);
  put(GEO.extrude(csShape, 0.3, 0.03, 4, 2), M.anod, P.chipset.x, 0.19, P.chipset.z).rotation.x = -H;
  const chipPlate = at(new THREE.Mesh(GEO.roundedPlane(cs * 0.8, cs * 0.8, 0.12), std({ map: canvasTex(drawChipsetPlate()), metalness: 0.9, roughness: 0.6, roughnessMap: FINISH.brushed(1), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })), P.chipset.x, 0.3415, P.chipset.z, -H);
  chipPlate.receiveShadow = true; root.add(chipPlate);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) screw(P.chipset.x + sx * (cs / 2 - 0.2), 0.34, P.chipset.z + sz * (cs / 2 - 0.62), 0.07);
  accent.add(P.chipset.x - cs / 2 + 0.09, 0.345, P.chipset.z, 0.04, 0.012, cs * 0.42);
  shade(P.chipset.x, P.chipset.z, cs + 0.06, cs + 0.06, 0.18, 0.55);
  for (const z of P.sata.zs) {
    put(GEO.softBox(1.0, 0.74, 0.86, 0.04), M.plastic, P.sata.x, 0.38, z);
    for (const y of [0.22, 0.56]) matte.add(P.sata.x + 0.505, y, z, 0.01, 0.16, 0.62, 0x050607);
    shade(P.sata.x, z, 1.06, 0.92, 0.14, 0.55);
  }
  cyl.add(P.battery.x, 0.05, P.battery.z, 0.6, 0.1, 0.6, 0x15171b);
  put(GEO.can(0.5, 0.13, 0.03, 40), M.steel, P.battery.x, 0.1, P.battery.z);
  const cell = at(new THREE.Mesh(new THREE.CircleGeometry(0.44, 40), std({ metalness: 0.8, roughness: 0.62, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, map: label(256, 256, (x) => {
    x.fillStyle = '#b4b8bf'; x.fillRect(0, 0, 256, 256);
    x.fillStyle = '#5b616c'; x.font = `600 46px ${SANS}`; x.fillText('+', 128, 66); x.font = `600 34px ${SANS}`; x.fillText('CR2032', 128, 132); x.font = `500 24px ${MONO}`; x.fillText('3V', 128, 180);
  }) })), P.battery.x, 0.2315, P.battery.z, -H);
  root.add(cell);
  metal.add(P.battery.x + 0.56, 0.14, P.battery.z, 0.1, 0.24, 0.3, GOLD);
  shade(P.battery.x, P.battery.z, 1.26, 1.26, 0.12, 0.5, true);
  for (const h of P.headers) {
    const w = (h.n / 2) * 0.18 + 0.2;
    matte.add(h.x, 0.1, h.z, w, 0.2, 0.42, 0x15171b);
    for (let i = 0; i < h.n / 2; i++) for (const s of [-1, 1]) metal.add(h.x + (i - (h.n / 2 - 1) / 2) * 0.18, 0.3, h.z + s * 0.09, 0.032, 0.26, 0.032, GOLD);
    if (h.id === 'tablet' || h.id === 'phone') put(GEO.softBox(w + 0.08, 0.34, 0.5, 0.04), M.plasticGrey, h.x, 0.36, h.z);
    shade(h.x, h.z, w + 0.06, 0.48, 0.1, 0.5);
  }
  put(GEO.softBox(1.5, 0.34, 0.4, 0.04), M.gun, P.fiber.x, 0.17, P.fiber.z);
  accent.add(P.fiber.x, 0.345, P.fiber.z, 1.2, 0.012, 0.05);
  shade(P.fiber.x, P.fiber.z, 1.56, 0.46, 0.1, 0.5);
  const buttonRing = new THREE.RingGeometry(0.17, 0.25, 32);
  for (const b of P.buttons) {
    put(GEO.softBox(0.62, 0.14, 0.62, 0.04), M.plasticGrey, b.x, 0.07, b.z);
    put(GEO.can(0.25, 0.1, 0.03, 28), M.plastic, b.x, 0.14, b.z);
    root.add(at(new THREE.Mesh(buttonRing, accentMat), b.x, 0.243, b.z, -H));
    shade(b.x, b.z, 0.68, 0.68, 0.08, 0.5);
  }
  put(GEO.softBox(1.0, 0.4, 0.7, 0.04), M.plastic, P.post.x, 0.2, P.post.z);
  const postMat = new THREE.MeshBasicMaterial({ map: canvasTex(drawPostCode()), toneMapped: false });
  root.add(at(new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.56), postMat), P.post.x, 0.403, P.post.z, -H));
  shade(P.post.x, P.post.z, 1.06, 0.76, 0.12, 0.55);

  // ---- surface-mount parts from the layout
  for (const s of L.smd) {
    const { kind, x, z, w, d } = s, ry = s.ry ? H : 0;
    const Wd = (lx, lz) => (s.ry ? [x + lz, z - lx] : [x + lx, z + lz]);
    if (kind === 'soic') {
      ic.add(x, 0.13, z, w, 0.2, d, 0xffffff, ry);
      for (let k = 0; k < s.leads; k++) for (const sd of [-1, 1]) {
        const [px, pz] = Wd(-((s.leads - 1) * 0.17) / 2 + k * 0.17, sd * (d / 2 + 0.06));
        metal.add(px, 0.04, pz, 0.07, 0.05, 0.2, TIN, ry);
      }
      shade(x, z, (s.ry ? d : w) + 0.2, (s.ry ? w : d) + 0.2, 0.08, 0.5);
    } else if (kind === 'qfp') {
      ic.add(x, 0.12, z, w, 0.18, w);
      for (let k = 0; k < s.leads; k++) for (const sd of [-1, 1]) {
        const u = -((s.leads - 1) * 0.17) / 2 + k * 0.17, e = sd * (w / 2 + 0.06);
        metal.add(x + u, 0.04, z + e, 0.07, 0.05, 0.2, TIN);
        metal.add(x + e, 0.04, z + u, 0.2, 0.05, 0.07, TIN);
      }
      shade(x, z, w + 0.24, w + 0.24, 0.09, 0.5);
    } else if (kind === 'qfn') { ic.add(x, 0.065, z, w, 0.1, w); shade(x, z, w + 0.06, w + 0.06, 0.06, 0.45); }
    else if (kind === 'r') res.add(x, 0.045, z, 0.22, 0.08, 0.11, 0xffffff, ry);
    else if (kind === 'c') cer.add(x, 0.055, z, 0.22, 0.1, 0.11, 0xffffff, ry);
    else if (kind === 'ecap') addCan(x, z, 0.17, s.gold ? 0.5 : 0.4, s.gold ? GOLD : rand() < 0.6 ? SILVER : 0x2a2e37);
    else if (kind === 'ind') addChoke(x, z, 0.5, 0.4);
    else if (kind === 'xtal') { pill.add(x, 0.085, z, 0.6, 0.15, 0.24, 0xd0d5dc, ry); shade(x, z, s.ry ? 0.28 : 0.64, s.ry ? 0.64 : 0.28, 0.06, 0.45); }
    else if (kind === 'led') accent.add(x, 0.04, z, 0.14, 0.07, 0.1, 0xffffff, ry);
    if (kind === 'r' || kind === 'c') ao.push([x, z, s.ry ? 0.15 : 0.26, s.ry ? 0.26 : 0.15, 0, 0.32, false]);
  }

  root.add(matte.done(), metal.done(), cyl.done(), accent.done(), ic.done(), res.done(), cer.done(), choke.done(), canBody.done(), canTop.done(), pill.done(), screwHead.done(), screwSlot.done());
  return { root, ao, fans, lidMat, gpuMat, postMat, barMat: M.bar };
}
