#!/usr/bin/env python3
"""Capydown 吉祥物母版：从底边探出头的正面卡皮巴拉（和 喵想 · FantasyAI Lab 的猫同一个吉祥物家族）。

构图和 喵想 的猫完全一致：viewBox 100..924（圆角方形主体）、深炭灰底板、左上主光、`sculpt` 轮廓滤镜、
`cast` 投影、带白色高光的内嵌椭圆眼睛、两只搭在底边上的爪子（趾缝线）。只改让它成为卡皮巴拉的部分：
平顶的方头、方方的腮、头顶两角的小圆耳、占据下半张脸的宽大圆口鼻（柔和的深色鼻垫 + 两道斜鼻孔 + 人字唇线）、
短趾和深色小指甲、暖褐毛色，头顶放一颗柚子（卡皮巴拉泡柚子汤的梗）。几何全部是参数化的，改这里而不是改 SVG。

生成（仓库根目录）：python3 docs/assets/brand/src/tools/capybara.py
  docs/assets/brand/src/capybara.svg        完整图标（≥64px）：头顶一颗柚子
  docs/assets/brand/src/capybara-small.svg  小尺寸版（16–32px）：只留头（平顶 + 耳 + 长口鼻），五官放大，无柚子 / 爪子
  docs/assets/brand/src/capybara-flat.svg   两色平面版（无渐变、无滤镜）
  docs/assets/brand/src/capy-glyph.svg      单色正面头像（currentColor，24 网格；耳 / 平顶 / 口鼻轮廓，眼睛和鼻孔镂空），应用内 16–20px 标志
然后 build_icon.py → export_icons.py → build_brand.py。
概念稿（白 / 暖两种毛色、口鼻深浅、头顶柚子）：python3 capybara.py --concepts <dir>，比较图在仓库外的 _concepts/capybara-meow/。
"""
from __future__ import annotations

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
    cream=('#fbf1e3', '#ead6bb', '#c4a481'),
    shade='#3b2f26', shine='#fff4e6', shine_op=0.85,
    ear_in=('#7d604b', '#a8876a'), pad=('#7f604a', '#5f4636'), nostril='#1a120c', lip='#6d5240',
    toe='#8a6c53', nail='#4a382c',
    flat_body='#d8bc99', flat_muzzle='#c4a37e', flat_feat='#17181c', flat_pad='#4a382c', flat_paw='#e3caa9',
    flat_toe='#9c7c5e', flat_ear='#9c7c5e',
)
WHITE = dict(  # the 喵想 cat's own white, for comparison
    body=('#ffffff', '#f3f3f5', '#d9dadf', '#b4b6bc', '#8a8c93'),
    muzzle=('#ffffff', '#e9eaee', '#c3c5cb'),
    cream=('#ffffff', '#f1f2f4', '#cfd1d6'),
    shade='#3e4047', shine='#ffffff', shine_op=0.9,
    ear_in=('#a9abb2', '#c9cad0'), pad=('#55575e', '#2f3035'), nostril='#111214', lip='#8d9097',
    toe='#9c9ea5', nail='#6b6d74',
    flat_body='#f1f2f4', flat_muzzle='#dcdee2', flat_feat='#17181c', flat_pad='#3a3c42', flat_paw='#f1f2f4',
    flat_toe='#a9abb2', flat_ear='#b4b6bc',
)
COATS = {'warm': WARM, 'white': WHITE}

# ------------------------------------------------------------------ geometry (喵想 frame: 100..924, tilt about 512,760)
TILT = -5
# Broad box head with a flat top and squared cheeks that flow into stocky shoulders; closed below the tile.
HEAD = ('M 104 1110 C 104 930 150 838 232 800 '
        'C 220 690 222 520 232 390 '
        'C 238 306 280 266 362 260 '
        'C 444 254 580 254 662 260 '
        'C 744 266 786 306 792 390 '
        'C 802 520 804 690 792 800 '
        'C 874 838 920 930 920 1110 Z')
EARS = ((270, 282, 36, 27, -36), (754, 282, 36, 27, 36))       # cx, cy, rx, ry, rot — on the top corners
EAR_IN = ((264, 276, 19, 11, -36), (760, 276, 19, 11, 36))
EYES = ((356, 410), (668, 410))
EYE_W, EYE_H = 64, 94
# Deep, blunt snout: the whole lower face, a rounded block nearly as wide as the head.
MUZZLE = ('M 512 492 C 616 492 684 522 698 604 C 712 690 694 770 640 812 '
          'C 600 842 424 842 384 812 C 330 770 312 690 326 604 C 340 522 408 492 512 492 Z')
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
YUZU = (512, 268, 54)


