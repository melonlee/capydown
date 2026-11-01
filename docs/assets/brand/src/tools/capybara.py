#!/usr/bin/env python3
"""Capydown 吉祥物母版：托腮思考的卡皮巴拉（暖褐毛 + 头顶的 # 思考泡泡）。

和 喵想 · FantasyAI Lab 的猫同一个吉祥物家族：viewBox 100..924（圆角方形主体）、深炭灰底板、左上主光、
`sculpt` 轮廓滤镜、带高光的内嵌眼睛。几何全部是参数化的（头 / 身体 / 手臂 / 爪子），改这里而不是改 SVG。

生成（仓库根目录）：python3 docs/assets/brand/src/tools/capybara.py
  docs/assets/brand/src/capybara.svg        完整图标（≥64px）：托腮的卡皮巴拉 + 头顶的 # 泡泡
  docs/assets/brand/src/capybara-small.svg  小尺寸版（16–32px）：只留头 + 托腮的爪，五官放大，无泡泡
  docs/assets/brand/src/capybara-flat.svg   两色平面版（无渐变、无滤镜）
  docs/assets/brand/src/capy-glyph.svg      单色侧面头像（currentColor，24 网格），应用内 16–20px 标志的来源
然后 build_icon.py → export_icons.py → build_brand.py。概念稿（多方案比较）在仓库外的 _concepts/capybara/。
"""
from __future__ import annotations

import math
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
OUT = TOOLS.parent
SQUIRCLE = (TOOLS / 'squircle.txt').read_text(encoding='utf-8').strip()

# ------------------------------------------------------------------ coats
# The tile is always the 喵想 charcoal; only the creature changes.
TILE = ('#3a3c42', '#232429', '#141519')
WHITE = dict(
    body=('#ffffff', '#f3f3f5', '#d9dadf', '#b4b6bc', '#8a8c93'),
    shade='#3e4047', shine='#ffffff', shine_op=0.9, rim='#ffffff',
    fold='#8d9097', fur_d='#9fa2a9', fur_l='#ffffff',
    pad=('#a9acb3', '#868991'), nostril='#24252a', lip='#8e9097',
    ear_in=('#b7b9c0', '#d6d8dd'), nail='#7d8088',
    flat_body='#eceef1', flat_shadow='#c6c9cf', flat_feat='#1d1f23', flat_pad='#b9bcc3',
)
WARM = dict(
    body=('#f3e3cd', '#dec2a2', '#c1a07e', '#98775b', '#6a5240'),
    shade='#3b2f26', shine='#fff5ea', shine_op=0.8, rim='#ffe9d2',
    fold='#7a5f4a', fur_d='#8f735c', fur_l='#fbf0e2',
    pad=('#7b6252', '#5b4639'), nostril='#21170f', lip='#6d5444',
    ear_in=('#8c705b', '#b39377'), nail='#5a4537',
    flat_body='#d9bf9f', flat_shadow='#b39373', flat_feat='#1d1f23', flat_pad='#7b6252',
)
COATS = {'white': WHITE, 'warm': WARM}
INK = '#2a2b30'

# ------------------------------------------------------------------ geometry (head-local coords, facing left)
# Long boxy head: flat top, tall blunt snout, recessed little chin, heavy jowl at the back.
HEAD = ('M -250 -140 C -206 -180 -110 -186 0 -186 C 110 -186 190 -172 226 -124 C 258 -82 264 0 244 60 '
        'C 226 116 176 150 100 152 C 30 154 -80 136 -150 112 C -180 102 -200 93 -222 82 '
        'C -250 69 -276 50 -284 10 C -292 -30 -288 -104 -250 -140 Z')
EAR_NEAR = (178, -166, 30, 35, 24)     # cx, cy, rx, ry, rot
EAR_FAR = (122, -178, 21, 26, 6)
EYE = (40, -106)
HEAD_TF = 'translate(500 500) rotate(6) scale(0.9)'

# v2 body: a heavy, relaxed barrel — the back line flows out of the neck behind the head, soft
# sloping shoulder on the right, broad chest under the chin; closed below the tile edge.
BODY_PTS = [(236, 1010), (252, 870), (286, 752), (338, 664), (420, 606), (560, 556), (676, 520), (762, 516),
            (842, 552), (900, 626), (936, 730), (952, 860), (958, 1010), (600, 1070)]
# v2 arms: (x, y, r) spines, splined radius profile (wrist thin -> forearm swell -> round elbow -> fat upper arm)
ARM_A_SP = [(394, 632, 34), (406, 684, 37), (428, 746, 53), (456, 802, 60), (486, 846, 60), (508, 868, 55)]
ARM_B_SP = [(716, 1010, 58), (686, 948, 54), (644, 904, 45), (606, 884, 38)]
PAW_A = (392, 626, -22, 0.96)               # x, y, rot, scale — pressed up into the jaw
PAW_B = (562, 866, -56, 0.84)               # hand cupping A's elbow from below, toes curling up-left
BUBBLE = (752, 208, 70)
TRAIL = ((634, 304, 9), (670, 268, 14))


