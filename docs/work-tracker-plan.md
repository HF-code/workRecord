# 工作需求记录站（work-tracker）执行计划

## 一、概述

静态网站，React 18 + Vite + Ant Design 5，PC 端单页应用。用于登记工作需求（需求名、TAPD 链接、涉及项目与开发分支），跟踪需求状态与发版时间，支持筛选、导出与本地数据清理。数据存 localStorage，构建产物为纯 dist 包，直接放 CDN。

### 已确认的关键决策

| 决策点 | 结论 |
|---|---|
| 状态/发版时间粒度 | 方案 A：挂在**需求**上（一条需求一个状态、一个发版时间） |
| "一个月以前"的判断依据 | **发版时间**（releaseDate < 今天-1个月）；导出为防误删备份，导出后才删除本地数据 |
| 项目字段 | 本地维护项目清单（localStorage），下拉选择 + 可就地新增选项 |
| UI 库 | Ant Design 5 |
| 部署 | 仅 PC，无同步，`vite build` 出 dist 放 CDN，`base: './'` |

## 二、技术栈与依赖

- Vite 5 + React 18 + TypeScript
- antd 5 + @ant-design/icons
- dayjs（antd 自带依赖，直接使用）
- 不引入路由（单页）、不引入状态库（useState + localStorage 足够）

## 三、文件清单

```
mywork/
├── package.json                # 新增
├── vite.config.ts              # 新增，base: './'
├── tsconfig.json               # 新增
├── index.html                  # 新增
└── src/
    ├── main.tsx                # 新增，挂载 + antd ConfigProvider(zhCN)
    ├── App.tsx                 # 新增，页面主体
    ├── types.ts                # 新增，类型与状态枚举
    ├── storage.ts              # 新增，localStorage 读写（需求 + 项目清单）
    ├── export.ts               # 新增，导出/导出并清理逻辑
    └── components/
        ├── RequirementForm.tsx     # 新增，登记/编辑弹窗表单
        ├── ProjectSelect.tsx       # 新增，下拉选择 + 新增选项 + 分支输入的行组件
        ├── StatusTag.tsx           # 新增，状态标签（颜色映射）
        ├── StatsBar.tsx            # 新增，顶部状态计数条
        └── RequirementTable.tsx    # 新增，主表格（可展开显示项目分支）
```

## 四、数据模型

```ts
// types.ts
export const STATUSES = [
  '开发中', '已提测', '测试中', '测试通过', '验收通过',
  '预发布测试中', '待发布', '线上验证中', '已发布',
] as const;
export type Status = (typeof STATUSES)[number];

export interface ProjectBranch {
  id: string;        // crypto.randomUUID()
  project: string;   // 来自项目清单
  branch: string;    // 自由输入
}

export interface Requirement {
  id: string;
  name: string;               // 需求名称，必填
  tapdUrl: string;            // TAPD 链接，必填，校验 http(s)
  items: ProjectBranch[];     // 至少 1 条
  status: Status;             // 默认 '开发中'
  releaseDate: string | null; // 'YYYY-MM-DD'，可空
  createdAt: string;          // ISO 时间
  updatedAt: string;
}
```

### localStorage 结构

| key | 内容 |
|---|---|
| `work-tracker:requirements:v1` | `Requirement[]` |
| `work-tracker:projects:v1` | `string[]` 项目清单 |

均带 `v1` 版本号，为后续导入/迁移留口子。

## 五、功能细节

### 5.1 登记 / 编辑需求（RequirementForm，Modal 表单）

- 字段：需求名称*、TAPD 链接*（url 校验）、状态（Select，默认"开发中"）、发版时间（DatePicker，可清空）、项目分支列表（Form.List 动态行，至少 1 行，可增删）
- 项目列：`ProjectSelect`——antd Select 下拉，选项来自项目清单；dropdown 底部放"输入新项目名称 + 添加"区，添加后写入 `work-tracker:projects:v1` 并立即选中
- 分支列：普通 Input
- 编辑与登记共用同一弹窗，`title` 区分

### 5.2 状态修改

- 表格每行的状态列直接渲染为 Select（或点击 Tag 弹出 Select），改动即保存，同时更新 `updatedAt`
- 发版时间列同理，行内 DatePicker 可直接改

### 5.3 列表展示（RequirementTable）

- 列：需求名称（带 TAPD 外链 icon，新窗口打开）、项目/分支（合并展示，如 `shop-h5 / feat-a`，多个换行；或 expandable 展开子表——**采用列内换行展示**，实现更简单）、状态（行内 Select + 颜色 Tag 样式）、发版时间（行内 DatePicker）、登记时间、操作（编辑 / 删除，删除需 Popconfirm）
- 状态颜色映射建议：开发中-蓝、已提测-青、测试中-金、测试通过-绿、验收通过-绿、预发布测试中-紫、待发布-橙、线上验证中-青、已发布-灰

