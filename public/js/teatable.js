// Teahouse dressing around the board: round wooden table, yixing teapot, gaiwan,
// porcelain teacup, glass of tea, water bottle, snack plates, bamboo chairs,
// and rising procedural tea steam.
// Static geometries are merged/instanced and textures are cached to minimize draw calls.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { woodTexture } from './board.js';

export const TABLE_TOP_Y = -0.385;
export const FLOOR_Y = -18;
export const TABLE_R = 15;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

const texCache = new Map();
let sharedChairGeom = null;

function silence(root) {
  root.traverse((child) => {
    if (child.isMesh) child.raycast = () => {};
  });
  return root;
}

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75, envMapIntensity: 0.7, ...opts });
}

function porcelainMat(opts = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: PORCELAIN,
    roughness: 0.22,
    metalness: 0.02,
    clearcoat: 0.85,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.0,
    ...opts
  });
}

function bakeGeom(geom, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  geom.applyMatrix4(_m.compose(_p, _q, _s));
  return geom;
}

function mergeList(geoms) {
  const merged = mergeGeometries(geoms, false);
  for (const g of geoms) g.dispose();
  return merged;
}

function place(parent, obj, x, z, yaw = 0, scale = 1) {
  obj.position.x = x;
  obj.position.z = z;
  obj.rotation.y = yaw;
  obj.scale.setScalar(scale);
  parent.add(obj);
  return obj;
}

function cachedTexture(key, builder) {
  let tex = texCache.get(key);
  if (!tex) {
    tex = builder();
    texCache.set(key, tex);
  }
  return tex;
}

function seedPileTexture() {
  return cachedTexture('seedPile', () => {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#38302a';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 170; i++) {
      const x = (i * 53 + 17) % size;
      const y = (i * 97 + 31) % size;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((i * 0.71) % Math.PI);
      ctx.fillStyle = i % 3 ? '#4a4136' : '#65573f';
      ctx.beginPath();
      ctx.ellipse(0, 0, 3.4, 7.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(222, 206, 172, 0.8)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(0, -5.5);
      ctx.lineTo(0, 5.5);
      ctx.stroke();
      ctx.restore();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  });
}

function canvasTexture(size, h, draw) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = h || size;
  draw(c.getContext('2d'), c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function porcelainTexture() {
  return cachedTexture('porcelain', () => canvasTexture(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#f4f1e8';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2b4c9a';
    ctx.fillRect(0, 6, w, 8);
    ctx.fillRect(0, h - 16, w, 6);
    for (let i = 0; i < 8; i++) {
      const x = i * 64 + 32;
      const y = h / 2 + (i % 2 ? 26 : -20);
      for (let p = 0; p < 6; p++) {
        const a = (p / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(x + Math.cos(a) * 13, y + Math.sin(a) * 13, 9, 5, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#f4f1e8';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2b4c9a';
      ctx.strokeStyle = 'rgba(43, 76, 154, 0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 32, h / 2 + 30);
      ctx.quadraticCurveTo(x, h / 2 + 44, x + 32, h / 2 + 30);
      ctx.stroke();
    }
  }));
}

function rindTexture() {
  return cachedTexture('rind', () => canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#4a8a44';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#2c5c2c';
    ctx.lineWidth = 9;
    for (let i = 0; i < 10; i++) {
      const x = i * 26;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + 10, h * 0.3, x - 10, h * 0.7, x + 6, h);
      ctx.stroke();
    }
  }));
}

function fleshTexture() {
  return cachedTexture('flesh', () => canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#d84040';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2c1a14';
    for (let i = 0; i < 22; i++) {
      const x = (i * 53 + 11) % w;
      const y = (i * 89 + 27) % h;
      ctx.beginPath();
      ctx.ellipse(x, y, 2.6, 4.4, i, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(240, 120, 110, 0.35)';
    for (let i = 0; i < 40; i++) {
      ctx.fillRect((i * 71) % w, (i * 37) % h, 5, 2);
    }
  }));
}

function pulpTexture() {
  return cachedTexture('pulp', () => canvasTexture(256, 256, (ctx, w) => {
    const c = w / 2;
    ctx.fillStyle = '#f5b95e';
    ctx.fillRect(0, 0, w, w);
    ctx.strokeStyle = '#e8912a';
    ctx.lineWidth = 5;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.lineTo(c + Math.cos(a) * c, c + Math.sin(a) * c);
      ctx.stroke();
    }
    ctx.strokeStyle = '#f8e8c8';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(c, c, c - 10, 0, Math.PI * 2);
    ctx.stroke();
  }));
}

