// 3D board: wooden slab + a flat decal plane carrying the printed grid, palaces, river and
// the 楚河漢界 calligraphy. Using a separate PlaneGeometry (instead of a BoxGeometry top face)
// gives deterministic UVs so the drawing always lands in the correct orientation.
//
// Grid coordinates: x ∈ [0..8] left→right (files), y ∈ [0..9] bottom→top (ranks).
// World space: board laid on the XZ plane, y-up. Board-X → world X; board-Y → world -Z
// (so Red at y=0 sits at +Z, nearest the default camera).

import * as THREE from 'three';
import { FILES, RANKS } from '../../shared/rules.js';

export const CELL = 1.0;                    // one grid cell = 1 world unit
export const BOARD_W = (FILES - 1) * CELL;  // 8
export const BOARD_H = (RANKS - 1) * CELL;  // 9
export const PAD = 0.7;                     // wooden margin around the grid
export const BOARD_Y = 0;                   // top surface y

// Board (x,y) → world (X,Y,Z).
export function gridToWorld(x, y, yOffset = 0) {
  return new THREE.Vector3(
    (x - (FILES - 1) / 2) * CELL,
    yOffset,
    ((RANKS - 1) / 2 - y) * CELL
  );
}

// Inverse of gridToWorld for hit-testing on the plane y=BOARD_Y.
export function worldToGrid(v3) {
  const x = Math.round(v3.x / CELL + (FILES - 1) / 2);
  const y = Math.round((RANKS - 1) / 2 - v3.z / CELL);
  return { x, y };
}

const INK = '#241407';        // grid line / calligraphy ink
const INK_SOFT = 'rgba(36,20,7,.85)';

