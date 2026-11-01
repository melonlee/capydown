<script setup lang="ts">
/**
 * 侧边栏左下角的图标行（Obsidian / VS Code 式）：设置、浅色 / 深色切换、公众号预览。
 * 与菜单、⌘, 和命令面板共用同一组命令（emit('run', id) → runCommand）。
 */
import { useStore } from '@renderer/stores'
import { useWorkbenchStore } from '@renderer/stores/workbench'
import { Moon, Settings, Smartphone, Sun } from 'lucide-vue-next'
import { acceleratorFor, COMMAND_MAP, formatAccelerator } from '../../../../shared/commands'

const emit = defineEmits<{ run: [id: string] }>()
const store = useStore()
const wb = useWorkbenchStore()
const isMac = /Mac/i.test(navigator.userAgent)

function tip(id: string, label: string) {
  const c = COMMAND_MAP[id]
  const acc = c && acceleratorFor(c, isMac)
  return acc ? `${label}  ${formatAccelerator(acc, isMac)}` : label
}

const isDark = computed(() => wb.effectiveTheme === 'night')
</script>

<template>
  <div class="lb-sa" role="toolbar" aria-label="设置与视图">
    <button
      type="button"
      class="lb-sa-btn"
      :class="{ 'is-on': store.isOpenRightSlider }"
      aria-label="设置"
      :data-tip="tip('app.settings', '设置')"
      data-cmd="app.settings"
      @click="emit('run', 'app.settings')"
    >
      <Settings :size="15" :stroke-width="1.75" />
    </button>
    <button
      type="button"
      class="lb-sa-btn"
      :aria-label="isDark ? '切换到浅色主题' : '切换到深色主题'"
      :data-tip="isDark ? '切换到浅色' : '切换到深色（Night）'"
      data-cmd="theme.toggleDark"
      @click="emit('run', 'theme.toggleDark')"
    >
      <Sun v-if="isDark" :size="15" :stroke-width="1.75" />
      <Moon v-else :size="15" :stroke-width="1.75" />
    </button>
    <button
      type="button"
      class="lb-sa-btn"
      :class="{ 'is-on': wb.wechatOpen }"
      aria-label="公众号预览"
      :aria-pressed="wb.wechatOpen"
      :data-tip="tip('view.wechat', '公众号预览')"
      data-cmd="view.wechat"
      @click="emit('run', 'view.wechat')"
    >
      <Smartphone :size="15" :stroke-width="1.75" />
    </button>
  </div>
</template>

<style scoped>
.lb-sa {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 2px;
  height: 40px;
  padding: 0 10px;
  border-top: 1px solid var(--lb-border);
}

.lb-sa-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--lb-faint);
  cursor: pointer;
  transition: color 0.12s, background-color 0.12s;
}

.lb-sa-btn:hover {
  color: var(--lb-fg-strong);
  background: var(--lb-hover);
}

.lb-sa-btn.is-on {
  color: var(--lb-fg-strong);
  background: var(--lb-active);
}

.lb-sa-btn:focus-visible {
  outline: 1.5px solid var(--lb-focus-ring);
  outline-offset: 0;
}

.lb-sa-btn::after {
  content: attr(data-tip);
  position: absolute;
  left: 0;
  bottom: calc(100% + 8px);
  padding: 4px 8px;
  border-radius: 6px;
  white-space: pre;
  font-size: 11.5px;
  line-height: 1.3;
  color: var(--lb-fg-strong);
  background: var(--lb-popover-bg);
  border: 1px solid var(--lb-border-strong);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.1);
  opacity: 0;
  transform: translateY(2px);
  pointer-events: none;
  transition: opacity 0.12s, transform 0.12s;
  z-index: 20;
}

.lb-sa-btn:hover::after,
.lb-sa-btn:focus-visible::after {
  opacity: 1;
  transform: translateY(0);
  transition-delay: 0.35s;
}
</style>
