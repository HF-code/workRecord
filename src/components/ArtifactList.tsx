/**
 * 制品列表：回查构建任务的制品（file_url），构建触发成功后自动轮询展示。
 * 数据源复用 useBuildTasks 全局 taskMap（制品随任务走，任务清理即制品清理），
 * BatchPanel（批量构建）与 QuickBuildDrawer（快速构建）两处渲染同一份列表（跨刷新保留）。
 * 样式沿用黑白色调小卡（参考 BatchPanel 的 ListCard）。
 */
import { App as AntdApp, Button, Tag, Tooltip, Typography } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { useBuildTasks, type ArtifactState, type BuildTask } from '../hooks/useBuildTasks';

/** 制品状态 → 标签文案与颜色 */
const STATUS_META: Record<ArtifactState['status'], { label: string; color: string }> = {
  querying: { label: '查询中', color: 'processing' },
  success: { label: '成功', color: 'success' },
  fail: { label: '失败', color: 'error' },
  timeout: { label: '超时', color: 'warning' },
};

/** 单行制品（项目 → 环境 + 状态 + 链接/原因 + 复制按钮） */
function ArtifactRow({ task }: { task: BuildTask }) {
  const { message } = AntdApp.useApp();
  const artifact = task.artifact!;
  const meta = STATUS_META[artifact.status];

  const handleCopy = async () => {
    if (!artifact.fileUrl) return;
    try {
      await navigator.clipboard.writeText(artifact.fileUrl);
      message.success(`已复制 ${task.app} 的制品链接`);
    } catch {
      message.error('复制失败，请手动选择链接复制');
    }
  };

  return (
    <div style={{ fontSize: 12, lineHeight: '20px' }}>
      <Typography.Text strong style={{ fontSize: 12 }}>
        {task.app}
      </Typography.Text>
      <span> → {task.env} </span>
      <Tag color={meta.color} style={{ marginInlineStart: 4, marginInlineEnd: 0 }}>
        {meta.label}
      </Tag>
      {artifact.status === 'success' && artifact.fileUrl ? (
        <span style={{ marginLeft: 6, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <a href={artifact.fileUrl} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>
            {artifact.fileUrl}
          </a>
          <Tooltip title="复制制品链接">
            <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => void handleCopy()} />
          </Tooltip>
        </span>
      ) : null}
      {artifact.status === 'success' && !artifact.fileUrl ? (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          （{artifact.reason ?? '无制品链接'}）
        </Typography.Text>
      ) : null}
      {(artifact.status === 'fail' || artifact.status === 'timeout') && artifact.reason ? (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          （{artifact.reason}）
        </Typography.Text>
      ) : null}
    </div>
  );
}

/** 全局制品列表（无制品状态的任务时渲染 null） */
export default function ArtifactList() {
  const { message } = AntdApp.useApp();
  const { tasks } = useBuildTasks();
  // snapshot 已按 updatedAt 倒序，只需过滤出有制品状态的任务
  const items = tasks.filter((t) => t.artifact);
  if (items.length === 0) return null;
  const successItems = items.filter((t) => t.artifact?.status === 'success' && t.artifact.fileUrl);

  /** 复制全部成功项的制品链接（逐行 `项目 链接`） */
  const handleCopyAll = async () => {
    if (successItems.length === 0) return;
    const text = successItems.map((t) => `${t.app} ${t.artifact?.fileUrl}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      message.success(`已复制 ${successItems.length} 条制品链接`);
    } catch {
      message.error('复制失败，请手动选择清单内容复制');
    }
  };

  return (
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
          制品清单{' '}
          <span style={{ color: '#666', fontWeight: 400 }}>
            （{items.length}，成功 {successItems.length}；构建完成约 30s 后开始查询）
          </span>
        </span>
        <Tooltip title="复制全部成功项的制品链接">
          <Button
            type="text"
            size="small"
            icon={<CopyOutlined />}
            disabled={successItems.length === 0}
            onClick={() => void handleCopyAll()}
          />
        </Tooltip>
      </div>
      <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map((t) => (
          <ArtifactRow key={t.id} task={t} />
        ))}
      </div>
    </div>
  );
}
