#!/usr/bin/env python3
"""懒得排 · Slothdown 树懒（吉祥物家族版，和 喵想 · FantasyAI Lab 的猫同一家族）：生成图标源文件与应用内标志。

家族约定（与 喵想 图标一致）：深色圆角方形，白色软萌的动物从底边升起，光从左上来，`sculpt` 边缘光，
光泽内嵌的眼睛，两只爪子搭在底边上。树懒 = 半眯的困眼、深色泪滴眼罩、头顶一撮毛、每只爪三根长爪。

  docs/assets/brand/src/app-icon.svg        完整图标（macOS 1024 网格，主体 100..924，带落地投影）：≥64px、Dock、安装包
  docs/assets/brand/src/app-icon-small.svg  只有头部的放大简化版：16 / 32px、favicon（无头顶毛、无爪，像素更干净）
  docs/assets/brand/src/app-icon-flat.svg   两色平面版（无渐变、无滤镜），给只能用纯色的场合
  src/renderer/src/assets/images/logo-mark.svg  应用内标志：头部剪影 + 镂空眼罩，只用 currentColor
  docs/assets/brand/logo-mark.svg / logo-mark-dark.svg  同一字形的墨色 / 反白版本
  docs/assets/brand/sloth-peek.svg / sloth-peek-dark.svg  吉祥物：无外框、从底边升起的树懒（浅色 / 深色背景）

几何来自吉祥物家族概念稿（sloth-2），这里是自包含的副本，构建不依赖仓库外的文件；圆角方形在 squircle.txt。
用法（仓库根目录）：python3 docs/assets/brand/src/tools/build_sloth.py，然后 export_icons.py 导出 PNG / icns / ico，
build_brand.py 重新组合 logo-lockup-*。"""
from __future__ import annotations

import math
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
SQUIRCLE = open(os.path.join(HERE, 'squircle.txt')).read().strip()  # 与 喵想 相同的圆角方形（1024 画布，主体 100..924）
GEN = '由 docs/assets/brand/src/tools/build_sloth.py 生成'

# ---------------------------------------------------------------- 调色（与 喵想 的底板 / 身体完全相同）
BG = ('#3a3c42', '#232429', '#141519')
BODY = ('#ffffff', '#f3f3f5', '#d9dadf', '#b4b6bc', '#8a8c93')
SHADE = '#3e4047'
FEATURE = '#2a2b30'

# ---------------------------------------------------------------- 几何（1024 网格）
# 圆头 + 头顶一撮乱毛，肩部微微鼓出
HEAD = ('M 112 1110 C 112 880 150 742 222 652 '
        'C 212 470 318 334 452 304 '
        'Q 452 270 478 250 Q 480 276 500 290 Q 512 254 548 244 Q 534 272 546 298 Q 566 284 584 290 Q 574 300 578 310 '
        'C 716 342 816 480 802 652 '
        'C 874 742 912 880 912 1110 Z')
HEAD_SMOOTH = ('M 112 1110 C 112 880 150 742 222 652 C 212 470 330 316 512 304 '
               'C 694 316 812 470 802 652 C 874 742 912 880 912 1110 Z')  # 小尺寸：去掉头顶毛
TILT = -8
EYES = ((404, 612), (620, 612))
NOSE = 'M 474 708 Q 512 692 550 708 Q 548 736 512 746 Q 476 736 474 708 Z'
NOSE_SMALL = 'M 470 706 Q 512 688 554 706 Q 552 738 512 750 Q 472 738 470 706 Z'
SMILE = 'M 474 772 Q 512 798 550 772'
SMALL_ZOOM = 'translate(538 1040) scale(1.22) translate(-512 -1000)'


