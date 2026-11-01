#!/usr/bin/env python3
"""Slothdown 图标：抱着钢笔打盹的树懒（吉祥物家族，和 喵想 · FantasyAI Lab 的猫同一家族）。

母版（手工维护的 SVG，来自吉祥物家族概念稿 family-v2，笔杆已提亮并加了浅色描边）：
  docs/assets/brand/src/sloth-pen.svg        完整图标，viewBox 100..924（圆角方形主体，无留白）
  docs/assets/brand/src/sloth-pen-small.svg  小尺寸版：头 + 斜放的钢笔（16–48px）
  docs/assets/brand/src/sloth-pen-flat.svg   两色平面版（无渐变、无滤镜）

本脚本生成：
  docs/assets/brand/src/app-icon.svg / app-icon-small.svg  macOS 1024 网格（主体 100..924，带落地投影 class="tile-shadow"），
                                                           export_icons.py 从它们导出 icns / ico / Linux PNG / favicon
  docs/assets/brand/src/app-icon-flat.svg                  平面版副本
  src/renderer/src/assets/images/logo-mark.svg             应用内标志：树懒头（眼罩镂空）+ 斜插的钢笔，只用 currentColor
  docs/assets/brand/logo-mark.svg / logo-mark-dark.svg     同一字形的墨色 / 反白版本
  docs/assets/brand/sloth-pen-art.svg / -dark.svg          无底板的吉祥物（浅色 / 深色背景），给官网和宣传图

用法（仓库根目录）：python3 docs/assets/brand/src/tools/build_icon.py
然后 export_icons.py 导出位图，build_brand.py 重新组合 logo-lockup-*。"""
from __future__ import annotations

import math
import os
import re

ROOT = os.getcwd()
BRAND = os.path.join(ROOT, 'docs/assets/brand')
SRC = os.path.join(BRAND, 'src')
GEN = '由 docs/assets/brand/src/tools/build_icon.py 生成'

TILE_DROP = '<filter id="tileDrop" x="-10%" y="-10%" width="120%" height="125%"><feGaussianBlur stdDeviation="14"/></filter>'


def read(name):
    return open(os.path.join(SRC, name), encoding='utf-8').read()


def strip_comments(s):
    return re.sub(r'<!--.*?-->\n?', '', s, flags=re.S)


# ---------------------------------------------------------------- 应用图标（macOS 网格）
def mac_grid(src, comment):
    """母版 viewBox 100..924 → 1024 网格：四周留 100 的系统留白，加一层落地投影。"""
    s = strip_comments(src)
    s = s.replace('width="1024" height="1024" viewBox="100 100 824 824"', 'viewBox="0 0 1024 1024" width="1024" height="1024"', 1)
    s = s.replace('<defs>', f'<!-- {comment}。{GEN}（1024 网格，主体 100..924） -->\n<defs>\n  {TILE_DROP}', 1)
    s = s.replace('<use href="#squircle" fill="url(#bg)"/>',
                  '<use class="tile-shadow" href="#squircle" fill="#000" opacity="0.32" transform="translate(0 12)" filter="url(#tileDrop)"/>\n'
                  '<use href="#squircle" fill="url(#bg)"/>', 1)
    assert 'viewBox="0 0 1024 1024"' in s and 'tile-shadow' in s
    return s


# ---------------------------------------------------------------- 无底板的吉祥物
def art(dark):
    """去掉底板和外框，只留树懒、钢笔、墨线和 zz。浅色背景版：墨线 / zz 改成墨色，投影变淡，身体加一圈很淡的轮廓。"""
    s = strip_comments(read('sloth-pen.svg'))
    s = s.replace('width="1024" height="1024" viewBox="100 100 824 824"', 'viewBox="150 130 700 790" width="700" height="790"', 1)
    s = s.replace('<use href="#squircle" fill="url(#bg)"/>\n', '', 1)
    s = s.replace('<g clip-path="url(#clip)">', '<g>', 1)
    s = s.replace('<use href="#squircle" fill="none" stroke="url(#rim)" stroke-width="3"/>\n', '', 1)
    if not dark:
        s = s.replace('stroke="#e9eaee" stroke-width="13"', 'stroke="#111111" stroke-width="12"', 1)  # 墨线
        s = s.replace('stroke="#c9cbd0"', 'stroke="#9a9ca3"')  # zz
        s = s.replace('<feFuncA type="linear" slope="0.7"/>', '<feFuncA type="linear" slope="0.2"/>')
        contour = ' stroke="#111111" stroke-opacity="0.16" stroke-width="5"'
        s = s.replace('<g fill="url(#body)">', f'<g fill="url(#body)"{contour}>').replace('<g fill="url(#fur)">', f'<g fill="url(#fur)"{contour}>')
    label = '深色' if dark else '浅色'
    return s.replace('<defs>', f'<!-- Slothdown 吉祥物：抱着钢笔打盹的树懒，无底板（{label}背景）。{GEN} -->\n<defs>', 1)


