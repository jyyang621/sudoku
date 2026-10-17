# 数独之间

一个可以分享给朋友的中文数独网站，采用原生 HTML、CSS 和 JavaScript，适配电脑和手机，无需构建或安装依赖。

- 多档难度与每日挑战。
- 数字输入、候选笔记、撤销、擦除、冲突检测和提示。
- 暂停计时、键盘操作、偏好设置与本机游戏记录。
- 自动保存本机进度，随时回来继续玩。
- 通过链接邀请朋友挑战同一道题。

## 本地运行

需要 Node.js 20 或更新版本。

```sh
npm start
```

打开 [http://127.0.0.1:4173](http://127.0.0.1:4173)。开发服务器仅监听本机；端口被占用时可通过 `PORT` 环境变量指定其他端口。

```sh
npm test
```

游戏逻辑测试使用 Node.js 自带测试工具。

也可以不使用 npm，直接运行 `node scripts/serve.mjs` 和 `node --test tests/sudoku.test.mjs`。

## 发布到 GitHub Pages

1. 将代码上传到 GitHub 仓库 `jyyang621/sudoku` 的 `main` 分支。
2. 打开仓库 **Settings → Pages → Build and deployment**，将 **Source** 设为 **GitHub Actions**。
3. 在 **Actions** 中运行 **Deploy Sudoku to GitHub Pages**，也可以推送一次提交触发部署。
4. 部署完成后，以 GitHub Pages 页面显示的访问地址为准。该仓库的预期地址是 [https://jyyang621.github.io/sudoku/](https://jyyang621.github.io/sudoku/)。

以后更新 `main` 分支会自动运行测试并重新发布。部署只包含网页和 `js` 文件，不上传本地脚本及测试文件。

部署设置参考 [GitHub Pages 官方文档](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

## 文件

- `index.html`：页面结构。
- `styles.css`：响应式样式。
- `js/app.js`：交互、存档与分享。
- `js/sudoku.js`：题目生成与数独逻辑。
- `scripts/serve.mjs`：无依赖本地服务器。
- `.github/workflows/pages.yml`：GitHub Pages 自动部署。

本项目参考 [Sudoku Kingdom](https://www.sudokukingdom.com/zh/) 的玩法，自行实现页面与游戏逻辑。每道生成题都经过唯一解验证；难度按已知数字数量分级。存档保存在当前浏览器中，不会跨设备同步。
