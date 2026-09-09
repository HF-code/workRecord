# 钉钉构建通知桥接方案（work-tracker × 钉钉）— 完整架构

> 规划会话产出，执行会话按本文件分步实施。
> 子方案：`docs/plans/dingtalk-build-phase1-plan.md`（一阶段无 DB 执行细节）。

## 一、bridge-server 是什么 / 放哪
本项目已有一个**独立 Node 服务 `mywork-server`**（Koa2，位于 `d:/工作/创意/mywork-server`），
按既有决策 `extract-server-to-standalone-project` 从 `mywork` 抽出，承担前端静态托管 + 运维平台 `/devops-api` 转发。

**钉钉桥接不新建项目、不在 `mywork` 内加 `server/`，而是直接扩展 `mywork-server`**：
- 复用现有 `src/index.ts` 的 `/devops-api` 转发与 Koa 脚手架；
- 新增 `accounts`（email 绑定 + cookie 存储）、`devopsUser`（用户接口校验）、`devopsClient`（cookie 作入参的两步式构建）、`dingtalk`（加签/命令/推送）、`buildJobs`（任务状态）；
- 新增 `/api/dingtalk/account*`、`/api/dingtalk`、`/api/build/status` 路由挂到同一 Koa 实例。

## 二、最终取舍（本轮定稿）
**web 端不动，钉钉端走独立旁路，两条路互不干扰。**

- **web 端**：构建维持现状——浏览器 cookie 经 `/devops-api` 透传，不做登录、不做统一，**零回归风险**。设置页只新增"外接到钉钉"账号绑定卡片，与 web 构建解耦。
- **钉钉端**：独立旁路。通过"email + 绑定码"校验拿到 cookie 并锁死 `senderId`，`@构建` 时按 `senderId` 反查账号 cookie 调接口。
- **取舍理由**：为了一点"代码统一"去动已能跑的 web 链路，收益远小于回归风险；钉钉要的（cookie 服务端化）其实很小很独立，旁路最小改动即可达成，两套并存、各自简单。

## 三、身份与校验（复用运维平台用户接口）
- **身份**：复用 devops 账号的 `email` 字段（运维平台用户接口返回，唯一），不自建账号体系、不自设密码。
- **校验**：服务端拿 cookie 请求用户接口，返回 `email` 与传入 email 对上，即证明 cookie 有效且属本人。
- **绑定码**：自设、一次性，仅用于钉钉 `/绑定`，不参与构建鉴权。
- **登录态**：cookie 本身就是登录态；每次涉及 cookie 的操作（保存/更新/解绑）都查一次用户接口顺带验证有效性，无需额外登录状态表。

## 四、关键约束
1. Webview / 远程服务**不共享浏览器 cookie** → 钉钉侧 cookie 必须服务端化（accounts 存储）。
2. 钉钉自定义机器人：原生支持"被 @ 收消息（HTTPS 回调 + 加签）"和"主动发消息（robot webhook）"，确定性、无限额。✅ 选它。
3. 微信通道：**已放弃**（个人微信无官方 bot API、24h 会话失效、主动消息 10 条配额、易风控）。

## 五、数据在哪：localStorage 的局限（是否要上数据库）
需求记录当前在浏览器 `localStorage`，是**设备本地**的，非跨设备/跨通道共享源。
- **只做"各自给 project/env 触发构建"**：localStorage 够用，**不需要数据库**。
- **要做"记录是唯一数据源，web 与钉钉都读它、状态自动回写双方"**：记录必须放到**服务端数据库**，localStorage 退为某设备编辑副本。

完整方案分两步：先无 DB 跑通双通道（阶段一），再上 DB 做真正共享源（阶段二）。

## 六、目标架构（完整 / 含阶段二 DB）

```
┌─────────────┐  /devops-api ┌──────────────────────────┐  cookie  ┌──────────────────┐
│ work-tracker│──透传不动──▶│     mywork-server (Koa2)   │─────────▶│  devops.vzan.com │
│  (React SPA)│             │  - 现有 /devops-api 转发     │ 两步式   │  /deploy/build   │
│ 设置页:绑定 │ /api/dingtalk│  - accounts(email+cookie) │          │  /用户接口(校验) │
│ email+绑定码│────────────▶│  - devopsUser(校验身份)     │          └──────────────────┘
└─────────────┘             │  - devopsClient(构建)       │  加签    ┌────────────────┐
                            │  - /api/dingtalk 回调+推送   │─────────▶│  钉钉机器人     │
                            └───────────┬──────────────┘◀────────┴───────┬────────┘
                                        │  DingTalk 回调 / 主动推送        │ 推送结果
                                ┌───────▼──────────────────┐              └──────┬───────┘
                                │ 钉钉群 @机器人            │◀────────────────────┘ 构建完成/失败
                                │ /绑定 /构建 <project env> │   回复制品（编号+链接）
                                └──────────────────────────┘
```

## 七、分阶段

### 阶段一（无 DB，先走通）— 见子方案
- web 构建透传不动；设置页新增"外接到钉钉"（email + 绑定码 校验存 cookie + 更新 + 解绑）。
- 钉钉 `/绑定 <email> <绑定码>` → 锁死 `senderId`；`@构建 <project> <env>` → 用账号 cookie 触发 → 轮询 → 回复制品。
- project/env 由触发方直接给出，不依赖需求索引同步。

