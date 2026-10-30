import {
  GRID,
  GRID_CELLS,
  INITIAL_OFFSET,
  PARKING_PINS,
  countVisiblePins,
  moveGridViewport,
  queryGridCache,
} from '../../src/pages/LandingPage/utils/gridCacheSimulation';

describe('칸 단위 캐시 시뮬레이션', () => {
  it('초기 화면과 겹치는 30칸을 가져오고 이번 조회에서는 미스로 유지한다', () => {
    const result = queryGridCache(INITIAL_OFFSET, new Set());

    expect(result.hits.size).toBe(0);
    expect(result.misses.size).toBe(30);
    expect(result.cache).toEqual(result.misses);
    expect(result.misses).toContain('1,0');
    expect(result.misses).toContain('5,5');
  });

  it('오른쪽 한 칸 이동 시 겹치는 24칸을 재사용하고 새 6칸만 가져온다', () => {
    const initial = queryGridCache(INITIAL_OFFSET, new Set());
    const moved = moveGridViewport(INITIAL_OFFSET, 'right');
    const result = queryGridCache(moved, initial.cache);

    expect(moved).toEqual({ ox: 120, oy: 50 });
    expect(result.hits.size).toBe(24);
    expect(result.misses.size).toBe(6);
    expect(result.cache.size).toBe(36);
    expect(result.misses).toEqual(new Set(['6,0', '6,1', '6,2', '6,3', '6,4', '6,5']));
  });

  it('처음 위치로 돌아오면 저장된 30칸을 모두 재사용한다', () => {
    const initial = queryGridCache(INITIAL_OFFSET, new Set());
    const moved = queryGridCache(moveGridViewport(INITIAL_OFFSET, 'right'), initial.cache);
    const revisited = queryGridCache(INITIAL_OFFSET, moved.cache);

    expect(revisited.hits.size).toBe(30);
    expect(revisited.misses.size).toBe(0);
    expect(revisited.cache.size).toBe(36);
  });

  it('캐시를 비운 뒤 현재 위치를 조회하면 현재 화면의 모든 칸을 다시 저장한다', () => {
    const offset = moveGridViewport(INITIAL_OFFSET, 'right');
    const result = queryGridCache(offset, new Set());

    expect(result.hits.size).toBe(0);
    expect(result.misses.size).toBe(30);
    expect(result.cache.size).toBe(30);
    expect(offset).toEqual({ ox: 120, oy: 50 });
  });

  it('이전 캐시를 수정하지 않고 화면 밖 칸은 강조 결과에서 제외한다', () => {
    const cache = new Set(['0,0', '1,0']);
    const result = queryGridCache(INITIAL_OFFSET, cache);

    expect(cache).toEqual(new Set(['0,0', '1,0']));
    expect(result.cache).toContain('0,0');
    expect(result.hits).toEqual(new Set(['1,0']));
    expect(result.misses).not.toContain('0,0');
  });

  it('경계에 닿기만 하는 칸은 조회하지 않고 면적이 겹치는 칸만 조회한다', () => {
    const result = queryGridCache({ ox: 32, oy: 40 }, new Set());

    // 오른쪽 x=300, 아래쪽 y=300은 각각 F열과 6행의 시작 경계다.
    expect(result.misses.size).toBe(25);
    expect(result.misses).toContain('4,4');
    expect(result.misses).not.toContain('5,0');
    expect(result.misses).not.toContain('0,5');

    const aligned = queryGridCache({ ox: 60, oy: 60 }, new Set());
    expect(aligned.misses).not.toContain('0,1');
    expect(aligned.misses).not.toContain('1,0');
    expect(aligned.misses).toContain('1,1');
  });

  it('부분적으로 보이는 끝 칸도 조회하고 이미 저장한 칸은 다음 조회부터 적중한다', () => {
    const initial = queryGridCache(INITIAL_OFFSET, new Set());
    const result = queryGridCache(INITIAL_OFFSET, initial.cache);

    expect(result.hits).toContain('5,5');
    expect(result.hits.size).toBe(30);
    expect(result.misses.size).toBe(0);
  });
});

describe('지도 이동 경계', () => {
  it.each([
    ['left', { ox: 0, oy: 50 }],
    ['up', { ox: 60, oy: 0 }],
    ['down', { ox: 60, oy: 110 }],
    ['right', { ox: 120, oy: 50 }],
  ] as const)('%s 방향으로 한 칸 이동하며 지도 경계에서 제한한다', (direction, expected) => {
    expect(moveGridViewport(INITIAL_OFFSET, direction)).toEqual(expected);
  });

  it.each([
    ['left', { ox: 0, oy: 50 }],
    ['up', { ox: 60, oy: 0 }],
    ['down', { ox: 60, oy: 160 }],
    ['right', { ox: 272, oy: 50 }],
  ] as const)('%s 방향으로 반복 이동해도 지도 밖으로 나가지 않는다', (direction, expected) => {
    let offset = { ...INITIAL_OFFSET };
    for (let step = 0; step < 20; step += 1) {
      offset = moveGridViewport(offset, direction);
    }

    expect(offset).toEqual(expected);
    expect(moveGridViewport(offset, direction)).toEqual(expected);
    expect(INITIAL_OFFSET).toEqual({ ox: 60, oy: 50 });
  });
});

describe('격자와 고정 주차장 핀', () => {
  it('A1부터 I7까지 서로 다른 63개 캐시 키를 만든다', () => {
    expect(GRID_CELLS).toHaveLength(63);
    expect(GRID_CELLS[0]).toEqual({ key: '0,0', column: 0, row: 0, label: 'A1' });
    expect(GRID_CELLS.at(-1)).toEqual({ key: '8,6', column: 8, row: 6, label: 'I7' });
    expect(new Set(GRID_CELLS.map(({ key }) => key)).size).toBe(63);
  });

  it('고정된 시드로 46개 핀을 지도 내부에 생성한다', () => {
    expect(PARKING_PINS).toHaveLength(46);
    expect(PARKING_PINS.slice(0, 3)).toEqual([
      { x: 177, y: 31 },
      { x: 55, y: 305 },
      { x: 360, y: 259 },
    ]);
    for (const { x, y } of PARKING_PINS) {
      expect(x).toBeGreaterThanOrEqual(10);
      expect(x).toBeLessThanOrEqual(GRID.width - 10);
      expect(y).toBeGreaterThanOrEqual(10);
      expect(y).toBeLessThanOrEqual(GRID.height - 10);
    }
  });

  it('중심점이 화면 안에 있는 핀만 세며 오른쪽과 아래 경계는 제외한다', () => {
    expect(
      countVisiblePins(INITIAL_OFFSET, [
        { x: 60, y: 50 },
        { x: 327, y: 309 },
        { x: 59, y: 50 },
        { x: 60, y: 49 },
        { x: 328, y: 50 },
        { x: 60, y: 310 },
      ]),
    ).toBe(2);
  });
});