# ---------------------------------------------------------------- 应用内标志（200 网格，单色）
def head_path():
    """单色树懒头（头部剪影，眼罩镂空、眼睛留实心、鼻子镂空，200 网格），和图标里的头同一个形状；存在 mark-head.txt。"""
    return open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mark-head.txt'), encoding='utf-8').read().strip()


def fmt(v):
    s = f'{v:.1f}'.rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


def xform(d, k, tx, ty):
    """均匀缩放 + 平移一条只含绝对坐标（M L C Q Z）的路径。"""
    out, toks, i = [], re.findall(r'[MLCQZ]|-?[\d.]+', d), 0
    while i < len(toks):
        t = toks[i]
        if t.isalpha():
            out.append(t); i += 1
            continue
        x, y = float(toks[i]), float(toks[i + 1])
        out.append(f'{fmt(x * k + tx)} {fmt(y * k + ty)}'); i += 2
    return ' '.join(out)


# 钢笔：笔尖在左下、笔帽在右上，和小图标一致（与竖直方向成 46°），从头后面穿过
PEN_ANGLE = math.radians(46)
U = (math.sin(PEN_ANGLE), -math.cos(PEN_ANGLE))  # 笔尖 → 笔帽
N = (-U[1], U[0])  # 法向
HEAD_K = 0.66  # 头缩到 0.66，放在中间偏右上，给左下的笔尖留位置
HEAD_C = (116.0, 104.0)  # 头部中心（旧字形的中心是 99.4, 100）
HEAD_TX, HEAD_TY = HEAD_C[0] - 99.4 * HEAD_K, HEAD_C[1] - 100 * HEAD_K
GAP_R = 73  # 笔在这个圆里被头挡住（头半径约 63 + 留缝）
NIB_TIP = (22.0, 192.0)
PEN_LEN = 236
HALF_W = 12.5  # 笔杆半宽（16px 时约 2px 宽）


def pt(t, s=0.0):
    return (NIB_TIP[0] + U[0] * t + N[0] * s, NIB_TIP[1] + U[1] * t + N[1] * s)


def circle_hit(s):
    """笔杆上偏移 s 的那条线与遮挡圆的两个交点（参数 t）。"""
    ox, oy = pt(0, s)
    dx, dy = ox - HEAD_C[0], oy - HEAD_C[1]
    b = dx * U[0] + dy * U[1]
    c = dx * dx + dy * dy - GAP_R * GAP_R
    r = math.sqrt(b * b - c)
    return -b - r, -b + r


def arc(p0, p1, sweep):
    return f'A {GAP_R} {GAP_R} 0 0 {sweep} {fmt(p1[0])} {fmt(p1[1])}'


