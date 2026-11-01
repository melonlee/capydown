/**
 * Markdown → Word（.docx）。
 *
 * 用 marked 的词法分析结果（token 树）映射到 docx 的段落 / 表格：
 * 标题、粗体 / 斜体 / 删除线 / 行内代码、链接、有序 / 无序 / 任务列表（可嵌套）、引用、
 * 代码块（等宽 + 底纹）、表格（边框 + 表头）、分割线、图片（本地相对路径与 http(s) 都嵌入，按版心宽度缩放）。
 * 版式保持黑白灰；中文用 eastAsia 字体（正文宋体、标题黑体）。
 */
import { readFile } from 'fs/promises'
import * as path from 'path'
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  type ParagraphChild,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'
import { Lexer, type Token, type Tokens } from 'marked'
import { fitImage, type ImageInfo, readImageInfo } from './image-size'

// ---------------------------------------------------------------------------- 版式常量

/** A4，单位 twip（1/20 磅）；左右边距 2.2 cm */
const PAGE = { width: 11906, height: 16838, margin: 1247 }
const CONTENT_WIDTH_TWIPS = PAGE.width - PAGE.margin * 2
/** 版心宽度（像素，96 dpi：1 px = 15 twip） */
export const MAX_IMAGE_WIDTH_PX = Math.floor(CONTENT_WIDTH_TWIPS / 15)
export const MAX_IMAGE_HEIGHT_PX = Math.floor((PAGE.height - PAGE.margin * 2) / 15 * 0.85)

export const FONTS = {
  body: { ascii: 'Times New Roman', hAnsi: 'Times New Roman', eastAsia: '宋体', cs: 'Times New Roman' },
  heading: { ascii: 'Arial', hAnsi: 'Arial', eastAsia: '黑体', cs: 'Arial' },
  mono: { ascii: 'Consolas', hAnsi: 'Consolas', eastAsia: '宋体', cs: 'Consolas' },
}

const COLOR = { text: '333333', strong: '111111', muted: '777777', border: 'DDDDDD', codeBg: 'F6F6F6', inlineCodeBg: 'EFEFEF', headerBg: 'F3F3F3' }
const INDENT_STEP = 420 // 每级缩进（twip）
const ORDERED_REF = 'lb-ordered'

// ---------------------------------------------------------------------------- 图片

export interface LoadedImage extends ImageInfo {
  data: Buffer
}

export interface DocxExportOptions {
  /** 解析相对图片路径的目录（文档所在目录） */
  baseDir?: string
  /** 下载网络图片；返回 null 表示失败（默认用全局 fetch，10 秒超时） */
  fetchRemote?: (url: string) => Promise<Buffer | null>
  /** 读取本地文件（测试可替换） */
  readLocal?: (absPath: string) => Promise<Buffer>
}

const MAX_IMAGE_BYTES = 20 * 1024 * 1024

async function defaultFetchRemote(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: 'follow' })
    if (!res.ok)
      return null
    const buf = Buffer.from(await res.arrayBuffer())
    return buf.length <= MAX_IMAGE_BYTES ? buf : null
  }
  catch {
    return null
  }
}