function bambooTexture() {
  return cachedTexture('bamboo', () => canvasTexture(128, 256, (ctx, w, h) => {
    ctx.fillStyle = '#cb9e5c';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(140, 100, 48, 0.7)';
    for (let y = 32; y < h; y += 64) {
      ctx.fillRect(0, y, w, 5);
      ctx.fillStyle = 'rgba(240, 214, 160, 0.6)';
      ctx.fillRect(0, y + 5, w, 2);
      ctx.fillStyle = 'rgba(140, 100, 48, 0.7)';
    }
    ctx.strokeStyle = 'rgba(120, 84, 38, 0.25)';
    for (let i = 0; i < 14; i++) {
      const x = (i * 19) % w;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 4, h);
      ctx.stroke();
    }
  }));
}

function makeSteamMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    uniforms: {
      uTime: { value: 0 }
    },
    vertexShader: `
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 p = position;
        // Gentle rising sway
        float sway = sin(uTime * 1.4 + uv.y * 4.5 + position.x * 2.0) * 0.08 * uv.y;
        p.x += sway;
        p.z += cos(uTime * 1.1 + uv.y * 3.8) * 0.06 * uv.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        float y = vUv.y;
        float x = (vUv.x - 0.5) * 2.0;
        float wisp1 = sin(x * 3.2 + sin(y * 5.0 - uTime * 1.35) * 1.1) * 0.5 + 0.5;
        float wisp2 = cos(x * 5.0 - uTime * 0.9 + y * 6.5) * 0.5 + 0.5;
        float shape = exp(-x * x * 3.6) * smoothstep(0.0, 0.22, y) * smoothstep(1.0, 0.25, y);
        float alpha = shape * (0.45 * wisp1 + 0.55 * wisp2) * 0.24;
        gl_FragColor = vec4(0.97, 0.98, 1.0, alpha);
      }
    `
  });
}

function makeSteamPlume(steamMat, width = 0.6, height = 1.4) {
  const g = new THREE.Group();
  const planeGeom = new THREE.PlaneGeometry(width, height, 4, 12);
  planeGeom.translate(0, height / 2, 0);
  const p1 = new THREE.Mesh(planeGeom, steamMat);
  const p2 = new THREE.Mesh(planeGeom, steamMat);
  p2.rotation.y = Math.PI / 2;
  p1.renderOrder = 3;
  p2.renderOrder = 3;
  g.add(p1, p2);
  return g;
}

function makeTable() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({
    map: woodTexture('#eccf9e', '#cfa972'), roughness: 0.62, envMapIntensity: 0.65
  });
  const darkWood = mat(0x6b4526, { roughness: 0.78 });

  const topH = 1.0;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(TABLE_R, TABLE_R - 0.12, topH, 48), wood);
  top.position.y = TABLE_TOP_Y - topH / 2;
  top.receiveShadow = true;
  top.castShadow = false;
  g.add(top);

  const edge = new THREE.Mesh(new THREE.TorusGeometry(TABLE_R - 0.06, 0.18, 10, 48), darkWood);
  edge.rotation.x = Math.PI / 2;
  edge.position.y = TABLE_TOP_Y - topH / 2;
  g.add(edge);

  const pedH = TABLE_TOP_Y - topH - FLOOR_Y;
  const legGeoms = [];
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    legGeoms.push(bakeGeom(
      new THREE.CylinderGeometry(0.55, 0.75, pedH, 12),
      sx * 8.0, FLOOR_Y + pedH / 2, sz * 8.0,
      -sz * 0.12, 0, sx * 0.12
    ));
  }
  const legs = new THREE.Mesh(mergeList(legGeoms), wood);
  legs.receiveShadow = true;
  legs.castShadow = false;
  g.add(legs);
  return g;
}

