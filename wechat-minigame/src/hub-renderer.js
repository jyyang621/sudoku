'use strict';

const PALETTE = Object.freeze({
  background: '#f8f9f5', paper: '#ffffff', ink: '#263c35', muted: '#88918b',
  green: '#36594e', pale: '#eaf0e8', line: '#e1e7dc', moss: '#9fb68d'
});
const FONT = '"PingFang SC", "Microsoft YaHei", sans-serif';
const DEFAULT_GAMES = [
  { id: 'sudoku', title: '数独', subtitle: '在数字之间，找回专注的乐趣', status: 'ready', icon: 'sudoku' },
  { id: 'gold-miner', title: '黄金矿工', subtitle: '下一次出钩，会有怎样的惊喜？', status: 'soon', icon: 'gold' },
  { id: 'zuma', title: 'Zuma', subtitle: '让彩球相遇，让快乐连成一串', status: 'soon', icon: 'zuma' }
];

function rect(x, y, w, h) { return { x, y, w, h }; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function cardRects(area, count, landscape, gap) {
  if (landscape) {
    const width = (area.w - gap * (count - 1)) / count;
    return Array.from({ length: count }, (_, i) => rect(area.x + i * (width + gap), area.y, width, area.h));
  }
  const available = area.h - gap * (count - 1);
  const first = count === 1 ? available : available * (count === 3 ? 0.42 : 0.56);
  const rest = count > 1 ? (available - first) / (count - 1) : 0;
  return Array.from({ length: count }, (_, i) => i === 0
    ? rect(area.x, area.y, area.w, first)
    : rect(area.x, area.y + first + gap + (i - 1) * (rest + gap), area.w, rest));
}

/** Logical-pixel layout; the caller supplies edge safe-area insets. */
function createHubLayout(width, height, safeTop = 0, safeBottom = 0, capsuleRect = null) {
  const w = Math.max(240, Number(width) || 375);
  const h = Math.max(240, Number(height) || 667);
  const topInset = clamp(Number(safeTop) || 0, 0, h / 3);
  const bottomInset = clamp(Number(safeBottom) || 0, 0, h / 3);
  const landscape = w > h * 1.15;
  const compact = h - topInset - bottomInset < 650;
  const margin = w <= 340 ? 16 : 22;
  const mainWidth = Math.min(w - margin * 2, landscape ? 980 : 620);
  const x = (w - mainWidth) / 2;
  const top = topInset + 12;
  const bottom = h - bottomInset - 10;
  const headerHeight = landscape ? 60 : compact ? 74 : 98;
  const sectionHeight = landscape ? 22 : 26;
  const resumeHeight = landscape ? 42 : compact ? 58 : 70;
  const footerHeight = 22;
  const gap = compact ? 8 : 12;
  const resumeGap = compact ? 10 : 16;
  const header = rect(x, top, mainWidth, headerHeight);
  const section = rect(x, header.y + header.h, mainWidth, sectionHeight);
  const footer = rect(x, bottom - footerHeight, mainWidth, footerHeight);
  const resume = rect(x, footer.y - 8 - resumeHeight, mainWidth, resumeHeight);
  const cardTop = section.y + section.h;
  const maximumCardSpace = landscape ? 340 : 580;
  const availableCardSpace = Math.max(54, resume.y - resumeGap - cardTop);
  const cardSpace = Math.min(maximumCardSpace, availableCardSpace);
  const breathingRoom = Math.max(0, availableCardSpace - cardSpace);
  const cardArea = rect(x, cardTop + Math.min(breathingRoom * 0.2, 18), mainWidth, cardSpace);
  const layout = {
    width: w, height: h, safeTop: topInset, safeBottom: bottomInset,
    capsuleRect, compact, landscape, header, section, cardArea, resume, footer,
    gap, cards: cardRects(cardArea, 3, landscape, gap), targets: []
  };
  return layout;
}

function roundedPath(ctx, r, radius) {
  const corner = Math.max(0, Math.min(radius, r.w / 2, r.h / 2));
  const { x, y, w, h } = r;
  ctx.beginPath();
  ctx.moveTo(x + corner, y);
  ctx.lineTo(x + w - corner, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + corner);
  ctx.lineTo(x + w, y + h - corner);
  ctx.quadraticCurveTo(x + w, y + h, x + w - corner, y + h);
  ctx.lineTo(x + corner, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - corner);
  ctx.lineTo(x, y + corner);
  ctx.quadraticCurveTo(x, y, x + corner, y);
  ctx.closePath();
}

function box(ctx, area, fill, stroke, radius = 12, lineWidth = 1) {
  roundedPath(ctx, area, radius);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}

function text(ctx, value, x, y, size, color, align = 'left', weight = '400') {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(String(value), x, y);
}

function fitText(ctx, value, x, y, maxWidth, size, color, weight = '400') {
  let content = String(value || '');
  ctx.font = `${weight} ${size}px ${FONT}`;
  if (ctx.measureText(content).width > maxWidth) {
    while (content.length > 0 && ctx.measureText(`${content}…`).width > maxWidth) content = content.slice(0, -1);
    content += '…';
  }
  text(ctx, content, x, y, size, color, 'left', weight);
}

function circle(ctx, x, y, radius, fill, stroke, lineWidth = 1) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}

