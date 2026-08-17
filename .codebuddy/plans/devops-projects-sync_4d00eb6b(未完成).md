---
name: devops-projects-sync
overview: 需求登记的项目选项改为运维平台应用数据（JenkinsFrontweb + JenkinsPAAS 两分组），默认数据内置配置文件、支持"同步项目数据"按钮更新并存 localStorage；废弃现有手动项目列表；构建环境选项新增 pre-txnj。
todos:
  - id: write-plan-doc
    content: 将本计划整理写入 docs/devops-projects-sync-plan.md
    status: pending
  - id: extract-config
    content: 从 data.json 提取数据生成 src/config/devopsApps.ts，删除 data.json
    status: pending
    dependencies:
      - write-plan-doc
  - id: storage-hooks
    content: 改造 storage.ts 与 useWorkTracker.ts，实现 useDevopsApps 本地存储
    status: pending
    dependencies:
      - extract-config
  - id: fetch-and-env
    content: build.ts 新增 fetchDevopsApps 与 pre-txnj，BuildControls 加环境选项
    status: pending
    dependencies:
      - extract-config
  - id: ui-refactor
    content: 改造 ProjectSelect/RequirementForm/FilterBar/App.tsx，删除 ProjectManager
    status: pending
    dependencies:
      - storage-hooks
  - id: server-route
    content: server/src/index.ts 新增 /devops-api/deploy/application 转发路由
    status: pending
  - id: verify
    content: 运行 tsc/vite build 验证类型与构建，走查同步流程
    status: pending
    dependencies:
      - ui-refactor
      - fetch-and-env
      - server-route
---

## 用户需求

在「登记需求」弹窗填写项目时，项目选项直接来自运维平台应用列表（GET `https://devops.vzan.com/deploy/application?group=JenkinsFrontweb` 和 `?group=JenkinsPAAS`）。要求：

1. 先把两个接口的现有数据作为默认数据，单独放一个配置文件
2. 项目选择旁加「同步项目数据」按钮，点击重新拉取接口更新数据，数据先存 localStorage（后续再接数据库）
3. 构建分支（环境）选项新增 `pre-txnj`

## 已确认决策

- 默认数据：用户已将两个接口返回粘贴至 `d:\工作\创意\mywork\data.json`（两段 JSON 数组拼接，第一段 JenkinsFrontweb 76 个应用，第二段 JenkinsPAAS 11 个应用），提取进配置文件后删除该临时文件
- 同步按钮位置：登记需求弹窗内「项目 / 分支」标题右侧
- 数据合并：废弃现有 44 个默认项目及手动添加/项目管理功能，项目选项完全来自运维平台数据（配置文件默认 + localStorage 同步覆盖）
- pre-txnj：加入 BuildControls 构建环境下拉，构建分支解析为 `origin/pre-txnj`

## 核心功能

- 配置文件内置两个分组的默认应用数据（app/alias/group）
- 项目下拉选项展示 `app（alias）`，支持按 app/alias 搜索；筛选栏项目选项同步切换
- 同步按钮带 loading；未登录/接口异常时提示「请先登录运维平台」；成功后整体覆盖本地存储
- 部署服务端新增 `/devops-api/deploy/application` 转发路由

## 技术栈

沿用现有栈：React 19 + TypeScript + Vite + antd 5 + dayjs；localStorage 持久化；Fastify 转发服务（server/）。

## 实现方案

### 总体策略

以「配置文件默认数据 + localStorage 覆盖层」替代原手动项目列表：新增 `DevopsApp` 类型与默认数据配置文件；storage/hooks 层把 `useProjects` 替换为 `useDevopsApps`；`build.ts` 新增 `fetchDevopsApps()`（走现有 `/devops-api` 代理，dev 走 Vite proxy、部署走 server 转发）；UI 层统一用 `app（alias）` 作为选项 label。

### 关键决策

