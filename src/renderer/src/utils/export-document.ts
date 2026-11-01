/**
 * 导出 PDF 用的「打印版」HTML：按当前编辑器主题（GitHub / Newsprint；Night 导出为浅色）排版，
 * Typora 式字体与版式、灰阶代码高亮、表格、本地图片（data URL）、mermaid（SVG）。
 * 生成的是一个完整、自包含、不含脚本的 HTML 文档，交给主进程的隐藏窗口 printToPDF。
 */
import DOMPurify from 'dompurify'
import hljs from 'highlight.js'
import { Marked } from 'marked'
import mermaid from 'mermaid'
import { loadLocalImage } from './local-image'

export type PrintTheme = 'github' | 'newsprint'

const FRONT_MATTER = /^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const SANS = `'Open Sans', 'Clear Sans', 'Helvetica Neue', Helvetica, Arial, 'PingFang SC', 'Hiragino Sans GB', 'Noto Sans CJK SC', 'Source Han Sans SC', 'Microsoft YaHei', sans-serif`
const SERIF = `'PT Serif', Georgia, 'Times New Roman', 'Source Han Serif SC', 'Noto Serif CJK SC', 'Noto Serif SC', 'Songti SC', STSong, SimSun, serif`
const MONO = `'SF Mono', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace`

export function printCss(theme: PrintTheme): string {
  const serif = theme === 'newsprint'
  const font = serif ? SERIF : SANS
  const size = serif ? '11pt' : '10.5pt'
  const lh = serif ? 1.8 : 1.7
  return `
@page { size: A4; margin: 20mm 20mm 22mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; background: #fff; color: ${serif ? '#222' : '#333'}; font-family: ${font}; font-size: ${size}; line-height: ${lh}; word-wrap: break-word; text-align: ${serif ? 'justify' : 'left'}; }
h1, h2, h3, h4, h5, h6 { font-family: ${font}; color: #111; font-weight: ${serif ? 700 : 600}; line-height: 1.4; margin: 1.4em 0 0.6em; break-after: avoid; page-break-after: avoid; break-inside: avoid; }
h1 { font-size: 2em; ${serif ? '' : 'padding-bottom: 0.3em; border-bottom: 1px solid #eee;'} margin-top: 0.4em; }
h2 { font-size: 1.5em; ${serif ? '' : 'padding-bottom: 0.3em; border-bottom: 1px solid #eee;'} }
h3 { font-size: 1.25em; }
h4 { font-size: 1em; }
h5 { font-size: 0.875em; }
h6 { font-size: 0.85em; color: #777; }
p { margin: 0.8em 0; orphans: 3; widows: 3; }
a { color: inherit; text-decoration: underline; text-decoration-color: rgba(0,0,0,0.35); text-underline-offset: 2px; }
strong { color: #111; }
ul, ol { padding-left: 1.8em; margin: 0.8em 0; }
li { margin: 0.25em 0; }
li > p { margin: 0.3em 0; }
li.task-list-item { list-style: none; }
li.task-list-item input { margin: 0 0.4em 0 -1.3em; vertical-align: middle; }
blockquote { margin: 1em 0; padding: 0 1em; color: ${serif ? '#5f5f5c' : '#777'}; border-left: 4px solid ${serif ? '#cfcfca' : '#ddd'}; ${serif ? 'font-style: italic;' : ''} }
hr { height: 1px; border: 0; background: #e2e2e2; margin: 1.6em 0; }
code { font-family: ${MONO}; font-size: 0.88em; background: #f3f3f3; border-radius: 3px; padding: 0.1em 0.35em; }
pre { font-family: ${MONO}; font-size: 8.8pt; line-height: 1.55; background: #f8f8f8; border: 1px solid #eee; border-radius: 4px; padding: 0.8em 1em; white-space: pre-wrap; word-break: break-all; break-inside: avoid; page-break-inside: avoid; margin: 1em 0; text-align: left; }
pre code { background: none; padding: 0; font-size: inherit; border-radius: 0; }
table { border-collapse: collapse; margin: 1em 0; width: auto; max-width: 100%; break-inside: auto; text-align: left; }
thead { display: table-header-group; }
tr { break-inside: avoid; page-break-inside: avoid; }
th, td { border: 1px solid #ddd; padding: 0.4em 0.8em; }
th { background: #f6f6f6; font-weight: 600; color: #111; }
tbody tr:nth-child(2n) td { background: #fbfbfb; }
img { max-width: 100%; height: auto; display: block; margin: 0.8em auto; break-inside: avoid; page-break-inside: avoid; }
p > img:only-child { margin: 0 auto; }
.lb-mermaid { text-align: center; margin: 1em 0; break-inside: avoid; page-break-inside: avoid; }
.lb-mermaid svg { max-width: 100%; height: auto; }
.lb-missing-image { color: #999; font-style: italic; }
/* 灰阶代码高亮（与编辑区一致） */
.hljs-keyword, .hljs-selector-tag, .hljs-literal, .hljs-built_in { color: #111; font-weight: 600; }
.hljs-string, .hljs-regexp, .hljs-attr { color: #6b6b6b; }
.hljs-comment, .hljs-quote { color: #a8a8a8; font-style: italic; }
.hljs-number, .hljs-symbol { color: #444; }
.hljs-title, .hljs-function, .hljs-section { color: #222; font-weight: 600; }
.hljs-type, .hljs-class { color: #333; }
.hljs-meta, .hljs-doctag { color: #8a8a8a; }
.hljs-tag, .hljs-name { color: #222; }
.hljs-property, .hljs-variable, .hljs-params { color: #555; }
.hljs-emphasis { font-style: italic; }
.hljs-strong { font-weight: 700; }
`
}

