<div align="center">

<img src="docs/assets/brand/banner.png" alt="LazyBox · 懒排 — 像 Typora 一样专心写，一键排成公众号。" width="100%">

<p><b>LazyBox · 懒排</b> 是给公众号作者的 Markdown 桌面编辑器：<br>像 Typora 一样专心写，一键排成公众号，发布前让 AI 再校对一遍。</p>

[![CI](https://img.shields.io/github/actions/workflow/status/melonlee/LazyBox/ci.yml?style=flat-square&label=CI&color=111111)](https://github.com/melonlee/LazyBox/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/melonlee/LazyBox?style=flat-square&color=111111)](https://github.com/melonlee/LazyBox/releases)
[![License](https://img.shields.io/github/license/melonlee/LazyBox?style=flat-square&color=111111)](./LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%C2%B7%20Windows%20%C2%B7%20Linux-111111?style=flat-square)](#下载)

**简体中文** · [English](./README.en.md) · [下载](https://github.com/melonlee/LazyBox/releases) · [使用指南](./docs/usage.md) · [更新日志](./CHANGELOG.md) · [路线图](./docs/ROADMAP.md)

</div>

<br>

<img src="docs/assets/screenshots/01-writing.png" alt="LazyBox 写作界面：单栏实时预览" width="100%">

## 下载

到 **[GitHub Releases](https://github.com/melonlee/LazyBox/releases)** 下载最新版本。

| 系统 | 安装包 | 说明 |
| --- | --- | --- |
| macOS（Apple 芯片 / Intel） | `.dmg` | 主要开发与测试平台 |
| Windows 10 / 11 | `-setup.exe` | 从 v0.2.0 起随版本自动构建，实机测试较少 |
| Linux | `.AppImage` / `.deb` | 从 v0.2.0 起随版本自动构建，实机测试较少 |

> [!NOTE]
> macOS 安装包**没有签名和公证**（还没有 Apple Developer 账号）。首次打开如果提示「已损坏」或「无法验证开发者」，把应用拖进「应用程序」后在终端执行：
>
> ```bash
> xattr -cr /Applications/LazyBox.app
> ```

## 为什么做懒排

公众号作者想要的其实是两样东西：Typora 那样安静的写作环境，和一键就排好的公众号格式。现实往往是在 Typora 里写完，再去另一个网页工具排版，最后粘进后台。

还有一件更要命的事：**文章发出去以后，正文最多只能改 20 个字**。错别字一旦发出去，基本就改不回来了。

所以懒排只做三件事：把写作体验做到接近 Typora；把公众号排版收进一个面板；在你点「发布」之前，让 AI 帮你把错别字挑出来。

## 写作体验

<img src="docs/assets/screenshots/02-outline.png" alt="大纲侧边栏" width="100%">

- **实时预览**：基于 CodeMirror 6，Markdown 输入后立刻显示为排好的样子，光标进入时才露出 `#`、`**` 等标记
- **文件原样保存**：打开、不改、关闭，文件逐字节不变；换行符（LF / CRLF）、缩进、表格对齐都不会被「格式化」
- **源代码模式** `⌘/`、**文件 / 大纲侧边栏** `⇧⌘L`、**专注模式** `F8`、**打字机模式** `F9`
- **快速打开** `⌘P` 与 **命令面板** `⇧⌘P`：所有菜单命令都能搜到
- **编辑器主题**：GitHub、Newsprint、Night，可跟随系统深色模式
- **图片**：粘贴或拖入的图片保存到文档旁的 `assets/` 文件夹，写入相对路径；配置了图床时改为上传图床

<table>
  <tr>
    <td width="50%"><img src="docs/assets/screenshots/03-focus.png" alt="专注模式"><p align="center"><sub>专注模式：只有当前段落是清晰的</sub></p></td>
    <td width="50%"><img src="docs/assets/screenshots/07-quick-open.png" alt="快速打开"><p align="center"><sub><code>⌘P</code> 快速打开工作区里的文章</sub></p></td>
  </tr>
  <tr>
    <td><img src="docs/assets/screenshots/05-newsprint.png" alt="Newsprint 主题"><p align="center"><sub>Newsprint 主题</sub></p></td>
    <td><img src="docs/assets/screenshots/04-night.png" alt="Night 主题"><p align="center"><sub>Night 主题，可跟随系统深色模式</sub></p></td>
  </tr>
</table>

## 公众号排版

<img src="docs/assets/screenshots/06-wechat.png" alt="公众号预览面板" width="100%">

- `⌥⌘P` 打开右侧的公众号预览面板，按公众号的实际效果渲染当前文章
- 经典、优雅、简洁三套文章主题，可调字体、字号、主题色、代码块样式，支持自定义 CSS
- **复制到公众号**（`⇧⌘C`）：样式内联后写入剪贴板，到公众号后台编辑器直接粘贴
- 文中有本地图片时会提醒你：这些图片需要在公众号后台重新上传（或者先配置图床）
- 也可以导出带 Front Matter 的 Markdown，或导出 HTML

## 两个 AI 帮手

AI 在懒排里只做两件事，都在发布前用到。默认不开启，需要你自己的 API Key。

<table>
  <tr>
    <td width="50%"><img src="docs/assets/screenshots/08-proofread.png" alt="发布前校对"></td>
    <td width="50%"><img src="docs/assets/screenshots/09-publish-titles.png" alt="AI 拟标题和摘要"></td>
  </tr>
  <tr>
    <td valign="top"><b>发布前校对</b><br><sub>检查错别字、语病、标点和重复用词。逐条定位、接受或忽略，也可以「全部接受」，一次 <code>⌘Z</code> 就能全部还原。代码块、链接、Front Matter 不会被改动。中英文之间的空格属于可选的「风格建议」，默认不报。</sub></td>
    <td valign="top"><b>标题 + 摘要</b><br><sub>在发布对话框里，根据全文拟 3～5 个标题（每个不超过 64 字）和一段不超过 120 字的摘要。点击填入，或一键复制。</sub></td>
  </tr>
</table>

## 本地优先

- 文章就是你硬盘上的 `.md` 文件，任意文件夹都可以作为工作区；没有账号，没有云同步
- 图片就在文档旁边的 `assets/` 里，整个文件夹放进 Git、网盘，或用 Typora、Obsidian 打开都没问题
- AI 请求从你的电脑直接发到你选择的服务商；API Key 只保存在本机的应用配置里
- 应用里没有统计和追踪代码

## 快捷键

macOS 下的 `⌘` 在 Windows / Linux 上是 `Ctrl`，`⌥` 是 `Alt`。完整列表见 [使用指南](./docs/usage.md#快捷键)。

| 操作 | 快捷键 | 操作 | 快捷键 |
| --- | --- | --- | --- |
| 快速打开 | `⌘P` | 命令面板 | `⇧⌘P` |
| 源代码模式 | `⌘/` | 侧边栏 | `⇧⌘L` |
| 大纲 / 文件 | `⌃⌘1` / `⌃⌘3` | 公众号预览 | `⌥⌘P` |
| 专注模式 | `F8` | 打字机模式 | `F9` |
| 标题 1～6 / 正文 | `⌘1`～`⌘6` / `⌘0` | 加粗 / 斜体 | `⌘B` / `⌘I` |
| 行内代码 | `⌘E` | 超链接 | `⌥⌘K` |
| 复制到公众号 | `⇧⌘C` | 偏好设置 | `⌘,` |

## 配置 AI

打开 **偏好设置 → AI**（`⌘,`）：

1. **服务商**：Claude（Anthropic），或「OpenAI 兼容」——DeepSeek、Kimi、通义千问、OpenAI，以及任何兼容 `chat/completions` 的网关
2. **Base URL**（OpenAI 兼容时填写）：通常以 `/v1` 结尾，例如 `https://api.deepseek.com/v1`；设置页里有常用服务的一键预填
3. **API Key** 与 **模型**：例如 `deepseek-chat`、`qwen-plus`、`claude-sonnet-4-6`
4. 点 **测试连接**，通过后保存

使用：菜单「文件 → 发布前校对…」，或在命令面板搜「校对」；标题和摘要在发布对话框里点「AI 拟标题和摘要」。

> **隐私**：只有在你主动点击校对或拟标题时，文章内容才会发给你配置的服务商。懒排没有自己的服务器，不经手你的文章和 Key；费用由你的服务商按用量计算。

## 已知差距

懒排是「Typora 式」的编辑器，但不是 Typora。目前还有这些不足：

- 表格在光标进入后以 Markdown 源码编辑，没有表格控件
- 数学公式和 HTML 块按源码显示，不做渲染
- 从网页粘贴富文本时按纯文本插入，不会转成 Markdown
- 公众号预览只跟随编辑区滚动（单向同步）
- 只能复制到剪贴板，还不能直接存进公众号草稿箱

## 常见问题

<details>
<summary><b>和 Typora 是什么关系？</b></summary>

没有关系。懒排是独立的开源项目，只是写作体验以 Typora 为参照。如果你不写公众号，Typora 依然是很好的选择。
</details>

<details>
<summary><b>复制到公众号后图片不见了？</b></summary>

公众号后台读不到你电脑上的本地图片。复制时如果检测到本地图片，懒排会提醒你：到公众号后台重新上传这些图片，或者先在偏好设置里配置图床（GitHub、阿里云 OSS、腾讯云 COS、七牛云、MinIO、Cloudflare R2 等），之后粘贴的图片会直接上传。
</details>

<details>
<summary><b>不配置 AI 能用吗？</b></summary>

可以。写作、排版、复制到公众号都不需要 AI。
</details>

<details>
<summary><b>校对会不会乱改我的文章？</b></summary>

不会自动修改。每条建议都要你点「接受」才会写入，而且只做字词级的小改动：改动过大、改动 Markdown 标记、落在代码 / 链接 / Front Matter 里的建议都会被丢弃。接受后可以用 `⌘Z` 撤销。
</details>

<details>
<summary><b>和 doocs/md 有什么区别？</b></summary>

懒排的公众号排版能力来自 [doocs/md](https://github.com/doocs/md)。在此之上，懒排是本地优先的桌面写作工具：实时预览编辑器、工作区与文件树、发布前校对。如果你只想在浏览器里偶尔排一篇，doocs/md 的在线版就很好用。
</details>

<details>
<summary><b>macOS 提示「已损坏，无法打开」？</b></summary>

安装包未签名所致，执行上面 [下载](#下载) 一节里的 `xattr -cr` 命令即可。
</details>

## 路线图

接下来计划：表格可视化编辑、数学公式渲染、公众号草稿箱直传（AppID / AppSecret）、macOS 签名与公证、Windows / Linux 实机测试。详见 [docs/ROADMAP.md](./docs/ROADMAP.md)。

## 开发

需要 Node.js 20+ 与 pnpm。

```bash
pnpm install
pnpm dev          # 开发模式（热更新）
pnpm build        # 构建
pnpm test         # 单元测试（Vitest）
pnpm build:mac    # 打安装包；另有 build:win / build:linux
```

技术栈：Electron · Vue 3 · electron-vite · TypeScript · CodeMirror 6 · Pinia · Tailwind / UnoCSS。项目结构见 [CLAUDE.md](./CLAUDE.md)，设计记录见 [docs/dev/](./docs/dev/)。

官网是一个无需构建的静态页面，见 [`website/`](./website/)。

## 参与贡献

欢迎 Issue 和 Pull Request。提交前请运行 `pnpm test` 与 `pnpm build`；想做路线图里的功能，可以先开 Issue 讨论方案。

## 致谢

- [doocs/md](https://github.com/doocs/md)：Markdown 渲染与公众号排版能力，懒排由它 fork 而来
- [electron-vite](https://github.com/alex8088/electron-vite)
- [CodeMirror](https://codemirror.net/)
- 截图中的配图来自 [Unsplash](https://unsplash.com/)

## 许可证

[MIT](./LICENSE)，保留原项目的版权声明。

## Star History

<a href="https://www.star-history.com/#melonlee/LazyBox&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=melonlee/LazyBox&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=melonlee/LazyBox&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=melonlee/LazyBox&type=Date" width="600" />
 </picture>
</a>

<br><br>

<div align="center">
  <img src="docs/assets/brand/logo-mark.png" width="36" alt="">
  <br>
  <sub>Made by <a href="https://github.com/melonlee">Melon</a> · <a href="https://fantasyailab.com/">FantasyAI Lab</a></sub>
</div>
