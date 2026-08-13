# 工作记录（work-tracker）

一个轻量的**需求交付台账工具**，用于集中跟踪研发需求的交付进度。数据全部保存在浏览器本地（localStorage），无需后端。

## 功能特性

- **需求登记与管理**：记录需求名称、TAPD 链接、状态、发版时间，并支持一个需求关联多个「项目 + 开发分支」。
- **状态流水线追踪**：内置 10 个研发阶段（开发中 → 已提测 → 测试中 → 测试通过 → 验收通过 → 预发布测试中 → 待发布 → 线上验证中 → 已发布），可表格内直接切换。
- **统计看板**：按状态汇总数量，点击状态标签即可快速筛选。
- **多维度筛选**：按状态、项目、发版日期、需求名关键词实时检索。
- **项目管理**：维护项目清单，登记需求时可当场新建项目。
- **导出与归档**：支持导出全部数据为 JSON；可导出并清理「发版时间在一个月前」的数据以释放本地缓存。

## 技术栈

- React 18 + TypeScript
- Vite 5
- Ant Design 5（`antd` / `@ant-design/icons`）
- dayjs（日期处理）
- 数据存储：浏览器 `localStorage`

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建（类型检查 + 打包）
npm run build

# 本地预览构建产物
npm run preview
```

## 数据存储说明

| Key | 内容 |
| --- | --- |
| `work-tracker:requirements:v1` | 需求数组 |
| `work-tracker:projects:v1` | 项目字符串数组 |

- 默认项目清单仅在首次启动时播种一次，之后删除不会自动复活。
- 数据仅保存在当前浏览器，换设备/清缓存会丢失，请使用「导出全部」定期备份。

## 目录结构

```
src/
├── App.tsx              # 主页面：状态、筛选、导入/导出逻辑
├── main.tsx             # 应用入口（Antd 中文locale、ConfigProvider）
├── types.ts             # 类型定义与状态枚举、颜色映射
├── storage.ts           # localStorage 读写与默认项目
├── export.ts            # 导出 JSON / 归档清理逻辑
└── components/
    ├── RequirementForm.tsx   # 登记/编辑需求表单
    ├── RequirementTable.tsx  # 需求列表表格
    ├── StatsBar.tsx          # 状态统计看板
    ├── ProjectManager.tsx    # 项目管理弹窗
    ├── ProjectSelect.tsx     # 可新建项目的下拉选择
    └── StatusTag.tsx         # 状态标签
```
