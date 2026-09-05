# UI 改造计划：黑白色调 + 瀑布流 + 状态分色（ui-revamp）

> 上一轮已完成卡片化 + 批量操作区（docs/card-batch-redesign-plan.md），本次为纯 UI/交互微调。执行会话以本文档为准。

## 一、用户需求与已确认决策

1. **不换 shadcn/ui**（评估：需 Tailwind+Radix 全量重写，AntD 的 DatePicker/message/Upload 等无对等开箱方案，个人工具成本远大于收益）→ 改**黑白色调主题**。
2. **黑白化范围**：仅主色黑白（主按钮、选中态、批量面板、链接）；**状态 Tag 保留功能色**（STATUS_COLORS 不动）。
3. **按钮去图标**：构建/提交MR 文字按钮去前置图标；卡片内单项目 MR 图标按钮保留（该行唯一入口）。
4. **瀑布流**：卡片轮询入列（data[i] → 第 i%cols 列），阅读顺序=数据顺序，拖拽语义不变。
5. **卡片分色**：开发中 / 进行中（已提测~待发布）/ 发布后（线上验证中、已发布）三组。
6. **勾选简化**：勾选卡片 = 全部项目直接进批量；卡片内子勾选改**纯会话态**（默认不勾、不持久化、刷新即失），仅决定单卡构建/MR 作用范围；存量 buildItems 忽略不读（类型保留兼容导出）。
7. **清单去需求名**：构建清单 `项目 → env`；MR 清单 `项目：分支 → env`。
8. **复制按钮**：构建清单标题旁，复制逐行 `项目名【目标分支】`。

## 二、UI 设计专家定稿色值

| 元素 | 值 |
|---|---|
| colorPrimary | `#1F1F1F`，显式覆盖 `colorPrimaryHover #333333`、`colorPrimaryActive #000000`（防 AntD 算法生成发灰 hover） |
| colorLink | `#1F1F1F`（hover `#000`） |
| 卡片-开发中 | bg `#F0F5FF` / border `#D6E4FF` |
| 卡片-进行中 | bg `#FAF5ED` / border `#EBDFC9`（降饱和 40%，防整屏暖化） |
| 卡片-发布后 | bg `#F5F5F5` / border `#D9D9D9` |
| 卡片选中态 | border `1.5px #1F1F1F` + boxShadow `0 2px 8px rgba(0,0,0,0.10)` |
| 批量面板 | bg `#FAFAFA` / border `#D9D9D9`；清单白卡 border `#E5E5E5`（外深内浅） |
| 保留彩色 | 状态 Tag（STATUS_COLORS）、"N 项将跳过"橙 `#FA8C16` |

## 三、文件清单与改动

| 文件 | 改动 |
|---|---|
| `src/main.tsx` | ConfigProvider 注入 theme token（见上表） |
| `src/batch.ts` | BuildPlanLike 收窄 `{ getEnv }`；BuildPlan 收窄 `{ getEnv, setEnv }`；getBatchItems 改 `req.items − excluded`；collect*/summarize 签名同步 |
| `src/components/RequirementCard.tsx` | 子勾选本地 useState（默认空、不持久化）；getCardTone 状态分色；构建/MR 按钮去图标；选中态黑白化；版本 Tag default |
| `src/components/RequirementCardGrid.tsx` | grid 改瀑布流：flex 列容器 + ResizeObserver 列数（`Math.max(1, floor((w+12)/352))`）+ 轮询分配；排序箭头 `#1F1F1F` |
| `src/components/BatchPanel.tsx` | 清单行去 reqName；构建清单复制按钮（CopyOutlined + clipboard）；批量按钮去图标；面板/Tag 黑白化 |
| `src/pages/RequirementListPage.tsx` | handleToggleSelect 移除"未勾选项目"校验；「统计项目」按钮去硬编码蓝 |

## 四、执行步骤

1. 写本文档 ✅
2. main.tsx 黑白主题
3. batch.ts 签名收窄
4. RequirementCard（分色/会话勾选/去图标）
5. RequirementCardGrid（瀑布流）
6. BatchPanel（清单瘦身/复制/黑白化）
7. 页面同步 + `npm run build` 验证

## 五、规范

- inline style 风格、禁 any、JSDoc、行内注释；不加 data-testid（用户已确认）；不擅自提交代码。
