// Pointer input: fast board-plane grid picking, cached canvas rect (no layout reflow),
// drag-and-drop, click-to-move, hover feedback, camera orbit + zoom.
// Mobile touch adds +0.35 world-unit Y offset to the dragged piece so the finger doesn't hide it.

import * as THREE from 'three';
import { PIECE_BASE_Y, PIECE_RADIUS } from './pieces.js';
import { gridToWorld, worldToGrid } from './board.js';

const DRAG_LIFT_DESKTOP = 0.15;
const DRAG_LIFT_TOUCH = 0.35; // spec: +0.35 grid unit on touch
const PICK_RADIUS_SQ = (PIECE_RADIUS * 1.25) ** 2;

export class Input {
  constructor(scene, canvas, hooks) {
    this.scene = scene;
    this.canvas = canvas;
    this.hooks = hooks; // { onSelect, onMove, onHover, isOwnPiece, isInteractionEnabled, getPieceAt }
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.isTouch = false;
    this._rect = null;
    this._hitPlane = null;

    this.selected = null;      // {x,y,mesh}
    this.dragging = null;      // {x,y,mesh,lift}
    this.lastPointer = null;   // for camera orbit
    this.cameraMode = false;   // right-button or 2-finger
    this.pinchStart = null;
    this._lastHover = null;

    this._refreshRect();
    const prevOnResize = scene.onResize;
    scene.onResize = () => {
      prevOnResize?.();
      this._refreshRect();
    };
    window.addEventListener('scroll', () => this._refreshRect(), { passive: true });
    this._bind();
  }

  _refreshRect() {
    this._rect = this.canvas.getBoundingClientRect();
  }

