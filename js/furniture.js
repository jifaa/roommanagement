/**
 * furniture.js — Furniture Catalog, Model & Factory
 * Defines the furniture catalog with realistic default sizes,
 * the Furniture class for instances, and factory methods.
 */

// Furniture categories with associated colors
const CATEGORY = Object.freeze({
  BEDROOM: { id: 'bedroom', label: 'Bedroom', icon: 'bed',       color: '#4a9eff', bg: 'rgba(74,158,255,0.15)' },
  LIVING:  { id: 'living',  label: 'Living Room', icon: 'sofa',  color: '#ff8c42', bg: 'rgba(255,140,66,0.15)' },
  DINING:  { id: 'dining',  label: 'Dining', icon: 'utensils',   color: '#42d68c', bg: 'rgba(66,214,140,0.15)' },
  OFFICE:  { id: 'office',  label: 'Office', icon: 'briefcase',  color: '#a855f7', bg: 'rgba(168,85,247,0.15)' },
  CUSTOM:  { id: 'custom',  label: 'Custom', icon: 'wrench',     color: '#14b8a6', bg: 'rgba(20,184,166,0.15)' }
});

/**
 * Default furniture catalog — realistic metric dimensions (width × height in meters)
 * Width = side-to-side dimension, Height = front-to-back dimension (depth on floor plan)
 */
const FURNITURE_CATALOG = [
  // Bedroom
  { name: 'Single Bed',   category: CATEGORY.BEDROOM, width: 1.0,  height: 2.0,  icon: 'bed' },
  { name: 'Double Bed',   category: CATEGORY.BEDROOM, width: 1.6,  height: 2.0,  icon: 'bed' },
  { name: 'Queen Bed',    category: CATEGORY.BEDROOM, width: 1.8,  height: 2.1,  icon: 'bed' },
  { name: 'Wardrobe',     category: CATEGORY.BEDROOM, width: 1.2,  height: 0.6,  icon: 'archive' },
  { name: 'Nightstand',   category: CATEGORY.BEDROOM, width: 0.5,  height: 0.4,  icon: 'lamp' },
  { name: 'Dresser',      category: CATEGORY.BEDROOM, width: 1.0,  height: 0.5,  icon: 'archive' },

  // Living Room
  { name: 'Sofa 2-Seat',  category: CATEGORY.LIVING, width: 1.6, height: 0.9, icon: 'sofa' },
  { name: 'Sofa 3-Seat',  category: CATEGORY.LIVING, width: 2.2, height: 0.9, icon: 'sofa' },
  { name: 'L-Sofa',       category: CATEGORY.LIVING, width: 2.4, height: 1.6, icon: 'sofa' },
  { name: 'Coffee Table', category: CATEGORY.LIVING, width: 1.2, height: 0.6, icon: 'desk' },
  { name: 'TV Stand',     category: CATEGORY.LIVING, width: 1.5, height: 0.4, icon: 'monitor' },
  { name: 'Bookshelf',    category: CATEGORY.LIVING, width: 1.0, height: 0.3, icon: 'book-open' },
  { name: 'Armchair',     category: CATEGORY.LIVING, width: 0.8, height: 0.8, icon: 'armchair' },

  // Dining
  { name: 'Dining Table 4', category: CATEGORY.DINING, width: 1.2, height: 0.8,  icon: 'desk' },
  { name: 'Dining Table 6', category: CATEGORY.DINING, width: 1.8, height: 1.0,  icon: 'desk' },
  { name: 'Dining Chair',   category: CATEGORY.DINING, width: 0.45, height: 0.45, icon: 'armchair' },
  { name: 'Bar Counter',    category: CATEGORY.DINING, width: 1.8, height: 0.5,   icon: 'wine' },

  // Office
  { name: 'Office Desk',     category: CATEGORY.OFFICE, width: 1.4, height: 0.7,  icon: 'desk' },
  { name: 'Office Chair',    category: CATEGORY.OFFICE, width: 0.55, height: 0.55, icon: 'armchair' },
  { name: 'Filing Cabinet',  category: CATEGORY.OFFICE, width: 0.45, height: 0.6,  icon: 'archive' },
  { name: 'Standing Desk',   category: CATEGORY.OFFICE, width: 1.5, height: 0.7,  icon: 'desk' },
];

