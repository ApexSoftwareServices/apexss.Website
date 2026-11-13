// The fabrication stage: every service has a "build" that starts as an exploded view and
// comes together as the visitor scrolls through, or clicks, that service.
// Builds are modelled as real objects: bevelled metal and glass, working fans, lit screens.
import * as THREE from 'three';
import { FLOOR_Y, GLOW_BLEND } from './world.js';
import { ART } from './art.js';

export const FORGE = new THREE.Vector3(31, FLOOR_Y, 2);
const TAU = Math.PI * 2;

// --------------------------------------------------------------- materials
function materials(accentMat) {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);
  const brushed = ART.brushed();
  const lit = (color, glow) => std({ color, roughness: 0.32, metalness: 0.15, emissive: glow, emissiveIntensity: 0.4 });
  const screens = [], layers = [];   // tracked so their brightness can follow the colour mode
  return {
    screens, layers,
    alu: std({ color: 0xd3d8df, metalness: 1, roughness: 0.62, roughnessMap: brushed }),
    aluDark: std({ color: 0x4a505b, metalness: 1, roughness: 0.66, roughnessMap: brushed }),
    titanium: std({ color: 0x9a9fa8, metalness: 1, roughness: 0.4 }),
    steelWhite: std({ color: 0xf1f2f4, metalness: 0.15, roughness: 0.42 }),
    steelBlack: std({ color: 0x16181d, metalness: 0.35, roughness: 0.48 }),
    plastic: std({ color: 0x0e1014, metalness: 0, roughness: 0.58 }),
    rubber: std({ color: 0x191b1f, roughness: 0.9 }),
    white: std({ color: 0xf5f6f8, roughness: 0.36, metalness: 0 }),
    beige: std({ color: 0xcbc3ad, roughness: 0.72 }),
    beigeDark: std({ color: 0xa9a18b, roughness: 0.75 }),
    gold: std({ color: 0xe2b65d, metalness: 1, roughness: 0.28 }),
    copper: std({ color: 0xcd7f45, metalness: 1, roughness: 0.3 }),
    blade: std({ color: 0x2b3038, roughness: 0.42, metalness: 0.2, side: THREE.DoubleSide }),
    glass: phys({ color: 0xffffff, metalness: 0, roughness: 0.03, transparent: true, opacity: 0.13, envMapIntensity: 2.4, clearcoat: 1, clearcoatRoughness: 0.04, depthWrite: false, side: THREE.DoubleSide }),
    glassDark: phys({ color: 0x05070a, metalness: 0.25, roughness: 0.07, clearcoat: 1, clearcoatRoughness: 0.05 }),
    backGlass: phys({ color: 0x2a3140, metalness: 0.4, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.1 }),
    frost: phys({ color: 0xffffff, metalness: 0, roughness: 0.3, transparent: true, opacity: 0.86, clearcoat: 0.6 }),
    cloud: phys({ color: 0xffffff, metalness: 0, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.2 }),
    crystal: phys({ color: 0xdfeaf6, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.34, envMapIntensity: 2.2, clearcoat: 1, depthWrite: false }),
    lens: phys({ color: 0x060a16, metalness: 0.7, roughness: 0.03, clearcoat: 1 }),
    blue: lit(0x1b9be0, 0x0a5a8c), green: lit(0x86c52a, 0x3d6c0a), orange: lit(0xf7941d, 0x8a4a00),
    softbox: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    accent: accentMat,
    // lit screens and the transparent interface layers that stack on them
    screen: (t) => { const m = std({ color: 0x000000, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.96, roughness: 0.18, metalness: 0 }); screens.push(m); return m; },
    layer: (t) => { const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }); layers.push(m); return m; },
    printed: (t, o = {}) => std({ map: t, roughness: 0.5, metalness: 0.2, ...o }),
  };
}

