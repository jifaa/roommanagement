/**
 * snap.js — Snap-to-Grid & Snap-to-Edge Logic
 * Provides snapping behavior for furniture placement.
 */

const Snap = {
  /** Grid size in meters */
  gridSize: 0.1,

  /** Snap threshold in meters — how close before snapping kicks in */
  threshold: 0.08,

  /** Active snap guides (for visual rendering) */
  guides: [],

  /**
   * Snap a value to the nearest grid line.
   * @param {number} value — position in meters
   * @returns {number} snapped value
   */
  toGrid(value) {
    return Math.round(value / this.gridSize) * this.gridSize;
  },

  /**
   * Snap furniture center position to grid.
   * @param {Furniture} furn
   */
  snapToGrid(furn) {
    furn.x = this.toGrid(furn.x);
    furn.y = this.toGrid(furn.y);
  },

  /**
   * Snap furniture edges to room walls if close enough.
   * @param {Furniture} furn
   * @param {Room} room
   * @returns {boolean} true if any snap occurred
   */
  snapToWalls(furn, room) {
    let snapped = false;
    const hw = furn.effectiveWidth / 2;
    const hh = furn.effectiveHeight / 2;

    // Left wall
    if (Math.abs(furn.x - hw) < this.threshold) {
      furn.x = hw;
      snapped = true;
    }
    // Right wall
    if (Math.abs((furn.x + hw) - room.widthM) < this.threshold) {
      furn.x = room.widthM - hw;
      snapped = true;
    }
    // Top wall
    if (Math.abs(furn.y - hh) < this.threshold) {
      furn.y = hh;
      snapped = true;
    }
    // Bottom wall
    if (Math.abs((furn.y + hh) - room.heightM) < this.threshold) {
      furn.y = room.heightM - hh;
      snapped = true;
    }

    return snapped;
  },

  /**
   * Snap furniture edges to other furniture edges if close enough.
   * Also generates snap guide lines for visual feedback.
   * @param {Furniture} furn — the furniture being moved
   * @param {Furniture[]} others — other furniture to snap to
   * @returns {boolean} true if any snap occurred
   */
  snapToFurniture(furn, others) {
    this.guides = [];
    let snapped = false;
    const fb = furn.bounds;

    for (const other of others) {
      if (other.id === furn.id) continue;
      const ob = other.bounds;

      // Snap left edge to other's right edge
      if (Math.abs(fb.left - ob.right) < this.threshold) {
        furn.x += ob.right - fb.left;
        this.guides.push({ type: 'vertical', x: ob.right, y1: Math.min(fb.top, ob.top), y2: Math.max(fb.bottom, ob.bottom) });
        snapped = true;
      }
      // Snap right edge to other's left edge
      else if (Math.abs(fb.right - ob.left) < this.threshold) {
        furn.x += ob.left - fb.right;
        this.guides.push({ type: 'vertical', x: ob.left, y1: Math.min(fb.top, ob.top), y2: Math.max(fb.bottom, ob.bottom) });
        snapped = true;
      }

      // Re-calculate bounds after potential x adjustment
      const fb2 = furn.bounds;

      // Snap top edge to other's bottom edge
      if (Math.abs(fb2.top - ob.bottom) < this.threshold) {
        furn.y += ob.bottom - fb2.top;
        this.guides.push({ type: 'horizontal', y: ob.bottom, x1: Math.min(fb2.left, ob.left), x2: Math.max(fb2.right, ob.right) });
        snapped = true;
      }
      // Snap bottom edge to other's top edge
      else if (Math.abs(fb2.bottom - ob.top) < this.threshold) {
        furn.y += ob.top - fb2.bottom;
        this.guides.push({ type: 'horizontal', y: ob.top, x1: Math.min(fb2.left, ob.left), x2: Math.max(fb2.right, ob.right) });
        snapped = true;
      }

      // Center alignment guides (vertical center)
      if (Math.abs(furn.x - other.x) < this.threshold) {
        furn.x = other.x;
        this.guides.push({ type: 'vertical', x: other.x, y1: Math.min(fb.top, ob.top) - 0.1, y2: Math.max(fb.bottom, ob.bottom) + 0.1 });
        snapped = true;
      }
      // Center alignment guides (horizontal center)
      if (Math.abs(furn.y - other.y) < this.threshold) {
        furn.y = other.y;
        this.guides.push({ type: 'horizontal', y: other.y, x1: Math.min(fb.left, ob.left) - 0.1, x2: Math.max(fb.right, ob.right) + 0.1 });
        snapped = true;
      }
    }

    return snapped;
  },

  /**
   * Apply all snapping in priority order: furniture edges → walls → grid.
   * @param {Furniture} furn
   * @param {Furniture[]} allFurniture
   * @param {Room} room
   */
  applyAll(furn, allFurniture, room) {
    this.guides = [];
    // 1. Snap to furniture edges (highest priority)
    const snappedToFurniture = this.snapToFurniture(furn, allFurniture);
    // 2. Snap to walls
    const snappedToWall = this.snapToWalls(furn, room);
    // 3. Snap to grid (lowest priority, only if no other snap)
    if (!snappedToFurniture && !snappedToWall) {
      this.snapToGrid(furn);
    }
  }
};