let _furnitureIdCounter = 1;

class Furniture {
  /**
   * @param {object} opts
   * @param {string} opts.name
   * @param {object} opts.category — CATEGORY enum value
   * @param {number} opts.width    — width in meters
   * @param {number} opts.height   — height (depth) in meters
   * @param {number} [opts.x]      — position x in meters from room origin
   * @param {number} [opts.y]      — position y in meters from room origin
   * @param {number} [opts.rotation] — rotation in degrees (0, 90, 180, 270)
   */
  constructor(opts) {
    this.id = opts.id || `furn_${_furnitureIdCounter++}`;
    this.name = opts.name;
    this.category = opts.category || CATEGORY.CUSTOM;
    this.width = opts.width;    // meters
    this.height = opts.height;  // meters
    this.x = opts.x ?? 0;      // meters, center-based
    this.y = opts.y ?? 0;      // meters, center-based
    this.rotation = opts.rotation ?? 0; // degrees
    this.icon = opts.icon || 'box';
    this.isColliding = false;
    this.isSelected = false;
    this.isHovered = false;
  }

  /** Get color from category */
  get color() {
    return this.category.color;
  }

  get bgColor() {
    return this.category.bg;
  }

  /** Effective width after rotation */
  get effectiveWidth() {
    const r = ((this.rotation % 360) + 360) % 360;
    return (r === 90 || r === 270) ? this.height : this.width;
  }

  /** Effective height after rotation */
  get effectiveHeight() {
    const r = ((this.rotation % 360) + 360) % 360;
    return (r === 90 || r === 270) ? this.width : this.height;
  }

  /** Bounding box in meters { left, top, right, bottom } — axis-aligned */
  get bounds() {
    const hw = this.effectiveWidth / 2;
    const hh = this.effectiveHeight / 2;
    return {
      left: this.x - hw,
      top: this.y - hh,
      right: this.x + hw,
      bottom: this.y + hh
    };
  }

  /** Area in square meters */
  get area() {
    return this.width * this.height;
  }

  /** Check if a point (meters) is inside this furniture */
  containsPoint(px, py) {
    const b = this.bounds;
    return px >= b.left && px <= b.right && py >= b.top && py <= b.bottom;
  }

  /** Rotate by 90 degrees clockwise */
  rotate90() {
    this.rotation = (this.rotation + 90) % 360;
  }

  /** Clone this furniture with a new ID */
  clone() {
    return new Furniture({
      name: this.name,
      category: this.category,
      width: this.width,
      height: this.height,
      x: this.x + 0.2,
      y: this.y + 0.2,
      rotation: this.rotation,
      icon: this.icon
    });
  }

  /** Serialize */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      categoryId: this.category.id,
      width: this.width,
      height: this.height,
      x: this.x,
      y: this.y,
      rotation: this.rotation,
      icon: this.icon
    };
  }

  /** Deserialize */
  static fromJSON(data) {
    const cat = Object.values(CATEGORY).find(c => c.id === data.categoryId) || CATEGORY.CUSTOM;
    return new Furniture({
      id: data.id,
      name: data.name,
      category: cat,
      width: data.width,
      height: data.height,
      x: data.x,
      y: data.y,
      rotation: data.rotation,
      icon: data.icon
    });
  }
}

/** Create furniture from a catalog entry */
function createFurnitureFromCatalog(catalogEntry, x = 0, y = 0) {
  return new Furniture({
    name: catalogEntry.name,
    category: catalogEntry.category,
    width: catalogEntry.width,
    height: catalogEntry.height,
    icon: catalogEntry.icon,
    x,
    y
  });
}

/** Create custom furniture */
function createCustomFurniture(name, widthM, heightM, x = 0, y = 0) {
  return new Furniture({
    name,
    category: CATEGORY.CUSTOM,
    width: widthM,
    height: heightM,
    icon: 'box',
    x,
    y
  });
}

/** Reset ID counter (useful when loading saved state) */
function resetFurnitureIdCounter(maxId = 0) {
  _furnitureIdCounter = maxId + 1;
}
