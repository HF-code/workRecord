import { useMemo, useState } from 'react';
import { App as AntdApp, Badge, Button, Card, Empty, Space, Switch, Typography, Upload } from 'antd';
import {
  BarChartOutlined,
  ImportOutlined,
  PlusOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import type { Requirement, Track } from '../types';
import { downloadJson, buildExportPayload, exportAll, findOlderThanOneMonth, parseImportFile } from '../export';
import { useDevopsApps, useBuildPlan, useRequirements } from '../hooks/useWorkTracker';
import { ALL_ENVS, TRACK_LABELS, overallStatus, trackEnvOf } from '../config/track';
import RequirementForm, { type RequirementFormValues } from '../components/RequirementForm';
import RequirementCardGrid from '../components/RequirementCardGrid';
import BuildPanel from '../components/BuildPanel';
import BatchPanel from '../components/BatchPanel';
import StatsBar from '../components/StatsBar';
import ProjectStatsModal from '../components/ProjectStatsModal';
import FilterBar, { type FilterValue } from '../components/FilterBar';
import { useBuildTasks, startBuildTask } from '../hooks/useBuildTasks';
import { getCsrfToken, buildMergeRequestUrl, type BuildEnv } from '../build';
import { getBatchItems, type BuildTarget, type MrSkipped, type MrTarget } from '../batch';
import { openInNewTab } from '../utils/openTabs';

const INITIAL_FILTER: FilterValue = {
  project: undefined,
  releaseDate: null,
  keyword: '',
  currentEnv: null,
};

/** 发版日分组结果：date = 'YYYY-MM-DD'（null 组置底） */
interface ReleaseGroup {
  date: string | null;
  reqs: Requirement[];
}

export default function RequirementListPage() {
  const { message, modal } = AntdApp.useApp();
  const {
    requirements,
    upsert,
    update,
    remove,
    removeMany,
    merge,
  } = useRequirements();
  const devopsApps = useDevopsApps();
  const buildPlan = useBuildPlan();
  const { tasks, activeCount } = useBuildTasks();

  // 常驻右侧构建面板（默认展开）
  const [buildPanelOpen, setBuildPanelOpen] = useState(true);
  // 是否显示已发布（整体派生状态 = 已发布的需求）；默认开
  const [showPublished, setShowPublished] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Requirement | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [filter, setFilter] = useState<FilterValue>(INITIAL_FILTER);

  // 批量选择状态：卡片勾选 + 面板 X 的临时排除
  const [selectedReqIds, setSelectedReqIds] = useState<Set<string>>(new Set());
  const [batchExcluded, setBatchExcluded] = useState<Record<string, string[]>>({});
  const [batchBuilding, setBatchBuilding] = useState(false);

  const filtered = useMemo(() => {
    const kw = filter.keyword.trim().toLowerCase();
    return requirements.filter((r) => {
      // 不显示已发布时，过滤掉整体派生状态为已发布的需求
      if (!showPublished && overallStatus(r) === '已发布') return false;
      if (filter.project && !r.items.some((it) => it.project === filter.project)) return false;
      if (filter.releaseDate && r.releaseDate !== filter.releaseDate) return false;
      // 已达环境筛选（任一轨当前阶段命中）
      if (
        filter.currentEnv &&
        trackEnvOf(r, 'weizan') !== filter.currentEnv &&
        trackEnvOf(r, 'star') !== filter.currentEnv
      ) {
        return false;
      }
      if (kw && !r.name.toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [requirements, filter, showPublished]);

  /** 发版日期下拉选项：全部需求已填日期去重（降序，新→旧） */
  const dateOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of requirements) if (r.releaseDate) set.add(r.releaseDate);
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [requirements]);

  /** 按发版日期分组（降序：最新发版在前；未填发版日期组置底；组内保持数据顺序） */
  const groups = useMemo<ReleaseGroup[]>(() => {
    const map = new Map<string, Requirement[]>();
    const noneList: Requirement[] = [];
    for (const r of filtered) {
      if (r.releaseDate) {
        const list = map.get(r.releaseDate) ?? [];
        list.push(r);
        map.set(r.releaseDate, list);
      } else {
        noneList.push(r);
      }
    }
    const dated = [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, reqs]) => ({ date, reqs }));
    return noneList.length > 0 ? [...dated, { date: null, reqs: noneList }] : dated;
  }, [filtered]);

  /** 批量面板基于全量选中需求（不受当前筛选影响，防"幽灵选择"） */
  const selectedReqs = useMemo(
    () => requirements.filter((r) => selectedReqIds.has(r.id)),
    [requirements, selectedReqIds],
  );

  /** 老数据已在加载时一次性静默迁移（useWorkTracker → migrateToDualTrackOnce），无需按钮 */

  /** 设置某轨当前环境（卡片环境 Select 入口；构建/MR 都作用于该环境）：
   *  切换环境时重置该轨「测试通过」标记（新环境尚未测试）。 */
  const handleSetTrackEnv = (reqId: string, track: Track, env: BuildEnv | null) => {
    const req = requirements.find((r) => r.id === reqId);
    if (!req) return;
    const patch: Partial<Requirement> =
      track === 'weizan'
        ? { envWeizan: env, testPassWeizan: false }
        : { envStar: env, testPassStar: false };
    update(reqId, patch);
    if (env == null) message.info(`【${req.name}】${TRACK_LABELS[track]}轨已重置为未开始`);
    else message.success(`【${req.name}】${TRACK_LABELS[track]}轨 → ${env}`);
  };

  /** 切换某轨「测试通过」手动标记 */
  const handleToggleTestPass = (reqId: string, track: Track, pass: boolean) => {
    update(reqId, track === 'weizan' ? { testPassWeizan: pass } : { testPassStar: pass });
  };

  /** 移除某轨（卡片 X）：该需求不走此轨发布，卡片上可「+ xx轨」恢复 */
  const handleRemoveTrack = (reqId: string, track: Track) => {
    update(
      reqId,
      track === 'weizan'
        ? { envWeizan: undefined, testPassWeizan: false }
        : { envStar: undefined, testPassStar: false },
    );
    message.info(`已移除${TRACK_LABELS[track]}轨，可在卡片上重新添加`);
  };

  /** 某轨构建（卡片）：作用于该轨当前环境 × 该需求全部项目 */
  const handleTrackBuild = async (req: Requirement, track: Track) => {
    if (!getCsrfToken()) {
      message.warning('未登录运维平台，请先登录后再构建');
      return;
    }
    const items = getBatchItems(req, {});
    if (items.length === 0) {
      message.warning('该需求未登记项目');
      return;
    }
    const env = buildPlan.getTarget(req, track);
    const buildOther = buildPlan.getBuildOther(env);
    const results = await Promise.all(
      items.map((it) => startBuildTask(req.name, it.project, env, buildOther, [req.id])),
    );
    let okCount = 0;
    const fails: string[] = [];
    let authFailed = false;
    results.forEach((r, i) => {
      const app = items[i].project;
      if (r.ok) okCount += 1;
      else if (r.status === 401 || r.status === 403) authFailed = true;
      else if (r.detail === '已取消') {
        // 用户主动取消，不额外提示
      } else fails.push(`【${app}】${r.detail}`);
    });
    if (authFailed) {
      message.error('登录态已失效，请重新登录运维平台');
      return;
    }
    if (fails.length > 0) {
      message.error(`构建失败：${fails.join('；')}`);
      if (okCount > 0) message.success(`成功触发 ${okCount} 个项目构建`);
      return;
    }
    if (okCount > 0) {
      message.success(
        `【${req.name}】${TRACK_LABELS[track]}轨已触发 ${okCount} 个项目构建（${env}）`,
      );
    }
  };

  /** 某轨提交 MR（卡片）：打开该需求全部项目到该轨当前环境的 GitLab 预填 MR 链接 */
  const handleTrackMr = (req: Requirement, track: Track) => {
    const env = buildPlan.getTarget(req, track);
    const items = getBatchItems(req, {});
    const skipped: string[] = [];
    let opened = 0;
    for (const it of items) {
      const gitUrl = devopsApps.apps.find((a) => a.app === it.project)?.gitUrl;
      if (!gitUrl) {
        skipped.push(`【${it.project}】未配置 Git 仓库地址`);
        continue;
      }
      if (!it.branch) {
        skipped.push(`【${it.project}】未填写开发分支`);
        continue;
      }
      // <a> 模拟点击打开：绕过浏览器对连续 window.open 的弹窗拦截，可全部打开
      openInNewTab(buildMergeRequestUrl(gitUrl, it.branch, env));
      opened += 1;
    }
    if (opened > 0) {
      message.success(`已打开 ${opened} 个 MR 页面（${TRACK_LABELS[track]} → ${env}）`);
    }
    if (skipped.length > 0) {
      message.warning(`已跳过：${skipped.join('；')}`);
    }
  };

  /**
   * 卡片勾选/取消（需求级批量选择）：
   * 勾选卡片 = 该需求全部项目直接进入批量范围；
   * 勾选时清空该需求的临时排除（重新勾选 = 恢复全量参与）；取消时同步清空。
   */
  const handleToggleSelect = (reqId: string, checked: boolean) => {
    if (checked) {
      setSelectedReqIds((s) => new Set(s).add(reqId));
    } else {
      setSelectedReqIds((s) => {
        const next = new Set(s);
        next.delete(reqId);
        return next;
      });
    }
    setBatchExcluded((m) => {
      if (!(reqId in m)) return m;
      const next = { ...m };
      delete next[reqId];
      return next;
    });
  };

  /**
   * 批量面板 X 掉某项目（仅本次生效，不回写数据）；
   * 若该需求有效项清零 → 自动取消其卡片勾选并清空排除（用户拍板的联动规则）。
   */
  const handleRemoveItem = (reqId: string, itemId: string) => {
    const req = requirements.find((r) => r.id === reqId);
    if (!req) return;
    setBatchExcluded((m) => {
      const next = { ...m, [reqId]: [...(m[reqId] ?? []), itemId] };
      // 判断移除后该需求是否还有参与批量的项目
      const remaining = getBatchItems(req, next).length;
      if (remaining === 0) {
        setSelectedReqIds((s) => {
          const sel = new Set(s);
          sel.delete(reqId);
          return sel;
        });
        delete next[reqId];
        message.info('该需求已无参与批量的项目，已自动取消勾选（卡片数据未改动）');
      }
      return next;
    });
  };

  const handleClearSelection = () => {
    setSelectedReqIds(new Set());
    setBatchExcluded({});
  };

  /** 批量 MR：全量打开 GitLab 预填页（<a> 模拟点击，不受弹窗拦截限制） */
  const handleBatchMr = (targets: MrTarget[], skipped: MrSkipped[]) => {
    targets.forEach((t) => openInNewTab(t.url));
    if (targets.length > 0) {
      message.success(`已打开 ${targets.length} 个 MR 页面`);
    }
    if (skipped.length > 0) {
      message.warning(`已跳过 ${skipped.length} 项：${skipped.map((s) => `【${s.project}】${s.reason}`).join('；')}`);
    }
  };

  /** 批量构建：去重后逐个并入全局构建任务队列，汇总提示（reqIds 供小灯/进度回写） */
  const handleBatchBuild = async (builds: BuildTarget[], dupCount: number) => {
    if (!getCsrfToken()) {
      message.warning('未登录运维平台，请先登录后再构建');
      return;
    }
    setBatchBuilding(true);
    try {
      // 任务名合并展示来源需求（如"需求A、需求B"），复用任务 store 的轮询/重试/取消
      const results = await Promise.all(
        builds.map((b) => startBuildTask(b.reqNames.join('、'), b.project, b.env, b.buildOther, b.reqIds)),
      );
      let okCount = 0;
      const fails: string[] = [];
      let authFailed = false;
      results.forEach((r, i) => {
        const app = builds[i].project;
        if (r.ok) {
          okCount += 1;
        } else if (r.status === 401 || r.status === 403) {
          authFailed = true;
        } else if (r.detail === '已取消') {
          // 用户主动取消，不额外提示
        } else {
          fails.push(`【${app}】${r.detail}`);
        }
      });
      if (authFailed) {
        message.error('登录态已失效，请重新登录运维平台');
        return;
      }
      if (fails.length > 0) {
        message.error(`构建失败：${fails.join('；')}`);
        if (okCount > 0) message.success(`成功触发 ${okCount} 个项目构建`);
        return;
      }
      if (okCount > 0) {
        message.success(
          `已触发 ${okCount} 个构建${dupCount > 0 ? `（合并去重 ${dupCount} 个）` : ''}，右侧面板可看进度`,
        );
      }
    } finally {
      setBatchBuilding(false);
    }
  };

  const openCreateForm = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEditForm = (req: Requirement) => {
    setEditing(req);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const handleSubmit = (values: RequirementFormValues) => {
    const isEdit = upsert(editing?.id ?? null, values);
    message.success(isEdit ? '已保存' : '登记成功');
    closeForm();
  };

  const handleDelete = (id: string) => {
    remove(id);
    // 同步清掉批量选择与临时排除/恢复，避免残留
    setSelectedReqIds((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });
    setBatchExcluded((m) => {
      if (!(id in m)) return m;
      const next = { ...m };
      delete next[id];
      return next;
    });
    message.success('已删除');
  };

  const handleExportAll = () => {
    if (requirements.length === 0) {
      message.info('暂无数据可导出');
      return;
    }
    exportAll(requirements);
    message.success('已导出全部数据');
  };

  const handleExportAndClean = () => {
    const targets = findOlderThanOneMonth(requirements);
    if (targets.length === 0) {
      message.info('无可清理数据');
      return;
    }
    modal.confirm({
      title: '导出并清理一个月前数据',
      content: `将先导出 ${targets.length} 条数据到本地文件，再从浏览器缓存中删除，删除后不可恢复（请保留好导出文件）。`,
      okText: '导出并删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        downloadJson(buildExportPayload('archive', targets));
        removeMany(new Set(targets.map((r) => r.id)));
        message.success(`已导出并清理 ${targets.length} 条数据`);
      },
    });
  };

  const handleImportFile = async (file: File) => {
    try {
      const { requirements: imported, invalidCount } = parseImportFile(await file.text());
      if (imported.length === 0) {
        message.warning(
          invalidCount > 0 ? `没有可导入的数据（${invalidCount} 条格式非法）` : '文件中没有数据',
        );
        return;
      }
      const existingIds = new Set(requirements.map((r) => r.id));
      const freshCount = imported.filter((r) => !existingIds.has(r.id)).length;
      if (freshCount === 0) {
        message.info(`${imported.length} 条数据均已存在，无需导入`);
        return;
      }
      modal.confirm({
        title: '确认导入',
        content:
          `共解析出 ${imported.length} 条有效数据` +
          (imported.length > freshCount ? `，其中 ${imported.length - freshCount} 条与现有数据重复将跳过` : '') +
          (invalidCount > 0 ? `，${invalidCount} 条格式非法被丢弃` : '') +
          `。实际导入 ${freshCount} 条。`,
        okText: '导入',
        cancelText: '取消',
        onOk: () => {
          const fresh = merge(imported);
          message.success(`已导入 ${fresh.length} 条数据`);
        },
      });
    } catch (e) {
      message.error(`导入失败：${(e as Error).message}`);
    }
  };

  /** 空态（requirements 全空 vs 筛选无匹配） */
  const emptyView = (
    <Empty
      description={
        requirements.length === 0
          ? '暂无需求，点击右上角「登记需求」开始'
          : '当前筛选无匹配需求'
      }
      style={{ padding: '48px 0' }}
    />
  );

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      {/* 左：主内容卡片（随内容区整体滚动） */}
      <Card style={{ flex: 1, minWidth: 0 }}>
        {/* 标题行：登记/导入导出/构建任务 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            marginBottom: 16,
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateForm}>
              登记需求
            </Button>
            <Upload
              accept=".json,application/json"
              showUploadList={false}
              beforeUpload={(file) => {
                void handleImportFile(file);
                return false;
              }}
            >
              <Button icon={<ImportOutlined />}>导入数据</Button>
            </Upload>
            <Button onClick={handleExportAll}>导出数据</Button>
            <Button onClick={handleExportAndClean}>导出并清理一月前数据</Button>
            <Badge count={activeCount} size="small" offset={[-2, 2]}>
              <Button
                icon={<ToolOutlined />}
                onClick={() => setBuildPanelOpen((v) => !v)}
                data-testid="build-tasks-open-button"
              >
                构建任务
              </Button>
            </Badge>
          </Space>
        </div>

        {/* 工具行：双轨环境统计（点击筛选）+ 显示已发布/统计项目 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 16,
            marginBottom: 16,
            flexWrap: 'wrap',
          }}
        >
          <StatsBar
            requirements={requirements}
            activeEnv={filter.currentEnv ?? null}
            onToggleEnv={(env) =>
              setFilter((f) => ({ ...f, currentEnv: f.currentEnv === env ? null : env }))
            }
          />
          <Space size="middle">
            <Space size="small">
              <span style={{ fontSize: 12, color: '#666' }}>显示已发布</span>
              <Switch
                size="small"
                checked={showPublished}
                onChange={setShowPublished}
                data-testid="show-published-switch"
              />
            </Space>
            <Button
              type="text"
              icon={<BarChartOutlined />}
              onClick={() => setStatsOpen(true)}
              style={{ flexShrink: 0 }}
            >
              统计项目
            </Button>
          </Space>
        </div>

        <FilterBar
          value={filter}
          onChange={setFilter}
          envOptions={ALL_ENVS}
          dateOptions={dateOptions}
          apps={devopsApps.apps}
        />

        {/* 列表区：随内容区整体滚动（批量面板吸顶由其自身 sticky 实现） */}
        <div style={{ paddingRight: 4 }}>
          {/* 批量操作区：选中需求 > 0 时显示 */}
          <BatchPanel
            reqs={selectedReqs}
            apps={devopsApps.apps}
            buildPlan={buildPlan}
            excluded={batchExcluded}
            onRemoveItem={handleRemoveItem}
            onClearSelection={handleClearSelection}
            onBatchMr={handleBatchMr}
            onBatchBuild={handleBatchBuild}
            batchBuilding={batchBuilding}
          />

          {groups.length === 0
            ? emptyView
            : groups.map((g) => (
                <div
                  key={g.date ?? '__none__'}
                  style={{
                    background: '#fafafa',
                    border: '1px solid #f0f0f0',
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 16,
                  }}
                  data-testid={`release-group-${g.date ?? 'none'}`}
                >
                  {/* 框头：发版日期 + 计数（未填组弱化） */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <Typography.Text strong style={{ fontSize: 13 }}>
                      {g.date ?? '未填发版日期'}
                    </Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {g.reqs.length} 条
                    </Typography.Text>
                    {g.date == null && (
                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                        （建议补填，便于归档整理）
                      </Typography.Text>
                    )}
                  </div>
                  <RequirementCardGrid
                    data={g.reqs}
                    selectedReqIds={selectedReqIds}
                    tasks={tasks}
                    onToggleSelect={handleToggleSelect}
                    onEdit={openEditForm}
                    onDelete={handleDelete}
                    onChangeReleaseDate={(id, releaseDate) => update(id, { releaseDate })}
                    onSetTrackEnv={handleSetTrackEnv}
                    onToggleTestPass={handleToggleTestPass}
                    onTrackBuild={(req, track) => void handleTrackBuild(req, track)}
                    onTrackMr={handleTrackMr}
                    onRemoveTrack={handleRemoveTrack}
                    onOpenBuildPanel={() => setBuildPanelOpen(true)}
                  />
                </div>
              ))}
        </div>

        <RequirementForm
          open={formOpen}
          editing={editing}
          apps={devopsApps.apps}
          onCancel={closeForm}
          onSubmit={handleSubmit}
        />

        <ProjectStatsModal
          open={statsOpen}
          requirements={filtered}
          onClose={() => setStatsOpen(false)}
        />
      </Card>

      {/* 右：常驻构建面板（与视口等高的固定列，内部各自滚动） */}
      <BuildPanel open={buildPanelOpen} onToggle={() => setBuildPanelOpen((v) => !v)} />
    </div>
  );
}
