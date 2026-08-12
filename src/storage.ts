import type { Requirement } from './types';

const REQ_KEY = 'work-tracker:requirements:v1';
const PROJECT_KEY = 'work-tracker:projects:v1';

/** 首次启动时的默认项目清单 */
export const DEFAULT_PROJECTS: string[] = [
  'admin-web',
  'agent_app',
  'agentadmin',
  'audit-web',
  'CustomerServiceSystem',
  'cxw-web',
  'data_admin',
  'devopsmcpserver',
  'education',
  'erp_mobile',
  'frontendworkflowskills',
  'furniturelive',
  'GroupChat',
  'imliveweb',
  'kuta_admin',
  'kuta_mobile',
  'livepage',
  'live-web',
  'marketing_admin',
  'marketing_clinet',
  'mengchu_com',
  'newzanlivemobile',
  'pay',
  'sc_vazn_com',
  'select_admin',
  'select_com',
  'select_miniapp',
  'send_admin',
  'shop_miniapp',
  'shop_miniapp-worktrees',
  'skills',
  'store_admin',
  'store_mobile',
  'storeminiapp',
  'supply_admin',
  'supply_chain_admin',
  'userlive',
  'vzan_crx',
  'vzanlive',
  'vzanlivemobile',
  'vzanlivemobile-e2e',
  'vzui',
  'weistream_admin',
  'weistream_com',
  'weistream_web',
  'whbanyu_admin',
];

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 存储失败（如容量满）静默处理，不阻塞界面
  }
}

export function loadRequirements(): Requirement[] {
  return loadJson<Requirement[]>(REQ_KEY, []);
}

export function saveRequirements(list: Requirement[]): void {
  saveJson(REQ_KEY, list);
}

const SEED_KEY = 'work-tracker:projects:seeded:v1';

export function loadProjects(): string[] {
  const list = loadJson<string[]>(PROJECT_KEY, []);
  // 只播种一次：老用户（已存过空清单）也会被补入默认项目；之后删光也不会再复活
  if (localStorage.getItem(SEED_KEY) === null) {
    localStorage.setItem(SEED_KEY, '1');
    const merged = [...new Set([...DEFAULT_PROJECTS, ...list])];
    saveJson(PROJECT_KEY, merged);
    return merged;
  }
  return list;
}

export function saveProjects(list: string[]): void {
  saveJson(PROJECT_KEY, list);
}
