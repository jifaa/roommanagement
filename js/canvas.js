/**
 * canvas.js — Canvas Rendering Engine
 * Handles all visual rendering: grid, room, furniture, selection, snap guides.
 * Uses requestAnimationFrame for smooth updates.
 */

class CanvasRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.room = null;
    this.furnitureList = [];
    this.zoomCtrl = null;
    this.selectedFurniture = null;
    this.hoveredFurniture = null;
    this.isDragging = false;
    this.drawingZone = null;
    this._animFrame = null;
    this._needsRender = true;

    // Handle HiDPI displays
    this.dpr = window.devicePixelRatio || 1;
    this._setupResizeObserver();
  }

  /** Initialize with data */
  init(room, furnitureList, zoomCtrl) {
    this.room = room;
    this.furnitureList = furnitureList;
    this.zoomCtrl = zoomCtrl;
    this.resize();
    this.requestRender();
  }

  /** Mark canvas as needing a re-render */
  requestRender() {
    this._needsRender = true;
    if (!this._animFrame) {
      this._animFrame = requestAnimationFrame(() => this._renderLoop());
    }
  }

  /** Main render loop */
  _renderLoop() {
    this._animFrame = null;
    if (this._needsRender) {
      this._needsRender = false;
      this._render();
    }
  }

  /** Force an immediate render */
  renderNow() {
    this._needsRender = false;
    this._render();
  }

  /** Resize canvas to container */
  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width * this.dpr;
    this.canvas.height = rect.height * this.dpr;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    this.requestRender();
  }

  _setupResizeObserver() {
    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(() => {
        this.resize();
      });
      if (this.canvas.parentElement) {
        this._resizeObserver.observe(this.canvas.parentElement);
      }
    }
  }

  /** Get logical (CSS) canvas dimensions */
  get logicalWidth() { return this.canvas.width / this.dpr; }
  get logicalHeight() { return this.canvas.height / this.dpr; }

  // ─── Main Render Pipeline ──────────────────────────────

  _render() {
    const ctx = this.ctx;
    const dpr = this.dpr;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = '#080c1a';
    ctx.fillRect(0, 0, this.logicalWidth, this.logicalHeight);

    if (!this.room || !this.zoomCtrl) {
      ctx.restore();
      return;
    }

    const zoom = this.zoomCtrl;
    const ppm = zoom.ppm(this.room);

    ctx.save();
    ctx.translate(zoom.panX, zoom.panY);

    // 1. Grid
    this._drawGrid(ctx, ppm);

    // 2. Room floor & walls
    this._drawRoom(ctx, ppm);

    // 3. Doors & windows
    this._drawWallElements(ctx, ppm);

    // 4. Keep-Empty Zones
    this._drawKeepEmptyZones(ctx, ppm);

    // 5. Active Zone Drawing Preview
    this._drawDrawingZone(ctx, ppm);

    // 6. Snap guides
    this._drawSnapGuides(ctx, ppm);

    // 7. Relations (visual connection lines between related furniture)
    this._drawRelations(ctx, ppm);

    // 8. Furniture
    this._drawAllFurniture(ctx, ppm);

    // 9. Dimension labels
    this._drawDimensionLabels(ctx, ppm);

    ctx.restore();

    // 10. Overlay info (zoom level)
    this._drawOverlay(ctx);

    ctx.restore();
  }

  // ─── Grid ─────────────────────────────────────────────

  _drawGrid(ctx, ppm) {
    const w = this.room.widthM * ppm;
    const h = this.room.heightM * ppm;

    // Minor grid (0.1m)
    const minorSpacing = 0.1 * ppm;
    if (minorSpacing > 4) { // Only draw if spacing > 4px
      ctx.strokeStyle = 'rgba(255,255,255,0.03)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (let x = 0; x <= w + 0.5; x += minorSpacing) {
        ctx.moveTo(Math.round(x) + 0.5, 0);
        ctx.lineTo(Math.round(x) + 0.5, h);
      }
      for (let y = 0; y <= h + 0.5; y += minorSpacing) {
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(w, Math.round(y) + 0.5);
      }
      ctx.stroke();
    }

    // Major grid (0.5m)
    const majorSpacing = 0.5 * ppm;
    if (majorSpacing > 8) {
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= w + 0.5; x += majorSpacing) {
        ctx.moveTo(Math.round(x) + 0.5, 0);
        ctx.lineTo(Math.round(x) + 0.5, h);
      }
      for (let y = 0; y <= h + 0.5; y += majorSpacing) {
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(w, Math.round(y) + 0.5);
      }
      ctx.stroke();
    }

    // 1m grid lines
    const meterSpacing = 1.0 * ppm;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= w + 0.5; x += meterSpacing) {
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, h);
    }
    for (let y = 0; y <= h + 0.5; y += meterSpacing) {
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(w, Math.round(y) + 0.5);
    }
    ctx.stroke();
  }

  // ─── Room ─────────────────────────────────────────────

  _drawRoom(ctx, ppm) {
    const w = this.room.widthM * ppm;
    const h = this.room.heightM * ppm;

    // Floor fill
    ctx.fillStyle = 'rgba(255,255,255,0.02)';
    ctx.fillRect(0, 0, w, h);

    // Room shadow
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Walls — thick outline
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 5;
    ctx.strokeRect(0, 0, w, h);

    ctx.shadowColor = 'transparent';

    // Inner wall line for thickness effect
    ctx.strokeStyle = 'rgba(203,213,225,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(3, 3, w - 6, h - 6);
  }

  // ─── Wall Elements (Doors & Windows) ─────────────────

  _drawWallElements(ctx, ppm) {
    const rw = this.room.widthM * ppm;
    const rh = this.room.heightM * ppm;

    const drawElement = (el) => {
      const pos = el.position * ppm;
      const elW = el.width * ppm;

      ctx.save();

      if (el.type === 'door') {
        // Clear wall segment
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = '#000';
        switch (el.wall) {
          case WALL.TOP:    ctx.fillRect(pos, -4, elW, 10); break;
          case WALL.BOTTOM: ctx.fillRect(pos, rh - 6, elW, 10); break;
          case WALL.LEFT:   ctx.fillRect(-4, pos, 10, elW); break;
          case WALL.RIGHT:  ctx.fillRect(rw - 6, pos, 10, elW); break;
        }
        ctx.globalCompositeOperation = 'source-over';

        // Door swing arc
        ctx.strokeStyle = '#60a5fa';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        switch (el.wall) {
          case WALL.TOP:
            ctx.arc(pos, 0, elW, 0, Math.PI / 2);
            break;
          case WALL.BOTTOM:
            ctx.arc(pos + elW, rh, elW, Math.PI, Math.PI * 1.5);
            break;
          case WALL.LEFT:
            ctx.arc(0, pos + elW, elW, -Math.PI / 2, 0);
            break;
          case WALL.RIGHT:
            ctx.arc(rw, pos, elW, Math.PI / 2, Math.PI);
            break;
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Door line
        ctx.strokeStyle = '#60a5fa';
        ctx.lineWidth = 3;
        ctx.beginPath();
        switch (el.wall) {
          case WALL.TOP:    ctx.moveTo(pos, 0); ctx.lineTo(pos + elW, 0); break;
          case WALL.BOTTOM: ctx.moveTo(pos, rh); ctx.lineTo(pos + elW, rh); break;
          case WALL.LEFT:   ctx.moveTo(0, pos); ctx.lineTo(0, pos + elW); break;
          case WALL.RIGHT:  ctx.moveTo(rw, pos); ctx.lineTo(rw, pos + elW); break;
        }
        ctx.stroke();

      } else {
        // Window — clear wall + double line
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = '#000';
        switch (el.wall) {
          case WALL.TOP:    ctx.fillRect(pos, -4, elW, 10); break;
          case WALL.BOTTOM: ctx.fillRect(pos, rh - 6, elW, 10); break;
          case WALL.LEFT:   ctx.fillRect(-4, pos, 10, elW); break;
          case WALL.RIGHT:  ctx.fillRect(rw - 6, pos, 10, elW); break;
        }
        ctx.globalCompositeOperation = 'source-over';

        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        switch (el.wall) {
          case WALL.TOP:
            ctx.beginPath(); ctx.moveTo(pos, -2); ctx.lineTo(pos + elW, -2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(pos, 2); ctx.lineTo(pos + elW, 2); ctx.stroke();
            // Glass fill
            ctx.fillStyle = 'rgba(56,189,248,0.1)';
            ctx.fillRect(pos, -2, elW, 4);
            break;
          case WALL.BOTTOM:
            ctx.beginPath(); ctx.moveTo(pos, rh - 2); ctx.lineTo(pos + elW, rh - 2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(pos, rh + 2); ctx.lineTo(pos + elW, rh + 2); ctx.stroke();
            ctx.fillStyle = 'rgba(56,189,248,0.1)';
            ctx.fillRect(pos, rh - 2, elW, 4);
            break;
          case WALL.LEFT:
            ctx.beginPath(); ctx.moveTo(-2, pos); ctx.lineTo(-2, pos + elW); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(2, pos); ctx.lineTo(2, pos + elW); ctx.stroke();
            ctx.fillStyle = 'rgba(56,189,248,0.1)';
            ctx.fillRect(-2, pos, 4, elW);
            break;
          case WALL.RIGHT:
            ctx.beginPath(); ctx.moveTo(rw - 2, pos); ctx.lineTo(rw - 2, pos + elW); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(rw + 2, pos); ctx.lineTo(rw + 2, pos + elW); ctx.stroke();
            ctx.fillStyle = 'rgba(56,189,248,0.1)';
            ctx.fillRect(rw - 2, pos, 4, elW);
            break;
        }
      }
      ctx.restore();
    };

    this.room.doors.forEach(drawElement);
    this.room.windows.forEach(drawElement);
  }

  // ─── Snap Guides ──────────────────────────────────────

  _drawSnapGuides(ctx, ppm) {
    if (!Snap.guides.length) return;

    ctx.save();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.globalAlpha = 0.6;

    Snap.guides.forEach(g => {
      ctx.beginPath();
      if (g.type === 'vertical') {
        ctx.moveTo(g.x * ppm, g.y1 * ppm);
        ctx.lineTo(g.x * ppm, g.y2 * ppm);
      } else {
        ctx.moveTo(g.x1 * ppm, g.y * ppm);
        ctx.lineTo(g.x2 * ppm, g.y * ppm);
      }
      ctx.stroke();
    });

    ctx.restore();
  }

  // ─── Furniture ────────────────────────────────────────

  _drawAllFurniture(ctx, ppm) {
    // Draw non-selected first, then selected on top
    const sorted = [...this.furnitureList].sort((a, b) => {
      if (a.isSelected) return 1;
      if (b.isSelected) return -1;
      return 0;
    });

    sorted.forEach(f => this._drawFurnitureItem(ctx, f, ppm));
  }

  _drawFurnitureItem(ctx, furn, ppm) {
    const x = furn.x * ppm;
    const y = furn.y * ppm;
    const w = furn.width * ppm;
    const h = furn.height * ppm;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((furn.rotation * Math.PI) / 180);

    const isActive = furn.isSelected || furn.isHovered;
    const isColliding = furn.isColliding;

    // Shadow
    if (isActive) {
      ctx.shadowColor = furn.isSelected ? furn.color : 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = furn.isSelected ? 16 : 10;
    } else {
      ctx.shadowColor = 'rgba(0,0,0,0.3)';
      ctx.shadowBlur = 6;
    }
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;

    // Collision overlay
    const baseColor = isColliding ? '#ef4444' : furn.color;
    const fillAlpha = isColliding ? '55' : (isActive ? '45' : '30');

    // Fill
    ctx.fillStyle = baseColor + fillAlpha;
    this._roundRect(ctx, -w / 2, -h / 2, w, h, 5);
    ctx.fill();

    ctx.shadowColor = 'transparent';

    // Border
    ctx.strokeStyle = baseColor;
    ctx.lineWidth = isActive ? 2.5 : 1.5;
    if (isColliding) {
      ctx.setLineDash([6, 3]);
    }
    this._roundRect(ctx, -w / 2, -h / 2, w, h, 5);
    ctx.stroke();
    ctx.setLineDash([]);

    // Direction indicator (small notch on "front" side)
    ctx.fillStyle = baseColor;
    ctx.fillRect(-6, -h / 2, 12, 3);

    // Label text
    const maxFontSize = 13;
    const fontSize = Math.min(maxFontSize, Math.min(w * 0.3, h * 0.35));
    if (fontSize >= 5) {
      ctx.fillStyle = '#f1f5f9';
      ctx.font = `600 ${fontSize}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Truncate name if too long
      let name = furn.name;
      const maxLabelWidth = w - 10;
      while (ctx.measureText(name).width > maxLabelWidth && name.length > 3) {
        name = name.slice(0, -1);
      }
      if (name !== furn.name) name += '…';

      ctx.fillText(name, 0, -fontSize * 0.4);

      // Size sublabel
      const subSize = fontSize * 0.7;
      ctx.fillStyle = 'rgba(241,245,249,0.5)';
      ctx.font = `${subSize}px "JetBrains Mono", monospace`;
      ctx.fillText(`${furn.width}×${furn.height}`, 0, fontSize * 0.5);
    }

    ctx.restore();

    // Selection handles
    if (furn.isSelected) {
      this._drawSelectionHandles(ctx, furn, ppm);
    }
  }

  _drawSelectionHandles(ctx, furn, ppm) {
    const b = furn.bounds;
    const corners = [
      { x: b.left * ppm, y: b.top * ppm },
      { x: b.right * ppm, y: b.top * ppm },
      { x: b.right * ppm, y: b.bottom * ppm },
      { x: b.left * ppm, y: b.bottom * ppm },
    ];

    // Corner handles
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = furn.color;
    ctx.lineWidth = 2;
    corners.forEach(c => {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    // Rotate handle (top-center, above the furniture)
    const topCenterX = (b.left + b.right) / 2 * ppm;
    const topCenterY = b.top * ppm - 25;

    ctx.strokeStyle = furn.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(topCenterX, b.top * ppm);
    ctx.lineTo(topCenterX, topCenterY);
    ctx.stroke();

    ctx.fillStyle = furn.color;
    ctx.beginPath();
    ctx.arc(topCenterX, topCenterY, 7, 0, Math.PI * 2);
    ctx.fill();

    // Rotate icon (↻)
    ctx.fillStyle = '#fff';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('↻', topCenterX, topCenterY);
  }

  // ─── Dimension Labels ─────────────────────────────────

  _drawDimensionLabels(ctx, ppm) {
    const w = this.room.widthM * ppm;
    const h = this.room.heightM * ppm;

    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Top dimension line
    const topY = -20;
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1;
    // Line
    ctx.beginPath(); ctx.moveTo(0, topY); ctx.lineTo(w, topY); ctx.stroke();
    // End ticks
    ctx.beginPath(); ctx.moveTo(0, topY - 5); ctx.lineTo(0, topY + 5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w, topY - 5); ctx.lineTo(w, topY + 5); ctx.stroke();
    // Label with background
    const topLabel = this.room.formatMeters(this.room.widthM);
    const topLabelW = ctx.measureText(topLabel).width + 10;
    ctx.fillStyle = '#080c1a';
    ctx.fillRect(w / 2 - topLabelW / 2, topY - 8, topLabelW, 16);
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(topLabel, w / 2, topY);

    // Left dimension line
    const leftX = -20;
    ctx.beginPath(); ctx.moveTo(leftX, 0); ctx.lineTo(leftX, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(leftX - 5, 0); ctx.lineTo(leftX + 5, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(leftX - 5, h); ctx.lineTo(leftX + 5, h); ctx.stroke();

    ctx.save();
    ctx.translate(leftX, h / 2);
    ctx.rotate(-Math.PI / 2);
    const leftLabel = this.room.formatMeters(this.room.heightM);
    const leftLabelW = ctx.measureText(leftLabel).width + 10;
    ctx.fillStyle = '#080c1a';
    ctx.fillRect(-leftLabelW / 2, -8, leftLabelW, 16);
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(leftLabel, 0, 0);
    ctx.restore();
  }

  // ─── Overlay ──────────────────────────────────────────

  _drawOverlay(ctx) {
    // Zoom indicator in bottom-right
    if (this.zoomCtrl) {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(this.zoomCtrl.zoomPercent, this.logicalWidth - 12, this.logicalHeight - 12);
    }
  }

  // ─── Keep-Empty Zones ─────────────────────────────────

  _drawKeepEmptyZones(ctx, ppm) {
    if (!this.room || !this.room.constraints || !this.room.constraints.keepEmptyZones) return;

    const zones = this.room.constraints.keepEmptyZones;
    zones.forEach(z => {
      this._drawSingleZone(ctx, z, ppm, false);
    });
  }

  _drawDrawingZone(ctx, ppm) {
    if (this.drawingZone) {
      this._drawSingleZone(ctx, this.drawingZone, ppm, true);
    }
  }

  _drawSingleZone(ctx, z, ppm, isPreview = false) {
    const left = Math.min(z.left, z.right) * ppm;
    const top = Math.min(z.top, z.bottom) * ppm;
    const width = Math.abs(z.right - z.left) * ppm;
    const height = Math.abs(z.bottom - z.top) * ppm;

    if (width <= 0 || height <= 0) return;

    ctx.save();

    // 1. Semi-transparent background fill
    ctx.fillStyle = isPreview ? 'rgba(245, 158, 11, 0.18)' : 'rgba(239, 68, 68, 0.12)';
    ctx.fillRect(left, top, width, height);

    // 2. Diagonal hatch pattern
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, width, height);
    ctx.clip();

    ctx.strokeStyle = isPreview ? 'rgba(245, 158, 11, 0.35)' : 'rgba(239, 68, 68, 0.25)';
    ctx.lineWidth = 1.5;
    const spacing = 12;
    const maxDim = width + height;
    for (let offset = -height; offset <= width; offset += spacing) {
      ctx.beginPath();
      ctx.moveTo(left + offset, top);
      ctx.lineTo(left + offset + height, top + height);
      ctx.stroke();
    }
    ctx.restore();

    // 3. Dashed border
    ctx.strokeStyle = isPreview ? '#f59e0b' : '#ef4444';
    ctx.lineWidth = isPreview ? 2 : 1.5;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(left, top, width, height);
    ctx.setLineDash([]);

    // 4. Badge label
    const labelText = isPreview ? '➕ Zona Baru' : (z.name || 'Zona Kosong');
    ctx.font = '500 11px Inter, sans-serif';
    const textWidth = ctx.measureText(labelText).width;
    const badgeW = textWidth + 14;
    const badgeH = 18;

    if (width > badgeW + 8 && height > badgeH + 8) {
      ctx.fillStyle = isPreview ? 'rgba(245, 158, 11, 0.85)' : 'rgba(239, 68, 68, 0.85)';
      this._roundRect(ctx, left + 4, top + 4, badgeW, badgeH, 4);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(labelText, left + 10, top + 4 + badgeH / 2);
    }

    ctx.restore();
  }

  // ─── Relations Rendering ──────────────────────────────

  _drawRelations(ctx, ppm) {
    if (!this.room || !this.room.constraints || !this.room.constraints.relations) return;
    const relations = this.room.constraints.relations;
    if (relations.length === 0) return;

    const map = {};
    this.furnitureList.forEach(f => { map[f.id] = f; });

    relations.forEach(r => {
      const a = map[r.furnitureIdA];
      const b = map[r.furnitureIdB];
      if (!a || !b) return;

      const ax = a.x * ppm;
      const ay = a.y * ppm;
      const bx = b.x * ppm;
      const by = b.y * ppm;

      ctx.save();

      // Line style based on relation type
      let color = 'rgba(34, 211, 238, 0.4)';
      let label = 'Dekat';
      const type = r.type || r.relationType || 'near';

      if (type === 'far') {
        color = 'rgba(244, 63, 94, 0.45)';
        label = 'Jauh';
      } else if (type === 'facing') {
        color = 'rgba(168, 85, 247, 0.45)';
        label = 'Menghadap';
      }

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);

      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.setLineDash([]);

      // Small badge at midpoint
      const midX = (ax + bx) / 2;
      const midY = (ay + by) / 2;
      const badgeText = `${label} (${r.weight || 5})`;

      ctx.font = '10px "JetBrains Mono", monospace';
      const tw = ctx.measureText(badgeText).width;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
      ctx.fillRect(midX - tw / 2 - 4, midY - 8, tw + 8, 16);
      ctx.strokeStyle = color;
      ctx.strokeRect(midX - tw / 2 - 4, midY - 8, tw + 8, 16);

      ctx.fillStyle = '#cbd5e1';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, midX, midY);

      ctx.restore();
    });
  }

  // ─── Helpers ──────────────────────────────────────────

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

