# 需求卡片化 + 批量操作区改造计划（card-batch-redesign）

> 本文档为执行会话的依据。规划已与用户逐项确认（2026-09-03），执行时请严格遵循"用户已拍板决策"章节，不要擅自更改交互语义。

## 一、背景与目标

现状：需求以表格行展示，行内支持单需求勾选项目后批量构建，但提交 MR 需逐项目点击；多需求同时上线时需逐行点 MR 和构建，操作繁琐。

目标：

1. 需求列表由表格改为**卡片网格**（多列，一行 2~3 张紧凑卡片），每张卡片保留单需求的构建、MR 操作（按卡片内勾选的项目分支执行）。
2. 卡片可勾选（需求级多选），卡片区上方新增**批量操作区**：
   - **上半**：汇总去重视图 + 统计（共多少需求、多少项目、多少构建分支）+ 批量按钮；
   - **下半**：每个选中需求一个小框，列出项目+分支，可逐个 X 去掉（表示本次批量不构建/MR 该项）；某需求的分支被全部去掉时，等同于该需求未勾选（其卡片勾选自动消失，双向联动）。**X 移除不影响需求卡片的任何数据**（buildItems 不回写、需求本身不删除），仅是会话内的临时排除。
3. 批量语义：MR 按需求×项目**全量触发**（不去重）；构建按**相同项目 + 相同目标分支(env) 去重合并**，不重复构建。

## 二、用户已拍板决策（不可更改）

| 决策点 | 结论 |
|---|---|
| 卡片布局 | 多列网格（CSS grid `repeat(auto-fill, minmax(340px, 1fr))`），拖拽排序重写为网格拖拽（dnd-kit `rectSortingStrategy`） |
| X 移除语义 | 仅本次批量生效，不回写 buildItems，不修改需求卡片任何数据；重新勾选卡片恢复全量参与 |
| env 目标分支 | 批量区不提供统一 env，各需求按自己卡片配置的 env 执行；去重按 `project + env`，同项目不同 env 分两条 |
| 全 X 联动 | 某需求分支全被 X → 卡片勾选自动取消（等同未勾选），卡片及项目勾选配置原样保留 |
| 面板结构 | 上半汇总去重 + 下半逐需求小框（保持用户指定顺序，不调换） |

## 三、UI 设计专家评审采纳情况

采纳：

1. 卡片头部瘦身：编辑/删除收进「⋯」Dropdown 菜单，头部只保留 勾选框 + 拖拽把手 + 需求名(TAPD外链) + 版本 Tag。
2. 项目区折叠：项目 > 4 个时默认显示前 4 个 +「展开全部（N）」文字按钮，避免卡片高度失控、嵌套滚动。
3. 统计文案：「已选 N 个需求 · M 个项目 · K 个构建任务」，另有 skipped 单独计数（"N 项将跳过"）；同项目不同 env 分开计入 K。
4. 筛选外选中保留：批量面板基于全量 selectedReqIds 计算而非筛选视图，防"幽灵选择"；被筛选隐藏的选中需求其小框仍显示（可标注"已被筛选隐藏"）。
5. skipped 项展示：缺 gitUrl / 未填分支的 MR 项灰显 + 原因，不计入触发数。

不采纳（保持用户原设计）：

- 上下段对调（用户明确指定上半汇总、下半小框）。
- "全 X 改为半选置灰"（用户明确要求勾选自动消失）。
- X 后置灰而非移除（用户明确描述为"点 X 去掉"）。

## 四、数据模型

- **持久化配置（不变）**：`Requirement.buildEnv` / `buildItems` 由 `useBuildPlan` 管理，是单卡操作与批量操作的共同数据源。
- **批量选择（页面层新增）**：`selectedReqIds: Set<string>`（卡片勾选，跨筛选保留）。
- **临时排除（页面层新增）**：`batchExcluded: Record<string, string[]>`（reqId → 被 X 的 itemId），仅会话内。
- **有效批量范围** = 选中需求的 buildItems 勾选项 − batchExcluded；汇总/去重/统计全部由 `src/batch.ts` 纯函数计算，UI 只渲染结果（useMemo 缓存）。

联动规则：

- 勾选卡片 → 加入 selectedReqIds 且清空该需求 excluded；
- 取消勾选 → 从 selectedReqIds 移除并清 excluded；
- X 单项 → 写 batchExcluded；若该需求有效项清零 → 从 selectedReqIds 移除并清 excluded。

