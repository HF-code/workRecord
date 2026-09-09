import { useEffect, useState } from 'react';
import {
  requestBuild,
  resolveBuildBranch,
  fetchCurrentEmail,
  fetchArtifact,
  BUILD_GROUP,
  type BuildEnv,
} from '../build';
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
  /** 关联的需求 id 列表（卡片构建小灯 / 环境进度自动回写用） */
  reqIds?: string[];
  /** 制品回查状态（phase 到 done 时启动轮询，随任务清理而清理） */
  artifact?: ArtifactState;
  updatedAt: number;
}

/** 制品回查状态 */
export interface ArtifactState {
  status: 'querying' | 'success' | 'fail' | 'timeout';
  /** 成功时的制品链接 */
  fileUrl?: string;
  /** 失败/超时原因（展示用） */
  reason?: string;
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

// --- 制品回查轮询（构建 done 后 30s 首查，每 30s 一次，最多 40 次 / 20 分钟超时） ---
const ARTIFACT_FIRST_DELAY_MS = 30_000;
const ARTIFACT_POLL_INTERVAL_MS = 30_000;
const ARTIFACT_MAX_POLL = 40;

const artifactPollers = new Map<
  string,
  { first?: ReturnType<typeof setTimeout>; loop?: ReturnType<typeof setInterval> }
>();

/** 停止某任务的制品轮询（幂等） */
function stopArtifactPolling(id: string): void {
  const timers = artifactPollers.get(id);
  if (!timers) return;
  if (timers.first) clearTimeout(timers.first);
  if (timers.loop) clearInterval(timers.loop);
  artifactPollers.delete(id);
}

/** 更新制品状态（状态无变化不 patch，避免 updatedAt 抖动导致列表排序跳动） */
function setArtifact(id: string, next: ArtifactState): void {
  const cur = taskMap.get(id);
  if (!cur) {
    stopArtifactPolling(id);
    return;
  }
  if (
    cur.artifact?.status === next.status &&
    cur.artifact.fileUrl === next.fileUrl &&
    cur.artifact.reason === next.reason
  ) {
    return;
  }
  patchTask(id, { artifact: next });
}

/**
 * 启动制品回查轮询（构建触发成功后调用）：
 * 查询参数 app/branch/email/group 全带（branch 用 resolveBuildBranch 结果、email 模块级缓存）；
 * succeed===1 成功 / ===2 进行中(继续轮询) / ===0 失败；email 获取失败直接置 fail，不阻塞构建结果。
 */
function startArtifactPolling(id: string, app: string, env: BuildEnv): void {
  if (artifactPollers.has(id)) return;
  setArtifact(id, { status: 'querying' });
  let count = 0;
  let branchCache: string | null = null;
  const timers: { first?: ReturnType<typeof setTimeout>; loop?: ReturnType<typeof setInterval> } = {};
  const tick = async () => {
    if (!taskMap.has(id)) {
      stopArtifactPolling(id);
      return;
    }
    count += 1;
    if (count > ARTIFACT_MAX_POLL) {
      setArtifact(id, { status: 'timeout', reason: '制品查询超时（20 分钟）' });
      stopArtifactPolling(id);
      return;
    }
    try {
      const email = await fetchCurrentEmail();
      if (!branchCache) branchCache = await resolveBuildBranch(app, env);
      const artifact = await fetchArtifact({ app, branch: branchCache, email, group: BUILD_GROUP });
      if (!artifact) return; // 请求失败/无记录 → 下轮继续
      if (artifact.succeed === 1) {
        setArtifact(id, {
          status: 'success',
          fileUrl: artifact.fileUrl ?? undefined,
          reason: artifact.fileUrl ? undefined : '成功但未返回制品链接',
        });
        stopArtifactPolling(id);
      } else if (artifact.succeed === 0) {
        setArtifact(id, { status: 'fail', reason: '构建失败，请到构建记录页查看日志' });
        stopArtifactPolling(id);
      }
      // succeed === 2 进行中 → 继续轮询
    } catch (err) {
      // email 获取失败（未登录）等异常 → 制品状态置 fail，不阻塞构建结果
      setArtifact(id, { status: 'fail', reason: `${(err as Error).message}，可到设置页检查登录状态后重新构建` });
      stopArtifactPolling(id);
    }
  };
  timers.first = setTimeout(() => {
    void tick();
    timers.loop = setInterval(() => void tick(), ARTIFACT_POLL_INTERVAL_MS);
  }, ARTIFACT_FIRST_DELAY_MS);
  artifactPollers.set(id, timers);
}

/**
 * 启动单个 app 的构建任务并在「上一任务尚未完成」时按配置间隔自动轮询重试。
 * 任务状态上报到全局 store，可在「构建任务」面板查看 / 取消。
 * @param reqIds 关联的需求 id 列表（卡片构建小灯 / 环境进度自动回写用，可选）
 * 返回最终构建结果（成功 / 失败 / 取消）。
 */
export function startBuildTask(
  reqName: string,
  app: string,
  env: BuildEnv,
  buildOther?: string,
  reqIds?: string[],
): Promise<BuildResult> {
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
    reqIds,
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
      const r = await requestBuild({ app, env, update: false, buildOther });
      if (cancelled) {
        return finish('cancelled', { detail: '已取消' }, { ok: false, detail: '已取消' });
      }
      if (r.ok) {
        const result = finish(
          'done',
          { detail: r.detail, recordUrl: r.recordUrl },
          { ok: true, detail: r.detail, recordUrl: r.recordUrl },
        );
        // 构建触发成功 → 启动制品回查轮询（30s 首查，每 30s，20 分钟超时）
        startArtifactPolling(id, app, env);
        return result;
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

/** 取消单个构建任务（仅对进行中 / 等待中的任务有效）；同步清理制品轮询 */
export function cancelBuildTask(id: string): void {
  controls.get(id)?.cancel();
  stopArtifactPolling(id);
}

/** 从列表中移除某任务（用于清理已完成 / 已取消 / 失败的历史记录）；同步清理制品轮询 */
export function removeBuildTask(id: string): void {
  taskMap.delete(id);
  controls.delete(id);
  stopArtifactPolling(id);
  emit();
}

/** 清空全部任务记录；同步清理全部制品轮询 */
export function clearBuildTasks(): void {
  taskMap.clear();
  controls.clear();
  Array.from(artifactPollers.keys()).forEach((id) => stopArtifactPolling(id));
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
