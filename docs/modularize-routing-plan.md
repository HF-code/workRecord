# 模块化与路由拆分重构计划

> 规划会话产出，执行会话按本文件逐步落地。无需用户确认即可开始执行。

## 0. 背景与现状

- 技术栈：**React 18 + TypeScript + Vite + Ant Design 5**（非 Vue，用户口中的 "app.vue" 实为 `src/App.tsx`）。
- 现状问题：`src/App.tsx` 单文件承载两个视图（需求列表 / 项目配置），通过 `view` state 切换；所有状态（requirements、devopsApps、filter、form 开关、modal 开关）、导入导出、统计逻辑都堆在 `App` 里，约 250 行，违背模块化。
- 目标：引入路由（`react-router-dom`），把两个视图拆成独立页面组件，抽取共享 hook / 布局，让 `App.tsx` 退化为"路由壳 + 全局 Provider"。

## 1. 依赖变更

新增运行依赖（需 `npm install`）：

- `react-router-dom` `^6.26.0`（v6 稳定，含 `createBrowserRouter` / `Routes` / `Navigate` / `useNavigate` 等）。

> 说明：路由用 `BrowserRouter`（`createBrowserRouter` + `RouterProvider`）即可。历史数据存 `localStorage`，无需 SSR，`base: './'` 仍兼容静态部署。

## 2. 目录结构（重构后）

```
src/
├── main.tsx                      # 入口：挂载 RouterProvider（替代直接渲染 App）
├── App.tsx                       # 路由壳：<Layout> + <Routes>，仅含布局与导航
├── router.tsx                    # 路由表定义（createBrowserRouter）
├── layouts/
│   └── AppLayout.tsx             # 顶部导航 + 内容容器（Layout/Menu）
├── pages/
│   ├── RequirementListPage.tsx   # 原 App 的 "main" 视图（需求列表 + 表单 + 统计 + 导入导出）
│   └── ProjectConfigPage.tsx     # 原为 components/ProjectConfigPage.tsx，升级为页面
├── components/                   # 保持：RequirementForm/Table/StatsBar/FilterBar/
│   │                            #      ProjectSelect/StatusTag/BuildControls/ProjectStatsModal
├── hooks/
│   ├── useWorkTracker.ts         # 已有：requirements CRUD + devopsApps（保留，仅微调导出）
│   └── useAppNav.ts              # 新增：封装 useNavigate 跳转（可选，简化页面内跳转）
├── config/devopsApps.ts          # 已有，不动
├── build.ts                      # 已有，不动
├── export.ts                    # 已有，不动
├── storage.ts                    # 已有，不动
└── types.ts                      # 已有，不动
```

`components/ProjectConfigPage.tsx` 升级为页面后保留在 `pages/`，原 `components/` 下文件删除或保留空壳重定向（建议直接迁移，删除 `components/ProjectConfigPage.tsx` 以免重复）。

## 3. 路由设计

| 路径 | 页面 | 说明 |
|------|------|------|
| `/` | `RequirementListPage` | 需求列表（默认页），含登记/编辑/统计/导入导出 |
| `/projects` | `ProjectConfigPage` | 运维平台项目配置（原"项目配置"视图） |
| `*` | `<Navigate to="/" />` | 兜底重定向到列表页 |

页面内"返回/切换"不再用 `setView`，改为 `useNavigate()` 跳转；`ProjectConfigPage` 的 `onBack` 改为 `navigate('/')`。

## 4. 分步骤实施

### 步骤 1：安装依赖
- 执行 `npm install react-router-dom@^6.26.0`。
- 在 `package.json` dependencies 确认写入。

### 步骤 2：新增 `src/layouts/AppLayout.tsx`
- 用 antd `Layout` + `Header` + `Content` 包裹。
- Header 内放 `Menu`（mode="horizontal"），两项：`需求记录`(`/`)、`项目配置`(`/projects`)，`selectedKeys` 由 `useLocation().pathname` 驱动。
- 渲染 `<Outlet />` 作为内容出口。
- 保留整体背景色 `#f5f5f5`、内容区 `maxWidth:1200, margin:0 auto`。

### 步骤 3：新增 `src/router.tsx`
- `createBrowserRouter([{ path:'/', element:<AppLayout/>, children:[ {index:true, element:<RequirementListPage/>}, {path:'projects', element:<ProjectConfigPage/>} ]}, {path:'*', element:<Navigate to="/" replace/>} ])`。

