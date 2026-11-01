# Capydown 字标与组合标志生成器（文字全部转曲，SVG 不依赖字体）。
# 图标 / 应用内标志 / 吉祥物由 build_icon.py 生成；这里只排字，并把它们和字标组合起来。
# 产品只有一个名字 Capydown（Capybara + Markdown；原名 LazyBox / Slothdown）。
#
#   logo-wordmark-{light,dark}.svg      Capydown（Manrope Bold，转曲）
#   logo-lockup-{light,dark}.svg        单色标志（卡皮巴拉侧面头像）+ Capydown —— 小尺寸、导航栏、横幅
#   logo-lockup-icon-{light,dark}.svg   应用图标（托腮思考的卡皮巴拉）+ Capydown —— 只在图标能显示到 64px 以上时使用
#   以及上面每个 SVG 的 2 倍 PNG
#
# 依赖：pip install fonttools；PNG 用 render-batch.mjs（需要能 import playwright-core 的 node 环境）
# 字体（SIL OFL，可自由转曲用于标志）：
#   SD_FONT_LATIN  Manrope 可变字体 Manrope[wght].ttf（github.com/google/fonts/tree/main/ofl/manrope）
# 用法（仓库根目录）：
#   python3 docs/assets/brand/src/tools/build_icon.py
#   SD_FONT_LATIN=... SD_RENDER=/path/to/render-batch.mjs python3 docs/assets/brand/src/tools/build_brand.py
import json
import os
import re
import subprocess
import tempfile

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = os.getcwd()
BRAND = os.path.join(ROOT, 'docs/assets/brand')
SRC = os.path.join(BRAND, 'src')
FONT_LATIN = os.environ.get('SD_FONT_LATIN', 'Manrope.ttf')
RENDER = os.environ.get('SD_RENDER', os.environ.get('LB_RENDER', os.path.join(SRC, 'tools/render-batch.mjs')))

INK = '#111111'  # 浅色背景上的墨色（与启动画面一致）
PAPER = '#EDEDED'  # 深色背景上的反白色

LATIN = 'Capydown'


def num(v):
    s = f'{v:.2f}'.rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


# ---------- 文字转曲 ----------

def text_paths(font_path, text, size, tracking_em=0.0, wght=None, kern=None, baseline=0.0, x0=0.0):
    font = TTFont(font_path)
    if wght is not None and 'fvar' in font:
        font = instantiateVariableFont(font, {'wght': wght})
    gs, cmap, upm = font.getGlyphSet(), font.getBestCmap(), font['head'].unitsPerEm
    sc = size / upm
    x, d, prev = 0.0, [], None
    bp = BoundsPen(gs)
    for ch in text:
        g = cmap[ord(ch)]
        if prev and kern:
            x += kern.get(prev + ch, 0) * upm / 1000
        pen = SVGPathPen(gs, ntos=num)
        gs[g].draw(TransformPen(pen, (sc, 0, 0, -sc, x0 + x * sc, baseline)))
        gs[g].draw(TransformPen(bp, (sc, 0, 0, -sc, x0 + x * sc, baseline)))
        d.append(pen.getCommands())
        x += gs[g].width + tracking_em * upm
        prev = ch
    return ''.join(d), bp.bounds  # bounds: xmin, ymin, xmax, ymax（已是 SVG 坐标）


# 手调字距（千分之一 em）：Manrope 的 GPOS 字距不会被 fontTools 应用
LATIN_KERN = {'Ca': -6, 'ap': -4, 'py': -12, 'yd': -8, 'do': -6, 'ow': -16, 'wn': -12}


def latin(size, baseline=0.0, x0=0.0):
    return text_paths(FONT_LATIN, LATIN, size, -0.024, wght=740, kern=LATIN_KERN, baseline=baseline, x0=x0)




# ---------- 图形 ----------

def mark_c(size, x, y, color):
    """标志（卡皮巴拉侧面头像，单色）：取 build_icon.py 生成的应用内标志（24 网格，只用 currentColor），换成指定颜色。"""
    text = open(os.path.join(ROOT, 'src/renderer/src/assets/images/logo-mark.svg'), encoding='utf-8').read()
    g = ''.join(re.findall(r'<path fill="currentColor".*?/>', text, re.S)).replace('currentColor', color)
    return f'  <g transform="translate({num(x)} {num(y)}) scale({num(size / 24)})">{g}</g>'