def pen_parts():
    tl_in, tl_out = circle_hit(-HALF_W)
    tr_in, tr_out = circle_hit(HALF_W)
    # 笔尖段：尖头 → 笔握（宽度从 0 渐变到半宽），止于遮挡圆
    nib_len = 46
    a, b = pt(tl_in, -HALF_W), pt(tr_in, HALF_W)
    nib = (f'M {fmt(NIB_TIP[0])} {fmt(NIB_TIP[1])} '
           f'L {fmt(pt(nib_len, -HALF_W * 0.9)[0])} {fmt(pt(nib_len, -HALF_W * 0.9)[1])} '
           f'L {fmt(a[0])} {fmt(a[1])} {arc(a, b, 1)} '
           f'L {fmt(pt(nib_len, HALF_W * 0.9)[0])} {fmt(pt(nib_len, HALF_W * 0.9)[1])} Z')
    # 笔杆段：从遮挡圆出来到圆头笔帽
    end = PEN_LEN
    c0, c1 = pt(tl_out, -HALF_W), pt(tr_out, HALF_W)
    e0, e1 = pt(end - HALF_W, -HALF_W), pt(end - HALF_W, HALF_W)
    barrel = (f'M {fmt(c0[0])} {fmt(c0[1])} L {fmt(e0[0])} {fmt(e0[1])} '
              f'A {HALF_W} {HALF_W} 0 0 1 {fmt(e1[0])} {fmt(e1[1])} '
              f'L {fmt(c1[0])} {fmt(c1[1])} {arc(c1, c0, 0)} Z')
    # 笔帽上的一道金属环（镂空细缝），16px 以上能看出是钢笔
    r0, r1 = end - 62, end - 52
    ring = (f'M {fmt(pt(r0, -HALF_W - 1)[0])} {fmt(pt(r0, -HALF_W - 1)[1])} L {fmt(pt(r1, -HALF_W - 1)[0])} {fmt(pt(r1, -HALF_W - 1)[1])} '
            f'L {fmt(pt(r1, HALF_W + 1)[0])} {fmt(pt(r1, HALF_W + 1)[1])} L {fmt(pt(r0, HALF_W + 1)[0])} {fmt(pt(r0, HALF_W + 1)[1])} Z')
    return nib, barrel, ring


def mark_body(color, head):
    nib, barrel, ring = pen_parts()
    h = xform(head, HEAD_K, HEAD_TX, HEAD_TY)
    return (f'  <path fill="{color}" fill-rule="evenodd" d="{h}"/>\n'
            f'  <path fill="{color}" fill-rule="evenodd" d="{barrel} {ring}"/>\n'
            f'  <path fill="{color}" d="{nib}"/>\n')


def mark_inline(head):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">\n'
            f'  <!-- Slothdown 应用内标志：树懒头（眼罩镂空）+ 斜插的钢笔，只用 currentColor（夜间主题自动反白）。{GEN} -->\n'
            + mark_body('currentColor', head) + '</svg>\n')


def mark_colored(head, color, label):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">\n'
            f'  <!-- Slothdown 标志（{label}）：树懒头 + 钢笔，单色。{GEN} -->\n'
            + mark_body(color, head) + '</svg>\n')


# 笔尖在 200 网格里的位置：启动画面的墨线从这里画出
NIB_XY = NIB_TIP

if __name__ == '__main__':
    head = head_path()
    out = {
        os.path.join(SRC, 'app-icon.svg'): mac_grid(read('sloth-pen.svg'), 'Slothdown 应用图标：抱着钢笔打盹的树懒（≥64px）'),
        os.path.join(SRC, 'app-icon-small.svg'): mac_grid(read('sloth-pen-small.svg'), 'Slothdown 应用图标小尺寸版：头 + 钢笔（16–32px）'),
        os.path.join(SRC, 'app-icon-flat.svg'): strip_comments(read('sloth-pen-flat.svg')).replace('<defs>', f'<!-- Slothdown 两色平面版。{GEN} -->\n<defs>', 1),
        os.path.join(ROOT, 'src/renderer/src/assets/images/logo-mark.svg'): mark_inline(head),
        os.path.join(BRAND, 'logo-mark.svg'): mark_colored(head, '#111111', '墨色'),
        os.path.join(BRAND, 'logo-mark-dark.svg'): mark_colored(head, '#EDEDED', '反白，深色背景'),
        os.path.join(BRAND, 'sloth-pen-art.svg'): art(False),
        os.path.join(BRAND, 'sloth-pen-art-dark.svg'): art(True),
    }
    for path, text in out.items():
        with open(path, 'w', encoding='utf-8') as f:
            f.write(text)
        print('wrote', os.path.relpath(path, ROOT))
    print('nib tip (200 grid):', fmt(NIB_XY[0]), fmt(NIB_XY[1]))
