/**
 * collision.js — Collision Detection & Boundary Enforcement
 * Checks for overlapping furniture and out-of-bounds placement.
 */

const Collision = {
  /**
   * Check AABB overlap between two furniture items (axis-aligned).
   * Works correctly for 0/90/180/270 degree rotations because
   * Furniture.bounds already accounts for effectiveWidth/Height.
   */
  checkOverlap(a, b) {
    const ab = a.bounds;
    const bb = b.bounds;
    const eps = 0.005; // small tolerance (5mm)
    return !(
      ab.right  <= bb.left + eps ||
      ab.left   >= bb.right - eps ||
      ab.bottom <= bb.top + eps ||
      ab.top    >= bb.bottom - eps
    );
  },

  /**
   * Check if furniture is fully inside the room bounds.
   * @param {Furniture} furn
   * @param {Room} room
   * @returns {boolean} true if INSIDE room
   */
  isInsideRoom(furn, room) {
    const b = furn.bounds;
    const eps = 0.005;
    return (
      b.left   >= -eps &&
      b.top    >= -eps &&
      b.right  <= room.widthM + eps &&
      b.bottom <= room.heightM + eps
    );
  },

  /**
   * Clamp furniture position to stay inside room bounds.
   * Mutates furn.x and furn.y in place.
   */
  clampToRoom(furn, room) {
    const hw = furn.effectiveWidth / 2;
    const hh = furn.effectiveHeight / 2;
    furn.x = Math.max(hw, Math.min(room.widthM - hw, furn.x));
    furn.y = Math.max(hh, Math.min(room.heightM - hh, furn.y));
  },

  /**
   * Run full collision check on all furniture.
   * Sets isColliding flag on each piece.
   * @param {Furniture[]} furnitureList
   * @param {Room} room
   * @returns {number} count of colliding pieces
   */
  checkAll(furnitureList, room) {
    // Reset collision flags
    furnitureList.forEach(f => f.isColliding = false);

    let count = 0;

    // Check pairwise overlaps
    for (let i = 0; i < furnitureList.length; i++) {
      for (let j = i + 1; j < furnitureList.length; j++) {
        if (this.checkOverlap(furnitureList[i], furnitureList[j])) {
          furnitureList[i].isColliding = true;
          furnitureList[j].isColliding = true;
        }
      }
    }

    // Check room bounds
    furnitureList.forEach(f => {
      if (!this.isInsideRoom(f, room)) {
        f.isColliding = true;
      }
    });

    return furnitureList.filter(f => f.isColliding).length;
  }
};
