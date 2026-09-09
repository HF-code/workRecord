/**
 * 批量操作纯函数：MR 目标汇总、构建目标去重（project+env）与统计。
 *
 * 数据模型约定（双轨并行，见 docs/plans/dual-track-rework-plan.md）：
 * - 勾选卡片 = 该需求**全部项目**直接进入批量范围；
 * - 临时排除：excluded[reqId] = 被用户在批量面板 X 掉的 itemId 列表（仅会话内，不回写数据）；
 * - 临时恢复：included[reqId] = 项目配置标记「不参与构建」但被用户点「仍构建」的 itemId 列表（仅会话内）；
 * - 有效批量范围 = 需求全部项目 − excluded − 项目配置排除（未被 included 恢复的）；
 * - 双轨：批量构建/MR 按需求的**已开始轨**逐轨展开（每轨目标环境独立）。
 */
import type { OverallStatus, Requirement, ProjectBranch, Track } from './types';
import type { DevopsApp } from './config/devopsApps';
import { buildMergeRequestUrl, type BuildEnv } from './build';
import { startedTracks, TRACK_LABELS } from './config/track';

/** 构建计划依赖的最小接口（按轨取目标环境 + 构建命令） */
export interface BuildPlanLike {
  getTarget: (req: Requirement, track: Track) => BuildEnv;
  /** 取构建命令（运维平台 build_other 字段），缺省等于环境本身 */
  getBuildOther: (env: BuildEnv) => string;
}

/** 完整构建计划（useBuildPlan 返回值中 UI 需要的部分） */
export interface BuildPlan extends BuildPlanLike {
  setTarget: (req: Requirement, track: Track, env: BuildEnv) => void;
}

/** 一条可触发的 MR 目标（需求 × 轨 × 项目，不去重） */
export interface MrTarget {
  reqId: string;
  reqName: string;
  track: Track;
  itemId: string;
  project: string;
  /** 开发分支（MR 源分支） */
  branch: string;
  /** 目标分支（MR target / 构建目标，= 该轨目标环境） */
  env: BuildEnv;
  /** GitLab 预填 MR 链接 */
  url: string;
}

/** 一条无法生成 MR 的跳过项及原因 */
export interface MrSkipped {
  reqName: string;
  project: string;
  reason: string;
}

/** 一条去重后的构建目标（同 project + 同 buildOther 只构建一次） */
export interface BuildTarget {
  /** `${project}::${buildOther}`，同 key 合并 */
  key: string;
  project: string;
  track: Track;
  env: BuildEnv;
  /** 构建命令（运维平台 build_other 字段，缺省等于环境） */
  buildOther: string;
  /** 参与该构建目标的需求名列表（构建任务名合并展示用） */
  reqNames: string[];
  /** 参与该构建目标的需求 id 列表（构建任务回写需求进度/小灯用） */
  reqIds: string[];
}

/** 批量面板顶部的统计 */
export interface BatchSummary {
  /** 参与批量的需求数 */
  reqCount: number;
  /** 有效项目实例总数（= MR 触发数，不去重，按轨展开） */
  itemCount: number;
  /** 去重后的构建任务数 */
  buildCount: number;
  /** 因缺 gitUrl/分支被跳过的 MR 项数 */
  skippedCount: number;
  /** 被项目配置「不参与构建」默认排除（且未被临时恢复）的项目实例数 */
  configExcludedCount: number;
}

/** 项目是否被项目配置标记为不参与构建 */
export function isBuildExcluded(apps: DevopsApp[], project: string): boolean {
  return !!apps.find((a) => a.app === project)?.excludeFromBuild;
}

/**
 * 取某需求的有效批量项目：
 * 全部项目 − excluded（用户 X 掉的）− 项目配置排除（未被 included 恢复的）。
 * apps/included 为可选：不传时退化为原始行为（仅按 excluded 过滤）。
 */
export function getBatchItems(
  req: Requirement,
  excluded: Record<string, string[]>,
  apps?: DevopsApp[],
  included?: Record<string, string[]>,
): ProjectBranch[] {
  const excludedIds = new Set(excluded[req.id] ?? []);
  const includedIds = new Set(included?.[req.id] ?? []);
  return req.items.filter((it) => {
    if (excludedIds.has(it.id)) return false;
    if (apps && isBuildExcluded(apps, it.project) && !includedIds.has(it.id)) return false;
    return true;
  });
}

/**
 * MR 目标汇总：对每个需求的**已开始轨 × 有效项目**生成 GitLab 预填链接（不去重）。
 * 缺 gitUrl / 未填开发分支的项归入 skipped 并给出原因。
 */
