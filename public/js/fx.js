// Capture bursts and the 千軍萬馬 check spectacle.
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

function crack(ac, dur, gain) {
  const t = ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac);
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1800, t);
  filter.frequency.exponentialRampToValueAtTime(180, t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(ac.destination);
  src.start(t);
  src.stop(t + dur);
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

function spriteTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, inner);
  grd.addColorStop(0.45, outer);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
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
  // Local −Z is the nose. About 0.84 long and 1.18 tall so a row reads as cavalry, not a dash.
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

export function createFx(scene) {
  const layer = new THREE.Group();
  layer.name = 'fx';
  scene.add(layer);

  const jobs = [];
  const flashTex = spriteTexture('#fff6d0', 'rgba(255,140,40,0.85)');
  const smokeTex = spriteTexture('rgba(90,90,90,0.7)', 'rgba(40,40,40,0.2)');
  const dustTex = spriteTexture('rgba(196,160,110,0.85)', 'rgba(120,80,40,0.15)');

  let horses = null;
  let soldiers = null;
  let check = null;

  function addSprite(tex, color, size) {
    const mat = new THREE.SpriteMaterial({
      map: tex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    const s = new THREE.Sprite(mat);
    s.scale.setScalar(size);
    layer.add(s);
    return s;
  }

  function burst(at, tex, color, count, spread, life) {
    const sprites = [];
    for (let i = 0; i < count; i++) {
      const s = addSprite(tex, color, 0.25 + Math.random() * 0.35);
      s.position.copy(at);
      s.userData.vel = new THREE.Vector3(
        (Math.random() - 0.5) * spread,
        Math.random() * spread,
        (Math.random() - 0.5) * spread
      );
      sprites.push(s);
    }
    const t0 = performance.now();
    jobs.push((now) => {
      const t = (now - t0) / life;
      if (t >= 1) {
        for (const s of sprites) {
          layer.remove(s);
          s.material.dispose();
        }
        return false;
      }
      for (const s of sprites) {
        s.position.addScaledVector(s.userData.vel, 0.016);
        s.material.opacity = 1 - t;
        s.scale.setScalar((0.3 + t) * (1 + t));
      }
      return true;
    });
  }

  function launchVictim(mesh, dir, wild) {
    const mats = isolateMaterials(mesh);
    const origin = mesh.position.clone();
    const spin = wild ? 0.18 : 0.04;
    const t0 = performance.now();
    const life = wild ? 680 : 420;
    jobs.push((now) => {
      const t = Math.min(1, (now - t0) / life);
      mesh.position.set(
        origin.x + dir.x * t * (wild ? 1.4 : 0.25),
        origin.y + Math.sin(t * Math.PI) * (wild ? 1.35 : 0.28),
        origin.z + dir.z * t * (wild ? 1.4 : 0.25)
      );
      if (wild) {
        mesh.rotation.x += spin;
        mesh.rotation.z += spin * 0.7;
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
    const ball = addSprite(flashTex, 0xfff1c2, 0.85);
    const muzzle = from.clone().addScaledVector(dir, 0.4);
    muzzle.y = 0.34;
    ball.position.copy(muzzle);
    const t0 = performance.now();
    jobs.push((now) => {
      const t = Math.min(1, (now - t0) / CANNON_FLIGHT_MS);
      ball.position.lerpVectors(muzzle, to.clone().setY(0.3), t);
      if (t >= 1) {
        layer.remove(ball);
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
      const kick = Math.sin(t * Math.PI) * 0.14;
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
      new THREE.BoxGeometry(0.28, 0.72, len),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.9, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide
      })
    );
    mesh.position.set((from.x + to.x) / 2, 0.38, (from.z + to.z) / 2);
    mesh.rotation.y = Math.atan2(dx, dz);
    layer.add(mesh);
    const t0 = performance.now();
    jobs.push((now) => {
      const t = Math.min(1, (now - t0) / 520);
      mesh.material.opacity = 0.85 * (1 - t);
      mesh.scale.x = 1 + t * 2;
      if (t >= 1) {
        layer.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
        return false;
      }
      return true;
    });
  }

  function ringAt(at, color, life) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.12, 0.2, 28),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false
      })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(at.x, 0.03, at.z);
    layer.add(mesh);
    const t0 = performance.now();
    jobs.push((now) => {
      const t = Math.min(1, (now - t0) / life);
      mesh.scale.setScalar(1 + t * 3.2);
      mesh.material.opacity = 0.9 * (1 - t);
      if (t >= 1) {
        layer.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
        return false;
      }
      return true;
    });
  }

  function ensureArmy() {
    if (horses) return;
    const horseMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.62, metalness: 0.04,
      emissive: 0x1a120c, emissiveIntensity: 0.35
    });
    const manMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.58, metalness: 0.05,
      emissive: 0x1a120c, emissiveIntensity: 0.35
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
    const brown = new THREE.Color('#6b4428');
    const gold = new THREE.Color('#e6c56a');
    for (let i = 0; i < 28; i++) horses.setColorAt(i, i % 5 === 0 ? gold : brown);
    layer.add(horses);
    layer.add(soldiers);
  }

  function layoutCharge(mesh, count, cols, king, dirZ, opts) {
    const color = new THREE.Color(opts.tint);
    const accent = new THREE.Color(opts.accent);
    const { scale, laneGap, rowGap, zBias } = opts;
    // Same travel for every rank so the column keeps its depth instead of collapsing on the king.
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
      mesh.userData.paths[i] = {
        x0: lane,
        z0,
        x1: king.x * 0.25 + lane * 0.78,
        z1: z0 + dirZ * travel,
        phase: i * 0.37
      };
      const path = mesh.userData.paths[i];
      const yaw = yawFacing(path.x1 - path.x0, path.z1 - path.z0);
      _q.setFromAxisAngle(_UP, yaw);
      _s.set(scale, scale, scale);
      _p.set(path.x0, 0, path.z0);
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
    horses.material.transparent = true;
    soldiers.material.transparent = true;
    const state = {
      running: true, mate: !!mate, called: false, done: false, dead: false, onDone, t0: performance.now()
    };
    check = state;

    const dust = [];
    for (let i = 0; i < 36; i++) {
      const s = addSprite(dustTex, 0xc4a06e, 0.85 + (i % 5) * 0.18);
      s.material.blending = THREE.NormalBlending;
      dust.push(s);
    }

    jobs.push((now) => {
      if (state.dead) {
        horses.visible = false;
        soldiers.visible = false;
        for (const s of dust) {
          layer.remove(s);
          s.material.dispose();
        }
        return false;
      }
      const t = (now - state.t0) / CHECK_RUN_MS;
      const fade = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
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
          const yaw = yawFacing(path.x1 - path.x0, path.z1 - path.z0);
          _q.setFromAxisAngle(_UP, yaw);
          _q2.setFromAxisAngle(_RIGHT, gallop * 0.22);
          _q.multiply(_q2);
          _s.set(scale, scale * (1 + gallop * 0.04), scale);
          mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.material.opacity = Math.max(0, fade);
        mesh.material.transparent = fade < 1;
      };
      if (!state.done) {
      step(horses);
      step(soldiers);
      for (let i = 0; i < dust.length; i++) {
        const s = dust[i];
        const herd = i < 16 ? horses.userData.paths : soldiers.userData.paths;
        const path = herd[i % herd.length];
        const u = Math.min(1, Math.max(0, t - 0.04));
        s.position.set(
          path.x0 + (path.x1 - path.x0) * u + ((i % 5) - 2) * 0.28,
          0.12 + (i % 3) * 0.08,
          path.z0 + (path.z1 - path.z0) * u - 0.35
        );
        s.material.opacity = Math.max(0, fade) * 0.65;
      }
      }
      if (!state.called && now - state.t0 >= CHECK_CALL_AT) {
        state.called = true;
        const said = state.mate ? '將死' : '將軍';
        setCall(said);
        playDrum();
        shout(said);
      }
      if (t >= 1 && !state.done) {
        state.done = true;
        horses.visible = false;
        soldiers.visible = false;
        for (const s of dust) {
          layer.remove(s);
          s.material.dispose();
        }
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

  function playCapture({ type, from, to, victim, mover }) {
    const dir = new THREE.Vector3().subVectors(to, from);
    dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    dir.normalize();
    const wild = type !== KING && type !== ADVISOR;

    if (type === CANNON) {
      playCannonSound();
      burst(from.clone().setY(0.35), flashTex, 0xfff1c2, 10, 1.1, 260);
      const aim = shot(from, to);
      if (mover) recoil(mover, aim);
      const t0 = performance.now();
      jobs.push((now) => {
        if (now - t0 < CANNON_FLIGHT_MS) return true;
        burst(to.clone().setY(0.25), flashTex, 0xffe2a0, 18, 2.4, 720);
        burst(to.clone().setY(0.2), smokeTex, 0x888888, 10, 1.1, 860);
        ringAt(to, 0xffb060, 480);
        if (victim) launchVictim(victim, dir, true);
        return false;
      });
      return;
    }

    if (victim) launchVictim(victim, dir, wild);
    if (type === ROOK) beam(from, to, 0xf0d090);
    else if (type === HORSE) burst(to.clone().setY(0.05), dustTex, 0xc4a06e, 10, 0.8, 480);
    else if (type === ELEPHANT) ringAt(to, 0xd7c4a0, 420);
    else if (type === PAWN) burst(to.clone().setY(0.2), flashTex, 0xffd0a0, 8, 0.9, 360);
    else ringAt(to, 0xf0d78a, 360);
  }

  return {
    unlock() {
      withAudio(() => {});
      window.speechSynthesis?.getVoices();
    },
    clear() {
      hideCall();
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
    tick(now) {
      for (let i = jobs.length - 1; i >= 0; i--) {
        if (!jobs[i](now)) jobs.splice(i, 1);
      }
    },
    playCapture,
    playCheck
  };
}
