# 工作记录（work-tracker）

一个轻量的**需求交付台账工具**，用于集中跟踪研发需求的交付进度。数据全部保存在浏览器本地（localStorage），无需后端。

## 功能特性

- **需求登记与管理**：记录需求名称、TAPD 链接、状态、发版时间，并支持一个需求关联多个「项目 + 开发分支」。
- **状态流水线追踪**：内置 10 个研发阶段（开发中 → 已提测 → 测试中 → 测试通过 → 验收通过 → 预发布测试中 → 待发布 → 线上验证中 → 已发布），可表格内直接切换。
- **统计看板**：按状态汇总数量，点击状态标签即可快速筛选。
- **多维度筛选**：按状态、项目、发版日期、需求名关键词实时检索。
- **项目管理**：维护项目清单，登记需求时可当场新建项目。
- **导出与归档**：支持导出全部数据为 JSON；可导出并清理「发版时间在一个月前」的数据以释放本地缓存。

## 技术栈

- React 18 + TypeScript
- Vite 5
- Ant Design 5（`antd` / `@ant-design/icons`）
- dayjs（日期处理）
- 数据存储：浏览器 `localStorage`

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建（类型检查 + 打包）
npm run build

# 本地预览构建产物
npm run preview
```

## 数据存储说明

| Key | 内容 |
| --- | --- |
| `work-tracker:requirements:v1` | 需求数组 |
| `work-tracker:projects:v1` | 项目字符串数组 |

- 默认项目清单仅在首次启动时播种一次，之后删除不会自动复活。
- 数据仅保存在当前浏览器，换设备/清缓存会丢失，请使用「导出全部」定期备份。

## VSCode 插件版

本项目同时封装为 **VSCode 插件**：在 IDE 内以独立 Webview 面板运行，数据持久化到插件 `globalState`（用户级、跨窗口可靠），与浏览器 Web 版共用同一套 `src/` 源码。完整开发方案见 [docs/vscode-extension-plan.md](docs/vscode-extension-plan.md)。

### 构建插件

```bash
# 构建插件版 webview 产物（输出到 extension/media/）+ 编译插件主进程
npm run build:plugin
```

也可分开执行：`npm run build:extension`（webview 产物）与 `cd extension && npm run compile`（主进程）。

### F5 调试

项目根目录已配置 `.vscode/launch.json` 与 `.vscode/tasks.json`：

1. 先执行一次 `npm run build:plugin`（或直接按 F5，preLaunchTask 会自动构建）。
2. 按 **F5** 启动「Run Extension (Work Tracker)」，弹出新的 Extension Development Host 窗口。
3. 在新窗口中点击左下角状态栏 **「工作记录」** 图标，或命令面板执行 **「Work Tracker: 打开工作记录」** 打开面板。

### 打包 .vsix

```bash
# 1. 构建插件全部产物
npm run build:plugin

# 2. 在 extension/ 目录打包
cd extension
npx @vscode/vsce package
```

产物为 `work-tracker-<version>.vsix`，可通过「扩展 → ... → 从 VSIX 安装」安装，或发布到 VSCode Marketplace。

> 提示：`.vscodeignore` 已排除 `src/`、`extension/src/`、`tsconfig.json` 等开发文件，仅保留运行所需产物；`extension/media/` 与 `extension/dist/` 为构建产物，已加入 `.gitignore`，打包前务必先构建。

### 插件版与 Web 版差异

| 维度 | 浏览器 Web 版 | VSCode 插件版 |
| --- | --- | --- |
| 数据存储 | `localStorage`（当前浏览器） | 插件 `globalState`（用户级，跨窗口/会话） |
| 环境标记 | `__VSCODE__ = false` | `__VSCODE__ = true` |
| 通信 | 无 | postMessage 桥（`src/bridge.ts` ↔ `extension/src/webview.ts`） |
| 导出下载 | 浏览器 Blob 下载 | 沿用 Webview 内 Blob 下载（未来可接 `showSaveDialog`） |

## 目录结构

```
├── index.html               # Web 版入口（未改动）
├── src/                     # 前后端共用源码
│   ├── App.tsx              # 主页面：状态、筛选、导入/导出逻辑
│   ├── main.tsx             # 应用入口（Antd 中文locale、ConfigProvider）
│   ├── types.ts             # 类型定义与状态枚举、颜色映射
│   ├── storage.ts           # 数据层：Web 版 localStorage / 插件版 postMessage 桥（环境分支）
│   ├── bridge.ts            # 插件版通信桥：acquireVsCodeApi、ready 握手、save 防抖合并
│   ├── vite-env.d.ts        # __VSCODE__ 与 Webview 全局类型声明
│   ├── export.ts            # 导出 JSON / 归档清理逻辑
│   └── components/
│       ├── RequirementForm.tsx   # 登记/编辑需求表单
│       ├── RequirementTable.tsx  # 需求列表表格
│       ├── StatsBar.tsx          # 状态统计看板
│       ├── ProjectManager.tsx    # 项目管理弹窗
│       ├── ProjectSelect.tsx     # 可新建项目的下拉选择
│       └── StatusTag.tsx         # 状态标签
├── extension/               # VSCode 插件工程
│   ├── package.json         # 插件 manifest：命令、engines、activationEvents
│   ├── tsconfig.json        # 主进程编译配置（CommonJS → dist/）
│   ├── .vscodeignore        # vsce 打包排除清单
│   ├── media/               # 插件版 webview 构建产物（gitignore，需 build:extension 生成）
│   └── src/
│       ├── extension.ts     # 激活：注册命令 + 状态栏按钮
│       ├── webview.ts       # WebviewPanel：CSP/nonce/资源注入、消息分发
│       ├── state.ts         # globalState 读写
│       └── types.ts         # 插件侧类型（与 src/types.ts 保持同步）
├── docs/vscode-extension-plan.md  # VSCode 插件封装开发方案
└── .vscode/                 # F5 调试配置（launch.json / tasks.json）
```
