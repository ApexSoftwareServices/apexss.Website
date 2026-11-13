// The Apex world: a realistic mainboard on a studio floor, wired to the machines around it.
// Everything here is built once; scene.js animates uniforms, lights, fans and the camera.
import * as THREE from 'three';
import { layoutBoard, paintBoard, shadeBoard, mulberry32, offsetPath, BOARD, BOARD_W, BOARD_D, PARTS } from './pcb.js';
import { buildParts, Pool } from './parts.js';
import { slab, roundedPlane, softBox } from './geo.js';
import { drawKeyboard } from './screens.js';

export const FLOOR_Y = -0.62;
export const SPOTS = {
  cpu: new THREE.Vector3(0, 0, 0),
  gpu: new THREE.Vector3(-2, 2.5, -6.7),
  racks: new THREE.Vector3(1.0, FLOOR_Y, -15.6),
  laptop: new THREE.Vector3(-16.5, FLOOR_Y, 1.5),
  tablet: new THREE.Vector3(-4.6, FLOOR_Y, 13.6),
  phone: new THREE.Vector3(3.2, FLOOR_Y, 14.0),
};
const FACING = {
  laptop: new THREE.Vector3(0.5, 0, 0.87).normalize(),
  tablet: new THREE.Vector3(-0.2, 0, 0.98).normalize(),
  phone: new THREE.Vector3(0.12, 0, 0.99).normalize(),
};

const HALO = 3; // live-trace ribbons are HALO x wider than their core, to carry a soft glow

// premultiplied blending: alpha 0 = additive light, alpha > 0 = ink (used on bright backgrounds)
export const GLOW_BLEND = {
  transparent: true, depthWrite: false,
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
};

// ------------------------------------------------------------------ helpers
function canvasTexture(canvas, srgb = true, aniso = 1) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}
const shadowed = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };

// -------------------------------------------------------------- live traces
const TRACE_VERT = /* glsl */ `
  attribute vec4 aA; // dist, side, seed, bus
  attribute vec2 aB; // speed, period
  varying vec4 vA; varying vec2 vB; varying vec3 vW;
  void main() { vA = aA; vB = aB; vW = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const TRACE_FRAG = /* glsl */ `
  uniform float uTime, uHdr, uHalo, uSurgeR, uSurgeA, uProbeK;
  uniform vec3 uAccent, uProbe, uSurgeO;
  uniform vec4 uBus;
  varying vec4 vA; varying vec2 vB; varying vec3 vW;
  void main() {
    float side = abs(vA.y);
    float aa = fwidth(vA.y) * 1.25;
    float core = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, side);

    // a packet of current: bright head, fading tail
    float f = fract((vA.x - uTime * vB.x) / vB.y + vA.z);
    float pulse = pow(f, 9.0);

    float boost = vA.w < -0.5 ? 0.0 : uBus[int(vA.w + 0.5)];
    vec2 dp = vW.xz - uProbe.xz;
    float probe = exp(-dot(dp, dp) / 3.0) * uProbeK;
    float sr = length(vW.xz - uSurgeO.xz) - uSurgeR;
    float surge = exp(-sr * sr * 0.6) * uSurgeA;

    float e = clamp(pulse * (0.85 + boost) + boost * 0.22 + probe * 0.8 + surge, 0.0, 1.6);
    float e1 = min(e, 1.0);
    vec3 hot = mix(uAccent, vec3(1.0), 0.4 * e1) * (1.0 + uHdr * 1.1 * e);
    float glow = max(core * (0.1 + 0.9 * e1), exp(-side * side * 0.9) * e1 * 0.5 * uHalo);
    gl_FragColor = vec4(hot * glow, 0.0);
    #include <colorspace_fragment>
  }
