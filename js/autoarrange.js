/**
 * autoarrange.js — Smart Furniture Auto-Arrangement Engine
 * Uses rule-based interior design logic to automatically position
 * all furniture in a room for comfortable, ergonomic layouts.
 *
 * Placement strategy:
 *  1. Classify all furniture into roles (anchor, wall-hugger, companion, center, free)
 *  2. Identify door/window zones to avoid
 *  3. Place wall-huggers along walls first
 *  4. Place anchor pieces (beds, sofas, desks) at optimal wall positions
 *  5. Place companion items near their anchors
 *  6. Place center/free items in remaining open space
 *  7. Resolve any remaining collisions
 */

const AutoArrange = {

  // Minimum clearance in meters
  WALL_MARGIN: 0.05,       // gap from wall for wall-huggers
  DOOR_CLEARANCE: 1.0,     // keep-clear zone in front of doors
  WALKWAY_MIN: 0.6,        // minimum walkway between furniture
  COMPANION_GAP: 0.05,     // gap between companion items

  /**
   * Main entry: arrange all furniture in the room.
   * Returns an array of { furniture, oldX, oldY, oldRotation, newX, newY, newRotation }
   * so the caller can animate the transition.
   *
   * @param {Room} room
   * @param {Furniture[]} furnitureList
   * @returns {Array<{furn, oldX, oldY, oldRot, newX, newY, newRot}>}
   */
  arrange(room, furnitureList) {
    if (!room || furnitureList.length === 0) return [];

    const rw = room.widthM;
    const rh = room.heightM;

    // Save old positions for animation
    const moves = furnitureList.map(f => ({
      furn: f,
      oldX: f.x, oldY: f.y, oldRot: f.rotation
    }));

    // Classify furniture
    const classified = this._classify(furnitureList);

    // Get blocked zones from doors/windows
    const blocked = this._getBlockedZones(room);

    // Track placed rectangles for collision avoidance
    const placed = [];

    // ── Phase 1: Wall-huggers (wardrobe, bookshelf, TV stand, dresser, filing cabinet, bar counter) ──
    classified.wallHuggers.forEach(f => {
      this._placeWallHugger(f, rw, rh, blocked, placed);
    });

    // ── Phase 2: Anchor items (beds, sofas, desks) ──
    classified.anchors.forEach(f => {
      this._placeAnchor(f, rw, rh, blocked, placed);
    });

    // ── Phase 3: Companion items (nightstand → bed, coffee table → sofa, office chair → desk) ──
    classified.companions.forEach(({ furn, anchorName }) => {
      const anchor = placed.find(p =>
        p.furn.name.toLowerCase().includes(anchorName)
      );
      if (anchor) {
        this._placeCompanion(furn, anchor.furn, rw, rh, placed);
      } else {
        // No anchor found — treat as free item
        this._placeFreeItem(furn, rw, rh, placed);
      }
    });

    // ── Phase 4: Center items (dining table, armchair) ──
    classified.centerPieces.forEach(f => {
      this._placeCenterItem(f, rw, rh, placed);
    });

    // ── Phase 5: Dining chairs around dining table ──
    classified.diningChairs.forEach(f => {
      const table = placed.find(p =>
        p.furn.name.toLowerCase().includes('dining table')
      );
      if (table) {
        this._placeDiningChair(f, table.furn, rw, rh, placed);
      } else {
        this._placeFreeItem(f, rw, rh, placed);
      }
    });

    // ── Phase 6: Free / custom items ──
    classified.free.forEach(f => {
      this._placeFreeItem(f, rw, rh, placed);
    });

    // ── Phase 7: Final collision resolution & clamping ──
    this._resolveCollisions(furnitureList, rw, rh);

    // Build result with new positions
    moves.forEach(m => {
      m.newX = m.furn.x;
      m.newY = m.furn.y;
      m.newRot = m.furn.rotation;
    });

    return moves;
  },

  // ─── Classification ──────────────────────────────────────

  _classify(furnitureList) {
    const result = {
      wallHuggers: [],
      anchors: [],
      companions: [],
      centerPieces: [],
      diningChairs: [],
      free: []
    };

    furnitureList.forEach(f => {
      const name = f.name.toLowerCase();
      const catId = f.category.id;

      // Wall huggers — items that should go against walls
      if (name.includes('wardrobe') || name.includes('bookshelf') ||
          name.includes('tv stand') || name.includes('dresser') ||
          name.includes('filing cabinet') || name.includes('bar counter')) {
        result.wallHuggers.push(f);
      }
      // Anchors — large items placed at walls first
      else if (name.includes('bed') || name.includes('sofa') ||
               name.includes('l-sofa') || name.includes('desk')) {
        result.anchors.push(f);
      }
      // Companions
      else if (name.includes('nightstand')) {
        result.companions.push({ furn: f, anchorName: 'bed' });
      }
      else if (name.includes('coffee table')) {
        result.companions.push({ furn: f, anchorName: 'sofa' });
      }
      else if (name.includes('office chair')) {
        result.companions.push({ furn: f, anchorName: 'desk' });
      }
      // Dining chairs
      else if (name.includes('dining chair')) {
        result.diningChairs.push(f);
      }
      // Center pieces
      else if (name.includes('dining table') || name.includes('armchair')) {
        result.centerPieces.push(f);
      }
      // Everything else
      else {
        result.free.push(f);
      }
    });

    return result;
  },

  // ─── Blocked Zones (doors/windows) ────────────────────────

  _getBlockedZones(room) {
    const zones = [];

    room.doors.forEach(d => {
      const clearance = this.DOOR_CLEARANCE;
      switch (d.wall) {
        case 'top':
          zones.push({ left: d.position - 0.2, top: 0, right: d.position + d.width + 0.2, bottom: clearance });
          break;
        case 'bottom':
          zones.push({ left: d.position - 0.2, top: room.heightM - clearance, right: d.position + d.width + 0.2, bottom: room.heightM });
          break;
        case 'left':
          zones.push({ left: 0, top: d.position - 0.2, right: clearance, bottom: d.position + d.width + 0.2 });
          break;
        case 'right':
          zones.push({ left: room.widthM - clearance, top: d.position - 0.2, right: room.widthM, bottom: d.position + d.width + 0.2 });
          break;
      }
    });

    // Windows — keep a small zone clear (not as much as doors)
    room.windows.forEach(w => {
      switch (w.wall) {
        case 'top':
          zones.push({ left: w.position, top: 0, right: w.position + w.width, bottom: 0.3 });
          break;
        case 'bottom':
          zones.push({ left: w.position, top: room.heightM - 0.3, right: w.position + w.width, bottom: room.heightM });
          break;
        case 'left':
          zones.push({ left: 0, top: w.position, right: 0.3, bottom: w.position + w.width });
          break;
        case 'right':
          zones.push({ left: room.widthM - 0.3, top: w.position, right: room.widthM, bottom: w.position + w.width });
          break;
      }
    });

    return zones;
  },

  // ─── Placement Methods ────────────────────────────────────

  /**
   * Place a wall-hugging item against the best available wall.
   */
  _placeWallHugger(furn, rw, rh, blocked, placed) {
    // Prefer left/right walls for wardrobes, top wall for TV stands
    const name = furn.name.toLowerCase();
    let wallOrder;

    if (name.includes('tv stand')) {
      // TV opposite to where sofas typically go (top wall)
      wallOrder = ['top', 'bottom', 'left', 'right'];
    } else if (name.includes('wardrobe') || name.includes('dresser')) {
      wallOrder = ['left', 'right', 'top', 'bottom'];
    } else {
      wallOrder = ['right', 'left', 'bottom', 'top'];
    }

    for (const wall of wallOrder) {
      const pos = this._findWallPosition(furn, wall, rw, rh, blocked, placed);
      if (pos) {
        furn.x = pos.x;
        furn.y = pos.y;
        furn.rotation = pos.rotation;
        placed.push({ furn, bounds: this._getBounds(furn) });
        return;
      }
    }

    // Fallback: place anywhere that fits
    this._placeFreeItem(furn, rw, rh, placed);
  },

  /**
   * Place an anchor item (bed, sofa, desk) at a wall.
   */
  _placeAnchor(furn, rw, rh, blocked, placed) {
    const name = furn.name.toLowerCase();
    let wallOrder;

    if (name.includes('bed')) {
      // Beds: headboard against back/side wall
      wallOrder = ['top', 'left', 'right', 'bottom'];
    } else if (name.includes('sofa') || name.includes('l-sofa')) {
      // Sofas: against a wall, preferably bottom or side
      wallOrder = ['bottom', 'left', 'right', 'top'];
    } else if (name.includes('desk')) {
      // Desks: against a wall, prefer near windows
      wallOrder = ['left', 'right', 'top', 'bottom'];
    } else {
      wallOrder = ['bottom', 'top', 'left', 'right'];
    }

    for (const wall of wallOrder) {
      const pos = this._findWallPosition(furn, wall, rw, rh, blocked, placed);
      if (pos) {
        furn.x = pos.x;
        furn.y = pos.y;
        furn.rotation = pos.rotation;
        placed.push({ furn, bounds: this._getBounds(furn) });
        return;
      }
    }

    // Fallback
    this._placeFreeItem(furn, rw, rh, placed);
  },

  /**
   * Place a companion item near its anchor.
   */
  _placeCompanion(furn, anchor, rw, rh, placed) {
    const ab = this._getBounds(anchor);
    const gap = this.COMPANION_GAP;
    const fw = furn.width;
    const fh = furn.height;
    const name = furn.name.toLowerCase();
    const ar = ((anchor.rotation % 360) + 360) % 360;

    let candidates = [];

    // ── Nightstand: tightly beside the bed, aligned to the wall ──
    if (name.includes('nightstand')) {
      // Nightstand should go along the long side of the bed
      if (ar === 0 || ar === 180) {
        // Bed is horizontal (not rotated or flipped): long axis is vertical (height > width typically for beds)
        // Place nightstand to left or right, vertically aligned to bed's top (headboard)
        candidates = [
          { x: ab.right + gap + fw / 2, y: ab.top + fh / 2, rot: 0 },
          { x: ab.left - gap - fw / 2, y: ab.top + fh / 2, rot: 0 },
          { x: ab.right + gap + fw / 2, y: ab.bottom - fh / 2, rot: 0 },
          { x: ab.left - gap - fw / 2, y: ab.bottom - fh / 2, rot: 0 },
        ];
      } else {
        // Bed is rotated 90/270: long axis is horizontal
        candidates = [
          { x: ab.left + fw / 2, y: ab.top - gap - fh / 2, rot: 0 },
          { x: ab.left + fw / 2, y: ab.bottom + gap + fh / 2, rot: 0 },
          { x: ab.right - fw / 2, y: ab.top - gap - fh / 2, rot: 0 },
          { x: ab.right - fw / 2, y: ab.bottom + gap + fh / 2, rot: 0 },
        ];
      }
    }
    // ── Coffee table: in front of sofa ──
    else if (name.includes('coffee table')) {
      const sofaFrontGap = 0.4;
      if (ar === 0) {
        candidates.push({ x: anchor.x, y: ab.top - sofaFrontGap - fh / 2, rot: 0 });
      } else if (ar === 180) {
        candidates.push({ x: anchor.x, y: ab.bottom + sofaFrontGap + fh / 2, rot: 0 });
      } else if (ar === 90) {
        candidates.push({ x: ab.left - sofaFrontGap - fh / 2, y: anchor.y, rot: 90 });
      } else if (ar === 270) {
        candidates.push({ x: ab.right + sofaFrontGap + fh / 2, y: anchor.y, rot: 90 });
      }
      // Fallback positions
      candidates.push(
        { x: anchor.x, y: ab.top - sofaFrontGap - fh / 2, rot: 0 },
        { x: anchor.x, y: ab.bottom + sofaFrontGap + fh / 2, rot: 0 }
      );
    }
    // ── Office chair: in front of desk ──
    else if (name.includes('office chair')) {
      const chairGap = 0.3;
      if (ar === 0) {
        candidates.push({ x: anchor.x, y: ab.bottom + chairGap + fh / 2, rot: 0 });
      } else if (ar === 180) {
        candidates.push({ x: anchor.x, y: ab.top - chairGap - fh / 2, rot: 180 });
      } else if (ar === 90) {
        candidates.push({ x: ab.right + chairGap + fw / 2, y: anchor.y, rot: 90 });
      } else if (ar === 270) {
        candidates.push({ x: ab.left - chairGap - fw / 2, y: anchor.y, rot: 270 });
      }
    }

    // Generic fallback positions
    if (candidates.length === 0) {
      candidates = [
        { x: ab.right + gap + fw / 2, y: anchor.y, rot: 0 },
        { x: ab.left - gap - fw / 2, y: anchor.y, rot: 0 },
        { x: anchor.x, y: ab.bottom + gap + fh / 2, rot: 0 },
        { x: anchor.x, y: ab.top - gap - fh / 2, rot: 0 },
      ];
    }

    for (const c of candidates) {
      furn.rotation = c.rot;
      const ew = furn.effectiveWidth;
      const eh = furn.effectiveHeight;

      // Check within room bounds
      if (c.x - ew / 2 < 0 || c.x + ew / 2 > rw) continue;
      if (c.y - eh / 2 < 0 || c.y + eh / 2 > rh) continue;

      // Check collision with placed items (except anchor)
      furn.x = c.x;
      furn.y = c.y;
      const fb = this._getBounds(furn);

      if (!this._collidesWithPlaced(fb, placed, furn)) {
        placed.push({ furn, bounds: fb });
        return;
      }
    }

    // Fallback
    furn.rotation = 0;
    this._placeFreeItem(furn, rw, rh, placed);
  },

  /**
   * Place a center item in the largest open area.
   */
  _placeCenterItem(furn, rw, rh, placed) {
    const name = furn.name.toLowerCase();

    if (name.includes('armchair')) {
      // Try corners first
      const margin = 0.3;
      const corners = [
        { x: rw - margin - furn.width / 2, y: rh - margin - furn.height / 2, rot: 0 },
        { x: margin + furn.width / 2, y: rh - margin - furn.height / 2, rot: 0 },
        { x: rw - margin - furn.width / 2, y: margin + furn.height / 2, rot: 0 },
        { x: margin + furn.width / 2, y: margin + furn.height / 2, rot: 0 },
      ];

      for (const c of corners) {
        furn.x = c.x;
        furn.y = c.y;
        furn.rotation = c.rot;
        const fb = this._getBounds(furn);
        if (!this._collidesWithPlaced(fb, placed, furn)) {
          placed.push({ furn, bounds: fb });
          return;
        }
      }
    }

    // Find center of room or largest gap
    this._placeFreeItem(furn, rw, rh, placed);
  },

  /**
   * Place dining chairs around a dining table.
   */
  _placeDiningChair(furn, table, rw, rh, placed) {
    const tb = this._getBounds(table);
    const gap = 0.05;
    const fw = furn.width;
    const fh = furn.height;

    // Count how many chairs already placed around this table
    const chairsPlaced = placed.filter(p =>
      p.furn.name.toLowerCase().includes('dining chair')
    ).length;

    // Positions: top row, bottom row, left, right of table
    const positions = [
      // Top side
      { x: table.x - 0.3, y: tb.top - gap - fh / 2, rot: 180 },
      { x: table.x + 0.3, y: tb.top - gap - fh / 2, rot: 180 },
      // Bottom side
      { x: table.x - 0.3, y: tb.bottom + gap + fh / 2, rot: 0 },
      { x: table.x + 0.3, y: tb.bottom + gap + fh / 2, rot: 0 },
      // Left side
      { x: tb.left - gap - fw / 2, y: table.y, rot: 90 },
      // Right side
      { x: tb.right + gap + fw / 2, y: table.y, rot: 270 },
    ];

    // Try each position starting from chairsPlaced index
    for (let i = 0; i < positions.length; i++) {
      const idx = (chairsPlaced + i) % positions.length;
      const c = positions[idx];

      furn.rotation = c.rot;
      furn.x = c.x;
      furn.y = c.y;

      const ew = furn.effectiveWidth;
      const eh = furn.effectiveHeight;

      if (c.x - ew / 2 < 0 || c.x + ew / 2 > rw) continue;
      if (c.y - eh / 2 < 0 || c.y + eh / 2 > rh) continue;

      const fb = this._getBounds(furn);
      if (!this._collidesWithPlaced(fb, placed, furn)) {
        placed.push({ furn, bounds: fb });
        return;
      }
    }

    // Fallback
    furn.rotation = 0;
    this._placeFreeItem(furn, rw, rh, placed);
  },

  /**
   * Place item in the best available open space using grid scanning.
   */
  _placeFreeItem(furn, rw, rh, placed) {
    const ew = furn.effectiveWidth;
    const eh = furn.effectiveHeight;
    const step = 0.2; // scan resolution

    let bestX = rw / 2, bestY = rh / 2;
    let bestScore = -Infinity;

    for (let y = eh / 2 + this.WALL_MARGIN; y <= rh - eh / 2 - this.WALL_MARGIN; y += step) {
      for (let x = ew / 2 + this.WALL_MARGIN; x <= rw - ew / 2 - this.WALL_MARGIN; x += step) {
        furn.x = x;
        furn.y = y;
        const fb = this._getBounds(furn);

        if (this._collidesWithPlaced(fb, placed, furn)) continue;

        // Score: prefer center of room, penalize edges
        const cx = rw / 2, cy = rh / 2;
        const distFromCenter = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        const maxDist = Math.sqrt(cx ** 2 + cy ** 2);

        // Min distance to any placed item (prefer some spacing)
        let minDist = Infinity;
        placed.forEach(p => {
          const dx = x - p.furn.x;
          const dy = y - p.furn.y;
          minDist = Math.min(minDist, Math.sqrt(dx * dx + dy * dy));
        });

        // Score: balance between center proximity and spacing from others
        const centerScore = 1 - (distFromCenter / maxDist) * 0.3;
        const spacingScore = Math.min(minDist / 2, 1) * 0.7;
        const score = centerScore + spacingScore;

        if (score > bestScore) {
          bestScore = score;
          bestX = x;
          bestY = y;
        }
      }
    }

    furn.x = bestX;
    furn.y = bestY;
    placed.push({ furn, bounds: this._getBounds(furn) });
  },

  // ─── Wall Position Finder ─────────────────────────────────

  /**
   * Find a position for furniture along a specific wall.
   * Returns {x, y, rotation} or null if no space.
   */
  _findWallPosition(furn, wall, rw, rh, blocked, placed) {
    const margin = this.WALL_MARGIN;
    const fw = furn.width;
    const fh = furn.height;

    // Determine rotation and effective dimensions when placed at wall
    let rotation, ew, eh;

    switch (wall) {
      case 'top':
        rotation = 0;
        ew = fw; eh = fh;
        break;
      case 'bottom':
        rotation = 180;
        ew = fw; eh = fh;
        break;
      case 'left':
        rotation = 90;
        ew = fh; eh = fw;
        break;
      case 'right':
        rotation = 270;
        ew = fh; eh = fw;
        break;
    }

    // Scan along the wall to find free space
    const step = 0.1;
    let wallLength, startCoord;

    if (wall === 'top' || wall === 'bottom') {
      wallLength = rw;
      startCoord = ew / 2 + margin;
    } else {
      wallLength = rh;
      startCoord = eh / 2 + margin;
    }

    // Try centered first, then scan outward
    const center = wallLength / 2;
    const maxOffset = wallLength / 2;

    for (let offset = 0; offset <= maxOffset; offset += step) {
      const coords = offset === 0 ? [center] : [center - offset, center + offset];

      for (const coord of coords) {
        let x, y;

        switch (wall) {
          case 'top':
            x = coord; y = eh / 2 + margin;
            break;
          case 'bottom':
            x = coord; y = rh - eh / 2 - margin;
            break;
          case 'left':
            x = ew / 2 + margin; y = coord;
            break;
          case 'right':
            x = rw - ew / 2 - margin; y = coord;
            break;
        }

        // Check room bounds
        if (x - ew / 2 < 0 || x + ew / 2 > rw) continue;
        if (y - eh / 2 < 0 || y + eh / 2 > rh) continue;

        // Temporarily set position to check bounds
        const origX = furn.x, origY = furn.y, origRot = furn.rotation;
        furn.x = x; furn.y = y; furn.rotation = rotation;
        const fb = this._getBounds(furn);
        furn.x = origX; furn.y = origY; furn.rotation = origRot;

        // Check against blocked zones
        if (this._collidesWithZones(fb, blocked)) continue;

        // Check against placed items
        if (this._collidesWithPlaced(fb, placed, furn)) continue;

        return { x, y, rotation };
      }
    }

    return null;
  },

  // ─── Collision Helpers ────────────────────────────────────

  _getBounds(furn) {
    const hw = furn.effectiveWidth / 2;
    const hh = furn.effectiveHeight / 2;
    return {
      left: furn.x - hw,
      top: furn.y - hh,
      right: furn.x + hw,
      bottom: furn.y + hh
    };
  },

  _rectsOverlap(a, b) {
    const gap = this.WALKWAY_MIN * 0.3; // reduced clearance for tighter fit
    return !(
      a.right + gap <= b.left ||
      a.left - gap >= b.right ||
      a.bottom + gap <= b.top ||
      a.top - gap >= b.bottom
    );
  },

  _collidesWithPlaced(bounds, placed, self) {
    return placed.some(p => {
      if (p.furn === self) return false;
      return this._rectsOverlap(bounds, p.bounds);
    });
  },

  _collidesWithZones(bounds, zones) {
    return zones.some(z => this._rectsOverlap(bounds, z));
  },

  /**
   * Final pass: push apart overlapping furniture.
   */
  _resolveCollisions(furnitureList, rw, rh) {
    const maxIterations = 50;

    for (let iter = 0; iter < maxIterations; iter++) {
      let moved = false;

      for (let i = 0; i < furnitureList.length; i++) {
        for (let j = i + 1; j < furnitureList.length; j++) {
          const a = furnitureList[i];
          const b = furnitureList[j];
          const ab = this._getBounds(a);
          const bb = this._getBounds(b);

          const eps = 0.01;
          const overlapX = Math.min(ab.right, bb.right) - Math.max(ab.left, bb.left);
          const overlapY = Math.min(ab.bottom, bb.bottom) - Math.max(ab.top, bb.top);

          if (overlapX > eps && overlapY > eps) {
            // Push apart along the axis of least overlap
            if (overlapX < overlapY) {
              const push = (overlapX / 2) + 0.05;
              if (a.x < b.x) { a.x -= push; b.x += push; }
              else { a.x += push; b.x -= push; }
            } else {
              const push = (overlapY / 2) + 0.05;
              if (a.y < b.y) { a.y -= push; b.y += push; }
              else { a.y += push; b.y -= push; }
            }
            moved = true;
          }
        }
      }

      // Clamp all to room
      furnitureList.forEach(f => {
        const hw = f.effectiveWidth / 2;
        const hh = f.effectiveHeight / 2;
        f.x = Math.max(hw, Math.min(rw - hw, f.x));
        f.y = Math.max(hh, Math.min(rh - hh, f.y));
      });

      if (!moved) break;
    }
  }
};
