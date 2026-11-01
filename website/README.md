# Capydown 官网

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

## 地址与分享图

页面部署在 <https://melonlee.github.io/capydown/>。`og:image`、`twitter:image`、`og:url`、`canonical` 和 `hreflang` 都写的是这个绝对地址；换自定义域名时在两个页面里一并修改。分享图 `assets/social-preview.png` 复制自 `docs/assets/brand/social-preview.png`（2560×1280）。

## 品牌素材

`assets/favicon.svg` / `favicon-32.png` 是小尺寸图标（只留卡皮巴拉的头，裁到圆角方形主体），`apple-touch-icon.png` / `icon-512.png` 是完整的应用图标（从底边探出头的卡皮巴拉，头顶趴着一只小卡皮巴拉；和 喵想 · FantasyAI Lab 同一吉祥物家族），都由 `docs/assets/brand/src/tools/export_icons.py` 生成；`capybara.svg` 是首屏和结尾处的吉祥物（`docs/assets/brand/capybara-art.svg` 的副本）。首屏的组合标志（标志 + 字标，232 × 56 网格）和应用启动画面是同一组路径。

## 更新截图

截图源文件在 `docs/assets/screenshots/`（2880×1800 PNG）。替换后重新导出 WebP（目前用到 01–13、15、16）：每张图导出 `NN-name.webp`（宽 2000，质量约 0.82）和 `NN-name-1000.webp`（宽 1000），文件名保持不变即可。任何能输出 WebP 的工具都可以（`cwebp -q 82 -resize 2000 0`、Squoosh 等）。