def teardrop_d(r, length):
    """圆头（半径 r，圆心在原点）向 +x 方向收成软尖，长 length。"""
    L = length
    return (f'M 0 {-r} C {-0.552*r:.1f} {-r} {-r} {-0.552*r:.1f} {-r} 0 '
            f'C {-r} {0.552*r:.1f} {-0.552*r:.1f} {r} 0 {r} '
            f'C {0.36*L:.1f} {0.92*r:.1f} {0.74*L:.1f} {0.40*r:.1f} {L:.1f} {0.13*r:.1f} '
            f'Q {L+0.14*r:.1f} 0 {L:.1f} {-0.13*r:.1f} '
            f'C {0.74*L:.1f} {-0.40*r:.1f} {0.36*L:.1f} {-0.92*r:.1f} 0 {-r} Z')


def lid_eye_d(cx, ey, w=42, top=16, bottom=50):
    """半眯的眼睛：上眼睑是平缓的弧，下眼睑圆润。"""
    return (f'M {cx-w} {ey+2} Q {cx} {ey-top} {cx+w} {ey+2} '
            f'C {cx+w} {ey+34*bottom/50:.1f} {cx+w*22/42:.1f} {ey+bottom} {cx} {ey+bottom} '
            f'C {cx-w*22/42:.1f} {ey+bottom} {cx-w} {ey+34*bottom/50:.1f} {cx-w} {ey+2} Z')


def patch_angle(side):
    return 180 - 44 if side < 0 else 44


def claws(paw_x, flat_color=None):
    """每只爪三根长爪：月牙形的钩子搭在底边上，尖端朝爪心弯。"""
    out = []
    for dx in (-44, 0, 44):
        x = paw_x + dx
        curl = -1 if dx > 0 else 1 if dx < 0 else (1 if paw_x > 512 else -1)
        y0, h, w = 864, 60, 24
        tx = x + curl * 18
        d = (f'M {x-w/2} {y0} Q {x} {y0-12} {x+w/2} {y0} '
             f'C {x+w/2 - (curl < 0) * 2} {y0+h*0.45:.1f} {tx + curl*-2:.1f} {y0+h*0.8:.1f} {tx:.1f} {y0+h} '
             f'C {tx - curl*10:.1f} {y0+h*0.72:.1f} {x-w/2} {y0+h*0.4:.1f} {x-w/2} {y0} Z')
        if flat_color:
            out.append(f'<path d="{d}" fill="{flat_color}"/>')
        else:
            out.append(f'<path d="{d}" fill="url(#claw)" filter="url(#clawDrop)"/>')
            out.append(f'<path d="M {x-4} {y0+4} Q {x-3} {y0+22} {x+curl*6:.1f} {y0+36}" stroke="#fff" stroke-opacity="0.45" '
                       'stroke-width="4" stroke-linecap="round" fill="none"/>')
    return ''.join(out)


