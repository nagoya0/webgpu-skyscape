import { describe, expect, it } from 'vitest'

import { createInCloud, inCloudFactor } from './inCloud'

describe('inCloudFactor', () => {
  it('is 0 in clear air and approaches 1 in thick cloud', () => {
    expect(inCloudFactor(0)).toBe(0)
    expect(inCloudFactor(0.01)).toBeCloseTo(1 - Math.exp(-1))
    expect(inCloudFactor(0.05)).toBeGreaterThan(0.99)
  })
})

describe('createInCloud', () => {
  it('jumps when dt is 0 and follows smoothly otherwise', () => {
    const inCloud = createInCloud()
    expect(inCloud.update(0.05, 0)).toBeGreaterThan(0.99)
    const after = inCloud.update(0, 0.2)
    expect(after).toBeGreaterThan(0.3)
    expect(after).toBeLessThan(0.4)
  })
})
