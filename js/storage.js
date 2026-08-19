/**
 * storage.js — LocalStorage Save/Load & JSON Export/Import
 * Persists room layouts to localStorage and handles JSON serialization.
 */

const Storage = {
  STORAGE_KEY: 'roomLayoutDesigner_autosave',
  LAYOUTS_KEY: 'roomLayoutDesigner_layouts',

  /** Debounce timer for auto-save */
  _saveTimer: null,

  /**
   * Auto-save current state (debounced).
   * @param {Room} room
   * @param {Furniture[]} furnitureList
   */
  autoSave(room, furnitureList) {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this.save(room, furnitureList);
    }, 500);
  },

  /**
   * Save state immediately.
   * @param {Room} room
   * @param {Furniture[]} furnitureList
   */
  save(room, furnitureList) {
    try {
      const data = {
        version: 1,
        timestamp: Date.now(),
        room: room.toJSON(),
        furniture: furnitureList.map(f => f.toJSON())
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.warn('Failed to save:', e);
      return false;
    }
  },

  /**
   * Load auto-saved state.
   * @returns {{ room: Room, furniture: Furniture[] } | null}
   */
  load() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return null;
      return this._parseData(JSON.parse(raw));
    } catch (e) {
      console.warn('Failed to load:', e);
      return null;
    }
  },

  /**
   * Save named layout.
   * @param {string} name
   * @param {Room} room
   * @param {Furniture[]} furnitureList
   */
  saveNamed(name, room, furnitureList) {
    try {
      const layouts = this._getLayouts();
      layouts[name] = {
        version: 1,
        timestamp: Date.now(),
        room: room.toJSON(),
        furniture: furnitureList.map(f => f.toJSON())
      };
      localStorage.setItem(this.LAYOUTS_KEY, JSON.stringify(layouts));
      return true;
    } catch (e) {
      console.warn('Failed to save layout:', e);
      return false;
    }
  },

  /**
   * Load a named layout.
   * @param {string} name
   * @returns {{ room: Room, furniture: Furniture[] } | null}
   */
  loadNamed(name) {
    try {
      const layouts = this._getLayouts();
      if (!layouts[name]) return null;
      return this._parseData(layouts[name]);
    } catch (e) {
      console.warn('Failed to load layout:', e);
      return null;
    }
  },

  /**
   * Delete a named layout.
   */
  deleteNamed(name) {
    const layouts = this._getLayouts();
    delete layouts[name];
    localStorage.setItem(this.LAYOUTS_KEY, JSON.stringify(layouts));
  },

  /**
   * List all saved layout names.
   * @returns {string[]}
   */
  listLayouts() {
    const layouts = this._getLayouts();
    return Object.keys(layouts).map(name => ({
      name,
      timestamp: layouts[name].timestamp
    }));
  },

  /**
   * Export current state as JSON string.
   * @param {Room} room
   * @param {Furniture[]} furnitureList
   * @returns {string}
   */
  exportJSON(room, furnitureList) {
    const data = {
      version: 1,
      appName: 'RoomLayoutDesigner',
      timestamp: Date.now(),
      room: room.toJSON(),
      furniture: furnitureList.map(f => f.toJSON())
    };
    return JSON.stringify(data, null, 2);
  },

  /**
   * Import state from JSON string.
   * @param {string} jsonStr
   * @returns {{ room: Room, furniture: Furniture[] } | null}
   */
  importJSON(jsonStr) {
    try {
      const data = JSON.parse(jsonStr);
      if (!data.room || !data.furniture) {
        throw new Error('Invalid format: missing room or furniture data');
      }
      return this._parseData(data);
    } catch (e) {
      console.warn('Failed to import JSON:', e);
      return null;
    }
  },

  /**
   * Trigger download of JSON file.
   * @param {Room} room
   * @param {Furniture[]} furnitureList
   * @param {string} filename
   */
  downloadJSON(room, furnitureList, filename = 'room-layout.json') {
    const json = this.exportJSON(room, furnitureList);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  // ── Internal helpers ─────────────────────────────────

  _getLayouts() {
    try {
      const raw = localStorage.getItem(this.LAYOUTS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  },

  _parseData(data) {
    const room = Room.fromJSON(data.room);
    const furniture = (data.furniture || []).map(f => Furniture.fromJSON(f));
    // Restore furniture ID counter
    const maxId = furniture.reduce((max, f) => {
      const num = parseInt(f.id.split('_')[1]) || 0;
      return Math.max(max, num);
    }, 0);
    resetFurnitureIdCounter(maxId);
    return { room, furniture };
  }
};
