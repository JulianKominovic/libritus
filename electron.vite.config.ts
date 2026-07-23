import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { resolve } from 'path'
import { analyzer } from 'vite-bundle-analyzer'
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      sourcemap: false
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      sourcemap: false
    }
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
      sourcemap: false,
      ssr: false
    },
    plugins: [react(), tailwindcss(), analyzer({ analyzerMode: 'static' })]
  }
})
