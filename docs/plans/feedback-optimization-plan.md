# 工作记录站 · 反馈优化方案（交互/功能调整）

> ✅ 已定稿（2026-09-09，决策见下）。**执行依据请用 `docs/plans/board-ux-optimization-dev-plan.md`（任务清单）**，本文件保留方案推演与决策理由。
> 已确认：①看板/列表双视图，默认列表（通用配置可改）②状态自动向前对齐默认开、可关 ③反馈5只做a（不参与构建开关）④右栏默认展开 ⑤pipeline登记必填默认常规大版、表单/卡片可改 ⑥老数据迁移为手动按钮（检测到老数据时出现）。

> 规划会话（本文件为方案，讨论定稿后再进执行会话实现；暂不写代码）
> 关联：`docs/work-tracker-plan.md`、`docs/plans/dingtalk-build-phase1-dev-plan.md`、`docs/plans/card-batch-redesign-plan.md`

## 〇、核心洞察：用「环境看板」替代抽象状态流转

### 真实工作流（用户确认）
双集群、7 分支、4 种流水线，**单轨有序**（每条模板本身就是一条完整链路，只是先去哪后去哪不同）：
- **微赞集群**：`dev / test / pre / master`
- **星享集群**：`preb-txnj / pre-txnj / prod-txnj`
- **4 种流水线**（需求各自选用，字段 `pipeline`）：
  1. 常规大版 standard：`dev → test → pre-txnj → prod-txnj → pre → master`
  2. 只发星享 starOnly：`dev → preb-txnj → pre-txnj → prod-txnj`
  3. 仅发微赞 weizanOnly：`dev → test → pre → master`
  4. 先微赞后星享 weizanFirst（极端例外）：`dev → test → pre → master → pre-txnj → prod-txnj`

### 为什么选看板（对标成熟产品）
用户痛点：需求多，要"一眼看出每个需求在哪个环境、能方便地推进"。
- 圆点轨/双轨/轨尾写状态 → **一堆圆点不直观、乱**，全部否决。
- 状态列看板 → 直观、切换方便，但用户担心：进行中要往上滑、已发布常年占视窗。

成熟产品（Jira / TAPD / PingCode / Linear）管理产研测流转的主流形态就是**看板**，但它们靠两个动作避开上述坑：
1. **做完的需求自动从看板消失**（done 自动隐藏/归档，不常驻）——解"已发布占视窗"。
2. **看板用精简卡**（非全功能大卡）+ 列独立滚动 + 复用筛选——解"往上滑/拥挤"。
3. 附加原则：**看板是"另一种视图"，列表/看板可切换**，不替换现有卡片瀑布流。

### 数据模型（已简化）
- `Requirement.pipeline?: PipelineType`（缺省 `'standard'`）——决定末段（=已发布）与可拖入列。
- `Requirement.currentEnv?: BuildEnv | null`（缺省 `null`=未开始，落 dev 列）——**只记"当前在哪个环境"，不记历史**。看板列位置 = currentEnv。
- 完成判定：`currentEnv === PIPELINES[pipeline].stages.at(-1)` → 已发布，看板默认隐藏。
- 状态 `status`：由 `currentEnv` 经 `STAGE_TO_STATUS` 派生展示（次要标签）；老 `status` 字段保留做迁移兼容，不再是主角。
  - `STAGE_TO_STATUS`：dev→开发中、test→已提测、preb-txnj→预发布测试中、pre-txnj→预发布测试中、prod-txnj→待发布、pre→待发布、master→已发布。
  - 迁移：老数据可按 `status` 反推 `currentEnv` 回填一次，或置 null 由用户拖拽。

> 已砍掉：圆点轨、双轨、`releasedEnvs` 历史记录、"构建下一环境"按钮。
> 跳出模板的零散构建：用"快速构建"，不做特殊处理（不弄乱看板、不记进度）。

---

## 一、反馈逐条方案

### 反馈 1：状态流转用处小，跟分支挂钩 → 是，落地为「环境看板」

**新增视图：看板（与列表切换，不替换）**
- 顶部加 `列表 / 看板` 分段切换（列表=现有卡片瀑布流，看板=新视图）。
- **列 = 7 个环境**，固定通用顺序：`dev → test → preb-txnj → pre-txnj → prod-txnj → pre → master`（3/4 模板在此序下单调；先微赞后星享例外会先右后左跳一次，接受）。
- 需求按 `currentEnv` 落列；**到达自身流水线末段的卡自动隐藏**（=已发布，不占视窗），提供"显示已发布"开关。
- **拖拽卡片到别的列 = 拨动 `currentEnv`**，状态随之向前对齐（只升不降）。
  - **拖拽只改进度/状态，不改构建分支 `buildEnv`**（构建目标仍在构建时显式选），无"拖一下拿错分支构建"的风险。
  - 不可拖入列按模板置灰（如"仅发微赞"不能拖进 preb-txnj）。
