/**
 * ui.js — UI Panel Controllers
 * Manages sidebar, modals, toasts, furniture property editor, and floor area display.
 */

const UI = {
  /** Show a toast notification */
  toast(message, type = 'success', duration = 3000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const iconNames = { success: 'check', error: 'x', info: 'info', warning: 'alert-triangle' };
    toast.innerHTML = `<span class="toast-icon">${Icons.get(iconNames[type] || 'info', 14)}</span><span class="toast-msg">${message}</span>`;
    
    container.appendChild(toast);
    
    // Trigger animation
    requestAnimationFrame(() => toast.classList.add('show'));
    
    setTimeout(() => {
      toast.classList.remove('show');
      toast.classList.add('hide');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  /** Open a modal */
  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('active');
      document.body.classList.add('modal-open');
    }
  },

  /** Close a modal */
  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('active');
      document.body.classList.remove('modal-open');
    }
  },

  /** Close all modals */
  closeAllModals() {
    document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
    document.body.classList.remove('modal-open');
  },

  /**
   * Build the furniture catalog HTML in the sidebar.
   * @param {Array} catalog — FURNITURE_CATALOG
   * @param {function} onAdd — callback(catalogEntry) when user clicks add
   */
  buildCatalog(catalog, onAdd) {
    const container = document.getElementById('furniture-catalog');
    if (!container) return;

    // Group by category
    const groups = {};
    catalog.forEach(item => {
      const catId = item.category.id;
      if (!groups[catId]) groups[catId] = { category: item.category, items: [] };
      groups[catId].items.push(item);
    });

    container.innerHTML = '';

    Object.values(groups).forEach(group => {
      const section = document.createElement('div');
      section.className = 'catalog-section';

      const header = document.createElement('div');
      header.className = 'catalog-header';
      header.innerHTML = `<span class="catalog-dot" style="background:${group.category.color}"></span><span class="catalog-header-icon" style="color:${group.category.color}">${Icons.get(group.category.icon, 14)}</span>${group.category.label}`;
      header.addEventListener('click', () => section.classList.toggle('collapsed'));
      section.appendChild(header);

      const list = document.createElement('div');
      list.className = 'catalog-list';

      group.items.forEach(item => {
        const btn = document.createElement('button');
        btn.className = 'catalog-item';
        btn.title = `${item.name} (${item.width}×${item.height}m)`;
        btn.innerHTML = `
          <span class="catalog-item-icon" style="color:${item.category.color}">${Icons.get(item.icon, 16)}</span>
          <span class="catalog-item-info">
            <span class="catalog-item-name">${item.name}</span>
            <span class="catalog-item-size">${item.width}×${item.height}m</span>
          </span>
          <span class="catalog-item-add" style="color:${item.category.color}">${Icons.get('plus', 16)}</span>
        `;
        btn.addEventListener('click', () => onAdd(item));
        list.appendChild(btn);
      });

      section.appendChild(list);
      container.appendChild(section);
    });
  },

  /**
   * Update the furniture properties editor panel.
  /**
   * Update the wall elements list in the sidebar (doors & windows).
   * @param {Room} room
   * @param {function} onDelete — callback(elementId) when user clicks delete
   */
  updateWallElementsList(room, onDelete) {
    const container = document.getElementById('wall-elements-list');
    if (!container) return;

    const elements = [...room.doors, ...room.windows];
    if (elements.length === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = '';
    elements.forEach(el => {
      const item = document.createElement('div');
      item.className = 'wall-element-item';
      const iconName = el.type === 'door' ? 'door-open' : 'window';
      const wallLabel = el.wall.charAt(0).toUpperCase() + el.wall.slice(1);
      item.innerHTML = `
        <div class="wall-element-info">
          <span class="icon">${Icons.get(iconName, 14)}</span>
          <span class="label">${el.type === 'door' ? 'Door' : 'Window'}</span>
          <span class="detail">${wallLabel} @ ${el.position}m</span>
        </div>
        <button class="wall-element-delete" title="Remove">${Icons.get('x', 12)}</button>
      `;
      item.querySelector('.wall-element-delete').addEventListener('click', () => {
        onDelete(el.id);
      });
      container.appendChild(item);
    });
  },

  /**
   * Update constraints list in sidebar (keepEmptyZones and furniture relations).
   * @param {Room} room
   * @param {Furniture[]} furnitureList
   * @param {function} onDeleteConstraint — callback(constraintId)
   */
  updateConstraintsList(room, furnitureList, onDeleteConstraint) {
    const container = document.getElementById('constraints-list');
    if (!container) return;

    const keepEmptyZones = (room && room.constraints && room.constraints.keepEmptyZones) ? room.constraints.keepEmptyZones : [];
    const relations = (room && room.constraints && room.constraints.relations) ? room.constraints.relations : [];

    if (keepEmptyZones.length === 0 && relations.length === 0) {
      container.innerHTML = '<div class="empty-state-hint">Belum ada zona kosong atau relasi</div>';
      return;
    }

    container.innerHTML = '';
    const furnMap = {};
    (furnitureList || []).forEach(f => { furnMap[f.id] = f; });

    // 1. Render Keep-Empty Zones
    keepEmptyZones.forEach(z => {
      const item = document.createElement('div');
      item.className = 'constraint-item constraint-zone';
      const w = (Math.abs(z.right - z.left)).toFixed(1);
      const h = (Math.abs(z.bottom - z.top)).toFixed(1);
      item.innerHTML = `
        <div class="constraint-info">
          <span class="constraint-icon" style="color:#ef4444">${Icons.get('ban', 14)}</span>
          <div class="constraint-text">
            <span class="constraint-name">${z.name || 'Zona Kosong'}</span>
            <span class="constraint-detail">${w}×${h}m (@${z.left.toFixed(1)}, ${z.top.toFixed(1)})</span>
          </div>
        </div>
        <button type="button" class="constraint-delete" title="Hapus">${Icons.get('x', 12)}</button>
      `;
      item.querySelector('.constraint-delete').addEventListener('click', () => {
        onDeleteConstraint(z.id);
      });
      container.appendChild(item);
    });

    // 2. Render Relations
    relations.forEach(r => {
      const a = furnMap[r.furnitureIdA];
      const b = furnMap[r.furnitureIdB];
      const nameA = a ? a.name : 'Item';
      const nameB = b ? b.name : 'Item';

      const type = r.type || r.relationType || 'near';
      let typeLabel = 'Harus Dekat';
      let typeColor = '#22d3ee';
      let iconName = 'link';

      if (type === 'far') {
        typeLabel = 'Harus Jauh';
        typeColor = '#f43f5e';
        iconName = 'ban';
      } else if (type === 'facing') {
        typeLabel = 'Harus Menghadap';
        typeColor = '#a855f7';
        iconName = 'eye';
      }

      const item = document.createElement('div');
      item.className = 'constraint-item constraint-relation';
      item.innerHTML = `
        <div class="constraint-info">
          <span class="constraint-icon" style="color:${typeColor}">${Icons.get(iconName, 14)}</span>
          <div class="constraint-text">
            <span class="constraint-name">${nameA} ↔ ${nameB}</span>
            <span class="constraint-detail">${typeLabel} • Prioritas: ${r.weight || 5}/10</span>
          </div>
        </div>
        <button type="button" class="constraint-delete" title="Hapus">${Icons.get('x', 12)}</button>
      `;
      item.querySelector('.constraint-delete').addEventListener('click', () => {
        onDeleteConstraint(r.id);
      });
      container.appendChild(item);
    });
  },

  /**
   * Populate the Relation Modal dropdowns with current furniture.
   * @param {Furniture[]} furnitureList
   * @param {Furniture} [preselectedA]
   * @param {Furniture} [preselectedB]
   */
  populateRelationModal(furnitureList, preselectedA, preselectedB) {
    const selectA = document.getElementById('relation-furn-a');
    const selectB = document.getElementById('relation-furn-b');
    if (!selectA || !selectB) return;

    selectA.innerHTML = '';
    selectB.innerHTML = '';

    furnitureList.forEach(f => {
      const optA = document.createElement('option');
      optA.value = f.id;
      optA.textContent = `${f.name} (${f.width}×${f.height}m)`;
      selectA.appendChild(optA);

      const optB = document.createElement('option');
      optB.value = f.id;
      optB.textContent = `${f.name} (${f.width}×${f.height}m)`;
      selectB.appendChild(optB);
    });

    if (preselectedA) selectA.value = preselectedA.id;
    if (preselectedB) {
      selectB.value = preselectedB.id;
    } else if (furnitureList.length > 1) {
      const other = furnitureList.find(f => f.id !== selectA.value);
      if (other) selectB.value = other.id;
    }
  },

  /**
   * Update the furniture properties editor panel.
   * @param {Furniture|null} furn
   * @param {object} callbacks — { onUpdate, onDelete, onDuplicate, onRotate }
   */
  updatePropertyPanel(furn, callbacks) {
    const panel = document.getElementById('property-panel');
    if (!panel) return;

    if (!furn) {
      panel.classList.remove('active');
      return;
    }

    panel.classList.add('active');

    document.getElementById('prop-name').value = furn.name;
    document.getElementById('prop-width').value = furn.width;
    document.getElementById('prop-height').value = furn.height;
    document.getElementById('prop-rotation').value = furn.rotation;
    document.getElementById('prop-x').value = parseFloat(furn.x.toFixed(2));
    document.getElementById('prop-y').value = parseFloat(furn.y.toFixed(2));
    document.getElementById('prop-category').textContent = furn.category.label;

    // Color indicator
    const colorDot = document.getElementById('prop-color-dot');
    if (colorDot) colorDot.style.background = furn.color;

    // Remove old listeners by cloning
    const applyBtn = document.getElementById('prop-apply');
    const newApplyBtn = applyBtn.cloneNode(true);
    applyBtn.parentNode.replaceChild(newApplyBtn, applyBtn);
    newApplyBtn.addEventListener('click', () => {
      furn.name = document.getElementById('prop-name').value || furn.name;
      furn.width = parseFloat(document.getElementById('prop-width').value) || furn.width;
      furn.height = parseFloat(document.getElementById('prop-height').value) || furn.height;
      furn.rotation = parseFloat(document.getElementById('prop-rotation').value) || 0;
      furn.x = parseFloat(document.getElementById('prop-x').value) || furn.x;
      furn.y = parseFloat(document.getElementById('prop-y').value) || furn.y;
      callbacks.onUpdate(furn);
    });

    const deleteBtn = document.getElementById('prop-delete');
    const newDeleteBtn = deleteBtn.cloneNode(true);
    deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);
    newDeleteBtn.addEventListener('click', () => callbacks.onDelete(furn));

    const duplicateBtn = document.getElementById('prop-duplicate');
    const newDuplicateBtn = duplicateBtn.cloneNode(true);
    duplicateBtn.parentNode.replaceChild(newDuplicateBtn, duplicateBtn);
    newDuplicateBtn.addEventListener('click', () => callbacks.onDuplicate(furn));

    const rotateBtn = document.getElementById('prop-rotate');
    const newRotateBtn = rotateBtn.cloneNode(true);
    rotateBtn.parentNode.replaceChild(newRotateBtn, rotateBtn);
    newRotateBtn.addEventListener('click', () => callbacks.onRotate(furn));
  },

  /**
   * Update the floor area info panel.
   * @param {Room} room
   * @param {Furniture[]} furnitureList
   */
  updateFloorInfo(room, furnitureList) {
    const totalArea = room.areaM2;
    const usedArea = furnitureList.reduce((sum, f) => sum + f.area, 0);
    const freeArea = Math.max(0, totalArea - usedArea);
    const usedPercent = totalArea > 0 ? (usedArea / totalArea * 100) : 0;

    const el = document.getElementById('floor-info');
    if (el) {
      el.innerHTML = `
        <div class="floor-stat">
          <span class="floor-label">Total</span>
          <span class="floor-value">${totalArea.toFixed(1)} m²</span>
        </div>
        <div class="floor-stat">
          <span class="floor-label">Used</span>
          <span class="floor-value">${usedArea.toFixed(1)} m²</span>
        </div>
        <div class="floor-stat">
          <span class="floor-label">Free</span>
          <span class="floor-value accent">${freeArea.toFixed(1)} m²</span>
        </div>
        <div class="floor-bar">
          <div class="floor-bar-fill" style="width:${Math.min(100, usedPercent)}%"></div>
        </div>
        <div class="floor-percent">${usedPercent.toFixed(0)}% occupied</div>
      `;
    }
  },

  /**
   * Populate saved layouts list in the modal.
   * @param {Array} layouts — [{ name, timestamp }]
   * @param {object} callbacks — { onLoad, onDelete }
   */
  updateSavedLayouts(layouts, callbacks) {
    const list = document.getElementById('saved-layouts-list');
    if (!list) return;

    if (layouts.length === 0) {
      list.innerHTML = '<div class="empty-state">No saved layouts yet</div>';
      return;
    }

    list.innerHTML = '';
    layouts.sort((a, b) => b.timestamp - a.timestamp);

    layouts.forEach(l => {
      const item = document.createElement('div');
      item.className = 'saved-layout-item';
      const date = new Date(l.timestamp).toLocaleDateString('id-ID', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      item.innerHTML = `
        <div class="saved-layout-info">
          <span class="saved-layout-name">${l.name}</span>
          <span class="saved-layout-date">${date}</span>
        </div>
        <div class="saved-layout-actions">
          <button class="btn-sm btn-load" title="Load">${Icons.get('folder-open', 14)}</button>
          <button class="btn-sm btn-del" title="Delete">${Icons.get('trash', 14)}</button>
        </div>
      `;
      item.querySelector('.btn-load').addEventListener('click', () => callbacks.onLoad(l.name));
      item.querySelector('.btn-del').addEventListener('click', () => callbacks.onDelete(l.name));
      list.appendChild(item);
    });
  }
};
