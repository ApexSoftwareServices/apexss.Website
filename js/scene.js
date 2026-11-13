// Apex scene: a scroll-driven camera flight around a living mainboard, the machines it feeds,
// and the fabrication pad where each service assembles itself.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildWorld, SPOTS } from './world.js';
import { createScreens } from './screens.js';
import { createForge, FORGE } from './forge.js';

// Brand tones. a/b = accent pair in dark mode, la/lb = accent pair in bright mode.
export const TONES = {
  blue:   { a: '#3fc0ff', b: '#b8ecff', la: '#0b84c6', lb: '#27aae1' },
  green:  { a: '#9be03a', b: '#d6ff8a', la: '#4a850a', lb: '#74ad1f' },
  orange: { a: '#ffa23a', b: '#ffd08a', la: '#c96a00', lb: '#f08a12' },
};
// Camera stations and the tone each one carries.
const STATIONS = {
  cpu: 'blue', board: 'blue', skyline: 'orange', bus: 'blue', dive: 'blue',
  server: 'green', rack: 'green', gpu: 'green',
  laptop: 'blue', tablet: 'orange', phone: 'green', studio: 'orange', forge: 'blue',
};

const DARK = { bg: 0x03050b, board: 0x6f7d78 };
const LIGHT = { bg: 0xf3f5fa, board: 0xffffff };

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const ease = (t) => t * t * (3 - 2 * t);
const mixN = (a, b, t) => a + (b - a) * t;
const hash = (seed, k) => { const v = Math.sin(seed * 91.7 + k * 12.9898) * 43758.5453; return v - Math.floor(v); };

