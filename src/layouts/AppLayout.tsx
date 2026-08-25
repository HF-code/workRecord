import { Layout, Menu } from 'antd';
import { BarChartOutlined, SettingOutlined } from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

const { Header, Content } = Layout;

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const selectedKey = location.pathname.startsWith('/settings') ? '/settings' : '/';

  return (
    <Layout style={{ minHeight: '100vh', background: '#f5f5f5' }}>
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
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 1200,
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
              { key: '/settings', icon: <SettingOutlined />, label: '系统配置' },
            ]}
          />
        </div>
      </Header>
      <Content style={{ padding: '24px 16px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <Outlet />
        </div>
      </Content>
    </Layout>
  );
}
