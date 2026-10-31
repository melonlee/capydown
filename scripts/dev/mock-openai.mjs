#!/usr/bin/env node
/**
 * 本地 OpenAI 兼容模拟服务（只用于开发 / 测试，不需要真实 Key）。
 *
 *   node scripts/dev/mock-openai.mjs [--port 8787]
 *
 * 然后在 LazyBox「偏好设置 → AI」里选「OpenAI 兼容」，Base URL 填 http://127.0.0.1:8787/v1，
 * API Key 随便填（bad-key 会返回 401），模型随便填。
 *
 * 支持 POST /v1/chat/completions（stream: true 走 SSE，否则普通 JSON）和 GET /v1/models。
 * 根据系统提示词判断任务，返回确定性的结果：
 *   - 校对：按内置规则找「在次 / 做为 / 按装 / 的的 / ，，」；系统提示词要求风格建议（含 spacing）时
 *           才报「中英文之间缺空格」，
 *           另外故意返回两条应被客户端拒绝的条目（改链接、大幅改写），用来验证校验逻辑
 *   - 标题 + 摘要：5 个标题（其中 1 个超过 64 字，应被过滤）+ 一段超过 120 字的摘要（应被截断）
 *   - 其它（如「测试连接」）：回复「成功」
 * 特殊 Key：bad-key → 401；no-json-mode → 收到 response_format 时返回 400（验证自动降级）；
 *          fenced → 用 ```json 代码围栏包住回复（验证容错解析）；broken → 返回非 JSON。
 * 环境变量 MOCK_DELAY_MS：每个请求的延迟（默认 120 ms），方便观察进度。
 */
import http from 'node:http'
import { pathToFileURL } from 'node:url'

const CJK = '\\u4e00-\\u9fff'

const RULES = [
  { re: /在次/g, fix: () => '再次', type: 'typo', reason: '「在次」应为「再次」' },
  { re: /做为/g, fix: () => '作为', type: 'typo', reason: '「做为」应为「作为」' },
  { re: /按装/g, fix: () => '安装', type: 'typo', reason: '「按装」应为「安装」' },
  { re: /的的/g, fix: () => '的', type: 'repetition', reason: '重复的「的」' },
  { re: /，，/g, fix: () => '，', type: 'punctuation', reason: '重复的逗号' },
  {
    // 英文单词紧挨着中文（左右任一侧）：在交界处补空格
    re: new RegExp(`[${CJK}][A-Za-z][A-Za-z0-9]*[${CJK}]?|[A-Za-z][A-Za-z0-9]*[${CJK}]`, 'g'),
    fix: m => m.replace(new RegExp(`([${CJK}])([A-Za-z0-9])`, 'g'), '$1 $2').replace(new RegExp(`([A-Za-z0-9])([${CJK}])`, 'g'), '$1 $2'),
    type: 'spacing',
    reason: '中文与英文之间加空格',
    style: true,
  },
  // 下面两条是「坏」建议：客户端必须拒绝
  { re: /htps:\/\/[^\s)]+/g, fix: m => m.replace('htps', 'https'), type: 'typo', reason: '（应被拒绝：改动链接）' },
  { re: /非常非常好/g, fix: () => '极其出色且令人印象深刻', type: 'grammar', reason: '（应被拒绝：大幅改写）' },
]

/** 像模型一样给出「在段落里唯一」的原文片段：不唯一就向两边各扩一个字 */
function uniqueSpan(text, start, end) {
  let s = start
  let e = end
  const count = (needle) => text.split(needle).length - 1
  while (count(text.slice(s, e)) > 1 && (s > 0 || e < text.length)) {
    if (s > 0)
      s--
    if (e < text.length)
      e++
  }
  return [s, e]
}

export function mockProofread(paragraphs, { includeStyle = false } = {}) {
  const issues = []
  for (const p of paragraphs) {
    for (const rule of RULES) {
      if (rule.style && !includeStyle)
        continue
      rule.re.lastIndex = 0
      for (const m of p.text.matchAll(rule.re)) {
        const fixed = rule.fix(m[0])
        const [s, e] = uniqueSpan(p.text, m.index, m.index + m[0].length)
        const original = p.text.slice(s, e)
        const suggestion = p.text.slice(s, m.index) + fixed + p.text.slice(m.index + m[0].length, e)
        issues.push({ p: p.id, type: rule.type, original, suggestion, reason: rule.reason })
      }
    }
  }
  return { issues }
}

