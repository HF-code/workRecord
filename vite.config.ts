import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    // 监听所有网卡，允许通过局域网 IP（如 192.168.x.x:5173）访问
    host: true,
    proxy: {
      '/devops-api': {
        target: 'https://devops.vzan.com',
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/devops-api/, ''),
        // 浏览器自动带 Origin: http://localhost:5173，Django CSRF 会拒绝，需改写为 devops 域
        headers: {
          Origin: 'https://devops.vzan.com',
          Referer: 'https://devops.vzan.com/',
        },
        // 置空表示去掉 Set-Cookie 的 Domain 属性，使其成为当前访问 host 的会话 cookie
        // 这样 localhost 和局域网 IP 访问都能正常接收 cookie
        cookieDomainRewrite: { 'devops.vzan.com': '' },
      },
    },
  },
});
