/**
 * 发布前校对的界面状态与操作（校对面板 ProofreadPanel.vue 使用）。
 *
 * 位置约定：送去校对的是 CodeMirror 的 doc.toString()，问题位置与编辑器位置一一对应
 * （CRLF 文件在编辑器里也是按行存储，位置不含 \r）。接受修改走编辑器事务，可以撤销；
 * 「全部接受」是一个事务，一次撤销即可还原。
 */
import type { MarkdownEditor } from '@renderer/editor'
import type { ProofreadIssue, ProofreadResult } from '../../../shared/ai/proofread'
import { computed, reactive } from 'vue'
import { EditorSelection } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { useStore } from '@renderer/stores'
import { planEdits, relocateIssue } from '../../../shared/ai/proofread'

export type IssueStatus = 'pending' | 'accepted' | 'ignored' | 'stale'
export interface PanelIssue extends ProofreadIssue {
  status: IssueStatus
}

type Phase = 'idle' | 'nokey' | 'running' | 'done' | 'error'

const state = reactive({
  open: false,
  phase: 'idle' as Phase,
  progress: { done: 0, total: 0 },
  issues: [] as PanelIssue[],
  failed: [] as ProofreadResult['failedChunks'],
  checkedChars: 0,
  error: '',
  activeId: '',
  /** 结果属于哪篇文档；切换文档后结果作废 */
  docPath: '',
  cancelling: false,
})

let getEditor: () => MarkdownEditor | null = () => null
let getDocPath: () => string = () => ''

/** 工作台挂载时绑定编辑器 */
export function bindProofreadEditor(editor: () => MarkdownEditor | null, docPath: () => string) {
  getEditor = editor
  getDocPath = docPath
}

export function cleanAIError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  const msg = raw
    .replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
    .replace(/^AI (流式)?生成失败: /, '')
  if (/HTTP 401|HTTP 403|invalid.*key|unauthori[sz]ed|authentication/i.test(msg))
    return `API Key 无效或没有权限（${msg.slice(0, 80)}）`
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|network/i.test(msg))
    return `连不上 AI 服务，请检查网络或 Base URL（${msg.slice(0, 80)}）`
  if (/HTTP 429/.test(msg))
    return '请求太频繁或额度不足（HTTP 429），稍后再试'
  return msg.slice(0, 200)
}

export async function hasAIConfig(): Promise<boolean> {
  try {
    return !!(await window.$api.aiGetServiceConfig())
  }
  catch {
    return false
  }
}

/** 打开偏好设置并滚动到 AI 一节 */
export function openAISettings() {
  const store = useStore()
  store.isOpenRightSlider = true
  setTimeout(() => document.getElementById('lb-prefs-ai')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 260)
}

