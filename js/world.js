// The Apex world: a realistic mainboard on a studio floor, wired to the machines around it.
// Everything here is built once; scene.js animates uniforms, lights, fans and the camera.
import * as THREE from 'three';
import { layoutBoard, paintBoard, mulberry32, offsetPath, BOARD, BOARD_W, BOARD_D, PARTS } from './pcb.js';
import { drawLid, drawKeyboard, drawBackplate, drawChipsetPlate, drawPostCode } from './screens.js';

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

const SILVER = 0xd3d8e0, GOLD = 0xe0b45c, GRAPHITE = 0x15181e, BLACK = 0x121419;
const HALO = 3; // live-trace ribbons are HALO x wider than their core, to carry a soft glow

// premultiplied blending: alpha 0 = additive light, alpha > 0 = ink (used on bright backgrounds)
export const GLOW_BLEND = {
  transparent: true, depthWrite: false,
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
};

// ------------------------------------------------------------------ helpers
const D = new THREE.Object3D();
const C = new THREE.Color();

class Pool {
  constructor(geometry, material, max, shadows = true) {
    this.mesh = new THREE.InstancedMesh(geometry, material, max);
    this.mesh.count = 0; this.max = max;
    this.mesh.castShadow = shadows; this.mesh.receiveShadow = shadows;
  }
  add(x, y, z, sx, sy, sz, color = 0xffffff, ry = 0) {
    const i = this.mesh.count;
    if (i >= this.max) return -1;
    D.position.set(x, y, z); D.rotation.set(0, ry, 0); D.scale.set(sx, sy, sz); D.updateMatrix();
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

function roundedShape(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function slab(w, h, d, r) {
  const b = Math.min(0.03, d * 0.25);
  const g = new THREE.ExtrudeGeometry(roundedShape(w - b * 2, h - b * 2, r), {
    depth: d - b * 2, bevelEnabled: true, bevelSize: b, bevelThickness: b, bevelSegments: 3, curveSegments: 10,
  });
  g.translate(0, 0, -(d - b * 2) / 2);
  return g;
}
function roundedPlane(w, h, r) {
  const g = new THREE.ShapeGeometry(roundedShape(w, h, r), 10);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
  return g;
}
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
function environment(renderer, roomColor, gain) {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.BoxGeometry(40, 40, 40), new THREE.MeshBasicMaterial({ color: roomColor, side: THREE.BackSide })));
  const panel = (w, h, v, p, r) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(v * gain, v * gain, v * gain * 1.04), side: THREE.DoubleSide }));
    m.position.set(...p); m.rotation.set(...r); s.add(m);
  };
  panel(22, 22, 5.0, [0, 19.5, 0], [Math.PI / 2, 0, 0]);
  panel(30, 9, 2.4, [-19.5, 6, 0], [0, Math.PI / 2, 0]);
  panel(30, 9, 1.6, [19.5, 6, 0], [0, -Math.PI / 2, 0]);
  panel(30, 7, 2.0, [0, 4, -19.5], [0, 0, 0]);
  panel(14, 5, 1.2, [0, 3, 19.5], [0, Math.PI, 0]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(s, 0.035).texture;
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
    screen: (canvas) => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: canvasTexture(canvas, true, aniso), emissiveIntensity: 1, roughness: 0.16, metalness: 0 }),
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
  const envDark = environment(renderer, 0x0b0e14, 0.3), envLight = environment(renderer, 0xaeb5c2, 1);
  const P = PARTS;

  // ---- the board: painted copper, mask and silkscreen on a fibreglass slab
  const L = layoutBoard();
  const art = paintBoard(L, small ? 2048 : 4096);
  const boardMat = new THREE.MeshStandardMaterial({
    map: canvasTexture(art.color, true, aniso), bumpMap: canvasTexture(art.relief, false, aniso), bumpScale: 1.6,
    roughness: 0.4, metalness: 0.05, envMap: envDark, envMapIntensity: 0.5,
  });
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0x33412a, roughness: 0.75 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(BOARD_W, 0.16, BOARD_D), [edgeMat, edgeMat, boardMat, edgeMat, edgeMat, edgeMat]);
  board.position.set((BOARD.x0 + BOARD.x1) / 2, -0.08, (BOARD.z0 + BOARD.z1) / 2);
  shadowed(board);
  root.add(board);

  const floorMat = new THREE.ShadowMaterial({ opacity: 0.2, color: 0x0a1630 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.y = FLOOR_Y; floor.receiveShadow = true;
  root.add(floor);

  // ---- instanced parts
  const box = new THREE.BoxGeometry(1, 1, 1);
  const matteMat = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.05 });
  const metalMat = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 1 });
  const icSide = new THREE.MeshStandardMaterial({ color: GRAPHITE, roughness: 0.55, metalness: 0.1 });
  const icTop = new THREE.MeshStandardMaterial({ map: markTexture(aniso), roughness: 0.5, metalness: 0.1 });
  const accentMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const blinkMat = new THREE.MeshBasicMaterial({ toneMapped: false });

  const matte = new Pool(box, matteMat, 5200);
  const metal = new Pool(box, metalMat, 9000);
  const ic = new Pool(box, [icSide, icSide, icTop, icSide, icSide, icSide], 400);
  const cyl = new Pool(new THREE.CylinderGeometry(1, 1, 1, 20), metalMat, 900);
  const accent = new Pool(box, accentMat, 500, false);
  const blink = new Pool(box, blinkMat, 300, false);
  const blinkItems = [];

  // ---- standoffs and screws
  for (const [hx, hz] of P.holes) {
    cyl.add(hx, (FLOOR_Y - 0.16) / 2, hz, 0.16, -FLOOR_Y - 0.16, 0.16, 0xc9a44a);
    cyl.add(hx, 0.035, hz, 0.2, 0.07, 0.2, 0xdfe2e7);
  }

  // ---- processor: socket, substrate, lid with the logo, retention frame
  matte.add(0, 0.06, 0, 3.6, 0.12, 3.6, 0x1b1f26);
  matte.add(0, 0.16, 0, 3.0, 0.08, 3.0, 0x0d3527);
  for (let s = 0; s < 4; s++) for (let k = -4; k <= 4; k++) {
    const u = k * 0.24, r = 1.235;
    const x = s === 0 ? r : s === 2 ? -r : u, z = s === 1 ? r : s === 3 ? -r : u;
    matte.add(x, 0.225, z, s % 2 ? 0.15 : 0.09, 0.05, s % 2 ? 0.09 : 0.15, k % 3 ? 0xb39a7c : 0x22252b);
  }
  for (const s of [-1, 1]) {
    metal.add(0, 0.25, s * 1.42, 3.0, 0.08, 0.15, 0xc4c9d1);
    metal.add(s * 1.42, 0.25, 0, 0.15, 0.08, 3.0, 0xc4c9d1);
    for (const t of [-1, 1]) cyl.add(s * 1.42, 0.3, t * 1.42, 0.1, 0.12, 0.1, 0xe2e5ea);
  }
  const lidTex = drawLid();
  const lid = shadowed(new THREE.Mesh(slab(2.25, 2.25, 0.2, 0.16), new THREE.MeshStandardMaterial({ color: 0xd9dde3, metalness: 1, roughness: 0.3 })));
  lid.rotation.x = -Math.PI / 2; lid.position.y = 0.3;
  const lidMat = new THREE.MeshStandardMaterial({ map: canvasTexture(lidTex.face, true, aniso), metalness: 1, roughness: 0.34, emissive: 0xffffff, emissiveMap: canvasTexture(lidTex.glow, true, aniso), emissiveIntensity: 0 });
  const face = new THREE.Mesh(roundedPlane(2.16, 2.16, 0.13), lidMat);
  face.rotation.x = -Math.PI / 2; face.position.y = 0.402; face.receiveShadow = true;
  root.add(lid, face);

  const holo = hologram();
  holo.group.position.set(0, 1.3, 0);
  root.add(holo.group);

  // ---- voltage regulators: finned heatsinks, chokes and capacitors around the socket
  const heatsink = (cx, cz, w, d, h, alongZ) => {
    metal.add(cx, 0.07, cz, w, 0.1, d, 0x4b515c);
    const len = alongZ ? d : w, n = Math.floor(len / 0.19);
    for (let k = 0; k < n; k++) {
      const o = -len / 2 + 0.1 + k * ((len - 0.2) / (n - 1));
      if (alongZ) metal.add(cx, 0.12 + h / 2, cz + o, w, h, 0.07, 0x7d8592);
      else metal.add(cx + o, 0.12 + h / 2, cz, 0.07, h, d, 0x7d8592);
    }
    metal.add(cx, 0.15 + h, cz, alongZ ? w * 0.94 : w * 0.985, 0.07, alongZ ? d * 0.985 : d * 0.94, 0x2b3038);
    accent.add(cx, 0.2 + h, cz, alongZ ? 0.07 : w * 0.82, 0.03, alongZ ? d * 0.82 : 0.07);
  };
  heatsink(P.vrmW.x, P.vrmW.z, P.vrmW.w, P.vrmW.d, 0.9, true);
  heatsink(P.vrmN.x, P.vrmN.z, P.vrmN.w, P.vrmN.d, 0.9, false);
  for (let k = -3; k <= 3; k++) {
    matte.add(-2.33, 0.21, k * 0.56, 0.44, 0.4, 0.44, 0x5d646f); matte.add(-2.33, 0.415, k * 0.56, 0.3, 0.012, 0.3, 0x8a919c);
    matte.add(k * 0.56, 0.21, -2.33, 0.44, 0.4, 0.44, 0x5d646f); matte.add(k * 0.56, 0.415, -2.33, 0.3, 0.012, 0.3, 0x8a919c);
    cyl.add(-4.32, 0.22, k * 0.56, 0.15, 0.42, 0.15, k % 2 ? 0x2a2e37 : 0xcfd4dc); cyl.add(-4.32, 0.436, k * 0.56, 0.1, 0.012, 0.1, 0xeceef2);
    cyl.add(k * 0.56, 0.22, -4.32, 0.15, 0.42, 0.15, k % 2 ? 0xcfd4dc : 0x2a2e37); cyl.add(k * 0.56, 0.436, -4.32, 0.1, 0.012, 0.1, 0xeceef2);
  }

  // ---- rear I/O: ports under a shroud
  [[-6.6, 0.8, 1.15], [-5.5, 0.9, 0.5], [-4.4, 0.8, 1.15], [-3.2, 0.9, 1.25], [-1.9, 0.8, 1.15], [0, 1.1, 0.55], [1.5, 0.9, 1.25], [2.7, 0.7, 1.1]].forEach(([z, d, h]) => {
    metal.add(-9.3, h / 2 + 0.02, z, 1.35, h, d, 0xc9ced6);
    matte.add(-9.985, h / 2 + 0.02, z, 0.02, h * 0.6, d * 0.72, 0x07080a);
  });
  matte.add(-8.7, 1.42, -2.0, 2.2, 0.16, 10.7, 0x1a1d23);
  matte.add(-7.72, 0.72, -2.0, 0.16, 1.36, 10.7, 0x1a1d23);
  matte.add(-8.7, 0.72, -7.28, 2.2, 1.36, 0.14, 0x1a1d23); matte.add(-8.7, 0.72, 3.28, 2.2, 1.36, 0.14, 0x1a1d23);
  accent.add(-7.9, 1.51, -2.0, 0.06, 0.03, 10.0);
  accent.add(-7.63, 0.3, -2.0, 0.03, 0.05, 10.0);

  // ---- memory: four slots, four sticks with light bars
  P.ram.xs.forEach((x, i) => {
    matte.add(x, 0.11, 0, 0.3, 0.22, P.ram.len + 0.3, i % 2 ? 0x2a2e36 : 0x15171c);
    matte.add(x, 0.78, 0, 0.05, 1.12, P.ram.len - 0.4, 0x0d3527);
    for (const s of [-1, 1]) {
      metal.add(x + s * 0.045, 0.84, 0, 0.03, 0.86, P.ram.len - 0.6, 0x59616f);
      for (let k = 0; k < 9; k++) metal.add(x + s * 0.065, 0.84, -2.0 + k * 0.5, 0.02, 0.62, 0.34, 0x8b94a3);
      matte.add(x, 0.36, s * (P.ram.len / 2 + 0.07), 0.28, 0.62, 0.14, 0xd9dde5);
    }
    accent.add(x, 1.37, 0, 0.1, 0.09, P.ram.len - 0.4);
  });

  // ---- power connectors
  const connector = (cx, cz, w, d, cols, rows) => {
    matte.add(cx, 0.4, cz, w, 0.8, d, 0x191b20);
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const x = cx + (i - (cols - 1) / 2) * (w * 0.8 / cols) * 1.1, z = cz + (j - (rows - 1) / 2) * (d * 0.92 / rows);
      matte.add(x, 0.803, z, (w * 0.8) / cols * 0.72, 0.01, (d * 0.92) / rows * 0.72, 0x050607);
      metal.add(x, 0.79, z, 0.045, 0.03, 0.045, GOLD);
    }
  };
  connector(P.atx.x, P.atx.z, P.atx.w, P.atx.d, 2, 12);
  connector(P.eps.x, P.eps.z, P.eps.w, P.eps.d, 2, 4);

  // ---- M.2 drive under a heatsink
  metal.add(P.m2.x, 0.17, P.m2.z, P.m2.w, 0.2, P.m2.d, 0x3a3f49);
  for (let k = 0; k < 5; k++) matte.add(P.m2.x - 1.2 + k * 0.5, 0.273, P.m2.z, 0.05, 0.012, P.m2.d * 0.8, 0x15171b);
  cyl.add(P.m2.x + P.m2.w / 2 - 0.22, 0.29, P.m2.z, 0.1, 0.05, 0.1, 0xe2e5ea);
  accent.add(P.m2.x - P.m2.w / 2 + 0.2, 0.275, P.m2.z, 0.05, 0.012, P.m2.d * 0.7);

  // ---- expansion slots
  P.pcie.forEach((s, i) => {
    const len = s.x1 - s.x0, cx = (s.x0 + s.x1) / 2;
    matte.add(cx, 0.21, s.z, len, 0.42, 0.34, 0x14161a);
    matte.add(cx, 0.425, s.z, len * 0.97, 0.01, 0.08, 0x050607);
    if (i !== 1) for (const t of [-1, 1]) metal.add(cx, 0.22, s.z + t * 0.185, len, 0.44, 0.03, 0xb9bfc9);
    matte.add(s.x1 + 0.16, 0.3, s.z, 0.3, 0.5, 0.4, 0x2a2e36);
  });

  // ---- graphics card: the AI accelerator, standing in the first slot
  const gx0 = P.gpu.x0, gx1 = P.gpu.x1, gcx = (gx0 + gx1) / 2, glen = gx1 - gx0, gz = P.gpu.z;
  matte.add(gcx, 2.55, gz, glen, 4.1, 0.07, 0x0b2a20);
  metal.add(gcx, 2.6, gz + 0.09, glen, 4.2, 0.07, 0x2a2f37);
  matte.add(gcx, 2.6, gz - 0.86, glen - 0.2, 4.2, 1.5, 0x16181d);
  metal.add(gx0 - 0.04, 2.45, gz - 0.75, 0.06, 4.5, 1.72, 0xc4c9d1);
  matte.add(gx1 - 1.2, 4.78, gz - 0.6, 1.3, 0.16, 0.5, 0x0b0c0f);
  accent.add(gcx, 4.73, gz - 0.2, glen - 0.9, 0.06, 0.1);
  accent.add(gcx, 0.72, gz - 1.615, glen - 1.0, 0.05, 0.02);
  const plateTex = drawBackplate();
  const gpuMat = new THREE.MeshStandardMaterial({ map: canvasTexture(plateTex.face, true, aniso), metalness: 0.9, roughness: 0.42, emissive: 0xffffff, emissiveMap: canvasTexture(plateTex.glow, true, aniso), emissiveIntensity: 0 });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(glen, 4.2), gpuMat);
  plate.position.set(gcx, 2.6, gz + 0.127); plate.receiveShadow = true;
  root.add(plate);
  // three fans on the far side, facing the racks
  const fans = [];
  const bladeGeo = new THREE.BoxGeometry(1.08, 0.4, 0.03); bladeGeo.translate(0.86, 0, 0);
  const fanDark = new THREE.MeshStandardMaterial({ color: 0x23272e, roughness: 0.45, metalness: 0.3 });
  for (let i = 0; i < 3; i++) {
    const fx = gcx + (i - 1) * 3.4, fz = gz - 1.615;
    const well = new THREE.Mesh(new THREE.CircleGeometry(1.5, 48), new THREE.MeshStandardMaterial({ color: 0x08090b, roughness: 0.8 }));
    well.position.set(fx, 2.6, fz - 0.004); well.rotation.y = Math.PI;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.06, 8, 48), metalMat);
    ring.position.set(fx, 2.6, fz - 0.03);
    const rotor = new THREE.Group(); rotor.position.set(fx, 2.6, fz - 0.07);
    for (let k = 0; k < 9; k++) {
      const arm = new THREE.Group(); arm.rotation.z = (k / 9) * Math.PI * 2;
      const blade = new THREE.Mesh(bladeGeo, fanDark); blade.rotation.x = 0.55;
      arm.add(blade); rotor.add(arm);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.14, 28), fanDark); hub.rotation.x = Math.PI / 2;
    const cap = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.27, 28), accentMat); cap.position.z = -0.075; cap.rotation.y = Math.PI;
    rotor.add(hub, cap);
    root.add(well, ring, rotor);
    fans.push(rotor);
  }

  // ---- chipset heatsink, storage ports, battery, headers, buttons, status display
  metal.add(P.chipset.x, 0.19, P.chipset.z, P.chipset.s, 0.34, P.chipset.s, 0x30353e);
  const chipPlate = new THREE.Mesh(new THREE.PlaneGeometry(P.chipset.s * 0.94, P.chipset.s * 0.94), new THREE.MeshStandardMaterial({ map: canvasTexture(drawChipsetPlate(), true, aniso), metalness: 0.9, roughness: 0.4 }));
  chipPlate.rotation.x = -Math.PI / 2; chipPlate.position.set(P.chipset.x, 0.362, P.chipset.z); chipPlate.receiveShadow = true;
  root.add(chipPlate);
  accent.add(P.chipset.x - P.chipset.s / 2 + 0.12, 0.37, P.chipset.z, 0.05, 0.02, P.chipset.s * 0.8);
  for (const z of P.sata.zs) {
    matte.add(P.sata.x, 0.38, z, 1.0, 0.76, 0.86, 0x15171c);
    for (const y of [0.22, 0.56]) matte.add(P.sata.x + 0.505, y, z, 0.01, 0.16, 0.62, 0x050607);
  }
  cyl.add(P.battery.x, 0.06, P.battery.z, 0.6, 0.12, 0.6, 0x17191e);
  cyl.add(P.battery.x, 0.15, P.battery.z, 0.5, 0.08, 0.5, 0xdfe2e7);
  for (const h of P.headers) {
    const w = (h.n / 2) * 0.18 + 0.2;
    matte.add(h.x, 0.1, h.z, w, 0.2, 0.42, 0x15171b);
    for (let i = 0; i < h.n / 2; i++) for (const s of [-1, 1]) metal.add(h.x + (i - (h.n / 2 - 1) / 2) * 0.18, 0.3, h.z + s * 0.09, 0.035, 0.26, 0.035, GOLD);
    if (h.id === 'tablet' || h.id === 'phone') matte.add(h.x, 0.36, h.z, w + 0.08, 0.34, 0.5, 0x23262d);
  }
  metal.add(P.fiber.x, 0.17, P.fiber.z, 1.5, 0.34, 0.4, 0x3a3f49);
  accent.add(P.fiber.x, 0.35, P.fiber.z, 1.2, 0.02, 0.06);
  for (const b of P.buttons) {
    cyl.add(b.x, 0.1, b.z, 0.3, 0.2, 0.3, 0x1c1f25);
    const ringGlow = new THREE.Mesh(new THREE.RingGeometry(0.17, 0.25, 32), accentMat);
    ringGlow.rotation.x = -Math.PI / 2; ringGlow.position.set(b.x, 0.205, b.z);
    root.add(ringGlow);
  }
  matte.add(P.post.x, 0.2, P.post.z, 1.0, 0.4, 0.7, 0x0c0d10);
  const postMat = new THREE.MeshBasicMaterial({ map: canvasTexture(drawPostCode(), true, aniso), toneMapped: false });
  const post = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.56), postMat);
  post.rotation.x = -Math.PI / 2; post.position.set(P.post.x, 0.403, P.post.z);
  root.add(post);

  // ---- surface-mount parts from the layout
  for (const s of L.smd) {
    const { kind, x, z, w, d } = s, ry = s.ry ? Math.PI / 2 : 0;
    const Wd = (lx, lz) => (s.ry ? [x + lz, z - lx] : [x + lx, z + lz]);
    if (kind === 'soic') {
      ic.add(x, 0.135, z, w, 0.2, d, 0xffffff, ry);
      for (let k = 0; k < s.leads; k++) for (const sd of [-1, 1]) {
        const [px, pz] = Wd(-((s.leads - 1) * 0.17) / 2 + k * 0.17, sd * (d / 2 + 0.07));
        metal.add(px, 0.03, pz, 0.07, 0.035, 0.2, SILVER, ry);
      }
    } else if (kind === 'qfp') {
      ic.add(x, 0.125, z, w, 0.18, w);
      for (let k = 0; k < s.leads; k++) for (const sd of [-1, 1]) {
        const u = -((s.leads - 1) * 0.17) / 2 + k * 0.17, e = sd * (w / 2 + 0.07);
        metal.add(x + u, 0.03, z + e, 0.07, 0.035, 0.2, SILVER);
        metal.add(x + e, 0.03, z + u, 0.2, 0.035, 0.07, SILVER);
      }
    } else if (kind === 'qfn') ic.add(x, 0.07, z, w, 0.1, w);
    else if (kind === 'r') matte.add(x, 0.045, z, 0.22, 0.08, 0.11, 0x17191d, ry);
    else if (kind === 'c') matte.add(x, 0.05, z, 0.22, 0.1, 0.11, 0xb89b78, ry);
    else if (kind === 'ecap') {
      const h = s.gold ? 0.5 : 0.4;
      cyl.add(x, h / 2 + 0.01, z, 0.17, h, 0.17, s.gold ? GOLD : rand() < 0.6 ? 0xcfd4dc : 0x2a2e37);
      cyl.add(x, h + 0.016, z, 0.11, 0.012, 0.11, 0xeceef2);
    } else if (kind === 'ind') { matte.add(x, 0.2, z, 0.5, 0.4, 0.5, 0x5d646f); matte.add(x, 0.405, z, 0.34, 0.012, 0.34, 0x8a919c); }
    else if (kind === 'xtal') metal.add(x, 0.08, z, 0.6, 0.14, 0.24, 0xd0d5dc, ry);
    else if (kind === 'led') accent.add(x, 0.04, z, 0.14, 0.07, 0.1, 0xffffff, ry);
  }

  // ---- AI server racks, standing on the floor behind the board
  const Rk = SPOTS.racks, y0 = FLOOR_Y;
  for (const rx of [-1.5, 1.5]) {
    const x = Rk.x + rx, z = Rk.z;
    matte.add(x, y0 + 0.06, z, 2.5, 0.12, 2.7, 0x14171c);
    matte.add(x, y0 + 5.76, z, 2.5, 0.12, 2.7, 0x14171c);
    for (const sx of [-1, 1]) {
      matte.add(x + sx * 1.22, y0 + 2.9, z, 0.05, 5.6, 2.7, 0x191c22);
      for (const sz of [-1, 1]) matte.add(x + sx * 1.19, y0 + 2.9, z + sz * 1.29, 0.12, 5.6, 0.12, 0x101216);
    }
    matte.add(x, y0 + 2.9, z - 1.32, 2.4, 5.6, 0.05, 0x191c22);
    accent.add(x, y0 + 5.66, z + 1.33, 2.3, 0.05, 0.05);
    for (let u = 0; u < 9; u++) {
      const y = y0 + 0.48 + u * 0.585, zf = z + 1.2;
      metal.add(x, y, z, 2.24, 0.47, 2.4, 0x3a3f49);
      accent.add(x + 0.34, y - 0.12, zf + 0.012, 1.3, 0.035, 0.02);
      for (let k = 0; k < 4; k++) matte.add(x - 0.1 + k * 0.3, y + 0.06, zf + 0.006, 0.26, 0.2, 0.02, 0x0b0d11);
      for (const sx of [-1, 1]) metal.add(x + sx * 1.04, y, zf + 0.03, 0.05, 0.3, 0.06, 0xb8bec8);
      for (let k = 0; k < 6; k++) {
        blink.add(x - 0.94 + k * 0.11, y + 0.1, zf + 0.012, 0.055, 0.055, 0.02);
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

  root.add(matte.done(), metal.done(), ic.done(), cyl.done(), accent.done(), blink.done());

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
    root, envDark, envLight, boardMat, floorMat, lidMat, gpuMat, postMat, accentMat, traceUniforms, holo, glows, cables, fans, anchors,
    blink: { mesh: blink.mesh, items: blinkItems },
    screenMats: { laptop: devices.laptop.screen.material, tablet: devices.tablet.screen.material, phone: devices.phone.screen.material },
  };
}

function markTexture(aniso) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#191c23'; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(255,255,255,0.07)'; x.lineWidth = 6; x.strokeRect(10, 10, 236, 236);
  x.fillStyle = '#343a46'; x.beginPath(); x.arc(42, 214, 13, 0, 7); x.fill();
  x.fillStyle = '#b3bccb'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = "700 54px 'Space Grotesk', system-ui, sans-serif"; x.fillText('APX', 128, 100);
  x.font = "500 26px 'JetBrains Mono', monospace"; x.fillText('7401-A', 128, 150);
  return canvasTexture(c, true, aniso);
}
