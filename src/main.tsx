import React from 'react';
import ReactDOM from 'react-dom/client';
import { App as AntdApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';

dayjs.locale('zh-cn');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          // 黑白色调主题：主色近黑，显式覆盖 hover/active 防 AntD 算法生成发灰中间色
          colorPrimary: '#1F1F1F',
          colorPrimaryHover: '#333333',
          colorPrimaryActive: '#000000',
          colorLink: '#1F1F1F',
          colorLinkHover: '#000000',
          colorLinkActive: '#000000',
        },
      }}
    >
      <AntdApp>
        <RouterProvider router={router} />
      </AntdApp>
    </ConfigProvider>
  </React.StrictMode>,
);
