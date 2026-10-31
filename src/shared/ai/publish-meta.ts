/**
 * 发布对话框里的「AI 拟标题 + 摘要」：提示词、解析与长度规则（纯逻辑，主进程与测试共用）。
 *
 * 公众号限制：标题最多 64 个字，摘要最多 120 个字（按字符计，中英文都算 1 个）。
 */
import { parseJsonLoose } from './json'

export const WECHAT_TITLE_MAX = 64
export const WECHAT_SUMMARY_MAX = 120
export const TITLE_MIN_COUNT = 3
export const TITLE_MAX_COUNT = 5

export interface TitleCandidate {
  title: string
  /** 角度：结论先行、提问、数字清单…（模型给出，可能为空） */
  angle: string
}

export interface TitleSummaryResult {
  titles: TitleCandidate[]
  summary: string
}

/** 公众号计数方式：按 Unicode 字符计（emoji、中文、英文字母都算 1） */
export function wechatLength(s: string): number {
  return Array.from(s).length
}

/**
 * 喂给模型的正文：去掉 Front Matter、代码块、图片、HTML，压缩空行；
 * 太长时保留开头和结尾（标题和摘要主要看开头的论点与结尾的结论）。
 */
export function articleForPrompt(markdown: string, maxChars = 6000): string {
  let text = markdown.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '')
  text = text.replace(/^---\n[\s\S]*?\n(?:---|\.\.\.)\n/, '')
  text = text.replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n {0,3}\1[^\n]*|$)/gm, '')
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
  text = text.replace(/<[^>\n]+>/g, '')
  text = text.replace(/\n{3,}/g, '\n\n').trim()
  if (text.length <= maxChars)
    return text
  const head = Math.floor(maxChars * 0.8)
  return `${text.slice(0, head)}\n\n……（中间省略）……\n\n${text.slice(-(maxChars - head))}`
}

export const TITLE_SUMMARY_SYSTEM_PROMPT = `你是资深的公众号编辑，为文章拟标题和摘要。

标题要求：
- 给出 ${TITLE_MIN_COUNT}～${TITLE_MAX_COUNT} 个候选，角度各不相同（例如：结论先行、提出问题、数字清单、场景痛点、反常识），每个注明角度
- 每个标题不超过 30 个字（公众号上限 ${WECHAT_TITLE_MAX} 字，越短越好）
- 准确概括文章内容，不做标题党，不夸大，不使用「震惊」「必看」之类的词

摘要要求：
- 一段话，不超过 ${WECHAT_SUMMARY_MAX} 个字，用于公众号的「摘要」栏和分享卡片
- 说清文章讲什么、读者能得到什么；不要以「本文」开头，不加引号

只输出 JSON，不要任何解释，格式：
{"titles":[{"title":"标题","angle":"角度"}],"summary":"摘要"}`

export function buildTitleSummaryMessages(markdown: string): { system: string, user: string } {
  return {
    system: TITLE_SUMMARY_SYSTEM_PROMPT,
    user: `文章正文如下：\n\n${articleForPrompt(markdown)}`,
  }
}

const QUOTE_PAIRS: Record<string, string> = { '"': '"', '\'': '\'', '“': '”', '‘': '’', '「': '」', '『': '』', '【': '】', '《': '》' }

/** 去掉编号、「标题：」之类的前缀，以及包住整行的一对引号（《三体》读后感 这类不动） */
function cleanLine(s: string): string {
  let t = s
    .trim()
    .replace(/^(?:\d+[.、)）]|[-*•])\s*/, '')
    .replace(/^(?:标题|摘要)\s*[:：]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
  const close = QUOTE_PAIRS[t[0]]
  if (close && t.length > 2 && t.endsWith(close) && !t.slice(1, -1).includes(close))
    t = t.slice(1, -1).trim()
  return t
}

/** 摘要超长时在句末截断（找不到句末就硬截断） */
export function clampSummary(summary: string, max = WECHAT_SUMMARY_MAX): string {
  const chars = Array.from(cleanLine(summary).replace(/\n+/g, ''))
  if (chars.length <= max)
    return chars.join('')
  const cut = chars.slice(0, max)
  for (let i = cut.length - 1; i >= max * 0.6; i--) {
    if ('。！？；!?;'.includes(cut[i]))
      return cut.slice(0, i + 1).join('')
  }
  return cut.join('')
}

/**
 * 解析模型回复。容忍：顶层直接是数组、titles 是字符串数组、字段名用中文。
 * 标题：清理、去重、超过 64 字的丢弃，最多 5 个；一个可用标题都没有时抛错。
 */
export function parseTitleSummary(raw: string): TitleSummaryResult {
  const data = parseJsonLoose(raw) as any
  const rawTitles: unknown[] = Array.isArray(data) ? data : (data?.titles ?? data?.标题 ?? [])
  const seen = new Set<string>()
  const titles: TitleCandidate[] = []
  for (const item of Array.isArray(rawTitles) ? rawTitles : []) {
    const title = cleanLine(typeof item === 'string' ? item : String((item as any)?.title ?? (item as any)?.标题 ?? ''))
    const angle = typeof item === 'object' && item ? cleanLine(String((item as any).angle ?? (item as any).角度 ?? '')) : ''
    if (!title || wechatLength(title) > WECHAT_TITLE_MAX || seen.has(title))
      continue
    seen.add(title)
    titles.push({ title, angle })
    if (titles.length >= TITLE_MAX_COUNT)
      break
  }
  if (!titles.length)
    throw new Error('模型没有返回可用的标题')
  const summaryRaw = Array.isArray(data) ? '' : String(data?.summary ?? data?.摘要 ?? data?.digest ?? '')
  return { titles, summary: clampSummary(summaryRaw) }
}
