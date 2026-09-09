# 开发计划（任务清单）：环境看板 + 常驻构建面板 + 筛选/通知/排除优化

> **执行状态：2026-09-09 阶段 0 + P0 + P1 + P2 部分已完成，`npm run build`（tsc + vite）零错误，lint 无诊断。未提交代码（待用户确认）。**
> P2 已一并完成：构建成功自动推进 currentEnv、已达环境筛选；未做（按计划暂缓）：看板偏好持久化（showCompleted/右栏开合仅会话态）、反馈 5-b 构建方案、看板列折叠。
> 实施备注：① useBuildNotifications 因含 JSX 落地为 `.tsx`；② FilterValue 新增 `currentEnv` 字段（已达环境筛选用）；③ 快速构建页任务不传 reqIds（不关联需求，符合"快速构建不处理"决策）。

> 依据：`docs/plans/feedback-optimization-plan.md`（方案讨论定稿）。
> 执行方式：按阶段勾选执行；**每个阶段完成后跑 `npm run build`（含 tsc --noEmit）验证**；不自动提交代码。
> testid 约定：项目已有部分 `data-testid` 但无显式规则文件——**执行会话开始新增可交互控件前，先与用户确认是否按全局规范补 testid**（格式 `{模块}-{语义}-{类型}`）。

## 已确认决策（2026-09-09）
1. 看板与列表为**同一份数据的两个可切换视图**；默认视图在「系统配置 → 通用配置」可配，**当前默认列表**。
2. **状态自动向前对齐**：`currentEnv` 前进（拖拽/构建成功）时自动把 `status` 提升到对应状态，**只升不降**、手改优先；全局开关 `autoAdvanceStatus`，**默认开**。
3. 反馈 5 **只做 a**：项目级「不参与构建」开关；方案 b（构建方案）暂缓。
4. 右侧构建面板**默认展开**，可折叠。
5. `pipeline`（流水线类型）**登记时必填**（默认"常规大版"），表单/卡片可改。
6. 老数据迁移做成**手动按钮**：仅检测到老数据（缺 `pipeline` 字段）时在需求列表页出现，点击按老 `status` 反推 `currentEnv`、`pipeline` 填"常规大版"。

## 背景模型（实现依据）
- 7 环境双集群：微赞 `dev/test/pre/master`；星享 `preb-txnj/pre-txnj/prod-txnj`。
- 看板列序固定：`dev → test → preb-txnj → pre-txnj → prod-txnj → pre → master`。
- 4 流水线：`standard: dev→test→pre-txnj→prod-txnj→pre→master`；`starOnly: dev→preb-txnj→pre-txnj→prod-txnj`；`weizanOnly: dev→test→pre→master`；`weizanFirst: dev→test→pre→master→pre-txnj→prod-txnj`。
- 完成判定：`currentEnv === 该 pipeline 末段` → 已发布，看板默认隐藏。
- 跳出模板的零散构建走"快速构建"，不处理、不记进度。

---

## 阶段 0：基础设施（类型/配置/存储，P0/P1 共同依赖）

### 0.1 `src/types.ts`
- 新增 `export type PipelineType = 'standard' | 'starOnly' | 'weizanOnly' | 'weizanFirst';`
  （放在 types 而非 config/pipeline，避免 types ↔ pipeline 循环引用）。
- `Requirement` 新增：
  - `pipeline?: PipelineType;`（缺省视为 `'standard'`）
  - `currentEnv?: BuildEnv | null;`（缺省 `null` = 未开始，落 dev 列语义）

