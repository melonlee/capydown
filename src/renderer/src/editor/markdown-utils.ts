/**
 * 与编辑器 UI 无关的纯函数：大纲提取、字数统计、换行符检测、模糊匹配。
 * 全部可以在 Node 环境下单元测试（tests/unit/editor.test.ts）。
 */

export interface OutlineItem {
  level: number
  text: string
  /** 0-based 行号 */
  line: number
}

const FRONT_MATTER_RE = /^(?:﻿)?---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/

/** Front Matter 结束处的字符偏移（不存在时为 0） */
export function frontMatterLength(text: string): number {
  const m = FRONT_MATTER_RE.exec(text)
  return m ? m[0].length : 0
}

/** 去掉标题文字里的行内 Markdown 标记，用于大纲显示 */
export function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(\*|_)(.+?)\1/g, '$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\\([\\`*_{}[\]()#+\-.!~|>])/g, '$1')
    .trim()
}

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/
const ATX_RE = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/
const SETEXT_RE = /^ {0,3}(=+|-+)[ \t]*$/
const BLOCK_START_RE = /^ {0,3}(?:[>#]|[-*+][ \t]|\d{1,9}[.)][ \t]|`{3}|~{3}|\||<)/

/**
 * 提取文档大纲（ATX 与 Setext 标题），忽略代码块与 Front Matter 里的 "#"。
 */
export function extractOutline(markdown: string): OutlineItem[] {
  const fm = frontMatterLength(markdown)
  const lines = markdown.split(/\r\n|\r|\n/)
  const fmLines = fm ? markdown.slice(0, fm).split(/\r\n|\r|\n/).length - 1 : 0
  const items: OutlineItem[] = []
  let fence: string | null = null
  // 当前段落的起始行（用于 Setext 标题）；-1 表示不在段落中
  let paraStart = -1

  for (let i = fmLines; i < lines.length; i++) {
    const line = lines[i]
    const fenceMatch = FENCE_RE.exec(line)
    if (fence) {
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length && line.trim() === fenceMatch[1])
        fence = null
      continue
    }
    if (fenceMatch) {
      fence = fenceMatch[1]
      paraStart = -1
      continue
    }
    if (/^\s*$/.test(line)) {
      paraStart = -1
      continue
    }
    const atx = ATX_RE.exec(line)
    if (atx) {
      items.push({ level: atx[1].length, text: stripInlineMarkdown(atx[2] || ''), line: i })
      paraStart = -1
      continue
    }
    const setext = SETEXT_RE.exec(line)
    if (setext && paraStart >= 0) {
      const text = lines.slice(paraStart, i).map(l => l.trim()).join(' ')
      items.push({ level: setext[1][0] === '=' ? 1 : 2, text: stripInlineMarkdown(text), line: paraStart })
      paraStart = -1
      continue
    }
    if (paraStart < 0 && !BLOCK_START_RE.test(line) && !/^( {4}|\t)/.test(line))
      paraStart = i
    else if (BLOCK_START_RE.test(line))
      paraStart = -1
  }
  return items
}

/** 光标（0-based 行号）所在的大纲项下标；在第一个标题之前时返回 -1 */
export function activeOutlineIndex(outline: OutlineItem[], line: number): number {
  let idx = -1
  for (let i = 0; i < outline.length; i++) {
    if (outline[i].line <= line)
      idx = i
    else
      break
  }
  return idx
}

export interface TextStats {
  /** 字数：每个中日韩字符算一个字，西文按单词计 */
  words: number
  cjk: number
  latinWords: number
  /** 字符数（不含空白） */
  characters: number
  /** 字符数（含空格，不含换行） */
  charactersWithSpaces: number
  paragraphs: number
  lines: number
  /** 阅读时间（分钟，向上取整；空文档为 0） */
  readingMinutes: number
}

const CJK_RE = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯\u{20000}-\u{2FA1F}]/gu
const LATIN_WORD_RE = /[A-Za-z0-9À-ɏ]+(?:['’.\-][A-Za-z0-9À-ɏ]+)*/g

/** 把 Markdown 转成近似的纯文本（只用于统计） */
export function markdownToPlainText(markdown: string): string {
  let text = markdown.slice(frontMatterLength(markdown))
  text = text
    .replace(/^ {0,3}(`{3,}|~{3,}).*$/gm, '') // 代码块围栏（保留代码内容）
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '') // 图片
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 链接只保留文字
    .replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, '') // 链接定义
    .replace(/<[^>\n]+>/g, '') // HTML 标签
    .replace(/^ {0,3}#{1,6}[ \t]+/gm, '') // 标题标记
    .replace(/^ {0,3}(?:[-*_][ \t]*){3,}$/gm, '') // 分割线
    .replace(/^ {0,3}(?:=+|-+)[ \t]*$/gm, '') // Setext 下划线
    .replace(/^[ \t]*>[ \t]?/gm, '') // 引用
    .replace(/^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/gm, '') // 列表
    .replace(/^[ \t]*\|?(?:[ \t]*:?-+:?[ \t]*\|)+[ \t]*:?-*:?[ \t]*$/gm, '') // 表格分隔行
    .replace(/\|/g, ' ')
    .replace(/(\*\*|__|~~|\*|`)/g, '')
  return text
}

export function computeTextStats(markdown: string): TextStats {
  const plain = markdownToPlainText(markdown)
  const cjk = (plain.match(CJK_RE) || []).length
  const latinWords = (plain.replace(CJK_RE, ' ').match(LATIN_WORD_RE) || []).length
  const noNewline = plain.replace(/\r?\n/g, '')
  const charactersWithSpaces = Array.from(noNewline).length
  const characters = Array.from(noNewline.replace(/\s/g, '')).length
  const paragraphs = plain.split(/\r?\n\s*\r?\n/).filter(p => p.trim()).length
  const lines = markdown === '' ? 0 : markdown.split(/\r\n|\r|\n/).length
  const words = cjk + latinWords
  // 中文约 400 字/分钟，英文约 200 词/分钟
  const minutes = cjk / 400 + latinWords / 200
  return {
    words,
    cjk,
    latinWords,
    characters,
    charactersWithSpaces,
    paragraphs,
    lines,
    readingMinutes: words === 0 ? 0 : Math.max(1, Math.ceil(minutes)),
  }
}

/**
 * 推断编辑器应使用的换行符，目标是「打开、编辑、保存」都不改动原有换行：
 * - 纯 LF：返回 undefined（CodeMirror 默认行为即可）
 * - 纯 CRLF / 纯 CR：返回该分隔符，编辑器按它拆行、保存时按它拼回
 * - 混用：返回 "\n"，只按 LF 拆行，"\r" 作为普通字符原样保留
 */
export function detectLineSeparator(text: string): '\r\n' | '\r' | '\n' | undefined {
  const hasCRLF = text.includes('\r\n')
  const hasLoneLF = /(^|[^\r])\n/.test(text)
  const hasLoneCR = /\r(?!\n)/.test(text)
  const kinds = Number(hasCRLF) + Number(hasLoneLF) + Number(hasLoneCR)
  if (kinds === 0 || (hasLoneLF && kinds === 1))
    return undefined
  if (kinds > 1)
    return '\n'
  return hasCRLF ? '\r\n' : '\r'
}

/**
 * 简单的子序列模糊匹配。返回分数（越大越好），不匹配返回 -1。
 * 连续命中、词首命中、文件名命中会加分。
 */
export function fuzzyScore(query: string, target: string): number {
  const q = query.trim().toLowerCase()
  if (!q)
    return 0
  const t = target.toLowerCase()
  const direct = t.indexOf(q)
  if (direct >= 0)
    return 1000 - direct - (t.length - q.length) * 0.1
  let score = 0
  let ti = 0
  let prev = -2
  for (const ch of q) {
    if (ch === ' ')
      continue
    const found = t.indexOf(ch, ti)
    if (found < 0)
      return -1
    score += 10
    if (found === prev + 1)
      score += 15
    if (found === 0 || /[\s/\\_\-.]/.test(t[found - 1]))
      score += 8
    prev = found
    ti = found + 1
  }
  return score - t.length * 0.1
}