/** Markdown 图片地址 → 本地绝对路径（相对路径基于文档目录）；网络 / data 地址返回 null */
export function resolveImagePath(src: string, baseDir: string): string | null {
  if (/^(?:https?:|data:|blob:)/i.test(src))
    return null
  let p = src.replace(/^file:\/\//i, '')
  try {
    p = decodeURI(p)
  }
  catch {}
  p = p.replace(/[?#].*$/, '')
  return path.isAbsolute(p) ? p : path.join(baseDir, p)
}

async function loadImage(src: string, opts: DocxExportOptions): Promise<LoadedImage | null> {
  try {
    let data: Buffer | null = null
    const dataUrl = /^data:image\/[\w.+-]+;base64,(.*)$/i.exec(src)
    if (dataUrl) {
      data = Buffer.from(dataUrl[1], 'base64')
    }
    else if (/^https?:/i.test(src)) {
      data = await (opts.fetchRemote ?? defaultFetchRemote)(src)
    }
    else {
      const abs = resolveImagePath(src, opts.baseDir ?? process.cwd())
      if (abs)
        data = await (opts.readLocal ?? readFile)(abs)
    }
    if (!data || data.length > MAX_IMAGE_BYTES)
      return null
    const info = readImageInfo(data)
    return info ? { ...info, data } : null
  }
  catch {
    return null
  }
}

// ---------------------------------------------------------------------------- 行内元素

export interface InlineStyle {
  bold?: boolean
  italics?: boolean
  strike?: boolean
  code?: boolean
  link?: boolean
  color?: string
}

interface Ctx {
  images: Map<string, LoadedImage | null>
  /** 有序列表实例计数：每个列表从 1 开始编号 */
  listInstance: number
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
}

/** 一段纯文本 → TextRun（按样式设置字体、底纹、颜色） */
export function textRun(text: string, style: InlineStyle = {}): TextRun {
  return new TextRun({
    text,
    bold: style.bold || undefined,
    italics: style.italics || undefined,
    strike: style.strike || undefined,
    color: style.color ?? (style.bold ? COLOR.strong : undefined),
    underline: style.link ? { color: '888888' } : undefined,
    ...(style.code
      ? { font: FONTS.mono, size: 19, shading: { type: ShadingType.CLEAR, fill: COLOR.inlineCodeBg, color: 'auto' } }
      : {}),
  })
}

function imageRun(img: LoadedImage, alt: string): ImageRun {
  const size = fitImage(img.width, img.height, MAX_IMAGE_WIDTH_PX, MAX_IMAGE_HEIGHT_PX)
  return new ImageRun({
    type: img.type,
    data: img.data,
    transformation: size,
    altText: { name: alt || 'image', description: alt, title: alt },
  })
}

/** 行内 token → 段落子元素（TextRun / 超链接 / 图片） */
export function inlineRuns(tokens: Token[] | undefined, style: InlineStyle, ctx: Ctx): ParagraphChild[] {
  const out: ParagraphChild[] = []
  for (const t of tokens ?? []) {
    switch (t.type) {
      case 'strong':
        out.push(...inlineRuns(t.tokens, { ...style, bold: true }, ctx))
        break
      case 'em':
        out.push(...inlineRuns(t.tokens, { ...style, italics: true }, ctx))
        break
      case 'del':
        out.push(...inlineRuns(t.tokens, { ...style, strike: true }, ctx))
        break
      case 'codespan':
        out.push(textRun(decodeEntities(t.text), { ...style, code: true }))
        break
      case 'br':
        out.push(new TextRun({ text: '', break: 1 }))
        break
      case 'link': {
        const children = inlineRuns(t.tokens, { ...style, link: true }, ctx)
        if (/^(?:https?:|mailto:)/i.test(t.href))
          out.push(new ExternalHyperlink({ link: t.href, children }))
        else
          out.push(...children)
        break
      }
      case 'image': {
        const img = ctx.images.get(t.href)
        if (img)
          out.push(imageRun(img, t.text))
        else
          out.push(textRun(`[图片：${t.text || t.href}]`, { ...style, italics: true, color: COLOR.muted }))
        break
      }
      case 'html': {
        // 行内 HTML：<br> 换行，其余标签去掉只留文字
        if (/^<br\s*\/?>$/i.test(t.text.trim()))
          out.push(new TextRun({ text: '', break: 1 }))
        else if (t.text.replace(/<[^>]*>/g, ''))
          out.push(textRun(decodeEntities(t.text.replace(/<[^>]*>/g, '')), style))
        break
      }
      case 'text':
      case 'escape':
        if ('tokens' in t && t.tokens?.length)
          out.push(...inlineRuns(t.tokens, style, ctx))
        else
          out.push(textRun(decodeEntities(t.text), style))
        break
      default:
        if ('text' in t && typeof t.text === 'string' && t.text)
          out.push(textRun(decodeEntities(t.text), style))
    }
  }
  return out
}

// ---------------------------------------------------------------------------- 块级元素

type Block = Paragraph | Table

interface BlockOpts {
  /** 左缩进（twip） */
  indent: number
  /** 引用层级 */
  quote: number
}

const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6]

function quoteBorder(o: BlockOpts) {
  return o.quote > 0 ? { left: { style: BorderStyle.SINGLE, size: 18, color: COLOR.border, space: 10 } } : undefined
}

function paraStyle(o: BlockOpts): InlineStyle {
  return o.quote > 0 ? { color: COLOR.muted } : {}
}

/** 只含一张图片的段落：居中显示 */
function isImageOnly(tokens: Token[] | undefined): boolean {
  const meaningful = (tokens ?? []).filter(t => !(t.type === 'text' && !t.raw.trim()))
  return meaningful.length === 1 && meaningful[0].type === 'image'
}

function codeBlock(code: string, o: BlockOpts): Paragraph {
  const lines = code.replace(/\t/g, '    ').split('\n')
  return new Paragraph({
    children: lines.map((line, i) => new TextRun({ text: line || ' ', font: FONTS.mono, size: 18, color: '222222', break: i > 0 ? 1 : undefined })),
    shading: { type: ShadingType.CLEAR, fill: COLOR.codeBg, color: 'auto' },
    border: {
      top: { style: BorderStyle.SINGLE, size: 4, color: 'E6E6E6', space: 4 },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E6E6E6', space: 4 },
      left: { style: BorderStyle.SINGLE, size: 4, color: 'E6E6E6', space: 6 },
      right: { style: BorderStyle.SINGLE, size: 4, color: 'E6E6E6', space: 6 },
    },
    spacing: { before: 120, after: 160, line: 276 },
    indent: { left: o.indent + 120, right: 120 },
    keepLines: true,
    alignment: AlignmentType.LEFT,
  })
}

function table(t: Tokens.Table, o: BlockOpts, ctx: Ctx): Table {
  const cols = Math.max(1, t.header.length)
  const width = Math.floor((CONTENT_WIDTH_TWIPS - o.indent) / cols)
  const align = (a: string | null) => a === 'center' ? AlignmentType.CENTER : a === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' }
  const cell = (c: Tokens.TableCell, i: number, header: boolean) => new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: header ? { type: ShadingType.CLEAR, fill: COLOR.headerBg, color: 'auto' } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({
      alignment: align(t.align[i]),
      spacing: { before: 0, after: 0, line: 300 },
      children: inlineRuns(c.tokens, header ? { bold: true } : {}, ctx),
    })],
  })
  return new Table({
    width: { size: width * cols, type: WidthType.DXA },
    columnWidths: Array.from({ length: cols }, () => width),
    indent: o.indent ? { size: o.indent, type: WidthType.DXA } : undefined,
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: t.header.map((c, i) => cell(c, i, true)) }),
      ...t.rows.map(r => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, i, false)) })),
    ],
  })
}