### 0.2 新增 `src/config/pipeline.ts`
- 导入：`BuildEnv`（from `../build`）、`PipelineType`/`Status`（from `../types`）。**禁止 import types 之外再被 types 引用**。
- 常量：
  - `PIPELINE_LABELS: Record<PipelineType, string>` = 常规大版/只发星享/仅发微赞/先微赞后星享。
  - `PIPELINES: Record<PipelineType, BuildEnv[]>`（4 条，见背景模型）。
  - `BOARD_COLUMNS: BuildEnv[]` = 7 列固定序。
  - `ENV_CLUSTER: Record<string,'微赞'|'星享'>`。
  - `STAGE_TO_STATUS: Record<string, Status>`：dev→开发中、test→已提测、preb-txnj→预发布测试中、pre-txnj→预发布测试中、prod-txnj→待发布、pre→待发布、master→已发布。
  - `STATUS_RANK: Record<Status, number>`：开发中1 已提测2 测试中3 测试通过4 验收通过5 预发布测试中6 待发布7 线上验证中8 已发布9。（沿 4 条流水线单调不降，已验证）
  - `STATUS_TO_ENV: Record<Status, BuildEnv>`（迁移反推用）：开发中→dev、已提测/测试中/测试通过/验收通过→test、预发布测试中→pre-txnj、待发布/线上验证中→pre、已发布→master。
- 函数（均纯函数 + JSDoc）：
  - `getStages(p?: PipelineType): BuildEnv[]`（缺省 standard）。
  - `getFinalStage(p?: PipelineType): BuildEnv`。
  - `isPipelineComplete(p: PipelineType | undefined, env: BuildEnv | null | undefined): boolean`。
  - `statusForEnv(env: BuildEnv): Status`（查 STAGE_TO_STATUS，未知 env 回退 '开发中'）。
  - `advanceStatus(current: Status, env: BuildEnv): Status`（取 STATUS_RANK 大者，只升不降）。
  - `allowedEnvs(p?: PipelineType): Set<BuildEnv>`（该 pipeline 的 stages 集合，看板可拖入列判断）。
  - `stageIndex(p: PipelineType | undefined, env: BuildEnv): number`（不在流水线返回 -1，构建自动推进比较用）。
  - `backfillRequirement(req: Requirement): { next: Requirement; changed: boolean }`（老数据迁移：缺 pipeline 填 standard；`currentEnv === undefined` 时按 STATUS_TO_ENV[status] 回填；供 0.4 与列表页迁移按钮共用）。
- **注意循环依赖**：`pipeline.ts` → `types.ts`（类型）、`build.ts`（BuildEnv 类型）单向；`types.ts` 不得 import pipeline。

### 0.3 `src/storage.ts`
- `DEFAULT_VIEW_KEY = 'work-tracker:default-view:v1'`：`loadViewPreference(): 'list' | 'board'`（缺省 'list'）、`saveViewPreference(v)`。
- `AUTO_ADVANCE_STATUS_KEY = 'work-tracker:auto-advance-status:v1'`：`loadAutoAdvanceStatus(): boolean`（缺省 true）、`saveAutoAdvanceStatus(on)`。

### 0.4 `src/config/devopsApps.ts`
- `DevopsApp` 新增 `excludeFromBuild?: boolean;`（注释：固定不纳入批量/快速构建，如小程序）。
- 默认数据 `vzanlive_weapp` 条目加 `excludeFromBuild: true`。
- `src/hooks/useWorkTracker.ts` 的 `useDevopsApps` 初始化（`useState(() => ...)`）中做**一次性迁移**（参照 `migrateLegacyBuildPlan` 模式）：若本地已存 apps 且其中 `vzanlive_weapp` 的 `excludeFromBuild === undefined`，置 true 并保存（函数放 storage.ts：`migrateDevopsAppsExcludeFlag()`，幂等）。

---

## 阶段 P0：痛点直击（3 项互相独立，可并行）

### P0-1 反馈 3：状态筛选补全 + 默认未发布
- `src/components/FilterBar.tsx`
  - Props 变更：`statusOptions: Status[]` → 移除，新增 `statusCounts: Partial<Record<Status, number>>`。
  - 状态多选 options 改为**完整 `STATUSES`**，label 带计数：`${s}（${counts[s] ?? 0}）`。
  - 右侧加快捷按钮（`Button type="link" size="small"`）：「仅看未发布」（`statuses = STATUSES.filter(s => s !== '已发布')`）、「显示全部」（`statuses = []`）。
