// Traditional beveled wooden discs with lacquered PBR wood grain, recessed engraved glyphs,
// shared geometry/texture caches, and animated shader markers.
// Red faces world −Z; Black faces world +Z.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLYPHS, RED, BLACK } from '../../shared/rules.js';

export const PIECE_RADIUS = 0.4;
export const PIECE_BASE_Y = 0;
export const PIECE_HEIGHT = 0.18;

let sharedPieceGeom = null;
const bodyTextureCache = new Map();
const materialCache = new Map();
const sharedTimeUniform = { value: 0 };

// Shared marker geometries & materials so pooled dots/rings never reallocate GPU buffers.
const ringGeomCache = new Map();
const highlightMatCache = new Map();
let moveDotGeom = null;
let captureRingGeom = null;
let moveDotMat = null;
let captureRingMat = null;

/** Yaw that points local −Z along the world XZ direction (dirX, dirZ). */
export function yawFacing(dirX, dirZ) {
  return Math.atan2(-dirX, -dirZ);
}

function buildGeometry() {
  const profile = [
    [0, 0], [0.34, 0], [0.38, 0.012], [0.4, 0.045],
    [0.4, 0.13], [0.38, 0.164], [0.35, 0.18], [0, 0.18]
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.LatheGeometry(profile, 40);
  body.clearGroups();
  const glyph = new THREE.CircleGeometry(0.35, 40);
  glyph.rotateX(-Math.PI / 2);
  glyph.translate(0, 0.182, 0);
  glyph.clearGroups();
  const merged = mergeGeometries([body, glyph], true);
  body.dispose();
  glyph.dispose();
  return merged;
}

function getSharedPieceGeometry() {
  if (!sharedPieceGeom) sharedPieceGeom = buildGeometry();
  return sharedPieceGeom;
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
    ctx.strokeStyle = i % 3 ? 'rgba(66, 35, 17, 0.14)' : 'rgba(255, 231, 185, 0.17)';
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

function getBodyTexture(side) {
  let tex = bodyTextureCache.get(side);
  if (tex) return tex;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  drawWoodGrain(ctx, size, side === RED ? '#aa6e45' : '#524236', side === RED ? '#6e3d21' : '#28201b');
  tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  bodyTextureCache.set(side, tex);
  return tex;
}

function makePlaqueMaps(side, type) {
  const size = 512;

  // 1. Albedo (color) canvas — warm satin wood with high-contrast legible ink
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = colorCanvas.height = size;
  const ctx = colorCanvas.getContext('2d');
  drawWoodGrain(ctx, size, '#e0bc84', '#bb8a50');

  const shade = ctx.createRadialGradient(size * 0.42, size * 0.38, 20, size / 2, size / 2, size * 0.5);
  shade.addColorStop(0, 'rgba(255, 240, 206, 0.14)');
  shade.addColorStop(0.75, 'rgba(116, 67, 28, 0.04)');
  shade.addColorStop(1, 'rgba(60, 30, 12, 0.26)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, size, size);

  const ink = side === RED ? '#961914' : '#141210';
  const rimHighlight = side === RED ? 'rgba(235, 195, 130, 0.25)' : 'rgba(210, 188, 135, 0.22)';
  const glyphChar = GLYPHS[side][type];
  const fontSpec = `bold ${Math.floor(size * 0.5)}px "Kaiti TC", "KaiTi", "Songti TC", "PMingLiU", serif`;

  const drawEngraving = (c, color, lineScale = 1, offsetY = 0) => {
    c.strokeStyle = color;
    c.lineWidth = 17 * lineScale;
    c.beginPath();
    c.arc(size / 2, size / 2, size * 0.435, 0, Math.PI * 2);
    c.stroke();
    c.lineWidth = 4.5 * lineScale;
    c.beginPath();
    c.arc(size / 2, size / 2, size * 0.355, 0, Math.PI * 2);
    c.stroke();

    c.fillStyle = color;
    c.font = fontSpec;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.save();
    c.translate(size / 2, size / 2);
    if (side === BLACK) c.rotate(Math.PI);
    c.fillText(glyphChar, 0, 8 + offsetY);
    c.restore();
  };

  // Subtle carved bevel highlight then recessed ink fill
  drawEngraving(ctx, rimHighlight, 1.08, -2);
  ctx.shadowColor = 'rgba(42, 18, 8, 0.38)';
  ctx.shadowOffsetY = 3;
  ctx.shadowBlur = 2;
  drawEngraving(ctx, ink, 1.0, 0);
  ctx.shadowColor = 'transparent';

  // 2. Bump & roughness canvas: wood surface is bright/smooth, carved grooves are dark/rough
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d');
  bCtx.fillStyle = '#d8d8d8';
  bCtx.fillRect(0, 0, size, size);
  // Subtle wood fiber height variation
  bCtx.strokeStyle = 'rgba(180, 180, 180, 0.25)';
  bCtx.lineWidth = 1.5;
  for (let i = 0; i < 64; i++) {
    const y = (i / 64) * size;
    bCtx.beginPath();
    bCtx.moveTo(0, y);
    bCtx.bezierCurveTo(size * 0.3, y + 4, size * 0.7, y - 4, size, y + 2);
    bCtx.stroke();
  }
  bCtx.filter = 'blur(1.5px)';
  drawEngraving(bCtx, '#303030', 1.02, 0);
  bCtx.filter = 'none';

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = roughCanvas.height = size;
  const rCtx = roughCanvas.getContext('2d');
  // Satin wood face (~0.62 roughness so no blinding glare), carved groove (~0.92 matte)
  rCtx.fillStyle = '#9e9e9e';
  rCtx.fillRect(0, 0, size, size);
  drawEngraving(rCtx, '#eaeaea', 1.0, 0);

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.anisotropy = 4;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.anisotropy = 4;

  return { map, bumpMap, roughnessMap };
}

function materialsFor(side, type) {
  const key = side + type;
  let pair = materialCache.get(key);
  if (pair) return pair;
  const bodyMap = getBodyTexture(side);
  const { map: plaqueMap, bumpMap, roughnessMap } = makePlaqueMaps(side, type);
  pair = [
    new THREE.MeshPhysicalMaterial({
      map: bodyMap,
      bumpMap: bodyMap,
      bumpScale: 0.01,
      roughness: 0.58,
      metalness: 0.0,
      clearcoat: 0.22,
      clearcoatRoughness: 0.42,
      envMapIntensity: 0.45
    }),
    new THREE.MeshPhysicalMaterial({
      map: plaqueMap,
      bumpMap,
      bumpScale: 0.016,
      roughnessMap,
      roughness: 0.92,
      metalness: 0.0,
      clearcoat: 0.14,
      clearcoatRoughness: 0.55,
      envMapIntensity: 0.32,
      side: THREE.DoubleSide
    })
  ];
  materialCache.set(key, pair);
  return pair;
}

export function createPieceMesh(side, type) {
  const mesh = new THREE.Mesh(getSharedPieceGeometry(), materialsFor(side, type));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.rotation.y = side === RED ? 0 : Math.PI;
  mesh.userData.piece = { side, type };
  mesh.userData.homeYaw = mesh.rotation.y;
  return mesh;
}

function makePulseRingMaterial(color, mode = 0) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    uniforms: {
      uTime: sharedTimeUniform,
      uColor: { value: new THREE.Color(color) },
      uMode: { value: mode } // 0 = breathing highlight, 1 = quiet move dot, 2 = rotating capture target
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
      uniform float uMode;
      varying vec2 vUv;
      void main() {
        vec2 centered = vUv * 2.0 - 1.0;
        float r = length(centered);
        float angle = atan(centered.y, centered.x);
        if (uMode < 0.5) {
          float pulse = 0.82 + 0.22 * sin(uTime * 4.2);
          float shimmer = 0.88 + 0.12 * sin(angle * 4.0 - uTime * 3.0);
          float alpha = pulse * shimmer * 0.92;
          gl_FragColor = vec4(uColor * (1.15 * pulse), alpha);
        } else if (uMode < 1.5) {
          float pulse = 0.75 + 0.25 * sin(uTime * 3.6);
          float soft = smoothstep(1.0, 0.25, r);
          float core = smoothstep(0.65, 0.1, r);
          float alpha = soft * (0.55 + 0.3 * pulse);
          gl_FragColor = vec4(uColor * (1.05 + 0.35 * core), alpha);
        } else {
          float spin = sin(angle * 4.0 + uTime * 4.5) * 0.5 + 0.5;
          float pulse = 0.8 + 0.2 * sin(uTime * 5.0);
          float alpha = (0.55 + 0.45 * spin) * pulse;
          gl_FragColor = vec4(uColor * 1.25, alpha);
        }
      }
    `
  });
}

export function tickMarkers(time) {
  sharedTimeUniform.value = time;
}

export function createHighlightRing(color = 0xf0b429, radius = PIECE_RADIUS * 1.15) {
  const key = radius.toFixed(3);
  let geom = ringGeomCache.get(key);
  if (!geom) {
    geom = new THREE.RingGeometry(radius, radius + 0.065, 40);
    geom.rotateX(-Math.PI / 2);
    ringGeomCache.set(key, geom);
  }
  const colorKey = typeof color === 'number' ? color : new THREE.Color(color).getHex();
  let mat = highlightMatCache.get(colorKey);
  if (!mat) {
    mat = makePulseRingMaterial(colorKey, 0);
    highlightMatCache.set(colorKey, mat);
  }
  const ring = new THREE.Mesh(geom, mat);
  ring.renderOrder = 2;
  return ring;
}

export function createMoveDot(radius = 0.14, capture = false) {
  if (capture) {
    if (!captureRingGeom) {
      captureRingGeom = new THREE.RingGeometry(PIECE_RADIUS * 0.88, PIECE_RADIUS * 1.07, 36);
      captureRingGeom.rotateX(-Math.PI / 2);
    }
    if (!captureRingMat) captureRingMat = makePulseRingMaterial(0xff5a5a, 2);
    const dot = new THREE.Mesh(captureRingGeom, captureRingMat);
    dot.renderOrder = 2;
    return dot;
  }
  if (!moveDotGeom) {
    moveDotGeom = new THREE.CircleGeometry(radius, 24);
    moveDotGeom.rotateX(-Math.PI / 2);
  }
  if (!moveDotMat) moveDotMat = makePulseRingMaterial(0x52e0a2, 1);
  const dot = new THREE.Mesh(moveDotGeom, moveDotMat);
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
