// Browser-only wx adapter for testing the same Canvas modules on a local page.
(() => {
  const canvas = document.querySelector('#game');
  const phone = document.querySelector('.phone');
  const modal = document.querySelector('#modal');
  const handlers = new Map();
  const emit = (name, value = {}) => { for (const fn of handlers.get(name) || []) fn(value); };
  let cancelModal = null;
  // Accessible controls share the native renderer's exact hit regions. They
  // dispatch native touch events, so local browser QA follows the real path.
  window.onNativeRender = ({ screen, targets, game }) => {
    const layer = document.querySelector('.targets'); layer.replaceChildren();
    const names = { home: '返回大厅', openGame: '进入', resumeGame: '继续', comingSoon: '敬请期待', select: '选择格子',
      difficulty: '难度', mode: '模式', pause: '暂停或继续', digit: '输入', undo: '撤销', erase: '擦除', notes: '笔记',
      autoNotes: '填全笔记', hint: '提示', newGame: '新的一局', share: '分享', more: '更多' };
    const labels = { sudoku: '数独', 'gold-miner': '黄金矿工', zuma: 'Zuma', easy: '简单', medium: '中等', hard: '困难', expert: '专家', classic: '经典', daily: '每日' };
    for (const target of targets) {
      const button = document.createElement('button'); button.type = 'button';
      button.setAttribute('aria-label', `${names[target.action] || target.action}${target.payload === undefined ? '' : ` ${labels[target.payload] || target.payload}`}`);
      Object.assign(button.style, { left: `${target.x}px`, top: `${target.y}px`, width: `${target.w}px`, height: `${target.h}px` });
      button.onclick = () => { const point = { clientX: target.x + target.w / 2, clientY: target.y + target.h / 2 }; emit('TouchStart', { touches: [point], changedTouches: [point] }); };
      layer.append(button);
    }
    document.querySelector('#game-status').textContent = screen === 'home' ? '游戏大厅' :
      `数独 · 已填 ${game.board.filter(Boolean).length}/81 · 笔记 ${game.notes.reduce((n, list) => n + list.length, 0)} 个 · ${game.paused ? '已暂停' : game.completed ? '已完成' : '进行中'}`;
  };
  function showDialog(title, content, buttons) {
    if (modal.open) modal.close();
    modal.querySelector('h2').textContent = title;
    const body = modal.querySelector('section'); body.replaceChildren();
    if (typeof content === 'string') { const p = document.createElement('p'); p.textContent = content; body.append(p); }
    else if (content) body.append(content);
    const actions = modal.querySelector('.buttons'); actions.replaceChildren();
    for (const { text, primary, onClick } of buttons) {
      const button = document.createElement('button'); button.textContent = text;
      if (primary) button.className = 'primary';
      button.onclick = () => { modal.close(); cancelModal = null; onClick(); };
      actions.append(button);
    }
    modal.showModal();
  }
  modal.addEventListener('cancel', event => { event.preventDefault(); modal.close(); if (cancelModal) cancelModal(); cancelModal = null; });
  const query = () => Object.fromEntries(new URLSearchParams(location.search));
  const wx = {
    createCanvas: () => canvas,
    getWindowInfo() {
      const width = phone.clientWidth, height = phone.clientHeight;
      return { windowWidth: width, windowHeight: height, pixelRatio: window.devicePixelRatio,
        statusBarHeight: 44, safeArea: { top: 44, bottom: height - 24, left: 0, right: width } };
    },
    getMenuButtonBoundingClientRect() { const width = phone.clientWidth; return { left: width - 100, right: width - 10, top: 50, bottom: 82, width: 90, height: 32 }; },
    getLaunchOptionsSync: () => ({ query: query() }),
    getStorageSync(key) { const value = localStorage.getItem(`wx-preview:${key}`); return value ? JSON.parse(value) : ''; },
    setStorageSync(key, value) { localStorage.setItem(`wx-preview:${key}`, JSON.stringify(value)); },
    showShareMenu() {},
    shareAppMessage(payload) {
      const input = document.createElement('textarea'); input.readOnly = true;
      input.value = `${location.origin}${location.pathname}?${payload.query}`;
      const content = document.createElement('div');
      const label = document.createElement('p'); label.textContent = '本地预览链接，仅供当前设备调试。正式小游戏的分享需要在微信中验证。';
      content.append(label, input);
      showDialog(payload.title, content, [{ text: '关闭', primary: true, onClick() {} }]);
      input.select();
    },
    showModal(config) {
      const finish = confirm => { config.success?.({ confirm, cancel: !confirm }); config.complete?.(); };
      const buttons = [];
      if (config.showCancel !== false) buttons.push({ text: config.cancelText || '取消', onClick: () => finish(false) });
      buttons.push({ text: config.confirmText || '确定', primary: true, onClick: () => finish(true) });
      showDialog(config.title, config.content, buttons); cancelModal = () => finish(false);
    },
    showActionSheet(config) {
      const list = document.createElement('div'); list.className = 'sheet';
      const done = index => { modal.close(); cancelModal = null; config.success?.({ tapIndex: index }); config.complete?.(); };
      config.itemList.forEach((text, index) => { const button = document.createElement('button'); button.textContent = text; button.onclick = () => done(index); list.append(button); });
      const cancel = () => { config.fail?.({ errMsg: 'showActionSheet:fail cancel' }); config.complete?.(); };
      showDialog('更多', list, [{ text: '取消', onClick: cancel }]); cancelModal = cancel;
    },
  };
  for (const name of ['TouchStart', 'Hide', 'Show', 'WindowResize', 'ShareAppMessage']) {
    wx[`on${name}`] = callback => { if (!handlers.has(name)) handlers.set(name, new Set()); handlers.get(name).add(callback); };
    wx[`off${name}`] = callback => handlers.get(name)?.delete(callback);
  }
  canvas.addEventListener('pointerdown', event => {
    const box = canvas.getBoundingClientRect();
    const point = { clientX: event.clientX - box.left, clientY: event.clientY - box.top };
    emit('TouchStart', { touches: [point], changedTouches: [point] });
  });
  window.addEventListener('resize', () => emit('WindowResize'));
  document.addEventListener('visibilitychange', () => emit(document.hidden ? 'Hide' : 'Show'));
  window.addEventListener('pagehide', () => emit('Hide'));
  window.wx = wx;
})();