def capsule(p, q) -> str:
    """Smooth tangent hull of two circles (x, y, r) — a tapered limb with round ends."""
    (x1, y1, r1), (x2, y2, r2) = p, q
    dx, dy = x2 - x1, y2 - y1
    d = math.hypot(dx, dy)
    a = math.atan2(dy, dx)
    t = math.acos((r1 - r2) / d)
    p1 = (x1 + r1 * math.cos(a + t), y1 + r1 * math.sin(a + t))
    p2 = (x2 + r2 * math.cos(a + t), y2 + r2 * math.sin(a + t))
    p3 = (x2 + r2 * math.cos(a - t), y2 + r2 * math.sin(a - t))
    p4 = (x1 + r1 * math.cos(a - t), y1 + r1 * math.sin(a - t))
    f = lambda pt: f'{pt[0]:.1f} {pt[1]:.1f}'
    return (f'M {f(p1)} L {f(p2)} A {r2} {r2} 0 0 0 {f(p3)} L {f(p4)} A {r1} {r1} 0 1 0 {f(p1)} Z')


def taper(p0, p1, p2, p3, w=(1.0, 6.0, 1.0), fill='#000', extra='', n=28) -> str:
    """A cubic Bézier drawn as a filled, tapered brush stroke (width profile start/mid/end)."""
    def pt(t):
        u = 1 - t
        return tuple(u**3 * a + 3 * u * u * t * b + 3 * u * t * t * c + t**3 * d for a, b, c, d in zip(p0, p1, p2, p3))
    def tan(t):
        u = 1 - t
        return tuple(3 * u * u * (b - a) + 6 * u * t * (c - b) + 3 * t * t * (d - c) for a, b, c, d in zip(p0, p1, p2, p3))
    L, R = [], []
    for i in range(n + 1):
        t = i / n
        ww = (w[0] * (1 - t) ** 2 + 2 * w[1] * t * (1 - t) + w[2] * t * t) / 2  # quadratic width profile
        x, y = pt(t); dx, dy = tan(t); m = math.hypot(dx, dy) or 1
        nx, ny = -dy / m, dx / m
        L.append((x + nx * ww, y + ny * ww)); R.append((x - nx * ww, y - ny * ww))
    pts = L + R[::-1]
    d = 'M ' + ' L '.join(f'{x:.1f} {y:.1f}' for x, y in pts) + ' Z'
    return f'<path d="{d}" fill="{fill}"{extra}/>'


def _cr(p0, p1, p2, p3, t):
    t2, t3 = t * t, t * t * t
    return tuple(0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
                 for a, b, c, d in zip(p0, p1, p2, p3))


def cr_sample(pts, n=10):
    """Dense samples along an open Catmull-Rom spline through `pts` (tuples of any dimension)."""
    P = [tuple(2 * a - b for a, b in zip(pts[0], pts[1]))] + list(pts) + [tuple(2 * a - b for a, b in zip(pts[-1], pts[-2]))]
    out = []
    for i in range(1, len(P) - 2):
        for k in range(n):
            out.append(_cr(P[i - 1], P[i], P[i + 1], P[i + 2], k / n))
    out.append(tuple(pts[-1]))
    return out


def smooth_d(pts, closed=True, tension=1.0) -> str:
    """Catmull-Rom -> cubic Bézier path through 2-D points (gives perfectly smooth organic outlines)."""
    n = len(pts)
    f = lambda p: f'{p[0]:.1f} {p[1]:.1f}'
    d = f'M {f(pts[0])}'
    rng = range(n) if closed else range(n - 1)
    for i in rng:
        p0 = pts[(i - 1) % n] if (closed or i > 0) else pts[0]
        p1, p2 = pts[i], pts[(i + 1) % n]
        p3 = pts[(i + 2) % n] if (closed or i + 2 < n) else pts[-1]
        c1 = (p1[0] + (p2[0] - p0[0]) * tension / 6, p1[1] + (p2[1] - p0[1]) * tension / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) * tension / 6, p2[1] - (p3[1] - p1[1]) * tension / 6)
        d += f' C {f(c1)} {f(c2)} {f(p2)}'
    return d + (' Z' if closed else '')


def limb(spine, n=6, cap=(1.0, 1.0)) -> str:
    """Soft organic limb: spine = [(x, y, r), ...]; the radius profile is splined too, ends are rounded caps
    (cap = squash factor of each end cap: 1 = half-circle, <1 = blunter)."""
    S = cr_sample(spine, n)
    L, R = [], []
    for i, (x, y, r) in enumerate(S):
        a, b = S[max(i - 1, 0)], S[min(i + 1, len(S) - 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]; m = math.hypot(dx, dy) or 1
        nx, ny = -dy / m, dx / m
        L.append((x + nx * r, y + ny * r)); R.append((x - nx * r, y - ny * r))

    def endcap(i, sgn, k):
        x, y, r = S[i]
        a, b = S[max(i - 1, 0)], S[min(i + 1, len(S) - 1)]
        dx, dy = (b[0] - a[0]) * sgn, (b[1] - a[1]) * sgn; m = math.hypot(dx, dy) or 1
        tx, ty, nx, ny = dx / m, dy / m, -dy / m, dx / m
        return [(x + (nx * math.cos(t) + tx * math.sin(t) * k) * r,
                 y + (ny * math.cos(t) + ty * math.sin(t) * k) * r) for t in (math.pi * j / 6 for j in range(1, 6))]
    pts = L + endcap(len(S) - 1, 1, cap[1]) + R[::-1] + endcap(0, -1, cap[0])
    area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(pts, pts[1:] + pts[:1]))
    return smooth_d(pts if area > 0 else pts[::-1])  # always clockwise on screen (same winding as PAW)


