/**
 * room.js — Room Model
 * Manages room dimensions, unit conversions, and wall elements (doors/windows).
 */

// Wall identifiers
const WALL = Object.freeze({
  TOP: 'top',
  RIGHT: 'right',
  BOTTOM: 'bottom',
  LEFT: 'left'
});

class Room {
  /**
   * @param {number} width  — room width in user units
   * @param {number} height — room height (depth) in user units
   * @param {'m'|'cm'} unit — measurement unit
   */
  constructor(width = 4, height = 3, unit = 'm') {
    this.width = width;
    this.height = height;
    this.unit = unit;
    this.baseScale = 60; // pixels per meter at zoom 1.0
    this.doors = [];     // { id, wall, position, width }
    this.windows = [];   // { id, wall, position, width }
    this.constraints = {
      keepEmptyZones: [], // [{ id, name, left, top, right, bottom }]
      relations: []       // [{ id, furnitureIdA, furnitureIdB, type: 'near'|'far'|'facing', weight: 1-10 }]
    };
    this._nextId = 1;
  }

  /** Convert room dimensions to meters (internal standard) */
  toMeters(value) {
    return this.unit === 'cm' ? value / 100 : value;
  }

  /** Get room width in meters */
  get widthM() {
    return this.toMeters(this.width);
  }

  /** Get room height in meters */
  get heightM() {
    return this.toMeters(this.height);
  }

  /** Convert meters to pixels at given zoom level */
  mToPixel(meters, zoom = 1) {
    return meters * this.baseScale * zoom;
  }

  /** Convert user-unit value to pixels */
  toPixel(value, zoom = 1) {
    return this.mToPixel(this.toMeters(value), zoom);
  }

  /** Convert pixels back to meters */
  pixelToM(px, zoom = 1) {
    return px / (this.baseScale * zoom);
  }

  /** Room width in pixels */
  pixelWidth(zoom = 1) {
    return this.mToPixel(this.widthM, zoom);
  }

  /** Room height in pixels */
  pixelHeight(zoom = 1) {
    return this.mToPixel(this.heightM, zoom);
  }

  /** Get area in square meters */
  get areaM2() {
    return this.widthM * this.heightM;
  }

  /** Format a value with the current unit */
  formatUnit(value) {
    if (this.unit === 'cm') {
      return `${Math.round(value)}cm`;
    }
    return `${parseFloat(value.toFixed(2))}m`;
  }

  /** Format value in meters for display */
  formatMeters(meters) {
    if (this.unit === 'cm') {
      return `${Math.round(meters * 100)}cm`;
    }
    return `${parseFloat(meters.toFixed(2))}m`;
  }

  /**
   * Add a door to a wall
   * @param {string} wall     — WALL enum value
   * @param {number} position — distance along wall from start (in meters)
   * @param {number} width    — door width in meters (default 0.9m)
   * @returns {object} the created door
   */
  addDoor(wall, position, width = 0.9) {
    const door = {
      id: `door_${this._nextId++}`,
      type: 'door',
      wall,
      position,
      width
    };
    this.doors.push(door);
    return door;
  }

  /**
   * Add a window to a wall
   * @param {string} wall     — WALL enum value
   * @param {number} position — distance along wall from start (in meters)
   * @param {number} width    — window width in meters (default 1.0m)
   * @returns {object} the created window
   */
  addWindow(wall, position, width = 1.0) {
    const win = {
      id: `win_${this._nextId++}`,
      type: 'window',
      wall,
      position,
      width
    };
    this.windows.push(win);
    return win;
  }

  /**
   * Add a keep-empty zone constraint
   * @param {object} zone - { left, top, right, bottom, name }
   * @returns {object}
   */
  addKeepEmptyZone(zone) {
    const left = Math.max(0, Math.min(zone.left, zone.right));
    const right = Math.min(this.widthM, Math.max(zone.left, zone.right));
    const top = Math.max(0, Math.min(zone.top, zone.bottom));
    const bottom = Math.min(this.heightM, Math.max(zone.top, zone.bottom));
    const count = this.constraints.keepEmptyZones.length + 1;

    const newZone = {
      id: zone.id || `zone_${this._nextId++}`,
      type: 'keepEmptyZone',
      name: zone.name || `Zona Kosong #${count}`,
      left,
      top,
      right,
      bottom
    };
    this.constraints.keepEmptyZones.push(newZone);
    return newZone;
  }

  /**
   * Add a furniture relation constraint
   * @param {object} rel - { furnitureIdA, furnitureIdB, type: 'near'|'far'|'facing', weight: 1-10 }
   * @returns {object}
   */
  addRelation(rel) {
    const newRel = {
      id: rel.id || `rel_${this._nextId++}`,
      type: 'relation',
      relationType: rel.type || rel.relationType || 'near',
      furnitureIdA: rel.furnitureIdA,
      furnitureIdB: rel.furnitureIdB,
      weight: Math.max(1, Math.min(10, parseInt(rel.weight) || 5))
    };
    this.constraints.relations.push(newRel);
    return newRel;
  }

  /** Remove any constraint by ID (zone or relation) */
  removeConstraint(id) {
    this.constraints.keepEmptyZones = this.constraints.keepEmptyZones.filter(z => z.id !== id);
    this.constraints.relations = this.constraints.relations.filter(r => r.id !== id);
  }

  /** Remove keep-empty zone by ID */
  removeKeepEmptyZone(id) {
    this.constraints.keepEmptyZones = this.constraints.keepEmptyZones.filter(z => z.id !== id);
  }

  /** Remove relation by ID */
  removeRelation(id) {
    this.constraints.relations = this.constraints.relations.filter(r => r.id !== id);
  }

  /** Remove relations that refer to non-existent furniture */
  cleanFurnitureRelations(validFurnitureIds) {
    const idSet = new Set(validFurnitureIds);
    this.constraints.relations = this.constraints.relations.filter(
      r => idSet.has(r.furnitureIdA) && idSet.has(r.furnitureIdB)
    );
  }

  /** Remove a door or window by ID */
  removeElement(id) {
    this.doors = this.doors.filter(d => d.id !== id);
    this.windows = this.windows.filter(w => w.id !== id);
  }

  /** Get wall length in meters */
  getWallLength(wall) {
    if (wall === WALL.TOP || wall === WALL.BOTTOM) return this.widthM;
    return this.heightM;
  }

  /** Serialize to plain object */
  toJSON() {
    return {
      width: this.width,
      height: this.height,
      unit: this.unit,
      doors: [...this.doors],
      windows: [...this.windows],
      constraints: {
        keepEmptyZones: this.constraints.keepEmptyZones.map(z => ({ ...z })),
        relations: this.constraints.relations.map(r => ({ ...r }))
      }
    };
  }

  /** Restore from plain object */
  static fromJSON(data) {
    const room = new Room(data.width, data.height, data.unit);
    room.doors = data.doors || [];
    room.windows = data.windows || [];
    room.constraints = {
      keepEmptyZones: (data.constraints && data.constraints.keepEmptyZones) ? data.constraints.keepEmptyZones : [],
      relations: (data.constraints && data.constraints.relations) ? data.constraints.relations : []
    };

    // Restore _nextId from all elements
    const allElements = [
      ...room.doors,
      ...room.windows,
      ...room.constraints.keepEmptyZones,
      ...room.constraints.relations
    ];
    const allIds = allElements
      .map(e => parseInt((e.id || '').split('_')[1]) || 0);
    room._nextId = allIds.length ? Math.max(...allIds) + 1 : 1;
    return room;
  }
}

