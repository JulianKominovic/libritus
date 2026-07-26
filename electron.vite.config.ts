import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'
import { resolve } from 'path'
import { analyzer } from 'vite-bundle-analyzer'

const analyze = process.env.ANALYZE === '1'

export default defineConfig({
  main: {
    build: {
      sourcemap: false,
      // Bundle pure JS; leave electron + native (via transformers) external.
      externalizeDeps: {
        exclude: [
          '@electron-toolkit/utils',
          '@openrouter/sdk',
          'jsdom',
          '@mozilla/readability'
        ]
      }
    }
  },
  preload: {
    build: {
      sourcemap: false,
      externalizeDeps: {
        exclude: ['@electron-toolkit/preload']
      }
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
    plugins: [
      react(),
      tailwindcss(),
      ...(analyze ? [analyzer({ analyzerMode: 'static' })] : [])
    ]
  }
})
