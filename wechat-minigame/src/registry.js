'use strict';

// Shared metadata for the hub and controller. An entry becomes ready only after
// openGame() has an implemented module to launch; metadata alone cannot load it.
const GAMES = Object.freeze([
  Object.freeze({
    id: 'sudoku',
    title: '数独',
    subtitle: '每一格，都有可能。',
    status: 'ready',
  }),
  Object.freeze({
    id: 'gold-miner',
    title: '黄金矿工',
    subtitle: '瞄准快乐，满载而归。',
    status: 'soon',
  }),
  Object.freeze({
    id: 'zuma',
    title: 'Zuma',
    subtitle: '连起同色，消除烦恼。',
    status: 'soon',
  }),
]);

function getGame(id) {
  return GAMES.find(game => game.id === id) || null;
}

module.exports = { GAMES, getGame };
