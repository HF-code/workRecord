/**
 * 运维平台构建请求，参考 vzan_crx 扩展 background.js 的直连实现。
 * 新版接口为两步式：
 * 1) GET /deploy/build?app=&app_group=&build_other=&get_build_number=1 取最新构建编号（返回纯数字）；
 * 2) POST /deploy/build 携带该 number 提交构建。
 * 请求统一走相对路径 /devops-api：
 * - 本地开发：Vite proxy 转发到 https://devops.vzan.com，浏览器 cookie 自动携带
 * - 远程部署：自带 Node 服务端（server/）转发，入站 Cookie 头透传给上游
 * 登录 cookie 由用户自行通过其他工具写入当前站点域名，应用只从 document.cookie 读取。
 */
import { DEVOPS_GROUPS, type DevopsApp, type DevopsGroup } from './config/devopsApps';

const API_BASE = '/devops-api';
const BUILD_API = `${API_BASE}/deploy/build`;
const BRANCH_API = `${API_BASE}/deploy/branch?app=live-h5-2`;
const APPLICATION_API = `${API_BASE}/deploy/application`;

/** 构建/发布记录页的分组，构建 payload 的 group 与记录页 app_group 保持一致 */
const BUILD_GROUP = 'JenkinsFrontweb';
/** 运维平台构建记录页基础地址 */
const DEVOPS_WEB = 'https://devops.vzan.com/index.html';

/**
 * 构建环境/分支标识。
 * 内置环境见 config/branches.ts 的 BUILTIN_BUILD_ENVS；也支持自定义标识
 * （运维平台新增环境时无需改代码，标识会拼为 origin/{env} 传给构建接口）。
 */
export type BuildEnv = string;

/** 将 git 仓库地址（scp 或 http 形式）转为 GitLab 预填 MR 链接
 * @param branch 源分支（需求登记的开发分支）
 * @param targetBranch 目标分支（构建目标分支，默认 master）
 */
export function buildMergeRequestUrl(gitUrl: string, branch: string, targetBranch = 'master'): string {
  let web = gitUrl.trim().replace(/\.git$/, '');
  const scp = web.match(/^git@([^:]+):(.+)$/);
  if (scp) web = `https://${scp[1]}/${scp[2]}`;
  const params = new URLSearchParams({
    'merge_request[source_branch]': branch,
    'merge_request[target_branch]': targetBranch,
  });
  return `${web}/-/merge_requests/new?${params.toString()}`;
}

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
  /** 构建编号（第二步 POST 成功时返回，对应构建记录页的 number 参数） */
  number?: number;
  /** 构建记录页地址，仅成功时返回 */
  recordUrl?: string;
}

/** 构建记录页地址 */
export function buildRecordUrl(app: string, buildOther: string, number: number): string {
  return (
    `${DEVOPS_WEB}#/gou-jian-ji-lu/?app=${encodeURIComponent(app)}` +
    `&number=${number}` +
    `&app_group=${encodeURIComponent(BUILD_GROUP)}` +
    `&build_other=${encodeURIComponent(buildOther)}`
  );
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
    group: BUILD_GROUP,
    app: params.app,
    branch: await resolveBuildBranch(params.app, params.env),
    committed_id: '',
    committed_msg: '',
    env: params.update ? params.env : '',
    build_type: 'docker_build',
    build_other: params.env || 'dev',
  };
}

type BuildPayload = Awaited<ReturnType<typeof buildPayload>>;

/**
 * 第一步：GET 获取最新构建编号。
 * GET /deploy/build?app=&app_group=&build_other=&get_build_number=1
 * 成功返回纯数字（如 4423）；若上一任务尚未完成，返回 JSON 且 detail 为「上一任务尚未完成，请耐心等待」。
 */
