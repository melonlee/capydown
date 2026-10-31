/**
 * 端到端（不需要真实 Key）：启动本地 OpenAI 兼容模拟服务，走真实的 OpenAICompatibleProvider
 * 和主进程的 AI 功能代码。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { generateTitleSummary, proofreadDocument } from '../../src/main/ai/features'
import { OpenAICompatibleProvider } from '../../src/main/ai/providers/openai-compatible'
import { applyEdits } from '../../src/shared/ai/proofread'
import { WECHAT_SUMMARY_MAX, WECHAT_TITLE_MAX, wechatLength } from '../../src/shared/ai/publish-meta'
// @ts-expect-error 纯 JS 的开发脚本
import { startMockServer } from '../../scripts/dev/mock-openai.mjs'

let mock: { url: string, requests: any[], close: () => Promise<void> }

beforeAll(async () => {
  mock = await startMockServer({ delayMs: 0 })
})
afterAll(async () => {
  await mock.close()
})

const provider = (apiKey = 'test-key') => new OpenAICompatibleProvider({ provider: 'openai', apiKey, baseURL: mock.url, model: 'mock-model' })

const ARTICLE = [
  '---',
  'title: 测试',
  '---',
  '',
  '# 我做为作者的的一点体会',
  '',
  '今天在次打开编辑器，，发现Markdown写作很顺手。',
  '',
  '```bash',
  'npm 按装 在次',
  '```',
  '',
  '链接 [文档](htps://example.com/doc) 写错了协议也不该被改，这个功能非常非常好。',
  '',
].join('\r\n')

describe('proofreading through the real provider + mock server', () => {
  it('returns located, validated issues that apply cleanly to a CRLF file', async () => {
    const before = mock.requests.length
    const result = await proofreadDocument(provider(), ARTICLE)
    expect(result.failedChunks).toEqual([])
    const pairs = result.issues.map(i => [i.original, i.suggestion])
    expect(pairs).toContainEqual(expect.arrayContaining([expect.stringContaining('做为')]))
    // 代码块里的「按装」、链接地址、大幅改写都不应出现
    expect(result.issues.some(i => i.original.includes('htps'))).toBe(false)
    expect(result.issues.some(i => i.original.includes('非常非常好'))).toBe(false)
    expect(result.issues.some(i => i.original.includes('npm'))).toBe(false)

    const fixed = applyEdits(ARTICLE, result.issues)
    expect(fixed.skipped).toEqual([])
    expect(fixed.text).toContain('# 我作为作者的一点体会')
    expect(fixed.text).toContain('今天再次打开编辑器，发现 Markdown 写作很顺手。')
    expect(fixed.text).toContain('npm 按装 在次')
    expect(fixed.text).toContain('htps://example.com/doc')
    expect(fixed.text.split('\r\n').length).toBe(ARTICLE.split('\r\n').length)

    const calls = mock.requests.slice(before)
    expect(calls.every(r => r.task === 'proofread' && r.jsonMode)).toBe(true)
  })

  it('falls back when the gateway rejects response_format', async () => {
    const result = await proofreadDocument(provider('no-json-mode'), '我做为作者。')
    expect(result.issues.map(i => i.suggestion)).toEqual(['作为'])
  })

  it('parses fenced replies and reports broken replies per chunk', async () => {
    const fenced = await proofreadDocument(provider('fenced'), '我做为作者。')
    expect(fenced.issues).toHaveLength(1)
    const broken = await proofreadDocument(provider('broken'), '我做为作者。')
    expect(broken.issues).toEqual([])
    expect(broken.failedChunks[0].error).toMatch(/JSON/)
  })

  it('surfaces auth errors', async () => {
    const result = await proofreadDocument(provider('bad-key'), '我做为作者。')
    expect(result.failedChunks[0].error).toMatch(/401/)
  })
})

describe('titles + summary through the real provider + mock server', () => {
  it('returns 3-5 titles within 64 chars and a summary within 120 chars', async () => {
    const out = await generateTitleSummary(provider(), '# 懒排\n\n像 Typora 一样专心写，一键排成公众号。')
    expect(out.titles.length).toBeGreaterThanOrEqual(3)
    expect(out.titles.length).toBeLessThanOrEqual(5)
    expect(out.titles.every(t => wechatLength(t.title) <= WECHAT_TITLE_MAX)).toBe(true)
    expect(out.titles.some(t => t.angle.includes('超长'))).toBe(false)
    expect(wechatLength(out.summary)).toBeLessThanOrEqual(WECHAT_SUMMARY_MAX)
    expect(out.summary.length).toBeGreaterThan(20)
  })
})

describe('streaming through the mock server', () => {
  it('streams SSE deltas', async () => {
    let text = ''
    await provider().streamText('你好', (d) => { text += d })
    expect(text).toBe('成功')
  })
})
