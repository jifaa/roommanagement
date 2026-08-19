/**
 * app.js — Main Application Controller
 * Orchestrates all modules: Room, Furniture, Canvas, Interaction, Collision, Snap, Storage, UI, Zoom, Export.
 */

class App {
  constructor() {
    this.room = null;
    this.furnitureList = [];
    this.zoomCtrl = new ZoomController();
    this.renderer = null;
    this.interaction = null;
    this.isRoomCreated = false;
  }

  /** Initialize the app */
  init() {
    // Canvas setup
    const canvas = document.getElementById('main-canvas');
    this.renderer = new CanvasRenderer(canvas);
    this.interaction = new InteractionController(canvas, this.renderer, (action, furn) => {
      this._onInteraction(action, furn);
    });

    // Try to load auto-saved state
    const saved = Storage.load();
    if (saved) {
      this.room = saved.room;
      this.furnitureList = saved.furniture;
      this.isRoomCreated = true;
      this._activateCanvas();
      UI.toast('Layout restored from last session', 'info');
    }

    // Bind UI events
    this._bindUIEvents();

    // Build furniture catalog
    UI.buildCatalog(FURNITURE_CATALOG, (item) => this._addFurnitureFromCatalog(item));

    // Initial floor info
    this._updateFloorInfo();
  }

  // ─── Room Setup ───────────────────────────────────────

  _createRoom(width, height, unit) {
    this.room = new Room(width, height, unit);
    this.furnitureList = [];
    this.isRoomCreated = true;
    this._activateCanvas();
    UI.toast(`Room created: ${width}${unit} × ${height}${unit}`, 'success');
    Storage.autoSave(this.room, this.furnitureList);
  }

  _activateCanvas() {
    document.getElementById('welcome-overlay').classList.add('hidden');
    document.getElementById('canvas-container').classList.add('active');

    this.renderer.init(this.room, this.furnitureList, this.zoomCtrl);
    this.interaction.init(this.room, this.furnitureList, this.zoomCtrl);

    // Fit room to view
    this.renderer.resize();
    this.zoomCtrl.fitToView(this.room, this.renderer.logicalWidth, this.renderer.logicalHeight);
    this.renderer.requestRender();
    this._updateFloorInfo();
    this._updateRoomForm();
    this._refreshWallElementsList();
    this._refreshConstraintsList();
  }

  _updateRoomForm() {
    if (!this.room) return;
    document.getElementById('room-width').value = this.room.width;
    document.getElementById('room-height').value = this.room.height;
    document.getElementById('room-unit').value = this.room.unit;
  }

  // ─── Furniture Management ─────────────────────────────

  _addFurnitureFromCatalog(catalogEntry) {
    if (!this.isRoomCreated) {
      UI.toast('Please create a room first', 'warning');
      return;
    }
    const furn = createFurnitureFromCatalog(catalogEntry);
    this.interaction.placeAtCenter(furn);
    this.furnitureList.push(furn);
    Collision.checkAll(this.furnitureList, this.room);
    this.interaction.select(furn);
    this.renderer.requestRender();
    this._updateFloorInfo();
    Storage.autoSave(this.room, this.furnitureList);
    UI.toast(`Added: ${furn.name}`, 'success');
  }

  _addCustomFurniture(name, width, height) {
    if (!this.isRoomCreated) {
      UI.toast('Please create a room first', 'warning');
      return;
    }
    const furn = createCustomFurniture(name, width, height);
    this.interaction.placeAtCenter(furn);
    this.furnitureList.push(furn);
    Collision.checkAll(this.furnitureList, this.room);
    this.interaction.select(furn);
    this.renderer.requestRender();
    this._updateFloorInfo();
    Storage.autoSave(this.room, this.furnitureList);
    UI.toast(`Added custom: ${name}`, 'success');
  }

