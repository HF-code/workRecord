import { Layout, Menu } from 'antd';
import { BarChartOutlined, SettingOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useBuildNotifications } from '../hooks/useBuildNotifications';

const { Header, Content } = Layout;

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  // 全局构建完成通知（antd 弹窗 + 系统通知 + 标签页标题），跨路由生效
  useBuildNotifications();
  const isSettings = location.pathname.startsWith('/settings');
  const isQuickBuild = location.pathname.startsWith('/quick-build');
  const selectedKey = isSettings ? '/settings' : isQuickBuild ? '/quick-build' : '/';
  // 需求记录页放开全屏宽度；系统配置 / 快速构建页保留限宽，表单/表格全屏拉伸可读性差
  const maxWidth = isSettings || isQuickBuild ? 1200 : undefined;

  return (
    // Content 为唯一滚动容器：内容区整体滚动（需求记录页右栏/批量面板用 sticky 保持可见）
    <Layout style={{ height: '100vh', background: '#f5f5f5', overflow: 'hidden' }}>
      <Header
        style={{
          background: '#fff',
          display: 'flex',
          justifyContent: 'center',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          borderBottom: '1px solid #f0f0f0',
          height: 56,
          lineHeight: 'normal',
          padding: 0,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 32,
            padding: '0 16px',
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontWeight: 700,
              fontSize: 16,
              color: '#1f1f1f',
              whiteSpace: 'nowrap',
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: 'linear-gradient(135deg, #1677ff, #69b1ff)',
              }}
            />
            工作记录
          </span>
          <Menu
            mode="horizontal"
            selectedKeys={[selectedKey]}
            style={{ flex: 1, borderBottom: 'none', fontWeight: 500 }}
            onClick={({ key }) => navigate(key)}
            items={[
              { key: '/', icon: <BarChartOutlined />, label: '需求记录' },
              { key: '/quick-build', icon: <ThunderboltOutlined />, label: '快速构建' },
              { key: '/settings', icon: <SettingOutlined />, label: '系统配置' },
            ]}
          />
        </div>
      </Header>
      <Content style={{ padding: 16, flex: 1, minHeight: 0, overflow: 'auto' }}>
        <div style={{ maxWidth, margin: '0 auto' }}>
          <Outlet />
        </div>
      </Content>
    </Layout>
  );
}
