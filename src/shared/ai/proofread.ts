/**
 * 发布前校对：纯逻辑部分（主进程、测试、冒烟脚本共用，不依赖 Electron / DOM）。
 *
 * 流程：
 *   extractSegments  把 Markdown 切成「段落」，跳过 Front Matter、代码块、公式块、HTML 块等，
 *                    每段记录在原文中的绝对位置 [from, to)
 *   chunkSegments    按字数把段落打包成若干批，长文分批请求
 *   buildProofreadMessages / parseProofreadResponse  构造提示词、解析模型返回的 JSON
 *   locateIssues     把模型给出的「原文片段 → 建议」定位回原文的绝对位置，并做校验：
 *                    只接受小范围改动、不碰链接 / 代码 / Markdown 标记
 *   planEdits / applyEdits / relocateIssue  接受修改时使用
 *
 * 所有位置都是传入字符串的下标（JS UTF-16 下标）。渲染进程传入的是 CodeMirror 的
 * doc.toString()，与编辑器位置一一对应。CRLF 文本同样适用：\r 当作普通字符保留。
 */
import { parseJsonLoose } from './json'

export type ProofreadIssueType = 'typo' | 'grammar' | 'punctuation' | 'spacing' | 'repetition'

export const ISSUE_TYPE_LABELS: Record<ProofreadIssueType, string> = {
  typo: '错别字',
  grammar: '语病',
  punctuation: '标点',
  spacing: '中英文空格',
  repetition: '重复',
}

/**
 * 问题分两类：
 *   error  确定的错误（错别字、语病、标点、重复），默认只报这一类
 *   style  风格建议（目前只有中英文之间的空格），由设置「校对时包含风格建议」打开，默认关闭
 */
export type ProofreadCategory = 'error' | 'style'

export const STYLE_ISSUE_TYPES: readonly ProofreadIssueType[] = ['spacing']

export const CATEGORY_LABELS: Record<ProofreadCategory, string> = {
  error: '错误',
  style: '风格建议',
}

export function issueCategory(type: ProofreadIssueType): ProofreadCategory {
  return STYLE_ISSUE_TYPES.includes(type) ? 'style' : 'error'
}

export interface ProofreadSegment {
  /** 段落编号（P1、P2…），提示词和模型回复里用它指代段落 */
  id: string
  from: number
  to: number
  /** 原文切片 text.slice(from, to)（CRLF 文件里包含 \r） */
  text: string
  /** 段落首行的行号（1 起） */
  line: number
}

export interface ProofreadChunk {
  index: number
  segments: ProofreadSegment[]
}

/** 模型返回的一条问题（尚未定位） */
export interface RawIssue {
  paragraph: string
  original: string
  suggestion: string
  reason: string
  type: ProofreadIssueType
  /** 可选：原文片段前面紧挨着的几个字，用于同一段里出现多次时消歧 */
  before?: string
}

export interface ProofreadIssue {
  id: string
  type: ProofreadIssueType
  from: number
  to: number
  /** 行号（1 起） */
  line: number
  original: string
  suggestion: string
  reason: string
  /** 原文前后各若干字的上下文：显示用，也用于文档改动后重新定位 */
  before: string
  after: string
}

export const DEFAULT_SEGMENT_CHARS = 1200
export const DEFAULT_CHUNK_CHARS = 2400
const CONTEXT_CHARS = 12
const MAX_ORIGINAL_CHARS = 120

// ---------------------------------------------------------------------------
// 切段
// ---------------------------------------------------------------------------

interface LineInfo {
  start: number
  /** 行尾（不含 \r\n / \n） */
  end: number
  text: string
}

function splitLines(text: string): LineInfo[] {
  const lines: LineInfo[] = []
  let pos = 0
  while (true) {
    const nl = text.indexOf('\n', pos)
    let end = nl < 0 ? text.length : nl
    if (end > pos && text[end - 1] === '\r')
      end--
    lines.push({ start: pos, end, text: text.slice(pos, end) })
    if (nl < 0)
      break
    pos = nl + 1
  }
  // BOM 不属于正文
  if (lines[0]?.text.startsWith('\uFEFF')) {
    lines[0].start += 1
    lines[0].text = lines[0].text.slice(1)
  }
  return lines
}

