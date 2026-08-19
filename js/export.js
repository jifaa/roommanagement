/**
 * export.js — PNG Export
 * Renders a clean version of the canvas and exports as PNG image.
 */

const ExportPNG = {
  /**
   * Export the current room layout as a PNG image.
   * Renders a clean version without selection handles or hover effects.
   * @param {Room} room
   * @param {Furniture[]} furnitureList
   * @param {string} filename
   */
  exportAsPNG(room, furnitureList, filename = 'room-layout.png') {
    // Create an offscreen canvas with a good resolution
    const padding = 80;
    const scale = 80; // high-res scale: 80px per meter
    const width = room.widthM * scale + padding * 2;
    const height = room.heightM * scale + padding * 2;

    const offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;
    const ctx = offscreen.getContext('2d');

    // Background
    ctx.fillStyle = '#0f1729';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(padding, padding);

    // Draw grid
    this._drawGrid(ctx, room, scale);

    // Draw room outline
    this._drawRoom(ctx, room, scale);

    // Draw doors & windows
    this._drawWallElements(ctx, room, scale);

    // Draw furniture
    furnitureList.forEach(f => {
      this._drawFurniture(ctx, f, scale);
    });

    // Draw dimension labels
    this._drawDimensionLabels(ctx, room, scale);

    ctx.restore();

    // Watermark
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('Room Layout Designer', width - 12, height - 12);

    // Download
    const dataUrl = offscreen.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  },

  _drawGrid(ctx, room, scale) {
    const w = room.widthM * scale;
    const h = room.heightM * scale;

    // Minor grid (0.1m)
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 0.5;
    const minor = 0.1 * scale;
    for (let x = 0; x <= w; x += minor) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y <= h; y += minor) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Major grid (0.5m)
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    const major = 0.5 * scale;
    for (let x = 0; x <= w; x += major) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y <= h; y += major) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
  },

  _drawRoom(ctx, room, scale) {
    const w = room.widthM * scale;
    const h = room.heightM * scale;

    // Floor fill
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(0, 0, w, h);

    // Walls
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, w, h);
  },

  _drawWallElements(ctx, room, scale) {
    const drawOnWall = (element) => {
      const pos = element.position * scale;
      const elWidth = element.width * scale;
      const rw = room.widthM * scale;
      const rh = room.heightM * scale;

      ctx.save();
      if (element.type === 'door') {
        ctx.strokeStyle = '#60a5fa';
        ctx.lineWidth = 3;
        ctx.fillStyle = 'rgba(96,165,250,0.15)';
        switch (element.wall) {
          case WALL.TOP:
            ctx.clearRect(pos - 1, -3, elWidth + 2, 7);
            ctx.beginPath(); ctx.arc(pos, 0, elWidth, 0, Math.PI / 2); ctx.stroke();
            break;
          case WALL.BOTTOM:
            ctx.clearRect(pos - 1, rh - 3, elWidth + 2, 7);
            ctx.beginPath(); ctx.arc(pos, rh, elWidth, -Math.PI / 2, 0); ctx.stroke();
            break;
          case WALL.LEFT:
            ctx.clearRect(-3, pos - 1, 7, elWidth + 2);
            ctx.beginPath(); ctx.arc(0, pos, elWidth, 0, -Math.PI / 2, true); ctx.stroke();
            break;
          case WALL.RIGHT:
            ctx.clearRect(rw - 3, pos - 1, 7, elWidth + 2);
            ctx.beginPath(); ctx.arc(rw, pos, elWidth, Math.PI / 2, Math.PI); ctx.stroke();
            break;
        }
      } else {
        // Window — double line
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        switch (element.wall) {
          case WALL.TOP:
            ctx.clearRect(pos - 1, -3, elWidth + 2, 7);
            ctx.beginPath(); ctx.moveTo(pos, -3); ctx.lineTo(pos + elWidth, -3); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(pos, 3); ctx.lineTo(pos + elWidth, 3); ctx.stroke();
            break;
          case WALL.BOTTOM:
            ctx.clearRect(pos - 1, rh - 3, elWidth + 2, 7);
            ctx.beginPath(); ctx.moveTo(pos, rh - 3); ctx.lineTo(pos + elWidth, rh - 3); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(pos, rh + 3); ctx.lineTo(pos + elWidth, rh + 3); ctx.stroke();
            break;
          case WALL.LEFT:
            ctx.clearRect(-3, pos - 1, 7, elWidth + 2);
            ctx.beginPath(); ctx.moveTo(-3, pos); ctx.lineTo(-3, pos + elWidth); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(3, pos); ctx.lineTo(3, pos + elWidth); ctx.stroke();
            break;
          case WALL.RIGHT:
            ctx.clearRect(rw - 3, pos - 1, 7, elWidth + 2);
            ctx.beginPath(); ctx.moveTo(rw - 3, pos); ctx.lineTo(rw - 3, pos + elWidth); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(rw + 3, pos); ctx.lineTo(rw + 3, pos + elWidth); ctx.stroke();
            break;
        }
      }
      ctx.restore();
    };

    room.doors.forEach(drawOnWall);
    room.windows.forEach(drawOnWall);
  },

  _drawFurniture(ctx, furn, scale) {
    const x = furn.x * scale;
    const y = furn.y * scale;
    const w = furn.width * scale;
    const h = furn.height * scale;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((furn.rotation * Math.PI) / 180);

    // Shadow
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    // Fill
    const alpha = furn.isColliding ? 0.4 : 0.25;
    const color = furn.isColliding ? '#ef4444' : furn.color;
    ctx.fillStyle = color + (furn.isColliding ? '66' : '40');
    const radius = 4;
    this._roundRect(ctx, -w / 2, -h / 2, w, h, radius);
    ctx.fill();

    ctx.shadowColor = 'transparent';

    // Border
    ctx.strokeStyle = furn.isColliding ? '#ef4444' : furn.color;
    ctx.lineWidth = 2;
    this._roundRect(ctx, -w / 2, -h / 2, w, h, radius);
    ctx.stroke();

    // Label
    const fontSize = Math.min(14, Math.min(w, h) * 0.35);
    if (fontSize >= 6) {
      ctx.fillStyle = '#e2e8f0';
      ctx.font = `600 ${fontSize}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(furn.name, 0, -fontSize * 0.3);

      // Size label
      ctx.fillStyle = 'rgba(226,232,240,0.6)';
      ctx.font = `${fontSize * 0.7}px "JetBrains Mono", monospace`;
      ctx.fillText(`${furn.width}×${furn.height}m`, 0, fontSize * 0.5);
    }

    ctx.restore();
  },

  _drawDimensionLabels(ctx, room, scale) {
    const w = room.widthM * scale;
    const h = room.heightM * scale;

    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Top label
    ctx.fillText(room.formatMeters(room.widthM), w / 2, -25);
    // Draw arrows
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, -25); ctx.lineTo(w, -25); ctx.stroke();
    // Ticks
    ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(0, -20); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w, -30); ctx.lineTo(w, -20); ctx.stroke();

    // Left label
    ctx.save();
    ctx.translate(-25, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(room.formatMeters(room.heightM), 0, 0);
    ctx.restore();
    // Side line
    ctx.beginPath(); ctx.moveTo(-25, 0); ctx.lineTo(-25, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-30, 0); ctx.lineTo(-20, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-30, h); ctx.lineTo(-20, h); ctx.stroke();
  },

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
};