- **看板卡为精简卡**：需求名（TAPD 外链）+ 版本 Tag + 流水线类型 Tag + 构建小灯（见反馈 2）；不放全量构建控件。

**状态自动向前对齐**：`currentEnv` 变化（拖拽或构建成功）→ 派生 `status`（只升不降、可关、可在表单手改）。全局开关 `autoAdvanceStatus`（localStorage，默认开、可关）。

**涉及**：`types.ts`（`pipeline`/`currentEnv`）、`config/pipeline.ts`（新：4 模板/集群/列序/`STAGE_TO_STATUS`/末段判定）、`components/BoardView.tsx`（新）、`components/BoardCard.tsx`（新，精简卡）、`components/PipelineTrack`（**取消**）、`RequirementListPage.tsx`（视图切换 + 看板数据源 + 拖拽回写）、`hooks/useWorkTracker.ts`（`update` 支持 `pipeline`/`currentEnv` + 迁移回填）、`RequirementForm.tsx`（流水线类型选择）、`ProjectConfigPage`/`SettingsPage`（`autoAdvanceStatus` 开关）。

### 反馈 2：单个构建要点开抽屉看 → 构建面板「常驻右侧」+ 卡片小灯

- `RequirementListPage` 主体改左右两栏：左=筛选/批量/视图（列表或看板）；右=**常驻构建面板 `BuildPanel`**（约 380px，可折叠）。
- 顶部"构建任务"按钮改为**切换右栏显隐**（不再开 Drawer）；折叠时收成细条 + 进行中数量 Badge。
- 抽取 Drawer 内容为 `components/BuildPanel.tsx`（任务列表 + `ArtifactList` + 清空），与 `useBuildTasks` 同源。
- **构建小灯**：列表卡与看板卡右上角显示"进行中(蓝)/失败(红)/成功(绿)"圆点 + 数量，点击展开右栏并定位任务。

**涉及**：`pages/RequirementListPage.tsx`、`components/BuildPanel.tsx`（新）、`components/RequirementCard.tsx`、`components/BoardCard.tsx`、`AppLayout.tsx`。

### 反馈 3：状态筛选不全 + 默认看未发布

1. `FilterBar` 状态多选改为**完整 `STATUSES` + 计数**（现在只列出现有状态，所以"不全"）。
2. 默认筛选**隐藏已发布**（`INITIAL_FILTER.statuses` = `STATUSES` 去掉 `已发布`），与"看板默认隐藏已发布"一致；`StatsBar` 遍历完整 `STATUSES` 并淡化 0 计数。
3. 加「仅看未发布 / 显示全部」快捷按钮。筛选对列表与看板同时生效。

**涉及**：`components/FilterBar.tsx`、`components/StatsBar.tsx`、`pages/RequirementListPage.tsx`。

### 反馈 4：构建完成无提示 / 标签页不提示 → 桌面通知 + 浏览器通知 + 标题

新增 `hooks/useBuildNotifications.ts`（`AppLayout` 常驻，跨路由生效）：
- 监听 `tasks`，对**新进入终态**且未提示过的任务：
  - antd `notification`：`✓ {app} 构建完成` / `✗ {app} 构建失败`（含查看记录链接）。
  - **浏览器 Notification API**：首次构建请求授权；标签页非激活时发系统通知。
  - **标签页标题**：进行中 `(N●) 工作记录`；完成瞬间闪烁 `(✓) 工作记录`；无活动还原。
- `useRef<Set<string>>` 记录已提示终态任务 id，避免重复。

**涉及**：`hooks/useBuildNotifications.ts`（新）、`layouts/AppLayout.tsx`、`hooks/useBuildTasks.ts`。

### 反馈 5：固定不纳入构建的项目（vzanlive_weapp）→ 项目级「不参与构建」开关（采纳 a，b 暂缓）

- `DevopsApp` 增加 `excludeFromBuild?: boolean`（`vzanlive_weapp` 默认 `true`）。
- `collectBuildTargets`/`collectMrTargets`/单卡构建/快速构建**默认跳过**带标记项目（一次性配置，根治重复手取消）。
- `ProjectConfigPage` 增「不参与构建」列（Switch）；卡片/批量面板中这些项目带灰色"不构建"标签，允许临时"仍构建"覆盖（不污染配置）。
- **方案 b（构建方案/标签）暂缓**：a 已解决"固定不构建"痛点；b 服务"测试期只改部分项目"的临时子集，视反馈再上。