/** 行首偏移 → 行号的二分查找表 */
function lineLocator(text: string): (offset: number) => number {
  const starts = [0]
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10)
      starts.push(i + 1)
  }
  return (offset: number) => {
    let lo = 0
    let hi = starts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (starts[mid] <= offset)
        lo = mid
      else
        hi = mid - 1
    }
    return lo + 1
  }
}

const RE_FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/
const RE_HEADING = /^ {0,3}#{1,6}(?:\s|$)/
const RE_HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/
const RE_REF_DEF = /^ {0,3}\[[^\]]+\]:\s*\S/
const RE_HTML_BLOCK = /^ {0,3}<(?:!--|\/?[a-z][\w-]*(?:[\s/>]|$))/i
const RE_LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s/
const RE_INDENTED = /^(?: {4}|\t)/
const RE_SETEXT_UNDERLINE = /^ {0,3}(?:=+|-+)[ \t]*$/

/**
 * 把 Markdown 切成需要校对的段落。跳过：Front Matter、围栏代码块、$$ 公式块、HTML 块与注释、
 * 缩进代码块、分割线、引用式链接定义、只有图片 / 链接 / 标记没有文字的段落。
 * 标题单独成段；超过 maxSegmentChars 的长段在句末切开。
 */
export function extractSegments(text: string, maxSegmentChars = DEFAULT_SEGMENT_CHARS): ProofreadSegment[] {
  const lines = splitLines(text)
  const lineOf = lineLocator(text)
  const ranges: { from: number, to: number }[] = []

  let paraStart = -1
  let paraEnd = -1
  let paraIsList = false
  let lastWasList = false
  let prevBlank = true

  const flush = () => {
    if (paraStart >= 0) {
      ranges.push({ from: paraStart, to: paraEnd })
      lastWasList = paraIsList
    }
    paraStart = -1
    paraIsList = false
  }

  let i = 0
  // Front Matter：首行 --- 到下一个 --- / ...
  if (lines[0] && /^---[ \t]*$/.test(lines[0].text)) {
    const close = lines.findIndex((l, idx) => idx > 0 && /^(?:---|\.\.\.)[ \t]*$/.test(l.text))
    if (close > 0)
      i = close + 1
  }

  for (; i < lines.length; i++) {
    const line = lines[i]
    const t = line.text

    if (!t.trim()) {
      flush()
      prevBlank = true
      continue
    }

    // 围栏代码块
    const fence = t.match(RE_FENCE_OPEN)
    if (fence) {
      flush()
      const ch = fence[1][0]
      const len = fence[1].length
      const closeRe = new RegExp(`^ {0,3}${ch === '`' ? '`' : '~'}{${len},}[ \\t]*$`)
      let j = i + 1
      while (j < lines.length && !closeRe.test(lines[j].text))
        j++
      i = j
      prevBlank = false
      continue
    }

    // $$ 公式块
    if (/^\s*\$\$/.test(t)) {
      flush()
      const rest = t.trim().slice(2)
      if (!rest.includes('$$')) {
        let j = i + 1
        while (j < lines.length && !lines[j].text.includes('$$'))
          j++
        i = j
      }
      prevBlank = false
      continue
    }

    // HTML 注释 / HTML 块（到空行结束）
    if (paraStart < 0 && RE_HTML_BLOCK.test(t)) {
      if (t.trimStart().startsWith('<!--')) {
        let j = i
        while (j < lines.length && !lines[j].text.includes('-->'))
          j++
        i = j
      }
      else {
        while (i + 1 < lines.length && lines[i + 1].text.trim())
          i++
      }
      prevBlank = false
      continue
    }

    // 缩进代码块：前面是空行、且不在列表里
    if (paraStart < 0 && prevBlank && !lastWasList && RE_INDENTED.test(t)) {
      while (i + 1 < lines.length && (RE_INDENTED.test(lines[i + 1].text) || !lines[i + 1].text.trim()))
        i++
      prevBlank = false
      continue
    }

    // Setext 标题下划线（=== / ---）：不校对，同时结束当前段
    if (paraStart >= 0 && RE_SETEXT_UNDERLINE.test(t)) {
      flush()
      prevBlank = false
      continue
    }

    if (RE_HR.test(t) || RE_REF_DEF.test(t)) {
      flush()
      prevBlank = false
      continue
    }

    if (RE_HEADING.test(t)) {
      flush()
      ranges.push({ from: line.start, to: line.end })
      lastWasList = false
      prevBlank = false
      continue
    }

    if (paraStart < 0) {
      paraStart = line.start
      paraIsList = RE_LIST_ITEM.test(t)
    }
    else if (RE_LIST_ITEM.test(t)) {
      paraIsList = true
    }
    paraEnd = line.end
    prevBlank = false
  }
  flush()

  const segments: ProofreadSegment[] = []
  for (const r of ranges) {
    for (const piece of splitLong(text, r.from, r.to, maxSegmentChars)) {
      const slice = text.slice(piece.from, piece.to)
      if (!hasProse(slice))
        continue
      segments.push({ id: `P${segments.length + 1}`, from: piece.from, to: piece.to, text: slice, line: lineOf(piece.from) })
    }
  }
  return segments
}

