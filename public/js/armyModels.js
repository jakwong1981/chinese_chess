// Procedural 3D sculpted models for the remaining five Xiangqi piece types:
//   ADVISOR (仕/士) — Palace Bodyguard holding an upright ceremonial jian sword
//   HORSE   (傌/馬) — Armored Warhorse with chanfron, lamellar barding & flowing mane
//   ROOK    (俥/車) — Heavy Armored War Chariot with spoked wheels & battlemented deck
//   CANNON  (炮/砲) — Ornate Bronze/Iron Siege Cannon on wheeled timber carriage
//   PAWN    (兵/卒) — Vanguard Foot Soldier with conical helmet, round shield & halberd
//
// Matches the Tang/Ming crimson-gold (Red) and obsidian-bronze-crimson (Black) art
// direction of kingModel.js and elephantModel.js. Front faces −Z.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RED, GLYPHS, ADVISOR, HORSE, ROOK, CANNON, PAWN } from '../../shared/rules.js';

const geoCache = new Map();
const matCache = new Map();
const scaleTexCache = new Map();
const woodTexCache = new Map();

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
// Shared procedural textures
// ---------------------------------------------------------------------------
function getScaleArmorMaps(isRed) {
  const key = isRed ? 'r' : 'b';
  if (scaleTexCache.has(key)) return scaleTexCache.get(key);

  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = isRed ? '#691510' : '#1b1d21';
  ctx.fillRect(0, 0, size, size);

  const b = document.createElement('canvas');
  b.width = b.height = size;
  const bCtx = b.getContext('2d');
  bCtx.fillStyle = '#404040';
  bCtx.fillRect(0, 0, size, size);

  const cols = 10;
  const rows = 12;
  const cw = size / cols;
  const rh = size / rows;
  for (let r = -1; r <= rows; r++) {
    for (let col = -1; col <= cols; col++) {
      const cx = (col + (r % 2 ? 0.5 : 0)) * cw;
      const cy = r * rh;
      const grad = ctx.createLinearGradient(cx, cy - rh * 0.4, cx, cy + rh * 0.5);
      if (isRed) {
        grad.addColorStop(0, '#f2cf72');
        grad.addColorStop(0.6, '#c48d32');
        grad.addColorStop(1, '#7a4d16');
      } else {
        grad.addColorStop(0, '#6a727a');
        grad.addColorStop(0.6, '#3c4148');
        grad.addColorStop(1, '#1d2025');
      }
      ctx.fillStyle = grad;
      ctx.strokeStyle = isRed ? '#4a290b' : '#121417';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, cw * 0.47, 0, Math.PI, false);
      ctx.lineTo(cx - cw * 0.47, cy - rh * 0.32);
      ctx.lineTo(cx + cw * 0.47, cy - rh * 0.32);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      bCtx.fillStyle = '#dcdcdc';
      bCtx.beginPath();
      bCtx.arc(cx, cy, cw * 0.43, 0, Math.PI, false);
      bCtx.fill();
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

  const res = { map, bumpMap };
  scaleTexCache.set(key, res);
  return res;
}

function getTimberTexture(isRed) {
  const key = isRed ? 'r' : 'b';
  if (woodTexCache.has(key)) return woodTexCache.get(key);

  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, size, size);
  if (isRed) {
    g.addColorStop(0, '#8f3a20');
    g.addColorStop(1, '#541d10');
  } else {
    g.addColorStop(0, '#443a32');
    g.addColorStop(1, '#231e1a');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.globalAlpha = 0.2;
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = i % 2 ? '#1e0e08' : '#e8be86';
    ctx.lineWidth = 1.5;
    const y = (i / 40) * size;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y + (i % 3) - 1);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  woodTexCache.set(key, tex);
  return tex;
}

