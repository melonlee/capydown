#!/usr/bin/env python3
"""懒得排 · Slothdown 树懒图标：生成应用图标源文件与应用内标志（纯 SVG，无字体依赖）。

  docs/assets/brand/src/app-icon-large.svg   A 探头树懒（大尺寸：Dock、≥64px）
  docs/assets/brand/src/app-icon-small.svg   C 正脸树懒的小尺寸简化版（16–48px、favicon；无模糊、眼睛和嘴，像素更干净）
  src/renderer/src/assets/images/logo-mark.svg   应用内标志（C 的单色字形，currentColor）
  docs/assets/brand/logo-mark.svg / logo-mark-dark.svg  同一字形的浅色 / 深色版本
  docs/assets/brand/sloth-peek.svg / sloth-peek-dark.svg  吉祥物：无外框、从底边探头的树懒（宣传图、官网）

几何是手调的；描边 / 圆角方形等密集路径在这里采样，SVG 本身不含脚本。
用法（仓库根目录）：python3 docs/assets/brand/src/tools/build_sloth.py，然后运行 export_icons.py 导出 PNG / icns / ico。"""
import math, os

HERE = os.path.dirname(os.path.abspath(__file__))
SQ = open(os.path.join(HERE, 'squircle.txt')).read().strip()  # macOS 圆角方形（1024 画布，主体 100..924）


def f(v):
    return f'{v:.1f}'.rstrip('0').rstrip('.')


def poly(pts):
    return 'M' + ' L'.join(f'{f(x)} {f(y)}' for x, y in pts) + 'Z'


def qbez(p0, p1, p2, t):
    a = (1 - t) ** 2; b = 2 * (1 - t) * t; c = t * t
    return (a * p0[0] + b * p1[0] + c * p2[0], a * p0[1] + b * p1[1] + c * p2[1])


def brush(p0, p1, p2, w0, w1, n=90, ease=1.0):
    """tapered stroke along a quadratic bezier with round caps -> closed path"""
    cs, ns, hs = [], [], []
    for i in range(n + 1):
        t = i / n
        c = qbez(p0, p1, p2, t)
        d = (2 * (1 - t) * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]),
             2 * (1 - t) * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]))
        L = math.hypot(*d) or 1
        cs.append(c); ns.append((-d[1] / L, d[0] / L)); hs.append(w0 + (w1 - w0) * (t ** ease))
    left = [(c[0] + nn[0] * h, c[1] + nn[1] * h) for c, nn, h in zip(cs, ns, hs)]
    right = [(c[0] - nn[0] * h, c[1] - nn[1] * h) for c, nn, h in zip(cs, ns, hs)]
    pts = left[:]
    # end cap (semicircle around p2)
    a0 = math.atan2(ns[-1][1], ns[-1][0])
    for k in range(1, 24):
        a = a0 - math.pi * k / 24
        pts.append((cs[-1][0] + math.cos(a) * hs[-1], cs[-1][1] + math.sin(a) * hs[-1]))
    pts += right[::-1]
    a0 = math.atan2(-ns[0][1], -ns[0][0])
    for k in range(1, 24):
        a = a0 - math.pi * k / 24
        pts.append((cs[0][0] + math.cos(a) * hs[0], cs[0][1] + math.sin(a) * hs[0]))
    return poly(pts)


def face_disc(cx, cy, rx, ry, dip=0.07, n=180):
    """pale sloth face disc: wide oval with a soft widow's-peak dip at the top and slightly fuller cheeks"""
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        x, y = math.cos(t), math.sin(t)
        # angular distance from straight-up (t = -pi/2)
        d = math.atan2(math.sin(t + math.pi / 2), math.cos(t + math.pi / 2))
        k = 1 - dip * math.exp(-(d / 0.32) ** 2) + 0.035 * math.exp(-((abs(d) - 1.9) / 0.5) ** 2)
        pts.append((cx + x * rx * k, cy + y * ry * k))
    return poly(pts)


def patch(side, cx, cy, s=1.0, tilt=0.0):
    """sloth eye-mask: blob at the eye, tail drooping down/outward. side=+1 right, -1 left (local coords)"""
    p0 = (side * 96 * s, -6 * s)
    p1 = (side * 196 * s, 2 * s)
    p2 = (side * 250 * s, 128 * s)
    return brush(p0, p1, p2, 72 * s, 27 * s, ease=0.9)


