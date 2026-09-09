# 钉钉构建桥 · 本地调试手册

> 适用：阶段一（web 透传 + 钉钉旁路）本地联调。
> 配置已就位：`mywork-server/.env`（COOKIE_KEY / DINGTALK_APP_SECRET / DINGTALK_ROBOT_TOKEN 三项，已 gitignore）。

## 0. 前置：重启 8080 服务（重要）

`.env` 是本次新加的，**8080 上已在跑的旧实例启动时还没加载它**，必须重启才能生效：

```powershell
# 找到旧进程并结束（或直接关掉跑它的那个终端窗口）
netstat -ano | Select-String ":8080.*LISTENING"   # 记下 PID
taskkill /PID <PID> /F

# 重新启动
cd d:\工作\创意\mywork-server
npm run dev
```

启动成功的标志：控制台只有 `Server listening on http://0.0.0.0:8080`，**没有** `[config] ...` 任何告警。
（另有调试残留：8091 端口有一个验证实例 `server-verify.log`，确认无用后同样 taskkill 掉。）

## 1. 浏览器同步 devops cookie 到 localhost

设置页保存绑定码时，服务端要从请求里读到 devops cookie 并去 `GET /system/user` 校验 email：

1. 浏览器登录 `https://devops.vzan.com`；
2. 用你惯用的 cookie 工具把 devops 域的 cookie（含 `csrftoken` + 会话 cookie）**写入 `http://localhost:5173` 域**（与现有 web 构建的手动同步方式相同）；
3. 验证：访问 `http://localhost:5173/devops-api/system/user`，能返回 `{"email": "..."}` 即同步成功。

## 2. 设置页保存绑定码

1. `npm run dev` 起 mywork 前端（5173），进入设置页「外接钉钉」；
2. 填 **email**（必须与 cookie 查回来的 email 完全一致）+ **自定义绑定码**（一次性）；
3. 点保存 → 成功提示"绑定码已生成，请在钉钉群发送：/绑定 <email> <绑定码>"。
   - 失败"请求未携带 devops cookie" → 回到第 1 步；
   - 失败"cookie 身份与填写的 email 不一致" → 改用提示里的真实 email。

## 3. 隧道暴露 8080（钉钉回调需要公网 HTTPS）

钉钉"接收消息"回调要求公网 HTTPS 地址，本地用隧道：

```powershell
# cloudflared（推荐，免注册）
cloudflared tunnel --url http://localhost:8080
# 或 ngrok
ngrok http 8080
```

复制隧道给的 `https://xxx.trycloudflare.com`（或 `https://xxx.ngrok-free.app`）备用。
注意：免费隧道每次重启地址会变，变了要回钉钉改回调 URL。

## 4. 钉钉机器人配置回调

机器人设置页（安全设置同页或相邻）：

1. 找到 **「接收消息」/「消息推送」**，启用；
2. 消息接收模式选 **HTTP 回调**；
3. POST 地址填：`https://<隧道域名>/api/dingtalk`；
4. 保存（钉钉会先探测一次地址可达性，隧道必须在线）。

安全设置确认：**加签已开**（密钥 = .env 里的 `DINGTALK_APP_SECRET`，SEC 开头），自定义关键词（运维/绑定/构建）保留。

## 5. 群内验证

```text
@机器人 /绑定 <你的email> <绑定码>
→ 绑定成功 ✅ 以后可直接发送：/构建 <项目名> <环境>

@机器人 /构建 live-h5-2 test
→ 已提交构建，编号 xxxx（记录页链接）
→ 30 秒后开始每 30s 轮询制品，终态自动推送 成功✅/失败❌/超时⏱ + 制品下载链接（@你）
```

再发一次 `/绑定` 应被拒（绑定码已作废/已绑定）。

## 6. 常见问题速查

| 现象 | 原因 / 处理 |
|---|---|
| 回调 401「钉钉签名校验失败」 | 8080 旧实例没重启加载 .env；或钉钉端加签密钥与 .env 不一致；或服务器时间偏差 > 1h |
| 保存绑定码 401「未携带 cookie」 | 第 1 步 cookie 未同步到 localhost 域 |
| 保存 403「email 不一致」 | 用返回提示里的真实 email 重填 |
| `/构建` 回复「未绑定账号」 | 先 `/绑定`；或该 senderId 曾绑定别的 email（设置页解绑后重来） |
| `/构建` 回复「cookie 可能已过期」 | 重新同步浏览器 cookie → 设置页再点一次保存（绑定不受影响） |
| 机器人不回复 | 钉钉关键词过滤：消息须含 运维/绑定/构建 之一；隧道掉线；`server-debug.log` 查日志 |
| 制品一直"进行中"直到超时 | 20 分钟兜底；确认查询参数（app/branch/email/group）与构建一致，`detail[0]` 是否为本次 |

## 7. 本次改动清单（供回溯）

- `mywork-server/package.json`：新增依赖 dotenv
- `mywork-server/src/index.ts`：顶部接入 `import 'dotenv/config'`（必须先于所有模块加载）
- `mywork-server/.env`：三个真实密钥（gitignore 已排除）
- `mywork-server/.env.example`：占位模板（可提交）
- `mywork-server/.gitignore`：追加 `.env`
