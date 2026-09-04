/**
 * 需求卡片：单需求的配置与操作单元。
 * 结构：头部（勾选 + 拖拽把手 + 需求名外链 + 版本 Tag + ⋯菜单）
 *      → 中部（状态 / 发版时间 / 备注）
 *      → 项目区（会话态子勾选 + 分支 + 单项 MR 图标，超 4 个折叠）
 *      → 底部（env 选择 + 构建 + 提交MR）。
 * 卡片背景按状态阶段分色（开发中/进行中/发布后），选中态黑描边。
 * 子勾选仅决定单卡 构建/MR 的作用范围，纯会话态：默认全不勾、不持久化、刷新即失。
 */
import { useState } from 'react';
import { App as AntdApp, Button, Checkbox, DatePicker, Dropdown, Select, Tag, Tooltip } from 'antd';
import {
  DownOutlined,
  ExportOutlined,
  HolderOutlined,
  MergeOutlined,
  MoreOutlined,
} from '@ant-design/icons';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import dayjs from 'dayjs';
import type { MenuProps } from 'antd';
import { STATUSES, STATUS_COLORS, type Requirement, type Status } from '../types';
import type { DevopsApp } from '../config/devopsApps';
import type { BranchConfig } from '../config/branches';
import { buildMergeRequestUrl, getCsrfToken, type BuildEnv } from '../build';
import { startBuildTask } from '../hooks/useBuildTasks';
import { getCardTone, type BuildPlan } from '../batch';

interface Props {
  req: Requirement;
  apps: DevopsApp[];
  branches: BranchConfig[];
  buildPlan: BuildPlan;
  /** 批量勾选态（卡片黑色描边） */
  selected: boolean;
  onToggleSelect: (reqId: string, checked: boolean) => void;
  onEdit: (req: Requirement) => void;
  onDelete: (id: string) => void;
  onChangeStatus: (id: string, status: Status) => void;
  onChangeReleaseDate: (id: string, date: string | null) => void;
}

/** 项目超过该数量时折叠，避免卡片高度失控 */
const COLLAPSE_LIMIT = 4;

/** 生成单个项目的 MR 链接（缺 gitUrl/分支返回原因） */
function buildItemMrUrl(
  project: string,
  branch: string,
  env: BuildEnv,
  apps: DevopsApp[],
): { url: string } | { reason: string } {
  const gitUrl = apps.find((a) => a.app === project)?.gitUrl;
  if (!gitUrl) return { reason: '未配置 Git 仓库地址' };
  if (!branch) return { reason: '未填写开发分支' };
  return { url: buildMergeRequestUrl(gitUrl, branch, env) };
}

