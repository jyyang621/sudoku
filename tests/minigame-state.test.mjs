import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { generatePuzzle, getAllCandidates } from '../js/sudoku.js';

const require = createRequire(import.meta.url);
const { SudokuGame } = require('../wechat-minigame/src/state.js');
const now = () => Date.parse('2026-10-17T16:00:00Z');
const create = options => new SudokuGame({ seed: 'minigame-state', now, ...options });
const clone = value => structuredClone(value);
const firstEmpty = game => game.puzzle.indexOf(0);

test('mini game reproduces existing shared website puzzles and exposes the fixed state API', () => {
  for (const difficulty of ['easy', 'medium', 'hard', 'expert']) {
    const game = create({ difficulty });
    const generated = generatePuzzle(game.seed, difficulty);
    assert.deepEqual(game.board, generated.puzzle);
    assert.deepEqual(game.puzzle, generated.puzzle);
    assert.deepEqual(game.solution, generated.solution);
    assert.notEqual(game.board, game.puzzle);
    assert.equal(game.state.board, game.board);
    assert.equal(game.selected, firstEmpty(game));
    assert.equal(game.elapsed, 0);
    assert.equal(game.completed, false);
    assert.equal(game.history.length, 0);
    assert.equal(game.notes.length, 81);
  }
});

test('given digits cannot be entered, erased, or annotated and no-op actions add no undo steps', () => {
  const game = create();
  game.select(game.puzzle.findIndex(Boolean));
  const before = game.serialize();
  assert.equal(game.input(3), false);
  assert.equal(game.erase(), false);
  assert.deepEqual(game.serialize(), before);
  game.toggleNotes();
  assert.equal(game.input(3), false);
  assert.equal(game.history.length, 0);
  for (const index of [-1, 81, 1.5, '4', NaN]) assert.equal(game.select(index), false);
});

test('manual notes add/remove in sorted order and a single undo restores an edit', () => {
  const game = create();
  const index = firstEmpty(game);
  game.select(index);
  game.toggleNotes();
  assert.equal(game.input(8), true);
  assert.equal(game.input(2), true);
  assert.deepEqual(game.notes[index], [2, 8]);
  assert.equal(game.input(8), true);
  assert.deepEqual(game.notes[index], [2]);
  assert.equal(game.undo(), true);
  assert.deepEqual(game.notes[index], [2, 8]);
  assert.equal(game.erase(), true);
  assert.deepEqual(game.notes[index], []);
  game.undo();
  assert.deepEqual(game.notes[index], [2, 8]);
  game.toggleNotes();
  assert.equal(game.input(game.solution[index]), true);
  assert.deepEqual(game.notes[index], []);
  game.toggleNotes();
  assert.equal(game.input(1), false);
});

test('fill-all notes computes local candidates once, preserves digits, and undoes atomically', () => {
  const game = create();
  const index = firstEmpty(game);
  game.select(index);
  game.input(game.solution[index]);
  const before = game.serialize();
  const expected = getAllCandidates(game.board);
  assert.ok(expected.some(list => list.length > 1));
  assert.equal(game.fillAllNotes(), true);
  assert.deepEqual(game.board, before.board);
  assert.deepEqual(game.notes, expected);
  assert.equal(game.history.length, before.history.length + 1);
  assert.equal(game.fillAllNotes(), false);
  assert.equal(game.history.length, before.history.length + 1);
  assert.equal(game.undo(), true);
  assert.deepEqual(game.serialize(), before);
});

test('filling a value removes peer notes and undo restores every affected note', () => {
  const game = create();
  game.fillAllNotes();
  const index = firstEmpty(game);
  game.select(index);
  const before = game.serialize();
  const digit = game.notes[index][0];
  assert.ok(digit);
  game.input(digit);
  const row = Math.floor(index / 9);
  for (let other = row * 9; other < row * 9 + 9; other++) {
    assert.equal(game.notes[other].includes(digit), false);
  }
  game.undo();
  assert.deepEqual(game.serialize(), before);
});

