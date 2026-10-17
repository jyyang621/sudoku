import { DIFFICULTIES, generatePuzzle, getConflicts, getCandidates, isComplete, dailySeed } from './sudoku.js';

const $ = id => document.getElementById(id);
const GAME_KEY = 'sudoku-between.game.v1';
const STATS_KEY = 'sudoku-between.stats.v1';
const SETTINGS_KEY = 'sudoku-between.settings.v1';
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const emptyNotes = () => Array.from({ length: 81 }, () => []);
const validDigits = values => Array.isArray(values) && values.length === 81 && values.every(n => Number.isInteger(n) && n >= 0 && n <= 9);
let storageAvailable = true;
function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { storageAvailable = false; $('save-status').textContent = '浏览器未允许保存'; return false; }
}
let settings = { conflicts: true, highlight: true, cleanNotes: true, ...read(SETTINGS_KEY, {}) };
const storedStats = read(STATS_KEY, {});
let stats = { records: Array.isArray(storedStats?.records) ? storedStats.records.filter(r => r && typeof r.id === 'string' && DIFFICULTIES.some(d => d.id === r.difficulty) && Number.isFinite(r.elapsed) && r.elapsed >= 0).slice(-2000) : [] };
let game;
let selected = -1;
let noteMode = false;
let history = [];
let hinted = -1;
let lastTick = Date.now();
let toastTimeout;
let confirmResolve;
const cells = [];
const digitButtons = [];

