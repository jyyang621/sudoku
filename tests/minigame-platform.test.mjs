import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createMiniGame } = require('../wechat-minigame/src/main.js');

function mockPlatform({ query = {}, storageErrors = false, initialStorage = [] } = {}) {
  const handlers = new Map();
  const storage = new Map(initialStorage);
  const writes = [];
  const gradient = { addColorStop() {} };
  const context = new Proxy({
    measureText: text => ({ width: String(text).length * 9 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
  }, {
    get(object, key) {
      if (key in object) return object[key];
      return () => {};
    },
  });
  const canvas = {
    width: 0, height: 0,
    getContext: () => context,
    createImage: () => ({}),
    toTempFilePathSync: () => 'mock://share.png',
  };
  const info = {
    windowWidth: 390, windowHeight: 844, screenWidth: 390, screenHeight: 844,
    pixelRatio: 2, statusBarHeight: 44,
    safeArea: { left: 0, right: 390, top: 44, bottom: 810, width: 390, height: 766 },
  };
  const platform = {
    createCanvas: () => canvas,
    getSystemInfoSync: () => ({ ...info }),
    getWindowInfo: () => ({ ...info }),
    getLaunchOptionsSync: () => ({ query }),
    getMenuButtonBoundingClientRect: () => ({ left: 288, right: 380, top: 50, bottom: 82, width: 92, height: 32 }),
    getStorageSync(key) {
      if (storageErrors) throw new Error('Storage unavailable');
      return storage.has(key) ? structuredClone(storage.get(key)) : '';
    },
    setStorageSync(key, value) {
      if (storageErrors) throw new Error('Storage full');
      const copied = structuredClone(value);
      storage.set(key, copied);
      writes.push({ key, value: copied });
    },
    removeStorageSync(key) { storage.delete(key); },
    showShareMenu() {},
    shareAppMessage() {},
    showToast() {},
    vibrateShort() {},
    setKeepScreenOn() {},
    showModal(options) {
      if (options.success) options.success({ confirm: true, cancel: false });
    },
    showActionSheet(options) {
      if (options.success) options.success({ tapIndex: 0 });
    },
  };
  for (const name of ['TouchStart', 'TouchMove', 'TouchEnd', 'TouchCancel', 'Hide', 'Show', 'WindowResize', 'ShareAppMessage']) {
    platform[`on${name}`] = callback => {
      if (!handlers.has(name)) handlers.set(name, new Set());
      handlers.get(name).add(callback);
    };
    platform[`off${name}`] = callback => handlers.get(name)?.delete(callback);
  }
  const emit = (name, payload = {}) => {
    for (const callback of handlers.get(name) || []) callback(payload);
  };
  return { platform, canvas, context, storage, writes, handlers, emit };
}

function create(options = {}) {
  const mock = mockPlatform(options);
  let currentTime = Date.parse('2026-10-17T16:00:00Z');
  const app = createMiniGame(mock.platform, { autoTick: false, now: () => currentTime });
  return { ...mock, app, advance: ms => { currentTime += ms; } };
}

function clickTarget(mock, target) {
  assert.ok(target, 'The expected interactive target is rendered');
  const point = { clientX: target.x + target.w / 2, clientY: target.y + target.h / 2 };
  mock.emit('TouchStart', { touches: [point], changedTouches: [point] });
}

function parsedShare(app) {
  const payload = app.sharePayload();
  assert.equal(typeof payload.title, 'string');
  assert.ok(payload.title.length > 0);
  assert.equal(typeof payload.query, 'string');
  return new URLSearchParams(payload.query);
}

test('mini-game opens on its home screen and only puzzle shares include a seed', () => {
  const mock = create();
  try {
    assert.equal(mock.app.screen, 'home');
    assert.equal(parsedShare(mock.app).has('p'), false);
    assert.ok(mock.app.layout);
    assert.ok(Array.isArray(mock.app.targets));
    mock.app.activate('openGame', 'sudoku');
    assert.equal(mock.app.screen, 'game');
    const query = parsedShare(mock.app);
    assert.equal(query.get('g'), 'sudoku');
    assert.equal(query.get('p'), mock.app.game.seed);
    assert.equal(query.get('d'), mock.app.game.difficulty);
    assert.equal(query.get('m'), mock.app.game.mode);
    const before = mock.app.game.serialize();
    mock.app.activate('home');
    assert.equal(mock.app.screen, 'home');
    assert.equal(parsedShare(mock.app).has('p'), false);
    mock.advance(3600000);
    mock.app.refresh();
    assert.equal(mock.app.game.elapsed, before.elapsed);
    mock.app.activate('openGame', 'sudoku');
    assert.equal(mock.app.screen, 'game');
    assert.equal(mock.app.game.seed, before.seed);
    assert.deepEqual(mock.app.game.board, before.board);
  } finally { mock.app.dispose(); }
});

test('valid friend query opens the identical game directly', () => {
  const mock = create({ query: { g: 'sudoku', p: '朋友 & 数独 🧩', d: 'hard', m: 'daily' } });
  try {
    assert.equal(mock.app.screen, 'game');
    assert.equal(mock.app.game.seed, '朋友 & 数独 🧩');
    assert.equal(mock.app.game.difficulty, 'hard');
    assert.equal(mock.app.game.mode, 'daily');
    assert.equal(parsedShare(mock.app).get('p'), mock.app.game.seed);
  } finally { mock.app.dispose(); }
});

test('malformed external puzzle parameters are ignored without breaking startup', () => {
  for (const seed of ['', 'x'.repeat(81), 'bad\nseed', '\ud800', {}, 42]) {
    const mock = create({ query: { g: 'sudoku', p: seed, d: 'unknown', m: 'unknown' } });
    try {
      assert.equal(typeof mock.app.game.seed, 'string');
      assert.ok(mock.app.game.seed.length > 0 && mock.app.game.seed.length <= 80);
      assert.notEqual(mock.app.game.seed, seed);
      assert.ok(['easy', 'medium', 'hard', 'expert'].includes(mock.app.game.difficulty));
      assert.ok(['classic', 'daily'].includes(mock.app.game.mode));
      assert.doesNotThrow(() => mock.app.sharePayload());
      assert.doesNotThrow(() => mock.app.refresh());
    } finally { mock.app.dispose(); }
  }
});

test('touch targets open sudoku, select a cell, enter a digit and return home', () => {
  const mock = create();
  try {
    clickTarget(mock, mock.app.targets.find(target => target.action === 'openGame' && target.payload === 'sudoku'));
    assert.equal(mock.app.screen, 'game');
    const index = mock.app.game.puzzle.indexOf(0);
    clickTarget(mock, mock.app.targets.find(target => target.action === 'select' && target.payload === index));
    assert.equal(mock.app.game.selected, index);
    const digit = mock.app.game.solution[index];
    clickTarget(mock, mock.app.targets.find(target => target.action === 'digit' && target.payload === digit));
    assert.equal(mock.app.game.board[index], digit);
    clickTarget(mock, mock.app.targets.find(target => target.action === 'home'));
    assert.equal(mock.app.screen, 'home');
    const state = mock.app.game.serialize();
    assert.doesNotThrow(() => mock.emit('TouchStart', { touches: [] }));
    assert.doesNotThrow(() => mock.emit('TouchStart', { touches: [{ clientX: -20, clientY: -20 }] }));
    assert.deepEqual(mock.app.game.serialize(), state);
  } finally { mock.app.dispose(); }
});

test('background saves progress; returning foreground preserves a manual pause', () => {
  const mock = create();
  try {
    mock.app.activate('openGame', 'sudoku');
    const index = mock.app.game.puzzle.indexOf(0);
    mock.app.activate('select', index);
    mock.app.activate('digit', mock.app.game.solution[index]);
    mock.app.activate('pause');
    assert.equal(mock.app.game.paused, true);
    const before = mock.app.game.serialize();
    const writeCount = mock.writes.length;
    mock.emit('Hide');
    assert.ok(mock.writes.length > writeCount, 'Backgrounding persists the current progress');
    mock.advance(7200000);
    mock.emit('Show', { query: {} });
    assert.equal(mock.app.game.paused, true);
    assert.equal(mock.app.game.elapsed, before.elapsed);
    assert.deepEqual(mock.app.game.board, before.board);
    assert.equal(mock.app.game.roundId, before.roundId);
    assert.doesNotThrow(() => mock.emit('WindowResize', { windowWidth: 844, windowHeight: 390 }));
  } finally { mock.app.dispose(); }
});

test('a fresh platform instance restores the saved round from local storage', () => {
  const first = create();
  let second;
  try {
    first.app.activate('openGame', 'sudoku');
    first.app.game.fillAllNotes();
    first.app.game.hint();
    first.app.game.tick(1234);
    first.emit('Hide');
    const saved = first.app.game.serialize();
    second = create({ initialStorage: [...first.storage] });
    second.app.activate('openGame', 'sudoku');
    assert.equal(second.app.game.seed, saved.seed);
    assert.equal(second.app.game.roundId, saved.roundId);
    assert.equal(second.app.game.hints, saved.hints);
    assert.equal(second.app.game.elapsed, saved.elapsed);
    assert.deepEqual(second.app.game.board, saved.board);
    assert.deepEqual(second.app.game.notes, saved.notes);
  } finally {
    first.app.dispose();
    second?.app.dispose();
  }
});

test('storage read/write failures do not prevent play, sharing or lifecycle handling', () => {
  const mock = create({ storageErrors: true });
  try {
    assert.doesNotThrow(() => mock.app.activate('openGame', 'sudoku'));
    const index = mock.app.game.puzzle.indexOf(0);
    assert.doesNotThrow(() => mock.app.activate('select', index));
    assert.doesNotThrow(() => mock.app.activate('digit', mock.app.game.solution[index]));
    assert.equal(mock.app.game.board[index], mock.app.game.solution[index]);
    assert.doesNotThrow(() => mock.emit('Hide'));
    assert.doesNotThrow(() => mock.emit('Show', { query: {} }));
    assert.doesNotThrow(() => mock.app.sharePayload());
    assert.doesNotThrow(() => mock.app.activate('home'));
  } finally { assert.doesNotThrow(() => mock.app.dispose()); }
});

test('only foreground play contributes time across home navigation and background transitions', () => {
  const mock = create();
  try {
    mock.advance(10000);
    mock.app.activate('openGame', 'sudoku');
    assert.equal(mock.app.game.elapsed, 0);
    mock.advance(1500);
    mock.app.activate('select', mock.app.game.selected);
    assert.equal(mock.app.game.elapsed, 1500);
    mock.advance(500);
    mock.app.activate('home');
    assert.equal(mock.app.game.elapsed, 2000);
    mock.advance(60000);
    mock.app.activate('openGame', 'sudoku');
    assert.equal(mock.app.game.elapsed, 2000);
    mock.advance(1000);
    mock.emit('Hide');
    assert.equal(mock.app.game.elapsed, 3000);
    mock.advance(3600000);
    mock.emit('Show', { query: {} });
    assert.equal(mock.app.game.elapsed, 3000);
    assert.equal(mock.app.game.paused, true);
    mock.app.activate('pause');
    mock.advance(1000);
    mock.app.activate('select', mock.app.game.selected);
    assert.equal(mock.app.game.elapsed, 4000);
  } finally { mock.app.dispose(); }
});

test('native confirmation pauses the clock and cancellation keeps the current puzzle', () => {
  const mock = create();
  const modals = [];
  mock.platform.showModal = config => { modals.push(config); };
  try {
    mock.app.activate('openGame', 'sudoku');
    mock.app.game.hint();
    const original = mock.app.game.serialize();
    mock.advance(1000);
    mock.app.activate('difficulty', 'medium');
    assert.equal(modals.length, 1);
    assert.equal(mock.app.game.elapsed, 1000);
    mock.advance(30000);
    assert.equal(mock.app.activate('digit', 1), false);
    modals[0].success({ confirm: false, cancel: true });
    modals[0].complete();
    assert.equal(mock.app.game.difficulty, original.difficulty);
    assert.equal(mock.app.game.seed, original.seed);
    assert.deepEqual(mock.app.game.board, original.board);
    mock.advance(500);
    mock.app.activate('select', mock.app.game.selected);
    assert.equal(mock.app.game.elapsed, 1500);
    mock.app.activate('difficulty', 'medium');
    assert.equal(modals.length, 2);
    mock.advance(5000);
    modals[1].success({ confirm: true, cancel: false });
    modals[1].complete();
    assert.equal(mock.app.game.difficulty, 'medium');
    assert.equal(mock.app.game.elapsed, 0);
    assert.equal(mock.app.game.hints, 0);
    assert.notEqual(mock.app.game.roundId, original.roundId);
  } finally { mock.app.dispose(); }
});

test('native share callback follows the active screen and dispose removes event handlers', () => {
  const mock = create();
  const shares = [];
  mock.platform.shareAppMessage = payload => { shares.push(payload); };
  const callback = [...mock.handlers.get('ShareAppMessage')][0];
  assert.equal(typeof callback, 'function');
  assert.equal(new URLSearchParams(callback().query).has('p'), false);
  mock.app.activate('openGame', 'sudoku');
  assert.equal(new URLSearchParams(callback().query).get('p'), mock.app.game.seed);
  mock.app.activate('share');
  assert.deepEqual(shares.at(-1), callback());
  mock.app.activate('home');
  assert.equal(new URLSearchParams(callback().query).has('p'), false);
  mock.app.dispose();
  for (const callbacks of mock.handlers.values()) assert.equal(callbacks.size, 0);
  assert.equal(mock.app.activate('openGame', 'sudoku'), false);
  assert.doesNotThrow(() => mock.app.dispose());
});

test('upcoming gold-miner and zuma entries leave the saved sudoku round untouched', () => {
  const mock = create();
  try {
    mock.app.activate('openGame', 'sudoku');
    mock.app.activate('hint');
    mock.app.activate('autoNotes');
    mock.app.activate('home');
    const before = mock.app.game.serialize();
    for (const id of ['gold-miner', 'zuma']) {
      clickTarget(mock, mock.app.targets.find(target => target.action === 'comingSoon' && target.payload === id));
      assert.equal(mock.app.screen, 'home');
      assert.deepEqual(mock.app.game.serialize(), before);
      assert.equal(mock.app.activate('openGame', id), false);
      assert.equal(mock.app.screen, 'home');
      assert.deepEqual(mock.app.game.serialize(), before);
    }
    mock.app.activate('openGame', 'sudoku');
    assert.equal(mock.app.screen, 'game');
    assert.deepEqual(mock.app.game.serialize(), before);
  } finally { mock.app.dispose(); }
});

test('the fill-all-notes button updates candidates and its undo button restores the original notes', () => {
  const mock = create();
  try {
    mock.app.activate('openGame', 'sudoku');
    mock.app.activate('select', mock.app.game.puzzle.indexOf(0));
    mock.app.activate('notes');
    mock.app.activate('digit', 9);
    mock.app.activate('notes');
    const before = mock.app.game.serialize();
    clickTarget(mock, mock.app.targets.find(target => target.action === 'autoNotes'));
    assert.deepEqual(mock.app.game.board, before.board);
    assert.notDeepEqual(mock.app.game.notes, before.notes);
    assert.ok(mock.app.game.notes.filter(list => list.length).length > 1);
    assert.equal(mock.app.game.history.length, before.history.length + 1);
    clickTarget(mock, mock.app.targets.find(target => target.action === 'undo'));
    assert.deepEqual(mock.app.game.serialize(), before);
  } finally { mock.app.dispose(); }
});

test('undoing and completing the same round again records only one completed round', () => {
  const mock = create();
  try {
    mock.app.activate('openGame', 'sudoku');
    const empty = mock.app.game.puzzle.flatMap((digit, index) => digit ? [] : [index]);
    const roundId = mock.app.game.roundId;
    for (const index of empty) {
      mock.app.activate('select', index);
      mock.app.activate('digit', mock.app.game.solution[index]);
    }
    assert.equal(mock.app.game.completed, true);
    const statsEntry = [...mock.storage].find(([key]) => key.includes('stats'));
    assert.ok(statsEntry, 'Completing a round writes local statistics');
    const statsKey = statsEntry[0];
    const firstStats = structuredClone(statsEntry[1]);
    assert.equal(firstStats.completed[mock.app.game.difficulty].count, 1);
    assert.deepEqual(firstStats.rounds, [roundId]);
    const statsWrites = mock.writes.filter(write => write.key === statsKey).length;
    assert.equal(mock.app.activate('undo'), true);
    assert.equal(mock.app.game.completed, false);
    assert.equal(mock.app.game.roundId, roundId);
    const last = empty.at(-1);
    mock.app.activate('select', last);
    mock.app.activate('digit', mock.app.game.solution[last]);
    assert.equal(mock.app.game.completed, true);
    assert.deepEqual(mock.storage.get(statsKey), firstStats);
    assert.equal(mock.writes.filter(write => write.key === statsKey).length, statsWrites);
  } finally { mock.app.dispose(); }
});
