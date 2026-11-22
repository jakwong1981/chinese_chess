// Hong Kong nostalgic living-room snack props placed beside the 3D Xiangqi board:
//   1. 陽光檸檬茶 (Yeung Kwong 250mL Lemon Tea carton with bent white straw)
//   2. 卡樂B 燒烤味薯片 (Calbee BBQ Potato Chips puffed foil pillow-pack)
//   3. 金莎朱古力 (Ferrero Rocher 16-piece clear crystal gift box)

import * as THREE from 'three';

const snackTexCache = new Map();

function cached(key, fn) {
  let v = snackTexCache.get(key);
  if (!v) { v = fn(); snackTexCache.set(key, v); }
  return v;
}

function makeCanvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function drawLemonSlice(ctx, cx, cy, r) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = '#ffd52e';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff9d6';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.88, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffcb1f';
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * Math.PI * 2 + 0.08;
    const a1 = ((i + 1) / 8) * Math.PI * 2 - 0.08;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r * 0.80, a0, a1);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// ===========================================================================
// 1. 陽光檸檬茶 (250mL Tetra Pak carton + bent white straw)
// ===========================================================================
function yeungKwongFrontTex() {
  return cached('yk_front', () => makeCanvasTex(512, 768, (ctx, w, h) => {
    // Classic green upper half + green/yellow/amber horizontal stripes
    ctx.fillStyle = '#1b6e33';
    ctx.fillRect(0, 0, w, h);

    const stripes = [
      [0.44, 0.04, '#e9d64a'],
      [0.52, 0.045, '#e8be3a'],
      [0.61, 0.055, '#dfa12a'],
      [0.71, 0.065, '#d68f22'],
      [0.82, 0.065, '#e4ba3c'],
      [0.92, 0.08, '#efe05e']
    ];
    for (const [y, sh, col] of stripes) {
      ctx.fillStyle = col;
      ctx.fillRect(0, h * y, w, h * sh);
    }

    // Iconic retro white 陽光 typography
    ctx.fillStyle = '#f8f9f4';
    ctx.font = '900 154px "PingFang TC", "Heiti TC", "Microsoft JhengHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('陽光', w * 0.48, h * 0.21);

    // Signature concentric sun-swirl under 光
    ctx.strokeStyle = '#f8f9f4';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(w * 0.78, h * 0.29, 34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(w * 0.78, h * 0.29, 17, 0, Math.PI * 2);
    ctx.stroke();

    // Subtitle
    ctx.fillStyle = '#f3e366';
    ctx.font = '700 44px "PingFang TC", "Microsoft JhengHei", sans-serif';
    ctx.fillText('檸檬茶', w * 0.5, h * 0.36);
    ctx.font = '700 26px sans-serif';
    ctx.fillText('LEMON TEA', w * 0.5, h * 0.41);

    // Golden tea splash halo behind lemon slices
    const splash = ctx.createRadialGradient(w * 0.52, h * 0.68, 20, w * 0.52, h * 0.68, 195);
    splash.addColorStop(0, 'rgba(255, 200, 60, 0.85)');
    splash.addColorStop(0.7, 'rgba(205, 118, 20, 0.45)');
    splash.addColorStop(1, 'rgba(205, 118, 20, 0)');
    ctx.fillStyle = splash;
    ctx.fillRect(0, h * 0.44, w, h * 0.52);

    // Three juicy lemon slices
    drawLemonSlice(ctx, w * 0.36, h * 0.57, 88);
    drawLemonSlice(ctx, w * 0.56, h * 0.68, 102);
    drawLemonSlice(ctx, w * 0.64, h * 0.83, 82);

    // 250mL badge
    ctx.fillStyle = '#144d24';
    ctx.font = '700 26px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('250mL', 28, h - 28);
  }));
}

function yeungKwongBackTex() {
  return cached('yk_back', () => makeCanvasTex(512, 768, (ctx, w, h) => {
    ctx.fillStyle = '#1b6e33';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 ? '#dfa12a' : '#e9d64a';
      ctx.fillRect(0, h * (0.45 + i * 0.095), w, h * 0.05);
    }
    // Center vertical carton fold line
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fillRect(w * 0.49, 0, 6, h);

    // Silver foil straw punch hole
    const hole = ctx.createRadialGradient(w * 0.26, h * 0.23, 4, w * 0.26, h * 0.23, 34);
    hole.addColorStop(0, '#eef3f5');
    hole.addColorStop(0.7, '#9ba6ac');
    hole.addColorStop(1, '#586166');
    ctx.fillStyle = hole;
    ctx.beginPath();
    ctx.arc(w * 0.26, h * 0.23, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8f5e9';
    ctx.font = '700 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('INSERT STRAW', w * 0.26, h * 0.30);

    // Small logo + nutrition box on right half
    ctx.fillStyle = '#f8f9f4';
    ctx.font = '900 58px "PingFang TC", sans-serif';
    ctx.fillText('陽光', w * 0.74, h * 0.24);
    ctx.fillStyle = '#fffdf0';
    ctx.fillRect(w * 0.54, h * 0.34, w * 0.41, h * 0.34);
    ctx.strokeStyle = '#1b6e33';
    ctx.lineWidth = 4;
    ctx.strokeRect(w * 0.54, h * 0.34, w * 0.41, h * 0.34);
    ctx.fillStyle = '#1a241d';
    ctx.font = '700 20px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Nutrition Facts', w * 0.56, h * 0.38);
    ctx.fillStyle = '#556058';
    for (let r = 0; r < 8; r++) {
      ctx.fillRect(w * 0.56, h * (0.41 + r * 0.03), w * 0.36, 4);
    }
  }));
}

