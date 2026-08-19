/**
 * interaction.js — Drag & Drop, Rotation, Selection, Resize
 * Handles all mouse/touch interactions on the canvas.
 */

class InteractionController {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {CanvasRenderer} renderer
   * @param {function} onChange — callback when state changes
   */
  constructor(canvas, renderer, onChange) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.onChange = onChange;

    this.room = null;
    this.furnitureList = [];
    this.zoomCtrl = null;

    // Mode & Drag state
    this.mode = 'select'; // 'select' | 'draw_zone'
    this.drawZoneStart = null;
    this.isDragging = false;
    this.dragTarget = null;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;

    // Selection
    this.selectedFurniture = null;
    this.multiSelectedFurniture = [];

    // Bind events
    this._bindEvents();
  }

  startDrawZoneMode() {
    this.mode = 'draw_zone';
    this.deselect();
    this.canvas.style.cursor = 'crosshair';
  }

  cancelDrawZoneMode() {
    this.mode = 'select';
    this.drawZoneStart = null;
    this.renderer.drawingZone = null;
    this.canvas.style.cursor = 'default';
    this.renderer.requestRender();
  }

  init(room, furnitureList, zoomCtrl) {
    this.room = room;
    this.furnitureList = furnitureList;
    this.zoomCtrl = zoomCtrl;
  }

  // ─── Event Binding ────────────────────────────────────

  _bindEvents() {
    // Mouse events
    this.canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
    this.canvas.addEventListener('mouseup', (e) => this._onMouseUp(e));
    this.canvas.addEventListener('dblclick', (e) => this._onDoubleClick(e));
    this.canvas.addEventListener('contextmenu', (e) => this._onContextMenu(e));
    this.canvas.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });

    // Touch events
    this.canvas.addEventListener('touchstart', (e) => this._onTouchStart(e), { passive: false });
    this.canvas.addEventListener('touchmove', (e) => this._onTouchMove(e), { passive: false });
    this.canvas.addEventListener('touchend', (e) => this._onTouchEnd(e));

    // Keyboard
    document.addEventListener('keydown', (e) => this._onKeyDown(e));
  }

  // ─── Coordinate Helpers ───────────────────────────────

  _getCanvasPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  _getRoomPos(canvasPos) {
    return this.zoomCtrl.canvasToRoom(canvasPos.x, canvasPos.y, this.room);
  }

  /** Find furniture at a room position (top-most first) */
  _hitTest(roomX, roomY) {
    // Iterate in reverse for z-order (last = top)
    for (let i = this.furnitureList.length - 1; i >= 0; i--) {
      if (this.furnitureList[i].containsPoint(roomX, roomY)) {
        return this.furnitureList[i];
      }
    }
    return null;
  }

  /** Check if clicking the rotate handle of the selected furniture */
  _hitRotateHandle(canvasPos) {
    if (!this.selectedFurniture) return false;
    const furn = this.selectedFurniture;
    const b = furn.bounds;
    const ppm = this.zoomCtrl.ppm(this.room);
    const handleX = ((b.left + b.right) / 2) * ppm + this.zoomCtrl.panX;
    const handleY = b.top * ppm + this.zoomCtrl.panY - 25;
    const dx = canvasPos.x - handleX;
    const dy = canvasPos.y - handleY;
    return (dx * dx + dy * dy) <= 100; // 10px radius
  }

  // ─── Selection ────────────────────────────────────────

  select(furn) {
    if (this.selectedFurniture) {
      this.selectedFurniture.isSelected = false;
    }
    this.selectedFurniture = furn;
    if (furn) {
      furn.isSelected = true;
      // Move to top of render order
      const idx = this.furnitureList.indexOf(furn);
      if (idx > -1) {
        this.furnitureList.splice(idx, 1);
        this.furnitureList.push(furn);
      }
    }
    this.renderer.selectedFurniture = furn;
    this.renderer.requestRender();
    this.onChange('select', furn);
  }

  deselect() {
    this.select(null);
  }

  // ─── Mouse Handlers ───────────────────────────────────

  _onMouseDown(e) {
    if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
      // Middle-click or Ctrl+click: pan
      e.preventDefault();
      this.zoomCtrl.startPan(e.clientX, e.clientY);
      return;
    }

    if (e.button !== 0) return;

    const canvasPos = this._getCanvasPos(e);
    const roomPos = this._getRoomPos(canvasPos);

    // If in Draw Zone mode
    if (this.mode === 'draw_zone') {
      const rw = this.room.widthM;
      const rh = this.room.heightM;
      const clampedX = Math.max(0, Math.min(rw, roomPos.x));
      const clampedY = Math.max(0, Math.min(rh, roomPos.y));
      this.drawZoneStart = { x: clampedX, y: clampedY };
      this.renderer.drawingZone = { left: clampedX, top: clampedY, right: clampedX, bottom: clampedY };
      this.renderer.requestRender();
      return;
    }

    // Check rotate handle first
    if (this._hitRotateHandle(canvasPos)) {
      if (this.selectedFurniture) {
        this.selectedFurniture.rotate90();
        Collision.clampToRoom(this.selectedFurniture, this.room);
        Collision.checkAll(this.furnitureList, this.room);
        this.renderer.requestRender();
        this.onChange('rotate', this.selectedFurniture);
      }
      return;
    }

    const hit = this._hitTest(roomPos.x, roomPos.y);

    if (hit) {
      // Check for Shift multi-selection (to create a relation between 2 pieces)
      if (e.shiftKey && this.selectedFurniture && this.selectedFurniture !== hit) {
        const first = this.selectedFurniture;
        this.select(hit);
        this.onChange('multi_select', [first, hit]);
        return;
      }

      this.select(hit);
      this.isDragging = true;
      this.dragTarget = hit;
      this.dragOffsetX = roomPos.x - hit.x;
      this.dragOffsetY = roomPos.y - hit.y;
      this.canvas.style.cursor = 'grabbing';
    } else {
      this.deselect();
    }
  }

  _onMouseMove(e) {
    // Pan
    if (this.zoomCtrl.isPanning) {
      this.zoomCtrl.updatePan(e.clientX, e.clientY);
      this.renderer.requestRender();
      return;
    }

    const canvasPos = this._getCanvasPos(e);
    const roomPos = this._getRoomPos(canvasPos);

    // Zone drawing mode
    if (this.mode === 'draw_zone') {
      this.canvas.style.cursor = 'crosshair';
      if (this.drawZoneStart) {
        const rw = this.room.widthM;
        const rh = this.room.heightM;
        const clampedX = Math.max(0, Math.min(rw, roomPos.x));
        const clampedY = Math.max(0, Math.min(rh, roomPos.y));

        this.renderer.drawingZone = {
          left: Math.min(this.drawZoneStart.x, clampedX),
          top: Math.min(this.drawZoneStart.y, clampedY),
          right: Math.max(this.drawZoneStart.x, clampedX),
          bottom: Math.max(this.drawZoneStart.y, clampedY)
        };
        this.renderer.requestRender();
      }
      return;
    }

    if (this.isDragging && this.dragTarget) {
      // Move furniture
      this.dragTarget.x = roomPos.x - this.dragOffsetX;
      this.dragTarget.y = roomPos.y - this.dragOffsetY;

      // Apply snapping
      Snap.applyAll(this.dragTarget, this.furnitureList, this.room);

      // Clamp to room bounds
      Collision.clampToRoom(this.dragTarget, this.room);

      // Check collisions
      Collision.checkAll(this.furnitureList, this.room);

      this.renderer.requestRender();
      this.onChange('move', this.dragTarget);
    } else {
      // Hover detection
      const hit = this._hitTest(roomPos.x, roomPos.y);
      let changed = false;

      this.furnitureList.forEach(f => {
        const wasHovered = f.isHovered;
        f.isHovered = (f === hit);
        if (wasHovered !== f.isHovered) changed = true;
      });

      if (hit) {
        this.canvas.style.cursor = 'grab';
      } else if (this._hitRotateHandle(canvasPos)) {
        this.canvas.style.cursor = 'pointer';
      } else {
        this.canvas.style.cursor = 'default';
      }

      if (changed) {
        this.renderer.hoveredFurniture = hit;
        this.renderer.requestRender();
      }
    }
  }

  _onMouseUp(e) {
    if (this.zoomCtrl.isPanning) {
      this.zoomCtrl.endPan();
      return;
    }

    if (this.mode === 'draw_zone') {
      if (this.drawZoneStart && this.renderer.drawingZone) {
        const z = this.renderer.drawingZone;
        const w = z.right - z.left;
        const h = z.bottom - z.top;
        if (w >= 0.2 && h >= 0.2) {
          this.onChange('add_zone', z);
        }
      }
      this.drawZoneStart = null;
      this.renderer.drawingZone = null;
      this.mode = 'select';
      this.canvas.style.cursor = 'default';
      this.renderer.requestRender();
      this.onChange('exit_draw_zone');
      return;
    }

    if (this.isDragging) {
      this.isDragging = false;
      this.canvas.style.cursor = this.dragTarget ? 'grab' : 'default';
      Snap.guides = [];
      this.renderer.requestRender();
      this.onChange('drop', this.dragTarget);
      this.dragTarget = null;
    }
  }

  _onDoubleClick(e) {
    const canvasPos = this._getCanvasPos(e);
    const roomPos = this._getRoomPos(canvasPos);
    const hit = this._hitTest(roomPos.x, roomPos.y);
    if (hit) {
      this.select(hit);
      this.onChange('edit', hit);
    }
  }

  _onContextMenu(e) {
    e.preventDefault();
    const canvasPos = this._getCanvasPos(e);
    const roomPos = this._getRoomPos(canvasPos);
    const hit = this._hitTest(roomPos.x, roomPos.y);
    if (hit) {
      this.select(hit);
      hit.rotate90();
      Collision.clampToRoom(hit, this.room);
      Collision.checkAll(this.furnitureList, this.room);
      this.renderer.requestRender();
      this.onChange('rotate', hit);
    }
  }

  _onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1 : -1;
    const canvasPos = this._getCanvasPos(e);
    this.zoomCtrl.zoomAt(delta, canvasPos.x, canvasPos.y);
    this.renderer.requestRender();
    this.onChange('zoom', null);
  }

  // ─── Touch Handlers ───────────────────────────────────

  _onTouchStart(e) {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const fakeEvent = { button: 0, clientX: touch.clientX, clientY: touch.clientY, ctrlKey: false, preventDefault: () => {} };
      this._onMouseDown(fakeEvent);
    } else if (e.touches.length === 2) {
      e.preventDefault();
      // Two-finger: start pan
      const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      this.zoomCtrl.startPan(mx, my);
      this._pinchStartDist = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY
      );
      this._pinchStartZoom = this.zoomCtrl.zoom;
    }
  }

  _onTouchMove(e) {
    e.preventDefault();
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      this._onMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
    } else if (e.touches.length === 2) {
      const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      this.zoomCtrl.updatePan(mx, my);

      // Pinch zoom
      const dist = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY
      );
      if (this._pinchStartDist) {
        const scale = dist / this._pinchStartDist;
        this.zoomCtrl.setZoom(this._pinchStartZoom * scale);
      }
      this.renderer.requestRender();
    }
  }

  _onTouchEnd(e) {
    this._onMouseUp({});
    this._pinchStartDist = null;
  }

  // ─── Keyboard Handlers ────────────────────────────────

  _onKeyDown(e) {
    // Don't handle keys when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
      return;
    }

    const furn = this.selectedFurniture;

    switch (e.key) {
      case 'Delete':
      case 'Backspace':
        if (furn) {
          e.preventDefault();
          this.onChange('delete', furn);
        }
        break;

      case 'r':
      case 'R':
        if (furn) {
          furn.rotate90();
          Collision.clampToRoom(furn, this.room);
          Collision.checkAll(this.furnitureList, this.room);
          this.renderer.requestRender();
          this.onChange('rotate', furn);
        }
        break;

      case 'Escape':
        if (this.mode === 'draw_zone') {
          this.cancelDrawZoneMode();
          this.onChange('exit_draw_zone');
        } else {
          this.deselect();
        }
        break;

      case 'd':
      case 'D':
        if (e.ctrlKey && furn) {
          e.preventDefault();
          this.onChange('duplicate', furn);
        }
        break;

      // Arrow keys for fine movement
      case 'ArrowLeft':
        if (furn) { e.preventDefault(); furn.x -= 0.05; this._afterMove(furn); }
        break;
      case 'ArrowRight':
        if (furn) { e.preventDefault(); furn.x += 0.05; this._afterMove(furn); }
        break;
      case 'ArrowUp':
        if (furn) { e.preventDefault(); furn.y -= 0.05; this._afterMove(furn); }
        break;
      case 'ArrowDown':
        if (furn) { e.preventDefault(); furn.y += 0.05; this._afterMove(furn); }
        break;
    }
  }

  _afterMove(furn) {
    Collision.clampToRoom(furn, this.room);
    Collision.checkAll(this.furnitureList, this.room);
    this.renderer.requestRender();
    this.onChange('move', furn);
  }

  /**
   * Place a new furniture piece at the center of the visible canvas area.
   * @param {Furniture} furn
   */
  placeAtCenter(furn) {
    const centerCanvas = {
      x: this.renderer.logicalWidth / 2,
      y: this.renderer.logicalHeight / 2
    };
    const roomPos = this.zoomCtrl.canvasToRoom(centerCanvas.x, centerCanvas.y, this.room);
    furn.x = Math.max(furn.effectiveWidth / 2, Math.min(this.room.widthM - furn.effectiveWidth / 2, roomPos.x));
    furn.y = Math.max(furn.effectiveHeight / 2, Math.min(this.room.heightM - furn.effectiveHeight / 2, roomPos.y));
    Snap.snapToGrid(furn);
    Collision.clampToRoom(furn, this.room);
  }
}
