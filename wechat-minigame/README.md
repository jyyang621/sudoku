# 游戏之间 · 微信小游戏大厅

这是「游戏之间」的微信小游戏工程，以游戏大厅为入口。当前**数独可以游玩**，**黄金矿工与 Zuma 敬请期待**。数独使用微信 Canvas 与原网站共用的算法，支持四档难度、每日挑战、笔记、填全笔记、撤销、提示、自动存档和分享同题。

原 GitHub Pages 数独网站可以继续访问。小游戏不需要部署网站服务器，游玩进度保存在当前微信设备；网站的浏览器存档不会自动迁入微信。

已配置你提供的真实小游戏 AppID：`wxdf7e7953e1db2558`。目前提供源码与可导入工程，**尚未上传、审核或正式发布到微信**。AppID 配置完成不代表已完成微信平台发布。

## 构建与检查

在仓库根目录 `D:\数独` 打开终端，需要 Node.js 20 或更高版本，无需安装第三方依赖：

```powershell
node scripts/build-minigame.mjs
node scripts/build-minigame.mjs --check
node --test tests/*.test.mjs
```

如果本机也安装了 npm，上述命令对应 `npm run build:wechat`、`npm run check:wechat` 和 `npm test`。

构建会把 `js/sudoku.js` 转换为 `lib/sudoku.js`，并生成 `game.js`。请修改网页引擎源文件后重新构建，不要手改 `lib/sudoku.js`。小游戏的每日挑战使用 UTC+8 计算当代北京时间，避免依赖小游戏运行环境的 `Intl` 时区支持。相同题号、难度的题目与网站保持一致。

`--check` 会比较网页与小游戏引擎的多组题目、唯一解、候选数和北京时间日期边界，并检查生成文件与导入配置。`node --test tests/*.test.mjs` 运行完整测试，覆盖数独引擎、小游戏状态、控制器与平台适配。它们是本地自动检查，不能替代微信开发者工具与手机真机验证。

如需重新设置 AppID，可在根目录执行：

```powershell
node scripts/build-minigame.mjs --appid=wxdf7e7953e1db2558
```

也可以在微信开发者工具中修改 AppID。后续不带 `--appid` 的构建会保留现有 `project.config.json`，不会覆盖你填好的 AppID 或工具设置。`project.private.config.json` 属于开发工具的本地配置，不由构建器生成。

## 本地浏览器预览与 QA

先完成上面的小游戏构建，再在仓库根目录运行：

```powershell
node scripts/build-minigame-preview.mjs
node scripts/serve.mjs
```

打开 [http://127.0.0.1:4173/preview/](http://127.0.0.1:4173/preview/)。依次检查大厅进入数独、黄金矿工与 Zuma 的「敬请期待」、返回大厅后继续数独、数字输入、笔记、填全笔记、撤销、提示、暂停、每日挑战、刷新后存档以及浏览器前后台切换。修改源码后重新生成预览包并刷新；数独引擎源码有变更时，也要先重新运行 `node scripts/build-minigame.mjs`。检查结束后按 `Ctrl+C` 停止本地服务器。

预览使用与微信工程相同的游戏模块，由 `preview/wx-preview.js` 在浏览器中模拟 `wx` 的 Canvas、存档、弹窗、分享和前后台事件。浏览器存档使用独立的本地存储，分享按钮生成的也是本地调试链接。这个适配层用于画面与交互 QA，**不是真机验证**，不能证明微信平台能力可用；手机安全区域、真实分享和设备兼容性仍需按下节在开发者工具及手机微信中检查。

`preview/` 是本地 QA 工程，未包含在当前 GitHub Pages 发布清单中，也不属于导入微信的 `wechat-minigame/` 包。

## 在微信开发者工具中导入

1. 从[微信官方入口](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)安装并打开微信开发者工具，使用自己的微信扫码登录。
2. 选择导入项目，目录选本 README 所在的 `D:\数独\wechat-minigame`，不是仓库根目录。项目类型应为 **小游戏**；配置中的 `compileType` 已设为 `game`。
3. 确认导入的 AppID 为 `wxdf7e7953e1db2558`，且当前登录微信具有该小游戏的开发权限。
4. 点击编译，先在大厅进入数独；黄金矿工和 Zuma 卡片显示「敬请期待」。检查返回大厅和继续数独，以及数字输入、笔记、填全笔记、撤销、提示、每日挑战与退出后恢复进度。开发工具中选一个当前稳定的基础库版本。
5. 点击预览，在微信真机检查大厅、顶部安全区域、暂停恢复和分享同题。分享能力、手机预览与上传以微信平台对该账号和版本的实际开放情况为准。

该版本按本地单机游戏实现，不需要配置业务服务器或联网请求域名。微信的发布流程与 GitHub Pages 部署彼此独立；GitHub 上的源码或网页链接不会自动变成微信小游戏。

## 新游戏接入约定

`src/registry.js` 统一导出 `GAMES` 和 `getGame(id)`。每个游戏条目包含 `id`、`title`、`subtitle` 和 `status`；`status: 'ready'` 表示可进入，`status: 'soon'` 表示大厅中的预告。未知 ID 的 `getGame(id)` 返回 `null`。当前注册项为 `sudoku`、`gold-miner` 和 `zuma`。

大厅根据注册表展示游戏。`createMiniGame(wx)` 返回控制器，入口通过 `controller.activate('openGame', gameId)` 分发并核对注册状态；当前 `src/main.js` 只有 `sudoku` 的可玩分派，并没有根据注册表自动加载任意游戏模块的机制。

接入黄金矿工、Zuma 或其他游戏时，先实现该游戏独立的状态、绘制、触摸输入和暂停恢复逻辑，再在 `src/main.js` 中 `activate` 的 `openGame` 分支接入模块及对应生命周期，最后把注册表中的状态改为 `ready`。只新增元数据或修改状态不会自动加载游戏。

各游戏应使用不同的本地存档键，并在返回大厅时保存状态、停止自己的计时或动画；进入游戏时再恢复。保持游戏 ID 稳定，确保后续分享入口与存档仍能找到对应游戏。网页数独的 `js/sudoku.js` 继续作为数独算法源文件，不应混入其他游戏的逻辑。

## 发布前的最后步骤

小游戏 AppID 配置并完成真机验证后，才能通过开发工具上传代码版本，再到[微信公众平台](https://mp.weixin.qq.com/)完成账号当前要求的资料、版本审核和发布。具体要求请以你账号后台和[微信小游戏官方文档](https://developers.weixin.qq.com/minigame/dev/guide/)为准。正式发布后才会有供朋友进入的小游戏入口；上传体验版时，也需要按平台规则添加体验成员。

工程配置参考微信团队的[小游戏快速启动模板](https://github.com/wechat-miniprogram/miniprogram-game-quickstart)与[官方小游戏示例](https://github.com/wechat-miniprogram/minigame-demo)。
