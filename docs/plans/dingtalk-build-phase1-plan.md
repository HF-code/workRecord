# 阶段一执行方案：web 透传不动 + 钉钉账号绑定构建（无数据库）

> 子方案，配合主方案 `docs/plans/dingtalk-build-bridge-plan.md`。
> 范围：web 构建维持透传不动（新增制品列表回显）；钉钉端通过"email + 绑定码"校验拿 cookie，实现 `@构建` 回复制品。
> 用户后续会提供"查询接口"，轮询先用运维平台两步式，预留切换点。

## 一、最终方案（本轮定稿）
- **web 端**：构建链路**不动**（浏览器 cookie 经 `/devops-api` 透传）。设置页新增"外接到钉钉"卡片，只做账号绑定管理，**不参与 web 构建**。
  **新增制品回显**：两处构建清单（`BatchPanel` 批量构建 / `QuickBuildDrawer` 快速构建）下方加制品列表，构建完成后展示 `file_url` + 复制按钮；透传模式轮询制品接口（30s 首查、每 30s、20 分钟超时，取 `detail[0]`，app/branch/email/group 全带；branch 用 `resolveBuildBranch` 解析结果，email 经 `/devops-api/system/user` 获取并缓存）。
- **钉钉端**：独立旁路。`@机器人 /绑定 <email> <绑定码>` 校验后锁死 `senderId`；`@机器人 构建 <project> <env>` 用该 `senderId` 反查账号里的 cookie 调接口。
- **身份与校验**：复用运维平台"用户接口"——服务端拿 cookie 去请求用户接口，返回的 `email` 字段对上你填的 email，即证明 cookie 有效且属本人。
- **绑定码**：自设、一次性，只用于钉钉绑定，不用于构建鉴权。

## 二、数据模型（mywork-server，`accounts.json` 加密落盘）
```json
{
  "alice@corp.com": {
    "cookie": "AES(真实 devops cookie)",
    "bindCode": "X7K2P9（一次性，绑定后作废）",
    "senderId": "user456 或 null（未绑定）"
  }
}
```
- key = email（唯一身份）。
- `cookie`：设置页校验用户接口成功后存入，AES 加密落盘，供钉钉构建用。
- `bindCode`：一次性绑定码，绑定成功后清空作废。
- `senderId`：钉钉绑定后写入，锁死；解绑时清回 null。

## 三、mywork-server 新增模块（均在 `mywork-server/src/`）
- `accounts.ts`：账号存储（email → {cookieEnc, bindCode, senderId}），AES 加密落盘，权限 `600`，加 `.gitignore`。提供 `saveAccount` / `getByEmail` / `getBySenderId` / `setSenderId` / `clearBind` / `deleteAccount`。
- `devopsUser.ts`：**校验身份**——用 cookie 请求运维平台用户接口，返回解析出的 `email`（供设置页/绑定/解绑/更新时比对）。预留用户后续提供的"查询接口"切换点。
- `devopsClient.ts`：两步式构建逻辑（取编号 + POST 提交 + 轮询），**cookie 作入参**（从账号取）。
- `dingtalk.ts`：加签校验（timestamp + sign）、命令解析（`/绑定` `/构建`）、robot webhook 推送。
- `buildJobs.ts`：`jobId ↔ { email, project, env, status, number, recordUrl, detail }`。
- `config.ts`：钉钉 `appSecret` / `webhook token`、`COOKIE_KEY`（AES 密钥）、运维平台用户接口地址等环境变量。

