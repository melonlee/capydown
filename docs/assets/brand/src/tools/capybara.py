#!/usr/bin/env python3
"""Capydown 吉祥物母版：从底边探出头的正面卡皮巴拉，头顶趴着一只小卡皮巴拉（和 喵想 · FantasyAI Lab 的猫同一个吉祥物家族）。

构图和 喵想 的猫完全一致：viewBox 100..924（圆角方形主体）、深炭灰底板、左上主光、`sculpt` 轮廓滤镜、
`cast` 投影、带白色高光的内嵌眼睛、两只搭在底边上的爪子（趾缝线）。卡皮巴拉本身（0.4.1 起，概念稿 E3-B1）：
圆一些的大头（腮部微微鼓出、头顶几乎是平的）、头顶两角的小圆耳、占据下半张脸的宽大口鼻（柔和的深色鼻垫 +
两道斜鼻孔 + 人字唇线）、大圆亮眼且上眼皮外角微垂（呆萌、有点困）、暖褐毛色；头顶趴着一只小卡皮巴拉
（下巴搁在大头的头顶、两只小爪搭在额头上，是大头的缩小版），大头为它整体缩小 0.88（以底边为锚点）。
几何全部是参数化的，改这里而不是改 SVG。

生成（仓库根目录）：python3 docs/assets/brand/src/tools/capybara.py
  docs/assets/brand/src/capybara.svg        完整图标（≥64px）：大头 + 头顶趴着的小卡皮巴拉 + 爪子
  docs/assets/brand/src/capybara-small.svg  小尺寸版（16–32px）：只留大头，五官放大，不带小卡皮巴拉和爪子
  docs/assets/brand/src/capybara-flat.svg   两色平面版（无渐变、无滤镜，带小卡皮巴拉）
  docs/assets/brand/src/capy-glyph.svg      单色正面头像（currentColor，24 网格），应用内 16–20px 标志
然后 build_icon.py → export_icons.py → build_brand.py。
概念稿：python3 capybara.py --concepts <dir> 写出对比用的变体（白色毛色、小尺寸带不带小卡皮巴拉、
字形带不带头顶的小卡皮巴拉）；比较图在仓库外的 _concepts/capybara-v3/。
"""
from __future__ import annotations

import math
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
OUT = TOOLS.parent
SQUIRCLE = (TOOLS / 'squircle.txt').read_text(encoding='utf-8').strip()

# ------------------------------------------------------------------ palettes
TILE = ('#3a3c42', '#232429', '#141519')   # 喵想 charcoal tile, never changes
FLAT_BG = '#26292f'
WARM = dict(  # warm taupe / cream-brown capybara
    body=('#f2dcbf', '#d8b48b', '#b88f67', '#8c6849', '#5e4533'),
    muzzle=('#e3c29c', '#c09670', '#8d6a4b'),
    shade='#3b2f26', shine='#fff4e6', shine_op=0.85,
    ear_in=('#7d604b', '#a8876a'), pad=('#7f604a', '#5f4636'), nostril='#1a120c', lip='#6d5240', lid='#5e4533',
    toe='#8a6c53', nail='#4a382c',
    flat_body='#d8bc99', flat_muzzle='#c4a37e', flat_feat='#17181c', flat_pad='#4a382c', flat_paw='#e3caa9',
    flat_toe='#9c7c5e', flat_ear='#9c7c5e', flat_edge='#8a6a4e',
)
WHITE = dict(  # the 喵想 cat's own white, for comparison
    body=('#ffffff', '#f3f3f5', '#d9dadf', '#b4b6bc', '#8a8c93'),
    muzzle=('#ffffff', '#e9eaee', '#c3c5cb'),
    shade='#3e4047', shine='#ffffff', shine_op=0.9,
    ear_in=('#a9abb2', '#c9cad0'), pad=('#55575e', '#2f3035'), nostril='#111214', lip='#8d9097', lid='#8a8c93',
    toe='#9c9ea5', nail='#6b6d74',
    flat_body='#f1f2f4', flat_muzzle='#dcdee2', flat_feat='#17181c', flat_pad='#3a3c42', flat_paw='#f1f2f4',
    flat_toe='#a9abb2', flat_ear='#b4b6bc', flat_edge='#9a9ca3',
)
COATS = {'warm': WARM, 'white': WHITE}

# ------------------------------------------------------------------ big head (喵想 frame: 100..924, tilt about 512,760)
TILT = -5
# Big round head: generous corner radii, cheeks domed outward a little (widest at snout height), crown nearly flat
# (6 units of dome); flows into stocky shoulders and is closed below the tile.
HEAD = ('M 104 1110 C 104 936 150 846 238 806 '
        'C 212 724 206 622 212 528 '
        'C 220 394 268 282 396 262 '
        'C 452 254 572 254 628 262 '
        'C 756 282 804 394 812 528 '
        'C 818 622 812 724 786 806 '
        'C 874 846 920 936 920 1110 Z')