// --------------------------------------------------------------- geometry
const geo = new Map();
const cached = (key, make) => { if (!geo.has(key)) geo.set(key, make()); return geo.get(key); };
function roundedShape(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  r = Math.max(0.001, Math.min(r, Math.min(w, h) / 2 - 0.001));
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
const G = {
  // a box with softened edges: corners rounded by r in the XY face, rims bevelled
  rbox: (w, h, d, r = 0.03) => cached(`r${w}|${h}|${d}|${r}`, () => {
    const b = Math.min(0.016, Math.min(w, h, d) * 0.3);
    const g = new THREE.ExtrudeGeometry(roundedShape(w - b * 2, h - b * 2, Math.max(0.004, r - b)), { depth: d - b * 2, bevelEnabled: true, bevelSize: b, bevelThickness: b, bevelSegments: 2, curveSegments: 8 });
    g.translate(0, 0, -(d - b * 2) / 2);
    return g;
  }),
  rplane: (w, h, r = 0.05) => cached(`p${w}|${h}|${r}`, () => {
    const g = new THREE.ShapeGeometry(roundedShape(w, h, r), 8), p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
    return g;
  }),
  cyl: (r, h, r2 = r, seg = 36) => cached(`c${r}|${h}|${r2}|${seg}`, () => new THREE.CylinderGeometry(r2, r, h, seg)),
  sph: (r) => cached(`o${r}`, () => new THREE.SphereGeometry(r, 32, 20)),
  torus: (R, r) => cached(`t${R}|${r}`, () => new THREE.TorusGeometry(R, r, 10, 56)),
  cone4: (r, h) => cached(`k${r}|${h}`, () => { const g = new THREE.ConeGeometry(r, h, 4); g.rotateY(Math.PI / 4); return g; }),
  capsule: (r, len) => cached(`u${r}|${len}`, () => new THREE.CapsuleGeometry(r, len, 8, 20)),
  // swept, pitched fan blades around a hub, lying in the XY plane
  fan: (R, hub, n) => cached(`f${R}|${hub}|${n}`, () => {
    const pos = [], idx = [], S = 6;
    for (let b = 0; b < n; b++) {
      const a0 = (b / n) * TAU, base = pos.length / 3;
      for (let i = 0; i <= S; i++) {
        const s = i / S, r = hub + s * (R - hub), sweep = s * 0.6, half = 0.33 - 0.13 * s, z = 0.05 * (1 - 0.35 * s);
        pos.push(Math.cos(a0 + sweep + half) * r, Math.sin(a0 + sweep + half) * r, z, Math.cos(a0 + sweep - half) * r, Math.sin(a0 + sweep - half) * r, -z);
      }
      for (let i = 0; i < S; i++) { const k = base + i * 2; idx.push(k, k + 1, k + 2, k + 2, k + 1, k + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  }),
  // a stack of thin plates (heatsink fins), merged into one geometry
  fins: (w, h, d, n, axis) => cached(`n${w}|${h}|${d}|${n}|${axis}`, () => {
    const parts = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1) - 0.5;
      const b = axis === 'x' ? new THREE.BoxGeometry(0.014, h, d) : axis === 'y' ? new THREE.BoxGeometry(w, 0.014, d) : new THREE.BoxGeometry(w, h, 0.014);
      b.translate(axis === 'x' ? t * w : 0, axis === 'y' ? t * h : 0, axis === 'z' ? t * d : 0);
      parts.push(b.toNonIndexed());
    }
    let total = 0; for (const p of parts) total += p.attributes.position.count;
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
    let o = 0;
    for (const p of parts) { pos.set(p.attributes.position.array, o * 3); nor.set(p.attributes.normal.array, o * 3); uv.set(p.attributes.uv.array, o * 2); o += p.attributes.position.count; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  }),
};

// ------------------------------------------------------------- blueprints
// Each returns parts in assembly order: { o: Object3D, p: final position, f: exploded offset, r: rotation }
function blueprints(M) {
  const mesh = (g, m) => new THREE.Mesh(g, m);
  const group = (...kids) => { const g = new THREE.Group(); for (const k of kids) if (k) g.add(k); return g; };
  const at = (o, x = 0, y = 0, z = 0, rx, ry = 0, rz = 0) => { o.position.set(x, y, z); if (rx !== undefined) o.rotation.set(rx, ry, rz); return o; };
  const part = (o, p, f, r) => ({ o, p, f, r: r || [o.rotation.x, o.rotation.y, o.rotation.z] });
  const box = (w, h, d, m, r = 0.03) => mesh(G.rbox(w, h, d, r), m);
  // a floor plate: w across, d deep, t thick, lying flat
  const plate = (w, d, t, m, r = 0.05) => { const o = mesh(G.rbox(w, d, t, r), m); o.rotation.x = -Math.PI / 2; return o; };
  const face = (w, h, m, r = 0.04) => mesh(G.rplane(w, h, r), m);
  const floorFace = (w, d, m, r = 0.04) => { const o = face(w, d, m, r); o.rotation.x = -Math.PI / 2; return o; };
  let order = 10;
  const layer = (w, h, t, r = 0.04) => { const m = face(w, h, M.layer(t), r); m.renderOrder = order++; m.userData.noShadow = true; return m; };
  const tube = (pts, r, m) => mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 40, r, 8), m);
  const rod = (a, b, r, m) => {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), o = mesh(G.cyl(r, 1, r, 10), m);
    o.scale.y = va.distanceTo(vb); o.position.copy(va).add(vb).multiplyScalar(0.5);
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.sub(va).normalize());
    return o;
  };
  const fan = (R, ringMat = M.steelBlack, lit = true) => {
    const rotor = group(mesh(G.fan(R * 0.93, R * 0.27, 9), M.blade), at(mesh(G.cyl(R * 0.29, 0.1), M.plastic), 0, 0, 0, Math.PI / 2), lit ? at(mesh(G.torus(R * 0.29, 0.012), M.accent), 0, 0, 0.055) : null);
    rotor.userData.spin = 6 + R * 4;
    return group(mesh(G.torus(R, R * 0.075), ringMat), lit ? mesh(G.torus(R * 0.9, 0.013), M.accent) : null, rotor);
  };

  // ---- shared hardware -----------------------------------------------------
  // a thin-bezel monitor on an aluminium stand; `layers` float out of the screen in the exploded view
  const monitor = (w, h, shell, layers = [], o = {}) => {
    const y = o.y ?? 2.2, z = o.z ?? -0.25, x = o.x ?? 0, neck = y - h / 2 + 0.55, out = [];
    out.push(part(plate(1.5, 0.95, 0.06, M.alu, 0.2), [x, 0.03, z - 0.05], [0, -0.8, 0]));
    out.push(part(box(0.2, neck, 0.07, M.alu, 0.04), [x, neck / 2 + 0.03, z - 0.2], [0, -0.4, -1.3]));
    out.push(part(group(box(w, h, 0.07, M.alu, 0.08), at(face(w - 0.03, h - 0.03, M.glassDark, 0.07), 0, 0, 0.037)), [x, y, z], [0, 0.5, -1.7]));
    out.push(part(face(w - 0.1, h - 0.1, M.screen(shell), 0.04), [x, y, z + 0.04], [0, 0.1, 0.8]));
    layers.forEach((t, i) => out.push(part(layer(w - 0.1, h - 0.1, t), [x, y, z + 0.044 + i * 0.004], [0, 0.12 + i * 0.06, 1.55 + i * 0.75])));
    return out;
  };
  // phone / tablet: metal frame with a glass back and camera island, a glass front, then interface layers
  const slate = (W, H, x, y, z, ry, shell, layers, big = false) => {
    const n = [Math.sin(ry), Math.cos(ry)], out = [], t = big ? 0.13 : 0.15, rad = big ? 0.24 : 0.27, isl = big ? 0.42 : 0.6;
    const cx = W / 2 - isl / 2 - 0.13, cy = H / 2 - isl / 2 - 0.13;
    const body = group(box(W, H, t, M.titanium, rad), at(face(W - 0.07, H - 0.07, M.backGlass, rad - 0.03), 0, 0, -t / 2 - 0.001, 0, Math.PI, 0), at(box(isl, isl, 0.045, M.glassDark, 0.14), cx, cy, -t / 2 - 0.02));
    for (const [dx, dy] of big ? [[0, 0]] : [[-0.14, 0.13], [0.14, 0.13], [0, -0.14]]) {
      body.add(at(mesh(G.cyl(0.11, 0.05), M.aluDark), cx + dx, cy + dy, -t / 2 - 0.05, Math.PI / 2), at(mesh(G.cyl(0.075, 0.052), M.lens), cx + dx, cy + dy, -t / 2 - 0.052, Math.PI / 2));
    }
    body.add(at(box(0.02, 0.36, 0.05, M.titanium, 0.01), W / 2 + 0.006, H * 0.18, 0), at(box(0.02, 0.2, 0.05, M.titanium, 0.01), -W / 2 - 0.006, H * 0.24, 0));
    const P = (d) => [x + n[0] * d, y, z + n[1] * d], F = (d) => [n[0] * d, 0, n[1] * d];
    out.push(part(body, [x, y, z], F(-1.5), [0, ry, 0]));
    out.push(part(group(face(W - 0.045, H - 0.045, M.glassDark, rad - 0.01), at(face(W - 0.11, H - 0.11, M.screen(shell), rad - 0.06), 0, 0, 0.002)), P(t / 2 + 0.002), F(0.55), [0, ry, 0]));
    layers.forEach((tx, i) => out.push(part(layer(W - 0.11, H - 0.11, tx, rad - 0.06), P(t / 2 + 0.007 + i * 0.004), F(1.35 + i * 0.8), [0, ry, 0])));
    return out;
  };
  // an open laptop as one piece (base + lid); `open` is the lid angle from closed, in radians
  const laptop = (shell, s = 1, open = 1.9) => {
    const base = group(plate(3.9, 2.6, 0.1, M.alu, 0.16), at(floorFace(3.45, 1.15, M.printed(ART.keys(), { roughness: 0.7, metalness: 0 }), 0.04), 0, 0.052, -0.42), at(floorFace(1.3, 0.78, M.aluDark, 0.05), 0, 0.052, 0.78));
    const lid = group(at(box(3.9, 2.5, 0.06, M.alu, 0.14), 0, 1.25, 0), at(face(3.82, 2.42, M.glassDark, 0.12), 0, 1.25, 0.031), at(face(3.7, 2.3, M.screen(shell), 0.05), 0, 1.25, 0.033));
    lid.position.set(0, 0.05, -1.3); lid.rotation.x = -(open - Math.PI / 2);
    const g = group(base, lid);
    g.userData.s = s;
    return g;
  };
  const pedestal = (w = 3.4, d = 1.5) => part(plate(w, d, 0.08, M.aluDark, 0.3), [0, 0.04, 0.1], [0, -0.9, 0]);
  const tile = (name, color, s = 0.62) => group(box(s, s, 0.07, M.frost, 0.14), at(face(s * 0.96, s * 0.96, M.layer(ART.tile(name, color)), 0.12), 0, 0, 0.038));
  const glassCard = (w, h, t) => group(box(w, h, 0.05, M.frost, 0.1), at(face(w, h, M.layer(t), 0.1), 0, 0, 0.027));
  const miniPc = (s) => group(plate(s, s, s * 0.28, M.alu, s * 0.22), at(mesh(G.cyl(0.03, 0.012), M.accent), s * 0.32, s * 0.142, s * 0.32));

  return {
    // ================================================== software & cloud
    saas: () => [
      ...monitor(4.5, 2.82, ART.dashShell(), [ART.dashTable(), ART.dashChart(), ART.dashKpis()]),
      part(tile('check', '#7fb21a', 0.7), [-2.75, 2.9, 0.5], [-1.3, 0.8, 1.2], [0, 0.35, 0]),
      part(tile('db', '#1296d6', 0.7), [2.75, 1.5, 0.6], [1.3, -0.3, 1.3], [0, -0.35, 0]),
    ],
    custom: () => {
      const nodes = [[-1.95, 1.25, 1.2, 'doc', '#1296d6'], [-0.65, 0.78, 1.55, 'check', '#7fb21a'], [0.65, 0.78, 1.55, 'mail', '#f7941d'], [1.95, 1.25, 1.2, 'db', '#1296d6']];
      return [
        ...monitor(4.3, 2.7, ART.flow(), [], { y: 2.45, z: -0.55 }),
        ...nodes.slice(0, 3).map((n, i) => { const m = nodes[i + 1]; return part(group(tube([[n[0], n[1], n[2]], [(n[0] + m[0]) / 2, Math.min(n[1], m[1]) - 0.16, (n[2] + m[2]) / 2 + 0.1], [m[0], m[1], m[2]]], 0.022, M.accent)), [0, 0, 0], [0, -0.7, 0.4]); }),
        ...nodes.map((n, i) => part(tile(n[3], n[4], 0.74), [n[0], n[1], n[2]], [(i - 1.5) * 0.9, 1.3 + (i % 2) * 0.5, 1.2], [-0.25, (1.5 - i) * 0.22, 0])),
      ];
    },
    mobile: () => [
      pedestal(3.6, 1.7),
      ...slate(2.5, 3.35, -0.95, 1.86, -0.2, 0.2, ART.padShell(), [ART.padCards(), ART.padNav()], true),
      ...slate(1.36, 2.8, 1.55, 1.58, 0.5, -0.28, ART.appShell(), [ART.appCards(), ART.appNav()]),
    ],
    desktop: () => [
      ...monitor(4.4, 2.76, ART.deskShell(), [ART.deskCanvas(), ART.deskPanels()], { z: -0.5 }),
      part(group(plate(2.7, 0.92, 0.07, M.alu, 0.12), at(floorFace(2.56, 0.78, M.printed(ART.keys(), { roughness: 0.7, metalness: 0 }), 0.05), 0, 0.037, 0)), [-0.35, 0.05, 1.25], [-0.5, -0.4, 1.6]),
      part(at(mesh(G.sph(0.24), M.white), 0, 0, 0), [1.75, 0.1, 1.3], [1.4, 0.4, 1.3]),
      part(miniPc(1.25), [2.35, 0.19, -0.45], [1.8, 0.2, -0.9]),
    ],
    cloud: () => {
      const nodes = [-1.5, 0, 1.5];
      return [
        ...nodes.map((x, i) => part(group(box(1.25, 0.34, 1.5, M.steelBlack, 0.04), at(face(1.21, 0.3, M.printed(ART.bezel(), { roughness: 0.6 }), 0.02), 0, 0, 0.752), at(box(1.0, 0.02, 0.02, M.accent, 0.005), 0, -0.2, 0.74)), [x, 0.22, 0.35], [(i - 1) * 1.3, -0.6, 0.9])),
        ...nodes.map((x, i) => part(group(tube([[x, 0.42, 0.2], [x * 0.75, 1.2, 0.1], [x * 0.38, 2.15, 0]], 0.02, M.accent)), [0, 0, 0], [(i - 1) * 0.5, 0.7, 0])),
        part(mesh(G.torus(1.25, 0.03), M.alu), [0, 1.95, 0], [0, -0.9, 0], [Math.PI / 2, 0, 0]),
        part(box(2.9, 0.72, 0.95, M.cloud, 0.36), [0, 2.6, 0], [0, 1.4, 0]),
        part(mesh(G.sph(0.7), M.cloud), [-0.78, 2.98, 0], [-1.5, 1.4, 0.3]),
        part(mesh(G.sph(0.96), M.cloud), [0.12, 3.2, 0], [0, 2.1, -0.3]),
        part(mesh(G.sph(0.64), M.cloud), [1.0, 2.95, 0], [1.6, 1.2, 0.3]),
        part(tile('db', '#1296d6', 0.66), [-2.35, 1.5, 0.7], [-1.4, 0.2, 0.9], [0, 0.4, 0]),
        part(tile('chat', '#7fb21a', 0.66), [2.35, 1.5, 0.7], [1.4, 0.2, 0.9], [0, -0.4, 0]),
      ];
    },
    ui: () => [
      pedestal(3.2, 1.3),
      part(group(box(2.75, 3.5, 0.07, M.white, 0.12), at(face(2.62, 3.38, M.printed(ART.board(), { roughness: 0.8, metalness: 0 }), 0.08), 0, 0, 0.037)), [0, 1.95, -0.35], [0, 0.4, -1.7]),
      part(group(box(1.56, 0.48, 0.09, M.orange, 0.2), at(face(1.56, 0.48, M.layer(ART.button()), 0.2), 0, 0, 0.047)), [-0.4, 3.2, -0.2], [-1.7, 0.9, 1.5]),
      part(glassCard(1.25, 0.45, ART.toggle()), [0.55, 2.62, -0.2], [1.8, 0.8, 1.3]),
      part(glassCard(1.9, 1.28, ART.uiCard()), [-0.25, 1.62, -0.2], [0, 0.1, 2.2]),
      part(glassCard(1.86, 0.57, ART.field()), [0.25, 0.62, -0.2], [-1.6, -0.5, 1.8]),
      part(glassCard(1.56, 0.57, ART.swatches()), [1.9, 1.5, 0.5], [1.9, -0.2, 1.4], [0, -0.45, 0]),
    ],
    modern: () => [
      // the legacy machine: beige desktop case with a CRT on top
      part(group(plate(1.7, 1.5, 0.5, M.beige, 0.06), at(box(0.7, 0.06, 0.02, M.beigeDark, 0.01), -0.3, 0.02, 0.76), at(box(0.2, 0.2, 0.02, M.beigeDark, 0.02), 0.55, 0.02, 0.76)), [-1.75, 0.27, 0], [-1.3, -0.3, 0]),
      part(group(box(1.5, 1.3, 1.25, M.beige, 0.12), at(box(1.3, 1.08, 0.06, M.beigeDark, 0.1), 0, 0.02, 0.63), at(face(1.12, 0.9, M.screen(ART.crt()), 0.14), 0, 0.03, 0.665)), [-1.75, 1.2, 0], [-1.5, 0.9, 0]),
      ...[0, 1, 2].map((i) => part(mesh(G.cone4(0.2, 0.34), M.accent), [-0.42 + i * 0.42, 1.25, 0.5], [0, 1.1 + i * 0.3, 0.8], [0, 0, -Math.PI / 2])),
      // its replacement
      ...monitor(2.9, 1.82, ART.dashShell(), [ART.dashChart(), ART.dashKpis()], { x: 1.75, y: 1.75, z: -0.15 }),
      part(miniPc(1.0), [0.55, 0.17, 1.0], [0.4, 0.3, 1.5]),
    ],
    consult: () => [
      part(mesh(G.cyl(1.25, 0.5, 0.95), M.aluDark), [0, 0.25, 0], [0, -0.8, 0]),
      part(group(plate(4.3, 3.1, 0.14, M.steelBlack, 0.16), at(floorFace(4.14, 2.94, M.screen(ART.diagram()), 0.08), 0, 0.072, 0)), [0, 0.6, 0], [0, 1.3, 0]),
      ...[[-1.5, 0.95, M.blue], [0.2, -0.05, M.green], [1.55, -1.05, M.orange]].map(([x, z, m], i) => part(group(at(mesh(G.cyl(0.028, 0.6), M.alu), 0, 0.3, 0), at(mesh(G.sph(0.15), m), 0, 0.66, 0)), [x, 0.68, z], [0, 1.5 + i * 0.5, 0])),
      part(glassCard(1.7, 1.06, ART.chart()), [1.35, 1.75, -1.35], [0.9, 1.2, -1.1], [-0.12, -0.3, 0]),
      part(mesh(G.torus(0.52, 0.03), M.alu), [-1.45, 0.72, -0.95], [-1.3, 1.2, -0.7], [Math.PI / 2, 0, 0]),
      part(box(1.9, 0.03, 0.2, M.alu, 0.01), [0.6, 0.7, 1.15], [1.2, 0.9, 1.2], [0, 0.35, 0]),
    ],
    // contractors and consultants: the client's product in the middle, our people's machines plugging into it,
    // and their staff badges arriving on either side
    hire: () => {
      const seats = [[-1.95, 0.85, 0.44, ART.flat('desk', ART.deskShell(), ART.deskCanvas(), ART.deskPanels())], [0, 1.4, 0, ART.flow()],
        [1.95, 0.85, -0.44, ART.flat('site', ART.siteShell(), ART.siteCards(), ART.siteHero(), ART.siteNav())]];
      const badge = (label, color, strap) => {
        const w = 0.92, h = 1.29, loop = at(mesh(G.torus(0.25, 0.016), strap), 0, h / 2 + 0.47, 0);
        loop.scale.set(1, 1.75, 1);
        return group(box(w, h, 0.035, M.white, 0.07), at(face(w, h, M.layer(ART.badge(label, color)), 0.07), 0, 0, 0.02), at(box(0.2, 0.12, 0.05, M.alu, 0.02), 0, h / 2 + 0.03, 0), loop);
      };
      return [
        ...monitor(3.3, 2.06, ART.dashShell(), [ART.dashChart(), ART.dashKpis()], { y: 2.3, z: -0.8 }),
        ...seats.map(([x, z], i) => part(group(tube([[x * 0.94, 0.03, z - 0.5], [x * 0.5, 0.03, z * 0.1 - 0.45], [x * 0.12, 0.03, -0.72]], 0.022, M.accent)), [0, 0, 0], [(i - 1) * 0.6, -0.6, 0.5])),
        ...seats.map(([x, z, ry, shell], i) => part(laptop(shell, 0.36, 1.92), [x, 0.02, z], [x * 0.3, 0.55 + (i % 2) * 0.35, 1.6], [0, ry, 0])),
        part(badge('Contractor', '#1296d6', M.blue), [-2.5, 2.2, 0.15], [-0.1, 1.3, -1.3], [0, 0.4, 0]),
        part(badge('Consultant', '#7fb21a', M.green), [2.5, 2.2, 0.15], [0.1, 1.3, -1.3], [0, -0.4, 0]),
      ];
    },

    // ======================================================== ai & hardware
    // a 4U GPU server, opened up: board, coolers and memory, four accelerators, fan wall, power, lid
    server: () => {
      const y0 = 1.05, cards = [-1.14, -0.38, 0.38, 1.14];
      return [
        part(group(...[-1.78, 1.78].map((x) => group(at(box(0.12, 3.5, 0.1, M.aluDark, 0.02), x, 1.75, 1.72), at(plate(0.5, 2.2, 0.08, M.aluDark, 0.06), x, 0.04, 0.9)))), [0, 0, 0], [0, -0.7, 0]),
        part(group(plate(3.3, 3.5, 0.05, M.steelBlack, 0.04), ...[-1.63, 1.63].map((x) => at(box(0.04, 1.2, 3.5, M.steelBlack, 0.02), x, 0.6, 0)), at(box(3.3, 1.2, 0.04, M.steelBlack, 0.02), 0, 0.6, -1.73),
          ...[-1.72, 1.72].map((x) => at(box(0.16, 1.2, 0.06, M.alu, 0.02), x, 0.6, 1.74))), [0, y0, 0], [0, -0.45, 0]),
        part(floorFace(3.1, 2.0, M.printed(ART.mobo(), { roughness: 0.55, metalness: 0.1 }), 0.03), [0, y0 + 0.05, -0.65], [0, 0.9, 0], [-Math.PI / 2, 0, 0]),
        part(group(...[-0.62, 0.62].map((x) => group(at(mesh(G.fins(0.75, 0.5, 0.75, 16, 'x'), M.alu), x, 0.3, 0), at(plate(0.8, 0.8, 0.06, M.copper, 0.04), x, 0.03, 0))),
          ...[-1.42, -1.3, -1.18, 1.18, 1.3, 1.42, -0.06, 0.06].map((x) => group(at(box(0.035, 0.36, 0.95, M.aluDark, 0.01), x, 0.2, 0), at(box(0.04, 0.03, 0.95, M.accent, 0.005), x, 0.395, 0)))), [0, y0 + 0.06, -0.85], [0, 1.6, 0]),
        ...cards.map((x, i) => part(group(box(0.62, 1.0, 1.15, M.steelBlack, 0.05), at(box(0.03, 1.0, 1.15, M.aluDark, 0.02), -0.33, 0, 0), at(box(0.5, 0.025, 0.9, M.accent, 0.008), 0, 0.51, 0), at(box(0.62, 1.04, 0.03, M.alu, 0.01), 0, 0, 0.59)), [x, y0 + 0.57, 0.5], [0, 2.3 + i * 0.28, 0])),
        part(group(box(3.2, 0.72, 0.1, M.steelBlack, 0.03), ...[-1.28, -0.64, 0, 0.64, 1.28].map((x) => at(fan(0.27, M.aluDark), x, 0, 0.07))), [0, y0 + 0.42, 1.28], [0, 1.25, 0.9]),
        part(group(...[-1.2, 1.2].map((x) => group(at(box(0.7, 0.42, 0.9, M.alu, 0.03), x, 0, 0), at(box(0.3, 0.06, 0.05, M.aluDark, 0.02), x, 0.08, -0.47), at(mesh(G.cyl(0.03, 0.012), M.accent), x + 0.22, -0.1, -0.455, Math.PI / 2)))), [0, y0 + 0.26, -1.25], [0, 0.5, -1.7]),
        part(group(box(3.56, 1.26, 0.08, M.steelBlack, 0.04), at(face(3.5, 1.2, M.printed(ART.bezel(), { roughness: 0.55 }), 0.03), 0, 0, 0.042)), [0, y0 + 0.6, 1.8], [0, 0, 1.9]),
        part(group(plate(3.3, 3.5, 0.04, M.aluDark, 0.04), at(floorFace(2.2, 0.9, M.printed(ART.meshDark(), { roughness: 0.7 }), 0.04), 0, 0.022, 0.6)), [0, y0 + 1.22, 0], [0, 2.9, 0]),
      ];
    },
    // a custom tower workstation, built part by part
    workstation: () => {
      const Wd = 1.6, Hh = 3.3, Dp = 3.2, yc = 0.14 + Hh / 2;
      const frame = group(
        at(plate(Wd, Dp, 0.05, M.steelWhite, 0.05), 0, 0.16, 0),                                                // floor
        ...[[-0.6, 1.3], [0.6, 1.3], [-0.6, -1.3], [0.6, -1.3]].map(([x, z]) => at(mesh(G.cyl(0.1, 0.12), M.rubber), x, 0.07, z)),
        at(box(0.045, Hh, Dp, M.steelWhite, 0.02), -Wd / 2 + 0.02, yc, 0),                                      // far side panel
        at(box(0.03, Hh - 0.1, Dp - 0.1, M.steelBlack, 0.02), -Wd / 2 + 0.07, yc, 0),                           // board tray
        at(box(Wd, Hh, 0.045, M.steelWhite, 0.02), 0, yc, -Dp / 2 + 0.02),                                      // rear
        at(face(1.0, 0.7, M.printed(ART.meshDark(), { roughness: 0.7 }), 0.03), 0.1, 0.62, -Dp / 2 - 0.004, 0, Math.PI, 0),
        ...[0, 1, 2, 3, 4, 5].map((i) => at(box(0.9, 0.09, 0.02, M.aluDark, 0.01), 0.1, 1.2 + i * 0.13, -Dp / 2 - 0.004)),
        at(fan(0.42, M.steelBlack), 0.12, 2.72, -Dp / 2 + 0.1),                                                 // rear exhaust
        at(box(Wd - 0.12, 0.78, Dp - 0.5, M.steelBlack, 0.03), 0.02, 0.58, -0.2),                               // power-supply shroud
        at(face(1.5, 0.5, M.printed(ART.psu(), { roughness: 0.6 }), 0.02), Wd / 2 - 0.037, 0.58, -0.3, 0, Math.PI / 2, 0),
        at(plate(Wd, Dp, 0.05, M.steelWhite, 0.05), 0, 0.14 + Hh, 0),                                           // roof with mesh
        at(floorFace(Wd - 0.3, Dp - 0.9, M.printed(ART.mesh(), { roughness: 0.7 }), 0.06), 0, 0.14 + Hh + 0.027, -0.1),
      );
      const board = group(at(face(2.4, 2.25, M.printed(ART.mobo(), { roughness: 0.55, metalness: 0.1 }), 0.03), 0, 0, 0, 0, Math.PI / 2, 0), at(box(0.34, 0.95, 0.3, M.aluDark, 0.03), 0.17, 0.55, -1.0), at(mesh(G.fins(0.26, 0.8, 0.26, 9, 'z'), M.alu), 0.16, 0.35, -0.55));
      const cooler = group(mesh(G.fins(0.78, 0.92, 0.78, 26, 'x'), M.alu), ...[-0.2, 0.2].map((z) => at(mesh(G.cyl(0.03, 0.9), M.copper), 0, 0, z, 0, 0, Math.PI / 2)),
        at(box(0.035, 0.94, 0.8, M.steelBlack, 0.03), 0.41, 0, 0), at(box(0.01, 0.06, 0.5, M.accent, 0.004), 0.432, 0, 0), at(fan(0.42, M.steelBlack), 0, 0, 0.46));
      const ram = group(...[0, 1, 2, 3].map((i) => group(at(box(0.44, 1.28, 0.045, M.aluDark, 0.02), 0, 0, i * 0.115), at(box(0.07, 1.28, 0.05, M.accent, 0.01), 0.24, 0, i * 0.115))));
      const gpu = group(box(1.16, 0.4, 2.55, M.steelBlack, 0.06), at(floorFace(2.5, 1.1, M.printed(ART.gpuPlate(), { roughness: 0.45, metalness: 0.8 }), 0.04), 0, 0.203, 0, -Math.PI / 2, 0, Math.PI / 2),
        at(box(0.02, 0.16, 2.2, M.accent, 0.006), 0.585, 0.06, 0), ...[-0.82, 0, 0.82].map((z) => at(fan(0.36, M.steelBlack), 0, -0.21, z, Math.PI / 2, 0, 0)),
        at(box(1.2, 0.5, 0.03, M.alu, 0.01), 0, 0, -1.29), tube([[0.2, 0.2, 0.9], [0.5, 0.5, 1.15], [0.45, -0.1, 1.38], [0.3, -0.6, 1.3]], 0.035, M.rubber), tube([[0.05, 0.2, 0.9], [0.3, 0.55, 1.2], [0.2, -0.1, 1.42], [0.1, -0.6, 1.34]], 0.035, M.rubber));
      const pane = box(0.035, Hh - 0.04, Dp - 0.04, M.glass, 0.02); pane.userData.noShadow = true;
      const glassPanel = group(pane, ...[1, -1].map((s) => at(box(0.04, 0.04, Dp - 0.06, M.steelBlack, 0.01), 0, s * (Hh / 2 - 0.05), 0)),
        ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sy, sz]) => at(mesh(G.cyl(0.05, 0.03), M.alu), 0.02, sy * (Hh / 2 - 0.14), sz * (Dp / 2 - 0.14), 0, 0, Math.PI / 2)));
      return [
        part(frame, [0, 0, 0], [0, -0.7, 0]),
        part(group(box(1.3, 0.7, 1.3, M.plastic, 0.04), at(face(1.2, 0.6, M.printed(ART.psu(), { roughness: 0.6 }), 0.02), 0, 0, -0.652, 0, Math.PI, 0)), [0.02, 0.58, -0.9], [0, 0.1, -2.5]),
        part(board, [-Wd / 2 + 0.1, 2.1, -0.25], [2.5, 0, 0]),
        part(cooler, [-0.22, 2.55, -0.5], [2.9, 0.5, 0]),
        part(ram, [-0.48, 2.5, 0.12], [2.7, 1.0, 0.4]),
        part(gpu, [-0.1, 1.42, -0.25], [3.0, -0.1, 0.5]),
        part(group(...[-1.02, 0, 1.02].map((y) => at(fan(0.46, M.steelBlack), 0, y, 0))), [0, 1.9, Dp / 2 - 0.14], [0, 0, 1.9]),
        part(group(box(Wd, Hh, 0.06, M.steelWhite, 0.06), at(face(Wd - 0.36, Hh - 0.5, M.printed(ART.mesh(), { roughness: 0.7 }), 0.08), -0.02, -0.05, 0.032), at(box(0.03, Hh - 0.5, 0.02, M.accent, 0.008), Wd / 2 - 0.13, -0.05, 0.035),
          at(mesh(G.cyl(0.07, 0.03), M.alu), Wd / 2 - 0.2, Hh / 2 - 0.13, 0.03, Math.PI / 2), at(mesh(G.torus(0.075, 0.012), M.accent), Wd / 2 - 0.2, Hh / 2 - 0.13, 0.04)), [0, yc, Dp / 2 + 0.02], [0, 0, 3.0]),
        part(glassPanel, [Wd / 2 - 0.01, yc, 0], [3.1, 0, 0]),
      ];
    },
    agents: () => {
      const pods = [[1.75, 2.75, 0.4], [-1.7, 2.9, -0.1], [0.3, 3.5, -0.8], [-1.35, 1.0, 0.9], [1.6, 1.05, -0.3]];
      const tools = [['doc', '#1296d6', [2.75, 3.2, 0.7]], ['db', '#7fb21a', [-2.75, 3.25, -0.1]], ['mail', '#f7941d', [-2.35, 0.75, 1.3]], ['cal', '#1296d6', [2.6, 0.85, -0.2]]];
      const shell = box(1.15, 1.15, 1.15, M.crystal, 0.2); shell.userData.noShadow = true;
      const heart = mesh(new THREE.OctahedronGeometry(0.42), M.accent); heart.userData.spinY = 1.2;
      return [
        part(group(mesh(G.cyl(0.9, 0.22, 0.75), M.aluDark), at(mesh(G.cyl(0.07, 1.0), M.alu), 0, 0.6, 0)), [0, 0.11, 0], [0, -0.8, 0]),
        part(group(shell, heart, mesh(G.torus(0.62, 0.012), M.accent)), [0, 1.95, 0], [0, 1.5, 0]),
        ...pods.map((n) => part(group(rod([0, 1.95, 0], n, 0.016, M.accent)), [0, 0, 0], [n[0] * 0.3, (n[1] - 1.95) * 0.3, n[2] * 0.3])),
        ...pods.map((n, i) => part(group(mesh(G.capsule(0.2, 0.26), i % 2 ? M.alu : M.white), at(mesh(G.cyl(0.06, 0.02), M.accent), 0, 0.12, 0.19, Math.PI / 2), at(mesh(G.torus(0.2, 0.012), M.aluDark), 0, -0.02, 0, Math.PI / 2)), n, [n[0] * 0.85, (n[1] - 1.95) * 0.85, n[2] * 0.85 + 0.4])),
        ...tools.map(([name, c, p]) => part(tile(name, c, 0.7), p, [p[0] * 0.55, (p[1] - 1.95) * 0.6, 0.9], [0, -p[0] * 0.14, 0])),
      ];
    },
    training: () => {
      const cols = [[-0.9, 4], [0.55, 5], [2.0, 3]], pts = cols.map(([x, n]) => Array.from({ length: n }, (_, j) => [x, 2.0 + (j - (n - 1) / 2) * 0.6, 0]));
      const links = group();
      for (let c = 0; c < 2; c++) for (const a of pts[c]) for (const b of pts[c + 1]) links.add(rod(a, b, 0.008, M.accent));
      return [
        pedestal(4.6, 1.5),
        // your data: a stack of drives
        ...[0, 1, 2, 3].map((i) => part(group(plate(1.0, 1.35, 0.18, M.alu, 0.05), at(box(0.7, 0.02, 0.02, M.accent, 0.005), -0.05, 0, 0.68), at(mesh(G.cyl(0.02, 0.012), M.green), 0.4, 0, 0.681, Math.PI / 2)), [-2.45, 0.2 + i * 0.22, 0.15], [-1.2, 0.9 + i * 0.45, 0.4])),
        part(group(tube([[-1.95, 0.5, 0.2], [-1.6, 1.2, 0.1], [-1.25, 2.0, 0]], 0.02, M.accent)), [0, 0, 0], [-0.5, 0.6, 0]),
        ...pts.flatMap((col, c) => col.map((p, j) => part(mesh(G.sph(0.19), c === 1 ? M.green : M.cloud), p, [(c - 1) * 1.1, (j - (col.length - 1) / 2) * 0.45, 1.3 + c * 0.35]))),
        part(links, [0, 0, 0], [0, 0, -1.5]),
        part(glassCard(1.9, 1.19, ART.chart()), [1.1, 3.9, 0.2], [0.8, 1.1, 0.9], [0.08, -0.2, 0]),
      ];
    },
    team: () => {
      const seats = [[-2.15, 1.45, 0.62], [-1.1, 1.95, 0.3], [0, 2.1, 0], [1.1, 1.95, -0.3], [2.15, 1.45, -0.62]];
      return [
        part(group(plate(2.2, 0.9, 0.07, M.aluDark, 0.2), ...[-0.7, 0.7].map((x) => at(box(0.09, 1.6, 0.09, M.alu, 0.03), x, 0.83, -0.1))), [0, 0.035, -1.35], [0, -0.7, -0.6]),
        part(group(box(4.3, 2.5, 0.09, M.steelBlack, 0.08), at(face(4.2, 2.4, M.glassDark, 0.06), 0, 0, 0.047), at(face(4.1, 2.3, M.screen(ART.slide()), 0.04), 0, 0, 0.049)), [0, 2.85, -1.45], [0, 1.2, -1.5]),
        ...seats.map(([x, z, ry], i) => part(laptop(ART.dashShell(), 0.3, 1.95), [x, 0.02, z], [x * 0.55, 0.7 + (i % 2) * 0.4, 1.5], [0, ry + Math.PI, 0])),
      ];
    },

    // =========================================================== apex studio
    website: () => {
      const s = 1.12, open = 1.92, a = open - Math.PI / 2, lidY = 0.05 * s + 0.02, lidZ = -1.3 * s + 0.35;
      // interface layers sit on the tilted lid and travel out along the screen's own normal
      const onLid = (v, d) => [0, lidY + Math.cos(a) * v + Math.sin(a) * d, lidZ - Math.sin(a) * v + Math.cos(a) * d];
      const pyramid = mesh(G.cone4(0.62, 1.15), M.orange); pyramid.userData.spinY = 0.9;
      return [
        part(laptop(ART.siteShell(), s, open), [0, 0.02, 0.35], [0, -0.6, 0]),
        ...[ART.siteCards(), ART.siteHero(), ART.siteNav()].map((t, i) => part(layer(3.7 * s, 2.3 * s, t), onLid(1.25 * s, 0.045 + i * 0.006), [0, Math.sin(a) * (1.1 + i * 0.75), Math.cos(a) * (1.1 + i * 0.75)], [-a, 0, 0])),
        part(group(pyramid, at(mesh(G.torus(0.78, 0.016), M.accent), 0, -0.45, 0, Math.PI / 2)), [1.15, 1.75, 0.2], [1.4, 1.2, 2.0]),
      ];
    },
    film: () => {
      const light = () => group(at(mesh(G.cyl(0.03, 2.3), M.steelBlack), 0, 1.15, 0), ...[0, 1, 2].map((i) => rod([0, 0.5, 0], [Math.cos(i * 2.094) * 0.6, 0, Math.sin(i * 2.094) * 0.6], 0.02, M.steelBlack)),
        at(box(1.3, 1.5, 0.3, M.steelBlack, 0.08), 0, 2.75, 0), at(face(1.2, 1.4, M.softbox, 0.06), 0, 2.75, 0.152));
      const cam = group(box(0.72, 0.52, 0.55, M.steelBlack, 0.06), at(mesh(G.cyl(0.2, 0.5), M.aluDark), 0, 0, 0.5, Math.PI / 2), at(mesh(G.cyl(0.23, 0.14), M.steelBlack), 0, 0, 0.8, Math.PI / 2), at(mesh(G.cyl(0.18, 0.02), M.lens), 0, 0, 0.872, Math.PI / 2),
        at(box(0.5, 0.06, 0.1, M.aluDark, 0.02), 0, 0.33, 0), at(box(0.5, 0.32, 0.03, M.plastic, 0.02), -0.05, 0.2, -0.33), at(face(0.44, 0.26, M.screen(ART.clap()), 0.02), -0.05, 0.2, -0.347, 0, Math.PI, 0), at(mesh(G.cyl(0.025, 0.012), M.accent), 0.3, 0.2, 0.28, Math.PI / 2));
      const legs = group(...[0, 1, 2].map((i) => rod([0, 1.45, 0], [Math.cos(i * 2.094 + 0.5) * 0.75, 0, Math.sin(i * 2.094 + 0.5) * 0.75], 0.03, M.aluDark)), at(mesh(G.cyl(0.09, 0.14), M.steelBlack), 0, 1.5, 0));
      // the product being filmed: a finished phone, shown whole
      const product = group();
      for (const p of slate(1.36, 2.8, 0, 0, 0, 0, ART.appShell(), [ART.appCards(), ART.appNav()])) { p.o.position.set(...p.p); product.add(p.o); }
      product.userData.s = 0.7;
      return [
        part(group(mesh(G.cyl(1.05, 0.14), M.white), at(mesh(G.torus(1.05, 0.02), M.accent), 0, 0.07, 0, Math.PI / 2)), [0, 0.07, 0], [0, -0.8, 0]),
        part(product, [0, 1.15, 0], [0, 1.9, 0], [0, 0.45, 0]),
        part(light(), [-2.35, 0, -0.5], [-1.3, 0.4, -0.6], [0, 0.85, 0]),
        part(light(), [2.15, 0, -1.0], [1.4, 0.4, -0.8], [0, -0.75, 0]),
        part(legs, [1.55, 0, 1.7], [0.9, -0.5, 1.1]),
        part(cam, [1.55, 1.82, 1.7], [1.2, 1.1, 1.3], [0.1, Math.PI + 0.72, 0]),
        part(group(box(1.5, 1.0, 0.05, M.steelBlack, 0.04), at(face(1.44, 0.94, M.screen(ART.clap()), 0.03), 0, 0, 0.027)), [-1.45, 0.52, 1.75], [-1.1, 0.9, 1.3], [-0.25, 0.5, 0]),
      ];
    },
    // a handheld console; the whole build leans back like something resting in your hands
    game: () => {
      const stick = () => group(mesh(G.cyl(0.19, 0.05), M.steelBlack), at(mesh(G.cyl(0.07, 0.12), M.plastic), 0, 0.08, 0), at(mesh(G.cyl(0.15, 0.05), M.rubber), 0, 0.16, 0));
      return {
        tilt: [-0.42, 0, 0], lift: 1.25,
        parts: [
          part(group(box(4.3, 2.1, 0.26, M.white, 0.55), at(box(0.7, 0.1, 0.2, M.aluDark, 0.04), -1.5, 1.04, -0.04), at(box(0.7, 0.1, 0.2, M.aluDark, 0.04), 1.5, 1.04, -0.04)), [0, 0.6, 0], [0, 0, -1.7]),
          part(group(face(2.5, 1.66, M.glassDark, 0.1), at(face(2.4, 1.5, M.screen(ART.game()), 0.06), 0, 0, 0.002)), [0, 0.6, 0.132], [0, 0.2, 1.3]),
          part(group(box(0.52, 0.17, 0.07, M.steelBlack, 0.03), box(0.17, 0.52, 0.07, M.steelBlack, 0.03)), [-1.68, 0.92, 0.15], [-1.3, 0.3, 1.4]),
          part(stick(), [-1.68, 0.24, 0.13], [-1.4, -0.2, 1.6], [Math.PI / 2, 0, 0]),
          part(group(...[[0, 0.19, M.blue], [0.19, 0, M.green], [-0.19, 0, M.orange], [0, -0.19, M.white]].map(([x, y, m]) => at(mesh(G.cyl(0.085, 0.07), m), x, y, 0, Math.PI / 2))), [1.68, 0.92, 0.15], [1.3, 0.3, 1.4]),
          part(stick(), [1.68, 0.24, 0.13], [1.4, -0.2, 1.6], [Math.PI / 2, 0, 0]),
          ...[-1.15, 0, 1.15].map((x, i) => part(group(mesh(G.cyl(0.3, 0.07, 0.3, 6), M.gold), at(face(0.36, 0.36, M.layer(ART.tile('check', '#7a5a10')), 0.1), 0, 0.037, 0, -Math.PI / 2)), [x, 2.25 + (i === 1 ? 0.22 : 0), -0.45], [x * 1.1, 1.3, 0.2], [Math.PI / 2 - 0.05, 0, 0])),
        ],
      };
    },
  };
}

