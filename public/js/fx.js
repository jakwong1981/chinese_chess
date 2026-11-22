// Capture bursts, GPU Points particle pool, dynamic impact lighting, wooden move audio,
// and the 千軍萬馬 check spectacle.
// Piece front is local −Z; yawFacing (from pieces.js) is the only heading helper.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CANNON, KING, ADVISOR, ROOK, HORSE, ELEPHANT, PAWN, RED } from '../../shared/rules.js';
import { yawFacing } from './pieces.js';

export const CANNON_FLIGHT_MS = 280;
const CHECK_RUN_MS = 1600;
const CHECK_CALL_AT = 1050;
const CHECK_DONE_MS = 2200;

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _UP = new THREE.Vector3(0, 1, 0);
const _RIGHT = new THREE.Vector3(1, 0, 0);
const _tmpColor = new THREE.Color();

let audioCtx = null;
let noiseBuf = null;

function audio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  return audioCtx;
}

function noiseBuffer(ac) {
  if (noiseBuf && noiseBuf.sampleRate === ac.sampleRate) return noiseBuf;
  const len = Math.floor(ac.sampleRate * 0.4);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noiseBuf = buf;
  return buf;
}

function withAudio(fn) {
  const ac = audio();
  if (!ac) return;
  const run = () => { if (ac.state === 'running') fn(ac); };
  if (ac.state === 'running') run();
  else ac.resume().then(run).catch(() => {});
}

function tone(ac, freq, dur, type, gain) {
  const t = ac.currentTime;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.25), t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  g.connect(ac.destination);
  o.start(t);
  o.stop(t + dur);
}

function crack(ac, dur, gain, startFreq = 1800, endFreq = 180) {
  const t = ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac);
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(startFreq, t);
  filter.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(ac.destination);
  src.start(t);
  src.stop(t + dur);
}

function playWoodMoveSound(isCapture = false) {
  withAudio((ac) => {
    // Crisp wooden clack: short resonant body + high-frequency woody transient
    const pitch = isCapture ? 260 : 340 + (Math.random() - 0.5) * 35;
    tone(ac, pitch, isCapture ? 0.11 : 0.075, 'triangle', isCapture ? 0.34 : 0.24);
    tone(ac, pitch * 2.15, 0.045, 'sine', isCapture ? 0.16 : 0.1);
    crack(ac, isCapture ? 0.09 : 0.055, isCapture ? 0.28 : 0.16, 2600, 420);
  });
}

function playWoodSelectSound() {
  withAudio((ac) => {
    tone(ac, 520, 0.04, 'sine', 0.09);
    crack(ac, 0.025, 0.07, 3200, 900);
  });
}

function playCannonSound() {
  withAudio((ac) => {
    tone(ac, 140, 0.28, 'sawtooth', 0.18);
    crack(ac, 0.22, 0.35);
  });
}

function playDrum() {
  withAudio((ac) => tone(ac, 70, 0.45, 'sine', 0.45));
}

function shout(text) {
  const synth = window.speechSynthesis;
  if (!synth) return;
  try {
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'zh-HK';
    utter.rate = 0.9;
    utter.pitch = 0.82;
    const voices = synth.getVoices();
    const voice = voices.find((v) => /zh-(HK|TW|Hant)/i.test(v.lang))
      || voices.find((v) => /^zh/i.test(v.lang));
    if (voice) utter.voice = voice;
    synth.cancel();
    synth.speak(utter);
  } catch (err) {
    console.warn('check shout failed', err);
  }
}

function isolateMaterials(mesh) {
  const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const cloned = list.map((m) => {
    const c = m.clone();
    c.transparent = true;
    c.opacity = 1;
    return c;
  });
  mesh.material = cloned.length === 1 ? cloned[0] : cloned;
  return cloned;
}

function setOpacity(mats, opacity) {
  for (const m of mats) m.opacity = opacity;
}

function bakeMini(geom, x, y, z, rx = 0, ry = 0, rz = 0) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(1, 1, 1);
  geom.applyMatrix4(_m.compose(_p, _q, _s));
  geom.clearGroups();
  return geom;
}

