import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { editorFsPlugin } from './scripts/editor-fs-plugin.mjs'

export default defineConfig({
  // editor-fs-plugin: the sprite/room editor writes project + history straight to
  // <root>/editor-data/sprite-editor/ so nothing is lost when browser storage is cleared.
  plugins: [vue(), editorFsPlugin()],
  server: { host: '127.0.0.1', port: 5180, strictPort: true },
  build: { target: 'es2020', chunkSizeWarningLimit: 1600 },
})