**涉及**：`config/devopsApps.ts`、`hooks/useWorkTracker.ts`（`useDevopsApps` 增 `setExclude`）、`batch.ts`、`components/ProjectConfigPage.tsx`、`components/RequirementCard.tsx`、`pages/QuickBuildPage.tsx`。

---

## 二、额外优化点

1. **构建成功自动推进 `currentEnv`**（在拖拽之外）：构建任务成功且构建目标 = 该需求流水线上下一段时，自动把 `currentEnv` 拨到该段（只升不降）。跳出模板/快速构建不处理。
2. **按"已达环境"筛选**：`FilterBar` 增 `currentEnv` 命中筛选。
3. **快速构建页同样遵守 `excludeFromBuild`**。
4. （未来可选）看板列折叠、列内排序、"显示已发布"记忆。

---

## 三、涉及文件清单（汇总）

**新增**
- `src/config/pipeline.ts`（4 模板/集群/列序/`STAGE_TO_STATUS`/末段判定/列灰度）
- `src/components/BoardView.tsx`（看板：7 列 + 拖拽 + 已发布隐藏）
- `src/components/BoardCard.tsx`（看板精简卡 + 构建小灯）
- `src/components/BuildPanel.tsx`（常驻右栏，抽自 Drawer）
- `src/hooks/useBuildNotifications.ts`（通知+标题+浏览器通知）

**修改**
- `src/types.ts`：`Requirement.pipeline`、`Requirement.currentEnv`；`DevopsApp.excludeFromBuild`
- `src/config/devopsApps.ts`：类型加字段 + `vzanlive_weapp` 默认 `excludeFromBuild:true`
- `src/batch.ts`：`collectBuildTargets`/`collectMrTargets` 跳过 `excludeFromBuild`
- `src/hooks/useBuildTasks.ts`：任务加 `reqIds`；成功后回写 `currentEnv` 钩子
- `src/hooks/useWorkTracker.ts`：`update` 支持 `pipeline`/`currentEnv` + 迁移回填；`useDevopsApps` 增 `setExclude`
- `src/components/RequirementCard.tsx`：构建小灯 + 不构建标签 + `currentEnv` 展示
- `src/components/RequirementForm.tsx`：流水线类型选择
- `src/components/FilterBar.tsx`：完整状态+计数+默认未发布+已达环境筛选
- `src/components/StatsBar.tsx`：完整 STATUSES 计数 + 淡化 0 项
- `src/components/ProjectConfigPage.tsx`：不参与构建列 + `autoAdvanceStatus` 开关
- `src/pages/RequirementListPage.tsx`：左右两栏 + 列表/看板切换 + 拖拽回写 + 默认筛选
- `src/pages/QuickBuildPage.tsx`：遵守 `excludeFromBuild`
- `src/layouts/AppLayout.tsx`：挂载 `useBuildNotifications`

> 取消：`components/PipelineTrack.tsx`（圆点轨方案已否决）、`releasedEnvs` 历史字段、"构建下一环境"按钮。

---

## 四、实施阶段建议（可独立上线）

- **P0（痛点直击，优先）**：反馈 3（筛选补全+默认未发布）、反馈 5-a（不参与构建开关）、反馈 4（完成通知+标题）。见效快、风险低。
- **P1（核心重塑）**：反馈 1（环境看板 + 单字段 currentEnv + 状态向前对齐）、反馈 2（常驻右栏 + 卡片小灯）。改动最大，需联调。
- **P2（锦上添花）**：反馈 5-b 构建方案、已达环境筛选、看板列折叠/排序。

> 待确认的关键决策：
> 1. 看板做成与列表**可切换的独立视图**（而非替换），默认显示哪个？（建议默认列表，一键切看板；用顺手后可改默认看板）
> 2. 「状态自动向前对齐」默认开还是关？（建议默认开、可关）
> 3. 反馈 5 只做 a、b 暂缓？（建议只做 a）
> 4. 右栏默认展开还是收起？（建议默认展开）
> 5. 流水线类型默认常规大版、可在表单/卡片改（而非登记时必填）？
> 6. 老数据 `currentEnv` 迁移：按老 `status` 反推回填一次，还是置 null 让用户拖拽定位？（建议反推回填）