def blob(pts) -> str:
    return smooth_d(pts)


BODY = smooth_d(BODY_PTS)


def ell(e, extra=''):
    cx, cy, rx, ry, rot = e
    return f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" transform="rotate({rot} {cx} {cy})"{extra}/>'


# ------------------------------------------------------------------ defs
def defs(c: dict, extra: str = '') -> str:
    b = c['body']
    return f'''<defs>
  <path id="squircle" d="{SQUIRCLE}"/>
  <clipPath id="clip"><use href="#squircle"/></clipPath>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="{TILE[0]}"/><stop offset="0.55" stop-color="{TILE[1]}"/><stop offset="1" stop-color="{TILE[2]}"/>
  </linearGradient>
  <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity="0.22"/><stop offset="0.35" stop-color="#fff" stop-opacity="0.04"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </linearGradient>
  <radialGradient id="body" cx="0.30" cy="0.18" r="0.95">
    <stop offset="0" stop-color="{b[0]}"/><stop offset="0.38" stop-color="{b[1]}"/><stop offset="0.62" stop-color="{b[2]}"/><stop offset="0.86" stop-color="{b[3]}"/><stop offset="1" stop-color="{b[4]}"/>
  </radialGradient>
  <linearGradient id="eye" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#050506"/><stop offset="1" stop-color="#26272c"/>
  </linearGradient>
  <linearGradient id="pad" x1="0" y1="0" x2="0.4" y2="1">
    <stop offset="0" stop-color="{c['pad'][0]}"/><stop offset="1" stop-color="{c['pad'][1]}"/>
  </linearGradient>
  <linearGradient id="earIn" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="{c['ear_in'][0]}"/><stop offset="1" stop-color="{c['ear_in'][1]}" stop-opacity="0.4"/>
  </linearGradient>
  <filter id="sculpt" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="30" result="b1"/>
    <feOffset in="b1" dx="-34" dy="-26" result="o1"/>
    <feComposite in="SourceAlpha" in2="o1" operator="out" result="edge1"/>
    <feFlood flood-color="{c['shade']}" flood-opacity="0.55"/>
    <feComposite in2="edge1" operator="in" result="shade"/>
    <feGaussianBlur in="SourceAlpha" stdDeviation="6" result="b2"/>
    <feOffset in="b2" dx="10" dy="12" result="o2"/>
    <feComposite in="SourceAlpha" in2="o2" operator="out" result="edge2"/>
    <feFlood flood-color="{c['shine']}" flood-opacity="{c['shine_op']}"/>
    <feComposite in2="edge2" operator="in" result="shine"/>
    <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="shade"/><feMergeNode in="shine"/></feMerge>
  </filter>
  <filter id="sculptSoft" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="26" result="b1"/>
    <feOffset in="b1" dx="-28" dy="-20" result="o1"/>
    <feComposite in="SourceAlpha" in2="o1" operator="out" result="edge1"/>
    <feFlood flood-color="{c['shade']}" flood-opacity="0.5"/>
    <feComposite in2="edge1" operator="in" result="shade"/>
    <feGaussianBlur in="SourceAlpha" stdDeviation="10" result="b2"/>
    <feOffset in="b2" dx="10" dy="12" result="o2"/>
    <feComposite in="SourceAlpha" in2="o2" operator="out" result="edge2"/>
    <feFlood flood-color="{c['shine']}" flood-opacity="{c['shine_op'] * 0.55:.2f}"/>
    <feComposite in2="edge2" operator="in" result="shine"/>
    <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="shade"/><feMergeNode in="shine"/></feMerge>
  </filter>
  <filter id="rimR" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="5" result="b"/>
    <feOffset in="b" dx="-9" dy="5" result="o"/>
    <feComposite in="SourceAlpha" in2="o" operator="out" result="e"/>
    <feFlood flood-color="{c['rim']}" flood-opacity="0.55"/>
    <feComposite in2="e" operator="in"/>
  </filter>
  <linearGradient id="rimFade" x1="0" y1="0" x2="1" y2="0.3">
    <stop offset="0.55" stop-color="#fff" stop-opacity="0"/><stop offset="0.9" stop-color="#fff" stop-opacity="1"/>
  </linearGradient>
  <mask id="rimMask" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1100"><rect x="0" y="0" width="1024" height="1100" fill="url(#rimFade)"/></mask>
  <filter id="cast" x="-80%" y="-80%" width="260%" height="260%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="22"/><feOffset dx="10" dy="6"/>
    <feComponentTransfer><feFuncA type="linear" slope="0.7"/></feComponentTransfer>
  </filter>
  <filter id="eyeInset" x="-30%" y="-30%" width="160%" height="160%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="b"/><feOffset in="b" dx="3" dy="5" result="o"/>
    <feComposite in="SourceAlpha" in2="o" operator="out" result="e"/>
    <feFlood flood-color="#000" flood-opacity="0.9"/><feComposite in2="e" operator="in" result="s"/>
    <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="s"/></feMerge>
  </filter>
  <filter id="b3" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
  <filter id="b4" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
  <filter id="b5" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>
  <filter id="b8" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="8"/></filter>
  <filter id="b14" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>
  <filter id="b24" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="24"/></filter>
  <linearGradient id="bub" x1="0" y1="0" x2="0.3" y2="1">
    <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#dfe1e6"/>
  </linearGradient>
  <filter id="bubShadow" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="10"/><feOffset dx="6" dy="10"/>
    <feComponentTransfer><feFuncA type="linear" slope="0.55"/></feComponentTransfer>
    <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <linearGradient id="aoBottom" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.28"/>
  </linearGradient>
  <clipPath id="headClip"><path d="{HEAD}"/></clipPath>
  <radialGradient id="furU" gradientUnits="userSpaceOnUse" cx="400" cy="560" r="640">
    <stop offset="0" stop-color="{b[0]}"/><stop offset="0.38" stop-color="{b[1]}"/><stop offset="0.62" stop-color="{b[2]}"/><stop offset="0.86" stop-color="{b[3]}"/><stop offset="1" stop-color="{b[4]}"/>
  </radialGradient>
  <radialGradient id="toeHi" cx="0.4" cy="0.4" r="0.6">
    <stop offset="0" stop-color="{c['fur_l']}" stop-opacity="0.75"/><stop offset="1" stop-color="{c['fur_l']}" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="tuck" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="{c['shade']}" stop-opacity="0.42"/><stop offset="1" stop-color="{c['shade']}" stop-opacity="0"/>
  </linearGradient>
{extra}
</defs>
'''


