/**
 * zoom.js — Zoom & Pan Controls
 * Handles canvas zoom level and pan offset.
 */

class ZoomController {
  constructor() {
    this.zoom = 1.0;
    this.minZoom = 0.3;
    this.maxZoom = 3.0;
    this.panX = 60;  // pixels — room offset from canvas edge
    this.panY = 60;
    this.isPanning = false;
    this.panStartX = 0;
    this.panStartY = 0;
    this.panStartPanX = 0;
    this.panStartPanY = 0;
  }

  /** Zoom in by step */
  zoomIn(step = 0.1) {
    this.zoom = Math.min(this.maxZoom, this.zoom + step);
  }

  /** Zoom out by step */
  zoomOut(step = 0.1) {
    this.zoom = Math.max(this.minZoom, this.zoom - step);
  }

  /** Set zoom to specific value */
  setZoom(value) {
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, value));
  }

  /** Reset zoom and pan */
  reset() {
    this.zoom = 1.0;
    this.panX = 60;
    this.panY = 60;
  }

  /**
   * Zoom centered on a specific canvas point (e.g., cursor position).
   * @param {number} delta — positive = zoom in, negative = zoom out
   * @param {number} cx — canvas x coordinate to zoom toward
   * @param {number} cy — canvas y coordinate to zoom toward
   */
  zoomAt(delta, cx, cy) {
    const oldZoom = this.zoom;
    const step = delta > 0 ? 0.1 : -0.1;
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom + step));

    if (this.zoom !== oldZoom) {
      const scale = this.zoom / oldZoom;
      this.panX = cx - (cx - this.panX) * scale;
      this.panY = cy - (cy - this.panY) * scale;
    }
  }

  /**
   * Convert canvas (screen) coordinates to room coordinates (meters).
   * @param {number} canvasX
   * @param {number} canvasY
   * @param {Room} room
   * @returns {{ x: number, y: number }} position in meters
   */
  canvasToRoom(canvasX, canvasY, room) {
    const ppm = room.baseScale * this.zoom; // pixels per meter
    return {
      x: (canvasX - this.panX) / ppm,
      y: (canvasY - this.panY) / ppm
    };
  }

  /**
   * Convert room coordinates (meters) to canvas (screen) coordinates.
   * @param {number} roomX — meters
   * @param {number} roomY — meters
   * @param {Room} room
   * @returns {{ x: number, y: number }} position in canvas pixels
   */
  roomToCanvas(roomX, roomY, room) {
    const ppm = room.baseScale * this.zoom;
    return {
      x: roomX * ppm + this.panX,
      y: roomY * ppm + this.panY
    };
  }

  /** Pixels per meter at current zoom */
  ppm(room) {
    return room.baseScale * this.zoom;
  }

  /** Start a pan gesture */
  startPan(cx, cy) {
    this.isPanning = true;
    this.panStartX = cx;
    this.panStartY = cy;
    this.panStartPanX = this.panX;
    this.panStartPanY = this.panY;
  }

  /** Update pan during gesture */
  updatePan(cx, cy) {
    if (!this.isPanning) return;
    this.panX = this.panStartPanX + (cx - this.panStartX);
    this.panY = this.panStartPanY + (cy - this.panStartY);
  }

  /** End pan gesture */
  endPan() {
    this.isPanning = false;
  }

  /**
   * Auto-fit room into canvas with padding.
   * @param {Room} room
   * @param {number} canvasWidth
   * @param {number} canvasHeight
   * @param {number} padding — pixels of padding around the room
   */
  fitToView(room, canvasWidth, canvasHeight, padding = 80) {
    const availW = canvasWidth - padding * 2;
    const availH = canvasHeight - padding * 2;
    const roomPxW = room.widthM * room.baseScale;
    const roomPxH = room.heightM * room.baseScale;

    this.zoom = Math.min(availW / roomPxW, availH / roomPxH);
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom));

    const actualW = room.widthM * room.baseScale * this.zoom;
    const actualH = room.heightM * room.baseScale * this.zoom;
    this.panX = (canvasWidth - actualW) / 2;
    this.panY = (canvasHeight - actualH) / 2;
  }

  /** Get zoom percentage string */
  get zoomPercent() {
    return `${Math.round(this.zoom * 100)}%`;
  }
}
