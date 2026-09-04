/**
 * 快速批量构建 Drawer（临时工具，不进入需求列表）：
 * 每次「添加」录入的一批形成一个独立小框（便于看出每一波/每个人发了什么），
 * 上方构建清单为全部有效批次的汇总（自动去重）。
 * 批次内项目可 X 单独删除；批次可整体「从汇总去除」（灰显保留，可恢复）；
 * 统一选择目标分支；一键批量构建（复用全局构建任务队列）。
 * 状态（batches + env）localStorage 持久化，跨刷新/分时段收集不丢，「清空」重置。
 */
import { useEffect, useMemo, useState } from 'react';
import { App as AntdApp, Button, Drawer, Empty, Input, Popconfirm, Select, Space, Tag, Tooltip, Typography } from 'antd';
import { CopyOutlined, WarningOutlined } from '@ant-design/icons';
import type { DevopsApp } from '../config/devopsApps';
import type { BranchConfig } from '../config/branches';
import { getDefaultBranch } from '../config/branches';
import { getCsrfToken, type BuildEnv } from '../build';
import { startBuildTask } from '../hooks/useBuildTasks';

interface Props {
  open: boolean;
  onClose: () => void;
  branches: BranchConfig[];
  apps: DevopsApp[];
}

/** localStorage 持久化 key（多波收集跨时段保留） */
const STORAGE_KEY = 'work-tracker-quick-build';

/** 一次录入形成的批次（忠实记录该波内容，含与其他批次重复的项目） */
interface QuickBatch {
  id: string;
  /** 录入时间（展示用） */
  createdAt: string;
  /** 该批录入的项目名 */
  projects: string[];
  /** 是否整体排除出汇总（灰显保留，可恢复） */
  excluded: boolean;
}

/** 持久化结构：批次列表 + 统一目标分支 */
interface QuickBuildState {
  batches: QuickBatch[];
  env: BuildEnv;
}

/** 从 localStorage 读取，失败/不存在返回 null（env 缺省由调用方取系统默认分支） */
function loadState(): QuickBuildState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<QuickBuildState> & { projects?: unknown };
    const batches = Array.isArray(parsed.batches)
      ? parsed.batches.filter(
          (b): b is QuickBatch =>
            !!b && typeof b.id === 'string' && Array.isArray(b.projects) &&
            b.projects.every((p) => typeof p === 'string'),
        )
      : [];
    // 旧版扁平 projects 列表迁移为第一个批次，刷新不丢已收集内容
    if (batches.length === 0 && Array.isArray(parsed.projects)) {
      const legacy = parsed.projects.filter((p): p is string => typeof p === 'string' && p.length > 0);
      if (legacy.length > 0) {
        batches.push({ id: `qb-legacy`, createdAt: '历史录入', projects: legacy, excluded: false });
      }
    }
    return {
      batches,
      env: typeof parsed.env === 'string' ? parsed.env : '',
    };
  } catch {
    return null;
  }
}

/** 写入 localStorage（静默失败，持久化仅是增强） */
function saveState(state: QuickBuildState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 忽略存储异常（如隐私模式）
  }
}

/** 删除持久化数据（「清空」时调用） */
function clearState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 忽略
  }
}

/**
 * 解析粘贴文本为项目名列表：
 * 按换行/逗号（中英）/分号（中英）/顿号/Tab/空格分割 → 去除尾部 `【分支】`/`[分支]` 上报标记
 * → trim → 滤空 → 保序去重。
 */
export function parseProjectNames(text: string): string[] {
  const parts = text
    .split(/[\n,，;；、\t ]+/)
    .map((s) => s.trim().replace(/(【[^】]*】|\[[^\]]*\])+$/, '').trim())
    .filter(Boolean);
  return [...new Set(parts)];
}