def svg_open(c, extra=''):
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="100 100 824 824">\n'
            + defs(c, extra) + '<use href="#squircle" fill="url(#bg)"/>\n<g clip-path="url(#clip)">\n')


def svg_close():
    return '</g>\n<use href="#squircle" fill="none" stroke="url(#rim)" stroke-width="3"/>\n</svg>\n'


def lit(shapes: str, cast=True, rim=False, filt='sculpt', fill='body') -> str:
    """A sculpted soft-body part: cast shadow + radial body fill + family rim filter (+ far-edge rim light)."""
    s = f'<g fill="#000" filter="url(#cast)">{shapes}</g>' if cast else ''
    s += f'<g filter="url(#{filt})"><g fill="url(#{fill})">{shapes}</g></g>'
    if rim:
        s += f'<g mask="url(#rimMask)"><g filter="url(#rimR)">{shapes}</g></g>'
    return s


# ------------------------------------------------------------------ parts
def head(c, tf=HEAD_TF, small=False) -> str:
    s = f'<g transform="{tf}">'
    # small-size variant: the near ear is enlarged and lifted so the bump survives at 16 px; the far ear is dropped
    ear = (182, -178, 38, 42, 24) if small else EAR_NEAR
    if not small:
        s += lit(ell(EAR_FAR), cast=False)
        s += f'<g opacity="0.3">{ell(EAR_FAR, f' fill="{c["fur_d"]}"')}</g>'
    s += lit(ell(ear) + f'<path d="{HEAD}"/>', rim=True)
    # inner ear
    cx, cy, rx, ry, rot = ear
    s += f'<ellipse cx="{cx-6}" cy="{cy+2}" rx="{rx*0.5:.0f}" ry="{ry*0.62:.0f}" transform="rotate({rot} {cx} {cy})" fill="url(#earIn)"/>'
    # form: bridge glint, cheek bulge, muzzle fold
    s += '<g clip-path="url(#headClip)">'
    s += f'<path d="M -236 -128 C -190 -160 -110 -168 -20 -168" stroke="{c["fur_l"]}" stroke-width="18" stroke-linecap="round" fill="none" opacity="0.7" filter="url(#b8)"/>'
    s += f'<path d="M -70 -70 C -96 -10 -104 50 -118 124" stroke="{c["fold"]}" stroke-width="22" stroke-linecap="round" fill="none" opacity="0.22" filter="url(#b14)"/>'
    # fur hint: a few soft value strokes following the form (no texture)
    for (p0, p1, p2, p3), col, op in () if small else (
            (((60, -160), (90, -166), (120, -164), (150, -150)), c['fur_l'], 0.55),
            (((-150, -168), (-100, -176), (-60, -178), (-20, -176)), c['fur_l'], 0.45),
            (((110, -70), (130, -40), (140, -10), (138, 24)), c['fur_d'], 0.16),
            (((150, -96), (176, -60), (190, -20), (188, 20)), c['fur_d'], 0.14),
            (((20, -30), (50, 0), (70, 40), (72, 90)), c['fur_d'], 0.10),
            (((-150, 40), (-120, 70), (-80, 90), (-30, 104)), c['fur_d'], 0.12)):
        s += taper(p0, p1, p2, p3, (1, 9, 1), col, f' opacity="{op}" filter="url(#b3)"')
    s += taper((-232, 30), (-210, 52), (-190, 70), (-160, 86), (2, 12, 2), c['shade'], ' opacity="0.22" filter="url(#b4)"')
    s += '</g>'
    if not small:
        s += ''.join(f'<circle cx="{wx}" cy="{wy}" r="2.6" fill="{c["fur_d"]}" opacity="0.35"/>'
                     for wx, wy in ((-214, -36), (-196, -28), (-206, -14)))
    # eye (enlarged ~1.35x in the small-size variant so it survives 16–32 px)
    ex, ey = EYE
    if small:
        s += f'<g transform="translate({ex} {ey}) scale(1.35) translate({-ex} {-ey})">'
    eye = (f'M {ex-34} {ey-2} C {ex-20} {ey-16} {ex+16} {ey-18} {ex+34} {ey-6} C {ex+32} {ey+14} {ex+16} {ey+22} {ex} {ey+22} '
           f'C {ex-18} {ey+22} {ex-32} {ey+12} {ex-34} {ey-2} Z')
    s += taper((ex-40, ey-12), (ex-20, ey-30), (ex+20, ey-32), (ex+44, ey-14), (0.5, 7, 1.0), c['fold'], ' opacity="0.5"')
    s += f'<g filter="url(#eyeInset)"><path d="{eye}" fill="url(#eye)"/></g>'
    s += f'<ellipse cx="{ex-13}" cy="{ey-1}" rx="7" ry="5.5" fill="#fff"/><circle cx="{ex+14}" cy="{ey+10}" r="2.6" fill="#fff" opacity="0.55"/>'
    if small:
        s += '</g>'
    # nose: darker muzzle tip (clipped, soft), two slit nostrils, split upper lip
    pad = ('M -262 -160 C -226 -160 -196 -140 -192 -112 C -188 -86 -204 -64 -236 -60 '
           'C -264 -56 -296 -64 -304 -92 C -312 -124 -298 -160 -262 -160 Z')
    s += (f'<g clip-path="url(#headClip)"><path d="{pad}" fill="url(#pad)" filter="url(#b3)" opacity="{1 if small else 0.88}"/>'
          f'<path d="M -262 -136 C -246 -140 -228 -136 -218 -128" stroke="{c["fur_l"]}" stroke-width="6" stroke-linecap="round" fill="none" opacity="0.35" filter="url(#b3)"/></g>')
    k = 1.5 if small else 1.0
    s += taper((-238, -116), (-228, -112), (-220, -100), (-222, -84), (5 * k, 11 * k, 3 * k), c['nostril'])
    s += taper((-279, -119), (-273, -117), (-270, -109), (-272, -101), (3, 6.5, 2), c['nostril'], ' opacity="0.85"')
    s += taper((-258, -74), (-260, -54), (-263, -28), (-266, -8), (4.5 * k, 4 * k, 2.5 * k), c['lip'], ' opacity="0.8"')
    s += taper((-266, -8), (-258, 8), (-244, 16), (-226, 18), (2.5 * k, 4.5 * k, 0.5), c['lip'], ' opacity="0.8"')
    return s + '</g>\n'


