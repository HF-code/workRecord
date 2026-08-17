# 构建按钮跨域使用方案（本地 + 远程）

> 日期：2026-08-14（2026-08-17 更新远程方案）
> 背景：工作记录页新增"构建"按钮（`src/build.ts` + `src/components/BuildModal.tsx`），需要请求 `https://devops.vzan.com` 的构建接口，依赖登录 cookie（`csrftoken` + 会话 cookie）。
> 约束：
> 1. 本地 localhost 运行：`document.cookie` 读不到 devops 域 cookie，跨域 `fetch` 被 CORS 拦截
> 2. 远程部署：**不会部署到 devops.vzan.com**，需要自带服务端包一层转发
> 3. 登录态：用户自行通过其他工具把运维平台 cookie 写入应用所在域名，应用只从 `document.cookie` 读取；`csrftoken` 无值时只提示"未登录"

---

## 1. 总体方案

| 场景 | 通路 | cookie 来源 |
| --- | --- | --- |
| 本地开发 | Vite `server.proxy`：`/devops-api/*` → `https://devops.vzan.com`（changeOrigin + cookieDomainRewrite） | 浏览器 cookie 自动携带（首次需通过代理登录一次） |
| 远程部署 | 自带 Node 服务端（`server/`，Fastify）：托管 `dist/` 静态文件 + 反代 `/devops-api/*` | 用户通过其他工具写入本站域名的 cookie，浏览器同源自动携带，服务端透传 |

**统一约定**：前端所有运维平台请求固定走相对路径 `/devops-api/*`，本地由 Vite 代理终结、远程由 Node 服务终结，前端代码零环境分支。

---

## 2. 本地开发：Vite 代理

`vite.config.ts`：

```ts
server: {
  proxy: {
    '/devops-api': {
      target: 'https://devops.vzan.com',
      changeOrigin: true,
      secure: true,
      rewrite: (p) => p.replace(/^\/devops-api/, ''),
      // 响应 Set-Cookie 的 Domain 改写为 localhost，否则浏览器拒收
      cookieDomainRewrite: { 'devops.vzan.com': 'localhost' },
    },
  },
},
```

注意点：
- 若浏览器因 `Secure` 属性拒收 cookie（http://localhost 下 Chrome 允许，Firefox 不允许），后续在 proxy `configure` 钩子 `onProxyRes` 里改写 `set-cookie`（去 `Secure`、`SameSite=None` 改 `Lax`）。
- **首次使用需通过代理登录一次**：访问 `http://localhost:5173/devops-api/` 完成运维平台登录，会话 cookie 写到 localhost 域后即可正常构建。

---

## 3. 远程部署：Node 服务端（server/）

### 3.1 选型

**Fastify 5 + TypeScript + @fastify/static**：
- 轻量高性能，ESM 友好（与主项目 `type: module` 一致）
- 静态托管、路由均为官方插件；转发用 Node 18+ 全局 `fetch`，无需 http-proxy 类依赖
- 对比 Express 需额外引 `http-proxy-middleware`；NestJS 对 2 个转发端点过重

### 3.2 职责

1. `@fastify/static` 托管前端构建产物 `dist/`（目录不存在时容错，仅提供 API）
2. 反代两个端点：
   - `POST /devops-api/deploy/build` → `POST https://devops.vzan.com/deploy/build`
   - `GET /devops-api/deploy/branch?app=xxx` → `GET https://devops.vzan.com/deploy/branch?app=xxx`
3. 头处理：
   - 入站 `Cookie` 头直接透传为出站 `Cookie`（用户通过其他工具把登录 cookie 写入本站域名，浏览器同源请求自动携带）
   - `x-csrftoken`、`content-type` 透传
   - `Host`/`Origin`/`Referer` 强制改写为 devops 域（Django CSRF 校验需要，参考扩展 content-script 代理的教训）
4. 15s `AbortController` 超时；异常返回 502 + 错误信息
5. 监听 `PORT`（默认 8080）

### 3.3 cookie 写入流程（远程登录态）

1. 用户通过其他工具（如 cookie 管理扩展 / DevTools）把运维平台的登录 cookie（含 `csrftoken` 和会话 cookie）写入应用所在域名
2. 前端发起 `/devops-api/*` 同源请求时浏览器自动携带 cookie，无需任何自定义头
3. 服务端把入站 `Cookie` 头原样透传给 devops.vzan.com；服务端不落盘、不打日志
4. 前端仅从 `document.cookie` 解析 `csrftoken`；无值 → 仅提示"未登录运维平台，请先登录后再构建"（应用内不提供 cookie 录入 UI）

### 3.4 部署步骤

```bash
npm run build            # 产出 dist/
cd server && npm install && npm run build
npm start                # 或 node dist/index.js，默认 :8080
```

---

## 4. 涉及文件清单

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `vite.config.ts` | 修改 | 增加 `server.proxy` |
| `src/build.ts` | 修改 | API 改相对路径 `/devops-api`；`getCsrfToken()` 仅从 `document.cookie` 解析 |
| `src/components/BuildModal.tsx` | 修改 | 构建弹窗（无 cookie 录入 UI，csrftoken 无值时提示未登录） |
| `server/package.json` | 新增 | fastify、@fastify/static；tsx、typescript、@types/node；scripts: dev/build/start |
| `server/tsconfig.json` | 新增 | NodeNext ESM、strict |
| `server/src/index.ts` | 新增 | Fastify 实例 + 静态托管 + 两个转发路由 |
| `docs/build-cross-origin-plan.md` | 修改 | 本文档 |

---

## 5. 验证清单

- [ ] 本地 `npm run dev`，访问 `http://localhost:5173/devops-api/` 登录运维平台
- [ ] 构建弹窗点"开始构建"：不再提示"未登录"，返回 200 提示成功
- [ ] 清空 cookie 后再点：提示"未登录"或 401/403 提示登录态失效
- [ ] `live-h5-2` 项目各环境分支解析正常
- [ ] `npm run build` + `server/` 启动后，向本站域名写入 cookie 可正常构建（远程通路）

---

## 6. 决策记录

- 2026-08-14：初版方案（本地 Vite 代理 + 远程同源子路径部署）。
- 2026-08-17：用户确认不会部署到 devops.vzan.com，远程方案改为**自带 Node 服务端转发**（Fastify），登录态改为**用户粘贴 cookie**；扩展桥接方案废弃。
- 2026-08-17（二）：取消应用内 cookie 粘贴 UI 与 localStorage / `x-devops-cookie` 方案；改为用户自行通过其他工具把 cookie 写入本站域名，前端只读 `document.cookie`，服务端透传入站 `Cookie` 头。
- 2026-08-17（三）：修复本地 `CSRF Failed: Origin checking failed` —— 浏览器 POST 自动带 `Origin: http://localhost:5173`，`changeOrigin` 只改 `Host` 不改 `Origin`；在 Vite 代理加 `headers: { Origin, Referer }` 改写为 devops 域（Postman 不带 Origin 故直连可通）。
