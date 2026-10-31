import { describe, expect, it } from 'vitest'
import { buildChatCompletionsUrl, parseChatCompletionSSE } from '../../src/main/ai/providers/openai-compatible'

describe('buildChatCompletionsUrl', () => {
  it('appends /chat/completions to a base URL', () => {
    expect(buildChatCompletionsUrl('https://api.deepseek.com/v1')).toBe('https://api.deepseek.com/v1/chat/completions')
    expect(buildChatCompletionsUrl('https://api.deepseek.com/v1/')).toBe('https://api.deepseek.com/v1/chat/completions')
  })

  it('accepts a full endpoint and falls back to OpenAI', () => {
    expect(buildChatCompletionsUrl('https://x.com/v1/chat/completions')).toBe('https://x.com/v1/chat/completions')
    expect(buildChatCompletionsUrl('')).toBe('https://api.openai.com/v1/chat/completions')
  })
})

describe('parseChatCompletionSSE', () => {
  const chunk = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n`

  it('extracts deltas and keeps the incomplete tail', () => {
    const buf = `${chunk('你')}${chunk('好')}data: {"choices":[{"delta":{"cont`
    const out = parseChatCompletionSSE(buf)
    expect(out.deltas).toEqual(['你', '好'])
    expect(out.done).toBe(false)
    expect(out.rest).toBe('data: {"choices":[{"delta":{"cont')
  })

  it('detects [DONE] and ignores comments / role-only chunks', () => {
    const buf = `: keep-alive\n${`data: ${JSON.stringify({ choices: [{ delta: { role: 'assistant' } }] })}\n`}${chunk('！')}data: [DONE]\n`
    const out = parseChatCompletionSSE(buf)
    expect(out.deltas).toEqual(['！'])
    expect(out.done).toBe(true)
    expect(out.rest).toBe('')
  })
})
