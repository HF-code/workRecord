/**
 * 批量操作区（选中需求 > 0 时显示）：
 * - 上半：统计（N 需求 · M 项目 · K 构建任务 · S 跳过）+ 构建/MR 两个并排清单 + 批量按钮；
 *   构建清单带一键复制（逐行 `项目名【目标分支】`）；MR 清单每项为可点链接（兜底弹窗拦截）。
 * - 下半：每个选中需求一个小框，项目+分支为可关闭 Tag（X = 本次批量排除，不动需求数据）。
 * 配色为黑白色调：浅灰面板 + 白色清单卡；仅"N 项将跳过"保留橙色警示。
 */
import { useMemo } from 'react';
import { App as AntdApp, Button, Empty, Space, Tag, Tooltip, Typography } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import type { Requirement } from '../types';
import type { DevopsApp } from '../config/devopsApps';
import {
  collectBuildTargets,
  collectMrTargets,
  getBatchItems,
  summarize,
  type BuildPlan,
  type BuildTarget,
  type MrSkipped,
  type MrTarget,
} from '../batch';

interface Props {
  /** 选中的需求（全量数据，不受筛选影响） */
  reqs: Requirement[];
  apps: DevopsApp[];
  buildPlan: BuildPlan;
  /** 临时排除项：reqId → 被 X 的 itemId 列表 */
  excluded: Record<string, string[]>;
  onRemoveItem: (reqId: string, itemId: string) => void;
  onClearSelection: () => void;
  onBatchMr: (targets: MrTarget[], skipped: MrSkipped[]) => void;
  onBatchBuild: (builds: BuildTarget[], dupCount: number) => void;
  batchBuilding: boolean;
}

/** 清单子块容器（白底小卡，标题行可带右侧动作） */
function ListCard({
  title,
  count,
  extra,
  children,
}: {
  title: string;
  count: number;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 260,
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
          {title} <span style={{ color: '#666', fontWeight: 400 }}>（{count}）</span>
        </span>
        {extra}
      </div>
      <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {children}
      </div>
    </div>
  );
}

export default function BatchPanel({
  reqs,
  apps,
  buildPlan,
  excluded,
  onRemoveItem,
  onClearSelection,
  onBatchMr,
  onBatchBuild,
  batchBuilding,
}: Props) {
  const { message } = AntdApp.useApp();

  // 汇总/去重/统计全部由纯函数计算，UI 只渲染（依赖变化时重算）
  const { targets, skipped } = useMemo(
    () => collectMrTargets(reqs, apps, buildPlan, excluded),
    [reqs, apps, buildPlan, excluded],
  );
  const { builds, dupCount } = useMemo(
    () => collectBuildTargets(reqs, buildPlan, excluded),
    [reqs, buildPlan, excluded],
  );
  const summary = useMemo(
    () => summarize(reqs, buildPlan, excluded, skipped.length),
    [reqs, buildPlan, excluded, skipped.length],
  );

  if (reqs.length === 0) return null;

  /** 复制构建清单：逐行 `项目名【目标分支】` */
  const handleCopyBuilds = async () => {
    const text = builds.map((b) => `${b.project}【${b.env}】`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      message.success(`已复制 ${builds.length} 条构建目标`);
    } catch {
      message.error('复制失败，请手动选择清单内容复制');
    }
  };

  return (
    <div
      style={{
        background: '#fafafa',
        border: '1px solid #d9d9d9',
        borderRadius: 8,
        padding: 12,
        marginBottom: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {/* 上半：统计 + 按钮行 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <Typography.Text strong>
          已选 {summary.reqCount} 个需求 · {summary.itemCount} 个项目 · {summary.buildCount} 个构建任务
          {summary.skippedCount > 0 ? (
            <span style={{ color: '#fa8c16', marginLeft: 8 }}>
              {summary.skippedCount} 项将跳过
            </span>
          ) : null}
          {dupCount > 0 ? (
            <span style={{ color: '#888', marginLeft: 8, fontWeight: 400 }}>
              （合并去重 {dupCount} 个重复构建）
            </span>
          ) : null}
        </Typography.Text>
        <Space>
          <Button
            type="primary"
            disabled={targets.length === 0}
            onClick={() => onBatchMr(targets, skipped)}
          >
            批量提交MR（{targets.length}）
          </Button>
          <Button
            loading={batchBuilding}
            disabled={builds.length === 0}
            onClick={() => onBatchBuild(builds, dupCount)}
          >
            批量构建（{builds.length}）
          </Button>
          <Button type="text" onClick={onClearSelection}>
            清空选择
          </Button>
        </Space>
      </div>

      {/* 上半：构建/MR 两个并排清单 */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <ListCard
          title="构建清单（已去重）"
          count={builds.length}
          extra={
            builds.length > 0 ? (
              <Tooltip title="复制全部构建目标（项目名【分支名】）">
                <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => void handleCopyBuilds()} />
              </Tooltip>
            ) : null
          }
        >
          {builds.length === 0 ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              无有效构建项
            </Typography.Text>
          ) : (
            builds.map((b) => (
              <div key={b.key} style={{ fontSize: 12, lineHeight: '20px' }}>
                <Typography.Text strong style={{ fontSize: 12 }}>
                  {b.project}
                </Typography.Text>
                <span> → {b.env}</span>
              </div>
            ))
          )}
        </ListCard>
        <ListCard title="MR 清单（全量，点击可打开）" count={targets.length + skipped.length}>
          {targets.length + skipped.length === 0 ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              无有效 MR 项
            </Typography.Text>
          ) : (
            <>
              {targets.map((t) => (
                <a
                  key={`${t.reqId}:${t.itemId}`}
                  href={t.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 12, lineHeight: '20px', wordBreak: 'break-all' }}
                >
                  {t.project}：{t.branch} → {t.env}
                </a>
              ))}
              {skipped.map((s, i) => (
                <Tooltip key={`${s.reqName}:${s.project}:${i}`} title={s.reason}>
                  <div style={{ fontSize: 12, color: '#bbb', lineHeight: '20px', cursor: 'not-allowed' }}>
                    {s.project}（{s.reason}）
                  </div>
                </Tooltip>
              ))}
            </>
          )}
        </ListCard>
      </div>

      {/* 下半：逐需求小框，项目+分支可 X 临时排除 */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {reqs.map((req) => {
          const items = getBatchItems(req, excluded);
          // 构建目标 env 展示：整需求共用
          const env = buildPlan.getEnv(req);
          return (
            <div
              key={req.id}
              style={{
                background: '#fff',
                borderRadius: 6,
                border: '1px solid #e5e5e5',
                padding: '6px 10px',
                minWidth: 220,
                maxWidth: 340,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, wordBreak: 'break-all' }}>
                {req.name}
                <span style={{ color: '#999', fontWeight: 400 }}>
                  （{items.length} 项 · {env}）
                </span>
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {items.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无" style={{ margin: 0 }} />
                ) : (
                  items.map((it) => (
                    <Tag
                      key={it.id}
                      closable
                      onClose={(e) => {
                        // 阻止默认隐藏，由状态驱动（页面层会同步联动卡片勾选）
                        e.preventDefault();
                        onRemoveItem(req.id, it.id);
                      }}
                      style={{ marginInlineEnd: 0, fontSize: 12 }}
                    >
                      {it.project} {it.branch}
                    </Tag>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
