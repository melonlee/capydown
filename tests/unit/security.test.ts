import { describe, expect, it } from 'vitest'
import { isSafeExternalUrl } from '../../src/main/security'

describe('isSafeExternalUrl', () => {
  it('allows http, https and mailto', () => {
    expect(isSafeExternalUrl('https://mp.weixin.qq.com/')).toBe(true)
    expect(isSafeExternalUrl('http://example.com/a?b=c')).toBe(true)
    expect(isSafeExternalUrl('mailto:someone@example.com')).toBe(true)
  })

  it('rejects local and scriptable protocols', () => {
    expect(isSafeExternalUrl('file:///Applications/Calculator.app')).toBe(false)
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeExternalUrl('smb://evil.example.com/share')).toBe(false)
    expect(isSafeExternalUrl('vscode://file/etc/passwd')).toBe(false)
    expect(isSafeExternalUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
  })

  it('rejects garbage input', () => {
    expect(isSafeExternalUrl('')).toBe(false)
    expect(isSafeExternalUrl('not a url')).toBe(false)
    expect(isSafeExternalUrl(undefined)).toBe(false)
    expect(isSafeExternalUrl(42)).toBe(false)
    expect(isSafeExternalUrl(`https://a.com/${'x'.repeat(5000)}`)).toBe(false)
  })
})