function line(ctx, x1, y1, x2, y2, stroke, width = 1.5) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
  ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.stroke();
}

function arrow(ctx, x, y, color, size = 12) {
  line(ctx, x - size / 2, y, x + size / 2, y, color, 1.5);
  line(ctx, x + size / 2 - 4, y - 4, x + size / 2, y, color, 1.5);
  line(ctx, x + size / 2 - 4, y + 4, x + size / 2, y, color, 1.5);
}

function sudokuArt(ctx, cx, cy, size, light = true) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.12);
  const unit = size / 3;
  const stroke = light ? 'rgba(239,246,230,0.6)' : '#8ca77b';
  const fill = light ? 'rgba(245,249,239,0.10)' : '#e8f0e1';
  box(ctx, rect(-size / 2, -size / 2, size, size), fill, stroke, 7, 1.5);
  for (let n = 1; n <= 2; n += 1) {
    line(ctx, -size / 2 + unit * n, -size / 2, -size / 2 + unit * n, size / 2, stroke, 1);
    line(ctx, -size / 2, -size / 2 + unit * n, size / 2, -size / 2 + unit * n, stroke, 1);
  }
  [[0, 0, 2], [1, 1, 5], [2, 0, 9], [2, 2, 6], [0, 2, 1]].forEach(item => {
    text(ctx, item[2], -size / 2 + unit * (item[0] + 0.5),
      -size / 2 + unit * (item[1] + 0.5), unit * 0.56,
      light ? '#e5efd9' : '#6c885c', 'center', '500');
  });
  ctx.restore();
}

function goldArt(ctx, cx, cy, size) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(size / 100, size / 100);
  // A compact mine cart, with hand-drawn faceted gold rather than an image.
  line(ctx, -41, 37, 42, 37, '#d8cba9', 2);
  ctx.beginPath(); ctx.moveTo(-33, 3); ctx.lineTo(33, 3); ctx.lineTo(25, 28); ctx.lineTo(-24, 28); ctx.closePath();
  ctx.fillStyle = '#b4a17b'; ctx.fill();
  line(ctx, -30, 8, 30, 8, '#cdbb96', 3);
  circle(ctx, -18, 32, 6, '#817a62'); circle(ctx, 20, 32, 6, '#817a62');
  circle(ctx, -18, 32, 2, '#d9d1bd'); circle(ctx, 20, 32, 2, '#d9d1bd');
  const chunks = [[-25, -13, 23], [-3, -26, 28], [19, -12, 22]];
  chunks.forEach(chunk => {
    const [x, y, s] = chunk;
    ctx.beginPath(); ctx.moveTo(x - s * 0.4, y + s * 0.4); ctx.lineTo(x - s * 0.25, y - s * 0.2);
    ctx.lineTo(x + s * 0.25, y - s * 0.4); ctx.lineTo(x + s * 0.5, y + s * 0.25);
    ctx.lineTo(x + s * 0.1, y + s * 0.45); ctx.closePath();
    ctx.fillStyle = '#d6b768'; ctx.fill();
    line(ctx, x - s * 0.25, y - s * 0.2, x + s * 0.18, y + s * 0.08, '#ecd697', 2);
  });
  line(ctx, 33, -35, 33, -25, '#c3ad71', 1.5);
  line(ctx, 28, -30, 38, -30, '#c3ad71', 1.5);
  ctx.restore();
}

