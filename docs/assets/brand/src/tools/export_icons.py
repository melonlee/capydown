# 把 build_icon.py 生成的「抱着钢笔打盹的树懒」图标（吉祥物家族）导出为全部应用图标，以及品牌 PNG：
#   build/icon.icns                    macOS（iconutil）：16 / 16@2x / 32 用小图标（头 + 钢笔），32@2x(64) 及以上用完整图标
#   build/icon.ico                     Windows：16 24 32 48 用小图标，64 128 256 用完整图标
#   build/icons/NxN.png                Linux 图标组（electron-builder linux.icon）：≤48 用小图标，其余用完整图标
#   build/icon.png, resources/icon.png 完整图标（1024，窗口图标 / 兜底）
#   src/renderer/src/assets/images/favicon.png  启动中提示的小标志（小图标）
#   docs/assets/brand/app-icon-1024.png, logo-mark*.png, sloth-pen-art*.png 以及字标 / 组合标志 PNG
#   website/assets/favicon.svg / favicon-32.png / apple-touch-icon.png / icon-512.png
# Windows / Linux 用「无系统留白」的版本：把 viewBox 裁到圆角方形主体（100..924），去掉 macOS 的落地投影，图标铺满。
# 依赖：Pillow；macOS 的 iconutil；以及 render-batch.mjs（需要能解析到 playwright-core 与本机 Chrome）。
# 用法（仓库根目录）：python3 docs/assets/brand/src/tools/build_icon.py
#                    LB_RENDER=/path/to/render-batch.mjs python3 docs/assets/brand/src/tools/export_icons.py
import json
import os
import re
import shutil
import subprocess
import tempfile

from PIL import Image

ROOT = os.getcwd()
BRAND = os.path.join(ROOT, 'docs/assets/brand')
SRC = os.path.join(BRAND, 'src')
RENDER = os.environ.get('LB_RENDER', os.path.join(SRC, 'tools/render-batch.mjs'))
TMP = tempfile.mkdtemp(prefix='sd-icons-')

LARGE = os.path.join(SRC, 'app-icon.svg')  # 完整图标：抱着钢笔打盹的树懒，笔尖拖出一道墨线
SMALL = os.path.join(SRC, 'app-icon-small.svg')  # 头 + 斜放的钢笔（16–48px）
SMALL_MAX = 48  # Windows / Linux 不大于这个像素的图标用小图标（macOS iconset 里最大的小图标是 32px：64px 起完整图标已经读得清）


def flat(src):
    """无留白版本：viewBox 裁到圆角方形主体，并去掉 macOS 网格里的落地投影（class="tile-shadow"）。"""
    text = open(src, encoding='utf-8').read().replace('viewBox="0 0 1024 1024"', 'viewBox="100 100 824 824"', 1)
    text = re.sub(r'<use class="tile-shadow"[^>]*/>\n?', '', text)
    out = os.path.join(TMP, os.path.basename(src).replace('.svg', '-flat.svg'))
    open(out, 'w', encoding='utf-8').write(text)
    return out


def viewbox(path):
    m = re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', open(path, encoding='utf-8').read())
    return float(m.group(1)), float(m.group(2))


jobs = []


def job(src, out, w, h=None):
    jobs.append({'src': src, 'out': out, 'w': int(round(w)), 'h': int(round(h if h is not None else w))})


# 品牌 PNG：标志 512；字标 / 组合标志按 viewBox 的 2 倍
for name in ('logo-mark', 'logo-mark-dark'):
    job(f'{BRAND}/{name}.svg', f'{BRAND}/{name}.png', 512)
for name in ('logo-wordmark-light', 'logo-wordmark-dark', 'logo-lockup-light', 'logo-lockup-dark'):
    if os.path.exists(f'{BRAND}/{name}.svg'):
        w, h = viewbox(f'{BRAND}/{name}.svg')
        job(f'{BRAND}/{name}.svg', f'{BRAND}/{name}.png', w * 2, h * 2)
