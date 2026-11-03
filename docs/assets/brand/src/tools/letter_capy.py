#!/usr/bin/env python3
"""Capydown 品牌母版：字母动物插画风格的 C —— 一只卡皮巴拉盘成大写 C，头顶趴着一只小卡皮巴拉。

参数化几何，别手改生成出来的 SVG。本脚本是图标 / 吉祥物 / 字标 / 组合标志的唯一来源，
取代了旧的 capybara.py + build_icon.py + build_brand.py（从底边探出头的「喵想猫同款」构图已退役）。

生成（仓库相对路径）：
  docs/assets/brand/src/capybara.svg            完整字母插画，无底板，1024 画布
  docs/assets/brand/src/capybara-small.svg      小尺寸版：去掉小卡皮巴拉和绒毛碎线，五官放大（16–48px）
  docs/assets/brand/src/capybara-flat.svg       两色平面版（无侧面阴影）
  docs/assets/brand/src/capy-glyph.svg          单色字形：C + 卡皮巴拉侧脸（24 网格，单路径 + 眼睛镂空）
  docs/assets/brand/src/app-icon.svg            应用图标，1024 网格（奶油色圆角方形主体 100..924 + 落地投影）
  docs/assets/brand/src/app-icon-small.svg      同上，小尺寸版
  docs/assets/brand/src/app-icon-flat.svg       同上，平面版（无投影）
  docs/assets/brand/capybara-art.svg|-dark.svg  无底板的吉祥物（官网 / 宣传图）
  docs/assets/brand/logo-mark.svg|-dark.svg     单色字形（墨色 / 反白）
  docs/assets/brand/logo-wordmark-light|dark    字标 Capydown（Nunito Black 转曲）
  docs/assets/brand/logo-lockup-light|dark      组合标志：字母动物 C + apydown
  docs/assets/brand/logo-lockup-icon-light|dark 组合标志：应用图标 + Capydown
  src/renderer/src/assets/images/logo-mark.svg      应用内标志（currentColor，夜间自动反白）
  src/renderer/src/assets/images/logo-wordmark.svg  应用内字标「apydown」（接在标志的 C 后面，currentColor）

字体：Nunito Black（SIL OFL，已随仓库放在 src/fonts/，转曲后 SVG 不依赖字体）。
依赖：pip install fonttools pillow；测量墨迹范围要用 tools/render-batch.mjs（需要 playwright-core + 本机 Chrome）。
用法（仓库根目录）：python3 docs/assets/brand/src/tools/letter_capy.py
然后 export_icons.py 导出位图（icns / ico / Linux PNG / favicon / 品牌 PNG）。"""
from __future__ import annotations

import json
import math
import os
import re
import subprocess
import tempfile

from PIL import Image
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = os.getcwd()
BRAND = os.path.join(ROOT, 'docs/assets/brand')
SRC = os.path.join(BRAND, 'src')
TOOLS = os.path.join(SRC, 'tools')
RENDER = os.environ.get('CAPY_RENDER', os.path.join(TOOLS, 'render-batch.mjs'))
GEN = '由 docs/assets/brand/src/tools/letter_capy.py 生成'

SMALL = False  # True 时省略绒毛碎线、嘴角等小尺寸会糊掉的细节


# ---------------------------------------------------------------- SVG 基本图元
def f(v):
    s = f'{v:.1f}'
    return s[:-2] if s.endswith('.0') else s


def rr(x0, y0, x1, y1, tl=0, tr=0, br=0, bl=0):
    """四角半径可分别指定的圆角矩形。"""
    return (f'M{f(x0 + tl)} {f(y0)} H{f(x1 - tr)} ' + (f'A{f(tr)} {f(tr)} 0 0 1 {f(x1)} {f(y0 + tr)} ' if tr else '') +
            f'V{f(y1 - br)} ' + (f'A{f(br)} {f(br)} 0 0 1 {f(x1 - br)} {f(y1)} ' if br else '') +
            f'H{f(x0 + bl)} ' + (f'A{f(bl)} {f(bl)} 0 0 1 {f(x0)} {f(y1 - bl)} ' if bl else '') +
            f'V{f(y0 + tl)} ' + (f'A{f(tl)} {f(tl)} 0 0 1 {f(x0 + tl)} {f(y0)} ' if tl else '') + 'Z')


def stroke(d, w, c, extra=''):
    return f'<path d="{d}" fill="none" stroke="{c}" stroke-width="{f(w)}" stroke-linecap="round" stroke-linejoin="round" {extra}/>'


