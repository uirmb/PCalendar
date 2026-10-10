import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: './',
  resolve: {
    // 我使用官方预编译样式；3.2.6 的 exports 尚未列出这个已有文件。
    alias: {
      '@heroui-prebuilt.css': fileURLToPath(new URL('./node_modules/@heroui/styles/dist/heroui.min.css', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 700,
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