function makeEmblemTexture(side, type) {
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
  ctx.fillText(GLYPHS[side][type], size / 2, size / 2 + 8);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// ---------------------------------------------------------------------------
// Shared 8-slot PBR material palette per (side, type)
// 0: pedestal wood   1: scale armor     2: gold / bronze trim
// 3: cloth / timber  4: dark steel      5: skin / horse hide
// 6: dark leather    7: engraved glyph emblem
// ---------------------------------------------------------------------------
function getMaterials(side, type) {
  const key = side + type;
  if (matCache.has(key)) return matCache.get(key);

  const isRed = side === RED;
  const armorMaps = getScaleArmorMaps(isRed);
  const timberMap = getTimberTexture(isRed);
  const emblemMap = makeEmblemTexture(side, type);

  const isVehicle = type === ROOK || type === CANNON;
  const isHorse = type === HORSE;

  const mats = [
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
    // 2: Gold / bronze trim (or bronze cannon barrel for Red)
    new THREE.MeshStandardMaterial({
      color: isRed ? 0xe5b852 : 0x82705a,
      roughness: isRed ? 0.28 : 0.38,
      metalness: isRed ? 0.78 : 0.72,
      envMapIntensity: 0.75
    }),
    // 3: Crimson cloth / timber carriage
    isVehicle
      ? new THREE.MeshStandardMaterial({
          map: timberMap,
          roughness: 0.72,
          metalness: 0.04,
          envMapIntensity: 0.35
        })
      : new THREE.MeshStandardMaterial({
          color: isRed ? 0xb01914 : 0x272a30,
          roughness: 0.76,
          metalness: 0.03,
          envMapIntensity: 0.3
        }),
    // 4: Forged dark steel / iron
    new THREE.MeshStandardMaterial({
      color: isRed ? 0x524438 : 0x2a2e35,
      roughness: 0.30,
      metalness: 0.80,
      envMapIntensity: 0.72
    }),
    // 5: Skin (humans) or horse coat (chestnut bay for Red, obsidian-black for Black)
    new THREE.MeshStandardMaterial({
      color: isHorse ? (isRed ? 0x8a3e1e : 0x2a282a) : 0xc99672,
      roughness: isHorse ? 0.58 : 0.65,
      metalness: 0.02,
      envMapIntensity: 0.35
    }),
    // 6: Dark leather, boots, mane, crimson-black accents
    new THREE.MeshStandardMaterial({
      color: isRed ? 0x3b1812 : 0x181515,
      roughness: 0.78,
      metalness: 0.06,
      envMapIntensity: 0.3
    }),
    // 7: Engraved glyph emblem (仕/士, 傌/馬, 俥/車, 炮/砲, 兵/卒)
    new THREE.MeshStandardMaterial({
      map: emblemMap,
      roughness: 0.34,
      metalness: 0.45,
      envMapIntensity: 0.55
    })
  ];

  matCache.set(key, mats);
  return mats;
}

function addPedestal(add, radius = 0.4, h = 0.11) {
  const baseProfile = [
    [0, 0], [radius * 0.875, 0], [radius * 0.975, 0.014], [radius, 0.042],
    [radius, h * 0.75], [radius * 0.925, h * 0.93], [radius * 0.85, h], [0, h]
  ].map(([r, y]) => new THREE.Vector2(r, y));
  add(0, new THREE.LatheGeometry(baseProfile, 36));
  add(2, new THREE.TorusGeometry(radius * 0.91, 0.015, 10, 36), 0, h - 0.007, 0, Math.PI / 2, 0, 0);
}

function addWheel(add, x, y, z, r, rimW = 0.045, spokes = 8) {
  // Iron tire + wooden rim
  add(4, new THREE.TorusGeometry(r, rimW * 0.46, 10, 24), x, y, z, 0, Math.PI / 2, 0);
  add(3, new THREE.TorusGeometry(r * 0.88, rimW * 0.34, 8, 20), x, y, z, 0, Math.PI / 2, 0);
  // Hub
  add(2, new THREE.CylinderGeometry(r * 0.22, r * 0.22, rimW * 1.4, 12), x, y, z, 0, 0, Math.PI / 2);
  // Spokes
  for (let i = 0; i < spokes; i++) {
    const ang = (i / spokes) * Math.PI;
    add(3, new THREE.CylinderGeometry(0.012, 0.012, r * 1.72, 6), x, y, z, ang, 0, 0);
  }
}

function finalizeBuckets(buckets) {
  // Ensure every bucket has at least a tiny hidden placeholder only if unused
  const merged = [];
  for (let i = 0; i < buckets.length; i++) {
    const list = buckets[i];
    if (!list.length) {
      merged.push(placed(new THREE.BoxGeometry(0.001, 0.001, 0.001), 0, 0.02, 0));
    } else {
      const m = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      merged.push(m);
    }
  }
  const finalGeo = mergeGeometries(merged, true);
  for (const g of merged) g.dispose();
  return finalGeo;
}

// ===========================================================================
// 1. ADVISOR (仕 / 士) — Imperial Palace Guard with upright ceremonial sword
// ===========================================================================
function buildAdvisorGeometry(radius) {
  const buckets = Array.from({ length: 8 }, () => []);
  const add = (m, raw, x, y, z, rx, ry, rz, sx, sy, sz) =>
    buckets[m].push(placed(raw, x, y, z, rx, ry, rz, sx, sy, sz));

  addPedestal(add, radius, 0.11);

  // Boots
  for (const sx of [-0.075, 0.075]) {
    add(6, new THREE.BoxGeometry(0.08, 0.07, 0.15), sx, 0.145, -0.015);
  }
  // Flowing layered court-guard robe + armored breastplate
  add(3, new THREE.CylinderGeometry(0.145, 0.225, 0.54, 20), 0, 0.42, 0);
  add(2, new THREE.TorusGeometry(0.222, 0.014, 8, 22), 0, 0.155, 0, Math.PI / 2, 0, 0);
  // Lamellar cuirass over upper torso
  add(1, new THREE.CylinderGeometry(0.16, 0.145, 0.30, 18), 0, 0.81, 0, 0, 0, 0, 1.08, 1.0, 0.84);
  // Ornate belt
  add(6, new THREE.CylinderGeometry(0.16, 0.16, 0.06, 18), 0, 0.66, 0, 0, 0, 0, 1.08, 1.0, 0.86);
  add(2, new THREE.BoxGeometry(0.085, 0.068, 0.03), 0, 0.66, -0.142);

  // Chest medallion engraved with 仕 / 士 (tilted slightly up for readability)
  add(2, new THREE.TorusGeometry(0.062, 0.011, 8, 20), 0, 0.84, -0.142, -0.2, 0, 0);
  add(7, new THREE.CircleGeometry(0.058, 20), 0, 0.84, -0.148, 0.2, Math.PI, 0);

  // Layered guard shoulder guards & wide sleeved arms clasped in front holding sword
  for (const sx of [-1, 1]) {
    add(1, new THREE.SphereGeometry(0.085, 14, 10), sx * 0.195, 0.91, 0, 0, 0, -sx * 0.25, 1.0, 0.85, 1.0);
    add(3, new THREE.CylinderGeometry(0.055, 0.062, 0.22, 12), sx * 0.19, 0.77, -0.05, 0.45, 0, -sx * 0.28);
    add(5, new THREE.SphereGeometry(0.036, 10, 8), sx * 0.05, 0.68, -0.165);
  }

  // Upright Ceremonial Jian Sword held squarely in front (-Z)
  add(4, new THREE.BoxGeometry(0.022, 0.56, 0.045), 0, 0.42, -0.20); // blade / scabbard resting on pedestal
  add(2, new THREE.BoxGeometry(0.11, 0.028, 0.048), 0, 0.70, -0.20); // ornate crossguard
  add(6, new THREE.CylinderGeometry(0.018, 0.018, 0.14, 10), 0, 0.78, -0.20); // grip
  add(2, new THREE.SphereGeometry(0.028, 10, 8), 0, 0.86, -0.20); // pommel

  // Head & dignified winged court-guard cap (展腳幞頭 / 武弁)
  add(5, new THREE.CylinderGeometry(0.048, 0.055, 0.07, 12), 0, 0.99, -0.005);
  add(5, new THREE.SphereGeometry(0.086, 16, 12), 0, 1.07, -0.01, 0, 0, 0, 0.92, 1.06, 0.96);
  // Goatee beard
  add(6, new THREE.ConeGeometry(0.034, 0.08, 10), 0, 1.00, -0.078, Math.PI, 0, 0);
  // Tall black/lacquered court cap with gold front crest & twin side wings
  add(4, new THREE.CylinderGeometry(0.078, 0.095, 0.11, 16), 0, 1.15, -0.005);
  add(4, new THREE.BoxGeometry(0.09, 0.085, 0.09), 0, 1.22, 0.015);
  add(2, new THREE.TorusGeometry(0.094, 0.012, 8, 20), 0, 1.11, -0.005, Math.PI / 2, 0, 0);
  // Winged court-cap fins (distinctive Advisor silhouette!)
  for (const sx of [-1, 1]) {
    add(4, new THREE.BoxGeometry(0.15, 0.026, 0.022), sx * 0.155, 1.175, 0.02, 0, 0, sx * 0.12);
    add(2, new THREE.BoxGeometry(0.155, 0.008, 0.026), sx * 0.155, 1.19, 0.02, 0, 0, sx * 0.12);
  }

  return finalizeBuckets(buckets);
}

// ===========================================================================
// 2. HORSE (傌 / 馬) — Armored Chinese Warhorse with lamellar barding & chanfron
// ===========================================================================
function buildHorseGeometry(radius) {
  const buckets = Array.from({ length: 8 }, () => []);
  const add = (m, raw, x, y, z, rx, ry, rz, sx, sy, sz) =>
    buckets[m].push(placed(raw, x, y, z, rx, ry, rz, sx, sy, sz));

  addPedestal(add, radius, 0.11);

  // Dynamic striding legs (front-left slightly raised, rear planted!)
  // Rear legs
  for (const sx of [-0.105, 0.105]) {
    add(5, new THREE.CylinderGeometry(0.048, 0.036, 0.24, 12), sx, 0.42, 0.18, -0.18, 0, 0);
    add(5, new THREE.CylinderGeometry(0.034, 0.030, 0.24, 12), sx, 0.23, 0.20, 0.12, 0, 0);
    add(6, new THREE.CylinderGeometry(0.034, 0.040, 0.045, 10), sx, 0.13, 0.185);
  }
  // Front-right planted leg
  add(5, new THREE.CylinderGeometry(0.044, 0.034, 0.23, 12), 0.105, 0.42, -0.14, 0.08, 0, 0);
  add(5, new THREE.CylinderGeometry(0.032, 0.028, 0.24, 12), 0.105, 0.23, -0.155, -0.05, 0, 0);
  add(6, new THREE.CylinderGeometry(0.034, 0.038, 0.045, 10), 0.105, 0.13, -0.15);
  // Front-left lifted heroic stride!
  add(5, new THREE.CylinderGeometry(0.044, 0.034, 0.21, 12), -0.105, 0.46, -0.19, 0.55, 0, 0);
  add(5, new THREE.CylinderGeometry(0.032, 0.028, 0.20, 12), -0.105, 0.34, -0.255, -0.45, 0, 0);
  add(6, new THREE.CylinderGeometry(0.032, 0.036, 0.045, 10), -0.105, 0.26, -0.22);

  // Muscular barrel body
  add(5, new THREE.SphereGeometry(0.17, 18, 14), 0, 0.56, 0.02, 0, 0, 0, 0.92, 0.95, 1.55);

  // Lamellar barding draped over flanks + crimson/dark saddlecloth + sculpted war saddle
  for (const sx of [-1, 1]) {
    add(1, new THREE.BoxGeometry(0.038, 0.24, 0.44), sx * 0.155, 0.51, 0.03, 0, 0, -sx * 0.1);
    add(2, new THREE.BoxGeometry(0.044, 0.02, 0.46), sx * 0.168, 0.39, 0.03, 0, 0, -sx * 0.1);
    add(3, new THREE.BoxGeometry(0.044, 0.18, 0.22), sx * 0.168, 0.57, 0.02, 0, 0, -sx * 0.08);
  }
  // Armored chest peytral + 傌 / 馬 medallion facing -Z
  add(1, new THREE.SphereGeometry(0.155, 16, 12), 0, 0.57, -0.18, 0, 0, 0, 1.0, 0.95, 0.65);
  add(2, new THREE.TorusGeometry(0.064, 0.011, 8, 20), 0, 0.57, -0.285, -0.15, 0, 0);
  add(7, new THREE.CircleGeometry(0.060, 20), 0, 0.57, -0.292, 0.15, Math.PI, 0);

  // War saddle (馬鞍)
  add(3, new THREE.BoxGeometry(0.20, 0.055, 0.22), 0, 0.72, 0.02);
  add(2, new THREE.BoxGeometry(0.21, 0.085, 0.036), 0, 0.765, -0.085, -0.25, 0, 0);
  add(2, new THREE.BoxGeometry(0.21, 0.095, 0.036), 0, 0.775, 0.125, 0.28, 0, 0);

  // Arched Neck, Sculpted Head, Chanfron Armor (馬面甲), Ears & Flowing Mane
  add(5, new THREE.CylinderGeometry(0.085, 0.125, 0.34, 14), 0, 0.79, -0.19, 0.42, 0, 0, 0.85, 1.0, 1.05);
  // Crinet neck armor plates along upper crest
  add(1, new THREE.CylinderGeometry(0.092, 0.128, 0.26, 12, 1, false, -Math.PI * 0.4, Math.PI * 0.8), 0, 0.80, -0.18, 0.42, 0, 0);
  // Flowing mane ridge
  add(6, new THREE.BoxGeometry(0.042, 0.28, 0.085), 0, 0.84, -0.11, 0.42, 0, 0);

  // Horse head & muzzle pointing forward-down (-Z)
  add(5, new THREE.BoxGeometry(0.115, 0.135, 0.25), 0, 0.94, -0.29, 0.48, 0, 0);
  add(5, new THREE.CylinderGeometry(0.042, 0.056, 0.11, 10), 0, 0.86, -0.40, 1.98, 0, 0);
  // Gold/bronze chanfron face armor plate
  add(2, new THREE.BoxGeometry(0.085, 0.026, 0.22), 0, 0.99, -0.32, 0.48, 0, 0);
  // Alert pointed ears
  for (const sx of [-0.048, 0.048]) {
    add(5, new THREE.ConeGeometry(0.022, 0.085, 8), sx, 1.06, -0.22, -0.18, 0, -sx * 2.0);
  }
  // Flowing tail (+Z)
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.62, 0.27),
    new THREE.Vector3(0, 0.56, 0.35),
    new THREE.Vector3(0, 0.38, 0.38),
    new THREE.Vector3(0, 0.24, 0.36)
  ]);
  add(6, new THREE.TubeGeometry(tailCurve, 12, 0.034, 8, false));

  return finalizeBuckets(buckets);
}