- `src/components/StatsBar.tsx`：遍历完整 `STATUSES`（不再跳过 0 计数）；0 计数 Tag `opacity: 0.45` 仍可点击；激活逻辑不变。
- `src/pages/RequirementListPage.tsx`
  - `INITIAL_FILTER.statuses` 初始化为 `STATUSES.filter(s => s !== '已发布')`（默认隐藏已发布）。
  - 删除 `statusOptions` useMemo，改为 `statusCounts`（`useMemo` 统计）传给 FilterBar。

### P0-2 反馈 5a：项目级「不参与构建」
- `src/batch.ts`
  - 新增 `isBuildExcluded(apps: DevopsApp[], project: string): boolean`（查 `excludeFromBuild`）。
  - `getBatchItems(req, excluded, apps?, included?)`：追加过滤 `!isBuildExcluded(apps, it.project) || included?.[req.id]?.includes(it.id)`（`apps`/`included` 可选，保证旧签名兼容；BatchPanel 调用时全传）。
  - `collectMrTargets` / `collectBuildTargets` / `summarize`：签名加 `included?: Record<string, string[]>`，内部 getBatchItems 透传（`collectBuildTargets`/`summarize` 需新增 `apps` 入参，同步改调用方）。
  - `BuildTarget` 新增 `reqIds: string[]`（构建任务回写需求的钩子，阶段 P1 用；本阶段先补字段，合并逻辑同 reqNames）。
- `src/pages/RequirementListPage.tsx`
  - 新增会话态 `batchIncluded: Record<string, string[]>`（与 batchExcluded 同生命周期：勾选/取消/清空/删除时同步清理）。
  - 新增 `handleIncludeItem(reqId, itemId)`（从默认排除中恢复 = 仍构建；再 X 则从 included 移除回到默认排除）。
  - BatchPanel 传 `included` + `onIncludeItem`。
- `src/components/BatchPanel.tsx`
  - Props 加 `included`、`onIncludeItem(reqId, itemId)`；collect 调用透传。
  - 逐需求小框渲染逻辑调整：**默认排除项也要展示**（灰显 Tag + "不构建"小字 + 「仍构建」文字按钮），被 included 的项恢复为正常可 X Tag（X 后回到默认排除态）。统计行追加 `已按项目配置跳过 N 项`（有跳过才显示）。
- `src/components/RequirementCard.tsx`
  - 「全选项目」勾选集合 = `req.items.filter(it => !isBuildExcluded(apps, it.project))`。
  - 被排除项目行：项目名灰显 + `不构建` 小 Tag（Tooltip："项目配置中标记为不参与构建"）；**单项手动勾选仍允许**（即"临时仍构建"覆盖）。
- `src/pages/QuickBuildPage.tsx`
  - `summary` 过滤掉 `excludeFromBuild` 项目；统计行下加提示行：`已自动跳过 N 个不构建项目：a、b`（有才显示）。
  - 增加 `Switch`「包含不构建项目」（会话态默认关），开启后 summary 恢复全量。
- `src/pages/ProjectConfigPage.tsx`
  - 表格新增「不参与构建」列（`Switch`，checked=`!!record.excludeFromBuild`，onChange → `update(record.app, { excludeFromBuild: v })`），列宽 ~100，Tooltip 说明"批量/快速构建默认跳过，可临时恢复"。

### P0-3 反馈 4：构建完成通知三件套
- 新增 `src/hooks/useBuildNotifications.ts`
  - `export function useBuildNotifications(): void`；内部 `useBuildTasks()` + `AntdApp.useApp().notification`。
  - `notifiedRef = useRef(new Set<string>())`（key：`${taskId}:failed` / `${taskId}:artifact-success|fail|timeout`），任务从列表消失时清理对应 key。
  - 监听 `tasks` 变化，对**新进入以下状态**的任务发 antd notification：
    - `phase === 'failed'` → error：`【{app}】构建触发失败` + detail。
    - `artifact.status === 'success'` → success：`【{app}】构建完成` + fileUrl（描述里放可点链接）。
    - `artifact.status === 'fail' | 'timeout'` → warning/error：对应文案 + reason。
  - **浏览器系统通知**：首次检测到 `tasks.length > 0` 时 `Notification.requestPermission()`（能力检测兜底）；发 antd 通知时若 `permission === 'granted' && document.hidden`，同步 `new Notification(title, { body })`。
  - **标签页标题**：`activeCount > 0` → `({activeCount}●) 工作记录`；全部结束瞬间 → `(✓) 工作记录` 3 秒后还原 `工作记录`（记录原始 title，组件卸载时还原）。