test('hints correct selected wrong values and hint counts survive undo', () => {
  const game = create();
  const index = firstEmpty(game);
  game.select(index);
  const wrong = game.solution[index] % 9 + 1;
  game.input(wrong);
  const boardBefore = game.board.slice();
  assert.deepEqual(game.hint(), { index, value: game.solution[index], corrected: true });
  assert.equal(game.hints, 1);
  assert.equal(game.board[index], game.solution[index]);
  game.tick(450);
  game.undo();
  assert.equal(game.hints, 1);
  assert.equal(game.elapsed, 450);
  assert.deepEqual(game.board, boardBefore);
  game.select(game.puzzle.findIndex(Boolean));
  assert.equal(game.hint().index, index);
  assert.equal(game.hints, 2);
});

test('time advances only by supplied foreground deltas; pause blocks all game edits', () => {
  const game = create();
  game.tick(250);
  game.tick(750);
  for (const delta of [-1, 0, NaN, Infinity, '10']) assert.equal(game.tick(delta), false);
  assert.equal(game.elapsed, 1000);
  assert.equal(game.setPaused(true), true);
  const before = game.serialize();
  assert.equal(game.tick(3600000), false);
  assert.equal(game.select(0), false);
  assert.equal(game.input(1), false);
  assert.equal(game.erase(), false);
  assert.equal(game.undo(), false);
  assert.equal(game.toggleNotes(), false);
  assert.equal(game.fillAllNotes(), false);
  assert.equal(game.hint(), null);
  assert.deepEqual(game.serialize(), before);
  assert.equal(game.setPaused('false'), false);
  game.setPaused(false);
  game.tick(100);
  assert.equal(game.elapsed, 1100);
});

test('only the unique valid solution completes a game, then time stops and undo reopens it', () => {
  const game = create();
  const empty = game.puzzle.flatMap((digit, index) => digit ? [] : [index]);
  for (const index of empty) {
    game.select(index);
    game.input(game.solution[index]);
  }
  assert.equal(game.completed, true);
  assert.equal(game.input(1), false);
  assert.equal(game.tick(1000), false);
  assert.equal(game.undo(), true);
  assert.equal(game.completed, false);
  const index = empty.at(-1);
  game.select(index);
  game.input(game.solution[index] % 9 + 1);
  assert.equal(game.board.includes(0), false);
  assert.equal(game.completed, false);
});

test('serialization and restore preserve progress, pause, notes, history and round identity without aliases', () => {
  const game = create({ mode: 'daily' });
  game.fillAllNotes();
  game.select(firstEmpty(game));
  game.hint();
  game.tick(1234);
  game.toggleNotes();
  game.setPaused(true);
  const serialized = game.serialize();
  const resumed = new SudokuGame({ saved: JSON.parse(JSON.stringify(serialized)), now });
  assert.deepEqual(resumed.serialize(), serialized);
  assert.deepEqual(resumed.solution, game.solution);
  assert.equal(resumed.roundId, game.roundId);
  serialized.board[firstEmpty(game)] = 0;
  serialized.history[0].notes[0].push(9);
  assert.notDeepEqual(resumed.serialize(), serialized);
  resumed.setPaused(false);
  resumed.undo();
  assert.equal(resumed.hints, 1);
});

test('completed state is recomputed and never trusted from saved metadata', () => {
  const game = create();
  const saved = game.serialize();
  saved.completed = true;
  saved.solution = Array(81).fill(1);
  saved.puzzle = Array(81).fill(1);
  assert.equal(game.restore(saved), true);
  assert.equal(game.completed, false);
  assert.deepEqual(game.solution, generatePuzzle(game.seed, game.difficulty).solution);
  saved.board = game.solution.slice();
  saved.notes = Array.from({ length: 81 }, () => []);
  saved.paused = true;
  assert.equal(game.restore(saved), true);
  assert.equal(game.completed, true);
  assert.equal(game.paused, false);
});