def ell(e, extra=''):
    cx, cy, rx, ry, rot = e
    return f'<ellipse cx="{cx:g}" cy="{cy:g}" rx="{rx:g}" ry="{ry:g}" transform="rotate({rot} {cx:g} {cy:g})"{extra}/>'


# ------------------------------------------------------------------ defs (喵想 filters, coat-tinted)
def defs(c: dict, muzzle_kind='tone') -> str:
    b = c['body']
    m = c['muzzle'] if muzzle_kind == 'tone' else c['cream']
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
  <radialGradient id="yuzu" cx="0.36" cy="0.3" r="0.8">
    <stop offset="0" stop-color="#ffe08a"/><stop offset="0.55" stop-color="#f6a93a"/><stop offset="1" stop-color="#d97a16"/>
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
  <filter id="yuzuShadow" x="-60%" y="-200%" width="220%" height="500%"><feGaussianBlur stdDeviation="9"/></filter>
  <filter id="padBlur" x="-30%" y="-50%" width="160%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
  <filter id="eyeInset" x="-30%" y="-30%" width="160%" height="160%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="5" result="b"/><feOffset in="b" dx="4" dy="7" result="o"/>
    <feComposite in="SourceAlpha" in2="o" operator="out" result="e"/>
    <feFlood flood-color="#000" flood-opacity="0.9"/><feComposite in2="e" operator="in" result="s"/>
    <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="s"/></feMerge>
  </filter>
