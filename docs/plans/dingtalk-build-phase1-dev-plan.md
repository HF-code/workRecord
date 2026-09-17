# 阶段一开发计划（任务清单）：钉钉绑定构建 + 制品回 push

> **状态：✅已实施完成**（A~G 全部落地于 `mywork-server` 与前端设置页；接收消息现走钉钉 **Stream 模式**，免公网回调）。
> 依据：`docs/plans/dingtalk-build-bridge-plan.md`。
> 目标产物：mywork-server 扩展 + mywork 设置页卡片；跑通"web 透传不动 + 钉钉 `/绑定`/`/构建` 回复制品"。
> 外部依赖（已给定）：
> - 用户信息接口：`GET https://devops.vzan.com/system/user` → `{ email }`（校验 cookie 身份）
> - 构建制品状态：`GET https://devops.vzan.com/deploy/build?page_no=1&page_size=10&app=&branch=&email=&group=` → `{ detail:[{ file_url, succeed }] }`，`succeed` 0失败/1进行中/2成功；**每 30s 轮询直到失败或成功**
> - 触发构建：`POST /deploy/build`（两步式，沿用现有逻辑）

## 任务清单（按依赖排序）

### A. mywork-server 基础设施
- [ ] **A1 config.ts**：读取环境变量 `DINGTALK_APP_SECRET`、`DINGTALK_ROBOT_TOKEN`、`COOKIE_KEY`、`PORT`、`DEVOPS_ORIGIN`；提供校验（缺 COOKIE_KEY 启动即报错）。
- [ ] **A2 accounts.ts**：email → `{ cookieEnc, bindCode, senderId }` 的存储。
  - 文件：`mywork-server/data/accounts.json`，AES-256-GCM 加密 cookie，权限 `600`，`.gitignore` 加 `data/`。
  - 接口：`saveAccount` / `getByEmail` / `getBySenderId` / `setSenderId` / `clearBind` / `deleteAccount` / `updateCookie`。
- [ ] **A3 devopsUser.ts**：`getEmailByCookie(cookie): Promise<string>`——`GET ${DEVOPS_ORIGIN}/system/user`，headers 注入 `cookie` + `Origin/Referer=devops 域` + 透传 `x-csrftoken`（从 cookie 串解析）；15s 超时；解析 `email`。失败抛错。

### B. 构建链路
- [ ] **B1 devopsClient.ts**：复用 `src/build.ts` 两步式为服务端函数，cookie 作入参。
  - `requestBuildAs(cookie, { app, env, update })`：取编号 → POST 提交 → 返回 `{ number, recordUrl }`。
  - `queryArtifact(cookie, { app, branch, email, group })`：`GET /deploy/build?page_no=1&page_size=10&app&branch&email&group` → 解析 `detail[0]` 的 `{ file_url, succeed }`。
  - 头处理同 A3（cookie / x-csrftoken / Origin / Referer）。
- [ ] **B2 buildJobs.ts**：任务表 `jobId ↔ { email, project, env, branch, group, number, status, fileUrl, detail }`；内存 Map + 持久化到 `data/buildJobs.json`（可选，重启恢复轮询）。
- [ ] **B3 轮询器 poller**：构建提交成功后**延迟 30s 才开始第一次查询**（`setTimeout(30_000)` 首次 + `setInterval(30_000)` 后续），调 `queryArtifact`（app/branch/email/group 四个参数全带）；**接口语义（接口.demo）：`succeed===1` 成功 / `succeed===0` 失败 / `===2` 进行中继续**；终态时回调钉钉推送，停止轮询；**20 分钟（40 次）超时兜底**，超时按失败处理并推送提示。单进程内存管理，重启后按 `buildJobs.json` 恢复未完成任务（恢复时同样先等 30s）。

### C. 钉钉接入
- [ ] **C1 dingtalk.ts（加签校验）**：`POST /api/dingtalk` 入口，校验 `timestamp + sign`（HMAC-SHA256 over `timestamp+"\n"+appSecret`，base64）与 header `sign` 比对，非法直接 401。
- [ ] **C2 命令解析**：从 `text.content` 去 `@机器人 ` 前缀，trim，分词解析：
  - `/绑定 <email> <绑定码>`
  - `/构建 <project> <env>`
  - 未识别命令 → 回复用法提示。
