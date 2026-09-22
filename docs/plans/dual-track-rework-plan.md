# 双轨模型重构（dual-track-rework）

> 状态：已执行完成（2026-09-09），`npm run build` 零错误。
> 取代 `board-ux-revise-plan.md`（单流水线方案，因并行发布模型不成立而作废）。

## 背景

单流水线模型（一个需求一个 `currentEnv` 沿一条链前进）表达不了真实发布方式：
一个需求可能同时并行在 微赞 `pre` 和 星享 `pre-txnj`。看板"一需求一列"因此不成立，
单状态枚举也无法表达并行，全部废弃。

## 新模型

- **双轨并行**：`envWeizan`（dev→test→pre→master）/ `envStar`（preb-txnj→pre-txnj→prod-txnj），null=未开始。
- **版本**：恢复纯标签 大版/独立，无行为含义。
- **状态**：全部派生——每轨 `trackStatus()`（阶段投影 + 手动「测试通过」勾选），
  整体 `overallStatus()`（开发中/进行中/部分上线/已发布，已发布=所有已开始轨到末段）。
- **构建/MR 按轨**：直接作用于该轨**当前环境**（每轨只有「当前环境」一个选择，未开始回退首环境），
  构建/MR 覆盖该需求**全部项目**（不受项目配置「不参与构建」影响——代码都要合）。
- **自动推进**：构建成功且开关开启时，把该构建环境所在轨向前推进（重置测试通过）。

## 用户拍板

1. 看板全部移除（BoardView/BoardCard/视图切换/默认视图配置）。
2. 每轨保留「测试通过」手动勾选。
3. 删除版本流水线（含配置页），恢复 大版/独立。
4. 列表按发版日分组大框（升序、未填组置底）；发版日筛选改单选下拉（选项=已有日期）；
   移除手动排序与发布日期排序（连带 dnd-kit 依赖卸载）。
5. 整页不滚动：Header 56px 固定，左右两栏等高，左列内部滚动，右栏构建面板等高固定（去 sticky）。

## 落地文件

- `src/types.ts`：双轨字段（envWeizan/envStar/testPass*），删 STATUSES/PipelineType/SortMode/currentEnv/buildEnv。
- `src/config/track.ts`（新）：TRACK_ENVS/TRACK_LABELS/ENV_CLUSTER/CLUSTER_COLOR/trackOfEnv/trackStageIndex/trackEnvOf/trackStatus/overallStatus/startedTracks/trackTargetOf/backfillRequirement（旧数据迁移：currentEnv/旧status 按集群拆轨，已发布=两轨置末段）。
- 删除：`config/pipeline.ts`、`config/pipelines.ts`、`components/BoardView.tsx`、`components/BoardCard.tsx`、`pages/PipelineConfigPage.tsx`、`components/StatusTag.tsx`（无引用遗留）。
- `src/storage.ts`：删视图偏好/流水线键；`migrateLegacyBuildPlan` 旧 buildEnv 按集群落到轨目标。
- `src/hooks/useWorkTracker.ts`：删排序体系（reorder/sortByReleaseDate/moveToPublishedTop）；`migrateToDualTrack`；`useBuildPlan()` 按轨（getTarget=当前环境 / getBuildOther）。
- `src/batch.ts`：collectMrTargets/collectBuildTargets 按「已开始轨」展开（每轨取当前环境，覆盖全部项目）。
- `src/components/RequirementForm.tsx`：去状态/流水线/目标分支，恢复版本 Select。
- `src/components/RequirementCard.tsx`：双轨块（状态行：轨点+派生状态+测试通过；操作行：当前环境/构建/MR），去拖拽与子勾选。
- `src/components/RequirementCardGrid.tsx`：纯瀑布流网格（去 dnd/排序按钮）。
- `src/components/FilterBar.tsx`：项目/已达环境（任一轨命中）/发版日期（单选）/关键词。
- `src/components/StatsBar.tsx`：双轨·环境计数 Tag，点击设「已达环境」筛选。
- `src/components/BatchPanel.tsx`：按轨展示当前环境与清单（全量项目，可 X 临时排除）。
- `src/components/BuildPanel.tsx`：等高固定列（去 sticky）。
- `src/pages/RequirementListPage.tsx`：发版日分组大框 + 双轨处理器 + 视口内布局（左 Card 内部滚动、右 BuildPanel）。
- `src/layouts/AppLayout.tsx`：首页路由 `overflow:hidden` + `calc(100vh-56px)`，其余页正常滚动。
- `src/pages/GeneralConfigPage.tsx`：删默认视图；「构建成功自动推进」开关（原状态自动对齐）。
- `src/pages/SettingsPage.tsx`：删流水线配置菜单。
- `src/export.ts`：导入校验适配双轨字段（旧 status 宽松忽略）。