function miniHorseGeom() {
  return mergeGeometries([
    bakeMini(new THREE.BoxGeometry(0.36, 0.26, 0.52), 0, 0.5, 0),
    bakeMini(new THREE.BoxGeometry(0.3, 0.2, 0.18), 0, 0.48, -0.28),
    bakeMini(new THREE.BoxGeometry(0.14, 0.28, 0.14), 0, 0.72, -0.36, 0.55, 0, 0),
    bakeMini(new THREE.BoxGeometry(0.12, 0.12, 0.22), 0, 0.86, -0.46),
    bakeMini(new THREE.ConeGeometry(0.035, 0.1, 4), -0.04, 0.98, -0.42),
    bakeMini(new THREE.ConeGeometry(0.035, 0.1, 4), 0.04, 0.98, -0.42),
    bakeMini(new THREE.BoxGeometry(0.05, 0.2, 0.05), 0, 0.58, 0.34, -0.6, 0, 0),
    bakeMini(new THREE.CylinderGeometry(0.05, 0.045, 0.38, 5), -0.12, 0.2, -0.16),
    bakeMini(new THREE.CylinderGeometry(0.05, 0.045, 0.38, 5), 0.12, 0.2, -0.16),
    bakeMini(new THREE.CylinderGeometry(0.045, 0.04, 0.38, 5), -0.11, 0.2, 0.16),
    bakeMini(new THREE.CylinderGeometry(0.045, 0.04, 0.38, 5), 0.11, 0.2, 0.16),
    bakeMini(new THREE.CylinderGeometry(0.09, 0.11, 0.22, 6), 0, 0.78, -0.02),
    bakeMini(new THREE.SphereGeometry(0.075, 6, 5), 0, 0.96, -0.04),
    bakeMini(new THREE.CylinderGeometry(0.012, 0.012, 0.46, 4), 0.16, 1.02, 0.02),
    bakeMini(new THREE.BoxGeometry(0.26, 0.16, 0.02), 0.3, 1.16, 0.02)
  ], false);
}

function miniSoldierGeom() {
  return mergeGeometries([
    bakeMini(new THREE.CylinderGeometry(0.11, 0.14, 0.34, 7), 0, 0.4, 0),
    bakeMini(new THREE.SphereGeometry(0.085, 6, 5), 0, 0.66, 0),
    bakeMini(new THREE.ConeGeometry(0.1, 0.14, 6), 0, 0.82, 0),
    bakeMini(new THREE.BoxGeometry(0.24, 0.28, 0.04), 0, 0.42, -0.14),
    bakeMini(new THREE.CylinderGeometry(0.018, 0.018, 0.78, 4), 0.16, 0.58, -0.02),
    bakeMini(new THREE.ConeGeometry(0.05, 0.12, 5), 0.16, 1.02, -0.02),
    bakeMini(new THREE.CylinderGeometry(0.045, 0.04, 0.28, 5), -0.06, 0.15, 0.02),
    bakeMini(new THREE.CylinderGeometry(0.045, 0.04, 0.28, 5), 0.06, 0.15, 0.02)
  ], false);
}