`;
function buildTraces(L, uniforms) {
  const rand = mulberry32(99), pos = [], a = [], b = [], idx = [];
  let n = 0;
  for (const t of L.traces) {
    if (!t.live) continue;
    const P = [];
    for (const q of t.pts) { const l = P[P.length - 1]; if (!l || Math.hypot(q[0] - l[0], q[1] - l[1]) > 1e-3) P.push(q); }
    if (P.length < 2) continue;
    const hw = t.w * 0.5 * HALO, seed = rand(), Lp = offsetPath(P, hw), Rp = offsetPath(P, -hw);
    let dist = 0;
    for (let k = 0; k < P.length; k++) {
      if (k) dist += Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]);
      pos.push(Lp[k][0], 0.008, Lp[k][1], Rp[k][0], 0.008, Rp[k][1]);
      a.push(dist, HALO, seed, t.live.bus, dist, -HALO, seed, t.live.bus);
      b.push(t.live.speed, t.live.period, t.live.speed, t.live.period);
      if (k) { const i = n + k * 2; idx.push(i - 2, i - 1, i, i, i - 1, i + 1); }
    }
    n += P.length * 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aA', new THREE.Float32BufferAttribute(a, 4));
  g.setAttribute('aB', new THREE.Float32BufferAttribute(b, 2));
  g.setIndex(idx);
  const mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms, vertexShader: TRACE_VERT, fragmentShader: TRACE_FRAG, ...GLOW_BLEND, side: THREE.DoubleSide }));
  mesh.renderOrder = 2; mesh.frustumCulled = false;
  return mesh;
}

// ------------------------------------------------------------- environment
// A photo studio, rendered once into a reflection map: a soft overhead bank, long strip lights that
// draw highlights along bevelled edges, and dark flags that give polished metal its contrast.
function environment(renderer, { top, horizon, floor, gain }) {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.SphereGeometry(30, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uTop: { value: top }, uHorizon: { value: horizon }, uFloor: { value: floor } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTop, uHorizon, uFloor; varying vec3 vP;
      void main(){ float y = normalize(vP).y; float v = y > 0.0 ? mix(uHorizon, uTop, pow(y, 0.6)) : mix(uHorizon, uFloor, pow(-y, 0.5)); gl_FragColor = vec4(v, v, v * 1.03, 1.0); }`,
  })));
  const panel = (w, h, v, p) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(v * gain, v * gain, v * gain * 1.04), side: THREE.DoubleSide }));
    m.position.set(...p); m.lookAt(0, 0, 0); s.add(m);
  };
  panel(22, 15, 5.5, [0, 19, 2]);        // overhead bank
  panel(26, 2.4, 13, [-17, 9, -6]);      // key-side strip
  panel(18, 1.7, 8, [16, 7, 9]);         // fill-side strip
  panel(24, 5.5, 3.0, [0, 6.5, -20]);    // back wall wash
  panel(12, 3.5, 1.5, [0, 3.5, 20]);     // front bounce
  panel(9, 10, 0.015, [20, 3, -5]);      // dark flags
  panel(8, 10, 0.015, [-20, 2.5, 9]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(s, 0.03).texture;
  pmrem.dispose();
  return tex;
}

// --------------------------------------------------------- glow primitives
const UNDERGLOW_FRAG = /* glsl */ `
  uniform vec2 uHalf; uniform vec3 uColor; uniform float uK, uLight, uTime, uRound, uFall;
  varying vec2 vP;
  void main() {
    vec2 q = abs(vP) - (uHalf - uRound);
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRound;
    float a = exp(-max(d, 0.0) * uFall) * uK * (0.88 + 0.12 * sin(uTime * 2.2));
    float aL = a * 0.4;
    gl_FragColor = vec4(uColor * mix(a * 0.75, aL, uLight), aL * uLight);
    #include <colorspace_fragment>
  }
`;
function underglow(halfX, halfZ, round, spread = 2.6, fall = 1.9) {
  const u = { uHalf: { value: new THREE.Vector2(halfX, halfZ) }, uColor: { value: new THREE.Color() }, uK: { value: 0 }, uLight: { value: 0 }, uTime: { value: 0 }, uRound: { value: round }, uFall: { value: fall } };
  const g = new THREE.PlaneGeometry((halfX + spread) * 2, (halfZ + spread) * 2);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
    uniforms: u, ...GLOW_BLEND,
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: UNDERGLOW_FRAG,
  }));
  m.position.y = 0.02; m.renderOrder = 1;
  return { mesh: m, u };
}