## 四、mywork-server 路由（`src/index.ts` 挂载）
- 现有 `/devops-api` 浏览器 cookie 透传**保留不动**。
- `POST /api/dingtalk/account`（设置页保存/更新）：`{ email, bindCode }`，`credentials:'include'` → 读 `ctx.headers.cookie` → 用 cookie 调用户接口取 email → 与传入 email 比对 → 匹配则存 `{ email, cookie(AES), bindCode, senderId:null }` → 返回"绑定码生成成功"。**更新走同一接口**（重新查一次用户接口，覆盖 cookie，bindCode 与 senderId 不动）。
- `DELETE /api/dingtalk/account`（解绑）：`{ email }`，`credentials:'include'` → 用 cookie 调用户接口验证身份 → 匹配则清 `senderId`（解绑），或删除整条账号。
- `POST /api/dingtalk`（钉钉回调）：加签校验后解析：
  - `/绑定 <email> <绑定码>`：查该 email 账号 → 比对 `bindCode` → 若 `senderId` 已非空 → 拒绝；否则写 `senderId`=当前发送者、清空 `bindCode` → 回复绑定成功。
  - `/构建 <project> <env>`：按 `senderId` 反查账号 → 取 cookie → `devopsClient.requestBuildAs(cookie, {project, env})` → 写 `buildJobs` → 轮询 → robot webhook 推送制品。
- `GET /api/build/status?jobId`：读 `buildJobs`（预留替换为你的查询接口）。

## 五、web 改造（`mywork/`）
- `src/pages/SettingsPage.tsx`：新增"外接到钉钉"卡片：
  - **保存/更新绑定码**：email + 绑定码 两个输入框 → 点保存 → `POST /api/dingtalk/account`（带 cookie 校验）。成功提示"绑定码已生成"。
  - **解绑**：点解绑 → `DELETE /api/dingtalk/account`（带 cookie 校验身份）。
  - 展示绑定状态（已绑定 senderId 或未绑定）。
  - **无任何 cookie 粘贴 UI**；web 构建链路不改。
- `vite.config.ts`：本地联调新增 `/api` proxy 到 mywork-server；生产同源托管无需 proxy。

## 六、钉钉接入
1. 群机器人开启"接收消息"，配置 HTTPS 回调（本地 `ngrok`/`cloudflared` 暴露 mywork-server `/api/dingtalk`）。
2. `dingtalk.ts` 加签校验，拒绝非法来源。
3. `@机器人 /绑定 alice@corp.com X7K2P9` → 校验 → 锁死 `senderId`，绑定码作废。
4. `@机器人 构建 live-h5-2 test` → 用账号 cookie 触发 → 轮询 → 推送：
   ```
   ### 构建成功 ✅
   **项目**：live-h5-2
   **环境**：test
   **编号**：4423
   [记录页](链接)
   ```
5. cookie 失效 → 构建返回"未登录" → 钉钉提示"请到 web 设置页更新（重新保存绑定码）"。

## 七、关键流程
```
设置页保存绑定码：填 email+绑定码 → 带 cookie → 服务端查用户接口对上 email
               → 存 {email, cookie(AES), bindCode} → 绑定码生成成功
更新 cookie：    重新手动同步浏览器 cookie → 再点保存 → 重新查用户接口 → 覆盖 cookie
               （bindCode、senderId 不变）
解绑：          点解绑 → 带 cookie → 服务端查用户接口验证 → 清 senderId（或删账号）
钉钉绑定：       /绑定 (email) (绑定码) → 比对 bindCode → 写 senderId（锁死），bindCode 作废
钉钉构建：       /构建 (project) (env) → 按 senderId 反查 → 取 cookie → 构建 → 回复制品
web 构建：      透传不动，与上述互不影响
```

## 八、验证清单
- [ ] web 点构建 → 页面回显编号 + 记录链接（现状回归，未受影响）。
- [ ] 设置页填 email+绑定码 保存 → 查用户接口对上 → 提示绑定码生成成功。
- [ ] cookie 过期后重新同步浏览器 cookie → 再点保存 → 更新成功，绑定不变。
- [ ] 钉钉 `/绑定 alice@corp.com X7K2P9` → 绑定成功；再发一次 → 拒绝（绑定码已作废）。
- [ ] 钉钉 `@机器人 构建 live-h5-2 test` → 群内收到成功/失败 + 制品链接。
- [ ] 解绑 → 钉钉 `@构建` 提示未绑定。

## 九、本阶段不做（留给后续）
- 数据库 / 需求索引同步（见主方案阶段二）。
- 钉钉按"需求名"触发（需需求共享源）。
- 接入你提供的"查询接口"替换轮询源（预留 `devopsUser` / `buildJobs` 切换点）。
- VSCode 拓展。
