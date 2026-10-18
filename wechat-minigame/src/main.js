'use strict';

const { SudokuGame } = require('./state.js');
const { createLayout, render, timeLabel } = require('./renderer.js');
const { createHubLayout, renderHub } = require('./hub-renderer.js');
const { GAMES, getGame } = require('./registry.js');
const { DIFFICULTIES, dailySeed } = require('../lib/sudoku.js');

const SAVE_KEY = 'games-between:sudoku:v1';
const SETTINGS_KEY = 'games-between:settings:v1';
const STATS_KEY = 'games-between:stats:v1';
const isDifficulty = id => DIFFICULTIES.some(item => item.id === id);

function sharedRound(query) {
  if (!query || (query.g && query.g !== 'sudoku')) return null;
  const seed = query.p;
  if (typeof seed !== 'string' || !seed.trim() || seed.length > 80 || /[\u0000-\u001f\u007f]/.test(seed)) return null;
  try { encodeURIComponent(seed); } catch { return null; }
  return { seed, difficulty: isDifficulty(query.d) ? query.d : 'easy', mode: query.m === 'daily' ? 'daily' : 'classic' };
}

/** Native host. Rendering/state modules have no wx or DOM dependency. */
function createMiniGame(platform, options = {}) {
  const now = options.now || Date.now;
  const canvas = options.canvas || platform.createCanvas();
  const ctx = canvas.getContext('2d');
  let screen = 'home';
  let disposed = false;
  let background = false;
  let modalDepth = 0;
  let lastTick = now();
  let layout;
  let gameLayout;
  let hubLayout;
  let targets = [];
  let timer = null;
  let toastTimer = null;
  let activeRound = false;
  let lastSaveAt = now();
  const handlers = [];
  const ui = { storageAvailable: true, settings: { conflicts: true, highlight: true }, toast: '' };

  function read(key) {
    try { return platform.getStorageSync(key) || null; }
    catch { ui.storageAvailable = false; return null; }
  }
  function write(key, value) {
    try { platform.setStorageSync(key, value); ui.storageAvailable = true; return true; }
    catch { ui.storageAvailable = false; return false; }
  }
  const saved = read(SAVE_KEY);
  const savedSettings = read(SETTINGS_KEY);
  if (savedSettings && typeof savedSettings === 'object') {
    for (const key of ['conflicts', 'highlight']) {
      if (typeof savedSettings[key] === 'boolean') ui.settings[key] = savedSettings[key];
    }
  }
  const rawStats = read(STATS_KEY);
  const stats = { completed: {}, rounds: [] };
  if (rawStats && typeof rawStats === 'object') {
    if (Array.isArray(rawStats.rounds)) stats.rounds = rawStats.rounds.filter(id => typeof id === 'string' && id.length <= 160).slice(-200);
    for (const item of DIFFICULTIES) {
      const value = rawStats.completed && rawStats.completed[item.id];
      if (value && Number.isSafeInteger(value.count) && value.count >= 0 &&
        Number.isFinite(value.best) && value.best >= 0) stats.completed[item.id] = { count: value.count, best: value.best };
    }
  }
  let launch = {};
  try { launch = platform.getLaunchOptionsSync ? platform.getLaunchOptionsSync() || {} : {}; } catch {}
  const incoming = sharedRound(launch.query);
  const canResumeIncoming = incoming && saved && incoming.seed === saved.seed &&
    incoming.difficulty === saved.difficulty && incoming.mode === saved.mode;
  const game = new SudokuGame({ now, ...(incoming || {}), saved: incoming && !canResumeIncoming ? null : saved });
  if (incoming) screen = 'game';
  activeRound = Boolean(incoming || (saved && game.roundId === saved.roundId));

  function syncClock() {
    const timestamp = now();
    const delta = timestamp - lastTick;
    lastTick = timestamp;
    if (!disposed && !background && !modalDepth && screen === 'game') game.tick(delta);
  }

  function save() {
    if (activeRound) { write(SAVE_KEY, game.serialize()); lastSaveAt = now(); }
  }

  function toast(message) {
    if (toastTimer) clearTimeout(toastTimer);
    ui.toast = message;
    refresh();
    toastTimer = setTimeout(() => { ui.toast = ''; if (!disposed) refresh(); }, 2300);
  }

  function refresh() {
    if (disposed) return;
    layout = screen === 'home' ? hubLayout : gameLayout;
    if (!layout) return;
    if (screen === 'home') {
      const filled = game.board.filter(Boolean).length;
      targets = renderHub(ctx, layout, GAMES, {
        ...ui, resumeText: activeRound ? (game.completed ? '上一题已完成 · 再来一局' : `已填 ${filled}/81 · 用时 ${timeLabel(game.elapsed)}`) : '',
      });
    } else {
      targets = render(ctx, layout, game, { ...ui, subtitle: '给专注一点时间' });
    }
    if (typeof options.onRender === 'function') options.onRender({ screen, targets, game });
  }

  function resize() {
    let info = {};
    try { info = platform.getWindowInfo ? platform.getWindowInfo() : platform.getSystemInfoSync(); } catch {}
    const width = Number(info.windowWidth) || 375;
    const height = Number(info.windowHeight) || 667;
    const dpr = Math.max(1, Math.min(3, Number(info.pixelRatio) || 1));
    const safeTop = info.safeArea ? Number(info.safeArea.top) || 0 : Number(info.statusBarHeight) || 0;
    const safeBottom = info.safeArea ? Math.max(0, height - Number(info.safeArea.bottom || height)) : 0;
    let capsule = null;
    try { capsule = platform.getMenuButtonBoundingClientRect ? platform.getMenuButtonBoundingClientRect() : null; } catch {}
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    if (ctx.setTransform) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    else ctx.scale(dpr, dpr);
    gameLayout = createLayout(width, height, safeTop, safeBottom, capsule);
    hubLayout = createHubLayout(width, height, safeTop, safeBottom, capsule);
    refresh();
  }

  function sharePayload() {
    if (screen === 'home') return { title: '游戏之间 · 给快乐一点时间', query: 'g=home' };
    const difficulty = DIFFICULTIES.find(item => item.id === game.difficulty);
    return { title: `这道${difficulty.label || difficulty.name}数独，等你来挑战`, query: `g=sudoku&${game.shareQuery()}` };
  }

  function openModal(config, onConfirm) {
    if (!platform.showModal) { toast('请在微信开发者工具或微信内使用此功能'); return; }
    syncClock();
    modalDepth += 1;
    let finished = false;
    const finish = () => { if (!finished) { finished = true; modalDepth -= 1; lastTick = now(); refresh(); } };
    try {
      platform.showModal({ ...config,
        success(result) { finish(); if (result.confirm && onConfirm) onConfirm(); },
        fail() { finish(); toast('暂时无法打开，请稍后再试'); }, complete: finish,
      });
    } catch { finish(); toast('暂时无法打开，请稍后再试'); }
  }

  function changedBoard() {
    return game.board.some((digit, i) => digit !== game.puzzle[i]) || game.notes.some(list => list.length);
  }

  function startRound(seed, difficulty, mode, force = false) {
    const start = () => {
      syncClock();
      if (!game.start(seed, difficulty, mode)) return;
      activeRound = true;
      screen = 'game';
      lastTick = now();
      save(); refresh();
    };
    if (!force && !game.completed && changedBoard()) {
      openModal({ title: '开始新的一局？', content: '当前这一题的进度会被新题替换。', confirmText: '开始新局', cancelText: '继续这题' }, start);
    } else start();
  }

  function recordCompletion(wasComplete) {
    if (wasComplete || !game.completed || stats.rounds.includes(game.roundId)) return;
    stats.rounds.push(game.roundId);
    stats.rounds = stats.rounds.slice(-200);
    const before = stats.completed[game.difficulty];
    stats.completed[game.difficulty] = { count: Math.min(Number.MAX_SAFE_INTEGER, (before ? before.count : 0) + 1),
      best: before ? Math.min(before.best, game.elapsed) : game.elapsed };
    write(STATS_KEY, stats);
  }

  function more() {
    if (!platform.showActionSheet) { toast('更多功能请在微信中打开'); return; }
    syncClock();
    modalDepth += 1;
    let finished = false;
    const finish = () => { if (!finished) { finished = true; modalDepth -= 1; lastTick = now(); refresh(); } };
    try {
      platform.showActionSheet({ itemList: ['游戏规则', '重新开始本题', `冲突提示：${ui.settings.conflicts ? '开' : '关'}`,
        `关联高亮：${ui.settings.highlight ? '开' : '关'}`, '查看成绩', '返回游戏大厅'],
      success(result) {
        finish();
        if (result.tapIndex === 0) openModal({ title: '数独怎么玩', content: '每行、每列和每个九宫格填入 1–9，不能重复。\n\n“笔记”手动标记小数字；“填全笔记”一键填入所有空格的候选数，并覆盖原笔记，可撤销。候选数根据当前填入的数字计算，有冲突时请先修正。\n\n“提示”会填写或修正一个格子。', showCancel: false });
        else if (result.tapIndex === 1) openModal({ title: '重新开始本题？', content: '会清空这一题的填写、笔记和计时。', confirmText: '重新开始' }, () => startRound(game.seed, game.difficulty, game.mode, true));
        else if (result.tapIndex === 2 || result.tapIndex === 3) {
          const key = result.tapIndex === 2 ? 'conflicts' : 'highlight';
          ui.settings[key] = !ui.settings[key]; write(SETTINGS_KEY, ui.settings); refresh();
        } else if (result.tapIndex === 4) {
          const rows = DIFFICULTIES.map(item => {
            const record = stats.completed[item.id];
            return `${item.label || item.name}：${record ? `${record.count} 题 · 最快 ${timeLabel(record.best)}` : '尚未完成'}`;
          });
          openModal({ title: '我的数独成绩', content: `${rows.join('\n')}\n\n成绩保存在当前微信设备，含使用提示完成的题目。`, showCancel: false });
        } else if (result.tapIndex === 5) activate('home');
      }, fail: finish, complete: finish });
    } catch { finish(); toast('暂时无法打开菜单'); }
  }

  function activate(action, payload) {
    if (disposed || background || modalDepth) return false;
    syncClock();
    if (action === 'home') { save(); screen = 'home'; ui.toast = ''; refresh(); return true; }
    if (action === 'openGame' || action === 'resumeGame') {
      const entry = getGame(payload);
      if (!entry) return false;
      if (entry.status !== 'ready') { toast(`${entry.title} · 敬请期待`); return false; }
      // Future playable game modules are dispatched here, each with isolated state/storage.
      if (entry.id === 'sudoku') { screen = 'game'; activeRound = true; lastTick = now(); save(); refresh(); return true; }
      return false;
    }
    if (action === 'comingSoon') { const entry = getGame(payload); toast(`${entry ? entry.title : '新游戏'} · 敬请期待`); return false; }
    if (action === 'share') {
      if (platform.shareAppMessage) {
        try { platform.shareAppMessage(sharePayload()); } catch { toast('请使用右上角菜单分享'); }
      } else toast('请使用右上角菜单分享');
      return true;
    }
    if (screen !== 'game') return false;
    if (action === 'more') { more(); return true; }
    if (action === 'difficulty' && isDifficulty(payload) && payload !== game.difficulty) {
      startRound(game.mode === 'daily' ? dailySeed(new Date(now())) : game.seed, payload, game.mode); return true;
    }
    if (action === 'mode' && ['classic', 'daily'].includes(payload) && payload !== game.mode) {
      startRound(payload === 'daily' ? dailySeed(new Date(now())) : freshSeed(), game.difficulty, payload); return true;
    }
    if (action === 'newGame') {
      if (game.mode === 'daily' && game.seed === dailySeed(new Date(now()))) {
        openModal({ title: '今天的每日挑战', content: '同一难度的每日挑战每天只有一道。可以重玩本题，也可以切换经典模式获取新题。', confirmText: '重玩本题' }, () => startRound(game.seed, game.difficulty, game.mode, true));
      } else startRound(game.mode === 'daily' ? dailySeed(new Date(now())) : freshSeed(), game.difficulty, game.mode);
      return true;
    }
    const wasComplete = game.completed;
    let changed = false;
    if (action === 'select') changed = game.select(payload);
    else if (action === 'digit') changed = game.input(payload);
    else if (action === 'erase') changed = game.erase();
    else if (action === 'undo') changed = game.undo();
    else if (action === 'notes') changed = game.toggleNotes();
    else if (action === 'autoNotes') {
      changed = game.fillAllNotes(); if (changed) toast('已填入所有候选数，可撤销');
    } else if (action === 'hint') {
      const hint = game.hint(); changed = Boolean(hint);
      if (hint) toast(`第 ${Math.floor(hint.index / 9) + 1} 行第 ${hint.index % 9 + 1} 列${hint.corrected ? '已修正为' : '填入'} ${hint.value}`);
    } else if (action === 'pause') changed = game.setPaused(!game.paused);
    if (changed) { recordCompletion(wasComplete); save(); refresh(); }
    return changed;
  }

  function freshSeed() { return `${Math.floor(now()).toString(36)}-${Math.random().toString(36).slice(2, 12)}`; }

  function bind(name, callback) {
    if (typeof platform[name] !== 'function') return;
    platform[name](callback);
    handlers.push([name.replace(/^on/, 'off'), callback]);
  }

  resize();
  bind('onTouchStart', event => {
    const touch = (event.changedTouches || event.touches || [])[0];
    if (!touch) return;
    const x = Number(touch.clientX === undefined ? touch.x : touch.clientX);
    const y = Number(touch.clientY === undefined ? touch.y : touch.clientY);
    const hit = targets.slice().reverse().find(target => x >= target.x && x <= target.x + target.w && y >= target.y && y <= target.y + target.h);
    if (hit) activate(hit.action, hit.payload);
  });
  bind('onHide', () => { syncClock(); if (screen === 'game') game.setPaused(true); background = true; save(); });
  bind('onShow', event => {
    background = false; lastTick = now();
    const round = sharedRound(event && event.query);
    if (round) {
      if (round.seed === game.seed && round.difficulty === game.difficulty && round.mode === game.mode) {
        screen = 'game'; activeRound = true;
      } else startRound(round.seed, round.difficulty, round.mode);
    }
    resize();
  });
  bind('onWindowResize', resize);
  bind('onShareAppMessage', sharePayload);
  try { if (platform.showShareMenu) platform.showShareMenu({ menus: ['shareAppMessage'] }); } catch {}
  if (options.autoTick !== false) timer = setInterval(() => {
    if (disposed || background) return;
    syncClock();
    if (screen === 'game') { if (now() - lastSaveAt >= 5000) save(); refresh(); }
  }, 1000);
  if (incoming) save();

  return {
    game, canvas, activate, refresh, sharePayload,
    get screen() { return screen; }, get layout() { return layout; }, get targets() { return targets; },
    dispose() {
      if (disposed) return;
      syncClock(); save(); disposed = true;
      if (timer) clearInterval(timer);
      if (toastTimer) clearTimeout(toastTimer);
      for (const [name, callback] of handlers) if (typeof platform[name] === 'function') platform[name](callback);
    },
  };
}

module.exports = { createMiniGame, sharedRound };
if (typeof wx !== 'undefined') module.exports.instance = createMiniGame(wx);
