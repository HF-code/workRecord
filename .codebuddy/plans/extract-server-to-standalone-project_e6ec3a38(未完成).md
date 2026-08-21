---
name: extract-server-to-standalone-project
overview: 将 mywork/server 下的 Fastify Node 服务迁移为独立项目 d:/工作/创意/mywork-server，修复前端产物路径耦合（改为环境变量可配置），并清理原目录。
todos:
  - id: migrate-server-files
    content: 迁移 server 工程文件到 mywork-server 并新增 .gitignore
    status: pending
  - id: fix-web-dist-path
    content: 修改 index.ts 的 WEB_DIST 解析，支持 WEB_DIST_DIR 环境变量
    status: pending
    dependencies:
      - migrate-server-files
  - id: verify-new-project
    content: 新项目 npm install、build、启动并验证接口转发
    status: pending
    dependencies:
      - fix-web-dist-path
  - id: cleanup-and-docs
    content: 删除 mywork/server 目录并更新 build-cross-origin-plan.md 文档
    status: pending
    dependencies:
      - verify-new-project
---

## 需求概述

将 mywork 项目内嵌的 node 服务（`mywork/server/`）迁移为独立项目，放置到 `d:\工作\创意\mywork-server`（当前为空目录）。

## 核心内容

- 整体迁移 server 的源码与工程文件（src/index.ts、package.json、tsconfig.json、package-lock.json）到新目录，dist 产物不迁移（重新构建）
- 修复前端产物路径耦合：原 `../../dist` 相对路径在迁移后会解析错误，改为环境变量 `WEB_DIST_DIR` 优先 + 默认指向兄弟目录 `mywork/dist`，保留"目录不存在仅警告"的行为
- 新项目补充 `.gitignore`（node_modules、dist）
- 删除 mywork 项目中的 `server/` 目录
- 同步更新 `docs/build-cross-origin-plan.md` 中涉及 server 路径/位置的描述
- 迁移后验证：npm install 安装依赖、tsc 构建通过、服务可启动且 /devops-api 转发正常
- 前端 mywork 项目代码零改动（dev 模式走 vite proxy，与 node 服务无关）

## 技术方案

### 策略

纯目录迁移 + 一处路径解耦，不改动任何业务逻辑。Fastify 服务本身保持不变，仅调整静态资源目录的解析方式。

### 关键决策

1. **WEB_DIST 路径解耦**：`src/index.ts` 中 `WEB_DIST` 改为：

- 优先读取环境变量 `WEB_DIST_DIR`
- 默认值 `path.resolve(__dirname, '..', '..', 'mywork', 'dist')`（编译产物位于 mywork-server/dist/index.js，向上两级到 `创意/` 再进入 `mywork/dist`）
- 保留原有 `existsSync` 检查与 warn 降级逻辑，行为向后兼容

2. **不迁移 dist/ 与 node_modules/**：新项目重新 `npm install`（package-lock.json 随迁保证依赖一致）+ `npm run build`
3. **不强制 git init**：用户未要求，仅落盘文件
4. **前端零改动**：vite.config.ts 的 dev proxy 独立存在；生产模式由新服务托管，前端无任何硬编码服务地址

### 执行要点

- package.json / tsconfig.json 内容原样迁移（name `work-tracker-server`、NodeNext + ES2022 配置均与位置无关）
- 验证顺序：`npm install` → `npm run build`（tsc 通过）→ `npm run dev` 启动 → curl 验证 `/devops-api/deploy/branch` 转发与静态托管（若 mywork/dist 存在）
- 文档更新仅限 `docs/build-cross-origin-plan.md` 中 server 位置相关段落

### 目录结构

```
d:/工作/创意/mywork-server/
├── src/
│   └── index.ts        # [MODIFY] 从 mywork/server 迁移；仅修改 WEB_DIST 解析逻辑（WEB_DIST_DIR 环境变量优先，默认 ../mywork/dist）
├── package.json        # [NEW] 原样迁移（work-tracker-server，fastify ^5 + @fastify/static ^8）
├── tsconfig.json       # [NEW] 原样迁移（NodeNext/ES2022/strict）
├── package-lock.json   # [NEW] 原样迁移，保证依赖版本一致
└── .gitignore          # [NEW] node_modules、dist

d:/工作/创意/mywork/
├── server/                          # [DELETE] 整个目录删除
└── docs/
    └── build-cross-origin-plan.md   # [MODIFY] 更新 server 已迁移至独立项目 mywork-server 的描述
```