def body(c) -> str:
    s = lit(f'<path d="{BODY}"/>', rim=True)
    # ambient occlusion where the barrel sinks into the bottom edge of the tile
    s += f'<clipPath id="bodyClip"><path d="{BODY}"/></clipPath>'
    s += '<rect x="200" y="840" width="780" height="100" fill="url(#aoBottom)" clip-path="url(#bodyClip)"/>'
    # very subtle fur value: a lit roll along the shoulder line, a faint darker sweep down the flank
    s += '<g clip-path="url(#bodyClip)">'
    s += taper((700, 548), (770, 540), (840, 572), (884, 640), (2, 18, 2), c['fur_l'], ' opacity="0.45" filter="url(#b8)"')
    s += taper((300, 760), (290, 820), (284, 880), (284, 940), (2, 14, 2), c['fur_l'], ' opacity="0.35" filter="url(#b8)"')
    s += taper((760, 680), (800, 740), (820, 820), (822, 920), (2, 26, 4), c['fur_d'], ' opacity="0.14" filter="url(#b14)"')
    s += '</g>'
    return s


# v2 paw: knuckles a touch wider than the wrist, three short toe lobes, tapering straight into the forearm
PAW = ('M -27 46 C -36 26 -48 2 -47 -24 C -46 -44 -40 -58 -28 -60 C -22 -61 -17 -58 -15 -54 '
       'C -10 -62 10 -62 15 -54 C 17 -58 22 -61 28 -60 C 40 -58 46 -44 47 -24 C 48 2 36 26 27 46 C 18 58 -18 58 -27 46 Z')


def paw_detail(c, x, y, rot, k) -> str:
    """Capybara forefoot seen from the back: three short rounded toes, blunt dark hoof-like nails. Crisp, no blur."""
    s = f'<g transform="{paw_tf(x, y, rot, k)}">'
    for tx, ty in ((-29, -46), (0, -50), (29, -46)):   # a soft sheen on top of each toe knuckle
        s += f'<ellipse cx="{tx - 3}" cy="{ty}" rx="13" ry="10" fill="url(#toeHi)"/>'
    for sx in (-1, 1):                                  # short toe clefts, fading downwards
        s += taper((15 * sx, -56), (16 * sx, -50), (16.5 * sx, -44), (16 * sx, -36), (4.5, 3.5, 0.4), c['fold'], ' opacity="0.55"')
    for nx, ny, a in ((-30, -55, -16), (0, -59, 0), (30, -55, 16)):
        s += (f'<g transform="translate({nx} {ny}) rotate({a})"><path d="M -9 1 C -9 -7 9 -7 9 1 C 6 5 -6 5 -9 1 Z" fill="{c["nail"]}"/>'
              f'<path d="M -4.5 -2.5 C -2 -4 2 -4 4 -3" stroke="#fff" stroke-opacity="0.45" stroke-width="1.8" stroke-linecap="round" fill="none"/></g>')
    return s + '</g>'


