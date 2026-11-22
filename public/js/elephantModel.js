// Procedural 3D sculpted Imperial War Elephant (相 / 象) miniature based on the
// Red & Black 3-view turnaround sheet: wrinkled elephant hide, lamellar scale barding,
// cloud-embroidered imperial saddle, gilded forehead armor crest with engraved 相/象,
// flared ears with crimson tassels, curved trunk, ivory tusks, and armored leg greaves.
//
// Local orientation: front faces −Z (Red rotation.y = 0 faces Black; Black rotation.y = π faces Red).
// Single merged multi-material THREE.Mesh for 1-draw-call rendering and full compatibility
// with piece picking, hover lift, hop animation, and capture FX.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RED, GLYPHS } from '../../shared/rules.js';

const elephantGeoCache = new Map();
const elephantMatCache = new Map();

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
// Procedural PBR textures (elephant hide, scale barding, cloud saddle, 相/象 crest)
// ---------------------------------------------------------------------------
function makeHideMaps(isRed) {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');

  ctx.fillStyle = isRed ? '#7e7060' : '#4a4642';
  ctx.fillRect(0, 0, size, size);

  const b = document.createElement('canvas');
  b.width = b.height = size;
  const bCtx = b.getContext('2d');
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);

  // Subtle organic wrinkles & skin grain
  for (let i = 0; i < 65; i++) {
    const y = (i / 65) * size;
    ctx.strokeStyle = i % 2 ? 'rgba(30, 24, 18, 0.20)' : 'rgba(215, 200, 180, 0.12)';
    ctx.lineWidth = 1 + (i % 2);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(size * 0.3, y + Math.sin(i * 1.9) * 5, size * 0.7, y - Math.cos(i * 1.3) * 5, size, y);
    ctx.stroke();

    bCtx.strokeStyle = i % 2 ? '#4a4a4a' : '#a8a8a8';
    bCtx.lineWidth = 1.5;
    bCtx.beginPath();
    bCtx.moveTo(0, y);
    bCtx.bezierCurveTo(size * 0.3, y + Math.sin(i * 1.9) * 5, size * 0.7, y - Math.cos(i * 1.3) * 5, size, y);
    bCtx.stroke();
  }

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(2, 2);

  const bumpMap = new THREE.CanvasTexture(b);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(2, 2);

  return { map, bumpMap };
}

function makeBardingMaps(isRed) {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');

  ctx.fillStyle = isRed ? '#751712' : '#1b1d21';
  ctx.fillRect(0, 0, size, size);

  const b = document.createElement('canvas');
  b.width = b.height = size;
  const bCtx = b.getContext('2d');
  bCtx.fillStyle = '#383838';
  bCtx.fillRect(0, 0, size, size);

  const cols = 16;
  const rows = 18;
  const cw = size / cols;
  const rh = size / rows;

  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const x = col * cw + 2;
      const y = r * rh + 2;
      const w = cw - 4;
      const h = rh - 3;

      const grad = ctx.createLinearGradient(x, y, x, y + h);
      if (isRed) {
        grad.addColorStop(0, '#f2cf70');
        grad.addColorStop(0.55, '#c69034');
        grad.addColorStop(1, '#7c4e15');
      } else {
        grad.addColorStop(0, '#6a727a');
        grad.addColorStop(0.55, '#3b4046');
        grad.addColorStop(1, '#1c1f24');
      }
      ctx.fillStyle = grad;
      ctx.strokeStyle = isRed ? '#4d2b0b' : '#111316';
      ctx.lineWidth = 2;
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);

      // Lamellar lacing rivet
      ctx.fillStyle = isRed ? '#ffe9a3' : '#8a7660';
      ctx.fillRect(x + w * 0.42, y + h * 0.35, w * 0.16, h * 0.25);

      bCtx.fillStyle = '#dcdcdc';
      bCtx.fillRect(x + 1, y + 1, w - 2, h - 2);
    }
  }

  // Crimson/gold trim border around barding
  ctx.strokeStyle = isRed ? '#a81812' : '#7a6648';
  ctx.lineWidth = 14;
  ctx.strokeRect(8, 8, size - 16, size - 16);

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;

  const bumpMap = new THREE.CanvasTexture(b);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.anisotropy = 4;

  return { map, bumpMap };
}