function list(l: Tokens.List, level: number, o: BlockOpts, ctx: Ctx): Block[] {
  const out: Block[] = []
  const instance = l.ordered ? ++ctx.listInstance : 0
  for (const item of l.items) {
    let first = true
    for (const child of item.tokens) {
      if (child.type === 'list') {
        out.push(...list(child as Tokens.List, level + 1, o, ctx))
        continue
      }
      if (child.type === 'checkbox' || child.type === 'space')
        continue
      if ((child.type === 'text' || child.type === 'paragraph') && first) {
        first = false
        const runs = inlineRuns((child as Tokens.Text).tokens ?? [{ type: 'text', raw: child.raw, text: (child as Tokens.Text).text } as Token], paraStyle(o), ctx)
        const spacing = { before: 40, after: 40 }
        if (item.task) {
          out.push(new Paragraph({
            children: [new TextRun({ text: item.checked ? '☑ ' : '☐ ', font: { ascii: 'Segoe UI Symbol', hAnsi: 'Segoe UI Symbol', eastAsia: 'Segoe UI Symbol' } }), ...runs],
            indent: { left: o.indent + INDENT_STEP * (level + 1), hanging: 280 },
            spacing,
            border: quoteBorder(o),
          }))
        }
        else {
          out.push(new Paragraph({
            children: runs,
            ...(l.ordered ? { numbering: { reference: ORDERED_REF, level: Math.min(level, 8), instance } } : { bullet: { level: Math.min(level, 8) } }),
            ...(o.indent ? { indent: { left: o.indent + INDENT_STEP * (level + 1), hanging: 360 } } : {}),
            spacing,
            border: quoteBorder(o),
          }))
        }
        continue
      }
      // 列表项里的其它块（第二段、代码块、引用…）跟随缩进
      out.push(...blocks([child], { ...o, indent: o.indent + INDENT_STEP * (level + 1) }, ctx))
    }
  }
  return out
}