function makeTeapot(steamMat) {
  const g = new THREE.Group();
  const clay = new THREE.MeshPhysicalMaterial({
    color: 0x6d3a24, roughness: 0.48, metalness: 0.04, clearcoat: 0.2, clearcoatRoughness: 0.35, envMapIntensity: 0.85
  });
  const geoms = [
    bakeGeom(new THREE.SphereGeometry(0.48, 22, 16), 0, 0.36, 0, 0, 0, 0, 1, 0.75, 1),
    bakeGeom(new THREE.CylinderGeometry(0.24, 0.3, 0.08, 18), 0, 0.72, 0),
    bakeGeom(new THREE.SphereGeometry(0.075, 10, 8), 0, 0.79, 0),
    bakeGeom(new THREE.CylinderGeometry(0.06, 0.11, 0.55, 10), -0.52, 0.46, 0, 0, 0, 0.85),
    bakeGeom(new THREE.TorusGeometry(0.27, 0.055, 8, 18, Math.PI), 0.5, 0.42, 0, 0, Math.PI / 2, 0)
  ];
  const mesh = new THREE.Mesh(mergeList(geoms), clay);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);

  if (steamMat) {
    const steam = makeSteamPlume(steamMat, 0.42, 1.15);
    steam.position.set(-0.72, 0.68, 0);
    g.add(steam);
  }
  return g;
}

const PORCELAIN = 0xf4f1e8;
const BLUE = 0x2b4c9a;

function makeGaiwan() {
  const g = new THREE.Group();
  const china = porcelainMat();
  const band = porcelainMat({ color: BLUE, roughness: 0.32 });

  const chinaMesh = new THREE.Mesh(mergeList([
    bakeGeom(new THREE.CylinderGeometry(0.44, 0.28, 0.06, 22), 0, 0.03, 0),
    bakeGeom(new THREE.CylinderGeometry(0.14, 0.36, 0.1, 22), 0, 0.4, 0)
  ]), china);
  const bandMesh = new THREE.Mesh(mergeList([
    bakeGeom(new THREE.TorusGeometry(0.35, 0.018, 8, 22), 0, 0.36, 0, Math.PI / 2, 0, 0),
    bakeGeom(new THREE.CylinderGeometry(0.09, 0.11, 0.05, 14), 0, 0.47, 0)
  ]), band);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.17, 0.3, 22), porcelainMat({
    color: 0xffffff, map: porcelainTexture()
  }));
  bowl.position.y = 0.21;
  g.add(chinaMesh, bandMesh, bowl);
  return g;
}

function makeTeacup(steamMat) {
  const g = new THREE.Group();
  const china = porcelainMat();
  const band = porcelainMat({ color: BLUE, roughness: 0.32 });

  const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.2, 0.05, 22), china);
  saucer.position.y = 0.025;
  const bandMesh = new THREE.Mesh(mergeList([
    bakeGeom(new THREE.TorusGeometry(0.27, 0.014, 8, 22), 0, 0.05, 0, Math.PI / 2, 0, 0),
    bakeGeom(new THREE.TorusGeometry(0.2, 0.014, 8, 20), 0, 0.29, 0, Math.PI / 2, 0, 0)
  ]), band);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.13, 0.24, 20), porcelainMat({
    color: 0xffffff, map: porcelainTexture()
  }));
  cup.position.y = 0.17;
  const tea = new THREE.Mesh(
    new THREE.CircleGeometry(0.17, 18),
    new THREE.MeshPhysicalMaterial({ color: 0xa8641e, roughness: 0.08, clearcoat: 1.0, envMapIntensity: 1.2 })
  );
  tea.rotation.x = -Math.PI / 2;
  tea.position.y = 0.27;
  g.add(saucer, bandMesh, cup, tea);

  if (steamMat) {
    const steam = makeSteamPlume(steamMat, 0.32, 0.9);
    steam.position.set(0, 0.3, 0);
    g.add(steam);
  }
  return g;
}