export function createExperience({ canvas, sections, reducedMotion = false, light = false, onChapter = () => {} }) {
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = true;       // each light decides for itself (see shadow.autoUpdate)

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x000000, 34, 120);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.2, 500);

  const screens = createScreens();
  const world = buildWorld({ renderer, screens, small });
  scene.add(world.root);
  scene.environment = light ? world.envLight : world.envDark;
  const forge = createForge({ renderer, accentMat: world.accentMat });
  scene.add(forge.group);

  // ---- sky dome + stars
  const skyU = { uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(220, 32, 16), new THREE.ShaderMaterial({
    uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uTop, uHorizon; varying vec3 vDir;
      void main(){ float band = exp(-abs(vDir.y) * 7.0); gl_FragColor = vec4(mix(uTop, uHorizon, band), 1.0);
      #include <colorspace_fragment>
      }`,
  }));
  sky.renderOrder = -10;
  scene.add(sky);

  const starCount = small ? 500 : 1300, starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const a = Math.random() * Math.PI * 2, y = 0.06 + Math.random() * 0.94, r = Math.sqrt(1 - y * y) * 190;
    starPos.set([Math.cos(a) * r, y * 190, Math.sin(a) * r], i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xbcd4ff, size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const stars = new THREE.Points(starGeo, starMat);
  stars.renderOrder = -9;
  scene.add(stars);

  // ---- lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0x93a4c8, 1);
  const key = new THREE.DirectionalLight(0xffffff, 1);
  key.target.position.set(-3, 0, -0.5);
  key.position.set(-13, 15, -8.5);
  key.castShadow = true;
  key.shadow.mapSize.set(small ? 2048 : 4096, small ? 2048 : 4096);
  Object.assign(key.shadow.camera, { left: -21, right: 21, top: 21, bottom: -21, near: 1, far: 70 });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.autoUpdate = false;              // the world is static: its shadows are rendered once
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03; key.shadow.radius = 4;
  const fill = new THREE.DirectionalLight(0xffffff, 0.4);
  fill.position.set(8, 6, 10);
  const core = new THREE.PointLight(0xffffff, 1, 26, 2);
  core.position.set(0, 2.6, 0);
  const probe = new THREE.PointLight(0xffffff, 0, 9, 2);
  probe.position.set(0, 1.1, 999);
  scene.add(hemi, key, key.target, fill, core, probe);

  // ---- surge ring
  const ringMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.975, 1, 128), ringMat);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; ring.renderOrder = 4;
  scene.add(ring);

  // ---- bloom (dark mode only; small screens rely on shader halos)
  let composer = null, bloom = null;
  if (!small) {
    const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.5, 0.42, 0.92);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  // ---- chapters
  const toneColors = {};
  for (const name in TONES) {
    const t = TONES[name];
    toneColors[name] = { a: new THREE.Color(t.a), b: new THREE.Color(t.b), la: new THREE.Color(t.la), lb: new THREE.Color(t.lb) };
  }
  const chapters = sections.map((el) => {
    const name = STATIONS[el.dataset.shape] ? el.dataset.shape : 'cpu';
    return { el, name, tone: el.dataset.tone || STATIONS[name], pos: el.dataset.pos || 'center', dim: parseFloat(el.dataset.dim || '1'), raise: el.dataset.raise === 'true', top: 0 };
  });
  // the tone of a chapter that shows the fabrication pad follows whatever is being built there
  let forgeTone = 'blue';
  const toneOf = (ch) => (ch.name === 'forge' ? forgeTone : ch.tone);

  // ---- layout
  let vw = 1, vh = 1, portrait = false, maxPixelRatio = small ? 1.5 : 1.75;
  function measure() {
    const y = window.scrollY;
    for (const c of chapters) c.top = c.el.getBoundingClientRect().top + y;
  }
  function resize() {
    vw = window.innerWidth; vh = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, maxPixelRatio);
    renderer.setPixelRatio(pr);
    renderer.setSize(vw, vh, false);
    if (composer) { composer.setPixelRatio(pr); composer.setSize(vw, vh); }
    camera.aspect = vw / vh;
    portrait = vw < 900;
    measure();
  }

  // ---- camera stations
  const A = world.anchors, R = SPOTS.racks;
  const mid = new THREE.Vector3().addVectors(A.tablet.centre, A.phone.centre).multiplyScalar(0.5);
  const device = (anchor, dist, up, tgtY, t, P, T) => {
    P.copy(anchor.centre).addScaledVector(anchor.normal, dist).addScaledVector(anchor.right, Math.sin(t * 0.15) * 0.5);
    P.y += up;
    T.copy(anchor.centre); T.y += tgtY;
  };
  function station(name, t, P, T) {
    const s = Math.sin;
    switch (name) {
      case 'board': P.set(8.5 + s(t * 0.07) * 1.5, 15, 16.5); T.set(0.5, 0, -1.2); break;
      case 'skyline': P.set(10 + s(t * 0.1) * 0.8, 1.7, 9.8); T.set(-1.5, 1.6, -3.5); break;
      case 'bus': P.set(-0.3 + s(t * 0.1) * 0.8, 8.2, 9.2); T.set(-0.3, 0, 4.4); break;
      case 'server': P.set(R.x + 6.8 + s(t * 0.11) * 0.7, 2.6, R.z + 9.6); T.set(R.x + 0.7, 2.3, R.z); break;
      case 'rack': P.set(R.x + 0.8 + s(t * 0.12) * 0.5, 2.9, R.z + 6.6); T.set(R.x - 0.2, 2.2, R.z + 1.3); break;
      case 'gpu': P.set(6.8 + s(t * 0.12) * 0.8, 3.5, -13.2); T.set(-2.6, 2.4, -7.2); break;
      case 'laptop': device(A.laptop, 9.2, 0.6, -0.2, t, P, T); break;
      case 'tablet': device(A.tablet, 9.4, 0.3, 0, t, P, T); break;
      case 'phone': device(A.phone, 6.4, 0.2, 0, t, P, T); break;
      case 'studio': P.set(mid.x + 0.4 + s(t * 0.12) * 0.8, mid.y + 1.9, mid.z + 11); T.set(mid.x, mid.y - 0.2, mid.z); break;
      case 'forge': { const a = -0.72 + s(t * 0.11) * 0.16; P.set(FORGE.x + Math.sin(a) * 12.4, FORGE.y + 4.2, FORGE.z + Math.cos(a) * 12.4); T.set(FORGE.x, FORGE.y + 1.75, FORGE.z); break; }
      case 'dive': P.copy(A.phone.centre).addScaledVector(A.phone.normal, 0.8); T.copy(A.phone.centre); return;
      default: { const a = 0.42 + s(t * 0.13) * 0.2; P.set(Math.sin(a) * 10.4, 3.5, Math.cos(a) * 10.4); T.set(0, 1.5, 0); }
    }
    if (portrait) P.sub(T).multiplyScalar(1.45).add(T);
  }
  const shiftOf = (ch) => (portrait ? 0 : ch.pos === 'right' ? 0.2 : ch.pos === 'left' ? -0.235 : 0);
  const raiseOf = (ch) => (portrait && ch.raise ? 0.2 : 0);
  const dimOf = (ch) => (portrait && !ch.raise ? Math.min(ch.dim, 1) * (ch.name === 'dive' ? 0.7 : 0.4) : ch.dim);

  // ---- input
  const pointer = { x: 0, y: 0, sx: 0, sy: 0, cx: 0, cy: 0, active: false };
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  const clock = new THREE.Clock();
  let surgeStart = -10;
  function locate(clientX, clientY, target) {
    ndc.set((clientX / vw) * 2 - 1, -(clientY / vh) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(ground, hit) || hit.distanceTo(camera.position) > 60) return false;
    target.copy(hit);
    return true;
  }
  function surge(clientX, clientY) {
    const o = world.traceUniforms.uSurgeO.value;
    if (clientX == null || !locate(clientX, clientY, o)) o.set(0, 0, 0);
    surgeStart = clock.getElapsedTime();
  }
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    pointer.x = (e.clientX / vw) * 2 - 1; pointer.y = (e.clientY / vh) * 2 - 1;
    pointer.cx = e.clientX; pointer.cy = e.clientY; pointer.active = true;
  }, { passive: true });
  window.addEventListener('pointerdown', (e) => surge(e.clientX, e.clientY), { passive: true });
  document.documentElement.addEventListener('mouseleave', () => { pointer.active = false; });
  window.addEventListener('resize', resize);
  window.addEventListener('load', measure);
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(document.body);

  // ---- frame state
  let smooth = -1, lastChapter = -1, lastTone = '', intro = 0, running = true, raf = 0, frameNo = 0, lastOpacity = -1;
  let slowSum = 0, slowN = 0;
  let lightTarget = light ? 1 : 0, lightNow = lightTarget, probeK = 0, timeAcc = 0, redraw = 9;
  let focusName = null, focusTo = 0, focusW = 0;
  const cA = new THREE.Color(), cB = new THREE.Color(), cT = new THREE.Color(), cHot = new THREE.Color();
  const bg = new THREE.Color(), horizon = new THREE.Color(), tmp = new THREE.Color();
  const dBg = new THREE.Color(DARK.bg), lBg = new THREE.Color(LIGHT.bg);
  const dBoard = new THREE.Color(DARK.board), lBoard = new THREE.Color(LIGHT.board);
  const greenD = new THREE.Color(0x9be03a), greenL = new THREE.Color(0x5c9a0e), ledOff = new THREE.Color(0x1a1d24);
  const pA = new THREE.Vector3(), pB = new THREE.Vector3(), tA = new THREE.Vector3(), tB = new THREE.Vector3();
  const pF = new THREE.Vector3(), tF = new THREE.Vector3();
  const pos = new THREE.Vector3(), tgt = new THREE.Vector3(), back = new THREE.Vector3();
  const deviceKeys = ['laptop', 'tablet', 'phone'];

  function targetProgress() {
    const c = window.scrollY + vh * 0.5;
    let p = 0;
    for (let i = 1; i < chapters.length; i++) p += clamp((c - (chapters[i].top - vh * 0.42)) / (vh * 0.84), 0, 1);
    return p;
  }

  function frame() {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const rawDt = clock.getDelta();
    const dt = Math.min(rawDt, 0.05);
    // adaptive quality: step down resolution, then bloom, if the device cannot hold ~30 fps
    if (frameNo > 40 && rawDt < 0.25) {
      slowSum += rawDt; slowN++;
      if (slowN >= 90) {
        if (slowSum / slowN > 0.034) {
          if (maxPixelRatio > 1) { maxPixelRatio = Math.max(1, maxPixelRatio - 0.5); resize(); }
          else if (composer) { composer.dispose(); composer = null; }
        }
        slowSum = 0; slowN = 0;
      }
    }
    const real = clock.elapsedTime;
    timeAcc += dt * (reducedMotion ? 0.25 : 1);
    const time = timeAcc;
    frameNo++;

    // -- scroll position -> chapter pair
    const target = targetProgress();
    smooth = smooth < 0 ? target : smooth + (target - smooth) * (reducedMotion ? 1 : 1 - Math.exp(-dt * 4.2));
    const last = chapters.length - 1;
    const from = clamp(Math.floor(smooth), 0, Math.max(0, last - 1));
    const to = Math.min(last, from + 1);
    const k = ease(last === 0 ? 0 : clamp(smooth - from, 0, 1));
    const cha = chapters[from], chb = chapters[to];

    // a focus (hovering a service or a menu item) temporarily takes the camera to another station
    focusW += (focusTo - focusW) * (reducedMotion ? 1 : 1 - Math.exp(-dt * 4.5));
    const fE = ease(clamp(focusW, 0, 1));
    const weight = (names) => clamp(((names.includes(cha.name) ? 1 - k : 0) + (names.includes(chb.name) ? k : 0)) * (1 - fE) + (focusName && names.includes(focusName) ? fE : 0), 0, 1);

    const chapter = clamp(Math.round(smooth), 0, last);
    const tone = toneOf(chapters[chapter]);
    if (chapter !== lastChapter || tone !== lastTone) { lastChapter = chapter; lastTone = tone; onChapter(chapter, TONES[tone]); }

    intro = Math.min(1, intro + dt * 0.55);
    const iE = ease(intro);

    // -- theme + accent
    lightNow += (lightTarget - lightNow) * (1 - Math.exp(-dt * 5));
    const L = lightNow, hdr = 1 + 0.8 * (1 - L);
    const ta = toneColors[toneOf(cha)], tb = toneColors[toneOf(chb)];
    cA.copy(ta.a).lerp(tb.a, k).lerp(cT.copy(ta.la).lerp(tb.la, k), L);
    cB.copy(ta.b).lerp(tb.b, k).lerp(cT.copy(ta.lb).lerp(tb.lb, k), L);
    if (focusName && fE > 0.001) {
      const tf = toneColors[STATIONS[focusName]];
      cA.lerp(cT.copy(tf.a).lerp(tf.la, L), fE); cB.lerp(cT.copy(tf.b).lerp(tf.lb, L), fE);
    }
    cHot.copy(cA).multiplyScalar(hdr);
    bg.copy(dBg).lerp(lBg, L);
    horizon.copy(bg).lerp(cA, mixN(0.02, 0.12, L));
    scene.fog.color.copy(bg);
    skyU.uTop.value.copy(bg); skyU.uHorizon.value.copy(horizon);
    starMat.opacity = (1 - L) * 0.8 * iE;
    const env = L > 0.5 ? world.envLight : world.envDark;
    if (scene.environment !== env) { scene.environment = env; world.boardMat.envMap = env; }
    scene.environmentIntensity = mixN(0.9, 0.8, L);
    hemi.intensity = mixN(0.12, 1.0, L);
    key.intensity = mixN(0.8, 1.9, L);
    fill.intensity = mixN(0.1, 0.45, L);
    world.boardMat.envMapIntensity = mixN(0.75, 0.3, L);
    world.boardMat.color.copy(dBoard).lerp(lBoard, L);
    world.floorMat.opacity = mixN(0.55, 0.22, L);

    // -- camera
    station(cha.name, time, pA, tA);
    station(chb.name, time, pB, tB);
    pos.lerpVectors(pA, pB, k); tgt.lerpVectors(tA, tB, k);
    pos.y += Math.sin(Math.PI * k) * Math.min(3.2, pA.distanceTo(pB) * 0.13);
    if (focusName && fE > 0.001) {
      station(focusName, time, pF, tF);
      const lift = Math.sin(Math.PI * fE) * Math.min(3, pos.distanceTo(pF) * 0.1);
      pos.lerp(pF, fE); tgt.lerp(tF, fE); pos.y += lift;
    }
    back.subVectors(pos, tgt).normalize();
    pos.addScaledVector(back, (1 - iE) * 5); pos.y += (1 - iE) * 2.4;
    const diveW = weight(['dive']);
    pointer.sx += (pointer.x - pointer.sx) * 0.05; pointer.sy += (pointer.y - pointer.sy) * 0.05;
    camera.position.copy(pos);
    camera.lookAt(tgt);
    const par = (reducedMotion ? 0 : 1) * (1 - diveW * 0.9);
    camera.translateX(pointer.sx * 0.42 * par); camera.translateY(-pointer.sy * 0.26 * par);
    camera.lookAt(tgt);
    const shift = mixN(shiftOf(cha), shiftOf(chb), k), raise = mixN(raiseOf(cha), raiseOf(chb), k);
    camera.setViewOffset(vw, vh, -shift * vw, raise * vh, vw, vh);
    camera.updateMatrixWorld();
    sky.position.copy(camera.position); stars.position.copy(camera.position);

    const opacity = mixN(dimOf(cha), dimOf(chb), k) * iE;
    if (Math.abs(opacity - lastOpacity) > 0.004) {
      // dimmed chapters also fall out of focus, so the content in front of them stays crisp
      const blur = small ? 0 : clamp((1 - opacity) * 11, 0, 7);
      canvas.style.opacity = opacity.toFixed(3);
      canvas.style.filter = blur > 0.4 ? `blur(${blur.toFixed(1)}px)` : '';
      lastOpacity = opacity;
    }

    // -- current: buses on the board and the cables leaving it
    const U = world.traceUniforms;
    const aiW = weight(['server', 'rack', 'gpu']);
    const devW = { laptop: weight(['laptop']), tablet: weight(['tablet', 'studio']), phone: weight(['phone', 'studio', 'dive']) };
    const useBloom = !!composer && L < 0.995;
    U.uTime.value = time; U.uHdr.value = 1 - L; U.uHalo.value = useBloom ? 0.3 : 1;
    U.uAccent.value.copy(cA);
    U.uBus.value.set(aiW, devW.laptop, devW.tablet, devW.phone);
    const cableK = { racks: aiW, laptop: devW.laptop, tablet: devW.tablet, phone: devW.phone };
    for (const name in world.cables) for (const u of world.cables[name]) {
      u.uTime.value = time; u.uColor.value.copy(cA); u.uK.value = cableK[name]; u.uHdr.value = (1 - L) * 0.8;
    }

    probeK += ((pointer.active ? 1 : 0) - probeK) * 0.08;
    if (pointer.active && locate(pointer.cx, pointer.cy, U.uProbe.value)) probe.position.set(U.uProbe.value.x, 1.1, U.uProbe.value.z);
    U.uProbeK.value = probeK;
    probe.color.copy(cA); probe.intensity = probeK * mixN(9, 4, L);

    const st = clamp((real - surgeStart) / 2.0, 0, 1), fade = (1 - st) * (1 - st);
    U.uSurgeR.value = st * 30; U.uSurgeA.value = fade * 1.5;
    ring.position.x = U.uSurgeO.value.x; ring.position.z = U.uSurgeO.value.z;
    ring.scale.setScalar(Math.max(0.01, st * 30));
    ringMat.color.copy(cHot); ringMat.opacity = fade * 0.9;
    core.color.copy(cA);
    core.intensity = mixN(22, 8, L) * (0.85 + 0.15 * Math.sin(time * 1.7)) * (1 + fade * 1.5);

    // -- glowing parts
    world.accentMat.color.copy(cHot);
    world.postMat.color.copy(cHot);
    world.lidMat.emissiveIntensity = mixN(1.25, 0.0, L) * (0.8 + 0.2 * Math.sin(time * 1.7));
    world.gpuMat.emissiveIntensity = mixN(1.3, 0.0, L) * (0.85 + 0.15 * Math.sin(time * 1.3 + 1));
    for (const u of world.holo.uniforms) { u.uColor.value.copy(cA); u.uTime.value = time; u.uLight.value = L; }
    world.holo.uniforms[1].uColor.value.copy(greenD).lerp(greenL, L); // the green peak of the Apex mark
    world.holo.outer.rotation.y = time * 0.22;
    world.holo.core.rotation.y = -time * 0.6;
    world.holo.group.position.y = 1.3 + Math.sin(time * 0.9) * 0.05;
    const glowK = { cpu: 0.8, board: mixN(0.5, 0.3, L), racks: 0.2 + 0.8 * aiW, laptop: 0.15 + 0.85 * devW.laptop, tablet: 0.15 + 0.85 * devW.tablet, phone: 0.15 + 0.85 * devW.phone };
    for (const name in world.glows) {
      const u = world.glows[name];
      u.uColor.value.copy(cA); u.uLight.value = L; u.uTime.value = time; u.uK.value = glowK[name];
    }
    for (const rotor of world.fans) rotor.rotation.z -= dt * (5 + 9 * aiW);

    // -- rack status lights
    const bm = world.blink.mesh, items = world.blink.items;
    for (let n = 0; n < items.length; n++) {
      const it = items[n], on = hash(it.seed, Math.floor(time * (2 + it.seed * 6))) > 0.42;
      tmp.copy(on ? (it.j % 3 === 0 ? cB : cA) : ledOff);
      if (on) tmp.multiplyScalar(hdr);
      bm.setColorAt(n, tmp);
    }
    bm.instanceColor.needsUpdate = true;

    // -- the fabrication pad
    forge.update(dt, time, cA, cB, L, weight(['forge']));

    // -- device screens: one redraw per frame, round-robin
    if (!reducedMotion || redraw > 0) {
      redraw--;
      const which = deviceKeys[frameNo % 3];
      screens.draw(which, reducedMotion ? 9 : time, L > 0.5, '#' + cA.getHexString(), '#' + cB.getHexString(),
        which === 'phone' ? clamp((diveW - 0.45) / 0.5, 0, 1) : 0, '#' + bg.getHexString());
      world.screenMats[which].emissiveMap.needsUpdate = true;
    }
    for (const name of deviceKeys) world.screenMats[name].emissiveIntensity = mixN(mixN(0.45, 0.9, L), 1, devW[name]);

    if (frameNo === 2 || frameNo === 30) key.shadow.needsUpdate = true;
    if (useBloom) { bloom.strength = 0.5 * (1 - L); composer.render(); } else renderer.render(scene, camera);
  }

  function setRunning(on) {
    if (on === running) return;
    running = on;
    if (on) { clock.getDelta(); frame(); } else cancelAnimationFrame(raf);
  }
  document.addEventListener('visibilitychange', () => setRunning(!document.hidden));
  document.fonts?.ready.then(() => { redraw = 9; });

  resize();
  frame();

  return {
    measure,
    pulse: () => surge(),
    setTheme: (isLight) => { lightTarget = isLight ? 1 : 0; redraw = 40; },
    // fly the camera to a station while something is hovered; pass null to return
    focus: (name) => { if (name && STATIONS[name]) { focusName = name; focusTo = 1; } else focusTo = 0; },
    // assemble a service on the fabrication pad
    build: (name, tone, progress = 1) => { if (TONES[tone]) forgeTone = tone; forge.show(name, progress); },
  };
}