def fill(d, c, extra=''):
    return f'<path d="{d}" fill="{c}" {extra}/>'


def ell(cx, cy, rx, ry, c, rot=0, extra=''):
    t = f' transform="rotate({f(rot)} {f(cx)} {f(cy)})"' if rot else ''
    return f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" fill="{c}"{t} {extra}/>'


def circ(cx, cy, r, c, extra=''):
    return f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{c}" {extra}/>'


def mask(mid, inner):
    return (f'<mask id="{mid}" maskUnits="userSpaceOnUse" x="-300" y="-300" width="1624" height="1624">'
            f'<g fill="#fff" stroke="#fff">{inner}</g></mask>')


def shaded(mid, shape_fn, base, shade, dx=-20, dy=-14):
    """平面侧阴影：整体先涂暗色，再把亮色往左上偏移一点画在上面，两层都裁进形状里
    —— 右下边缘留下一条干净的暗带，不用渐变。"""
    m = mask(mid, shape_fn('#fff'))
    return m + f'<g mask="url(#{mid})">{shape_fn(shade)}<g transform="translate({dx} {dy})">{shape_fn(base)}</g></g>'


def ticks(pts, c, w=8, L=20):
    """绒毛短线 (x, y, 角度)，小尺寸版省略。"""
    if SMALL:
        return ''
    out = ''
    for x, y, a in pts:
        dx, dy = math.cos(math.radians(a)) * L / 2, math.sin(math.radians(a)) * L / 2
        out += stroke(f'M{f(x - dx)} {f(y - dy)} L{f(x + dx)} {f(y + dy)}', w, c)
    return out


# ---------------------------------------------------------------- 配色
INK = '#3B2A22'
BLUSH = '#F29A8E'
CAPY = dict(body='#C98B55', shade='#A9713F', muzzle='#9A6236', ear='#9B6236', inner='#6F4329',
            paw='#6E4630', baby='#DDA56E', babyshade='#BE8550')
TILE = '#FBF1E1'  # 图标底板：奶油色（整套字母动物共用的浅色纸感）
PAPER_INK = '#111111'  # 浅色背景上的墨色（与启动画面一致）
PAPER = '#EDEDED'  # 深色背景上的反白色

CW = 224  # C 的笔画粗细
YC = 780  # 妈妈的头所在的那条横臂的中心线
C_PATH = 'M690 300 L520 300 A240 240 0 0 0 520 780 L560 780'


# ---------------------------------------------------------------- 字母插画
def capy_head_path(yc=YC, x_back=520, x_front=840, up=132, down=126):
    """方头卡皮巴拉：从 y=yc 的横臂上长出来，钝鼻子朝右。"""
    t, b, a0, a1 = yc - up, yc + down, yc - CW / 2, yc + CW / 2
    return (f'M{x_back} {a0} C{x_back + 70} {a0} {x_back + 90} {t} {x_back + 160} {t} '
            f'L{x_front - 92} {t} C{x_front - 34} {t} {x_front} {t + 34} {x_front} {t + 92} '
            f'L{x_front} {b - 104} C{x_front} {b - 40} {x_front - 44} {b} {x_front - 108} {b} '
            f'L{x_back + 170} {b} C{x_back + 100} {b} {x_back + 80} {a1} {x_back} {a1} Z')


def capy_face(yc=YC, x_front=840, closed=True):
    """情绪稳定的脸：安详闭着的眼睛（小尺寸版改成睁眼，不然只剩一根线），鼻孔在钝鼻子高处。"""
    ex, ey, r = x_front - 160, yc - 34, 20
    if closed and not SMALL:
        g = stroke(f'M{f(ex - 22)} {f(ey - 4)} Q{f(ex)} {f(ey + 18)} {f(ex + 22)} {f(ey - 4)}', 10, INK)
    else:
        rs = r * (1.3 if SMALL else 1.0)
        g = circ(ex, ey, rs, INK) + circ(ex + rs * 0.3, ey - rs * 0.3, rs * 0.3, '#fff')
    g += ell(x_front - 40, yc - 52, 17, 11, INK, -10)
    if not SMALL:
        g += stroke(f'M{x_front - 50} {yc + 52} Q{x_front - 36} {yc + 64} {x_front - 22} {yc + 50}', 7, INK)
    g += ell(ex + 28, yc + 40, 30, 17, BLUSH, 0, 'opacity=".85"')
    return g