function makeTeaGlass() {
  const g = new THREE.Group();
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xf2f7f7, transparent: true, opacity: 0.26, roughness: 0.06, clearcoat: 1.0, envMapIntensity: 1.3
  });
  const glassMesh = new THREE.Mesh(mergeList([
    bakeGeom(new THREE.CylinderGeometry(0.28, 0.24, 0.8, 20, 1, true), 0, 0.4, 0),
    bakeGeom(new THREE.CylinderGeometry(0.24, 0.24, 0.04, 20), 0, 0.02, 0)
  ]), glass);
  const tea = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.21, 0.58, 18),
    mat(0xb56a1e, { transparent: true, opacity: 0.9, roughness: 0.18 })
  );
  tea.position.y = 0.33;
  g.add(glassMesh, tea);
  return g;
}

function makeWaterBottle() {
  const g = new THREE.Group();
  const plastic = new THREE.MeshPhysicalMaterial({
    color: 0xdfeaf2, transparent: true, opacity: 0.34, roughness: 0.08, clearcoat: 0.9, envMapIntensity: 1.1
  });
  const bodyMesh = new THREE.Mesh(mergeList([
    bakeGeom(new THREE.CylinderGeometry(0.27, 0.27, 0.95, 18), 0, 0.5, 0),
    bakeGeom(new THREE.CylinderGeometry(0.13, 0.24, 0.18, 14), 0, 1.05, 0)
  ]), plastic);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.12, 14), mat(0x3a6ea5, { roughness: 0.45 }));
  cap.position.y = 1.18;
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.278, 0.278, 0.34, 18), mat(0xeef3f6, { roughness: 0.5 }));
  label.position.y = 0.55;
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.24, 0.85, 14),
    mat(0xcfe4ee, { transparent: true, opacity: 0.5, roughness: 0.1 })
  );
  water.position.y = 0.47;
  g.add(bodyMesh, cap, label, water);
  return g;
}

function makePlate(r) {
  const g = new THREE.Group();
  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r * 0.72, 0.07, 24),
    porcelainMat({ color: 0xf2eee4, roughness: 0.28 })
  );
  plate.position.y = 0.035;
  plate.receiveShadow = true;
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(r - 0.02, 0.022, 8, 24),
    porcelainMat({ color: BLUE, roughness: 0.32 })
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.07;
  g.add(plate, rim);
  return g;
}

function makeSeedBowl() {
  const g = makePlate(0.78);
  const pile = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 0.5, 0.16, 20),
    new THREE.MeshStandardMaterial({ map: seedPileTexture(), roughness: 0.95 })
  );
  pile.position.y = 0.14;
  g.add(pile);
  return g;
}

function makeSeedShells() {
  const g = new THREE.Group();
  const shells = new THREE.InstancedMesh(
    new THREE.CapsuleGeometry(0.028, 0.07, 3, 6),
    mat(0x4a4034, { roughness: 1 }),
    14
  );
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 14; i++) {
    const a = i * 2.4;
    const r = 0.2 + (i % 5) * 0.14;
    dummy.position.set(Math.cos(a) * r, 0.035, Math.sin(a) * r * 0.7);
    dummy.rotation.set(Math.PI / 2, 0, a);
    dummy.updateMatrix();
    shells.setMatrixAt(i, dummy.matrix);
  }
  shells.instanceMatrix.needsUpdate = true;
  g.add(shells);
  return g;
}

function makePeanutPlate() {
  const g = makePlate(0.68);
  const nuts = new THREE.InstancedMesh(
    new THREE.CapsuleGeometry(0.085, 0.15, 4, 8),
    mat(0xc8a15e, { roughness: 0.9 }),
    9
  );
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4;
    const r = i < 3 ? 0.1 : 0.32;
    dummy.position.set(Math.cos(a) * r, 0.16, Math.sin(a) * r);
    dummy.rotation.set(Math.PI / 2, 0, a * 1.3);
    dummy.updateMatrix();
    nuts.setMatrixAt(i, dummy.matrix);
  }
  nuts.instanceMatrix.needsUpdate = true;
  g.add(nuts);
  return g;
}