- `src/layouts/AppLayout.tsx`：组件内调用 `useBuildNotifications()`（`main.tsx` 已有 `<AntdApp>` 包裹，上下文可用）。

**P0 验证**：`npm run build` 通过；默认进列表页不见已发布需求；FilterBar 状态项带计数且含全部 9 态；配置页把某项目设为不参与构建后批量/快速构建自动跳过；触发一次构建失败/制品成功能收到页面通知、切走标签页有系统通知、标题有 `(N●)`。

---

## 阶段 P1：核心重塑（看板 + 常驻右栏；同改 RequirementListPage，建议同一执行会话串行）

### P1-1 看板视图
- 新增 `src/components/BoardCard.tsx`
  - Props：`{ req: Requirement; tasks: BuildTask[]; onOpenBuildPanel: () => void }`。
  - 精简卡：需求名（TAPD 外链，2 行截断）+ 小 Tag 行（版本、`PIPELINE_LABELS[pipeline ?? 'standard']`、状态 `statusForEnv` 派生展示）+ 右上角构建小灯（见 P1-3 共享 helper）。
  - 整卡 `useDraggable({ id: req.id })`（listeners 挂卡片容器，cursor grab）。
- 新增 `src/components/BoardView.tsx`
  - Props：`{ data: Requirement[]; tasks: BuildTask[]; showCompleted: boolean; onToggleCompleted(v): void; onAdvanceEnv(reqId: string, env: BuildEnv): void; onOpenBuildPanel(): void }`。
  - 顶部小工具行：`Switch` 显示已发布（默认关）。
  - 主体：横向 flex 7 列（`BOARD_COLUMNS`），容器 `overflowX: auto`；列宽 ~210px 等宽；列头 = env 名 + 集群色点（微赞/星享两色）+ 计数；列体独立纵向滚动（`maxHeight: calc(100vh - 260px)`）。
  - 每列 `useDroppable({ id: env })`；`DndContext onDragEnd`：`over.id` 为列 env，满足 `env !== req.currentEnv ?? null` 且 `allowedEnvs(req.pipeline).has(env)` → `onAdvanceEnv(req.id, env)`；不允许的列拖拽悬停时灰显（`isOver && !allowed` → 背景 #f5f5f5 + 禁用光标），drop 无效不触发。
  - 数据分组：`data` 中 `!isPipelineComplete(pipeline, currentEnv)` 落入 `currentEnv ?? 'dev'` 列（`currentEnv` 不在 BOARD_COLUMNS 的兜底 dev 列）；`showCompleted` 开启时已完成需求以 60% 透明度显示在其末段列。
  - 空列显示浅色占位文案。
- `src/pages/RequirementListPage.tsx`
  - 新增 `view` 状态（`'list' | 'board'`），初始 `loadViewPreference()`；工具行（排序按钮同行左侧）加 `Segmented`：`[{label:'列表',value:'list'},{label:'看板',value:'board'}]`，切换仅会话态。
  - `handleAdvanceEnv(reqId, env)`：
    ```ts
    const req = requirements.find(r => r.id === reqId); if (!req) return;
    const auto = loadAutoAdvanceStatus();
    const patch: Partial<Requirement> = { currentEnv: env };
    if (auto) patch.status = advanceStatus(req.status, env);
    update(reqId, patch);
    if (patch.status === '已发布' && req.status !== '已发布') { moveToPublishedTop(reqId); message.info('需求已到达末段，标记为已发布'); }
    ```
  - `view === 'board'` 时以 `filtered` 渲染 `BoardView`（替代 `RequirementCardGrid`）；看板模式下隐藏排序按钮（拖拽排序是列表能力）。
  - **迁移按钮**：`needsMigration = requirements.some(r => r.pipeline === undefined)`；为 true 时在 StatsBar 行右侧显示 `Button「迁移老数据」`（Popconfirm："将按现有状态反推环境进度，流水线类型填常规大版，可之后在看板拖正"）；点击 → 用 `backfillRequirement` 映射全量（`useRequirements` 新增 `migrateToPipeline(): number` 返回迁移条数）→ `message.success('已迁移 N 条')`；迁移后按钮自动消失。