/** 长段落在句末（。！？；或换行）切开，每片不超过 max 个字符 */
function splitLong(text: string, from: number, to: number, max: number): { from: number, to: number }[] {
  const out: { from: number, to: number }[] = []
  let start = from
  while (to - start > max) {
    const window = text.slice(start, start + max)
    let cut = -1
    for (let k = window.length - 1; k >= max / 2; k--) {
      if ('。！？；!?;\n'.includes(window[k])) {
        cut = k + 1
        break
      }
    }
    if (cut < 0)
      cut = max
    // 不要把 \r\n 拆开
    if (window[cut - 1] === '\r')
      cut++
    out.push({ from: start, to: start + cut })
    start += cut
    while (start < to && /\s/.test(text[start]))
      start++
  }
  if (to > start)
    out.push({ from: start, to })
  return out
}

/** 去掉受保护片段和标记后还有没有文字 */
function hasProse(segmentText: string): boolean {
  const norm = segmentText.replace(/\r/g, '')
  let stripped = ''
  let last = 0
  for (const [s, e] of protectedRanges(norm)) {
    if (s > last)
      stripped += norm.slice(last, s)
    last = Math.max(last, e)
  }
  stripped += norm.slice(last)
  return /[\p{L}\p{N}]/u.test(stripped)
}

/** 按字数把段落打包成批次（单段超过上限时独占一批） */
export function chunkSegments(segments: ProofreadSegment[], maxChars = DEFAULT_CHUNK_CHARS): ProofreadChunk[] {
  const chunks: ProofreadChunk[] = []
  let current: ProofreadSegment[] = []
  let size = 0
  for (const seg of segments) {
    const len = seg.text.length
    if (current.length && size + len > maxChars) {
      chunks.push({ index: chunks.length, segments: current })
      current = []
      size = 0
    }
    current.push(seg)
    size += len
  }
  if (current.length)
    chunks.push({ index: chunks.length, segments: current })
  return chunks
}

// ---------------------------------------------------------------------------
// 受保护的片段：代码、链接地址、图片、HTML、URL、公式、Markdown 块标记
// ---------------------------------------------------------------------------

