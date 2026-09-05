# 项目配置页 + 运维平台项目同步 — 执行计划

> 创建时间：2026-08-17
> 状态：执行中

## 1. 概述

将「登记需求」的项目选项数据源切换为运维平台应用列表，并把项目列表管理升级为独立的「项目配置」页：

1. 项目数据来源于两个 GET 接口：
   - `https://devops.vzan.com/deploy/application?group=JenkinsFrontweb`
   - `https://devops.vzan.com/deploy/application?group=JenkinsPAAS`
2. 接口现有数据作为默认数据，单独放配置文件（用户已提供数据，在 `data.json` 中）
3. 新建独立「项目配置页」（顶部工具栏入口，页面级切换，非弹窗），页内有「一键同步」按钮拉取两个接口，与现有数据按项目名去重合并
4. 项目字段：分组、项目名、Git 仓库地址（非必填，配置页手动填写）；支持手动新增/删除项目
5. 配置保存到 localStorage，后续再接数据库
6. 构建环境（代码分支）选项新增 `pre-txnj`
7. 废弃现有 44 个默认项目与「项目管理」弹窗

## 2. 已确认决策

- **默认数据**：`data.json`（两段 JSON 数组拼接，第一段 JenkinsFrontweb 76 个应用，第二段 JenkinsPAAS 11 个应用），提取进配置文件后删除该临时文件
- **配置页形态**：独立页面切换——顶部工具栏加「项目配置」入口，点击后内容区整体切换为配置页（带返回按钮），无路由，用 state 切换视图
- **配置页功能**：一键同步（与现有数据按 app 去重合并，保留本地 gitUrl）、行内编辑 Git 地址、手动新增（分组/项目名/Git 地址）、删除（二次确认）
- **同步按钮**：只在配置页，登记需求弹窗内不放
- **旧数据**：`DEFAULT_PROJECTS` 与 `ProjectManager` 删除，旧 localStorage key 不迁移
- **pre-txnj**：BuildControls 环境下拉新增，构建分支解析为 `origin/pre-txnj`

## 3. 接口数据格式

GET 返回应用对象数组：

```json
{ "app": "agentadmin", "alias": "agent控制台", "k8s_name": "agentadmin", "project_name": "直播", "type": "static", "deploy_timeout": 180, "description": "..." }
```

未登录时返回 200 + `{ "error_code": "user:user_login_failed" }`，**必须校验响应为数组**。
两个分组存在同名 app（audit-web、yingxiao-pc、yx-web 等），去重时 JenkinsFrontweb 优先。

## 4. 数据模型

```ts
// src/config/devopsApps.ts
export type DevopsGroup = 'JenkinsFrontweb' | 'JenkinsPAAS';
export interface DevopsApp {
  app: string;        // 项目名（唯一键）
  alias: string;      // 中文别名
  group: DevopsGroup; // 分组
  gitUrl?: string;    // Git 仓库地址，非必填，配置页手填
}
export const DEVOPS_GROUPS: DevopsGroup[] = ['JenkinsFrontweb', 'JenkinsPAAS'];
export const DEFAULT_DEVOPS_APPS: DevopsApp[] = [/* 从 data.json 提取，按 app 去重 */];
```

存储：localStorage key `work-tracker:devops-apps:v1`，无存储时回退 `DEFAULT_DEVOPS_APPS`。

## 5. 涉及文件清单

| 文件 | 操作 | 说明 |
| ---- | ---- | ---- |
| `docs/devops-projects-sync-plan.md` | 新增 | 本文档 |
| `data.json` | 删除 | 临时传输文件 |
| `src/config/devopsApps.ts` | 新增 | 类型 + 分组常量 + 默认数据 |
| `src/storage.ts` | 修改 | 删 DEFAULT_PROJECTS/SEED_KEY；新增 loadDevopsApps/saveDevopsApps |
| `src/hooks/useWorkTracker.ts` | 修改 | useProjects → useDevopsApps（apps/add/remove/update/mergeSynced） |
| `src/build.ts` | 修改 | BuildEnv 加 pre-txnj；新增 fetchDevopsApps() |
| `src/components/BuildControls.tsx` | 修改 | ENV_OPTIONS 加 pre-txnj，Select 宽 76→96 |
| `src/components/ProjectConfigPage.tsx` | 新增 | 配置页：表格 + 行内编辑 + 新增/删除 + 一键同步 |
| `src/components/ProjectSelect.tsx` | 修改 | 移除手动添加；options 改 `app（alias）` 可搜索 |
| `src/components/RequirementForm.tsx` | 修改 | props projects/onAddProject → apps |
| `src/components/FilterBar.tsx` | 修改 | projectOptions → apps，label 带 alias |
| `src/components/ProjectManager.tsx` | 删除 | 被配置页替代 |
| `src/App.tsx` | 修改 | view state 切换主页面/配置页；接入 useDevopsApps；删 ProjectManager 与 mergeProjects |
| `server/src/index.ts` | 修改 | 新增 GET /devops-api/deploy/application 转发（透传 group） |

