import { describe, expect, it } from 'vitest'

import { compactCount } from './DebugWindow'

describe('compactCount', () => {
  it('shows counts in K or M', () => {
    expect(compactCount(850)).toBe('850')
    expect(compactCount(140_590)).toBe('140.6K')
    expect(compactCount(1_254_000)).toBe('1.25M')
  })
})