def side_line(spine, off, t0=0.0, t1=1.0, light=(-0.75, -0.66)) -> list:
    """Points running along a limb at `off` x radius toward (off>0) or away from (off<0) the key light."""
    S = cr_sample(spine, 8)
    i0, i1 = int(t0 * (len(S) - 1)), int(t1 * (len(S) - 1))
    out = []
    for i in range(i0, i1 + 1):
        x, y, r = S[i]
        a, b = S[max(i - 1, 0)], S[min(i + 1, len(S) - 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]; m = math.hypot(dx, dy) or 1
        nx, ny = -dy / m, dx / m
        if nx * light[0] + ny * light[1] < 0:
            nx, ny = -nx, -ny
        out.append((x + nx * r * off, y + ny * r * off))
    return out


def poly(pts, w, col, op, blur) -> str:
    d = 'M ' + ' L '.join(f'{x:.1f} {y:.1f}' for x, y in pts)
    return (f'<path d="{d}" stroke="{col}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round" fill="none" '
            f'opacity="{op}" filter="url(#{blur})"/>')


def xform_d(d, x, y, rot, k) -> str:
    """Bake translate/rotate/scale into an absolute M/C/L/Z path so several parts can share one bbox/gradient."""
    import re
    ca, sa = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    toks = re.findall(r'[MCLZ]|-?[\d.]+', d)
    out, nums = [], []
    for t in toks:
        if t in 'MCLZ':
            out.append(t)
        else:
            nums.append(float(t))
            if len(nums) == 2:
                u, v = nums[0] * k, nums[1] * k
                out.append(f'{x + u * ca - v * sa:.1f} {y + u * sa + v * ca:.1f}')
                nums = []
    return ' '.join(out)


def paw_tf(x, y, rot, k):
    return f'translate({x} {y}) rotate({rot}) scale({k})'


def arm(c, spine, pw, cid, clip='', rim=False, tuck=False) -> str:
    """Forearm + paw as ONE soft form (single silhouette, single sculpt pass), then modelling on top."""
    shape = f'<path d="{limb(spine)} {xform_d(PAW, *pw)}"/>'
    s = f'<clipPath id="{cid}">{shape}</clipPath>'
    g = f'<g fill="#000" opacity="0.3" filter="url(#b5)">{shape}</g>'  # tight AO where the limb sits on the body
    g += lit(shape, rim=rim, filt='sculptSoft', fill='furU')
    # modelling clipped to the limb: lit ridge toward the key light, core shadow on the far side
    g += f'<g clip-path="url(#{cid})">'
    g += poly(side_line(spine, 0.62), 14, c['fur_l'], 0.55, 'b8')
    g += poly(side_line(spine, -0.7), 22, c['fold'], 0.22, 'b14')
    if tuck:  # the toes sit in the shadow under the jaw
        g += f'<g transform="{paw_tf(*pw)}"><rect x="-60" y="-66" width="120" height="44" fill="url(#tuck)"/></g>'
    g += '</g>'
    s += f'<g clip-path="url(#{clip})">{g}</g>' if clip else g
    return s + paw_detail(c, *pw)


def to_head(x, y):
    """Group coords -> head-local coords (inverse of HEAD_TF)."""
    u, v = (x - 500) / 0.9, (y - 500) / 0.9
    ca, sa = math.cos(math.radians(-6)), math.sin(math.radians(-6))
    return u * ca - v * sa, u * sa + v * ca


def paw_pt(pw, u, v):
    x, y, rot, k = pw
    ca, sa = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    return x + (u * ca - v * sa) * k, y + (u * sa + v * ca) * k


def chin_contact(c) -> str:
    """Where the toes press into the jaw: tight occlusion under the toes + the jaw fur squished up a little."""
    t = paw_tf(*PAW_A)
    s = (f'<g transform="{t}"><path d="{PAW}" fill="#000" opacity="0.42" filter="url(#b8)" transform="translate(2 -12)"/>'
         f'<path d="{PAW}" fill="{c["shade"]}" opacity="0.5" filter="url(#b4)" transform="translate(0 -6) scale(0.94)"/></g>')
    # squish: the jaw fur pushed up into a soft lit roll just above the toes (strong on the lit side, fading right)
    q = [to_head(*paw_pt(PAW_A, u, v)) for u, v in ((-54, -54), (-30, -76), (16, -80), (50, -60))]
    s += (f'<g transform="{HEAD_TF}"><g clip-path="url(#headClip)">'
          + taper(*q, w=(3, 13, 1), fill=c['fur_l'], extra=' opacity="0.55" filter="url(#b3)"') + '</g></g>')
    return s


def arms(c) -> str:
    s = chin_contact(c)
    s += arm(c, ARM_A_SP, PAW_A, 'armA', tuck=True)
    # B's toes press into A's forearm: tight contact shadow on A first
    s += (f'<g clip-path="url(#armA)"><g transform="{paw_tf(*PAW_B)}"><path d="{PAW}" fill="#000" opacity="0.38" '
          f'filter="url(#b5)" transform="translate(-2 -9)"/></g></g>')
    s += arm(c, ARM_B_SP, PAW_B, 'armB', clip='bodyClip')
    return s


def rest_paw(c) -> str:
    return ''


def hash_glyph(x, y, k=1.0, color=INK, w=9) -> str:
    h, o, sl = 26 * k, 11 * k, 6 * k
    d = (f'M {x-o+sl:.1f} {y-h:.1f} L {x-o-sl:.1f} {y+h:.1f} M {x+o+sl:.1f} {y-h:.1f} L {x+o-sl:.1f} {y+h:.1f} '
         f'M {x-24*k:.1f} {y-9*k:.1f} L {x+26*k:.1f} {y-9*k:.1f} M {x-26*k:.1f} {y+9*k:.1f} L {x+24*k:.1f} {y+9*k:.1f}')
    return f'<path d="{d}" stroke="{color}" stroke-width="{w*k:.1f}" stroke-linecap="round" fill="none"/>'


def bubble(kind) -> str:
    if kind == 'plain':
        return ''
    x, y, r = BUBBLE
    s = ''
    for cx, cy, rr in ((x, y, r),) + TRAIL:
        s += f'<circle cx="{cx}" cy="{cy}" r="{rr}" fill="url(#bub)" fill-opacity="0.93" filter="url(#bubShadow)"/>'
    s += (f'<path d="M {x - r*0.72:.1f} {y - r*0.18:.1f} A {r*0.76:.1f} {r*0.76:.1f} 0 0 1 {x - r*0.2:.1f} {y - r*0.72:.1f}" '
          f'stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none" opacity="0.9"/>')
    if kind == 'hash':
        s += hash_glyph(x, y)
    else:
        s += ''.join(f'<circle cx="{x+dx}" cy="{y}" r="8" fill="{INK}"/>' for dx in (-26, 0, 26))
    return s


PLACE = {'hash': 'translate(-12 0)', 'dots': 'translate(-12 0)', 'plain': 'translate(-8 -34) scale(1.05)'}


def icon(kind='hash', coat='white') -> str:
    c = COATS[coat]
    s = svg_open(c)
    s += f'<g transform="{PLACE[kind]}">' + body(c) + head(c) + arms(c) + bubble(kind) + '</g>'
    return s + svg_close()


ICONS = {f'capy-think-{k}-{coat}': (lambda k=k, coat=coat: icon(k, coat))
         for k in ('hash', 'dots', 'plain') for coat in ('white', 'warm')}


# ------------------------------------------------------------------ small-size variant (16–32 px)
SMALL_HEAD_TF = 'translate(540 478) rotate(6) scale(1.22)'
SMALL_BODY_PTS = [(300, 1010), (330, 860), (420, 720), (560, 640), (700, 600), (820, 630), (900, 720), (950, 860),
                  (960, 1010), (620, 1070)]


def small(coat='white') -> str:
    """16–32 px: head + raised paw only. Bigger head, enlarged eye / nostril / ear, no fur, no bubble, no second arm;
    the body is pushed back a value step so the light head silhouette (box + snout + ear) separates cleanly."""
    c = COATS[coat]
    s = svg_open(c)
    sb = smooth_d(SMALL_BODY_PTS)
    s += lit(f'<path d="{sb}"/>', rim=True)
    s += f'<path d="{sb}" fill="{c["shade"]}" opacity="0.55"/>'
    s += head(c, SMALL_HEAD_TF, small=True)
    # map the main-icon paw/arm (relative to the head) into the small layout
    k = 1.22 / 0.9
    m = lambda x, y: (540 + (x - 500) * k, 478 + (y - 500) * k)
    pw = (*m(PAW_A[0], PAW_A[1]), PAW_A[2], PAW_A[3] * k)
    spine = [(*m(x, y), r * k) for x, y, r in ARM_A_SP[:4]] + [(*m(500, 930), 60 * k)]
    shape = f'<path d="{limb(spine)} {xform_d(PAW, *pw)}"/>'
    s += f'<g transform="{paw_tf(*pw)}"><path d="{PAW}" fill="#000" opacity="0.45" filter="url(#b8)" transform="translate(2 -12)"/></g>'
    s += lit(shape, filt='sculptSoft', fill='furU')
    s += paw_detail(c, *pw)
    return s + svg_close()


# ------------------------------------------------------------------ flat 2-tone
FLAT_BG = '#26292f'


def flat(kind='hash', coat='white') -> str:
    c = COATS[coat]
    L, D = c['flat_body'], FLAT_BG
    gap = f'fill="{L}" stroke="{D}" stroke-width="16" paint-order="stroke" stroke-linejoin="round"'
    s = ('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="100 100 824 824">\n'
         f'<defs><path id="tile" d="{SQUIRCLE}"/><clipPath id="clip"><use href="#tile"/></clipPath>'
         f'<clipPath id="bodyClipF"><path d="{BODY}"/></clipPath></defs>\n'
         f'<use href="#tile" fill="{D}"/>\n<g clip-path="url(#clip)">\n<g transform="{PLACE[kind]}">')
    s += f'<path d="{BODY}" fill="{L}"/>'
    # head
    s += f'<g transform="{HEAD_TF}">'
    s += ell(EAR_FAR, f' {gap}') + ell(EAR_NEAR, f' {gap}') + f'<path d="{HEAD}" {gap}/>'
    ex, ey = EYE
    s += (f'<path d="M {ex-34} {ey-2} C {ex-20} {ey-16} {ex+16} {ey-18} {ex+34} {ey-6} C {ex+32} {ey+14} {ex+16} {ey+22} {ex} {ey+22} '
          f'C {ex-18} {ey+22} {ex-32} {ey+12} {ex-34} {ey-2} Z" fill="{D}"/><ellipse cx="{ex-13}" cy="{ey-1}" rx="7" ry="5.5" fill="{L}"/>')
    s += taper((-238, -116), (-228, -112), (-220, -100), (-222, -84), (6, 13, 4), D)
    s += taper((-258, -74), (-260, -54), (-263, -28), (-266, -8), (6, 6, 4), D)
    s += taper((-266, -8), (-258, 8), (-244, 16), (-226, 18), (4, 6, 1), D)
    s += '</g>'
    # arms + paws — same soft forms as the shaded icon; one path per arm so the gap only rings the outside
    for sp, pw in ((ARM_A_SP, PAW_A), (ARM_B_SP, PAW_B)):
        s += f'<path d="{limb(sp)} {xform_d(PAW, *pw)}" {gap.replace("16", "12")}/>'
        s += f'<g transform="{paw_tf(*pw)}">'
        for sx in (-1, 1):
            s += taper((15 * sx, -58), (16 * sx, -50), (16.5 * sx, -44), (16 * sx, -34), (6, 5, 1), D)
        s += '</g>'
    # bubble
    if kind != 'plain':
        x, y, r = BUBBLE
        s += ''.join(f'<circle cx="{cx}" cy="{cy}" r="{rr}" fill="{L}"/>' for cx, cy, rr in ((x, y, r),) + TRAIL)
        s += hash_glyph(x, y, color=D, w=10) if kind == 'hash' else ''.join(
            f'<circle cx="{x+dx}" cy="{y}" r="8.5" fill="{D}"/>' for dx in (-26, 0, 26))
    return s + '</g>\n</g>\n</svg>\n'


# ------------------------------------------------------------------ single-colour glyph (currentColor, 16–24 px)
def _ellp(cx, cy, rx, ry, rot=0.0) -> str:
    a = math.radians(rot)
    x1, y1, x2, y2 = cx - rx * math.cos(a), cy - rx * math.sin(a), cx + rx * math.cos(a), cy + rx * math.sin(a)
    return (f'M {x1:.2f} {y1:.2f} A {rx} {ry} {rot} 1 0 {x2:.2f} {y2:.2f} '
            f'A {rx} {ry} {rot} 1 0 {x1:.2f} {y1:.2f} Z')


# v2 glyph: capybara profile bust (facing left) drawn directly on the 24-unit grid, one even-odd path.
# Long flat top, small ear set far back, tall blunt snout with a nostril cut and a lip notch, deep jaw,
# sleepy half-lidded eye cut-out, rounded back flowing into the shoulder (not a vertical horse neck).
GLYPH_BODY = ('M 4.4 5.4 C 8 4.9 12 4.7 15.7 4.6 '
              'C 15.9 3.5 16.8 2.8 17.9 2.8 C 19.0 2.8 19.8 3.6 19.8 4.8 '
              'C 21.6 6.0 22.5 8.6 22.6 11.6 C 22.7 14.6 22.6 18.2 22.5 21 L 11.4 21 '
              'C 11.4 19.4 11.6 17.8 11.9 16.5 C 9.6 16.2 7.4 15.4 5.8 14.4 '
              'C 5.3 14.1 4.9 13.8 4.6 13.4 C 4.3 13.8 3.8 13.9 3.3 13.8 '
              'C 2.1 13.6 1.5 12.6 1.5 11.0 L 1.5 8.2 C 1.5 6.6 2.5 5.6 4.4 5.4 Z')
GLYPH_EYE = 'M 11.0 7.7 L 14.6 7.7 C 14.6 9.1 13.8 9.9 12.8 9.9 C 11.8 9.9 11.0 9.1 11.0 7.7 Z'


def glyph() -> str:
    d = f'{GLYPH_BODY} {GLYPH_EYE} {_ellp(3.5, 7.8, 0.8, 1.4, 20)}'
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">\n'
            f'  <path fill-rule="evenodd" d="{d}"/>\n</svg>\n')


SMALLS = {f'capy-think-small-{coat}': (lambda coat=coat: small(coat)) for coat in COATS}
FLATS = {f'capy-think-{k}-{coat}-flat': (lambda k=k, coat=coat: flat(k, coat))
         for k in ('hash', 'dots', 'plain') for coat in COATS}

MASTERS = {
    'capybara.svg': lambda: icon('hash', 'warm'),
    'capybara-small.svg': lambda: small('warm'),
    'capybara-flat.svg': lambda: flat('hash', 'warm'),
    'capy-glyph.svg': glyph,
}

if __name__ == '__main__':
    for name, fn in MASTERS.items():
        (OUT / name).write_text(fn(), encoding='utf-8')
        print('wrote', (OUT / name).relative_to(OUT.parents[3]))