def capy_letter(mid, flat=False):
    """C 的笔画 + 妈妈的头，带耳朵、侧阴影和更深的钝鼻子。"""
    head = capy_head_path()
    shape = lambda c: stroke(C_PATH, CW, c) + fill(head, c)
    ex, ey = 590, YC - 132 + 10
    g = circ(ex, ey, 38, CAPY['ear']) + circ(ex + 3, ey + 2, 19, CAPY['inner'])
    if flat:
        g += shape(CAPY['body'])
        return g
    g += shaded(mid, shape, CAPY['body'], CAPY['shade'], -18, -14)
    g += mask(mid + 'h', fill(head, '#fff'))
    g += f'<g mask="url(#{mid}h)">{ell(900, YC - 6, 150, 190, CAPY["muzzle"], 0, "opacity=\'.45\'")}</g>'
    return g


def baby_capy(x=584, y=192, s=1.0, flat=False):
    """趴在 C 上端的小卡皮巴拉，朝右；(x, y) = 豆子形身体的左下角。"""
    P = lambda dx, dy: f'{f(x + dx * s)} {f(y - dy * s)}'
    d = (f'M{P(0, 0)} C{P(0, 80)} {P(28, 100)} {P(70, 102)} C{P(102, 104)} {P(104, 128)} {P(140, 128)} '
         f'L{P(170, 128)} C{P(196, 128)} {P(204, 110)} {P(204, 84)} L{P(204, 28)} C{P(204, 8)} {P(192, 0)} {P(172, 0)} Z')
    g = ''
    for px in (52, 150):  # 小爪子
        g += fill(rr(x + (px - 18) * s, y - 20 * s, x + (px + 18) * s, y + 12 * s, 0, 0, 13 * s, 13 * s), CAPY['paw'])
    g += circ(x + 124 * s, y - 124 * s, 20 * s, CAPY['ear']) + circ(x + 125 * s, y - 123 * s, 10 * s, CAPY['inner'])
    if flat:
        g += fill(d, CAPY['baby'])
    else:
        g += mask('baby', fill(d, '#fff')) + fill(d, CAPY['babyshade'])
        g += f'<g mask="url(#baby)"><g transform="translate({f(-10 * s)} {f(-8 * s)})">{fill(d, CAPY["baby"])}</g>'
        g += ell(x + 236 * s, y - 64 * s, 66 * s, 90 * s, CAPY['muzzle'], 0, 'opacity=".4"') + '</g>'
    ex, ey = x + 150 * s, y - 86 * s
    g += circ(ex, ey, 12 * s, INK) + circ(ex + 4 * s, ey - 4 * s, 4 * s, '#fff')
    g += ell(x + 190 * s, y - 104 * s, 10 * s, 7 * s, INK, -10)
    g += ell(x + 150 * s, y - 50 * s, 17 * s, 10 * s, BLUSH, 0, 'opacity=".9"')
    return g


TICKS = [(246, 470, 100), (258, 560, 85), (292, 650, 60), (330, 400, 120), (430, 232, 0), (540, 214, 5)]


def capydown_c(mid='c2', pup=True, flat=False):
    """大写 C = 妈妈卡皮巴拉，头是下端的收笔；上端的收笔上趴着一只小卡皮巴拉。"""
    g = ''
    for x in (676, 758):  # 下巴底下的两只前爪
        g += fill(rr(x - 34, 860, x + 34, 924, 0, 0, 24, 24), CAPY['paw'])
    g += capy_letter(mid, flat)
    g += ticks(TICKS, CAPY['shade'])
    g += capy_face()
    if pup:
        g += baby_capy(flat=flat)
    return g


def art(pup=True, small=False, flat=False):
    global SMALL
    SMALL = small
    g = capydown_c('c2' if pup else 'c2s', pup, flat)
    SMALL = False
    return g


