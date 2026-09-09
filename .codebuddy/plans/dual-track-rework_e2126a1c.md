---
name: dual-track-rework
overview: 废弃单流水线/看板模型，改为「微赞轨 + 星享轨」双轨并行模型：移除看板与版本流水线，需求卡片按轨独立推进/构建/提交MR，列表按发版日期分组为大框，页面改为视口高度内左右分栏各自滚动。
design:
  architecture:
    framework: react
  styleKeywords:
    - 信息密度优先
    - 双轨并列
    - 一屏无滚动
    - 分组大框
  fontSystem:
    fontFamily: PingFang SC
    heading:
      size: 16px
      weight: 600
    subheading:
      size: 13px
      weight: 600
    body:
      size: 12px
      weight: 400
  colorSystem:
    primary:
      - "#1677ff"
      - "#fa8c16"
    background:
      - "#f5f5f5"
      - "#ffffff"
      - "#fafafa"
    text:
      - "#1f1f1f"
      - "#666666"
      - "#999999"
    functional:
      - "#52c41a"
      - "#ff4d4f"
      - "#faad14"
todos:
  - id: model-track-config
    content: 改造 types.ts 与 config/track.ts：双轨字段、派生状态、迁移函数，删除流水线/看板配置层
    status: completed
  - id: storage-hooks-cleanup
    content: 清理 storage（视图/流水线键）、useWorkTracker（删排序体系）、useBuildPlan 按轨改造
    status: completed
    dependencies:
      - model-track-config
  - id: card-dual-track
    content: 重写 RequirementCard 双轨行（阶段/测试通过/目标环境/构建/MR），去拖拽与排序
    status: completed
    dependencies:
      - model-track-config
  - id: list-grouping-filter-stats
    content: 列表按发版日分组大框、FilterBar 单日期筛选、StatsBar 双轨计数、batch 按轨展开
    status: completed
    dependencies:
      - model-track-config
      - storage-hooks-cleanup
  - id: page-layout-viewport
    content: RequirementListPage 与 AppLayout 改视口内布局，BuildPanel 去 sticky 等高固定列
    status: completed
    dependencies:
      - card-dual-track
      - list-grouping-filter-stats
  - id: remove-board-settings-export
    content: 删除 BoardView/BoardCard/PipelineConfigPage 及设置菜单、GeneralConfig 默认视图、export 校验适配、卸载 dnd-kit
    status: completed
    dependencies:
      - model-track-config
  - id: build-verify
    content: tsc 与 npm run build 零错误验证，更新计划文档
    status: completed
    dependencies:
      - page-layout-viewport
      - remove-board-settings-export
---

## 用户需求

推翻"单流水线+看板"模型：一个需求可在微赞轨（dev/test/pre/master）与星享轨（preb-txnj/pre-txnj/prod-txnj）上并行推进，单 `currentEnv` 无法表达。用户拍板：

1. 移除看板全部相关功能；
2. 每轨保留「测试通过」手动勾选；
3. 删除"版本流水线"概念，恢复原来的「大版/独立」纯标签版本字段；同时删除流水线配置页；
4. 列表按发版日期分组（每个发版日一个大框）；发版日期筛选从时间区间改为单选下拉（选项=所有需求已填发版日期的去重列表）；
5. 移除手动排序与按发布日期排序；
6. 右侧构建面板去掉 sticky（滚动效果怪），左侧内容区盛满剩余高度、整页不滚动。

## 产品概述

本地工作记录系统（React 18 + TS + Vite + antd 5，localStorage 持久化，PC 端）。核心：登记需求（名称/TAPD/项目分支/版本/发版日），按双轨推进环境进度并触发构建/提交 MR，右侧常驻构建任务面板。

## 核心功能