// ===========================================================================
// 3. ROOK (俥 / 車) — Heavy Armored Chinese War Chariot with spoked wheels
// ===========================================================================
function buildRookGeometry(radius) {
  const buckets = Array.from({ length: 8 }, () => []);
  const add = (m, raw, x, y, z, rx, ry, rz, sx, sy, sz) =>
    buckets[m].push(placed(raw, x, y, z, rx, ry, rz, sx, sy, sz));

  addPedestal(add, radius, 0.11);

  // Axle & large spoked chariot wheels on ±X
  const wheelY = 0.31;
  const wheelR = 0.21;
  add(4, new THREE.CylinderGeometry(0.025, 0.025, 0.64, 10), 0, wheelY, 0.04, 0, 0, Math.PI / 2);
  addWheel(add, -0.285, wheelY, 0.04, wheelR, 0.046, 8);
  addWheel(add,  0.285, wheelY, 0.04, wheelR, 0.046, 8);
  // Bronze wheel-hub scythed caps (車軎)
  for (const sx of [-1, 1]) {
    add(2, new THREE.ConeGeometry(0.036, 0.075, 10), sx * 0.335, wheelY, 0.04, 0, 0, -sx * Math.PI / 2);
  }

  // Heavy timber chassis + twin front chariot shafts (雙轅) pointing -Z
  add(3, new THREE.BoxGeometry(0.46, 0.08, 0.44), 0, 0.36, 0.03);
  for (const sx of [-0.17, 0.17]) {
    add(3, new THREE.BoxGeometry(0.045, 0.048, 0.36), sx, 0.34, -0.25);
    add(2, new THREE.SphereGeometry(0.032, 10, 8), sx, 0.34, -0.43);
  }
  // Front crossbar yoke
  add(3, new THREE.BoxGeometry(0.44, 0.038, 0.042), 0, 0.34, -0.38);

  // Armored battlemented chariot turret / war-box (戰車車輿)
  add(1, new THREE.BoxGeometry(0.44, 0.36, 0.40), 0, 0.56, 0.04);
  // Gold/bronze corner armor pillars & upper rail
  for (const sx of [-0.215, 0.215]) {
    for (const sz of [-0.155, 0.235]) {
      add(2, new THREE.BoxGeometry(0.042, 0.42, 0.042), sx, 0.58, sz);
    }
  }
  // Crenellated top battlements (女牆)
  for (const sx of [-0.16, 0, 0.16]) {
    add(4, new THREE.BoxGeometry(0.09, 0.085, 0.045), sx, 0.78, -0.155);
    add(4, new THREE.BoxGeometry(0.09, 0.085, 0.045), sx, 0.78,  0.235);
  }
  for (const sz of [-0.04, 0.12]) {
    add(4, new THREE.BoxGeometry(0.045, 0.085, 0.09), -0.215, 0.78, sz);
    add(4, new THREE.BoxGeometry(0.045, 0.085, 0.09),  0.215, 0.78, sz);
  }

  // Prominent Front Shield Emblem engraved with 俥 / 車 (facing -Z, slightly tilted up)
  add(2, new THREE.TorusGeometry(0.115, 0.016, 8, 24), 0, 0.56, -0.17, -0.18, 0, 0);
  add(7, new THREE.CircleGeometry(0.108, 24), 0, 0.56, -0.178, 0.18, Math.PI, 0);

  // Rear war standard pole + ornate banner finial
  add(2, new THREE.CylinderGeometry(0.016, 0.020, 0.55, 10), 0, 0.76, 0.21);
  add(2, new THREE.ConeGeometry(0.032, 0.09, 8), 0, 1.06, 0.21);
  add(6, new THREE.BoxGeometry(0.24, 0.14, 0.018), 0, 0.92, 0.22);

  return finalizeBuckets(buckets);
}

