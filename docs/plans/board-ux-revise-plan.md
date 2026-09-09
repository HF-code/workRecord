# 修订计划：看板/构建面板/字段/状态 二次调整

> 基于已落地的「阶段 0 + P0 + P1」（`docs/plans/board-ux-optimization-dev-plan.md`）做返工。
> **先规划，待用户确认后执行。不自动提交代码。**
> 触发：用户实测后反馈 6 点（右栏位置、构建任务精简、切换/开关去重、字段合并+流水线配置、状态重定义、看板卡功能化）。

## 一、逐条改造点

### 1. 构建面板改为「页面级右栏」
- `RequirementListPage` 当前把 `<BuildPanel>` 放在主 `Card` 内部的「主体两栏」里（在标题/统计/筛选之下）。
- 改为：**主 `Card` 与 `<BuildPanel>` 平级**，外层 `display:flex`；右栏从页面顶部起、sticky 占满视口高度，不在任何按钮/查询区之下。
  - 左：`<Card>`（标题按钮行 + 工具行 + 筛选 + 批量面板 + 视图内容）
  - 右：`<BuildPanel open onToggle>`（展开态 `position:sticky; top:24; maxHeight: calc(100vh-48)`，折叠态 44px 竖条不变）

### 2. 构建任务展示精简
- `BuildPanel` 内 `BuildTaskItem` 改为只显示：**项目(app) · 环境(env)** + 状态 Tag + 成功时的**制品链接(file_url)** + 取消/移除按钮。
- 删除：`reqName`、`detail`、`recordUrl`（"需求无关，只看项目/环境/制品"）。`startBuildTask` 仍可按需传 `reqIds`（小灯/自动推进用），但 UI 不展示。

### 3. 列表/看板切换位置 + 单一"显示已发布"开关
- `Segmented`（列表/看板）从**标题行**移到**筛选区之下、视图内容之上**（单独一行，右侧放"显示已发布"开关）。
- **删除** FilterBar 内的「仅看未发布/显示全部」按钮；**删除** 看板内的「显示已发布」Switch。
- 新增页面级 `showPublished: boolean`（默认 `false`，即默认隐藏已发布），由切换行右侧 Switch 控制（列表/看板通用，唯一入口）。
  - `showPublished=false` → `filtered` 过滤 `status==='已发布'`；看板隐藏末段列。
  - `showPublished=true` → 显示全部。
- `FilterBar` 状态多选默认空（=全部），不再用 `UNPUBLISHED_STATUSES` 默认集；状态选项仍完整（含"已发布"，但默认被 showPublished 过滤掉）。

### 4. 合并「版本」+「流水线」为单一字段「版本流水线」+ 流水线配置页
- 删除 `Requirement.version`、`Requirement.pipeline`；新增 `Requirement.versionPipeline: string`（值=流水线配置 type，默认 `'standard'`）。
- **旧数据迁移**（`backfillRequirement` 更新）：`version==='独立'|'大版'` 或 `pipeline` 存在 → 统一填 `'standard'`（旧数据与默认数据都是常规大版）。
- `config/pipeline.ts` 改造为**可配置**（仿 `branches.ts`）：
  - `PipelineConfig { type: string; label: string; stages: BuildEnv[] }`；`loadPipelines()/savePipelines()`；`DEFAULT_PIPELINES`（4 条：常规大版/只发星享/仅发微赞/先微赞后星享）。
  - `getStages(type)`/`getFinalStage(type)`/`allowedEnvs(type)`/`isPipelineComplete(type,env)` 改为读可配置数据；`PipeLineType` 联合类型→`string`。
  - `STAGE_TO_STATUS`/`STATUS_RANK`/环境→状态映射保持固定（环境固定 7 个）。