const HOLO_FRAG = /* glsl */ `
  uniform vec3 uColor; uniform float uTime, uLight, uK, uLevels;
  varying vec3 vB;
  void main() {
    float h = vB.z;
    float e = min(vB.x, vB.y);
    float edge = 1.0 - smoothstep(0.0, fwidth(e) * 1.8, e);
    float base = 1.0 - smoothstep(0.0, fwidth(h) * 1.8, h);
    float lv = h * uLevels;
    float contour = 1.0 - smoothstep(0.0, fwidth(lv) * 1.3, abs(fract(lv - 0.5) - 0.5));
    float scan = exp(-pow((h - fract(uTime * 0.16)) * 8.0, 2.0));
    float lines = max(max(edge, base), contour * 0.7);
    float a = (lines * (0.7 + scan) + 0.03 + scan * 0.1) * (0.92 + 0.08 * sin(uTime * 21.0 + h * 50.0)) * uK;
    float aL = min(1.0, a * 1.1);
    gl_FragColor = vec4(uColor * mix(a * (1.0 + 0.5 * lines), aL, uLight), aL * uLight);
    #include <colorspace_fragment>
  }
`;
function pyramidGeometry(half, height) {
  const pos = [], bary = [], c = [[-half, -half], [half, -half], [half, half], [-half, half]];
  for (let k = 0; k < 4; k++) {
    const a = c[k], b = c[(k + 1) % 4];
    pos.push(a[0], 0, a[1], b[0], 0, b[1], 0, height, 0);
    bary.push(1, 0, 0, 0, 1, 0, 0, 0, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aBary', new THREE.Float32BufferAttribute(bary, 3));
  return g;
}
function hologram() {
  const group = new THREE.Group(), uniforms = [];
  const mk = (half, height, levels, k) => {
    const u = { uColor: { value: new THREE.Color() }, uTime: { value: 0 }, uLight: { value: 0 }, uK: { value: k }, uLevels: { value: levels } };
    uniforms.push(u);
    const m = new THREE.Mesh(pyramidGeometry(half, height), new THREE.ShaderMaterial({
      uniforms: u, ...GLOW_BLEND, side: THREE.DoubleSide,
      vertexShader: 'attribute vec3 aBary; varying vec3 vB; void main(){ vB = aBary; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: HOLO_FRAG,
    }));
    m.renderOrder = 6;
    return m;
  };
  const outer = mk(1.12, 2.9, 14, 1), core = mk(0.4, 1.0, 4, 1.25);
  core.position.y = 0.7;
  group.add(outer, core);
  const beamU = { uColor: { value: new THREE.Color() }, uLight: { value: 0 }, uTime: { value: 0 }, uK: { value: 1 } };
  const beamMat = (frag) => new THREE.ShaderMaterial({
    uniforms: beamU, ...GLOW_BLEND, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uColor; uniform float uLight, uTime, uK; varying vec2 vUv;
      void main(){ ${frag} float aL = a * 0.7; gl_FragColor = vec4(uColor * mix(a * 1.3, aL, uLight), aL * uLight);
      #include <colorspace_fragment>
      }`,
  });
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(1.42, 0.2, 0.85, 40, 1, true),
    beamMat('float rays = 0.6 + 0.4 * sin(vUv.x * 150.0 + uTime * 1.5); float a = pow(1.0 - vUv.y, 1.6) * 0.2 * rays * uK;'));
  cone.position.y = -0.47; cone.renderOrder = 5;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 2.6, 8, 1, true), beamMat('float a = pow(1.0 - vUv.y, 1.4) * 0.9 * uK;'));
  beam.position.y = 2.9 + 1.3; beam.renderOrder = 6;
  uniforms.push(beamU);
  group.add(cone, beam);
  return { group, outer, core, uniforms };
}

// cables: a rubber sheath with light travelling inside it
const CABLE_FRAG = /* glsl */ `
  uniform vec3 uColor; uniform float uTime, uK, uHdr, uLen, uSpeed;
  varying vec2 vUv;
  void main() {
    float f = fract(vUv.x * uLen / 3.2 - uTime * uSpeed);
    float pulse = pow(f, 5.0);
    float a = pulse * (0.3 + 0.9 * uK) + 0.05 + 0.14 * uK;
    gl_FragColor = vec4(uColor * a * (1.0 + uHdr), 0.0);
    #include <colorspace_fragment>
  }
`;
function cable(points, radius, sheath, speed = 0.9) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.4);
  const len = curve.getLength(), seg = Math.max(24, Math.round(len * 7));
  const body = shadowed(new THREE.Mesh(new THREE.TubeGeometry(curve, seg, radius, 8), sheath));
  const u = { uColor: { value: new THREE.Color() }, uTime: { value: 0 }, uK: { value: 0 }, uHdr: { value: 0 }, uLen: { value: len }, uSpeed: { value: speed } };
  const light = new THREE.Mesh(new THREE.TubeGeometry(curve, seg, radius * 1.45, 8), new THREE.ShaderMaterial({
    uniforms: u, ...GLOW_BLEND,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: CABLE_FRAG,
  }));
  light.renderOrder = 3;
  return { body, light, u };
}

// ----------------------------------------------------------------- devices
function deviceMaterials(aniso) {
  return {
    alu: new THREE.MeshStandardMaterial({ color: 0xc2c7d0, metalness: 1, roughness: 0.34 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x05070a, metalness: 0.2, roughness: 0.12 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x15181e, metalness: 0.4, roughness: 0.5 }),
    screen: (canvas) => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: canvasTexture(canvas, true, aniso), emissiveIntensity: 1, roughness: 0.16, metalness: 0, toneMapped: false }),
  };
}
function buildLaptop(M, canvas, aniso) {
  const g = new THREE.Group();
  const base = shadowed(new THREE.Mesh(slab(5.4, 3.6, 0.16, 0.24), M.alu));
  base.rotation.x = -Math.PI / 2; base.position.y = 0.1;
  const kb = new THREE.Mesh(new THREE.PlaneGeometry(4.7, 1.74), new THREE.MeshStandardMaterial({ map: canvasTexture(drawKeyboard(), true, aniso), roughness: 0.65, metalness: 0.1 }));
  kb.rotation.x = -Math.PI / 2; kb.position.set(0, 0.182, -0.52);
  const pad = new THREE.Mesh(roundedPlane(1.75, 1.05, 0.08), new THREE.MeshStandardMaterial({ color: 0xb4bac3, metalness: 1, roughness: 0.2 }));
  pad.rotation.x = -Math.PI / 2; pad.position.set(0, 0.182, 1.08);
  const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 4.5, 16), M.dark);
  hinge.rotation.z = Math.PI / 2; hinge.position.set(0, 0.17, -1.76);
  const lid = new THREE.Group();
  lid.position.set(0, 0.17, -1.78); lid.rotation.x = -0.3;
  const shell = shadowed(new THREE.Mesh(slab(5.4, 3.5, 0.08, 0.2), M.alu)); shell.position.y = 1.81;
  const bezel = new THREE.Mesh(roundedPlane(5.26, 3.36, 0.14), M.glass); bezel.position.set(0, 1.81, 0.042);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(5.0, 3.125), M.screen(canvas)); screen.position.set(0, 1.83, 0.045);
  lid.add(shell, bezel, screen);
  g.add(base, kb, pad, hinge, lid);
  return { group: g, screen, half: [2.7, 1.8, 0.24] };
}
function buildTablet(M, canvas) {
  const g = new THREE.Group();
  const body = new THREE.Group(); body.rotation.x = -0.32; body.position.y = 0.03;
  const shell = shadowed(new THREE.Mesh(slab(3.5, 4.7, 0.12, 0.26), M.alu)); shell.position.y = 2.35;
  const bezel = new THREE.Mesh(roundedPlane(3.42, 4.62, 0.23), M.glass); bezel.position.set(0, 2.35, 0.062);
  const screen = new THREE.Mesh(roundedPlane(3.26, 4.347, 0.14), M.screen(canvas)); screen.position.set(0, 2.35, 0.065);
  body.add(shell, bezel, screen);
  const leg = shadowed(new THREE.Mesh(slab(1.7, 3.0, 0.07, 0.2), M.alu));
  leg.position.set(0, 1.33, -1.62); leg.rotation.x = 0.49;
  g.add(body, leg);
  return { group: g, screen, half: [1.75, 1.25, 0.2], offset: [0, -0.9] };
}
function buildPhone(M, canvas) {
  const g = new THREE.Group();
  const dock = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.06, 0.2, 48), M.alu)); dock.position.y = 0.1;
  const body = new THREE.Group(); body.rotation.x = -0.14; body.position.y = 0.14;
  const shell = shadowed(new THREE.Mesh(slab(1.62, 3.36, 0.15, 0.27), M.alu)); shell.position.y = 1.68;
  const bezel = new THREE.Mesh(roundedPlane(1.56, 3.3, 0.24), M.glass); bezel.position.set(0, 1.68, 0.077);
  const screen = new THREE.Mesh(roundedPlane(1.5, 3.105, 0.2), M.screen(canvas)); screen.position.set(0, 1.68, 0.08);
  body.add(shell, bezel, screen);
  g.add(dock, body);
  return { group: g, screen, half: [1.0, 1.0, 1.0] };
}

// ------------------------------------------------------------------- world
export function buildWorld({ renderer, screens, small = false }) {
  const rand = mulberry32(170_2026);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const root = new THREE.Group();
  const envDark = environment(renderer, { top: 0.05, horizon: 0.02, floor: 0.012, gain: 0.22 });
  const envLight = environment(renderer, { top: 1.0, horizon: 0.62, floor: 0.82, gain: 1 });
  const P = PARTS;
  const accentMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const blinkMat = new THREE.MeshBasicMaterial({ toneMapped: false });

  // ---- the board: copper, solder mask, gold and print on a fibreglass slab, with everything mounted on it
  const L = layoutBoard();
  const art = paintBoard(L, small ? 2048 : 4096);
  const parts = buildParts({ L, aniso, accentMat, floorY: FLOOR_Y });
  shadeBoard(art.color, parts.ao);
  const surface = canvasTexture(art.surface, false, aniso);
  const boardMat = new THREE.MeshStandardMaterial({
    map: canvasTexture(art.color, true, aniso), normalMap: canvasTexture(art.normal, false, aniso), normalScale: new THREE.Vector2(1, 1),
    roughnessMap: surface, metalnessMap: surface, roughness: 1, metalness: 1, envMap: envDark, envMapIntensity: 0.5,
  });
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0x2b2a22, roughness: 0.8 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(BOARD_W, 0.16, BOARD_D), [edgeMat, edgeMat, boardMat, edgeMat, edgeMat, edgeMat]);
  board.position.set((BOARD.x0 + BOARD.x1) / 2, -0.08, (BOARD.z0 + BOARD.z1) / 2);
  shadowed(board);
  root.add(board, parts.root);

  const floorMat = new THREE.ShadowMaterial({ opacity: 0.2, color: 0x0a1630 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.y = FLOOR_Y; floor.receiveShadow = true;
  root.add(floor);

  const holo = hologram();
  holo.group.position.set(0, 1.3, 0);
  root.add(holo.group);

  // ---- AI server racks, standing on the floor behind the board
  const box = new THREE.BoxGeometry(1, 1, 1);
  const matte = new Pool(box, new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.3 }), 40);
  const accent = new Pool(box, accentMat, 40, false);
  const blink = new Pool(box, blinkMat, 140, false);
  const blinkItems = [];
  const chassis = new THREE.MeshStandardMaterial({ color: 0x30343b, metalness: 0.9, roughness: 0.5 });
  const servers = new Pool(softBox(2.24, 0.54, 2.4, 0.02), [chassis, chassis, chassis, chassis, new THREE.MeshStandardMaterial({ map: canvasTexture(serverFront(), true, aniso), metalness: 0.45, roughness: 0.5 }), chassis], 18);
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x16181c, metalness: 0.7, roughness: 0.46 });
  const post = softBox(0.13, 5.72, 0.13, 0.03), cap = softBox(2.56, 0.14, 2.76, 0.05);
  const Rk = SPOTS.racks, y0 = FLOOR_Y;
  for (const rx of [-1.5, 1.5]) {
    const x = Rk.x + rx, z = Rk.z;
    for (const y of [0.07, 5.79]) { const m = shadowed(new THREE.Mesh(cap, frameMat)); m.position.set(x, y0 + y, z); root.add(m); }
    for (const sx of [-1, 1]) {
      matte.add(x + sx * 1.235, y0 + 2.93, z, 0.03, 5.58, 2.5, 0x17191e);
      for (const sz of [-1, 1]) { const m = shadowed(new THREE.Mesh(post, frameMat)); m.position.set(x + sx * 1.2, y0 + 2.93, z + sz * 1.3); root.add(m); }
    }
    matte.add(x, y0 + 2.93, z - 1.33, 2.4, 5.58, 0.03, 0x17191e);
    accent.add(x, y0 + 5.7, z + 1.36, 2.3, 0.04, 0.03);
    for (let u = 0; u < 9; u++) {
      const y = y0 + 0.5 + u * 0.585, zf = z + 1.3;
      servers.add(x, y, z + 0.1, 1, 1, 1);
      accent.add(x + 0.34, y - 0.12, zf + 0.006, 1.3, 0.03, 0.012);
      for (let k = 0; k < 6; k++) {
        blink.add(x - 0.94 + k * 0.11, y + 0.1, zf + 0.008, 0.05, 0.05, 0.016);
        blinkItems.push({ kind: 1, i: u, j: k, seed: rand() });
      }
    }
  }

  // ---- devices on the floor
  const M = deviceMaterials(aniso);
  const devices = { laptop: buildLaptop(M, screens.laptop, aniso), tablet: buildTablet(M, screens.tablet), phone: buildPhone(M, screens.phone) };
  const glows = {};
  for (const key of Object.keys(devices)) {
    const d = devices[key], f = FACING[key];
    d.group.position.copy(SPOTS[key]);
    d.group.rotation.y = Math.atan2(f.x, f.z);
    const g = underglow(d.half[0], d.half[1], d.half[2]);
    if (d.offset) g.mesh.position.set(d.offset[0], 0.02, d.offset[1]);
    d.group.add(g.mesh);
    glows[key] = g.u;
    root.add(d.group);
  }
  const addGlow = (key, x, y, z, hx, hz, round, spread, fall) => {
    const g = underglow(hx, hz, round, spread, fall);
    g.mesh.position.set(x, y, z);
    glows[key] = g.u; root.add(g.mesh);
  };
  addGlow('cpu', 0, 0.02, 0, 1.8, 1.8, 0.1, 2.2, 2.2);
  addGlow('racks', Rk.x, FLOOR_Y + 0.02, Rk.z, 2.8, 1.4, 0.1, 2.8, 1.7);
  addGlow('board', board.position.x, FLOOR_Y + 0.015, board.position.z, BOARD_W / 2, BOARD_D / 2, 0.2, 4.5, 0.85);

  // ---- cables: the board feeds every machine around it
  const sheath = new THREE.MeshStandardMaterial({ color: 0x1b1e24, roughness: 0.6, metalness: 0.1 });
  const fy = FLOOR_Y + 0.07, cables = {};
  const run = (key, pts, r = 0.07, speed = 0.9) => {
    const c = cable(pts, r, sheath, speed);
    root.add(c.body, c.light);
    (cables[key] ||= []).push(c.u);
  };
  const hT = P.headers[0], hP = P.headers[1];
  run('tablet', [[hT.x, 0.36, hT.z + 0.2], [hT.x, 0.3, hT.z + 0.75], [hT.x - 0.1, fy, hT.z + 1.9], [-4.5, fy, 11.6], [-4.55, fy, 12.6], [-4.55, fy + 0.3, 13.25]]);
  run('phone', [[hP.x, 0.36, hP.z + 0.2], [hP.x, 0.3, hP.z + 0.75], [hP.x + 0.05, fy, hP.z + 1.9], [3.3, fy, 11.6], [3.22, fy, 12.7], [3.2, fy + 0.06, 13.15]]);
  run('laptop', [[-9.99, 0.5, 0], [-10.6, 0.45, 0.02], [-11.9, fy, 0.3], [-13.1, fy, 0.9], [-14.0, fy + 0.03, 0.55], [-14.2, fy + 0.1, 0.25]]);
  for (let i = 0; i < 4; i++) {
    const sx = P.fiber.x - 0.45 + i * 0.3, ex = Rk.x + (i < 2 ? -1.5 : 1.5) + (i % 2 ? 0.35 : -0.35);
    run('racks', [[sx, 0.3, P.fiber.z - 0.2], [sx, 0.24, P.fiber.z - 0.75], [sx + (ex - sx) * 0.25, fy - 0.02, -12.1], [ex, fy - 0.02, -13.4], [ex, fy + 0.1, Rk.z + 1.32]], 0.045, 1.4);
  }

  root.add(matte.done(), servers.done(), accent.done(), blink.done());

  const traceUniforms = {
    uTime: { value: 0 }, uHdr: { value: 0 }, uHalo: { value: 1 }, uSurgeR: { value: 0 }, uSurgeA: { value: 0 }, uProbeK: { value: 0 },
    uAccent: { value: new THREE.Color() }, uProbe: { value: new THREE.Vector3(0, 0, 999) }, uSurgeO: { value: new THREE.Vector3() }, uBus: { value: new THREE.Vector4() },
  };
  root.add(buildTraces(L, traceUniforms));

  // world-space anchors for the camera
  root.updateMatrixWorld(true);
  const anchors = {};
  for (const key of Object.keys(devices)) {
    const s = devices[key].screen;
    anchors[key] = {
      centre: s.getWorldPosition(new THREE.Vector3()),
      normal: new THREE.Vector3(0, 0, 1).transformDirection(s.matrixWorld),
      right: new THREE.Vector3(1, 0, 0).transformDirection(s.matrixWorld),
    };
  }

  return {
    root, envDark, envLight, boardMat, floorMat, accentMat, traceUniforms, holo, glows, cables, anchors,
    lidMat: parts.lidMat, gpuMat: parts.gpuMat, postMat: parts.postMat, barMat: parts.barMat, fans: parts.fans,
    blink: { mesh: blink.mesh, items: blinkItems },
    screenMats: { laptop: devices.laptop.screen.material, tablet: devices.tablet.screen.material, phone: devices.phone.screen.material },
  };
}

// the printed front of a rack server: status lights, drive bays with pull handles, and a vent
function serverFront() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 232;
  const x = c.getContext('2d');
  x.fillStyle = '#3b4049'; x.fillRect(0, 0, 1024, 232);
  x.fillStyle = '#525862'; x.fillRect(0, 0, 40, 232); x.fillRect(984, 0, 40, 232);                 // rack ears
  x.fillStyle = '#c3c8d0'; for (const [a, b] of [[20, 50], [20, 182], [1004, 50], [1004, 182]]) { x.beginPath(); x.arc(a, b, 9, 0, 7); x.fill(); }
  x.fillStyle = '#07080a'; for (let k = 0; k < 6; k++) { x.beginPath(); x.arc(82 + k * 50, 70, 17, 0, 7); x.fill(); } // sockets for the status lights
  for (let r = 0; r < 3; r++) for (let k = 0; k < 13; k++) { x.beginPath(); x.roundRect(64 + k * 22, 116 + r * 16, 14, 8, 4); x.fill(); }
  x.fillStyle = '#aab1bd'; x.font = "500 17px 'JetBrains Mono', ui-monospace, monospace"; x.textBaseline = 'middle'; x.fillText('APX AI NODE', 64, 190);
  for (let k = 0; k < 6; k++) {                                                                    // drive bays
    const a = 372 + k * 100;
    x.fillStyle = '#101216'; x.beginPath(); x.roundRect(a, 26, 90, 122, 6); x.fill();
    x.fillStyle = '#2c3038'; x.beginPath(); x.roundRect(a + 7, 34, 76, 84, 4); x.fill();
    x.fillStyle = '#101216'; for (let r = 0; r < 5; r++) x.fillRect(a + 16, 44 + r * 14, 58, 6);
    x.fillStyle = '#69707c'; x.beginPath(); x.roundRect(a + 7, 124, 76, 16, 4); x.fill();
  }
  x.fillStyle = '#07080a'; x.beginPath(); x.roundRect(366, 160, 600, 22, 6); x.fill();             // seat for the light strip
  return c;
}
