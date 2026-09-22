/**
 * 批量操作纯函数：MR 目标汇总、构建目标去重（project+env）与统计。
 *
 * 数据模型约定（双轨并行，见 docs/plans/dual-track-rework-plan.md）：
 * - 勾选卡片 = 该需求**全部项目**直接进入批量范围；
 * - **构建口径**（卡片构建 / 批量构建）：全部项目 − 临时排除 − 配置「不参与构建」（`excludeFromBuild`），
 *   见 getBuildItems()——项目配置页的开关只对构建生效（如固定不单独构建的小程序）；
 * - **MR 口径**（卡片提交MR / 批量MR）：全部项目 − 临时排除，**不受「不参与构建」影响**（代码都要合），
 *   见 getMrItems()；
 * - 临时排除：excluded[reqId] = 被用户在批量面板 X 掉的 itemId 列表（仅会话内，不回写数据）；
 * - 双轨：批量构建/MR 按需求的**已开始轨**逐轨展开，每轨作用于该轨当前环境。
 *
 * ⚠️ 改动纪律（踩过坑，勿再合并）：构建与 MR 的「项目范围」**必须各走各的函数**
 * （getBuildItems / getMrItems）。历史教训：两者曾共用同一个范围函数（旧名 getBatchItems，
 * 已改名废弃），过滤逻辑写在里面，导致「不参与构建」连坐 MR；后来为修 MR 把过滤整体删掉，
 * 又反噬构建。任何一侧要增删范围条件，只改自己那条链路的函数，禁止塞进另一侧或重新合并。
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
 * 取某需求的 **MR / 展示口径**项目：全部项目 − excluded（用户 X 掉的）。
 * 不受项目配置「不参与构建」影响——提交 MR 覆盖全部项目（代码都要合）。
 * 仅供 MR 与纯展示使用；**构建范围请用 getBuildItems()**，勿在此处加任何构建相关过滤。
 */
export function getMrItems(req: Requirement, excluded: Record<string, string[]>): ProjectBranch[] {
  const excludedIds = new Set(excluded[req.id] ?? []);
  return req.items.filter((it) => !excludedIds.has(it.id));
}

/**
 * 项目是否被配置为「不参与构建」（项目配置页开关，如固定不单独构建的小程序）。
 * ⚠️ 只允许**构建链路**（getBuildItems / collectBuildExcludedProjects）与纯展示调用；
 * getMrItems() 及其下游（collectMrTargets、handleTrackMr）禁止调用——否则 MR 会再次被连坐。
 */
export function isBuildExcluded(project: string, apps: DevopsApp[]): boolean {
  return apps.some((a) => a.app === project && a.excludeFromBuild);
}

/**
 * 取某需求的**构建**项目：全部项目 − 临时排除 − 配置「不参与构建」。
 * 与 getMrItems() 的唯一差异就是配置排除项——构建尊重配置，MR 不尊重。
 */
export function getBuildItems(
  req: Requirement,
  apps: DevopsApp[],
  excluded: Record<string, string[]>,
): ProjectBranch[] {
  return getMrItems(req, excluded).filter((it) => !isBuildExcluded(it.project, apps));
}

/**
 * 逐个需求取被配置「不参与构建」而排除出构建范围的项目名（保序去重，提示文案用）。
 * 只统计实际参与本次批量的项目（已按临时排除过滤）。
 */
export function collectBuildExcludedProjects(
  reqs: Requirement[],
  apps: DevopsApp[],
  excluded: Record<string, string[]>,
): string[] {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const req of reqs) {
    for (const it of getMrItems(req, excluded)) {
      if (isBuildExcluded(it.project, apps) && !seen.has(it.project)) {
        seen.add(it.project);
        list.push(it.project);
      }
    }
  }
  return list;
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
      for (const it of getMrItems(req, excluded)) {
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
 * 项目范围走 getBuildItems()：配置「不参与构建」的项目在此被剔除（MR 不受影响）。
 * dupCount = 项目实例数 − 构建目标数（即被合并掉的次数）。
 */
export function collectBuildTargets(
  reqs: Requirement[],
  apps: DevopsApp[],
  buildPlan: BuildPlanLike,
  excluded: Record<string, string[]>,
): { builds: BuildTarget[]; dupCount: number } {
  const map = new Map<string, BuildTarget>();
  let itemCount = 0;
  for (const req of reqs) {
    for (const track of startedTracks(req)) {
      const env = buildPlan.getTarget(req, track);
      const buildOther = buildPlan.getBuildOther(env);
      for (const it of getBuildItems(req, apps, excluded)) {
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
 * 汇总统计：需求数 / 项目数（按轨展开后的 MR 触发数，含「不参与构建」的项目）/
 * 去重后构建任务数（已按配置剔除「不参与构建」项目）/ 跳过数。
 * skippedCount 由调用方从 collectMrTargets 结果传入。
 */
export function summarize(
  reqs: Requirement[],
  apps: DevopsApp[],
  buildPlan: BuildPlanLike,
  excluded: Record<string, string[]>,
  skippedCount: number,
): BatchSummary {
  const itemCount = reqs.reduce((sum, req) => {
    const items = getMrItems(req, excluded).length;
    return sum + items * startedTracks(req).length;
  }, 0);
  const { builds } = collectBuildTargets(reqs, apps, buildPlan, excluded);
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