function zumaArt(ctx, cx, cy, size) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(size / 100, size / 100);
  ctx.beginPath(); ctx.moveTo(-39, 20); ctx.bezierCurveTo(-55, -40, 26, -54, 35, -1);
  ctx.bezierCurveTo(48, 38, -4, 44, -7, 13);
  ctx.strokeStyle = '#d8e3dc'; ctx.lineWidth = 12; ctx.lineCap = 'round'; ctx.stroke();
  const balls = [
    [-39, 19, '#a6ba87'], [-37, -7, '#d7b77f'], [-20, -27, '#8eafa3'],
    [6, -30, '#b29cbb'], [28, -15, '#c99b8c'], [36, 9, '#a6ba87'],
    [21, 29, '#d7b77f'], [-2, 25, '#8eafa3']
  ];
  balls.forEach(ball => {
    circle(ctx, ball[0], ball[1], 11, ball[2]);
    circle(ctx, ball[0] - 3, ball[1] - 4, 3, 'rgba(255,255,255,0.34)');
  });
  circle(ctx, -7, 4, 9, '#67896f');
  circle(ctx, -10, 0, 1.4, '#edf4e6'); circle(ctx, -4, 0, 1.4, '#edf4e6');
  ctx.restore();
}

function addTarget(targets, area, action, payload) {
  targets.push({ x: area.x, y: area.y, w: area.w, h: area.h, action, payload });
}

function drawBackground(ctx, layout) {
  ctx.fillStyle = PALETTE.background; ctx.fillRect(0, 0, layout.width, layout.height);
  ctx.save();
  circle(ctx, layout.width + 80, layout.height * 0.2, Math.min(layout.width * 0.65, 290), '#f0f3eb');
  circle(ctx, -100, layout.height * 0.77, 190, '#f2f4ee');
  ctx.restore();
}

function drawHeader(ctx, layout, ui) {
  const r = layout.header;
  const compact = layout.compact;
  const titleY = r.y + (layout.landscape ? 18 : 24);
  const cap = layout.capsuleRect;
  const capTop = cap && Number.isFinite(cap.top) ? cap.top : -1;
  const capBottom = cap && Number.isFinite(cap.bottom) ? cap.bottom : capTop + ((cap && cap.height) || 0);
  const capLeft = cap && Number.isFinite(cap.left) ? cap.left : layout.width;
  const titleWidth = (capTop < titleY + 18 && capBottom > titleY - 18 ? capLeft - 8 : r.x + r.w) - r.x;
  fitText(ctx, '游戏之间', r.x, titleY, Math.max(108, titleWidth), compact ? 29 : 34, PALETTE.ink, '500');
  const subtitleY = titleY + (layout.landscape ? 25 : 31);
  fitText(ctx, ui.subtitle || '给快乐，一点时间。', r.x, subtitleY, Math.max(110, titleWidth), 12, PALETTE.muted);
  // Small organic marks add personality without relying on emoji or assets.
  if (!layout.landscape && r.w > 360 && (!cap || capBottom < r.y + 56)) {
    const cx = r.x + r.w - 24;
    const cy = r.y + 46;
    box(ctx, rect(cx - 11, cy - 11, 22, 22), '#e3eadb', null, 7);
    circle(ctx, cx - 20, cy + 17, 5, '#c3d1b4');
    line(ctx, cx + 10, cy + 15, cx + 18, cy + 22, '#b6c7a4', 3);
  }
}