- **双轨进度**：每需求两条轨各自独立推进（阶段 Select + 测试通过勾选 + 目标环境 Select + 构建/MR 按钮），状态由轨阶段派生，不再手工维护 10 态枚举。
- **列表按发版日分组**：日期升序大框分组，未填发版日置底；组内卡片网格。
- **构建/MR 按轨操作**：作用于该需求全部有效项目（排除"不参与构建"），目标环境=本行轨环境；构建成功自动推进对应轨。
- **视口内布局**：整页不滚动，左侧头部固定 + 列表区内部滚动，右侧构建面板等高固定列。
- **筛选/统计适配**：状态统计改双轨维度计数；「已达环境」筛选=任一轨命中；发版日筛选单选。

## 技术栈

沿用现有：React 18 + TypeScript + Vite + Ant Design 5 + react-router-dom 6 + dayjs + localStorage。删除 @dnd-kit 依赖（看板与拖拽排序均移除后无引用）。

## 实现方案

### 核心模型（types.ts）

- 恢复 `VERSIONS = ['大版','独立']` 与 `Requirement.version?: Version`（纯标签，默认大版）。
- 删除：`PipelineType`、`versionPipeline`、`currentEnv`、`buildEnv`、`SortMode`、10 态 `STATUSES`/`STATUS_COLORS`。
- 新增：`Track = 'weizan' | 'star'`；`TRACK_ENVS: Record<Track, BuildEnv[]>`（weizan=[dev,test,pre,master]，star=[preb-txnj,pre-txnj,prod-txnj]）；`Requirement` 新增 `envWeizan?: BuildEnv|null`、`envStar?: BuildEnv|null`、`testPassWeizan?: boolean`、`testPassStar?: boolean`。
- 派生状态（纯函数，存于 config/track.ts）：`trackStatus(track, env, testPass)` → 每轨显示态（如 test→测试中/测试通过、master→微赞已上线、prod-txnj→星享已上线）；`overallStatus(req)` → '开发中'|'进行中'|'部分上线'|'已发布'（已发布=所有已开始轨都到末段；两轨未开始=开发中）。`Requirement.status` 字段废弃为派生展示（保留字段存储以兼容导入导出，渲染统一用派生值）。

### 配置层

- 删除 `src/config/pipelines.ts`、`src/pages/PipelineConfigPage.tsx`、SettingsPage 的 pipelines 菜单、`storage.ts` 的 PIPELINES_KEY/loadPipelines/savePipelines/DEFAULT_PIPELINES_FALLBACK。
- `config/pipeline.ts` 重写为 `config/track.ts`：保留 `ENV_CLUSTER`/`CLUSTER_COLOR`，新增 `clusterOfEnv(env)`、`trackOfEnv(env)`、轨阶段序号 `trackStageIndex(track, env)`、每轨派生状态、整体派生状态、`backfillRequirement` 新迁移（旧 currentEnv 按集群拆到 envWeizan/envStar；versionPipeline 存在→version='大版'；buildEnv 废弃不再迁移，目标环境由轨阶段推导默认值）。
- storage 删除 DEFAULT_VIEW_KEY/loadViewPreference/saveViewPreference；AUTO_ADVANCE_STATUS 保留（语义=构建成功自动推进对应轨）。

### 卡片（RequirementCard 重写中部/底部）

头部保留（勾选/名称链接/版本 Tag/构建小灯/⋯编辑删除）；项目区保留（子勾选/不构建灰显/单项 MR/折叠）。中部改两条轨行，每行：`阶段 Select`（选项=本轨环境+"未开始"，变更即推进该轨）+ `测试通过 Checkbox` + `目标环境 Select`（默认=本轨当前阶段的下一环境，可改）+ `构建` + `提交MR`（作用于全部有效项目，复用页面 handleBoardBuild/handleBoardMr 改为按轨传 env）。删除 useSortable 拖拽把手与卡片内会话态子勾选联动说明保持不变（构建范围逻辑沿用 isBuildExcluded）。

### 列表页（RequirementListPage）