export function mockTitleSummary() {
  return {
    titles: [
      { title: '写公众号三年，我把排版时间从一小时压到一分钟', angle: '结论先行' },
      { title: '为什么你的公众号排版总是很累？', angle: '提出问题' },
      { title: '「懒排」上手指南：5 个让写作更专心的习惯', angle: '数字清单' },
      { title: `这是一个故意写得很长的标题，${'用来验证客户端会过滤超过六十四个字的候选标题，'.repeat(3)}`, angle: '超长（应被过滤）' },
      { title: '从 Markdown 到公众号：一次讲清楚', angle: '教程' },
    ],
    summary: '这篇文章讲的是如何用 Markdown 专心写作，再一键排版成公众号文章：从本地文件管理、实时预览，到图片处理和发布前校对，每一步都尽量少操心。读完你会得到一套可以直接照做的流程，以及几个避免发布后才发现错别字的小习惯。最后还附上常见问题的解答，帮助你更快上手。',
  }
}

function lastUserText(messages) {
  const user = [...(messages ?? [])].reverse().find(m => m.role === 'user')
  return typeof user?.content === 'string' ? user.content : ''
}

function systemText(messages) {
  return (messages ?? []).filter(m => m.role === 'system').map(m => m.content).join('\n')
}

function decide(body) {
  const system = systemText(body.messages)
  const user = lastUserText(body.messages)
  if (system.includes('校对') && user.includes('"paragraphs"')) {
    const json = JSON.parse(user.slice(user.indexOf('{'), user.lastIndexOf('}') + 1))
    const includeStyle = /^- spacing/m.test(system)
    return { task: 'proofread', content: JSON.stringify(mockProofread(json.paragraphs, { includeStyle })) }
  }
  if (system.includes('拟标题')) {
    return { task: 'titles', content: JSON.stringify(mockTitleSummary()) }
  }
  return { task: 'chat', content: '成功' }
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(data))
}

export function startMockServer({ port = 0, host = '127.0.0.1', delayMs = Number(process.env.MOCK_DELAY_MS ?? 120), log = false } = {}) {
  const requests = []
  const server = http.createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => { raw += c })
    req.on('end', async () => {
      const url = new URL(req.url ?? '/', 'http://x')
      if (req.method === 'GET' && url.pathname.endsWith('/models'))
        return sendJson(res, 200, { object: 'list', data: [{ id: 'mock-model', object: 'model' }] })
      if (req.method !== 'POST' || !url.pathname.endsWith('/chat/completions'))
        return sendJson(res, 404, { error: { message: `Not found: ${url.pathname}` } })

      const key = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '').trim()
      let body
      try {
        body = JSON.parse(raw || '{}')
      }
      catch {
        return sendJson(res, 400, { error: { message: 'Invalid JSON body' } })
      }
      if (!key)
        return sendJson(res, 401, { error: { message: 'Missing API key' } })
      if (key === 'bad-key')
        return sendJson(res, 401, { error: { message: 'Invalid API key (mock)' } })
      if (key === 'no-json-mode' && body.response_format)
        return sendJson(res, 400, { error: { message: 'response_format is not supported by this model (mock)' } })

      const { task, content: plain } = decide(body)
      let content = plain
      if (key === 'fenced')
        content = `好的，结果如下：\n\`\`\`json\n${plain}\n\`\`\`\n`
      if (key === 'broken' && task !== 'chat')
        content = '抱歉，我无法输出 JSON。'
      requests.push({ task, model: body.model, stream: !!body.stream, jsonMode: !!body.response_format, at: Date.now() })
      if (log)
        console.log(`[mock] ${task} model=${body.model} stream=${!!body.stream} json=${!!body.response_format}`)

      if (delayMs > 0)
        await new Promise(r => setTimeout(r, delayMs))

      const id = `chatcmpl-mock-${requests.length}`
      if (body.stream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' })
        const send = obj => res.write(`data: ${JSON.stringify(obj)}\n\n`)
        res.write(': mock keep-alive\n\n')
        send({ id, object: 'chat.completion.chunk', choices: [{ index: 0, delta: { role: 'assistant' } }] })
        const chars = Array.from(content)
        for (let i = 0; i < chars.length; i += 8)
          send({ id, object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content: chars.slice(i, i + 8).join('') } }] })
        send({ id, object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })
        res.end('data: [DONE]\n\n')
        return
      }
      sendJson(res, 200, {
        id,
        object: 'chat.completion',
        model: body.model ?? 'mock-model',
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      })
    })
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      const address = server.address()
      resolve({
        url: `http://${host}:${address.port}/v1`,
        port: address.port,
        requests,
        close: () => new Promise(r => server.close(() => r())),
      })
    })
  })
}

// 直接运行：启动并保持
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const i = process.argv.indexOf('--port')
  const port = i > 0 ? Number(process.argv[i + 1]) : 8787
  const mock = await startMockServer({ port, log: true })
  console.log(`Mock OpenAI-compatible server: ${mock.url}  (Ctrl+C 退出)`)
}
