# 测试环境自动化交付平台 — 产品计划

> 来源：与 DeepSeek 对话整理（2026-08-14）
> 对话结论：系统绝对可行，属于"DevOps 自动化编排平台 / 变更管控平台"的雏形；技术实现只占 30%，剩下 70% 在于异常处理与流程严谨性。
> 用户最终决策：① 不做自动重置/回退按钮，回退去旧平台操作，本系统仅允许手动扭转状态；② Phase 1 只做测试环境自动化；③ 构建不传锁定 Commit ID，基于 test 分支最新 HEAD 构建。

---

## 1. 产品概述

### 1.1 背景与痛点

当前交付流程涉及 GitLab（代码）、TAPD（需求）、内部运维平台（构建/部署）三个系统，全程人工串联：

- 提测后开发手动合并代码到 test 分支 → 手动去运维平台构建测试制品 → 测试用运维平台发布
- 测试通过后等测试通知 → 开发手动提交合并请求 → 等有权限的人合并 → 手动构建预发布制品 → 测试标记预发布环境 → 有权限的人手动发布
- 验证通过后等大版时间 → 有权限的人统一用预发布分支构建线上制品 → 测试标记 → 统一发布

**问题**：流程中大量"传话筒"和"点击器"式人工操作，耗时、易错、状态不透明。

### 1.2 产品定位

一个内部 DevOps 交付编排平台：从需求提测开始，录入需求 + 涉及仓库 + 开发分支，由系统自动串联 GitLab MR、运维平台构建/部署、TAPD 状态扭转，关键环节保留人工审批入口。

### 1.3 目标价值

- 开发：告别手动合并/构建，点完按钮只等"测试环境就绪"通知
- 测试：在平台一键同意提测，实时看流水线进度，无需追着开发问
- 管理者：操作留痕可审计，发布有审批门禁，状态有唯一真理源

---

## 2. 完整愿景流程（目标态）

| 阶段     | 触发人           | 系统自动动作                                                | 人工节点                        |
| -------- | ---------------- | ----------------------------------------------------------- | ------------------------------- |
| 提测     | 开发             | 录入需求+仓库+分支 → 提交后自动改 TAPD 为"已提测"           | 开发提交                        |
| 测试     | 测试点"同意"     | 自动发起 dev→test MR → 合并后调用运维平台构建测试制品并发布 | 冲突时人工解决                  |
| 预发布   | 测试点"上预发布" | 自动提交 MR → 合并后构建预发布制品、标记环境、发布          | 有权限者审批合并                |
| 待发布   | 预发布验证通过   | 自动置为"待发布"                                            | —                               |
| 大版发布 | 测试点"发布大版" | 按待发布需求构建线上制品（不发布）                          | 开发领导确认 → 测试确认后才发布 |

---

## 3. 四大核心风险与应对（命门）

### 3.1 代码冲突与合并失败

- **风险**：自动合并遇到冲突流程卡死，测试空等。
- **应对**：绝不直接 `git merge`，必须走 GitLab MR API；合并前做**冲突预检**（模拟 MR 检查），有冲突立即硬拦截 → 状态置"冲突待解决"→ 钉钉强提醒开发（附冲突文件列表）→ 开发人工解决后点"重试"继续。

### 3.2 状态机幂等与一致性

- **风险**：TAPD / GitLab / 运维平台三个状态源，网络抖动导致数据不一致。
- **应对**：本地数据库为唯一"真理源"；调用外部 API 采用"本地状态先行 + 异步回调确认"模式；每次发布强制记录制品版本号；外部调用做幂等处理，防重复创建 MR/构建任务。

### 3.3 权限割裂

- **风险**：领导还要去 GitLab 点 Merge，留痕不完整、易误操作。
- **应对**：系统使用 GitLab 服务账号 Token，领导在本系统点"同意"即由系统调用 API 完成合并，操作日志全部留在本平台。

