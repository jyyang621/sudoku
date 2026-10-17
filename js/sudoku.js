/**
 * Dependency-free Sudoku generation and validation.
 *
 * Generation is deterministic: the same seed and difficulty always produce the
 * same puzzle, including across browsers. Keep the v1 random namespace stable so
 * previously shared puzzle links continue to work.
 */

export const DIFFICULTIES = Object.freeze([
  Object.freeze({ id: 'easy', label: '简单', clues: 42, description: '从容入门，找回数字的节奏' }),
  Object.freeze({ id: 'medium', label: '中等', clues: 35, description: '多想一步，发现新的线索' }),
  Object.freeze({ id: 'hard', label: '困难', clues: 29, description: '耐心推理，让每一步都有依据' }),
  Object.freeze({ id: 'expert', label: '专家', clues: 25, description: '更少提示，留给你更多可能' }),
]);

const ALL = 0x1ff;
const CELL_COUNT = 81;
const ROWS = Uint8Array.from({ length: CELL_COUNT }, (_, index) => Math.floor(index / 9));
const COLS = Uint8Array.from({ length: CELL_COUNT }, (_, index) => index % 9);
const BOXES = Uint8Array.from({ length: CELL_COUNT }, (_, index) =>
  Math.floor(index / 27) * 3 + Math.floor((index % 9) / 3));
const BIT_COUNTS = Uint8Array.from({ length: ALL + 1 }, (_, mask) => {
  let count = 0;
  while (mask) {
    mask &= mask - 1;
    count += 1;
  }
  return count;
});
const BIT_DIGITS = new Map(Array.from({ length: 9 }, (_, index) => [1 << index, index + 1]));

function validBoard(board) {
  return board != null && board.length === CELL_COUNT &&
    Array.from(board).every(value => Number.isInteger(value) && value >= 0 && value <= 9);
}

function createState(board) {
  if (!validBoard(board)) return null;
  const cells = Array.from(board);
  const rows = new Uint16Array(9);
  const cols = new Uint16Array(9);
  const boxes = new Uint16Array(9);
  for (let index = 0; index < CELL_COUNT; index += 1) {
    const value = cells[index];
    if (!value) continue;
    const bit = 1 << (value - 1);
    const row = ROWS[index];
    const col = COLS[index];
    const box = BOXES[index];
    if ((rows[row] | cols[col] | boxes[box]) & bit) return null;
    rows[row] |= bit;
    cols[col] |= bit;
    boxes[box] |= bit;
  }
  return { cells, rows, cols, boxes };
}

function possibleMask(state, index) {
  return ALL & ~(state.rows[ROWS[index]] | state.cols[COLS[index]] | state.boxes[BOXES[index]]);
}

function setCell(state, index, bit, value) {
  state.cells[index] = value;
  state.rows[ROWS[index]] |= bit;
  state.cols[COLS[index]] |= bit;
  state.boxes[BOXES[index]] |= bit;
}

function unsetCell(state, index, bit) {
  state.cells[index] = 0;
  state.rows[ROWS[index]] &= ~bit;
  state.cols[COLS[index]] &= ~bit;
  state.boxes[BOXES[index]] &= ~bit;
}

// Select the cell with the fewest candidates to keep uniqueness checks quick.
function nextCell(state) {
  let selected = -1;
  let selectedMask = 0;
  let lowestCount = 10;
  for (let index = 0; index < CELL_COUNT; index += 1) {
    if (state.cells[index]) continue;
    const mask = possibleMask(state, index);
    const count = BIT_COUNTS[mask];
    if (count < lowestCount) {
      selected = index;
      selectedMask = mask;
      lowestCount = count;
      if (count <= 1) break;
    }
  }
  return { index: selected, mask: selectedMask };
}

/** Return a solved copy of a board, or null when it has no valid solution. */
export function solve(board) {
  const state = createState(board);
  if (!state) return null;
  function visit() {
    const { index, mask } = nextCell(state);
    if (index === -1) return true;
    let remaining = mask;
    while (remaining) {
      const bit = remaining & -remaining;
      remaining &= ~bit;
      setCell(state, index, bit, BIT_DIGITS.get(bit));
      if (visit()) return true;
      unsetCell(state, index, bit);
    }
    return false;
  }
  return visit() ? state.cells : null;
}

/** Count solutions up to limit, without changing the supplied board. */
export function countSolutions(board, limit = 2) {
  if (!Number.isFinite(limit) || limit < 1) return 0;
  const state = createState(board);
  if (!state) return 0;
  const maximum = Math.floor(limit);
  let count = 0;
  function visit() {
    const { index, mask } = nextCell(state);
    if (index === -1) {
      count += 1;
      return;
    }
    let remaining = mask;
    while (remaining && count < maximum) {
      const bit = remaining & -remaining;
      remaining &= ~bit;
      setCell(state, index, bit, BIT_DIGITS.get(bit));
      visit();
      unsetCell(state, index, bit);
    }
  }
  visit();
  return count;
}