const PROTECTED_PATTERNS: RegExp[] = [
  // 行首块标记：引用 >、标题 #、列表符号、任务框、有序编号
  /^[ \t]*(?:>[ \t]?)*(?:#{1,6}[ \t]+|[-*+][ \t]+(?:\[[ xX]\][ \t]+)?|\d+[.)][ \t]+)/gm,
  // 表格分隔行
  /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)+\|?[ \t]*$|^[ \t]*\|[ \t]*:?-+:?[ \t]*\|[ \t]*$/gm,
  // 行内代码
  /(`+)[\s\S]*?\1/g,
  // 图片整体
  /!\[[^\]\n]*\]\([^)\n]*\)/g,
  // 链接地址、引用式链接的标识
  /\]\([^)\n]*\)/g,
  /\]\[[^\]\n]*\]/g,
  // 自动链接、HTML 标签
  /<[a-z][a-z0-9+.-]*:[^>\s]*>/gi,
  /<\/?[a-z][^>\n]*>/gi,
  // 裸 URL（遇到中文或全角标点停止）
  /(?:https?:\/\/|www\.)[^\s<>"'()\uFF08\uFF09\u3000-\u303F\uFF00-\uFFEF\u4E00-\u9FFF]+/gi,
  // 邮箱
  /[\w.+-]+@[\w-]+\.[\w.-]+/g,
  // 行内公式、脚注引用、HTML 实体
  /\$[^$\n]+\$/g,
  /\[\^[^\]\n]+\]/g,
  /&(?:[a-z]+|#\d+);/gi,
]

/** 返回排好序、已合并的受保护区间 [start, end)（相对于传入文本） */
export function protectedRanges(text: string): [number, number][] {
  const ranges: [number, number][] = []
  for (const re of PROTECTED_PATTERNS) {
    re.lastIndex = 0
    for (const m of text.matchAll(re)) {
      if (m[0].length > 0)
        ranges.push([m.index!, m.index! + m[0].length])
    }
  }
  ranges.sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const r of ranges) {
    const last = merged[merged.length - 1]
    if (last && r[0] <= last[1])
      last[1] = Math.max(last[1], r[1])
    else
      merged.push([r[0], r[1]])
  }
  return merged
}

// ---------------------------------------------------------------------------
// 提示词
// ---------------------------------------------------------------------------

const PROMPT_HEAD = `你是一名严谨的中文校对编辑，负责公众号文章发布前的最后一遍校对。文章发布后正文最多只能修改 20 个字，所以只指出确定的错误。`

const ERROR_RULES = `- typo：错别字、同音/形近字误用（如「在次」→「再次」、「做为」→「作为」）、明显的英文拼写错误
- grammar：明显的语病（成分残缺、搭配不当、语序错误），只做最小改动
- punctuation：标点误用（中文句子里用了半角标点、成对标点不匹配、重复标点）
- repetition：重复用词（如「的的」「我们我们」），或相邻句子里明显多余的重复`

const STYLE_RULE = `- spacing（风格建议）：中文与英文单词、中文与阿拉伯数字之间缺少空格，或多余的空格`

const PROMPT_TAIL = `严格遵守：
- 不润色、不改写风格、不替换同义词、不调整语气，不改动观点、事实、数据和专有名词
- 不改动 Markdown 标记（# * _ \` [ ] > | 等）、链接地址、代码、公式、HTML
- original 必须逐字摘自对应段落（包括空格和标点），长度 2～30 个字，并且在该段落中只出现一次；不够唯一就向前后多带几个字
- suggestion 是把 original 改正之后的同一段文字，只改错误处
- 不确定的不报；没有问题就返回空数组

只输出 JSON，不要任何解释，格式：
{"issues":[{"p":"P1","type":"typo","original":"原文片段","suggestion":"改正后的片段","reason":"一句话说明"}]}`

/** 系统提示词：默认只查四类错误；includeStyle 时额外检查中英文空格（风格建议） */
export function buildProofreadSystemPrompt(includeStyle = false): string {
  const rules = includeStyle
    ? `只检查这五类问题：\n${ERROR_RULES}\n${STYLE_RULE}`
    : `只检查这四类问题：\n${ERROR_RULES}\n\n中英文之间是否加空格属于个人风格，不要报告空格问题。`
  return `${PROMPT_HEAD}\n\n${rules}\n\n${PROMPT_TAIL}`
}

/** 默认（只查错误）的系统提示词 */
export const PROOFREAD_SYSTEM_PROMPT = buildProofreadSystemPrompt(false)

/** 构造一批段落的提示词（用户消息是 JSON，段落边界不会混淆） */
export function buildProofreadMessages(chunk: ProofreadChunk, options: { includeStyle?: boolean } = {}): { system: string, user: string } {
  const paragraphs = chunk.segments.map(s => ({ id: s.id, text: s.text.replace(/\r\n/g, '\n') }))
  return {
    system: buildProofreadSystemPrompt(options.includeStyle),
    user: `请校对下面的段落（JSON 数组，id 是段落编号）：\n${JSON.stringify({ paragraphs })}`,
  }
}

// ---------------------------------------------------------------------------
// 解析与校验
// ---------------------------------------------------------------------------

const TYPE_ALIASES: Record<string, ProofreadIssueType> = {
  typo: 'typo',
  spelling: 'typo',
  错别字: 'typo',
  错字: 'typo',
  grammar: 'grammar',
  语病: 'grammar',
  语法: 'grammar',
  punctuation: 'punctuation',
  标点: 'punctuation',
  spacing: 'spacing',
  space: 'spacing',
  空格: 'spacing',
  repetition: 'repetition',
  repeat: 'repetition',
  duplicate: 'repetition',
  重复: 'repetition',
  重复用词: 'repetition',
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string')
      return v
    if (typeof v === 'number')
      return String(v)
  }
  return undefined
}

/** 解析模型回复，返回结构合法的条目（字段名、类型名有一定容错）；整体不是合法 JSON 时抛错 */
export function parseProofreadResponse(raw: string): RawIssue[] {
  const data = parseJsonLoose(raw) as any
  const list = Array.isArray(data) ? data : (data?.issues ?? data?.errors ?? data?.items ?? data?.results)
  if (!Array.isArray(list))
    throw new Error('模型返回的 JSON 里没有 issues 数组')
  const out: RawIssue[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object')
      continue
    const original = pickString(item, ['original', 'text', 'wrong', 'source'])
    const suggestion = pickString(item, ['suggestion', 'correct', 'correction', 'fix', 'replacement'])
    if (original === undefined || suggestion === undefined)
      continue
    const typeRaw = (pickString(item, ['type', 'category', 'kind']) ?? '').trim().toLowerCase()
    out.push({
      paragraph: (pickString(item, ['p', 'paragraph', 'id', 'pid', 'para']) ?? '').trim(),
      original,
      suggestion,
      reason: (pickString(item, ['reason', 'explanation', 'note', 'why', 'message']) ?? '').trim().slice(0, 120),
      type: TYPE_ALIASES[typeRaw] ?? 'grammar',
      before: pickString(item, ['before', 'prefix', 'context']),
    })
  }
  return out
}

function levenshtein(a: string, b: string): number {
  const A = Array.from(a)
  const B = Array.from(b)
  let prev = Array.from({ length: B.length + 1 }, (_, j) => j)
  for (let i = 1; i <= A.length; i++) {
    const cur = [i]
    for (let j = 1; j <= B.length; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[B.length]
}

const MARKUP_CHARS = /[*_`~[\]#<>|\\$]/g

/**
 * 校验一条修改是否属于「校对」范围：返回拒绝原因，合格返回 null。
 * 规则：原文非空且不过长；建议与原文不同；改动量小（编辑距离 ≤ max(4, 60% 长度)）；
 * 不增删换行；不改动 Markdown 标记字符。
 */
export function rejectReason(original: string, suggestion: string): string | null {
  if (!original.trim())
    return '原文为空'
  if (original.length > MAX_ORIGINAL_CHARS)
    return '原文片段过长'
  if (suggestion === original)
    return '没有改动'
  if ((suggestion.match(/\n/g) ?? []).length !== (original.match(/\n/g) ?? []).length)
    return '改动了换行'
  if (suggestion.length > original.length + 20)
    return '改动过大'
  const markA = (original.match(MARKUP_CHARS) ?? []).sort().join('')
  const markB = (suggestion.match(MARKUP_CHARS) ?? []).sort().join('')
  if (markA !== markB)
    return '改动了 Markdown 标记'
  const limit = Math.max(4, Math.ceil(Math.max(Array.from(original).length, Array.from(suggestion).length) * 0.6))
  if (levenshtein(original, suggestion) > limit)
    return '改动过大，超出校对范围'
  return null
}

/** \r\n → \n，并记录归一化后每个下标对应的原始下标 */
function normalizeWithMap(raw: string): { norm: string, map: number[] } {
  let norm = ''
  const map: number[] = []
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '\r' && raw[i + 1] === '\n')
      continue
    map.push(i)
    norm += raw[i]
  }
  map.push(raw.length)
  return { norm, map }
}

