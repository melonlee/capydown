// usage: node svgbatch.mjs jobs.json   jobs: [{ "src": "a.svg|a.html", "out": "a.png", "w": 512, "h": 512, "bg": "transparent|#fff", "dpr": 1 }]
// SVG 以 <img> 方式按目标像素渲染（透明背景）；HTML 直接截图。整个批次 120 秒超时。
import { chromium } from 'playwright-core'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
const jobs = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const killer = setTimeout(() => { console.error('timeout'); process.exit(2) }, 120000)
const dir = mkdtempSync(join(tmpdir(), 'svgbatch-'))
const browser = await chromium.launch({ channel: 'chrome', timeout: 30000 })
try {
  for (const j of jobs) {
    const page = await browser.newPage({ viewport: { width: j.w, height: j.h }, deviceScaleFactor: j.dpr || 1 })
    let url = 'file://' + resolve(j.src)
    if (j.src.endsWith('.svg')) {
      const wrap = join(dir, 'wrap.html')
      writeFileSync(wrap, `<html><body style="margin:0;background:${j.bg || 'transparent'}"><img src="${url}" style="width:${j.w}px;height:${j.h}px;display:block"></body></html>`)
      url = 'file://' + wrap
    }
    await page.goto(url, { waitUntil: 'load', timeout: 30000 })
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(150)
    await page.screenshot({ path: j.out, omitBackground: !j.bg || j.bg === 'transparent', timeout: 20000 })
    await page.close()
    console.log('saved', j.out, `${j.w}x${j.h}@${j.dpr || 1}`)
  }
} finally { await browser.close(); clearTimeout(killer) }