def icon_a(size, x, y):
    """应用图标：内嵌 app-icon.svg（1024 网格，主体 100..924，四周留了阴影空间）。裁掉留白后正好 size。"""
    text = open(os.path.join(SRC, 'app-icon.svg'), encoding='utf-8').read()
    inner = text[text.index('>', text.index('<svg')) + 1:text.rindex('</svg>')]
    inner = re.sub(r'<!--.*?-->', '', inner, flags=re.S).strip()
    pad = 100 * size / 824
    return (f'  <svg x="{num(x - pad)}" y="{num(y - pad)}" width="{num(size + 2 * pad)}" height="{num(size + 2 * pad)}" '
            f'viewBox="0 0 1024 1024" overflow="visible">{inner}</svg>')


# ---------- 输出 ----------

def svg(w, h, body, comment=''):
    c = f'\n  <!-- {comment} -->' if comment else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {num(w)} {num(h)}" '
            f'width="{num(w)}" height="{num(h)}">{c}\n{body}\n</svg>\n')


written = []


def write(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    written.append(path)
    print('wrote', os.path.relpath(path, ROOT))


def fitted(d_bounds, d, color, pad):
    x0, y0, x1, y1 = d_bounds
    w, h = x1 - x0 + 2 * pad, y1 - y0 + 2 * pad
    body = f'  <path fill="{color}" transform="translate({num(pad - x0)} {num(pad - y0)})" d="{d}"/>'
    return w, h, body


def lockup(kind, color):
    """[标志]  Capydown —— 字标的大写高度区间以标志的垂直中线居中。kind: 'mark'（单色标志）或 'icon'（应用图标）。"""
    M = 128  # 标志高度
    gap = M * (-0.06 if kind == 'mark' else 0.24)  # 头像字形的墨迹只占 24 网格的 1.5..22.6，右侧有留白，组合时往回收
    cap = 1440 / 2000  # Manrope 大写高度 / em
    lat_size = M * 0.40 / cap
    lat_d, lb = latin(lat_size, baseline=0, x0=M + gap)
    lat_dy = M / 2 + cap * lat_size / 2  # p / y 有降部：按「基线到大写字母顶」的中线对齐，不按墨迹中心
    W = lb[2] + 2
    pad = 12 if kind == 'icon' else 0  # 应用图标的落地投影
    head = mark_c(M * 0.86, -M * 0.05, M / 2 - 11.9 / 24 * M * 0.86, color) if kind == 'mark' else icon_a(M, pad, pad)
    body = '\n'.join([
        head,
        f'  <g transform="translate({pad} {pad})">',
        f'  <path fill="{color}" transform="translate(0 {num(lat_dy)})" d="{lat_d}"/>',
        '  </g>',
    ])
    return W + 2 * pad, M + 2 * pad, body


def main():
    for suffix, color in (('light', INK), ('dark', PAPER)):
        d, b = latin(200)
        w, h, body = fitted(b, d, color, 4)
        write(os.path.join(BRAND, f'logo-wordmark-{suffix}.svg'), svg(w, h, body, 'Capydown 字标（Manrope，已转曲）。由 build_brand.py 生成'))
        w, h, body = lockup('mark', color)
        write(os.path.join(BRAND, f'logo-lockup-{suffix}.svg'), svg(w, h, body, 'Capydown 组合标志（单色标志 + 字标，已转曲）。由 build_brand.py 生成'))
        w, h, body = lockup('icon', color)
        write(os.path.join(BRAND, f'logo-lockup-icon-{suffix}.svg'), svg(w, h, body, 'Capydown 组合标志（应用图标 + 字标，已转曲）。由 build_brand.py 生成'))

    # PNG：字标 / 组合标志按 viewBox 的 2 倍（吉祥物 PNG 由 export_icons.py 导出）
    jobs = []
    for path in written:
        w, h = (float(v) for v in re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', open(path).read()).groups())
        k = 1 if w >= 1000 else 2
        jobs.append({'src': path, 'out': path[:-4] + '.png', 'w': round(w * k), 'h': round(h * k)})
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as f:
        json.dump(jobs, f)
    subprocess.run(['node', RENDER, f.name], check=True, timeout=180, cwd=os.path.dirname(RENDER))


if __name__ == '__main__':
    main()
