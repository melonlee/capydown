import { syntaxHighlighting } from '@codemirror/language'
import { tagHighlighter, tags as t } from '@lezer/highlight'

/**
 * 只输出 class，不写死颜色：颜色全部来自主题 CSS 变量（assets/editor-themes.css），
 * 这样三套编辑器主题 + 源代码模式可以共用同一个高亮器。
 */
const highlighter = tagHighlighter([
  // Markdown
  { tag: t.heading1, class: 'tok-heading tok-h1' },
  { tag: t.heading2, class: 'tok-heading tok-h2' },
  { tag: t.heading3, class: 'tok-heading tok-h3' },
  { tag: [t.heading4, t.heading5, t.heading6], class: 'tok-heading' },
  { tag: t.emphasis, class: 'tok-em' },
  { tag: t.strong, class: 'tok-strong' },
  { tag: t.strikethrough, class: 'tok-strike' },
  { tag: t.link, class: 'tok-link' },
  { tag: t.url, class: 'tok-url' },
  { tag: t.monospace, class: 'tok-mono' },
  { tag: t.quote, class: 'tok-quote' },
  { tag: t.processingInstruction, class: 'tok-mark' },
  { tag: t.contentSeparator, class: 'tok-hr' },
  { tag: t.labelName, class: 'tok-label' },
  { tag: t.escape, class: 'tok-mark' },

  // 代码块里的语言
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword, t.definitionKeyword], class: 'tok-keyword' },
  { tag: [t.string, t.special(t.string), t.regexp], class: 'tok-string' },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], class: 'tok-comment' },
  { tag: [t.number, t.bool, t.null, t.atom], class: 'tok-number' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], class: 'tok-function' },
  { tag: [t.typeName, t.className, t.namespace], class: 'tok-type' },
  { tag: [t.propertyName, t.attributeName], class: 'tok-property' },
  { tag: [t.tagName, t.angleBracket], class: 'tok-tag' },
  { tag: [t.meta, t.annotation], class: 'tok-meta' },
  { tag: [t.operator, t.punctuation], class: 'tok-punct' },
  { tag: t.invalid, class: 'tok-invalid' },
])

export const markdownHighlighting = syntaxHighlighting(highlighter)