function yeungKwongSideTex() {
  return cached('yk_side', () => makeCanvasTex(256, 768, (ctx, w, h) => {
    ctx.fillStyle = '#e8d752';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1b6e33';
    ctx.fillRect(0, 0, w, h * 0.14);
    // White barcode panel
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(w * 0.14, h * 0.62, w * 0.72, h * 0.24);
    ctx.fillStyle = '#111111';
    for (let x = 0; x < 28; x++) {
      const bw = (x * 7) % 3 === 0 ? 4 : 2;
      ctx.fillRect(w * 0.19 + x * 6, h * 0.65, bw, h * 0.17);
    }
    // Ingredients block
    ctx.fillStyle = '#2c3d28';
    for (let r = 0; r < 14; r++) {
      ctx.fillRect(w * 0.14, h * (0.20 + r * 0.025), w * 0.70, 5);
    }
  }));
}

export function makeYeungKwongLemonTea() {
  const g = new THREE.Group();
  g.name = 'yeung-kwong-lemon-tea';

  const W = 0.96;
  const H = 1.68;
  const D = 0.58;

  const frontMat = new THREE.MeshStandardMaterial({ map: yeungKwongFrontTex(), roughness: 0.42, envMapIntensity: 0.5 });
  const backMat = new THREE.MeshStandardMaterial({ map: yeungKwongBackTex(), roughness: 0.44, envMapIntensity: 0.5 });
  const sideMat = new THREE.MeshStandardMaterial({ map: yeungKwongSideTex(), roughness: 0.45, envMapIntensity: 0.5 });
  const topMat = new THREE.MeshStandardMaterial({ color: 0x1b6e33, roughness: 0.5, envMapIntensity: 0.45 });

  // Main carton body (y = 0..H)
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(W, H, D),
    [sideMat, sideMat, topMat, topMat, frontMat, backMat]
  );
  body.position.y = H / 2;
  g.add(body);

  // Subtle folded top seam ridge
  const seam = new THREE.Mesh(
    new THREE.BoxGeometry(W + 0.02, 0.035, 0.045),
    topMat
  );
  seam.position.set(0, H + 0.012, 0);
  g.add(seam);

  // Bent white plastic drinking straw attached on the +X side
  const strawCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(W / 2 + 0.045, H * 0.12, 0.04),
    new THREE.Vector3(W / 2 + 0.045, H * 0.84, 0.02),
    new THREE.Vector3(W / 2 + 0.045, H * 0.91, -0.05),
    new THREE.Vector3(W / 2 + 0.045, H * 0.84, -0.13),
    new THREE.Vector3(W / 2 + 0.045, H * 0.56, -0.14)
  ]);
  const straw = new THREE.Mesh(
    new THREE.TubeGeometry(strawCurve, 24, 0.032, 10, false),
    new THREE.MeshStandardMaterial({ color: 0xf7f8fa, roughness: 0.32, envMapIntensity: 0.6 })
  );
  g.add(straw);

  // Translucent cellophane wrapper over the straw
  const sleeve = new THREE.Mesh(
    new THREE.BoxGeometry(0.085, H * 0.84, 0.28),
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff, transparent: true, opacity: 0.22, roughness: 0.1, clearcoat: 1.0, depthWrite: false
    })
  );
  sleeve.position.set(W / 2 + 0.045, H * 0.52, -0.05);
  g.add(sleeve);

  return g;
}