# ---------------------------------------------------------------- 共用 defs
def defs(body=BODY, cast_alpha=0.7):
    return f'''<defs>
  <path id="squircle" d="{SQUIRCLE}"/>
  <clipPath id="clip"><use href="#squircle"/></clipPath>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="{BG[0]}"/><stop offset="0.55" stop-color="{BG[1]}"/><stop offset="1" stop-color="{BG[2]}"/>
  </linearGradient>
  <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity="0.22"/><stop offset="0.35" stop-color="#fff" stop-opacity="0.04"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </linearGradient>
  <radialGradient id="body" cx="0.30" cy="0.18" r="0.95">
    <stop offset="0" stop-color="{body[0]}"/><stop offset="0.38" stop-color="{body[1]}"/><stop offset="0.62" stop-color="{body[2]}"/><stop offset="0.86" stop-color="{body[3]}"/><stop offset="1" stop-color="{body[4]}"/>
  </radialGradient>
  <linearGradient id="eye" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050506"/><stop offset="1" stop-color="#26272c"/></linearGradient>
  <linearGradient id="patch" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6c6e75"/><stop offset="1" stop-color="#4a4c53"/></linearGradient>
  <linearGradient id="claw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8d8f96"/><stop offset="1" stop-color="#45474d"/></linearGradient>
  <radialGradient id="ring" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0.47" stop-color="#8e9097" stop-opacity="0"/><stop offset="0.6" stop-color="#8e9097" stop-opacity="0.4"/><stop offset="1" stop-color="#8e9097" stop-opacity="0.4"/>
  </radialGradient>
  <clipPath id="headClip"><path d="{HEAD}"/></clipPath>
  <filter id="sculpt" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="30" result="b1"/><feOffset in="b1" dx="-34" dy="-26" result="o1"/>
    <feComposite in="SourceAlpha" in2="o1" operator="out" result="edge1"/>
    <feFlood flood-color="{SHADE}" flood-opacity="0.55"/><feComposite in2="edge1" operator="in" result="shade"/>
    <feGaussianBlur in="SourceAlpha" stdDeviation="6" result="b2"/><feOffset in="b2" dx="10" dy="12" result="o2"/>
    <feComposite in="SourceAlpha" in2="o2" operator="out" result="edge2"/>
    <feFlood flood-color="#ffffff" flood-opacity="0.9"/><feComposite in2="edge2" operator="in" result="shine"/>
    <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="shade"/><feMergeNode in="shine"/></feMerge>
  </filter>
  <filter id="cast" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="22"/><feOffset dx="10" dy="6"/>
    <feComponentTransfer><feFuncA type="linear" slope="{cast_alpha}"/></feComponentTransfer>
  </filter>
  <filter id="eyeInset" x="-30%" y="-30%" width="160%" height="160%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="5" result="b"/><feOffset in="b" dx="4" dy="7" result="o"/>
    <feComposite in="SourceAlpha" in2="o" operator="out" result="e"/>
    <feFlood flood-color="#000" flood-opacity="0.9"/><feComposite in2="e" operator="in" result="s"/>
    <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="s"/></feMerge>
  </filter>
  <filter id="patchSoft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="2.2"/></filter>
  <filter id="clawDrop" x="-40%" y="-20%" width="180%" height="150%"><feDropShadow dx="3" dy="5" stdDeviation="3" flood-color="#000" flood-opacity="0.35"/></filter>
  <filter id="tileDrop" x="-10%" y="-10%" width="120%" height="125%"><feGaussianBlur stdDeviation="14"/></filter>
</defs>
'''


def tile(comment, inner):
    # class="tile-shadow" 是 macOS 网格里的落地投影；export_icons.py 导出无留白版本（Windows / Linux）时去掉它
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">\n'
            f'<!-- {comment}。{GEN}（1024 网格，主体 100..924） -->\n' + defs()
            + '<use class="tile-shadow" href="#squircle" fill="#000" opacity="0.32" transform="translate(0 12)" filter="url(#tileDrop)"/>\n'
            '<use href="#squircle" fill="url(#bg)"/>\n<g clip-path="url(#clip)">\n' + inner + '</g>\n'
            '<use href="#squircle" fill="none" stroke="url(#rim)" stroke-width="3"/>\n</svg>\n')


def face():
    """眼罩 + 半眯的眼 + 高光 + 上眼睑浅褶 + 鼻子 + 微笑（未旋转的 1024 坐标）。"""
    s = ''
    for i, (ex, ey) in enumerate(EYES):
        side = -1 if i == 0 else 1
        s += (f'<path d="{teardrop_d(70, 176)}" transform="translate({ex - side * 2} {ey + 2}) rotate({patch_angle(side)})" '
              'fill="url(#patch)" filter="url(#patchSoft)"/>')
    eyes = ''.join(f'<path d="{lid_eye_d(ex + (4 if i == 0 else -4), ey)}" fill="url(#eye)"/>' for i, (ex, ey) in enumerate(EYES))
    s += f'<g filter="url(#eyeInset)">{eyes}</g>'
    for i, (ex, ey) in enumerate(EYES):
        cx = ex + (4 if i == 0 else -4)
        s += f'<ellipse cx="{cx+14}" cy="{ey+14}" rx="9" ry="9.5" fill="#fff" opacity="0.92"/>'
        s += (f'<path d="M {cx-36} {ey-14} Q {cx} {ey-32} {cx+36} {ey-14}" stroke="#9a9ca3" '
              'stroke-width="5" stroke-linecap="round" fill="none" opacity="0.5"/>')
    s += f'\n<path d="{NOSE}" fill="{FEATURE}"/><ellipse cx="500" cy="710" rx="10" ry="5" fill="#fff" opacity="0.35"/>\n'
    s += f'<path d="{SMILE}" stroke="#8e9097" stroke-width="8" stroke-linecap="round" fill="none"/>\n'
    return s


