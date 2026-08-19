/**
 * simulatedannealing.js — Simulated Annealing Refinement Stage
 * Second-stage optimization that refines the initial layout from AutoArrange.arrange()
 * using energy minimization over hard constraints and user-defined soft relations.
 * Runs inside a Web Worker to ensure 60fps UI responsiveness.
 */

const SimulatedAnnealing = {
  /**
   * Refine a room layout using Simulated Annealing.
   * @param {Furniture[]} furnitureList — initial state (e.g. from AutoArrange.arrange())
   * @param {Room} room
   * @param {object} [options]
   * @param {number} [options.initialTemp=1000]
   * @param {number} [options.coolingRate=0.995]
   * @param {number} [options.minTemp=1]
   * @param {number} [options.maxIterations=5000]
   * @param {number} [options.timeBudgetMs=3500]
   * @returns {Promise<{ furnitureList: Array<{id, x, y, rotation}>, finalCost: number, comfortScore: number, violations: object }>}
   */
  refine(furnitureList, room, options = {}) {
    return new Promise((resolve) => {
      const opts = {
        initialTemp: 1000,
        coolingRate: 0.995,
        minTemp: 1,
        maxIterations: 5000,
        timeBudgetMs: 3500,
        ...options
      };

      const serializedFurniture = furnitureList.map(f => ({
        id: f.id,
        name: f.name,
        width: f.width,
        height: f.height,
        x: f.x,
        y: f.y,
        rotation: f.rotation,
        category: f.category ? { id: f.category.id, label: f.category.label } : null,
        icon: f.icon
      }));

      const serializedRoom = {
        width: room.width,
        height: room.height,
        unit: room.unit,
        widthM: room.widthM,
        heightM: room.heightM,
        doors: room.doors || [],
        windows: room.windows || [],
        constraints: {
          keepEmptyZones: room.constraints ? room.constraints.keepEmptyZones : [],
          relations: room.constraints ? room.constraints.relations : []
        }
      };

      // Attempt using Web Worker
      if (typeof Worker !== 'undefined') {
        try {
          const worker = new Worker('js/workers/sa-worker.js');

          const timer = setTimeout(() => {
            worker.terminate();
            // Fallback to synchronous execution on timeout
            resolve(this._runSync(serializedFurniture, serializedRoom, opts));
          }, opts.timeBudgetMs + 1000);

          worker.onmessage = (e) => {
            clearTimeout(timer);
            worker.terminate();
            resolve(e.data);
          };

          worker.onerror = (err) => {
            console.warn('Worker error, running SA synchronously:', err);
            clearTimeout(timer);
            worker.terminate();
            resolve(this._runSync(serializedFurniture, serializedRoom, opts));
          };

          worker.postMessage({
            furnitureList: serializedFurniture,
            room: serializedRoom,
            options: opts
          });
          return;
        } catch (e) {
          console.warn('Could not initialize Worker, using synchronous fallback:', e);
        }
      }

      // Synchronous fallback
      resolve(this._runSync(serializedFurniture, serializedRoom, opts));
    });
  },

  /**
   * In-thread fallback implementation of Simulated Annealing
   */
  _runSync(furnitureList, room, options) {
    if (!furnitureList || furnitureList.length === 0) {
      return {
        success: true,
        furnitureList: [],
        finalCost: 0,
        comfortScore: 100,
        violations: { overlaps: 0, boundary: 0, emptyZones: 0, doorsWindows: 0, details: [] }
      };
    }

    const startTime = performance.now();
    const initialTemp = options.initialTemp || 1000;
    const coolingRate = options.coolingRate || 0.995;
    const minTemp = options.minTemp || 1;
    const maxIterations = options.maxIterations || 5000;
    const timeBudgetMs = options.timeBudgetMs || 3500;

    const rw = room.widthM !== undefined ? room.widthM : room.width;
    const rh = room.heightM !== undefined ? room.heightM : room.height;

    const cloneState = (list) => list.map(f => ({ ...f }));

    let current = cloneState(furnitureList);
    let currentCost = CostFunction.calculate(current, room);

    let best = cloneState(current);
    let bestCost = currentCost;

    let temp = initialTemp;
    const n = current.length;

    for (let iter = 0; iter < maxIterations && temp > minTemp; iter++) {
      if (iter % 50 === 0 && (performance.now() - startTime) >= timeBudgetMs) {
        break;
      }

      const candidate = cloneState(current);
      const itemIdx = Math.floor(Math.random() * n);
      const item = candidate[itemIdx];

      const moveType = Math.random();

      if (moveType < 0.60 || n === 1) {
        // Shift position
        const step = 0.05 + Math.random() * 0.3;
        const angle = Math.random() * Math.PI * 2;
        item.x += Math.cos(angle) * step;
        item.y += Math.sin(angle) * step;

        const bounds = CostFunction.getBounds(item);
        const hw = bounds.width / 2;
        const hh = bounds.height / 2;
        item.x = Math.max(hw, Math.min(rw - hw, item.x));
        item.y = Math.max(hh, Math.min(rh - hh, item.y));
      } else if (moveType < 0.85) {
        // Rotate
        const rotDir = Math.random() < 0.5 ? 90 : -90;
        item.rotation = ((item.rotation + rotDir) % 360 + 360) % 360;

        const bounds = CostFunction.getBounds(item);
        const hw = bounds.width / 2;
        const hh = bounds.height / 2;
        item.x = Math.max(hw, Math.min(rw - hw, item.x));
        item.y = Math.max(hh, Math.min(rh - hh, item.y));
      } else {
        // Swap
        let otherIdx = Math.floor(Math.random() * n);
        if (otherIdx === itemIdx) otherIdx = (itemIdx + 1) % n;
        const other = candidate[otherIdx];

        const tempX = item.x, tempY = item.y, tempRot = item.rotation;
        item.x = other.x; item.y = other.y; item.rotation = other.rotation;
        other.x = tempX; other.y = tempY; other.rotation = tempRot;

        [item, other].forEach(target => {
          const bounds = CostFunction.getBounds(target);
          const hw = bounds.width / 2;
          const hh = bounds.height / 2;
          target.x = Math.max(hw, Math.min(rw - hw, target.x));
          target.y = Math.max(hh, Math.min(rh - hh, target.y));
        });
      }

      const candidateCost = CostFunction.calculate(candidate, room);
      const delta = candidateCost - currentCost;

      if (delta < 0 || Math.exp(-delta / temp) > Math.random()) {
        current = candidate;
        currentCost = candidateCost;

        if (currentCost < bestCost) {
          best = cloneState(current);
          bestCost = currentCost;
        }
      }

      temp *= coolingRate;
    }

    const violations = CostFunction.checkViolations(best, room);
    const relations = (room.constraints && room.constraints.relations) ? room.constraints.relations : [];
    const comfortScore = CostFunction.computeComfortScore(bestCost, violations, relations);

    return {
      success: true,
      furnitureList: best,
      finalCost: bestCost,
      comfortScore,
      violations
    };
  }
};
