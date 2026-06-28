import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// @mindgraph/plugin-api wird zur TS-Quelle aufgelöst (analog zum `@`-Alias). Der `/validation`-
// Subpath MUSS zuerst stehen, sonst fängt der Basis-Alias (Prefix-Match) ihn greedy mit ein.
const pluginApiAlias = {
  '@mindgraph/plugin-api/validation': resolve(__dirname, 'packages/plugin-api/src/validation.ts'),
  '@mindgraph/plugin-api': resolve(__dirname, 'packages/plugin-api/src/index.ts')
}

export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    },
    resolve: {
      alias: { ...pluginApiAlias }
    }
  },
  preload: {
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/preload.ts')
        }
      }
    },
    resolve: {
      alias: { ...pluginApiAlias }
    }
  },
  renderer: {
    root: '.',
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'index.html'),
          transport: resolve(__dirname, 'transport.html')
        }
      }
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        ...pluginApiAlias
      }
    }
  }
})