// how far each build is turned on the stage; cases show a corner, screens face the camera more squarely
const YAW = { workstation: -1.32, server: -1.02, modern: -0.95, consult: -0.85, hire: -0.86, film: -1.0, agents: -0.9, cloud: -0.9, game: -0.86, team: -0.86, website: -0.86 };

const PAD_FRAG = /* glsl */ `
  uniform vec3 uColor; uniform float uLight, uTime, uK;
  varying vec2 vP;
  void main() {
    float r = length(vP);
    float rings = smoothstep(0.02, 0.0, abs(fract(r * 1.4 - uTime * 0.06) - 0.5) - 0.475) * smoothstep(3.3, 1.2, r);
    float ang = atan(vP.y, vP.x);
    float ticks = step(0.86, fract(ang * 11.459)) * smoothstep(0.07, 0.0, abs(r - 3.2));
    float sweep = pow(max(0.0, cos(ang - uTime * 0.6)), 30.0) * smoothstep(3.3, 0.6, r);
    float a = (rings * 0.2 + ticks * 0.65 + sweep * 0.2) * uK * step(r, 3.36);
    gl_FragColor = vec4(uColor * a * mix(1.0, 1.25, uLight), 0.0);
    #include <colorspace_fragment>
  }
`;

export function createForge({ accentMat }) {
  const M = materials(accentMat);
  const plans = blueprints(M);
  const group = new THREE.Group();
  group.position.copy(FORGE);

  // ---- the stage: a machined turntable with a light ring
  const padBase = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.86, 0.24, 96), M.aluDark);
  padBase.position.y = 0.12; padBase.receiveShadow = true;
  const topMat = new THREE.MeshStandardMaterial({ color: 0x2b3038, metalness: 0.5, roughness: 1.0, roughnessMap: ART.brushed() });
  const padTop = new THREE.Mesh(new THREE.CylinderGeometry(3.46, 3.46, 0.03, 96), topMat);
  padTop.position.y = 0.245; padTop.receiveShadow = true;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(3.52, 0.028, 8, 128), accentMat);
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.25;
  const padU = { uColor: { value: new THREE.Color() }, uLight: { value: 0 }, uTime: { value: 0 }, uK: { value: 1 } };
  const flatGeo = (s) => { const g = new THREE.PlaneGeometry(s, s); g.rotateX(-Math.PI / 2); return g; };
  const vert = 'varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  const pad = new THREE.Mesh(flatGeo(7), new THREE.ShaderMaterial({ uniforms: padU, ...GLOW_BLEND, vertexShader: vert, fragmentShader: PAD_FRAG }));
  pad.position.y = 0.262; pad.renderOrder = 2;
  const glow = new THREE.Mesh(flatGeo(18), new THREE.ShaderMaterial({
    uniforms: padU, ...GLOW_BLEND, vertexShader: vert,
    fragmentShader: `uniform vec3 uColor; uniform float uLight, uK; varying vec2 vP;
      void main(){ float r = length(vP); float a = exp(-max(r - 3.8, 0.0) * 1.5) * 0.34 * uK * step(3.8, r); float aL = a * 0.06;
      gl_FragColor = vec4(uColor * mix(a * 0.7, aL, uLight), aL * uLight);
      #include <colorspace_fragment>
      }`,
  }));
  glow.position.y = 0.012; glow.renderOrder = 1;
  const table = new THREE.Group();
  table.position.y = 0.262;

  // ---- stage lighting: a soft key that casts live shadows over the build, plus a rim light
  const spot = new THREE.SpotLight(0xffffff, 0, 60, 0.36, 0.75, 0);
  spot.position.set(-6.5, 13, 8.5);
  spot.castShadow = true;
  spot.shadow.mapSize.set(2048, 2048);
  spot.shadow.camera.near = 6; spot.shadow.camera.far = 30;
  spot.shadow.bias = -0.0005; spot.shadow.normalBias = 0.02; spot.shadow.radius = 5;
  spot.target.position.set(0, 1.2, 0);
  const rimLight = new THREE.SpotLight(0xffffff, 0, 60, 0.5, 0.9, 0);
  rimLight.position.set(7, 7, -9); rimLight.target.position.set(0, 1.6, 0);
  group.add(padBase, padTop, rim, pad, glow, table, spot, spot.target, rimLight, rimLight.target);

  // ---- builds
  const built = new Map();
  function getBuild(name) {
    if (built.has(name)) return built.get(name);
    const plan = (plans[name] || plans.saas)();
    const parts = Array.isArray(plan) ? plan : plan.parts;
    const holder = new THREE.Group();
    if (plan.tilt) holder.rotation.set(...plan.tilt);
    if (plan.lift) holder.position.y = plan.lift;
    const spinners = [];
    parts.forEach((p, i) => {
      p.d = parts.length > 1 ? (i / (parts.length - 1)) * 0.55 : 0;
      p.q = new THREE.Euler(p.r[0], p.r[1], p.r[2]);
      holder.add(p.o);
      p.o.traverse((m) => {
        if (m.userData.spin || m.userData.spinY) spinners.push(m);
        if (!m.isMesh) return;
        m.frustumCulled = false;
        const see = m.material.transparent || m.userData.noShadow;
        m.castShadow = !see; m.receiveShadow = !m.material.isMeshBasicMaterial;
      });
    });
    const b = { name, holder, parts, spinners, vis: 0, t: 0 };
    built.set(name, b);
    return b;
  }
  function pose(b) {
    const v = b.vis * b.vis * (3 - 2 * b.vis), s = Math.max(0.0001, v);
    for (const p of b.parts) {
      const local = Math.min(1, Math.max(0, (b.t - p.d) / 0.45)), k = Math.pow(1 - local, 3);
      p.o.position.set(p.p[0] + p.f[0] * k, p.p[1] + p.f[1] * k + (1 - v) * 0.8, p.p[2] + p.f[2] * k);
      p.o.rotation.copy(p.q);
      p.o.scale.setScalar(s * (p.o.userData.s || 1));
    }
  }

  const want = { name: null, progress: 1 };
  let current = null, dock = 0, frames = 0;
  const leaving = [];
  const topLight = new THREE.Color(0x343a44), topDark = new THREE.Color(0x15181d);

  return {
    group,
    names: Object.keys(plans),
    // progress 0 = exploded view, 1 = fully assembled
    show(name, progress = 1) { want.name = name; want.progress = progress; },
    update(dt, time, cA, cB, L, weight) {
      frames++;
      padU.uColor.value.copy(cA); padU.uLight.value = L; padU.uTime.value = time;
      topMat.color.copy(topDark).lerp(topLight, L);
      // in dark mode, screens are dimmed a little so their white interfaces stay readable under bloom
      const lum = 0.7 + 0.26 * L;
      for (const m of M.screens) m.emissiveIntensity = lum;
      for (const m of M.layers) m.color.setScalar(0.72 + 0.28 * L);
      const on = weight > 0.004;
      spot.intensity = (1.3 + 1.1 * L) * weight;
      rimLight.intensity = (0.3 + 0.5 * L) * weight;
      spot.shadow.autoUpdate = on || frames < 4;       // live shadows only while the stage is in view
      if (!on && !current) return;
      if (want.name && (!current || current.name !== want.name)) {
        if (current) leaving.push(current);
        current = getBuild(want.name);
        const i = leaving.indexOf(current); if (i >= 0) leaving.splice(i, 1);
        current.vis = Math.min(current.vis, 0.05); current.t = 0;
        table.add(current.holder);
      }
      if (current) {
        current.vis = Math.min(1, current.vis + dt * 3.2);
        current.t += (want.progress - current.t) * (1 - Math.exp(-dt * 5));
        pose(current);
        for (const m of current.spinners) {
          if (m.userData.spin) m.rotation.z -= dt * m.userData.spin * (0.25 + 0.75 * current.t);
          if (m.userData.spinY) m.rotation.y += dt * m.userData.spinY;
        }
        dock += ((current.t > 0.97 ? 1 : 0) - dock) * (1 - Math.exp(-dt * 6));
      }
      for (let i = leaving.length - 1; i >= 0; i--) {
        const b = leaving[i];
        b.vis -= dt * 5;
        if (b.vis <= 0) { b.vis = 0; table.remove(b.holder); leaving.splice(i, 1); } else pose(b);
      }
      table.rotation.y = (current && YAW[current.name] !== undefined ? YAW[current.name] : -0.92) + Math.sin(time * 0.3) * 0.12;
      padU.uK.value = 0.6 + dock * 0.7;
    },
  };
}
