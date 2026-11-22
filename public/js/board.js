// 3D board scene. Two wooden camps, a living river with caustics & crossing ripples
// between rank 4 and rank 5, bridges on the edge files, stone steles for 楚河 / 漢界,
// merged static room geometry, and soft volumetric window sunbeams.
//
// Grid: x ∈ [0..8] left→right, y ∈ [0..9] bottom→top.
// World: board on XZ, y-up. Board-X → world X; board-Y → world −Z
// (Red at y=0 sits at +Z, nearest the default camera).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FILES, RANKS } from '../../shared/rules.js';

export const CELL = 1.0;
export const BOARD_W = (FILES - 1) * CELL;  // 8
export const BOARD_H = (RANKS - 1) * CELL;  // 9
export const PAD = 0.7;
export const BOARD_Y = 0;

const HALF_X = (FILES - 1) / 2; // 4
const HALF_Z = (RANKS - 1) / 2; // 4.5

export function gridToWorld(x, y, yOffset = 0) {
  return new THREE.Vector3(
    (x - HALF_X) * CELL,
    yOffset,
    (HALF_Z - y) * CELL
  );
}

export function worldToGrid(v3) {
  const x = Math.round(v3.x / CELL + HALF_X);
  const y = Math.round(HALF_Z - v3.z / CELL);
  return { x, y };
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

const woodTexCache = new Map();

export function woodTexture(light, dark) {
  const key = `${light}|${dark}`;
  const cached = woodTexCache.get(key);
  if (cached) return cached;

  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 512, 512);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 80; i++) {
    ctx.strokeStyle = i % 2 ? '#5a3418' : '#ffe6c2';
    ctx.lineWidth = 1 + (i % 3);
    const y = (i / 80) * 512;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(160, y + 8, 320, y - 6, 512, y + 3);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  woodTexCache.set(key, tex);
  return tex;
}

function wallpaperTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e7d8bf';
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = 'rgba(112, 76, 48, 0.12)';
  ctx.lineWidth = 2;
  for (let y = -64; y < 576; y += 128) {
    for (let x = -64; x < 576; x += 128) {
      ctx.beginPath();
      ctx.moveTo(x, y + 64);
      ctx.lineTo(x + 64, y);
      ctx.lineTo(x + 128, y + 64);
      ctx.lineTo(x + 64, y + 128);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = 'rgba(145, 60, 50, 0.16)';
      for (let p = 0; p < 5; p++) {
        const a = p * Math.PI * 0.4 - Math.PI / 2;
        ctx.beginPath();
        ctx.ellipse(x + 64 + Math.cos(a) * 10, y + 64 + Math.sin(a) * 10, 7, 4, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(158, 120, 55, 0.24)';
      ctx.beginPath();
      ctx.arc(x + 64, y + 64, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  tex.anisotropy = 8;
  return tex;
}

function coupletTexture(text) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 768;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#a82922';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = '#d9b96d';
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, c.width - 20, c.height - 20);
  ctx.fillStyle = '#f0d78a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const step = (c.height - 100) / text.length;
  ctx.font = `bold ${Math.min(76, step * 0.72)}px "Kaiti TC", "KaiTi", "Songti TC", serif`;
  [...text].forEach((char, i) => ctx.fillText(char, c.width / 2, 50 + step * (i + 0.5)));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function newsTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 576;
  const ctx = c.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, 1024, 576);
  bg.addColorStop(0, '#174f79');
  bg.addColorStop(1, '#071b31');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1024, 576);

  ctx.fillStyle = 'rgba(92, 177, 211, 0.22)';
  for (let x = 30; x < 1000; x += 150) ctx.fillRect(x, 100, 100, 260);
  ctx.fillStyle = '#0a2b48';
  ctx.fillRect(50, 130, 380, 235);
  ctx.fillStyle = '#7396aa';
  for (let i = 0; i < 9; i++) {
    const h = 45 + (i * 37) % 110;
    ctx.fillRect(70 + i * 39, 350 - h, 29, h);
  }
  ctx.fillStyle = '#e9f2f5';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText('城市現場', 75, 170);

  ctx.fillStyle = '#d8a37e';
  ctx.beginPath();
  ctx.arc(665, 210, 58, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#20232a';
  ctx.beginPath();
  ctx.arc(665, 180, 61, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#17263b';
  ctx.beginPath();
  ctx.moveTo(540, 410);
  ctx.quadraticCurveTo(555, 280, 665, 278);
  ctx.quadraticCurveTo(775, 280, 800, 410);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f0f0e8';
  ctx.beginPath();
  ctx.moveTo(630, 286);
  ctx.lineTo(665, 350);
  ctx.lineTo(700, 286);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#9e2635';
  ctx.fillRect(659, 321, 13, 89);
  ctx.fillStyle = '#d7e2e7';
  ctx.fillRect(450, 390, 510, 35);

  ctx.fillStyle = '#f4f7f8';
  ctx.font = 'bold 35px sans-serif';
  ctx.fillText('無線新聞', 42, 56);
  ctx.fillStyle = '#e33338';
  ctx.font = 'bold italic 48px sans-serif';
  ctx.fillText('TVBS', 850, 58);
  ctx.fillStyle = '#d82932';
  ctx.fillRect(45, 78, 112, 43);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 25px sans-serif';
  ctx.fillText('● LIVE', 55, 108);
  ctx.fillStyle = '#d7e5ec';
  ctx.font = '25px sans-serif';
  ctx.fillText('20:00', 920, 105);

  ctx.fillStyle = '#123f68';
  ctx.fillRect(0, 424, 1024, 88);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 41px sans-serif';
  ctx.fillText('城市茶館文化節 今日開幕', 42, 481);
  ctx.fillStyle = '#bd2029';
  ctx.fillRect(0, 512, 190, 64);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText('最新消息', 38, 553);
  ctx.fillStyle = '#071b31';
  ctx.fillRect(190, 512, 834, 64);
  ctx.fillStyle = '#f2f2e9';
  ctx.font = '27px sans-serif';
  ctx.fillText('茶席、棋藝與傳統點心展示　吸引市民參與', 215, 553);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function stoneTexture() {
  const size = 512;
  const tile = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#9a8f80';
  ctx.fillRect(0, 0, size, size);
  for (let ty = 0; ty < size / tile; ty++) {
    for (let tx = 0; tx < size / tile; tx++) {
      const shade = 158 + ((tx * 7 + ty * 13) % 5) * 6;
      ctx.fillStyle = `rgb(${shade}, ${shade - 9}, ${shade - 21})`;
      ctx.fillRect(tx * tile + 3, ty * tile + 3, tile - 6, tile - 6);
      ctx.fillStyle = 'rgba(70, 66, 58, 0.5)';
      for (let i = 0; i < 22; i++) {
        const px = tx * tile + ((i * 41 + tx * 17) % (tile - 8)) + 4;
        const py = ty * tile + ((i * 29 + ty * 23) % (tile - 8)) + 4;
        ctx.fillRect(px, py, 2, 2);
      }
    }
  }
  ctx.strokeStyle = 'rgba(105, 94, 82, 0.85)';
  ctx.lineWidth = 5;
  for (let i = 0; i <= size / tile; i++) {
    ctx.beginPath();
    ctx.moveTo(i * tile, 0);
    ctx.lineTo(i * tile, size);
    ctx.moveTo(0, i * tile);
    ctx.lineTo(size, i * tile);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  tex.anisotropy = 8;
  return tex;
}

function steleTexture(label) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3a403c';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#d7c07a';
  ctx.lineWidth = 8;
  ctx.strokeRect(16, 16, 224, 224);
  ctx.fillStyle = '#f0d78a';
  ctx.font = 'bold 72px "Kaiti TC", "KaiTi", "Songti TC", "Noto Serif TC", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function noRaycast(mesh) {
  mesh.raycast = () => {};
  return mesh;
}

function makeBoxGeom(w, h, d, x, y, z, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  _e.set(0, ry, 0);
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  g.applyMatrix4(_m.compose(_p, _q, _s));
  return g;
}

function mergeIntoMesh(geoms, material, { castShadow = false, receiveShadow = true } = {}) {
  const merged = mergeGeometries(geoms, false);
  for (const g of geoms) g.dispose();
  const mesh = new THREE.Mesh(merged, material);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  return mesh;
}

function makeSunbeamMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color('#fff1cc') }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        // Soft vertical fade from window top (vUv.y = 1) down into room (vUv.y = 0)
        float vFade = smoothstep(0.0, 0.55, vUv.y) * smoothstep(1.0, 0.85, vUv.y);
        float hFade = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x);
        float dust = 0.88 + 0.12 * sin(vUv.x * 12.0 + uTime * 0.45) * cos(vUv.y * 8.0 - uTime * 0.3);
        float alpha = vFade * hFade * dust * 0.085;
        gl_FragColor = vec4(uColor, alpha);
      }
    `
  });
}

function addRoom(parent, floorY) {
  const room = new THREE.Group();
  room.name = 'living-room';
  const wallMat = new THREE.MeshStandardMaterial({ map: wallpaperTexture(), roughness: 0.94, envMapIntensity: 0.35 });
  const trimMat = new THREE.MeshStandardMaterial({
    map: woodTexture('#a77b4f', '#68462c'), roughness: 0.78, envMapIntensity: 0.45
  });
  const cabinetMat = new THREE.MeshStandardMaterial({
    map: woodTexture('#8f6441', '#4e3221'), roughness: 0.8, envMapIntensity: 0.45
  });
  const fabricMat = new THREE.MeshStandardMaterial({ color: 0x82918a, roughness: 0.98, envMapIntensity: 0.3 });
  const cushionMat = new THREE.MeshStandardMaterial({ color: 0xa7b2a5, roughness: 0.96, envMapIntensity: 0.3 });

  const wallGeoms = [];
  const trimGeoms = [];
  const cabinetGeoms = [];
  const fabricGeoms = [];
  const cushionGeoms = [];

  const half = 32;
  const wallTop = floorY + 60;
  const wallH = 60;
  const wallY = floorY + wallH / 2;
  const windowL = 4;
  const windowR = 24;
  const windowBottom = 4;
  const windowTop = 26;
  const windowW = windowR - windowL;
  const windowX = (windowL + windowR) / 2;

  // Walls
  wallGeoms.push(
    makeBoxGeom(windowL + half, wallH, 0.5, (windowL - half) / 2, wallY, -half),
    makeBoxGeom(half - windowR, wallH, 0.5, (windowR + half) / 2, wallY, -half),
    makeBoxGeom(windowW, windowBottom - floorY, 0.5, windowX, (windowBottom + floorY) / 2, -half),
    makeBoxGeom(windowW, wallTop - windowTop, 0.5, windowX, (wallTop + windowTop) / 2, -half),
    makeBoxGeom(0.5, wallH, half * 2, -half, wallY, 0),
    makeBoxGeom(0.5, wallH, half * 2, half, wallY, 0)
  );

  // Baseboards & window frame
  const frameZ = -half + 0.4;
  trimGeoms.push(
    makeBoxGeom(half * 2, 0.7, 0.35, 0, floorY + 0.35, -half + 0.35),
    makeBoxGeom(0.35, 0.7, half * 2, -half + 0.35, floorY + 0.35, 0),
    makeBoxGeom(0.35, 0.7, half * 2, half - 0.35, floorY + 0.35, 0),
    makeBoxGeom(0.7, windowTop - windowBottom + 1.4, 0.7, windowL, (windowTop + windowBottom) / 2, frameZ),
    makeBoxGeom(0.7, windowTop - windowBottom + 1.4, 0.7, windowR, (windowTop + windowBottom) / 2, frameZ),
    makeBoxGeom(windowW + 1.4, 0.7, 0.7, windowX, windowBottom, frameZ),
    makeBoxGeom(windowW + 1.4, 0.7, 0.7, windowX, windowTop, frameZ),
    makeBoxGeom(0.45, windowTop - windowBottom, 0.55, windowX, (windowTop + windowBottom) / 2, frameZ),
    makeBoxGeom(windowW, 0.45, 0.55, windowX, (windowTop + windowBottom) / 2, frameZ)
  );

  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(windowW, windowTop - windowBottom),
    new THREE.MeshStandardMaterial({
      color: 0xcfe5e8, transparent: true, opacity: 0.16, roughness: 0.12, depthWrite: false
    })
  );
  glass.position.set(windowX, (windowTop + windowBottom) / 2, -half + 0.25);
  room.add(glass);

  // Volumetric window sunbeams (Phase 4 atmosphere)
  const sunbeamMat = makeSunbeamMaterial();
  for (const offsetX of [-4.2, 4.2]) {
    const shaft = new THREE.Mesh(new THREE.PlaneGeometry(9.5, 36), sunbeamMat);
    shaft.position.set(windowX + offsetX - 3.5, 8.5, -half + 13.5);
    shaft.rotation.set(0.62, -0.22, 0.18);
    shaft.renderOrder = 3;
    room.add(shaft);
  }
  parent.userData.sunbeamMat = sunbeamMat;

  const addCouplet = (text, x, y, width, height) => {
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshStandardMaterial({ map: coupletTexture(text), roughness: 0.82, envMapIntensity: 0.35 })
    );
    banner.position.set(x, y, -half + 0.32);
    banner.receiveShadow = true;
    room.add(banner);
    trimGeoms.push(
      makeBoxGeom(width + 0.45, 0.2, 0.2, x, y + height / 2, -half + 0.4),
      makeBoxGeom(width + 0.45, 0.2, 0.2, x, y - height / 2, -half + 0.4)
    );
  };
  addCouplet('春滿乾坤福滿門', 2.3, 15, 2.5, 23);
  addCouplet('天增歲月人增壽', 25.7, 15, 2.5, 23);
  addCouplet('詩酒茶花', -29.3, 0, 2.5, 18);
  addCouplet('琴棋書畫', -4.7, 0, 2.5, 18);

  // TV cabinet
  cabinetGeoms.push(
    makeBoxGeom(24, 8, 5, -17, floorY + 7.5, -29.2),
    makeBoxGeom(2.2, 1.8, 1.4, -17, floorY + 12.4, -29.8)
  );
  trimGeoms.push(makeBoxGeom(24.8, 0.7, 5.5, -17, floorY + 11.85, -29.2));
  for (const x of [-23, -17, -11]) {
    trimGeoms.push(makeBoxGeom(5.4, 5.8, 0.25, x, floorY + 7.3, -26.58));
  }

  const tvFrame = new THREE.Mesh(
    new THREE.BoxGeometry(20, 12, 0.65),
    new THREE.MeshStandardMaterial({ color: 0x171b1c, roughness: 0.35, metalness: 0.12 })
  );
  tvFrame.position.set(-17, floorY + 18, -30.2);
  room.add(tvFrame);

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(18.8, 10.8),
    new THREE.MeshBasicMaterial({ map: newsTexture(), toneMapped: false })
  );
  screen.position.set(-17, floorY + 18, -29.85);
  room.add(screen);

  // Sofa (rotated +90 deg around Y at (-28.5, floorY, 5))
  const sofaX = -28.5;
  const sofaZ = 5;
  const pushSofaBox = (arr, w, h, d, lx, ly, lz) => {
    // Rotate local (lx, ly, lz) by +PI/2 around Y -> (lz, ly, -lx)
    arr.push(makeBoxGeom(d, h, w, sofaX + lz, floorY + ly, sofaZ - lx));
  };
  pushSofaBox(fabricGeoms, 24, 7, 8, 0, 3.5, 0);
  pushSofaBox(fabricGeoms, 24, 13, 2.2, 0, 10, -3.4);
  pushSofaBox(fabricGeoms, 2.2, 9, 8, -11, 6.5, 0);
  pushSofaBox(fabricGeoms, 2.2, 9, 8, 11, 6.5, 0);
  for (const x of [-6.5, 0, 6.5]) {
    pushSofaBox(cushionGeoms, 6.1, 2, 5.5, x, 8, 0.5);
  }

  // Add merged room meshes (5 draw calls instead of 30+, no distant castShadow)
  room.add(mergeIntoMesh(wallGeoms, wallMat, { castShadow: false, receiveShadow: true }));
  room.add(mergeIntoMesh(trimGeoms, trimMat, { castShadow: false, receiveShadow: true }));
  room.add(mergeIntoMesh(cabinetGeoms, cabinetMat, { castShadow: false, receiveShadow: true }));
  room.add(mergeIntoMesh(fabricGeoms, fabricMat, { castShadow: false, receiveShadow: true }));
  room.add(mergeIntoMesh(cushionGeoms, cushionMat, { castShadow: false, receiveShadow: true }));

  parent.add(room);
  room.traverse((child) => {
    if (child.isMesh) child.raycast = () => {};
  });
}

// High-resolution (2048×1024, exact 2:1 match to campW:campD = 9.4:4.7) wood + crisp
// ink grid texture for each half-board. GPU trilinear mipmapping + 16x anisotropic
// filtering keeps every line sharp and alias-free at oblique camera angles.
function campBoardTexture(isRed) {
  const W = 2048;
  const H = 1024;
  const campW = BOARD_W + PAD * 2; // 9.4
  const campD = 4 * CELL + PAD;    // 4.7
  const outerZ = HALF_Z + PAD;     // 5.2
  const centerZ = isRed ? (0.5 + outerZ) / 2 : (-0.5 - outerZ) / 2;
  const zMin = centerZ - campD / 2;

  const toX = (gx) => (((gx - HALF_X) * CELL + campW / 2) / campW) * W;
  const toY = (gy) => (((HALF_Z - gy) * CELL - zMin) / campD) * H;

  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');

  // Warm rosewood/hinoki base gradient
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#e8c791');
  grad.addColorStop(0.5, '#d8ae72');
  grad.addColorStop(1, '#c59457');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Subtle wood grain lines (kept soft so ink grid reads clearly)
  ctx.save();
  ctx.globalAlpha = 0.13;
  for (let i = 0; i < 120; i++) {
    ctx.strokeStyle = i % 2 ? '#613819' : '#fff0d2';
    ctx.lineWidth = 1.5 + (i % 3);
    const y = (i / 120) * H;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(W * 0.32, y + 12, W * 0.68, y - 10, W, y + 5);
    ctx.stroke();
  }
  ctx.restore();

  const lineW = 9;
  const halfL = lineW / 2;
  const clampY = (py) => Math.max(halfL, Math.min(H - halfL, py));

  const yStart = isRed ? 0 : 5;
  const yEnd = isRed ? 4 : 9;
  const xLeft = toX(0);
  const xRight = toX(8);
  const yTop = clampY(toY(isRed ? 4 : 9));
  const yBot = clampY(toY(isRed ? 0 : 5));

  ctx.strokeStyle = '#1b0d04';
  ctx.lineCap = 'square';
  ctx.lineJoin = 'miter';

  // Outer decorative double frame (classic Xiangqi board border)
  const frameGap = 24;
  ctx.lineWidth = 12;
  ctx.beginPath();
  if (isRed) {
    // Open at top (river bank), closed on left, bottom, right
    ctx.moveTo(xLeft - frameGap, 0);
    ctx.lineTo(xLeft - frameGap, yBot + frameGap);
    ctx.lineTo(xRight + frameGap, yBot + frameGap);
    ctx.lineTo(xRight + frameGap, 0);
  } else {
    // Open at bottom (river bank), closed on left, top, right
    ctx.moveTo(xLeft - frameGap, H);
    ctx.lineTo(xLeft - frameGap, yTop - frameGap);
    ctx.lineTo(xRight + frameGap, yTop - frameGap);
    ctx.lineTo(xRight + frameGap, H);
  }
  ctx.stroke();

  // Horizontal ranks
  ctx.lineWidth = lineW;
  ctx.beginPath();
  for (let gy = yStart; gy <= yEnd; gy++) {
    const py = clampY(toY(gy));
    ctx.moveTo(xLeft, py);
    ctx.lineTo(xRight, py);
  }
  // Vertical files
  for (let gx = 0; gx < FILES; gx++) {
    const px = toX(gx);
    ctx.moveTo(px, yTop);
    ctx.lineTo(px, yBot);
  }
  ctx.stroke();

  // Palace diagonals
  ctx.lineWidth = 7.5;
  ctx.beginPath();
  const pY0 = isRed ? 0 : 7;
  const pY1 = isRed ? 2 : 9;
  ctx.moveTo(toX(3), clampY(toY(pY0)));
  ctx.lineTo(toX(5), clampY(toY(pY1)));
  ctx.moveTo(toX(5), clampY(toY(pY0)));
  ctx.lineTo(toX(3), clampY(toY(pY1)));
  ctx.stroke();

  // Traditional L-shaped corner markers for cannon & pawn positions
  const starPts = isRed
    ? [[1, 2], [7, 2], [0, 3], [2, 3], [4, 3], [6, 3], [8, 3]]
    : [[1, 7], [7, 7], [0, 6], [2, 6], [4, 6], [6, 6], [8, 6]];
  const gap = 14;
  const arm = 24;
  ctx.lineWidth = 6.5;
  ctx.beginPath();
  for (const [sx, sy] of starPts) {
    const cx = toX(sx);
    const cy = clampY(toY(sy));
    for (const dx of [-1, 1]) {
      if (sx === 0 && dx < 0) continue;
      if (sx === 8 && dx > 0) continue;
      for (const dy of [-1, 1]) {
        ctx.moveTo(cx + dx * (gap + arm), cy + dy * gap);
        ctx.lineTo(cx + dx * gap, cy + dy * gap);
        ctx.lineTo(cx + dx * gap, cy + dy * (gap + arm));
      }
    }
  }
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

function makeWaterMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    toneMapped: false,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color('#093640') },
      uMid: { value: new THREE.Color('#1d7d8a') },
      uFoam: { value: new THREE.Color('#e8f8f6') },
      uRippleOrigin: { value: new THREE.Vector2(0, 0) },
      uRippleStart: { value: -10.0 }
    },
    vertexShader: `
      uniform float uTime;
      uniform vec2 uRippleOrigin;
      uniform float uRippleStart;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying float vRipple;
      void main() {
        vUv = uv;
        vec3 p = position;
        float w1 = sin(p.x * 3.0 + uTime * 1.6) * 0.014;
        float w2 = sin(p.x * 6.8 - uTime * 2.2 + p.z * 4.5) * 0.007;
        p.y += w1 + w2;

        vec4 world = modelMatrix * vec4(p, 1.0);
        float age = uTime - uRippleStart;
        float rip = 0.0;
        if (age > 0.0 && age < 2.2) {
          float dist = length(world.xz - uRippleOrigin);
          float front = age * 2.4;
          float env = exp(-abs(dist - front) * 3.8) * (1.0 - age / 2.2);
          rip = sin((dist - front) * 18.0) * env;
          world.y += rip * 0.022;
        }
        vRipple = rip;
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uDeep;
      uniform vec3 uMid;
      uniform vec3 uFoam;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying float vRipple;

      float caustic(vec2 p, float t) {
        float c1 = sin(p.x * 4.2 + t * 1.4 + sin(p.y * 5.0 - t));
        float c2 = cos(p.y * 5.6 - t * 1.7 + cos(p.x * 3.8 + t * 0.9));
        return pow(clamp(0.5 + 0.25 * (c1 + c2), 0.0, 1.0), 3.0);
      }

      void main() {
        float wave = sin(vWorld.x * 3.8 + uTime * 1.5) * 0.5 + 0.5;
        float rip = sin(vWorld.x * 9.5 - uTime * 2.4 + vWorld.z * 2.5);
        vec3 col = mix(uDeep, uMid, wave);

        // Animated underwater caustics
        float caust = caustic(vWorld.xz * 1.15, uTime);
        col += vec3(0.28, 0.68, 0.72) * caust * 0.32;

        // Bank foam
        float bank = smoothstep(0.02, 0.2, min(vUv.y, 1.0 - vUv.y));
        float foam = (1.0 - bank) * (0.42 + 0.58 * rip);
        col = mix(col, uFoam, clamp(foam, 0.0, 0.72));

        // Interactive piece-crossing ripple shimmer
        col += uFoam * abs(vRipple) * 0.55;

        // Fresnel reflection + sun glint
        vec3 viewDir = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - clamp(abs(viewDir.y), 0.0, 1.0), 2.2);
        col += vec3(0.5, 0.78, 0.82) * fres * 0.38;

        float glint = pow(clamp(sin(vWorld.x * 5.2 + uTime * 2.1) * cos(vWorld.z * 8.0 - uTime * 1.4), 0.0, 1.0), 8.0);
        col += vec3(1.15, 1.08, 0.92) * glint * 0.45;

        gl_FragColor = vec4(pow(max(col, 0.0), vec3(1.0 / 2.2)), 0.94);
      }
    `
  });
}

export function triggerRiverRipple(group, worldX, worldZ = 0) {
  const mat = group?.userData?.waterMat;
  if (!mat) return;
  mat.uniforms.uRippleOrigin.value.set(worldX, worldZ);
  mat.uniforms.uRippleStart.value = mat.uniforms.uTime.value;
}

export function tickBoard(group, time) {
  const mat = group?.userData?.waterMat;
  if (mat) mat.uniforms.uTime.value = time;
  const beam = group?.userData?.sunbeamMat;
  if (beam) beam.uniforms.uTime.value = time;
}

export function createBoardGroup() {
  const group = new THREE.Group();
  group.name = 'board';

  const campW = BOARD_W + PAD * 2;
  const outerZ = HALF_Z + PAD;
  const campD = 4 * CELL + PAD;
  const redCenterZ = (0.5 + outerZ) / 2;
  const blackCenterZ = (-0.5 + -outerZ) / 2;

  const campSideMat = new THREE.MeshStandardMaterial({
    map: woodTexture('#e4c089', '#c49255'),
    roughness: 0.78,
    metalness: 0.0,
    envMapIntensity: 0.35
  });
  const redTopMat = new THREE.MeshStandardMaterial({
    map: campBoardTexture(true),
    roughness: 0.82,
    metalness: 0.0,
    envMapIntensity: 0.28
  });
  const blackTopMat = new THREE.MeshStandardMaterial({
    map: campBoardTexture(false),
    roughness: 0.82,
    metalness: 0.0,
    envMapIntensity: 0.28
  });
  const campGeom = new THREE.BoxGeometry(campW, 0.18, campD);
  const redCamp = new THREE.Mesh(campGeom, [
    campSideMat, campSideMat, redTopMat, campSideMat, campSideMat, campSideMat
  ]);
  redCamp.position.set(0, -0.09, redCenterZ);
  redCamp.receiveShadow = true;
  redCamp.castShadow = true;
  group.add(redCamp);

  const blackCamp = new THREE.Mesh(campGeom, [
    campSideMat, campSideMat, blackTopMat, campSideMat, campSideMat, campSideMat
  ]);
  blackCamp.position.set(0, -0.09, blackCenterZ);
  blackCamp.receiveShadow = true;
  blackCamp.castShadow = true;
  group.add(blackCamp);

  const plinthMat = new THREE.MeshStandardMaterial({
    map: woodTexture('#8a5a32', '#4e3018'),
    roughness: 0.82,
    envMapIntensity: 0.55
  });
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(campW, 0.2, outerZ * 2), plinthMat);
  plinth.position.y = -0.28;
  plinth.receiveShadow = true;
  group.add(plinth);

  const rimMat = new THREE.MeshStandardMaterial({ color: 0x4a2c18, roughness: 0.82, envMapIntensity: 0.6 });
  const rimT = 0.28;
  const rimH = 0.16;
  const spanX = campW + rimT;
  const spanZ = outerZ * 2 + rimT;
  const rimY = -0.02;
  const rimGeoms = [
    [spanX + rimT, rimT, 0, spanZ / 2],
    [spanX + rimT, rimT, 0, -spanZ / 2],
    [rimT, spanZ, spanX / 2, 0],
    [rimT, spanZ, -spanX / 2, 0]
  ].map(([w, d, x, z]) => makeBoxGeom(w, rimH, d, x, rimY, z));
  group.add(mergeIntoMesh(rimGeoms, rimMat, { castShadow: true, receiveShadow: true }));

  const waterMat = makeWaterMaterial();
  const water = new THREE.Mesh(new THREE.PlaneGeometry(campW + 0.2, 0.96, 36, 6), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.12;
  water.renderOrder = 1;
  group.add(noRaycast(water));
  group.userData.waterMat = waterMat;

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x6a675f, roughness: 0.9, envMapIntensity: 0.45 });
  const lipGeoms = [0.46, -0.46].map((z) => makeBoxGeom(campW, 0.16, 0.1, 0, -0.1, z));
  group.add(mergeIntoMesh(lipGeoms, stoneMat, { castShadow: false, receiveShadow: true }));

  const bridgeMat = new THREE.MeshStandardMaterial({
    map: woodTexture('#c9a06a', '#7a5330'),
    roughness: 0.66,
    envMapIntensity: 0.6
  });
  const bridgeGeoms = [-HALF_X, HALF_X].map((x) => makeBoxGeom(0.36, 0.08, 1, x, -0.02, 0));
  group.add(mergeIntoMesh(bridgeGeoms, bridgeMat, { castShadow: true, receiveShadow: true }));

  const stoneSide = new THREE.MeshStandardMaterial({ color: 0x4c514c, roughness: 0.86, envMapIntensity: 0.5 });
  const stoneTop = new THREE.MeshStandardMaterial({ color: 0x5c615c, roughness: 0.78, envMapIntensity: 0.55 });
  for (const [label, x] of [['楚河', -2.5], ['漢界', 2.5]]) {
    const face = new THREE.MeshStandardMaterial({
      map: steleTexture(label), roughness: 0.55, envMapIntensity: 0.65
    });
    const stele = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.48, 0.12), [
      stoneSide, stoneSide, stoneTop, stoneSide, face, stoneSide
    ]);
    stele.position.set(x, 0.06, 0);
    stele.castShadow = true;
    group.add(noRaycast(stele));
  }



  // Warm tiled floor and an open-sided living room around the tea table.
  const groundY = -18;
  const pavement = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ map: stoneTexture(), roughness: 0.9, metalness: 0, envMapIntensity: 0.35 })
  );
  pavement.rotation.x = -Math.PI / 2;
  pavement.position.y = groundY;
  pavement.receiveShadow = true;
  group.add(noRaycast(pavement));
  addRoom(group, groundY);

  const totalW = campW;
  const totalD = outerZ * 2;
  const hitGeom = new THREE.PlaneGeometry(totalW, totalD);
  hitGeom.rotateX(-Math.PI / 2);
  const hit = new THREE.Mesh(hitGeom, new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = BOARD_Y + 0.001;
  hit.name = 'hitPlane';
  group.add(hit);

  return group;
}
