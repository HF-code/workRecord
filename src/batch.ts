/**
 * 批量操作纯函数：MR 目标汇总、构建目标去重（project+env）与统计。
 *
 * 数据模型约定（双轨并行，见 docs/plans/dual-track-rework-plan.md）：
 * - 勾选卡片 = 该需求**全部项目**直接进入批量范围（构建/MR 不再受项目配置「不参与构建」影响，代码都要合）；
 * - 临时排除：excluded[reqId] = 被用户在批量面板 X 掉的 itemId 列表（仅会话内，不回写数据）；
 * - 双轨：批量构建/MR 按需求的**已开始轨**逐轨展开，每轨作用于该轨当前环境。
 */
import type { OverallStatus, Requirement, ProjectBranch, Track } from './types';
import type { DevopsApp } from './config/devopsApps';
import { buildMergeRequestUrl, type BuildEnv } from './build';
import { startedTracks, TRACK_LABELS } from './config/track';

/** 构建计划依赖的最小接口（按轨取作用环境 + 构建命令） */
export interface BuildPlanLike {
  /** 取某需求某轨构建/MR 作用的环境（= 该轨当前环境） */
  getTarget: (req: Requirement, track: Track) => BuildEnv;
  /** 取构建命令（运维平台 build_other 字段），缺省等于环境本身 */
  getBuildOther: (env: BuildEnv) => string;
}

/** 完整构建计划（useBuildPlan 返回值中 UI 需要的部分） */
export type BuildPlan = BuildPlanLike;

/** 一条可触发的 MR 目标（需求 × 轨 × 项目，不去重） */
export interface MrTarget {
  reqId: string;
  reqName: string;
  track: Track;
  itemId: string;
  project: string;
  /** 开发分支（MR 源分支） */
  branch: string;
  /** 目标分支（MR target，= 该轨当前环境） */
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
  /** 项目实例总数（= MR 触发数，不去重，按轨展开） */
  itemCount: number;
  /** 去重后的构建任务数 */
  buildCount: number;
  /** 因缺 gitUrl/分支被跳过的 MR 项数 */
  skippedCount: number;
}

/**
 * 取某需求的批量项目：全部项目 − excluded（用户 X 掉的）。
 * 不再受项目配置「不参与构建」影响——构建与 MR 覆盖全部项目（代码都要合）。
 */
export function getBatchItems(req: Requirement, excluded: Record<string, string[]>): ProjectBranch[] {
  const excludedIds = new Set(excluded[req.id] ?? []);
  return req.items.filter((it) => !excludedIds.has(it.id));
}

/**
 * MR 目标汇总：对每个需求的**已开始轨 × 全部项目**生成 GitLab 预填链接（不去重）。
 * 缺 gitUrl / 未填开发分支的项归入 skipped 并给出原因。
 */
export function collectMrTargets(
  reqs: Requirement[],
  apps: DevopsApp[],
  buildPlan: BuildPlanLike,
  excluded: Record<string, string[]>,
): { targets: MrTarget[]; skipped: MrSkipped[] } {
  const targets: MrTarget[] = [];
  const skipped: MrSkipped[] = [];
  for (const req of reqs) {
    for (const track of startedTracks(req)) {
      const env = buildPlan.getTarget(req, track);
      for (const it of getBatchItems(req, excluded)) {
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
 * 同项目同环境只构建一次，reqNames/reqIds 合并用于构建任务名展示与需求进度回写。
 * dupCount = 项目实例数 − 构建目标数（即被合并掉的次数）。
 */
export function collectBuildTargets(
  reqs: Requirement[],
  buildPlan: BuildPlanLike,
  excluded: Record<string, string[]>,
): { builds: BuildTarget[]; dupCount: number } {
  const map = new Map<string, BuildTarget>();
  let itemCount = 0;
  for (const req of reqs) {
    for (const track of startedTracks(req)) {
      const env = buildPlan.getTarget(req, track);
      const buildOther = buildPlan.getBuildOther(env);
      for (const it of getBatchItems(req, excluded)) {
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

/**
 * 汇总统计：需求数 / 项目数（按轨展开后的 MR 触发数）/ 去重后构建任务数 / 跳过数。
 * skippedCount 由调用方从 collectMrTargets 结果传入。
 */
export function summarize(
  reqs: Requirement[],
  buildPlan: BuildPlanLike,
  excluded: Record<string, string[]>,
  skippedCount: number,
): BatchSummary {
  const itemCount = reqs.reduce((sum, req) => {
    const items = getBatchItems(req, excluded).length;
    return sum + items * startedTracks(req).length;
  }, 0);
  const { builds } = collectBuildTargets(reqs, buildPlan, excluded);
  return {
    reqCount: reqs.length,
    itemCount,
    buildCount: builds.length,
    skippedCount,
  };
}

/** 整体派生状态 → 卡片阶段分组（视觉分色用）：开发中 / 进行中（含部分上线）/ 已发布 */
export function getCardTone(overall: OverallStatus): { bg: string; border: string } {
  if (overall === '开发中') return { bg: '#F0F5FF', border: '#D6E4FF' };
  if (overall === '已发布') return { bg: '#F5F5F5', border: '#D9D9D9' };
  return { bg: '#FAF5ED', border: '#EBDFC9' };
}