### P1-2 常驻右侧构建面板
- 新增 `src/components/BuildPanel.tsx`
  - Props：`{ open: boolean; onToggle(): void }`。
  - 内容 = 现 Drawer 内容平移（标题行「构建任务（进行中 N）」+「清空记录」+ 任务列表 `BuildTaskItem` 一并迁入）+ 底部 `<ArtifactList />`（制品与任务同源常驻可见）。
  - 展开：`width: 380`、`borderLeft: 1px solid #f0f0f0`、全高 sticky；折叠：~44px 竖条（图标 + `Badge count={activeCount}` + 点击展开）。
- `src/pages/RequirementListPage.tsx`
  - 删除 `Drawer` 与 `tasksOpen`，改 `buildPanelOpen`（**默认 true**）；顶部「构建任务」按钮 → `onToggle`（保留 Badge）。
  - 页面主体改 flex：左栏 `flex:1 minWidth:0`（现有全部内容），右栏 `<BuildPanel />`。
  - 原文件内 `BuildTaskItem`/`TASK_PHASE_TEXT` 移入 BuildPanel.tsx（保持 testid 不变）。
- 注：`BatchPanel` 内既有 `<ArtifactList />` 保留不动（批量构建场景就近看）；QuickBuildPage 不动。

### P1-3 卡片构建小灯（列表卡 + 看板卡共用）
- `src/hooks/useBuildTasks.ts`：`BuildTask` 新增 `reqIds?: string[]`；`startBuildTask(reqName, app, env, buildOther?, reqIds?: string[])`（可选末参，旧调用兼容）。
- 新增共享 helper（放 `src/batch.ts` 或新 `src/utils/buildLight.ts`）：`getBuildLight(tasks, reqId): { active: number; failed: number; succeeded: number }`（按 `t.reqIds?.includes(reqId)` 过滤，phase building/waiting → active，failed → failed，done → succeeded）。
- `src/pages/RequirementListPage.tsx`：调用处补 reqIds——`handleBatchBuild` 传 `b.reqIds`（依赖 P0-2 的 BuildTarget.reqIds）。
- `src/components/RequirementCard.tsx`
  - Props 加 `tasks: BuildTask[]`、`onOpenBuildPanel: () => void`；`handleBuild` 传 `[req.id]`。
  - 右上角（⋯ 菜单左侧）渲染小灯：active>0 → 蓝点+数（processing）；active=0 且 failed>0 → 红点+数；否则 succeeded>0 → 绿点+数；全 0 不渲染。`Tooltip` 文案（如"2 个构建进行中"）；点击 → `onOpenBuildPanel()`。
- `src/components/RequirementCardGrid.tsx`：透传 `tasks`、`onOpenBuildPanel`、以及 P1-4 的 `onAdvanceEnv`/`onChangePipeline`。
- `src/components/BoardCard.tsx`：同 helper 渲染小灯（见 P1-1）。

### P1-4 表单/卡片编辑 pipeline + 卡片 env
- `src/components/RequirementForm.tsx`
  - 新增 `pipeline` 表单项（`Form.Item` required，Select，options = `PIPELINE_LABELS` 四项，风格同 version）；initial：`editing?.pipeline ?? 'standard'`；`FormValues`/`RequirementFormValues` 同步加字段。
