# 工作记录（Work Tracker）· VSCode 插件

在 IDE 内以独立 Webview 面板运行的需求交付台账工具，数据持久化到插件 `globalState`（用户级、跨窗口/会话可靠）。

## 使用

1. 安装扩展后，点击状态栏左侧 **「工作记录」** 图标。
2. 或通过命令面板执行 **「Work Tracker: 打开工作记录」**。
3. 面板内容与浏览器 Web 版一致：登记需求、状态流转、筛选、项目管理、导出。

## 数据存储

| 内容 | globalState Key |
| --- | --- |
| 需求数组 | `workTracker.requirements` |
| 项目清单 | `workTracker.projects` |

数据随 VSCode 用户目录持久化，删除扩展前建议先「导出全部」备份。

## 开发调试

```bash
# 构建 webview 产物（在仓库根目录执行）
npm run build:plugin
```

根目录 `.vscode/launch.json` 已配置 F5 调试（Extension Development Host）。

## 打包

```bash
npm run build:plugin
cd extension
npx @vscode/vsce package
```

> 源码与构建说明见仓库根 README 与 `docs/vscode-extension-plan.md`。