def creature(contour=''):
    """完整的树懒：头（投影、雕塑光、毛色圈、五官）+ 搭在底边的两只爪。contour：浅色背景用的淡轮廓描边属性。"""
    paws = ''.join(f'<ellipse cx="{x}" cy="934" rx="100" ry="92" fill="{{f}}"/>' for x in (292, 738))
    s = f'<g transform="rotate({TILT} 512 760)">\n'
    s += f'<path d="{HEAD}" fill="#000" filter="url(#cast)"/>\n'
    if contour:
        s += f'<path d="{HEAD}" {contour}/>\n'
    s += f'<g filter="url(#sculpt)"><path d="{HEAD}" fill="url(#body)"/></g>\n'
    s += '<g clip-path="url(#headClip)"><ellipse cx="512" cy="672" rx="620" ry="560" fill="url(#ring)"/></g>\n'
    s += face() + '</g>\n'
    s += f'<g filter="url(#cast)">{paws.format(f="#000")}</g>\n'
    if contour:
        s += f'<g {contour}>{paws.format(f="none")}</g>\n'
    s += f'<g filter="url(#sculpt)">{paws.format(f="url(#body)")}</g>\n'
    s += claws(292) + claws(738) + '\n'
    return s


# ---------------------------------------------------------------- 应用图标
def icon_full():
    return tile('懒得排 · Slothdown 应用图标：从底边升起的树懒（≥64px）', creature())


def icon_small():
    g = f'<g transform="{SMALL_ZOOM} rotate({TILT} 512 760)">'
    g += f'<g filter="url(#sculpt)"><path d="{HEAD_SMOOTH}" fill="url(#body)"/></g>'
    for i, (ex, ey) in enumerate(EYES):
        side = -1 if i == 0 else 1
        g += (f'<path d="{teardrop_d(82, 200)}" transform="translate({ex - side * 2} {ey + 2}) '
              f'rotate({180 - 50 if side < 0 else 50})" fill="#4a4c53"/>')
    for i, (ex, ey) in enumerate(EYES):
        cx = ex + (6 if i == 0 else -6)
        g += f'<path d="{lid_eye_d(cx, ey - 2, w=48, top=18, bottom=56)}" fill="#08080a"/><circle cx="{cx+14}" cy="{ey+16}" r="13" fill="#fff"/>'
    g += f'<path d="{NOSE_SMALL}" fill="{FEATURE}"/></g>\n'
    return tile('懒得排 · Slothdown 应用图标小尺寸版：只有头部（16 / 32px）', g)


