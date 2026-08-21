import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    // 监听所有网卡，允许通过局域网 IP（如 192.168.x.x:5173）访问
    host: true,
    proxy: {
      // 转发到本地后端（mywork-server，默认 8080），由本地后端再转发到 devops.vzan.com。
      // 通过本地后端中转，便于统一注入 CSRF/Origin、透传 cookie，并支持后续扩展。
      // 如需直连远程 devops，可改回 target: 'https://devops.vzan.com' 并恢复下方 headers/cookieDomainRewrite。
      '/devops-api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