function allIndexesOf(hay: string, needle: string): number[] {
  const out: number[] = []
  if (!needle)
    return out
  let i = hay.indexOf(needle)
  while (i >= 0) {
    out.push(i)
    i = hay.indexOf(needle, i + 1)
  }
  return out
}

const overlaps = (a: number, b: number, s: number, e: number) => a < e && s < b

/**
 * 把一批模型结果定位到原文：返回带绝对位置的问题列表（按位置排序）。
 * 不合格（找不到原文、碰到受保护片段、改动过大、与已有问题重叠）的条目直接丢弃。
 */
export function locateIssues(fullText: string, chunk: ProofreadChunk, raws: RawIssue[]): ProofreadIssue[] {
  const lineOf = lineLocator(fullText)
  const prepared = new Map(chunk.segments.map((s) => {
    const { norm, map } = normalizeWithMap(s.text)
    return [s.id.toUpperCase(), { seg: s, norm, map, guard: protectedRanges(norm), claimed: [] as [number, number][] }]
  }))
  const issues: ProofreadIssue[] = []

  for (const raw of raws) {
    const original = raw.original.replace(/\r\n/g, '\n')
    const suggestion = raw.suggestion.replace(/\r\n/g, '\n')
    if (rejectReason(original, suggestion))
      continue

    // 段落编号容错：「3」「p3」「P3」都认；编号不对时在本批里找唯一包含该片段的段落
    let id = raw.paragraph.toUpperCase()
    if (/^\d+$/.test(id))
      id = `P${id}`
    let entry = prepared.get(id)
    if (!entry || !entry.norm.includes(original)) {
      const candidates = [...prepared.values()].filter(p => p.norm.includes(original))
      entry = candidates.length === 1 ? candidates[0] : undefined
    }
    if (!entry)
      continue

    const free = allIndexesOf(entry.norm, original).filter((pos) => {
      const end = pos + original.length
      return !entry!.guard.some(([s, e]) => overlaps(pos, end, s, e))
        && !entry!.claimed.some(([s, e]) => overlaps(pos, end, s, e))
    })
    if (!free.length)
      continue
    let pos = free[0]
    if (raw.before) {
      const hinted = free.find(p => entry!.norm.slice(0, p).endsWith(raw.before!))
      if (hinted !== undefined)
        pos = hinted
    }
    const end = pos + original.length
    entry.claimed.push([pos, end])

    const from = entry.seg.from + entry.map[pos]
    const to = entry.seg.from + entry.map[end]
    const rawOriginal = fullText.slice(from, to)
    issues.push({
      id: `${entry.seg.id}-${from}`,
      type: raw.type,
      from,
      to,
      line: lineOf(from),
      original: rawOriginal,
      // CRLF 段落里跨行的片段：建议里的换行也写回 \r\n
      suggestion: rawOriginal.includes('\r\n') ? suggestion.replace(/\n/g, '\r\n') : suggestion,
      reason: raw.reason,
      before: fullText.slice(Math.max(0, from - CONTEXT_CHARS), from),
      after: fullText.slice(to, to + CONTEXT_CHARS),
    })
  }
  return issues.sort((a, b) => a.from - b.from)
}