## 数据迁移

> ⚠️ **已废止**（2026-09-21）：本节描述的「一次性静默迁移」已全部删除，改为「运行时零兼容 + 旧数据只在导入边界转换」。
> 见 `bugfix-requirement-form-and-mr-tabs-plan.md`。下面保留原文仅作历史记录。

- **一次性静默迁移**（无按钮）：首次加载时执行（`work-tracker:dual-track:migrated:v1` 标记，此后不再执行，
  避免覆盖用户手动移除的轨）：currentEnv/旧 status → 按集群拆轨；旧「已发布」→ 两轨都置末段；
  旧 versionPipeline：starOnly → 移除微赞轨、weizanOnly → 移除星享轨；version 缺失归大版；
  清理 versionPipeline/currentEnv/buildEnv 旧键。
- 新建需求默认双轨可见（未开始态）。

## 反馈修订（2026-09-09 第二轮）

1. 发版日分组改**降序**（最新在前，未填组仍置底）。
2. **删除构建成功自动推进**逻辑（页面 effect、通用配置开关、storage 键全部移除）。
3. 轨盒子加 **X 移除**（`envXxx: undefined` = 该轨不参与；卡片下方「+ xx轨」恢复为未开始）。
4. 内容区移除「快速构建」按钮（导航菜单保留）；删除「迁移老数据」按钮（改一次性静默迁移）；
   「显示已发布」开关与「统计项目」合并到统计行右侧一行。
5. 布局改**内容区整体滚动**（AppLayout Content 唯一滚动容器）：列表区不再内部滚动；
   批量构建区 **sticky 吸顶**（top:8）；右侧构建面板 sticky 等高列（top:16，高度 calc(100vh-88px)）。

## 反馈修订（2026-09-17 第三轮）

1. **每轨只保留「当前环境」一个选择**：删除「目标环境」下拉与 `targetWeizan`/`targetStar` 字段
   （含旧数据一次性清理 `work-tracker:dual-track:strip-targets:v1`）——构建与提交 MR 都直接作用于
   该轨当前环境（未开始回退首环境），不再有「下一环境推导 + 显式目标」双入口；
   卡片下拉 tooltip 改述为「该轨当前环境：构建与提交 MR 都作用于此环境」。
2. **构建/MR 全量化**：不再受项目配置「不参与构建」（`excludeFromBuild`）影响——
   卡片构建/MR、批量构建/批量 MR 一律覆盖需求全部项目（代码都要合）；
   批量面板删除「已按项目配置跳过 / 仍构建」相关 UI 与 `included` 会话态；
   卡片的「不构建」灰显标识移除。
3. 「不参与构建」配置仅在**快速构建页**生效（默认跳过 + 「本次包含」开关），
   项目配置页提示文案同步调整。

## 提交状态

已全部落地并提交（2026-09-09 起随多轮提交进入主干，含后续「界面交互改版」「mr 调整」「去目标分支 + 构建/MR 全量化」）。