# ---------------------------------------------------------------- 单色字形（24 网格）
# 一条路径勾出「C 的笔画 + 侧脸」的外轮廓，再用 even-odd 把 C 的内孔和眼睛挖空。
# 不用 mask / 多个形状：内联进应用后不会产生重复 id，缩到 16px 也不会糊。
def glyph_d():
    # 插画坐标（C 的笔画中心线）线性映射到 24 网格。字形里的头比插画里更夸张
    # —— 明显高过笔画、耳朵单独鼓出来、睁眼挖空，不然 16px 下只剩一个 C。
    # 头顶比笔画高一点就够了：再高会把 C 的开口堵死；下巴与笔画下沿齐平，底边一笔到底
    HT, HB, XF = YC - 150, YC + CW / 2, 862  # 头顶 / 下巴 / 鼻尖
    EAX, EAR = 644, 50  # 耳朵（半圆，骑在头顶的线上）
    x0, x1, y0, y1 = 520 - 240 - CW / 2, XF, 300 - CW / 2, HB  # 不含小卡皮巴拉与爪子的墨迹范围
    s = 18.6 / (y1 - y0)
    ox, oy = (24 - (x1 - x0) * s) / 2 - x0 * s, (24 - (y1 - y0) * s) / 2 - y0 * s
    X = lambda v: v * s + ox
    Y = lambda v: v * s + oy
    cx, ytop, ybot, R, h = X(520), Y(300), Y(YC), 240 * s, CW / 2 * s
    xcap, xf = X(690), X(XF)
    ht, hb = Y(HT), Y(HB)
    eax, ear = X(EAX), EAR * s
    ex, ey, er = X(706), Y(YC - 44), 40 * s  # 眼睛（字形用睁眼：闭眼挖成细缝会消失）

    # 24 网格很小，坐标保留三位小数：一位小数会把圆弧的端点和半径凑不上，眼睛会被压成椭圆
    def f(v):
        return f'{v:.3f}'.rstrip('0').rstrip('.') or '0'

    def pt(x, y):
        return f'{f(x)} {f(y)}'

    d = (
        # 上臂的上沿往右到圆收笔
        f'M{pt(cx, ytop - h)} L{pt(xcap, ytop - h)} '
        f'A{f(h)} {f(h)} 0 0 1 {pt(xcap, ytop + h)} '
        f'L{pt(cx, ytop + h)} '
        # 内弧（绕左侧往下）
        f'A{f(R - h)} {f(R - h)} 0 1 0 {pt(cx, ybot - h)} '
        # 头：脖子向上外张到头顶，先鼓出一只耳朵，再绕过钝鼻子回到笔画下沿
        f'C{pt(cx + 56 * s, ybot - h)} {pt(eax - ear, ht + 70 * s)} {pt(eax - ear, ht)} '
        f'A{f(ear)} {f(ear)} 0 0 1 {pt(eax + ear, ht)} '
        f'L{pt(xf - 72 * s, ht)} '
        f'C{pt(xf - 30 * s, ht)} {pt(xf, ht + 30 * s)} {pt(xf, ht + 72 * s)} '
        f'L{pt(xf, hb - 86 * s)} '
        f'C{pt(xf, hb - 36 * s)} {pt(xf - 40 * s, hb)} {pt(xf - 90 * s, hb)} '
        f'L{pt(cx, hb)} '
        # 外弧（绕左侧回到上臂）
        f'A{f(R + h)} {f(R + h)} 0 1 1 {pt(cx, ytop - h)} Z '
        # 眼睛镂空
        f'M{pt(ex - er, ey)} A{f(er)} {f(er)} 0 1 0 {pt(ex + er, ey)} A{f(er)} {f(er)} 0 1 0 {pt(ex - er, ey)} Z'
    )
    return d


# ---------------------------------------------------------------- 测量墨迹范围
def measure(variants):
    """把每个变体渲染成 512px 透明 PNG，取像素包围盒（插画坐标，1024 基准）。"""
    tmp = tempfile.mkdtemp(prefix='capy-bbox-')
    jobs = []
    for name, g in variants.items():
        p = os.path.join(tmp, name + '.svg')
        open(p, 'w', encoding='utf-8').write(
            f'<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">{g}</svg>')
        jobs.append(dict(src=p, out=os.path.join(tmp, name + '.png'), w=512, h=512))
    jf = os.path.join(tmp, 'jobs.json')
    json.dump(jobs, open(jf, 'w'))
    subprocess.run(['node', RENDER, jf], check=True, timeout=180, stdout=subprocess.DEVNULL)
    out = {}
    for name in variants:
        a = Image.open(os.path.join(tmp, name + '.png')).getchannel('A').point(lambda v: 255 if v > 8 else 0)
        out[name] = tuple(v * 2 for v in a.getbbox())
    return out


def fit(bb, box, size=1024):
    """把插画的墨迹包围盒等比放进 size 画布正中、边长 box 的方框里。"""
    x0, y0, x1, y1 = bb
    s = box / max(x1 - x0, y1 - y0)
    return f'translate({f(size / 2 - s * (x0 + x1) / 2)} {f(size / 2 - s * (y0 + y1) / 2)}) scale({s:.4f})'


# ---------------------------------------------------------------- 字标（转曲）
_FONT = None