export default function QuickBuildDrawer({ open, onClose, branches, apps }: Props) {
  const { message } = AntdApp.useApp();
  const defaultEnv = getDefaultBranch(branches);

  // 恢复持久化状态（env 为空串时回退默认分支）
  const restored = loadState();
  const [batches, setBatches] = useState<QuickBatch[]>(restored?.batches ?? []);
  const [env, setEnv] = useState<BuildEnv>(restored?.env || defaultEnv);
  const [input, setInput] = useState('');
  const [building, setBuilding] = useState(false);

  // 状态变化即持久化（录入/X/排除/清空/切分支）
  useEffect(() => {
    saveState({ batches, env });
  }, [batches, env]);

  /** 汇总清单：全部未排除批次的项目并集（保序去重），构建/复制均基于此 */
  const summary = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const b of batches) {
      if (b.excluded) continue;
      for (const p of b.projects) {
        if (!seen.has(p)) {
          seen.add(p);
          list.push(p);
        }
      }
    }
    return list;
  }, [batches]);

  /** 录入一批：解析输入 → 新批次小框（忠实记录本波内容，与其他批次重复也保留） */
  const handleAdd = () => {
    const parsed = parseProjectNames(input);
    if (parsed.length === 0) {
      message.info('未识别到项目名');
      return;
    }
    setBatches((list) => [
      ...list,
      { id: `qb-${Date.now()}`, createdAt: new Date().toLocaleTimeString('zh-CN'), projects: parsed, excluded: false },
    ]);
    setInput('');
    message.success(`已录入本批 ${parsed.length} 项`);
  };

  /** 手动添加（可多选）：所选项目作为一个批次 */
  const handleManualAdd = (selected: string[]) => {
    if (selected.length === 0) return;
    setBatches((list) => [
      ...list,
      {
        id: `qb-${Date.now()}`,
        createdAt: new Date().toLocaleTimeString('zh-CN'),
        projects: [...new Set(selected)],
        excluded: false,
      },
    ]);
    message.success(`已录入本批 ${selected.length} 项`);
  };

  /** 批次内删除单个项目（汇总随之减少；批空则小框消失） */
  const removeBatchProject = (batchId: string, project: string) => {
    setBatches((list) =>
      list
        .map((b) => (b.id === batchId ? { ...b, projects: b.projects.filter((p) => p !== project) } : b))
        .filter((b) => b.projects.length > 0),
    );
  };

  /** 批次整体从汇总去除/恢复（小框灰显保留，便于回看每个人发了什么） */
  const toggleBatchExcluded = (batchId: string) => {
    setBatches((list) =>
      list.map((b) => (b.id === batchId ? { ...b, excluded: !b.excluded } : b)),
    );
  };

  /** 清空：批次 + 持久化一并重置 */
  const handleClear = () => {
    setBatches([]);
    clearState();
    message.success('已清空');
  };

  /** 复制汇总清单：逐行 `项目名【目标分支】` */
  const handleCopy = async () => {
    if (summary.length === 0) return;
    const text = summary.map((p) => `${p}【${env}】`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      message.success(`已复制 ${summary.length} 条构建目标`);
    } catch {
      message.error('复制失败，请手动选择清单内容复制');
    }
  };

  /** 批量构建：csrf 前置校验 → 逐项目并入全局任务队列 → 汇总提示 */
  const handleBuild = async () => {
    if (summary.length === 0) {
      message.warning('汇总为空，请先录入项目');
      return;
    }
    if (!getCsrfToken()) {
      message.warning('未登录运维平台，请先登录后再构建');
      return;
    }
    setBuilding(true);
    try {
      // reqName 用项目名自身，构建任务 Drawer 中可读
      const results = await Promise.all(summary.map((p) => startBuildTask(p, p, env)));
      let okCount = 0;
      const fails: string[] = [];
      let authFailed = false;
      results.forEach((r, i) => {
        if (r.ok) {
          okCount += 1;
        } else if (r.status === 401 || r.status === 403) {
          authFailed = true;
        } else if (r.detail === '已取消') {
          // 用户主动取消，不额外提示
        } else {
          fails.push(`【${summary[i]}】${r.detail}`);
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
        message.success(`已触发 ${okCount} 个项目构建，可在「构建任务」查看进度`);
      }
    } finally {
      setBuilding(false);
    }
  };

  /** 未知项目检测：不在运维平台应用名单（名单可能过期，仅警示不阻断） */
  const isUnknown = (project: string) => !apps.some((a) => a.app === project);

  const excludedCount = batches.filter((b) => b.excluded).length;

  return (
    <Drawer title="快速批量构建" open={open} onClose={onClose} width={760}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {/* 输入区：粘贴项目名，每次录入成一批 */}
        <div>
          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
            粘贴项目名（支持换行 / 逗号 / 顿号 / 分号 / 空格分隔，自动去除【分支】标记），每次录入形成独立小框，汇总自动去重
          </Typography.Text>
          <Input.TextArea
            rows={4}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={'例如：\nvzanlivemobile【pre】\ncustomerservice、live-h5-2\nlive-mini-program'}
          />
          <Button type="primary" block style={{ marginTop: 8 }} onClick={handleAdd}>
            录入本批
          </Button>
        </div>

        {/* 手动添加 + 分支选择 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Typography.Text strong style={{ flexShrink: 0 }}>
            手动添加：
          </Typography.Text>
          <Select
            mode="multiple"
            showSearch
            allowClear
            placeholder="搜索并选择项目（可多选，作为一个批次）"
            value={[]}
            onChange={(vals) => vals.length > 0 && handleManualAdd(vals)}
            filterOption={(inputValue, option) =>
              String(option?.label ?? '').toLowerCase().includes(inputValue.toLowerCase())
            }
            options={apps.map((a) => ({
              label: a.alias ? `${a.app}（${a.alias}）` : a.app,
              value: a.app,
            }))}
            style={{ flex: 1, minWidth: 200 }}
          />
          <Typography.Text strong style={{ flexShrink: 0 }}>
            目标分支：
          </Typography.Text>
          <Select
            size="small"
            value={env}
            onChange={setEnv}
            options={branches.map((b) => ({ label: b.label, value: b.value }))}
            style={{ width: 140, flexShrink: 0 }}
          />
        </div>

        {batches.length === 0 ? (
          <Empty description="暂无录入，粘贴或手动添加后每批一个小框展示" style={{ padding: '24px 0' }} />
        ) : (
          <>
            {/* 统计行 + 清空 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography.Text strong>
                共 {batches.length} 批{excludedCount > 0 ? `（${excludedCount} 批未计入汇总）` : ''} · 汇总 {summary.length} 个项目 · {summary.length} 个构建任务
              </Typography.Text>
              <Popconfirm
                title="确认清空全部批次？"
                okText="清空"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                onConfirm={handleClear}
              >
                <Button type="text" danger size="small">
                  清空
                </Button>
              </Popconfirm>
            </div>

            {/* 构建清单汇总（上）：全部有效批次的去重并集 */}
            <div
              style={{
                background: '#fff',
                borderRadius: 6,
                border: '1px solid #e5e5e5',
                padding: '8px 10px',
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  marginBottom: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span>
                  构建清单 <span style={{ color: '#666', fontWeight: 400 }}>（{summary.length}，已去重）</span>
                </span>
                <Tooltip title="复制全部构建目标（项目名【分支名】）">
                  <Button
                    type="text"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => void handleCopy()}
                  />
                </Tooltip>
              </div>
              <div
                style={{
                  maxHeight: 200,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                {summary.length === 0 ? (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    全部批次已排除，无汇总项
                  </Typography.Text>
                ) : (
                  summary.map((p) => (
                    <div
                      key={p}
                      style={{ fontSize: 12, lineHeight: '20px', display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      <span style={{ fontWeight: 600 }}>{p}</span>
                      <span>→ {env}</span>
                      {isUnknown(p) && (
                        <Tooltip title="运维平台未找到该项目，请确认名称（仍可尝试构建）">
                          <WarningOutlined style={{ color: '#fa8c16', fontSize: 12 }} />
                        </Tooltip>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 批次小框（下）：每次录入一批一个框，行可 X 删除，可整体从汇总去除/恢复 */}
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              {batches.map((batch, idx) => (
                <div
                  key={batch.id}
                  style={{
                    background: '#fafafa',
                    borderRadius: 6,
                    border: `1px solid ${batch.excluded ? '#f0f0f0' : '#e5e5e5'}`,
                    padding: '6px 10px',
                    opacity: batch.excluded ? 0.6 : 1,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 6,
                    }}
                  >
                    <span style={{ fontSize: 12, color: '#888' }}>
                      第 {idx + 1} 批 · {batch.createdAt} · {batch.projects.length} 项
                      {batch.excluded ? '（未计入汇总）' : ''}
                    </span>
                    <Button
                      type="link"
                      size="small"
                      danger={!batch.excluded}
                      onClick={() => toggleBatchExcluded(batch.id)}
                    >
                      {batch.excluded ? '恢复到汇总' : '从汇总去除'}
                    </Button>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {batch.projects.map((p) => (
                      <Tag
                        key={p}
                        closable
                        onClose={(e) => {
                          // 阻止默认隐藏，由状态驱动
                          e.preventDefault();
                          removeBatchProject(batch.id, p);
                        }}
                        style={{ marginInlineEnd: 0, fontSize: 12 }}
                      >
                        {p}
                      </Tag>
                    ))}
                  </div>
                </div>
              ))}
            </Space>

            {/* 批量构建：作用于汇总 */}
            <Button type="primary" block loading={building} disabled={summary.length === 0} onClick={() => void handleBuild()}>
              批量构建（{summary.length}）
            </Button>
          </>
        )}
      </Space>
    </Drawer>
  );
}