def sleepy_eye(side, s=1.0, color='#E9E9E9', sw=11):
    # relaxed, half-closed: a soft downward lid curve
    x = side * 98 * s
    return (f'<path d="M{f(x - 30 * s)} {f(-14 * s)} Q{f(x)} {f(14 * s)} {f(x + 30 * s)} {f(-14 * s)}" '
            f'fill="none" stroke="{color}" stroke-width="{f(sw * s)}" stroke-linecap="round"/>')


COMMON_DEFS = f'''
    <linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2A2A2A"/><stop offset="1" stop-color="#0C0C0C"/>
    </linearGradient>
    <linearGradient id="edge" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFF" stop-opacity="0.24"/><stop offset="0.5" stop-color="#FFF" stop-opacity="0.05"/><stop offset="1" stop-color="#FFF" stop-opacity="0.10"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#000" flood-opacity="0.30"/>
      <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.18"/>
    </filter>
    <clipPath id="sq"><path d="{SQ}"/></clipPath>
    <radialGradient id="fur" cx="0.34" cy="0.22" r="0.95">
      <stop offset="0" stop-color="#F2F2F2"/><stop offset="0.4" stop-color="#D9D9D9"/>
      <stop offset="0.75" stop-color="#ADADAD"/><stop offset="1" stop-color="#7E7E7E"/>
    </radialGradient>
    <radialGradient id="furC" cx="0.34" cy="0.2" r="0.95">
      <stop offset="0" stop-color="#E4E4E4"/><stop offset="0.45" stop-color="#BDBDBD"/>
      <stop offset="0.8" stop-color="#8A8A8A"/><stop offset="1" stop-color="#626262"/>
    </radialGradient>
    <radialGradient id="face" cx="0.4" cy="0.3" r="0.8">
      <stop offset="0" stop-color="#FFFFFF"/><stop offset="0.7" stop-color="#FBFBFB"/><stop offset="1" stop-color="#EFEFEF"/>
    </radialGradient>
    <radialGradient id="mask" cx="0.35" cy="0.3" r="0.9">
      <stop offset="0" stop-color="#2E2E2E"/><stop offset="1" stop-color="#0A0A0A"/>
    </radialGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="10"/></filter>
    <filter id="halo" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="22"/></filter>
    <filter id="soft3" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.5"/></filter>
    <filter id="soft4" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4"/></filter>
    <filter id="cast" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="16"/><feOffset dx="10" dy="18"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.55"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="inner" x="-10%" y="-10%" width="120%" height="120%">
      <feComponentTransfer in="SourceAlpha"><feFuncA type="table" tableValues="1 0"/></feComponentTransfer>
      <feGaussianBlur stdDeviation="14"/><feOffset dx="-10" dy="-16"/>
      <feFlood flood-color="#000" flood-opacity="0.28"/><feComposite operator="in"/>
      <feComposite in2="SourceAlpha" operator="in"/>
      <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode/></feMerge>
    </filter>'''


def frame(inner, defs='', title=''):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <!-- 懒得排 · Slothdown 应用图标 {title}。由 docs/assets/brand/src/tools/build_sloth.py 生成（1024 网格，主体 824） -->
  <defs>{COMMON_DEFS}{defs}
  </defs>
  <g filter="url(#shadow)"><path d="{SQ}" fill="url(#body)"/></g>
  <g clip-path="url(#sq)">
{inner}
  </g>
  <path d="{SQ}" fill="none" stroke="url(#edge)" stroke-width="4" clip-path="url(#sq)"/>
