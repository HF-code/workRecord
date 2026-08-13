import type { Requirement } from './types';

/**
 * 与 VSCode extension 主进程通信的桥接层。
 *
 * 仅插件版（__VSCODE__ 为 true）生效；Web 版构建时整个模块被死代码消除，
 * 不影响现有 localStorage 行为。
 */

/** 插件版初始化数据：extension 注入 webview 的全局变量 */
export interface InitState {
  requirements: Requirement[] | null;
  projects: string[] | null;
}

/** postMessage 消息协议（webview -> extension），与 extension/src/webview.ts 保持一致 */
export type VscodeBridgeMessage =
  | { type: 'ready' }
  | { type: 'save'; payload: { requirements: Requirement[]; projects: string[] } };

/** extension 侧暴露的 webview API 最小接口 */
interface VsCodeApi {
  postMessage(message: VscodeBridgeMessage): void;
}

/** save 消息防抖合并窗口（毫秒）：合并 App 两个 useEffect 触发的连续保存 */
const SAVE_DEBOUNCE_MS = 200;

const IS_VSCODE = typeof __VSCODE__ !== 'undefined' && __VSCODE__ === true;

let api: VsCodeApi | null = null;

if (IS_VSCODE && typeof window !== 'undefined' && typeof window.acquireVsCodeApi === 'function') {
  api = window.acquireVsCodeApi<VsCodeApi>();
}

/** 待合并保存的数据快照 */
let pending: { requirements?: Requirement[]; projects?: string[] } = {};
let timer: ReturnType<typeof setTimeout> | null = null;

function flush(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  if (api === null) return;
  api.postMessage({
    type: 'save',
    payload: {
      requirements: pending.requirements ?? [],
      projects: pending.projects ?? [],
    },
  });
  pending = {};
}

/** 运行时结构校验，避免直接信任 extension 注入的数据 */
function isInitState(value: unknown): value is InitState {
  if (value === null || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  return (
    (s.requirements === null || Array.isArray(s.requirements)) &&
    (s.projects === null || Array.isArray(s.projects))
  );
}

/** 读取 extension 注入的初始化数据；Web 版或缺失时返回 null */
export function getInitialState(): InitState | null {
  if (!IS_VSCODE) return null;
  const raw: unknown = window.__INITIAL_STATE__;
  if (!isInitState(raw)) return null;
  return raw;
}

/** 通知 extension webview 已就绪（握手） */
export function notifyReady(): void {
  if (api === null) return;
  api.postMessage({ type: 'ready' });
}

/**
 * 上报数据变更到 extension 持久化（globalState）。
 * 两个 useEffect 连续触发时会做防抖合并，最终合并为一次 save 消息。
 */
export function save(payload: { requirements?: Requirement[]; projects?: string[] }): void {
  if (api === null) return;
  pending = { ...pending, ...payload };
  if (timer === null) {
    timer = setTimeout(flush, SAVE_DEBOUNCE_MS);
  }
}

// 面板销毁/刷新前立即落盘，避免防抖窗口内的最后一次变更丢失
if (IS_VSCODE && typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    flush();
  });
}

// webview 加载完成时发 ready 握手（App.tsx 零改动）
if (IS_VSCODE && typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    notifyReady();
  });
}
