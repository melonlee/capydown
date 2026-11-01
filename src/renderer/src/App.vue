<script setup lang="ts">
import { Toaster } from '@renderer/components/ui/sonner'
import CodemirrorEditor from '@renderer/views/CodemirrorEditor.vue'
import Welcome from '@renderer/views/Welcome.vue'
import emitter from './utils/event';
import { useStore, useWorkspaceStore } from '@renderer/stores'
import { useWorkbenchStore } from '@renderer/stores/workbench'
import { APP_DISPLAY_NAME } from '../../shared/brand'
import { markAppReady } from './utils/boot'
import { useOpenWith } from '@renderer/composables/useOpenWith'

const store = useStore()
const workspaceStore = useWorkspaceStore()
const wb = useWorkbenchStore()
const openWith = useOpenWith()

// 编辑器主题（GitHub / Newsprint / Night，可跟随系统深色模式）作用于整个应用，欢迎页也一样
watch(() => wb.effectiveTheme, (theme) => {
  const root = document.documentElement
  root.dataset.lbTheme = theme
  root.classList.remove('lb-boot-dark', 'lb-boot-paper') // index.html 启动期间的临时底色
  // 下次启动时窗口底色与主题一致（主进程 BrowserWindow.backgroundColor），避免闪白
  window.$api.setBootTheme?.(theme === 'night' ? 'dark' : theme === 'newsprint' ? 'paper' : 'light')
  store.isDark = theme === 'night'
}, { immediate: true })

const {
  exportEditorContent2HTML,
  exportEditorContent2MD,
  importMarkdownContent,
} = store

const handleMessageAction = (action: string, payload: any) => {
  switch (action) {
    // 菜单命令统一交给工作台处理（见 src/shared/commands.ts）
    case 'command':
      emitter.emit('command', payload);
      break;
    case 'new-file':
    case 'about':
    case 'settings':
      emitter.emit(action);
      break;
    case 'open-file':
      importMarkdownContent();
      break;
    case 'export-md':
      exportEditorContent2MD();
      break;
    case 'export-html':
      exportEditorContent2HTML();
      break;
    // 系统「打开方式」/ 命令行交来的 Markdown 文件
    case 'open-external-file':
      if (typeof payload === 'string')
        openWith.openExternalFile(payload);
      break;
    case 'close-workspace':
      workspaceStore.closeCurrentWorkspace();
      break;
    default:
      break;
  }
}

// 更新窗口标题（打开工作区后由工作台按当前文档名设置）
const updateWindowTitle = () => {
  if (!workspaceStore.currentWorkspace)
    window.$api.setWindowTitle(APP_DISPLAY_NAME)
}

// 监听工作空间变化
watch(() => workspaceStore.currentWorkspaceId, updateWindowTitle)

onMounted(async () => {
  // 欢迎页在自己的 onMounted 里通知启动画面，工作台在打开第一篇文档后通知；这里兜底，
  // 无论哪条路径出问题，启动画面最多再停留 1.5 秒
  setTimeout(markAppReady, 1500)

  window.$api.onMessage((data) => {
    handleMessageAction(data.action, data.payload);
  });

  // 尝试从旧版本迁移数据
  await workspaceStore.migrateFromLegacy();
  
  // 更新窗口标题
  updateWindowTitle()

  // 启动前（或页面载入期间）系统交来的文件
  openWith.takePending()
})
</script>

<template>
  <!-- 根据工作空间状态显示不同页面 -->
  <Welcome v-if="!workspaceStore.hasOpenWorkspace" />
  <CodemirrorEditor v-else />
  <!-- 全局只挂一个 Toaster：欢迎页和工作台的提示都靠它显示 -->
  <Toaster position="top-center" :theme="store.isDark ? 'dark' : 'light'" :duration="2600" />
</template>

<style lang="less">
html,
body,
#app {
  width: 100vw;
  height: 100vh;
  margin: 0;
  padding: 0;
}

// 抵消下拉菜单开启时带来的样式
body {
  pointer-events: initial !important;
}

::-webkit-scrollbar {
  width: 8px;
  height: 8px;
  background-color: transparent;
}

::-webkit-scrollbar-track {
  background-color: transparent;
}

::-webkit-scrollbar-thumb {
  border-radius: 8px;
  border: 2px solid transparent;
  background-clip: content-box;
  background-color: rgba(128, 128, 128, 0.35);
}

/* CSS-hints */
.CodeMirror-hints {
  position: absolute;
  z-index: 10;
  overflow-y: auto;
  margin: 0;
  padding: 2px;
  border-radius: 4px;
  max-height: 20em;
  min-width: 200px;
  font-size: 12px;
  font-family: monospace;

  color: #333333;
  background-color: #ffffff;
  box-shadow:
    0 4px 8px 0 rgba(0, 0, 0, 0.12),
    0 2px 4px 0 rgba(0, 0, 0, 0.08);
}

.CodeMirror-hint {
  margin-top: 10px;
  padding: 4px 6px;
  border-radius: 2px;
  white-space: pre;
  color: #000000;
  cursor: pointer;

  &:first-of-type {
    margin-top: 0;
  }
  &:hover {
    background: #f0f0f0;
  }
}

.draggable-area {
  -webkit-app-region: drag;
}

/* 对于不想被拖拽的子元素（如按钮等控件）*/
.no-drag {
  -webkit-app-region: no-drag;
}
</style>
