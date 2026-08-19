// Load CostFunction via importScripts if available
try {
  importScripts('../costfunction.js');
} catch (e) {
  try {
    importScripts('costfunction.js');
  } catch (err) {
    console.warn('Worker importScripts fallback:', err);
  }
}

self.onmessage = function(e) {
  const { furnitureList, room, options = {} } = e.data;

  const result = runSimulatedAnnealing(furnitureList, room, options);
  self.postMessage(result);
};

function runSimulatedAnnealing(furnitureList, room, options = {}) {
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
  const timeBudgetMs = options.timeBudgetMs || 4000;

  const rw = room.widthM !== undefined ? room.widthM : (room.unit === 'cm' ? room.width / 100 : room.width);
  const rh = room.heightM !== undefined ? room.heightM : (room.unit === 'cm' ? room.height / 100 : room.height);

  // Deep clone furniture list
  const cloneState = (list) => list.map(f => ({
    id: f.id,
    name: f.name,
    width: f.width,
    height: f.height,
    x: f.x,
    y: f.y,
    rotation: f.rotation,
    category: f.category,
    icon: f.icon
  }));

  let current = cloneState(furnitureList);
  let currentCost = CostFunction.calculate(current, room);

  let best = cloneState(current);
  let bestCost = currentCost;

  let temp = initialTemp;
  const n = current.length;

  for (let iter = 0; iter < maxIterations && temp > minTemp; iter++) {
    // Time budget check every 50 iterations
    if (iter % 50 === 0 && (performance.now() - startTime) >= timeBudgetMs) {
      break;
    }

    // Generate Neighbor
    const candidate = cloneState(current);
    const itemIdx = Math.floor(Math.random() * n);
    const item = candidate[itemIdx];

    const moveType = Math.random();

    if (moveType < 0.60 || n === 1) {
      // 1. Small position shift (±0.1m - 0.35m)
      const step = 0.05 + Math.random() * 0.3;
      const angle = Math.random() * Math.PI * 2;
      item.x += Math.cos(angle) * step;
      item.y += Math.sin(angle) * step;

      // Clamp to room
      const bounds = CostFunction.getBounds(item);
      const hw = bounds.width / 2;
      const hh = bounds.height / 2;
      item.x = Math.max(hw, Math.min(rw - hw, item.x));
      item.y = Math.max(hh, Math.min(rh - hh, item.y));

    } else if (moveType < 0.85) {
      // 2. Rotate ±90 degrees
      const rotDir = Math.random() < 0.5 ? 90 : -90;
      item.rotation = ((item.rotation + rotDir) % 360 + 360) % 360;

      // Re-clamp after rotation
      const bounds = CostFunction.getBounds(item);
      const hw = bounds.width / 2;
      const hh = bounds.height / 2;
      item.x = Math.max(hw, Math.min(rw - hw, item.x));
      item.y = Math.max(hh, Math.min(rh - hh, item.y));

    } else {
      // 3. Swap positions with another piece
      let otherIdx = Math.floor(Math.random() * n);
      if (otherIdx === itemIdx) otherIdx = (itemIdx + 1) % n;
      const other = candidate[otherIdx];

      const tempX = item.x, tempY = item.y, tempRot = item.rotation;
      item.x = other.x; item.y = other.y; item.rotation = other.rotation;
      other.x = tempX; other.y = tempY; other.rotation = tempRot;

      // Clamp both
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

    // Metropolis acceptance criterion
    if (delta < 0 || Math.exp(-delta / temp) > Math.random()) {
      current = candidate;
      currentCost = candidateCost;

      if (currentCost < bestCost) {
        best = cloneState(current);
        bestCost = currentCost;
      }
    }

    // Cooling
    temp *= coolingRate;
  }

  // Diagnostic check of best configuration
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
