---
name: mywork-server 钉钉本地调试配置
overview: 将用户提供的钉钉密钥（加签 secret + webhook token）与 COOKIE_KEY 落地为 mywork-server 的 .env 配置并接入 dotenv 加载，补 .gitignore，启动服务验证配置生效，然后给出完整的本地端到端调试步骤（cookie 同步、前端保存绑定码、公网隧道、钉钉群内 /绑定 /构建 验证）。
todos:
  - id: install-dotenv
    content: mywork-server 安装 dotenv 并在 index.ts 顶部接入 import 'dotenv/config'，.gitignore 追加 .env
    status: completed
  - id: create-env-files
    content: 创建 .env（写入 COOKIE_KEY/DINGTALK_APP_SECRET/DINGTALK_ROBOT_TOKEN 三个真实值）与 .env.example 占位模板
    status: completed
    dependencies:
      - install-dotenv
  - id: verify-server-start
    content: 运行 npm run dev 验证启动：无 [config] 告警、监听 8080，GET /api/dingtalk/account/status 返回正常
    status: completed
    dependencies:
      - create-env-files
  - id: write-debug-guide
    content: 将本地端到端调试步骤（cookie 同步、设置页保存绑定码、隧道暴露、钉钉接收消息回调配置、/绑定 /构建 验证）写入 docs/dingtalk-local-debug.md
    status: completed
    dependencies:
      - verify-server-start
---

## 需求概述

用户提供钉钉机器人密钥（加签密钥 SEC8ab… 对应 DINGTALK_APP_SECRET、webhook access_token 9e68… 对应 DINGTALK_ROBOT_TOKEN），要求在本地把 mywork-server 的钉钉调试配置改好，随后用户自行启动调试整条链路（设置页保存绑定码 → 钉钉 /绑定 → /构建 → 制品推送）。

## 核心内容

- 将三个环境变量（含此前已生成的 COOKIE_KEY：f47a9c…e2f8a）落地到本地配置文件，服务启动即可读取
- 配置文件必须排除在 git 之外（密钥不得提交仓库，需更新 .gitignore）
- 服务启动后无配置告警（COOKIE_KEY 缺失会 exit；钉钉两项缺失仅 warn，本次必须消除该 warn）
- 提供本地端到端调试步骤指引（cookie 同步、设置页保存、公网隧道、钉钉群命令验证）

## 技术方案

### 现状（已核实）

- `mywork-server/src/config.ts` 只读 `process.env`，**无 .env 加载机制**；`package.json` 无 dotenv 依赖；`.gitignore` 现有 node_modules/dist/data/*.log 等，**缺 .env 条目**
- 服务端全部路由与钉钉模块（加签校验、/绑定、/构建、推送）已实现；前端 `DingTalkPage.tsx` 与 vite proxy 已就位，**仅差环境变量落地**

### 方案：dotenv 接入 + .env 落地

1. **安装 dotenv 并接入**：`index.ts` 顶部（所有 import 之前）加 `import 'dotenv/config'`，dev（tsx watch）与生产（node dist）两条路径统一生效，对 config.ts 零改动（仍读 process.env）。选 dotenv 而非 Node 原生 `--env-file` 的原因：后者对 Node 小版本有兼容差异且文件缺失会报错，dotenv 零心智负担、社区标准做法。
2. **创建 `.env`**（真实密钥）与 `.env.example`（占位模板，可提交），`.gitignore` 追加 `.env`。
3. **启动验证**：`npm run dev`，确认控制台无 `[config]` 告警、监听 8080。
4. **调试链路**（用户手动）：浏览器同步 devops cookie 到 localhost → 设置页填 email+绑定码保存 → 用隧道（cloudflared/ngrok）暴露 8080 → 钉钉机器人配置“接收消息”回调 URL → 群内 `/绑定`、`/构建` 验证 → 30s 轮询制品推送。

### 关键执行细节

- `.env` 内容（PORT 可不写，默认 8080）：
- `COOKIE_KEY=f47a9c2e6b1d8053a9e7c4f21b6d8305ce71a4b9d2f8063e5a1c7b49d06e2f8a`
- `DINGTALK_APP_SECRET=SEC8ab08ff61c0e72a1583922bae6f6c845c2f71f3ca86c198f2f3a19b96ce2d9c5`
- `DINGTALK_ROBOT_TOKEN=9e687023548ddc65ced6a50478c27299601c0866ad6b6e19478230dca9caeb3b`
- `import 'dotenv/config'` 必须是 index.ts 第一行 import，保证 config.ts 的 `loadConfig()`（模块级 cached）执行时 env 已注入
- 铁律：不提交代码；.env 永不进仓库；调试指引写入 docs 供后续对照