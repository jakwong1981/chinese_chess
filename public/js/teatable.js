// Teahouse dressing around the board, modeled after the reference photo:
// the board rests on a round wooden table with an yixing teapot, gaiwan,
// porcelain teacup, a glass of tea, a water bottle, snack plates (sunflower
// seeds, peanuts, watermelon & orange, pastries) and bamboo chairs in a
// living room.
//
// The tabletop is about 2.7 times the board's longest side. Using a 45 cm
// board as the scale reference gives a 1.2 m table, a 75 cm table height and
// 45 cm chair seats. Four splayed legs reach the floor at FLOOR_Y.

import * as THREE from 'three';
import { woodTexture } from './board.js';

export const TABLE_TOP_Y = -0.385;
export const FLOOR_Y = -18;
export const TABLE_R = 15;

function silence(root) {
  root.traverse((child) => {
    if (child.isMesh) child.raycast = () => {};
  });
  return root;
}

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...opts });
}

function place(parent, obj, x, z, yaw = 0, scale = 1) {
  obj.position.x = x;
  obj.position.z = z;
  obj.rotation.y = yaw;
  obj.scale.setScalar(scale);
  parent.add(obj);
  return obj;
}

function seedPileTexture() {
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
  return canvasTexture(512, 256, (ctx, w, h) => {
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
  });
}

function rindTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
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
  });
}

function fleshTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
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
  });
}

function pulpTexture() {
  return canvasTexture(256, 256, (ctx, w) => {
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
  });
}

function bambooTexture() {
  return canvasTexture(128, 256, (ctx, w, h) => {
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
  });
}

function makeTable() {

  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({
    map: woodTexture('#eccf9e', '#cfa972'), roughness: 0.7
  });
  const darkWood = mat(0x6b4526, { roughness: 0.85 });

  const topH = 1.0;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(TABLE_R, TABLE_R - 0.12, topH, 48), wood);
  top.position.y = TABLE_TOP_Y - topH / 2;
  top.receiveShadow = true;
  top.castShadow = true;
  g.add(top);

  const edge = new THREE.Mesh(new THREE.TorusGeometry(TABLE_R - 0.06, 0.18, 10, 48), darkWood);
  edge.rotation.x = Math.PI / 2;
  edge.position.y = TABLE_TOP_Y - topH / 2;
  g.add(edge);

  const pedH = TABLE_TOP_Y - topH - FLOOR_Y;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, pedH, 12), wood);
    leg.position.set(sx * 8.0, FLOOR_Y + pedH / 2, sz * 8.0);
    leg.rotation.z = sx * 0.12;
    leg.rotation.x = -sz * 0.12;
    leg.castShadow = true;
    leg.receiveShadow = true;
    g.add(leg);
  }
  return g;
}

function makeTeapot() {
  const g = new THREE.Group();
  const clay = mat(0x6d3a24, { roughness: 0.5 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.48, 24, 18), clay);
  body.scale.y = 0.75;
  body.position.y = 0.36;
  g.add(body);

  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.08, 20), clay);
  lid.position.y = 0.72;
  g.add(lid);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), clay);
  knob.position.y = 0.79;
  g.add(knob);

  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.11, 0.55, 12), clay);
  spout.position.set(-0.52, 0.46, 0);
  spout.rotation.z = 0.85;
  g.add(spout);

  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.055, 10, 20, Math.PI), clay);
  handle.rotation.y = Math.PI / 2;
  handle.position.set(0.5, 0.42, 0);
  g.add(handle);
  return g;
}

const PORCELAIN = 0xf4f1e8;
const BLUE = 0x2b4c9a;

function makeGaiwan() {
  const g = new THREE.Group();
  const china = mat(PORCELAIN, { roughness: 0.32 });
  const band = mat(BLUE, { roughness: 0.4 });

  const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.28, 0.06, 24), china);
  saucer.position.y = 0.03;
  g.add(saucer);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.17, 0.3, 24), new THREE.MeshStandardMaterial({
    map: porcelainTexture(), roughness: 0.32
  }));
  bowl.position.y = 0.21;
  g.add(bowl);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.018, 8, 24), band);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.36;
  g.add(rim);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.36, 0.1, 24), china);
  lid.position.y = 0.4;
  g.add(lid);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.05, 16), band);
  knob.position.y = 0.47;
  g.add(knob);
  return g;
}

function makeTeacup() {
  const g = new THREE.Group();
  const china = mat(PORCELAIN, { roughness: 0.32 });
  const band = mat(BLUE, { roughness: 0.4 });

  const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.2, 0.05, 24), china);
  saucer.position.y = 0.025;
  g.add(saucer);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.014, 8, 24), band);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.05;
  g.add(ring);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.13, 0.24, 20), new THREE.MeshStandardMaterial({
    map: porcelainTexture(), roughness: 0.32
  }));
  cup.position.y = 0.17;
  g.add(cup);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.014, 8, 20), band);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.29;
  g.add(rim);
  const tea = new THREE.Mesh(
    new THREE.CircleGeometry(0.17, 20),
    mat(0xa8641e, { roughness: 0.15 })
  );
  tea.rotation.x = -Math.PI / 2;
  tea.position.y = 0.27;
  g.add(tea);
  return g;
}

