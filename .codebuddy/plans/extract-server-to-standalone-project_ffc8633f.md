---
name: extract-server-to-standalone-project
overview: 将 mywork/server 的 Node 服务迁移为独立项目 d:/工作/创意/mywork-server，同时从 Fastify 改写为 Koa2 框架，修复前端产物路径耦合（WEB_DIST_DIR 环境变量），并清理原目录。
todos:
  - id: migrate-and-rewrite-koa
    content: 迁移工程文件到 mywork-server，用 Koa2 重写 index.ts，新增 .gitignore
    status: completed
  - id: verify-koa-server
    content: 新项目 npm install、build、启动并验证接口转发与静态托管
    status: completed
    dependencies:
      - migrate-and-rewrite-koa
  - id: cleanup-and-docs
    content: 删除 mywork/server 目录并更新 build-cross-origin-plan.md 文档（位置 + 框架）
    status: completed
    dependencies:
      - verify-koa-server
---

## 用户需求

1. 将 mywork 项目内嵌的 node 服务（`mywork/server/`）迁移为独立项目，放置到 `d:\工作\创意\mywork-server`（当前为空目录）
2. 独立项目使用 **Koa2** 框架重写（替代现有 Fastify 实现）

## 产品概述

一个轻量 Node 服务，生产模式下托管 mywork 前端构建产物，并同源代理转发 3 个运维平台（devops.vzan.com）接口，解决浏览器跨域与 Django CSRF 校验问题。

## 核心功能

- 静态托管前端构建产物（mywork/dist），目录不存在时仅警告降级
- 代理转发接口（行为需与现有实现完全一致）：
- POST `/devops-api/deploy/build`
- GET `/devops-api/deploy/branch?app=`
- GET `/devops-api/deploy/application?group=`
- 透传 cookie / x-csrftoken；Origin / Referer 固定为 devops 域；15s 超时；异常返回 502
- 前端产物目录支持 `WEB_DIST_DIR` 环境变量配置，默认指向兄弟目录 `mywork/dist`
- 简单请求日志（method / url / status / 耗时）
- 监听 `process.env.PORT || 8080`，host `0.0.0.0`

## Koa2 适用性评估

**结论：合适。** 理由：

- 当前服务非常轻量（静态托管 + 3 个接口代理），转发逻辑基于全局 `fetch`（Node 18+ 原生），与框架完全解耦，迁移成本低、风险小
- Koa2 中间件模型对该场景表达能力足够，生态成熟（koa-static / @koa/router / koa-bodyparser）
- 相比 Fastify 损失的内建能力（schema 校验、高性能序列化、内建 logger）在本场景均未深度使用，无实际损失
- 使用 koa@^2 稳定版（用户明确 koa2，不用 koa@3 alpha）

## 技术栈

- 运行时：Node.js（>= 18，依赖原生 fetch / AbortController）
- 框架：**koa@^2 + @koa/router + koa-static + koa-bodyparser**
- 语言：TypeScript（ESM，type: module）
- 开发：tsx watch；构建：tsc（NodeNext + ES2022 + strict）

## 框架映射（Fastify → Koa2）

| 现有实现 | Koa2 替代 |
| --- | --- |
| `@fastify/static` | `koa-static` |
| Fastify 路由注册 | `@koa/router`（get/post） |
| `request.body` 自动解析 | `koa-bodyparser` |
| `Fastify({ logger: true })` | 自定义日志中间件（console 输出 method/url/status/耗时） |


## 实现要点

### src/index.ts（Koa2 重写，业务行为原样保留）

- 常量不变：`DEVOPS_ORIGIN`、`UPSTREAM_TIMEOUT_MS = 15_000`、`PORT = process.env.PORT || 8080`
- **WEB_DIST 路径解耦**（迁移后原 `../../dist` 会解析错误）：
- 优先 `process.env.WEB_DIST_DIR`
- 默认 `path.resolve(__dirname, '..', '..', 'mywork', 'dist')`（编译产物位于 mywork-server/dist/index.js，向上两级到 `创意/` 再进 `mywork/dist`）
- 保留 `existsSync` 检查，不存在仅 `console.warn` 降级
- `forwardToDevops` 逻辑行为完全一致：
- headers：Origin/Referer 固定 devops 域；透传 `x-csrftoken`、`cookie`；POST 固定 `content-type: application/json`
- `AbortController` 15s 超时；POST body = `JSON.stringify(ctx.request.body ?? {})`
- 响应：`ctx.status` 透传、`content-type` 透传、body 文本透传
- 异常：超时 502 `{detail: '运维平台请求超时'}`；其他 502 `{detail: '运维平台请求失败：xxx'}`
- 中间件注册顺序：日志中间件 → koa-bodyparser → router → koa-static（API 路由优先于静态托管，避免 /devops-api 被静态中间件拦截）
- `app.listen(PORT, '0.0.0.0')`

### 工程文件

- `package.json`：
- dependencies：`koa@^2`、`@koa/router`、`koa-static`、`koa-bodyparser`
- devDependencies：`typescript@~5.6.2`、`tsx`、`@types/node`、`@types/koa`、`@types/koa__router`、`@types/koa-static`、`@types/koa-bodyparser`
- scripts 不变：dev=`tsx watch src/index.ts`、build=`tsc`、start=`node dist/index.js`
- 原 package-lock.json **不随迁**（依赖全变），重新 `npm install` 生成
- `tsconfig.json` 原样随迁（NodeNext 与框架无关）
- 新增 `.gitignore`：`node_modules`、`dist`
- dist/ 与 node_modules/ 不迁移

### 验证顺序

`npm install` → `npm run build`（tsc 通过）→ `npm run dev` 启动 → curl 验证：

- `GET /devops-api/deploy/branch` 正常转发（或返回上游状态）
- 异常路径返回 502 JSON
- 若 mywork/dist 存在，验证静态首页可访问

### 前端零改动

vite.config.ts 的 dev proxy 独立代理到 devops.vzan.com，与 node 服务无关；前端无任何 8080 硬编码。

## 目录结构

```
d:/工作/创意/mywork-server/
├── src/
│   └── index.ts        # [NEW] Koa2 重写：静态托管 + 3 个 devops 接口代理转发；
│                       #       WEB_DIST 支持 WEB_DIST_DIR 环境变量（默认 ../mywork/dist）；
│                       #       forwardToDevops 行为与原 Fastify 实现完全一致（15s 超时/502 降级/头透传）
├── package.json        # [NEW] koa@^2 + @koa/router + koa-static + koa-bodyparser 及对应 @types；scripts 不变
├── tsconfig.json       # [NEW] 原样随迁（NodeNext/ES2022/strict）
├── package-lock.json   # [NEW] npm install 重新生成（原 lock 不随迁）
└── .gitignore          # [NEW] node_modules、dist

d:/工作/创意/mywork/
├── server/                          # [DELETE] 整个目录删除
└── docs/
    └── build-cross-origin-plan.md   # [MODIFY] 更新：server 已迁移至独立项目 mywork-server，框架 Fastify → Koa2
```

## Agent Extensions

本任务为本地文件迁移与改写，无需使用 MCP / Skill / SubAgent 扩展。