export function blocks(tokens: Token[], o: BlockOpts, ctx: Ctx): Block[] {
  const out: Block[] = []
  for (const t of tokens) {
    switch (t.type) {
      case 'heading':
        out.push(new Paragraph({
          heading: HEADINGS[Math.min(Math.max(t.depth, 1), 6) - 1],
          children: inlineRuns(t.tokens, {}, ctx),
          indent: o.indent ? { left: o.indent } : undefined,
        }))
        break
      case 'paragraph': {
        const imageOnly = isImageOnly(t.tokens)
        out.push(new Paragraph({
          children: inlineRuns(t.tokens, paraStyle(o), ctx),
          alignment: imageOnly ? AlignmentType.CENTER : undefined,
          keepLines: imageOnly || undefined,
          indent: o.indent ? { left: o.indent } : undefined,
          border: quoteBorder(o),
        }))
        break
      }
      case 'text':
        out.push(new Paragraph({ children: inlineRuns(t.tokens ?? [t], paraStyle(o), ctx), indent: o.indent ? { left: o.indent } : undefined, border: quoteBorder(o) }))
        break
      case 'blockquote':
        out.push(...blocks(t.tokens ?? [], { indent: o.indent + 240, quote: o.quote + 1 }, ctx))
        break
      case 'list':
        out.push(...list(t as Tokens.List, 0, o, ctx))
        break
      case 'code':
        out.push(codeBlock(t.text, o))
        break
      case 'table':
        out.push(table(t as Tokens.Table, o, ctx))
        // 表格后紧跟一个空段落，避免与下一张表格粘连（Word 会合并相邻表格）
        out.push(new Paragraph({ children: [], spacing: { before: 0, after: 60 } }))
        break
      case 'hr':
        out.push(new Paragraph({
          children: [],
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'D0D0D0', space: 1 } },
          spacing: { before: 120, after: 240 },
        }))
        break
      case 'html': {
        const text = decodeEntities(t.text.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, '')).trim()
        if (text)
          out.push(new Paragraph({ children: [textRun(text, paraStyle(o))], indent: o.indent ? { left: o.indent } : undefined }))
        break
      }
      case 'space':
      case 'def':
        break
      default:
        if ('text' in t && typeof t.text === 'string' && t.text.trim())
          out.push(new Paragraph({ children: [textRun(t.text, paraStyle(o))] }))
    }
  }
  return out
}

// ---------------------------------------------------------------------------- 文档

const FRONT_MATTER = /^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/

function collectImageSources(tokens: Token[]): string[] {
  const set = new Set<string>()
  walk(tokens, (t) => {
    if (t.type === 'image')
      set.add((t as Tokens.Image).href)
  })
  return [...set]
}

function walk(tokens: Token[], cb: (t: Token) => void) {
  for (const t of tokens) {
    cb(t)
    if (t.type === 'table') {
      const tt = t as Tokens.Table
      for (const c of tt.header)
        walk(c.tokens, cb)
      for (const r of tt.rows) {
        for (const c of r)
          walk(c.tokens, cb)
      }
    }
    else if (t.type === 'list') {
      for (const item of (t as Tokens.List).items)
        walk(item.tokens, cb)
    }
    if ('tokens' in t && Array.isArray(t.tokens))
      walk(t.tokens, cb)
  }
}

function headingStyle(sizeHalfPt: number, before: number, after: number) {
  return {
    run: { font: FONTS.heading, size: sizeHalfPt, bold: true, color: COLOR.strong },
    paragraph: { spacing: { before, after, line: 300 }, keepNext: true, keepLines: true },
  }
}

export function buildDocument(markdown: string, images: Map<string, LoadedImage | null>): Document {
  const tokens = new Lexer({ gfm: true }).lex(markdown.replace(FRONT_MATTER, ''))
  const ctx: Ctx = { images, listInstance: 0 }
  const children = blocks(tokens, { indent: 0, quote: 0 }, ctx)
  const levels = Array.from({ length: 9 }, (_, level) => ({
    level,
    format: [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][level % 3],
    text: `%${level + 1}.`,
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: INDENT_STEP * (level + 1), hanging: 360 } } },
  }))
  return new Document({
    creator: 'LazyBox',
    styles: {
      default: {
        document: {
          run: { font: FONTS.body, size: 22, color: COLOR.text },
          paragraph: { spacing: { after: 140, line: 360 } },
        },
        heading1: headingStyle(36, 360, 200),
        heading2: headingStyle(30, 320, 160),
        heading3: headingStyle(26, 280, 120),
        heading4: headingStyle(24, 240, 120),
        heading5: headingStyle(22, 200, 100),
        heading6: headingStyle(21, 200, 100),
      },
    },
    numbering: { config: [{ reference: ORDERED_REF, levels }] },
    sections: [{
      properties: {
        page: {
          size: { width: PAGE.width, height: PAGE.height },
          margin: { top: 1418, bottom: 1418, left: PAGE.margin, right: PAGE.margin },
        },
      },
      children: children.length ? children : [new Paragraph({ children: [] })],
    }],
  })
}

/** Markdown → .docx 文件内容。图片加载失败时以「[图片：…]」占位，不会让整个导出失败 */
export async function markdownToDocx(markdown: string, opts: DocxExportOptions = {}): Promise<Buffer> {
  const tokens = new Lexer({ gfm: true }).lex(markdown.replace(FRONT_MATTER, ''))
  const sources = collectImageSources(tokens)
  const loaded = await Promise.all(sources.map(src => loadImage(src, opts)))
  const images = new Map(sources.map((src, i) => [src, loaded[i]]))
  return Packer.toBuffer(buildDocument(markdown, images))
}