### 阶段二（上 DB，做真正共享源）
- 需求记录迁到后端 SQLite（仍在 mywork-server 内），web 改为读写 DB（localStorage 退为离线缓存）。
- 钉钉可"@机器人 构建 需求A 到 test"按需求名查表触发。
- 构建状态写 DB，web 与钉钉都从 DB 读，自动双向回显，无重录。
- 接入你后续提供的"查询接口"作为状态轮询源（替换阶段一两步式轮询）。

## 八、涉及文件清单

### 新增（阶段一，均在 `mywork-server/`）
- `src/accounts.ts`：账号存储（email → {cookieEnc, bindCode, senderId}），AES 加密落盘，权限 `600`，加 `.gitignore`。
- `src/devopsUser.ts`：用 cookie 请求用户接口解析 email（校验身份）；预留你的查询接口切换点。
- `src/devopsClient.ts`：两步式构建逻辑，cookie 作入参。
- `src/dingtalk.ts`：加签校验、命令解析（`/绑定` `/构建`）、robot webhook 推送。
- `src/buildJobs.ts`：`jobId ↔ { email, project, env, status, number, recordUrl, detail }`。
- `src/config.ts`：钉钉 `appSecret` / `webhook token`、`COOKIE_KEY`、用户接口地址等环境变量。

### 修改
- `mywork-server/src/index.ts`：挂载 `/api/dingtalk/account*`、`/api/dingtalk`、`/api/build/status` 路由；`/devops-api` 透传保留不动。
- `mywork-server/package.json`：按需加依赖（`crypto` 原生即可）。
- `mywork/src/pages/SettingsPage.tsx`：新增"外接到钉钉"卡片（email + 绑定码 保存/更新 + 解绑 + 绑定状态），**无 cookie 粘贴 UI**，web 构建链路不动。
- `mywork/vite.config.ts`：本地联调新增 `/api` proxy 到 mywork-server；生产同源托管无需 proxy。

### 新增（阶段二）
- `mywork-server/src/db.ts`：SQLite 需求表；`mywork/src/storage.ts` 读写改走 DB。

## 九、关键接口（草案）

### REST（mywork-server 对外）
```ts
// 账号绑定管理（web 设置页；保存与更新同一接口）
POST   /api/dingtalk/account    { email, bindCode }  (credentials:include)
       // 带 cookie 查用户接口对上 email → 存 {email, cookie(AES), bindCode}
DELETE /api/dingtalk/account    { email }            (credentials:include)
       // 带 cookie 查用户接口验证 → 解绑（清 senderId）或删账号
GET    /api/dingtalk/account/status  { email }  → { bound: boolean, senderId?: string }

// 状态轮询（预留替换为你的查询接口）
GET    /api/build/status?jobId=xxx
→ { jobId; status: 'pending'|'running'|'success'|'fail'; number?; recordUrl?; detail? }
```

### 钉钉回调（mywork-server 收 `/api/dingtalk`）
```json
{
  "conversationId": "cid",
  "senderId": "user456",
  "senderNick": "张三",
  "msgtype": "text",
  "text": { "content": "@机器人 构建 live-h5-2 test" }
}
```
命令格式：`/绑定 <email> <绑定码>`、`/构建 <project> <env>`。

### 钉钉主动推送（mywork-server 发）
```
POST https://oapi.dingtalk.com/robot/send?access_token=xxx
{ "msgtype": "markdown", "markdown": { "title": "构建结果",
  "text": "### 构建成功 ✅\n**项目**：live-h5-2\n**环境**：test\n**编号**：4423\n[记录页](链接)" } }
```

## 十、鉴权与安全
- **加密落盘（做什么用）**：cookie 是 devops 登录凭证。一旦明文存服务器磁盘/进 git/泄露，别人即可拿你账号触发构建。AES 加密落盘 + `.gitignore` + 文件权限 `600`，泄露也用不了。密钥走环境变量 `COOKIE_KEY`，不写死代码。
- **身份校验**：用 cookie 查用户接口比对 email，复用 devops 权威身份，不自建密码。
- **绑定锁死**：账号 `senderId` 一旦写入即拒绝再次绑定；绑定码一次性作废，防抢绑。
- **cookie 即凭证**：不粘进设置页、不进钉钉群聊；仅"带浏览器 cookie 校验"落服务端。
- 钉钉回调必须加签校验，防伪造消息触发构建。

## 十一、机器人私聊问题
钉钉**群自定义机器人默认只能在群里被 @ 时收到消息，没有原生单聊(DM)**。本方案 cookie 完全不经钉钉（只在设置页带浏览器 cookie 校验落服务端），钉钉侧仅传输"email + 自设一次性绑定码"（非 devops 凭证），暴露面可控；如需更净，可把 `/绑定` 升级为互动卡片私密输入。

## 十二、风险与注意
- **公网端点**：钉钉 outgoing webhook 需 HTTPS 可达；本地联调 `ngrok`，生产部署 mywork-server 到服务器。
- **cookie 过期**：钉钉构建返回"未登录" → 提示到 web 设置页更新（重新保存绑定码），绑定不受影响。
- **devops 接口稳定性**：两步式"上一任务尚未完成"需 mywork-server 侧自动重试（复用现有 `auto-build-on-fail` 思路）。
- **阶段二 DB 一致性**：以 DB 为权威，web localStorage 仅缓存。

## 十三、本期范围外
- VSCode 拓展（与钉钉流程解耦，非必需，后续可独立做）。
- 多租户权限体系（当前为个人/小团队工具）。