</svg>
'''


def face_features(s=1.0, eye=True, nose=True, mouth=True, eye_color='#E9E9E9'):
    out = []
    for side in (-1, 1):
        out.append(f'<path d="{patch(side, 0, 0, s)}" fill="url(#mask)"/>')
    if eye:
        for side in (-1, 1):
            out.append(sleepy_eye(side, s, eye_color))
    if nose:
        out.append(f'<ellipse cx="0" cy="{f(78 * s)}" rx="{f(40 * s)}" ry="{f(27 * s)}" fill="url(#mask)"/>')
        out.append(f'<ellipse cx="{f(-10 * s)}" cy="{f(68 * s)}" rx="{f(13 * s)}" ry="{f(6 * s)}" fill="#FFF" opacity="0.28"/>')
    if mouth:
        out.append(f'<path d="M{f(-46 * s)} {f(126 * s)} Q0 {f(150 * s)} {f(46 * s)} {f(126 * s)}" fill="none" '
                   f'stroke="#1A1A1A" stroke-width="{f(9 * s)}" stroke-linecap="round" opacity="0.85"/>')
    return '\n'.join('      ' + o for o in out)


# ---------------------------------------------------------------- A · 探头树懒
def build_A():
    inner = f'''    <g filter="url(#cast)"><circle cx="404" cy="874" r="578" fill="url(#fur)"/></g>
    <clipPath id="headA"><circle cx="404" cy="874" r="578"/></clipPath>
    <g clip-path="url(#headA)"><g transform="translate(500 606) rotate(-21)">
      <path d="{face_disc(0, 48, 350, 282)}" fill="#909090" opacity="0.5" filter="url(#halo)"/>
      <path d="{face_disc(0, 44, 312, 242)}" fill="url(#face)" filter="url(#soft4)"/>
      <g transform="scale(0.96)">
{face_features(1.0)}
      </g>
    </g></g>'''
    return frame(inner, title='A 探头树懒（大尺寸）')


# ---------------------------------------------------------------- C · 正脸极简树懒
def build_C():
    inner = f'''    <g transform="translate(512 540)">
      <g filter="url(#cast)"><ellipse cx="0" cy="0" rx="340" ry="310" fill="url(#furC)"/></g>
      <path d="{face_disc(0, 44, 296, 230)}" fill="#6A6A6A" opacity="0.32" filter="url(#halo)"/>
      <path d="{face_disc(0, 40, 272, 208)}" fill="url(#face)" filter="url(#soft3)"/>
      <g transform="translate(0 6) scale(0.93)">
{face_features(1.0)}
      </g>
    </g>'''
    return frame(inner, title='C 正脸树懒（小尺寸）')


# ---------------------------------------------------------------- glyphs (single colour, 20x20 grid drawn at 200)
def glyph_wrap(body, title):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <!-- 懒得排 · Slothdown 标志 {title} — 单色，按 16–20px 调整 -->
  <g fill="currentColor" fill-rule="evenodd" style="color:#111">{body}</g>
</svg>
'''


def gpatch(side, cx, cy, s):
    p0 = (cx + side * 92 * s, cy - 8 * s); p1 = (cx + side * 190 * s, cy - 6 * s); p2 = (cx + side * 262 * s, cy + 92 * s)
    return brush(p0, p1, p2, 66 * s, 34 * s, n=40, ease=1.25)


def glyph_face(cx, cy, s, rot=0, nose=True):
    g = f'<g transform="translate({f(cx)} {f(cy)}) rotate({rot})">'
    g += f'<path d="{gpatch(-1, 0, 0, s)}"/><path d="{gpatch(1, 0, 0, s)}"/>'
    if nose:
        g += f'<ellipse cx="0" cy="{f(80 * s)}" rx="{f(44 * s)}" ry="{f(32 * s)}"/>'
    return g + '</g>'


def glyph_C():
    # ink fur disc, pale face knocked out, ink mask + nose
    return glyph_wrap(f'''
    <defs><mask id="m"><rect width="200" height="200" fill="#fff"/><path d="{face_disc(100, 110, 70, 54, dip=0.09)}" fill="#000"/></mask></defs>
    <ellipse cx="100" cy="100" rx="94" ry="88" mask="url(#m)"/>
    {glyph_face(100, 104, 0.27)}''', 'C')


# dark-UI variants: keep the read "pale face, dark mask" -> light ink with the mask knocked out
def glyph_dark_wrap(body, title):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <!-- 懒得排 · Slothdown 标志 {title}（深色背景）— 单色，眼罩镂空 -->
  <g fill="#F2F2F2">{body}</g>
