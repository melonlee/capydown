<script setup lang="ts">
import { Toaster } from '@renderer/components/ui/sonner'
import CodemirrorEditor from '@renderer/views/CodemirrorEditor.vue'
import Welcome from '@renderer/views/Welcome.vue'
import emitter from './utils/event';
import { useStore, useWorkspaceStore } from '@renderer/stores'

const store = useStore()
const workspaceStore = useWorkspaceStore()

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
    case 'close-workspace':
      workspaceStore.closeCurrentWorkspace();
      break;
    default:
      break;
  }
}

// 更新窗口标题（打开工作区后由工作台按当前文档名设置）
const updateWindowTitle = () => {
  if (workspaceStore.currentWorkspace)
    return
  const workspace = workspaceStore.currentWorkspace
  if (workspace) {
    window.$api.setWindowTitle(`${workspace.name} - LazyBox`)
  } else {
    window.$api.setWindowTitle('LazyBox')
  }
}

// 监听工作空间变化
watch(() => workspaceStore.currentWorkspaceId, (newId, oldId) => {
  console.log('[App] Workspace ID changed:', { oldId, newId })
  console.log('[App] hasOpenWorkspace:', workspaceStore.hasOpenWorkspace)
  updateWindowTitle()
})

onMounted(async () => {
  window.$api.onMessage((data) => {
    handleMessageAction(data.action, data.payload);
  });

  // 尝试从旧版本迁移数据
  await workspaceStore.migrateFromLegacy();
  
  // 更新窗口标题
  updateWindowTitle()
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
