# work-tracker 项目规则

本文件用于 **自动加载** 项目协作规范与编码约定。在 HiFox/Agent 环境中，涉及本仓库的所有编码与协作任务必须遵循以下规则，无需每次手动触发 skill。

## 项目概览

- 名称：`work-tracker` 工作记录系统
- 技术栈：React 18 + TypeScript + Vite + Ant Design 5 + react-router-dom 6 + dayjs
- 包管理：npm（`package-lock.json` 存在）
- 入口：`index.html` → `src/`
- 构建：`npm run dev` / `npm run build`（tsc + vite build）/ `npm run preview`

## 目录结构（约定）

- `src/` 业务源码
- `docs/` 方案与计划文档（`*-plan.md`）
- `dist/` 构建产物（勿改）
- `extension/` 扩展相关
- `.codebuddy/` CodeBuddy 相关配置

## 编码规范（强制）

- TypeScript 严格类型，禁止 `any` 滥用
- 组件函数式，hooks 命名以 `use` 开头
- 使用 Ant Design 组件与图标（`@ant-design/icons`），保持样式一致
- 路由统一通过 `react-router-dom` 管理
- 日期处理统一使用 `dayjs`
- 每个公共函数/组件添加 JSDoc 注释（作用/参数/返回值）
- 复杂逻辑必须加行内注释说明
- 改动前阅读对应用途的 `docs/*-plan.md` 方案文档，保持一致

## 开发流程（自动执行）

1. 修改代码前，先阅读相关 `docs/*-plan.md` 与 `src/` 下相关模块，理解现状
2. 代码完成后执行 `npm run build`（含 `tsc --noEmit` 类型检查）确认无错误
3. 不擅自提交代码，提交由发布助手统一执行
4. 涉及公共组件/路由/Store 的改动，先说明影响范围

## 协作约定

- 统一使用中文交流与注释
- 禁止绕过规则或使用 `--no-verify` 跳过检查
- 遇到 git 冲突停止，等待人工处理