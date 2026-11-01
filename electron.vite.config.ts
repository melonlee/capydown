import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import doocsViteConfig from './doocs.vite.config';

export default defineConfig({
  main: {
    // 主进程的第三方依赖直接打进 out/main/index.cjs：electron-builder 在 pnpm 项目里会漏打间接依赖
    // （如 electron-store → conf），打包后的应用会因 Cannot find module 而无法启动
    plugins: [externalizeDepsPlugin({ exclude: ['electron-store', '@anthropic-ai/sdk', '@electron-toolkit/utils'] })],
    build: {
      rollupOptions: {
        input: {
          index: './src/main/index.ts'
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs'
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs'
        }
      }
    }
  },
  renderer: doocsViteConfig
})