// ---------------------------------------------------------------------------
// 整篇校对（调用方提供「发一次请求」的函数，主进程用真实服务商，测试用假数据）
// ---------------------------------------------------------------------------

export type ProofreadGenerate = (system: string, user: string) => Promise<string>

export interface ProofreadOptions {
  maxChunkChars?: number
  maxSegmentChars?: number
  /** 同时进行的请求数 */
  concurrency?: number
  /** 是否包含风格建议（中英文空格）。默认 false：只返回错别字、语病、标点、重复 */
  includeStyle?: boolean
  onProgress?: (done: number, total: number) => void
  /** 返回 true 时不再发起新的请求（已经发出的会等它完成） */
  isCancelled?: () => boolean
}

export interface ProofreadResult {
  issues: ProofreadIssue[]
  totalChunks: number
  failedChunks: { index: number, line: number, error: string }[]
  /** 实际检查了多少字（不含跳过的代码块等） */
  checkedChars: number
  cancelled: boolean
}

export async function proofreadText(generate: ProofreadGenerate, text: string, options: ProofreadOptions = {}): Promise<ProofreadResult> {
  const segments = extractSegments(text, options.maxSegmentChars)
  const chunks = chunkSegments(segments, options.maxChunkChars)
  const includeStyle = options.includeStyle ?? false
  const issues: ProofreadIssue[] = []
  const failedChunks: ProofreadResult['failedChunks'] = []
  let done = 0
  let next = 0
  let cancelled = false
  options.onProgress?.(0, chunks.length)

  async function runChunk(chunk: ProofreadChunk) {
    const { system, user } = buildProofreadMessages(chunk, { includeStyle })
    let lastError: unknown
    // JSON 解析失败时重试一次；网络 / 鉴权错误不重试，直接报给用户
    for (let attempt = 0; attempt < 2; attempt++) {
      let reply: string
      try {
        reply = await generate(system, attempt === 0 ? user : `${user}\n\n（上一次的回复不是合法 JSON。请只输出 JSON 对象。）`)
      }
      catch (error) {
        lastError = error
        break
      }
      try {
        // 模型偶尔不听话：风格建议关闭时，即使返回了空格类问题也丢掉
        const located = locateIssues(text, chunk, parseProofreadResponse(reply))
        issues.push(...(includeStyle ? located : located.filter(i => issueCategory(i.type) === 'error')))
        return
      }
      catch (error) {
        lastError = error
      }
    }
    failedChunks.push({
      index: chunk.index,
      line: chunk.segments[0]?.line ?? 1,
      error: lastError instanceof Error ? lastError.message : String(lastError),
    })
  }

  async function worker() {
    while (next < chunks.length) {
      if (options.isCancelled?.()) {
        cancelled = true
        return
      }
      const chunk = chunks[next++]
      await runChunk(chunk)
      done++
      options.onProgress?.(done, chunks.length)
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(options.concurrency ?? 3, chunks.length)) }, worker)
  await Promise.all(workers)

  issues.sort((a, b) => a.from - b.from)
  return {
    issues: dropOverlaps(issues),
    totalChunks: chunks.length,
    failedChunks: failedChunks.sort((a, b) => a.index - b.index),
    checkedChars: segments.reduce((n, s) => n + s.text.length, 0),
    cancelled,
  }
}