## 五、文件清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `docs/card-batch-redesign-plan.md` | 新增 | 本文档 |
| `src/batch.ts` | 新增 | 批量纯函数：collectMrTargets / collectBuildTargets / 汇总统计 |
| `src/components/RequirementCard.tsx` | 新增 | 单卡（含 useSortable 与 DragHandle） |
| `src/components/RequirementCardGrid.tsx` | 新增 | DndContext + rectSortingStrategy 网格容器 + 排序工具行 + 空态 |
| `src/components/BatchPanel.tsx` | 新增 | 批量操作区 |
| `src/pages/RequirementListPage.tsx` | 修改 | 接入卡片网格与批量面板，管理选择/排除状态 |
| `src/components/RequirementTable.tsx` | 删除 | 拖拽/handleBuild/handleOpenMr/状态列写法迁出后删除 |
| `.tmp-ds.txt` | 删除 | 工作区临时文件 |

## 六、组件设计

### 6.1 src/batch.ts

```ts
export interface BuildPlanLike {
  getEnv: (req: Requirement) => BuildEnv;
  getSelected: (req: Requirement) => Set<string>;
}
export interface MrTarget {
  reqId: string; reqName: string; itemId: string; project: string;
  branch: string; env: BuildEnv; url: string; // buildMergeRequestUrl 结果
}
export interface MrSkipped { reqName: string; project: string; reason: string }
export interface BuildTarget { key: string; project: string; env: BuildEnv; reqNames: string[] }
export interface BatchSummary { reqCount: number; itemCount: number; buildCount: number; skippedCount: number }

/** 取某需求的有效批量项目（buildItems 勾选 − 临时排除） */
export function getBatchItems(req: Requirement, buildPlan: BuildPlanLike, excluded: Record<string, string[]>): ProjectBranch[];
/** MR 目标汇总（全量不去重 + skipped 原因） */
export function collectMrTargets(reqs: Requirement[], apps: DevopsApp[], buildPlan: BuildPlanLike, excluded: Record<string, string[]>): { targets: MrTarget[]; skipped: MrSkipped[] };
/** 构建目标汇总（project::env 去重，reqNames 合并） */
export function collectBuildTargets(reqs: Requirement[], buildPlan: BuildPlanLike, excluded: Record<string, string[]>): { builds: BuildTarget[]; dupCount: number };
/** 统计 */
export function summarize(reqs: Requirement[], buildPlan: BuildPlanLike, excluded: Record<string, string[]>, skippedCount: number): BatchSummary;
```

- `dupCount` = 去重合并掉的次数（Σ有效项 − builds.length，仅同 env 部分）。
- skipped 判定：apps 中无该 project 的 gitUrl（"未配置 Git 仓库地址"）或 item.branch 为空（"未填写开发分支"）。

### 6.2 RequirementCard.tsx

- 自身调用 `useSortable({ id: req.id })`，根 div 绑 ref/transform/transition（拖拽中 zIndex 置顶），无需 DragHandleContext——DragHandle 直接用同组件内的 attributes/listeners。
- 头部：Checkbox（勾选，stopPropagation）+ DragHandle（HolderOutlined）+ 需求名 a 外链 + 版本 Tag（紫/蓝）+「⋯」Dropdown（编辑 / 删除→modal.confirm）。
- 中部：状态 Select（labelRender 彩色 Tag，沿用原表格写法）+ 发版时间 DatePicker + 备注（灰字小号）。
- 项目区：每项目一行 Checkbox + 项目名 + monospace 分支 + 小 MergeOutlined 图标按钮（Tooltip"打开该项目 MR"，单个打开防拦截）；> 4 个折叠（"展开全部（N）"文字按钮切换）。
- 底部：env Select（flex 1）+ 构建 Button（primary，loading，点击逻辑同原 handleBuild：csrf 校验→勾选项→startBuildTask 并行→汇总提示）+ 提交MR Button（打开该需求全部勾选项目的 MR 链接，逐个 window.open，message 提示拦截兜底；无 gitUrl/分支项 warning）。
- 样式：白底 8px 圆角、1px 边框、hover 浮起阴影、选中蓝描边（#1677FF）+ 浅蓝底（#E6F4FF 过渡）。

Props：`req, apps, branches, buildPlan, selected, onToggleSelect, onEdit, onDelete, onChangeStatus, onChangeReleaseDate`。

### 6.3 RequirementCardGrid.tsx