// GPU-driven pre-allocated particle pool (zero per-frame allocations)
function createParticlePool(parent, maxCount = 280) {
  const positions = new Float32Array(maxCount * 3);
  const colors = new Float32Array(maxCount * 3);
  const sizes = new Float32Array(maxCount);
  const alphas = new Float32Array(maxCount);

  const vel = new Float32Array(maxCount * 3);
  const age = new Float32Array(maxCount);
  const life = new Float32Array(maxCount);
  const startSize = new Float32Array(maxCount);
  const endSize = new Float32Array(maxCount);
  const gravity = new Float32Array(maxCount);
  const drag = new Float32Array(maxCount);

  const geom = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  const colAttr = new THREE.BufferAttribute(colors, 3);
  const sizeAttr = new THREE.BufferAttribute(sizes, 1);
  const alphaAttr = new THREE.BufferAttribute(alphas, 1);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  colAttr.setUsage(THREE.DynamicDrawUsage);
  sizeAttr.setUsage(THREE.DynamicDrawUsage);
  alphaAttr.setUsage(THREE.DynamicDrawUsage);

  geom.setAttribute('position', posAttr);
  geom.setAttribute('aColor', colAttr);
  geom.setAttribute('aSize', sizeAttr);
  geom.setAttribute('aAlpha', alphaAttr);

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    vertexShader: `
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aAlpha;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = aColor;
        vAlpha = aAlpha;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (320.0 / max(1.0, -mvPosition.z));
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        if (vAlpha <= 0.005) discard;
        vec2 c = gl_PointCoord - vec2(0.5);
        float d = length(c) * 2.0;
        float soft = smoothstep(1.0, 0.0, d);
        float core = smoothstep(0.6, 0.0, d);
        gl_FragColor = vec4(vColor * (0.9 + core * 0.55), soft * soft * vAlpha);
      }
    `
  });

  const points = new THREE.Points(geom, mat);
  points.frustumCulled = false;
  points.renderOrder = 4;
  parent.add(points);

  let cursor = 0;
  let activeCount = 0;

  function spawn(x, y, z, vx, vy, vz, colorHex, s0, s1, lifeSec, grav = -2.8, drg = 0.96) {
    const i = cursor;
    cursor = (cursor + 1) % maxCount;
    const i3 = i * 3;
    positions[i3] = x;
    positions[i3 + 1] = y;
    positions[i3 + 2] = z;
    vel[i3] = vx;
    vel[i3 + 1] = vy;
    vel[i3 + 2] = vz;
    _tmpColor.set(colorHex);
    colors[i3] = _tmpColor.r;
    colors[i3 + 1] = _tmpColor.g;
    colors[i3 + 2] = _tmpColor.b;
    startSize[i] = s0;
    endSize[i] = s1;
    sizes[i] = s0;
    alphas[i] = 1.0;
    age[i] = 0;
    life[i] = Math.max(0.05, lifeSec);
    gravity[i] = grav;
    drag[i] = drg;
    activeCount = Math.min(maxCount, activeCount + 1);
  }

  function update(dt) {
    if (activeCount === 0) return;
    let alive = 0;
    const dragPow = dt * 60;
    for (let i = 0; i < maxCount; i++) {
      if (life[i] <= 0) continue;
      age[i] += dt;
      if (age[i] >= life[i]) {
        life[i] = 0;
        alphas[i] = 0;
        sizes[i] = 0;
        continue;
      }
      alive++;
      const t = age[i] / life[i];
      const i3 = i * 3;
      const d = Math.pow(drag[i], dragPow);
      vel[i3] *= d;
      vel[i3 + 1] = vel[i3 + 1] * d + gravity[i] * dt;
      vel[i3 + 2] *= d;
      positions[i3] += vel[i3] * dt;
      positions[i3 + 1] = Math.max(0.02, positions[i3 + 1] + vel[i3 + 1] * dt);
      positions[i3 + 2] += vel[i3 + 2] * dt;
      sizes[i] = startSize[i] + (endSize[i] - startSize[i]) * t;
      alphas[i] = (1 - t) * (1 - t);
    }
    activeCount = alive;
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;
    alphaAttr.needsUpdate = true;
  }

  function clear() {
    life.fill(0);
    alphas.fill(0);
    sizes.fill(0);
    activeCount = 0;
    alphaAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;
  }

  return { spawn, update, clear };
}