// mermaid 源码不放进属性里：DOMPurify 会删掉含 "-->" 的属性值（防 mXSS），改为按序号取
let pendingMermaid: string[] = []

const exportMarked = new Marked({
  gfm: true,
  renderer: {
    code({ text, lang }) {
      const language = (lang || '').trim().split(/\s+/)[0].toLowerCase()
      if (language === 'mermaid') {
        pendingMermaid.push(text)
        return `<div class="lb-mermaid" data-index="${pendingMermaid.length - 1}"></div>\n`
      }
      const valid = language && hljs.getLanguage(language) ? language : ''
      const body = valid ? hljs.highlight(text, { language: valid }).value : escapeHtml(text)
      return `<pre><code class="hljs${valid ? ` language-${valid}` : ''}">${body}</code></pre>\n`
    },
  },
})

let mermaidSeq = 0
async function renderMermaidSvg(code: string): Promise<string> {
  const themed = /^\s*%%\{/.test(code) ? code : `%%{init: {"theme": "neutral"}}%%\n${code}`
  const { svg } = await mermaid.render(`lb-export-mmd-${++mermaidSeq}`, themed)
  return DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true }, ADD_TAGS: ['foreignObject'] })
}

export interface PrintDocumentOptions {
  markdown: string
  theme: PrintTheme
  /** 解析相对图片路径的目录（文档所在目录） */
  baseDir: string
  title: string
}

/** 把 Markdown 排成打印用的完整 HTML 文档 */
export async function buildPrintHtml(opts: PrintDocumentOptions): Promise<string> {
  const source = opts.markdown.replace(FRONT_MATTER, '')
  pendingMermaid = []
  const raw = exportMarked.parse(source, { async: false }) as string
  const mermaidSources = pendingMermaid
  const clean = DOMPurify.sanitize(raw)
  const doc = new DOMParser().parseFromString(`<body>${clean}</body>`, 'text/html')

  // 本地图片 → data URL（隐藏窗口里加载 file:// 相对路径不可靠，也避免打印窗口读任意本地文件）
  await Promise.all(Array.from(doc.querySelectorAll('img')).map(async (img) => {
    const src = img.getAttribute('src') || ''
    try {
      const url = await loadLocalImage(src, opts.baseDir)
      if (url) {
        img.setAttribute('src', url)
        return
      }
    }
    catch {}
    const span = doc.createElement('span')
    span.className = 'lb-missing-image'
    span.textContent = `[图片无法加载：${img.getAttribute('alt') || src}]`
    img.replaceWith(span)
  }))

  // mermaid → SVG（按顺序渲染，mermaid 不支持并发）
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>('.lb-mermaid'))) {
    const code = mermaidSources[Number(el.getAttribute('data-index'))] ?? ''
    el.removeAttribute('data-index')
    try {
      el.innerHTML = await renderMermaidSvg(code)
    }
    catch {
      el.outerHTML = `<pre><code>${escapeHtml(code)}</code></pre>`
    }
  }

  // 任务列表的勾选框在打印里保持只读外观
  doc.querySelectorAll('li > input[type="checkbox"]').forEach(cb => cb.parentElement?.classList.add('task-list-item'))

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https: http:; style-src 'unsafe-inline'; font-src data:">
<title>${escapeHtml(opts.title)}</title>
<style>${printCss(opts.theme)}</style>
</head>
<body>
${doc.body.innerHTML}
</body>
</html>`
}
