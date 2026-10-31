<script setup lang="ts">
/**
 * 发布前校对面板（右侧）：错别字、语病、标点、重复用词；
 * 打开「风格建议」设置后，中英文空格单独列在「风格建议」一组。
 * 每条可以定位、接受（写回编辑器，可撤销）、忽略；也可以一次全部接受。
 */
import { CATEGORY_LABELS, ISSUE_TYPE_LABELS, issueCategory } from '../../../../shared/ai/proofread'
import { openAISettings, type PanelIssue, proofreadIncludeStyle, useProofread } from '@renderer/composables/useProofread'
import { useWorkbenchStore } from '@renderer/stores/workbench'
import { Check, CheckCheck, Loader2, RotateCcw, X } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

const { state, pending, start, cancel, close, jump, accept, ignore, acceptAll, onDocChanged } = useProofread()
const wb = useWorkbenchStore()

watch(() => wb.docPath, onDocChanged)

/** 分组：确定的错误在前，风格建议（可选）在后 */
const groups = computed(() => {
  const errors = state.issues.filter(i => issueCategory(i.type) === 'error')
  const style = state.issues.filter(i => issueCategory(i.type) === 'style')
  return [
    { key: 'error', title: '', items: errors },
    { key: 'style', title: CATEGORY_LABELS.style, items: style },
  ].filter(g => g.items.length)
})

const counts = computed(() => ({
  total: state.issues.length,
  errors: state.issues.filter(i => issueCategory(i.type) === 'error').length,
  style: state.issues.filter(i => issueCategory(i.type) === 'style').length,
  accepted: state.issues.filter(i => i.status === 'accepted').length,
  ignored: state.issues.filter(i => i.status === 'ignored').length,
}))

const percent = computed(() => (state.progress.total ? Math.round((state.progress.done / state.progress.total) * 100) : 0))

function onAccept(issue: PanelIssue) {
  if (!accept(issue))
    toast.error('原文已经改动，找不到这处文字了')
}

function onAcceptAll() {
  const { applied, skipped } = acceptAll()
  if (applied)
    toast.success(`已修改 ${applied} 处${skipped ? `，${skipped} 处原文已改动未修改` : ''}（⌘Z 可撤销）`)
  else if (skipped)
    toast.error('原文已经改动，没有可以自动修改的地方')
}

/** 上下文只显示同一行里靠近的几个字 */
function ctxBefore(issue: PanelIssue) {
  return issue.before.split('\n').pop()!.slice(-8)
}
function ctxAfter(issue: PanelIssue) {
  return issue.after.split('\n')[0].slice(0, 8)
}
/** 把空格 / 换行显示成浅色符号，空格类问题才看得清改了什么 */
function tokens(s: string): { text: string, mark: boolean }[] {
  return s.split(/( |\r?\n)/).filter(Boolean).map(t => (t === ' ' ? { text: '␣', mark: true } : /\n/.test(t) ? { text: '↵', mark: true } : { text: t, mark: false }))
}
</script>

