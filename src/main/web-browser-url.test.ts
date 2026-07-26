import { describe, expect, test } from 'bun:test'
import { chromeLikeUserAgent, isBlockedUrl, isHttpUrl } from './web-browser-url'

describe('isHttpUrl', () => {
  test('allows http and https', () => {
    expect(isHttpUrl('https://example.com')).toBe(true)
    expect(isHttpUrl('http://example.com/path')).toBe(true)
  })

  test('rejects non-http schemes and garbage', () => {
    expect(isHttpUrl('file:///tmp/x')).toBe(false)
    expect(isHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isHttpUrl('data:text/html,hi')).toBe(false)
    expect(isHttpUrl('about:blank')).toBe(false)
    expect(isHttpUrl('not a url')).toBe(false)
  })
})

describe('isBlockedUrl', () => {
  test('allows http(s) and about:', () => {
    expect(isBlockedUrl('https://example.com')).toBe(false)
    expect(isBlockedUrl('http://example.com')).toBe(false)
    expect(isBlockedUrl('about:blank')).toBe(false)
  })

  test('blocks privileged schemes', () => {
    expect(isBlockedUrl('file:///etc/passwd')).toBe(true)
    expect(isBlockedUrl('javascript:void(0)')).toBe(true)
    expect(isBlockedUrl('data:text/html,x')).toBe(true)
    expect(isBlockedUrl('not a url')).toBe(true)
  })
})

describe('chromeLikeUserAgent', () => {
  test('strips Electron token and keeps Chrome version', () => {
    const raw =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.7339.207 Electron/43.1.1 Safari/537.36'
    expect(chromeLikeUserAgent(raw)).toBe(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.7339.207 Safari/537.36'
    )
  })

  test('no-op when Electron token absent', () => {
    const raw =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
    expect(chromeLikeUserAgent(raw)).toBe(raw)
  })
})
