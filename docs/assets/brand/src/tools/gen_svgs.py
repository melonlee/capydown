# 生成 docs/assets/brand 下的 SVG：先运行 make_mark.py 和 wordmark.py，再运行本脚本（在仓库根目录执行）
import json
m=json.load(open('mark.json'))
wm=json.load(open('wm.json'))
def lines_svg(color='#FFFFFF', op=0.96):
    out=[]
    for (p,q,w) in m['lines']:
        out.append(f'<line x1="{p[0]:.1f}" y1="{p[1]:.1f}" x2="{q[0]:.1f}" y2="{q[1]:.1f}" stroke="{color}" stroke-opacity="{op}" stroke-width="{w}" stroke-linecap="round"/>')
    return '\n    '.join(out)
DEFS='''<linearGradient id="lb-left" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#9F7AFA"/><stop offset="1" stop-color="#7C3AED"/>
    </linearGradient>
    <linearGradient id="lb-right" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6D28D9"/><stop offset="1" stop-color="#4C1D95"/>
    </linearGradient>
    <linearGradient id="lb-top" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#EDE9FE"/><stop offset="1" stop-color="#C4B5FD"/>
    </linearGradient>'''
def cube(zcolor='#C4B5FD', zop=0.9):
    return f'''<g transform="translate(-20 26)">
    <path d="{m['right']}" fill="url(#lb-right)"/>
    <path d="{m['left']}" fill="url(#lb-left)"/>
    <path d="{m['top']}" fill="url(#lb-top)"/>
    {lines_svg()}
    <path d="{m['z1']}" fill="none" stroke="{zcolor}" stroke-opacity="{zop}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="{m['z2']}" fill="none" stroke="{zcolor}" stroke-opacity="{zop*0.7}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  </g>'''
# 1. app icon (macOS grid: 824 body, 100 margin)
app_icon=f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    {DEFS}
    <linearGradient id="lb-bg" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="#2A2456"/><stop offset="1" stop-color="#0D0F24"/>
    </linearGradient>
    <radialGradient id="lb-glow" cx="0.5" cy="0.55" r="0.5">
      <stop offset="0" stop-color="#8B5CF6" stop-opacity="0.45"/><stop offset="1" stop-color="#8B5CF6" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="lb-sheen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.10"/><stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect x="100" y="100" width="824" height="824" rx="185" fill="url(#lb-bg)"/>
  <rect x="100" y="100" width="824" height="824" rx="185" fill="url(#lb-glow)"/>
  <rect x="100" y="100" width="824" height="824" rx="185" fill="url(#lb-sheen)"/>
  <rect x="101.5" y="101.5" width="821" height="821" rx="183.5" fill="none" stroke="#FFFFFF" stroke-opacity="0.08" stroke-width="3"/>
  <g transform="translate(512 512) scale(0.95) translate(-512 -512)">
  {cube()}
  </g>
</svg>
'''
# 2. mark only (transparent)
mark=f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="270 140 500 680" width="500" height="680">
  <defs>
    {DEFS}
  </defs>
  {cube(zcolor='#8B5CF6', zop=1)}
</svg>
'''
# 3. wordmark lockups
def wordmark(dark):
    s=0.05  # font units -> px (cap height 1440*0.05 = 72px)
    textw=wm['width']*s
    cap=wm['capHeight']*s
    mark_h=150; mark_scale=mark_h/680
    gap=30
    W=int(500*mark_scale+gap+textw+8); H=164
    base_y = 94 + cap/2
    col_main = '#F5F3FF' if dark else '#14112B'
    col_box = '#A78BFA' if dark else '#7C3AED'
    paths=[]
    for i,p in enumerate(wm['parts']):
        fill = col_box if i>=4 else col_main
        paths.append(f'<path d="{p["d"]}" fill="{fill}"/>')
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
  <defs>
    {DEFS}
  </defs>
  <g transform="scale({mark_scale:.4f}) translate(-270 -140)">
  {cube(zcolor='#A78BFA' if dark else '#8B5CF6', zop=1)}
  </g>
  <g transform="translate({500*mark_scale+gap:.1f} {base_y:.1f}) scale({s})">
    {''.join(paths)}
  </g>
</svg>
'''
open('docs/assets/brand/src/app-icon.svg','w').write(app_icon)
open('docs/assets/brand/logo-mark.svg','w').write(mark)
open('docs/assets/brand/logo-wordmark-light.svg','w').write(wordmark(False))
open('docs/assets/brand/logo-wordmark-dark.svg','w').write(wordmark(True))
print('ok')
