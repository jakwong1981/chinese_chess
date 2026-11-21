// Three.js scene, camera, lighting, and a lightweight orbit control (drag to rotate, wheel/pinch to zoom).
// Camera elevation is bound to the #cam-elev slider; azimuth is user-controlled via drag on empty space.

import * as THREE from 'three';
import { createBoardGroup, tickBoard, BOARD_H } from './board.js';
import { createTeaTable } from './teatable.js';
import { createFx } from './fx.js';

export class Scene {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xdce8e5);
    this.scene.fog = null;

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 300);
    this.camTarget = new THREE.Vector3(0, 0, -0.8);
    this.camDistance = 13;
    this.camAzimuth = 0;      // radians; 0 = red at bottom
    this.camElevation = 32;   // seated first-person view from the red side

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

    this.fx = createFx(this.scene);

    this._updateCamera();
    this._bindResize();
  }

  _addLights() {
    const ambient = new THREE.AmbientLight(0xfff6ea, 0.48);
    this.scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0xe4edf2, 0x7a6750, 0.62);
    this.scene.add(hemi);

    const sunlight = new THREE.DirectionalLight(0xfff0d2, 1.45);
    sunlight.position.set(12, 32, -45);
    sunlight.castShadow = true;
    sunlight.shadow.mapSize.set(2048, 2048);
    sunlight.shadow.camera.left = -30;
    sunlight.shadow.camera.right = 30;
    sunlight.shadow.camera.top = 30;
    sunlight.shadow.camera.bottom = -30;
    sunlight.shadow.camera.near = 1;
    sunlight.shadow.camera.far = 120;
    sunlight.shadow.bias = -0.0005;
    this.scene.add(sunlight);

    const bounce = new THREE.DirectionalLight(0xc7dcef, 0.28);
    bounce.position.set(-8, 16, 12);
    this.scene.add(bounce);
  }

  _makeLaserBeam() {
    // Vertical警示 beam triggered when the two kings face each other illegally.
    const geom = new THREE.CylinderGeometry(0.06, 0.06, BOARD_H + 1, 12, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff2020, transparent: true, opacity: 0.0,
      blending: THREE.AdditiveBlending, depthWrite: false
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
    this._updateCamera();
  }
  setDistance(d) {
    this.camDistance = Math.max(6, Math.min(140, d));
    this._updateCamera();
  }
  setAzimuth(rad) {
    this.camAzimuth = rad;
    this._updateCamera();
  }

  flip() {
    this.camAzimuth += Math.PI;
    this._updateCamera();
  }

  _updateCamera() {
    const el = THREE.MathUtils.degToRad(this.camElevation);
    const az = this.camAzimuth;
    const d = this.camDistance;
    const x = this.camTarget.x + d * Math.cos(el) * Math.sin(az);
    const y = this.camTarget.y + d * Math.sin(el);
    const z = this.camTarget.z + d * Math.cos(el) * Math.cos(az);
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
    this.camera.aspect = w / h;
    // Stay at the player's seat; step back slightly on narrow screens so the
    // whole board remains visible without switching to an overhead camera.
    this.camDistance = Math.min(60, 13 * Math.max(1, 1.1 / this.camera.aspect));
    this.camera.updateProjectionMatrix();
    this._updateCamera();
  }

  render() {
    tickBoard(this.boardGroup, performance.now() / 1000);
    this.renderer.render(this.scene, this.camera);
  }

  startLoop(cb) {
    const loop = () => {
      this.rafId = requestAnimationFrame(loop);
      cb?.();
      this.render();
    };
    loop();
  }
  stopLoop() { if (this.rafId) cancelAnimationFrame(this.rafId); }
}