<template>
  <aside class="lb-proof" :class="{ 'is-open': state.open }" :aria-hidden="!state.open">
    <header class="lb-proof-head">
      <div class="min-w-0">
        <div class="lb-proof-title">
          发布前校对
        </div>
        <div class="lb-proof-sub">
          公众号发布后正文最多只能改 20 个字
        </div>
      </div>
      <div class="flex items-center gap-0.5">
        <button v-if="state.phase === 'done' || state.phase === 'error'" class="lb-icon-btn" title="重新校对" @click="start">
          <RotateCcw class="size-4" />
        </button>
        <button class="lb-icon-btn" title="关闭" @click="close">
          <X class="size-4" />
        </button>
      </div>
    </header>

    <div class="lb-proof-body">
      <!-- 没有配置 AI -->
      <div v-if="state.phase === 'nokey'" class="lb-proof-empty">
        <p class="lb-proof-empty-title">
          还没有配置 AI
        </p>
        <p>校对会把正文按段落发给你在设置里选择的模型服务（Claude、DeepSeek、Kimi、通义千问或任意 OpenAI 兼容网关），代码块、链接和 Front Matter 不会被改动。</p>
        <button class="lb-btn is-primary" @click="openAISettings">
          去设置 API Key
        </button>
      </div>

      <!-- 尚未开始 -->
      <div v-else-if="state.phase === 'idle'" class="lb-proof-empty">
        <p class="lb-proof-empty-title">
          检查错别字、语病、标点和重复用词
        </p>
        <p>只报确定的错误，不会改写你的文风；每一处都由你决定是否接受。</p>
        <button class="lb-btn is-primary" @click="start">
          开始校对
        </button>
        <label class="lb-proof-opt">
          <input v-model="proofreadIncludeStyle" type="checkbox">
          同时给出风格建议（中英文之间的空格）
        </label>
      </div>

      <!-- 进行中 -->
      <div v-else-if="state.phase === 'running'" class="lb-proof-empty">
        <p class="lb-proof-empty-title">
          <Loader2 class="inline size-4 animate-spin mr-1 -mt-0.5" />
          {{ state.cancelling ? '正在停止…' : '正在校对…' }}
        </p>
        <div class="lb-proof-bar">
          <div :style="{ width: `${percent}%` }" />
        </div>
        <p v-if="state.progress.total" class="lb-proof-meta">
          {{ state.progress.done }} / {{ state.progress.total }} 批段落
        </p>
        <button class="lb-btn" :disabled="state.cancelling" @click="cancel">
          停止
        </button>
      </div>

      <!-- 出错 -->
      <div v-else-if="state.phase === 'error'" class="lb-proof-empty">
        <p class="lb-proof-empty-title">
          校对没有完成
        </p>
        <p class="lb-proof-error">
          {{ state.error }}
        </p>
        <div class="flex gap-2 justify-center">
          <button class="lb-btn is-primary" @click="start">
            重试
          </button>
          <button class="lb-btn" @click="openAISettings">
            检查 AI 设置
          </button>
        </div>
      </div>

      <!-- 结果 -->
      <template v-else-if="state.phase === 'done'">
        <div class="lb-proof-summary">
          <span v-if="counts.total">
            {{ counts.errors }} 处可能的错误<template v-if="counts.style"> · {{ counts.style }} 条风格建议</template><template v-if="counts.accepted || counts.ignored"> · 已改 {{ counts.accepted }} · 忽略 {{ counts.ignored }}</template>
          </span>
          <span v-else>没有发现问题（检查了约 {{ state.checkedChars }} 字）</span>
          <button v-if="pending.length > 1" class="lb-btn is-primary is-small" @click="onAcceptAll">
            <CheckCheck class="size-3.5" />
            全部接受
          </button>
        </div>

        <p v-if="state.failed.length" class="lb-proof-warn">
          有 {{ state.failed.length }} 批段落没有检查成功（第 {{ state.failed.map(f => f.line).join('、') }} 行起）：{{ state.failed[0].error.slice(0, 80) }}
          <button class="lb-link" @click="start">
            重新校对
          </button>
        </p>

        <template v-for="group in groups" :key="group.key">
        <div v-if="group.title" class="lb-proof-group">
          {{ group.title }}<span>可选，不影响发布</span>
        </div>
        <ul class="lb-proof-list">
          <li
            v-for="issue in group.items"
            :key="issue.id"
            class="lb-proof-item"
            :class="[`is-${issue.status}`, { 'is-active': state.activeId === issue.id }]"
            @click="jump(issue)"
          >
            <div class="lb-proof-item-head">
              <span class="lb-proof-tag">{{ ISSUE_TYPE_LABELS[issue.type] }}</span>
              <span class="lb-proof-line">第 {{ issue.line }} 行</span>
              <span v-if="issue.status === 'accepted'" class="lb-proof-state">已修改</span>
              <span v-else-if="issue.status === 'ignored'" class="lb-proof-state">已忽略</span>
              <span v-else-if="issue.status === 'stale'" class="lb-proof-state">原文已改动</span>
            </div>
            <div class="lb-proof-diff">
              <span class="ctx">{{ ctxBefore(issue) }}</span><del><span v-for="(t, k) in tokens(issue.original)" :key="k" :class="{ mark: t.mark }">{{ t.text }}</span></del><ins><span v-for="(t, k) in tokens(issue.suggestion)" :key="k" :class="{ mark: t.mark }">{{ t.text }}</span><template v-if="!issue.suggestion">（删除）</template></ins><span class="ctx">{{ ctxAfter(issue) }}</span>
            </div>
            <p v-if="issue.reason" class="lb-proof-reason">
              {{ issue.reason }}
            </p>
            <div v-if="issue.status === 'pending'" class="lb-proof-actions">
              <button class="lb-btn is-primary is-small" @click.stop="onAccept(issue)">
                <Check class="size-3.5" />
                接受
              </button>
              <button class="lb-btn is-small" @click.stop="ignore(issue)">
                忽略
              </button>
            </div>
          </li>
        </ul>
        </template>
      </template>
    </div>
  </aside>
</template>

<style scoped>
.lb-proof-opt {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 14px;
  font-size: 12px;
  color: var(--lb-muted);
  cursor: pointer;
}

.lb-proof-opt input {
  accent-color: var(--lb-accent);
}

.lb-proof-group {
  margin: 18px 4px 8px;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--lb-fg-strong);
}