function dropOverlaps<T extends { from: number, to: number }>(sorted: T[]): T[] {
  const out: T[] = []
  for (const it of sorted) {
    const last = out[out.length - 1]
    if (!last || it.from >= last.to)
      out.push(it)
  }
  return out
}

// ---------------------------------------------------------------------------
// 应用修改
// ---------------------------------------------------------------------------

export interface TextEdit {
  id: string
  from: number
  to: number
  original: string
  suggestion: string
}

/**
 * 检查一组修改能否安全应用：原文仍在原处、彼此不重叠。返回按位置排序的可应用修改和被跳过的 id。
 * 渲染进程用它生成一次性的 CodeMirror 事务（一次撤销即可还原「全部接受」）。
 */
export function planEdits<T extends TextEdit>(text: string, edits: T[]): { apply: T[], skipped: string[] } {
  const apply: T[] = []
  const skipped: string[] = []
  const sorted = [...edits].sort((a, b) => a.from - b.from || a.to - b.to)
  let lastEnd = -1
  for (const e of sorted) {
    if (e.from < lastEnd || e.from < 0 || e.to > text.length || text.slice(e.from, e.to) !== e.original) {
      skipped.push(e.id)
      continue
    }
    apply.push(e)
    lastEnd = e.to
  }
  return { apply, skipped }
}

/** 纯字符串版本：从后往前替换，前面的位置不受影响 */
export function applyEdits(text: string, edits: TextEdit[]): { text: string, applied: string[], skipped: string[] } {
  const { apply, skipped } = planEdits(text, edits)
  let out = text
  for (let k = apply.length - 1; k >= 0; k--) {
    const e = apply[k]
    out = out.slice(0, e.from) + e.suggestion + out.slice(e.to)
  }
  return { text: out, applied: apply.map(e => e.id), skipped }
}

/**
 * 文档在校对之后又被改动过：按原文片段 + 上下文重新找位置。
 * 先看原位置；否则在全文里找同样的片段，上下文吻合的优先，其次离原位置最近的（不超过 maxDistance）。
 */
export function relocateIssue(text: string, issue: Pick<ProofreadIssue, 'from' | 'to' | 'original' | 'before' | 'after'>, maxDistance = 5000): { from: number, to: number } | null {
  const contextOk = (pos: number) => {
    const end = pos + issue.original.length
    return (!issue.before || text.slice(Math.max(0, pos - issue.before.length), pos) === issue.before)
      && (!issue.after || text.slice(end, end + issue.after.length) === issue.after)
  }
  // 原位置的文字没变、上下文也对得上：直接用
  if (text.slice(issue.from, issue.to) === issue.original && contextOk(issue.from))
    return { from: issue.from, to: issue.to }
  let best: { pos: number, score: number } | null = null
  for (const pos of allIndexesOf(text, issue.original)) {
    const distance = Math.abs(pos - issue.from)
    let score = distance
    const end = pos + issue.original.length
    if (issue.before && text.slice(Math.max(0, pos - issue.before.length), pos) === issue.before)
      score -= 100000
    if (issue.after && text.slice(end, end + issue.after.length) === issue.after)
      score -= 100000
    if (score > maxDistance)
      continue
    if (!best || score < best.score)
      best = { pos, score }
  }
  return best ? { from: best.pos, to: best.pos + issue.original.length } : null
}