function paintWood(ctx, w, h) {
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#e8c088');
  grad.addColorStop(0.45, '#dcae72');
  grad.addColorStop(0.75, '#cf9c5e');
  grad.addColorStop(1, '#bd884c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Subtle grain streaks
  ctx.globalAlpha = 0.12;
  for (let i = 0; i < 220; i++) {
    ctx.strokeStyle = i % 2 ? '#8a5a2c' : '#ffe0b0';
    ctx.lineWidth = Math.random() * 1.6 + 0.3;
    ctx.beginPath();
    const y0 = Math.random() * h;
    ctx.moveTo(0, y0);
    ctx.bezierCurveTo(w * 0.33, y0 + (Math.random() - 0.5) * 22,
                      w * 0.66, y0 + (Math.random() - 0.5) * 22,
                      w, y0 + (Math.random() - 0.5) * 14);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawStar(ctx, cx, cy, r, fileX) {
  // Four corner brackets around an intersection; omit brackets that would fall off the board.
  const dirs = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  ctx.strokeStyle = INK;
  for (const [dx, dy] of dirs) {
    if (fileX === 0 && dx < 0) continue;
    if (fileX === FILES - 1 && dx > 0) continue;
    ctx.beginPath();
    ctx.moveTo(cx + dx * r, cy + dy * r * 0.4);
    ctx.lineTo(cx + dx * r, cy + dy * r);
    ctx.lineTo(cx + dx * r * 0.4, cy + dy * r);
    ctx.stroke();
  }
}

function makeBoardTexture() {
  const w = 1400;
  const scale = w / (BOARD_W + PAD * 2);
  const h = Math.round((BOARD_H + PAD * 2) * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');

  paintWood(ctx, w, h);

  const ox = PAD * scale;
  const oy = PAD * scale;
  const cs = CELL * scale;
  // Board (x,y) → canvas (px,py). Canvas y=0 is the TOP of the image = board rank 9 (Black side).
  const toPx = (x, y) => [ox + x * cs, oy + (RANKS - 1 - y) * cs];

  // ---- River band (between rank 4 and rank 5): water tint + 楚河漢界 ----
  const [, riverTop] = toPx(0, 5);
  const [, riverBottom] = toPx(0, 4);
  const riverH = riverBottom - riverTop;
  const water = ctx.createLinearGradient(0, riverTop, 0, riverBottom);
  water.addColorStop(0, 'rgba(90,150,170,.30)');
  water.addColorStop(0.5, 'rgba(120,180,200,.42)');
  water.addColorStop(1, 'rgba(90,150,170,.30)');
  ctx.fillStyle = water;
  ctx.fillRect(ox, riverTop, (FILES - 1) * cs, riverH);

  // Faint wave lines inside the river
  ctx.strokeStyle = 'rgba(255,255,255,.35)';
  ctx.lineWidth = Math.max(1, scale * 0.012);
  for (let k = 0; k < 3; k++) {
    const yy = riverTop + riverH * (0.3 + k * 0.2);
    ctx.beginPath();
    for (let px = ox; px <= ox + (FILES - 1) * cs; px += 6) {
      const wy = yy + Math.sin(px / 26 + k) * 3;
      px === ox ? ctx.moveTo(px, wy) : ctx.lineTo(px, wy);
    }
    ctx.stroke();
  }

  // 楚河 (left) and 漢界 (right) calligraphy
  ctx.fillStyle = INK_SOFT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const riverMidY = (riverTop + riverBottom) / 2;
  const fontPx = Math.floor(riverH * 0.62);
  ctx.font = `bold ${fontPx}px "Kaiti TC", "KaiTi", "PingFang TC", "Microsoft JhengHei", serif`;
  ctx.save();
  // Left half: 楚 河 ; right half: 漢 界
  ctx.fillText('楚 河', ox + cs * 2.0, riverMidY);
  ctx.fillText('漢 界', ox + cs * 6.0, riverMidY);
  ctx.restore();

  // ---- Grid lines ----
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(2.5, scale * 0.028);
  ctx.lineCap = 'round';

  // Ranks: all 10 horizontal lines.
  for (let y = 0; y < RANKS; y++) {
    const [x0p, yp] = toPx(0, y);
    const [x1p] = toPx(FILES - 1, y);
    ctx.beginPath(); ctx.moveTo(x0p, yp); ctx.lineTo(x1p, yp); ctx.stroke();
  }
  // Files: edge files span full height; interior files stop at the river.
  for (let x = 0; x < FILES; x++) {
    if (x === 0 || x === FILES - 1) {
      const [px, py0] = toPx(x, 0);
      const [, py1] = toPx(x, RANKS - 1);
      ctx.beginPath(); ctx.moveTo(px, py0); ctx.lineTo(px, py1); ctx.stroke();
    } else {
      const [px, py0] = toPx(x, 0);
      const [, py4] = toPx(x, 4);
      const [, py5] = toPx(x, 5);
      const [, py9] = toPx(x, 9);
      ctx.beginPath(); ctx.moveTo(px, py0); ctx.lineTo(px, py4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px, py5); ctx.lineTo(px, py9); ctx.stroke();
    }
  }

  // Outer border (double line) around the whole grid
  const [bx0, by0] = toPx(0, 0);
  const [bx1, by1] = toPx(FILES - 1, RANKS - 1);
  ctx.lineWidth = Math.max(3, scale * 0.035);
  ctx.strokeRect(bx0, by1, bx1 - bx0, by0 - by1);
  ctx.lineWidth = Math.max(1.5, scale * 0.015);
  const inset = scale * 0.09;
  ctx.strokeRect(bx0 - inset, by1 - inset, (bx1 - bx0) + inset * 2, (by0 - by1) + inset * 2);

  // ---- Palace diagonals ----
  ctx.lineWidth = Math.max(2.5, scale * 0.028);
  const palaces = [
    { x0: 3, y0: 0, x1: 5, y1: 2 },  // Red
    { x0: 3, y0: 7, x1: 5, y1: 9 }   // Black
  ];
  for (const p of palaces) {
    const [ax, ay] = toPx(p.x0, p.y0);
    const [bx, by] = toPx(p.x1, p.y1);
    const [cx, cy] = toPx(p.x1, p.y0);
    const [dx, dy] = toPx(p.x0, p.y1);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(dx, dy); ctx.stroke();
  }

  // ---- Star points (cannon + soldier starting squares) ----
  ctx.lineWidth = Math.max(2, scale * 0.02);
  const stars = [
    [1, 2], [7, 2], [1, 7], [7, 7],
    [0, 3], [2, 3], [4, 3], [6, 3], [8, 3],
    [0, 6], [2, 6], [4, 6], [6, 6], [8, 6]
  ];
  for (const [sx, sy] of stars) drawStar(ctx, ...toPx(sx, sy), cs * 0.16, sx);

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createBoardGroup() {
  const group = new THREE.Group();
  group.name = 'board';

  const totalW = BOARD_W + PAD * 2;
  const totalD = BOARD_H + PAD * 2;
  const thickness = 0.24;

  // Wooden slab (plain wood on all faces; the printed decal sits on top).
  const slabGeom = new THREE.BoxGeometry(totalW, thickness, totalD);
  const woodMat = new THREE.MeshStandardMaterial({ color: 0xa9793f, roughness: 0.8 });
  const slab = new THREE.Mesh(slabGeom, woodMat);
  slab.position.set(0, BOARD_Y - thickness / 2, 0);
  slab.receiveShadow = true;
  group.add(slab);

  // Printed decal (grid + river + palaces + stars) lying flat just above the slab top.
  const decalGeom = new THREE.PlaneGeometry(totalW, totalD);
  decalGeom.rotateX(-Math.PI / 2);
  const decalMat = new THREE.MeshStandardMaterial({
    map: makeBoardTexture(),
    roughness: 0.62,
    metalness: 0.0,
    transparent: false
  });
  const decal = new THREE.Mesh(decalGeom, decalMat);
  decal.position.set(0, BOARD_Y + 0.004, 0);
  decal.receiveShadow = true;
  group.add(decal);

  // Invisible plane exactly at y=BOARD_Y for reliable raycast hit-testing.
  const hitGeom = new THREE.PlaneGeometry(totalW, totalD);
  hitGeom.rotateX(-Math.PI / 2);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const hit = new THREE.Mesh(hitGeom, hitMat);
  hit.position.y = BOARD_Y + 0.001;
  hit.name = 'hitPlane';
  group.add(hit);

  // Outer rim / bezel
  const rimGeom = new THREE.BoxGeometry(totalW + 0.22, thickness + 0.12, totalD + 0.22);
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.9 });
  const rim = new THREE.Mesh(rimGeom, rimMat);
  rim.position.set(0, BOARD_Y - thickness / 2 - 0.06, 0);
  rim.receiveShadow = true;
  group.add(rim);

  return group;
}