def font():
    global _FONT
    if _FONT is None:
        _FONT = instantiateVariableFont(TTFont(os.path.join(SRC, 'fonts/Nunito.ttf')), {'wght': 900})
    return _FONT


def text_path(s, size, x, y, tracking=-3):
    """返回 (路径 d, 前进宽度)，基线在 (x, y)。"""
    ft = font()
    gs, cmap, hmtx = ft.getGlyphSet(), ft.getBestCmap(), ft['hmtx']
    k = size / ft['head'].unitsPerEm
    d, cur = '', x
    for ch in s:
        gn = cmap[ord(ch)]
        pen = SVGPathPen(gs)
        gs[gn].draw(TransformPen(pen, (k, 0, 0, -k, cur, y)))
        d += pen.getCommands()
        cur += hmtx[gn][0] * k + tracking
    return d, cur - x - tracking


def text_bbox(s, size, x, y, tracking=-3):
    """转曲文字的墨迹范围 (x0, y0, x1, y1)，和 text_path 同一套排版参数。"""
    ft = font()
    gs, cmap, hmtx = ft.getGlyphSet(), ft.getBestCmap(), ft['hmtx']
    k = size / ft['head'].unitsPerEm
    box, cur = None, x
    for ch in s:
        gn = cmap[ord(ch)]
        pen = BoundsPen(gs)
        gs[gn].draw(TransformPen(pen, (k, 0, 0, -k, cur, y)))
        if pen.bounds:
            box = pen.bounds if box is None else (min(box[0], pen.bounds[0]), min(box[1], pen.bounds[1]),
                                                  max(box[2], pen.bounds[2]), max(box[3], pen.bounds[3]))
        cur += hmtx[gn][0] * k + tracking
    return box


CAP = 0.705  # Nunito 的大写高度 / em


def text_svg(s, size, color, comment):
    """字标：基线在 y = 大写高度，viewBox 包住上伸部和下伸部（p / y 的尾巴别被裁掉）。"""
    pad = size * 0.02
    base = CAP * size + pad
    d, adv = text_path(s, size, pad, base)
    bb = text_bbox(s, size, pad, base)
    y0, y1 = min(pad, bb[1]), max(base, bb[3])
    w, h = adv + 2 * pad, y1 - y0 + 2 * pad
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 {f(y0 - pad)} {f(w)} {f(h)}" width="{f(w)}" height="{f(h)}">\n'
            f'  <!-- {comment}。{GEN} -->\n  <path fill="{color}" d="{d}"/>\n</svg>\n')


# ---------------------------------------------------------------- 组合输出
def svg(inner, w=1024, h=1024, vb=None, comment='', extra=''):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{f(w)}" height="{f(h)}" '
            f'viewBox="{vb or f"0 0 {f(w)} {f(h)}"}"{extra}>\n  <!-- {comment}。{GEN} -->\n{inner}\n</svg>\n')


SQUIRCLE = open(os.path.join(TOOLS, 'squircle.txt'), encoding='utf-8').read().strip()
TILE_SHADOW = ('<filter id="tileDrop" x="-10%" y="-10%" width="120%" height="125%"><feGaussianBlur stdDeviation="14"/></filter>')


def icon(bb, g, box, shadow=True, comment=''):
    """1024 网格的应用图标：圆角方形主体在 100..924，四周 100 留给 macOS 的落地投影。"""
    defs = f'<defs>\n  {TILE_SHADOW}\n  <path id="squircle" d="{SQUIRCLE}"/>\n  <clipPath id="clip"><use href="#squircle"/></clipPath>\n</defs>'
    body = '<use class="tile-shadow" href="#squircle" fill="#000" opacity="0.26" transform="translate(0 12)" filter="url(#tileDrop)"/>\n' if shadow else ''
    body += f'<use href="#squircle" fill="{TILE}"/>\n'
    body += f'<g clip-path="url(#clip)"><g transform="{fit(bb, box)}">{g}</g></g>'
    return svg(defs + '\n' + body, comment=comment)