function makeSaddleClothTexture(isRed) {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');

  const g = ctx.createLinearGradient(0, 0, size, size);
  if (isRed) {
    g.addColorStop(0, '#e8be5a');
    g.addColorStop(0.5, '#c89235');
    g.addColorStop(1, '#9c681c');
  } else {
    g.addColorStop(0, '#303338');
    g.addColorStop(0.5, '#202226');
    g.addColorStop(1, '#14161a');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  // Cloud-scroll brocade motif
  ctx.strokeStyle = isRed ? '#fff0b8' : '#7d6b4e';
  ctx.lineWidth = 5;
  for (let row = 1; row <= 4; row++) {
    for (let col = 1; col <= 4; col++) {
      const cx = col * 102;
      const cy = row * 102;
      ctx.beginPath();
      ctx.arc(cx - 18, cy, 16, Math.PI * 0.9, Math.PI * 2.1);
      ctx.arc(cx, cy - 8, 20, Math.PI, Math.PI * 2);
      ctx.arc(cx + 18, cy, 16, Math.PI * 0.9, Math.PI * 2.1);
      ctx.stroke();
    }
  }

  // Ornate border
  ctx.strokeStyle = isRed ? '#961510' : '#9c8354';
  ctx.lineWidth = 18;
  ctx.strokeRect(14, 14, size - 28, size - 28);
  ctx.strokeStyle = isRed ? '#f7dc84' : '#4a4337';
  ctx.lineWidth = 5;
  ctx.strokeRect(30, 30, size - 60, size - 60);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeCrestTexture(side) {
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
    g.addColorStop(0, '#62564a');
    g.addColorStop(0.7, '#342e29');
    g.addColorStop(1, '#181513');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = isRed ? '#8a1712' : '#bda066';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.43, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = isRed ? '#8c120d' : '#e6cf96';
  ctx.font = 'bold 148px "Kaiti TC", "KaiTi", "Songti TC", "PMingLiU", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(GLYPHS[side].E, size / 2, size / 2 + 8);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// ---------------------------------------------------------------------------
// Sculpted War Elephant geometry (grouped into 8 material slots)
// 0: pedestal wood   1: elephant hide     2: lamellar scale barding
// 3: gold/bronze     4: cloud saddlecloth 5: ivory tusks
// 6: 相/象 forehead  7: crimson tassels & harness
// ---------------------------------------------------------------------------
function buildElephantGeometry(side, radius = 0.4) {
  const buckets = Array.from({ length: 8 }, () => []);
  const add = (matIdx, raw, x, y, z, rx, ry, rz, sx, sy, sz) => {
    buckets[matIdx].push(placed(raw, x, y, z, rx, ry, rz, sx, sy, sz));
  };

  // --- 0. Beveled circular pedestal base (y = 0..0.11, r = 0.40) ---
  const baseProfile = [
    [0, 0], [radius * 0.875, 0], [radius * 0.975, 0.014], [radius, 0.042],
    [radius, 0.082], [radius * 0.925, 0.102], [radius * 0.85, 0.11], [0, 0.11]
  ].map(([r, y]) => new THREE.Vector2(r, y));
  add(0, new THREE.LatheGeometry(baseProfile, 36));
  add(3, new THREE.TorusGeometry(radius * 0.91, 0.015, 10, 36), 0, 0.103, 0, Math.PI / 2, 0, 0);

  // --- 1. Four Sturdy Elephant Legs & Armored Greaves (y = 0.11..0.46) ---
  const legs = [
    [-0.13, -0.14], [0.13, -0.14],
    [-0.13,  0.16], [0.13,  0.16]
  ];
  for (const [lx, lz] of legs) {
    // Columnar leg
    add(1, new THREE.CylinderGeometry(0.072, 0.068, 0.34, 14), lx, 0.29, lz);
    // Foot pad
    add(1, new THREE.CylinderGeometry(0.070, 0.078, 0.055, 14), lx, 0.135, lz - 0.008);
    // Ornate shin greave (護脛) wrapping front/outer leg
    add(3, new THREE.CylinderGeometry(0.079, 0.075, 0.17, 14, 1, false, -Math.PI * 0.65, Math.PI * 1.3), lx, 0.255, lz, 0, Math.PI, 0);
    add(3, new THREE.TorusGeometry(0.076, 0.009, 8, 16), lx, 0.175, lz, Math.PI / 2, 0, 0);
    add(3, new THREE.TorusGeometry(0.078, 0.009, 8, 16), lx, 0.335, lz, Math.PI / 2, 0, 0);
  }

  // --- 2. Broad Muscular Body & Lamellar Barding (y = 0.38..0.78) ---
  // Elephant torso
  add(1, new THREE.SphereGeometry(0.24, 22, 16), 0, 0.56, 0.02, 0, 0, 0, 0.98, 0.90, 1.38);
  // Broad shoulder hump & rump
  add(1, new THREE.SphereGeometry(0.19, 16, 14), 0, 0.62, -0.15, 0, 0, 0, 1.05, 0.95, 0.95);
  add(1, new THREE.SphereGeometry(0.19, 16, 14), 0, 0.57, 0.20, 0, 0, 0, 1.0, 0.94, 0.92);

  // Lamellar scale side barding panels (front & rear flank skirts on ±X)
  for (const sx of [-1, 1]) {
    add(2, new THREE.BoxGeometry(0.045, 0.29, 0.52), sx * 0.228, 0.52, 0.02, 0, 0, -sx * 0.09);
    // Gold/bronze bottom trim of barding
    add(3, new THREE.BoxGeometry(0.052, 0.022, 0.54), sx * 0.242, 0.38, 0.02, 0, 0, -sx * 0.09);
    // Cloud-patterned central saddle blanket hanging over mid-flank
    add(4, new THREE.BoxGeometry(0.052, 0.25, 0.27), sx * 0.245, 0.575, 0.01, 0, 0, -sx * 0.06);
  }
  // Top saddlecloth draped across spine
  add(4, new THREE.CylinderGeometry(0.22, 0.23, 0.29, 18, 1, false, -Math.PI * 0.5, Math.PI), 0, 0.61, 0.01, Math.PI / 2, 0, 0, 1.08, 1.0, 0.82);

  // Front chest lamellar apron (-Z)
  add(2, new THREE.BoxGeometry(0.32, 0.22, 0.045), 0, 0.48, -0.275, 0.18, 0, 0);
  add(3, new THREE.BoxGeometry(0.34, 0.022, 0.052), 0, 0.38, -0.292, 0.18, 0, 0);

  // Rear crupper barding (+Z) + harness straps
  add(2, new THREE.CylinderGeometry(0.20, 0.225, 0.24, 16, 1, false, -Math.PI * 0.42, Math.PI * 0.84), 0, 0.53, 0.17);
  add(7, new THREE.TorusGeometry(0.22, 0.014, 8, 20, Math.PI), 0, 0.59, 0.19, 0.42, 0, 0);

  // --- 3. Sculpted Imperial War Saddle (象鞍, y = 0.74..0.89) ---
  // Saddle seat base
  add(3, new THREE.BoxGeometry(0.26, 0.06, 0.26), 0, 0.775, 0.01);
  // Swept front & back saddle cantles (matching Side view silhouette)
  add(3, new THREE.CylinderGeometry(0.14, 0.15, 0.055, 16, 1, false, 0, Math.PI), 0, 0.825, -0.105, Math.PI / 2 - 0.32, 0, 0, 1.0, 1.0, 0.85);
  add(3, new THREE.CylinderGeometry(0.145, 0.155, 0.055, 16, 1, false, 0, Math.PI), 0, 0.835, 0.125, Math.PI / 2 + 0.32, 0, 0, 1.0, 1.0, 0.85);
  // Crimson saddle tie cords & hanging flank tassels
  for (const sx of [-1, 1]) {
    add(7, new THREE.SphereGeometry(0.02, 8, 8), sx * 0.24, 0.69, -0.11);
    add(7, new THREE.ConeGeometry(0.022, 0.095, 10), sx * 0.255, 0.625, -0.11);
    add(7, new THREE.SphereGeometry(0.02, 8, 8), sx * 0.24, 0.69, 0.13);
    add(7, new THREE.ConeGeometry(0.022, 0.095, 10), sx * 0.255, 0.625, 0.13);
  }

  // --- 4. Head, Forehead Armor Crest (相/象), Flared Ears, Trunk & Tusks ---
  // Elephant skull / head at -Z
  add(1, new THREE.SphereGeometry(0.165, 20, 16), 0, 0.67, -0.255, 0, 0, 0, 0.96, 1.06, 0.98);

  // Ornate gold / dark-bronze forehead armor plate (頭甲)
  add(3, new THREE.SphereGeometry(0.172, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.52), 0, 0.685, -0.26, -0.38, 0, 0, 0.94, 1.04, 1.02);
  // Brow & nasal bridge armor guard
  add(3, new THREE.BoxGeometry(0.115, 0.14, 0.04), 0, 0.64, -0.40, 0.22, 0, 0);

  // Prominent Forehead Medallion engraved with 相 / 象 (facing -Z and tilted slightly up for 32° camera)
  add(3, new THREE.TorusGeometry(0.068, 0.012, 8, 22), 0, 0.745, -0.392, -0.45, 0, 0);
  add(6, new THREE.CircleGeometry(0.064, 22), 0, 0.748, -0.398, 0.45, Math.PI, 0);

  // Large Flared Elephant Ears (left & right) + hanging crimson ear tassels
  for (const sx of [-1, 1]) {
    add(1, new THREE.SphereGeometry(0.145, 16, 12), sx * 0.195, 0.685, -0.215, 0.10, sx * 0.42, -sx * 0.18, 0.34, 1.05, 0.88);
    // Crimson tassel dangling under each ear
    add(7, new THREE.ConeGeometry(0.022, 0.095, 10), sx * 0.175, 0.565, -0.285);
  }

  // Sweeping Curved Trunk (象鼻) — descends and curls gracefully forward-upward
  const trunkCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.62, -0.355),
    new THREE.Vector3(0, 0.49, -0.395),
    new THREE.Vector3(0, 0.35, -0.385),
    new THREE.Vector3(0, 0.28, -0.425),
    new THREE.Vector3(0, 0.32, -0.475)
  ]);
  add(1, new THREE.TubeGeometry(trunkCurve, 18, 0.044, 12, false));
  // Tapered trunk tip
  add(1, new THREE.SphereGeometry(0.034, 10, 8), 0, 0.325, -0.478);

  // Pair of Curved Ivory Tusks with gilded bands & hanging crimson tassels
  for (const sx of [-1, 1]) {
    const tuskCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(sx * 0.075, 0.54, -0.345),
      new THREE.Vector3(sx * 0.098, 0.47, -0.425),
      new THREE.Vector3(sx * 0.108, 0.445, -0.505),
      new THREE.Vector3(sx * 0.105, 0.475, -0.565)
    ]);
    add(5, new THREE.TubeGeometry(tuskCurve, 14, 0.021, 10, false));
    // Pointed ivory tusk tip
    add(5, new THREE.ConeGeometry(0.020, 0.065, 10), sx * 0.105, 0.492, -0.588, -1.15, 0, 0);
    // Gold/iron tusk band & tassel
    add(3, new THREE.TorusGeometry(0.024, 0.007, 8, 14), sx * 0.102, 0.455, -0.465, 0.25, 0, 0);
    add(7, new THREE.ConeGeometry(0.020, 0.088, 10), sx * 0.104, 0.395, -0.465);
  }

  // --- 5. Tail (+Z Back) ---
  add(1, new THREE.CylinderGeometry(0.020, 0.012, 0.26, 8), 0, 0.45, 0.355, 0.14, 0, 0);
  add(1, new THREE.ConeGeometry(0.022, 0.07, 8), 0, 0.30, 0.375, Math.PI, 0, 0);

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