- [ ] **C3 绑定逻辑**：`/绑定` → `accounts.getByEmail(email)` → 比对 `bindCode` → `senderId` 已非空则拒绝 → 写 `senderId=senderId`、清空 `bindCode` → 回复"绑定成功"。
- [ ] **C4 构建逻辑**：`/构建` → `accounts.getBySenderId(senderId)` → 取 cookie → `requestBuildAs` → 写 `buildJobs` → 启动 poller → 立即回复"已提交构建，编号 X"。
- [ ] **C5 主动推送**：`pushToDingtalk(markdown)`——`POST https://oapi.dingtalk.com/robot/send?access_token=${DINGTALK_ROBOT_TOKEN}`；构建终态时推送 `file_url + succeed 结果`，并 @绑定者（`at.atUserIds:[senderId]` 或群公告）。

### D. mywork-server 路由挂载（index.ts 修改）
- [ ] **D1** 新增 `POST /api/dingtalk/account`：读 `{ email, bindCode }`，`ctx.headers.cookie` → `getEmailByCookie` → 比对 email → `accounts.saveAccount({email, cookie, bindCode, senderId:null})` → 返回成功。保存与更新共用（更新覆盖 cookie，bindCode/senderId 保留）。
- [ ] **D2** 新增 `DELETE /api/dingtalk/account`：`{ email }` → `getEmailByCookie` 验证身份 → `clearBind`（解绑）或 `deleteAccount`。
- [ ] **D3** 新增 `GET /api/dingtalk/account/status?email=` → `{ bound, senderId? }`（设置页展示用）。
- [ ] **D4** 新增 `POST /api/dingtalk` 挂 C1~C4。
- [ ] **D5** 保留现有 `/devops-api` 透传路由不动；中间件顺序：日志 → bodyparser → 新 API 路由 → 原 `/devops-api` 路由 → 静态托管。
- [ ] **D6** 启动时：恢复 `buildJobs.json` 中 status 为 running 的任务，重启其 poller。

### E. mywork 前端（设置页卡片）
- [ ] **E1** `SettingsPage.tsx` 新增"外接到钉钉"卡片：
  - 输入框：email、绑定码；按钮：保存绑定码（→ D1）、解绑（→ D2）。
  - 展示绑定状态（→ D3）：未绑定 / 已绑定 senderId。
  - 无 cookie 粘贴 UI；保存/解绑均 `credentials:'include'` 携带浏览器 cookie。
- [ ] **E2** `vite.config.ts`：本地联调 `server.proxy` 新增 `/api` → `http://localhost:8080`（mywork-server），生产同源托管无需此项。

### F. 安全与收尾
- [ ] **F1** `mywork-server/.gitignore` 增加 `data/`、`dist/`、`*.log`。
- [ ] **F2** `COOKIE_KEY` 从环境变量读取；生成提示文案（`openssl rand -hex 32`）。
- [ ] **F3** 钉钉回调加签强校验开启；绑定码一次性清空生效。

### G. web 制品回显（两处构建清单下方新增制品列表）
> 目标：点批量构建后，构建完成时在制品列表显示 `file_url`，带复制按钮。
> 两处挂载：`BatchPanel.tsx`（勾选卡片批量构建）、`QuickBuildDrawer.tsx`（快速构建）。
> 原则：**全局制品列表**——数据源复用 `useBuildTasks` 全局 taskMap（制品随任务走，任务清理即制品清理），
> 不改 `startBuildTask` 签名，两处渲染同一份列表（跨刷新保留，与「构建任务」面板同源）。

- [ ] **G1 `src/build.ts` 扩展**：
  - 导出 `resolveBuildBranch`（制品查询要用与构建一致的 branch 解析）。
  - 新增 `fetchCurrentEmail(): Promise<string>`：`GET /devops-api/system/user`（透传，浏览器 cookie 自动携带），解析返回的 `email`；模块级缓存（会话内只查一次）。
  - 新增 `fetchArtifact(p: { app, branch, email, group }): Promise<{ fileUrl: string | null; succeed: 0|1|2 } | null>`：`GET /devops-api/deploy/build?page_no=1&page_size=10&app&branch&email&group`，取 `detail[0]`。
