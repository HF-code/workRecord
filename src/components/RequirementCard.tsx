/**
 * 需求卡片：单需求的配置与操作单元（列表视图，按发版日分组展示）。
 * 结构：头部（勾选 + 需求名外链 + 版本 Tag + 构建小灯 + ⋯菜单）
 *      → 双轨区（微赞/星享各一块：当前环境 + 测试通过 + 构建/提交MR；
 *        每块可 X 移除该轨，移除后可点「+ xx轨」恢复为未开始）
 *      → 发版时间 / 备注
 *      → 项目区（项目 + 分支，超 4 个折叠）。
 * 卡片背景按整体派生状态分色（开发中/进行中/已发布），选中态黑描边。
 * 构建/MR 按轨操作：作用于该轨当前环境，覆盖该需求全部项目。
 * 构建小灯：按全局构建任务（reqIds 命中本需求）显示 进行中/失败/成功 圆点，点击展开右侧面板。
 */
import { useState } from 'react';
import { App as AntdApp, Button, Checkbox, DatePicker, Dropdown, Select, Tag, Tooltip } from 'antd';
import { CloseOutlined, ExportOutlined, MoreOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { MenuProps } from 'antd';
import type { Requirement, Track } from '../types';
import { buildLightLevel, getBuildLight } from '../utils/buildLight';
import {
  CLUSTER_COLOR,
  TRACK_ENVS,
  TRACK_LABELS,
  isTrackOnline,
  overallStatus,
  trackEnvOf,
  trackStatus,
} from '../config/track';
import { getCardTone } from '../batch';

interface Props {
  req: Requirement;
  /** 批量勾选态（卡片黑色描边） */
  selected: boolean;
  /** 全局构建任务（构建小灯数据源） */
  tasks: import('../hooks/useBuildTasks').BuildTask[];
  onToggleSelect: (reqId: string, checked: boolean) => void;
  onEdit: (req: Requirement) => void;
  onDelete: (id: string) => void;
  onChangeReleaseDate: (id: string, date: string | null) => void;
  /** 设置某轨当前环境（null = 重置为未开始）；构建与 MR 都作用于该环境 */
  onSetTrackEnv: (reqId: string, track: Track, env: import('../build').BuildEnv | null) => void;
  /** 切换某轨「测试通过」手动标记 */
  onToggleTestPass: (reqId: string, track: Track, pass: boolean) => void;
  /** 某轨构建（作用于该轨当前环境 × 该需求全部项目） */
  onTrackBuild: (req: Requirement, track: Track) => void;
  /** 某轨提交 MR（作用于该轨当前环境 × 该需求全部项目） */
  onTrackMr: (req: Requirement, track: Track) => void;
  /** 移除某轨（该需求不走此轨发布，卡片上可再添加回来） */
  onRemoveTrack: (reqId: string, track: Track) => void;
  /** 点击构建小灯：展开右侧构建面板 */
  onOpenBuildPanel: () => void;
}

/** 项目超过该数量时折叠，避免卡片高度失控 */
const COLLAPSE_LIMIT = 4;

/** 双轨顺序：微赞在前，星享在后 */
const TRACKS: Track[] = ['weizan', 'star'];

export default function RequirementCard({
  req,
  selected,
  tasks,
  onToggleSelect,
  onEdit,
  onDelete,
  onChangeReleaseDate,
  onSetTrackEnv,
  onToggleTestPass,
  onTrackBuild,
  onTrackMr,
  onRemoveTrack,
  onOpenBuildPanel,
}: Props) {
  const { modal } = AntdApp.useApp();
  const [expanded, setExpanded] = useState(false);
  // 某轨构建请求进行中（防双击），值为轨名或 null
  const [pendingTrack, setPendingTrack] = useState<Track | null>(null);

  const light = getBuildLight(tasks, req.id);
  const lightLevel = buildLightLevel(light);
  const visibleItems = expanded ? req.items : req.items.slice(0, COLLAPSE_LIMIT);
  const tone = getCardTone(overallStatus(req));

  /** ⋯ 菜单：编辑 / 删除（删除走确认弹窗） */
  const actionMenu: MenuProps['items'] = [
    { key: 'edit', label: '编辑', onClick: () => onEdit(req) },
    {
      key: 'delete',
      label: '删除',
      danger: true,
      onClick: () => {
        modal.confirm({
          title: '确认删除该需求？',
          content: '删除后不可恢复',
          okText: '删除',
          cancelText: '取消',
          okButtonProps: { danger: true },
          onOk: () => onDelete(req.id),
        });
      },
    },
  ];

  /** 单轨操作触发（构建/MR 共用防双击锁） */
  const runTrackAction = (track: Track, fn: () => void) => {
    if (pendingTrack) return;
    setPendingTrack(track);
    // 页面层处理器同步发起任务（消息提示即时返回），此处下一帧解锁
    setTimeout(() => setPendingTrack(null), 600);
    fn();
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 12,
        // 阶段分色背景；选中态黑描边 + 轻抬升阴影（层级由描边承担）
        background: tone.bg,
        borderRadius: 8,
        border: selected ? '1.5px solid #1F1F1F' : `1px solid ${tone.border}`,
        boxShadow: selected ? '0 2px 8px rgba(0,0,0,0.10)' : 'none',
      }}
    >
      {/* 头部：勾选 + 名称 + 版本 + 小灯 + ⋯ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Checkbox
          checked={selected}
          onChange={(e) => onToggleSelect(req.id, e.target.checked)}
          data-testid={`card-select-checkbox-${req.id}`}
        />
        <a
          href={req.tapdUrl}
          target="_blank"
          rel="noreferrer"
          style={{ flex: 1, minWidth: 0, fontWeight: 600, wordBreak: 'break-all', lineHeight: '20px' }}
        >
          {req.name} <ExportOutlined style={{ fontSize: 12 }} />
        </a>
        <Tag style={{ marginInlineEnd: 0, fontSize: 12, lineHeight: '18px', flexShrink: 0 }}>
          {req.version ?? '大版'}
        </Tag>
        {lightLevel && (
          <Tooltip title={lightLevel.title}>
            <span
              onClick={onOpenBuildPanel}
              style={{
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                cursor: 'pointer',
                fontSize: 11,
                color: lightLevel.color,
              }}
              data-testid={`card-build-light-${req.id}`}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: lightLevel.color }} />
              {lightLevel.count}
            </span>
          </Tooltip>
        )}
        <Dropdown menu={{ items: actionMenu }} trigger={['click']}>
          <Button type="text" size="small" icon={<MoreOutlined />} style={{ flexShrink: 0 }} />
        </Dropdown>
      </div>

      {/* 双轨区：每轨一块（状态行 + 操作行）；undefined = 该轨已移除不显示 */}
      {TRACKS.filter((t) => (t === 'weizan' ? req.envWeizan : req.envStar) !== undefined).map((track) => {
        const env = trackEnvOf(req, track);
        const testPass = track === 'weizan' ? req.testPassWeizan : req.testPassStar;
        const statusView = trackStatus(track, env, testPass);
        const online = isTrackOnline(req, track);
        const cluster = track === 'weizan' ? '微赞' : '星享';
        return (
          <div
            key={track}
            style={{
              background: '#fafafa',
              border: '1px solid #f0f0f0',
              borderRadius: 6,
              padding: '6px 8px',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
            data-testid={`card-track-${track}-${req.id}`}
          >
            {/* 状态行：轨色点 + 轨名 + 派生状态 + 测试通过 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: CLUSTER_COLOR[cluster as '微赞' | '星享'],
                  flexShrink: 0,
                }}
                title={cluster}
              />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#333' }}>{TRACK_LABELS[track]}</span>
              {statusView ? (
                <Tag color={statusView.color} style={{ marginInlineEnd: 0, fontSize: 11, lineHeight: '16px' }}>
                  {statusView.label}
                </Tag>
              ) : (
                <span style={{ fontSize: 11, color: '#bbb' }}>未开始</span>
              )}
              <Tooltip title={online ? '已上线，无需标记' : '测试同学确认当前阶段测试通过'}>
                <Checkbox
                  checked={!!testPass}
                  disabled={env == null || online}
                  onChange={(e) => onToggleTestPass(req.id, track, e.target.checked)}
                  style={{ marginLeft: 'auto', fontSize: 12, color: '#666' }}
                  data-testid={`card-track-testpass-${track}-${req.id}`}
                >
                  测试通过
                </Checkbox>
              </Tooltip>
              <Tooltip title="移除该轨（该需求不走此轨发布，可在下方重新添加）">
                <Button
                  type="text"
                  size="small"
                  icon={<CloseOutlined style={{ fontSize: 10, color: '#999' }} />}
                  onClick={() => onRemoveTrack(req.id, track)}
                  style={{ flexShrink: 0, width: 20, height: 20, minWidth: 20, padding: 0 }}
                  data-testid={`card-track-remove-${track}-${req.id}`}
                />
              </Tooltip>
            </div>
            {/* 操作行：当前环境 + 构建 + 提交MR（构建/MR 都作用于当前环境） */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Tooltip title="该轨当前环境：构建与提交 MR 都作用于此环境">
                <Select
                  size="small"
                  style={{ width: 112 }}
                  value={env ?? undefined}
                  placeholder="未开始"
                  allowClear
                  onChange={(v) => onSetTrackEnv(req.id, track, (v as import('../build').BuildEnv) ?? null)}
                  options={TRACK_ENVS[track].map((e) => ({ label: e, value: e }))}
                  data-testid={`card-track-env-select-${track}-${req.id}`}
                />
              </Tooltip>
              <Button
                size="small"
                type="primary"
                loading={pendingTrack === track}
                disabled={pendingTrack !== null && pendingTrack !== track}
                onClick={() => runTrackAction(track, () => onTrackBuild(req, track))}
                data-testid={`card-track-build-${track}-${req.id}`}
              >
                构建
              </Button>
              <Button
                size="small"
                disabled={pendingTrack !== null}
                onClick={() => runTrackAction(track, () => onTrackMr(req, track))}
                data-testid={`card-track-mr-${track}-${req.id}`}
              >
                提交MR
              </Button>
            </div>
          </div>
        );
      })}

      {/* 已移除的轨：可重新添加（恢复为未开始态） */}
      {TRACKS.filter((t) => (t === 'weizan' ? req.envWeizan : req.envStar) === undefined).length > 0 && (
        <div style={{ display: 'flex', gap: 8 }}>
          {TRACKS.filter((t) => (t === 'weizan' ? req.envWeizan : req.envStar) === undefined).map((track) => (
            <Button
              key={track}
              size="small"
              type="dashed"
              onClick={() => onSetTrackEnv(req.id, track, null)}
              style={{ fontSize: 12 }}
              data-testid={`card-track-add-${track}-${req.id}`}
            >
              + {TRACK_LABELS[track]}轨
            </Button>
          ))}
        </div>
      )}

      {/* 发版时间 + 备注 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <DatePicker
          size="small"
          allowClear
          value={req.releaseDate ? dayjs(req.releaseDate) : null}
          onChange={(d) => onChangeReleaseDate(req.id, d ? d.format('YYYY-MM-DD') : null)}
          placeholder="发版日期"
          style={{ width: 132 }}
        />
      </div>
      {req.remark ? (
        <div style={{ fontSize: 12, color: '#888', lineHeight: '18px', wordBreak: 'break-all' }}>
          {req.remark}
        </div>
      ) : null}

      {/* 项目区：项目名 + 分支；超限折叠 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {visibleItems.map((it) => {
          return (
            <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, flexShrink: 0 }}>{it.project}</span>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 12,
                  color: '#888',
                  fontFamily: 'monospace',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={it.branch}
              >
                {it.branch}
              </span>
            </div>
          );
        })}
        {req.items.length > COLLAPSE_LIMIT && (
          <Button
            type="link"
            size="small"
            style={{ alignSelf: 'flex-start', padding: 0, height: 'auto', fontSize: 12 }}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? '收起' : `展开全部（${req.items.length}）`}
          </Button>
        )}
      </div>
    </div>
  );
}