function getElephantGeometry(side, radius = 0.4) {
  let geo = elephantGeoCache.get(side);
  if (!geo) {
    geo = buildElephantGeometry(side, radius);
    elephantGeoCache.set(side, geo);
  }
  return geo;
}

function getElephantMaterials(side) {
  let mats = elephantMatCache.get(side);
  if (mats) return mats;

  const isRed = side === RED;
  const hideMaps = makeHideMaps(isRed);
  const bardingMaps = makeBardingMaps(isRed);
  const saddleClothMap = makeSaddleClothTexture(isRed);
  const crestMap = makeCrestTexture(side);

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
    // 1: Wrinkled elephant hide
    new THREE.MeshStandardMaterial({
      map: hideMaps.map,
      bumpMap: hideMaps.bumpMap,
      bumpScale: 0.014,
      roughness: 0.86,
      metalness: 0.0,
      envMapIntensity: 0.25
    }),
    // 2: Lamellar scale barding
    new THREE.MeshStandardMaterial({
      map: bardingMaps.map,
      bumpMap: bardingMaps.bumpMap,
      bumpScale: 0.016,
      roughness: isRed ? 0.36 : 0.42,
      metalness: isRed ? 0.64 : 0.70,
      envMapIntensity: 0.65
    }),
    // 3: Gold / dark bronze armor trim, forehead plate, saddle & greaves
    new THREE.MeshStandardMaterial({
      color: isRed ? 0xe5b852 : 0x7c6a56,
      roughness: isRed ? 0.28 : 0.38,
      metalness: isRed ? 0.78 : 0.72,
      envMapIntensity: 0.75
    }),
    // 4: Cloud-embroidered imperial saddlecloth
    new THREE.MeshStandardMaterial({
      map: saddleClothMap,
      roughness: 0.62,
      metalness: isRed ? 0.28 : 0.14,
      envMapIntensity: 0.42
    }),
    // 5: Ivory tusks
    new THREE.MeshPhysicalMaterial({
      color: isRed ? 0xf4ecd8 : 0xd8d0c0,
      roughness: 0.28,
      metalness: 0.02,
      clearcoat: 0.35,
      clearcoatRoughness: 0.3,
      envMapIntensity: 0.45
    }),
    // 6: Engraved 相 / 象 forehead medallion
    new THREE.MeshStandardMaterial({
      map: crestMap,
      roughness: 0.34,
      metalness: 0.45,
      envMapIntensity: 0.55
    }),
    // 7: Crimson silk tassels & harness
    new THREE.MeshStandardMaterial({
      color: isRed ? 0xb81a14 : 0x6e1818,
      roughness: 0.74,
      metalness: 0.02,
      envMapIntensity: 0.3
    })
  ];

  elephantMatCache.set(side, mats);
  return mats;
}

export function createElephantMesh(side, radius = 0.4) {
  const mesh = new THREE.Mesh(getElephantGeometry(side, radius), getElephantMaterials(side));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.rotation.y = side === RED ? 0 : Math.PI;
  mesh.userData.piece = { side, type: 'E' };
  mesh.userData.homeYaw = mesh.rotation.y;
  return mesh;
}
