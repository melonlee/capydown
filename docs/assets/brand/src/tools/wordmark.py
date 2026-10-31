# 字体：Manrope（SIL OFL），从 https://github.com/google/fonts/tree/main/ofl/manrope 下载 Manrope[wght].ttf 并重命名为 Manrope.ttf
# 用法：python wordmark.py LazyBox 800 > wm.json   （需要 pip install fonttools）
import sys, json
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen
font = TTFont('Manrope.ttf')
inst = instantiateVariableFont(font, {'wght': int(sys.argv[2]) if len(sys.argv) > 2 else 800})
text = sys.argv[1] if len(sys.argv) > 1 else 'LazyBox'
cmap = inst.getBestCmap(); gs = inst.getGlyphSet(); upm = inst['head'].unitsPerEm
tracking = -0.025 * upm
# manual kerning tweaks (font units)
kern = {('L','a'): -60, ('a','z'): -5, ('B','o'): -10, ('o','x'): -15, ('y','B'): 10}
x = 0; parts = []
prev = None
for ch in text:
    g = cmap[ord(ch)]
    if prev: x += kern.get((prev, ch), 0)
    pen = SVGPathPen(gs)
    from fontTools.pens.transformPen import TransformPen
    tp = TransformPen(pen, (1, 0, 0, -1, x, 0))
    gs[g].draw(tp)
    parts.append({'ch': ch, 'd': pen.getCommands()})
    x += gs[g].width + tracking
    prev = ch
asc = inst['OS/2'].sCapHeight
print(json.dumps({'width': x - tracking, 'capHeight': asc, 'upm': upm, 'xHeight': inst['OS/2'].sxHeight, 'desc': inst['hhea'].descent, 'parts': parts}))
