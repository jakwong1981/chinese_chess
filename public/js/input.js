// Pointer input: raycast onto board plane, drag-and-drop, click-to-move, camera orbit + zoom.
// Mobile touch adds +0.35 world-unit Y offset to the dragged piece so the finger doesn't hide it.

import * as THREE from 'three';
import { PIECE_HEIGHT } from './pieces.js';
import { gridToWorld, worldToGrid, BOARD_Y } from './board.js';

const DRAG_LIFT_DESKTOP = 0.15;
const DRAG_LIFT_TOUCH = 0.35; // spec: +0.35 grid unit on touch

export class Input {
  constructor(scene, canvas, hooks) {
    this.scene = scene;
    this.canvas = canvas;
    this.hooks = hooks; // { onSelect, onMove, onHover, isOwnPiece, isInteractionEnabled }
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.isTouch = false;

    this.selected = null;      // {x,y,mesh}
    this.dragging = null;      // {x,y,mesh,offsetY}
    this.lastPointer = null;   // for camera orbit
    this.cameraMode = false;   // right-button or 2-finger
    this.pinchStart = null;

    this._bind();
  }

  _bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this._onDown(e));
    c.addEventListener('pointermove', (e) => this._onMove(e));
    c.addEventListener('pointerup', (e) => this._onUp(e));
    c.addEventListener('pointercancel', (e) => this._onUp(e));
    c.addEventListener('pointerleave', (e) => this._onUp(e));
    c.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('touchstart', () => { this.isTouch = true; }, { once: true });
  }

  _setPointer(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  _raycastPiece() {
    this.raycaster.setFromCamera(this.pointer, this.scene.camera);
    const hits = this.raycaster.intersectObjects(this.scene.pieceLayer.children, false);
    return hits[0]?.object || null;
  }

  _raycastPlane() {
    this.raycaster.setFromCamera(this.pointer, this.scene.camera);
    const hitPlane = this.scene.boardGroup.getObjectByName('hitPlane');
    const hits = this.raycaster.intersectObject(hitPlane, false);
    if (!hits.length) return null;
    return hits[0].point;
  }

  _onDown(e) {
    if (e.pointerType === 'touch') this.isTouch = true;
    this.canvas.setPointerCapture?.(e.pointerId);
    this._setPointer(e);

    // Camera orbit triggers: right mouse button, or middle, or 2-finger touch (handled separately).
    if (e.button === 2 || e.button === 1 || e.altKey) {
      this.cameraMode = true;
      this.lastPointer = { x: e.clientX, y: e.clientY };
      return;
    }

    if (!this.hooks.isInteractionEnabled?.()) return;

    const mesh = this._raycastPiece();
    if (mesh) {
      const { x, y } = mesh.userData.gridPos || {};
      if (x == null) return;
      const piece = mesh.userData.piece;
      const own = this.hooks.isOwnPiece?.(piece.side);

      if (this.selected && own && this.selected.x === x && this.selected.y === y) {
        // Click on already-selected piece → start drag
        this._startDrag(mesh, x, y);
        return;
      }
      if (this.selected && !own) {
        // Attempt to capture the enemy piece by clicking it
        this._commitMove(x, y);
        return;
      }
      if (this.selected && own) {
        // Switch selection
        this._select(mesh, x, y);
        return;
      }
      if (own) {
        this._select(mesh, x, y);
        // Immediately allow drag after selection
        this._startDrag(mesh, x, y);
        return;
      }
      // Clicking an enemy piece with nothing selected — show info only.
      return;
    }

    // Clicked empty board area
    const point = this._raycastPlane();
    if (!point) return;
    const g = worldToGrid(point);
    if (this.selected) {
      this._commitMove(g.x, g.y);
    } else {
      // Drag on empty space rotates the camera.
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
      }
      return;
    }
    // Hover feedback
    const mesh = this._raycastPiece();
    this.canvas.style.cursor = mesh ? 'pointer' : 'default';
    this.hooks.onHover?.(mesh);
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
      // Snap back visually
      const home = gridToWorld(fromX, fromY, PIECE_HEIGHT / 2);
      mesh.position.copy(home);
      this.dragging = null;
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
    this.hooks.onSelect?.({ x, y, mesh });
  }

  _startDrag(mesh, x, y) {
    const lift = this.isTouch ? DRAG_LIFT_TOUCH : DRAG_LIFT_DESKTOP;
    this.dragging = { mesh, x, y, lift };
    const p = mesh.position;
    p.y = PIECE_HEIGHT / 2 + lift;
    mesh.userData.baseScale = mesh.scale.x;
    mesh.scale.setScalar(1.08);
  }

  _commitMove(toX, toY) {
    if (!this.selected) return;
    const { x: fromX, y: fromY } = this.selected;
    const ok = this.hooks.onMove?.({ fromX, fromY, toX, toY });
    if (!ok) {
      // Rejected — keep the current selection so the user can try again.
      this.hooks.onReject?.({ fromX, fromY, toX, toY });
    }
  }

  clearSelection() {
    this.selected = null;
    if (this.dragging) {
      const m = this.dragging.mesh;
      const home = gridToWorld(this.dragging.x, this.dragging.y, PIECE_HEIGHT / 2);
      m.position.copy(home);
      m.scale.setScalar(1);
      this.dragging = null;
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
