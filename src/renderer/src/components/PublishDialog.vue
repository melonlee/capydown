<!--
  发布对话框

  能做的事情如实说明：
  - 微信公众号：把排版好的内容复制到剪贴板，到公众号后台粘贴（LazyBox 不会替你自动发文）
  - Markdown 文件：导出带 Front Matter 的 .md
  其它平台显示为「暂不支持」。
-->
<script setup lang="ts">
import { AlertTriangle, Check, ClipboardCopy, Download, ExternalLink, Loader2, Sparkles } from 'lucide-vue-next'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog'
import { toast } from 'vue-sonner'
import emitter from '@renderer/utils/event'

const props = defineProps<{
  modelValue: boolean
  content: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

interface PlatformInfo {
  name: string
  displayName: string
  mode: 'clipboard' | 'file' | 'unsupported'
  supported: boolean
  description: string
}

interface PublishResult {
  success: boolean
  platform: string
  message?: string
  warnings?: string[]
  error?: string
}

const WECHAT_SUMMARY_LIMIT = 120

const platforms = ref<PlatformInfo[]>([])
const unsupported = computed(() => platforms.value.filter(p => !p.supported))

const title = ref('')
const author = ref('')
const tags = ref('')
const summary = ref('')

const busy = ref<'' | 'wechat' | 'markdown' | 'summary' | 'title'>('')
const result = ref<PublishResult | null>(null)

const aiEnabled = ref(false)
const titleSuggestions = ref<string[]>([])

function metadata() {
  return {
    title: title.value.trim(),
    author: author.value.trim() || undefined,
    tags: tags.value ? tags.value.split(/[,，]/).map(t => t.trim()).filter(Boolean) : [],
    summary: summary.value.trim() || undefined,
    date: new Date().toISOString().slice(0, 10),
  }
}

function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

// 请求编辑器头部组件生成「公众号格式」HTML（与「复制」按钮同一套渲染）
function renderWeChatHtml(): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('渲染超时，请重试')), 10000)
    emitter.emit('publish:render-wechat-html', (html: string) => {
      clearTimeout(timer)
      resolve(html)
    })
  })
}

async function copyToWeChat() {
  busy.value = 'wechat'
  result.value = null
  try {
    const html = await renderWeChatHtml()
    const res = await window.$api.publish('wechat', props.content, metadata(), { html })
    result.value = res
    if (res.success)
      toast.success(res.message ?? '已复制，请到公众号后台粘贴')
    else
      toast.error(res.error ?? '复制失败')
  }
  catch (error) {
    result.value = { success: false, platform: 'wechat', error: errorMessage(error) }
    toast.error(`复制失败：${errorMessage(error)}`)
  }
  finally {
    busy.value = ''
  }
}

async function exportMarkdown() {
  busy.value = 'markdown'
  result.value = null
  try {
    const picked = await window.$api.publishSelectSavePath(title.value || 'article')
    if (picked.canceled || !picked.filePath)
      return
    const res = await window.$api.publish('markdown', props.content, metadata(), { filePath: picked.filePath })
    result.value = res
    if (res.success)
      toast.success(res.message ?? '已导出')
    else
      toast.error(res.error ?? '导出失败')
  }
  catch (error) {
    toast.error(`导出失败：${errorMessage(error)}`)
  }
  finally {
    busy.value = ''
  }
}

async function aiSummary() {
  busy.value = 'summary'
  try {
    const text = await window.$api.aiGenerateText(
      `为下面这篇公众号文章写一段摘要，用于公众号的「摘要」栏。要求：中文，${WECHAT_SUMMARY_LIMIT} 字以内，一段话，不要加引号和前缀，直接输出摘要。\n\n${props.content.slice(0, 8000)}`,
      { maxTokens: 400 },
    )
    summary.value = String(text).trim().replace(/^["“「]|["”」]$/g, '').slice(0, WECHAT_SUMMARY_LIMIT)
  }
  catch (error) {
    toast.error(`生成摘要失败：${errorMessage(error)}`)
  }
  finally {
    busy.value = ''
  }
}