function drawCard(ctx, area, game, index, layout, targets) {
  const ready = game.status === 'ready';
  const gold = /gold|miner|黄金|矿/.test(`${game.id} ${game.icon} ${game.title}`);
  const zuma = /zuma|Zuma|祖玛/.test(`${game.id} ${game.icon} ${game.title}`);
  const background = ready ? (game.accent || '#36594e') : gold ? '#f2efe4' : '#eaf0eb';
  const border = ready ? null : gold ? '#e8e1ce' : '#dfe7df';
  const horizontal = layout.landscape;
  const tiny = !horizontal && area.h < 88;
  const pad = horizontal ? 15 : area.w < 340 ? 19 : 24;
  const titleColor = ready ? '#f5f8ee' : gold ? '#756640' : '#486657';
  const subtitleColor = ready ? '#c0d0bc' : gold ? '#a29778' : '#8b9f90';
  ctx.save();
  if (ready) {
    ctx.shadowColor = 'rgba(38,60,53,0.1)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 4;
  }
  box(ctx, area, background, border, 15);
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  roundedPath(ctx, area, 15); ctx.clip();
  if (horizontal) {
    circle(ctx, area.x + area.w - 7, area.y + area.h, 79,
      ready ? 'rgba(255,255,255,0.055)' : gold ? '#e9e3d1' : '#dde7df');
    const artSize = Math.min(65, area.h * 0.43);
    const artX = area.x + area.w - artSize * 0.56 - 8;
    const artY = area.y + area.h - artSize * 0.48 - 7;
    if (gold) goldArt(ctx, artX, artY, artSize);
    else if (zuma) zumaArt(ctx, artX, artY, artSize);
    else sudokuArt(ctx, artX, artY, artSize * 0.8, ready);
    fitText(ctx, game.title, area.x + pad, area.y + 25, area.w - pad * 2, 20, titleColor, '500');
    fitText(ctx, ready ? '随时开一局' : '敬请期待', area.x + pad, area.y + 49, area.w - pad * 2, 10, subtitleColor);
    text(ctx, ready ? '开始玩' : '即将到来', area.x + pad, area.y + area.h - 16, 10, subtitleColor);
    if (ready) arrow(ctx, area.x + pad + 43, area.y + area.h - 16, '#c7d6c0', 10);
  } else {
    const artSize = ready ? Math.min(112, area.h * 0.69, area.w * 0.3) : Math.min(90, area.h * 0.84, area.w * 0.26);
    const artX = area.x + area.w - artSize * 0.58 - (ready ? 15 : 13);
    const artY = area.y + area.h / 2 + (ready ? 4 : 9);
    circle(ctx, area.x + area.w + 9, area.y + area.h * 0.72, ready ? artSize * 1.11 : artSize * 1.02,
      ready ? 'rgba(255,255,255,0.055)' : gold ? '#ebe5d4' : '#dfe9e1');
    circle(ctx, area.x + area.w - 20, area.y + area.h + 30, artSize * 0.9,
      ready ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.3)');
    if (gold) goldArt(ctx, artX, artY, artSize);
    else if (zuma) zumaArt(ctx, artX, artY, artSize);
    else sudokuArt(ctx, artX, artY, artSize * 0.88, ready);
    const contentWidth = Math.max(100, area.w - pad - artSize - 24);
    if (ready) {
      const dense = area.h < 140;
      text(ctx, '随时开一局', area.x + pad, area.y + (dense ? 18 : 24), 9, '#b9ceaf');
      fitText(ctx, game.title, area.x + pad, area.y + (dense ? 45 : 64), contentWidth,
        dense ? 25 : 31, titleColor, '500');
      fitText(ctx, game.subtitle || '在数字之间，找回专注的乐趣', area.x + pad,
        area.y + (dense ? 70 : 94), contentWidth, dense ? 10 : 12, subtitleColor);
      const enterY = area.y + area.h - (dense ? 17 : 26);
      text(ctx, '进入游戏', area.x + pad, enterY, dense ? 11 : 12, '#eef5e8', 'left', '500');
      arrow(ctx, area.x + pad + (dense ? 61 : 68), enterY, '#c7d6c0');
    } else {
      const titleY = area.y + (tiny ? 25 : area.h * 0.32);
      fitText(ctx, game.title, area.x + pad, titleY, contentWidth,
        tiny ? 20 : 23, titleColor, '500');
      const subtitleY = titleY + (tiny ? 23 : 27);
      fitText(ctx, game.subtitle || '新的快乐，正在路上', area.x + pad, subtitleY,
        contentWidth, tiny ? 9 : 11, subtitleColor);
      if (!tiny) {
        const badge = rect(area.x + pad, area.y + area.h - 30, 60, 19);
        box(ctx, badge, gold ? '#e6dfca' : '#dce6dc', null, 5);
        text(ctx, '敬请期待', badge.x + badge.w / 2, badge.y + badge.h / 2, 9,
          gold ? '#a39162' : '#81977d', 'center');
      } else {
        const badge = rect(area.x + area.w - 72, area.y + 9, 60, 18);
        box(ctx, badge, gold ? '#e6dfca' : '#dce6dc', null, 5);
        text(ctx, '敬请期待', badge.x + 30, badge.y + 9, 9,
          gold ? '#a39162' : '#81977d', 'center');
      }
    }
  }
  ctx.restore();
  addTarget(targets, area, ready ? 'openGame' : 'comingSoon', game.id);
}

