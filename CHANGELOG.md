# 更新日志

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.2.0] - 未发布

这一版的主题是「只做一件事，并把它做对」：围绕公众号作者的 **写作 → 排版 → 图片 → 发布**，把不能用的功能如实标出来，把能用的功能做稳。

### 新增

- **发布对话框**：两个真实可用的出口
  - 复制到公众号：用当前主题渲染、内联样式后写入剪贴板，到公众号后台直接粘贴；如果文中有本地图片、相对路径或 data URI 图片，会提醒先上传图床
  - 导出 Markdown：生成带 Front Matter（标题、作者、日期、标签、摘要）的 `.md`，适合 Hexo / Hugo / VitePress
- **AI 起标题、写摘要**：在发布对话框里一键生成（需在设置里填写自己的 API Key）
- **OpenAI 兼容接口**：除 Claude 外，支持 DeepSeek、Kimi、通义千问、OpenAI 等任何 `chat/completions` 兼容服务，设置里提供一键预填
- Claude 模型更新为 Claude Opus 4.7 / Sonnet 4.6 / Haiku 4.5（旧的 Claude 3.x 已下线，已保存的旧配置会自动迁移）
- 全新的 Logo 与应用图标；欢迎页中文化
- 单元测试（Vitest）、GitHub Actions CI，以及打 tag 自动构建 macOS / Windows / Linux 安装包的 Release 工作流

### 修复

- AI 功能实际上从未生效：主进程读取的是一个永远为空的配置。现在读取已保存的设置，修改 Key / 模型后无需重启
- AI 命令面板（⌘K）和发布对话框打不开：编辑器组件漏掉了事件总线的导入
- 发布结果不再「假成功」：以前所有平台都直接返回成功，实际上什么也没做
- 编辑器当前行高亮在深色界面下看不清文字
- `build/` 被 `.gitignore` 忽略，导致打包时缺少图标和 macOS entitlements

### 安全

- 渲染进程启用 `sandbox` + `contextIsolation`，不再向页面暴露通用的 `ipcRenderer`
- 默认文档路径改由 IPC 提供，不再拼接进 `executeJavaScript` 字符串（路径里含引号即可注入脚本）
- `shell.openExternal` 只放行 `http(s)` / `mailto` 链接；预览区的链接不会把整个应用导航走
- 「在访达中打开」只接受已存在的目录；PDF 外部打开只接受已存在的 `.pdf` 文件
- Markdown 导出只会写入用户刚在保存对话框中选择的路径
- 构建时不再把整台机器的环境变量打包进前端代码；移除 Google Analytics 与 Wechatsync 远程脚本

### 调整

- MCP 插件、Skill、向量检索 / 知识图谱、排版模板、AI 生图等原型模块默认关闭（源码保留，设置项 `experimental_features_enabled` 打开并重启后才会注册）
- 知乎、掘金、语雀、飞书、Notion 的「一键发布」尚未实现，界面上明确标注「暂不支持」
- 文档整理：使用指南见 [docs/usage.md](docs/usage.md)，路线图见 [docs/ROADMAP.md](docs/ROADMAP.md)，历史开发文档归档到 [docs/dev/](docs/dev/)

## [0.1.0] - 2025-10-16

首个公开版本（仅 macOS，未签名）。

- 基于 [doocs/md](https://github.com/doocs/md) 的 Markdown 渲染与公众号排版：主题、字体、主题色、代码块主题、自定义 CSS
- 工作区：打开任意文件夹，树形文件管理（新建、重命名、删除、拖拽移动、搜索），自动保存
- 编辑 / 分屏预览两种视图，分隔条可拖动
- 图床上传：GitHub、阿里云 OSS、腾讯云 COS、七牛云、MinIO、Cloudflare R2 等
- 一键复制为公众号格式或 HTML，导出 Markdown / HTML

[0.2.0]: https://github.com/melonlee/LazyBox/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/melonlee/LazyBox/releases/tag/v0.1.0
