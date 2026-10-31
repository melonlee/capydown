// usage: node render.mjs <file.svg|html> <out.png> <w> <h> [dpr=1] [transparent=true]
import { chromium } from 'playwright-core'
import { resolve } from 'node:path'
const [,, src, out, w, h, dpr = '1', transparent = 'true'] = process.argv
const killer = setTimeout(() => { console.error('timeout'); process.exit(2) }, 60000)
const browser = await chromium.launch({ channel: 'chrome', timeout: 30000 })
try {
  const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr })
  const url = 'file://' + resolve(src)
  if (src.endsWith('.svg')) {
    const fs = await import('node:fs')
    const wrap = '_wrap.html'
    fs.writeFileSync(wrap, `<html><body style="margin:0;background:transparent"><img src="${url}" style="width:${w}px;height:${h}px;display:block"></body></html>`)
    await page.goto('file://' + wrap, { waitUntil: 'load', timeout: 30000 })
  } else {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
  }
  await page.waitForTimeout(500)
  await page.screenshot({ path: out, omitBackground: transparent === 'true', timeout: 20000 })
  console.log('saved', out)
} finally { await browser.close(); clearTimeout(killer) }