export function createFx(scene, cameraFx = null) {
  const layer = new THREE.Group();
  layer.name = 'fx';
  scene.add(layer);

  const jobs = [];
  const particles = createParticlePool(layer, 320);

  // Shared impact point light (flashes dynamically on cannon blast / rook strike / check)
  const flashLight = new THREE.PointLight(0xffb860, 0, 10, 2);
  flashLight.position.set(0, 1.2, 0);
  layer.add(flashLight);

  // Shared geometries for shockwave rings and beams
  const sharedRingGeom = new THREE.RingGeometry(0.14, 0.24, 32);
  sharedRingGeom.rotateX(-Math.PI / 2);
  const sharedBeamGeom = new THREE.BoxGeometry(0.28, 0.65, 1);

  let horses = null;
  let soldiers = null;
  let check = null;

  function flashAt(at, color = 0xffb860, intensity = 6.5, lifeMs = 360) {
    flashLight.color.set(color);
    flashLight.position.set(at.x, (at.y || 0) + 0.75, at.z);
    flashLight.intensity = intensity;
    const t0 = performance.now();
    jobs.push((now) => {
      const t = Math.min(1, (now - t0) / lifeMs);
      flashLight.intensity = intensity * (1 - t) * (1 - t);
      return t < 1;
    });
  }

  function burst(at, color, count, spread, lifeMs, opts = {}) {
    const lifeSec = lifeMs / 1000;
    const s0 = opts.s0 ?? 0.35;
    const s1 = opts.s1 ?? 0.9;
    const grav = opts.gravity ?? -3.2;
    const drg = opts.drag ?? 0.95;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = (0.35 + Math.random() * 0.65) * spread;
      particles.spawn(
        at.x + (Math.random() - 0.5) * 0.12,
        at.y + Math.random() * 0.1,
        at.z + (Math.random() - 0.5) * 0.12,
        Math.cos(angle) * spd,
        (0.45 + Math.random() * 0.85) * spread,
        Math.sin(angle) * spd,
        color,
        s0 * (0.75 + Math.random() * 0.5),
        s1 * (0.75 + Math.random() * 0.5),
        lifeSec * (0.7 + Math.random() * 0.45),
        grav,
        drg
      );
    }
  }

  function launchVictim(mesh, dir, wild) {
    const mats = isolateMaterials(mesh);
    const origin = mesh.position.clone();
    const spinRate = wild ? 11.0 : 2.5;
    const t0 = performance.now();
    const life = wild ? 680 : 420;
    jobs.push((now, dt) => {
      const t = Math.min(1, (now - t0) / life);
      mesh.position.set(
        origin.x + dir.x * t * (wild ? 1.5 : 0.28),
        origin.y + Math.sin(t * Math.PI) * (wild ? 1.45 : 0.3),
        origin.z + dir.z * t * (wild ? 1.5 : 0.28)
      );
      if (wild) {
        mesh.rotation.x += spinRate * dt;
        mesh.rotation.z += spinRate * 0.7 * dt;
      }
      setOpacity(mats, 1 - t);
      mesh.scale.setScalar(1 - t * 0.35);
      if (t >= 1) {
        mesh.parent?.remove(mesh);
        for (const m of mats) m.dispose();
        return false;
      }
      return true;
    });
  }

  function shot(from, to) {
    const dir = new THREE.Vector3().subVectors(to, from);
    dir.y = 0;
    const len = dir.length() || 1;
    dir.multiplyScalar(1 / len);
    const muzzle = from.clone().addScaledVector(dir, 0.4);
    muzzle.y = 0.36;
    const targetPos = to.clone();
    targetPos.y = 0.3;

    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xffe8a0, toneMapped: false })
    );
    ball.position.copy(muzzle);
    layer.add(ball);

    const t0 = performance.now();
    jobs.push((now) => {
      const t = Math.min(1, (now - t0) / CANNON_FLIGHT_MS);
      ball.position.lerpVectors(muzzle, targetPos, t);
      ball.position.y += Math.sin(t * Math.PI) * 0.55;
      // Glowing ember trail
      particles.spawn(
        ball.position.x, ball.position.y, ball.position.z,
        (Math.random() - 0.5) * 0.4, 0.35, (Math.random() - 0.5) * 0.4,
        0xffa438, 0.42, 0.08, 0.22, -0.5, 0.94
      );
      if (t >= 1) {
        layer.remove(ball);
        ball.geometry.dispose();
        ball.material.dispose();
        return false;
      }
      return true;
    });
    return dir;
  }

  function recoil(mover, dir) {
    const home = mover.position.clone();
    const yaw = mover.rotation.y;
    mover.rotation.y = yawFacing(dir.x, dir.z);
    const t0 = performance.now();
    jobs.push((now) => {
      const t = Math.min(1, (now - t0) / CANNON_FLIGHT_MS);
      const kick = Math.sin(t * Math.PI) * 0.16;
      mover.position.set(home.x - dir.x * kick, home.y, home.z - dir.z * kick);
      if (t >= 1) {
        mover.position.copy(home);
        mover.rotation.y = mover.userData.homeYaw ?? yaw;
        return false;
      }
      return true;
    });
  }

  function beam(from, to, color) {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dz) || 0.001;
    const mesh = new THREE.Mesh(
      sharedBeamGeom,
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.95, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false
      })
    );
    mesh.scale.set(1, 1, len);
    mesh.position.set((from.x + to.x) / 2, 0.36, (from.z + to.z) / 2);
    mesh.rotation.y = Math.atan2(dx, dz);
    layer.add(mesh);
    const t0 = performance.now();
    jobs.push((now) => {
      const t = Math.min(1, (now - t0) / 520);
      mesh.material.opacity = 0.9 * (1 - t);
      mesh.scale.x = 1 + t * 2.2;
      if (t >= 1) {
        layer.remove(mesh);
        mesh.material.dispose();
        return false;
      }
      return true;
    });
  }

  function ringAt(at, color, life = 420, maxScale = 3.2) {
    const mesh = new THREE.Mesh(
      sharedRingGeom,
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.92, side: THREE.DoubleSide,
        depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
      })
    );
    mesh.position.set(at.x, 0.03, at.z);
    layer.add(mesh);
    const t0 = performance.now();
    jobs.push((now) => {
      const t = Math.min(1, (now - t0) / life);
      mesh.scale.setScalar(1 + t * maxScale);
      mesh.material.opacity = 0.9 * (1 - t);
      if (t >= 1) {
        layer.remove(mesh);
        mesh.material.dispose();
        return false;
      }
      return true;
    });
  }

  function ensureArmy() {
    if (horses) return;
    // Keep transparent: true permanently so fading never triggers a shader recompile hitch!
    const horseMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.58, metalness: 0.06,
      emissive: 0x22140c, emissiveIntensity: 0.4,
      transparent: true, opacity: 1
    });
    const manMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.55, metalness: 0.08,
      emissive: 0x22140c, emissiveIntensity: 0.4,
      transparent: true, opacity: 1
    });
    horses = new THREE.InstancedMesh(miniHorseGeom(), horseMat, 28);
    soldiers = new THREE.InstancedMesh(miniSoldierGeom(), manMat, 40);
    horses.count = 28;
    soldiers.count = 40;
    horses.frustumCulled = false;
    soldiers.frustumCulled = false;
    horses.castShadow = true;
    soldiers.castShadow = true;
    horses.visible = false;
    soldiers.visible = false;
    layer.add(horses);
    layer.add(soldiers);
  }

  function layoutCharge(mesh, count, cols, king, dirZ, opts) {
    const color = new THREE.Color(opts.tint);
    const accent = new THREE.Color(opts.accent);
    const { scale, laneGap, rowGap, zBias } = opts;
    const travel = 8.6;
    const front = 6.0;
    mesh.userData.chargeScale = scale;
    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const lane = (col - (cols - 1) / 2) * laneGap;
      const back = row * rowGap + zBias;
      const z0 = king.z - dirZ * (front + back);
      mesh.setColorAt(i, i % opts.accentEvery === 0 ? accent : color);
      const x1 = king.x * 0.25 + lane * 0.78;
      const z1 = z0 + dirZ * travel;
      mesh.userData.paths[i] = {
        x0: lane,
        z0,
        x1,
        z1,
        yaw: yawFacing(x1 - lane, z1 - z0),
        phase: i * 0.37
      };
      _q.setFromAxisAngle(_UP, mesh.userData.paths[i].yaw);
      _s.set(scale, scale, scale);
      _p.set(lane, 0, z0);
      mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
    mesh.instanceColor.needsUpdate = true;
    mesh.instanceMatrix.needsUpdate = true;
  }

  function setCall(text) {
    const el = document.getElementById('check-call');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden');
  }

  function hideCall() {
    document.getElementById('check-call')?.classList.add('hidden');
  }

  function playCheck({ king, attackerSide, mate, onDone }) {
    const word = mate ? '將死' : '將軍';
    if (check?.running) {
      if (mate) {
        check.mate = true;
        setCall(word);
        shout(word);
      }
      return;
    }
    ensureArmy();
    const dirZ = attackerSide === RED ? -1 : 1;
    horses.userData.paths = [];
    soldiers.userData.paths = [];
    layoutCharge(horses, 28, 7, king, dirZ, {
      tint: '#6b4428', accent: '#c4a574', accentEvery: 4,
      scale: 1, laneGap: 1.12, rowGap: 0.92, zBias: 0
    });
    const lacquer = attackerSide === RED ? '#8e2a24' : '#2c2c2c';
    layoutCharge(soldiers, 40, 8, king, dirZ, {
      tint: lacquer, accent: '#e6c56a', accentEvery: 6,
      scale: 0.96, laneGap: 0.98, rowGap: 0.64, zBias: 3.15
    });
    horses.visible = true;
    soldiers.visible = true;
    horses.material.opacity = 1;
    soldiers.material.opacity = 1;

    cameraFx?.pulseZoom?.(-1.1, CHECK_RUN_MS);
    cameraFx?.shake?.(0.14, 380);
    flashAt(king, attackerSide === RED ? 0xff5a36 : 0x62b8ff, 5.5, 900);

    const state = {
      running: true, mate: !!mate, called: false, done: false, dead: false, onDone, t0: performance.now()
    };
    check = state;

    jobs.push((now) => {
      if (state.dead) {
        horses.visible = false;
        soldiers.visible = false;
        return false;
      }
      const t = (now - state.t0) / CHECK_RUN_MS;
      const fade = t > 0.75 ? Math.max(0, 1 - (t - 0.75) / 0.25) : 1;
      const step = (mesh) => {
        const paths = mesh.userData.paths;
        const scale = mesh.userData.chargeScale || 1;
        for (let i = 0; i < paths.length; i++) {
          const path = paths[i];
          const u = Math.min(1, Math.max(0, t));
          const gallop = Math.sin(u * 18 + path.phase);
          const bob = Math.abs(gallop) * 0.08;
          _p.set(
            path.x0 + (path.x1 - path.x0) * u,
            bob,
            path.z0 + (path.z1 - path.z0) * u
          );
          _q.setFromAxisAngle(_UP, path.yaw);
          _q2.setFromAxisAngle(_RIGHT, gallop * 0.22);
          _q.multiply(_q2);
          _s.set(scale, scale * (1 + gallop * 0.04), scale);
          mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.material.opacity = fade;
      };
      if (!state.done) {
        step(horses);
        step(soldiers);
        cameraFx?.requestShadowUpdate?.();
        // Emit hoof dust via GPU particle pool
        if (fade > 0.2) {
          for (let k = 0; k < 3; k++) {
            const hPath = horses.userData.paths[(Math.random() * horses.userData.paths.length) | 0];
            const u = Math.min(1, Math.max(0, t - 0.03));
            particles.spawn(
              hPath.x0 + (hPath.x1 - hPath.x0) * u + (Math.random() - 0.5) * 0.35,
              0.08,
              hPath.z0 + (hPath.z1 - hPath.z0) * u - dirZ * 0.3,
              (Math.random() - 0.5) * 0.6,
              0.5 + Math.random() * 0.6,
              -dirZ * 0.5,
              0xc9a878, 0.32, 0.95, 0.45, -0.8, 0.95
            );
          }
        }
      }
      if (!state.called && now - state.t0 >= CHECK_CALL_AT) {
        state.called = true;
        const said = state.mate ? '將死' : '將軍';
        setCall(said);
        playDrum();
        cameraFx?.shake?.(0.22, 420);
        ringAt(king, 0xffd060, 620, 4.4);
        shout(said);
      }
      if (t >= 1 && !state.done) {
        state.done = true;
        horses.visible = false;
        soldiers.visible = false;
        cameraFx?.requestShadowUpdate?.();
      }
      if (state.done && now - state.t0 >= CHECK_DONE_MS) {
        hideCall();
        state.running = false;
        if (check === state) check = null;
        state.onDone?.();
        return false;
      }
      return true;
    });
  }

  function playLand({ at, isCapture = false, type = null }) {
    playWoodMoveSound(isCapture);
    ringAt(at, isCapture ? 0xf5b942 : 0xd8c39a, isCapture ? 380 : 260, isCapture ? 2.4 : 1.4);
    if (type === HORSE || type === ELEPHANT) {
      burst(at.clone().setY(0.06), 0xc4a06e, 8, 1.4, 360, { s0: 0.24, s1: 0.65, gravity: -1.6 });
    }
  }

  function playCapture({ type, from, to, victim, mover }) {
    const dir = new THREE.Vector3().subVectors(to, from);
    dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    dir.normalize();
    const wild = type !== KING && type !== ADVISOR;

    if (type === CANNON) {
      playCannonSound();
      burst(from.clone().setY(0.35), 0xfff0b8, 12, 2.2, 280, { s0: 0.35, s1: 0.1, gravity: -1.5 });
      flashAt(from, 0xffd278, 5.0, 200);
      const aim = shot(from, to);
      if (mover) recoil(mover, aim);
      const t0 = performance.now();
      jobs.push((now) => {
        if (now - t0 < CANNON_FLIGHT_MS) return true;
        burst(to.clone().setY(0.25), 0xffc864, 24, 3.8, 650, { s0: 0.5, s1: 0.12, gravity: -4.2 });
        burst(to.clone().setY(0.22), 0xff6b2b, 14, 2.6, 520, { s0: 0.45, s1: 1.0, gravity: -0.8 });
        ringAt(to, 0xffb060, 480, 3.8);
        flashAt(to, 0xff9a3c, 8.5, 420);
        cameraFx?.shake?.(0.24, 260);
        if (victim) launchVictim(victim, dir, true);
        return false;
      });
      return;
    }

    if (victim) launchVictim(victim, dir, wild);
    if (type === ROOK) {
      beam(from, to, 0xffd98a);
      burst(to.clone().setY(0.2), 0xffe29a, 16, 3.0, 480);
      flashAt(to, 0xffd278, 6.0, 320);
      cameraFx?.shake?.(0.16, 200);
    } else if (type === HORSE) {
      burst(to.clone().setY(0.08), 0xd4b07a, 14, 2.2, 480, { gravity: -2.0 });
      ringAt(to, 0xe8c47a, 400, 2.8);
      cameraFx?.shake?.(0.1, 150);
    } else if (type === ELEPHANT) {
      ringAt(to, 0xd7c4a0, 460, 3.4);
      burst(to.clone().setY(0.1), 0xe6d4b0, 12, 1.9, 440);
      cameraFx?.shake?.(0.12, 170);
    } else if (type === PAWN) {
      burst(to.clone().setY(0.2), 0xffd0a0, 10, 2.0, 360);
      flashAt(to, 0xffc880, 3.8, 220);
      cameraFx?.shake?.(0.07, 120);
    } else {
      ringAt(to, 0xf0d78a, 360, 2.6);
      cameraFx?.shake?.(0.08, 120);
    }
  }

  return {
    unlock() {
      withAudio(() => {});
      window.speechSynthesis?.getVoices();
    },
    clear() {
      hideCall();
      particles.clear();
      flashLight.intensity = 0;
      window.speechSynthesis?.cancel();
      if (check) {
        check.dead = true;
        check.onDone = null;
        check.running = false;
        check = null;
      }
      if (horses) horses.visible = false;
      if (soldiers) soldiers.visible = false;
    },
    tick(now, dt = 0.016) {
      particles.update(dt);
      for (let i = jobs.length - 1; i >= 0; i--) {
        if (!jobs[i](now, dt)) jobs.splice(i, 1);
      }
    },
    playSelect: playWoodSelectSound,
    playLand,
    playCapture,
    playCheck
  };
}