// ===========================================================================
// 4. CANNON (炮 / 砲) — Ornate Imperial Siege Cannon on wheeled timber carriage
// ===========================================================================
function buildCannonGeometry(side, radius) {
  const buckets = Array.from({ length: 8 }, () => []);
  const add = (m, raw, x, y, z, rx, ry, rz, sx, sy, sz) =>
    buckets[m].push(placed(raw, x, y, z, rx, ry, rz, sx, sy, sz));

  addPedestal(add, radius, 0.11);

  // Heavy wooden siege carriage cheeks (炮架)
  for (const sx of [-0.14, 0.14]) {
    add(3, new THREE.BoxGeometry(0.06, 0.20, 0.48), sx, 0.28, 0.03, -0.12, 0, 0);
    add(2, new THREE.BoxGeometry(0.068, 0.03, 0.50), sx, 0.37, 0.03, -0.12, 0, 0);
  }
  add(3, new THREE.BoxGeometry(0.30, 0.07, 0.42), 0, 0.21, 0.04);

  // 4 iron-rimmed siege wheels (front larger, rear smaller)
  addWheel(add, -0.225, 0.26, -0.11, 0.155, 0.042, 6);
  addWheel(add,  0.225, 0.26, -0.11, 0.155, 0.042, 6);
  addWheel(add, -0.225, 0.22,  0.19, 0.115, 0.038, 6);
  addWheel(add,  0.225, 0.22,  0.19, 0.115, 0.038, 6);

  // Massive Imperial Cannon Barrel aimed forward-up (-Z)
  const barrelMat = side === RED ? 2 : 4; // Imperial bronze for Red, forged iron for Black
  const ringMat = side === RED ? 4 : 2;
  const barrelPitch = Math.PI / 2 - 0.26; // tilts muzzle UP toward -Z
  // Tapered main barrel
  add(barrelMat, new THREE.CylinderGeometry(0.095, 0.135, 0.66, 22), 0, 0.51, -0.05, barrelPitch, 0, 0);
  // Flared dragon-mouth muzzle lip + dark bore recess
  add(barrelMat, new THREE.CylinderGeometry(0.125, 0.10, 0.075, 22), 0, 0.60, -0.37, barrelPitch, 0, 0);
  add(6, new THREE.CylinderGeometry(0.072, 0.072, 0.03, 18), 0, 0.61, -0.405, barrelPitch, 0, 0);
  // Cascabel breech knob at rear (+Z)
  add(barrelMat, new THREE.SphereGeometry(0.125, 16, 12), 0, 0.42, 0.26);
  add(ringMat, new THREE.SphereGeometry(0.055, 12, 10), 0, 0.39, 0.37);
  // Decorative reinforcing barrel rings (箍環)
  for (const [ry, rz, rr] of [[0.56, -0.24, 0.106], [0.51, -0.05, 0.118], [0.46, 0.13, 0.132]]) {
    add(ringMat, new THREE.TorusGeometry(rr, 0.018, 10, 22), 0, ry, rz, -0.26, 0, 0);
  }
  // Trunnions locking barrel into carriage
  add(ringMat, new THREE.CylinderGeometry(0.038, 0.038, 0.36, 12), 0, 0.47, -0.02, 0, 0, Math.PI / 2);

  // Stacked iron cannonballs at rear of pedestal
  for (const [bx, bz] of [[-0.07, 0.27], [0.07, 0.27], [0, 0.22]]) {
    add(4, new THREE.SphereGeometry(0.048, 12, 10), bx, 0.155, bz);
  }
  add(4, new THREE.SphereGeometry(0.048, 12, 10), 0, 0.225, 0.255);

  // Front Carriage Shield engraved with 炮 / 砲 (clearly visible from front & 32° camera)
  add(2, new THREE.TorusGeometry(0.092, 0.014, 8, 22), 0, 0.31, -0.24, -0.28, 0, 0);
  add(7, new THREE.CircleGeometry(0.086, 22), 0, 0.31, -0.248, 0.28, Math.PI, 0);

  return finalizeBuckets(buckets);
}