### 步骤 4：新建 `src/pages/RequirementListPage.tsx`
- **从 `App.tsx` 原 "main" 分支搬移**：`useRequirements` / `useDevopsApps`、filter state、`formOpen`/`editing`/`statsOpen` state、所有 handler（`handleSubmit`/`handleDelete`/`handleExportAll`/`handleExportAndClean`/`handleImportFile`/`openCreateForm`/`openEditForm`/`closeForm`）、`filtered`/`statusOptions` 的 `useMemo`、`toggleStatusFilter`）。
- JSX：保留原 `main` 视图的 Card 内容（标题、按钮组、StatsBar+统计按钮、FilterBar、RequirementTable、RequirementForm、ProjectStatsModal）。
- 删除原 `view`/`setView` 以及 `if (view === 'config')` 分支——"项目配置"按钮改为 `<Button onClick={() => navigate('/projects')}>`。

### 步骤 5：迁移 `ProjectConfigPage` 为页面
- 复制 `components/ProjectConfigPage.tsx` 到 `src/pages/ProjectConfigPage.tsx`。
- 接口 `Props` 去掉 `onBack`，内部改用 `const navigate = useNavigate();`，"返回"按钮 `onClick={() => navigate('/')}`。
- 顶部"返回"按钮可保留或交由 Layout 的 Menu 导航（建议保留返回按钮，体验一致）。
- 删除原 `components/ProjectConfigPage.tsx`（避免重复引用）。`App.tsx` / `RequirementListPage` 中对它的 import 改为从 `pages/` 引用（实际仅 router 引用，迁移后 App 不再 import）。

### 步骤 6：重写 `src/App.tsx` 为路由壳
- 内容精简为：仅渲染 `<RouterProvider router={router} />`（或保留 `ConfigProvider`/`AntdApp` 包裹，见步骤 7）。
- 移除所有业务 state、handler、import。

### 步骤 7：改造 `src/main.tsx`
- 引入 `router`（或 `RouterProvider`），用 `RouterProvider router={router}` 替换直接渲染 `<App />`。
- 保留 `ConfigProvider locale={zhCN}` 与 `AntdApp`（全局 message/modal 上下文必须覆盖路由树）。
- 最终渲染树：
  ```
  <ConfigProvider locale={zhCN}>
    <AntdApp>
      <RouterProvider router={router} />
    </AntdApp>
  </ConfigProvider>
  ```
  即 `App.tsx` 可作为空壳或删除，由 `main.tsx` 直接挂 `RouterProvider`。本方案保留 `App.tsx` 仅作语义占位（导出 `RouterProvider`），亦可删除 `App.tsx` 让 `main.tsx` 直接 import `router`。**推荐：删除 `App.tsx`，`main.tsx` 直接挂 `RouterProvider`**，减少一层无意义嵌套。

### 步骤 8：清理与类型检查
- 删除 `src/App.tsx`（若步骤 7 采用推荐方案）。
- 确认无遗留对 `App.tsx`、`components/ProjectConfigPage` 的引用。
- 运行 `npx tsc --noEmit` 确保类型通过。
- 可选：`npm run build` 验证产物。

## 5. 关键依赖与上下文

- `useRequirements` / `useDevopsApps` 来自 `src/hooks/useWorkTracker.ts`，**本次不动**，页面直接复用。
- `RequirementForm`、`RequirementTable`、`StatsBar`、`FilterBar`、`ProjectStatsModal`、`ProjectSelect`、`StatusTag`、`BuildControls` 均为受控展示/表单组件，无需改动，仅被页面引用。
- 导入导出逻辑在 `src/export.ts`（`parseImportFile`/`exportAll`/`findOlderThanOneMonth`/...），页面内 `handleImportFile`/`handleExportAll`/`handleExportAndClean` 直接调用，**本次不动**这些函数，仅搬运调用方。
- 路由库 v6 API 需与 React 18 配合，无需额外 babel 配置（Vite 已处理 JSX）。

## 6. 验收标准

- 访问 `/` 显示需求列表页，登记/编辑/删除/筛选/统计/导入导出全部正常（含此前修复的 `randomUUID` 兜底与编辑回显）。
- 访问 `/projects` 显示项目配置页，同步/新增/删除/gitUrl 编辑正常。
- 顶部导航 Menu 高亮与路由同步；直接输入 `/projects` 或刷新可正确加载（BrowserRouter 在 dev server 下 Vite 自动 fallback 到 index.html；静态部署需在服务器配置 SPA fallback，超出本次范围，仅提示）。
- `tsc --noEmit` 无错误。
- `src/App.tsx` 不再承载业务逻辑。

## 7. 风险与备注

- **静态部署 SPA 刷新 404**：`BrowserRouter` 需服务端 fallback 到 `index.html`。Vite dev 已处理；若后续部署到无 fallback 的静态空间，可改 `HashRouter`（零配置兼容 `file://` 与任意静态托管）。本次默认 `BrowserRouter`，如你倾向"直接双击 index.html 也能跑"，改用 `HashRouter` 即可（仅 `router.tsx`/`main.tsx` 两处改动）。
- 不改动任何业务逻辑与样式，仅做结构拆分，回归风险低。
