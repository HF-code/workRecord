import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react()],
  // 环境标记：插件版（--mode extension）注入 true，Web 版注入 false（可被压缩器死代码消除）
  define: {
    __VSCODE__: mode === 'extension',
  },
  build: {
    // 插件版产物输出到 extension/media，供 webview 加载；Web 版维持 dist 不变
    outDir: mode === 'extension' ? 'extension/media' : 'dist',
    emptyOutDir: true,
  },

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
}));
