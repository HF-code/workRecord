import { Button, Card, InputNumber, Space, Typography } from 'antd';
import { useBuildConfig } from '../hooks/useBuildConfig';

const { Title, Paragraph, Text } = Typography;

/** 通用构建配置：构建轮询间隔等系统级参数。 */
export default function GeneralConfigPage() {
  const { pollInterval, defaultPollInterval, minPollInterval, setPollInterval } = useBuildConfig();

  return (
    <Card title="通用配置" style={{ maxWidth: 720 }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Title level={5} style={{ marginTop: 0 }}>
            构建轮询间隔（秒）
          </Title>
          <Paragraph type="secondary" style={{ marginBottom: 12 }}>
            点击构建后，若返回「上一任务尚未完成，请耐心等待」，将按此间隔自动重试触发本次构建。
            默认 {defaultPollInterval} 秒，最小 {minPollInterval} 秒，最大不限制。
          </Paragraph>
          <Space>
            <InputNumber
              min={minPollInterval}
              step={1}
              value={pollInterval}
              onChange={(v) => {
                if (v == null) return;
                setPollInterval(v);
              }}
              style={{ width: 160 }}
              addonAfter="秒"
            />
            <Button onClick={() => setPollInterval(defaultPollInterval)}>恢复默认</Button>
          </Space>
          <div style={{ marginTop: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              当前生效值：{pollInterval} 秒（最小 {minPollInterval} 秒）
            </Text>
          </div>
        </div>
      </Space>
    </Card>
  );
}
