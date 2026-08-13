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
}));
