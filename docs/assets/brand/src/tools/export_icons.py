# 把 build_brand.py 生成的 SVG 导出为 PNG，并生成全部应用图标：
#   docs/assets/brand/*.png            标志 / 字标 / 组合标志 / app-icon-1024.png
#   build/icon.icns                    macOS（iconutil，16–1024 含 @2x）
#   build/icon.ico                     Windows（16 24 32 48 64 128 256）
#   build/icon.png, resources/icon.png Linux / 窗口图标（1024）
#   src/renderer/src/assets/images/favicon.png  运行中提示的小标志
# 依赖：Pillow；macOS 的 iconutil；以及 render-batch.mjs（需要能解析到 playwright-core 与本机 Chrome）。
# 用法（仓库根目录）：LB_RENDER=/path/to/render-batch.mjs python3 docs/assets/brand/src/tools/export_icons.py
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
TMP = tempfile.mkdtemp(prefix='lb-icons-')


def viewbox(path):
    m = re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', open(path, encoding='utf-8').read())
    return float(m.group(1)), float(m.group(2))


jobs = []


def job(src, out, w, h=None):
    jobs.append({'src': src, 'out': out, 'w': int(round(w)), 'h': int(round(h if h is not None else w))})


# 品牌 PNG：标志 512；字标 / 组合标志按 viewBox 的 2 倍
for name in ('logo-mark', 'logo-mark-dark'):
    job(f'{BRAND}/{name}.svg', f'{BRAND}/{name}.png', 512)
for name in ('logo-wordmark-light', 'logo-wordmark-dark', 'logo-wordmark-zh-light', 'logo-wordmark-zh-dark',
             'logo-lockup-light', 'logo-lockup-dark'):
    w, h = viewbox(f'{BRAND}/{name}.svg')
    job(f'{BRAND}/{name}.svg', f'{BRAND}/{name}.png', w * 2, h * 2)
job(f'{SRC}/app-icon.svg', f'{BRAND}/app-icon-1024.png', 1024)

# macOS iconset：每个尺寸都直接从矢量渲染（比缩小 1024 更清晰）
iconset = os.path.join(TMP, 'icon.iconset')
os.makedirs(iconset)
for base in (16, 32, 128, 256, 512):
    job(f'{SRC}/app-icon.svg', f'{iconset}/icon_{base}x{base}.png', base)
    job(f'{SRC}/app-icon.svg', f'{iconset}/icon_{base}x{base}@2x.png', base * 2)

# Windows / Linux：无留白的版本
ICO_SIZES = (16, 24, 32, 48, 64, 128, 256)
for s in ICO_SIZES:
    job(f'{SRC}/app-icon-flat.svg', f'{TMP}/ico-{s}.png', s)
job(f'{SRC}/app-icon-flat.svg', f'{TMP}/flat-1024.png', 1024)
job(f'{BRAND}/logo-mark.svg', f'{TMP}/favicon.png', 100)

jobs_file = os.path.join(TMP, 'jobs.json')
json.dump(jobs, open(jobs_file, 'w'))
subprocess.run(['node', RENDER, jobs_file], check=True, timeout=300)

subprocess.run(['iconutil', '-c', 'icns', iconset, '-o', os.path.join(ROOT, 'build/icon.icns')], check=True, timeout=60)
imgs = [Image.open(f'{TMP}/ico-{s}.png').convert('RGBA') for s in ICO_SIZES]
imgs[-1].save(os.path.join(ROOT, 'build/icon.ico'), format='ICO', sizes=[(s, s) for s in ICO_SIZES], append_images=imgs[:-1])
shutil.copy(f'{TMP}/flat-1024.png', os.path.join(ROOT, 'build/icon.png'))
shutil.copy(f'{TMP}/flat-1024.png', os.path.join(ROOT, 'resources/icon.png'))
shutil.copy(f'{TMP}/favicon.png', os.path.join(ROOT, 'src/renderer/src/assets/images/favicon.png'))
shutil.rmtree(TMP)
print('icons: build/icon.icns build/icon.ico build/icon.png resources/icon.png favicon.png')
