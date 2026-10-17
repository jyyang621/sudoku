import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DIFFICULTIES, generatePuzzle, solve, countSolutions, getCandidates,
  getConflicts, isComplete, dailySeed,
} from '../js/sudoku.js';

const classic = (
  '530070000' +
  '600195000' +
  '098000060' +
  '800060003' +
  '400803001' +
  '700020006' +
  '060000280' +
  '000419005' +
  '000080079'
).split('').map(Number);

test('solver returns a valid solution and preserves input', () => {
  const before = classic.slice();
  const solution = solve(classic);
  assert.ok(isComplete(solution));
  assert.deepEqual(classic, before);
  for (let index = 0; index < 81; index += 1) {
    if (classic[index]) assert.equal(solution[index], classic[index]);
  }
  assert.equal(countSolutions(classic), 1);
});

for (const difficulty of DIFFICULTIES) {
  test(`${difficulty.id} puzzles are unique, consistent and have the requested clue count`, () => {
    for (const seed of ['2026-10-17', '和朋友一起玩 🧩', 'challenge-42', '0']) {
      const result = generatePuzzle(seed, difficulty.id);
      assert.equal(result.seed, seed);
      assert.equal(result.difficulty, difficulty.id);
      assert.equal(result.puzzle.filter(Boolean).length, difficulty.clues);
      assert.equal(countSolutions(result.puzzle), 1);
      assert.ok(isComplete(result.solution));
      assert.deepEqual(solve(result.puzzle), result.solution);
      assert.equal(isComplete(result.puzzle), false);
      assert.equal(getConflicts(result.puzzle).size, 0);
    }
  });
}

test('shared seeds reproduce identical puzzles, while different seeds vary', () => {
  for (const difficulty of DIFFICULTIES) {
    assert.deepEqual(generatePuzzle('share-me', difficulty.id), generatePuzzle('share-me', difficulty.id));
  }
  assert.notDeepEqual(generatePuzzle('a').puzzle, generatePuzzle('b').puzzle);
  assert.throws(() => generatePuzzle('a', 'unknown'), RangeError);
});

test('previously shared v1 puzzle seeds keep their original board', () => {
  assert.equal(
    generatePuzzle('share-me', 'easy').puzzle.join(''),
    '600200000842107603000043010058912070369574001017300094100700430594000060723009000',
  );
});

test('candidate digits obey row, column and box restrictions', () => {
  assert.deepEqual(getCandidates(classic, 2), [1, 2, 4]);
  assert.deepEqual(getCandidates(classic, 0), []);
  assert.deepEqual(getCandidates(classic, -1), []);
  assert.deepEqual(getCandidates(Array(81).fill(0), 40), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('all duplicate cells are reported across rows, columns and boxes', () => {
  const board = Array(81).fill(0);
  board[0] = board[3] = board[27] = board[10] = 4;
  assert.deepEqual([...getConflicts(board)].sort((a, b) => a - b), [0, 3, 10, 27]);
  assert.equal(solve(board), null);
  assert.equal(countSolutions(board), 0);
  assert.equal(isComplete(board), false);
});

test('invalid boards are rejected and ambiguous boards honor the counting limit', () => {
  assert.equal(solve([0]), null);
  assert.equal(countSolutions(Array(81).fill(10)), 0);
  assert.equal(isComplete(Array(81).fill(1)), false);
  assert.equal(countSolutions(Array(81).fill(0), 2), 2);
  assert.equal(countSolutions(Array(81).fill(0), 1), 1);
  assert.equal(countSolutions(classic, 0), 0);
  assert.equal(countSolutions(classic, Infinity), 0);
});

test('a consistent but impossible board has no solution', () => {
  const board = classic.slice();
  board[2] = 1; // This is locally legal, but contradicts the unique solution.
  assert.equal(getConflicts(board).size, 0);
  assert.equal(solve(board), null);
  assert.equal(countSolutions(board), 0);
});

test('daily seed changes at midnight in Asia/Shanghai', () => {
  assert.equal(dailySeed(new Date('2026-10-16T15:59:59Z')), '2026-10-16');
  assert.equal(dailySeed(new Date('2026-10-16T16:00:00Z')), '2026-10-17');
  assert.equal(dailySeed(new Date('2026-12-31T16:00:00Z')), '2027-01-01');
});
