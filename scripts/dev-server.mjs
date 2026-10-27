// 以编程方式启动 Vite dev server（绕过 vite.config.js 的配置打包步骤，
// 该步骤在某些受限环境下会因 exec('net use') 被沙箱拒绝而失败）
import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'

const server = await createServer({
  root: process.cwd(),
  configFile: false,
  plugins: [vue()],
  server: { host: '127.0.0.1', port: 5180, strictPort: true },
  build: { target: 'es2020' },
  logLevel: 'info',
})
await server.listen()
server.printUrls()