### 3.4 多需求并发构建（Commit 锁定陷阱）

- **风险**：需求 A 锁定 commit_A 构建，需求 B 随后合入 test；若 A 重新构建旧 commit，会覆盖 B 的代码，测试环境"时光倒流"。
- **应对（已确认的修正逻辑）**：

| 阶段     | 动作                              | 传递参数                                       |
| -------- | --------------------------------- | ---------------------------------------------- |
| 冲突预检 | 判断 feature/A 合入 test 是否冲突 | 使用锁定的 `baseline_commit_id` 模拟合并       |
| 正式合并 | 调 GitLab API 合入 test           | 合入最新 test（可能已含 B）                    |
| 触发构建 | 调运维平台构建接口                | **只传分支名 `test`，不传 Commit ID**          |
| 记录审计 | 记录本次实际构建的 Commit         | 构建成功后查询 test 最新 HEAD 存库（仅追溯用） |

- `baseline_commit_id` 的用途收敛为两件事：**冲突预检** 和 **回退靶点参考**。
- 根治方案（Phase 2+）：需求独立环境（Feature Environment），数据库预留 `env_type`、`isolated_domain` 字段。

---

## 4. 分期路线图（MVP 迭代）

| 阶段    | 名称   | 范围                                                 | 目标                     |
| ------- | ------ | ---------------------------------------------------- | ------------------------ |
| Phase 1 | 止血期 | 仅测试环境自动化（提测 → 合并 → 构建 → 部署 → 就绪） | 砍掉最高频痛点，快速见效 |
| Phase 2 | 规范期 | GitLab 合并管控，预发布/生产 MR 强制走本系统发起     | 操作留痕、权限收敛       |
| Phase 3 | 全流程 | 发布日历、大版一键发布、接入审批流                   | 完整变更管控平台         |

---

## 5. Phase 1 详细方案（可直接喂给 AI 编辑器 Coding）

### 5.1 目标

实现"提交提测 → 测试环境部署完成"全链路自动化，异常提供人工状态扭转后门。

### 5.2 技术栈（已确认）

- 后端：Node.js (NestJS) + TypeScript + PostgreSQL + Redis（轮询任务锁）
- 前端：**React + Ant Design**（已确认）
- 外部依赖：GitLab API v4、TAPD API、运维平台 OpenAPI（构建/部署）
- 通知渠道：**钉钉**（Webhook 卡片消息，已确认）
- 登录认证：**对接现有运维平台账号体系**（已确认）

### 5.3 数据库设计

```sql
-- 交付单主表
CREATE TABLE delivery_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tapd_id VARCHAR(50) NOT NULL,            -- TAPD 需求 ID
    tapd_title VARCHAR(255),                 -- 需求标题（拉取后存储）
    tapd_status VARCHAR(50),                 -- TAPD 当前状态
    developer VARCHAR(100),                  -- 开发负责人
    tester VARCHAR(100),                     -- 测试负责人

    -- 仓库信息（JSON 数组）
    repos_info JSONB NOT NULL,               -- [{"repo_url":"", "dev_branch":"feature/x", "baseline_commit_id":"abc"}]

    status VARCHAR(30) NOT NULL DEFAULT 'draft',

    test_env_url VARCHAR(255),               -- 部署成功后的访问地址
    gitlab_mr_id INTEGER,                    -- GitLab MR ID
    pipeline_build_id VARCHAR(100),          -- 运维平台构建任务 ID

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    submitted_at TIMESTAMP,
    deployed_at TIMESTAMP
);

-- 状态操作日志表（人工扭转状态留痕）
CREATE TABLE order_audit_logs (
    id BIGSERIAL PRIMARY KEY,
    order_id UUID REFERENCES delivery_orders(id),
    operator VARCHAR(100),
    from_status VARCHAR(30),
    to_status VARCHAR(30),
    remark TEXT,                             -- 人工备注原因（强制必填）
    created_at TIMESTAMP DEFAULT NOW()
);
```