function makeFruitPlate() {
  const g = makePlate(0.85);
  const rindGeoms = [];
  const fleshGeoms = [];
  for (let i = 0; i < 3; i++) {
    const a = i * 1.35;
    const wx = Math.cos(a) * 0.3;
    const wz = Math.sin(a) * 0.3;
    const ry = a + 2.2;
    rindGeoms.push(bakeGeom(
      new THREE.CylinderGeometry(0.44, 0.44, 0.12, 12, 1, false, 0, 1.0),
      wx, 0.13, wz, 0, ry, 0
    ));
    fleshGeoms.push(bakeGeom(
      new THREE.CylinderGeometry(0.38, 0.38, 0.13, 12, 1, false, 0.05, 0.92),
      wx, 0.138, wz, 0, ry, 0
    ));
  }
  g.add(
    new THREE.Mesh(mergeList(rindGeoms), new THREE.MeshStandardMaterial({ map: rindTexture(), roughness: 0.52 })),
    new THREE.Mesh(mergeList(fleshGeoms), new THREE.MeshStandardMaterial({ map: fleshTexture(), roughness: 0.36 }))
  );

  const sliceGeoms = [];
  const pulpGeoms = [];
  for (let i = 0; i < 3; i++) {
    const sx = -0.3 + i * 0.28;
    const sy = 0.11 + i * 0.075;
    sliceGeoms.push(bakeGeom(new THREE.CylinderGeometry(0.3, 0.3, 0.07, 18), sx, sy, 0.42));
    pulpGeoms.push(bakeGeom(new THREE.CircleGeometry(0.24, 18), sx, sy + 0.037, 0.42, -Math.PI / 2, 0, 0));
  }
  g.add(
    new THREE.Mesh(mergeList(sliceGeoms), mat(0xe8912a, { roughness: 0.45 })),
    new THREE.Mesh(mergeList(pulpGeoms), new THREE.MeshStandardMaterial({ map: pulpTexture(), roughness: 0.48 }))
  );
  return g;
}

function makePastryPlate() {
  const g = makePlate(0.72);
  const cakeGeoms = [[-0.2, -0.1, 0.3], [0.18, -0.22, -0.2]].map(([x, z, yaw]) =>
    bakeGeom(new THREE.BoxGeometry(0.34, 0.17, 0.34), x, 0.16, z, 0, yaw, 0)
  );
  g.add(new THREE.Mesh(mergeList(cakeGeoms), mat(0x9aa860, { roughness: 0.8 })));

  const cookieGeoms = [];
  for (let i = 0; i < 3; i++) {
    cookieGeoms.push(bakeGeom(
      new THREE.CylinderGeometry(0.2, 0.2, 0.09, 14),
      0.12 + (i % 2) * 0.22, 0.12 + i * 0.09, 0.24 - i * 0.12
    ));
  }
  g.add(new THREE.Mesh(mergeList(cookieGeoms), mat(0x9c6b3f, { roughness: 0.85 })));

  const dough = new THREE.Mesh(
    new THREE.TorusGeometry(0.2, 0.065, 12, 24),
    mat(0xc68a50, { roughness: 0.72 })
  );
  dough.rotation.x = Math.PI / 2;
  dough.position.set(-0.25, 0.16, 0.27);
  const chocolate = new THREE.Mesh(
    new THREE.TorusGeometry(0.2, 0.034, 10, 24),
    mat(0x452218, { roughness: 0.28 })
  );
  chocolate.rotation.x = Math.PI / 2;
  chocolate.position.set(-0.25, 0.22, 0.27);
  g.add(dough, chocolate);

  const sprinkles = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.04, 0.012, 0.014),
    mat(0xffffff, { roughness: 0.6 }),
    10
  );
  const colors = [new THREE.Color(0xf3d9a0), new THREE.Color(0xd98991), new THREE.Color(0x8eaf86)];
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 10; i++) {
    const a = i * Math.PI * 0.2;
    dummy.position.set(-0.25 + Math.cos(a) * 0.19, 0.258, 0.27 + Math.sin(a) * 0.19);
    dummy.rotation.set(0, -a, 0);
    dummy.updateMatrix();
    sprinkles.setMatrixAt(i, dummy.matrix);
    sprinkles.setColorAt(i, colors[i % 3]);
  }
  sprinkles.instanceMatrix.needsUpdate = true;
  sprinkles.instanceColor.needsUpdate = true;
  g.add(sprinkles);
  return g;
}

