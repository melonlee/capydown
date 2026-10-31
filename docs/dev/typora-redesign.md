# Typora 式改版：技术选型记录

> 2026-11 · 分支 `polish/v0.2.0`

## 目标

让 LazyBox 的写作体验向 Typora 靠齐：单栏实时预览、极简界面、侧边栏（文件 / 大纲）、专注与打字机模式、快速打开、编辑器主题；公众号排版 / 复制保留为一级功能，但收进右侧可开关的面板。

硬约束：**磁盘上的 Markdown 文件是唯一事实来源，打开、不修改、关闭，文件必须逐字节不变。**

## 候选方案与 spike 结果

用 3 篇演示文章（`/tmp/lazybox-demo/公众号/*.md`）和一个边界用例文件（Front Matter、Setext 标题、四空格嵌套列表、`1)` 有序列表、带对齐的表格、惰性续行引用、引用式链接、CRLF）做往返测试：解析 → 编辑器内部模型 → 序列化，对比原文。

| 方案 | 往返结果 | 说明 |
| --- | --- | --- |
| Vditor IR 模式（Lute 引擎） | ❌ 每篇都变 | 表格被重新对齐补空格、四空格嵌套列表改成两空格、空行被增删、CRLF 变 LF |
| Milkdown（remark 序列化） | ❌ 每篇都变 | Front Matter 被当成分割线 + 标题、URL 里的 `&` 被转义成 `\&`、CRLF 变 LF |
| CodeMirror 5 + markText | ✅ 文本不变 | 但没有 Decoration / 块部件，做不出图片、表格、隐藏标记的实时预览 |
| **CodeMirror 6 + Decoration** | ✅ 文本不变 | 文本原样保存，预览全部是「装饰」（Obsidian 的做法） |

所见即所得类编辑器（Vditor / Milkdown / TipTap）都是「Markdown → 文档树 → Markdown」，序列化时一定会规范化格式，与硬约束冲突，所以排除。

## 决定：迁移到 CodeMirror 6

- 文档始终是原始 Markdown 文本；实时预览由 `src/renderer/src/editor/live-preview.ts` 的 `StateField` 根据 Lezer 语法树生成 Decoration：隐藏 `#`、`**`、`` ` ``、`[]()` 等标记，图片 / 表格 / 分割线 / 任务框 / mermaid 用部件显示；光标所在的块（或行内元素）还原出原始标记。
- 换行符：纯 CRLF / CR 文件按原分隔符拆行与拼回；混用换行的文件只按 LF 拆行，`\r` 作为普通字符保留，因此编辑后其它行也不受影响。
- 只有用户编辑（非「载入文件」事务）才会触发自动保存，打开文件不写盘。
- `⌘/` 切换源代码模式：只是去掉实时预览扩展、换成等宽字体，文本不变。
- 旧代码依赖的 CM5 接口（`getValue` / `replaceSelection` / `getCursor` …）由 `MarkdownEditor` 适配，AI、插入表格、导入导出等功能无需重写。
- CSS 编辑器和自定义图床表单仍用 CodeMirror 5（不是主编辑器，没必要迁移）。
- 体积：新增 CM6 相关包约 5 MB（未压缩源码，含按需加载的代码块语言包），Vditor 本身就有 24 MB。

测试：`tests/unit/editor.test.ts` 覆盖 LF / CRLF / CR / 混用换行 / BOM / 无结尾换行 / 演示文章的逐字节往返，以及大纲、字数、快捷键、格式命令。

## 已知与 Typora 的差距

- 表格在光标进入后显示为 Markdown 源码编辑（Typora 是表格控件内直接编辑）。
- HTML 块与数学公式不做渲染，按源码显示。
- 粘贴网页富文本时按纯文本插入，不会转成 Markdown。
- 公众号预览面板与编辑区是单向滚动同步（编辑区 → 预览）。

## 视觉：黑白灰（2026-11）

- 产品名「LazyBox · 懒排」（`src/shared/brand.ts`）；安装包名仍是 `LazyBox`。
- 界面不使用彩色强调色：主题变量见 `src/renderer/src/assets/workbench.css`，`--lb-accent` 在浅色主题是黑、Night 是白；Night 为灰阶反相。代码高亮、mermaid 预览、CSS 编辑器（CM5 `lb-mono` 主题）也是灰阶。
- 公众号文章主题（`config/theme.ts`）是输出内容，颜色不受影响。
- 临时标志：`src/renderer/src/assets/images/logo-mark.svg`（只用 `currentColor`，由 `components/brand/BrandMark.vue` 内联），品牌任务替换这一个文件即可。
- 粘贴 / 拖入图片默认保存到「文档目录/assets/」并写相对路径（Typora 做法）；配置了图床时仍上传。
- 端到端测试：以 `LAZYBOX_E2E=1` 启动时暴露 `window.__lbEditor`（开发模式也有）。
