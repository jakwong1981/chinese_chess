// Procedural 3D sculpted General (帥 / 將) miniature based on the Red & Black
// 3-view reference sheets: ornate lamellar armor, lion-head pauldrons, helmet with
// sweeping plume, bearded face, flowing gold-trimmed cape, hip sword with tassel,
// and engraved 帥/將 forehead & belt medallions.
//
// Local orientation: front faces −Z (Red rotation.y = 0 faces Black; Black rotation.y = π faces Red).
// Built as a single merged multi-material THREE.Mesh for 1-draw-call rendering and
// seamless compatibility with piece picking, hover lift, hop animation, and capture FX.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RED, GLYPHS } from '../../shared/rules.js';

const kingGeoCache = new Map();
const kingMatCache = new Map();

const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _pos = new THREE.Vector3();
const _scl = new THREE.Vector3();

function normGeom(raw) {
  const g = raw.index ? raw.toNonIndexed() : raw.clone();
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) {
    const count = g.attributes.position.count;
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  }
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') {
      g.deleteAttribute(name);
    }
  }
  return g;
}

function placed(raw, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const g = normGeom(raw);
  raw.dispose();
  _euler.set(rx, ry, rz);
  _quat.setFromEuler(_euler);
  _pos.set(x, y, z);
  _scl.set(sx, sy, sz);
  g.applyMatrix4(_mat4.compose(_pos, _quat, _scl));
  return g;
}

// ---------------------------------------------------------------------------
// Procedural PBR textures (scale armor, gold-hemmed cape, engraved 帥/將 medallion)
// ---------------------------------------------------------------------------
function makeScaleArmorMaps(isRed) {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');

  // Underlay
  ctx.fillStyle = isRed ? '#5e140e' : '#1b1d20';
  ctx.fillRect(0, 0, size, size);

  const b = document.createElement('canvas');
  b.width = b.height = size;
  const bCtx = b.getContext('2d');
  bCtx.fillStyle = '#404040';
  bCtx.fillRect(0, 0, size, size);

  const cols = 16;
  const rows = 20;
  const cw = size / cols;
  const rh = size / rows;

  for (let r = -1; r <= rows; r++) {
    for (let col = -1; col <= cols; col++) {
      const cx = (col + (r % 2 ? 0.5 : 0)) * cw;
      const cy = r * rh;

      // Lamellar scale plate
      const grad = ctx.createLinearGradient(cx, cy - rh * 0.5, cx, cy + rh * 0.6);
      if (isRed) {
        grad.addColorStop(0, '#f2cf72');
        grad.addColorStop(0.55, '#c48d32');
        grad.addColorStop(1, '#7a4d16');
      } else {
        grad.addColorStop(0, '#6a727a');
        grad.addColorStop(0.55, '#3d4248');
        grad.addColorStop(1, '#1e2126');
      }

      ctx.fillStyle = grad;
      ctx.strokeStyle = isRed ? '#4a290b' : '#121417';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, cw * 0.48, 0, Math.PI, false);
      ctx.lineTo(cx - cw * 0.48, cy - rh * 0.35);
      ctx.lineTo(cx + cw * 0.48, cy - rh * 0.35);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Center rivet
      ctx.fillStyle = isRed ? '#ffe89c' : '#8a7660';
      ctx.beginPath();
      ctx.arc(cx, cy + rh * 0.08, 2.2, 0, Math.PI * 2);
      ctx.fill();

      // Bump height
      bCtx.fillStyle = '#dcdcdc';
      bCtx.strokeStyle = '#202020';
      bCtx.lineWidth = 3;
      bCtx.beginPath();
      bCtx.arc(cx, cy, cw * 0.46, 0, Math.PI, false);
      bCtx.lineTo(cx - cw * 0.46, cy - rh * 0.3);
      bCtx.lineTo(cx + cw * 0.46, cy - rh * 0.3);
      bCtx.closePath();
      bCtx.fill();
      bCtx.stroke();
    }
  }

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(2, 2);
  map.anisotropy = 8;

  const bumpMap = new THREE.CanvasTexture(b);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(2, 2);
  bumpMap.anisotropy = 4;

  return { map, bumpMap };
}

