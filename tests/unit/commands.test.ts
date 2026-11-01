import { describe, expect, it } from 'vitest'
import { acceleratorFor, APP_COMMANDS, parseAccelerator } from '../../src/shared/commands'

// 归一化成该平台上实际按下的组合键，用于检测冲突
function effectiveKey(accelerator: string, isMac: boolean): string {
  const s = parseAccelerator(accelerator)
  const meta = isMac && s.mod
  const ctrl = isMac ? s.ctrl : s.mod || s.ctrl
  return [meta && 'meta', ctrl && 'ctrl', s.alt && 'alt', s.shift && 'shift', s.code].filter(Boolean).join('+')
}

describe.each([['macOS', true], ['Windows / Linux', false]] as const)('shortcuts on %s', (_name, isMac) => {
  it('has no two commands sharing the same key combination', () => {
    const seen = new Map<string, string>()
    for (const c of APP_COMMANDS) {
      const acc = acceleratorFor(c, isMac)
      if (!acc)
        continue
      const key = effectiveKey(acc, isMac)
      expect(seen.get(key), `${c.id} conflicts with ${seen.get(key)} on ${key}`).toBeUndefined()
      seen.set(key, c.id)
    }
  })
})

it('keeps the mac accelerator and swaps in the Windows/Linux one', () => {
  const outline = APP_COMMANDS.find(c => c.id === 'view.outline')!
  expect(acceleratorFor(outline, true)).toBe('Ctrl+CmdOrCtrl+1')
  expect(acceleratorFor(outline, false)).toBe('Shift+CmdOrCtrl+1')
})