**状态机**：`draft → submitted(待测试确认) → testing(流水线执行中) → test_done(测试就绪) → failed(失败终止)`

**强制扭转规则**：不允许从 `test_done` 回退；允许管理员/创建者将 `failed` 或 `testing` 手动改为 `draft` / `submitted` / `failed`，只改本地状态、不调外部接口，必须写审计日志。

### 5.4 核心流程逻辑

**① 创建与提交提测（开发）**

- 填 TAPD ID，自动拉取标题/迭代/状态
- 支持添加多个仓库 + 各自开发分支
- 点"提交提测"时：调 GitLab API 取各分支最新 Commit 存入 `baseline_commit_id`（仅用于预检和追溯）；调 TAPD API 改状态为"已提测"；本地置 `submitted`

**② 冲突预检（测试点"同意提测"后）**

- 遍历 `repos_info`，对每个仓库用 `baseline_commit_id` 模拟 MR 检查冲突
- 无冲突：进入 ③
- 有冲突：置 `failed`，强通知开发（附冲突文件列表），挂起待人工处理

**③ 合并、构建、部署**

- 正式创建 MR 并调 API 自动合并（feature/xxx → test）
- 构建：**只传分支名 `test`**，不传锁定 Commit（保证环境始终含所有已合入代码）
- Redis + 定时队列（Bull）轮询构建状态，不阻塞 HTTP
- 构建失败：拉取日志通知开发，置 `failed`
- 构建成功 → 调部署接口 → 主动探活健康检查接口 → 200 OK 则置 `test_done`，输出测试环境地址

**④ 人工状态扭转（兜底后门，用户明确要求）**

- 详情页"强制扭转状态"按钮，仅创建者/管理员可见
- 目标状态限 `draft` / `submitted` / `failed`，必须填备注
- 不调任何外部接口，仅改本地 status + 写 `order_audit_logs`
- 场景：人工在旧平台回滚代码/解决环境问题后，让流程"复活"继续走

### 5.5 API 接口清单

| 方法 | 路径                              | 功能                            | 权限          |
| ---- | --------------------------------- | ------------------------------- | ------------- |
| POST | `/api/orders`                     | 创建草稿交付单                  | 开发          |
| PUT  | `/api/orders/:id/submit`          | 提交提测（锁 Commit + 改 TAPD） | 开发          |
| PUT  | `/api/orders/:id/start-test`      | 测试同意提测（触发预检+流水线） | 测试          |
| GET  | `/api/orders/:id/pipeline-status` | 轮询流水线进度（前端进度条）    | 开发/测试     |
| PUT  | `/api/orders/:id/force-status`    | 强制扭转状态（仅改本地）        | 管理员/创建者 |
| GET  | `/api/orders`                     | 列表（按角色过滤待办）          | 开发/测试     |

### 5.6 前端页面功能点

- **开发视图**：我的提测列表；`draft` 可编辑；`failed` 可"重新提测"（走 force-status 回到 submitted）
- **测试视图**："待我确认"列表（status=submitted）；同意后展示实时进度条（合并中 → 构建中 → 部署中 → 完成）
- **通知矩阵**：冲突 @开发；构建成功 @测试（附链接）；构建失败 @开发+测试负责人（钉钉 Webhook 卡片）
- **操作日志**：每一步谁在何时按了什么按钮，可审计复盘

### 5.7 Phase 1 明确不做清单

- ❌ 预发布 / 生产环境任何自动化
- ❌ 自动回滚/重置按钮（回退去旧平台人工操作，本系统只允许手动改状态）
- ❌ 多需求合并打包（一次只构建 test 分支）
- ❌ 需求独立环境（仅预留 `env_type` / `isolated_domain` 字段）
- ❌ 禁止开发手动操作（允许手动合并后走"跳过"路径）

### 5.8 编码约束（给 AI 编辑器）

