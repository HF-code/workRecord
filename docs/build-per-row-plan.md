# 构建入口改造：从全局弹窗改为按项目逐行触发

> 日期：2026-08-17
> 背景：构建按钮当前在页面头部、通过 `BuildModal` 弹窗选择项目/环境。用户反馈：
> 1. 构建应放在每个需求后面（需求已记录项目，只是还没有 group 字段）
> 2. 一个需求涉及多个项目（`items[]`），需要每个项目能单独点构建
> 3. 不再使用弹窗，环境选择直接放在构建按钮旁边

---

## 1. 总体方案

- 删除头部"构建"按钮和 `BuildModal` 弹窗组件
- 在需求表格"项目 / 分支"列中，每个项目条目（`ProjectBranch`）下方增加构建控件：环境 `Select` + 构建按钮
- 原弹窗的"同时更新环境"开关废弃（用户确认不需要），`update` 固定为 `false`
- 构建逻辑复用现有 `src/build.ts`（`requestBuild` / `getCsrfToken` / `BuildEnv`），不做改动
- `group` 暂时保持 `'JenkinsFrontweb'` 硬编码（当前所有前端项目同组）；后续如需多 group，再在项目管理中扩展 `group` 字段

---

## 2. 涉及文件清单

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `src/components/BuildControls.tsx` | 新增 | 单个项目的构建控件（环境选择 + 更新勾选 + 构建按钮 + 状态反馈） |
| `src/components/RequirementTable.tsx` | 修改 | "项目 / 分支"列每个 item 下方渲染 `BuildControls`；列宽适当调整 |
| `src/App.tsx` | 修改 | 移除头部"构建"按钮、`buildOpen` state、`BuildModal` 引用 |
| `src/components/BuildModal.tsx` | 删除 | 弹窗方案废弃 |
| `docs/build-per-row-plan.md` | 新增 | 本文档 |

`src/build.ts`、`vite.config.ts`、`server/` 均不改动。

---

## 3. 实施细节

### 3.1 新增 `src/components/BuildControls.tsx`

**职责**：单个项目的构建触发控件，自管理交互状态。

**Props**：

```ts
interface Props {
  app: string; // 项目名（对应构建 payload 的 app 字段）
}
```

**内部状态**：

```ts
const [env, setEnv] = useState<BuildEnv>('test');
const [building, setBuilding] = useState(false);
```

**UI 结构**（`Space.Compact`，尺寸 `size="small"`）：

- `Select`：dev / test / pre，默认 `test`，宽度约 76
- `Button`：`BuildOutlined` 图标 + "构建"，`loading={building}`，构建中禁用

**点击构建逻辑**（移植自 `BuildModal.handleOk`，去掉表单校验）：

1. `getCsrfToken()` 为空 → `message.warning('未登录运维平台，请先登录后再构建')`，终止
2. `setBuilding(true)`，调用 `requestBuild({ app, env, update: false })`
3. `result.ok` → `message.success(\`【${app}】构建触发成功\`)`
4. `status` 为 401/403 → `message.error('登录态已失效，请重新登录运维平台')`
5. 其他 → `message.error(\`构建失败：${result.detail}\`)`
6. `finally` 中 `setBuilding(false)`

**注意**：`message` 通过 `AntdApp.useApp()` 获取（与项目其他组件一致）。

### 3.2 修改 `src/components/RequirementTable.tsx`

- "项目 / 分支"列：每个 `it` 的分支文本下方加一行 `<BuildControls app={it.project} />`
- 列宽由 280 调整为约 320，容纳控件
- 组件 `Props` 不变（构建控件完全自治，无需回调上抛）

### 3.3 修改 `src/App.tsx`

- 删除 `import BuildModal`、`const [buildOpen, setBuildOpen] = useState(false)`
- 删除头部 `<Button icon={<BuildOutlined />} ...>构建</Button>`（`BuildOutlined` 导入一并移除）
- 删除底部 `<BuildModal ... />` JSX
- 其余逻辑不变

### 3.4 删除 `src/components/BuildModal.tsx`

整文件删除。`ProjectSelect` 仍被 `RequirementForm` 使用，保留。

---

## 4. 关键依赖与上下文

- `src/build.ts`：`requestBuild(params: { app, env, update })` 内部已处理 live-h5-2 老项目分支解析（`resolveBuildBranch`），逐项目调用天然兼容
- 未登录提示语义保持：`csrftoken` 无值仅提示未登录，不做跳转
- 本地/远程通路（Vite 代理 / Fastify 转发）不受影响；本次本地已额外修复 Origin 改写（见 `build-cross-origin-plan.md` 决策记录）

---

## 5. 验证清单

- [ ] `npx tsc --noEmit` 通过
- [ ] 多项目需求：每个项目条目都有独立的 环境选择 + 构建按钮，互不干扰（各自 loading）
- [ ] 未登录（无 csrftoken）点击构建：提示"未登录运维平台"
- [ ] 登录后点击构建：请求 `/devops-api/deploy/build`，payload 的 app 为对应项目、env/build_other 为所选环境
- [ ] live-h5-2 项目构建前自动解析分支（test_/dev_/pre2）
- [ ] 401/403 返回时提示"登录态已失效"
- [ ] 头部"构建"按钮与弹窗已移除，页面无残留引用