/** Legal digits for an empty cell; filled cells have no candidates. */
export function getCandidates(board, index) {
  if (!validBoard(board) || !Number.isInteger(index) || index < 0 || index >= CELL_COUNT || board[index]) {
    return [];
  }
  let used = 0;
  for (let other = 0; other < CELL_COUNT; other += 1) {
    if (ROWS[other] === ROWS[index] || COLS[other] === COLS[index] || BOXES[other] === BOXES[index]) {
      if (board[other]) used |= 1 << (board[other] - 1);
    }
  }
  return Array.from({ length: 9 }, (_, digit) => digit + 1)
    .filter(digit => !(used & (1 << (digit - 1))));
}

/** All cells participating in a duplicate in any row, column, or box. */
export function getConflicts(board) {
  const conflicts = new Set();
  if (board == null || board.length !== CELL_COUNT) return conflicts;
  const groups = Array.from({ length: 27 }, () => new Map());
  for (let index = 0; index < CELL_COUNT; index += 1) {
    const value = board[index];
    if (!Number.isInteger(value) || value < 0 || value > 9) {
      conflicts.add(index);
      continue;
    }
    if (!value) continue;
    for (const groupIndex of [ROWS[index], 9 + COLS[index], 18 + BOXES[index]]) {
      const group = groups[groupIndex];
      if (group.has(value)) {
        conflicts.add(group.get(value));
        conflicts.add(index);
      } else {
        group.set(value, index);
      }
    }
  }
  return conflicts;
}

/** True only for a fully filled, valid Sudoku grid. */
export function isComplete(board) {
  return Boolean(validBoard(board) && Array.from(board).every(Boolean) && createState(board));
}

function randomFor(seed) {
  // FNV-1a over UTF-16 code units, followed by a Mulberry32 stream. All arithmetic
  // uses explicitly defined 32-bit operations for portable shared puzzle seeds.
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619);
  }
  let value = hash >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let mixed = Math.imul(value ^ (value >>> 15), 1 | value);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(values, random) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const selected = Math.floor(random() * (index + 1));
    [values[index], values[selected]] = [values[selected], values[index]];
  }
  return values;
}

function randomSolution(random) {
  const state = createState(Array(CELL_COUNT).fill(0));
  function visit() {
    const { index, mask } = nextCell(state);
    if (index === -1) return true;
    const choices = [];
    let remaining = mask;
    while (remaining) {
      const bit = remaining & -remaining;
      remaining &= ~bit;
      choices.push(bit);
    }
    shuffle(choices, random);
    for (const bit of choices) {
      setCell(state, index, bit, BIT_DIGITS.get(bit));
      if (visit()) return true;
      unsetCell(state, index, bit);
    }
    return false;
  }
  visit();
  return state.cells;
}

// A fixed, uniquely solvable 17-clue grid bounds generation work for rare seeds
// where greedy removal cannot reach the requested number of clues. Sudoku
// symmetries preserve uniqueness; adding correct clues also preserves it.
const FALLBACK = (
  '000000010' +
  '400000000' +
  '020000000' +
  '000050407' +
  '008000300' +
  '001090000' +
  '300400200' +
  '050100000' +
  '000806000'
).split('').map(Number);

function fallbackPuzzle(random, clues) {
  const sourceSolution = solve(FALLBACK);
  const digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], random);
  const rows = shuffle([0, 1, 2], random).flatMap(band =>
    shuffle([0, 1, 2], random).map(row => 3 * band + row));
  const cols = shuffle([0, 1, 2], random).flatMap(stack =>
    shuffle([0, 1, 2], random).map(col => 3 * stack + col));
  const transpose = random() < 0.5;
  const puzzle = [];
  const solution = [];
  for (let row = 0; row < 9; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      const source = transpose ? cols[col] * 9 + rows[row] : rows[row] * 9 + cols[col];
      puzzle.push(FALLBACK[source] ? digits[FALLBACK[source] - 1] : 0);
      solution.push(digits[sourceSolution[source] - 1]);
    }
  }
  const empty = shuffle(Array.from({ length: CELL_COUNT }, (_, index) => index)
    .filter(index => !puzzle[index]), random);
  for (let index = 0; index < clues - 17; index += 1) {
    puzzle[empty[index]] = solution[empty[index]];
  }
  return { puzzle, solution };
}

/**
 * Create an exactly reproducible puzzle with a single solution.
 * Difficulty primarily controls clue density; it is not a human-technique grade.
 */
export function generatePuzzle(seed, difficulty = 'easy') {
  const setting = DIFFICULTIES.find(item => item.id === difficulty);
  if (!setting) throw new RangeError(`Unknown Sudoku difficulty: ${difficulty}`);
  const normalizedSeed = String(seed);
  const random = randomFor(`sudoku:v1:${difficulty}:${normalizedSeed}`);
  const attempts = difficulty === 'expert' ? 5 : 2;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const solution = randomSolution(random);
    const puzzle = solution.slice();
    const order = shuffle(Array.from({ length: CELL_COUNT }, (_, index) => index), random);
    let clues = CELL_COUNT;
    for (const index of order) {
      const saved = puzzle[index];
      puzzle[index] = 0;
      if (countSolutions(puzzle, 2) === 1) clues -= 1;
      else puzzle[index] = saved;
      if (clues === setting.clues) {
        return { puzzle, solution, seed: normalizedSeed, difficulty };
      }
    }
  }
  return { ...fallbackPuzzle(random, setting.clues), seed: normalizedSeed, difficulty };
}

/** Calendar day in China, independent of the browser or server timezone. */
export function dailySeed(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const value = type => parts.find(part => part.type === type).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