export function collectMrTargets(
  reqs: Requirement[],
  apps: DevopsApp[],
  buildPlan: BuildPlanLike,
  excluded: Record<string, string[]>,
  included?: Record<string, string[]>,
): { targets: MrTarget[]; skipped: MrSkipped[] } {
  const targets: MrTarget[] = [];
  const skipped: MrSkipped[] = [];
  for (const req of reqs) {
    for (const track of startedTracks(req)) {
      const env = buildPlan.getTarget(req, track);
      for (const it of getBatchItems(req, excluded, apps, included)) {
        const gitUrl = apps.find((a) => a.app === it.project)?.gitUrl;
        if (!gitUrl) {
          skipped.push({
            reqName: `${req.name}（${TRACK_LABELS[track]}）`,
            project: it.project,
            reason: '未配置 Git 仓库地址',
          });
          continue;
        }
        if (!it.branch) {
          skipped.push({
            reqName: `${req.name}（${TRACK_LABELS[track]}）`,
            project: it.project,
            reason: '未填写开发分支',
          });
          continue;
        }
        targets.push({
          reqId: req.id,
          reqName: req.name,
          track,
          itemId: it.id,
          project: it.project,
          branch: it.branch,
          env,
          url: buildMergeRequestUrl(gitUrl, it.branch, env),
        });
      }
    }
  }
  return { targets, skipped };
}

/**
 * 构建目标汇总：按需求的**已开始轨**展开，`project::buildOther` 去重合并——
 * 同项目同目标环境只构建一次，reqNames/reqIds 合并用于构建任务名展示与需求进度回写。
 * dupCount = 有效项目实例数 − 构建目标数（即被合并掉的次数）。
 */
export function collectBuildTargets(
  reqs: Requirement[],
  apps: DevopsApp[],
  buildPlan: BuildPlanLike,
  excluded: Record<string, string[]>,
  included?: Record<string, string[]>,
): { builds: BuildTarget[]; dupCount: number } {
  const map = new Map<string, BuildTarget>();
  let itemCount = 0;
  for (const req of reqs) {
    for (const track of startedTracks(req)) {
      const env = buildPlan.getTarget(req, track);
      const buildOther = buildPlan.getBuildOther(env);
      for (const it of getBatchItems(req, excluded, apps, included)) {
        itemCount += 1;
        const key = `${it.project}::${buildOther}`;
        const existing = map.get(key);
        if (existing) {
          // 同项目同构建命令去重合并，仅追加需求名/id（去重防止同名/同需求重复）
          if (!existing.reqNames.includes(req.name)) existing.reqNames.push(req.name);
          if (!existing.reqIds.includes(req.id)) existing.reqIds.push(req.id);
        } else {
          map.set(key, {
            key,
            project: it.project,
            track,
            env,
            buildOther,
            reqNames: [req.name],
            reqIds: [req.id],
          });
        }
      }
    }
  }
  const builds = [...map.values()];
  return { builds, dupCount: Math.max(0, itemCount - builds.length) };
}

/** 统计被项目配置默认排除（未被 X 掉、也未被临时恢复）的项目实例数 */
export function countConfigExcluded(
  reqs: Requirement[],
  apps: DevopsApp[],
  excluded: Record<string, string[]>,
  included?: Record<string, string[]>,
): number {
  let count = 0;
  for (const req of reqs) {
    const excludedIds = new Set(excluded[req.id] ?? []);
    const includedIds = new Set(included?.[req.id] ?? []);
    for (const it of req.items) {
      if (excludedIds.has(it.id)) continue;
      if (isBuildExcluded(apps, it.project) && !includedIds.has(it.id)) count += 1;
    }
  }
  return count;
}

/**
 * 汇总统计：需求数 / 有效项目数（按轨展开后的 MR 触发数）/ 去重后构建任务数 / 跳过数 / 配置排除数。
 * skippedCount 由调用方从 collectMrTargets 结果传入。
 */
export function summarize(
  reqs: Requirement[],
  apps: DevopsApp[],
  buildPlan: BuildPlanLike,
  excluded: Record<string, string[]>,
  skippedCount: number,
  included?: Record<string, string[]>,
): BatchSummary {
  const itemCount = reqs.reduce((sum, req) => {
    const items = getBatchItems(req, excluded, apps, included).length;
    return sum + items * startedTracks(req).length;
  }, 0);
  const { builds } = collectBuildTargets(reqs, apps, buildPlan, excluded, included);
  return {
    reqCount: reqs.length,
    itemCount,
    buildCount: builds.length,
    skippedCount,
    configExcludedCount: countConfigExcluded(reqs, apps, excluded, included),
  };
}

/** 整体派生状态 → 卡片阶段分组（视觉分色用）：开发中 / 进行中（含部分上线）/ 已发布 */
export function getCardTone(overall: OverallStatus): { bg: string; border: string } {
  if (overall === '开发中') return { bg: '#F0F5FF', border: '#D6E4FF' };
  if (overall === '已发布') return { bg: '#F5F5F5', border: '#D9D9D9' };
  return { bg: '#FAF5ED', border: '#EBDFC9' };
}