async function aiTitles() {
  busy.value = 'title'
  try {
    const text = await window.$api.aiGenerateText(
      `为下面这篇公众号文章拟 3 个标题。要求：中文，每个不超过 30 字，准确概括内容、不做标题党。每行一个标题，不要编号、不要引号、不要其它说明。\n\n${props.content.slice(0, 8000)}`,
      { maxTokens: 300 },
    )
    titleSuggestions.value = String(text)
      .split('\n')
      .map(line => line.replace(/^\s*(\d+[.、)]|[-*•])\s*/, '').replace(/^["“「《]|["”」》]$/g, '').trim())
      .filter(Boolean)
      .slice(0, 3)
    if (titleSuggestions.value.length === 0)
      toast.error('模型没有返回可用的标题')
  }
  catch (error) {
    toast.error(`生成标题失败：${errorMessage(error)}`)
  }
  finally {
    busy.value = ''
  }
}

watch(() => props.modelValue, async (open) => {
  if (!open)
    return
  result.value = null
  titleSuggestions.value = []
  const titleMatch = props.content.match(/^#\s+(.+)$/m)
  title.value = titleMatch ? titleMatch[1].trim() : ''
  try {
    platforms.value = await window.$api.publishGetPlatforms()
  }
  catch (error) {
    console.error('Failed to load platforms:', error)
  }
  try {
    aiEnabled.value = await window.$api.aiIsEnabled()
  }
  catch {
    aiEnabled.value = false
  }
}, { immediate: true })
</script>

<template>
  <Dialog :open="modelValue" @update:open="emit('update:modelValue', $event)">
    <DialogContent class="publish-dialog max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
      <DialogHeader>
        <DialogTitle>发布</DialogTitle>
        <DialogDescription>
          复制排版好的内容到公众号后台粘贴，或导出 Markdown 文件。LazyBox 不会替你自动发文。
        </DialogDescription>
      </DialogHeader>

      <div class="flex-1 overflow-y-auto space-y-5 pr-1">
        <!-- 文章信息 -->
        <section class="space-y-3">
          <div class="space-y-1.5">
            <div class="flex items-center justify-between">
              <label class="text-sm font-medium">标题</label>
              <button
                v-if="aiEnabled"
                class="ai-link"
                :disabled="!!busy"
                @click="aiTitles"
              >
                <Loader2 v-if="busy === 'title'" class="h-3 w-3 animate-spin" />
                <Sparkles v-else class="h-3 w-3" />
                AI 拟标题
              </button>
            </div>
            <input v-model="title" type="text" class="field" placeholder="文章标题">
            <div v-if="titleSuggestions.length" class="flex flex-col gap-1">
              <button
                v-for="t in titleSuggestions"
                :key="t"
                class="suggestion"
                @click="title = t"
              >
                {{ t }}
              </button>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <label class="text-sm font-medium">作者</label>
              <input v-model="author" type="text" class="field" placeholder="可选">
            </div>
            <div class="space-y-1.5">
              <label class="text-sm font-medium">标签</label>
              <input v-model="tags" type="text" class="field" placeholder="用逗号分隔，可选">
            </div>
          </div>

          <div class="space-y-1.5">
            <div class="flex items-center justify-between">
              <label class="text-sm font-medium">摘要 <span class="text-xs text-gray-500">{{ summary.length }}/{{ WECHAT_SUMMARY_LIMIT }}</span></label>
              <button
                v-if="aiEnabled"
                class="ai-link"
                :disabled="!!busy"
                @click="aiSummary"
              >
                <Loader2 v-if="busy === 'summary'" class="h-3 w-3 animate-spin" />
                <Sparkles v-else class="h-3 w-3" />
                AI 写摘要
              </button>
            </div>
            <textarea
              v-model="summary"
              :maxlength="WECHAT_SUMMARY_LIMIT"
              class="field min-h-[72px] resize-none"
              placeholder="公众号「摘要」栏最多 120 字；导出 Markdown 时写入 description"
            />
          </div>
          <p v-if="!aiEnabled" class="text-xs text-gray-500">
            在「设置 → AI 设置」里填好 API Key，可以让 AI 帮你拟标题、写摘要。
          </p>
        </section>

        <!-- 发布方式 -->
        <section class="grid grid-cols-2 gap-3">
          <div class="target-card">
            <div class="text-sm font-medium">
              微信公众号
            </div>
            <p class="text-xs text-gray-500 mt-1 mb-3">
              复制当前主题排版后的内容，到公众号后台「新的创作 → 文章」里粘贴（⌘V / Ctrl+V）。标题和摘要需在后台单独填写。
            </p>
            <Button class="w-full" :disabled="!!busy" @click="copyToWeChat">
              <Loader2 v-if="busy === 'wechat'" class="h-4 w-4 mr-1 animate-spin" />
              <ClipboardCopy v-else class="h-4 w-4 mr-1" />
              复制到公众号
            </Button>
          </div>

          <div class="target-card">
            <div class="text-sm font-medium">
              Markdown 文件
            </div>
            <p class="text-xs text-gray-500 mt-1 mb-3">
              导出带 Front Matter（标题、作者、日期、标签、摘要）的 .md，适合 Hexo / Hugo / VitePress 等博客。
            </p>
            <Button class="w-full" variant="outline" :disabled="!!busy" @click="exportMarkdown">
              <Loader2 v-if="busy === 'markdown'" class="h-4 w-4 mr-1 animate-spin" />
              <Download v-else class="h-4 w-4 mr-1" />
              导出 .md
            </Button>
          </div>
        </section>

        <!-- 结果 -->
        <section
          v-if="result"
          class="result"
          :class="result.success ? 'result-ok' : 'result-err'"
        >
          <div class="flex items-start gap-2">
            <Check v-if="result.success" class="h-4 w-4 mt-0.5 shrink-0" />
            <AlertTriangle v-else class="h-4 w-4 mt-0.5 shrink-0" />
            <div class="space-y-1 text-sm">
              <div>{{ result.success ? result.message : result.error }}</div>
              <div v-for="w in result.warnings ?? []" :key="w" class="text-xs warning">
                {{ w }}
              </div>
              <a
                v-if="result.success && result.platform === 'wechat'"
                href="https://mp.weixin.qq.com/"
                target="_blank"
                class="text-xs inline-flex items-center gap-1 underline"
              >
                打开公众号后台 <ExternalLink class="h-3 w-3" />
              </a>
            </div>
          </div>
        </section>

        <p v-if="unsupported.length" class="text-xs text-gray-500">
          {{ unsupported.map(p => p.displayName).join('、') }}：暂不支持。
        </p>
      </div>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.field {
  width: 100%;
  padding: 0.5rem 0.75rem;
  background: transparent;
  border: 1px solid hsl(var(--border));
  border-radius: 0.375rem;
  font-size: 0.875rem;
}
.field:focus {
  outline: none;
  border-color: rgba(139, 92, 246, 0.6);
}
.ai-link {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: rgb(139, 92, 246);
}
.ai-link:disabled {
  opacity: 0.5;
}
.suggestion {
  text-align: left;
  font-size: 0.8125rem;
  padding: 0.375rem 0.625rem;
  border: 1px dashed rgba(139, 92, 246, 0.4);
  border-radius: 0.375rem;
}
.suggestion:hover {
  background: rgba(139, 92, 246, 0.1);
}
.target-card {
  border: 1px solid hsl(var(--border));
  border-radius: 0.5rem;
  padding: 0.875rem;
  display: flex;
  flex-direction: column;
}
.target-card p {
  flex: 1;
}
.result {
  border-radius: 0.5rem;
  padding: 0.75rem;
  border: 1px solid;
}
.result-ok {
  border-color: rgba(34, 197, 94, 0.5);
  background: rgba(34, 197, 94, 0.08);
  color: rgb(22, 163, 74);
}
.result-err {
  border-color: rgba(239, 68, 68, 0.5);
  background: rgba(239, 68, 68, 0.08);
  color: rgb(220, 38, 38);
}
.warning {
  color: rgb(217, 119, 6);
}
</style>
