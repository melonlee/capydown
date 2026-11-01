/**
 * AI 冒烟测试：用应用里真实的服务商代码 + 两个 AI 功能，对一个真实（或模拟）的模型服务跑一遍。
 *
 *   # 真实网关（OpenAI 兼容：DeepSeek / Kimi / 通义千问 / OpenAI / 自建网关）
 *   LB_AI_BASE_URL=https://api.deepseek.com/v1 LB_AI_KEY=sk-... LB_AI_MODEL=deepseek-chat node scripts/dev/ai-smoke.mjs
 *
 *   # Claude
 *   LB_AI_PROVIDER=claude LB_AI_KEY=sk-ant-... LB_AI_MODEL=claude-sonnet-4-6 node scripts/dev/ai-smoke.mjs
 *
 *   # 不需要 Key：启动本地模拟服务
 *   node scripts/dev/ai-smoke.mjs --mock
 *
 * 环境变量：LB_AI_PROVIDER（openai | claude，默认 openai）、LB_AI_BASE_URL、LB_AI_KEY、LB_AI_MODEL。
 * Key 只从环境变量读取，不会打印、不会写入任何文件。全部检查通过时退出码为 0。
 */
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const useMock = process.argv.includes('--mock')

// 1. 用 esbuild 把 TypeScript 源码打包成一个临时 ESM 文件（放在 node_modules/.cache 里，便于解析依赖）
const { build } = await import('esbuild')
const outDir = join(ROOT, 'node_modules', '.cache', 'capydown')
mkdirSync(outDir, { recursive: true })
const outfile = join(outDir, 'ai-smoke-bundle.mjs')
await build({
  stdin: {
    contents: `
      export { OpenAICompatibleProvider } from './src/main/ai/providers/openai-compatible'
      export { ClaudeAIProvider } from './src/main/ai/providers/claude'
      export { proofreadDocument, generateTitleSummary } from './src/main/ai/features'
      export { applyEdits, ISSUE_TYPE_LABELS } from './src/shared/ai/proofread'
      export { wechatLength, WECHAT_TITLE_MAX, WECHAT_SUMMARY_MAX } from './src/shared/ai/publish-meta'
    `,
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  outfile,
  external: ['@anthropic-ai/sdk'],
  logLevel: 'error',
})
const lib = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`)

// 2. 配置
let mock = null
let provider = (process.env.LB_AI_PROVIDER || 'openai').toLowerCase()
let baseURL = process.env.LB_AI_BASE_URL || ''
let apiKey = process.env.LB_AI_KEY || ''
let model = process.env.LB_AI_MODEL || ''
if (useMock) {
  const { startMockServer } = await import('./mock-openai.mjs')
  mock = await startMockServer({ delayMs: 50 })
  provider = 'openai'
  baseURL = mock.url
  apiKey = 'mock-key'
  model = 'mock-model'
}
if (!apiKey || (provider !== 'claude' && (!baseURL || !model))) {
  console.error(`缺少配置。用法：
  LB_AI_BASE_URL=https://api.deepseek.com/v1 LB_AI_KEY=sk-... LB_AI_MODEL=deepseek-chat node scripts/dev/ai-smoke.mjs
  LB_AI_PROVIDER=claude LB_AI_KEY=sk-ant-... [LB_AI_MODEL=claude-sonnet-4-6] node scripts/dev/ai-smoke.mjs
  node scripts/dev/ai-smoke.mjs --mock`)
  process.exit(2)
}
const masked = apiKey.length > 8 ? `${apiKey.slice(0, 3)}…${apiKey.slice(-4)}` : '***'
console.log(`服务商：${provider}  Base URL：${baseURL || '（默认）'}  模型：${model || '（默认）'}  Key：${masked}\n`)

const service = provider === 'claude'
  ? new lib.ClaudeAIProvider({ provider: 'claude', apiKey, model: model || undefined, baseURL: baseURL || undefined })
  : new lib.OpenAICompatibleProvider({ provider: 'openai', apiKey, baseURL, model })

let failed = 0
const check = (ok, label, detail = '') => {
  if (!ok)
    failed++
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${detail ? `  ${detail}` : ''}`)
}
const timed = async (fn) => {
  const t = Date.now()
  const value = await fn()
  return [value, ((Date.now() - t) / 1000).toFixed(1)]
}