- **去重**：两个分组存在同 app（audit-web、yingxiao-pc、yx-web 等），合并时按 `app` 去重，保留先出现者（JenkinsFrontweb 优先）
- **未登录判断**：接口未登录时返回 200 + `{error_code:"user:user_login_failed"}`，必须校验响应为数组，否则抛出「未登录」错误
- **同步语义**：成功后整体覆盖 localStorage（replaceAll），不做增量合并，保证与运维平台一致
- **pre-txnj 兼容**：`resolveBuildBranch` 对非 live-h5-2 直接 `'origin/' + env` 已天然兼容；live-h5-2 分支循环不命中时回落 env 值，同样兼容，仅需扩展 `BuildEnv` 类型与 `ENV_OPTIONS`
- **旧数据弃用**：`work-tracker:projects:v1` / `seeded` key 不迁移、不删除（用户本地残留无害），代码不再引用

## 实施注意

- 性能：同步为低频手动操作，两个 GET 用 `Promise.all` 并行；下拉 options 用 useMemo 无需额外缓存
- 错误处理：`fetchDevopsApps` 任一分组失败即整体失败并提示；401/403/error_code 统一归为「未登录运维平台，请先登录」
- 兼容性：Requirement.items.project 仍是 string（app 名），存量需求数据不受影响；FilterBar 的 FilterValue.project 保持 string
- 不自动提交代码；执行前先把计划写入 `docs/devops-projects-sync-plan.md`（用户固定协作流程）
- data-testid：本项目无项目级规则，默认不添加（如用户提出要求再加）

## 目录结构

```
mywork/
├── docs/
│   └── devops-projects-sync-plan.md      # [NEW] 本计划的执行文档（用户协作流程要求）
├── data.json                              # [DELETE] 临时传输文件，数据提取后删除
├── src/
│   ├── config/
│   │   └── devopsApps.ts                  # [NEW] DevopsApp 类型（app/alias/group）、DEVOPS_GROUPS 常量、DEFAULT_DEVOPS_APPS 默认数据（从 data.json 提取，按 app 去重）
│   ├── storage.ts                         # [MODIFY] 删除 DEFAULT_PROJECTS/SEED_KEY 播种逻辑；新增 work-tracker:devops-apps:v1 的 loadDevopsApps（无存储回退配置文件默认数据）/saveDevopsApps
│   ├── build.ts                           # [MODIFY] BuildEnv 加 'pre-txnj'；新增 fetchDevopsApps()（并行拉两分组、校验数组、去重合并）
│   ├── hooks/
│   │   └── useWorkTracker.ts              # [MODIFY] useProjects 替换为 useDevopsApps：state DevopsApp[]，持久化，暴露 apps 与 replaceAll
│   ├── components/
│   │   ├── ProjectSelect.tsx              # [MODIFY] 移除手动添加区域与 onAddProject；options 改为 app（alias），optionFilterProp="label"
│   │   ├── RequirementForm.tsx            # [MODIFY] props 改 apps/onSync/syncing；「项目 / 分支」标题右侧加「同步项目数据」按钮（SyncOutlined + loading）
│   │   ├── FilterBar.tsx                  # [MODIFY] projectOptions 改传 apps，选项 label 带 alias
│   │   ├── BuildControls.tsx              # [MODIFY] ENV_OPTIONS 加 pre-txnj，Select 宽度 76→96
│   │   └── ProjectManager.tsx             # [DELETE] 项目管理弹窗整体移除
│   └── App.tsx                            # [MODIFY] 删 ProjectManager 相关引用/按钮/state；接入 useDevopsApps 与同步回调（antd message 成功/失败提示）；删除导入流程里的 mergeProjects 调用
└── server/
    └── src/
        └── index.ts                       # [MODIFY] 新增 GET /devops-api/deploy/application 转发（透传 group query，参考现有 branch 路由写法）
```

## 关键代码结构

```ts
// src/config/devopsApps.ts
export type DevopsGroup = 'JenkinsFrontweb' | 'JenkinsPAAS';
export interface DevopsApp { app: string; alias: string; group: DevopsGroup }
export const DEVOPS_GROUPS: DevopsGroup[] = ['JenkinsFrontweb', 'JenkinsPAAS'];
export const DEFAULT_DEVOPS_APPS: DevopsApp[] = [/* 从 data.json 提取，按 app 去重 */];

// src/build.ts
export type BuildEnv = 'dev' | 'test' | 'pre' | 'pre-txnj';
export async function fetchDevopsApps(): Promise<DevopsApp[]>; // 非数组响应抛未登录错误
```