.lb-proof-group span {
  margin-left: 8px;
  font-weight: 400;
  color: var(--lb-faint);
}

.lb-proof {
  display: flex;
  flex-direction: column;
  width: 0;
  flex-shrink: 0;
  overflow: hidden;
  background: var(--lb-sidebar-bg);
  border-left: 1px solid transparent;
  transition: width 0.22s ease;
  font-family: var(--lb-ui-font);
}

.lb-proof.is-open {
  width: 340px;
  border-left-color: var(--lb-border);
}

.lb-proof-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 8px 8px 16px;
  min-width: 340px;
}

.lb-proof-title {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--lb-fg-strong);
}

.lb-proof-sub {
  margin-top: 2px;
  font-size: 11.5px;
  color: var(--lb-faint);
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

.lb-proof-body {
  flex: 1;
  min-height: 0;
  min-width: 340px;
  overflow-y: auto;
  padding: 4px 12px 24px;
}

.lb-proof-empty {
  padding: 48px 12px 0;
  text-align: center;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--lb-muted);
}

.lb-proof-empty p {
  margin: 0 0 14px;
}

.lb-proof-empty .lb-proof-empty-title {
  margin-bottom: 8px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--lb-fg-strong);
}

.lb-proof-error {
  color: var(--lb-fg);
  word-break: break-all;
}

.lb-proof-bar {
  height: 2px;
  margin: 6px 24px 8px;
  background: var(--lb-border);
  border-radius: 2px;
  overflow: hidden;
}

.lb-proof-bar > div {
  height: 100%;
  background: var(--lb-fg-strong);
  transition: width 0.25s ease;
}

.lb-proof-meta {
  font-size: 11.5px;
  color: var(--lb-faint);
}

.lb-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 30px;
  padding: 0 14px;
  font-size: 12.5px;
  color: var(--lb-fg);
  background: var(--lb-bg);
  border: 1px solid var(--lb-border-strong);
  border-radius: 7px;
  cursor: pointer;
}

.lb-btn:hover {
  background: var(--lb-hover);
}

.lb-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.lb-btn.is-primary {
  color: var(--lb-accent-fg);
  background: var(--lb-accent);
  border-color: var(--lb-accent);
}

.lb-btn.is-primary:hover {
  opacity: 0.86;
}

.lb-btn.is-small {
  height: 24px;
  padding: 0 9px;
  font-size: 12px;
  border-radius: 6px;
}

.lb-link {
  margin-left: 4px;
  color: var(--lb-fg-strong);
  text-decoration: underline;
  text-underline-offset: 2px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: inherit;
}

.lb-proof-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 30px;
  padding: 0 4px 8px;
  font-size: 12px;
  color: var(--lb-muted);
  border-bottom: 1px solid var(--lb-border);
}

.lb-proof-warn {
  margin: 8px 4px 0;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--lb-fg);
  border: 1px dashed var(--lb-border-strong);
  border-radius: 7px;
}

.lb-proof-list {
  margin: 0;
  padding: 6px 0 0;
  list-style: none;
}

.lb-proof-item {
  padding: 10px 10px 10px;
  margin-bottom: 2px;
  border-radius: 8px;
  cursor: pointer;
  border: 1px solid transparent;
}

.lb-proof-item:hover {
  background: var(--lb-hover);
}

.lb-proof-item.is-active {
  border-color: var(--lb-border-strong);
  background: var(--lb-bg);
}

.lb-proof-item.is-accepted,
.lb-proof-item.is-ignored,
.lb-proof-item.is-stale {
  opacity: 0.5;
}

.lb-proof-item-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11.5px;
  color: var(--lb-faint);
}

.lb-proof-tag {
  padding: 0 6px;
  line-height: 18px;
  font-size: 11px;
  color: var(--lb-fg);
  border: 1px solid var(--lb-border-strong);
  border-radius: 4px;
}

.lb-proof-state {
  margin-left: auto;
  color: var(--lb-muted);
}

.lb-proof-diff {
  margin-top: 6px;
  font-size: 13.5px;
  line-height: 1.7;
  color: var(--lb-fg);
  word-break: break-all;
}

.lb-proof-diff .ctx {
  color: var(--lb-faint);
}

.lb-proof-diff del {
  color: var(--lb-muted);
  text-decoration: line-through;
  text-decoration-thickness: 1px;
}

.lb-proof-diff ins {
  margin-left: 2px;
  text-decoration: none;
  font-weight: 600;
  color: var(--lb-fg-strong);
  border-bottom: 1.5px solid var(--lb-fg-strong);
}

.lb-proof-diff .mark {
  font-weight: 400;
  color: var(--lb-faint);
}

.lb-proof-reason {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--lb-muted);
}

.lb-proof-actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}
</style>