</defs>
'''


def svg_open(c, muzzle_kind='tone'):
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="100 100 824 824">\n'
            + defs(c, muzzle_kind) + '<use href="#squircle" fill="url(#bg)"/>\n<g clip-path="url(#clip)">\n')


def svg_close():
    return '</g>\n<use href="#squircle" fill="none" stroke="url(#rim)" stroke-width="3"/>\n</svg>\n'


def lit(shapes: str, cast=True, filt='sculpt', fill='body') -> str:
    s = f'<g fill="#000" filter="url(#cast)">{shapes}</g>' if cast else ''
    return s + f'<g filter="url(#{filt})"><g fill="url(#{fill})">{shapes}</g></g>'


# ------------------------------------------------------------------ parts
def eyes(w=EYE_W, h=EYE_H, pos=EYES, hl=(12, 15), flat=False, feat='#17181c', hl_col='#fff') -> str:
    r = w / 2
    rects = ''.join(f'<rect x="{x - r:g}" y="{y - h / 2:g}" width="{w}" height="{h}" rx="{r:g}" fill="{feat if flat else "url(#eye)"}"/>'
                    for x, y in pos)
    dots = ''.join(f'<ellipse cx="{x + r * 0.36:.0f}" cy="{y - h * 0.24:.0f}" rx="{hl[0]}" ry="{hl[1]}" fill="{hl_col}" opacity="{1 if flat else 0.9}"/>'
                   for x, y in pos)
    return (rects if flat else f'<g filter="url(#eyeInset)">{rects}</g>') + dots


def muzzle(c) -> str:
    s = f'<g mask="url(#muzzleMask)"><path d="{MUZZLE}" fill="#000" filter="url(#muzzleDrop)"/>'
    s += f'<g filter="url(#sculptSoft)"><path d="{MUZZLE}" fill="url(#muzzle)"/></g></g>'
    s += f'<path d="{NOSE}" fill="url(#pad)" opacity="0.62" filter="url(#padBlur)"/>'
    s += ''.join(ell(n, f' fill="{c["nostril"]}"') for n in NOSTRILS)
    s += '<path d="M 452 543 Q 512 535 572 543" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none" opacity="0.16"/>'
    s += f'<path d="{LIP}" stroke="{c["lip"]}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'
    return s


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


def yuzu(flat=False) -> str:
    x, y, r = YUZU
    leaf = (f'M {x + 6} {y - r + 4} C {x + 20} {y - r - 26} {x + 52} {y - r - 26} {x + 62} {y - r - 12} '
            f'C {x + 44} {y - r + 2} {x + 22} {y - r + 6} {x + 6} {y - r + 4} Z')
    if flat:
        return f'<circle cx="{x}" cy="{y}" r="{r}" fill="#f2a23a"/><path d="{leaf}" fill="#7fa04a"/>'
    return (f'<ellipse cx="{x + 10}" cy="{y + r - 4}" rx="{r * 0.9:.0f}" ry="{r * 0.3:.0f}" fill="#000" opacity="0.45" filter="url(#yuzuShadow)"/>'
            f'<g filter="url(#sculptSoft)"><circle cx="{x}" cy="{y}" r="{r}" fill="url(#yuzu)"/></g>'
            f'<ellipse cx="{x - 18}" cy="{y - 20}" rx="14" ry="9" fill="#fff" opacity="0.55" transform="rotate(-30 {x - 18} {y - 20})"/>'
            f'<path d="{leaf}" fill="#7fa04a"/>'
            f'<path d="M {x} {y - r + 2} L {x + 2} {y - r - 8}" stroke="#5c4a2e" stroke-width="5" stroke-linecap="round"/>')


def head_group(c) -> str:
    ears = ''.join(ell(e) for e in EARS)
    s = f'<g transform="rotate({TILT} 512 760)">\n'
    s += f'<g fill="#000" filter="url(#cast)">{ears}<path d="{HEAD}"/></g>\n'
    s += f'<g filter="url(#sculpt)"><g fill="url(#body)">{ears}</g></g>'
    s += ''.join(ell(e, ' fill="url(#earIn)"') for e in EAR_IN)
    s += f'<g filter="url(#sculpt)"><path d="{HEAD}" fill="url(#body)"/></g>\n'
    s += muzzle(c) + '\n' + eyes() + '\n'
    return s + '</g>\n'


def icon(coat='warm', muzzle_kind='tone', with_yuzu=False) -> str:
    c = COATS[coat]
    s = svg_open(c, muzzle_kind) + head_group(c)
    if with_yuzu:
        s += f'<g transform="rotate({TILT} 512 760)">{yuzu()}</g>\n'
    return s + paws(c) + svg_close()


# ------------------------------------------------------------------ small (16–32 px)
SMALL_TF = 'translate(512 1040) scale(1.1) translate(-512 -1000)'


def small(coat='warm', with_yuzu=False) -> str:
    """16–32 px: head only (flat top, corner ears, long snout), a touch larger; eyes, ears and nostrils enlarged,
    the snout one clear value step darker; no lip, paws, nails or soft pad."""
    c = COATS[coat]
    s = svg_open(c)
    ears = ''.join(ell((x, y + 6, rx * 1.3, ry * 1.3, rot)) for x, y, rx, ry, rot in EARS)
    s += f'<g transform="{SMALL_TF} rotate({TILT} 512 760)">'
    s += f'<g fill="#000" filter="url(#cast)">{ears}<path d="{HEAD}"/></g>'
    s += f'<g filter="url(#sculpt)"><g fill="url(#body)">{ears}</g></g>'
    s += ''.join(ell((x, y + 6, rx * 1.35, ry * 1.4, rot), f' fill="{c["ear_in"][0]}"') for x, y, rx, ry, rot in EAR_IN)
    s += f'<g filter="url(#sculpt)"><path d="{HEAD}" fill="url(#body)"/></g>'
    s += f'<path d="{MUZZLE}" fill="#000" filter="url(#muzzleDrop)"/>'
    s += f'<g filter="url(#sculptSoft)"><path d="{MUZZLE}" fill="url(#muzzle)"/></g>'
    s += eyes(w=84, h=112, pos=((362, 400), (662, 400)), hl=(15, 18))
    s += ''.join(ell((x, y + 8, 40, 20, rot), f' fill="{c["nostril"]}"') for x, y, _, _, rot in NOSTRILS)
    s += f'<path d="M 512 600 L 512 680 M 458 700 Q 492 716 512 680 Q 532 716 566 700" stroke="{c["nostril"]}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.7"/>'
    if with_yuzu:
        s += yuzu()
    s += '</g>\n'
    return s + svg_close()


# ------------------------------------------------------------------ flat two-tone
def flat(coat='warm', with_yuzu=False) -> str:
    c = COATS[coat]
    D = FLAT_BG
    s = ('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="100 100 824 824">\n'
         f'<defs><path id="tile" d="{SQUIRCLE}"/><clipPath id="clip"><use href="#tile"/></clipPath></defs>\n'
         f'<use href="#tile" fill="{D}"/>\n<g clip-path="url(#clip)">\n<g transform="rotate({TILT} 512 760)">')
    s += f'<g fill="{c["flat_body"]}">' + ''.join(ell(e) for e in EARS) + f'<path d="{HEAD}"/></g>'
    s += ''.join(ell(e, f' fill="{c["flat_ear"]}"') for e in EAR_IN)
    s += f'<path d="{MUZZLE}" fill="{c["flat_muzzle"]}"/><path d="{NOSE}" fill="{c["flat_pad"]}"/>'
    s += ''.join(ell(n, f' fill="{D}"') for n in NOSTRILS)
    s += f'<path d="{LIP}" stroke="{c["flat_pad"]}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'
    s += eyes(flat=True, feat=c['flat_feat'], hl_col='#fff')
    if with_yuzu:
        s += yuzu(flat=True)
    s += '</g>'
    s += ''.join(f'<ellipse cx="{x}" cy="{y}" rx="{PAW_R[0]}" ry="{PAW_R[1]}" fill="{c["flat_paw"]}"/>' for x, y in PAWS)
    s += (f'<g stroke="{c["flat_toe"]}" stroke-width="12" stroke-linecap="round">'
          + ''.join(f'<path d="M {x} 862 L {x} 888"/>' for x in TOES) + '</g>')
    s += nails(c['flat_pad'], w=12, op=1)
    return s + '</g>\n</svg>\n'


# ------------------------------------------------------------------ single-colour glyph (currentColor, 16–24 px)
def _ellp(cx, cy, rx, ry, rot=0.0) -> str:
    import math
    t = math.radians(rot)
    x1, y1 = cx - rx * math.cos(t), cy - rx * math.sin(t)
    x2, y2 = cx + rx * math.cos(t), cy + rx * math.sin(t)
    return f'M {x1:.2f} {y1:.2f} A {rx} {ry} {rot} 1 0 {x2:.2f} {y2:.2f} A {rx} {ry} {rot} 1 0 {x1:.2f} {y1:.2f} Z'


# Front-facing head on the 24 grid, one even-odd path. Tall flat-topped box head with small ear bumps on the
# top corners, squared cheeks that step in to a deep blunt snout; eye cut-outs set high, two slanted nostril
# cut-outs low on the snout (no round nose button, no mouth arc — those read as a bear).
GLYPH_HEAD = ('M 12 3.2 C 14.2 3.2 15.8 3.25 16.9 3.35 '
              'C 17.3 2.5 18.2 2.0 19.1 2.2 C 20.2 2.4 20.7 3.4 20.4 4.4 C 20.35 4.75 20.3 5.0 20.1 5.2 '
              'C 20.6 6.0 20.8 7.0 20.85 8.2 C 20.95 10.5 20.9 12.6 20.4 14.2 C 20.0 15.4 19.4 16.0 19.0 16.6 '
              'C 18.8 19.6 16.6 21.4 12 21.4 C 7.4 21.4 5.2 19.6 5.0 16.6 '
              'C 4.6 16.0 4.0 15.4 3.6 14.2 C 3.1 12.6 3.05 10.5 3.15 8.2 C 3.2 7.0 3.4 6.0 3.9 5.2 '
              'C 3.7 5.0 3.65 4.75 3.6 4.4 C 3.3 3.4 3.8 2.4 4.9 2.2 C 5.8 2.0 6.7 2.5 7.1 3.35 '
              'C 8.2 3.25 9.8 3.2 12 3.2 Z')
GLYPH_EYES = ('M 6.9 8.1 C 6.9 7.4 7.4 6.9 8.05 6.9 C 8.7 6.9 9.2 7.4 9.2 8.1 L 9.2 9.3 C 9.2 10.0 8.7 10.5 8.05 10.5 '
              'C 7.4 10.5 6.9 10.0 6.9 9.3 Z '
              'M 14.8 8.1 C 14.8 7.4 15.3 6.9 15.95 6.9 C 16.6 6.9 17.1 7.4 17.1 8.1 L 17.1 9.3 C 17.1 10.0 16.6 10.5 15.95 10.5 '
              'C 15.3 10.5 14.8 10.0 14.8 9.3 Z')
GLYPH_NOSTRILS = (9.7, 15.6, 1.7, 0.95, 16), (14.3, 15.6, 1.7, 0.95, -16)


def glyph() -> str:
    d = f'{GLYPH_HEAD} {GLYPH_EYES} ' + ' '.join(_ellp(*n) for n in GLYPH_NOSTRILS)
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">\n'
            f'  <path fill-rule="evenodd" d="{d}"/>\n</svg>\n')


# ------------------------------------------------------------------ concept variants (for _concepts/capybara-meow)
VARIANTS = {
    'capy-warm': lambda: icon('warm'),
    'capy-warm-cream': lambda: icon('warm', 'cream'),
    'capy-white': lambda: icon('white'),
    'capy-warm-yuzu': lambda: icon('warm', with_yuzu=True),
    'capy-warm-small': lambda: small('warm'),
    'capy-warm-yuzu-small': lambda: small('warm', with_yuzu=True),
    'capy-white-small': lambda: small('white'),
    'capy-warm-flat': lambda: flat('warm'),
    'capy-warm-yuzu-flat': lambda: flat('warm', with_yuzu=True),
    'capy-glyph': glyph,
}

# Chosen: warm coat + yuzu (B). The yuzu is the capybara fans' tell (capybaras soaking with yuzu) and the family's
# one accent per member (rabbit's moon, beaver's node); the small sizes drop it.
MASTERS = {
    'capybara.svg': lambda: icon('warm', with_yuzu=True),
    'capybara-small.svg': lambda: small('warm'),
    'capybara-flat.svg': lambda: flat('warm', with_yuzu=True),
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