EARS = ((286, 300, 37, 28, -42), (738, 300, 37, 28, 42))       # cx, cy, rx, ry, rot — on the top corners
EAR_IN = ((280, 294, 20, 12, -42), (744, 294, 20, 12, 42))
# Big round glossy eyes; the upper lid droops a touch toward the outer corner (呆萌, a little sleepy).
EYES = ((350, 428), (674, 428))
EYE_W, EYE_H = 96, 100
# Deep, blunt snout: the whole lower face, a rounded block nearly as wide as the head.
MUZZLE = ('M 512 494 C 620 494 690 526 704 608 C 718 694 698 772 642 814 '
          'C 600 844 424 844 382 814 C 326 772 306 694 320 608 C 334 526 404 494 512 494 Z')
# Broad, flat rhinarium (not a round bear button): a wide soft band with two slanted nostril slits at its ends.
NOSE = ('M 418 560 C 420 538 460 532 512 532 C 564 532 604 538 606 560 '
        'C 608 584 572 604 540 608 C 528 610 520 616 512 616 C 504 616 496 610 484 608 '
        'C 452 604 416 584 418 560 Z')
NOSTRILS = ((468, 570, 27, 11, 36), (556, 570, 27, 11, -36))
LIP = 'M 512 616 L 512 684 M 466 698 Q 494 712 512 684 Q 530 712 558 698'
PAWS = ((292, 934), (738, 934))
PAW_R = (100, 92)
TOES = (264, 318, 712, 766)
NAILS = (238, 291, 344, 686, 739, 792)   # toe centres; each gets a short dark nail cap on the paw's top edge
BIG_SCALE = 0.88                          # the big head shrinks (anchored at the bottom edge) to make room for the pup
BIG_TF = f'translate(512 1000) scale({BIG_SCALE}) translate(-512 -1000)'

# ------------------------------------------------------------------ the pup (design frame = big-head units)
# Drawn at full size around x=512 and then scaled down onto the crown, so the same filters/gradients give the same
# light. Mini-me: the big head's own silhouette closed into a rounded chin, the same deep broad snout, nose band,
# slanted nostrils and corner ears -> reads as a capybara pup, not a teddy bear. It lies like a loaf: chin on the
# crown, two tiny paws over the forehead, back and haunches bulging out behind its head.
PUP_HEAD = ('M 212 528 C 220 394 268 282 396 262 C 452 254 572 254 628 262 C 756 282 804 394 812 528 '
            'C 820 660 800 770 718 818 C 650 858 374 858 306 818 C 224 770 204 660 212 528 Z')
PUP_BACK = ('M 96 1000 L 96 846 C 96 700 170 560 330 520 C 420 498 604 498 694 520 '
            'C 854 560 928 700 928 846 L 928 1000 Z')
PUP_EARS = ((288, 300, 44, 33, -42), (736, 300, 44, 33, 42))
PUP_EAR_IN = ((282, 294, 24, 14, -42), (742, 294, 24, 14, 42))
PUP_EYES = ((352, 428), (672, 428))
PUP_EYE = (80, 84)
PUP_MUZZLE = ('M 512 500 C 618 500 686 530 700 610 C 714 694 694 772 638 812 '
              'C 598 842 426 842 386 812 C 330 772 310 694 324 610 C 338 530 406 500 512 500 Z')
PUP_NOSTRILS = ((468, 572, 32, 14, 36), (556, 572, 32, 14, -36))
PUP_LIP = 'M 512 616 L 512 680 M 468 694 Q 494 708 512 680 Q 530 708 556 694'
PUP_PAWS, PUP_PAW_R = ((330, 866), (694, 866)), (70, 62)
PUP_CHIN = 846
PUP_AT, PUP_SCALE, PUP_TILT = (512, 306), 0.36, 3   # chin lands on the crown, tilted a touch against the big head
PUP_TF = f'translate({PUP_AT[0]} {PUP_AT[1]}) rotate({PUP_TILT}) scale({PUP_SCALE}) translate(-512 -{PUP_CHIN})'


def ell(e, extra=''):
    cx, cy, rx, ry, rot = e
    return f'<ellipse cx="{cx:g}" cy="{cy:g}" rx="{rx:g}" ry="{ry:g}" transform="rotate({rot} {cx:g} {cy:g})"{extra}/>'