1. **幂等性**：调 GitLab/运维平台接口必须捕获超时，防重复创建 MR/构建任务
2. **异步轮询**：构建/部署状态用 Redis 缓存任务 ID + Bull 队列轮询，不阻塞 HTTP
3. **不可变性**：`baseline_commit_id` 提交后不可修改，分支有新提交需重新创建提测单
4. **测试同意防重**：多次点击"同意"不得创建重复 MR

### 5.9 基建前提（确认状态）

- ✅ 运维平台已开放"只传分支名构建"的能力（不传 Commit 拉分支最新 HEAD）
- ✅ GitLab 服务账号 Token 允许 API 直接合并 test 分支
- ⚠️ TAPD "已提测"的具体 status key 与扭转权限：**开发时确认**
- 需申请 GitLab 服务账号 Token、TAPD API 凭证、运维平台 OAuth/SSO 对接凭证

### 5.10 用户体系与角色管理模块（已确认需求）

**登录方式**：复用现有运维平台账号登录（OAuth/SSO 对接），用户首次登录自动建档，无需独立注册。

**核心诉求**：不依赖外部系统识别角色，本系统内置**角色管理模块**，由各条线领导在平台内完成人员角色分配和需求归属指派。

**角色模型**：

| 角色         | 说明       | 关键权限                                |
| ------------ | ---------- | --------------------------------------- |
| dev_lead     | 开发领导   | 分配开发负责人；大版发布确认（Phase 3） |
| test_lead    | 测试领导   | 分配测试负责人；大版最终确认（Phase 3） |
| product_lead | 产品领导   | 需求归属确认/指派                       |
| developer    | 开发       | 创建/提交提测单、强制扭转自己单的状态   |
| tester       | 测试       | 同意提测、触发流水线                    |
| admin        | 系统管理员 | 全部权限 + 强制扭转任意状态             |

**角色与人员关系**：

- 一个用户可同时拥有多个角色（如既是 developer 又是 dev_lead）
- 领导（dev_lead / test_lead / product_lead）在"角色管理"页面对成员进行角色分配
- 需求归属：创建提测单时由 product_lead 确认/指派需求归属；dev_lead 指派 developer，test_lead 指派 tester（即 `delivery_orders.developer` / `tester` 字段由领导指派产生，而非创建人随意填写）

**新增数据表**：

```sql
-- 用户表（登录时从运维平台账号同步）
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ops_account VARCHAR(100) UNIQUE NOT NULL,  -- 运维平台账号
    name VARCHAR(100),
    email VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 用户角色表（多对多）
CREATE TABLE user_roles (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    role VARCHAR(30) NOT NULL,                 -- dev_lead/test_lead/product_lead/developer/tester/admin
    assigned_by VARCHAR(100),                  -- 分配人
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, role)
);
```

**新增 API**：

| 方法 | 路径                     | 功能                               | 权限               |
| ---- | ------------------------ | ---------------------------------- | ------------------ |
| GET  | `/api/auth/login`        | 运维平台 OAuth 登录跳转            | 公开               |
| GET  | `/api/auth/callback`     | OAuth 回调，签发会话               | 公开               |
| GET  | `/api/users`             | 用户列表（含角色）                 | 领导/admin         |
| PUT  | `/api/users/:id/roles`   | 分配/移除用户角色                  | 对应条线领导/admin |
| PUT  | `/api/orders/:id/assign` | 指派 developer / tester / 需求归属 | 对应条线领导       |

**新增前端页面**：

- 登录 暂用运维平台账号写入 后续再接入体系
- **角色管理页**：领导视图，用户列表 + 角色勾选分配，操作留痕
- 提测单创建/详情页增加"指派"区域：展示/变更 developer、tester、需求归属（仅领导可操作）

---

## 6. 未来拓展

1. 提测时自动生成一份 ai 测试报告 以及 影响范围
2. 验证通过后沉淀本轮知识，分为开发知识、测试知识各自确认是否存入记忆
