<!--
  发布对话框

  能做的事情如实说明：
  - 微信公众号：把排版好的内容复制到剪贴板，到公众号后台粘贴（LazyBox 不会替你自动发文）
  - Markdown 文件：导出带 Front Matter 的 .md
  其它平台显示为「暂不支持」。
-->
<script setup lang="ts">
import { AlertTriangle, Check, ClipboardCopy, Copy, Download, ExternalLink, Loader2, RotateCcw, ScanText, Sparkles } from 'lucide-vue-next'
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
import { cleanAIError, openAISettings } from '@renderer/composables/useProofread'
import { type TitleSummaryResult, WECHAT_SUMMARY_MAX, WECHAT_TITLE_MAX, wechatLength } from '../../../shared/ai/publish-meta'

const props = defineProps<{
  modelValue: boolean
  content: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  /** 关闭对话框并打开「发布前校对」面板 */
  'proofread': []
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

const platforms = ref<PlatformInfo[]>([])
const unsupported = computed(() => platforms.value.filter(p => !p.supported))

const title = ref('')
const author = ref('')
const tags = ref('')
const summary = ref('')

const busy = ref<'' | 'wechat' | 'markdown' | 'meta'>('')
const result = ref<PublishResult | null>(null)

const aiEnabled = ref(false)
const meta = ref<TitleSummaryResult | null>(null)
const metaError = ref('')

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

// AI 拟标题（3～5 个不同角度）+ 摘要（120 字以内），一次请求
async function generateMeta() {
  busy.value = 'meta'
  metaError.value = ''
  try {
    meta.value = await window.$api.aiTitleSummary(props.content)
  }
  catch (error) {
    metaError.value = cleanAIError(error)
  }
  finally {
    busy.value = ''
  }
}

async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${what}已复制`)
  }
  catch {
    toast.error('复制失败')
  }
}

function goAISettings() {
  emit('update:modelValue', false)
  openAISettings()
}

watch(() => props.modelValue, async (open) => {
  if (!open)
    return
  result.value = null
  meta.value = null
  metaError.value = ''
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
        <!-- 发布前校对：公众号发布后正文最多只能改 20 个字 -->
        <section class="proof-callout">
          <ScanText class="h-4 w-4 shrink-0" />
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium">
              先校对一遍再发
            </div>
            <div class="text-xs text-muted-foreground">
              公众号发布后正文最多只能改 20 个字。AI 帮你找错别字、语病、标点 / 空格和重复用词，逐条确认。
            </div>
          </div>
          <Button size="sm" variant="outline" :disabled="!!busy" @click="emit('proofread')">
            发布前校对
          </Button>
        </section>

        <!-- 文章信息 -->
        <section class="space-y-3">
          <div class="space-y-1.5">
            <div class="flex items-center justify-between">
              <label class="text-sm font-medium">标题 <span class="count" :class="{ over: wechatLength(title) > WECHAT_TITLE_MAX }">{{ wechatLength(title) }}/{{ WECHAT_TITLE_MAX }}</span></label>
              <button
                v-if="aiEnabled"
                class="ai-link"
                :disabled="!!busy"
                @click="generateMeta"
              >
                <Loader2 v-if="busy === 'meta'" class="h-3 w-3 animate-spin" />
                <Sparkles v-else class="h-3 w-3" />
                {{ meta ? '重新生成' : 'AI 拟标题和摘要' }}
              </button>
            </div>
            <input v-model="title" type="text" class="field" placeholder="文章标题">
          </div>

          <!-- AI 候选：点击填入，右侧按钮复制 -->
          <div v-if="metaError" class="meta-error">
            {{ metaError }}
            <button class="ai-link ml-1" @click="goAISettings">
              检查 AI 设置
            </button>
          </div>
          <div v-if="meta" class="meta-box">
            <div class="meta-label">
              候选标题 · 点击填入
            </div>
            <div
              v-for="t in meta.titles"
              :key="t.title"
              class="suggestion"
              :class="{ 'is-current': t.title === title }"
              role="button"
              @click="title = t.title"
            >
              <span class="suggestion-text">{{ t.title }}</span>
              <span v-if="t.angle" class="angle">{{ t.angle }}</span>
              <span class="count">{{ wechatLength(t.title) }}/{{ WECHAT_TITLE_MAX }}</span>
              <button class="copy-btn" title="复制标题" @click.stop="copyText(t.title, '标题')">
                <Copy class="h-3.5 w-3.5" />
              </button>
            </div>
            <template v-if="meta.summary">
              <div class="meta-label mt-2">
                摘要
              </div>
              <div class="suggestion is-summary" :class="{ 'is-current': meta.summary === summary }" role="button" @click="summary = meta.summary">
                <span class="suggestion-text">{{ meta.summary }}</span>
                <span class="count">{{ wechatLength(meta.summary) }}/{{ WECHAT_SUMMARY_MAX }}</span>
                <button class="copy-btn" title="复制摘要" @click.stop="copyText(meta.summary, '摘要')">
                  <Copy class="h-3.5 w-3.5" />
                </button>
              </div>
            </template>
            <button class="ai-link mt-1" :disabled="!!busy" @click="generateMeta">
              <RotateCcw class="h-3 w-3" />
              换一批
            </button>
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
            <label class="text-sm font-medium">摘要 <span class="count">{{ wechatLength(summary) }}/{{ WECHAT_SUMMARY_MAX }}</span></label>
            <textarea
              v-model="summary"
              :maxlength="WECHAT_SUMMARY_MAX"
              class="field min-h-[72px] resize-none"
              placeholder="公众号「摘要」栏最多 120 字；导出 Markdown 时写入 description"
            />
          </div>
          <p v-if="!aiEnabled" class="text-xs text-muted-foreground">
            在「偏好设置 → AI」里填好 API Key，可以让 AI 帮你拟标题、写摘要和发布前校对。
            <button class="ai-link" @click="goAISettings">
              去设置
            </button>
          </p>
        </section>

        <!-- 发布方式 -->
        <section class="grid grid-cols-2 gap-3">
          <div class="target-card">
            <div class="text-sm font-medium">
              微信公众号
            </div>
            <p class="text-xs text-muted-foreground mt-1 mb-3">
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
            <p class="text-xs text-muted-foreground mt-1 mb-3">
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

        <p v-if="unsupported.length" class="text-xs text-muted-foreground">
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
  border-color: hsl(var(--foreground));
  box-shadow: 0 0 0 2px hsl(var(--foreground) / 0.12);
}
.ai-link {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: hsl(var(--foreground));
  text-decoration: underline;
  text-decoration-color: hsl(var(--foreground) / 0.3);
  text-underline-offset: 3px;
}
.ai-link:disabled {
  opacity: 0.5;
}
.proof-callout {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 0.875rem;
  border: 1px solid hsl(var(--border));
  border-radius: 0.5rem;
}
.count {
  margin-left: 0.25rem;
  font-size: 0.75rem;
  font-weight: 400;
  color: hsl(var(--muted-foreground));
  font-variant-numeric: tabular-nums;
}
.count.over {
  color: hsl(var(--foreground));
  font-weight: 600;
}
.meta-box {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.625rem;
  border: 1px solid hsl(var(--border));
  border-radius: 0.5rem;
}
.meta-label {
  font-size: 0.75rem;
  color: hsl(var(--muted-foreground));
}
.meta-error {
  font-size: 0.75rem;
  padding: 0.5rem 0.625rem;
  border: 1px dashed hsl(var(--foreground) / 0.4);
  border-radius: 0.375rem;
}
.suggestion {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  text-align: left;
  font-size: 0.8125rem;
  padding: 0.375rem 0.375rem 0.375rem 0.625rem;
  border: 1px dashed hsl(var(--border));
  border-radius: 0.375rem;
  cursor: pointer;
}
.suggestion:hover {
  background: hsl(var(--accent));
}
.suggestion.is-current {
  border-style: solid;
  border-color: hsl(var(--foreground) / 0.6);
}
.suggestion.is-summary {
  align-items: flex-start;
  line-height: 1.6;
}
.suggestion-text {
  flex: 1;
  min-width: 0;
}
.angle {
  flex-shrink: 0;
  font-size: 0.6875rem;
  padding: 0 0.375rem;
  line-height: 1.125rem;
  border: 1px solid hsl(var(--border));
  border-radius: 0.25rem;
  color: hsl(var(--muted-foreground));
}
.copy-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 0.25rem;
  color: hsl(var(--muted-foreground));
}
.copy-btn:hover {
  background: hsl(var(--background));
  color: hsl(var(--foreground));
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
  border-color: hsl(var(--border));
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
}
.result-err {
  border-color: hsl(var(--foreground) / 0.5);
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
  font-weight: 500;
}
.warning {
  color: hsl(var(--muted-foreground));
}
</style>
