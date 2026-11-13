// Geometry helpers shared by the mainboard and the service builds: soft-edged boxes,
// extruded profiles (heatsinks, shrouds), lathed parts (capacitors, screws, the turntable) and fan blades.
import * as THREE from 'three';

const TAU = Math.PI * 2;

export function roundedShape(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  r = Math.max(0.001, Math.min(r, Math.min(w, h) / 2 - 0.001));
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
export function polygon(points) {
  const s = new THREE.Shape();
  points.forEach((p, i) => (i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])));
  s.closePath();
  return s;
}
export function circlePath(cx, cy, r) {
  const p = new THREE.Path();
  p.absarc(cx, cy, r, 0, TAU, true);
  return p;
}

// Extrudes a shape (drawn in XY) along Z, centred on Z, with softened rims.
export function extrude(shape, depth, bevel = 0.02, curveSegments = 10, bevelSegments = 2) {
  const b = Math.min(bevel, depth * 0.45);
  const g = new THREE.ExtrudeGeometry(shape, { depth: depth - b * 2, bevelEnabled: b > 0, bevelSize: b, bevelThickness: b, bevelSegments, curveSegments });
  g.translate(0, 0, -(depth - b * 2) / 2);
  return g;
}
// A rounded rectangle w x h in XY, d thick along Z; the outline is inset so the bevel lands on w x h.
export function slab(w, h, d, r = 0.05, bevel = Math.min(0.03, d * 0.25)) {
  return extrude(roundedShape(w - bevel * 2, h - bevel * 2, Math.max(0.004, r - bevel)), d, bevel);
}
// The same slab lying flat: w along X, d along Z, t thick along Y.
export function plate(w, d, t, r = 0.05, bevel) {
  const g = slab(w, d, t, r, bevel);
  g.rotateX(-Math.PI / 2);
  return g;
}

// A flat rounded rectangle with 0..1 UVs, for printed faces and screens.
export function roundedPlane(w, h, r, curveSegments = 10) {
  const g = new THREE.ShapeGeometry(roundedShape(w, h, r), curveSegments), p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
  return g;
}

// A box with rounded edges. It keeps BoxGeometry's six material groups (+x, -x, +y, -y, +z, -z)
// and 0..1 UVs per face, so the top can carry a printed label. Light enough to instance.
export function softBox(w, h, d, r = 0.03) {
  r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const g = new THREE.BoxGeometry(w, h, d, 3, 3, 3);
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv, half = [w / 2, h / 2, d / 2];
  const uLen = [d, d, w, w, w, w], vLen = [h, h, d, d, h, h];
  const v = new THREE.Vector3(), c = new THREE.Vector3(), q = [0, 0, 0];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const a = [v.x, v.y, v.z];
    for (let k = 0; k < 3; k++) q[k] = Math.sign(a[k]) * (half[k] - r);          // every grid row is either an edge or an inner row
    c.set(q[0], q[1], q[2]);
    v.set(Math.abs(Math.abs(a[0]) - half[0]) < 1e-6 ? a[0] : q[0], Math.abs(Math.abs(a[1]) - half[1]) < 1e-6 ? a[1] : q[1], Math.abs(Math.abs(a[2]) - half[2]) < 1e-6 ? a[2] : q[2]).sub(c).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
    p.setXYZ(i, c.x + v.x * r, c.y + v.y * r, c.z + v.z * r);
    const f = Math.floor(i / 16), ru = r / uLen[f], rv = r / vLen[f], fix = (t, e) => (t < 0.01 ? 0 : t > 0.99 ? 1 : t < 0.5 ? e : 1 - e);
    uv.setXY(i, fix(uv.getX(i), ru), fix(uv.getY(i), rv));
  }
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}

