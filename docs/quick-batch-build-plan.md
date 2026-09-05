# 快速批量构建功能计划（quick-batch-build）

> 场景：统计多人要发的项目——别人发项目名文本，用户整段粘贴进来，自动解析 + 去重（支持多波追加累积），统一选一个目标分支，一键批量构建。临时数据不进入需求列表。

## 一、交互设计

- 入口：需求列表页顶部「快速构建」按钮（ThunderboltOutlined），打开右侧 Drawer（width 560）。
- Drawer 内容自上而下：
  1. **输入区**：TextArea（rows 4，支持换行/逗号/顿号/分号/Tab/空格分隔）+「添加」按钮——解析后与当前列表合并去重，提示"新增 N 项，跳过重复 M 项"，输入框清空。
  2. **分支选择**：统一目标分支 Select，默认 `getDefaultBranch(branches)`，全部项目共用。
  3. **统计行**：`共 N 个项目（去重后）` + 右侧「清空」按钮。
  4. **构建清单汇总**（上）：白卡逐行 `项目 → env`；标题旁复制按钮（逐行 `项目名【目标分支】`）；不在 devopsApps 名单的项目行尾 WarningOutlined + Tooltip 警示，仍允许构建。
  5. **项目小框**（下）：每项目一个可关闭 Tag（closable），X 即移除，flex wrap。
  6. **底部**：批量构建按钮（primary，loading，空列表禁用）。
- 构建流程：getCsrfToken 前置校验 → 逐个 `startBuildTask(project, project, env)`（reqName 用项目名自身）→ Promise.all → ok/fails/401 分类汇总提示；构建后列表保留（可重试），手动「清空」重置。

## 二、数据与持久化

- localStorage key：`work-tracker-quick-build`，存 `{ projects: string[], env: BuildEnv }`；读写 try/catch JSON（仿 src/storage.ts 模式）；「清空」删除 storage。
- 解析函数 `parseProjectNames`：`/[\n,，;；、\t ]+/` 分割 → trim → 滤空 → 保序去重。

## 三、文件清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `docs/quick-batch-build-plan.md` | 新增 | 本文档 |
| `src/components/QuickBuildDrawer.tsx` | 新增 | Drawer 全部逻辑（解析/追加/持久化/清单/小框/批量构建） |
| `src/pages/RequirementListPage.tsx` | 修改 | 顶部加「快速构建」按钮 + 挂载 Drawer（约 +15 行） |

## 四、规范

黑白色调沿用（#fafafa/#e5e5e5 灰阶 + 警示橙）；禁 any；JSDoc；不加 data-testid；完成后 `npm run build` 验证；不擅自提交。