function toast(message) {
  clearTimeout(toastTimeout);
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  toastTimeout = setTimeout(() => $('toast').classList.remove('visible'), 3200);
}
function timeLabel(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor(total / 60) % 60;
  const s = total % 60;
  return `${h ? `${h}:` : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function save() {
  if (!game) return;
  write(GAME_KEY, { version: 1, ...game, selected, history: history.slice(-80) });
}
function newSeed() {
  return Array.from(crypto.getRandomValues(new Uint32Array(2)), n => n.toString(36)).join('');
}
function sameHouse(a, b) {
  return Math.floor(a / 9) === Math.floor(b / 9) || a % 9 === b % 9 ||
    (Math.floor(a / 27) === Math.floor(b / 27) && Math.floor(a % 9 / 3) === Math.floor(b % 9 / 3));
}
function edited() { return !game.completed && game.board.some((n, i) => n !== game.puzzle[i]) || !game.completed && game.notes.some(n => n.length); }
function makeGame(seed, difficulty, mode = 'classic') {
  const generated = generatePuzzle(seed, difficulty);
  game = { ...generated, board: [...generated.puzzle], notes: emptyNotes(), mode, elapsed: 0, paused: false, completed: false, hints: 0, roundId: `${Date.now()}-${newSeed()}` };
  history = [];
  hinted = -1;
  selected = game.board.indexOf(0);
  noteMode = false;
  lastTick = Date.now();
  // The address always represents the current puzzle, so copying the address also works.
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('p', seed);
  url.searchParams.set('d', difficulty);
  if (mode === 'daily') url.searchParams.set('daily', '1');
  window.history.replaceState(null, '', url);
  render();
  save();
}
function restore(saved) {
  if (!saved || saved.version !== 1 || typeof saved.seed !== 'string' || saved.seed.length > 80 || !DIFFICULTIES.some(d => d.id === saved.difficulty) || !validDigits(saved.board)) return false;
  const generated = generatePuzzle(saved.seed, saved.difficulty);
  if (generated.puzzle.some((n, i) => n && n !== saved.board[i])) return false;
  const validNotes = n => Array.isArray(n) && n.length === 81 && n.every(list => Array.isArray(list) && list.every(d => Number.isInteger(d) && d >= 1 && d <= 9));
  game = { ...generated, board: saved.board, notes: validNotes(saved.notes) ? saved.notes : emptyNotes(), mode: saved.mode === 'daily' ? 'daily' : 'classic', elapsed: Number.isFinite(saved.elapsed) ? Math.max(0, saved.elapsed) : 0, paused: !!saved.paused, completed: isComplete(saved.board), hints: Number.isInteger(saved.hints) ? Math.max(0, saved.hints) : 0, roundId: typeof saved.roundId === 'string' ? saved.roundId : newSeed() };
  selected = Number.isInteger(saved.selected) && saved.selected >= 0 && saved.selected < 81 ? saved.selected : game.board.indexOf(0);
  history = Array.isArray(saved.history) ? saved.history.filter(h => validDigits(h.board) && !generated.puzzle.some((n, i) => n && n !== h.board[i]) && validNotes(h.notes)).slice(-80) : [];
  render();
  return true;
}

function createBoard() {
  for (let row = 0; row < 9; row++) {
    const rowElement = document.createElement('div');
    rowElement.className = 'board-row';
    rowElement.setAttribute('role', 'row');
    for (let col = 0; col < 9; col++) {
      const index = row * 9 + col;
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('aria-rowindex', String(row + 1));
      cell.setAttribute('aria-colindex', String(col + 1));
      cell.dataset.index = index;
      cell.addEventListener('click', () => {
        if (game.paused || game.completed) return;
        selected = index;
        hinted = -1;
        renderBoard();
      });
      cells.push(cell);
      rowElement.append(cell);
    }
    $('board').append(rowElement);
  }
  for (let n = 1; n <= 9; n++) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'number-button';
    button.innerHTML = `${n}<small>剩余 9</small>`;
    button.addEventListener('click', () => input(n));
    digitButtons.push(button);
    $('number-pad').append(button);
  }
}
function renderBoard() {
  const conflicts = settings.conflicts ? getConflicts(game.board) : new Set();
  const value = game.board[selected];
  cells.forEach((cell, i) => {
    const n = game.board[i];
    cell.className = 'cell';
    if (game.puzzle[i]) cell.classList.add('given');
    if (settings.highlight && selected >= 0 && sameHouse(i, selected)) cell.classList.add('related');
    if (settings.highlight && value && n === value) cell.classList.add('same');
    if (i === selected) cell.classList.add('selected');
    if (conflicts.has(i)) cell.classList.add('conflict');
    if (i === hinted) cell.classList.add('hinted');
    cell.tabIndex = i === selected || selected < 0 && i === 0 ? 0 : -1;
    cell.setAttribute('aria-selected', String(i === selected));
    cell.setAttribute('aria-readonly', String(!!game.puzzle[i]));
    const noteText = game.notes[i].length ? `，笔记 ${game.notes[i].join('、')}` : '';
    cell.setAttribute('aria-label', `第${Math.floor(i / 9) + 1}行第${i % 9 + 1}列，${n ? `${n}${game.puzzle[i] ? '，题目数字' : ''}` : `空格${noteText}`}${conflicts.has(i) ? '，数字冲突' : ''}`);
    if (n) cell.textContent = n;
    else if (game.notes[i].length) cell.innerHTML = `<span class="notes-grid" aria-hidden="true">${Array.from({ length: 9 }, (_, k) => `<span>${game.notes[i].includes(k + 1) ? k + 1 : ''}</span>`).join('')}</span>`;
    else cell.textContent = '';
  });
  const filled = game.board.filter(Boolean).length;
  $('progress-text').textContent = `已填 ${filled} / 81 格`;
  $('progress-fill').style.width = `${filled / 81 * 100}%`;
  digitButtons.forEach((button, i) => {
    const left = Math.max(0, 9 - game.board.filter(n => n === i + 1).length);
    button.querySelector('small').textContent = left ? `剩余 ${left}` : '已填满';
    button.setAttribute('aria-label', `填入数字 ${i + 1}，剩余 ${left} 个`);
    button.classList.toggle('complete', left === 0);
    button.disabled = game.paused || game.completed;
  });
  $('undo-button').disabled = !history.length || game.paused || game.completed;
  $('erase-button').disabled = game.paused || game.completed || selected < 0 || !!game.puzzle[selected] || !game.board[selected] && !game.notes[selected].length;
  $('hint-button').disabled = game.paused || game.completed;
  $('notes-button').disabled = game.paused || game.completed;
}
function render() {
  renderBoard();
  const difficulty = DIFFICULTIES.find(d => d.id === game.difficulty);
  const daily = game.mode === 'daily';
  $('game-title').textContent = daily ? `${game.seed.slice(5).replace('-', '月')}日 · 每日挑战` : '经典数独';
  $('difficulty-badge').textContent = difficulty.label;
  $('difficulty-description').textContent = difficulty.description;
  $('mode-kicker').textContent = daily ? 'DAILY CHALLENGE' : 'CLASSIC SUDOKU';
  $('mode-heading').textContent = daily ? '同一道题，不同的灵感。' : '每一格，都有可能。';
  $('new-game-button').querySelector('span').textContent = daily ? '再来一局经典数独' : '开始新的一局';
  $('nav-classic').classList.toggle('active', !daily);
  $('nav-daily').classList.toggle('active', daily);
  document.querySelectorAll('[data-difficulty]').forEach(button => {
    const active = button.dataset.difficulty === game.difficulty;
    button.classList.toggle('selected', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $('timer').textContent = timeLabel(game.elapsed);
  $('pause-button').setAttribute('aria-label', game.paused ? '继续游戏' : '暂停游戏');
  $('pause-button').title = game.paused ? '继续游戏' : '暂停游戏';
  $('pause-button').innerHTML = icon(game.paused ? 'play' : 'pause');
  $('pause-button').disabled = game.completed;
  $('pause-overlay').hidden = !game.paused && !game.completed;
  $('pause-title').textContent = game.completed ? '你解开了这一局。' : '休息一下，也很好。';
  $('pause-description').textContent = game.completed ? `用时 ${timeLabel(game.elapsed)}，每一点专注都算数。` : '你的进度已经好好保存。';
  $('resume-button').innerHTML = game.completed ? `${icon('arrow')}开始新的一局` : `${icon('play')}继续游戏`;
  renderNoteMode();
  if (!storageAvailable) $('save-status').textContent = '浏览器未允许保存';
}
function renderNoteMode() {
  $('notes-button').setAttribute('aria-pressed', String(noteMode));
  $('notes-state').textContent = noteMode ? '开' : '关';
  $('input-mode-label').textContent = noteMode ? '笔记模式 · 记录候选数字' : '填写模式';
  $('number-pad').classList.toggle('notes-mode', noteMode);
}
function snapshot() {
  history.push({ board: [...game.board], notes: game.notes.map(n => [...n]) });
  if (history.length > 100) history.shift();
}
function cleanPeerNotes(index, n) {
  if (settings.cleanNotes) game.notes.forEach((notes, i) => { if (sameHouse(i, index)) game.notes[i] = notes.filter(d => d !== n); });
}
function input(n) {
  if (game.paused || game.completed) return;
  if (selected < 0) { toast('先选择棋盘中的一个空格'); return; }
  if (game.puzzle[selected]) { toast('这是题目给出的数字，试试选择一个空格'); return; }
  if (noteMode) {
    if (game.board[selected]) { toast('擦除当前数字后，就可以记笔记了'); return; }
    snapshot();
    const notes = game.notes[selected];
    game.notes[selected] = notes.includes(n) ? notes.filter(d => d !== n) : [...notes, n].sort((a, b) => a - b);
  } else {
    if (game.board[selected] === n) return;
    snapshot();
    game.board[selected] = n;
    game.notes[selected] = [];
    cleanPeerNotes(selected, n);
  }
  hinted = -1;
  renderBoard();
  save();
  if (isComplete(game.board)) complete();
  else if (!game.board.includes(0)) toast('还有数字发生冲突，检查一下高亮的格子吧');
}
function erase() {
  if (game.paused || game.completed || selected < 0 || game.puzzle[selected] || !game.board[selected] && !game.notes[selected].length) return;
  snapshot();
  game.board[selected] = 0;
  game.notes[selected] = [];
  hinted = -1;
  renderBoard(); save();
}
function undo() {
  if (!history.length || game.paused || game.completed) return;
  const previous = history.pop();
  game.board = previous.board;
  game.notes = previous.notes;
  hinted = -1;
  renderBoard(); save();
}
function togglePause() {
  if (game.completed) return;
  tick();
  game.paused = !game.paused;
  lastTick = Date.now();
  render(); save();
}
function tick() {
  const now = Date.now();
  if (game && !game.paused && !game.completed && !document.hidden && !$('dialog').open) game.elapsed += Math.max(0, now - lastTick);
  lastTick = now;
  if (game) $('timer').textContent = timeLabel(game.elapsed);
}

function closeDialog() { $('dialog').close(); }
function openDialog(title, body, actions = [{ label: '知道了', primary: true }], kicker = 'A LITTLE MOMENT') {
  if ($('dialog').open) closeDialog();
  tick();
  $('dialog-title').textContent = title;
  $('dialog-kicker').textContent = kicker;
  $('dialog-body').innerHTML = body;
  $('dialog-actions').replaceChildren();
  actions.forEach(action => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = action.primary ? 'primary-button' : 'secondary-button';
    button.textContent = action.label;
    button.addEventListener('click', () => { closeDialog(); action.run?.(); });
    $('dialog-actions').append(button);
  });
  $('dialog').showModal();
}
function confirmChange(title, message) {
  return new Promise(resolve => {
    openDialog(title, `<p>${message}</p><p>这会替换当前这一局的进度。</p>`, [{ label: '继续这一局', run: () => resolve(false) }, { label: '确认开始', primary: true, run: () => resolve(true) }]);
    confirmResolve = resolve;
  });
}
async function startNew(difficulty = game.difficulty, mode = 'classic') {
  const seed = mode === 'daily' ? dailySeed() : newSeed();
  if (mode === 'daily' && game.mode === 'daily' && game.seed === seed && game.difficulty === difficulty) {
    if (game.paused) togglePause();
    toast('这就是今天的挑战，每天零点更新');
    return;
  }
  if (edited() && !await confirmChange(mode === 'daily' ? '来试试今日挑战？' : '开启一局新的思考？', '新题已经准备好。')) return;
  makeGame(seed, difficulty, mode);
  toast(mode === 'daily' ? '今日挑战已开始，朋友打开也会是同一道题' : '新的一局，从最有把握的地方开始');
}
async function restart() {
  if (edited() || game.completed) {
    if (!await confirmChange('重新认识这道题？', '棋盘和计时会回到最初。')) return;
  }
  makeGame(game.seed, game.difficulty, game.mode);
  toast('已重新开始这道题');
}
async function hint() {
  if (game.paused || game.completed) return;
  let target = selected >= 0 && !game.puzzle[selected] && game.board[selected] !== game.solution[selected] ? selected : game.board.findIndex((n, i) => n !== game.solution[i]);
  if (target < 0) return;
  // A reveal is a deliberate assist and is kept in the game record, including after undo.
  const candidates = getCandidates(game.board, target);
  snapshot();
  game.board[target] = game.solution[target];
  game.notes[target] = [];
  cleanPeerNotes(target, game.solution[target]);
  game.hints++;
  selected = target;
  hinted = target;
  renderBoard(); save();
  toast(candidates.length === 1 && candidates[0] === game.solution[target] ? `这一格只有一个候选数字：${game.solution[target]}` : `已为你揭晓一格：${game.solution[target]}。慢慢来。`);
  if (isComplete(game.board)) complete();
}
function complete() {
  tick();
  game.completed = true;
  game.paused = false;
  if (!stats.records.some(r => r.id === game.roundId)) {
    stats.records.push({ id: game.roundId, puzzle: `${game.seed}:${game.difficulty}`, difficulty: game.difficulty, elapsed: game.elapsed, hints: game.hints, date: dailySeed(), daily: game.mode === 'daily' });
    if (stats.records.length > 2000) stats.records.shift();
    write(STATS_KEY, stats);
  }
  render(); save();
  openDialog('把这一刻，留给自己。', `<div class="win-mark">${icon('check')}</div><div class="win-summary"><strong>${timeLabel(game.elapsed)}</strong><p>你解开了这道${DIFFICULTIES.find(d => d.id === game.difficulty).label}数独。<br>${game.hints ? `用了 ${game.hints} 次提示，每一步都是进步。` : '独立完成，给这份专注一个小小的掌声。'}</p></div>`, [{ label: '分享同一道题', run: share }, { label: '再来一局', primary: true, run: () => startNew() }], 'A LITTLE VICTORY');
}
function showRules() {
  openDialog('从一格，找到头绪。', `<p>数独的规则很简单，乐趣藏在每一次推理中。</p><ol class="rule-list"><li>在空格填入 <strong>1–9</strong>。</li><li>每一<strong>行</strong>、每一<strong>列</strong>，数字不能重复。</li><li>每一个 <strong>3 × 3 宫格</strong>，数字也各出现一次。</li></ol><p>不确定时，打开「笔记」记录候选数字。红色表示同一行、列或宫内有重复数字。每道题都有唯一解。</p><p><kbd>1</kbd> – <kbd>9</kbd> 填数 · 方向键移动<br><kbd>N</kbd> 笔记 · <kbd>Backspace</kbd> 擦除<br><kbd>Ctrl / ⌘ + Z</kbd> 撤销 · <kbd>Space</kbd> 暂停</p>`, [{ label: '开始我的思考', primary: true }], 'HOW TO PLAY');
}
function showSettings() {
  const rows = [ ['conflicts', '标出冲突数字', '提醒同一行、列或宫格内的重复数字'], ['highlight', '高亮关联区域', '照亮当前行、列、宫格和相同数字'], ['cleanNotes', '自动清理笔记', '填入数字时，移除关联格子的相同笔记'] ];
  openDialog('按你的节奏来。', rows.map(([key, title, description]) => `<label class="settings-row"><span><strong>${title}</strong><small>${description}</small></span><input type="checkbox" data-setting="${key}" ${settings[key] ? 'checked' : ''}></label>`).join('') + '<p>游戏进度和记录保存在当前浏览器中。</p>', [{ label: '设置好了', primary: true }], 'YOUR PREFERENCES');
  document.querySelectorAll('[data-setting]').forEach(input => input.addEventListener('change', () => { settings[input.dataset.setting] = input.checked; write(SETTINGS_KEY, settings); renderBoard(); }));
}
function showStats() {
  const records = stats.records;
  const days = [...new Set(records.map(r => r.date))].sort().reverse();
  let streak = 0;
  const cursor = new Date(`${dailySeed()}T12:00:00+08:00`);
  if (!days.includes(dailySeed(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  while (days.includes(dailySeed(cursor))) { streak++; cursor.setUTCDate(cursor.getUTCDate() - 1); }
  openDialog('每一点专注，都算数。', `<div class="stats-summary"><div><strong>${records.length}</strong><small>完成局数</small></div><div><strong>${streak}</strong><small>连续天数</small></div><div><strong>${records.filter(r => !r.hints).length}</strong><small>独立完成</small></div></div><table class="stats-table"><thead><tr><th>难度</th><th>完成</th><th>独立完成最佳用时</th></tr></thead><tbody>${DIFFICULTIES.map(d => {
    const all = records.filter(r => r.difficulty === d.id);
    const independent = all.filter(r => !r.hints);
    return `<tr><td>${d.label}</td><td>${all.length}</td><td>${independent.length ? timeLabel(Math.min(...independent.map(r => r.elapsed))) : '—'}</td></tr>`;
  }).join('')}</tbody></table><p>记录保存在当前浏览器，使用提示的局数会单独标记。难度按已知数字的多少分级。</p>`, [{ label: '继续积累一点点', primary: true }], 'YOUR LITTLE ACHIEVEMENTS');
}
async function share() {
  const url = new URL(location.href);
  const title = `数独之间 · ${DIFFICULTIES.find(d => d.id === game.difficulty).label}挑战`;
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ title, text: '给专注一点时间。来和我解同一道数独吧！', url: url.href }); return; } catch (error) { if (error.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(url.href); toast('题目链接已复制，发给朋友就能一起挑战'); }
  catch {
    openDialog('把这道题，分享出去。', '<p>复制下面的链接，朋友打开就会遇见同一道题。每个人的进度独立保存。</p><input class="share-input" id="share-url" readonly aria-label="题目分享链接">', [{ label: '完成', primary: true }], 'SHARE A LITTLE CHALLENGE');
    $('share-url').value = url.href;
    $('share-url').focus(); $('share-url').select();
  }
}

function bindEvents() {
  $('undo-button').addEventListener('click', undo);
  $('erase-button').addEventListener('click', erase);
  $('notes-button').addEventListener('click', () => { noteMode = !noteMode; renderNoteMode(); });
  $('hint-button').addEventListener('click', hint);
  $('pause-button').addEventListener('click', togglePause);
  $('resume-button').addEventListener('click', () => game.completed ? startNew() : togglePause());
  $('new-game-button').addEventListener('click', () => startNew());
  $('restart-button').addEventListener('click', restart);
  $('nav-classic').addEventListener('click', () => { if (game.mode !== 'classic') startNew(game.difficulty); });
  $('nav-daily').addEventListener('click', () => startNew('medium', 'daily'));
  $('daily-card').addEventListener('click', () => startNew('medium', 'daily'));
  $('nav-rules').addEventListener('click', showRules);
  $('bottom-rules').addEventListener('click', showRules);
  $('stats-button').addEventListener('click', showStats);
  $('settings-button').addEventListener('click', showSettings);
  $('share-button').addEventListener('click', share);
  $('dialog-close').addEventListener('click', closeDialog);
  $('dialog').addEventListener('click', event => { if (event.target === $('dialog')) { const r = $('dialog').getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeDialog(); } });
  $('dialog').addEventListener('close', () => { lastTick = Date.now(); if (confirmResolve) { confirmResolve(false); confirmResolve = null; } });
  document.querySelectorAll('[data-difficulty]').forEach(button => button.addEventListener('click', () => { if (game.difficulty !== button.dataset.difficulty) startNew(button.dataset.difficulty, game.mode); }));
  document.addEventListener('keydown', event => {
    if ($('dialog').open || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(); return; }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.code === 'Space' && (event.target === document.body || event.target.closest('#board'))) { event.preventDefault(); togglePause(); return; }
    if (game.paused || game.completed) return;
    if (/^[1-9]$/.test(event.key)) { event.preventDefault(); input(Number(event.key)); }
    else if (['Backspace', 'Delete', '0'].includes(event.key)) { event.preventDefault(); erase(); }
    else if (event.key.toLowerCase() === 'n') { event.preventDefault(); noteMode = !noteMode; renderNoteMode(); }
    else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      if (selected < 0) selected = 0;
      const row = Math.floor(selected / 9), col = selected % 9;
      if (event.key === 'ArrowUp') selected = (row + 8) % 9 * 9 + col;
      if (event.key === 'ArrowDown') selected = (row + 1) % 9 * 9 + col;
      if (event.key === 'ArrowLeft') selected = row * 9 + (col + 8) % 9;
      if (event.key === 'ArrowRight') selected = row * 9 + (col + 1) % 9;
      renderBoard(); cells[selected].focus();
    }
  });
  document.addEventListener('visibilitychange', () => {
    const now = Date.now();
    if (document.hidden && !game.paused && !game.completed && !$('dialog').open) game.elapsed += Math.max(0, now - lastTick);
    lastTick = now;
    save();
  });
  window.addEventListener('pagehide', () => { tick(); save(); });
  setInterval(() => { tick(); save(); }, 1000);
}

function init() {
  $('today-date').textContent = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
  createBoard();
  // Keep the keypad beside the board on desktop and directly underneath on phones.
  const compactScreen = matchMedia('(max-width: 740px)');
  const placeKeypad = () => {
    if (compactScreen.matches) $('mobile-number-pad').append($('number-pad'));
    else document.querySelector('.game-card').insertBefore($('number-pad'), document.querySelector('.card-actions'));
  };
  placeKeypad();
  compactScreen.addEventListener('change', placeKeypad);
  bindEvents();
  const params = new URL(location.href).searchParams;
  const seed = params.get('p');
  const difficulty = params.get('d');
  const saved = read(GAME_KEY, null);
  const hasShared = seed && seed.length <= 80 && DIFFICULTIES.some(d => d.id === difficulty);
  if (hasShared) {
    if (!saved || saved.seed !== seed || saved.difficulty !== difficulty || !restore(saved)) makeGame(seed, difficulty, params.get('daily') === '1' && /^\d{4}-\d{2}-\d{2}$/.test(seed) ? 'daily' : 'classic');
  } else if (restore(saved)) {
    const url = new URL(location.href); url.search = ''; url.searchParams.set('p', game.seed); url.searchParams.set('d', game.difficulty); if (game.mode === 'daily') url.searchParams.set('daily', '1'); window.history.replaceState(null, '', url);
  } else makeGame(newSeed(), 'easy');
}

try { init(); } catch (error) {
  console.error('Sudoku initialization failed:', error);
  $('board').innerHTML = '<p class="fatal-message">棋盘暂时没有准备好，请刷新页面重试。</p>';
  toast('加载失败，请刷新页面重试');
}