- [ ] **G2 `src/hooks/useBuildTasks.ts` 制品轮询**：
  - `BuildTask` 增加 `artifact?: { status: 'querying'|'success'|'fail'|'timeout'; fileUrl?: string }`。
  - 任务 `phase` 变为 `done` 时启动制品轮询：**延迟 30s 首查，之后每 30s 一次，最多 20 分钟（40 次）**；
    查询参数 `app/branch/email/group` 全带（branch 用 `resolveBuildBranch` 解析结果，email 用 G1 缓存值，group 用 `BUILD_GROUP`）；
    `succeed===1` → success + fileUrl；`===0` → fail；`===2` 进行中继续；超时 → timeout；结果 `patchTask` 回 taskMap。
  - `cancelBuildTask` / `removeBuildTask` / `clearBuildTasks` 时同步清理该任务的制品轮询 timer。
  - email 获取失败（未登录）→ 制品状态直接置 fail（提示到设置页/重新登录），不阻塞构建结果。
- [ ] **G3 `mywork-server` 透传扩展（生产路径）**：
  - `/devops-api/deploy/build` GET 参数白名单增加 `page_no`、`page_size`、`branch`、`email`、`group`。
  - 新增 `GET /devops-api/system/user` 透传路由（cookie 透传逻辑复用 `forwardToDevops`）。
  - 本地 dev 走 vite proxy 天然全参数透传，无需改 `vite.config.ts`。
- [ ] **G4 新增 `src/components/ArtifactList.tsx`**：
  - 内部 `useBuildTasks()` 过滤出 `artifact` 存在的任务，按 `updatedAt` 倒序渲染。
  - 每行：`项目 → 分支` + 状态 Tag（查询中/成功/失败/超时）+ 成功时展示 `file_url` + **复制按钮**（`navigator.clipboard.writeText(fileUrl)`，成功 message 提示）。
  - 头部"复制全部"按钮：仅汇总成功项的 `file_url` 逐行复制（无成功项时禁用）。
  - 样式沿用黑白色调小卡（参考 `BatchPanel` 的 ListCard）；失败/超时行展示原因提示。
- [ ] **G5 两处挂载**：
  - `BatchPanel.tsx`：构建/MR 清单行下方新增 `<ArtifactList />`。
  - `QuickBuildDrawer.tsx`：构建清单汇总卡片下方新增 `<ArtifactList />`。
- [ ] **G6 testid**：按全局规范可交互控件（复制按钮等）加 `data-testid`（`{模块}-{语义}-{类型}`）；**项目当前无 testid 显式规则，实施前先与用户确认是否启用**。

## 验证清单（对照验收）
- [ ] web 点构建 → 页面回显编号+链接（现状回归，未受影响）。
- [ ] 设置页填 email+绑定码 保存 → 查用户接口对上 → 提示"绑定码已生成"。
- [ ] cookie 过期重同步浏览器 cookie → 再点保存 → 更新成功，绑定不变。
- [ ] 钉钉 `/绑定 <email> <绑定码>` → 成功；再发 → 拒绝（绑定码已作废）。
- [ ] 钉钉 `@机器人 构建 live-h5-2 test` → 立即收到"已提交 编号X"；30s 轮询 → 成功/失败收到制品 `file_url`。
- [ ] 解绑 → 钉钉 `@构建` 提示未绑定。
- [ ] web 批量构建（BatchPanel）触发后 → 制品列表 30s 首查 → 成功项显示 `file_url` + 复制按钮可用。
- [ ] web 快速构建（QuickBuildDrawer）触发后 → 制品列表同样回显制品，复制全部仅汇总成功项。
- [ ] 制品轮询 20 分钟超时 → 对应行显示超时，不误报成功。

## 关键决策（已确认，2026-09-07）
1. **`group` 取值**：用构建接口的 `group`（即 `JenkinsFrontweb`，`src/build.ts` 的 `BUILD_GROUP`）；接口.demo 里"同 branch"的注释作废。
2. **超时兜底**：`succeed===1` 最多轮询 **20 分钟（40 次 × 30s）**，超时按失败处理并推送提示。
3. **查询时机与参数**：触发构建后**不立即查询，30s 后才开始第一次查询**；默认取 `detail[0]`；查询时 `app`、`branch`、`email`、`group` 四个参数**全部带上**。