- `DndContext`（PointerSensor distance:1 + KeyboardSensor）+ `SortableContext`（items=data ids, **rectSortingStrategy**；modifiers 只留 restrictToParentElement）。
- 上方工具行：右侧排序切换小按钮（manual→releaseDesc→releaseAsc 循环，带 CaretUp/Down 图标指示，Tooltip 说明），左侧可选显示当前模式文字。
- 空态：Empty"暂无需求，点击右上角「登记需求」开始"。
- Props：`data, apps, branches, buildPlan, selectedReqIds, onToggleSelect, onEdit, onDelete, onChangeStatus, onChangeReleaseDate, onReorder, sortMode, onChangeSortMode`。

### 6.4 BatchPanel.tsx

- 无选中（reqs.length === 0）时返回 null。
- **上半**：
  - 统计行：`已选 N 个需求 · M 个项目 · K 个构建任务`（+ `· S 项将跳过`，S>0 时橙色）；右侧按钮组：批量提交MR（primary, MergeOutlined）、批量构建（BuildOutlined, loading）、清空选择（文本按钮）。
  - 构建清单（去重）：每行 `项目 → env`，来源需求名灰字（"需求A、需求B"）。
  - MR 清单（全量）：每行 `需求 · 项目：分支 → env`，整行渲染为 `<a href target="_blank">`（兜底浏览器拦截）；skipped 项灰显 + Tooltip 原因。
  - 构建/MR 清单并排两列（窄屏 wrap）。
- **下半**：选中需求小框横排 wrap；每框标题=需求名（+ 已选项目数），框内项目+分支为可关闭 Tag（closable，onClose → onRemoveItem(reqId, itemId)）。
- Props：`reqs: Requirement[], apps, buildPlan, excluded, onRemoveItem, onClearSelection, onBatchMr, onBatchBuild, batchBuilding`。内部 useMemo 调 batch.ts 计算。

### 6.5 RequirementListPage.tsx 改造

- 新增状态：`selectedReqIds: Set<string>`、`batchExcluded: Record<string, string[]>`、`batchBuilding: boolean`。
- `selectedReqs = requirements.filter(r => selectedReqIds.has(r.id))`（全量，不受筛选影响）。
- `toggleSelect(reqId, checked)`：勾选时清 excluded[reqId]；取消时也清。
- `removeItem(reqId, itemId)`：更新 excluded；若该需求有效项清零 → 从 selectedReqIds 移除 + 清 excluded。
- 批量 MR：collectMrTargets → 同步循环 window.open 全部 target.url → message.success(`已打开 N 个 MR 页面`)+message.info 拦截提示；skipped 非空 message.warning 汇总。
- 批量构建：getCsrfToken 前置校验 → collectBuildTargets → 逐个 `startBuildTarget.reqNames.join('、'), project, env` → Promise.all → 汇总提示（触发 N 个、合并去重 M 个、失败明细、401 登录失效）。
- 保留：StatsBar、FilterBar、RequirementForm、ProjectStatsModal、构建任务 Drawer、导入导出、handleReorder、handleChangeSortMode、moveToPublishedTop、已发布沉底。
- 移除：RequirementTable 引用与 import；Table 相关代码全部移除。
- 单卡构建/消息逻辑放在 RequirementCard 内部（沿用原 RequirementTable 模式，用 AntdApp.useApp 的 message/modal）。

## 七、执行步骤（对应 todo）

1. 写本计划文档 ✅
2. `src/batch.ts` 纯函数
3. `RequirementCard.tsx` + `RequirementCardGrid.tsx`
4. `BatchPanel.tsx`
5. 页面整合 + 删除 RequirementTable.tsx + 删除 .tmp-ds.txt
6. data-testid 与用户确认后补充；`npm run build` 验证

## 八、拟新增 data-testid 清单（待用户确认后添加）

`batch-panel`、`batch-stats-text`、`batch-mr-button`、`batch-build-button`、`batch-clear-button`、`batch-item-remove-tag`、`requirement-card-checkbox`、`requirement-card-build-button`、`requirement-card-mr-button`、`requirement-card-item-mr-button`、`requirement-card-drag-handle`、`requirement-card-edit-menu`、`sort-mode-toggle-button`。

## 九、规范约束

- TS 严格类型禁 any；函数式组件 + hooks；AntD 5；dayjs；公共函数 JSDoc；复杂逻辑行内注释；样式沿用项目现有 inline style 风格（项目未配置 Tailwind，不引入）。
- 完成后 `npm run build`（含 tsc）验证；不擅自提交代码。
