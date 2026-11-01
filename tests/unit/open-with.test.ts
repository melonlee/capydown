import { describe, expect, it } from 'vitest'
import { decideOpenTarget, extractMarkdownArgs, isMarkdownPath } from '../../src/main/open-with'

// Paths in these cases are POSIX; Windows resolves them with drive letters and backslashes.
const posixPaths = process.platform !== 'win32'

describe('isMarkdownPath', () => {
  it('accepts the registered extensions, case-insensitively', () => {
    for (const f of ['a.md', 'b.MARKDOWN', 'c.mdown', 'd.mkd', 'e.mkdn'])
      expect(isMarkdownPath(f)).toBe(true)
    for (const f of ['a.txt', 'md', 'index.cjs', 'a.md.bak'])
      expect(isMarkdownPath(f)).toBe(false)
  })
})

describe.runIf(posixPaths)('extractMarkdownArgs', () => {
  it('finds markdown files in a packaged launch', () => {
    expect(extractMarkdownArgs(['/Applications/Capydown.app/Contents/MacOS/Capydown', '/Users/me/文章.md'], '/')).toEqual(['/Users/me/文章.md'])
  })

  it('skips the dev entry script, switches and non-markdown arguments', () => {
    const argv = ['electron', 'out/main/index.cjs', '--inspect=0', '--remote-debugging-port=0', 'notes/a.md', 'b.txt', '-psn_0_123']
    expect(extractMarkdownArgs(argv, '/work')).toEqual(['/work/notes/a.md'])
  })

  it('converts file:// URLs and removes duplicates', () => {
    const argv = ['Capydown', 'file:///home/me/%E6%96%87.md', '/home/me/文.md']
    expect(extractMarkdownArgs(argv, '/')).toEqual(['/home/me/文.md'])
  })

  it('returns nothing for a plain launch', () => {
    expect(extractMarkdownArgs(['Capydown'], '/')).toEqual([])
  })
})

describe.runIf(posixPaths)('decideOpenTarget', () => {
  it('opens a file inside the current workspace without switching', () => {
    expect(decideOpenTarget('/ws/sub/a.md', '/ws', {}, false)).toEqual({ switchWorkspace: false, workspace: '/ws', file: '/ws/sub/a.md' })
  })

  it('opens the parent folder as workspace for files elsewhere', () => {
    expect(decideOpenTarget('/other/a.md', '/ws', {}, false)).toEqual({ switchWorkspace: true, workspace: '/other', file: '/other/a.md' })
    expect(decideOpenTarget('/ws2/a.md', '/ws', {}, false).switchWorkspace).toBe(true) // 前缀相同但不是子目录
    expect(decideOpenTarget('/x/a.md', null).switchWorkspace).toBe(true)
  })

  it('compares real paths but keeps the workspace spelling', () => {
    const t = decideOpenTarget('/private/tmp/demo/a.md', '/tmp/demo', { file: '/private/tmp/demo/a.md', workspace: '/private/tmp/demo' }, false)
    expect(t).toEqual({ switchWorkspace: false, workspace: '/tmp/demo', file: '/tmp/demo/a.md' })
  })

  it('ignores case on case-insensitive file systems', () => {
    expect(decideOpenTarget('/Users/Me/WS/Sub/A.md', '/users/me/ws', {}, true)).toEqual({ switchWorkspace: false, workspace: '/users/me/ws', file: '/users/me/ws/Sub/A.md' })
    expect(decideOpenTarget('/Users/Me/WS/a.md', '/users/me/ws', {}, false).switchWorkspace).toBe(true)
  })
})
