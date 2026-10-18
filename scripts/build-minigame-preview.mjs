import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// The browser preview bundles the exact native modules; the wx adapter is the
// only browser-specific code. This is a local QA tool, not the WeChat package.
const root = fileURLToPath(new URL('../', import.meta.url));
const files = ['lib/sudoku.js', 'src/state.js', 'src/registry.js', 'src/renderer.js', 'src/hub-renderer.js', 'src/main.js'];
const modules = await Promise.all(files.map(async id =>
  `${JSON.stringify(id)}: function(require,module,exports,wx){\n${await readFile(path.join(root, 'wechat-minigame', id), 'utf8')}\n}`));
const code = `// Generated local browser preview. Do not edit.\n(function(){\n'use strict';\nconst factories={${modules.join(',\n')}};\nconst cache={};\nfunction load(id){\n if(cache[id]) return cache[id].exports;\n if(!factories[id]) throw new Error('Unknown module '+id);\n const module={exports:{}}; cache[id]=module;\n factories[id](function(request){\n  const parts=id.split('/');parts.pop();\n  for(const part of request.split('/')) {if(part==='..')parts.pop();else if(part!=='.'&&part)parts.push(part);}\n  return load(parts.join('/'));\n },module,module.exports);return module.exports;\n}\nwindow.MiniGame=load('src/main.js');\nwindow.MiniGame.instance=window.MiniGame.createMiniGame(window.wx,{onRender:window.onNativeRender});\n})();\n`;
await mkdir(path.join(root, 'preview'), { recursive: true });
await writeFile(path.join(root, 'preview', 'wechat-game.js'), code, 'utf8');
console.log('已生成原生小游戏的本地浏览器预览：/preview/');