const ARTICLE = [
  '---',
  'title: 冒烟测试',
  '---',
  '',
  '# 我做为作者的的一点体会',
  '',
  '今天在次打开编辑器，，发现Markdown写作很顺手。安装好以后，我门就可以开始写了。',
  '',
  '```bash',
  'npm 按装 在次',
  '```',
  '',
  '更多内容见 [文档](https://example.com/在次/doc)，欢迎大家多多指教。',
  '',
].join('\n')

try {
  console.log('1. 连接')
  const [reply, t1] = await timed(() => service.generateText('请只回复两个字：成功', { maxTokens: 16 }))
  check(typeof reply === 'string' && reply.trim().length > 0, `模型有回复（${t1}s）`, JSON.stringify(String(reply).trim().slice(0, 20)))

  console.log('2. 流式输出')
  let chunks = 0
  let streamed = ''
  const [, t2] = await timed(() => service.streamText('用一句话介绍 Markdown。', (d) => { chunks++; streamed += d }, { maxTokens: 80 }))
  check(chunks > 0 && streamed.trim().length > 0, `收到 ${chunks} 个分片（${t2}s）`, JSON.stringify(streamed.trim().slice(0, 30)))

  console.log('3. 发布前校对')
  const [result, t3] = await timed(() => lib.proofreadDocument(service, ARTICLE, { onProgress: (d, n) => process.stdout.write(`    进度 ${d}/${n}\r`) }))
  process.stdout.write(`${' '.repeat(24)}\r`)
  check(result.failedChunks.length === 0, `${result.totalChunks} 批全部完成（${t3}s）`, result.failedChunks.map(f => f.error).join('; '))
  for (const i of result.issues)
    console.log(`    第 ${i.line} 行 [${lib.ISSUE_TYPE_LABELS[i.type]}] ${i.original} → ${i.suggestion}  ${i.reason}`)
  check(result.issues.length > 0, `找到 ${result.issues.length} 处问题`)
  const fixed = lib.applyEdits(ARTICLE, result.issues)
  check(fixed.skipped.length === 0, '所有修改都能精确应用')
  check(fixed.text.includes('npm 按装 在次'), '代码块未被改动')
  check(fixed.text.includes('https://example.com/在次/doc'), '链接地址未被改动')
  check(fixed.text.startsWith('---\ntitle: 冒烟测试\n---'), 'Front Matter 未被改动')

  console.log('4. 标题 + 摘要')
  const [meta, t4] = await timed(() => lib.generateTitleSummary(service, ARTICLE))
  for (const t of meta.titles)
    console.log(`    ${t.title}  （${t.angle || '—'}，${lib.wechatLength(t.title)}/${lib.WECHAT_TITLE_MAX}）`)
  console.log(`    摘要：${meta.summary}  （${lib.wechatLength(meta.summary)}/${lib.WECHAT_SUMMARY_MAX}）`)
  check(meta.titles.length >= 3 && meta.titles.length <= 5, `${meta.titles.length} 个标题候选（${t4}s）`)
  check(meta.titles.every(t => lib.wechatLength(t.title) <= lib.WECHAT_TITLE_MAX), '标题都不超过 64 字')
  check(meta.summary.length > 0 && lib.wechatLength(meta.summary) <= lib.WECHAT_SUMMARY_MAX, '摘要不超过 120 字')
}
catch (error) {
  failed++
  console.error(`\n✗ 出错：${error instanceof Error ? error.message : String(error)}`)
}
finally {
  await mock?.close()
}

console.log(failed ? `\n${failed} 项未通过` : '\n全部通过')
process.exit(failed ? 1 : 0)