- `src/hooks/useWorkTracker.ts`：`upsert` 提交值已含 pipeline（spread 即可）；确认编辑时保留原 `currentEnv`（不被表单覆盖——表单不含此字段，`update` 用 patch 语义安全）。
- `src/components/RequirementCard.tsx`
  - 中部状态 Select 右侧加**环境 Select**（size small，宽 ~120）：value = `req.currentEnv ?? null`，placeholder「未开始」，options = `getStages(req.pipeline)`，onChange → `onAdvanceEnv(req.id, v)`（走页面同一 handler，含状态对齐）。
  - ⋯ 菜单加子菜单「流水线」：4 个 radio 项（当前打勾），点击 → `onChangePipeline(req.id, type)` → `update(id, { pipeline: type })`（message 提示"流水线已切换，完成判定按新模板"）。
- `src/pages/RequirementListPage.tsx`：补 `handleChangePipeline` 并透传。

### P1-5 通用配置页
- `src/pages/GeneralConfigPage.tsx` 新增区块「看板与状态」：
  - 「默认视图」Select（列表/看板）→ `loadViewPreference`/`saveViewPreference`；说明文案"需求记录页打开时的默认视图"。
  - 「状态自动向前对齐」`Switch`（默认开）→ `loadAutoAdvanceStatus`/`saveAutoAdvanceStatus`；说明文案"环境进度前进时自动提升需求状态（只升不降），关闭后拖拽/构建仅改看板位置"。

**P1 验证**：`npm run build` 通过；列表/看板可切换；老数据出现迁移按钮且迁移后落列正确；看板拖拽改列 → status 只升不降、拖到末段提示已发布；不允许列拖不进去；右栏默认展开、可折叠、制品常驻；列表卡/看板卡小灯随构建状态变化并点击展开右栏；表单必填流水线（默认常规大版）；通用配置两项开关生效。

---

## 阶段 P2：锦上添花（可独立排期）
- [ ] **构建成功自动推进 currentEnv**：`RequirementListPage` 用 `useEffect` 监听 `tasks`，对已消费任务用 `useRef<Set>` 去重；`phase === 'done'` 且 `task.reqIds` 命中的需求，若 `stageIndex(pipeline, task.env) > stageIndex(pipeline, currentEnv ?? dev)`（currentEnv null 视为 -1）→ 复用 `handleAdvanceEnv`。注意 effect 依赖仅 `tasks`，防循环。
- [ ] **已达环境筛选**：FilterBar 加 `currentEnv` 单选 Select（7 环境），过滤 `r.currentEnv === v`。
- [ ] **看板偏好记忆**：`showCompleted`、右栏开合、view 切换持久化到 localStorage。
- [ ] **反馈 5-b 构建方案**：批量面板/快速构建把当前勾选存为具名方案，一键回填（待用户再次提出后排期）。
- [ ] **看板列折叠/列内排序**。

---

## 关键依赖与注意
1. **循环依赖红线**：`types.ts`（PipelineType/Status）← `config/pipeline.ts` ← `build.ts`；`types.ts` 不 import pipeline。
2. `collectBuildTargets`/`summarize` 加 `apps` 入参属签名变更，调用方只有 `BatchPanel.tsx`，一并改。
3. `mergeSynced`（项目一键同步）已保留本地自定义字段，`excludeFromBuild` 不会被远端覆盖——验证时回归确认。
4. 导入/导出兼容：旧导出 JSON 无 `pipeline`/`currentEnv`，导入后视为老数据（迁移按钮会再出现）；`parseImportFile` 不强校验新字段（保持宽松，仅兜底类型）。
5. 状态手动修改入口全部保留（卡片 Select、表单 Select）；自动对齐永远不向下覆盖手动状态。
6. 通知 hook 在 `AppLayout` 全局生效（含快速构建页触发的任务）。
7. 已发布自动隐藏仅作用看板视图；列表视图靠默认筛选隐藏（两处口径一致：都是"默认不看已发布，可手动打开"）。

## 全局验证清单
- [ ] `npm run build`（tsc --noEmit + vite build）零错误。
- [ ] 老 localStorage 数据页面不白屏、迁移按钮出现、迁移后看板落列正确。
- [ ] 四大阶段各自验收点（见各阶段末）全部通过。
- [ ] 不提交代码（由用户确认后另行提交）。
