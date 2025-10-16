import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { resolve } from 'path'
import { analyzer } from 'vite-bundle-analyzer'
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@': resolve('src/renderer/src')
      }
    },
    build: {
      cssMinify: 'esbuild',
      target: 'esnext',
      minify: 'esbuild',
      ssr: false
    },
    plugins: [react(), tailwindcss(), analyzer({ analyzerMode: 'static' })]
  }
})