def main():
    full, small, flat = art(), art(pup=False, small=True), art(flat=True)
    bb = measure(dict(full=full, small=small))
    out = {}

    # --- 无底板的字母插画
    for name, g, b, label in (('capybara', full, bb['full'], '完整版（≥48px）'),
                              ('capybara-small', small, bb['small'], '小尺寸版：没有小卡皮巴拉和绒毛碎线（16–48px）'),
                              ('capybara-flat', flat, bb['full'], '两色平面版')):
        out[os.path.join(SRC, name + '.svg')] = svg(
            f'<g transform="{fit(b, 940)}">{g}</g>', comment=f'Capydown 字母动物 C：盘成大写 C 的卡皮巴拉，{label}')

    # --- 应用图标（奶油色底板）
    out[os.path.join(SRC, 'app-icon.svg')] = icon(bb['full'], full, 620, True, 'Capydown 应用图标：字母动物 C（≥64px）')
    out[os.path.join(SRC, 'app-icon-small.svg')] = icon(bb['small'], small, 680, True, 'Capydown 应用图标小尺寸版（16–48px）')
    out[os.path.join(SRC, 'app-icon-flat.svg')] = icon(bb['full'], flat, 620, False, 'Capydown 应用图标平面版')

    # --- 官网 / 宣传图用的无底板吉祥物（和 capybara.svg 同一几何，只是方便单独引用）
    for name, label in (('capybara-art', '浅色背景'), ('capybara-art-dark', '深色背景')):
        out[os.path.join(BRAND, name + '.svg')] = svg(
            f'<g transform="{fit(bb["full"], 940)}">{full}</g>',
            comment=f'Capydown 吉祥物：盘成大写 C 的卡皮巴拉，无底板（{label}）')

    # --- 单色字形
    d = glyph_d()
    out[os.path.join(SRC, 'capy-glyph.svg')] = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="240" height="240">\n'
        f'  <!-- Capydown 单色字形：C + 卡皮巴拉侧脸，单路径 even-odd（C 的内孔与眼睛镂空）。{GEN} -->\n'
        f'  <path fill="currentColor" fill-rule="evenodd" d="{d}"/>\n</svg>\n')
    mark = lambda color, label, size: (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"{size}>\n'
        f'  <!-- Capydown 标志（{label}）：C + 卡皮巴拉侧脸，单色。{GEN} -->\n'
        f'  <path fill="{color}" fill-rule="evenodd" d="{d}"/>\n</svg>\n')
    out[os.path.join(ROOT, 'src/renderer/src/assets/images/logo-mark.svg')] = mark('currentColor', '应用内，夜间主题自动反白', '')
    out[os.path.join(BRAND, 'logo-mark.svg')] = mark(PAPER_INK, '墨色', ' width="240" height="240"')
    out[os.path.join(BRAND, 'logo-mark-dark.svg')] = mark(PAPER, '反白，深色背景', ' width="240" height="240"')

    # --- 字标
    for suffix, color in (('light', PAPER_INK), ('dark', PAPER)):
        out[os.path.join(BRAND, f'logo-wordmark-{suffix}.svg')] = text_svg(
            'Capydown', 200, color, f'Capydown 字标（Nunito Black，已转曲，{"墨色" if suffix == "light" else "反白"}）')

    # --- 组合标志（应用内那份把标志和字标排在同一个 SVG 里，省得再用 CSS 对基线）
    for suffix, color in (('light', PAPER_INK), ('dark', PAPER)):
        out[os.path.join(BRAND, f'logo-lockup-{suffix}.svg')] = lockup_mark(d, color, suffix)
        out[os.path.join(BRAND, f'logo-lockup-icon-{suffix}.svg')] = lockup_icon(bb['full'], full, color, suffix)
    out[os.path.join(ROOT, 'src/renderer/src/assets/images/logo-lockup.svg')] = lockup_mark(d, 'currentColor', 'light')

    for path, text in out.items():
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w', encoding='utf-8') as fh:
            fh.write(text)
        print('wrote', os.path.relpath(path, ROOT))
    splash(d)
    hero(bb['full'])


SPLASH = os.path.join(ROOT, 'src/renderer/index.html')
SPLASH_M = 56  # 启动画面里标志的边长


