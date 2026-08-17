/**
 * 运维平台构建请求，参考 vzan_crx 扩展 background.js 的直连实现。
 * 请求统一走相对路径 /devops-api：
 * - 本地开发：Vite proxy 转发到 https://devops.vzan.com，浏览器 cookie 自动携带
 * - 远程部署：自带 Node 服务端（server/）转发，入站 Cookie 头透传给上游
 * 登录 cookie 由用户自行通过其他工具写入当前站点域名，应用只从 document.cookie 读取。
 */
const API_BASE = '/devops-api';
const BUILD_API = `${API_BASE}/deploy/build`;
const BRANCH_API = `${API_BASE}/deploy/branch?app=live-h5-2`;

export type BuildEnv = 'dev' | 'test' | 'pre';

export interface BuildParams {
  app: string;
  env: BuildEnv;
  /** 对应扩展中 update == '1'：同时更新环境 */
  update: boolean;
}

export interface BuildResult {
  ok: boolean;
  status: number;
  detail: string;
}

/** 从 document.cookie 读取 csrftoken，无值视为未登录 */
export function getCsrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function buildHeaders(): Record<string, string> {
  return { 'x-csrftoken': getCsrfToken() };
}

// live-h5-2 老项目分支解析（与扩展原逻辑一致）
async function resolveBuildBranch(app: string, env: BuildEnv): Promise<string> {
  if (app !== 'live-h5-2') return 'origin/' + env;
  let branch: string = env;
  try {
    const res = await fetch(BRANCH_API, {
      headers: buildHeaders(),
      credentials: 'include',
    });
    const list: unknown = await res.json();
    if (Array.isArray(list)) {
      list.forEach((el: string) => {
        if (env === 'test' && el.includes('origin/test_')) branch = el.split('/')[1];
        else if (env === 'dev' && el.includes('origin/dev_')) branch = el.split('/')[1];
        else if (env === 'pre') branch = 'pre2';
      });
    }
  } catch {
    // 查询老项目分支失败，按 env 直接构建
  }
  return 'origin/' + branch;
}

async function buildPayload(params: BuildParams) {
  return {
    group: 'JenkinsFrontweb',
    app: params.app,
    branch: await resolveBuildBranch(params.app, params.env),
    committed_id: '',
    committed_msg: '',
    env: params.update ? params.env : '',
    build_type: 'docker_build',
    build_other: params.env || 'dev',
  };
}

export async function requestBuild(params: BuildParams): Promise<BuildResult> {
  const payload = await buildPayload(params);
  try {
    const res = await fetch(BUILD_API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...buildHeaders(),
      },
      body: JSON.stringify(payload),
      credentials: 'include',
    });
    let detail = 'HTTP ' + res.status;
    try {
      const fail = await res.json();
      if (fail && fail.detail) detail = fail.detail;
    } catch {
      // 忽略非 JSON 响应
    }
    return { ok: res.status === 200, status: res.status, detail };
  } catch (e) {
    return { ok: false, status: 0, detail: (e as Error).message };
  }
}
