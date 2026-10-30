export const GRID = {
  columns: 9,
  rows: 7,
  cellSize: 60,
  viewportWidth: 268,
  viewportHeight: 260,
  width: 540,
  height: 420,
} as const;

export const INITIAL_OFFSET = { ox: 60, oy: 50 };

export type Offset = { ox: number; oy: number };
export type Direction = 'left' | 'up' | 'down' | 'right';

export const GRID_CELLS = Array.from({ length: GRID.columns * GRID.rows }, (_, index) => {
  const column = index % GRID.columns;
  const row = Math.floor(index / GRID.columns);

  return {
    key: `${column},${row}`,
    column,
    row,
    label: `${String.fromCharCode(65 + column)}${row + 1}`,
  };
});

const createParkingPins = () => {
  let seed = 218;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };

  return Array.from({ length: 46 }, () => ({
    x: Math.round(10 + random() * (GRID.width - 20)),
    y: Math.round(10 + random() * (GRID.height - 20)),
  }));
};

export const PARKING_PINS = createParkingPins();

export const queryGridCache = ({ ox, oy }: Offset, cache: ReadonlySet<string>) => {
  const nextCache = new Set(cache);
  const hits = new Set<string>();
  const misses = new Set<string>();

  for (const { key, column, row } of GRID_CELLS) {
    const left = column * GRID.cellSize;
    const top = row * GRID.cellSize;
    if (
      left >= ox + GRID.viewportWidth ||
      left + GRID.cellSize <= ox ||
      top >= oy + GRID.viewportHeight ||
      top + GRID.cellSize <= oy
    ) {
      continue;
    }

    if (cache.has(key)) {
      hits.add(key);
    } else {
      misses.add(key);
      nextCache.add(key);
    }
  }

  return { cache: nextCache, hits, misses };
};

export const moveGridViewport = (offset: Offset, direction: Direction): Offset => {
  const deltas = {
    left: [-GRID.cellSize, 0],
    up: [0, -GRID.cellSize],
    down: [0, GRID.cellSize],
    right: [GRID.cellSize, 0],
  } as const;
  const [dx, dy] = deltas[direction];

  return {
    ox: Math.max(0, Math.min(GRID.width - GRID.viewportWidth, offset.ox + dx)),
    oy: Math.max(0, Math.min(GRID.height - GRID.viewportHeight, offset.oy + dy)),
  };
};

export const countVisiblePins = ({ ox, oy }: Offset, pins = PARKING_PINS) =>
  pins.filter(
    ({ x, y }) => x >= ox && x < ox + GRID.viewportWidth && y >= oy && y < oy + GRID.viewportHeight,
  ).length;
