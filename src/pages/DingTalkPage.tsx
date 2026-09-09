/**
 * 外接钉钉配置页（设置 → 外接钉钉）：
 * - 保存：email + 绑定码提交服务端，服务端带浏览器 cookie 查用户接口校验身份后存储
 *   （cookie AES 加密落盘，供钉钉代你触发构建）。首次保存生成绑定码；
 *   再次保存更新 cookie（绑定码留空 = 保持原绑定码，填写 = 重新生成），绑定关系不受影响。
 * - 解绑：清空钉钉绑定（senderId），cookie 保留；重新绑定需重新生成绑定码。
 * - 绑定状态：展示当前 email 是否已绑定钉钉。
 * 无 cookie 粘贴 UI；所有请求 credentials:'include' 携带浏览器 cookie。
 */
import { useState } from 'react';
import { App as AntdApp, Alert, Button, Card, Input, Popconfirm, Space, Tag, Typography } from 'antd';
import { APP_API_BASE } from '../config/api';

/** 绑定状态查询结果 */
interface AccountStatus {
  exists: boolean;
  bound: boolean;
  senderId?: string;
}

export default function DingTalkPage() {
  const { message } = AntdApp.useApp();
  const [email, setEmail] = useState('');
  const [bindCode, setBindCode] = useState('');
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [unbinding, setUnbinding] = useState(false);

  /** 查询绑定状态（email 失焦 / 保存 / 解绑成功后调用） */
  const queryStatus = async (target?: string) => {
    const e = (target ?? email).trim();
    if (!e) {
      setStatus(null);
      return;
    }
    try {
      const res = await fetch(`${APP_API_BASE}/dingtalk/account/status?email=${encodeURIComponent(e)}`, {
        credentials: 'include',
      });
      const data = (await res.json().catch(() => null)) as AccountStatus | null;
      setStatus(data ? { exists: !!data.exists, bound: !!data.bound, senderId: data.senderId } : null);
    } catch {
      setStatus(null);
    }
  };

  /** 保存：首次生成绑定码；再次保存更新 cookie（绑定码留空保持不变） */
  const handleSave = async () => {
    const e = email.trim();
    if (!e) {
      message.warning('请填写 email');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${APP_API_BASE}/dingtalk/account`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: e, bindCode: bindCode.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { detail?: string };
      if (!res.ok) {
        message.error(data.detail || `保存失败（HTTP ${res.status}）`);
        return;
      }
      message.success(data.detail || '保存成功');
      setBindCode('');
      await queryStatus(e);
    } catch (err) {
      message.error(`保存失败：${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  /** 解绑：清空钉钉绑定（senderId），cookie 与账号保留 */
  const handleUnbind = async () => {
    const e = email.trim();
    if (!e) return;
    setUnbinding(true);
    try {
      const res = await fetch(`${APP_API_BASE}/dingtalk/account?email=${encodeURIComponent(e)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = (await res.json().catch(() => ({}))) as { detail?: string };
      if (!res.ok) {
        message.error(data.detail || `解绑失败（HTTP ${res.status}）`);
        return;
      }
      message.success(data.detail || '已解绑');
      await queryStatus(e);
    } catch (err) {
      message.error(`解绑失败：${(err as Error).message}`);
    } finally {
      setUnbinding(false);
    }
  };

  return (
    <Card title="外接到钉钉" style={{ maxWidth: 720 }}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          message="在钉钉群 @机器人 发送「/绑定 <email> <绑定码>」完成绑定后，即可用「/构建 <项目名> <环境>」触发构建并自动接收制品链接"
          description="保存时会携带当前浏览器 cookie 到服务端校验身份（cookie 加密存储，仅用于钉钉代你触发构建）。cookie 过期后重新保存即可更新，不影响绑定关系。"
        />
        <div>
          <Typography.Text strong>devops 账号 email</Typography.Text>
          <Input
            placeholder="与运维平台账号一致，如 fangcl@vzan.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => void queryStatus()}
            style={{ marginTop: 6, maxWidth: 360 }}
          />
        </div>
        <div>
          <Typography.Text strong>绑定码</Typography.Text>
          <Input
            placeholder="自设一次性码，如 X7K2P9；已保存过可留空表示保持原绑定码"
            value={bindCode}
            onChange={(e) => setBindCode(e.target.value)}
            style={{ marginTop: 6, maxWidth: 360 }}
          />
          <div style={{ marginTop: 6 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              绑定码仅在钉钉发送 /绑定 命令时使用一次，绑定成功后即作废；不会参与构建鉴权。
            </Typography.Text>
          </div>
        </div>
        <Space>
          <Button type="primary" loading={saving} onClick={() => void handleSave()}>
            保存
          </Button>
          <Popconfirm
            title="确认解绑钉钉？"
            description="cookie 保留；重新绑定需重新生成绑定码"
            okText="解绑"
            cancelText="取消"
            onConfirm={() => void handleUnbind()}
          >
            <Button danger loading={unbinding} disabled={!status?.bound}>
              解绑
            </Button>
          </Popconfirm>
        </Space>
        <div>
          <Typography.Text strong style={{ marginRight: 8 }}>
            绑定状态：
          </Typography.Text>
          {status === null ? (
            <Typography.Text type="secondary">填写 email 后自动查询</Typography.Text>
          ) : status.bound ? (
            <Tag color="success">已绑定钉钉{status.senderId ? `（${status.senderId}）` : ''}</Tag>
          ) : status.exists ? (
            <Tag color="warning">已保存绑定码，未绑定钉钉</Tag>
          ) : (
            <Tag>未保存（该 email 无记录）</Tag>
          )}
        </div>
      </Space>
    </Card>
  );
}