def icon_flat():
    s = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="100 100 824 824">\n<!-- 懒得排 · Slothdown 两色平面版。{GEN} -->\n'
         f'<defs><path id="tile" d="{SQUIRCLE}"/><clipPath id="clip"><use href="#tile"/></clipPath></defs>\n'
         f'<use href="#tile" fill="#26292f"/>\n<g clip-path="url(#clip)">\n<g transform="rotate({TILT} 512 760)">\n<path d="{HEAD}" fill="#fff"/>\n')
    for i, (ex, ey) in enumerate(EYES):
        side = -1 if i == 0 else 1
        s += f'<path d="{teardrop_d(70, 176)}" transform="translate({ex - side * 2} {ey + 2}) rotate({patch_angle(side)})" fill="#55575e"/>'
    for i, (ex, ey) in enumerate(EYES):
        cx = ex + (4 if i == 0 else -4)
        s += f'<path d="{lid_eye_d(cx, ey)}" fill="#111215"/><ellipse cx="{cx+14}" cy="{ey+14}" rx="9" ry="9.5" fill="#fff"/>'
    s += f'<path d="{NOSE}" fill="#17181c"/><path d="{SMILE}" stroke="#a9abb2" stroke-width="10" stroke-linecap="round" fill="none"/>\n</g>\n'
    s += ''.join(f'<ellipse cx="{x}" cy="934" rx="100" ry="92" fill="#f1f2f4"/>' for x in (292, 738))
    s += claws(292, '#55575e') + claws(738, '#55575e') + '\n</g>\n</svg>\n'
    return s


# ---------------------------------------------------------------- 单色标志：所有变换算进坐标，输出一条 evenodd 路径
def mat_mul(a, b):
    """仿射矩阵 (a b c d e f)，同 SVG matrix()；返回 a∘b（先做 b）。"""
    return (a[0]*b[0] + a[2]*b[1], a[1]*b[0] + a[3]*b[1], a[0]*b[2] + a[2]*b[3], a[1]*b[2] + a[3]*b[3],
            a[0]*b[4] + a[2]*b[5] + a[4], a[1]*b[4] + a[3]*b[5] + a[5])


def translate(x, y):
    return (1, 0, 0, 1, x, y)


def rotate(deg, cx=0.0, cy=0.0):
    r = math.radians(deg)
    m = (math.cos(r), math.sin(r), -math.sin(r), math.cos(r), 0, 0)
    return mat_mul(translate(cx, cy), mat_mul(m, translate(-cx, -cy)))


def apply(m, x, y):
    return m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5]


def fmt(v):
    s = f'{v:.2f}'.rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


def xform(d, m):
    """变换只含绝对坐标 M/L/Q/C/Z 的路径（仿射变换下贝塞尔控制点直接变换即可）。"""
    out = []
    for cmd, args in re.findall(r'([MLQCZ])([^MLQCZ]*)', d):
        nums = [float(v) for v in args.split()]
        out.append(cmd + ' '.join(f'{fmt(x)} {fmt(y)}' for x, y in (apply(m, nums[i], nums[i + 1]) for i in range(0, len(nums), 2))))
    return ' '.join(out)


# 标志用的闭合头形：图标头部的上半（含头顶毛）+ 圆润的下巴，接近正方形，16px 也认得出
MARK_HEAD = ('M 222 652 C 212 470 318 334 452 304 '
             'Q 452 270 478 250 Q 480 276 500 290 Q 512 254 548 244 Q 534 272 546 298 Q 566 284 584 290 Q 574 300 578 310 '
             'C 716 342 816 480 802 652 C 792 806 664 884 512 884 C 360 884 232 806 222 652 Z')


def bbox(d):
    """控制点包围盒（凸包性质：曲线不会超出控制点范围；这里的头形控制点都贴着轮廓，足够用来居中）。"""
    nums = [float(v) for v in re.findall(r'-?[\d.]+', d)]
    xs, ys = nums[0::2], nums[1::2]
    return min(xs), min(ys), max(xs), max(ys)


