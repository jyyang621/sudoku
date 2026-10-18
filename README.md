# 游戏之间

一个以微信小游戏大厅为入口的休闲游戏项目：当前数独可玩，黄金矿工和 Zuma 敬请期待。微信工程位于 `wechat-minigame/`，已配置 AppID `wxdf7e7953e1db2558`，**尚未上传、审核或正式发布到微信**。

需要 Node.js 20 或更新版本，在仓库根目录构建：

```sh
node scripts/build-minigame.mjs
node scripts/build-minigame.mjs --check
node --test tests/*.test.mjs
```

随后用微信开发者工具导入 `wechat-minigame/`，项目类型为小游戏。完整导入、真机预览、发布步骤与新游戏接入方式见 [微信小游戏说明](wechat-minigame/README.md)。大厅的游戏目录集中在 `wechat-minigame/src/registry.js`；控制器通过 `controller.activate('openGame', gameId)` 分发入口，当前 `wechat-minigame/src/main.js` 仅实现数独的分派，其他游戏仍需接入各自模块。

## 小游戏本地浏览器预览

先完成上面的构建，再生成浏览器预览并启动本地服务器：

```sh
node scripts/build-minigame-preview.mjs
node scripts/serve.mjs
```

打开 [http://127.0.0.1:4173/preview/](http://127.0.0.1:4173/preview/)，检查大厅、进入与返回数独、输入数字、笔记、填全笔记、撤销、暂停恢复和刷新后存档。黄金矿工与 Zuma 应显示「敬请期待」。修改小游戏源码后，需要重新运行预览生成命令并刷新页面；数独引擎源码有变更时也要先重新构建小游戏。

该预览将同一套小游戏模块配合 `preview/wx-preview.js` 使用；适配层在浏览器中模拟 `wx` 的 Canvas、存档、弹窗、分享与前后台事件。它适合本地画面和交互 QA，**不是真机验证**；本地分享链接也不能作为正式微信小游戏入口。正式预览、分享和平台兼容性仍需用微信开发者工具及手机微信检查。停止本地服务器按 `Ctrl+C`。

## 数独之间 · 网页版

一个可以分享给朋友的中文数独网站，采用原生 HTML、CSS 和 JavaScript，适配电脑和手机，无需构建或安装依赖。

- 多档难度与每日挑战。
- 数字输入、候选笔记、撤销、擦除、冲突检测和提示。
- 点击棋盘下方「填全笔记」，一键按当前行、列、宫格填入所有空格的候选数字；可整步撤销，也会自动保存。重新点击会按当前棋盘重算全部笔记。
- 暂停计时、键盘操作、偏好设置与本机游戏记录。
- 自动保存本机进度，随时回来继续玩。
- 通过链接邀请朋友挑战同一道题。

## 网页版本地运行

需要 Node.js 20 或更新版本。

```sh
npm start
```

打开 [http://127.0.0.1:4173](http://127.0.0.1:4173)。开发服务器仅监听本机；端口被占用时可通过 `PORT` 环境变量指定其他端口。

```sh
npm test
```

游戏逻辑测试使用 Node.js 自带测试工具。

也可以不使用 npm，直接运行 `node scripts/serve.mjs` 和 `node --test tests/*.test.mjs`。完整测试同时覆盖网页数独引擎与微信小游戏的状态、控制器和平台适配逻辑。

## 网页版发布到 GitHub Pages

1. 将代码上传到 GitHub 仓库 `jyyang621/sudoku` 的 `main` 分支。
2. 打开仓库 **Settings → Pages → Build and deployment**，将 **Source** 设为 **GitHub Actions**。
3. 在 **Actions** 中运行 **Deploy Sudoku to GitHub Pages**，也可以推送一次提交触发部署。
4. 部署完成后，以 GitHub Pages 页面显示的访问地址为准。该仓库的预期地址是 [https://jyyang621.github.io/sudoku/](https://jyyang621.github.io/sudoku/)。

以后更新 `main` 分支会自动运行测试并重新发布。部署只包含网页版页面及 `js` 文件，不上传本地脚本、测试、`wechat-minigame/` 和 `preview/`；微信小游戏需要单独通过微信平台上传发布。

部署设置参考 [GitHub Pages 官方文档](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

## 文件

- `index.html`：页面结构。
- `styles.css`：响应式样式。
- `js/app.js`：交互、存档与分享。
- `js/sudoku.js`：题目生成与数独逻辑。
- `scripts/serve.mjs`：无依赖本地服务器。
- `scripts/build-minigame.mjs`：微信小游戏引擎与入口构建、跨平台一致性检查。
- `scripts/build-minigame-preview.mjs`：生成本地浏览器预览包。
- `preview/`：以浏览器 `wx` 适配层预览小游戏，用于本地 QA。
- `wechat-minigame/`：「游戏之间」微信小游戏大厅与数独。
- `.github/workflows/pages.yml`：GitHub Pages 自动部署。

本项目参考 [Sudoku Kingdom](https://www.sudokukingdom.com/zh/) 的玩法，自行实现页面与游戏逻辑。每道生成题都经过唯一解验证；难度按已知数字数量分级。存档保存在当前浏览器中，不会跨设备同步。