- 删 view/Segmented/BoardView 分支/showPublished 列隐藏、sortMode/handleReorder/handleChangeSortMode、moveToPublishedTop/sortByReleaseDate 调用。
- 新增分组渲染：filtered 按 releaseDate 分组（升序，未填组"未填发版日期"置底），每组一个大框（标题=日期+计数），框内复用卡片网格（RequirementCardGrid 去 dnd/排序按钮后作为纯网格）。
- auto-advance useEffect 改为：任务 env 所属轨 → 推进对应轨（stageIndex 改 trackStageIndex）。
- useBuildPlan 按轨改造：`getEnv(req, track)`/`getBuildOther(req, track)`/`setEnv(req, track, env)`；目标环境持久化字段改为 `targetWeizan?`/`targetStar?`（缺省=轨下一阶段）。
- 「显示已发布」开关保留（默认开，关闭时过滤 overallStatus='已发布'）。
- 布局：根容器 height:100% flex；左 Card 头部区固定 + 列表区 flex:1 overflow-y:auto；右侧 BuildPanel 去 sticky 改 height:100% 固定列（内部任务列表与 ArtifactList 各自限高滚动）。
- AppLayout：Content 改 height:calc(100vh - 56px) + overflow:hidden。

### 筛选/统计/批量

- FilterBar：releaseDateRange→`releaseDate?: string|null` 单选 Select，选项=全部需求已填日期的去重降序列表；「已达环境」语义=任一轨命中。
- StatsBar：双轨维度计数（`微赞·test:3`、`星享·pre-txnj:2` 组合 Tag，点击设「已达环境」筛选联动）。
- batch.ts/BatchPanel：collectBuildTargets/collectMrTargets 按轨展开（每需求×每已参与轨一条目标），每需求小框按轨分行显示目标环境。
- export.ts：isValidRequirement 适配（status 字段宽松校验，新轨字段类型校验）。

### 迁移

backfillRequirement：旧 currentEnv→按集群拆两轨；versionPipeline 存在→version='大版'；返回 changed 供迁移按钮统计。旧 STATUSES 数据中的 status 字段保留但不再渲染。

## 实施注意

- 每步后 `npx tsc --noEmit`；全部完成 `npm run build` 零错误。
- data-testid 沿用 {模块}-{语义}-{类型} 惯例（新轨行控件：card-track-weizan-env-select-{id} 等）。
- 不自动提交代码；改动文档 docs/plans/board-ux-revise-plan.md 追加"已被双轨方案取代"说明，新计划落 docs/plans/dual-track-rework-plan.md。

沿用 antd 5 现有视觉体系，不做风格变更，重点是布局与卡片结构重排：

1. **页面骨架**：视口内一屏布局。Header 56px 固定；下方左右两栏等高（calc(100vh-56px)）。左栏 Card：头部（标题按钮行/统计条/筛选行/显示已发布开关）固定，列表区占满剩余高度并内部滚动；右栏 BuildPanel 去掉 sticky，改为等高固定列，任务列表与制品清单各自限高滚动；折叠态 44px 竖条不变。
2. **发版日分组列表**：每个发版日期一个大框（浅灰底圆角容器，框头为日期+需求数，如「2026-09-12 · 4 条」），框内卡片瀑布流网格；日期升序排列，「未填发版日期」组置底并弱化标题色。
3. **双轨卡片**：头部（勾选+名称链接+版本 Tag+小灯+⋯菜单）与项目区不变；中部为两条轨行，每行左侧集群色点（微赞蓝 #1677ff/星享橙 #fa8c16）+轨名，随后 阶段 Select、测试通过 Checkbox、目标环境 Select、构建/提交MR 按钮，一行放不下时按钮折行到行尾；未开始的轨阶段显示"未开始"占位，整体弱化（灰字）但可操作。底部原统一构建栏删除。
4. **统计条**：双轨组合计数 Tag（如「微赞·test 3」「星享·pre-txnj 2」），配色沿用 STATUS_COLORS 语义（进行中 gold、通过 green、已上线 default）。