  _deleteFurniture(furn) {
    const idx = this.furnitureList.indexOf(furn);
    if (idx > -1) {
      this.furnitureList.splice(idx, 1);
      this.interaction.deselect();
      // Clean up any relations referring to deleted furniture
      if (this.room) {
        this.room.cleanFurnitureRelations(this.furnitureList.map(f => f.id));
        this._refreshConstraintsList();
      }
      Collision.checkAll(this.furnitureList, this.room);
      this.renderer.requestRender();
      this._updateFloorInfo();
      Storage.autoSave(this.room, this.furnitureList);
      UI.toast(`Deleted: ${furn.name}`, 'info');
    }
  }

  _duplicateFurniture(furn) {
    const clone = furn.clone();
    Collision.clampToRoom(clone, this.room);
    this.furnitureList.push(clone);
    Collision.checkAll(this.furnitureList, this.room);
    this.interaction.select(clone);
    this.renderer.requestRender();
    this._updateFloorInfo();
    Storage.autoSave(this.room, this.furnitureList);
    UI.toast(`Duplicated: ${furn.name}`, 'success');
  }

  // ─── Interaction Callback ─────────────────────────────

  _onInteraction(action, data) {
    switch (action) {
      case 'select':
        UI.updatePropertyPanel(data, {
          onUpdate: (f) => this._onPropertyUpdate(f),
          onDelete: (f) => this._deleteFurniture(f),
          onDuplicate: (f) => this._duplicateFurniture(f),
          onRotate: (f) => {
            f.rotate90();
            Collision.clampToRoom(f, this.room);
            Collision.checkAll(this.furnitureList, this.room);
            this.renderer.requestRender();
            Storage.autoSave(this.room, this.furnitureList);
            UI.updatePropertyPanel(f, {
              onUpdate: (f2) => this._onPropertyUpdate(f2),
              onDelete: (f2) => this._deleteFurniture(f2),
              onDuplicate: (f2) => this._duplicateFurniture(f2),
              onRotate: (f2) => this._onInteraction('rotate', f2)
            });
          }
        });
        break;

      case 'multi_select':
        if (Array.isArray(data) && data.length >= 2) {
          UI.openModal('relation-modal');
          UI.populateRelationModal(this.furnitureList, data[0], data[1]);
        }
        break;

      case 'add_zone':
        if (this.room && data) {
          this.room.addKeepEmptyZone(data);
          this.renderer.requestRender();
          this._refreshConstraintsList();
          Storage.autoSave(this.room, this.furnitureList);
          UI.toast('Zona kosong berhasil ditambahkan', 'success');
        }
        break;

      case 'exit_draw_zone':
        const drawBtn = document.getElementById('btn-draw-zone');
        if (drawBtn) drawBtn.classList.remove('btn-active');
        const guide = document.getElementById('draw-zone-guide');
        if (guide) guide.classList.add('hidden');
        break;

      case 'move':
      case 'drop':
      case 'rotate':
        this._updateFloorInfo();
        Storage.autoSave(this.room, this.furnitureList);
        break;

      case 'delete':
        this._deleteFurniture(data);
        break;

      case 'duplicate':
        this._duplicateFurniture(data);
        break;

      case 'edit':
        const propPanel = document.getElementById('property-panel');
        if (propPanel && window.innerWidth < 768) {
          propPanel.scrollIntoView({ behavior: 'smooth' });
        }
        break;

      case 'zoom':
        document.getElementById('zoom-level').textContent = this.zoomCtrl.zoomPercent;
        break;
    }
  }

  _onPropertyUpdate(furn) {
    Collision.clampToRoom(furn, this.room);
    Collision.checkAll(this.furnitureList, this.room);
    this.renderer.requestRender();
    this._updateFloorInfo();
    Storage.autoSave(this.room, this.furnitureList);
    UI.toast('Properties updated', 'success');
  }

  // ─── Floor Info ───────────────────────────────────────

  _updateFloorInfo() {
    if (this.room) {
      UI.updateFloorInfo(this.room, this.furnitureList);
    }
  }

  // ─── Auto-Arrange with Simulated Annealing Refinement ──