</svg>
'''


def holes(cx, cy, s, rot=0, nose=True):
    g = f'<g transform="translate({f(cx)} {f(cy)}) rotate({rot})" fill="#000">'
    g += f'<path d="{gpatch(-1, 0, 0, s)}"/><path d="{gpatch(1, 0, 0, s)}"/>'
    if nose:
        g += f'<ellipse cx="0" cy="{f(80 * s)}" rx="{f(44 * s)}" ry="{f(32 * s)}"/>'
    return g + '</g>'


def glyph_C_dark():
    return glyph_dark_wrap(f'''
    <defs><mask id="m"><rect width="200" height="200" fill="#fff"/>{holes(100, 104, 0.27)}</mask></defs>
    <ellipse cx="100" cy="100" rx="94" ry="88" mask="url(#m)"/>''', 'C dark')


def build_C_small():
    """C 的小尺寸版：去掉投影、模糊、眼睛和嘴，只留毛色圆脸 / 白脸盘 / 黑眼罩 / 鼻子，16–32px 像素更干净。"""
    inner = f'''    <g transform="translate(512 540)">
      <ellipse cx="0" cy="0" rx="352" ry="320" fill="#B0B0B0"/>
      <path d="{face_disc(0, 40, 284, 218)}" fill="#FFFFFF"/>
      <g transform="translate(0 6) scale(0.97)">
{face_features(1.0, eye=False, mouth=False)}
      </g>
    </g>'''
    return frame(inner, title='C 正脸树懒（小尺寸）')


# ---------------------------------------------------------------- 应用内标志（无 mask / id，可安全内联）
ELLIPSE = 'M6 100A94 88 0 1 0 194 100A94 88 0 1 0 6 100Z'


def glyph_inline():
    """C 字形：墨色圆脸里挖出浅色脸盘（evenodd），再画墨色眼罩 + 鼻子。只用 currentColor。"""
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <!-- 懒得排 · Slothdown 应用内标志：正脸树懒，只用 currentColor（跟随文字颜色）。由 docs/assets/brand/src/tools/build_sloth.py 生成 -->
  <g fill="currentColor"><path fill-rule="evenodd" d="{ELLIPSE} {face_disc(100, 110, 70, 54, dip=0.09)}"/>{glyph_face(100, 104, 0.27)}</g>
</svg>
'''


# ---------------------------------------------------------------- 吉祥物 · 无外框的探头树懒（宣传图 / 官网）
def build_peek(dark=False):
    """A 的树懒头去掉圆角方形：从画面底边探出来。透明背景，底边是平切口——放在卡片 / 页面底边上用。
    dark=True 给深色背景用（毛色更亮，阴影更淡）。"""
    shade = '#FFFFFF' if dark else '#000000'
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1100 640" width="1100" height="640">
  <!-- 懒得排 · Slothdown 吉祥物：从底边探头的树懒（{'深色背景' if dark else '浅色背景'}）。由 docs/assets/brand/src/tools/build_sloth.py 生成 -->
  <defs>{COMMON_DEFS}
    <clipPath id="view"><rect width="1100" height="640"/></clipPath>
    <radialGradient id="furP" cx="0.36" cy="0.18" r="0.9">
      <stop offset="0" stop-color="{'#F4F4F4' if dark else '#CFCFCF'}"/><stop offset="0.45" stop-color="{'#C9C9C9' if dark else '#9C9C9C'}"/>
      <stop offset="0.8" stop-color="{'#8E8E8E' if dark else '#5E5E5E'}"/><stop offset="1" stop-color="{'#6A6A6A' if dark else '#3A3A3A'}"/>
    </radialGradient>
    <filter id="drop" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="18" flood-color="{shade}" flood-opacity="{'0.0' if dark else '0.16'}"/>
    </filter>
  </defs>
  <g clip-path="url(#view)">
    <g filter="url(#drop)"><circle cx="550" cy="680" r="540" fill="url(#furP)"/></g>
    <clipPath id="headP"><circle cx="550" cy="680" r="540"/></clipPath>
    <g clip-path="url(#headP)"><g transform="translate(578 440) rotate(-10)">
      <path d="{face_disc(0, 48, 350, 282)}" fill="#5A5A5A" opacity="0.45" filter="url(#halo)"/>
      <path d="{face_disc(0, 44, 312, 242)}" fill="url(#face)" filter="url(#soft4)"/>
      <g transform="scale(0.96)">
{face_features(1.0)}
      </g>
    </g></g>
  </g>
</svg>
'''


if __name__ == '__main__':
    ROOT = os.getcwd()
    BRAND = os.path.join(ROOT, 'docs/assets/brand')
    out = {
        os.path.join(BRAND, 'src/app-icon-large.svg'): build_A(),
        os.path.join(BRAND, 'src/app-icon-small.svg'): build_C_small(),
        os.path.join(ROOT, 'src/renderer/src/assets/images/logo-mark.svg'): glyph_inline(),
        os.path.join(BRAND, 'logo-mark.svg'): glyph_C().replace('style="color:#111"', 'style="color:#111111"'),
        os.path.join(BRAND, 'logo-mark-dark.svg'): glyph_C_dark(),
        os.path.join(BRAND, 'sloth-peek.svg'): build_peek(),
        os.path.join(BRAND, 'sloth-peek-dark.svg'): build_peek(dark=True),
    }
    for path, text in out.items():
        open(path, 'w', encoding='utf-8').write(text)
        print('wrote', os.path.relpath(path, ROOT))