# ------------------------------------------------------------------ defs (喵想 filters, coat-tinted)
def defs(c: dict) -> str:
    b, m = c['body'], c['muzzle']
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
  <radialGradient id="muzzle" cx="0.34" cy="0.22" r="0.9">
    <stop offset="0" stop-color="{m[0]}"/><stop offset="0.55" stop-color="{m[1]}"/><stop offset="1" stop-color="{m[2]}"/>
  </radialGradient>
  <linearGradient id="eye" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#050506"/><stop offset="1" stop-color="#26272c"/>
  </linearGradient>
  <linearGradient id="pad" x1="0" y1="0" x2="0.3" y2="1">
    <stop offset="0" stop-color="{c['pad'][0]}"/><stop offset="1" stop-color="{c['pad'][1]}"/>
  </linearGradient>
  <radialGradient id="earIn" cx="0.5" cy="0.4" r="0.6">
    <stop offset="0" stop-color="{c['ear_in'][0]}"/><stop offset="1" stop-color="{c['ear_in'][1]}" stop-opacity="0.2"/>
  </radialGradient>
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
    <feGaussianBlur in="SourceAlpha" stdDeviation="20" result="b1"/>
    <feOffset in="b1" dx="-20" dy="-16" result="o1"/>
    <feComposite in="SourceAlpha" in2="o1" operator="out" result="edge1"/>
    <feFlood flood-color="{c['shade']}" flood-opacity="0.4"/>
    <feComposite in2="edge1" operator="in" result="shade"/>
    <feGaussianBlur in="SourceAlpha" stdDeviation="5" result="b2"/>
    <feOffset in="b2" dx="7" dy="9" result="o2"/>
    <feComposite in="SourceAlpha" in2="o2" operator="out" result="edge2"/>
    <feFlood flood-color="{c['shine']}" flood-opacity="{c['shine_op'] * 0.7:.2f}"/>
    <feComposite in2="edge2" operator="in" result="shine"/>
    <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="shade"/><feMergeNode in="shine"/></feMerge>
  </filter>
  <filter id="cast" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="22"/><feOffset dx="10" dy="6"/>
    <feComponentTransfer><feFuncA type="linear" slope="0.7"/></feComponentTransfer>
  </filter>
  <filter id="muzzleDrop" x="-20%" y="-20%" width="140%" height="150%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="12"/><feOffset dx="4" dy="12"/>
    <feComponentTransfer><feFuncA type="linear" slope="0.2"/></feComponentTransfer>
  </filter>
  <linearGradient id="muzzleFade" gradientUnits="userSpaceOnUse" x1="0" y1="500" x2="0" y2="640">
    <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff"/>
  </linearGradient>
  <mask id="muzzleMask" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1100"><rect width="1024" height="1100" fill="url(#muzzleFade)"/></mask>
  <filter id="softShadow" x="-50%" y="-200%" width="200%" height="500%"><feGaussianBlur stdDeviation="8"/></filter>
  <filter id="padBlur" x="-30%" y="-50%" width="160%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
  <filter id="eyeInset" x="-30%" y="-30%" width="160%" height="160%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="5" result="b"/><feOffset in="b" dx="4" dy="7" result="o"/>
    <feComposite in="SourceAlpha" in2="o" operator="out" result="e"/>
    <feFlood flood-color="#000" flood-opacity="0.9"/><feComposite in2="e" operator="in" result="s"/>
    <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="s"/></feMerge>
  </filter>
</defs>
'''


def svg_open(c):
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="100 100 824 824">\n'
            + defs(c) + '<use href="#squircle" fill="url(#bg)"/>\n<g clip-path="url(#clip)">\n')


def svg_close():
    return '</g>\n<use href="#squircle" fill="none" stroke="url(#rim)" stroke-width="3"/>\n</svg>\n'


def lit(shapes: str, cast=True, filt='sculpt', fill='body') -> str:
    s = f'<g fill="#000" filter="url(#cast)">{shapes}</g>' if cast else ''
    return s + f'<g filter="url(#{filt})"><g fill="url(#{fill})">{shapes}</g></g>'


# ------------------------------------------------------------------ eyes: big, round, glossy, sleepy upper lid
def _lid(x, y, w, h, outer, cover=0.19, sag=-6, pad=14):
    """Upper lid as a quadratic across the eye; outer corner lower. The droop is 14 units of visual droop at the
    outer corner, compensating the head's -5 deg tilt (so the left eye droops 4 and the right one 24)."""
    droop = 14 + outer * 10
    r = w / 2
    y0 = y - h / 2 + h * cover
    xo, xi = x + outer * (r + pad), x - outer * (r + pad)
    return xi, y0 - droop * 0.3, x, y0 + sag, xo, y0 + droop


def _lid_clip(x, y, w, h, outer):
    xi, yi, cx, cy, xo, yo = _lid(x, y, w, h, outer)
    return (f'M {xi:.1f} {yi:.1f} Q {cx:.1f} {cy:.1f} {xo:.1f} {yo:.1f} '
            f'L {xo:.1f} {y + h:.1f} L {xi:.1f} {y + h:.1f} Z')


def _lid_line(x, y, w, h, outer):
    """the lid curve limited to the eye's own width: sample the quadratic, keep points inside the eye ellipse."""
    xi, yi, cx, cy, xo, yo = _lid(x, y, w, h, outer)
    r = w / 2
    pts = []
    for j in range(41):
        t = j / 40
        px = (1 - t) ** 2 * xi + 2 * (1 - t) * t * cx + t * t * xo
        py = (1 - t) ** 2 * yi + 2 * (1 - t) * t * cy + t * t * yo
        if ((px - x) / (r + 3)) ** 2 + ((py - y) / (h / 2 + 3)) ** 2 <= 1:
            pts.append((px, py))
    return 'M ' + ' L '.join(f'{a:.1f} {b:.1f}' for a, b in pts) if len(pts) > 1 else ''


def eyes(c, k=1.0, pos=EYES, uid='', flat=False) -> str:
    """k scales the eyes (small icons); pos overrides positions. flat: solid colours, no filters."""
    w, h = EYE_W * k, EYE_H * k
    r = w / 2
    out = ''
    for i, (x, y) in enumerate(pos):
        outer = -1 if i == 0 else 1
        cid = f'lid{uid}{i}'
        fill = c['flat_feat'] if flat else 'url(#eye)'
        body = f'<rect x="{x - r:.1f}" y="{y - h / 2:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{r:.1f}" fill="{fill}"/>'
        out += f'<clipPath id="{cid}"><path d="{_lid_clip(x, y, w, h, outer)}"/></clipPath>'
        body = f'<g clip-path="url(#{cid})">{body}</g>'
        out += body if flat else f'<g filter="url(#eyeInset)">{body}</g>'
        line = _lid_line(x, y, w, h, outer)
        if line:
            out += (f'<path d="{line}" fill="none" stroke="{c["flat_pad"] if flat else c["lid"]}" stroke-width="{4 * k:.1f}" '
                    f'stroke-linecap="round" stroke-linejoin="round" opacity="{0.6 if flat else 0.35}"/>')
        hx, hy = x + r * 0.30, y - h / 2 + h * 0.24 + 16 * k
        out += f'<ellipse cx="{hx:.1f}" cy="{hy:.1f}" rx="{12 * k:.1f}" ry="{11 * k:.1f}" fill="#fff" opacity="{1 if flat else 0.92}"/>'
        out += f'<circle cx="{x - r * 0.36:.1f}" cy="{y + h * 0.24:.1f}" r="{5 * k:.1f}" fill="#fff" opacity="0.5"/>'
    return out


# ------------------------------------------------------------------ big head
def muzzle(c) -> str:
    s = f'<g mask="url(#muzzleMask)"><path d="{MUZZLE}" fill="#000" filter="url(#muzzleDrop)"/>'
    s += f'<g filter="url(#sculptSoft)"><path d="{MUZZLE}" fill="url(#muzzle)"/></g></g>'
    s += f'<path d="{NOSE}" fill="url(#pad)" opacity="0.62" filter="url(#padBlur)"/>'
    s += ''.join(ell(n, f' fill="{c["nostril"]}"') for n in NOSTRILS)
    s += '<path d="M 452 543 Q 512 535 572 543" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none" opacity="0.16"/>'
    s += f'<path d="{LIP}" stroke="{c["lip"]}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'
    return s


def big_head(c) -> str:
    ears = ''.join(ell(e) for e in EARS)
    s = f'<g fill="#000" filter="url(#cast)">{ears}<path d="{HEAD}"/></g>\n'
    s += f'<g filter="url(#sculpt)"><g fill="url(#body)">{ears}</g></g>'
    s += ''.join(ell(e, ' fill="url(#earIn)"') for e in EAR_IN)
    s += f'<g filter="url(#sculpt)"><path d="{HEAD}" fill="url(#body)"/></g>\n'
    return s + muzzle(c) + '\n' + eyes(c) + '\n'


def paws(c) -> str:
    rx, ry = PAW_R
    shapes = ''.join(f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}"/>' for x, y in PAWS)
    s = lit(shapes)
    s += (f'<g stroke="{c["toe"]}" stroke-width="9" stroke-linecap="round" fill="none" opacity="0.8">'
          + ''.join(f'<path d="M {x} 862 L {x} 888"/>' for x in TOES) + '</g>')
    s += nails(c['nail'])
    return s


def paw_top(x):
    """y of the paw ellipse's upper edge at x."""
    px = min(PAWS, key=lambda p: abs(p[0] - x))[0]
    rx, ry = PAW_R
    return PAWS[0][1] - ry * (1 - ((x - px) / rx) ** 2) ** 0.5


def nails(col, w=10, op=0.55) -> str:
    out = []
    for x in NAILS:
        y0, y1 = paw_top(x - 7), paw_top(x + 7)
        out.append(f'<path d="M {x - 7} {y0 + 10:.1f} L {x + 7} {y1 + 10:.1f}"/>')
    return f'<g stroke="{col}" stroke-width="{w}" stroke-linecap="round" opacity="{op}">' + ''.join(out) + '</g>'


# ------------------------------------------------------------------ the pup
def pup_eyes(k=1.0, flat_col=None) -> str:
    w, h = PUP_EYE[0] * k, PUP_EYE[1] * k
    r = w / 2
    s = ''.join(f'<rect x="{x - r:.1f}" y="{y - h / 2:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{r:.1f}" '
                f'fill="{flat_col or "url(#eye)"}"/>' for x, y in PUP_EYES)
    if not flat_col:
        s = f'<g filter="url(#eyeInset)">{s}</g>'
    return s + ''.join(f'<ellipse cx="{x + r * 0.30:.1f}" cy="{y - h * 0.22:.1f}" rx="{14 * k:.1f}" ry="{15 * k:.1f}" '
                       f'fill="#fff" opacity="0.92"/>' for x, y in PUP_EYES)


def pup_paws(c) -> str:
    """little paws dangling over the big head's forehead; toe lines and nails at their lower ends."""
    rx, ry = PUP_PAW_R
    s = lit(''.join(f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}"/>' for x, y in PUP_PAWS))
    toes = nl = ''
    for x, y in PUP_PAWS:
        yb = y + ry
        for dx in (-rx * 0.34, rx * 0.34):
            toes += f'<path d="M {x + dx:.1f} {yb - 34:.1f} L {x + dx:.1f} {yb - 10:.1f}"/>'
        for dx in (-rx * 0.62, 0, rx * 0.62):
            ey = y + ry * math.sqrt(max(0, 1 - (dx / rx) ** 2))
            nl += f'<path d="M {x + dx - 8:.1f} {ey - 8:.1f} L {x + dx + 8:.1f} {ey - 8:.1f}"/>'
    s += f'<g stroke="{c["toe"]}" stroke-width="12" stroke-linecap="round" fill="none" opacity="0.8">{toes}</g>'
    s += f'<g stroke="{c["nail"]}" stroke-width="12" stroke-linecap="round" opacity="0.5">{nl}</g>'
    return s


def pup_head(c, small=False) -> str:
    ears = ''.join(ell(e) for e in PUP_EARS)
    s = f'<g fill="#000" filter="url(#cast)">{ears}<path d="{PUP_HEAD}"/></g>'
    s += f'<g filter="url(#sculpt)"><g fill="url(#body)">{ears}</g></g>'
    s += ''.join(ell(e, f' fill="{c["ear_in"][0]}"' if small else ' fill="url(#earIn)"') for e in PUP_EAR_IN)
    s += f'<g filter="url(#sculpt)"><path d="{PUP_HEAD}" fill="url(#body)"/></g>'
    if small:   # concept only: simplified face for 16–32 px
        s += f'<g filter="url(#sculptSoft)"><path d="{PUP_MUZZLE}" fill="url(#muzzle)"/></g>'
        s += ''.join(ell((x, y + 4, 34, 16, rot), f' fill="{c["nostril"]}"') for x, y, _, _, rot in PUP_NOSTRILS)
        return s + pup_eyes(k=1.25)
    s += f'<g mask="url(#muzzleMask)"><path d="{PUP_MUZZLE}" fill="#000" filter="url(#muzzleDrop)"/>'
    s += f'<g filter="url(#sculptSoft)"><path d="{PUP_MUZZLE}" fill="url(#muzzle)"/></g></g>'
    s += f'<path d="{NOSE}" fill="url(#pad)" opacity="0.62" filter="url(#padBlur)"/>'
    s += ''.join(ell(n, f' fill="{c["nostril"]}"') for n in PUP_NOSTRILS)
    s += f'<path d="{PUP_LIP}" stroke="{c["lip"]}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'
    return s + pup_eyes()


def pup(c, layer='front', small=False) -> str:
    """layer='back': the loaf body behind the big head; 'front': head + paws, chin resting on the crown."""
    if layer == 'back':
        back = f'<path d="{PUP_BACK}"/>'
        return f'<g transform="{PUP_TF}">{lit(back)}</g>'
    g = pup_head(c, small) + ('' if small else pup_paws(c))
    return f'<g transform="{PUP_TF}">{g}</g>'


CONTACT = '<ellipse cx="512" cy="300" rx="150" ry="20" fill="#000" opacity="0.30" filter="url(#softShadow)"/>'


# ------------------------------------------------------------------ full icon
def icon(coat='warm', with_pup=True) -> str:
    c = COATS[coat]
    s = svg_open(c)
    s += f'<g transform="{BIG_TF + " " if with_pup else ""}rotate({TILT} 512 760)">\n'
    if with_pup:
        s += pup(c, 'back') + '\n'
    s += big_head(c)
    if with_pup:
        s += CONTACT + pup(c) + '\n'
    s += '</g>\n'
    return s + paws(c) + svg_close()


# ------------------------------------------------------------------ small (16–32 px)
def small(coat='warm', with_pup=False) -> str:
    """16–32 px: the big head only, a touch larger; ears and their insides enlarged, the snout one clear value step
    darker, nostrils and lip bolder; no paws or soft pad. The pup turns to mush at these sizes (with_pup is kept for
    the concept sheet only)."""
    c = COATS[coat]
    s = svg_open(c)
    scale = 0.96 if with_pup else 1.1
    s += f'<g transform="translate(512 1040) scale({scale}) translate(-512 -1000) rotate({TILT} 512 760)">'
    if with_pup:
        s += pup(c, 'back', small=True)
    ears = ''.join(ell((x, y + 6, rx * 1.3, ry * 1.3, rot)) for x, y, rx, ry, rot in EARS)
    s += f'<g fill="#000" filter="url(#cast)">{ears}<path d="{HEAD}"/></g>'
    s += f'<g filter="url(#sculpt)"><g fill="url(#body)">{ears}</g></g>'
    s += ''.join(ell((x, y + 6, rx * 1.35, ry * 1.4, rot), f' fill="{c["ear_in"][0]}"') for x, y, rx, ry, rot in EAR_IN)
    s += f'<g filter="url(#sculpt)"><path d="{HEAD}" fill="url(#body)"/></g>'
    s += f'<path d="{MUZZLE}" fill="#000" filter="url(#muzzleDrop)"/>'
    s += f'<g filter="url(#sculptSoft)"><path d="{MUZZLE}" fill="url(#muzzle)"/></g>'
    s += eyes(c, k=1.15, pos=tuple((x, y - 12) for x, y in EYES), uid='s')
    s += ''.join(ell((x, y + 8, 40, 20, rot), f' fill="{c["nostril"]}"') for x, y, _, _, rot in NOSTRILS)
    s += (f'<path d="M 512 600 L 512 680 M 458 700 Q 492 716 512 680 Q 532 716 566 700" stroke="{c["nostril"]}" '
          'stroke-width="16" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.7"/>')
    if with_pup:
        s += CONTACT + pup(c, small=True)
    s += '</g>\n'
    return s + svg_close()


# ------------------------------------------------------------------ flat two-tone
def _flat_pup(c, layer) -> str:
    """the pup in flat colours; a darker edge (flat_edge) separates it from the big head it lies on."""
    D, E = FLAT_BG, c['flat_edge']
    if layer == 'back':
        return f'<g transform="{PUP_TF}"><path d="{PUP_BACK}" fill="{c["flat_body"]}"/></g>'
    ears = ''.join(ell(e) for e in PUP_EARS)
    paws_ = ''.join(f'<ellipse cx="{x}" cy="{y}" rx="{PUP_PAW_R[0]}" ry="{PUP_PAW_R[1]}"/>' for x, y in PUP_PAWS)
    s = f'<g fill="{E}" stroke="{E}" stroke-width="44" stroke-linejoin="round">{ears}<path d="{PUP_HEAD}"/>{paws_}</g>'
    s += f'<g fill="{c["flat_body"]}">{ears}<path d="{PUP_HEAD}"/></g>'
    s += ''.join(ell(e, f' fill="{c["flat_ear"]}"') for e in PUP_EAR_IN)
    s += f'<path d="{PUP_MUZZLE}" fill="{c["flat_muzzle"]}"/><path d="{NOSE}" fill="{c["flat_pad"]}"/>'
    s += ''.join(ell(n, f' fill="{D}"') for n in PUP_NOSTRILS)
    s += f'<path d="{PUP_LIP}" stroke="{c["flat_pad"]}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'
    s += pup_eyes(flat_col=c['flat_feat'])
    s += f'<g fill="{c["flat_paw"]}">{paws_}</g>'
    toes = ''.join(f'<path d="M {x + dx:.1f} {y + PUP_PAW_R[1] - 34} L {x + dx:.1f} {y + PUP_PAW_R[1] - 10}"/>'
                   for x, y in PUP_PAWS for dx in (-PUP_PAW_R[0] * 0.34, PUP_PAW_R[0] * 0.34))
    s += f'<g stroke="{c["flat_toe"]}" stroke-width="16" stroke-linecap="round">{toes}</g>'
    return f'<g transform="{PUP_TF}">{s}</g>'


def flat(coat='warm', with_pup=True) -> str:
    c = COATS[coat]
    D = FLAT_BG
    s = ('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="100 100 824 824">\n'
         f'<defs><path id="tile" d="{SQUIRCLE}"/><clipPath id="clip"><use href="#tile"/></clipPath></defs>\n'
         f'<use href="#tile" fill="{D}"/>\n<g clip-path="url(#clip)">\n'
         f'<g transform="{BIG_TF + " " if with_pup else ""}rotate({TILT} 512 760)">')
    if with_pup:
        s += _flat_pup(c, 'back')
    s += f'<g fill="{c["flat_body"]}">' + ''.join(ell(e) for e in EARS) + f'<path d="{HEAD}"/></g>'
    s += ''.join(ell(e, f' fill="{c["flat_ear"]}"') for e in EAR_IN)
    s += f'<path d="{MUZZLE}" fill="{c["flat_muzzle"]}"/><path d="{NOSE}" fill="{c["flat_pad"]}"/>'
    s += ''.join(ell(n, f' fill="{D}"') for n in NOSTRILS)
    s += f'<path d="{LIP}" stroke="{c["flat_pad"]}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'
    s += eyes(c, flat=True, uid='f')
    if with_pup:
        s += _flat_pup(c, 'front')
    s += '</g>'
    s += ''.join(f'<ellipse cx="{x}" cy="{y}" rx="{PAW_R[0]}" ry="{PAW_R[1]}" fill="{c["flat_paw"]}"/>' for x, y in PAWS)
    s += (f'<g stroke="{c["flat_toe"]}" stroke-width="12" stroke-linecap="round">'
          + ''.join(f'<path d="M {x} 862 L {x} 888"/>' for x in TOES) + '</g>')
    s += nails(c['flat_pad'], w=12, op=1)
    return s + '</g>\n</svg>\n'


# ------------------------------------------------------------------ single-colour glyph (currentColor, 16–24 px)
# Front-facing head on the 24 grid as one even-odd path. What makes it a capybara and not a cat or a bear: the head
# is taller than wide and widest at the jaw (a bell, the big snout's bulk), the ears are small nubs on the upper
# corners rather than on top, the eyes sit high and wide apart with a sleepy flat lid (the icon's E3 eyes), and two
# slanted nostril slits sit far below them (the long face) — no round nose button, no mouth (they read as bear / cat).
# The pup is left off: at 16–20 px @1x it merges into the crown as a grey block (checked; see --concepts).
def _f(v):
    return f'{v:.2f}'.rstrip('0').rstrip('.')


def _p(x, y):
    return f'{_f(x)} {_f(y)}'


def _split(q, t):
    lerp = lambda a, b: (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
    a, b, c = lerp(q[0], q[1]), lerp(q[1], q[2]), lerp(q[2], q[3])
    d, e = lerp(a, b), lerp(b, c)
    m = lerp(d, e)
    return (q[0], a, d, m), (m, e, c, q[3])


def _sub(q, t0, t1):
    right = _split(q, t0)[1] if t0 > 0 else q
    return _split(right, (t1 - t0) / (1 - t0))[0] if t1 < 1 else right


def _c(q):
    return f'C {_p(*q[1])} {_p(*q[2])} {_p(*q[3])} '


def _bell(T, B, crown, W, jaw_y, chin, ear_t, ear_r, k1=0.5, k2=0.62) -> str:
    """symmetric head outline: flat crown -> rounded shoulder -> widest at the jaw -> rounded chin corner -> flat
    chin. The ears are circular-arc bumps that replace the shoulder curve between ear_t[0] and ear_t[1]."""
    xr = 12 + W
    q1 = ((12 + crown, T), (12 + crown + (W - crown) * k1, T), (xr, jaw_y - (jaw_y - T) * k2), (xr, jaw_y))
    q2 = ((xr, jaw_y), (xr, jaw_y + (B - jaw_y) * 0.62), (12 + chin + (W - chin) * 0.62, B), (12 + chin, B))
    a, b = _sub(q1, 0, ear_t[0]), _sub(q1, ear_t[1], 1)
    mir = lambda q: tuple((24 - x, y) for x, y in reversed(q))
    arc = f'A {_f(ear_r)} {_f(ear_r)} 0 1 1 '
    return (f'M {_p(12 - crown, T)} L {_p(*q1[0])} ' + _c(a) + arc + f'{_p(*b[0])} ' + _c(b) + _c(q2)
            + f'L {_p(*mir(q2)[0])} ' + _c(mir(q2)) + _c(mir(b)) + arc + f'{_p(*mir(a)[0])} ' + _c(mir(a)) + 'Z')


def _eye(cx, cy, r, outer, lid, droop) -> str:
    """round eye cut-out with a flat upper lid that droops toward the outer corner."""
    yt = cy - r + lid
    dx = math.sqrt(r * r - (yt - cy) ** 2)
    xi, xo = cx - outer * dx, cx + outer * dx
    return f'M {_p(xi, yt - droop / 2)} L {_p(xo, yt + droop / 2)} A {_f(r)} {_f(r)} 0 1 {1 if outer == 1 else 0} {_p(xi, yt - droop / 2)} Z'


def _slit(cx, cy, rx, ry, rot) -> str:
    t = math.radians(rot)
    x1, y1 = cx - rx * math.cos(t), cy - rx * math.sin(t)
    x2, y2 = cx + rx * math.cos(t), cy + rx * math.sin(t)
    return f'M {_p(x1, y1)} A {_f(rx)} {_f(ry)} {rot} 1 0 {_p(x2, y2)} A {_f(rx)} {_f(ry)} {rot} 1 0 {_p(x1, y1)} Z'


# 19.2 tall, ink centre y = 11.8 (same as the 0.4.0 glyph, so the 232 × 56 lockup grid is unchanged)
GLYPH_HEAD = dict(T=2.2, B=21.4, crown=2.3, W=8.45, jaw_y=14.1, chin=4.75, ear_t=(0.22, 0.52), ear_r=1.65)
GLYPH_EYES = dict(y=8.3, dx=3.7, r=1.55, lid=0.47, droop=0.32)
GLYPH_NOSTRILS = dict(y=15.2, dx=2.2, rx=1.45, ry=0.8, rot=28)
GLYPH_PUP = dict(T=1.7, B=6.5, crown=1.8, W=4.6, jaw_y=4.5, chin=3.0, ear_t=(0.25, 0.62), ear_r=0.95)


def glyph_d(with_pup=False) -> str:
    h, e, n = dict(GLYPH_HEAD), GLYPH_EYES, GLYPH_NOSTRILS
    dy = 0.0
    if with_pup:   # concept only: the head drops and shrinks to make room for the pup
        h.update(T=7.4, B=22.6, W=8.0, jaw_y=17.0, chin=4.4, ear_r=1.35)
        dy = 3.1
    d = [_bell(**h)]
    d += [_eye(12 + s * e['dx'], e['y'] + dy, e['r'], s, e['lid'], e['droop']) for s in (-1, 1)]
    d += [_slit(12 + s * n['dx'], n['y'] + dy * 0.8, n['rx'], n['ry'], -s * n['rot']) for s in (-1, 1)]
    if with_pup:
        d += [_bell(**GLYPH_PUP), _slit(10.2, 4.1, 0.55, 0.55, 0), _slit(13.8, 4.1, 0.55, 0.55, 0)]
    return ' '.join(d)


def glyph(with_pup=False) -> str:
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">\n'
            f'  <path fill-rule="evenodd" d="{glyph_d(with_pup)}"/>\n</svg>\n')


# ------------------------------------------------------------------ concept variants
VARIANTS = {
    'capy-full': lambda: icon('warm'),
    'capy-full-white': lambda: icon('white'),
    'capy-head-only': lambda: icon('warm', with_pup=False),
    'capy-small': lambda: small('warm'),
    'capy-small-pup': lambda: small('warm', with_pup=True),
    'capy-flat': lambda: flat('warm'),
    'capy-glyph': glyph,
    'capy-glyph-pup': lambda: glyph(with_pup=True),
}

# Chosen (0.4.1, concept E3-B1): warm coat, big round head with sleepy round eyes, a pup lying on the crown.
# The small sizes drop the pup (checked at 16 / 32 px: it turns to mush and shrinks the face).
MASTERS = {
    'capybara.svg': lambda: icon('warm'),
    'capybara-small.svg': lambda: small('warm'),
    'capybara-flat.svg': lambda: flat('warm'),
    'capy-glyph.svg': glyph,
}

if __name__ == '__main__':
    import sys
    if '--concepts' in sys.argv:
        dest = Path(sys.argv[sys.argv.index('--concepts') + 1])
        dest.mkdir(parents=True, exist_ok=True)
        for name, fn in VARIANTS.items():
            (dest / f'{name}.svg').write_text(fn(), encoding='utf-8')
        print('wrote', len(VARIANTS), 'concepts to', dest)
    else:
        for name, fn in MASTERS.items():
            (OUT / name).write_text(fn(), encoding='utf-8')
            print('wrote', (OUT / name).relative_to(OUT.parents[3]))
