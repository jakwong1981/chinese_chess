// Three.js scene, IBL lighting, focused on-demand shadows, selective UnrealBloomPass,
// smooth camera damping + shake, quality presets, and lightweight orbit controls.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { createBoardGroup, tickBoard, triggerRiverRipple, BOARD_H } from './board.js';
import { createTeaTable, tickTeaTable } from './teatable.js';
import { tickMarkers } from './pieces.js';
import { createFx } from './fx.js';

const QUALITY_PRESETS = {
  high:   { dprCap: 2.0, bloom: true,  shadows: true,  shadowSize: 2048 },
  medium: { dprCap: 1.5, bloom: false, shadows: true,  shadowSize: 1024 },
  low:    { dprCap: 1.0, bloom: false, shadows: false, shadowSize: 512 }
};

export class Scene {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.86;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xdce8e5);
    this.scene.fog = new THREE.Fog(0xdce8e5, 48, 125);

    // IBL environment lighting (zero external assets)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this._envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this._envRT.texture;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 300);
    this.camTarget = new THREE.Vector3(0, 0, -0.8);

    // Smooth camera state (actual vs target for exponential damping)
    this.camDistance = 13;
    this.camAzimuth = 0;
    this.camElevation = 32;
    this._curDistance = 13;
    this._curAzimuth = 0;
    this._curElevation = 32;

    // Camera FX (shake + check zoom pulse)
    this._shake = { intensity: 0, until: 0, dur: 1 };
    this._zoomPulse = { delta: 0, start: 0, dur: 0 };

    this._addLights();

    this.boardGroup = createBoardGroup();
    this.scene.add(this.boardGroup);

    this.teaTable = createTeaTable();
    this.scene.add(this.teaTable);

    this.pieceLayer = new THREE.Group();
    this.pieceLayer.name = 'pieces';
    this.scene.add(this.pieceLayer);

    this.markerLayer = new THREE.Group();
    this.markerLayer.name = 'markers';
    this.scene.add(this.markerLayer);

    this.flyingGeneralBeam = this._makeLaserBeam();
    this.scene.add(this.flyingGeneralBeam);

    this.fx = createFx(this.scene, {
      shake: (i, d) => this.shake(i, d),
      pulseZoom: (delta, d) => this.pulseZoom(delta, d),
      requestShadowUpdate: () => this.requestShadowUpdate()
    });

    // Post-processing composer (high-threshold bloom so only HDR FX glow, never wood/pieces)
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.22, 0.32, 1.15);
    this.outputPass = new OutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.outputPass);

    // Default quality based on device class
    const isMobile = window.matchMedia?.('(max-width: 768px)').matches;
    this.quality = isMobile ? 'medium' : 'high';
    this._applyQuality();

    this._updateCamera(1, performance.now());
    this._bindResize();
    this.requestShadowUpdate();
  }

  _addLights() {
    const ambient = new THREE.AmbientLight(0xfff4e4, 0.22);
    this.scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0xe4edf2, 0x6e5c48, 0.36);
    this.scene.add(hemi);

    const sunlight = new THREE.DirectionalLight(0xffe9ca, 0.95);
    sunlight.position.set(16, 38, -28);
    sunlight.castShadow = true;
    sunlight.shadow.mapSize.set(2048, 2048);
    // Tight frustum focused on the board & immediate tea props -> 4x sharper piece shadows
    sunlight.shadow.camera.left = -9.5;
    sunlight.shadow.camera.right = 9.5;
    sunlight.shadow.camera.top = 9.5;
    sunlight.shadow.camera.bottom = -9.5;
    sunlight.shadow.camera.near = 25;
    sunlight.shadow.camera.far = 85;
    sunlight.shadow.bias = -0.00025;
    sunlight.shadow.normalBias = 0.025;
    this.sunlight = sunlight;
    this.scene.add(sunlight);

    const bounce = new THREE.DirectionalLight(0xc7dcef, 0.18);
    bounce.position.set(-10, 18, 14);
    this.scene.add(bounce);
  }

  setQuality(level) {
    if (!QUALITY_PRESETS[level]) return;
    this.quality = level;
    this._applyQuality();
    this.resize();
    this.requestShadowUpdate();
  }

  _applyQuality() {
    const cfg = QUALITY_PRESETS[this.quality] || QUALITY_PRESETS.high;
    this._useBloom = cfg.bloom;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cfg.dprCap));
    this.renderer.shadowMap.enabled = cfg.shadows;
    if (this.sunlight) {
      this.sunlight.castShadow = cfg.shadows;
      if (this.sunlight.shadow.mapSize.x !== cfg.shadowSize) {
        this.sunlight.shadow.mapSize.set(cfg.shadowSize, cfg.shadowSize);
        if (this.sunlight.shadow.map) {
          this.sunlight.shadow.map.dispose();
          this.sunlight.shadow.map = null;
        }
      }
    }
  }

  requestShadowUpdate() {
    if (this.renderer.shadowMap.enabled) {
      this.renderer.shadowMap.needsUpdate = true;
    }
  }

  triggerRiverRipple(worldX, worldZ = 0) {
    triggerRiverRipple(this.boardGroup, worldX, worldZ);
  }

  shake(intensity = 0.15, durationMs = 220) {
    const now = performance.now();
    this._shake.intensity = Math.max(this._shake.intensity, intensity);
    this._shake.until = Math.max(this._shake.until, now + durationMs);
    this._shake.dur = durationMs;
  }

  pulseZoom(deltaDist = -1.1, durationMs = 1500) {
    this._zoomPulse = { delta: deltaDist, start: performance.now(), dur: durationMs };
  }

  _makeLaserBeam() {
    const geom = new THREE.CylinderGeometry(0.06, 0.06, BOARD_H + 1, 12, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff2020, transparent: true, opacity: 0.0,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
    });
    const beam = new THREE.Mesh(geom, mat);
    beam.visible = false;
    return beam;
  }

  showFlyingGeneralBeam(fileX, zTop, zBottom, on) {
    this.flyingGeneralBeam.visible = on;
    if (!on) { this.flyingGeneralBeam.material.opacity = 0; return; }
    this.flyingGeneralBeam.position.set(fileX, 0.15, (zTop + zBottom) / 2);
    this.flyingGeneralBeam.scale.y = Math.abs(zTop - zBottom) / (BOARD_H + 1);
    this.flyingGeneralBeam.material.opacity = 0.85;
  }

  setElevation(deg) {
    this.camElevation = Math.max(15, Math.min(80, deg));
  }
  setDistance(d) {
    this.camDistance = Math.max(6, Math.min(140, d));
  }
  setAzimuth(rad) {
    this.camAzimuth = rad;
  }

  flip() {
    this.camAzimuth += Math.PI;
  }

  _updateCamera(dt, now) {
    const damp = dt >= 1 ? 1 : 1 - Math.exp(-10 * dt);
    this._curElevation += (this.camElevation - this._curElevation) * damp;
    this._curAzimuth += (this.camAzimuth - this._curAzimuth) * damp;
    this._curDistance += (this.camDistance - this._curDistance) * damp;

    let zoomOffset = 0;
    if (this._zoomPulse.dur > 0) {
      const elapsed = now - this._zoomPulse.start;
      if (elapsed < this._zoomPulse.dur) {
        const u = elapsed / this._zoomPulse.dur;
        zoomOffset = Math.sin(u * Math.PI) * this._zoomPulse.delta;
      } else {
        this._zoomPulse.dur = 0;
      }
    }

    const el = THREE.MathUtils.degToRad(this._curElevation);
    const az = this._curAzimuth;
    const d = Math.max(6, this._curDistance + zoomOffset);
    let x = this.camTarget.x + d * Math.cos(el) * Math.sin(az);
    let y = this.camTarget.y + d * Math.sin(el);
    let z = this.camTarget.z + d * Math.cos(el) * Math.cos(az);

    // Camera shake offset
    if (now < this._shake.until) {
      const remain = Math.max(0, (this._shake.until - now) / this._shake.dur);
      const amp = this._shake.intensity * remain * remain;
      x += (Math.random() - 0.5) * amp * 2;
      y += (Math.random() - 0.5) * amp * 1.4;
      z += (Math.random() - 0.5) * amp * 2;
    } else {
      this._shake.intensity = 0;
    }

    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.camTarget);
  }

  _bindResize() {
    const host = this.canvas.parentElement;
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(host);
    this.resize();
  }

  resize() {
    const host = this.canvas.parentElement;
    if (!host) return;
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloomPass.resolution.set(w, h);
    this.camera.aspect = w / h;
    this.camDistance = Math.min(60, 13 * Math.max(1, 1.1 / this.camera.aspect));
    this.camera.updateProjectionMatrix();
    this.onResize?.();
  }

  render(now = performance.now(), dt = 0.016) {
    const sec = now / 1000;
    this._updateCamera(dt, now);
    tickBoard(this.boardGroup, sec);
    tickTeaTable(this.teaTable, sec);
    tickMarkers(sec);
    if (this._useBloom) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  startLoop(cb) {
    let lastNow = performance.now();
    const loop = (now) => {
      this.rafId = requestAnimationFrame(loop);
      const dt = Math.min(0.05, Math.max(0.001, (now - lastNow) / 1000));
      lastNow = now;
      cb?.(now, dt);
      this.render(now, dt);
    };
    this.rafId = requestAnimationFrame(loop);
  }
  stopLoop() { if (this.rafId) cancelAnimationFrame(this.rafId); }
}
