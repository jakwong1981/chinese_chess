// Traditional beveled wooden discs with UV wood grain and engraved-style glyphs.
// Red faces world −Z; Black faces world +Z.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLYPHS, RED, BLACK } from '../../shared/rules.js';

export const PIECE_RADIUS = 0.4;
export const PIECE_BASE_Y = 0;
export const PIECE_HEIGHT = 0.18;

const geomCache = new Map();
const materialCache = new Map();

/** Yaw that points local −Z along the world XZ direction (dirX, dirZ). */
export function yawFacing(dirX, dirZ) {
  return Math.atan2(-dirX, -dirZ);
}

function buildGeometry() {
  const profile = [
    [0, 0], [0.34, 0], [0.38, 0.012], [0.4, 0.045],
    [0.4, 0.13], [0.38, 0.164], [0.35, 0.18], [0, 0.18]
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.LatheGeometry(profile, 48);
  body.clearGroups();
  const glyph = new THREE.CircleGeometry(0.35, 48);
  glyph.rotateX(-Math.PI / 2);
  glyph.translate(0, 0.182, 0);
  glyph.clearGroups();
  const merged = mergeGeometries([body, glyph], true);
  body.dispose();
  glyph.dispose();
  return merged;
}

function geometryFor(type) {
  let g = geomCache.get(type);
  if (!g) {
    g = buildGeometry();
    geomCache.set(type, g);
  }
  return g;
}

function drawWoodGrain(ctx, size, light, dark) {
  const base = ctx.createLinearGradient(0, 0, size, size);
  base.addColorStop(0, light);
  base.addColorStop(0.55, dark);
  base.addColorStop(1, light);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 90; i++) {
    const y = i * size / 90;
    ctx.strokeStyle = i % 3 ? 'rgba(66, 35, 17, 0.13)' : 'rgba(255, 231, 185, 0.16)';
    ctx.lineWidth = 0.7 + (i % 4) * 0.35;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(
      size * 0.25, y + Math.sin(i * 1.7) * 5,
      size * 0.7, y - Math.cos(i * 1.2) * 4,
      size, y + Math.sin(i) * 3
    );
    ctx.stroke();
  }

  for (const [x, y, r] of [[0.24, 0.3, 0.055], [0.72, 0.68, 0.04]]) {
    ctx.strokeStyle = 'rgba(65, 34, 17, 0.16)';
    for (let i = 1; i <= 4; i++) {
      ctx.beginPath();
      ctx.ellipse(x * size, y * size, r * size * i, r * size * i * 0.36, 0.25, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function makeBodyTexture(side) {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  drawWoodGrain(ctx, size, side === RED ? '#aa7048' : '#554638', side === RED ? '#754326' : '#2d251f');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function makePlaqueTexture(side, type) {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  drawWoodGrain(ctx, size, '#ecd09d', '#c79a62');

  const shade = ctx.createRadialGradient(size * 0.42, size * 0.38, 20, size / 2, size / 2, size * 0.5);
  shade.addColorStop(0, 'rgba(255, 244, 211, 0.24)');
  shade.addColorStop(0.75, 'rgba(116, 67, 28, 0.03)');
  shade.addColorStop(1, 'rgba(75, 40, 18, 0.2)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, size, size);

  const ink = side === RED ? '#a42e25' : '#24211e';
  ctx.strokeStyle = ink;
  ctx.lineWidth = 17;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.435, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.355, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = ink;
  ctx.shadowColor = 'rgba(48, 24, 12, 0.32)';
  ctx.shadowOffsetY = 3;
  ctx.shadowBlur = 2;
  ctx.font = `bold ${Math.floor(size * 0.5)}px "Kaiti TC", "KaiTi", "Songti TC", "PMingLiU", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.translate(size / 2, size / 2);
  if (side === BLACK) ctx.rotate(Math.PI);
  ctx.fillText(GLYPHS[side][type], 0, 8);
  ctx.restore();
  ctx.shadowColor = 'transparent';

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function materialsFor(side, type) {
  const key = side + type;
  let pair = materialCache.get(key);
  if (pair) return pair;
  const bodyMap = makeBodyTexture(side);
  const plaqueMap = makePlaqueTexture(side, type);
  pair = [
    new THREE.MeshStandardMaterial({
      map: bodyMap, bumpMap: bodyMap, bumpScale: 0.012, roughness: 0.58, metalness: 0
    }),
    new THREE.MeshStandardMaterial({
      map: plaqueMap, bumpMap: plaqueMap, bumpScale: 0.006,
      roughness: 0.5, metalness: 0, side: THREE.DoubleSide
    })
  ];
  materialCache.set(key, pair);
  return pair;
}

export function createPieceMesh(side, type) {
  const mesh = new THREE.Mesh(geometryFor(type), materialsFor(side, type));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.rotation.y = side === RED ? 0 : Math.PI;
  mesh.userData.piece = { side, type };
  mesh.userData.homeYaw = mesh.rotation.y;
  return mesh;
}

export function createHighlightRing(color = 0xf0b429, radius = PIECE_RADIUS * 1.15) {
  const geom = new THREE.RingGeometry(radius, radius + 0.06, 48);
  geom.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false
  });
  const ring = new THREE.Mesh(geom, mat);
  ring.renderOrder = 2;
  return ring;
}

export function createMoveDot(radius = 0.12, capture = false) {
  const geom = capture
    ? new THREE.RingGeometry(PIECE_RADIUS * 0.9, PIECE_RADIUS * 1.05, 40)
    : new THREE.CircleGeometry(radius, 24);
  geom.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: capture ? 0xe05252 : 0x48c78e,
    transparent: true, opacity: capture ? 0.85 : 0.65,
    depthWrite: false
  });
  const dot = new THREE.Mesh(geom, mat);
  dot.renderOrder = 1;
  return dot;
}

{
  const red = new THREE.Vector3(0, 0, -1).applyQuaternion(
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0))
  );
  const black = new THREE.Vector3(0, 0, -1).applyQuaternion(
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0))
  );
  console.assert(red.z < -0.99 && Math.abs(red.x) < 1e-6, 'red front should be world −Z', red);
  console.assert(black.z > 0.99 && Math.abs(black.x) < 1e-6, 'black front should be world +Z', black);
  console.assert(Math.abs(yawFacing(0, -1)) < 1e-6, 'yawFacing −Z');
  console.assert(Math.abs(yawFacing(0, 1) - Math.PI) < 1e-6, 'yawFacing +Z');
}
