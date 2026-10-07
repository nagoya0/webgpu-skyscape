import { describe, expect, it } from 'vitest'

import { currentGText } from './currentG'

describe('currentGText', () => {
  it('shows a tenth of a G with a G after it', () => {
    expect(currentGText(1)).toBe('1.0G')
    expect(currentGText(6.54)).toBe('6.5G')
    expect(currentGText(-0.42)).toBe('-0.4G')
  })

  it('clamps to ±9.9 and never shows -0.0', () => {
    expect(currentGText(12)).toBe('9.9G')
    expect(currentGText(-15)).toBe('-9.9G')
    expect(currentGText(-0.02)).toBe('0.0G')
  })
})