function drawResume(ctx, layout, ui, targets) {
  const r = layout.resume;
  box(ctx, r, PALETTE.paper, '#e1e7dc', 12);
  const small = layout.landscape;
  const mark = small ? 26 : 34;
  const iconX = r.x + 13;
  const iconY = r.y + (r.h - mark) / 2;
  box(ctx, rect(iconX, iconY, mark, mark), '#f0f4eb', null, 8);
  sudokuArt(ctx, iconX + mark / 2, iconY + mark / 2, mark * 0.59, false);
  const tx = iconX + mark + 12;
  const usable = r.w - (tx - r.x) - 40;
  const hasProgress = !!ui.resumeText;
  if (small) {
    fitText(ctx, hasProgress ? `继续数独 · ${ui.resumeText}` : '从数独开始，玩一会儿', tx,
      r.y + r.h / 2, usable, 11, PALETTE.green, '500');
  } else {
    text(ctx, hasProgress ? '接着上次的思路' : '从数独开始', tx, r.y + r.h / 2 - 9, 12, PALETTE.green, 'left', '500');
    fitText(ctx, ui.resumeText || '轻点开启，让思绪慢下来', tx, r.y + r.h / 2 + 11, usable, 10, PALETTE.muted);
  }
  arrow(ctx, r.x + r.w - 22, r.y + r.h / 2, '#91a582');
  addTarget(targets, r, 'resumeGame', 'sudoku');
}

function drawToast(ctx, layout, value) {
  const message = typeof value === 'string' ? value : value && value.message;
  if (!message) return;
  const width = Math.min(layout.width - 32, 380);
  const area = rect((layout.width - width) / 2, layout.resume.y - 50, width, 40);
  box(ctx, area, 'rgba(38,60,53,0.95)', null, 9);
  fitText(ctx, message, area.x + 14, area.y + 20, width - 28, 12, '#ffffff');
}

/**
 * Render a Canvas-only game lobby and return hit targets.
 * games: [{id,title,subtitle,status:'ready'|'soon',accent?,icon?}].
 * ui: {resumeText?, subtitle?, toast?}. The renderer never changes game data.
 */
function renderHub(ctx, layout, games, ui = {}) {
  const entries = Array.isArray(games) && games.length ? games : DEFAULT_GAMES;
  const targets = [];
  const cards = entries.length === layout.cards.length ? layout.cards
    : cardRects(layout.cardArea, entries.length, layout.landscape, layout.gap);
  ctx.save();
  ctx.clearRect(0, 0, layout.width, layout.height);
  drawBackground(ctx, layout);
  drawHeader(ctx, layout, ui);
  text(ctx, '今天，玩点什么', layout.section.x, layout.section.y + 10,
    11, '#77896f', 'left', '500');
  text(ctx, `${entries.length} 款小游戏`, layout.section.x + layout.section.w, layout.section.y + 10,
    9, '#a0ab98', 'right');
  entries.forEach((game, index) => drawCard(ctx, cards[index], game, index, layout, targets));
  drawResume(ctx, layout, ui, targets);
  const fy = layout.footer.y + layout.footer.h / 2;
  const fx = layout.footer.x + layout.footer.w / 2;
  line(ctx, fx - 81, fy, fx - 65, fy, '#c5d2b9', 1);
  text(ctx, '慢慢玩，常常来。', fx, fy, 10, '#9aa68f', 'center');
  line(ctx, fx + 65, fy, fx + 81, fy, '#c5d2b9', 1);
  drawToast(ctx, layout, ui.toast);
  ctx.restore();
  layout.targets = targets;
  return targets;
}

module.exports = { createHubLayout, renderHub };
