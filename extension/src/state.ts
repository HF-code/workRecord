import type { Memento } from 'vscode';
import type { Requirement } from './types';

const REQ_KEY = 'workTracker.requirements';
const PROJECT_KEY = 'workTracker.projects';

/** globalState 中持久化的全部数据快照 */
export interface StoredState {
  requirements: Requirement[] | null;
  projects: string[] | null;
}

/** 读取用户级持久化数据；首次使用返回 null（由前端播种默认项目） */
export function readState(globalState: Memento): StoredState {
  return {
    requirements: globalState.get<Requirement[] | null>(REQ_KEY, null),
    projects: globalState.get<string[] | null>(PROJECT_KEY, null),
  };
}

/** 写入数据快照（partial，未提供的字段保持不变） */
export function saveState(
  globalState: Memento,
  payload: { requirements?: Requirement[]; projects?: string[] },
): void {
  if (payload.requirements !== undefined) {
    void globalState.update(REQ_KEY, payload.requirements);
  }
  if (payload.projects !== undefined) {
    void globalState.update(PROJECT_KEY, payload.projects);
  }
}
