# 旧品牌（LazyBox · 懒排）的字标与组合标志生成器。应用图标与标志已换成树懒，见 build_sloth.py；
# 字标 / 组合标志等宣传素材待品牌宣传任务更新为「懒得排 · Slothdown」。
#
# 标志概念：Markdown 的「#」向右延伸，上面一横变成粗重的标题，下面一横变成标题下的细线——
# 正是启动画面里「# 懒排」排成标题的那一刻。外框是一个方块（Box）。
#
# 依赖：pip install fonttools shapely
# 字体（都是 SIL OFL，可自由转曲用于标志）：
#   LB_FONT_LATIN  Manrope 可变字体 Manrope[wght].ttf（github.com/google/fonts/tree/main/ofl/manrope）
#   LB_FONT_CJK    思源宋体 SourceHanSerifCN-Bold.otf（github.com/adobe-fonts/source-han-serif）
# 用法（仓库根目录）：LB_FONT_LATIN=... LB_FONT_CJK=... python3 docs/assets/brand/src/tools/build_brand.py
# 生成 SVG 后用 render 脚本导出 PNG / icns / ico（见 export_icons.py）。
import math
import os

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from shapely.geometry import Polygon
from shapely.ops import unary_union

ROOT = os.getcwd()
BRAND = os.path.join(ROOT, 'docs/assets/brand')
SRC = os.path.join(BRAND, 'src')
FONT_LATIN = os.environ.get('LB_FONT_LATIN', 'Manrope.ttf')
FONT_CJK = os.environ.get('LB_FONT_CJK', 'SourceHanSerifCN-Bold.otf')

INK = '#111111'  # 浅色背景上的墨色（与启动画面一致）
PAPER = '#EDEDED'  # 深色背景上的反白色


def num(v):
    s = f'{v:.2f}'.rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


# ---------- 几何 ----------

def squircle(cx, cy, size, k=10, corner=0.34, n=3.4):
    """连续圆角方形（接近 macOS 图标外形）：四边是直线，四角是超椭圆弧（曲率平滑过渡，不像普通圆角那样突变）。
    corner 是圆角区域占边长的比例，n 是超椭圆指数。角弧用 Catmull-Rom 转三次贝塞尔。"""
    h, R = size / 2, size * corner
    d = []
    # 四个角：角心 (ccx, ccy) 与两个方向；每个角从一条边的终点画到下一条边的起点（顺时针）
    for sx, sy, start in ((1, -1, 0.0), (1, 1, 90.0), (-1, 1, 180.0), (-1, -1, 270.0)):
        ccx, ccy = cx + sx * (h - R), cy + sy * (h - R)
        pts = []
        for i in range(k + 1):
            t = math.radians(start - 90 + 90 * i / k)
            c, s_ = math.cos(t), math.sin(t)
            pts.append((ccx + R * math.copysign(abs(c) ** (2 / n), c), ccy + R * math.copysign(abs(s_) ** (2 / n), s_)))
        d.append(('M' if not d else 'L') + f'{num(pts[0][0])} {num(pts[0][1])}')
        for i in range(k):
            p0 = pts[i - 1] if i > 0 else (2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1])
            p1, p2 = pts[i], pts[i + 1]
            p3 = pts[i + 2] if i + 2 <= k else (2 * pts[k][0] - pts[k - 1][0], 2 * pts[k][1] - pts[k - 1][1])
            c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
            c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
            d.append(f'C{num(c1[0])} {num(c1[1])} {num(c2[0])} {num(c2[1])} {num(p2[0])} {num(p2[1])}')
    return ''.join(d) + 'Z'


# 「#」的几何，64 网格（标志外框 4..60）。
SLANT = math.tan(math.radians(9))  # 竖笔像等宽字体里的 # 一样微微右倾
STEM_W, STEM_TOP, STEM_BOT = 5.0, 16.0, 48.0
STEM_X = (19.7, 29.7)  # 竖笔在 y=32 处的中心
BAR_X0, BAR_X1 = 12.0, 52.0
HEAD = (23.0, 31.0)  # 粗横：标题
RULE = (37.0, 40.6)  # 细横：标题下的细线


def hash_polygon():
    shapes = []
    for cx in STEM_X:
        def x_at(y, dx):
            return cx + dx + (32 - y) * SLANT
        shapes.append(Polygon([
            (x_at(STEM_TOP, -STEM_W / 2), STEM_TOP), (x_at(STEM_TOP, STEM_W / 2), STEM_TOP),
            (x_at(STEM_BOT, STEM_W / 2), STEM_BOT), (x_at(STEM_BOT, -STEM_W / 2), STEM_BOT)]))
    for y0, y1 in (HEAD, RULE):
        shapes.append(Polygon([(BAR_X0, y0), (BAR_X1, y0), (BAR_X1, y1), (BAR_X0, y1)]))
    u = unary_union(shapes)
    # 外角轻微圆化（大尺寸下不那么生硬），内角留一点点圆
    u = u.buffer(-0.45, quad_segs=6).buffer(0.45, quad_segs=6)
    u = u.buffer(0.25, quad_segs=4).buffer(-0.25, quad_segs=4)
    return u


