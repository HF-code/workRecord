# 规划文档索引（docs/plans）

> 统一管理本项目所有规划文档，便于后续查阅。状态说明：✅已完成 / 🔧进行中 / 📋规划中 / 📚参考。

## 钉钉构建桥接（本主题）
| 文档 | 内容 | 状态 |
|---|---|---|
| `dingtalk-build-bridge-plan.md` | 完整架构：web×钉钉构建通知，含 bridge-server 定位、DB 取舍、分阶段、接口草案、鉴权 | 📋规划中 |
| `dingtalk-build-phase1-plan.md` | 一阶段执行细节：web 构建回显 + 钉钉 @构建 回复制品（无 DB） | 🔧待实施 |

## 服务端 / 构建链路（既有决策）
| 文档 | 内容 | 状态 |
|---|---|---|
| `../build-cross-origin-plan.md` | 跨域构建方案：本地 vite proxy + 远程 mywork-server(Koa2) 转发 /devops-api；登录态落在 mywork-server 域 | ✅已完成 |
| （extract-server-to-standalone-project） | 将 server 抽为独立项目 mywork-server 的决策记录，结论已落地于 build-cross-origin-plan | ✅已完成 |

## 其他规划 / 产品文档（位于 `docs/`）
| 文档 | 内容 | 状态 |
|---|---|---|
| `../devops-delivery-platform-plan.md` | 运维交付平台相关 | 📚参考 |
| `../devops-projects-sync-plan.md` | 运维项目同步相关 | 📚参考 |
| `../modularize-routing-plan.md` | 路由模块化 | 📚参考 |
| `../system-plan.md` | 系统架构 | 📚参考 |
| `../work-tracker-plan.md` | work-tracker 功能规划 | 📚参考 |
| `../产品计划书.md` | 产品计划书 | 📚参考 |

## 清理记录
- 已删除 `.codebuddy/plans/` 下与 `docs/` 正式版重复的规划工具草稿（card-batch-redesign / quick-batch-build / ui-revamp / build-node-server / extract-server 等），避免分散与过期内容干扰查阅。
- 钉钉方案从 `docs/` 根目录迁入本 `docs/plans/` 文件夹。