def splash(d):
    """启动画面把标志和字标的路径内联在 index.html 里（没有打包器，动不了 import）——这里顺手同步，免得走样。"""
    M = SPLASH_M
    k = M / 24
    top, base = GLYPH_INK[0] * k, GLYPH_INK[1] * k
    size = (base - top) / CAP
    pad = size * 0.02
    x = 21.0 * k + size * 0.03  # 字标左边缘：字形墨迹的右边缘 + 字距
    adv = text_path('apydown', size, 0, 0)[1]
    bb = text_bbox('apydown', size, pad, CAP * size + pad)
    y0, y1 = min(pad, bb[1]), max(CAP * size + pad, bb[3])
    w, h = adv + 2 * pad, y1 - y0 + 2 * pad
    html = open(SPLASH, encoding='utf-8').read()
    html = re.sub(r'( *)<svg class="lb-splash-mark".*',
                  lambda m: f'{m.group(1)}<svg class="lb-splash-mark" viewBox="0 0 24 24">'
                            f'<path fill="currentColor" fill-rule="evenodd" d="{d}"/></svg>', html)
    html = re.sub(r'( *)<svg class="lb-splash-word".*',
                  lambda m: f'{m.group(1)}<svg class="lb-splash-word" viewBox="0 {f(y0 - pad)} {f(w)} {f(h)}">'
                            f'<path fill="currentColor" d="{text_path("apydown", size, pad, CAP * size + pad)[0]}"/></svg>', html)
    # 只换标记之间的几何，别碰同名的 .is-playing 动画规则
    css = ('/* lockup:start */\n'
           f'      .lb-splash-lockup {{ position: relative; width: {f(x + w)}px; height: {f(M)}px; }}\n'
           '      .lb-splash-lockup svg { position: absolute; display: block; overflow: visible; }\n'
           f'      .lb-splash-mark {{ left: 0; top: 0; width: {f(M)}px; height: {f(M)}px; '
           'will-change: transform, opacity; }\n'
           f'      .lb-splash-word {{ left: {f(x)}px; top: {f(base - (CAP * size + pad) + (y0 - pad))}px; '
           f'width: {f(w)}px; height: {f(h)}px; will-change: transform, opacity; }}\n'
           '      /* lockup:end */')
    html, n = re.subn(r'/\* lockup:start \*/.*?/\* lockup:end \*/', lambda _: css, html, count=1, flags=re.S)
    assert n == 1, 'src/renderer/index.html 里找不到 /* lockup:start */ … /* lockup:end */ 标记'
    open(SPLASH, 'w', encoding='utf-8').write(html)
    print('wrote', os.path.relpath(SPLASH, ROOT), '(启动画面内联的标志 / 字标)')


# 组合标志共用的版式：标志高 M，字标的大写高度和标志墨迹等高、基线对齐
LOCKUP_M = 128
GLYPH_INK = (2.7, 21.3)  # 字形墨迹在 24 网格里的上下边（glyph_d 把墨迹居中放成 18.6 高）


def lockup_mark(d, color, suffix):
    """[单色 C] apydown —— 标志里的 C 就是词的首字母：大写高度和基线都跟着它走。"""
    M = LOCKUP_M
    k = M / 24
    top, base = GLYPH_INK[0] * k, GLYPH_INK[1] * k
    size = (base - top) / CAP  # 字标的大写高度 = 字形墨迹高度
    x = 21.0 * k + size * 0.03  # 字形墨迹的右边缘 + 字距
    td, adv = text_path('apydown', size, x, base)
    bb = text_bbox('apydown', size, x, base)
    body = (f'  <g transform="scale({k:.5f})"><path fill="{color}" fill-rule="evenodd" d="{d}"/></g>\n'
            f'  <path fill="{color}" d="{td}"/>')
    y0, y1 = min(top, bb[1]), max(base, bb[3])  # 'd' 的上伸部 / 'p y' 的下伸部
    pad = size * 0.02
    return svg(body, x + adv + pad, y1 - y0 + 2 * pad,
               vb=f'0 {f(y0 - pad)} {f(x + adv + pad)} {f(y1 - y0 + 2 * pad)}',
               comment=f'Capydown 组合标志（字母动物 C + apydown，已转曲，{"墨色" if suffix == "light" else "反白"}）')


def lockup_icon(bb, g, color, suffix):
    """[应用图标] Capydown —— 图标能显示到 64px 以上时用。"""
    M = LOCKUP_M
    pad = 10  # 图标的落地投影
    size = M * 0.46 / CAP
    cap = CAP * size
    x = M + pad * 2 + M * 0.2
    td, adv = text_path('Capydown', size, x, M / 2 + cap / 2 + pad)
    tile = icon(bb, g, 620, True, '')
    inner = tile[tile.index('>', tile.index('<svg')) + 1:tile.rindex('</svg>')]
    body = (f'  <svg x="{f(pad - 100 * M / 824)}" y="{f(pad - 100 * M / 824)}" width="{f(M * 1024 / 824)}" height="{f(M * 1024 / 824)}" '
            f'viewBox="0 0 1024 1024" overflow="visible">{inner}</svg>\n'
            f'  <path fill="{color}" d="{td}"/>')
    return svg(body, x + adv + size * 0.02, M + 2 * pad,
               comment=f'Capydown 组合标志（应用图标 + 字标，已转曲，{"墨色" if suffix == "light" else "反白"}）')