  async _autoArrange() {
    if (!this.isRoomCreated || this.furnitureList.length === 0) {
      UI.toast('Tambahkan furnitur terlebih dahulu', 'warning');
      return;
    }

    const btn = document.getElementById('btn-auto-arrange');
    btn.classList.add('arranging');

    // Deselect any currently selected furniture
    this.interaction.deselect();

    // Save starting positions for smooth animation
    const moves = this.furnitureList.map(f => ({
      furn: f,
      oldX: f.x,
      oldY: f.y,
      oldRot: f.rotation,
      newX: f.x,
      newY: f.y,
      newRot: f.rotation
    }));

    try {
      // ── Stage 1: Rule-Based Heuristic Auto-Arrange (Base Placement) ──
      AutoArrange.arrange(this.room, this.furnitureList);

      // ── Stage 2: Simulated Annealing Refinement (Constraint Optimization) ──
      const saResult = await SimulatedAnnealing.refine(this.furnitureList, this.room, {
        initialTemp: 1000,
        coolingRate: 0.995,
        minTemp: 1,
        maxIterations: 5000,
        timeBudgetMs: 3500
      });

      // Match SA results with furniture list
      if (saResult && saResult.furnitureList && saResult.furnitureList.length > 0) {
        const saMap = {};
        saResult.furnitureList.forEach(item => { saMap[item.id] = item; });

        moves.forEach(m => {
          const saPos = saMap[m.furn.id];
          if (saPos) {
            m.newX = saPos.x;
            m.newY = saPos.y;
            m.newRot = saPos.rotation;
          } else {
            m.newX = m.furn.x;
            m.newY = m.furn.y;
            m.newRot = m.furn.rotation;
          }
        });
      }

      // Animate: restore old positions, then lerp smoothly to new positions
      const duration = 650; // ms
      const startTime = performance.now();

      moves.forEach(m => {
        m.furn.x = m.oldX;
        m.furn.y = m.oldY;
        m.furn.rotation = m.oldRot;
      });

      const animate = (now) => {
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / duration);
        // Ease out cubic
        const ease = 1 - Math.pow(1 - t, 3);

        moves.forEach(m => {
          m.furn.x = m.oldX + (m.newX - m.oldX) * ease;
          m.furn.y = m.oldY + (m.newY - m.oldY) * ease;

          // Lerp rotation (handle wrap-around)
          let dRot = m.newRot - m.oldRot;
          if (dRot > 180) dRot -= 360;
          if (dRot < -180) dRot += 360;
          m.furn.rotation = ((m.oldRot + dRot * ease) % 360 + 360) % 360;
        });

        this.renderer.requestRender();
        this.renderer.renderNow();

        if (t < 1) {
          requestAnimationFrame(animate);
        } else {
          // Finalize exact positions
          moves.forEach(m => {
            m.furn.x = m.newX;
            m.furn.y = m.newY;
            m.furn.rotation = m.newRot;
          });

          // Final collision check & update
          Collision.checkAll(this.furnitureList, this.room);
          this.renderer.requestRender();
          this._updateFloorInfo();
          Storage.autoSave(this.room, this.furnitureList);

          btn.classList.remove('arranging');

          const comfortScore = (saResult && saResult.comfortScore !== undefined) ? saResult.comfortScore : 90;
          const violations = saResult ? saResult.violations : null;

          if (violations && violations.details && violations.details.length > 0) {
            UI.toast(`Layout dioptimalkan — Skor kenyamanan: ${comfortScore}/100`, 'info');
            setTimeout(() => {
              UI.toast(`⚠️ Catatan: ${violations.details[0]}`, 'warning', 4500);
            }, 600);
          } else {
            UI.toast(`✨ Layout berhasil disusun — Skor kenyamanan: ${comfortScore}/100!`, 'success');
          }
        }
      };

      requestAnimationFrame(animate);

    } catch (err) {
      console.error('Error during auto-arrange:', err);
      btn.classList.remove('arranging');
      UI.toast('Terjadi kesalahan saat menyusun otomatis', 'error');
    }
  }

  // ─── Wall Elements ────────────────────────────────────

  _addDoor(wall, position) {
    if (!this.room) return;
    const maxPos = this.room.getWallLength(wall) - 0.9;
    const pos = Math.min(Math.max(0, position), maxPos);
    this.room.addDoor(wall, pos, 0.9);
    this.renderer.requestRender();
    this._refreshWallElementsList();
    Storage.autoSave(this.room, this.furnitureList);
    UI.toast('Door added', 'success');
  }

  _addWindow(wall, position) {
    if (!this.room) return;
    const maxPos = this.room.getWallLength(wall) - 1.0;
    const pos = Math.min(Math.max(0, position), maxPos);
    this.room.addWindow(wall, pos, 1.0);
    this.renderer.requestRender();
    this._refreshWallElementsList();
    Storage.autoSave(this.room, this.furnitureList);
    UI.toast('Window added', 'success');
  }

  _deleteWallElement(elementId) {
    if (!this.room) return;
    this.room.removeElement(elementId);
    this.renderer.requestRender();
    this._refreshWallElementsList();
    Storage.autoSave(this.room, this.furnitureList);
    UI.toast('Wall element removed', 'info');
  }

  _refreshWallElementsList() {
    if (!this.room) return;
    UI.updateWallElementsList(this.room, (id) => this._deleteWallElement(id));
  }

  // ─── Constraints Management ───────────────────────────

  _deleteConstraint(constraintId) {
    if (!this.room) return;
    this.room.removeConstraint(constraintId);
    this.renderer.requestRender();
    this._refreshConstraintsList();
    Storage.autoSave(this.room, this.furnitureList);
    UI.toast('Aturan berhasil dihapus', 'info');
  }

  _refreshConstraintsList() {
    if (!this.room) return;
    UI.updateConstraintsList(this.room, this.furnitureList, (id) => this._deleteConstraint(id));
  }

  // ─── UI Event Bindings ────────────────────────────────

  _bindUIEvents() {
    // Room form submit
    document.getElementById('room-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const width = parseFloat(document.getElementById('room-width').value);
      const height = parseFloat(document.getElementById('room-height').value);
      const unit = document.getElementById('room-unit').value;

      if (!width || !height || width <= 0 || height <= 0) {
        UI.toast('Please enter valid dimensions', 'error');
        return;
      }

      if (this.isRoomCreated) {
        // Update existing room
        this.room.width = width;
        this.room.height = height;
        this.room.unit = unit;
        // Re-clamp all furniture
        this.furnitureList.forEach(f => Collision.clampToRoom(f, this.room));
        Collision.checkAll(this.furnitureList, this.room);
        this.zoomCtrl.fitToView(this.room, this.renderer.logicalWidth, this.renderer.logicalHeight);
        this.renderer.requestRender();
        this._updateFloorInfo();
        Storage.autoSave(this.room, this.furnitureList);
        UI.toast('Room updated', 'success');
      } else {
        this._createRoom(width, height, unit);
      }
    });

    // Draw Zone button toggle
    const btnDrawZone = document.getElementById('btn-draw-zone');
    const drawZoneGuide = document.getElementById('draw-zone-guide');
    if (btnDrawZone) {
      btnDrawZone.addEventListener('click', () => {
        if (!this.isRoomCreated) {
          UI.toast('Buat ruangan terlebih dahulu', 'warning');
          return;
        }

        if (this.interaction.mode === 'draw_zone') {
          this.interaction.cancelDrawZoneMode();
          btnDrawZone.classList.remove('btn-active');
          if (drawZoneGuide) drawZoneGuide.classList.add('hidden');
        } else {
          this.interaction.startDrawZoneMode();
          btnDrawZone.classList.add('btn-active');
          if (drawZoneGuide) drawZoneGuide.classList.remove('hidden');
          UI.toast('Mode Gambar: Drag pada kanvas untuk membuat zona kosong', 'info');
        }
      });
    }

    // Add Relation button & Modal
    const btnAddRelation = document.getElementById('btn-add-relation');
    if (btnAddRelation) {
      btnAddRelation.addEventListener('click', () => {
        if (!this.isRoomCreated) {
          UI.toast('Buat ruangan terlebih dahulu', 'warning');
          return;
        }
        if (this.furnitureList.length < 2) {
          UI.toast('Tambahkan minimal 2 furnitur untuk membuat relasi', 'warning');
          return;
        }

        UI.openModal('relation-modal');
        UI.populateRelationModal(this.furnitureList, this.interaction.selectedFurniture);
      });
    }

    // Relation weight range input
    const relationWeight = document.getElementById('relation-weight');
    const relationWeightVal = document.getElementById('relation-weight-val');
    if (relationWeight && relationWeightVal) {
      relationWeight.addEventListener('input', (e) => {
        relationWeightVal.textContent = `${e.target.value} / 10`;
      });
    }

    // Relation form submit
    const relationForm = document.getElementById('relation-form');
    if (relationForm) {
      relationForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const furnA = document.getElementById('relation-furn-a').value;
        const furnB = document.getElementById('relation-furn-b').value;
        const type = document.getElementById('relation-type').value;
        const weight = parseInt(document.getElementById('relation-weight').value) || 5;

        if (!furnA || !furnB) {
          UI.toast('Pilih furnitur yang ingin dihubungkan', 'error');
          return;
        }

        if (furnA === furnB) {
          UI.toast('Pilih dua furnitur yang berbeda', 'warning');
          return;
        }

        this.room.addRelation({
          furnitureIdA: furnA,
          furnitureIdB: furnB,
          type,
          weight
        });

        this.renderer.requestRender();
        this._refreshConstraintsList();
        Storage.autoSave(this.room, this.furnitureList);
        UI.closeModal('relation-modal');
        UI.toast('Relasi furnitur berhasil ditambahkan', 'success');
      });
    }

    // Custom furniture modal
    document.getElementById('btn-add-custom').addEventListener('click', () => {
      UI.openModal('custom-furniture-modal');
    });

    document.getElementById('custom-furniture-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('custom-name').value.trim();
      const width = parseFloat(document.getElementById('custom-width').value);
      const height = parseFloat(document.getElementById('custom-height').value);

      if (!name || !width || !height || width <= 0 || height <= 0) {
        UI.toast('Please fill all fields correctly', 'error');
        return;
      }

      this._addCustomFurniture(name, width, height);
      UI.closeModal('custom-furniture-modal');
      e.target.reset();
    });

    // Door/Window modal
    document.getElementById('btn-add-door').addEventListener('click', () => {
      if (!this.isRoomCreated) { UI.toast('Create a room first', 'warning'); return; }
      UI.openModal('wall-element-modal');
      document.getElementById('wall-element-type').value = 'door';
    });
    document.getElementById('btn-add-window').addEventListener('click', () => {
      if (!this.isRoomCreated) { UI.toast('Create a room first', 'warning'); return; }
      UI.openModal('wall-element-modal');
      document.getElementById('wall-element-type').value = 'window';
    });

    document.getElementById('wall-element-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const type = document.getElementById('wall-element-type').value;
      const wall = document.getElementById('wall-element-wall').value;
      const position = parseFloat(document.getElementById('wall-element-position').value);

      if (isNaN(position)) { UI.toast('Enter a valid position', 'error'); return; }

      if (type === 'door') {
        this._addDoor(wall, position);
      } else {
        this._addWindow(wall, position);
      }
      UI.closeModal('wall-element-modal');
      e.target.reset();
    });

    // Modal close buttons
    document.querySelectorAll('.modal-close, .modal-backdrop').forEach(el => {
      el.addEventListener('click', () => UI.closeAllModals());
    });

    // Zoom controls
    document.getElementById('btn-zoom-in').addEventListener('click', () => {
      this.zoomCtrl.zoomIn();
      this.renderer.requestRender();
      document.getElementById('zoom-level').textContent = this.zoomCtrl.zoomPercent;
    });
    document.getElementById('btn-zoom-out').addEventListener('click', () => {
      this.zoomCtrl.zoomOut();
      this.renderer.requestRender();
      document.getElementById('zoom-level').textContent = this.zoomCtrl.zoomPercent;
    });
    document.getElementById('btn-zoom-fit').addEventListener('click', () => {
      if (this.room) {
        this.zoomCtrl.fitToView(this.room, this.renderer.logicalWidth, this.renderer.logicalHeight);
        this.renderer.requestRender();
        document.getElementById('zoom-level').textContent = this.zoomCtrl.zoomPercent;
      }
    });

    // Export buttons
    document.getElementById('btn-export-png').addEventListener('click', () => {
      if (!this.isRoomCreated) { UI.toast('Create a room first', 'warning'); return; }
      ExportPNG.exportAsPNG(this.room, this.furnitureList);
      UI.toast('PNG exported!', 'success');
    });

    document.getElementById('btn-export-json').addEventListener('click', () => {
      if (!this.isRoomCreated) { UI.toast('Create a room first', 'warning'); return; }
      Storage.downloadJSON(this.room, this.furnitureList);
      UI.toast('JSON exported!', 'success');
    });

    // Import JSON
    document.getElementById('btn-import-json').addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const result = Storage.importJSON(ev.target.result);
          if (result) {
            this.room = result.room;
            this.furnitureList = result.furniture;
            this.isRoomCreated = true;
            this._activateCanvas();
            UI.toast('Layout imported successfully!', 'success');
          } else {
            UI.toast('Invalid JSON file', 'error');
          }
        };
        reader.readAsText(file);
      });
      input.click();
    });

    // Save/Load named layouts
    document.getElementById('btn-save-layout').addEventListener('click', () => {
      if (!this.isRoomCreated) { UI.toast('Create a room first', 'warning'); return; }
      UI.openModal('save-layout-modal');
    });

    document.getElementById('save-layout-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('layout-name').value.trim();
      if (!name) { UI.toast('Enter a layout name', 'error'); return; }
      Storage.saveNamed(name, this.room, this.furnitureList);
      UI.closeModal('save-layout-modal');
      UI.toast(`Layout "${name}" saved!`, 'success');
      document.getElementById('layout-name').value = '';
    });

    document.getElementById('btn-load-layout').addEventListener('click', () => {
      UI.openModal('load-layout-modal');
      UI.updateSavedLayouts(Storage.listLayouts(), {
        onLoad: (name) => {
          const result = Storage.loadNamed(name);
          if (result) {
            this.room = result.room;
            this.furnitureList = result.furniture;
            this.isRoomCreated = true;
            this._activateCanvas();
            UI.closeModal('load-layout-modal');
            UI.toast(`Layout "${name}" loaded!`, 'success');
          }
        },
        onDelete: (name) => {
          Storage.deleteNamed(name);
          UI.updateSavedLayouts(Storage.listLayouts(), {
            onLoad: (n) => { /* re-bind on refresh */ },
            onDelete: (n) => { /* re-bind on refresh */ }
          });
          UI.toast(`Layout "${name}" deleted`, 'info');
          // Refresh list
          document.getElementById('btn-load-layout').click();
        }
      });
    });

    // Auto-Arrange button
    document.getElementById('btn-auto-arrange').addEventListener('click', () => {
      this._autoArrange();
    });

    // Clear all furniture
    document.getElementById('btn-clear-all').addEventListener('click', () => {
      if (!this.isRoomCreated || this.furnitureList.length === 0) return;
      if (confirm('Remove all furniture from the room?')) {
        this.furnitureList.length = 0;
        this.interaction.deselect();
        Collision.checkAll(this.furnitureList, this.room);
        this.renderer.requestRender();
        this._updateFloorInfo();
        Storage.autoSave(this.room, this.furnitureList);
        UI.toast('All furniture removed', 'info');
      }
    });

    // Sidebar toggle (mobile)
    document.getElementById('btn-toggle-sidebar').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('open');
    });

    // Close sidebar when clicking overlay on mobile
    document.getElementById('sidebar-overlay').addEventListener('click', () => {
      document.getElementById('sidebar').classList.remove('open');
    });
  }
}

// ─── Bootstrap ────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});
