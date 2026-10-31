/**
 * 两个保留下来的 AI 功能：发布前校对、标题 + 摘要。
 *
 * 这里只依赖 AIService.generateText（不引入 electron），因此单元测试和冒烟脚本
 * （scripts/dev/ai-smoke.mjs）可以用真实的服务商代码直接调用。
 */
import type { AIService } from './types'
import { proofreadText, type ProofreadOptions, type ProofreadResult } from '../../shared/ai/proofread'
import { buildTitleSummaryMessages, parseTitleSummary, type TitleSummaryResult } from '../../shared/ai/publish-meta'

type TextGenerator = Pick<AIService, 'generateText'>

/** 整篇校对：分批请求，每批要求 JSON 输出（低温度，避免「发挥」） */
export function proofreadDocument(service: TextGenerator, text: string, options: ProofreadOptions = {}): Promise<ProofreadResult> {
  return proofreadText(
    (system, user) => service.generateText(user, { systemPrompt: system, maxTokens: 2048, temperature: 0.1, json: true }),
    text,
    options,
  )
}

/** 3～5 个标题候选 + 一段 120 字以内的摘要；JSON 解析失败时重试一次 */
export async function generateTitleSummary(service: TextGenerator, markdown: string): Promise<TitleSummaryResult> {
  const { system, user } = buildTitleSummaryMessages(markdown)
  let parseError: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    const reply = await service.generateText(
      attempt === 0 ? user : `${user}\n\n（请只输出 JSON 对象。）`,
      { systemPrompt: system, maxTokens: 800, temperature: 0.7, json: true },
    )
    try {
      return parseTitleSummary(reply)
    }
    catch (error) {
      parseError = error
    }
  }
  throw parseError instanceof Error ? parseError : new Error(String(parseError))
}