// ===========================================================================
// 2. 卡樂B 燒烤味薯片 (Calbee BBQ Potato Chips puffed foil pillow-pack)
// ===========================================================================
function calbeeFrontTex() {
  return cached('calbee_front', () => makeCanvasTex(512, 680, (ctx, w, h) => {
    // Classic glossy red -> warm gold -> crimson bottom foil gradient
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#c8161a');
    bg.addColorStop(0.42, '#dc201e');
    bg.addColorStop(0.58, '#f4b828');
    bg.addColorStop(0.92, '#e8a21e');
    bg.addColorStop(1, '#b81418');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Crimped foil top & bottom bands
    ctx.fillStyle = '#9e1014';
    ctx.fillRect(0, 0, w, 28);
    ctx.fillRect(0, h - 28, w, 28);

    // Calbee + 卡樂B header
    ctx.fillStyle = '#ffffff';
    ctx.font = 'italic 900 58px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Calbee', w * 0.34, h * 0.14);

    // Red-outlined white oval 卡樂B badge
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(w * 0.72, h * 0.14, 86, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c8161a';
    ctx.font = '900 40px "PingFang TC", "Microsoft JhengHei", sans-serif';
    ctx.fillText('卡樂B', w * 0.72, h * 0.145);

    // Bold outlined "Potato Chips"
    ctx.font = '900 94px sans-serif';
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeText('Potato', w * 0.5, h * 0.29);
    ctx.strokeText('Chips', w * 0.5, h * 0.41);
    ctx.fillStyle = '#d41b1e';
    ctx.fillText('Potato', w * 0.5, h * 0.29);
    ctx.fillText('Chips', w * 0.5, h * 0.41);

    // Crimson ribbon banner: 燒烤味薯片
    ctx.fillStyle = '#9c1512';
    ctx.beginPath();
    ctx.roundRect(w * 0.14, h * 0.48, w * 0.72, 66, 14);
    ctx.fill();
    ctx.strokeStyle = '#ffe082';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = '#fff8dc';
    ctx.font = '900 44px "PingFang TC", "Microsoft JhengHei", sans-serif';
    ctx.fillText('燒烤味薯片', w * 0.5, h * 0.53);

    // Crispy golden ridged potato chips cluster
    const chips = [
      [w * 0.26, h * 0.74, 72, -0.3],
      [w * 0.74, h * 0.73, 76, 0.25],
      [w * 0.50, h * 0.77, 86, 0.1],
      [w * 0.34, h * 0.85, 64, 0.4],
      [w * 0.66, h * 0.84, 68, -0.2]
    ];
    for (const [cx, cy, r, rot] of chips) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      const cg = ctx.createRadialGradient(-r * 0.2, -r * 0.2, 6, 0, 0, r);
      cg.addColorStop(0, '#ffe07d');
      cg.addColorStop(0.65, '#df9c34');
      cg.addColorStop(1, '#9c5914');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.78, 0, 0, Math.PI * 2);
      ctx.fill();
      // Ridged wave lines
      ctx.strokeStyle = 'rgba(130, 62, 10, 0.38)';
      ctx.lineWidth = 5;
      for (let ry = -r * 0.55; ry <= r * 0.55; ry += 14) {
        ctx.beginPath();
        ctx.moveTo(-r * 0.8, ry);
        ctx.lineTo(r * 0.8, ry);
        ctx.stroke();
      }
      ctx.restore();
    }

    // BBQ badge & 55g
    ctx.fillStyle = '#2a120a';
    ctx.beginPath();
    ctx.arc(w * 0.76, h * 0.77, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ff9d2e';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = '#ffcf4d';
    ctx.font = '900 32px sans-serif';
    ctx.fillText('BBQ', w * 0.76, h * 0.775);

    ctx.fillStyle = '#2a120a';
    ctx.font = '900 28px sans-serif';
    ctx.fillText('55g', w * 0.84, h * 0.92);
  }));
}