job(LARGE, f'{BRAND}/app-icon-1024.png', 1024)
for name in ('sloth-pen-art', 'sloth-pen-art-dark'):  # 无底板的吉祥物（透明 PNG，2 倍）
    job(f'{BRAND}/{name}.svg', f'{BRAND}/{name}.png', 1400, 1580)

# macOS iconset：每个尺寸都直接从矢量渲染（比缩小 1024 更清晰）
iconset = os.path.join(TMP, 'icon.iconset')
os.makedirs(iconset)
for base in (16, 32, 128, 256, 512):
    for scale, suffix in ((1, ''), (2, '@2x')):
        px = base * scale
        job(SMALL if px <= 32 else LARGE, f'{iconset}/icon_{base}x{base}{suffix}.png', px)

# Windows / Linux：无留白的版本
LARGE_FLAT, SMALL_FLAT = flat(LARGE), flat(SMALL)
ICO_SIZES = (16, 24, 32, 48, 64, 128, 256)
LINUX_SIZES = (16, 24, 32, 48, 64, 128, 256, 512, 1024)
for s in sorted(set(ICO_SIZES + LINUX_SIZES)):
    job(SMALL_FLAT if s <= SMALL_MAX else LARGE_FLAT, f'{TMP}/flat-{s}.png', s)
job(SMALL_FLAT, f'{TMP}/favicon.png', 100)
# 官网：favicon（小图标，无留白）、apple-touch-icon / icon-512（完整图标，无留白）
WEB = os.path.join(ROOT, 'website/assets')
job(SMALL_FLAT, f'{WEB}/favicon-32.png', 32)
job(LARGE_FLAT, f'{WEB}/apple-touch-icon.png', 180)
job(LARGE_FLAT, f'{WEB}/icon-512.png', 512)

jobs_file = os.path.join(TMP, 'jobs.json')
json.dump(jobs, open(jobs_file, 'w'))
subprocess.run(['node', RENDER, jobs_file], check=True, timeout=300)

subprocess.run(['iconutil', '-c', 'icns', iconset, '-o', os.path.join(ROOT, 'build/icon.icns')], check=True, timeout=60)
imgs = [Image.open(f'{TMP}/flat-{s}.png').convert('RGBA') for s in ICO_SIZES]
imgs[-1].save(os.path.join(ROOT, 'build/icon.ico'), format='ICO', sizes=[(s, s) for s in ICO_SIZES], append_images=imgs[:-1])
linux_dir = os.path.join(ROOT, 'build/icons')
shutil.rmtree(linux_dir, ignore_errors=True)
os.makedirs(linux_dir)
for s in LINUX_SIZES:
    shutil.copy(f'{TMP}/flat-{s}.png', os.path.join(linux_dir, f'{s}x{s}.png'))
shutil.copy(f'{TMP}/flat-1024.png', os.path.join(ROOT, 'build/icon.png'))
shutil.copy(f'{TMP}/flat-1024.png', os.path.join(ROOT, 'resources/icon.png'))
shutil.copy(f'{TMP}/favicon.png', os.path.join(ROOT, 'src/renderer/src/assets/images/favicon.png'))
if os.environ.get('SD_KEEP_ICONSET'):  # 留一份 iconset 供检查
    shutil.rmtree(os.environ['SD_KEEP_ICONSET'], ignore_errors=True)
    shutil.copytree(iconset, os.environ['SD_KEEP_ICONSET'])
fav = open(SMALL_FLAT, encoding='utf-8').read().replace('<!--', '<!-- 官网 favicon：裁到圆角方形主体，无投影。', 1)
open(f'{WEB}/favicon.svg', 'w', encoding='utf-8').write(fav)
shutil.rmtree(TMP)
print('icons: build/icon.icns build/icon.ico build/icons/ build/icon.png resources/icon.png favicon.png')
