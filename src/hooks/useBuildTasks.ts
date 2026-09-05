import { useEffect, useState } from 'react';
import { requestBuild, type BuildEnv } from '../build';
import { loadBuildPollInterval, loadAutoBuildOnFail } from '../storage';
import { BUILD_BUSY_DETAIL } from '../config/buildConfig';

export type BuildTaskPhase =
  | 'building' // 正在请求构建
  | 'waiting' // 命中「上一任务未完成」，等待下次重试
  | 'done' // 构建已触发成功
  | 'failed' // 失败（含非 busy 错误 / 达到重试上限 / 自动构建关闭）
  | 'cancelled'; // 用户主动取消

export interface BuildTask {
  id: string;
  reqName: string;
  app: string;
  env: BuildEnv;
  phase: BuildTaskPhase;
  /** 已重试次数 */
  retry: number;
  /** waiting 状态下距下次重试的秒数（用于展示），非 waiting 为 null */
  nextInSec: number | null;
  /** 最近一次接口返回的 detail */
  detail?: string;
  /** 构建成功后的构建记录页地址 */
  recordUrl?: string;
  updatedAt: number;
}

export interface BuildResult {
  ok: boolean;
  detail: string;
  status?: number;
  /** 构建成功后的构建记录页地址 */
  recordUrl?: string;
}

const MAX_RETRY = 30; // 连续重试上限，仅作兜底，不限制间隔本身

// --- module-level store（跨组件共享，不依赖 React 渲染/页面可见性） ---
const taskMap = new Map<string, BuildTask>();
const listeners = new Set<(snap: BuildTask[]) => void>();
const controls = new Map<string, { cancel: () => void }>();
let seq = 0;

function snapshot(): BuildTask[] {
  return Array.from(taskMap.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

function emit() {
  const snap = snapshot();
  listeners.forEach((l) => l(snap));
}

function patchTask(id: string, patch: Partial<BuildTask>) {
  const t = taskMap.get(id);
  if (!t) return;
  taskMap.set(id, { ...t, ...patch, updatedAt: Date.now() });
  emit();
}

/**
 * 启动单个 app 的构建任务并在「上一任务尚未完成」时按配置间隔自动轮询重试。
 * 任务状态上报到全局 store，可在「构建任务」面板查看 / 取消。
 * 返回最终构建结果（成功 / 失败 / 取消）。
 */
export function startBuildTask(reqName: string, app: string, env: BuildEnv): Promise<BuildResult> {
  const id = `build-task-${++seq}`;
  let cancelled = false;

  taskMap.set(id, {
    id,
    reqName,
    app,
    env,
    phase: 'building',
    retry: 0,
    nextInSec: null,
    updatedAt: Date.now(),
  });
  emit();

  const finish = (phase: BuildTaskPhase, extra: Partial<BuildTask>, result: BuildResult) => {
    controls.delete(id);
    patchTask(id, { phase, ...extra });
    return result;
  };

  const run = async (): Promise<BuildResult> => {
    let retry = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (cancelled) {
        return finish('cancelled', { detail: '已取消' }, { ok: false, detail: '已取消' });
      }
      patchTask(id, { phase: 'building', nextInSec: null });
      const r = await requestBuild({ app, env, update: false });
      if (cancelled) {
        return finish('cancelled', { detail: '已取消' }, { ok: false, detail: '已取消' });
      }
      if (r.ok) {
        return finish(
          'done',
          { detail: r.detail, recordUrl: r.recordUrl },
          { ok: true, detail: r.detail, recordUrl: r.recordUrl },
        );
      }
      // 登录态失效：直接失败，不再轮询
      if (r.status === 401 || r.status === 403) {
        return finish('failed', { detail: r.detail }, { ok: false, detail: r.detail, status: r.status });
      }
      // 非「上一任务尚未完成」的其他错误：直接失败
      if (r.detail !== BUILD_BUSY_DETAIL) {
        return finish('failed', { detail: r.detail }, { ok: false, detail: r.detail, status: r.status });
      }
      // 命中「上一任务尚未完成」：若未开启自动构建 / 达到上限，则停止
      if (!loadAutoBuildOnFail()) {
        return finish('failed', { detail: r.detail }, { ok: false, detail: r.detail, status: r.status });
      }
      if (retry >= MAX_RETRY) {
        return finish('failed', { detail: r.detail }, { ok: false, detail: r.detail, status: r.status });
      }
      const interval = loadBuildPollInterval(); // 秒
      retry += 1;
      patchTask(id, { phase: 'waiting', retry, nextInSec: interval, detail: r.detail });
      // 可被取消中断的等待
      await new Promise<void>((resolve) => {
        let timer: ReturnType<typeof setTimeout>;
        controls.set(id, {
          cancel: () => {
            cancelled = true;
            clearTimeout(timer);
            resolve();
          },
        });
        timer = setTimeout(() => {
          controls.delete(id);
          resolve();
        }, interval * 1000);
      });
    }
  };

  return run();
}

/** 取消单个构建任务（仅对进行中 / 等待中的任务有效） */
export function cancelBuildTask(id: string): void {
  controls.get(id)?.cancel();
}

/** 从列表中移除某任务（用于清理已完成 / 已取消 / 失败的历史记录） */
export function removeBuildTask(id: string): void {
  taskMap.delete(id);
  controls.delete(id);
  emit();
}

/** 清空全部任务记录 */
export function clearBuildTasks(): void {
  taskMap.clear();
  controls.clear();
  emit();
}

/** React 订阅 hook：返回当前所有构建任务的快照 */
export function useBuildTasks(): {
  tasks: BuildTask[];
  activeCount: number;
  cancelTask: (id: string) => void;
  removeTask: (id: string) => void;
  clear: () => void;
} {
  const [tasks, setTasks] = useState<BuildTask[]>(() => snapshot());

  useEffect(() => {
    const listener = (snap: BuildTask[]) => setTasks(snap);
    listeners.add(listener);
    setTasks(snapshot());
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const activeCount = tasks.filter(
    (t) => t.phase === 'building' || t.phase === 'waiting',
  ).length;

  return {
    tasks,
    activeCount,
    cancelTask: cancelBuildTask,
    removeTask: removeBuildTask,
    clear: clearBuildTasks,
  };
}
