// Flat cylindrical tokens with Chinese-character canvas textures on top.
// Red pieces: ivory disc with red glyph and red rim.
// Black pieces: ivory disc with black glyph and dark rim.

import * as THREE from 'three';
import { GLYPHS, RED, BLACK } from '../../shared/rules.js';

export const PIECE_RADIUS = 0.42;
export const PIECE_HEIGHT = 0.18;

const textureCache = new Map();

function makeFaceTexture(side, type) {
  const key = `${side}${type}`;
  if (textureCache.has(key)) return textureCache.get(key);
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Ivory background with subtle radial gradient
  const grad = ctx.createRadialGradient(size/2, size/2, size*0.15, size/2, size/2, size*0.5);
  grad.addColorStop(0, '#f6e7c6');
  grad.addColorStop(0.75, '#e6d2a8');
  grad.addColorStop(1, '#c9b184');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/2 - 2, 0, Math.PI*2);
  ctx.fill();

  // Rim ring
  const rimColor = side === RED ? '#b8342c' : '#2a2a2a';
  ctx.strokeStyle = rimColor;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/2 - 12, 0, Math.PI*2);
  ctx.stroke();

  // Inner ring
  ctx.strokeStyle = rimColor;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/2 - 26, 0, Math.PI*2);
  ctx.stroke();

  // Character
  const glyph = GLYPHS[side][type];
  ctx.fillStyle = rimColor;
  ctx.font = `bold ${Math.floor(size * 0.55)}px "PingFang TC", "Microsoft JhengHei", "Noto Serif TC", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Slight shadow for depth
  ctx.shadowColor = 'rgba(0,0,0,.3)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 2;
  ctx.fillText(glyph, size/2, size/2 + 6);
  ctx.shadowColor = 'transparent';

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(key, tex);
  return tex;
}

function makeSideTexture(side) {
  const key = `side-${side}`;
  if (textureCache.has(key)) return textureCache.get(key);
  const w = 128, h = 32;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#8a6f4a');
  grad.addColorStop(0.5, '#6a5238');
  grad.addColorStop(1, '#3e2f20');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  // Accent stripe
  ctx.fillStyle = side === RED ? 'rgba(184,52,44,.9)' : 'rgba(40,40,40,.9)';
  ctx.fillRect(0, h*0.35, w, h*0.3);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(key, tex);
  return tex;
}

const geometryCache = new Map();
function pieceGeometry() {
  if (geometryCache.has('disc')) return geometryCache.get('disc');
  const g = new THREE.CylinderGeometry(PIECE_RADIUS, PIECE_RADIUS * 0.94, PIECE_HEIGHT, 48, 1);
  // Rotate UVs? Three's CylinderGeometry already produces 3 material groups: side, top, bottom.
  geometryCache.set('disc', g);
  return g;
}

export function createPieceMesh(side, type) {
  const geom = pieceGeometry();
  const sideTex = makeSideTexture(side);
  const faceTex = makeFaceTexture(side, type);
  const materials = [
    new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.75, metalness: 0.05 }),
    new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.55, metalness: 0.05 }),
    new THREE.MeshStandardMaterial({ color: 0x2a1e12, roughness: 0.85 })
  ];
  const mesh = new THREE.Mesh(geom, materials);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  mesh.userData.piece = { side, type };
  return mesh;
}

// Highlight ring shown beneath the selected / hinted / last-move pieces.
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

// Square marker used to indicate legal move destinations.
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
