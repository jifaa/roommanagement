/**
 * costfunction.js — Layout Evaluation & Objective Cost Function
 * Evaluates room configurations based on hard physical constraints (no overlap, in-bounds,
 * keep-empty zones, door/window clearance) and soft preferences (user-defined relations:
 * near, far, facing with customizable priority weights).
 *
 * Cost structure:
 *  - Overlap Cost:        ~1500 per collision + 5000/m² of intersection area (Hard)
 *  - Boundary Cost:       ~1500 base + 5000/m out-of-bounds penalty (Hard)
 *  - KeepEmptyZone Cost:  ~1200 base + 4000/m² occupied zone area (Hard)
 *  - Door/Window Cost:    ~1200 base + 3000/m² in swing/clearance area (Hard)
 *  - Relation Cost:       ~25 * weight * penalty based on distance / orientation (Soft)
 */

const CostFunction = {
  // Hard constraint penalty multipliers
  OVERLAP_WEIGHT: 1500,
  BOUNDARY_WEIGHT: 1500,
  EMPTY_ZONE_WEIGHT: 1200,
  DOOR_WINDOW_WEIGHT: 1200,

  // Soft constraint scale
  RELATION_SCALE: 25,

  /**
   * Calculate total layout cost.
   * Lower cost = better layout (0 = perfect).
   * @param {Array<Furniture|object>} furnitureList
   * @param {Room|object} room
   * @returns {number} total cost
   */
  calculate(furnitureList, room) {
    if (!furnitureList || furnitureList.length === 0 || !room) return 0;

    let cost = 0;
    cost += this.overlapCost(furnitureList);
    cost += this.boundaryCost(furnitureList, room);

    const keepEmptyZones = (room.constraints && room.constraints.keepEmptyZones) ? room.constraints.keepEmptyZones : [];
    cost += this.keepEmptyZoneCost(furnitureList, keepEmptyZones);

    cost += this.doorWindowClearanceCost(furnitureList, room);

    const relations = (room.constraints && room.constraints.relations) ? room.constraints.relations : [];
    cost += this.relationCost(furnitureList, relations);

    return cost;
  },

  /**
   * Helper to get axis-aligned bounding box { left, top, right, bottom }
   * Supports both Furniture class instances and plain serialized objects.
   * @param {Furniture|object} f
   * @returns {{ left: number, top: number, right: number, bottom: number, width: number, height: number }}
   */
  getBounds(f) {
    if (f.bounds) return f.bounds;

    const rot = ((f.rotation % 360) + 360) % 360;
    const isRotated = (rot === 90 || rot === 270);
    const effW = isRotated ? f.height : f.width;
    const effH = isRotated ? f.width : f.height;
    return {
      left: f.x - effW / 2,
      top: f.y - effH / 2,
      right: f.x + effW / 2,
      bottom: f.y + effH / 2,
      width: effW,
      height: effH
    };
  },

  /**
   * Calculate overlap area between two rectangles in m²
   */
  rectOverlapArea(r1, r2) {
    const ox = Math.max(0, Math.min(r1.right, r2.right) - Math.max(r1.left, r2.left));
    const oy = Math.max(0, Math.min(r1.bottom, r2.bottom) - Math.max(r1.top, r2.top));
    return ox * oy;
  },

  /**
   * Hard constraint: Penalty for overlapping furniture pieces.
   * Unit: Cost units (~1500 base + 5000/m² overlap area).
   * @param {Array<Furniture|object>} furnitureList
   * @returns {number}
   */
  overlapCost(furnitureList) {
    let cost = 0;
    const n = furnitureList.length;
    for (let i = 0; i < n; i++) {
      const b1 = this.getBounds(furnitureList[i]);
      for (let j = i + 1; j < n; j++) {
        const b2 = this.getBounds(furnitureList[j]);
        const area = this.rectOverlapArea(b1, b2);
        if (area > 0.0001) {
          cost += this.OVERLAP_WEIGHT * (1 + area * 5);
        }
      }
    }
    return cost;
  },

  /**
   * Hard constraint: Penalty for furniture out of room boundaries.
   * Unit: Cost units (~1500 base + 5000/m out distance).
   * @param {Array<Furniture|object>} furnitureList
   * @param {Room|object} room
   * @returns {number}
   */
  boundaryCost(furnitureList, room) {
    let cost = 0;
    const rw = room.widthM !== undefined ? room.widthM : (room.unit === 'cm' ? room.width / 100 : room.width);
    const rh = room.heightM !== undefined ? room.heightM : (room.unit === 'cm' ? room.height / 100 : room.height);
    const eps = 0.001;

    for (let i = 0; i < furnitureList.length; i++) {
      const b = this.getBounds(furnitureList[i]);
      let outDist = 0;
      if (b.left < -eps) outDist += Math.abs(b.left);
      if (b.top < -eps) outDist += Math.abs(b.top);
      if (b.right > rw + eps) outDist += (b.right - rw);
      if (b.bottom > rh + eps) outDist += (b.bottom - rh);

      if (outDist > 0) {
        cost += this.BOUNDARY_WEIGHT * (1 + outDist * 5);
      }
    }
    return cost;
  },

  /**
   * Hard constraint: Penalty for furniture inside user-defined Keep-Empty Zones.
   * Unit: Cost units (~1200 base + 4000/m² occupied zone area).
   * @param {Array<Furniture|object>} furnitureList
   * @param {Array<{ left, top, right, bottom }>} keepEmptyZones
   * @returns {number}
   */
  keepEmptyZoneCost(furnitureList, keepEmptyZones) {
    if (!keepEmptyZones || keepEmptyZones.length === 0) return 0;
    let cost = 0;

    for (let i = 0; i < furnitureList.length; i++) {
      const b = this.getBounds(furnitureList[i]);
      for (let k = 0; k < keepEmptyZones.length; k++) {
        const z = keepEmptyZones[k];
        const area = this.rectOverlapArea(b, z);
        if (area > 0.0001) {
          cost += this.EMPTY_ZONE_WEIGHT * (1 + area * 4);
        }
      }
    }
    return cost;
  },

  /**
   * Hard constraint: Penalty for furniture blocking door swings or window access.
   * Unit: Cost units (~1200 for doors, ~600 for windows).
   * @param {Array<Furniture|object>} furnitureList
   * @param {Room|object} room
   * @returns {number}
   */
  doorWindowClearanceCost(furnitureList, room) {
    let cost = 0;
    const blockedZones = this.getBlockedZones(room);
    if (blockedZones.length === 0) return 0;

    for (let i = 0; i < furnitureList.length; i++) {
      const b = this.getBounds(furnitureList[i]);
      for (let k = 0; k < blockedZones.length; k++) {
        const bz = blockedZones[k];
        const area = this.rectOverlapArea(b, bz);
        if (area > 0.0001) {
          const weight = bz.isDoor ? this.DOOR_WINDOW_WEIGHT : (this.DOOR_WINDOW_WEIGHT * 0.5);
          cost += weight * (1 + area * 3);
        }
      }
    }
    return cost;
  },

  /**
   * Compute door and window clearance zones.
   * @param {Room|object} room
   * @returns {Array<{ isDoor: boolean, left: number, top: number, right: number, bottom: number }>}
   */
  getBlockedZones(room) {
    const zones = [];
    const rw = room.widthM !== undefined ? room.widthM : (room.unit === 'cm' ? room.width / 100 : room.width);
    const rh = room.heightM !== undefined ? room.heightM : (room.unit === 'cm' ? room.height / 100 : room.height);

    (room.doors || []).forEach(d => {
      const clearance = 1.0;
      switch (d.wall) {
        case 'top':
          zones.push({ isDoor: true, left: d.position - 0.2, top: 0, right: d.position + d.width + 0.2, bottom: clearance });
          break;
        case 'bottom':
          zones.push({ isDoor: true, left: d.position - 0.2, top: rh - clearance, right: d.position + d.width + 0.2, bottom: rh });
          break;
        case 'left':
          zones.push({ isDoor: true, left: 0, top: d.position - 0.2, right: clearance, bottom: d.position + d.width + 0.2 });
          break;
        case 'right':
          zones.push({ isDoor: true, left: rw - clearance, top: d.position - 0.2, right: rw, bottom: d.position + d.width + 0.2 });
          break;
      }
    });

    (room.windows || []).forEach(w => {
      const clearance = 0.3;
      switch (w.wall) {
        case 'top':
          zones.push({ isDoor: false, left: w.position, top: 0, right: w.position + w.width, bottom: clearance });
          break;
        case 'bottom':
          zones.push({ isDoor: false, left: w.position, top: rh - clearance, right: w.position + w.width, bottom: rh });
          break;
        case 'left':
          zones.push({ isDoor: false, left: 0, top: w.position, right: clearance, bottom: w.position + w.width });
          break;
        case 'right':
          zones.push({ isDoor: false, left: rw - clearance, top: w.position, right: rw, bottom: w.position + w.width });
          break;
      }
    });

    return zones;
  },

  /**
   * Soft constraints: User-defined relations ('near', 'far', 'facing') with priority weight (1-10).
   * Unit: Scaled by relation.weight * 25.
   * @param {Array<Furniture|object>} furnitureList
   * @param {Array<{ furnitureIdA, furnitureIdB, type, weight }>} relations
   * @returns {number}
   */
  relationCost(furnitureList, relations) {
    if (!relations || relations.length === 0) return 0;
    let cost = 0;
    const map = {};
    furnitureList.forEach(f => { map[f.id] = f; });

    for (let i = 0; i < relations.length; i++) {
      const rel = relations[i];
      const a = map[rel.furnitureIdA];
      const b = map[rel.furnitureIdB];
      if (!a || !b) continue;

      const weight = Math.max(1, Math.min(10, parseInt(rel.weight) || 5));
      const type = rel.type || rel.relationType || 'near';
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (type === 'near') {
        // Ideal center distance: ~1.2m to 1.8m
        const idealDist = 1.5;
        if (dist > idealDist) {
          const excess = dist - idealDist;
          cost += weight * this.RELATION_SCALE * (excess * excess * 1.5);
        }
      } else if (type === 'far') {
        // Ideal center distance: >= 2.5m
        const targetDist = 2.5;
        if (dist < targetDist) {
          const deficit = targetDist - dist;
          cost += weight * this.RELATION_SCALE * (deficit * deficit * 2.5);
        }
      } else if (type === 'facing') {
        // A should face toward B
        const rotRad = ((a.rotation % 360) * Math.PI) / 180;
        // Direction the front of furniture A points to:
        // 0 deg: Top (-Y), 90 deg: Right (+X), 180 deg: Bottom (+Y), 270 deg: Left (-X)
        const frontX = Math.sin(rotRad);
        const frontY = -Math.cos(rotRad);

        if (dist > 0.01) {
          const dirX = dx / dist;
          const dirY = dy / dist;
          const dot = frontX * dirX + frontY * dirY; // 1 = directly facing, -1 = facing away
          // Penalty if not pointing toward B
          const anglePenalty = Math.max(0, 1 - dot);

          // Distance factor: ideal facing distance 1.2m - 3.2m
          let distPenalty = 0;
          if (dist < 1.0) distPenalty = (1.0 - dist) * 2;
          else if (dist > 3.2) distPenalty = (dist - 3.2) * 0.8;

          cost += weight * this.RELATION_SCALE * (anglePenalty * 3 + distPenalty);
        }
      }
    }
    return cost;
  },

  /**
   * Diagnostic summary of constraint violations.
   * Returns human-readable failure explanations.
   * @param {Array<Furniture|object>} furnitureList
   * @param {Room|object} room
   * @returns {{ overlaps: number, boundary: number, emptyZones: number, doorsWindows: number, details: string[] }}
   */
  checkViolations(furnitureList, room) {
    const violations = {
      overlaps: 0,
      boundary: 0,
      emptyZones: 0,
      doorsWindows: 0,
      details: []
    };

    if (!furnitureList || !room) return violations;

    const n = furnitureList.length;

    // 1. Overlaps
    for (let i = 0; i < n; i++) {
      const b1 = this.getBounds(furnitureList[i]);
      for (let j = i + 1; j < n; j++) {
        const b2 = this.getBounds(furnitureList[j]);
        if (this.rectOverlapArea(b1, b2) > 0.005) {
          violations.overlaps++;
          violations.details.push(`Tabrakan: "${furnitureList[i].name}" bertabrakan dengan "${furnitureList[j].name}"`);
        }
      }
    }

    // 2. Bounds
    const rw = room.widthM !== undefined ? room.widthM : (room.unit === 'cm' ? room.width / 100 : room.width);
    const rh = room.heightM !== undefined ? room.heightM : (room.unit === 'cm' ? room.height / 100 : room.height);
    for (let i = 0; i < n; i++) {
      const b = this.getBounds(furnitureList[i]);
      if (b.left < -0.01 || b.top < -0.01 || b.right > rw + 0.01 || b.bottom > rh + 0.01) {
        violations.boundary++;
        violations.details.push(`Batas: "${furnitureList[i].name}" berada di luar dinding ruangan`);
      }
    }

    // 3. KeepEmptyZones
    const zones = (room.constraints && room.constraints.keepEmptyZones) ? room.constraints.keepEmptyZones : [];
    for (let i = 0; i < n; i++) {
      const b = this.getBounds(furnitureList[i]);
      for (let k = 0; k < zones.length; k++) {
        if (this.rectOverlapArea(b, zones[k]) > 0.005) {
          violations.emptyZones++;
          violations.details.push(`Zona Kosong: "${furnitureList[i].name}" menutupi "${zones[k].name || 'Zona Kosong'}"`);
        }
      }
    }

    // 4. Doors/Windows
    const blocked = this.getBlockedZones(room);
    for (let i = 0; i < n; i++) {
      const b = this.getBounds(furnitureList[i]);
      for (let k = 0; k < blocked.length; k++) {
        if (this.rectOverlapArea(b, blocked[k]) > 0.005) {
          violations.doorsWindows++;
          const typeName = blocked[k].isDoor ? 'pintu' : 'jendela';
          violations.details.push(`Akses: "${furnitureList[i].name}" menghalangi area ${typeName}`);
        }
      }
    }

    return violations;
  },

  /**
   * Compute normalized comfort score (0 - 100).
   * 100 = optimal layout meeting all constraints.
   * @param {number} finalCost
   * @param {object} violations
   * @param {Array} relations
   * @returns {number} integer 0 to 100
   */
  computeComfortScore(finalCost, violations, relations = []) {
    const totalHardViolations = violations.overlaps + violations.boundary + violations.emptyZones + violations.doorsWindows;

    if (totalHardViolations > 0) {
      // Significant penalty if hard constraints fail
      const base = Math.max(10, 50 - totalHardViolations * 12);
      return Math.max(5, Math.min(60, Math.round(base)));
    }

    // No hard violations: score in 75 - 100 range depending on soft relation costs
    if (relations.length === 0) {
      return 100;
    }

    // Normalize based on soft cost
    const softCostPerRelation = finalCost / Math.max(1, relations.length);
    const score = Math.max(70, Math.min(100, Math.round(100 - softCostPerRelation * 0.15)));
    return score;
  }
};

// Support Node / Worker / Browser export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CostFunction;
}