### 5.4 筛选区

- 状态多选 Select
- 项目下拉（来自项目清单）
- **「仅看今天发版」Switch/Checkbox**：`releaseDate === dayjs().format('YYYY-MM-DD')`
- 需求名称关键字搜索 Input
- 筛选条件用 useMemo 组合过滤

### 5.5 顶部统计条（StatsBar）

- 按状态统计当前全部需求的数量，Tag/Badge 横向排列，点击某状态等同设置状态筛选

### 5.6 导出（export.ts）

统一导出格式（即未来导入格式）：

```jsonc
{
  "version": 1,
  "exportedAt": "2026-08-12T10:00:00.000Z",
  "type": "all" | "archive",        // 全部导出 / 清理归档导出
  "requirements": [ /* Requirement[] */ ]
}
```

下载方式：`Blob` + `URL.createObjectURL` + 临时 `<a download>`，文件名 `work-tracker-{type}-{YYYYMMDD-HHmm}.json`。

- **导出数据**：导出所有需求，不删数据
- **导出并清理一个月前数据**：
  1. 筛选 `releaseDate` 非空且 `releaseDate < dayjs().subtract(1, 'month').format('YYYY-MM-DD')` 的需求
  2. 若数量为 0，message 提示"无可清理数据"，不弹后续
  3. Modal 二次确认，文案明示"将先导出 N 条数据到本地文件，再从浏览器缓存中删除，删除后不可恢复（请保留好导出文件）"
  4. 确认后：先触发下载 → 下载触发后从 localStorage 移除这些 id → 刷新列表 + 成功提示
  5. `releaseDate` 为空的需求**永不清理**（避免误删未发版数据）

### 5.7 导入

本次不做。仅保证导出格式带 `version` 字段，UI 上预留一个禁用的「导入」按钮（tooltip: "后续版本支持"）或不放按钮——**选择不放按钮**，保持界面干净，导出格式已留好口子。

## 六、页面布局

```
┌────────────────────────────────────────────────────────────┐
│ 工作记录        [登记需求] [导出数据] [导出并清理一月前数据] │
├────────────────────────────────────────────────────────────┤
│ StatsBar: 各状态计数 Tag，点击可筛选                          │
├────────────────────────────────────────────────────────────┤
│ 状态[多选▾] 项目[▾] [☐仅今天发版] [搜索需求名___]             │
├────────────────────────────────────────────────────────────┤
│ Table: 需求名(链接) | 项目/分支 | 状态 | 发版时间 | 操作      │
└────────────────────────────────────────────────────────────┘
```

- 整体 `max-width: 1200px` 居中，浅灰背景 + 白色卡片
- 空状态 Empty 组件引导登记

## 七、构建与部署

- `vite.config.ts` 设 `base: './'`，保证 dist 放 CDN 任意子路径可用
- `npm run build` → `dist/` 直接上传 CDN
- antd 按需引入（Vite 默认 tree-shaking，无需 babel-plugin-import）

## 八、实施步骤（执行会话按此勾选）

1. [x] 初始化 Vite + React + TS 工程，安装 antd、dayjs
2. [x] `types.ts`：状态枚举、Requirement/ProjectBranch 类型
3. [x] `storage.ts`：需求与项目清单的 load/save（JSON 序列化 + try/catch 容错）
4. [x] `export.ts`：buildExportPayload、downloadJson、exportAll、findOlderThanOneMonth
5. [x] `ProjectSelect.tsx`：下拉 + 新增选项
6. [x] `RequirementForm.tsx`：登记/编辑弹窗（含 Form.List 动态项目分支行、校验）
7. [x] `StatusTag.tsx` + 状态颜色映射
8. [x] `StatsBar.tsx`：状态计数 + 点击筛选
9. [x] `RequirementTable.tsx`：表格、行内状态/发版时间修改、编辑/删除
10. [x] `App.tsx`：布局组装、筛选逻辑、CRUD 串联、导出按钮接线
11. [x] `main.tsx` + `index.html` + `vite.config.ts`（base './'、zhCN）
12. [x] `npm run build` 验证产物可正常打开（dist 已生成，preview 访问 200）

## 九、边界与容错

- localStorage 读取失败/JSON 损坏：回退空数组，不白屏
- 删除需求、清理数据均需二次确认
- 同一需求的项目分支行允许重复（不强制唯一），但表单校验项目与分支均非空
- 全部操作即时落盘 localStorage（每次变更后整体 save，数据量小无需 diff）
