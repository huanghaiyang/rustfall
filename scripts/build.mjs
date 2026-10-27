// 生产构建（同样绕过 vite.config.js 的配置打包，避免受限环境下的 exec EPERM）
import { build } from 'vite'
import vue from '@vitejs/plugin-vue'

const out = await build({
  root: process.cwd(),
  configFile: false,
  plugins: [vue()],
  build: {
    target: 'es2020',
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1600,
  },
  logLevel: 'info',
})
console.log('build finished')