- **新增流水线配置页** `src/pages/PipelineConfigPage.tsx` + 路由 `/settings/pipelines`（SettingsPage 子菜单加项）。表格：类型(type,唯一)、名称、环境链路(多选 7 环境有序)、增删改；默认 4 条可改不可删（或允许删，删除后引用该 type 的需求回退 standard）。
- 表单（`RequirementForm`）：去掉「版本」「流水线」两个字段，合并为单个**「版本流水线」Select（必填，默认常规大版）**，旁边加「配置」按钮（`window.open('/#/settings/pipelines')` 新标签页跳设置）。
- 卡片（`RequirementCard`/`BoardCard`）：版本流水线合并为**单个 Tag**（替代原"版本"+流水线两个 Tag）；⋯ 菜单的"流水线"子菜单改为切"版本流水线"。

### 5. 状态枚举重定义（按环境分组，pre 不特殊化）
新 `STATUSES`（单调进阶，每个测试环境都有"测试中/测试通过"两态；pre 也是普通测试环境，不归"待发布"）：
```
开发中 → 测试中 → 测试通过 → preb-txnj测试中 → preb-txnj测试通过
→ pre-txnj测试中 → pre-txnj测试通过 → pre测试中 → pre测试通过 → 已发布
```
- `STAGE_TO_STATUS`（环境→对齐起始状态）：
  - dev→开发中；test→测试中；preb-txnj→preb-txnj测试中；pre-txnj→pre-txnj测试中；**pre→pre测试中**；prod-txnj→已发布；master→已发布。
- `STATUS_RANK`：上述顺序 1..10。
- `STATUS_COLORS`：开发中 blue、测试中 gold、测试通过 green、preb-txnj测试中 purple、preb-txnj测试通过 green、pre-txnj测试中 purple、pre-txnj测试通过 green、**pre测试中 purple、pre测试通过 green**、已发布 default。
- 看板列可见性：`showPublished=false` → 列集 = `dev/test/preb-txnj/pre-txnj/pre`（**prod-txnj、master 两列隐藏**）；`=true`（**默认**）→ 全 7 列（含 prod-txnj/master 与已发布需求）。

### 6. 看板卡片功能化（不再点击跳 TAPD）
`BoardCard` 从"精简只读卡"改为"功能卡"（复用页面回调）：
- 顶部：`[勾选]` 需求名（**纯文本不跳转**）+ 版本流水线 Tag + 构建小灯 + ⋯(编辑/删除)。
- 中部：`当前环境 Select`（推进，同源 `onAdvanceEnv`）+ 状态 Tag。
- 项目分支：列出 `项目 / 分支`（可折叠 >4），含「不构建」灰显标识（展示处理）。
- 底部：`[构建]` `[提交MR]` `[查看详情↗]`（查看详情 = 新窗口打开 TAPD 链接）。
- 拖拽：卡片整体 `useDraggable`（环境推进）；勾选框 `stopPropagation` 不触发拖拽。
- 构建/MR 逻辑（作用于该需求全部有效项目，排除"不参与构建"标记）：提取到共享函数（如 `batch.ts` 的 `collectBuildTargets` 已支持，BoardCard 内联调用 `startBuildTask`/`buildMergeRequestUrl` + `getCsrfToken`）。
- 批量勾选：`onToggleSelect` 复用页面 `selectedReqIds`，勾选后下方 `BatchPanel` 照常出现。

## 二、涉及文件清单

**新增**
- `src/pages/PipelineConfigPage.tsx`（流水线配置：增删改、默认 4 条）
- `src/config/pipelines.ts`（替代原 `pipeline.ts` 的写死部分：PipelineConfig 类型 + load/save + 默认 4 条 + getStages 等读配置版）