function getChairGeometry() {
  if (sharedChairGeom) return sharedChairGeom;
  const seatY = 0.85;
  const geoms = [];
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    geoms.push(bakeGeom(
      new THREE.CylinderGeometry(0.06, 0.07, seatY, 10),
      sx * 0.42, seatY / 2, sz * 0.42,
      sz * 0.07, 0, -sx * 0.07
    ));
  }
  geoms.push(bakeGeom(new THREE.CylinderGeometry(0.55, 0.5, 0.09, 22), 0, seatY, 0));
  geoms.push(bakeGeom(new THREE.TorusGeometry(0.42, 0.035, 8, 22), 0, 0.35, 0, Math.PI / 2, 0, 0));

  const railR = 0.55;
  const railY = seatY + 0.47;
  geoms.push(bakeGeom(new THREE.TorusGeometry(railR, 0.05, 8, 22, Math.PI), 0, railY, -0.48));
  for (let i = -2; i <= 2; i++) {
    const x = i * 0.2;
    const topY = railY + Math.sqrt(Math.max(0.01, railR * railR - x * x));
    const h = topY - seatY + 0.02;
    geoms.push(bakeGeom(new THREE.CylinderGeometry(0.042, 0.042, h, 8), x, seatY + h / 2, -0.48));
  }
  sharedChairGeom = mergeList(geoms);
  return sharedChairGeom;
}

function makeBambooChair(bambooMat) {
  const mesh = new THREE.Mesh(getChairGeometry(), bambooMat);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

export function tickTeaTable(group, time) {
  const mat = group?.userData?.steamMat;
  if (mat) mat.uniforms.uTime.value = time;
}

export function createTeaTable() {
  const group = new THREE.Group();
  group.name = 'teatable';

  const steamMat = makeSteamMaterial();
  group.userData.steamMat = steamMat;

  group.add(makeTable());

  // Props sit on the broad table ring around the board.
  const castProps = [
    place(group, makeTeapot(steamMat), 8.2, -3.5, 0.6, 2.6),
    place(group, makeGaiwan(), 2.8, -7.3, 0, 2.6),
    place(group, makeTeaGlass(), 7.8, 1.5, 0, 3.0),
    place(group, makePastryPlate(), -6.9, -1.5, 0, 2.6),
    place(group, makeTeacup(steamMat), -4.5, -7.8, 0, 3.0)
  ];
  for (const p of castProps) {
    p.position.y = TABLE_TOP_Y;
    p.traverse((c) => {
      if (c.isMesh && !c.material.transparent) c.castShadow = true;
      if (c.isMesh) c.receiveShadow = true;
    });
  }

  const outerProps = [
    place(group, makeWaterBottle(), 0.5, -12.0, 0, 4.5),
    place(group, makeFruitPlate(), 6.5, -7.5, 0, 2.8),
    place(group, makeSeedBowl(), -1.5, -8.8, 0, 2.8),
    place(group, makeSeedShells(), -3.3, -9.3, 0, 2.8),
    place(group, makePeanutPlate(), -7.5, -5.5, 0, 2.8)
  ];
  for (const p of outerProps) {
    p.position.y = TABLE_TOP_Y;
    p.traverse((c) => {
      if (c.isMesh) {
        c.castShadow = false;
        c.receiveShadow = true;
      }
    });
  }

  const bambooMat = new THREE.MeshStandardMaterial({ map: bambooTexture(), roughness: 0.7, envMapIntensity: 0.5 });
  place(group, makeBambooChair(bambooMat), -19, 0, Math.PI / 2, 12).position.y = FLOOR_Y;
  place(group, makeBambooChair(bambooMat), 19, 0, -Math.PI / 2, 12).position.y = FLOOR_Y;

  return silence(group);
}