export default function RequirementCard({
  req,
  apps,
  branches,
  buildPlan,
  selected,
  onToggleSelect,
  onEdit,
  onDelete,
  onChangeStatus,
  onChangeReleaseDate,
}: Props) {
  const { message, modal } = AntdApp.useApp();
  const [building, setBuilding] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // 会话态子勾选：默认空集（全不勾），仅决定本卡 构建/MR 的作用范围，不写 localStorage
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: req.id,
  });

  const env = buildPlan.getEnv(req);
  const visibleItems = expanded ? req.items : req.items.slice(0, COLLAPSE_LIMIT);

  /** 子勾选切换（会话态） */
  const toggleItem = (itemId: string, checked: boolean) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  };

  /** 单项 MR：打开某项目的 GitLab 预填链接 */
  const openItemMr = (project: string, branch: string) => {
    const result = buildItemMrUrl(project, branch, env, apps);
    if ('reason' in result) {
      message.warning(`【${project}】${result.reason}，无法生成 MR 链接`);
      return;
    }
    window.open(result.url, '_blank', 'noreferrer');
  };

  /** 单卡 MR：打开该卡勾选项目的 MR 链接（同步循环 + 提示拦截兜底） */
  const handleCardMr = () => {
    const targets = req.items.filter((it) => checkedIds.has(it.id));
    if (targets.length === 0) {
      message.warning('请先勾选要提交 MR 的项目');
      return;
    }
    const skipped: string[] = [];
    let opened = 0;
    for (const it of targets) {
      const result = buildItemMrUrl(it.project, it.branch, env, apps);
      if ('reason' in result) {
        skipped.push(`【${it.project}】${result.reason}`);
        continue;
      }
      window.open(result.url, '_blank', 'noreferrer');
      opened += 1;
    }
    if (opened > 0) {
      message.success(`已打开 ${opened} 个 MR 页面，如被浏览器拦截请用项目行内 MR 图标逐个打开`);
    }
    if (skipped.length > 0) {
      message.warning(`已跳过：${skipped.join('；')}`);
    }
  };

  /** 单卡构建：作用于会话态子勾选的项目 */
  const handleBuild = async () => {
    if (!getCsrfToken()) {
      message.warning('未登录运维平台，请先登录后再构建');
      return;
    }
    const targets = req.items.filter((it) => checkedIds.has(it.id));
    if (targets.length === 0) {
      message.warning('请先勾选要构建的项目');
      return;
    }
    setBuilding(true);
    try {
      // 每个 target 作为独立任务交给全局构建任务 store（含自动轮询重试）
      const results = await Promise.all(
        targets.map((it) => startBuildTask(req.name, it.project, env)),
      );
      let okCount = 0;
      const fails: string[] = [];
      let authFailed = false;
      results.forEach((r, i) => {
        const app = targets[i].project;
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
        message.success(`【${req.name}】已触发 ${okCount} 个项目构建`);
      }
    } finally {
      setBuilding(false);
    }
  };

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

  const allChecked = req.items.length > 0 && req.items.every((it) => checkedIds.has(it.id));
  const indeterminate = req.items.some((it) => checkedIds.has(it.id)) && !allChecked;
  const tone = getCardTone(req.status);

  return (
    <div
      ref={setNodeRef}
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
        transform: CSS.Translate.toString(transform),
        transition: transition ?? 'transform 200ms ease',
        ...(isDragging ? { position: 'relative', zIndex: 999, opacity: 0.85 } : {}),
      }}
    >
      {/* 头部：勾选 + 把手 + 名称 + 版本 + ⋯ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Checkbox
          checked={selected}
          onChange={(e) => onToggleSelect(req.id, e.target.checked)}
          onClick={(e) => e.stopPropagation()}
        />
        <span
          {...attributes}
          {...listeners}
          aria-label="拖拽排序"
          style={{ cursor: 'grab', color: '#999', touchAction: 'none', display: 'inline-flex' }}
        >
          <HolderOutlined />
        </span>
        <a
          href={req.tapdUrl}
          target="_blank"
          rel="noreferrer"
          style={{ flex: 1, minWidth: 0, fontWeight: 600, wordBreak: 'break-all', lineHeight: '20px' }}
        >
          {req.name} <ExportOutlined style={{ fontSize: 12 }} />
        </a>
        <Tag
          style={{ marginInlineEnd: 0, fontSize: 12, lineHeight: '18px', flexShrink: 0 }}
        >
          {req.version ?? '大版'}
        </Tag>
        <Dropdown menu={{ items: actionMenu }} trigger={['click']}>
          <Button type="text" size="small" icon={<MoreOutlined />} style={{ flexShrink: 0 }} />
        </Dropdown>
      </div>

      {/* 中部：状态 + 发版时间 + 备注 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Select
          value={req.status}
          size="small"
          style={{ width: 130 }}
          onChange={(v) => onChangeStatus(req.id, v)}
          options={STATUSES.map((s: Status) => ({ label: s, value: s }))}
          labelRender={() => (
            <span
              style={{
                display: 'inline-block',
                padding: '0 7px',
                borderRadius: 4,
                fontSize: 12,
                lineHeight: '20px',
              }}
              className={`ant-tag ant-tag-${STATUS_COLORS[req.status]}`}
            >
              {req.status}
            </span>
          )}
        />
        <DatePicker
          size="small"
          allowClear
          value={req.releaseDate ? dayjs(req.releaseDate) : null}
          onChange={(d) => onChangeReleaseDate(req.id, d ? d.format('YYYY-MM-DD') : null)}
          placeholder="发版时间"
          style={{ width: 120 }}
        />
      </div>
      {req.remark ? (
        <div style={{ fontSize: 12, color: '#888', lineHeight: '18px', wordBreak: 'break-all' }}>
          {req.remark}
        </div>
      ) : null}

      {/* 项目区：会话态子勾选 + 项目名 + 分支 + 单项 MR；超限折叠 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Checkbox
          checked={allChecked}
          indeterminate={indeterminate}
          onChange={(e) =>
            setCheckedIds(e.target.checked ? new Set(req.items.map((it) => it.id)) : new Set())
          }
          style={{ fontSize: 12, color: '#666' }}
        >
          全选项目
        </Checkbox>
        {visibleItems.map((it) => (
          <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Checkbox
              checked={checkedIds.has(it.id)}
              onChange={(e) => toggleItem(it.id, e.target.checked)}
            />
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
            <Tooltip title={`打开 ${it.project} 的 MR`}>
              <Button
                type="text"
                size="small"
                icon={<MergeOutlined />}
                onClick={() => openItemMr(it.project, it.branch)}
                style={{ flexShrink: 0 }}
              />
            </Tooltip>
          </div>
        ))}
        {req.items.length > COLLAPSE_LIMIT && (
          <Button
            type="link"
            size="small"
            style={{ alignSelf: 'flex-start', padding: 0, height: 'auto', fontSize: 12 }}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? '收起' : `展开全部（${req.items.length}）`} <DownOutlined style={{ fontSize: 10 }} />
          </Button>
        )}
      </div>

      {/* 底部：env + 构建 + 提交MR（纯文字按钮，无前置图标） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto' }}>
        <Select
          size="small"
          value={env}
          onChange={(v) => buildPlan.setEnv(req, v)}
          options={branches.map((b) => ({ label: b.label, value: b.value }))}
          style={{ flex: 1, minWidth: 80 }}
        />
        <Button
          size="small"
          type="primary"
          loading={building}
          disabled={checkedIds.size === 0}
          onClick={() => void handleBuild()}
        >
          构建
        </Button>
        <Button size="small" disabled={checkedIds.size === 0} onClick={handleCardMr}>
          提交MR
        </Button>
      </div>
    </div>
  );
}