def poly_path(geom, scale=1.0, ox=0.0, oy=0.0):
    def ring(coords):
        pts = list(coords)[:-1]
        return 'M' + 'L'.join(f'{num(x * scale + ox)} {num(y * scale + oy)}' for x, y in pts) + 'Z'
    return ring(geom.exterior.coords) + ''.join(ring(r.coords) for r in geom.interiors)


HASH = hash_polygon()


def mark_paths(scale=1.0, ox=0.0, oy=0.0):
    """标志 = 方块减去 #：一条 evenodd 路径（无重叠，任何渲染器都一致）。"""
    body = squircle(32 * scale + ox, 32 * scale + oy, 56 * scale)
    return body + poly_path(HASH, scale, ox, oy)


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
        tp = TransformPen(pen, (sc, 0, 0, -sc, x0 + x * sc, baseline))
        gs[g].draw(tp)
        gs[g].draw(TransformPen(bp, (sc, 0, 0, -sc, x0 + x * sc, baseline)))
        d.append(pen.getCommands())
        x += gs[g].width + tracking_em * upm
        prev = ch
    return ''.join(d), bp.bounds  # bounds: xmin, ymin, xmax, ymax（已是 SVG 坐标）


LATIN_KERN = {'La': -30, 'az': -4, 'yB': 6, 'Bo': -6, 'ox': -8}


def latin(size, baseline=0.0, x0=0.0):
    return text_paths(FONT_LATIN, 'LazyBox', size, -0.022, wght=720, kern=LATIN_KERN, baseline=baseline, x0=x0)


def cjk(size, baseline=0.0, x0=0.0):
    return text_paths(FONT_CJK, '懒排', size, 0.06, baseline=baseline, x0=x0)


# ---------- 输出 ----------

def svg(w, h, body, comment=''):
    c = f'\n  <!-- {comment} -->' if comment else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {num(w)} {num(h)}" '
            f'width="{num(w)}" height="{num(h)}">{c}\n{body}\n</svg>\n')


def write(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print('wrote', os.path.relpath(path, ROOT))


def fitted(d_bounds, d, color, pad):
    x0, y0, x1, y1 = d_bounds
    w, h = x1 - x0 + 2 * pad, y1 - y0 + 2 * pad
    body = f'  <path fill="{color}" transform="translate({num(pad - x0)} {num(pad - y0)})" d="{d}"/>'
    return w, h, body


def main():
    mark = mark_paths()
    note = 'LazyBox · 懒排 标志：Markdown 的 # 排成标题（粗横）与细线，装在一个方块里。由 docs/assets/brand/src/tools/build_brand.py 生成'

    # 应用内标志、logo-mark*.svg 与应用图标源文件已改由 build_sloth.py（树懒）生成，这里只生成字标与组合标志。

    # 字标：LazyBox（Manrope）与 懒排（思源宋体，和启动画面的宋体标题呼应）
    d, b = latin(200)
    for suffix, color in (('light', INK), ('dark', PAPER)):
        w, h, body = fitted(b, d, color, 4)
        write(os.path.join(BRAND, f'logo-wordmark-{suffix}.svg'), svg(w, h, body, 'LazyBox 字标（Manrope，已转曲）'))
    d, b = cjk(200)
    for suffix, color in (('light', INK), ('dark', PAPER)):
        w, h, body = fitted(b, d, color, 4)
        write(os.path.join(BRAND, f'logo-wordmark-zh-{suffix}.svg'), svg(w, h, body, '懒排 字标（思源宋体 Bold，已转曲）'))

    # 组合标志：[标志]  LazyBox │ 懒排 ——文字以标志的垂直中线居中
    M = 128  # 标志高度
    s = M / 56  # 64 网格的方块（56）缩放到 M
    mark_d = mark_paths(s, -4 * s, -4 * s)
    cap = 1440 / 2000  # Manrope 大写高度 / em
    lat_size = M * 0.40 / cap
    lat_d, lb = latin(lat_size, baseline=M / 2 + M * 0.20, x0=M + M * 0.30)
    rule_x = lb[2] + M * 0.24
    zh_size = lat_size * 0.92
    zh_d, zb = cjk(zh_size, baseline=0, x0=rule_x + M * 0.24)
    zh_dy = M / 2 - (zb[1] + zb[3]) / 2  # 汉字墨迹居中
    rule_h = M * 0.46
    W = zb[2] + 2
    for suffix, color in (('light', INK), ('dark', PAPER)):
        body = '\n'.join([
            f'  <path fill="{color}" fill-rule="evenodd" d="{mark_d}"/>',
            f'  <path fill="{color}" d="{lat_d}"/>',
            f'  <rect fill="{color}" fill-opacity="0.28" x="{num(rule_x)}" y="{num(M / 2 - rule_h / 2)}" width="{num(M * 0.016)}" height="{num(rule_h)}"/>',
            f'  <path fill="{color}" transform="translate(0 {num(zh_dy)})" d="{zh_d}"/>',
        ])
        write(os.path.join(BRAND, f'logo-lockup-{suffix}.svg'), svg(W, M, body, 'LazyBox · 懒排 组合标志（已转曲）'))

if __name__ == '__main__':
    main()
