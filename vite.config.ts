import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
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
        // 响应 Set-Cookie 的 Domain 改写为 localhost，否则浏览器拒收
        cookieDomainRewrite: { 'devops.vzan.com': 'localhost' },
      },
    },
  },
});
