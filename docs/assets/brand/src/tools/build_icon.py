#!/usr/bin/env python3
"""Capydown 图标：从底边探出头的正面卡皮巴拉（和 喵想 · FantasyAI Lab 的猫同一吉祥物家族、同一构图），头顶一颗柚子。

母版由 capybara.py 生成（参数化几何，别手改 SVG）：
  docs/assets/brand/src/capybara.svg        完整图标，viewBox 100..924（圆角方形主体，无留白）
  docs/assets/brand/src/capybara-small.svg  小尺寸版：只留头，五官放大（16–32px）
  docs/assets/brand/src/capybara-flat.svg   两色平面版（无渐变、无滤镜）
  docs/assets/brand/src/capy-glyph.svg      单色正面头像（currentColor，24 网格）

本脚本生成：
  docs/assets/brand/src/app-icon.svg / app-icon-small.svg  macOS 1024 网格（主体 100..924，带落地投影 class="tile-shadow"），
                                                           export_icons.py 从它们导出 icns / ico / Linux PNG / favicon
  docs/assets/brand/src/app-icon-flat.svg                  平面版副本
  src/renderer/src/assets/images/logo-mark.svg             应用内标志 = capy-glyph，只用 currentColor（夜间主题自动反白）
  docs/assets/brand/logo-mark.svg / logo-mark-dark.svg     同一字形的墨色 / 反白版本
  docs/assets/brand/capybara-art.svg / -dark.svg           无底板的吉祥物（浅色 / 深色背景），给官网和宣传图

用法（仓库根目录）：python3 docs/assets/brand/src/tools/capybara.py && python3 docs/assets/brand/src/tools/build_icon.py
然后 export_icons.py 导出位图，build_brand.py 重新组合 logo-lockup-*。"""
from __future__ import annotations

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
ART_FADE = ('<linearGradient id="artFadeB" gradientUnits="userSpaceOnUse" x1="0" y1="800" x2="0" y2="924">'
            '<stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>'
            '<mask id="artMaskB" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024"><rect width="1024" height="924" fill="url(#artFadeB)"/></mask>')


def art(dark):
    """去掉底板和外框，只留卡皮巴拉（连同柚子和爪子）；肩膀在底边（原本被底板裁掉的地方）柔和淡出。
    浅色背景版：投影变淡。"""
    s = strip_comments(read('capybara.svg'))
    s = s.replace('width="1024" height="1024" viewBox="100 100 824 824"', 'viewBox="90 150 844 790" width="844" height="790"', 1)
    s = s.replace('<defs>', '<defs>\n' + ART_FADE, 1)
    s = s.replace('<use href="#squircle" fill="url(#bg)"/>\n', '', 1)
    s = s.replace('<g clip-path="url(#clip)">', '<g mask="url(#artMaskB)">', 1)
    s = s.replace('</g>\n<use href="#squircle" fill="none" stroke="url(#rim)" stroke-width="3"/>\n', '</g>\n', 1)
    if not dark:
        s = s.replace('<feComponentTransfer><feFuncA type="linear" slope="0.7"/></feComponentTransfer>',
                      '<feComponentTransfer><feFuncA type="linear" slope="0.16"/></feComponentTransfer>', 1)  # 投影：白底上只留一点点
    label = '深色' if dark else '浅色'
    assert 'artMaskB' in s and 'url(#bg)' not in s.split('</defs>')[1]
    return s.replace('<defs>', f'<!-- Capydown 吉祥物：从底边探出头的正面卡皮巴拉，无底板（{label}背景）。{GEN} -->\n<defs>', 1)


# ---------------------------------------------------------------- 应用内标志（24 网格，单色）
def glyph_d():
    m = re.search(r'<path fill-rule="evenodd" d="([^"]+)"/>', read('capy-glyph.svg'))
    return m.group(1)


def mark_inline(d):
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n'
            f'  <!-- Capydown 应用内标志：卡皮巴拉正面头像（平顶方头 + 耳朵，眼睛 / 鼻孔镂空），只用 currentColor（夜间主题自动反白）。{GEN} -->\n'
            f'  <path fill="currentColor" fill-rule="evenodd" d="{d}"/>\n</svg>\n')


def mark_colored(d, color, label):
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="240" height="240">\n'
            f'  <!-- Capydown 标志（{label}）：卡皮巴拉正面头像，单色。{GEN} -->\n'
            f'  <path fill="{color}" fill-rule="evenodd" d="{d}"/>\n</svg>\n')


if __name__ == '__main__':
    d = glyph_d()
    out = {
        os.path.join(SRC, 'app-icon.svg'): mac_grid(read('capybara.svg'), 'Capydown 应用图标：从底边探出头的卡皮巴拉，头顶一颗柚子（≥64px）'),
        os.path.join(SRC, 'app-icon-small.svg'): mac_grid(read('capybara-small.svg'), 'Capydown 应用图标小尺寸版：只留头，五官放大（16–32px）'),
        os.path.join(SRC, 'app-icon-flat.svg'): strip_comments(read('capybara-flat.svg')).replace('<defs>', f'<!-- Capydown 两色平面版。{GEN} -->\n<defs>', 1),
        os.path.join(ROOT, 'src/renderer/src/assets/images/logo-mark.svg'): mark_inline(d),
        os.path.join(BRAND, 'logo-mark.svg'): mark_colored(d, '#111111', '墨色'),
        os.path.join(BRAND, 'logo-mark-dark.svg'): mark_colored(d, '#EDEDED', '反白，深色背景'),
        os.path.join(BRAND, 'capybara-art.svg'): art(False),
        os.path.join(BRAND, 'capybara-art-dark.svg'): art(True),
    }
    for path, text in out.items():
        with open(path, 'w', encoding='utf-8') as f:
            f.write(text)
        print('wrote', os.path.relpath(path, ROOT))