function calbeeBackTex() {
  return cached('calbee_back', () => makeCanvasTex(512, 680, (ctx, w, h) => {
    const bg = ctx.createLinearGradient(0, 0, w, 0);
    bg.addColorStop(0, '#a8221e');
    bg.addColorStop(0.5, '#d8c8be');
    bg.addColorStop(1, '#a8221e');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Center vertical heat-seal fin
    ctx.fillStyle = '#b4b8be';
    ctx.fillRect(w * 0.46, 0, w * 0.08, h);

    // Nutrition table + barcode on left
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(w * 0.08, h * 0.14, w * 0.34, h * 0.52);
    ctx.fillStyle = '#181818';
    for (let r = 0; r < 9; r++) ctx.fillRect(w * 0.11, h * (0.18 + r * 0.03), w * 0.28, 4);
    for (let x = 0; x < 18; x++) {
      ctx.fillRect(w * 0.11 + x * 7, h * 0.48, x % 3 ? 3 : 5, h * 0.13);
    }

    // Calbee HK distributor note on right
    ctx.fillStyle = '#f2ede6';
    ctx.fillRect(w * 0.58, h * 0.14, w * 0.34, h * 0.52);
    ctx.fillStyle = '#c8161a';
    ctx.font = 'italic 900 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Calbee', w * 0.75, h * 0.56);
  }));
}

export function makeCalbeeChipsBag() {
  const g = new THREE.Group();
  g.name = 'calbee-potato-chips';

  const W = 1.62;
  const H = 2.24;
  const D = 0.66;

  // Sculpted puffed pillow-pack geometry (pinched flat at top/bottom, rounded in center)
  const geo = new THREE.BoxGeometry(W, H, D, 12, 18, 4);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ny = y / (H / 2); // -1..+1
    const nx = x / (W / 2); // -1..+1

    // Pinch Z thickness smoothly to near-zero at top & bottom crimp seals (clamp >= 0 to avoid NaN)
    const puffY = Math.max(0, Math.cos(Math.min(1, Math.abs(ny)) * Math.PI * 0.5));
    const puffX = Math.max(0, Math.cos(Math.min(1, Math.abs(nx)) * Math.PI * 0.44));
    const puff = Math.max(0.03, Math.pow(puffY, 0.72) * (0.35 + 0.65 * puffX));
    // Slight waist taper in middle, flaring out cleanly at crimped ends
    const flareX = 1.0 + 0.06 * (ny * ny);
    // Subtle foil crinkle
    const crinkle = Math.sin(nx * 9.0 + ny * 7.0) * 0.008 * puffY;
    pos.setXYZ(i, x * flareX, y, z * puff + crinkle);
  }
  geo.computeVertexNormals();

  const frontMat = new THREE.MeshPhysicalMaterial({
    map: calbeeFrontTex(),
    roughness: 0.26,
    metalness: 0.28,
    clearcoat: 0.55,
    clearcoatRoughness: 0.22,
    envMapIntensity: 0.85
  });
  const backMat = new THREE.MeshPhysicalMaterial({
    map: calbeeBackTex(),
    roughness: 0.28,
    metalness: 0.35,
    clearcoat: 0.45,
    clearcoatRoughness: 0.25,
    envMapIntensity: 0.85
  });
  const sideMat = new THREE.MeshPhysicalMaterial({
    color: 0xd92b1e,
    roughness: 0.28,
    metalness: 0.3,
    clearcoat: 0.5,
    envMapIntensity: 0.8
  });

  const bag = new THREE.Mesh(geo, [sideMat, sideMat, sideMat, sideMat, frontMat, backMat]);
  // Lean the pillow pack slightly backward so it rests naturally on the table
  bag.position.set(0, H * 0.48, 0);
  bag.rotation.x = -0.14;
  g.add(bag);

  return g;
}

// ===========================================================================
// 3. 金莎朱古力 (Ferrero Rocher 16-piece crystal acrylic gift box)
// ===========================================================================
function ferreroLidBadgeTex() {
  return cached('ferrero_badge', () => makeCanvasTex(512, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);

    // Golden ribbon strip
    const gold = ctx.createLinearGradient(0, 0, w, 0);
    gold.addColorStop(0, '#b88a2e');
    gold.addColorStop(0.5, '#f2d379');
    gold.addColorStop(1, '#b88a2e');
    ctx.fillStyle = gold;
    ctx.fillRect(0, h * 0.32, w, h * 0.36);
    ctx.fillStyle = '#5c3317';
    ctx.fillRect(0, h * 0.34, w, 5);
    ctx.fillRect(0, h * 0.66 - 5, w, 5);

    // Iconic white-and-gold oval emblem
    ctx.fillStyle = '#fffdf7';
    ctx.beginPath();
    ctx.ellipse(w * 0.44, h * 0.5, 138, 92, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d4a644';
    ctx.lineWidth = 10;
    ctx.stroke();

    ctx.fillStyle = '#4a2610';
    ctx.font = '700 38px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FERRERO', w * 0.44, h * 0.43);
    ctx.fillText('ROCHER', w * 0.44, h * 0.61);

    // Traditional Chinese 金莎 on the right ribbon
    ctx.fillStyle = '#4a2610';
    ctx.font = '900 44px "Kaiti TC", "Songti TC", "PingFang TC", serif';
    ctx.fillText('金莎', w * 0.85, h * 0.51);
  }));
}