test('malformed saved progress and histories are rejected without replacing the current game', () => {
  const game = create();
  game.fillAllNotes();
  const source = game.serialize();
  const given = game.puzzle.findIndex(Boolean);
  const empty = firstEmpty(game);
  const mutations = [
    saved => { saved.schemaVersion = 2; },
    saved => { saved.seed = 'a'.repeat(81); },
    saved => { saved.difficulty = 'impossible'; },
    saved => { saved.mode = 'other'; },
    saved => { saved.board = []; },
    saved => { saved.board[empty] = 10; },
    saved => { delete saved.board[empty]; },
    saved => { saved.board[given] = 0; },
    saved => { saved.notes = Array(81); },
    saved => { saved.notes[empty] = [1, 1]; },
    saved => { saved.notes[empty] = [0]; },
    saved => { saved.notes[given] = [1]; },
    saved => { saved.notes[empty] = Array(1); },
    saved => { saved.selected = 81; },
    saved => { saved.noteMode = 'true'; },
    saved => { saved.paused = 1; },
    saved => { saved.elapsed = -1; },
    saved => { saved.elapsed = Infinity; },
    saved => { saved.hints = 1.5; },
    saved => { saved.roundId = 'x'.repeat(161); },
    saved => { saved.history = Array(1); },
    saved => { saved.history[0].board[given] = 0; },
    saved => { saved.history[0].notes[empty] = [10]; },
  ];
  for (const mutate of mutations) {
    const malformed = clone(source);
    mutate(malformed);
    assert.equal(game.restore(malformed), false, mutate.toString());
    assert.deepEqual(game.serialize(), source);
  }
  assert.equal(game.restore(null), false);
});

test('invalid shared seeds and difficulty cannot break construction or replace an active game', () => {
  const game = create();
  const before = game.serialize();
  for (const seed of [undefined, null, 12, {}, '', ' ', 'x'.repeat(81), 'abc\n', '\ud800']) {
    assert.equal(game.start(seed, 'easy', 'classic'), false);
    assert.deepEqual(game.serialize(), before);
    const fallback = create({ seed, difficulty: 'invalid', mode: 'invalid', saved: { bad: true } });
    assert.equal(fallback.difficulty, 'easy');
    assert.equal(fallback.mode, 'classic');
    assert.ok(fallback.seed.length <= 80);
    assert.doesNotThrow(() => fallback.shareQuery());
  }
  assert.equal(game.start('valid-seed', 'other', 'classic'), false);
  assert.deepEqual(game.serialize(), before);
});

test('daily default uses the China calendar date and encoded sharing reproduces the same puzzle', () => {
  const daily = new SudokuGame({ mode: 'daily', now });
  assert.equal(daily.seed, '2026-10-18');
  const game = create({ seed: '朋友 & 数独 🧩', difficulty: 'hard', mode: 'daily' });
  const query = new URLSearchParams(game.shareQuery());
  assert.equal(query.get('p'), game.seed);
  assert.equal(query.get('d'), 'hard');
  assert.equal(query.get('m'), 'daily');
  const friend = create({ seed: query.get('p'), difficulty: query.get('d'), mode: query.get('m') });
  assert.deepEqual(friend.board, game.puzzle);
  assert.equal(friend.hints, 0);
});

test('restart clears progress and establishes a new round while preserving the puzzle', () => {
  const game = create();
  const board = game.puzzle.slice();
  const roundId = game.roundId;
  game.hint();
  game.tick(1000);
  game.toggleNotes();
  game.setPaused(true);
  assert.equal(game.restart(), true);
  assert.deepEqual(game.board, board);
  assert.equal(game.elapsed, 0);
  assert.equal(game.hints, 0);
  assert.equal(game.noteMode, false);
  assert.equal(game.paused, false);
  assert.equal(game.history.length, 0);
  assert.notEqual(game.roundId, roundId);
  assert.equal(game.start('next-round', 'medium', 'classic'), true);
  assert.equal(game.seed, 'next-round');
  assert.equal(game.difficulty, 'medium');
});
