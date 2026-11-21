// 3D board scene. Two wooden camps, a real river between rank 4 and rank 5,
// bridges on the edge files, stone steles for 楚河 / 漢界. The board rests on a
// round tea table (see teatable.js) in a naturally lit living room.
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

export function woodTexture(light, dark) {
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

function addRoom(parent, floorY) {
  const room = new THREE.Group();
  room.name = 'living-room';
  const wallMat = new THREE.MeshStandardMaterial({ map: wallpaperTexture(), roughness: 0.94 });
  const trimMat = new THREE.MeshStandardMaterial({
    map: woodTexture('#a77b4f', '#68462c'), roughness: 0.78
  });
  const cabinetMat = new THREE.MeshStandardMaterial({
    map: woodTexture('#8f6441', '#4e3221'), roughness: 0.8
  });
  const fabricMat = new THREE.MeshStandardMaterial({ color: 0x82918a, roughness: 0.98 });
  const cushionMat = new THREE.MeshStandardMaterial({ color: 0xa7b2a5, roughness: 0.96 });

  const box = (w, h, d, x, y, z, material, casts = true) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = casts;
    mesh.receiveShadow = true;
    room.add(mesh);
    return mesh;
  };

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

  box(windowL + half, wallH, 0.5, (windowL - half) / 2, wallY, -half, wallMat);
  box(half - windowR, wallH, 0.5, (windowR + half) / 2, wallY, -half, wallMat);
  box(windowW, windowBottom - floorY, 0.5, windowX, (windowBottom + floorY) / 2, -half, wallMat);
  box(windowW, wallTop - windowTop, 0.5, windowX, (wallTop + windowTop) / 2, -half, wallMat);
  box(0.5, wallH, half * 2, -half, wallY, 0, wallMat);
  box(0.5, wallH, half * 2, half, wallY, 0, wallMat);

  box(half * 2, 0.7, 0.35, 0, floorY + 0.35, -half + 0.35, trimMat);
  box(0.35, 0.7, half * 2, -half + 0.35, floorY + 0.35, 0, trimMat);
  box(0.35, 0.7, half * 2, half - 0.35, floorY + 0.35, 0, trimMat);

  const frameZ = -half + 0.4;
  box(0.7, windowTop - windowBottom + 1.4, 0.7, windowL, (windowTop + windowBottom) / 2, frameZ, trimMat);
  box(0.7, windowTop - windowBottom + 1.4, 0.7, windowR, (windowTop + windowBottom) / 2, frameZ, trimMat);
  box(windowW + 1.4, 0.7, 0.7, windowX, windowBottom, frameZ, trimMat);
  box(windowW + 1.4, 0.7, 0.7, windowX, windowTop, frameZ, trimMat);
  box(0.45, windowTop - windowBottom, 0.55, windowX, (windowTop + windowBottom) / 2, frameZ, trimMat);
  box(windowW, 0.45, 0.55, windowX, (windowTop + windowBottom) / 2, frameZ, trimMat);
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(windowW, windowTop - windowBottom),
    new THREE.MeshStandardMaterial({
      color: 0xcfe5e8, transparent: true, opacity: 0.16, roughness: 0.12, depthWrite: false
    })
  );
  glass.position.set(windowX, (windowTop + windowBottom) / 2, -half + 0.25);
  room.add(glass);

  const addCouplet = (text, x, y, width, height) => {
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshStandardMaterial({ map: coupletTexture(text), roughness: 0.82 })
    );
    banner.position.set(x, y, -half + 0.32);
    banner.receiveShadow = true;
    room.add(banner);
    box(width + 0.45, 0.2, 0.2, x, y + height / 2, -half + 0.4, trimMat);
    box(width + 0.45, 0.2, 0.2, x, y - height / 2, -half + 0.4, trimMat);
  };
  addCouplet('春滿乾坤福滿門', 2.3, 15, 2.5, 23);
  addCouplet('天增歲月人增壽', 25.7, 15, 2.5, 23);
  addCouplet('詩酒茶花', -29.3, 0, 2.5, 18);
  addCouplet('琴棋書畫', -4.7, 0, 2.5, 18);

  box(24, 8, 5, -17, floorY + 7.5, -29.2, cabinetMat);
  box(24.8, 0.7, 5.5, -17, floorY + 11.85, -29.2, trimMat);
  for (const x of [-23, -17, -11]) {
    box(5.4, 5.8, 0.25, x, floorY + 7.3, -26.58, trimMat);
  }
  box(20, 12, 0.65, -17, floorY + 18, -30.2, matForScreen());
  box(2.2, 1.8, 1.4, -17, floorY + 12.4, -29.8, cabinetMat);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(18.8, 10.8),
    new THREE.MeshBasicMaterial({ map: newsTexture(), toneMapped: false })
  );
  screen.position.set(-17, floorY + 18, -29.85);
  room.add(screen);

  const sofa = new THREE.Group();
  const sofaBox = (w, h, d, x, y, z, material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    sofa.add(mesh);
  };
  sofaBox(24, 7, 8, 0, 3.5, 0, fabricMat);
  sofaBox(24, 13, 2.2, 0, 10, -3.4, fabricMat);
  sofaBox(2.2, 9, 8, -11, 6.5, 0, fabricMat);
  sofaBox(2.2, 9, 8, 11, 6.5, 0, fabricMat);
  for (const x of [-6.5, 0, 6.5]) {
    sofaBox(6.1, 2, 5.5, x, 8, 0.5, cushionMat);
  }
  sofa.position.set(-28.5, floorY, 5);
  sofa.rotation.y = Math.PI / 2;
  room.add(sofa);

  parent.add(room);
  room.traverse((child) => {
    if (child.isMesh) child.raycast = () => {};
  });
}