async function fetchBuildNumber(
  payload: BuildPayload,
): Promise<{ ok: true; number: number } | { ok: false; status: number; detail: string }> {
  const url =
    `${BUILD_API}?app=${encodeURIComponent(payload.app)}` +
    `&app_group=${encodeURIComponent(payload.group)}` +
    `&build_other=${encodeURIComponent(payload.build_other)}` +
    `&get_build_number=1`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: buildHeaders(),
      credentials: 'include',
    });
    const text = await res.text();
    let detail = '';
    try {
      const fail = JSON.parse(text);
      if (fail && typeof fail === 'object' && fail.detail) detail = String(fail.detail);
    } catch {
      // 纯数字响应，非 JSON
    }
    if (res.status !== 200 || detail) {
      return { ok: false, status: res.status, detail: detail || `HTTP ${res.status}` };
    }
    const number = Number.parseInt(text.trim(), 10);
    if (Number.isNaN(number)) {
      return { ok: false, status: res.status, detail: `获取构建编号失败：${text}` };
    }
    return { ok: true, number };
  } catch (e) {
    return { ok: false, status: 0, detail: (e as Error).message };
  }
}

/** 运维平台应用接口返回的单条原始数据（只取用到的字段） */
interface RawDevopsApp {
  app?: unknown;
  alias?: unknown;
}

/** 未登录时接口返回 200 + { error_code: 'user:user_login_failed' }，统一抛该错误文案 */
const NOT_LOGGED_IN_MSG = '未登录运维平台，请先登录';

async function fetchGroupApps(group: DevopsGroup): Promise<DevopsApp[]> {
  const res = await fetch(`${APPLICATION_API}?group=${encodeURIComponent(group)}`, {
    headers: buildHeaders(),
    credentials: 'include',
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error(NOT_LOGGED_IN_MSG);
  }
  const data: unknown = await res.json().catch(() => null);
  if (!Array.isArray(data)) {
    throw new Error(NOT_LOGGED_IN_MSG);
  }
  return (data as RawDevopsApp[])
    .filter((item) => typeof item.app === 'string' && item.app)
    .map((item) => ({
      app: (item.app as string).trim(),
      alias: typeof item.alias === 'string' ? item.alias.trim() : '',
      group,
    }));
}

/**
 * 拉取运维平台所有分组的应用列表（并行），按 app 去重（靠前分组优先）。
 * 任一分组失败即整体抛错。
 */
export async function fetchDevopsApps(): Promise<DevopsApp[]> {
  const results = await Promise.all(DEVOPS_GROUPS.map((group) => fetchGroupApps(group)));
  const seen = new Set<string>();
  return results.flat().filter((item) => {
    if (seen.has(item.app)) return false;
    seen.add(item.app);
    return true;
  });
}

/**
 * 触发构建（新版接口，两步式）：
 * 1) GET 获取最新构建编号（含「上一任务尚未完成」的排队判断）；
 * 2) POST 提交构建，payload 携带第一步得到的 number。
 */
export async function requestBuild(params: BuildParams): Promise<BuildResult> {
  const payload = await buildPayload(params);
  // 第一步：取构建编号；失败（如上一任务尚未完成）直接返回，交给上层决定是否重试
  const numberResult = await fetchBuildNumber(payload);
  if (!numberResult.ok) {
    return { ok: false, status: numberResult.status, detail: numberResult.detail };
  }
  const number = numberResult.number;
  try {
    const res = await fetch(BUILD_API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...buildHeaders(),
      },
      body: JSON.stringify({ ...payload, number }),
      credentials: 'include',
    });
    let detail = 'HTTP ' + res.status;
    try {
      const fail = await res.json();
      if (fail && fail.detail) detail = fail.detail;
    } catch {
      // 忽略非 JSON 响应
    }
    const ok = res.status === 200;
    return {
      ok,
      status: res.status,
      detail,
      number,
      recordUrl: ok ? buildRecordUrl(payload.app, payload.build_other, number) : undefined,
    };
  } catch (e) {
    return { ok: false, status: 0, detail: (e as Error).message, number };
  }
}