# ---------------------------------------------------------------- 官网首屏
# 首屏和启动画面是同一个组合标志，只是把单色字形换成彩色的吉祥物，并且标志和字标分别入场。
# 吉祥物画布是 1024 见方，C 的笔画只占其中一块；这里按「C 的墨迹 = 字标的大写区间」算出百分比，
# 直接写进 website/style.css 和两份 index.html（官网没有打包器，路径只能内联）。
SITE = os.path.join(ROOT, 'website')
ART_BOX = (520 - 240 - CW / 2, 300 - CW / 2, 840, YC + CW / 2)  # C 在插画坐标里的墨迹范围（不含小卡皮巴拉和爪子）


def hero(bb):
    cap = 100.0  # 以大写高度 100 为单位算版式，最后再换算成百分比
    m = re.match(r'translate\(([\d.\-]+) ([\d.\-]+)\) scale\(([\d.]+)\)', fit(bb, 940))
    tx, ty, sc = (float(v) for v in m.groups())
    cx0, cy0, cx1, cy1 = ((v * sc + (tx if i % 2 == 0 else ty)) for i, v in enumerate(ART_BOX))
    k = cap / (cy1 - cy0)  # 画布 1 单位 = k 个版式单位
    art = 1024 * k  # 吉祥物整张画布在版式里的边长
    ax, ay = -cx0 * k, -cy0 * k  # 画布左上角的位置（C 的墨迹左上角对齐到原点）

    size = cap / CAP
    pad = size * 0.02
    x = (cx1 - cx0) * k + size * 0.03
    td, adv = text_path('apydown', size, pad, CAP * size + pad)
    tb = text_bbox('apydown', size, pad, CAP * size + pad)
    wy0, wy1 = min(pad, tb[1]), max(CAP * size + pad, tb[3])
    ww, wh = adv + 2 * pad, wy1 - wy0 + 2 * pad
    wy = cap - (CAP * size + pad) + (wy0 - pad)

    bx0, by0 = min(ax, x), min(ay, wy)
    bx1, by1 = max(ax + art, x + ww), max(ay + art, wy + wh)
    W, H = bx1 - bx0, by1 - by0
    pc = lambda v, total: f'{v / total * 100:.2f}%'
    css = ('/* lockup:start */\n'
           f'.hero-lockup {{ position: relative; width: min(560px, 88vw); aspect-ratio: {f(W)} / {f(H)}; '
           'margin: 0 auto; color: var(--ink); }\n'
           '.hero-lockup > * { position: absolute; display: block; overflow: visible; }\n'
           f'.hl-mark {{ left: {pc(ax - bx0, W)}; top: {pc(ay - by0, H)}; width: {pc(art, W)}; height: auto; }}\n'
           f'.hl-word {{ left: {pc(x - bx0, W)}; top: {pc(wy - by0, H)}; width: {pc(ww, W)}; height: {pc(wh, H)}; }}\n'
           '/* lockup:end */')
    word = (f'<svg class="hl-word" viewBox="0 {f(wy0 - pad)} {f(ww)} {f(wh)}">'
            f'<path fill="currentColor" d="{td}"/></svg>')

    style = os.path.join(SITE, 'style.css')
    s = open(style, encoding='utf-8').read()
    s, n = re.subn(r'/\* lockup:start \*/.*?/\* lockup:end \*/', lambda _: css, s, count=1, flags=re.S)
    assert n == 1, 'website/style.css 里找不到 /* lockup:start */ … /* lockup:end */ 标记'
    open(style, 'w', encoding='utf-8').write(s)
    print('wrote', os.path.relpath(style, ROOT), '(首屏组合标志的版式)')

    for page in ('index.html', 'en/index.html'):
        p = os.path.join(SITE, page)
        h = open(p, encoding='utf-8').read()
        h = re.sub(r'<svg class="hl-word".*?</svg>', word, h, flags=re.S)
        h = re.sub(r'(<img class="(?:hl-mark|peek|closing-peek)" src="[^"]*capybara\.svg" alt="" )width="\d+" height="\d+"',
                   r'\1width="1024" height="1024"', h)
        open(p, 'w', encoding='utf-8').write(h)
        print('wrote', os.path.relpath(p, ROOT), '(首屏内联的字标)')


if __name__ == '__main__':
    main()