function makeCapeTexture(isRed) {
  const W = 512;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');

  // Rich silk/brocade gradient
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  if (isRed) {
    grad.addColorStop(0, '#961310');
    grad.addColorStop(0.6, '#b81a14');
    grad.addColorStop(1, '#780f0c');
  } else {
    grad.addColorStop(0, '#1e2024');
    grad.addColorStop(0.6, '#292c30');
    grad.addColorStop(1, '#141619');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Subtle vertical drapery shading
  for (let i = 0; i < 9; i++) {
    const x = (i + 0.5) * (W / 9);
    const g = ctx.createLinearGradient(x - 28, 0, x + 28, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.5, i % 2 ? 'rgba(0,0,0,0.22)' : 'rgba(255,220,170,0.08)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 28, 0, 56, H);
  }

  // Ornate gold-embroidered hem along bottom & side edges
  const gold = isRed ? '#e6bc5c' : '#9c8354';
  const goldDark = isRed ? '#8f6019' : '#57462b';
  ctx.strokeStyle = gold;
  ctx.lineWidth = 10;
  ctx.strokeRect(14, 6, W - 28, H - 22);
  ctx.strokeStyle = goldDark;
  ctx.lineWidth = 3;
  ctx.strokeRect(26, 14, W - 52, H - 38);

  // Cloud-scroll motif along the bottom border
  ctx.strokeStyle = gold;
  ctx.lineWidth = 4;
  for (let x = 36; x < W - 36; x += 40) {
    ctx.beginPath();
    ctx.arc(x, H - 34, 11, Math.PI, 0, false);
    ctx.arc(x + 18, H - 34, 7, 0, Math.PI, false);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeMedallionTexture(side) {
  const isRed = side === RED;
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');

  const g = ctx.createRadialGradient(size * 0.4, size * 0.35, 10, size / 2, size / 2, size * 0.5);
  if (isRed) {
    g.addColorStop(0, '#fae08c');
    g.addColorStop(0.7, '#d49d38');
    g.addColorStop(1, '#7a4f12');
  } else {
    g.addColorStop(0, '#5a5c62');
    g.addColorStop(0.7, '#2d3036');
    g.addColorStop(1, '#141518');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = isRed ? '#8a1712' : '#bfa065';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.43, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = isRed ? '#8c120d' : '#e6cf96';
  ctx.font = 'bold 148px "Kaiti TC", "KaiTi", "Songti TC", "PMingLiU", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(GLYPHS[side].K, size / 2, size / 2 + 8);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// ---------------------------------------------------------------------------
// Custom flowing cape geometry (draped down +Z back with natural folds)
// ---------------------------------------------------------------------------
function buildCapeGeometry() {
  const segX = 14;
  const segY = 14;
  const g = new THREE.PlaneGeometry(0.46, 0.90, segX, segY);
  const pos = g.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i); // -0.23 .. +0.23
    const py = pos.getY(i); // -0.45 (bottom) .. +0.45 (top)
    const t = (0.45 - py) / 0.90; // 0 at shoulders -> 1 at hem
    const nx = px / 0.23;         // -1 .. +1

    // Flare wider as it drapes down
    const widthScale = 0.62 + 0.68 * Math.pow(t, 0.85);
    const x = px * widthScale;

    // Curve gently outward toward +Z and add subtle billowing folds
    const wrap = -0.055 * (1 - t * 0.55) * (nx * nx);
    const sweep = 0.12 + 0.18 * Math.pow(t, 1.15);
    const fold = Math.sin(nx * Math.PI * 3.0) * 0.018 * t;
    const z = sweep + wrap + fold;
    const y = 1.04 - t * 0.88;

    pos.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return normGeom(g);
}

// ---------------------------------------------------------------------------
// Sculpted General geometry (grouped into 9 material slots)
// 0: pedestal wood   1: scale armor     2: gold/bronze trim & lion pauldrons
// 3: cape (brocade)  4: helmet steel    5: skin
// 6: beard & boots   7: 帥/將 medallion 8: crimson tassels & plume
// ---------------------------------------------------------------------------
function buildKingGeometry(side, radius = 0.4) {
  const buckets = Array.from({ length: 9 }, () => []);
  const add = (matIdx, raw, x, y, z, rx, ry, rz, sx, sy, sz) => {
    buckets[matIdx].push(placed(raw, x, y, z, rx, ry, rz, sx, sy, sz));
  };

  // --- 0. Beveled circular pedestal base (y = 0..0.12, r = 0.40) ---
  const baseProfile = [
    [0, 0], [radius * 0.875, 0], [radius * 0.975, 0.015], [radius, 0.045],
    [radius, 0.088], [radius * 0.925, 0.11], [radius * 0.85, 0.12], [0, 0.12]
  ].map(([r, y]) => new THREE.Vector2(r, y));
  add(0, new THREE.LatheGeometry(baseProfile, 36));
  // Gold/bronze trim ring around pedestal rim
  add(2, new THREE.TorusGeometry(0.365, 0.016, 10, 36), 0, 0.112, 0, Math.PI / 2, 0, 0);

  // --- 1. Boots & Greaves (y = 0.12..0.40) ---
  for (const sx of [-0.095, 0.095]) {
    // Lower leg / greave
    add(1, new THREE.CylinderGeometry(0.062, 0.055, 0.24, 14), sx, 0.28, 0.01);
    // Knee guard
    add(2, new THREE.SphereGeometry(0.056, 12, 10), sx, 0.40, -0.04, 0, 0, 0, 1.0, 1.1, 0.65);
    // Boot foot + upturned Chinese toe pointing -Z
    add(6, new THREE.BoxGeometry(0.095, 0.075, 0.17), sx, 0.155, -0.02);
    add(6, new THREE.SphereGeometry(0.052, 12, 10), sx, 0.16, -0.105, 0, 0, 0, 0.9, 0.72, 1.15);
    // Gold toe trim
    add(2, new THREE.TorusGeometry(0.048, 0.008, 8, 16), sx, 0.165, -0.02, Math.PI / 2, 0, 0);
  }

  // --- 2. Armored Skirt, Hip Tassets & Embroidered Front Apron (y = 0.34..0.74) ---
  // Main lamellar battle skirt
  add(1, new THREE.CylinderGeometry(0.175, 0.245, 0.38, 20), 0, 0.54, 0.01);
  // Bottom trim band of skirt
  add(2, new THREE.TorusGeometry(0.242, 0.016, 8, 24), 0, 0.355, 0.01, Math.PI / 2, 0, 0);
  // Front ceremonial apron hanging between tassets (-Z): crimson for Red, dark charcoal for Black
  add(side === RED ? 8 : 6, new THREE.BoxGeometry(0.14, 0.36, 0.04), 0, 0.52, -0.195, -0.16, 0, 0);
  add(2, new THREE.BoxGeometry(0.16, 0.022, 0.046), 0, 0.35, -0.222, -0.16, 0, 0);
  // Side hip tassets
  for (const sx of [-1, 1]) {
    add(1, new THREE.BoxGeometry(0.06, 0.28, 0.21), sx * 0.20, 0.58, 0.0, 0, 0, -sx * 0.18);
    add(2, new THREE.BoxGeometry(0.068, 0.024, 0.22), sx * 0.22, 0.445, 0.0, 0, 0, -sx * 0.18);
  }

  // --- 3. Heroic Torso, Breastplate, Waist Belt & Medallion (y = 0.70..1.10) ---
  const torsoProfile = [
    [0.165, 0.70], [0.175, 0.76], [0.205, 0.90], [0.225, 1.03], [0.16, 1.09], [0.09, 1.11]
  ].map(([r, y]) => new THREE.Vector2(r, y));
  add(1, new THREE.LatheGeometry(torsoProfile, 22), 0, 0, 0, 0, 0, 0, 1.08, 1.0, 0.84);

  // Ornate pectoral plate & shoulder straps
  add(2, new THREE.SphereGeometry(0.105, 16, 12), 0, 0.93, -0.145, 0, 0, 0, 1.15, 0.95, 0.42);
  add(2, new THREE.TorusGeometry(0.105, 0.016, 8, 20), 0, 0.93, -0.175, 0, 0, 0);
  // Collar guard (護頸)
  add(2, new THREE.CylinderGeometry(0.105, 0.135, 0.065, 18), 0, 1.09, 0.0);

  // Waist belt + central 帥/將 buckle medallion
  add(6, new THREE.CylinderGeometry(0.195, 0.195, 0.075, 22), 0, 0.755, 0.0, 0, 0, 0, 1.06, 1.0, 0.88);
  add(2, new THREE.TorusGeometry(0.062, 0.013, 8, 20), 0, 0.755, -0.178, 0, 0, 0);
  // Medallion disc facing -Z (rotateY(Math.PI) so CircleGeometry +Z normal points to -Z!)
  add(7, new THREE.CircleGeometry(0.056, 20), 0, 0.755, -0.186, 0, Math.PI, 0);

  // Twin crimson chest tassels (left & right of breastplate)
  for (const sx of [-0.115, 0.115]) {
    add(2, new THREE.SphereGeometry(0.022, 10, 8), sx, 1.01, -0.165);
    add(8, new THREE.ConeGeometry(0.024, 0.105, 10), sx, 0.94, -0.175);
  }

  // --- 4. Lion-Head Pauldrons (吞肩獸肩甲) & Armored Arms ---
  for (const sx of [-1, 1]) {
    // Layered shoulder armor dome
    add(2, new THREE.SphereGeometry(0.108, 16, 12), sx * 0.245, 1.02, 0.0, 0, 0, -sx * 0.25, 1.05, 0.92, 1.08);
    // Sculpted lion snout & brow protruding outward/forward
    add(2, new THREE.SphereGeometry(0.052, 12, 10), sx * 0.305, 1.025, -0.045, 0, 0, 0, 1.0, 0.85, 0.9);
    add(2, new THREE.BoxGeometry(0.055, 0.025, 0.06), sx * 0.31, 1.06, -0.045, 0, 0, -sx * 0.2);
    // Layered shoulder lames + crimson fringe beneath pauldron
    add(1, new THREE.CylinderGeometry(0.088, 0.108, 0.10, 14), sx * 0.265, 0.925, 0.0, 0, 0, -sx * 0.18);
    add(8, new THREE.CylinderGeometry(0.095, 0.112, 0.045, 14), sx * 0.275, 0.865, 0.0, 0, 0, -sx * 0.18);
  }

  // Right arm (+X): poised heroically at side
  add(8, new THREE.CylinderGeometry(0.064, 0.056, 0.16, 12), 0.285, 0.80, -0.01, 0.08, 0, 0.12);
  add(2, new THREE.CylinderGeometry(0.054, 0.046, 0.16, 12), 0.305, 0.66, -0.035, 0.22, 0, 0.06);
  add(5, new THREE.SphereGeometry(0.042, 10, 10), 0.312, 0.57, -0.055);

  // Left arm (-X): forearm bent slightly forward to grip the sword hilt!
  add(8, new THREE.CylinderGeometry(0.064, 0.056, 0.16, 12), -0.28, 0.80, -0.015, 0.18, 0, -0.14);
  add(2, new THREE.CylinderGeometry(0.054, 0.046, 0.16, 12), -0.275, 0.67, -0.075, 0.55, 0, -0.12);
  add(5, new THREE.SphereGeometry(0.042, 10, 10), -0.26, 0.61, -0.125);

  // --- 5. Chinese Jian/Dao Sword in Scabbard at Left Hip (-X) ---
  // Slanted diagonally: hilt forward-up (-Z, higher), scabbard tip backward-down (+Z, lower)
  const swordX = -0.255;
  const swordY = 0.60;
  const swordZ = 0.05;
  const swordPitch = 0.42; // tilts -Z end UP and +Z end DOWN
  // Scabbard body (red lacquer for Red, dark iron for Black -> use mat 8 / 4 via mat 3 or 8)
  add(side === RED ? 8 : 4, new THREE.BoxGeometry(0.036, 0.058, 0.54), swordX, swordY - 0.06, swordZ + 0.08, swordPitch, 0.06, 0);
  // Gold/bronze scabbard chape & middle band
  add(2, new THREE.BoxGeometry(0.044, 0.068, 0.08), swordX - 0.015, swordY - 0.165, swordZ + 0.31, swordPitch, 0.06, 0);
  add(2, new THREE.BoxGeometry(0.044, 0.068, 0.05), swordX, swordY - 0.06, swordZ + 0.08, swordPitch, 0.06, 0);
  // Ornate crossguard (護手)
  add(2, new THREE.BoxGeometry(0.068, 0.12, 0.032), swordX + 0.01, swordY + 0.05, swordZ - 0.16, swordPitch, 0.06, 0);
  // Wrapped grip & pommel
  add(6, new THREE.CylinderGeometry(0.022, 0.024, 0.17, 10), swordX + 0.015, swordY + 0.095, swordZ - 0.255, Math.PI / 2 + swordPitch, 0, -0.06);
  add(2, new THREE.SphereGeometry(0.032, 10, 8), swordX + 0.02, swordY + 0.13, swordZ - 0.335);
  // Hanging crimson sword tassel from pommel
  add(8, new THREE.ConeGeometry(0.022, 0.11, 10), swordX + 0.02, swordY + 0.055, swordZ - 0.345);

  // --- 6. Head, Stern Bearded Face & Ornate Helmet (y = 1.12..1.52) ---
  // Neck & head
  add(5, new THREE.CylinderGeometry(0.055, 0.065, 0.08, 12), 0, 1.12, -0.01);
  add(5, new THREE.SphereGeometry(0.095, 18, 14), 0, 1.21, -0.015, 0, 0, 0, 0.92, 1.08, 0.96);
  // Nose bridge & stern brow
  add(5, new THREE.ConeGeometry(0.016, 0.036, 6), 0, 1.205, -0.105, -Math.PI / 2, 0, 0);
  add(6, new THREE.BoxGeometry(0.075, 0.014, 0.016), 0, 1.235, -0.098);
  // Full Chinese general beard & mustache
  add(6, new THREE.ConeGeometry(0.062, 0.115, 12), 0, 1.125, -0.082, Math.PI, 0, 0, 1.05, 1.0, 0.65);
  add(6, new THREE.BoxGeometry(0.082, 0.022, 0.025), 0, 1.175, -0.098);

  // Helmet dome (slightly pointed Ming/Tang general helmet)
  add(4, new THREE.SphereGeometry(0.112, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.58), 0, 1.235, -0.005, 0, 0, 0, 0.98, 1.12, 1.04);
  // Gold/bronze helmet rim & brow peak
  add(2, new THREE.TorusGeometry(0.11, 0.014, 8, 24), 0, 1.245, -0.005, Math.PI / 2 + 0.08, 0, 0);
  // Cheek/ear guards (護耳) & back neck guard (頓項)
  for (const sx of [-1, 1]) {
    add(1, new THREE.BoxGeometry(0.032, 0.125, 0.095), sx * 0.102, 1.18, 0.01, 0, 0, sx * 0.14);
    add(2, new THREE.BoxGeometry(0.036, 0.018, 0.10), sx * 0.108, 1.12, 0.01, 0, 0, sx * 0.14);
  }
  add(1, new THREE.CylinderGeometry(0.115, 0.135, 0.11, 14, 1, false, -Math.PI * 0.45, Math.PI * 0.9), 0, 1.17, 0.015);

  // Forehead crest & 帥/將 medallion facing -Z
  add(2, new THREE.TorusGeometry(0.036, 0.009, 8, 18), 0, 1.285, -0.108, -0.18, 0, 0);
  add(7, new THREE.CircleGeometry(0.033, 18), 0, 1.285, -0.114, 0.18, Math.PI, 0);

  // Helmet top finial + sweeping backward plume (馬尾盔纓)
  add(2, new THREE.CylinderGeometry(0.018, 0.034, 0.055, 12), 0, 1.38, -0.005);
  const plumeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 1.40, -0.005),
    new THREE.Vector3(0, 1.50, 0.045),
    new THREE.Vector3(0, 1.45, 0.135),
    new THREE.Vector3(0, 1.31, 0.215)
  ]);
  const plumeMatIdx = side === RED ? 8 : 6;
  add(plumeMatIdx, new THREE.TubeGeometry(plumeCurve, 14, 0.036, 10, false));
  // Tapered plume tip
  add(plumeMatIdx, new THREE.ConeGeometry(0.036, 0.10, 10), 0, 1.275, 0.235, 2.55, 0, 0);

  // --- 7. Flowing Gold-Trimmed Cape (披風) on +Z Back ---
  buckets[3].push(buildCapeGeometry());
  // Cape shoulder clasps
  for (const sx of [-0.14, 0.14]) {
    add(2, new THREE.SphereGeometry(0.026, 10, 8), sx, 1.045, 0.075);
  }

  // Merge each material bucket, then merge all buckets with groups=true
  const mergedBuckets = buckets.map((list) => {
    const m = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    return m;
  });
  const finalGeo = mergeGeometries(mergedBuckets, true);
  for (const g of mergedBuckets) g.dispose();
  return finalGeo;
}

function getKingGeometry(side, radius = 0.4) {
  let geo = kingGeoCache.get(side);
  if (!geo) {
    geo = buildKingGeometry(side, radius);
    kingGeoCache.set(side, geo);
  }
  return geo;
}

function getKingMaterials(side) {
  let mats = kingMatCache.get(side);
  if (mats) return mats;

  const isRed = side === RED;
  const armorMaps = makeScaleArmorMaps(isRed);
  const capeMap = makeCapeTexture(isRed);
  const medallionMap = makeMedallionTexture(side);

  mats = [
    // 0: Pedestal wood
    new THREE.MeshPhysicalMaterial({
      color: isRed ? 0x7a1e16 : 0x221f1c,
      roughness: 0.48,
      metalness: 0.05,
      clearcoat: 0.3,
      clearcoatRoughness: 0.35,
      envMapIntensity: 0.45
    }),
    // 1: Scale armor
    new THREE.MeshStandardMaterial({
      map: armorMaps.map,
      bumpMap: armorMaps.bumpMap,
      bumpScale: 0.015,
      roughness: isRed ? 0.36 : 0.42,
      metalness: isRed ? 0.62 : 0.68,
      envMapIntensity: 0.65
    }),
    // 2: Gold / dark bronze trim & lion pauldrons
    new THREE.MeshStandardMaterial({
      color: isRed ? 0xe5b852 : 0x82705a,
      roughness: isRed ? 0.28 : 0.38,
      metalness: isRed ? 0.78 : 0.70,
      envMapIntensity: 0.75
    }),
    // 3: Flowing brocade cape
    new THREE.MeshStandardMaterial({
      map: capeMap,
      roughness: 0.76,
      metalness: 0.04,
      envMapIntensity: 0.3,
      side: THREE.DoubleSide
    }),
    // 4: Helmet & dark steel
    new THREE.MeshStandardMaterial({
      color: isRed ? 0x4c3c2e : 0x2c3036,
      roughness: 0.32,
      metalness: 0.75,
      envMapIntensity: 0.7
    }),
    // 5: Skin
    new THREE.MeshStandardMaterial({
      color: 0xc99672,
      roughness: 0.65,
      metalness: 0.0,
      envMapIntensity: 0.3
    }),
    // 6: Beard, leather belt & boots
    new THREE.MeshStandardMaterial({
      color: 0x201916,
      roughness: 0.78,
      metalness: 0.08,
      envMapIntensity: 0.3
    }),
    // 7: Engraved 帥 / 將 medallion
    new THREE.MeshStandardMaterial({
      map: medallionMap,
      roughness: 0.34,
      metalness: 0.45,
      envMapIntensity: 0.55
    }),
    // 8: Crimson tassels, apron & Red plume
    new THREE.MeshStandardMaterial({
      color: isRed ? 0xb81a14 : 0x6e1818,
      roughness: 0.72,
      metalness: 0.02,
      envMapIntensity: 0.32
    })
  ];

  kingMatCache.set(side, mats);
  return mats;
}

export function createKingMesh(side, radius = 0.4) {
  const mesh = new THREE.Mesh(getKingGeometry(side, radius), getKingMaterials(side));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.rotation.y = side === RED ? 0 : Math.PI;
  mesh.userData.piece = { side, type: 'K' };
  mesh.userData.homeYaw = mesh.rotation.y;
  return mesh;
}
