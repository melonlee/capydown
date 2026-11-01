# LazyBox · 懒排 官网

无需构建的纯静态页面：HTML + CSS + 少量原生 JS，没有 CDN、Web 字体和统计脚本，全部使用相对路径。

```
website/
├── index.html        中文（主页面）
├── en/index.html     English
├── style.css         两种语言共用
├── main.js           导航细线、滚动渐显、编辑器主题切换（无 JS 时页面照常可用）
└── assets/           WebP 截图（2000 / 1000 宽）、favicon、社交分享图
```

## 本地预览

```bash
cd website
python3 -m http.server 8080      # 或 npx serve .
# 打开 http://localhost:8080/
```

直接双击 `index.html` 也能看，但 `en/` 这类目录链接需要静态服务器才会自动指向 `index.html`。

## 部署

把 `website/` 目录作为站点根目录即可，不需要构建命令。

| 平台 | 设置 |
| --- | --- |
| Vercel | Root Directory：`website`；Framework：Other；Build Command 留空 |
| Netlify | Base directory：`website`；Publish directory：`website`；Build command 留空 |
| Cloudflare Pages | Build output directory：`website`；Build command 留空 |
| GitHub Pages | 用 Actions 把 `website/` 作为 artifact 发布（`actions/upload-pages-artifact` 的 `path: website`），或复制到 `gh-pages` 分支根目录 |

## 有了正式域名之后

Open Graph / Twitter 卡片要求图片是**绝对地址**。目前 `og:image`、`twitter:image` 写的是相对路径 `assets/social-preview.png`（英文页是 `../assets/…`），绑定域名后请在两个页面里改成：

```html
<meta property="og:image" content="https://你的域名/assets/social-preview.png">
<meta name="twitter:image" content="https://你的域名/assets/social-preview.png">
```

同时可以补上 `<meta property="og:url">` 和 `<link rel="canonical">`。

## 更新截图

截图源文件在 `docs/assets/screenshots/`（2880×1800 PNG）。替换后重新导出 WebP：每张图导出 `NN-name.webp`（宽 2000，质量约 0.82）和 `NN-name-1000.webp`（宽 1000），文件名保持不变即可。任何能输出 WebP 的工具都可以（`cwebp -q 82 -resize 2000 0`、Squoosh 等）。