  _bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      this.scene.fx?.unlock();
      this._onDown(e);
    });
    c.addEventListener('pointermove', (e) => this._onMove(e));
    c.addEventListener('pointerup', (e) => this._onUp(e));
    c.addEventListener('pointercancel', (e) => this._onUp(e));
    c.addEventListener('pointerleave', (e) => this._onUp(e));
    c.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('touchstart', () => { this.isTouch = true; }, { once: true });
  }

  _setPointer(e) {
    const rect = this._rect || this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  _raycastPlane() {
    if (!this._hitPlane) this._hitPlane = this.scene.boardGroup.getObjectByName('hitPlane');
    if (!this._hitPlane) return null;
    this.raycaster.setFromCamera(this.pointer, this.scene.camera);
    const hits = this.raycaster.intersectObject(this._hitPlane, false);
    if (!hits.length) return null;
    return hits[0].point;
  }

  _pickPiece(planePoint) {
    // Fast O(1) board-grid lookup avoids triangle-raycasting 32 high-poly LatheGeometries
    const pt = planePoint || this._raycastPlane();
    if (pt && this.hooks.getPieceAt) {
      const g = worldToGrid(pt);
      if (g.x >= 0 && g.x <= 8 && g.y >= 0 && g.y <= 9) {
        const center = gridToWorld(g.x, g.y, 0);
        const dx = pt.x - center.x;
        const dz = pt.z - center.z;
        if (dx * dx + dz * dz <= PICK_RADIUS_SQ) {
          const mesh = this.hooks.getPieceAt(g.x, g.y);
          if (mesh) return mesh;
        }
      }
      return null;
    }
    this.raycaster.setFromCamera(this.pointer, this.scene.camera);
    const hits = this.raycaster.intersectObjects(this.scene.pieceLayer.children, false);
    return hits[0]?.object || null;
  }

  _onDown(e) {
    if (e.pointerType === 'touch') this.isTouch = true;
    this._refreshRect();
    this.canvas.setPointerCapture?.(e.pointerId);
    this._setPointer(e);

    if (e.button === 2 || e.button === 1 || e.altKey) {
      this.cameraMode = true;
      this.lastPointer = { x: e.clientX, y: e.clientY };
      return;
    }

    if (!this.hooks.isInteractionEnabled?.()) return;

    const point = this._raycastPlane();
    const mesh = this._pickPiece(point);
    if (mesh) {
      const { x, y } = mesh.userData.gridPos || {};
      if (x == null) return;
      const piece = mesh.userData.piece;
      const own = this.hooks.isOwnPiece?.(piece.side);

      if (this.selected && own && this.selected.x === x && this.selected.y === y) {
        this._startDrag(mesh, x, y);
        return;
      }
      if (this.selected && !own) {
        this._commitMove(x, y);
        return;
      }
      if (this.selected && own) {
        this._select(mesh, x, y);
        return;
      }
      if (own) {
        this._select(mesh, x, y);
        this._startDrag(mesh, x, y);
        return;
      }
      return;
    }

    if (!point) return;
    const g = worldToGrid(point);
    if (this.selected) {
      this._commitMove(g.x, g.y);
    } else {
      this.cameraMode = true;
      this.lastPointer = { x: e.clientX, y: e.clientY };
    }
  }

  _onMove(e) {
    this._setPointer(e);
    if (this.cameraMode && this.lastPointer) {
      const dx = e.clientX - this.lastPointer.x;
      const dy = e.clientY - this.lastPointer.y;
      this.lastPointer = { x: e.clientX, y: e.clientY };
      this.scene.camAzimuth += dx * 0.008;
      this.scene.setElevation(this.scene.camElevation + dy * 0.15);
      return;
    }
    if (this.dragging) {
      const point = this._raycastPlane();
      if (point) {
        this.dragging.mesh.position.x = point.x;
        this.dragging.mesh.position.z = point.z;
        this.scene.requestShadowUpdate();
      }
      return;
    }
    // Lightweight hover feedback
    const mesh = this._pickPiece();
    if (mesh !== this._lastHover) {
      this._lastHover = mesh;
      this.canvas.style.cursor = mesh ? 'pointer' : 'default';
      this.hooks.onHover?.(mesh);
    }
  }

  _onUp(e) {
    if (this.cameraMode) {
      this.cameraMode = false;
      this.lastPointer = null;
      return;
    }
    if (this.dragging) {
      const { mesh, x: fromX, y: fromY } = this.dragging;
      const point = this._raycastPlane();
      const drop = point ? worldToGrid(point) : null;
      const home = gridToWorld(fromX, fromY, PIECE_BASE_Y);
      mesh.position.copy(home);
      mesh.scale.setScalar(1);
      this.dragging = null;
      this.scene.requestShadowUpdate();
      if (drop && (drop.x !== fromX || drop.y !== fromY)) {
        this._commitMove(drop.x, drop.y);
      }
      return;
    }
    this.canvas.releasePointerCapture?.(e.pointerId);
  }

  _onWheel(e) {
    e.preventDefault();
    const d = e.deltaY * 0.01;
    this.scene.setDistance(this.scene.camDistance + d);
  }

  _select(mesh, x, y) {
    this.clearSelection();
    this.selected = { x, y, mesh };
    this.scene.fx?.playSelect?.();
    this.hooks.onSelect?.({ x, y, mesh });
  }

  _startDrag(mesh, x, y) {
    const lift = this.isTouch ? DRAG_LIFT_TOUCH : DRAG_LIFT_DESKTOP;
    this.dragging = { mesh, x, y, lift };
    mesh.position.y = PIECE_BASE_Y + lift;
    mesh.userData.baseScale = mesh.scale.x;
    mesh.scale.setScalar(1.08);
    this.scene.requestShadowUpdate();
  }

  _commitMove(toX, toY) {
    if (!this.selected) return;
    const { x: fromX, y: fromY } = this.selected;
    const ok = this.hooks.onMove?.({ fromX, fromY, toX, toY });
    if (!ok) {
      this.hooks.onReject?.({ fromX, fromY, toX, toY });
    }
  }

  clearSelection() {
    this.selected = null;
    if (this.dragging) {
      const m = this.dragging.mesh;
      const home = gridToWorld(this.dragging.x, this.dragging.y, PIECE_BASE_Y);
      m.position.copy(home);
      m.scale.setScalar(1);
      this.dragging = null;
      this.scene.requestShadowUpdate();
    }
    this.hooks.onSelectionCleared?.();
  }

  // Pinch-zoom for touch
  handleTouchMulti(touches) {
    if (touches.length === 2) {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      if (this.pinchStart == null) this.pinchStart = { dist, cam: this.scene.camDistance };
      const ratio = this.pinchStart.dist / Math.max(1, dist);
      this.scene.setDistance(this.pinchStart.cam * ratio);
    }
  }
  endTouchMulti() { this.pinchStart = null; }
}