def mark_path():
    """200 网格的单色字形（由 app-icon-small 简化）：闭合的头部剪影，眼罩镂空，眼睛在眼罩里留成实心，鼻子镂空。
    不倾斜，保证 16–20px 时左右对称、像素干净；夜间主题反白后正好是「白脸 + 深色眼罩」，和图标一致。"""
    x0, y0, x1, y1 = bbox(MARK_HEAD)
    k = 192 / max(x1 - x0, y1 - y0)
    m = (k, 0, 0, k, 100 - k * (x0 + x1) / 2, 100 - k * (y0 + y1) / 2)
    parts = [xform(MARK_HEAD, m)]
    for i, (ex, ey) in enumerate(EYES):
        side = -1 if i == 0 else 1
        local = mat_mul(m, mat_mul(translate(ex - side * 2, ey + 2), rotate(180 - 50 if side < 0 else 50)))
        parts.append(xform(teardrop_d(78, 172), local))
    for i, (ex, ey) in enumerate(EYES):
        parts.append(xform(lid_eye_d(ex + (6 if i == 0 else -6), ey - 2, w=46, top=18, bottom=56), m))
    parts.append(xform(NOSE_SMALL, m))
    return ' '.join(parts)


def mark_inline():
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">\n'
            f'  <!-- 懒得排 · Slothdown 应用内标志：树懒头部剪影，眼罩镂空，只用 currentColor（夜间主题自动反白）。{GEN} -->\n'
            f'  <path fill="currentColor" fill-rule="evenodd" d="{mark_path()}"/>\n</svg>\n')


def mark_colored(color, label):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">\n'
            f'  <!-- 懒得排 · Slothdown 标志（{label}）：单色，眼罩镂空。{GEN} -->\n'
            f'  <path fill="{color}" fill-rule="evenodd" d="{mark_path()}"/>\n</svg>\n')


# ---------------------------------------------------------------- 吉祥物：无外框、从底边升起
def peek(dark=False):
    """图标里的树懒去掉底板：头和爪子从画面底边升起（底边 = 图标的 924 线）。透明背景。
    浅色背景版：身体渐变略压暗、投影更淡，再加一圈很淡的墨色轮廓，避免白色身体融进白底。"""
    if dark:
        d, contour = defs(cast_alpha=0.55), ''
    else:
        d = defs(body=('#fdfdfd', '#f1f1f3', '#d6d7db', '#b0b2b8', '#85878e'), cast_alpha=0.22)
        contour = 'stroke="#111111" stroke-opacity="0.18" stroke-width="5" fill="none"'
    k = 640 / 700  # 图标里 y 224..924 这一段放进 640 高
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1100 640" width="1100" height="640">\n'
            f'<!-- 懒得排 · Slothdown 吉祥物：从底边升起的树懒（{"深色" if dark else "浅色"}背景）。{GEN} -->\n'
            + d.replace('</defs>', '  <clipPath id="view"><rect width="1100" height="640"/></clipPath>\n</defs>')
            + f'<g clip-path="url(#view)"><g transform="translate(550 640) scale({k:.4f}) translate(-512 -924)">\n'
            + creature(contour) + '</g></g>\n</svg>\n')


if __name__ == '__main__':
    ROOT = os.getcwd()
    BRAND = os.path.join(ROOT, 'docs/assets/brand')
    out = {
        os.path.join(BRAND, 'src/app-icon.svg'): icon_full(),
        os.path.join(BRAND, 'src/app-icon-small.svg'): icon_small(),
        os.path.join(BRAND, 'src/app-icon-flat.svg'): icon_flat(),
        os.path.join(ROOT, 'src/renderer/src/assets/images/logo-mark.svg'): mark_inline(),
        os.path.join(BRAND, 'logo-mark.svg'): mark_colored('#111111', '墨色'),
        os.path.join(BRAND, 'logo-mark-dark.svg'): mark_colored('#EDEDED', '反白，深色背景'),
        os.path.join(BRAND, 'sloth-peek.svg'): peek(),
        os.path.join(BRAND, 'sloth-peek-dark.svg'): peek(dark=True),
    }
    for path, text in out.items():
        with open(path, 'w', encoding='utf-8') as f:
            f.write(text)
        print('wrote', os.path.relpath(path, ROOT))
