/**
 * 服务端请求地址配置（单一出口）。
 *
 * baseUrl 通过 Vite 环境变量在构建时注入（.env.development / .env.test / .env.production，
 * 本地私有覆盖用 .env.<mode>.local，不入库）：
 * - 留空：同源请求 —— 本地 dev 由 Vite proxy 转发到本地后端，生产由后端同源托管前端产物
 * - 填写：跨域直连服务端 origin（前后端分离部署场景），如 https://worklist.example.com
 *
 * 仅注入 origin，路径前缀（/devops-api、/api）由代码维护，
 * 保证「Vite 代理终结」与「服务端同源/直连终结」两条通路行为一致。
 */

/** 服务端 origin，结尾无斜杠；空串表示同源 */
export const SERVER_BASE_URL: string = (import.meta.env.VITE_SERVER_BASE_URL ?? '')
  .trim()
  .replace(/\/+$/, '');

/** 运维平台接口前缀：服务端反代 devops.vzan.com（构建/分支/应用/用户接口） */
export const DEVOPS_API_BASE = `${SERVER_BASE_URL}/devops-api`;

/** 应用自身接口前缀（钉钉绑定等业务接口） */
export const APP_API_BASE = `${SERVER_BASE_URL}/api`;