// ===========================================================================
// 5. PAWN (兵 / 卒) — Armored Vanguard Foot Soldier with round shield & halberd
// ===========================================================================
function buildPawnGeometry(radius) {
  const buckets = Array.from({ length: 8 }, () => []);
  const add = (m, raw, x, y, z, rx, ry, rz, sx, sy, sz) =>
    buckets[m].push(placed(raw, x, y, z, rx, ry, rz, sx, sy, sz));

  addPedestal(add, radius * 0.92, 0.10);

  // Sturdy boots & armored tunic
  for (const sx of [-0.068, 0.068]) {
    add(6, new THREE.BoxGeometry(0.072, 0.065, 0.13), sx, 0.132, -0.01);
    add(3, new THREE.CylinderGeometry(0.046, 0.042, 0.18, 10), sx, 0.24, 0);
  }
  // Battle tunic skirt & lamellar chestplate
  add(3, new THREE.CylinderGeometry(0.125, 0.175, 0.24, 16), 0, 0.39, 0);
  add(1, new THREE.CylinderGeometry(0.145, 0.13, 0.24, 16), 0, 0.60, 0, 0, 0, 0, 1.06, 1.0, 0.84);
  add(6, new THREE.CylinderGeometry(0.14, 0.14, 0.05, 16), 0, 0.49, 0, 0, 0, 0, 1.06, 1.0, 0.86);

  // Compact shoulder guards & arms
  for (const sx of [-1, 1]) {
    add(1, new THREE.SphereGeometry(0.068, 12, 10), sx * 0.17, 0.68, 0);
  }
  // Right arm (+X) holding vertical halberd/spear
  add(3, new THREE.CylinderGeometry(0.044, 0.038, 0.20, 10), 0.195, 0.56, -0.04, 0.35, 0, 0.12);
  add(5, new THREE.SphereGeometry(0.034, 8, 8), 0.21, 0.49, -0.10);

  // Left arm (-X) holding round vanguard shield in front!
  add(3, new THREE.CylinderGeometry(0.044, 0.038, 0.18, 10), -0.17, 0.56, -0.07, 0.48, 0, -0.25);

  // Round Vanguard Shield angled slightly forward-up (-Z) with 兵 / 卒 emblem!
  add(4, new THREE.CylinderGeometry(0.14, 0.14, 0.028, 22), -0.09, 0.49, -0.175, Math.PI / 2 - 0.25, 0, -0.22);
  add(2, new THREE.TorusGeometry(0.14, 0.015, 8, 22), -0.09, 0.49, -0.188, -0.25, -0.22, 0);
  add(7, new THREE.CircleGeometry(0.13, 22), -0.09, 0.49, -0.195, 0.25, Math.PI + 0.22, 0);

  // Upright Chinese Halberd / Spear (戟) on right side (+X)
  add(6, new THREE.CylinderGeometry(0.016, 0.018, 0.86, 8), 0.22, 0.55, -0.10);
  add(4, new THREE.ConeGeometry(0.032, 0.18, 6), 0.22, 1.04, -0.10); // spearhead
  add(4, new THREE.BoxGeometry(0.09, 0.045, 0.014), 0.26, 0.94, -0.10, 0, 0, -0.35); // crescent halberd side blade
  add(3, new THREE.ConeGeometry(0.028, 0.08, 8), 0.22, 0.91, -0.10, Math.PI, 0, 0); // red/dark spear tassel

  // Head & conical rimmed infantry helmet (笠盔)
  add(5, new THREE.SphereGeometry(0.076, 14, 12), 0, 0.79, -0.01, 0, 0, 0, 0.94, 1.05, 0.96);
  add(4, new THREE.ConeGeometry(0.135, 0.125, 18), 0, 0.89, -0.005);
  add(2, new THREE.TorusGeometry(0.132, 0.012, 8, 20), 0, 0.83, -0.005, Math.PI / 2, 0, 0);
  add(2, new THREE.SphereGeometry(0.022, 8, 8), 0, 0.96, -0.005);

  return finalizeBuckets(buckets);
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------
function getPieceGeometry(side, type, radius) {
  const key = (type === CANNON ? side : '') + type;
  let geo = geoCache.get(key);
  if (geo) return geo;
  switch (type) {
    case ADVISOR: geo = buildAdvisorGeometry(radius); break;
    case HORSE:   geo = buildHorseGeometry(radius); break;
    case ROOK:    geo = buildRookGeometry(radius); break;
    case CANNON:  geo = buildCannonGeometry(side, radius); break;
    case PAWN:    geo = buildPawnGeometry(radius); break;
    default: return null;
  }
  geoCache.set(key, geo);
  return geo;
}

export function createArmyPieceMesh(side, type, radius = 0.4) {
  const geo = getPieceGeometry(side, type, radius);
  if (!geo) return null;
  const mesh = new THREE.Mesh(geo, getMaterials(side, type));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.rotation.y = side === RED ? 0 : Math.PI;
  mesh.userData.piece = { side, type };
  mesh.userData.homeYaw = mesh.rotation.y;
  return mesh;
}