## 6. 分步实施细节

### Step 1：配置文件 `src/config/devopsApps.ts`

- 从 data.json 提取 `app`/`alias`（去除首尾空白/制表符）/`group`，按 app 去重（Frontweb 优先），`gitUrl` 留空
- 导出 `DevopsGroup`、`DevopsApp`、`DEVOPS_GROUPS`、`DEFAULT_DEVOPS_APPS`

### Step 2：storage + hooks

- `storage.ts`：删 `DEFAULT_PROJECTS`、`PROJECT_KEY`、`SEED_KEY`、`loadProjects`/`saveProjects`；新增 `DEVOPS_APPS_KEY = 'work-tracker:devops-apps:v1'`、`loadDevopsApps()`（无存储回退默认数据）、`saveDevopsApps()`
- `useWorkTracker.ts`：`useProjects` 替换为 `useDevopsApps`：

```ts
interface DevopsAppsApi {
  apps: DevopsApp[];
  add: (app: DevopsApp) => boolean;             // app 名重复返回 false
  remove: (appName: string) => void;
  update: (appName: string, patch: Partial<DevopsApp>) => void;
  mergeSynced: (remote: DevopsApp[]) => number; // 按 app 去重合并，保留本地 gitUrl，返回新增数
}
```

### Step 3：build.ts + BuildControls

- `BuildEnv = 'dev' | 'test' | 'pre' | 'pre-txnj'`；`resolveBuildBranch` 天然兼容（`'origin/' + env`）
- 新增 `fetchDevopsApps(): Promise<DevopsApp[]>`：`Promise.all` 并行 GET 两分组的 `/devops-api/deploy/application?group=...`（`credentials: 'include'` + x-csrftoken），响应非数组抛「未登录运维平台，请先登录」，映射 DevopsApp 并按 app 去重
- `BuildControls`：`ENV_OPTIONS` 加 `{ label: 'pre-txnj', value: 'pre-txnj' }`，Select 宽 76→96

### Step 4：配置页 `src/components/ProjectConfigPage.tsx`

- 顶部：返回按钮（ArrowLeftOutlined, text）+ 标题「项目配置」；右侧「新增项目」（dashed）+「一键同步」（primary, SyncOutlined, loading）
- 表格上方小字：共 N 个项目，最近同步时间（同步时间存 localStorage `work-tracker:devops-apps:synced-at`）
- Table（bordered）：分组（蓝/紫 Tag 区分两组）、项目名（等宽）、别名、Git 仓库地址（行内 Input，失焦/回车保存，占位「选填，如 git@gitlab...:group/repo.git」）、操作（删除 + Popconfirm）
- 新增 Modal：分组 Select 二选一（必填）、项目名 Input（必填，查重）、别名 Input（选填）、Git 地址 Input（选填）
- 反馈：同步成功 `message.success('同步完成，新增 N 个项目')`；未登录/失败 `message.error('未登录运维平台，请先登录')`

### Step 5：主页面改造

- `App.tsx`：`view: 'main' | 'config'` state；工具栏「项目管理」按钮原位替换为「项目配置」（SettingOutlined）；删 ProjectManager 引用/state/JSX；`useProjects` → `useDevopsApps`；删导入流程 `mergeProjects` 调用；`view==='config'` 渲染 ProjectConfigPage（外层 maxWidth 1200 + Card 容器保持一致）
- `ProjectSelect.tsx`：删 popupRender/newName/onAddProject；options = `app（alias）`，`showSearch optionFilterProp="label"`
- `RequirementForm.tsx`：props `projects: string[]; onAddProject` → `apps: DevopsApp[]`
- `FilterBar.tsx`：`projectOptions: string[]` → `apps: DevopsApp[]`，label 带 alias

### Step 6：服务端转发

- `server/src/index.ts`：新增 `GET /devops-api/deploy/application`，透传 query `group`（参考 L81-90 branch 路由）

### Step 7：验证

- `npm run build`（tsc --noEmit + vite build）
- 走查：配置页同步/新增/删除/编辑 gitUrl；登记需求选项目；筛选栏项目筛选；构建环境 pre-txnj

## 7. 关键依赖与上下文

- 同步走 `/devops-api` 代理：dev 走 Vite proxy（vite.config.ts，转发整个前缀无需改），部署走 server/ Fastify 转发（需新增路由）
- 登录 cookie 由用户通过其他工具写入本站域名，未登录时提示「未登录运维平台，请先登录」
- `Requirement.items.project` 仍为 string（app 名），存量需求数据与导入导出不受影响
- 不自动提交代码，需用户确认后才可提交
