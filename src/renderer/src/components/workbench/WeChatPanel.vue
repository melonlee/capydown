<script setup lang="ts">
/**
 * 公众号预览面板：沿用原来的渲染结果（#output）与复制流水线，只是换了位置。
 * 面板关闭时整块移到屏幕外继续渲染，菜单 / 快捷键「复制到公众号」照样可用。
 */
import { isCopying, useWeChatCopy } from '@renderer/composables/useWeChatCopy'
import { useDisplayStore, useStore } from '@renderer/stores'
import { useWorkbenchStore } from '@renderer/stores/workbench'
import { ChevronDown, Code2, Palette, Send, X } from 'lucide-vue-next'

const emit = defineEmits<{ publish: [] }>()

const store = useStore()
const display = useDisplayStore()
const wb = useWorkbenchStore()
const { output } = storeToRefs(store)
const { copy, copyMode, backLight } = useWeChatCopy()
const isMac = /Mac/i.test(navigator.userAgent)

const scroller = ref<HTMLElement>()
defineExpose({ scroller })

function openStyle() {
  store.isOpenRightSlider = !store.isOpenRightSlider
}

function openCss() {
  display.toggleShowCssEditor()
  setTimeout(() => store.cssEditor?.refresh(), 50)
}
</script>

<template>
  <aside class="lb-wechat" :class="{ 'is-open': wb.wechatOpen }" :aria-hidden="!wb.wechatOpen">
    <header class="lb-wechat-head">
      <span class="lb-wechat-title">公众号预览</span>
      <div class="flex items-center gap-0.5">
        <button class="lb-icon-btn" title="排版样式：主题、字体、主题色…" @click="openStyle">
          <Palette class="size-4" />
        </button>
        <button class="lb-icon-btn" title="自定义 CSS" @click="openCss">
          <Code2 class="size-4" />
        </button>
        <button class="lb-icon-btn" :title="`关闭（${isMac ? '⌥⌘P' : 'Ctrl+Alt+P'}）`" @click="wb.wechatOpen = false">
          <X class="size-4" />
        </button>
      </div>
    </header>

    <div id="preview" ref="scroller" class="lb-wechat-scroll">
      <div id="output-wrapper" :class="{ output_night: !backLight }">
        <div class="preview">
          <section id="output" v-html="output" />
          <div v-if="isCopying" class="loading-mask">
            <div class="loading-mask-box">
              <div class="loading__img" />
              <span>正在生成</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <footer class="lb-wechat-foot">
      <div class="lb-split">
        <button class="lb-primary" :title="`复制到公众号（${isMac ? '⇧⌘C' : 'Ctrl+Shift+C'}）`" @click="copy">
          复制到公众号
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <button class="lb-primary lb-primary-caret" title="复制格式">
              <ChevronDown class="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-[200px]">
            <DropdownMenuRadioGroup v-model="copyMode">
              <DropdownMenuRadioItem value="txt">
                公众号格式（推荐）
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="html">
                HTML 源码
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <button class="lb-secondary" title="填写标题 / 摘要，导出 Markdown" @click="emit('publish')">
        <Send class="size-3.5" />
        发布…
      </button>
    </footer>
  </aside>
</template>

<style lang="less" scoped>
@import url('../../assets/less/app.less');

.lb-wechat {
  display: flex;
  flex-direction: column;
  width: 0;
  flex-shrink: 0;
  overflow: hidden;
  background: var(--lb-sidebar-bg);
  border-left: 1px solid transparent;
  transition: width 0.22s ease;
  /* 预览始终是公众号的浅色效果，与编辑器主题无关 */
  --foreground: 0 0% 3.9%;
  --blockquote-background: #f7f7f7;
}

.lb-wechat.is-open {
  width: 436px;
  border-left-color: var(--lb-border);
}

/* 关闭时放到屏幕外渲染，保证随时可以复制 */
.lb-wechat:not(.is-open) {
  position: fixed;
  left: -10000px;
  top: 0;
  height: 100vh;
  width: 436px;
  transition: none;
  pointer-events: none;
}

.lb-wechat-head {
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px 0 16px;
}

.lb-wechat-title {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--lb-muted);
}

.lb-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  color: var(--lb-muted);
  background: transparent;
  border: none;
  cursor: pointer;
}

.lb-icon-btn:hover {
  background: var(--lb-hover);
  color: var(--lb-fg);
}

.lb-wechat-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 0 24px;
  display: flex;
  justify-content: center;
}

#output-wrapper {
  position: relative;
  user-select: text;
}

.preview {
  margin: 0;
  width: 375px;
  min-height: 100%;
  /* 夜间主题下 theme.less 会把预览背景设为透明，这里强制保持公众号的白底 */
  background: #ffffff !important;
  color: #1f2329;
  border-radius: 10px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06), 0 8px 24px rgba(15, 23, 42, 0.08) !important;
}

.loading-mask {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  text-align: center;
  color: #333;
  background-color: rgba(255, 255, 255, 0.96);
  border-radius: 10px;

  .loading-mask-box {
    position: sticky;
    top: 50%;
    transform: translateY(-50%);

    .loading__img {
      width: 56px;
      height: 56px;
      background: url('../../assets/images/favicon.png') no-repeat;
      margin: 1em auto;
      background-size: cover;
    }
  }
}

.lb-wechat-foot {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px 14px;
  border-top: 1px solid var(--lb-border);
}

.lb-split {
  display: flex;
  flex: 1;
}

.lb-primary {
  flex: 1;
  height: 32px;
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  background: var(--lb-accent);
  border: none;
  border-radius: 7px 0 0 7px;
  cursor: pointer;
  transition: filter 0.15s;
}

.lb-primary:hover {
  filter: brightness(1.08);
}

.lb-primary-caret {
  flex: 0 0 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 0 7px 7px 0;
  border-left: 1px solid rgba(255, 255, 255, 0.25);
}

:root[data-lb-theme='night'] .lb-primary {
  color: #1f1440;
}

.lb-secondary {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 12px;
  font-size: 13px;
  color: var(--lb-fg);
  background: var(--lb-bg);
  border: 1px solid var(--lb-border-strong);
  border-radius: 7px;
  cursor: pointer;
}

.lb-secondary:hover {
  background: var(--lb-hover);
}
</style>