function makeTeaGlass() {
  const g = new THREE.Group();
  const glass = mat(0xf2f7f7, { transparent: true, opacity: 0.22, roughness: 0.08 });
  const outer = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.8, 20, 1, true), glass);
  outer.position.y = 0.4;
  g.add(outer);
  const bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.04, 20), glass);
  bottom.position.y = 0.02;
  g.add(bottom);
  const tea = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.21, 0.58, 20),
    mat(0xb56a1e, { transparent: true, opacity: 0.92, roughness: 0.25 })
  );
  tea.position.y = 0.33;
  g.add(tea);
  return g;
}

function makeWaterBottle() {
  const g = new THREE.Group();
  const plastic = mat(0xdfeaf2, { transparent: true, opacity: 0.35, roughness: 0.12 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.95, 20), plastic);
  body.position.y = 0.5;
  g.add(body);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.24, 0.18, 16), plastic);
  neck.position.y = 1.05;
  g.add(neck);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.12, 16), mat(0x3a6ea5));
  cap.position.y = 1.18;
  g.add(cap);
  const label = new THREE.Mesh(
    new THREE.CylinderGeometry(0.278, 0.278, 0.34, 20),
    mat(0xeef3f6, { roughness: 0.5 })
  );
  label.position.y = 0.55;
  g.add(label);
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.24, 0.85, 16),
    mat(0xcfe4ee, { transparent: true, opacity: 0.5, roughness: 0.1 })
  );
  water.position.y = 0.47;
  g.add(water);
  return g;
}

function makePlate(r) {
  const g = new THREE.Group();
  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r * 0.72, 0.07, 28),
    mat(0xf2eee4, { roughness: 0.35 })
  );
  plate.position.y = 0.035;
  plate.receiveShadow = true;
  g.add(plate);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r - 0.02, 0.022, 8, 28), mat(BLUE, { roughness: 0.4 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.07;
  g.add(rim);
  return g;
}

function makeSeedBowl() {
  const g = makePlate(0.78);
  const pile = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 0.5, 0.16, 24),
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
  const shell = mat(0xc8a15e, { roughness: 0.9 });
  for (let i = 0; i < 9; i++) {
    const nut = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.15, 4, 10), shell);
    const a = i * 2.4;
    const r = i < 3 ? 0.1 : 0.32;
    nut.position.set(Math.cos(a) * r, 0.16, Math.sin(a) * r);
    nut.rotation.set(Math.PI / 2, 0, a * 1.3);
    g.add(nut);
  }
  return g;
}

function makeFruitPlate() {
  const g = makePlate(0.85);
  for (let i = 0; i < 3; i++) {
    const wedge = new THREE.Group();
    const rind = new THREE.Mesh(
      new THREE.CylinderGeometry(0.44, 0.44, 0.12, 12, 1, false, 0, 1.0),
      new THREE.MeshStandardMaterial({ map: rindTexture(), roughness: 0.55 })
    );
    wedge.add(rind);
    const flesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.38, 0.13, 12, 1, false, 0.05, 0.92),
      new THREE.MeshStandardMaterial({ map: fleshTexture(), roughness: 0.4 })
    );
    flesh.position.y = 0.008;
    wedge.add(flesh);
    const a = i * 1.35;
    wedge.position.set(Math.cos(a) * 0.3, 0.13, Math.sin(a) * 0.3);
    wedge.rotation.y = a + 2.2;
    g.add(wedge);
  }
  for (let i = 0; i < 3; i++) {
    const slice = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 0.07, 20),
      mat(0xe8912a, { roughness: 0.45 })
    );
    slice.position.set(-0.3 + i * 0.28, 0.11 + i * 0.075, 0.42);
    g.add(slice);
    const pulp = new THREE.Mesh(
      new THREE.CircleGeometry(0.24, 20),
      new THREE.MeshStandardMaterial({ map: pulpTexture(), roughness: 0.5 })
    );
    pulp.rotation.x = -Math.PI / 2;
    pulp.position.set(-0.3 + i * 0.28, 0.147 + i * 0.075, 0.42);
    g.add(pulp);
  }
  return g;
}