export function useProofread() {
  const pending = computed(() => state.issues.filter(i => i.status === 'pending'))

  async function start() {
    const editor = getEditor()
    state.open = true
    if (!editor)
      return
    state.error = ''
    state.issues = []
    state.failed = []
    state.activeId = ''
    if (!(await hasAIConfig())) {
      state.phase = 'nokey'
      return
    }
    const text = editor.view.state.doc.toString()
    if (!text.trim()) {
      state.phase = 'error'
      state.error = '文章还是空的'
      return
    }
    state.phase = 'running'
    state.cancelling = false
    state.progress = { done: 0, total: 0 }
    state.docPath = getDocPath()
    const off = window.$api.onAIProofreadProgress((p: { done: number, total: number }) => (state.progress = p))
    try {
      const result: ProofreadResult = await window.$api.aiProofread(text)
      state.issues = result.issues.map(i => ({ ...i, status: 'pending' as IssueStatus }))
      state.failed = result.failedChunks
      state.checkedChars = result.checkedChars
      if (result.totalChunks > 0 && result.failedChunks.length === result.totalChunks) {
        state.phase = 'error'
        state.error = cleanAIError(result.failedChunks[0].error)
      }
      else {
        state.phase = 'done'
      }
    }
    catch (error) {
      state.phase = 'error'
      state.error = cleanAIError(error)
    }
    finally {
      off()
    }
  }

  function cancel() {
    state.cancelling = true
    window.$api.aiProofreadCancel()
  }

  function close() {
    if (state.phase === 'running')
      cancel()
    state.open = false
  }

  /** 找到问题在当前文档里的位置（文档可能已被编辑）；找不到时标记为「原文已改动」 */
  function locate(issue: PanelIssue): { from: number, to: number } | null {
    const editor = getEditor()
    if (!editor)
      return null
    const r = relocateIssue(editor.view.state.doc.toString(), issue)
    if (!r) {
      issue.status = 'stale'
      return null
    }
    issue.from = r.from
    issue.to = r.to
    return r
  }

  function jump(issue: PanelIssue) {
    const editor = getEditor()
    state.activeId = issue.id
    if (!editor || issue.status === 'accepted')
      return
    const r = locate(issue)
    if (!r)
      return
    editor.view.dispatch({
      selection: EditorSelection.range(r.from, r.to),
      effects: EditorView.scrollIntoView(r.from, { y: 'center' }),
    })
    editor.view.focus()
  }

  /** 接受一条修改后，后面的问题整体平移 */
  function shiftAfter(pos: number, delta: number, except: PanelIssue) {
    if (!delta)
      return
    for (const other of state.issues) {
      if (other !== except && other.status === 'pending' && other.from >= pos) {
        other.from += delta
        other.to += delta
      }
    }
  }

  function accept(issue: PanelIssue): boolean {
    const editor = getEditor()
    if (!editor || issue.status !== 'pending')
      return false
    const r = locate(issue)
    if (!r)
      return false
    editor.view.dispatch({
      changes: { from: r.from, to: r.to, insert: issue.suggestion },
      selection: EditorSelection.cursor(r.from + issue.suggestion.length),
      effects: EditorView.scrollIntoView(r.from, { y: 'nearest' }),
      userEvent: 'input.proofread',
    })
    issue.status = 'accepted'
    shiftAfter(r.to, issue.suggestion.length - (r.to - r.from), issue)
    return true
  }

  function ignore(issue: PanelIssue) {
    if (issue.status === 'pending')
      issue.status = 'ignored'
  }

  /** 一次事务接受所有待处理的修改；对不上原文的标记为「原文已改动」 */
  function acceptAll(): { applied: number, skipped: number } {
    const editor = getEditor()
    if (!editor)
      return { applied: 0, skipped: 0 }
    const text = editor.view.state.doc.toString()
    const candidates: PanelIssue[] = []
    for (const issue of pending.value) {
      const r = relocateIssue(text, issue)
      if (!r) {
        issue.status = 'stale'
        continue
      }
      issue.from = r.from
      issue.to = r.to
      candidates.push(issue)
    }
    const plan = planEdits(text, candidates)
    if (plan.apply.length) {
      editor.view.dispatch({
        changes: plan.apply.map(e => ({ from: e.from, to: e.to, insert: e.suggestion })),
        userEvent: 'input.proofread',
      })
    }
    for (const issue of plan.apply)
      issue.status = 'accepted'
    for (const id of plan.skipped) {
      const issue = state.issues.find(i => i.id === id)
      if (issue)
        issue.status = 'stale'
    }
    return { applied: plan.apply.length, skipped: plan.skipped.length }
  }

  /** 切换到别的文档：结果作废 */
  function onDocChanged(path: string) {
    if (state.docPath && path !== state.docPath && state.phase !== 'running') {
      state.phase = 'idle'
      state.issues = []
      state.failed = []
      state.docPath = ''
    }
  }

  return { state, pending, start, cancel, close, jump, accept, ignore, acceptAll, onDocChanged }
}
