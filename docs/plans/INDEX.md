# 规划文档索引（docs）

> 统一管理本项目所有规划/参考文档。状态说明：✅已落地（保留作参考） / 🔧进行中 / 📋规划中 / 📚背景参考。

## 〇、先读这个：项目全貌

| 文档 | 内容 | 状态 |
|---|---|---|
| `架构导读.md`（docs 根目录） | **项目地图 + 五个核心文件导读 + 改动导航表（30+ 条）+ 8 个易踩坑 + 术语表 + 60 分钟上手清单**。不逐行读代码也能掌握全貌；改需求时直接查导航表定位落点 | ✅长期有效 |

## 一、当前架构与实施记录（已落地，改动前建议先读）

| 文档 | 内容 | 状态 |
|---|---|---|
| `plans/dual-track-rework-plan.md` | **双轨环境模型（当前架构权威说明）**：微赞轨/星享轨并行推进、派生状态、按轨构建/MR、一次性迁移 | ✅已落地 |
| `plans/bugfix-requirement-form-and-mr-tabs-plan.md` | **数据来源单点化（当前权威说明）**：表单 items 受控重构（修「编辑后分支丢失」）、MR 多标签页打开（修「只开一个」）、运行时零旧数据兼容 + 旧数据只在导入边界转换 + 旧版数据逃生闭环 | ✅已落地 |
| `build-cross-origin-plan.md` | 跨域构建方案：Vite proxy + mywork-server(Koa2) 转发 `/devops-api`，登录 cookie 落在本地服务域 | ✅已落地 |
| `plans/dingtalk-build-phase1-dev-plan.md` | 钉钉构建桥 · 阶段一实施清单：账号绑定、`/构建` 命令、制品回推（现走钉钉 Stream 模式） | ✅已落地 |
| `dingtalk-local-debug.md` | 钉钉构建桥 · 本地调试手册（"外接钉钉"设置、服务启动、常见问题） | 🔧使用手册 |

## 二、架构与未来规划

| 文档 | 内容 | 状态 |
|---|---|---|
| `plans/dingtalk-build-bridge-plan.md` | 钉钉桥接完整架构：阶段一无 DB / 阶段二上 DB 做共享源、鉴权设计、通道取舍（微信已放弃） | 📋阶段二待启动 |
| `devops-delivery-platform-plan.md` | 测试环境自动化交付平台产品方案（多角色、状态机、MR 编排、Phase 1 细节） | 📚未来规划 |
| `system-plan.md` | 内部交付协作平台系统计划（角色权限、操作留痕、AI 报告链路） | 📚未来规划 |
| `产品计划书.md` | 产品计划书（背景痛点、目标、核心能力闭环） | 📚产品背景 |
| `prototype.html` | 协作平台交互原型（浏览器直接打开查看） | 📚原型参考 |

## 三、清理记录

- **2026-09-14 清理**：删除 10 份已完成/已废弃的计划，避免过期内容干扰查阅：
  - 已被「双轨重构」推翻：`board-ux-optimization-dev-plan.md`、`board-ux-revise-plan.md`、`feedback-optimization-plan.md`（原「环境看板 + 单流水线」方案，看板组件已从代码中移除，结论由 `dual-track-rework-plan.md` 取代）。
  - 与保留文档重叠：`dingtalk-build-phase1-plan.md`（内容并入 `dingtalk-build-phase1-dev-plan.md`）。
  - 已落地且固化在代码中：`quick-batch-build-plan.md`、`ui-revamp-plan.md`、`card-batch-redesign-plan.md`、`modularize-routing-plan.md`、`devops-projects-sync-plan.md`、`work-tracker-plan.md`。
  - 需要回溯历史版本时：`git log --diff-filter=D --name-only -- docs/` 找到删除提交，`git show <commit>^:<path>` 查看原文。
- 注：`.codebuddy/plans/` 是 IDE 规划工具草稿目录（与 `docs/plans/` 部分内容重复），后续查阅与维护以 `docs/plans/` 为准。