function makePastryPlate() {
  const g = makePlate(0.72);
  const cakeMat = mat(0x9aa860, { roughness: 0.8 });
  for (const [x, z, yaw] of [[-0.2, -0.1, 0.3], [0.18, -0.22, -0.2]]) {
    const cake = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.17, 0.34), cakeMat);
    cake.position.set(x, 0.16, z);
    cake.rotation.y = yaw;
    g.add(cake);
  }
  const cookieMat = mat(0x9c6b3f, { roughness: 0.85 });
  for (let i = 0; i < 3; i++) {
    const cookie = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.09, 16), cookieMat);
    cookie.position.set(0.12 + (i % 2) * 0.22, 0.12 + i * 0.09, 0.24 - i * 0.12);
    g.add(cookie);
  }

  const dough = new THREE.Mesh(
    new THREE.TorusGeometry(0.2, 0.065, 14, 32),
    mat(0xc68a50, { roughness: 0.72 })
  );
  dough.rotation.x = Math.PI / 2;
  dough.position.set(-0.25, 0.16, 0.27);
  g.add(dough);
  const chocolate = new THREE.Mesh(
    new THREE.TorusGeometry(0.2, 0.034, 12, 32),
    mat(0x452218, { roughness: 0.32 })
  );
  chocolate.rotation.x = Math.PI / 2;
  chocolate.position.set(-0.25, 0.22, 0.27);
  g.add(chocolate);
  const sprinkleMats = [mat(0xf3d9a0), mat(0xd98991), mat(0x8eaf86)];
  for (let i = 0; i < 10; i++) {
    const a = i * Math.PI * 0.2;
    const sprinkle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.012, 0.014), sprinkleMats[i % 3]);
    sprinkle.position.set(-0.25 + Math.cos(a) * 0.19, 0.258, 0.27 + Math.sin(a) * 0.19);
    sprinkle.rotation.y = -a;
    g.add(sprinkle);
  }
  return g;
}

function makeBambooChair() {
  const g = new THREE.Group();
  const bamboo = new THREE.MeshStandardMaterial({ map: bambooTexture(), roughness: 0.7 });
  const seatY = 0.85;

  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, seatY, 10), bamboo);
    leg.position.set(sx * 0.42, seatY / 2, sz * 0.42);
    leg.rotation.z = -sx * 0.07;
    leg.rotation.x = sz * 0.07;
    g.add(leg);
  }
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.5, 0.09, 24), bamboo);
  seat.position.y = seatY;
  g.add(seat);
  const brace = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 8, 24), bamboo);
  brace.rotation.x = Math.PI / 2;
  brace.position.y = 0.35;
  g.add(brace);

  const railR = 0.55;
  const railY = seatY + 0.47;
  const rail = new THREE.Mesh(new THREE.TorusGeometry(railR, 0.05, 8, 24, Math.PI), bamboo);
  rail.position.set(0, railY, -0.48);
  g.add(rail);
  for (let i = -2; i <= 2; i++) {
    const x = i * 0.2;
    const topY = railY + Math.sqrt(Math.max(0.01, railR * railR - x * x));
    const h = topY - seatY + 0.02;
    const slat = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, h, 8), bamboo);
    slat.position.set(x, seatY + h / 2, -0.48);
    g.add(slat);
  }
  return g;
}

export function createTeaTable() {
  const group = new THREE.Group();
  group.name = 'teatable';

  group.add(makeTable());

  // Props sit on the broad table ring around the board (board half-extents
  // are about 5 x 5.5). Red side faces +Z (the default camera).
  place(group, makeTeapot(), 8.2, -3.5, 0.6, 2.6).position.y = TABLE_TOP_Y;
  place(group, makeGaiwan(), 2.8, -7.3, 0, 2.6).position.y = TABLE_TOP_Y;
  place(group, makeWaterBottle(), 0.5, -12.0, 0, 4.5).position.y = TABLE_TOP_Y;
  place(group, makeTeaGlass(), 7.8, 1.5, 0, 3.0).position.y = TABLE_TOP_Y;
  place(group, makeFruitPlate(), 6.5, -7.5, 0, 2.8).position.y = TABLE_TOP_Y;
  place(group, makeSeedBowl(), -1.5, -8.8, 0, 2.8).position.y = TABLE_TOP_Y;
  place(group, makeSeedShells(), -3.3, -9.3, 0, 2.8).position.y = TABLE_TOP_Y;
  place(group, makePastryPlate(), -6.9, -1.5, 0, 2.6).position.y = TABLE_TOP_Y;
  place(group, makePeanutPlate(), -7.5, -5.5, 0, 2.8).position.y = TABLE_TOP_Y;
  place(group, makeTeacup(), -4.5, -7.8, 0, 3.0).position.y = TABLE_TOP_Y;

  // Living-room chairs stand on the tiled floor.
  place(group, makeBambooChair(), -19, 0, Math.PI / 2, 12).position.y = FLOOR_Y;
  place(group, makeBambooChair(), 19, 0, -Math.PI / 2, 12).position.y = FLOOR_Y;

  group.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = !child.material.transparent;
    child.receiveShadow = true;
  });
  return silence(group);
}