function matForScreen() {
  return new THREE.MeshStandardMaterial({ color: 0x171b1c, roughness: 0.35, metalness: 0.12 });
}


function pushSegment(geoms, x0, z0, x1, z1, width) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const g = new THREE.BoxGeometry(width, 0.02, len);
  // Long axis is local +Z. yaw = atan2(dx, dz) lays that axis along the segment.
  _e.set(0, Math.atan2(dx, dz), 0);
  _q.setFromEuler(_e);
  g.applyMatrix4(_m.compose(
    new THREE.Vector3((x0 + x1) / 2, 0.012, (z0 + z1) / 2),
    _q,
    new THREE.Vector3(1, 1, 1)
  ));
  geoms.push(g);
}

function makeWaterMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    toneMapped: false,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color('#0c3c46') },
      uMid: { value: new THREE.Color('#1f7c88') },
      uFoam: { value: new THREE.Color('#e7f6f4') }
    },
    vertexShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vUv = uv;
        vec3 p = position;
        p.y += sin(p.x * 3.2 + uTime * 1.5) * 0.018;
        p.y += sin(p.x * 7.0 - uTime * 2.1 + p.z * 4.0) * 0.008;
        vec4 world = modelMatrix * vec4(p, 1.0);
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
      void main() {
        float wave = sin(vWorld.x * 4.0 + uTime * 1.6) * 0.5 + 0.5;
        float rip = sin(vWorld.x * 9.0 - uTime * 2.3 + vWorld.z * 2.0);
        vec3 col = mix(uDeep, uMid, wave);
        float bank = smoothstep(0.02, 0.18, min(vUv.y, 1.0 - vUv.y));
        float foam = (1.0 - bank) * (0.4 + 0.6 * rip);
        col = mix(col, uFoam, clamp(foam, 0.0, 0.7));
        float fres = pow(1.0 - clamp(abs(normalize(cameraPosition - vWorld).y), 0.0, 1.0), 2.0);
        col += vec3(0.45, 0.7, 0.72) * fres * 0.35;
        gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 0.94);
      }
    `
  });
}

export function tickBoard(group, time) {
  const mat = group?.userData?.waterMat;
  if (mat) mat.uniforms.uTime.value = time;
}

export function createBoardGroup() {
  const group = new THREE.Group();
  group.name = 'board';

  const campW = BOARD_W + PAD * 2;
  const outerZ = HALF_Z + PAD;
  const campD = 4 * CELL + PAD;
  const redCenterZ = (0.5 + outerZ) / 2;
  const blackCenterZ = (-0.5 + -outerZ) / 2;

  const campMat = new THREE.MeshStandardMaterial({
    map: woodTexture('#e4c089', '#c49255'),
    roughness: 0.78,
    metalness: 0.02
  });
  const campGeom = new THREE.BoxGeometry(campW, 0.18, campD);
  const redCamp = new THREE.Mesh(campGeom, campMat);
  redCamp.position.set(0, -0.09, redCenterZ);
  redCamp.receiveShadow = true;
  redCamp.castShadow = true;
  group.add(redCamp);

  const blackCamp = new THREE.Mesh(campGeom, campMat);
  blackCamp.position.set(0, -0.09, blackCenterZ);
  blackCamp.receiveShadow = true;
  blackCamp.castShadow = true;
  group.add(blackCamp);

  const plinthMat = new THREE.MeshStandardMaterial({
    map: woodTexture('#8a5a32', '#4e3018'),
    roughness: 0.86
  });
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(campW, 0.2, outerZ * 2), plinthMat);
  plinth.position.y = -0.28;
  plinth.receiveShadow = true;
  group.add(plinth);

  const rimMat = new THREE.MeshStandardMaterial({ color: 0x4a2c18, roughness: 0.9 });
  const rimT = 0.28;
  const rimH = 0.16;
  const spanX = campW + rimT;
  const spanZ = outerZ * 2 + rimT;
  const rimY = -0.02;
  for (const [w, d, x, z] of [
    [spanX + rimT, rimT, 0, spanZ / 2],
    [spanX + rimT, rimT, 0, -spanZ / 2],
    [rimT, spanZ, spanX / 2, 0],
    [rimT, spanZ, -spanX / 2, 0]
  ]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, rimH, d), rimMat);
    bar.position.set(x, rimY, z);
    bar.receiveShadow = true;
    group.add(bar);
  }

  const waterMat = makeWaterMaterial();
  const water = new THREE.Mesh(new THREE.PlaneGeometry(campW + 0.2, 0.96), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.12;
  water.renderOrder = 1;
  group.add(noRaycast(water));
  group.userData.waterMat = waterMat;

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x6a675f, roughness: 0.92 });
  for (const z of [0.46, -0.46]) {
    const lip = new THREE.Mesh(new THREE.BoxGeometry(campW, 0.16, 0.1), stoneMat);
    lip.position.set(0, -0.1, z);
    lip.receiveShadow = true;
    group.add(lip);
  }

  const bridgeMat = new THREE.MeshStandardMaterial({
    map: woodTexture('#c9a06a', '#7a5330'),
    roughness: 0.7
  });
  for (const x of [-HALF_X, HALF_X]) {
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 1), bridgeMat);
    bridge.position.set(x, -0.02, 0);
    bridge.castShadow = true;
    bridge.receiveShadow = true;
    group.add(bridge);
  }

  const stoneSide = new THREE.MeshStandardMaterial({ color: 0x4c514c, roughness: 0.88 });
  const stoneTop = new THREE.MeshStandardMaterial({ color: 0x5c615c, roughness: 0.8 });
  for (const [label, x] of [['楚河', -2.5], ['漢界', 2.5]]) {
    const face = new THREE.MeshStandardMaterial({
      map: steleTexture(label), roughness: 0.6
    });
    const stele = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.48, 0.12), [
      stoneSide, stoneSide, stoneTop, stoneSide, face, stoneSide
    ]);
    stele.position.set(x, 0.06, 0);
    stele.castShadow = true;
    group.add(noRaycast(stele));
  }

  const ink = new THREE.MeshStandardMaterial({ color: 0x241407, roughness: 0.7 });
  const segs = [];
  for (let y = 0; y <= 4; y++) {
    const z = HALF_Z - y;
    pushSegment(segs, -HALF_X, z, HALF_X, z, 0.035);
  }
  for (let y = 5; y <= 9; y++) {
    const z = HALF_Z - y;
    pushSegment(segs, -HALF_X, z, HALF_X, z, 0.035);
  }
  for (let x = 0; x < FILES; x++) {
    const wx = (x - HALF_X) * CELL;
    pushSegment(segs, wx, 0.5, wx, HALF_Z, 0.03);
    pushSegment(segs, wx, -HALF_Z, wx, -0.5, 0.03);
  }
  // Palace diagonals. Red palace ranks 0–2, black 7–9, files 3–5.
  const palace = [
    [3, 0, 5, 2], [5, 0, 3, 2],
    [3, 7, 5, 9], [5, 7, 3, 9]
  ];
  for (const [x0, y0, x1, y1] of palace) {
    const a = gridToWorld(x0, y0);
    const b = gridToWorld(x1, y1);
    pushSegment(segs, a.x, a.z, b.x, b.z, 0.028);
  }
  const lines = new THREE.Mesh(mergeGeometries(segs, false), ink);
  lines.receiveShadow = true;
  group.add(lines);
  for (const g of segs) g.dispose();

  const starGeom = mergeGeometries([
    new THREE.BoxGeometry(0.16, 0.02, 0.035),
    new THREE.BoxGeometry(0.035, 0.02, 0.16)
  ], false);
  const stars = new THREE.InstancedMesh(starGeom, ink, 14);
  const starPts = [
    [1, 2], [7, 2], [1, 7], [7, 7],
    [0, 3], [2, 3], [4, 3], [6, 3], [8, 3],
    [0, 6], [2, 6], [4, 6], [6, 6], [8, 6]
  ];
  const dummy = new THREE.Object3D();
  starPts.forEach(([sx, sy], i) => {
    const p = gridToWorld(sx, sy, 0.02);
    dummy.position.copy(p);
    dummy.updateMatrix();
    stars.setMatrixAt(i, dummy.matrix);
  });
  stars.instanceMatrix.needsUpdate = true;
  group.add(stars);

  // Warm tiled floor and an open-sided living room around the tea table.
  const groundY = -18;
  const pavement = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ map: stoneTexture(), roughness: 0.9, metalness: 0 })
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