// Cross-section of a finned heatsink, origin at the bottom centre: a base slab with n fins on top.
// `height(i)` may vary per fin to sculpt the silhouette.
export function comb(w, n, base, fin, height, chamfer = 0.02) {
  const gap = (w - n * fin) / (n - 1), pts = [[-w / 2, 0]];
  for (let i = 0; i < n; i++) {
    const x0 = -w / 2 + i * (fin + gap), x1 = x0 + fin, h = typeof height === 'function' ? height(i) : height;
    pts.push([x0, h - chamfer], [x0 + chamfer, h], [x1 - chamfer, h], [x1, h - chamfer]);
    if (i < n - 1) pts.push([x1, base], [x1 + gap, base]);
  }
  pts.push([w / 2, 0]);
  return polygon(pts);
}

// A profile in (radius, height) pairs spun around Y.
export function lathe(points, segments = 32) {
  return new THREE.LatheGeometry(points.map((p) => new THREE.Vector2(p[0], p[1])), segments);
}
// A can with softened top and bottom edges, standing on y = 0.
export function can(r, h, b = Math.min(r, h) * 0.12, segments = 28) {
  return lathe([[0, 0], [r - b, 0], [r, b], [r, h - b], [r - b * 0.3, h - b * 0.3], [r - b, h], [0, h]], segments);
}

// Swept, pitched fan blades around a hub, lying in the XY plane.
export function fanBlades(R, hub, n) {
  const pos = [], idx = [], S = 6;
  for (let b = 0; b < n; b++) {
    const a0 = (b / n) * TAU, base = pos.length / 3;
    for (let i = 0; i <= S; i++) {
      const s = i / S, r = hub + s * (R - hub), sweep = s * 0.6, half = 0.33 - 0.13 * s, z = 0.05 * (1 - 0.35 * s) * (R / 0.42);
      pos.push(Math.cos(a0 + sweep + half) * r, Math.sin(a0 + sweep + half) * r, z, Math.cos(a0 + sweep - half) * r, Math.sin(a0 + sweep - half) * r, -z);
    }
    for (let i = 0; i < S; i++) { const k = base + i * 2; idx.push(k, k + 1, k + 2, k + 2, k + 1, k + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// A flat ring in the XZ plane facing +Y, with polar UVs (u runs around, v runs outwards) and tangents
// that follow the circle, so brushed maps and anisotropic highlights read as lathe-turned metal.
export function spunDisc(r0, r1, around = 1, segments = 128, rings = 6) {
  const pos = [], nor = [], uv = [], tan = [], idx = [];
  for (let j = 0; j <= rings; j++) {
    const r = r0 + (r1 - r0) * (j / rings);
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * TAU, c = Math.cos(a), s = Math.sin(a);
      pos.push(c * r, 0, -s * r); nor.push(0, 1, 0); uv.push((i / segments) * around, r); tan.push(-s, 0, -c, 1);
    }
  }
  const row = segments + 1;
  for (let j = 0; j < rings; j++) for (let i = 0; i < segments; i++) {
    const a = j * row + i, b = a + row;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('tangent', new THREE.Float32BufferAttribute(tan, 4));
  g.setIndex(idx);
  return g;
}

// Merges geometries that share position / normal / uv into one (indexed inputs are expanded).
export function merge(list) {
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let total = 0;
  for (const p of parts) total += p.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  let o = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array, o * 3); nor.set(p.attributes.normal.array, o * 3);
    if (p.attributes.uv) uv.set(p.attributes.uv.array, o * 2);
    o += p.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
// A stack of thin plates (heatsink fins) spread along one axis, as a single geometry.
export function finStack(w, h, d, n, axis, t = 0.014) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1) - 0.5;
    const b = axis === 'x' ? new THREE.BoxGeometry(t, h, d) : axis === 'y' ? new THREE.BoxGeometry(w, t, d) : new THREE.BoxGeometry(w, h, t);
    b.translate(axis === 'x' ? k * (w - t) : 0, axis === 'y' ? k * (h - t) : 0, axis === 'z' ? k * (d - t) : 0);
    parts.push(b);
  }
  return merge(parts);
}
