// Surface finishes: small tiling maps that give metal and plastic their fine detail,
// and the height-to-normal conversion used for the mainboard's copper relief.
import * as THREE from 'three';

const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function tiling(canvas, repeatX = 1, repeatY = repeatX) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 8;
  return t;
}

// Turns a greyscale height canvas into a tangent-space normal map (returned as a canvas).
export function normalFromHeight(src, strength = 1, wrap = false) {
  const w = src.width, h = src.height;
  const a = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const out = mk(w, h), oc = out.getContext('2d'), img = oc.createImageData(w, h), o = img.data;
  const at = (x, y) => {
    if (wrap) { x = (x + w) % w; y = (y + h) % h; } else { x = x < 0 ? 0 : x >= w ? w - 1 : x; y = y < 0 ? 0 : y >= h ? h - 1 : y; }
    return a[(y * w + x) * 4];
  };
  const k = strength / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * k, dy = (at(x, y + 1) - at(x, y - 1)) * k;
    const l = 1 / Math.sqrt(dx * dx + dy * dy + 1), i = (y * w + x) * 4;
    o[i] = (-dx * l * 0.5 + 0.5) * 255; o[i + 1] = (dy * l * 0.5 + 0.5) * 255; o[i + 2] = (l * 0.5 + 0.5) * 255; o[i + 3] = 255;
  }
  oc.putImageData(img, 0, 0);
  return out;
}

const cache = new Map();
const once = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };

// greyscale canvases ------------------------------------------------------
// long, fine scratches running along U
function brushedCanvas(seed, base, spread) {
  const s = 512, c = mk(s, s), x = c.getContext('2d'), r = rng(seed);
  x.fillStyle = `rgb(${base},${base},${base})`; x.fillRect(0, 0, s, s);
  for (let i = 0; i < 5200; i++) {
    const v = r() < 0.5 ? 255 : 0, len = 40 + r() * 420, px = r() * s, py = Math.floor(r() * s);
    x.fillStyle = `rgba(${v},${v},${v},${r() * spread})`;
    x.fillRect(px, py, len, 1); x.fillRect(px - s, py, len, 1);   // drawn twice so the map tiles
  }
  return c;
}
// even, fine grain
function grainCanvas(seed, size, lo, hi) {
  const c = mk(size, size), x = c.getContext('2d'), img = x.createImageData(size, size), d = img.data, r = rng(seed);
  for (let i = 0; i < d.length; i += 4) { const v = lo + r() * (hi - lo); d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
  x.putImageData(img, 0, 0);
  return c;
}

// Each finish returns a fresh texture object sharing one canvas, so callers can set their own repeat.
export const FINISH = {
  // roughness map for brushed or anodised metal; scratches run along U
  brushed: (repeatX = 1, repeatY = repeatX) => tiling(once('brushed', () => brushedCanvas(11, 178, 0.16)), repeatX, repeatY),
  // a stronger version for satin steel
  satin: (repeatX = 1, repeatY = repeatX) => tiling(once('satin', () => brushedCanvas(23, 160, 0.26)), repeatX, repeatY),
  // a fine, even grain as a normal map: moulded plastic and bead-blasted metal
  grainNormal: (repeat = 1) => tiling(once('grainN', () => normalFromHeight(grainCanvas(7, 256, 96, 160), 0.55, true)), repeat),
};