**修改**
- `src/types.ts`：删 `version`/`pipeline`，加 `versionPipeline: string`；`STATUSES`/`STATUS_COLORS`/`STATUS_RANK` 重定义；`STAGE_TO_STATUS` 移入 types 或 config。
- `src/config/pipeline.ts` → 改造为可配置（或改名 `pipelines.ts`，保留 `BOARD_COLUMNS`/`ENV_CLUSTER`/`CLUSTER_COLOR`/`STAGE_TO_STATUS`/`STATUS_RANK`/`advanceStatus`/`backfillRequirement` 等，函数读可配置 pipelines）。
- `src/storage.ts`：加 `PIPELINES_KEY` load/save；迁移 `migrateDevopsAppsExcludeFlag` 保留。
- `src/hooks/useWorkTracker.ts`：`migrateToPipeline`/`backfillRequirement` 引用更新；`upsert` 表单值 `versionPipeline`。
- `src/components/RequirementCard.tsx`：版本流水线单 Tag；⋯ 菜单改切 `versionPipeline`；保持现有小灯/环境Select/不构建标识。
- `src/components/RequirementForm.tsx`：合并字段 + 「配置」按钮。
- `src/components/BoardCard.tsx`：**重写为功能卡**（勾选/环境Select/状态/项目分支/构建/MR/查看详情/小灯/编辑菜单）。
- `src/components/BoardView.tsx`：列集受 `showPublished` 控制；传入卡片所需全部回调。
- `src/components/BuildPanel.tsx`：移到页面级右栏；`BuildTaskItem` 精简（项目·环境·状态·制品链接）。
- `src/components/FilterBar.tsx`：删"仅看未发布/显示全部"按钮；`statusCounts`/`envOptions` 保留。
- `src/components/StatsBar.tsx`：遍历新 `STATUSES`。
- `src/pages/RequirementListPage.tsx`：主 Card 与 BuildPanel 平级 flex；切换行（Segmented + 显示已发布 Switch）置于筛选之下；`showPublished` 状态 + 过滤逻辑；`view` 默认读配置；透传看板卡新回调。
- `src/pages/SettingsPage.tsx`：子菜单加"流水线配置"（→ `/settings/pipelines`）。
- `src/router.tsx`：加 `/settings/pipelines` 路由。
- `src/pages/QuickBuildPage.tsx`：仅"不参与构建"逻辑，不受本次字段合并影响（仍读 `excludeFromBuild`）；无需改。

## 三、实施顺序建议
1. 类型/配置层：types(状态+字段) → pipelines.ts 可配置 → storage → useWorkTracker 迁移。
2. 状态/字段 UI：RequirementForm、RequirementCard、StatsBar、FilterBar。
3. 布局：RequirementListPage（右栏平级 + 切换行 + showPublished）、BuildPanel 精简 + 移出。
4. 看板：BoardView(列集) + BoardCard(功能化)。
5. 流水线配置页 + 路由 + 设置菜单。
6. `npm run build` 验证零错误。

## 四、待确认（已确认）
- a. ✅ 看板卡底部"构建/提交MR"作用于**该需求全部有效项目**（排除"不参与构建"标记）。
- b. ✅ 旧"独立"/旧"大版"数据一律归为常规大版（standard）。
- c. ⚠️ 修正：**pre 不特殊化**，pre 拆为「pre测试中 / pre测试通过」两态（同其他测试环境），不归"待发布"。见第 5 点更新。
- d. ✅ "显示已发布"开关**默认开**（显示全部，含已发布与 prod-txnj/master 两列）。

## 五、执行状态（2026-09-09）
- ✅ 全部 6 点 + 4 项确认已落地，`npm run build` 通过（tsc 零错误）。
- 新增 `src/config/pipelines.ts`（可配置流水线读写）+ `src/pages/PipelineConfigPage.tsx`（流水线配置页）；`config/pipeline.ts` 改为读配置并保留固定列/状态映射。
- 改动文件：types / config(pipeline,pipelines) / storage / useWorkTracker / RequirementForm / RequirementCard / FilterBar / StatsBar / BuildPanel / BoardView / BoardCard / RequirementListPage / SettingsPage / export。
- 未提交代码（按规则需用户确认后再提交）。