export function makeFerreroRocherBox() {
  const g = new THREE.Group();
  g.name = 'ferrero-rocher-box';

  const W = 2.42;
  const D = 1.94;
  const H = 0.58;

  // Golden metallic base tray
  const goldTrayMat = new THREE.MeshStandardMaterial({
    color: 0xd9ad4a,
    roughness: 0.32,
    metalness: 0.78,
    envMapIntensity: 0.85
  });
  const tray = new THREE.Mesh(new THREE.BoxGeometry(W - 0.08, 0.10, D - 0.08), goldTrayMat);
  tray.position.y = 0.05;
  g.add(tray);

  // 4×4 grid of 16 crinkled gold-foil spheres in pleated dark brown paper cups
  const cols = 4;
  const rows = 4;
  const count = cols * rows;

  // Crinkled gold foil sphere geometry
  const foilGeo = new THREE.IcosahedronGeometry(0.195, 2);
  const fPos = foilGeo.attributes.position;
  for (let i = 0; i < fPos.count; i++) {
    const vx = fPos.getX(i);
    const vy = fPos.getY(i);
    const vz = fPos.getZ(i);
    const n = 1 + 0.045 * Math.sin(vx * 38 + vy * 29) * Math.cos(vz * 41);
    fPos.setXYZ(i, vx * n, vy * n, vz * n);
  }
  foilGeo.computeVertexNormals();

  const foilMat = new THREE.MeshStandardMaterial({
    color: 0xf0c24b,
    roughness: 0.24,
    metalness: 0.88,
    envMapIntensity: 1.05
  });
  const cupGeo = new THREE.CylinderGeometry(0.22, 0.175, 0.15, 16);
  const cupMat = new THREE.MeshStandardMaterial({ color: 0x3b2012, roughness: 0.86, metalness: 0.02 });
  const stickerGeo = new THREE.CircleGeometry(0.068, 14);
  stickerGeo.rotateX(-Math.PI / 2);
  const stickerMat = new THREE.MeshStandardMaterial({ color: 0xfffaf0, roughness: 0.45 });

  const foils = new THREE.InstancedMesh(foilGeo, foilMat, count);
  const cups = new THREE.InstancedMesh(cupGeo, cupMat, count);
  const stickers = new THREE.InstancedMesh(stickerGeo, stickerMat, count);

  const dummy = new THREE.Object3D();
  let idx = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (c - 1.5) * 0.54;
      const z = (r - 1.5) * 0.43;

      dummy.position.set(x, 0.15, z);
      dummy.rotation.set(0, (idx * 1.1) % Math.PI, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      cups.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(x, 0.29, z);
      dummy.rotation.set(idx * 0.7, idx * 1.3, 0);
      dummy.updateMatrix();
      foils.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(x, 0.492, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1.25, 1, 0.85);
      dummy.updateMatrix();
      stickers.setMatrixAt(idx, dummy.matrix);

      idx++;
    }
  }
  cups.instanceMatrix.needsUpdate = true;
  foils.instanceMatrix.needsUpdate = true;
  stickers.instanceMatrix.needsUpdate = true;
  g.add(cups, foils, stickers);

  // Transparent crystal acrylic display box
  const acrylicMat = new THREE.MeshPhysicalMaterial({
    color: 0xf7fbff,
    transparent: true,
    opacity: 0.24,
    roughness: 0.06,
    metalness: 0.04,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.35,
    depthWrite: false
  });
  const lid = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), acrylicMat);
  lid.position.y = H / 2;
  lid.renderOrder = 2;
  g.add(lid);

  // Crisp white-and-gold oval FERRERO ROCHER / 金莎 ribbon badge across the top lid
  const badge = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 0.99, D * 0.48),
    new THREE.MeshStandardMaterial({
      map: ferreroLidBadgeTex(),
      transparent: true,
      roughness: 0.35,
      metalness: 0.22,
      envMapIntensity: 0.65
    })
  );
  badge.rotation.x = -Math.PI / 2;
  badge.position.set(0, H + 0.004, 0);
  badge.renderOrder = 3;
  g.add(badge);

  return g;
}
