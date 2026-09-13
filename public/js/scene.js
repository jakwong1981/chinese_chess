// Three.js scene, camera, lighting, and a lightweight orbit control (drag to rotate, wheel/pinch to zoom).
// Camera elevation is bound to the #cam-elev slider; azimuth is user-controlled via drag on empty space.

import * as THREE from 'three';
import { createBoardGroup, BOARD_H, BOARD_W } from './board.js';

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
    this.scene.background = new THREE.Color(0x0b1120);
    this.scene.fog = new THREE.Fog(0x0b1120, 18, 40);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    this.camTarget = new THREE.Vector3(0, 0, 0);
    this.camDistance = 13;
    this.camAzimuth = 0;      // radians; 0 = red at bottom
    this.camElevation = 48;   // degrees

    this._addLights();
    this._addEnvironment();

    this.boardGroup = createBoardGroup();
    this.scene.add(this.boardGroup);

    this.pieceLayer = new THREE.Group();
    this.pieceLayer.name = 'pieces';
    this.scene.add(this.pieceLayer);

    this.markerLayer = new THREE.Group();
    this.markerLayer.name = 'markers';
    this.scene.add(this.markerLayer);

    this.flyingGeneralBeam = this._makeLaserBeam();
    this.scene.add(this.flyingGeneralBeam);

    this._updateCamera();
    this._bindResize();
  }

  _addLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.45);
    this.scene.add(ambient);

    const key = new THREE.DirectionalLight(0xfff2d6, 1.15);
    key.position.set(6, 12, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -8;
    key.shadow.camera.right = 8;
    key.shadow.camera.top = 8;
    key.shadow.camera.bottom = -8;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 30;
    key.shadow.bias = -0.0005;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0x8fb6ff, 0.35);
    fill.position.set(-6, 8, -4);
    this.scene.add(fill);

    const rim = new THREE.PointLight(0xffb070, 0.6, 20);
    rim.position.set(0, 4, -8);
    this.scene.add(rim);
  }

  _addEnvironment() {
    // Subtle ground plane to catch shadows beyond the board
    const g = new THREE.PlaneGeometry(60, 60);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.ShadowMaterial({ opacity: 0.28 });
    const plane = new THREE.Mesh(g, m);
    plane.position.y = -0.28;
    plane.receiveShadow = true;
    this.scene.add(plane);
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
    this.camDistance = Math.max(6, Math.min(22, d));
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
    // Pull camera back on narrow screens so the whole board fits.
    const fit = Math.max(BOARD_W + 3, (BOARD_H + 3) / Math.max(0.35, this.camera.aspect * 0.75));
    this.camDistance = Math.max(9, Math.min(20, fit * 1.05));
    this.camera.updateProjectionMatrix();
    this._updateCamera();
  }

  render() {
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
